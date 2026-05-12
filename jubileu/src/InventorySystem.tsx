import React, { useState, useCallback, useEffect, useRef } from 'react';

// ─── Inventory Types ──────────────────────────────────────────────────────
export interface InventoryState {
  flashlight: { owned: boolean; active: boolean };
  cookie: { count: number };
}

const defaultInventory: InventoryState = {
  flashlight: { owned: false, active: false },
  cookie: { count: 0 },
};

// Inventory is session-only — never persisted across page reloads.
// In a horror game the player should always start empty-handed.
function loadInventory(): InventoryState {
  return { ...defaultInventory };
}

// ─── useInventory Hook ────────────────────────────────────────────────────
export function useInventory() {
  const [inventory, setInventory] = useState<InventoryState>(loadInventory);
  // A ref mirror so canvas-side components (FlashlightLight) can read state
  // without causing re-renders in the Three.js tree.
  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  // Notification state for item acquisition toasts
  const [notification, setNotification] = useState<string | null>(null);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pickup animation state — drives the item-floats-into-hand effect in
  // PickupAnimator. Cleared by the animator itself once the lerp finishes
  // (see onComplete wiring in App.tsx).
  const [pickupAnim, setPickupAnim] = useState<{ itemId: 'flashlight' | 'cookie'; startedAt: number } | null>(null);
  const clearPickupAnim = useCallback(() => setPickupAnim(null), []);

  const showNotification = useCallback((msg: string) => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    setNotification(msg);
    notifTimerRef.current = setTimeout(() => setNotification(null), 2500);
  }, []);

  useEffect(() => () => { if (notifTimerRef.current) clearTimeout(notifTimerRef.current); }, []);

  const addItem = useCallback((itemId: string) => {
    let fired = false;
    setInventory(prev => {
      const next = { ...prev };
      if (itemId === 'flashlight' && !prev.flashlight.owned) {
        next.flashlight = { owned: true, active: false };
        showNotification('🔦 Lanterna obtida!');
        fired = true;
      }
      if (itemId === 'cookie') {
        next.cookie = { count: prev.cookie.count + 1 };
        showNotification('🍪 Biscoito obtido!');
        fired = true;
      }
      return next;
    });
    // Kick off the "item floats into hand" animation. The animator nulls
    // it on completion via clearPickupAnim.
    if (fired && (itemId === 'flashlight' || itemId === 'cookie')) {
      setPickupAnim({ itemId, startedAt: performance.now() });
    }
  }, [showNotification]);

  // Cookie consume visual effect state
  const [cookieEffect, setCookieEffect] = useState(false);
  const cookieTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleFlashlight = useCallback(() => {
    setInventory(prev => {
      if (!prev.flashlight.owned) return prev;
      return {
        ...prev,
        flashlight: { ...prev.flashlight, active: !prev.flashlight.active },
      };
    });
  }, []);

  const useCookie = useCallback((): boolean => {
    let success = false;
    setInventory(prev => {
      if (prev.cookie.count <= 0) return prev;
      success = true;
      return { ...prev, cookie: { count: prev.cookie.count - 1 } };
    });
    if (success) {
      // Trigger the visual effect
      if (cookieTimerRef.current) clearTimeout(cookieTimerRef.current);
      setCookieEffect(true);
      cookieTimerRef.current = setTimeout(() => setCookieEffect(false), 1800);
      showNotification('🍪 Biscoito consumido!');
    }
    return success;
  }, [showNotification]);

  useEffect(() => () => { if (cookieTimerRef.current) clearTimeout(cookieTimerRef.current); }, []);

  const hasAnyItem = inventory.flashlight.owned || inventory.cookie.count > 0;

  return { inventory, inventoryRef, addItem, toggleFlashlight, useCookie, hasAnyItem, notification, cookieEffect, pickupAnim, clearPickupAnim };
}

// ─── InventoryHUD Component ───────────────────────────────────────────────
interface InventoryHUDProps {
  inventory: InventoryState;
  onToggleFlashlight: () => void;
  onUseCookie: () => boolean;
  hasAnyItem: boolean;
  notification?: string | null;
  cookieEffect?: boolean;
}

// Cookie "+1" animation state (local to the module so the HUD can trigger it)
const CookieBadge: React.FC<{ count: number; onUse: () => void }> = ({ count, onUse }) => {
  const [anim, setAnim] = useState(false);
  const prevCount = useRef(count);

  useEffect(() => {
    if (count < prevCount.current) {
      setAnim(true);
      const t = setTimeout(() => setAnim(false), 600);
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  return (
    <button
      type="button"
      onClick={onUse}
      disabled={count <= 0}
      className="relative w-12 h-12 flex items-center justify-center
                 bg-black/50 backdrop-blur-md border border-white/15 rounded-xl
                 active:scale-90 transition-all touch-manipulation
                 disabled:opacity-40 disabled:active:scale-100"
      aria-label={`Usar biscoito (${count})`}
    >
      {/* Cookie SVG icon */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#D2A06B" stroke="#A0744B" strokeWidth="1.2"/>
        <circle cx="8.5" cy="9" r="1.4" fill="#6B3E1F"/>
        <circle cx="14" cy="8" r="1.2" fill="#6B3E1F"/>
        <circle cx="11" cy="14" r="1.3" fill="#6B3E1F"/>
        <circle cx="16" cy="13.5" r="1" fill="#6B3E1F"/>
        <path d="M3.5 11a10 10 0 0 1 4-7" stroke="#E8C99B" strokeWidth="1" strokeLinecap="round"/>
      </svg>
      {/* Count badge */}
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center
                         bg-amber-500 text-black text-[10px] font-bold rounded-full px-1 leading-none
                         shadow-[0_0_6px_rgba(245,158,11,0.5)]">
          {count}
        </span>
      )}
      {/* "+1" animation on use */}
      {anim && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-amber-300 text-xs font-bold
                         animate-cookie-use pointer-events-none">
          +1
        </span>
      )}
    </button>
  );
};

export const InventoryHUD: React.FC<InventoryHUDProps> = ({
  inventory,
  onToggleFlashlight,
  onUseCookie,
  hasAnyItem,
  notification,
  cookieEffect,
}) => {
  const [prevOwned, setPrevOwned] = useState({ flashlight: false, cookie: false });
  const [flashNew, setFlashNew] = useState(false);
  const [cookieNew, setCookieNew] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Detect first-time item acquisition for flash/glow animation
  useEffect(() => {
    if (inventory.flashlight.owned && !prevOwned.flashlight) {
      setFlashNew(true);
      const t = setTimeout(() => setFlashNew(false), 800);
      setPrevOwned(p => ({ ...p, flashlight: true }));
      return () => clearTimeout(t);
    }
    if (inventory.cookie.count > 0 && !prevOwned.cookie) {
      setCookieNew(true);
      const t = setTimeout(() => setCookieNew(false), 800);
      setPrevOwned(p => ({ ...p, cookie: true }));
      return () => clearTimeout(t);
    }
  }, [inventory.flashlight.owned, inventory.cookie.count, prevOwned]);

  // Trigger enter animation once when HUD first appears
  useEffect(() => {
    if (hasAnyItem && !mounted) setMounted(true);
  }, [hasAnyItem, mounted]);

  if (!hasAnyItem && !notification && !cookieEffect) return null;

  const { flashlight, cookie } = inventory;

  return (
    <>
      {/* Inventory HUD buttons */}
      {hasAnyItem && (
        <div
          className={`
            fixed z-[52] pointer-events-auto
            bottom-[calc(env(safe-area-inset-bottom,0px)+96px)]
            left-1/2 -translate-x-1/2
            landscape:bottom-auto
            landscape:right-[calc(env(safe-area-inset-right,0px)+14px)]
            landscape:left-auto landscape:translate-x-0
            landscape:top-1/2 landscape:-translate-y-1/2
            ${mounted ? 'animate-inventory-enter' : ''}
          `}
        >
          <div className="
            flex items-center gap-3
            landscape:flex-col landscape:gap-3
            bg-black/40 backdrop-blur-xl
            border border-white/10
            rounded-2xl
            px-3 py-2
            landscape:px-2 landscape:py-3
            shadow-[0_4px_24px_rgba(0,0,0,0.4)]
          ">
            {flashlight.owned && (
              <button
                type="button"
                onClick={onToggleFlashlight}
                className={`
                  relative w-12 h-12 flex items-center justify-center
                  bg-black/50 backdrop-blur-md rounded-xl
                  active:scale-90 transition-all touch-manipulation
                  ${flashlight.active
                    ? 'border-2 border-amber-400/80 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
                    : 'border border-white/15'}
                  ${flashNew ? 'animate-item-appear' : ''}
                `}
                aria-label={flashlight.active ? 'Desligar lanterna' : 'Ligar lanterna'}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="10" y="2" width="4" height="8" rx="1" fill={flashlight.active ? '#FFD54F' : '#888'}
                    stroke={flashlight.active ? '#FFA000' : '#666'} strokeWidth="0.8"/>
                  <rect x="8" y="10" width="8" height="6" rx="1.5" fill={flashlight.active ? '#555' : '#444'}
                    stroke="#333" strokeWidth="0.8"/>
                  <rect x="9" y="16" width="6" height="3" rx="1" fill={flashlight.active ? '#444' : '#333'}/>
                  {flashlight.active && (
                    <>
                      <line x1="12" y1="2" x2="12" y2="0" stroke="#FFD54F" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
                      <line x1="8" y1="3" x2="6" y2="1.5" stroke="#FFD54F" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
                      <line x1="16" y1="3" x2="18" y2="1.5" stroke="#FFD54F" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
                    </>
                  )}
                </svg>
                {flashlight.active && (
                  <div className="absolute inset-0 rounded-xl bg-amber-400/10 animate-pulse pointer-events-none" />
                )}
              </button>
            )}

            {cookie.count > 0 && (
              <div className={cookieNew ? 'animate-item-appear' : ''}>
                <CookieBadge count={cookie.count} onUse={onUseCookie} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Item acquisition notification toast */}
      {notification && (
        <div
          className="fixed z-[55] left-1/2 -translate-x-1/2 pointer-events-none
                     bottom-[calc(env(safe-area-inset-bottom,0px)+160px)]
                     landscape:bottom-auto landscape:top-[calc(env(safe-area-inset-top,0px)+60px)]"
          style={{ animation: 'notifSlideIn 300ms ease-out forwards' }}
        >
          <div className="bg-black/70 backdrop-blur-xl border border-amber-500/30 rounded-xl
                          px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]
                          text-amber-200 text-sm font-medium tracking-wide
                          whitespace-nowrap">
            {notification}
          </div>
        </div>
      )}

      {/* Cookie heal effect — green vignette pulse */}
      {cookieEffect && (
        <div
          className="fixed inset-0 z-[51] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(74,222,128,0.2) 0%, rgba(74,222,128,0.05) 50%, transparent 80%)',
            animation: 'cookieHealPulse 1800ms ease-out forwards',
          }}
        />
      )}

      <style>{`
        @keyframes cookieUse {
          0%   { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -16px) scale(1.2); }
        }
        .animate-cookie-use { animation: cookieUse 600ms ease-out forwards; }
        @keyframes itemAppear {
          0%   { opacity: 0; transform: scale(0.3); filter: brightness(3); }
          50%  { opacity: 1; transform: scale(1.15); filter: brightness(2); }
          75%  { transform: scale(0.95); filter: brightness(1.2); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .animate-item-appear { animation: itemAppear 800ms ease-out forwards; }
        @keyframes inventoryEnterPortrait {
          0%   { opacity: 0; transform: translateX(-50%) translateY(20px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes inventoryEnterLandscape {
          0%   { opacity: 0; transform: translateY(-50%) translateX(20px); }
          100% { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        .animate-inventory-enter {
          animation: inventoryEnterPortrait 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (orientation: landscape) {
          .animate-inventory-enter { animation-name: inventoryEnterLandscape; }
        }
        @keyframes notifSlideIn {
          0%   { opacity: 0; transform: translateY(12px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cookieHealPulse {
          0%   { opacity: 0; }
          15%  { opacity: 0.18; }
          40%  { opacity: 0.12; }
          100% { opacity: 0; }
        }
      `}</style>
    </>
  );
};
