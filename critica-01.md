# O CRÍTICO — auditoria dos últimos 4 commits (`src/agente/`)

Alvo: `agenteMapa.ts`, `agenteAndar.ts`, `agenteObjetivo.ts`, `agenteInteracao.ts`,
`agenteVontade.ts`, `agenteSalto.ts` + seus 5 arquivos de teste. ~2223 linhas.

Metodologia da seção 1: cada função foi mutada numa **cópia** em
`/tmp/.../scratchpad/mut/` — uma árvore espelhando `src/` inteira por
**symlinks** (nada copiado exceto o arquivo mutado e o teste), rodada com
`npx vitest run` de dentro do scratchpad. Repositório real nunca editado —
ver confirmação de `git status` no fim. Toda mutação "sobreviveu" (0 de 96
testes falhou) ou "morreu" (testes acusaram) contra os 5 arquivos de teste
completos, não um subconjunto.

---

## CRÍTICO — a peça central do "faça tudo" não se conecta a nada, nem ao piso que ela mesma alega resolver

### 1. `agenteSalto.ts` está fisicamente correto e **totalmente desconectado** do sistema de andar. No Andar 3 — o próprio andar para o qual foi escrito — o agente vai "atravessar" andando reto por cima do vazio.

`agenteObjetivo.ts`, `agenteAndar.ts` e `agenteMapa.ts` raciocinam só em X/Z
(`Ponto = {x,z}`, sem `y` em lugar nenhum desses três arquivos).
`agenteSalto.ts` é o único que sabe de altura — e nenhum dos outros quatro
arquivos do pacote importa nada dele:

```
$ grep -rln "agenteSalto" src/agente/*.ts | grep -v __tests__
(vazio)
```

O motivo disso importar: `wallsForState(3, ...)` (`constants.ts:220-230`)
não modela as plataformas do parkour nem os vãos entre elas — só o corredor:

```
const FLOOR3_BND: number[][] = [
    [-14, -10, -1.3, -10],   // ao lado da porta do elevador
    [1.3,  -10,  14, -10],
    [-14,  -10, -14, F3_CORRIDOR_FAR_Z],   // parede esquerda (infinita)
    [ 14,  -10,  14, F3_CORRIDOR_FAR_Z],   // parede direita (infinita)
];
```

É um corredor aberto de 28 m de largura por 100.000 m de comprimento. Cair no
vazio é decidido por `y < -8` dentro do `Player.tsx` — invisível para
`resolveCollision`, que só enxerga X/Z. Logo `celulaLivre`
(`agenteMapa.ts:60-63`) marca **o corredor inteiro** como chão livre — não
existe, no nível de paredes, nenhuma diferença entre "em cima de uma
plataforma" e "sobre o vazio entre duas".

Consequência: se alguém plugar `agenteObjetivo`/`agenteVontade` no Andar 3
hoje, o agente monta um plano reto pelo meio do corredor e "chega" — porque
para a grade XZ aquilo é uma sala vazia, não um parkour. O jump-graph que
`agenteSalto.ts` implementa com tanto cuidado (`daParaPular`, `rotaDePulos`,
`ondeElePisa`) nunca é consultado por ninguém que decide "para onde andar".

O teste `agenteMapa.test.ts:45-57` inclui `nivel: 3` no loop e passa — mas
ele só prova que a inundação XZ acha o corredor "alcançável", o que é
verdade e irrelevante. Nenhum teste do pacote usa `y`, `topY` ou qualquer
verificação de altura fora de `agenteSalto.test.ts`, que por sua vez nunca
importa `agenteObjetivo`/`agenteVontade`. As duas metades foram testadas
separadamente e nunca testadas *juntas* — e juntas é o único jeito de
"o agente joga Andar 3" significar algo.

Isto não é um risco de "andar futuro". É o andar #3, já existente, dentro
do escopo que o dono pediu, e a peça que deveria resolvê-lo já foi escrita
e já não é chamada por nada.

---

## ALTO — testes que não testam (confirmado por mutação real)

Cada item abaixo: mutei a função na cópia, rodei os 96 testes dos 5 arquivos
inteiros contra a mutação. **Todos os 96 passaram** em cada um destes casos
— ou seja, a mutação sobreviveu.

### 2. O detector de trava (`agenteAndar.ts:90-124`) nunca é exercitado
```ts
if (paradoHa > 90) {
    return { ..., motivo: 'travou' };
}
```
Mutação: troquei `90` por `9000000000` (desativa o detector na prática).
**96/96 passaram.** Nenhum teste, em nenhum dos 5 arquivos, constrói um
cenário em que o agente fica preso de verdade e verifica `motivo ===
'travou'` — a string `'travou'` só aparece em um comentário
(`agenteObjetivo.test.ts:98`), nunca em um `expect`. O próprio cabeçalho do
arquivo chama isso de "a causa com nome próprio" que evita procurar o bug
no lugar errado — e é exatamente a parte não coberta.

### 3. As duas guardas "física não deixa cortar quina" não são verificadas — nem em `alcancaveis`, nem no A*
`agenteMapa.ts:210-212` (dentro de `alcancaveis`, a inundação que alimenta
TODO o resto do pacote — `alcanca`, `oQueDaParaAlcancar`, `chegarPerto`,
`opcoesDaqui`):
```ts
if (di !== 0 && dj !== 0 && (!livreEm(g, ai + di, aj) || !livreEm(g, ai, aj + dj))) {
    continue;
}
```
Removida inteiramente → **96/96 passaram.**

`agenteMapa.ts:298-303` (a mesma guarda, duplicada dentro do A* de
`caminho`) — removida inteiramente, independentemente da anterior →
**96/96 passaram de novo.**

O comentário do arquivo (linha 298-300) afirma "a física do jogo não deixa
[cortar a quina] acontecer" como justificativa de design. É uma garantia de
realismo que nunca foi testada — nenhuma das grades sintéticas nos testes
tem uma parede com exatamente um vizinho diagonal aberto e os dois
ortogonais fechados, que é o único jeito de essa guarda importar.

### 4. `oQueFazerAqui`'s `pisavel(...)` não é só não-testado — é logicamente morto
`agenteObjetivo.ts:201`:
```ts
if (pisavel(andar, DENTRO_DO_CAB) && alcanca(andar, de, DENTRO_DO_CAB)) {
```
`alcanca()` (linhas 233-237) já é `livreEm(...) && marca[...] === 1` — se
`livreEm` for falso, `alcanca` já retorna falso sem olhar `marca`. Ou seja
`pisavel(p) && alcanca(p)` é logicamente idêntico a `alcanca(p)` sozinho, em
qualquer entrada. Removi o `pisavel(...) &&` → **96/96 passaram**, como a
álgebra já garantia. Não é falta de teste: é complexidade que não faz nada.

### 5. O remapeamento de `motivo` em `pegarOElevador` — o EXATO cenário do Andar 9 que o comentário descreve em detalhe — nunca é exercitado
`agenteObjetivo.ts:167-168`:
```ts
chegou: embarcou,
motivo: r.chegou && !embarcou ? 'sem-caminho' : r.motivo,
```
O comentário acima (linhas 143-153) narra com precisão o bug que isto
resolve: no Andar 9 o centro do cab está dentro de um bloco maciço, o A*
aproxima para a célula mais próxima e o `irAte` cru diria `chegou: true`
por engano. Removi o remapeamento (`motivo: r.motivo` puro) → **96/96
passaram.** O loop de teste para os andares 5–10 (`agenteObjetivo.test.ts:
74-80`) só verifica `.viaja === false` — que já é `false` trivialmente
porque `oCabResponde` é `false` para todos esses níveis, sem nunca alcançar
o ramo `embarcou`/`chegou` que diverge. O bug que o código foi escrito para
matar não tem um único teste apontado para ele.

### 6. `opcoesDaqui` oferece "entrar no elevador" mesmo sem caminho até lá
`agenteVontade.ts:70-71`:
```ts
if (andar.oCabResponde && !dentroDoCab(andar.nivel, de)
    && alcanca(andar, de, DENTRO_DO_CAB)) {
```
Removi `&& alcanca(andar, de, DENTRO_DO_CAB)` → **96/96 passaram.** O
próprio cabeçalho do arquivo (linha 58) promete: "o elevador só aparece se
levar a algum lugar E houver caminho." A metade "E houver caminho" nunca é
testada — todo cenário de teste com `oCabResponde=true` também tem caminho
livre até o cab.

### 7. `jogarUmTurno`'s checagem dupla para "embarcou de verdade" é redundante na prática testada
`agenteVontade.ts:229-231`:
```ts
const cumpriu = opcao.tipo === 'elevador'
    ? r.chegou && dentroDoCab(andar.nivel, r.fim)
    : r.chegou;
```
Colapsado para `const cumpriu = r.chegou;` → **96/96 passaram.** Mesma
família do item 5: a checagem extra existe para o caso em que "chegou"
segundo o A* e "dentro do cab" segundo a régua do jogo divergem — caso que
o teste nunca constrói.

### 8. `oQueDaParaAlcancar` é código morto reimplementando (pior) o que `chegarPerto` já faz
`agenteInteracao.ts:170`:
```ts
if (perto > alvo.alcance) continue;
```
Removida a linha inteira (nenhum filtro de alcance) → **96/96 passaram.**
E mais grave: `grep -rn "oQueDaParaAlcancar" src/` mostra que a função só é
chamada pelo próprio arquivo de teste — `agenteVontade.ts` (o único
chamador real dentro do pacote) reimplementa a mesma ideia por conta
própria, inline, dentro de `opcoesDaqui`, usando `chegarPerto` em vez desta
função. `oQueDaParaAlcancar` é uma segunda implementação divergente do
mesmo conceito, sem chamador, com sua garantia central (não sugerir algo
fora de alcance) sem cobertura nenhuma.

---

## MÉDIO — afirmações que não batem com o código medido

### 9. FALSO: "aparece duas vezes no App.tsx"
`agenteObjetivo.ts:52-53`:
```
* mesmo ponto para onde o `App.tsx` TELEPORTA o jogador quando a viagem
* começa (`playerPositionCmdRef.current = { x: 0, y: 0, z: -13 }`, duas
* vezes).
```
```
$ grep -c "playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };" src/App.tsx
7
$ grep -n "z: -13" src/App.tsx | wc -l
13
```
Não são duas vezes — são 7 ocorrências exatas dessa string, e 13 no total
contando as variantes com `theta`. A derivação (centro de `ELEV_W` = (0,-13))
está correta; a contagem que a sustenta como "coincidência que não pode ser
acidente" está errada por um fator de 3,5×–6,5×. Não invalida a conclusão,
mas é exatamente o tipo de "escrevi de cabeça" que o dono pediu para caçar.

### 10. Os números medidos do gerador do parkour não reproduzem
`agenteSalto.ts:21-29` e `agenteSalto.test.ts:70-87` afirmam, como fato
medido: "12 degraus em 6090 (0,2%)... em 12 cursos de 406 (3%)... o pior
deles fica 6,4 cm curto." Reproduzi a mesma amostra (seeds 1..406, que dá
exatamente 406 cursos / 6090 degraus — bate com o texto) chamando
`daParaPular` diretamente via `vite-node`:
```
[seeds 1..406] cursos=406 comImpossivel=7 degraus=6090 impossiveis=7
               (0.115%) pior: seed=302 idx=12 folga=-0.085
```
7 degraus impossíveis, não 12 (0,115% vs 0,197% — quase metade); pior caso
8,5 cm curto, não 6,4 cm — **pior** do que o documentado, não melhor.
Rodando amostras maiores (2000 e 5000 seeds) o pior caso medido chega a
9,4 cm. A ordem de grandeza ("bem abaixo de 1%") está certa e o teste de
regressão (`< 0.01`) não quebra — mas os números específicos citados como
medição não se sustentam eles próprios.

### 11. `limitesDaVista` pode devolver uma caixa INVERTIDA (minX > maxX) — e ninguém percebe
`agenteMapa.ts:113-136`. A função assume que a caixa das paredes e a janela
de `RAIO_DA_VISTA` sempre se sobrepõem. Quando não se sobrepõem (agente
longe de toda geometria em pelo menos um eixo), cada bound é clampado
independentemente e o resultado pode inverter:
```
paredes em x≈500-501, agente em (0,0):
limites: { minX: 498.8, maxX: 30, minZ: -2.2, maxZ: 2.2 }
minX > maxX? true
grade largura/altura: 1 9        ← grade de 1 coluna, ancorada 500 m longe do agente
caminho de (0,0) a (5,5): []
maisLonge a partir de (0,0): { p: {x:0,z:0}, d: 0 }
alcançáveis: 0 de 9
```
`construirGrade` não crasha — `Math.max(1, Math.ceil(...))` esconde o
sinal negativo e produz uma grade de 1 célula, ancorada longe do agente
real. Resultado: `alcancaveis`/`caminho`/`maisLonge` respondem "nada
alcançável" com confiança total, sem erro nenhum — exatamente o modo de
falha ("congela, sem log") que o pacote inteiro foi desenhado para evitar.
Não acontece em nenhum andar atual (todos têm parede perto o bastante), mas
é uma mina para qualquer andar futuro com geometria esparsa (área aberta
grande, ponto de partida a mais de 30 m de qualquer parede num eixo).

---

## BAIXO

### 12. Piso de tolerância `Math.max(0.05, ...)` em `chegarPerto` não é verificado
`agenteInteracao.ts:139`. Removido → 96/96 passaram. Puramente defensivo
(evita folga zero por erro de ponto flutuante), risco baixo, mas registrado
porque foi mutado e sobreviveu.

### 13. A guarda "nenhum `nivel ===`" só cobre 3 dos 6 arquivos
`agenteMapa.test.ts:97-107` e `agenteObjetivo.test.ts:155-169` fazem
scan por regex em `agenteMapa.ts`, `agenteAndar.ts`, `agenteObjetivo.ts`.
`agenteInteracao.ts`, `agenteVontade.ts` e `agenteSalto.ts` não têm essa
rede de segurança. Hoje estão limpos (`grep` confirma zero ocorrências de
`nivel ===`/`level ===`/`andar ===` nos três), mas nada impede uma
regressão silenciosa ali.

### 14. `olharOAndar` nunca representa portas fechadas
`agenteObjetivo.ts:117`: `wallsForState(nivel, false, houseDoorOpen)` — o
segundo argumento (`doorsClosed`) está cravado em `false` sempre. O jogo
real tem um `doorsClosed` vivo (`App.tsx`, ligado a mecânicas dos Andares
3/6/8 — `DOOR_SEAL`). Um chamador real que precise que o agente reaja a uma
porta trancada (não a casa do Andar 1, que já tem `houseDoorOpen`
dedicado) não tem como pedir isso — o módulo simplesmente não expõe o
parâmetro.

### 15. `PISO_DA_VONTADE = 0.2` foi calibrado contra o ranqueador ERRADO
`agenteVontade.ts:145`. O valor é testado e ajustado só contra
`ranqueadorDePalavras` (sobreposição léxica, escala 0–1 por construção). O
próprio cabeçalho diz que o ranqueador real será o EmbeddingGemma
(similaridade de cosseno de embeddings) — e cosseno entre frases curtas
não-relacionadas raramente fica perto de zero (é comum ficar 0,3–0,6 só por
similaridade estrutural da língua). Nada no pacote testa se `0.2` é sequer
a faixa certa para essa métrica — é um número calibrado num substituto e
nunca revisitado, e por design (sem rede) não pode ser.

### 16. Nota de performance, não bug
`opcoesDaqui` chama `chegarPerto` uma vez por item do catálogo, e tanto
`chegarPerto` quanto `oQueDaParaAlcancar` varrem toda a grade (até ~14.400
células no teto de `RAIO_DA_VISTA`) por chamada. Aceitável para uma decisão
por turno; ficaria ruim se algum dia virasse uma chamada por frame.

---

## O QUE ESTÁ BOM — não gaste tempo aqui

- **`ondeElePisa`** (`agenteSalto.ts`): mutação no sinal da comparação de
  `folga` foi pega na hora por 2 testes independentes.
- **Escolha da raiz maior em `tempoDeVoo`**: uma raiz errada muda
  `alcanceDoPulo(0)` para 0, e isso é checado contra uma constante
  independente (`TEMPO_NO_AR`), não uma auto-referência — pegaria a
  mutação.
- **`vaoEntre`**: o clamp de plataformas encostadas (`vão zero, não
  negativo`) tem teste dedicado que bate exatamente no caso em que o clamp
  importa.
- **Seguir waypoints em `irAte`**: mutei para "vai direto pro ponto final,
  ignora o plano" — pego na hora por 5 testes (S-corridor, Andares 7/8/9).
- **`dentroDoCab`**: o teste da popa do Andar 7 é exatamente o caso que
  quebraria sem `hasWalkInElevator` — regressão coberta de verdade.
- **As 5 afirmações sobre onde o jogo decide interação**
  (`agenteInteracao.ts:11-16`) — conferidas byte a byte contra
  `Player.tsx`/`App.tsx`/`f10Prison.ts`: todas batem.
- **`Player.tsx testa hasWalkInElevator(level) && z <= ELEVATOR_ZONE_Z &&
  |x| <= ELEVATOR_ZONE_X`** — confirmado exatamente em `Player.tsx:455-457`.
- **`ELEV_W` em toda parede de andar, menos 7 e 9** — confirmado por grep
  completo de `constants.ts`.
- **`F3_GRAVITY=22, F3_JUMP=9.5, SPEED=4.0`, sem sprint em terra no Andar
  3** — todos os quatro batem; o multiplicador de sprint só existe no ramo
  de nado (Floor 2), o movimento em terra (`Player.tsx:707`) usa `SPEED`
  puro em todo andar, incluindo o 3.

---

## Confirmação: repositório intacto

```
$ git status --short -- src/agente src/__tests__/agenteMapa.test.ts \
    src/__tests__/agenteObjetivo.test.ts src/__tests__/agenteInteracao.test.ts \
    src/__tests__/agenteVontade.test.ts src/__tests__/agenteSalto.test.ts
(vazio)
```
Nenhum arquivo-alvo foi tocado. Todas as mutações viveram em
`/tmp/.../scratchpad/mut/`, uma árvore de symlinks para o `src/` real com
apenas o arquivo sob mutação como cópia de verdade; cada mutação foi
desfeita (symlink restaurado) antes da próxima.

Nota à parte: um `git status --short` no repo mostrou, sem relação com este
trabalho, `src/npc/floor10Will.ts` modificado e alguns
`src/__tests__/zzz-probe-*.test.ts` não rastreados, com timestamps dentro
da janela desta sessão — não foram tocados por esta auditoria (nenhum
comando aqui referenciou esses caminhos); parecem ser de outra atividade
concorrente no mesmo ambiente.
