# MAP.md — The Normal Elevator

> **Mapa definitivo do projeto. Leia isto antes de qualquer outra coisa.**
> Se você é uma IA chegando ao repositório agora, este arquivo + `MEMORY.md` te dão 90% do contexto.

---

## ⚠️ REGRAS DE OURO (não-negociáveis)

| # | Regra | Por quê |
|---|-------|---------|
| 1 | **SEMPRE rebuilde o `index.html` ao editar qualquer arquivo em `jubileu/src/`** | O `index.html` na raiz é o que vai pro ar. Sem rebuild, sua mudança não aparece no jogo. |
| 2 | **Use `npm run build:reproducible`** (nunca `npm install` solto) | `npm ci` respeita o lock; `npm install` pode escalar versões e causar regressão de FPS. |
| 3 | **Comite o `index.html` junto com o source** | Source e build no mesmo commit = histórico consistente. |
| 4 | **Atualize `MEMORY.md` após cada mudança real** | É o histórico cronológico do projeto. Sua próxima sessão vai depender dele. |
| 5 | **Comunicação em PT-BR, ação direta, sem pedir confirmação** | Estilo do Felipe: "faz aí". |

---

## 🚀 Workflow Padrão (copia e cola)

```bash
# 1. Editar source
$EDITOR jubileu/src/SeuArquivo.tsx

# 2. Rebuild reprodutível (npm ci + vite build + inline-build)
cd jubileu && npm run build:reproducible
cd ..

# 3. Verificar
git status               # deve mostrar: jubileu/src/... + index.html

# 4. Commitar tudo junto
git add jubileu/src/SeuArquivo.tsx index.html
git commit -m "tipo(escopo): descrição curta"

# 5. Atualizar MEMORY.md com o que foi feito
$EDITOR MEMORY.md

# 6. Push
git push -u origin <branch-atual>
```

> **Nunca** comite só o source sem o `index.html` rebuildado. Nem só o `index.html` sem o source. Tem que ser os dois juntos.

---

## 🎮 O Que É o Projeto

**The Normal Elevator** — jogo 3D multiplayer no navegador, estilo liminal/horror.

| Camada | Tech |
|--------|------|
| Frontend | React 19 + TypeScript |
| 3D | Three.js (`@react-three/fiber` + `@react-three/drei`) |
| Multiplayer | Firebase Firestore (sem Auth — UUID via localStorage) |
| Build | Vite 6 + script `inline-build.mjs` (gera HTML single-file) |
| Style | Tailwind v4 |
| Audio | Web Audio API (procedural, sem arquivos) |
| Física | Custom circle-vs-line-segment (`physics.ts`) |

**Estado:** lobby → outdoor → barney_greet → indoor_day → sleep_fade → indoor_night → chase → caught/saved → reset.

---

## 🗂️ Estrutura do Repo

```
/
├── MAP.md              ← este arquivo
├── MEMORY.md           ← histórico cronológico (LEIA TAMBÉM)
├── AUDIT.md            ← problemas conhecidos
├── index.html          ← BUILD CANÔNICO (~4MB single-file). É o que vai pro ar.
├── index-readable.html ← build legível pra debug (~170KB, opcional)
├── backup/             ← snapshot do index.html que roda 60fps
├── backup-v2/          ← snapshot completo (src + build + lock)
└── jubileu/            ← código fonte
    ├── src/            ← edite aqui
    ├── package.json    ← versões pinnadas (sem ^/~)
    ├── package-lock.json   ← NÃO mexa manualmente
    ├── inline-build.mjs    ← gera ../index.html single-file
    └── vite.config.ts
```

---

## 📂 Mapa dos Arquivos `jubileu/src/`

### Núcleo
| Arquivo | Função |
|---------|--------|
| `main.tsx` | Entry point, monta `<App/>` |
| `App.tsx` | Cérebro: state machine, Canvas, orquestra tudo |
| `Player.tsx` | Avatar local, câmera (1ª/3ª pessoa), input, colisão |
| `Multiplayer.tsx` | Firestore sync (200ms), chat, nomes, ghost cleanup |
| `Bot.tsx` | NPCs autônomos (steering behaviors). API: `window.__jubileuBot` |
| `physics.ts` | `resolveCollision(circle, walls)` — 3 passes |

### Cenário 3D
| Arquivo | Função |
|---------|--------|
| `Elevator.tsx` | Portas animadas, fachada, interior |
| `LobbyEnv.tsx` | Lobby 20×20, NPC supervisor, móveis |
| `HouseEnv.tsx` | Casa exterior+interior, Barney, Shop, Dussekar |
| `Furniture.tsx` | Sofá, mesa, cama, balcão, barril |
| `BuildingBlocks.tsx` | Porta, parede, luz, cadeira, planta |
| `Materials.tsx` | `TextureMaterial` (URL → texture) |

### Interface
| Arquivo | Função |
|---------|--------|
| `MainMenu.tsx` | Tela inicial, animação de portas, input de nome |
| `UI.tsx` | Joystick visual, dialogue overlay, typewriter |
| `Settings.tsx` | Quality (low/med/high), volume, sensibilidade, MP, FPS, bot |
| `ChatSystem.tsx` | Chat estilo Roblox + fallback 2D |
| `RemotePlayer.tsx` | Avatar remoto (clone GLB + label + balão) |

### Áudio & Atmosfera
| Arquivo | Função |
|---------|--------|
| `AudioEngine.tsx` | Música lobby, tema Barney, sons procedurais, distorção noturna |
| `Atmosphere.tsx` | CeilingFan, WallClock, ding/hum procedurais |
| `PostEffects.tsx` | GameEffects (CSS overlay), DustParticles, FluorescentFlicker, NightAmbient |

### Configuração
| Arquivo | Função |
|---------|--------|
| `constants.ts` | URLs de assets, cores, diálogos, paredes, gameplay constants |
| `design-tokens.ts` | Tipo, espaçamento, cores, radii, sombras, z-index |
| `index.css` | Tailwind, custom props, animações, glass panels |
| `firestore.rules` | Regras de segurança (12 campos validados) |

---

## 🎮 Game States

```
lobby ──► outdoor ──► barney_greet ──► indoor_day
                            │                │
                            └──recusar       │
                                             ▼ (dormir)
                                        sleep_fade
                                             │
                                             ▼
                                       indoor_night
                                             │
                                             ▼
                                          chase
                                             │
                                       ┌─────┴─────┐
                                       ▼           ▼
                                    caught       saved
                                       │           │
                                       └─reset─────┘
                                             │
                                             ▼
                                          outdoor
```

---

## 🔑 Conceitos Críticos

### Player ID (sem Firebase Auth)
- `localStorage.getItem('jubileu_player_id')` → UUID v4
- Usado como doc ID no Firestore. Cada player só escreve no próprio doc.

### Multiplayer Sync (200ms)
- Player escreve `{x, y, z, ry, state, name, chatMsg, chatAt, level, ...}` a cada 200ms
- `onSnapshot` em `worlds/main/players` filtrado por `level`
- Ghost TTL: 15s (player some se não escreveu nesse intervalo)
- Chat TTL: 30s

### Quality Profiles (`Settings.tsx::QUALITY_PROFILES`)
| Flag | low | medium | high |
|------|-----|--------|------|
| `dpr` | 0.5–0.75 | 1–1.25 | 1–2 |
| `far` | 40 | 80 | 120 |
| `antialias` | ❌ | ❌ | ✅ |
| `atmosphere` (dust/fans/clock/flicker) | ❌ | ❌ | ✅ |
| `overlay` (vignette+grain) | ❌ | ❌ | ✅ |
| `nightLights` | ❌ | ✅ | ✅ |
| `chatBubbles3D` | ❌ | ✅ | ✅ |
| `remoteLimit` | 3 | 8 | 30 |

GLBs (avatar, NPC, Dussekar) são carregados em **todos** os modos.

---

## ⚡ Comandos Úteis

```bash
# Rodar local (dev server)
cd jubileu && npm install && npm run dev   # porta 3000

# Build reprodutível (USE ISTO, não `npm install` + `npm run build`)
cd jubileu && npm run build:reproducible

# TypeScript check
cd jubileu && npx tsc --noEmit

# Bot API (no console do navegador)
window.__jubileuBot.spawn(3)    # 3 bots
window.__jubileuBot.follow()    # todos seguem
window.__jubileuBot.tour()      # tour guiado
window.__jubileuBot.help()      # listar comandos
```

---

## 🚨 Armadilhas Conhecidas

| Erro | Por quê | Como evitar |
|------|---------|-------------|
| FPS cai 60→29 após rebuild | Rodou `npm install` em vez de `npm ci`; lock pode mudar | `npm run build:reproducible` |
| Multiplayer não funciona (writes silenciosamente rejeitados) | `firestore.rules` no repo ≠ rules deployadas no Firebase Console | Deploy manual: Firebase Console → Firestore → Rules → colar |
| `<Html occlude>` mata o FPS | drei faz raycasting da cena toda por frame | **Nunca** use `occlude` em `<Html>` (já removido em Dussekar e RemotePlayer) |
| GLB grande trava o load inicial | Carga síncrona | Use `useGLTF.preload(URL)` no top-level do arquivo |
| Source editado mas mudança não aparece no jogo | Esqueceu de rebuildar o `index.html` | **Sempre** rodar `npm run build:reproducible` após editar source |
| Mudança aparece local mas quebra deploy | Comitou source sem `index.html` (ou vice-versa) | Comite os dois juntos |

---

## ✅ Checklist Antes de Commitar

- [ ] Editou `jubileu/src/...`?
- [ ] Rodou `npm run build:reproducible`?
- [ ] `git status` mostra `jubileu/src/...` E `index.html` modificados?
- [ ] `npx tsc --noEmit` passa sem erro?
- [ ] Atualizou `MEMORY.md` com o que foi feito?
- [ ] Mensagem de commit segue o padrão `tipo(escopo): descrição`?
- [ ] Está pushando pra branch certa? (não pra `main` direto sem permissão)

---

## 🔗 Assets Externos

Todos hospedados no GitHub do Felipe (raw.githubusercontent.com):

| Asset | Repo |
|-------|------|
| Avatar Walking | `Bancon...../Walking(1).glb` |
| Avatar Idle | `BACON-PROJETO-FUNCIONALLLLL/Idle.glb` |
| NPC Walking/Idle | `Npc-test/npc walking.glb` + `npc idle.glb` |
| Dussekar | `Vers-o-definitiva/blocky character 3d model.glb` |
| Barney sprite | `For-my-game/1776639536329.png` |
| Texturas (floor/wall/ceiling) | `Textura-*` (4 repos) |
| Música lobby | `M-sica-pro-meu-jogo/Lobby Time(MP3_160K).mp3` |
| Tema Barney | `archive.org/download/barneysgreatesthits/Barney Theme Song.mp3` |

---

## 🆘 Se Tudo Quebrar

```bash
# Restaurar tudo a partir do backup-v2
cp -r backup-v2/src/* jubileu/src/
cp backup-v2/package.json backup-v2/package-lock.json jubileu/
cp backup-v2/index.html .

# Ou restaurar via branch
git checkout backup/pre-perf-investigation-2026-04-27 -- .

# Ou só o index.html (versão 60fps original)
cp backup/index.html .
```

---

## 📚 Próximos Passos da IA

1. Leia este arquivo (`MAP.md`) — você está fazendo isso ✅
2. Leia `MEMORY.md` — histórico cronológico, mudanças recentes, decisões
3. Leia `AUDIT.md` — problemas conhecidos
4. Olhe `git log --oneline -20` — contexto dos últimos commits
5. Veja qual branch está ativa: `git branch --show-current`
6. **Só então** comece a editar

---

*Última atualização: 2026-04-28 — alinhado com MEMORY.md (regra "sempre rebuildar"), incorpora descobertas da sessão de FPS (Dussekar `<Html occlude>` removido, `useGLTF.preload`, quality profiles reais).*
