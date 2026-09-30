import type { Landmark, PropKind, Tile, World, WorldProp } from './types';

const WIDTH = 110;
const HEIGHT = 90;
const TILE_SIZE = 16;
type Point = { x: number; y: number };
const center = (x: number, y: number): Point => ({ x: (x + .5) * TILE_SIZE, y: (y + .5) * TILE_SIZE });

/** A small, stable generator keeps every saved island exactly where its traveller left it. */
function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const footprints: Partial<Record<PropKind, { halfWidth: number; height: number }>> = {
  tree: { halfWidth: 5.5, height: 10 }, pine: { halfWidth: 5, height: 10 },
  willow: { halfWidth: 7, height: 10 }, house: { halfWidth: 23, height: 27 },
  inn: { halfWidth: 30, height: 32 }, tower: { halfWidth: 16, height: 26 },
  rock: { halfWidth: 8, height: 10 }, well: { halfWidth: 9, height: 11 },
  ruin: { halfWidth: 14, height: 16 }, shrine: { halfWidth: 12, height: 14 },
  fence: { halfWidth: 10, height: 5 }, crate: { halfWidth: 7, height: 10 },
  bench: { halfWidth: 11, height: 7 }, stump: { halfWidth: 6, height: 7 },
};

/** The paths and architecture are authored; the seed varies the living details around them. */
export function generateWorld(seed = 72819): World {
  const random = randomSource(seed);
  const tiles: Tile[] = Array(WIDTH * HEIGHT).fill('water');
  const props: WorldProp[] = [];
  const reserved = new Set<number>();
  const occupied = new Set<number>();
  const index = (x: number, y: number) => y * WIDTH + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
  const get = (x: number, y: number): Tile => inside(x, y) ? tiles[index(x, y)] : 'water';
  const put = (x: number, y: number, tile: Tile) => { if (inside(x, y)) tiles[index(x, y)] = tile; };
  const ellipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;

  // A scalloped main island, a separate lighthouse isle, and two quiet offshore outcrops.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const scallop = .075 * Math.sin(x * .39 + y * .14) + .055 * Math.cos(y * .48 - x * .15);
      const mainland = (ellipse(x, y, 47, 43, 35.5, 34.5) < 1 + scallop ||
        ellipse(x, y, 28, 25, 19, 16) < 1 + scallop ||
        ellipse(x, y, 26, 65, 17, 12) < 1 + scallop) && x < 82 + Math.sin(y * .2);
      const lighthouseIsland = ellipse(x, y, 94, 68, 10, 13.5) < .96 + scallop;
      const outcrop = ellipse(x, y, 9, 31, 3, 3.5) < .85 || ellipse(x, y, 94, 18, 4.5, 3) < .9;
      if (mainland || lighthouseIsland || outcrop) put(x, y, 'grass');
    }
  }

  // The Silverthread river begins in the mountains and spills into the southern sea.
  for (let y = 0; y < HEIGHT; y++) {
    const riverX = 60 + Math.sin(y * .13) * 2.5 + Math.sin(y * .047) * 1.3;
    for (let x = Math.floor(riverX - 2.1); x <= Math.ceil(riverX + 2.1); x++) put(x, y, 'water');
  }
  for (let y = 50; y <= 61; y++) {
    for (let x = 19; x <= 34; x++) {
      if (ellipse(x, y, 26.5, 56, 6.3, 4.4) < 1 + Math.sin(y + x * .7) * .08) put(x, y, 'water');
    }
  }

  // Pale shoreline tiles describe every bend in the coast and the riverbanks.
  const land = tiles.slice();
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (land[index(x, y)] === 'water') continue;
      let shoreline = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (land[index(x + dx, y + dy)] === 'water') shoreline = true;
      }
      if (shoreline) put(x, y, 'sand');
      else if (Math.sin(x * .29 + y * .33) + Math.cos(x * .21 - y * .26) > 1.6 && y > 34 && x < 58) put(x, y, 'flowers');
    }
  }

  const reserve = (x: number, y: number, radius = 2) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (inside(x + dx, y + dy)) reserved.add(index(x + dx, y + dy));
    }
  };
  const stampRoad = (x: number, y: number, width: number) => {
    for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > width || !inside(x + dx, y + dy)) continue;
      const prior = get(x + dx, y + dy);
      put(x + dx, y + dy, prior === 'water' || prior === 'bridge' ? 'bridge' : 'path');
    }
    reserve(x, y, width + 1);
  };
  const route = (points: number[][], width = 1) => {
    for (let n = 0; n < points.length - 1; n++) {
      let [x, y] = points[n];
      const [tx, ty] = points[n + 1];
      const dx = Math.abs(tx - x), dy = -Math.abs(ty - y);
      const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
      let error = dx + dy;
      while (true) {
        stampRoad(x, y, width);
        if (x === tx && y === ty) break;
        const twice = 2 * error;
        if (twice >= dy) { error += dy; x += sx; }
        if (twice <= dx) { error += dx; y += sy; }
      }
    }
  };

  // Village square and the four welcoming routes out of it.
  for (let y = 40; y <= 48; y++) for (let x = 40; x <= 48; x++) {
    put(x, y, x === 40 || x === 48 || y === 40 || y === 48 ? 'path' : 'stone');
    reserve(x, y, 1);
  }
  route([[44, 40], [44, 35], [40, 32], [32, 32], [28, 27], [26, 22]]);
  route([[32, 32], [32, 28]]);
  route([[44, 35], [53, 35], [68, 35], [73, 30], [77, 25]]);
  route([[44, 48], [44, 58], [54, 58], [68, 58], [75, 58], [78, 62], [87, 62], [92, 65], [92, 68]]);
  route([[44, 58], [38, 63], [30, 65], [23, 68]]);
  route([[30, 65], [33, 62], [33, 57], [28, 57]], 0);
  route([[68, 58], [72, 66], [74, 70]], 0);
  route([[40, 44], [35, 44]], 0);
  route([[48, 45], [53, 45]], 0);

  // An old mosaic courtyard and a white-sand lighthouse approach.
  for (let y = 21; y <= 29; y++) for (let x = 73; x <= 81; x++) {
    if (get(x, y) !== 'water' && ellipse(x, y, 77, 25, 4.5, 4.5) < 1) {
      put(x, y, (x + y) % 7 === 0 ? 'grass' : 'stone');
      reserve(x, y, 1);
    }
  }
  for (let y = 65; y <= 71; y++) for (let x = 89; x <= 96; x++) {
    if (get(x, y) !== 'water' && ellipse(x, y, 92, 68, 4.1, 3.5) < 1) {
      put(x, y, 'stone'); reserve(x, y, 1);
    }
  }

  let serial = 0;
  const prop = (kind: PropKind, x: number, y: number, solid = false, variant?: number, name?: string) => {
    const p: WorldProp = { id: `${kind}-${serial++}`, kind, ...center(x, y), variant: variant ?? Math.floor(random() * 4), solid };
    if (name) p.name = name;
    props.push(p); occupied.add(index(x, y));
    if (solid) reserve(x, y, kind === 'house' || kind === 'inn' ? 3 : 1);
  };

  prop('inn', 44, 34, true, 0, 'The Copper Kettle');
  prop('house', 37, 39, true, 0, 'Moss & Mending');
  prop('house', 51, 40, true, 1, 'The Mapmaker’s Loft');
  prop('house', 37, 49, true, 2, 'Bramble Bakery');
  prop('house', 51, 50, true, 3, 'Fern Cottage');
  prop('well', 44, 43, true, 0, 'The Wishwell');
  prop('bench', 41, 46, true, 0); prop('bench', 47, 46, true, 1);
  prop('sign', 40, 38, false, 0, 'Hearthwick');
  prop('sign', 46, 52, false, 1, 'Willowmere ←   Starfall →');
  prop('crate', 41, 34, true, 0); prop('crate', 38, 49, true, 1);
  for (const [x, y] of [[39, 40], [49, 40], [39, 48], [49, 48], [43, 36], [45, 36], [52, 35], [68, 35], [54, 58], [68, 58], [78, 61], [87, 63]]) prop('lantern', x, y);
  for (const [x, y] of [[34, 38], [34, 40], [54, 39], [54, 41], [34, 48], [34, 50], [54, 49], [54, 51]]) prop('fence', x, y, true);
  for (const [x, y] of [[37, 41], [51, 42], [37, 51], [51, 52], [42, 38], [46, 38]]) {
    prop('flower', x, y, false, 2); prop('bush', x + .6, y + .3, false, 1);
  }

  prop('shrine', 77, 21, true, 0, 'The Celestial Needle');
  prop('ruin', 73, 23, true, 0); prop('ruin', 81, 24, true, 1);
  prop('ruin', 74, 29, true, 2); prop('ruin', 80, 29, true, 3);
  for (const [x, y] of [[75, 22], [79, 22], [73, 26], [81, 27], [78, 28]]) prop('crystal', x, y, false);
  prop('sign', 72, 31, false, 2, 'Starfall Sanctuary');
  prop('tower', 94, 70, true, 0, 'The Lastlight');
  prop('bench', 91, 71, true, 1); prop('crate', 96, 71, true, 0);
  prop('lantern', 89, 67); prop('lantern', 96, 66);
  prop('sign', 88, 64, false, 3, 'Lastlight Isle');
  prop('boat', 28, 58, false, 0, 'The Minnow');
  prop('crate', 33, 58, true, 1); prop('lantern', 33, 60);
  prop('sign', 31, 64, false, 1, 'Willowmere Reach');
  prop('stump', 24, 69, true, 1); prop('bench', 22, 67, true, 2);
  prop('sign', 28, 31, false, 0, 'Whisperpine Glen');
  prop('stump', 29, 25, true, 0);
  // The mooncap circle has a deliberately open southern entrance.
  for (let n = 0; n < 11; n++) {
    const angle = n / 12 * Math.PI * 2;
    prop('mushroom', 32 + Math.cos(angle) * 2.35, 27.5 + Math.sin(angle) * 2.35, false, n % 4);
  }

  const wisps = [
    { id: 'wisp-hearth', ...center(42, 42), name: 'Ember of Welcome' },
    { id: 'wisp-pine', ...center(26, 22), name: 'Pineheart Whisper' },
    { id: 'wisp-mooncap', ...center(32, 28), name: 'Mooncap Dream' },
    { id: 'wisp-reed', ...center(23, 68), name: 'Reedsong Echo' },
    { id: 'wisp-star', ...center(77, 24), name: 'Fallen Starlight' },
    { id: 'wisp-tide', ...center(92, 65), name: 'The Tide’s Promise' },
  ];
  for (const wisp of wisps) reserve(Math.floor(wisp.x / TILE_SIZE), Math.floor(wisp.y / TILE_SIZE), 2);

  // Density, species, and little ground details change noticeably between regions.
  for (let y = 8; y < HEIGHT - 5; y++) for (let x = 5; x < WIDTH - 5; x++) {
    const tile = get(x, y);
    if (tile === 'water' || tile === 'bridge' || tile === 'path' || tile === 'stone' || occupied.has(index(x, y))) continue;
    const forest = x < 48 && y < 35;
    const marsh = x < 39 && y > 52;
    const ruins = x > 69 && y < 34;
    const island = x > 84 && y > 48;
    const r = random();
    if (!reserved.has(index(x, y))) {
      if (forest && r < .13) { prop(random() < .77 ? 'pine' : 'tree', x, y, true); continue; }
      if (marsh && r < .04) { prop('willow', x, y, true); continue; }
      if (!forest && !marsh && !ruins && !island && tile === 'grass' && r < .036) { prop('tree', x, y, true); continue; }
      if (tile === 'sand' && r < .055 || ruins && r < .026 || island && r < .036) { prop('rock', x, y, true); continue; }
    }
    // Non-solid undergrowth can fringe trails without spoiling movement.
    if (marsh && r < .18) prop('reed', x, y);
    else if (forest && r < .21) prop(random() < .6 ? 'mushroom' : 'bush', x, y);
    else if (ruins && r < .08) prop(random() < .4 ? 'crystal' : 'bush', x, y);
    else if (tile === 'flowers' && r < .29 || !island && r < .055) prop('flower', x, y);
    else if (r > .975) prop('bush', x, y);
  }
  // Reeds grow out into the shallows rather than ending abruptly at the shoreline.
  for (let y = 52; y <= 61; y++) for (let x = 19; x <= 33; x++) {
    if (get(x, y) === 'water' && random() < .17 && [get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)].some(t => t !== 'water')) prop('reed', x, y);
  }

  const landmarks: Landmark[] = [
    { id: 'hearthwick', name: 'Hearthwick', subtitle: 'A little warmth at the edge of the sea', ...center(44, 44), radius: 155, biome: 'village', description: 'Copper roofs, fresh bread, and a wishwell worn smooth by hopeful hands. Every window keeps a lantern for someone coming home.' },
    { id: 'whisperpine', name: 'Whisperpine Glen', subtitle: 'Where the forest remembers your name', ...center(28, 25), radius: 180, biome: 'forest', description: 'Ancient pines shelter a ring of mooncap mushrooms. Stand still for a moment: the little lights between the branches seem to be listening.' },
    { id: 'willowmere', name: 'Willowmere Reach', subtitle: 'Soft reeds and slower afternoons', ...center(25, 65), radius: 160, biome: 'marsh', description: 'Willows trail silver leaves over mirror-dark water. A weathered rowboat waits at the dock, while frogs trade secrets in the reeds.' },
    { id: 'starfall', name: 'Starfall Sanctuary', subtitle: 'A cathedral built by a fallen star', ...center(77, 25), radius: 140, biome: 'ruins', description: 'Moss has softened the old stonework, but the crystals still hum. The shrine once caught starlight and poured it into the village lanterns.' },
    { id: 'lighthouse', name: 'Lastlight Isle', subtitle: 'Bring the wandering lights home', ...center(92, 68), radius: 140, biome: 'coast', description: 'The Lastlight has guided travellers for a hundred years. Tonight its heart is quiet. Six wandering wisps can kindle its beacon once more.' },
  ];
  const npcs = [
    { id: 'mira', name: 'Mira', role: 'Lantern keeper', ...center(46, 42), color: '#e7a25b', lines: [
      'Welcome to Hearthwick, wanderer. I was hoping the paths would bring us someone kind.',
      'The Lastlight has gone dark. Its six little wisps have scattered across the isles. Will you bring them home?',
      'Listen for their glow: the square, the pines, the mooncap ring, the reeds, the old shrine, and the lighthouse shore.',
      'When you have all six, follow the southern bridges to Lastlight Isle. A small light can carry a very long way.',
    ] },
    { id: 'pip', name: 'Pip', role: 'Mushroom enthusiast', ...center(30, 30), color: '#a7bf75', lines: [
      'Shhh. The mooncaps are dreaming. I am conducting very serious mushroom research.',
      'One blue wisp curled up inside their circle. Another likes the pines farther northwest.',
      'I counted the mushrooms three times and got three different answers. That is how you know it is magic.',
    ] },
    { id: 'tavi', name: 'Tavi', role: 'Reedboat captain', ...center(31, 62), color: '#79b9c8', lines: [
      'The Minnow is the finest boat on this pond. Also the only boat. Both facts can be true.',
      'A wisp has been singing in the reeds southwest of here. I think it misses the lighthouse.',
      'Take your time in Willowmere. The frogs charge extra for rushing.',
    ] },
    { id: 'orin', name: 'Orin', role: 'Keeper of old stories', ...center(76, 27), color: '#c1a4d9', lines: [
      'These stones remember a sky with two moons. I remember where I put my tea, sometimes.',
      'The star crystals protect a wandering light. It is waiting just south of the shrine.',
      'The wisps were never lost. They were simply reminding us to look at the world again.',
    ] },
    { id: 'nell', name: 'Nell', role: 'Lastlight watchkeeper', ...center(90, 69), color: '#e9cb78', lines: [
      'I keep watch even when the beacon sleeps. Especially then.',
      'Find all six wisps, then come close to the tower. The light will know what to do.',
      'Beyond that blue horizon, someone is waiting to see our lantern again.',
    ] },
  ];
  for (const npc of npcs) {
    // Authored NPC positions are kept free of solid roots and rocks.
    const gx = Math.floor(npc.x / TILE_SIZE), gy = Math.floor(npc.y / TILE_SIZE);
    for (let n = props.length - 1; n >= 0; n--) {
      const p = props[n];
      if (p.solid && !['house', 'inn', 'tower', 'shrine', 'well', 'ruin'].includes(p.kind) && Math.abs(p.x - npc.x) < 22 && Math.abs(p.y - npc.y) < 22) props.splice(n, 1);
    }
    if (get(gx, gy) === 'water') put(gx, gy, 'bridge');
  }
  return { width: WIDTH, height: HEIGHT, tileSize: TILE_SIZE, seed, tiles, props, landmarks, npcs, wisps, spawn: center(44, 45) };
}

/** Out-of-bounds coordinates are ocean, so all movement callers have safe edges. */
export function tileAt(world: World, x: number, y: number): Tile {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= world.width * world.tileSize || y >= world.height * world.tileSize) return 'water';
  return world.tiles[Math.floor(y / world.tileSize) * world.width + Math.floor(x / world.tileSize)] ?? 'water';
}

type CollisionIndex = { props: WorldProp[]; length: number; cells: Map<number, WorldProp[]> };
const collisionIndices = new WeakMap<World, CollisionIndex>();

function collisionIndex(world: World): CollisionIndex {
  const existing = collisionIndices.get(world);
  if (existing?.props === world.props && existing.length === world.props.length) return existing;
  const cells = new Map<number, WorldProp[]>();
  for (const prop of world.props) {
    if (!prop.solid) continue;
    const f = footprints[prop.kind] ?? { halfWidth: 6, height: 8 };
    const minX = Math.floor((prop.x - f.halfWidth) / world.tileSize);
    const maxX = Math.floor((prop.x + f.halfWidth) / world.tileSize);
    const minY = Math.floor((prop.y - f.height) / world.tileSize);
    const maxY = Math.floor((prop.y + 2) / world.tileSize);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      const key = y * world.width + x;
      const bucket = cells.get(key) ?? [];
      bucket.push(prop); cells.set(key, bucket);
    }
  }
  const result = { props: world.props, length: world.props.length, cells };
  collisionIndices.set(world, result);
  return result;
}

export function isWalkable(world: World, x: number, y: number): boolean {
  if (tileAt(world, x, y) === 'water') return false;
  const key = Math.floor(y / world.tileSize) * world.width + Math.floor(x / world.tileSize);
  for (const p of collisionIndex(world).cells.get(key) ?? []) {
    const f = footprints[p.kind] ?? { halfWidth: 6, height: 8 };
    if (x >= p.x - f.halfWidth && x <= p.x + f.halfWidth && y >= p.y - f.height && y <= p.y + 2) return false;
  }
  return true;
}

export function landmarkAt(world: World, x: number, y: number): Landmark | undefined {
  let nearest: Landmark | undefined;
  let distance = Infinity;
  for (const landmark of world.landmarks) {
    const d = Math.hypot(x - landmark.x, y - landmark.y);
    if (d <= landmark.radius && d < distance) { nearest = landmark; distance = d; }
  }
  return nearest;
}

/** Four-way A*: walks stay on bridges and never cut a diagonal through a trunk. */
export function findPath(world: World, from: Point, to: Point): Point[] {
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return [];
  const { width, height, tileSize } = world;
  const count = width * height;
  const walkable = new Uint8Array(count);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = (x + .5) * tileSize, py = (y + .5) * tileSize;
    // Match the walking controller's shoulders and feet, so a route beside a
    // ruin or inn cannot fit its centre while trapping the actual traveller.
    walkable[y * width + x] = isWalkable(world, px - 3, py) && isWalkable(world, px + 3, py) &&
      isWalkable(world, px, py - 2) && isWalkable(world, px, py + 2) ? 1 : 0;
  }
  const nearest = (point: Point): number => {
    const x = Math.max(0, Math.min(width - 1, Math.floor(point.x / tileSize)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(point.y / tileSize)));
    if (walkable[y * width + x]) return y * width + x;
    for (let radius = 1; radius < width + height; radius++) {
      let best = -1, bestDistance = Infinity;
      for (let dx = -radius; dx <= radius; dx++) {
        const dy = radius - Math.abs(dx);
        for (const candidateY of dy === 0 ? [y] : [y - dy, y + dy]) {
          const candidateX = x + dx;
          if (candidateX < 0 || candidateY < 0 || candidateX >= width || candidateY >= height) continue;
          const candidate = candidateY * width + candidateX;
          if (!walkable[candidate]) continue;
          const distance = ((candidateX + .5) * tileSize - point.x) ** 2 + ((candidateY + .5) * tileSize - point.y) ** 2;
          if (distance < bestDistance) { bestDistance = distance; best = candidate; }
        }
      }
      if (best !== -1) return best;
    }
    return -1;
  };
  const start = nearest(from), goal = nearest(to);
  if (start < 0 || goal < 0) return [];
  const gx = goal % width, gy = Math.floor(goal / width);
  const heuristic = (i: number) => Math.abs(i % width - gx) + Math.abs(Math.floor(i / width) - gy);
  const costs = new Float64Array(count).fill(Infinity);
  const parent = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const heap: { index: number; score: number }[] = [];
  const push = (i: number, score: number) => {
    heap.push({ index: i, score });
    let position = heap.length - 1;
    while (position > 0) {
      const above = (position - 1) >> 1;
      if (heap[above].score <= heap[position].score) break;
      [heap[above], heap[position]] = [heap[position], heap[above]]; position = above;
    }
  };
  const pop = (): number => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let position = 0;
      while (true) {
        const left = position * 2 + 1, right = left + 1;
        let smallest = position;
        if (left < heap.length && heap[left].score < heap[smallest].score) smallest = left;
        if (right < heap.length && heap[right].score < heap[smallest].score) smallest = right;
        if (smallest === position) break;
        [heap[position], heap[smallest]] = [heap[smallest], heap[position]]; position = smallest;
      }
    }
    return first.index;
  };
  costs[start] = 0; push(start, heuristic(start));
  let visited = 0;
  while (heap.length && visited < count) {
    const current = pop();
    if (closed[current]) continue;
    if (current === goal) {
      const result: Point[] = [];
      for (let cursor = goal; cursor !== -1; cursor = parent[cursor]) result.push({ x: (cursor % width + .5) * tileSize, y: (Math.floor(cursor / width) + .5) * tileSize });
      return result.reverse();
    }
    closed[current] = 1; visited++;
    const x = current % width, y = Math.floor(current / width);
    const neighbors = [x > 0 ? current - 1 : -1, x < width - 1 ? current + 1 : -1, y > 0 ? current - width : -1, y < height - 1 ? current + width : -1];
    for (const next of neighbors) {
      if (next < 0 || closed[next] || !walkable[next] || costs[current] + 1 >= costs[next]) continue;
      costs[next] = costs[current] + 1; parent[next] = current;
      push(next, costs[next] + heuristic(next));
    }
  }
  return [];
}
