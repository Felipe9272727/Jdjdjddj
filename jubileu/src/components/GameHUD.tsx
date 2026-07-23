import React from 'react';
import { TYPE, MONO, COMPONENT, Z } from '../design-tokens';
import { BARNEY_URL, BARNEY_DIALOGUE } from '../constants';
import { TypewriterText } from '../UI';

/**
 * Elevator status panel — top center HUD showing location, timer, status.
 */
export const ElevatorPanel = ({ currentLevel, elevatorTimer, doorsClosed, arrivalPulse }: any) => (
  <div className="absolute left-1/2 -translate-x-1/2 px-2 max-w-[calc(100%-1rem)] pe-none top-2 landscape:top-1">
    <div className="relative">
      <div className={`absolute -inset-2 rounded-2xl blur-xl transition-opacity duration-500 ${(elevatorTimer !== null && elevatorTimer <= 5) ? 'bg-red-500/40 opacity-100' : arrivalPulse ? 'bg-green-400/50 opacity-100' : 'bg-amber-500/20 opacity-70'}`} />
      <div className="relative bg-gradient-to-b from-black/95 to-black/80 backdrop-blur-xl ring-1 ring-amber-500/40 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        <div className="flex items-stretch divide-x divide-amber-500/20">
          <div className="px-2 sm:px-4 landscape:px-3 py-1.5 sm:py-2.5 landscape:py-2 flex flex-col items-center justify-center min-w-[48px] sm:min-w-[80px] relative">
            <span className="text-amber-500/60 text-[8px] sm:text-[9px] landscape:text-[10px] font-mono uppercase tracking-[0.35em] mb-0.5">{currentLevel === 0 ? 'Location' : 'Floor'}</span>
            {currentLevel === 0 ? (
              <span className="text-amber-300 text-base sm:text-xl landscape:text-xl font-black tracking-widest leading-none" style={{ textShadow: '0 0 20px rgba(251,191,36,0.6)' }}>LOBBY</span>
            ) : (
              <div className="flex items-baseline gap-0.5">
                <span className="text-amber-500/50 text-xs sm:text-sm font-bold">▲</span>
                <span className="text-amber-300 text-2xl sm:text-3xl font-black font-mono leading-none tabular-nums" style={{ textShadow: '0 0 25px rgba(251,191,36,0.7)' }}>{String(currentLevel).padStart(2, '0')}</span>
              </div>
            )}
          </div>
          <div className="px-2 sm:px-4 landscape:px-3 py-1.5 sm:py-2.5 landscape:py-2 flex flex-col items-center justify-center min-w-[60px] sm:min-w-[100px]">
            {elevatorTimer !== null ? (
              <>
                <span className={`text-[8px] font-mono uppercase tracking-[0.35em] mb-0.5 ${(elevatorTimer <= 5 && !doorsClosed) ? 'text-red-400/80' : doorsClosed ? 'text-blue-400/80' : 'text-amber-400/60'}`}>
                  {doorsClosed ? 'Traveling' : (elevatorTimer <= 5 ? 'Closing!' : 'Departing')}
                </span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${(elevatorTimer <= 5 && !doorsClosed) ? 'bg-red-500 animate-ping' : doorsClosed ? 'bg-blue-400' : 'bg-amber-400'}`} />
                  <span className={`text-lg sm:text-2xl landscape:text-2xl font-black font-mono leading-none tabular-nums ${(elevatorTimer <= 5 && !doorsClosed) ? 'text-red-300' : 'text-white'}`} style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}>{String(elevatorTimer).padStart(2, '0')}</span>
                  <span className="text-white/40 text-xs font-mono -mb-0.5">s</span>
                </div>
              </>
            ) : arrivalPulse ? (
              <>
                <span className="text-green-400/80 text-[8px] font-mono uppercase tracking-[0.35em] mb-0.5">Arrived</span>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  <span className="text-green-300 text-base sm:text-lg font-bold leading-none">Ding!</span>
                </div>
              </>
            ) : (
              <>
                <span className="text-amber-400/60 text-[8px] font-mono uppercase tracking-[0.35em] mb-0.5">Status</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400/70 animate-pulse" />
                  <span className="text-amber-100 text-base font-bold tracking-wide leading-none">Ready</span>
                </div>
              </>
            )}
          </div>
        </div>
        {elevatorTimer !== null && (
          <div className="h-1 bg-black/60 overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ease-linear ${doorsClosed ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : elevatorTimer <= 5 ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}`}
              style={{ width: `${doorsClosed ? ((20 - elevatorTimer) / 20) * 100 : ((5 - elevatorTimer) / 5) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  </div>
);

/**
 * Floor reveal overlay — "Now Arriving FLOOR 01"
 */
export const FloorReveal = ({ currentLevel }: any) => (
  <div className="absolute inset-0 z-[45] flex items-center justify-center pointer-events-none px-4">
    <div className="animate-floor-reveal text-center w-full">
      <div className="text-amber-500/70 text-xs sm:text-sm font-mono uppercase tracking-[0.3em] sm:tracking-[0.5em] mb-2 sm:mb-4 text-amber-500/70 animate-fade-in">Now Arriving</div>
      <div className="text-white font-black tracking-wider tabular-nums" style={{ fontSize: 'clamp(2rem, 12vw, 5rem)', textShadow: '0 0 60px rgba(251,191,36,0.8), 0 0 30px rgba(255,255,255,0.4)' }}>FLOOR <span className="text-amber-400">{String(currentLevel).padStart(2, '0')}</span></div>
      <div className="h-[2px] w-32 sm:w-48 mx-auto mt-4 sm:mt-6 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
    </div>
  </div>
);

/**
 * Status banners — "Algo não está certo...", "⚠ CORRA PARA O ELEVADOR ⚠"
 */
export const StatusBanner = ({ gameState, elevatorTimer }: any) => {
  if (gameState === 'indoor_night') {
    return (
      <div className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3 max-w-[calc(100%-1.5rem)] landscape:max-w-[70%] ${elevatorTimer !== null ? 'top-[calc(env(safe-area-inset-top,0px)+100px)] landscape:top-[calc(env(safe-area-inset-top,0px)+64px)]' : 'top-[calc(env(safe-area-inset-top,0px)+72px)] landscape:top-[calc(env(safe-area-inset-top,0px)+48px)]'}`}>
        <div className="bg-red-950/80 ring-1 ring-red-500/40 text-red-200 px-3 sm:px-4 py-2 rounded-lg font-mono text-xs sm:text-sm tracking-wider animate-pulse">Algo não está certo...</div>
      </div>
    );
  }
  if (gameState === 'chase') {
    return (
      <div className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3 max-w-[calc(100%-1.5rem)] landscape:max-w-[70%] ${elevatorTimer !== null ? 'top-[calc(env(safe-area-inset-top,0px)+100px)] landscape:top-[calc(env(safe-area-inset-top,0px)+64px)]' : 'top-[calc(env(safe-area-inset-top,0px)+72px)] landscape:top-[calc(env(safe-area-inset-top,0px)+48px)]'}`}>
        <div className="bg-red-900/90 ring-2 ring-red-500 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-black tracking-[0.15em] sm:tracking-widest text-xs sm:text-base animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.5)] text-center leading-tight">
          ⚠ CORRA PARA O ELEVADOR ⚠
        </div>
      </div>
    );
  }
  return null;
};

/**
 * Survival screen — "VOCÊ SOBREVIVEU"
 */
export const SurvivalScreen = () => (
  <div className="absolute inset-0 z-[70] flex items-center justify-center pointer-events-none bg-black/80 px-6 overflow-hidden">
    <div className="text-center w-full">
      <div className="text-green-400 font-black mb-3 animate-fade-in" style={{ fontSize: 'clamp(1.5rem, 8vw, 3rem)' }}>VOCÊ SOBREVIVEU</div>
      <div className="text-white/60 text-base sm:text-lg font-mono">Por enquanto...</div>
    </div>
  </div>
);

/**
 * Barney dialogue overlay
 */
export const BarneyDialogue = ({ barneyDialogueNode, handleBarneyResponse }: any) => {
  const node = BARNEY_DIALOGUE[barneyDialogueNode];
  if (!node) return null;
  return (
    <div className="absolute inset-0 z-[55] flex items-end justify-center pointer-events-auto landscape:items-center landscape:py-4 overflow-y-auto" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)' }}>
      <div className="w-full max-w-2xl mx-4 mb-6 landscape:mb-0 relative animate-barney-dialogue flex-shrink-0">
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-pink-500/40 to-purple-500/40 rounded-2xl blur-lg barney-glow" />
        <div className="relative bg-[#0d0411]/98 border-2 border-purple-500/50 rounded-xl p-3 sm:p-4 shadow-2xl">
          <div className="flex items-start gap-3 sm:gap-4 flex-col landscape:flex-row sm:flex-row">
            <div className="flex items-center gap-3 sm:hidden landscape:hidden w-full border-b border-white/5 pb-2 mb-1">
              <div className="w-12 h-12 flex-shrink-0 bg-transparent rounded-none overflow-hidden">
                <img src={BARNEY_URL} className="w-full h-full object-contain object-top animate-barney-bounce" alt="" />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <div className="text-purple-300 text-[11px] font-bold tracking-[0.3em] uppercase">Barney</div>
              </div>
            </div>
            <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-transparent rounded-none overflow-hidden self-center sm:self-start hidden sm:block landscape:block">
              <img src={BARNEY_URL} className="w-full h-full object-contain object-top animate-barney-bounce" alt="" />
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="hidden sm:flex landscape:flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <div className="text-purple-300 text-[11px] font-bold tracking-[0.3em] uppercase">Barney</div>
              </div>
              <div className="text-white/95 text-sm sm:text-base leading-relaxed mb-3 sm:mb-4 font-serif min-h-[2rem] sm:min-h-[3rem] landscape:min-h-0">
                <TypewriterText text={node.text} speed={28} />
              </div>
              <div className="flex flex-col gap-2 max-h-[30vh] landscape:max-h-[30vh] overflow-y-auto scrollbar-hide pr-1">
                {node.options.map((opt: any, i: number) => (
                  <button key={i} onClick={() => handleBarneyResponse(opt.next)} className="group text-left bg-black/50 hover:bg-purple-900/70 border border-purple-500/30 hover:border-purple-400/70 text-white/70 hover:text-white px-3 py-2.5 rounded-lg text-sm sm:text-base transition-all active:scale-[0.98] flex items-center gap-2 flex-shrink-0">
                    <span className="text-purple-400/60 group-hover:text-purple-300 transition-colors">▸</span>
                    <span className="flex-1">{opt.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Action button — ABRIR PORTA / FALAR / DORMIR
 */
export const ActionButton = ({ onClick, icon, label, color = 'amber' }: any) => {
  const colors: Record<string, string> = {
    amber: 'from-amber-400 to-yellow-300 bg-white text-black ring-amber-200',
    yellow: 'from-yellow-400 via-amber-300 to-yellow-400 bg-gradient-to-b from-yellow-300 to-amber-400 text-black ring-yellow-200',
    blue: 'from-blue-400 to-indigo-400 bg-gradient-to-b from-slate-200 to-slate-300 text-slate-900 ring-blue-200',
  };
  const c = colors[color] || colors.amber;
  const [gradient, btnBg, textColor, ring] = c.split(' ');
  return (
    <div className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-auto bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] landscape:bottom-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      <button onClick={onClick} className="group relative tap-target">
        <div className={`absolute -inset-1 bg-gradient-to-r ${gradient} rounded-full blur-md opacity-70 group-hover:opacity-100 animate-pulse`} />
        <div className={`relative ${btnBg === 'bg-white' ? 'bg-white' : btnBg} ${textColor} px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-full font-black tracking-wider shadow-2xl active:scale-95 transition-transform flex items-center gap-2 ring-2 ${ring} text-xs sm:text-base`}>
          {icon}
          {label}
        </div>
      </button>
    </div>
  );
};
