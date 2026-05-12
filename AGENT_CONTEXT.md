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

## Current Bugs — Status (atualizado 2026-05-12)
1. ✅ **RESOLVIDO** — Avatar disappearing on flashlight purchase
   - Fix: `useCallback` no `handleAvatarScene` em `App.tsx` (commit `a33bfb4`)
   - Reforço: 5 defensive measures contra black screen (commit `8e80d1d`)
2. ✅ **RESOLVIDO** — PickupArm bone manipulation
   - Bone matching: exact match + substring fallback (commit `bebadd3`)
   - Spam guard: ignora `pickupTrigger` durante animação ativa
   - Pre-allocated quaternions/eulers: zero GC pressure (commit `14dc029`)
3. ⚠️ **MANTIDO** — Shop sprite blink: leve, sem custo perceptível, ficou no código

## Implementação Atual (Player.tsx)
A solução vencedora — depois de um experimento falho com AnimationClip + `setLayer(1)` que descobriu-se não estar disponível nessa versão do Three.js:

```ts
useFrame((_, dt) => {
  // ... 3-phase timing: extend (0.3s ease-out) → hold (0.5s) → retract (0.4s ease-in)
  p.armQuat.copy(p.armBone.quaternion);              // lê pose do mixer
  p.armEuler.set(armAngle, 0, 0);
  p.armDelta.setFromEuler(p.armEuler);
  p.armBone.quaternion.copy(p.armQuat).multiply(p.armDelta);  // post-multiply
}, 1); // Priority 1 = depois do mixer (priority 0)
```

**Bones detectados**: `mixamorig:RightArm`, `mixamorig:RightForeArm`.
**Max angle**: `-π × 0.44` no shoulder, 30% disso no forearm.

## ARM-FORUM.md
Documentação completa da discussão entre 4 agentes (VETERANO, OSSÁRIO, GAMBIARRA, AUDITORK) que produziu os fixes acima. A solução proposta (AnimationClip programática em layer 1) falhou em runtime — `setLayer()` não existia na versão do Three.js. As lições do fórum (pre-alloc, exact match, spam guard) ficaram.

## Build
```bash
cd jubileu && npm run build:reproducible
# index.html é regerado pelo inline-build.mjs / vite-plugin-singlefile
# Commitar source + index.html juntos
```
