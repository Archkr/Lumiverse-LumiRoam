import type { JournalEntry, SaveState, TimeOfDay, Weather } from './types';

export const DEFAULT_SEED = 72819;
export const DEFAULT_SPAWN = Object.freeze({ x: 712, y: 728 });
export const WORLD_BOUNDS = Object.freeze({ x: 1759, y: 1439 });
export const WISP_IDS = ['wisp-hearth', 'wisp-pine', 'wisp-mooncap', 'wisp-reed', 'wisp-star', 'wisp-tide'] as const;
export const LANDMARK_IDS = ['hearthwick', 'whisperpine', 'willowmere', 'starfall', 'lighthouse'] as const;

export interface WorldSettings { storyContext: boolean; }
export interface SceneSnapshot {
  location: string;
  description: string;
  weather: Weather;
  timeOfDay: TimeOfDay;
  lighthouseLit: boolean;
  collected: number;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

function ids(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const whitelist = new Set(allowed);
  return [...new Set(value.slice(0, 256).filter((id): id is string => typeof id === 'string' && whitelist.has(id)))];
}

function journal(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-80).flatMap((item) => {
    const entry = record(item);
    const title = text(entry.title, 120);
    const body = text(entry.text, 1200);
    if (!title || !body) return [];
    return [{ title, text: body, time: Math.floor(number(entry.time, 0, 0, 8_640_000_000_000_000)) }];
  });
}

export function createDefaultSave(seed = DEFAULT_SEED, spawn: { x: number; y: number } = DEFAULT_SPAWN): SaveState {
  return {
    version: 1,
    seed: Math.floor(number(seed, DEFAULT_SEED, 1, 0xffff_ffff)),
    player: {
      x: number(spawn.x, DEFAULT_SPAWN.x, 0, WORLD_BOUNDS.x),
      y: number(spawn.y, DEFAULT_SPAWN.y, 0, WORLD_BOUNDS.y),
    },
    collected: [], discovered: [], lighthouseLit: false,
    weather: 'clear', timeOfDay: 'dusk', sound: false, journal: [],
  };
}

/** Only known world objects are restored. Corrupt or old fields never escape into the renderer. */
export function normalizeSave(value: unknown, fallback: SaveState = createDefaultSave()): SaveState {
  const source = record(value);
  const player = record(source.player);
  const defaults = createDefaultSave(fallback.seed, fallback.player);
  const collected = ids(source.collected, WISP_IDS);
  return {
    version: 1,
    seed: Math.floor(number(source.seed, defaults.seed, 1, 0xffff_ffff)),
    player: {
      x: number(player.x, defaults.player.x, 0, WORLD_BOUNDS.x),
      y: number(player.y, defaults.player.y, 0, WORLD_BOUNDS.y),
    },
    collected,
    discovered: ids(source.discovered, LANDMARK_IDS),
    lighthouseLit: source.lighthouseLit === true && collected.length === WISP_IDS.length,
    weather: source.weather === 'rain' || source.weather === 'mist' || source.weather === 'clear' ? source.weather : fallback.weather,
    timeOfDay: source.timeOfDay === 'day' || source.timeOfDay === 'dusk' || source.timeOfDay === 'night' ? source.timeOfDay : fallback.timeOfDay,
    sound: typeof source.sound === 'boolean' ? source.sound : fallback.sound,
    journal: journal(source.journal),
  };
}

export function normalizeSettings(value: unknown): WorldSettings {
  return { storyContext: record(value).storyContext === true };
}

export function normalizeScene(value: unknown): SceneSnapshot | null {
  const source = record(value);
  const location = text(source.location, 120);
  const description = text(source.description, 1000);
  if (!location || !description) return null;
  return {
    location, description,
    weather: source.weather === 'rain' || source.weather === 'mist' ? source.weather : 'clear',
    timeOfDay: source.timeOfDay === 'day' || source.timeOfDay === 'night' ? source.timeOfDay : 'dusk',
    lighthouseLit: source.lighthouseLit === true,
    collected: Math.floor(number(source.collected, 0, 0, WISP_IDS.length)),
  };
}

export function scenePrompt(scene: SceneSnapshot): string {
  return [
    '[LumiRoam scene — The Lantern Isles]',
    'The user has opted to share this place as atmosphere for the conversation. Use it when relevant; follow the current story and user instructions.',
    `Location: ${scene.location}. ${scene.description}`,
    `Atmosphere: ${scene.weather} weather, ${scene.timeOfDay}.`,
    `Lantern wisps found: ${scene.collected} of ${WISP_IDS.length}. The lighthouse ${scene.lighthouseLit ? 'is lit, casting a warm beacon across the islands' : 'awaits its light'}.`,
    'This is ambient world context, not a player command or a new chat message.',
    '[/LumiRoam scene]',
  ].join('\n');
}
