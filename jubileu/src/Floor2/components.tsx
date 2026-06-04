/**
 * Floor2/components.tsx — Barrel re-export for backward compatibility.
 * Actual implementations live in the focused modules below.
 */

export { CrystalCluster, Torch, TorchField, DustMotes } from './cave-features';
export {
    WaterSurface, WaterCeilingDisc, DynamicFog, UnderwaterOverlay, WaterOccluder,
} from './water-effects';
export {
    UnderwaterCaustics, KelpField, Coral, UnderwaterFlora,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, Shard,
} from './underwater-effects';
