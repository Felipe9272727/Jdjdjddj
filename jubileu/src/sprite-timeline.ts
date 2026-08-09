export interface SpriteTimelinePose {
  index: number;
  nextIndex: number;
  mix: number;
  done: boolean;
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Resolve a sprite animation from elapsed real time rather than render ticks.
 *
 * The discrete drawings stay readable for most of their exposure. During the
 * final part of a drawing we blend briefly into the next breakdown, which is
 * the same late-transition approach used by the Floor 8 atlases. Because the
 * caller evaluates this on requestAnimationFrame, the blend is smooth on 60,
 * 90 and 120 Hz displays without making the animation run faster.
 */
export function resolveSpriteTimeline(
  elapsedMs: number,
  frameDurationsMs: readonly number[],
  loop: boolean,
  blendRatio: number,
): SpriteTimelinePose {
  if (frameDurationsMs.length === 0) {
    return { index: 0, nextIndex: 0, mix: 0, done: true };
  }

  const durations = frameDurationsMs.map((duration) =>
    Number.isFinite(duration) ? Math.max(1, duration) : 1
  );
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;

  if (!loop && safeElapsed >= total) {
    const last = durations.length - 1;
    return { index: last, nextIndex: last, mix: 0, done: true };
  }

  let playhead = loop ? safeElapsed % total : safeElapsed;
  let index = 0;
  while (index < durations.length - 1 && playhead >= durations[index]) {
    playhead -= durations[index];
    index += 1;
  }

  const nextIndex = index === durations.length - 1
    ? (loop ? 0 : index)
    : index + 1;
  const clampedBlend = Math.max(0, Math.min(0.85, blendRatio));
  const progress = playhead / durations[index];
  const blendStart = 1 - clampedBlend;
  const mix = clampedBlend > 0 && nextIndex !== index && progress > blendStart
    ? smoothstep((progress - blendStart) / clampedBlend)
    : 0;

  return { index, nextIndex, mix, done: false };
}
