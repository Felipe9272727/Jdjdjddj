/**
 * Floor2Underwater.tsx — Barrel re-export for backward compatibility
 *
 * App.tsx imports: Floor2Environment, SHARD_POSITIONS
 * Player.tsx imports: HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, SWIM_THRESHOLD_Y, UW_ROCK_COLLIDERS, CAVE_ROCK_COLLIDERS
 *
 * All logic is now split across:
 *   Floor2/constants.ts   — data, types, collision exports
 *   Floor2/geometry.ts    — pre-computed BufferGeometry objects
 *   Floor2/shaders.ts     — custom ShaderMaterial definitions
 *   Floor2/components.tsx — React sub-components
 *   Floor2/index.tsx      — main Floor2Environment component
 */

export {
    Floor2Environment,
    HOLE_CENTER_X,
    HOLE_CENTER_Z,
    HOLE_RADIUS,
    WATER_LEVEL_Y,
    SWIM_THRESHOLD_Y,
    SHARD_POSITIONS,
    CAVE_ROCK_COLLIDERS,
    UW_ROCK_COLLIDERS,
} from './Floor2';
