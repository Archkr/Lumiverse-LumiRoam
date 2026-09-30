import { describe, expect, test } from 'bun:test';
import type { World } from './types';
import { findPath, generateWorld, isWalkable } from './world';

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Exercise the actual controller's footprint and frame-sized steps, rather than
// just checking that a path's grid centres sit on grass.
function follow(world: World, start: Point, target: Point, frameTime: number): Point {
  const player = { ...start };
  const path = findPath(world, player, target);
  expect(path.length).toBeGreaterThan(0);
  const safe = (x: number, y: number) => isWalkable(world, x - 3, y) && isWalkable(world, x + 3, y) && isWalkable(world, x, y - 2) && isWalkable(world, x, y + 2);
  const moveBy = (dx: number, dy: number) => {
    let moved = false;
    if (dx && safe(player.x + dx, player.y)) { player.x += dx; moved = true; }
    if (dy && safe(player.x, player.y + dy)) { player.y += dy; moved = true; }
    return moved;
  };
  let frames = 0;
  while (path.length && frames++ < 15000) {
    const waypoint = path[0];
    const dx = waypoint.x - player.x, dy = waypoint.y - player.y;
    const d = Math.hypot(dx, dy), step = 70 * frameTime;
    if (d < Math.max(2, step)) { moveBy(dx, dy); path.shift(); }
    else {
      if (!moveBy(dx / d * step, dy / d * step)) throw new Error(`Navigation stopped at (${player.x}, ${player.y}) en route to (${target.x}, ${target.y}); next waypoint (${waypoint.x}, ${waypoint.y})`);
    }
  }
  expect(path.length).toBe(0);
  expect(safe(player.x, player.y)).toBe(true);
  return player;
}

describe('the walking adventure', () => {
  test('the frame-based player controller can gather all six lights then approach the beacon', () => {
    for (const seed of [72819, 1, 12345, 987654321]) for (const frameTime of [1 / 60, .04]) {
      const world = generateWorld(seed);
      let player = { ...world.spawn };
      const collected = new Set<string>();
      for (const wisp of world.wisps) {
        player = follow(world, player, wisp, frameTime);
        if (distance(player, wisp) < 20) collected.add(wisp.id);
      }
      expect(collected.size).toBe(6);
      const tower = world.props.find(p => p.kind === 'tower')!;
      player = follow(world, player, tower, frameTime);
      expect(distance(player, tower)).toBeLessThan(80);
      // A villager must not intercept E at the final approach to the beacon.
      for (const npc of world.npcs) expect(distance(player, npc)).toBeGreaterThan(40);
    }
  });

  test('every villager can be approached closely enough to start a conversation', () => {
    const world = generateWorld();
    for (const npc of world.npcs) {
      const player = follow(world, world.spawn, npc, 1 / 60);
      expect(distance(player, npc)).toBeLessThan(40);
      // The roaming offset is at most 10 horizontally and 7 vertically.
      expect(distance(player, npc) + Math.hypot(10, 7)).toBeLessThan(40);
    }
  });

  test('clicking landmark centres reaches their discovery radii at actual player size', () => {
    const world = generateWorld();
    for (const landmark of world.landmarks) {
      const player = follow(world, world.spawn, landmark, .04);
      expect(distance(player, landmark)).toBeLessThan(landmark.radius);
    }
  });
});
