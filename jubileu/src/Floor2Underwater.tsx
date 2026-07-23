/**
 * Floor2Underwater.tsx — Barrel re-export.
 *
 * All implementation has been moved to the Floor2/ module:
 *   Floor2/constants.ts  — Pure data, collision arrays, types
 *   Floor2/geometry.ts   — Procedural geometry, noise, GLOW_TEXTURE
 *   Floor2/shaders.ts    — Custom shader materials
 *   Floor2/components.tsx — All React sub-components
 *   Floor2/index.tsx     — Floor2Environment + re-exports
 *
 * This file preserves backward compatibility for imports like:
 *   import { Floor2Environment, CAVE_WALL_COLLIDERS } from './Floor2Underwater';
 */

export {
    // Main component
    Floor2Environment,

    // Constants (used by Player.tsx and others)
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,

    // Collision data
    CAVE_ROCK_COLLIDERS, UW_ROCK_COLLIDERS, CAVE_WALL_COLLIDERS, UW_PILLAR_COLLIDERS, STALAGMITE_COLLIDERS,

    // Shard positions
    SHARD_POSITIONS,

    // Sub-components (if anyone imports them directly)
    CrystalCluster, Torch, DustMotes,
    WaterSurface, WaterCeilingDisc, DynamicFog, UnderwaterOverlay, WaterOccluder,
    UnderwaterCaustics, KelpField, Coral, UnderwaterFlora,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, Shard,

    // Organic-deformation collision (walls bulge inward, seafloor ridges)
    resolveUWWalls, uwFloorHeight,
} from './Floor2';
