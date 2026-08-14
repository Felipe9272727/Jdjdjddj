# Achados — caminho do cache dos pesos (Andar 10 / Nilo)

Setor investigado: o que muda quando o `.gguf` do Nilo (SmolLM3, "fala") vem do
cache/OPFS em vez de ser baixado da rede. Arquivos lidos por inteiro:
`floor10ModelStorage.ts`, `floor10Carga.ts`, `floor10Precarga.ts`; `wllamaEngine.ts`
via grep alvejado + leitura dos trechos relevantes (config de carga, checagem de
cache, laço de retry, watchdog). Runtime `@wllama/wllama@3.5.1` conferido a
partir do checkout real da tag `3.5.1` (`cache-manager.ts`, `model-manager.ts`,
`storage/opfs.ts`) para confirmar o que o pacote faz por baixo, já que o jogo usa
o CDN oficial por padrão (`runtimeEspecLigado()` só liga com `?wllamaespec`).

---

## ACHADO CONFIRMADO — o painel de armazenamento mente quando o Nilo vem do cache

**Arquivo:** `src/npc/wllamaEngine.ts:1108-1141` (a checagem de cota inteira,
inclusive o `npcSet({ storage: … })`, vive DENTRO de `if (!await
isModelCached(mod, model.url)) { … }`).
**Também:** `src/npc/npcStore.ts:102,119` (`storage: { quota: null, usage: 0,
needBytes: 0 }` é o valor padrão da loja) e `src/Floor10Campo.tsx:611-621`
(`armazenamento: {st.storage.quota === null ? 'o navegador não informa a cota' : …}`).

### O erro

Quando o modelo do Nilo **já está em cache**, `isModelCached()` devolve `true` e
o bloco inteiro que chama `readStorageEstimate()` e publica
`npcSet({ storage: {...} })` é pulado por completo — não só a decisão de "cabe
ou não cabe", mas também a LEITURA da cota que alimenta o painel `?campo`.
Como `npc.storage` nunca é populado nesta sessão (nenhum outro lugar do código
de produção escreve nele para o modelo de fala), o campo fica no valor padrão
`{quota: null, ...}`, e o painel mostra literalmente **"o navegador não informa
a cota"** — a mesma frase que apareceria se `navigator.storage.estimate()` de
fato não existisse. É falso: o código simplesmente nunca perguntou.

Conferi os quatro carregadores de modelo que existem no jogo:

| carregador | quando popula `npc.storage`? |
|---|---|
| fala / Nilo (`wllamaEngine.ts:1117-1123`) | só quando **NÃO** está em cache |
| vontade (`floor10SmallBrain.ts:620-626`) | **sempre**, cache ou não |
| motor (`floor10MotorBrain.ts`) | nunca (não publica `storage`) |
| memória (`floor10Memoria.ts`) | nunca (não publica `storage`) |

A assimetria entre fala (condicional) e vontade (incondicional) — para o
MESMO campo de estado — é o que confirma que isto é uma omissão e não uma
política deliberada: o autor já resolveu esse exato problema para a vontade
("quota nula = navegador que não informa. Na dúvida, DEIXA TENTAR" —
`floor10SmallBrain.ts:581`) mas não replicou a leitura incondicional para a
fala.

### Cenário de falha concreto

1. Jogador abre o jogo pela primeira vez numa URL de deploy nova. SmolLM3 não
   está em cache → `isModelCached` = false → `readStorageEstimate()` roda →
   painel mostra `"X GB usados de Y GB"` corretamente.
2. Download termina, Nilo fica pronto. Jogador fecha a aba (ou dá F5 na mesma
   URL).
3. Jogador volta à mesma URL. Todo o estado do módulo JS (incluindo
   `npc.storage`) recomeça no padrão `{quota: null, ...}` — é um contexto de
   página novo. `initConversationEngine` roda de novo; agora
   `isModelCached(mod, model.url)` é `true` (arquivo + metadados já estão no
   OPFS) → o bloco de `readStorageEstimate`/`npcSet(storage)` **não executa**.
4. `loadModelFromUrl` segue direto pelo caminho de cache do próprio wllama
   (`getModelOrDownload` → `Model.open()`), rápido, sem tocar a cota.
5. Se o jogador abrir `?campo` nesse momento — antes de a vontade (MiniCPM)
   ter descido, o que só acontece depois da primeira mensagem responder — o
   campo "armazenamento" mostra **"o navegador não informa a cota"**, mesmo
   que o mesmo navegador tenha respondido perfeitamente bem no passo 1.

Isto bate, quase literalmente, com a frase do dono do jogo ("vou te mostrar um
erro que pode estar correndo após pegar o Nilo do cache") e com o sintoma
descrito ("os prints mostram armazenamento: o navegador não informa a cota").

### O que isto NÃO é

Não é um bug de CARREGAMENTO: pular a checagem de cota quando o modelo já está
inteiro em cache é a decisão certa (não vai baixar nenhum byte novo, não há o
que caber). O defeito é só no efeito colateral — a leitura de diagnóstico that
alimenta o painel fica de fora da mesma condicional, quando devia ser
incondicional (como já é para a vontade). Não vi evidência de que isto trave,
atrase ou corrompa o carregamento do Nilo em si.

### Correção sugerida (não aplicada — fora do escopo desta investigação)

Mover a leitura (`readStorageEstimate()` + `npcSet({storage:...})`) para FORA
do `if (!await isModelCached(...))`, publicando sempre — do mesmo jeito que
`floor10SmallBrain.ts` já faz para a vontade — e usar o resultado só
condicionalmente para decidir se cabe.

---

## A — Os parâmetros são os mesmos nos dois caminhos? **LIMPO.**

`wllamaEngine.ts:1304-1308`: a chamada a `candidate.loadModelFromUrl(model.url,
{...CPU_LOAD_CONFIG, ...espec, n_threads: threads, n_gpu_layers: gpuLayers,
progressCallback: …})` é a MESMA chamada de código, execute-se o `if
(!isModelCached(...))` (baixando agora) ou não (já em cache) — o bloco de
cota só decide se PROSSEGUE ou lança `ModelStorageError`; não altera nenhum
parâmetro do `loadModelFromUrl` em si. `n_ctx: 1536`, `n_batch: 512`,
`cache_type_k/v: 'q8_0'`, `jinja/reasoning/warmup` (`CPU_LOAD_CONFIG`,
linhas 70-104) são constantes `Object.freeze`d, e `n_threads` vem de
`cpuThreadCount()` (linha 1143/214-251), que depende só de
`localStorage`/`__npcThreads`/`navigator.hardwareConcurrency` —
nada ali consulta se o modelo está em cache. Também não há `useCache: false`
nem qualquer outra flag de cache passada nesta chamada (para o modelo de
fala; `useCache` é usado explicitamente só por motor e memória, arquivos fora
do escopo desta investigação). **Não há divergência de parâmetros entre os
dois caminhos.**

## B — Estado que sobrevive à carga. **LIMPO nas transições examinadas.**

- Entre um F5 e outro: TODO o estado do módulo (`currentEngine`,
  `activeModelUrl`, `cacheProbe`, `modulePromise`, `transitionPromise`,
  `prewarmPromise`, `personaPrewarmed/Done`, `loadedThreads`,
  `loadedGpuLayers`) é reinicializado pelo simples fato de ser um novo
  contexto JS — não há nada persistido fora do OPFS/`localStorage`. Não há
  como uma promessa "velha" atravessar um reload de página.
- Dentro da MESMA sessão (ex.: recarga de engine após falha de aquecimento de
  GPU, `wllamaEngine.ts:1583`): `teardownEngine()`
  (`wllamaEngine.ts:1028-1044`) zera `currentEngine`, `activeModelUrl`,
  `loadedDisableThinking`, `loadedThreads`, `loadedGpuLayers`,
  `prewarmPromise`, `personaPrewarmed`, `personaPrewarmDone` antes de
  qualquer nova carga — inclusive quando essa nova carga vai reabrir o MESMO
  modelo agora já em cache. Não achei um caminho em que essas variáveis
  fiquem "penduradas" de uma carga anterior e vazem para a carga vinda do
  cache.
- `medidorFala.reset()` e `resetModelLoadTrace()` (`wllamaEngine.ts:1054-1055`)
  rodam no início de TODA chamada a `initConversationEngine`, cache ou não —
  sem assimetria aí.

Não fui atrás de KV-cache residual dentro do próprio Worker do llama.cpp
(`cache_prompt: true`) porque cada `new mod.Wllama(...)` (linha 1277) é uma
instância nova por tentativa — o KV antigo morre com o Worker antigo
(`candidate?.exit?.()`, linha 1407). Isso é reforçado pelo comentário em
`teardownEngine`: "Reabrir outro runtime precisa aquecer a própria persona,
não herdar a promessa já concluída do anterior" — e o código faz o que o
comentário diz.

## C — A cota e o OPFS.

- **O achado principal desta seção é o do topo do relatório** (painel de cota
  mudo no cache-hit).
- **Entrada de cache PARCIAL é detectada, não reaberta como inteira** —
  confirmado lendo `cache-manager.ts` do wllama 3.5.1: `download()` só chama
  `writeMetadata()` DEPOIS que `sb.write()` (a gravação do arquivo inteiro)
  resolve (`cache-manager.ts:204-209`). Se a aba fecha no meio do download, a
  gravação em si (`storage/opfs.ts:25-38`, grava direto no arquivo-alvo via
  `truncate(0)` + `write` incremental, sem swap atômico) para na metade, mas a
  Promise nunca resolve (a página sumiu) — logo `writeMetadata` nunca roda.
  Sem metadado, `list()` devolve esse arquivo com `metadata.originalURL: ''`
  (`cache-manager.ts:283-297`), então `isModelCached()`
  (`wllamaEngine.ts:957-964`, que compara `metadata?.originalURL === url`)
  corretamente diz "não está em cache" para esse lixo parcial. O próximo
  `loadModelFromUrl` recomeça o download, e como o nome do arquivo no OPFS é
  determinístico (`sha1(url)+'_'+basename`, independente de quando/quantas
  vezes foi baixado), a nova gravação faz `truncate(0)` no MESMO arquivo e
  sobrescreve o lixo — não sobra um órfão ocupando cota para sempre.
- **Suspeita não confirmada, mas plausível**: `isModelCached()` usa um
  critério mais fraco do que o `Model.validate()` que o próprio wllama usa
  internamente em `getModelOrDownload()` (`model-manager.ts:139-156`, que
  também compara `metadata.originalSize !== file.size`, ou seja, faz
  verificação de TAMANHO). Consigo construir, no papel, um cenário em que um
  arquivo com metadado presente mas `size` divergente (ex.: falha silenciosa
  de escrita que ainda assim resolve a Promise) faria `isModelCached()`
  dizer "está em cache" — pulando a checagem de cota do jogo — enquanto o
  wllama internamente descobre a invalidez e reescreve o arquivo inteiro (sem
  o pré-voo de espaço livre que o jogo tenta garantir). NÃO CONSEGUI PROVAR
  que esse estado (metadado íntegro + tamanho real divergente) é alcançável
  na prática — o caminho mais comum de corrupção (fechar a aba, queda de
  rede, cota estourada) já cai no caso anterior (sem metadado) e é tratado
  corretamente. Ficou como suspeita, não como achado.
- O caso "modelo carrega vazio" (48 MB de zeros passando por um GGUF válido)
  JÁ TEM defesa dedicada e testada: `modeloVazio`/`conferirModeloCarregado`
  (`floor10Carga.ts:243-292`), chamada em `wllamaEngine.ts:1381` logo após
  todo `loadModelFromUrl` bem-sucedido — cache ou download, sem distinção.
  Esse caso passa pela verificação de tamanho do `validate()` porque o
  tamanho do arquivo malicioso/corrompido bate com o `content-length`
  anunciado; só o CONTEÚDO está errado, por isso o jogo precisa da própria
  checagem de `nVocab/nLayer` — e ela roda nos dois caminhos igualmente.

## D — Depois de um recarregamento da página.

- **O caminho de inicialização é código-idêntico** nos dois casos (mesma
  chamada a `loadModelFromUrl` com os mesmos parâmetros — ver item A). O que
  muda é só qual ramo INTERNO do wllama executa (`getModelOrDownload`
  encontra o modelo em `getModels()` vs. cai em `downloadModel()`), e o
  efeito colateral do item C/topo (painel de cota).
- **Verificação de integridade que EXISTE**: tamanho. `Model.validate()`
  (`model-manager.ts:139-156`, parte do wllama 3.5.1 real, não deste jogo)
  compara `metadata.originalSize` (do `content-length` no momento do
  download) com o tamanho atual do arquivo no OPFS; se não bater, o modelo é
  tratado como inválido e a próxima `loadModelFromUrl(..., {useCache: true})`
  (o padrão, usado pelo Nilo) o redownloada sozinha, por baixo do jogo, sem
  o jogo precisar saber.
- **Verificação que NÃO existe**: ETag/hash. O `CacheEntryMetadata` guarda um
  `etag` (`cache-manager.ts:45-58`) mas ele nunca é comparado com nada — não
  há revalidação condicional (`If-None-Match` ou similar). Se o arquivo do
  Hugging Face mudar de conteúdo sob a mesma URL (ex.: republicação), o
  cache antigo seria servido para sempre sem aviso. Isto não é "pior depois
  do cache" no sentido do jogo (não há sintoma relatado que bata com isto) —
  é uma limitação genérica de cache-sem-revalidação, presente igualmente
  nos dois caminhos, e cito por completude em resposta direta à pergunta D.
- Não achei nenhuma bifurcação de UI/estado adicional amarrada
  especificamente a "isto é a segunda vez que abrimos esta URL" — a única
  coisa que distingue as duas visitas, no código, é o resultado de
  `isModelCached()`.

---

## Testes e build

```
npx vitest run src/__tests__/floor10Carga.test.ts src/__tests__/floor10CargaRede.test.ts \
  src/__tests__/floor10Download.test.ts src/__tests__/floor10ModelStorage.test.ts \
  src/__tests__/floor10ModelPause.test.ts src/__tests__/wllamaEngine.test.ts
# 6 arquivos, 103 testes, todos passando (nenhum arquivo de src/ foi alterado)
```

Nenhuma sonda temporária ficou no scratchpad — a investigação foi só leitura
de código (deste repo e do checkout de referência do wllama 3.5.1 já presente
no scratchpad de uma sessão anterior). `git status --short` limpo (nenhuma
edição em `src/` ou `tools/`).

## Resumo para quem só quer o veredito

A suspeita do dono do jogo está **parcialmente confirmada**: existe, sim, um
comportamento observável que só acontece quando o Nilo vem do cache — mas é o
PAINEL DE DIAGNÓSTICO que fica cego (`wllamaEngine.ts:1108-1136`), não o
carregamento do modelo em si. Os parâmetros de carga (A) são idênticos nos
dois caminhos, o estado entre cargas (B) é limpo, o wllama já faz verificação
de tamanho ao reabrir do cache (D), e um download parcial não é reaberto como
se estivesse completo (C). O ponto fraco real e mais sério que resta é uma
suspeita não confirmada: `isModelCached()` é mais permissivo que o
`validate()` interno do wllama, então em tese pode achar que um arquivo está
"em cache" quando o wllama mesmo vai redownloadá-lo por dentro — sem o
pré-voo de cota do jogo rodar antes.
