#!/usr/bin/env bash
# Traz o que `onnx-420.mjs` precisa: as duas versões do transformers.js, os
# runtimes ONNX de cada uma, e o modelo do juiz de tom.
#
# Existe porque o Chromium desta caixa NÃO alcança a internet — o proxy da
# sessão devolve ERR_CONNECTION_RESET, porque o navegador do Playwright não
# carrega a CA dele. Servindo tudo do servidor local a sonda funciona e, de
# quebra, passa a ser reproduzível sem rede (como wllama e Bergamot já são).
#
# Os ~214 MB ficam FORA do git: acima do limite do GitHub, e reconstituíveis
# rodando este arquivo.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p tjs/v381 tjs/v420 modelos/Xenova/all-mpnet-base-v2/onnx

baixar_versao() {
  local ver="$1" dir="$2"
  curl -sL "https://cdn.jsdelivr.net/npm/@huggingface/transformers@$ver/dist/transformers.min.js" \
    -o "tjs/$dir/transformers.min.js"
  # O runtime ONNX vem do pacote que ESSA versão declara — os nomes de arquivo
  # mudam entre elas (a 4.2.0 pede `asyncify`, que a 3.8.1 nem publica).
  local ort
  ort=$(curl -sL "https://cdn.jsdelivr.net/npm/@huggingface/transformers@$ver/package.json" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['dependencies']['onnxruntime-web'])")
  echo "  $ver → onnxruntime-web $ort"
  curl -s "https://data.jsdelivr.com/v1/packages/npm/onnxruntime-web@$ort?structure=flat" \
    | python3 -c "
import json,sys
for f in json.load(sys.stdin).get('files', []):
    n = f['name']
    if n.startswith('/dist/ort-') and n.endswith(('.mjs', '.wasm')) and 'node' not in n:
        print(n)
" | while read -r f; do
    curl -sfL "https://cdn.jsdelivr.net/npm/onnxruntime-web@$ort$f" -o "tjs/$dir/$(basename "$f")" || true
  done
}

echo "transformers.js:"
baixar_versao 3.8.1 v381
baixar_versao 4.2.0 v420

echo "modelo do juiz (Xenova/all-mpnet-base-v2, q8):"
M=modelos/Xenova/all-mpnet-base-v2
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json vocab.txt; do
  curl -sL "https://huggingface.co/Xenova/all-mpnet-base-v2/resolve/main/$f" -o "$M/$f"
done
curl -sL "https://huggingface.co/Xenova/all-mpnet-base-v2/resolve/main/onnx/model_quantized.onnx" \
  -o "$M/onnx/model_quantized.onnx"
du -sh tjs modelos
