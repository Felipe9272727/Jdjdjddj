import { describe, expect, it } from 'vitest';
import { F12_CINEMA, cinemaEase, victoryBeat } from '../f12Cinema';
import { f12IntroCamera } from '../f12Presentation';

describe('cinematic lifecycle', () => {
  it('keeps the reactor rupture, fall and escort in order', () => {
    expect(victoryBeat(0)).toMatchObject({ rupture: 0, fall: 0, escape: 0, finished: false });
    expect(victoryBeat(F12_CINEMA.rupture).fall).toBe(0);
    expect(victoryBeat(4).rupture).toBe(1);
    expect(victoryBeat(7).escape).toBe(0);
    expect(victoryBeat(F12_CINEMA.victory)).toMatchObject({ rupture: 1, fall: 1, escape: 1, finished: true });
  });
  it('finishes at the terminal frame and stays finished', () => {
    expect(victoryBeat(F12_CINEMA.victory - .001).finished).toBe(false);
    expect(victoryBeat(F12_CINEMA.victory + 30).finished).toBe(true);
    expect(victoryBeat(-2)).toEqual(victoryBeat(0));
  });
  it('keeps every motion channel bounded across the complete sequence', () => {
    for (let t = -1; t < 15; t += .017) {
      const { finished: _, ...channels } = victoryBeat(t);
      for (const value of Object.values(channels)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(cinemaEase(-10)).toBe(0); expect(cinemaEase(10)).toBe(1);
  });
  it('holds the camera inside the cabin until the doors reveal the sky', () => {
    expect(f12IntroCamera(0)).toEqual(f12IntroCamera(.2));
    expect(f12IntroCamera(0)).toMatchObject({ x: 0, y: .35, z: .55 });
  });
  it('has continuous finite camera marks through each shot transition', () => {
    for (const p of [.22, .48, .69, .91]) {
      const before = f12IntroCamera(p - .00001), after = f12IntroCamera(p + .00001);
      for (const key of Object.keys(before) as (keyof typeof before)[]) {
        expect(Number.isFinite(after[key])).toBe(true);
        expect(Math.abs(after[key] - before[key])).toBeLessThan(.01);
      }
    }
  });
});
