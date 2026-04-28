# 🗺️ MAP — Guia do Projeto The Normal Elevator

> **Para qualquer IA que pegar este projeto:** Leia este arquivo primeiro. Aqui tem tudo que você precisa saber para não se perder.

---

## 📍 Onde Você Está

```
Repo:    Felipe9272727/Jdjdjddj (GitHub)
Branch:  main (canônico)
Projeto: The Normal Elevator — jogo 3D multiplayer no navegador
Stack:   React 19 + Three.js + Firebase + Vite + Tailwind v4
```

---

## 🧭 Mapa do Código

```
jubileu/src/
│
├── 🎮 LÓGICA DO JOGO
│   ├── App.tsx            ← Coração do jogo (625 linhas)
│   │                          Game state, elevador, Barney, controles, render loop
│   │                          NÃO mexer sem entender o fluxo de estados
│   │
│   ├── Player.tsx         ← Avatar do jogador + câmera (1ª/3ª pessoa)
│   │                          Collision, movement, zoom, pointer lock
│   │                          useFrame loop — cuidado com performance
│   │
│   ├── Multiplayer.tsx    ← Firebase Firestore sync
│   │                          Player ID via localStorage UUID (SEM Firebase Auth)
│   │                          Posições, chat, nomes, ghost cleanup
│   │                          ⚠️ Firestore rules precisam deploy manual
│   │
│   ├── Bot.tsx            ← Sistema de bots autônomos
│   │                          Steering behaviors (wander/follow/tour/idle/patrol/orbit/dance)
│   │                          API: window.__jubileuBot (spawn, despawn, follow, etc.)
│   │
│   └── physics.ts         ← Colisão circle-vs-line-segment
│                              Usado por Player E Bot (mesma função)
│
├── 🏗️ AMBIENTE 3D
│   ├── Elevator.tsx       ← Interior do elevador + portas animadas + painel
│   ├── LobbyEnv.tsx       ← Lobby (20x20): NPC, móveis, elevador facade
│   ├── HouseEnv.tsx       ← Casa exterior + interior, Barney Actor, Shop, Dussekar
│   ├── Furniture.tsx      ← Sofá, mesa, cama, balcão, barril
│   ├── BuildingBlocks.tsx ← Porta, parede, luz, poltrona, planta, recepção
│   └── Materials.tsx      ← TextureMaterial (wrapping, repeat, rotation)
│
├── 🎨 UI / HUD
│   ├── MainMenu.tsx       ← Tela inicial com animação de portas
│   │                          Multiplayer toggle, nome, fullscreen, controles
│   │
│   ├── HudComponents.tsx  ← HUD extraído do App.tsx
│   │                          ElevatorHud, FloorReveal, TopControls,
│   │                          ActionButton, NightBanner, ChaseBanner,
│   │                          SavedOverlay, BarneyDialogue
│   │
│   ├── ChatSystem.tsx     ← Chat estilo Roblox + fallback 2D
│   │                          RobloxChat (desktop + mobile)
│   │                          BubbleChatFallback (overlay 2D)
│   │
│   ├── Settings.tsx       ← Menu de config + FPS counter
│   │                          Qualidade, volume, sensibilidade, MP, bot mode
│   │
│   └── UI.tsx             ← VisualJoystick, DialogueOverlay, TypewriterText
│
├── 🎵 ÁUDIO & ATMOSFERA
│   ├── AudioEngine.tsx    ← Áudio procedural via Web Audio API
│   │                          Lobby music (fetch do GitHub)
│   │                          Barney theme (lazy-load, só no trigger)
│   │                          Elevator sounds (ding, motor, thud — gerados em runtime)
│   │                          Night mode distortion
│   │
│   ├── Atmosphere.tsx     ← CeilingFan, WallClock, playArrivalDing, createElevatorHum
│   │
│   └── PostEffects.tsx    ← GameEffects (CSS vignette/grain)
│                              DustParticles (InstancedMesh)
│                              FluorescentFlicker, NightAmbient
│
├── 📐 CONFIG & CONSTANTS
│   ├── constants.ts       ← URLs de assets, cores, diálogos, paredes
│   │                          Gameplay constants (distâncias, TTLs, limites)
│   │                          ⚠️ URLs são de repos pessoais do Felipe
│   │
│   ├── design-tokens.ts   ← Design system (TYPE, SPACE, RADIUS, COMPONENT, Z)
│   │                          ⚠️ Definido mas quase não usado no código
│   │
│   └── index.css          ← Tailwind + animações CSS + design system
│                              Keyframes, glass panels, scrollbars, a11y
│
├── 🔧 BUILD & CONFIG
│   ├── main.tsx           ← Entry point (renderiza <App/> com SettingsProvider)
│   ├── vite.config.ts     ← Vite config (HMR, minify off, Tailwind plugin)
│   ├── package.json       ← Dependências (React 19, Three.js, Firebase, etc.)
│   └── firestore.rules    ← Regras de segurança do Firestore (12 campos)
│
└── 🧪 TESTES
    └── __tests__/         ← Testes (Vitest)
```

---

## 🎮 Fluxo de Estados do Jogo

```
                    ┌─────────┐
                    │  LOBBY  │ ← Estado inicial
                    │ (level 0)│
                    └────┬────┘
                         │ Player entra no elevador (z < -10)
                         │ Timer: 5s → fecha portas → 20s viagem
                         ▼
                    ┌─────────┐
                    │ OUTDOOR │ ← Casa exterior
                    │ (level 1)│
                    └────┬────┘
                         │ Player interage com porta (E / toque)
                         ▼
                   ┌──────────────┐
                   │ BARNEY_GREET │ ← Barney aparece na porta
                   │              │   Diálogo com escolhas
                   └───┬──────┬───┘
                       │      │
            Aceitar café      Recusar
                       │      │
                       ▼      ▼
              ┌──────────────┐  └──→ VOLTA PRO OUTDOOR
              │  INDOOR_DAY  │
              │  (casa, dia) │
              │  Pode dormir │
              └──────┬───────┘
                     │ Dormir (E / toque na cama)
                     ▼
              ┌──────────────┐
              │ SLEEP_FADE   │ ← Fade preto, "zzz..."
              │ (3 segundos) │
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │ INDOOR_NIGHT │ ← "Algo não está certo..."
              │ (casa, noite)│
              └──────┬───────┘
                     │ 2 segundos depois
                     ▼
              ┌──────────────┐
              │    CHASE     │ ← Barney persegue! Corra pro elevador!
              │              │   Barney theme toca (distorcido)
              └───┬──────┬───┘
                   │      │
         Barney pega     Chegou ao elevador (z < -10)
                   │      │
                   ▼      ▼
           ┌──────────┐  ┌──────────┐
           │  CAUGHT   │  │  SAVED   │
           │(jumpscare)│  │("SOBREVIVEU")│
           └─────┬─────┘  └─────┬────┘
                 │              │
                 └──────┬───────┘
                        │ Reset (2-2.5s)
                        ▼
                   ┌─────────┐
                   │ OUTDOOR │ ← Volta ao início da casa
                   └─────────┘
```

---

## 🔑 Conceitos Chave

### Player ID
- **SEM Firebase Auth** — usa `localStorage` UUID
- Chave: `jubileu_player_id`
- Cada player só escreve no próprio doc Firestore

### Multiplayer
- Coleção: `worlds/main/players/{userId}`
- Schema: `{ x, y, z, ry, updatedAt, state, worldId, isActive, level, name, chatMsg, chatAt }` (12 campos)
- Write interval: 200ms (5/sec)
- Ghost TTL: 15s (players inativos são filtrados)
- Chat TTL: 30s (mensagens desaparecem)

### Build
```bash
cd jubileu
npm install          # ⚠️ Usa package-lock.json — NÃO npm install sem lock
npm run dev          # Dev server na porta 3000
npm run build        # Build Vite
node inline-build.mjs  # Gera ../index.html single-file (~4MB)
```

### ⚠️ Regra Crítica: NÃO rebuildar sem necessidade
- O `index.html` canônico roda a 60fps
- `npm install` pode resolver versões diferentes de dependências
- Sempre usar `npm ci` se precisar rebuildar
- Se o backup funciona, NÃO mexer

---

## 🚨 Erros Comuns (e como evitar)

| Erro | Causa | Solução |
|------|-------|---------|
| Players não aparecem | Firestore rules não deployadas | Deploy manual no Firebase Console |
| FPS cai pra 29 | Dependências mudaram (`npm install`) | Usar `npm ci` ou restaurar `package-lock.json` |
| Avatar flutua | groundY não calculado | Verificar bbox do GLB |
| Chat não funciona | Rules exigem `isSignedIn()` | Deploy rules sem auth |
| Barney theme não toca | Fetch falhou (archive.org) | Lazy-loaded, fallback silencioso |
| build falha com TS error | Tipos errados | `npx tsc --noEmit` antes de buildar |

---

## 📋 O Que Está Pendente

### Firestore Rules (CRÍTICO)
As rules no repo estão corretas, mas precisam ser **deployadas manualmente** no Firebase Console:
1. Ir em https://console.firebase.google.com
2. Selecionar projeto `gen-lang-client-0039518806`
3. Firestore → Rules
4. Colar conteúdo de `jubileu/firestore.rules`
5. Publish

### Design Tokens (opcional)
`design-tokens.ts` define TYPE, SPACE, RADIUS, COMPONENT, Z — mas o código quase não usa. Refactor gradual para usar os tokens.

### Rebuild do index.html
O `index.html` atual NÃO inclui os últimos fixes. Quando for rebuildar:
```bash
cd jubileu
npm ci              # ← NÃO npm install
npm run build
node inline-build.mjs
```

---

## 🎯 Para a Próxima IA

1. **Leia este arquivo primeiro**
2. **Leia `MEMORY.md`** — tem histórico de tudo que foi feito
3. **Leia `AUDIT.md`** — tem problemas conhecidos
4. **NÃO rebuildar o index.html** sem necessidade
5. **Sempre atualizar MEMORY.md** após mudanças
6. **TypeScript deve compilar limpo** — `npx tsc --noEmit`
7. **Commits atômicos** — um fix por commit
8. **PT-BR** pra comunicação com Felipe, código em inglês

---

*Última atualização: 2026-04-28 10:12 GMT+8*
