import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { generateWorld } from '../src/world';
import { createRenderer } from '../src/renderer';
import type { RenderState } from '../src/types';

// A native canvas postcard of the actual game renderer, rather than a browser
// screenshot. The very small DOM adapter is only needed by canvas allocation.
function nativeCanvas(width = 1, height = 1): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  Object.assign(canvas, { style: {} });
  return canvas as unknown as HTMLCanvasElement;
}
Object.assign(globalThis, {
  document: { createElement: () => nativeCanvas() },
  window: { matchMedia: () => ({ matches: false }) },
});

const world = generateWorld(72819);
for(const [path,name] of [
  ['/usr/share/fonts/gsfonts/P052-Roman.otf','LumiSerif'],
  ['/usr/share/fonts/gsfonts/P052-Italic.otf','LumiSerifItalic'],
  ['/usr/share/fonts/gsfonts/NimbusSans-Regular.otf','LumiSans'],
] as const) if(existsSync(path))GlobalFonts.registerFromPath(path,name);
const sheet = createCanvas(1800, 1050);
const c = sheet.getContext('2d');
c.imageSmoothingEnabled = false;
c.fillStyle = '#172e28'; c.fillRect(0, 0, sheet.width, sheet.height);

function lettering(text: string, x: number, y: number, space: number, color: string, size: number) {
  c.font = `${size}px LumiSans`; c.fillStyle = color;
  for (const character of text) {
    c.fillText(character, x, y);
    x += c.measureText(character).width + space;
  }
}
function lantern(x: number, y: number) {
  const r = (xx: number, yy: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x + xx * 3, y + yy * 3, w * 3, h * 3); };
  r(7, 0, 4, 1, '#edd99b'); r(6, 1, 1, 3, '#c8bd87'); r(11, 1, 1, 3, '#c8bd87');
  r(4, 4, 10, 1, '#eddda6'); r(5, 6, 8, 14, '#aeb77b'); r(3, 6, 12, 2, '#e8d692');
  r(6, 8, 6, 11, '#eed693'); r(8, 10, 2, 7, '#fff1c2'); r(9, 8, 1, 2, '#fff7db');
  r(4, 20, 10, 2, '#e1ce90'); r(7, 22, 4, 1, '#829768');
}
lantern(48, 26);
c.font = '64px LumiSerif'; c.fillStyle = '#f4e8c4'; c.fillText('LumiRoam', 119, 83);
lettering('THE LANTERN ISLES', 123, 105, 3.2, '#b5c5a6', 11);
lettering('A LITTLE WORLD. A LONG WAY HOME.', 1270, 69, 2.1, '#d4c18a', 12);
c.fillStyle = '#6e86654d'; c.fillRect(48, 119, 1704, 1);

function scene(x: number, y: number, width: number, height: number, camera: {x:number;y:number}, player: {x:number;y:number}, zoom: number, timeOfDay: RenderState['timeOfDay'], lit: boolean, seconds: number, title: string, caption: string) {
  const target = nativeCanvas();
  const renderer = createRenderer(target, world);
  renderer.resize(width, height);
  renderer.render({ player: {...player, direction: 0, moving: false, step: 0}, camera, zoom,
    time: seconds * 1000, timeOfDay, weather: 'clear', lighthouseLit: lit,
    collected: new Set(lit ? world.wisps.map(w => w.id) : []), target: null });
  c.drawImage(target as unknown as Parameters<typeof c.drawImage>[0], x, y, width, height);
  // A quiet postcard vignette keeps the labels readable while the world remains
  // the same painting used by the playable extension.
  const shade = c.createLinearGradient(0, y + height - 130, 0, y + height);
  shade.addColorStop(0, '#142c2700'); shade.addColorStop(1, '#102c27de');
  c.fillStyle = shade; c.fillRect(x, y + height - 130, width, 130);
  c.strokeStyle = '#d6daa53d'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, width - 1, height - 1);
  c.fillStyle = '#f4e7bd'; c.font = width > 800 ? '34px LumiSerif' : '27px LumiSerif';
  c.fillText(title, x + 28, y + height - 47);
  c.fillStyle = '#bdcfb0'; c.font = width > 800 ? '15px LumiSans' : '13px LumiSans';
  c.fillText(caption, x + 29, y + height - 23);
  renderer.destroy();
}
scene(48, 132, 1188, 798, {x:world.spawn.x, y:world.spawn.y - 15}, world.spawn, 3, 'dusk', false, 14.4,
  'Hearthwick', 'Copper roofs. Fresh bread. A light in every window.');
scene(1260, 132, 492, 386, {x:32.5 * 16, y:26.8 * 16}, {x:32.5 * 16, y:29.7 * 16}, 2, 'day', false, 10,
  'Whisperpine Glen', 'The old forest remembers your name.');
scene(1260, 544, 492, 386, {x:97.2 * 16, y:67.8 * 16}, {x:93 * 16, y:71.5 * 16}, 2, 'night', true, 21,
  'Lastlight Isle', 'Give the islands their stars again.');

lettering('FIVE PLACES TO DISCOVER', 49, 981, 2.2, '#d9c895', 12);
lettering('SIX WANDERING LIGHTS', 600, 981, 2.2, '#b2c29e', 12);
lettering('ONE LITTLE ADVENTURE', 1261, 981, 2.2, '#d9c895', 12);
c.font = '17px LumiSerifItalic'; c.fillStyle = '#81997b'; c.fillText('Wander. The world will wait.', 49, 1017);
c.font = '11px LumiSans'; c.fillStyle = '#6d876e';
const signature = 'A living pixel world for Lumiverse';
c.fillText(signature, 1752 - c.measureText(signature).width, 1015);

const out = resolve(import.meta.dir, '../preview/lantern-isles.png');
await mkdir(resolve(import.meta.dir, '../preview'), { recursive: true });
await Bun.write(out, sheet.toBuffer('image/png'));
console.log(out);
