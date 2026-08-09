import React, { useEffect, useRef, useState } from 'react';
import bellhopBody from './assets/shop/bellhop-rig-body-v3.png';
import bellhopDesk from './assets/shop/bellhop-rig-desk-v3.png';
import bellhopArm from './assets/shop/bellhop-rig-arm-v3.png';
import bellhopRestArm from './assets/shop/bellhop-rig-rest-arm-v3.png';
import bellhopMouth from './assets/shop/bellhop-rig-mouth-v3.png';
import bellhopBlink from './assets/shop/bellhop-rig-blink-v3.png';

export type BellhopPerformanceMotion = 'idle' | 'talk';

export interface BellhopRigPose {
  armDeg: number;
  bodyY: number;
  bodyScaleY: number;
  bodyRotateDeg: number;
  gestureArmOpacity: number;
  restArmOpacity: number;
  mouthOpen: number;
  blink: number;
}

interface BellhopPerformanceAnimatorProps {
  motion: BellhopPerformanceMotion;
  className?: string;
  style?: React.CSSProperties;
}

const SOURCE_SIZE = 628;
const SHOULDER = { x: 383, y: 291 };
const REST_ARM = 65;
const TALK_CYCLE_MS = 3_600;
const ASSET_URLS = [
  bellhopBody,
  bellhopDesk,
  bellhopArm,
  bellhopRestArm,
  bellhopMouth,
  bellhopBlink,
] as const;

const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>();

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
const smootherStep = (value: number) => (
  value * value * value * (value * (value * 6 - 15) + 10)
);

const segment = (
  progress: number,
  start: number,
  end: number,
  easing: (value: number) => number = smootherStep,
) => easing(clamp01((progress - start) / Math.max(0.0001, end - start)));

const blinkAmount = (elapsedMs: number) => {
  const blinkClock = elapsedMs % 4_650;
  if (blinkClock > 175) return 0;
  return Math.sin((blinkClock / 175) * Math.PI);
};

export const resolveBellhopRigPose = (
  elapsedMs: number,
  motion: BellhopPerformanceMotion,
  ambientElapsedMs = elapsedMs,
): BellhopRigPose => {
  if (motion === 'idle') {
    const breath = Math.sin(ambientElapsedMs / 620);
    return {
      armDeg: REST_ARM + Math.sin(ambientElapsedMs / 1_450) * 0.65,
      bodyY: breath * 0.9,
      bodyScaleY: 1 + breath * 0.0025,
      bodyRotateDeg: Math.sin(ambientElapsedMs / 1_900) * 0.16,
      gestureArmOpacity: 0,
      restArmOpacity: 1,
      mouthOpen: 0,
      blink: blinkAmount(ambientElapsedMs),
    };
  }

  const progress = (elapsedMs % TALK_CYCLE_MS) / TALK_CYCLE_MS;
  let armDeg = REST_ARM;
  let gestureArmOpacity = 0;
  let restArmOpacity = 1;

  if (progress >= 0.12 && progress < 0.23) {
    const amount = segment(progress, 0.12, 0.23);
    armDeg = lerp(REST_ARM, 48, amount);
  } else if (progress >= 0.23 && progress < 0.5) {
    const amount = segment(progress, 0.23, 0.5, smootherStep);
    armDeg = lerp(48, -5, amount);
  } else if (progress >= 0.5 && progress < 0.62) {
    const amount = segment(progress, 0.5, 0.62, easeOutCubic);
    armDeg = lerp(-5, 0, amount);
  } else if (progress >= 0.62 && progress < 0.76) {
    const hold = (progress - 0.62) / 0.14;
    armDeg = Math.sin(hold * Math.PI * 2) * 0.45;
  } else if (progress >= 0.76) {
    const amount = segment(progress, 0.76, 1);
    armDeg = lerp(0, REST_ARM, amount);
  }

  if (progress >= 0.12 && progress < 0.23) {
    const swap = segment(progress, 0.12, 0.23);
    restArmOpacity = 1 - swap;
    gestureArmOpacity = swap;
  } else if (progress >= 0.23 && progress < 0.88) {
    restArmOpacity = 0;
    gestureArmOpacity = 1;
  } else if (progress >= 0.88) {
    const swap = segment(progress, 0.88, 1);
    restArmOpacity = swap;
    gestureArmOpacity = 1 - swap;
  }

  const presentation = Math.sin(segment(progress, 0.18, 0.78) * Math.PI);
  const speechPulse = Math.sin(ambientElapsedMs / 115);
  return {
    armDeg,
    bodyY: -presentation * 2.4 + speechPulse * 0.35,
    bodyScaleY: 1 + presentation * 0.004 + speechPulse * 0.001,
    bodyRotateDeg: -presentation * 0.45 + Math.sin(ambientElapsedMs / 380) * 0.1,
    gestureArmOpacity,
    restArmOpacity,
    mouthOpen: 0.18 + (speechPulse + 1) * 0.41,
    blink: blinkAmount(ambientElapsedMs),
  };
};

const loadImage = (url: string) => {
  const cached = imagePromiseCache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      imagePromiseCache.delete(url);
      reject(new Error(`Failed to load bellhop rig asset: ${url}`));
    };
    image.decoding = 'async';
    image.src = url;
  });
  imagePromiseCache.set(url, promise);
  return promise;
};

const loadAssets = async () => Promise.all(ASSET_URLS.map(loadImage));

export const preloadBellhopPerformanceAssets = loadAssets;

const drawWithOpacity = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  opacity: number,
) => {
  if (opacity <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = clamp01(opacity);
  ctx.drawImage(image, 0, 0, SOURCE_SIZE, SOURCE_SIZE);
  ctx.restore();
};

export const BellhopPerformanceAnimator: React.FC<BellhopPerformanceAnimatorProps> = ({
  motion,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef(motion);
  const motionStartedAtRef = useRef(0);
  const animationStartedAtRef = useRef(0);
  const displayedPoseRef = useRef<BellhopRigPose>(resolveBellhopRigPose(0, 'idle'));
  const [assets, setAssets] = useState<HTMLImageElement[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    motionRef.current = motion;
    motionStartedAtRef.current = performance.now();
  }, [motion]);

  useEffect(() => {
    let cancelled = false;
    loadAssets()
      .then((loaded) => { if (!cancelled) setAssets(loaded); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!assets) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = SOURCE_SIZE;
    canvas.height = SOURCE_SIZE;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const [body, desk, arm, restArm, mouth, blink] = assets;
    let frameRequest = 0;
    let lastTimestamp = performance.now();

    const draw = (timestamp: number) => {
      if (animationStartedAtRef.current === 0) animationStartedAtRef.current = timestamp;
      const deltaMs = Math.min(50, Math.max(0, timestamp - lastTimestamp));
      lastTimestamp = timestamp;
      const elapsed = Math.max(0, timestamp - motionStartedAtRef.current);
      const ambientElapsed = timestamp - animationStartedAtRef.current;
      const target = resolveBellhopRigPose(elapsed, motionRef.current, ambientElapsed);
      const smoothing = 1 - Math.exp(-deltaMs / 70);
      const previous = displayedPoseRef.current;
      const pose: BellhopRigPose = {
        armDeg: lerp(previous.armDeg, target.armDeg, smoothing),
        bodyY: lerp(previous.bodyY, target.bodyY, smoothing),
        bodyScaleY: lerp(previous.bodyScaleY, target.bodyScaleY, smoothing),
        bodyRotateDeg: lerp(previous.bodyRotateDeg, target.bodyRotateDeg, smoothing),
        gestureArmOpacity: lerp(previous.gestureArmOpacity, target.gestureArmOpacity, smoothing * 1.4),
        restArmOpacity: lerp(previous.restArmOpacity, target.restArmOpacity, smoothing * 1.4),
        mouthOpen: lerp(previous.mouthOpen, target.mouthOpen, smoothing * 1.6),
        blink: target.blink,
      };
      displayedPoseRef.current = pose;

      ctx.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);

      // Character layers breathe together around the desk line while the desk
      // itself remains mathematically fixed, eliminating the old visual shake.
      ctx.save();
      ctx.translate(SOURCE_SIZE / 2, 421 + pose.bodyY);
      ctx.rotate((pose.bodyRotateDeg * Math.PI) / 180);
      ctx.scale(1, pose.bodyScaleY);
      ctx.translate(-SOURCE_SIZE / 2, -421);

      // requestAnimationFrame supplies a genuine micro-pose every display
      // refresh instead of repeating atlas drawings.
      ctx.save();
      ctx.globalAlpha = clamp01(pose.gestureArmOpacity);
      ctx.translate(SHOULDER.x, SHOULDER.y);
      ctx.rotate((pose.armDeg * Math.PI) / 180);
      ctx.drawImage(arm, -SHOULDER.x, -SHOULDER.y, SOURCE_SIZE, SOURCE_SIZE);
      ctx.restore();

      drawWithOpacity(ctx, restArm, pose.restArmOpacity);
      ctx.drawImage(body, 0, 0, SOURCE_SIZE, SOURCE_SIZE);
      drawWithOpacity(ctx, mouth, pose.mouthOpen);
      drawWithOpacity(ctx, blink, pose.blink);
      ctx.restore();

      ctx.drawImage(desk, 0, 0, SOURCE_SIZE, SOURCE_SIZE);
      frameRequest = requestAnimationFrame(draw);
    };

    frameRequest = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRequest);
  }, [assets]);

  if (failed) {
    return <div className={className} style={style}>RIG OFFLINE</div>;
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', imageRendering: 'auto', ...style }}
      aria-hidden
    />
  );
};

export default BellhopPerformanceAnimator;
