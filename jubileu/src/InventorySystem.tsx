import React, { useState, useCallback, useEffect, useRef } from 'react';

// ─── Inventory Types ──────────────────────────────────────────────────────
export interface InventoryState {
  flashlight: { owned: boolean; active: boolean };
  cookie: { count: number };
}

const STORAGE_KEY = 'jubileu_inventory';

const defaultInventory: InventoryState = {
  flashlight: { owned: false, active: false },
  cookie: { count: 0 },
};

function loadInventory(): InventoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        flashlight: {
          owned: !!parsed?.flashlight?.owned,
          active: !!parsed?.flashlight?.active,
        },
        cookie: {
          count: typeof parsed?.cookie?.count === 'number' ? parsed.cookie.count : 0,
        },
      };
    }
  } catch { /* ignored */ }
  return { ...defaultInventory };
}

function saveInventory(inv: InventoryState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inv));
  } catch { /* ignored */ }
}

// ─── useInventory Hook ────────────────────────────────────────────────────
export function useInventory() {
  const [inventory, setInventory] = useState<InventoryState>(loadInventory);
  // A ref mirror so canvas-side components (FlashlightLight) can read state
  // without causing re-renders in the Three.js tree.
  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  // Persist on change
  useEffect(() => {
    saveInventory(inventory);
  }, [inventory]);

  const addItem = useCallback((itemId: string) => {
    setInventory(prev => {
      const next = { ...prev };
      if (itemId === 'flashlight' && !prev.flashlight.owned) {
        next.flashlight = { owned: true, active: false };
      }
      if (itemId === 'cookie') {
        next.cookie = { count: prev.cookie.count + 1 };
      }
      return next;
    });
  }, []);

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
    return success;
  }, []);

  const hasAnyItem = inventory.flashlight.owned || inventory.cookie.count > 0;

  return { inventory, inventoryRef, addItem, toggleFlashlight, useCookie, hasAnyItem };
}

// ─── InventoryHUD Component ───────────────────────────────────────────────
interface InventoryHUDProps {
  inventory: InventoryState;
  onToggleFlashlight: () => void;
  onUseCookie: () => boolean;
  hasAnyItem: boolean;
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
      className="relative w-11 h-11 landscape:w-10 landscape:h-10 flex items-center justify-center
                 bg-black/60 backdrop-blur-md border border-white/15 rounded-xl
                 active:scale-90 transition-transform touch-manipulation"
      aria-label={`Usar biscoito (${count})`}
    >
      {/* Cookie SVG icon */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="landscape:w-5 landscape:h-5">
        <circle cx="12" cy="12" r="10" fill="#D2A06B" stroke="#A0744B" strokeWidth="1.2"/>
        <circle cx="8.5" cy="9" r="1.4" fill="#6B3E1F"/>
        <circle cx="14" cy="8" r="1.2" fill="#6B3E1F"/>
        <circle cx="11" cy="14" r="1.3" fill="#6B3E1F"/>
        <circle cx="16" cy="13.5" r="1" fill="#6B3E1F"/>
        <path d="M3.5 11a10 10 0 0 1 4-7" stroke="#E8C99B" strokeWidth="1" strokeLinecap="round"/>
      </svg>
      {/* Count badge */}
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center
                         bg-amber-500 text-black text-[10px] font-bold rounded-full px-1 leading-none">
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
}) => {
  if (!hasAnyItem) return null;

  const { flashlight, cookie } = inventory;

  return (
    <div
      className="fixed z-[52] pointer-events-auto
                 left-1/2 -translate-x-1/2
                 bottom-[calc(env(safe-area-inset-bottom,0px)+72px)]
                 landscape:left-auto landscape:right-[calc(env(safe-area-inset-right,0px)+12px)]
                 landscape:bottom-[calc(env(safe-area-inset-bottom,0px)+12px)]
                 landscape:-translate-x-0 landscape:translate-x-0"
    >
      <div className="flex items-center gap-2 landscape:gap-1.5">
        {/* Flashlight button */}
        {flashlight.owned && (
          <button
            type="button"
            onClick={onToggleFlashlight}
            className={`
              relative w-11 h-11 landscape:w-10 landscape:h-10 flex items-center justify-center
              bg-black/60 backdrop-blur-md rounded-xl
              active:scale-90 transition-all touch-manipulation
              ${flashlight.active
                ? 'border-2 border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                : 'border border-white/15'}
            `}
            aria-label={flashlight.active ? 'Desligar lanterna' : 'Ligar lanterna'}
          >
            {/* Flashlight SVG icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="landscape:w-5 landscape:h-5">
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
            {/* Active glow ring */}
            {flashlight.active && (
              <div className="absolute inset-0 rounded-xl bg-amber-400/10 animate-pulse pointer-events-none" />
            )}
            {/* Key hint (desktop only) */}
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] text-white/40 font-mono
                             hidden landscape:group-hover:block select-none">F</span>
          </button>
        )}

        {/* Cookie button */}
        {cookie.count > 0 && (
          <CookieBadge count={cookie.count} onUse={onUseCookie} />
        )}
      </div>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes cookieUse {
          0%   { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -16px) scale(1.2); }
        }
        .animate-cookie-use {
          animation: cookieUse 600ms ease-out forwards;
        }
      `}</style>
    </div>
  );
};
