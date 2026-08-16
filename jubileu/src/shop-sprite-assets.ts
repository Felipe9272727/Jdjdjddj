import type { SpriteAnimationConfig } from './SpriteEngine';
import bellhopIdleAtlas from './assets/shop/bellhop-idle-atlas-v8.png';
import bellhopPresentationAtlas from './assets/shop/bellhop-talk-atlas-v8.png';
import bellhopConversationAtlas from './assets/shop/bellhop-conversation-atlas-v8.png';
import bellhopWinkAtlas from './assets/shop/bellhop-wink-atlas-v8.png';
import bellhopSweatAtlas from './assets/shop/bellhop-sweat-atlas-v8.png';
import bellhopConcernedAtlas from './assets/shop/bellhop-concerned-atlas-v8.png';
import bellhopGlitchAtlas from './assets/shop/bellhop-glitch-atlas-v8.png';
import bellhopBuyFlashlightAtlas from './assets/shop/bellhop-buy-flashlight-atlas-v8.png';
import bellhopBuyCookieAtlas from './assets/shop/bellhop-buy-cookie-atlas-v8.png';
import bellhopBuyCoffeeAtlas from './assets/shop/bellhop-buy-coffee-atlas-v8.png';
import bellhopBuyKeyAtlas from './assets/shop/bellhop-buy-key-atlas-v7.webp';
import bellhopBuyFloorAtlas from './assets/shop/bellhop-buy-floor-atlas-v8.png';
import bellhopBuyMemoryAtlas from './assets/shop/bellhop-buy-memory-atlas-v8.png';
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
  420, 90, 90, 120, 160, 100, 100,
  120, 100, 100, 100, 120, 100, 100,
  100, 120, 140, 160, 140, 180, 500,
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
  idle: atlas(bellhopIdleAtlas, 4, frames(21), IDLE_DURATIONS, true),
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

// The opening neutral and its first two micro in-betweens form a deliberately
// tiny handoff. Reversing them returns to the exact neutral without exposing a
// late idle pose, so a speaking arm never snaps directly into another emotion.
export const BELLHOP_BRIDGE = atlas(
  bellhopIdleAtlas,
  4,
  [0, 1, 2, 1, 0],
  [90, 80, 90, 120, 180],
  false,
);

export const SHOP_VFX_MOTIONS: Record<ShopVfxMotion, SpriteAnimationConfig> = {
  ambient: atlas(shopVfxAtlas, 4, [0, 1, 2, 3], [900, 760, 820, 980], true, 0.2),
  bell: atlas(shopVfxAtlas, 4, [4, 5, 6, 7], [120, 145, 175, 260], false, 0.24),
  purchase: atlas(shopVfxAtlas, 4, [8, 9, 10, 11], [170, 155, 220, 320], false, 0.24),
  glitch: atlas(shopVfxAtlas, 4, [12, 13, 14, 15], [120, 100, 150, 220], false, 0.18),
};
