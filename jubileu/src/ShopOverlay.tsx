import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  BELLHOP_MOTIONS,
  SHOP_VFX_MOTIONS,
  shopBackdrop,
  type BellhopMotion,
  type ShopVfxMotion,
} from './shop-sprite-assets';
import { SpriteAnimator } from './SpriteEngine';
import { playDoorbell, playBeep, playSelect, playConfirm, createLobbyMusic } from './shop-audio';
import { tokenize, splitPages, charCount, type Token } from './dialogue-engine';
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
  /** Scene id to start at — defaults to ROOT_SCENE ('main'). The post-death
   *  trigger passes 'post_death' so the recepcionista opens the conversation
   *  himself when the player respawns from the chase. */
  initialScene?: string;
  /** Fired when a choice with a side-effect action is picked. The shop only
   *  reports the action — the App decides what to do (add to inventory,
   *  play pickup animation, etc.). */
  onBuyItem?: (itemId: 'flashlight' | 'cookie') => void;
}

const TIMINGS = {
  closing: 700,
  arrived: 360,
  opening: 700,
  exitClose: 600,
  charDelay: 28,
};

const ITEM_META: Record<string, { icon: string; hint: string }> = {
  buy_flashlight: { icon: '⌁', hint: 'clareia o que não chegou' },
  buy_cookie: { icon: '●', hint: 'fresco até ser esquecido' },
  buy_coffee: { icon: '♨', hint: 'quente, mesmo vazio' },
  buy_key: { icon: '⚿', hint: 'para uma porta específica' },
  buy_floor: { icon: '▲', hint: 'preço proporcional' },
  buy_memory: { icon: '✦', hint: 'o logo muda sozinho' },
};

export const ShopOverlay: React.FC<ShopOverlayProps> = ({ open, onClose, initialScene = ROOT_SCENE, onBuyItem }) => {
  const [sceneId, setSceneId] = useState<string>(initialScene);
  const [pageIndex, setPageIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<Phase>('closing');
  const [selectedChoice, setSelectedChoice] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [purchaseAnimationDone, setPurchaseAnimationDone] = useState(true);

  const typingRef = useRef<number | null>(null);
  const phaseTimersRef = useRef<number[]>([]);
  const mountedRef = useRef(false);
  const musicRef = useRef<ReturnType<typeof createLobbyMusic> | null>(null);
  const charCountRef = useRef(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  const scene = SHOP_SCENES[sceneId] ?? SHOP_SCENES[ROOT_SCENE];
  const pages = useMemo(() => splitPages(tokenize(scene.text)), [scene.text]);
  const currentPage: Token[] = pages[pageIndex] ?? [];
  const pageCharTotal = useMemo(() => charCount(currentPage), [currentPage]);
  const isPageDone = revealed >= pageCharTotal;
  const isLastPage = pageIndex >= pages.length - 1;
  const showChoices = isPageDone && isLastPage;

  // Direct CSS-variable updates keep parallax off React's render path. Mouse
  // movement therefore stays cheap; touch input is ignored so scrolling and
  // taps never fight the scene.
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const element = overlayRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2;
    element.style.setProperty('--shop-far-x', `${(-x * 8).toFixed(2)}px`);
    element.style.setProperty('--shop-far-y', `${(-y * 5).toFixed(2)}px`);
    element.style.setProperty('--shop-near-x', `${(x * 13).toFixed(2)}px`);
    element.style.setProperty('--shop-near-y', `${(y * 8).toFixed(2)}px`);
  }, []);

  const resetParallax = useCallback(() => {
    const element = overlayRef.current;
    if (!element) return;
    element.style.setProperty('--shop-far-x', '0px');
    element.style.setProperty('--shop-far-y', '0px');
    element.style.setProperty('--shop-near-x', '0px');
    element.style.setProperty('--shop-near-y', '0px');
  }, []);

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
      // B2: stop music + null out ref so a re-open re-creates it cleanly.
      musicRef.current?.stop();
      musicRef.current = null;
      return;
    }
    // B1: re-opening without first unmounting — wipe any stragglers.
    clearPhaseTimers();
    clearTyping();
    mountedRef.current = true;
    setSceneId(initialScene);
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

  // Reset typewriter when scene/page changes (only while idle).
  // B4: charCountRef is what drives the per-3-chars beep cadence; resetting
  // it on scene/page change keeps beeps in sync with each new line.
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    setRevealed(0);
    charCountRef.current = 0;
  }, [sceneId, pageIndex, open, phase]);

  // Reset selected choice when scene changes
  useEffect(() => {
    setSelectedChoice(0);
  }, [sceneId]);

  // The delivery performance is a one-shot. Once the tray/gift reaches its
  // final pose, hand control back to TALK/IDLE instead of freezing the final
  // drawing for every remaining dialogue page.
  useEffect(() => {
    if (!sceneId.startsWith('buy_')) {
      setPurchaseAnimationDone(true);
      return;
    }
    setPurchaseAnimationDone(false);
    const timer = window.setTimeout(
      () => setPurchaseAnimationDone(true),
      BELLHOP_MOTIONS.service.cycleMs,
    );
    return () => window.clearTimeout(timer);
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
    // B3: depend on stable `pages` + `pageIndex` (memoised) instead of
    // `currentPage` (fresh array fallback when pageIndex out of range).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, pages, pageIndex, pageCharTotal, phase, open]);

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
    // Side-effect first: fire buy action so the App can add to inventory
    // and trigger the pickup animation before the scene transition.
    if (choice.action === 'buy_flashlight') onBuyItem?.('flashlight');
    else if (choice.action === 'buy_cookie') onBuyItem?.('cookie');
    if (choice.goto === CLOSE_SCENE) { close(); return; }
    setSceneId(choice.goto);
    setPageIndex(0);
    setRevealed(0);
  }, [showChoices, scene.choices, close, onBuyItem]);

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

  // ── Render the visible portion of the current page ────────────────────
  // IMPORTANT: this useMemo must run on EVERY render (Rules of Hooks),
  // including when `open` is false. Do not move it past an early return.
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

  // ── Animation direction ───────────────────────────────────────────────
  // A purchase is a complete one-shot performance. Ordinary speech uses
  // the 16-pose talk atlas only while characters are appearing; finished
  // pages settle into the scene's authored emotion instead of looping a
  // generic mouth flap forever.
  const isPurchaseScene = sceneId.startsWith('buy_');
  let spriteMotion: BellhopMotion = 'idle';
  if (isPurchaseScene && !purchaseAnimationDone) spriteMotion = 'service';
  else if (phase === 'idle' && !isPageDone) spriteMotion = 'talk';
  else if (sceneId.startsWith('post_death') && scene.mood === 'concerned') spriteMotion = 'glitch';
  else if (scene.mood === 'wink') spriteMotion = 'wink';
  else if (scene.mood === 'sweat') spriteMotion = 'sweat';
  else if (scene.mood === 'concerned') spriteMotion = 'concerned';

  const activeSpriteConfig = BELLHOP_MOTIONS[spriteMotion];
  const actionVfx: Exclude<ShopVfxMotion, 'ambient'> | null = isPurchaseScene
    ? 'purchase'
    : sceneId.startsWith('post_death')
      ? 'glitch'
      : sceneId === 'buy'
        ? 'bell'
        : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-[80] overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetParallax}
      style={{
        fontFamily: '"Determination Mono", "Courier New", monospace',
        backgroundColor: '#000',
      }}
    >
      {/* Far plane: generated specifically for the reception shop. A parent
          handles pointer parallax while the child breathes independently, so
          the two transforms never fight each other. */}
      <div
        className="shop-backdrop-parallax absolute inset-0"
        style={{
          opacity: contentOpacity,
          transform: `translate3d(var(--shop-far-x, 0px), var(--shop-far-y, 0px), 0) scale(${phase === 'idle' ? 1.035 : 1.08})`,
          transition: 'opacity 600ms ease-out, transform 1400ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
        }}
      >
        <div
          className="shop-backdrop-art absolute inset-[-3%]"
          style={{ backgroundImage: `url(${shopBackdrop})` }}
        />
      </div>

      {/* Near plane: soft foreground shapes move in the opposite direction.
          The tiny displacement is enough to suggest depth without motion
          sickness on a phone. */}
      <div
        className="shop-near-plane absolute inset-[-2%] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 110%, rgba(10,0,0,0) 25%, rgba(4,0,0,0.72) 74%), linear-gradient(90deg, rgba(0,0,0,0.62), transparent 18%, transparent 82%, rgba(0,0,0,0.62))',
          opacity: contentOpacity,
          transform: 'translate3d(var(--shop-near-x, 0px), var(--shop-near-y, 0px), 0)',
          transition: 'opacity 600ms ease-out, transform 220ms ease-out',
        }}
      />

      <div className="shop-vignette absolute inset-0 pointer-events-none" />

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
          ✦ RECEPÇÃO NOTURNA ✦
        </div>
      </div>

      {phase === 'idle' && (
        <button
          type="button"
          className="shop-close"
          aria-label="Fechar a loja"
          onClick={(event) => { event.stopPropagation(); close(); }}
        >
          ×
        </button>
      )}

      {/* Shop content (sprite + dialog) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          opacity: contentOpacity,
          transition: 'opacity 500ms ease-out',
          pointerEvents: showContent ? 'auto' : 'none',
          zIndex: 3,
        }}
        onClick={advanceOrSkip}
      >
        {showContent && (
          <div className="shop-stage" data-landscape={isLandscape}>
            <div className="shop-character-stage" aria-hidden>
              <SpriteAnimator
                config={SHOP_VFX_MOTIONS.ambient}
                className="shop-ambient-vfx"
                style={{ pointerEvents: 'none' }}
              />

              <SpriteAnimator
                key={`${spriteMotion}:${isPurchaseScene || spriteMotion === 'glitch' ? sceneId : ''}`}
                config={activeSpriteConfig}
                className="shop-character"
                style={{
                  filter: 'drop-shadow(0 18px 28px rgba(0,0,0,0.78))',
                  opacity: showContent ? 1 : 0,
                  transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                  transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 500ms ease-out 200ms',
                  pointerEvents: 'none',
                }}
              />

              {actionVfx && (
                <SpriteAnimator
                  key={`${actionVfx}:${sceneId}`}
                  config={SHOP_VFX_MOTIONS[actionVfx]}
                  className="shop-action-vfx"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </div>

            <div
              className="shop-interface"
              style={{
                transform: phase === 'idle' ? 'translateY(0)' : 'translateY(20px)',
                opacity: phase === 'idle' ? 1 : 0,
                transition: 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1) 320ms, opacity 450ms ease-out 320ms',
              }}
            >
              <div className="shop-scene-ribbon" aria-hidden>
                <span>{sceneId === 'buy' ? 'CATÁLOGO DO SAGUÃO' : isPurchaseScene ? 'SERVIÇO DE QUARTO' : 'ATENDIMENTO'}</span>
                <span>{String(pageIndex + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}</span>
              </div>

              <div
                className="shop-dialog-panel"
                data-has-choices={showChoices}
                data-catalog={sceneId === 'buy'}
              >
                <div className="shop-dialog-copy">
                  <p>
                    {renderedNodes}
                    {!isPageDone && <span className="shop-cursor">▎</span>}
                  </p>

                  {isPageDone && !isLastPage && (
                    <div className="shop-page-advance" aria-hidden>▼</div>
                  )}
                </div>

                <div className="shop-choice-list">
                  {showChoices && scene.choices.map((choice, index) => {
                    const meta = ITEM_META[choice.goto];
                    return (
                      <UndertaleButton
                        key={`${sceneId}:${index}:${choice.label}`}
                        label={choice.label}
                        icon={meta?.icon}
                        hint={meta?.hint}
                        catalog={sceneId === 'buy'}
                        selected={selectedChoice === index}
                        onHover={() => {
                          if (selectedChoice !== index) {
                            setSelectedChoice(index);
                            playSelect();
                          }
                        }}
                        onClick={(event) => { event.stopPropagation(); pickChoice(index); }}
                      />
                    );
                  })}
                </div>
              </div>

              <p className="shop-controls select-none">
                <span className="shop-desktop-controls">[ ↑↓ ] NAVEGAR · [ Z / ENTER ] CONFIRMAR · [ ESC ] FECHAR</span>
                <span className="shop-touch-controls">TOQUE PARA AVANÇAR · ESCOLHA UMA OPÇÃO</span>
              </p>
            </div>
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
        @keyframes shopBackdropBreath {
          0%   { transform: scale(1.01) translate3d(-0.25%, 0, 0); filter: brightness(0.58) saturate(0.76); }
          50%  { transform: scale(1.025) translate3d(0, -0.35%, 0); filter: brightness(0.64) saturate(0.84); }
          100% { transform: scale(1.015) translate3d(0.25%, 0, 0); filter: brightness(0.6) saturate(0.79); }
        }
        @keyframes shopAmbientOrbit {
          0%, 100% { transform: translate3d(-2%, 2%, 0) rotate(-1deg) scale(0.98); opacity: 0.32; }
          50%      { transform: translate3d(3%, -3%, 0) rotate(1deg) scale(1.04); opacity: 0.7; }
        }
        @keyframes shopRibbonPulse {
          0%, 100% { box-shadow: 0 0 0 rgba(255,199,73,0); }
          50%      { box-shadow: 0 0 20px rgba(255,199,73,0.12); }
        }

        .shop-backdrop-art {
          background-size: cover;
          background-position: center 48%;
          image-rendering: pixelated;
          animation: shopBackdropBreath 12s ease-in-out infinite alternate;
          will-change: transform, filter;
        }
        .shop-vignette {
          z-index: 1;
          background:
            radial-gradient(ellipse at 50% 42%, rgba(255,178,72,0.075) 0%, rgba(17,3,3,0.25) 45%, rgba(0,0,0,0.88) 100%),
            linear-gradient(180deg, rgba(0,0,0,0.34), transparent 24%, transparent 78%, rgba(0,0,0,0.72));
        }
        .shop-close {
          position: absolute;
          z-index: 7;
          top: max(14px, env(safe-area-inset-top));
          right: max(14px, env(safe-area-inset-right));
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,213,79,0.55);
          border-radius: 999px;
          background: rgba(8,4,4,0.76);
          color: #FFD54F;
          font: 30px/1 system-ui, sans-serif;
          cursor: pointer;
          box-shadow: inset 0 0 12px rgba(255,197,60,0.08), 0 8px 26px rgba(0,0,0,0.42);
          -webkit-tap-highlight-color: transparent;
          transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }
        .shop-close:hover,
        .shop-close:focus-visible {
          transform: scale(1.07) rotate(4deg);
          background: rgba(70,15,12,0.92);
          box-shadow: 0 0 20px rgba(255,197,60,0.2);
          outline: 2px solid #FFD54F;
          outline-offset: 2px;
        }
        .shop-stage {
          width: min(100%, 1120px);
          height: 100%;
          margin: 0 auto;
          padding: clamp(68px, 10dvh, 106px) 12px max(8px, env(safe-area-inset-bottom));
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
        }
        .shop-character-stage {
          position: relative;
          width: min(94vw, 520px);
          height: min(52dvh, 500px);
          min-height: 180px;
          flex: 1 1 auto;
          display: grid;
          place-items: end center;
          transform: translate3d(var(--shop-near-x, 0px), var(--shop-near-y, 0px), 0);
          transition: transform 220ms ease-out;
          z-index: 1;
        }
        .shop-character {
          position: relative;
          z-index: 2;
          display: block;
          width: min(92vw, 480px);
          height: auto;
          max-height: 100%;
          aspect-ratio: 1;
          image-rendering: pixelated;
        }
        .shop-ambient-vfx,
        .shop-action-vfx {
          position: absolute;
          inset: 50% auto auto 50%;
          width: min(72%, 350px);
          height: auto;
          aspect-ratio: 1;
          transform: translate(-50%, -50%);
          image-rendering: pixelated;
          mix-blend-mode: screen;
        }
        .shop-ambient-vfx {
          z-index: 1;
          animation: shopAmbientOrbit 7s ease-in-out infinite;
          opacity: 0.55;
        }
        .shop-action-vfx {
          z-index: 3;
          width: min(78%, 390px);
          filter: drop-shadow(0 0 18px rgba(255,213,79,0.48));
        }
        .shop-interface {
          position: relative;
          z-index: 4;
          width: min(94vw, 760px);
          margin-top: clamp(-108px, -10dvh, -66px);
        }
        .shop-scene-ribbon {
          min-height: 30px;
          margin: 0 12px -2px;
          padding: 7px 13px 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          color: #F9D47A;
          background: linear-gradient(180deg, rgba(60,18,13,0.97), rgba(17,6,5,0.97));
          border: 1px solid rgba(212,156,53,0.68);
          border-bottom: 0;
          border-radius: 10px 10px 0 0;
          font-size: clamp(9px, 1.4vw, 11px);
          letter-spacing: 0.17em;
          animation: shopRibbonPulse 4s ease-in-out infinite;
        }
        .shop-dialog-panel {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
          min-height: clamp(190px, 31dvh, 300px);
          max-height: min(45dvh, 410px);
          overflow: hidden;
          box-sizing: border-box;
          padding: clamp(13px, 2.2vw, 20px);
          background:
            linear-gradient(135deg, rgba(255,213,79,0.035), transparent 38%),
            rgba(2,2,4,0.965);
          border: 4px solid #fff;
          border-radius: 4px;
          box-shadow:
            inset 0 0 0 3px #000,
            inset 0 0 36px rgba(138,25,18,0.08),
            0 0 0 2px rgba(255,255,255,0.14),
            0 16px 34px rgba(0,0,0,0.72);
        }
        .shop-dialog-copy {
          position: relative;
          min-width: 0;
          min-height: 88px;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #805D24 transparent;
          padding: 1px 4px 8px 1px;
        }
        .shop-dialog-copy p {
          color: #fff;
          font-size: clamp(13px, 1.65vw, 16px);
          line-height: 1.48;
          letter-spacing: 0.02em;
          margin: 0;
        }
        .shop-choice-list {
          min-width: 0;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #805D24 transparent;
          padding-top: 9px;
          border-top: 1px solid rgba(255,213,79,0.18);
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          align-content: start;
          gap: 4px;
        }
        .shop-choice-list:empty {
          display: none;
        }
        .shop-dialog-panel[data-catalog="true"] .shop-choice-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .shop-controls {
          margin: 7px 0 0;
          color: rgba(255,255,255,0.5);
          text-align: center;
          font-size: clamp(9px, 1.3vw, 11px);
          letter-spacing: 0.07em;
        }
        .shop-touch-controls { display: none; }
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
          right: 6px;
          bottom: 1px;
          color: #FFD54F;
          font-size: clamp(14px, 1.8vw, 18px);
          line-height: 1;
          animation: shopAdvanceBob 700ms ease-in-out infinite;
          text-shadow: 0 0 6px rgba(255,213,79,0.5);
        }
        .undertale-btn {
          width: 100%;
          min-height: 44px;
          background: rgba(255,255,255,0.015);
          border: 1px solid transparent;
          border-radius: 4px;
          padding: 6px 7px 6px 27px;
          color: #fff;
          font-family: "Determination Mono", "Courier New", monospace;
          font-size: clamp(11px, 1.45vw, 14px);
          letter-spacing: 0.02em;
          cursor: pointer;
          position: relative;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 7px;
          transition: color 100ms ease, background 140ms ease, border-color 140ms ease, transform 140ms ease;
          line-height: 1.35;
          white-space: normal;
          word-wrap: break-word;
          flex-shrink: 0;
        }
        .undertale-btn::before {
          content: '♥';
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: #FF0000;
          font-size: 0.9em;
          opacity: 0;
          transition: opacity 80ms ease;
        }
        .undertale-btn[data-selected="true"] {
          color: #FFD54F;
          outline: 0;
          background: rgba(255,213,79,0.075);
          border-color: rgba(255,213,79,0.24);
          transform: translateX(2px);
        }
        .undertale-btn[data-selected="true"]::before {
          opacity: 1;
        }
        .undertale-btn:focus-visible {
          color: #FFD54F;
          outline: 2px solid rgba(255,213,79,0.7);
          outline-offset: -2px;
        }
        .undertale-btn[data-catalog="true"] {
          min-height: 58px;
          padding-left: 25px;
          background: linear-gradient(135deg, rgba(255,213,79,0.055), rgba(87,15,12,0.09));
          border-color: rgba(255,255,255,0.07);
        }
        .shop-item-icon {
          flex: 0 0 25px;
          display: grid;
          place-items: center;
          color: #FFD54F;
          font-size: 22px;
          text-shadow: 0 0 10px rgba(255,213,79,0.35);
        }
        .shop-choice-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .shop-choice-copy small {
          color: rgba(255,255,255,0.42);
          font-size: 0.72em;
          line-height: 1.2;
          letter-spacing: 0;
        }

        @media (orientation: landscape) {
          .shop-stage {
            flex-direction: row;
            align-items: flex-end;
            justify-content: center;
            gap: 0;
            padding: clamp(54px, 13dvh, 82px) 18px max(8px, env(safe-area-inset-bottom));
          }
          .shop-character-stage {
            flex: 0 1 500px;
            width: min(47vw, 500px);
            height: min(79dvh, 500px);
          }
          .shop-character {
            width: 100%;
          }
          .shop-interface {
            flex: 0 1 700px;
            width: min(59vw, 700px);
            margin: 0 0 0 -5vw;
          }
          .shop-dialog-panel {
            min-height: clamp(205px, 52dvh, 350px);
            max-height: 66dvh;
          }
          .shop-dialog-panel[data-has-choices="true"] {
            grid-template-columns: minmax(0, 1.05fr) minmax(170px, 0.95fr);
          }
          .shop-dialog-panel[data-has-choices="true"] .shop-choice-list {
            padding: 0 0 0 10px;
            border-top: 0;
            border-left: 1px solid rgba(255,213,79,0.18);
          }
        }

        @media (max-width: 640px) and (orientation: portrait) {
          .shop-stage { padding-left: 8px; padding-right: 8px; }
          .shop-interface { width: min(96vw, 760px); }
          .shop-scene-ribbon { margin-inline: 8px; }
          .shop-dialog-panel { border-width: 3px; }
          .shop-close { top: max(64px, calc(env(safe-area-inset-top) + 54px)); }
          .shop-desktop-controls { display: none; }
          .shop-touch-controls { display: inline; }
        }

        @media (max-height: 520px) and (orientation: landscape) {
          .shop-stage { padding-top: 48px; }
          .shop-scene-ribbon { min-height: 24px; padding-block: 5px; }
          .shop-dialog-panel { min-height: 190px; max-height: 68dvh; padding: 11px; }
          .shop-dialog-copy p { font-size: 12px; line-height: 1.38; }
          .undertale-btn { min-height: 38px; padding-block: 4px; }
          .shop-controls { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .shop-backdrop-art,
          .shop-ambient-vfx,
          .shop-scene-ribbon,
          .shop-page-advance,
          .shop-shake {
            animation: none !important;
          }
          .shop-backdrop-parallax,
          .shop-near-plane,
          .shop-character-stage {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
};

// ─── Undertale-style button — heart cursor on selected ────────────────────
// onPointerEnter (not onMouseEnter) so touch + stylus also trigger hover.
const UndertaleButton: React.FC<{
  label: string;
  icon?: string;
  hint?: string;
  catalog?: boolean;
  selected: boolean;
  onHover: () => void;
  onClick: (e: React.MouseEvent) => void;
}> = ({ label, icon, hint, catalog = false, selected, onHover, onClick }) => (
  <button
    type="button"
    className="undertale-btn"
    data-selected={selected}
    data-catalog={catalog}
    onPointerEnter={onHover}
    onFocus={onHover}
    onClick={onClick}
  >
    {icon && <span className="shop-item-icon" aria-hidden>{icon}</span>}
    <span className="shop-choice-copy">
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </span>
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

  // B6: when the doors are off-screen we make them transparent to events
  // so taps near the edge fall through to the dialog buttons below.
  const interactive = state !== 'open';

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
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    />
  );
};
