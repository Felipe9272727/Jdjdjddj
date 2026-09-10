const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const arc = (t: number, start: number, duration: number) => {
  const u = (t - start) / duration;
  return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
};

/** Small stage marks around STAND. Every line settles back onto its mark;
 * dialogue timing and the final gameplay dash remain owned by the cutscene. */
export function f3IntroBlocking(line: number, seconds: number) {
  const t = Math.max(0, seconds);
  let x = 0, y = 0, z = 0, turn = 0;
  if (line === 0) {
    const arrive = 1 - ease(t / .75);
    x = -.42 * arrive;
    z = -.16 * arrive;
    y = .15 * arc(t, .28, .48);
    turn = -.24 * arrive + .09 * arc(t, .85, .65);
  } else if (line === 2 || line === 7) {
    const sidestep = arc(t, .12, 1.55);
    x = (line === 2 ? .25 : -.22) * sidestep;
    y = .075 * arc(t, .15, .36) + .05 * arc(t, 1.22, .30);
    turn = -.12 * sidestep;
  } else if (line === 3) {
    const approach = arc(t, .15, 1.85);
    z = .28 * approach;
    turn = .10 * approach;
  } else if (line === 4) {
    z = -.15 * arc(t, .02, .50) + .10 * arc(t, .42, .65);
    turn = .16 * arc(t, .04, .50) - .15 * arc(t, .40, .62);
  } else if (line === 6) {
    y = .10 * arc(t, .22, .32) + .07 * arc(t, .70, .29);
    turn = .06 * arc(t, .2, 1.1);
  }
  return { x, y, z, turn };
}
