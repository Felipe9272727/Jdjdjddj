#!/usr/bin/env bash
# Busca o tradutor do Firefox (Bergamot) e os DOIS pares, em bancada-navegador/bergamot/.
#
# São dois porque o JOGADOR PERGUNTA EM PORTUGUÊS: o `en → pt` traz a resposta
# do rascunhador, e o `pt → en` leva a pergunta até ele. O segundo só apareceu
# na hora de ligar no jogo — aqui na bancada eu sempre dei a pergunta já em
# inglês, e o buraco não aparecia.
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

# O bucket da Mozilla NÃO manda `access-control-allow-origin`, então o navegador
# recusa — no jogo os arquivos vêm do espelho `mukowaty/firefox-translations` no
# HuggingFace, que serve os mesmos bytes com CORS `*`. Aqui na bancada o
# servidor é nosso e a origem é a mesma, então dá para pegar da fonte.
BASE="https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data"

baixar_par() {
  local par="$1" pasta="$2"; shift 2
  echo "── modelo $par"
  for f in "$@"; do
    [ -f "$f" ] && { echo "   $f (já existe)"; continue; }
    curl -sSL --retry 3 -o "$f.gz" "$BASE/models/$par/$pasta/exported/$f.gz"
    gunzip -f "$f.gz"
    echo "   $f · $(stat -c%s "$f") bytes"
  done
}

# en-pt: base-memory, 31,2M parâmetros · BLEU 50,44 · COMET22 0,889
baixar_par en-pt retrain_hr_fix_names_Vnb0RUXTTd67hR-oLHM3eg \
  model.enpt.intgemm.alphas.bin lex.50.50.enpt.s2t.bin vocab.enpt.spm
# pt-en: o nome da pasta NÃO dá para adivinhar (eu tentei, e errei). Ele sai do
# `db/models.json` citado acima, que é o único registro vivo desde que o repo
# `mozilla/firefox-translations-models` morreu.
baixar_par pt-en retrain_hr_drxrs5bGSsOWvfK9lyZISw \
  model.pten.intgemm.alphas.bin lex.50.50.pten.s2t.bin vocab.pten.spm

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
  },
  "pten": {
    "model": { "name": "/bergamot/model.pten.intgemm.alphas.bin" },
    "lex":   { "name": "/bergamot/lex.50.50.pten.s2t.bin" },
    "vocab": { "name": "/bergamot/vocab.pten.spm" }
  }
}
JSON
echo "── pronto. Sirva bancada-navegador/ e use registryUrl=/bergamot/registry.json"
echo "   (pivotLanguage: null — senão ele tenta baixar en->en e falha)"
