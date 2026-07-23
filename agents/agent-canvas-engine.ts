/**
 * Agent 1: Canvas Sprite Engine
 * 
 * OBJETIVO: Substituir a animação CSS (background-position + steps) por um
 * renderer baseado em Canvas que desenha frame por frame. Isso elimina o bug
 * do "carrossel" porque controla exatamente qual pixel de qual frame é exibido.
 * 
 * PROBLEMA ATUAL:
 *   CSS: background-size: ${frames * 100}% 100%
 *        animation: bellhopClean 720ms steps(4) infinite
 *        @keyframes bellhopClean { from { background-position-x: 0% } to { background-position-x: 100% } }
 *   
 *   Isso é FRÁGIL porque:
 *   - browsers calculam steps() de forma inconsistente
 *   - background-position com porcentagens tem rounding issues
 *   - frames podem pular ou repetir
 * 
 * SOLUÇÃO:
 *   Canvas drawImage() com coordenadas exatas de cada frame.
 *   requestAnimationFrame para timing preciso.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SpriteAnimationConfig {
  /** Data URL or image URL */
  imageUrl: string;
  /** Number of frames in the strip */
  frameCount: number;
  /** Width of each frame in pixels */
  frameWidth: number;
  /** Height of each frame in pixels */
  frameHeight: number;
  /** Animation cycle duration in ms */
  cycleMs: number;
  /** Whether to loop */
  loop?: boolean;
  /** Pixel art rendering */
  pixelated?: boolean;
  /** Scale factor (default: 1) */
  scale?: number;
}

interface SpriteAnimatorProps {
  config: SpriteAnimationConfig;
  className?: string;
  style?: React.CSSProperties;
  onCycleComplete?: () => void;
  paused?: boolean;
}

/**
 * Calculate source rectangles for each frame in a horizontal sprite strip.
 */
function calculateFrames(
  frameCount: number,
  frameWidth: number,
  frameHeight: number
): SpriteFrame[] {
  const frames: SpriteFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push({
      x: i * frameWidth,
      y: 0,
      w: frameWidth,
      h: frameHeight,
    });
  }
  return frames;
}

/**
 * Canvas-based sprite animator.
 * 
 * Usage:
 *   <SpriteAnimator config={{
 *     imageUrl: BELLHOP_CLEAN_STRIP,
 *     frameCount: 4,
 *     frameWidth: 130,
 *     frameHeight: 180,
 *     cycleMs: 720,
 *     loop: true,
 *     pixelated: true,
 *   }} />
 */
export const SpriteAnimator: React.FC<SpriteAnimatorProps> = ({
  config,
  className,
  style,
  onCycleComplete,
  paused = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameIndexRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const {
    imageUrl,
    frameCount,
    frameWidth,
    frameHeight,
    cycleMs,
    loop = true,
    pixelated = true,
    scale = 1,
  } = config;

  const frames = calculateFrames(frameCount, frameWidth, frameHeight);
  const frameDuration = cycleMs / frameCount;

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('[SpriteAnimator] Failed to load image:', imageUrl.slice(0, 80));
    };
    img.src = imageUrl;
    return () => {
      imageRef.current = null;
      setImageLoaded(false);
    };
  }, [imageUrl]);

  // Animation loop
  useEffect(() => {
    if (!imageLoaded || !imageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = frameWidth * scale;
    canvas.height = frameHeight * scale;

    if (pixelated) {
      ctx.imageSmoothingEnabled = false;
    }

    const drawFrame = (index: number) => {
      if (!imageRef.current || !ctx) return;
      const frame = frames[index % frames.length];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        imageRef.current,
        frame.x, frame.y, frame.w, frame.h,
        0, 0, frameWidth * scale, frameHeight * scale
      );
    };

    const animate = (timestamp: number) => {
      if (paused) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;

      if (elapsed >= frameDuration) {
        // Advance frame(s) — handles cases where elapsed > 2 * frameDuration
        const framesToAdvance = Math.floor(elapsed / frameDuration);
        frameIndexRef.current = (frameIndexRef.current + framesToAdvance) % frameCount;
        lastFrameTimeRef.current = timestamp - (elapsed % frameDuration);

        drawFrame(frameIndexRef.current);

        // Check cycle completion
        if (frameIndexRef.current === 0 && onCycleComplete) {
          onCycleComplete();
        }

        // Stop if not looping and animation finished
        if (!loop && frameIndexRef.current === frameCount - 1) {
          return;
        }
      } else {
        // Still draw current frame (for initial render)
        drawFrame(frameIndexRef.current);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    // Initial draw
    drawFrame(0);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      frameIndexRef.current = 0;
      lastFrameTimeRef.current = 0;
    };
  }, [imageLoaded, frameCount, frameWidth, frameHeight, frameDuration, loop, scale, pixelated, paused]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        ...style,
      }}
    />
  );
};

/**
 * Static sprite frame extractor — shows a single frame from a sprite strip.
 * Useful for idle/static states (e.g., bellhop mouth closed).
 */
export const SpriteStatic: React.FC<{
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameIndex?: number;
  scale?: number;
  pixelated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({
  imageUrl,
  frameWidth,
  frameHeight,
  frameIndex = 0,
  scale = 1,
  pixelated = true,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageUrl;
    return () => { imageRef.current = null; };
  }, [imageUrl]);

  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imageRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    canvasRef.current.width = frameWidth * scale;
    canvasRef.current.height = frameHeight * scale;
    if (pixelated) ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.drawImage(
      imageRef.current,
      frameIndex * frameWidth, 0, frameWidth, frameHeight,
      0, 0, frameWidth * scale, frameHeight * scale
    );
  }, [imageLoaded, frameIndex, frameWidth, frameHeight, scale, pixelated]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', ...style }}
    />
  );
};

export default SpriteAnimator;
