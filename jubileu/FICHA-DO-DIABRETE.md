# A ficha do Diabrete — o alvo, em números

O dono do jogo mandou três folhas do personagem e a frase que encerra a
discussão: **"é esse o visual do personagem, não o que vc fez"**. Este arquivo é
a leitura dessas folhas em números, para cada volta do trabalho comparar contra
a mesma coisa em vez de contra a minha memória da última foto.

As folhas são: (1) turnaround com paleta e proporções, (2) folha de expressões
faciais, (3) guia de implementação para games.

## O que as folhas dizem, e o que eu tinha feito

| peça | a ficha pede | eu tinha | onde mora no código |
|---|---|---|---|
| olho (largura) | ~36% da largura do rosto | 24% | `OLHO_LARG` em `f3OlhosTextura` |
| olho (forma) | oval EM PÉ, inclinado (ponta de fora mais alta) | quase redondo, reto | idem + `INCLINACAO` |
| distância entre olhos | quase se tocam; entre eles cabe o nariz e nada mais | afastados | `OLHO_CX` |
| nariz | uma BOLINHA, que cabe nessa fresta | raio o dobro do certo | `NARIZ_RAIO` em `diabreteRig` |
| sobrancelha | fio FINO e raso, encostado no olho | arco alto e grosso | `f3Sobrancelha` |
| brilho do olho | MORDIDA de creme na BORDA (meia-lua) | pontinho solto no meio | `desenharUmOlho` |
| boca | sorriso largo, abaixo do nariz | ok, mas estreito demais | `BOCA_LARGURA` |

O erro de fundo era esse: **olho pequeno e afastado com nariz grande**. O nariz
grande é que empurrava olho e boca para longe um do outro e espalhava a cara.

## Paleta (folha 1) — e ela já bate

- preto de tinta: cabelo, chifres, corpo, rabo, sapatos — `#141014`
- creme / off-white: rosto e luvas — `#f7f3ea`
- vinho escuro: só a gravata-borboleta — `#8f3a40`

Três cores e nada mais. Sem cinza, sem degradê, sem brilho especular. Foi por
isso que a oclusão de ambiente e o bloom saíram do Andar 3.

## Guia de posição do rosto (folha 3)

A folha 3 traz um diagrama com a ordem, de cima para baixo:

    SOBRANCELHAS  (acima dos olhos)
    OLHOS         (no centro)
    NARIZ         (um pouco abaixo)
    BOCA          (abaixo do nariz)

e diz que a cabeça é **1x altura por 1x largura**.

## A régua deste rosto no modelo 3D

Medida varrendo `?olhosY=` e conferida contra o nariz (um círculo de raio
conhecido, que caiu onde a conta mandou com 0,005 de erro):

    régua = 3,633 * Y - 2,3549          (0 = queixo, 1 = alto da cúpula)
    creme visível ......... Y 0,6482 .. 0,9234   (0,2752 de altura)
    meia-largura do creme . 0,157                (0,314 de largura)
    linha do cabelo ACIMA DO OLHO ....... régua 0,946

A última linha é a que me pegou três vezes: a régua chama de 1,0 o pixel de
creme mais alto da FOTO, que é o alto da cúpula do crânio, lá no meio. Em cima
do olho o cabelo desce e o creme acaba bem antes.

## Os valores de agora

    caixa dos olhos ... cy 0,826   0,30 x 0,168     (canvas 256 x 143)
      órbita no canvas   cy 78,5   92,2 x 113,0     testa 22 px
    nariz ............. cy 0,754   raio 0,015
    bico de viúva ..... ponta em Y 0,885, abrindo 2,0 por unidade de altura
    caixa da boca ..... cy 0,716   0,29 x 0,19      (canvas 192 x 128)

`o-rosto-confere.test.ts` quebra se a folha da bancada
(`bancada-navegador/o-rosto-inteiro.html`) deixar de bater com estes.

## Como conferir sem abrir o jogo

    node bancada-navegador/a-ficha-inteira.mjs /tmp/o-rosto-inteiro.png rosto

Monta o rosto em 2D com a mesma aritmética do fragmento: as 16 expressões do
andar (com 0 e com 3 pincéis), o ciclo de fala, as 27 bocas e os 12 olhos, tudo
numa foto. É a folha que achou a língua-rosquinha e o sorriso pequeno.

Para julgar no modelo de verdade (silhueta, cabelo, chifre):

    CAM='&cam=0.66,1.94,15.35&alvo=0.66,1.91,14' \
      node bancada-navegador/perto-da-cara.mjs "boca=sorrisoIronico&olho=malicia&cenho=ironia"

## O que ainda não bate com a ficha

Lista viva — cada volta risca uma e acrescenta o que a foto nova mostrar.

- [x] ~~`malicia` e `baixoMalicioso` viram barras horizontais~~ — ciclo 2: a
      pálpebra cortava na HORIZONTAL enquanto o olho já era inclinado, e as duas
      brigavam. Agora o corte (e o recorte) acompanham o eixo do olho, e as
      frações caíram de 0,56/0,22 para 0,42/0,10, porque 78% de pálpebra sobre um
      olho de 113 px deixava uma lasca de 25 px.
- [x] ~~a mordida de creme está grande demais~~ — ciclo 2: 0,26 -> 0,21 de raio,
      e empurrada de 0,86 para 0,90, mais na borda.
- [ ] a sobrancelha ainda encosta na franja: as pontas de fora somem no preto.
      Ciclo 2 encurtou de 0,64 para 0,56 e ajudou, mas não resolveu.
- [ ] `fechadoSorrindo` ficou largo e chapado demais
- [x] ~~o rosto do modelo é um óvalo liso~~ — ciclo 3: o BICO DE VIÚVA entrou na
      cor por geometria (uma cunha em coordenada local, de graça). É ele que faz
      a cara ter formato de coração em vez de ovo. Os tufos pontudos dos lados o
      modelo já tinha, de malha.
- [ ] conferir a cara na cutscene da QUEDA, que nunca foi fotografada
