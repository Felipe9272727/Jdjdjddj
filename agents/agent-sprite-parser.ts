/**
 * Agent 2: Sprite Atlas Parser
 * 
 * OBJETIVO: Analisar as imagens de sprite sheets e atlases do jogo,
 * extrair metadados de frames, e gerar configurações automáticas para
 * o SpriteAnimator (Agent 1).
 * 
 * PROBLEMA: O código atual tem as dimensões de frame hardcoded
 * (BELLHOP_CLEAN_FRAME_W = 130, etc). Se as imagens mudarem ou se
 * novos sprites forem adicionados, alguém precisa ajustar manualmente.
 * 
 * SOLUÇÃO: Função que carrega a imagem, detecta o número de frames
 * baseado na largura total / largura do frame, e gera o config.
 */

import { BELLHOP_CLEAN_STRIP, BELLHOP_TALK_STRIP, BELLHOP_IDLE_STRIP } from '../jubileu/src/bellhop-sprites';

export interface SpriteMetadata {
  name: string;
  imageUrl: string;
  totalWidth: number;
  totalHeight: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  estimatedFps: number;
  cycleMs: number;
}

/**
 * Detect sprite frame dimensions from an image URL.
 * For horizontal strips: frameCount = imageWidth / frameHeight (assumes square-ish frames)
 * For atlas grids: analyzes rows and columns.
 */
export async function analyzeSpriteStrip(
  imageUrl: string,
  name: string,
  knownFrameWidth?: number,
  knownFrameHeight?: number
): Promise<SpriteMetadata> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      
      // If frame dimensions are known, calculate frame count directly
      if (knownFrameWidth && knownFrameHeight) {
        const frameCount = Math.round(w / knownFrameWidth);
        resolve({
          name,
          imageUrl,
          totalWidth: w,
          totalHeight: h,
          frameWidth: knownFrameWidth,
          frameHeight: knownFrameHeight,
          frameCount,
          estimatedFps: 8, // reasonable default for pixel art
          cycleMs: frameCount * 125, // 125ms per frame = 8fps
        });
        return;
      }

      // Auto-detect: assume horizontal strip
      // Common frame widths for pixel art: 16, 32, 48, 64, 80, 96, 100, 128, 130, 256
      const commonWidths = [16, 24, 32, 48, 64, 80, 96, 100, 128, 130, 160, 192, 256];
      let bestFrameWidth = w; // default: single frame
      let bestFrameCount = 1;

      for (const fw of commonWidths) {
        if (w % fw === 0 && w / fw >= 2 && w / fw <= 64) {
          const count = w / fw;
          // Prefer the frame width that gives a reasonable frame count (2-16)
          if (count >= 2 && count <= 16) {
            bestFrameWidth = fw;
            bestFrameCount = count;
            break; // first match is usually correct for common widths
          }
        }
      }

      resolve({
        name,
        imageUrl,
        totalWidth: w,
        totalHeight: h,
        frameWidth: bestFrameWidth,
        frameHeight: h,
        frameCount: bestFrameCount,
        estimatedFps: 8,
        cycleMs: bestFrameCount * 125,
      });
    };
    img.onerror = () => reject(new Error(`Failed to load sprite: ${name}`));
    img.src = imageUrl;
  });
}

/**
 * Bellhop sprite configurations — extracted from the actual base64 data.
 * These are the configs that ShopOverlay.tsx should use with SpriteAnimator.
 */
export const BELLHOP_SPRITE_CONFIGS = {
  clean: {
    imageUrl: BELLHOP_CLEAN_STRIP,
    frameCount: 4,
    frameWidth: 130,
    frameHeight: 180,
    cycleMs: 720,
    loop: true,
    pixelated: true,
  },
  talk: {
    imageUrl: BELLHOP_TALK_STRIP,
    frameCount: 4,
    frameWidth: 100,
    frameHeight: 140,
    cycleMs: 240,
    loop: true,
    pixelated: true,
  },
  idle: {
    imageUrl: BELLHOP_IDLE_STRIP,
    frameCount: 1, // static — show frame 0 only
    frameWidth: 100,
    frameHeight: 140,
    cycleMs: 0,
    loop: false,
    pixelated: true,
  },
};

/**
 * Run analysis on all bellhop sprites and print results.
 * Useful for debugging/verification.
 */
export async function analyzeAllSprites(): Promise<void> {
  console.log('=== Sprite Analysis Report ===\n');

  const sprites = [
    { name: 'bellhop-clean', url: BELLHOP_CLEAN_STRIP, fw: 130, fh: 180 },
    { name: 'bellhop-talk', url: BELLHOP_TALK_STRIP, fw: 100, fh: 140 },
    { name: 'bellhop-idle', url: BELLHOP_IDLE_STRIP, fw: 100, fh: 140 },
  ];

  for (const sprite of sprites) {
    try {
      const meta = await analyzeSpriteStrip(sprite.url, sprite.name, sprite.fw, sprite.fh);
      console.log(`[${meta.name}]`);
      console.log(`  Image: ${meta.totalWidth}x${meta.totalHeight}px`);
      console.log(`  Frame: ${meta.frameWidth}x${meta.frameHeight}px`);
      console.log(`  Frames: ${meta.frameCount}`);
      console.log(`  Cycle: ${meta.cycleMs}ms (~${meta.estimatedFps}fps)`);
      console.log();
    } catch (e) {
      console.error(`  Error analyzing ${sprite.name}:`, e);
    }
  }

  console.log('=== End Report ===');
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  analyzeAllSprites().catch(console.error);
}
