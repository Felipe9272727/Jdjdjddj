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

## A lista de 10 defeitos que ele mandou (comparativo lado a lado)

Ele mandou um comparativo do modelo em jogo contra a referência, com 10 defeitos
numerados e uma checklist de 13 itens "para o artista". Metade é DESENHO (meu) e
metade é MALHA (o GLB). Separar isso é a primeira coisa útil a fazer com a lista.

Medido com `bancada-navegador/medir-a-cabeca.mjs`, que lê o GLB direto:

    modelo inteiro   larg 0,869  alt 1,002  fund 0,409   fundo/larg 0,47
    crânio           larg 0,418              fund 0,408   fundo/larg 0,97
    fatia y 0,92     larg 0,376              fund 0,181   fundo/larg 0,48
    fatia y 0,97     larg 0,323              fund 0,057   fundo/larg 0,18

Ou seja: **o crânio é redondo** (0,97). O que é chapado são os CHIFRES e os
TUFOS — no alto da cabeça a profundidade cai para 0,18 da largura. Eles são
placas planas, não cones. Isso é a causa medida dos defeitos 1, 3 e 4 dele.

| nº | defeito dele | de quem é |
|---|---|---|
| 1 | cabeça chapada | malha — mas é o CHIFRE/TUFO, não o crânio |
| 2 | silhueta errada | metade malha (chifre/tufo), metade minha (recorte da máscara) |
| 3 | chifres finos e retos | malha |
| 4 | tufos laterais incorretos | malha |
| 5 | olhos com proporção errada | meu |
| 6 | sobrancelhas mal posicionadas | meu |
| 7 | nariz pequeno e mal encaixado | meu |
| 8 | boca sem o sorriso irônico | meu |
| 9 | falta de separação de cores | meu |
| 10 | expressão sem carisma | consequência dos outros |

Da folha de modelagem, dois detalhes que mudam o desenho:
- **"Sobrancelha é parte do contorno do olho (desenho 2D)"** — ela não é um arco
  solto flutuando na testa; é parte da mesma forma de tinta do olho.
- **"Boca: dentes apenas de um lado"** — o sorriso é torto e os dentes só
  aparecem no lado que sobe.

## O que ainda não bate com a ficha

Lista viva — cada volta risca uma e acrescenta o que a foto nova mostrar.

- [x] ~~`malicia` e `baixoMalicioso` viram barras horizontais~~ — ciclo 2: a
      pálpebra cortava na HORIZONTAL enquanto o olho já era inclinado, e as duas
      brigavam. Agora o corte (e o recorte) acompanham o eixo do olho, e as
      frações caíram de 0,56/0,22 para 0,42/0,10, porque 78% de pálpebra sobre um
      olho de 113 px deixava uma lasca de 25 px.
- [x] ~~a mordida de creme está grande demais~~ — ciclo 2: 0,26 -> 0,21 de raio,
      e empurrada de 0,86 para 0,90, mais na borda.
- [x] ~~`fechadoSorrindo` largo e chapado~~ — ciclo 4: arco de raio menor com
      abertura maior (53 x 18 em vez de 67 x 18), a curva aparece.
- [x] ~~falta de separação de cores (nº 9)~~ — ciclo 4: a máscara deixou de ser
      "onde a normal aponta para frente" e virou uma ELIPSE em coordenada local.
      O teste por normal fazia a borda do creme acompanhar a curvatura da malha,
      e ela mudava de formato a cada ângulo de câmera.
- [x] ~~nariz pequeno (nº 7)~~ — ciclo 4: 0,015 -> 0,019. Eu tinha passado do
      ponto para o outro lado ao corrigir o 0,030.
- [x] ~~a sobrancelha encosta na franja~~ — ciclo 5, e a solução foi trocar a
      ÂNCORA, não os números. Ela virou um arco CONCÊNTRICO com a amêndoa,
      girado junto com ela, como a folha de modelagem manda ("sobrancelha é
      parte do contorno do olho"). Quatro ciclos eu a encurtei, afinei, empurrei
      e aparei sem resolver, porque o número que a posicionava não tinha relação
      com a forma que ela devia acompanhar.
- [ ] a boca precisa dos dentes só de UM lado (nº 8)
- [x] ~~CHIFRES são placas planas~~ — ciclo 5: dois cones curvos de tinta
      chapada, presos ao osso da cabeça, um pouco maiores que as placas. Como
      tudo é posterizado em duas cores, preto sobre preto não tem emenda.
      Medido em execução emparelhada: 139,5 ms com, 137,0 ms sem — 2,5 ms.
- [x] ~~os TUFOS laterais são placas planas~~ — ciclo 6: três cones por lado, na
      faixa entre a borda da máscara (0,196) e o extremo da franja (0,27). NÃO
      cobri a franja inteira de propósito: medida, ela é uma massa de espetos
      pequenos que envolve a cabeça (x -0,269..-0,004, z -0,194..0,204), e
      engoli-la deixaria uma bola no lugar do cabelo. Só as PONTAS ficaram
      marcadas, que é o que a ficha pede ("três pontas principais").
- [x] ~~a boca não tem o sorriso torto (nº 8)~~ — ciclo 6: `sorrisoIronico`, que
      é a boca de repouso e a que mais aparece, abriu de 0,05/0,13 para
      0,09/0,22, e o `TORTO` universal subiu de 0,10 para 0,13.
- [x] ~~a máscara desmontava de 3/4 e de perfil~~ — ciclo 7, e só apareceu porque
      foi a primeira vez que fotografei o personagem de outro ângulo. Sobrava um
      `n.z > 0.0` do teste antigo: perto da silhueta a normal interpolada oscila
      de triângulo em triângulo, e a borda do creme saía serrilhada com retalhos
      soltos na lateral. Era redundante — quem mantém a nuca preta é `p.z > 0`,
      que é posição. E o `p.z` subiu para 0,075 para o creme parar ANTES da
      franja, em vez de contornar a cabeça e aparecer entre os espetos.
- [ ] conferir a cara na cutscene da QUEDA, que nunca foi fotografada
- [ ] o PERFIL continua limitado pela malha: a franja lateral passa na frente da
      bochecha e recorta o creme. Isso é remodelagem, não ajuste.
- [x] ~~o rosto do modelo é um óvalo liso~~ — ciclo 3: o BICO DE VIÚVA entrou na
      cor por geometria (uma cunha em coordenada local, de graça). É ele que faz
      a cara ter formato de coração em vez de ovo. Os tufos pontudos dos lados o
      modelo já tinha, de malha.
- [ ] conferir a cara na cutscene da QUEDA, que nunca foi fotografada
