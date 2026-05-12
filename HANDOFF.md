# HANDOFF.md — Notas pra próxima sessão

> Doc curto pra eu mesmo (Claude) na próxima vez que abrir este repo.
> O grande histórico cronológico continua em `MEMORY.md`; aqui ficam só
> as **decisões / gotchas frescas** que ainda não estão internalizadas
> em algum lugar evidente do código.

---

## Estado atual

- **Branch ativa:** `claude/read-map-memory-docs-2nqCj`
- **Último commit meu:** `d04bea1` — fix(flashlight): attach to right-hand bone
- **Sempre `git fetch` antes de mexer** — tem outra IA pushando no mesmo
  branch ocasionalmente. Já me bateu uma vez (perdi um commit local
  reset --hard).
- **NÃO uso sub-agents** — instrução do Felipe pra essa relação.
  (Eu uso só se ele pedir explicitamente.)

---

## Gotchas que custaram horas

### 1. Não escreva em `bone.position` / `bone.rotation` enquanto o `AnimationMixer` roda

Crash com tela preta + WebGL aborta. Causa: o mixer e seu código brigam
pelo mesmo campo todo frame, matriz mundial vira NaN, shader de
skinning divide por matriz degenerada.

**O que é seguro:**
- `bone.add(myGroup)` — adicionar **um filho** ao bone. O mixer continua
  donos da rotation do bone; o filho herda o transform via scene graph.
- `bone.getWorldPosition(target)` / `getWorldQuaternion(target)` — leitura.
- Authorar um novo clip e dar play no mixer (additive blend mode).

**O que crasha:**
- `bone.rotation.x = ...` em useFrame com Walking/Idle tocando.
- `bone.position.copy(...)` no mesmo cenário.

A "extensão do braço pra pegar item" que o Felipe pediu **não dá pra
fazer sem authoring de um clip novo**. A solução atual é a
`PickupAnimation.tsx` — o ITEM voa de fora até a mão, simulando o
gesto sem tocar no rig.

### 2. Avatar primitive está escalado 30× — meshes anexados ao bone precisam coordenadas TINY

```jsx
<primitive object={scene} scale={[30, 30, 30]} position={[0, groundY, 0]} />
```

Bones herdam o scale. Se você anexa um cilindro de 0.012 local ao
bone da mão, ele aparece com ~0.36m no mundo. **Não escale o mesh
direto pra "1m"** — vai aparecer gigante.

Implementação: `Player.tsx` no `Avatar`, `<primitive object={heldGroupRef.current}>`
com filhos usando args tipo `cylinderGeometry args={[0.0017, 0.0017, 0.014, 12]}`.

### 3. `wallsForState` em `constants.ts` precisa case explícito por nível

Já bati nessa: criei level 2, esqueci de adicionar o case, e o fallback
do else usava as walls da casa do Barney. Player era empurrado por
colisões invisíveis (cadeiras, sofás, paredes da casa) espalhadas no
plano vazio do level 2, e às vezes era jogado de volta dentro do
elevator zone → trigger automático → viagem pro lobby. Parecia teleport
"do nada" → era resposta de colisão.

**Sempre que adicionar nível, atualizar `wallsForState`.** A função tem
um `if (level === N)` por nível agora.

### 4. `useCallback` com deps que mudam por frame força re-render

`handlePlayerEnterElevator` originalmente tinha deps `[elevatorTimer, doorsClosed]`.
Durante qualquer viagem de elevador `elevatorTimer` muda 1×/segundo →
callback recria → `<Player/>` re-renderiza a cada tick (props new
reference). Custou FPS.

**Padrão correto:** `useCallback` com deps `[]` que lê o estado via
`useRef`. Já tá implementado em `App.tsx` (`elevatorStateRef`). Aplica
quando precisar.

### 5. Outra IA paralela mexe no mesmo branch

Pelo menos uma outra sessão de IA está fazendo commits aqui também.
Sintomas: você termina seu trabalho, faz `git push`, recebe rejeição,
pull --rebase dá conflito feio em vários arquivos. A solução foi
abandonar meu trabalho local naquela vez (`git reset --hard origin`),
porque o trabalho dela já cobria parte do que eu fiz.

**Antes de qualquer rebase complicado, ver o que apareceu de novo no
remote.** Pode ser mais barato discard local e adaptar.

---

## Sistemas implementados (resumo)

### Shop (`ShopOverlay.tsx` + `shop-dialogues.ts` + `dialogue-engine.ts`)

- Estilo Undertale: doors animation, dialog box preto+branco, heart cursor.
- **Dialogue engine** tokenizado com tags inline:
  `{y:texto}` cor, `{p}/{p:N}` pausa, `{s:..}` shake, `^^` quebra de página,
  auto-pagination por contagem de newlines.
- `Scene` aceita `acquireItem` — quando o player entra na cena, o shop
  fira `onAcquireItem(id)` (uma vez por visita).
- Música: `createLobbyMusic` (Rhodes piano procedural). Dark drone fica
  como `createDarkDrone` exportado pra usar em andares mais profundos.

### Inventory (`InventorySystem.tsx`)

- Estado tipado: `{flashlight: {owned, active}, cookie: {count}}`.
- Hook: `useInventory()` retorna `addItem`, `toggleFlashlight`, `useCookie`,
  `pickupAnim`, `clearPickupAnim`, `notification`, `cookieEffect`.
- HUD compacto bottom-center/landscape-right; oculto enquanto inventário vazio.
- F (desktop) liga/desliga lanterna; tap no HUD em mobile.

### Flashlight (`FlashlightLight.tsx` + `Player.tsx`)

- **Modelo 3D anexado ao bone da mão direita** (não floating world-space).
- `FlashlightLight` = `<spotLight>` que emite da posição da mão
  (`rightHandWorldPosRef` publicada pelo Avatar cada frame).
- `FPFlashlightHand` = braço procedural em primeira pessoa.
- Tinha `FlashlightModel3D` (floating world-space) — REMOVIDO,
  substituído pelo bone-attached.

### Pickup animation (`PickupAnimation.tsx`)

- `<PickupAnimator>` no Canvas; cubic ease-out lerp do item de
  `(player + forward*1.5, eye-level)` → `(player + right*0.32, hip-high)`
  em ~1.1s. Pointlight quente acompanha. Fires `onComplete` → host nula
  `pickupAnim` state.
- Durante a animação, `FlashlightModel3D` (que não existe mais) era
  suprimido. Hoje a versão bone-attached usa `heldItem` que é null
  enquanto `pickupAnim` está ativo.

### Level 2 (`HouseEnv.tsx::Level2Environment`)

- Plano off-white com grid seams + teto void escuro + shell do elevator.
- Felipe disse que vai povoar depois.
- Saved (sobreviveu ao Barney) → vai pro level 2 via viagem real de 20s
  (não teleport instantâneo). Caught → lobby + cena `post_death` no shop.

---

## Pendências / próximas conversas prováveis

- **Animação real de "estender o braço"**: precisaria de clip Mixamo
  separado (.glb exportado de Mixamo com pose "Pickup"), crossfade no
  mixer durante 1s, depois voltar pra Walking/Idle. Felipe sabe que a
  forma procedural via bone writes não dá. Se ele me der o GLB, é
  diretivo.
- **Conteúdo do level 2**: vazio de propósito; Felipe vai me passar
  ideias.
- **Mais items do shop**: Felipe disse que vai me dando aos poucos.
  Hoje tem flashlight (tool) e cookie (consumable). Os outros buy_*
  cenas existem como flavor narrativo sem `acquireItem`.
- **Música variante para floors mais profundos**: já tenho `createDarkDrone`
  pronta pra plugar.
- **Notification toast duplicado?**: `useInventory` chama
  `showNotification` E o HUD tem `flashNew/cookieNew` próprios. Se
  duplicar visual, simplificar.

---

## Onde NÃO mexer sem motivo

- `bellhop-sprites.ts` — voltou a ser base64 inlined depois que apontar
  pros PNGs do main mostrou que os PNGs eram sheets de referência, não
  strips pré-cortadas. Funciona como tá.
- `SpriteEngine.tsx` — cache global + RAF cleanup defensivo + error
  fallback. Já estabilizado.
- Layout do shop (`ShopOverlay.tsx`): overlap canônico do main (`437441c`).
  Frame box separado do sprite empurra o bellhop pra fora da tela em
  viewports curtas.
- `index.html` — sempre rebuild via `npm run build:reproducible`. Nunca
  edita direto.

---

## Comandos úteis

```bash
# Build prod + readable (sempre que mexer em src/)
cd jubileu
rm -rf dist && npm run build && node inline-build.mjs
rm -rf dist && npx vite build --config vite-readable.config.ts \
  && OUT=index-readable.html node inline-build.mjs

# TS check
npx tsc --noEmit
```

---

*Atualizado em 2026-05-07. Próxima sessão: ler isto, depois `MEMORY.md`,
depois `git log --oneline -20`.*
