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

**Conclusão:** a especulativa não está bloqueada pelo mecanismo nem pela
arquitetura — está bloqueada pela inexistência de um draft pequeno com o
vocabulário certo. Para destravar seria preciso *treinar* um, e isso exige GPU.

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
