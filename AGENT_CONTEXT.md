# AGENT CONTEXT — The Normal Elevator

> **Quick-start brief para IAs entrando no projeto. Leia primeiro daqui antes de qualquer coisa. Depois MAP.md, depois MEMORY.md (longo).**

## Project
Three.js + React Three Fiber horror game. Source: `jubileu/src/`.
Build: `cd jubileu && npm ci && npm run build && node inline-build.mjs` → escreve `../index.html` single-file.

## Key Files (atualizado 2026-05-14)

| Arquivo | Função |
|---|---|
| `App.tsx` | Brain, Canvas, state machine, monta tudo |
| `Player.tsx` | Avatar GLB + câmera + input + colisão + **pickup arm animation** + **FPArmModel** (viewmodel 1ª pessoa) |
| `InventorySystem.tsx` | `useInventory()` + `InventoryHUD` (lanterna + biscoito) |
| `FlashlightLight.tsx` | SpotLight (intensity 22, dist 28) + cone volumétrico + `FlashlightModel3D` (3ª pessoa, segue handAnchor) |
| `ShadowBlob.tsx` | Disco translúcido no chão (não usa shadow maps) |
| `ShopOverlay.tsx` | Undertale dialogue + `onBuyItem` callback |
| `shop-dialogues.ts` | Scenes do shop com `Choice.action?: 'buy_flashlight' \| 'buy_cookie'` |
| `Multiplayer.tsx` | Firestore sync (200ms interval, threshold-gated) |
| `RemotePlayer.tsx` | Remote avatar com distance-band throttling |
| `Bot.tsx` | NPC bots autônomos com mesma throttling |

## Sistema Atual (Funcionando)

### Inventário
- `useInventory()` retorna `{inventory, addItem, toggleFlashlight, useCookie, hasAnyItem}`
- HUD com botões; toasts; cookie heal overlay; tecla F = toggle lanterna

### Pickup arm animation (Avatar 3ª pessoa)
```ts
// Em Player.tsx Avatar:
useFrame((_, dt) => {                              // PRIORITY 0 (DEFAULT). Nunca != 0.
  // useAnimations foi chamado ANTES neste componente → mixer roda primeiro
  if (p.sustained) progress = 1;
  else if (p.timed.active) { /* 3-phase: extend 0.3s → hold 0.5s → retract 0.4s */ }

  // Pose distinta por item:
  if (pickupItem === 'cookie') {
    armAngleX = -π*0.35;  armAngleY = +π*0.20;  forearmAngleX = -π*0.95;  // → mouth
  } else {
    armAngleX = -π*0.44;  forearmAngleX = -π*0.13;                       // → forward
  }
  p.armEuler.set(armAngleX, armAngleY, 0);
  p.armDelta.setFromEuler(p.armEuler);
  p.arm.quaternion.copy(p.armQuat).multiply(p.armDelta);  // post-multiply ao mixer
});
```

### Lanterna fixada na mão (3ª pessoa)
Avatar cria `THREE.Object3D` vazio (`__flashlight_anchor`) com `hand.add(anchor)`, position `(0, 0.05, 0)`.
Avatar expõe via callback. `FlashlightModel3D` lê `anchor.matrixWorld` com `updateWorldMatrix(true, false)` → decompose → copia transform.

### FP viewmodel
Mock arm 3D com primitivas (cylinders + spheres). `depthTest=false`, `renderOrder=999`, segue camera.position + camera.quaternion. Visível só quando `armExtended || timed.active`.

## ⚠️ LANDMINES — coisas que NÃO PODEM voltar

| ❌ NÃO FAZER | Por quê | ✅ EM VEZ DISSO |
|---|---|---|
| `useFrame(..., priority != 0)` | R3F v9 desativa auto-render → tela preta | Use priority 0 (default), chame useAnimations primeiro |
| `bone.add(mesh)` ou `createPortal(jsx, bone)` | Skinned mesh hierarchy quebra → tela preta | `Object3D` vazio como child do bone, mesh renderizada separadamente lendo matrixWorld |
| `<spotLight distance={0}>` quando ativa | Three.js trata 0 = infinite range → tela preta | Use `distance={active ? 28 : 0.1}` |
| Bone `scale.set(0.0001)` pra esconder partes | Scale herdada via matrixWorld → descendants colapsam | Render só o que quer mostrar, evite cloning de scene |
| N8AO / Vignette / heavy postproc em mobile | FPS cai | Só Bloom leve no high quality |
| DLSS/FSR Frame Generation | Não existe API web | `<PerformanceMonitor>` + `<AdaptiveDpr>` da drei (já wired) |

## Performance Tools Já Instalados
- `<AdaptiveDpr pixelated />` da drei dentro do Canvas
- `<PerformanceMonitor>` da drei monitora FPS e seta `window.__lowPerf`
- Distance-band throttling em `RemotePlayer` e `Bot`
- `AudioContext.suspend()` na aba oculta

## Debug Skeleton (se precisar)
```js
// DevTools console:
window.__SKELETON_SCAN__ = true;
location.reload();
// Vai imprimir console.table com toda a hierarquia de bones do avatar
```

## Build & Push
```bash
cd jubileu
npm ci                       # NUNCA npm install solto
npm run build
node inline-build.mjs        # Gera ../index.html
cd ..
git add index.html jubileu/src/...
git commit -m "tipo(escopo): ..."
git push -u origin <branch>
```

## Como Felipe trabalha
- PT-BR, direto, sem frescura
- "Faz aí" — não pedir confirmação
- Testa no celular (mobile), prefere builds que cabem em 1 arquivo
- Tem testado branches diversas ao longo do desenvolvimento, prefere `claude/review-project-docs-R4bFk` agora

## Próximas IAs: leia também
- `MEMORY.md` — histórico completo (longo)
- `MAP.md` — visão geral do projeto
- `ARM-FORUM.md` — discussão do problema do braço (já resolvido, deletado em commits recentes mas estava em sessões anteriores)
