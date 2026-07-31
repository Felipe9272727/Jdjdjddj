# Pipeline visual do Floor 8

Este é o fluxo que deu fluidez ao `YOURSELF` e deve ser reutilizado em novos
personagens 2.5D. A arte gerada é matéria-prima; alinhamento, tempo e feedback
continuam sendo responsabilidade do jogo.

## Atlas de personagem

1. Gerar uma prancha 4x4 sobre chroma uniforme, sem texto, sombra externa ou
   quadros encostando. Cada linha tem uma função: locomoção, ataque, reação ao
   fio e desmanche.
2. Remover o chroma e componentes desconectados, mantendo detalhes ligados à
   silhueta. Normalizar todos os quadros para o mesmo tamanho.
3. Fixar a sola na mesma coordenada em todos os frames. O plano é deslocado pelo
   baseline e a raiz fica no chão da simulação; squash e flip acontecem na raiz.
4. Usar poses com duração desigual quando a ação pedir antecipação ou impacto.
   A transição começa apenas nos últimos ~30% da pose e cruza dois planos por
   poucos frames. Não interpolar o corpo inteiro por muito tempo.
5. Somar movimento procedural pequeno — antecipação, overshoot, respiração e
   hit-stop — sem alterar o ponto de contato dos pés.

## Parallax sem tremor

- A câmera atualiza em `useFrame` com prioridade `-2`; o parallax, em `-1`.
- Todas as camadas usam a mesma âncora vertical da câmera. Profundidade vem da
  diferença de acompanhamento horizontal, nunca de frações diferentes do salto.
- Usar `THREE.MathUtils.damp` com `dt` limitado; não usar lerp dependente do FPS.
- Fundo, meio e primeiro plano usam, respectivamente, fatores próximos de
  `0.985`, `0.925` e `0.805` no eixo X.
- Camadas transparentes não geram mipmaps, não escrevem profundidade e são
  salvas em WebP; sprites que precisam ser entregues como PNG permanecem PNG.

## Gate de qualidade

Antes de publicar: TypeScript, suíte de testes, build, screenshots fixas em cada
memória e captura no Chromium mobile. Revisar baseline, recorte, leitura do
ataque, estabilidade do parallax durante o salto, erros do console e p95 de
frame. Um teste lógico não consegue dizer se a silhueta ficou bonita.
