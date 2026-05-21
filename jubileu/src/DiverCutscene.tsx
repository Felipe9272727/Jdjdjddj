/**
 * DiverCutscene.tsx — Cinematic linear cutscene for the BeardedDiver.
 *
 * Improvements over the original:
 *  - Typewriter audio: soft underwater click per character (Web Audio)
 *  - Beat flash: mood-coloured full-screen flash on each beat transition
 *  - Ambient bubbles: 7 CSS-animated circles drifting up through the visible
 *    cinematic window (the area between the letterbox bars)
 *  - Film grain: animated SVG noise overlay for cinematic texture
 *  - Scanlines: very faint horizontal lines, retro-dive-monitor feel
 *  - Depth meter: animated dive-computer readout in the top bar that counts
 *    down (in metres) as the conversation goes deeper
 *  - Full-screen mood overlay: very subtle per-beat tint covering the game
 *    view (not just the bottom bar) so the whole scene breathes with mood
 *  - Chromatic fringe: brief RGB-split text on new beat (CSS animation)
 *  - Enhanced auto-advance bar with glow pulse at completion
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface DiverCutsceneProps {
  onAccept: () => void;
  onRefuse: () => void;
  onBeat?: (beatIdx: number) => void;
}

const BEATS: string[] = [
  'Ahh... mais um turista. Eu estava te esperando, sabe?',
  'Eu fui o mergulhador da casa. Antes dela ser uma casa. Antes dela ser qualquer coisa.',
  'Agora eu cuido das pessoas que descem. Faço com que vocês respirem. E que vejam.',
  'Já tem gente demais lá embaixo. Toma — encaixa direitinho na cara.',
  'Aperta a tecla N quando precisar enxergar no escuro. Vai. E boa sorte.',
];

// Depth (in metres) displayed at each beat — counts toward this value.
const BEAT_DEPTHS: readonly number[] = [-12, -31, -52, -78, -87];

// Per-beat mood flash colour (rgba CSS string)
const BEAT_FLASH_COLOR: readonly string[] = [
  'rgba(34, 211, 238, 0.18)',   // beat 0 — cyan curiosity
  'rgba(251, 191,  36, 0.14)',  // beat 1 — amber nostalgia
  'rgba(251, 146,  60, 0.13)',  // beat 2 — orange warmth
  'rgba( 74, 222, 128, 0.16)',  // beat 3 — green NV (mask)
  'rgba(147, 197, 253, 0.14)',  // beat 4 — cool blue authority
];

// Per-beat very faint full-screen mood tint (CSS colour)
const BEAT_MOOD_BG: readonly string[] = [
  'rgba(34, 211, 238, 0.025)',
  'rgba(251, 191,  36, 0.03)',
  'rgba(251, 146,  60, 0.025)',
  'rgba( 74, 222, 128, 0.032)',
  'rgba(147, 197, 253, 0.025)',
];

const TYPEWRITER_MS = 26;
const DWELL_AFTER_TYPE_MS = 1700;

function typeSpeedForBeat(idx: number): number {
  return idx === 1 ? 37 : idx === 2 ? 30 : idx === 3 ? 23 : TYPEWRITER_MS;
}

function dwellForBeat(idx: number, text: string): number {
  const extra = idx === 3 ? 900 : idx === 4 ? 500 : idx === 1 ? 200 : 0;
  return typeSpeedForBeat(idx) * text.length + DWELL_AFTER_TYPE_MS + extra;
}

// ─── Typewriter audio — soft underwater click ─────────────────────────────
function makeAudioCtx(): AudioContext | null {
  try { return new AudioContext(); } catch { return null; }
}

function playTypeClick(ctx: AudioContext) {
  try {
    const len = Math.floor(ctx.sampleRate * 0.028);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // Exponential-decay noise burst → muffled underwater click
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.007));
    }
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    const lp   = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.055;
    src.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
    src.start();
  } catch {}
}

// ─── Ambient bubbles config ───────────────────────────────────────────────
const BUBBLE_CFG = [
  { left: '8%',  size: '5px',  delay: '0s',    dur: '7.2s',  wobble:  '8px' },
  { left: '19%', size: '7px',  delay: '2.1s',  dur: '9.5s',  wobble: '-6px' },
  { left: '34%', size: '4px',  delay: '0.7s',  dur: '6.8s',  wobble:  '5px' },
  { left: '51%', size: '6px',  delay: '3.8s',  dur: '8.3s',  wobble: '-9px' },
  { left: '65%', size: '3px',  delay: '1.5s',  dur: '7.0s',  wobble:  '4px' },
  { left: '79%', size: '8px',  delay: '4.6s',  dur: '10.1s', wobble: '-7px' },
  { left: '91%', size: '5px',  delay: '2.8s',  dur: '7.7s',  wobble:  '6px' },
] as const;

// ─── Component ───────────────────────────────────────────────────────────
export const DiverCutscene = ({ onAccept, onRefuse, onBeat }: DiverCutsceneProps) => {
  const [beatIdx, setBeatIdx]           = useState(0);
  const [displayedLen, setDisplayedLen] = useState(0);
  const [doneTyping, setDoneTyping]     = useState(false);
  const [lettersIn, setLettersIn]       = useState(false);
  const [beatFlashKey, setBeatFlashKey] = useState(0);   // each increment re-triggers flash
  const [depthVal, setDepthVal]         = useState(BEAT_DEPTHS[0]);

  const typeIntervalRef  = useRef<ReturnType<typeof setInterval>  | null>(null);
  const advanceTimeoutRef= useRef<ReturnType<typeof setTimeout>   | null>(null);
  const depthIntervalRef = useRef<ReturnType<typeof setInterval>  | null>(null);
  const handedOffRef     = useRef(false);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  // Click throttle: don't click on *every* character — every ~3rd one is enough.
  const clickCountRef    = useRef(0);

  const totalBeats = BEATS.length;
  const beatText   = BEATS[beatIdx] ?? '';

  // ── Slide letterbox in on mount ─────────────────────────────────────────
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLettersIn(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Notify parent on beat change ─────────────────────────────────────────
  useEffect(() => { onBeat?.(beatIdx); }, [beatIdx, onBeat]);

  // ── Depth counter — counts from current displayed value to target ─────────
  const animateDepth = useCallback((target: number) => {
    if (depthIntervalRef.current) clearInterval(depthIntervalRef.current);
    depthIntervalRef.current = setInterval(() => {
      setDepthVal(prev => {
        if (prev === target) { clearInterval(depthIntervalRef.current!); return prev; }
        return prev + (target > prev ? 1 : -1);
      });
    }, 28);
  }, []);

  // ── Typewriter ───────────────────────────────────────────────────────────
  useEffect(() => {
    setDisplayedLen(0);
    setDoneTyping(false);
    setBeatFlashKey(k => k + 1);          // fire mood flash on every new beat
    animateDepth(BEAT_DEPTHS[beatIdx]);    // start depth counter

    if (typeIntervalRef.current) { clearInterval(typeIntervalRef.current); typeIntervalRef.current = null; }
    clickCountRef.current = 0;

    let idx = 0;
    typeIntervalRef.current = setInterval(() => {
      idx += 1;
      setDisplayedLen(idx);

      // Play click every ~3rd char to avoid audio fatigue
      clickCountRef.current += 1;
      if (clickCountRef.current % 3 === 0) {
        if (!audioCtxRef.current) audioCtxRef.current = makeAudioCtx();
        if (audioCtxRef.current) playTypeClick(audioCtxRef.current);
      }

      if (idx >= beatText.length) {
        if (typeIntervalRef.current) { clearInterval(typeIntervalRef.current); typeIntervalRef.current = null; }
        setDoneTyping(true);
      }
    }, typeSpeedForBeat(beatIdx));

    return () => { if (typeIntervalRef.current) { clearInterval(typeIntervalRef.current); typeIntervalRef.current = null; } };
  }, [beatIdx, beatText, animateDepth]);

  // ── Auto-advance ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (advanceTimeoutRef.current) { clearTimeout(advanceTimeoutRef.current); advanceTimeoutRef.current = null; }
    advanceTimeoutRef.current = setTimeout(() => {
      if (beatIdx >= totalBeats - 1) {
        if (!handedOffRef.current) { handedOffRef.current = true; onAccept(); }
        return;
      }
      setBeatIdx(i => i + 1);
    }, dwellForBeat(beatIdx, beatText));
    return () => { if (advanceTimeoutRef.current) { clearTimeout(advanceTimeoutRef.current); advanceTimeoutRef.current = null; } };
  }, [beatIdx, beatText, totalBeats, onAccept]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (depthIntervalRef.current) clearInterval(depthIntervalRef.current);
    try { audioCtxRef.current?.close(); } catch {}
  }, []);

  const advanceNow = useCallback(() => {
    if (advanceTimeoutRef.current) { clearTimeout(advanceTimeoutRef.current); advanceTimeoutRef.current = null; }
    if (typeIntervalRef.current)   { clearInterval(typeIntervalRef.current);  typeIntervalRef.current = null;  }
    if (!doneTyping) {
      setDisplayedLen(beatText.length);
      setDoneTyping(true);
      advanceTimeoutRef.current = setTimeout(() => {
        if (beatIdx >= totalBeats - 1) {
          if (!handedOffRef.current) { handedOffRef.current = true; onAccept(); }
          return;
        }
        setBeatIdx(i => i + 1);
      }, 700);
      return;
    }
    if (beatIdx >= totalBeats - 1) {
      if (!handedOffRef.current) { handedOffRef.current = true; onAccept(); }
      return;
    }
    setBeatIdx(i => i + 1);
  }, [beatIdx, beatText, doneTyping, onAccept, totalBeats]);

  const handleSkip = useCallback(() => {
    if (handedOffRef.current) return;
    handedOffRef.current = true;
    onRefuse();
  }, [onRefuse]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleSkip(); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advanceNow(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advanceNow, handleSkip]);

  const displayed     = beatText.slice(0, displayedLen);
  const depthDisplay  = `${depthVal} m`;
  const moodBg        = BEAT_MOOD_BG[beatIdx] ?? BEAT_MOOD_BG[0];
  const flashColor    = BEAT_FLASH_COLOR[beatIdx] ?? BEAT_FLASH_COLOR[0];
  const dwellMs       = DWELL_AFTER_TYPE_MS + (beatIdx === 3 ? 900 : beatIdx === 1 ? 200 : beatIdx === 4 ? 500 : 0);

  return (
    <div className="cs-root" onClick={advanceNow}>

      {/* ── Film grain overlay ────────────────────────────────────────── */}
      <div className="cs-grain" aria-hidden="true" />

      {/* ── Scanlines ─────────────────────────────────────────────────── */}
      <div className="cs-scanlines" aria-hidden="true" />

      {/* ── Per-beat full-screen mood wash ────────────────────────────── */}
      <div
        className="cs-mood"
        aria-hidden="true"
        style={{ background: moodBg }}
      />

      {/* ── Beat transition flash ─────────────────────────────────────── */}
      <div
        key={beatFlashKey}
        className="cs-beat-flash"
        aria-hidden="true"
        style={{ '--flash-color': flashColor } as React.CSSProperties}
      />

      {/* ── Ambient bubbles (visible window only — between the bars) ─── */}
      <div className="cs-bubbles-stage" aria-hidden="true">
        {BUBBLE_CFG.map((b, i) => (
          <div
            key={i}
            className="cs-bubble"
            style={{
              left:     b.left,
              width:    b.size,
              height:   b.size,
              animationDelay:    b.delay,
              animationDuration: b.dur,
              '--wobble': b.wobble,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* ── Cinematic corner vignette ─────────────────────────────────── */}
      <div className="cs-vignette" aria-hidden="true" />

      {/* ── Top letterbox bar ─────────────────────────────────────────── */}
      <div className={`cs-bar cs-bar-top ${lettersIn ? 'cs-bar-in' : ''}`}>

        {/* Dive-computer depth readout */}
        <div className="cs-depth" aria-hidden="true">
          <span className="cs-depth-label">PROF</span>
          <span className="cs-depth-value">{depthDisplay}</span>
        </div>

        {/* Beat index in film-negative style */}
        <div className="cs-film-counter" aria-hidden="true">
          {String(beatIdx + 1).padStart(2, '0')} / {String(totalBeats).padStart(2, '0')}
        </div>

        <button
          type="button"
          className="cs-skip"
          onClick={e => { e.stopPropagation(); handleSkip(); }}
          aria-label="Pular cutscene"
        >
          <span>PULAR</span>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M7 6 L17 12 L7 18 Z" fill="currentColor" opacity="0.85" />
            <line x1="19" y1="6" x2="19" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Bottom letterbox bar ──────────────────────────────────────── */}
      <div className={`cs-bar cs-bar-bottom ${lettersIn ? 'cs-bar-in' : ''}`}>
        {/* Per-beat emotional colour wash inside the bar */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: [
              'radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.09) 0%, transparent 70%)',
              'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.10) 0%, transparent 70%)',
              'radial-gradient(ellipse at 50% 100%, rgba(251,146,60,0.08) 0%, transparent 70%)',
              'radial-gradient(ellipse at 50% 100%, rgba(74,222,128,0.12) 0%, transparent 70%)',
              'radial-gradient(ellipse at 50% 100%, rgba(147,197,253,0.09) 0%, transparent 70%)',
            ][beatIdx] ?? 'none',
            transition: 'background 900ms ease',
          }}
        />

        {/* Subtle waveform decoration — thin horizontal line with a wave */}
        <div className="cs-waveform" aria-hidden="true">
          <svg viewBox="0 0 800 16" preserveAspectRatio="none" width="100%" height="16">
            <path
              className="cs-wave-path"
              d="M0,8 Q100,2 200,8 Q300,14 400,8 Q500,2 600,8 Q700,14 800,8"
              fill="none"
              stroke="rgba(34,211,238,0.18)"
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* Speaker name */}
        <div className="cs-speaker">
          <span className="cs-speaker-dot" />
          MERGULHADOR
          {/* Small beat emotion label */}
          <span className="cs-beat-label" key={`lbl-${beatIdx}`}>
            {['curioso', 'memória', 'cuidado', 'entrega', 'partida'][beatIdx] ?? ''}
          </span>
        </div>

        {/* Subtitle — keyed per beat so the fade-in replays */}
        <p className="cs-subtitle" key={`sub-${beatIdx}`}>
          {displayed}
          {!doneTyping && <span className="cs-caret" aria-hidden="true" />}
        </p>

        {/* Auto-advance progress bar */}
        {doneTyping && (
          <div className="cs-auto-bar" key={`bar-${beatIdx}`} aria-hidden="true">
            <div className="cs-auto-bar-fill" style={{ animationDuration: `${dwellMs}ms` }} />
          </div>
        )}

        {/* Progress dots */}
        <div className="cs-progress" aria-hidden="true">
          {BEATS.map((_, i) => (
            <span
              key={i}
              className={`cs-dot ${i === beatIdx ? 'cs-dot-current' : ''} ${i < beatIdx ? 'cs-dot-past' : ''}`}
            />
          ))}
        </div>

        <div className="cs-tap-hint">
          {doneTyping ? 'TOQUE PARA CONTINUAR' : 'TOQUE PARA PULAR FALA'}
        </div>
      </div>

      <style>{STYLES}</style>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────
const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const STYLES = `
.cs-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: auto;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ── Film grain ────────────────────────────────────────────────────────── */
.cs-grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  opacity: 0.045;
  background-image: ${NOISE_SVG};
  background-size: 256px 256px;
  mix-blend-mode: overlay;
  animation: cs-grain-shift 0.14s steps(1) infinite;
}
@keyframes cs-grain-shift {
  0%   { background-position:   0%   0%; }
  14%  { background-position:  -8%  -5%; }
  28%  { background-position:   4%  12%; }
  42%  { background-position: -14%   6%; }
  57%  { background-position:   9% -18%; }
  71%  { background-position:  -3%  21%; }
  85%  { background-position:  16%  -8%; }
  100% { background-position:   0%   0%; }
}

/* ── Scanlines ─────────────────────────────────────────────────────────── */
.cs-scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0, 0, 0, 0.04) 2px,
    rgba(0, 0, 0, 0.04) 4px
  );
}

/* ── Full-screen mood overlay ──────────────────────────────────────────── */
.cs-mood {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  transition: background 1100ms ease;
}

/* ── Beat flash ────────────────────────────────────────────────────────── */
.cs-beat-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
  background: var(--flash-color, rgba(34,211,238,0.18));
  opacity: 0;
  animation: cs-beat-flash-anim 700ms ease-out forwards;
}
@keyframes cs-beat-flash-anim {
  0%   { opacity: 0; }
  12%  { opacity: 1; }
  100% { opacity: 0; }
}

/* ── Ambient bubbles stage (covers the visible cinematic window) ─────────
   Top bar ≈13vh, bottom bar ≈31vh → visible region: 13vh … 69vh.
   We position bubbles starting just above the bottom bar and rising. */
.cs-bubbles-stage {
  position: absolute;
  left: 0; right: 0;
  top: 13vh;
  bottom: 31vh;
  pointer-events: none;
  overflow: hidden;
  z-index: 5;
}
.cs-bubble {
  position: absolute;
  bottom: 0;
  border-radius: 50%;
  border: 1px solid rgba(34, 211, 238, 0.30);
  background: rgba(34, 211, 238, 0.05);
  animation: cs-bubble-float linear infinite both;
}
@keyframes cs-bubble-float {
  0%   { opacity: 0;    transform: translateY(0)    translateX(0); }
  8%   { opacity: 0.75; }
  88%  { opacity: 0.45; }
  100% { opacity: 0;    transform: translateY(-100%) translateX(var(--wobble, 6px)); }
}

/* ── Cinematic vignette ────────────────────────────────────────────────── */
.cs-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  background: radial-gradient(
    ellipse 72% 58% at 50% 44%,
    rgba(0,0,0,0) 52%,
    rgba(0,0,0,0.5) 100%
  );
  opacity: 0;
  animation: cs-vignette-in 900ms ease-out 120ms forwards;
}
@keyframes cs-vignette-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── Bars ─────────────────────────────────────────────────────────────── */
.cs-bar {
  position: absolute;
  left: 0; right: 0;
  pointer-events: auto;
  transition: transform 420ms cubic-bezier(0.18, 0.89, 0.32, 1.15);
  will-change: transform;
  z-index: 10;
}
.cs-bar-top {
  top: 0;
  height: 13vh;
  transform: translateY(-100%);
  background: #000;
  border-bottom: 1px solid rgba(34, 211, 238, 0.14);
  box-shadow: 0 6px 22px rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
}
.cs-bar-top::after {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 100%;
  height: 9vh;
  background: linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0));
  pointer-events: none;
}
.cs-bar-bottom {
  bottom: 0;
  height: 31vh;
  transform: translateY(100%);
  transition-delay: 80ms;
  background: linear-gradient(to bottom, #000c0f 0%, #000a0d 100%);
  border-top: 1px solid rgba(34, 211, 238, 0.28);
  box-shadow:
    0 -6px 28px rgba(0,0,0,0.7),
    inset 0 1px 0 rgba(34, 211, 238, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 20px 32px 24px;
  padding-left: max(32px, env(safe-area-inset-left));
  padding-right: max(32px, env(safe-area-inset-right));
  padding-bottom: max(24px, env(safe-area-inset-bottom));
  text-align: center;
}
.cs-bar-bottom::before {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 100%;
  height: 11vh;
  background: linear-gradient(to top, rgba(0,8,12,0.97), rgba(0,0,0,0));
  pointer-events: none;
}
.cs-bar.cs-bar-in { transform: translateY(0); }

/* ── Depth meter (top bar) ─────────────────────────────────────────────── */
.cs-depth {
  position: absolute;
  left: max(16px, env(safe-area-inset-left));
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  animation: cs-fade-up 500ms cubic-bezier(0.22,1,0.36,1) 400ms both;
}
.cs-depth-label {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.54rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: rgba(34, 211, 238, 0.55);
  text-transform: uppercase;
}
.cs-depth-value {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: rgba(103, 232, 249, 0.95);
  text-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
  font-variant-numeric: tabular-nums;
  min-width: 3.8ch;
}

/* ── Film frame counter (top bar, centred) ────────────────────────────── */
.cs-film-counter {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.60rem;
  font-weight: 600;
  letter-spacing: 0.20em;
  color: rgba(34, 211, 238, 0.35);
  animation: cs-fade-up 500ms cubic-bezier(0.22,1,0.36,1) 450ms both;
}

/* ── Skip button ──────────────────────────────────────────────────────── */
.cs-skip {
  position: absolute;
  top: 50%;
  right: max(16px, env(safe-area-inset-right));
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(34, 211, 238, 0.06);
  border: 1px solid rgba(34, 211, 238, 0.32);
  border-radius: 10px;
  color: rgba(207, 250, 254, 0.9);
  cursor: pointer;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  transition: background 150ms, border-color 150ms, color 150ms;
}
.cs-skip:hover, .cs-skip:focus-visible {
  background: rgba(34, 211, 238, 0.18);
  border-color: rgba(34, 211, 238, 0.6);
  color: #ffffff;
  outline: none;
}

/* ── Waveform decoration ──────────────────────────────────────────────── */
.cs-waveform {
  width: 100%;
  max-width: 820px;
  margin-bottom: 6px;
  opacity: 0;
  animation: cs-fade-up 700ms cubic-bezier(0.22,1,0.36,1) 350ms both;
}
.cs-wave-path {
  animation: cs-wave-drift 4s ease-in-out infinite alternate;
  transform-origin: 400px 8px;
}
@keyframes cs-wave-drift {
  from { d: path("M0,8 Q100,2 200,8 Q300,14 400,8 Q500,2 600,8 Q700,14 800,8"); }
  to   { d: path("M0,8 Q100,14 200,8 Q300,2 400,8 Q500,14 600,8 Q700,2 800,8"); }
}

/* ── Speaker name ─────────────────────────────────────────────────────── */
.cs-speaker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  color: #67e8f9;
  text-transform: uppercase;
  text-shadow: 0 0 14px rgba(103,232,249,0.55);
  margin-bottom: 8px;
  animation: cs-speaker-in 560ms cubic-bezier(0.22,1,0.36,1) 360ms both;
}
@keyframes cs-speaker-in {
  from { opacity: 0; transform: translateY(-7px); letter-spacing: 0.42em; }
  to   { opacity: 1; transform: translateY(0);    letter-spacing: 0.22em; }
}
.cs-speaker-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 8px rgba(34,211,238,0.9);
  animation: cs-dot-pulse 1.5s ease-in-out infinite;
}
@keyframes cs-dot-pulse {
  0%,100% { opacity: 1; transform: scale(1); }
  50%     { opacity: 0.4; transform: scale(0.7); }
}

/* Beat emotion label — tiny italic descriptor next to the speaker name */
.cs-beat-label {
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: rgba(103, 232, 249, 0.45);
  font-style: italic;
  text-transform: lowercase;
  margin-left: 2px;
  animation: cs-beat-label-in 400ms ease-out both;
}
@keyframes cs-beat-label-in {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ── Subtitle ─────────────────────────────────────────────────────────── */
.cs-subtitle {
  margin: 0 auto;
  max-width: 860px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 1.60rem;
  line-height: 1.42;
  font-weight: 600;
  color: #e8f8ff;
  text-shadow:
    0 2px 18px rgba(0,0,0,0.95),
    0 0 40px rgba(34,211,238,0.06);
  letter-spacing: 0.012em;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: cs-line-in 380ms cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes cs-line-in {
  from { opacity: 0; transform: translateY(14px); filter: blur(4px); }
  to   { opacity: 1; transform: translateY(0);    filter: blur(0px); }
}
.cs-caret {
  display: inline-block;
  width: 3px; height: 1.05em;
  background: #22d3ee;
  margin-left: 4px;
  vertical-align: text-bottom;
  animation: cs-caret-blink 0.65s step-end infinite;
  box-shadow: 0 0 8px rgba(34,211,238,0.85);
}
@keyframes cs-caret-blink {
  0%,100% { opacity: 1; }
  50%     { opacity: 0; }
}

/* ── Auto-advance bar ─────────────────────────────────────────────────── */
.cs-auto-bar {
  width: 100%;
  max-width: 820px;
  margin: 0 auto 6px;
  height: 2px;
  background: rgba(34,211,238,0.12);
  border-radius: 1px;
  overflow: hidden;
  position: relative;
}
.cs-auto-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, rgba(34,211,238,0.35), rgba(34,211,238,0.9), rgba(255,255,255,0.9));
  border-radius: 1px;
  animation: cs-bar-fill linear forwards;
  box-shadow: 0 0 6px rgba(34,211,238,0.7);
}
@keyframes cs-bar-fill {
  from { width: 0%; }
  to   { width: 100%; }
}

/* ── Progress dots ────────────────────────────────────────────────────── */
.cs-progress {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  animation: cs-fade-up 620ms cubic-bezier(0.22,1,0.36,1) 480ms both;
}
.cs-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: rgba(34,211,238,0.18);
  border: 1px solid rgba(34,211,238,0.32);
  transition: background 200ms, transform 200ms, box-shadow 200ms;
}
.cs-dot-past    { background: rgba(34,211,238,0.55); }
.cs-dot-current {
  background: #22d3ee;
  transform: scale(1.3);
  box-shadow: 0 0 12px rgba(34,211,238,0.9), 0 0 24px rgba(34,211,238,0.3);
}

/* ── Tap hint ─────────────────────────────────────────────────────────── */
.cs-tap-hint {
  margin-top: 10px;
  font-family: ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.22em;
  color: rgba(165,243,252,0.45);
  text-transform: uppercase;
  animation: cs-hint-pulse 1.6s ease-in-out infinite;
}
@keyframes cs-hint-pulse {
  0%,100% { opacity: 0.45; }
  50%     { opacity: 0.95; }
}

/* ── Shared animation ─────────────────────────────────────────────────── */
@keyframes cs-fade-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0);   }
}

/* ── Mobile portrait ──────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .cs-bar-top { height: 12vh; }
  .cs-bar-bottom {
    height: 34vh;
    padding: 14px 20px 20px;
    padding-left: max(20px, env(safe-area-inset-left));
    padding-right: max(20px, env(safe-area-inset-right));
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
  .cs-bubbles-stage { top: 12vh; bottom: 34vh; }
  .cs-subtitle { font-size: 1.22rem; line-height: 1.50; }
  .cs-speaker { font-size: 0.72rem; }
  .cs-skip { padding: 6px 12px; font-size: 0.68rem; }
  .cs-depth-value { font-size: 0.88rem; }
  .cs-beat-label { display: none; }
}

/* ── Landscape phones ─────────────────────────────────────────────────── */
@media (max-height: 480px) and (orientation: landscape) {
  .cs-bar-top { height: 10vh; }
  .cs-bar-bottom {
    height: 33vh;
    padding: 8px 18px 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  .cs-bubbles-stage { top: 10vh; bottom: 33vh; }
  .cs-subtitle { font-size: 1.0rem; line-height: 1.4; }
  .cs-speaker { font-size: 0.66rem; margin-bottom: 5px; }
  .cs-progress { margin-top: 8px; gap: 6px; }
  .cs-dot { width: 6px; height: 6px; }
  .cs-tap-hint { margin-top: 6px; font-size: 0.58rem; }
  .cs-skip { padding: 4px 10px; font-size: 0.62rem; }
  .cs-waveform { display: none; }
  .cs-beat-label { display: none; }
}

/* ── Wide desktop ─────────────────────────────────────────────────────── */
@media (min-width: 1024px) {
  .cs-bar-top { height: 13vh; }
  .cs-bar-bottom {
    height: 26vh;
    padding: 18px 32px 22px;
  }
  .cs-bubbles-stage { top: 13vh; bottom: 26vh; }
  .cs-subtitle { font-size: 1.65rem; max-width: 960px; }
  .cs-speaker { font-size: 0.82rem; margin-bottom: 12px; }
  .cs-tap-hint { margin-top: 14px; }
}

/* ── Reduced motion ───────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .cs-bar            { transition-duration: 1ms; transition-delay: 0ms; }
  .cs-speaker-dot    { animation: none; }
  .cs-tap-hint       { animation: none; opacity: 0.6; }
  .cs-caret          { animation: none; }
  .cs-dot-current    { transform: none; }
  .cs-subtitle       { animation: none; }
  .cs-vignette       { animation: none; opacity: 1; }
  .cs-speaker        { animation: none; }
  .cs-progress       { animation: none; }
  .cs-grain          { animation: none; }
  .cs-bubble         { animation: none; opacity: 0; }
  .cs-beat-flash     { animation: none; opacity: 0; }
  .cs-wave-path      { animation: none; }
}
`;
