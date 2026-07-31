/**
 * floor5RaceSfx.ts — sound for FLOOR 5 (the N64 race). Mirrors floor4Sfx.ts:
 * configure the live AudioContext + master bus on entry, clear on exit, and
 * every cue routes through `out()` so mute + the volume slider apply.
 *
 * Real recordings from freesound.org, all CC0 (credited anyway):
 *   f5-race.mp3   "very lush and swag loop"  dpren         freesound.org/s/250115
 *   f5-jump.mp3   "Game Jump Sound - Boing"  el_boss       freesound.org/s/751699
 *   f5-robot.mp3  "Alien/Robot chatter1"     mista bojjob  freesound.org/s/156006
 *   f5-win.mp3    "Happy jingle soft"        xkeril        freesound.org/s/688273
 *   f5-cheer.mp3  "Cheer 1 short"            jayfrosting   freesound.org/s/333405
 */
import f5RaceUrl from './assets/f5-race.mp3';
import f5JumpUrl from './assets/f5-jump.mp3';
import f5RobotUrl from './assets/f5-robot.mp3';
import f5WinUrl from './assets/f5-win.mp3';
import f5CheerUrl from './assets/f5-cheer.mp3';

/** Creator-Mode flag — reserved for Floor-6 jump variants. */
export const f5Demo = { race: false };

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

export function configureFloor5RaceSfx(context: AudioContext | null, destination?: AudioNode | null): void {
    if (context !== ctx) bufCache.clear();
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor5RaceSfx(): void { ctx = null; dest = null; }

function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

const bufCache = new Map<string, Promise<AudioBuffer>>();
function getBuf(url: string): Promise<AudioBuffer> | null {
    if (!ctx) return null;
    let p = bufCache.get(url);
    if (!p) {
        const c = ctx;
        p = fetch(url).then((r) => r.arrayBuffer()).then((ab) => c.decodeAudioData(ab));
        p.catch(() => bufCache.delete(url));   // falhou? deixa o próximo tentar
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
            g.gain.setValueAtTime(gain, t0 + Math.max(0, opts.dur - 0.03));
            g.gain.linearRampToValueAtTime(0.0001, t0 + opts.dur);
        }
        src.connect(g).connect(d);
        src.start(t0, opts?.offset ?? 0, opts?.dur !== undefined ? opts.dur + 0.02 : undefined);
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
                    live.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
                    live.src.stop(ctx.currentTime + 0.8);
                } catch { /* already stopped */ }
            }
        },
    };
}

/** Retries until the AudioContext is configured (overlay can mount first). */
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

// ── Music ─────────────────────────────────────────────────────────────────────
let music: { stop: () => void } | null = null;
export function startF5Music(): void { if (!music) music = persistentLoop(f5RaceUrl, 0.42, 1.2); }
export function stopF5Music(): void { music?.stop(); music = null; }

// ── Cues ──────────────────────────────────────────────────────────────────────
export function playF5Jump(): void { playSample(f5JumpUrl, 0.5, 0.95 + Math.random() * 0.15); }
export function playF5Win(): void { playSample(f5WinUrl, 0.7); }
export function playF5Cheer(): void { playSample(f5CheerUrl, 0.6, 1); }

/** A robot voice blip — a random slice of real robot chatter, one per
 *  speech-bubble character burst (Animal-Crossing style). */
export function playF5RobotBlip(): void {
    playSample(f5RobotUrl, 0.4, 0.9 + Math.random() * 0.5, { offset: Math.random() * 7.6, dur: 0.10 + Math.random() * 0.08 });
}
/** Longer excited chatter — the elevator-door reveal / the podium. */
export function playF5RobotTalk(): void {
    playSample(f5RobotUrl, 0.5, 1.05, { offset: Math.random() * 5.5, dur: 1.2 });
}

/** Countdown beeps: 3·2·1 low, JÁ high (synth — wants to be exact). */
export function playF5CountBeep(go: boolean): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.value = go ? 880 : 440;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + (go ? 0.65 : 0.18));
    o.connect(g).connect(d); o.start(t); o.stop(t + (go ? 0.7 : 0.2));
}

/** Bonk — got clobbered by an obstacle. */
export function playF5Bonk(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(d); o.start(t); o.stop(t + 0.32);
    // a springy wobble on top
    const w = ctx.createOscillator(); w.type = 'triangle';
    w.frequency.setValueAtTime(900, t);
    w.frequency.exponentialRampToValueAtTime(180, t + 0.22);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.12, t);
    wg.gain.exponentialRampToValueAtTime(0.0006, t + 0.26);
    w.connect(wg).connect(d); w.start(t); w.stop(t + 0.28);
}

/** Elevator ding for the intro doors. */
export function playF5Ding(): void {
    if (!ctx) return; const d = out(); if (!d) return;
    const t0 = ctx.currentTime;
    [1318.5, 1568].forEach((f, i) => {
        const t = t0 + i * 0.12;
        const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
        o.connect(g).connect(d!); o.start(t); o.stop(t + 1);
    });
}
