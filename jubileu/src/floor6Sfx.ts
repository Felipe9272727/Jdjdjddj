/**
 * floor6Sfx.ts — sound for FLOOR 6 (the Suíte 612 escape room). Same pipeline
 * as floor4Sfx/floor5RaceSfx: configure the live AudioContext + master bus on
 * entry, clear on exit, every cue routes through out().
 *
 * Real recordings from freesound.org, all CC0 (credited anyway):
 *   f6-roomtone.mp3  "Very Quiet Indoor Roomtone"        freesound.org/s/761024
 *   f6-spark.mp3     "Electricity 4"                     freesound.org/s/341612
 *   f6-lock.mp3      "padlock.wav"                       freesound.org/s/662385
 *   f6-clank.mp3     "Metal Clank (Lid of the Pan)"      freesound.org/s/741357
 *   f6-tap.mp3       "Kitchen sink - water running"      freesound.org/s/459466
 *   f6-static.mp3    "Sixties TV Static"                 freesound.org/s/478760
 *   f6-breath.mp3    "Masked_Breathing_Raspy_Loop"       freesound.org/s/788055
 *   f6-drawer.mp3    "drawer wood old open close"        freesound.org/s/452615
 *   f6-chain.mp3     "Chain.ogg"                         freesound.org/s/536737
 *   f6-paper.mp3     "Paper Rustle"                      freesound.org/s/353125
 */
import f6RoomToneUrl from './assets/f6-roomtone.mp3';
import f6SparkUrl from './assets/f6-spark.mp3';
import f6LockUrl from './assets/f6-lock.mp3';
import f6ClankUrl from './assets/f6-clank.mp3';
import f6TapUrl from './assets/f6-tap.mp3';
import f6StaticUrl from './assets/f6-static.mp3';
import f6BreathUrl from './assets/f6-breath.mp3';
import f6DrawerUrl from './assets/f6-drawer.mp3';
import f6ChainUrl from './assets/f6-chain.mp3';
import f6PaperUrl from './assets/f6-paper.mp3';

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

export function configureFloor6Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    if (context !== ctx) bufCache.clear();
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor6Sfx(): void { ctx = null; dest = null; }

function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

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

function playSample(url: string, gain = 1, rate = 1, opts?: { offset?: number; dur?: number }): void {
    const p = getBuf(url); if (!p) return;
    p.then((buf) => {
        if (!ctx) return; const d = out(); if (!d) return;
        const t0 = ctx.currentTime;
        const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
        const g = ctx.createGain(); g.gain.value = gain;
        if (opts?.dur !== undefined) {
            g.gain.setValueAtTime(gain, t0 + Math.max(0, opts.dur - 0.05));
            g.gain.linearRampToValueAtTime(0.0001, t0 + opts.dur);
        }
        src.connect(g).connect(d);
        src.start(t0, opts?.offset ?? 0, opts?.dur !== undefined ? opts.dur + 0.03 : undefined);
    }).catch(() => { /* stay silent */ });
}

function loopSample(url: string, gain = 1, fadeInS = 1.5): { stop: () => void } | null {
    const p = getBuf(url); if (!p) return null;
    let stopped = false;
    let live: { src: AudioBufferSourceNode; g: GainNode } | null = null;
    p.then((buf) => {
        if (stopped || !ctx) return; const d = out(); if (!d) return;
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        src.loopStart = 0.05; src.loopEnd = buf.duration - 0.06;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), ctx.currentTime + fadeInS);
        src.connect(g).connect(d); src.start();
        live = { src, g };
    }).catch(() => { /* stay silent */ });
    return {
        stop: () => {
            stopped = true;
            if (live && ctx) {
                try {
                    live.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
                    live.src.stop(ctx.currentTime + 0.7);
                } catch { /* already stopped */ }
            }
        },
    };
}

/** Retries until the AudioContext is configured (the suite can mount first). */
function persistentLoop(url: string, gain: number, fadeInS: number): { stop: () => void } {
    let stopped = false;
    let inner: { stop: () => void } | null = null;
    const attempt = () => {
        if (stopped) return;
        inner = loopSample(url, gain, fadeInS);
        if (!inner) setTimeout(attempt, 350);
    };
    attempt();
    return { stop: () => { stopped = true; inner?.stop(); } };
}

// ── loops ─────────────────────────────────────────────────────────────────────
let roomTone: { stop: () => void } | null = null;
export function startF6RoomTone(): void { if (!roomTone) roomTone = persistentLoop(f6RoomToneUrl, 0.5, 2.5); }
export function stopF6RoomTone(): void { roomTone?.stop(); roomTone = null; }

let tap: { stop: () => void } | null = null;
export function startF6Tap(): void { if (!tap) tap = persistentLoop(f6TapUrl, 0.4, 0.3); }
export function stopF6Tap(): void { tap?.stop(); tap = null; }

// ── cues ──────────────────────────────────────────────────────────────────────
export function playF6Spark(gainMul = 1): void {
    playSample(f6SparkUrl, 0.55 * gainMul, 0.92 + Math.random() * 0.16,
        { offset: Math.random() * 1.5, dur: 0.5 + Math.random() * 0.7 });
}
export function playF6Unlock(): void { playSample(f6LockUrl, 0.7, 1); }
export function playF6Clank(gainMul = 1): void { playSample(f6ClankUrl, 0.6 * gainMul, 0.95 + Math.random() * 0.1); }
export function playF6Chain(): void { playSample(f6ChainUrl, 0.65, 1); }
export function playF6Drawer(): void { playSample(f6DrawerUrl, 0.55, 0.95 + Math.random() * 0.1); }
export function playF6Paper(): void { playSample(f6PaperUrl, 0.5, 0.95 + Math.random() * 0.12); }
export function playF6Static(): void { playSample(f6StaticUrl, 0.35, 1, { offset: Math.random() * 2, dur: 1.4 }); }
export function playF6Breath(gainMul = 1): void {
    playSample(f6BreathUrl, 0.55 * gainMul, 0.9 + Math.random() * 0.1,
        { offset: Math.random() * 2.5, dur: 2.2 + Math.random() * 1.2 });
}
export function playF6Water(): void { playSample(f6TapUrl, 0.45, 1, { offset: 0.4, dur: 1.3 }); }
export function playF6Click(): void { playSample(f6LockUrl, 0.4, 1.35, { offset: 0, dur: 0.25 }); }

/** Keypad digit beep (synth — wants to be exact). */
export function playF6Beep(ok?: boolean): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = ok === undefined ? 620 : ok ? 880 : 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + (ok === false ? 0.4 : 0.12));
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.45);
}

// ── synth one-shots (no extra assets) ────────────────────────────────────────
let noiseBuf: AudioBuffer | null = null;
function getNoise(): AudioBuffer | null {
    if (!ctx) return null;
    if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
}

function noiseBurst(gain: number, dur: number, filterType: BiquadFilterType, freq: number, q = 1): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const buf = getNoise(); if (!buf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.loop = dur > 1.4;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f).connect(g).connect(d);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

/** Wood creak — the old-drawer recording, slowed into a hinge. */
export function playF6Creak(gainMul = 1): void {
    playSample(f6DrawerUrl, 0.5 * gainMul, 0.6 + Math.random() * 0.18);
}

/** Heavy metal slam (the façade doors jamming shut). */
export function playF6Slam(gainMul = 1): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * gainMul, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.55);
    noiseBurst(0.3 * gainMul, 0.22, 'lowpass', 900);
    playSample(f6ClankUrl, 0.5 * gainMul, 0.55);
}

/** The cab settling — a long tired metal groan. */
export function playF6Groan(gainMul = 1): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    [88, 92.5].forEach((f0) => {
        const o = ctx!.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 1.3);
        const flt = ctx!.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 260;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07 * gainMul, t + 0.18);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 1.5);
        o.connect(flt).connect(g).connect(d!); o.start(t); o.stop(t + 1.6);
    });
}

/** Soft heavy thud (the padlock hitting the carpet). */
export function playF6Thud(gainMul = 1): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(74, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32 * gainMul, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.24);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.3);
    noiseBurst(0.1 * gainMul, 0.08, 'lowpass', 500);
}

/** Match strike + catch. */
export function playF6Match(): void {
    noiseBurst(0.35, 0.09, 'highpass', 2600, 0.7);
    setTimeout(() => noiseBurst(0.16, 0.5, 'bandpass', 700, 0.8), 140);
}

/** The ice hitting the hot pan. */
export function playF6Sizzle(): void {
    noiseBurst(0.2, 1.4, 'bandpass', 3400, 0.6);
}

/** Picking something up — a soft whoosh and a tiny confirm. */
export function playF6Pickup(): void {
    noiseBurst(0.1, 0.18, 'bandpass', 1200, 1.2);
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime + 0.06;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 740;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.25);
}

/** Stove flame loop. */
let flame: { stop: () => void } | null = null;
export function startF6Flame(): void {
    if (flame || !ctx) return;
    const d = out(); if (!d) return;
    const buf = getNoise(); if (!buf) return;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.6);
    src.connect(f).connect(g).connect(d); src.start();
    flame = {
        stop: () => {
            if (ctx) {
                try {
                    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
                    src.stop(ctx.currentTime + 0.4);
                } catch { /* already stopped */ }
            }
        },
    };
}
export function stopF6Flame(): void { flame?.stop(); flame = null; }

/** The elevator coming back to life — a tired double ding. */
export function playF6Ding(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime;
    [1318.5, 1568].forEach((f, i) => {
        const t = t0 + i * 0.14;
        const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f * 0.985;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
        o.connect(g).connect(d!); o.start(t); o.stop(t + 1.2);
    });
}

/** Memory pulse — climax moment "Lembra. De. Mim.": sub-drone (~48Hz)
 *  with shimmer above + 1.2s envelope. Barely audible but felt in the room. */
export function playF6MemoryPulse(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime;
    // Sub-drone (48Hz)
    const oSub = ctx.createOscillator(); oSub.type = 'sine'; oSub.frequency.value = 48;
    const gSub = ctx.createGain();
    gSub.gain.setValueAtTime(0.0001, t0);
    gSub.gain.exponentialRampToValueAtTime(0.04, t0 + 0.08);
    gSub.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.2);
    oSub.connect(gSub).connect(d); oSub.start(t0); oSub.stop(t0 + 1.3);
    // Shimmer: high-frequency white noise (8kHz cutoff)
    const buf = getNoise(); if (buf) {
        const src = ctx.createBufferSource(); src.buffer = buf;
        const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 6000; flt.Q.value = 0.7;
        const gShimmer = ctx.createGain();
        gShimmer.gain.setValueAtTime(0.0001, t0);
        gShimmer.gain.exponentialRampToValueAtTime(0.015, t0 + 0.06);
        gShimmer.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.1);
        src.connect(flt).connect(gShimmer).connect(d); src.start(t0); src.stop(t0 + 1.2);
    }
}

/** Memory sting — soft bell-like two-note decay (no pitch glide, amplitude fade).
 *  Played when 'guestAside' event drains (card transition). */
export function playF6MemorySting(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime;
    // Two sine waves: 880Hz then 740Hz, both with smooth attack + long decay
    [880, 740].forEach((f, i) => {
        const t = t0 + i * 0.12;
        const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.8);
        o.connect(g).connect(d!); o.start(t); o.stop(t + 0.9);
    });
}
