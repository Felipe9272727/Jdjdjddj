# Checkpoint — Andar 13 (Vindhjem)

Para retomar se a cota acabar ou o container reiniciar. Atualizado a cada rodada.

## Como retomar
1. `git checkout agent/floor12-gpt-compare && git pull`
2. `cd jubileu && npm ci` (se faltar `node_modules`)
3. Dev server: `setsid nohup npx vite --port 3131 --host 127.0.0.1 > /tmp/vite3131.log 2>&1 < /dev/null &`
4. Co-builder: `CHAVES_DIR=<pasta com deepseek.env e rotear.sh> python3 tools/cobuilder/cobuilder.py tarefa.json`
   (ou `DEEPSEEK_API_KEY` / `TYPESAFE_API_KEY` no ambiente). Ler `CLAUDE.md` (regra de ouro).
5. Hooks de DEV: `?f13`, `?f13aovivo` (queda ao vivo), `?f13gravar` (densidade 2), `?f13t=X`
   (congela a queda), `?f13fps` (painel de desempenho, também em produção), `window.__f13.*`.

## Feito (últimas rodadas)
- Queda pré-renderizada: vídeo (`public/queda-h.webm/.mp4`) + título em runas (Manim,
  `public/titulo-*.webm`); começa só com shaders compilados e o mundo aquecido.
- Cabine de biplano nova com mãos no manche (`f13Cabine*.ts*`) e feno macio (`f13Feno.tsx`).
- Desempenho: recorte por visão dos moradores (217→105 chamadas, 585k→222k triângulos).
- Câmera de conversa no rosto, desviando de barracas; câmera da porta no vão.
- Assuntos sem beco sem saída; guarda de 400 ms no menu; olho da vila escala; noite legível.

## Em andamento
- Vídeo da queda NOVO (cabine nova), densidade 2: `tools/queda/gravar.sh` (captura em `tools/queda/captura.mjs`) grava em `/tmp/cap/{h,v}`;
  depois acabamento Remotion (`tools/queda/remotion`: `npm ci && ./run.sh h|v`; caminhos em /tmp), VP9 + H.264, trocar em `public/`.
  Se perdido: refazer com `?f13aovivo&f13gravar` + relógio falso (Playwright `clock`), 34 ms/quadro, 29,4118 qps.
- Tela de carregamento 2D animada (Tropo 63 x robô, Tropo 64, atendente do lobby):
  branch `sub/loading` (`CarregandoAnimado.tsx`), plugar enquanto `!quedaPronta`.
- Crítico rodada 89.

## Próximos
- Medir no celular com `?f13fps` (o usuário reporta ~15 qps) e cortar onde o gargalo estiver,
  sem perda gráfica (candidatos: juntar peças com esqueleto por morador, lotes de adereços estáticos).
- UI mais bonita.
- Continuar o gauntlet loop: crítico (DeepSeek com visão + JEV) → correções.
