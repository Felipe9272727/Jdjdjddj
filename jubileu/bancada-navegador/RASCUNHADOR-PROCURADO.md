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


---

## A segunda rodada: e se o REVISOR rascunhar?

A ideia não é minha. Veio de quem joga, olhando uma fala na tela:

> *"pra vc ver o nível de ruindade que ele está: o revisor, que é um modelo
> menor, e não foi treinado pra essa pergunta em específico, e mesmo assim
> respondeu melhor. isso sinceramente é bem decepcionante"*

Mesma prova, mesma persona, mesmo processo — e desta vez com a régua julgando a
FALA e não o pensamento (a primeira rodada reprovou o v2 em 5 de 8 por causa do
bloco `<think>`; ver o commit da correção).

| candidato | quebra | pensa | LÊ tok/s | ESCREVE tok/s | prompt | por frase |
|---|---|---|---|---|---|---|
| granite-3.1-1b-a400m | **5/8** | 0/8 | 26,2 | 13,1 | 62 tok | ~5 s |
| **v2 0,8B rascunhando** | **0/8** | 8/8 | 22,2 | 10,3 | 276 tok | ~16 s |

### O que o granite escreveu

    ✗ "1 hour, 30 minutes, and counting."
    ✗ "(Nilo looks around, puzzled) This floor is deserted…"
    ✗ "Nilo: "Well, Nilo, I'm sorry to hear about your predicament… I'm here
       to help you navigate through it.""
    ✓ "Nilo: I'm glad you're here to remind me that the hotel doesn't have an
       end. I'll keep that in mind as I navigate this strange situation."

A última PASSOU na régua e é das piores: registro de assistente, rótulo `Nilo:`,
e ela agradece o jogador por lembrá-lo do cânone. A terceira chama o JOGADOR de
Nilo e oferece ajuda — as duas coisas que a persona proíbe em letras maiúsculas.

### O que o v2 escreveu

    ✓ "Name's Nilo, fixed elevators until this floor, and I still don't know
       what runs behind those doors."
    ✓ "I'm not scared — I just don't want to leave this floor."
    ✓ "I want out, and I would try it with you, but I have no safe plan."
    ✓ "The elevator doesn't obey you, and I don't know what it is, so I'm not
       calling it."

Zero rubrica, zero rótulo, zero registro de assistente. **Ele sabe o cânone por
PESO**, enquanto o granite sabe por prompt e ignora o prompt.

E vale ser exato sobre o mecanismo, porque eu vinha escrevendo errado: o v2 NÃO
é destilação no sentido de casar logits com o professor — isso foi tentado e
nunca terminou. Ele é **fine-tune supervisionado off-policy em 423 linhas** que
um professor grande gerou. O que carrega o cânone são 423 exemplos do Nilo certo,
não a distribuição de um modelo de 27B.

A diferença não é acadêmica: torna o resultado mais barato de repetir. 423
linhas de corpus fizeram um 0,8B escrever este personagem melhor que um modelo
de prateleira do mesmo tamanho — e 423 linhas é uma tarde de geração, não uma
semana de GPU.

### O preço, e as duas partes dele que dão para tirar

16 s por frase contra 5 s. Mas o custo do v2 tem dois componentes, e nenhum dos
dois é "o modelo é lento":

    leitura ...... 276 tok a 22,2 tok/s = 12,4 s   ← o granite lê 62
    pensamento ... `<think>` em 8 de 8

O granite lê 62 tokens porque o `cache_prompt` reaproveita o prefixo da persona
entre as chamadas. O v2 relê 276 toda vez. Se o cache pegar nele também, 12,4 s
viram ~4 s.

E o `<think>` aparece mesmo com `enable_thinking: false`, porque o alvo do treino
tinha o bloco LITERAL no texto. Como revisor isso não acontece — lá ele recebe o
formato exato do treino e responde em 26–50 tokens. Rascunhando, fora desse
formato, ele volta ao hábito.

### O que muda no desenho, se as duas cederem

    hoje ..... granite 822 MB escreve → DESCARREGA → v2 542 MB sobe → conserta
    depois ... v2 542 MB escreve E conserta, sem troca de modelo no meio

O que some não é tokens por segundo: é **um carregamento de modelo inteiro por
turno**, que o comentário de `floor10PipelineReal` mede em 36 s de carga mais
35 s de leitura fria. E a fila cai de 1,36 GB para 542 MB.

**Ordem certa:** primeiro matar o `<think>` e destravar o cache, depois medir o
turno inteiro. Trocar o titular antes disso seria trocar 5/8 de quebra por um
turno que ninguém mediu.


---

## A escada dos vizinhos: a co-residência é de graça

Desenho de quem joga: *"eu queria que ambos estivessem rodando juntos, pq não
bate o limite de 2 gbs (...) testa ele primeiro sem o pipeline, depois com o
pipeline, aí a gente vai saber exatamente o problema"*. Um degrau, uma variável.

| degrau | total | escreve |
|---|---|---|
| A · granite sozinho, sem direção | 4,2 s | 12,1 tok/s |
| B · + a direção do cânone | 4,3 s | 12,5 tok/s |
| C · + revisor v2 de pé ao lado | 4,2 s | 12,5 tok/s |
| D · + EmbeddingGemma também | 3,6 s | 13,1 tok/s |
| E · repete C, tudo assentado | 3,1 s | 13,6 tok/s |

**Plano.** Um, dois ou três llama.cpp residentes escrevem à mesma velocidade. A
variação do "total" é quantos tokens ele escolheu escrever (41 a 52), não
velocidade.

### A primeira corrida mentiu, e a tabela se denunciou

Com `warmup: true` no vizinho, C deu **8,8 s (+167%)** e D deu 3,3 s. Um terceiro
modelo devolvendo a velocidade é impossível se a causa fosse contenção — foi
essa contradição, e não um insight, que revelou o defeito: as medidas de C
correram com o v2 ainda aquecendo ao lado.

Ficam duas retratações: **a co-residência não custa 167%** e **a direção não
custa 29%** — custa 3%, dentro do ruído. Os dois números vieram da corrida
contaminada.

## Então de onde vem a lentidão que ele sente?

Não do rascunho, e não dos vizinhos. Dos números do próprio aparelho dele, com
as marcações do juiz ao lado:

    1 frase marcada ..... revisor 30,2 s ..... turno 65,3 s
    2 frases marcadas ... revisor 40,2 s ..... turno 56,4 s
    2 frases marcadas ... revisor 44,0 s ..... turno 55,1 s
    menos marcações ..... — ................. turno 33,8 s

O turno é **rascunho + (marcadas × ~21 s)**. Cada frase que o juiz marca compra
uma chamada de revisor inteira, e é aí que o tempo mora.

E quem decide quantas frases são marcadas é a QUALIDADE DO RASCUNHO. O granite
quebra 5 de 8 nesta bancada; cada quebra é uma marcação, e cada marcação são
~21 s no aparelho.

**A lentidão é sintoma da qualidade, não um problema separado.** Isso muda a
prioridade inteira: consertar o rascunho não é só melhorar a fala, é o caminho
mais curto para o turno cair. E o v2 rascunhando fez 0 de 8 — zero marcações,
zero chamadas de revisor, zero 21 s.


---

## O veredito, medido no aparelho de quem joga

    ?pipeline&rascunhador=v2   →   turno 136,3 s

A projeção desta bancada era ~145 s. Errou por 6% — a razão medida aqui (o v2
rascunha 3,2× mais devagar que o granite) transferiu bem para o celular, o que é
raro neste projeto e vale registrar como método: **a bancada não prevê o número
dele, mas prevê a RAZÃO entre dois números dele.**

O veredito é dele: *"F, ele só serve como revisor msm"*. E está certo — 136 s
contra os ~74 s do granite não se paga com qualidade nenhuma, num projeto cujo
limite de velocidade é a razão de existir da arquitetura inteira.

**Fica registrado o que NÃO deu certo, para ninguém tentar de novo:**

- o v2 rascunhando escreve muito melhor (0/8 contra 5/8) e é lento demais;
- o `<think>` não se cala de fora — três formas testadas, todas falharam,
  porque a tag é o primeiro token que ele emite;
- e a única saída seria retreinar com um corpus de rascunho sem as tags, o que
  está fora de alcance: as unidades de computação acabaram.

O granite continua no posto **por falta de alternativa, não por mérito**. As 5
quebras em 8 seguem lá, e a régua ainda não vê as piores delas.

## O que a rodada dele achou de brinde

O bloco de pensamento do rascunhador foi INTEIRO para a tela, traduzido:

    "<think>A linha errada quebrou o caráter com meta linguagem…</think>
     O nome é Nilo. </pensar> O nome é Nilo."

O `</pensar>` é a assinatura do caminho: o Bergamot traduziu a tag. O bloco
atravessou o enumerador de frases, o juiz, o revisor e o tradutor sem ninguém
reconhecê-lo como não-fala — `semRaciocinio` só era aplicado ao que o REVISOR
escreve, porque até então nenhum rascunhador pensava.

Consertado no orquestrador, e vale para qualquer rascunhador futuro que pense.
