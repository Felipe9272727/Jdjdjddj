/** Shared staging for the elevator-to-aircraft transformation. Progress is
 * normalized so gameplay remains responsible for entering and leaving intro. */
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const f12Ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const stage = (p: number, a: number, b: number) => f12Ease((p - a) / (b - a));

export function f12Transformation(progress: number) {
  const p = clamp(progress);
  return {
    doors: stage(p, .04, .24),
    shell: stage(p, .15, .48),
    wings: stage(p, .27, .62),
    tail: stage(p, .38, .69),
    canopy: stage(p, .19, .46),
    engine: stage(p, .48, .76),
    flight: stage(p, .66, .94),
    companion: stage(p, .70, .92),
    reveal: stage(p, .78, 1),
    wingRebound: Math.sin(Math.PI * clamp((p - .43) / .25)) * (1 - stage(p, .56, .70)),
  };
}

export const F12_PALETTE = {
  sky: '#091a2b',
  fog: '#234354',
  brass: '#d5aa56',
  brassDark: '#775229',
  ivory: '#eee1bf',
  hull: '#245264',
  hullDark: '#112b39',
  glass: '#82d9dc',
  friendly: '#71fff0',
  danger: '#ff684b',
  ritual: '#c19bff',
};

/** Cinematic marks relative to the plane. The last mark is the gameplay
 * chase camera, so taking control does not require a hard camera cut. */
/** Hold the cabin reveal, orbit the unfolding wings, then follow the wingman. */
export function f12IntroCamera(progress: number) {
  const p = clamp(progress);
  const exterior = stage(p, .22, .48);
  const orbit = stage(p, .48, .69);
  const formation = stage(p, .69, .91);
  return {
    x: 5.6 * exterior - 9.1 * orbit + 3.5 * formation,
    y: .35 + 1.9 * exterior + .6 * orbit,
    z: .55 + 5.8 * exterior + 3.8 * orbit + .8 * formation,
    targetY: .35 + .45 * exterior,
    targetZ: -4 + 3.4 * exterior - 6 * formation,
    fov: 57 + 7 * exterior - 4 * formation,
  };
}

export function f12ChaseDistance(aspect: number) {
  return 19 - 7 * f12Ease((aspect - .65) / .65);
}
