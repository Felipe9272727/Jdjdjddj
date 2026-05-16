# Performance Analysis Report — The Normal Elevator

> **Date:** 2026-05-05  
> **Baseline:** index.html ~4.1MB, runs at 60fps on Felipe's machine  
> **Context:** Past optimization attempt (2026-04-28) dropped FPS from 60→29 due to dependency changes. This report identifies optimizations that do NOT touch dependencies.

---

## Executive Summary

The codebase is already **reasonably well-optimized** for a React Three Fiber game. The multiplayer ref pattern (dataRef + otherPlayersDataRef) was already implemented. Quality profiles gate expensive features. Distance culling exists on CeilingFan, WallClock, Dussekar, and DustParticles.

**However**, there are still meaningful gains available in 5 areas:

| # | Issue | Impact | Risk |
|---|-------|--------|------|
| 1 | Dead npm dependencies in bundle | ~500KB-1MB wasted | LOW |
| 2 | `useFrame` → `setState` in RemotePlayer (chat bubble) | Minor re-renders on chat | LOW |
| 3 | `BotAvatar` GLB clone per bot | Memory × N bots | MEDIUM |
| 4 | Point light count (14+) in high quality | GPU fragment cost | LOW |
| 5 | App.tsx keyboard effect re-registration | Frequent listener churn | LOW |

---

## Issue #1: Dead Dependencies (Bundle Size)

**File:** `jubileu/package.json` (lines 14-29)  
**Impact:** ~500KB-1MB of dead JavaScript shipped in the bundle  
**Risk:** LOW — just remove unused deps

### Problem

These packages are listed in `dependencies` but **never imported** in any source file:

| Package | Approx Size | Used? |
|---------|-------------|-------|
| `motion` (^12.23.24) | ~150KB gzip | ❌ No imports found |
| `lucide-react` (^0.546.0) | ~200KB gzip | ❌ No imports found |
| `@google/genai` (^1.29.0) | ~100KB gzip | ❌ No imports found |
| `express` (^4.21.2) | ~60KB gzip | ❌ No imports found |
| `dotenv` (^17.2.3) | ~5KB gzip | ❌ No imports found |

Vite's tree-shaking removes unused **imports**, but these packages may still leave dead code if they have side effects or if Vite can't fully eliminate them. Even if perfectly tree-shaken, they bloat `node_modules` and slow `npm ci`.

### Fix

```json
// package.json — remove from dependencies:
// "motion": "^12.23.24",
// "lucide-react": "^0.546.0",
// "@google/genai": "^1.29.0",
// "express": "^4.21.2",
// "dotenv": "^17.2.3",
```

After removal: `npm ci && npm run build && node inline-build.mjs` and verify the output size decreases.

### Also: `three-stdlib` is an implicit dependency

`Bot.tsx` and `RemotePlayer.tsx` import `SkeletonUtils` from `three-stdlib`, which is NOT in `package.json`. It works because `@react-three/drei` pulls it in transitively. This is fragile — if drei changes its deps, the build breaks. Consider adding `three-stdlib` explicitly to `dependencies`.

---

## Issue #2: RemotePlayer Chat Bubble Re-renders

**File:** `jubileu/src/RemotePlayer.tsx` (line 123)  
**Impact:** Minor — triggers a React re-render for each new chat message  
**Risk:** LOW

### Problem

Inside `useFrame`, the component calls `setChatBubble(...)` when a new chat message arrives:

```tsx
// RemotePlayer.tsx line 123
if (data.chatMsg && data.chatAt && data.chatAt !== lastChatAtRef.current && ...) {
    lastChatAtRef.current = data.chatAt;
    setChatBubble({ msg: data.chatMsg, key: data.chatAt }); // ← React re-render
}
```

This is actually well-guarded (only fires on new messages, ~8s TTL), so the impact is small. But the `Html` component re-renders too, which involves DOM updates.

### Proposed Fix

Move the chat bubble to a ref-based DOM element created once, updated imperatively:

```tsx
const chatBubbleRef = useRef<HTMLDivElement | null>(null);
const chatBubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useFrame((_, dt) => {
    // ... existing position/rotation/animation logic ...
    
    // Chat bubble — imperative update, no React re-render
    if (data.chatMsg && data.chatAt && data.chatAt !== lastChatAtRef.current && Date.now() - data.chatAt < CHAT_BUBBLE_TTL_MS) {
        lastChatAtRef.current = data.chatAt;
        if (chatBubbleRef.current) {
            chatBubbleRef.current.textContent = data.chatMsg;
            chatBubbleRef.current.style.display = 'block';
            if (chatBubbleTimeoutRef.current) clearTimeout(chatBubbleTimeoutRef.current);
            chatBubbleTimeoutRef.current = setTimeout(() => {
                if (chatBubbleRef.current) chatBubbleRef.current.style.display = 'none';
            }, CHAT_BUBBLE_TTL_MS);
        }
    }
});
```

**However**, this means losing the `<Html>` component's automatic 3D positioning. The tradeoff may not be worth it given how infrequently chat fires. **Verdict: LOW priority.**

---

## Issue #3: BotAvatar GLB Clone Per Instance

**File:** `jubileu/src/Bot.tsx` (line ~115, `BotAvatar` component)  
**Impact:** Each bot clones the full walking + idle GLB scene (~1-2MB GPU memory per clone)  
**Risk:** MEDIUM — changes bot rendering approach

### Problem

Every `BotAvatar` runs:
```tsx
const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
```

With 6 bots, that's 6 full skeleton clones of the avatar GLB. Each clone has its own mesh instances, materials, and bone hierarchy. This is necessary for independent animations, but expensive in memory.

Additionally, each `BotAvatar` creates its own `useAnimations` hook with cloned animation clips:
```tsx
const anims = useMemo(() => {
    const w = walkAnims.map((a: any) => a.clone(true)); // full clone
    const i = idleAnims.map((a: any) => a.clone(true));
    return [...i, ...w];
}, [walkAnims, idleAnims]);
```

### Proposed Fix

This is inherent to the current approach (each bot needs independent animation state). The only way to reduce cost would be:

1. **Instanced mesh with custom shader** — very complex, not worth it for <10 bots
2. **Limit bot count** — already gated by `settings.botMode` (off by default)
3. **Share animation clips** — clone only the `AnimationClip` data, not the full scene. Use a shared `THREE.AnimationMixer` per bot instead of per-clone.

**Verdict: Bot mode is opt-in and primarily for dev/testing. LOW priority unless bot count exceeds 10.**

---

## Issue #4: Point Light Count

**Files:** Multiple (`App.tsx`, `Atmosphere.tsx`, `HouseEnv.tsx`, `BuildingBlocks.tsx`, `Elevator.tsx`, `PostEffects.tsx`)  
**Impact:** Each point light adds per-fragment lighting calculations to every mesh in range  
**Risk:** LOW — quality profiles already gate some lights

### Current Light Count (High Quality, Level 0 — Lobby)

| Light | Source | Distance | Always On? |
|-------|--------|----------|------------|
| Ambient | LobbyEnv | ∞ | ✅ |
| Lobby center | App.tsx (FluorescentFlicker) | 22 | ✅ (high only) |
| Lobby back | LobbyEnv | 12 | ✅ |
| Elevator interior | Elevator.tsx | 15 | ✅ |
| Elevator sign | ElevatorFacade | 4 | ✅ |
| Ceiling fan ×2 | Atmosphere.tsx | 6 each | ✅ (high only) |
| Cashier lamp | BuildingBlocks.tsx | 3 | ✅ |
| Reception spot | BuildingBlocks.tsx | 3 | ✅ |
| Floor lamp ×3 | BuildingBlocks.tsx | — | ❌ (no light, just mesh) |

**Total active lights in lobby (high):** ~8 point lights + 1 ambient  
**Total active lights in lobby (medium/low):** ~5 point lights + 1 ambient

### Current Light Count (High Quality, Level 1 — House)

| Light | Source |
|-------|--------|
| Ambient | FlatMapEnvironment |
| Hemisphere | FlatMapEnvironment |
| Directional | FlatMapEnvironment |
| Sun/Moon pointLight | FlatMapEnvironment |
| House interior | HouseEnv |
| NightAmbient | PostEffects (night only) |
| Barney red light | HouseEnv (chase only) |

**Total in house:** ~5-7 lights

### Analysis

8-10 point lights is within reason for Three.js (the default max is 5 for `meshStandardMaterial`, but Three.js handles more by batching). The main cost is **shadow maps** — but there are **no shadow maps** in this project (no `castShadow`/`receiveShadow` found). Good.

### Proposed Optimization

The only easy win: the `CeilingFan` component creates a `pointLight` per fan (2 in the lobby). These contribute minimally to the scene (distance=6, intensity=0.5). Consider removing them on medium quality:

```tsx
// Atmosphere.tsx — CeilingFan
// Already gated by profile.atmosphere in App.tsx, so this is only high quality.
// The light is decorative — could be removed for a small GPU save.
```

**Verdict: LOW priority. Lights are already quality-gated and no shadows exist.**

---

## Issue #5: App.tsx Keyboard Effect Re-registration

**File:** `jubileu/src/App.tsx` (line ~290, keyboard useEffect)  
**Impact:** The `useEffect` for keyboard handlers has a large dependency array that changes frequently  
**Risk:** LOW

### Problem

```tsx
useEffect(() => {
    // ...keydown/keyup handlers...
}, [isDesktop, hasStarted, dialogueOpen, barneyDialogueOpen, shopOpen, 
    canInteractNPC, canInteractCashier, canInteractDoor, houseDoorOpen, 
    canSleepNow, gameState]);
```

Every time any of these 11 values change, the old listeners are removed and new ones are added. While the actual cost is minimal (addEventListener is cheap), it's a code smell.

### Proposed Fix

Use refs for the closure-captured values so the effect only runs once:

```tsx
const canInteractNPCRef = useRef(canInteractNPC);
const canInteractCashierRef = useRef(canInteractCashier);
// ... etc for each dependency ...
useEffect(() => { canInteractNPCRef.current = canInteractNPC; }, [canInteractNPC]);
// ... etc ...

useEffect(() => {
    const kd = (e: KeyboardEvent) => {
        // Read from refs instead of closure
        if (canInteractNPCRef.current) { /* ... */ }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
}, []); // empty deps — runs once
```

**Verdict: LOW priority. The current pattern works correctly, just creates minor GC pressure.**

---

## Issue #6: `* as THREE` Imports

**Files:** `Atmosphere.tsx`, `Materials.tsx`, `Player.tsx`, `HouseEnv.tsx`, `LobbyEnv.tsx`, `BuildingBlocks.tsx`, `Elevator.tsx`, `Bot.tsx`, `PostEffects.tsx`  
**Impact:** Minor — may prevent tree-shaking of unused THREE exports  
**Risk:** LOW

### Problem

Most files import `import * as THREE from 'three'`, which pulls in the entire Three.js namespace. While Vite/Rollup can tree-shake this in some cases, named imports are more reliable:

```tsx
// Current (may prevent tree-shaking):
import * as THREE from 'three';
// Used: THREE.MathUtils.lerp, THREE.Box3, THREE.Object3D, THREE.DoubleSide

// Better:
import { MathUtils, Box3, Object3D, DoubleSide, ... } from 'three';
```

### Analysis

Since the project uses `@react-three/fiber` and `@react-three/drei`, Three.js is already a core dependency and mostly all used. The tree-shaking savings would be minimal (~5-10KB at most). However, named imports are cleaner code.

**Verdict: LOW priority. Cosmetic improvement, minimal perf impact.**

---

## Issue #7: Player.tsx setAnim in useFrame

**File:** `jubileu/src/Player.tsx` (line ~230)  
**Impact:** Could cause re-renders every frame if animation state oscillates  
**Risk:** NONE — already correctly handled

### Analysis

```tsx
setAnim(moving ? 'Walking' : 'Idle');
```

This is called every frame in `useFrame`. However, React's functional updater pattern means `useState` won't trigger a re-render if the new value equals the old value. The `Avatar` component also correctly handles animation transitions via `useAnimations` with `fadeIn`/`fadeOut`.

**Verdict: No action needed. Already optimized.**

---

## Issue #8: Html Component Overhead

**Files:** `RemotePlayer.tsx` (lines 140-155), `HouseEnv.tsx` (Dussekar), `Bot.tsx` (BotAvatar)  
**Impact:** Each `<Html>` creates a CSS3DRenderer overlay that's repositioned every frame  
**Risk:** LOW

### Problem

Each `<Html>` from drei creates a separate DOM element that's positioned via matrix math every frame. Per RemotePlayer, there are 2 `<Html>` instances (name label + chat bubble). With 8 remote players on medium quality, that's 16 DOM overlays being repositioned at 60fps.

### Analysis

This is the standard approach for 3D labels in R3F. The alternatives (billboard sprites, canvas textures) are more complex. The `<Html>` component does NOT use `occlude` (which was the past FPS killer — see MEMORY.md). Current usage is correct.

**Verdict: No action needed. The tradeoff (DOM labels vs sprite textures) is intentional.**

---

## Issue #9: TextureMaterial Clone Per Instance

**File:** `jubileu/src/Materials.tsx` (line 10)  
**Impact:** Each `TextureMaterial` clones the texture for custom repeat/rotation settings  
**Risk:** LOW

### Problem

```tsx
const map = useMemo(() => {
    const c = (texture as THREE.Texture).clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat[0], repeat[1]);
    // ...
    return c;
}, [texture, rKey, rotation]);
```

Each wall panel, floor, and ceiling creates its own texture clone. With ~20 TextureMaterial instances in the lobby, that's 20 texture clones in GPU memory.

### Analysis

Most textures use the same source URL but different repeat values. A texture atlas or shared texture with per-instance UV transforms would reduce this, but the complexity isn't worth it for ~20 textures.

**Verdict: No action needed. 20 textures is well within budget.**

---

## Issue #10: LobbyNPC Animation Clips

**File:** `jubileu/src/LobbyEnv.tsx` (line 12)  
**Impact:** NPC clones animation clips on every render cycle  
**Risk:** LOW

### Problem

```tsx
const { actions } = useAnimations(useMemo(() => {
    const w = walkAnims.map((a: any) => { const c = a.clone(true); c.name = "Walking"; return c; });
    const i = idleAnims.map((a: any) => { const c = a.clone(true); c.name = "Idle"; return c; });
    return [...i, ...w];
}, [walkAnims, idleAnims]), group);
```

The `useMemo` deps `[walkAnims, idleAnims]` — these are stable references from `useGLTF` (cached), so the clone only happens once. This is correct.

**Verdict: No action needed.**

---

## Summary of Actionable Items (Priority Order)

| Priority | Issue | Effort | Expected Gain |
|----------|-------|--------|---------------|
| 🔴 HIGH | Remove dead deps from package.json | 5 min | ~500KB bundle, faster npm ci |
| 🟡 MED | Add `three-stdlib` to explicit deps | 1 min | Build reliability |
| 🟢 LOW | Keyboard effect ref pattern | 15 min | Minor GC reduction |
| 🟢 LOW | Named THREE imports | 30 min | ~5-10KB, cleaner code |
| ⚪ NONE | Everything else | — | Already optimized |

---

## What's Already Done Well ✅

1. **Multiplayer ref pattern** — `otherPlayersDataRef` Map + `otherPlayerIds` state, only re-renders on join/leave
2. **RemotePlayer dataRef** — position/rotation read from ref in useFrame, no React re-render per 200ms update
3. **Quality profiles** — gates atmosphere, overlay, nightLights, chatBubbles3D, remoteLimit
4. **Distance culling** — CeilingFan (>14u), WallClock (>12u), Dussekar (>12u)
5. **Frame throttling** — DustParticles (every 3rd frame), FluorescentFlicker (~10fps), WallClock (~10fps), CeilingFan (~20fps)
6. **Pre-built wall lists** — `wallsForState()` in constants.ts, zero allocation per frame
7. **GLB preloading** — `useGLTF.preload()` at module top for all GLBs
8. **React.memo** — Used on all static scene components (BuildingBlocks, Furniture, Elevator)
9. **No shadow maps** — Zero `castShadow`/`receiveShadow` in the entire codebase
10. **CSS post-processing** — GameEffects uses CSS overlay instead of EffectComposer (zero GPU cost)
11. **InstancedMesh** — Trees use `<Instances>` from drei (single draw call per tree type)
12. **No `<Html occlude>`** — The FPS-killing occlude prop was removed after the 60→29 incident

---

## Monitoring Recommendations

To track performance going forward:

1. **Chrome DevTools Performance tab** — Record 10s of gameplay, check for long tasks >16ms
2. **Three.js `renderer.info`** — Check `render.calls`, `render.triangles`, `memory.geometries`, `memory.textures`
3. **React DevTools Profiler** — Identify which components re-render during gameplay
4. **Lighthouse** — Run on the deployed `index.html` for bundle/perf scores

---

*Report generated by optimize-agent on 2026-05-05*
