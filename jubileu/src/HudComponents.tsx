import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BARNEY_URL, BARNEY_DIALOGUE } from './constants';
import { TypewriterText } from './UI';

// ─── Procedural Sound Helpers (Web Audio) ────────────────────────────────
const getAudioCtx = (): AudioContext | undefined => (window as any).__jubileuAudioCtx;

/** Play a dramatic floor arrival sound — deep boom + high chime */
export const playFloorRevealSound = () => {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    // Deep sub-bass boom
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.18, t);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    boom.connect(boomGain).connect(ctx.destination);
    boom.start(t);
    boom.stop(t + 0.8);
    // High chime
    const chime = ctx.createOscillator();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(1200, t + 0.05);
    chime.frequency.exponentialRampToValueAtTime(800, t + 0.5);
    const chimeGain = ctx.createGain();
    chimeGain.gain.setValueAtTime(0, t);
    chimeGain.gain.linearRampToValueAtTime(0.06, t + 0.07);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    chime.connect(chimeGain).connect(ctx.destination);
    chime.start(t + 0.05);
    chime.stop(t + 0.6);
};

/** Heartbeat sound — procedural thump-thump for chase sequences */
export const playHeartbeat = (speed: number = 1.0) => {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const interval = 0.25 / speed;
    for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50 - i * 10, t + i * interval);
        osc.frequency.exponentialRampToValueAtTime(25, t + i * interval + 0.15);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t + i * interval);
        gain.gain.linearRampToValueAtTime(0.15 - i * 0.05, t + i * interval + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * interval + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + i * interval);
        osc.stop(t + i * interval + 0.2);
    }
};

/** Distant thud — eerie impact sound for empty lobby */
export const playDistantThud = () => {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(40, t);
    osc.frequency.exponentialRampToValueAtTime(15, t + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    // Low-pass to make it sound distant
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 120;
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
};

// ─── Elevator Status HUD ──────────────────────────────────────────────────
interface ElevatorHudProps {
  currentLevel: number;
  elevatorTimer: number | null;
  doorsClosed: boolean;
  arrivalPulse: boolean;
}

export const ElevatorHud = React.memo(({ currentLevel, elevatorTimer, doorsClosed, arrivalPulse }: ElevatorHudProps) => (
  <div className="absolute left-1/2 -translate-x-1/2 px-2 max-w-[calc(100%-1rem)] pe-none top-2 landscape:top-1">
    <div className="relative">
      <div className={`absolute -inset-2 rounded-2xl blur-xl transition-opacity duration-500 ${(elevatorTimer !== null && elevatorTimer <= 5) ? 'bg-red-500/40 opacity-100' : arrivalPulse ? 'bg-green-400/50 opacity-100' : 'bg-amber-500/20 opacity-70'}`} />
      <div className="relative bg-gradient-to-b from-black/95 to-black/80 backdrop-blur-xl ring-1 ring-amber-500/40 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        <div className="flex items-stretch divide-x divide-amber-500/20">
          <div className="px-2 sm:px-4 landscape:px-3 py-1.5 sm:py-2.5 landscape:py-2 flex flex-col items-center justify-center min-w-[56px] sm:min-w-[90px] landscape:min-w-[80px] relative">
            <span className="text-amber-500/70 text-[10px] sm:text-xs landscape:text-xs tracking-[0.25em] uppercase mb-0.5">{currentLevel === 0 ? 'Location' : 'Floor'}</span>
            {currentLevel === 0 ? (
              <span className="text-amber-300 text-base sm:text-xl landscape:text-xl font-black tracking-widest leading-none" style={{ textShadow: '0 0 20px rgba(251,191,36,0.6)' }}>LOBBY</span>
            ) : (
              <div className="flex items-baseline gap-0.5">
                <span className="text-amber-500/50 text-xs sm:text-sm font-bold">▲</span>
                <span className="text-amber-300 text-2xl sm:text-3xl font-black font-mono leading-none tabular-nums" style={{ textShadow: '0 0 25px rgba(251,191,36,0.7)' }}>{String(currentLevel).padStart(2, '0')}</span>
              </div>
            )}
          </div>
          <div className="px-2 sm:px-4 landscape:px-3 py-1.5 sm:py-2.5 landscape:py-2 flex flex-col items-center justify-center min-w-[70px] sm:min-w-[115px] landscape:min-w-[96px]">
            {elevatorTimer !== null ? (
              <>
                <span className={`text-[10px] tracking-[0.25em] uppercase mb-0.5 ${(elevatorTimer <= 5 && !doorsClosed) ? 'text-red-400/80' : doorsClosed ? 'text-blue-400/80' : 'text-amber-400/70'}`}>
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
                <span className="text-green-400/90 text-[10px] tracking-[0.25em] uppercase mb-0.5">Arrived</span>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  <span className="text-green-300 text-sm sm:text-base font-bold leading-none">Ding!</span>
                </div>
              </>
            ) : (
              <>
                <span className="text-amber-400/70 text-[10px] tracking-[0.25em] uppercase mb-0.5">Status</span>
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
));

// ─── Floor Reveal Overlay (Enhanced — typewriter + shake + sound) ─────────
export const FloorReveal = ({ level }: { level: number }) => {
  const [typed, setTyped] = useState('');
  const [shakeClass, setShakeClass] = useState(false);
  const label = `FLOOR ${String(level).padStart(2, '0')}`;

  useEffect(() => {
    setTyped('');
    setShakeClass(true);
    playFloorRevealSound();
    // Subtle screen shake for ~400ms
    const shakeTimer = setTimeout(() => setShakeClass(false), 400);
    // Typewriter effect — reveal chars one by one
    let idx = 0;
    const typeTimer = setInterval(() => {
      idx++;
      setTyped(label.substring(0, idx));
      if (idx >= label.length) clearInterval(typeTimer);
    }, 60);
    return () => { clearTimeout(shakeTimer); clearInterval(typeTimer); };
  }, [level]);

  return (
    <div
      className={`absolute inset-0 z-[45] flex items-center justify-center pointer-events-none px-4 ${shakeClass ? 'floor-reveal-shake' : ''}`}
    >
      <div className="animate-floor-reveal text-center w-full">
        <div className="text-amber-500/80 text-xs sm:text-sm tracking-[0.3em] sm:tracking-[0.5em] uppercase mb-2 sm:mb-4 animate-fade-in">Now Arriving</div>
        <div
          className="text-white font-black tracking-wider tabular-nums"
          style={{ fontSize: 'clamp(2rem, 12vw, 5rem)', textShadow: '0 0 60px rgba(251,191,36,0.8), 0 0 30px rgba(255,255,255,0.4)' }}
        >
          <span>{typed}</span>
          {typed.length < label.length && <span className="inline-block w-[3px] h-[0.8em] bg-amber-400 ml-1 animate-pulse align-middle" />}
        </div>
        <div className="h-[2px] w-32 sm:w-48 mx-auto mt-4 sm:mt-6 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
      </div>
    </div>
  );
};

// ─── Top-right controls (settings + mute + fullscreen) ───────────────────
interface TopControlsProps {
  multiplayerEnabled: boolean;
  otherPlayersCount: number;
  connectionStatus: 'connecting' | 'online' | 'error';
  onSettingsOpen: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

// Mobile fullscreen toggle. Hooks into Fullscreen API directly so the
// whole game (canvas + HUD) goes edge-to-edge. Listens to fullscreenchange
// so the icon stays in sync if the user exits via the system gesture.
const FullscreenButton: React.FC = React.memo(() => {
  const [isFs, setIsFs] = React.useState<boolean>(
    typeof document !== 'undefined' && !!document.fullscreenElement
  );
  React.useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggle = React.useCallback(() => {
    if (!document.fullscreenElement) {
      const req = document.documentElement.requestFullscreen?.();
      if (req && typeof (req as Promise<void>).catch === 'function') {
        (req as Promise<void>).catch(() => { /* user denied / unsupported */ });
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => { /* ok */ });
    }
  }, []);
  return (
    <button
      onClick={toggle}
      className="relative group"
      aria-label={isFs ? 'Sair da tela cheia' : 'Tela cheia'}
    >
      <div className="absolute -inset-1 bg-amber-500/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative bg-black/70 backdrop-blur-sm ring-1 ring-white/10 group-hover:ring-amber-500/40 p-2 sm:p-2.5 rounded-full transition-all group-active:scale-95 tap-target">
        {isFs ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#fbbf24" className="w-6 h-6 landscape:w-6 landscape:h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#fbbf24" className="w-6 h-6 landscape:w-6 landscape:h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        )}
      </div>
    </button>
  );
});

export const TopControls = React.memo(({ multiplayerEnabled, otherPlayersCount, connectionStatus, onSettingsOpen, muted, onToggleMute }: TopControlsProps) => (
  <div
    className="absolute z-50 flex gap-2 pointer-events-auto"
    style={{
      top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
    }}
  >
    {multiplayerEnabled && (
      <div
        className="flex items-center gap-1.5 bg-black/80 backdrop-blur-sm ring-1 ring-white/10 px-2 py-1.5 rounded-md"
        style={{ fontFamily: '"Courier New", "Source Sans 3", monospace', fontSize: 10, letterSpacing: '0.08em' }}
        aria-label={`Multiplayer: ${connectionStatus}, ${otherPlayersCount} jogadores`}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'online' ? (otherPlayersCount > 0 ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.5)]' : 'bg-green-400/60') : connectionStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400/80'}`} />
        <span className="text-white/50">
          {connectionStatus === 'error' ? 'NO SIGNAL' : connectionStatus === 'connecting' ? 'SYNCING...' : otherPlayersCount > 0 ? `${otherPlayersCount} CONNECTED` : 'ONLINE'}
        </span>
      </div>
    )}
    <button onClick={onSettingsOpen} className="relative group" aria-label="Settings">
      <div className="absolute -inset-1 bg-amber-500/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative bg-black/70 backdrop-blur-sm ring-1 ring-white/10 group-hover:ring-amber-500/40 p-2 sm:p-2.5 rounded-full transition-all group-active:scale-95 tap-target">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#fbbf24" className="w-6 h-6 landscape:w-6 landscape:h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </div>
    </button>
    <button onClick={onToggleMute} className="relative group" aria-label={muted ? 'Unmute' : 'Mute'}>
      <div className="absolute -inset-1 bg-amber-500/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative bg-black/70 backdrop-blur-sm ring-1 ring-white/10 group-hover:ring-amber-500/40 p-2 sm:p-2.5 rounded-full transition-all group-active:scale-95 tap-target">
        {muted ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#f87171" className="w-6 h-6 landscape:w-6 landscape:h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#fbbf24" className="w-6 h-6 landscape:w-6 landscape:h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
        )}
      </div>
    </button>
    <FullscreenButton />
  </div>
));

// ─── Action Button (ABRIR PORTA / FALAR / DORMIR) ─────────────────────────
interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  colorClasses: string;
  ringClasses: string;
  onClick: () => void;
  ariaLabel: string;
}

export const ActionButton = React.memo(({ icon, label, colorClasses, ringClasses, onClick, ariaLabel }: ActionButtonProps) => (
  <div
    className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-auto bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] landscape:bottom-[calc(env(safe-area-inset-bottom,0px)+12px)]"
  >
    <button onClick={onClick} className="group relative tap-target" aria-label={ariaLabel}>
      <div className={`absolute -inset-1 rounded-full blur-md opacity-70 group-hover:opacity-100 animate-pulse ${colorClasses}`} />
      <div className={`relative px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-full font-black tracking-wider shadow-2xl active:scale-95 transition-transform flex items-center gap-2 ring-2 text-xs sm:text-base ${ringClasses}`}>
        {icon}
        {label}
      </div>
    </button>
  </div>
));

// ─── Status Banners ───────────────────────────────────────────────────────
export const NightBanner = ({ elevatorActive }: { elevatorActive: boolean }) => (
  <div className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3 max-w-[calc(100%-1.5rem)] landscape:max-w-[70%] ${elevatorActive ? 'top-[calc(env(safe-area-inset-top,0px)+100px)] landscape:top-[calc(env(safe-area-inset-top,0px)+64px)]' : 'top-[calc(env(safe-area-inset-top,0px)+72px)] landscape:top-[calc(env(safe-area-inset-top,0px)+48px)]'}`}>
    <div className="bg-red-950/80 ring-1 ring-red-500/40 text-red-200 px-3 sm:px-4 py-2 rounded-lg font-mono text-[11px] sm:text-sm tracking-wider animate-pulse">Something isn't right...</div>
  </div>
);

export const ChaseBanner = ({
  elevatorActive,
  barneyDistRef,
}: {
  elevatorActive: boolean;
  barneyDistRef?: React.MutableRefObject<number>;
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Recursive setTimeout so interval shrinks as Barney closes in.
    const scheduleBeat = () => {
      const dist = barneyDistRef?.current ?? 12;
      // danger 0 = far (≥12u), 1 = very close (≤2u)
      const danger = Math.max(0, Math.min(1, (12 - dist) / 10));
      const speed = 1.0 + danger * 1.4;
      playHeartbeat(speed);
      timerRef.current = setTimeout(scheduleBeat, Math.round(700 - danger * 350));
    };
    scheduleBeat();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [barneyDistRef]);

  return (
    <>
      {/* Red vignette that pulses */}
      <div className="absolute inset-0 z-[35] pointer-events-none chase-vignette" />
      {/* Chase banner */}
      <div className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3 max-w-[calc(100%-1.5rem)] landscape:max-w-[70%] ${elevatorActive ? 'top-[calc(env(safe-area-inset-top,0px)+100px)] landscape:top-[calc(env(safe-area-inset-top,0px)+64px)]' : 'top-[calc(env(safe-area-inset-top,0px)+72px)] landscape:top-[calc(env(safe-area-inset-top,0px)+48px)]'}`}>
        <div className="bg-red-900/90 ring-2 ring-red-500 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-black tracking-[0.15em] sm:tracking-widest text-[11px] sm:text-lg animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.5)] text-center leading-tight">
          ⚠ RUN TO THE ELEVATOR ⚠
        </div>
      </div>
    </>
  );
};

export const SavedOverlay = () => (
  <div className="absolute inset-0 z-[70] flex items-center justify-center pointer-events-none bg-black/80 px-6 overflow-hidden">
    <div className="text-center w-full animate-fade-in">
      <div className="text-green-400 font-black mb-2" style={{ fontSize: 'clamp(1.5rem, 8vw, 3rem)', textShadow: '0 0 40px rgba(74,222,128,0.5)' }}>YOU SURVIVED</div>
      <div className="h-[2px] w-24 mx-auto mb-3 bg-gradient-to-r from-transparent via-green-400 to-transparent" />
      <div className="text-white/60 text-base sm:text-lg font-light tracking-wider">For now...</div>
    </div>
  </div>
);

// ─── Barney Dialogue ──────────────────────────────────────────────────────
interface BarneyDialogueProps {
  dialogueNode: string;
  onResponse: (next: string) => void;
}

export const BarneyDialogue = ({ dialogueNode, onResponse }: BarneyDialogueProps) => {
  const node = BARNEY_DIALOGUE[dialogueNode];
  if (!node) return null;

  return (
    <div className="absolute inset-0 z-[55] flex items-end justify-center pointer-events-auto landscape:items-center landscape:py-4 overflow-y-auto" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)' }}>
      <div className="w-full max-w-2xl mx-4 mb-6 landscape:mb-0 relative animate-barney-dialogue flex-shrink-0 max-h-[85vh] landscape:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-pink-500/40 to-purple-500/40 rounded-2xl blur-lg barney-glow" />
        <div className="relative bg-[#0d0411]/98 border-2 border-purple-500/50 rounded-xl p-2.5 sm:p-5 shadow-2xl overflow-y-auto scrollbar-hide">
          <div className="flex items-start gap-3 sm:gap-4 flex-col landscape:flex-row sm:flex-row">
            {/* Mobile portrait image */}
            <div className="flex items-center gap-3 sm:hidden landscape:hidden w-full border-b border-white/5 pb-2 mb-1">
               <div className="w-14 h-14 flex-shrink-0 bg-transparent rounded-none overflow-hidden">
                 <img src={BARNEY_URL} className="w-full h-full object-contain object-top animate-barney-bounce" alt="" />
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                 <div className="text-purple-300 text-[11px] font-bold tracking-[0.3em] uppercase">Barney</div>
               </div>
            </div>
            {/* Desktop image */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-transparent rounded-none overflow-hidden self-center sm:self-start hidden sm:block landscape:block">
              <img src={BARNEY_URL} className="w-full h-full object-contain object-top animate-barney-bounce" alt="" />
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="hidden sm:flex landscape:flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <div className="text-purple-300 text-[11px] font-bold tracking-[0.3em] uppercase">Barney</div>
              </div>
              <div className="text-white/95 text-sm sm:text-base leading-relaxed mb-4 font-serif min-h-[2rem] sm:min-h-[3rem] landscape:min-h-0">
                <TypewriterText text={node.text} speed={28} voicePitch={660} />
              </div>
              <div className="flex flex-col gap-2 max-h-[35vh] landscape:max-h-[30vh] overflow-y-auto scrollbar-hide pr-1">
                {node.options.map((opt: any, i: number) => (
                  <button key={i} onClick={() => onResponse(opt.next)} aria-label={opt.text} className="group text-left bg-black/50 hover:bg-purple-900/70 border border-purple-500/30 hover:border-purple-400/70 text-white/70 hover:text-white px-3 py-2.5 rounded-xl text-sm sm:text-base transition-all active:scale-[0.98] flex items-center gap-2 flex-shrink-0">
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
