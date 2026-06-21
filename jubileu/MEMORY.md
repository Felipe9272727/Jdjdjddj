
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
