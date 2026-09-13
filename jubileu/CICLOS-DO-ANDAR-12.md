# Ciclos do Andar 12 — a escada até parecer jogo publicado

> **Este arquivo é a lista viva do andar.** Quem chegar aqui com contexto limpo
> lê isto primeiro, pega o próximo item ABERTO, faz, mede e marca.

## A regra de cada ciclo

1. Ler este arquivo e `COMO-MEDIR-O-ANDAR-12.md`.
2. Pegar **um** item ABERTO (o de cima da lista, salvo motivo escrito).
3. Fazer, **medir com a bancada que joga**, e fotografar quando for visual.
4. `npx tsc --noEmit` + `npx vitest run` + `npm run build && node inline-build.mjs`.
5. Commitar com o número **antes → depois** na mensagem. Push.
6. Atualizar este arquivo: marcar FEITO, anotar o número, acrescentar o que o
   ciclo revelou de novo.

**Nunca** marcar um item como feito com "acho que melhorou". Três entregas
seguidas saíram quebradas por isso — e a régua não pode ser a opinião de quem
escreveu o código. A ordem dos itens abaixo está sujeita ao que um avaliador
independente apontar; quando ele discordar da lista, ele ganha.

## O teto, escrito uma vez

Não existe caminho daqui até um render path-traced. A stack é Three.js com
`MeshLambertMaterial` e `flatShading`, arquivo único, alvo de 60 fps num celular.
O que está ao alcance e é o que separa amador de publicado: **impacto de
combate**, **áudio em camadas**, **clímax**, **desempenho** e **acabamento de
tela**. A escada abaixo é só disso.

## Onde a régua está hoje (2026-09-12, ciclo 4)

| medida | valor |
|---|---|
| luta completa, toque deitado | 105 s |
| luta completa, toque em pé | 109 s |
| luta completa, teclado | 114 s |
| diferença entre a tela mais rápida e a mais lenta | 7,9 % |
| padrões vistos em 60 s | 5 de 5 |
| tempo até poder jogar | 12,4 s |
| FPS **mediana** (deitado / em pé / desktop) | ~46 / ~42 / ~38 (ruído de ±10%) |
| FPS **mínima** (deitado / em pé / desktop) | 21,4 / 22,4 / 16,7 |

> Três medições seguidas no MESMO commit deram 47,3 · 44,8 · 45,9 de mediana, e
> uma quarta deu 53,6. Ver a nota nova em `COMO-MEDIR`: abaixo de ~10% é ruído, e
> este arquivo já anunciou ganhos de 1 a 3 fps como se fossem resultado.
>
> A MÍNIMA entrou nesta tabela no ciclo 7, e entrou porque faltava: um avaliador
> mediu 17 fps de mínima e observou que o número nunca tinha sido discutido —
> "hoje só a mediana entra na tabela". Uma tabela que só mostra a mediana esconde
> exatamente o engasgo que o jogador sente. Alvo: mediana 52/45, **mínima 30**.

---

## A ESCADA

### 1. IMPACTO — ABERTO
O tiro acerta e quase nada acontece: um flash na pele e um bipe. Num jogo
publicado, acertar é a coisa mais gostosa que existe.
- hitstop (congelar 40-70 ms no acerto forte)
- tremor de câmera com decaimento por curva, não linear
- faísca/impacto no ponto do acerto, não só a cabeça inteira piscando
- número de dano subindo, ou equivalente que não polua
- acerto do tiro CARREGADO tem de ser um acontecimento
**Como medir:** contar eventos de feedback por acerto na bancada; FPS não pode cair.

### 2. O CLÍMAX — FEITO (ciclo 5)
A cabeça morre em cena: estouros em cadeia que ACELERAM (0,42 s -> 0,10 s), um
estouro grande aos 2,4 s, e então ela tomba e cai acelerando para fora do
quadro. O céu clareia para dourado (domo E névoa), a câmera avança e sobe, e o
jogo inteiro roda a 0,35x. 4,4 s até o balão.
**Medido:** `bancada-navegador/a-morte-do-chefe.mjs` — 7 quadros em `morrendo`,
duração observada 4,9 s ponta a ponta, fase final `vitoria`. Seis testes em
`f12Boss.test.ts` prendem a faixa de 3-6 s, a ordem estouro-antes-da-queda, a
aceleração da cadeia, e que a queda tira a cabeça INTEIRA do quadro.

### 3. ÁUDIO EM CAMADAS — ABERTO
Tudo são bipes procedurais soltos. Falta: motor contínuo que muda com a
manobra, uma base musical que muda na virada, e mixagem (o tiro não pode ter o
mesmo peso da explosão).
**Como medir:** contar vozes simultâneas; conferir que o motor não corta.

### 4. VOLTAR PARA 60 FPS — ABERTO
O céu novo custou 60 → 50/45. Alvo: 58+ nas duas orientações, sem desmontar a
cidade.
**Como medir:** bancada, mediana e mínimo.

### 5. ACABAMENTO DE TELA — ABERTO
HUD é funcional e cru. Barra do chefe sem segmentos, vidas sem peso, sem cartão
de título do andar, sem tela de resultado.
**Como medir:** foto; e o HUD não pode cobrir a cabeça (regra já paga).

### 6. A NAVE TEM DE TER PESO — ABERTO
Ela persegue um alvo com resposta 22: precisa, e sem massa. Falta inclinação com
inércia, guinada no eixo, rastro que estica na virada, e a câmera respondendo à
manobra.
**Como medir:** bancada — o tempo de luta não pode sair da faixa 90-150 s.

### 7. O IRMÃO TEM DE SER PERSONAGEM — ABERTO
Ele voa em formatura e atira. Não reage a nada: não comemora, não apanha, não
se assusta. Barks já existem (`F12_ALERTAS`); falta o corpo.

---

## Diário

### Ciclo 0 — 2026-09-12 — a escada foi escrita
Estado inicial registrado acima. Nada feito ainda.

### Ciclo 4 — 2026-09-12 — a cidade virou horizonte, e a régua parou de chutar

**A cidade.** Eram 14 torres de geometria posicionadas por fração de tela. Como
`xParaFracao` preserva o ângulo subtendido, afastá-las não reduzia o
esparramamento em perspectiva: nas bordas do quadro elas tombavam para fora e o
terço de baixo virava entulho. Viraram dois painéis pintados em canvas, ancorados
pela LINHA DO CÉU (`topo`) e com a altura em fração de tela, resolvidos pela
mesma régua do resto do andar. A camada de trás desbota 62 % na cor da bruma e
não acende janela nenhuma — janela é contraste máximo, e contraste máximo ao
longe desfaz a distância que o desbotamento acabou de construir.

**A régua.** A bancada tinha o teto da vida (`240`) escrito à mão em três
lugares. Consertar o hitstop devolveu ao jogo o relógio que um defeito roubava, a
luta encurtou para 84 s (abaixo do piso de 90 s), a vida subiu para 300 — e a
bancada passou a relatar `83.4 de 240` onde houve 149,4. Hoje ela lê o teto da
página e diz `[SEM TETO]` em vez de chutar.

| medida | antes (HEAD) | depois |
|---|---|---|
| luta, toque deitado | 103 s | 110 s |
| luta, toque em pé | 100 s | 108 s |
| luta, teclado | 98 s | 111 s |
| diferença entre telas | 5,0 % | 2,6 % |
| FPS mediana deitado / em pé / desktop | 46,3 / 43,2 / 37,7 | 47,9 / 44,7 / 38,0 |

### Ciclo 6 — 2026-09-13 — a cena ganhou imagem, e a câmera parou de esconder a piada

O quarto parecer deu 6,0 e a frase que importa foi: a morte tinha "cronômetro,
teste e comentário, e não tinha imagem". Ele refotografou a 170 ms e contou ONZE
quadros seguidos sem nenhum estouro visível — porque os "estouros" eram
`impacto('carregado')`, ou seja faíscas de três pixels a quarenta unidades da
câmera. A faísca diz ONDE; ela não sabe dizer QUANTO, porque quanto se lê por
ÁREA. Nasceram as BOLAS DE FOGO (`Floor12Estouros.tsx`) e o clarão de tela que o
comentário já prometia e não existia.

E a INTRODUÇÃO: o desdobramento acontecia à vista desde o ciclo 2, e mesmo assim
ninguém via — a câmera saía da primeira pessoa direto para o `recuo` DA LUTA, que
é a distância calculada para o avião ocupar 27% da largura enquanto desvia de
coisas. Distância de jogo não é distância de cena. Agora ela chega perto durante
`'virando'` e recua quando a luta começa.

| medida | antes | depois |
|---|---|---|
| FPS mediana deitado / em pé / desktop | 51,7 / 46,2 / 39,3 | 54,5 / 47,9 / 39,3 |
| luta, três telas | 108 / 108 / 105 s | 115 / 110 / 117 s |
| pico de luz na morte | 100,4% do quadro vivo | 126,2% |
| elevador virando avião, na tela | ~35 px | a cena inteira |

### Ciclo 7 — 2026-09-13 — o fogo foi para a luta, e o afundo foi medido em pixel

O sexto parecer deu 6,3 e o achado foi certeiro: as bolas de fogo — a melhor
coisa do ciclo anterior — só eram chamadas em quatro lugares, **todos dentro da
morte**. O sistema de impacto por área existia e os cem segundos que o jogador
passa JOGANDO continuavam pagando o acerto com uma faísca de três pixels.

A bola foi para a TABELA `IMPACTOS`, e quem a dispara é `impacto()`. Nenhum
ponto de acerto pode esquecer dela porque nenhum ponto de acerto a chama. O tiro
comum fica em ZERO de propósito: ele acerta sete vezes por segundo, e se
estourasse o carregado não teria com o que contrastar.

E o AFUNDO, que era o segundo ciclo seguido em que eu fechava um defeito visual
com um teste em unidades de mundo: 4,5 unidades é 29% do diâmetro da cabeça, e
ao quadrado metade disso acontecia no último terço. Agora a bancada da morte lê
o `y` DE TELA da cabeça e exige `MORTE.afundoNaTela` de queda antes do estouro
grande. Medido: **21,2% da altura da tela** (alvo 12%).

| medida | antes | depois |
|---|---|---|
| FPS mínima deitado / em pé / desktop | 17 / — / 19 | 23,8 / 23,1 / 21,5 |
| afundo da cabeça antes do grande | não medido em tela | 21,2% da altura |
| bolas de fogo fora da cutscene | 0 | carregado, dano, camareira |
| céu vazio no fim da morte | ~0,6 s | ~0,2 s |

### Ciclo 9 — 2026-09-13 — a segunda metade ganhou um verbo

O sétimo parecer mediu a segunda metade da luta e achou **um** padrão exclusivo:
zero. Era uma tensão que eu tinha criado sem perceber que eram dois defeitos:

1. o pedido original era "dois ataques novos aos 50% de vida", e foi o que se
   fez — até a bancada medir que ninguém chegava aos 50% e os dois ataques que o
   dono do jogo pediu que eu inventasse eram **conteúdo invisível**;
2. adiantei os cinco para os primeiros trinta segundos, resolvi a invisibilidade
   e **esvaziei a virada**.

A saída não é esconder de novo. É um ataque que só faz sentido depois: **A PORTA
GIRATÓRIA**, que pede o único verbo que os outros cinco não pedem.

| padrão | o que ele cobra |
|---|---|
| leque | posição |
| teleguiado | manobra |
| camareiras | tiro |
| maré | achar a fresta |
| espinha | o eixo vertical |
| **giratória** | **o eixo do TEMPO: para onde a coisa vai ESTAR** |

Ela cospe em espiral, uma unidade a cada 85 ms com a lateral girada um passo
fixo. Ficar parado não funciona nem por acidente (a espiral varre o círculo) e
correr para a borda também não (ela chega lá). O que funciona é andar no mesmo
sentido do giro, um pouco à frente — que é o que se faz numa porta giratória. O
sentido **alterna** a cada aparição, para quem decorou "corre pra direita"
apanhar uma vez.

E o parâmetro `depoisDaVirada` de `ataqueDaVez` voltou a existir — ele já tinha
existido ignorado com um `void`, enquanto um comentário jurava que a virada fazia
alguma coisa. Desta vez há o que ler.

| medida | valor |
|---|---|
| luta, três telas | 116 / 107 / 115 s |
| padrões pós-virada | 6 (era 5, todos da primeira metade) |
| FPS mediana / mínima | ~46 / ~38 / ~37 · 17,6 / 22,7 / 22,0 |
