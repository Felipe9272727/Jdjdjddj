/**
 * shop-audio.ts — Audio for the hotel reception shop.
 * Coordinates with game AudioEngine via muted prop (App.tsx passes muted={muted || shopOpen}).
 *
 * - playDoorbell(): procedural metallic "DING-ding"
 * - playBeep(): Undertale text beep (procedural)
 * - playSelect(): hover blip (procedural)
 * - playConfirm(): select sound (procedural)
 * - createLobbyMusic(): real MP3 hotel lobby music from GitHub
 */

// ── Shared AudioContext ──────────────────────────────────────────────────
function getCtx(): AudioContext {
  const w = window as any;
  if (w.__jubileuAudioCtx) return w.__jubileuAudioCtx as AudioContext;
  const ctx = new AudioContext();
  w.__jubileuAudioCtx = ctx;
  return ctx;
}

function ensureResumed(ctx: AudioContext) {
  if (ctx.state === 'suspended') ctx.resume();
}

// ── Doorbell: procedural metallic "DING-ding" ────────────────────────────
export function playDoorbell(): void {
  try {
    const ctx = getCtx();
    ensureResumed(ctx);
    const now = ctx.currentTime;

    // First "DING" — bright metallic
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.value = 1200;
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.start(now);
    osc1.stop(now + 0.6);

    // Second "ding" — softer, lower
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = 900;
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.15, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.7);
  } catch { /* silent */ }
}

// ── Undertale text beep ──────────────────────────────────────────────────
export function playBeep(): void {
  try {
    const ctx = getCtx();
    ensureResumed(ctx);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 600;
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.start(now);
    osc.stop(now + 0.03);
  } catch { /* silent */ }
}

// ── Select (hover) ───────────────────────────────────────────────────────
export function playSelect(): void {
  try {
    const ctx = getCtx();
    ensureResumed(ctx);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 900;
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    osc.start(now);
    osc.stop(now + 0.02);
  } catch { /* silent */ }
}

// ── Confirm (click) ──────────────────────────────────────────────────────
export function playConfirm(): void {
  try {
    const ctx = getCtx();
    ensureResumed(ctx);
    const now = ctx.currentTime;
    [600, 900].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      const t = now + i * 0.05;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.start(t);
      osc.stop(t + 0.04);
    });
  } catch { /* silent */ }
}

// ── Lobby ambient: Rhodes piano with subtle off-tone (procedural) ──────
// "Hotel reception with a hint of liminal" — slow chord progression on a
// Rhodes-style EP, low-pass-filtered string pad, light reverb, a few
// sparse bell tinks. Stays tonal (not dissonant) but with a slow detune
// shimmer so it never quite settles. Generated entirely with Web Audio
// API: zero download, no CORS.
//
// Progression: Am → F → C → Em, 6s per chord, 24s loop. Each chord
// triad (root + third + fifth) is struck with slight stagger and a
// long Rhodes-like envelope (soft attack, slow exponential decay).
//
// The dark/drone variant from the previous version is still exported
// as `createDarkDrone` for future use (deeper floors, chase, etc.).

interface AmbientHandle { start: () => void; stop: () => void; }

export function createLobbyMusic(): AmbientHandle {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let delay: DelayNode | null = null;
  let scheduler: number | null = null;
  let bellTimer: number | null = null;
  let pad: OscillatorNode | null = null;
  let padFilter: BiquadFilterNode | null = null;
  let padFilterLfo: OscillatorNode | null = null;
  let padLfoGain: GainNode | null = null;
  let chordIndex = 0;
  let playing = false;

  // Triads — root, third, fifth (Hz). Progression: Am F C Em.
  const PROGRESSION: { triad: number[]; padRoot: number }[] = [
    { triad: [220.0,  261.63, 329.63], padRoot: 110.0 }, // A minor (A3 C4 E4) over A2 pad
    { triad: [174.61, 220.0,  261.63], padRoot: 87.31 }, // F major  (F3 A3 C4) over F2 pad
    { triad: [261.63, 329.63, 392.0 ], padRoot: 130.81 }, // C major (C4 E4 G4) over C3 pad
    { triad: [164.81, 196.0,  246.94], padRoot: 82.41 }, // E minor (E3 G3 B3) over E2 pad
  ];
  const CHORD_DUR = 6.0;

  function playRhodesNote(freq: number, when: number, dur: number, vel = 0.07) {
    if (!ctx || !masterGain) return;
    // Two sines (fundamental + 2nd harmonic) gives a soft Rhodes timbre.
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;
    // Slow detune for subtle off-tone shimmer.
    const det = ctx.createOscillator();
    det.type = 'sine';
    det.frequency.value = 0.08 + Math.random() * 0.04;
    const detGain = ctx.createGain();
    detGain.gain.value = 4; // ±4 cents
    det.connect(detGain).connect(osc1.detune);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.22;
    osc2.connect(harmGain);

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, when);
    noteGain.gain.linearRampToValueAtTime(vel, when + 0.06);
    noteGain.gain.exponentialRampToValueAtTime(vel * 0.35, when + dur * 0.45);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc1.connect(noteGain);
    harmGain.connect(noteGain);
    noteGain.connect(masterGain);
    // Send to delay for ambience
    if (delay) noteGain.connect(delay);

    osc1.start(when);
    osc2.start(when);
    det.start(when);
    const stopAt = when + dur + 0.15;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    det.stop(stopAt);
  }

  function playBell(when: number, freq: number, vel = 0.04) {
    if (!ctx || !masterGain) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.5);
    osc.connect(g);
    if (delay) g.connect(delay);
    g.connect(masterGain);
    osc.start(when);
    osc.stop(when + 2.6);
  }

  function strikeNextChord() {
    if (!ctx || !masterGain || !playing) return;
    const t = ctx.currentTime;
    const c = PROGRESSION[chordIndex];
    // Triad strike with arpeggiated stagger.
    playRhodesNote(c.triad[0], t + 0.00, CHORD_DUR, 0.075);
    playRhodesNote(c.triad[1], t + 0.06, CHORD_DUR, 0.062);
    playRhodesNote(c.triad[2], t + 0.12, CHORD_DUR, 0.052);
    // Glide pad to chord root.
    if (pad) {
      pad.frequency.cancelScheduledValues(t);
      pad.frequency.setValueAtTime(pad.frequency.value, t);
      pad.frequency.linearRampToValueAtTime(c.padRoot, t + 1.5);
    }
    chordIndex = (chordIndex + 1) % PROGRESSION.length;
  }

  function teardown() {
    if (scheduler !== null) { window.clearInterval(scheduler); scheduler = null; }
    if (bellTimer !== null) { window.clearInterval(bellTimer); bellTimer = null; }
    [pad, padFilterLfo].forEach((o) => { try { o?.stop(); } catch { /* ok */ } });
    [pad, padFilter, padFilterLfo, padLfoGain, masterGain, delay].forEach((n) => {
      try { n?.disconnect(); } catch { /* ok */ }
    });
    pad = null;
    padFilter = null;
    padFilterLfo = null;
    padLfoGain = null;
    masterGain = null;
    delay = null;
    chordIndex = 0;
  }

  return {
    start() {
      if (playing) return;
      ctx = getCtx();
      ensureResumed(ctx);
      playing = true;
      const now = ctx.currentTime;

      try {
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.22, now + 1.6);
        masterGain.connect(ctx.destination);

        // Pseudo-reverb: feedback delay
        delay = ctx.createDelay(1.2);
        delay.delayTime.value = 0.42;
        const fb = ctx.createGain();
        fb.gain.value = 0.32;
        const wet = ctx.createGain();
        wet.gain.value = 0.45;
        delay.connect(fb).connect(delay);
        delay.connect(wet).connect(masterGain);

        // Sustained pad — sawtooth low-passed, glides between chord roots.
        pad = ctx.createOscillator();
        pad.type = 'sawtooth';
        pad.frequency.value = PROGRESSION[0].padRoot;
        padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 320;
        padFilter.Q.value = 4;
        const padGain = ctx.createGain();
        padGain.gain.value = 0.06;
        pad.connect(padFilter).connect(padGain).connect(masterGain);
        padGain.connect(delay);
        // Slow filter sweep keeps it from getting static.
        padFilterLfo = ctx.createOscillator();
        padFilterLfo.type = 'sine';
        padFilterLfo.frequency.value = 0.05;
        padLfoGain = ctx.createGain();
        padLfoGain.gain.value = 120;
        padFilterLfo.connect(padLfoGain).connect(padFilter.frequency);
        pad.start();
        padFilterLfo.start();

        // Strike first chord immediately, then every CHORD_DUR seconds.
        strikeNextChord();
        scheduler = window.setInterval(strikeNextChord, CHORD_DUR * 1000);

        // Sparse high bell — that "ding" you hear in a quiet hotel lobby.
        bellTimer = window.setInterval(() => {
          if (!ctx || !playing) return;
          if (Math.random() > 0.18) return;
          const t = ctx.currentTime;
          const bellFreqs = [880, 1108.73, 1318.51, 1760]; // A5, C#6, E6, A6
          playBell(t, bellFreqs[Math.floor(Math.random() * bellFreqs.length)], 0.025);
        }, 12000);
      } catch (e) {
        console.warn('[shop-audio] Lobby music failed:', e);
        playing = false;
        teardown();
      }
    },
    stop() {
      if (!playing) return;
      playing = false;
      if (masterGain && ctx) {
        try {
          const t = ctx.currentTime;
          masterGain.gain.cancelScheduledValues(t);
          masterGain.gain.setValueAtTime(masterGain.gain.value, t);
          masterGain.gain.linearRampToValueAtTime(0, t + 0.8);
        } catch { /* ok */ }
      }
      window.setTimeout(teardown, 900);
    },
  };
}

// ── Dark drone (saved for future use: deeper floors, chase scenes) ─────
// Same patch the shop used in the previous iteration — kept exported so
// other parts of the game can pull this when they need a heavier mood.
export function createDarkDrone(): AmbientHandle {
  let nodes: AudioNode[] = [];
  let oscs: OscillatorNode[] = [];
  let masterGain: GainNode | null = null;
  let ctx: AudioContext | null = null;
  let creakInterval: number | null = null;
  let playing = false;

  function teardown() {
    if (creakInterval !== null) {
      window.clearInterval(creakInterval);
      creakInterval = null;
    }
    oscs.forEach((o) => { try { o.stop(); } catch { /* ok */ } });
    nodes.forEach((n) => { try { n.disconnect(); } catch { /* ok */ } });
    oscs = [];
    nodes = [];
    masterGain = null;
  }

  return {
    start() {
      if (playing) return;
      ctx = getCtx();
      ensureResumed(ctx);
      playing = true;
      const now = ctx.currentTime;

      try {
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.18, now + 2.0);

        const delay = ctx.createDelay(1.0);
        delay.delayTime.value = 0.32;
        const fb = ctx.createGain();
        fb.gain.value = 0.4;
        const wet = ctx.createGain();
        wet.gain.value = 0.5;
        delay.connect(fb).connect(delay);
        delay.connect(wet).connect(masterGain);
        masterGain.connect(ctx.destination);
        nodes.push(masterGain, delay, fb, wet);

        const lfo = (freq: number, depth: number, target: AudioParam) => {
          const o = ctx!.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq;
          const g = ctx!.createGain();
          g.gain.value = depth;
          o.connect(g).connect(target);
          o.start();
          oscs.push(o);
          nodes.push(g);
        };

        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = 50;
        const subGain = ctx.createGain();
        subGain.gain.value = 0.55;
        sub.connect(subGain).connect(masterGain);
        sub.start();
        oscs.push(sub);
        nodes.push(subGain);
        lfo(0.07, 8, sub.detune);

        const pad = ctx.createOscillator();
        pad.type = 'sawtooth';
        pad.frequency.value = 110;
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 380;
        padFilter.Q.value = 6;
        const padGain = ctx.createGain();
        padGain.gain.value = 0.13;
        pad.connect(padFilter).connect(padGain).connect(masterGain);
        padGain.connect(delay);
        pad.start();
        oscs.push(pad);
        nodes.push(padFilter, padGain);
        lfo(0.04, 220, padFilter.frequency);

        const padHi = ctx.createOscillator();
        padHi.type = 'sawtooth';
        padHi.frequency.value = 110 * Math.pow(2, 3 / 12);
        padHi.detune.value = 7;
        const padHiFilter = ctx.createBiquadFilter();
        padHiFilter.type = 'lowpass';
        padHiFilter.frequency.value = 600;
        padHiFilter.Q.value = 4;
        const padHiGain = ctx.createGain();
        padHiGain.gain.value = 0.07;
        padHi.connect(padHiFilter).connect(padHiGain).connect(masterGain);
        padHiGain.connect(delay);
        padHi.start();
        oscs.push(padHi);
        nodes.push(padHiFilter, padHiGain);
        lfo(0.029, 8, padHi.detune);

        creakInterval = window.setInterval(() => {
          if (!ctx || !masterGain || !playing) return;
          if (Math.random() > 0.3) return;
          const t = ctx.currentTime;
          const tink = ctx.createOscillator();
          tink.type = 'sine';
          tink.frequency.value = 900 + Math.random() * 700;
          const tinkGain = ctx.createGain();
          tinkGain.gain.setValueAtTime(0, t);
          tinkGain.gain.linearRampToValueAtTime(0.04, t + 0.01);
          tinkGain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
          tink.connect(tinkGain).connect(delay);
          tink.start(t);
          tink.stop(t + 1.7);
        }, 8000);
      } catch (e) {
        console.warn('[shop-audio] Drone failed:', e);
        playing = false;
        teardown();
      }
    },
    stop() {
      if (!playing) return;
      playing = false;
      if (masterGain && ctx) {
        try {
          const now = ctx.currentTime;
          masterGain.gain.cancelScheduledValues(now);
          masterGain.gain.setValueAtTime(masterGain.gain.value, now);
          masterGain.gain.linearRampToValueAtTime(0, now + 0.6);
        } catch { /* ok */ }
      }
      window.setTimeout(teardown, 700);
    },
  };
}
