# Andar 3 — o que ele é agora

Uma página, para não ter que ler quarenta commits.

---

## A boca, volta 41 — a nareba e o "se mexe muito pouco"

Duas coisas que o dono do jogo apontou jogando, e as duas eram reais.

**"aí ele perde a nareba".** O remendo creme que a boca carrega junto (para tirar
de baixo dela a boca já pintada na textura do GLB) era uma elipse de CANVAS
INTEIRO — e a caixa da boca é bem maior que a boca. Ele apagava o rosto do queixo
aos olhos, nareba incluída. Agora ele é medido: com a pose congelada (`?parado`)
e a régua da própria cara (`bancada-navegador/medir-a-cara.mjs`, 1 no alto da
cabeça e 0 no queixo), a nareba mora em **0,333..0,339** e a boca pintada em
**0,083..0,244**. O remendo cobre de 0,30 a 0,78 do canvas: pega a boca pintada
com folga e para treze pixels antes da nareba. Conferido nas cinco formas.

**"a boca dele se mexe muito pouco".** A causa não era o desenho, era o relógio:
a fala do trombone inteira dura **0,55 s** (sete notas de 0,1 s) e o balão dela
fica **3 s** no ar. Ele mexia a boca por meio segundo e passava dois e meio de
cara parada. A voz não podia esticar — o trombone curto é o que faz graça —
então quem estica é a boca: ela articula a 8 Hz enquanto o BALÃO está no ar
(`duraNaTela`, 82% dele), com um ciclo de quatro desenhos que nunca repete o
vizinho. Medido na bancada: 20 trocas onde antes havia 2.

**"ele tinha que sempre sorrir ironicamente".** Não virou uma expressão fixa —
isso apagaria as dezoito que ele tinha pedido uma mensagem antes. A ironia foi
para o TRAÇO: `TORTO` cisalha toda forma da ficha, um canto da boca sempre mais
alto que o outro, inclusive na `neutra`. O giro por forma encolheu pela metade,
porque giro + cisalhamento somados faziam do repouso uma risca atravessada na
cara.

Ferramentas novas: `?semboca` (desliga a boca), `?parado` (congela a pose para
foto comparável), `ver-a-boca.mjs` (fotografa forma a forma) e `medir-a-cara.mjs`
(lê a foto e devolve onde cada mancha cai na régua da cara). As três primeiras
existem porque comparar fotos com a cabeça em ângulos diferentes me fez "ver" a
boca em cima do nariz mais de uma vez quando era só o queixo abaixado.

## O arco

O Andar 3 não é uma pista de obstáculos com um vilão em cima. É **o desmonte de
um sujeito**. Ele abre dizendo que a escadaria é dele, que cada plataforma é ele
que rabisca no traço, e que sem os três pincéis não desenha nada. Termina
pendurado num abismo implorando para quem ele passou o andar inteiro humilhando.

Esse arco é contado por **quatro coisas ao mesmo tempo**, e todas leem o mesmo
número — quantos pincéis já saíram das mãos dele (`f3Progress.brushes`, 0 a 3):

| o quê | onde | como muda |
|---|---|---|
| o que ele diz | `f3Falas.ts` | um segundo repertório entra depois do 1º pincel: ele para de se gabar e passa a reclamar do estrago |
| a voz dele | `f3Voz.ts` | sobe de altura, a surdina fecha, o fervilhar acelera, o acento racha |
| a trilha | `f3Trilha.ts` | a vitrola perde corda: o andamento cai, o brilho fecha, entra o choro de disco empenado |
| o chão | `f3Desenho.ts` | as setas desbotam e o tabuado rareia — o andar dele se desfaz junto |

**Um número, um dono.** Se algum dia esses quatro discordarem, é bug.

O fim é uma escolha assimétrica: **puxar pra cima** faz ele te trair
("ENGANADO!"), **pisar na mãozinha** te dá a escadaria ("FIM DO TRAÇO"). Ser
bonzinho custa caro.

---

## Como ele é desenhado

Três relógios diferentes, de propósito — são três ofícios distintos:

- **8 Hz — a LINHA fervendo** (`f3Tinta.ts`). A mão redesenhando o contorno.
  Espinhos, balões, nuvens, a seta desbotada, a passada dele.
- **12 Hz — a POSE, "em dois"** (`f3Pose.ts`). Curta de 1930 roda a 24 quadros e
  cada desenho vale dois: a pose muda 12 vezes por segundo e **fica parada**
  entre uma e outra. É isso que dá estalo ao gesto. Vale para a apresentação, a
  perseguição e a cutscene da queda.
- **contínuo — as MÃOS de primeira pessoa** (`Floor3Hands.tsx`), e isso é
  deliberado: elas são a câmera, não um personagem filmado. Mão em dois com a
  vista em sessenta lê como mão escorregando na tela.

**A boca não é um objeto.** Ela é pintada no fragmento da própria cara, numa
caixa medida em coordenada local do vértice, ANTES do skinning — está tatuada na
malha em pose de descanso, então a cabeça pode girar que ela vai junto porque ela
É a pele. Zero draw call, uma textura, e trocar de boca é trocar textura.

A **gravata** continua sendo um plano, e isso foi verificado, não suposto: o osso
do corpo tem pivô na cintura (0,46) e ela está em 0,60 — 0,14 de distância. O
osso da cabeça está em 0,84 e a boca em 0,638 — 0,20, e a cabeça gira muito mais.
Era o offset da cabeça que estourava.

Mais: **duas cores só** (tinta e creme, com o vinho da gravata como único
acento), **antecipação e sobra** nos gestos (o braço recua antes de apontar; o
tronco chega antes das pontas), e a **boca** com as 18 formas da ficha do
personagem (`f3Boca.ts`), sincronizada nota a nota com a voz — o acento em CAIXA
ALTA abre a boca mais, porque a voz já marcava onde ele grita.

---

## O que foi medido, e quanto deu

| coisa | número |
|---|---|
| custo de render, andar inteiro | 21 draws, 13.781 triângulos |
| custo, 3 pincéis roubados + falando | 27 draws, 16.334 triângulos |
| programas de shader | 19 |
| download dos dois personagens | **416 KB** (era 4,73 MB) |
| balão de grito no celular, pior caso | 9,4% da altura da tela |
| balão da cutscene no celular | 6% da área |
| trilha | 1 fonte em loop, 179,46 s, desacelerando 1,00 → 0,90 |
| testes | 2002 passando, 17 arquivos só deste andar |

**Ressalva:** draws e triângulos dependem de para onde a câmera aponta. Comparar
duas medições feitas de pontos diferentes não diz nada — foi um erro que quase
virou commit.

---

## As bancadas, e o que cada uma responde

| bancada | pergunta |
|---|---|
| `o-andar-inteiro.mjs` | como o andar fica nos quatro estados (0 a 3 pincéis) |
| `andar-pelo-andar.mjs` | como ele fica **andando**, não parado |
| `no-celular.mjs` | os balões e o HUD no tamanho do celular, em porcentagem |
| `ouvir-o-diabrete.mjs` | o som sai? quando? a trilha toca? o disco desacelera? |
| `ver-a-boca-falar.mjs` | a boca sincroniza com a fala? (sequência, não pose) |
| `ver-o-diabrete.mjs` | o personagem de perto: silhueta, cara, boca, gravata |
| `os-dois-desfechos.mjs` | os dois cartões de fim |
| `o-preco-do-andar.mjs` | draws, triângulos, shaders, texturas |
| `ver-a-cutscene-do-3.mjs` | a encenação, em rajada |

---

## Ganchos de desenvolvimento

Só em DEV. Existem porque a bancada roda a ~2 fps e atravessar o andar na mão é
inviável.

```
__startFloor(3)        entra no andar
__f3PularIntro()       pula a intro e cai na apresentação (8 min → 30 s)
                       ATENÇÃO: só no cartão da intro. No da queda ele liga a
                       apresentação por cima da súplica.
__f10teleport(x, z)    move o jogador
__f3Pincel(n)          põe n pincéis na conta
__f3Dizer(evento, {roubados})   faz ele falar
__f3BocaLog            a sequência de trocas de boca
__f3perf() __f3fps() __f3zerar()   custo de render
?boca=<nome>  ?bocaY= ?bocaZ= ?bocaL=  ?cam= ?alvo=   no preview
```

---

## O que eu não consigo julgar daqui

Dito com todas as letras, porque entregar isso como se fosse verificado seria
mentira:

- **o timbre da voz** — se o trombone agrada, se 0,9 de rotação é pouco ou
  demais, se o choro do disco incomoda;
- **o ritmo** — o tempo dos balões, o deslize de 1,2 s da trilha, a cadência da
  pose em dois;
- **o tato das mãos a 60 fps** — a bancada roda a 2 fps e não distingue;
- **se a boca "parece" a da ficha** — as formas estão lá e foram fotografadas,
  mas semelhança é olho.

Isso é ouvido e mão do dono do jogo, no celular dele.

---

## A lição desta sessão

**Foto de coisa parada não é evidência.**

Cinco diagnósticos meus caíram quando eu fui medir ou desligar o componente:

1. "as setas somem por bug" → era a mecânica, e o piso resolveu (esse era real);
2. "a faixa marrom é a cabine" → era a fachada, e some quando o jogador anda;
3. "a vista inicial é vazia" → é o vão da porta emoldurando o desenho; o
   problema era o retrato do celular;
4. "a seta é creme sobre branco" → a seta é tinta preta; o creme era a luz do
   elevador entrando;
5. "a gravata tem shader sem chave de cache" → é material puro, não precisa;
6. "a projeção do shader achata as formas da boca" → era o Rival sobrescrevendo
   o gancho `?boca=` da bancada a cada quadro;
7. "a gravata deve ir para o shader também" → o pivô do corpo é perto, ela não
   desencaixa.

O que funcionou toda vez: **medir antes de afirmar**, e **desligar o componente
para ver o que muda** em vez de deduzir da imagem.
