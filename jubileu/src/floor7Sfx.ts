/**
 * floor7Sfx.ts — procedural WebAudio sound for FLOOR 7 (the pirate ship).
 * No samples (keeps the floor self-contained / offline-safe): everything is
 * synthesised. Same configure/clear lifecycle as floor4/5/6 Sfx; every cue
 * routes through out(). Cues: looping sea wash + hull creak (modulated by the
 * ship's roll) + occasional gulls, footsteps, scrub squelch, bucket clunk,
 * captain grunt, and a puddle-cleaned chime.
 */
let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;
let ambient: { stop: () => void } | null = null;
let creakGain: GainNode | null = null;

export function configureFloor7Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context; dest = destination ?? null;
}
export function clearFloor7Sfx(): void { stopFloor7Ambient(); ctx = null; dest = null; }
function out(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

let _noise: AudioBuffer | null = null;
function noiseBuf(c: AudioContext): AudioBuffer {
    if (_noise && _noise.sampleRate === c.sampleRate) return _noise;
    const n = Math.floor(c.sampleRate * 2);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    _noise = b; return b;
}

export function startFloor7Ambient(): void {
    const c = ctx, o = out(); if (!c || !o || ambient) return;
    // sea wash — looping filtered noise with a slow swell LFO on the cutoff
    const wash = c.createBufferSource(); wash.buffer = noiseBuf(c); wash.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
    const wg = c.createGain(); wg.gain.value = 0;
    wash.connect(lp).connect(wg).connect(o);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = c.createGain(); lfoG.gain.value = 180; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    wash.start(); wg.gain.linearRampToValueAtTime(0.11, c.currentTime + 2);
    // hull creak — bandpassed noise we ride with the ship roll (updateF7Roll)
    const creak = c.createBufferSource(); creak.buffer = noiseBuf(c); creak.loop = true;
    const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 150; cf.Q.value = 7;
    const cg = c.createGain(); cg.gain.value = 0; creak.connect(cf).connect(cg).connect(o); creak.start();
    creakGain = cg;
    // gulls — scheduled at random intervals
    let gullTimer: ReturnType<typeof setTimeout>;
    const sched = () => { gullTimer = setTimeout(() => { gull(); sched(); }, 5000 + Math.random() * 9000); };
    sched();
    ambient = { stop: () => { try { wash.stop(); creak.stop(); lfo.stop(); } catch { /* already */ } clearTimeout(gullTimer); creakGain = null; } };
}
export function stopFloor7Ambient(): void { if (ambient) { ambient.stop(); ambient = null; } }

export function updateF7Roll(roll: number): void {
    if (creakGain && ctx) creakGain.gain.setTargetAtTime(Math.min(0.07, Math.abs(roll) * 0.6), ctx.currentTime, 0.25);
}

function gull(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'triangle';
    const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
    osc.frequency.setValueAtTime(950, t); osc.frequency.linearRampToValueAtTime(1550, t + 0.12); osc.frequency.linearRampToValueAtTime(820, t + 0.26);
    g.gain.linearRampToValueAtTime(0.035, t + 0.03); g.gain.linearRampToValueAtTime(0, t + 0.3);
    osc.start(t); osc.stop(t + 0.32);
}

export function f7Footstep(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuf(c);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0; src.connect(lp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(0.07, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.start(t); src.stop(t + 0.15);
}

export function f7Scrub(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.start(t); src.stop(t + 0.2);
}

export function f7BucketClunk(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    for (const [f, dt] of [[180, 0], [120, 0.06]] as const) {
        const osc = c.createOscillator(); osc.type = 'square';
        const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
        osc.frequency.setValueAtTime(f, t + dt);
        g.gain.linearRampToValueAtTime(0.09, t + dt + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.12);
        osc.start(t + dt); osc.stop(t + dt + 0.14);
    }
}

export function f7CaptainGrunt(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0; osc.connect(lp).connect(g).connect(o);
    osc.frequency.setValueAtTime(150, t); osc.frequency.linearRampToValueAtTime(110, t + 0.18);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.start(t); osc.stop(t + 0.24);
}

// ironic "arr arr arr" laugh — a short descending burst of gruff vowels
export function f7CaptainLaugh(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t0 = c.currentTime;
    const beats = [0, 0.17, 0.34, 0.52];
    const base = [165, 150, 138, 120];
    beats.forEach((dt, i) => {
        const t = t0 + dt;
        const osc = c.createOscillator(); osc.type = 'sawtooth';
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 820;
        const g = c.createGain(); g.gain.value = 0; osc.connect(lp).connect(g).connect(o);
        osc.frequency.setValueAtTime(base[i] * 1.25, t); osc.frequency.linearRampToValueAtTime(base[i], t + 0.12);
        g.gain.linearRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.17);
    });
}

export function f7PuddleDone(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'sine';
    const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
    osc.frequency.setValueAtTime(620, t); osc.frequency.linearRampToValueAtTime(940, t + 0.12);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t); osc.stop(t + 0.32);
}

// the TELEGRAPH before a swell hits: a low, rising suck/draw of water pulling
// back off the deck — the warning the player learns to react to.
export function f7TideWarn(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.playbackRate.value = 0.6;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(160, t); bp.frequency.exponentialRampToValueAtTime(620, t + 1.6);
    const g = c.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(0.07, t + 1.2); g.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
    src.start(t); src.stop(t + 1.75);
}

// a swell breaking over the rail: a swooshing noise burst that swells then
// crashes — the audio half of the rising-tide re-wetting.
export function f7Wave(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.playbackRate.value = 0.85;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1700, t + 0.35); lp.frequency.linearRampToValueAtTime(500, t + 1.1);
    const g = c.createGain(); g.gain.value = 0; src.connect(lp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(0.16, t + 0.35); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.start(t); src.stop(t + 1.25);
}
