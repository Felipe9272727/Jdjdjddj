import React, { useEffect, useRef, useState } from 'react';
import {
  BELLHOP_CLEAN_STRIP,
  BELLHOP_CLEAN_FRAMES,
  BELLHOP_CLEAN_FRAME_W,
  BELLHOP_CLEAN_FRAME_H,
  BELLHOP_TALK_STRIP,
  BELLHOP_TALK_FRAMES,
  BELLHOP_TALK_FRAME_W,
  BELLHOP_TALK_FRAME_H,
  HOTEL_BG,
} from './bellhop-sprites';

// ─── Bellhop Shop — Undertale-style overlay with elevator entrance ─────────
// Phases of the overlay lifecycle:
//   'closing'   — two elevator doors slide in from the sides toward center
//   'arrived'   — doors meet, brief darkness with a "ding" highlight
//   'opening'   — doors slide back out, revealing the shop content
//   'idle'      — shop interactive, dialog typing, bellhop wiping counter
//   'exit-close'— doors close again on Esc/Tchau, then unmount
// Sprites + bg are inlined as base64 (see bellhop-sprites.ts) so the build
// is self-contained. The bellhop animates via a CSS sprite strip — the
// `background-position-x` steps through 4 frames.

type ShopMenu = 'main' | 'talk' | 'bye';
type Phase = 'closing' | 'arrived' | 'opening' | 'idle' | 'exit-close';

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
  closing: 700,
  arrived: 360,
  opening: 700,
  exitClose: 600,
};

export const ShopOverlay: React.FC<ShopOverlayProps> = ({ open, onClose }) => {
  const [menu, setMenu] = useState<ShopMenu>('main');
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('closing');
  const typingRef = useRef<number | null>(null);
  const phaseTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(false);

  const clearPhaseTimers = () => {
    phaseTimersRef.current.forEach((id) => window.clearTimeout(id));
    phaseTimersRef.current = [];
  };

  // Drive entrance phase chain whenever we open
  useEffect(() => {
    if (!open) { mountedRef.current = false; clearPhaseTimers(); return; }
    mountedRef.current = true;
    setMenu('main');
    setTyped('');
    setPhase('closing');

    const t1 = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setPhase('arrived');
      const t2 = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setPhase('opening');
        const t3 = window.setTimeout(() => {
          if (!mountedRef.current) return;
          setPhase('idle');
        }, TIMINGS.opening);
        phaseTimersRef.current.push(t3);
      }, TIMINGS.arrived);
      phaseTimersRef.current.push(t2);
    }, TIMINGS.closing);
    phaseTimersRef.current.push(t1);

    return () => { clearPhaseTimers(); mountedRef.current = false; };
  }, [open]);

  // Typewriter
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

  const close = () => {
    if (phase === 'exit-close') return;
    clearPhaseTimers();
    setPhase('exit-close');
    const t = window.setTimeout(() => onClose(), TIMINGS.exitClose);
    phaseTimersRef.current.push(t);
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

  // ── Door state machine ────────────────────────────────────────────────
  // 'sliding-in'  → CSS animation drives door from open → closed
  // 'closed'      → hold at closed (no animation)
  // 'sliding-out' → CSS transition drives door from closed → open
  // 'open'        → hold at open (off-screen)
  // 'closing-exit'→ CSS animation drives door from open → closed (exit)
  const doorsState =
    phase === 'closing' ? 'sliding-in' as const :
    phase === 'arrived' ? 'closed' as const :
    phase === 'opening' ? 'sliding-out' as const :
    phase === 'idle' ? 'open' as const :
    phase === 'exit-close' ? 'closing-exit' as const :
    'closed' as const;

  const showContent = phase === 'opening' || phase === 'idle';
  const contentOpacity = phase === 'opening' ? 0.85 : phase === 'idle' ? 1 : 0;

  // Two animation modes for the bellhop:
  //   • CLEAN: shown during the entrance ('opening' phase) — bellhop is
  //     wiping the counter when the elevator doors open, like he didn't
  //     notice the player yet.
  //   • TALK: shown once we hit 'idle' — bellhop is now facing/addressing
  //     the player. Mouth-open frames cycle to read as speaking.
  const useTalk = phase === 'idle';
  const stripUrl = useTalk ? BELLHOP_TALK_STRIP : BELLHOP_CLEAN_STRIP;
  const frameW = useTalk ? BELLHOP_TALK_FRAME_W : BELLHOP_CLEAN_FRAME_W;
  const frameH = useTalk ? BELLHOP_TALK_FRAME_H : BELLHOP_CLEAN_FRAME_H;
  const frameCount = useTalk ? BELLHOP_TALK_FRAMES : BELLHOP_CLEAN_FRAMES;
  // Cycle faster while text is being typed so the talking animation reads
  // as actively speaking.
  const cycleMs = useTalk ? (isTyping ? 280 : 520) : 760;
  const animName = useTalk ? 'bellhopTalk' : 'bellhopClean';

  return (
    <div
      className="absolute inset-0 z-[80] overflow-hidden"
      style={{
        fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
        backgroundColor: '#000',
      }}
    >
      {/* Hotel lobby backdrop */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${HOTEL_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          imageRendering: 'pixelated',
          opacity: contentOpacity,
          transform: phase === 'idle' ? 'scale(1)' : 'scale(1.04)',
          transition: 'opacity 600ms ease-out, transform 1400ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
        }}
      />
      {/* Vignette + warm glow on top of bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,180,100,0.05) 0%, rgba(0,0,0,0.65) 80%)',
          opacity: contentOpacity,
          transition: 'opacity 600ms ease-out',
        }}
      />

      {/* Shop content (sprite + dialog) — sits ABOVE the doors (z-index 3) */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-end"
        style={{
          opacity: contentOpacity,
          transition: 'opacity 500ms ease-out',
          pointerEvents: showContent ? 'auto' : 'none',
          zIndex: 3,
        }}
        onClick={skipOrAdvance}
      >
        {showContent && (
          <div className="flex flex-col items-center gap-3 p-4 pb-6 max-w-3xl w-full">
            {/* Animated bellhop — CSS sprite step animation. Strip switches
                between cleaning (entry) and talking (idle interaction).
                No `key` prop to avoid remount flicker — the animation name
                and strip URL update declaratively. */}
            <div
              className="bellhop-sprite"
              aria-hidden
              style={{
                width: frameW,
                height: frameH,
                backgroundImage: `url(${stripUrl})`,
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
                transform: phase === 'idle' ? 'scale(1.5) translateY(-6px)' : 'scale(1.35) translateY(20px)',
                transformOrigin: 'center bottom',
                opacity: phase === 'idle' ? 1 : 0,
                transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 500ms ease-out 200ms',
                animation: `${animName} ${cycleMs}ms steps(${frameCount}) infinite`,
                filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.7))',
                marginBottom: 18,
              }}
            />

            {/* Dialog box (Undertale-style) */}
            <div
              className="w-full max-w-2xl border-4 border-white"
              style={{
                background: 'rgba(0,0,0,0.92)',
                borderRadius: 6,
                padding: '20px 24px',
                minHeight: 110,
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

            <p className="text-white/50 text-xs mt-1 select-none">
              [ESC] fechar &nbsp;·&nbsp; [Click] avan&ccedil;ar
            </p>
          </div>
        )}
      </div>

      {/* Elevator doors — slide in/out */}
      <ElevatorDoor side="left"  state={doorsState} />
      <ElevatorDoor side="right" state={doorsState} />

      {/* DING flash during arrived state */}
      {phase === 'arrived' && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            color: '#FFD54F',
            fontFamily: '"Determination Mono", monospace',
            fontSize: 'clamp(28px, 5vw, 44px)',
            letterSpacing: '0.3em',
            textShadow: '0 0 16px rgba(255,213,79,0.9), 0 0 32px rgba(255,193,7,0.6)',
            animation: 'shopDing 360ms ease-out forwards',
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
        @keyframes bellhopClean {
          from { background-position-x: 0px; }
          to   { background-position-x: -${BELLHOP_CLEAN_FRAME_W * BELLHOP_CLEAN_FRAMES}px; }
        }
        @keyframes bellhopTalk {
          from { background-position-x: 0px; }
          to   { background-position-x: -${BELLHOP_TALK_FRAME_W * BELLHOP_TALK_FRAMES}px; }
        }
        /* Entrance: doors slide from off-screen to center */
        @keyframes shopDoorInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0%); }
        }
        @keyframes shopDoorInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0%); }
        }
        /* Exit: doors slide from off-screen to center (closing animation) */
        @keyframes shopDoorCloseLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0%); }
        }
        @keyframes shopDoorCloseRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0%); }
        }
      `}</style>
    </div>
  );
};

// ─── Elevator door panel ─────────────────────────────────────────────────
type DoorState = 'sliding-in' | 'closed' | 'sliding-out' | 'open' | 'closing-exit';

const ElevatorDoor: React.FC<{ side: 'left' | 'right'; state: DoorState }> = ({ side, state }) => {
  let tx = 0;
  let transition = '';
  let animation: string | undefined;

  if (state === 'sliding-in') {
    // Entrance: doors slide from off-screen to center via CSS animation
    tx = 0;
    animation = `${side === 'left' ? 'shopDoorInLeft' : 'shopDoorInRight'} ${TIMINGS.closing}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`;
  } else if (state === 'closed') {
    // Hold at center — no animation, no transition
    tx = 0;
  } else if (state === 'sliding-out') {
    // Opening: doors slide from center to off-screen via CSS transition
    tx = side === 'left' ? -100 : 100;
    transition = `transform ${TIMINGS.opening}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  } else if (state === 'open') {
    // Hold at off-screen position
    tx = side === 'left' ? -100 : 100;
  } else if (state === 'closing-exit') {
    // Exit: doors slide from off-screen to center via CSS animation
    // (same as entrance — doors were at -100%/100% from 'open' state,
    // animation brings them back to 0%)
    tx = 0;
    animation = `${side === 'left' ? 'shopDoorCloseLeft' : 'shopDoorCloseRight'} ${TIMINGS.exitClose}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`;
  }

  const doorBg = `
    repeating-linear-gradient(90deg,
      #2a2a2e 0px,
      #2a2a2e 3px,
      #353539 3px,
      #353539 6px),
    linear-gradient(180deg, #1f1f22 0%, #2a2a2e 50%, #1c1c20 100%)`;

  return (
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
        background: doorBg,
        boxShadow: side === 'left'
          ? 'inset -3px 0 0 #C99B36, inset -4px 0 0 #6B4F1B, 4px 0 14px rgba(0,0,0,0.7)'
          : 'inset 3px 0 0 #C99B36, inset 4px 0 0 #6B4F1B, -4px 0 14px rgba(0,0,0,0.7)',
        zIndex: 2,
      }}
    />
  );
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
