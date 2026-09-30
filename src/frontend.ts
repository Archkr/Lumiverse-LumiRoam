import type { SpindleFloatWidgetHandle, SpindleFrontendContext } from 'lumiverse-spindle-types';
import { createApp } from './app';
import { normalizeSave, normalizeScene, normalizeSettings, type SceneSnapshot, type WorldSettings } from './persistence';
import type { SaveState } from './types';

const LANTERN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4V3a3 3 0 0 1 6 0v1M7 7h10l2 13H5L7 7Zm-1-3h12v3H6V4Zm3 16h6v2H9v-2Z"/><path d="M12 10v7M9 14h6"/></svg>';

const LAUNCH_CSS = `
.lv-launch{box-sizing:border-box;padding:26px 22px;color:#e9e9d5;font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;line-height:1.6}
.lv-launch *{box-sizing:border-box}.lv-launch .lv-eyebrow{font:10px ui-monospace,monospace;letter-spacing:3px;text-transform:uppercase;color:#aac6a6;margin:0 0 12px}
.lv-launch .lv-art{position:relative;border:1px solid #455749;border-radius:14px;background:#182b32;overflow:hidden;margin:14px 0 23px;box-shadow:0 16px 32px #0003}
.lv-launch .lv-art svg{display:block;width:100%;height:auto;image-rendering:pixelated}.lv-launch .lv-art span{position:absolute;bottom:14px;left:18px;color:#e7e7bf;font:10px ui-monospace,monospace;letter-spacing:3px}
.lv-launch h1{font:36px/1.06 Georgia,serif;letter-spacing:-1px;margin:0 0 14px;color:#f1ecd2}.lv-launch h1 em{font-style:normal;color:#d1b885}.lv-launch .lv-lead{font-size:14px;color:#a8b9b4;margin:0 0 22px;max-width:37ch}
.lv-launch .lv-enter{display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer;min-height:54px;border:1px solid #dec695;border-radius:8px;padding:13px 17px;background:#e9d4a3;color:#263932;font:600 14px system-ui;box-shadow:0 4px 0 #766c493b;transition:background .16s,transform .16s}.lv-launch .lv-enter:hover{background:#f9e6b7;transform:translateY(-1px)}.lv-launch .lv-enter:focus-visible{outline:2px solid #f4e5b9;outline-offset:4px}.lv-launch .lv-enter span:last-child{font-size:22px;line-height:1}
.lv-launch .lv-progress{display:flex;justify-content:space-between;gap:12px;font:11px ui-monospace,monospace;color:#b7cdb8;margin:18px 0 23px;padding-bottom:20px;border-bottom:1px solid #819c782a}.lv-launch .lv-progress span:last-child{color:#d4bc88}
.lv-launch .lv-story{display:flex;gap:11px;align-items:flex-start;padding:16px 15px;border:1px solid #60736050;border-radius:10px;background:#7f977c0b;cursor:pointer}.lv-launch .lv-story input{accent-color:#c6b184;width:16px;height:16px;margin:4px 0 0;flex:none}.lv-launch .lv-story strong{display:block;font-size:13px;font-weight:600;color:#d8dfc7}.lv-launch .lv-story small{display:block;font-size:11px;line-height:1.6;color:#95aaa0;margin-top:3px}.lv-launch .lv-status{min-height:36px;margin:13px 0;color:#a4b8aa;font-size:11px;line-height:1.5}.lv-launch .lv-status[data-error=true]{color:#f0ad90}.lv-launch .lv-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;font:10px ui-monospace,monospace;color:#92a79c;margin-top:14px}.lv-launch .lv-controls b{color:#c9d3ba;font-weight:400}.lv-launch .lv-foot{margin-top:25px;color:#667f74;font:10px ui-monospace,monospace;letter-spacing:1px;text-align:center}
.lv-connection-notice{position:absolute;bottom:94px;left:50%;transform:translateX(-50%);z-index:200;max-width:min(90%,540px);background:#2d2524eF;color:#f4cdb0;border:1px solid #b37d68;padding:13px 18px;border-radius:8px;font:12px/1.5 system-ui;box-shadow:0 8px 22px #0006;pointer-events:none}
`;

const ISLE_ART = `<svg viewBox="0 0 320 164" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" shape-rendering="crispEdges">
<rect width="320" height="164" fill="#20353f"/><rect width="320" height="77" fill="#223440"/><rect x="246" y="22" width="24" height="24" fill="#e6d5a3"/><rect x="242" y="26" width="32" height="16" fill="#e6d5a3"/><rect x="19" y="22" width="2" height="2" fill="#aec3be"/><rect x="116" y="16" width="2" height="2" fill="#aec3be"/><rect x="174" y="31" width="2" height="2" fill="#aec3be"/>
<path d="M0 85h30V69h17V56h17v13h25v15h38V68h22v-9h26v9h31v-14h19v15h44v11h51v84H0Z" fill="#2b514b"/><path d="M0 114h36v-8h29v-9h35v7h73v-7h43v9h43v9h61v49H0Z" fill="#213e3d"/>
<path d="M61 93h9V61h-8V49h-10v12h-8v32h9v15h8Z" fill="#152e31"/><path d="M10 101h8V67h-7V56H1v45h1v14h8Z" fill="#152e31"/><path d="M285 104h9V64h-8V49h-9v15h-8v40h9v14h7Z" fill="#152e31"/>
<rect x="112" y="76" width="33" height="29" fill="#84765b"/><path d="M105 76h48v-7h-7v-8h-33v8h-8Z" fill="#9d795b"/><rect x="125" y="91" width="7" height="14" fill="#263c35"/><rect x="115" y="83" width="6" height="6" fill="#f1c883"/><rect x="136" y="83" width="6" height="6" fill="#f1c883"/>
<path d="M213 106h24l-4-48h-16Z" fill="#b5bca4"/><rect x="214" y="50" width="22" height="10" fill="#efcc84"/><rect x="211" y="46" width="28" height="4" fill="#283a3b"/><rect x="216" y="40" width="18" height="6" fill="#435650"/><path d="M214 51 149 25v52Z" fill="#e9d091" opacity=".10"/><path d="M236 51 320 28v47Z" fill="#e9d091" opacity=".10"/>
<path d="M169 105h43v8h-32v6h-28v7h-39v-6h30v-8h26Z" fill="#b9a47a"/><rect x="97" y="111" width="2" height="17" fill="#685c45"/><rect x="94" y="108" width="8" height="8" fill="#e1b874"/><rect x="95" y="109" width="6" height="6" fill="#ffdf9b"/>
<path d="M0 145h320v19H0Z" fill="#182e34"/><rect x="44" y="139" width="22" height="2" fill="#4c7068"/><rect x="241" y="128" width="31" height="2" fill="#4c7068"/><rect x="264" y="145" width="20" height="2" fill="#4c7068"/><rect x="183" y="136" width="12" height="2" fill="#4c7068"/>
<rect x="151" y="85" width="3" height="3" fill="#c5eace"/><rect x="164" y="96" width="2" height="2" fill="#c5eace"/><rect x="88" y="79" width="2" height="2" fill="#c5eace"/>
</svg>`;

export function setup(ctx: SpindleFrontendContext): () => Promise<void> {
  let disposed = false;
  let tearingDown = false;
  let sequence = 0;
  let settings: WorldSettings = { storyContext: false };
  let storyPermission = false;
  let widget: SpindleFloatWidgetHandle | null = null;
  let app: ReturnType<typeof createApp> | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  const drawer = ctx.ui.registerDrawerTab({
    id: 'lantern-isles', title: 'LumiRoam · The Lantern Isles', shortName: 'LumiRoam', headerTitle: 'The Lantern Isles',
    description: 'Step into a living pixel world.', keywords: ['world', 'pixel', 'explore', 'lantern', 'game'], iconSvg: LANTERN_ICON,
    guide: { title: 'A small guide to the Isles', markdown: 'Explore with **WASD**, **arrow keys**, or a click/tap. Press **E** or **Space** near villagers and objects. Find six lantern wisps and bring them to the lighthouse.\n\n**M** opens the map, **J** opens your journal. Weather, daylight, and sound are adjustable in the world. Your journey saves automatically to your Lumiverse account.\n\n**Share scene atmosphere** is optional and starts off. When enabled, the current place appears in the next generation’s **Prompt Breakdown** as “LumiRoam scene.”' },
  });
  drawer.root.innerHTML = `<style>${LAUNCH_CSS}</style><section class="lv-launch">
    <p class="lv-eyebrow">A little world between stories</p>
    <div class="lv-art">${ISLE_ART}<span>72819 · THE LANTERN ISLES</span></div>
    <h1>Somewhere,<br><em>a light is waiting.</em></h1>
    <p class="lv-lead">Wander lantern-lit lanes. Follow the fireflies. Find what the islands have forgotten.</p>
    <button class="lv-enter" type="button"><span>Enter the Lantern Isles</span><span aria-hidden="true">↗</span></button>
    <div class="lv-progress"><span class="lv-place">Hearthwick Village</span><span class="lv-wisps">0 / 6 wisps</span></div>
    <label class="lv-story"><input type="checkbox" disabled><span><strong>Share scene atmosphere</strong><small>Your current place, weather, and discoveries become optional context for your next chat generation.</small></span></label>
    <p class="lv-status" role="status" aria-live="polite">Connecting to your world…</p>
    <div class="lv-controls"><span><b>WASD / ↑↓←→</b> · wander</span><span><b>CLICK / TAP</b> · walk</span><span><b>E / SPACE</b> · interact</span><span><b>M / J</b> · map & journal</span></div>
    <p class="lv-foot">TAKE YOUR TIME. THE ISLANDS WILL WAIT.</p>
  </section>`;
  const enter = drawer.root.querySelector<HTMLButtonElement>('.lv-enter')!;
  const checkbox = drawer.root.querySelector<HTMLInputElement>('input')!;
  const status = drawer.root.querySelector<HTMLElement>('.lv-status')!;
  const place = drawer.root.querySelector<HTMLElement>('.lv-place')!;
  const wisps = drawer.root.querySelector<HTMLElement>('.lv-wisps')!;

  function report(message: string, error = false): void {
    if (disposed) return;
    status.textContent = message; status.dataset.error = String(error);
    if (error && widget) {
      widget.root.querySelector('.lv-connection-notice')?.remove();
      const notice = document.createElement('div'); notice.className = 'lv-connection-notice'; notice.setAttribute('role', 'alert'); notice.textContent = message;
      widget.root.append(notice);
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => notice.remove(), 6500);
    }
  }

  function request(action: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (disposed) return Promise.reject(new Error('LumiRoam is closed.'));
    const requestId = `lv_${Date.now().toString(36)}_${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('LumiRoam could not reach its backend. Reopen the extension and try again.')); }, 10_000);
      pending.set(requestId, { resolve, reject, timer });
      try { ctx.sendToBackend({ type: 'lumiroam:request', requestId, action, ...data }); }
      catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error instanceof Error ? error : new Error('Could not connect to LumiRoam.')); }
    });
  }

  const unsubscribe = ctx.onBackendMessage((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const message = raw as Record<string, unknown>;
    if (message.type !== 'lumiroam:response' || typeof message.requestId !== 'string') return;
    const awaiting = pending.get(message.requestId); if (!awaiting) return;
    clearTimeout(awaiting.timer); pending.delete(message.requestId);
    if (message.ok === true) awaiting.resolve(message);
    else awaiting.reject(new Error(typeof message.error === 'string' ? message.error : 'LumiRoam could not complete this request.'));
  });

  async function load(): Promise<SaveState | null> {
    try {
      const response = await request('load');
      const state = response.state === null ? null : normalizeSave(response.state);
      if (state) { wisps.textContent = `${state.collected.length} / 6 wisps`; drawer.setBadge(state.lighthouseLit ? '✦' : null); }
      report('Your journey saves automatically to your Lumiverse account.');
      return state;
    } catch (error) { report(error instanceof Error ? error.message : 'Could not load your world.', true); throw error; }
  }

  async function save(state: SaveState): Promise<void> {
    try { await request('save', { state }); report('Progress saved. The islands will remember.'); }
    catch (error) { report(error instanceof Error ? error.message : 'Could not save your world.', true); throw error; }
  }

  function sync(scene: SceneSnapshot): void {
    place.textContent = scene.location; wisps.textContent = `${scene.collected} / 6 wisps`;
    drawer.setBadge(scene.lighthouseLit ? '✦' : null);
    void request('scene_sync', { scene }).catch((error) => report(error.message, true));
  }

  function closeWorld(): void {
    if (!app) return;
    const currentApp = app; app = null; currentApp.destroy();
    widget?.destroy(); widget = null;
    enter.querySelector('span')!.textContent = 'Return to the Lantern Isles';
    drawer.activate();
  }

  function openWorld(): void {
    if (disposed || tearingDown) return;
    if (widget) { widget.setVisible(true); return; }
    try {
      widget = ctx.ui.createFloatWidget({ fullscreen: true, chromeless: true, tooltip: 'LumiRoam · The Lantern Isles' });
      widget.root.style.cssText += ';position:relative;width:100%;height:100%;overflow:hidden;';
      app = createApp(widget.root, { load, save, onClose: closeWorld, onScene: (scene) => { const normalized = normalizeScene(scene); if (normalized) sync(normalized); } });
    } catch (error) { widget?.destroy(); widget = null; app = null; report(error instanceof Error ? error.message : 'The world could not open.', true); }
  }

  async function changeStoryContext(): Promise<void> {
    const enabled = checkbox.checked; checkbox.disabled = true;
    try {
      if (enabled && !storyPermission) {
        storyPermission = (await ctx.permissions.request(['interceptor'], { reason: 'Use your current Lantern Isles scene as optional chat atmosphere.' })).includes('interceptor');
      }
      const response = await request('set_settings', { settings: { storyContext: enabled } });
      settings = normalizeSettings(response.settings); checkbox.checked = settings.storyContext;
      report(enabled ? 'Scene sharing is on. Find “LumiRoam scene” in the next Prompt Breakdown.' : 'Scene sharing is off.');
    } catch (error) { checkbox.checked = settings.storyContext; report(error instanceof Error ? error.message : 'Could not save scene sharing.', true); }
    finally { if (!disposed) checkbox.disabled = false; }
  }

  enter.addEventListener('click', openWorld);
  checkbox.addEventListener('change', changeStoryContext);
  const quickAction = ctx.ui.registerInputBarAction({ id: 'enter-lantern-isles', label: 'Lantern Isles', subtitle: 'Wander into LumiRoam', iconSvg: LANTERN_ICON });
  const unsubscribeAction = quickAction.onClick(openWorld);
  ctx.ready();
  void request('get_settings').then((response) => {
    if (disposed) return;
    settings = normalizeSettings(response.settings); storyPermission = response.storyPermission === true;
    checkbox.checked = settings.storyContext; checkbox.disabled = false;
    report(settings.storyContext ? 'Scene sharing is on. Your journey saves automatically.' : 'Your journey saves automatically. Scene sharing is off.');
  }).catch((error) => report(error.message, true));

  return async () => {
    if (disposed || tearingDown) return;
    tearingDown = true;
    enter.disabled = true; checkbox.disabled = true;
    // The app serializes saves in microtasks. Await its final snapshot before
    // closing this request transport or removing the session's reply listener.
    await app?.flushSave();
    app?.destroy(); app = null; widget?.destroy(); widget = null;
    disposed = true;
    if (noticeTimer) clearTimeout(noticeTimer);
    unsubscribe(); unsubscribeAction(); quickAction.destroy(); drawer.destroy();
    enter.removeEventListener('click', openWorld); checkbox.removeEventListener('change', changeStoryContext);
    for (const awaiting of pending.values()) { clearTimeout(awaiting.timer); awaiting.reject(new Error('LumiRoam closed.')); }
    pending.clear();
  };
}
