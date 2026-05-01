import React, { useEffect, useRef, useState } from 'react';
import { BELLHOP_NEUTRAL, BELLHOP_TALK } from './bellhop-sprites';

// ─── Bellhop Shop — Undertale-style overlay with elevator entrance ─────────
// Phases of the overlay lifecycle:
//   'closing'   — two elevator doors slide in from the sides toward center
//   'arrived'   — doors meet, brief darkness with a "ding" highlight
//   'opening'   — doors slide back out, revealing the shop content
//   'idle'      — shop interactive, dialog typing
//   'exit-close'— doors close again on Esc/Tchau
//   'exit-done' — call onClose, unmount
// Sprites are inlined as base64 (see bellhop-sprites.ts) so the build is
// self-contained and doesn't depend on a github-raw URL.

type ShopMenu = 'main' | 'talk' | 'bye';
type Phase = 'closing' | 'arrived' | 'opening' | 'idle' | 'exit-close' | 'exit-done';

interface ShopOverlayProps {
  open: boolean;
  onClose: () => void;
}

const DIALOGUES: Record<ShopMenu, string> = {
  main: 'Bem-vindo ao The Normal Hotel!\nPosso te ajudar?',
  talk: 'Tenha uma ótima estadia... e fique calmo se ouvir alguma coisa estranha vindo do andar de cima.',
  bye: 'Volte sempre! O elevador está sempre aberto.',
};

const TIMINGS = {
  closing: 700,   // doors slide in
  arrived: 320,   // brief blackout
  opening: 700,   // doors slide out, revealing shop
  exitClose: 600, // doors close on exit
};

export const ShopOverlay: React.FC<ShopOverlayProps> = ({ open, onClose }) => {
  const [menu, setMenu] = useState<ShopMenu>('main');
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('closing');
  const [talkFrame, setTalkFrame] = useState(false);
  const typingRef = useRef<number | null>(null);
  const phaseTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  // Drive entrance phase chain whenever we open
  useEffect(() => {
    if (!open) { mountedRef.current = false; return; }
    mountedRef.current = true;
    setMenu('main');
    setTyped('');
    setPhase('closing');

    const clearTimer = () => {
      if (phaseTimerRef.current !== null) {
        window.clearTimeout(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }
    };

    phaseTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setPhase('arrived');
      phaseTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setPhase('opening');
        phaseTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          setPhase('idle');
        }, TIMINGS.opening);
      }, TIMINGS.arrived);
    }, TIMINGS.closing);

    return () => { clearTimer(); mountedRef.current = false; };
  }, [open]);

  // Typewriter: paints DIALOGUES[menu] one char at a time once we're idle
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    setTyped('');
    const text = DIALOGUES[menu];
    let i = 0;
    const tick = () => {
      if (!mountedRef.current) return;
      i += 2;
      setTyped(text.slice(0, i));
      if (i < text.length) typingRef.current = window.setTimeout(tick, 28);
      else typingRef.current = null;
    };
    tick();
    return () => {
      if (typingRef.current !== null) {
        window.clearTimeout(typingRef.current);
        typingRef.current = null;
      }
    };
  }, [open, menu, phase]);

  // Mouth animation while typing
  useEffect(() => {
    if (!open || phase !== 'idle') { setTalkFrame(false); return; }
    const isTyping = typed.length < DIALOGUES[menu].length;
    if (!isTyping) { setTalkFrame(false); return; }
    const id = window.setInterval(() => setTalkFrame((v) => !v), 110);
    return () => window.clearInterval(id);
  }, [open, phase, typed, menu]);

  // Close: play exit-close animation, then call onClose
  const close = () => {
    if (phase === 'exit-close' || phase === 'exit-done') return;
    setPhase('exit-close');
    if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = window.setTimeout(() => {
      onClose();
    }, TIMINGS.exitClose);
  };

  if (!open) return null;

  const isTyping = typed.length < DIALOGUES[menu].length;
  const skipOrAdvance = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phase !== 'idle') return;
    if (isTyping) {
      if (typingRef.current !== null) { window.clearTimeout(typingRef.current); typingRef.current = null; }
      setTyped(DIALOGUES[menu]);
    }
  };

  // Doors are CLOSED when phase is 'closing' end / 'arrived' / 'exit-close' end
  // Doors are OPEN when phase is 'idle' / 'opening' end
  // CSS controls the slide; we toggle via a `data-state` attribute.
  const doorsState =
    phase === 'closing' ? 'sliding-in' :
    phase === 'arrived' ? 'closed' :
    phase === 'opening' ? 'sliding-out' :
    phase === 'idle' ? 'open' :
    phase === 'exit-close' ? 'sliding-in' :
    'closed';

  // Content visibility — the shop sprite + dialog show ONLY once the doors
  // start opening. They fade in over the opening transition.
  const showContent = phase === 'opening' || phase === 'idle';
  const contentOpacity = phase === 'opening' ? 0.7 : phase === 'idle' ? 1 : 0;

  return (
    <div
      className="absolute inset-0 z-[80] overflow-hidden"
      style={{
        fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
        backgroundColor: '#000',
      }}
    >
      {/* Inner panel that holds the shop content (sprite + dialog) — sits
          underneath the elevator doors and is revealed as they slide out. */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: 'radial-gradient(ellipse at center, #1a1310 0%, #000 70%)',
          opacity: contentOpacity,
          transition: 'opacity 500ms ease-out',
          pointerEvents: showContent ? 'auto' : 'none',
        }}
        onClick={skipOrAdvance}
      >
        {showContent && (
          <div className="flex flex-col items-center gap-4 p-6 max-w-3xl w-full">
            {/* Bellhop sprite */}
            <div
              className="flex justify-center"
              style={{
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(24px)',
                opacity: phase === 'idle' ? 1 : 0,
                transition: 'transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 200ms, opacity 500ms ease-out 200ms',
              }}
            >
              <img
                src={talkFrame ? BELLHOP_TALK : BELLHOP_NEUTRAL}
                alt="Recepcionista"
                className="select-none pointer-events-none"
                style={{
                  imageRendering: 'pixelated',
                  height: 'min(45vh, 360px)',
                  width: 'auto',
                  filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
                }}
              />
            </div>

            {/* Dialog box (Undertale-style) */}
            <div
              className="w-full max-w-2xl border-4 border-white bg-black"
              style={{
                borderRadius: 6,
                padding: '20px 24px',
                minHeight: 120,
                boxShadow: '0 0 0 2px #000, 0 0 24px rgba(255,255,255,0.08)',
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                opacity: phase === 'idle' ? 1 : 0,
                transition: 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1) 320ms, opacity 450ms ease-out 320ms',
              }}
            >
              <p
                className="text-white leading-relaxed"
                style={{
                  fontFamily: '"Determination Mono", "Courier New", monospace',
                  fontSize: 'clamp(15px, 2.2vw, 19px)',
                  minHeight: '3.6em',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {typed}
                {isTyping && <span className="opacity-60 animate-pulse">▍</span>}
              </p>

              {!isTyping && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {menu === 'main' && (
                    <>
                      <ShopButton label="Conversar" onClick={(e) => { e.stopPropagation(); setMenu('talk'); }} />
                      <ShopButton label="Sair" onClick={(e) => { e.stopPropagation(); setMenu('bye'); }} />
                    </>
                  )}
                  {menu === 'talk' && (
                    <ShopButton label="Voltar" onClick={(e) => { e.stopPropagation(); setMenu('main'); }} />
                  )}
                  {menu === 'bye' && (
                    <ShopButton label="Tchau" onClick={(e) => { e.stopPropagation(); close(); }} />
                  )}
                </div>
              )}
            </div>

            <p className="text-white/40 text-xs mt-1 select-none">
              [ESC] fechar &nbsp;·&nbsp; [Click] avan&ccedil;ar
            </p>
          </div>
        )}
      </div>

      {/* ─── Elevator doors ─────────────────────────────────────────────
          Two panels with a dark steel finish + a gold seam where they meet.
          They slide between -100% and 0% on the x-axis.
          state values: 'sliding-in'/'sliding-out' use transitions to drive
          the animation; 'closed'/'open' are static end states. */}
      <ElevatorDoor side="left"  state={doorsState} />
      <ElevatorDoor side="right" state={doorsState} />

      {/* "DING" flash during arrived state — like the elevator chime indicator */}
      {phase === 'arrived' && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            color: '#FFD54F',
            fontFamily: '"Determination Mono", monospace',
            fontSize: 'clamp(28px, 5vw, 44px)',
            letterSpacing: '0.3em',
            textShadow: '0 0 16px rgba(255,213,79,0.9), 0 0 32px rgba(255,193,7,0.6)',
            animation: 'shopDing 320ms ease-out forwards',
          }}
        >
          DING
        </div>
      )}

      <style>{`
        @keyframes shopDing {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          40%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
};

// ─── Elevator door panel ─────────────────────────────────────────────────
type DoorState = 'sliding-in' | 'closed' | 'sliding-out' | 'open';

const ElevatorDoor: React.FC<{ side: 'left' | 'right'; state: DoorState }> = ({ side, state }) => {
  // Translate values — doors are 50% wide each, sit flush at 0% when closed.
  // Open state pushes them off-screen (-100% for left, +100% for right).
  let tx = 0;
  let transition = '';
  if (state === 'sliding-in') {
    tx = 0; // ending at 0 (closed)
    transition = `transform ${TIMINGS.closing}ms cubic-bezier(0.55, 0.06, 0.68, 0.19)`;
  } else if (state === 'closed') {
    tx = 0;
  } else if (state === 'sliding-out') {
    tx = side === 'left' ? -100 : 100;
    transition = `transform ${TIMINGS.opening}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  } else if (state === 'open') {
    tx = side === 'left' ? -100 : 100;
  }

  // For 'sliding-in' we need an INITIAL off-screen position — we set that
  // as the CSS animation start. Easiest: separate keyframes.
  const animation = state === 'sliding-in'
    ? `${side === 'left' ? 'shopDoorInLeft' : 'shopDoorInRight'} ${TIMINGS.closing}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`
    : undefined;

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [side]: 0,
          width: '50%',
          transform: `translateX(${tx}%)`,
          transition,
          animation,
          background: doorBackground(side),
          borderImage: side === 'left'
            ? 'linear-gradient(90deg, transparent 95%, #B88A2E 100%) 1'
            : 'linear-gradient(270deg, transparent 95%, #B88A2E 100%) 1',
          boxShadow: side === 'left'
            ? 'inset -3px 0 0 #C99B36, inset -4px 0 0 #6B4F1B, 4px 0 12px rgba(0,0,0,0.6)'
            : 'inset 3px 0 0 #C99B36, inset 4px 0 0 #6B4F1B, -4px 0 12px rgba(0,0,0,0.6)',
        }}
      />
      <style>{`
        @keyframes shopDoorInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0%); }
        }
        @keyframes shopDoorInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0%); }
        }
      `}</style>
    </>
  );
};

// Brushed-steel elevator door with subtle vertical grain. The right door is
// a mirror so the gold seam reads as a single line where they meet.
const doorBackground = (side: 'left' | 'right') => {
  const base = `
    repeating-linear-gradient(90deg,
      #2a2a2e 0px,
      #2a2a2e 3px,
      #353539 3px,
      #353539 6px),
    linear-gradient(180deg, #1f1f22 0%, #2a2a2e 50%, #1c1c20 100%)`;
  return base;
};

const ShopButton: React.FC<{ label: string; onClick: (e: React.MouseEvent) => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="px-4 py-2 border-2 border-white text-white bg-black hover:bg-white hover:text-black transition-colors"
    style={{
      fontFamily: '"Determination Mono", "Courier New", monospace',
      fontSize: 'clamp(13px, 1.8vw, 16px)',
      borderRadius: 4,
      letterSpacing: '0.04em',
    }}
  >
    * {label}
  </button>
);
