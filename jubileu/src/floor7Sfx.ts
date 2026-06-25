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
export function clearFloor7Sfx(): void { stopFloor7Ambient(); f7CutMusicStop(); clearFloor7CutReverb(); ctx = null; dest = null; }
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

// the captain's LAUGH — a hearty pirate belly laugh: a held, fluttering "Arrr" growl
// followed by descending, decaying "har-har-har" pulses (each a breath-onset + a
// formant-shaped voiced burst with a chest sub), then a trailing exhale. Two detuned
// saws + vowel formants make it read as a VOICE, not a synth blip; routed through the
// reverb space, and it DUCKS the score bed so the laugh commands the mix. Randomised per
// call. `short` = a lower, harder, shorter "got-the-last-word" smirk (the scene's button),
// so the two laughs read as different gestures, not a clone.
export function f7CaptainLaugh(short = false): void {
    const c = ctx, o = cutOut(); if (!c || !o) return; const t0 = c.currentTime;
    const R = (a: number, b: number) => a + Math.random() * (b - a);
    const m = cutMusic;
    if (m) {   // sidechain-duck the bed under the laugh, release after (so the bookend lands)
        m.master.gain.cancelScheduledValues(t0);
        m.master.gain.setTargetAtTime(0.05, t0, 0.06);
        m.master.gain.setTargetAtTime(0.11, t0 + (short ? 0.85 : 1.7), 0.5);
    }

    // one voiced "har/ho" pulse — aspirated "h" onset + two detuned saws through an "ah"
    // formant pair + a chest sub, shaped by a glottal (sharp attack, quick decay) envelope
    const pulse = (t: number, f0: number, peak: number, dur: number, open: number) => {
        const br = c.createBufferSource(); br.buffer = noiseBuf(c); br.playbackRate.value = 1.3;
        const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1300; bf.Q.value = 0.8;
        const bg = c.createGain(); bg.gain.value = 0; br.connect(bf).connect(bg).connect(o);
        bg.gain.linearRampToValueAtTime(peak * 0.4, t + 0.012); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        br.start(t); br.stop(t + 0.09);
        const bp1 = c.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 700 * open; bp1.Q.value = 4;
        const bp2 = c.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1180 * open; bp2.Q.value = 5;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500;
        const g = c.createGain(); g.gain.value = 0; bp1.connect(lp); bp2.connect(lp); lp.connect(g).connect(o);
        [f0, f0 * 1.013].forEach((f, k) => {
            const osc = c.createOscillator(); osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f * 1.18, t); osc.frequency.linearRampToValueAtTime(f, t + 0.05); osc.frequency.linearRampToValueAtTime(f * 0.93, t + dur);
            const og = c.createGain(); og.gain.value = k === 0 ? 1 : 0.6; osc.connect(og); og.connect(bp1); og.connect(bp2);
            osc.start(t); osc.stop(t + dur + 0.03);
        });
        g.gain.linearRampToValueAtTime(peak, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
        const sub = c.createOscillator(); sub.type = 'sine'; const sg = c.createGain(); sg.gain.value = 0;
        sub.frequency.setValueAtTime(f0 * 0.5, t); sub.connect(sg).connect(o);
        sg.gain.linearRampToValueAtTime(peak * 0.5, t + 0.03); sg.gain.exponentialRampToValueAtTime(0.001, t + dur);
        sub.start(t); sub.stop(t + dur + 0.03);
    };

    // Phase 1 — the held, fluttering "ARRR" growl. The flutter is a MULTIPLICATIVE tremolo
    // (a square LFO on a dedicated trem stage that stays 0.46–0.98, NEVER negative — so no
    // polarity flip as the envelope decays) + a slower 7Hz belly vibrato. Shorter/lower for
    // the smirk variant.
    {
        const t = t0, gdur = short ? 0.26 : 0.5, f0 = short ? R(106, 116) : R(130, 142);
        const bp1 = c.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 560; bp1.Q.value = 3.5;
        const bp2 = c.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 980; bp2.Q.value = 4;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2100;
        const trem = c.createGain(); trem.gain.value = 0.72;     // tremolo carrier (square LFO swings it 0.46–0.98)
        const env = c.createGain(); env.gain.value = 0;          // the amplitude envelope (independent — no polarity flip)
        bp1.connect(lp); bp2.connect(lp); lp.connect(trem).connect(env).connect(o);
        [f0, f0 * 1.01].forEach((f, k) => {
            const osc = c.createOscillator(); osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f * 1.04, t); osc.frequency.linearRampToValueAtTime(f, t + 0.1); osc.frequency.linearRampToValueAtTime(f * 0.9, t + gdur);
            const og = c.createGain(); og.gain.value = k === 0 ? 1 : 0.6; osc.connect(og); og.connect(bp1); og.connect(bp2);
            const vib = c.createOscillator(); vib.frequency.value = 7; const vg = c.createGain(); vg.gain.value = 4.5; vib.connect(vg).connect(osc.frequency); vib.start(t); vib.stop(t + gdur + 0.05);
            osc.start(t); osc.stop(t + gdur + 0.05);
        });
        const roll = c.createOscillator(); roll.type = 'square'; roll.frequency.value = R(26, 30);
        const rg = c.createGain(); rg.gain.value = 0.26; roll.connect(rg).connect(trem.gain); roll.start(t); roll.stop(t + gdur);
        const hp = short ? 0.095 : 0.11;   // the reveal belly-laugh projects louder — it's the scene's emotional peak
        env.gain.linearRampToValueAtTime(hp, t + 0.06);
        if (!short) env.gain.setValueAtTime(hp, t + gdur - 0.16);
        env.gain.exponentialRampToValueAtTime(0.0008, t + gdur);
        const sub = c.createOscillator(); sub.type = 'sine'; const sg = c.createGain(); sg.gain.value = 0; sub.frequency.value = f0 * 0.5; sub.connect(sg).connect(o);
        sg.gain.linearRampToValueAtTime(short ? 0.05 : 0.065, t + 0.06); sg.gain.exponentialRampToValueAtTime(0.001, t + gdur); sub.start(t); sub.stop(t + gdur + 0.04);
    }

    // Phase 2 — "HAR-HAR-HAR…" pulses. Full: 5–6 descending belly-laugh pulses. Smirk: 3
    // lower, harder, snappier pulses.
    let t = t0 + (short ? R(0.24, 0.28) : R(0.44, 0.5));
    const pitches = short ? [118, 108, 99, 92] : [152, 142, 132, 121, 110, 101];
    const n = short ? 3 : (5 + (Math.random() < 0.5 ? 0 : 1));
    for (let i = 0; i < n; i++) {
        pulse(t, pitches[Math.min(i, pitches.length - 1)] * R(0.97, 1.03), (short ? 0.105 : 0.115) * (1 - i * 0.1), R(short ? 0.14 : 0.16, short ? 0.18 : 0.2), 1 - i * 0.03);
        t += R(short ? 0.14 : 0.16, short ? 0.19 : 0.22);
    }
    // Phase 3 — a trailing breath exhale (a shorter one on the smirk, bridging it into the
    // END resolve note so the closing laugh doesn't cut off abruptly before the fade)
    const bt = t + 0.02; const edur = short ? 0.3 : 0.4; const br = c.createBufferSource(); br.buffer = noiseBuf(c); br.playbackRate.value = 0.7;
    const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 700; bf.Q.value = 0.6;
    const bg = c.createGain(); bg.gain.value = 0; br.connect(bf).connect(bg).connect(o);
    bg.gain.linearRampToValueAtTime(0.03, bt + 0.08); bg.gain.exponentialRampToValueAtTime(0.001, bt + edur);
    br.start(bt); br.stop(bt + edur + 0.05);
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
    freqs.forEach((f) => tone(c, o, f, t, dur, 'sawtooth', peak, f * 3.5));   // softer lowpass → less raw-saw buzz
}

// SPACE — a shared wet/dry reverb send for the cutscene cues. A ship deck is a big,
// open, woody space; dry-to-output cues sound like a synth patch. A stereo synthesised
// impulse gives them air + width. Lazily built per ctx, torn down with clearFloor7Sfx.
let revInput: GainNode | null = null;
function makeImpulse(c: AudioContext, dur: number, decay: number): AudioBuffer {
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return buf;
}
function cutOut(): AudioNode | null {
    const c = ctx, o = out(); if (!c || !o) return o;
    if (revInput && revInput.context === c) return revInput;
    const input = c.createGain();
    const dry = c.createGain(); dry.gain.value = 0.85; input.connect(dry).connect(o);
    const conv = c.createConvolver(); conv.buffer = makeImpulse(c, 1.5, 2.6);
    const wet = c.createGain(); wet.gain.value = 0.3; input.connect(conv).connect(wet).connect(o);
    revInput = input; return input;
}
export function clearFloor7CutReverb(): void { revInput = null; }

// a filtered-noise WHOOSH for camera moves, and a low THUMP impact for the hard cuts.
function whoosh(c: AudioContext, o: AudioNode, t: number, peak: number): void {
    const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.playbackRate.value = 0.9;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.18); bp.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    const g = c.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(peak, t + 0.13); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);
    src.start(t); src.stop(t + 0.55);
}
function thump(c: AudioContext, o: AudioNode, t: number, peak: number): void {
    const osc = c.createOscillator(); osc.type = 'sine'; const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
    osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(44, t + 0.25);
    g.gain.linearRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t); osc.stop(t + 0.4);
}

// the building score bed: a D-minor drone (root + a wide-detuned chorus twin + the
// fifth) with an octave-up "air" voice for mid presence (kills the hollow low-only bed)
// and a tight modest sub for weight (no 36Hz mud). A lowpass we open/close per beat, a
// master we swell, a slow filter LFO under TALK, and a per-line tension counter.
let cutMusic: { master: GainNode; lp: BiquadFilterNode; voices: OscillatorNode[]; talkLfo: OscillatorNode | null; talkLine: number } | null = null;

export function f7CutMusicStart(): void {
    const c = ctx, o = out(); if (!c || !o || cutMusic) return; const t = c.currentTime;
    const master = c.createGain(); master.gain.value = 0; master.connect(o);   // bed stays DRY (tight low end)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 2.5; lp.connect(master);
    const voices: OscillatorNode[] = [];
    ([[73.42, 0.6], [74.12, 0.6], [110.0, 0.4]] as const).forEach(([f, gn]) => {
        const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f;
        const g = c.createGain(); g.gain.value = gn; osc.connect(g).connect(lp); osc.start(t); voices.push(osc);
    });
    const air = c.createOscillator(); air.type = 'triangle'; air.frequency.value = 220.0;     // octave-up presence
    const ag = c.createGain(); ag.gain.value = 0.05; air.connect(ag).connect(master); air.start(t); voices.push(air);
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = 55.0;           // modest, tight sub
    const sg = c.createGain(); sg.gain.value = 0.3; sub.connect(sg).connect(master); sub.start(t); voices.push(sub);
    master.gain.linearRampToValueAtTime(0.13, t + 1.6);
    cutMusic = { master, lp, voices, talkLfo: null, talkLine: 0 };
}

// per-beat: modulate the bed + fire that beat's stinger (now with whoosh/impact on the
// hard cuts). beat 1=REVEAL, 2=LOOK_BACK, 3=LAUGH, 4=TALK (0=LEGS is the swell-in).
export function f7CutBeat(beat: number): void {
    const c = ctx; const w = cutOut(); if (!c || !w) return; const t = c.currentTime; const m = cutMusic;
    if (beat === 1) {            // REVEAL — open up, hero stab + jaunty horn motif + crane whoosh + shimmer
        if (m) { m.lp.frequency.setTargetAtTime(1200, t, 0.35); m.master.gain.setTargetAtTime(0.16, t, 0.3); }
        chordStab(c, w, [146.83, 220.0], t, 0.9, 0.085);                                   // D–A hero (thinner)
        ([[293.66, 0], [349.23, 0.16], [440.0, 0.32], [587.33, 0.5]] as const).forEach(([f, dt]) => tone(c, w, f, t + dt, 0.36, 'sawtooth', 0.06, f * 3, 4));   // brass-ier (softer lp)
        whoosh(c, w, t, 0.07); shimmer(c, w, t, 0.06, true);
    } else if (beat === 2) {     // LOOK_BACK — hard cut: whoosh + low impact, pull the bed down eerie
        if (m) { m.lp.frequency.setTargetAtTime(360, t, 0.5); m.master.gain.setTargetAtTime(0.09, t, 0.5); }
        whoosh(c, w, t, 0.08); thump(c, w, t, 0.07);
    } else if (beat === 3) {     // LAUGH — hard cut: whoosh + impact + a low minor MENACE stab.
        // keep the bed LOW so the captain's laugh (which ducks to 0.05) owns the beat as the
        // scene's loudest emotional peak, instead of the bed pushing up and flattening it.
        if (m) { m.lp.frequency.setTargetAtTime(640, t, 0.25); m.master.gain.setTargetAtTime(0.085, t, 0.2); }
        whoosh(c, w, t, 0.06); thump(c, w, t, 0.08); chordStab(c, w, [73.42, 87.31, 110.0], t, 1.0, 0.08);
    } else if (beat === 4) {     // TALK — set the bed + a SLOW breathing filter LFO so it isn't a flatline
        if (m) {
            m.lp.frequency.setTargetAtTime(560, t, 0.3); m.master.gain.setTargetAtTime(0.11, t, 0.3); m.talkLine = 0;
            if (!m.talkLfo) {
                const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.16;
                const lg = c.createGain(); lg.gain.value = 190; lfo.connect(lg).connect(m.lp.frequency); lfo.start(t); m.talkLfo = lfo;
            }
        }
    }
}

export function f7CutMusicStop(): void {
    const c = ctx; const m = cutMusic; if (!m) return; cutMusic = null;
    if (m.talkLfo) { try { m.talkLfo.stop(); } catch { /* already */ } }
    const t = c ? c.currentTime : 0;
    // a soft low resolve note — an audio "button" under the END fade-to-black
    if (c) { const w = cutOut(); if (w) tone(c, w, 73.42, t, 1.3, 'triangle', 0.06, 240); }
    if (c) { m.master.gain.cancelScheduledValues(t); m.master.gain.setValueAtTime(m.master.gain.value, t); m.master.gain.linearRampToValueAtTime(0.0001, t + 0.7); }
    m.voices.forEach((v) => { try { v.stop((c ? c.currentTime : 0) + 0.8); } catch { /* already */ } });
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

// the HOTEL elevator dematerialising "out here" — a descending bell cascade + a LOUDER
// power-down sweep + a sub-drop thump for body + a sparkle tail, through the reverb so it
// "dematerialises" into the space rather than blipping out. Synced to the visual dissolve.
export function f7ElevatorVanish(): void {
    const c = ctx, o = cutOut(); if (!c || !o) return; const t = c.currentTime;
    [1568, 1175, 880, 659, 494].forEach((f, i) => {
        const dt = i * 0.08;
        const osc = c.createOscillator(); osc.type = 'sine'; const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
        osc.frequency.setValueAtTime(f, t + dt); osc.frequency.exponentialRampToValueAtTime(f * 0.5, t + dt + 0.5);
        g.gain.linearRampToValueAtTime(0.06, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dt + 0.6);
        osc.start(t + dt); osc.stop(t + dt + 0.65);
    });
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2000, t); lp.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    const g = c.createGain(); g.gain.value = 0; osc.frequency.setValueAtTime(330, t); osc.frequency.exponentialRampToValueAtTime(70, t + 0.9);
    osc.connect(lp).connect(g).connect(o);
    g.gain.linearRampToValueAtTime(0.14, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.95);
    osc.start(t); osc.stop(t + 1.0);
    // sub-drop for weight (the "no way back" gut-punch)
    const sub = c.createOscillator(); sub.type = 'sine'; const sg = c.createGain(); sg.gain.value = 0;
    sub.frequency.setValueAtTime(64, t); sub.frequency.exponentialRampToValueAtTime(28, t + 0.7); sub.connect(sg).connect(o);
    sg.gain.linearRampToValueAtTime(0.13, t + 0.04); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    sub.start(t); sub.stop(t + 0.85);
    shimmer(c, o, t + 0.1, 0.06, false);
}

// a HEAVY boot clomp for the LEGS close-up — a low body thud + a leathery noise scuff,
// HUMANISED per step (±pitch, ±gain, slight timing wobble) so the stride isn't robotic.
export function f7BootClomp(): void {
    const c = ctx, o = cutOut(); if (!c || !o) return;
    const t = c.currentTime + Math.random() * 0.02;
    const pitch = 0.85 + Math.random() * 0.32; const lvl = 0.1 + Math.random() * 0.05;
    const osc = c.createOscillator(); osc.type = 'sine'; const g = c.createGain(); g.gain.value = 0; osc.connect(g).connect(o);
    osc.frequency.setValueAtTime(110 * pitch, t); osc.frequency.exponentialRampToValueAtTime(55 * pitch, t + 0.12);
    g.gain.linearRampToValueAtTime(lvl, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.start(t); osc.stop(t + 0.18);
    const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.playbackRate.value = pitch;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800 + Math.random() * 320;
    const ng = c.createGain(); ng.gain.value = 0; src.connect(lp).connect(ng).connect(o);
    ng.gain.linearRampToValueAtTime(lvl * 0.5, t + 0.006); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.start(t); src.stop(t + 0.12);
}

// the captain's VOICE — gruff "speech" for a dialogue line. Each syllable is now a proper
// VOWEL: two detuned saws through a TWO-formant bank (F1+F2 from a real vowel table → you
// read "ah/eh/oh/oo/ee", not a single buzz) over a chest sub, with a consonant noise onset,
// a per-syllable glottal envelope, a per-LINE rising pitch contour, and randomized vowel +
// timing. Routed through the reverb and it DUCKS the bed so the captain commands the mix.
// (Same formant/glottal treatment the laugh got — so he speaks with the laugh's character.)
const F7_VOWELS: readonly (readonly [number, number])[] = [[720, 1180], [560, 1680], [470, 820], [610, 1010], [400, 2150], [520, 900]];  // ah eh oh uh ee aw
export function f7CaptainVoice(text: string): void {
    const c = ctx, o = cutOut(); if (!c || !o) return; const t0 = c.currentTime;
    const m = cutMusic; const line = m ? m.talkLine++ : 0;
    if (m) {   // sidechain duck: dip the bed under the line, release after
        m.master.gain.cancelScheduledValues(t0);
        m.master.gain.setTargetAtTime(0.055, t0, 0.08);
        m.master.gain.setTargetAtTime(0.11, t0 + 0.12, 0.9);
        tone(c, o, [73.42, 82.41, 87.31, 98.0, 110.0][line % 5], t0, 0.5, 'triangle', 0.09 + line * 0.01, 240);   // building menace accent
    }
    const letters = (text.match(/[a-zà-ú]/gi) || []).length;
    const syl = Math.max(3, Math.min(13, Math.round(letters / 2.5)));
    let t = t0 + 0.05;
    for (let i = 0; i < syl; i++) {
        const prog = syl > 1 ? i / (syl - 1) : 0;
        const top = 124 + line * 6, fall = 20 + line * 4;                     // later lines start higher/harder
        const base = top - prog * fall + (Math.random() - 0.5) * 14;
        const [F1, F2] = F7_VOWELS[(i * 2 + line * 3 + (Math.random() < 0.3 ? 1 : 0)) % F7_VOWELS.length];   // a real vowel, varied
        const j = 1 + (Math.random() - 0.5) * 0.12;                           // per-syllable formant jitter
        const bp1 = c.createBiquadFilter(); bp1.type = 'bandpass'; bp1.Q.value = 5; bp1.frequency.value = F1 * j;
        const bp2 = c.createBiquadFilter(); bp2.type = 'bandpass'; bp2.Q.value = 6; bp2.frequency.value = F2 * j;
        const bp2g = c.createGain(); bp2g.gain.value = 0.7; bp2.connect(bp2g);                                // F2 a touch quieter
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        const g = c.createGain(); g.gain.value = 0; bp1.connect(lp); bp2g.connect(lp); lp.connect(g).connect(o);
        [base, base * 1.013].forEach((f, k) => {
            const osc = c.createOscillator(); osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f * 1.05, t); osc.frequency.linearRampToValueAtTime(f, t + 0.06); osc.frequency.linearRampToValueAtTime(f * 0.97, t + 0.13);
            const og = c.createGain(); og.gain.value = k === 0 ? 1 : 0.55; osc.connect(og); og.connect(bp1); og.connect(bp2);
            osc.start(t); osc.stop(t + 0.15);
        });
        const sub = c.createOscillator(); sub.type = 'sine'; const sg = c.createGain(); sg.gain.value = 0;   // chest body
        sub.frequency.value = base * 0.5; sub.connect(sg).connect(o);
        sg.gain.linearRampToValueAtTime(0.05, t + 0.02); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.12); sub.start(t); sub.stop(t + 0.15);
        g.gain.linearRampToValueAtTime(0.1, t + 0.016); g.gain.exponentialRampToValueAtTime(0.001, t + 0.115);
        if (i < syl - 1 && Math.random() < 0.65) {   // consonant/breath onset before the next vowel
            const ct = t + 0.1;
            const src = c.createBufferSource(); src.buffer = noiseBuf(c);
            const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1600 + Math.random() * 1600; cf.Q.value = 1.1;
            const cg = c.createGain(); cg.gain.value = 0; src.connect(cf).connect(cg).connect(o);
            cg.gain.linearRampToValueAtTime(0.026, ct + 0.006); cg.gain.exponentialRampToValueAtTime(0.001, ct + 0.05);
            src.start(ct); src.stop(ct + 0.07);
        }
        t += 0.12 + Math.random() * 0.06;            // randomized syllable spacing
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
