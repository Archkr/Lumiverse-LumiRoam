import type { Renderer, RenderState, World, WorldProp, PropKind } from './types';

// All the scenery is painted at its native pixel resolution. The screen is only
// an enlarged window onto that little painting, including the weather and light.
type Ctx = CanvasRenderingContext2D;
type Sprite = { canvas: HTMLCanvasElement; width: number; height: number };
const ink = '#273a35';
const palette = {
  grass: ['#71884d', '#758d51', '#6c834a', '#788e51', '#6b854e'],
  water: ['#397a83', '#387780', '#3d7f85', '#377780'],
  sand: ['#d0c096', '#ccbb90', '#d5c49b'],
  path: ['#b0a384', '#b9ab8c', '#b2a487'],
  stone: ['#868f82', '#8e9889', '#829084'],
};
function hash(x: number, y: number, seed = 0): number {
  let n = Math.imul(x ^ seed, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
// Scanline polygons preserve a hard pixel silhouette, even along roof slopes.
function poly(c: Ctx, points: number[][], color: string) {
  c.fillStyle = color;
  const minY = Math.floor(Math.min(...points.map(p => p[1])));
  const maxY = Math.ceil(Math.max(...points.map(p => p[1])));
  for (let y = minY; y < maxY; y++) {
    const crosses: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5)) {
        crosses.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    crosses.sort((a, b) => a - b);
    for (let i = 0; i < crosses.length; i += 2) {
      const x = Math.round(crosses[i]);
      c.fillRect(x, y, Math.round(crosses[i + 1]) - x, 1);
    }
  }
}
function oval(c: Ctx, x: number, y: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  for (let row = -Math.floor(ry); row <= ry; row++) {
    const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - row * row / (ry * ry))));
    c.fillRect(Math.round(x - dx), Math.round(y + row), dx * 2 + 1, 1);
  }
}
function pixels(c: Ctx, points: number[][], color: string, size = 1) {
  c.fillStyle = color;
  for (const [x, y] of points) c.fillRect(x, y, size, size);
}
function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

function paintTree(c: Ctx, variant: number, kind: PropKind, w: number, h: number) {
  const x = Math.floor(w / 2), foot = h - 3;
  oval(c, x + 2, foot - 1, kind === 'willow' ? 22 : 17, 5, '#395840');
  const sets = [
    ['#304d39', '#3d6342', '#527a49', '#678852', '#85a263'],
    ['#314b43', '#41644d', '#527c58', '#6a8c5b', '#93a56c'],
    ['#354c38', '#506643', '#68834b', '#859654', '#b0b771'],
  ];
  const cols = sets[variant % sets.length];
  rect(c, x - 4, foot - 22, 8, 22, ink);
  rect(c, x - 3, foot - 24, 6, 24, '#695541');
  rect(c, x - 2, foot - 23, 2, 21, '#8c7350');
  rect(c, x + 2, foot - 23, 1, 20, '#53483a');
  poly(c, [[x - 2, foot - 7], [x - 9, foot - 1], [x - 1, foot - 3], [x + 7, foot]], '#695541');
  if (kind === 'pine') {
    for (let tier = 0; tier < 4; tier++) {
      const yy = 5 + tier * 9, radius = 8 + tier * 4;
      poly(c, [[x, yy], [x + radius, yy + 17], [x + radius - 4, yy + 17], [x + radius + 1, yy + 21], [x - radius - 1, yy + 21], [x - radius + 4, yy + 17], [x - radius, yy + 17]], ink);
      poly(c, [[x, yy], [x + radius - 1, yy + 16], [x + radius - 5, yy + 16], [x + radius, yy + 19], [x - radius, yy + 19], [x - radius + 4, yy + 16], [x - radius + 1, yy + 16]], cols[1]);
      poly(c, [[x, yy + 1], [x - 2, yy + 13], [x - radius + 3, yy + 16]], cols[3]);
      rect(c, x - radius + 4, yy + 17, radius - 4, 1, cols[2]);
      pixels(c, [[x - 2, yy + 4], [x - 5, yy + 11], [x - 7, yy + 14]], cols[4]);
    }
    return;
  }
  const clusters = kind === 'willow'
    ? [[x - 13, 21, 15, 16], [x + 11, 22, 16, 15], [x, 13, 18, 13], [x + 1, 32, 21, 11]]
    : [[x - 12, 23, 13, 12], [x + 12, 22, 14, 12], [x, 12, 16, 11], [x + 1, 30, 17, 10]];
  clusters.forEach(([cx, cy, rx, ry], i) => {
    oval(c, cx, cy + 1, rx + 1, ry + 1, ink);
    oval(c, cx, cy, rx, ry, cols[0]);
    oval(c, cx - 1, cy - 2, rx - 1, ry - 2, cols[1]);
    poly(c, [[cx - rx + 2, cy - 2], [cx - rx + 4, cy - ry + 4], [cx, cy - ry + 1], [cx + rx - 3, cy - ry + 5], [cx + 3, cy - 2], [cx - 1, cy + 3]], cols[2]);
    poly(c, [[cx - rx + 4, cy - 4], [cx - 5, cy - ry + 3], [cx + 4, cy - ry + 3], [cx - 1, cy - 5]], cols[3]);
    for (let j = 0; j < 20; j++) {
      const xx = cx + Math.round((hash(j, i, variant + 22) - .5) * (rx * 1.6));
      const yy = cy + Math.round((hash(j, i, variant + 99) - .5) * (ry * 1.5));
      rect(c, xx, yy, 2 + (j % 2), 1, j % 4 === 0 ? cols[3] : cols[1]);
      if (j % 6 === 0) rect(c, xx - 1, yy - 1, 2, 1, cols[4]);
    }
  });
  if (kind === 'willow') {
    for (let i = 0; i < 10; i++) {
      const xx = x - 24 + i * 5, yy = 24 + (i % 3) * 4, length = 13 + (i % 4) * 2;
      rect(c, xx, yy, 2, length, cols[1]);
      rect(c, xx + 1, yy + 3, 1, length - 4, cols[3]);
      rect(c, xx - 1, yy + length - 4, 2, 3, cols[2]);
    }
  }
}

function windowPane(c: Ctx, x: number, y: number, width = 9, height = 10) {
  rect(c, x - 1, y - 1, width + 2, height + 3, '#674f42');
  rect(c, x, y, width, height, '#edc97a');
  rect(c, x + 1, y + 1, width - 2, height - 2, '#ffd993');
  rect(c, x + Math.floor(width / 2), y, 1, height, '#9b7552');
  rect(c, x, y + 4, width, 1, '#b58d57');
  rect(c, x - 2, y + height, width + 4, 2, '#8d7354');
}
function paintHouse(c: Ctx, variant: number, inn: boolean, w: number, h: number) {
  const x = Math.floor(w / 2), base = h - 4, left = inn ? 7 : 8, right = w - left;
  const roofY = inn ? 14 : 10, eave = inn ? 38 : 31, wallTop = eave - 2;
  oval(c, x + 3, base, w / 2 - 2, 5, '#52684a');
  rect(c, left + 3, wallTop, right - left - 5, base - wallTop, '#654f43');
  rect(c, left + 4, wallTop + 1, right - left - 8, base - wallTop - 2, '#d6caa2');
  rect(c, left + 4, wallTop + 1, right - left - 8, 4, '#b1a283');
  rect(c, right - 8, wallTop + 3, 3, base - wallTop - 4, '#b3a889');
  rect(c, left + 5, base - 4, right - left - 9, 4, '#a6a286');
  rect(c, left + 4, base - 3, right - left - 8, 2, '#83927e');
  // Half timbered walls and worn stones around the foundation.
  rect(c, left + 4, wallTop + 2, 2, base - wallTop - 3, '#7e6750');
  rect(c, right - 10, wallTop + 2, 2, base - wallTop - 3, '#8b7358');
  rect(c, left + 6, wallTop + 8, right - left - 16, 1, '#b8ac8a');
  for (let i = 0; i < 4; i++) rect(c, left + 7 + i * 10, base - 3 + (i % 2), 5, 1, '#c2be99');
  const roofs = [['#815547', '#a66550', '#bc7a58', '#d8956a'], ['#575168', '#78677e', '#947b8e', '#b3919e'], ['#536f69', '#658a7d', '#83a18a', '#a6b795']];
  const roof = roofs[variant % 3];
  const roofPoints = [[left - 4, eave], [left + 7, roofY], [right - 13, roofY], [right + 2, eave]];
  poly(c, roofPoints, '#4c433e');
  poly(c, [[left - 3, eave - 3], [left + 8, roofY + 1], [right - 14, roofY + 1], [right, eave - 3]], roof[1]);
  for (let row = 0; row < 6; row++) {
    const yy = roofY + 3 + row * 4;
    if (yy >= eave - 3) break;
    const inset = Math.max(0, Math.round((eave - yy) / 2));
    const lx = left - 2 + inset, rx = right - inset;
    rect(c, lx, yy + 2, rx - lx, 1, roof[0]);
    for (let xx = lx + (row % 2) * 4; xx < rx - 2; xx += 8) {
      rect(c, xx, yy, Math.min(6, rx - xx), 1, roof[2]);
      rect(c, xx + 1, yy + 1, 1, 1, roof[3]);
    }
  }
  rect(c, left + 8, roofY, right - left - 21, 2, roof[3]);
  rect(c, left - 4, eave - 2, right - left + 7, 2, roof[0]);
  rect(c, left - 4, eave, right - left + 7, 2, '#59473b');
  // Chimney, chimney cap and a tiny weathered copper flue.
  rect(c, right - 18, roofY - 7, 7, 14, '#5f5850');
  rect(c, right - 17, roofY - 6, 5, 12, '#a59479');
  rect(c, right - 18, roofY - 8, 8, 3, '#beb69a');
  rect(c, right - 16, roofY - 7, 4, 1, '#4b5149');
  rect(c, right - 17, roofY - 2, 3, 1, '#c7b597');
  const doorX = inn ? x - 5 : x + 4;
  rect(c, doorX - 1, base - 16, 11, 17, '#78614a');
  rect(c, doorX, base - 15, 9, 15, '#8d674a');
  rect(c, doorX + 1, base - 14, 2, 13, '#aa8257');
  rect(c, doorX + 5, base - 14, 1, 13, '#72543f');
  rect(c, doorX + 7, base - 8, 1, 2, '#ecc678');
  rect(c, doorX - 3, base, 15, 2, '#c0b795');
  rect(c, doorX - 4, base + 2, 17, 1, '#899382');
  if (inn) {
    windowPane(c, left + 10, base - 18, 9, 11);
    windowPane(c, right - 23, base - 18, 9, 11);
    // Dormer with a round upstairs window.
    poly(c, [[x - 11, eave - 12], [x - 11, roofY + 10], [x, roofY + 3], [x + 10, roofY + 10], [x + 10, eave - 12]], '#564849');
    poly(c, [[x - 9, eave - 12], [x - 9, roofY + 11], [x, roofY + 5], [x + 8, roofY + 11], [x + 8, eave - 12]], '#cbbb99');
    windowPane(c, x - 4, roofY + 10, 8, 8);
    rect(c, right - 6, base - 24, 1, 15, '#684f3b');
    rect(c, right - 6, base - 24, 10, 2, '#856444');
    rect(c, right - 1, base - 22, 8, 10, '#5e4837');
    rect(c, right, base - 21, 6, 8, '#b89159');
    pixels(c, [[right + 2, base - 19], [right + 1, base - 18], [right + 3, base - 18], [right + 2, base - 17], [right + 2, base - 16]], '#f0d89b');
  } else {
    windowPane(c, left + 10, base - 17, 10, 10);
    rect(c, left + 7, base - 6, 16, 3, '#78563f');
    for (let i = 0; i < 5; i++) {
      rect(c, left + 8 + i * 3, base - 9 - i % 2, 2, 4, '#5a794b');
      rect(c, left + 8 + i * 3, base - 10 - i % 2, 2, 2, i % 2 ? '#e7b680' : '#bf8294');
    }
  }
  // Climbing ivy breaks the clean silhouette.
  for (let i = 0; i < 10; i++) rect(c, right - 7 + (i % 3) - 1, wallTop + i * 2, 3, 2, i % 2 ? '#63784b' : '#7d8c58');
}

function spriteSize(kind: PropKind): [number, number] {
  const sizes: Partial<Record<PropKind, [number, number]>> = {
    tree: [58, 58], pine: [50, 66], willow: [64, 66], house: [64, 60], inn: [82, 78],
    tower: [58, 105], ruin: [51, 54], shrine: [36, 43], crystal: [32, 40], boat: [38, 20],
    well: [34, 37], lantern: [16, 35], fence: [32, 18], bench: [28, 20], sign: [24, 27],
    rock: [28, 21], bush: [27, 21], reed: [20, 25], flower: [19, 17], mushroom: [20, 16],
    crate: [22, 20], stump: [23, 16],
  };
  return sizes[kind] ?? [24, 24];
}
function paintProp(kind: PropKind, variant: number): Sprite {
  const [w, h] = spriteSize(kind); const [canvas, c] = makeCanvas(w, h);
  const x = Math.floor(w / 2), y = h - 3;
  if (['tree', 'pine', 'willow'].includes(kind)) paintTree(c, variant, kind, w, h);
  else if (kind === 'house' || kind === 'inn') paintHouse(c, variant, kind === 'inn', w, h);
  else if (kind === 'tower') {
    oval(c, x + 3, y, 24, 6, '#4b6860');
    poly(c, [[x - 17, y], [x - 12, 24], [x + 12, 24], [x + 18, y]], '#45554e');
    poly(c, [[x - 15, y - 2], [x - 10, 24], [x + 10, 24], [x + 16, y - 2]], '#c7c7ac');
    poly(c, [[x - 15, y - 2], [x - 10, 24], [x - 4, 24], [x - 6, y - 2]], '#ded8b5');
    poly(c, [[x + 7, 24], [x + 10, 24], [x + 16, y - 2], [x + 8, y - 2]], '#9cae9c');
    rect(c, x - 11, 42, 23, 9, '#a26e60'); rect(c, x - 12, 65, 26, 9, '#a26e60');
    for (let row = 0; row < 8; row++) {
      const yy = 27 + row * 9;
      rect(c, x - 8, yy, 6, 1, '#a7b59f'); rect(c, x + 4, yy + 4, 5, 1, '#a7b59f');
    }
    rect(c, x - 5, y - 16, 10, 15, '#596052'); rect(c, x - 3, y - 15, 7, 14, '#716d54');
    rect(c, x + 2, y - 8, 1, 2, '#dfbd78');
    windowPane(c, x - 3, 55, 6, 10); windowPane(c, x - 3, 31, 6, 8);
    rect(c, x - 16, 22, 33, 4, '#55685f'); rect(c, x - 19, 20, 39, 2, '#ccd2b3');
    rect(c, x - 12, 9, 25, 12, '#465f59'); rect(c, x - 10, 10, 21, 10, '#e6ca85');
    rect(c, x - 3, 10, 2, 10, '#778c75'); rect(c, x + 6, 10, 2, 10, '#778c75');
    poly(c, [[x - 18, 10], [x - 12, 4], [x + 11, 4], [x + 18, 10]], '#566c66');
    rect(c, x - 11, 3, 23, 2, '#97a592'); rect(c, x, 0, 1, 4, '#5a6253');
    for (let i = -17; i <= 17; i += 5) rect(c, x + i, 17, 1, 5, '#4b6258');
    rect(c, x - 19, 17, 39, 1, '#667d6b');
    rect(c, x - 19, y - 2, 40, 3, '#8ca58b');
  } else if (kind === 'rock') {
    oval(c, x + 2, y, 12, 3, '#4b654b');
    poly(c, [[3, y - 3], [5, y - 12], [12, y - 17], [21, y - 15], [26, y - 5], [23, y]], '#495e55');
    poly(c, [[4, y - 4], [6, y - 12], [12, y - 16], [20, y - 14], [25, y - 5], [22, y - 1]], '#81917d');
    poly(c, [[6, y - 12], [12, y - 16], [20, y - 14], [17, y - 9], [8, y - 8]], '#a8b19a');
    poly(c, [[17, y - 9], [20, y - 14], [25, y - 5], [22, y - 1], [15, y - 3]], '#637a6b');
    rect(c, 7, y - 4, 8, 2, '#78915a'); pixels(c, [[10, y - 13], [12, y - 14], [18, y - 6]], '#c3c3a8');
  } else if (kind === 'bush') {
    oval(c, x, y - 1, 12, 3, '#47623e');
    oval(c, x - 5, y - 8, 7, 6, '#355a3b'); oval(c, x + 5, y - 9, 7, 7, '#355a3b');
    oval(c, x, y - 12, 8, 6, '#557b47'); oval(c, x - 4, y - 12, 5, 4, '#78904f');
    rect(c, x - 8, y - 4, 15, 3, '#416b3e');
    for (let i = 0; i < 8; i++) rect(c, 5 + Math.floor(hash(i, variant) * 16), 5 + Math.floor(hash(variant, i, 2) * 10), 2, 2, variant % 3 ? '#9db06b' : '#dd8e87');
  } else if (kind === 'flower') {
    const colors = ['#e7bd8c', '#e3a3a0', '#a9bfd2', '#d8c881'];
    for (let i = 0; i < 5; i++) {
      const xx = 4 + (i * 7 % 13), yy = y - 4 - (i % 3) * 3;
      rect(c, xx, yy, 1, y - yy, '#466b3e'); rect(c, xx - 1, yy + 3, 3, 1, '#63914c');
      rect(c, xx - 1, yy - 1, 3, 3, colors[variant % 4]); rect(c, xx, yy, 1, 1, '#f9e1ad');
    }
  } else if (kind === 'mushroom') {
    for (let i = 0; i < 3; i++) {
      const xx = 4 + i * 6, yy = y - (i % 2) * 3;
      rect(c, xx - 1, yy - 5, 3, 6, '#d9cbb2');
      oval(c, xx, yy - 5, i === 1 ? 5 : 3, 3, '#664b42');
      oval(c, xx, yy - 6, i === 1 ? 5 : 3, 2, variant % 2 ? '#ba7d5d' : '#c49384');
      pixels(c, [[xx - 1, yy - 7], [xx + 2, yy - 6]], '#efdbaf');
    }
  } else if (kind === 'reed') {
    for (let i = 0; i < 7; i++) {
      const xx = 3 + i * 2, yy = y - 9 - i * 3 % 12;
      rect(c, xx, yy, 1, y - yy, '#506f46'); rect(c, xx + 1, yy + 7, 1, 3, '#859853');
      if (i % 2) { rect(c, xx - 1, yy - 3, 2, 5, '#89754c'); rect(c, xx, yy - 3, 1, 2, '#b6a276'); }
    }
  } else if (kind === 'lantern') {
    oval(c, x, y, 5, 2, '#4b6345'); rect(c, x - 1, 8, 3, y - 7, '#5b4e3b');
    rect(c, x, 9, 1, y - 9, '#a08c59'); rect(c, x - 4, 6, 9, 2, '#4c5140');
    rect(c, x - 3, 8, 7, 8, '#745b37'); rect(c, x - 2, 9, 5, 6, '#efc471');
    rect(c, x - 1, 10, 3, 4, '#ffe6a2'); rect(c, x - 3, 16, 7, 2, '#62624a');
    poly(c, [[x - 5, 6], [x - 2, 3], [x + 2, 3], [x + 5, 6]], '#68735a');
  } else if (kind === 'well') {
    oval(c, x, y, 15, 4, '#526548');
    oval(c, x, y - 6, 12, 7, '#596a60'); rect(c, x - 12, y - 9, 25, 7, '#8b9580');
    oval(c, x, y - 9, 12, 5, '#b7b599'); oval(c, x, y - 9, 8, 3, '#364f50');
    rect(c, x - 8, y - 8, 16, 1, '#478186');
    rect(c, 6, 10, 2, 19, '#5d5140'); rect(c, w - 8, 10, 2, 19, '#5d5140');
    rect(c, 7, 11, 1, 17, '#99784e'); rect(c, w - 7, 11, 1, 17, '#99784e');
    poly(c, [[2, 13], [10, 5], [23, 5], [32, 13]], '#594a43');
    poly(c, [[3, 11], [10, 4], [23, 4], [31, 11]], '#986f53');
    rect(c, 9, 5, 15, 1, '#c19765'); rect(c, 5, 9, 24, 1, '#b3885b');
    rect(c, 7, 16, 20, 2, '#91754c'); rect(c, x, 17, 1, 9, '#bdac7e');
    pixels(c, [[10, 29], [19, 28], [23, 31]], '#c1bea0');
  } else if (kind === 'sign') {
    rect(c, x - 1, 8, 3, y - 8, '#70573e'); rect(c, x, 8, 1, y - 8, '#a78655');
    poly(c, [[2, 6], [19, 6], [23, 10], [19, 14], [2, 14]], '#6b513b');
    poly(c, [[3, 7], [19, 7], [22, 10], [19, 12], [3, 12]], '#b8935e');
    rect(c, 5, 9, 10, 1, '#6b6344'); rect(c, 6, 11, 7, 1, '#6b6344');
  } else if (kind === 'bench') {
    oval(c, x + 1, y, 12, 3, '#4b6446');
    rect(c, 4, y - 11, 2, 12, '#614d37'); rect(c, w - 7, y - 11, 2, 12, '#614d37');
    rect(c, 2, y - 13, 24, 3, '#a78857'); rect(c, 2, y - 9, 24, 3, '#a78857');
    rect(c, 1, y - 5, 26, 4, '#70593b'); rect(c, 2, y - 5, 24, 2, '#b29a67');
  } else if (kind === 'crate') {
    oval(c, x + 1, y, 9, 3, '#4c6446'); rect(c, 2, 4, 18, 15, '#654e38');
    rect(c, 3, 5, 16, 12, '#aa8451'); rect(c, 5, 5, 2, 12, '#d0ac6d');
    rect(c, 14, 5, 2, 12, '#7c613c'); rect(c, 3, 9, 16, 2, '#775e3d');
    poly(c, [[3, 5], [7, 5], [19, 15], [19, 17], [15, 17], [3, 7]], '#c19b61');
    pixels(c, [[4, 6], [17, 6], [4, 15], [17, 15]], '#5b503c');
  } else if (kind === 'boat') {
    oval(c, x, y, 18, 3, '#356c74');
    poly(c, [[0, 11], [6, 4], [30, 4], [37, 10], [29, 17], [9, 17]], '#574e3d');
    poly(c, [[2, 10], [7, 6], [30, 6], [35, 10], [29, 15], [9, 15]], '#b28d5a');
    poly(c, [[5, 10], [9, 8], [27, 8], [32, 10], [27, 13], [10, 13]], '#6e6747');
    rect(c, 11, 6, 3, 9, '#c0a274'); rect(c, 24, 6, 3, 9, '#c0a274');
    rect(c, 18, 1, 1, 17, '#d1bc87'); rect(c, 17, 0, 3, 5, '#cab286');
  } else if (kind === 'fence') {
    rect(c, 2, 7, 28, 2, '#90754d'); rect(c, 2, 12, 28, 2, '#90754d');
    for (let i = 0; i < 4; i++) {
      const xx = 2 + i * 8; rect(c, xx, 4, 3, 14, '#6f593e');
      rect(c, xx, 3, 2, 13, '#b69b63'); rect(c, xx, 2, 2, 2, '#cbb57a');
    }
  } else if (kind === 'stump') {
    oval(c, x, y - 1, 10, 3, '#47603e');
    rect(c, 5, y - 7, 14, 7, '#70533b'); rect(c, 8, y - 6, 2, 6, '#957047');
    oval(c, x, y - 7, 8, 4, '#ba9862'); oval(c, x, y - 7, 5, 2, '#856842');
    oval(c, x, y - 7, 3, 1, '#c8ac79');
  } else if (kind === 'ruin') {
    oval(c, x, y, 24, 5, '#536b58');
    const l = 8, r = 35;
    rect(c, l, 21, 11, y - 20, '#586e66'); rect(c, r, 21, 10, y - 20, '#586e66');
    rect(c, l + 1, 22, 8, y - 22, '#9aab95'); rect(c, r + 1, 22, 7, y - 22, '#a5b39c');
    poly(c, [[7, 25], [8, 13], [16, 5], [34, 5], [44, 13], [45, 25], [35, 25], [35, 19], [30, 13], [22, 13], [18, 19], [18, 25]], '#526b64');
    poly(c, [[8, 23], [9, 14], [17, 6], [34, 6], [43, 14], [44, 23], [36, 23], [36, 18], [31, 12], [21, 12], [17, 18], [17, 23]], '#a4b29a');
    rect(c, 20, 6, 12, 2, '#c6ccb1'); rect(c, 11, 16, 5, 1, '#c6ccb1'); rect(c, 37, 18, 5, 1, '#cad0b8');
    for (let i = 0; i < 4; i++) { rect(c, 10, 25 + i * 6, 6, 1, '#718e7a'); rect(c, 37, 28 + i * 6, 5, 1, '#718e7a'); }
    rect(c, 6, y - 3, 15, 3, '#83987b'); rect(c, 33, y - 3, 13, 3, '#83987b');
    for (let i = 0; i < 16; i++) rect(c, 9 + i % 3 + (i > 9 ? 27 : 0), 13 + i * 2 % 33, 3, 2, i % 3 ? '#587d56' : '#77945e');
    rect(c, 3, y - 3, 4, 3, '#91a489'); rect(c, 24, y - 2, 5, 2, '#93a58d');
  } else if (kind === 'crystal') {
    oval(c, x, y, 13, 4, '#4f7267');
    poly(c, [[x - 4, y - 1], [x - 9, y - 22], [x - 2, 2], [x + 6, y - 20], [x + 4, y - 1]], '#2f6d77');
    poly(c, [[x - 3, y - 2], [x - 7, y - 21], [x - 2, 3], [x + 5, y - 20], [x + 3, y - 2]], '#63b7b7');
    poly(c, [[x - 2, 3], [x - 2, y - 2], [x - 7, y - 21]], '#b0e3cf');
    poly(c, [[x - 2, 3], [x + 5, y - 20], [x - 2, y - 8]], '#86d6cf');
    poly(c, [[x - 8, y], [x - 13, y - 9], [x - 10, y - 16], [x - 5, y - 10], [x - 3, y]], '#70b7aa');
    poly(c, [[x + 4, y], [x + 7, y - 16], [x + 11, y - 20], [x + 14, y - 11], [x + 10, y]], '#87ccbd');
    pixels(c, [[x - 1, 7], [x + 2, 14], [x - 10, y - 12], [x + 10, y - 16]], '#e5f2cf');
  } else if (kind === 'shrine') {
    oval(c, x, y, 16, 4, '#4d6d57'); rect(c, 3, y - 4, 30, 5, '#6a8675');
    rect(c, 5, y - 7, 26, 3, '#a9b797'); rect(c, 8, 13, 20, y - 20, '#5a786d');
    rect(c, 10, 14, 16, y - 22, '#95ab8e');
    poly(c, [[7, 15], [9, 7], [17, 2], [27, 7], [30, 15]], '#607d6b');
    poly(c, [[9, 13], [10, 8], [17, 4], [26, 8], [28, 13]], '#b4c0a1');
    poly(c, [[x, 15], [x + 6, 21], [x, 28], [x - 6, 21]], '#477a70');
    poly(c, [[x, 17], [x + 4, 21], [x, 26], [x - 4, 21]], '#8bc4ac');
    rect(c, 12, 32, 12, 1, '#c4ceb0'); pixels(c, [[11, 10], [17, 7], [24, 10]], '#d2d8b7');
    rect(c, 3, y - 3, 7, 2, '#829e68'); rect(c, 26, y - 4, 6, 2, '#779761');
  }
  return { canvas, width: w, height: h };
}

function paintGround(world: World): HTMLCanvasElement {
  const ts = world.tileSize; const [canvas, c] = makeCanvas(world.width * ts, world.height * ts);
  const get = (x: number, y: number) => x < 0 || y < 0 || x >= world.width || y >= world.height ? undefined : world.tiles[y * world.width + x];
  for (let ty = 0; ty < world.height; ty++) for (let tx = 0; tx < world.width; tx++) {
    const tile = get(tx, ty)!, x = tx * ts, y = ty * ts;
    const n = hash(tx, ty, world.seed);
    const colors = tile === 'flowers' ? palette.grass : tile === 'bridge' ? palette.water : palette[tile];
    rect(c, x, y, ts, ts, tile === 'grass' || tile === 'flowers' ? palette.grass[0] : colors[Math.floor(n * colors.length)]);
    if (tile === 'grass' || tile === 'flowers') {
      // The meadow has mottled tufts rather than visible square tile swatches.
      if (n > .35) {
        c.globalAlpha = .35;
        oval(c, x + 4 + n * 7, y + 4 + hash(tx, ty, 79) * 7, 4 + n * 2, 3, n > .7 ? '#879755' : '#658148');
        c.globalAlpha = 1;
      }
      for (let i = 0; i < 8; i++) {
        const xx = x + Math.floor(hash(tx + i * 23, ty, world.seed + 2) * ts);
        const yy = y + Math.floor(hash(tx, ty + i * 37, world.seed + 3) * ts);
        rect(c, xx, yy, i % 3 === 0 ? 2 : 1, 1, i % 2 ? '#8b9b61' : '#607944');
        if (i === 1) { rect(c, xx, yy - 1, 1, 1, '#5b7645'); rect(c, xx + 2, yy - 1, 1, 1, '#67804a'); }
        if (tile === 'flowers' && i < 3) {
          rect(c, xx, yy - 1, 1, 3, '#456e40');
          rect(c, xx - 1, yy - 2, 3, 2, ['#e5bf83', '#c6bad1', '#e4a59b'][i]);
          rect(c, xx, yy - 2, 1, 1, '#eee1a5');
        }
      }
      // Dappled, irregular edging along the village tracks.
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (get(tx + dx, ty + dy) === 'path') {
        const ex = x + (dx === 1 ? 12 : 0), ey = y + (dy === 1 ? 12 : 0);
        rect(c, ex, ey, dx ? 4 : 16, dy ? 4 : 16, '#8b915e');
        for (let j = 0; j < 5; j++) rect(c, ex + (dx ? j % 3 : j * 3), ey + (dy ? j % 3 : j * 3), 2, 2, '#74844b');
      }
    } else if (tile === 'sand' || tile === 'path') {
      for (let i = 0; i < 5; i++) {
        const xx = x + Math.floor(hash(tx + i, ty, 24) * 15), yy = y + Math.floor(hash(tx, ty + i, 67) * 15);
        rect(c, xx, yy, i % 2 + 1, 1, tile === 'sand' ? '#b5ad82' : '#998f73');
        if (i === 2) rect(c, xx, yy - 1, 2, 1, tile === 'sand' ? '#e1d1a8' : '#c9bd9b');
      }
    } else if (tile === 'stone') {
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        const nn = hash(tx * 2 + col, ty * 2 + row, 183), xx = x + col * 8, yy = y + row * 8;
        const color = nn > .7 ? '#a3ad94' : nn > .3 ? '#98a58c' : '#8d9e87';
        poly(c, [[xx + 2, yy], [xx + 6, yy], [xx + 7, yy + 2], [xx + 7, yy + 5], [xx + 5, yy + 7], [xx + 1, yy + 7], [xx, yy + 5], [xx, yy + 2]], color);
        rect(c, xx + 2, yy + 1, 4, 1, '#b4bca1');
        rect(c, xx + 1, yy + 2, 1, 2, '#aab49a');
        rect(c, xx + 2, yy + 6, 3, 1, '#7f9580');
        if (nn > .8) rect(c, xx + 4, yy + 3, 1, 1, '#bdc3a8');
        if (nn < .18) { rect(c, xx + 7, yy + 6, 2, 2, '#6d8659'); rect(c, xx + 7, yy + 7, 1, 1, '#8fa366'); }
      }
    } else if (tile === 'water' || tile === 'bridge') {
      for (let i = 0; i < 3; i++) {
        const xx = x + Math.floor(hash(tx + i * 20, ty, 20) * 10), yy = y + Math.floor(hash(tx, ty + i * 15, 30) * 16);
        rect(c, xx, yy, 3 + i, 1, i % 2 ? '#40848a' : '#32747e');
      }
      if (tile === 'water') {
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const adjacent = get(tx + dx, ty + dy);
          if (adjacent && adjacent !== 'water' && adjacent !== 'bridge') {
            const ex = x + (dx === 1 ? 13 : 0), ey = y + (dy === 1 ? 13 : 0);
            rect(c, ex, ey, dx ? 3 : ts, dy ? 3 : ts, '#6ba39b');
            rect(c, ex + (dx === 1 ? 2 : 0), ey + (dy === 1 ? 2 : 0), dx ? 1 : ts, dy ? 1 : ts, '#abc4ab');
            if (n > .3) rect(c, x + 4, y + 7, 5, 1, '#528f90');
          }
        }
      }
      if (tile === 'bridge') {
        rect(c, x, y, ts, ts, '#655d43');
        const horizontal = get(tx - 1, ty) === 'bridge' || get(tx + 1, ty) === 'bridge';
        if (horizontal) {
          for (let i = 0; i < 4; i++) {
            rect(c, x + i * 4, y + 1, 3, 14, i % 2 ? '#ae9161' : '#b79a69');
            rect(c, x + i * 4, y + 3, 1, 10, '#c0a879');
          }
          rect(c, x, y, ts, 2, '#706247'); rect(c, x, y + 14, ts, 2, '#706247');
          rect(c, x + 2, y - 1, 2, 4, '#d0b583'); rect(c, x + 2, y + 12, 2, 4, '#d0b583');
        } else {
          for (let i = 0; i < 4; i++) { rect(c, x + 1, y + i * 4, 14, 3, i % 2 ? '#aa8d5e' : '#b69a68'); rect(c, x + 3, y + i * 4, 10, 1, '#c0a879'); }
          rect(c, x, y, 2, ts, '#6b5b40'); rect(c, x + 14, y, 2, ts, '#6b5b40');
        }
      }
    }
  }
  return canvas;
}

function drawCharacter(c: Ctx, x: number, y: number, direction: number, moving: boolean, step: number, color: string, player: boolean, variant = 0) {
  x = Math.round(x); y = Math.round(y);
  const phase = Math.sin(step * 9), bob = moving && phase > .1 ? -1 : 0;
  const yy = y + bob;
  oval(c, x, y - 1, 6, 2, '#405b42');
  const leg = moving ? Math.round(phase * 2) : 0;
  rect(c, x - 4, yy - 5, 3, 4 + leg, '#45514a'); rect(c, x + 1, yy - 5, 3, 4 - leg, '#45514a');
  rect(c, x - 4, yy - 2 + leg, 3, 2, '#4a4136'); rect(c, x + 1, yy - 2 - leg, 3, 2, '#4a4136');
  poly(c, [[x - 5, yy - 14], [x + 4, yy - 14], [x + 5, yy - 5], [x - 5, yy - 5]], '#354539');
  rect(c, x - 4, yy - 13, 8, 8, color);
  rect(c, x - 3, yy - 12, 3, 6, player ? '#91aaa1' : '#b1b49b');
  if (player) {
    if (direction === 3) {
      poly(c, [[x - 5, yy - 14], [x + 4, yy - 14], [x + 5, yy - 5], [x + 1, yy - 4], [x - 5, yy - 6]], '#b47e51');
      rect(c, x - 4, yy - 13, 6, 1, '#d4a26c'); rect(c, x - 2, yy - 11, 1, 5, '#cb9b60');
    } else {
      rect(c, x - 4, yy - 13, 7, 2, '#d7b47a'); rect(c, x + 2, yy - 11, 1, 6, '#c9a067');
      rect(c, x - 5, yy - 9, 4, 5, '#7c5940'); rect(c, x - 4, yy - 8, 3, 3, '#bd9258');
      rect(c, x - 3, yy - 8, 1, 1, '#e0bf82');
    }
  }
  rect(c, x - 6, yy - 12 + (moving ? leg : 0), 2, 6, '#37493a');
  rect(c, x + 4, yy - 12 - (moving ? leg : 0), 2, 6, '#37493a');
  rect(c, x - 6, yy - 8 + (moving ? leg : 0), 2, 2, '#d6b38c');
  rect(c, x + 4, yy - 8 - (moving ? leg : 0), 2, 2, '#d6b38c');
  rect(c, x - 4, yy - 21, 8, 8, '#59483a');
  rect(c, x - 3, yy - 20, 6, 6, '#e4c39a'); rect(c, x - 2, yy - 20, 4, 5, '#efd5aa');
  const hair = player ? '#eee3bf' : ['#665446', '#c9b79a', '#ab7053', '#8c8066'][variant % 4];
  rect(c, x - 4, yy - 21, 8, 3, hair); rect(c, x - 5, yy - 19, 2, 4, hair);
  rect(c, x + 3, yy - 19, 2, 3, hair); rect(c, x - 2, yy - 22, 5, 1, hair);
  if (player) { rect(c, x - 2, yy - 21, 3, 1, '#fff1cf'); rect(c, x + 2, yy - 22, 2, 1, '#d1c6a6'); }
  if (direction === 3) {
    rect(c, x - 3, yy - 18, 7, 4, hair); rect(c, x - 2, yy - 14, 4, 1, '#b7a685');
  } else if (direction === 1) {
    rect(c, x - 4, yy - 17, 1, 1, '#394742'); rect(c, x - 5, yy - 16, 1, 1, '#dbba90');
    rect(c, x + 1, yy - 18, 3, 5, hair);
  } else if (direction === 2) {
    rect(c, x + 2, yy - 17, 1, 1, '#394742'); rect(c, x + 3, yy - 16, 1, 1, '#dbba90');
    rect(c, x - 4, yy - 18, 3, 5, hair);
  } else {
    pixels(c, [[x - 2, yy - 17], [x + 1, yy - 17]], '#36443c'); rect(c, x - 1, yy - 14, 2, 1, '#bb8d70');
  }
  if (player) {
    rect(c, x - 3, yy - 14, 6, 2, '#e9c790'); rect(c, x + 3, yy - 13, 2, 4, '#d6ad73');
    rect(c, x - 5, yy - 21, 1, 3, '#6f8e74'); rect(c, x - 6, yy - 24, 1, 4, '#becf9a');
    rect(c, x - 7, yy - 23, 1, 2, '#e5d9a3');
  } else if (variant % 3 === 0) {
    rect(c, x - 6, yy - 21, 12, 2, '#74634d'); rect(c, x - 3, yy - 24, 7, 4, '#b5a17a');
    rect(c, x - 3, yy - 21, 7, 1, '#81684e');
  }
}

export function createRenderer(canvas: HTMLCanvasElement, world: World): Renderer {
  let width = 1, height = 1, destroyed = false, lastScale = 0;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let ctx = canvas.getContext('2d', { alpha: false })!;
  const ground = paintGround(world), sprites = new Map<string, Sprite>();
  canvas.style.imageRendering = 'pixelated';
  for (const prop of world.props) {
    const key = `${prop.kind}:${prop.variant % 6}`;
    if (!sprites.has(key)) sprites.set(key, paintProp(prop.kind, prop.variant % 6));
  }
  const ts = world.tileSize;
  const location = (state: RenderState) => ({
    x: Math.round(state.camera.x - Math.ceil(width / state.zoom) / 2),
    y: Math.round(state.camera.y - Math.ceil(height / state.zoom) / 2),
  });
  function glow(x: number, y: number, radius: number, rgb: string, strength: number) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(${rgb},${strength})`); g.addColorStop(.25, `rgba(${rgb},${strength * .55})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(Math.floor(x - radius), Math.floor(y - radius), radius * 2, radius * 2);
  }
  function render(state: RenderState) {
    if (destroyed) return;
    const zoom = Math.max(1, state.zoom), vw = Math.ceil(width / zoom), vh = Math.ceil(height / zoom);
    if (zoom !== lastScale || canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw; canvas.height = vh; ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.imageSmoothingEnabled = false; lastScale = zoom;
    }
    const cam = location(state), reducedMotion = motionPreference.matches, t = reducedMotion ? 0 : state.time / 1000;
    rect(ctx, 0, 0, vw, vh, '#48777a');
    ctx.drawImage(ground, -cam.x, -cam.y);
    const sx = Math.max(0, Math.floor(cam.x / ts) - 1), ex = Math.min(world.width, Math.ceil((cam.x + vw) / ts) + 1);
    const sy = Math.max(0, Math.floor(cam.y / ts) - 1), ey = Math.min(world.height, Math.ceil((cam.y + vh) / ts) + 1);
    // Individual reflected lines slide, pause and fade instead of a repeated texture.
    for (let ty = sy; ty < ey; ty++) for (let tx = sx; tx < ex; tx++) {
      if (world.tiles[ty * world.width + tx] !== 'water') continue;
      const n = hash(tx, ty, 239), wave = Math.sin(t * 1.2 + n * 30);
      if (n < .42 && wave > -.3) {
        ctx.globalAlpha = .18 + Math.max(0, wave) * .23;
        const xx = tx * ts - cam.x + 2 + Math.round(Math.sin(t * .6 + n * 10) * 2), yy = ty * ts - cam.y + Math.floor(n * 13);
        rect(ctx, xx, yy, 4 + Math.round(n * 8), 1, '#b4d3bb');
        if (n < .18) rect(ctx, xx + 2, yy + 2, 3, 1, '#6ab6b0');
      }
    }
    ctx.globalAlpha = 1;
    // Broad cloud shadows make the ground breathe while leaving the sprite colors intact.
    if (state.weather !== 'rain') {
      ctx.globalAlpha = .06;
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 297 + t * 3 - cam.x * .4) % (vw + 230)) - 100;
        oval(ctx, cx, i * 123 - cam.y * .15 % 180, 72, 22, '#243e3a');
        oval(ctx, cx + 46, i * 123 + 13 - cam.y * .15 % 180, 59, 20, '#243e3a');
      }
      ctx.globalAlpha = 1;
    }
    const drawables: { y: number; draw: () => void }[] = [];
    const visibleProps: WorldProp[] = [];
    for (const p of world.props) {
      const sprite = sprites.get(`${p.kind}:${p.variant % 6}`)!;
      if (p.x < cam.x - sprite.width || p.x > cam.x + vw + sprite.width || p.y < cam.y - 8 || p.y > cam.y + vh + sprite.height) continue;
      visibleProps.push(p);
      drawables.push({ y: p.y, draw: () => ctx.drawImage(sprite.canvas, Math.round(p.x - cam.x - sprite.width / 2), Math.round(p.y - cam.y - sprite.height + 3)) });
    }
    world.npcs.forEach((npc, i) => {
      const pos = state.npcPositions?.get(npc.id) ?? npc;
      if (Math.abs(pos.x - state.camera.x) > vw / 2 + 30 || Math.abs(pos.y - state.camera.y) > vh / 2 + 30) return;
      drawables.push({ y: pos.y, draw: () => {
        const moving = !!state.npcPositions && Math.abs(pos.x - npc.x) + Math.abs(pos.y - npc.y) > 2;
        drawCharacter(ctx, pos.x - cam.x, pos.y - cam.y, i % 2 ? 0 : 1, moving && !reducedMotion, t * .5 + i, npc.color, false, i);
        if (Math.hypot(pos.x - state.player.x, pos.y - state.player.y) < 39) {
          const xx = Math.round(pos.x - cam.x), yy = Math.round(pos.y - cam.y - 29 + Math.sin(t * 3) * .5);
          rect(ctx, xx - 4, yy - 5, 8, 7, '#f1dfb3'); rect(ctx, xx - 3, yy - 6, 6, 9, '#f1dfb3');
          rect(ctx, xx - 1, yy + 2, 2, 2, '#f1dfb3'); pixels(ctx, [[xx - 2, yy - 2], [xx, yy - 2], [xx + 2, yy - 2]], '#806f4a');
        }
      } });
    });
    drawables.push({ y: state.player.y, draw: () => drawCharacter(ctx, state.player.x - cam.x, state.player.y - cam.y, state.player.direction, state.player.moving && !reducedMotion, state.player.step, '#698a7a', true) });
    drawables.sort((a, b) => a.y - b.y);
    drawables.forEach(d => d.draw());
    // Chimney smoke is kept sparse and made of little stepped translucent puffs.
    for (const p of visibleProps) if (p.kind === 'house' || p.kind === 'inn') {
      const [pw, ph] = spriteSize(p.kind), xx = p.x + pw / 2 - (p.kind === 'inn' ? 25 : 26) - cam.x;
      for (let i = 0; i < 3; i++) {
        const age = (t * .35 + i / 3 + p.variant * .1) % 1;
        ctx.globalAlpha = .15 * (1 - age);
        oval(ctx, xx + Math.sin(age * 5) * 3 + age * 7, p.y - ph + 5 - age * 18 - cam.y, 2 + age * 3, 2 + age, '#ede6c6');
      }
      ctx.globalAlpha = 1;
    }
    if (state.target) {
      const xx = Math.round(state.target.x - cam.x), yy = Math.round(state.target.y - cam.y), r = 6 + Math.round(Math.sin(t * 5));
      ctx.globalAlpha = .75;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        rect(ctx, xx + dx * r - (dx < 0 ? 0 : 2), yy + dy * r, 3, 1, '#f4dfab');
        rect(ctx, xx + dx * r, yy + dy * r - (dy < 0 ? 0 : 2), 1, 3, '#f4dfab');
      }
      rect(ctx, xx, yy, 1, 1, '#f4dfab'); ctx.globalAlpha = 1;
    }
    const shade = state.timeOfDay === 'night' ? .48 : state.timeOfDay === 'dusk' ? .13 : 0;
    if (shade) { ctx.globalAlpha = shade; rect(ctx, 0, 0, vw, vh, state.timeOfDay === 'night' ? '#172842' : '#9b6c50'); ctx.globalAlpha = 1; }
    if (state.weather === 'rain') {
      ctx.globalAlpha = .13; rect(ctx, 0, 0, vw, vh, '#2c505d'); ctx.globalAlpha = 1;
    }
    const lightPower = state.timeOfDay === 'night' ? .7 : state.timeOfDay === 'dusk' ? .5 : .13;
    ctx.globalCompositeOperation = 'screen';
    for (const p of visibleProps) {
      const xx = p.x - cam.x, yy = p.y - cam.y;
      if (p.kind === 'lantern') { glow(xx, yy - 23, 32, '255,191,89', lightPower); glow(xx, yy - 1, 19, '239,185,91', lightPower * .23); }
      if (p.kind === 'house') glow(xx - 11, yy - 16, 24, '255,198,110', lightPower * .7);
      if (p.kind === 'inn') { glow(xx - 20, yy - 20, 30, '255,194,98', lightPower * .8); glow(xx + 19, yy - 20, 30, '255,194,98', lightPower * .8); }
      if (p.kind === 'crystal') glow(xx, yy - 17, 20, '86,210,194', .17 + shade * .3);
      if (p.kind === 'shrine') glow(xx, yy - 21, 14, '146,216,174', .12 + shade * .2);
      if (p.kind === 'tower' && state.lighthouseLit) {
        glow(xx, yy - 90, 42, '255,224,156', .45);
        const angle = t * .17, radius = 290;
        ctx.globalAlpha = .1 + shade * .14;
        poly(ctx, [[xx, yy - 90], [xx + Math.cos(angle - .12) * radius, yy - 90 + Math.sin(angle - .12) * radius * .36], [xx + Math.cos(angle + .12) * radius, yy - 90 + Math.sin(angle + .12) * radius * .36]], '#ffe6ab');
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const [i, wisp] of world.wisps.entries()) {
      if (state.collected.has(wisp.id)) continue;
      const xx = Math.round(wisp.x - cam.x), yy = Math.round(wisp.y - cam.y - 13 + Math.sin(t * 2 + i) * 3);
      if (xx < -40 || yy < -40 || xx > vw + 40 || yy > vh + 40) continue;
      ctx.globalCompositeOperation = 'screen'; glow(xx, yy, 22 + Math.sin(t * 2) * 3, i % 2 ? '115,233,209' : '255,214,139', .32); ctx.globalCompositeOperation = 'source-over';
      oval(ctx, xx, yy + 15, 4, 1, '#668854');
      const col = i % 2 ? '#97ead7' : '#f2cb83';
      rect(ctx, xx - 2, yy - 2, 5, 5, col); rect(ctx, xx - 1, yy - 3, 3, 7, col);
      rect(ctx, xx - 1, yy - 1, 3, 3, '#fff0b9'); rect(ctx, xx, yy - 2, 1, 3, '#ffffdb');
      for (let p = 0; p < 5; p++) {
        const a = t + p * 1.25 + i, px = Math.round(xx + Math.cos(a) * (9 + p)), py = Math.round(yy + Math.sin(a) * (3 + p));
        ctx.globalAlpha = .4 + .3 * Math.sin(a); rect(ctx, px, py, 1, 1, col);
      }
      ctx.globalAlpha = 1;
    }
    // Fireflies drift in world space so camera movement never resets their paths.
    for (let i = 0; i < 45; i++) {
      const px = hash(i, 88, world.seed) * world.width * ts + Math.sin(t * .3 + i) * 8;
      const py = hash(i, 35, world.seed) * world.height * ts + Math.cos(t * .4 + i) * 6;
      const xx = px - cam.x, yy = py - cam.y;
      if (xx < 0 || yy < 0 || xx >= vw || yy >= vh) continue;
      const flicker = Math.max(0, Math.sin(t * 1.1 + i * 3));
      ctx.globalAlpha = flicker * (state.timeOfDay === 'day' ? .45 : .8);
      rect(ctx, xx, yy, 1, 1, '#fae7a4'); ctx.globalAlpha = 1;
      if (flicker > .7) { ctx.globalCompositeOperation = 'screen'; glow(xx, yy, 5, '242,227,135', flicker * .16); ctx.globalCompositeOperation = 'source-over'; }
    }
    for (let i = 0; i < 11; i++) {
      const xx = ((hash(i, 91, 44) * 2000 + t * (7 + i % 3) - cam.x) % (vw + 120) + vw + 120) % (vw + 120) - 60;
      const yy = ((hash(i, 17, 76) * 1700 + t * 3 + Math.sin(t + i) * 6 - cam.y) % (vh + 70) + vh + 70) % (vh + 70) - 35;
      ctx.globalAlpha = .45; rect(ctx, xx, yy, 2, 1, '#d1c28c'); rect(ctx, xx + 1, yy + 1, 1, 1, '#8b955c'); ctx.globalAlpha = 1;
    }
    if (state.weather === 'rain') {
      ctx.globalAlpha = .5;
      for (let i = 0; i < 90; i++) {
        const xx = ((hash(i, 29, 99) * (vw + 30) - t * 37) % (vw + 30) + vw + 30) % (vw + 30) - 15;
        const yy = ((hash(i, 58, 75) * (vh + 30) + t * 130) % (vh + 30)) - 15;
        const col = i % 3 ? '#a6c7c0' : '#c2d5c3';
        for (let j = 0; j < 4; j++) rect(ctx, xx - Math.floor(j / 2), yy + j * 2, 1, 2, col);
      }
      ctx.globalAlpha = .2;
      for (let i = 0; i < 12; i++) {
        const age = (t * 1.6 + i * .173) % 1, xx = hash(i, 82, 15) * vw, yy = hash(i, 34, 35) * vh;
        const r = 1 + Math.floor(age * 3); rect(ctx, xx - r, yy, r * 2, 1, '#d0ddd2'); rect(ctx, xx, yy - 1, 1, 1, '#d0ddd2');
      }
      ctx.globalAlpha = 1;
    }
    if (state.weather === 'mist') {
      for (let i = 0; i < 5; i++) {
        const yy = (i * 61 + Math.sin(t * .1 + i) * 14 - cam.y * .14) % (vh + 90);
        const g = ctx.createLinearGradient(0, yy - 24, 0, yy + 24);
        g.addColorStop(0, 'rgba(222,232,205,0)'); g.addColorStop(.5, 'rgba(222,232,205,.13)'); g.addColorStop(1, 'rgba(222,232,205,0)');
        ctx.fillStyle = g; ctx.fillRect(0, yy - 24, vw, 48);
      }
    }
  }
  return {
    resize(w, h) { width = Math.max(1, w); height = Math.max(1, h); lastScale = 0; },
    render,
    screenToWorld(x, y, state) { const cam = location(state); return { x: cam.x + x / state.zoom, y: cam.y + y / state.zoom }; },
    renderMap(mapCanvas, state, discovered) {
      const mw = mapCanvas.width, mh = mapCanvas.height, c = mapCanvas.getContext('2d')!;
      c.imageSmoothingEnabled = false; rect(c, 0, 0, mw, mh, '#192c2b');
      const scale = Math.min((mw - 24) / world.width, (mh - 24) / world.height);
      const ox = (mw - world.width * scale) / 2, oy = (mh - world.height * scale) / 2;
      const colors = { grass: '#70854f', flowers: '#82955b', sand: '#c3b78b', path: '#b2a47e', stone: '#9ba78d', bridge: '#bda075', water: '#487e84' };
      for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[y * world.width + x]; c.fillStyle = colors[tile];
        c.fillRect(Math.floor(ox + x * scale), Math.floor(oy + y * scale), Math.ceil(scale), Math.ceil(scale));
      }
      for (const p of world.props) {
        if (p.kind !== 'tree' && p.kind !== 'pine' && p.kind !== 'willow' && p.kind !== 'house' && p.kind !== 'inn') continue;
        const xx = Math.round(ox + p.x / ts * scale), yy = Math.round(oy + p.y / ts * scale);
        if (p.kind === 'house' || p.kind === 'inn') { rect(c, xx - 2, yy - 3, 5, 4, '#c6b891'); rect(c, xx - 2, yy - 4, 5, 2, p.variant % 3 === 1 ? '#8e7787' : '#aa7356'); }
        else rect(c, xx - 1, yy - 2, 3, 3, p.kind === 'pine' ? '#345f48' : '#456a43');
      }
      for (const lm of world.landmarks) {
        const xx = Math.round(ox + lm.x / ts * scale), yy = Math.round(oy + lm.y / ts * scale), found = discovered.has(lm.id);
        oval(c, xx, yy, 6, 6, '#253d37'); oval(c, xx, yy, 5, 5, found ? '#dfbe7b' : '#85927a');
        rect(c, xx - 1, yy - 2, 3, 4, found ? '#364f42' : '#465b4b'); rect(c, xx, yy + 3, 1, 1, '#364f42');
      }
      for (const wisp of world.wisps) if (!state.collected.has(wisp.id)) {
        const xx = ox + wisp.x / ts * scale, yy = oy + wisp.y / ts * scale;
        pixels(c, [[Math.round(xx), Math.round(yy - 1)], [Math.round(xx - 1), Math.round(yy)], [Math.round(xx + 1), Math.round(yy)], [Math.round(xx), Math.round(yy + 1)]], '#f1db9d');
      }
      const px = Math.round(ox + state.player.x / ts * scale), py = Math.round(oy + state.player.y / ts * scale);
      oval(c, px, py, 5, 5, '#294d46'); oval(c, px, py, 3, 3, '#f7e5b8'); pixels(c, [[px, py]], '#bd875c');
      // Handmade map border, north tick and four corner registration marks.
      for (const [xx, yy, dx, dy] of [[4, 4, 1, 1], [mw - 5, 4, -1, 1], [4, mh - 5, 1, -1], [mw - 5, mh - 5, -1, -1]]) {
        rect(c, xx + (dx < 0 ? -7 : 0), yy, 8, 1, '#769079'); rect(c, xx, yy + (dy < 0 ? -7 : 0), 1, 8, '#769079');
      }
      poly(c, [[mw - 17, 17], [mw - 20, 24], [mw - 17, 22], [mw - 14, 24]], '#e6d39b');
    },
    destroy() { destroyed = true; sprites.clear(); ground.width = 1; ground.height = 1; },
  };
}
