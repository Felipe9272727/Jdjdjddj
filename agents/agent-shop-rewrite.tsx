/**
 * Agent 3: ShopOverlay Sprite Rewrite
 * 
 * OBJETIVO: Reescrever a seção de sprites do ShopOverlay.tsx para usar
 * o SpriteAnimator (canvas-based) em vez de CSS background-position animation.
 * 
 * MUDANÇAS:
 * 1. Substituir <div style={{ backgroundImage, animation }}> por <SpriteAnimator>
 * 2. Substituir o portrait (head crop) por <SpriteStatic> ou <SpriteAnimator>
 * 3. Remover @keyframes bellhopClean e bellhopTalk do CSS
 * 4. Manter toda a lógica de fases, diálogos, e doors intacta
 * 
 * ANTES (bugado):
 *   <div style={{
 *     backgroundImage: `url(${sprite.url})`,
 *     backgroundSize: `${sprite.frames * 100}% 100%`,
 *     animation: `${sprite.anim} ${sprite.cycle}ms steps(${sprite.frames}) infinite`
 *   }} />
 * 
 * DEPOIS (corrigido):
 *   <SpriteAnimator config={BELLHOP_SPRITE_CONFIGS[spriteMode]} />
 */

import React from 'react';
import { SpriteAnimator, SpriteStatic } from './agent-canvas-engine';
import { BELLHOP_SPRITE_CONFIGS } from './agent-sprite-parser';
import {
  BELLHOP_TALK_STRIP,
  BELLHOP_IDLE_STRIP,
  BELLHOP_TALK_FRAMES,
} from '../jubileu/src/bellhop-sprites';

/**
 * Props for the animated bellhop sprite.
 */
interface BellhopSpriteProps {
  /** Current sprite mode */
  mode: 'clean' | 'idle-static' | 'talk';
  /** CSS height value */
  height: string;
  /** Additional style */
  style?: React.CSSProperties;
}

/**
 * Animated bellhop sprite using Canvas renderer.
 * Replaces the CSS background-position animation approach.
 */
export const BellhopSprite: React.FC<BellhopSpriteProps> = ({ mode, height, style }) => {
  const config = BELLHOP_SPRITE_CONFIGS[mode];

  return (
    <SpriteAnimator
      config={config}
      style={{
        height,
        aspectRatio: `${config.frameWidth} / ${config.frameHeight}`,
        filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.65))',
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
};

/**
 * Portrait/head crop for the dialog box.
 * Shows top portion of the sprite for the talking/idle head.
 */
interface BellhopPortraitProps {
  isTyping: boolean;
  size?: string;
}

export const BellhopPortrait: React.FC<BellhopPortraitProps> = ({
  isTyping,
  size = 'clamp(56px, 9vw, 76px)',
}) => {
  const config = isTyping
    ? BELLHOP_SPRITE_CONFIGS.talk
    : BELLHOP_SPRITE_CONFIGS.idle;

  return (
    <div
      style={{
        flexShrink: 0,
        width: size,
        aspectRatio: '1 / 1',
        border: '2px solid #C99B36',
        borderRadius: 4,
        background: 'linear-gradient(180deg, #2a1a14 0%, #1a0a08 100%)',
        boxShadow: 'inset 0 0 6px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <SpriteAnimator
        config={{
          ...config,
          // Scale up and crop to show only the head
          // The canvas will be larger than the container, and overflow:hidden clips it
          scale: 2,
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          // Show top portion — the head area
          transform: 'translateY(-10%)',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
};

/**
 * CSS keyframes to REMOVE from ShopOverlay.tsx after migration:
 * 
 * DELETE:
 *   @keyframes bellhopClean {
 *     from { background-position-x: 0%; }
 *     to   { background-position-x: 100%; }
 *   }
 *   @keyframes bellhopTalk {
 *     from { background-position-x: 0%; }
 *     to   { background-position-x: 100%; }
 *   }
 * 
 * KEEP (these are for doors, not sprites):
 *   @keyframes shopDing { ... }
 *   @keyframes shopDoorInLeft { ... }
 *   @keyframes shopDoorInRight { ... }
 *   @keyframes shopDoorCloseLeft { ... }
 *   @keyframes shopDoorCloseRight { ... }
 *   @keyframes typewriterBlink { ... }
 */

/**
 * Integration instructions for ShopOverlay.tsx:
 * 
 * 1. Add imports at top:
 *    import { BellhopSprite, BellhopPortrait } from './agents/agent-shop-rewrite';
 * 
 * 2. Replace the animated bellhop div (~line 275-288):
 *    BEFORE:
 *      <div key={spriteMode} aria-hidden style={{
 *        height: SPRITE_H,
 *        aspectRatio: `${sprite.frameW} / ${sprite.frameH}`,
 *        backgroundImage: `url(${sprite.url})`,
 *        backgroundSize: `${sprite.frames * 100}% 100%`,
 *        ...
 *        animation: sprite.anim ? `${sprite.anim} ${sprite.cycle}ms steps(${sprite.frames}) infinite` : 'none',
 *      }} />
 * 
 *    AFTER:
 *      <BellhopSprite mode={spriteMode} height={SPRITE_H} style={{
 *        transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
 *        opacity: showContent ? 1 : 0,
 *        transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 500ms ease-out 200ms',
 *        marginBottom: 14,
 *      }} />
 * 
 * 3. Replace the portrait div (~line 310-352):
 *    BEFORE:
 *      <div style={{ ... backgroundImage: `url(${isTyping ? ... : ...})`, ... }}>
 *        <div key={isTyping ? 'talk' : 'idle'} style={{ ... }} />
 *      </div>
 * 
 *    AFTER:
 *      <BellhopPortrait isTyping={isTyping} />
 * 
 * 4. Remove the sprite-related state computation (~line 157-195):
 *    DELETE: type SpriteMode, spriteMode const, sprite const, aspect const
 * 
 * 5. Delete the CSS keyframes for bellhopClean and bellhopTalk.
 */
