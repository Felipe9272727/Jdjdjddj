# Achados — Setor Carga de Modelos (download, cache, coordenação, GPU)

Status: EM ANDAMENTO — relatório sendo escrito incrementalmente durante a investigação.

Arquivos no escopo (ordem de prioridade):
1. src/npc/floor10ModelStorage.ts
2. src/npc/floor10Carga.ts
3. src/npc/floor10ModelCoordinator.ts
4. src/npc/floor10Precarga.ts
5. src/npc/floor10Gpu.ts
6. src/npc/wllamaEngine.ts (apenas grep alvejado)

---

## Achados confirmados

(nenhum achado CONFIRMADO com cenário concreto ainda — ver notas de investigação abaixo)

---

## Notas de investigação (não são achados finais — rascunho de trabalho)

### floor10ModelStorage.ts — `deleteCachedModel` (linhas 157-188)

Investiguei a fundo comparando com o código REAL do wllama 3.5.1 (clonado em
`/tmp/.../scratchpad/wllama/src/cache-manager.ts` e confirmado idêntico ao bundle
realmente servido em `public/wllama-espec/index.js`, linhas ~2084-2340).

Resultado: o `CacheManager.delete(nameOrURL)` REAL da 3.5.1 já resolve a URL
crua através de `getNameFromURL()` antes de comparar (`entry.name === nameOrURL
|| entry.name === name2`), e só chama `sb.delete()` (o `removeEntry` que engole
`NotFoundError`) para entradas que o `list()` provou existirem. Ou seja: o bug
histórico documentado no comentário gigante (linhas 86-109) — "delete(url)
procura uma entrada com o nome literal da URL, não acha, e volta como se
tivesse apagado" — descreve um comportamento que ESTE `delete()` de alto nível
não tem mais (ele resolve pelo hash certo). A implementação elaborada de 3
planos em `deleteCachedModel` funciona, mas o Plano A sozinho (linha 165,
`cache.delete(nome)`) já bastaria — os Planos B/C são inalcançáveis no caminho
feliz. Isto não é um bug ativo (não path faz nada errado), só uma
complexidade que sobrou de um diagnóstico anterior a uma mudança da
biblioteca. Não vou reportar como achado — sem cenário de falha concreto.

Sub-detalhe verificado e também sem bug: a segunda chamada do Plano A,
`cache.delete(`__metadata__${nome}`)` (linha 167), é sempre um no-op no
`CacheManager` real — `list()` nunca expõe entradas com o prefixo
`__metadata__` (ele as consome para montar o mapa de metadados), então esse
`nameOrURL` nunca casa com nada. Inofensivo: a própria `deleteMany` do plano A
já apaga a entrada de metadados como efeito colateral de apagar o arquivo
principal (`sb.delete(PREFIX_METADATA + item.name)` em cache-manager.ts:320).
Não é um bug, é código morto/redundante.

Ainda a investigar em ModelStorage: `probeModelBytes` (HEAD sem timeout/AbortSignal
— pode pendurar para sempre?), `nome==null` (crypto.subtle indisponível em
contexto não-seguro) faz `deleteCachedModel` sempre devolver `false` mesmo
quando a Plano C (URL crua) teria funcionado — path conservador, não path que
finge sucesso, então baixa prioridade.

PRÓXIMO: floor10Gpu.ts, depois grep alvejado em wllamaEngine.ts.

### floor10Precarga.ts — revisão funda

`esperarAVez` (linhas 128-183): mecanismo de espera com teto duplo
(`tetoMs`/`tetoAbsolutoMs`), limpa `setInterval` e cancela a assinatura da loja
em TODOS os casos de término, e protege a chamada de `adiar()` num tique com
try/catch (documentado como correção de um bug real anterior — "uma exceção
tardia deixava a promessa pendente para sempre"). Não achei um jeito de essa
promessa nunca resolver: o `tetoAbsolutoMs` (10 min) sempre vence mesmo se
`falaGerandoAgora()` ficar travada em `true` para sempre.

LEVANTEI UMA SUSPEITA sem conseguir confirmar (então NÃO reporto): `const
cancelarInscricao = npcSubscribe(conferir);` seguido por `conferir()` alguns
tiques depois — se `npcSubscribe` chamasse `conferir` SINCRONAMENTE durante a
própria assinatura (algumas libs de pub/sub fazem isso), e `conferir` decidisse
terminar já nessa primeira chamada, `terminar()` tentaria chamar
`cancelarInscricao()` ainda dentro do inicializador do `const` — o que
lançaria (TDZ) em vez de cancelar. Não posso confirmar porque `npcStore.ts`
está fora do meu setor por instrução explícita, e o padrão mais comum para uma
função chamada `*Subscribe` (estilo Zustand) NÃO chama o callback na hora da
inscrição, só em mudanças futuras — o que tornaria isto não-reprodutível. Sem
poder ler `npcStore.ts`, não tenho cenário concreto: NÃO reporto.

`iniciarPrecarga` (linhas 300-366): o `try` externo cobre o passo inteiro
(espera da vez + contabilidade), documentado como correção de um bug real
anterior em que uma exceção fora do `carregar()` rejeitava `emCurso`
permanentemente. Meu teste de bancada (abaixo) não achou um jeito de burlar
essa cobertura.

Nenhum achado reportável neste arquivo até agora.

PRÓXIMO: floor10Gpu.ts, depois grep alvejado em wllamaEngine.ts.

### floor10ModelCoordinator.ts — revisão funda, sem achado reportável

Analisei `activate()`/`release()` a fundo procurando exatamente a corrida #3
pedida (duas cargas simultâneas do mesmo modelo). O design tem um cheiro real:
quando duas chamadas `activate(owner, load)` se sobrepõem, a mais antiga que
resolve DEPOIS de uma geração mais nova ser aberta tem seu valor devolvido ao
chamador ORIGINAL mesmo assim (a linha `return value` não checa a geração),
só não fica marcada em `residentOwners` nem é limpa de `cleanupNeededOwners`
de forma diferenciada — Se o `load()` de cada dono não fosse idempotente,
isso vazaria uma engine paralela nunca desligada por `release()`.

MAS: verifiquei os três `load()` reais que a base usa com este coordenador
(`initConversationEngine` em wllamaEngine.ts:1035-1036, `ensureMemoriaEngine`
em floor10Memoria.ts:249-250, `ensureMotorEngine` em floor10MotorBrain.ts:217)
e todos os três têm a MESMA guarda dupla — "já residente? devolve o mesmo
objeto" + "já uma carga em voo? devolve a MESMA promise" — antes de criarem
qualquer recurso novo. Isso faz com que duas `activate()` sobrepostas para o
mesmo dono colapsem no MESMO engine subjacente, não em dois. Não consegui
montar uma sequência concreta em que o cheiro do coordenador vaze um recurso
de verdade dado como os donos reais se comportam hoje. NÃO reporto como achado
— falha o critério "cenário concreto".

---

## Setores/arquivos considerados limpos

- floor10ModelStorage.ts: revisão completa feita. `deleteCachedModel` funciona
  corretamente contra o wllama 3.5.1 real (verificado contra o código-fonte da
  lib e o bundle servido). `planModelCache`, `readStorageEstimate` parecem
  corretos. `probeModelBytes` tem uma fraqueza potencial (sem timeout) — ver nota
  acima, ainda não confirmada como achado reportável.
