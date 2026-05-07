import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Inventory Types ─────────────────────────────────────────────────────
export interface InventoryState {
  flashlight: { owned: boolean; active: boolean };
  cookie: { count: number };
}

const DEFAULT_INVENTORY: InventoryState = {
  flashlight: { owned: false, active: false },
  cookie: { count: 0 },
};

const STORAGE_KEY = 'jubileu_inventory';

function loadInventory(): InventoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INVENTORY };
    const parsed = JSON.parse(raw);
    return {
      flashlight: { owned: parsed.flashlight?.owned ?? false, active: parsed.flashlight?.active ?? false },
      cookie: { count: parsed.cookie?.count ?? 0 },
    };
  } catch {
    return { ...DEFAULT_INVENTORY };
  }
}

function saveInventory(inv: InventoryState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inv));
}

// ─── Inventory Hook ──────────────────────────────────────────────────────
export function useInventory() {
  const [inventory, setInventory] = useState<InventoryState>(loadInventory);
  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  useEffect(() => { saveInventory(inventory); }, [inventory]);

  const addItem = useCallback((itemId: string) => {
    setInventory(prev => {
      const next = { ...prev };
      if (itemId === 'flashlight') {
        next.flashlight = { owned: true, active: prev.flashlight.active };
      } else if (itemId === 'cookie') {
        next.cookie = { count: prev.cookie.count + 1 };
      }
      return next;
    });
  }, []);

  const toggleFlashlight = useCallback(() => {
    setInventory(prev => {
      if (!prev.flashlight.owned) return prev;
      return { ...prev, flashlight: { owned: true, active: !prev.flashlight.active } };
    });
  }, []);

  const useCookie = useCallback((): boolean => {
    if (inventoryRef.current.cookie.count <= 0) return false;
    setInventory(prev => {
      if (prev.cookie.count <= 0) return prev;
      return { ...prev, cookie: { count: prev.cookie.count - 1 } };
    });
    return true;
  }, []);

  const hasAnyItem = inventory.flashlight.owned || inventory.cookie.count > 0;

  return { inventory, inventoryRef, addItem, toggleFlashlight, useCookie, hasAnyItem };
}

// ─── Inventory HUD ──────────────────────────────────────────────────────
// Only renders when the player has at least one item. Compact bottom-left
// design that doesn't clutter the game. Items show as small icons with
// counts/active states. Click/tap to use or toggle.

interface InventoryHUDProps {
  inventory: InventoryState;
  onToggleFlashlight: () => void;
  onUseCookie: () => boolean;
  hasAnyItem: boolean;
}

export const InventoryHUD: React.FC<InventoryHUDProps> = ({
  inventory,
  onToggleFlashlight,
  onUseCookie,
  hasAnyItem,
}) => {
  const [cookieEffect, setCookieEffect] = useState(false);

  if (!hasAnyItem) return null;

  const handleUseCookie = () => {
    const used = onUseCookie();
    if (used) {
      setCookieEffect(true);
      setTimeout(() => setCookieEffect(false), 1500);
    }
  };

  return (
    <>
      {/* Cookie use visual effect */}
      {cookieEffect && (
        <div className="fixed inset-0 pointer-events-none z-[55] flex items-center justify-center">
          <div
            className="text-4xl animate-bounce"
            style={{
              animation: 'cookieMunch 1.5s ease-out forwards',
              textShadow: '0 0 20px rgba(255,193,7,0.6)',
            }}
          >
            🍪
          </div>
        </div>
      )}

      {/* Inventory bar */}
      <div
        className="fixed z-[50] flex gap-2 items-end pointer-events-none"
        style={{
          bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 80px), 80px)',
          left: 'max(calc(env(safe-area-inset-left, 0px) + 12px), 12px)',
        }}
      >
        {inventory.flashlight.owned && (
          <button
            onClick={onToggleFlashlight}
            className="pointer-events-auto tap-target relative flex items-center justify-center rounded-xl transition-all duration-150"
            style={{
              width: 48,
              height: 48,
              background: inventory.flashlight.active
                ? 'linear-gradient(135deg, rgba(255,235,59,0.25), rgba(255,193,7,0.15))'
                : 'rgba(0,0,0,0.6)',
              border: inventory.flashlight.active
                ? '1.5px solid rgba(255,235,59,0.6)'
                : '1.5px solid rgba(255,255,255,0.15)',
              boxShadow: inventory.flashlight.active
                ? '0 0 16px rgba(255,235,59,0.3), inset 0 0 8px rgba(255,235,59,0.1)'
                : '0 4px 12px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            aria-label={inventory.flashlight.active ? 'Desligar lanterna' : 'Ligar lanterna'}
          >
            {/* Flashlight icon */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke={inventory.flashlight.active ? '#FFEB3B' : '#ffffff'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter: inventory.flashlight.active ? 'drop-shadow(0 0 4px rgba(255,235,59,0.8))' : 'none',
                transition: 'all 150ms',
              }}
            >
              <path d="M18 6L6 18" opacity="0" />
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2v1" />
              <path d="M12 6a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0v-4a4 4 0 0 1 4-4z" />
              {inventory.flashlight.active && (
                <>
                  <line x1="12" y1="2" x2="12" y2="6" stroke="#FFEB3B" strokeWidth="2" />
                  <line x1="6" y1="4" x2="8" y2="6" stroke="#FFEB3B" strokeWidth="1.5" opacity="0.7" />
                  <line x1="18" y1="4" x2="16" y2="6" stroke="#FFEB3B" strokeWidth="1.5" opacity="0.7" />
                </>
              )}
            </svg>
            {/* Key hint */}
            <span
              className="absolute -top-1 -right-1 text-[9px] font-mono font-bold px-1 rounded"
              style={{
                background: 'rgba(0,0,0,0.8)',
                color: inventory.flashlight.active ? '#FFEB3B' : 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              F
            </span>
          </button>
        )}

        {inventory.cookie.count > 0 && (
          <button
            onClick={handleUseCookie}
            className="pointer-events-auto tap-target relative flex items-center justify-center rounded-xl transition-all duration-150"
            style={{
              width: 48,
              height: 48,
              background: 'rgba(0,0,0,0.6)',
              border: '1.5px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            aria-label="Comer biscoito"
          >
            {/* Cookie icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D4A574" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" fill="#C68B59" stroke="#A0724A" />
              <circle cx="9" cy="9" r="1.2" fill="#6D4C30" />
              <circle cx="14" cy="8" r="1" fill="#6D4C30" />
              <circle cx="11" cy="14" r="1.3" fill="#6D4C30" />
              <circle cx="15" cy="13" r="0.9" fill="#6D4C30" />
            </svg>
            {/* Count badge */}
            <span
              className="absolute -top-1.5 -right-1.5 text-[10px] font-bold min-w-[18px] text-center rounded-full"
              style={{
                background: 'linear-gradient(135deg, #FF8A65, #D4A574)',
                color: '#fff',
                padding: '1px 4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              }}
            >
              {inventory.cookie.count}
            </span>
          </button>
        )}
      </div>

      <style>{`
        @keyframes cookieMunch {
          0% { transform: scale(0.5) rotate(-10deg); opacity: 0; }
          30% { transform: scale(1.3) rotate(5deg); opacity: 1; }
          60% { transform: scale(1) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1.5) rotate(0deg); opacity: 0; }
        }
      `}</style>
    </>
  );
};
