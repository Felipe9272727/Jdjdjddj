# O kernel relaxed SIMD do q4_K, e por que ele é opcional

## O que é

Um caminho novo no `ggml_vec_dot_q4_K_q8_K` do wasm, usando
`wasm_i32x4_relaxed_dot_i8x16_i7x16_add` — uma instrução que funde
extend+multiply+add numa só. É a operação mais quente do SmolLM3 Q4_K_M e do
revisor v2, então ela paga em toda peça do pipeline.

Aplicar: `relaxed-q4k.patch` sobre o `llama.cpp` do wllama, mais
`-mrelaxed-simd` em `WLLAMA_COMPILE_OPTIONS` no `CMakeLists.txt`, e recompilar
o alvo `wllama` no `build-simd`. O resultado já vem pronto em
`public/wllama-relaxed/`.

## Por que a versão de upstream não serve

A PR #19590 do llama.cpp faz a mesma ideia e **quebra em x86**. Medido aqui: o
modelo passa a cuspir `'#/]'# gec""/]jumbotron.fi;; pymysql pymysql`.

A instrução exige que o SEGUNDO operando caiba em i7, `[0,127]`, porque as duas
arquiteturas a implementam de formas que só concordam nessa faixa:

    x86 ... PMADDUBSW   com sinal × SEM sinal
    ARM ... SDOT        com sinal × com sinal

A PR escreveu `(q4l0, q8x0)` — as ATIVAÇÕES na vaga restrita. Elas são int8 de
faixa cheia, `-128..127`, e estouram a restrição. Em ARM (o M2 onde o autor
mediu) o SDOT lê com sinal e a conta fecha; em x86 o PMADDUBSW lê sem sinal e o
resultado é lixo.

Aqui vai invertido, `(q8x0, q4l0)`. Os pesos são `q4x0 & 0x0F` e `q4x0 >> 4`,
ou seja **0..15 por construção** — dentro de i7 em qualquer arquitetura. O
produto escalar é simétrico, então a matemática não muda; só o valor pequeno
passa a ocupar a vaga que exige valor pequeno.

O agrupamento de faixas difere entre as duas instruções, e aqui é inócuo:
`vacc1` e `vacc2` são somados nas quatro faixas logo abaixo, e soma não se
importa com a ordem das parcelas.

**Só o `q4_K` foi convertido.** Nas outras funções os pesos podem ser negativos
(o `q4_0` subtrai 8), e ali a inversão não salvaria — todas ficaram no caminho
seguro.

## O que está medido

Navegador, SmolLM3-3B Q4_K_M, 4 fios, x86:

    velho .... 12,3 s por turno · 5,19 tok/s
    novo ..... 10,6 s por turno · 6,05 tok/s      1,17×

Qualidade, 6 perguntas com `temp 0.7` e a régua do cânone:

    velho .... 5/6 falas limpas
    novo ..... 5/6 falas limpas      mesma pergunta falhou nos dois

Determinismo, com `temp 0`, `top_k 1` e UMA thread:

    novo contra novo ..... IGUAL caractere a caractere
    velho contra novo .... diverge

## A armadilha que quase me pegou, e a régua que faltava

Meu primeiro teste de determinismo rodava com 4 fios e dizia "DIVERGIU" para
tudo. **O build antigo diverge de si mesmo com 4 fios** — a redução em ponto
flutuante soma em ordem variável entre threads. O teste só vira instrumento com
`n_threads: 1` e amostragem travada; sem isso ele não mede nada.

E o dono do jogo corrigiu o enquadramento, com razão: **fala idêntica nunca foi
o objetivo**. A naturalidade do SmolLM3 é dar respostas diferentes para a mesma
pergunta sem inventar fato. O `temp 0` é bancada, não requisito — serve só para
denunciar aritmética quebrada. A pergunta que decide é a qualidade da fala, e
nela os dois empatam.

## POR QUE É OPCIONAL, E NÃO O PADRÃO

**Não consigo testar na arquitetura que importa.** Esta bancada é x86; o
aparelho do dono do jogo é ARM. A instrução é exatamente onde as duas divergem.
A inversão dos operandos deveria deixá-la correta nas duas — os pesos são
não-negativos, que é o que ambas as implementações exigem — mas *deveria* não é
*medido*.

Além disso, `-mrelaxed-simd` é uma flag GLOBAL: ela libera FMA relaxado em todo
código de ponto flutuante do binário, não só neste kernel. Parte da divergência
contra o build antigo pode vir daí, e eu não separei as duas causas.

Então o caminho honesto é este: o pacote existe em `public/wllama-relaxed/`,
lado a lado com o de sempre, e quem tem o aparelho decide depois de medir nele.
