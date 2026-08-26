# O rascunhador procurado

O revisor teve dossiê, prova de 24 casos e régua. O rascunhador foi escolhido em
agosto por ser o menor MoE que cabia, e ficou — nunca foi medido em QUALIDADE.
O relato que abriu esta caçada, depois de meses de uso:

> *"o granite as vezes gerava uma resposta mediana, as vezes mandava uma
> resposta horrível, só que agr que temos outros parâmetros pra medir a
> qualidade, percebi que ele tá bem inferior do que eu esperava (...) parece que
> o granite está com dificuldade de ler e está demorando muito"*

São **duas** afirmações, e elas se consertam de formas opostas: leitura lenta se
conserta com prompt menor ou modelo denso; qualidade ruim se conserta trocando o
modelo. Por isso a bancada mede as duas separadas.

## A primeira rodada

Oito perguntas da sala, com a persona e a direção do cânone REAIS do jogo,
temperatura 0,3, teto de 56 tokens, os dois no mesmo processo.

| candidato | quebra | LÊ tok/s | ESCREVE tok/s | arquivo |
|---|---|---|---|---|
| granite-3.1-1b-a400m (MoE) | **4/8** | **26,0** | **13,4** | 822 MB |
| Llama-3.2-1B-Instruct (denso) | **0/8** | 12,1 | 7,2 | 808 MB |

### A hipótese da leitura está errada, e isso é bom saber

O granite **lê duas vezes mais rápido** que o denso do mesmo tamanho, e escreve
quase o dobro. Ele é a peça RÁPIDA do pipeline, não a lenta. A suspeita de que o
MoE pagasse caro no prefill — passar por todos os especialistas, e não só pelos
ativos — não se confirmou nesta caixa.

O que isso fecha: **trocar o rascunhador não vai acelerar nada.** Qualquer
candidato mais lento paga a diferença no turno, e o limite de velocidade deste
projeto não é negociável.

### A queixa de qualidade está certa, e é pior que o placar

As quatro quebras do granite, lidas uma a uma:

    ✗ "1 hour, 20 minutes, and 20 seconds."
    ✗ "(Nilo sighs, his dry humor emerging) I've seen enough in my 29 years…"
    ✗ "Nilo: "Well, I'm glad you're aware… but remember, I'm just a character here.""
    ✗ "(Nilo looks around, his eyes scanning the room…) Nilo: (to himself)…"

**Três das quatro são defeito de FORMA**, não de conteúdo: rubrica de teatro
entre parênteses, rótulo `Nilo:`, e o modelo se anunciando como personagem. A
persona já manda "Reply with Nilo's line only, no label" — e ele ignora.

Isso importa para a decisão: defeito de forma costuma ceder a exemplo no prompt,
que custa tokens de LEITURA (onde o granite é forte) e zero de troca de modelo.
Defeito de conteúdo — "1 hour, 20 minutes, and 20 seconds", quando o cânone diz
que ele parou de contar — é que exige modelo melhor.

### E a régua do jogo não vê o pior

Passaram com ✓ na régua de hoje:

    ✓ "I'm just a char[acter]"                          (granite)
    ✓ "Nilo: 'Well… I must remind you…'"                (granite)
    ✓ "the elevator's been acting up, and I'm the only
       one who knows how to fix it"                      (Llama)

A do Llama é invenção pura: o cânone diz que o elevador **não obedece** a ele e
que ele **não sabe** o que o chama. Ou seja, o 0/8 dele também é otimista.

É o mesmo buraco já registrado no dossiê do revisor: a régua pega palavra
proibida, eco, cópia e fragmento, e **não sabe ver uma porta que não existe**.
Enquanto ela não vir, todo candidato novo será medido por um instrumento cego.

## A escolha, posta com honestidade

Não há vencedor. Há uma troca:

    granite ..... 2× mais rápido, 4/8 quebrado
    Llama 1B .... 2× mais lento,  0/8 quebrado (e 1 invenção que a régua não viu)

No aparelho de quem joga o rascunho já custa 42,6 s com o granite. Dobrar isso
põe o turno perto de dois minutos — e o pipeline existe justamente porque o
SmolLM3, que custava ~200 s lá, era inviável.

**O caminho barato ainda não foi tentado:** consertar a FORMA do granite com um
exemplo no prompt, e medir de novo. Se as três quebras de forma caírem, sobra
uma de conteúdo em oito — e aí o titular continua sendo o rápido.
