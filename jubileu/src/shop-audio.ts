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

// ── Hotel lobby music: real MP3 from GitHub ───────────────────────────────
// Fallback chain — tries each URL in order until one succeeds. Allows the
// shop to keep playing music even if the primary track 404s, and gives us
// room to add seasonal/variant tracks later.
const LOBBY_MUSIC_URLS = [
  'https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/hotel-lobby.mp3',
  'https://raw.githubusercontent.com/Felipe9272727/M-sica-pro-meu-jogo/main/Lobby%20Time(MP3_160K).mp3',
];
let lobbyBuffer: AudioBuffer | null = null;
let lobbyLoadPromise: Promise<AudioBuffer> | null = null;

async function loadLobbyMusic(ctx: AudioContext): Promise<AudioBuffer> {
  if (lobbyBuffer) return lobbyBuffer;
  if (lobbyLoadPromise) return lobbyLoadPromise;

  lobbyLoadPromise = (async () => {
    let lastErr: unknown = null;
    for (const url of LOBBY_MUSIC_URLS) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arrayBuf);
        lobbyBuffer = buf;
        return buf;
      } catch (e) {
        lastErr = e;
        // Try next URL in the chain.
      }
    }
    throw lastErr ?? new Error('All lobby music URLs failed');
  })();

  try {
    return await lobbyLoadPromise;
  } catch (e) {
    lobbyLoadPromise = null; // allow retry
    throw e;
  }
}

export function createLobbyMusic(): { start: () => void; stop: () => void } {
  let source: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let ctx: AudioContext | null = null;
  let playing = false;

  function cleanup() {
    if (source) {
      try { source.stop(); } catch { /* ok */ }
      try { source.disconnect(); } catch { /* ok */ }
      source = null;
    }
    if (gainNode) {
      try { gainNode.disconnect(); } catch { /* ok */ }
      gainNode = null;
    }
  }

  return {
    async start() {
      if (playing) return;
      ctx = getCtx();
      ensureResumed(ctx!);
      playing = true;

      try {
        const buffer = await loadLobbyMusic(ctx!);
        if (!playing) return; // stopped while loading

        cleanup(); // clear any previous instance

        source = ctx!.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        gainNode = ctx!.createGain();
        gainNode.gain.setValueAtTime(0, ctx!.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.25, ctx!.currentTime + 1.5);

        source.connect(gainNode);
        gainNode.connect(ctx!.destination);
        source.start();
      } catch (e) {
        console.warn('[shop-audio] Lobby music failed:', e);
        playing = false;
        cleanup();
      }
    },
    stop() {
      if (!playing) return;
      playing = false;

      // Fade out then cleanup
      if (gainNode && ctx) {
        try {
          gainNode.gain.cancelScheduledValues(ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        } catch { /* ok */ }
      }

      // Cleanup after fade
      setTimeout(cleanup, 600);
    },
  };
}
