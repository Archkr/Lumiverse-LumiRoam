import { describe, expect, test } from 'bun:test';
import { findPath, generateWorld, isWalkable, landmarkAt, tileAt } from './world';

describe('the Lantern Isles', () => {
  test('a seed recreates the island while a different seed changes its living details', () => {
    const world = generateWorld();
    expect(generateWorld()).toEqual(world);
    expect(generateWorld(123).props).not.toEqual(world.props);
    expect(world.tiles.length).toBe(world.width * world.height);
    expect(world.width).toBe(110);
    expect(world.height).toBe(90);
    expect(world.landmarks.length).toBe(5);
    expect(new Set(world.wisps.map(w => w.id)).size).toBe(6);
  });

  test('all six wandering lights, every landmark and every villager are reachable', () => {
    for (const seed of [72819, 1, 12345, 987654321]) {
      const world = generateWorld(seed);
      expect(isWalkable(world, world.spawn.x, world.spawn.y)).toBe(true);
      for (const destination of [...world.wisps, ...world.landmarks, ...world.npcs]) {
        const path = findPath(world, world.spawn, destination);
        expect(path.length).toBeGreaterThan(0);
        expect(path.length).toBeLessThan(world.width * world.height);
        expect(Math.hypot(path.at(-1)!.x - destination.x, path.at(-1)!.y - destination.y)).toBeLessThanOrEqual(32);
        for (let i = 0; i < path.length; i++) {
          expect(isWalkable(world, path[i].x, path[i].y)).toBe(true);
          if (i > 0) expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)).toBe(world.tileSize);
        }
      }
    }
  });

  test('crossing the river and reaching Lastlight uses walkable bridges', () => {
    const world = generateWorld();
    const lastlight = world.landmarks.find(l => l.id === 'lighthouse')!;
    const path = findPath(world, world.spawn, lastlight);
    expect(path.some(p => tileAt(world, p.x, p.y) === 'bridge')).toBe(true);
    expect(world.tiles.filter(t => t === 'bridge').length).toBeGreaterThan(20);
    for (const wisp of world.wisps) expect(isWalkable(world, wisp.x, wisp.y)).toBe(true);
  });

  test('solid architecture and tree trunks block movement while coastline has safe bounds', () => {
    const world = generateWorld();
    for (const prop of world.props.filter(p => p.solid)) expect(isWalkable(world, prop.x, prop.y)).toBe(false);
    expect(tileAt(world, -1, 20)).toBe('water');
    expect(tileAt(world, world.width * world.tileSize, 20)).toBe('water');
    expect(isWalkable(world, 20, world.height * world.tileSize)).toBe(false);
    expect(isWalkable(world, NaN, 100)).toBe(false);
    expect(findPath(world, world.spawn, { x: NaN, y: 0 })).toEqual([]);
  });

  test('paths to a building or shore stop at a nearby walkable tile', () => {
    const world = generateWorld();
    const house = world.props.find(p => p.kind === 'house')!;
    const path = findPath(world, world.spawn, house);
    expect(path.length).toBeGreaterThan(0);
    expect(isWalkable(world, path.at(-1)!.x, path.at(-1)!.y)).toBe(true);
    expect(Math.hypot(path.at(-1)!.x - house.x, path.at(-1)!.y - house.y)).toBeLessThan(48);
    expect(landmarkAt(world, world.spawn.x, world.spawn.y)?.id).toBe('hearthwick');
    expect(landmarkAt(world, -1000, -1000)).toBeUndefined();
  });
});
