import type { SpriteAnimationConfig } from './SpriteEngine';
import bellhopIdleAtlas from './assets/shop/bellhop-idle-atlas-v1.webp';
import bellhopTalkAtlas from './assets/shop/bellhop-talk-atlas-v1.webp';
import bellhopServiceAtlas from './assets/shop/bellhop-service-atlas-v1.webp';
import bellhopReactionsAAtlas from './assets/shop/bellhop-reactions-a-atlas-v1.webp';
import bellhopReactionsBAtlas from './assets/shop/bellhop-reactions-b-atlas-v1.webp';
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
const ALL_16 = Array.from({ length: 16 }, (_, index) => index);
const ALL_32 = Array.from({ length: 32 }, (_, index) => index);
const WINK_16 = [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23];
const SWEAT_16 = [8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31];

const atlas = (
  imageUrl: string,
  frameSequence: readonly number[],
  frameDurationsMs: readonly number[],
  loop: boolean,
  blendRatio: number,
): SpriteAnimationConfig => ({
  imageUrl,
  frameCount: frameSequence.length,
  frameWidth: FRAME,
  frameHeight: FRAME,
  columns: 4,
  frameSequence,
  frameDurationsMs,
  cycleMs: frameDurationsMs.reduce((sum, duration) => sum + duration, 0),
  loop,
  blendRatio,
  pixelated: true,
});

export const BELLHOP_MOTIONS: Record<BellhopMotion, SpriteAnimationConfig> = {
  // Moving holds are deliberately longer than breakdowns: the character feels
  // alive without vibrating constantly, while the blink still reads crisply.
  idle: atlas(
    bellhopIdleAtlas,
    ALL_32,
    [
      122, 92, 82, 78, 68, 60, 58, 62, 68, 78, 88, 96, 86, 80, 78, 94,
      96, 84, 82, 76, 70, 66, 72, 88, 82, 76, 74, 88, 78, 80, 86, 104,
    ],
    true,
    0.34,
  ),
  talk: atlas(
    bellhopTalkAtlas,
    ALL_32,
    [
      68, 62, 58, 64, 62, 66, 70, 56, 52, 64, 60, 62, 72, 64, 60, 72,
      62, 58, 60, 64, 58, 62, 68, 60, 56, 62, 60, 64, 68, 62, 58, 74,
    ],
    true,
    0.46,
  ),
  service: atlas(
    bellhopServiceAtlas,
    ALL_16,
    [95, 90, 88, 86, 82, 95, 94, 100, 105, 120, 105, 145, 96, 92, 90, 160],
    false,
    0.48,
  ),
  wink: atlas(
    bellhopReactionsAAtlas,
    WINK_16,
    [112, 82, 72, 70, 98, 84, 78, 104, 88, 78, 72, 94, 80, 84, 90, 110],
    true,
    0.42,
  ),
  sweat: atlas(
    bellhopReactionsAAtlas,
    SWEAT_16,
    [116, 82, 76, 84, 102, 78, 82, 108, 90, 80, 76, 88, 82, 76, 86, 116],
    true,
    0.42,
  ),
  concerned: atlas(
    bellhopReactionsBAtlas,
    WINK_16,
    [118, 84, 78, 82, 108, 88, 84, 112, 92, 84, 80, 90, 84, 82, 92, 124],
    true,
    0.42,
  ),
  glitch: atlas(
    bellhopReactionsBAtlas,
    SWEAT_16,
    [150, 82, 74, 70, 92, 70, 76, 130, 180, 72, 66, 62, 86, 78, 96, 520],
    true,
    0.3,
  ),
};

export const SHOP_VFX_MOTIONS: Record<ShopVfxMotion, SpriteAnimationConfig> = {
  ambient: atlas(shopVfxAtlas, [0, 1, 2, 3], [520, 420, 460, 560], true, 0.62),
  bell: atlas(shopVfxAtlas, [4, 5, 6, 7], [90, 105, 125, 180], false, 0.58),
  purchase: atlas(shopVfxAtlas, [8, 9, 10, 11], [135, 115, 165, 240], false, 0.58),
  glitch: atlas(shopVfxAtlas, [12, 13, 14, 15], [90, 75, 115, 145], false, 0.42),
};
