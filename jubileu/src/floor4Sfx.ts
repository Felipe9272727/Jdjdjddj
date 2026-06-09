/**
 * floor4Sfx.ts — sound-effect scaffold for Floor 4 (theme TBD).
 *
 * Mirrors the floor3Sfx.ts pattern: configure the live AudioContext + master bus
 * on floor entry, clear it on exit, and synthesise cues on the fly so they obey
 * mute + the volume slider (routed through `out()`). Seeded with one generic,
 * theme-neutral footstep so flat-walking has feedback; the rest of the palette
 * gets filled in once the Floor 4 theme is decided.
 *
 * Wiring (already done in App.tsx's Floor-4 enter/leave effect):
 *   configureFloor4Sfx(audioCtx, cartoonBusRef.current)  // on enter
 *   clearFloor4Sfx()                                      // on leave
 */

/**
 * Creator-Mode flag (mirrors f3Demo in f3Hazards.ts): the "Transição → 2D" card
 * arms this so the jump becomes the FULL 20s elevator ride (3D interior →
 * pixelate ramp at 10s → doors open into the 2D floor) instead of an instant
 * spawn. Lives here (pure module, no three/DOM imports) so CreatorMode can set
 * it without pulling the 3D world in.
 */
export const f4Demo = { ride: false };

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

/** Point the SFX at the live context + master bus (call on Floor 4 entry). */
export function configureFloor4Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor4Sfx(): void { ctx = null; dest = null; }

function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

let stepFoot = 0;
/**
 * Generic neutral footstep — a soft filtered thump, pitch-jittered and
 * alternating feet. Theme-neutral placeholder; swap/extend with the theme.
 * (Not yet wired into Player — that's a seam: call this from the level-4 walk
 * cadence if/when the theme wants footsteps.)
 */
export function playFloor4Step(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    stepFoot ^= 1;
    const base = (stepFoot ? 150 : 130) * (0.95 + Math.random() * 0.1);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(base * 1.4, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.06);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.12);
    o.connect(lp).connect(g).connect(d);
    o.start(t); o.stop(t + 0.14);
}
