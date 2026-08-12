# Achados — Setor Carga de Modelos (download, cache, fila, coordenação, GPU)

Escopo revisado: `floor10ModelStorage.ts`, `floor10Carga.ts`, `floor10Precarga.ts`,
`floor10ModelCoordinator.ts`, `floor10Gpu.ts`, `floor10Teto.ts` (lidos inteiros) e
`wllamaEngine.ts` (2040 linhas, varrido por grep alvejado nas rotas de
carga/retry/descarga/GPU). Não entrei em `floor10Fila.ts` nem
`floor10Roteamento.ts` (já cobertos por outra rodada — e de fato estavam com
alterações em andamento de outra sessão no `git status`, preservadas
intactas).

Nenhum arquivo em `src/` ou `tools/` foi editado. Sondas ficaram em
`/tmp/.../scratchpad` e em um arquivo temporário dentro de `src/__tests__/`
(necessário porque o `vitest.config.ts` só varre `src/**`), removido logo
depois de rodar — confirmado no `git status --short` final (só aparecem
mudanças de OUTRA sessão em `floor10Pausa.*` e `floor10Roteamento.*`, nenhuma
minha).

---

## 1. [ALTO] Worker zumbi na tentativa seguinte: o `exit()` que falhou é abandonado, não cancelado

**Arquivo:** `src/npc/wllamaEngine.ts:1384-1393` (dentro do laço de retry de
`initConversationEngine`, que tenta `tentativa ∈ {0,1} × plans (GPU/CPU) ×
fastLoadPlans`)

```ts
} catch (error) {
    observingInit = false;
    lastError = error;
    // Encerrar o Worker é o que realmente mata o trabalho de GPU em
    // curso. Se ele estiver ocupado demais para responder, seguimos
    // adiante: esperar aqui recriaria a travada que acabamos de sair.
    await Promise.race([
        Promise.resolve(candidate?.exit?.()).catch(() => undefined),
        new Promise<void>((resolve) => { globalThis.setTimeout(resolve, 3_000); }),
    ]);
    if (cargaRapida) { ...; continue; }
    ...
}
```

É exatamente o padrão do bug histórico já registrado no header de
`floor10Teto.ts` ("Promise.race com setTimeout... o `finally` precisa limpar
nos TRÊS desfechos") — só que aqui o problema não é o timer vazando, é o que
o timer **permite**: o `Promise.race` só faz o *JavaScript parar de
esperar* por `candidate.exit()`; não cancela nem confirma que o Worker
morreu. O próprio arquivo, mais adiante (linha ~1673), descreve este exato
raciocínio como um erro já cometido uma vez ("Exatamente o mesmo engano do
`abortSignal` do wllama, no outro motor" — teto de tempo que só interrompe a
espera do JS, não o trabalho que o worker está fazendo).

Se `candidate.exit()` não responder em 3s (worker ocupado tentando liberar
~1,9 GB de WASM de um GGUF truncado, ou preso numa chamada WebGPU que nunca
retorna — o mesmo tipo de travamento que este arquivo já documenta em outros
lugares), o código **segue em frente de qualquer jeito** e cria uma
**segunda** instância `new mod.Wllama(...)` para a próxima combinação
(cache quebrado → nova tentativa; ou GPU falhou → fallback CPU). Não há
try/catch aqui: mesmo esta tentativa 100% síncrona/base — cache quebrado,
sem GPU, sem `?cargarapida` — passa por este mesmo trecho antes de apagar o
cache e tentar de novo.

**Cenário de falha concreto:**
1. Jogador tem um GGUF truncado no OPFS (download anterior interrompido —
   exatamente o caso que `floor10ModelStorage.ts` foi escrito para
   consertar).
2. `initConversationEngine` cria o primeiro `Wllama`, `loadModelFromUrl`
   rejeita com "Model file not found" (`isBrokenModelCacheError` bate).
3. No `catch`, `candidate.exit()` é chamado, mas o Worker está ocupado
   desalocando o buffer grande que já tinha mapeado do arquivo corrompido e
   não responde em 3s.
4. O código desiste de esperar, cai no fim da volta (`tentativa === 0`),
   apaga o registro quebrado do cache e faz `continue` para `tentativa = 1`
   — que cria um **segundo** `new mod.Wllama(...)` e começa um download
   novo de ~1,9 GB.
5. Por alguns segundos (ou mais, se o worker nunca responder) o aparelho
   tem DOIS runtimes wllama vivos ao mesmo tempo: o zumbi da tentativa 0
   (ainda segurando memória WASM) e o novo, baixando. Em celular, é a mesma
   assinatura de OOM que o próprio código já associa a "meu celular até
   desligou sozinho" (comentário em `floor10Precarga.ts`), só que causada
   por uma tentativa de recuperação, não por dois cérebros residentes de
   propósito.
6. Pior caso: a tentativa nova falha *também* (por falta de memória, por
   causa do zumbi) e o jogador recebe "Falha ao carregar... Nenhum outro
   modelo foi ativado" sem nenhuma pista de que a causa raiz foi um worker
   anterior nunca confirmado como morto.

Não testado ao vivo (exigiria simular um Worker real que trava), mas a
lógica é inequívoca pela leitura: não há `AbortController`/cancelamento
passado para `loadModelFromUrl`, e o único mecanismo de corte é este
`Promise.race` com desistência silenciosa. Note que o caminho "de verdade"
de descarga (`teardownEngine`, usado por `floor10ModelCoordinator.release`)
faz o certo — `await engine?.exit?.()` sem corrida nenhuma — então a
correção é isolada a este ponto do laço de retry.

---

## 2. [MÉDIO-ALTO] `deleteCachedModel` pode voltar a mentir "apaguei" quando `aindaExiste` falha por qualquer motivo que não seja "não existe"

**Arquivo:** `src/npc/floor10ModelStorage.ts:126-138` (função `aindaExiste`,
usada por `deleteCachedModel` como — nas palavras do próprio comentário na
linha 126 — "a ÚNICA prova de que apagar funcionou")

```ts
async function aindaExiste(nome: string): Promise<boolean> {
    try {
        const raiz = await globalThis.navigator?.storage?.getDirectory?.();
        if (!raiz) return false;
        const dir = await raiz.getDirectoryHandle('cache', { create: false });
        await dir.getFileHandle(nome, { create: false });
        return true;
    } catch {
        // NotFoundError (o que queremos) ou OPFS indisponível: nos dois casos
        // não há arquivo quebrado no caminho.
        return false;
    }
}
```

O `catch` é genérico: qualquer exceção — `NotFoundError` (o caso desejado),
mas também `InvalidStateError`, `SecurityError`, um handle preso por outra
operação em curso, etc. — vira `false` ("não existe"). Como
`deleteCachedModel` usa exatamente este booleano para decidir se a remoção
funcionou (`return !(await aindaExiste(nome))`), qualquer erro que não seja
"o arquivo realmente não está lá" é interpretado como sucesso.

**Confirmado com uma sonda temporária** (removida depois, `git status`
limpo): mockei `navigator.storage.getDirectory().getDirectoryHandle(...)
.getFileHandle(...)` para lançar `InvalidStateError` (simulando um handle
ocupado) em vez de `NotFoundError`, e chamei `deleteCachedModel(null, url)`
(sem `cacheManager`, forçando o caminho OPFS direto — cenário que o próprio
teste existente em `floor10ModelStorage.test.ts:123` já cobre para o caso
"tudo dá certo"). Resultado:

```
deleteCachedModel devolveu: true | removeu de verdade: false
```

A função relata sucesso e `removeEntry` nunca é chamado. Isso é exatamente
o formato do bug histórico documentado no topo do próprio arquivo
(`deleteCachedModel` como no-op que "via 'não lançou' e devolvia `true`"),
só que reintroduzido por um caminho diferente: não é mais a chave errada
(isso já foi corrigido, `nomeNoCacheDoWllama` está certo), é a verificação
de sucesso que não distingue "confirmei que sumiu" de "não consegui olhar".

**Cenário de falha concreto:**
1. Cache quebrado detectado (`isBrokenModelCacheError`), `deleteCachedModel`
   é chamado para limpar antes de rebaixar.
2. Por qualquer motivo transitório — inclusive, plausivelmente, o Worker
   zumbi do Achado nº 1 ainda segurando alguma referência no mesmo
   diretório `cache` do OPFS — `getDirectoryHandle`/`getFileHandle` lança
   algo diferente de `NotFoundError`.
3. `aindaExiste` reporta `false` (achado nº 2). `deleteCachedModel` devolve
   `true`. `forgetCachedModel`/quem chama acredita que o arquivo quebrado
   se foi.
4. A tentativa seguinte lê **o mesmo GGUF truncado** de novo (o arquivo
   nunca foi removido) e falha do mesmo jeito — o "cérebro morto para
   sempre" que este módulo inteiro foi escrito para evitar, agora por uma
   porta lateral.

Este achado depende de uma condição menos comum que o nº 1 (uma exceção
específica no meio da checagem de existência), mas o mecanismo está
demonstrado, não é especulação sobre comportamento do navegador — é o
código deste repositório, testado isoladamente.

---

## 3. [BAIXO — nota de documentação, não bug funcional] Comentário desatualizado sobre o degrau inicial da GPU

**Arquivo:** `src/npc/wllamaEngine.ts:275-276` vs. `src/npc/floor10Gpu.ts:34-54`

O comentário em `wllamaEngine.ts` ainda afirma:

> "é `floor10Gpu`, que **começa em 3 camadas** (~8% do modelo), mede
> tokens/s e FPS..."

Mas `floor10Gpu.ts` documenta explicitamente (com uma seção própria,
"COMEÇA EM ZERO — e isto contraria um pedido explícito do dono do jogo")
que `FLOOR10_GPU_START_LAYERS = 0`, exatamente porque começar em 3 camadas
quebrou a fala duas vezes no aparelho de teste. O código está certo (0); só
o comentário em `wllamaEngine.ts` ficou para trás. Sinalizo porque o
padrão "comentário que contradiz o código abaixo" já indicou bug real duas
vezes neste projeto — aqui não achei efeito funcional (o valor usado em
runtime é sempre `floor10Gpu.layersForLoad()`, que lê `FLOOR10_GPU_START_LAYERS`
corretamente), mas é o tipo de comentário que engana a próxima pessoa que
mexer ali.

Relacionado: `FLOOR10_GPU_FIRST_RUNG = 3` (`floor10Gpu.ts:57`, "o primeiro
degrau que o gerente experimenta quando alguém liga a GPU") não é
referenciado por nenhum código de produção — nem pelo `Floor10GpuGovernor`,
nem por `wllamaEngine.ts`, nem pelo botão da bancada em `Floor10Bench.tsx`
(só aparece em `floor10Gpu.test.ts`). Na prática, o gerente sobe em
incrementos de `FLOOR10_GPU_STEP = 2` a partir de 0 (0 → 2 → 4...), nunca
passando por 3. Constante morta, inofensiva, mas guardada como se ainda
guiasse alguma decisão.

---

## O que está limpo

- **`floor10Teto.ts`** — o `comTeto()` limpa o `setTimeout` no `finally`,
  cobrindo os três desfechos (resolveu, estourou, lançou). É a correção do
  bug histórico de vazamento de timer, e está correta.
- **`floor10ModelCoordinator.ts`** — o desenho por contador de geração
  (`generations[owner]`) protege corretamente contra ativações concorrentes
  do mesmo dono sobrescrevendo residência umas das outras; `release` só
  chama o `unloader` se `cleanupNeededOwners` confirma que uma carga
  chegou a começar. `'memory'` está registrado (`floor10Memoria.ts:577`),
  então não há repetição do bug "roteamento não contém a chave" que outro
  setor achou para `'motor'`.
- **`floor10Carga.ts`** (`vigiarInatividade`, `esperarAVez`-equivalente,
  `ehFalhaTransitoria`) — o vigia de inatividade limpa o `setInterval` em
  `parar()`/`aoTravar`; `esperar()` remove o listener de abort tanto no
  caminho normal quanto no de aborto. Nenhum vazamento encontrado.
- **`floor10Precarga.ts`** — `esperarAVez`/`conferir` tem `try/catch`
  explícito para impedir que uma exceção num tick pendure a promessa para
  sempre (o arquivo já documenta esse defeito e o conserto). `iniciarPrecarga`
  usa `try/catch` cobrindo o passo inteiro, evitando promessa rejeitada
  permanente em `emCurso`.
- **`floor10Download.ts`** — `DownloadMeter` não tem divisão por zero
  perigosa (`janelaBytes/decorridoJanela` só roda com `decorridoJanela > 0`),
  e o "relógio começa no primeiro byte" evita a ETA mentirosa documentada.
- **`raceGpuInitWatchdog`** (`wllamaEngine.ts:471-494`) — usa
  `setInterval` e limpa em AMBOS os desfechos do `load.then(resolve,
  reject)`; diferente do Achado nº 1, aqui não há vazamento nem corrida.
- **`cpuThreadCount`** (`wllamaEngine.ts:214-251`) — o bug histórico de
  `n_threads: 8` em aparelho de 4 núcleos já foi corrigido: usa metade dos
  núcleos detectados, limitado por `MAX_SPEECH_THREADS = 8`, com override
  manual salvo em `localStorage`.
- **`cacheProbe` singleton** (`wllamaEngine.ts:934-939`) — `probeDoCache`
  é síncrona no trecho crítico (`cacheProbe ??= new mod.Wllama(...)`), sem
  `await` entre a checagem e a atribuição, então não há corrida em criar
  duas instâncias mesmo com chamadas concorrentes.
- **Testes verificados batendo** (`npx vitest run` nos 9 arquivos do
  setor: `floor10ModelStorage`, `floor10Carga`, `floor10ModelCoordinator`,
  `floor10Gpu`, `floor10Pausa`, `floor10OrcamentoCpu`, `floor10ModelPause`,
  `floor10Download`, `floor10CargaRede`) — 103 testes, todos passando.
  `npx tsc --noEmit` limpo, sem erros de tipo.

---

## Ordem de gravidade

1. Worker zumbi no retry de carga da fala (`wllamaEngine.ts:1384-1393`) —
   risco de dois runtimes WASM vivos simultaneamente, exatamente na
   recuperação de um cache quebrado.
2. `deleteCachedModel`/`aindaExiste` pode reportar sucesso sem apagar nada
   quando o OPFS lança algo além de `NotFoundError` (`floor10ModelStorage.ts:126-138`)
   — confirmado por sonda.
3. Comentário desatualizado sobre o degrau inicial da GPU e constante
   `FLOOR10_GPU_FIRST_RUNG` morta — documentação, sem efeito funcional
   encontrado.
