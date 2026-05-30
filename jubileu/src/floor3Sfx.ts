/**
 * floor3Sfx.ts — 1930s rubber-hose "Mickey Mousing" sound effects for the
 * Floor 3 parkour: footsteps, a jump and a landing. These are synthesised live
 * (cheap, and randomised so footsteps never sound looped), in the classic
 * cartoon idiom:
 *
 *   • step  → a little woodblock "tok" (pizzicato pop + tick), pitch jittered
 *             and alternating left/right so a walk reads as a tap-dance.
 *   • jump  → the iconic rising SLIDE WHISTLE ("whoo-oop!") with a touch of
 *             vibrato and a tiny overshoot at the top.
 *   • land  → a falling slide whistle into a soft "plop" thud.
 *
 * Everything routes through the shared master bus (set via configureFloor3Sfx)
 * so it obeys mute + the volume slider. SFX deliberately do NOT go through the
 * music director — they're not music and are meant to sit on top of the score.
 */

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

/** Point the SFX at the live context + master bus (call on Floor 3 entry). */
export function configureFloor3Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor3Sfx(): void { ctx = null; dest = null; }

function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

let stepFoot = 0;
/** Woodblock footstep "tok". Pitch jitters + alternates feet each call. */
export function playFloor3Step(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    stepFoot ^= 1;
    const base = (stepFoot ? 232 : 198) * (0.94 + Math.random() * 0.12);

    // Pizzicato pop — a tight tone with a fast downward chirp.
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(base * 1.3, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.045);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * 2.1; bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.10);
    o.connect(bp).connect(g).connect(d);
    o.start(t); o.stop(t + 0.12);

    // Tick transient — a 6ms noise burst for the woodblock "attack".
    const nb = ctx.createBuffer(1, 256, ctx.sampleRate);
    const ch = nb.getChannelData(0);
    for (let i = 0; i < 256; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / 256);
    const ns = ctx.createBufferSource(); ns.buffer = nb;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.11, t);
    ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    ns.connect(hp).connect(ng).connect(d);
    ns.start(t); ns.stop(t + 0.05);
}

/** Rising slide-whistle "whoo-oop!" — the classic cartoon jump. */
export function playFloor3Jump(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.26);
    o.frequency.exponentialRampToValueAtTime(1180, t + 0.34);   // little overshoot settle
    // Vibrato for the breathy slide-whistle character.
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 16;
    lfo.connect(lfoG).connect(o.frequency); lfo.start(t); lfo.stop(t + 0.36);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.02);
    g.gain.setValueAtTime(0.13, t + 0.24);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.40);
    o.connect(lp).connect(g).connect(d);
    o.start(t); o.stop(t + 0.42);
}

/** Falling slide-whistle into a soft "plop" — the landing. */
export function playFloor3Land(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1040, t);
    o.frequency.exponentialRampToValueAtTime(360, t + 0.16);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.20);
    o.connect(lp).connect(g).connect(d);
    o.start(t); o.stop(t + 0.22);

    // "Plop" thud underneath.
    const p = ctx.createOscillator(); p.type = 'sine';
    p.frequency.setValueAtTime(185, t + 0.02);
    p.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, t + 0.02);
    pg.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    pg.gain.exponentialRampToValueAtTime(0.0006, t + 0.20);
    p.connect(pg).connect(d);
    p.start(t + 0.02); p.stop(t + 0.22);
}
