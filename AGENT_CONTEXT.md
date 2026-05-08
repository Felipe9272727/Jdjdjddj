# AGENT CONTEXT — The Normal Elevator Inventory System

## Project
Three.js + React Three Fiber horror game. Source: `jubileu/src/`

## Key Files
- `Player.tsx` — Avatar loads 2 GLBs (Walking.glb + Idle.glb), uses `useAnimations` for walk/idle. Avatar is `<primitive>` inside a `<group ref={avRef}>`. Hips bone is found via `scene.traverse`.
- `App.tsx` — Main component, Canvas, state machine. Flashlight components are inside `<Suspense>`.
- `InventorySystem.tsx` — `useInventory()` hook, `InventoryHUD` component.
- `FlashlightLight.tsx` — SpotLight + volumetric cone + FlashlightModel3D + FPFlashlightHand.
- `PickupArm.tsx` — Currently tries to find arm bones by name (broken/fallback).
- `ShopOverlay.tsx` — Undertale-style shop with bellhop sprite.
- `constants.ts` — CASHIER_POS, CASHIER_INTERACT_DIST, etc.

## GLB Skeleton Info
The GLB models use Mixamo-style skeleton. Bone names likely have `mixamorig:` prefix.
The Avatar component already finds hips bones: `c.name.toLowerCase().includes('hips')`.

## Current Bugs
1. When buying flashlight, player avatar disappears for a few milliseconds
2. PickupArm bone manipulation doesn't work (bones not found)
3. The previous AI added a "shop sprite blink" feature that wasn't requested — it's a visual enhancement, not a bug fix

## What We Need
1. Player arm extends procedurally when picking up items (WITHOUT breaking existing walk/idle GLB animations)
2. Character doesn't disappear when buying items
3. Clean, working inventory system

## Technical Approach for Arm Animation
The THREE.js animation system runs AnimationMixer.update() each frame. To add procedural bone manipulation ON TOP of existing animations:
1. Let the mixer update normally (applies walk/idle)
2. AFTER mixer update, find arm bones and override their rotation
3. Use `useFrame` with proper ordering — procedural override must happen AFTER the animation system

To find bones: `scene.traverse(c => { if (c.isBone && c.name.toLowerCase().includes('arm')) ... })`

## Build
```bash
cd jubileu && npm run build && node inline-build.mjs
# Then commit + push to feat/inventory-polish-v3
```
