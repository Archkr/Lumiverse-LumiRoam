import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { setup } from './frontend';
import { createDefaultSave, normalizeSave } from './persistence';

test('native frontend recovers failed loads, saves changes, handles scene consent, and returns to chat', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const globals = globalThis as Record<string, unknown>;
  const previous = new Map<string, unknown>();
  const replace = (name: string, value: unknown) => { previous.set(name, globals[name]); globals[name] = value; };
  for (const name of ['window', 'document', 'Element', 'HTMLElement', 'HTMLCanvasElement', 'HTMLButtonElement', 'AbortController']) replace(name, (dom.window as unknown as Record<string, unknown>)[name]);
  replace('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  replace('requestAnimationFrame', () => 1); replace('cancelAnimationFrame', () => {});
  dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof dom.window.matchMedia;
  const gradient = { addColorStop() {} };
  const context = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient, measureText: () => ({ width: 30 }) }, {
    get(target, property) { return property in target ? Reflect.get(target, property) : () => {}; },
    set(target, property, value) { Reflect.set(target, property, value); return true; },
  });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => context) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;

  const document = dom.window.document;
  const drawer = document.createElement('aside'); document.body.append(drawer);
  const requests: Record<string, unknown>[] = [];
  const listeners = new Set<(message: unknown) => void>();
  let quickClick: () => void = () => {};
  let failedLoad = true;
  let grantConsent = false;
  let storyContext = false;
  let consentRequests = 0;
  let readyCalls = 0;
  let activated = 0;
  let widgetDestroyed = 0;
  let saves = 0;
  let saved = createDefaultSave(); saved.collected = ['wisp-pine'];
  const widgets: HTMLElement[] = [];

  const ctx = {
    ui: {
      registerDrawerTab() { return { root: drawer, activate() { activated++; }, setBadge() {}, destroy() { drawer.remove(); } }; },
      createFloatWidget(options: { fullscreen?: boolean; chromeless?: boolean }) {
        expect(options.fullscreen).toBe(true); expect(options.chromeless).toBe(true);
        const root = document.createElement('main'); document.body.append(root); widgets.push(root);
        return { root, setVisible() {}, destroy() { root.remove(); widgetDestroyed++; } };
      },
      registerInputBarAction() { return { onClick(handler: () => void) { quickClick = handler; return () => { quickClick = () => {}; }; }, destroy() {} }; },
    },
    onBackendMessage(handler: (message: unknown) => void) { listeners.add(handler); return () => listeners.delete(handler); },
    sendToBackend(raw: unknown) {
      const message = raw as Record<string, unknown>; requests.push(message);
      let response: Record<string, unknown> = {};
      switch (message.action) {
        case 'get_settings': response = { settings: { storyContext }, storyPermission: false }; break;
        case 'load': response = failedLoad ? { ok: false, error: 'Test backend could not load this world.' } : { state: structuredClone(saved) }; break;
        case 'scene_sync': response = { synced: true }; break;
        case 'save': saved = normalizeSave(message.state); saves++; response = { saved: true }; break;
        case 'set_settings': {
          if (!grantConsent) { response = { ok: false, error: 'The interceptor permission was declined.' }; break; }
          storyContext = (message.settings as { storyContext: boolean }).storyContext;
          response = { settings: { storyContext }, storyPermission: true }; break;
        }
      }
      setTimeout(() => { for (const listener of listeners) listener({ type: 'lumiroam:response', requestId: message.requestId, ok: true, ...response }); }, 0);
    },
    permissions: { async request() { consentRequests++; return grantConsent ? ['interceptor'] : []; } },
    ready() { readyCalls++; },
  } as unknown as SpindleFrontendContext;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
  let cleanup: ReturnType<typeof setup> | null = null;
  try {
    cleanup = setup(ctx);
    await settle();
    expect(readyCalls).toBe(1);
    const checkbox = drawer.querySelector<HTMLInputElement>('input')!;
    expect(checkbox.disabled).toBe(false); expect(checkbox.checked).toBe(false);
    drawer.querySelector<HTMLButtonElement>('.lv-enter')!.click();
    await settle();
    expect(document.querySelector('.lv-loading')?.textContent).toContain('Your saved journey could not be loaded.');
    expect(saves).toBe(0);
    expect(requests.filter((item) => item.action === 'scene_sync').length).toBe(0);
    document.querySelector<HTMLButtonElement>('[data-action=return]')!.click();
    await settle();
    expect(document.querySelector('.lv-app')).toBeNull(); expect(saves).toBe(0); expect(activated).toBe(1);

    failedLoad = false;
    quickClick(); await settle();
    expect(document.querySelector<HTMLElement>('.lv-loading')?.hidden).toBe(true);
    expect(document.querySelector('.lv-quest-count')?.textContent).toBe('1 / 6');
    expect(requests.some((item) => item.action === 'scene_sync')).toBe(true);

    checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change')); await settle();
    expect(consentRequests).toBe(1); expect(checkbox.checked).toBe(false);
    expect(drawer.querySelector('.lv-status')?.textContent).toContain('permission was declined');
    grantConsent = true;
    checkbox.checked = true; checkbox.dispatchEvent(new dom.window.Event('change')); await settle();
    expect(checkbox.checked).toBe(true); expect(storyContext).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-action=menu]')!.click();
    const weather = document.querySelector<HTMLSelectElement>('#lv-weather-setting');
    expect(weather).not.toBeNull(); weather!.value = 'rain'; weather!.dispatchEvent(new dom.window.Event('change'));
    document.querySelector<HTMLButtonElement>('[data-action=return]')!.click(); await settle();
    expect(saved.weather).toBe('rain'); expect(saved.collected).toEqual(['wisp-pine']);
    expect(saves).toBeGreaterThan(0); expect(document.querySelector('.lv-app')).toBeNull();
    expect(widgetDestroyed).toBe(2);

    // A final dirty change must survive extension teardown, whose save is queued in a microtask.
    quickClick(); await settle();
    document.querySelector<HTMLButtonElement>('[data-action=menu]')!.click();
    const finalWeather = document.querySelector<HTMLSelectElement>('#lv-weather-setting')!;
    finalWeather.value = 'mist'; finalWeather.dispatchEvent(new dom.window.Event('change'));
    await cleanup(); cleanup = null; await settle();
    expect(saved.weather).toBe('mist');
    expect(listeners.size).toBe(0); expect(document.querySelector('.lv-app')).toBeNull(); expect(drawer.isConnected).toBe(false);
  } finally {
    await cleanup?.();
    dom.window.close();
    for (const [name, value] of previous) { if (value === undefined) delete globals[name]; else globals[name] = value; }
  }
});
