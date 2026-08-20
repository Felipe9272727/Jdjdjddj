# Procurando um revisor — o que foi medido, e o que eu descobri estando errado

Este arquivo é o registro da caçada por um revisor "bom e rápido". Ele guarda
tanto as medições quanto os becos sem saída, porque nesta caçada eu já
recomendei duas vezes por número que não se sustentou, e o registro do beco vale
tanto quanto o do caminho.

## 1. A pergunta estava mal feita — o revisor sobe do zero TODO turno

Eu vinha comparando modelos por "custo por frase". Só que, lendo
`floor10PipelineReal.ts`, o turno com uma frase marcada faz isto:

1. `descarregarRascunhador()` — tira o granite da RAM;
2. `esperar(RESPIRO_APOS_DESCARGA_MS)`;
3. `precarregarRevisor()` — **sobe 1,25 GB do zero**;
4. remenda uma frase;
5. devolve o rascunhador depois que a fala já está na tela.

A troca existe por um motivo bom e não negociável: dois llama.cpp de 1 GB no
mesmo celular foi o que **desligou o aparelho do dono do jogo**.

A consequência é que o preço que o jogador sente **não é** o custo por frase de
nenhuma bancada. É `carga a frio + leitura sem cache + escrita`. Por isso:

- a bancada **não aquece mais** antes de medir (era o erro que fez o Llama
  parecer 6× mais rápido do que é), e
- o placar tem coluna **`1ª FRIA`** separada de **`depois`**.

E por isso a pergunta boa deixou de ser *"qual 1B é mais esperto?"* e passou a
ser *"o que tira a recarga do caminho?"*.

## 2. Beco medido: editor seq2seq (T5) em ONNX

**A hipótese.** Um encoder-decoder lê o enunciado no ENCODER — uma passada só,
paralela, sem autoregressão. A parte que nos mata (89% do custo é leitura) é a
que ele faz de graça. E um editor de 250 MB caberia **ao lado** do granite:
sem troca, sem recarga.

**A medição** (`revisor-editor.mjs`, mesmos 6 defeitos e 3 controles de
`defeitos.mjs`, enunciado com o motivo do juiz):

    candidato        conserta  desviou  estraga  intacta   1ª FRIA   depois
    LaMini-248M         0/6       0/6      0/3      0/3      0.5s      0.5s
    LaMini-77M          5/6       5/6      0/3      3/3      0.1s      0.2s

**O 5/6 do 77M é falso, e a coluna `desviou` foi feita exatamente para isso.**
Ele responde `"The sentence is already correct."` em 5 dos 6 casos — o defeito
"some" porque o texto inteiro sumiu. É o mesmo golpe que o Gemma 3 deu antes.

O 248M é mais honesto e igualmente inútil: ele **comenta** em vez de reescrever.

    "The error is in the sentence structure. The correct sentence is:
     \"I'm just a guest trapped in this elevator..."

Ou seja: diagnostica, anuncia o conserto, e repete a frase errada. É o mesmo
vício do LFM2.5 (`"That sentence is still wrong—maybe the city's just a blur"`),
só que num modelo 5× menor.

**Por que falha, e por que era previsível.** CoEdIT, LaMini e a família GEC são
treinadas em edição de *forma* — gramática, simplificação, formalidade,
paráfrase. O nosso defeito é de *fato*: "ele está no 10º andar, não dentro do
elevador" não é um erro de português, é uma contradição com um cânone que só
existe na nossa persona. Nada nesses modelos viu essa tarefa.

**O que fica aberto:** o CoEdIT-large (783M) é o único da família treinado em
instruções de edição de verdade, e não foi testado (o ONNX dele está em layout
não-padrão, e o disco desta caixa não coube). A expectativa é baixa pelo motivo
acima — mas expectativa não é medição, e essa distinção é o assunto deste
arquivo.

## 3. O que eu confirmei no binário em disco (não em release note)

### 3.1 O backend WebGPU do llama.cpp **já está** no wasm que a gente baixa

`strings` em `wllama-cdn/wasm/wllama.wasm` — o mesmo arquivo que o jogo puxa:

    /source/llama.cpp/ggml/src/ggml-webgpu/ggml-webgpu.cpp
    ggml_webgpu: Failed to get an adapter: %s
    ggml_webgpu: adapter_info: vendor_id: %u | vendor: %s | ...

e a cola JS chama `navigator.gpu.requestAdapter()`.

**E isso não é notícia nova para este projeto.** `floor10Gpu.ts` já é um
governador inteiro de camadas na GPU, com amostragem de FPS (porque o Three.js
divide a mesma GPU), teto de 10 camadas e memória por aparelho. Ele já foi
ligado no aparelho do dono do jogo e **quebrou duas vezes** no wllama 3.5.1:
`(ABORT)` e `loadModel() is not yet called`.

O que mudou desde então, e só isso: o pipeline roda **3.6.0**, e o WebGPU do
**ONNX** funcionou no aparelho dele. Não é prova de nada sobre o wllama — é
motivo para re-testar pelo botão que já existe, e não por uma flag nova.

### 3.2 O caminho que destravaria os 89% está bloqueado no BINDING, não no llama.cpp

`llama.h` — a API pública — expõe salvar e restaurar o KV de uma sequência:
`llama_state_seq_get_data`, `llama_state_seq_set_data`,
`llama_state_seq_save_file`, `llama_state_get_data`, `llama_memory_seq_rm`.

Com elas, o remendo seria: prefillar a persona **uma vez**, guardar o estado, e
**restaurar** antes de cada frase marcada — pagando só os poucos tokens da frase.
Os 43 s viram os 5 s.

O bundle do wllama **não tem ponte nenhuma** para essas funções. Procurei por
`state_seq`, `getState`, `saveState` e vizinhas no `index.js` que está em disco:
zero. O que existe é `n_cache_reuse` (3 ocorrências), que é outra coisa.

Então: **não é impossível, é não-exposto.** O desbloqueio é um fork ou um PR no
wllama, e é a maior alavanca isolada que esta caçada encontrou — vale mais que
qualquer troca de modelo, porque não depende de qual modelo é.

Isto está registrado como tarefa. Nenhuma linha foi escrita nessa direção ainda.

## 4. Candidatos que a busca levantou e que ainda NÃO foram medidos

Marcados assim de propósito: `verificado` = o repositório existe e eu conferi;
`não conferido` = veio da busca e ninguém abriu.

| candidato | por que interessa | ressalva |
|---|---|---|
| granite 3.3 2B Q4 | 5/6 com 0 desvios, o melhor placar que alguém tirou aqui | uma rodada só, com aquecimento — é o que está sendo medido agora |
| Qwen3.5-2B | não conferido | arquitetura Gated DeltaNet: **atenção linear híbrida**, ou seja o mesmo problema do lfm2 com reaproveitamento de prefixo |
| Ministral-3-3B | não conferido | transformer puro (bom para cache), mas 3,85B é grande demais para caber ao lado do granite |
| Phi-4-mini-instruct | não conferido | transformer puro, sem pensamento; 3,8B, mesmo problema de tamanho |
| CoEdIT-large 783M | ONNX existe (`rayliuca/coedit-large-onnx-quantized`, verificado) | layout não-padrão; e a família falhou na medição da seção 2 |

O padrão que aparece nessa tabela: **os candidatos com a arquitetura certa para
o cache são grandes demais para caber ao lado do rascunhador, e os pequenos o
bastante têm a arquitetura errada.** Isso reforça a seção 3.2 — o ganho grande
não está em achar outro modelo.
