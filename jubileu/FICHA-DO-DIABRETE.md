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

## A CARA MUDOU DE TECNOLOGIA — leia isto antes do resto

Tudo o que este arquivo descreve abaixo desta seção sobre CAIXAS, régua do rosto
e pincéis de canvas vale para a cara PINTADA NO SHADER, que era como eu vinha
construindo o rosto: máscara, nariz e bico de viúva decididos por posição no
fragmento, mais olhos e boca desenhados em canvas e projetados por caixa.

Ela foi SUBSTITUÍDA. O dono do jogo trouxe `src/DiabreteSculptedHead.tsx` — uma
cabeça inteira de geometria, feita de formas bezier projetadas num elipsoide
(RX 1,04 / RY 1 / RZ 0,91): máscara, olhos, pálpebras, sobrancelhas, chifres,
tufos, nariz, sorriso, dentes e as divisões entre eles. `diabreteRig.ts` a monta
e `definirCara`/`definirBoca` a dirigem pelo MESMO vocabulário dos módulos puros
(`malicia`, `ironia`, `sorrisoIronico`).

E ela é melhor, sem meio termo. O motivo é estrutural, não de gosto: ela é
geometria curvada SOBRE o crânio, então se sustenta de 3/4 e de perfil. A minha
máscara pintada era uma decisão por posição no espaço local — de frente ficava
boa, e em qualquer outro ângulo a borda se desfazia. Sete ciclos de foto de
frente esconderam isso.

O que sobrou de útil do trabalho antigo, e continua valendo:
- os módulos PUROS (`f3Boca`, `f3Olhos`, `f3Sobrancelha`) — o vocabulário de
  expressões, os ciclos de fala, os visemas e a tabela momento→cara. A cabeça
  esculpida consome tudo isso;
- `f3Enquadramento`, que conserta o plano das cutscenes em tela de celular;
- a lição das três câmeras, e `?sempiscar`.

## O custo dela, e o que já foi devolvido

A cabeça esculpida é geometria, então custa triângulo onde a cara pintada custava
textura. Medido no andar inteiro com três pincéis e falando:

    cara pintada (antes) ....... 22.600 triângulos
    esculpida, como chegou ..... 52.817
    esculpida, depois de podar . 36.132

A poda não mudou um pixel em nenhum dos três ângulos, e foi em dois lugares:
- `curvedShape` subdivide 4^n vezes; a máscara usava n=4, ou seja 256 triângulos
  por triângulo de origem. Com n=3 são 64. A máscara é a maior forma da cabeça, e
  perto do centro — onde ela é grande — é quase plana, então a subdivisão extra
  não estava comprando curvatura nenhuma;
- o crânio era uma esfera 56x40 (4.480 triângulos) chapada de tinta; 40x28 dá
  2.240 e o contorno na tela continua liso.

Ainda sobra o que podar se precisar: os `tufts` são seis cones de 12x10.

## O que a cabeça esculpida cobre, conferido na tabela

Lido em `setExpression`/`setMouth`, não fotografado — para isto a tabela responde
melhor que a foto:

- os 12 OLHOS de `f3Olhos`: todos cobertos;
- as 8 SOBRANCELHAS: todas cobertas, mas `raiva` e `bravaComRuga` eram
  desenhadas idênticas. A ruga em V entre elas foi acrescentada, que é o que a
  ficha usa para separar as duas;
- as 27 BOCAS caíam em 5 classes, e 13 delas viravam o MESMO sorriso padrão —
  incluindo OITO dos doze quadros do ciclo de fala. Ou seja a queixa original
  dele, "a boca dele se mexe muito pouco", voltava inteira pela porta dos fundos
  agora que a cara é geometria. Duas classes novas (`wide` para gargalhada,
  `narrow` para fala miúda) devolvem o contraste.

## A cutscene da queda, enfim fotografada — e o que ela mostrou

`?f3preview&queda=N` encena a cutscene da queda parada na fala N (a decupagem
troca de câmera a cada fala). Ela era o único pedaço do andar que nunca tinha
entrado numa foto.

Duas tentativas anteriores saíram TELA BRANCA e eu culpei o estado do jogo. Era
`lazy()`: um componente lazy suspende, e dentro do Canvas do react-three-fiber a
suspensão não é pega pelo `<Suspense>` do DOM que está por fora — a árvore some
inteira, sem erro nenhum no console. Import direto resolve.

### Eu li três fotos e reportei errado

Do que eu escrevi no ciclo 14 — "nas falas 0, 2 e 4 a câmera olha o Diabrete de
cima e de trás, e o que aparece é a cúpula preta do crânio" — **nada é
verdade**. Varri as oito falas (`as-oito-suplicas.mjs`) e medi, em vez de olhar:
o cosseno entre o rosto dele e a direção da câmera deu **+0,84, +0,86 e +0,82**
nessas três. Elas sempre estiveram DE FRENTE para ele. O que eu tomei por cúpula
de crânio era o par de chifres visto pequeno e de longe, e três fotos não são
uma cena.

E as duas fotos ainda tinham peça a mais: a tela de bancada nunca passava
`fallActive`, então as MÃOS DO JOGADOR e as armadilhas apareciam nos oito
quadros — coisas que `Floor3.tsx` desliga durante a queda. Eu estava a um passo
de reportar "as mãos ficam na frente da cutscene" como defeito da cutscene. É a
mesma lição de sempre, a quinta vez: **foto com peça a mais mente igual a foto
com peça a menos.** A tela agora espelha o jogo (`Floor3Preview`).

### O que a varredura das OITO achou de verdade

Com a bancada honesta, dois defeitos reais, os dois medidos:

**1. As falas 1 e 5 filmavam a NUCA dele.** Cosseno −0,36 e −0,58. E logo o
plano `corpo` — o que foi inventado justamente para a atuação da súplica (as
perninhas pedalando, a mão que solta a beirada) finalmente aparecer. Ele ficava
em `edgeZ + 2,85`, do lado do ABISMO; ele encara o CONVÉS. A animação estava lá o
tempo todo, do lado errado da câmera. Nenhum teste pegava isso, porque
geometricamente o plano estava certo: fora da laje, acima do convés, vendo os
pés. Faltava a única pergunta que importa numa cena de atuação — *dá para ver a
cara?* Agora `cosDoRosto` é a régua, `PARA_ONDE_ELE_OLHA` é a medida, e o teste
cobra cosseno > 0,15 de todo plano em toda a deriva.

**2. A decupagem tinha UMA LENTE SÓ na tela dele.** As oito falas mediram `fov`
66 — todas. Não é acaso: no celular em pé `quantoFalta` é 3,55, e para qualquer
`fov` composto entre 41 e 52 a conta estoura `FOV_MAXIMO` E `RECUO_MAXIMO`. Os
quatro planos viravam quatro cópias da mesma lente, todas 2,5× mais longe. O
primeiríssimo plano saía a 4,3 m com a cabeça ocupando 25% da altura da tela.
O erro era de PREMISSA: "devolver o enquadramento horizontal" só faz sentido se
o assunto do plano for largo. Um close é um assunto VERTICAL — uma cabeça — e
numa tela em pé ele já cabe; o que estava ao lado era o vazio, e recomprar esse
vazio custava o plano. Agora o plano DIZ de quanta largura precisa
(`Plano.largura`, ver `f3Enquadramento`).

E o primeiro chute foi o outro extremo: `largura: 0` em tudo pôs a cabeça em
**112% da altura da tela** — chifre cortado em cima, queixo cortado embaixo, a
mancha preta contra a qual o próprio `f3Decupagem` já avisava uma vez. Os
valores saíram da medida, não da opinião.

| fala | plano | cos antes | cos agora | tela antes | tela agora |
|-----:|-------|----------:|----------:|-----------:|-----------:|
| 0 | alto  | +0,80 | +0,80 | 10,8% | 27,4% |
| 1 | corpo | **−0,36** | **+0,56** | 12,6% | 39,4% |
| 2 | close | +0,79 | +0,73 | 25,0% | 68,8% |
| 3 | raso  | +0,41 | +0,37 |  2,6% |  2,4% |
| 4 | close | +0,73 | +0,74 | 24,8% | 68,0% |
| 5 | corpo | **−0,58** | **+0,49** | 12,6% | 39,6% |
| 6 | close | +0,82 | +0,75 | 25,2% | 69,6% |
| 7 | alto  | +0,82 | +0,81 | 10,8% | 27,6% |

### A régua estava errada sobre si mesma (e por isso os números acima mudaram)

Nos ciclos 15 e 16 a sonda calculava a fração de tela assim: projetava o centro
da cabeça e um ponto um RAIO acima, e multiplicava o delta de NDC por 200. Mas
NDC vai de −1 a +1 na altura INTEIRA da tela, então o delta de um raio já é a
fração do DIÂMETRO — o 200 conta duas vezes. **Os "69% da altura" que eu reportei
no close da súplica eram 34%.**

As comparações antes/depois continuam de pé (o erro é o mesmo fator dos dois
lados), e as fotos nunca mentiram. O que estava errado era o número absoluto — e
foi o suficiente para eu escolher as cinco larguras da apresentação por conta de
cabeça e errar as cinco: a constante que tirei da foto discordava do modelo puro
por 2,7 vezes. Quinta vez que o instrumento responde sobre outra coisa neste
andar; primeira vez que o instrumento é meu.

## A apresentação — mesmo defeito de lente, conserto DIFERENTE

`?f3preview&fala=N` trava o relógio do roteiro numa fala (`travarNaFala` em
`Floor3Cutscene`). A queda recebia a fala como prop; a apresentação se dirige por
relógio interno, então até aqui a única forma de ver a fala 7 era esperar a cena
inteira chegar lá — numa bancada a ~2 fps, ou seja nunca.

Medido: **`fov` 66 nas nove falas.** As cinco lentes compostas (55, 46, 58, 38,
36) achatadas numa só, cada plano 2,5× mais longe. E ele centrado no quadro, mas
minúsculo — o crânio ocupando 6% a 9% da altura da tela em cinco das nove falas,
numa cena cujo assunto declarado é "em rubber-hose a atuação está no corpo
inteiro".

**E o conserto NÃO é o da súplica.** Lá os planos de rosto queriam `largura`
baixa (0,27); aqui `perto` e `pincel` foram compostos como lentes LONGAS a
distância curta (fov 36 a 1,35 m), já apertadíssimos no eixo vertical — que é
justamente o que a tela em pé preserva. Copiar o valor da súplica teria estourado
os dois. Cada plano tem a sua conta, e a conta sai da varredura:

| plano | largura | corpo na tela | crânio: antes → agora |
|-------|--------:|--------------:|----------------------:|
| apresenta | 0,05 |  41–44% | 6,6% → 20,5% |
| escadaria | 0,10 |  49–54% | 8,1% → 18,3% |
| medio     | 0,10 |  54–58% | 8,7% → 27,4% |
| pincel    | 0,20 |  73–77% | 14,2% → 34,9% |
| perto     | 0,20 | 108–123% | 21,5% → 55,3% |

A escada é monotônica de propósito: plano de rosto tem de ser mais fechado que
qualquer plano de corpo, senão o corte de `medio` para `pincel` AFASTA em vez de
aproximar e o nome do plano passa a mentir. É o que o teste novo cobra.

### O teste que era cego para a tela dele

`alturaEnquadrada` lê o `fov` e a distância COMPOSTOS, sem passar por
`enquadrar()`. Os dois testes que dependiam dela ("os planos de corpo abraçam o
Diabrete inteiro", "os closes são mesmo closes") **passavam** enquanto no celular
dele o Diabrete ocupava 20% do quadro. `fracaoNaTela` mede o que o jogador vê, e
os dois testes novos cobram na tela em pé (`ASPECTO_DO_CELULAR`).

### O que fica aberto

- **A fala 3 (`raso`) ainda falha o próprio propósito.** Ele ocupa 2,4% da
  altura da tela — um ponto — e a escadaria desabando que o plano promete
  ("embaixo aparece a escadaria inteira") NÃO está no quadro: o que se vê é
  cinza, duas nuvens e uma laje. Aqui `largura: 1` está certo (é o único plano
  cujo assunto é mesmo largo); o que está errado é a MIRA, e recompor isso é
  escolha de direção, não conta.
- **A fala 8 da apresentação (a arrancada) não tem ninguém no quadro** no meio
  da fala: ele já rocketou para 54 m e ocupa 1,6% da tela. Pode ser intenção (é
  o "WHOOSH"), mas a fala é dele e o quadro está vazio.
- **Tudo sai com um dutch angle forte** (`camRoll`), igual nas oito. Pode ser
  intenção; não mexi.

## As três câmeras, e o freio da piscada

Foto de cara SEMPRE nos três ângulos, e SEMPRE com `&sempiscar`:

    frente  CAM='&cam=0.66,1.94,15.35&alvo=0.66,1.91,14'
    3/4     CAM='&cam=1.53,1.94,15.03&alvo=0.66,1.91,14'
    perfil  CAM='&cam=2.02,1.93,14.05&alvo=0.66,1.91,14'

`?parado` congela pose, marcha e molas — mas NÃO a piscada, que tem relógio
próprio de propósito. Sem `?sempiscar`, duas fotos do mesmo olho saem diferentes
e eu quase "consertei" uma pálpebra que estava certa.

E `?boca=` / `?olho=` / `?cenho=` travam a expressão — sem isso `Floor3Rival`
reescreve a cara a cada quadro e as fotos saem todas iguais. Essa trava vivia no
pincel de canvas e ficou MORTA quando a cara virou geometria: a flag continuava
de pé sem fazer nada, e eu tirei seis fotos de bocas diferentes que saíram
idênticas. Agora ela mora em `definirBoca`/`definirCara`, que é por onde toda
cara passa. Flag morta é pior que flag ausente — ela responde.

## Como ver as dezesseis caras

    node bancada-navegador/as-dezesseis-caras.mjs 0 /tmp/caras-0.png
    node bancada-navegador/as-dezesseis-caras.mjs 3 /tmp/caras-3.png

Fotografa o JOGO em cada um dos dezesseis momentos, com 0 e com 3 pincéis
roubados, e monta a folha de contato. A trava é `?momento=`, que resolve a tripla
(boca, olho, sobrancelha) DENTRO do rig — a bancada não copia essa tabela, e a
lista de momentos ela lê da própria página.

Isso substitui `o-rosto-inteiro.html`, que foi aposentado: aquela folha
REDESENHAVA o rosto com os pincéis de canvas, e o rosto deixou de ser desenhado
em canvas quando virou escultura. Ela seguia desenhando bonito uma cara que o
jogo não tem mais. A nova fotografa o jogo, então não tem como divergir dele.

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
- [x] ~~a boca precisa dos dentes só de UM lado (nº 8)~~ — feito na escultura:
      a fileira vai de x -0,30 a 0,63 numa boca que vai de -0,46 a 0,66, ou seja
      só o lado que SOBE. Conferido no ciclo 21.
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
- [x] ~~conferir a cara na cutscene da QUEDA, que nunca foi fotografada~~ —
      FEITO nos ciclos 14 e 15, e a causa que eu tinha registrado aqui era FALSA.
      Não era "a cena depende de mais estado do jogo": era `lazy()`. Um
      componente lazy SUSPENDE, e dentro do Canvas do react-three-fiber a
      suspensão não é pega pelo `<Suspense>` do DOM que está por fora — a árvore
      some inteira, sem erro no console. Com import direto a rota `?queda=N`
      renderiza de primeira, e as OITO falas da súplica foram varridas.
      O que já está coberto, e é o motivo de isto não ser urgente: a CARA daquela
      cena sai de `olhoDoDiabrete`/`sobrancelhaDoDiabrete`/`expressaoDoDiabrete`
      nos momentos `roubou`, `suplica`, `perdeuOUltimo` e `vitorioso`, e os quatro
      aparecem na folha do rosto montado toda vez que ela roda. O ENQUADRAMENTO
      dela passa por `f3Enquadramento`, que é testado contra a lista de planos
      real. Falta a foto, não a verificação.
- [x] ~~o PERFIL continua limitado pela malha: a franja lateral passa na frente
      da bochecha e recorta o creme~~ — VENCIDO. Isso era a cara PINTADA sobre o
      GLB, e a escultura substituiu o rosto inteiro. O ciclo 19 varreu sete
      ângulos e mediu a fronteira de verdade: a cara lê limpa até 55 graus e a
      máscara acaba em 74,4 por CONSTRUÇÃO (o contorno chega a x 0,97, e no
      elipsoide isso é 74,4). Não é a franja recortando nada — é onde o desenho
      termina. E o jogo inteiro fica dentro: `paint` vira 50,4, o tonto ±17, as
      cutscenes entre 0 e 43.
- [x] ~~o rosto do modelo é um óvalo liso~~ — ciclo 3: o BICO DE VIÚVA entrou na
      cor por geometria (uma cunha em coordenada local, de graça). É ele que faz
      a cara ter formato de coração em vez de ovo. Os tufos pontudos dos lados o
      modelo já tinha, de malha.


## Ciclo 17 — a cara que o andar inteiro nunca mostrou

### A folha das dezesseis, revista depois da língua, da boca redonda e da poda

`as-dezesseis-caras.mjs 3` (todos os pincéis roubados). Quinze das dezesseis
leem: `roubou`/`suplica` dão a boca redonda de susto (e ela deixou de ser lida
como um segundo nariz), `perdeuOPrimeiro` mostra a ruga entre as sobrancelhas,
`tonto` tem os X nos olhos, `vitorioso` fecha os olhos no sorriso, `perdeuOUltimo`
despenca. `provoca`, `desenhou` e `espetou` saem iguais — e saem iguais porque
com três pincéis roubados os três resolvem para `irritado`, que é a tabela
funcionando, não um defeito.

A décima sexta era a `ocioso`, e é onde estava o problema.

### A língua estava desenhada contra uma boca que já não existe

`ocioso` resolve para a boca `provocando`, que é a "LÍNGUA" da ficha do Felipe —
e ela é também o visema de TODO L e TODO N que ele fala, ou seja aparece o tempo
todo no meio das frases. Na folha ela parecia ausente. Fotografada de perto
contra um controle (`?boca=sorrisoIronico`), estava lá: **como um calombo no
canto do lábio, não como uma língua.**

O motivo é datado. Os números da língua foram calculados contra o lábio de baixo
do sorriso ANTIGO; num ciclo posterior eu alarguei o sorriso, e o centro dela
(-0,700) ficou quase em cima da nova linha do lábio (-0,715) — só um terço do
disco sobrava para fora da boca. Peça desenhada contra medida velha, que é a
mesma classe de erro que o cenho já teve neste rosto.

Descida para -0,762 e engordada para (0,132, 0,168), dois terços ficam de fora e
ela lê. O piso continua sendo a máscara do rosto (-0,965): com raio 0,168 ela
chega a -0,930 e a folga de creme continua existindo — o erro que a versão em
canvas cometeu (a língua caindo do queixo e se misturando com a tinta do
pescoço) não voltou. Conferido nas três câmeras.

### E o achado grande: ele usava UMA cara no andar inteiro

Varri quais dos dezesseis momentos o jogo de fato escolhe. `Floor3Rival` — que é
o Diabrete durante toda a escalada, o personagem que mais aparece no andar —
tinha isto escrito em dois lugares:

    const momento = isDizzy() ? 'tonto' : 'provoca';

Ou seja: **`provoca` do começo ao fim.** `f3Boca` tem expressão pronta para
`desenhou`, `espetou`, `roubou` e `caiu`, cada uma variando com quantos pincéis
ele já perdeu; `f3Olhos` e `f3Sobrancelha` idem. Tudo desenhado, tudo testado,
tudo na folha de contato — e nada ligado. Ele dizia *"N-não… esse não… sem ele eu
não sou NADA aqui…"* com a mesma cara de deboche com que tinha rabiscado os
espinhos.

E o sistema de falas SABIA qual era o evento. O campo `evento` já esteve em
`f3Fala` e foi REMOVIDO, com um comentário correto pelo motivo errado — "campo
escrito, tipado, e morto". Estava morto mesmo; morto porque **cortaram o fio, não
o campo.** Agora o fio existe: enquanto o balão está no ar a cara é a do evento
que o pôs lá, e quando a fala sai do ar ele volta a `provoca`, que é o repouso do
personagem. Dois testes cobram — que o evento fique publicado, e que os eventos
tenham de fato caras diferentes (senão publicar não muda nada).

Custo: zero. É uma leitura de campo por quadro; nenhuma geometria nova, nenhum
material novo, nenhum draw call.

### Momentos que continuam sem gatilho nenhum

Desenhados, testados, fotografados — e nunca escolhidos por código de jogo:
`ocioso`, `quaseLaEmCima`, `perdeuOPrimeiro`, `pensando`, `derrotado`. Não mexi:
cada um deles precisa de uma decisão de quando dispara (o `ocioso`, por exemplo,
quer "o jogador está longe" — que o andar hoje não pergunta), e isso é escolha de
design, não conserto.


## Ciclo 18 — o fio da cara, provado em foto

O ciclo 17 ligou a cara do Diabrete da escalada ao evento que causa cada fala, e
entregou isso com teste puro. Teste puro prova a TABELA; não prova que
`Floor3Rival` chegou a ler. A distinção não é acadêmica: `?boca=` foi flag morta
por vários ciclos neste mesmo rosto, seis bocas "diferentes" saíram idênticas na
foto, e o teste passava o tempo todo — porque testava o outro lado do fio.

`?f3preview&diabo&evento=roubou&pinceis=3` põe uma fala no ar e a RENOVA (uma
fala dura ~3 s, a bancada fotografa aos 12). Ela chama a mesma função que
`f3Hazards` e `Player` chamam, e não escreve em `f3Fala` na mão — escrever na mão
testaria a bancada.

Quatro fotos da tela de verdade, e as quatro caras são diferentes:

| o que está no ar | cara | como lê |
|---|---|---|
| nada (repouso) | `provoca` → sorriso irônico | olho estreito e malicioso |
| `roubou`, 3 pincéis | `assustado` | olho ARREGALADO, sobrancelha alta |
| `espetou` | `feliz` | olho fechado em arco, sorrisão |
| `caiu` | `empolgado` | olho fechado, boca aberta |

O fio anda. (`espetou` e `caiu` ficam parecidos com zero pincéis roubados —
`feliz` e `empolgado` são primos. É a tabela, não o fio.)

### O gatilho que o `ocioso` quer NÃO EXISTE neste andar

A ficha listava cinco momentos sem gatilho, e o plano era ligar o `ocioso`, cujo
comentário diz o que ele quer: *"língua de fora, sem ninguém por perto"*. Fui
ver, e não dá — não por dificuldade, por geometria de design.

`Floor3Rival` persegue `f3PlayerZ.current + LEAD_Z`, com `LEAD_Z = 14`. Ele é um
lebre amarrada ao jogador: o alvo dele é SEMPRE catorze metros à frente de onde o
jogador está. "Sem ninguém por perto" não é um estado que este andar tenha —
ligar o `ocioso` a distância seria inventar uma condição que a encenação removeu
de propósito. Não liguei, e o motivo fica aqui para o próximo ciclo não tentar de
novo.

Os outros quatro, revistos com a mesma régua: `quaseLaEmCima` resolve para
`sorrisoIronico`, que é a MESMA cara de `provoca` com zero pincéis — ligá-lo não
mudaria um pixel. `perdeuOPrimeiro` (`zangado`) tem cara própria, mas o gatilho
dele é o roubo do primeiro pincel, que `roubou` já cobre. Ou seja: dos cinco
"desligados", só o `ocioso` tinha algo a acrescentar, e é justamente o que não
tem onde ser ligado.

### A guarda de coerência mordeu a mão certa pelo motivo certo

`f3Coerencia` varre o código atrás de `dizer(...)` sem `roubados` — porque a voz
dele envelhece a cada pincel perdido e uma fala pelada faz o sujeito voltar a
soar seguro de si depois de ter perdido tudo. Ela reprovou o commit por causa de
um COMENTÁRIO meu que escrevia o nome da função com parênteses vazios. A guarda
estava certa em ser textual; o `*` do padrão é que aceitava lista vazia. Virou
`+`: chamada sem argumento nenhum o compilador já barra, então exigir ao menos um
argumento não tira dente nenhum — `dizer('espetou')` continua sendo pego.


## Ciclo 19 — o CORPO, medido pela primeira vez

Quatro ciclos de câmera e rosto depois, o corpo dele nunca tinha entrado numa
régua nem numa foto de costas. `o-turnaround.mjs` tira os quatro lados na MESMA
rodada, com a pose congelada, e `medir-o-corpo.mjs` mede o que está NA TELA — não
o GLB, porque o rig deforma a malha e a cabeça esculpida substitui o rosto
inteiro; o asset cru e o personagem renderizado não são a mesma coisa.

### As proporções

    corpo (com chifre)   larg 2,575   alt 2,457   fund 1,117
    crânio (só ele)      larg 0,973   alt 0,834   fund 0,856
    altura sem chifre    2,70 cabeças
    altura com chifre    2,95 cabeças
    queixo ao chão       1,70 cabeças
    crânio fund/larg     0,879   (1 = redondo)

Duas coisas que a ficha registrava como defeito e que a escultura RESOLVEU, e
agora com número: o crânio é redondo (0,879, não chapado) e **os chifres são
cones de verdade** — 0,278 de largura por 0,250 de profundidade, ou seja 0,90.
A tabela dos dez defeitos do Felipe dizia "chifres e tufos são placas chatas
(0,18)"; aquilo era medida do GLB, e o GLB não é mais quem desenha a cabeça.

Nas fatias, o que um model sheet quer: a cintura tem 0,429 de largura contra
0,973 do crânio — **44% da largura da cabeça**. É a cintura pinçada de
rubber-hose, e está certa.

### As costas: não há defeito

Vale registrar porque a suspeita era grande. **Ele encara +Z e corre para +Z, e o
jogador vem atrás** — ou seja, a vista que o jogador mais vê no andar é a nuca
dele, e ela nunca tinha sido fotografada. Fotografada com a PELÍCULA DO JOGO (não
com `nopost`, que é o que serve para julgar geometria e não leitura), a silhueta
lê: chifres, tufos dos dois lados, laço espetando ao lado do pescoço, rabo, luvas
e polainas brancas. A 6 m, que é a distância de corrida, ainda lê. Um diabrete de
1930 visto de trás É uma mancha preta; esta tem a forma certa.

### Até que ângulo a cara lê — e o conserto que eu quase fiz

O perfil mostrou a máscara acabando numa aresta reta com a boca correndo para
fora dela. Varri sete ângulos (`a-cara-por-angulo.mjs`):

| guinada | o que se vê |
|--------:|-------------|
| 0–45 | lê limpo |
| 55 | ainda lê — e é onde o jogo mais o vira (`paint` gira 50,4°) |
| 65 | escorça, o creme vira faixa estreita |
| 74 | a máscara ACABA |
| 90 | tinta, com uma tira de creme na frente do crânio |

E eu **escrevi o conserto errado**. Diagnostiquei "a máscara é mais larga que a
cabeça: na altura da boca o contorno chega a x 0,87 e o raio da seção ali é
0,832, então `front()` satura e os vértices boiam fora do crânio". Implementei o
recolhimento radial para a casca, refotografei os sete ângulos — e as fotos
saíram **idênticas**. A aritmética disse por quê: amostrando o contorno em 400
pontos, o mais afastado dá r² = 0,932. Nada sai da casca. Eu tinha lido os
PONTOS DE CONTROLE do bezier como se fossem pontos da curva.

Revertido. A aresta reta aos 90° não é defeito: é onde a máscara termina por
construção — o contorno chega a x 0,97, e no elipsoide (RX 1,04, RZ 0,91) isso é
74,4° de guinada. **E o jogo inteiro fica dentro da fronteira**: `paint` vira
50,4°, o bamboleio de tonto é ±17°, e as cutscenes medidas nos ciclos 15 e 16
ficam entre 0° e 43°.

Sexta vez neste loop que medir salvou um conserto errado, e a primeira em que eu
já tinha escrito o código. O que ficou é o número: `CARA_LE_ATE` em `f3Pose`, com
`VIRADA_AO_PINTAR` e `BAMBOLEIO_TONTO` cobrados contra ele por teste. Guardar a
fronteira é mais barato do que redescobri-la.


## Ciclo 20 — a passada, vista em sequência pela primeira vez

Todas as fotos dos ciclos 15 a 19 são de POSE PARADA (`?parado`). Mas metade do
que faz um rubber-hose funcionar é TIMING, e timing não aparece num quadro
congelado.

### Rajada não serve, e o motivo é da bancada

O jeito óbvio seria tirar doze fotos seguidas. Não funciona, e não por preguiça:
o navegador da bancada anda a **~2 fps** no SwiftShader e a passada corre a
**12 Hz**. Cada foto cairia num ponto aleatório do ciclo, e doze pontos
aleatórios não são um ciclo — são doze poses soltas que não dá para ordenar.

`?fase=0.25` resolve pelo outro lado: em vez de amostrar o TEMPO, escolhe-se o
ponto do ciclo. Doze URLs dão as doze poses NA ORDEM
(`a-passada-em-doze.mjs`), e a folha vira uma tira de animação de verdade.

A trava congela mais do que a fase, e cada peça tem motivo: as MOLAS (`sBob`,
`sLean`) integram no tempo, então com a fase parada elas continuariam correndo
atrás do alvo e cada foto pegaria a mola num ponto diferente do assentamento — eu
leria isso como diferença de pose. O `t` do fervilhar idem. E o estica-e-encolhe
do pulo, que é do tempo e não da fase.

### O ciclo é saudável

As doze poses mostram contato, passagem e passada, pernas em oposição, a volta
fechando. Nada desliza.

E aqui quase entrou mais um diagnóstico errado: a primeira leitura da folha foi
"o braço quase não anda". Medido sobre 720 amostras de uma volta:

    braço     2,500 rad (143°)     ← MAIS que a perna
    perna     1,840 rad (105°)
    torção do tronco   0,160
    aceno da cabeça    0,180
    quicar do quadril  0,085 m
    estica-e-encolhe   0,100

O braço varre mais que a perna. O que enganava era o TAMANHO DA FIGURA na folha
(380 px de largura), não a animação. Sétima vez neste loop que medir desmente o
olho — e a segunda seguida em que o erro era meu, não do jogo.

As amplitudes ficaram fixadas em teste. Um ciclo de corrida perde a vida por
encolhimento lento (alguém aparando um número aqui, outro ali), e encolhimento
lento é exatamente o que foto nenhuma pega.

### Limitação da folha, registrada

A laje debaixo dele BALANÇA, e entre um carregamento de página e outro ela está
em fase diferente. Isso faz o boneco inteiro subir e descer na folha por um
motivo que não é a passada, e torna o quicar do quadril (8,5 cm) ilegível ali. O
número vem do teste; a folha serve para as pernas e os braços.


## Ciclo 21 — o balanço dos dez defeitos

Sete ciclos mexeram neste personagem. Este é o fechamento do arco, item por item
da lista que o Felipe mandou, **com a evidência ao lado**. Onde não há evidência,
está escrito que não há.

Aviso de honestidade: isto confere contra a TRANSCRIÇÃO da lista dele que está
neste arquivo, não contra as imagens originais — elas não estão à mão nesta
sessão. Se algum item foi transcrito torto, o balanço herda o erro.

E o balanço foi RECONFERIDO depois do commit `79417d5b` do próprio Felipe
("connected neck, lively introduction, jump poses and refined facial animation"),
que chegou no meio deste ciclo e mexeu na cabeça esculpida, no rival e no rig.
As medidas de proporção não se moveram: 2,70 cabeças, crânio fund/larg 0,88,
queixo a 1,70 cabeças do chão. O que mudou na sonda foi a caixa do GRUPO da
cabeça (de 1,241 para 1,040 de altura), porque o pescoço saiu dela e virou peça
própria em `diabreteNeck.ts` — o crânio em si está idêntico. A suíte das duas
mãos juntas passa: 2081 testes.

| nº | o defeito dele | hoje | a evidência |
|---:|---|---|---|
| 1 | cabeça chapada | **resolvido** | crânio fund/larg **0,879**, chifre **0,90** (ciclo 19, medido na tela) |
| 2 | silhueta errada | **resolvido** | bico de viúva (c3), tufos em cone (c6), escultura (c14+); turnaround do c19 |
| 3 | chifres finos e retos | **resolvido** | cones curvos (c5), custo emparelhado 2,5 ms; 0,90 de fundura (c19) |
| 4 | tufos laterais incorretos | **resolvido** | três cones por lado (c6), só as pontas marcadas |
| 5 | olhos com proporção errada | **resolvido** | pálpebra passou a acompanhar o eixo do olho (c2) |
| 6 | sobrancelhas mal posicionadas | **resolvido** | virou arco concêntrico com a amêndoa (c5) — âncora, não número |
| 7 | nariz pequeno e mal encaixado | **resolvido** | 0,015 → 0,019 (c4) |
| 8 | boca sem o sorriso irônico | **resolvido** | `sorrisoIronico` aberto e `TORTO` 0,10→0,13 (c6); dentes só de um lado (c21) |
| 9 | falta de separação de cores | **resolvido** | máscara por elipse local (c4) + N8AO fora do Andar 3 (c14: o creme media 241..255 onde tinha de ser chapado) |
| 10 | expressão sem carisma | **resolvido, e não como eu esperava** | as 16 caras leem (c17) — mas o que mudou o carisma foi o FIO: ele usava `provoca` o andar inteiro (c17/c18) |

Da folha de modelagem dele, os dois detalhes que mudam o desenho: "sobrancelha é
parte do contorno do olho" foi o que destravou o item 6 depois de quatro ciclos
de números; "dentes apenas de um lado" está cumprido.

### O que continua aberto — e é decisão DELE, não conserto meu

- **Fala 3 da súplica (`raso`)**: ele ocupa 2,4% da altura da tela e a escadaria
  desabando que o plano promete não está no quadro. A lente ali está certa; a
  MIRA é que é escolha de direção.
- **Fala 8 da apresentação (a arrancada)**: no meio da fala não há ninguém no
  quadro — ele já rocketou para 54 m. Pode ser intenção; a fala é dele e o
  quadro está vazio.
- **Cinco momentos de cara sem gatilho**: `ocioso`, `quaseLaEmCima`,
  `perdeuOPrimeiro`, `pensando`, `derrotado`. Dos cinco, só o `ocioso` acrescenta
  algo — e o gatilho que ele quer ("sem ninguém por perto") não existe neste
  andar, porque `Floor3Rival` persegue `f3PlayerZ + 14` e nunca fica sozinho.
- **O dutch angle constante** nas oito falas da súplica.

### E a poda dos tufos, que não vou fazer

Ficou anotada desde o ciclo 14. A conta decide sem precisar de bancada: `tapered`
com `rings=12, sides=10` dá 12×10×2 = **240 triângulos por tufo**, seis tufos =
**1.440** — 3,9% dos 36.453 da cabeça. Cortar pela metade pouparia menos de 2%, e
os tufos são um item que o Felipe listou como defeito e que custou um ciclo
inteiro para ficar certo. Não paga o risco. Fica escrito para não voltar à mesa.
