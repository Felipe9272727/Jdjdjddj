# Achados — Setor "O Quebra-Cabeça e os Sentidos" (Andar 10 / Prisão)

Status: CONCLUÍDO dentro do orçamento disponível. Os 6 arquivos da lista de prioridade foram lidos por inteiro; os 5 arquivos de teste do setor foram lidos e/ou rodados.

Escopo lido por inteiro, nesta ordem: `src/npc/f10Prison.ts` (281), `src/Floor10Prison.tsx` (153), `src/npc/floor10Perception.ts` (trechos-chave dos 614, incluindo toda a parte de `devices`/`prison`), `src/npc/floor10Mapa.ts` (149, inteiro), `src/npc/floor10Reinforcement.ts` (topo/definições de tamanho — o resto é infraestrutura de DQN sem relação com a prisão, ver nota), `src/npc/floor10Drives.ts` (194, inteiro).

## Pergunta central: a prisão é resolvível por NPC + jogador?

**SIM, confirmado por simulação (sonda temporária, ver abaixo).** Rodei `stepPrison` fora do React/vitest com `tsx`, reproduzindo `src/npc/f10Prison.ts` isolado (é módulo puro, sem three/react):

- NPC em `placa-oeste` + jogador em `placa-leste`, segurando juntos: `placas.solved` vira `true` em ~2.5s (bate com `holdSeconds`), para dt=0.1s, dt=1/60s e dt=0.25 (teto do clamp) — os três dão o mesmo resultado.
- Depois NPC em `alavanca-norte` + jogador em `alavanca-sul`: `alavancas.solved` vira `true` em ~4s, e **`doorOpen` vira `true` só depois das DUAS trancas resolvidas** (confirmado: `doorOpen` ainda `false` depois de só `placas` resolver).
- Uma só "pessoa" alternando rapidamente entre `placa-oeste` e `placa-leste` (trocando de posição a cada tick) NUNCA acumula progresso (`progress` fica em 0) — a checagem `a.heldByNpc !== b.heldByNpc || a.heldByPlayer !== b.heldByPlayer` em `f10Prison.ts:147-148` bloqueia corretamente o "correr entre as duas".
- NPC e jogador os DOIS na MESMA placa (não em pontas opostas): `progress` fica em 0, como esperado (`bAcionado` fica falso no outro aparelho).
- Geometria confirmada: distância placa-oeste↔placa-leste = 14m, alavanca-norte↔alavanca-sul = 14m, ambas > 2×`PRISON_REACH` (1.8m) — nenhuma posição alcança os dois aparelhos do par ao mesmo tempo.

Conclusão: o mecanismo central (`stepPrison`, trancas, geometria, `doorOpen`) está **correto e resolvível**. Nenhum bug de transição impossível, progress que não zera, ou porta que não abre.

## Achados

### 0. [MAIS IMPORTANTE] O mapa que vai para o LLM de deliberação ENTREGA a regra da dupla em texto claro — contradiz o manifesto do próprio `f10Prison.ts` — `src/npc/floor10Mapa.ts:143-146`

`f10Prison.ts` (linhas 7-13, o cabeçalho do arquivo) declara a regra que manda no setor inteiro:

> "A REGRA QUE MANDA NESTE ARQUIVO: o Nilo NÃO SABE o que fazer. Nada aqui diz a ele 'pise na placa'... é o que o aprendizado por reforço vai aprender, e é o que torna o campo de provas honesto. **Se eu escrevesse a solução aqui, o teste de independência não testaria nada.**"

E há um teste dedicado só para proteger isso — `f10Prison.test.ts:101-117` (`'ele NÃO recebe a solução de bandeja — nem nos sentidos, nem no texto'`) — que checa que `describePrison()` NUNCA contém "at the same time", "two people" ou "ask the player".

Só que existe um SEGUNDO gerador de texto para o mesmo NPC: `mapaEmTexto()`, em `src/npc/floor10Mapa.ts`. Esta função tem seu PRÓPRIO comentário de regra (linhas 18-22): *"A REGRA QUE ESTE ARQUIVO NÃO PODE QUEBRAR: só entra aqui o que os sensores sabem... O mapa descreve GEOMETRIA e PRESENÇA; significado é com outro módulo."* E, apesar disso, o próprio corpo da função quebra a própria regra, linhas 143-146:

```
'YOU CAN ALSO: stand on a plate or pull a lever. '
+ 'Two of them must be held at the SAME TIME, and you cannot reach two at once.'
```

Isso não é acidente isolado: é **testado e exigido de propósito** em `src/__tests__/floor10Olhos.test.ts:60-67` (`'com prisão ele lista os aparelhos E diz que precisa de dois'`), que faz `expect(texto).toContain('SAME TIME')` e `expect(texto).toContain('cannot reach two at once')`. Rodei os três arquivos de teste (`f10Prison`, `floor10Mapa`, `floor10Olhos`) — todos passam (37/37 juntando os três), ou seja, o projeto tem hoje DOIS testes que fazem afirmações OPOSTAS sobre se o Nilo pode ler a regra da dupla em texto, e os dois passam porque testam CANAIS DIFERENTES (`describePrison` vs `mapaEmTexto`) sem perceber que são a mesma pergunta.

**Por que importa de verdade — a cadeia até o LLM:** `mapaEmTexto()` não é texto de debug. `src/npc/floor10Deliberation.ts:219` (`mapaEmTexto(perception, perception.yaw ?? 0)`) usa a saída dela como uma das linhas do prompt real que vai para o LLM de deliberação (o comentário do próprio arquivo, linha 213: *"O MAPA INTEIRO, E NÃO DUAS DISTÂNCIAS"*, e o comentário de `floor10Mapa.ts:83` confirma: *"O mapa que a vontade lê."*).

**Cenário de falha concreto (sonda `probe3.ts`, rodada de verdade):** NPC parado em cima da `placa-oeste` (-7,-6), jogador em cima da `placa-leste` (7,-6). Chamei `perceiveFloor10({...prison})` e depois `mapaEmTexto(perception, 0)` exatamente como `floor10Deliberation.ts:219` faz. A última linha do texto devolvido é, literalmente:

```
YOU CAN ALSO: stand on a plate or pull a lever. Two of them must be held at the SAME TIME, and you cannot reach two at once.
```

Isso significa que, do PRIMEIRO instante em que o Nilo vê qualquer aparelho (sem nunca ter tentado nada, sem qualquer tentativa-e-erro), o LLM de deliberação já lê a regra inteira da dupla em inglês simples — a mesmíssima frase que o `describePrison()`/RL de baixo nível foi deliberadamente escrito para NUNCA dizer. O "teste de independência" que o cabeçalho de `f10Prison.ts` diz proteger é furado por um canal irmão que ninguém protegeu da mesma forma.

**Resposta à pergunta central, com essa ressalva:** o quebra-cabeça É mecanicamente resolúvel por NPC+jogador (confirmado por simulação, ver acima) — mas NÃO é resolvido por "descoberta independente" como o projeto alega querer testar: a camada de deliberação por LLM recebe a solução de bandeja, contradizendo tanto o manifesto de `f10Prison.ts` quanto o próprio comentário de regra dentro de `floor10Mapa.ts`, a poucas linhas do trecho que a viola.

### 1. `nearMisses` conta quadros de decaimento, não ocorrências reais de "quase" — `src/npc/f10Prison.ts:158-165`

O comentário do tipo (`f10Prison.ts:46`) diz: *"Quantas vezes os dois estiveram juntos e o tempo não foi suficiente"* — sugere um contador de EVENTOS discretos. Mas o código incrementa `lock.nearMisses += 1` a CADA tick em que `progress > 0` e a dupla não está mais junta (branch de decaimento, linha 158-165), e o progress só decai `dt*0.5` por tick — ou seja, um único "soltar antes da hora" gera dezenas de incrementos, um por frame até o progress zerar.

**Cenário de falha concreto (sonda `probe2.ts`):** NPC+jogador seguram `placa-oeste`+`placa-leste` por 1.0s (de 2.5s exigidos, dt=0.1), soltam os dois. Isso é UM near-miss real. Resultado medido: `20` incrementos de `nearMisses` e `20` eventos `'quase'` disparados para esse único afastamento (o progress leva 20 ticks de 0.1s, decaindo a 0.05/tick, para voltar de ~1.0 a 0). Ou seja, `nearMisses` não mede "quantas vezes quase conseguiram" — mede "quanto tempo demorou para desistir", inflando o contador em ~20x por tentativa real.

**Impacto:** É exibido ao usuário em `src/Floor10Prisao.tsx:149` (`{l.nearMisses} quase`) como se fosse contagem de tentativas — o dev/tester vendo a bancada `/?prisao` vai ler "47 quase" quando na real houve 2-3 tentativas de verdade. Também alimenta o evento `'quase'` repetido, que dispara `prisonReward` (+0.05*dt) uma vez por frame de decaimento em vez de uma vez por tentativa — isso não estoura a escala (está devidamente multiplicado por dt, ao contrário do bug histórico do `'juntos'` que o comentário do arquivo documenta ter corrigido), mas ainda assim o "quase" vira um sinal contínuo de RECOMPENSA POSITIVA durante todo o tempo em que o NPC está se afastando de um aparelho já solto — pode ensinar o oposto do que o comentário da linha 199 promete (recompensar ficar perto/tentar, não desistir).

Não é o "nearMisses que nunca incrementa" citado como possibilidade — é o oposto: incrementa DEMAIS, por um motivo de unidade (contagem por tick, não por evento).

### 2a. Comentário desatualizado sobre o tamanho da sala — `src/npc/f10Prison.ts:23`

O comentário do campo `x`/`z` de `PrisonDevice` diz: `"Posição na sala, em metros (a sala vai de -5,5 a +5,5)."` Isso é falso para o mundo real: `src/Floor10Base.tsx:11` define `BND = 22` ("casa com FLOOR10_BND em constants.ts") e as paredes vão de -22 a +22; `src/npc/floor10Perception.ts:117` usa `FLOOR_BOUNDS = 22`, consistente com o mundo. Os aparelhos ficam em `x=±7, z=±6` (`f10Prison.ts:76-79`), FORA da faixa que o comentário afirma (±5,5) mas DENTRO da sala real (±22).

**Não é bug funcional** (nenhuma lógica em `f10Prison.ts` usa esse número — `perto()` só compara contra `PRISON_REACH`), mas é um comentário que contradiz tanto o código abaixo dele (posições ±7/±6, fora de ±5,5) quanto a geometria real do mundo (±22) — categoria "comentário que contradiz o código" citada no contexto. Risco real: um futuro dev lendo só este arquivo (que se declara "módulo PURO" e fonte da verdade da sala) vai calcular mal quanto espaço tem entre um aparelho e a parede, ou reposicionar um aparelho achando a sala pequena.

### 2b. `FLOOR10_RL_PRISON_STATE_SIZE` é uma cópia manual de `PRISON_SENSE_SIZE` — hoje coincide (9=9), mas nada os mantém amarrados — `src/npc/floor10Reinforcement.ts:38` vs `src/npc/f10Prison.ts:226`

`f10Prison.ts:226` define a fonte da verdade dinamicamente: `PRISON_SENSE_SIZE = PRISON_DEVICES.length + LOCKS.length + 3` (hoje = 4+2+3 = 9). `floor10Will.ts:9,550` importa e usa esse valor real (`PRISON_SENSE_SIZE`) para calcular `motorBase`, o índice onde o vetor de estado do RL passa a receber os traços do plano motor.

Só que `floor10Reinforcement.ts:38` — o arquivo que define o TAMANHO DO BUFFER e do tensor de pesos da rede — não importa `PRISON_SENSE_SIZE`; copia o número à mão: `export const FLOOR10_RL_PRISON_STATE_SIZE = 9;`. Esse valor entra em `FLOOR10_RL_STATE_SIZE` (linha 40-44), que por sua vez dimensiona o `Float32Array` do estado (`floor10Will.ts:515`) e a contagem de parâmetros da rede (`FLOOR10_RL_PARAMETER_COUNT`).

**Por que hoje não quebra:** os dois números batem por coincidência (9 dos sentidos reais == 9 hardcoded), e o loop que escreve os sentidos no buffer (`floor10Will.ts:544`, `for (i < sentidos.length && base+i < state.length)`) tem guarda de limite, então não estoura array.

**Cenário de falha concreto:** se alguém acrescentar uma TERCEIRA tranca ou um QUINTO aparelho em `f10Prison.ts` (adicionar uma linha em `PRISON_DEVICES` ou em `LOCKS`, exatamente o tipo de mudança que o comentário de `f10Prison.ts` convida — "cada tranca precisa de DOIS corpos"), `PRISON_SENSE_SIZE` sobe automaticamente (ex.: para 10 ou 11). `floor10Will.ts` calcularia `motorBase` corretamente com o novo valor maior — mas `FLOOR10_RL_STATE_SIZE` (e portanto o tamanho real do buffer e da rede) continuaria calculado com o `9` congelado em `floor10Reinforcement.ts`. Resultado: os traços do plano motor (`motor[i]`) passariam a ser escritos em índices que o buffer mais curto não tem espaço para, sendo TRUNCADOS silenciosamente pela guarda de limite (`motorBase+i < state.length`) — sem erro, sem exceção, só uma rede que de repente perde parte da informação motora ou lê sentidos de prisão incompletos, exatamente o tipo de corrupção silenciosa mais difícil de depurar (o comportamento do Nilo degradaria sem nenhum log ou teste vermelho para apontar a causa).

Vale notar que `floor10Will.ts:6-8` tem um comentário que mostra que o autor JÁ pensou nesse risco noutro lugar do mesmo arquivo ("Import morto é o começo de uma cópia divergente" — ao remover um import não usado de `PRISON_DEVICES`/`PRISON_REACH`) — mas não fechou essa mesma porta em `floor10Reinforcement.ts:38`, que é exatamente uma "cópia divergente" em potencial. Nenhum teste (`floor10Reinforcement.test.ts:26` só fixa `FLOOR10_RL_STATE_SIZE` a `48`, não testa a relação entre os dois valores) pegaria essa divergência se ela acontecer.

**Sugestão (não implementada, é só observação):** trocar a linha 38 de `floor10Reinforcement.ts` por `import { PRISON_SENSE_SIZE } from './f10Prison'; export const FLOOR10_RL_PRISON_STATE_SIZE = PRISON_SENSE_SIZE;` fecharia o risco — não fiz a mudança porque a regra do setor é não editar `src/`.

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
- `src/npc/floor10Drives.ts` (relógio interno / drives do NPC): lido por inteiro. Não tem nenhuma referência a `prison`/`placa`/`alavanca` (grep confirmou), e a lógica de homeostase (`alvoAtual`, `stepDrives`) é autocontida e consistente — alvo em vez de soma (evita saturar em 1.0, o próprio arquivo documenta e testa isso), `clamp01`/`naFaixa` bem aplicados, `dt` clampado em `[0,0.25]` como no resto do setor. Nenhum bug de unidade encontrado. Único ponto observável, não reportado como bug por falta de cenário de falha concreto: as ações `try-device`/`call-player` (as duas que existem "por causa da PRISÃO", segundo o comentário de `floor10Reinforcement.ts:20-24`) não aparecem no mapa `SACIA` (`floor10Drives.ts:99-109`) — ou seja, interagir com os aparelhos da prisão não sacia nenhum drive diretamente. Pode ser intencional (a saciedade vem de `'talk-player'`/`'observe-player'` quando a cooperação junta os dois), então não entra como achado.
- Testes rodados nesta passada, todos passando: `f10Prison.test.ts` (11), `floor10Mapa.test.ts` (7), `floor10Olhos.test.ts` (9), `floor10Perception.test.ts` (10), `floor10Drives.test.ts`, `floor10WillPrison.test.ts`, `floor10Reinforcement.test.ts` (16 juntos) — nenhuma falha, nenhuma asserção óbviamente invertida encontrada além da contradição semântica do Achado 0 (que passa nos dois testes porque testam funções diferentes).
- `npx tsc --noEmit`: limpo, sem erros.
- Reset de estado entre partidas (`prisonReset`, `f10Prison.ts:278-281`): lido, não simulado à parte — `Object.assign(f10prison, freshPrison())` reconstrói todos os `devices` e `locks` do zero (inclusive `nearMisses`, `progress`, `heldSeconds`, `npcAttempts`, `secondsSinceProgress`, `doorOpen`), e `freshPrison()` não reaproveita nenhum objeto do estado antigo (cria `devices` e `locks` novos a cada chamada) — não há mutação-em-lugar que pudesse vazar estado de uma partida para a próxima.

## Não verificado (fora do escopo desta passada)

- `src/npc/floor10Will.ts`, `src/npc/floor10Deliberation.ts`, `src/Floor10Npc.tsx` — fora do meu setor ou na lista de "não entre"; só espiei pontos de interface (chamada de `prisonTick`, `mapaEmTexto`, construção do vetor de estado do RL) o suficiente para validar unidades/tamanhos nas bordas do meu escopo.
- O corpo da `Floor10ReinforcementLearner` (a DQN em si, treino, replay buffer) em `floor10Reinforcement.ts` além das constantes de tamanho — não tem relação direta com a prisão (é infraestrutura genérica de RL) e não foi auditado linha a linha.
- Testes `floor10WillPrison.test.ts` e `floor10Reinforcement.test.ts` foram só EXECUTADOS (passam), não lidos linha a linha à procura de asserções invertidas — dado o orçamento, priorizei ler o código de produção e os testes mais diretamente ligados à pergunta central.

## Nota sobre `git status --short`

Ao rodar `git status --short` ao final, aparecem DOIS arquivos fora do meu escopo como modificados: `src/agente/agenteObjetivo.ts` e `src/__tests__/agenteObjetivo.test.ts` (82 e 71 linhas adicionadas, respectivamente), além de `../achados-carga.md`. **Eu não toquei nesses arquivos** — nunca os abri, nunca usei `Edit`/`Write` neles. São consistentes com outra sessão/agente trabalhando em paralelo no mesmo checkout, num sector diferente ("carga", a julgar pelo nome do relatório irmão `achados-carga.md`). O único arquivo que eu modifiquei foi este relatório, `achados-prisao.md`. Nenhuma sonda temporária ficou no `scratchpad` (apagadas ao final).
