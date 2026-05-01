# Backup — Cashier Working (2026-05-01)

Snapshot do estado **funcionando** após fixar:
- Rotação do Cashier (via `<primitive>` props + bones rebound)
- Posição (cashier em pé no banquinho)
- Altura/escala (`STOOL_HEIGHT=0.45`, `CASHIER_SCALE=1.5`)
- Pano de limpeza amarelo parented na bone "RightHand"
- Áudio elevador/Barney sem sobreposição

## Conteúdo
- `index.html` — build single-file canônico (3.96 MB)
- `BuildingBlocks.tsx` — Cashier + Stool + ReceptionDesk
- `AudioEngine.tsx` — `barneyFloor` gateado em `!elevatorTrack.active`
- `LobbyEnv.tsx` — posição do Cashier `(7.65, 0, -7.5)` e Stool `(7.7, 0, -7.5)`

## Constantes-chave (em `BuildingBlocks.tsx`)
```ts
const STOOL_HEIGHT = 0.45;
const SEAT_TOP_Y = STOOL_HEIGHT + 0.075; // 0.525
const CASHIER_SCALE = 1.5;
const CASHIER_GLB_URL = "https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/button_pushing.glb";
```

## Como restaurar
```bash
cp backup-cashier-2026-05-01/index.html .
cp backup-cashier-2026-05-01/BuildingBlocks.tsx jubileu/src/
cp backup-cashier-2026-05-01/AudioEngine.tsx jubileu/src/
cp backup-cashier-2026-05-01/LobbyEnv.tsx jubileu/src/
```

## Git
- Branch: `claude/review-memory-docs-pYpFg`
- Commit: `2d7a7d6` — fix(cashier): bigger stool + scale up + cleaning cloth on right hand
