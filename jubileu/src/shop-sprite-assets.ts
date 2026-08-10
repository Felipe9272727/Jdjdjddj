import type { SpriteAnimationConfig } from './SpriteEngine';
import bellhopIdleAtlas from './assets/shop/bellhop-idle-atlas-v5.webp';
import bellhopPresentationAtlas from './assets/shop/bellhop-talk-atlas-v5.webp';
import bellhopConversationAtlas from './assets/shop/bellhop-conversation-atlas-v6.webp';
import bellhopWinkAtlas from './assets/shop/bellhop-wink-atlas-v5.webp';
import bellhopSweatAtlas from './assets/shop/bellhop-sweat-atlas-v5.webp';
import bellhopConcernedAtlas from './assets/shop/bellhop-concerned-atlas-v5.webp';
import bellhopGlitchAtlas from './assets/shop/bellhop-glitch-atlas-v5.webp';
import bellhopBuyFlashlightAtlas from './assets/shop/bellhop-buy-flashlight-atlas-v6.webp';
import bellhopBuyCookieAtlas from './assets/shop/bellhop-buy-cookie-atlas-v6.webp';
import bellhopBuyCoffeeAtlas from './assets/shop/bellhop-buy-coffee-atlas-v6.webp';
import bellhopBuyKeyAtlas from './assets/shop/bellhop-buy-key-atlas-v7.webp';
import bellhopBuyFloorAtlas from './assets/shop/bellhop-buy-floor-atlas-v6.webp';
import bellhopBuyMemoryAtlas from './assets/shop/bellhop-buy-memory-atlas-v6.webp';
import shopVfxAtlas from './assets/shop/shop-vfx-atlas-v1.webp';

export { default as shopBackdrop } from './assets/shop/lobby-shop-bg-v1.webp';

export type BellhopMotion =
  | 'idle'
  | 'presentation'
  | 'conversation'
  | 'wink'
  | 'sweat'
  | 'concerned'
  | 'glitch'
  | 'buy-flashlight'
  | 'buy-cookie'
  | 'buy-coffee'
  | 'buy-key'
  | 'buy-floor'
  | 'buy-memory';

export const BELLHOP_PURCHASE_MOTIONS = [
  'buy-flashlight',
  'buy-cookie',
  'buy-coffee',
  'buy-key',
  'buy-floor',
  'buy-memory',
] as const satisfies readonly BellhopMotion[];

export type BellhopPurchaseMotion = typeof BELLHOP_PURCHASE_MOTIONS[number];

export const isBellhopPurchaseMotion = (
  motion: BellhopMotion,
): motion is BellhopPurchaseMotion => (
  (BELLHOP_PURCHASE_MOTIONS as readonly BellhopMotion[]).includes(motion)
);

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
  frameSize = FRAME,
  displayScale = 1,
): SpriteAnimationConfig => ({
  imageUrl,
  frameCount: frameSequence.length,
  frameWidth: frameSize,
  frameHeight: frameSize,
  columns,
  frameSequence,
  frameDurationsMs,
  cycleMs: frameDurationsMs.reduce((sum, duration) => sum + duration, 0),
  loop,
  blendRatio,
  pixelated: true,
  displayScale,
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

const PRESENTATION_DURATIONS = [
  360, 110, 100, 90, 90,
  90, 85, 85, 80, 80,
  90, 100, 120, 150, 130,
  100, 120, 100, 100, 100,
  110, 120, 130, 150, 360,
] as const;

// A quieter two-beat speaking loop for ordinary dialogue. It deliberately
// keeps both hands close to the counter; the broad presenting arm belongs to
// the first hotel welcome only. Longer neutral exposures make the 25 unique
// drawings read as conversational acting instead of a repeated sales pitch.
const CONVERSATION_DURATIONS = [
  300, 150, 115, 105, 100,
  110, 100, 105, 115, 135,
  170, 125, 115, 120, 135,
  125, 110, 105, 110, 120,
  115, 125, 145, 180, 340,
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

// Complete counter performances: turn, reach behind the counter, retrieve the
// scene-specific prop, return, react, and settle. Holds around the prop and
// final expression keep the action readable on a phone without racing through
// the 16 hand-drawn breakdowns.
const PURCHASE_DURATIONS = [
  280, 120, 110, 120,
  140, 160, 180, 180,
  150, 180, 220, 160,
  170, 180, 220, 360,
] as const;

// SpriteCook-authored key refusal at its native 8 drawings per second. The
// longer opening/final exposures keep the one-shot readable while all 24
// unique in-betweens preserve the guarded pull-back and empty-handed refusal.
const KEY_REFUSAL_DURATIONS = [
  180, 110, 110, 110, 110, 125,
  125, 125, 125, 125, 125, 125,
  125, 125, 125, 125, 125, 125,
  125, 125, 125, 140, 160, 320,
] as const;

export const BELLHOP_MOTIONS: Record<BellhopMotion, SpriteAnimationConfig> = {
  idle: atlas(bellhopIdleAtlas, 5, frames(25), IDLE_DURATIONS, true),
  // The open-arm atlas needs a wider 400px cell so its neutral body remains
  // the same apparent size as the 314px emotional sheets. Previously bbox-fit
  // shrank all 25 frames to accommodate the widest hand, producing a visible
  // grow/shrink glitch every time the neutral bridge appeared.
  presentation: atlas(
    bellhopPresentationAtlas,
    5,
    frames(25),
    PRESENTATION_DURATIONS,
    false,
    0,
    400,
    1.035,
  ),
  conversation: atlas(
    bellhopConversationAtlas,
    5,
    frames(25),
    CONVERSATION_DURATIONS,
    true,
  ),
  wink: atlas(bellhopWinkAtlas, 4, frames(16), WINK_DURATIONS, true),
  sweat: atlas(bellhopSweatAtlas, 4, frames(16), SWEAT_DURATIONS, true),
  concerned: atlas(bellhopConcernedAtlas, 4, frames(16), CONCERNED_DURATIONS, true),
  glitch: atlas(bellhopGlitchAtlas, 4, frames(16), GLITCH_DURATIONS, true),
  'buy-flashlight': atlas(
    bellhopBuyFlashlightAtlas,
    4,
    frames(16),
    PURCHASE_DURATIONS,
    false,
  ),
  'buy-cookie': atlas(
    bellhopBuyCookieAtlas,
    4,
    frames(16),
    PURCHASE_DURATIONS,
    false,
  ),
  'buy-coffee': atlas(
    bellhopBuyCoffeeAtlas,
    4,
    frames(16),
    PURCHASE_DURATIONS,
    false,
  ),
  'buy-key': atlas(
    bellhopBuyKeyAtlas,
    6,
    frames(24),
    KEY_REFUSAL_DURATIONS,
    false,
  ),
  // An extra floor is the deliberate exception: he never turns to fetch an
  // object. The same 16 beats instead escalate from a frozen smile to panic.
  'buy-floor': {
    ...atlas(
      bellhopBuyFloorAtlas,
      4,
      frames(16),
      PURCHASE_DURATIONS,
      false,
    ),
    // The panic drawings use the full source width for flung-out arms. Shared
    // atlas fitting therefore reduced the neutral body/counter by ~15%. This
    // restores their on-stage size while retaining every fingertip.
    displayScale: 1.18,
  },
  'buy-memory': atlas(
    bellhopBuyMemoryAtlas,
    4,
    frames(16),
    PURCHASE_DURATIONS,
    false,
  ),
};

// Frames 20-24 of the idle sheet were drawn specifically as a cartoon handoff:
// neutral -> one-pixel compression -> rebound -> overshoot -> exact neutral.
// The animation director inserts this short bridge between different emotions,
// so a speaking arm never snaps directly into a worried or purchase pose.
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
