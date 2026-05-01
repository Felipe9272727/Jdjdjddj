import React, { useEffect, useRef, useState } from 'react';

// ─── Bellhop Shop — Undertale-style overlay ────────────────────────────────
// Sprites are hosted alongside the GLBs/audio on the canonical repo. The
// neutral pose alternates with the talking pose while the dialog text is
// being typed out, giving the impression that the bellhop is speaking.
const BELLHOP_NEUTRAL_URL = 'https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/bellhop-neutral-shop.png';
const BELLHOP_TALK_URL = 'https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/bellhop-talk-shop.png';

type ShopMenu = 'main' | 'talk' | 'bye';

interface ShopOverlayProps {
  open: boolean;
  onClose: () => void;
}

const DIALOGUES: Record<ShopMenu, string> = {
  main: 'Bem-vindo ao The Normal Hotel! Posso te ajudar?',
  talk: 'Tenha uma ótima estadia... e fique calmo se ouvir alguma coisa estranha vindo do andar de cima.',
  bye: 'Volte sempre! O elevador está sempre aberto.',
};

export const ShopOverlay: React.FC<ShopOverlayProps> = ({ open, onClose }) => {
  const [menu, setMenu] = useState<ShopMenu>('main');
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<'enter' | 'idle' | 'exit'>('enter');
  const [talkFrame, setTalkFrame] = useState(false);
  const typingRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  // Reset to entrance state every time we open
  useEffect(() => {
    if (open) {
      setMenu('main');
      setTyped('');
      setPhase('enter');
      mountedRef.current = true;
      const t = window.setTimeout(() => setPhase('idle'), 450);
      return () => window.clearTimeout(t);
    } else {
      mountedRef.current = false;
    }
  }, [open]);

  // Typewriter — paints DIALOGUES[menu] one char at a time
  useEffect(() => {
    if (!open || phase !== 'idle') return;
    setTyped('');
    const text = DIALOGUES[menu];
    let i = 0;
    const tick = () => {
      if (!mountedRef.current) return;
      i += 2; // batch 2 chars per tick — feels Undertale-paced without lag
      setTyped(text.slice(0, i));
      if (i < text.length) {
        typingRef.current = window.setTimeout(tick, 28);
      } else {
        typingRef.current = null;
      }
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

  // Close handler with exit animation
  const close = () => {
    setPhase('exit');
    window.setTimeout(() => onClose(), 300);
  };

  if (!open) return null;

  const isTyping = typed.length < DIALOGUES[menu].length;
  const skipOrAdvance = () => {
    if (isTyping) {
      // Skip typewriter — show full text immediately
      if (typingRef.current !== null) { window.clearTimeout(typingRef.current); typingRef.current = null; }
      setTyped(DIALOGUES[menu]);
    }
  };

  const overlayOpacity = phase === 'enter' ? 0 : phase === 'exit' ? 0 : 1;
  const spriteTranslate = phase === 'enter' ? 'translateY(40px)' : phase === 'exit' ? 'translateY(40px)' : 'translateY(0)';
  const spriteOpacity = phase === 'enter' ? 0 : phase === 'exit' ? 0 : 1;

  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.92)',
        opacity: overlayOpacity,
        transition: 'opacity 350ms ease-out',
        fontFamily: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
      }}
      onClick={skipOrAdvance}
    >
      <div className="flex flex-col items-center gap-4 p-6 max-w-3xl w-full">
        {/* Bellhop sprite */}
        <div
          className="flex justify-center"
          style={{
            transform: spriteTranslate,
            opacity: spriteOpacity,
            transition: 'transform 350ms ease-out, opacity 350ms ease-out',
          }}
        >
          <img
            src={talkFrame ? BELLHOP_TALK_URL : BELLHOP_NEUTRAL_URL}
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
          }}
        >
          <p
            className="text-white text-base leading-relaxed"
            style={{
              fontFamily: '"Determination Mono", "Courier New", monospace',
              fontSize: 'clamp(15px, 2.2vw, 19px)',
              minHeight: '3.6em',
              whiteSpace: 'pre-wrap',
            }}
          >
            {typed}
            {isTyping && <span className="opacity-60">▍</span>}
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
          [ESC] fechar &nbsp;·&nbsp; [Click] avançar
        </p>
      </div>
    </div>
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
