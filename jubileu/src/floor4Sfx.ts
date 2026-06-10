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
export const f4Demo = { ride: false, keeper: false };

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

/** Point the SFX at the live context + master bus (call on Floor 4 entry). */
export function configureFloor4Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    if (context !== ctx) bufCache.clear();      // decoded buffers belong to the old ctx
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor4Sfx(): void { ctx = null; dest = null; }

function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

// ── RENDERED AUDIO (scripts/renderF4Audio.mjs → src/assets/*.mp3) ─────────────
// Real composed/recorded-grade samples — vite inlines them as data URLs (see
// assetsInlineLimit), so the single-file build carries its own soundtrack.
import f4ThemeUrl from './assets/floor4-theme.mp3';
import f4FireUrl from './assets/f4-fire.mp3';
import f4BuzzShortUrl from './assets/f4-buzz-short.mp3';
import f4BuzzLongUrl from './assets/f4-buzz-long.mp3';
import f4BellUrl from './assets/f4-bell.mp3';
import f4SlamUrl from './assets/f4-slam.mp3';
import f4BonesUrl from './assets/f4-bones.mp3';

const bufCache = new Map<string, Promise<AudioBuffer>>();
function getBuf(url: string): Promise<AudioBuffer> | null {
    if (!ctx) return null;
    let p = bufCache.get(url);
    if (!p) {
        const c = ctx;
        p = fetch(url).then((r) => r.arrayBuffer()).then((ab) => c.decodeAudioData(ab));
        bufCache.set(url, p);
    }
    return p;
}

/** Fire-and-forget sample playback through the master bus. */
function playSample(url: string, gain = 1, rate = 1): void {
    const p = getBuf(url); if (!p) return;
    p.then((buf) => {
        if (!ctx) return; const d = out(); if (!d) return;
        const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
        const g = ctx.createGain(); g.gain.value = gain;
        src.connect(g).connect(d); src.start();
    }).catch(() => { /* decode failed — stay silent */ });
}

/** Looping sample (music/ambience); returns a fading stop handle. */
function loopSample(url: string, gain = 1, fadeInS = 2): { stop: () => void } | null {
    const p = getBuf(url); if (!p) return null;
    let stopped = false;
    let live: { src: AudioBufferSourceNode; g: GainNode } | null = null;
    p.then((buf) => {
        if (stopped || !ctx) return; const d = out(); if (!d) return;
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        // skip the encoder padding at the seam
        src.loopStart = 0.05; src.loopEnd = buf.duration - 0.06;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), ctx.currentTime + fadeInS);
        src.connect(g).connect(d); src.start();
        live = { src, g };
    }).catch(() => { /* decode failed — stay silent */ });
    return {
        stop: () => {
            stopped = true;
            if (live && ctx) {
                try {
                    live.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
                    live.src.stop(ctx.currentTime + 1);
                } catch { /* already stopped */ }
            }
        },
    };
}

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

/** Reception bell ding (rendered FM bell, slight ring-to-ring variation). */
export function playF4Bell(): void {
    playSample(f4BellUrl, 0.55, 0.97 + Math.random() * 0.06);
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

/** The Zelador SLAMMING the exit door (rendered: thump + wood burst). */
export function playF4Slam(): void { playSample(f4SlamUrl, 0.9); }

/** Bone rattle — the guest of 404 assembling himself upright (rendered). */
export function playF4Bones(): void { playSample(f4BonesUrl, 0.7); }

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
// ── AMBIENCE: the floor's music + background noises (rendered samples) ───────

/** The fluorescent striking: sputter → buzz → the static crack of the curto.
 *  DyingLight calls this on every rising edge of the blink pattern. */
export function playF4LampBuzz(longBlink: boolean, gainMul = 1): void {
    playSample(longBlink ? f4BuzzLongUrl : f4BuzzShortUrl, 0.5 * gainMul);
}

/** FLOOR 4 MUSIC — the rendered dark-ambient theme (64s seamless loop in
 *  D minor: pads, a worn music-box motif, sub drone). */
let f4Music: { stop: () => void } | null = null;
export function startF4Music(): void {
    if (f4Music) return;
    f4Music = loopSample(f4ThemeUrl, 0.5, 3);
}
export function stopF4Music(): void { f4Music?.stop(); f4Music = null; }

/** Fire crackle loop (the keeper's campfire in the breu). */
let f4Fire: { stop: () => void } | null = null;
export function startF4Fire(): void {
    if (f4Fire) return;
    f4Fire = loopSample(f4FireUrl, 0.6, 1.2);
}
export function stopF4Fire(): void { f4Fire?.stop(); f4Fire = null; }

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
