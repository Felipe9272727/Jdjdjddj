/**
 * Design Tokens — The Normal Elevator
 * 
 * Single source of truth for all visual constants.
 * Import these instead of hardcoding values.
 * 
 * Scale: based on a modular scale (1.25 ratio) for harmonious proportions.
 */

// ─── Typography Scale (modular 1.25) ──────────────────────────────────────
// Base: 16px (1rem). Each step ×1.25
export const TYPE = {
  // Labels, captions, fine print
  caption:   'text-[10px] sm:text-xs',         // 10px → 12px
  // Small labels, HUD labels
  label:     'text-xs sm:text-sm',              // 12px → 14px
  // Body text, descriptions
  body:      'text-sm sm:text-base',            // 14px → 16px
  // Emphasized body
  bodyBold:  'text-sm sm:text-base font-bold',  // 14px → 16px
  // Subheadings
  sub:       'text-base sm:text-lg',            // 16px → 18px
  // Section headings
  heading:   'text-lg sm:text-xl',              // 18px → 20px
  // Large headings
  title:     'text-xl sm:text-2xl',             // 20px → 24px
  // Display text (hero, floor reveal)
  display:   'text-2xl sm:text-4xl',            // 24px → 32px
  // Giant display (main menu title)
  hero:      'text-4xl sm:text-6xl',            // 32px → 48px
} as const;

// ─── Monospace Scale (for HUD, timers, technical) ─────────────────────────
export const MONO = {
  tiny:      'font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.3em]',
  small:     'font-mono text-[10px] sm:text-xs uppercase tracking-[0.25em]',
  normal:    'font-mono text-xs sm:text-sm',
  large:     'font-mono text-base sm:text-lg font-bold tabular-nums',
  display:   'font-mono text-lg sm:text-2xl font-black tabular-nums',
} as const;

// ─── Spacing Scale (4px base) ─────────────────────────────────────────────
export const SPACE = {
  px:  'p-px',
  xs:  'p-1',        // 4px
  sm:  'p-2',        // 8px
  md:  'p-3',        // 12px
  lg:  'p-4',        // 16px
  xl:  'p-5',        // 20px
  '2xl': 'p-6',      // 24px
} as const;

// ─── Gap Scale ────────────────────────────────────────────────────────────
export const GAP = {
  xs:  'gap-1',      // 4px
  sm:  'gap-1.5',    // 6px
  md:  'gap-2',      // 8px
  lg:  'gap-3',      // 12px
  xl:  'gap-4',      // 16px
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────
export const RADIUS = {
  sm:  'rounded-md',     // 6px
  md:  'rounded-lg',     // 8px
  lg:  'rounded-xl',     // 12px
  xl:  'rounded-2xl',    // 16px
  full: 'rounded-full',
} as const;

// ─── Ring (border) ────────────────────────────────────────────────────────
export const RING = {
  none:  '',
  subtle: 'ring-1 ring-white/10',
  amber:  'ring-1 ring-amber-500/40',
  red:    'ring-1 ring-red-500/40',
  purple: 'ring-1 ring-purple-500/40',
  green:  'ring-1 ring-green-500/40',
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────
export const SHADOW = {
  sm:  'shadow-sm',
  md:  'shadow-md',
  lg:  'shadow-lg',
  xl:  'shadow-xl',
  glow: 'shadow-[0_0_20px_rgba(251,191,36,0.3)]',
} as const;

// ─── Component Patterns ───────────────────────────────────────────────────
export const COMPONENT = {
  // Glass panel (used for HUD elements)
  glass: 'bg-black/80 backdrop-blur-xl ring-1 ring-amber-500/40 rounded-xl',
  // Card (used for dialogue, settings)
  card: 'bg-gradient-to-b from-black/95 to-black/80 backdrop-blur-xl ring-1 ring-amber-500/40 rounded-xl shadow-xl',
  // Button base
  button: 'px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-bold tracking-wider active:scale-95 transition-transform',
  // Action button (ABRIR, FALAR, etc.)
  actionButton: 'px-4 sm:px-6 py-2.5 sm:py-3 rounded-full font-black tracking-wider shadow-2xl active:scale-95 transition-transform flex items-center gap-2 text-xs sm:text-sm',
  // HUD label
  hudLabel: 'font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.35em] text-amber-500/60',
  // HUD value
  hudValue: 'font-black tracking-widest text-amber-300',
  // Status indicator
  statusDot: 'w-2 h-2 rounded-full animate-pulse',
  // Bottom action anchor (safe-area aware)
  bottomAction: 'absolute left-1/2 -translate-x-1/2 z-50 pointer-events-auto bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] landscape:bottom-[calc(env(safe-area-inset-bottom,0px)+10px)]',
} as const;

// ─── Animation Durations ──────────────────────────────────────────────────
export const ANIM = {
  fast:   '150ms',
  normal: '300ms',
  slow:   '500ms',
  door:   '1200ms',
} as const;

// ─── Z-Index Layers ───────────────────────────────────────────────────────
export const Z = {
  canvas:    'z-0',
  overlay:   'z-20',
  hud:       'z-40',
  floorReveal: 'z-[45]',
  action:    'z-50',
  dialogue:  'z-[55]',
  sleep:     'z-[60]',
  saved:     'z-[70]',
  jumpscare: 'z-[80]',
  settings:  'z-[100]',
} as const;
