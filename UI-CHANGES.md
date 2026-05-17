# UI Changes Summary — 2026-05-05

## Changes Made

### 1. AUDIT #12 — Elevator-Themed Loading Screen (`App.tsx`)
**Before:** Basic pulsing dots with "The Normal Elevator" text inside `<Html>` from drei.
**After:** Custom `ElevatorLoadingScreen` component with:
- Animated elevator doors (left/right panels sliding open/closed via CSS `@keyframes`)
- Gap glow effect visible when doors are open
- Floor indicator light with blinking arrow at top
- 5-dot floor indicator strip with staggered pulse animation
- "Carregando..." text in monospace
- All CSS animations inline via `<style>` tag (no extra dependencies)
- Liminal aesthetic: dark background, amber/gold accents, brushed steel door texture

### 2. AUDIT #13 — Multiplayer Connection Indicator (`Multiplayer.tsx`, `HudComponents.tsx`)
**Before:** Simple green dot + "MP" or "{count} online" text.
**After:** Terminal-style readout showing:
- **Connection state:** `SYNC...` (connecting), `ONLINE` (connected), `OFFLINE` (error)
- **Player count:** Shows `{count} ONLINE` when others are present
- Visual: colored dot (green=online, amber=connecting, red=error) + monospace text
- Styled with dark background, subtle border, smaller font (terminal aesthetic)
- `connectionStatus` field added to `useMultiplayer` hook return value
- Status tracked via Firestore `onSnapshot` success/error callbacks

### 3. AUDIT #15 — Barney Dialogue Scroll Overflow (`HudComponents.tsx`)
**Before:** Options container had `max-h-[35vh]` but the outer wrapper had no height constraint — on mobile portrait, many options could push content off-screen.
**After:**
- Outer wrapper: `max-h-[85vh] landscape:max-h-[90vh] overflow-hidden flex flex-col`
- Inner card: `overflow-y-auto scrollbar-hide` — scrolls when content exceeds available space
- Options container retains `max-h-[35vh]` as secondary safety
- Portrait image + text + options all stay within viewport on mobile

### 4. CRITICAL: Sprite Carrossel Bug Fix (`ShopOverlay.tsx`)
**Bug:** CSS `animation` with `@keyframes bellhopClean/bellhopTalk` didn't reliably restart when switching sprite modes (clean → talk → idle-static). The `key={spriteMode}` approach forced React remount, but browsers may not restart CSS animations on remount.

**Fix:** Replaced ALL CSS sprite animations with JS-controlled `background-position`:
- New `useSpriteAnimation` custom hook:
  - Uses `useRef` for frame counter (no re-renders)
  - Writes `background-position-x` directly to DOM element via ref
  - Uses `setInterval` for frame stepping (predictable timing)
  - Properly cleans up on unmount and mode changes
- Applied to **both** the main bellhop sprite and the portrait head
- Removed `key={spriteMode}` from sprite div (no longer needed)
- Removed `@keyframes bellhopClean` and `@keyframes bellhopTalk` from CSS
- Removed `animation` CSS property from sprite and portrait elements
- Idle-static mode: interval not started (frame stays at 0), `background-position-x` reset to `0px`

**Why this works:** Direct DOM manipulation via refs is bulletproof — no React reconciliation, no browser animation state inheritance issues.

## Files Modified
- `jubileu/src/App.tsx` — Loading screen + connectionStatus destructure
- `jubileu/src/Multiplayer.tsx` — connectionStatus tracking
- `jubileu/src/HudComponents.tsx` — Terminal-style MP indicator + Barney scroll fix
- `jubileu/src/ShopOverlay.tsx` — JS-controlled sprite animation (complete rewrite of sprite logic)

## Build Status
- TypeScript: ✅ clean (`npx tsc --noEmit` — 0 errors)
- Build: ✅ reproducible (4,393,878 bytes)
- No new dependencies added
- All changes use Tailwind v4 + inline CSS
