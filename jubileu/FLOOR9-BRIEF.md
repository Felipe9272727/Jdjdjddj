# ANDAR 9 — O VIVEIRO (a floresta do esquecimento)

## Lore
O hotel não destrói o que apaga — **planta**. Tudo que o PROPRIETÁRIO
esquece desce pelo fio vermelho e é enterrado no 9º andar, e do enterro
cresce floresta. Os bichos daqui são **memórias que aprenderam a
sobreviver**: não sabem de quem foram, só sabem continuar. O APAGAMENTO
passa em ondas — o Proprietário "rega" o viveiro com esquecimento pra nada
crescer demais. Quem está fora de um OCO quando a onda passa, é replantado:
nasce de novo numa toca, sem lembrar da própria fuga.

O jogador chega ARREMESSADO pelo Arquivista: o painel marcava "9", as
portas abrem e não há chão — só copa. O FIO VERMELHO atravessa a floresta
inteira: é a trilha do Arquivista, que rouba fichas enterradas antes que
virem árvore. Objetivo: **seguir o fio até a RAIZ** — a árvore-mãe onde
todas as memórias do hotel se encontram (o gancho pro Andar 10).

## O que é (à la Rain World, em 3D)
Um ecossistema que existia antes do player e continua sem ele:
- **Musgo-brilho** (produtor): mancha no chão, rebrota com o tempo.
- **Saltito** (presa): bolinha saltitante em bandos; come musgo; foge de tudo.
- **Cervo-lanterna** (herbívoro grande): galhada acesa; pasta musgo; manada.
- **Vulto** (predador): magro, baixo, olhos acesos; espreita saltitos e
  cervos; territorial; encara o player mas teme o Guardião.
- **Guardião** (ápice): árvore-que-anda de 6 m; ignora o player por completo
  — você NÃO é o centro deste mundo. Todos abrem caminho.

### Sistemas (mapeamento da pesquisa)
| Rain World | Andar 9 |
|---|---|
| Chuva por ciclo | **ONDA DE APAGAMENTO** (~2 min): aviso → onda → renascer |
| Shelters | **OCOS** (troncos-abrigo com brilho quente) |
| Dens + spawns persistentes | **TOCAS** por espécie; população renasce nelas |
| AI modular + tabela de relações | espécies com drives (fome/medo/território) + tabela presa/predador |
| Personalidade individual + erro | cada agente tem coragem/preguiça/erro próprios |
| Abstract rooms | **LOD de simulação**: perto = full; longe = tick abstrato 2 Hz |
| Karma gate | (v2) nós do fio vermelho |

## Arquitetura
- `f9Eco.ts` — motor PURO do ecossistema (agentes, drives, ciclo, tocas,
  musgo, eventos). Sem three/react. Fonte única de verdade.
- `f9Floresta.ts` — estado do andar (fases: queda → explorar → raiz),
  objetivo, ocos, trilha do fio, interação onda×player.
- `Floor9Forest.tsx` — a cena 3D (terreno, árvores instanciadas, raios de
  deus, musgo emissivo, fio vermelho em tubo, atores dos bichos, onda).
- `Floor9Fauna.tsx` — os corpos dos bichos (anatomia, marcha no relevo,
  bocas das tocas, sombras-blob).
- `Floor9Storm.tsx` — a tempestade (chuva, splashes, poças, relâmpago,
  a parede da onda recuada).
- `f9Ground.ts` — a altura do chão, FONTE ÚNICA (cena, fauna e tempestade
  pisam no mesmo relevo).
- `floor9Sfx.ts` — o som procedural do andar (WebAudio, zero assets;
  `configureFloor9Sfx`/`clearFloor9Sfx` pelo App, padrão floor6Sfx).
- `Floor9Overlay.tsx` — DOM: legendas, aviso da onda, prompt do oco.
- `Floor9Cutscene.tsx` — a QUEDA pela copa (câmera) + beats.
- Bench: `floor9.html` + `floor9-dev.tsx` (`window.__f9dbg`).

## Overhaul Rain World (v3)
O "bosque fofo diurno" morreu: o Viveiro v3 é ÚMIDO, OPRESSIVO e BARULHENTO.
Motor reescrito (`f9Eco.ts`, 25 testes) + cena, fauna e áudio refeitos.

### IA (motor)
- **Predação agarrar-arrastar-escape**: o vulto AGARRA a presa, ARRASTA pra
  toca (55% da velocidade) e só lá mata e come; a presa luta e pode ESCAPAR
  (rolagem por tick de arrasto).
- **Percepção som + LOS**: a visão exige linha de visão (troncos obstruem) e
  há fila de SONS — alarme propaga em cadeia com latência individual, passos
  delatam quem corre, o grito da presa atrai outros vultos. O player é
  detectado por RUÍDO: parado é quase invisível, correndo é ouvido de longe.
- **Memória** (cap 5, ~40 s): presa vista, ameaça, comida. Sem presa à vista
  o vulto INVESTIGA o ponto lembrado e o vagar vira patrulha.
- **Exposição progressiva**: a onda não mata mais de uma vez — apaga aos
  poucos quem fica exposto (correr piora; toca/oco cura).
- **Abrigo universal**: sem toca por perto, qualquer bicho corre pro OCO mais
  próximo.
- **Vínculo**: player calado e perto cria confiança — saltito bondado SEGUE o
  player; vulto bondado não caça o player.
- **Frenesi**: o ritmo fecha antes da onda (fome ×1.8, herbívoros sem
  sentinela, caça ao player mais fácil); fome altera o risco; cadáver fresco
  vira refeição direta (necrofagia).

### Visual & áudio
- **Tempestade real**: ~1200 gotas instanciadas ancoradas na câmera, splashes
  no chão, poças que enchem na onda e secam no renascer, relâmpago a cada
  3–8 s (clarão + céu em 2 pulsos) com trovão atrasado 0.5–2 s. A parede
  branca do apagamento recua pra trás da chuva — a chuva protagoniza.
- **Silêncio pré-chuva**: no AVISO a cama de floresta faz duck até ~0 em ~3 s
  e os chamados de criatura param — a fauna prende a respiração antes da
  chuva (a assinatura emocional do Rain World).
- **Pós-processamento** (quality high): Bloom + HueSaturation + Noise "filme
  úmido" + Vignette; paleta verde-chumbo doente — musgo, cogumelos e galhada
  cantam no escuro.
- **Ghost forest**: anéis de silhuetas gigantes além das paredes (sem fog)
  recortam contra o clarão da onda; vagalumes individuais morrem no aviso.
- **Tocas visíveis**: as dens viram BOCAS no chão (círculo escuro + anel de
  raízes + brilho que chama no aviso); quem entra AFUNDA, quem sai EMERGE —
  ninguém mais some seco.
- **Fauna no relevo**: toda pose nasce do `f9GroundHeight` — bichos, sombras-
  blob e poças pisam no MESMO terreno renderizado.
- **Som procedural** (zero assets): cama de floresta (ruído 400 Hz + chirps +
  vento), chuva por fase, trovões, stingers do motor (bote, agarrou, escapou,
  vínculo, onda, renascer) e o vento da queda com THUD de pouso.

## Contratos (Fable × Codex)
- O motor `f9Eco.ts`/`f9Floresta.ts` e a cena 3D são do **Fable**.
- Sprites/2D e retratos seguem com o **Codex** (nada 2D neste andar por ora).
- Integrações sempre pelo branch `claude/floor-7-bugs-lore-celwdy`.
