# Caçada de bugs — SETOR A MENTE

Escopo revisado: `src/npc/floor10Will.ts`, `floor10Deliberation.ts`, `floor10Brains.ts`,
`floor10Roteamento.ts`, `floor10Especulativa.ts`, `floor10Bolha.ts`, `floor10Fila.ts` e os
testes correspondentes em `src/__tests__/`. `floor10SmallBrain.ts` não foi lido (só grep
pontual para checar fiação de exports usados pelos meus arquivos). `src/App.tsx` e
`src/Player.tsx` não foram tocados.

Verificação: `npx tsc --noEmit` limpo; `npx vitest run` nos 8 arquivos de teste do setor
— 126 testes, todos passam (baseline, sem eu editar nada). Sondas temporárias rodaram
fora de `src/` (config e teste em `/tmp/.../scratchpad/`, mais um config descartável na
raiz do repo, removido depois — `git status --short` confirmado limpo ao final, ver nota
sobre um arquivo alterado por outro processo concorrente ao final deste relatório).

---

## 1. [GRAVE] `desligarQuemNaoEDaVez(true, …)` nunca desliga o motor — 640 MB ficam
   residentes quando o jogador abre o chat, apesar do código (e do próprio teste)
   dizerem que desligam

**Arquivos:**
- `src/npc/floor10Roteamento.ts:138-183` (`quemDevoLigar` / `quemDevoDesligar`)
- `src/Floor10NpcChat.tsx:199-202` (chamador, dentro de `open()`)
- `src/__tests__/floor10Roteamento.test.ts:141-151` e `:207-223` (testes que "aprovam" o bug)

**O erro:**

```ts
// floor10Roteamento.ts
export function quemDevoLigar(noChat: boolean): readonly Cerebro[] {
    return noChat ? ['fala', 'memoria'] : ['vontade', 'memoria'];
}
export function quemDevoDesligar(noChat: boolean): readonly Cerebro[] {
    const ficam = quemDevoLigar(noChat);
    return quemDevoLigar(!noChat).filter((c) => !ficam.includes(c));
}
```

`'motor'` nunca aparece em `quemDevoLigar`, nem para `noChat=true` nem para `noChat=false`.
Como `quemDevoDesligar` é só a diferença simétrica dessas duas listas, `'motor'` também
nunca aparece nela — para **nenhum** dos dois estados:

- `quemDevoDesligar(true)` = `['vontade']`
- `quemDevoDesligar(false)` = `['fala']`

Só que `Floor10NpcChat.tsx`, ao abrir o chat, continua passando uma ação de motor para
`desligarQuemNaoEDaVez`, escrita à mão e comentada como parte da correção do bug original
("saio do chat, e entro, LAGA TUDO"):

```ts
// Floor10NpcChat.tsx — open()
void desligarQuemNaoEDaVez(true, {
    vontade: () => unloadSmallBrain(),
    motor: () => unloadFloor10MotorBrain(),   // <- nunca é chamado
});
```

`desligarQuemNaoEDaVez` itera só sobre `quemDevoDesligar(noChat)` e busca a ação
correspondente no mapa (`desligar[cerebro]`). Como `'motor'` nunca sai desse array, a
closure `() => unloadFloor10MotorBrain()` fica no objeto, mas o loop nunca chega nela —
é aceita, nunca executada.

**Por que ninguém pegou:** o teste em `floor10Roteamento.test.ts:141` tem o título "no
chat, desliga a vontade **e o motor**" mas a asserção só confere `saiu === ['vontade']` —
o próprio teste documenta que o motor NÃO sai, com um título que diz o oposto. O segundo
teste (`:207`, "ABRIR o chat desliga a vontade e o motor") não testa comportamento: ele
faz `grep` no texto-fonte de `Floor10NpcChat.tsx` procurando a substring
`'unloadFloor10MotorBrain()'` — encontra a chamada ESCRITA no código e dá como aprovado,
sem nunca executar `desligarQuemNaoEDaVez` de verdade com essa entrada para ver se a ação
roda. É o padrão "código exportado (aqui, chamado, mas na prática inerte) com teste que
aprova" que já apareceu antes neste projeto.

**Cenário de falha concreto:**
1. Jogador anda pela sala fora do chat; em algum momento a vontade escolhe
   `embodied-intent` e o córtex motor usa o cérebro Qwen3-0.6B (`floor10MotorBrain.ts`,
   639.446.688 bytes, confirmado por grep) para traduzir o pensamento — o engine fica
   **residente** (`residentEngine`, só cai com `unloadFloor10MotorBrain()` explícito).
2. Jogador aperta E e abre o chat. `open()` chama
   `desligarQuemNaoEDaVez(true, { vontade, motor })` e, na sequência, `initLLM()` sobe o
   cérebro de fala (SmolLM3-3B, ~1,9 GB).
3. Pela análise acima, só `vontade` é de fato descarregada; o motor de 640 MB continua de
   pé. A fala de 1,9 GB sobe **por cima** dele — exatamente a sobreposição de memória que
   o comentário do próprio `open()` diz que não pode mais acontecer ("a fala reabria
   3,9 GB por cima de 1,32 GB de vontade parada mais 640 MB de motor parado").
4. Isso só afeta o caminho padrão (sem `?poupamemoria`): o único outro lugar que chama
   `unloadFloor10MotorBrain()` é `liberarMotor` em `floor10Precarga.ts`, que só roda sob a
   flag `?poupamemoria` (confirmado por grep) — não é o comportamento padrão do jogo.

**Sondagem que confirma (removida depois, repo limpo):**
```
quemDevoLigar(true)      === ['fala','memoria']     // nunca contém 'motor'
quemDevoLigar(false)     === ['vontade','memoria']  // nunca contém 'motor'
quemDevoDesligar(true)   === ['vontade']            // nunca contém 'motor'
desligarQuemNaoEDaVez(true, {motor: fn, vontade: fn2})
  → fn NUNCA é chamada; fn2 é chamada; retorno === ['vontade']
```
(3 testes, todos confirmam — rodados via config de vitest temporário fora de `src/`.)

**Como isso provavelmente aconteceu:** o comentário em `floor10Roteamento.ts:139-167`
explica que o motor "SAIU DA TABELA" quando o classificador por embedding
(`floor10Memoria`/`memoria`) passou a fazer o trabalho que antes era do Qwen3 — ou seja, a
tabela mudou de `['vontade','motor']` para `['vontade','memoria']` na coluna "fora do
chat". Isso é uma decisão de produto legítima e bem medida (o comentário mostra a
comparação numérica). O que não foi atualizado foi o `open()` de `Floor10NpcChat.tsx`, que
continua chamando `unloadFloor10MotorBrain()` através da MESMA tabela — e a tabela, ao
perder `'motor'` dos dois lados, deixou de conseguir expressar "descarregue o motor ao
entrar no chat", porque essa ação nunca é diferença entre os dois conjuntos.

**Sugestão de correção (não aplicada — fora do escopo desta caçada):** ou o motor volta a
ser tratado como uma exceção descarregada fora da tabela (chamada direta, sem passar por
`quemDevoDesligar`), ou a tabela ganha um mecanismo para "descarregar sob demanda,
independente de ligar" — mas qualquer conserto pede também trocar o teste de
`floor10Roteamento.test.ts:141` para não aceitar mais um título que diz uma coisa e uma
asserção que prova outra.

---

## O que ficou LIMPO neste setor

- **`floor10Will.ts`** (1422 linhas, lido por inteiro): o laço `decide()` →
  `setGoal()`/`runActiveDirective()`/`followAcceptedPlayer()` está bem guardado; não achei
  ramo de sucesso escondendo trabalho que deveria rodar sempre (o padrão do bug histórico
  de `precarregarMemoria` não se repete aqui). `settleLearning()` é chamado em múltiplos
  pontos de `tick()` mas está protegido por `this.learningDecision` ser zerado após o
  primeiro uso — chamadas extras são no-op, não dupla contagem. O `RL_STATE_SIZE`
  (`FLOOR10_RL_BODY_STATE_SIZE + ACTIONS.length + PRISON_SENSE_SIZE + MOTOR_STATE_SIZE`)
  bate exatamente com o array de sentidos da prisão (`PRISON_SENSE_SIZE = 4 dispositivos +
  2 trancas + 3 = 9`, conferido no código de `f10Prison.ts`) — não há gravação fora dos
  limites nem espaço morto por miscontagem. `parseFloor10WillLanguageDecision` e os
  marcadores `[[WILL:...]]` batem 1:1 com `COMMAND_MARKERS`/`MARKER_TO_COMMAND`. Nenhum
  export do arquivo ficou sem chamador real fora de teste.
- **`floor10Deliberation.ts`**: todas as constantes de limite (`DELIBERATION_TIMEOUT_MS`,
  `DELIBERATION_MAX_FAST_RETRIES`, `REARME_APOS_FALA_SEG`, `REARME_COM_REABERTURA_SEG`,
  `DELIBERATION_TTL_SECONDS`) e funções (`deliberationRetryDelay`, `rearmeAposFala`,
  `looksLikeLoop`, `parseDeliberation`, `buildChoiceExtractionPrompt`) têm chamador real
  fora de teste (confirmado por grep em `Floor10Npc.tsx`, `floor10SmallBrain.ts`,
  `Floor10Mente.tsx`). `parseDeliberation` tem uma proteção deliberada e bem comentada
  contra o modelo "ecoar" o enunciado com a lista de metas.
- **`floor10Brains.ts`**: `readBrainFromUrl`/`readSavedBrain`/`cerebroEscolhido`/
  `cachesDescartaveis`/`smallBrainUrls` todos com chamador real (grep confirma uso em
  `floor10SmallBrain.ts` e `wllamaEngine.ts`).
- **`floor10Especulativa.ts`**: flags de query string (`?ngram`, `?semngram`,
  `?wllamaespec`, `?wllamacdn`, `?cargarapida`) sem sobreposição contraditória —
  `especulativaLigada` prioriza `semngram` sobre `ngram` de forma consistente com o
  comentário. `RASCUNHO_N_MAX = 1` está documentado como efetivamente inofensivo/sem
  efeito no momento (n-grama desligado por padrão, medido no próprio comentário) — não é
  um bug, é uma feature já sabidamente neutralizada e registrada como tal.
- **`floor10Bolha.ts`**: a peneira `limparBolha` (regex `INGLES`/`ROTULO`) foi checada
  contra falsos-positivos óbvios em português (ex.: `\band\b` não casa dentro de "quando"
  por causa da fronteira de palavra) — nenhum encontrado. `gerarBolha` cai para a frase
  pronta em qualquer tropeço (try/catch em volta da geração, checagem de vazio, checagem
  de repetição) — comportamento "recusar por padrão" como o comentário promete.
- **`floor10Fila.ts`**: a ordem atual (`fala, vontade, memória-e-movimento, reflexo,
  motor-reserva`) já é a correção do bug histórico "motor de 639 MB antes do modelo que
  anda" — o comentário no próprio arquivo documenta a correção. Único ponto cosmético
  notado, não reportado como bug por não ter cenário de falha real: o comentário da linha
  233 diz "O REFLEXO É O ÚLTIMO" mas o array coloca o item de motor-reserva depois dele —
  não muda comportamento (motor-reserva é opcional e não é algo de que a conversa
  dependa, então a ordem final continua fazendo sentido), só o texto do comentário ficou
  impreciso.

---

## Nota sobre `git status` final

Ao terminar, `git status --short` mostra:
```
 M src/npc/floor10Will.ts
?? src/__tests__/zz-sonda-parede.test.ts
?? src/__tests__/zzz-probe-temp*.test.ts
```
Nenhuma dessas mudanças é minha — eu só usei `Read`/`Grep`/`Bash` (nenhum `Edit`/`Write`
em `src/` ou `tools/`). Pelo `git diff`, a modificação em `floor10Will.ts` é de outro
processo mexendo em `stepFloor10Movement` (colisão com paredes via `resolveCollision`) —
assunto de física/corpo, fora do setor A MENTE, e os arquivos `zz*.test.ts` são sondas de
outros setores (provavelmente física de colisão e o córtex motor). Deixei tudo como
encontrei; minha própria sonda temporária (`__probe.vitest.config.ts` na raiz do repo,
mais os arquivos em `/tmp/.../scratchpad/`) foi removida antes deste relatório.
