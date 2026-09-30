# Floor 13 — desempenho e alinhamento das pontes

Base: `bb2d65e011800708a9ac62f5df7b82bf38fbd3c7` (última branch do Floor 2).

## Alterações

- O Canvas conserva sua árvore entre atualizações da interface (letras do diálogo, clarão, apagão e joystick). Estados da cena, qualidade, fases, pistas e entidade continuam invalidando essa árvore explicitamente.
- Os três mostradores da cabine têm identidade de componente estável: atualizar a interface não desmonta suas malhas e materiais.
- Poeira e lascas da queda calculam seus transforms apenas durante o intervalo em que estão visíveis. O movimento usa tempo absoluto, portanto a primeira imagem visível permanece igual.
- Os vetores de aberração cromática são reutilizados, mantendo os mesmos valores.
- A colisão das pontes agora segue a curvatura e a espessura das tábuas já desenhadas. No meio da ponte praça–casas, o chão lógico desceu de 1,500 m para 1,115 m: corrige a flutuação de 38,5 cm. A geometria das pontes não mudou.

Não foram reduzidos DPR, sombras, grama, MSAA, luzes, texturas, materiais ou efeitos. O monitor adaptativo existente permanece igual no jogo; somente a bancada pode travar a qualidade para comparação.

A forja também foi inspecionada: bigorna, fagulhas e áudio estão alinhados. O gesto de Brokk não representa um golpe sincronizado; isso não foi tratado como erro de posição dos adereços.

## Comparação observada

Chromium headless, SwiftShader, Vite DEV, 720×480, DPR 1, qualidade 2 travada, início em Brokk. Instrumentação idêntica no baseline e na versão alterada. Cada janela contém 24 amostras de requestAnimationFrame.

| Cenário | Atualizações da árvore antes | Depois | Tempo React antes | Depois |
|---|---:|---:|---:|---:|
| Cenário parado | 3 | 1 | 85,28 ms | 38,55 ms |
| Primeira fala de Brokk | 78 | 2 | 970,68 ms | 96,10 ms |

O resultado demonstra a eliminação de reconciliações por letra. Não é um ganho de FPS de 90%: o Profiler mede trabalho React, não o custo total de GPU. Janelas de RAF podem incluir intervalos sem render; a captura inicial não tem uma barreira de estabilização explícita. A execução posterior também dividiu recursos com a compilação em parte da coleta. Os tempos absolutos são indicativos; exigem medição em hardware real para estimar fluidez.

No cenário parado, os contadores antes/depois são idênticos: **524 chamadas, 880.645 triângulos, 8 luzes pontuais visíveis, 126 malhas skinned visíveis, 125 programas, 722 geometrias e 529 texturas**. Durante o diálogo a câmera e personagens se movem, por isso contadores de geometria visível não constituem uma comparação visual quadro a quadro.

Os números completos estão em `measurements.json`. Não houve exceção JavaScript nas duas coletas. Capturas do resultado foram inspecionadas. Shaders e parâmetros de pós-processamento foram conferidos no diff, sem remoção de passes.

## Reprodução

Na pasta `jubileu`, após instalar as dependências:

```sh
F13_CHROMIUM=/caminho/para/chromium F13_OUT=/tmp/f13-perf node tools/floor13-perf.mjs
```

`F13_SHOTS=1` captura o Canvas com pós-processamento. `F13_START=casaCerta F13_MODES=exit` exercita a saída; `F13_START='' F13_MODES=opening` exercita a queda. A entrada `floor13.html` é uma bancada local de desenvolvimento e não entra no build normal.

Para reproduzir o baseline, use o commit base com somente a instrumentação de perfil: `Floor13Profile`, `fixedQuality13`, o bloqueio DEV do PerformanceMonitor e os hooks DEV de diálogo/banco. As alterações de memoização, identidade dos relógios e loops de partículas não devem entrar no baseline.

## Validação

- `npm run lint:types`: passou.
- `npx vitest run src/__tests__/f13Mundo.test.ts`: 19 testes passaram, incluindo amostras das tábuas de todas as pontes, terreno, NPCs, portas, itens e progressão de pistas.
- `npm run build`: passou (1.279 módulos).
- Bancada no navegador: trecho inicial da queda e saída até a cabine capturados, sem exceções JavaScript. Abertura: 0 atualizações React da árvore nas 24 amostras coletadas; animação por frame continuou ativa. Isso é um smoke test, não uma medição de FPS nem uma cobertura de cada instante da queda.
- Revisão de dependências da memoização, refs animadas e invalidação de estado da entidade: sem bloqueios encontrados.

O JEV foi consultado com o objetivo genérico informado pelo usuário, sem código nem conteúdo privado do repositório. Sugeriu inspeção local e comparação antes/depois mantendo qualidade. Essa orientação foi usada; ela não substitui os testes ou uma medição em dispositivo real.
