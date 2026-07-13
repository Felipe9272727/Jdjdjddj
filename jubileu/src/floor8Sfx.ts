/** Procedural, offline-safe score and cues for Floor 8. */
let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;
let ambient: { stop: () => void } | null = null;
let noise: AudioBuffer | null = null;

export function configureFloor8Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context; dest = destination ?? null;
}
const out = () => dest ?? ctx?.destination ?? null;

function noiseBuffer(c: AudioContext): AudioBuffer {
    if (noise && noise.sampleRate === c.sampleRate) return noise;
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
}

export function startFloor8Ambient(): void {
    const c = ctx, d = out(); if (!c || !d || ambient) return;
    const master = c.createGain(); master.gain.value = 0.0001; master.connect(d);
    master.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 2.5);
    const hums: OscillatorNode[] = [];
    for (const [f, g] of [[42, 0.14], [63, 0.06], [84.4, 0.025]] as const) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const gn = c.createGain(); gn.gain.value = g; o.connect(gn).connect(master); o.start(); hums.push(o);
    }
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 430; bp.Q.value = 7;
    const ng = c.createGain(); ng.gain.value = 0.018; src.connect(bp).connect(ng).connect(master); src.start();
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
    const lg = c.createGain(); lg.gain.value = 90; lfo.connect(lg).connect(bp.frequency); lfo.start();
    ambient = { stop: () => {
        try { master.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.7); hums.forEach((o) => o.stop(c.currentTime + 0.8)); src.stop(c.currentTime + 0.8); lfo.stop(c.currentTime + 0.8); } catch { /* already stopped */ }
    } };
}
export function stopFloor8Ambient(): void { ambient?.stop(); ambient = null; }
export function clearFloor8Sfx(): void { stopFloor8Ambient(); ctx = null; dest = null; }

function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', end = freq): void {
    const c = ctx, d = out(); if (!c || !d) return; const t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(d); o.start(t); o.stop(t + dur + 0.03);
}

function hiss(dur: number, gain: number, freq: number): void {
    const c = ctx, d = out(); if (!c || !d) return; const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = noiseBuffer(c);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(d); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}

export function f8Page(): void { hiss(0.12, 0.035, 1600); tone(310, 0.09, 0.018, 'triangle', 270); }
export function f8DiveCue(): void { hiss(1.5, 0.09, 900); tone(180, 1.8, 0.08, 'sawtooth', 48); setTimeout(() => tone(740, 0.7, 0.045, 'sine', 210), 900); }
export function f8DoorCue(): void { tone(72, 0.75, 0.15, 'sine', 35); hiss(0.5, 0.06, 300); }
export function f8FragmentCue(index: number): void { [0, 4, 7].forEach((n, i) => setTimeout(() => tone(330 * Math.pow(2, (n + index * 2) / 12), 0.42, 0.04, 'sine'), i * 95)); }
export function f8FallCue(): void { tone(170, 0.55, 0.06, 'triangle', 48); }
export function f8WinCue(): void { [0, 3, 7, 12].forEach((n, i) => setTimeout(() => tone(220 * Math.pow(2, n / 12), 1.1, 0.055, 'sine'), i * 150)); }
export function f8RecoveryCue(line: number): void { tone(196 * Math.pow(2, line * 3 / 12), 0.65, 0.035, 'triangle'); }
export function f8BoardCue(): void { tone(660, 0.25, 0.045, 'sine', 440); setTimeout(() => tone(330, 0.65, 0.055, 'sine', 165), 180); }
export function f8StitchCue(index: number): void {
    hiss(.11, .025, 2100);
    tone(510 + index * 28, .18, .035, 'triangle', 720 + index * 32);
    setTimeout(() => tone(180 + index * 9, .24, .025, 'sine', 120), 80);
}
export function f8WakeCue(): void { hiss(1.2, .045, 260); tone(58, 1.4, .065, 'sine', 38); }
export function f8ReadyCue(): void { tone(92, 1.4, .055, 'triangle', 64); setTimeout(() => tone(370, .4, .025, 'sine', 280), 420); }
export function f8LookBackCue(): void { hiss(1, .07, 720); tone(46, 1.8, .08, 'sawtooth', 25); }
export function f8ShoveCue(): void { hiss(.45, .16, 180); tone(96, .55, .15, 'square', 28); }
export function f8Ride9Cue(): void {
    [74, 111, 166, 249].forEach((freq, i) => setTimeout(() => tone(freq, 1.8, .028, i === 3 ? 'triangle' : 'sine', freq * .82), i * 210));
}
