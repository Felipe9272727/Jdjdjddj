/**
 * renderF4Audio.mjs — offline renderer for Floor 4's music + SFX.
 *
 * Renders real audio (sample-level DSP, not WebAudio beeps) and encodes MP3s
 * into src/assets/. Run: `node scripts/renderF4Audio.mjs`. The game imports
 * the MP3s (vite inlines them as data URLs — see assetsInlineLimit) and plays
 * them through the master bus in floor4Sfx.ts.
 *
 * Pieces:
 *  • floor4-theme.mp3 — 64s seamless dark-ambient loop in D minor: layered
 *    detuned pads cycling Dm→B♭→F→C, a sparse music-box motif through a
 *    ping-pong delay, a sub drone, tape air.
 *  • f4-fire.mp3      — 8s campfire loop (rumble + Poisson crackle).
 *  • f4-buzz-short / f4-buzz-long.mp3 — fluorescent strike: mains harmonics
 *    with flutter + HF sizzle, a static crack as it cuts.
 *  • f4-bell.mp3      — FM reception-bell ding.
 *  • f4-slam.mp3      — heavy door slam (body thump + wood burst).
 *  • f4-bones.mp3     — bone rattle (resonant knocks cluster).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Mp3Encoder } from '@breezystack/lamejs';

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets');
mkdirSync(OUT, { recursive: true });

// deterministic rng so renders are reproducible
let seed = 421;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const TWO_PI = Math.PI * 2;
const noteHz = (n) => 440 * Math.pow(2, (n - 69) / 12);   // midi → Hz

function encodeMp3(name, left, right, kbps = 128) {
    const ch = right ? 2 : 1;
    const enc = new Mp3Encoder(ch, SR, kbps);
    const toI16 = (f) => {
        const o = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
        return o;
    };
    const L = toI16(left), R = right ? toI16(right) : null;
    const chunks = [];
    const BLOCK = 1152;
    for (let i = 0; i < L.length; i += BLOCK) {
        const l = L.subarray(i, i + BLOCK);
        const r = R ? R.subarray(i, i + BLOCK) : undefined;
        const d = ch === 2 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
        if (d.length) chunks.push(Buffer.from(d));
    }
    const end = enc.flush();
    if (end.length) chunks.push(Buffer.from(end));
    const buf = Buffer.concat(chunks);
    writeFileSync(join(OUT, name), buf);
    console.log(`${name}  ${(buf.length / 1024).toFixed(0)} KB`);
}

/** Soft saturation keeps peaks musical instead of clipping. */
const soft = (x) => Math.tanh(x);

function normalize(bufs, peakDb = -1.5) {
    let peak = 0;
    for (const b of bufs) for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(b[i]));
    const g = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 1;
    for (const b of bufs) for (let i = 0; i < b.length; i++) b[i] *= g;
}

// ════════════════════════════════════════════════════════════════════════════
// 1) THE THEME — 64s seamless loop
// ════════════════════════════════════════════════════════════════════════════
function renderTheme() {
    const DUR = 64, N = DUR * SR;
    const L = new Float32Array(N), R = new Float32Array(N);

    // chord cycle (midi): Dm → B♭maj → Fmaj → Cmaj, 16s each — sad, warm, open
    const CHORDS = [
        [38, 50, 57, 62, 65],        // D2  D3 A3 D4 F4
        [34, 46, 53, 58, 62],        // Bb1 Bb2 F3 Bb3 D4
        [29, 41, 48, 57, 60],        // F1  F2 C3 A3 C4
        [36, 48, 55, 60, 64],        // C2  C3 G3 C4 E4
    ];
    const SEG = 16, XF = 4;          // 16s segments, 4s raised-cosine crossfade

    /** weight of chord c at time t (periodic, raised-cosine edges) */
    const chordW = (c, t) => {
        const tt = ((t % DUR) + DUR) % DUR;
        const start = c * SEG;
        // distance into this chord's window, wrapping
        let dt = tt - start;
        if (dt < -DUR / 2) dt += DUR;
        if (dt > DUR / 2) dt -= DUR;
        if (dt < -XF || dt > SEG) return 0;
        if (dt < 0) return 0.5 + 0.5 * Math.cos(Math.PI * (-dt / XF));            // fade in
        if (dt > SEG - XF) return 0.5 + 0.5 * Math.cos(Math.PI * ((dt - (SEG - XF)) / XF)); // fade out
        return 1;
    };

    // ── pads: per chord, per note: 3 detuned partials + soft octave, slow shimmer
    for (let c = 0; c < CHORDS.length; c++) {
        const notes = CHORDS[c];
        for (let v = 0; v < notes.length; v++) {
            const f = noteHz(notes[v]);
            const isSub = v === 0;
            const amp = isSub ? 0.16 : 0.07;
            const dets = isSub ? [0] : [-2.4, 0, 2.7];                 // cents
            // LFO quantized to whole cycles over DUR -> seamless loop
            const lfoF = Math.max(1, Math.round((0.05 + rnd() * 0.05) * DUR)) / DUR;
            const lfoP = rnd() * TWO_PI;
            const panL = isSub ? 0.5 : 0.32 + rnd() * 0.36;            // sub centered
            for (const cents of dets) {
                // integer cycles per loop (1/64 Hz grid keeps the detune intact)
                const ff = Math.round(f * Math.pow(2, cents / 1200) * DUR) / DUR;
                const ph0 = rnd() * TWO_PI;
                for (let i = 0; i < N; i++) {
                    const t = i / SR;
                    const w = chordW(c, t);
                    if (w <= 0) continue;
                    const sh = 0.85 + 0.15 * Math.sin(TWO_PI * lfoF * t + lfoP);
                    const s = Math.sin(TWO_PI * ff * t + ph0)
                        + (isSub ? 0 : 0.25 * Math.sin(TWO_PI * ff * 2 * t + ph0 * 1.7));
                    const out = s * amp * w * sh / dets.length;
                    L[i] += out * (1 - panL);
                    R[i] += out * panL;
                }
            }
        }
    }

    // ── motif: a worn music box remembering the lobby's tune (fixed, loop-safe)
    // notes: [time s, midi, vel]
    const MOTIF = [
        [1.5, 74, 0.9], [4.0, 69, 0.7], [6.5, 65, 0.8], [11.0, 72, 0.6],
        [17.5, 70, 0.85], [20.0, 65, 0.6], [24.5, 62, 0.7],
        [33.5, 69, 0.8], [36.0, 72, 0.6], [40.5, 76, 0.5],
        [49.5, 72, 0.8], [52.0, 67, 0.6], [56.5, 64, 0.7], [60.0, 62, 0.5],
    ];
    const motif = new Float32Array(N);
    for (const [t0, n, vel] of MOTIF) {
        const f = noteHz(n);
        const len = Math.min(N, Math.floor(3.2 * SR));
        const start = Math.floor(t0 * SR);
        const inh = 1 + 0.0006 * (rnd() - 0.5);                        // worn = slightly off
        for (let j = 0; j < len; j++) {
            const i = (start + j) % N;                                  // wraps → seamless
            const t = j / SR;
            const env = Math.exp(-t * 2.2) * Math.min(1, t * 400);
            const s = Math.sin(TWO_PI * f * inh * t)
                + 0.35 * Math.sin(TWO_PI * f * 2.01 * t)
                + 0.12 * Math.sin(TWO_PI * f * 4.2 * t) * Math.exp(-t * 6);
            motif[i] += s * env * vel * 0.16;
        }
    }
    // ping-pong delay on the motif (375ms, damped feedback)
    const D = Math.floor(0.375 * SR);
    const dl = new Float32Array(N), dr = new Float32Array(N);
    let lpL = 0, lpR = 0;
    for (let pass = 0; pass < 2; pass++) {                              // 2 passes → tail wraps the loop
        for (let i = 0; i < N; i++) {
            const src = motif[i] + dr[(i - D + N) % N] * 0.48;
            lpL += 0.25 * (src - lpL);
            dl[i] = lpL;
            const src2 = dl[(i - D + N) % N] * 0.48;
            lpR += 0.25 * (src2 - lpR);
            dr[i] = lpR;
        }
    }
    for (let i = 0; i < N; i++) {
        L[i] += motif[i] * 0.7 + dl[i] * 0.5;
        R[i] += motif[i] * 0.7 + dr[i] * 0.5;
    }

    // ── air: barely-there filtered noise so silence never goes dead
    let air = 0;
    for (let i = 0; i < N; i++) {
        air += 0.002 * ((rnd() * 2 - 1) - air);
        const t = i / SR;
        const sw = 0.6 + 0.4 * Math.sin(TWO_PI * t / DUR * 2 + 1.3);    // periodic swell
        L[i] += air * 0.5 * sw;
        R[i] += air * 0.5 * sw;
    }

    for (let i = 0; i < N; i++) { L[i] = soft(L[i]); R[i] = soft(R[i]); }
    normalize([L, R], -2.0);
    encodeMp3('floor4-theme.mp3', L, R, 112);
}

// ════════════════════════════════════════════════════════════════════════════
// 2) FIRE — 8s crackle loop
// ════════════════════════════════════════════════════════════════════════════
function renderFire() {
    const DUR = 8, N = DUR * SR;
    const L = new Float32Array(N), R = new Float32Array(N);
    // low rumble bed
    let r1 = 0, r2 = 0;
    for (let i = 0; i < N; i++) {
        r1 += 0.012 * ((rnd() * 2 - 1) - r1);
        r2 += 0.5 * (r1 - r2);
        const t = i / SR;
        const breathe = 0.7 + 0.3 * Math.sin(TWO_PI * t / DUR + 0.5);
        L[i] += r2 * 1.1 * breathe; R[i] += r2 * 1.1 * breathe;
    }
    // crackles: many small + a few big snaps
    const pop = (at, big) => {
        const len = Math.floor((big ? 0.05 : 0.018) * SR * (0.6 + rnd()));
        const pan = 0.25 + rnd() * 0.5;
        let hp = 0, prev = 0;
        for (let j = 0; j < len; j++) {
            const i = (at + j) % N;
            const w = rnd() * 2 - 1;
            hp = 0.92 * (hp + w - prev); prev = w;                      // 1-pole HP → snap
            const env = Math.pow(1 - j / len, big ? 1.6 : 2.4);
            const s = hp * env * (big ? 0.85 : 0.4);
            L[i] += s * (1 - pan); R[i] += s * pan;
        }
    };
    for (let k = 0; k < DUR * 14; k++) pop(Math.floor(rnd() * N), false);
    for (let k = 0; k < DUR * 1.6; k++) pop(Math.floor(rnd() * N), true);
    normalize([L, R], -6);
    encodeMp3('f4-fire.mp3', L, R, 96);
}

// ════════════════════════════════════════════════════════════════════════════
// 3) FLUORESCENT BUZZ — strike, flutter, the crack of the short
// ════════════════════════════════════════════════════════════════════════════
function renderBuzz(name, durS) {
    const N = Math.floor((durS + 0.12) * SR);
    const M = new Float32Array(N);
    // mains harmonics with flutter
    for (let i = 0; i < N; i++) {
        const t = i / SR;
        if (t > durS) break;
        const strike = Math.min(1, t * 220) * (t < 0.05 ? 1.6 : 1);     // hot strike
        const flutter = 0.75 + 0.25 * Math.sin(TWO_PI * 50 * t) * Math.sin(TWO_PI * 7.3 * t);
        let s = 0;
        for (const [h, a] of [[100, 1], [200, 0.42], [300, 0.55], [400, 0.18], [600, 0.22]]) {
            s += a * Math.sin(TWO_PI * h * t);
        }
        // HF sizzle
        s += (rnd() * 2 - 1) * 0.5 * (0.4 + 0.6 * Math.abs(Math.sin(TWO_PI * 100 * t)));
        const tail = t > durS - 0.02 ? (durS - t) / 0.02 : 1;           // cut
        M[i] = s * 0.16 * strike * flutter * Math.max(0, tail);
    }
    // the crack as it dies
    const at = Math.floor(durS * SR);
    let hp = 0, prev = 0;
    for (let j = 0; j < Math.floor(0.04 * SR); j++) {
        const w = rnd() * 2 - 1;
        hp = 0.9 * (hp + w - prev); prev = w;
        if (at + j < N) M[at + j] += hp * Math.pow(1 - j / (0.04 * SR), 2) * 0.5;
    }
    normalize([M], -6);
    encodeMp3(name, M, null, 96);
}

// ════════════════════════════════════════════════════════════════════════════
// 4) BELL — FM reception ding
// ════════════════════════════════════════════════════════════════════════════
function renderBell() {
    const N = Math.floor(1.4 * SR);
    const M = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const t = i / SR;
        const env = Math.exp(-t * 3.4) * Math.min(1, t * 900);
        const mod = Math.sin(TWO_PI * 1318 * 3.53 * t) * 2.2 * Math.exp(-t * 5);
        M[i] = (Math.sin(TWO_PI * 1318 * t + mod) * 0.8
            + Math.sin(TWO_PI * 1318 * 2.39 * t) * 0.25 * Math.exp(-t * 6)) * env;
    }
    normalize([M], -3);
    encodeMp3('f4-bell.mp3', M, null, 96);
}

// ════════════════════════════════════════════════════════════════════════════
// 5) SLAM — body thump + wood burst
// ════════════════════════════════════════════════════════════════════════════
function renderSlam() {
    const N = Math.floor(0.7 * SR);
    const M = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) {
        const t = i / SR;
        const thump = Math.sin(TWO_PI * (95 * Math.exp(-t * 9) + 38) * t) * Math.exp(-t * 7);
        lp += 0.18 * ((rnd() * 2 - 1) - lp);
        const wood = lp * Math.exp(-t * 26) * 3.2;
        const rattle = Math.sin(TWO_PI * 240 * t) * Math.exp(-t * 18) * 0.3 * Math.sin(TWO_PI * 13 * t);
        M[i] = soft(thump * 1.3 + wood + rattle);
    }
    normalize([M], -1.8);
    encodeMp3('f4-slam.mp3', M, null, 96);
}

// ════════════════════════════════════════════════════════════════════════════
// 6) BONES — resonant knock cluster
// ════════════════════════════════════════════════════════════════════════════
function renderBones() {
    const N = Math.floor(1.5 * SR);
    const M = new Float32Array(N);
    const knock = (at, f) => {
        for (let j = 0; j < Math.floor(0.09 * SR); j++) {
            const t = j / SR;
            const i = at + j;
            if (i >= N) break;
            M[i] += (Math.sin(TWO_PI * f * t) * 0.7 + Math.sin(TWO_PI * f * 2.76 * t) * 0.3)
                * Math.exp(-t * 60) * 0.7;
        }
    };
    let t = 0.02;
    for (let k = 0; k < 11; k++) {
        knock(Math.floor(t * SR), 480 + rnd() * 600);
        t += 0.07 + rnd() * 0.09;
    }
    normalize([M], -4);
    encodeMp3('f4-bones.mp3', M, null, 96);
}

renderTheme();
renderFire();
renderBuzz('f4-buzz-short.mp3', 0.16);
renderBuzz('f4-buzz-long.mp3', 0.66);
renderBell();
renderSlam();
renderBones();
console.log('all rendered →', OUT);
