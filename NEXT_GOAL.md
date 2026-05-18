# NEXT_GOAL.md — Próximo trabalho no Floor 2

Este documento descreve, passo a passo, o que fazer na próxima sessão.
Toda a base já está pronta no branch `claude/review-project-docs-R4bFk`:

- ✅ Floor 2 underwater modular (`src/Floor2/`)
- ✅ Bellhop NPC procedural (`src/Floor2/npc.tsx`)
- ✅ Sistema de inventário com diving mask / night vision
- ✅ Overlay verde (DOM) + boost de luz ambiente in-scene
- ✅ Tecla `N` + botão HUD para ligar/desligar a visão noturna
- ✅ Shards coletáveis (`SHARD_POSITIONS`) já existem na cena

O que **falta** para fechar o loop narrativo do Floor 2.

---

## 1. Diálogo do bellhop antes da entrega do item

**Por quê?** Hoje o bellhop entrega a máscara em silêncio assim que o
player chega perto. Falta o "beat" narrativo: o NPC explica POR QUE está
dando o item.

**Onde mexer:**

- `src/Floor2/npc.tsx` — hoje o `onDeliver` dispara direto que o player
  entra no `DELIVER_RADIUS`. Precisa virar duas etapas:
  1. Player se aproxima → abre uma `BarneyDialogue` (ou similar) com o
     texto do bellhop.
  2. Quando o player fecha o diálogo, AÍ chama `onDeliver`.
- `src/App.tsx` — adicionar `bellhopDialogueOpen` ao state, igual ao
  `barneyDialogueOpen` que já existe (linha ~140).
- Reaproveitar `BarneyDialogue` de `src/HudComponents.tsx` ou criar um
  `BellhopDialogue` com a paleta âmbar do hotel.

**Texto sugerido (PT-BR):**

```
* Bem-vindo ao Andar 2, hóspede.
* Não sei como você chegou aqui, mas... aqui não é mais um andar.
* É um lago. Um lago profundo. E os fragmentos estão lá embaixo.
* Tome esta {Máscara de Mergulho}. Sem ela, você não enxerga nada
  no fundo.
* (Pressione N para ligar a visão noturna quando estiver embaixo
  d'água.)
```

**Como implementar:**

1. Em `App.tsx`, criar `const [bellhopDialogueOpen, setBellhopDialogueOpen]`.
2. Trocar o callback do NPC: `onApproach={() => setBellhopDialogueOpen(true)}`.
3. Renderizar a dialogue. Quando fechada e a primeira vez, chamar
   `handleDeliverNightVision`.
4. Marcar `delivered={inventory.nightvision.owned}` continua o mesmo —
   uma vez entregue, o NPC não tenta de novo.
5. Pausar o jogo durante a dialogue (já tem `isPaused={... || bellhopDialogueOpen}`
   no `World`).

---

## 2. Áudio ambiente subaquático

Hoje o Floor 2 é silencioso. Sons que faltam:

| Som | Trigger | Onde adicionar |
|---|---|---|
| Loop ambient underwater (bolhas + drone grave) | `currentLevel === 2 && playerPos.y < SWIM_THRESHOLD_Y` | `src/LiminalAudioEngine.tsx` |
| Loop ambient caverna (eco / gotas) | `currentLevel === 2 && playerPos.y >= SWIM_THRESHOLD_Y` | mesmo arquivo |
| "Splash" ao entrar/sair da água | Detectar cruzamento de `WATER_LEVEL_Y` em `Player.tsx` | `Player.tsx` + audio engine |
| "Click" eletrônico ao ligar/desligar night vision | `handleToggleNightVision` | `App.tsx` |
| Tilint / shimmer ao coletar shard | `onCollectShard` | `App.tsx` ou `components.tsx::Shard` |

**Implementação rápida:** o `LiminalAudioEngine` já recebe `currentLevel`
como prop. Estender com `playerY` para distinguir cave vs. underwater.
Usar AudioBufferSource com loop=true e gain envelope.

**Assets:** procurar em https://freesound.org (CC0/CC-BY) — termos:
"underwater ambience", "cave drips", "water splash dive", "sci-fi
goggle activate". Salvar em `jubileu/src/assets/audio/`.

---

## 3. Condição de vitória do Floor 2

Hoje o player pode coletar todos os shards, mas **nada acontece** quando
o `Set<number>` fica completo.

**Onde:**

- `src/App.tsx`, procurar por `handleCollectShard` e
  `collectedShards`. Já é um `Set<number>`.

**O que adicionar:**

```tsx
useEffect(() => {
  if (currentLevel !== 2) return;
  if (collectedShards.size < SHARD_POSITIONS.length) return;
  // Todos coletados — disparar a sequência final
  setShardsCompleteAt(performance.now());
}, [collectedShards, currentLevel]);
```

**Sequência sugerida quando completa:**

1. Fade do som ambient → silêncio absoluto por 1.5s.
2. White flash + camera shake (`cameraShakeRef.current = 0.6`).
3. Tocar `hotel-lobby.mp3` invertido ou só uma stinger.
4. Mostrar overlay full-screen "TODOS OS FRAGMENTOS RECUPERADOS" em
   amber, igual ao `FloorReveal`.
5. Após 4s, automatically devolver o player ao lobby (Level 0) com
   `setCurrentLevel(0)` e teleporte de posição via `playerPositionCmdRef`.

---

## 4. Mecânica de "ar" / fôlego (OPCIONAL — só se houver tempo)

Hoje a diving mask é puramente cosmética. Para dar peso de gameplay:

- Adicionar `oxygen: number` (0–100) ao state.
- Drena 5/s quando `player.y < WATER_LEVEL_Y` E `!nightvision.active`.
- Não drena com a máscara ativa (justifica o item narrativamente).
- Quando `oxygen <= 0`: dano lento OU teleporte forçado para a
  superfície + sound effect.
- HUD: barra azul no canto inferior esquerdo, só visível em Floor 2.

**Atenção:** isto MUDA O DESIGN do jogo. Confirmar com o usuário antes
de implementar — pode ser que ele prefira que a máscara seja só visual.

---

## 5. Polimento visual restante

Coisas pequenas que ficaram pendentes do trabalho anterior:

### 5a. Spotlight do bellhop não está visível em todas as qualidades
`src/Floor2/npc.tsx` linha ~327 tem um `<pointLight>`. Em quality `low`
isso pode ser cortado pelo limite global de luzes. Considerar usar um
`emissive` no chão atrás dele em vez de uma luz real.

### 5b. NPC sem sombra projetada
Adicionar `castShadow` aos meshes principais (torso, cabeça) e garantir
que o chão tenha `receiveShadow`. Mas só no profile high — barato no
high, caro no low.

### 5c. Máscara nas mãos do NPC fica meio invisível em low light
Talvez aumentar o `emissiveIntensity` das lentes verdes de `0.7` para
`1.2` para que sempre se leia que ele está oferecendo algo.

### 5d. Bellhop com hitbox / collider
Hoje o player atravessa o NPC. Adicionar um collider cilíndrico em
`src/constants.ts` (`_WALLS_LEVEL2_OPEN`) na posição do NPC para que o
player tenha que CONTORNAR ele. Reforça a presença física.

---

## 6. Texto / localização

Tudo até agora está em PT-BR misturado com inglês. Centralizar strings:

- Criar `src/i18n/pt-BR.ts` com `STRINGS.bellhop.dialogue1`, etc.
- Substituir hard-codes nos diálogos.
- Não precisa suportar i18n real — só centralizar para tradução futura.

---

## 7. Testes manuais checklist (NÃO PULAR)

Antes de fazer commit do próximo goal, rodar o dev server (`npm run
dev`) e validar:

- [ ] Entrar no elevador no lobby (Level 0), apertar botão 2.
- [ ] Esperar elevator chegar ao Level 2.
- [ ] Quando as portas abrem, o bellhop deve aparecer com fade.
- [ ] Andar até ele → dialogue abre (após o passo 1 estar implementado).
- [ ] Ao fechar dialogue, máscara aparece no inventário com som / flash.
- [ ] Apertar `N` → tela fica verde, dá pra enxergar no escuro.
- [ ] Apertar `N` de novo → desliga.
- [ ] Pular na água (caminhar para o buraco no centro do mapa).
- [ ] Coletar os 5 shards (`SHARD_POSITIONS.length`).
- [ ] Sequência de vitória dispara (passo 3).
- [ ] Voltar ao lobby sem crashes.

---

## 8. Ordem recomendada de implementação

1. **Passo 1 (dialogue do bellhop)** — maior impacto narrativo, menor
   risco técnico. Começar por aqui.
2. **Passo 3 (vitória do Floor 2)** — fecha o loop de gameplay.
3. **Passo 5d (collider do NPC)** — UX rápido de polish.
4. **Passo 2 (áudio)** — depois que a estrutura visual estiver fechada.
5. **Passo 4 (oxigênio)** — só se o usuário pedir; muda design.
6. **Passo 6 (i18n)** — refactor de baixa prioridade.

---

## 9. Arquivos-chave que serão tocados

| Arquivo | O quê |
|---|---|
| `src/App.tsx` | dialogue state, vitória do Floor 2 |
| `src/Floor2/npc.tsx` | callback `onApproach` em vez de `onDeliver` direto |
| `src/HudComponents.tsx` | criar `BellhopDialogue` ou reusar Barney |
| `src/LiminalAudioEngine.tsx` | sons underwater |
| `src/Player.tsx` | detecção de splash water |
| `src/constants.ts` | collider do bellhop |
| `src/Floor2/constants.ts` | (não tocar — está estável) |

---

## 10. O que NÃO fazer

- ❌ Refatorar `Floor2/index.tsx` de novo — já está modular.
- ❌ Trocar a máscara verde por outra cor — paleta já está consolidada.
- ❌ Adicionar shaders novos — o sistema atual já está no limite de
  draw calls em mobile.
- ❌ Mexer no Barney / Level 1 — escopo é só Floor 2.
- ❌ Criar um `README.md` no root — usar este arquivo como referência.

---

**Boa sessão.** Quando for retomar, leia este arquivo primeiro, depois
faça `git log --oneline -20` para ver os últimos commits, e comece pelo
passo 1.
