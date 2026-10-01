# Regras do projeto

## REGRA DE OURO (não negociável)

1. **JEV obrigatório sempre.** Toda entrega (código, arte, texto, fala, decisão de design)
   passa pelo JEV antes do commit — `tools/jev-route.py` com checklist objetiva
   (via `scratchpad/cobuilder.py` ou `scratchpad/ds_jev.py`). Única exceção: quando
   o JEV atrasaria ou pioraria a entrega (ex.: correção de uma linha já verificada
   na tela, gravação de vídeo em andamento).
2. **DeepSeek obrigatório sempre** como co-builder (inclusive com visão: mande
   capturas). Ele escreve, o JEV julga, eu reviso e integro. Mesma exceção:
   só pular quando atrasar ou piorar a entrega.
3. **Sonnets só quando indispensável** (cota cara, ganho menor que o do loop):
   preferir DeepSeek + JEV para construir e para criticar.
4. Chaves: nunca imprimir nem commitar. TYPESAFE via grep em `scratchpad/rotear.sh`;
   DeepSeek só em `scratchpad/deepseek.env`.

## Trabalho

- Branch de trabalho: `agent/floor12-gpt-compare` (push para o mesmo nome).
- Commit e push cedo e com frequência; ver `CHECKPOINT.md` para retomar.
- Nunca `git add -A` (worktrees com symlink `node_modules`).
- Andar 13 é otimizado **sem perda gráfica**.
