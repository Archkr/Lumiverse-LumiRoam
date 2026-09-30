import { describe, expect, test } from 'bun:test';
import type { InterceptorContextDTO, InterceptorHandler, LlmMessageDTO, PermissionChangedDetail } from 'lumiverse-spindle-types';
import { createDefaultSave, DEFAULT_SPAWN, LANDMARK_IDS, normalizeSave, normalizeScene, normalizeSettings, scenePrompt, WISP_IDS, WORLD_BOUNDS } from './persistence';

describe('world save recovery', () => {
  test('handles malformed top-level data without sharing default arrays', () => {
    for (const value of [null, undefined, [], 'bad', 123]) {
      const save = normalizeSave(value);
      expect(save).toEqual(createDefaultSave());
      save.collected.push('wisp-hearth');
      expect(createDefaultSave().collected).toEqual([]);
    }
  });

  test('bounds positions and finite seeds; never admits NaN into animation', () => {
    const save = normalizeSave({ seed: Infinity, player: { x: -100, y: 1e20 } });
    expect(save.seed).toBe(createDefaultSave().seed);
    expect(save.player).toEqual({ x: 0, y: WORLD_BOUNDS.y });
    expect(normalizeSave({ player: { x: NaN, y: '10' }, seed: 4.9 }).player).toEqual(DEFAULT_SPAWN);
    expect(normalizeSave({ seed: 4.9 }).seed).toBe(4);
  });

  test('rejects invented quest progress and duplicate IDs', () => {
    const save = normalizeSave({ collected: ['wisp-hearth', 'wisp-hearth', 'hacked', 1], discovered: [...LANDMARK_IDS, 'elsewhere'], lighthouseLit: true });
    expect(save.collected).toEqual(['wisp-hearth']);
    expect(save.discovered).toEqual([...LANDMARK_IDS]);
    expect(save.lighthouseLit).toBe(false);
    expect(normalizeSave({ collected: [...WISP_IDS], lighthouseLit: true }).lighthouseLit).toBe(true);
  });

  test('recovers enums and truncates unbounded journals', () => {
    const journal = Array.from({ length: 1000 }, (_, index) => ({ title: `Note ${index}`, text: 'a'.repeat(9000), time: -1 }));
    const save = normalizeSave({ weather: 'storm', timeOfDay: 'tomorrow', sound: 'yes', journal });
    expect(save.weather).toBe('clear');
    expect(save.timeOfDay).toBe('dusk');
    expect(save.sound).toBe(false);
    expect(save.journal.length).toBe(80);
    expect(save.journal[0]?.title).toBe('Note 920');
    expect(save.journal[0]?.text.length).toBe(1200);
    expect(save.journal[0]?.time).toBe(0);
  });

  test('a valid save round trips without losing the world', () => {
    const save = createDefaultSave(98765, { x: 480.5, y: 640 });
    save.collected = [...WISP_IDS]; save.discovered = [...LANDMARK_IDS]; save.lighthouseLit = true;
    save.weather = 'mist'; save.timeOfDay = 'night'; save.sound = true;
    save.journal = [{ title: 'The beacon', text: 'The islands remember.', time: 123456 }];
    expect(normalizeSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });
});

describe('optional scene context', () => {
  test('requires explicit boolean opt-in and a real bounded scene', () => {
    expect(normalizeSettings({ storyContext: 'true' }).storyContext).toBe(false);
    expect(normalizeSettings({ storyContext: true }).storyContext).toBe(true);
    expect(normalizeScene({ location: 'Hearthwick' })).toBeNull();
    const scene = normalizeScene({ location: 'Hearthwick', description: 'A warm village.', weather: 'storm', timeOfDay: 'midnight', collected: 200 });
    expect(scene?.collected).toBe(6);
    expect(scene?.weather).toBe('clear');
    expect(scene && scenePrompt(scene)).toContain('[LumiRoam scene');
  });
});

test('backend isolates users and views, serializes saves, and injects only opted-in scene context', async () => {
  const files = new Map<string, unknown>();
  const waiting = new Map<string, (result: { payload: Record<string, unknown>; userId?: string; options?: { frontendSessionId?: string } }) => void>();
  let receive: (raw: unknown, userId: string, sessionId?: string) => void = () => {};
  let intercept: InterceptorHandler | null = null;
  let permissionChanged: (detail: PermissionChangedDetail) => void = () => {};
  let permitted = true;
  let failReads = false;
  let disposed = 0;
  let requests = 0;
  const key = (path: string, userId?: string) => JSON.stringify([userId, path]);
  const previousSpindle = (globalThis as Record<string, unknown>).spindle;
  (globalThis as Record<string, unknown>).spindle = {
    userStorage: {
      async getJson(path: string, options: { fallback?: unknown; userId?: string } = {}) {
        if (failReads) throw new Error('Storage unavailable');
        return files.has(key(path, options.userId)) ? structuredClone(files.get(key(path, options.userId))) : options.fallback;
      },
      async setJson(path: string, value: unknown, options: { userId?: string } = {}) {
        if (path === 'world.json' && (value as { player?: { x?: number } }).player?.x === 100) await new Promise((resolve) => setTimeout(resolve, 20));
        files.set(key(path, options.userId), structuredClone(value));
      },
    },
    permissions: { has: () => permitted, onChanged: (handler: typeof permissionChanged) => { permissionChanged = handler; return () => {}; } },
    onFrontendMessage(handler: typeof receive) { receive = handler; return () => {}; },
    sendToFrontend(payload: Record<string, unknown>, userId?: string, options?: { frontendSessionId?: string }) {
      const requestId = String(payload.requestId); waiting.get(requestId)?.({ payload, userId, options }); waiting.delete(requestId);
    },
    registerInterceptor(handler: InterceptorHandler) { intercept = handler; return () => { disposed++; intercept = null; }; },
    log: { info() {}, warn() {} },
  };

  async function rpc(action: string, userId: string, sessionId: string, data: Record<string, unknown> = {}) {
    const requestId = `test_${++requests}`;
    const result = new Promise<{ payload: Record<string, unknown>; userId?: string; options?: { frontendSessionId?: string } }>((resolve) => waiting.set(requestId, resolve));
    receive({ type: 'lumiroam:request', requestId, action, ...data }, userId, sessionId);
    return result;
  }
  const messages: LlmMessageDTO[] = [{ role: 'system', content: 'Existing story' }, { role: 'user', content: 'Continue.' }];
  async function prompt(userId: string, frontendSessionId: string, generationType = 'normal') {
    const handler = intercept as InterceptorHandler | null;
    if (!handler) throw new Error('Expected scene interceptor');
    return handler(messages, { userId, frontendSessionId, generationType, signal: new AbortController().signal } as unknown as InterceptorContextDTO);
  }

  try {
    await import('./backend');
    const empty = await rpc('load', 'alice', 'alice-desktop');
    expect(empty.payload.state).toBeNull();
    expect(empty.userId).toBe('alice');
    expect(empty.options?.frontendSessionId).toBe('alice-desktop');

    const first = createDefaultSave(); first.player.x = 100;
    const second = createDefaultSave(); second.player.x = 200;
    const bob = createDefaultSave(); bob.player.x = 300;
    await Promise.all([
      rpc('save', 'alice', 'alice-desktop', { state: first }),
      rpc('save', 'alice', 'alice-desktop', { state: second }),
      rpc('save', 'bob', 'bob-desktop', { state: bob }),
    ]);
    expect((await rpc('load', 'alice', 'alice-phone')).payload.state).toEqual(second);
    expect((await rpc('load', 'bob', 'bob-desktop')).payload.state).toEqual(bob);

    const scene = { location: 'Hearthwick', description: 'Warm lanterns along a village lane.', weather: 'clear', timeOfDay: 'dusk', lighthouseLit: false, collected: 1 };
    await rpc('scene_sync', 'alice', 'alice-desktop', { scene });
    await rpc('scene_sync', 'alice', 'alice-phone', { scene: { ...scene, location: 'Willowmere' } });
    await rpc('scene_sync', 'bob', 'bob-desktop', { scene: { ...scene, location: 'Starfall' } });
    expect(await prompt('alice', 'alice-desktop')).toBe(messages);
    await rpc('set_settings', 'alice', 'alice-desktop', { settings: { storyContext: true } });
    const injected = await prompt('alice', 'alice-desktop');
    expect(Array.isArray(injected)).toBe(false);
    if (Array.isArray(injected)) throw new Error('Expected prompt breakdown metadata');
    expect(injected.messages[1]?.content).toContain('Location: Hearthwick.');
    expect(injected.messages[2]).toEqual(messages[1]);
    expect(injected.breakdown).toEqual([{ messageIndex: 1, name: 'LumiRoam scene · The Lantern Isles' }]);
    expect(await prompt('alice', 'alice-desktop', 'quiet')).toBe(messages);
    const phone = await prompt('alice', 'alice-phone');
    expect(!Array.isArray(phone) && phone.messages[1]?.content).toContain('Location: Willowmere.');
    expect(await prompt('alice', 'unseen-document')).toBe(messages);
    expect(await prompt('bob', 'bob-desktop')).toBe(messages);
    await rpc('set_settings', 'bob', 'bob-desktop', { settings: { storyContext: true } });
    const bobPrompt = await prompt('bob', 'bob-desktop');
    expect(!Array.isArray(bobPrompt) && bobPrompt.messages[1]?.content).toContain('Location: Starfall.');
    await rpc('set_settings', 'alice', 'alice-desktop', { settings: { storyContext: false } });
    expect(await prompt('alice', 'alice-desktop')).toBe(messages);

    const invalid = await rpc('save', 'alice', 'alice-desktop', { state: [] });
    expect(invalid.payload.ok).toBe(false);
    failReads = true;
    const failed = await rpc('load', 'alice', 'alice-phone');
    expect(failed.payload.ok).toBe(false);
    expect(failed.payload.error).toBe('Storage unavailable');
    expect(failed.options?.frontendSessionId).toBe('alice-phone');
    failReads = false;
    permitted = false;
    permissionChanged({ extensionId: 'lumi_roam', permission: 'interceptor', granted: false, allGranted: [] });
    expect(disposed).toBe(1);
    expect(intercept).toBeNull();
    const denied = await rpc('set_settings', 'alice', 'alice-desktop', { settings: { storyContext: true } });
    expect(denied.payload.ok).toBe(false);
    expect(denied.payload.error).toContain('interceptor permission');
  } finally {
    if (previousSpindle === undefined) delete (globalThis as Record<string, unknown>).spindle;
    else (globalThis as Record<string, unknown>).spindle = previousSpindle;
  }
});
