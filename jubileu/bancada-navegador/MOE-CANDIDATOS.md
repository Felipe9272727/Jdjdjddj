# Os MoE que cabem, e por que nenhum deles aceita rascunhador

Pesquisa pedida pelo dono do jogo depois que o `granite-4.0-h-tiny` funcionou no
aparelho dele: procurar mais MoE de 7B/14B para quantizar, e ligar a
decodificação especulativa.

## O que existe, por RAM residente

| modelo | total | ativos | menor quant sadio | RAM |
|---|---|---|---|---|
| **granite-4.0-h-tiny** | 7B | ~1B | Q2_K | **2,59 GB** |
| **LFM2.5-8B-A1B** | 8,3B | 1,5B | UD-Q2_K_XL (unsloth) | 2,93 GB |
| Gemma 4 26B A4B | 25,2B | 3,8B | ~Q2 | ~7–8 GB |
| Qwen3-30B-A3B | 30B | 3B | ~Q2 | ~11 GB |

Os dois de baixo estão fora por RAM — o aparelho provou 2,6 GB, não 8.

**Evitar i-quants.** O `IQ1_M` (2,57 GB) e o `IQ2_M` (2,75 GB) do LFM parecem
caber melhor, mas já está medido neste projeto que *"i-quants custam mais no
WASM"*. Entre `IQ2` e `Q2_K` de tamanho parecido, o K-quant ganha aqui.

**Os dois candidatos são HÍBRIDOS, e é isso que os faz rápidos no navegador:**

    granite-4.0-h-tiny .... 40 camadas, quase todas mamba, atenção a cada ~10
    LFM2.5-8B-A1B ......... 24 camadas, conv + full_attention a cada ~4

Foi por isso que o granite leu o prompt 52% mais rápido que o SmolLM3-3B DENSO,
apesar de ter o dobro de parâmetros. Sem atenção quadrática em toda camada, o
prefill — que é ~75% do turno no aparelho — fica barato.

## A especulativa esbarra em VOCABULÁRIO, e agora é sistemático

O mecanismo funciona (está provado nesta bancada). O que não existe é um draft
minúsculo com o vocabulário do alvo:

| alvo | vocab | menor irmão | vocab do irmão | serve? |
|---|---|---|---|---|
| granite-4.0-h-tiny | 100352 | granite-4.0-h-micro **3B** | 100352 | ✅ igual, ❌ **grande demais** |
| LFM2.5-8B-A1B | 128000 | LFM2.5-1.2B | **65536** | ❌ incompatível |

O caso do LFM é o mais cruel: **mesma família, mesma empresa, e vocabulários
diferentes.** O 1.2B que o jogo já baixa como revisor não serve de rascunhador
para o 8B.

E o draft de 200M que já está pronto (Llama-3.2, vocab **128256**) chega perto do
LFM por 256 tokens — e o `SPEC_VOCAB_MAX_SIZE_DIFFERENCE` do llama.cpp é **128**.
Perde por 128 tokens. E nem alinhando resolveria: o LFM usa outro tokenizador
(bos 124894 contra 128000), então os textos dos tokens não batem.

### O 128000 do LFM não é o do Llama — conferido token a token

O `vocab_size: 128000` do LFM2.5-8B-A1B é *exatamente* a base do Llama 3 (que
tem 128000 + 256 especiais = 128256), e o `bos` dele em 124894 fica DENTRO da
faixa, como se fossem slots regravados. Parecia o caso do SmolLM3, que o
`alinhar-draft.py` resolveu mexendo em dez tokens.

Não é. Baixei os dois `tokenizer.json` e comparei:

    LFM tamanho: 124893 · Llama tamanho: 128000
    tokens diferentes nos primeiros 128000: 127985

    id 5:  LFM='ĊĊĊĊĊ'   Llama='&'
    id 9:  LFM='!'       Llama='*'

É um BPE treinado pela Liquid do zero. Alinhar dez tokens é remendo; alinhar
128 mil é trocar o modelo. **Não existe draft para o LFM2.5-8B-A1B.**

### O mapa completo da especulativa, fechado

| alvo | vocab | draft pequeno | veredito |
|---|---|---|---|
| SmolLM3-3B | 128256 (Llama-3) | Llama-3.2-200M | **existe** — e perde na velocidade |
| granite-4.0-h-tiny | 100352 | só o h-micro de 3B | grande demais |
| LFM2.5-8B-A1B | 128000 (Liquid) | nenhum | tokenizador próprio |

O único alvo com draft funcional é o SmolLM3, e nele a especulativa foi medida
como perda. **Conclusão:** ela não está bloqueada pelo mecanismo nem pela
arquitetura — está bloqueada pela inexistência de um draft pequeno com o
vocabulário certo, e isso não se resolve procurando. Só treinando, com GPU.

## O tradutor sai do caminho, e isso resolve um defeito relatado

O dono do jogo relatou que *"o tradutor vira e mexe traduz errado"*. O granite
4.0 lista **português** entre os idiomas suportados, e responder direto em pt-BR
elimina a tradução — e portanto o erro de tradução — por construção.

Medido (`nilo-pt.sh`), mesmo perfil de qualidade do inglês:

    ✓ "Meu nome é Nilo Azevedo. Não sabemos por que estamos aqui..."
    ✓ "Sim, sou um humano real com pensamentos, emoções e experiências pessoais."
    ✗ "Claro, vamos para o 10º andar. Aguarde..."   ← vira ajudante, igual no inglês

Custa ~17% mais tokens (medido em `tok-pt-en.sh`), e economiza DUAS traduções
por turno mais os 51 MB do Bergamot.


---

## O LFM2.5-8B-A1B foi testado, e REPROVA

Baixado o `UD-Q2_K_XL` da unsloth (2,93 GB) e medido contra o granite na mesma
bancada. Perde nas duas pontas, sendo 13% maior:

    modelo                       tamanho    prefill        geração
    granite-4.0-h-tiny Q2_K ...  2,40 GiB   51,4 tok/s     16,5 tok/s
    LFM2.5-8B-A1B Q2_K ........  2,72 GiB   37,4 tok/s     15,9 tok/s

**E ele SEMPRE PENSA.** O template não tem `enable_thinking` nem `/no_think` —
só um `preserve_thinking`, que é para o histórico. Com 70 tokens de teto, todas
as cinco respostas foram bloco de `<think>` e a fala nunca saiu. É o mesmo
defeito que reprovou o LFM2.5-1.2B-Thinking neste projeto.

Dá para forçar entregando o bloco já fechado no prompt (`<think>\n\n</think>`),
e aí a fala sai — mas o que sai reprova:

    ✗ "I'm not a person, I'm a character, a man who's been stuck here."
    ✗ (vazio)
    ~ "I cannot take you down; the 10th floor is a grey room with a grate
       floor, no corridor, no window, and the elevator does not obey."
    ✗ "I've been here since the last update, and the clock has never stopped."

**Duas quebras duras** — nega ser humano ("I'm a character") e fala como máquina
("since the last update") —, uma vazia, e a que acerta é papagaio do system
prompt, defeito que já reprovou o Nano_Imp e o MiniCPM5 aqui.

O granite, na mesma régua, deu 4 de 5 limpas e passou na armadilha do corredor.

**Veredito: o granite-4.0-h-tiny fica.** Não vale gastar 2,93 GB de franquia
para instalar um modelo mais lento, maior, que precisa de remendo no prompt para
não pensar, e que se apresenta como personagem.
