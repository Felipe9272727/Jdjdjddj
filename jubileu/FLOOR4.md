# FLOOR4.md — Guia de construção do Andar 4 (e de qualquer andar novo)

> **Propósito:** construir o Floor 4 gastando o MÍNIMO de tokens. Leia ISTO em vez de
> reler o `App.tsx` (2140 linhas) e re-derivar como um andar funciona. Tudo aqui é
> ancorado em `grep` (não em números de linha, que mudam). O Floor 3 é o exemplo
> COMPLETO — clone os padrões dele.

---

## 0. Estado atual do Floor 4

- `src/Floor4.tsx` — scaffold themeável pronto (base plate + grid + céu + luz neutra +
  elevador). Bloco `FLOOR4 = {...}` no topo pra reskin de 1 bloco. Slots marcados no JSX:
  `ENV PROPS / ENTITIES / HAZARDS / CUTSCENE`.
- `src/floor4Sfx.ts` — scaffold de SFX (espelho do floor3Sfx, vazio).
- **Já wired no App.tsx** (não precisa criar do zero): import + render (`level === 4`),
  efeito de áudio (`currentLevel === 4` reserva o bus `floor4`), e a CHEGADA
  (`advanceToFloor4AfterWin` → `setNextElevatorDestination(4)` quando vence o Floor 3).
- **Tema NÃO definido** — o Felipe dita depois. Não invente o tema; espere o pedido.

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
3. **Áudio/música na entrada/saída** — `grep "currentLevel === 4"` (efeito que reserva o
   bus). Padrão:
   ```ts
   if (currentLevel === 4) {
       configureFloor4Sfx(audioCtx, cartoonBusRef.current);
       // quando tiver música: startXxx(audioCtx, { destination: getMusicBus('floor4', 65) ?? undefined }); setMusicActive('floor4', true);
   } else { setMusicActive('floor4', false); clearFloor4Sfx(); }
   ```
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
