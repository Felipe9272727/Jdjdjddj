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

/** Quick "scribble" — the Diabrete inking a new obstacle into the air. A buzzy
 *  back-and-forth saw scrub, like a pen scratching paper. */
export function playFloor3Draw(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    for (let i = 0; i <= 8; i++) o.frequency.setValueAtTime(260 + (i % 2 ? 180 : 0) + i * 14, t + i * 0.035);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + 0.26);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.34);
    o.connect(bp).connect(g).connect(d);
    o.start(t); o.stop(t + 0.36);
}

/** Bright "sparkle pop" — picking up a paintbrush (rising arpeggio + shimmer). */
export function playFloor3Brush(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C E G C — cheerful pickup chime
    notes.forEach((f, i) => {
        const o = ctx!.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx!.createGain();
        const ts = t + i * 0.06;
        g.gain.setValueAtTime(0.0001, ts);
        g.gain.exponentialRampToValueAtTime(0.16, ts + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0006, ts + 0.22);
        o.connect(g).connect(d!); o.start(ts); o.stop(ts + 0.24);
    });
}

/** Cartoon dizziness — a loop of little bird "tweet-tweet" chirps. Returns a
 *  stop() so the caller can end it when the daze wears off. */
export function playFloor3Dizzy(durationMs = 3000): () => void {
    if (!ctx) return () => {}; const d = out(); if (!d) return () => {};
    const t0 = ctx.currentTime;
    const oscs: OscillatorNode[] = [];
    const n = Math.max(3, Math.floor(durationMs / 420));
    for (let i = 0; i < n; i++) {
        const ts = t0 + i * 0.42 + (i % 2) * 0.06;
        const o = ctx.createOscillator(); o.type = 'sine';
        const base = i % 2 ? 1760 : 1480;            // two alternating birds
        o.frequency.setValueAtTime(base, ts);
        o.frequency.exponentialRampToValueAtTime(base * 1.4, ts + 0.05);
        o.frequency.exponentialRampToValueAtTime(base * 1.1, ts + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ts);
        g.gain.exponentialRampToValueAtTime(0.09, ts + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0005, ts + 0.16);
        o.connect(g).connect(d); o.start(ts); o.stop(ts + 0.18);
        oscs.push(o);
    }
    return () => { for (const o of oscs) { try { o.stop(); o.disconnect(); } catch { /* already stopped */ } } };
}

/** Spiky "BONK!" — the player runs into a fully-inked spike strip and is shoved
 *  back. A hard rubber-hose twang (rising square stab + a downward "boing" mola)
 *  so the hit reads as DAMAGE, not a soft landing. */
export function playFloor3Hit(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    // Bonk — a tight square stab that snaps up then cracks back down.
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.03);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.20);
    o.connect(bp).connect(g).connect(d);
    o.start(t); o.stop(t + 0.22);
    // "Boing" tail — a quick vibrato sine that sells the cartoon recoil.
    const b = ctx.createOscillator(); b.type = 'sine';
    b.frequency.setValueAtTime(420, t + 0.04);
    b.frequency.exponentialRampToValueAtTime(150, t + 0.30);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 22;
    const lfoG = ctx.createGain(); lfoG.gain.value = 40;
    lfo.connect(lfoG).connect(b.frequency); lfo.start(t + 0.04); lfo.stop(t + 0.32);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t + 0.04);
    bg.gain.exponentialRampToValueAtTime(0.12, t + 0.06);
    bg.gain.exponentialRampToValueAtTime(0.0006, t + 0.32);
    b.connect(bg).connect(d); b.start(t + 0.04); b.stop(t + 0.34);
}

/** Heavy comic "BWOMP" — the stylized cartoon shoe stomping the devil's hand.
 *  A low sine thud with a tiny accelerando, distinct from the soft `Land` plop. */
export function playFloor3Stomp(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.30);
    o.connect(g).connect(d);
    o.start(t); o.stop(t + 0.32);
    // A short noise "smack" on top for the impact transient.
    const nb = ctx.createBuffer(1, 512, ctx.sampleRate);
    const ch = nb.getChannelData(0);
    for (let i = 0; i < 512; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / 512);
    const ns = ctx.createBufferSource(); ns.buffer = nb;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + 0.08);
    ns.connect(lp).connect(ng).connect(d);
    ns.start(t); ns.stop(t + 0.1);
}

/** "WHUMP-whoosh" — the betrayed shove that knocks the PLAYER off the ledge.
 *  A short shove thump into a falling whoosh, deliberately WITHOUT the comic
 *  splat of `Fall` (the player doesn't splat — the game-over sting follows). */
export function playFloor3Shove(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    // Shove thump.
    const p = ctx.createOscillator(); p.type = 'sine';
    p.frequency.setValueAtTime(260, t);
    p.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, t);
    pg.gain.exponentialRampToValueAtTime(0.26, t + 0.01);
    pg.gain.exponentialRampToValueAtTime(0.0006, t + 0.18);
    p.connect(pg).connect(d); p.start(t); p.stop(t + 0.2);
    // Falling whoosh — wind/air, no splat at the bottom.
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.92);
    o.connect(lp).connect(g).connect(d); o.start(t + 0.06); o.stop(t + 0.94);
}

/** "Wah-wah-wah-waaah" — the classic muted-trumpet sad trombone for the cartoon
 *  game over (replaces the generic horror stab on this 1930s floor). */
export function playFloor3GameOver(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime;
    const steps = [233, 207, 185, 156];   // Bb3 → Ab3 → F#3 → Eb3, descending
    steps.forEach((f, i) => {
        const ts = t0 + i * 0.26;
        const last = i === steps.length - 1;
        const o = ctx!.createOscillator(); o.type = 'sawtooth';
        // Each note bends down a touch — the muted "wah" droop.
        o.frequency.setValueAtTime(f * 1.06, ts);
        o.frequency.exponentialRampToValueAtTime(f, ts + (last ? 0.5 : 0.2));
        // Wah-wah mute: a moving bandpass.
        const bp = ctx!.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
        bp.frequency.setValueAtTime(700, ts);
        bp.frequency.exponentialRampToValueAtTime(420, ts + (last ? 0.55 : 0.22));
        const wob = ctx!.createOscillator(); wob.type = 'sine'; wob.frequency.value = last ? 7 : 0.01;
        const wobG = ctx!.createGain(); wobG.gain.value = last ? 120 : 0;
        wob.connect(wobG).connect(bp.frequency); wob.start(ts); wob.stop(ts + (last ? 0.6 : 0.24));
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, ts);
        g.gain.exponentialRampToValueAtTime(0.16, ts + 0.03);
        g.gain.setValueAtTime(0.16, ts + (last ? 0.4 : 0.16));
        g.gain.exponentialRampToValueAtTime(0.0006, ts + (last ? 0.62 : 0.24));
        o.connect(bp).connect(g).connect(d!);
        o.start(ts); o.stop(ts + (last ? 0.64 : 0.26));
    });
}

/** Long descending slide-whistle + splat — the Diabrete plummeting into the void. */
export function playFloor3Fall(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 1.3);   // long falling "wheeeee"
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 9;
    const lfoG = ctx.createGain(); lfoG.gain.value = 30;
    lfo.connect(lfoG).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.03);
    g.gain.setValueAtTime(0.14, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 1.35);
    o.connect(g).connect(d); o.start(t); o.stop(t + 1.36);

    // Distant "splat" at the bottom.
    const p = ctx.createOscillator(); p.type = 'sine';
    p.frequency.setValueAtTime(150, t + 1.32);
    p.frequency.exponentialRampToValueAtTime(48, t + 1.5);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, t + 1.32);
    pg.gain.exponentialRampToValueAtTime(0.18, t + 1.35);
    pg.gain.exponentialRampToValueAtTime(0.0005, t + 1.55);
    p.connect(pg).connect(d); p.start(t + 1.32); p.stop(t + 1.56);
}
