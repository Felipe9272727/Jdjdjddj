import { describe, expect, it } from 'vitest';
import { BELLHOP_MOTIONS } from '../shop-sprite-assets';
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

  it('mantém ciclos longos e completos para cada emoção do recepcionista', () => {
    expect(BELLHOP_MOTIONS.idle.frameCount).toBe(32);
    expect(BELLHOP_MOTIONS.talk.frameCount).toBe(32);
    expect(BELLHOP_MOTIONS.service.frameCount).toBe(16);
    for (const motion of ['wink', 'sweat', 'concerned', 'glitch'] as const) {
      expect(BELLHOP_MOTIONS[motion].frameCount).toBe(16);
    }

    for (const config of Object.values(BELLHOP_MOTIONS)) {
      expect(config.frameSequence).toHaveLength(config.frameCount);
      expect(config.frameDurationsMs).toHaveLength(config.frameCount);
      expect(config.cycleMs).toBeGreaterThan(500);
    }
  });
});
