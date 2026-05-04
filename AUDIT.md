# 🔍 Code Audit Report — "The Normal Elevator"

**Date:** 2026-05-04  
**Branch:** `refactor/code-quality-audit`  
**Auditor:** Automated Code Audit Agent  

---

## 🔴 Critical

### 1. Firebase API Key Committed to Repository
**File:** `jubileu/firebase-applet-config.json`  
The Firebase config file (containing `apiKey`, `projectId`, `appId`) is committed to the public GitHub repo. While Firebase client keys are "semi-public," combined with the permissive Firestore rules below, this enables any attacker to read/write/delete all player data programmatically.  
**Fix:** Add `firebase-applet-config.json` to `.gitignore`, load config from env vars (`import.meta.env.VITE_FIREBASE_*`), or use Firebase App Check.

### 2. Firestore Rules: No Real Authentication
**File:** `jubileu/firestore.rules` (line 22)  
```js
function isOwner(userId) { return true; }
```
The `isOwner` function **always returns true**. There is no Firebase Auth — the "player ID" is a `localStorage` UUID. Any client can:
- Write to **any** other player's document (spoof position, inject chat, change name)
- **Delete any player's document** (line 64: `allow delete: if isValidId(worldId) && isValidId(userId)`)
- Read all active player data

This is effectively an **open database**.  
**Fix:** Implement Firebase Anonymous Auth. Replace `isOwner` with `request.auth != null && request.auth.uid == userId`. Restrict delete to admin or owner.

### 3. No Error Boundary Around 3D Canvas
**File:** `App.tsx` (line 31–43)  
Good news: a `CanvasErrorBoundary` **does exist** and wraps the Canvas. However, it only catches render errors — unhandled promise rejections from `useGLTF` (network failures, corrupt GLB) or WebGL context loss are not caught.  
**Fix:** Add `onError` handler for Suspense fallback, handle `webglcontextlost` event on the canvas element.

### 4. `useGLTF` Clone Without `dispose()` on Unmount
**File:** `RemotePlayer.tsx` (line 36), `Bot.tsx`  
`SkeletonUtils.clone(scene)` creates new geometries/materials per remote player. When a player disconnects (component unmounts), `clonedScene` is never explicitly disposed. With 5+ players joining/leaving, GPU memory leaks accumulate.  
**Fix:** Add cleanup in `useEffect` return:
```ts
useEffect(() => {
  return () => {
    clonedScene.traverse((child) => {
      if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); }
    });
  };
}, [clonedScene]);
```

---

## 🟡 Medium

### 5. `any` Types Pervasive Throughout
**Files:** `Multiplayer.tsx` (lines 15, 23, 89, 216, 236), `Player.tsx` (lines 13–14), `AudioEngine.tsx` (all props), `App.tsx` (WorldProps.profile)  
At least 15 uses of `as any` or untyped props. Key concerns:
- `AudioEngine` props are entirely `any` — no type safety on audio context, volume, etc.
- `useGLTF` returns typed but immediately cast to `any`
- `WorldProps.profile` is `any`
- Firestore snapshot data accessed as `any` without validation

**Fix:** Define interfaces for `AudioEngineProps`, `GLTFResult`, `QualityProfile`. Enable `strict: true` in tsconfig. Use type guards on Firestore data.

### 6. Design Tokens Defined but Not Used
**File:** `design-tokens.ts` vs all UI files  
Tokens exist (`TYPE`, `RADIUS`, `COMPONENT`, `Z`, etc.) but no file imports them. All components use hardcoded Tailwind classes (`rounded-full`, `rounded-lg`, `rounded-2xl`, `text-xs`, `z-50`, etc.). This defeats the purpose of a design system.  
**Fix:** Refactor `HudComponents.tsx`, `UI.tsx`, `ChatSystem.tsx`, `Settings.tsx` to import from `design-tokens.ts`. Consider mapping tokens to Tailwind `theme.extend`.

### 7. `AudioEngine` — AudioContext Not Reused Across Components
**File:** `AudioEngine.tsx`, `App.tsx` (line 164)  
The `AudioContext` is created in `App.tsx` and stored in state, but `UI.tsx` accesses it via `(window as any).__jubileuAudioCtx` (a global). Multiple components create their own oscillators/gain nodes without coordination.  
**Fix:** Create a single `AudioContextProvider` context. Pass via React context instead of window globals.

### 8. Re-renders from Interaction State Callbacks
**File:** `App.tsx` (lines 177–180)  
`handleInteractionUpdate`, `handleNpcInteractionUpdate`, `handleCashierInteractionUpdate` call `setState` on every frame when the player is near an interactable. Even though they use the `p !== c ? c : p` pattern (which prevents unnecessary re-renders), the callback itself runs 60×/sec.  
**Fix:** Throttle interaction checks to ~10Hz (every 100ms) instead of every frame.

### 9. Chase Distance Check Uses `setInterval(100ms)` Instead of `useFrame`
**File:** `App.tsx` (line 163)  
The chase sequence checks Barney-player distance via `setInterval` at 100ms. This is independent of the render loop and can cause visual desync (jumpscare triggers before Barney visually reaches the player).  
**Fix:** Move distance check into the R3F `useFrame` loop for frame-accurate detection.

### 10. Firestore Write Queue — Potential Starvation
**File:** `Multiplayer.tsx` (lines 211–233)  
The `push()` function uses `writeInFlight` + `writeQueued` flags. If Firestore is slow (high latency), writes queue up and only the latest state is written — which is correct. However, the `setInterval` at `MP_WRITE_INTERVAL` (200ms) can call `push()` while a write is in-flight, and the queued write runs immediately after. Under sustained network issues, this creates a tight loop of failed writes.  
**Fix:** Add exponential backoff on write errors. Skip the queued write if the previous one failed.

---

## 🟢 Low

### 11. No Connection Status Indicator
**Files:** `Multiplayer.tsx`, `App.tsx`  
No UI feedback when Firestore disconnects or reconnects. Players won't know if they're playing offline.  
**Fix:** Listen to `.info/connected` ref, show a small indicator badge in the HUD.

### 12. Hardcoded Asset URLs with No Fallback
**File:** `constants.ts`  
All GLB models and textures are hosted on GitHub raw URLs. If any repo goes private or GitHub rate-limits, assets fail silently. Only the Barney theme has a fallback URL.  
**Fix:** Self-host critical assets or add CDN fallbacks.

### 13. `playerName` Stored in State but Not Persisted on Change
**File:** `App.tsx` (line 161)  
`setPlayerName` is called from `handleStartGame` but the name from the main menu input is stored in local state only. The `setPlayerName` function in `Multiplayer.tsx` does persist to localStorage, so this works — but the flow is confusing (two different `setPlayerName` functions).  
**Fix:** Rename the Multiplayer export to `persistPlayerName` to avoid confusion.

### 14. Typewriter Audio Bypasses Audio Engine
**File:** `UI.tsx` (line 25)  
`TypewriterText` creates its own `OscillatorNode` and connects directly to `ctx.destination`, bypassing the master gain and reverb chain in `AudioEngine.tsx`. This means typewriter bips ignore the mute/volume settings.  
**Fix:** Route typewriter audio through the shared master gain node.

### 15. `wallsForState` Returns Pre-built Arrays — Good Pattern ✅
**File:** `constants.ts` (lines 96–105)  
Wall collision arrays are pre-built at module level instead of allocated per frame. This is a solid optimization. No action needed.

### 16. React.memo on `World` Component — Good Pattern ✅
**File:** `App.tsx` (line 57)  
`World` is wrapped in `React.memo` and receives stable props. RemotePlayer positions are updated via refs, not state. This correctly avoids unnecessary re-renders of the 3D scene.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| 🔴 Critical | 4 | Firebase security, GPU memory leak, auth model |
| 🟡 Medium | 6 | Type safety, design tokens, audio architecture, frame-rate coupling |
| 🟢 Low | 6 | UX polish, asset resilience, naming clarity |

**Top 3 Priorities:**
1. **Firebase Auth + Rules** — The database is effectively open. Implement anonymous auth immediately.
2. **`.gitignore` the config** — Remove `firebase-applet-config.json` from the repo.
3. **Dispose cloned scenes** — Add cleanup for `SkeletonUtils.clone()` in RemotePlayer and Bot.
