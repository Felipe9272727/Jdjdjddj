# FLOOR4_LORE.md — Lore, Descoberta e Puzzles do Andar 4

> Design doc do conteúdo narrativo do Andar 4 (o Saguão Destruído).
> Status: ✅ **IMPLEMENTADO** (2026-06-09, aprovado pelo Felipe) — todas as 5 fases.
> Código: `f4Lore.ts` (estado/regras, testado), `Floor4Interact.tsx` (UI DOM),
> sprites/payoffs em `Floor4Scene2D.tsx`, cues em `floor4Sfx.ts`.
> Companheiro técnico: `FLOOR4.md` (como construir/testar o andar).
>
> Desvios do plano original (motivos práticos):
> • O disjuntor ficou em x=-4.4 (lado DIREITO do elevador) — tudo à esquerda do
>   elevador é zona de saída do andar (andar pra lá dispara o exit).
> • O lado direito do saguão começa em PENUMBRA (Gloom) até o P1 ser resolvido —
>   motiva o puzzle e faz o "acender" ser um payoff visível.
> • O mural revelado ficou em x≈14.7 (parede livre à direita da porta).
> • A luminária pisca o padrão real (curto·curto·curto·longo, ciclo 3.1s) e fica
>   ESTÁVEL depois do P1.

---

## 1. A LORE (o canon proposto)

### A regra do prédio (já estabelecida no jogo — só conectando os pontos)
- O Supervisor do Saguão já diz: **"Memórias são tijolos"** e que andares
  **"aparecem quando são lembrados"**.
- O Dussekar já vaza: **"Someone stole the floor yesterday"**, **"The geometry is
  leaking"**, **"The elevator knows what you did"**.
- O menu chama o lobby de **"Andar 03 • Saguão"**.

**Canon:** o prédio mantém os andares vivos com a MEMÓRIA de quem os visita.
Andar lembrado = renderizado, sólido, 3D. Andar esquecido = decai: perde
resolução, perde cor, perde dimensão. **O Andar 4 é um andar des-lembrado — por
isso ele é 2D.** A pixelação na viagem não é efeito: é o elevador entrando numa
região do prédio onde não sobrou memória suficiente pra sustentar 3D.

### O que aconteceu no Andar 4
O Andar 4 era **o Saguão original** — o primeiro saguão do prédio. Houve um
"incidente" (nunca dito na lata; o gore conta). A gerência decidiu não consertar:
decidiu **esquecer**. Pintaram "O ANDAR 4 NÃO EXISTE" por cima, tiraram o botão
do painel, treinaram o Supervisor novo pra sorrir.

Mas apagar um andar não o demole — o prédio **recicla**. Tijolo por tijolo, o
chão e as paredes do 4 foram levados de madrugada pra construir o saguão novo
lá embaixo ("ROUBARAM O CHÃO" é literal; *"as partes que sobram também são bem
tratadas"* é o lema da reciclagem). **O saguão do Andar 03 que o player conhece
é feito dos pedaços do Andar 4.** Por isso são idênticos — um intacto, um em ruína.

O sangue: os hóspedes que estavam no andar quando ele foi condenado **não foram
despejados — foram des-lembrados junto**. As partes que sobraram deles também
foram "bem tratadas" (a mancha de arrasto vai na direção do buraco no chão…).

### O Esquecido (a voz do andar)
Quem escreveu os grafites e o diário: **o primeiro Supervisor do Saguão** — o
único que se recusou a sair, e que por estar dentro quando o andar foi apagado,
não pode mais ser lembrado por ninguém (logo, não pode descer: o prédio não o
renderizaria lá embaixo). Os 4 riscos + 1 interrompido na parede são as
tentativas dele de sair pela porta de fundo. Nunca aparece em pessoa neste
andar — só voz, batidas e papel. (Aparição fica como gancho pro futuro.)

### Por que o elevador está intacto
**O elevador é a única coisa que todos os andares lembram.** Ele não decai
nunca, em andar nenhum. Isso é dito por um exame no próprio elevador ("Nem um
arranhão. Aqui, só ele é lembrado.") — e planta a semente da lore macro do jogo:
o elevador é mais antigo (e mais consciente) que o prédio. *"The elevator knows
what you did."*

### Ganchos deixados em aberto (de propósito)
- **A porta de fundo (FUNDOS)** leva ao "depósito de partes" — onde o prédio
  guarda o que recicla. Os 3 puzzles soltam as 3 tábuas, mas a porta **não abre
  ainda** (cliffhanger; conteúdo é decisão futura do Felipe).
- **As batidas de baixo** (puzzle do sino): tem *alguém* arrumando as coisas do
  4 nas paredes novas. Quem trabalha na reciclagem? (futuro NPC/andar).
- **"ELE AINDA SOBE"** é ambíguo de propósito: o elevador? ou o que mora mais
  abaixo?

---

## 2. COMO O PLAYER DESCOBRE A LORE (mecânicas)

Quatro camadas, da mais passiva à mais ativa:

1. **Ambiente (já existe)** — grafites, sangue, tally, andares de baixo.
   Custo zero, já entrega o tom.
2. **Exames (1 linha, typewriter)** — pontos de interação: chegar perto →
   aparece o prompt (tecla **E** no desktop / botão **"OLHAR"** no touch, mesmo
   padrão visual dos botões ◄ ►) → overlay curto estilo typewriter (o jogo já
   tem essa linguagem em `UI.tsx`). ~8 pontos (lista §4).
3. **As 5 páginas do diário do Esquecido** — colecionáveis. Página 1 é achada
   livre (ensina a mecânica); 2–4 são recompensas dos puzzles; a 5 só aparece
   no fim (dentro do elevador). HUD discreto: `PÁGINAS 3/5` no canto.
4. **Puzzles (3)** — cada um solta uma tábua da porta de fundo e entrega uma
   página. Resolver os três = clímax (a porta range, entreabre… "ainda não.").

**Princípio:** nenhum texto é empurrado. Quem só atravessa o andar vê ruína
bonita; quem fuça é recompensado com a história inteira.

---

## 3. OS PUZZLES

### P1 — O Disjuntor (a luz que pisca em código)
- **Setup:** a luminária agonizante (já animada) não pisca aleatório: pisca um
  PADRÃO em loop — ex.: `3 curtos, 1 longo` (= "4" em código de quem não pode
  falar). Uma **caixa de disjuntores** nova na parede (perto do elevador) tem 4
  alavancas: o player precisa setá-las espelhando o padrão (curto=baixo,
  longo=cima → `baixo baixo baixo cima`).
- **Pista:** exame da luminária: *"Ela não está quebrada. Está insistindo."*
- **Recompensa:** o lado direito do saguão ACENDE (revela um mural de grafite
  que estava no escuro: a planta baixa do prédio com o 4 riscado), tábua 1 cai,
  **página 2** atrás da tampa do disjuntor.
- **Implementação:** estado de 4 alavancas + comparação; o flicker da
  `DyingLight` vira pattern-driven; luz nova = glow plane; sfx clack/zap.

### P2 — O Sino da Recepção (alguém responde)
- **Setup:** um **sino de balcão** sobre a mesa RECEPÇÃO tombada. Os tally na
  parede ao lado (4 riscos + 1 interrompido) são a pista: tocar **5 vezes** —
  completar o risco que o Esquecido nunca conseguiu.
- **Payoff (o sustinho de lore):** 2s de silêncio… aí **batidas vêm de BAIXO do
  chão** (sfx grave + screen shake + a poeira do teto cai), e no buraco do chão
  um brilho acende: **página 3** agora alcançável no buraco. Tábua 2 estala fora.
- **Pista escrita:** exame do tally: *"Quatro riscos. O quinto foi interrompido."*
- **Implementação:** contador com timeout (5 toques em <4s), sfx sino + batidas
  (floor4Sfx), shake do camera rig 2D, sprite da página no buraco.

### P3 — O Cofre atrás do Quadro (senha 404)
- **Setup:** o quadro torto (já na parede) é interativo: cai e revela um
  **cofre de 3 dígitos**. Teclado numérico simples (overlay DOM pixel-style).
- **Senha: `404`** — "andar não encontrado". Pistas espalhadas (3, redundantes):
  o display do elevador mostra **4**; o grafite **"O ANDAR 4 NÃO EXISTE"**; o
  exame da placa SAGUÃO: *"Embaixo da tinta tem outro nome: SAGUÃO **0**4."*
  (quem pensa "andar que não existe = not found = 404" resolve na hora — meta
  e justo).
- **Recompensa:** dentro do cofre, a **FOTO do Saguão original intacto** (pixel
  art do andar 4 SEM ruína — basicamente a cena atual restaurada e colorida,
  um "antes/depois" que conta tudo sem palavras), **página 4**, tábua 3.
- **Implementação:** keypad DOM (3 dígitos), textura "foto" (reuso da paleta da
  cena com cores vivas), estado.

### Convergência — A Porta de Fundo
- Cada puzzle arranca UMA tábua (sprite some com estalo). Com as 3 fora, a
  porta **range e entreabre mais 2px de escuridão**; interagir:
  typewriter: **"ainda não."** — e a **página 5 materializa DENTRO do elevador**
  (no chão da cabine, visível pela porta aberta).
- Ler a página 5 = lore completa → flash curto + título: **"VOCÊ LEMBROU DO
  ANDAR 4"** (callback direto ao "andares aparecem quando são lembrados").
  Recompensa simbólica; a porta fica pro futuro (decisão do Felipe).

---

## 4. OS TEXTOS (prontos, PT-BR)

### Diário do Esquecido (5 páginas, typewriter, ~3 linhas cada)
1. *(no chão, perto do elevador — ensina a mecânica)*
   "Dia 1. O elevador parou de atender o quarto andar. O supervisor novo sorriu
   e disse pra eu não me preocupar. Todos os supervisores sorriem igual."
2. *(disjuntor — P1)*
   "Dia 9. Levaram o chão do corredor leste de madrugada. Tijolo por tijolo.
   Perguntei pra onde. 'As partes que sobram também são bem tratadas.'
   Parem de sorrir."
3. *(buraco do chão — P2)*
   "Dia 23. Tem gente no andar de baixo. Ouço eles arrumando as NOSSAS coisas
   nas paredes novas. Bati no chão a noite toda. Hoje bateram de volta."
4. *(cofre — P3)*
   "Dia 40. Achei a foto. Esse era o MEU saguão. Eles não construíram um novo —
   eles esqueceram o velho. A gente não foi despejado. A gente foi des-lembrado."
5. *(cabine do elevador — final)*
   "Dia ???. Os riscos na parede não batem com as minhas memórias. Se você está
   lendo: LEMBRE deste andar. É só disso que ele precisa. O elevador ainda sobe.
   Ele lembra."

### Exames ambientais (1 linha cada)
| Ponto | Texto |
|---|---|
| Planta morta | "Alguém regou ela até o fim." |
| Mancha de arrasto | "Foi na direção do buraco. E não foi sozinho." |
| Placa SAGUÃO torta | "Embaixo da tinta tem outro nome: SAGUÃO 04." |
| Tally marks | "Quatro riscos. O quinto foi interrompido." |
| Elevador | "Nem um arranhão. Aqui, só ele é lembrado." |
| Porta FUNDOS | "As tábuas são novas. Alguém ainda vem aqui pregar." |
| Luminária | "Ela não está quebrada. Está insistindo." |
| Buraco do chão | "Lá embaixo tem luz. E a luz se mexe." |
| Mesa RECEPÇÃO | "O livro de hóspedes está aberto. Todos os nomes estão borrados." |

---

## 5. ROADMAP DE IMPLEMENTAÇÃO (fases pequenas e shippáveis)

| Fase | Entrega | Arquivos novos/tocados |
|---|---|---|
| **1. Núcleo de interação** | pontos de exame + prompt E/OLHAR + overlay typewriter + HUD páginas + página 1 | `f4Lore.ts` (estado compartilhado, padrão f3Hazards), `Floor4Interact.tsx` (prompt+overlay DOM no Floor4Canvas2D), pontos na cena |
| **2. P1 Disjuntor** | luminária com padrão, caixa de alavancas, luz nova, tábua 1, página 2 | `Floor4Scene2D.tsx` (sprites), `f4Lore.ts`, `floor4Sfx.ts` (clack/zap) |
| **3. P2 Sino** | sino, 5 toques, batidas+shake, página 3 no buraco, tábua 2 | idem + sfx sino/batidas |
| **4. P3 Cofre** | quadro→cofre, keypad 404, foto do saguão original, página 4, tábua 3 | `Floor4Safe.tsx` (keypad DOM), textura foto |
| **5. Convergência** | porta range + "ainda não.", página 5 na cabine, "VOCÊ LEMBROU DO ANDAR 4" | wiring final |

- Cada fase: tsc + vitest + e2e Playwright real (FLOOR4.md §4) + rebuild + commit.
- Persistência: por sessão (módulo `f4Lore.ts`); save em localStorage fica pra depois se o Felipe quiser.
- Multiplayer: lore é single-player local (sem sync Firestore).

## 6. Decisões assumidas (mudar é barato — falar antes da implementação)
1. Senha do cofre = **404**. 2. A porta de fundo **não abre** nesta entrega.
3. O Esquecido nunca aparece em pessoa. 4. Gore segue "meio gore" (sugestão, sem corpos).
5. Textos em PT-BR (o resto do jogo mistura EN/PT — lore deste andar toda em PT).

---

## ★ V2 — O ARCO PROFUNDO (2026-06-09, pedido do Felipe: "aprofunde a lore")

> Status: ✅ IMPLEMENTADO. Substitui o fluxo de 3 puzzles soltos por UMA CADEIA
> com áreas separadas, cinemática, NPC com diálogo e payoffs encenados.

### A cadeia (cada elo entrega o próximo — nada de "só o criador sabe")
1. **Chegada no ESCURO** — o saguão inteiro está apagado (LobbyDark).
2. **O ZELADOR (cinemática)** — nos primeiros passos fora do elevador, um vulto
   sorridente atravessa o saguão, BATE e CADEIA a porta da SAÍDA (cadeado), e
   mergulha no buraco do chão. A câmera segue ele (f4Cam.override).
3. **SUBSOLO (sala nova)** — desce pelo buraco (DESCER). Sala do GERADOR:
   escura, lâmpada de emergência piscando o MESMO ritmo da luz do saguão
   (curto·curto·curto·longo). Alavancas: baixo·baixo·baixo·CIMA → energia.
   As alavancas aparecem AO VIVO no sprite do gerador.
4. **O SINO** — com luz, o saguão acorda: sino em destaque num caixote com
   4 riscos + o 5º interrompido (spotlight + contador ao vivo 🔔 |||).
5. **O HÓSPEDE DO 404** — no 5º toque, um ESQUELETO LEVANTA dos escombros
   (animação com chacoalhar + ossos), segurando o COMPROVANTE DE RESERVA:
   "QUARTO 404 — NÃO ENCONTRADO".
6. **O COFRE** — atrás do quadro torto, senha 404 → CHAVE-MESTRA + a foto do
   saguão original + página 4.
7. **O BREU (sala nova)** — destranca a porta, atravessa: escuridão total,
   uma fogueira, e O PRIMEIRO RECEPCIONISTA — ferido, sem um olho (bandagem).
   Levanta a cabeça quando o player se aproxima.
8. **DIÁLOGO COM PERGUNTAS** — retrato pixel-art detalhado (96×96, iluminado
   pela fogueira) + 5 perguntas: quem é você / o que houve com o andar /
   quem trancou a porta / o esqueleto / como eu saio. A última entrega a
   página 5 → "VOCÊ LEMBROU DO ANDAR 4".

### O canon expandido
- **O Primeiro Recepcionista** é o autor do diário (páginas 1–5). Ficou pra
  "lembrar o andar por dentro"; o olho foi o preço.
- **O Zelador** faz a manutenção do esquecimento: prega tábuas, tranca saídas,
  apaga riscos. Sorri igual aos supervisores.
- **O Hóspede do 404** chegou no dia em que apagaram o quarto dele. Tocou o
  sino, riscou o balcão, esperou. O player completa a chamada — e o atende.
- Cada página do diário ENSINA seu puzzle dentro da lore (pág 2 = ritmo do
  gerador; pág 3 = os 5 riscos do sino; pág 4 = cofre/chave-mestra).

### Técnica
- 3 SALAS: `f4.room` ('lobby' | 'basement' | 'beyond'), bounds por sala
  (f4Bounds), transições com fade (Floor4Interact.transition) e spawn por
  token (f4.spawnToken consumido pelo player).
- Cinemática: f4TriggerRunner (poll de posição) → Runner (cena) anima e
  trava o player via uiLockRef; f4RunnerDone libera.
- 20 testes vitest cobrindo o arco inteiro (inclusive a linha de OBJETIVO).
- Bot Playwright (dev: window.__f4dbg) joga o arco completo de ponta a ponta.
