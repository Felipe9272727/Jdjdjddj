/** Timelines shared by the director and the cinematic effects (seconds). */
export const F12_CINEMA = { intro: 14, victory: 10.5, rupture: 3.2 } as const;

export function cinemaEase(value: number): number {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
}

export function victoryBeat(seconds: number) {
  const t = Math.max(0, seconds);
  return {
    tremor: cinemaEase(t / 2.8),
    rupture: cinemaEase((t - F12_CINEMA.rupture) / .65),
    fall: cinemaEase((t - 4.0) / 4.2),
    escape: cinemaEase((t - 7) / 3.5),
    finished: t >= F12_CINEMA.victory,
  };
}
