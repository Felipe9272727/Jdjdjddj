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

*Última atualização: 2026-04-28*
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

