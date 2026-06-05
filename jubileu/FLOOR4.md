# FLOOR4.md — Guia de construção do Andar 4 (e de qualquer andar novo)

> **Propósito:** construir o Floor 4 gastando o MÍNIMO de tokens. Leia ISTO em vez de
> reler o `App.tsx` (2140 linhas) e re-derivar como um andar funciona. Tudo aqui é
> ancorado em `grep` (não em números de linha, que mudam). O Floor 3 é o exemplo
> COMPLETO — clone os padrões dele.

---

## 0. Estado atual do Floor 4

> **IMPORTANTE — o que ship e o que é dev-only:** o ANDAR (`Floor4.tsx` + `Floor4Elevator.tsx`
> + `floor4-pixels.ts` + helpers) **ENTRA NO JOGO** (App monta em `level === 4`). Só o
> RUNNER (`floor4.html`, `src/floor4-dev.tsx`, `dev-shot.cjs`) é dev-only — ele apenas roda
> os MESMOS componentes do andar isolados pra eu ver na tela. O build de produção inlina só
> o `index.html`, então o runner não ship, mas o `Floor4.tsx` que ele renderiza SIM.

- **🛠️ BANCADA DE DEV ISOLADA (construa o andar SEM tocar no App.tsx):**
  - `floor4.html` + `src/floor4-dev.tsx` — monta os componentes REAIS do Floor 4 (de
    `./Floor4`) num `<Canvas>` próprio (sem App.tsx/outros andares/Firebase), com OrbitControls
    + um cápsula de escala. Edite `Floor4.tsx` → aparece aqui E vai pro jogo.
  - **Rodar:** `cd jubileu && npm run dev` → `http://localhost:3000/floor4.html`.
  - **Screenshot:** `node dev-shot.cjs floor4.html floor4` (com o dev server up) → `/tmp/floor4.png`.
  - **Fluxo:** desenvolva TUDO do Floor 4 aqui, veja via screenshot, e só no FIM faça o
    wiring pequeno no App.tsx (§2). Tudo usa textura procedural (sem asset externo) → roda offline.
- `src/Floor4.tsx` — o andar (100% 2D): `useFloor4Audio` hook + `Floor4Environment` (céu flat
  + chão pixel unlit + elevador). Bloco `FLOOR4 = {...}` pra reskin. Slots no JSX:
  `ENV PROPS / ENTITIES / HAZARDS / CUTSCENE`.
- `src/Floor4Elevator.tsx` — ✅ elevador 100% 2D pixel-art (batente + portas que deslizam +
  poço + indicador). `src/floor4-pixels.ts` — helper `pixelTex`/`px` (CanvasTexture NearestFilter).
- `src/floor4Sfx.ts` — scaffold de SFX (espelho do floor3Sfx, vazio).
- `dev-shot.cjs` — ferramenta de screenshot reutilizável (`node dev-shot.cjs <html> <tag>`).
- **Já wired no App.tsx** (mínimo): import + render (`level === 4`), o hook
  `useFloor4Audio(currentLevel === 4, audioCtx, cartoonBusRef)`, e a CHEGADA
  (`advanceToFloor4AfterWin` → `setNextElevatorDestination(4)` quando vence o Floor 3).
- **Estilo definido:** 100% 2D pixel-art em 1ª pessoa (ver §8). Conteúdo do mapa/tema: a
  decidir com o Felipe.

---

## 1. Anatomia de um andar (o que o Floor 3 tem)

| Concern | Arquivo(s) Floor 3 | O que faz |
|---|---|---|
| Ambiente 3D | `Floor3.tsx` (`Floor3Environment`) | Render do mundo: chão/plataformas, luz, céu, props. Exporta `PlatformView` (reutilizável). |
| Geração do mundo | `f3Parkour.ts` | Estado mutável compartilhado (array `platforms`, `f3PlayerZ/Y`), gerador `makeNext` (mulberry32), `tick()`, `nearestPlatform()`, `respawnPoint()`. |
| Rival/NPC | `Floor3Rival.tsx` | Personagem procedural (usa `buildDiabreteRig`). Anima ossos por frame. |
| Objetivo/loop | `f3Hazards.ts` + `Floor3Hazards.tsx` | Estado compartilhado (`f3Progress`, `hazards`, `brushes`) + render. `setOnProgress(cb)` avisa o App; `f3Progress.fell` é a fonte da vitória. |
| SFX | `floor3Sfx.ts` | SFX sintetizados (Web Audio). `configureFloor3Sfx(ctx, dest)` na entrada, `clearFloor3Sfx()` na saída. NÃO passam pelo music director. |
| Música | via `musicDirector.ts` | `startCartoonMusic(..., {destination: getMusicBus('ragtime', 70)})` + `setMusicActive('ragtime', true)`. |
| Cutscenes | `CartoonIntro3D.tsx`, `Floor3Cutscene.tsx`+`diabreteScript.ts`+`Floor3CutsceneUI.tsx`, `Floor3FallCutscene.tsx` | Intro, apresentação (diálogo), e a derrota interativa. |
| Movimento do player | `Player.tsx` (branch `currentLevel === 3`) | Pulo/gravidade/parkour. Escreve `f3PlayerZ/Y`. |

**Floor 4 espelho sugerido** (crie só o que o tema pedir): `Floor4.tsx` (já existe),
`floor4Sfx.ts` (já existe), e conforme o design: `f4<Algo>.ts` (estado), `Floor4<Algo>.tsx`
(render/entidade), `Floor4Cutscene.tsx`, `floor4Script.ts`.

---

## 2. Checklist de integração no `App.tsx` (ancorado em grep)

> Para CADA item, faça `grep -n "<âncora>" src/App.tsx` e edite ali. O Floor 3/4 já
> aparecem como exemplo em todas estas âncoras.

1. **Imports** — `grep "from './Floor4'"` e `grep "floor4Sfx'"`. Adicione imports de
   novos arquivos do andar aqui.
2. **Render do ambiente** — `grep "level === 4 &&"` (no componente `World`, ~`grep "const World = React.memo"`). Já tem `{level === 4 && <Floor4Environment />}`. Se o andar precisar de flags (tipo `floor3FallActive`), adicione prop em `WorldProps` (`grep "interface WorldProps"`), no destructure do `World`, e na chamada `<World ... />` (`grep "<World timer="`).
3. **Áudio/música** — já encapsulado no MÓDULO: o hook `useFloor4Audio` (em `Floor4.tsx`)
   é chamado uma vez no App (`grep "useFloor4Audio" src/App.tsx`) e reserva o bus + SFX na
   entrada/saída. Pra dar música ao andar, edite o hook (não o App): adicione
   `startXxx(audioCtx, { destination: getMusicBus('floor4', 65) ?? undefined })` dentro dele.
4. **Chegada (elevador → andar)** — o fluxo é `setNextElevatorDestination(N)` e, na
   abertura das portas no destino, `setCurrentLevel(nextElevatorDestination)`
   (`grep "setNextElevatorDestination"` e `grep "setCurrentLevel(nextElevatorDestination)"`).
   Para vir do Floor 3 (vitória), já existe `advanceToFloor4AfterWin` (`grep "advanceToFloor4AfterWin"`).
5. **Gatilho de intro/cutscene na chegada** — padrão Floor 3: efeito com deps
   `[currentLevel, audioCtx, doorsClosed]`, gate `currentLevel === N && !doorsClosed`
   (`grep "currentLevel === 3 && !doorsClosed"`). Dispara na CHEGADA (portas), não no meio da viagem.
6. **Movimento custom do player** — em `Player.tsx`, `grep "currentLevel === 3"` mostra o
   branch de parkour; adicione `else if (currentLevel === 4) { ... }` ao lado (level 2 = nado,
   level 3 = parkour). Sem isso, level 4 usa o flat-walk default (`y=0`).
7. **Estados de cutscene** (se houver) — espelhe `cartoonIntro`/`cartoonCutscene`/`cartoonFall`
   (`grep "const \[cartoonFall"`). A trava de câmera de diálogo: passar `dialogueOpen` +
   `dialogueTargetRef` pro `<Player>` (`grep "dialogueTargetRef="`).
8. **Vitória/avanço** — copie `advanceToFloor4AfterWin` → `advanceToFloor5AfterWin`
   (teleport cutscene + `setNextElevatorDestination(5)` + elevador). Wire via `setOnProgress`
   do estado de objetivo (`grep "setOnProgress"`).

> **Regra:** prefira `grep` + `Read` com `offset/limit` no App.tsx. NUNCA leia o App.tsx
> inteiro — é o maior gasto de token do projeto.

---

## 3. Music director (`musicDirector.ts`)

- UMA música por vez, por prioridade. Buses: `engine`=10, `floor2`=60, `floor4`=65,
  `ragtime`(F3)=70, `chase`=100.
- API: `getMusicBus(id, prio)` (cria/pega o bus), `setMusicActive(id, bool)`, `reconcile()`
  (escolhe o vencedor — chamado por setMusicActive). Tudo roteia pelo master bus → respeita
  mute + slider de volume de graça.
- SFX (floor4Sfx) NÃO passam pelo director — sentam por cima, mas vão pro master via
  `configureFloor4Sfx(ctx, cartoonBusRef.current)`.

---

## 4. Como TESTAR de verdade (render offline) — ECONOMIZA MUITO TEMPO

O sandbox em nuvem **mata dev servers em background** SE você fizer errado. O jeito que
FUNCIONA (testado):

```bash
cd jubileu
npm run dev > /tmp/vite.log 2>&1 &          # background com & FUNCIONA (não use pkill antes)
VPID=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3000/<harness>.html && break; sleep 1; done
node <screenshot>.cjs                        # Playwright + swiftshader
kill -9 $VPID
```

**Harness isolado** (`jubileu/<nome>.html` + `src/<nome>.tsx`): monta SÓ o componente num
`<Canvas>`. Vite serve qualquer `.html` na raiz do projeto em dev. Só usa assets LOCAIS
(`/public/*.glb`), então roda offline. Para cutscenes, use os hooks DEV de scrub:
`window.__fallPhase='beg'; window.__fallScrub=<t>` congela um beat pra screenshot.

**Playwright** (`require('playwright')`, já instalado):
```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader'],
  headless: true });
// page.goto('http://127.0.0.1:3000/<harness>.html'); waitForTimeout(4500) p/ GLB; screenshot.
```
Erros normais e inofensivos no console: 404 (favicon) e ERR_CERT (recurso externo).

⚠️ Harness/screenshot são TEMPORÁRIOS — **apague antes de commitar** (`rm` + confirmar com
`git status`). Não são parte do build.

---

## 5. Landmines (NÃO repetir — já custaram tela preta)

- ❌ `useFrame(..., priority != 0)` — R3F v9 desliga o auto-render → tela preta.
- ❌ `SpotLight distance={0}` quando ativo (= alcance infinito) → tela preta.
- ❌ N8AO/postprocessing pesado em mobile.
- ⚠️ `bone.add(mesh)` em hierarquia de esqueleto — o Floor3Rival usa (pincel) e funciona,
  mas evite ADICIONAR casos novos; se der bug de transform/render, é o suspeito.
- ✅ OK: bone manipulation em `useFrame` priority 0 (com `useAnimations`/mixer antes);
  `Object3D` vazio como filho de bone; estender `MeshToonMaterial` via `onBeforeCompile`
  (mantém skinning — ShaderMaterial cru CONGELA o rig).

---

## 6. Regras de ouro do projeto (de MAP.md)

1. **SEMPRE** rebuilde o `index.html` ao editar `jubileu/src/` (`npm run build && node inline-build.mjs`). Doc-only (.md) NÃO precisa rebuild.
2. Use `npm ci` (não `npm install`).
3. Comite source + `index.html` juntos.
4. Atualize `MEMORY.md` após cada mudança real.
5. Antes de commitar: `npx tsc --noEmit` (0 erros), `npx vitest run` (verde), `node audit.mjs` (0 erros).

---

## 7. Mapa rápido do `App.tsx` (o que grepar p/ não ler tudo)

| Quero achar… | `grep` por |
|---|---|
| Componente do mundo | `const World = React.memo` |
| Props do mundo | `interface WorldProps` |
| Render por andar | `level === N &&` |
| Troca de andar / elevador | `setNextElevatorDestination` / `nextElevatorDestination` |
| Áudio/música por andar | `currentLevel === N` (nos `useEffect`) |
| Estados de cutscene F3 | `cartoonFall` / `cartoonIntro` / `cartoonCutscene` |
| Vitória → próximo andar | `advanceToFloor4AfterWin` |
| Diálogo/câmera-lock | `dialogueTargetRef=` / `dialogueOpen` |
| Teclado (pulo etc.) | `jumpRef.current = true` |
| Chamada do `<Player>` | `<Player active=` |

*Criado 2026-06-04 para preparar o Floor 4 (economia de tokens).*

---

## 8. Floor 4 = SIDE-SCROLLER 2D DE VERDADE (visão do Felipe)

Floor 4 é um **side-scroller 2D real** (estilo Mario/Celeste), NÃO 1ª pessoa, NÃO 3D
achatado. Câmera **ORTOGRÁFICA** (zero perspectiva), camadas de sprite pixel-art planas,
personagem de **PERFIL**. Referência: sala do elevador (esquerda, interior escuro,
"ELEVADOR" + planta) abrindo pra uma BASEPLATE ao ar livre (céu azul + nuvens + chão de
grama/terra), com o player andando pra direita.

### Abordagem de render (decidida)
- **Câmera ortográfica** (`<Canvas orthographic>` / `OrthographicCamera`) → 2D verdadeiro.
- Camadas planas: `PlaneGeometry` + `meshBasicMaterial` (`toneMapped={false}`) +
  `CanvasTexture` `NearestFilter`. Empilhadas em Z (sky→ground→room→props→player). Tudo
  procedural (sem asset externo) → roda offline na bancada.
- Unidades: chão TOPO em y=0; +x direita, +y cima.

### ✅ Cena 2D — FEITA e validada na bancada (`Floor4Scene2D.tsx`)
Bate com a referência: sky+nuvens, chão grama/terra tiled, sala escura do elevador,
elevador 2D + placa "ELEVADOR", planta, placa "BASEPLATE" no poste, setinha →, e um
PLACEHOLDER de personagem de perfil (trocar pelo sprite do Felipe). Rode:
`npm run dev` → `/floor4.html` (a bancada usa câmera ortográfica).

### ⏳ Falta pra ENTRAR no jogo (próxima etapa — "modo 2D")
O jogo é 3D 1ª pessoa (Canvas perspectivo + `<Player>`). Pra o side-scroller shipar:
1. **Câmera ortográfica no Floor 4** (montar `<OrthographicCamera makeDefault>` quando
   `level===4`; desligar o controle de câmera do `<Player>` nesse andar).
2. **Controles 2D**: esquerda/direita + pulo (gravidade), câmera segue o X do player.
   Novo branch em `Player.tsx` (`else if (currentLevel === 4)`) OU um controlador 2D dedicado.
3. Montar `Floor4Scene2D` no lugar do `Floor4Environment` 3D quando o modo 2D estiver pronto.

### 🎞️ Transição 3D → 2D (o "BEM animada" — ainda NÃO existe)
Na viagem de elevador Floor 3 → Floor 4: o 3D "colapsa em pixel 2D".
1. **Ramp de pixelação** ~1.5–2.5s no 3D: bloco cresce 1px→grande + quantiza cor +
   dessatura (pixelate pass leve OU render-to-low-res + upscale Nearest; `amount` rampando).
2. No pico, **corta pro side-scroller 2D** (câmera ortográfica + a cena 2D; portas 2D abrindo).
3. Áudio: descer o ragtime + sfx "8-bit downsample" (floor4Sfx).
- Iterar in-game (chegar = vencer Floor 3 ou atalho Modo Criador "Andar 4"). Dá pra
  prototipar o pixelate na bancada com `amount` via `window.__pix`.

### 🕹️ SPEC DO SPRITE DO PLAYER (pro Felipe — ATUALIZADO p/ side-scroller)
Agora é **vista de PERFIL (lado)**, não de frente — é um platformer 2D.

- **Formato:** PNG, fundo TRANSPARENTE, pixels limpos (sem anti-alias — vai NearestFilter).
  Paleta enxuta (~≤16 cores).
- **Direção:** desenhe virado pra DIREITA (eu espelho pra esquerda no código).
- **Tamanho por frame:** sugestão **32 × 48 px** (l×a), proporção ~2:3, múltiplos de 8 ajudam.
- **Layout:** TIRA HORIZONTAL, frames do MESMO tamanho, em ordem, sem espaçamento (eu fatio
  por índice). 1 arquivo por animação OU um sheet com linhas.
- **Animações:**
  - **idle** — 2 frames (respirando, parado de lado).
  - **walk/run** — 4–6 frames (ciclo de caminhada de PERFIL).
  - (Opcional: **jump** 1 + **fall** 1, pro pulo do platformer.)
- **Estilo:** o boneco do jogo ("bacon hair") reimaginado em pixel chunky de perfil,
  legível em ~48px de altura, contorno escuro fino opcional. Manda do teu jeito que eu adapto.

Manda os sprites que eu fatio em frames (CanvasTexture/atlas), espelho por direção e animo.
