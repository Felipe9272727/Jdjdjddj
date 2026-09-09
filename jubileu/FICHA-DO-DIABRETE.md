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

### O que fica aberto

- **A fala 3 (`raso`) ainda falha o próprio propósito.** Ele ocupa 2,4% da
  altura da tela — um ponto — e a escadaria desabando que o plano promete
  ("embaixo aparece a escadaria inteira") NÃO está no quadro: o que se vê é
  cinza, duas nuvens e uma laje. Aqui `largura: 1` está certo (é o único plano
  cujo assunto é mesmo largo); o que está errado é a MIRA, e recompor isso é
  escolha de direção, não conta.
- **A apresentação tem o mesmo defeito de lente** e não foi tocada neste ciclo:
  `planoDeApresentacao` tem `perto` (fov 36) e `close` (38) que na tela dele
  também estouram para 66 com recuo 2,5. `Plano.largura` já existe para eles.
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
- [ ] conferir a cara na cutscene da QUEDA, que nunca foi fotografada.
      TENTATIVA NO CICLO 8, e falhou: montei uma rota `?f3preview&queda=N` e ela
      desenha tela branca, mesmo plantando `f3DevilPos`/`f3DevilPosValid` na mão.
      Sem erro de página e sem exceção — só dois avisos de textura do WebGL
      (`glTexStorage2D: Invalid internal format 0x1907`). A cena depende de mais
      estado do jogo do que eu identifiquei. A rota foi REVERTIDA em vez de ficar
      no repo quebrada.
      O que já está coberto, e é o motivo de isto não ser urgente: a CARA daquela
      cena sai de `olhoDoDiabrete`/`sobrancelhaDoDiabrete`/`expressaoDoDiabrete`
      nos momentos `roubou`, `suplica`, `perdeuOUltimo` e `vitorioso`, e os quatro
      aparecem na folha do rosto montado toda vez que ela roda. O ENQUADRAMENTO
      dela passa por `f3Enquadramento`, que é testado contra a lista de planos
      real. Falta a foto, não a verificação.
- [ ] o PERFIL continua limitado pela malha: a franja lateral passa na frente da
      bochecha e recorta o creme. Isso é remodelagem, não ajuste.
- [x] ~~o rosto do modelo é um óvalo liso~~ — ciclo 3: o BICO DE VIÚVA entrou na
      cor por geometria (uma cunha em coordenada local, de graça). É ele que faz
      a cara ter formato de coração em vez de ovo. Os tufos pontudos dos lados o
      modelo já tinha, de malha.
- [ ] conferir a cara na cutscene da QUEDA, que nunca foi fotografada
