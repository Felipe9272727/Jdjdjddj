#!/usr/bin/env bash
# Busca o tradutor do Firefox (Bergamot) e o par en-pt, em bancada-navegador/bergamot/.
#
# POR QUE ESTE SCRIPT EXISTE, e não os arquivos: são 40 MB de binário, e eles
# vivem em dois lugares que já mudaram uma vez. O repositório
# `mozilla/firefox-translations-models` está MORTO e aponta para o Google Cloud
# Storage; o runtime saiu do GitHub para o npm. Se algum destes links cair, o
# registro vivo está em:
#
#   https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json
#
# Medido nesta bancada: 83 ms por frase (o m2m100-418M fazia 2.200 ms), com
# 40 MB contra 602 MB. Ressalva importante: ele escreve português de PORTUGAL
# ("está a responder", "não estás"), então precisa do passe pt-PT → pt-BR.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bergamot && cd bergamot

BASE="https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data"
PASTA="models/en-pt/retrain_hr_fix_names_Vnb0RUXTTd67hR-oLHM3eg/exported"

echo "── modelo en-pt (base-memory, 31,2M parâmetros · BLEU 50,44 · COMET22 0,889)"
for f in model.enpt.intgemm.alphas.bin lex.50.50.enpt.s2t.bin vocab.enpt.spm; do
  [ -f "$f" ] && { echo "   $f (já existe)"; continue; }
  curl -sSL --retry 3 -o "$f.gz" "$BASE/$PASTA/$f.gz"
  gunzip -f "$f.gz"
  echo "   $f · $(stat -c%s "$f") bytes"
done

echo "── runtime WASM (npm @browsermt/bergamot-translator)"
if [ ! -f worker/bergamot-translator-worker.wasm ]; then
  tmp="$(mktemp -d)"
  (cd "$tmp" && npm init -y >/dev/null 2>&1 && npm install --silent @browsermt/bergamot-translator@0.4.9)
  cp -r "$tmp/node_modules/@browsermt/bergamot-translator/." .
  rm -rf "$tmp"
fi
echo "   worker/bergamot-translator-worker.wasm · $(stat -c%s worker/bergamot-translator-worker.wasm) bytes"

# Os caminhos precisam ser ABSOLUTOS: o `translator.js` resolve `file.name`
# contra a PÁGINA, não contra o registry.json. Com nome relativo dá 404 e o
# erro que aparece é "SentencePiece vocabulary error", que não ajuda ninguém.
cat > registry.json <<'JSON'
{
  "enpt": {
    "model": { "name": "/bergamot/model.enpt.intgemm.alphas.bin" },
    "lex":   { "name": "/bergamot/lex.50.50.enpt.s2t.bin" },
    "vocab": { "name": "/bergamot/vocab.enpt.spm" }
  }
}
JSON
echo "── pronto. Sirva bancada-navegador/ e use registryUrl=/bergamot/registry.json"
echo "   (pivotLanguage: null — senão ele tenta baixar en->en e falha)"
