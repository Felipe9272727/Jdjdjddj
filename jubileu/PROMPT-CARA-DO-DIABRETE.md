# Prompt para gerar as fichas da CARA do Diabrete

O Felipe pediu: "seria legal a cara inteira dele ser animada (tipo uma animação
dos anos 80/60), se quiser me dar um prompt pro chat gpt gerar as imagens".

## Por que estas folhas e não outras

O instinto dele está certo, e tem nome. Desenho animado de TV dos anos 60–80
(Hanna-Barbera e companhia) não redesenhava a cara quadro a quadro: mantinha a
cabeça parada e **trocava CÉLULAS** — uma boca aqui, um par de olhos ali,
sobrancelhas por cima. É exatamente o que o Andar 3 já faz com a boca (dezoito
formas, uma textura, troca em 8 Hz), e é o motivo de isso caber no celular dele.

Então o que estas folhas precisam entregar **não são sprites de jogo**: são
FICHAS DE REFERÊNCIA, que eu redesenho em código como já fiz com as bocas. Zero
byte de download, e cada peça vira uma função testável. Por isso o prompt pede
grade com rótulo, fundo chapado e tamanho constante — e não "cenas bonitas".

## O prompt (copiar daqui para baixo)

> Você vai gerar uma FICHA DE REFERÊNCIA DE ANIMAÇÃO (model sheet) do personagem
> em anexo — o Diabrete, um diabinho de desenho animado dos anos 1930, estilo
> rubber hose / borracha, traço de tinta preta chapada sobre creme.
>
> **Formato da imagem**
> - Uma folha única, fundo creme claro liso (#F7F3EA), sem cenário, sem sombra,
>   sem gradiente, sem textura de papel.
> - Grade organizada em blocos, cada bloco com um título, e cada célula com um
>   rótulo curto embaixo.
> - Tudo desenhado em DUAS CORES apenas: preto de tinta (#141014) e o creme do
>   fundo. Nada de cinza, nada de degradê, nada de brilho. Contorno grosso e
>   sólido, como carimbo.
> - Vista FRONTAL, olhando direto para a câmera, em todas as células.
> - **Toda peça isolada tem que ter o MESMO tamanho e a MESMA posição dentro da
>   sua célula** — elas vão ser trocadas uma pela outra numa animação, então
>   precisam encaixar. Não varie o enquadramento entre células.
>
> **Bloco 0 — A CABEÇA DE REGISTRO (1 célula, maior que as outras)**
> A cabeça inteira dele de frente, em repouso: chifres, cabelo espetado, os dois
> olhos grandes, a bola preta do nariz e o sorriso torto. É a referência de
> alinhamento — desenhe as outras peças pensando nesta cabeça.
>
> **Bloco 1 — OLHOS (12 células)**
> Só o PAR DE OLHOS, isolado, sem cabeça em volta, cada par centralizado igual:
> 1. neutro (pupila no meio)
> 2. olhando para a esquerda
> 3. olhando para a direita
> 4. olhando para cima
> 5. olhando para baixo (de esguelha, malicioso)
> 6. semicerrado / entediado (pálpebra cobrindo metade)
> 7. fechado, sorrindo (dois arcos virados para cima)
> 8. apertado de malícia (fendas finas e inclinadas)
> 9. arregalado (pupila pequena no meio de muito branco)
> 10. bravo (pálpebra em ângulo agudo apontando para o meio da cara)
> 11. triste (pálpebra em ângulo ao contrário, cantos caídos)
> 12. tonto (espiral no lugar da pupila)
>
> **Bloco 2 — PISCADA (4 células, em sequência)**
> O mesmo par de olhos abrindo e fechando: aberto → meio → quase fechado →
> fechado. Uma piscada de desenho animado, para tocar em sequência.
>
> **Bloco 3 — SOBRANCELHAS (8 células)**
> Só as SOBRANCELHAS, isoladas, dois riscos grossos de tinta:
> 1. neutra
> 2. as duas erguidas (surpresa)
> 3. as duas franzidas (raiva)
> 4. UMA erguida e a outra baixa — a de ironia, a mais importante de todas
> 5. preocupada (cantos de dentro subindo)
> 6. desconfiada (as duas baixas, uma mais que a outra)
> 7. pensativa (uma torta, puxada para o lado)
> 8. brava com ruga entre elas
>
> **Bloco 4 — A CARA INTEIRA EM POSE (8 células)**
> A cabeça completa, com olhos + sobrancelhas + nariz + boca combinados, para eu
> ver como as peças se juntam:
> 1. irônico em repouso (a cara padrão dele: sorriso torto, uma sobrancelha
>    erguida, olhar de lado)
> 2. gargalhando (olhos fechados de rir, boca escancarada com dentes)
> 3. provocando (língua de fora, olho semicerrado)
> 4. bravo
> 5. assustado
> 6. surpreso
> 7. pensando (olhar para cima, sobrancelha torta)
> 8. derrotado / acabado
>
> **O que NÃO fazer**
> - Nada de corpo, mãos, cenário ou moldura decorada.
> - Nada de sombreado, volume, 3D, brilho especular ou pintura digital macia.
> - Nada de variar o estilo entre blocos — é a mesma mão desenhando a folha
>   inteira.
> - Nada de texto solto além dos títulos dos blocos e do rótulo de cada célula.
>
> A palavra-chave do acabamento: **carimbo de tinta**, não pintura. Se um traço
> pode ser preenchido com preto chapado, preencha.

## Depois que ele mandar

Cada bloco vira um arquivo puro e testado, do mesmo jeito que `f3Boca.ts`:
- `f3Olhos.ts` — as doze formas de olho e os quatro quadros de piscada
- `f3Sobrancelha.ts` — as oito
- a piscada entra num relógio próprio (piscar é involuntário, não segue os 8 Hz
  do fervilhar nem a fala)
- e as poses do bloco 4 viram a tabela que diz qual olho + qual sobrancelha vai
  com cada momento do andar, do mesmo jeito que `expressaoDoDiabrete` já faz
  para a boca a partir de `f3Progress.brushes`.

O que já está pronto do lado do motor: a cara do Diabrete é pintada no shader
dela mesma, por CAIXA em coordenada local (ver `duasCores` em `diabreteRig.ts`).
Uma caixa para a boca já existe; olhos e sobrancelhas são mais duas caixas no
mesmo shader — mesma textura, mesmo custo, zero draw call a mais.
