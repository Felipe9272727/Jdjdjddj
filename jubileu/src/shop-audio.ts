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

// ── Lobby ambient drone (procedural) ─────────────────────────────────────
// Replaces the previous hotel-lobby.mp3 muzak. The shop's atmosphere is
// "liminal hotel" — dark, quiet, slightly off — and a drone ambient
// patch is more on-tone than elevator muzak. Generated entirely with
// Web Audio API: zero download, deterministic, no CORS surprises.
//
// Patch:
//   • Sub-bass sine at 50 Hz with very slow detune LFO (±8 cents, 0.07 Hz)
//   • Mid pad — sawtooth A2 (110 Hz) through a low-pass with slow sweep
//   • High pad — sawtooth C4-ish (130.8 Hz, minor third), detuned 7 cents
//   • Reverb-ish: short feedback delay (no convolver — keeps it light)
//   • Occasional distant "tink" — random metallic ping every ~8s, 30% prob
//
// Master gain ramps 0 → 0.18 over 2s on start, fades to 0 over 0.6s on stop.

export function createLobbyMusic(): { start: () => void; stop: () => void } {
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
        // Master bus + soft fade in
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.18, now + 2.0);

        // Light pseudo-reverb via short feedback delay (cheaper than convolver)
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

        // Helper to create LFO and route to a target AudioParam
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

        // ── Sub-bass drone — sine 50Hz with slow detune ──
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = 50;
        const subGain = ctx.createGain();
        subGain.gain.value = 0.55;
        sub.connect(subGain).connect(masterGain);
        sub.start();
        oscs.push(sub);
        nodes.push(subGain);
        lfo(0.07, 8, sub.detune); // ±8 cents, 14s period

        // ── Mid pad — sawtooth A2 through filtered low-pass ──
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
        // Also send to delay for ambience
        padGain.connect(delay);
        pad.start();
        oscs.push(pad);
        nodes.push(padFilter, padGain);
        lfo(0.04, 220, padFilter.frequency); // slow filter sweep ±220 Hz

        // ── High pad — minor third above A2, detuned ──
        const padHi = ctx.createOscillator();
        padHi.type = 'sawtooth';
        padHi.frequency.value = 110 * Math.pow(2, 3 / 12); // ~130.8 Hz
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
        lfo(0.029, 8, padHi.detune); // pitch shimmer

        // ── Distant metallic tinks — random, sparse ──
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
          // these short oscs aren't pushed to oscs[] — they self-stop
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

      // Fade out the master bus, then tear down.
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
