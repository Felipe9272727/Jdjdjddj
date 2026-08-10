import { describe, expect, it } from 'vitest';
import { shouldBeginBellhopBridgeImmediately } from '../BellhopAnimationDirector';
import {
  BELLHOP_BRIDGE,
  BELLHOP_MOTIONS,
  BELLHOP_PURCHASE_MOTIONS,
} from '../shop-sprite-assets';
import {
  isShopNarrationPage,
  purchaseMotionForScene,
  resolveShopBellhopMotion,
} from '../shop-animation-direction';
import { tokenize } from '../dialogue-engine';
import { resolveSpriteTimeline } from '../sprite-timeline';

describe('sprite timeline da loja', () => {
  it('usa o tempo real e respeita durações diferentes por pose', () => {
    const durations = [100, 200, 50];
    expect(resolveSpriteTimeline(99, durations, true, 0).index).toBe(0);
    expect(resolveSpriteTimeline(100, durations, true, 0).index).toBe(1);
    expect(resolveSpriteTimeline(299, durations, true, 0).index).toBe(1);
    expect(resolveSpriteTimeline(300, durations, true, 0).index).toBe(2);
    expect(resolveSpriteTimeline(350, durations, true, 0).index).toBe(0);
  });

  it('só mistura no fim da pose e usa uma curva suave', () => {
    const before = resolveSpriteTimeline(50, [100, 100], true, 0.4);
    const entering = resolveSpriteTimeline(70, [100, 100], true, 0.4);
    const late = resolveSpriteTimeline(95, [100, 100], true, 0.4);
    expect(before.mix).toBe(0);
    expect(entering.mix).toBeGreaterThan(0);
    expect(entering.mix).toBeLessThan(late.mix);
    expect(late.nextIndex).toBe(1);
  });

  it('segura o último quadro de uma ação que não repete', () => {
    const pose = resolveSpriteTimeline(999, [80, 80, 80], false, 0.5);
    expect(pose).toEqual({ index: 2, nextIndex: 2, mix: 0, done: true });
  });

  it('usa todos os 243 desenhos, na ordem exata de cada atuação', () => {
    expect(BELLHOP_MOTIONS.idle.frameCount).toBe(25);
    expect(BELLHOP_MOTIONS.presentation.frameCount).toBe(25);
    expect(BELLHOP_MOTIONS.conversation.frameCount).toBe(25);
    for (const motion of ['wink', 'sweat', 'concerned', 'glitch'] as const) {
      expect(BELLHOP_MOTIONS[motion].frameCount).toBe(16);
    }
    for (const motion of BELLHOP_PURCHASE_MOTIONS.filter(
      (candidate) => candidate !== 'buy-key',
    )) {
      expect(BELLHOP_MOTIONS[motion].frameCount).toBe(16);
      expect(BELLHOP_MOTIONS[motion].loop).toBe(false);
    }
    expect(BELLHOP_MOTIONS['buy-key'].frameCount).toBe(24);
    expect(BELLHOP_MOTIONS['buy-key'].columns).toBe(6);
    expect(BELLHOP_MOTIONS['buy-key'].loop).toBe(false);

    for (const config of Object.values(BELLHOP_MOTIONS)) {
      expect(config.frameSequence).toHaveLength(config.frameCount);
      expect(config.frameDurationsMs).toHaveLength(config.frameCount);
      expect(new Set(config.frameSequence).size).toBe(config.frameCount);
      expect(Math.min(...config.frameDurationsMs!)).toBeGreaterThanOrEqual(70);
      expect(config.cycleMs).toBeGreaterThan(2_000);
      expect(config.blendRatio).toBe(0);
    }

    expect(
      Object.values(BELLHOP_MOTIONS)
        .reduce((sum, config) => sum + config.frameCount, 0),
    ).toBe(243);
    expect(BELLHOP_MOTIONS.idle.columns).toBe(5);
    expect(BELLHOP_MOTIONS.presentation.columns).toBe(5);
    expect(BELLHOP_MOTIONS.presentation.frameWidth).toBe(400);
    expect(BELLHOP_MOTIONS.presentation.loop).toBe(false);
    expect(BELLHOP_MOTIONS.presentation.displayScale).toBe(1.035);
    expect(BELLHOP_MOTIONS.conversation.columns).toBe(5);
    expect(BELLHOP_MOTIONS.conversation.frameWidth).toBe(314);
    expect(BELLHOP_MOTIONS.wink.columns).toBe(4);
    expect(BELLHOP_MOTIONS['buy-floor'].displayScale).toBe(1.18);
  });

  it('insere uma ponte curta de antecipação e assentamento', () => {
    expect(BELLHOP_BRIDGE.frameSequence).toEqual([20, 21, 22, 23, 24]);
    expect(BELLHOP_BRIDGE.frameCount).toBe(5);
    expect(BELLHOP_BRIDGE.columns).toBe(5);
    expect(BELLHOP_BRIDGE.loop).toBe(false);
    expect(BELLHOP_BRIDGE.blendRatio).toBe(0);
    expect(BELLHOP_BRIDGE.cycleMs).toBeGreaterThanOrEqual(500);
    expect(BELLHOP_BRIDGE.cycleMs).toBeLessThan(800);
    expect(BELLHOP_BRIDGE.imageUrl).toBe(BELLHOP_MOTIONS.idle.imageUrl);
  });

  it('só inicia uma ponte imediata quando já está numa pose segura', () => {
    expect(shouldBeginBellhopBridgeImmediately('idle', false)).toBe(true);
    expect(shouldBeginBellhopBridgeImmediately('conversation', false)).toBe(false);
    expect(shouldBeginBellhopBridgeImmediately('buy-coffee', false)).toBe(false);
    expect(shouldBeginBellhopBridgeImmediately('buy-coffee', true)).toBe(true);
  });

  it('dirige uma atuação exclusiva e uma expressão para cada item', () => {
    expect(BELLHOP_PURCHASE_MOTIONS).toEqual([
      'buy-flashlight',
      'buy-cookie',
      'buy-coffee',
      'buy-key',
      'buy-floor',
      'buy-memory',
    ]);
    expect(purchaseMotionForScene('buy_flashlight')).toBe('buy-flashlight');
    expect(purchaseMotionForScene('buy_floor')).toBe('buy-floor');
    expect(purchaseMotionForScene('buy')).toBeUndefined();

    expect(resolveShopBellhopMotion({
      interactive: true,
      sceneId: 'buy_floor',
      mood: 'concerned',
      purchaseAnimationDone: false,
      introduction: false,
      narration: false,
    })).toBe('buy-floor');
    expect(resolveShopBellhopMotion({
      interactive: true,
      sceneId: 'buy_floor',
      mood: 'concerned',
      purchaseAnimationDone: true,
      introduction: false,
      narration: false,
    })).toBe('concerned');
  });

  it('reserva a apresentação ao primeiro olá e não fala sobre narração', () => {
    expect(isShopNarrationPage(tokenize('* (Ele procura atrás do balcão.)'))).toBe(true);
    expect(isShopNarrationPage(tokenize('* Eu encontrei sua lanterna.'))).toBe(false);

    expect(resolveShopBellhopMotion({
      interactive: true,
      sceneId: 'main',
      mood: 'talk',
      purchaseAnimationDone: true,
      introduction: true,
      narration: false,
    })).toBe('presentation');
    expect(resolveShopBellhopMotion({
      interactive: true,
      sceneId: 'main',
      mood: 'talk',
      purchaseAnimationDone: true,
      introduction: false,
      narration: false,
    })).toBe('conversation');
    expect(resolveShopBellhopMotion({
      interactive: true,
      sceneId: 'talk',
      mood: 'idle',
      purchaseAnimationDone: true,
      introduction: false,
      narration: true,
    })).toBe('idle');
  });
});
