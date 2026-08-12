# Achados — Camada React / Ciclo de Vida (Andar 10, Nilo)

Setor: onde o cérebro do NPC (LLM no navegador) encontra o motor de render —
`src/Floor10Npc.tsx`, `src/Floor10Mente.tsx`, `src/Floor10NpcChat.tsx`,
`src/Floor10Campo.tsx`, `src/npc/npcStore.ts`, `src/npc/floor10CaixaPreta.ts`.

Verificado antes de reportar: `npx tsc --noEmit` limpo; `npx eslint` nos seis
arquivos sem novos erros (só avisos pré-existentes de `no-unused-vars`, e um
erro de configuração do ESLint alheio — regra `react/no-array-index-key`
inexistente — que não é meu); os quatro testes pedidos
(`floor10CaixaPreta`, `floor10Retomada`, `floor10Pausa`, `floor10ModelPause`)
passam (37/37). Duas sondas temporárias rodaram contra o `npcStore.ts` REAL
(não uma reimplementação) para confirmar os achados 1 e 2 abaixo bit a bit —
apagadas depois, `git status --short` no fim mostra zero arquivos meus
tocados (as duas modificações que aparecem em `floor10Roteamento.*` já
estavam no worktree antes de eu ler qualquer coisa, não fui eu quem mexeu).

---

## 1. `npc.near` fica preso em `true` depois que o jogador sai e volta ao Andar 10 — abre o prompt/chat com Nilo longe (GRAVE)

**Onde:** `src/Floor10Npc.tsx:62` (`const nearRef = useRef(false);`) e
`src/Floor10Npc.tsx:468-482`:

```ts
if (pp && g) {
    tmp.copy(pp).sub(g.position); tmp.y = 0;
    const dist = tmp.length();
    const near = dist < NEAR_DIST;
    if (near !== nearRef.current) {
        nearRef.current = near;
        npcSet({ near });
        if (near) void initLLM().catch(() => undefined);
    }
}
```

**O erro:** `npc.near` (o campo do *singleton* `npcStore`, que sobrevive a
qualquer montagem/desmontagem de componente) só é publicado quando muda em
relação a `nearRef.current` — uma ref **local** do componente, que sempre
nasce `false` num mount novo. `Floor10Npc` é montado/desmontado
condicionalmente em `App.tsx:216` (`{level === 10 && <Floor10Npc .../>}`). Se
o valor guardado em `npc.near` era `true` quando o componente desmontou, e no
próximo mount a primeira leitura real de distância também é "longe" (`near =
false`), a comparação `false !== false` nunca dispara — `npcSet({near:
false})` nunca é chamado — e `npc.near` continua mentindo `true` até o
jogador **coincidentemente** cruzar a fronteira de novo.

**Cenário concreto de falha:** o Nilo tem metas autônomas que o levam para
perto do jogador (`follow-player`, `approach-player`) e para perto do
elevador (`inspect-elevator`, ver `elevatorInspections` no mesmo arquivo).
Jogador conversa com Nilo de perto (`npc.near = true`), termina, e entra no
elevador para sair do Andar 10 enquanto Nilo ainda está a menos de 2.8 m
(`NEAR_DIST`) — plausível já que ele às vezes segue o jogador ou já está perto
da porta. `Floor10Npc` desmonta com `npc.near` ainda `true` no store. O
jogador volta ao Andar 10 mais tarde: ele spawna longe de Nilo, então o
primeiro quadro real calcula `near = false`, que empata com o `nearRef.current
= false` do componente recém-montado — e não sincroniza. Resultado, sentido na
tela: o botão flutuante "💬 Conversar (E)" aparece e fica visível mesmo com o
jogador do outro lado da sala, e o atalho de teclado também obedece (em
`Floor10NpcChat.tsx:298`: `(e.key === 'e'...) && npc.near && !npc.open`) —
apertar E abre o painel de chat com Nilo longe, algo que a mecânica de
proximidade deveria impedir. O estado só se corrige quando a distância real
cruza 2.8 m de novo por acaso, o que pode levar o resto da visita inteira.

---

## 2. Bolha de pensamento e fala antigas reaparecem na volta ao Andar 10 — Nilo parece "repetir" uma cena de uma sessão passada (GRAVE)

**Onde:** `src/npc/npcStore.ts` (o singleton `s`, campos `deliberationPhase`,
`deliberationGoal`, `deliberationBubble`, `autonomousSpeech`,
`autonomousSpeechId`) + o consumo em `src/Floor10NpcChat.tsx:368-385`
(`thought`/`thoughtVisible`/`speechAudible`).

**O erro:** nada em `App.tsx`, em `Floor10Npc.tsx` ou em `Floor10NpcChat.tsx`
zera esses campos quando o jogador sai do Andar 10 (nem quando morre e
renasce). `npcReset()` (`npcStore.ts:185-189`) existe e faria parte do
trabalho, mas:

- ela **nunca é chamada pelo jogo** — o único lugar que a importa é
  `src/Floor10Bench.tsx:229`, um botão de bancada de desenvolvedor;
- e mesmo que fosse chamada, ela **não** reseta `deliberationPhase`,
  `deliberationGoal`, `deliberationBubble` nem `near` — só
  `open/phase/history/streaming/speaking/willCommand/autonomousSpeech/error`.

Como `Floor10NpcChat` também desmonta com `level !== 10`
(`App.tsx:2586`), qualquer efeito de limpeza dela some junto — inclusive o
`setTimeout` que apagaria `autonomousSpeech` 7s depois de uma fala autônoma
(`Floor10NpcChat.tsx:333-340`): o `return () => window.clearTimeout(timer)`
roda no unmount e **cancela** esse apagamento, então a fala fica gravada no
store para sempre até uma fala nova sobrescrevê-la.

**Cenário concreto de falha (determinístico, o pior dos dois):** jogador
conversa com Nilo, uma deliberação termina (`deliberationPhase = 'decided'`,
`deliberationGoal`/`deliberationBubble` preenchidos com a última frase real).
Jogador sai do Andar 10 sem que uma NOVA deliberação aconteça depois (basta
sair logo após a última). Volta ao Andar 10 minutos ou dias depois, na mesma
sessão do navegador: assim que fica a ≤9 m de Nilo, `deliberationThought(...)`
(`floor10Deliberation.ts:328`) lê `phase === 'decided'` — ainda a fase de
ANTES de sair — e mostra a bolha de pensamento antiga instantaneamente, antes
de qualquer novo raciocínio ter rodado nesta visita. **Variante com timing**:
se Nilo tinha acabado de falar sozinho (`npcAutonomousSay`) menos de 7s antes
de o jogador sair, a fala also fica congelada em `npc.autonomousSpeech` e
reaparece como uma bolha de fala completa ("💬 {NPC_NAME}: ...") assim que o
jogador se aproxima de novo — uma frase que o Nilo já disse antes, repetida
fora de contexto.

**Sonda que confirma os dois (rodada contra o `npcStore.ts` real):**
```
✓ npc.near fica PRESO em true depois de desmontar perto e remontar longe
✓ npc.autonomousSpeech sobrevive ao "unmount" sem nenhum novo discurso
```

---

## 3. `npc.history` (o histórico da conversa) cresce sem limite pela sessão inteira — engasgo crescente ao digitar (MÉDIA)

**Onde:** `src/npc/npcStore.ts:180` (`npcAutonomousSay`) +
`src/npc/wllamaEngine.ts` (pontos de escrita em `history:` nas linhas ~1618,
1635, 1989) somando em `s.history` a cada mensagem; consumido em
`src/Floor10NpcChat.tsx:588-592` (`st.history.map((m, i) => ...)`).

**O erro:** `s.history` só é ZERADO por `npcReset()` — que, como no achado 2,
nunca é chamada pelo jogo. Toda troca de mensagem (usuária + Nilo) e toda fala
autônoma empilha em `s.history` para sempre, inclusive **atravessando** visitas
repetidas ao Andar 10 na mesma sessão de navegador (o array vive no módulo,
não no componente). O corte de contexto que existe (`modelHistory(...,
maxMessages=6)` em `wllamaEngine.ts:859`) só recorta o que é ENVIADO como
prompt ao modelo — o array que a tela renderiza continua inteiro. Durante a
digitação de uma resposta, `npcSet({ streaming: ... })` é chamado a cada token
(`wllamaEngine.ts:1822`), o que dispara `npcBump()` e re-renderiza
`Floor10NpcChat` inteiro — e `st.history.map(...)` percorre o array completo
em TODO re-render, ou seja, a cada token.

**Cenário concreto de falha:** jogador conversa bastante com Nilo ao longo de
uma sessão longa (múltiplas idas ao Andar 10, ou uma conversa comprida em uma
visita só) — o histórico chega a centenas de linhas. A partir daí, toda vez
que Nilo está "digitando" uma resposta nova, cada token forca o React a
reconciliar centenas de bolhas de chat na tela, no aparelho de baixo custo que
o projeto mira (o "celular do Felipe" citado repetidamente nos comentários do
próprio código) — engasgo perceptível durante a fala, que piora conforme a
sessão avança, não conforme a conversa atual.

---

## 4. `setTimeout` de conferência de consequência nunca é cancelado — leak pequeno, mesmo padrão relatado antes (BAIXA)

**Onde:** `src/Floor10Npc.tsx:291-295`, dentro do `.then()` da deliberação
assíncrona chamada de dentro do `useFrame`:

```ts
const espera = ((decided.motion?.duration ?? 6) + 4) * 1000;
globalThis.setTimeout(() => {
    memoriaConsequencia.current.conferir(meta, antes, observarMundo(), Date.now() / 1000);
}, espera);
```

**O erro:** nenhum `clearTimeout`, nenhuma guarda `vivo`/`mounted`. Se o
jogador sai do Andar 10 (Floor10Npc desmonta) nos ~6-16s entre uma deliberação
terminar e essa checagem disparar, o timer roda mesmo assim, chamando
`.conferir()` num `memoriaConsequencia.current` que pertence a uma árvore React
já descartada — trabalho jogado fora, mas mantém vivas na memória as
closures capturadas (`meta`, `antes`, o próprio ref) até o timer disparar.
Não é visível para o jogador (não chama `setState`), mas é exatamente o
padrão "timer sem clear" pedido — e o **mesmo padrão exato** existe no arquivo
irmão de bancada `src/Floor10Campo.tsx:360-375`, só que ali o `setTimeout`
*chama* `setHistorico(...)` depois do unmount (rota `?campo`, não é caminho de
jogo real — por isso classifico como baixa severidade e não como um item
separado).

---

## O que está limpo neste setor

- **`Floor10NpcChat.tsx`**: o listener de teclado (`keydown`), o auto-scroll,
  o intervalo de `thinkingSeconds` e o timeout que apaga `autonomousSpeech`
  são todos corretamente limpos **enquanto o componente está montado** — o
  problema do achado 2 é especificamente sobre o que sobra no *store*
  depois que o componente já não existe mais, não sobre esses `useEffect`
  em si.
- **`Floor10Mente.tsx`** (`?mente`): os listeners `pointermove`/`pointerup`
  são removidos corretamente no cleanup; nenhum timer, nenhuma corrida de
  montagem/desmontagem encontrada.
- **`Floor10Campo.tsx`** (`?campo`): o laço principal de `requestAnimationFrame`
  e o laço automático de `pensar()` usam o padrão de guarda `let vivo = true`
  corretamente e são desligados no cleanup — só o `setTimeout` isolado do
  achado 4 escapou desse cuidado.
- **`npc/npcStore.ts`**: a implementação do `useSyncExternalStore` está
  correta e deliberadamente documentada (o contador `version` evita a
  armadilha do `Object.is(s, s) === true`, que travaria a UI). Nenhum
  problema de identidade/assinatura encontrado aqui.
- **`npc/floor10CaixaPreta.ts`**: buffer circular com teto fixo
  (`CAIXA_PRETA_TETO = 200`), escrita que nunca lança. Não é um arquivo
  React (sem hooks, sem ciclo de vida) — nada a reportar neste setor.
- **`Floor10Npc.tsx` `useFrame`**: percepção e vontade já são propositalmente
  cadenciadas a 6 Hz / 12 Hz em vez de 60 Hz (comentado no próprio arquivo, com
  a razão medida), e os vetores/quaternions usados no laço são todos
  memoizados uma única vez (`useMemo`) — não encontrei alocação nova nem
  varredura de array grande dentro do laço de 60 Hz em si.
- **Identidade de callback/prop (item 5)**: `Floor10Npc` só recebe um `ref`
  estável como prop; `Floor10NpcChat` não recebe props. Nenhuma prop de
  função recriada a cada render sendo passada para um componente pesado do
  Three.js foi encontrada nestes seis arquivos.
- O achado já confirmado no contexto (`motor` nunca invocado em
  `desligarQuemNaoEDaVez`) **já está corrigido** no worktree atual —
  `src/npc/floor10Roteamento.ts` hoje calcula quem desligar como o
  complemento sobre a lista completa `CEREBROS`, então um cérebro fora da
  tabela de "quem liga" também é coberto pela de "quem desliga". Não é um
  achado novo deste relatório (as mudanças já estavam no worktree antes de eu
  ler qualquer arquivo, e eu não as toquei — confirmado por
  `git status --short` no fim).

---

## Ordem de gravidade (o que o jogador sente primeiro)

1. Achado 1 — proximidade fantasma, quebra a mecânica de conversa por
   inteiro pelo resto da visita.
2. Achado 2 — bolha/fala fantasma do Nilo, sentido como "ele já disse isso"
   ou "ele está pensando algo que eu nunca vi" — quebra a imersão do
   horror/NPC vivo.
3. Achado 3 — engasgo crescente ao digitar, conforme a sessão acumula
   conversa.
4. Achado 4 — leak pequeno, sem sintoma visível isolado; reportado porque o
   padrão foi pedido explicitamente e reaparece nos dois arquivos.
