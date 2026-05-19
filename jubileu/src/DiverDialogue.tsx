/**
 * DiverDialogue.tsx — Premium underwater chat overlay for the BeardedDiver.
 *
 * Built for both mobile and desktop:
 *  - 56px tap targets, safe-area aware (notches, home indicator)
 *  - Landscape + portrait + small-phone media queries
 *  - Keyboard: 1-9 picks option, Space/Enter skips typewriter, Esc dismisses
 *  - Touch: tap the text area while typing to reveal full text instantly
 *  - Animated rising bubbles, pulsing status dot, glowing avatar ring,
 *    staggered option fade-in, gradient option-number badges, hover arrow reveal
 *
 * Self-contained: no Tailwind dependency, inline styles + scoped <style> tag.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DIVER_DIALOGUE } from './constants';

export interface DiverDialogueProps {
  nodeKey: string;
  onOptionSelect: (next: string) => void;
  onClose: () => void;
}

// ─── Decorative scuba-diver avatar ────────────────────────────────────────
function DiverAvatar() {
  return (
    <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
      <defs>
        <linearGradient id="dlg-diver-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
        <radialGradient id="dlg-diver-mask" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="60%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0891b2" />
        </radialGradient>
      </defs>
      {/* Tank */}
      <rect x="26" y="36" width="12" height="20" rx="5" fill="url(#dlg-diver-body)" />
      {/* Body */}
      <ellipse cx="32" cy="30" rx="10" ry="12" fill="url(#dlg-diver-body)" />
      {/* Head */}
      <circle cx="32" cy="15" r="8" fill="url(#dlg-diver-body)" />
      {/* Mask visor with subtle highlight */}
      <ellipse cx="32" cy="14" rx="6" ry="5" fill="url(#dlg-diver-mask)" />
      <ellipse cx="30" cy="12.5" rx="1.5" ry="0.9" fill="#ffffff" opacity="0.85" />
      {/* Arms */}
      <line x1="22" y1="28" x2="10" y2="38" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" />
      <line x1="42" y1="28" x2="54" y2="38" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" />
      {/* Regulator hose */}
      <path d="M 32 22 Q 42 26 44 22" fill="none" stroke="#164e63" strokeWidth="2" strokeLinecap="round" />
      {/* Fins */}
      <ellipse cx="22" cy="56" rx="8" ry="4" fill="#155e75" transform="rotate(-20 22 56)" />
      <ellipse cx="42" cy="56" rx="8" ry="4" fill="#155e75" transform="rotate(20 42 56)" />
    </svg>
  );
}

// ─── Rising bubble particles inside the card ──────────────────────────────
const BUBBLES = [
  { left: '8%',  size: 7, delay: 0.0, duration: 5.2 },
  { left: '18%', size: 4, delay: 1.4, duration: 6.5 },
  { left: '30%', size: 9, delay: 0.7, duration: 4.6 },
  { left: '44%', size: 5, delay: 2.6, duration: 5.8 },
  { left: '58%', size: 8, delay: 1.1, duration: 5.0 },
  { left: '70%', size: 4, delay: 3.3, duration: 6.3 },
  { left: '82%', size: 6, delay: 0.5, duration: 5.5 },
  { left: '92%', size: 5, delay: 2.1, duration: 4.8 },
];

function Bubbles() {
  return (
    <div className="dlg-bubbles" aria-hidden="true">
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="dlg-bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export const DiverDialogue = ({ nodeKey, onOptionSelect, onClose }: DiverDialogueProps) => {
  const node = DIVER_DIALOGUE[nodeKey];
  const text: string = node?.text ?? '';
  const options: Array<{ text: string; next: string }> = node?.options ?? [];
  const optionCount = options.length;

  // Typewriter
  const [displayedLen, setDisplayedLen] = useState(0);
  const [done, setDone] = useState(false);

  // Card slide-in
  const [cardIn, setCardIn] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const skipTypewriter = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDisplayedLen(text.length);
    setDone(true);
  }, [text]);

  // Mount → trigger slide-in next frame (two RAFs let the browser paint the
  // initial off-screen state first, then animate to the in-state)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setCardIn(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Typewriter restart on node / text change
  useEffect(() => {
    setDisplayedLen(0);
    setDone(false);

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    let idx = 0;
    intervalRef.current = setInterval(() => {
      idx += 1;
      setDisplayedLen(idx);
      if (idx >= text.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setDone(true);
      }
    }, 28);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [nodeKey, text]);

  const handleOptionClick = useCallback(
    (next: string) => {
      onOptionSelect(next);
    },
    [onOptionSelect]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!done) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          skipTypewriter();
        }
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= optionCount) {
        e.preventDefault();
        handleOptionClick(options[n - 1].next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, optionCount, options, handleOptionClick, onClose, skipTypewriter]);

  if (!node) return null;

  const displayed = text.slice(0, displayedLen);

  return (
    <div className="dlg-root">
      <div className={`dlg-card ${cardIn ? 'dlg-card-in' : ''}`}>
        <Bubbles />

        {/* Glowing accent bar across the top */}
        <div className="dlg-accent-bar" aria-hidden="true" />

        {/* Header */}
        <div className="dlg-header">
          <div className="dlg-avatar">
            <DiverAvatar />
          </div>
          <div className="dlg-identity">
            <div className="dlg-name">
              <span className="dlg-status-dot" />
              MERGULHADOR
            </div>
            <div className="dlg-subtitle">
              <span className="dlg-subtitle-marker">›</span>
              Andar 02 · Submerso
            </div>
          </div>
          <button
            type="button"
            className="dlg-close"
            onClick={onClose}
            aria-label="Fechar diálogo"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M6 6 L18 18 M18 6 L6 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body — tap during typewriter to skip */}
        <div
          className={`dlg-body ${!done ? 'dlg-body-typing' : ''}`}
          onClick={!done ? skipTypewriter : undefined}
          role={!done ? 'button' : undefined}
          tabIndex={!done ? 0 : -1}
          aria-label={!done ? 'Pular animação de texto' : undefined}
        >
          <p className="dlg-text">
            {displayed}
            {!done && <span className="dlg-caret" aria-hidden="true" />}
          </p>
          {!done && (
            <div className="dlg-skip-hint" aria-hidden="true">
              Toque para pular
            </div>
          )}
        </div>

        {/* Options — only render once typewriter finishes */}
        {done && (
          <div className="dlg-options">
            {options.map((opt, i) => (
              <button
                key={i}
                type="button"
                className="dlg-option"
                style={{ animationDelay: `${i * 80}ms` }}
                onClick={() => handleOptionClick(opt.next)}
              >
                <span className="dlg-option-num">{i + 1}</span>
                <span className="dlg-option-text">{opt.text}</span>
                <span className="dlg-option-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{STYLES}</style>
    </div>
  );
};

// ─── Scoped styles ────────────────────────────────────────────────────────
const STYLES = `
.dlg-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: linear-gradient(
    to top,
    rgba(2, 12, 22, 0.78) 0%,
    rgba(2, 12, 22, 0.32) 28%,
    rgba(2, 12, 22, 0) 58%
  );
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.dlg-card {
  pointer-events: auto;
  position: relative;
  width: calc(100% - 16px);
  max-width: 720px;
  margin: 0 8px 12px;
  border-radius: 18px;
  background: linear-gradient(
    180deg,
    rgba(7, 28, 48, 0.96) 0%,
    rgba(4, 18, 32, 0.97) 100%
  );
  border: 1px solid rgba(34, 211, 238, 0.28);
  box-shadow:
    0 0 60px rgba(6, 182, 212, 0.18),
    0 24px 50px -10px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(165, 243, 252, 0.06);
  overflow: hidden;
  backdrop-filter: blur(10px) saturate(1.15);
  -webkit-backdrop-filter: blur(10px) saturate(1.15);
  transform: translateY(120%);
  opacity: 0;
  transition:
    transform 420ms cubic-bezier(0.18, 0.89, 0.32, 1.15),
    opacity 280ms ease-out;
  will-change: transform, opacity;
}
.dlg-card.dlg-card-in {
  transform: translateY(0);
  opacity: 1;
}

/* Top glowing accent bar */
.dlg-accent-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(34, 211, 238, 0.0) 10%,
    rgba(34, 211, 238, 0.9) 50%,
    rgba(34, 211, 238, 0.0) 90%,
    transparent 100%
  );
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.55);
  pointer-events: none;
}

/* Bubbles layer */
.dlg-bubbles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
  opacity: 0.55;
}
.dlg-bubble {
  position: absolute;
  bottom: -16px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 35% 30%,
    rgba(207, 250, 254, 0.85) 0%,
    rgba(165, 243, 252, 0.35) 55%,
    rgba(165, 243, 252, 0) 100%
  );
  animation-name: dlg-bubble-rise;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in;
}
@keyframes dlg-bubble-rise {
  0%   { transform: translate(0, 0) scale(0.6);     opacity: 0; }
  12%  { opacity: 0.65; }
  50%  { transform: translate(-4px, -110px) scale(1); }
  90%  { opacity: 0.45; }
  100% { transform: translate(6px, -240px) scale(1.1); opacity: 0; }
}

/* Header */
.dlg-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 11px;
  border-bottom: 1px solid rgba(34, 211, 238, 0.16);
}
.dlg-avatar {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 35% 30%,
    rgba(34, 211, 238, 0.32) 0%,
    rgba(6, 182, 212, 0.05) 65%
  );
  border: 1.5px solid rgba(34, 211, 238, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow:
    0 0 20px rgba(34, 211, 238, 0.28),
    inset 0 0 14px rgba(34, 211, 238, 0.12);
  animation: dlg-avatar-glow 2.8s ease-in-out infinite;
}
@keyframes dlg-avatar-glow {
  0%, 100% { box-shadow:
    0 0 20px rgba(34, 211, 238, 0.28),
    inset 0 0 14px rgba(34, 211, 238, 0.12); }
  50%       { box-shadow:
    0 0 32px rgba(34, 211, 238, 0.55),
    inset 0 0 18px rgba(34, 211, 238, 0.2); }
}
.dlg-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.dlg-name {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #67e8f9;
  text-transform: uppercase;
  line-height: 1;
  text-shadow: 0 0 14px rgba(103, 232, 249, 0.5);
}
.dlg-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.9);
  animation: dlg-status-pulse 1.5s ease-in-out infinite;
}
@keyframes dlg-status-pulse {
  0%, 100% { opacity: 1;    transform: scale(1); }
  50%       { opacity: 0.4;  transform: scale(0.7); }
}
.dlg-subtitle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: rgba(165, 243, 252, 0.55);
  text-transform: uppercase;
  line-height: 1;
}
.dlg-subtitle-marker {
  color: rgba(34, 211, 238, 0.7);
}

/* Close button */
.dlg-close {
  flex-shrink: 0;
  background: rgba(34, 211, 238, 0.08);
  border: 1px solid rgba(34, 211, 238, 0.3);
  color: rgba(207, 250, 254, 0.85);
  width: 36px;
  height: 36px;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 150ms, color 150ms, border-color 150ms, transform 100ms;
}
.dlg-close:hover,
.dlg-close:focus-visible {
  background: rgba(34, 211, 238, 0.18);
  border-color: rgba(34, 211, 238, 0.6);
  color: #ffffff;
  outline: none;
}
.dlg-close:active { transform: scale(0.92); }

/* Body */
.dlg-body {
  position: relative;
  padding: 18px 18px 14px;
  min-height: 86px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.dlg-body-typing {
  cursor: pointer;
}
.dlg-text {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-size: 1.0rem;
  line-height: 1.7;
  color: #e0f2fe;
  letter-spacing: 0.005em;
  font-weight: 400;
}
.dlg-caret {
  display: inline-block;
  width: 3px;
  height: 1.05em;
  background: #22d3ee;
  margin-left: 3px;
  vertical-align: text-bottom;
  animation: dlg-caret-blink 0.65s step-end infinite;
  box-shadow: 0 0 6px rgba(34, 211, 238, 0.8);
}
@keyframes dlg-caret-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
.dlg-skip-hint {
  position: absolute;
  right: 18px;
  bottom: 6px;
  font-family: ui-monospace, monospace;
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  color: rgba(34, 211, 238, 0.55);
  text-transform: uppercase;
  animation: dlg-hint-pulse 1.6s ease-in-out infinite;
  pointer-events: none;
}
@keyframes dlg-hint-pulse {
  0%, 100% { opacity: 0.45; }
  50%       { opacity: 1; }
}

/* Options */
.dlg-options {
  padding: 4px 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dlg-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 14px;
  background: linear-gradient(
    180deg,
    rgba(8, 47, 73, 0.55) 0%,
    rgba(8, 47, 73, 0.32) 100%
  );
  border: 1px solid rgba(34, 211, 238, 0.22);
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  transition:
    transform 120ms cubic-bezier(0.4, 0, 0.2, 1),
    background 180ms,
    border-color 180ms,
    box-shadow 180ms;
  opacity: 0;
  animation: dlg-option-in 380ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
  -webkit-tap-highlight-color: transparent;
}
@keyframes dlg-option-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.dlg-option:hover,
.dlg-option:focus-visible {
  background: linear-gradient(
    180deg,
    rgba(14, 78, 113, 0.7) 0%,
    rgba(8, 51, 78, 0.55) 100%
  );
  border-color: rgba(34, 211, 238, 0.65);
  box-shadow:
    0 0 24px rgba(34, 211, 238, 0.22),
    inset 0 1px 0 rgba(165, 243, 252, 0.08);
  outline: none;
}
.dlg-option:active {
  transform: scale(0.985);
  background: linear-gradient(
    180deg,
    rgba(14, 78, 113, 0.85) 0%,
    rgba(8, 51, 78, 0.7) 100%
  );
}
.dlg-option-num {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(180deg, #22d3ee 0%, #0891b2 100%);
  color: #032238;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.82rem;
  font-weight: 800;
  box-shadow:
    0 0 12px rgba(34, 211, 238, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
.dlg-option-text {
  flex: 1;
  font-size: 0.96rem;
  line-height: 1.35;
  font-weight: 500;
  letter-spacing: 0.005em;
  /* allow line breaks on long mobile labels */
  word-break: break-word;
}
.dlg-option-arrow {
  flex-shrink: 0;
  font-size: 1.5rem;
  font-weight: 300;
  color: rgba(34, 211, 238, 0.4);
  line-height: 1;
  opacity: 0.55;
  transition: opacity 180ms, transform 180ms, color 180ms;
}
.dlg-option:hover .dlg-option-arrow,
.dlg-option:focus-visible .dlg-option-arrow {
  opacity: 1;
  transform: translateX(2px);
  color: #67e8f9;
}

/* ─── Tablet & desktop ────────────────────────────────────────────────── */
@media (min-width: 768px) {
  .dlg-card {
    margin: 0 16px 24px;
    border-radius: 20px;
  }
  .dlg-header {
    padding: 14px 18px 13px;
    gap: 14px;
  }
  .dlg-avatar { width: 56px; height: 56px; }
  .dlg-name { font-size: 1.0rem; }
  .dlg-subtitle { font-size: 0.72rem; }
  .dlg-body {
    padding: 22px 22px 16px;
    min-height: 100px;
  }
  .dlg-text { font-size: 1.06rem; line-height: 1.75; }
  .dlg-options { padding: 4px 14px 18px; gap: 9px; }
  .dlg-option { padding: 10px 16px; }
  .dlg-option-text { font-size: 1.0rem; }
  .dlg-skip-hint { right: 22px; bottom: 7px; font-size: 0.66rem; }
}

/* ─── Landscape mobile / short screens ───────────────────────────────── */
@media (max-height: 480px) and (orientation: landscape) {
  .dlg-card {
    max-width: 640px;
    margin: 0 12px 8px;
    border-radius: 14px;
  }
  .dlg-header {
    padding: 8px 12px;
    gap: 10px;
  }
  .dlg-avatar { width: 42px; height: 42px; }
  .dlg-avatar svg { width: 32px; height: 32px; }
  .dlg-name { font-size: 0.82rem; letter-spacing: 0.14em; }
  .dlg-subtitle { font-size: 0.6rem; }
  .dlg-close { width: 30px; height: 30px; }
  .dlg-body {
    padding: 10px 14px 8px;
    min-height: 56px;
  }
  .dlg-text { font-size: 0.92rem; line-height: 1.5; }
  .dlg-options {
    padding: 2px 10px 10px;
    gap: 6px;
  }
  .dlg-option {
    min-height: 44px;
    padding: 6px 12px;
    border-radius: 10px;
  }
  .dlg-option-num { width: 26px; height: 26px; border-radius: 7px; }
  .dlg-option-text { font-size: 0.9rem; }
  .dlg-skip-hint { font-size: 0.56rem; bottom: 4px; }
}

/* ─── Very small phones ──────────────────────────────────────────────── */
@media (max-width: 360px) {
  .dlg-card { margin: 0 6px 8px; border-radius: 14px; }
  .dlg-header { padding: 10px 12px 9px; gap: 10px; }
  .dlg-avatar { width: 46px; height: 46px; }
  .dlg-avatar svg { width: 34px; height: 34px; }
  .dlg-name { font-size: 0.82rem; letter-spacing: 0.12em; }
  .dlg-subtitle { font-size: 0.6rem; }
  .dlg-close { width: 32px; height: 32px; }
  .dlg-body { padding: 14px 14px 12px; }
  .dlg-text { font-size: 0.94rem; line-height: 1.6; }
  .dlg-options { padding: 4px 10px 12px; }
  .dlg-option { padding: 9px 12px; }
  .dlg-option-text { font-size: 0.92rem; }
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .dlg-card { transition-duration: 1ms; }
  .dlg-bubble { animation: none; display: none; }
  .dlg-avatar { animation: none; }
  .dlg-status-dot { animation: none; }
  .dlg-skip-hint { animation: none; opacity: 0.7; }
  .dlg-option { animation-duration: 1ms; }
}
`;
