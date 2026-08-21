#!/usr/bin/env bash
# ── DO MODELO TREINADO PARA O gguf QUE O JOGO CARREGA ─────────────────────
#
# O conversor do llama.cpp deixou de ser UM arquivo: hoje ele importa o pacote
# `conversion/`, então baixar só o convert_hf_to_gguf.py não resolve — precisa
# do repositório (clone raso serve, ~200 MB).
#
#   LLAMACPP=/caminho/do/llama.cpp bash corpus/para-gguf.sh corpus/revisor-360m revisor360.gguf
#
# `--outtype q8_0` quantiza NA CONVERSÃO, o que evita compilar o llama-quantize
# só para isso. Q8 de 360M dá ~390 MB, que pela conta da carga (MB ÷ 32) são
# ~12 s — contra os 42 s do titular de hoje.
set -euo pipefail
ENTRADA="${1:?diretório do modelo mesclado}"
SAIDA="${2:?arquivo .gguf de saída}"
LLAMACPP="${LLAMACPP:?aponte para um clone do llama.cpp}"
TIPO="${TIPO:-q8_0}"

python3 "$LLAMACPP/convert_hf_to_gguf.py" "$ENTRADA" --outfile "$SAIDA" --outtype "$TIPO"
ls -la "$SAIDA"
node arch-do-gguf.mjs "$SAIDA"
