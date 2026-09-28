# Diagnóstico de posição do Floor 13

Abra a bancada DEV `floor13.html?inicio=brokk&f13audit=1`. Depois de carregar:

```js
const report = window.__f13Audit.scan();
console.table(report.candidates);
window.__f13Audit.show(['Casa:praca-leste', 'Praca:Barraca:2']);
window.__f13Audit.clear();
// Câmera livre somente para inspecionar/capturar:
window.__f13Audit.camera([11, 4, 16], [6, 1, 11]);
window.__f13Audit.releaseCamera();
```

`scan(tolerance)` aceita tolerância em metros (padrão 0,025). Retorna IDs,
profundidade mínima, dimensões e centro da interseção. Rosa indica o objeto;
amarelo indica a região suspeita. Nada é movido automaticamente.

A detecção usa AABBs por peça e agrupa peças do mesmo objeto. Mantém a
procedência das peças removidas pela fusão estática, sem desativar a fusão ou
reter as malhas originais. Personagens usam os vértices deformados da pose.
É uma consulta sob demanda; não roda a cada frame. O registro de procedência
só existe com `f13audit` em DEV. Materiais, shaders e pós-processamento permanecem.

## Cobertura e interpretação

Nesta captura: 28 objetos/conjuntos e 8 pares candidatos. Casas, pontes,
barracas, poço, pedra rúnica, estrutura da forja, fornalha, bigorna, templo,
carroça, banco e NPCs visíveis têm IDs. `unlabelledMeshes` mostra a cobertura
restante. Céu, terreno, vegetação e peças não etiquetadas não são auditados.
Novos objetos podem ser incluídos com `userData={{audit:'ID único'}}` num grupo.
`auditIgnore` exclui adereços como partículas. Peças do mesmo ID não são comparadas.

Caixas conservadoras podem cruzar mesmo sem colisão de triângulos, especialmente
em telhados inclinados, NPCs e malhas ocas. Os pares devem ser inspecionados.
Banco:Arni ↔ NPC:arni é contato esperado. Os candidatos barraca/casa, ponte/casa
e telhados das casas foram registrados para revisão; não são correções automáticas
nem prova de penetração. Capturas da praça/ponte ainda têm oclusão pelos telhados,
portanto não justificam mover casas a partir desse relatório sozinho.

## Correção do Árni

Amostra dos vértices já deformados, numa coluna de 24 × 18 cm sob o quadril:

| Estado | Y da raiz no banco | Menor Y na coluna (espaço do banco) |
|---|---:|---:|
| Antes | -0,10 m | 0,711709 m |
| Depois | -0,36 m | 0,451709 m |

O topo da tábua traseira fica aproximadamente em 0,452 m. A raiz foi baixada
26 cm; x/z, escala e pose permanecem iguais. Capturas laterais antes/depois
confirmaram o contato. A amostra é uma medida localizada, não um solucionador
universal de contato corporal.

Reprodução na pasta `jubileu`:

```sh
F13_CHROMIUM=/caminho/chromium F13_OUT=/tmp/f13-placement node tools/floor13-placement.mjs
```

`F13_TRIAL_Y=-0.10` acrescenta uma comparação temporária sem editar o código.
`F13_CANDIDATE_SHOTS=1` salva também dois ângulos dos candidatos da praça/ponte.
O script salva JSON e PNGs e registra erros de página. A captura final está resumida
em `report.json` (sem erros de JavaScript).

Validação: typecheck e build passaram; 22 testes passaram, incluindo contato
versus penetração, peças do mesmo objeto, procedência após duas fusões, objetos
invisíveis e as 19 regressões existentes do mundo/quests.
