
### Sessao 2026-06-20 (cont.) — /goal: subagente CRITICO + eu como modelador 3D do navio

Felipe (/goal): criar um subagente critico implacavel (nivel Unreal), focado no visual do
navio que estava "estranho"; ele quer modelo procedural nivel GLB e que eu seja o modelador 3D.
Loop: renderizo angulos amplos (shot7.cjs: hero/broadside/bow/stern/sternclose/topdown/capclose)
-> subagente "O CRITICO" (general-purpose, le os PNGs) destroi -> eu conserto -> repito.

Cada rodada virou commit (tudo verde: tsc 0, 105/105, build single-file, push em
claude/review-commits-memory-y6iqnf). clang 18 disponivel -> recompilo o WASM do casco.

- **R1 casco**: era caixa extrudada -> casco lofted REAL em C++ (floor7_geo.cpp): linha de
  SHEER (convés sobe na proa/popa), TUMBLEHOME, bojo arredondado, quilha com rocker, proa fina
  com STEM inclinado. Deck + rail caps gerados amostrando as MESMAS curvas C++ (exports
  f7_hull_deckY/railY/beam). Subi a linha d'agua (water plane -1.3 -> -0.72) pra nao parecer muro.
- **R2**: bow/stern DESACOPLADOS -> TRANSOM chato/inclinado na popa (fan cap) + 2 WALES (cintados
  salientes varridos no casco via f7_hull_sx/sy). Topdown deixou de ser canoa simetrica.
- **R3 popa**: TRANSOM ornamentado = 3 janelas de POPA com vidro reflexivo (MeshPhysical) +
  galerias de quarto + frisos dourados + taffrail.
- **R4**: RATLINE SHROUDS (escadas de corda com degraus + deadeyes) nos 2 mastros; costuras de
  calafeto fundas + butt joints na madeira; velas mais cheias.
- **R5**: matar o "banheira" -> faixa boot-top na linha d'agua + espuma; mobilia de convés na
  pista central (sem pocas, |x|<0.5): colares de mastro, escotilha gradeada com braçola, cabrestante.

ARMADILHAS WASM: `__builtin_expf/logf` viram imports `env` (libm) e quebram a instanciacao
({} sem imports) -> usei sqrt (intrinseco f32.sqrt). Zerar arrays no loop vira `memset` import
-> deixei BSS zero (Three recomputa normais). Sempre checar `WebAssembly.Module.imports(m)` == [].
cwd reseta pra raiz toda hora -> rodar tudo com `cd .../jubileu` antes.

CRITICO ja reconheceu: popa "convincente", ratlines "parecem cordame". Pendente (proximo):
proa = beakhead/headrails/jib/bobstay (parte mais fraca agora), gunports com recesso+tampa+canhao
real, bow-wave/foam animada, yards+reef points nas velas, capitao (suavizar facetas/maos).

### Sessao 2026-06-21 — placar do CRITICO e estado do navio

Loop do subagente CRITICO rodou 6 rodadas de critica. Placar do proprio critico:
**R1 = 2/10 (caixa com varas) -> R6 = 7/10 ("believable game pirate ship", cruzou o limiar)**.

Rodadas extras desta sessao (cada uma = commit, tudo verde, push em claude/review-commits-memory-y6iqnf):
- R5: parede interna da amurada (espessura real do bulwark) + mobilia de meia-nau (escaler
  emborcado, capela/companionway, aneis de cravelhos nos mastros) -> 6/10.
- velas ampliadas pra encher o cordame (course deck->verga, barriga mais funda).
- weathering do casco por altura-MUNDO (onBeforeCompile): molhado/escuro abaixo da linha d'agua,
  desbotado no topo; acompanha a linha do mar conforme o navio joga.
- R6: RELEVO das tabuas — costuras/butt joints com perfil chanfrado no bump (aresta clara saliente +
  groove escuro) + bumpScale ↑ -> casco parece "construido de tabuas", nao moldado.
- proa: beakhead (plataforma gradeada) + turcos (catheads) + escovéns (hawse) + figurehead alado
  dourado legivel (era um blob).

Pendentes que o critico ainda apontaria (P1/P2, retorno decrescente): topsails (2a fileira de vela),
foot-ropes/reef points/clew lines nas velas, canhao com cano/anéis melhores, mais sujeira/streaks de
escupier, e o capitao (suavizar facetas/maos). Bancada: shot7.cjs (PORT=3001) + floor7-dev.tsx
(window.__orbit/__target). clang 18 recompila o WASM; checar sempre imports==[] (sqrt ok, expf/logf/memset nao).

### Sessao 2026-06-21 — /goal ADICAO: o CRITICO joga + navio maior + colisao + convés

Felipe: tem bug de colisao, navio pequeno demais (parece barco), sem convés/galpao; alem de
printar, faca o CRITICO JOGAR (primeira pessoa), ele fica mais exigente. (E: "quem bate a cota
e vc", o subagente usa minha cota.)

**Harness jogavel:** floor7-play.tsx + floor7play.html = controlador 1a pessoa que anda no convés
com as colisoes REAIS (wallsForState(7)+resolveCollision). playtest7.cjs dirige (WASD) e detecta
fuga do convés; playshots7.cjs captura 8 angulos FP pro critico. App.tsx ganhou window.__startFloor(n)
/__playerPos() + game.html. (O game completo NAO carrega offline: avatar GLB e baixado do GitHub ->
trava em "Loading 88%"; por isso o harness proprio.)

**Mudancas grandes:**
- FLOOR7_SCALE=1.45: navio inteiro escalado (grupo shipRef), spawn/agua/colisao derivam do fator.
- Colisao segue o CONTORNO do convés (poligono do _F7_DECK_HALF, nao retangulo) + boxColliders
  pra mastros/cabrestante/companionway/deckhouse/props. Pocas (brain) afinadas pro centro.
- Deckhouse/galpao na popa; escaler içado em turcos acima da cabeca (nao bloqueia mais o spawn).
- F7_DECK_PROPS (constants, compartilhado com colisores): barris/caixotes/cordas/sino nas amuradas.
- Cabrestante de verdade (tambor com gomos, pawl, barras, volta de corda).
- Convés = tabuas com costuras de calafeto (buildDeckSeams, abrem em leque pra proa) + king plank.
- Amurada com costelas (frame timbers) + escupiers (buildXxx via samplers deckYAt/railYAt/beamAt).
- Cabine: giltTrim fosco, cantoneiras, beira de telhado escalonada (sem Z-fight), vidro recuado.

**Placar do CRITICO jogando:** 4.5 -> 5.5 (props) -> 6.5 (convés calafetado + spawn pra proa) ->
agora amurada+cabine. Pendente que ele aponta: NPC capitao tosco em 1a pessoa (mas foco e o NAVIO),
velas chapadas vistas de baixo, lashing dos props. Tudo verde sempre (tsc/105 testes/build/push).

### Sessao 2026-06-21 (cont.) — CRITICO jogando levou de 4.5 a 8.0/10 ("believable SoT tier")

Loop critico-joga continuou. Placar do subagente jogando: 4.5 -> 5.5 -> 6.5 -> 7.0 -> 7.4 ->
7.7 -> **8.0/10** ("a deck you can stand on", tier Sea-of-Thieves estilizado). Visual do navio
(beauty) chegou a ~8 tambem (era 2).

Rodadas recentes (cada = commit verde + push):
- Convés calafetado (buildDeckSeams em leque pra proa) + king plank.
- Amurada: frame timbers (costelas) + escupiers + **waterway** (viga no canto convés/borda,
  buildWaterwayGeometry varrida na curva C++).
- Grounding: decais de **sombra de contato** (makeContactShadow, AO falso) sob cada prop, depois
  apertados/feathered pro tamanho do prop; pocas escurecidas (agua reflexiva, nao tinta azul).
- Madeira: variacao tom-a-tom por tabua (mata o "tijolo" de tiling).
- Janelas (deckhouse + popa galeao): caixilho 4-pecas saliente + vidro fundo recuado (auto-sombra)
  + peitoril; friso de madeira na cabine.
- Mastros viram **mastaréus**: taper ~30%, **woolding** (aneis de corda), **cunhas** na enora.
- Standing rig: mainstay + backstays com barriga (catenaria, TubeGeometry sobre bezier).

Pendente que o critico ainda cobraria: capitao NPC tosco aparece grande em 1a pessoa (foco e o
NAVIO, mas atrapalha algumas views), velas poderiam ter topsails/reef. Ferramentas: floor7play.html
(+__setMove/__setYaw/__setPitch/__teleport), playshots7.cjs (8 views FP), shot7.cjs (orbit, escala x1.45).
