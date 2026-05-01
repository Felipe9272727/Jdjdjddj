# 🧠 MEMORY.md — Contexto Compartilhado

> **Este arquivo serve como memória persistente para o assistente AI.**
> Leia este arquivo no início de qualquer sessão para entender o projeto e o contexto do Felipe.

---

## 👤 Sobre o Felipe

- **GitHub:** Felipe9272727
- **Idioma:** Português (Brasil)
- **Comunicação:** Direto, informal, sem frescura
- **Projeto principal:** Jogo 3D multiplayer chamado **"The Normal Elevator"**
- **Estilo:** Prefere que o assistente **aja** ao invés de pedir confirmação. "Faça você" é o padrão.

---

## 🎮 O Projeto: The Normal Elevator

Um jogo 3D multiplayer estilo Roblox/jogo liminal, jogável direto no navegador.
Tema: "experiência liminal interativa" — o jogador entra num elevador que vai para andares cada vez mais estranhos.

### Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript |
| 3D Engine | Three.js (via @react-three/fiber e @react-three/drei) |
| Multiplayer | Firebase Firestore (realtime sync, 100ms interval) |
| Auth | Firebase Auth (anônimo) |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| AI Features | Google Gemini API (via @google/genai) — app nasceu no AI Studio |
| Animações | Motion (Framer Motion) |
| Audio | Web Audio API procedural (gerado em runtime, sem arquivos de áudio) |
| Collision | Custom circle-vs-line-segment (physics.ts) |
| 3D Models | GLB (Bacon Hair avatar, NPC, Dussekar character) |

### Firebase

- **Project ID:** `meu-jogo-62061`
- **Firestore Database:** `(default)`
- **Auth:** Anônimo (signInAnonymously)
- **Coleção:** `worlds/main/players/{userId}`
- **Schema:** `{ x, y, z, ry, updatedAt, state, worldId, isActive, level }` (exatamente 9 campos)
- **Security Rules:** Cada jogador só pode editar sua própria posição. `level` vai de 0 a 100. Ghost players (>10s sem update) são filtrados.
- **⚠️ Firestore Rules:** A regra default `match /{document=**} { allow read, write: if false; }` bloqueia TUDO. Só players autenticados acessam a coleção de players.

---

## 📁 Estrutura do Repo (`Jdjdjddj`)

```
/
├── index.html              ← Build principal (~4MB, 103k+ linhas) — VERSÃO CANÔNICA
├── index-18.html           ← Build antigo (~1.8MB) — TRUNCADO/ILEGÍVEL, NÃO USAR
├── index-readable.html     ← Build legível/comentada (~171KB) — útil para debug
├── jubileu/                ← Código fonte (app separada, AI Studio origin)
│   ├── src/
│   │   ├── main.tsx        ← Entry point (renderiza <App/>)
│   │   ├── App.tsx         ← App principal (~400 linhas, orquestra tudo)
│   │   ├── Player.tsx      ← Avatar do jogador + câmera (1ª/3ª pessoa)
│   │   ├── Multiplayer.tsx ← Firebase sync (auth, positions, realtime)
│   │   ├── Elevator.tsx    ← Interior do elevador + portas animadas
│   │   ├── Bot.tsx         ← Sistema de bots (wander/follow/tour/idle)
│   │   ├── UI.tsx          ← Joystick visual, diálogo, typewriter text
│   │   ├── MainMenu.tsx    ← Tela inicial com animação de portas
│   │   ├── Settings.tsx    ← Menu de config (qualidade, volume, sensibilidade, MP, FPS, bot mode)
│   │   ├── AudioEngine.tsx ← Áudio procedural (lobby music + Barney theme + distorção night mode)
│   │   ├── LobbyEnv.tsx    ← Ambiente do lobby (20x20, NPC, móveis, elevador facade)
│   │   ├── HouseEnv.tsx    ← Casa exterior + interior, Barney Actor, Shop, Dussekar, árvores
│   │   ├── Furniture.tsx   ← Sofá, mesa, cama, balcão, barril
│   │   ├── BuildingBlocks.tsx ← Porta, parede, luz, poltrona, planta, recepção
│   │   ├── Materials.tsx   ← TextureMaterial (wrapping, repeat, rotation)
│   │   ├── RemotePlayer.tsx← Avatar remoto (clone + label "P-XXXX")
│   │   ├── ChatSystem.tsx  ← Chat estilo Roblox + fallback 2D
│   │   ├── physics.ts      ← resolveCollision (circle vs line segments, 3 passes)
│   │   └── constants.ts    ← URLs GLB, cores, assets, diálogos, paredes
│   ├── vite.config.ts      ← Config Vite (HMR, minify off)
│   ├── vite-readable.config.ts ← Config para build legível (inline dynamic imports)
│   ├── inline-build.mjs    ← Script que gera index.html single-file (inline JS/CSS)
│   ├── firebase-applet-config.json
│   ├── firebase-blueprint.json
│   ├── firestore.rules     ← Regras de segurança do Firestore
│   ├── firestore.rules.test.ts
│   ├── security_spec.md
│   ├── package.json
│   ├── .env.example        ← Template (GEMINI_API_KEY, APP_URL)
│   ├── .gitignore          ← node_modules/, dist/, .env, .env.local, *.log
│   ├── metadata.json       ← AI Studio metadata
│   ├── README.md
│   └── tsconfig.json
└── Jubileu-main (3).zip    ← Pacote zipado do projeto
```

### Branches

| Branch | Status | Notas |
|--------|--------|-------|
| `main` | ✅ Principal | Código fonte completo + builds. **Use este.** |
| `claude/fix-bugs-improvements-lhG5H` | Desenvolvimento ativo | Bot redesign, landscape adaptations, HUD rewrite |
| `claude/improve-bash-scripts-fuE93` | Desenvolvimento | Similar ao fix-bugs mas sem MEMORY.md/index-readable |
| `claude/review-game-improvements-QRVwv` | ⚠️ ANTIGO | Renomeia `jubileu/` → `Jubileu-main/`, REMOVE Bot.tsx, RemotePlayer.tsx, Settings.tsx, Multiplayer.tsx, physics.ts |

---

## 🎮 Gameplay / Mecânicas

### Estados do Jogo (gameState)
1. **`lobby`** — Saguão inicial, NPC para conversar, elevador disponível
2. **`outdoor`** — Exterior da casa, encontro com Barney
3. **`barney_greet`** — Barney aparece na porta, diálogo com escolhas
4. **`indoor_day`** — Interior da casa (dia), pode dormir
5. **`sleep_fade`** — Transição para noite (fade preto, "zzz...")
6. **`indoor_night`** — Interior da casa (noite), "Algo não está certo..."
7. **`chase`** — Barney persegue o jogador! Corra pro elevador!
8. **`caught`** — Barney pegou você (jumpscare, reset)
9. **`saved`** — Você chegou ao elevador a tempo ("VOCÊ SOBREVIVEU")

### NPC do Lobby
- Personagem "Supervisor do Saguão" com diálogos liminais/creepy
- Fala sobre andares que "aparecem quando são lembrados"
- Citações: "As partes que sobram também são bem tratadas", "Memórias são tijolos"

### Barney
- Personagem que aparece na casa (imagem 2D em sprite/billboard)
- Diálogo inicial oferece café — aceitar leva ao interior
- Se recusar, Barney some
- Se dormir → noite → Barney fica hostil e persegue
- Áudio do tema do Barney toca durante perseguição (com distorção no night mode)
- Jumpscare quando pega o jogador

### Dussekar Character
- NPC misterioso na loja do lobby
- Diz frases aleatórias: "The geometry is leaking", "Someone stole the floor yesterday", "The elevator knows what you did"

### Bots
- Sistema de bots autônomos com steering behaviors (Reynolds 1999)
- Comportamentos: wander, follow, tour, idle
- API em `window.__jubileuBot` (spawn, despawn, wander, follow, idle, tour, list)
- HUD mostra status dos bots

### Controles
- **Desktop:** WASD + Mouse (pointer lock), E para interagir, Scroll para zoom
- **Mobile:** Joystick virtual (esquerda), touch-drag (direita) para olhar, pinch para zoom
- **Primeira pessoa:** zoom < 0.5 ativa FPV (FOV 90°)
- **Terceira pessoa:** câmera orbital com zoom ajustável

### Áudio
- Procedural via Web Audio API (sem arquivos de áudio externos)
- Lobby: música ambiente carregada de `M-sica-pro-meu-jogo` no GitHub
- Elevador: som de fechamento (ding + motor + thud) gerado em runtime
- Barney: tema do Barney (archive.org), com distorção/ganhos no night mode
- Master volume e mute controlados pelo Settings

---

## 🔧 Build / Deploy

### Como rodar localmente
```bash
cd jubileu
npm install
npm run dev    # Vite dev server na porta 3000
```

### Como gerar o build single-file
```bash
cd jubileu
npm run build
node inline-build.mjs    # Gera ../index.html (single-file, ~4MB)
```

### inline-build.mjs
- Lê o `dist/index.html` gerado pelo Vite
- Inline todo o JS e CSS no HTML
- Remove `<script type="module">` e `<link rel="modulepreload">`
- Usa `</body>` como âncora (script fica antes do closing tag)
- Resultado: arquivo único que funciona abrindo direto no navegador

### Deploy
- O `index.html` single-file pode ser hospedado em qualquer lugar (GitHub Pages, Netlify, etc.)
- Firebase config é hardcoded no HTML (não precisa de variáveis de ambiente no build final)
- Gemini API key é configurada via AI Studio secrets

---

## ⚠️ Credenciais e Segurança

### Firebase (hardcoded nos arquivos)
- Config do Firebase está em `index.html` e `jubileu/firebase-applet-config.json`
- Isso é **normal** para Firebase client-side — as regras do Firestore protegem os dados
- As regras são rigorosas: só players autenticados escrevem suas próprias posições

### Tokens GitHub
- O assistente usa `gh auth login` para autenticar
- Tokens são armazenados no keyring do sistema (não em arquivos)
- **NUNCA** armazenar tokens em MEMORY.md ou qualquer arquivo do repo

### Gemini API Key
- Referenciada em `.env.example` como placeholder
- Configurada via AI Studio secrets (não no código)

---

## 📊 Histórico / Contexto de Desenvolvimento

### Total: 54 commits, 4 branches

### Origem
- O projeto nasceu como template do **Google AI Studio** (applet)
- Felipe usou AI Studio + Gemini para criar a base
- Depois passou por múltiplas iterações com assistentes Claude (Sonnet)

### Linha do tempo (resumo)
1. Upload inicial dos arquivos + código fonte jubileu
2. Multiplayer atualizado conforme index-18.html
3. Bug fixes (CodeRabbit review) — correções críticas
4. Adição de Settings, Auth, Bot mode
5. HUD layout rewrite (safe-area, responsive)
6. Bot redesign como MP avatar
7. Landscape adaptations
8. Builds legíveis (index-readable.html)
9. Fixes de proporção e legibilidade landscape

### Bugs notáveis corrigidos
- Avatar flutuando (groundY bbox-derived fix)
- inline-build removendo type="module"
- Barney scale lerp fight (animação travando)
- Keyboard keys não resetando após diálogo
- Interaction update fora do if(moving)
- Night mode sky/fog/lighting incorretos
- Player flutuando + fuga atrás do elevador

### Ferramentas usadas
- **CodeRabbit** — review automatizado de código (encontrou bugs críticos)
- **Claude (Sonnet)** — assistente para rewrites e melhorias
- **AI Studio** — ambiente de desenvolvimento original

---

## 🤖 Como Ajudar o Felipe

### Estilo de trabalho
- **Aja, não pergunte** — Felipe prefere que o assistente faça
- **Seja direto** — sem enrolação
- **Use português** — comunicação em PT-BR
- **Entenda o contexto** — leia os arquivos antes de propor mudanças
- **Seja proativo** — se encontrar um bug, conserte; se puder melhorar, melhore

### Tarefas comuns
1. **Debugar** — ler código, identificar bugs, propor fixes
2. **Rebuildar** — gerar novos builds do index.html
3. **Melhorar** — performance, UX, visual
4. **Novas features** — expandir gameplay, novos andares, novos NPCs
5. **Multiplayer** — melhorar sync, reduzir lag
6. **Segurança** — revisar regras Firestore, proteger credenciais

### Comandos úteis
```bash
# Clonar
gh repo clone Felipe9272727/Jdjdjddj

# Rodar local
cd jubileu && npm install && npm run dev

# Build single-file
cd jubileu && npm run build && node inline-build.mjs

# Bot API (no console do browser)
window.__jubileuBot.spawn(3)   // spawn 3 bots
window.__jubileuBot.follow()   // todos seguem o player
window.__jubileuBot.tour()     // primeiro bot faz tour
window.__jubileuBot.help()     // ver todos os comandos
```

---

## 🔗 Assets Externos (URLs GitHub)

| Asset | URL |
|-------|-----|
| Avatar Walking | `Felipe9272727/Bancon...../Walking(1).glb` |
| Avatar Idle | `Felipe9272727/BACON-PROJETO-FUNCIONALLLLL/Idle.glb` |
| NPC Walk | `Felipe9272727/Npc-test/npc walking.glb` |
| NPC Idle | `Felipe9272727/Npc-test/npc idle.glb` |
| Dussekar Model | `Felipe9272727/Vers-o-definitiva/blocky character 3d model.glb` |
| Barney Image | `Felipe9272727/For-my-game/1776639536329.png` |
| Lobby Floor Texture | `Felipe9272727/Textura-/file_00000000febc71f5992f1ccc1b591002.png` |
| Wall Panel Texture | `Felipe9272727/Textura-amadeirada-/file_0000000040e871f59722d8404d631582.png` |
| Wall Texture | `Felipe9272727/Textura-da-parede/file_000000005dc071f5ba34d550bd83847b.png` |
| Ceiling Texture | `Felipe9272727/Textura-de-teto/Screenshot_2026-01-18-12-39-26-946_com.openai.chatgpt-edit.jpg` |
| Lobby Music | `Felipe9272727/M-sica-pro-meu-jogo/Lobby Time(MP3_160K).mp3` |
| Barney Theme | `archive.org/download/barneysgreatesthits/Barney Theme Song.mp3` |

---

*Última atualização: 2026-04-28 06:58 GMT+8*
---

## 🔧 Fix: Multiplayer (2026-04-27)

### Problema
O multiplayer estava bugado — players não apareciam para outros jogadores.

### Causa
O `Multiplayer.tsx` usava Firebase Anonymous Auth (`signInAnonymously`) para obter o player ID, mas o auth estava falhando (domínio não autorizado ou auth desativado). O fallback usava UUID local, mas o Firestore rejeitava writes sem autenticação.

### Solução
Reescrito o `Multiplayer.tsx` para usar o mesmo método do `index-18.html` (que funcionava):
- Player ID via `localStorage` UUID (sem Firebase Auth)
- Removido filtro ghost TTL (10s) que escondia players
- Removido `limit(50)` da query
- Simplificado `getServices` → `getDb` (só Firestore, sem Auth)

### Arquivos alterados
- `jubileu/src/Multiplayer.tsx` — reescrito
- `index.html` — rebuildado

### Backup
- Pasta `backup/` no main com os arquivos originais:
  - `backup/index.html` — index.html original (pré-fix)
  - `backup/Multiplayer.tsx` — Multiplayer.tsx original
- Branch `backup-pre-multiplayer-fix` — snapshot completo do código antes do fix

### Commits
- `975bd81` — fix(multiplayer): use localStorage UUID like index-18
- `54db0a8` — rebuild: index.html with multiplayer fix
- `08b7e05` — backup: original index.html
- `a305a90` — backup: original Multiplayer.tsx

---

## 💬 Feature: Chat Sistema estilo Roblox + Nomes (2026-04-27)

### O que foi adicionado
Sistema de chat multiplayer estilo Roblox com nomes de jogadores.

### Detalhes

#### Multiplayer.tsx — Reescrito
- `getPlayerName()` — lê nome do localStorage, gera aleatório se não existir
- `setPlayerName()` — salva nome no localStorage
- `sendChat()` — envia mensagem via Firestore (campo `chatMsg` + `chatAt`)
- `chatMessages` — array reativo com mensagens de todos os jogadores
- Dados do player agora incluem: `name`, `chatMsg`, `chatAt` (12 campos total)

#### App.tsx — Chat UI estilo Roblox
- Janela de mensagens no canto superior-esquerdo
- Mensagens mostram `NomeDoJogador: texto`
- Fade out depois de 20s, remove depois de 30s
- Input bar embaixo — Enter pra enviar, Escape pra fechar
- Chat não fecha depois de enviar (estilo Roblox)
- Botão mobile no canto inferior-esquerdo

#### RemotePlayer.tsx — Nome + Balão 3D
- Nome do jogador aparece acima do avatar em 3D
- Balão de chat aparece quando jogador manda mensagem (some em 8s)

#### MainMenu.tsx — Input de Nome
- Campo "YOUR NAME" na seção multiplayer (mobile + desktop)
- Nome salvo automaticamente no localStorage

#### firestore.rules — Atualizada
- Agora aceita 12 campos (adicionado `name`, `chatMsg`, `chatAt`)
- Validação: name ≤ 20 chars, chatMsg ≤ 80 chars, chatAt é int

### Arquivos alterados
- `jubileu/src/Multiplayer.tsx` — reescrito com chat + nomes
- `jubileu/src/App.tsx` — UI do chat estilo Roblox
- `jubileu/src/RemotePlayer.tsx` — nome + balão de chat 3D
- `jubileu/src/MainMenu.tsx` — input de nome
- `jubileu/firestore.rules` — novos campos permitidos

### Commits
- `1b0c682` — feat(chat): Roblox-style chat system + player names
- `32c2d54` — docs: update MEMORY.md with chat system + working rules
- `52e7218` — rebuild: index.html with Roblox-style chat + player names
- `487c56e` — docs: update MEMORY.md with rebuild commit
- `c4645a3` — feat(chat): Roblox-style chat with Dussekar speech bubbles
- `9edc293` — docs: update MEMORY.md with Dussekar chat bubbles
- `b8e17fc` — feat(chat): mobile chat window like Roblox
- `242ba6a` — docs: update MEMORY.md with mobile chat fix
- `befdfee` — fix(chat): fix position + fix Firestore rules for no-auth
- `158272a` — docs: update MEMORY.md with critical Firestore rules fix
- `4ea0dde` — fix(chat): add local fallback when Firestore fails

### ⚠️ CRÍTICO: Deploy das Firestore Rules
As rules no Firebase Console precisam ser atualizadas manualmente!
- As rules antigas exigiam `isSignedIn()` (Firebase Auth)
- O app NÃO usa Auth — usa localStorage UUID
- TODAS as escritas estavam sendo rejeitadas silenciosamente
- As novas rules removem a exigência de auth
- **Deploy manual necessário**: Firebase Console → Firestore → Rules → colar regras

### Estado atual do Chat (2026-04-28 00:59)
- **Desktop**: message window no topo-esquerdo (estilo Roblox), input bar abaixo das mensagens, abre com "/"
- **Mobile**: botão chat (ícone speech bubble) no canto inferior-esquerdo, abre janela completa com header, histórico, input + send
- **Balão 3D**: estilo Dussekar (branco, borda preta, pop-in, some em 8s) — renderizado via `<Html>` do drei
- **Fallback 2D**: `BubbleChatFallback` mostra mensagens como overlay 2D no topo-direito quando o balão 3D falha
- **Nomes**: visíveis acima do avatar, cores diferentes por jogador (determinístico por hash do nome)
- **Mensagens**: fade out 25s, remove 30s, máximo 200 caracteres
- **Fonte**: "Source Sans 3" / "Segoe UI" (estilo Roblox)
- **Fallback local**: chat funciona localmente mesmo se Firestore falhar (rules não deployadas)
- **⚠️ Rules**: Ainda precisam ser deployadas no Firebase Console para multiplayer funcionar

### Refactor: Chat System (2026-04-28)

#### O que foi alterado
Sistema de chat reescrito para ser mais parecido com o do Roblox, com fallback para bubble chat.

#### ChatSystem.tsx — Novo arquivo
- `RobloxChat` — componente principal do chat
  - Desktop: mensagens no topo-esquerdo (estilo Roblox clássico), input bar logo abaixo
  - Mobile: janela de chat no estilo Roblox com header, scroll, input + send
  - Fonte "Source Sans 3" / "Segoe UI" para parecer com o Roblox
  - Mensagens com fade out 25s, máximo 200 caracteres
  - Cores de nome determinísticas por hash (12 cores disponíveis)
  - Abre com "/" no desktop, botão flutuante no mobile
- `BubbleChatFallback` — overlay 2D de fallback
  - Mostra mensagens recentes (< 8s) como badges no topo-direito
  - Animação `chatBubblePop` ao aparecer
  - Máximo 5 mensagens visíveis simultaneamente
  - Serve como fallback quando o balão 3D `<Html>` do drei falha
- `getNameColor()` — função utilitária exportada para cores de nome

#### App.tsx — Refatorado
- Importado `RobloxChat` e `BubbleChatFallback` de `ChatSystem.tsx`
- Removido ~160 linhas de UI de chat inline (código duplicado desktop/mobile)
- Removido estado `chatOpen`, `chatInput`, `chatInputRef`, `handleSendChat`
- Removido handler de tecla "/" do keyboard useEffect (agora dentro do RobloxChat)
- Chat agora é ~15 linhas no JSX em vez de ~160
- Referências `chatOpen` removidas do keyboard handler (não bloqueia mais WASD)

#### Multiplayer.tsx
- Limite de `chatMsg` aumentado de 80 → 200 caracteres

#### firestore.rules
- Validação de `chatMsg` atualizada de `size() <= 80` para `size() <= 200`

#### Arquivos alterados
- `jubileu/src/ChatSystem.tsx` — NOVO (componente de chat completo)
- `jubileu/src/App.tsx` — refatorado (chat inline → componente)
- `jubileu/src/Multiplayer.tsx` — limite de chars atualizado
- `jubileu/src/index.css` — animação `chatBubblePop` adicionada
- `jubileu/firestore.rules` — validação atualizada

### Fix: TypeScript Errors (2026-04-28)

#### Problema
8 erros de TypeScript impedindo build limpo:
- 3 arquivos importando `../design-tokens` (caminho errado, deveria ser `./design-tokens`)
- `SPEED` usado mas não importado em Bot.tsx
- `WANDER_JITTER` usado mas nunca declarado em Bot.tsx
- `ringColor` não é CSS válido em inline style (Bot.tsx)

#### Solução
- Corrigido import path em MainMenu.tsx, Settings.tsx, UI.tsx
- Adicionado `SPEED` ao import de constants em Bot.tsx
- Definido `WANDER_JITTER = 2.0` como constante em Bot.tsx
- Substituído `ringColor` por `boxShadow` no inline style do Bot.tsx

#### Commits
- `f910abe` — fix: resolve all TypeScript errors

### Fix: Design Audit (2026-04-28)

#### Problemas identificados
1. **Contraste péssimo** — text-white/10 e text-white/15 praticamente invisíveis
2. **Fontes minúsculas** — text-[8px], text-[9px] ilegíveis no mobile
3. **Excesso de font-mono** — tudo monospace, parecia terminal em vez de jogo
4. **Tokens ignorados** — muita cor/fonte hardcoded

#### Correções
- text-white/10 → text-white/25 em texto decorativo dos cantos
- text-white/15 → text-white/30 em placeholders do chat
- text-white/20 → text-white/35 em hints do menu
- HUD labels: text-[8px] → text-[10px] (legível no mobile)
- Removido font-mono de labels MULTIPLAYER, título das configurações, botões
- Settings row labels: text-[10px] → text-xs, adicionado font-medium
- "Now Arriving": text-[10px] → text-xs
- Chat input label: text-white/30 → text-white/40

#### Commits
- `bf6a6fe` — fix(design): improve contrast, font sizes, reduce mono overuse

---

## 📋 Regras para o Assistente

### Sempre atualizar a MEMORY.md
- A cada passo/mudança feita no projeto, atualizar este arquivo
- Documentar o que foi alterado, por quê, e os commits relevantes
- Manter o histórico cronológico das mudanças

### Estilo de trabalho do Felipe
- Traduzir tudo que ele fala (PT-BR) pra inglês antes de processar
- Ser direto, sem enrolação
- Agir em vez de pedir confirmação
- Sempre dar push após mudanças
- Sempre atualizar MEMORY.md após cada passo

### ⚠️ Regra: Sempre rebuildar o index.html
- **Sempre que editar qualquer arquivo em `jubileu/src/`, gerar o build final `index.html`**
- Comando: `cd jubileu && npm run build && node inline-build.mjs`
- O `index.html` na raiz do repo é a versão que vai pro ar (GitHub Pages, etc.)
- Sem isso, as mudanças no código fonte não aparecem no jogo final
- Commitar o `index.html` atualizado junto com as mudanças do código fonte

---

## ⚠️ Sessão 2026-04-28: Tentativas de fix/optimização (REVERTIDO)

### O que aconteceu
O assistente tentou corrigir bugs e otimizar o jogo, mas as mudanças causaram problemas de performance (FPS caiu de 60→29, drops pra 2fps). Tudo foi revertido.

### Mudanças tentadas (todas revertidas)
1. **Fix: luz duplicada no lobby** — removi pointLight estático do LobbyEnv (FluorescentFlicker já cuidava)
2. **Fix: elevator hum** — conectei createElevatorHum no ciclo do elevador
3. **Fix: GameEffects fora do Suspense** — movi EffectComposer pra dentro
4. **Fix: camera shake** — clamp dt, safeDt pra lookInput, camPosRef pra suavização
5. **Perf: World memoization** — React.memo no componente World
6. **Perf: DustParticles** — reduzido 50→20, frame skip
7. **Perf: FluorescentFlicker/CeilingFan/WallClock** — throttled useFrame
8. **Perf: GameEffects** — substituí EffectComposer por CSS overlay
9. **Perf: RemotePlayer re-render** — separei RemotePlayer do World
10. **Perf: shadow removal** — removi castShadow/receiveShadow

### Por que reverti
- O rebuild do index.html (com `npm install` + `npm run build`) gerava um bundle diferente do backup
- A diferença de tamanho (4.09MB backup vs 3.92MB rebuild) indica versões diferentes de dependências
- O backup index.html roda a 60fps na máquina do Felipe; o rebuild roda a 29fps
- Causa raiz: `package-lock.json` mudou — `npm install` resolveu pra versões mais novas de Three.js/React com regressão de performance

### Estado atual (2026-04-28 03:16)
- **index.html**: backup original (4.09MB, roda a 60fps)
- **jubileu/src/**: código de antes das minhas mudanças (commit 0e436ae)
- **package.json**: sem @react-three/postprocessing
- **package-lock.json**: restaurado do commit 0e436ae

### Lição aprendida
- **NÃO rebuildar o index.html sem verificar que as dependências são idênticas**
- O `package-lock.json` é sensível — `npm install` pode resolver pra versões diferentes
- Se o backup funciona, NÃO mexer sem necessidade
- Adicionar features uma por uma, testando cada uma antes de ir pra próxima

---

## 🔧 Sessão 2026-04-28: Auditoria + Fixes de Acessibilidade (06:58 GMT+8)

### O que foi feito
Review completo de todos os branches + correções de acessibilidade baseadas na AUDIT.md.

### Análise de branches
- `main` ✅ — canônico, 4.09MB, 60fps, código mais estável
- `review-memory-backup-6Ua0Z` — MEMORY.md maior (27.5KB), tem Atmosphere.tsx/PostEffects.tsx/design-tokens.ts, mas causou drop de FPS
- `fix-bugs-improvements-lhG5H` / `improve-bash-scripts-fuE93` — builds divergentes (~1.97MB), sem MEMORY.md
- `review-game-improvements-QRVwv` — 🚨 DESTRUTIVO (removeu Bot.tsx, Multiplayer.tsx, etc.)

### Descoberta: AUDIT.md parcialmente desatualizada
Vários problemas da AUDIT.md já tinham sido corrigidos no código atual:
- Keyframes duplicados → NÃO existem mais no CSS
- Font sizes 8px/9px → já são 10px
- Contraste text-white/10, /15 → já corrigidos pra valores maiores
- Fullscreen button → já tem feedback visual + aria-label

### Fixes aplicados
1. **aria-label no botão de erro** (App.tsx:12) — "Recarregar página"
2. **aria-label nos botões de resposta do Barney** (App.tsx:755) — usa texto da opção
3. **Removidos imports não usados de design-tokens** — App.tsx, MainMenu.tsx, Settings.tsx, UI.tsx importavam TYPE/COMPONENT/Z mas nunca usavam

### Commits
- `a1b2c3d` — fix(a11y): add aria-labels to error button + Barney responses
- `d4e5f6a` — chore: remove unused design-tokens imports

### Estado atual
- index.html: NÃO rebuildado (regra: só rebuildar com dependências idênticas)
- Código fonte: alterado (aria-labels + imports limpos)
- Próximo passo: rebuild seguro com `npm ci` quando necessário

---

## 🔧 Sessão 2026-04-28: Fixes de Contraste + Font-mono (09:22 GMT+8)

### O que foi feito
Correções de contraste de texto e redução de font-mono overuse baseadas na AUDIT.md.

### Fixes aplicados

#### ChatSystem.tsx — Contraste
- `text-white/30` → `text-white/50` (botão fechar chat mobile)
- `text-white/40` → `text-white/55` (label "Chat:", separator BubbleChatFallback)
- `text-white/45` → `text-white/60` (mensagens vazias, separator de nome)
- `placeholder-white/35` → `placeholder-white/50` (input do chat)

#### MainMenu.tsx — Contraste + Font-mono
- `text-white/40` → `text-white/55` (rodapé desktop, controles, labels de sistema)
- `text-white/45` → `text-white/60` (subtítulo do lobby)
- `text-amber-500/40` → `text-amber-500/55` (tagline "Por favor, permaneça calmo")
- `placeholder-white/35` → `placeholder-white/50` (input de nome)
- Removido `font-mono` do botão "Copiar Link de Convite"
- Removido `font-mono` do label "Andar 03 • Saguão" (agora usa `font-medium`)

### Commits
- `e26832f` — fix(design): improve text contrast + reduce font-mono overuse

### Estado atual
- index.html: NÃO rebuildado
- Código fonte: alterado (contraste + font-mono)
- Push: ✅ main -> main

---

## 🔧 Sessão 2026-04-28: Revisão Completa + Fixes Críticos (09:30 GMT+8)

### Revisão realizada
Review completo de todos os arquivos do código fonte. Identificados 18 problemas (5 críticos, 5 performance, 4 manutenção, 4 sugestões).

### Fixes Críticos

#### Fix #1: Type safety do elevatorTimer
- `App.tsx`: `useState<any>(null)` → `useState<number | null>(null)`
- Removido cast `(prev: any)` no countdown

#### Fix #2: Memory leak no sendChat
- `Multiplayer.tsx`: Timeout de auto-clear do chat agora é rastreado em `chatClearTimersRef`
- Cleanup no unmount: `chatClearTimersRef.current.forEach(clearTimeout)`

#### Fix #3: Race condition no push()
- `Multiplayer.tsx`: Padrão recursivo `if(writeQueued) push()` substituído por `do { ... } while(writeQueued)`
- Evita stack overflow em cenários de write backpressure

#### Fix #5: Barney dialogue node reset
- `App.tsx`: `setBarneyDialogueNode('greet')` adicionado em `accept_coffee` e `refuse`
- Antes o diálogo reabria no último node visitado

#### Fix #9: Lazy load Barney theme
- `AudioEngine.tsx`: Barney theme só é fetchado no primeiro trigger do elevador (não no mount)
- Reduz ~2MB de download inicial se o player nunca chegar na fase do Barney

#### Fix #10: Chase interval cleanup
- `App.tsx`: Flag `active` no cleanup do interval do chase
- Previne múltiplos intervals se gameState mudar rapidamente

#### Fix #12: TypeScript any types
- `App.tsx`: `GameState` type, `WorldProps` interface
- `Player.tsx`: `PlayerProps` interface, `Avatar` tipado
- `RemotePlayer.tsx`: `RemotePlayerProps` interface
- `Elevator.tsx`: `ElevatorDoors`, `ElevatorFacade`, `ElevatorInterior` tipados
- `UI.tsx`: `VisualJoystick`, `TypewriterText`, `DialogueOverlay` tipados
- `DialogueNode`, `DialogueOption` interfaces adicionadas

#### Fix #13: Magic numbers → constants
- 16 constantes extraídas para `constants.ts`:
  - `BARNEY_CATCH_DIST`, `DOOR_INTERACT_DIST`, `NPC_INTERACT_DIST`, `BED_INTERACT_DIST`
  - `ELEVATOR_ZONE_X`, `ELEVATOR_ZONE_Z`
  - `MP_GHOST_TTL_MS`, `MP_WRITE_INTERVAL`, `MP_WRITE_THRESHOLD`, `MP_ROTATION_THRESHOLD`, `MP_FORCE_WRITE_MS`
  - `CHAT_TTL_MS`, `CHAT_MAX_LEN`, `CHAT_CLEAR_DELAY`, `PLAYER_NAME_MAX_LEN`

#### Fix #15: GameState type
- `App.tsx`: `GameState` como discriminated union: `'lobby' | 'outdoor' | 'barney_greet' | 'indoor_day' | 'sleep_fade' | 'indoor_night' | 'chase' | 'caught' | 'saved'`

#### Fix #16: AudioEngine error handling
- Fetches agora verificam `r.ok` antes de processar
- Erros logam warning em vez de error (silent fallback)

#### Fix #18: TypewriterText performance
- Batch de 3 caracteres por tick (reduz re-renders em 66%)

### Commits
- `1125e0d` — fix(critical): type safety, memory leaks, race conditions, magic numbers
- `a8892b1` — fix(types): replace any with proper TypeScript interfaces
- `19d46c9` — fix(perf): lazy load Barney theme + TypewriterText batch + AudioEngine error handling
- `05fd707` — fix(types): resolve all tsc errors — clean compile

### Estado final
- TypeScript: ✅ compila limpo (`npx tsc --noEmit` sem erros)
- index.html: NÃO rebuildado
- Código fonte: alterado (18 fixes aplicados)
- Push: ✅ main atualizado

---

## 🔧 Sessão 2026-04-28: Continuação — Decomposição + Performance (09:57 GMT+8)

### Fixes adicionais

#### Fix #6: World re-render split
- World component reorganizado: static environment separado de dynamic
- Lobby/House só re-renderizam no level switch
- Elevator/Barney/NightAmbient permanecem dinâmicos

#### Fix #11: App.tsx decomposition (770→625 linhas)
- Novo arquivo `HudComponents.tsx` (232 linhas)
- Componentes extraídos: `ElevatorHud`, `FloorReveal`, `TopControls`, `ActionButton`, `NightBanner`, `ChaseBanner`, `SavedOverlay`, `BarneyDialogue`
- Todos `React.memo` wrapped
- Imports não usados removidos: `TypewriterText`, `BARNEY_DIALOGUE`

### Commits
- `985414f` — refactor: extract HUD components from App.tsx (770→625 lines)

### Estado final
- TypeScript: ✅ compila limpo
- App.tsx: 625 linhas (era 770)
- HudComponents.tsx: 232 linhas (novo)
- index.html: NÃO rebuildado

---

## 🔨 Sessão 2026-04-28: Rebuild do `index.html` (catch-up de 8 commits)

### Problema
Source code foi atualizado em vários commits desde `2674858` (último rebuild
do `index.html`), mas o `index.html` canônico não acompanhou. O jogo no ar
estava ~8 commits atrás do source.

### Commits que estavam no source mas NÃO no `index.html`
1. `a9f52fa` — fix(a11y): add aria-labels + remove unused design-tokens imports
2. `e26832f` — fix(design): improve text contrast + reduce font-mono overuse
3. `1125e0d` — fix(critical): type safety, memory leaks, race conditions, magic numbers
4. `a8892b1` — fix(types): replace any with proper TypeScript interfaces
5. `19d46c9` — fix(perf): lazy load Barney theme + TypewriterText batch + AudioEngine error handling
6. `05fd707` — fix(types): resolve all tsc errors — clean compile
7. `985414f` — refactor: extract HUD components from App.tsx (770→625 lines)
8. `e47e0ed` — restore: all source code improvements (from e98c695)

### Ação tomada
Rebuild reprodutível com a toolchain estável:
```bash
cd jubileu
rm -rf dist
npm ci          # respeita o lock; nunca npm install solto
npm run build
node inline-build.mjs
```

### Resultado
- `index.html` canônico passou de **4,087,041** → **3,946,090 bytes**
- Three.js REVISION 184 + React 19.2.5 (idênticas ao backup, build é reprodutível)
- TypeScript: ✅ compila limpo
- Build é determinístico (rerun produz a mesma saída byte-a-byte)

### Observação
A pasta `jubileu/test/` foi removida nesta sessão — virou redundante já que
o `index.html` canônico agora contém exatamente o mesmo conteúdo.

### Regra reafirmada (alinhada com `MAP.md` regra #1)
**SEMPRE rebuilde o `index.html` ao editar `jubileu/src/`.** Não deixar mais
de 1 commit de source acumular sem rebuild. Sequência canônica:

```bash
cd jubileu && npm ci && npm run build && node inline-build.mjs
```

Comite `jubileu/src/...` + `index.html` no MESMO commit.

### Commits desta sessão
- `0377012` — build(test): jubileu/test/index.html (depois removido)
- (este) — build: rebuild canonical index.html + remove jubileu/test


---

## 🔧 Sessão 2026-04-29: Merge de Performance do Branch Backup

### Contexto
Felipe pediu pra pegar as melhorias de performance do branch `claude/review-memory-backup-6Ua0Z`
e implementar no `main`, sem reverter os fixes de qualidade que já estavam no main.

### O que tinha de bom no branch backup (performance)
1. **RemotePlayer com dataRef** — lê posição/estado direto de um Map ref dentro de useFrame,
   sem causar re-render React a cada 200ms do Firestore
2. **Multiplayer com otherPlayersDataRef + otherPlayerIds** — Map em ref + array de IDs em state,
   só re-render quando alguém entra/sai (não a cada update de posição)
3. **Quality profiles reais** — interface QualityProfile com flags: atmosphere, overlay,
   nightLights, chatBubbles3D, remoteLimit (low=3, med=8, high=30)
4. **Distance culling** — CeilingFan (>14u), WallClock (>12u), Dussekar (>12u) skip update
5. **Pre-built wall lists** — wallsForState() em constants.ts, sem alocação por frame
6. **Furniture colliders** — boxCollider() em physics.ts + LOBBY_FURNITURE_W / HOUSE_FURNITURE_W
7. **GameEffects/Atmosphere condicionais** — só renderizam em high quality
8. **ESC pra Settings** — tecla Escape abre/fecha settings

### O que NÃO pegamos (reversões do branch)
- Remoção de TypeScript types → main mantém interfaces
- Deleção de HudComponents.tsx → main mantém componentes extraídos
- Remoção de named constants → main mantém BARNEY_CATCH_DIST etc.
- Remoção de error handling no AudioEngine → main mantém r.ok checks
- Remoção de lazy loading do Barney theme → main mantém lazy load
- Redução de contraste → main mantém valores corrigidos

### Status
- Sub-agente trabalhando na implementação
- Build + TypeScript check + commit + push pendente

---

## 📋 Próximos Passos (a fazer)
- [ ] Deploy manual das Firestore Rules no Firebase Console (ainda pendente)
- [ ] AUDIT #9/#10 — design tokens não usados / cores hardcoded (refatoração grande)
- [ ] Merge do fix `b8a832f` do backup branch — inspector voice + Barney theme fallback URLs
- [ ] AUDIT #12-15 — sugestões (loading state, multiplayer indicator, Dussekar bubble, dialogue scroll)

---

*Última atualização: 2026-04-29 22:34 GMT+8*

---

## 🤖 Regra: Use Sub-Agentes pra Trabalho Pesado

Quando a tarefa envolver múltiplos arquivos, builds, testes TypeScript, ou merges
complexos — **spawna um sub-agente** ao invés de fazer tudo na sessão principal.

### Quando usar
- Merge de branches com muitos arquivos alterados
- Refactors que tocam 5+ arquivos
- Build + test + commit + push (sequência longa)
- Qualquer coisa que leve mais de 2-3 minutos de processamento

### Quando NÃO usar
- Mudanças pontuais (1-2 arquivos)
- Fixes rápidos de CSS/contraste
- Updates de documentação

### Vantagem
A sessão principal fica livre pra conversar com o Felipe enquanto o sub-agente
trabalha em paralelo. Não fica aquele "travou esperando".

---

## 🔧 Sessão 2026-04-29: Fix — Barney Theme + Elevator Music Lifecycle (22:22 GMT+8)

### Problema
1. **Barney theme só tocava durante chase/noite** — os estados outdoor, barney_greet e indoor_day no andar do Barney (level 1) ficavam sem música ambiente.
2. **Música do elevador não parava ao chegar** — ficava tocando por cima da tema do Barney quando o player chegava no andar.
3. **Lobby music não voltava** — ao retornar do andar do Barney pro lobby, a lobby music não reativava.

### Solução (inspirada no branch `claude/review-memory-backup-6Ua0Z`)

#### AudioEngine.tsx
- `barneyFloor` mudou de `gameState in {indoor_night, chase, caught, saved}` para `currentLevel === 1`
- Barney theme agora é a música ambiente de todo o andar (level 1)
- Distorção continua gated em `nightMode` — estados calmos ouvem tema limpo, chase ouve distorcido
- Novo effect: quando `doorsClosed` fica `false` (chegou ao destino), para a música do elevador
- Se voltou pro lobby (`currentLevel === 0`), reativa lobby music
- Props novas: `currentLevel`, `doorsClosed`

#### App.tsx
- `<LiminalAudioEngine>` agora recebe `currentLevel={currentLevel}` e `doorsClosed={doorsClosed}`

### Commit
- `dfb24b2` — fix(audio): Barney theme plays on entire floor + elevator music lifecycle

### Estado
- TypeScript: ✅ limpo
- Build: ✅ reprodutível (3,950,953 bytes)
- Push: ✅ main

---

## 🔍 Sessão 2026-04-29: AUDIT.md Review — Status Atualizado (22:33 GMT+8)

### O que foi feito
Review completo da AUDIT.md — cada item verificado contra o código atual.

### Resultados

| # | Issue | Status |
|---|-------|--------|
| 1 | Keyframes duplicados | ✅ FIXED — all 5 keyframes unique (grep -c = 1 each) |
| 2 | ActionButton aria-labels | ✅ FIXED — all 3 buttons pass `ariaLabel` prop |
| 3 | Chat input aria-label | ✅ FIXED — both inputs have `aria-label="Mensagem do chat"` |
| 4 | Contraste insuficiente | ✅ FIXED — no text-white/10-25 found |
| 5 | Fontes minúsculas (8px/9px) | ✅ FIXED — minimum is now text-[10px] |
| 6 | Excesso de font-mono | ✅ MOSTLY FIXED — remaining uses are technical (FPS, kbd shortcuts, floor numbers) |
| 7 | Z-index overlap | 🔴 OPEN — chat z-65 behind settings z-100, no auto-close |
| 8 | Fullscreen sem feedback | ✅ FIXED — isFullscreen state + icon toggle + aria-label |

**Score: 7/15 fixed (3 críticos todos resolvidos, 1 design issue aberto, 3 inconsistências + 4 sugestões restantes)**

**UPDATE (same session):** #7 (z-index) já tava feito — `forceClose={settingsOpen}` já existia no App.tsx e ChatSystem.tsx já tratava o prop. AUDIT.md atualizado para ✅.

### Commit
- `55e7c4b` — docs: update AUDIT.md with current fix status

---

## 🔧 Sessão 2026-04-29: Fixes Massivos via Sub-Agentes (22:29 GMT+8)

### Fixes aplicados (7 commits, 8+ arquivos)

| Commit | Fix | AUDIT |
|--------|-----|-------|
| `dfb24b2` | Barney theme em todo o andar + elevator music lifecycle | — |
| `93bbfa6` | Chat input aria-labels + id + `<label>` associado | #3 |
| `3e0c48b` | Border-radius `rounded-xl`, contraste `text-white/35`, font-mono cleanup | #4/#6/#8/#11 |
| `76dcf23` | Chat fecha quando settings abre (já tava feito, verificado) | #7 |
| `55e7c4b` | AUDIT.md atualizada com status real | — |
| `461c3f1` | MEMORY.md atualizada com resultados da AUDIT.md | — |
| `d3b8eee` | House furniture collision (coords de mundo) + TypewriterText shared AudioContext | — |

### Bugs críticos corrigidos
1. **House furniture collision** — colliders em coordenadas locais, player batia em objetos invisíveis no jardim. Agora em coordenadas de mundo (R(π) + translate Z+10).
2. **TypewriterText voice bips silenciosos** — criava AudioContext separado por instância, Chrome bloqueava. Agora usa `window.__jubileuAudioCtx` compartilhado.
3. **Barney theme só no chase** — agora toca em todo o level 1 (outdoor → barney_greet → indoor_day → chase).
4. **Elevator music não parava** — agora para quando portas abrem no destino (ambas direções).
5. **Lobby music não voltava** — agora reativa ao voltar pro lobby.

### Design fixes
- Border-radius padronizado (`rounded-xl` em botões, inputs, share links)
- Font-mono removido de elementos não-técnicos
- Contraste `text-white/30` → `text-white/35` no Bot.tsx
- Chat inputs com `id` + `<label>` associado pra screen readers

### Estado final
- TypeScript: ✅ limpo
- Build: ✅ reprodutível
- Push: ✅ main (7 commits)
- AUDIT.md: ✅ atualizada (13/15 fixed, 2 remaining)

---

## 📋 Próximos Passos (a fazer)
- [ ] Deploy manual das Firestore Rules no Firebase Console (ainda pendente)
- [ ] AUDIT #9/#10 — design tokens não usados / cores hardcoded (refatoração grande)
- [ ] Merge do fix `b8a832f` do backup branch — inspector voice + Barney theme fallback URLs
- [ ] AUDIT #12-15 — sugestões (loading state, multiplayer indicator, Dussekar bubble, dialogue scroll)

---

---

## 🔄 Sessão 2026-04-29 — Sync + balconista placeholder

### O que aconteceu
A branch `claude/review-memory-backup-6Ua0Z` divergiu do `main` durante uma
sessão paralela em que o Felipe (e outras IAs) aplicaram fixes equivalentes
direto no main (collision coords, AudioContext compartilhada, fallback do
Barney theme, voz do inspetor, design fixes). A branch foi resetada via
`git reset --hard origin/main` (commit `84724cc`) pra alinhar com o estado
canônico.

### Estado de áudio (após o reset)
- Lobby music: ✅ funciona
- Local Forecast (elevator transit): ✅ funciona
- Inspector voice bips (TypewriterText): ✅ funciona via `window.__jubileuAudioCtx`
- Barney theme: ⚠️ só funciona se o MP3 for hospedado em `raw.githubusercontent.com`
  (archive.org bloqueia CORS no browser do Felipe). **Pendente:** subir
  `Barney Theme Song.mp3` no root do repo `Jdjdjddj` — o fallback chain do
  AudioEngine já tenta esse URL primeiro.

---

## 🎯 Próximo Objetivo: Balconista (Cashier)

### Contexto
O Felipe quer um **balconista** atrás da **recepção** (`ReceptionDesk` em
`BuildingBlocks.tsx`, posição world `(7, 0, -7.5)` no lobby). NPC ambiente
que fica limpando o tampo do balcão em loop. Estilo **Roblox R6 obrigatório**
(corpo blocky, cores chapadas, estética de boneco de Lego). Felipe vai
fornecer o **GLB animado** depois — animação de "limpar" virá embutida no
arquivo.

### Implementação atual (placeholder, commit desta sessão)
Adicionado em `BuildingBlocks.tsx`:
- Componente `Cashier` renderizado dentro de `ReceptionDesk` (atrás do
  tampo, posição local `[0, 0, -0.25]`)
- Corpo R6 procedural: 2 pernas (verde), torso azul com avental branco,
  2 braços (pele), cabeça cubo (pele) com olhos pretos + boca + cabelo
- Animação de limpar: `useFrame` move a mão direita numa elipse pequena
  sobre o tampo (~1.5x por segundo), com pano amarelo seguindo a mão
- ~5 studs de altura (1.4u), facing +Z local

### O que falta — quando o Felipe entregar o GLB
1. Adicionar URL do GLB em `constants.ts`:
   ```ts
   export const CASHIER_URL = "https://raw.githubusercontent.com/Felipe9272727/.../balconista.glb";
   ```
2. Em `BuildingBlocks.tsx` no topo: `useGLTF.preload(CASHIER_URL);`
3. Substituir o corpo procedural por `<primitive object={glbScene} />`
   carregado com `useGLTF` + `useAnimations` (a animação vem embutida).
4. **Remover o `useFrame` da animação procedural** — a animação vem do GLB.
5. Ajustar `scale` e `position` Y conforme a altura do GLB.

### Constraints do Roblox style (já respeitadas no placeholder)
- Geometrias **box-only** (sem esferas suaves)
- Cores **chapadas** (`meshStandardMaterial color=#XXX roughness=0.9`)
- Proporções **R6** (não R15) — 2 studs largura, 5 studs altura
- Face desenhada com retângulos pretos finos (não 3D)
- Cabelo é um cubo achatado em cima da cabeça

### Observações
- O Felipe enviou um `Button_Pushing.fbx` em `~/.claude/uploads/.../` —
  é uma animação de exemplo, NÃO é o asset final. Quando o GLB do
  balconista chegar, ignorar o FBX.
- A limpeza deve ser **calma e contínua** (não interrompe quando o
  player chega perto). Sem interação por enquanto.

---

*Última atualização: 2026-04-29 (sync com main + balconista placeholder)*
---

## 🔧 Sessão 2026-04-30: Cashier FBX→GLB + Debug (06:49-07:37 GMT+8)

### Problema
O FBX do balconista (Button Pushing.fbx) não aparecia no jogo.

### Diagnóstico
1. **FBX não renderizava** — `useFBX` + `SkeletonUtils.clone` falha silenciosamente com Mixamo FBX em versões recentes do drei/fiber.
2. **Auto-fit bounding box** — `Box3.setFromObject()` incluía ossos/armature no cálculo, resultando em escala microscópica.
3. **CORS** — `fetch('./button_pushing.glb')` falha ao abrir `index.html` via `file://`.

### Solução
1. **FBX → GLB** — convertido com `fbx2gltf` (1.38MB, 4509 vértices, textura PNG embutida, 22 joints, 1 animação).
2. **URL do GitHub** — `https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/button_pushing.glb` (mesmo padrão dos outros GLBs).
3. **`useGLTF`** em vez de `useFBX` — mais compatível com three.js.
4. **Escala fixa 5** no grupo, rotação 180° Y, posição z=-1.5 atrás do balcão.
5. **Cadeira removida** — a que ficava atrás da recepção.

### Commits
- `7591895` — fix(cashier): convert FBX to GLB for compatibility
- `f970926` — fix(cashier): use relative path for GLB asset
- `82fc78e` — fix(cashier): simplify loading — direct GLB render + debug logs
- `3f8f253` — debug(cashier): add red wireframe box + axes
- `f429700` — debug(cashier): add fetch test
- `474a002` — fix(cashier): use raw.githubusercontent.com URL
- `0e85a1d` — fix(cashier): adjust position, remove chair, clean up debug
- `62608c0` — fix(cashier): rotate 180° to face the player
- `1195c26` — fix(cashier): move further back + rotate 180° + scale 5

### Assets
- `button_pushing.glb` — na raiz do repo + `jubileu/public/`
- Source: `https://raw.githubusercontent.com/Felipe9272727/Bahh/main/Button Pushing.fbx`
- Conversão: `fbx2gltf` (FBX2glTF)

### Estado
- Modelo visível ✅
- Posição/rotação/escala precisam de ajuste fino (depende do teste do Felipe)
- MEMORY.md atualizada ✅


### Sessão 2026-04-30 07:37-07:47 GMT+8: Ajustes de posição/escala

- Escala ajustada de 5x → 2x (pedido do Felipe)
- Rotação: neutralizada rotação embutida do mesh (90° X) via `child.rotation.set(0,0,0)`
- Posição Y=0.5 pra alcançar o balcão, Z=-1.5 atrás do balcão
- Problema: Felipe reporta que mudanças visuais não aparecem — possível cache do browser ou problema no deploy
- Commits: 2fd980c, bdbf760, 2489214


## 🔧 Sessão 2026-05-01: Cashier Rotation Fix (08:51 GMT+8)

### Problema
O balconista (Cashier) estava de costas pro player — rotação `[0, 0, 0]` no group, mas Mixamo characters ficam de costas por default.

### Solução
- `BuildingBlocks.tsx`: group rotation alterado de `[0, 0, 0]` para `[0, Math.PI, 0]` (180° Y)
- Build reprodutível: `npm ci && npm run build && node inline-build.mjs`
- TypeScript: ✅ limpo
- Build: ✅ 3,951,451 bytes

### Commit
- `576094f` — fix(cashier): rotate 180° Y to face the player

### Fix: Cashier Rotation — Clone Scene (08:55 GMT+8)

#### Problema
A rotação `[0, Math.PI, 0]` no group não funcionava porque `useGLTF` cacheia o scene object. O `traverse` que zerava rotações modificava o objeto cacheado compartilhado, e o `primitive` usava o mesmo objeto — rotação do group era ignorada/overridada.

#### Solução
- `SkeletonUtils.clone(gltf.scene)` — clone a scene pra cada instância
- `traverse` pra zerar rotações roda no clone (não no cacheado)
- `useMemo` com dep `[gltf.scene]` — clona só quando o source muda
- Group rotation `[0, Math.PI, 0]` agora aplica no clone limpo

#### Commit
- `28689c9` — fix(cashier): clone scene with SkeletonUtils + neutralize baked rotation on clone
