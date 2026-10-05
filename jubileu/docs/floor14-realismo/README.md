# Andar 14 — Kessar-9: realismo e chegada

Base: `agent/floor12-gpt-compare`, `e7cb59fa292ca35fe33eb7620d83095aa5c14d00`.

A abertura que o código referenciava não estava versionada. Agora `chegada-14.mp4` é entregue em `jubileu/public/` e copiado à raiz pelo build: H.264/AAC, 1280×608, 24 fps, 12 segundos, ~2,1 MB. Os cinco planos originais foram renderizados em Blender/Cycles e editados com som no Remotion. É uma montagem de placas com movimento de câmera em composição, não uma animação 3D contínua de personagem. Os scripts reproduzíveis estão em `tools/chegada14/`.

## Alterações

- Autoplay bloqueado oferece início por toque; pular é explícito; falha do vídeo oferece continuar. O fôlego começa depois da chegada e do aquecimento do cenário.
- Sol e sombras com direção constante, planeta com terminador e oclusão dos anéis, areia menos saturada, cascalho, rochas erodidas, arcos irregulares, poeira em um lote.
- Visor elíptico preserva a paisagem em telas largas e estreitas. O capacete permanece assentado na areia.
- A entidade desaparece inteira, com partículas suaves e sombra projetada no terreno, separada do rig. Agulhas ficam longe das posições reais das aparições.
- Corpo e adereços consultam os mesmos triângulos da malha. Removida a interpolação vertical que enterrava a câmera em encostas.
- Qualidade baixa sem pós-processamento e sem transmissão; sombras 1024, DPR 1. HUD a 10 Hz, colliders limpos ao desmontar e Canvas do hotel pausado enquanto este andar está ativo.

## Gauntlet — crítico GPT-6.1

1. Diagnóstico: vídeo ausente; geografia divergente; visor excessivo; desaparecimento parcial; luz mudando; superfície analítica divergindo da malha; custo mobile.
2. Revisão de cinco regiões: pediu arcos menos regulares, partículas sem aparência de bolinhas, clareira para silhueta. A divisão aparente da cratera foi confirmada como câmera ainda interpolando de outra altitude nas capturas; o snap à superfície resolveu.
3. Revisão final: pediu sombra independente da rotação da entidade; implementada malha no mundo orientada por `-SOL`, apoiada no terreno e com fade coordenado. **Aprovado pelo GPT-6.1 sem bloqueadores visuais nas imagens finais.**

## Entrega no GitHub

A pedido do Felipe no fim da sessão, **`index.html` e `version.json` não foram atualizados na branch remota**. O build foi gerado e validado localmente; a entrega remota contém o código, a cutscene e as evidências. Rodar `npm run build:reproducible` materializa o jogo completo depois.

## Validação e limites

- TypeScript sem erros; teste compara a superfície com Raycaster real em 56 pontos, incluindo terraços e cratera.
- Suíte completa: 2313 passaram inicialmente; cinco falhas de tempo/DNS em dois arquivos não alterados. Os 29 testes desses dois arquivos passaram na repetição isolada com `NODE_OPTIONS=--dns-result-order=ipv4first`. Total: 2318 testes aprovados, um ignorado. Auditoria: zero erros, avisos existentes e aviso de inspeção textual do bundle comprimido.
- Chromium/SwiftShader: vídeo reproduziu até o fim, caminhada por W até o capacete e coleta por E, exploração, soltar movimento ao perder foco, pular sem entrada presa, autoplay por toque e fallback com requisição deliberadamente abortada.
- Capturas das cinco regiões, paisagem e retrato; qualidade alta abriu sem erros JavaScript/shader. HTML comprimido abriu o menu principal sem erros no Chromium. Não é medição de FPS em aparelho móvel nem certificação de percurso completo entre todas as aparições.
- O build atual com todos os assets herdados ultrapassa 100 MiB. O single-file agora embute o JavaScript original comprimido com gzip e o executa após `DecompressionStream`; mantém os assets sem perda. Requer Chrome 80+/Safari 16.4+ ou equivalente. O `dist` do Vite permanece no formato convencional.
