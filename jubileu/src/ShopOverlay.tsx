import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { playDoorbell, playBeep, playSelect, playConfirm, createLobbyMusic } from './shop-audio';
import { tokenize, splitPages, charCount, type Token, type Mood } from './dialogue-engine';
import { SHOP_SCENES, ROOT_SCENE, CLOSE_SCENE } from './shop-dialogues';

// ─── Bellhop Shop — Undertale-style overlay with elevator entrance ─────────
// Phase chain (open → close):
//   'closing'   — two elevator doors slide in (covering screen)
//   'arrived'   — doors meet, brief darkness with a "DING" highlight
//   'opening'   — doors slide back out, revealing the shop content
//   'idle'      — shop interactive: dialog typewriter + menu buttons
//   'exit-close'— doors close again on Esc/Tchau, then unmount
//
// Dialogue engine:
//   • shop-dialogues.ts → scene tree with inline tags ({y:...} {p:N} ^^)
//   • dialogue-engine.ts → tokenizer + page splitter
//   • Typewriter walks tokens char-by-char, respecting pauses & color
//   • Multi-page: ▼ blinks at end of page; Z/Click advances
//   • Mood per scene → drives bellhop sprite (talk / idle / wink / sweat / concerned)
//   • Heart ♥ cursor on hovered/keyboard-selected choice (Undertale)

type Phase = 'closing' | 'arrived' | 'opening' | 'idle' | 'exit-close';

interface ShopOverlayProps {
  open: boolean;
  onClose: () => void;
}

const TIMINGS = {
  closing: 700,
  arrived: 360,
  opening: 700,
  exitClose: 600,
  charDelay: 28,
};

export const ShopOverlay: React.FC<ShopOverlayProps> = ({ open, onClose }) => {
  const [sceneId, setSceneId] = useState<string>(ROOT_SCENE);
  const [pageIndex, setPageIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<Phase>('closing');
  const [selectedChoice, setSelectedChoice] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);

  const typingRef = useRef<number | null>(null);
  const phaseTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(false);
  const musicRef = useRef<ReturnType<typeof createLobbyMusic> | null>(null);
  const charCountRef = useRef(0);

  const scene = SHOP_SCENES[sceneId] ?? SHOP_SCENES[ROOT_SCENE];
  const pages = useMemo(() => splitPages(tokenize(scene.text)), [scene.text]);
  const currentPage: Token[] = pages[pageIndex] ?? [];
  const pageCharTotal = useMemo(() => charCount(currentPage), [currentPage]);
  const isPageDone = revealed >= pageCharTotal;
  const isLastPage = pageIndex >= pages.length - 1;
  const showChoices = isPageDone && isLastPage;

  const clearPhaseTimers = () => {
    phaseTimersRef.current.forEach((id) => window.clearTimeout(id));
    phaseTimersRef.current = [];
  };

  const clearTyping = () => {
    if (typingRef.current !== null) {
      window.clearTimeout(typingRef.current);
      typingRef.current = null;
    }
  };

  // Detect landscape orientation
  useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsLandscape(e.matches);
    handler(mql);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Drive the entrance phase chain whenever we open
  useEffect(() => {
    if (!open) {
      mountedRef.current = false;
      clearPhaseTimers();
      clearTyping();
      return;
    }
    mountedRef.current = true;
    setSceneId(ROOT_SCENE);
    setPageIndex(0);
    setRevealed(0);
    setSelectedChoice(0);
    setPhase('closing');

    const t1 = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setPhase('arrived');
      playDoorbell();
      const t2 = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setPhase('opening');
        const t3 = window.setTimeout(() => {
          if (!mountedRef.current) return;
          setPhase('idle');
          if (!musicRef.current) musicRef.current = createLobbyMusic();
          musicRef.current.start();
        }, TIMINGS.opening);
        phaseTimersRef.current.push(t3);
      }, TIMINGS.arrived);
      phaseTimersRef.current.push(t2);
    }, TIMINGS.closing);
    phaseTimersRef.current.push(t1);

    return () => { clearPhaseTimers(); clearTyping(); mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset typewriter when scene/page changes (only while idle)
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    setRevealed(0);
    charCountRef.current = 0;
  }, [sceneId, pageIndex, open, phase]);

  // Reset selected choice when scene changes
  useEffect(() => {
    setSelectedChoice(0);
  }, [sceneId]);

  // Typewriter — walks tokens of currentPage one at a time, respecting pauses
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    if (revealed >= pageCharTotal) { clearTyping(); return; }

    // Find the next *character* token starting from `revealed`
    // We need to walk the page, counting chars to know when to next emit
    const tick = () => {
      if (!mountedRef.current) return;
      // Determine next pause before next char
      let charsSeen = 0;
      let pendingPause = 0;
      for (const t of currentPage) {
        if (t.kind === 'char') {
          if (charsSeen === revealed) break;
          charsSeen++;
        } else if (t.kind === 'pause' && charsSeen === revealed) {
          pendingPause += t.ms;
        }
      }
      const delay = TIMINGS.charDelay + pendingPause;
      typingRef.current = window.setTimeout(() => {
        charCountRef.current += 1;
        if (charCountRef.current % 3 === 0) playBeep();
        setRevealed((r) => Math.min(r + 1, pageCharTotal));
      }, delay);
    };
    tick();
    return clearTyping;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, currentPage, pageCharTotal, phase, open]);

  // ── Action handlers ────────────────────────────────────────────────────
  const advanceOrSkip = useCallback(() => {
    if (phase !== 'idle') return;
    // Still typing → reveal whole page instantly
    if (!isPageDone) {
      clearTyping();
      setRevealed(pageCharTotal);
      return;
    }
    // Page complete but more pages → next page
    if (!isLastPage) {
      setPageIndex((p) => p + 1);
      setRevealed(0);
      playBeep();
      return;
    }
  }, [phase, isPageDone, isLastPage, pageCharTotal]);

  const close = useCallback(() => {
    if (phase === 'exit-close') return;
    clearPhaseTimers();
    clearTyping();
    setPhase('exit-close');
    musicRef.current?.stop();
    const t = window.setTimeout(() => onClose(), TIMINGS.exitClose);
    phaseTimersRef.current.push(t);
  }, [phase, onClose]);

  const pickChoice = useCallback((index: number) => {
    if (!showChoices) return;
    const choice = scene.choices[index];
    if (!choice) return;
    playConfirm();
    if (choice.goto === CLOSE_SCENE) { close(); return; }
    setSceneId(choice.goto);
    setPageIndex(0);
    setRevealed(0);
  }, [showChoices, scene.choices, close]);

  // ── Keyboard navigation ────────────────────────────────────────────────
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); close(); return; }
      if (showChoices) {
        const n = scene.choices.length;
        if (k === 'ArrowDown' || k === 's' || k === 'S') {
          e.preventDefault();
          setSelectedChoice((i) => (i + 1) % n);
          playSelect();
        } else if (k === 'ArrowUp' || k === 'w' || k === 'W') {
          e.preventDefault();
          setSelectedChoice((i) => (i - 1 + n) % n);
          playSelect();
        } else if (k === 'Enter' || k === 'z' || k === 'Z' || k === ' ') {
          e.preventDefault();
          pickChoice(selectedChoice);
        }
        return;
      }
      // Typing or page-done-but-more-pages: advance
      if (k === 'Enter' || k === 'z' || k === 'Z' || k === ' ') {
        e.preventDefault();
        advanceOrSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, showChoices, selectedChoice, scene.choices.length, pickChoice, advanceOrSkip, close]);

  if (!open) return null;

  // ── Door state machine ────────────────────────────────────────────────
  const doorsState =
    phase === 'closing' ? 'sliding-in' as const :
    phase === 'arrived' ? 'closed' as const :
    phase === 'opening' ? 'sliding-out' as const :
    phase === 'idle' ? 'open' as const :
    'closing-exit' as const;

  const showContent = phase === 'opening' || phase === 'idle';
  const contentOpacity = phase === 'opening' ? 0.85 : phase === 'idle' ? 1 : 0;

  // ── Sprite mood selection ─────────────────────────────────────────────
  // Bellhop is "talking" while text is still being revealed; otherwise the
  // mood from the scene controls expression. CLEAN strip plays during the
  // entrance reveal (counter wipe).
  const sceneMood: Mood = scene.mood ?? 'idle';
  type SpriteMode = 'clean' | 'idle-static' | 'talk';
  const spriteMode: SpriteMode = phase === 'idle'
    ? (!isPageDone || sceneMood === 'talk' ? 'talk' : 'idle-static')
    : 'clean';

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

  // ── Render the visible portion of the current page ────────────────────
  // Walk tokens, accumulating chars up to `revealed`. Returns React nodes
  // grouped by color so styled spans render correctly.
  const renderedNodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    let charsSeen = 0;
    let buf = '';
    let bufColor: string | undefined;
    let bufShake = false;
    const flush = () => {
      if (!buf) return;
      out.push(
        <span
          key={out.length}
          className={bufShake ? 'shop-shake' : undefined}
          style={bufColor ? { color: bufColor } : undefined}
        >{buf}</span>
      );
      buf = '';
    };
    for (const t of currentPage) {
      if (t.kind === 'char') {
        if (charsSeen >= revealed) break;
        if (t.color !== bufColor || (!!t.shake) !== bufShake) {
          flush();
          bufColor = t.color;
          bufShake = !!t.shake;
        }
        buf += t.ch;
        charsSeen++;
      } else if (t.kind === 'newline') {
        flush();
        out.push(<br key={out.length} />);
      }
    }
    flush();
    return out;
  }, [currentPage, revealed]);

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
          paddingBottom: isLandscape ? 'clamp(8px, 1.5vh, 16px)' : 'clamp(16px, 3vh, 32px)',
        }}
        onClick={advanceOrSkip}
      >
        {showContent && (
          <div className="flex flex-col items-center px-4 max-w-2xl w-full">
            <SpriteAnimator
              key={spriteMode}
              config={activeSpriteConfig}
              style={{
                height: isLandscape
                  ? 'clamp(300px, 70vh, 460px)'
                  : 'clamp(340px, 58vh, 500px)',
                aspectRatio: `${activeSpriteConfig.frameWidth} / ${activeSpriteConfig.frameHeight}`,
                filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.75))',
                opacity: showContent ? 1 : 0,
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 500ms ease-out 200ms',
                pointerEvents: 'none',
                position: 'relative',
                zIndex: 1,
              }}
            />

            {/* Dialog box */}
            <div
              className="w-full"
              style={{
                background: '#000',
                border: '5px solid #fff',
                borderRadius: 0,
                padding: '16px 22px',
                minHeight: 130,
                marginTop: isLandscape
                  ? 'clamp(-140px, -22vh, -80px)'
                  : 'clamp(-160px, -18vh, -100px)',
                boxShadow:
                  'inset 0 0 0 3px #000, 0 0 0 3px rgba(255,255,255,0.18), 0 10px 28px rgba(0,0,0,0.65)',
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                opacity: phase === 'idle' ? 1 : 0,
                transition: 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1) 320ms, opacity 450ms ease-out 320ms',
                display: 'flex',
                gap: 18,
                alignItems: 'flex-start',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {/* Dialog text (left) */}
              <div className="flex-1 min-w-0 relative">
                <p
                  style={{
                    color: '#fff',
                    fontSize: 'clamp(14px, 2vw, 18px)',
                    lineHeight: 1.5,
                    minHeight: '3.0em',
                    margin: 0,
                    letterSpacing: '0.03em',
                  }}
                >
                  {renderedNodes}
                  {!isPageDone && <span className="shop-cursor">▎</span>}
                </p>

                {/* Page advance indicator (▼) — appears when current page is
                    fully revealed but more pages remain. */}
                {isPageDone && !isLastPage && (
                  <div className="shop-page-advance" aria-hidden>▼</div>
                )}
              </div>

              {/* Choices (right) — only on last page once revealed */}
              {showChoices && (
                <div
                  className="flex-shrink-0 flex flex-col gap-1"
                  style={{ minWidth: 'clamp(120px, 20vw, 160px)' }}
                >
                  {scene.choices.map((c, i) => (
                    <UndertaleButton
                      key={`${sceneId}:${i}:${c.label}`}
                      label={c.label}
                      selected={selectedChoice === i}
                      onHover={() => { if (selectedChoice !== i) { setSelectedChoice(i); playSelect(); } }}
                      onClick={(e) => { e.stopPropagation(); pickChoice(i); }}
                    />
                  ))}
                </div>
              )}
            </div>

            <p
              className="text-white/45 text-[10px] sm:text-xs select-none mt-2"
              style={{ letterSpacing: '0.08em' }}
            >
              [ ↑↓ ] NAVEGAR &nbsp;·&nbsp; [ Z / ENTER ] CONFIRMAR &nbsp;·&nbsp; [ ESC ] FECHAR
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
        @keyframes shopShake {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-1px, 1px); }
          50%      { transform: translate(1px, -1px); }
          75%      { transform: translate(-1px, -1px); }
        }
        @keyframes shopAdvanceBob {
          0%, 100% { transform: translateY(0); opacity: 0.85; }
          50%      { transform: translateY(3px); opacity: 1; }
        }
        .shop-cursor {
          display: inline-block;
          margin-left: 1px;
          color: #fff;
          animation: undertaleBlink 600ms steps(1) infinite;
        }
        .shop-shake {
          display: inline-block;
          animation: shopShake 80ms infinite;
        }
        .shop-page-advance {
          position: absolute;
          right: 0;
          bottom: -4px;
          color: #FFD54F;
          font-size: clamp(14px, 1.8vw, 18px);
          line-height: 1;
          animation: shopAdvanceBob 700ms ease-in-out infinite;
          text-shadow: 0 0 6px rgba(255,213,79,0.5);
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
          content: '♥';
          position: absolute;
          left: 4px;
          color: #FF4747;
          opacity: 0;
          transition: opacity 80ms ease;
          text-shadow: 0 0 6px rgba(255,71,71,0.6);
        }
        .undertale-btn[data-selected="true"] {
          color: #FFD54F;
          outline: 0;
        }
        .undertale-btn[data-selected="true"]::before {
          opacity: 1;
        }
        .undertale-btn:focus-visible {
          color: #FFD54F;
          outline: 0;
        }
      `}</style>
    </div>
  );
};

// ─── Undertale-style button — heart cursor on selected ────────────────────
const UndertaleButton: React.FC<{
  label: string;
  selected: boolean;
  onHover: () => void;
  onClick: (e: React.MouseEvent) => void;
}> = ({ label, selected, onHover, onClick }) => (
  <button
    type="button"
    className="undertale-btn"
    data-selected={selected}
    onMouseEnter={onHover}
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
