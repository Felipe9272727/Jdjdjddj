/**
 * SpriteEngine.ts — Canvas-based sprite animation renderer
 * 
 * Substitui a animação CSS (background-position + steps) por Canvas drawImage().
 * Isso elimina o bug do "carrossel" porque controla exatamente qual frame é exibido.
 * 
 * PROBLEMA ANTERIOR:
 *   CSS animation com steps() causava frames fora de ordem, pulando, ou repetindo.
 *   Browser inconsistencies com background-position em porcentagens.
 * 
 * SOLUÇÃO:
 *   Canvas drawImage() com coordenadas exatas de cada frame.
 *   requestAnimationFrame para timing preciso e consistente.
 */

import React, { useRef, useEffect, useState } from 'react';

interface SpriteAnimationConfig {
  imageUrl: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  cycleMs: number;
  loop?: boolean;
  pixelated?: boolean;
  scale?: number;
}

interface SpriteAnimatorProps {
  config: SpriteAnimationConfig;
  className?: string;
  style?: React.CSSProperties;
  onCycleComplete?: () => void;
  paused?: boolean;
}

interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
 * Draws each frame using drawImage() with exact coordinates.
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
  const frameDuration = cycleMs > 0 ? cycleMs / frameCount : 0;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('[SpriteEngine] Failed to load:', imageUrl.slice(0, 60));
    };
    img.src = imageUrl;
    return () => {
      imageRef.current = null;
      setImageLoaded(false);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!imageLoaded || !imageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Static sprite (single frame or zero duration)
    if (frameCount <= 1 || frameDuration === 0) {
      drawFrame(0);
      return;
    }

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
        const framesToAdvance = Math.floor(elapsed / frameDuration);
        frameIndexRef.current = (frameIndexRef.current + framesToAdvance) % frameCount;
        lastFrameTimeRef.current = timestamp - (elapsed % frameDuration);

        drawFrame(frameIndexRef.current);

        if (frameIndexRef.current === 0 && onCycleComplete) {
          onCycleComplete();
        }

        if (!loop && frameIndexRef.current === frameCount - 1) {
          return;
        }
      } else {
        drawFrame(frameIndexRef.current);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

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
 * Static sprite — shows a single frame from a strip.
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
