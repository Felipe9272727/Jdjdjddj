import type { SpriteAnimationConfig } from './SpriteEngine';
import bellhopIdleAtlas from './assets/shop/bellhop-idle-atlas-v5.webp';
import bellhopTalkAtlas from './assets/shop/bellhop-talk-atlas-v5.webp';
import bellhopServiceAtlas from './assets/shop/bellhop-service-atlas-v5.webp';
import bellhopWinkAtlas from './assets/shop/bellhop-wink-atlas-v5.webp';
import bellhopSweatAtlas from './assets/shop/bellhop-sweat-atlas-v5.webp';
import bellhopConcernedAtlas from './assets/shop/bellhop-concerned-atlas-v5.webp';
import bellhopGlitchAtlas from './assets/shop/bellhop-glitch-atlas-v5.webp';
import shopVfxAtlas from './assets/shop/shop-vfx-atlas-v1.webp';

export { default as shopBackdrop } from './assets/shop/lobby-shop-bg-v1.webp';

export type BellhopMotion =
  | 'idle'
  | 'talk'
  | 'service'
  | 'wink'
  | 'sweat'
  | 'concerned'
  | 'glitch';

export type ShopVfxMotion = 'ambient' | 'bell' | 'purchase' | 'glitch';

const FRAME = 314;
const frames = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

const atlas = (
  imageUrl: string,
  columns: number,
  frameSequence: readonly number[],
  frameDurationsMs: readonly number[],
  loop: boolean,
  blendRatio = 0,
): SpriteAnimationConfig => ({
  imageUrl,
  frameCount: frameSequence.length,
  frameWidth: FRAME,
  frameHeight: FRAME,
  columns,
  frameSequence,
  frameDurationsMs,
  cycleMs: frameDurationsMs.reduce((sum, duration) => sum + duration, 0),
  loop,
  blendRatio,
  pixelated: true,
});

// Every bellhop sheet is a single, row-major, hand-redrawn performance. Most
// drawings run around 8-12 unique poses per second, while accents and neutral
// holds receive longer exposure. No cross-fade is used: dissolving pixel-art
// silhouettes creates double eyes/hands and reads as a flash on a phone.
const IDLE_DURATIONS = [
  440, 160, 160, 180, 220,
  180, 180, 220, 140, 100,
  90, 120, 200, 180, 170,
  210, 180, 180, 220, 320,
  85, 70, 85, 110, 240,
] as const;

const TALK_DURATIONS = [
  360, 110, 100, 90, 90,
  90, 85, 85, 80, 80,
  90, 100, 120, 150, 130,
  100, 120, 100, 100, 100,
  110, 120, 130, 150, 360,
] as const;

const SERVICE_DURATIONS = [
  260, 110, 110, 120,
  120, 110, 100, 90,
  110, 260, 130, 110,
  110, 120, 140, 320,
] as const;

const WINK_DURATIONS = [
  260, 100, 95, 90,
  90, 100, 110, 120,
  220, 110, 100, 100,
  110, 120, 140, 320,
] as const;

const SWEAT_DURATIONS = [
  300, 120, 110, 110,
  110, 100, 100, 180,
  180, 110, 100, 100,
  110, 120, 140, 340,
] as const;

const CONCERNED_DURATIONS = [
  300, 130, 120, 120,
  110, 110, 100, 180,
  150, 120, 110, 110,
  120, 130, 150, 360,
] as const;

const GLITCH_DURATIONS = [
  320, 120, 100, 90,
  90, 80, 80, 100,
  220, 90, 90, 100,
  110, 120, 150, 360,
] as const;

export const BELLHOP_MOTIONS: Record<BellhopMotion, SpriteAnimationConfig> = {
  idle: atlas(bellhopIdleAtlas, 5, frames(25), IDLE_DURATIONS, true),
  talk: atlas(bellhopTalkAtlas, 5, frames(25), TALK_DURATIONS, true),
  service: atlas(bellhopServiceAtlas, 4, frames(16), SERVICE_DURATIONS, false),
  wink: atlas(bellhopWinkAtlas, 4, frames(16), WINK_DURATIONS, true),
  sweat: atlas(bellhopSweatAtlas, 4, frames(16), SWEAT_DURATIONS, true),
  concerned: atlas(bellhopConcernedAtlas, 4, frames(16), CONCERNED_DURATIONS, true),
  glitch: atlas(bellhopGlitchAtlas, 4, frames(16), GLITCH_DURATIONS, true),
};

// Frames 20-24 of the idle sheet were drawn specifically as a cartoon handoff:
// neutral -> one-pixel compression -> rebound -> overshoot -> exact neutral.
// The animation director inserts this short bridge between different emotions,
// so a speaking arm never snaps directly into a worried or service pose.
export const BELLHOP_BRIDGE = atlas(
  bellhopIdleAtlas,
  5,
  [20, 21, 22, 23, 24],
  [90, 80, 90, 120, 180],
  false,
);

export const SHOP_VFX_MOTIONS: Record<ShopVfxMotion, SpriteAnimationConfig> = {
  ambient: atlas(shopVfxAtlas, 4, [0, 1, 2, 3], [900, 760, 820, 980], true, 0.2),
  bell: atlas(shopVfxAtlas, 4, [4, 5, 6, 7], [120, 145, 175, 260], false, 0.24),
  purchase: atlas(shopVfxAtlas, 4, [8, 9, 10, 11], [170, 155, 220, 320], false, 0.24),
  glitch: atlas(shopVfxAtlas, 4, [12, 13, 14, 15], [120, 100, 150, 220], false, 0.18),
};
