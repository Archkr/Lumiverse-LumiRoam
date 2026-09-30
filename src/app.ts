import type { JournalEntry, NPC, Renderer, RenderState, SaveState, TimeOfDay, Weather, World } from './types';
import { generateWorld, findPath, isWalkable, landmarkAt } from './world';
import { createRenderer } from './renderer';
import { createDefaultSave, normalizeSave } from './persistence';
import { createSoundscape } from './sound';
import { APP_CSS } from './styles';

export interface AppOptions {
  load?: () => Promise<SaveState | null>;
  save?: (state: SaveState) => Promise<void>;
  onClose?: () => void;
  onScene?: (scene: { location: string; description: string; weather: Weather; timeOfDay: TimeOfDay; lighthouseLit: boolean; collected: number }) => void;
}

const icons: Record<string, string> = {
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  book: '<path d="M4 3h13a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h15M8 7h7m-7 4h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15a8 8 0 0 1-11-11A8 8 0 1 0 20 15Z"/>',
  rain: '<path d="M6 14a4 4 0 1 1 0-8 6 6 0 0 1 11.6-1.7A5 5 0 0 1 18 14ZM7 17l-1 3m6-3-1 3m6-3-1 3"/>',
  mist: '<path d="M3 7h15M6 12h15M3 17h15"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  wisp: '<path d="m12 2 2 6 6 4-6 4-2 6-2-6-6-4 6-4 2-6Z"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="m10 6-6 6 6 6M4 12h16"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
};
const svg = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? icons.wisp}</svg>`;
const lantern = '<svg class="lv-brand-mark" viewBox="0 0 32 38" aria-hidden="true"><path fill="#cde2ad" d="M13 0h6v3h3v6h-3V4h-6v5h-3V3h3z"/><path fill="#efd797" d="M7 10h18v3H7zm3 5h12v16H10zm-3 18h18v3H7z"/><path fill="#314e36" d="M7 13h3v20H7zm15 0h3v20h-3z"/><path fill="#fff5cb" d="M14 16h4v12h-4z"/><path fill="#cea765" d="M11 31h10v2H11z"/></svg>';
const weatherNames: Record<Weather, string> = { clear: 'Clear skies', rain: 'Soft rain', mist: 'Morning mist' };
const timeNames: Record<TimeOfDay, string> = { day: '14:20', dusk: '18:40', night: '22:10' };
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x - b.x, a.y - b.y);

export function createApp(container: HTMLElement, options: AppOptions = {}) {
  const style = document.createElement('style');
  style.textContent = APP_CSS;
  const root = document.createElement('div');
  root.className = 'lv-app';
  root.tabIndex = 0;
  root.setAttribute('aria-label', 'LumiRoam, The Lantern Isles. Use WASD or arrow keys to explore. E to interact.');
  root.innerHTML = `
    <canvas class="lv-world" tabindex="0" aria-label="Playable pixel world. Click a path to walk there."></canvas>
    <div class="lv-vignette"></div>
    <header class="lv-topbar">
      <div class="lv-brand">${lantern}<div><div class="lv-brand-title">LumiRoam</div><div class="lv-brand-subtitle">The Lantern Isles</div></div></div>
      <div class="lv-top-actions">
        <div class="lv-atmosphere"><span class="lv-weather-icon">${svg('sun')}</span><span class="lv-weather-name">Clear skies</span><span class="lv-time">14:20</span></div>
        <button class="lv-icon" data-action="map" title="Island map (M)" aria-label="Open island map">${svg('map')}</button>
        <button class="lv-icon" data-action="journal" title="Field journal (J)" aria-label="Open field journal">${svg('book')}</button>
        <div class="lv-divider"></div>
        <button class="lv-icon" data-action="sound" title="Turn on sound" aria-label="Turn on sound" aria-pressed="false">${svg('mute')}</button>
        <button class="lv-icon" data-action="menu" title="World settings (Escape)" aria-label="Open world settings">${svg('menu')}</button>
        ${options.onClose ? `<button class="lv-icon" data-action="return" title="Return to Lumiverse" aria-label="Return to Lumiverse">${svg('back')}</button>` : ''}
      </div>
    </header>
    <div class="lv-location"><div class="lv-overline"><i class="lv-region-dot"></i><span class="lv-biome">A place to begin</span></div><div class="lv-location-title">Hearthwick Village</div><div class="lv-location-detail">Somewhere, a light is waiting for you.</div></div>
    <div class="lv-minimap-shell"><canvas class="lv-minimap" width="220" height="180" aria-label="Minimap. Open the island map to set a destination." tabindex="0"></canvas><div class="lv-minimap-label"><span>The isles</span><span class="lv-compass">N ↑</span></div></div>
    <aside class="lv-quest" aria-label="Lighthouse quest"><div class="lv-quest-heading"><span>A little adventure</span><small class="lv-quest-count">0 / 6</small></div><h2>The sleeping lighthouse</h2><p class="lv-quest-copy">Gather the six wandering lights.<br>Give the islands their stars again.</p><div class="lv-wisps" aria-label="Collected lights"></div><div class="lv-quest-foot"><span class="lv-discovery-count">0 of 5 places found</span><button class="lv-text-button" data-action="journal">Field notes ${svg('arrow')}</button></div></aside>
    <div class="lv-bottom"><button class="lv-hint" data-action="interact"><kbd>E</kbd><span class="lv-hint-text">Wander. The world will wait.</span></button><div class="lv-key-guide"><span><kbd>W A S D</kbd> move</span><span><kbd>Shift</kbd> wander faster</span><span><kbd>M</kbd> map</span><span>or click to walk</span></div></div>
    <div class="lv-dock"><div class="lv-zoom"><button data-action="zoom-out" aria-label="Zoom out">${svg('minus')}</button><span class="lv-zoom-value">3×</span><button data-action="zoom-in" aria-label="Zoom in">${svg('plus')}</button></div><span class="lv-save" role="status">Your journey saves itself</span></div>
    <div class="lv-touch" aria-label="Movement controls"><button data-key="arrowup" aria-label="Move north">${svg('up')}</button><button data-key="arrowleft" aria-label="Move west">${svg('left')}</button><button data-key="arrowright" aria-label="Move east">${svg('right')}</button><button data-key="arrowdown" aria-label="Move south">${svg('down')}</button></div>
    <div class="lv-toast is-hidden" role="status" aria-live="polite"></div>
    <div class="lv-panel-backdrop" hidden></div>
    <div class="lv-dialogue" hidden></div>
    <div class="lv-loading">Finding a quiet corner of the world…</div>
  `;
  container.append(style, root);
  const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = element<HTMLCanvasElement>('.lv-world');
  const minimap = element<HTMLCanvasElement>('.lv-minimap');
  const backdrop = element<HTMLDivElement>('.lv-panel-backdrop');
  const dialogue = element<HTMLDivElement>('.lv-dialogue');
  const sound = createSoundscape();
  const listeners = new AbortController();
  const keys = new Set<string>();
  let state = createDefaultSave();
  let world: World = generateWorld(state.seed);
  let renderer: Renderer | null = null;
  let collected = new Set<string>();
  let discovered = new Set<string>();
  let initialized = false;
  let disposed = false;
  let panel: 'map' | 'journal' | 'menu' | null = null;
  let dialogNpc: NPC | null = null;
  let dialogIndex = 0;
  let path: {x:number;y:number}[] = [];
  let frame = 0;
  let previousTime = 0;
  let elapsed = 0;
  let lastMap = -1;
  let currentLandmark = '__unset';
  let soundStarted = false;
  let sceneSignature = '';
  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> = Promise.resolve();
  let saveRevision = 0;
  let activePointer: number | null = null;
  let zoom = window.innerWidth < 600 ? 2.5 : 3;
  const renderState: RenderState = {
    player: {...state.player, direction: 0, moving: false, step: 0},
    camera: {...state.player}, time: 0, weather: state.weather, timeOfDay: state.timeOfDay,
    collected, lighthouseLit: false, zoom, target: null, npcPositions: new Map(),
  };
  function getState(): SaveState { return structuredClone({...state, player: {x:renderState.player.x,y:renderState.player.y}, collected:[...collected], discovered:[...discovered]}); }
  function toast(message: string, duration = 3400) {
    if (disposed) return;
    const node = element<HTMLDivElement>('.lv-toast');
    node.textContent = message;
    node.classList.remove('is-hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.add('is-hidden'), duration);
  }
  function flushSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (!initialized || !dirty) return saving;
    dirty = false;
    const snapshot = getState();
    const revision = ++saveRevision;
    if (options.save) {
      if (!disposed) element('.lv-save').textContent = 'Saving your journey…';
      saving = saving.catch(() => {}).then(() => options.save!(snapshot)).then(() => {
        if (!disposed && revision === saveRevision) element('.lv-save').textContent = 'Journey saved';
      }).catch(() => {
        dirty = true;
        if (!disposed) { element('.lv-save').textContent = 'Save failed · open settings to retry'; toast('Your journey could not be saved. You can retry in world settings.', 5000); }
      });
    }
    return saving;
  }
  function changed() {
    dirty = true;
    if (!saveTimer) saveTimer = setTimeout(flushSave, 1300);
  }
  function addJournal(title: string, text: string) {
    const entry: JournalEntry = {title,text,time:Date.now()};
    state.journal = [...state.journal, entry].slice(-80);
    changed();
  }
  function notifyScene() {
    const place = landmarkAt(world, renderState.player.x, renderState.player.y);
    const scene = {location:place?.name ?? 'The Lantern Isles',description:place?.description ?? 'A winding path between the island settlements.',weather:state.weather,timeOfDay:state.timeOfDay,lighthouseLit:state.lighthouseLit,collected:collected.size};
    const signature = JSON.stringify(scene);
    if (signature !== sceneSignature) { sceneSignature = signature; options.onScene?.(scene); }
  }
  function updateUI() {
    element('.lv-quest-count').textContent = `${collected.size} / ${world.wisps.length}`;
    element('.lv-wisps').innerHTML = world.wisps.map(w => `<span class="lv-wisp ${collected.has(w.id) ? 'is-collected' : ''}" title="${w.name}" aria-label="${w.name}: ${collected.has(w.id) ? 'found' : 'waiting'}">${svg('wisp')}</span>`).join('');
    element('.lv-discovery-count').textContent = `${discovered.size} of ${world.landmarks.length} places found`;
    element('.lv-quest h2').textContent = state.lighthouseLit ? 'The stars came home' : collected.size === world.wisps.length ? 'One last light' : 'The sleeping lighthouse';
    element('.lv-quest-copy').textContent = state.lighthouseLit ? 'The beacon shines again. Stay a while. There is always more sky.' : collected.size === world.wisps.length ? 'All six lights are with you. Find the lighthouse on the southeast shore.' : 'Gather the six wandering lights. Give the islands their stars again.';
    element('.lv-weather-name').textContent = weatherNames[state.weather];
    element('.lv-weather-icon').innerHTML = svg(state.weather === 'clear' ? state.timeOfDay === 'night' ? 'moon' : 'sun' : state.weather);
    element('.lv-time').textContent = timeNames[state.timeOfDay];
    const button = element<HTMLButtonElement>('[data-action=sound]');
    button.innerHTML = svg(state.sound ? 'sound' : 'mute');
    button.setAttribute('aria-pressed', String(state.sound));
    button.setAttribute('aria-label', state.sound ? 'Turn off sound' : 'Turn on sound');
    button.title = state.sound ? 'Turn off sound' : 'Turn on sound';
    element('.lv-zoom-value').textContent = `${zoom}×`;
    renderState.weather = state.weather;
    renderState.timeOfDay = state.timeOfDay;
    renderState.lighthouseLit = state.lighthouseLit;
    notifyScene();
  }
  function closePanel() {
    panel = null;
    backdrop.hidden = true;
    backdrop.replaceChildren();
    keys.clear();
    canvas.focus({preventScroll:true});
  }
  function buildPanel(title: string, eyebrow: string) {
    keys.clear(); path = []; renderState.target = null;
    backdrop.hidden = false;
    backdrop.innerHTML = `<section class="lv-panel" role="dialog" aria-modal="true" aria-label="${title}"><div class="lv-panel-header"><div><div class="lv-overline">${eyebrow}</div><h2>${title}</h2></div><button class="lv-icon" data-action="close-panel" aria-label="Close panel">${svg('close')}</button></div><div class="lv-panel-body"></div></section>`;
    element<HTMLButtonElement>('[data-action=close-panel]').focus({preventScroll:true});
    return element<HTMLDivElement>('.lv-panel-body');
  }
  function openPanel(kind: 'map' | 'journal' | 'menu') {
    if (!initialized) return;
    if (panel === kind) { closePanel(); return; }
    closeDialogue();
    panel = kind;
    if (kind === 'map') {
      const body = buildPanel('A world worth wandering', 'Cartographer’s notebook');
      body.innerHTML = `<canvas class="lv-map-large" width="550" height="450" aria-label="Map of the Lantern Isles. Click a destination to follow a path." tabindex="0"></canvas><div class="lv-map-caption">Click anywhere on land to set your next destination.</div><div class="lv-map-legend"><span><i></i>Places you’ve found</span><span><i></i>Somewhere new</span></div>`;
      const map = element<HTMLCanvasElement>('.lv-map-large');
      renderer?.renderMap(map, renderState, discovered);
      map.addEventListener('click', event => {
        const box = map.getBoundingClientRect();
        const scale=Math.min((map.width-24)/world.width,(map.height-24)/world.height);
        const ox=(map.width-world.width*scale)/2,oy=(map.height-world.height*scale)/2;
        const destination = {x:((event.clientX-box.left)/box.width*map.width-ox)/scale*world.tileSize,y:((event.clientY-box.top)/box.height*map.height-oy)/scale*world.tileSize};
        closePanel(); walkTo(destination); toast('A new path. Let’s see where it leads.', 2100);
      }, {signal:listeners.signal});
    } else if (kind === 'journal') {
      const body = buildPanel('Small wonders, remembered', 'Field journal');
      const lead = document.createElement('p'); lead.textContent = 'There is no hurry here. A few places, a few people, and a little light to carry home.'; body.append(lead);
      const places = document.createElement('div'); places.className = 'lv-discoveries';
      for (const place of world.landmarks) {
        const card = document.createElement('div'); card.className = 'lv-discovery';
        const name = document.createElement('b'); name.textContent = discovered.has(place.id) ? place.name : 'An unwritten place';
        const sub = document.createElement('small'); sub.textContent = discovered.has(place.id) ? place.subtitle : 'Follow a path. Look around.';
        card.append(name,sub); places.append(card);
      }
      body.append(places);
      const meta = document.createElement('div'); meta.className = 'lv-journal-meta'; meta.textContent = `${state.journal.length} MOMENTS KEPT · ${collected.size} LIGHTS CARRIED`; body.append(meta);
      for (const entry of [...state.journal].reverse()) {
        const block = document.createElement('article'); block.className = 'lv-journal-entry';
        const title = document.createElement('h3'); title.textContent = entry.title;
        const text = document.createElement('p'); text.textContent = entry.text;
        block.append(title,text); body.append(block);
      }
    } else {
      const body = buildPanel('Make yourself at home', 'A quieter kind of adventure');
      body.innerHTML = `<p>Change the light, listen to the rain, or follow whatever path catches your eye. Your discoveries stay with you.</p>
        <div class="lv-settings-row"><div><label for="lv-time-setting">Time of day</label><small>The islands wear three different skies.</small></div><select id="lv-time-setting" aria-label="Time of day"><option value="day">Afternoon</option><option value="dusk">Golden hour</option><option value="night">Starlight</option></select></div>
        <div class="lv-settings-row"><div><label for="lv-weather-setting">Weather</label><small>A change in the air.</small></div><select id="lv-weather-setting" aria-label="Weather"><option value="clear">Clear skies</option><option value="rain">Soft rain</option><option value="mist">Drifting mist</option></select></div>
        <div class="lv-settings-row"><div><label>Island soundscape</label><small>A few soft notes for your journey.</small></div><button class="lv-secondary" data-action="sound">${state.sound ? 'Sound on' : 'Sound off'}</button></div>
        <div class="lv-help"><span><kbd>W A S D</kbd> or arrows to move</span><span><kbd>E</kbd> talk & interact</span><span><kbd>Shift</kbd> move faster</span><span><kbd>M</kbd> island map</span><span><kbd>J</kbd> field journal</span><span>Click or tap to walk</span></div>
        <div class="lv-menu-actions"><button class="lv-primary" data-action="close-panel">Back to the islands ${svg('arrow')}</button><button class="lv-secondary" data-action="save">Save now</button></div>`;
      const timeSelect = element<HTMLSelectElement>('#lv-time-setting'); timeSelect.value = state.timeOfDay;
      timeSelect.addEventListener('change', () => { state.timeOfDay = timeSelect.value as TimeOfDay; changed(); updateUI(); }, {signal:listeners.signal});
      const weatherSelect = element<HTMLSelectElement>('#lv-weather-setting'); weatherSelect.value = state.weather;
      weatherSelect.addEventListener('change', () => { state.weather = weatherSelect.value as Weather; changed(); updateUI(); }, {signal:listeners.signal});
    }
  }
  function closeDialogue() { dialogNpc = null; dialogue.hidden = true; keys.clear(); canvas.focus({preventScroll:true}); }
  function drawPortrait(canvas: HTMLCanvasElement, npc: NPC) {
    const c = canvas.getContext('2d')!; canvas.width=22;canvas.height=26;
    c.fillStyle='#d7ddbd'; c.fillRect(0,0,22,26);
    c.fillStyle='#708762';c.fillRect(3,22,16,2);
    c.fillStyle=npc.color;c.fillRect(5,14,12,8);c.fillRect(3,17,16,3);
    c.fillStyle='#e9bd8c';c.fillRect(7,6,8,9);c.fillRect(5,9,12,4);
    c.fillStyle='#3c4935';c.fillRect(6,4,10,4);c.fillRect(5,7,3,4);c.fillRect(14,7,3,4);
    c.fillStyle='#fff0b9';c.fillRect(5,3,12,2);c.fillRect(3,5,16,2);
    c.fillStyle='#364433';c.fillRect(8,10,1,1);c.fillRect(13,10,1,1);c.fillRect(8,22,3,3);c.fillRect(13,22,3,3);
  }
  function showDialogue(npc: NPC, index = 0) {
    closePanel();
    path=[];renderState.target=null;keys.clear();
    dialogNpc=npc;dialogIndex=index;
    dialogue.hidden=false;
    dialogue.innerHTML=`<canvas class="lv-portrait" aria-hidden="true"></canvas><div class="lv-dialogue-content"><div class="lv-dialogue-name"></div><div class="lv-dialogue-role"></div><div class="lv-dialogue-text"></div><div class="lv-dialogue-foot"><span><kbd>E</kbd> to continue · <kbd>Esc</kbd> to leave</span><button data-action="dialogue-next">${index === npc.lines.length-1 ? 'Until next time' : 'Tell me more'} ${index === npc.lines.length-1 ? '' : '→'}</button></div></div>`;
    element('.lv-dialogue-name').textContent=npc.name;
    element('.lv-dialogue-role').textContent=npc.role;
    element('.lv-dialogue-text').textContent=npc.lines[index];
    drawPortrait(element<HTMLCanvasElement>('.lv-portrait'),npc);
    element<HTMLButtonElement>('[data-action=dialogue-next]').focus({preventScroll:true});
    if(index===0 && !state.journal.some(entry=>entry.title===`A moment with ${npc.name}`)) addJournal(`A moment with ${npc.name}`,npc.lines[0]);
  }
  function nextDialogue() {
    if(!dialogNpc) return;
    if(dialogIndex+1<dialogNpc.lines.length) showDialogue(dialogNpc,dialogIndex+1);
    else { closeDialogue(); canvas.focus({preventScroll:true}); }
  }
  function interaction() {
    const p=renderState.player;
    const npc = world.npcs.filter(n=>distance(p,renderState.npcPositions?.get(n.id)??n)<40).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(npc) return {type:'npc' as const,npc,label:`Talk to ${npc.name}`};
    const tower=world.props.find(prop=>prop.kind==='tower');
    if(tower && distance(p,tower)<80) return {type:'tower' as const,label:state.lighthouseLit?'Listen to the beacon':collected.size===world.wisps.length?'Wake the lighthouse':`The lighthouse · ${collected.size}/${world.wisps.length} lights`};
    const prop=world.props.find(prop=>['well','shrine','sign','boat','bench'].includes(prop.kind)&&distance(p,prop)<30);
    if(prop) return {type:'prop' as const,prop,label:prop.kind==='bench'?'Rest a little':prop.kind==='well'?'Listen to the wishing well':prop.kind==='boat'?'Watch the little boat':prop.kind==='shrine'?'Read the old stones':'Read the waymark'};
    return null;
  }
  function interact() {
    if(!initialized || panel) return;
    if(dialogNpc) {nextDialogue();return;}
    const action=interaction();
    if(!action) {toast('Follow the paths. Look for the little wandering lights.',2700);return;}
    if(action.type==='npc') {showDialogue(action.npc);return;}
    if(action.type==='tower') {
      if(state.lighthouseLit) {toast('The light turns slowly. Somewhere out at sea, someone sees it.',4500);return;}
      if(collected.size<world.wisps.length) {toast('Six lights once kept this beacon bright. The islands remember where they went.',5000);return;}
      state.lighthouseLit=true;state.timeOfDay='night';
      addJournal('The stars came home','You set the six little lights inside the lighthouse. For a moment, nothing. Then the old lens caught fire, and the whole sea answered in gold.');
      sound.complete();updateUI();toast('The lighthouse is awake. You brought the stars home.',7000);return;
    }
    const texts:Record<string,string>={
      well:'You lean over the well. Somewhere below, a tiny echo wishes you well.',
      shrine:'“When the sky forgets its stars, carry a little light toward the sea.”',
      sign:'Hearthwick ← · Whisperpine ↑ · Starfall across the river → · The lighthouse, southeast.',
      boat:'A tiny boat rocks against the shore. It has nowhere urgent to be.',
      bench:'You take a breath. The world keeps quietly being beautiful. Golden hour settles in.',
    };
    if(action.prop.kind==='bench'){state.timeOfDay='dusk';changed();updateUI();}
    toast(texts[action.prop.kind]??'There is a story in every small thing.',4500);
  }
  async function toggleSound() {
    state.sound=!state.sound;
    try{await sound.setEnabled(state.sound);}catch{state.sound=false;toast('Sound is unavailable in this browser. The islands are happy to stay quiet.');}
    if(disposed)return;
    soundStarted=state.sound;
    changed();updateUI();
    const menuSound = backdrop.querySelector<HTMLButtonElement>('[data-action=sound]');
    if(menuSound) menuSound.textContent=state.sound?'Sound on':'Sound off';
  }
  function walkTo(target: {x:number;y:number}) {
    if(!initialized || panel || dialogNpc) return;
    canvas.focus({preventScroll:true});
    path=findPath(world,renderState.player,target);
    renderState.target=path.length ? path[path.length-1] : null;
    if(!path.length && distance(target,renderState.player)>20) toast('That spot is beyond the path. Try somewhere on land.',2200);
  }
  function moveBy(dx:number,dy:number) {
    const p=renderState.player;
    const safe=(x:number,y:number)=>isWalkable(world,x-3,y)&&isWalkable(world,x+3,y)&&isWalkable(world,x,y-2)&&isWalkable(world,x,y+2);
    let moved=false;
    if(dx && safe(p.x+dx,p.y)){p.x+=dx;moved=true;}
    if(dy && safe(p.x,p.y+dy)){p.y+=dy;moved=true;}
    if(moved){p.direction=Math.abs(dx)>Math.abs(dy)?dx<0?1:2:dy<0?3:0;changed();}
    return moved;
  }
  function update(dt:number) {
    const p=renderState.player;
    p.moving=false;
    if(!panel&&!dialogNpc){
      let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
      let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
      const speed=keys.has('shift')?106:70;
      if(dx||dy){path=[];renderState.target=null;const n=Math.hypot(dx,dy);p.moving=moveBy(dx/n*speed*dt,dy/n*speed*dt);}
      else if(path.length){
        const waypoint=path[0];dx=waypoint.x-p.x;dy=waypoint.y-p.y;const d=Math.hypot(dx,dy);
        if(d<Math.max(2,speed*dt)){p.moving=moveBy(dx,dy);path.shift();if(!path.length)renderState.target=null;}
        else{p.moving=moveBy(dx/d*speed*dt,dy/d*speed*dt);if(!p.moving){path=[];renderState.target=null;}}
      }
      if(p.moving)p.step+=dt*10;
      for(const wisp of world.wisps){
        if(!collected.has(wisp.id)&&distance(p,wisp)<20){
          collected.add(wisp.id);addJournal(wisp.name,'A wandering light settles into your hands. It feels like a very small, very hopeful star.');
          sound.collect();updateUI();toast(collected.size===world.wisps.length?'All six lights found. The lighthouse is waiting on the southeast shore.':`${wisp.name} found · ${collected.size} of ${world.wisps.length} lights`,4400);
        }
      }
    }
    const place=landmarkAt(world,p.x,p.y);
    const nextLandmark=place?.id??'';
    if(nextLandmark!==currentLandmark){
      currentLandmark=nextLandmark;
      element('.lv-biome').textContent=place?.subtitle??'Between here and somewhere';
      element('.lv-location-title').textContent=place?.name??'The winding ways';
      element('.lv-location-detail').textContent=place?.description??'One small step. Then another.';
      if(place&&!discovered.has(place.id)){
        discovered.add(place.id);addJournal(place.name,place.description);sound.discover();updateUI();
        if(discovered.size>1)toast(`A new place: ${place.name}`,3300);
      }
      notifyScene();
    }
    const action=interaction();element('.lv-hint-text').textContent=action?.label??(renderState.target?'Following a little curiosity…':'Wander. The world will wait.');
    for(const npc of world.npcs){
      const index=world.npcs.indexOf(npc);const t=elapsed*.1+index*1.7;
      const next={x:npc.x+Math.sin(t)*10,y:npc.y+Math.cos(t*.7)*7};
      renderState.npcPositions!.set(npc.id,dialogNpc?.id===npc.id?{x:npc.x,y:npc.y}:isWalkable(world,next.x,next.y)?next:{x:npc.x,y:npc.y});
    }
    const cameraLerp=1-Math.exp(-dt*7);
    renderState.camera.x+=(p.x-renderState.camera.x)*cameraLerp;
    renderState.camera.y+=(p.y-renderState.camera.y)*cameraLerp;
  }
  function animate(now:number) {
    if(disposed)return;
    frame=requestAnimationFrame(animate);
    if(!initialized||document.hidden)return;
    const dt=Math.min((now-previousTime)/1000,.04);previousTime=now;
    elapsed+=dt;renderState.time=elapsed*1000;renderState.zoom=zoom;
    update(dt);renderer?.render(renderState);
    if(elapsed-lastMap>.35){renderer?.renderMap(minimap,renderState,discovered);lastMap=elapsed;}
  }
  root.addEventListener('click', event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('[data-action]');
    if(!button)return;
    switch(button.dataset.action){
      case'map':case'journal':case'menu':openPanel(button.dataset.action);break;
      case'close-panel':closePanel();break;
      case'interact':interact();break;
      case'dialogue-next':nextDialogue();break;
      case'sound':void toggleSound();break;
      case'zoom-in':zoom=Math.min(4,zoom+.5);updateUI();break;
      case'zoom-out':zoom=Math.max(2,zoom-.5);updateUI();break;
      case'save':dirty=true;void flushSave();break;
      case'return':
        button.disabled=true;
        void flushSave().then(()=>{
          if(disposed)return;
          if(dirty){button.disabled=false;toast('Your latest progress is still here. Retry saving before returning to chat.',5000);}
          else options.onClose?.();
        });
        break;
    }
  },{signal:listeners.signal});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    activePointer=event.pointerId;
    const box=canvas.getBoundingClientRect();
    walkTo(renderer?.screenToWorld(event.clientX-box.left,event.clientY-box.top,renderState)??renderState.player);
  },{signal:listeners.signal});
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerId!==activePointer||!event.buttons)return;
    const box=canvas.getBoundingClientRect();
    walkTo(renderer?.screenToWorld(event.clientX-box.left,event.clientY-box.top,renderState)??renderState.player);
  },{signal:listeners.signal});
  window.addEventListener('pointerup',()=>{activePointer=null;},{signal:listeners.signal});
  minimap.addEventListener('click',()=>openPanel('map'),{signal:listeners.signal});
  minimap.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')openPanel('map');},{signal:listeners.signal});
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)closePanel();},{signal:listeners.signal});
  root.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();
    if(key==='escape'){event.preventDefault();if(dialogNpc)closeDialogue();else if(panel)closePanel();else openPanel('menu');return;}
    if(panel&&key==='tab'){
      const controls=[...backdrop.querySelectorAll<HTMLElement>('button,select,canvas[tabindex]')];
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;
    }
    if((event.target as Element).matches('input,textarea,select'))return;
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','e',' ','m','j'].includes(key))event.preventDefault();
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)){if(!panel&&!dialogNpc)keys.add(key);return;}
    if(event.repeat)return;
    if(key==='e'||key===' '){if(panel)return;interact();}
    else if(key==='m')openPanel('map');else if(key==='j')openPanel('journal');
  },{signal:listeners.signal});
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()),{signal:listeners.signal});
  window.addEventListener('blur',()=>{keys.clear();activePointer=null;},{signal:listeners.signal});
  document.addEventListener('visibilitychange',()=>{
    keys.clear();previousTime=performance.now();
    if(document.hidden){void flushSave();if(state.sound)void sound.setEnabled(false);}
    else if(state.sound)void sound.setEnabled(true).catch(()=>{});
  },{signal:listeners.signal});
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-key]')){
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.key!);},{signal:listeners.signal});
    const release=()=>keys.delete(button.dataset.key!);
    button.addEventListener('pointerup',release,{signal:listeners.signal});button.addEventListener('pointercancel',release,{signal:listeners.signal});button.addEventListener('lostpointercapture',release,{signal:listeners.signal});
  }
  const observer=new ResizeObserver(()=>{if(root.clientWidth>0&&root.clientHeight>0)renderer?.resize(root.clientWidth,root.clientHeight);});observer.observe(root);
  window.addEventListener('pagehide',()=>void flushSave(),{signal:listeners.signal});
  const resumeSavedSound=()=>{
    if(initialized&&state.sound&&!soundStarted){soundStarted=true;void sound.setEnabled(true).catch(()=>{if(!disposed){state.sound=false;updateUI();}});}
  };
  root.addEventListener('pointerdown',resumeSavedSound,{signal:listeners.signal});
  root.addEventListener('keydown',resumeSavedSound,{signal:listeners.signal});
  async function initialize(){
    try{
      const stored=await options.load?.();
      if(disposed)return;
      if(stored)state=normalizeSave(stored);
    }catch{
      if(!disposed){
        const loading=element('.lv-loading');
        loading.innerHTML='<div style="text-align:center;max-width:320px;padding:24px"><p>Your saved journey could not be loaded.</p><p style="font:12px/1.8 system-ui;color:#b4c1ae">Your progress is still safe. Try connecting again.</p><button class="lv-primary" style="margin:20px auto" data-retry>Try again</button></div>';
        loading.querySelector('button')!.addEventListener('click',()=>{loading.textContent='Finding your way back…';void initialize();},{once:true,signal:listeners.signal});
      }
      return;
    }
    if(disposed)return;
    world=generateWorld(state.seed);
    if(!isWalkable(world,state.player.x,state.player.y))state.player={...world.spawn};
    collected=new Set(state.collected);discovered=new Set(state.discovered);
    renderState.player={...state.player,direction:0,moving:false,step:0};renderState.camera={...state.player};renderState.collected=collected;
    renderer=createRenderer(canvas,world);renderer.resize(root.clientWidth,root.clientHeight);
    if(!state.journal.length)state.journal=[{title:'A light worth following',text:'You arrived with empty pockets and nowhere urgent to be. An old lighthouse sleeps beyond the river. Six wandering lights might know how to wake it.',time:Date.now()}];
    initialized=true;element('.lv-loading').hidden=true;updateUI();
    // A saved audio preference resumes after the first gesture, satisfying autoplay rules.
    canvas.focus({preventScroll:true});previousTime=performance.now();frame=requestAnimationFrame(animate);
  }
  void initialize();
  return {
    getState,
    flushSave,
    destroy(){
      if(disposed)return;
      void flushSave();disposed=true;
      cancelAnimationFrame(frame);listeners.abort();observer.disconnect();renderer?.destroy();void sound.destroy();
      if(saveTimer)clearTimeout(saveTimer);if(toastTimer)clearTimeout(toastTimer);
      root.remove();style.remove();
    },
  };
}
