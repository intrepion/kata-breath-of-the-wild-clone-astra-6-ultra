export interface WorldPoint {
  x: number;
  z: number;
}
export const WORLD_LIMIT = 190;
export const SPAWN: WorldPoint = { x: 0, z: 68 };
export const BEACONS = [
  { id: 'windward', name: 'Windward Shrine', region: 'The Verdant Reach', x: -24, z: 8 },
  { id: 'stillwater', name: 'Stillwater Shrine', region: 'Stillwater Grove', x: -83, z: -62 },
  { id: 'sunspire', name: 'Sunspire Shrine', region: 'The Amber Highlands', x: 78, z: -98 },
] as const;
export const RELICS = [
  { id: 'r1', x: 5, z: 49 },
  { id: 'r2', x: -10, z: 26 },
  { id: 'r3', x: -34, z: -15 },
  { id: 'r4', x: -62, z: -43 },
  { id: 'r5', x: -89, z: -78 },
  { id: 'r6', x: 7, z: -35 },
  { id: 'r7', x: 41, z: -58 },
  { id: 'r8', x: 63, z: -82 },
  { id: 'r9', x: 90, z: -116 },
  { id: 'r10', x: 38, z: 29 },
  { id: 'r11', x: -55, z: 55 },
  { id: 'r12', x: 102, z: -22 },
] as const;
export const ENEMY_SPAWNS = [
  { id: 'e1', x: -19, z: 24 },
  { id: 'e2', x: -58, z: -35 },
  { id: 'e3', x: 49, z: -65 },
  { id: 'e4', x: 15, z: -19 },
  { id: 'e5', x: 82, z: -82 },
] as const;
