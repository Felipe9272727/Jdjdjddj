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

// ── Lore/puzzle cues (FLOOR4_LORE.md) — all synthesised, route via out() ──────

/** Paper rustle — picking up / reading a diary page. */
export function playF4Paper(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const len = 0.22, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.16, t);
    src.connect(hp).connect(g).connect(d); src.start(t);
}

/** Reception bell ding. */
export function playF4Bell(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    [1400, 2100].forEach((f, i) => {
        const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(i === 0 ? 0.22 : 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 0.9);
        o.connect(g).connect(d!); o.start(t); o.stop(t + 1.0);
    });
}

/** Three slow knocks from BELOW the floor (P2 payoff). */
export function playF4Knocks(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime + 1.2;                  // a beat of silence first
    for (let k = 0; k < 3; k++) {
        const t = t0 + k * 0.55;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(95, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.55, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.4);
        o.connect(g).connect(d); o.start(t); o.stop(t + 0.45);
    }
}

/** Breaker lever clack. */
export function playF4Clack(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 210;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.08);
}

/** Power surging back on (P1 payoff): rising hum + settle. */
export function playF4PowerOn(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(40, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 1.6);
    o.connect(lp).connect(g).connect(d); o.start(t); o.stop(t + 1.7);
}

/** Wooden board cracking off the door. */
export function playF4BoardCrack(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const len = 0.16, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t);
    src.connect(bp).connect(g).connect(d); src.start(t);
}

/** Safe keypad tick / heavy unlock clunk. */
export function playF4SafeTick(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1150;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.05);
}
export function playF4SafeOpen(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.55);
}

/** The unboarded door creaking ajar ("ainda não."). */
export function playF4DoorCreak(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(70, t + 1.1);
    const v = ctx.createOscillator(); v.type = 'sine'; v.frequency.value = 6.5;
    const vg = ctx.createGain(); vg.gain.value = 14;
    v.connect(vg).connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.2);
    o.connect(lp).connect(g).connect(d); o.start(t); o.stop(t + 1.25);
    v.start(t); v.stop(t + 1.25);
}

/** The Zelador SLAMMING the exit door (runner cinematic). */
export function playF4Slam(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.55);
    // wood burst on top
    const len = 0.12, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.45, t);
    src.connect(bp).connect(ng).connect(d); src.start(t);
}

/** Bone rattle — the guest of 404 assembling himself upright. */
export function playF4Bones(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime;
    for (let k = 0; k < 7; k++) {
        const t = t0 + k * 0.16 + Math.random() * 0.05;
        const o = ctx.createOscillator(); o.type = 'square';
        o.frequency.value = 320 + Math.random() * 480;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 0.05);
        o.connect(g).connect(d); o.start(t); o.stop(t + 0.06);
    }
}

/** Heavy padlock click (locking AND unlocking the exit). */
export function playF4Lock(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    [0, 0.09].forEach((dt, i) => {
        const o = ctx!.createOscillator(); o.type = 'square';
        o.frequency.value = i === 0 ? 340 : 190;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.16, t + dt);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dt + 0.06);
        o.connect(g).connect(d!); o.start(t + dt); o.stop(t + dt + 0.07);
    });
}

// ── AMBIENCE: the floor's music + background noises ───────────────────────────

/** The fluorescent striking: sputter → buzz (longer on the LONG blink), with a
 *  tiny electric crack when it cuts out (the "curto"). DyingLight calls this on
 *  every rising edge of the blink pattern. */
export function playF4LampBuzz(longBlink: boolean, gainMul = 1): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const dur = longBlink ? 0.62 : 0.13;
    // mains buzz: 100Hz square + harmonics through a bandpass
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 100;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 200;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * gainMul, t + 0.015);            // strike
    g.gain.exponentialRampToValueAtTime(0.022 * gainMul, t + 0.05);            // settle
    g.gain.setValueAtTime(0.022 * gainMul, t + dur - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);                      // cut
    o.connect(bp); o2.connect(bp); bp.connect(g).connect(d);
    o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
    // the short: a static crack right as it dies
    const len = 0.05, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.09 * gainMul, t + dur);
    src.connect(hp).connect(ng).connect(d); src.start(t + dur);
}

/** FLOOR 4 MUSIC — a slow dark-ambient bed: detuned drone + a sparse, sad
 *  music-box melody + a distant sub thump. Built live (no assets), looped via
 *  timers, all routed through out() so it obeys mute/volume. */
let f4MusicTimers: ReturnType<typeof setInterval>[] = [];
let f4MusicNodes: { stop: () => void }[] = [];
const F4_SCALE = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33];   // D minor-ish

export function startF4Music(): void {
    if (!ctx || f4MusicTimers.length) return; const d = out(); if (!d) return;
    const c = ctx;
    // drone: two detuned saws sunk under a dark lowpass, slowly breathing
    const drone = (freq: number, detune: number) => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = detune;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 190; lp.Q.value = 0.6;
        const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
        const lg = c.createGain(); lg.gain.value = 60;
        lfo.connect(lg).connect(lp.frequency);
        const g = c.createGain(); g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 4);          // fade in
        o.connect(lp).connect(g).connect(d);
        o.start(); lfo.start();
        f4MusicNodes.push({ stop: () => { try { g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1); o.stop(c.currentTime + 1.2); lfo.stop(c.currentTime + 1.2); } catch { /* already stopped */ } } });
    };
    drone(55, 0); drone(55, 9);
    // sparse melody: a detuned music box remembering a tune
    const note = () => {
        const dd = out(); if (!dd) return;
        const f = F4_SCALE[Math.floor(Math.random() * Math.random() * F4_SCALE.length)];   // biased low
        const t = c.currentTime;
        for (const [mult, amp] of [[1, 0.045], [2.01, 0.012], [3.0, 0.005]] as const) {
            const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult; o.detune.value = 5;
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(amp, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0004, t + 2.8);
            o.connect(g).connect(dd); o.start(t); o.stop(t + 3);
        }
    };
    f4MusicTimers.push(setInterval(() => { if (Math.random() < 0.62) note(); }, 3400));
    // a distant heartbeat under the building
    f4MusicTimers.push(setInterval(() => {
        const dd = out(); if (!dd) return;
        const t = c.currentTime;
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(52, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.25);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
        o.connect(g).connect(dd); o.start(t); o.stop(t + 0.55);
    }, 7300));
}

export function stopF4Music(): void {
    f4MusicTimers.forEach(clearInterval); f4MusicTimers = [];
    f4MusicNodes.forEach((n) => n.stop()); f4MusicNodes = [];
}

/** Fire crackle loop (the keeper's campfire in the breu). */
let f4FireTimer: ReturnType<typeof setInterval> | null = null;
export function startF4Fire(): void {
    if (!ctx || f4FireTimer) return;
    const c = ctx;
    f4FireTimer = setInterval(() => {
        const d = out(); if (!d || Math.random() > 0.4) return;
        const t = c.currentTime;
        const len = 0.02 + Math.random() * 0.05;
        const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * len)), c.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2);
        const src = c.createBufferSource(); src.buffer = buf;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass';
        bp.frequency.value = 900 + Math.random() * 2200; bp.Q.value = 1.6;
        const g = c.createGain(); g.gain.setValueAtTime(0.025 + Math.random() * 0.045, t);
        src.connect(bp).connect(g).connect(d); src.start(t);
    }, 130);
}
export function stopF4Fire(): void { if (f4FireTimer) { clearInterval(f4FireTimer); f4FireTimer = null; } }

/** Soft memory chime — finishing the arc ("VOCÊ LEMBROU DO ANDAR 4"). */
export function playF4MemoryChime(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const t = t0 + i * 0.18;
        const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 1.4);
        o.connect(g).connect(d!); o.start(t); o.stop(t + 1.5);
    });
}
