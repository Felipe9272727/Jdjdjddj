/** Continuous blink; the eyes remain readable while the mouth telegraphs an attack. */
export function blinkScale(time: number, opening: number): number {
  const phase = Math.max(0, time) % 5.7;
  const closure = phase < .26 ? Math.sin(Math.PI * phase / .26) ** 2 : 0;
  const x = Math.min(1, Math.max(0, opening / .22));
  const inhibition = x * x * (3 - 2 * x);
  return 1 - .90 * closure * (1 - inhibition);
}

/** Aiming settles at the same rate across mobile refresh rates. */
export function followGaze(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-12 * Math.max(0, dt)));
}
