# Como medir o Andar 12

> **A régua deste andar é o navegador.** Não existe simulação em memória, e não
> deve voltar a existir.

## Por que não há simulador

`f12Simulacao.ts` rodava a luta inteira em memória e devolvia duração, vidas e
toques. Foi escrito para tirar a dificuldade do campo da opinião, e por três
entregas seguidas disse que o andar estava afinado — "quem desvia vence com 4 de
5 vidas, 118 s". O dono do jogo jogou e perdeu as cinco vidas com o chefe em 75%
da vida.

Medido no navegador, o mesmo andar dava:

| | tempo para matar o chefe |
|---|---|
| o que `f12Simulacao` relatava | 118 s |
| teto físico (parado no meio, invulnerável) | 149 s |
| jogando de verdade, toque | 277 s |

Ele relatava dano por segundo **acima do máximo fisicamente possível no jogo
publicado**: não media o andar, media uma segunda implementação da luta que foi
derivando da primeira (o ritmo da arma chegou a estar escrito à mão lá dentro, e
o irmão atirava por outras regras). Uma régua que discorda do produto é pior do
que régua nenhuma, porque dá confiança.

> **A bancada também já foi.** Ela tinha `240` — o teto da vida do chefe —
> escrito à mão em três lugares. Quando o teto subiu para 300 ela continuou
> imprimindo `dano causado 83.4 de 240` onde houve 149,4, e `LUTA COMPLETA 152s`
> onde a luta é de 106 s: números plausíveis, com duas casas decimais, todos
> errados, e nenhum aviso. Hoje ela lê `vidaMaxima` da página e, se a página não
> expuser, ela diz `[SEM TETO]` e **não calcula** — régua que não sabe medir tem
> de calar a boca, não chutar.

> **Este arquivo também já foi uma mentira.** Um commit disse que ele existia e
> ele não existia: o `git rm` antes dele falhou e cortou a cadeia `&&` antes do
> heredoc. Um avaliador independente achou. Se você citar um arquivo num
> comentário, abra o arquivo. (Aconteceu duas vezes. A segunda foi ao consertar
> a primeira.)

## As bancadas

Todas em `bancada-navegador/`, todas jogando o jogo de verdade num navegador.
Suba o servidor antes:

```bash
cd jubileu && npx vite --port 3011 --host 127.0.0.1
```

### A que importa: `jogar-o-andar-12.mjs`

Entra no andar, atravessa a introdução clicando, pilota com arrasto (ou teclado)
e devolve a linha do tempo, os padrões vistos, o FPS e **o número**: dano por
segundo e tempo projetado da luta.

```bash
IMORTAL=1 MODO=toque W=915 H=412  SEGUNDOS=60 node bancada-navegador/jogar-o-andar-12.mjs
IMORTAL=1 MODO=toque W=412 H=915  SEGUNDOS=60 node bancada-navegador/jogar-o-andar-12.mjs
IMORTAL=1 MODO=tecla W=1280 H=720 SEGUNDOS=60 node bancada-navegador/jogar-o-andar-12.mjs
PULAR=1 IMORTAL=1 MODO=toque SEGUNDOS=25       node bancada-navegador/jogar-o-andar-12.mjs
```

- `IMORTAL=1` mede DANO e não sobrevivência: sem ele a sessão acaba quando o bot
  morre e o número principal vira extrapolação de poucos segundos.
- `PULAR=1` mede o caminho de quem já viu a cena e aperta o botão de pular.
- **Rode as TRÊS telas.** O balanço já divergiu 65% entre retrato e desktop sem
  ninguém notar, porque só se media uma.

### As outras

```bash
# o teto: parado no meio, invulnerável — o melhor caso possível
node bancada-navegador/o-teto-do-dano.mjs

# fotografa o que está atrás da metade da vida
node bancada-navegador/o-que-ninguem-ve.mjs /tmp/saida.png

# folhas de foto, jogando
MODO=luta  W=915 H=412 FOTOS=6 INTERVALO=1500 node bancada-navegador/o-andar-12-na-tela.mjs /tmp/luta.png
MODO=intro W=915 H=412 FOTOS=9 INTERVALO=900  node bancada-navegador/o-andar-12-na-tela.mjs /tmp/intro.png
```

**Olhe as fotos.** Avaliação visual feita lendo código não vale: este andar já
teve o avião desenhado dentro da boca do chefe por duas revisões, com comentários
dizendo que estava resolvido.

## As faixas

| medida | faixa |
|---|---|
| luta completa, jogando de verdade | 90–150 s |
| a mesma luta medida com o teto errado | não existe — ver `[SEM TETO]` |
| diferença entre a tela mais rápida e a mais lenta | < 25% |
| toque vs teclado, na mesma política | < 15% |
| padrões distintos vistos em 60 s | 5 |
| FPS mediana (rasterizador de software) | o mais alto possível; anotar sempre |

## A regra

Nenhum número de dificuldade muda sem a bancada mostrando o **antes e o depois**
na mensagem do commit. "Acho que melhorou" não conta — foi assim que três
entregas seguidas saíram quebradas.

E **não escreva durações em comentários de código.** Já houve três ("uns 95 s",
"115 s", "277 s") e os três estavam errados quando alguém foi conferir. Número de
balanço envelhece a cada afinação; ele mora no relatório da bancada e no commit,
que têm data.
