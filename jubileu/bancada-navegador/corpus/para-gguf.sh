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
#
# ── A ARMADILHA DO MTP, QUE CUSTOU UM DIA ────────────────────────────────
#
# O Qwen3.5 traz uma cabeça de predição multi-token: `mtp_num_hidden_layers: 1`
# no config.json. O conversor SOMA essa camada ao `block_count` — 24 + 1 = 25 —
# e escreve no cabeçalho do gguf que existem 25 blocos.
#
# `PeftModel.merge_and_unload()` DERRUBA os tensores do MTP (e os de visão).
# Base: 488 tensores, 15 deles do MTP. Mesclado: 320 tensores, ZERO do MTP.
#
# O resultado é um arquivo que promete 25 blocos e entrega 24, e o llama.cpp
# recusa na carga:
#
#     missing tensor 'blk.24.attn_norm.weight'
#
# No navegador isso vira `(ABORT)` sem texto, porque a bancada e o jogo sobem o
# wllama com `suppressNativeLog: true`. A tela fica parada em "subindo o revisor
# ao lado do rascunhador…" e PARECE lentidão. Não é: é recusa.
#
# NÃO tente consertar remendando o `block_count` de 25 para 24 nos bytes do
# gguf. Já tentei: o erro só anda para
# `missing tensor 'blk.23.nextn.eh_proj.weight'`, porque a chave que anuncia o
# nextn continua no cabeçalho.
#
# Existem DOIS consertos de verdade:
#
#   1. devolver os 15 tensores do MTP ao mesclado, lendo-os da base
#      (`corpus/mtp-de-volta.py`), e converter normalmente; ou
#   2. `--no-mtp`, que tira a camada da conta E a chave do cabeçalho.
#
# O padrão aqui é (2), porque o wllama não faz decodificação especulativa: a
# cabeça de MTP é peso morto no arquivo que o celular baixa. Passe `MTP=1`
# quando o destino souber usá-la — e aí rode `mtp-de-volta.py` antes.
#
# SEMPRE termine com a sonda. `arch-do-gguf.mjs` lê o cabeçalho e diz o nome da
# arquitetura; ele teria dito `qwen35` para o arquivo quebrado também. Só
# `sonda-abort.mjs` CARREGA — e carregar é a única prova de que carrega.
set -euo pipefail
ENTRADA="${1:?diretório do modelo mesclado}"
SAIDA="${2:?arquivo .gguf de saída}"
LLAMACPP="${LLAMACPP:?aponte para um clone do llama.cpp}"
TIPO="${TIPO:-q8_0}"
MTP="${MTP:-0}"

python3 "$LLAMACPP/convert_hf_to_gguf.py" "$ENTRADA" --outfile "$SAIDA" --outtype "$TIPO" \
    $([ "$MTP" = 1 ] || echo --no-mtp)
ls -la "$SAIDA"
node arch-do-gguf.mjs "$SAIDA"
echo
echo "  falta a única prova que vale:  ARQ=$(basename "$SAIDA") node sonda-abort.mjs"
