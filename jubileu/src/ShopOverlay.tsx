import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { SpriteAnimator } from './SpriteEngine';

// ─── Bellhop Shop — Undertale-style overlay with elevator entrance ─────────
// Phase chain (open → close):
//   'closing'   — two elevator doors slide in from the sides (covering screen)
//   'arrived'   — doors meet, brief darkness with a "DING" highlight
//   'opening'   — doors slide back out, revealing the shop content
//   'idle'      — shop interactive: dialog typewriter + menu buttons
//   'exit-close'— doors close again on Esc/Tchau, then unmount
//
// Sprite logic (Canvas-based — no more CSS steps() carousel bug):
//   • CLEAN strip animates during the entrance reveal (bellhop wiping counter)
//   • IDLE strip — frame 0 static (mouth CLOSED) when not typing
//   • TALK strip animates while text is being typed (mouth-open frames)

type ShopMenu = 'main' | 'talk' | 'bye';
type Phase = 'closing' | 'arrived' | 'opening' | 'idle' | 'exit-close';

interface ShopOverlayProps {
  open: boolean;
  onClose: () => void;
}

const DIALOGUES: Record<ShopMenu, string> = {
  main: '* Bem-vindo ao The Normal Hotel.\n* Posso te ajudar?',
  talk: '* Tenha uma ótima estadia...\n* E fique calmo se ouvir alguma\n  coisa estranha vindo do andar\n  de cima.',
  bye: '* Volte sempre!\n* O elevador está sempre aberto.',
};

const TIMINGS = {
  closing: 700,
  arrived: 360,
  opening: 700,
  exitClose: 600,
};

// Bellhop renders at this height. Width derived from aspect ratio.
const SPRITE_H = 'clamp(160px, 28vh, 220px)';

// ── Typewriter beep (Undertale-style) ─────────────────────────────────────
// Short procedural beep generated via Web Audio API on every Nth character.
let audioCtx: AudioContext | null = null;
function playBeep() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.value = 600;
    gain.gain.value = 0.03;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.04);
  } catch { /* silent fail */ }
}

export const ShopOverlay: React.FC<ShopOverlayProps> = ({ open, onClose }) => {
  const [menu, setMenu] = useState<ShopMenu>('main');
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('closing');
  const [hoveredBtn, setHoveredBtn] = useState<number>(-1);
  const typingRef = useRef<number | null>(null);
  const phaseTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(false);
  const charCountRef = useRef(0);

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
    setHoveredBtn(-1);

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

  // Typewriter with beep — paints dialog one chunk at a time
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    setTyped('');
    charCountRef.current = 0;
    const text = DIALOGUES[menu];
    let i = 0;
    const tick = () => {
      if (!mountedRef.current) return;
      i += 2;
      charCountRef.current += 2;
      // Beep every 3 characters (Undertale-style)
      if (charCountRef.current % 3 === 0) playBeep();
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

  const close = useCallback(() => {
    if (phase === 'exit-close') return;
    clearPhaseTimers();
    setPhase('exit-close');
    const t = window.setTimeout(() => onClose(), TIMINGS.exitClose);
    phaseTimersRef.current.push(t);
  }, [phase, onClose]);

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

  // ── Sprite mode selection (Canvas-based) ────────────────────────────
  type SpriteMode = 'clean' | 'idle-static' | 'talk';
  const spriteMode: SpriteMode =
    phase === 'idle' ? (isTyping ? 'talk' : 'idle-static') :
    'clean';

  const spriteConfigs = {
    clean: {
      imageUrl: BELLHOP_CLEAN_STRIP,
      frameCount: BELLHOP_CLEAN_FRAMES,
      frameWidth: BELLHOP_CLEAN_FRAME_W,
      frameHeight: BELLHOP_CLEAN_FRAME_H,
      cycleMs: 720,
      loop: true,
      pixelated: true,
    },
    talk: {
      imageUrl: BELLHOP_TALK_STRIP,
      frameCount: BELLHOP_TALK_FRAMES,
      frameWidth: BELLHOP_TALK_FRAME_W,
      frameHeight: BELLHOP_TALK_FRAME_H,
      cycleMs: 240,
      loop: true,
      pixelated: true,
    },
    'idle-static': {
      imageUrl: BELLHOP_IDLE_STRIP,
      frameCount: 1,
      frameWidth: BELLHOP_IDLE_FRAME_W,
      frameHeight: BELLHOP_IDLE_FRAME_H,
      cycleMs: 0,
      loop: false,
      pixelated: true,
    },
  };

  const activeSpriteConfig = spriteConfigs[spriteMode];

  const portraitConfig = isTyping
    ? {
        imageUrl: BELLHOP_TALK_STRIP,
        frameCount: BELLHOP_TALK_FRAMES,
        frameWidth: BELLHOP_TALK_FRAME_W,
        frameHeight: BELLHOP_TALK_FRAME_H,
        cycleMs: 240,
        loop: true,
        pixelated: true,
        scale: 1.8,
        cropRegion: { sourceY: 0, sourceHeight: 75 },
      }
    : {
        imageUrl: BELLHOP_IDLE_STRIP,
        frameCount: 1,
        frameWidth: BELLHOP_IDLE_FRAME_W,
        frameHeight: BELLHOP_IDLE_FRAME_H,
        cycleMs: 0,
        loop: false,
        pixelated: true,
        scale: 1.8,
        cropRegion: { sourceY: 0, sourceHeight: 75 },
      };

  return (
    <div
      className="absolute inset-0 z-[80] overflow-hidden"
      style={{
        fontFamily: '"Determination Mono", "Courier New", monospace',
        backgroundColor: '#000',
      }}
    >
      {/* Hotel lobby backdrop */}
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
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,180,100,0.06) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)',
          opacity: contentOpacity,
          transition: 'opacity 600ms ease-out',
        }}
      />

      {/* Title bar */}
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
          className="px-5 py-2 border-2"
          style={{
            background: 'linear-gradient(180deg, #1a0a08 0%, #2a0e0c 100%)',
            borderColor: '#C99B36',
            borderRadius: 4,
            boxShadow:
              '0 0 0 2px #000, 0 4px 14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,213,79,0.3)',
            letterSpacing: '0.3em',
            color: '#FFD54F',
            fontSize: 'clamp(11px, 1.7vw, 14px)',
            textShadow: '0 0 10px rgba(255,213,79,0.5)',
            textAlign: 'center',
          }}
        >
          ★ RECEPÇÃO ★
        </div>
      </div>

      {/* Shop content (sprite + dialog) */}
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
            {/* Animated bellhop — Canvas-based sprite renderer */}
            <SpriteAnimator
              key={spriteMode}
              config={activeSpriteConfig}
              style={{
                height: SPRITE_H,
                aspectRatio: `${activeSpriteConfig.frameWidth} / ${activeSpriteConfig.frameHeight}`,
                filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.65))',
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                opacity: showContent ? 1 : 0,
                transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 500ms ease-out 200ms',
                marginBottom: 14,
              }}
            />

            {/* ── Dialog box — Undertale style ────────────────────────── */}
            {/* Thick white border, black interior, portrait left, text right */}
            <div
              className="w-full"
              style={{
                background: '#000',
                border: '5px solid #fff',
                borderRadius: 0, // Undertale uses sharp corners
                padding: '12px 16px',
                minHeight: 120,
                boxShadow:
                  'inset 0 0 0 3px #000, 0 0 0 3px rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.6)',
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                opacity: phase === 'idle' ? 1 : 0,
                transition: 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1) 320ms, opacity 450ms ease-out 320ms',
                display: 'flex',
                gap: 12,
              }}
            >
              {/* ── Portrait frame — crops to head+torso ─────────────── */}
              <div
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 'clamp(90px, 15vw, 120px)',
                  height: 'clamp(90px, 15vw, 120px)',
                  border: '3px solid #fff',
                  borderRadius: 0,
                  background: '#000',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <SpriteAnimator
                  key={isTyping ? 'talk' : 'idle'}
                  config={portraitConfig}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated',
                  }}
                />
              </div>

              {/* ── Dialog text + menu ───────────────────────────────── */}
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    color: '#fff',
                    fontSize: 'clamp(14px, 2vw, 18px)',
                    lineHeight: 1.5,
                    minHeight: '3.0em',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                    letterSpacing: '0.03em',
                  }}
                >
                  {typed}
                  {isTyping && <span className="shop-cursor">▎</span>}
                </p>

                {!isTyping && (
                  <div className="mt-3 flex flex-col gap-1">
                    {menu === 'main' && (
                      <>
                        <UndertaleButton
                          label="Conversar"
                          index={0}
                          hovered={hoveredBtn === 0}
                          onHover={setHoveredBtn}
                          onClick={(e) => { e.stopPropagation(); setMenu('talk'); }}
                        />
                        <UndertaleButton
                          label="Sair"
                          index={1}
                          hovered={hoveredBtn === 1}
                          onHover={setHoveredBtn}
                          onClick={(e) => { e.stopPropagation(); setMenu('bye'); }}
                        />
                      </>
                    )}
                    {menu === 'talk' && (
                      <UndertaleButton
                        label="Voltar"
                        index={0}
                        hovered={hoveredBtn === 0}
                        onHover={setHoveredBtn}
                        onClick={(e) => { e.stopPropagation(); setMenu('main'); }}
                      />
                    )}
                    {menu === 'bye' && (
                      <UndertaleButton
                        label="Tchau"
                        index={0}
                        hovered={hoveredBtn === 0}
                        onHover={setHoveredBtn}
                        onClick={(e) => { e.stopPropagation(); close(); }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <p
              className="text-white/40 text-[10px] sm:text-xs select-none mt-1"
              style={{ letterSpacing: '0.08em' }}
            >
              [ ESC ] FECHAR &nbsp;·&nbsp; [ CLICK ] AVANÇAR
            </p>
          </div>
        )}
      </div>

      {/* Elevator doors */}
      <ElevatorDoor side="left" state={doorsState} />
      <ElevatorDoor side="right" state={doorsState} />

      {/* DING flash */}
      {phase === 'arrived' && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            color: '#FFD54F',
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
        @keyframes undertaleBlink {
          0%, 50%   { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .shop-cursor {
          display: inline-block;
          margin-left: 1px;
          color: #fff;
          animation: undertaleBlink 600ms steps(1) infinite;
        }
        .undertale-btn {
          background: transparent;
          border: 0;
          padding: 2px 4px 2px 24px;
          color: #fff;
          font-family: "Determination Mono", "Courier New", monospace;
          font-size: clamp(14px, 2vw, 18px);
          letter-spacing: 0.03em;
          cursor: pointer;
          position: relative;
          text-align: left;
          transition: color 80ms ease;
          line-height: 1.5;
        }
        .undertale-btn::before {
          content: '►';
          position: absolute;
          left: 4px;
          color: #FFD54F;
          opacity: 0;
          transition: opacity 80ms ease;
        }
        .undertale-btn:hover,
        .undertale-btn:focus-visible {
          color: #FFD54F;
          outline: 0;
        }
        .undertale-btn:hover::before,
        .undertale-btn:focus-visible::before {
          opacity: 1;
        }
        .undertale-btn::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 0;
          background: rgba(255,213,79,0.08);
          transition: height 80ms ease;
        }
        .undertale-btn:hover::after {
          height: 100%;
        }
      `}</style>
    </div>
  );
};

// ─── Undertale-style button ───────────────────────────────────────────────
// Yellow arrow (►) appears on hover, text turns yellow.
const UndertaleButton: React.FC<{
  label: string;
  index: number;
  hovered: boolean;
  onHover: (i: number) => void;
  onClick: (e: React.MouseEvent) => void;
}> = ({ label, index, onHover, onClick }) => (
  <button
    type="button"
    className="undertale-btn"
    onMouseEnter={() => onHover(index)}
    onMouseLeave={() => onHover(-1)}
    onClick={onClick}
  >
    {label}
  </button>
);

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
