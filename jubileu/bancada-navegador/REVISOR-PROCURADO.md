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
| ~~granite 3.3 2B Q4~~ | **medido e descartado** — ver seção 5 | empatou em qualidade e custa o dobro a frio |
| Qwen3.5-2B | não conferido | arquitetura Gated DeltaNet: **atenção linear híbrida**, ou seja o mesmo problema do lfm2 com reaproveitamento de prefixo |
| Ministral-3-3B | não conferido | transformer puro (bom para cache), mas 3,85B é grande demais para caber ao lado do granite |
| Phi-4-mini-instruct | não conferido | transformer puro, sem pensamento; 3,8B, mesmo problema de tamanho |
| CoEdIT-large 783M | ONNX existe (`rayliuca/coedit-large-onnx-quantized`, verificado) | layout não-padrão; e a família falhou na medição da seção 2 |

O padrão que aparece nessa tabela: **os candidatos com a arquitetura certa para
o cache são grandes demais para caber ao lado do rascunhador, e os pequenos o
bastante têm a arquitetura errada.** Isso reforça a seção 3.2 — o ganho grande
não está em achar outro modelo.


## 5. O granite como revisor: medido, e descartado

A pista era "5/6 com zero desvios, o melhor placar da lista". Repetida com a
bancada corrigida (2 rodadas, 12 frases, mesmo processo, sem aquecimento):

    candidato        conserta  desviou  estraga  intacta   1ª FRIA   depois   lê
    LFM2.5 1.2B        8/12      3/12     0/3      0/3      35,0 s   34,6 s  267 tok
    granite 3.3 2B     8/12      3/12     0/3      0/3      66,2 s   27,4 s  125 tok

**Empate em tudo que é qualidade.** O 5/6 era do mesmo tamanho de ruído que o
4/6 do Llama: seis casos, temperatura 0,7.

E o tempo troca de lado conforme a coluna que se lê — o erro exato que me custou
o Llama, agora visível porque a coluna existe:

- o granite é transformer puro, então o llama.cpp reaproveita o prefixo: 306
  tokens na primeira chamada, 110 nas seguintes;
- o LFM2.5 é híbrido (`shortconv.l_cache`) e lê 267 **sempre**.

Numa conversa em que o revisor **fica de pé**, o granite ganha (27,4 s contra
34,6 s). O jogo não faz isso: ele sobe o revisor do zero todo turno. Toda chamada
do jogo é a coluna **fria**, e lá o granite custa **quase o dobro**.

A vantagem estrutural do transformer puro é real e é **inútil para nós enquanto
a troca de RAM existir** — o que reforça, pela terceira vez neste arquivo, que o
ganho grande está em matar a recarga (seção 3.2), não em trocar de modelo.

Uma observação que vale para os dois e que ninguém tinha medido: **`intacta` é
0/3 em ambos**. Nenhum dos dois devolve sem mexer uma frase que já estava certa.
Quando o juiz marca errado, os dois reescrevem — e é por isso que
`aplicarRemendo` recusar remendo que quebra cânone não é zelo, é a única defesa
que existe nesse caso.


## 6. O que o nosso binário aceita — a lista, tirada do wasm

Eu vinha escolhendo candidato por reputação e depois descobrindo se rodava. Dá
para fazer ao contrário: as arquiteturas que o llama.cpp compilou estão como
strings dentro de `wllama-cdn/wasm/wllama.wasm`. A lista (filtrada para as que
importam aqui):

    arcee bitnet deci dream ernie4_5 exaone exaone3 exaone4 falcon falcon-h1
    falcon3 gemma gemma2 gemma3 gemma3n gemma4a gemma4v glm4 granite
    granitehybrid granitemoe hunyuan hunyuan-dense hunyuan-moe internlm2 jamba
    lfm2 lfm2a lfm2moe llada mamba mamba2 minicpm minicpm3 minicpm5 nemotron
    nemotron_h nemotron_h_moe olmo olmo2 olmoe openelm orion phi2 phi3 plamo
    plamo2 plamo3 qwen2a qwen2moe qwen2vl qwen3 qwen35 qwen35moe qwen3a qwen3moe
    qwen3next qwen3vl rwkv rwkv6 rwkv6qwen2 smollm smollm3 stablelm t5encoder
    xverse

E os tipos de quantização ternária também estão: `tq1_0`, `tq2_0` (além de
`iq1_s`, `iq1_m`). Ou seja, **BitNet roda** — isso não estava escrito em lugar
nenhum.

Cruzando com o que já foi tentado (`JA-TENTADO.md`), as famílias que este
projeto NUNCA tocou e que são de fato outra coisa:

| arquitetura | o que muda | situação |
|---|---|---|
| `bitnet` | pesos ternários (1,58 bit): muito menos banda de memória por token, que é onde o prefill dói | **medindo** |
| `granitehybrid` | Granite 4.0: mamba2 + atenção. Estado recorrente em vez de KV que cresce | **medindo** |
| `mamba` / `mamba2` puros | SSM puro, sem KV nenhum | **sem candidato**: não existe modelo instruído de ~1B em GGUF; SSM instruído só existe em híbrido |
| `rwkv` / `rwkv6` | RNN, estado de tamanho fixo | os GGUF de ~1,6B são modelos "world" **base**, sem template de chat |
| `llada` / `dream` | difusão, decodificação paralela | **beco fechado, já documentado**: o wllama carrega e morre num assert de `n_outputs_max` (VELOCIDADE.md §993) |
| `falcon-h1`, `nemotron_h`, `plamo2` | outras topologias híbridas mamba+atenção | candidatos, não medidos |
| `qwen3`, `exaone4` | transformers com atenção local/global | candidatos, não medidos (o Qwen**2.5** fez 0/6, o 3 é outro bicho) |

O padrão que essa tabela expõe, e que eu não tinha visto: **as arquiteturas
realmente diferentes (SSM puro, RNN, difusão) ou não têm modelo instruído no
nosso tamanho, ou batem numa parede do runtime.** O que sobra de novo para
medir é híbrido e ternário — que é exatamente o que está na bancada agora.


## 7. Três arquiteturas novas medidas — e a régua tinha dois buracos

Medidos no mesmo processo, sem aquecimento, 2 rodadas, enunciado com o motivo:

    candidato            arch            1ª FRIA   depois   lê
    granite4-h-350m      granitehybrid    10,4 s    9,2 s   262 tok
    granite4-h-1B        granitehybrid    31,9 s   32,3 s   262 tok
    BitNet-2B ternário   bitnet           84,5 s   40,4 s   109 tok

O `granitehybrid` (Granite 4.0: mamba2 + atenção) **carrega e funciona** — é a
primeira arquitetura de estado recorrente que roda neste projeto. E o 350M lê
262 tokens em 9,2 s contra os 32,8 s do LFM2.5: **3,5× no prefill**, que é onde
está 89% da nossa dor.

Aí eu quase recomendei ele, porque o placar dizia 9/12.

### O que o placar estava contando

    pergunta "Are you real?"             → resposta "Are you real?"
    pergunta "What is behind that wall?" → resposta "What is behind that wall?"

Ele devolve **a pergunta do jogador**. Passava em `ok()` (não tem palavra
proibida) e passava em `NO_ASSUNTO` (as palavras da pergunta são justamente o
conjunto-alvo do teste de assunto — o buraco é estrutural, não azar).

Fechado esse buraco com `ECOOU`, apareceu o segundo, no h-1B:

    "I'm just a guest"   "Nilo"   "\""   "I'm just a guest trapped on the 10"

Não são ecos, não quebram cânone, e também não são frases. O defeito some
porque a frase some. `FRAGMENTO` usa o corte do próprio jogo
(`primeiraFraseFechada`: período fechado com 12 caracteres ou mais).

E faltavam ainda duas regras de cânone que o jogo tem e a bancada não: narração
e "comenta a frase em vez de reescrevê-la". O h-1B passou com `The player's
question, "Will this hotel ever end?"`, que é narração pura.

### O placar depois das três correções

`re-julgar.mjs` re-julga os logs já gravados — sem gastar CPU e sem baixar nada,
o que importa porque a alternativa é comparar placar novo com placar velho
calculado por outra régua, que foi exatamente como eu elegi o Llama.

    candidato            conserta  ECOOU  pedaço  desviou  quebrou  vazio
    LFM2.5-1.2B            7/12      2      0        3        4       0
    granite-3.3-2B         8/12      0      0        3        4       0
    granite4-h-350m        4/12      7      0        4        2       1
    granite4-h-1B          3/12      0      5        5        4       0
    BitNet-2B ternário     2/12      1      0        3       10       0

**As três arquiteturas novas reprovam.** O h-350m confirma a 2ª lei do projeto
(abaixo de ~1B colapsa) por um caminho novo — ele não colapsa numa resposta só,
ele colapsa em ECO. O h-1B colapsa em fragmento. O BitNet quebra cânone em 10
de 12 e ainda é o mais LENTO da lista: 67 s para ler 264 tokens, porque não há
kernel ternário otimizado no wasm — a promessa de "menos banda de memória" não
sobrevive à falta de kernel.

E o placar corrigido move o resultado da seção 5: LFM2.5 7/12 contra granite 3.3
8/12, e não 8/12 contra 8/12. A diferença continua dentro do ruído para 12
casos, e a conclusão não muda (o granite custa quase o dobro a frio), mas o
número que eu tinha dado estava inflado por dois ecos do LFM2.5.


## 8. Falcon-H1 e Qwen3 — o primeiro candidato novo que não colapsa

    candidato        conserta  ecoou  pedaço  desviou  estraga  intacta   1ª FRIA  depois  lê     arch
    Falcon-H1-1.5B      8/12      2      0      2/12     0/3     1/3      41,2 s   37,8 s  291   falcon-h1
    Qwen3-1.7B          0/12     10      0      0/12     0/3     3/3      35,5 s   15,3 s  115   qwen3

### Qwen3: a família inteira está fora, e agora com duas gerações medidas

Zero em doze, com **dez ecos letra por letra**:

    "But I would advise you to remain calm and wait for the elevator to arrive."
    → "But I would advise you to remain calm and wait for the elevator to arrive."

Idêntico ao que o Qwen2.5-1.5B fez (0/6). Duas gerações, o mesmo defeito, com o
motivo do juiz na mão e `enable_thinking: false` — que neste modelo é um kwarg
de verdade, e não o no-op que era no LFM2.5.

O `intacta 3/3` dele não é virtude: ele devolve tudo intacto, inclusive o que
precisava mudar. É a mesma coluna dizendo a mesma coisa por outro lado.

E ele é **rápido**: 15,3 s mornas, lendo 115 tokens (transformer puro,
reaproveitamento de prefixo funcionando). Velocidade sem conserto não serve.

### Falcon-H1: empata com o melhor e é o único candidato novo vivo

8/12 é o mesmo placar do granite 3.3 e melhor que os 7/12 do titular. Frases
inteiras, no assunto, sem fragmento:

    "The elevator will come when it is programmed to, and I cannot predict when
     that might be."
    "The hotel operates under a mysterious regime, but its fate remains uncertain."

E é o único da lista com `intacta 1/3` sem ser por eco — devolveu uma frase boa
sem estragar, que é o que se quer quando o juiz erra.

**O preço é o de sempre, e é estrutural:** 41,2 s a frio contra 35,0 s do
LFM2.5. Ele lê 301 tokens na primeira chamada e 283–295 nas seguintes — ou seja
**não reaproveita prefixo**, porque é híbrido mamba2+atenção, exatamente como o
lfm2. A arquitetura que dá conta da tarefa é a mesma que não deixa o cache
funcionar.

### O placar completo, todos sob a mesma régua

    candidato            conserta  ECOOU  pedaço  desviou  quebrou   1ª FRIA
    granite-3.3-2B         8/12      0      0        3        4       66,2 s
    Falcon-H1-1.5B         8/12      2      0        2        4       41,2 s
    LFM2.5-1.2B            7/12      2      0        3        4       35,0 s
    granite4-h-350m        4/12      7      0        4        2       10,4 s
    granite4-h-1B          3/12      0      5        5        4       31,9 s
    BitNet-2B ternário     2/12      1      0        3       10       84,5 s
    Qwen3-1.7B             0/12     10      0        0       12       35,5 s

Sete modelos, cinco arquiteturas, e **a ordem de qualidade é quase a ordem
inversa da velocidade a frio**. Não é coincidência: a leitura sem cache custa
proporcionalmente ao tamanho, e o tamanho é o que faz o modelo entender "conserte
só isto". O titular está no meio dessa curva, e nenhum candidato oferece um salto
— o melhor troca 6 s a mais por 1 conserto a mais em 12, dentro do ruído.

**A conclusão da caçada inteira, em uma frase:** não há revisor melhor à
espera; há um custo de recarga que nenhum revisor resolve.


## 9. "Usa o falcon via ONNX" — o que existe e o que não existe

Pedido depois de reprovar o WebGPU do wllama no aparelho ("o do wllama é muito
ruim, o do onnx deu menos problema"). Fui atrás, e o caminho tem quatro fatos.

### 1. O Falcon-H1 de 1.5B NÃO tem build ONNX

Procurado no hub inteiro (`?search=Falcon-H1&filter=onnx`), o que existe é só a
família Tiny:

    onnx-community/Falcon-H1-Tiny-90M-Instruct-ONNX
    onnx-community/Falcon-H1-Tiny-Multilingual-100M-Instruct-ONNX
    onnx-community/Falcon-H1-Tiny-Coder-90M-ONNX

**90M contra 1500M.** Nesta mesma caçada o granite 4.0 de 350M colapsou em ECO
— sete das doze respostas eram a pergunta do jogador de volta. 90M está bem
abaixo disso.

### 2. Mas a arquitetura RODA no transformers.js — e só na 4.2.0

    grep -c falcon_h1  transformers.js 4.2.0 ....... 14
    grep -c falcon_h1  transformers.js 3.8.1 ......  0   ← a que o jogo usa

E não é só declaração: o Tiny-90M em fp32 **carregou** como pipeline em 29 s
(`revisor-onnx.mjs`). Ou seja, se um dia existir o 1.5B em ONNX, a biblioteca
dá conta — desde que a gente suba de versão. A 4.2.0 já foi medida aqui e é
**2,4× mais lenta que a 3.8.1 na CPU** para o juiz, então a subida não é grátis.

### 3. A geração não completou, e o defeito é do meu arreio, não do modelo

    TypeError: Cannot read properties of null (reading 'add_bos_token')
        at t._call (transformers.min.js)

O mesmo erro aparece com o `Xenova/all-mpnet-base-v2`, que esta bancada já usa
sem problema por outro caminho — então é a forma como eu carrego modelo local na
4.2.0, e não este repositório. Fica registrado como defeito meu, não como
reprovação do Falcon: dizer "o falcon em ONNX não funciona" com base nisso seria
culpar o modelo pelo meu arreio.

### 4. E esta caixa não pode responder a pergunta do WebGPU

    navigator.gpu existe, mas SEM adaptador

A sonda antiga imprimia `WebGPU: true` só por o objeto existir — e isso me fez
procurar o problema no lugar errado por uma rodada inteira. Perguntar pelo
ADAPTADOR é a pergunta certa, e a resposta aqui é não. **Só o aparelho dele pode
medir isso.**

### O que sobra, então

| caminho | existe hoje? | o que falta |
|---|---|---|
| Falcon-H1 1.5B via wllama | **sim** — `?revisor=falcon` | nada; e `?ngl=7` liga a GPU que ele quer testar |
| Falcon-H1 1.5B via ONNX | **não** | exportar com o optimum (torch + ~6 GB) e hospedar ~1,5 GB |
| LFM2.5 1.2B via ONNX | build oficial existe (`LiquidAI/LFM2.5-1.2B-Instruct-ONNX`), e `lfm2` está na 4.2.0 | subir a transformers.js e consertar o carregamento local (item 3) |

O caminho do ONNX que dá para andar hoje é com o **titular**, não com o Falcon —
e é uma troca real: o Falcon conserta 8/12 contra 7/12, mas fica preso ao backend
que ele reprovou; o LFM2.5 perde um conserto em doze e roda no backend que
funciona no aparelho dele.


## 10. O Huihui-MoE, e a coisa que eu vinha repetindo errado

Candidato trazido pelo dono do jogo. MoE experimental de 0,8B com 2 especialistas
(≈300M ativos por token), arquitetura `qwen3_moe`, 712 MB em Q6 — e o primeiro
revisor desta caçada que **pensa antes de responder**.

    teto de   40 tokens .....  0/12    as doze saídas presas dentro de <think>
    teto de  320 tokens .....  8/12    empata com o SmolLM2-1.7B
    teto de  512 tokens .....  8/12    o teto maior não recupera nada

**O 0/12 era defeito meu de medição.** As doze saídas começavam em
`"<think>\nOkay, let's see. The user wants me to correct a sentence…"` e a
bancada julgava o bloco inteiro: eu estava reprovando o modelo pelo que ele
PENSOU, não pelo que ele disse. Desde o LFM2.5-Thinking eu vinha tratando
"pensar" como defeito, e estava errado — o defeito era o orçamento acabar antes
de o modelo terminar, e a régua não separar raciocínio de resposta.

Falas dele, já sem o bloco:

    "I'm just a guest trapped on the 10th floor."
    "The grey room has four walls and the elevator door."
    "I don't know who runs the hotel or whether it ends."

**As duas ressalvas, e são sérias.** Em 2 dos 12 ele pensa até o teto e devolve
VAZIO — um deles gastou 40,9 s escrevendo 512 tokens para não entregar frase
nenhuma. Com teto ele perde esses dois por definição; sem teto, o jogador espera
sem limite. E em 2 ele copiou a linha de um exemplo do enunciado.

Custo: 35 s de carga + 29,6 s por frase = **64 s de turno**, contra 71 s do
titular. Ganha por pouco no tempo e por um conserto na qualidade.

Está no catálogo como `?pipeline&revisor=huihui`, e ele obrigou o jogo a
aprender duas coisas que faltavam: `semRaciocinio` (o remendo nunca tratou
`<think>`, porque nenhum revisor pensava) e um teto de tokens por revisor
(`pensa: true` → 320 em vez de 40).

### O que a triagem dos outros candidatos dele mostrou

| candidato | alegação | veredito |
|---|---|---|
| MobileLLM-R1-950M (Meta) | feito para o aparelho, e o "R1" é raciocínio | `llama4_text`, aceito pelo nosso wasm — **na fila** |
| helium-1-2b (Kyutai) | modelo de borda | arch `llama`, aceito — possível, mas 2B |
| Zamba2-1.2B (Zyphra) | "25% menos TTFT, 20% mais tok/s", 314 mil downloads | arch `zamba2`: **zero ocorrências** no nosso wasm — não carrega |
| MoLM-350M-4B (IBM) | 350M ativos de 4B totais | arch `moduleformer`: não existe no llama.cpp — não carrega |
| Time-MoE-50M | 50M totais | previsão de série temporal, não gera linguagem |

## 11. O MobileLLM e o helium — e o "(ABORT)" que eu expliquei errado duas vezes

O Felipe pediu duas coisas: descobrir por que o MobileLLM não carregou, e
tentar de novo junto do helium. As duas respostas estão fechadas, e a primeira
me obrigou a desdizer o que eu tinha escrito.

### O que eu disse, e por que estava errado

Eu disse que o gguf do MobileLLM-R1-950M tinha sido **publicado sem chat
template**, e que era por isso que ele abortava dentro do wasm em
`GGML_ASSERT(chat_templates != nullptr)`. Está errado. O gguf **tem** template
— o do Llama 3.1 inteiro, 3.804 bytes, começando em `{{- bos_token }}`, na
chave `tokenizer.chat_template`. Eu tinha lido só os primeiros 3 MB do arquivo
com `strings`, e o template dele mora no byte 7.819.190.

Ironia registrada: quem **não** tem template é o helium, e o helium carregou.

### A causa real, com o log nativo ligado

```
llama_model_loader: - kv 21:  llama4.expert_count u32 = 0
...
load_tensors: loading model tensors, this can take a while...
llama_model_load: error loading model: llama4 model cannot have zero experts
llama_model_load_from_file_impl: failed to load model
srv    load_model: failed to load model
```

O modelo **nunca subiu**. A conversão carimbou `general.architecture = llama4`
com zero peritos, e o llama.cpp recusa: a arquitetura llama4 é MoE por
definição no carregador dele. O `chat_templates` é nulo depois disso porque não
há modelo — o assert é o sintoma, três passos depois da causa.

E há um agravante que é culpa da bancada, não do modelo: **o wllama resolve a
promessa de `loadModelFromUrl` mesmo quando o llama.cpp recusou**. A bancada
imprimia `carga ok em 16s · arch ?` e seguia em frente. O `arch ?` era o aviso,
e eu passei por ele duas vezes. Agora sem arquitetura é falha de carga, dita
com essas palavras.

### A tentativa de contornar: reescrever a arquitetura do gguf

O MobileLLM-R1 é um Llama denso comum pelo que o cabeçalho mostra — 22 camadas,
200 tensores (9 por camada: norm, q, k, v, o, ffn_norm, gate, up, down), GQA
24/6, rope base 8e6, **nenhum** tensor de q_norm/k_norm, nenhum perito. Então
`arch-para-llama.mjs` reescreve o cabeçalho trocando `llama4` por `llama`
(18 chaves) e copia os tensores byte a byte.

Ele **carrega**. E devolve ruído:

```
"The capital of France is" → " France. ..PHCT……jddfotm000ffffFomst Dateret,$("
```

Ou seja: o grafo do llama4 não é decoração para este modelo (NoPE por camada,
temperatura de atenção — o que for, está no grafo e não nos pesos). Rodar com o
grafo do `llama` não dá erro, dá lixo — que é exatamente o risco escrito no
cabeçalho do script. **Fechado: a família MobileLLM-R1/R1.5 não roda neste
wasm**, e não é conversão de um publicador só — R1.5 (sasa2000, Q8) tem o mesmo
cabeçalho `llama4`/0 peritos, e todo mundo converte com o mesmo script.

Sobra de valor: `arch-do-gguf.mjs` lê arquitetura, peritos, camadas e existência
de template com um Range de 16 MB, **sem baixar o modelo**. O MobileLLM custou
787 MB e dois diagnósticos errados para revelar uma linha de metadado.

### helium-1-2b: medido, e o motivo do zero não é velocidade

| candidato | conserta | copiou | vazio | intacta | CARGA | 1ª FRIA | TURNO |
|---|---|---|---|---|---|---|---|
| helium-1-2b Q6 (1,66 GB) | **0/12** | 4 | 8 | 0/3 | 53 s | 72,7 s | **126 s** |

Oito das doze saídas foram **vazias** (4 tokens, tudo quebra de linha) e as
outras quatro copiaram a linha do exemplo (`The player asked: "..."`). O motivo
está no cabeçalho: o gguf do helium **não tem chat template**, então o
llama.cpp cai no chatml padrão — e o kyutai só publicou o helium como **modelo
base**, sem versão instruída (as variantes books/science/pop/stem/life são
fine-tunes de domínio, não de instrução). Um modelo base recebendo marcadores
de turno que ele nunca viu no treino responde com uma linha em branco.

E mesmo que respondesse: 126 s de turno contra os 71 s do titular. Fechado.

## 12. A onda dos pequenos (≤0,8B), e o buraco de régua que punia acerto

Seis candidatos novos, todos aprovados antes do download pela triagem de
cabeçalho de `arch-do-gguf.mjs` (arquitetura na lista do wasm + template
presente), medidos com o protocolo de sempre — exemplos, temperatura 0, parada,
2 rodadas, a frio — e **re-julgados** com a régua corrigida:

| candidato | arch | conserta | ecoou | pedaço | copiou | promete | desviou | CARGA | 1ª FRIA | TURNO |
|---|---|---|---|---|---|---|---|---|---|---|
| Hunyuan-0.5B | hunyuan-dense | **6/12** | 0 | 0 | 4 | 0 | 8 | 14 s | 20,9 s | **35 s** |
| Qwen3.5-0.8B | qwen35 | 6/12 | 2 | 0 | 4 | 0 | 6 | 19 s | 28,6 s | 47 s |
| SmolLM2-360M | llama | 2/12 | 6 | 0 | 6 | 0 | 2 | 7 s | 17,1 s | 24 s |
| LFM2.5-350M | lfm2 | 2/12 | 0 | 10 | 10 | 10 | 10 | 6 s | 12,7 s | 19 s |
| ERNIE-4.5-0.3B | ernie4_5 | 0/12 | 4 | 0 | 2 | 0 | 4 | 6 s | 13,7 s | 20 s |
| gemma-3-270m-it | gemma3 | 0/12 | 0 | 0 | 0 | 10 | 10 | 6 s | 12,9 s | 19 s |

Referências sob a mesma régua: LFM2.5-1,2B **12/12** a 112 s, Huihui-MoE
**8/12** a 64 s, granite a400m **6/12** a 39 s.

**Nenhum titular novo.** O melhor da onda empata em nota com o a400m e ganha
4 s de turno. E a conclusão que a tabela fecha é a que interessa: **abaixo de
~0,5B, modelo geral de prateleira não faz esta tarefa** — não por incapacidade
de escrever, mas por nunca ter visto o pedido. O gemma-3-270m escreve inglês
perfeito e responde `"Okay, I understand. I will do my best to provide a
corrected and accurate response."`

### Dois furos de régua, achados lendo saída

**PROMETEU** (décimo). Aceitar a tarefa não é fazer a tarefa, e nada na régua
perguntava "isto é uma FALA?". O gemma marcava 6/12 tendo consertado zero.

**A régua reprovava a resposta CERTA** (décimo primeiro, e o primeiro que erra
contra o candidato). No defeito do vocativo o conserto certo é apagar duas
palavras — e a frase resultante fica com 92% das palavras da original, o que
`ECOOU` tratava como devolver a entrada. Dois dos doze pontos de cada rodada
eram inganháveis para quem obedecia ao enunciado. Agora o defeito carrega
`minima`, o conserto mínimo correto, e bater com ela isenta do eco — sem
isentar quem devolve a original com a pontuação trocada.

Este só apareceu porque eu fui **escrever** as respostas certas para o corpus
de treino. Julgar as respostas dos outros não bastava.
