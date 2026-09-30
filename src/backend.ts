import type { InterceptorDisposer, SpindleAPI } from 'lumiverse-spindle-types';
import { normalizeSave, normalizeScene, normalizeSettings, scenePrompt, type SceneSnapshot } from './persistence';

// The published type declarations lack the document-routing overload.
// Lumiverse 1.2.4 implements this exact contract.
type SessionSpindleAPI = Omit<SpindleAPI, 'sendToFrontend' | 'onFrontendMessage'> & {
  sendToFrontend(payload: unknown, userId?: string, options?: { frontendSessionId?: string }): void;
  onFrontendMessage(handler: (payload: unknown, userId: string, frontendSessionId?: string) => void): () => void;
};
declare const spindle: SessionSpindleAPI;

const SAVE_PATH = 'world.json';
const SETTINGS_PATH = 'settings.json';
const SCENE_PATH = 'scene.json';
const sessionScenes = new Map<string, SceneSnapshot>();
const userWrites = new Map<string, Promise<unknown>>();
let disposeInterceptor: InterceptorDisposer | null = null;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected storage error occurred.';
}

function sessionKey(userId: string, sessionId?: string): string {
  return JSON.stringify([userId, sessionId ?? 'legacy']);
}

/** Serializing every user's requests prevents a slow previous save from replacing newer progress. */
async function sequential<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = userWrites.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  userWrites.set(userId, next);
  try { return await next; }
  finally { if (userWrites.get(userId) === next) userWrites.delete(userId); }
}

async function receive(raw: unknown, userId: string, frontendSessionId?: string): Promise<void> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !userId) return;
  const message = raw as Record<string, unknown>;
  if (message.type !== 'lumiroam:request' || typeof message.requestId !== 'string'
    || !/^[a-zA-Z0-9_-]{1,96}$/.test(message.requestId)) return;
  const reply = (payload: Record<string, unknown>) => spindle.sendToFrontend(
    { type: 'lumiroam:response', requestId: message.requestId, ...payload },
    userId,
    frontendSessionId ? { frontendSessionId } : undefined,
  );
  try {
    const result = await sequential(userId, async () => {
      switch (message.action) {
        case 'load': {
          const saved = await spindle.userStorage.getJson<unknown>(SAVE_PATH, { fallback: null, userId });
          return { state: saved === null ? null : normalizeSave(saved) };
        }
        case 'save': {
          if (!message.state || typeof message.state !== 'object' || Array.isArray(message.state)) throw new Error('The world save was invalid.');
          const state = normalizeSave(message.state);
          await spindle.userStorage.setJson(SAVE_PATH, state, { userId, indent: 2 });
          return { saved: true };
        }
        case 'get_settings': {
          const settings = normalizeSettings(await spindle.userStorage.getJson<unknown>(SETTINGS_PATH, { fallback: null, userId }));
          return { settings, storyPermission: spindle.permissions.has('interceptor') };
        }
        case 'set_settings': {
          const settings = normalizeSettings(message.settings);
          if (settings.storyContext && !spindle.permissions.has('interceptor')) {
            throw new Error('Allow LumiRoam’s interceptor permission in extension settings to share scene atmosphere.');
          }
          await spindle.userStorage.setJson(SETTINGS_PATH, settings, { userId, indent: 2 });
          return { settings, storyPermission: spindle.permissions.has('interceptor') };
        }
        case 'scene_sync': {
          const scene = normalizeScene(message.scene);
          if (!scene) throw new Error('The world scene was invalid.');
          const key = sessionKey(userId, frontendSessionId);
          if (sessionScenes.size >= 128 && !sessionScenes.has(key)) sessionScenes.delete(sessionScenes.keys().next().value!);
          sessionScenes.set(key, scene);
          await spindle.userStorage.setJson(SCENE_PATH, scene, { userId, indent: 2 });
          return { synced: true };
        }
        default: throw new Error('This LumiRoam request is not supported.');
      }
    });
    reply({ ok: true, ...result });
  } catch (error) {
    spindle.log.warn(`LumiRoam request failed: ${errorText(error)}`);
    reply({ ok: false, error: errorText(error) });
  }
}

spindle.onFrontendMessage((raw, userId, frontendSessionId) => {
  void receive(raw, userId, frontendSessionId).catch((error) => spindle.log.warn(`LumiRoam could not reply: ${errorText(error)}`));
});

function refreshInterceptor(): void {
  if (!spindle.permissions.has('interceptor')) {
    disposeInterceptor?.(); disposeInterceptor = null; return;
  }
  if (disposeInterceptor) return;
  try {
    disposeInterceptor = spindle.registerInterceptor(async (messages, context) => {
      // Never substitute the latest connected user for the authoritative generation owner.
      if (!context.userId || context.signal.aborted || context.generationType === 'quiet') return messages;
      try {
        const settings = normalizeSettings(await spindle.userStorage.getJson<unknown>(SETTINGS_PATH, { fallback: null, userId: context.userId }));
        if (!settings.storyContext || context.signal.aborted) return messages;
        const frontendSessionId = (context as typeof context & { readonly frontendSessionId?: string }).frontendSessionId;
        // A known document must never inherit the scene from another open view.
        // Older hosts without document identities restore the user's last scene.
        const scene = frontendSessionId
          ? sessionScenes.get(sessionKey(context.userId, frontendSessionId))
          : sessionScenes.get(sessionKey(context.userId))
            ?? normalizeScene(await spindle.userStorage.getJson<unknown>(SCENE_PATH, { fallback: null, userId: context.userId }));
        if (!scene || context.signal.aborted) return messages;
        // Keep the final user turn or assistant prefill at the end of the prompt.
        const index = Math.max(0, messages.length - 1);
        const next = [...messages];
        next.splice(index, 0, { role: 'system', content: scenePrompt(scene) });
        return { messages: next, breakdown: [{ messageIndex: index, name: 'LumiRoam scene · The Lantern Isles' }] };
      } catch (error) {
        spindle.log.warn(`LumiRoam scene context unavailable: ${errorText(error)}`);
        return messages;
      }
    }, { priority: 80 });
  } catch (error) {
    spindle.log.warn(`LumiRoam could not register scene context: ${errorText(error)}`);
  }
}

refreshInterceptor();
spindle.permissions.onChanged((detail) => { if (detail.permission === 'interceptor') refreshInterceptor(); });
spindle.log.info('LumiRoam · The Lantern Isles is ready.');
