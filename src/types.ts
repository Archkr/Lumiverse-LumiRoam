export type Tile = 'water' | 'grass' | 'sand' | 'path' | 'bridge' | 'stone' | 'flowers';
export type Biome = 'village' | 'forest' | 'marsh' | 'coast' | 'ruins';
export type PropKind = 'tree' | 'pine' | 'willow' | 'house' | 'inn' | 'tower' | 'rock' | 'bush' | 'flower' | 'mushroom' | 'reed' | 'lantern' | 'well' | 'sign' | 'bench' | 'crate' | 'boat' | 'ruin' | 'crystal' | 'shrine' | 'fence' | 'stump';
export interface WorldProp { id: string; kind: PropKind; x: number; y: number; variant: number; solid: boolean; name?: string; }
export interface Landmark { id: string; name: string; subtitle: string; x: number; y: number; radius: number; biome: Biome; description: string; }
export interface NPC { id: string; name: string; role: string; x: number; y: number; color: string; lines: string[]; }
export interface Wisp { id: string; x: number; y: number; name: string; }
export interface World { width: number; height: number; tileSize: number; seed: number; tiles: Tile[]; props: WorldProp[]; landmarks: Landmark[]; npcs: NPC[]; wisps: Wisp[]; spawn: {x:number; y:number}; }
export type Weather = 'clear' | 'rain' | 'mist';
export type TimeOfDay = 'day' | 'dusk' | 'night';
export interface SaveState { version: 1; seed: number; player: {x:number; y:number}; collected: string[]; discovered: string[]; lighthouseLit: boolean; weather: Weather; timeOfDay: TimeOfDay; sound: boolean; journal: JournalEntry[]; }
export interface JournalEntry { title: string; text: string; time: number; }
export interface RenderState { player: {x:number; y:number; direction: number; moving: boolean; step: number}; camera: {x:number; y:number}; time: number; weather: Weather; timeOfDay: TimeOfDay; collected: ReadonlySet<string>; lighthouseLit: boolean; zoom: number; target: {x:number; y:number} | null; npcPositions?: Map<string,{x:number;y:number}>; }
export interface Renderer { resize(width:number,height:number): void; render(state:RenderState): void; screenToWorld(x:number,y:number,state:RenderState): {x:number;y:number}; renderMap(canvas:HTMLCanvasElement,state:RenderState,discovered:ReadonlySet<string>):void; destroy(): void; }
