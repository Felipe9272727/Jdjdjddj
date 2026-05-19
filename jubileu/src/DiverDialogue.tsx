/**
 * DiverDialogue.tsx — Dedicated dialogue overlay for the BeardedDiver NPC.
 *
 * Standalone component — does NOT reuse DialogueOverlay. Handles its own
 * tree lookup, typewriter animation, and option reveal.
 */

import { useState, useEffect, useRef } from 'react';
import { DIVER_DIALOGUE } from './constants';

// ─── Public interface ─────────────────────────────────────────────────────
export interface DiverDialogueProps {
  nodeKey: string;
  onOptionSelect: (next: string) => void;
  onClose: () => void;
}

// ─── Scuba diver SVG avatar ───────────────────────────────────────────────
function DiverAvatar() {
  return (
    <svg
      viewBox="0 0 64 64"
      width="52"
      height="52"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* Tank */}
      <rect x="26" y="36" width="12" height="20" rx="5" fill="#0e7490" />
      {/* Body */}
      <ellipse cx="32" cy="30" rx="10" ry="12" fill="#0e7490" />
      {/* Head */}
      <circle cx="32" cy="15" r="8" fill="#0e7490" />
      {/* Mask visor */}
      <ellipse cx="32" cy="15" rx="6" ry="5" fill="#67e8f9" opacity="0.75" />
      {/* Left arm */}
      <line x1="22" y1="28" x2="10" y2="38" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" />
      {/* Right arm */}
      <line x1="42" y1="28" x2="54" y2="38" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" />
      {/* Regulator hose */}
      <path d="M 32 22 Q 42 26 44 22" fill="none" stroke="#164e63" strokeWidth="2" strokeLinecap="round" />
      {/* Fin left */}
      <ellipse cx="22" cy="56" rx="8" ry="4" fill="#0e7490" transform="rotate(-20 22 56)" />
      {/* Fin right */}
      <ellipse cx="42" cy="56" rx="8" ry="4" fill="#0e7490" transform="rotate(20 42 56)" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export const DiverDialogue = ({ nodeKey, onOptionSelect, onClose }: DiverDialogueProps) => {
  const node = DIVER_DIALOGUE[nodeKey];
  if (!node) return null;

  const text: string = node.text ?? '';
  const options: Array<{ text: string; next: string }> = node.options ?? [];

  // Typewriter state
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);

  // Slide-in animation state
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({
    transform: 'translateY(100%)',
    transition: 'none',
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Trigger slide-in on mount
  useEffect(() => {
    // Let the browser paint the initial translateY(100%) first, then animate.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCardStyle({
          transform: 'translateY(0)',
          transition: 'transform 350ms ease-out',
        });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Restart typewriter whenever nodeKey / text changes
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    setOptionsVisible(false);

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    let idx = 0;
    intervalRef.current = setInterval(() => {
      idx += 1;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setDone(true);
        // Options fade-in after a short delay
        setTimeout(() => setOptionsVisible(true), 200);
      }
    }, 28);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [nodeKey, text]);

  const handleOptionClick = (next: string) => {
    if (next === 'LEAVE') {
      onClose();
      return;
    }
    onOptionSelect(next);
  };

  return (
    /* Full-screen overlay — pointer-events none so background 3-D scene
       still receives mouse input; the card itself re-enables them. */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background:
          'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.0) 55%)',
      }}
    >
      {/* Card */}
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: '640px',
          margin: '0 16px 32px',
          borderRadius: '12px',
          background: 'rgba(4, 20, 30, 0.97)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          boxShadow: '0 0 40px rgba(6, 182, 212, 0.12)',
          overflow: 'hidden',
          ...cardStyle,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(6, 182, 212, 0.18)',
          }}
        >
          {/* Circular avatar */}
          <div
            style={{
              flexShrink: 0,
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1.5px solid rgba(6, 182, 212, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <DiverAvatar />
          </div>

          {/* Name + subtitle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.95rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: '#67e8f9', /* cyan-300 */
                textTransform: 'uppercase',
              }}
            >
              MERGULHADOR
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                letterSpacing: '0.06em',
                color: 'rgba(6, 182, 212, 0.5)', /* cyan-500/50 */
              }}
            >
              Andar 02 · Submerso
            </span>
          </div>
        </div>

        {/* NPC text — typewriter */}
        <div
          style={{
            padding: '16px 18px 12px',
            minHeight: 72,
            fontFamily: 'monospace',
            fontSize: '0.92rem',
            lineHeight: 1.65,
            color: 'rgba(224, 242, 254, 0.92)',
          }}
        >
          {displayed}
          {/* Blinking cursor while typing */}
          {!done && (
            <span
              style={{
                display: 'inline-block',
                width: '2px',
                height: '1em',
                background: '#67e8f9',
                marginLeft: 2,
                verticalAlign: 'middle',
                animation: 'diver-blink 0.7s step-end infinite',
              }}
            />
          )}
        </div>

        {/* Options */}
        <div
          style={{
            padding: '4px 18px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: optionsVisible ? 1 : 0,
            transition: 'opacity 200ms ease-in',
          }}
        >
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleOptionClick(opt.next)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                minHeight: 52,
                padding: '0 14px',
                background: 'rgba(6, 182, 212, 0.06)',
                border: '1px solid rgba(6, 182, 212, 0.22)',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 150ms, border-color 150ms',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6, 182, 212, 0.14)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6, 182, 212, 0.5)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6, 182, 212, 0.06)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6, 182, 212, 0.22)';
              }}
            >
              {/* Option number circle */}
              <span
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'rgba(6, 182, 212, 0.2)',
                  border: '1.5px solid rgba(6, 182, 212, 0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#67e8f9',
                }}
              >
                {i + 1}
              </span>

              {/* Option text */}
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.88rem',
                  color: '#ffffff',
                  lineHeight: 1.4,
                }}
              >
                {opt.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Blinking cursor keyframe — injected once as a style tag */}
      <style>{`
        @keyframes diver-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
