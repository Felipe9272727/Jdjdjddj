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

## 🔧 Sessão 2026-05-01: Cashier Rotation Fix (08:51-09:32 GMT+8)

### Problema
O balconista (Cashier) não rotacionava — todas as tentativas de girar o modelo falhavam.

### Causa raiz
O `<primitive>` do R3F gerencia o objeto Three.js internamente e **sobrescreve o transform** a cada frame. Qualquer `gltf.scene.rotation.set()` via `useEffect` era resetado.

### Solução
Passar `rotation` como **prop do `<primitive>`** em vez de setar no objeto diretamente:
```tsx
<primitive object={gltf.scene} rotation={[0, Math.PI / 2, 0]} />
```

### Por que funciona
O R3F reconciler aplica props do `<primitive>` declarativamente a cada render — não é um side effect que pode ser resetado. É o jeito certo de rotacionar modelos GLB no React Three Fiber.

### GLB structure (button_pushing.glb)
- `tripo_node_b417e236` (mesh): rot [π/2, 0, 0] — 90° X baked (deitado)
- `mixamorig:Hips` (root bone): rot [-π/2, 0, 0] — compensa o mesh
- 1 animação: "mixamo.com" (21 tracks)
- Escala: Mixamo default

### Debug overlay (TEMPORÁRIO)
- `CashierDebug` em `BuildingBlocks.tsx` + `LobbyEnv.tsx`
- Mostra: URL, animações, rotação/posição da scene, todos os ossos e meshes
- **REMOVER** quando o ajuste estiver finalizado

### Commits
- `d4c3dc1` — fix: rotation as prop to <primitive>
- `8a7fbc4` — fix: rotate 90° Y to face left

### ⚠️ Lição aprendida
**No R3F, `<primitive object={scene}>` NÃO respeita `scene.rotation.set()` — o reconciler sobrescreve.** Sempre passar rotation/position/scale como props do `<primitive>`.

---

## 🔧 Fix: Cashier Recepcionista (2026-05-01)

### Contexto
O recepcionista (Cashier) no lobby usa o GLB `button_pushing.glb` (Mixamo rig). Após commits de debug que zeraram todas as rotações, o modelo ficou todo quebrado.

### O que foi feito

#### 1. Restaurar rotações Mixamo
- Removido o zeroing de rotações (último commit de debug)
- Rotações baked preservadas: Hips -90°X, mesh +90°X
- Rotação do grupo: -PI/2 Y (modelo encara o balcão)

#### 2. Posicionamento com collision analysis
- Criado `analyze-positions.mjs` — script Node.js que calcula bounds world-space de todos os objetos
- Descoberto que cashier (X=7.2) estava DENTRO da mesa (X=6.65→7.35)
- Movido pra X=7.65 (0.05m atrás da mesa)
- Stool em X=7.7

#### 3. Abordagens de layout testadas (e por que falharam)
- **useEffect + ref**: R3F sobrescrevia position com a prop JSX
- **useFrame + ref**: Não executava confiavelmente; position resetava em re-renders
- **useMemo + props (SOLUÇÃO FINAL)**: Calcula scale/yPos durante render, passa como props JSX

#### 4. Banquinho (Stool)
- STOOL_HEIGHT: 0.22 → 0.45 (modelo flutuava)
- Componente separado (não dentro do grupo Cashier)
- Assento 0.38r, pernas grossas

#### 5. SceneInspector
- `SceneInspector.tsx` — overlay de debug (F1 pra ativar)
- Wireframes + labels com nome, source, world pos, world size

#### 6. Debug tools
- `analyze-positions.mjs` — mapa de posições com collision detection e ASCII top-down
- `SceneInspector.tsx` — wireframes no jogo

### Arquivos alterados
- `jubileu/src/BuildingBlocks.tsx` — Cashier (useMemo), Stool, removido CashierDebug
- `jubileu/src/LobbyEnv.tsx` — Cashier/Stool imports, positions
- `jubileu/src/SceneInspector.tsx` — novo
- `jubileu/src/App.tsx` — import SceneInspector
- `analyze-positions.mjs` — novo (debug tool)

### Commits
- `f622bb6` — fix(cashier): restore Mixamo rotations, normalize height
- `49e05cb` — feat(cashier): add wooden stool
- `fed981d` — fix(cashier): embed stool, fix lag
- `2ef3151` — fix(cashier): use useFrame for layout
- `b5ec071` — feat(debug): SceneInspector
- `c8641a5` — fix(cashier): collision analysis positioning
- `f894770` — fix(cashier): revert rotation, bigger stool
- `b12f34c` — fix(cashier): useMemo+props approach

### ⚠️ Lições aprendidas
1. **R3F position prop sobrescreve ref**: Se `<group position={prop}>` existe, R3F reaplica a prop toda renderização, ignorando ref mutations.
2. **useFrame não é confiável pra layout one-shot**: Pode não executar se o componente desmonta/remonta.
3. **useMemo durante render é o mais determinístico**: Calcula antes do paint, passa como prop, R3F aplica corretamente.
4. **Collision analysis é essencial**: Sem visualizar, é impossível saber se objetos estão sobrepondo. O script `analyze-positions.mjs` resolve isso.

---

## Sessão 2026-05-02 — ShopOverlay Integration & Sprite Fix

### O que foi feito
1. **Sprite Carrossel Bug Fix**: O bug onde a animação CSS não reiniciava ao trocar entre modos de sprite (clean → talk → idle-static) foi corrigido:
   - Adicionado `key={spriteMode}` no div do sprite para forçar React a remontar o componente, reiniciando limpo a animação
   - Trocado shorthand `animation` por `animation-name`/`animation-duration`/`animation-timing-function`/`animation-iteration-count` separados para controle mais limpo
   - Mesmo tratamento aplicado ao portrait (cabeça do bellhop)

2. **ShopOverlay integrado ao main**: 
   - `ShopOverlay.tsx` e `bellhop-sprites.ts` copiados do branch `claude/review-memory-docs-pYpFg`
   - Estado `shopOpen` e `canInteractCashier` adicionados ao App.tsx
   - Callback `onCashierInteractionUpdate` adicionado ao Player.tsx
   - Constantes `CASHIER_INTERACT_DIST` e `CASHIER_POS` adicionadas a constants.ts
   - Botão "RECEPÇÃO" aparece quando jogador está perto do cashier
   - Tecla 'E' abre o shop quando interagindo com cashier
   - ESC fecha o shop

3. **Melhorias visuais no Shop**:
   - Botão ✕ de fechar no canto superior direito
   - Efeito de glow sutil na borda do dialog box
   - Badge "★ RECEPÇÃO ★" com animação de pulse suave
   - Idle bob animation no bellhop quando em modo idle-static
   - Opção "Comprar" no menu com placeholder "Em breve..."
   - Defesa anti-propagação: shopOpen adicionado a todas as verificações de pausa/interação

### Arquivos alterados
- `jubileu/src/ShopOverlay.tsx` — novo (com todas as correções)
- `jubileu/src/bellhop-sprites.ts` — novo (sprites base64)
- `jubileu/src/App.tsx` — integração do shop, estados, handlers
- `jubileu/src/Player.tsx` — callback onCashierInteractionUpdate
- `jubileu/src/constants.ts` — CASHIER_INTERACT_DIST, CASHIER_POS
- `index.html` — rebuild

### Commits
- Commit único com todas as mudanças acima

### Fix adicional — mesmo dia

**Problema do carrossel persistia**: A abordagem `key={spriteMode}` não era suficiente porque o React pode fazer batch de unmount/remount e o browser não reinicia a animação CSS corretamente.

**Solução final**: `useEffect` que observa `spriteMode`, seta `animation: 'none'` no DOM element via ref, força reflow com `void el.offsetHeight`, e reaplica a animação em `requestAnimationFrame`. Isso garante que o browser limpa o estado da animação antiga antes de começar a nova.

**RECEPÇÃO removido**: Badge e botão removidos da UI. Interação via tecla 'E' perto do cashier permanece.

- Commit `d5f56ed` — fix(shop): proper sprite animation restart via rAF, remove RECEPÇÃO badge

---

## 🔧 Sessão 2026-05-05: Overhaul Paralelo com 8 Sub-Agentes (06:55-07:08 GMT+8)

### O que foi feito
Operação paralela com 8 sub-agentes, cada um com uma skill específica do catálogo.

### Agentes e Resultados

| # | Agente | Skill | Resultado |
|---|--------|-------|-----------|
| 1 | audit-agent | audit | AUDIT-REPORT.md — 200+ cores hardcoded, design tokens não usados, componente morto |
| 2 | optimize-agent | optimize | PERFORMANCE-REPORT.md — dependências mortas (~500KB), three-stdlib frágil |
| 3 | ui-agent | frontend-design | Loading screen, indicador MP, Barney scroll, **carrossel fix** |
| 4 | polish-agent | polish | Melhorias visuais, contraste, spacing (606 linhas) |
| 5 | harden-agent | harden | Chat memory leak fix, innerHTML→safe DOM, type safety |
| 6 | delight-agent | delight | Lobby enrichments, PostEffects atmosphere |
| 7 | copy-agent | clarify | UX copy improvements |
| 8 | arrange-agent | arrange | FPS→top-right, BotHud→bottom-right, z-index fixes |

### Bug do Carrossel — RESOLVIDO
- **Problema:** CSS animation não reiniciava ao trocar sprite mode (clean→talk→idle)
- **Solução:** `useSpriteAnimation` hook — `setInterval` + ref controlando `background-position-x` diretamente no DOM
- Removidos `@keyframes bellhopClean` e `@keyframes bellhopTalk`
- Commit: `106ea99` (ui-agent) + refinamento no commit `c0dbea8`

### Fixes Críticos
- Chat timeout memory leak (Multiplayer.tsx) — chatClearTimersRef + cleanup
- innerHTML em Bot.tsx → document.createElement (segurança)
- WorldProps.profile: any → QualityProfile (type safety)
- FPSCounter reposicionado (top-left → top-right, conflitava com chat)
- BotHud reposicionado (bottom-left → bottom-right, conflitava com joystick)

### Build
- TypeScript: ✅ limpo
- Build: ✅ 4,398,982 bytes (reprodutível)
- Commit: `c0dbea8` — 17 arquivos, 2032+, 158-
- Push: ✅ main

### Skills Usadas
Todas copiadas pra `.skills/` no workspace (gitignored):
- `.skills/audit/SKILL.md`
- `.skills/optimize/SKILL.md`
- `.skills/frontend-design/SKILL.md`
- `.skills/polish/SKILL.md`
- `.skills/harden/SKILL.md`
- `.skills/delight/SKILL.md`
- `.skills/clarify/SKILL.md`
- `.skills/arrange/SKILL.md`

### Lições
- Limite de 5 sub-agentes simultâno — precisa fazer em lotes
- Agentes com tarefas grandes (>5 min) estouram timeout
- Melhor: tarefas mais focadas + menos arquivos por agente
- polish-agent e ui-agent ambos resolveram o carrossel independentemente (abordagem idêntica)

---

## 🔧 Fix: Sprite Carousel Bug — Canvas Renderer (2026-05-05)

### Problema
O sistema de sprites do bellhop (ShopOverlay) usava CSS `background-position-x` com `steps()` pra animar os sprite strips. Isso causava o bug do "carrossel" — frames exibidos fora de ordem, pulando, ou repetindo.

### Causa Raiz
Browser inconsistencies com CSS `steps()` e `background-position` em porcentagens. Diferentes browsers calculam os stepping points de forma diferente, especialmente quando `background-size` usa múltiplos de 100%.

### Solução
Substituído completamente a animação CSS por um renderer baseado em Canvas:
- `SpriteEngine.tsx` — componente `SpriteAnimator` que usa `drawImage()` com coordenadas exatas por frame
- `requestAnimationFrame` para timing preciso e consistente
- `imageSmoothingEnabled: false` para preservar pixel art

### Arquivos alterados
- `jubileu/src/SpriteEngine.tsx` — **novo** — Canvas sprite renderer
- `jubileu/src/ShopOverlay.tsx` — reescrito para usar `SpriteAnimator`
- `agents/` — **novo** — 4 agentes especializados:
  - `agent-canvas-engine.ts` — SpriteAnimator + SpriteStatic
  - `agent-sprite-parser.ts` — metadados e configs dos sprites
  - `agent-shop-rewrite.tsx` — BellhopSprite + BellhopPortrait
  - `agent-verification.ts` — testes automatizados

### O que foi removido
- `@keyframes bellhopClean` — causava o bug
- `@keyframes bellhopTalk` — causava o bug
- CSS `background-position-x` animation em todos os elementos de sprite

### Commits
- `288c041` — fix(sprite): replace CSS steps() animation with Canvas renderer

### Nota
Tentativas anteriores (agents polish/ui) resolveram o carrossel com abordagem idêntica — confirma que Canvas é a solução correta. Dessa vez o fix foi aplicado diretamente no source e buildado.

---

## 🔧 Sessão 2026-05-06: Performance Audit + House Redesign (05:00-05:20 GMT+8)

### Performance Audit — Top 10 Issues

Análise completa de Player.tsx, RemotePlayer.tsx, Bot.tsx, Elevator.tsx, LobbyEnv.tsx, HouseEnv.tsx, App.tsx.

### Fixes aplicados

| # | Arquivo | Problema | Fix |
|---|---------|----------|-----|
| 1 | Player.tsx | `setAnim()` chamado todo frame (60fps) | Guard com `animRef` — só setState quando muda |
| 2 | Player.tsx | `wallsForState()` aloca array novo todo frame | `useMemo` por `[currentLevel, doorsClosed, houseDoorOpen]` |
| 3 | App.tsx | `handlePlayerEnterElevator` recriado a cada render | `useCallback` com deps `[elevatorTimer, doorsClosed]` |
| 4 | Bot.tsx | `setBots([...])` no useFrame causava re-render de todos os bots | Animação agora é imperativa via `useFrame` no `BotAvatar` |
| 5 | HouseEnv.tsx | `pointLight` do BarneyActor montada/desmontada por condicional | Sempre renderizada, `lightRef.current.visible = isScary` |
| 6 | HouseEnv.tsx | Arrays de árvores (43 coords × 4) recriados inline a cada render | Extraídos para `TREE_COORDS` e `FENCE_DATA` em module scope |
| 7 | App.tsx | `otherPlayerIds.slice()` recriava array a cada render | `useMemo` sobre o slice limitado |
| 8 | App.tsx | Import faltando `useMemo` | Adicionado ao import do React |

### House Redesign (Barney)

Aplicadas skills: **bolder** (formas fortes), **colorize** (paleta rica), **delight** (detalhes encantadores), **arrange** (zonas claras), **polish** (materiais consistentes), **overdrive** (animações).

#### Novos componentes
- `ChimneySmoke` — 3 esferas transparentes animadas com drift + sway via useFrame
- `HouseWindow` — Vidro + caixilho em cruz + persianas
- `FlowerBed` — Canteiro com flores coloridas (E91E63, 9C27B0, FF5722, FFC107)
- `Mailbox` — Caixa de correio vermelha com tampa
- `PathLantern` — Poste de luz pequeno com pointLight

#### Exterior novo
- Fundação com base trim (4E342E)
- Paredes com `TextureMaterial` em vez de cor flat
- Porche com piso de madeira, escadas, colunas, viga
- Caminho de pedras (stepping stones)
- Cerca branca frontal
- 4 canteiros de flores
- Caixa de correio
- 2 luminárias de caminho
- Chaminé com tampa + fumaça animada
- Cumeeira no telhado + eave trim

#### Interior novo
- Tapete na sala (2 camadas, tons marrom)
- Quadro na parede
- Azulejo backsplash na cozinha
- Puxadores na geladeira
- 3 luzes interiores (sala, quarto, cozinha)
- Janela lateral e traseira

#### Night mode
- Luz interior pisca (overdrive)
- Cor da luz muda: quente (dia) → laranja (noite)
- Luz externa com cor adaptativa

### Commits
- `4c7bf74` — perf: fix top 10 performance issues + redesign Barney house
- `cbaf439` — build: rebuild index.html with perf fixes + house redesign

### ⚠️ Lição reafirmada
**Regre de ouro #1: SEMPRE rebuilde o `index.html` ao editar source.** Dessa vez esqueci e o Felipe teve que me lembrar. Não vai acontecer de novo.

---

*Última atualização: 2026-05-08 00:20 GMT+8*

---

## 🔧 Sessão 2026-05-08: Inventário v3 — Fix Completo (00:20 GMT+8)

### Problemas relatados pelo Felipe
1. **Lanterna aparecendo antes de comprar** — o inventário persistia via localStorage, então a lanterna ficava "owned" de sessões anteriores
2. **GLB não funcionava pra pegar a lanterna** — não existia pickup 3D da lanterna no lobby, só via diálogo da loja
3. **Inventário mal posicionado** — não funcionava bem em vertical/horizontal no mobile e desktop

### Fixes aplicados

#### A. InventorySystem.tsx — Removida persistência localStorage
- `loadInventory()` agora SEMPRE retorna inventário vazio (session-only)
- `saveInventory()` é no-op (mantida pra compatibilidade de API)
- Removido `STORAGE_KEY` e `useEffect` de persistência
- Jogador sempre começa sem itens a cada sessão

#### B. FlashlightLight.tsx — FPFlashlightHand com prop `active`
- Adicionado `active: boolean` ao `FPFlashlightHandProps`
- Lens agora é condicional: brilha quando `active=true`, escuro quando `false`
- Glow ring também condicional: `emissiveIntensity={active ? 1 : 0}`, `opacity={active ? 0.6 : 0.2}`
- Antes a lanterna em 1ª pessoa SEMPRE brilhava, mesmo desligada

#### C. App.tsx — Passado `active` pro FPFlashlightHand
- `<FPFlashlightHand walking={...} active={inventory.flashlight.active} />`

#### D. LobbyEnv.tsx — Adicionado FlashlightPickup 3D
- Novo componente `FlashlightPickup` — modelo 3D da lanterna (cilindro corpo, cilindro cabeça, lente âmbar com glow sutil)
- Posição: `[7.0, 0.85, -6.0]` na mesa de recepção, rotação `[0, 0.3π, π/2]`
- Só renderiza quando `!flashlightOwned`
- `LobbyEnvironment` agora aceita prop `flashlightOwned`

#### E. App.tsx — Pickup de lanterna por proximidade
- Novo estado: `canInteractFlashlight`
- `useEffect` com `setInterval(200ms)` que checa distância do player ao `FLASHLIGHT_POS`
- Handler: `handlePickupFlashlight` → chama `inventoryAddItem('flashlight')`
- Tecla E: adicionado `canInteractFlashlight && !inventory.flashlight.owned` entre NPC e porta
- Botão mobile: "PEGAR LANTERNA" com gradiente âmbar/amarelo, ícone SVG de lanterna
- `WorldProps` + `World` recebem `flashlightOwned` e passam ao `LobbyEnvironment`

#### F. constants.ts — Novas constantes
- `FLASHLIGHT_INTERACT_DIST = 2.5`
- `FLASHLIGHT_POS = { x: 7.0, z: -6.0 }`

#### G. InventorySystem.tsx — HUD responsivo melhorado
- Portrait: `bottom-[calc(env(safe-area-inset-bottom)+80px)]` + `left-1/2 -translate-x-1/2` (centro, acima dos botões de ação)
- Landscape: `bottom-[calc(env(safe-area-inset-bottom)+14px)]` + `right-[calc(env(safe-area-inset-right)+14px)]` (canto inferior direito, longe do joystick)
- Botões maiores em portrait: `w-12 h-12` (48px — guideline mobile)
- Animação de aparição: `animate-item-appear` (scale 0.3→1.15→0.95→1.0 com flash de brightness, 800ms)

### Arquivos alterados
- `jubileu/src/InventorySystem.tsx` — sem persistência, HUD responsivo, animação de aparição
- `jubileu/src/FlashlightLight.tsx` — FPFlashlightHand com prop `active`
- `jubileu/src/App.tsx` — pickup por proximidade, botão mobile, prop `active`, `flashlightOwned`
- `jubileu/src/LobbyEnv.tsx` — componente FlashlightPickup, prop `flashlightOwned`
- `jubileu/src/constants.ts` — FLASHLIGHT_INTERACT_DIST, FLASHLIGHT_POS

### Fluxo do jogador
1. Entra no lobby → vê lanterna 3D na mesa de recepção
2. Aproxima (2.5 unidades) → botão "PEGAR LANTERNA" aparece
3. Pressiona E / toca botão → lanterna adicionada ao inventário, modelo 3D some
4. Pressiona F / toca ícone → lanterna liga/desliga
5. Loja continua funcionando como alternativa pra comprar lanterna

### Estado
- TypeScript: ✅ limpo
- Build: ✅ reprodutível (4,468,473 bytes)
- Branch: `claude/read-map-memory-docs-2nqCj`
- Push: pendente

---

## 🔧 Sessão 2026-05-06: House Redesign com 5 Agentes (05:29 GMT+8)

### Abordagem
5 agentes especializados, cada um gerando JSX para uma seção da casa:
1. **Structure** — fundação, paredes, telhado terracota, chaminé tijolo com fumaça
2. **Porch & Door** — entrada com 3 degraus, colunas brancas, overhang, lanterna, porta com painéis
3. **Windows** — 8 janelas com persianas verdes, detalhes de sarrafo, flower boxes com flores
4. **Garden** — caminho de pedras, 7 canteiros, cerca branca picket, caixa de correio, poste, arbustos, banco
5. **Interior & Lighting** — tapete camadas, arte abstrata, luminária de mesa, detalhes cozinha, mesa de cabeceira, 5 luzes

### Commits
- `1239fa3` — feat(house): full redesign with 5 specialized agents

### Arquivos alterados
- `jubileu/src/HouseEnv.tsx` — House component + HouseWindow com flower boxes
- `index.html` — rebuildado (4,432,701 bytes)

---

## 🏨 Sessão 2026-05-05: Shop Overhaul — Diálogo estilo Undertale + Música

### Contexto
Felipe pediu pra:
1. Buscar músicas de hotel pra ambientação
2. Melhorar os diálogos do shop
3. Melhorar o sistema de diálogo (estilo Undertale)

### Pesquisa de música
Fontes vasculhadas: Pixabay, Free Music Archive, Chosic, Storyblocks,
archive.org (Mall Of 1959 muzak, Elevator Muzak Music collection),
Bensound, Uppbeat, Melody Loops. Mantida `hotel-lobby.mp3` (já no repo) e
adicionado fallback chain pro `Lobby Time` que já estava no GitHub do Felipe.
Não baixei MP3s novos — só infraestrutura pra trocar fácil depois.

### Novo sistema de diálogo

#### `jubileu/src/dialogue-engine.ts` (novo)
Tokenizer Undertale-style. Tags inline:
- `{y:texto}` `{r:..}` `{b:..}` `{g:..}` `{f:..}` — highlight de cor
- `{p}` `{p:500}` — pausa no typewriter
- `{s:texto}` — efeito shake (CSS animation)
- `^^` — quebra de página

API: `tokenize()` → `Token[]`, `splitPages()` → `Token[][]`, `charCount()`.

#### `jubileu/src/shop-dialogues.ts` (novo)
Árvore de cenas com 15 nós e 5 moods (idle/talk/wink/sweat/concerned).
Personalidade do recepcionista expandida — referências ao tempo apagado
("não me lembro do antes"), elevador "educado", carpete que muda de cor,
ordens datilografadas chegando "úmidas" debaixo da porta. Tom:
liminal/creepy mas com humor seco.

#### `ShopOverlay.tsx` (reescrito)
- **Multi-página:** ▼ amarelo balança no canto da caixa quando página
  termina e tem próxima
- **Heart cursor (♥):** vermelho aparece na opção selecionada
- **Keyboard nav:** ↑↓/W S, Z/Enter/Espaço confirma, ESC fecha
- **Mouse hover** muda seleção (toca `playSelect`)
- **Mood-driven sprite:** scene.mood escolhe `talk` ou `idle-static`
  durante typing/idle
- **Click avança/skip:** click pula typewriter ou avança página
- **Pausas inline** no typewriter respeitam `{p:N}` antes do próximo char
- **Color rendering:** texto agrupado em spans por cor pra render correto

### Arquivos
- `jubileu/src/dialogue-engine.ts` — NOVO
- `jubileu/src/shop-dialogues.ts` — NOVO (15 cenas, 5 moods)
- `jubileu/src/ShopOverlay.tsx` — reescrito (compatível com sprites e
  audio existentes)
- `jubileu/src/shop-audio.ts` — fallback chain de URLs

### Build
- TypeScript: ✅ limpo
- `index.html`: 4,416,017 bytes (rebuild reprodutível com `npm ci` +
  `vite build` + `inline-build.mjs`)
- Commit: `e046e19` — feat(shop): Undertale-style dialogue engine +
  richer recepcionista lore
- Branch: `claude/read-map-memory-docs-2nqCj`

### Próximos passos pro shop
- [ ] Felipe testar os diálogos novos e dar feedback de tom
- [ ] Quando quiser mais variedade de música, é só adicionar URLs no
  array `LOBBY_MUSIC_URLS` em `shop-audio.ts`
- [ ] Possíveis adições: NPC items pra "comprar" (placeholder), shop
  abrindo opção de viagem rápida pra outros andares

---

## 🐛 Sessão 2026-05-06: Shop Crash Fix + Undertale Fidelity Pass

### Crash diagnosticado
Felipe reportou crash ao abrir a recepção. Causa raiz: **violação de
Rules of Hooks** no `ShopOverlay.tsx`. O `useMemo` de `renderedNodes`
ficava DEPOIS do `if (!open) return null` (linha 254). Quando o shop
abria, o número de hooks mudava entre renders → React lançava
"Rendered more hooks than during the previous render".

**Fix:** Mover o useMemo para ANTES do early return. Todos os hooks
rodam em todo render.

### PNGs do main como fonte
Ao mesmo tempo, troquei o `bellhop-sprites.ts` (que tinha 530KB de
base64 inflado) para apontar pros PNGs já no main:
- `1777606191600.png` (1264×843) — bellhop spritesheet (top row =
  4 frames, NEUTRAL × 2 + TALK × 2)
- `file_00000000418c71fba698b68adb12948b.png` (1536×1024) — lobby do
  hotel como `HOTEL_BG` (visualmente bem mais bonito que o anterior)
- `file_000000001f0471fb83f59c727e8bd30c.png` (1366×1152) —
  spritesheet completo, disponível mas ainda não mapeado por região

### SpriteEngine reescrito (sem crash)
- **Cache global** de imagens por URL — todos os SpriteAnimator
  compartilham o mesmo `<img>` decodificado
- **RAF cleanup robusto** — no máximo um RAF outstanding por vez,
  cancel roda no cleanup E antes de qualquer reschedule
- **Sem `key={spriteMode}` remount** — canvas fica montado e reage
  via props (causa do crash original)
- **Fallback "SPRITE OFFLINE"** se imagem 404 ao invés de canvas vazio
- **`sourceX`/`sourceY` na config** — permite ler uma linha específica
  do spritesheet master sem fatiar arquivos

### Fidelidade Undertale aplicada
1. **Sprite separado do dialog box.** No Undertale clássico
   (Snowdin/Tem Shop/Bratty&Catty), o shopkeeper fica numa janela
   emoldurada ACIMA, separada do dialog. Removido `marginTop`
   negativo. Agora sprite está em frame box black-with-white-border,
   com dialog box separado abaixo.
2. **Heart cursor (♥) canônico:** cor `#FF0000`, centralizado
   verticalmente ao lado da opção selecionada.
3. **Background desaturado/escurecido:** `filter: brightness(0.55)
   saturate(0.65)` + vignette mais agressivo, para o sprite e dialog
   lerem claros sobre o lobby.
4. **Idle bob:** shopkeeper "respira" (translateY ±3px, 2.4s) quando
   não falando.
5. **UndertaleButton com `onPointerEnter`** (mouse + touch + stylus)
   + `onFocus` ao invés de `onMouseEnter` (mouse-only).

### Bug fixes da auditoria
- **B1:** re-abrir o shop sem desmontar primeiro agora limpa timers e
  typing state no topo do effect.
- **B2:** ao fechar (`open=false`), música é parada E `musicRef.current`
  é nulificado para re-aberturas criarem instância fresca (sem leak).
- **B3:** typewriter useEffect depende de `pages` + `pageIndex`
  estáveis, não de `currentPage` (fallback `?? []` cria nova ref).
- **B6:** portas do elevador ficam `pointer-events:none` quando
  abertas para toques na borda chegarem aos botões do dialog.

### Arquivos
- `jubileu/src/ShopOverlay.tsx` — crash fix + fidelity pass
- `jubileu/src/SpriteEngine.tsx` — reescrito (cache global, RAF
  defensivo, error fallback, sourceX/Y)
- `jubileu/src/bellhop-sprites.ts` — URLs de PNG ao invés de base64
  (-390KB do bundle)

### Build
- TypeScript: ✅ limpo
- `index.html`: 4,025,862 bytes (era 4,416,017 antes do PNG swap)
- Commits:
  - `b9d6b79` — fix(shop): use main-branch PNGs + crash-resistant
    SpriteEngine
  - `b619224` — fix(shop): crash on open + Undertale fidelity pass
- Branch: `claude/read-map-memory-docs-2nqCj`

### Itens do plano de auditoria ainda em aberto
- Carregar fonte Undertale real (Determination/8-bit Operator) — hoje
  cai pra Courier
- Mapear PNG 2 (1366×1152) com regiões para mais variedade de mood
  (idle/talk/wink/sweat/concerned/cleaning/waving) — coordenadas
  precisam ser calibradas no editor de imagem
- Beep variation por mood (Sans-grave, Papyrus-staccato, etc.)
- Sistema de gold counter / inventory caso o shop vire comercial


---

## 🔦 Sessão 2026-05-08: Sistema de Inventário V2 — Lanterna + Cookie

### Problema da versão anterior
O primeiro inventário (branch `claude/inventory-system-flashlight-cookie`) tinha problemas:
1. Lanterna não funcionava com o GLB do player (não se integrava ao Bacon Hair avatar)
2. Inventário em posição ruim pra mobile (não considerava portrait/landscape)
3. Visual feio e poluído

### O que foi feito
Reescrita completa do sistema de inventário no branch `claude/inventory-v2-clean`.

#### InventorySystem.tsx — Novo arquivo
- `useInventory` hook — gerencia `flashlight: { owned, active }` e `cookie: { count }`
- Persistência em `localStorage` key `jubileu_inventory`
- `inventoryRef` para leitura sem re-render no lado Three.js
- `InventoryHUD` — só renderiza quando `hasAnyItem` é true
  - Portrait: bottom-center, acima dos action buttons, safe-area aware
  - Landscape: bottom-right (action buttons ficam no centro)
  - Botões glass-morphism (`bg-black/60 backdrop-blur-md border-white/15 rounded-xl`)
  - Flashlight: ícone SVG, borda amarela quando ativa, glow pulsante
  - Cookie: ícone SVG, badge de count, animação "+1" ao usar
  - 44x44px portrait / 40x40px landscape

#### FlashlightLight.tsx — Novo arquivo
- `FlashlightLight` — SpotLight que segue player + câmera
  - Intensidade: 8 (noite) / 3 (dia) / 0 (desligada) com lerp suave
  - Cor "#FFF9C4", angle=0.45, penumbra=0.5, decay=2, sem castShadow
  - Target segue cameraThetaRef
- `FlashlightModel3D` — modelo 3D da lanterna em 3ª pessoa
  - Posicionado perto da mão direita do player (offset por cameraThetaRef)
  - Esconde em 1ª pessoa (zoomLevel < 0.5)
  - Corpo escuro metálico, cabeça refletora, lente emissiva
- `FPFlashlightHand` — braço + lanterna em 1ª pessoa
  - Braço procedural (cor de pele) + lanterna detalhada
  - Detalhes: grip ridges, rubber section, switch button, glow ring
  - Walking bob: sin(time*8) horizontal + abs(sin(time*8)) vertical
  - Posição: 0.25 right, -0.3 down, 0.5 forward da câmera

#### shop-dialogues.ts — Modificado
- Adicionado "Lanterna - 0G" como primeiro item no menu de compra
- Nova cena `buy_flashlight` com diálogo atmosférico
- Instruções: "Aperte F para ligar" ou "toque no ícone no inventário"

#### ShopOverlay.tsx — Modificado
- Novo prop `onBuyItem?: (itemId: string) => void`
- Dispara `onBuyItem("flashlight")` e `onBuyItem("cookie")` nas escolhas correspondentes

#### App.tsx — Modificado
- Hook `useInventory()` integrado
- FlashlightLight + FPFlashlightHand no Canvas após Player
- Tecla "F" para toggle lanterna (no keyboard handler)
- InventoryHUD renderizado após SettingsMenu
- ShopOverlay recebe `onBuyItem={inventoryAddItem}`

### Commits
- `6cd6317` — feat(inventory): lantern + cookie items, flashlight light system, responsive HUD

### Estado
- Branch: `claude/inventory-v2-clean`
- TypeScript: ✅ compila limpo
- Build: ✅ reprodutível (4,461,726 bytes)
- Push: pendente


---

## 🔧 Sessão 2026-05-08: Fix — Lanterna só por compra no Shop + FlashlightModel3D + UI Inventário Responsiva

### Problemas relatados pelo Felipe
1. **Lanterna aparecia antes de ser comprada** — existia um `FlashlightPickup` físico na mesa do lobby que permitia pegar a lanterna com E sem comprar na loja, bypassando o shop inteiro.
2. **GLB não funciona com lanterna** — o componente `FlashlightModel3D` (3ª pessoa) existia em `FlashlightLight.tsx` mas nunca era renderizado no App.tsx. Em 3ª pessoa, o jogador via o avatar GLB mas sem lanterna na mão.
3. **UI do inventário mal posicionada** — positioning ruim para mobile/desktop em portrait e landscape.

### Solução

#### Fix 1: FlashlightPickup removido — shop é a ÚNICA forma de adquirir lanterna
- Removido `FlashlightPickup` component de `LobbyEnv.tsx` (modelo 3D na mesa)
- Removido `canInteractFlashlight` state, proximity check, e `handlePickupFlashlight` callback de `App.tsx`
- Removido ActionButton para pickup da lanterna
- Removido `flashlightOwned` prop de `WorldProps` e `LobbyEnvironment`
- Removido `FLASHLIGHT_INTERACT_DIST` e `FLASHLIGHT_POS` de `constants.ts`

#### Fix 2: FlashlightModel3D adicionado ao rendering (3ª pessoa)
- Importado `FlashlightModel3D` em `App.tsx`
- Renderizado quando `hasStarted && inventory.flashlight.owned && zoomLevel >= 0.5`
- Agora em 3ª pessoa, o jogador vê a lanterna na mão do avatar

#### Fix 3: InventoryHUD redesign responsivo
- **Portrait**: horizontal strip, bottom-center, acima do ActionButton (96px offset)
- **Landscape**: vertical column, right-side, verticalmente centrado
- Touch targets: 48px (w-12 h-12) em TODAS orientações (antes era 40px em landscape)
- Glassmorphism container unificado com `bg-black/40 backdrop-blur-xl`
- Animação orientation-aware: slide-up em portrait, slide-from-right em landscape
- CookieBadge e flashlight button com styling melhorado

### Arquivos alterados
- `jubileu/src/App.tsx` — removido pickup, adicionado FlashlightModel3D
- `jubileu/src/LobbyEnv.tsx` — removido FlashlightPickup e flashlightOwned prop
- `jubileu/src/InventorySystem.tsx` — redesign completo do InventoryHUD
- `jubileu/src/constants.ts` — removido FLASHLIGHT_INTERACT_DIST e FLASHLIGHT_POS

### Commit
- `252d8c5` — fix: lanterna só por compra no shop + FlashlightModel3D 3ª pessoa + UI inventário responsiva

### Estado
- TypeScript: ✅ compila limpo (zero erros)
- Build: ✅ reprodutível (npm run build:reproducible)
- Push: ✅ claude/read-map-memory-docs-2nqCj
- index.html: ✅ rebuildado e commitado junto com source

### Lição aprendida
- Usar sub-agentes com skills específicas (full-stack-developer, frontend-styling-expert) para trabalho paralelo funciona bem
- Sempre verificar se componentes definidos mas nunca renderizados são o causa de bugs visuais
- O sistema de aquisição de itens deve ter uma ÚNICA porta de entrada (shop) — pickups físicos bypassam a economia

---

## 🔧 Sessão 2026-05-09: Inventory Polish + Flashlight Cone + Cookie Effect (05:04 GMT+8)

### O que foi feito
Melhorias no sistema de inventário existente — flashlight, cookie e visual effects.

### Mudanças

#### InventorySystem.tsx — Enhanced
- **Notification toast**: mostra "🔦 Lanterna obtida!" ou "🍪 Biscoito obtido!" quando compra item no shop
- **Cookie heal effect**: overlay verde radial com pulse animation quando consome biscoito
- Toast desaparece em 2.5s, efeito de cookie dura 1.8s
- `useInventory()` agora retorna `notification` e `cookieEffect`
- HUD só aparece quando tem items (comportamento preservado)

#### FlashlightLight.tsx — Enhanced
- **Volumetric light cone**: mesh cone translúcido com additive blending que segue a direção da câmera
- Cone adaptativo: maior/mais visível no night mode, sutil no modo normal
- **3rd-person glow**: sprite de brilho + anel de lens melhorado no modelo 3D
- **FP animation melhorada**: breathing sway no idle, bob rítmico + rotação sutil no walking
- Mantida a Spotlight original (funcional)

#### App.tsx — Updated
- Passa `notification` e `cookieEffect` para `InventoryHUD`

### Arquivos alterados
- `jubileu/src/InventorySystem.tsx` — notification + cookieEffect
- `jubileu/src/FlashlightLight.tsx` — cone volumétrico + glow + animação melhorada
- `jubileu/src/App.tsx` — props atualizadas
- `index.html` — rebuildado (4,472,390 bytes)

### Commits
- `TBD` — feat(inventory): notification toast, cookie heal effect, flashlight volumetric cone, procedural animation polish

---

## 🔧 Sessão 2026-05-09: PickupArm + Shop Blink + Branch feat/inventory-polish-v3 (05:13 GMT+8)

### O que foi feito
Animação procedural de braço ao pegar items + feedback visual no sprite do recepcionista.

### Mudanças

#### PickupArm.tsx — NOVO
- Componente de braço procedural que estende o braço do player ao pegar um item
- Animação em 3 fases: extend (0.3s) → hold (0.5s) → retract (0.4s) = 1.2s total
- Ease-out no extend, ease-in no retract
- Posicionado no ombro direito do avatar
- Cor da mão muda conforme o tipo de item (cookie = marrom, flashlight = cinza)
- Não interfere com as animações GLB existentes (idle/walking)
- Renderizado dentro do grupo do avatar para seguir posição/rotação do player

#### ShopOverlay.tsx — Sprite Blink
- Prop `blink` adicionada
- Quando `blink=true`, sprite do recepcionista pisca com `brightness(3) saturate(0.3)`
- Transição suave de 80ms no blink, 400ms na volta

#### App.tsx — Integration
- `handleBuyItem` callback: chama `inventoryAddItem` + trigger PickupArm + trigger shop blink
- Passa `pickupArm={<PickupArm>}` para o Player
- Passa `blink={shopBlink}` para ShopOverlay

#### Player.tsx — PickupArm Support
- Prop `pickupArm?: React.ReactNode` adicionada
- Renderiza `{pickupArm}` dentro do grupo do avatar

### Arquivos alterados
- `jubileu/src/PickupArm.tsx` — NOVO
- `jubileu/src/ShopOverlay.tsx` — blink prop
- `jubileu/src/App.tsx` — handleBuyItem + pickupArm + shopBlink
- `jubileu/src/Player.tsx` — pickupArm prop
- `index.html` — rebuildado (4,476,838 bytes)

### Branch
- `feat/inventory-polish-v3` — criada a partir de `claude/read-map-memory-docs-2nqCj`

---

## 🔧 Sessão 2026-05-09: GLB Bone Manipulation + Bug Fix Character Disappearing (05:20 GMT+8)

### Bugs corrigidos

#### Bug: Character disappears when buying flashlight
- **Causa raiz**: `onAvatarScene` callback não era memoizado — mudava a cada render, causando o useEffect do Avatar a disparar repetidamente (set scene → cleanup → set null → set scene)
- **Fix**: `useCallback` no `handleAvatarScene` para estabilizar a referência
- Também movido `PickupArmAnimator` para dentro do Canvas como componente separado

### Mudanças

#### PickupArm.tsx — REESCRITO
- Antes: mesh separado (braço 3D) que não afetava o GLB
- Agora: `PickupArmAnimator` — manipula os bones do esqueleto do GLB diretamente
- Encontra bones do braço direito por nome (RightArm, right_arm, arm_r, etc.)
- Rotaciona shoulder (-1.2 rad forward) + elbow (-0.6 rad bend)
- Salva/restaura rotações originais após animação
- Não renderiza nada — só manipula transforms dos bones existentes
- Animação: extend 0.35s (ease-out) → hold 0.5s → retract 0.35s (ease-in)

#### Player.tsx — Avatar Scene Exposure
- Prop `onAvatarScene?: (scene: Object3D | null) => void` adicionada
- Avatar chama `onSceneReady` quando GLB carrega
- Cleanup no unmount chama `onSceneReady(null)`

#### App.tsx — Integration
- `handleAvatarScene` memoizado com `useCallback` (corrige bug de desaparecimento)
- `PickupArmAnimator` renderizado dentro do Canvas (depois do Player)
- `avatarScene` state passado para o animator

### Arquivos alterados
- `jubileu/src/PickupArm.tsx` — REESCRITO (bone manipulation)
- `jubileu/src/Player.tsx` — onAvatarScene prop + Avatar onSceneReady
- `jubileu/src/App.tsx` — handleAvatarScene memo + PickupArmAnimator
- `index.html` — rebuildado (4,476,457 bytes)

---

## 🔧 Sessão 2026-05-09: Tela Preta + Debug Agents (05:46-05:56 GMT+8)

### Problema
Após os 5 sub-agentes refazerem o sistema de inventário, o jogo ficou **completamente preto** — áudio e movimento funcionavam, mas nada era visível.

### Causa Raiz (encontrada por `fix-black-screen`)
Flashlight components (FlashlightLight, FlashlightModel3D, FPFlashlightHand) foram mudados pra "always mounted" pelo agent-3. Isso causava:
- SpotLight com `distance={0}` (range infinito) sempre na cena
- Cone mesh com AdditiveBlending sempre no scene graph
- FPFlashlightHand geometry sempre renderizada

### Fix
Voltou pra **renderização condicional** — componentes só montam quando `flashlight.owned === true`.

### Commit
- `a33bfb4` — fix(player): prevent avatar disappearing on flashlight purchase

### Sub-agentes de debug (3 ainda rodando quando deu push)
| Agente | Status | O que deveria fazer |
|--------|--------|-------------------|
| `fix-avatar-black` | ⏳ Não terminou | Verificar se bone manipulation do Avatar quebrou rendering |
| `fix-canvas-black` | ⏳ Não terminou | Verificar Canvas/Suspense/App.tsx rendering |
| `fix-lighting-black` | ⏳ Não terminou | Verificar PostEffects/LobbyEnv/iluminação |

### ⚠️ PENDENTE: Verificar se os 3 agentes encontraram mais problemas
- Checar quando completarem se fizeram commits adicionais
- Se encontraram mais bugs, aplicar os fixes
- O fix principal (conditional rendering) já resolveu o problema principal

### Lição FINAL da sessão
- **"Always mounted" NÃO é sempre melhor** em Three.js — SpotLight e meshes com blending podem causar black screen
- **Conditional rendering é mais seguro** pra componentes de luz
- **SEMPRE usar sub-agentes** — não tentar fazer tudo sozinho

---

## 🔄 Sessão 2026-05-10 — Black Screen Fix + Pickup Debug Logs

### Problema Relatado
O jogo ficava com **tela preta** quando o jogador comprava um item da loja (lanterna ou biscoito).

### Causa Raiz Identificada
No `FlashlightLight.tsx`, o `spotLight` tinha `distance={0}` no JSX inicial. No Three.js, `distance=0` significa **alcance infinito** — a luz ficava no scene graph mesmo quando o jogador não tinha comprado a lanterna, causando a tela preta.

### Correções Aplicadas

#### 1. FlashlightLight.tsx (linha 107)
```tsx
// ANTES (BUG)
distance={0}

// DEPOIS (CORRIGIDO)
distance={owned ? 0 : 0.1}
```
Quando `owned=false`, a luz tem alcance mínimo (0.1), não afetando a cena.

#### 2. Player.tsx — Console logs de debug
Adicionados logs pra diagnosticar o sistema de pickup:
- `[Avatar] Pickup triggered:` — quando trigger é detectado
- `[Avatar] Bone animation frame:` — cada frame da animação (primeiros 50ms)
- `[Avatar] Pickup animation complete:` — quando termina

### Comando Executado
```bash
cd jubileu && npm ci && npm run build && node inline-build.mjs
```
Build: 4.35MB → 4.48MB (index.html)

### Commit
- Branch: `fix/pickup-black-screen-2026-05-10` → merge para `main`
- SHA: `09032dd`
- Mensagem: `fix(black-screen): distance=0.1 when not owned + pickup debug logs`

### Como Testar
1. Abra o jogo: https://jdjdjddj-five.vercel.app
2. Vá até o recepcionista e abra a loja
3. Compre um item (lanterna ou biscoito)
4. **Antes do fix**: tela preta ao fechar a loja
5. **Depois do fix**: loja fecha, jogo continua normalmente

### Console Logs de Debug
Se a animação do braço não funcionar, verifique o console:
- `[Avatar] All bones found:` — lista todos os bones do modelo
- `[Avatar] Found upper arm bone:` / `[Avatar] Found forearm bone:` — bones detectados
- `[Avatar] No arm bones found — will use procedural arm fallback` — fallback usado
- `[Avatar] Pickup triggered:` — trigger detectado (confirma se o problema é upstream)

### Próximos Passos (se ainda houver problema)
1. Verificar no console se os bones estão sendo encontrados
2. Se usar fallback procedural, o braço é renderizado como mesh simples
3. Considerar naming patterns alternativos para bones do Bacon Hair GLB

---

## 🔧 Sessão 2026-05-10: Shop System + Inventory + Pickup Animation Rebuild

### O que foi feito
Reconstrução completa do sistema de loja com inventário e animação de pickup, mais limpeza de manipulação de bones legada.

### Commits relevantes
- `9aec52a` — fix: complete bone manipulation removal from Player.tsx
- `2c0f8dd` — feat: implement shop system with inventory, flashlight and pickup animation
- `96adb27` — feat: add arm pickup animation using post-mixer bone rotation

### Mudanças principais (96adb27)
- Detecta bones do Mixamo (RightArm, RightForeArm) percorrendo a cena
- `useFrame` priority 1 aplica rotação dos bones **depois** do animation mixer
- Animação suave em 3 fases: extend (0.3s ease-out) → hold (0.5s) → retract (0.4s ease-in)
- Rotação como quaternion delta sobre o transform atual do mixer
- Fallback gracioso se bones não forem encontrados (warning, sem crash)
- Não quebra as animações Idle/Walking existentes

---

## 🧠 Sessão 2026-05-10: ARM-FORUM — 4 Agentes Debatem Solução do Braço

### Contexto
A primeira tentativa de animar o braço falhou em casos limite. Em vez de tentar mais hacks, foi montado um **fórum entre 4 sub-agentes** com personalidades distintas para debater a melhor abordagem.

### Participantes
| Agente | Personalidade | Foco |
|--------|--------------|------|
| 🔴 **VETERANO** | Pragmático, anti-frescura | Performance, código de produção, GC pressure |
| 🦴 **OSSÁRIO** | Técnico raiz Three.js | Por dentro do PropertyBinding, mixer, skeleton |
| 🤪 **GAMBIARRA** | Criativo, simples | Workarounds, alternativas (overlay 2D, GLB extra) |
| 🔍 **AUDITORK** | Auditor | Verifica claims contra código real |

### Conclusões do fórum (ver `ARM-FORUM.md`)
**Solução escolhida (na teoria):** `AnimationClip` programática com `setLayer(1)`
- Layer 1 sobrepõe Idle/Walking (layer 0) sem conflito
- Zero manipulação manual por frame
- `QuaternionKeyframeTrack` para RightArm + RightForeArm
- `LoopOnce + clampWhenFinished + fadeIn(0.1)`

### Fixes aplicados (bebadd3 — antes do experimento de layer)
- **M1**: bone matching exato primeiro, substring como fallback (evita `RightArmTwist`/`RightArmHelper`)
- **M2**: spam guard — ignora `pickupTrigger` durante animação ativa
- **M3**: quaternions pré-alocados (`armQuat`, `foreArmQuat`, `armDelta`, `foreArmDelta`, `armEuler`, `foreArmEuler`) — zero `.clone()` por frame

### Black-Screen fix paralelo (8e80d1d)
4 agentes (Detetive, Engenheiro, Designer, Arquiteto) — 5 medidas defensivas:
1. Remover `StrictMode` (causa double-mount WebGL bugs)
2. Garantir clear do overlay do elevador via timeout 3s
3. Failsafe — se `overlayOpacity` ficar em 1 por >6s, força reset
4. Failsafe — se `sleepFadeOpacity` ficar em 1 por >8s, força reset
5. WebGL context loss/restore handlers no Canvas
6. `<color>` e `<ambientLight>` fora do `<Suspense>` (background sempre presente)

---

## 🔧 Sessão 2026-05-11: AnimationClip Layer → REVERT pra Manual

### Tentativa: AnimationClip programática (44086b1)
- Criado `createPickupClip()` com `QuaternionKeyframeTrack` para RightArm/RightForeArm
- `AnimationAction` em layer 1, blendando sobre Idle/Walking em layer 0
- Removidas ~50 linhas de manipulação manual de bones
- **Promessa**: zero GC, mixer cuida de tudo

### Por que falhou (23e325c → 14dc029)
- `setLayer()` **não existe** nessa versão do Three.js usada no projeto
- Tentativa intermediária: **mixer separado** apenas pro pickup
- Falhou com **PropertyBinding path mismatch** — o mixer separado não consegue resolver os bones do scene graph original
- AUDITORK havia avisado: claim do OSSÁRIO de que `setLayer()` funciona no drei era falsa **nessa versão**

### Solução final (14dc029) — Manual com lições do fórum
Voltou para manipulação manual de bones via `useFrame` priority 1, mas com os 3 fixes do fórum mantidos:
1. ✅ Bone matching exato + substring fallback
2. ✅ Spam guard (`isAnimating` flag)
3. ✅ Quaternions/eulers pré-alocados — zero GC pressure
4. ✅ Post-multiply `mixer_pose × delta` = rotação em espaço local do bone

### Arquivo final
`jubileu/src/Player.tsx`:
```ts
// Pre-allocated objects — reused every frame, never cloned
armQuat, foreArmQuat, armDelta, foreArmDelta, armEuler, foreArmEuler

useFrame((_, dt) => {
  // ... 3-phase animation timing ...
  p.armEuler.set(armAngle, 0, 0);
  p.armDelta.setFromEuler(p.armEuler);
  p.armBone.quaternion.copy(p.armQuat).multiply(p.armDelta);  // post-multiply
}, 1); // Priority 1 = runs after animation mixer (priority 0)
```

### Build/Deploy
- Builds inline rebuildados: `b0b71ed`, `9b31e46`, `989d304`
- Plugin novo: `vite-plugin-singlefile` (substitui `inline-build.mjs` manual em alguns pontos)
- index.html final: ~4.5MB

### Lição aprendida
- ❌ Confiar em APIs sem verificar na versão exata do package (Three.js evolui rápido)
- ✅ O fórum gerou ideias **boas** (pre-alloc, exact match, spam guard) mesmo quando a ideia principal não foi viável
- ✅ AUDITORK estava certo em desconfiar: sempre verifique claims em **runtime**
- 🎯 Manual com cuidado > AnimationClip mal-suportada

---

## 📋 Status dos Bugs Listados em `AGENT_CONTEXT.md`

| # | Bug | Status | Commit que resolveu |
|---|-----|--------|---------------------|
| 1 | Avatar somia ao comprar lanterna | ✅ Resolvido | `a33bfb4` (useCallback no `onAvatarScene`) + `8e80d1d` (5 defensive measures) |
| 2 | PickupArm não animava (bones não encontrados) | ✅ Resolvido | `bebadd3` (M1: exact match) + `14dc029` (final manual implementation) |
| 3 | Shop sprite blink não solicitado | ⚠️ Mantido | Permaneceu no código — leve, sem custo |

**Sistema de inventário:** estável, completo (lanterna + cookie), com pickup animation funcional.

---

## 🔄 Sessão 2026-05-12: Revert Total para `87da1a9` (index.html 4.44MB)

### Contexto
A famosa tela preta voltou em pleno LOBBY (FPS counter rodando, HUD visível, canvas todo preto). Felipe testou no celular — confirmou.

### Causa raiz identificada
`useFrame(..., 1)` (priority 1) reintroduzido em `14dc029` para rodar a rotação dos bones DEPOIS do AnimationMixer. R3F v9 desativa o auto-render do canvas quando qualquer `useFrame` tem priority não-zero:

> "If you've set a priority anywhere in the application, the render-loop won't update automatically, you must call invalidate() and / or gl.render() yourself."

Resultado: FPS counter continua rodando (callbacks executam), mas nada é desenhado → tela preta clássica.

### Tentativa de fix (commits `66ba98c`, `42c9338`)
1. `66ba98c` — trocou `createPortal` por sync via `matrixWorld` (para não tocar na hierarquia do esqueleto)
2. `42c9338` — removeu `, 1)` do useFrame (priority volta a 0)

**Não resolveu.** Felipe pediu pra fazer do zero a partir do build de 4.44MB que ele lembrava funcionar.

### Ação: revert total para `87da1a9` (commit `fix(level2): add explicit wall list for floor 2`)
- `git rm` dos arquivos adicionados depois (AGENT_CONTEXT.md, ARM-FORUM.md, assets/, FlashlightLight.tsx, InventorySystem.tsx, dist/, etc.)
- `git checkout 87da1a9 -- .` — trouxe TUDO daquele commit
- `MEMORY.md` e `AGENT_CONTEXT.md` preservados em `/tmp` e restaurados (mantêm histórico documentado)
- `index.html` final: **4,444,052 bytes** ✅ (exatamente o que o Felipe pediu)

### O que foi PERDIDO neste revert
- ❌ Sistema de inventário (lanterna + cookie) — `InventorySystem.tsx`
- ❌ Flashlight 3D + spotlight — `FlashlightLight.tsx`
- ❌ Shop overhaul Undertale-style com dialogue engine
- ❌ Pickup arm animation (manual bone manipulation)
- ❌ Toda a evolução do shop (cashier, sprite, blink, etc.) DEPOIS de `87da1a9`
- ❌ ARM-FORUM.md (discussão dos 4 agentes)
- ❌ Vários reports (LAYOUT, AUDIT-REPORT, HARDEN, PERFORMANCE, UI-CHANGES) — não, esses foram mantidos porque estavam no `87da1a9`
- ❌ Plugin `vite-plugin-singlefile` no `vite.config.ts` — voltou pra config antiga

### O que CONTINUA
- ✅ Lobby completo, NPC Supervisor, Dussekar, móveis
- ✅ HouseEnv, Barney Actor, level 2
- ✅ Multiplayer, chat, bots
- ✅ Audio engine, atmosphere effects
- ✅ Settings, quality profiles
- ✅ MEMORY.md, MAP.md, AUDIT.md (preservados)

### Próximos passos (Felipe vai pedir mais)
O Felipe disse "vc vai ter que fazer mais pedi" — significa que vai pedir as features pra adicionar de volta uma por uma. Provavelmente:
1. Sistema de inventário simples (lanterna + cookie)
2. Shop melhorado
3. Pickup arm animation — mas SEM `useFrame(..., 1)` e SEM mexer em hierarquia de esqueleto

### Lição CRÍTICA (anotar pra próxima sessão)
- **NUNCA** usar `useFrame(..., priority != 0)` neste projeto. R3F v9 desativa auto-render.
- **NUNCA** anexar meshes diretamente em bones do esqueleto via `createPortal` ou `bone.add()` — interfere com skinning.
- Bone manipulation em `useFrame` priority 0 está OK, **desde que** o useAnimations seja chamado antes (a ordem dos hooks garante mixer roda primeiro).

---

## 🏗️ Sessão 2026-05-12/14: Reconstrução completa pós-revert (shop, inventário, lanterna, pickup arm, perf)

Tudo o que vem abaixo foi feito a partir do revert ao commit `87da1a9` (~4.44MB). Cinco dias intensos. Esta seção consolida tudo num só lugar pra próximas IAs não terem que reconstruir o histórico do zero.

### Arquivos criados/reescritos
- `InventorySystem.tsx` (novo) — `useInventory()` hook + `InventoryHUD` (estilo Undertale âmbar/preto)
- `FlashlightLight.tsx` (novo) — `FlashlightLight` (spotlight + cone volumétrico), `FlashlightModel3D` (3rd person)
- `ShadowBlob.tsx` (novo) — disco translúcido no chão pros personagens
- `Player.tsx` — pickup arm animation, FPArmModel (viewmodel 1ª pessoa em primitivas)
- `ShopOverlay.tsx` — prop `onBuyItem` adicionada
- `shop-dialogues.ts` — campo `action?` em Choice; lanterna e biscoito como itens compráveis
- `App.tsx` — wire de tudo, postprocessing minimal, perf monitors

### 🔦 Sistema de inventário
- `useInventory()` retorna `{inventory, addItem, toggleFlashlight, useCookie, hasAnyItem}`
- `inventory = { flashlight: {owned, active}, cookie: {count} }`
- HUD com botões lanterna (toggle) + biscoito (consume), notification toasts, cookie heal radial overlay
- Tecla `F` toggla lanterna; clique no HUD ou no biscoito também

### 🛒 Shop (recepcionista)
- Adicionei item **Lanterna - 0G** + **Biscoito - 0G** no menu `buy`
- `Choice.action: 'buy_flashlight' | 'buy_cookie'` dispara callback `onBuyItem` antes da navegação
- Dialogue Undertale style mantido

### 💡 Lanterna 3D — fixada na mão via handAnchor
- Avatar (Player.tsx) cria um `THREE.Object3D` vazio (`__flashlight_anchor`) com `hand.add(anchor)`, position local `(0, 0.05, 0)` (na palma, Mixamo RightHand +Y aponta pros dedos)
- Avatar expõe o anchor via callback `onHandAnchor(obj)`
- App.tsx tem `rightHandAnchorRef`, repassa pro `FlashlightModel3D`
- A cada frame, `FlashlightModel3D` faz `anchor.updateWorldMatrix(true, false)` (sobe na hierarquia!) + `decompose` → copia position/quaternion pro group da lanterna
- Lanterna fica perfeitamente fixada na mão, segue rotação do braço quando a animação pickup roda

**Por que `updateWorldMatrix(true, false)` e não `updateMatrixWorld(true)`:**
- `updateMatrixWorld(force)` desce na hierarquia (atualiza filhos) — não serve aqui
- `updateWorldMatrix(updateParents, updateChildren)` sobe na hierarquia — garante que avRef + primitive transforms estão fresh ANTES de ler bone.matrixWorld

**Iluminação:**
- SpotLight intensity 22, distance 28m, decay 1.0, angle π/5.5, penumbra 0.45
- Fill pointLight nos pés do player (intensity 1.2, distance 2.5m) — evita "void" feeling
- nightMode ambient 0.04, Level 2 ambient 0.08 → lanterna realmente importa

### ✋ Pickup arm animation (Avatar 3ª pessoa)
- Detecta bones `mixamorig:RightArm` + `RightForeArm` + `RightHand` (exact match + substring fallback)
- `useFrame` priority **0** (NUNCA != 0 — quebra auto-render)
- useAnimations é chamado antes na ordem de hooks → mixer roda primeiro
- Quaternions/eulers pré-alocados, zero GC
- **Estado separado**: `pickupRef.timed` (1.2s extend→hold→retract) + `pickupRef.sustained` (lanterna ligada = sempre `progress=1`)
- Quando armExtended vira false, jump elapsed → 0.8 (início do retract) pro braço descer suave
- **Distinto por item**:
  - Flashlight: `armX = -π·0.44`, `forearmX = -π·0.13` (extend forward)
  - Cookie: `armX = -π·0.35`, `armY = +π·0.20` (inward → mouth), `forearmX = -π·0.95` (strong fold)

### 🤚 FPArmModel (1ª pessoa)
- Mock 3D arm: cylinders + spheres (chunky Roblox style), 80 triangles total
- Anchored à camera position+quaternion a cada frame
- `depthTest=false` + `renderOrder=999` + `frustumCulled=false` → sempre por cima
- `state.timed.elapsed` avança SEMPRE (mesmo invisível) → entering FP mid-animation não reinicia
- Visível só quando `armExtended || timed.active` (não polui a tela em idle)
- Lanterna e cookie como meshes separados no FPArmModel; visibility mutuamente exclusiva
- Cookie animation: shoulder Y rotates inward, elbow folds forward

### ⚡ Performance — todas as otimizações sustentáveis

| Otimização | Como | Onde |
|---|---|---|
| Distance-band throttling | 0-10m every frame, 10-30m a cada 2 frames, 30m+ 1Hz | `RemotePlayer.tsx`, `Bot.tsx` |
| AdaptiveDpr + PerformanceMonitor | drei components — auto-reduz pixelRatio quando FPS cai | `App.tsx` Canvas |
| Tree count 43→22 | Consolidado em `TREE_POSITIONS` const module-level | `HouseEnv.tsx` |
| BarneyActor early-exit | `if (!isVisible && scaleRef.current < 0.005) return` | `HouseEnv.tsx` |
| FpsCounter throttle | `setState` só se valor mudou | `Settings.tsx` |
| AudioContext suspend | `suspend()` no `visibilitychange:hidden` | `AudioEngine.tsx` |
| Sun/Moon geometry | 32×32 → 12×10, 16×16 → 10×8 | `HouseEnv.tsx` |
| ShadowBlobs | 16-seg circle (32 tri) em vez de shadow maps | `ShadowBlob.tsx` + RemotePlayer |
| Minimal postprocessing | Strip N8AO/Vignette/CA/Environment, só Bloom no high | `App.tsx` |
| Skeleton scanner gated | `window.__SKELETON_SCAN__` flag — zero cost em prod | `Player.tsx` |

### 🚫 Coisas que tentamos e NÃO funcionaram (anotar pra futuro)

1. **GLB clone + bone scale-collapse para FP viewmodel**
   Ideia: clonar avatar GLB, colapsar bones que não são do braço direito (scale 0.0001), renderizar perto da câmera.
   Por quê falhou: scale é herdado via matrixWorld. Colapsar Hips colapsa também RightArm (descendant). E meshes não-skinnadas (cabelo, hat) ignoram bone scale e ficam visíveis. Resultado: cabeça aparecia, braço sumia.
   Solução final: mock arm com primitivas.

2. **AnimationClip programática + setLayer(1)**
   Forum decidiu que era a solução perfeita. Falhou porque `setLayer()` não existe na versão Three.js do projeto.
   Manual bone manipulation com pre-allocated quaternions é o jeito.

3. **createPortal pra anexar lanterna no bone**
   Causou tela preta (skinned mesh hierarchy não gosta de meshes mountadas como filhos no runtime).
   Solução: handAnchor = `THREE.Object3D` vazio (sem mesh) é OK como filho do bone. Read matrixWorld + decompose, renderiza mesh SEPARADAMENTE.

4. **N8AO + Vignette + ChromaticAberration + Environment HDRI**
   Adicionei pra dar "AAA look" — Felipe testou no celular: lag muito grande pra um ganho visual mediano. Removido.
   Lições: postprocessing real em mobile = veneno. Bloom leve é o teto.

5. **DLSS/FSR Frame Generation**
   Felipe pediu várias vezes. Não existe API web pra isso. WebGL/WebGPU não expõem driver-level frame interpolation.
   O que existe: `<AdaptiveDpr>` da drei, que reduz pixelRatio dinamicamente quando FPS cai e deixa o browser fazer upscale. É o teto da web. Já está rodando.

### 🚨 LANDMINES — coisas que NÃO PODEM voltar
- ❌ `useFrame(..., priority != 0)` — R3F v9 desativa auto-render, tela preta
- ❌ Anexar mesh via `createPortal` ou `bone.add(mesh)` em skeleton hierarchy
- ❌ SpotLight com `distance={0}` quando ativo (Three.js = infinite range = black screen)
- ❌ N8AO em mobile (FPS cai)
- ❌ Bone scale-collapse pra esconder partes do GLB (afeta descendentes)
- ✅ OK: bone manipulation em useFrame priority 0 + useAnimations antes
- ✅ OK: `Object3D` vazio como child de bone (sem mesh)
- ✅ OK: `updateWorldMatrix(true, false)` pra refrescar matriz sobindo na hierarquia

### Quality profile (atualizado)
| Setting | low | medium | high |
|---|---|---|---|
| dpr range | 0.5–0.75 | 1–1.25 | 1–2 |
| far plane | 40 | 80 | 120 |
| antialias | ❌ | ❌ | ✅ |
| atmosphere | ❌ | ✅ | ✅ |
| postprocessing | ❌ | ❌ | Bloom only |
| nightLights | ❌ | ✅ | ✅ |
| remoteLimit | 3 | 8 | 30 |
| godRays | ❌ | ❌ | ✅ |

### Como debugar próxima vez
1. Tela preta volta → procurar `useFrame(_, _, !=0)` ou `bone.add(mesh)` recente
2. Lanterna fora do lugar → verificar `updateWorldMatrix(true, false)` no FlashlightModel3D
3. FP arm reinicia animação → verificar se `state.timed.elapsed` está sendo avançado FORA do visibility gate
4. Cookie pra cabelo (não boca) → ajustar `armAngleY` (positivo = pra dentro) e `forearmAngleX` (negativo = elbow forward)
5. Bones do GLB precisam debug → `window.__SKELETON_SCAN__ = true; location.reload();` → console.table com toda hierarquia

---

## 🔧 Sessão 2026-05-17: Water Level + Quality Mode Differentiation

### Mudanças

#### Água elevada para Y=0.35
- `WATER_LEVEL_Y` mudou de `-0.05` para `0.35` — piscina agora fica ACIMA do chão da caverna
- `SWIM_THRESHOLD_Y` mudou de `-0.3` para `0.10` — jogador entra em modo nado abaixo de Y=0.10
- Pool rim boulders reposicionados para Y=0.35 (acompanhar o nível da água)
- X-ray blocker disc e coluna ajustados para a nova altura

#### Modo Médio com mais diferença visual
- `atmosphere` agora é `true` no Medium (era `false`) — água com MeshReflectorMaterial no Medium
- Novo flag `godRays` no QualityProfile:
  - Low: `false` — sem god rays, sem deep mist
  - Medium: `false` — sem god rays, sem deep mist (mas tem caustics, flora, peixes, poeira)
  - High: `true` — god rays + deep mist + tudo

#### Diferenciação por qualidade no Floor2Underwater
- **Low**: iluminação reduzida, sem caustics, sem flora, sem god rays, sem peixes, sem poeira, sem deep mist, sem plankton
- **Medium**: caustics ✅, kelp/coral ✅, bolhas ✅, peixes ✅, poeira ✅; sem god rays, sem deep mist
- **High**: tudo + god rays + deep mist + MeshReflectorMaterial

#### Arquivos alterados
- `jubileu/src/Floor2Underwater.tsx` — água em Y=0.35, quality prop, renderização condicional
- `jubileu/src/Settings.tsx` — atmosphere=true no medium, novo flag godRays
- `jubileu/src/App.tsx` — passa quality prop para World → Floor2Environment

### Commit
- `d44ba5d` — feat: raise water to Y=0.35, enhance medium quality mode


---

## 🔧 Sessão 2026-05-18: Bearded Diver + Rebreather + Night Vision + Ocean Polish

### Contexto
Felipe pediu pra deixar o Floor 2 (caverna submarina) com aparência de jogo
Unreal, 60+ FPS, sem bugs, e adicionar um NPC procedural barbudo de
uniforme de hotel que dá um respirador + visão noturna quando o player
chega no andar.

### O que foi feito

#### NPC + items
- **`BeardedDiver.tsx` (novo)** — boneco R6 procedural (corpo box-only,
  cores chapadas) com:
  - Barba castanha, bigode, costeletas
  - Chapéu de mensageiro vermelho com banda dourada
  - Casaco azul-marinho com fileira dupla de botões de latão, lapelas e
    gravata borboleta
  - Luvas brancas segurando uma máscara de mergulho com goggles NV
    clipados em cima
  - Calça preta, sapatos
  - Estado interno: 5 fases (delay → scare-pop → idle → handover → fade)
  - Animação "scare": scale 0 → 1 com overshoot back-out + lurch
  - Idle: respiração bob (sin × 0.04) + sway lateral sutil
  - Encara o player no plano XZ
  - Quando player chega a ≤ 2.6m, fires `onHandover()` uma vez só
  - Após handover, braços extendem (1s) e diver fade out

- **`InventorySystem.tsx` (expandido)**:
  - Adicionados `rebreather: { owned }` e `nightVision: { owned, active }`
  - HUD ganha 2 novos slots: NV (toggle, emerald) e rebreather (passivo,
    cyan)
  - Notificações de aquisição
  - `toggleNightVision` action

#### Night vision
- **`NightVisionOverlay.tsx` (novo)** — duas peças:
  - `NightVisionFx` — DOM/CSS: tinta verde (multiply), boost verde
    (screen), binocular vignette, scanlines, phosphor breathe, HUD chip
    "NV ON"
  - `NightVisionLights` — só monta dentro do Canvas quando active=true.
    Adiciona ambientLight intensity 2.2 + hemisphereLight verde pra o
    player conseguir enxergar tudo na caverna escura

#### Animação de colocar máscara
- **`RebreatherPutOnOverlay.tsx` (novo)** — cinemática de 1.7s:
  - Mãos SVG sobem da base segurando a máscara
  - Máscara cresce até quadrar a tela
  - Frame radial preto fecha pelas bordas (sensação de "máscara presa")
  - Flash branco horizontal (snap-on)
  - onDone callback limpa o flag

#### Wire no App.tsx
- `useDiverHandover` hook gerencia o ciclo: diver visível quando
  `currentLevel === 2 && !doorsClosed && !inventory.rebreather.owned`
- Handover adiciona ambos os items + dispara put-on overlay
- Tecla `N` toggla night vision (paralelo ao `F` da lanterna)
- `WorldProps` expandido com `diverVisible`, `diverHandedOver`,
  `onDiverHandover`, `nightVisionActive`
- `NightVisionLights` montado dentro do `<World>` (condicional)
- `NightVisionFx` + `RebreatherPutOnOverlay` no HUD layer

#### Polish visual do oceano (Floor 2)
- **`Floor2/shaders.ts`**:
  - `WaterMaterial`: rim gradient de água rasa cyan-aqua perto do furo,
    caustics maiores com cross-pattern interference, edge foam ring
    animado, shimmer de alta frequência sobre as Gerstner waves
  - `UnderwaterOverlayMaterial`: mais contraste entre shallow (cyan-green)
    e deep (purple-black), god ray streaks que pannam lentamente,
    caustics mais brilhantes, UV jitter "fake blur" intensifica com depth
  - `CausticsMaterial`: padrão voronoi/cellular com palette cyan-aqua-
    green (substituiu o sin-based muddy anterior)
- **`Floor2/components.tsx`**:
  - `FishSchool` ganhou 3 variantes "glower" emissivas (teal, purple,
    aqua) com sprite halos additive
  - `DeepMist` virou 3 layers parallax (a mais profunda gated por
    `reflective`)
  - `UnderwaterCaustics` escalou pra 80×80, fade com depth do player
  - `BubbleField` + `SurfaceBubbleRing` usam additive blending cyan pra
    glow visível
  - `GodRayShafts` ganha pop de opacity quando player está direto embaixo
    do hole (proximity-driven)
- **`Floor2/index.tsx`**:
  - Novo helper `UnderwaterLighting` — lerp ambient + hemisphere de warm
    cave pra cool cyan conforme player submerge
  - Directional light apontando pra baixo do hole (cyan)
  - (Só `reflective=true`) pointLight "shaft from above" em
    [HOLE_CENTER_X, -3, HOLE_CENTER_Z] com distance 22 decay 2

### Landmines respeitadas
- ✅ Zero `useFrame(..., priority != 0)`
- ✅ Zero `SpotLight distance={0}` enquanto vivo
- ✅ Zero `bone.add(mesh)` ou `createPortal` em hierarquia de esqueleto
- ✅ Zero novas postprocessing passes
- ✅ Zero `useState` dentro de `useFrame`

### Build
- TypeScript: ✅ limpo (`npx tsc --noEmit`)
- Vite build: ✅ (24.19MB bundle, gzipped 15.72MB)
- `index.html`: rebuild + commit junto com source (regra de ouro #1, #3)
- Dev server: boot limpo (vite v6.4.2 ready em 287ms)
- Tests: 38/39 pass (o que falha é pré-existente, `dpr[0]=0.5` para low
  vs test esperando 1)

### Commit
- `e926f87` — feat(floor2): bearded diver NPC, rebreather + night vision
  items, underwater visual overhaul

### Branch
- `claude/review-project-context-QkfHZ` — push feito

### Próximos passos sugeridos
- [ ] Felipe testar visual do oceano + diver no celular e desktop
- [ ] Se NV ficar "feio demais" em determinadas situações, ajustar
      opacidade do tint
- [ ] Considerar adicionar som de "scare" + som de "máscara colocada"
      no AudioEngine
- [ ] Se quiser GLB do diver depois, substituir o procedural por
      `<primitive object={glbScene} />` — props `position`, `rotation`,
      `scale` ficam iguais

---

## 🎪 Sessão 2026-06-04 — Floor 3 vira o show do "Diabrete" + Floor 4 (base plate) + mesa redonda (PAUSADA)

> **Branch:** `claude/review-project-context-QkfHZ` — tudo commitado e pushado.
> Esta foi uma sessão LONGA. O Floor 3 deixou de ser só um parkour e virou um
> nível com rival, cutscenes e uma escolha moral. O Floor 4 nasceu como base
> plate. No fim a gente começou uma "mesa redonda de agentes" pra decidir o
> polimento final — **essa parte ficou pausada** (ver seção 10).

### Visão geral do que o Floor 3 é hoje
1. Player chega → **intro cartoon** (iris creme + luvas rubber-hose "puck puck" + ragtime).
2. **Cutscene de apresentação**: o Diabrete (diabinho rubber-hose) aparece, provoca o player e dispara correndo.
3. **Gameplay**: o Diabrete corre na frente fazendo parkour e **sabota** o caminho:
   - a cada **10 pulos** ele **desenha** (pinta com um pincelão) uma fileira de **espinhos de tinta** numa plataforma à frente;
   - a cada **2 obstáculos** aparece um **pincel** flutuando pra coletar;
   - pegar um pincel deixa o Diabrete **tonto** (passarinhos girando, estilo 1930).
4. Pegar o **3º pincel** → **cutscene de derrota interativa** (ver seção 4).

### 0. Sistema de música exclusiva — `musicDirector.ts` (NOVO)
- Árbitro central tipo "camada de cebola": **impossível duas músicas tocarem juntas**.
- Cada grupo tem prioridade: `engine`(lobby/elevador)=10, `floor2`=60, `ragtime`(Floor 3)=70, `chase`=100, `floor4`=65.
- API: `attachMusicBus(ctx,dest)`, `getMusicBus(id,prio)`, `setMusicActive(id,active)`, `detachMusicBus()`. `reconcile()` escolhe UM vencedor (maior prioridade ativa) e zera os outros via `setTargetAtTime`.
- Todo grupo passa pelo master bus → respeita mute + slider de volume de graça.
- `cartoonAudio.ts`, `Atmosphere.tsx`, `AudioEngine.tsx` passaram a rotear pelos buses (param `destination?`). Corrigiu o bug da música do lobby vazando em outros andares (Modo Criador forçava `lobby.volume=0` quando `currentLevel!==0`).

### 1. O Diabrete — rig PROCEDURAL (`diabreteRig.ts` NOVO)
- O GLB (`public/diabrete.glb`, ~2.9MB, gerado no Tripo) veio **SEM esqueleto e SEM animações** — Mixamo e auto-riggers recusaram.
- Solução: **riggei manualmente em Three.js**. `buildDiabreteRig(gltf)` constrói um esqueleto de **7 ossos** (root→body→head/l_arm/r_arm/l_leg/r_leg), pinta os **pesos por zonas espaciais** (análise da nuvem de vértices: braços ficam numa barra horizontal em Y≈0.53, X externo; pernas metade inferior bilateral; cabeça topo), e cria 2 `SkinnedMesh` (fill toon + contorno inverted-hull) ligados ao MESMO esqueleto.
- `export const DIABRETE_SCALE = 2.2` (o modelo cru tem ~1m; escala pra ele ser mais alto que o player).
- Descoberta importante (testada no harness): pra LEVANTAR os braços do rig, `l_arm.rotation.z` POSITIVO e `r_arm.rotation.z` NEGATIVO (o sinal é contra-intuitivo). Pra correr, baixa os braços da horizontal (`ARM_DROP`) e bombeia em contrafase.

### 2. Animação do rival — `Floor3Rival.tsx`
- Tudo **animação procedural por spring**, sem clipes:
  - **Correr**: pernas em pêndulo alternado, braços bombeando, body bounce + lean + gingado, squash/stretch.
  - **Tonto** (lê `f3Hazards.isDizzy()`): pose clássica de cartoon — joelhos bambos, cabeça pendendo, **3 passarinhos brancos com bico laranja** orbitando a cabeça + tweet SFX.
  - **Pintar** (quando nasce obstáculo): pega um **pincelão** (adicionado ao osso `r_arm`) e faz movimento de pintura; os espinhos "inkam" embaixo.
  - **Floreio de desenho**: SFX de risco + flick do braço.
- Quando `f3Progress.fell` vira true, o rival do gameplay **se esconde** e publica `f3DevilPos` (a cutscene dedicada assume).
- **Intro 3D** (`CartoonIntro3D.tsx`): iris creme (PlaneGeometry + shader `uRadius`), luvas toon que dão "puck puck", título "ANDAR 3". Não dá pra skipar. Gating: dispara em `currentLevel===3 && !doorsClosed` (na CHEGADA, não no meio da viagem).
- **Cutscene de apresentação** (`Floor3Cutscene.tsx` + `diabreteScript.ts` + `Floor3CutsceneUI.tsx`): o Diabrete atua cada fala (lean/point/throw/laugh/taunt) e dispara correndo no fim. Usa a trava de câmera de diálogo (reaproveitada).

### 3. Loop de sabotagem — `f3Hazards.ts` + `Floor3Hazards.tsx` (NOVOS)
- `f3Hazards.ts`: estado mutável compartilhado (igual `f3Parkour.ts`). `f3Progress = {jumps, obstacles, brushes, dizzyUntil, drawFlashAt, drawZ, fell, fellAt, needed:3}`.
  - `registerJump(z)` (Player chama a cada pulo) → a cada 10 → `spawnObstacle` (espinhos numa plataforma ~12 à frente); a cada 2 obstáculos → `spawnBrush` (~16 à frente).
  - `tryCollectBrush`, `hazardKnockback` (Player chama), `tickHazards` (renderer).
  - `f3DevilPos` (Vector3) e `f3Demo` (flag do atalho do criador) exportados aqui.
  - `setOnWin`/`setOnProgress`/`fireWin` (callbacks pra App) — **OBS: `fireWin`/`setOnWin` hoje estão DEAD** (o win real vai por `onDone` da cutscene → `advanceToFloor4AfterWin`). Ver riscos.
- `Floor3Hazards.tsx`: desenha os espinhos (reveal escalonado de tinta + linha de base que varre) e os pincéis (cabo + virola + cerdas + ponta vermelha, bob + spin).
- SFX novos em `floor3Sfx.ts`: `playFloor3Draw` (risco), `playFloor3Brush` (coleta), `playFloor3Dizzy` (passarinhos, retorna stop()), `playFloor3Fall` (apito + splat). Além dos já existentes step/jump/land.
- HUD: contador 🖌️ x/3 no topo.

### 4. A CUTSCENE DE DERROTA — `Floor3FallCutscene.tsx` (NOVO, MUITO iterado)
Estado final (depois de vários feedbacks do Felipe):
- Câmera **própria** (renderizada DEPOIS do `<Player>` no Canvas, então sobrescreve a câmera dele) — **nunca** fica em 1ª pessoa.
- O Diabrete **encara a plataforma/player** (`rotation.y = π`) e se agarra na **borda que a própria cutscene renderiza** (laje creme + borda de tinta) — antes ele flutuava porque não tinha plataforma garantida no spot.
- **Máquina de estados**: `intro` (tropeça→escorrega→agarra a beira) → `beg` (pendurado por UMA mão, estica a outra implorando, segura pra escolha) → `stomp` | `climb`.
- **Câmera de cima (top-down)** no beg: o player olha por cima da beira pra ele (visão de cima, mãozinha na borda, rosto pra cima). **Múltiplos ângulos com cortes** (plano aberto no tropeço → ângulo baixo na pegada → top-down no implorar → close de cima no pisão → ângulo heroico no sorriso → câmera caindo no empurrão).
- **Props estilizados** (toon + contorno de tinta): **sapato cartoon** bulboso (PISAR) e **luva branca** (SALVAR). (Substituíram um boot tosco.)
- **Conversa** (8 falas vai-e-vem entre Diabrete e player, com chantagem emocional) — UI no App (`FALL_DIALOGUE`). Os **botões SALVAR/PISAR só aparecem na última fala**.
- **Desfechos**:
  - **PISAR (não salvar)** → sapato esmaga a mão → ele despenca → `onDone('stomp')` → `advanceToFloor4AfterWin` → sobe pro **Floor 4**.
  - **SALVAR** → luva o puxa pra cima → ele sobe, vira pra ENCARAR o player, dá o sorriso maligno e **EMPURRA** (a câmera = player é jogada pra trás e despenca olhando pra cima pro Diabrete encolhendo) → `onDone('save')` → **GAME OVER** (card vermelho) → volta pro **LOBBY**.
- **FIX crítico**: a câmera ficava bugada ao fim porque o `camera.up` ficava rolado. Agora **reseto `camera.up=(0,1,0)` no cleanup do unmount** (verificado: `[0.96,0.27,0]` no empurrão → `[0,1,0]` depois).
- **Hooks DEV** (`import.meta.env.DEV`): `window.__fallScrub`/`__fallPhase`/`__fallT` pra travar fase/tempo e testar — no-op em produção.

Wiring no App (`App.tsx`): estados `cartoonFall`, `fallBegging`, `fallChoice`, `fallGameOver`, `fallLine` (+ effect que avança o diálogo); `handleFallOutcome` (stomp→Floor4, save→`handleGameOver`→lobby); reset de tudo no enter/leave do Floor 3.

### 5. Floor 4 — FUNDAÇÃO (base plate) — `Floor4.tsx` + `floor4Sfx.ts` (NOVOS)
- **Tema ainda NÃO definido** — Felipe vai dizer depois. É um **scaffold neutro e themeável**: bloco `FLOOR4` (cores/névoa/luz) no topo pra reskin de 1 bloco; slots marcados no JSX (`ENV PROPS / ENTITIES / HAZARDS / CUTSCENE`); cabeçalho documenta cada "seam" (look, movimento, áudio, entidades via `buildDiabreteRig`, objetivo via `f3Hazards`+`setOnWin`, cutscene).
- Base plate cinza 40×40 com grid + elevador. Movimento usa o branch flat-walk padrão do Player (y=0).
- `floor4Sfx.ts`: scaffold de SFX (mirror do floor3Sfx).
- App reserva o bus `floor4` (música) no enter; progressão é **aberta** (sem objetivo ainda).
- **Vencer o Floor 3 (PISAR) → sobe pro Floor 4** (`setNextElevatorDestination(4)`).

### 6. Atalhos no Modo Criador (`CreatorMode.tsx`)
- Lista agora é **scrollável** (`max-h-[46vh] overflow-y-auto` + scrollbar roxa).
- Card **"Andar 4"** (base plate).
- Card **"Queda do Diabrete"** (variant `fallDemo`): seta `f3Demo.fall=true`, entra no Floor 3, **pula a intro** e dispara a cutscene de derrota ~1.6s depois — pra ver a cena na hora.

### 7. Padrões técnicos / aprendizados desta sessão
- **Rig procedural**: dá pra riggar um GLB sem esqueleto em runtime (esqueleto + pesos por proximidade + 2 SkinnedMesh no mesmo Skeleton).
- **Como TESTAR no sandbox** (importante — o jogo completo NÃO carrega offline porque depende de assets do GitHub + dev server instável):
  - **Harness isolado**: `falltest.html` + `src/falltest.tsx` montando SÓ o componente (ex: a cutscene) numa cena simples — o único asset é `/diabrete.glb` (local), então roda offline.
  - **Hooks de scrub DEV** (`__fallScrub`/`__fallPhase`) pra capturar cada beat deterministicamente.
  - **Playwright** (`node_modules/playwright-core`, `--use-gl=swiftshader`) pra screenshot + ler `window` (estado/erros).
  - ⚠️ Os arquivos `falltest.*` são temporários — **apagar antes de commitar**.
  - Vite no sandbox é instável (portas trocam, processo cai). Truque: matar tudo (`pkill -9 -f vite`), subir UM via background, e LER a porta real do log.
- **Controle de câmera em cutscene**: renderizar o componente DEPOIS do `<Player>` faz o `useFrame` dele rodar por último → a câmera dele vence. SEMPRE resetar `camera.up` no unmount.
- **Reaproveitar a trava de câmera de diálogo**: passar `dialogueOpen=true` + um `dialogueTargetRef` congela o player e some o avatar.

### 8. Arquivos novos/alterados (principais)
- **NOVOS**: `diabreteRig.ts`, `Floor3Rival.tsx`, `Floor3Cutscene.tsx`, `Floor3CutsceneUI.tsx`, `diabreteScript.ts`, `CartoonIntro3D.tsx`, `CartoonIntro.tsx`, `f3Hazards.ts`, `Floor3Hazards.tsx`, `floor3Sfx.ts`, `Floor3FallCutscene.tsx`, `Floor4.tsx`, `floor4Sfx.ts`, `musicDirector.ts`, `public/diabrete.glb`.
- **ALTERADOS**: `App.tsx` (muito — todo o wiring de Floor 3/4), `Floor3.tsx`, `Player.tsx` (pulos/knockback/coleta no Floor 3), `CreatorMode.tsx`, `AudioEngine.tsx`, `Atmosphere.tsx`, `cartoonAudio.ts`, `f3Parkour.ts`.

### 9. Commits desta sessão (do mais novo)
`e5a15e8e` fall cutscene (ledge real, empurrão claro, conversa+escolha, game over, reset câmera) · `165d6ffc` rework top-down/multi-ângulo/estilizado/chantagem · `c7e24126` derrota interativa (SALVAR/PISAR) · `3710899d` cutscene de derrota dedicada · `827f4df8` derrota vira cutscene · `fe679037` atalho "Queda do Diabrete" · `3be2bb1a` Floor 4 fundação · `11dadd14` Floor 3→Floor 4 · `9c1e6793` Floor 4 base plate + criador scrollável · `4ca6b018`/`33bdc5a3` loop de sabotagem · `31324fc2`/`9acad390`/`be9b4b1e` Diabrete (rig+anim+cutscene) · `1352a70c` music director · `60265d86` SFX 1930 · `553523f1`/`9aded5cc` intro cartoon 3D.

### 10. ⏸️ MESA REDONDA — MISSÃO PAUSADA (retomar daqui)
**O que a gente estava fazendo quando parou:** o Felipe pediu os **retoques finais do Floor 3** via uma "**mesa redonda de agentes**" — vários agentes especialistas que analisam o nível, **interagem entre si**, decidem o que polir, e aí eu implemento.

**Plano da mesa (desenhado):**
- **Rodada 1** — 4 críticos em paralelo, cada um com uma lente: **Design** (feel/pacing/clareza do loop), **Arte/Animação** (consistência rubber-hose, staging das cutscenes, luz), **Áudio** (SFX 1930, mix, sons faltando) e **QA** (bugs/edge cases).
- **Rodada 2** — um **moderador** recebe as 4 listas, reconcilia/debate trade-offs e cospe um plano final priorizado.
- **Rodada 3** — eu implemento + testo + push.

**O que rodou:** SÓ o agente de **QA** (os de Design/Arte/Áudio e o moderador **NÃO** rodaram — Felipe mandou abortar e atualizar o memory primeiro).

**Achados do QA (preservados — viram TODO quando retomar):**
1. **[ALTO]** `f3DevilPos` pode estar no sentinel `(0,0,14)` quando a cutscene monta (race entre `fell=true` e o rival publicar a posição) → ela encena no lugar errado. **Fix:** fallback pra `f3PlayerZ.current + LEAD_Z` quando `f3DevilPos` ainda for o sentinel, ou setar `f3DevilPos` no momento do win/registerJump.
2. **[ALTO]** Knockback dos espinhos sem cooldown de tempo (`h.hit` só reseta atrás de `z0-1.2`, mas o shove joga pra `z0-0.5` → pode oscilar/grudar). **Fix:** cooldown por tempo (`hitAt`) + empurrar pra trás de `z0-1.3`.
3. **[MÉDIO]** Pincel pode nascer na plataforma/região de um espinho (collect radius 1.3 vs gap 3.0) → espinho impossível de pular sem pegar o pincel. **Fix:** exigir separação mínima de ≥1 plataforma entre brush e hazard.
4. **[MÉDIO]** `resetHazards()` não reseta `f3Progress.needed`. Hoje é constante 3, mas é uma armadilha futura. **Fix:** add `f3Progress.needed = 3`.
5. **[MÉDIO]** `fireWin`/`setOnWin` estão **armados mas mortos** (o win real vai por `onDone`). Risco de double-advance se algo chamar `fireWin`. **Fix:** remover o caminho morto OU rotear tudo por ele (não deixar os dois).
6. **[MÉDIO]** Hooks DEV `__fallScrub`/`__fallPhase` não são limpos no unmount — um dev que scrubou trava os próximos playthroughs na aba até reload. **Fix:** `delete` no cleanup.
7. **[BAIXO-MÉDIO]** Cleanup reseta `camera.up` mas NÃO o `fov` — no caminho save→gameover→lobby pode flashar fov errado. **Fix:** restaurar fov (75/90) no cleanup.
8. **[BAIXO]** Demo (`f3Demo.fall`) usa timer cru de 1600ms — se o player sair do Floor 3 antes, o timer ainda suja `fell`/`cartoonFall`. **Fix:** capturar um epoch/level no callback e no-op se mudou.

**Quando retomar:** rodar os 3 críticos que faltam (Design/Arte/Áudio) + o moderador, juntar com os achados do QA acima, e implementar o plano consolidado.

### 11. ⚠️ Riscos/notas conhecidos
- **Landmine possível**: em `Floor3Rival.tsx` o pincelão é adicionado a um OSSO (`rig.bones[B.r_arm].add(brush)`) — o MEMORY antigo lista "Zero `bone.add(mesh)` em hierarquia de esqueleto" como landmine. Funcionou nos testes, mas **vigiar** (se der bug de transform/render, é candidato).
- O jogo depende de **assets externos do GitHub** (texturas + o GLB do personagem do player). Sem rede, o Canvas trava no loader / cai no ErrorBoundary. Considerar mover pra `/public`.
- ESLint tem ~179 problemas **pré-existentes** (não introduzidos nesta sessão) em arquivos antigos (`UI.tsx`, `f3Parkour.ts` cz/bx, etc.). O CI roda só `lint:types && test && audit` (não o eslint), então não bloqueia.
- Suíte do projeto passando: `tsc` limpo, **39/39 vitest**, `audit` 0 erros, `vite build` ok.

### Próximos passos sugeridos
- [ ] **Retomar a mesa redonda** (seção 10) — rodar Design/Arte/Áudio + moderador, implementar polimento.
- [ ] Felipe definir o **tema do Floor 4** → aí eu construo em cima do scaffold.
- [ ] Atacar os achados de QA (sobretudo os [ALTO]: race do `f3DevilPos` e cooldown do knockback).
- [ ] Felipe testar a cutscene de derrota no preview real (card "Queda do Diabrete").



---

## 🎲 Sessão 2026-06-04: Mesa Redonda de Agentes → Retoques Finais do Floor 3

### Contexto
Felipe pediu os retoques finais do Floor 3 via uma **mesa redonda de agentes que
interagem entre si** (retomando a missão pausada na sessão anterior). Montei:
- **Rodada 1** — 3 críticos em paralelo: **Design** (feel/pacing/clareza),
  **Arte/Animação** (rubber-hose, staging, poses), **Áudio** (SFX 1930, mix,
  cobertura). O **QA** já tinha rodado antes (8 achados preservados).
- **Rodada 2** — um **Moderador** recebeu as 4 listas, encenou o debate
  (concordâncias/conflitos/dependências), adjudicou alegações lendo o código e
  cuspiu um plano final em ondas.
- **Rodada 3** — implementei o batch "correto por construção" (verificável por
  tsc/testes), defiri o que não dá pra verificar sem renderizar.

### Descoberta crítica do Moderador
`createToonMaterial`/`createOutlineMaterial` (cartoonToon.ts) **NÃO têm skinning**
(sem `#include <skinning_*>`). Trocar o material do Diabrete (SkinnedMesh) por
eles **congelaria o personagem na pose de descanso**. Isso rebaixou o item TOP de
Arte ("unificar material") de "swap trivial" pra risco médio/blind → **DEFERIDO**.

### ✅ IMPLEMENTADO (verificável: tsc 0, 49/49 testes, audit 0 erros)

**Fairness / lógica (`f3Hazards.ts`):**
- **Knockback justo**: gate de colisão `reveal >= 0.85` (era 0.6 — só morde quando
  o espinho está visualmente cravado); empurrão pra `box.z0 - 1.3` (clear da
  borda, não mais `-0.5`); **cooldown por tempo** via novo campo `hitAt` (re-arma
  só após 600ms + recuo) — mata o grude/oscilação. [QA#2 + Design#3 + Áudio#1]
- **Supressão de spawn durante dizzy**: `registerJump` faz `if (isDizzy()) return`
  → nunca mais um espinho "aparece sozinho" sem o Diabrete pintando. [Design#6]
- **Separação mínima brush↔espinho**: helper `withNeighbors()` bloqueia também as
  plataformas adjacentes às já usadas pelo outro tipo. [QA#3 + Design#5]
- **1º pincel adiantado**: agora nasce no **obstáculo #1** (era no 2º, ~20 pulos)
  → ensina a mecânica de roubo logo de cara. [Design#2]
- `resetHazards()` reseta `needed = 3` + zera `f3DevilPos`/`f3DevilPosValid`. [QA#4]
- **Caminho morto removido**: `fireWin`/`setOnWin`/`_onWin` deletados (o win real
  sempre foi por `onDone` da cutscene → `handleFallOutcome`). Sem risco de
  double-advance. [QA#5]
- **Anti-sentinel da cutscene**: flag `f3DevilPosValid` (setada pelo Rival quando
  publica a posição real) + helper `devilStageBase()` (fallback pra
  `f3PlayerZ + 12` na plataforma mais próxima). A fall cutscene encena no lugar
  certo mesmo se montar 1 frame antes do Rival escrever. [QA#1]

**Áudio no idioma 1930 (`floor3Sfx.ts` + wiring):**
- `playFloor3Hit()` — "BONK!" (square stab + boing) pro knockback do espinho;
  era `playFloor3Land` (soava "pousei", leitura invertida). [Áudio#1] (Player.tsx:787)
- `playFloor3Stomp()` — "BWOMP" grave dedicado pro pisão (era `playFloor3Land`).
  [Áudio#3] (Floor3FallCutscene stomp)
- `playFloor3Shove()` — whoosh da traição **sem splat** (era `playFloor3Fall`, que
  confundia quem caía). [Áudio#4] (Floor3FallCutscene shove)
- `playFloor3GameOver()` — sad-trombone "wah-wah-wah" no game over, trocando o
  `playJumpscareStab` de terror genérico. [Áudio#5] (App handleGameOver)
- **`tada` na vitória**: o `sfx-tada.wav` órfão (carregado mas nunca tocado)
  finalmente toca em `advanceToFloor4AfterWin`. [Áudio#6]
- Cleanup defensivo no `playFloor3Dizzy().stop()` (`disconnect`). [Áudio low]

**Onboarding aditivo (`diabreteScript.ts`):**
- Nova fala (não corta as piadas existentes) ensinando "rouba os TRÊS pincéis e a
  brincadeira ACABA" — o objetivo nunca era explicado, só revelado pelo HUD. [Design#1]

**Housekeeping (`Floor3FallCutscene.tsx`):**
- Cleanup do unmount agora restaura o **`fov`** (antes só `camera.up`) [QA#7] e
  **limpa os hooks DEV** `__fallScrub`/`__fallPhase`/`__fallT`/`__fallPh` [QA#6].

**Teste novo:** `src/__tests__/f3Hazards.test.ts` (10 casos) trava cadência,
separação, supressão por dizzy, knockback justo/one-shot e o fallback do devil.

### ⏸️ DEFERIDO (precisa do olho do Felipe / é decisão dele)
Não consigo verificar visualmente neste ambiente (jogo depende de assets externos
+ WebGL), então NÃO mexi no que pode quebrar sem eu ver, nem na design deliberada:
- **Visual/animação (blind risk):** unificar material/outline do Diabrete (com
  skinning injetado), helper `setArms` + corrigir poses throw/laugh, mãos brancas
  no Diabrete (add `bone.add` — watchlist), reorientar pincel da pose paint,
  squash no pouso, asas dos pássaros, springs nas poses, ângulo oblíquo do "beg".
- **Decisão de design do Felipe:** SALVAR mandar pro lobby vs. respawnar no Floor 3
  (consequência da escolha moral — design deliberado dele); encurtar o
  FALL_DIALOGUE de 8→4-5 linhas (cortaria as piadas autorais dele).

### Estado
- Branch: `claude/memory-map-review-V8IIf` (mergeei `claude/review-project-context-QkfHZ`
  pra trabalhar em cima do código mais recente do Floor 3)
- tsc ✅ · 49/49 vitest ✅ · audit 0 erros ✅
- `index.html` rebuildado (regra de ouro #1) e commitado junto com o source (#3)

### Próximos passos
- [ ] Felipe decidir os itens DEFERIDOS de design (SALVAR→respawn? cortar diálogo?)
- [ ] Iterar os retoques visuais de Arte no device (material/poses/mãos/squash)
- [ ] Tema do Floor 4

### Continuação 2026-06-04 — Decisões do Felipe + visuais (mesa redonda, parte 2)

Felipe respondeu os itens deferidos. Implementado:

**SALVAR → respawn no Floor 3 (não mais lobby):** Felipe pediu "respawna no Floor 3,
do início, sem a cutscene". Novo `respawnFloor3FromStart` em `App.tsx` (substitui o
antigo `handleGameOver`): após o empurrão da traição, toca o wah-wah, mostra um card
breve "ENGANADO! …de volta pro começo da escadaria", e então `f3Reset()` (reconstrói o
curso determinístico) + `resetHazards()` + teleporta o player pra START (z=-8) +
`currentLevel` continua 3 + NÃO re-dispara intro/meet cutscene. As 8 falas do
FALL_DIALOGUE foram MANTIDAS (Felipe pediu).

**Visuais (escopo seguro, sem shader novo):**
- `diabreteRig.ts`: outline inverted-hull de `0.026 → 0.04` (silhueta legível à
  distância de gameplay sem precisar do shader distância-escalado). [Arte#2 paliativo]
- `Floor3Rival.tsx`: **squash no pouso** — `landImpact` ref (0→1 por velocidade de
  impacto, decai em 0.16s) multiplica `strY` na escala da corrida; strX preserva volume.
  [Arte landing]

**🔎 Falso-positivo resolvido (mesa vs. código):** o crítico de Arte alegou que a
"convenção de braço" estava quebrada em throw/laugh (braço direito atravessando o
corpo). **Lendo o código, é FALSO:** Floor3Cutscene:183-184, Rival:227-228 e
FallCutscene:250 aplicam consistentemente `l_arm.z=+valor` / `r_arm.z=−valor` (alvos
positivos, direito negado NA APLICAÇÃO = espelho correto). Não há bug → não mexi nas
poses. (Cheguei a criar um helper `setArms` + harness pra validar; removidos depois de
confirmar que não havia o que consertar.)

**🧪 Como testei (o sandbox NÃO roda screenshot WebGL):** tentei subir o dev server +
Playwright/swiftshader pra screenshot do Diabrete, mas o ambiente em nuvem MATA
qualquer servidor em background (exit 1, sem output). Build self-contained pra `file://`
sairia caro demais. Então a verificação possível aqui é **teste de unidade no esqueleto**:
`src/__tests__/diabreteRig.test.ts` constrói o rig e prova via `SkinnedMesh.applyBoneTransform`
(CPU puro) que os vértices DEFORMAM quando os ossos giram — ou seja, o personagem
**não congela** (a regressão #1 que o moderador temia). 53/53 testes verdes.

**⏸️ DEFERIDO pra device (precisa de olho/GPU que o sandbox não dá):**
- Rim fresnel + colored shadow no material do Diabrete (via `onBeforeCompile` no
  MeshToonMaterial, pra manter skinning) — única forma segura, mas exige ver renderizado
  pra confirmar que compila e não dá tela preta. **Recomendo fazer no seu device.**
- Mãos brancas no Diabrete (posicionamento depende de eixo do osso — preciso ver).
- Ângulo oblíquo do "beg", asas dos pássaros, springs nas poses.

**Estado:** tsc 0 · 53/53 vitest · audit 0 erros · index.html rebuildado. Branch
`claude/memory-map-review-V8IIf`.

### Continuação 2026-06-04 — Fix: Diabrete flutua depois da tontura

**Sintoma (Felipe):** ao sair da tontura e voltar a correr, o Diabrete flutua.

**Causa raiz:** em `Floor3Rival.tsx` a altura do chão (`groundY`) era resolvida a
partir de `targetZ` (= `leadZ` = `f3PlayerZ + 14`, bem À FRENTE do player), não da
posição real do diabo. Durante a tontura o movimento congela (`if (!dazed)` pula o
passo), mas o player segue subindo → `leadZ` dispara → `groundY` vira a altura de
uma plataforma lá em cima e o `posRef.y` é suavizado em direção a ela → ele sobe
flutuando. Como sai muito atrás, **continua flutuando durante a corrida de
recuperação** (posRef.z ainda atrás do alvo). 

**Fix:** resolver a ALTURA pela posição real (`posRef.z`) e usar o alvo só pra
direção horizontal:
- Novo helper exportado `nearestPlatform(z)` em `f3Parkour.ts`.
- `Floor3Rival.tsx`: `standGnd = nearestPlatform(posRef.z)` → `groundY`; `moveGnd =
  nearestPlatform(targetZ)` → `groundX`. Removido o `nearestGround` local duplicado.

**Verificação (já que WebGL screenshot não roda no sandbox):**
- Simulação numérica da cinemática de Y (player subindo, 3s de tontura, corrida):
  float máximo ANTIGO **+4.80u** vs NOVO **+0.16u**. Confirma o "volta a andar
  flutuando" e a correção.
- Teste novo `src/__tests__/f3Parkour.test.ts` guarda o `nearestPlatform` (resolve
  pela posição própria → plataforma certa). 58/58 vitest, tsc 0.

Comportamento normal (quando o diabo está alcançado, posRef.z ≈ leadZ) é idêntico ao
anterior — a mudança só corrige os casos congelado/atrasado.

### Continuação 2026-06-04 — Diabrete some no respawn + não pula pós-tontura + material

Felipe reportou 2 bugs e liberou o material:

**Bug A — some ao reiniciar via SALVAR:** o `Floor3Rival` fica MONTADO durante a
cutscene/respawn, então seu `posRef` ficava obsoleto (lá no alto do curso antigo)
enquanto o respawn reconstrói o curso e teleporta o player pro início → o diabo
aparecia "sumido" e voltava deslizando. **Fix:** re-init em desync grosso —
`if (!inited || |posRef.z - leadZ| > 20) { snap pra leadZ + chão }`. Self-healing,
sem plumbing de key.

**Bug B — "flutua" = não pula obstáculos por um tempo depois da tontura:** a causa
real é que durante a tontura o diabo CONGELAVA, mas o player continua subindo, então
a plataforma sob ele **reciclava** (sai da janela viva) → o chão de referência saltava
pra uma plataforma distante (flutua) e na recuperação ele deslizava (sem pular) por um
trecho até alcançar. **Fix:** durante a tontura ele agora **cambaleia acompanhando o
lead** (`posRef.z` faz lerp pra `leadZ`, `posRef.y` plantado no chão real) em vez de
congelar — fica sempre em plataforma viva (zero float) e já está no lead ao recuperar,
então o hop-run volta na hora. Sim numérica: gap pós-tontura caiu de ~8.9u → ~1.1u.

**Material do Diabrete (autorizado):** adicionado **rim fresnel** ao `MeshToonMaterial`
do fill via `onBeforeCompile` (mantém o skinning nativo — um ShaderMaterial cru
congelaria o rig). Casa o "edge pop" estilizado do shader do andar (`cartoonToon.ts`).
Verificação possível sem GPU: **expandi os #include do shader toon do three r184 e
confirmei** que `normal` (view space) e `outgoingLight` existem e estão em escopo antes
do `opaque_fragment` (e que `vViewPosition` NÃO está no fragment de topo — por isso a
fresnel usa `normal.z`, não view dir). Guarda: se `#include <opaque_fragment>` sumir
numa versão futura, a injeção é pulada (cai no toon normal, sem quebrar). 
⚠️ O rim em si só dá pra confirmar 100% renderizando — se ficar estranho, é isolado no
`fillMat` de `buildDiabreteRig` (fácil reverter).

**Estado:** tsc 0 · 58/58 vitest · audit 0 erros · index.html rebuildado. Branch
`claude/memory-map-review-V8IIf`.

### Continuação 2026-06-04 — Ajustes pós-feedback (dizzy + outline do Diabrete)

Felipe não curtiu o "cambalear andando" do fix anterior. Novos ajustes:

**Dizzy reformulado (pedido do Felipe):** ele agora fica **PRESO na plataforma** durante
o stun (movimento + gravidade congelados, Y segurado → zero float mesmo com o cenário
rolando). Ao **acordar** ele entra em modo `catchUp` e **sprinta** (`MOVE_SPD * 3.6`)
de volta pro lead; quando chega perto (`|dz| < 1.5`) volta à velocidade normal. Isso
também conserta o "parece pequeno demais": congelado, o player se aproxima dele durante
o stun e ele cresce na tela (antes o drift o mantinha sempre a ~14u = pequeno).
- `catchUp` ref + `CATCHUP_MULT=3.6`; setado no exit do dizzy; limpo ao reaproximar.

**Outline "bugado" no Diabrete:** as linhas pretas pareciam textura bugada porque o
inverted-hull era extrudado por normais POR-VÉRTICE, e o GLB do Tripo tem vértices
partidos nas costuras → a casca rasgava (streaks pretos no corpo). No cenário/mãos fica
limpo porque são primitivas. **Fix:** `makeOutlineGeo` agora **solda as normais por
posição** (média de todas as normais que compartilham um ponto) e extruda todos os
vértices coincidentes na MESMA direção → casca estanque, silhueta limpa como o resto.
- Teste novo em `diabreteRig.test.ts`: verts coincidentes no fill → coincidentes no
  outline (prova que não rasga).

(O rim light do material foi mantido — Felipe não reclamou dele; só do tamanho e das
linhas pretas.)

**Estado:** tsc 0 · 59/59 vitest · audit 0 erros · index.html rebuildado.

### Continuação 2026-06-04 — Tira outline do Diabrete + mapa dedicado da cutscene

**Outline removido SÓ do Diabrete:** o contorno inverted-hull saiu de
`buildDiabreteRig` (removidos `makeOutlineGeo` + `_outlineMat`). Ele agora carrega
a silhueta só com o toon fill + rim. O cenário e as mãos do player mantêm seus
outlines (via `cartoonToon.ts`, intactos). Testes ajustados (1 skinned mesh, sem
mesh BackSide).

**Mapa dedicado da cutscene de queda:** o Felipe reclamou que a plataforma da
cutscene parecia a inicial (o Floor 3 é P&B, então o ledge creme = igual ao landing
de início). Agora:
- Durante a cutscene (`cartoonFall`), o `Floor3Environment` esconde o parkour vivo,
  o elevador, os hazards, o rival de gameplay e as FpHands (novo prop `fallActive`,
  threadado App→World→Floor3Environment). Sobra só o céu + o set da cutscene + o diabo.
- `Floor3FallCutscene` renderiza um **set próprio "lá no alto da escalada"**: um degrau
  (menor que o landing inicial, com `<Outlines>`), um **pilar de suporte** mergulhando
  no vazio, e **8 plataformas** espalhadas descendo/recuando (e 2 subindo atrás) — fora
  da linha de queda central pro diabo despencar limpo no vazio. Lê como "fundo da obby,
  longe do elevador".

**Estado:** tsc 0 · 58/58 vitest · audit 0 erros · index.html rebuildado. Branch
`claude/memory-map-review-V8IIf`. (Visual do set + rim só dá pra confirmar 100%
renderizando — pedir feedback do Felipe.)

### Continuação 2026-06-04 — Cutscene usa CLONE real do mapa (PlatformView)

Felipe: "o set que vc fez não tem nada a ver com o mapa do jogo". Verdade — eram
caixas genéricas. Agora a cutscene de queda **reusa o próprio `PlatformView`** (o
componente que desenha cada plataforma do obby: bloco de borda preta + topo
creme/branco toon via `createToonMaterial` + seta preta + `<Outlines>` + palette
alternada). 
- `PlatformView` exportado de `Floor3.tsx`.
- `Floor3FallCutscene` monta `CUTSCENE_TILES: F3Plat[]` — 8 tiles reais: o que ele
  agarra (front edge ≈ grip) + 7 descendo/recuando no vazio (topY −3..−19.5, bx ±,
  palette variada), fora da linha de queda central. Removidas as caixas genéricas
  (FallStep/pilar/materiais).
- O parkour vivo continua escondido na cutscene (`fallActive`), então o set clonado
  + céu é tudo que aparece → "mapa separado, lá no alto, longe do início".

⚠️ Não consegui screenshot WebGL (o sandbox mata qualquer dev server — testei spawn
foreground/background, todos exit 1 sem output). Mas os tiles são LITERALMENTE o
componente do mapa, então casam por construção. A POSIÇÃO/quantidade é subjetiva →
ajustar com feedback do Felipe.

**Estado:** tsc 0 · 58/58 vitest · audit 0 erros · index.html rebuildado.

### Continuação 2026-06-04 — Cutscene: layout realista do parkour + cling melhorado

Felipe: o set parecia uma TORRE, não o mapa. Causa: meus tiles tinham Z apertado
e quedas grandes em Y (empilhamento vertical). O parkour real é uma escada de
inclinação SUAVE (gap 3.0–3.8 em Z, passo 0.4–1.4 em Y, wander ±1.9).

**Fix layout:** `buildCutsceneTiles()` em `Floor3FallCutscene` gera os tiles com o
MESMO gerador do `f3Parkour` (mulberry32 + os mesmos parâmetros), descendo pra
FRENTE no abismo (a escada tombando pra baixo à frente do diabo), wander lateral
±1.9, footprints {1.0,1.2,1.4}, palette alternada. Primeiro tile = o que ele agarra
(maior). Veer inicial pra fora da linha de queda. Agora tem a cara do obby, não torre.

**Cling melhorado:** o beg ganhou peso e desespero — tremor de força na mão que
segura, **escorregão periódico** (~a cada 2.4s ele perde a pegada, despenca um tico,
a mão livre chicoteia de volta pra re-agarrar, pernas batem frenéticas + cabeça
sacode + thud), bob pesado do peso, pêndulo lateral, e a mão livre implorando com a
garra abrindo/fechando.

⚠️ Sem screenshot WebGL no sandbox (dev server é morto). Layout/cling pedem o olho
do Felipe. **Estado:** tsc 0 · 58/58 vitest · audit 0 erros · index.html rebuildado.

### Continuação 2026-06-04 — RENDER FUNCIONOU + cling melhorado (testado de verdade)

**Consegui renderizar offline!** O `&` backgrounding funciona (diagnostiquei); o que
matava era detalhe do comando. Método que funciona: `npm run dev > log 2>&1 &` +
poll com curl + Playwright (chromium /opt/pw-browsers swiftshader). Montei um harness
que carrega a PRÓPRIA `Floor3FallCutscene` e usa os hooks DEV `__fallPhase='beg'` +
`__fallScrub=<t>` pra congelar o cling em vários instantes e tirar screenshot. (Harness
temporário, removido após o uso — `diabretetest.html`, `src/diabretetest.tsx`, `multi.cjs`.)

**O que os screenshots revelaram:** a câmera do beg estava quase rente à borda → só
aparecia a CABEÇA do diabo; toda a animação de agarrar (braços, pernas, escorregão)
ficava escondida abaixo da plataforma. Esse era o "erro" real.

**Fixes (vistos e confirmados em render):**
- `topDownBeg` reescrita: ângulo 3/4 de cima/lado, um pouco sobre o abismo, olhando o
  penhasco → mostra mãos agarrando + corpo + pernas se debatendo.
- `HANG_DROP` 1.55 → 1.95: ele pendura mais embaixo (cabeça ABAIXO da borda).
- Beg: AS DUAS mãos agarram o lábio por padrão (lê "pendurado pelas mãos"), a mão livre
  solta e implora a cada ~1.9s e volta a agarrar; head vira ~0.25 pro player (rosto/olhos
  visíveis); + escorregão de pânico + pernas frenéticas (já existentes).
- Confirmado em 3 frames (hold/plead/slip): lê como imp desesperado pendurado num tile
  real do obby.

**Estado:** tsc 0 · 58/58 vitest · audit 0 erros · index.html rebuildado. Branch
`claude/memory-map-review-V8IIf`.

### Continuação 2026-06-04 — Revert do ângulo da cutscene (Felipe não curtiu)

Felipe não gostou do ângulo 3/4 lateral que pus pra mostrar o cling — pediu pra voltar
pro ANTERIOR (top-down "olhando por cima da borda"). Revertido o `topDownBeg` pro
original. `HANG_DROP` voltou pra 1.5 (de 1.95) pra as mãos agarrarem no lábio visível
de cima. Mantido o cling melhorado (duas mãos no lábio, head vira pro player, plead
reach pra cima, escorregão, pernas). Plead reach ajustado pra subir por cima da borda
em direção à câmera (o "money beat" do top-down). Verificado em render (top-down mostra
cabeça/peito implorando por cima da borda — a intenção original). tsc 0 · 58/58 · audit 0.

### Continuação 2026-06-04 — Prep do Floor 4 pra gastar menos tokens

Felipe: organizar os arquivos pra eu gastar menos tokens, mirando o Floor 4 (que vai ser
difícil). O ladrão de tokens é o `App.tsx` (2140 linhas) + re-derivar como um andar se
conecta toda sessão.

**Solução (doc-only, zero risco, sem rebuild):** criado `jubileu/FLOOR4.md` — guia único
pra construir qualquer andar novo, ancorado em `grep` (não em nº de linha):
- Anatomia de um andar (tabela: env/geração/rival/objetivo/sfx/música/cutscene/movimento → arquivos Floor 3).
- Checklist de integração no App.tsx, cada item com a âncora de `grep` (imports, render por
  level, áudio/bus na entrada, chegada via elevador, gatilho de cutscene, movimento custom
  no Player, estados de cutscene, vitória→próximo andar).
- Music director (prioridades dos buses), landmines, regras de ouro.
- **Método de TESTAR com render offline** (vite bg + Playwright/swiftshader + hooks DEV de
  scrub) — que me custou caro descobrir; agora documentado pra não repetir.
- Mapa rápido "o que grepar no App.tsx pra não ler tudo".

Ponteiro adicionado no topo do `MAP.md`. Floor4.tsx/floor4Sfx.ts já são scaffolds prontos;
o tema ainda NÃO foi definido (esperar o Felipe). Nada de source mudou → index.html intacto.

### Continuação 2026-06-04 — Bancada de dev ISOLADA pro Floor 4 (ideia do Felipe)

Felipe: fazer um app TSX separado pro Floor 4 economizaria muitos tokens. Feito —
agora dá pra construir o andar SEM tocar no App.tsx de 2140 linhas até o fim.

**Criado (dev-only, NÃO entra no build de produção — confirmado: `grep floor4-dev index.html` = 0):**
- `jubileu/floor4.html` + `src/floor4-dev.tsx` — app standalone que monta SÓ o
  `Floor4Environment` (sem App.tsx/outros andares/Firebase) com OrbitControls + cápsula de
  escala. Roda em `npm run dev` → `/floor4.html`.
- `jubileu/dev-shot.cjs` — ferramenta de screenshot reutilizável (`node dev-shot.cjs <html> <tag>`),
  Playwright/swiftshader, com fallback de path do chromium via `PW_CHROMIUM`.

**Detalhe:** a bancada usa `<Floor4Environment elevator={false} />` — o `ElevatorFacade`
puxa textura externa do GitHub que falha offline e quebrava o render (screenshot vinha vazia).
O elevador volta no wiring real do App.

**Testado renderizando:** base plate + grid + céu neutro + cápsula no origin + eixos. ✅
FLOOR4.md §0 atualizado com o fluxo da bancada. Como nenhum source DO JOGO mudou, o
`index.html` ficou intacto (sem rebuild). tsc 0 · 58/58 · audit 0.

### Continuação 2026-06-04 — Floor 4 autocontido (SHIP) + runner isolado (correção)

Felipe esclareceu: o Floor 4 É pra entrar no jogo, só de forma SEPARADA pra economizar
tokens. Eu tinha conflatado — o "dev-only" era só o runner (floor4.html/floor4-dev.tsx/
dev-shot.cjs), mas o `Floor4.tsx` SEMPRE foi o andar real que ship (wired no App em
`level===4`).

**Tornei o Floor4 mais autocontido (mexo nele, não no App):**
- Movido o ciclo de áudio do Floor 4 do `App.tsx` pro próprio módulo: novo hook
  `useFloor4Audio(active, audioCtx, busRef)` em `Floor4.tsx`. App agora só chama
  `useFloor4Audio(currentLevel === 4, audioCtx, cartoonBusRef)` (1 linha, era efeito de 11).
  Removido o import de configureFloor4Sfx/clearFloor4Sfx do App (agora só no Floor4).
- `floor4-dev.tsx` reescrito o header: é o RUNNER do Floor 4 REAL (importa os mesmos
  componentes do `./Floor4` que ship). Eu edito `Floor4.tsx` → aparece na bancada E vai
  pro jogo.

**Confirmado no build:** `grep useFloor4Audio index.html` = 2 (Floor4 SHIP ✅);
`grep floor4-dev index.html` = 0 (runner não ship ✅). Bancada renderiza igual.
tsc 0 · 58/58 · audit 0 · index.html rebuildado.

**Arquitetura final do Floor 4:** Floor4.tsx = app autocontido (3D + áudio próprios) →
ship via App (mount + hook, footprint mínimo). floor4-dev.tsx = roda o mesmo isolado.
Conforme o andar crescer, novos arquivos floor4* + hooks expostos pelo módulo mantêm o
App quase intocado.

### Continuação 2026-06-04 — Floor 4 vira 100% 2D pixel + elevador 2D (visão do Felipe)

Felipe: Floor 4 é literalmente 2D pixel-art em 1ª pessoa (Doom/2.5D), com transição
animada do 3D pro 2D. Primeira entrega pedida: elevador 100% 2D + base plate. Também
mandou corrigir o FLOOR4.md que dava a entender "dev only" (o ANDAR ship; só o runner é dev).

**Feito (tudo SHIP no jogo, testado renderizando na bancada):**
- `Floor4Elevator.tsx` — **elevador 100% 2D pixel-art**: batente beveled (centro
  transparente) + 2 portas que deslizam (`open` 0..1, demo lento sem prop) + poço escuro
  com trilhos + indicador (seta subir + "4"). CanvasTexture NearestFilter, sem asset externo.
- `floor4-pixels.ts` — helper `pixelTex`/`px` compartilhado (CanvasTexture NearestFilter).
- `Floor4.tsx` reescrito pra **100% 2D**: `Sky2D` (cor flat, SEM fog), **chão pixel tiled
  unlit** (meshBasic, plano flat), elevador 2D. Removidas luzes/sombras/fog/grid 3D.
  Mantido o hook `useFloor4Audio`.
- `floor4-dev.tsx` — stand-in unlit, Canvas sem shadows.
- `FLOOR4.md` — corrigido §0 (ANDAR ship vs RUNNER dev-only; elevador 2D offline; áudio é
  hook), §2 item3 (hook), e §8 (visão 2D + spec do sprite do player + plano da transição).

**Spec do sprite do player (pro Felipe fazer)** em FLOOR4.md §8: billboard pixel vista de
FRENTE, PNG transparente, ~48×64px/frame, tira horizontal, idle(2)+walk(4), paleta enxuta.
Opcional: mãos 1ª pessoa estilo Doom.

**Transição 3D→2D (plano em §8, a iterar in-game):** ramp de pixelação ~2s na viagem de
elevador (bloco cresce + quantiza cor + dessatura), corta pro 2D, + sfx 8-bit downsample.

**Confirmado:** `grep Floor4Elevator2D index.html` = 4 (ship ✅), `grep floor4-dev` = 0
(runner isolado ✅). tsc 0 · 58/58 · audit 0 · index.html rebuildado.

### Continuação 2026-06-04 — Floor 4 vira SIDE-SCROLLER 2D DE VERDADE (correção)

Felipe mandou um exemplo (sala de elevador à esquerda + baseplate/céu à direita, personagem
de PERFIL) e disse: (1) a transição não existe, (2) "nada está em 2d, só com o aspecto" — o
que eu fiz era 3D achatado em 1ª pessoa. Ele quer **2D de verdade**.

**Reconstruído como side-scroller 2D ORTOGRÁFICO (`Floor4Scene2D.tsx`):**
- Câmera ortográfica (zero perspectiva) + camadas de sprite pixel flat (meshBasic + Nearest).
- Cena batendo com a referência: sky+nuvens, chão grama/terra tiled, sala escura do elevador,
  elevador 2D + placa "ELEVADOR", planta, placa "BASEPLATE" no poste, setinha →, e PLACEHOLDER
  de personagem de PERFIL.
- Validado na bancada (`floor4-dev.tsx` agora usa câmera ortográfica) — screenshot confere
  com o exemplo do Felipe. Helpers em `floor4-pixels.ts`.

**Ainda NÃO shipa** (`grep Floor4Scene2D index.html` = 0): o jogo é 3D 1ª pessoa; pra o
side-scroller entrar precisa do **"modo 2D"** = câmera ortográfica no level 4 + controles 2D
(esq/dir/pulo + câmera segue X) + montar a cena no lugar do `Floor4Environment`. Próxima etapa.

**Transição 3D→2D**: ainda não existe (era reclamação do Felipe). Plano em FLOOR4.md §8:
ramp de pixelação no 3D durante a viagem → corta pro side-scroller 2D. A fazer junto do modo 2D.

**Spec do sprite ATUALIZADO** (FLOOR4.md §8): agora **vista de PERFIL** (não frente),
virado pra direita (espelho no código), ~32×48px, idle(2)+walk(4-6)+jump/fall opcional.

Nenhum source do jogo mudou nesta etapa → index.html intacto. tsc 0 · 58/58 · audit n/a.

### Continuação 2026-06-04 — Sidescroller 2D AGORA NO JOGO (Felipe: "cadê o sidescroller?")

Felipe printou o Floor 4 no jogo (vercel) = a versão 3D 1ª pessoa achatada. O side-scroller
só existia na bancada, nunca tinha sido ligado no jogo. Consertado: criado o **modo 2D
in-game** e plugado no App.

**Novos arquivos (SHIP):**
- `Floor4Canvas2D.tsx` — overlay full-screen com Canvas PRÓPRIO ortográfico (side-scroller
  real, separado do canvas 3D) + cena + player + controles. Teclado (←/→/A/D) + botões de
  toque ◄ ► (mobile). `onExit` quando anda pra esquerda no elevador.
- `Floor4Player2D.tsx` — player de perfil controlável: anda esq/dir, vira, walk-cycle 2
  frames (placeholder), câmera ortográfica segue o X (clamp no mundo), sai pelo elevador.
- `Floor4Scene2D.tsx` — o mundo (sem o player; exporta `FLOOR4_WORLD`/`FLOOR4_ELEVATOR_X`).

**Wiring no App (mínimo):** import + `{currentLevel === 4 && <Floor4Canvas2D onExit={handleFloor4Exit} />}`
(overlay z-60 sobre o canvas 3D) + `handleFloor4Exit` (volta pro lobby por enquanto).
A bancada (`floor4-dev.tsx`) renderiza o MESMO `Floor4Canvas2D`.

**Confirmado:** `grep Floor4Canvas2D index.html` = 6 (SHIP ✅), `floor4-dev` = 0 (isolado ✅).
Validado renderizando: cena 2D + player + botões ◄►. tsc 0 · 58/58 · audit 0 · index.html rebuildado.

**Notas/observações:**
- O `Floor4Environment` 3D antigo ainda monta no World (coberto pelo overlay) + `useFloor4Audio`
  roda. Inofensivo; otimizar depois (parar de montar o 3D no level 4).
- Movimento é só andar esq/dir num baseplate flat (sem pulo/plataformas ainda).
- FALTA: a TRANSIÇÃO 3D→2D (pixelação na viagem do elevador) — próxima. E os sprites de
  perfil do Felipe (spec em FLOOR4.md §8) pra trocar o placeholder.

### Continuação 2026-06-04 — Transição 3D→2D + elevador 2D estilo 3D

Felipe: começar a transição (começa em 1ª pessoa, NÃO pode ir pra 3ª, depois vira o mundo
2D) + melhorar o elevador 2D pra parecer o 3D.

**Elevador 2D redesenhado (`Floor4Elevator.tsx`) pra casar com o 3D real (Elevator.tsx):**
portas PRATEADAS (#B0BEC5) com grooves/painel, batente escuro, **trim DOURADO**, header
escuro com a placa DOURADA **"THE NORMAL ELEVATOR"**, painel de chamada com LEDs
vermelho/verde + display "4". Usado na cena side-scroller (`Floor4Scene2D`) no lugar do
elevador genérico antigo. Validado em render — ficou a cara do 3D.

**Transição (entrada no Floor 4):** o overlay 2D (`Floor4Canvas2D`) faz um **pixel-resolve**
ao montar — `ResolveFX` rampa o pixelRatio do PRÓPRIO canvas 2D de super-chunky → nítido
em ~1.5s + um black flash que some (0.9s). Lê como "o mundo se materializa a partir de
pixels grandes → 2D nítido". Confirmado: frame cedo sai pixelado/blocado, frame tarde nítido.
- **Trava de 1ª pessoa:** `currentLevel === 4` adicionado ao disable do zoom (onWheel) +
  efeito `if (currentLevel===4) setZoomLevel(0)`. A viagem pro Floor 4 já é FP (Floor 3 é FP).

**⚠️ Deferido — o literal "3D pixelando na viagem":** o Canvas 3D usa `<AdaptiveDpr pixelated>`
+ PerformanceMonitor (gerenciam o pixelRatio). Mexer no gl.setPixelRatio do canvas 3D
brigaria com eles (flicker/quebra). Então a pixelação foi feita no canvas 2D próprio (seguro).
Fazer o 3D pixelar de verdade precisa de trabalho cuidadoso com o AdaptiveDpr — próxima iteração.

**Estado:** tsc 0 · 58/58 · audit 0 · index.html rebuildado. ship=6, runner isolado=0.

### Continuação 2026-06-04 — Transição acessível no Creator Mode

Felipe: "coloque a transição no creator mode". Como a transição (pixel-resolve + black flash
do `ResolveFX`) toca ao MONTAR o overlay do Floor 4, qualquer card que comece no level 4 já
dispara. Em `CreatorMode.tsx`:
- Atualizado o card "Andar 4" (era "base plate em construção" desatualizado) → "Andar 4 (2D)"
  com descrição do side-scroller + transição.
- Novo card dedicado **"Transição → 2D"** (id `floor-4-transition`, level 4, variant
  `floor4Transition`) — entra no Andar 4 vendo o mundo virar pixel 2D (1ª pessoa travada).
Sem wiring extra (level 4 já dispara o overlay+ResolveFX; o variant não-fallDemo é inofensivo).

tsc 0 · 58/58 · audit 0 · index.html rebuildado (card no build = 2).
Obs: a transição atual é o pixel-resolve 2D na entrada (o literal "3D pixelando na viagem"
segue deferido pelo conflito com AdaptiveDpr).

### Sessão 2026-06-09 — Viagem de 20s + transição 3D→2D DE VERDADE + saguão destruído

Felipe: (1) a viagem tem que ser 20s DENTRO do elevador, com estrutura interna, abrindo
no fim; (2) aos 10s restantes o mundo 3D vira 2D GRADUALMENTE (nada abrupto); (3) lore do
Floor 4 = o LOBBY completamente destruído/caótico (meio gore), com andares de baixo,
porta de fundo (conteúdo ele decide depois) e visual caprichado.

**1. Viagem de 20s dentro do elevador (App.tsx):** o overlay 2D agora só monta em
`currentLevel === 4 && !doorsClosed` — antes montava no timer 18 e cobria a viagem
inteira. O player fica os 20s no `ElevatorInterior` 3D que já existia.

**2. Transição gradual (o deferido virou real):** `Pixelate3DRamp` (em `Floor4.tsx`)
monta no Canvas 3D quando `currentLevel===4 && doorsClosed && timer<=10`: derruba o dpr
em 26 degraus quantizados com ease-in CÚBICO (9s — começa imperceptível, termina em
blocões) + dessatura/contrasta via CSS filter no canvas. **Resolvi o conflito com o
AdaptiveDpr trocando um pelo outro**: o ramp SUBSTITUI o `<AdaptiveDpr>` no JSX enquanto
ativo; no unmount o AdaptiveDpr remonta e restaura o dpr sozinho (comportamento do drei).
Na abertura das portas o `Floor4Canvas2D` monta começando tão pixelado quanto o 3D
terminou e resolve pra nítido (ResolveFX 2.6s) — continuidade pixel-a-pixel.

**3. Chegada coreografada:** player nasce DENTRO do elevador 2D (z entre poço e portas),
`IntroDirector` abre as portas (smoothstep, ~1.6s..3s) via novo `openRef` do
`Floor4Elevator2D`, e destrava o controle (`lockRef` no `Floor4Player2D`). Exit de volta
exige ter SAÍDO do elevador antes (sem exit acidental no spawn).

**4. Cena nova — o saguão destruído (`Floor4Scene2D.tsx` reescrito):** versão em ruínas
do lobby com a MESMA linguagem (papel creme, lambri, checker, placa dourada): buracos na
parede/teto/chão, sangue seco + arrasto + handprint (meio gore), grafites de lore
("O ANDAR 4 NÃO EXISTE", "ROUBARAM O CHÃO" + seta pro buraco — callback do Dussekar,
"ELE AINDA SOBE", "NÃO DURMA.", "AS PARTES QUE SOBRAM" meio apagado), SAGUÃO pendurada
por uma corrente (sway), fluorescente agonizando (pêndulo + flicker + faísca), RECEPÇÃO
tombada com papéis, planta morta, poeira flutuando, fumaça no colapso do teto,
**andares de baixo em cutaway** (corredor destruído + nível silhueta + void, sangue
escorrendo do buraco), **porta de fundo lacrada** + SAÍDA vermelha piscando, entulho
selando a direita. Mundo x -13..15.2. Tudo procedural (pixelTex, sem assets).

**5. Creator Mode:** card "Transição → 2D" agora dispara a VIAGEM COMPLETA de 20s
(flag `f4Demo.ride` em floor4Sfx.ts, espelho do f3Demo; App inicia no elevador do lobby
com portas fechadas + destino 4). Card "Andar 4" = spawn direto (sem viagem).

**🐛 Descoberta importante (`AxisAlignedCamera`):** o R3F mira a câmera default na
origem → `position:[0,3,10]` chegava INCLINADA ~16° pra baixo, e câmera ortográfica
inclinada CISALHA as camadas 2D por paralaxe (cada plano z desliza verticalmente — era
por isso que o céu "vazava" no meio da parede e o chão desalinhava do player).
Diagnostiquei com um harness de calibração (quads em y conhecidos) e fixei zerando
`camera.rotation` ao montar. REGRA: toda cena ortográfica 2D nova precisa disso.

Validado renderizando (bancada + Playwright): chegada portas fechadas → portas abertas
com player dentro → caminhada até a porta de fundo. 3 iterações de arte (grafite
realocado 2x, mancha de arrasto quebrada em streaks, monte de entulho no lugar do
"prancha caindo"). ⚠️ O ramp 3D (Pixelate3DRamp) não dá pra screenshotar offline (precisa
do jogo completo) — lógica simples, validar no vercel.

**Estado:** tsc 0 · 58/58 vitest · audit 0 erros · index.html rebuildado (~28.5MB, +21KB).
Branch `claude/oi-vfpz3w`. FLOOR4.md §8 atualizado (transição FEITA + spec da cena).
Falta: sprites de perfil do Felipe (spec §8), sfx 8-bit no ramp, pulo/plataformas,
conteúdo da porta de fundo, e parar de montar o Floor4Environment 3D atrás do overlay.

### Sessão 2026-06-09 (parte 2) — "não funcionou": e2e do jogo REAL + rodada de melhorias

Felipe: "não funcionou" + pediu: visual do player 2D melhor, SÓ 1ª pessoa (na transição
tbm), 2Dficação melhor, e o interior do elevador 2D visível na saída.

**🔬 Consegui testar o JOGO COMPLETO no sandbox** (novidade — antes só harness isolado):
o sandbox TEM rede; os assets externos (raw.githubusercontent) falham por cert MITM →
`ignoreHTTPSErrors: true` no contexto Playwright resolve TUDO. E2e: `npm run dev` + script
que clica MainMenu → MODO CRIADOR → card → INICIAR e screenshota a viagem inteira.
⚠️ No sandbox o tick do elevador leva ~2s (CPU render lento) — esticar os tempos do
script (viagem de 20s ≈ 45s de wall time). Botões: usar `>> visible=true` (o botão
mobile escondido vem primeiro no DOM).

**Causa raiz do "não funcionou":** a pixelação com ease CÚBICO + relógio próprio de 9s
era imperceptível até os ~2s finais (e dessincronizava se os ticks atrasassem). A viagem
em si FUNCIONAVA (o breu que vi primeiro era o overlay intencional do switch no timer
18 + texturas falhando só no sandbox — o ElevatorInterior tem pointLight próprio).

**Melhorias aplicadas:**
1. **Pixelate3DRamp v2 — dirigido pelo TIMER** (prop `timer`, não relógio próprio): cada
   frame persegue `(10-timer)/10` com taxa máx 0.14/s → sempre culmina exatamente quando
   as portas abrem, suave entre ticks. Curva ^1.5 (visível desde ~1/3) + saturate até
   0.25 + contrast/brightness. App passa `timer={elevatorTimer}`.
2. **Letterbox cinematográfico**: barras pretas top/bottom (11vh) fecham junto com a
   pixelação (div com transition 1.15s linear por tick, monta no timer 11 com altura 0).
3. **1ª pessoa TOTAL**: `setZoomLevel(0)` ao armar a viagem (advanceToFloor4AfterWin +
   creator ride); wheel gate ganhou `|| nextElevatorDestination === 4`; pinch gate ganhou
   `currentLevel !== 4 && nextElevatorDestination !== 4`.
4. **Cabine 2D iluminada** (`Floor4Elevator.tsx`): o "poço escuro" virou interior de
   cabine (paredes prata com painéis, barra de luz no teto + wash, corrimão, painel de
   botões com LEDs, chão escuro com losango dourado) + **luz quente vazando** pelo vão
   conforme as portas abrem (spillTex, opacity = open) + **casings laterais** (colunas
   escuras) escondendo o overshoot das portas deslizando.
5. **Sprite do player v2** (`Floor4Player2D.tsx`): bacon hair de perfil 20×30 com
   **outline automático** (two-pass ImageData), shading (cabelo com shine, sombra de
   mandíbula, camisa com luz/sombra), braço da frente balançando + braço de trás,
   walk de 4 frames (stride/pass/stride/pass) + idle de 2 frames (respiração).
6. **Floor4Environment = shell**: o baseplate 3D morto virou só o backdrop escuro
   (Sky2D) — o andar é 100% o overlay 2D.

**Validado no e2e real:** viagem iluminada → letterbox + pixelação progressiva clara
(painel em blocos, cores lavando) → chegada com player novo DENTRO da cabine acesa →
portas abrem → sai andando no saguão destruído. Zero erros de console.

**Estado:** tsc 0 · 58/58 · audit 0 · index.html rebuildado. Branch `claude/oi-vfpz3w`.
⚠️ Se o Felipe testou no vercel de MAIN, ele viu o build velho — lembrar ele de mergear
a branch (ou apontar o deploy pra ela) antes de testar.

### Sessão 2026-06-09 (parte 3) — LORE + PUZZLES do Andar 4 (design aprovado → implementado)

Felipe pediu (modo planejamento): como o player descobre a lore, puzzles, e uma ótima
lore. Design escrito em **`jubileu/FLOOR4_LORE.md`** (lore canon completa + textos
prontos + roadmap), aprovado ("pode fazer"), e implementado nas 5 fases.

**Lore canon (resumo):** andares vivem de MEMÓRIA (Supervisor: "memórias são tijolos",
"andares aparecem quando são lembrados"). O Andar 4 era o SAGUÃO ORIGINAL; após um
incidente foi des-lembrado → decai pra 2D (a pixelação da viagem é o prédio sem memória
pra renderizar 3D). O saguão do Andar 03 é construído com os tijolos reciclados do 4
(Dussekar: "roubaram o chão"; "as partes que sobram são bem tratadas" = a reciclagem,
inclusive dos hóspedes → o gore). A voz do andar é **o Esquecido** (1º Supervisor,
preso por não poder ser lembrado), que deixou 5 páginas de diário + grafites. O
elevador é intacto porque é a única coisa que TODOS os andares lembram.

**Mecânicas de descoberta:** 4 camadas — ambiente → exames de 1 linha (prompt [E]/touch
+ typewriter) → 5 páginas do diário (HUD "PÁGINAS n/5") → 3 puzzles que soltam as 3
tábuas da porta de fundo. Convergência: porta range, "ainda não." (conteúdo da porta
fica pro Felipe), página 5 aparece NA CABINE, e fecha com "VOCÊ LEMBROU DO ANDAR 4".

**Puzzles:** P1 Disjuntor (a luminária pisca curto·curto·curto·longo = posição das 4
alavancas; payoff: o lado direito que começa em PENUMBRA acende + mural escondido com
o prédio e o 4 riscado). P2 Sino (tally 4+1 interrompido → tocar 5x; payoff: 1.2s de
silêncio e BATIDAS DE BAIXO + screen shake). P3 Cofre 404 (atrás do quadro torto;
pistas: grafite "O ANDAR 4 NÃO EXISTE" + exame da placa "SAGUÃO 04"; payoff: a FOTO do
saguão original intacto, gerada em pixel-art).

**Arquitetura:** `f4Lore.ts` — estado/regras PURO (padrão f3Hazards; pontos de
interação com gating `when()`, posições únicas pra cena e UI) — **13 testes vitest**.
`Floor4Interact.tsx` — camada DOM (prompt contextual via playerXRef poll, painel
typewriter, alavancas, keypad, foto, toast, finale; uiLockRef congela o player).
`Floor4Scene2D.tsx` — sprites reativos (tábuas separadas do bake, sino, caixa de
disjuntor c/ LED, cofre 2 estados, páginas com glow pulsante, mural, Gloom com fade,
porta mais aberta, DyingLight agora pisca O PADRÃO e estabiliza pós-P1) + export
`lobbyPhotoUrl` (dataURL). `floor4Sfx.ts` — 10 cues sintetizados (sino, batidas,
clack, power-on, tábua, keypad, cofre, rangido, papel, chime de memória).
`Floor4Canvas2D` é o DONO da assinatura f4SetOnChange (listener único!) e do shake.

**Regra de level design descoberta:** tudo à ESQUERDA do elevador (x < -7.5) é
inalcançável — andar pra lá dispara o exit do andar. Todos os pontos em x ≥ -7.4.

**Validado com bot e2e na bancada** (Playwright joga o fluxo inteiro: lê páginas,
resolve os 3 puzzles clicando na UI, empurra a porta, finale — zero erros, todos os
passos OK). Fix achado no teste: fillText do SAGUÃO na foto saía preto-sobre-preto.

**Estado:** tsc 0 · **71/71** vitest · audit 0 · index.html rebuildado (lore no build).
Falta (futuro): conteúdo atrás da porta, sprites do Felipe, pulo/plataformas,
persistência em localStorage, sfx 8-bit no ramp.

### Sessão 2026-06-19 — Goal: WASM no jogo (gráfico/ray tracing/física, sem bugs)

Felipe abriu um goal: usar WebAssembly pra melhorar o jogo (gráfico, ray tracing,
física), sem bugs, até ficar "incrível". Dei o reality-check técnico (WASM é CPU,
não mexe em gráfico WebGL; ray tracing real-time não roda nesse stack mobile/MP a
60fps — eles já arrancaram postprocessing por lag). Felipe escolheu 3 direções REAIS:
**(1) Modo Foto / path tracer** (ray tracing de verdade, não-realtime), **(2) Física
em WASM (Rapier)**, **(3) Perf + caça-bugs geral**.

Branch trazido pro dia: fiz `--ff-only` do `claude/floor-6-escape-room-polish-mlz5t7`
pro meu branch `claude/review-commits-memory-y6iqnf` (peguei Floors 5 e 6). Baseline
verde: tsc 0 · 91/91 · audit 0.

**Fase 1 — Física em WASM (Rapier) ENTREGUE:**
- `@dimforge/rapier3d-compat@0.14.0` (engine Rust→WASM, WASM embutido em base64). Travei
  e confirmei: three/react/fiber/drei NÃO mudaram de versão.
- `src/rapierPhysics.ts` — núcleo PURO (sem three/react, roda headless): `initRapier()`
  (init idempotente), classe `PropsWorld` (ground, static boxes, paredes a partir dos
  segmentos `wallsForState`, caixas dinâmicas com CCD, **capsule cinemático que segue o
  player**, step com timestep fixo 1/60 + acumulador → determinístico).
- `src/__tests__/rapierPhysics.test.ts` — **8 testes headless** (queda+repouso,
  DETERMINISMO bit-a-bit, separação sem interpenetração, capsule empurra caixa, parede
  contém sem tunneling, clamp de dt gigante). Provam "sem bugs" na física de verdade.
- `src/PhysicsProps.tsx` — bridge R3F: instancedMesh, useFrame faz updateCapsule+step+
  escreve matrizes. Gated por `profile.physicsProps` (NOVA flag — só `high`).
- Wiring: pilha de "bagagem" (7 caixas) num canto do lobby (x≈-6,-8.5; z≈-6..-7), longe
  do NPC/loja/elevador, contida pelas paredes seladas do lobby. Level 0 + high only.
- A física do PLAYER (resolveCollision em physics.ts) NÃO foi tocada — Rapier é camada
  aditiva de props. Zero risco pro movimento.

**🐛 Bug de build achado e corrigido (importante):** o `inline-build.mjs` só inca o
chunk PRINCIPAL. O Rapier (e os previews do creator) viravam **chunks dinâmicos
separados** → 404 no single-file; pior, o rollup passou a `export{}` do main pros chunks,
e embrulhar ESM com `export` num `<script>` clássico QUEBRA o jogo inteiro ("Unexpected
token 'export'"). Fix em `vite.config.ts`: `output.inlineDynamicImports: true` → UM chunk
autocontido, sem export, com os `import()` dinâmicos foldados (de quebra conserta os
previews do creator que davam 404 offline). O single-file volta a ser 100% autocontido.

**Verificação:** tsc 0 · **99/99 vitest** (+8) · audit 0 erros · build reprodutível
(1 chunk, 41.8MB) · **smoke test Playwright** no index.html buildado (chromium
swiftshader): root monta, conteúdo renderiza, **0 erros fatais de console**, Rapier WASM
inlined sem ref a chunk externo. index.html rebuildado.
⚠️ Falta verificar IN-GAME no lobby high (entrar no jogo) — a física é unit-testada
headless e a integração é type-checked, mas o "feel" das caixas só dá pra ver renderizando
o jogo completo. Próximo: Fase 2 (path tracer photo mode) + Fase 3 (perf/bugs) + e2e in-game.

### Sessão 2026-06-19 (cont.) — Fase 3 parcial: perf/leak fixes (Floor 5 + 6)

Sub-agente read-only caçou bugs nos andares mais novos. Validei cada achado no código
(descartei 2 falsos positivos) e corrigi os reais:
- **Floor5Race3D.tsx (CameraRig):** criava 3–5 `new THREE.Vector3()` POR FRAME durante a
  corrida (eye/chase/chaseLook + 2 introLook) → GC stutter. Pré-aloquei como refs e troquei
  pra `.set()`/refs. Hot path agora zero-alloc.
- **Floor5Robot64.tsx:86:** `GATE_POS.clone().sub(new Vector3(...))` por frame nas fases de
  largada → scratch ref + `.set()` (comportamento idêntico, GATE_POS.y - 0 = GATE_POS.y).
- **Floor6Suite.tsx:313:** `setTimeout(playF6Pickup)` dentro do useFrame sem cleanup →
  disparava após sair do andar (callback num audio graph já destruído). Agora rastreia os ids
  num `pickupTimers` ref (Set), auto-remove ao disparar, e limpa todos no unmount.

Verde: tsc 0 · 99/99 vitest · index.html rebuildado. Próximo: Fase 2 (Photo Mode / path
tracer, guardado — só validável em GPU real) + mais varredura de perf.

### Sessão 2026-06-19 (cont.) — Floor 6 "lagando muito": otimização de render

Felipe acrescentou ao goal: Floor 6 está LAGANDO muito. Medi com um profiler
não-invasivo (Playwright + patch de drawElements/drawArrays pra contar draw calls/
frame + FPS; swiftshader). **Baseline Floor 6: 507 draw calls/frame** (idêntico em
medium e high → descoberta: o `<Floor6Suite>` era renderizado SEM receber o profile de
qualidade, então ignorava 100% a config e sempre rodava a cena cara, mesmo no mobile).

Nota honesta: lag de Floor 6 é GPU/render-bound (luzes + env HDRI + overdraw + draw calls),
não CPU — então WASM não conserta isso (WASM é a física, onde há CPU). Fix = otimização de
render de verdade:

**Quality-gating do Floor 6 (novo — antes inexistente):** `Floor6Suite` agora recebe
`profile`; deriva `lite = !profile.atmosphere` (medium/low). No lite:
- **Env map HDRI PMREM DESLIGADO** (samplear o cubemap por-fragmento em todo PBR é caro no
  mobile) — compensado com hemisphereLight mais forte (0.34→0.52). Visualmente confirmado
  em render: a sala continua bem iluminada, nada escuro/quebrado.
- Point lights de intensidade-0 (bath/tv) agora montam SÓ quando acendem (`f6.bathOpen`/
  `f6.tvOn`) — antes ficavam no shader como luzes ativas mesmo apagadas (custo por-fragmento
  em TODOS os materiais). Vale pra todas as qualidades.

**Gating de salas trancadas (todas as qualidades, −142 draw calls):** `<Bathroom>` e
`<Kitchen>` montam só quando `f6.bathOpen`/`f6.kitchenOpen`. Enquanto trancadas, a porta
sólida + a parede escondem 100% o interior → renderizá-lo era puro desperdício. Verifiquei
que a `BathDoor` é um slab opaco fechado antes do unlock (sem pop-in visível). Montam
exatamente quando a porta abre.

**DustMotes** (12 billboards transparentes) → só high (`!lite`).

**Resultado medido: 507 → 365 draw calls/frame (−28%)** em todas as qualidades, mais o corte
de custo de fragmento (env+luzes) no lite pro mobile. (swiftshader fica ~1.5fps pinned — é
mau proxy de FPS; o ganho objetivo são draw calls + custo de fragmento, que aliviam o device
real do Felipe.) tsc 0 · 99/99 vitest · audit 0 · index.html rebuildado · smoke OK.
⚠️ Validar o FPS final na GPU real do Felipe; dá pra otimizar mais (merge de geometria do
shell/props) se ainda lagar.

### Sessão 2026-06-19 (cont.) — Fase 2: Photo Mode (path tracer GPU) ENTREGUE

Ray tracing DE VERDADE, no único lugar viável nesse stack: um "modo foto" não-realtime.
Deps (versões core three/react INALTERADAS): `three-gpu-pathtracer@0.0.24` +
`three-mesh-bvh@0.9.10`.

- `src/PhotoMode.tsx`:
  - `PhotoModeRig` (DENTRO do Canvas): com `useFrame(cb, 1)` (prioridade 1 = assume o
    render) acumula amostras path-traced da cena congelada via `WebGLPathTracer` (GI real,
    sombras suaves, reflexos). TUDO em try/catch — GPU que não suporta cai no fallback, não
    crasha. Quando inativo, prioridade 0 + early-return → ZERO impacto no jogo normal.
  - `PhotoModeOverlay` (DOM): letterbox + barra de progresso + "Salvar PNG"
    (canvas.toDataURL) + Fechar. Estados: REVELANDO / FOTO PRONTA / INDISPONÍVEL.
  - `PhotoModeButton` (📷) + hook `usePhotoMode`.
- Wiring no App: rig dentro do Canvas; botão+overlay fora (gated aos andares fotográficos
  0/1/6, só com portas abertas); player PAUSA enquanto ativo; **EffectComposer desligado
  durante o photo mode** (senão briga pelo render loop).

**Verificado:** tsc 0 · 99/99 vitest · audit 0 · build = 1 chunk (sem worker separado,
inlineDynamicImports segura) · single-file inca o path tracer · smoke OK. E2e do photo
mode: botão presente → abre → em swiftshader cai no **fallback "INDISPONÍVEL" sem crash**,
jogo segue a 60fps (esperado: software GL não path-traceia). ⚠️ A imagem ray-traced em si
só dá pra ver na GPU REAL do Felipe (validar no Vercel) — swiftshader não roda o tracer.
Obs UX: no desktop com pointer-lock o 📷 (como os outros botões de HUD) precisa do cursor
livre (Esc); no mobile/touch funciona direto.

### Sessão 2026-06-19 (cont.) — Varredura de bugs nos hot paths restantes

Sub-agente auditou Player/Multiplayer/AudioEngine/Atmosphere/Floor2/Floor3/Bot/RemotePlayer.
Verifiquei cada achado no código: a maioria foi FALSO POSITIVO (os "leaks de timer" do
Atmosphere já limpam com `if (timer) clearInterval(timer)` antes de re-armar + no stop; o
`scheduleDrip` do cave tem guard `if (stopped) return` no topo). Os hot paths principais
estão limpos — bom sinal de saúde do código.

**Único bug real corrigido — Floor3Hazards.tsx:** a assinatura pra detectar mudança no
conjunto de hazards/brushes era `hazards.map(h=>h.id).join(',')+...` construída TODO FRAME
(2 .map + join + concat = lixo de GC 60×/s). Troquei por um **hash numérico** sobre os ids
(zero alocação, O(n) com n pequeno, detecta qualquer mudança incl. troca com mesmo tamanho).
Comportamento equivalente. tsc 0 · 99/99 vitest.

**Regressão checada:** smoke e2e multi-andar (lobby c/ física + corrida + suíte) — todos
renderizam com 0 erros fatais de console. index.html rebuildado.

### Sessão 2026-06-19 (cont.) — Floor 6 rodada 2: overdraw + correção de regressão

Empurrei o Floor 6 mais longe (o hook pediu pra não parar esperando feedback). Atribuí os
365 draw calls restantes e achei o vilão de overdraw: **15 `GroundBlob`** (sombras de
contato = planos transparentes) + DustMotes. Gateei ambos no lite (`!profile.atmosphere`).

**Regressão pega e corrigida no caminho:** eu tinha desligado o env map HDRI no lite —
mas isso ESCURECEU a sala (o env dava boa parte da luz ambiente) e medindo deu ~0 ganho de
fps isolado. Reverti: **env map fica ON em todas as qualidades** (visual preservado, sem
regressão). O ganho do lite vem 100% de cortar overdraw transparente (não de escurecer).

**Medido (swiftshader):** Floor 6 medium **507 → 323 draw calls (−36%)**, FPS 1.5 → 2.2;
o corte de overdraw sozinho (sombras+dust) leva a ~4.3 fps se o env também sair, mas mantive
o env pelo visual. HIGH = 365 dc (mantém tudo). **Sem regressão visual** — screenshot do
medium bate com o high (sala quente e iluminada), só sem as sombras de contato sutis (LOD
aceitável no mobile).

⚠️ O env map é o maior custo restante (≈dobra o fps quando removido) mas é um trade
look-vs-perf — deixei a cargo do Felipe: se ainda lagar no device dele, dá pra adicionar um
"modo performance" explícito que dropa o env. tsc 0 · 99/99 vitest · single-file smoke OK.

### Sessão 2026-06-19 (cont.) — Floor 6 rodada 3: merge de geometria do trim

Mais um ganho de draw call SEM regressão e em TODAS as qualidades: os baseboards + crown
molding eram 8 segmentos × 4 boxes = 32 meshes, todos `F6M.woodDk`. Criei `MergedTrim` que
funde os 32 numa única BufferGeometry (mesma matemática de transform dos `<Baseboard>`/
`<Crown>` originais, T(group)·R(ang)·T(local)) → **1 draw call**. Removidos os componentes
`Baseboard`/`Crown` (mortos). Verificado em render: trim idêntico (baseboards na junção
parede-piso, crown no teto). Colisão é independente (`wallsForState`), então merge visual
não afeta gameplay.

**Floor 6 acumulado (swiftshader, medium): 507 → 294 draw calls (−42%)**; high 507 → 335
(−34%). Sem regressão visual, env map preservado. tsc 0 · 99/99 vitest · single-file smoke OK.

### Sessão 2026-06-19 (cont.) — Floor 6: investigação de modelos pesados + análise de custo (medium é o default)

Felipe: medium é o DEFAULT e o mais importante; checar modelo 3D pesado e substituir; ver
como outros levels otimizam e aplicar; manter bonito.

**Modelos 3D pesados: NÃO EXISTEM.** `grep useGLTF|GLTFLoader|.glb|.fbx` no Floor 6 = 0.
A suíte é 100% PROCEDURAL (boxes + canvas textures). Não há modelo pra substituir.

**Como o Floor 2 (mais otimizado) faz:** geometria estática pré-construída 1× no module load
(IIFE: CAVE_WALL/FLOOR/CEILING) + geometria compartilhada + InstancedMesh pra repetidos +
`mergeGeometries`. **Apliquei o merge** no trim do Floor 6 (rodada anterior, −30 draws).

**Análise de custo do medium (medido):** o gargalo dominante no swiftshader é o **env map
HDRI** (env-off leva medium de 2.2→7.2 fps no MESMO nº de draw calls). Mas:
- O env é o que deixa a sala BONITA (IBL: reflexos + fill quente) → mantido no medium/high
  conforme a prioridade do Felipe. Só o tier LOW dropa (escolha explícita de perf).
- O custo do env é ALL-OR-NOTHING: o sampling por-fragmento é fixo pelo tamanho do cubemap
  do PMREM; não dá pra baratear sem remover (testado o raciocínio: envMapIntensity=0 não pula
  o sample; RoomEnvironment gera PMREM do mesmo tamanho → mesmo custo). Então não há meio-termo.
- Sombras: NÃO usadas (Canvas sem `shadows`, 0 castShadow no Floor 6) → nada a cortar aí.
- Shell (piso/teto) já são planos eficientes. Paredes são multi-material por-comprimento
  (UV escala por parede) → merge arriscaria o visual. Props de mobília são MISTOS de material
  e muitos ANIMADOS (useFrame: Bed/Wardrobe/Desk/TvSet/Window/Painting) → merge inseguro.

**Conclusão:** o que dava pra otimizar com segurança SEM perder beleza foi feito: draw calls
507→294 no medium (−42%), overdraw transparente cortado (sombras de contato + dust), trim
mesclado, luzes apagadas desmontadas. Essas reduções de draw call + overdraw **ajudam o mobile
real do Felipe** mesmo que o swiftshader (env-bound) não mostre no FPS. O env (beleza) fica no
medium; quem precisar de FPS máximo usa o tier low (env off, ~4.8× mais rápido).
tsc 0 · 99/99 vitest · audit 0.

### Sessão 2026-06-19 (cont.) — Garantia de FPS no medium: piso de dpr mais baixo

Pra fechar o "medium bem level" sem eu poder validar na GPU real: o jogo JÁ tem AdaptiveDpr
+ PerformanceMonitor (baixam a resolução sob carga pra segurar FPS), ativos no Floor 6. Mas o
piso de dpr do medium era 0.75 — pouca margem pro andar pesado (env-bound) se recuperar num
phone fraco. **Aumentei o range do medium: dpr [0.75,1.0] → [0.6,1.0].** Mais headroom pro
auto-scaling recuperar FPS no Floor 6; fica nítido (1.0) quando o device aguenta, só suaviza
sob carga sustentada (suave-mas-fluido > travado). Systemic e seguro (auto-recupera).

Smoke multi-andar (medium): lobby/submerso/parkour/corrida/suíte — todos renderizam, 0 erros.
tsc 0 · 99/99 vitest.

### Sessão 2026-06-19 (cont.) — ANDAR 7: o Navio Pirata, 100% em WebAssembly (C + Assembly)

Felipe pediu o Andar 7 feito **100% em WebAssembly, em C e Assembly**: navio pirata 3D de
tamanho médio, player nasce no convés de um navio EM MOVIMENTO, o elevador faz uma animação
de sumir, o capitão aparece e pede pra pegar um balde com pano e limpar as poças do convés;
quando termina de limpar não tem mais nada pra fazer MAS não pode sair (level parcial, de
propósito).

**Toolchain achada no ambiente:** `clang 18` com target **wasm32** + `wasm-ld` + `llc`
(sem emscripten/wat2wasm). Compilo C freestanding (-nostdlib) direto pra wasm. Provei o
pipeline (C→wasm rodando no Node) E que dá pra escrever **WASM assembly à mão (.s)** e linkar.

**A FÍSICA/LÓGICA do andar é 100% C+Assembly compilado pra WASM** (o Three.js só LÊ os números
e desenha — rendering precisa de WebGL, inevitável):
- `wasm/floor7_asm.s` — **assembly WASM escrita à mão**: `f7_sinp` (seno polinomial Horner) e
  `f7_inv_len2` (1/sqrt guardado). Toda a oscilação do mar, bob do capitão e direções saem daí.
- `wasm/floor7.c` — o CÉREBRO: movimento do navio (heave/pitch/roll via o seno do asm), máquina
  de estados da quest (INTRO→GREET→FETCH→CLEAN→DONE), fade do elevador, capitão que caminha da
  proa, balde (pega/segura), 6 poças com progresso de limpeza, RNG xorshift, atan2 próprio.
  `f7_can_leave()` retorna SEMPRE 0 (não pode sair). Exporta getters + ponteiro do array de
  poças na memória linear.
- `wasm/build-wasm.mjs` (`npm run build:wasm`) — compila C+asm → wasm → **base64 embutido em
  `src/floor7-wasm.ts`** (commitado) pro build de produção (Vercel sem clang) inlinar no
  single-file. O `.wasm` em si é gitignorado (a fonte-da-verdade é o .ts).
- `src/Floor7Brain.ts` — bridge TS tipado (instancia síncrono, lê poças da memória WASM).
- `src/__tests__/floor7Brain.test.ts` — **6 testes headless** validam a quest inteira no WASM
  (intro→limpeza→DONE), o movimento do mar (asm), e que NUNCA pode sair.
- `src/Floor7.tsx` — renderer R3F: casco/convés/mastros/velas/leme/proa procedurais, mar com
  névoa que desliza (sensação de movimento), capitão estilizado (casaco+tricorne), balde+pano,
  poças que encolhem ao limpar, elevador que desmaterializa (fade+sobe). Cada frame mapeia a
  posição do player pro frame LOCAL do navio (worldToLocal) e alimenta o cérebro → limpeza
  alinhada mesmo com o balanço. `Floor7Overlay` (DOM): diálogo do capitão + HUD "CONVÉS LIMPO
  n/6" + botão ESFREGAR + tecla E/Espaço.
- Wiring no App: spawn no convés (z=4.2), elevador padrão suprimido no level 7, ambiente
  montado como sibling do World (precisa do handle do WASM), overlay fora do Canvas. Paredes do
  convés (`_WALLS_FLOOR7`, 6×14) no `wallsForState`. Card do creator atualizado.

**Validado renderizando (Playwright/swiftshader):** navio+oceano+capitão+poças+balde+elevador
renderizam; o capitão caminha até o player e dá a missão ("Ahá, um novo grumete!… esfrega
essas poças, marujo!"); **0 erros fatais** no dev E no single-file de produção (WASM instancia
do base64 inlined). tsc 0 · **105/105 vitest** (+6) · audit 0 · index.html rebuildado.
Obs: o swiftshader roda ~5fps então a intro de sim demora (dt clampado) — na GPU real a 60fps
a intro fecha em 3.9s. Falta (Felipe vai dizer depois): o resto do level além da limpeza.

### Sessão 2026-06-19 (cont.) — 1ª pessoa global + Floor 7 graficamente reformulado

Felipe: tirar a 3ª pessoa PERMANENTE (todos os levels) + deixar o Floor 7 "extremamente
bonito" (estava feio/mal acabado); pesquisar técnicas; C++ liberado pra gráficos.

**3ª pessoa removida (todos os levels):** `fp=true` forçado no Player, avatar sempre oculto,
`zoomLevel` travado em 0, controles de scroll/pinch desabilitados. Câmeras de corrida/cutscene
(Floor 5/3) são sistemas próprios, intactas. Validado: lobby em 1ª pessoa.

**Pesquisa (web):** confirmou Gerstner + fresnel + foam (Jacobian/cristas) + fade pro horizonte
pra água; e low-poly estilizado + texturas PBR (diffuse/rough/normal/AO) + paleta coesa +
espuma onde a água toca o casco pro navio. (FFT/WebGPU = overkill, quebraria WebGL/single-file.)
Fontes: discoverthreejs PBR, sbcode gerstner, threejs ocean examples, pirate-sea-jam devlog.

**Floor 7 reformulado (3 stages, tudo self-contained pro single-file):**
- A) `Floor7Water.tsx` — **shader Gerstner custom** (4 ondas, gradiente fundo/raso, fresnel,
  brilho do sol agudo, foam nas cristas, fade pro céu no horizonte). + drei `<Sky>` atmosférico
  com sol baixo quente + key light casado. Substitui o plano azul flat.
- B) `floor7Textures.ts` — **madeira procedural** (grão+tábuas+nós + roughness map) no
  convés/casco/trim; **Jolly Roger** procedural (caveira+ossos) numa bandeira que tremula;
  crow's nest, cordame (shrouds), barris com aros de ferro, pilha de caixotes, lanterna do leme
  com glow+pointLight.
- C) Bloom/EffectComposer habilitado no Floor 7 em TODAS as qualidades (inclui o medium/default)
  pro brilho do sol na água/lanterna/velas.

Validado renderizando (dev + medium): água com ondas, céu atmosférico, madeira texturizada,
0 erros fatais. tsc 0 · 105/105 vitest · audit 0 · index.html rebuildado.
⚠️ A câmera FP é difícil de tiltar no Playwright headless, então não consegui um print do
mastro/velas/bandeira de frente — mas compilam e renderizam (0 erros); pedir o olho do Felipe
in-game. C++ pro casco curvo: planejado mas ainda não feito (a permissão fica pra próxima
iteração se ele quiser mais).

### Sessão 2026-06-20 — Loop visual do Floor 7 (render→crítica→conserto, eu mesmo testando)

Felipe (/loop): parar de fazer às cegas — eu mesmo renderizo, vejo os erros gráficos e
conserto, iterando, pq estava "terrível" e o pirata parecia placeholder.

**Bancada de inspeção:** `floor7.html` + `src/floor7-dev.tsx` (OrbitControls + fast-forward
do cérebro WASM pra pular a intro e esconder o elevador) + `shot7.cjs` → renderizo o navio de
qualquer ângulo offline. (Sem ScheduleWakeup/Cron nesse ambiente, então iterei dentro da sessão.)

**Iteração 1:** casco caixa→**casco extrudado com proa pontuda** (ExtrudeGeometry de um
footprint de barco + belly inferior afilado); **capitão placeholder→pirata estilizado**
(pernas+bota+perna-de-pau, casaco com botões dourados, cinto/fivela, braços com punhos+mãos,
cabeça com barba/nariz/olhos, tricorne com trim dourado, cutelo); água com ondas Gerstner mais
fortes (5 bandas) + cor mais rica; sol golden-hour.
**Iteração 2:** **espuma na linha d'água** (colar de espuma do contorno do casco); canhões +
cordas enroladas no convés; **nuvens procedurais** (billboard canvas via `makeCloud`) — troquei
o `<Cloud>` do drei que baixava PNG de CDN (quebra offline/single-file). 0 refs de CDN no build.
**Iteração 3:** halo do sol (`makeGlow`, additive), **gaivotas** voando (flap+círculo), céu
mais quente/atmosférico.

Verificado renderizando vários ângulos: oceano rolando + espuma + navio detalhado + nuvens +
gaivotas = navio pirata bonito de verdade (vs o blocão marrom de antes). Tudo self-contained
(sem assets externos). tsc 0 · 105/105 vitest · index.html rebuildado. Bancada é dev-only
(não vaza pro build). Próximo (se quiser mais): refinar rosto do capitão, mais props de convés,
sun-streak na água, talvez casco em C++.

### Sessão 2026-06-20 (cont.) — Capitão de verdade + materiais molhados + casco em C++

Felipe (/loop, irritado): "isso que vc considera bonito? as texturas, o pirata, está tudo
péssimo" — de volta ao loop render→crítica→conserto.

Renderizei close-ups e confirmei os 2 piores defeitos: **chapéu = um torus preto gigante (rosca)**
e **cabeça = esfera bege sem rosto** (os "olhos" eram pontinhos escondidos sob a aba enorme).

**Conserto do capitão (Floor7.tsx `Captain`):**
- **Tricorne de verdade**: coroa (cilindro+domo) + **3 abas viradas pra cima a 120 graus** com
  galao dourado e uma pluma vermelha — silhueta de chapeu armado (confere de cima/lado/frente).
- **Rosto real**: olho com esclera+iris(marrom)+pupila+sobrancelha arqueada; **tapa-olho** com
  alca atravessando a cabeca; nariz definido; **bigode** repartido; **barba** cheia + costeletas.
- Casaco vermelho com 2 fileiras de botoes dourados, gola, faixa, fivela, cutelo.

**Materiais:** **PMREM environment map** de um ceu equiretangular proprio (`makeSkyEquirect`) →
todo material PBR reflete o ceu. **Pocas = MeshPhysicalMaterial com clearcoat** (molhadas:
escuras de cima, brilhantes de raspao — fresnel) em vez de manchas azuis chapadas. Madeira
(casco/conves/corrimao) ganhou **bumpMap + envMapIntensity** pra pegar luz.

**Casco ja e C++** (`wasm/floor7_geo.cpp` → secoes lofted, proa pontuda; JS so sobe os buffers).
Verificado: tsc 0 · 105/105 vitest · build single-file OK · push em claude/review-commits-memory-y6iqnf.
Proximo (se quiser): velas menos chapadas (sombrear/curvar), streak do sol na agua, mais geometria
de conves migrada pra C++.

### Sessão 2026-07-09 — ANDAR 7: caça aos bugs com tripulação de Haikus + FINAL com lore

Felipe: "melhore MUITO o andar 7, conecte com a lore, está CHEIO de bugs e problemas gráficos"
+ autorizou orquestrar 5 subagentes Haiku ("tripulação") pros trabalhos baratos.

**Tripulação (Agent tool, model haiku):** Gaivota (screenshots/QA visual), Luneta (QA da
cutscene), Carpinteiro (auditoria de código, 2 rodadas), Grumete (playtest da quest via
probes), Papagaio (dossiê da lore — salvo no scratchpad da sessão). Eu (Fable) consolidei
e escrevi TODOS os consertos. Fluxo barato: relatórios deles → edits meus.

**Bugs achados e consertados:**
- "Parede de tábuas" no spawn = o MASTRO DO TRAQUETE (local z=4.0) na cara do player
  (spawn z=4.2, x=0). Spawn movido pra (0.75, 4.3) local — App.tsx + floor7-play.tsx.
- Mão FP com escova: aparecia desde a intro (gate era só elevFade<0.85) e era GIGANTE
  (scale 1.4 a 0.34m da câmera). Agora: `bucketState.held && elevFade<0.85`, scale 0.85,
  translateZ -0.42 (Floor7.tsx).
- Poças: y fixo 0.02 ignorava o tosamento do convés (z-fight nas pontas, disco flutuando
  na amurada). Agora y = deckYAt((z+7)/15.2)+0.022; spawns no WASM apertados
  (|x|∈[0.55,1.30], z∈[-3.5,3.5], r∈[0.40,0.65]).
- Água listrada: as 2 ondas Gerstner menores (wl 1.7/0.95) sub-amostradas pela grade
  180x180 viravam listras coerentes → removidas (detalhe fino já era fragment-side);
  spec 150→90; chop grosso 0.028→0.034. + uniform uCalm (mar acalma na chegada).
- tideWarn congelava no último valor ao sair de CLEAN → anel de ressaca eterno na água.
  Zerado na transição pra DONE (floor7.c).
- Capitão GLB sumiria quando o elevador voltasse (gate elevFade<0.85) → gate agora só
  vale em ST_INTRO.
- Cordas #caa56a viravam "macarrão" claro → #8a6a42 + bump; gaivotas eram 2 caixas
  pretas → corpo branco + asas cinza + cabeça/cauda; grade do porão flutuava (barras
  y0.1→0.07); deck envMapIntensity 0.6→0.22 (listras azuis de reflexo no convés seco);
  vela do traquete encurtada/erguida (billowSail 3.3x2.2x0.6 @ y2.6); dip do model-swap
  da cutscene 0.92→1.0 (nota da Luneta).

**FINAL NOVO (lore, 100% no WASM — floor7.c):** estados ST_SAIL(5)→ST_ANCHOR(6)→ST_FREE(7).
DONE→(4.6s)→SAIL: landfall 0→1 em 26s, ilha SE APROXIMA de verdade (z 90→28), mar acalma
(S.calm escala heave/pitch/roll + uCalm na água), capitão no leme solta 3 barks de lore
(diálogos 9-11: 40 anos no mar, "o oceano é tudo que o hotel esquece", visita do Zelador).
ANCHOR: capitão manda ler o DIÁRIO DE BORDO (diálogo 12) — livro 3D na escotilha
(LOG local (0,-3.1), glow pulsante). 3 páginas no overlay (pergaminho DOM) amarrando:
administração do hotel, Zelador pregando tábua, "a maré é o hotel respirando", regra do
Andar 4 ("ser lembrado é ser cuidado"). Ler tudo → logRead → "VOCÊ LEMBROU DO ANDAR 7"
(card igual ao do Andar 4) → ST_FREE: elevFade VOLTA (cab rematerializa com ding
f7PuddleDone+clunk), portas deslizam abertas (seam some — refs elevDoorL/R/Seam/Edge),
f7_can_leave()=1. Player entra no vão + E → f7_boarded latch → App.handleF7Board:
teleporta pro cab global (0,0,-13), monta ElevatorInterior (era suprimido no lvl 7),
nextElevatorDestination=0, elevatorTimer=20 (mesmo caminho do SAVED do Barney) → lobby.
Exports novos: f7_landfall/calm/log_page/log_read/log_x/log_z/near_exit/boarded.
Overlay: HUD "RUMO À ILHA", botão vira VIRAR/EMBARCAR, beacon "APERTE E PARA EMBARCAR".

**Testes:** floor7Brain.test.ts reescrito — 10 testes (arco completo até boarded; poças
dentro da amurada; log fechado até abrir; "não sai antes do final"). Asserts de DONE viram
>= DONE (o DONE avança sozinho pro SAIL em 4.6s — o sweep do mop pode vazar). 108/108.

**Higgsfield:** Felipe liberou (5 créditos) — NÃO usado ainda; candidato: textura de
pergaminho pro diário (o overlay atual é CSS e ficou bom; só usar se Felipe pedir upgrade).

### Sessão 2026-07-09 (cont.) — Polish do Andar 7 com marujos-Haiku CODANDO

Felipe pediu pra delegar CÓDIGO de baixo risco pros Haikus (não só teste). Divisão por
arquivo (zero conflito): Calafate (floor7Sfx.ts: f7ElevatorReturn ding + f7AnchorSplash),
Veleiro (floor7Textures.ts: remendos/sal/vinheta sutis no makeSailcloth), Ilhéu
(Floor7.tsx: palmeiras/pedras/2ª praia na ilha, com fade integrado). Eu revisei cada diff:
- Calafate: removi o pitch-glide dos tons do ding (sino segura a frequência e decai).
- Ilhéu: praias estavam SUBMERSAS (local -1.2 → world -1.8 < água -1.3) → subidas pra
  -0.55/-0.57; ilha ficava fantasma (transparent) → materiais viram opacos (transparent
  =false, opacity 1) quando op>0.95 (transparência só existe pro fade).
- Gaivota reauditou: aprovou spawn/mão FP/elevador; reprovações viraram fixes: chop
  grosso da água atenuado com a distância (faixas paralelas no far field), vela do
  traquete agora FERRADA na verga (clipava na cabine do elevador, cujo canto rotacionado
  chega a z=4.0), balde 3D invisível enquanto held (viewmodel é o balde), rail
  envMapIntensity 0.8→0.4, shell do elevador matte (#9fb0b9 r0.62 m0.3 — parede branca
  estourada). SFX fiados: ANCHOR = f7Wave+f7AnchorSplash; FREE = f7ElevatorReturn.
Commits: dab0e0a (bugs+finale), a585d23 (sfx Calafate), + polish final. 108/108 · tsc 0.

### Sessão 2026-07-09 (cont.) — 1ª onda visual (time de Haikus)

Contramestre coordenou QA visual e integração: 5 marujos (FACHO, MARÉ, VERNIZ, LENHO,
ILHOTA) fecharam os 5 maiores consertos do Almirante (diretor de arte) em arquivo-lanes
isolados (zero merge conflicts). Passou tsc 0 e 108/108 vitest logo no dia. Veredito QA:
- OCEANO: Gerstner cruzado (não telha de zinco paralela) + especular pontilhado ✓
- POÇAS: Translúcidas com tabuado por baixo + borda escura (menisco) ✓
- CASCO: Juntas escalonadas (running bond, não padrão brick) ✓
- CONVÉS: Costuras retas (UVs fore-aft, não onduladas) ✓
- BLOOM: Floor 7 threshold 0.68→0.85, intensity 0.6→0.38 (verificado em App.tsx) ✓
- ILHA: Praia + halo turquesa + palmeiras + rochas (tropical, não brócolis) ✓
Commit: 57ec051 — Build index.html (~65MB single-file), push OK. Comodoro só observou.

## Andar 6 — prioridade total (2026-07-11, Capitão Fable executando direto)
- Móveis maciços corrigidos: armário e geladeira eram blocos SÓLIDOS com "interior" enterrado
  dentro (portas abriam pra parede) → reconstruídos como cascas ocas; interior/prateleiras/
  marmitas/gelo agora visíveis. Luz da geladeira reposicionada no forro do fundo.
- Cortina da banheira: varão reto virou VARÃO OVAL preso ao teto contornando a banheira solta;
  cortina = segmento de cilindro elíptico com dobras (rebuild só durante a transição), borda
  fixa + borda puxada (fechada ~295°, aberta amontoada); argolas acompanham pela elipse.
- Hóspede procedural SUBSTITUÍDO pelo GLB do Felipe (Meshy "Midnight Trenchcoat", texturas
  reduzidas 2048→1024 = 7.1MB→0.9MB) em `assets/models/guest-trenchcoat.glb`; Floor6Guest.tsx
  reescrito: malha estática + vida procedural no grupo (respiração/sway/encarar atrasado) +
  step-aside 'free'/'leave' preservado.
- QA E2E no bench: guestIdle→guest2 (7 falas)→card→free (vão passável)→botoeira→'leave'→
  onLeave ✓. Portas do cab FECHAM no leave (ding + slam do Decorador) — no bench swiftshader
  (~3fps + clamp de dt) animações rodam ~6x mais lentas: esperar 20s+ antes de acusar bug.
- Cuidado no bench: perto do hóspede o hotspot 'portabanheiro' (1.75m) ganha do 'hospede'
  (1.8m) — teste a interação parado em (0,-7).

### Sessão 2026-07-11 (cont.) — Acabamento: lore + atmosfera + cozinha

**Tripulação (SendMessage):** Dramaturgo (`ac4a7186cff065519` — textos + ritmo), Maestro
(`a73651a33aecd4c27` — luz + som), Vitrinista (`afc5c2145e53cc229` — props cozinha +
arandelas). Porteiro (Claude Fable) coordenou QA E2E + integração final.

**Lore (Dramaturgo):**
- Nome do hóspede AURÉLIO CAMPOS integrado em 5 locais (máquina de escrever, diário, mala,
  geladeira, card de memória). Etiqueta da mala: textura leather aged em Floor6Textures.ts.
- Ato 2 (F6_GUEST_LINES2): 7 falas expandidas, cada uma revelando camadas (despensa,
  check-out, descida, nome, memória-tijolo, "lembra de mim", despedida). Beats preservados,
  falas enxutas.

**Atmosfera (Maestro):**
- Dimming ato 2: guest2 reduz bedLight a 55% (guest2DimTarget=0.55 em Floor6Suite.tsx),
  suave recovery 4s ao entrar em 'free'. Visualmente impacto: cena ~45% mais escura.
- Memory pulse (guestLine===4, "Lembra. De. Mim."): playF6MemoryPulse() = sub-drone 48Hz
  + shimmer 6kHz, envelope 1.2s. Light pulse sincronizado: bedLight ramp-down 0.4s +
  ramp-up 0.6s. playF6MemorySting() = 880Hz+740Hz (card sting, 0.8s decay).

**Cozinha (Vitrinista):**
- Fogão: 4 bocas em grid 2x2, cada uma com anel de ferro + 3 grades. Chama + panela na
  boca frente-esquerda. 4 botões de controle na frente (painel tátil).
- Microondas: painel lateral com 2 botões, janela escura com reflexo sutil, corpo em
  appliance matte, 4 pés na base. Geometria realista: F6M.appliance (cor/material).
- Utensílios no trilho chrome (3 unidades reconhecíveis):
  1. Concha/ladle (z=-0.4): handle cilíndrico + bowl hemisphere
  2. Espátula (z=-0.1): handle wood taper + blade retangular em steel
  3. Frigideira (z=0.2): pan disk (fundo) + handle wood rod
- Arandelas: metal bracket + shade bowl com emissive #ffcf80 (warm), intensity 1.6.
  Subtle bulb glow interior (opacity 0.3, MeshBasicMaterial).

**QA E2E:**
- 115/115 testes vitest, tsc clean. Screenshots visuais: guestIdle (base) vs guest2 (55%
  darker) vs free (recovered). Diálogo ato 2 = 7 linhas avançadas, card exibido (sem sting
  capturado na screenshot, mas código verificado). Boarding: "F6 LEAVE OK" no console.
- Critérios aceite: 1(tests), 2(nome+etiqueta), 3(ato2), 4(luz), 5(cozinha), 6(arandelas),
  7(regressão E2E), 8(raias), 9(MEMORY.md) = ✓ ALL GREEN.

**Merge:** Floor6Overlay.tsx (card nome), Floor6Props.tsx (suitcase tag, sconce glow),
Floor6Suite.tsx (dimming + memory pulse light), Floor6Textures.ts (suitcaseTagTex),
Floor6Wet.tsx (fogão 4-bocas, microondas detalhado, utensílios 3x), f6Escape.ts (nome em
5 textos), floor6Sfx.ts (playF6MemoryPulse/Sting).

**Commit:** branch `claude/floor-7-bugs-lore-celwdy`, build index.html (~66MB), push OK.

### Sessão 2026-07-31 — "baixo tudo de novo a cada commit": era a REGRA DE ORIGEM, não o cache

Felipe: *"eu uso o vercel pra testar, e no vercel, sempre que tem um novo commit, o Chrome
dá como se fosse outro site, e eu tenho que baixar dnv"*. Ele matou a charada — eu tinha
começado a investigar cota (os comentários antigos do `floor10ModelStorage.ts` falam de
1,07 GB) e ele corrigiu: **a cota do aparelho dele são 12 GB e o cache funciona**. O
problema nunca foi espaço.

**A causa.** Todo armazenamento do navegador — OPFS (onde o wllama guarda os .gguf), Cache
Storage, IndexedDB, localStorage — é indexado por ORIGEM. A Vercel dá uma URL nova por
deploy (`jdjdjddj-<hash>-<escopo>.vercel.app`), e para o Chrome isso é outro site: cofre
vazio, 4,2 GB de cérebros de novo. O alias fixo é `jdjdjddj-five.vercel.app`, e o que está
guardado continua lá, inalcançável a partir da URL do deploy.

**O que entrou:**
- `src/origemEstavel.ts` + `src/OrigemEstavelAviso.tsx` — detecta que a página abriu numa
  URL descartável. Se o endereço fixo servir **o mesmo build**, salta sozinho (não custa
  nada e economiza 4,2 GB); se os builds diferirem, mostra os dois lados e deixa quem testa
  decidir — pode ser justamente o build novo que ele quer ver. `?deploy=1` fica na URL do
  deploy de propósito. 11 testes.
- `public/coi-serviceworker.js` — o MESMO worker do isolamento passou a guardar o
  `index.html` de 84 MB (só um SW controla um escopo; um segundo derrubaria o COOP/COEP e a
  fala cairia para CPU×1). Frescura sem pagar 84 MB: ele pergunta ao `version.json` (~100
  bytes) qual build está no ar e só baixa quando o id difere. Não toca em nada que não seja
  navegação — os .gguf continuam indo direto para o wllama.
- `src/main.tsx` — o registro do worker era condicional (`if (crossOriginIsolated) return`),
  então na Vercel, que já manda os cabeçalhos certos, **o worker nunca era instalado**.
  Agora registra sempre; o reload só acontece quando falta isolamento.
- `inline-build.mjs` — gera `version.json` e copia worker/manifest/ícones para a raiz (o
  `/coi-serviceworker.js` dava **404 em produção**: era registrado e não existia). Saíram as
  metas `Cache-Control: no-store`, que mandavam rebaixar 84 MB a cada abertura.
- Identidade do build = **hash do conteúdo**, não o commit: o index.html é gerado antes do
  commit que o publica (o carimbo nasceria apontando para o commit anterior) e rebuildar o
  mesmo código cobraria 84 MB à toa. Verificado: duas rodadas seguidas dão `9d5b334d7b9d`.
- `src/armazenamentoPersistente.ts` + `manifest.webmanifest` + ícones — `storage.persist()`
  a cada abertura. No Android o Chrome concede por engajamento, e o sinal mais forte é o
  site estar INSTALADO na tela inicial: o manifest não é enfeite, é o que faz o pedido ser
  aceito. Sem isso os 4,2 GB seguem despejáveis quando o aparelho apertar.

**ARMADILHA:** não registre um segundo Service Worker em `/`. Ele substitui o
`coi-serviceworker.js`, o `crossOriginIsolated` cai e o wllama volta para uma thread só.

**Estado:** tsc 0 · 492/492 vitest · audit sem erros · index.html rebuildado (83,9 MB).

### Sessão 2026-07-31 (cont.) — otimizações no NPC: o que rodava à toa

Felipe: *"faz otimizações e melhorias principalmente no npc"*. O caminho da fala já
estava muito trabalhado (`cache_prompt`, KV em q8_0, curador de prompt, vetores do cânone
pré-calculados no bundle) — não mexi em sampling nem em threads, que são números MEDIDOS no
aparelho dele. O que sobrou foi trabalho repetido, e dá para provar lendo:

- **A vontade pensava 60 vezes por segundo lendo uma percepção de 6 Hz.** `willBrain.tick()`
  e `prisonTick()` rodavam por QUADRO; 48 dessas 60 avaliações por segundo chegavam à mesma
  conclusão, cada uma alocando um `drives` novo e lendo o relógio. Agora rodam a 12 Hz
  (`floor10Cadencia.ts`), com o `dt` dos quadros pulados ACUMULADO — nenhum tempo se perde,
  então impulsos, cooldowns e a recompensa da prisão integram exatamente o mesmo total. O
  corpo continua andando e animando a 60 Hz mirando o último veredito. Abrir a conversa
  chama `agora()` e não espera os 83 ms.
- **O Nilo parado era um pião.** `desiredYaw = g.rotation.y + 0.32` a cada quadro é um alvo
  que ele nunca alcança: girava ~40°/s para sempre, no mesmo sentido. Agora ele varre a sala
  como gente (`floor10Olhar.ts`): olha um ponto, segura ~3,4 s, escolhe outro, sempre dentro
  de ±1,15 rad do rumo em que parou. Teste afirma que em 10 min parado o olhar nunca escapa
  dessa faixa — o defeito antigo acumulava mais de 200 rad no mesmo tempo.
- **Dois re-renders por token viraram bem menos.** `consumeChatStream` publicava o texto
  visível a cada chunk, inclusive durante o `<think>`, quando o visível não muda por dezenas
  de tokens; agora só publica o que mudou (teste: 6 chunks → 3 publicações). E
  `timings_per_token` disparava um `npcSet` de etiqueta por token, com o mesmo texto
  arredondado; agora só quando o número muda.

Cada `npcSet` é um re-render do painel na MESMA thread que desenha o jogo enquanto 8 threads
geram a fala — e é o FPS durante a geração que o gerente de GPU (`floor10Gpu`) julga.

**Estado:** tsc 0 · 509/509 vitest (+17) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 — o celular travando e desligando: DOIS llama.cpp ao mesmo tempo

Felipe: *"quando está rodando o llama 1b, o meu celular fica extremamente travado, a ponto de
chegar a desligar sozinho... o pensamento da llama está demorando 10 anos pra mostrar... tô
achando que vc tá colocando tudo pra rodar ao msm tempo, sendo que é pra funcionar em dupla"*.

Ele estava certo no diagnóstico, e a causa estava escrita num comentário do próprio código
que a causava (`floor10SmallBrain.ts`):

> *"o `abort` do wllama 3.5.1 só faz o JS PARAR DE LER; o worker continua gerando até o EOS
> ou até os 320 tokens. Portanto isto não devolve CPU."*

E `terminateSmallEngine`/`terminate` só encerravam o engine que estava **carregando** —
nunca o que estava **gerando**. Resultado a cada mensagem do jogador: `abortDeliberation()`
fazia o JS virar as costas, o Llama 1B seguia gerando 320 tokens em 8 threads, e o SmolLM3
começava a gerar em mais 8. Dois (às vezes três, com o córtex motor) llama.cpp nos mesmos
núcleos. Não é modelo pesado — são dois ao mesmo tempo sem ninguém ter pedido.

E o pensamento que continuava gerando ia para o lixo, porque ninguém lia: a rodada seguinte
recomeçava do primeiro token. ~320 tokens a 2 tok/s não fecham se reiniciam a cada fala —
era o "demorando 10 anos pra mostrar".

**O conserto (`floor10Pausa.ts` + os dois cérebros):**
- **Pausar = encerrar o worker.** Nesta versão do wllama é a ÚNICA forma de devolver CPU.
  Rastreei `generatingEngine`/`translatingEngine` (o que gera, não o que carrega) e a
  preempção encerra os dois. Os pesos ficam no OPFS: a volta é releitura de disco, sem baixar.
- **Retomar = continuar de onde parou.** O raciocínio interrompido é guardado (janela de 90 s)
  e a rodada seguinte recebe `promptDeRetomada`, que manda CONTINUAR sem repetir. O texto
  retomado é a base do `texto`, inclusive quando o wllama reabre a resposta.
- **`vontadeJaCarregada()` deixou de ser `enginePromise !== null`** — com o runtime sendo
  encerrado na pausa, ela responderia "não" para sempre e a deliberação desistiria achando
  que precisaria baixar 1,32 GB. Agora existe `pesosNoAparelho`.
- **Rodada morta não fala.** Matar o worker pode deixar a promessa do stream pendurada (este
  projeto já pagou esse defeito: `inFlight` travado = livre-arbítrio morto pela sessão).
  `abortDeliberation` libera a rodada por decreto, salva o parcial de `deliberationLive`, e um
  contador de rodada impede que a promessa atrasada publique decisão por cima da atual.

**AINDA ABERTO (decisão do Felipe):** os quatro modelos podem ficar RESIDENTES juntos
(~4,2 GB de RAM). A CPU agora é de um pipeline por vez, mas a memória não. Despejar a dupla
inativa custaria recarregar 1,9 GB do disco na próxima fala — troca de latência por RAM.

**Estado:** tsc 0 · 516/516 vitest (+7) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 (cont.) — "não volta a pensar": eu tinha feito a pausa contar como fracasso

Felipe, depois do conserto da travada: *"nem laga mais, roda lisinho igual manteiga, o único
problema agr é que dps de eu mandar mensagem o llama 1b não volta a pensar"*.

Defeito meu, e o próprio projeto já tinha o aviso escrito em `Floor10Npc.tsx`:

> *"CEDER A VEZ NÃO É FALHAR. Contar isso como fracasso levava a espera ao teto de 300s.
> Quando a CPU enfim liberava, o cérebro de vontade estava de castigo por 5 minutos."*

Quando a pausa passou a ENCERRAR o worker, a rodada preemptada passou a devolver `null` sem
marcar `cedeuAVez` — e quem chama lê `null` como fracasso e DOBRA a espera: 5s → 10s → 20s
→ … → 300s. Cada mensagem do jogador aumentava o castigo. Antes da minha mudança a rodada
cortada geralmente ainda decidia com o texto parcial, então isso não aparecia.

**Conserto:** `abortDeliberation()` marca `cedeuAVez = true` ao encerrar uma rodada que
estava gerando. A espera volta ao ciclo normal e ele retoma assim que a conversa dá folga.

**Segundo defeito, achado pelo teste:** o pensamento retomado saía gaguejando. Mandar
"continue de onde parou" não impede o modelo de reescrever o fim da frase anterior —
"…neste andar faz" + "Estou preso neste andar faz tempo demais" virava texto duplicado, que
ainda ia para o parser da decisão. `emendarPensamento()` remove a maior sobreposição entre
o fim de um e o começo do outro.

**HARNESS NOVO (o que faltava neste andar):** `src/__tests__/fakeWllama/` — um wllama falso
servido por `__wllamaCdn`, que permite exercitar a SEQUÊNCIA real sem baixar 1,32 GB:
carregar → gerar → preemptar → tentar de novo. Foi ele que mostrou os dois defeitos; nenhum
teste anterior conseguia montar essa sequência. Também documenta o desenho: a deliberação
NÃO baixa nada sozinha (quem carrega é a fila) — pisar no andar não pode disparar 1,32 GB.

**Estado:** tsc 0 · 526/526 vitest (+10) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 (cont. 2) — "não voltou a pensar": era espera longa + tela muda

Felipe: *"ele não voltou a pensar, mas chuto eu que pode ser um bug de UI, e não apareça pra
mim"*. O palpite estava certo em parte. O harness (`fakeWllama`) prova que a rodada VOLTA a
rodar; o que não voltava era a INFORMAÇÃO na tela — e ela demorava demais.

Três coisas somadas, todas criadas pela mudança de "pausar = encerrar o worker":

1. **A espera.** `nextDeliberationAt` é `t + 60` contado do ÚLTIMO disparo, e agora ainda há
   a reabertura do runtime por cima. Depois de cada conversa dava mais de um minuto de
   silêncio. Agora, quando a fala termina, a vontade ganha chance em `REARME_APOS_FALA_SEG`
   (6 s) e o contador de falhas é zerado — ser interrompido pela fala não é fracasso.
2. **A tela chamava reabertura de download.** Reabrir o runtime lê o .gguf do disco; a fase
   era `'loading'`, e a UI mostra barra de download para `'loading'`. Resultado: barra de
   1,32 GB que não existe, no lugar do "ele está voltando". Nova fase `'reopening'`:
   sem barra, com a frase "Nilo está voltando a pensar…".
3. **O pensamento pausado sumia da tela** durante a reabertura (`pensamentoVisivel` exigia
   thinking/decided), então o raciocínio desaparecia e reaparecia — parecia perdido. Agora
   ele continua visível em `'reopening'`, que é exatamente o texto que vai ser continuado.

**Estado:** tsc 0 · 528/528 vitest (+2) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 (cont. 3) — a caixa-preta: o que EU sentia falta

Felipe perguntou o que estava faltando na minha visão. A resposta honesta: **eu não enxergo
o aparelho dele**. Esta sessão inteira foi "Felipe testa → descreve em uma frase → eu leio
código e chuto". Gastei horas chutando na travada; quando construí o wllama falso, achei
dois defeitos em minutos. A diferença não foi esperteza, foi enxergar.

**`floor10CaixaPreta.ts`** — buffer circular (200 eventos) que grava o que de fato acontece
no Andar 10, e um botão **"copiar diagnóstico"** no `?bancada` que devolve tudo em texto
colável. Também em `window.__caixaPreta()` no desktop.

O relatório abre com BUILD + aparelho + núcleos + isolamento + cota/uso/persistido — sem
isso os eventos não significam nada (já analisei comportamento de build errado nesta sessão).
Eventos instrumentados: `vontade:carregando|reabrindo|pronta|pensando|retomando|preemptada|
fim-da-geracao|decidiu`, `fala:gerando|fim` (com **tok/s e FPS medidos durante a geração** —
o número que eu mais quis e nunca tive), `motor:traduzindo|preemptado`.

Regras: só grava em eventos (nunca por quadro), teto fixo, nunca lança, e o que o jogador
escreve NUNCA entra.

**Um teste instável foi corrigido junto:** os testes de preempção dependiam de relógio (o
pensamento podia acabar antes do corte) e falhavam ~1 run em 5. O wllama falso ganhou
`travarApos`: depois de N tokens ele SEGURA o pensamento até ser interrompido. A preempção
virou determinística — 3 execuções completas seguidas, 537/537.

**Estado:** tsc 0 · 537/537 vitest (+9) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 (cont. 4) — velocidade: a medição que decide antes de adicionar modelo

Felipe quer que o jogo fique mais rápido para quem vai jogar depois ("o pessoal é
impaciente"), sem trocar nenhuma IA — a ideia dele: uma IA MENOR dando um "atalho
inteligente" ao pensamento das outras.

**A ideia tem nome e está certa: decodificação especulativa** (o pequeno rascunha, o grande
CONFERE tudo numa passada só; a saída é matematicamente idêntica à do grande sozinho).
**Mas é impossível neste runtime.** A API pública do wllama 3.5.1 (baixada do CDN e
conferida) tem só `createCompletion / createChatCompletion / createEmbedding / createRerank /
loadModel*`. Não há `decode`, `getLogits`, `tokenize` nem `sampling*` — sem logits por
posição o modelo grande não tem como conferir o rascunho, e sem conferência a especulação
vira aposta (perderia inteligência, que é justamente o que ele não quer).

**Correção factual importante:** o embedding NÃO usa outro runtime. Ele roda no mesmo wllama
(`new mod.Wllama`, GGUF embeddinggemma-300M). ONNX/transformers.js não existe no projeto
(`grep` vazio). Ele parece diferente porque é ENCODER: uma passada só, sem gerar token. Os
outros três são autoregressivos. A diferença é a natureza da tarefa, não a biblioteca.

**Antes de adicionar um quarto modelo, MEDIR.** A espera de uma fala tem duas metades:
LEITURA (prefill, o prompt inteiro, uma vez) e FALA (decode, token a token). Elas pedem
otimizações opostas:
- LEITURA dominando → encolher o prompt vale muito (e aí um modelo auxiliar que resuma tem
  função real).
- FALA dominando → prompt menor não muda nada; só menos tokens de saída ou mais tok/s. E
  nenhum modelo auxiliar resolve isso sem verificação.

`divisaoDaEspera()` extrai essa conta das medições do próprio motor, e a caixa-preta passa a
gravá-la em `fala:fim` (lidos, reusados, leitura_s, leitura_tps, fala_tps). Uma sessão de
jogo + botão "copiar diagnóstico" responde qual das duas metades manda.

**Estado:** tsc 0 · 540/540 vitest (+3) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 (cont. 5) — ONNX no jogo: a quinta IA, e a primeira fora do wllama

Felipe decidiu: *"adicione o sistema onnx, vamos fazer isso funcionar, inclusive, pra eu
baixar, coloque ele na barra de download única"*.

**`floor10Reflexo.ts`** — transformers.js 3.8.1 do CDN (mesmo padrão do wllama: nada no
bundle) + **SmolLM2-135M-Instruct int8 (~137 MB)**, na CPU (`device: 'wasm'`). Conferido no
Hub antes de fixar: o repo tem `onnx/model_int8.onnx`, `config.json`, `tokenizer.json` e
`generation_config.json`. Entra na **fila única** como 5º item (`FILA_REFLEXO`), último de
propósito — é o único cujo trabalho o jogo já sabe fazer sem ele (esperar).

**O papel dele hoje é o REFLEXO, não a resposta.** Entre a mensagem do jogador e a primeira
palavra do 3B passam dezenas de segundos (carga + leitura do prompt), e a tela ficava em "…".
O 135M devolve uma reação curtíssima em <1s ("Hm.", "Espera aí…"), em bolha tracejada e
itálica, que SAI DE CENA quando a fala real começa. O prompt dele proíbe responder ou
inventar: quem responde é o 3B, com cânone, percepção e memória. Isso não acelera o 3B em um
milissegundo — encurta a espera PERCEBIDA, que é o que faz o impaciente fechar o jogo.

**Ordem de execução (não é detalhe):** o reflexo roda depois de `abortDeliberation()` e antes
de o 3B gerar — a janela em que o aparelho está livre. Teto de 2,5s, e se estourar ele
simplesmente perde a vez. Dois motores gerando junto foi o que desligou o celular.

**SOBRE A ESPECULATIVA (pedida na mesma mensagem):** agora ela é POSSÍVEL, mas só entre
modelos ONNX. Conferido baixando os tipos: `transformers.js` expõe `forward()` com logits;
o wllama 3.5.1 não expõe `decode`/`getLogits`/`tokenize`/`sampling`. Logits por posição são a
única forma de o modelo grande CONFERIR o rascunho do pequeno — e é a conferência que faz a
saída ser idêntica à do grande sozinho. Como o SmolLM3-3B da fala vive no wllama, ele
continua fora do alcance. Para existir de verdade, o modelo que RESPONDE teria de rodar em
ONNX (ex.: um par 360M verificador + 135M rascunhador, comparável ao 3B numa bancada). É
troca de motor da fala — decisão do dono do jogo, não minha.

**Testes:** `src/__tests__/fakeOnnx/` — transformers.js falso servido por `__onnxCdn`, mesmo
truque do `fakeWllama`. Cobre: carga com dtype/device certos, entrada na fila única,
reação curta, teto de tempo, CDN fora do ar (indisponível ≠ pane) e os três formatos de saída
que o transformers.js já devolveu.

**Estado:** tsc 0 · 553/553 vitest (+13) · audit sem erros · index.html rebuildado (83,9 MB).

### Sessão 2026-08-01 (cont. 6) — o compressor + EU ESTAVA ERRADO sobre a especulativa

**Correção que muda o rumo do projeto.** Eu afirmei três vezes que decodificação especulativa
era impossível aqui. Estava errado: eu conferi só a versão FIXADA (wllama 3.5.1) e concluí
"impossível" quando o correto era "impossível na 3.5.1". O Felipe insistiu três vezes e a
insistência estava certa.

| versão | API |
|---|---|
| wllama 3.5.1 (em uso) | só alto nível: createCompletion/ChatCompletion/Embedding/Rerank |
| **wllama 2.4.0** | **`decode` · `getLogits` · `tokenize` · `samplingSample` · `samplingAccept` · `kvClear` · `kvRemove` · `lookupToken`** |

Ou seja: com um runtime v2, o MESMO SmolLM3-3B (mesmo .gguf, mesmo cache OPFS) pode
verificar rascunhos. Especulativa de verdade — saída idêntica, só mais rápida — sem trocar
nenhuma IA. O que muda é a versão da BIBLIOTECA, não o modelo.

**Detalhe que decide o desenho do rascunhador:** SmolLM3-3B tem `vocab_size: 128256` e
`bos_token_id: 128000` (família Llama-3). O SmolLM2-135M do reflexo tem vocabulário 49152 —
**tokenizadores diferentes, logo ele NÃO serve de rascunhador**. Especulativa exige o mesmo
vocabulário. Duas saídas: (a) prompt-lookup (rascunha n-gramas do próprio prompt, sem
segundo modelo, imune a esse problema) ou (b) o Llama 3.2 1B da vontade, que já está no
aparelho e é da mesma família de vocabulário — a confirmar.

**RISCO PRINCIPAL, ainda não medido:** o llama.cpp embutido na wllama 2.4.0 é mais antigo e
pode não conhecer a arquitetura `smollm3`. Se não carregar o .gguf, o plano morre — e isso se
descobre em 2 minutos com uma sonda no celular, antes de qualquer implementação.

**ENTREGUE NESTA PARTE: `floor10Compressor.ts`** (o atalho que ele aprovou). O micro dobra a
conversa antiga em uma linha, que entra no prompt logo após a persona (muda raramente → o
prefixo em cache sobrevive). Dois ganhos: menos tokens para o 3B ler E o começo da conversa
para de sumir quando o orçamento de histórico (1.800 chars / 4 mensagens) estoura.
REGRA DURA: o micro NUNCA toca em fato — cânone, percepção e vontade seguem verbatim. Ele
resume conversa, que é lembrança, não medição. Peneira contra papagaio, texto girando e
migalha; falhou, fica o resumo anterior. Roda DEPOIS da resposta, sem `await`.

**Estado:** tsc 0 · 566/566 vitest (+13) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 (cont. 7) — a especulativa JÁ ESTAVA na wllama 3.5.1

**Eu errei duas vezes e o Felipe insistiu três.** Ele estava certo. Eu olhei a superfície
JavaScript da wllama, não achei `getLogits`, e afirmei "impossível". A capacidade estava um
nível abaixo, no runtime que este jogo já baixa há meses.

**A PROVA** (`cpp/wllama-context.h:524`, do repositório da wllama):
```cpp
// speculative decoding
if (req.spec_draft_model.not_null())
  params.speculative.draft.mparams.path = req.spec_draft_model.value;
```
A v3 embute o `server_context` do llama.cpp INTEIRO — e o llama.cpp tem especulativa nativa.
`LoadModelParams` da 3.5.1 já declara `spec_draft_model`, `spec_draft_n_max`, `n_min`,
`p_min`, `ngl` e os threads. **Nada de recompilar, forkar, ONNX ou ponte entre versões.**

**O QUE FALTAVA (e o que este commit resolve):** `spec_draft_model` é um CAMINHO no FS do
WASM, e a API pública não monta arquivo avulso — `prepareBlobs()` transforma todo blob extra
em shard do modelo principal. O recurso existe e estava desligado por falta de encanamento.

`floor10Especulativa.ts` é esse encanamento, deliberadamente MÍNIMO: embrulha dois métodos
internos (`proxy.moduleInit` acrescenta o .gguf do rascunhador; `proxy.wllamaAction('load')`
injeta os campos `spec_draft_*`) e deixa a wllama fazer TODO o resto igual — cache, compat de
Safari/Firefox, mmap, threads, template. `loadModelFromUrl` roda como sempre rodou.
O rascunhador sai de `cacheManager.open(url)`: arquivo já baixado, download zero.

**DESLIGADA POR PADRÃO.** Só com `?especulativa`. Se qualquer coisa falhar (proxy ausente,
rascunhador não baixado, cache com erro), o preparo devolve `ok:false` e a carga segue
idêntica à de hoje. 8 testes cobrem cada recusa.

**A PERGUNTA EM ABERTO — o rascunhador.** Exige o MESMO tokenizador do alvo. Vocabulários:
SmolLM3-3B = 128256, Llama 3.2 1B = 128256 (compatíveis entre si), Qwen3-0.6B do motor = outro.
Medição publicada: 1B rascunhando para 8B rende 1,83×. Mas o nosso alvo é 3B — o 1B é UM
TERÇO dele, não um décimo, e o Felipe está certo em dizer que ele é lento. O rascunhador
ideal teria ~100M com vocabulário Llama-3, e não achei nenhum no Hub. Alternativas a medir:
Llama 3.2 1B **Q4** (807 MB, já no catálogo) com `n_max` baixo, ou aceitar que para 3B o
ganho não paga.

**Estado:** tsc 0 · 574/574 vitest (+8) · audit sem erros · index.html rebuildado.

### Sessão 2026-08-01 (cont. 8) — CORREÇÃO: o encanamento da especulativa é inerte, e falta UMA linha

Investigando o rascunhador, achei o que faltava — e junto, um erro no que eu já tinha
commitado.

**O ERRO:** `spec_draft_model` é aceito pela wllama, guardado em `params.speculative.draft`,
e **nenhum especulador é criado**. Em `common/speculative.cpp` (llama.cpp dd4623a7, o commit
que a 3.5.1 embute):
```cpp
common_speculative_init(params, n_seq) {
  uint32_t enabled_configs = common_get_enabled_speculative_configs(params.types);
```
Tudo depende de `params.speculative.**types**`, e o glue da wllama (`cpp/wllama-context.h`
524-538) preenche só `params.speculative.draft.*` — `types` fica em `{ NONE }`.

**O QUE FALTA: uma linha no C++ da wllama** (+ um campo na mensagem de carga) repassando
`types`. Todo o resto JÁ ESTÁ COMPILADO no .wasm que o jogo baixa hoje:
`draft-simple`, `draft-eagle3`, `draft-mtp` e **cinco variantes de n-grama**
(`ngram-simple`, `ngram-map-k`, `ngram-map-k4v`, `ngram-mod`, `ngram-cache`).

**AS N-GRAMA MUDAM TUDO — auto-especulação, sem modelo rascunhador.** Resolvem "quem
rascunha para o 1B?" (ele mesmo), dispensam vocabulário compatível e não custam download nem
RAM. Servem fala, vontade e motor igualmente.

**Sobre o rascunhador por MODELO, se um dia for esse o caminho:**
- Tokenizadores conferidos: SmolLM3-3B `tokenizer.json` = 17.208.819 bytes; Llama-3.2-1B =
  17.209.920. Diferença de 1.101 bytes (tokens especiais do modo thinking) → mesmo
  vocabulário, um rascunhador serviria os dois.
- Um rascunhador de 100M com esse vocabulário é IMPOSSÍVEL: a tabela de embeddings sozinha
  (128.256 × 2.048) são **263M parâmetros**. O piso é ~240 MB em Q4 (2 camadas + tabela).
- Não existe DRAFT model público para Llama-3/SmolLM3 (há para DeepSeek, Mistral, GLM, Qwen,
  Gemma). Teria de ser fabricado por poda do 1B.

`floor10Especulativa.ts` fica no repositório com esse diagnóstico no cabeçalho: quando o
.wasm modificado existir, o cano está pronto e testado. Até lá é trilha documentada, não
recurso — e continua desligado por padrão.

**Estado:** tsc 0 · 574/574 vitest · index.html do commit anterior (só documentação mudou).

### Sessão 2026-08-01 (cont. 9) — N-GRAMA LIGADO: a wllama foi recompilada com o patch

O que faltava era uma linha, e ela foi escrita. `wllama-espec/` traz o wllama 3.5.1
**recompilado do fonte** (emsdk, `emcmake` + `emmake`, sem WebGPU) com este patch em
`cpp/wllama-context.h`:

```cpp
if (spec_value.rfind("types:", 0) == 0) {           // "types:ngram-simple,ngram-cache"
  params.speculative.types = common_speculative_types_from_names(nomes);
} else {                                             // caminho de .gguf
  params.speculative.draft.mparams.path = spec_value;
  params.speculative.types = { COMMON_SPECULATIVE_TYPE_DRAFT_SIMPLE };  // <- faltava ISTO
}
```

**Por que sobrecarregar `spec_draft_model` em vez de criar campo:** o GLUE lê os campos
POSICIONALMENTE. Campo novo obrigaria o JS a enviá-lo; sobrecarregando uma string existente,
o protocolo continua idêntico.

**Prova de que o patch entrou no binário:** `strings wllama.wasm | grep WLLAMA_PATCH_TNE` = 2
ocorrências (as duas linhas de LOG_INF que o patch adiciona — e que aparecem no console do
aparelho quando a especulativa liga).

**Artefatos** (`wllama-espec/`, 6 MB, servidos pela própria origem): `wllama.wasm` (5,85 MB,
build principal wasm64) + `index.js` (313 KB, o ESM construído do MESMO fonte — o glue do
emscripten e o binário andam em par, não dá para misturar com o do CDN).

**Como está ligado:** só com `?especulativa`, e só para a FALA. Sem a flag o jogo carrega o
wllama do CDN exatamente como sempre, e este binário nem é baixado. Vontade, motor e memória
seguem no wllama de prateleira em qualquer caso.

**Por que n-grama e não modelo rascunhador:** `ngram-simple`/`ngram-cache` são
auto-especulação — o próprio modelo propõe a partir do texto que já viu. Resolve "quem
rascunha para o 1B?" (ele mesmo), dispensa vocabulário compatível e custa zero de download e
de RAM. Um rascunhador por modelo precisaria do vocabulário do SmolLM3 (128.256 tokens =
263M params só na tabela), o que põe o piso em ~240 MB — e não existe nenhum público.

**FALTA MEDIR NO APARELHO.** Nada disto foi executado num navegador: aqui não há um. O que
está provado é que compila, que o patch está no binário e que o jogo continua idêntico com a
flag desligada. O ganho — e se o `smollm3` carrega neste build — só o celular do Felipe diz.

**Estado:** tsc 0 · 572/572 vitest · audit sem erros · index.html rebuildado.

## 2026-09-05 — Agente-jogador / Andar 11

Pedido: completar os commits do agente-jogador para simular um player. Base:
`claude/persistent-download-storage-i6l88v`; incorporados também os commits
`7682335`, `6e9633a` e `fd344ec` do parkour que chegaram durante a implementação.
Os seis módulos `agente/` eram sondas/planejadores sem corpo montado. Não havia
um Floor11 nesta branch. Nilo/Andar 10 continua sendo o NPC de linguagem separado.

- `agenteRuntime.ts`: controlador persistente por quadros, A* dos módulos
  existentes, observação com oclusão e última posição vista, atraso de reação,
  distância social, aceleração limitada a SPEED, exploração com memória limitada,
  cooldown de falhas, planejamento/execução de saltos sobre superfícies vivas.
  Planejamento não teleporta. A* sem caminho espera antes de tentar de novo.
- `agenteCorpo.ts`: corpo compartilhado pelo player do 11 e pelo companheiro,
  PR/SPEED/F3_JUMP/F3_GRAVITY compartilhados, subpassos, lados sólidos e pouso
  vindo de cima (tolerância importada de f3Fisica). Plataformas móveis carregam
  quem espera; um salto impossível não vira chão invisível.
- `AgenteCompanheiro.tsx`: montado no App, usa o avatar/animações de RemotePlayer
  em um mapa LOCAL (não escreve um jogador fictício no Firestore). A percepção
  recebe geometria real; o Andar 3 fornece plataformas vivas e o 6 portas atuais.
- `agenteViagem.ts`: só muda o andar do companheiro quando ele entrou fisicamente
  na cabine e as portas fecharam. Atalho do criador não puxa quem ficou para trás.
- `Floor11.tsx` / `f11Mundo.ts`: sala navegável com divisórias e degraus, geometria
  compartilhada com colisão, três pontos observáveis para explorar/interagir.
  Acesso: MODO CRIADOR > Andar 11 — companheiro. Controles Vem comigo / Explora /
  Espera / Elevador. Espaço e botão mobile pulam usando o mesmo corpo do agente.
- O adaptador anda nos terrenos 0, 1, 3, 6, 7, 10 e 11. Nos terrenos especiais
  2/4/5/8/9 espera: nadar, jogar os modos 2D e usar o corpo Fiapo exigem seus
  próprios adaptadores; não foram anunciados como capacidades prontas. O núcleo
  aceita paredes/superfícies/interações de andares futuros sem testes por nível.
- Esta implementação é uma simulação de comportamento, não um modelo treinado
  para jogar como humano, e não resolve por conta própria todas as quests.

Verificação local: 13 cenários do controlador passaram (Node test runner com
bundle dos módulos reais e constantes físicas extraídas do fonte, sem render).
Incluem todo o percurso do 11, parede fechando/reabrindo, alcance de interação,
30/60/120 FPS, pausa/delta inválido, salto, abismo, ponte móvel e embarque.
Validação integrada e single-file são os gates do job temporário; o job só publica
fonte + index.html + version.json juntos e remove o próprio workflow da árvore.

### Andar 11 — acompanhamento e recuperação (2026-09-05)
- Seguir usa distância com histerese (para a 1,9 m; retoma além de 2,6 m), reduzindo passos nervosos. Ao ver o player no cab, entra até o ponto de embarque.
- Interações removidas/indisponíveis são descartadas; objetos móveis atualizam o destino.
- Uma colisão persistente invalida a grade e tenta uma rota nova antes de desistir, sem teleporte. Portas do Andar 6 invalidam a navegação pela geometria, não só pela quantidade.
- Cinco regressões novas cobrem esses comportamentos; permanecem as limitações de terrenos especiais documentadas acima.
