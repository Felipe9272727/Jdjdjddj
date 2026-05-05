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
 *   Frames are placed left-to-right starting at (sourceX, sourceY) inside
 *   the source image. This lets us use a master spritesheet that has many
 *   animation rows, picking just the row we need.
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';

export interface SpriteAnimationConfig {
  imageUrl: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  cycleMs: number;
  /** Top-left of the strip inside the source image. Defaults (0, 0). */
  sourceX?: number;
  sourceY?: number;
  loop?: boolean;
  pixelated?: boolean;
}

interface SpriteAnimatorProps {
  config: SpriteAnimationConfig;
  className?: string;
  style?: React.CSSProperties;
  paused?: boolean;
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const frameIndexRef = useRef(0);
  const lastTimeRef = useRef(0);

  const [status, setStatus] = useState<'pending' | 'loaded' | 'error'>('pending');

  const {
    imageUrl,
    frameCount,
    frameWidth,
    frameHeight,
    cycleMs,
    sourceX = 0,
    sourceY = 0,
    loop = true,
    pixelated = true,
  } = config;

  const frameDuration = useMemo(
    () => (cycleMs > 0 && frameCount > 0 ? cycleMs / frameCount : 0),
    [cycleMs, frameCount]
  );

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
    if (pixelated) ctx.imageSmoothingEnabled = false;

    frameIndexRef.current = 0;
    lastTimeRef.current = 0;

    const cancelRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const drawFrame = (idx: number) => {
      const safeIdx = ((idx % frameCount) + frameCount) % frameCount;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        ctx.drawImage(
          img,
          sourceX + safeIdx * frameWidth, sourceY, frameWidth, frameHeight,
          0, 0, frameWidth, frameHeight
        );
      } catch {
        /* drawImage can throw if image got detached — silent recover */
      }
    };

    drawFrame(0);

    // Static sprite — no animation needed.
    if (frameCount <= 1 || frameDuration <= 0) {
      return cancelRaf;
    }

    const tick = (t: number) => {
      if (paused) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (lastTimeRef.current === 0) lastTimeRef.current = t;
      const elapsed = t - lastTimeRef.current;
      if (elapsed >= frameDuration) {
        const advance = Math.floor(elapsed / frameDuration);
        const next = frameIndexRef.current + advance;
        const looped = !loop && next >= frameCount;
        frameIndexRef.current = looped
          ? frameCount - 1
          : ((next % frameCount) + frameCount) % frameCount;
        lastTimeRef.current = t - (elapsed % frameDuration);
        drawFrame(frameIndexRef.current);
        if (looped) { rafRef.current = null; return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelRaf;
  }, [status, imageUrl, frameCount, frameWidth, frameHeight, sourceX, sourceY, frameDuration, loop, pixelated, paused]);

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
