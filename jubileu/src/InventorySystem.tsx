/**
 * InventorySystem.tsx — Session inventory + HUD.
 *
 * Stack:
 *  - useInventory(): hook that owns the inventory state and exposes actions.
 *  - InventoryHUD: amber/black HUD chip that mirrors the lobby's Undertale
 *    liminal-horror palette (look at the LOCATION/STAT panel in App.tsx).
 *
 * Design rules:
 *  - Inventory is session-only. The player always starts empty-handed.
 *  - HUD renders nothing until the player owns something — keeps the lobby
 *    clean and only flickers in when there's something to show.
 *  - Touch targets ≥ 48px on every orientation.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

export type ItemId = 'flashlight' | 'cookie' | 'nightvision';

export interface InventoryState {
  flashlight: { owned: boolean; active: boolean };
  cookie: { count: number };
  // Diving mask given by the Floor 2 NPC. "Owned" once received; "active"
  // toggles the green night-vision overlay (always-on diving function is
  // narrative — the game doesn't have an oxygen mechanic).
  nightvision: { owned: boolean; active: boolean };
}

const EMPTY: InventoryState = {
  flashlight: { owned: false, active: false },
  cookie: { count: 0 },
  nightvision: { owned: false, active: false },
};

export function useInventory() {
  const [inventory, setInventory] = useState<InventoryState>(EMPTY);

  const addItem = useCallback((id: ItemId) => {
    setInventory(prev => {
      if (id === 'flashlight') {
        if (prev.flashlight.owned) return prev;
        return { ...prev, flashlight: { owned: true, active: false } };
      }
      if (id === 'cookie') {
        return { ...prev, cookie: { count: prev.cookie.count + 1 } };
      }
      if (id === 'nightvision') {
        if (prev.nightvision.owned) return prev;
        return { ...prev, nightvision: { owned: true, active: false } };
      }
      return prev;
    });
  }, []);

  const toggleFlashlight = useCallback(() => {
    setInventory(prev => {
      if (!prev.flashlight.owned) return prev;
      return { ...prev, flashlight: { ...prev.flashlight, active: !prev.flashlight.active } };
    });
  }, []);

  const toggleNightVision = useCallback(() => {
    setInventory(prev => {
      if (!prev.nightvision.owned) return prev;
      return { ...prev, nightvision: { ...prev.nightvision, active: !prev.nightvision.active } };
    });
  }, []);

  const useCookie = useCallback((): boolean => {
    let ok = false;
    setInventory(prev => {
      if (prev.cookie.count <= 0) return prev;
      ok = true;
      return { ...prev, cookie: { count: prev.cookie.count - 1 } };
    });
    return ok;
  }, []);

  const hasAnyItem = inventory.flashlight.owned || inventory.cookie.count > 0 || inventory.nightvision.owned;

  return { inventory, addItem, toggleFlashlight, toggleNightVision, useCookie, hasAnyItem };
}

// ───────────────────────────────────────────────────────────────────────────
// HUD

interface InventoryHUDProps {
  inventory: InventoryState;
  onToggleFlashlight: () => void;
  onToggleNightVision: () => void;
  onUseCookie: () => boolean;
  hasAnyItem: boolean;
}

export const InventoryHUD: React.FC<InventoryHUDProps> = ({
  inventory,
  onToggleFlashlight,
  onToggleNightVision,
  onUseCookie,
  hasAnyItem,
}) => {
  const [notification, setNotification] = useState<string | null>(null);
  const [cookieEffect, setCookieEffect] = useState(false);
  // "New item" flash for the icon — toggled true briefly when the item is
  // first acquired, so the icon does its appearance animation.
  const [flashNew, setFlashNew] = useState(false);
  const [nightVisionNew, setNightVisionNew] = useState(false);
  const prevFlashlight = useRef(inventory.flashlight.owned);
  const prevCookies = useRef(inventory.cookie.count);
  const prevNightVision = useRef(inventory.nightvision.owned);
  const notifTimerRef = useRef<number | null>(null);

  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    if (notifTimerRef.current !== null) window.clearTimeout(notifTimerRef.current);
    notifTimerRef.current = window.setTimeout(() => setNotification(null), 2500);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (notifTimerRef.current !== null) window.clearTimeout(notifTimerRef.current);
  }, []);

  // Detect first-time flashlight acquisition
  if (inventory.flashlight.owned && !prevFlashlight.current) {
    prevFlashlight.current = true;
    setFlashNew(true);
    window.setTimeout(() => setFlashNew(false), 700);
    showNotif('* Você adquiriu a {Lanterna}.');
  }
  // Detect new cookie
  if (inventory.cookie.count > prevCookies.current) {
    showNotif('* Você adquiriu um {Biscoito}.');
  }
  prevCookies.current = inventory.cookie.count;
  // Detect first-time night-vision acquisition
  if (inventory.nightvision.owned && !prevNightVision.current) {
    prevNightVision.current = true;
    setNightVisionNew(true);
    window.setTimeout(() => setNightVisionNew(false), 700);
    showNotif('* Você adquiriu a {Máscara de Mergulho}.');
  }

  const handleUseCookie = () => {
    if (onUseCookie()) {
      setCookieEffect(true);
      window.setTimeout(() => setCookieEffect(false), 1800);
      showNotif('* Você comeu o {Biscoito}.');
    }
  };

  if (!hasAnyItem && !notification && !cookieEffect) return null;

  const { flashlight, cookie, nightvision } = inventory;

  return (
    <>
      {hasAnyItem && (
        <div
          className="
            fixed z-[52] pointer-events-auto select-none
            bottom-[calc(env(safe-area-inset-bottom,0px)+96px)]
            left-1/2 -translate-x-1/2
            landscape:bottom-auto
            landscape:right-[calc(env(safe-area-inset-right,0px)+14px)]
            landscape:left-auto landscape:translate-x-0
            landscape:top-1/2 landscape:-translate-y-1/2
            animate-inv-enter
          "
        >
          <div className="
            flex items-center gap-3
            landscape:flex-col landscape:gap-3
            bg-black/55 backdrop-blur-md
            border border-amber-500/40
            rounded-md
            px-3 py-2
            landscape:px-2 landscape:py-3
            shadow-[0_0_18px_rgba(245,158,11,0.18)]
            font-mono
          ">
            {flashlight.owned && (
              <button
                type="button"
                onClick={onToggleFlashlight}
                title={flashlight.active ? 'Desligar lanterna (F)' : 'Ligar lanterna (F)'}
                className={`
                  relative w-12 h-12 flex items-center justify-center
                  rounded-sm border transition-all touch-manipulation
                  active:scale-90
                  ${flashlight.active
                    ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.65)] animate-flash-breath'
                    : 'bg-black/40 border-amber-500/30 hover:border-amber-400/60'}
                  ${flashNew ? 'animate-flash-appear' : ''}
                `}
                aria-label={flashlight.active ? 'Desligar lanterna' : 'Ligar lanterna'}
              >
                {/* Keyboard hint chip — only on devices that have a keyboard. */}
                <span className="hidden md:block absolute -top-1.5 -left-1.5 px-1 text-[8px] font-mono font-bold
                                 bg-amber-500 text-black rounded-sm pointer-events-none leading-none py-0.5">
                  F
                </span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="10" y="2" width="4" height="8" rx="0.5" fill={flashlight.active ? '#FFD54F' : '#888'}
                    stroke={flashlight.active ? '#FFA000' : '#666'} strokeWidth="0.8"/>
                  <rect x="8" y="10" width="8" height="6" rx="0.5" fill={flashlight.active ? '#555' : '#444'}
                    stroke="#333" strokeWidth="0.8"/>
                  <rect x="9" y="16" width="6" height="3" rx="0.5" fill={flashlight.active ? '#444' : '#333'}/>
                  {flashlight.active && (
                    <>
                      <line x1="12" y1="2" x2="12" y2="0" stroke="#FFD54F" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
                      <line x1="8" y1="3" x2="6" y2="1.5" stroke="#FFD54F" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
                      <line x1="16" y1="3" x2="18" y2="1.5" stroke="#FFD54F" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
                    </>
                  )}
                </svg>
              </button>
            )}

            {nightvision.owned && (
              <button
                type="button"
                onClick={onToggleNightVision}
                title={nightvision.active ? 'Desligar visão noturna (N)' : 'Ligar visão noturna (N)'}
                className={`
                  relative w-12 h-12 flex items-center justify-center
                  rounded-sm border transition-all touch-manipulation
                  active:scale-90
                  ${nightvision.active
                    ? 'bg-green-500/15 border-green-400 shadow-[0_0_18px_rgba(34,197,94,0.65)] animate-flash-breath'
                    : 'bg-black/40 border-green-500/30 hover:border-green-400/60'}
                  ${nightVisionNew ? 'animate-flash-appear' : ''}
                `}
                aria-label={nightvision.active ? 'Desligar visão noturna' : 'Ligar visão noturna'}
              >
                <span className="hidden md:block absolute -top-1.5 -left-1.5 px-1 text-[8px] font-mono font-bold
                                 bg-green-500 text-black rounded-sm pointer-events-none leading-none py-0.5">
                  N
                </span>
                {/* Diving mask icon — goggles + breather tube */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  {/* Mask frame */}
                  <rect x="3" y="8" width="18" height="9" rx="2.5"
                    fill={nightvision.active ? '#1a3a1a' : '#222'} stroke={nightvision.active ? '#7ee78a' : '#666'} strokeWidth="1.2"/>
                  {/* Left lens */}
                  <circle cx="8.5" cy="12.5" r="2.5"
                    fill={nightvision.active ? '#90ffa0' : '#333'} stroke={nightvision.active ? '#3ad24a' : '#444'} strokeWidth="0.6"/>
                  {/* Right lens */}
                  <circle cx="15.5" cy="12.5" r="2.5"
                    fill={nightvision.active ? '#90ffa0' : '#333'} stroke={nightvision.active ? '#3ad24a' : '#444'} strokeWidth="0.6"/>
                  {/* Strap */}
                  <path d="M3 12 H1 M21 12 H23" stroke={nightvision.active ? '#7ee78a' : '#666'} strokeWidth="1.1" strokeLinecap="round"/>
                  {/* Breather tube */}
                  <path d="M15.5 17 Q18 19 17 22" stroke={nightvision.active ? '#7ee78a' : '#666'} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
                </svg>
                {nightvision.active && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.9)] animate-pulse" />
                )}
              </button>
            )}

            {cookie.count > 0 && (
              <button
                type="button"
                onClick={handleUseCookie}
                disabled={cookie.count <= 0}
                className="relative w-12 h-12 flex items-center justify-center
                           bg-black/40 border border-amber-500/30 rounded-sm
                           active:scale-90 transition-all touch-manipulation
                           disabled:opacity-40 disabled:active:scale-100"
                aria-label={`Comer biscoito (${cookie.count} disponíveis)`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" fill="#D2A06B" stroke="#A0744B" strokeWidth="1.2"/>
                  <circle cx="8.5" cy="9" r="1.4" fill="#4A2310"/>
                  <circle cx="14" cy="8" r="1.2" fill="#4A2310"/>
                  <circle cx="11" cy="14" r="1.3" fill="#4A2310"/>
                  <circle cx="16" cy="13.5" r="1" fill="#4A2310"/>
                </svg>
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
                                 flex items-center justify-center
                                 bg-amber-400 text-black text-[10px] font-bold rounded-sm
                                 leading-none shadow-[0_0_6px_rgba(245,158,11,0.6)]">
                  {cookie.count}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {notification && (
        <div
          className="fixed z-[55] left-1/2 -translate-x-1/2 pointer-events-none
                     bottom-[calc(env(safe-area-inset-bottom,0px)+170px)]
                     landscape:bottom-auto
                     landscape:top-[calc(env(safe-area-inset-top,0px)+60px)]"
          style={{ animation: 'invNotifIn 280ms ease-out forwards' }}
        >
          <div className="bg-black/75 backdrop-blur-md border border-amber-500/40
                          rounded-sm px-4 py-2
                          shadow-[0_0_18px_rgba(245,158,11,0.25)]
                          text-amber-200 text-sm font-mono tracking-wide
                          whitespace-nowrap">
            {notification.split(/(\{[^}]+\})/).map((seg, i) => {
              const m = seg.match(/^\{([^}]+)\}$/);
              if (m) return <span key={i} className="text-amber-400 font-bold">{m[1]}</span>;
              return <span key={i}>{seg}</span>;
            })}
          </div>
        </div>
      )}

      {cookieEffect && (
        <div
          className="fixed inset-0 z-[51] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,193,7,0.16) 0%, rgba(255,193,7,0.04) 50%, transparent 80%)',
            animation: 'invCookieHeal 1800ms ease-out forwards',
          }}
        />
      )}

      <style>{`
        @keyframes invEnterPortrait {
          0% { opacity: 0; transform: translateX(-50%) translateY(16px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes invEnterLandscape {
          0% { opacity: 0; transform: translateY(-50%) translateX(16px); }
          100% { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        .animate-inv-enter { animation: invEnterPortrait 380ms cubic-bezier(0.16,1,0.3,1) forwards; }
        @media (orientation: landscape) {
          .animate-inv-enter { animation-name: invEnterLandscape; }
        }
        @keyframes invNotifIn {
          0% { opacity: 0; transform: translate(-50%, 12px) scale(0.96); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        @keyframes invCookieHeal {
          0% { opacity: 0; }
          15% { opacity: 0.5; }
          40% { opacity: 0.35; }
          100% { opacity: 0; }
        }
        @keyframes flashBreath {
          0%, 100% { box-shadow: 0 0 14px rgba(251,191,36,0.45); }
          50%      { box-shadow: 0 0 22px rgba(251,191,36,0.85); }
        }
        .animate-flash-breath { animation: flashBreath 2.2s ease-in-out infinite; }
        @keyframes flashAppear {
          0%   { opacity: 0; transform: scale(0.5) rotate(-8deg); }
          60%  { opacity: 1; transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0); }
        }
        .animate-flash-appear { animation: flashAppear 600ms cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
    </>
  );
};
