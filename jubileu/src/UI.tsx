import React, { useState, useEffect, useRef } from 'react';

import { DIALOGUE_TREE, BARNEY_URL } from './constants';

export const VisualJoystick = ({ x, y, active, origin }: { x: number; y: number; active: boolean; origin: { x: number; y: number } | null }) => {
  if (!active || !origin) return null;
  // Tighter max radius and smaller base on small screens — w-32 (128px) was
  // crowding the edge on 360px portrait phones.
  const maxR = 36; const px = x * maxR; const py = y * maxR;
  return (
    <div className="absolute pointer-events-none z-50" style={{ left: origin.x, top: origin.y, transform: 'translate(-50%, -50%)' }}>
      <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-full bg-white/10 ring-2 ring-white/20 backdrop-blur-sm flex items-center justify-center">
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/80 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)]" style={{ transform: `translate(${px}px, ${py}px)` }} />
      </div>
    </div>
  );
};

export const TypewriterText = ({ text, speed = 30, voicePitch = 440 }: { text: string; speed?: number; voicePitch?: number }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const bipIndexRef = useRef(0);
  
  const playBip = () => {
      try {
          const ctx = (window as any).__jubileuAudioCtx as AudioContext | undefined;
          if (!ctx || ctx.state !== 'running') return;
          const t = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          // Slight pitch variation per character for more organic feel
          const jitter = voicePitch * (0.98 + Math.random() * 0.04);
          osc.frequency.setValueAtTime(jitter, t);
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.06);
      } catch { /* audio not available */ }
  };

  useEffect(() => {
    setDisplayedText('');
    setIsComplete(false);
    bipIndexRef.current = 0;
    let index = 0;
    const timer = setInterval(() => {
      const prev = index;
      index = Math.min(index + 3, text.length);
      setDisplayedText(text.substring(0, index));
      // Play bip every 2 characters (skip spaces/punctuation)
      const chunk = text.substring(prev, index);
      if (chunk && !/^[\s.,!?;:—\-]+$/.test(chunk)) {
          playBip();
      }
      if (index >= text.length) {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, voicePitch]);
  
  return (
    <span>
      {displayedText}
      {!isComplete && <span className="inline-block w-0.5 h-5 md:h-7 bg-yellow-400 ml-1 animate-pulse" />}
    </span>
  );
};

interface DialogueOption {
  text: string;
  next: string | null;
}

interface DialogueNode {
  text: string;
  options: DialogueOption[];
}

export const DialogueOverlay = ({ nodeKey, onOptionSelect, onClose }: { nodeKey: string; onOptionSelect: (next: string) => void; onClose: () => void }) => {
  const node: DialogueNode | undefined = DIALOGUE_TREE[nodeKey];
  const [showOptions, setShowOptions] = useState(false);
  
  useEffect(() => {
    setShowOptions(false);
    const timer = setTimeout(() => setShowOptions(true), 800);
    return () => clearTimeout(timer);
  }, [nodeKey]);
  
  if (!node) return null;

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-end"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 4px)', paddingRight: 'calc(env(safe-area-inset-right, 0px) + 4px)' }}
    >
      <div className="absolute top-0 left-0 right-0 h-12 md:h-16 bg-gradient-to-b from-black to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent pointer-events-none" />

      <div className="flex flex-col flex-1 justify-end pb-4 px-3 md:px-[20%] landscape:pb-2 landscape:px-8 max-h-[100dvh] overflow-hidden">

        {/* Dialogue Text Box */}
        <div className="bg-black/80 border-t-2 border-yellow-500/50 p-3 sm:p-4 md:p-6 shadow-2xl pointer-events-auto mb-2 sm:mb-4 rounded-t-xl landscape:mb-2">
          <p className="text-white text-sm sm:text-base font-bold font-serif leading-snug sm:leading-relaxed min-h-[2rem] sm:min-h-[4rem] text-shadow-sm">
            <TypewriterText text={node.text} speed={30} voicePitch={330} />
          </p>
        </div>

        {/* Options — capped to 40vh on portrait so they don't push above the
            text box on tall content; 60vh in landscape where vertical room
            is the bottleneck. */}
        <div className={`flex flex-col gap-2 mb-3 pointer-events-auto transition-all duration-500 overflow-y-auto max-h-[35vh] sm:max-h-[50vh] landscape:max-h-[55vh] scrollbar-hide ${showOptions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {node.options.map((opt: any, i: number) => (
            <button key={i} onClick={() => opt.next ? onOptionSelect(opt.next) : onClose()} className={`group relative w-full text-left overflow-hidden animate-fade-in-up stagger-${i + 1} flex-shrink-0`}>
              <div className="relative px-3 py-2.5 sm:py-3 bg-gray-900 ring-1 ring-white/10 hover:ring-amber-500/50 rounded-xl transition-all duration-300 active:scale-[0.98]">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-400 text-[10px] sm:text-xs font-bold group-hover:bg-yellow-500 group-hover:text-black transition-all">
                    {i + 1}
                  </div>
                  <span className="text-gray-200 group-hover:text-white font-medium text-sm sm:text-base flex-1">{opt.text}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
