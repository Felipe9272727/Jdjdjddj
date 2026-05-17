/**
 * constants.ts — Shared constants, data arrays, and collision data
 * for the Floor2 underwater cave level.
 *
 * Pure data, no React/Three.js runtime dependencies.
 */

import {
    rockModelA, rockModelB, rockModelC, rockModelD,
    boulderModel, pebbleModel,
} from '../assets/textureImports';

// ─── World layout ────────────────────────────────────────────────────
export const HOLE_CENTER_X = 0;
export const HOLE_CENTER_Z = 5;
export const HOLE_RADIUS = 3.0;
export const WATER_LEVEL_Y = -0.05;
export const SWIM_THRESHOLD_Y = -0.3;

// ─── Particle counts ─────────────────────────────────────────────────
export const DUST_COUNT = 25;
export const DEBRIS_COUNT = 60;
export const FISH_COUNT = 8;
export const PLANKTON_COUNT = 50;
export const BUBBLE_COUNT = 35;
export const BUBBLE_RANGE = 18;
export const BUBBLE_RISE = 0.5;
export const BUBBLE_MAX_Y = WATER_LEVEL_Y - 0.5;
export const BUBBLE_MIN_Y = -29;

export const COLLECT_DIST_SQ = 1.4 * 1.4;

// ─── Rock model URLs ─────────────────────────────────────────────────
export const ROCK_MODEL_URLS = [rockModelA, rockModelB, rockModelC, rockModelD];
export const BOULDER_MODEL_URL = boulderModel;
export const PEBBLE_MODEL_URL = pebbleModel;

// ─── Shared types ────────────────────────────────────────────────────
export type Boulder = readonly [number, number, number, number, number]; // x,y,z,s,ry
export type Stalactite = readonly [number, number, number, number]; // x, z, height, radius
export type Crystal = readonly [number, number, number, string]; // x, y, z, hexColor

// ─── Cave boulders — multiple cohorts ────────────────────────────────
export const CAVE_ROCKS_DARK: readonly Boulder[] = [
    [-22, 0,  20, 2.4, 0.3],
    [ 24, 0,  18, 2.1, 1.2],
    [-25, 0, -15, 2.8, 0.6],
    [ 22, 0, -22, 2.5, 1.9],
    [ 18, 0,   4, 1.6, 0.4],
    [-19, 0,   8, 1.8, 2.1],
    [  6, 0,  25, 1.5, 1.0],
    [-12, 0, -25, 2.0, 0.7],
    [-27, 0,  -2, 2.2, 0.9],
    [ 26, 0,   8, 1.9, 1.5],
    [-24, 0,  25, 2.0, 0.4],
    [ 27, 0, -10, 2.3, 1.1],
] as const;

export const CAVE_ROCKS_MID: readonly Boulder[] = [
    [-15, 0,  15, 1.0, 2.3],
    [ 14, 0, -10, 0.9, 0.5],
    [-20, 0,   0, 1.2, 1.7],
    [ 19, 0,  14, 1.1, 0.8],
    [-17, 0, -18, 1.3, 0.2],
    [ 12, 0,  18, 0.8, 1.4],
    [-10, 0,  -3, 1.1, 1.9],
    [ 16, 0, -20, 1.2, 0.6],
    [-13, 0,  22, 1.0, 1.1],
    [ 20, 0, -14, 1.1, 0.7],
] as const;

export const CAVE_ROCKS_LIGHT: readonly Boulder[] = [
    [-26,  0,   6, 0.7, 0.3],
    [ 26,  0,  -4, 0.6, 1.2],
    [ -8,  0,  26, 0.7, 0.6],
    [ 10,  0, -26, 0.8, 1.9],
    [-26,  0, -18, 0.7, 0.4],
    [ 26,  0,  20, 0.6, 1.5],
] as const;

// ─── Pool rim ────────────────────────────────────────────────────────
export const POOL_RIM: readonly Boulder[] = (() => {
    const r = HOLE_RADIUS + 0.8;
    const result: Boulder[] = [];
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const jitter = 0.85 + (Math.sin(i * 13.7) * 0.5 + 0.5) * 0.35;
        const x = HOLE_CENTER_X + Math.cos(a) * r * jitter;
        const z = HOLE_CENTER_Z + Math.sin(a) * r * jitter;
        const s = 0.7 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.7;
        const ry = a + Math.sin(i * 3.1) * 0.4;
        result.push([x, 0, z, s, ry] as const);
    }
    return result;
})();

// ─── Stalagmites / Stalactites ───────────────────────────────────────
export const STALAGMITES: readonly Stalactite[] = [
    [-18,  18, 2.5, 0.6],
    [ 20,  15, 3.2, 0.8],
    [-22, -10, 2.0, 0.5],
    [ 24, -18, 2.8, 0.7],
    [ -8,  22, 1.8, 0.5],
    [ 10,  20, 2.1, 0.6],
    [-15, -22, 2.4, 0.7],
];

export const STALACTITES: readonly Stalactite[] = [
    [-12,  10, 1.5, 0.4],
    [ 16,   2, 1.8, 0.5],
    [ -5, -15, 1.2, 0.4],
    [ 22,  10, 2.0, 0.55],
    [-18,  -5, 1.4, 0.4],
    [  3, -20, 1.6, 0.5],
    [-22,  20, 1.3, 0.4],
    [ 18, -25, 1.7, 0.5],
];

// ─── Crystals ────────────────────────────────────────────────────────
export const CRYSTALS: readonly Crystal[] = [
    [-28,  2.2,   8, '#9ae6ff'],
    [ 28,  3.5,  -5, '#c39bff'],
    [-10,  0.6,  28, '#ff9ad8'],
    [ 12,  0.8, -28, '#ffd066'],
    [-28,  4.5, -18, '#9affae'],
    [ 28,  1.5,  20, '#84d8ff'],
];

// ─── Torch positions ─────────────────────────────────────────────────
export const TORCH_POSITIONS: readonly (readonly [number, number, number])[] = [
    [-29.5, 5.5,   0],
    [ 29.5, 5.5,   0],
    [   0, 5.5, -29.5],
    [   0, 5.5,  29.5],
    [-21,  6.0, -21],
    [ 21,  6.0,  21],
];

// ─── Underwater boulders & pebbles ───────────────────────────────────
export const UW_BOULDERS: readonly Boulder[] = [
    [  6, -28,   -8, 2.6, 0.3],
    [ -9, -28.5, 4.5, 3.1, 1.2],
    [ 12, -28.5,  3,  2.4, 0.6],
    [  4, -28.2, 12, 2.2, 2.0],
    [ -5, -28.5,-14, 3.0, 0.9],
    [ 16, -28.3,  9, 2.7, 1.5],
    [-14, -28.5,-10, 2.6, 2.5],
    [-18, -28.5,  5, 2.9, 0.4],
    [ 20, -28.3, -4, 2.4, 1.8],
    [ -3, -28.4, 18, 2.3, 1.0],
    [  9, -28.5,-16, 3.1, 0.8],
    [-11, -28.4, 14, 2.5, 2.2],
    [  0, -28.5,-22, 2.8, 0.5],
    [ 22, -28.4, 12, 2.6, 1.1],
    [-20, -28.4,-16, 2.9, 0.7],
] as const;

export const UW_PEBBLES: readonly Boulder[] = [
    [  3, -29.6,   2, 0.4, 0.2],
    [ -2, -29.6,   6, 0.3, 1.5],
    [  7, -29.6,  -3, 0.5, 0.8],
    [ -6, -29.6,  -2, 0.4, 2.1],
    [  1.5,-29.6, 10, 0.35,0.5],
    [ 10, -29.6,   6, 0.45,1.2],
    [ -8, -29.6,   9, 0.5, 0.9],
    [ 14, -29.6,  -2, 0.4, 1.8],
    [-12, -29.6,   0, 0.55,0.3],
    [  5, -29.6, -10, 0.4, 2.4],
    [ -4, -29.6,  14, 0.5, 1.6],
    [ 13, -29.6,  14, 0.4, 0.6],
] as const;

// ─── Kelp & coral positions ──────────────────────────────────────────
export type KelpData = readonly [number, number, number, number]; // x, z, height, phase
export const KELP_POSITIONS: readonly KelpData[] = [
    [ 5.5, -8.0, 4.5, 0.3],
    [ 4.0, -9.5, 3.8, 1.1],
    [ 7.0, -7.0, 5.0, 2.0],
    [-3.5,  3.0, 4.0, 0.7],
    [-5.0,  4.5, 3.2, 1.4],
    [-6.5,  3.0, 4.8, 2.3],
    [10.0,  4.0, 4.5, 0.9],
    [11.5,  6.0, 3.5, 1.7],
    [ 6.5, -10.0, 5.5, 0.5],
    [ 3.0, -7.0, 3.5, 1.8],
    [ 8.5, -6.0, 4.2, 2.5],
    [-2.0,  5.0, 3.8, 0.2],
    [-7.0,  2.0, 5.2, 1.0],
    [12.0,  3.0, 4.0, 0.6],
    [-8.0,  7.0, 3.0, 1.3],
    [15.0, -3.0, 4.8, 2.1],
];

export type CoralData = readonly [number, number, string, number]; // x, z, color, scale
export const CORAL_POSITIONS: readonly CoralData[] = [
    [ 3.0, -5.0, '#1a1208', 1.0],
    [-4.0,  6.0, '#1a0e06', 0.8],
    [ 9.0, -2.0, '#1a1610', 1.2],
    [-12.0, -5.0, '#1a1208', 0.9],
    [13.0,  3.0, '#1a0e06', 1.0],
    [-8.0, 12.0, '#1a1610', 0.7],
];

// ─── Shard positions ─────────────────────────────────────────────────
export const SHARD_POSITIONS: readonly (readonly [number, number, number])[] = [
    [  7.5, -27.5,  -7.5],
    [-13.0, -27.7,   4.8],
    [  3.5, -27.7,  13.5],
    [-18.0, -27.7, -10.0],
    [ 19.5, -27.7,  11.5],
] as const;

// ─── Rock collision data (exported for Player.tsx) ───────────────────
export const CAVE_ROCK_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = [
    ...CAVE_ROCKS_DARK.map(([x, y, z, s]) => ({ x, y: y + s * 0.35, z, r: s * 0.7 })),
    ...CAVE_ROCKS_MID.map(([x, y, z, s]) => ({ x, y: y + s * 0.35, z, r: s * 0.5 })),
];

export const UW_ROCK_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = [
    ...UW_BOULDERS.map(([x, y, z, s]) => ({ x, y: y + s * 0.3, z, r: s * 0.6 })),
];

// ─── Cave wall collision data (exported for Player.tsx) ─────────────────
export const CAVE_WALL_COLLIDERS: readonly { x: number; y: number; z: number; r: number }[] = (() => {
    const colliders: { x: number; y: number; z: number; r: number }[] = [];
    const WALL_POS = 30;
    const BULGE = 4;  // max inward bulge
    const STEP = 8;
    // North wall (z = -30, bulges toward +Z)
    for (let x = -28; x <= 28; x += STEP) {
        colliders.push({ x, y: 3, z: -WALL_POS + BULGE, r: BULGE + 1 });
    }
    // South wall (z = 30, bulges toward -Z)
    for (let x = -28; x <= 28; x += STEP) {
        colliders.push({ x, y: 3, z: WALL_POS - BULGE, r: BULGE + 1 });
    }
    // West wall (x = -30, bulges toward +X)
    for (let z = -28; z <= 28; z += STEP) {
        colliders.push({ x: -WALL_POS + BULGE, y: 3, z, r: BULGE + 1 });
    }
    // East wall (x = 30, bulges toward -X)
    for (let z = -28; z <= 28; z += STEP) {
        colliders.push({ x: WALL_POS - BULGE, y: 3, z, r: BULGE + 1 });
    }
    // Corner colliders — bigger spheres at corners where two walls meet
    const corners = [[-28, -28], [28, -28], [-28, 28], [28, 28]] as const;
    for (const [cx, cz] of corners) {
        colliders.push({ x: cx, y: 3, z: cz, r: 5 });
    }
    return colliders;
})();
