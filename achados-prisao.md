# Achados — Setor "O Quebra-Cabeça e os Sentidos" (Andar 10 / Prisão)

Status: EM ANDAMENTO (relatório escrito cedo, sendo atualizado incrementalmente).

Escopo lido nesta ordem: `src/npc/f10Prison.ts`, `src/Floor10Prison.tsx`, `src/npc/floor10Perception.ts`, `src/npc/floor10Mapa.ts`, `src/npc/floor10Reinforcement.ts`, `src/npc/floor10Drives.ts`.

## Pergunta central: a prisão é resolvível por NPC + jogador?

**SIM, confirmado por simulação (sonda temporária, ver abaixo).** Rodei `stepPrison` fora do React/vitest com `tsx`, reproduzindo `src/npc/f10Prison.ts` isolado (é módulo puro, sem three/react):

- NPC em `placa-oeste` + jogador em `placa-leste`, segurando juntos: `placas.solved` vira `true` em ~2.5s (bate com `holdSeconds`), para dt=0.1s, dt=1/60s e dt=0.25 (teto do clamp) — os três dão o mesmo resultado.
- Depois NPC em `alavanca-norte` + jogador em `alavanca-sul`: `alavancas.solved` vira `true` em ~4s, e **`doorOpen` vira `true` só depois das DUAS trancas resolvidas** (confirmado: `doorOpen` ainda `false` depois de só `placas` resolver).
- Uma só "pessoa" alternando rapidamente entre `placa-oeste` e `placa-leste` (trocando de posição a cada tick) NUNCA acumula progresso (`progress` fica em 0) — a checagem `a.heldByNpc !== b.heldByNpc || a.heldByPlayer !== b.heldByPlayer` em `f10Prison.ts:147-148` bloqueia corretamente o "correr entre as duas".
- NPC e jogador os DOIS na MESMA placa (não em pontas opostas): `progress` fica em 0, como esperado (`bAcionado` fica falso no outro aparelho).
- Geometria confirmada: distância placa-oeste↔placa-leste = 14m, alavanca-norte↔alavanca-sul = 14m, ambas > 2×`PRISON_REACH` (1.8m) — nenhuma posição alcança os dois aparelhos do par ao mesmo tempo.

Conclusão: o mecanismo central (`stepPrison`, trancas, geometria, `doorOpen`) está **correto e resolvível**. Nenhum bug de transição impossível, progress que não zera, ou porta que não abre.

## Achados

### 1. `nearMisses` conta quadros de decaimento, não ocorrências reais de "quase" — `src/npc/f10Prison.ts:158-165`

O comentário do tipo (`f10Prison.ts:46`) diz: *"Quantas vezes os dois estiveram juntos e o tempo não foi suficiente"* — sugere um contador de EVENTOS discretos. Mas o código incrementa `lock.nearMisses += 1` a CADA tick em que `progress > 0` e a dupla não está mais junta (branch de decaimento, linha 158-165), e o progress só decai `dt*0.5` por tick — ou seja, um único "soltar antes da hora" gera dezenas de incrementos, um por frame até o progress zerar.

**Cenário de falha concreto (sonda `probe2.ts`):** NPC+jogador seguram `placa-oeste`+`placa-leste` por 1.0s (de 2.5s exigidos, dt=0.1), soltam os dois. Isso é UM near-miss real. Resultado medido: `20` incrementos de `nearMisses` e `20` eventos `'quase'` disparados para esse único afastamento (o progress leva 20 ticks de 0.1s, decaindo a 0.05/tick, para voltar de ~1.0 a 0). Ou seja, `nearMisses` não mede "quantas vezes quase conseguiram" — mede "quanto tempo demorou para desistir", inflando o contador em ~20x por tentativa real.

**Impacto:** É exibido ao usuário em `src/Floor10Prisao.tsx:149` (`{l.nearMisses} quase`) como se fosse contagem de tentativas — o dev/tester vendo a bancada `/?prisao` vai ler "47 quase" quando na real houve 2-3 tentativas de verdade. Também alimenta o evento `'quase'` repetido, que dispara `prisonReward` (+0.05*dt) uma vez por frame de decaimento em vez de uma vez por tentativa — isso não estoura a escala (está devidamente multiplicado por dt, ao contrário do bug histórico do `'juntos'` que o comentário do arquivo documenta ter corrigido), mas ainda assim o "quase" vira um sinal contínuo de RECOMPENSA POSITIVA durante todo o tempo em que o NPC está se afastando de um aparelho já solto — pode ensinar o oposto do que o comentário da linha 199 promete (recompensar ficar perto/tentar, não desistir).

Não é o "nearMisses que nunca incrementa" citado como possibilidade — é o oposto: incrementa DEMAIS, por um motivo de unidade (contagem por tick, não por evento).

### 2. Comentário desatualizado sobre o tamanho da sala — `src/npc/f10Prison.ts:23`

O comentário do campo `x`/`z` de `PrisonDevice` diz: `"Posição na sala, em metros (a sala vai de -5,5 a +5,5)."` Isso é falso para o mundo real: `src/Floor10Base.tsx:11` define `BND = 22` ("casa com FLOOR10_BND em constants.ts") e as paredes vão de -22 a +22; `src/npc/floor10Perception.ts:117` usa `FLOOR_BOUNDS = 22`, consistente com o mundo. Os aparelhos ficam em `x=±7, z=±6` (`f10Prison.ts:76-79`), FORA da faixa que o comentário afirma (±5,5) mas DENTRO da sala real (±22).

**Não é bug funcional** (nenhuma lógica em `f10Prison.ts` usa esse número — `perto()` só compara contra `PRISON_REACH`), mas é um comentário que contradiz tanto o código abaixo dele (posições ±7/±6, fora de ±5,5) quanto a geometria real do mundo (±22) — categoria "comentário que contradiz o código" citada no contexto. Risco real: um futuro dev lendo só este arquivo (que se declara "módulo PURO" e fonte da verdade da sala) vai calcular mal quanto espaço tem entre um aparelho e a parede, ou reposicionar um aparelho achando a sala pequena.

## O que está limpo (verificado)

- `stepPrison`: transições de tranca, acumulação/zeragem de `progress`, exigência de DOIS corpos diferentes, e abertura da porta só após as duas trancas — tudo correto, confirmado por simulação e pelos testes de `f10Prison.test.ts` (11/11 passando).
- `heldSeconds` por aparelho: zera corretamente para 0 quando ninguém está em cima (`f10Prison.ts:130`), acumula com `dt` em segundos — sem mistura de unidades detectada nesse campo.
- Unidade de `dt`: confirmada em segundos ponta-a-ponta — `Floor10Prison.tsx` usa `useFrame((_, dt) => ...)` (R3F entrega `dt` em segundos) para a parte visual; o chamador real de `stepPrison` (`prisonTick`, em `Floor10Npc.tsx:375-378`, fora do meu setor mas checado só na borda) passa `dt: passoVontade`, derivado de um acumulador de segundos (`cadenciaVontade.passo(safeDt)`, comentado como "12 vezes por segundo"). `stepPrison` clampa `dt` em `[0, 0.25]` segundos (`f10Prison.ts:121`) — compatível.
- `prisonReward`: escala corretamente os eventos contínuos (`'juntos'`, `'quase'`) por `dt`, e os discretos (`'tranca-aberta'`, `'porta-aberta'`, `'tentativa-sozinho'`) ignoram `dt` — confirmado por teste e leitura. O próprio comentário do arquivo (linhas 193-197) documenta um bug histórico JÁ CORRIGIDO (recompensa não escalada por dt inflava o sinal 60x) — não reproduz mais.
- `prisonSenses` / `PRISON_SENSE_SIZE`: contagem bate (4 aparelhos + 2 trancas + 3 = 9), todos os valores normalizados em [0,1] confirmado por teste.
- Geometria da dupla: nenhuma posição alcança os dois aparelhos de uma tranca ao mesmo tempo (14m de distância vs. 1.8m = 2×`PRISON_REACH`), confirmado numericamente.
- `floor10Perception.ts` NÃO está mais cego para placas/alavancas — o próprio arquivo documenta a correção (`floor10Perception.ts:50-53`: "OS APARELHOS DA SALA TRANCADA, QUE OS OLHOS NÃO VIAM"). Os aparelhos entram na percepção pela mesma régua dos outros objetos (distância, direção, `inViewCone` com `SENSOR_RANGE=18` e `HALF_FOV=75°`), usando as MESMAS posições de `PRISON_DEVICES`/`f10prison.devices` (não há cópia manual de coordenadas — lê `d.x`/`d.z` direto do estado). `FLOOR_BOUNDS=22` em `floor10Perception.ts:117` bate com `BND=22` em `Floor10Base.tsx:11`.
- `describePrison`: confirmado que não vaza a regra da dupla (testes checam ausência de "at the same time", "two people", "ask the player").
- Rota de debug `/?prisao` (`Floor10Prisao.tsx`) É usada de verdade — carregada via `lazy(() => import('./Floor10Prisao'))` em `main.tsx:70` e ativada por `search.includes('prisao')` — não é código morto (checagem inicial equivocada, corrigida).

## Não verificado por falta de orçamento

- `src/npc/floor10Mapa.ts`, `src/npc/floor10Reinforcement.ts` (além da checagem pontual de `nearMisses`), `src/npc/floor10Drives.ts` — não lidos ainda ou lidos apenas parcialmente nesta passada.
- Testes `floor10WillPrison`, `floor10Olhos`, `floor10Mapa`, `floor10Drives` — não rodados/lidos ainda.
- Reset de estado entre partidas (`prisonReset`) — lido mas não simulado (parece correto: `Object.assign(f10prison, freshPrison())`).
