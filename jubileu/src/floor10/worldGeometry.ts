/**
 * Collision geometry owned by Floor 10.
 *
 * Mirrors `wallsForState(10, false, true)` from the former shared constants
 * selector without importing any other floor's world, furniture or textures.
 */
export const FLOOR10_NPC_RADIUS = 0.5;

const ELEVATOR_WALLS: number[][] = [
  [-3.25, -16, -3.25, -10],
  [3.25, -16, 3.25, -10],
  [-3.25, -16, 3.25, -16],
];

const ELEVATOR_BUILDING_WALLS: number[][] = [
  [-5.5, -16.5, 5.5, -16.5],
  [-5.5, -10, -5.5, -16.5],
  [5.5, -10, 5.5, -16.5],
  [-5.5, -10, -1.3, -10],
  [1.3, -10, 5.5, -10],
  [-25, -10, -5.5, -10],
  [5.5, -10, 25, -10],
];

const FLOOR10_BOUNDARY: number[][] = [
  [-22, -22, -22, 22],
  [22, -22, 22, 22],
  [-22, -22, 22, -22],
  [-22, 22, 22, 22],
];

/** Pre-built walls used by the NPC movement collision step. */
export const FLOOR10_WALLS: number[][] = [
  ...ELEVATOR_WALLS,
  ...ELEVATOR_BUILDING_WALLS,
  ...FLOOR10_BOUNDARY,
];
