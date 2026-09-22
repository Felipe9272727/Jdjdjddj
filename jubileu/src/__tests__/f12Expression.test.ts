import { describe, expect, it } from 'vitest';
import { blinkScale, followGaze } from '../f12Expression';

describe('boss eye expression', () => {
  it('closes and opens continuously, including the cycle boundary', () => {
    expect(blinkScale(.13, 0)).toBeCloseTo(.1, 8);
    for (const t of [0, .26, 5.7, 5.96]) {
      expect(blinkScale(t, 0)).toBeCloseTo(1, 8);
      expect(Math.abs(blinkScale(t - .00001, 0) - blinkScale(t + .00001, 0))).toBeLessThan(.000001);
    }
  });

  it('keeps the lens visible during a mouth attack', () => {
    const scales = [0, .055, .11, .165, .22].map(open => blinkScale(.13, open));
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(scales.at(-1)).toBe(1);
  });

  it('tracks at the same speed at 30, 60 and 120 fps', () => {
    const positions = [30, 60, 120].map(fps => {
      let x = -.14;
      for (let i = 0; i < fps / 2; i++) {
        const next = followGaze(x, .14, 1 / fps);
        expect(next).toBeGreaterThanOrEqual(x);
        expect(next).toBeLessThanOrEqual(.14);
        x = next;
      }
      return x;
    });
    expect(positions[0]).toBeCloseTo(positions[1], 12);
    expect(positions[1]).toBeCloseTo(positions[2], 12);
    expect(followGaze(.05, .14, 0)).toBe(.05);
  });
});
