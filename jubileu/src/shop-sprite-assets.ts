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
type PoseStep = readonly [frame: number, exposureMs: number];

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

const poseAtlas = (
  imageUrl: string,
  steps: readonly PoseStep[],
  loop: boolean,
): SpriteAnimationConfig => atlas(
  imageUrl,
  steps.map(([frame]) => frame),
  steps.map(([, exposureMs]) => exposureMs),
  loop,
  // These are pixel-art key poses, not video frames. Cross-fading them creates
  // double arms/faces and looks like a flash; timed holds read as intentional
  // pose-to-pose animation and remain smooth at any display refresh rate.
  0,
);

const gestureRow = (
  firstFrame: number,
  stepMs = 145,
  accentMs = 210,
): PoseStep[] => [
  [firstFrame, stepMs],
  [firstFrame + 1, stepMs],
  [firstFrame + 2, stepMs],
  [firstFrame + 3, accentMs],
  [firstFrame + 2, stepMs],
  [firstFrame + 1, stepMs],
];

const IDLE_STEPS: PoseStep[] = [
  [0, 520],
  ...gestureRow(0, 170, 230),
  [0, 620],
  ...gestureRow(4, 150, 230),
  [0, 760],
  ...gestureRow(12, 180, 280),
  [0, 720],
  ...gestureRow(20, 185, 300),
  [0, 760],
  ...gestureRow(28, 185, 320),
  [0, 900],
];

// Each generated atlas row is one gesture bank. Playing the whole 4x8 sheet
// linearly made the bellhop jump from wave to shrug to pointing in ~2 seconds.
// We now play every row forward/back (anticipation -> accent -> settle), with a
// tiny neutral beat between gestures. All 32 drawings still appear, just with
// enough exposure for a human eye to read them.
const TALK_STEPS: PoseStep[] = [
  [0, 220],
  ...gestureRow(0, 135, 185), [0, 180],
  ...gestureRow(4, 140, 195), [0, 180],
  ...gestureRow(8, 145, 205), [0, 190],
  ...gestureRow(12, 140, 200), [0, 180],
  ...gestureRow(16, 145, 205), [0, 190],
  ...gestureRow(20, 140, 200), [0, 180],
  ...gestureRow(24, 145, 210), [0, 190],
  ...gestureRow(28, 140, 205), [0, 260],
];

const reactionSteps = (
  rowStarts: readonly number[],
  homeFrame: number,
  stepMs = 155,
  accentMs = 240,
): PoseStep[] => [
  [homeFrame, 360],
  ...rowStarts.flatMap((rowStart) => [
    ...gestureRow(rowStart, stepMs, accentMs),
    [homeFrame, 280] as PoseStep,
  ]),
  [homeFrame, 520],
];

const GLITCH_STEPS: PoseStep[] = [
  [8, 620],
  ...gestureRow(8, 105, 150), [8, 460],
  ...gestureRow(12, 90, 135), [8, 720],
  ...gestureRow(24, 100, 145), [8, 520],
  ...gestureRow(28, 90, 130), [8, 900],
];

export const BELLHOP_MOTIONS: Record<BellhopMotion, SpriteAnimationConfig> = {
  idle: poseAtlas(bellhopIdleAtlas, IDLE_STEPS, true),
  talk: poseAtlas(bellhopTalkAtlas, TALK_STEPS, true),
  service: poseAtlas(
    bellhopServiceAtlas,
    ALL_16.map((frame, index) => [
      frame,
      index === 0 ? 280 : index === 15 ? 520 : index >= 6 && index <= 12 ? 220 : 190,
    ] as PoseStep),
    false,
  ),
  wink: poseAtlas(
    bellhopReactionsAAtlas,
    reactionSteps([0, 4, 16, 20], 0),
    true,
  ),
  sweat: poseAtlas(
    bellhopReactionsAAtlas,
    reactionSteps([8, 12, 24, 28], 8, 165, 255),
    true,
  ),
  concerned: poseAtlas(
    bellhopReactionsBAtlas,
    reactionSteps([0, 4, 16, 20], 0, 165, 260),
    true,
  ),
  glitch: poseAtlas(bellhopReactionsBAtlas, GLITCH_STEPS, true),
};

export const SHOP_VFX_MOTIONS: Record<ShopVfxMotion, SpriteAnimationConfig> = {
  ambient: atlas(shopVfxAtlas, [0, 1, 2, 3], [900, 760, 820, 980], true, 0.2),
  bell: atlas(shopVfxAtlas, [4, 5, 6, 7], [120, 145, 175, 260], false, 0.24),
  purchase: atlas(shopVfxAtlas, [8, 9, 10, 11], [170, 155, 220, 320], false, 0.24),
  glitch: atlas(shopVfxAtlas, [12, 13, 14, 15], [120, 100, 150, 220], false, 0.18),
};
