import React, { useEffect, useReducer, useRef } from 'react';
import {
  BELLHOP_BRIDGE,
  BELLHOP_MOTIONS,
  type BellhopMotion,
} from './shop-sprite-assets';
import { preloadSpriteImages, SpriteAnimator } from './SpriteEngine';

const BELLHOP_ASSET_URLS = [
  ...new Set(Object.values(BELLHOP_MOTIONS).map(({ imageUrl }) => imageUrl)),
];

export const preloadBellhopAnimationAssets = (): Promise<void> => (
  preloadSpriteImages(BELLHOP_ASSET_URLS)
);

type Target = {
  motion: BellhopMotion;
  requestId: string;
};

type DirectorState = {
  phase: 'steady' | 'bridge';
  active: Target;
  target: Target;
  startedAt: number;
};

type DirectorAction =
  | { type: 'request'; target: Target }
  | { type: 'begin-bridge'; now: number }
  | { type: 'finish-bridge'; target: Target; now: number };

const now = (): number => (
  typeof performance === 'undefined' ? Date.now() : performance.now()
);

const requestIdFor = (
  motion: BellhopMotion,
  restartKey?: string | number,
): string => `${motion}:${restartKey ?? 'ambient'}`;

const reducer = (state: DirectorState, action: DirectorAction): DirectorState => {
  if (action.type === 'request') {
    if (
      action.target.motion === state.target.motion
      && action.target.requestId === state.target.requestId
    ) return state;
    return { ...state, target: action.target };
  }

  if (action.type === 'begin-bridge') {
    if (state.phase !== 'steady') return state;
    return { ...state, phase: 'bridge', startedAt: action.now };
  }

  return {
    phase: 'steady',
    active: action.target,
    target: action.target,
    startedAt: action.now,
  };
};

/**
 * Wait for the current authored performance to reach its final neutral pose.
 * Idle is intentionally interruptible because its silhouette only moves by a
 * pixel; every expressive loop completes before the five-frame bridge begins.
 */
export const resolveBellhopHandoffDelay = (
  motion: BellhopMotion,
  elapsedMs: number,
): number => {
  if (motion === 'idle') return 0;
  const config = BELLHOP_MOTIONS[motion];
  const cycleMs = Math.max(1, config.cycleMs);
  const safeElapsed = Math.max(0, elapsedMs);
  if (config.loop === false && safeElapsed >= cycleMs) return 0;
  const position = safeElapsed % cycleMs;
  return position === 0 && safeElapsed > 0 ? 0 : cycleMs - position;
};

export interface BellhopAnimationDirectorProps {
  motion: BellhopMotion;
  restartKey?: string | number;
  className?: string;
  style?: React.CSSProperties;
  paused?: boolean;
  onMotionComplete?: (motion: BellhopMotion) => void;
}

/**
 * Plays the bellhop like one continuous cartoon performance:
 *
 * current action -> its authored neutral ending -> five-frame bridge -> target.
 *
 * A latest-target ref lets quick dialogue changes retarget the end of an
 * already-running bridge without restarting it or flashing an empty canvas.
 */
export const BellhopAnimationDirector: React.FC<BellhopAnimationDirectorProps> = ({
  motion,
  restartKey,
  className,
  style,
  paused = false,
  onMotionComplete,
}) => {
  const requested: Target = {
    motion,
    requestId: requestIdFor(motion, restartKey),
  };
  const [state, dispatch] = useReducer(reducer, undefined, (): DirectorState => ({
    phase: 'steady',
    active: requested,
    target: requested,
    startedAt: now(),
  }));
  const targetRef = useRef<Target>(requested);
  const completeRef = useRef(onMotionComplete);

  useEffect(() => {
    completeRef.current = onMotionComplete;
  }, [onMotionComplete]);

  useEffect(() => {
    const target = { motion, requestId: requestIdFor(motion, restartKey) };
    targetRef.current = target;
    dispatch({ type: 'request', target });
  }, [motion, restartKey]);

  // Decode every atlas while the elevator doors are moving. SpriteEngine's
  // module cache then hands the exact same Image objects to the live canvas.
  useEffect(() => {
    void preloadBellhopAnimationAssets().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (state.phase !== 'steady') return;
    if (state.active.requestId === state.target.requestId) return;
    const delay = resolveBellhopHandoffDelay(
      state.active.motion,
      now() - state.startedAt,
    );
    const timer = window.setTimeout(() => {
      dispatch({ type: 'begin-bridge', now: now() });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state.active, state.phase, state.startedAt, state.target]);

  useEffect(() => {
    if (state.phase !== 'bridge') return;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'finish-bridge', target: targetRef.current, now: now() });
    }, BELLHOP_BRIDGE.cycleMs);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.startedAt]);

  // One-shot animations report their real completion. The shop therefore
  // cannot dismiss a purchase performance before a delayed handoff has even
  // allowed the service atlas to start.
  useEffect(() => {
    if (state.phase !== 'steady') return;
    const config = BELLHOP_MOTIONS[state.active.motion];
    if (config.loop !== false) return;
    const timer = window.setTimeout(() => {
      completeRef.current?.(state.active.motion);
    }, config.cycleMs);
    return () => window.clearTimeout(timer);
  }, [state.active, state.phase, state.startedAt]);

  const config = state.phase === 'bridge'
    ? BELLHOP_BRIDGE
    : BELLHOP_MOTIONS[state.active.motion];
  const timelineKey = state.phase === 'bridge'
    ? `bridge:${state.startedAt}`
    : `${state.active.requestId}:${state.startedAt}`;

  return (
    <SpriteAnimator
      config={config}
      restartKey={timelineKey}
      className={className}
      style={style}
      paused={paused}
    />
  );
};

export default BellhopAnimationDirector;
