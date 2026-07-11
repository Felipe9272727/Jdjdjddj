# FLOOR7-BRIEF — pacote de contexto do Andar 7 (navio pirata)

> **Leia ISTO antes de tocar em qualquer arquivo do Andar 7.** Este brief substitui
> escavar o histórico. Não leia `index.html` (é ARTEFATO DE BUILD de ~65MB, nunca fonte).
> Não leia `Floor7.tsx` inteiro sem necessidade — vá direto à seção da sua raia.

## Arquitetura (contrato brain/render)

| Camada | Arquivo | O que é |
|---|---|---|
| **Brain (WASM)** | `wasm/floor7.c` (+ `floor7_asm.s`, `floor7_geo.cpp`) | TODA a lógica: estados, poças, maré, diário, landfall, embarque. Rebuild: `node wasm/build-wasm.mjs` (regenera `src/floor7-wasm.ts`, base64). |
| **Bridge** | `jubileu/src/Floor7Brain.ts` | Getters TS sobre o WASM (`state()`, `calm()`, `landfall()`, `logPage()`, `nearExit()`, `boarded()`…). |
| **Render** | `jubileu/src/Floor7.tsx` (~2100 linhas ⚠️ monolito, Fase 2 vai quebrar) | Navio, capitão, materiais `M.*`, overlay, diálogos, elevador. |
| **Água** | `jubileu/src/Floor7Water.tsx` | Gerstner (só wl ≥ 2.0 no vértice — chop fino é fragment-side; NÃO adicione ondas curtas no grid). |
| **Geometria do casco** | `jubileu/src/floor7Geo.ts` | `deckYAt(t)/beamAt(t)/railYAt(t)`, t∈[0,1], z_local = −7 + 15.2·t. **Assinaturas têm teste — não quebre.** |
| **Texturas** | `jubileu/src/floor7Textures.ts` | Canvas-textures (madeira, céu, vela). |
| **SFX** | `jubileu/src/floor7Sfx.ts` | WebAudio procedural. Sinos NÃO fazem glide de pitch (vira laser). |
| **Cutscene** | `jubileu/src/Floor7IntroCutscene.tsx` | Intro com dips de fade. |
| **Testes** | `jubileu/src/__tests__/floor7Brain.test.ts` | Quest inteira coberta. DONE auto-avança p/ SAIL após 4.6s — asserts usam `>=`. |

## Números que você vai precisar

- **Escala**: mundo = ship-local × **1.85** (`FLOOR7_SCALE`). Ex.: HELM local (−0.45, −5.3) → mundo (−0.83, −9.8).
- **Estados**: INTRO 0 → GREET 1 → FETCH 2 → CLEAN 3 → DONE 4 → SAIL 5 → ANCHOR 6 → FREE 7. `f7_can_leave()` só em FREE.
- **Spawn**: local (0.75, 4.3), theta π. **NUNCA volte pra x=0** (mastro do traquete na cara).
- Elevador local (0, 5.2) · Diário/escotilha local (0, −3.1) · Proa = +z, popa/leme = −z.
- Mão FP só aparece com balde na mão (`bucketState.held && elevFade < 0.85`).

## Ciclo visual (FUNCIONA — use-o; veredito sem olhar imagem = inválido)

Bench: `http://localhost:5173/floor7play.html` (vite: `cd jubileu && (npm run dev -- --port 5173 >/tmp/vite.log 2>&1 &)`).

Playwright headless (o Chromium do ambiente FUNCIONA com swiftshader):
```js
import { createRequire } from 'module';
const { chromium } = createRequire('/home/user/Jdjdjddj/jubileu/package.json')('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
```
Sondas do bench: `__ready`, `__teleport(x,z)` (MUNDO), `__setYaw/__setPitch`, `__cam(px,py,pz,tx,ty,tz)` (câmera livre, MUNDO) + `__camOff()`, `__forceTick(n,lx,lz,interact)` (LOCAL), `__state()`, `__puddles()`, `__resetBrain()`. O bench NÃO monta Bloom/EffectComposer (no jogo real o Bloom do App aplica: intensity 0.38, threshold 0.85 no andar 7).

**As 6 câmeras oficiais**: `node tools/f7shots.mjs [--out DIR] [--label nome]` gera os 6 postais
(proa-3/4, popa-3/4, convés, leme, costado/água, elevador/escotilha). Antes/depois de QUALQUER
mudança visual: rode, OLHE as 6, compare. É o critério de aprovação visual do projeto.

Receita p/ chegar em ANCHOR/FREE (driblando a quest inteira): ver `floor7Brain.test.ts` (o teste do finale) ou MEMORY.md § Andar 7.

## Landmines

1. `npx tsc --noEmit` SÓ de dentro de `jubileu/` (na raiz não há tsconfig — imprime help e "passa").
2. Mudou `floor7.c`? SEMPRE `node wasm/build-wasm.mjs` + rodar vitest. O TS não enxerga o WASM desatualizado.
3. Materiais `M.*` são compartilhados por dezenas de meshes — mudar cor de um material muda o navio inteiro. Cheque onde o material é usado antes.
4. `useFrame` com priority ≠ 0 → tela preta (R3F v9). Nunca.
5. Vela do traquete é FERRADA (enrolada na verga) de propósito — o elevador rematerializa em (0, 5.2) e uma vela solta atravessaria o cab.
6. Scripts de teste/screenshot: salve no scratchpad da sessão, NUNCA dentro de `jubileu/`.
7. Commits: mensagem PT-BR + trailers `Co-Authored-By: Claude <noreply@anthropic.com>` e `Claude-Session: <link da sessão>`. Só na branch designada.

## Protocolo de esquadrão (multi-agente)

- Cada agente tem RAIA (arquivos exclusivos). Fora da raia = pedir ao dono via SendMessage.
- Coordenação alegada sem SendMessage real = falha (os logs são auditados).
- Caiu por limite de sessão? Ao ser acordado, `git status` + reler este brief antes de retomar — o working tree pode ter mudado.
- O integrador (QA) fecha: critérios de aceite → build (`npm run build && node inline-build.mjs`) → commit → push (retry 2/4/8/16s).

## Plano estrutural vigente (decidido 2026-07-11)

1. **Fase 1 ✅** — este brief + `tools/f7shots.mjs` (6 câmeras).
2. **Fase 2** — quebrar `Floor7.tsx` em `floor7/{Hull,Rigging,Deck,Cabin,Captain}.tsx` + `materials.ts` (refactor mecânico; as 6 câmeras provam zero mudança visual).
3. **Fase 3** — navio novo: testar 1-2 créditos do Higgsfield `generate_3d` (concept → GLB, só visual, colisão/`deckYAt` ficam no WASM); se falhar, casco procedural replanejado (lofts, não caixas).
4. **Fase 4** — reacoplar poças/capitão/diário/elevador no navio aprovado.

## Reconstrução V2 (`agent/floor7-rebuild-v2`)

O render ativo preserva a quest e as coordenadas do WASM, mas substitui a apresentação:

- `src/floor7v2/Floor7ShipV2.tsx`: casco loftado, deck stack, cabine, mastros,
  velas, rigging e props instanciados;
- `src/floor7v2/Floor7WaterV2.tsx`: oceano opaco, duas ondas e foam/wake;
- `src/floor7v2/Floor7ViewModelV2.tsx`: mãos, escova e balde camera-attached;
- `src/Floor7PhaseCinematics.tsx`: partida, ancoragem e retorno do elevador;
- `src/Floor7IntroCutscene.tsx`: chegada de 11,5 s, sem troca de ator ou dips pretos.

O diário só abre em `ST_ANCHOR`, e o build reproduzível recompila o WASM antes do bundle.
