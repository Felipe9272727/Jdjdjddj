import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  BELLHOP_BRIDGE,
  BELLHOP_MOTIONS,
  isBellhopPurchaseMotion,
  type BellhopMotion,
} from './shop-sprite-assets';
import { preloadSpriteImages, SpriteAnimator } from './SpriteEngine';

const BELLHOP_CORE_MOTIONS = (Object.keys(BELLHOP_MOTIONS) as BellhopMotion[])
  .filter((motion) => !isBellhopPurchaseMotion(motion));

export const preloadBellhopAnimationAssets = (
  motions: readonly BellhopMotion[] = BELLHOP_CORE_MOTIONS,
): Promise<void> => (
  preloadSpriteImages([
    ...new Set(motions.map((motion) => BELLHOP_MOTIONS[motion].imageUrl)),
  ])
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
  activeComplete: boolean;
};

type DirectorAction =
  | { type: 'request'; target: Target }
  | { type: 'begin-bridge'; now: number }
  | { type: 'finish-bridge'; target: Target; now: number }
  | { type: 'mark-active-complete' };

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
    return {
      ...state,
      phase: 'bridge',
      startedAt: action.now,
      activeComplete: false,
    };
  }

  if (action.type === 'finish-bridge') {
    return {
      phase: 'steady',
      active: action.target,
      target: action.target,
      startedAt: action.now,
      activeComplete: false,
    };
  }

  if (state.phase !== 'steady' || state.activeComplete) return state;
  return { ...state, activeComplete: true };
};

/**
 * Idle already is the neutral handoff silhouette. Finished one-shots are also
 * sitting on their authored final pose, so neither needs to wait for another
 * cycle before starting the bridge.
 */
export const shouldBeginBellhopBridgeImmediately = (
  motion: BellhopMotion,
  activeComplete: boolean,
): boolean => motion === 'idle' || activeComplete;

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
    activeComplete: false,
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

  // Decode the always-used acting atlases while the elevator doors are moving.
  // Purchase atlases are loaded individually only when selected, avoiding six
  // extra decoded 1256px bitmaps sitting in mobile memory at shop entry.
  useEffect(() => {
    void preloadBellhopAnimationAssets().catch(() => undefined);
  }, []);

  // Idle and completed one-shots are already safe to leave. Expressive loops
  // wait for SpriteAnimator to report their *real* RAF cycle boundary below.
  useEffect(() => {
    if (state.phase !== 'steady') return;
    if (state.active.requestId === state.target.requestId) return;
    if (!shouldBeginBellhopBridgeImmediately(
      state.active.motion,
      state.activeComplete,
    )) return;
    dispatch({ type: 'begin-bridge', now: now() });
  }, [state.active, state.activeComplete, state.phase, state.target]);

  const handleCycleComplete = useCallback(() => {
    if (state.phase === 'bridge') {
      dispatch({
        type: 'finish-bridge',
        target: targetRef.current,
        now: now(),
      });
      return;
    }

    const config = BELLHOP_MOTIONS[state.active.motion];
    if (config.loop === false && !state.activeComplete) {
      completeRef.current?.(state.active.motion);
      dispatch({ type: 'mark-active-complete' });
    }

    // This callback is emitted by the canvas exactly when the authored loop
    // reaches frame zero (or a one-shot reaches its final hold). Starting the
    // bridge here prevents timer/image-decode drift from cutting a pose in two.
    if (state.active.requestId !== targetRef.current.requestId) {
      dispatch({ type: 'begin-bridge', now: now() });
    }
  }, [state.active, state.activeComplete, state.phase]);

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
      onCycleComplete={handleCycleComplete}
    />
  );
};

export default BellhopAnimationDirector;
