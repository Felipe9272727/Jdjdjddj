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
- `Floor9Forest.tsx` — a cena 3D (mural/texturas pintadas, árvores
  instanciadas, musgo emissivo, fio vermelho, sprites dos bichos e onda).
- `Floor9Overlay.tsx` — DOM: legendas, aviso da onda, prompt do oco.
- `Floor9Cutscene.tsx` — a QUEDA pela copa (câmera) + beats.
- Bench: `floor9.html` + `floor9-dev.tsx` (`window.__f9dbg`).

## Contratos internos
- `f9Eco.ts`/`f9Floresta.ts` continuam sendo a fonte pura de verdade.
- O atlas pintado só encarna estado e animação; nunca decide comportamento.
- A onda, o HUD e os atores leem o mesmo ciclo do ecossistema.
