/**
 * DiverCutscene.tsx — Cinematic linear cutscene for the BeardedDiver.
 *
 * Replaces the previous DiverDialogue overlay (which was a branching tree
 * with options) with a letterboxed, auto-advancing sequence of speech beats
 * that ends by handing over the rebreather + night-vision goggles. The
 * player can skip with the × button (treated as Refuse → diver walks away).
 *
 * Built to work on both mobile and desktop:
 *  - Top + bottom black letterbox bars slide in (350ms)
 *  - Large legible subtitles centered in the bottom band
 *  - Tap anywhere / Space / Enter → advance to the next beat early
 *  - Auto-advance after a per-beat dwell time (typewriter + read-time)
 *  - "× Pular" skip control in top-right (safe-area aware)
 *  - Progress dots at the bottom show how far we are
 *
 * The component is self-contained — inline styles + a scoped <style> tag,
 * no Tailwind/CSS module dependency.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface DiverCutsceneProps {
  /** Called when the player accepts the gear at the end of the cutscene. */
  onAccept: () => void;
  /** Called when the player skips / refuses (× button). */
  onRefuse: () => void;
  /** Called every time the displayed beat index changes. */
  onBeat?: (beatIdx: number) => void;
}

// ─── Beats — linear sequence of diver speech ──────────────────────────────
// Auto-advance dwell = base 1800ms + 38ms per character (matches typewriter
// + comfortable read time).
const BEATS: string[] = [
  'Ahh... mais um turista. Eu estava te esperando, sabe?',
  'Eu fui o mergulhador da casa. Antes dela ser uma casa. Antes dela ser qualquer coisa.',
  'Agora eu cuido das pessoas que descem. Faço com que vocês respirem. E que vejam.',
  'Já tem gente demais lá embaixo. Toma — encaixa direitinho na cara.',
  'Aperta a tecla N quando precisar enxergar no escuro. Vai. E boa sorte.',
];

const TYPEWRITER_MS = 26;
const DWELL_AFTER_TYPE_MS = 1700;

// Per-beat typewriter speed — the dialogue rhythm is hand-tuned to the
// diver's mood: he lingers on the memory, quickens as he hands the mask over.
function typeSpeedForBeat(idx: number): number {
  return idx === 1 ? 37   // memory — slow, wistful
       : idx === 2 ? 30   // earnest — measured
       : idx === 3 ? 23   // "toma" — quicker, decisive
       : TYPEWRITER_MS;   // 0 + 4 — normal cadence
}

// Beat 3 = mask extends toward player ("Toma") — hold longer so they can absorb
// the gesture. Beat 4 = final farewell words — extra weight before accepting.
function dwellForBeat(idx: number, text: string): number {
  const extra = idx === 3 ? 900 : idx === 4 ? 500 : idx === 1 ? 200 : 0;
  return typeSpeedForBeat(idx) * text.length + DWELL_AFTER_TYPE_MS + extra;
}

export const DiverCutscene = ({ onAccept, onRefuse, onBeat }: DiverCutsceneProps) => {
  const [beatIdx, setBeatIdx] = useState(0);
  const [displayedLen, setDisplayedLen] = useState(0);
  const [doneTyping, setDoneTyping] = useState(false);
  const [lettersIn, setLettersIn] = useState(false);

  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handedOffRef = useRef(false);

  const totalBeats = BEATS.length;
  const beatText = BEATS[beatIdx] ?? '';

  // Slide letterbox in on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setLettersIn(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Notify parent on every beat change (used for 3D choreography sync)
  useEffect(() => { onBeat?.(beatIdx); }, [beatIdx, onBeat]);

  // (Re)start typewriter whenever the beat changes
  useEffect(() => {
    setDisplayedLen(0);
    setDoneTyping(false);

    if (typeIntervalRef.current !== null) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }

    let idx = 0;
    typeIntervalRef.current = setInterval(() => {
      idx += 1;
      setDisplayedLen(idx);
      if (idx >= beatText.length) {
        if (typeIntervalRef.current !== null) {
          clearInterval(typeIntervalRef.current);
          typeIntervalRef.current = null;
        }
        setDoneTyping(true);
      }
    }, typeSpeedForBeat(beatIdx));

    return () => {
      if (typeIntervalRef.current !== null) {
        clearInterval(typeIntervalRef.current);
        typeIntervalRef.current = null;
      }
    };
  }, [beatIdx, beatText]);

  // Schedule auto-advance after the current beat completes typing
  useEffect(() => {
    if (advanceTimeoutRef.current !== null) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }

    advanceTimeoutRef.current = setTimeout(() => {
      // Last beat: trigger Accept exactly once
      if (beatIdx >= totalBeats - 1) {
        if (!handedOffRef.current) {
          handedOffRef.current = true;
          onAccept();
        }
        return;
      }
      setBeatIdx((i) => i + 1);
    }, dwellForBeat(beatIdx, beatText));

    return () => {
      if (advanceTimeoutRef.current !== null) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
    };
  }, [beatIdx, beatText, totalBeats, onAccept]);

  const advanceNow = useCallback(() => {
    if (advanceTimeoutRef.current !== null) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
    if (typeIntervalRef.current !== null) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    // If typewriter is mid-flight on this beat, snap it to the end first
    if (!doneTyping) {
      setDisplayedLen(beatText.length);
      setDoneTyping(true);
      // Re-arm a brief read-pause so the player can absorb the full text
      advanceTimeoutRef.current = setTimeout(() => {
        if (beatIdx >= totalBeats - 1) {
          if (!handedOffRef.current) {
            handedOffRef.current = true;
            onAccept();
          }
          return;
        }
        setBeatIdx((i) => i + 1);
      }, 700);
      return;
    }
    // Already done typing — advance immediately
    if (beatIdx >= totalBeats - 1) {
      if (!handedOffRef.current) {
        handedOffRef.current = true;
        onAccept();
      }
      return;
    }
    setBeatIdx((i) => i + 1);
  }, [beatIdx, beatText, doneTyping, onAccept, totalBeats]);

  const handleSkip = useCallback(() => {
    if (handedOffRef.current) return;
    handedOffRef.current = true;
    onRefuse();
  }, [onRefuse]);

  // Keyboard: Space/Enter advances, Esc skips
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advanceNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advanceNow, handleSkip]);

  const displayed = beatText.slice(0, displayedLen);

  return (
    <div className="cs-root" onClick={advanceNow}>
      {/* Cinematic corner vignette — pulls focus onto the diver */}
      <div className="cs-vignette" aria-hidden="true" />

      {/* Top letterbox bar */}
      <div className={`cs-bar cs-bar-top ${lettersIn ? 'cs-bar-in' : ''}`}>
        <button
          type="button"
          className="cs-skip"
          onClick={(e) => {
            e.stopPropagation();
            handleSkip();
          }}
          aria-label="Pular cutscene"
        >
          <span>PULAR</span>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M7 6 L17 12 L7 18 Z"
              fill="currentColor"
              opacity="0.85"
            />
            <line
              x1="19"
              y1="6"
              x2="19"
              y2="18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Bottom letterbox bar — holds the subtitle */}
      <div className={`cs-bar cs-bar-bottom ${lettersIn ? 'cs-bar-in' : ''}`}>
        {/* Per-beat emotional color wash — subtle tint shifts with mood */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            // beat 0: cyan curiosity, 1: amber nostalgia, 2: rose warmth,
            // 3: green NV (mask extends), 4: blue-white authority
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
        <div className="cs-speaker">
          <span className="cs-speaker-dot" />
          MERGULHADOR
        </div>

        <p className="cs-subtitle" key={beatIdx}>
          {displayed}
          {!doneTyping && <span className="cs-caret" aria-hidden="true" />}
        </p>

        {/* Auto-advance progress bar — appears while dwell timer runs */}
        {doneTyping && (
          <div className="cs-auto-bar" key={beatIdx} aria-hidden="true">
            <div className="cs-auto-bar-fill" style={{ animationDuration: `${DWELL_AFTER_TYPE_MS + (beatIdx === 3 ? 900 : beatIdx === 4 ? 500 : beatIdx === 1 ? 200 : 0)}ms` }} />
          </div>
        )}

        {/* Progress dots */}
        <div className="cs-progress" aria-hidden="true">
          {BEATS.map((_, i) => (
            <span
              key={i}
              className={`cs-dot ${i === beatIdx ? 'cs-dot-current' : ''} ${
                i < beatIdx ? 'cs-dot-past' : ''
              }`}
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

const STYLES = `
.cs-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: auto;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* Cinematic vignette — soft dark corners centred on the diver window */
.cs-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 72% 58% at 50% 44%,
    rgba(0, 0, 0, 0) 52%,
    rgba(0, 0, 0, 0.5) 100%
  );
  opacity: 0;
  animation: cs-vignette-in 900ms ease-out 120ms forwards;
}
@keyframes cs-vignette-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cs-bar {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: auto;
  transition: transform 400ms cubic-bezier(0.18, 0.89, 0.32, 1.15);
  will-change: transform;
}
.cs-bar-top {
  top: 0;
  height: 13vh;
  transform: translateY(-100%);
  background: #000;
  border-bottom: 1px solid rgba(34, 211, 238, 0.14);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.7);
}
.cs-bar-top::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 9vh;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0) 100%);
  pointer-events: none;
}
.cs-bar-bottom {
  bottom: 0;
  height: 31vh;
  transform: translateY(100%);
  transition-delay: 80ms;
  /* Subtle oceanic tint — very dark teal-black */
  background: linear-gradient(to bottom, #000c0f 0%, #000a0d 100%);
  border-top: 1px solid rgba(34, 211, 238, 0.28);
  box-shadow:
    0 -6px 28px rgba(0, 0, 0, 0.7),
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
  left: 0;
  right: 0;
  bottom: 100%;
  height: 11vh;
  background: linear-gradient(to top, rgba(0, 8, 12, 0.97) 0%, rgba(0, 0, 0, 0) 100%);
  pointer-events: none;
}
.cs-bar.cs-bar-in { transform: translateY(0); }

/* Skip button (top-right of top bar) */
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
.cs-skip:hover,
.cs-skip:focus-visible {
  background: rgba(34, 211, 238, 0.18);
  border-color: rgba(34, 211, 238, 0.6);
  color: #ffffff;
  outline: none;
}

/* Speaker name */
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
  text-shadow: 0 0 14px rgba(103, 232, 249, 0.55);
  margin-bottom: 10px;
  /* Cinematic title reveal — settles in just after the bar arrives,
     letter-spacing tightening as it fades up. */
  animation: cs-speaker-in 560ms cubic-bezier(0.22, 1, 0.36, 1) 360ms both;
}
@keyframes cs-speaker-in {
  from { opacity: 0; transform: translateY(-7px); letter-spacing: 0.42em; }
  to   { opacity: 1; transform: translateY(0);    letter-spacing: 0.22em; }
}
.cs-speaker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.9);
  animation: cs-dot-pulse 1.5s ease-in-out infinite;
}
@keyframes cs-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
}

/* Subtitle text */
.cs-subtitle {
  margin: 0 auto;
  max-width: 860px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 1.60rem;
  line-height: 1.42;
  font-weight: 600;
  color: #e8f8ff;
  text-shadow:
    0 2px 18px rgba(0, 0, 0, 0.95),
    0 0 40px rgba(34, 211, 238, 0.06);
  letter-spacing: 0.012em;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: cs-line-in 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* Each beat re-mounts (keyed) so this fade+rise replays per line, turning
   the old hard cut between beats into a smooth cinematic transition */
@keyframes cs-line-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cs-caret {
  display: inline-block;
  width: 3px;
  height: 1.05em;
  background: #22d3ee;
  margin-left: 4px;
  vertical-align: text-bottom;
  animation: cs-caret-blink 0.65s step-end infinite;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.85);
}
@keyframes cs-caret-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

/* Auto-advance progress bar */
.cs-auto-bar {
  width: 100%;
  max-width: 820px;
  margin: 0 auto 6px;
  height: 2px;
  background: rgba(34, 211, 238, 0.15);
  border-radius: 1px;
  overflow: hidden;
}
.cs-auto-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.9));
  border-radius: 1px;
  animation: cs-bar-fill linear forwards;
}
@keyframes cs-bar-fill {
  from { width: 0%; }
  to   { width: 100%; }
}

/* Progress dots */
.cs-progress {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  animation: cs-fade-up 620ms cubic-bezier(0.22, 1, 0.36, 1) 480ms both;
}
@keyframes cs-fade-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cs-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(34, 211, 238, 0.18);
  border: 1px solid rgba(34, 211, 238, 0.32);
  transition: background 200ms, transform 200ms, box-shadow 200ms;
}
.cs-dot-past { background: rgba(34, 211, 238, 0.55); }
.cs-dot-current {
  background: #22d3ee;
  transform: scale(1.25);
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.85);
}

/* Tap hint */
.cs-tap-hint {
  margin-top: 10px;
  font-family: ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.22em;
  color: rgba(165, 243, 252, 0.45);
  text-transform: uppercase;
  animation: cs-hint-pulse 1.6s ease-in-out infinite;
}
@keyframes cs-hint-pulse {
  0%, 100% { opacity: 0.45; }
  50%       { opacity: 0.95; }
}

/* ─── Mobile portrait / smaller ─────────────────────────────────────── */
@media (max-width: 640px) {
  .cs-bar-top { height: 12vh; }
  .cs-bar-bottom {
    height: 33vh;
    padding: 16px 20px 20px;
    padding-left: max(20px, env(safe-area-inset-left));
    padding-right: max(20px, env(safe-area-inset-right));
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
  .cs-subtitle { font-size: 1.22rem; line-height: 1.50; }
  .cs-speaker { font-size: 0.72rem; }
  .cs-skip { padding: 6px 12px; font-size: 0.68rem; }
}

/* ─── Landscape phones — keep bars thin so the world stays visible ── */
@media (max-height: 480px) and (orientation: landscape) {
  .cs-bar-top { height: 10vh; }
  .cs-bar-bottom {
    height: 33vh;
    padding: 8px 18px 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  .cs-subtitle { font-size: 1.0rem; line-height: 1.4; }
  .cs-speaker { font-size: 0.66rem; margin-bottom: 6px; }
  .cs-progress { margin-top: 8px; gap: 6px; }
  .cs-dot { width: 6px; height: 6px; }
  .cs-tap-hint { margin-top: 6px; font-size: 0.58rem; }
  .cs-skip { padding: 4px 10px; font-size: 0.62rem; }
}

/* ─── Wide desktop — let the bars be a bit bigger ───────────────────── */
@media (min-width: 1024px) {
  .cs-bar-top { height: 13vh; }
  .cs-bar-bottom {
    height: 26vh;
    padding: 22px 32px 26px;
  }
  .cs-subtitle { font-size: 1.65rem; max-width: 960px; }
  .cs-speaker { font-size: 0.82rem; margin-bottom: 14px; }
  .cs-tap-hint { margin-top: 14px; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .cs-bar { transition-duration: 1ms; transition-delay: 0ms; }
  .cs-speaker-dot { animation: none; }
  .cs-tap-hint { animation: none; opacity: 0.6; }
  .cs-caret { animation: none; }
  .cs-dot-current { transform: none; }
  .cs-subtitle { animation: none; }
  .cs-vignette { animation: none; opacity: 1; }
  .cs-speaker { animation: none; }
  .cs-progress { animation: none; }
}
`;
