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
  BELLHOP_IDLE_STRIP,
  BELLHOP_IDLE_FRAME_W,
  BELLHOP_IDLE_FRAME_H,
  HOTEL_BG,
} from './bellhop-sprites';

// ─── Bellhop Shop — Undertale-style overlay with elevator entrance ─────────
// Phase chain (open → close):
//   'closing'   — two elevator doors slide in from the sides (covering screen)
//   'arrived'   — doors meet, brief darkness with a "DING" highlight
//   'opening'   — doors slide back out, revealing the shop content
//   'idle'      — shop interactive: dialog typewriter + menu buttons
//   'exit-close'— doors close again on Esc/Tchau, then unmount
//
// Sprite logic:
//   • CLEAN strip animates only during the entrance reveal — bellhop is
//     wiping the counter when the elevator opens (he hasn't noticed the
//     player yet). 4 frames cycling.
//   • IDLE strip — frame 0 static (mouth CLOSED). Shown when in 'idle' phase
//     and the dialog is NOT typing. Bellhop is calmly waiting for input.
//   • TALK strip animates only while text is being typed. Mouth-open frames
//     cycle to read as active speech.
// All assets are inlined as base64 (see bellhop-sprites.ts).

type ShopMenu = 'main' | 'talk' | 'bye' | 'comprar';
type Phase = 'closing' | 'arrived' | 'opening' | 'idle' | 'exit-close';

interface ShopOverlayProps {
  open: boolean;
  onClose: () => void;
}

const DIALOGUES: Record<ShopMenu, string> = {
  main: 'Bem-vindo ao The Normal Hotel.\nPosso te ajudar?',
  talk: 'Tenha uma ótima estadia... e fique calmo se ouvir alguma coisa estranha vindo do andar de cima.',
  bye: 'Volte sempre! O elevador está\nsempre aberto.',
  comprar: 'Em breve...',
};

const TIMINGS = {
  closing: 700,
  arrived: 360,
  opening: 700,
  exitClose: 600,
};

// Display target — the bellhop renders at this height in CSS pixels. Width
// is derived from the active strip's aspect ratio. Using a fixed height
// (responsive via clamp) keeps the sprite from overflowing the layout box
// the way `transform: scale(...)` does.
const SPRITE_H = 'clamp(160px, 28vh, 220px)';

export const ShopOverlay: React.FC<ShopOverlayProps> = ({ open, onClose }) => {
  const [menu, setMenu] = useState<ShopMenu>('main');
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('closing');
  const typingRef = useRef<number | null>(null);
  const phaseTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(false);
  const spriteRef = useRef<HTMLDivElement>(null);
  const prevSpriteModeRef = useRef<string>('');

  const clearPhaseTimers = () => {
    phaseTimersRef.current.forEach((id) => window.clearTimeout(id));
    phaseTimersRef.current = [];
  };

  // Drive the entrance phase chain whenever we open
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

  // Typewriter — paints the active dialog one chunk at a time
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    setTyped('');
    const text = DIALOGUES[menu];
    let i = 0;
    const tick = () => {
      if (!mountedRef.current) return;
      i += 2;
      setTyped(text.slice(0, i));
      if (i < text.length) typingRef.current = window.setTimeout(tick, 30);
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

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase]);

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
  const doorsState =
    phase === 'closing' ? 'sliding-in' as const :
    phase === 'arrived' ? 'closed' as const :
    phase === 'opening' ? 'sliding-out' as const :
    phase === 'idle' ? 'open' as const :
    phase === 'exit-close' ? 'closing-exit' as const :
    'closed' as const;

  const showContent = phase === 'opening' || phase === 'idle';
  const contentOpacity = phase === 'opening' ? 0.85 : phase === 'idle' ? 1 : 0;

  // ── Sprite mode selection ─────────────────────────────────────────────
  // CLEAN during the reveal; TALK while typing; IDLE (mouth closed,
  // static) the rest of the time in idle phase.
  type SpriteMode = 'clean' | 'idle-static' | 'talk';
  const spriteMode: SpriteMode =
    phase === 'idle' ? (isTyping ? 'talk' : 'idle-static') :
    'clean';

  const sprite = (() => {
    if (spriteMode === 'clean') return {
      url: BELLHOP_CLEAN_STRIP,
      frameW: BELLHOP_CLEAN_FRAME_W,
      frameH: BELLHOP_CLEAN_FRAME_H,
      frames: BELLHOP_CLEAN_FRAMES,
      anim: 'bellhopClean',
      cycle: 720,
    };
    if (spriteMode === 'talk') return {
      url: BELLHOP_TALK_STRIP,
      frameW: BELLHOP_TALK_FRAME_W,
      frameH: BELLHOP_TALK_FRAME_H,
      frames: BELLHOP_TALK_FRAMES,
      anim: 'bellhopTalk',
      cycle: 240,
    };
    return {
      url: BELLHOP_IDLE_STRIP,
      frameW: BELLHOP_IDLE_FRAME_W,
      frameH: BELLHOP_IDLE_FRAME_H,
      frames: 1,
      anim: '',
      cycle: 0,
    };
  })();
  // Aspect ratio for the *visible* frame (used to compute display width
  // from the responsive height).
  const aspect = sprite.frameW / sprite.frameH;

  // ── Force CSS animation restart on sprite mode change ────────────────
  // The "sprite carrossel" bug: when spriteMode changes, the browser may
  // not restart the CSS animation cleanly, causing frame jumps. Fix:
  // temporarily set animation to 'none', force a repaint via rAF, then
  // apply the new animation.
  useEffect(() => {
    const el = spriteRef.current;
    if (!el) return;
    if (prevSpriteModeRef.current === spriteMode) return;
    prevSpriteModeRef.current = spriteMode;
    // Strip animation
    el.style.animation = 'none';
    // Force browser to acknowledge the style change
    void el.offsetHeight;
    // Re-apply in next frame
    requestAnimationFrame(() => {
      if (!sprite.anim) {
        el.style.animation = 'none';
      } else {
        el.style.animation = `${sprite.anim} ${sprite.cycle}ms steps(${sprite.frames}) infinite`;
      }
    });
  }, [spriteMode, sprite.anim, sprite.cycle, sprite.frames]);

  return (
    <div
      className="absolute inset-0 z-[80] overflow-hidden"
      style={{
        fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
        backgroundColor: '#000',
      }}
    >
      {/* Hotel lobby backdrop — pixel-art, sits behind everything */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${HOTEL_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          imageRendering: 'pixelated',
          opacity: contentOpacity,
          transform: phase === 'idle' ? 'scale(1)' : 'scale(1.04)',
          transition: 'opacity 600ms ease-out, transform 1400ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
        }}
      />
      {/* Vignette + warm glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,180,100,0.06) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)',
          opacity: contentOpacity,
          transition: 'opacity 600ms ease-out',
        }}
      />

      {/* Close button — top-right */}
      {phase === 'idle' && (
        <button
          onClick={(e) => { e.stopPropagation(); close(); }}
          aria-label="Fechar loja"
          className="absolute top-4 right-4 z-[90] w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110"
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: '2px solid rgba(201,155,54,0.5)',
            color: '#FFD54F',
            fontSize: '20px',
            fontFamily: 'monospace',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          ✕
        </button>
      )}

      {/* Title bar — "★ RECEPÇÃO ★" badge with pulse */}
      <div
        className="absolute left-1/2 -translate-x-1/2 select-none pointer-events-none"
        style={{
          top: 'clamp(20px, 4vh, 48px)',
          opacity: phase === 'idle' ? 1 : 0,
          transform: phase === 'idle' ? 'translate(-50%, 0)' : 'translate(-50%, -8px)',
          transition: 'transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 350ms, opacity 500ms ease-out 350ms',
          zIndex: 4,
        }}
      >
        <div
          className="px-5 py-2 border-2 reception-badge"
          style={{
            background: 'linear-gradient(180deg, #1a0a08 0%, #2a0e0c 100%)',
            borderColor: '#C99B36',
            borderRadius: 4,
            boxShadow:
              '0 0 0 2px #000, 0 4px 14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,213,79,0.3)',
            letterSpacing: '0.3em',
            color: '#FFD54F',
            fontSize: 'clamp(11px, 1.7vw, 14px)',
            fontFamily: '"Determination Mono", "Courier New", monospace',
            textShadow: '0 0 10px rgba(255,213,79,0.5)',
            textAlign: 'center',
          }}
        >
          ★ RECEPÇÃO ★
        </div>
      </div>

      {/* Shop content (sprite + dialog) — z-index 3, above doors (2) */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-end overflow-hidden"
        style={{
          opacity: contentOpacity,
          transition: 'opacity 500ms ease-out',
          pointerEvents: showContent ? 'auto' : 'none',
          zIndex: 3,
          paddingBottom: 'clamp(16px, 3vh, 32px)',
        }}
        onClick={skipOrAdvance}
      >
        {showContent && (
          <div className="flex flex-col items-center gap-3 px-4 max-w-2xl w-full">
            {/* Animated bellhop — animation restart is handled by a useEffect
                that strips animation, forces repaint via offsetHeight, then
                re-applies in rAF. This fixes the "sprite carrossel" bug. */}
            <div
              ref={spriteRef}
              aria-hidden
              className={spriteMode === 'idle-static' ? 'bellhop-idle-bob' : undefined}
              style={{
                height: SPRITE_H,
                aspectRatio: `${sprite.frameW} / ${sprite.frameH}`,
                backgroundImage: `url(${sprite.url})`,
                backgroundSize: `${sprite.frames * 100}% 100%`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '0% 0%',
                imageRendering: 'pixelated',
                animation: sprite.anim
                  ? `${sprite.anim} ${sprite.cycle}ms steps(${sprite.frames}) infinite`
                  : 'none',
                filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.65))',
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                opacity: showContent ? 1 : 0,
                transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 500ms ease-out 200ms',
                marginBottom: 14,
              }}
            />

            {/* Dialog box — Undertale style: thick white border, gold inner
                accent, portrait on the left, subtle glow */}
            <div
              className="w-full dialog-glow"
              style={{
                background: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(8,4,2,0.95) 100%)',
                border: '4px solid #ffffff',
                borderRadius: 6,
                padding: '14px 18px',
                minHeight: 110,
                boxShadow:
                  '0 0 0 2px #000, inset 0 0 0 2px rgba(255,213,79,0.18), 0 8px 24px rgba(0,0,0,0.5), 0 0 20px rgba(255,213,79,0.08), 0 0 40px rgba(255,213,79,0.04)',
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                opacity: phase === 'idle' ? 1 : 0,
                transition: 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1) 320ms, opacity 450ms ease-out 320ms',
                display: 'flex',
                gap: 14,
              }}
            >
              {/* Portrait — small mouth-closed / mouth-open head, 64×64 */}
              <div
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 'clamp(56px, 9vw, 76px)',
                  aspectRatio: '1 / 1',
                  border: '2px solid #C99B36',
                  borderRadius: 4,
                  background: 'linear-gradient(180deg, #2a1a14 0%, #1a0a08 100%)',
                  boxShadow: 'inset 0 0 6px rgba(0,0,0,0.6)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  key={isTyping ? 'talk' : 'idle'}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: '180%',
                    backgroundImage: `url(${isTyping ? BELLHOP_TALK_STRIP : BELLHOP_IDLE_STRIP})`,
                    backgroundSize: `${(isTyping ? BELLHOP_TALK_FRAMES : 4) * 100}% 100%`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: '0% 0%',
                    imageRendering: 'pixelated',
                    animationName: isTyping ? 'bellhopTalk' : 'none',
                    animationDuration: isTyping ? '240ms' : undefined,
                    animationTimingFunction: isTyping ? `steps(${BELLHOP_TALK_FRAMES})` : undefined,
                    animationIterationCount: isTyping ? 'infinite' : undefined,
                    transform: 'translateY(-8%)',
                  }}
                />
              </div>

              {/* Dialog text + menu */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-white"
                  style={{
                    fontFamily: '"Determination Mono", "Courier New", monospace',
                    fontSize: 'clamp(15px, 2.1vw, 19px)',
                    lineHeight: 1.45,
                    minHeight: '3.0em',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}
                >
                  {typed}
                  {isTyping && <span className="typewriter-cursor">▍</span>}
                </p>

                {!isTyping && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {menu === 'main' && (
                      <>
                        <ShopButton label="Conversar" onClick={(e) => { e.stopPropagation(); setMenu('talk'); }} />
                        <ShopButton label="Comprar" onClick={(e) => { e.stopPropagation(); setMenu('comprar'); }} />
                        <ShopButton label="Sair" onClick={(e) => { e.stopPropagation(); setMenu('bye'); }} />
                      </>
                    )}
                    {menu === 'talk' && (
                      <ShopButton label="Voltar" onClick={(e) => { e.stopPropagation(); setMenu('main'); }} />
                    )}
                    {menu === 'comprar' && (
                      <ShopButton label="Voltar" onClick={(e) => { e.stopPropagation(); setMenu('main'); }} />
                    )}
                    {menu === 'bye' && (
                      <ShopButton label="Tchau" onClick={(e) => { e.stopPropagation(); close(); }} />
                    )}
                  </div>
                )}
              </div>
            </div>

            <p
              className="text-white/55 text-[10px] sm:text-xs select-none mt-1"
              style={{ letterSpacing: '0.08em' }}
            >
              [ESC] FECHAR &nbsp;·&nbsp; [CLICK] AVAN&Ccedil;AR
            </p>
          </div>
        )}
      </div>

      {/* Elevator doors — slide in/out */}
      <ElevatorDoor side="left" state={doorsState} />
      <ElevatorDoor side="right" state={doorsState} />

      {/* DING flash during arrived */}
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
            zIndex: 5,
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
          from { background-position-x: 0%; }
          to   { background-position-x: 100%; }
        }
        @keyframes bellhopTalk {
          from { background-position-x: 0%; }
          to   { background-position-x: 100%; }
        }
        @keyframes bellhopIdleBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes receptionPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes shopDoorInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0%); }
        }
        @keyframes shopDoorInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0%); }
        }
        @keyframes shopDoorCloseLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0%); }
        }
        @keyframes shopDoorCloseRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0%); }
        }
        @keyframes typewriterBlink {
          0%, 60%   { opacity: 0.7; }
          61%, 100% { opacity: 0; }
        }
        .typewriter-cursor {
          display: inline-block;
          margin-left: 2px;
          color: #FFD54F;
          animation: typewriterBlink 700ms steps(2) infinite;
        }
        .bellhop-idle-bob {
          animation: bellhopIdleBob 3s ease-in-out infinite !important;
        }
        .reception-badge {
          animation: receptionPulse 3s ease-in-out infinite;
        }
        .dialog-glow {
          /* Subtle warm glow already in box-shadow via inline style;
             this class exists for future CSS-only enhancements. */
        }
        .shop-button {
          background: transparent;
          border: 0;
          padding: 4px 10px;
          color: #fff;
          font-family: "Determination Mono", "Courier New", monospace;
          font-size: clamp(13px, 1.9vw, 17px);
          letter-spacing: 0.05em;
          cursor: pointer;
          position: relative;
          transition: color 120ms ease;
        }
        .shop-button::before {
          content: '*';
          color: #FFD54F;
          margin-right: 6px;
          opacity: 0.4;
          transition: opacity 120ms ease, transform 120ms ease;
          display: inline-block;
        }
        .shop-button:hover, .shop-button:focus-visible {
          color: #FFD54F;
          outline: 0;
        }
        .shop-button:hover::before, .shop-button:focus-visible::before {
          content: '►';
          opacity: 1;
          transform: translateX(2px);
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
    tx = 0;
    animation = `${side === 'left' ? 'shopDoorInLeft' : 'shopDoorInRight'} ${TIMINGS.closing}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`;
  } else if (state === 'closed') {
    tx = 0;
  } else if (state === 'sliding-out') {
    tx = side === 'left' ? -100 : 100;
    transition = `transform ${TIMINGS.opening}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  } else if (state === 'open') {
    tx = side === 'left' ? -100 : 100;
  } else if (state === 'closing-exit') {
    tx = 0;
    animation = `${side === 'left' ? 'shopDoorCloseLeft' : 'shopDoorCloseRight'} ${TIMINGS.exitClose}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`;
  }

  // Brushed steel + warm gold seam
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
  <button type="button" className="shop-button" onClick={onClick}>{label}</button>
);
