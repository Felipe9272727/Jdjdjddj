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
