# 🗺️ MAP.md — The Normal Elevator

> **⚠️ LEIA ESTE ARQUIVO ANTES DE QUALQUER COISA.**
> É o mapa do projeto. Sem ele, você vai se perder.

---

## 🧭 Você Está Aqui

```
  GitHub: Felipe9272727/Jdjdjddj
  Branch: main ← canônico, estável, 60fps
  
  ┌─────────────────────────────────────────────┐
  │           THE NORMAL ELEVATOR               │
  │     Jogo 3D multiplayer no navegador        │
  │                                             │
  │  React 19 · Three.js · Firebase · Vite      │
  │  Tailwind v4 · Web Audio API                │
  └─────────────────────────────────────────────┘
```

---

## 🏗️ Arquitetura Visual

```
                          ┌──────────────┐
                          │   main.tsx   │
                          │  (entry)     │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │    App.tsx   │
                          │  (cérebro)   │
                          └──┬───┬───┬───┘
                             │   │   │
              ┌──────────────┘   │   └──────────────┐
              ▼                  ▼                   ▼
     ┌────────────────┐ ┌───────────────┐ ┌─────────────────┐
     │  Player.tsx    │ │  World (3D)   │ │  Multiplayer.tsx│
     │  (corpo)       │ │  (cenário)    │ │  (rede)         │
     └────────┬───────┘ └───────┬───────┘ └────────┬────────┘
              │                 │                   │
              │          ┌──────┼──────┐            │
              │          ▼      ▼      ▼            │
              │     LobbyEnv  Elevator  HouseEnv    │
              │          │      │      │            │
              │          ▼      ▼      ▼            │
              │     Furniture  Materials  Building  │
              │                                     │
              └──────────────┬──────────────────────┘
                             ▼
                    ┌─────────────────┐
                    │   physics.ts    │
                    │  (colisão)      │
                    └─────────────────┘
```

---

## 🎮 Fluxo do Jogo (State Machine)

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                        GAME STATES                              │
 └─────────────────────────────────────────────────────────────────┘

  LOBBY ──────► OUTDOOR ──────► BARNEY_GREET ──────► INDOOR_DAY
  (level 0)     (level 1)       (diálogo)            (casa, dia)
     │              │                │                     │
     │              │          ┌─────┴─────┐               │
     │              │       Aceitar     Recusar            │
     │              │          │            │               │
     │              │          │            └──► OUTDOOR    │
     │              │          ▼                           │
     │              │     INDOOR_DAY                       │
     │              │                                      │
     │              │                              Dormir (cama)
     │              │                                      │
     │              │                               SLEEP_FADE
     │              │                                (3s fade)
     │              │                                      │
     │              │                              INDOOR_NIGHT
     │              │                               "Algo errado"
     │              │                                      │
     │              │                                 (2s depois)
     │              │                                      │
     │              │                                   CHASE
     │              │                             (Barney persegue!)
     │              │                                      │
     │              │                         ┌────────────┼────────────┐
     │              │                         ▼                         ▼
     │              │                      CAUGHT                    SAVED
     │              │                   (jumpscare)            ("SOBREVIVEU")
     │              │                         │                         │
     │              │                         └─────────┬───────────────┘
     │              │                                   │
     │              │                              (reset 2.5s)
     │              │                                   │
     ◄──────────────◄───────────────────────────────────┘
                      (volta pro OUTDOOR)
```

---

## 📁 Mapa de Arquivos

### 🎮 Núcleo do Jogo

```
App.tsx ...................... O cérebro
├── Game state machine (lobby→chase→saved)
├── Elevador logic (timer, doors, travel)
├── Barney logic (dialogue, chase, jumpscare)
├── Input handling (touch + keyboard + mouse)
├── Audio context management
└── Render tree (Canvas → World → Player)

Player.tsx ................... O corpo
├── Avatar GLB (Walking + Idle animations)
├── Camera system (1st/3rd person, zoom, shake)
├── Collision detection (physics.ts)
├── Movement (WASD + joystick)
└── Interaction zones (door, NPC, elevator, bed)

Multiplayer.tsx .............. A rede
├── Firebase Firestore (NO Auth — localStorage UUID)
├── Position sync (200ms writes)
├── Chat system (send + receive + fallback)
├── Player names (localStorage)
└── Ghost cleanup (15s TTL)

Bot.tsx ...................... Os NPCs
├── Steering behaviors (Reynolds 1999)
├── Behaviors: wander, follow, tour, idle, patrol, orbit, dance
├── Collision (same physics.ts as Player)
└── API: window.__jubileuBot (console commands)

physics.ts ................... As leis da física
└── resolveCollision(circle, walls) → [x, z]
    3 passes, circle-vs-line-segment
```

### 🏗️ Ambiente 3D

```
Elevator.tsx ................. O elevador
├── ElevatorDoors (animated open/close)
├── ElevatorFacade (exterior with sign)
└── ElevatorInterior (floor, walls, panel, buttons)

LobbyEnv.tsx ................. O lobby (20x20)
├── NPC (Supervisor do Saguão)
├── Móveis (receção, poltronas, plantas)
├── Elevator facade
└── Textures (floor, walls, ceiling)

HouseEnv.tsx ................. A casa
├── Exterior (walls, roof, door)
├── Interior (bed, sofa, kitchen)
├── BarneyActor (2D sprite in 3D)
├── Shop (Dussekar + items)
└── Trees

Furniture.tsx ................ Móveis
└── Sofa, CoffeeTable, Bed, KitchenCounter, Barrel

BuildingBlocks.tsx ........... Peças de construção
└── Door, Wall, Light, Chair, Plant, Reception

Materials.tsx ................ Materiais
└── TextureMaterial (URL → texture with repeat/rotation)
```

### 🎨 Interface

```
MainMenu.tsx ................. Tela inicial
├── Animação de portas
├── Multiplayer toggle
├── Name input
├── Fullscreen button
└── Controls display

HudComponents.tsx ............ HUD durante o jogo
├── ElevatorHud (status panel)
├── FloorReveal ("Now Arriving")
├── TopControls (settings, mute, MP)
├── ActionButton (ABRIR/FALAR/DORMIR)
├── NightBanner ("Algo não está certo...")
├── ChaseBanner ("⚠ CORRA PARA O ELEVADOR ⚠")
├── SavedOverlay ("VOCÊ SOBREVIVEU")
└── BarneyDialogue (diálogo completo)

ChatSystem.tsx ............... Chat multiplayer
├── RobloxChat (desktop + mobile layouts)
└── BubbleChatFallback (2D overlay)

Settings.tsx ................. Configurações
├── Quality (low/medium/high)
├── Volume, Sensitivity, Invert Y
├── Multiplayer toggle
├── FPS counter
└── Bot mode toggle

UI.tsx ....................... Componentes utilitários
├── VisualJoystick (mobile)
├── DialogueOverlay (lobby NPC)
└── TypewriterText (animated text)
```

### 🎵 Áudio & Atmosfera

```
AudioEngine.tsx .............. Motor de áudio
├── Lobby music (fetch from GitHub, loop)
├── Barney theme (lazy-load on elevator trigger)
├── Elevator sounds (procedural: ding, motor, thud)
├── Night mode distortion (pitch shift, filter)
└── Reverb + compressor chain

Atmosphere.tsx ............... Elementos atmosféricos
├── CeilingFan (spinning, throttled useFrame)
├── WallClock (ticking second hand)
├── playArrivalDing (procedural)
└── createElevatorHum (procedural)

PostEffects.tsx .............. Efeitos visuais
├── GameEffects (CSS vignette + grain)
├── DustParticles (InstancedMesh)
├── FluorescentFlicker (light variation)
└── NightAmbient (eerie pulsing light)
```

### 📐 Configuração

```
constants.ts ................. Tudo que é constante
├── URLs de assets (GLB, textures, audio)
├── Cores (COLORS)
├── Diálogos (DIALOGUE_TREE, BARNEY_DIALOGUE)
├── Paredes (collision wall segments)
├── Gameplay (SPEED, PR, distâncias)
└── Multiplayer (TTLs, limits, intervals)

design-tokens.ts ............. Design system
├── TYPE (modular scale 1.25)
├── MONO (for HUD)
├── SPACE, GAP, RADIUS
├── RING, SHADOW
├── COMPONENT patterns
├── ANIM durations
└── Z-index layers

index.css .................... Estilos globais
├── Tailwind import
├── CSS custom properties
├── Glass panel patterns
├── Animations (20+ keyframes)
├── HUD system
├── Focus-visible (a11y)
├── Reduced motion
└── Scrollbar + slider styling

firestore.rules .............. Regras de segurança
└── 12 campos validados, ownership por path
```

---

## 🔑 Conceitos que Você PREISA Saber

### 1. Player ID (SEM Auth)
```
localStorage.getItem('jubileu_player_id')
        │
        ▼
  UUID v4 gerado no primeiro acesso
        │
        ▼
  Usado como doc ID no Firestore
  (cada player só escreve no próprio doc)
```

### 2. Multiplayer Sync
```
  Player A                    Firestore                    Player B
     │                           │                            │
     ├── write(x,y,z) ─────────►│◄───────── read(x,y,z) ────┤
     │   (200ms interval)        │    (onSnapshot real-time)  │
     │                           │                            │
     ├── chatMsg ───────────────►│◄───────── chatMsg ─────────┤
     │   (local fallback)        │    (30s TTL)               │
```

### 3. Collision System
```
  Player position (x, z)
         │
         ▼
  resolveCollision(x, z, radius, walls)
         │
         ├── Pass 1: push out of wall 1
         ├── Pass 2: push out of wall 2
         └── Pass 3: push out of wall 3
         │
         ▼
  Final position (safe, no clip)
```

### 4. Camera System
```
  zoomLevel
     │
     ├── < 0.5 → First Person (FOV 90°)
     └── ≥ 0.5 → Third Person (orbital)
              │
              └── Smooth lerp (position only)
                  lookAt is instant
```

### 5. Audio Chain
```
  Source (lobby/barney/sfx)
         │
         ▼
  Gain (volume control)
         │
         ▼
  Reverb (convolver, 1.5s impulse)
         │
         ▼
  Compressor (threshold -12, ratio 4)
         │
         ▼
  Master Gain (mute/volume)
         │
         ▼
  Destination (speakers)
```

---

## ⚡ Comandos Rápidos

```bash
# Rodar local
cd jubileu && npm install && npm run dev     # porta 3000

# Build
npm run build && node inline-build.mjs       # gera ../index.html

# TypeScript check
npx tsc --noEmit                             # deve ser limpo

# Bot API (console do browser)
window.__jubileuBot.spawn(3)                 # 3 bots
window.__jubileuBot.follow()                 // todos seguem player
window.__jubileuBot.tour()                   // tour guiado
window.__jubileuBot.help()                   // ver comandos

# Git
gh repo clone Felipe9272727/Jdjdjddj         # clonar
git log --oneline -10                        // ver commits
```

---

## 🚨 Armadilhas Conhecidas

```
 ❌  npm install (sem lockfile)
     │
     ▼
     Dependências resolvem versões diferentes
     │
     ▼
     FPS cai de 60 → 29
     
 ✅  npm ci (respeita lockfile)
     │
     ▼
     Dependências idênticas ao backup
     │
     ▼
     60fps garantidos
```

```
 ❌  Editar firestore.rules e esquecer de deploy
     │
     ▼
     Rules no repo ≠ Rules no Firebase
     │
     ▼
     Multiplayer não funciona (writes rejeitados)
     
 ✅  Deploy manual no Firebase Console
     │
     ▼
     Rules ativas = multiplayer funciona
```

```
 ❌  mexer no index.html canônico direto
     │
     ▼
     Pode quebrar build de 4MB que roda a 60fps
     
 ✅  Editar jubileu/src/ → rebuild → commit index.html
     │
     ▼
     Build consistente
```

---

## 📋 Checklist para Próxima IA

```
 □  Leu MAP.md (este arquivo)
 □  Leu MEMORY.md (histórico de mudanças)
 □  Leu AUDIT.md (problemas conhecidos)
 □  Entendeu o fluxo de game states
 □  Sabe que NÃO deve rebuildar sem necessidade
 □  Sabe que deve atualizar MEMORY.md após mudanças
 □  Sabe que TypeScript deve compilar limpo
 □  Sabe que commits devem ser atômicos
 □  Sabe que comunicação é em PT-BR
```

---

## 🎯 Referência Rápida de Constantes

| Constante | Valor | Onde é usada |
|-----------|-------|--------------|
| `SPEED` | 4.0 | Velocidade do player |
| `PR` | 0.5 | Raio de colisão |
| `BARNEY_CATCH_DIST` | 1.2 | Distância de captura |
| `DOOR_INTERACT_DIST` | 3.0 | Distância da porta |
| `NPC_INTERACT_DIST` | 4.0 | Distância do NPC |
| `BED_INTERACT_DIST` | 3.0 | Distância da cama |
| `ELEVATOR_ZONE_Z` | -10 | Z do elevador |
| `ELEVATOR_ZONE_X` | 3.1 | Largura do elevador |
| `MP_GHOST_TTL_MS` | 15000 | Ghost timeout |
| `MP_WRITE_INTERVAL` | 200 | Write interval (ms) |
| `CHAT_TTL_MS` | 30000 | Chat message lifetime |
| `CHAT_MAX_LEN` | 200 | Max chat chars |
| `PLAYER_NAME_MAX_LEN` | 20 | Max name chars |
| `MAX_LEVEL` | 100 | Level máximo |

---

## 🎨 Paleta de Cores

```
  AMBER (principal)          RED (perigo)             GREEN (sucesso)
  ┌─────────────────┐       ┌─────────────────┐      ┌─────────────────┐
  │ #FFD54F         │       │ #FF0000         │      │ #66BB6A         │
  │ #FFC107         │       │ #EF4444         │      │ #4CAF50         │
  │ #FFB300         │       │ #DC2626         │      │ #2E7D32         │
  └─────────────────┘       └─────────────────┘      └─────────────────┘

  PURPLE (Barney)            BLUE (noturno)           GRAY (neutro)
  ┌─────────────────┐       ┌─────────────────┐      ┌─────────────────┐
  │ #A855F7         │       │ #1E3A5F         │      │ #9E9E9E         │
  │ #7C3AED         │       │ #1565C0         │      │ #B0BEC5         │
  │ #6D28D9         │       │ #0D47A1         │      │ #78909C         │
  └─────────────────┘       └─────────────────┘      └─────────────────┘
```

---

## 🔗 Assets Externos

```
  AVATARS                    NPC                      TEXTURES
  ┌───────────────────┐     ┌───────────────────┐    ┌───────────────────┐
  │ Walking(1).glb    │     │ npc walking.glb   │    │ lobby floor.png   │
  │ Idle.glb          │     │ npc idle.glb       │    │ wall panel.png    │
  │ (Bacon Hair)      │     │ (NPC)              │    │ wall.png          │
  └───────────────────┘     └───────────────────┘    │ ceiling.jpg       │
                                                      └───────────────────┘
  AUDIO                     CHARACTER
  ┌───────────────────┐     ┌───────────────────┐
  │ Lobby Time.mp3    │     │ blocky char.glb   │
  │ (Felipe's GitHub) │     │ (Dussekar)        │
  │                   │     │                   │
  │ Barney Theme.mp3  │     │ barney.png        │
  │ (archive.org)     │     │ (2D sprite)       │
  └───────────────────┘     └───────────────────┘
```

---

> **💡 Dica final:** Se você entendeu este arquivo, entendeu 80% do projeto.
> Os outros 20% estão no código. Leia com calma.

*Última atualização: 2026-04-28 10:15 GMT+8*
