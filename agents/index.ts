/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  MASTER: Sprite Animation Fix — The Normal Elevator             ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║                                                                  ║
 * ║  BUG: "Carrossel" — sprites animam errado com CSS steps()       ║
 * ║  CAUSA: background-position-x com steps() é inconsistente       ║
 * ║  FIX: Canvas drawImage() com coordenadas exatas por frame       ║
 * ║                                                                  ║
 * ║  AGENTES:                                                        ║
 * ║  1. agent-canvas-engine.ts   → SpriteAnimator (Canvas renderer) ║
 * ║  2. agent-sprite-parser.ts   → Sprite metadata + configs        ║
 * ║  3. agent-shop-rewrite.tsx   → BellhopSprite/BellhopPortrait    ║
 * ║  4. agent-verification.ts    → Testes automatizados             ║
 * ║                                                                  ║
 * ║  COMO USAR:                                                      ║
 * ║  1. Copiar os componentes SpriteAnimator e SpriteStatic para    ║
 * ║     jubileu/src/ como SpriteEngine.ts                           ║
 * ║  2. Atualizar ShopOverlay.tsx para usar BellhopSprite           ║
 * ║  3. Rodar build: cd jubileu && npm run build:reproducible       ║
 * ║  4. Verificar no browser                                         ║
 * ║                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// Re-export everything from the agents for convenience
export { SpriteAnimator, SpriteStatic } from './agent-canvas-engine';
export { BELLHOP_SPRITE_CONFIGS, analyzeSpriteStrip } from './agent-sprite-parser';
export { BellhopSprite, BellhopPortrait } from './agent-shop-rewrite';
export { runSpriteTests, printTestResults } from './agent-verification';
