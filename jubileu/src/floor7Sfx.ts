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

// ───────────────────────────────────────────────────────────────────────────
//  INTRO CUTSCENE score + cues — a small cinematic layer for the captain's
//  arrival: a building D-minor drone, per-beat stingers (hero reveal, the
//  elevator dematerialising, a menace hit, a heartbeat pulse under the talk),
//  heavy boot clomps, and a gruff gibberish "voice" so the captain feels alive.
//  Event-driven (fired on beat/line/step changes) so it stays synced to the
//  frame-based cutscene even at low fps. All routes through out() → the muted/
//  volume-controlled bus, so no per-cue mute checks are needed.
// ───────────────────────────────────────────────────────────────────────────

// one shaped tone (the synth workhorse for stabs / motif notes)
function tone(c: AudioContext, o: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, peak: number, filtHz = 0, vibrato = 0): void {
    const osc = c.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
    let node: AudioNode = osc;
    if (filtHz > 0) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filtHz; osc.connect(lp); node = lp; }
    const g = c.createGain(); g.gain.value = 0; node.connect(g).connect(o);
    g.gain.linearRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (vibrato > 0) { const lfo = c.createOscillator(); lfo.frequency.value = 5.5; const lg = c.createGain(); lg.gain.value = vibrato; lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + dur); }
    osc.start(t); osc.stop(t + dur + 0.05);
}
function chordStab(c: AudioContext, o: AudioNode, freqs: number[], t: number, dur: number, peak: number): void {
    freqs.forEach((f) => tone(c, o, f, t, dur, 'sawtooth', peak, f * 6));
}

// the building score bed. Held drone + sub, a lowpass we open/close per beat, and
// a master gain we swell. cutMusic holds the live nodes + the talk-pulse timer.
let cutMusic: { master: GainNode; lp: BiquadFilterNode; voices: OscillatorNode[]; pulse: ReturnType<typeof setInterval> | null } | null = null;

export function f7CutMusicStart(): void {
    const c = ctx, o = out(); if (!c || !o || cutMusic) return; const t = c.currentTime;
    const master = c.createGain(); master.gain.value = 0; master.connect(o);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 3; lp.connect(master);
    const voices: OscillatorNode[] = [];
    // D-minor bed: root D2, a hair-detuned twin, the fifth A2, all sawtooth through lp
    [73.42, 73.66, 110.0].forEach((f, i) => {
        const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f;
        const g = c.createGain(); g.gain.value = i === 2 ? 0.45 : 0.7; osc.connect(g).connect(lp); osc.start(t); voices.push(osc);
    });
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = 36.71;
    const sg = c.createGain(); sg.gain.value = 0.6; sub.connect(sg).connect(master); sub.start(t); voices.push(sub);
    master.gain.linearRampToValueAtTime(0.14, t + 1.6);   // swell in under the LEGS beat
    cutMusic = { master, lp, voices, pulse: null };
}

// per-beat: modulate the bed + fire that beat's stinger. beat 1=REVEAL, 2=LOOK_BACK,
// 3=LAUGH, 4=TALK (0=LEGS is just the swell-in from start).
export function f7CutBeat(beat: number): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime; const m = cutMusic;
    if (beat === 1) {            // REVEAL — open the filter, hero brass stab + a jaunty motif lick + shimmer
        if (m) { m.lp.frequency.setTargetAtTime(1100, t, 0.35); m.master.gain.setTargetAtTime(0.2, t, 0.3); }
        chordStab(c, o, [146.83, 220.0, 293.66], t, 0.9, 0.1);                 // D-A-D hero stab
        // a short pirate-horn motif (D–F–A–D) with vibrato, a touch later
        [[293.66, 0.0], [349.23, 0.16], [440.0, 0.32], [587.33, 0.5]].forEach(([f, dt]) => tone(c, o, f, t + dt, 0.34, 'sawtooth', 0.07, f * 5, 4));
        shimmer(c, o, t, 0.09, true);
    } else if (beat === 2) {     // LOOK_BACK — pull the bed down to eerie/mysterious
        if (m) { m.lp.frequency.setTargetAtTime(360, t, 0.5); m.master.gain.setTargetAtTime(0.1, t, 0.5); }
    } else if (beat === 3) {     // LAUGH — a low minor MENACE hit
        if (m) { m.lp.frequency.setTargetAtTime(620, t, 0.25); m.master.gain.setTargetAtTime(0.17, t, 0.2); }
        chordStab(c, o, [73.42, 87.31, 110.0], t, 1.1, 0.12);                  // Dm low menace
    } else if (beat === 4) {     // TALK — a low jaunty HEARTBEAT pulse under the dialogue
        if (m) { m.lp.frequency.setTargetAtTime(520, t, 0.3); m.master.gain.setTargetAtTime(0.12, t, 0.3); }
        if (m && !m.pulse) {
            const step = () => { const cc = ctx, oo = out(); if (cc && oo) tone(cc, oo, 73.42, cc.currentTime, 0.22, 'triangle', 0.1, 300); };
            step(); m.pulse = setInterval(step, 1150);
        }
    }
}

export function f7CutMusicStop(): void {
    const c = ctx; const m = cutMusic; if (!m) return; cutMusic = null;
    if (m.pulse) clearInterval(m.pulse);
    const t = c ? c.currentTime : 0;
    if (c) m.master.gain.cancelScheduledValues(t), m.master.gain.setValueAtTime(m.master.gain.value, t), m.master.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    m.voices.forEach((v) => { try { v.stop((c ? c.currentTime : 0) + 0.7); } catch { /* already */ } });
}

// a bright noise/cymbal shimmer (reveal sparkle / elevator dust)
function shimmer(c: AudioContext, o: AudioNode, t: number, peak: number, up: boolean): void {
    const src = c.createBufferSource(); src.buffer = noiseBuf(c);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(up ? 1800 : 5000, t); bp.frequency.exponentialRampToValueAtTime(up ? 6000 : 1400, t + 0.7);
    const g = c.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(peak, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.8);
    src.start(t); src.stop(t + 0.85);
}

// the HOTEL elevator dematerialising "out here" — a shimmering descend (bell partials
// falling) + a downward power-down filter sweep + a sparkle tail. Fire it synced to the
// visual dissolve, not the beat start.
export function f7ElevatorVanish(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    // descending bell partials (the "teleport away")
    [1568, 1175, 880, 659, 494].forEach((f, i) => {
        const dt = i * 0.08;
        const osc = c.createOscillator(); osc.type = 'sine'; const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
        osc.frequency.setValueAtTime(f, t + dt); osc.frequency.exponentialRampToValueAtTime(f * 0.5, t + dt + 0.5);
        g.gain.linearRampToValueAtTime(0.05, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dt + 0.6);
        osc.start(t + dt); osc.stop(t + dt + 0.65);
    });
    // power-down sweep — a filtered tone collapsing
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2000, t); lp.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    const g = c.createGain(); g.gain.value = 0; osc.frequency.setValueAtTime(330, t); osc.frequency.exponentialRampToValueAtTime(70, t + 0.9);
    osc.connect(lp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(0.09, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.95);
    osc.start(t); osc.stop(t + 1.0);
    shimmer(c, o, t + 0.1, 0.05, false);
}

// a HEAVY boot clomp for the LEGS close-up — a low body thud + a leathery noise scuff
export function f7BootClomp(): void {
    const c = ctx, o = out(); if (!c || !o) return; const t = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'sine'; const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
    osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.linearRampToValueAtTime(0.12, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.start(t); osc.stop(t + 0.18);
    const src = c.createBufferSource(); src.buffer = noiseBuf(c);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = c.createGain(); ng.gain.value = 0; src.connect(lp).connect(ng).connect(o);
    ng.gain.linearRampToValueAtTime(0.06, t + 0.006); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.start(t); src.stop(t + 0.12);
}

// the captain's VOICE — gruff gibberish "speech" for a dialogue line (one vowel-ish
// formant blip per syllable, falling pitch contour = a statement). Gives him life.
export function f7CaptainVoice(text: string): void {
    const c = ctx, o = out(); if (!c || !o) return; const t0 = c.currentTime;
    const letters = (text.match(/[a-zà-ú]/gi) || []).length;
    const syl = Math.max(3, Math.min(12, Math.round(letters / 2.6)));
    const formants = [620, 480, 820, 560, 700];
    for (let i = 0; i < syl; i++) {
        const t = t0 + i * 0.135;
        const prog = syl > 1 ? i / (syl - 1) : 0;
        const base = 132 - prog * 26 + (Math.random() - 0.5) * 14;   // gruff ~105-145Hz, falling
        const osc = c.createOscillator(); osc.type = 'sawtooth';
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4.5; bp.frequency.value = formants[i % formants.length];
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
        const g = c.createGain(); g.gain.value = 0; osc.connect(bp).connect(lp).connect(g).connect(o);
        osc.frequency.setValueAtTime(base * 1.06, t); osc.frequency.linearRampToValueAtTime(base, t + 0.06);
        g.gain.linearRampToValueAtTime(0.05, t + 0.014); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t); osc.stop(t + 0.12);
    }
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
