# AUDIT-REPORT.md — The Normal Elevator
> Full design-system & anti-pattern audit
> Generated: 2026-05-05 06:58 GMT+8

---

## Executive Summary

The project has a well-defined `design-tokens.ts` with typography, spacing, radius, shadow, and component tokens — but **almost nothing actually uses them**. Only 1 file (`components/GameHUD.tsx`) imports from `design-tokens.ts`. Meanwhile, 200+ hardcoded hex colors, inconsistent border-radius values, and tiny font sizes are scattered across the codebase. The `constants.ts` `COLORS` object is used in 3D scene code but ignored in UI components.

**Severity breakdown:**
- 🔴 Critical: 3 issues
- 🟡 High: 8 issues
- 🟢 Medium: 6 issues
- ⚪ Low/Info: 5 issues

---

## AUDIT #9 — Design Tokens Not Used

### Status: 🔴 CRITICAL

`design-tokens.ts` exports 10 token groups (`TYPE`, `MONO`, `SPACE`, `GAP`, `RADIUS`, `RING`, `SHADOW`, `COMPONENT`, `ANIM`, `Z`). Only **1 file** imports them:

| File | Imports | Actually Uses |
|------|---------|---------------|
| `components/GameHUD.tsx:2` | `TYPE, MONO, COMPONENT, Z` | ✅ Yes (some) |
| `App.tsx` | ❌ none | — |
| `MainMenu.tsx` | ❌ none | — |
| `Settings.tsx` | ❌ none | — |
| `ChatSystem.tsx` | ❌ none | — |
| `UI.tsx` | ❌ none | — |
| `HudComponents.tsx` | ❌ none | — |
| `Bot.tsx` | ❌ none | — |
| `ShopOverlay.tsx` | ❌ none | — |
| `RemotePlayer.tsx` | ❌ none | — |

### Token Usage Analysis (what SHOULD use tokens)

#### `TYPE` token (typography scale)
**Currently defined:** `caption`, `label`, `body`, `bodyBold`, `sub`, `heading`, `title`, `display`, `hero`

**Should be used in:**
| File | Line | Current | Token |
|------|------|---------|-------|
| `HudComponents.tsx` | 21 | `text-[10px] sm:text-xs` | `TYPE.caption` |
| `HudComponents.tsx` | 27 | `text-2xl sm:text-3xl font-black` | Custom (close to `TYPE.display`) |
| `HudComponents.tsx` | 106 | `text-[10px]` | `TYPE.caption` |
| `HudComponents.tsx` | 158 | `text-[11px] sm:text-sm` | Custom (between `TYPE.caption` and `TYPE.label`) |
| `HudComponents.tsx` | 175 | `text-base sm:text-lg` | `TYPE.sub` |
| `ChatSystem.tsx` | 123 | `text-xs` | `TYPE.label` |
| `ChatSystem.tsx` | 144 | `text-[13px]` | Custom (close to `TYPE.body`) |
| `ChatSystem.tsx` | 242 | `text-[11px]` | Custom |
| `Settings.tsx` | 149 | `text-2xl` | `TYPE.title` |
| `MainMenu.tsx` | 224 | `text-xs sm:text-sm` | `TYPE.label` |
| `MainMenu.tsx` | 232 | `text-xs` | `TYPE.label` |
| `Bot.tsx` | 173 | `text-[10px]` | `TYPE.caption` |

**Problem:** `TYPE` defines `caption` as `text-[10px] sm:text-xs` but many files use `text-[8px]` or `text-[9px]` (below the defined scale), and many use arbitrary sizes like `text-[11px]`, `text-[13px]` that don't map to any token.

#### `MONO` token (monospace scale)
**Should be used in:**
| File | Line | Current | Token |
|------|------|---------|-------|
| `HudComponents.tsx` | 40 | `text-xs font-mono` | `MONO.normal` |
| `Bot.tsx` | 173 | `text-[10px] font-mono` | `MONO.small` |
| `Bot.tsx` | 488 | `text-[10px] font-mono` | `MONO.small` |
| `Bot.tsx` | 565 | `text-[10px] font-mono` | `MONO.small` |
| `ChatSystem.tsx` | 124 | `text-[10px] font-mono` | `MONO.small` |

**Problem:** `MONO.tiny` is `text-[8px]` — but MEMORY.md says 8px was fixed to 10px. Yet `MONO.tiny` still defines 8px, creating a contradiction with the design audit fix.

#### `RADIUS` token (border-radius)
**Should be used in:** Every `rounded-*` class (see AUDIT #11 below).

#### `RING` token (border rings)
**Should be used in:**
| File | Line | Current | Token |
|------|------|---------|-------|
| `HudComponents.tsx` | 17 | `ring-1 ring-amber-500/40` | `RING.amber` |
| `HudComponents.tsx` | 104 | `ring-1 ring-white/10` | `RING.subtle` |
| `HudComponents.tsx` | 111 | `ring-1 ring-white/10` | `RING.subtle` |
| `HudComponents.tsx` | 158 | `ring-1 ring-red-500/40` | `RING.red` |
| `HudComponents.tsx` | 194 | `border-2 border-purple-500/50` | Custom (close to `RING.purple`) |
| `ChatSystem.tsx` | 296 | `border border-white/10` | Custom (close to `RING.subtle`) |
| `Bot.tsx` | 488 | `ring-1 ring-fuchsia-500/30` | Custom (not in RING) |
| `Bot.tsx` | 565 | `ring-1 ring-cyan-500/40` | Custom (not in RING) |
| `Settings.tsx` | 204 | `ring-1 ring-amber-500/30` | Close to `RING.amber` |

#### `COMPONENT` token (composite patterns)
**Should be used in:**
| File | Line | Current | Token |
|------|------|---------|-------|
| `HudComponents.tsx` | 17 | `bg-gradient-to-b from-black/95...rounded-xl` | `COMPONENT.card` |
| `HudComponents.tsx` | 104 | `bg-black/70 backdrop-blur-sm...rounded-full` | `COMPONENT.glass` (partial) |
| `HudComponents.tsx` | 147 | `px-4 sm:px-8 py-2.5...rounded-full font-black` | `COMPONENT.actionButton` |
| `App.tsx` | 530 | `rounded-xl bg-black/90 ring-1...backdrop-blur-xl` | `COMPONENT.glass` |
| `Settings.tsx` | 142 | `bg-gradient-to-b from-[#1a120a]...rounded-2xl` | Close to `COMPONENT.card` |

#### `Z` token (z-index layers)
**Should be used in:**
| File | Line | Current | Token |
|------|------|---------|-------|
| `Bot.tsx` | 488 | `z-[90]` | Not in Z (between `Z.jumpscare` and `Z.settings`) |
| `Bot.tsx` | 565 | `z-[90]` | Not in Z |
| `Settings.tsx` | 283 | `z-[91]` | Not in Z |
| `HudComponents.tsx` | 104 | No explicit z (inherits) | Should use `Z.hud` |

### Migration Plan

**Phase 1 — Low-risk imports (no visual change):**
1. Import `RING`, `RADIUS`, `Z` into `HudComponents.tsx`, `ChatSystem.tsx`, `Settings.tsx`, `Bot.tsx`
2. Replace matching inline classes with token references

**Phase 2 — Typography consolidation:**
1. Fix `MONO.tiny` from `text-[8px]` to `text-[10px]` (align with MEMORY.md fix)
2. Add missing sizes to `TYPE`: `fine` (11px), `mid` (13px)
3. Import `TYPE`/`MONO` into all UI files

**Phase 3 — Component patterns:**
1. Import `COMPONENT` into `HudComponents.tsx`, `App.tsx`, `Settings.tsx`
2. Replace duplicated glass/card/button patterns

**Phase 4 — Constants COLORS → design-tokens:**
1. Merge `constants.ts` `COLORS` into design-tokens or keep separate but document the split

---

## AUDIT #10 — Hardcoded Colors

### Status: 🔴 CRITICAL

**200+ hardcoded hex colors** found across `.tsx` files. Categorized below.

#### UI Component Colors (should use Tailwind or tokens)

| File | Line | Color | Context | Recommended |
|------|------|-------|---------|-------------|
| `ShopOverlay.tsx` | 200 | `#000` | `backgroundColor` | `bg-black` or token |
| `ShopOverlay.tsx` | 242 | `#1a0a08`, `#2a0e0c` | gradient bg | Custom token or Tailwind |
| `ShopOverlay.tsx` | 243 | `#C99B36` | `borderColor` | `border-amber-600` |
| `ShopOverlay.tsx` | 248 | `#FFD54F` | `color` | `text-amber-300` or `COLORS.elevDiamond` |
| `ShopOverlay.tsx` | 302 | `#ffffff` | `border` | `border-white` |
| `ShopOverlay.tsx` | 331 | `#C99B36` | `border` | `border-amber-600` |
| `ShopOverlay.tsx` | 333 | `#2a1a14`, `#1a0a08` | gradient | Custom token |
| `ShopOverlay.tsx` | 412 | `#FFD54F` | `color` | `text-amber-300` |
| `ShopOverlay.tsx` | 462-486 | `#FFD54F`, `#fff` | CSS keyframes | Tailwind or token |
| `ShopOverlay.tsx` | 525-529 | `#2a2a2e`, `#353539`, `#1f1f22`, `#1c1c20` | stripe bg | Define as token |
| `ShopOverlay.tsx` | 545-546 | `#C99B36`, `#6B4F1B` | inset shadow | `ring-amber-600` pattern |
| `HudComponents.tsx` | 194 | `#0d0411` | bg color | `bg-purple-950` or custom |
| `components/GameHUD.tsx` | 129 | `#0d0411` | bg color | Same as above |
| `App.tsx` | 509 | `#000` | `backgroundColor` | `bg-black` |
| `Settings.tsx` | 142 | `#1a120a` | gradient from | `from-amber-950` or custom |

#### SVG Stroke Colors (inline in JSX)

| File | Line | Color | Recommended |
|------|------|-------|-------------|
| `HudComponents.tsx` | 112 | `#fbbf24` | `stroke-amber-400` |
| `HudComponents.tsx` | 122 | `#f87171` | `stroke-red-400` |
| `HudComponents.tsx` | 124 | `#fbbf24` | `stroke-amber-400` |

#### Three.js Material Colors (3D scene — lower priority)

These are `meshStandardMaterial color="..."` and `pointLight color="..."` in 3D components. Many duplicate `COLORS` from `constants.ts`:

| File | Count | Examples | Notes |
|------|-------|----------|-------|
| `Atmosphere.tsx` | 12 | `#424242`, `#5D4037`, `#FFE0B2`, `#F5F0EB`, `#1a1a1a`, `#FF0000` | Mix of COLORS.metal/wood/light duplicates |
| `BuildingBlocks.tsx` | 30+ | `#E0E0E0`, `#9E9E9E`, `#FFD54F`, `#212121`, `#1a1a1a`, `#00FF00`, `#FF3333` | Many duplicate COLORS entries |
| `Furniture.tsx` | 10 | `#3E2723`, `#000`, `#4E342E`, `#FFFFFF`, `#CFD8DC`, `#212121`, `#5D4037` | Should use COLORS.sofa, COLORS.wood etc. |
| `Elevator.tsx` | 20+ | `#B0BEC5`, `#ffffff`, `#1a1a1a`, `#FFD54F`, `#9E9E9E`, `#FFF3E0`, `#37474F` | Many match COLORS.elevDoor, COLORS.metal etc. |
| `HouseEnv.tsx` | 30+ | `#212121`, `#3E2723`, `#A65E2E`, `#EEEEEE`, `#1565C0`, `#C62828`, `#FFD700`, `#81D4FA` | Mix of COLORS and scene-specific |
| `LobbyEnv.tsx` | 15+ | `#1a1410`, `#FFE0B2`, `#FFF8E1`, `#ffffff`, `#4E342E`, `#5D4037`, `#6A1B9A`, `#4A148C` | Lobby ambient colors |
| `PostEffects.tsx` | 3 | `#FFE0B2`, `#1a1a40` | Light/atmosphere colors |

**Total 3D hardcoded colors: ~120+**

Many of these duplicate entries in `constants.ts` `COLORS`:
- `#9E9E9E` → `COLORS.elevDoor` (used in Elevator.tsx, BuildingBlocks.tsx)
- `#B0BEC5` → `COLORS.metal` (used in Elevator.tsx)
- `#FFD54F` → `COLORS.elevDiamond` (used in Elevator.tsx, BuildingBlocks.tsx)
- `#4E342E` → `COLORS.sofa` (used in Furniture.tsx, LobbyEnv.tsx)
- `#5D4037` → `COLORS.wood` (used in Furniture.tsx, BuildingBlocks.tsx, LobbyEnv.tsx)
- `#FFE0B2` → `COLORS.light` (used in Atmosphere.tsx, LobbyEnv.tsx, PostEffects.tsx)
- `#6D4C41` → `COLORS.wood` (used in BuildingBlocks.tsx, HouseEnv.tsx)
- `#3E2723` → `COLORS.elevTrim` (used in Furniture.tsx, Elevator.tsx)
- `#81D4FA` → `COLORS.sky` (used in HouseEnv.tsx)
- `#212121` → not in COLORS but used 10+ times (dark gray, should be `COLORS.dark` or similar)

#### Name Colors in ChatSystem.tsx (hardcoded palette)

| Line | Colors | Notes |
|------|--------|-------|
| 14-16 | `#f87171`, `#fb923c`, `#fbbf24`, `#4ade80`, `#38bdf8`, `#a78bfa`, `#f472b6`, `#2dd4bf`, `#e879f9`, `#60a5fa`, `#34d399`, `#f59e0b` | Player name colors — 12-color palette |

These are intentionally distinct for player identification. **Recommendation:** Extract to `design-tokens.ts` as `PLAYER_COLORS` array.

#### Bot Colors (hardcoded)

| Line | Colors | Notes |
|------|--------|-------|
| `Bot.tsx:55-60` | `#fbbf24`, `#a78bfa`, `#34d399`, `#f472b6`, `#60a5fa`, `#fb923c` | Bot personality colors |

These overlap with ChatSystem name colors. **Recommendation:** Share the same palette constant.

#### Night Mode Colors (hardcoded)

| File | Line | Colors |
|------|------|--------|
| `HouseEnv.tsx` | 225-228 | `#05051a`, `#87CEEB`, `#C8E6F0`, `#1a2a1a` |
| `HouseEnv.tsx` | 233-234 | `#1a1a40`, `#E3F2FD`, `#0a0a30` |
| `LobbyEnv.tsx` | 75-76 | `#1a1410` |

**Recommendation:** Extract night/day color pairs to `COLORS` as `nightBg`, `nightFog`, `nightAmbient`, etc.

---

## AUDIT #11 — Border Radius Inconsistency

### Status: 🟡 HIGH

`design-tokens.ts` defines:
```
RADIUS.sm  = rounded-md    (6px)
RADIUS.md  = rounded-lg    (8px)
RADIUS.lg  = rounded-xl    (12px)
RADIUS.xl  = rounded-2xl   (16px)
RADIUS.full = rounded-full
```

#### Actual Usage Distribution

| Radius | Count | Files | Token Match |
|--------|-------|-------|-------------|
| `rounded` | 6 | Settings (×2), MainMenu (×1), ChatSystem (×1), Bot (×1), index.css | ⚠️ Not in RADIUS (4px) |
| `rounded-sm` | 8 | MainMenu (×7), Settings (×1) | ⚠️ Not in RADIUS (2px) |
| `rounded-md` | 4 | ChatSystem (×2), Bot (×1), RemotePlayer (×1) | ✅ `RADIUS.sm` |
| `rounded-lg` | 14 | HudComponents (×3), ChatSystem (×1), Settings (×2), App (×2), MainMenu (×3), components/GameHUD (×3) | ✅ `RADIUS.md` |
| `rounded-xl` | 16 | HudComponents (×3), ChatSystem (×3), Settings (×1), MainMenu (×3), UI (×1), App (×1), Bot (×2), RemotePlayer (×1), components/GameHUD (×3) | ✅ `RADIUS.lg` |
| `rounded-2xl` | 3 | HudComponents (×1), Settings (×1), MainMenu (×1) | ✅ `RADIUS.xl` |
| `rounded-full` | 25+ | HudComponents (×8), UI (×2), MainMenu (×8), Settings (×3), ChatSystem (×1), Bot (×1), components/GameHUD (×3) | ✅ `RADIUS.full` |
| `rounded-none` | 2 | HudComponents (×2) | ✅ (intentional) |
| `rounded-t-lg` | 1 | MainMenu | ⚠️ Compound (not in RADIUS) |
| `rounded-t-2xl` | 1 | MainMenu | ⚠️ Compound |
| `rounded-t-xl` | 1 | MainMenu | ⚠️ Compound |
| `rounded-t-sm` | 4 | MainMenu | ⚠️ Compound |
| `rounded-t` | 2 | MainMenu | ⚠️ Compound |
| `rounded-r` | 2 | MainMenu | ⚠️ Compound |
| `rounded-r-lg` | 2 | MainMenu | ⚠️ Compound |
| `rounded-l` | 1 | MainMenu | ⚠️ Compound |

#### Inconsistencies

1. **`rounded` vs `rounded-md` vs `rounded-lg`**: Used interchangeably for similar elements
   - Settings close button: `rounded` (Settings.tsx:149)
   - Settings row button: `rounded` (Settings.tsx:204)
   - Chat send button: `rounded-xl` (ChatSystem.tsx:301)
   - These serve similar purposes but use different radii

2. **`rounded-sm` not in scale**: `rounded-sm` (2px) used 8 times in MainMenu for elevator door panels and decorative elements. Not in `RADIUS` token.

3. **`rounded` (4px) not in scale**: Used 6 times. Falls between nothing and `RADIUS.sm`.

4. **Compound radii**: `rounded-t-lg`, `rounded-t-2xl`, `rounded-r-lg` etc. used for elevator UI elements. These are intentional (top-only rounding) but not captured in tokens.

5. **Barney dialogue**: Uses `rounded-xl` for buttons but `rounded-2xl` for the container — inconsistent with other cards that use `rounded-xl`.

### Proposed Standard

| Token | Value | Use Case |
|-------|-------|----------|
| `RADIUS.none` | `rounded-none` | Flat edges (images, overflow) |
| `RADIUS.xs` | `rounded-sm` | Subtle rounding (badges, small elements) |
| `RADIUS.sm` | `rounded-md` | Buttons, inputs, small cards |
| `RADIUS.md` | `rounded-lg` | Cards, panels, modals |
| `RADIUS.lg` | `rounded-xl` | Large panels, dialogue boxes |
| `RADIUS.xl` | `rounded-2xl` | Hero elements, main menu |
| `RADIUS.full` | `rounded-full` | Pills, circles, toggle knobs |
| `RADIUS.top.md` | `rounded-t-lg` | Top-only cards (elevator UI) |
| `RADIUS.top.lg` | `rounded-t-xl` | Top-only large panels |

---

## Anti-Pattern Scan

### AI Slop Tells

#### 1. Glassmorphism Overuse — 🟡 HIGH

**22 instances** of `backdrop-blur` across the codebase:

| File | Count | Pattern |
|------|-------|---------|
| `HudComponents.tsx` | 5 | `backdrop-blur-xl`, `backdrop-blur-sm` |
| `ChatSystem.tsx` | 0 | (clean) |
| `Settings.tsx` | 2 | `backdrop-blur-sm` |
| `MainMenu.tsx` | 4 | `backdrop-blur-sm`, `backdrop-blur-md` |
| `Bot.tsx` | 3 | `backdrop-blur-sm`, `backdrop-blur-md` |
| `UI.tsx` | 1 | `backdrop-blur-sm` |
| `App.tsx` | 1 | `backdrop-blur-xl` |
| `RemotePlayer.tsx` | 1 | `backdrop-blur-sm` |
| `components/GameHUD.tsx` | 2 | `backdrop-blur-xl` |

**Assessment:** For a liminal/horror game, glassmorphism is thematic (frosted glass in liminal spaces). However, `backdrop-blur-xl` (24px blur) is expensive on mobile GPUs. The `glass-panel` CSS class in `index.css` duplicates the `COMPONENT.glass` token — choose one.

**Recommendation:** Keep glassmorphism for thematic panels but:
- Use `backdrop-blur-sm` (4px) instead of `backdrop-blur-xl` (24px) on mobile
- Consolidate `glass-panel` CSS class with `COMPONENT` token
- Gate heavy blur behind quality profile (already partially done)

#### 2. Gradient Text — ✅ CLEAN

No `bg-clip-text text-transparent` or CSS `background-clip: text` patterns found. Good.

#### 3. Neon Accents — 🟢 MEDIUM

| File | Line | Pattern | Assessment |
|------|------|---------|------------|
| `HudComponents.tsx` | 27 | `textShadow: '0 0 25px rgba(251,191,36,0.7)'` | Amber glow on floor number — thematic |
| `HudComponents.tsx` | 39 | `textShadow: '0 0 10px rgba(255,255,255,0.3)'` | Subtle white glow on timer — OK |
| `index.css` | glow-pulse | `box-shadow: 0 0 20-40px amber` | Used sparingly |
| `index.css` | barney-glow | `box-shadow: 0 0 20-40px purple` | Thematic for Barney |
| `MainMenu.tsx` | 195 | `shadow-[0_0_8px_rgba(251,191,36,0.8)]` | Elevator indicator light — thematic |
| `Bot.tsx` | 178 | `boxShadow: 0 0 6px ${state.color}` | Bot status indicator |

**Assessment:** Glow effects are used purposefully (elevator lights, Barney horror, status indicators). Not gratuitous neon. **Acceptable for the game's aesthetic.**

#### 4. Excessive Animations — 🟢 MEDIUM

`index.css` defines 15+ custom animations. Most are gated behind `prefers-reduced-motion: reduce` ✅.

Concern: `animate-pulse` used 15+ times simultaneously could cause GPU strain on low-end devices.

---

### Accessibility Issues

#### 1. Contrast Issues — 🟡 HIGH

**Remaining low-contrast text:**

| File | Line | Class | Contrast Ratio (est.) | Issue |
|------|------|-------|----------------------|-------|
| `HudComponents.tsx` | 40 | `text-white/40` | ~2.1:1 on dark bg | Fails WCAG AA |
| `HudComponents.tsx` | 53 | `text-amber-400/60` | ~2.8:1 | Borderline |
| `ChatSystem.tsx` | 123 | `text-white/60` | ~3.5:1 | Passes AA large text only |
| `ChatSystem.tsx` | 208 | `text-white/50` | ~2.8:1 | Fails AA |
| `ChatSystem.tsx` | 242 | `text-white/50` | ~2.8:1 | Fails AA |
| `Bot.tsx` | 499 | `text-white/35` | ~1.8:1 | Fails AA badly |
| `Bot.tsx` | 503 | `text-fuchsia-100/80` | ~3.2:1 | Borderline |
| `App.tsx` | 641 | `text-white/40` | ~2.1:1 | "zzz..." sleep text |
| `components/GameHUD.tsx` | 36 | `text-white/40` | ~2.1:1 | Timer "s" suffix |
| `components/GameHUD.tsx` | 41 | `text-green-400/80` | ~3.0:1 | "Arrived" label |
| `components/GameHUD.tsx` | 49 | `text-amber-400/60` | ~2.8:1 | "Status" label |
| `components/GameHUD.tsx` | 77 | `text-amber-500/70` | ~3.0:1 | "Now Arriving" |

**Note:** Prior audit (MEMORY.md) says `text-white/10` → `text-white/25` etc. was fixed. But the GameHUD.tsx component (which duplicates HudComponents.tsx) still has `text-[8px]` and low-opacity text.

#### 2. Font Size Issues — 🟡 HIGH

**4px font sizes still exist** in `components/GameHUD.tsx`:

| File | Line | Size | Issue |
|------|------|------|-------|
| `components/GameHUD.tsx` | 17 | `text-[8px] sm:text-[9px]` | Below minimum readable size |
| `components/GameHUD.tsx` | 30 | `text-[8px]` | Below minimum |
| `components/GameHUD.tsx` | 41 | `text-[8px]` | Below minimum |
| `components/GameHUD.tsx` | 49 | `text-[8px]` | Below minimum |

**Note:** `HudComponents.tsx` (the newer version) uses `text-[10px]` — but `components/GameHUD.tsx` (the older duplicate) still has 8px. This is a **code duplication issue** — two files doing the same thing with different quality.

#### 3. ARIA Labels — 🟢 MEDIUM (mostly good)

**Has aria-labels:**
- ✅ Settings button (HudComponents.tsx:109)
- ✅ Mute button (HudComponents.tsx:118)
- ✅ Action buttons (HudComponents.tsx:145)
- ✅ Barney response buttons (HudComponents.tsx:220)
- ✅ Chat inputs (ChatSystem.tsx:184, 294)
- ✅ Settings close (Settings.tsx:150)
- ✅ Fullscreen button (MainMenu.tsx:159)
- ✅ Error button (App.tsx:12)
- ✅ Toggle switch (Settings.tsx:248) — `aria-pressed`

**Missing aria-labels:**
- ❌ `ShopOverlay.tsx` — close button (line 247) has no `aria-label`
- ❌ `ShopOverlay.tsx` — menu option buttons (lines 331+) have no `aria-label`
- ❌ `ChatSystem.tsx` — close button (line 247) has `className` but check for label
- ❌ `MainMenu.tsx` — play button (line 263/314) has no `aria-label`
- ❌ `MainMenu.tsx` — multiplayer toggle (lines 233/284/392) has no `aria-label`
- ❌ `MainMenu.tsx` — share button (lines 251/302/397) has no `aria-label`

#### 4. Keyboard Navigation — 🟢 MEDIUM

- ✅ `focus-visible` styles defined in `index.css` (amber outline)
- ✅ `tap-target` class (44px min) applied to interactive elements
- ✅ ESC closes settings and shop
- ✅ "/" opens chat
- ❌ No visible focus indicators on 3D interaction prompts
- ❌ Shop overlay menu options may not be keyboard-navigable (no `tabIndex` or `role="menu"`)

#### 5. Screen Reader Support — 🟡 HIGH

- ❌ No `role="dialog"` on Settings overlay
- ❌ No `role="dialog"` on Shop overlay
- ❌ No `role="dialog"` on Barney dialogue
- ❌ No `aria-modal="true"` on any modal
- ❌ No `aria-live` region for chat messages (screen readers won't announce new messages)
- ❌ No `aria-live` for floor reveal text
- ❌ No skip-to-content mechanism (not critical for a game, but nice for menu)

---

### Responsive Design Issues

#### 1. Mobile-specific concerns — 🟢 MEDIUM

- ✅ `sm:` breakpoints used consistently for desktop scaling
- ✅ `landscape:` variants for horizontal orientation
- ✅ Safe area insets handled via `hud-fixed` class
- ✅ `tap-target` class for minimum touch size
- ⚠️ `text-[10px]` on mobile is very small (10px on a 5" screen)
- ⚠️ Some `max-w-[calc(100vw-2rem)]` patterns could overflow on very narrow screens

#### 2. `components/GameHUD.tsx` vs `HudComponents.tsx` — 🔴 CRITICAL

**Two nearly identical files exist:**
- `HudComponents.tsx` — newer, better quality (10px fonts, better contrast)
- `components/GameHUD.tsx` — older, worse quality (8px fonts, lower contrast)

Both export similar components (`ElevatorHud`, `FloorReveal`, `NightBanner`, etc.). Only `GameHUD.tsx` imports design tokens, but `HudComponents.tsx` is the one actually used in `App.tsx`.

**This is dead code + a maintenance trap.** Any fix to one won't apply to the other.

---

## Summary of All Issues

### 🔴 Critical (3)

| # | Issue | Files | Action |
|---|-------|-------|--------|
| C1 | Design tokens defined but unused | All UI files | Import and use tokens |
| C2 | 200+ hardcoded hex colors | All `.tsx` files | Migrate to COLORS/tokens |
| C3 | Duplicate components (GameHUD vs HudComponents) | `components/GameHUD.tsx`, `HudComponents.tsx` | Delete `components/GameHUD.tsx` |

### 🟡 High (8)

| # | Issue | Files | Action |
|---|-------|-------|--------|
| H1 | Border-radius inconsistencies (6 different scales) | All UI files | Standardize on RADIUS tokens |
| H2 | 8px font sizes in GameHUD.tsx | `components/GameHUD.tsx` | Delete file or fix to 10px |
| H3 | Low-contrast text (`text-white/40`, `text-white/35`) | 10+ locations | Raise to minimum /50 |
| H4 | MONO.tiny still defines 8px | `design-tokens.ts` | Update to 10px |
| H5 | Missing aria-labels on Shop/Menu buttons | `ShopOverlay.tsx`, `MainMenu.tsx` | Add labels |
| H6 | Missing `role="dialog"` on modals | Settings, Shop, Barney dialogue | Add ARIA roles |
| H7 | No `aria-live` for chat messages | `ChatSystem.tsx` | Add live region |
| H8 | `backdrop-blur-xl` performance on mobile | 6 files | Gate behind quality profile |

### 🟢 Medium (6)

| # | Issue | Files | Action |
|---|-------|-------|--------|
| M1 | `rounded` and `rounded-sm` not in RADIUS token | `design-tokens.ts` | Add `RADIUS.xs` |
| M2 | `constants.ts` COLORS duplicates hardcoded values | 3D files | Use COLORS consistently |
| M3 | Night/day color pairs hardcoded | `HouseEnv.tsx`, `LobbyEnv.tsx` | Extract to COLORS |
| M4 | Bot + Chat name colors overlap | `Bot.tsx`, `ChatSystem.tsx` | Share palette constant |
| M5 | `glass-panel` CSS class duplicates `COMPONENT.glass` | `index.css`, `design-tokens.ts` | Consolidate |
| M6 | `text-[13px]` arbitrary size in ChatSystem | `ChatSystem.tsx` | Map to TYPE token |

### ⚪ Low/Info (5)

| # | Issue | Files | Action |
|---|-------|-------|--------|
| L1 | 15+ CSS animations (GPU concern) | `index.css` | Already gated by reduced-motion |
| L2 | `animate-pulse` used 15+ times | Multiple | Consider limiting simultaneous pulses |
| L3 | Glow effects on HUD elements | Multiple | Acceptable for game aesthetic |
| L4 | `textShadow` inline styles | `HudComponents.tsx`, `MainMenu.tsx` | Could extract to token |
| L5 | Shop overlay `aria-hidden` on decorative SVGs | `ShopOverlay.tsx` | Correct usage ✅ |

---

## Recommended Fix Priority

1. **Delete `components/GameHUD.tsx`** — dead code, maintenance trap (C3)
2. **Fix `MONO.tiny`** — 8px → 10px in `design-tokens.ts` (H4)
3. **Raise low-contrast text** — all `text-white/35-40` → minimum `/50` (H3)
4. **Import tokens into UI files** — start with `RING`, `RADIUS`, `Z` (C1)
5. **Add ARIA roles/labels** — dialogs + missing buttons (H5, H6, H7)
6. **Migrate hardcoded colors** — UI hex → Tailwind classes (C2, Phase 1)
7. **Standardize border-radius** — use RADIUS tokens (H1)
8. **Gate backdrop-blur** — behind quality profile on mobile (H8)

---

*Audit complete. No files were modified.*
