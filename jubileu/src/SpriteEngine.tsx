/**
 * SpriteEngine.tsx — Canvas-based sprite animator (crash-resistant rewrite)
 *
 * Why this rewrite (vs. the previous version):
 *   • The old version was remounted via `key={spriteMode}` on every mode
 *     change, which destroyed the canvas + image, ran cleanup, then re-loaded
 *     and re-decoded the (530KB base64) image. Under fast switches that
 *     pattern leaked RAF handles and caused intermittent freezes/crashes.
 *   • We now keep the canvas mounted and just react to config changes:
 *       - image URL change → reload (cached)
 *       - frame metadata change → reset animation pointer & redraw
 *   • A module-level <img> cache means every <SpriteAnimator> using the
 *     same URL shares one decoded bitmap (no duplicate downloads).
 *   • RAF is cancelled on cleanup AND before any reschedule. There is at
 *     most one outstanding handle at any time.
 *   • If the image fails to load (network blip, CORS), we render a small
 *     placeholder box instead of throwing — the shop UI still works.
 *
 * Frame layout:
 *   Legacy strips still work left-to-right. New animations can use a grid
 *   atlas, a custom frame order and per-pose exposure times. The final part
 *   of each pose can cross-fade into the next breakdown, evaluated from the
 *   RAF timestamp so 60/90/120 Hz screens all play at the same speed.
 */

import React, { useRef, useEffect, useState } from 'react';
import { resolveSpriteTimeline } from './sprite-timeline';

export interface SpriteAnimationConfig {
  imageUrl: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  cycleMs: number;
  /** Top-left of the strip inside the source image. Defaults (0, 0). */
  sourceX?: number;
  sourceY?: number;
  /** Number of cells per atlas row. Defaults to frameCount (legacy strip). */
  columns?: number;
  /** Atlas-cell indices in playback order. Defaults to 0..frameCount - 1. */
  frameSequence?: readonly number[];
  /** Exposure time for each logical pose. Falls back to cycleMs / frameCount. */
  frameDurationsMs?: readonly number[];
  /** Portion at the end of a pose used to ease into the next one (0..0.85). */
  blendRatio?: number;
  loop?: boolean;
  pixelated?: boolean;
}

interface SpriteAnimatorProps {
  config: SpriteAnimationConfig;
  className?: string;
  style?: React.CSSProperties;
  paused?: boolean;
  /** Restart the timeline without remounting (and briefly blanking) canvas. */
  restartKey?: string | number;
}

// ─── Module-level image cache ─────────────────────────────────────────────
// One <img> per URL, shared across all SpriteAnimator instances. Status
// transitions: 'pending' → 'loaded' | 'error'.
type CacheEntry = {
  img: HTMLImageElement;
  status: 'pending' | 'loaded' | 'error';
  listeners: Set<(status: 'loaded' | 'error') => void>;
};
const imageCache = new Map<string, CacheEntry>();

function getCachedImage(url: string): CacheEntry {
  const existing = imageCache.get(url);
  if (existing) return existing;
  const img = new Image();
  // crossOrigin so canvas drawImage() doesn't taint the canvas if we ever
  // need to read pixels back. raw.githubusercontent.com sends ACAO:*.
  img.crossOrigin = 'anonymous';
  const entry: CacheEntry = { img, status: 'pending', listeners: new Set() };
  img.onload = () => {
    entry.status = 'loaded';
    entry.listeners.forEach((cb) => cb('loaded'));
    entry.listeners.clear();
  };
  img.onerror = () => {
    entry.status = 'error';
    entry.listeners.forEach((cb) => cb('error'));
    entry.listeners.clear();
  };
  img.src = url;
  imageCache.set(url, entry);
  return entry;
}

// ─── Animator ─────────────────────────────────────────────────────────────
export const SpriteAnimator: React.FC<SpriteAnimatorProps> = ({
  config,
  className,
  style,
  paused = false,
  restartKey,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<'pending' | 'loaded' | 'error'>('pending');

  const {
    imageUrl,
    frameCount,
    frameWidth,
    frameHeight,
    cycleMs,
    sourceX = 0,
    sourceY = 0,
    columns = frameCount,
    frameSequence,
    frameDurationsMs,
    blendRatio = 0,
    loop = true,
    pixelated = true,
  } = config;

  // Subscribe to image load status — never throws, just flips to 'error'
  // on failure so the placeholder renders.
  useEffect(() => {
    let cancelled = false;
    const entry = getCachedImage(imageUrl);
    if (entry.status !== 'pending') {
      setStatus(entry.status);
      return;
    }
    setStatus('pending');
    const cb = (s: 'loaded' | 'error') => { if (!cancelled) setStatus(s); };
    entry.listeners.add(cb);
    return () => {
      cancelled = true;
      entry.listeners.delete(cb);
    };
  }, [imageUrl]);

  // Draw + animate. Whenever ANY of the deps change, cancel current RAF and
  // restart from frame 0. There is never more than one RAF outstanding.
  useEffect(() => {
    if (status !== 'loaded') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const entry = imageCache.get(imageUrl);
    if (!entry || entry.status !== 'loaded') return;
    const img = entry.img;

    canvas.width = frameWidth;
    canvas.height = frameHeight;
    ctx.imageSmoothingEnabled = !pixelated;

    const cancelRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const logicalFrameCount = Math.max(1, Math.floor(frameCount));
    const safeColumns = Math.max(1, Math.floor(columns));
    const sequence = Array.from({ length: logicalFrameCount }, (_, index) => {
      const candidate = frameSequence?.[index] ?? index;
      return Number.isFinite(candidate) ? Math.max(0, Math.floor(candidate)) : index;
    });
    const fallbackDuration = cycleMs > 0 ? cycleMs / logicalFrameCount : 0;
    const durations = Array.from({ length: logicalFrameCount }, (_, index) => {
      const candidate = frameDurationsMs?.[index] ?? fallbackDuration;
      return Number.isFinite(candidate) ? Math.max(1, candidate) : 1;
    });

    const drawCell = (logicalIndex: number, alpha: number) => {
      const safeIndex = Math.max(0, Math.min(sequence.length - 1, logicalIndex));
      const atlasIndex = sequence[safeIndex];
      const column = atlasIndex % safeColumns;
      const row = Math.floor(atlasIndex / safeColumns);
      try {
        ctx.globalAlpha = alpha;
        ctx.drawImage(
          img,
          sourceX + column * frameWidth,
          sourceY + row * frameHeight,
          frameWidth,
          frameHeight,
          0, 0, frameWidth, frameHeight
        );
      } catch {
        /* drawImage can throw if image got detached — silent recover */
      }
    };

    const drawPose = (index: number, nextIndex: number, mix: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Keep the current drawing fully opaque, then dissolve the next one on
      // top. Fading BOTH layers on a transparent canvas made their combined
      // alpha fall to 75% at the midpoint, so the bellhop visibly blinked dark
      // several times per second. Source-over on an opaque sprite area gives
      // the desired interpolation while never exposing the empty canvas.
      drawCell(index, 1);
      if (mix > 0 && nextIndex !== index) drawCell(nextIndex, mix);
      ctx.globalAlpha = 1;
    };

    drawPose(0, 0, 0);

    // Static sprite — no animation needed.
    if (logicalFrameCount <= 1 || (cycleMs <= 0 && !frameDurationsMs?.length)) {
      return cancelRaf;
    }

    let startedAt: number | null = null;
    const tick = (timestamp: number) => {
      if (paused) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (startedAt === null) startedAt = timestamp;
      const pose = resolveSpriteTimeline(timestamp - startedAt, durations, loop, blendRatio);
      drawPose(pose.index, pose.nextIndex, pose.mix);
      if (pose.done) { rafRef.current = null; return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelRaf;
  }, [
    status,
    imageUrl,
    frameCount,
    frameWidth,
    frameHeight,
    cycleMs,
    sourceX,
    sourceY,
    columns,
    frameSequence,
    frameDurationsMs,
    blendRatio,
    loop,
    pixelated,
    paused,
    restartKey,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div
        className={className}
        style={{
          ...style,
          background: '#1a0a08',
          border: '2px dashed #C99B36',
          color: '#C99B36',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          letterSpacing: '0.2em',
        }}
      >
        SPRITE OFFLINE
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        imageRendering: pixelated ? 'pixelated' : 'auto',
        ...style,
      }}
    />
  );
};

// ─── Static single-frame sprite ──────────────────────────────────────────
export const SpriteStatic: React.FC<{
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameIndex?: number;
  sourceX?: number;
  sourceY?: number;
  pixelated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({
  imageUrl,
  frameWidth,
  frameHeight,
  frameIndex = 0,
  sourceX = 0,
  sourceY = 0,
  pixelated = true,
  className,
  style,
}) => (
  <SpriteAnimator
    className={className}
    style={style}
    config={{
      imageUrl,
      frameCount: 1,
      frameWidth,
      frameHeight,
      cycleMs: 0,
      sourceX: sourceX + frameIndex * frameWidth,
      sourceY,
      loop: false,
      pixelated,
    }}
  />
);

export default SpriteAnimator;
