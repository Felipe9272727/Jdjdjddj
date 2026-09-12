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

## Onde a régua está hoje (2026-09-12)

| medida | valor |
|---|---|
| luta completa, toque deitado | 144 s |
| luta completa, toque em pé | 120 s |
| luta completa, teclado | 127 s |
| padrões vistos em 45 s | 5 de 5 |
| tempo até poder jogar | 12,2 s (5,9 s pulando) |
| FPS mediana (deitado / em pé) | 50 / 45 |

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

### 2. O CLÍMAX — ABERTO
Hoje a vida chega a zero e aparece uma caixa de texto. Chefe de jogo publicado
MORRE em cena: explosões em cadeia, câmera que muda, tempo que desacelera, o
céu que reage.
**Como medir:** foto da sequência; duração da morte entre 3 e 6 s.

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
