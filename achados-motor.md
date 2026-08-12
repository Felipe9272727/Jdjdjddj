# Achados — Motor do NPC (Andar 10)

Setor investigado: `src/npc/floor10MotorCortex.ts`, `floor10MotorBrain.ts`,
`floor10MotorVetor.ts`, `floor10Classificador.ts`, `floor10Prosa.ts`,
`floor10Rotulos.ts`, `floor10Gesto.ts`, e os testes correspondentes.
`floor10Passo.ts` foi apenas lido para entender o consumo, não analisado.

Todos os achados abaixo foram reproduzidos com sondas em vitest (apagadas ao
final) e confirmados por leitura de código. `npx tsc --noEmit` está limpo;
`git status --short` no fim não mostra nenhuma alteração feita por mim (há uma
edição em `src/npc/floor10Will.ts` e um teste novo `floor10Navegacao.test.ts`
já presentes ANTES da minha sessão / de outro processo — não toquei neles).

---

## 1. CRÍTICO — Todo movimento relativo ("5 passos à esquerda") é rotulado como `idle`

**Arquivo:** `src/npc/floor10MotorCortex.ts`, função `metaDoPlanoMotor` (linhas 638-663).

A cadeia de `if` que infere a meta a partir de verbo+alvo cobre `elevator`,
`player`, `self`, `nearest-device`/`active-device` e `LUGARES` (`room-center`,
`north/south/east/west-side`) — mas **nunca** cobre `ahead`, `behind`,
`to-my-left`, `to-my-right`, que são exatamente os 4 alvos relativos que todo
o resto do arquivo descreve como a funcionalidade mais recente ("5 passos à
esquerda", ver o comentário do topo do arquivo). Como nenhum desses 4 alvos
bate em nenhum `if`, a função cai no `return 'idle';` final — para os 6
verbos × 4 alvos relativos = 24 combinações, **sem exceção**.

Verificado com uma sonda rodando `metaDoPlanoMotor` para as 24 combinações:
todas devolvem `'idle'`, inclusive `approach`, `withdraw`, `orbit`, `explore`
— verbos que são movimento explícito, não parada.

**Por que isso importa:** o valor devolvido por `metaDoPlanoMotor` é gravado
como `decided.goal` em `floor10SmallBrain.ts:1311` e chega como
`deliberation.goal` em `floor10Deliberation.ts`. Lá,
`deliberationBonus(deliberation, candidate.goal, time)` (linhas 342-350)
compara esse `goal` contra os candidatos comuns da Utility AI e dá um bônus de
até `DELIBERATION_BONUS = 0.55` (decaindo em 45s) a quem tiver o MESMO nome de
meta. Ou seja: sempre que o rótulo amplo (fallback) é consultado em vez do
plano aterrado diretamente, um pensamento como *"eu dou cinco passos para a
minha esquerda"* empurra a candidata **"quero descansar e escutar a sala"**
(a `idle` comum, ver `floor10Will.ts` linha ~912) — o oposto do que o Nilo
acabou de decidir.

**Cenário de falha concreto:** pensamento = "I step five paces to my left,
away from the noise." O vetor ou o Qwen (preso por gramática) produzem
`{verb:'approach', target:'to-my-left', ...}`. O corpo anda para o lado
corretamente (o *grounding* de `to-my-left` funciona bem). Mas
`metaDoPlanoMotor(plano)` retorna `'idle'`, e é esse rótulo — não `'wander'`
nem nada relacionado a deslocamento — que fica registrado como a intenção
declarada da rodada e que alimenta o mecanismo de reforço de meta em
`floor10Deliberation.ts`.

**Teste existente que mascara isso:** `src/__tests__/floor10MetaDoMotor.test.ts`,
linhas 46-58, "TODO par possível devolve uma meta que a deliberação conhece" —
itera por TODOS os pares verbo×alvo (incluindo os 4 relativos) e só confere
`metas.has(metaDoPlanoMotor(...))`, isto é, se o resultado é QUALQUER meta
válida. Como `'idle'` é uma meta válida, o teste passa mesmo estando errado
semanticamente — é o padrão "teste que aprovaria uma função que devolve
constante" citado no briefing.

**Correção sugerida (não aplicada):** tratar os 4 alvos relativos como os
`LUGARES` — `verb === 'stay' || verb === 'hold' ? 'idle' : 'wander'` — em vez
de cair no `idle` do fim da função.

---

## 2. MÉDIO-ALTO — O desempate por Qwen nunca acorda quando o vetor está em dúvida; dois arquivos afirmam o contrário

**Arquivo:** `src/npc/floor10MotorBrain.ts`, função `translateFloor10MotorThought`,
linha 511.

```ts
if (veredito && !veredito.naDuvida && !signal?.aborted) {   // linha 479
    ... return plan;                                         // caminho confiante
}
// ...
if (veredito) return planoDoVetor(veredito.alvo, thinking);  // linha 511 — SEM checar naDuvida
```

A linha 479 checa `!veredito.naDuvida` (só usa o vetor sozinho quando ele está
confiante). A linha 511 **não tem essa checagem** — devolve o palpite do vetor
sempre que `veredito` existir, confiante OU em dúvida. Como resultado, todo o
bloco abaixo (linhas 538-567: `const reserva = ...`, ativação do
`floor10ModelCoordinator`, `translateWithMotorEngine` com os `candidatos`
filtrados) só é alcançado quando `classificarPensamento` devolve `null` — ou
seja, quando não há modelo de embedding no ar. Enquanto o embedding estiver
carregado e o pensamento tiver cosseno ≥ `PISO_DO_MOTOR` (0.30, uma barra
baixa) com qualquer um dos 14 rótulos, **o Qwen 0.6B nunca é chamado**, nem
para desempatar casos de baixa margem.

Isso contradiz diretamente:
- O cabeçalho de `floor10MotorVetor.ts`, título "O CAMINHO B, LIGADO" —
  descreve "vetor + Qwen só quando a margem é apertada" como o desenho atual,
  vencedor, "ligado" (conectado/ativo).
- O cabeçalho de `floor10Classificador.ts` ("O VETOR ESCOLHE OS CANDIDATOS, O
  QWEN DESEMPATA"), mesma afirmação.
- Toda a infraestrutura de `candidatosDoMotor`/`CANDIDATOS_DO_MOTOR`/
  `PISO_DO_MOTOR`/`veredito.candidatos`, cujo único consumidor
  (`translateWithMotorEngine(..., veredito?.candidatos)`, linha 549-554) fica
  inalcançável no caminho comum.

O próprio `floor10MotorBrain.ts` TEM um comentário (linhas 491-510) explicando
que essa remoção foi medida e decidida ("O Qwen comprava UM caso em sete... O
que saiu foi a CHAMADA, não a peça") — então **pode ser intencional**. Mas se
for, os cabeçalhos de `floor10MotorVetor.ts` e `floor10Classificador.ts`
ficaram desatualizados e enganosos: descrevem como comportamento atual algo
que não roda mais. Se NÃO for intencional (i.e., a linha 511 deveria ter
mantido o `naDuvida` como condição e só usar o vetor cru quando o Qwen falha
depois de ser chamado), é uma regressão de uma linha.

**Verificado:** nenhum teste chama `translateFloor10MotorThought` de verdade
com um veredito construído com `naDuvida: true` para confirmar se o
coordenador de modelos é ativado — os testes em
`floor10MotorVetor.test.ts` ("a ligação chega no motor") só comparam a
ORDEM das substrings no código-fonte, não o comportamento em tempo de
execução, então não pegam essa lacuna.

---

## 3. MÉDIO — Gestos-postura (`listen`, `crouch`, `look-around`) nunca duram "o tempo do plano" como o comentário promete

**Arquivo:** `src/npc/floor10Gesto.ts`, comentário nas linhas 21-27 vs.
`DURACAO_DO_GESTO` (linha 28) + `poseDoGesto` (linha 84).

O comentário diz: *"`listen`, `crouch` e `look-around` são POSTURAS: duram
enquanto o plano durar, e o número aqui é só o teto para não travar o corpo se
algo se perder."* O código não faz isso: `poseDoGesto` usa
`total = DURACAO_DO_GESTO[act]` como a duração INTEIRA do envelope (sobe,
platô, desce), voltando a `POSE_PARADA` assim que `decorrido >= total` —
`listen`=3.2s, `crouch`=3.0s, `look-around`=3.6s — **sem nenhuma referência à
duração real do plano** (`plan.duration`/`lockSeconds`, que pode ser 3, 6, 9
ou 12 segundos).

O consumidor (`src/Floor10Npc.tsx`, linhas 380-383 e 444) confirma que é
mesmo assim: `gestoAtivo` usa exatamente
`tempoDoAndar.current - gesto.current.comecou < DURACAO_DO_GESTO[gesto.current.act]`
— nunca `decided.motion?.duration`. E o MESMO arquivo, poucas linhas acima
(287), usa `decided.motion?.duration` para agendar a checagem de consequência
(`espera = (duration + 4) * 1000`) — ou seja, a duração do plano está
disponível e é usada ali, só não chega ao gesto.

**Reproduzido:** `poseDoGesto('listen', 5)` e `poseDoGesto('crouch', 6)`
devolvem `POSE_PARADA` (pose neutra) — confirmado por sonda.

**Cenário de falha concreto:** plano `hold | nearest-device | slow | 9` +
`ACT: crouch | nearest-device` — uma combinação direta do próprio exemplo do
prompt do motor (`buildMotorTranslationPrompt`, "I should keep my weight on
that thing. => MOTION: hold | nearest-device | slow | 9"). O Nilo agacha para
examinar o aparelho; depois de 3s ele **levanta sozinho e fica em pé, parado,
por mais 6 segundos** — visualmente quebrado para uma ação que devia durar os
9 segundos inteiros do bloqueio de movimento.

**Não testado:** nem `floor10Gesto.test.ts` nem os testes de `Floor10Npc.tsx`
verificam a postura contra a duração do plano.

---

## Verificado e LIMPO (sem bug concreto)

- **`MOTOR_PATTERN` (floor10MotorCortex.ts:161-162)** não inclui
  `ahead|behind|to-my-left|to-my-right` no grupo de alvo — só os 10 alvos
  "antigos". À primeira vista é o mesmo padrão de "duas listas que
  divergem" que já mordeu esta base antes. **Mas testei**: quando o parser
  estrito falha por causa disso, `parseMotorPlan` cai em
  `planoDaProsa(raw)` (linha 299), que reconhece os 4 alvos relativos
  (estão em `FLOOR10_MOTOR_TARGETS`) e recupera verbo, alvo, ritmo, duração
  e até o gesto (`ACT:`) corretamente — testado com as saídas EXATAS que a
  gramática produziria para `to-my-left`/`to-my-right`/`ahead`/`behind`, com
  e sem gesto. Hoje isso não muda o comportamento do jogo, só desperdiça o
  caminho rápido. Vale apertar a lista por robustez, mas não é um bug ativo.

- **`MARGEM_SEGURA = 0.05`** (`floor10MotorVetor.ts`) — não é o padrão
  histórico do "if (true)". Fica estritamente entre os dois erros medidos
  (0.014, 0.040) e as duas margens confiantes medidas em campo (0.062,
  0.076); o próprio teste do arquivo trava as duas pontas. Limpo.

- **`readCompletionText`** (`floor10MotorBrain.ts:162-179`) — já lê
  `content` e cai em `reasoning_content` antes de `choice.text`/
  `record.content`. O bug histórico ("lia `content`, ignorava
  `reasoning_content`") está corrigido aqui.

- **`groundMotorPlan`** (geometria de `approach`/`withdraw`/`orbit`/
  `explore`) — conferido à mão: sinais e deslocamentos consistentes
  (`withdraw` afasta na direção correta, `approach`+`player` para a 1.8m,
  `orbit` desloca perpendicular ao raio). Nenhuma inversão de sinal
  encontrada.

- **`motorPlanFeatures`** — índices do vetor de 12 posições conferidos
  (verbo 0-5, classe de alvo 6-9, ritmo 10, duração 11); sem erro de
  off-by-one.

- **`floor10Rotulos.ts`** — coberto por testes que checam propriedades reais
  (hash sincronizado com as vetorizações pré-calculadas, esquerda ≠ direita
  no espaço vetorial, toda redação mais parecida consigo mesma que com
  qualquer outro alvo). Nada suspeito.

- **`planoDaProsa`** não está mais órfão — chamado em
  `floor10MotorCortex.ts:299` como fallback do parser estrito. O bug
  histórico ("21 testes verdes, zero chamadores") está corrigido.

---

## Ordem de gravidade (o que o jogador sente primeiro)

1. **`metaDoPlanoMotor` → `idle` para todo movimento relativo** — pode fazer
   o Nilo ser empurrado a "descansar" logo depois de decidir andar para o
   lado, através do mecanismo de bônus de meta.
2. **Desempate por Qwen nunca roda em dúvida** — degrada silenciosamente a
   precisão nos casos que o próprio design existe para cobrir (margem
   apertada), e deixa a documentação de dois arquivos inteiros enganosa.
3. **Postura de gesto corta cedo** — bug visual/de imersão, não quebra
   jogabilidade.

## Arquivos citados
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10MotorCortex.ts`
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10MotorBrain.ts`
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10MotorVetor.ts`
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10Classificador.ts`
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10Gesto.ts`
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10Prosa.ts` (verificado limpo)
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10Rotulos.ts` (verificado limpo)
- `/home/user/Jdjdjddj/jubileu/src/npc/floor10Deliberation.ts` (citado como
  consumidor de `deliberation.goal`, fora do meu setor — não analisado além
  do necessário para embasar o achado 1)
- `/home/user/Jdjdjddj/jubileu/src/Floor10Npc.tsx` (citado como consumidor de
  `poseDoGesto`, fora do meu setor)
- `/home/user/Jdjdjddj/jubileu/src/__tests__/floor10MetaDoMotor.test.ts`,
  `floor10MotorVetor.test.ts`, `floor10Gesto.test.ts`, `floor10MotorCortex.test.ts`
