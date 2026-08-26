#!/usr/bin/env python3
# ── DEVOLVER A CABEÇA DE MTP AO MODELO MESCLADO ──────────────────────────
#
#   python3 corpus/mtp-de-volta.py <base_hf_ou_caminho> <dir_mesclado>
#
# `PeftModel.merge_and_unload()` devolve só o tronco: os tensores da cabeça de
# predição multi-token (e os de visão, quando existem) ficam para trás. O
# config.json continua dizendo `mtp_num_hidden_layers: 1`, o conversor do
# llama.cpp soma essa camada ao block_count, e o gguf sai prometendo um bloco
# que não existe. `corpus/para-gguf.sh` conta a história inteira.
#
# Este script é o conserto nº 1: lê da BASE tudo que o mesclado não tem e
# escreve um arquivo só. Use quando o destino souber usar a cabeça de MTP. Para
# o jogo, `--no-mtp` na conversão é melhor — o wllama não faz decodificação
# especulativa e esses 15 tensores são peso morto no download do celular.
#
# ── POR QUE `.clone()` E NÃO O TENSOR DIRETO ─────────────────────────────
#
# `safe_open` usa mmap: o tensor devolvido é uma janela para o arquivo, e o
# arquivo fica aberto enquanto ela viver. Numa máquina com 2,6 GB livres eu
# apaguei os safetensors da base para abrir espaço e o `df` não se moveu um
# byte — o kernel só libera a área quando o último mapeamento fecha. Clonar
# traz os pesos para a RAM e desamarra o disco.
import json
import shutil
import sys
from pathlib import Path

import torch
from safetensors import safe_open
from safetensors.torch import save_file

BASE = Path(sys.argv[1])
MESCLADO = Path(sys.argv[2])


def carregar(pasta: Path) -> dict[str, torch.Tensor]:
    arquivos = sorted(pasta.glob('*.safetensors'))
    if not arquivos:
        sys.exit(f'nenhum .safetensors em {pasta}')
    pesos: dict[str, torch.Tensor] = {}
    for arq in arquivos:
        with safe_open(arq, framework='pt') as f:
            for nome in f.keys():
                pesos[nome] = f.get_tensor(nome).clone()
    return pesos


mesclado = carregar(MESCLADO)
print(f'  mesclado: {len(mesclado)} tensores', flush=True)

base = carregar(BASE)
faltando = {n: t for n, t in base.items() if n not in mesclado}
print(f'  base: {len(base)} tensores · faltando no mesclado: {len(faltando)}', flush=True)
for n in sorted(faltando):
    print(f'      {n}')
del base

if not faltando:
    print('  nada a devolver')
    sys.exit(0)

mesclado.update(faltando)

# Os pesos estão todos em RAM agora, então dá para apagar o arquivo antigo
# ANTES de escrever o novo. Em disco apertado isso é a diferença entre caber e
# não caber.
for arq in MESCLADO.glob('*.safetensors'):
    arq.unlink()
(MESCLADO / 'model.safetensors.index.json').unlink(missing_ok=True)

save_file(mesclado, MESCLADO / 'model.safetensors', metadata={'format': 'pt'})
mb = (MESCLADO / 'model.safetensors').stat().st_size / 1e6
print(f'\n  escrito: {len(mesclado)} tensores · {mb:.0f} MB', flush=True)

# O config.json tem que continuar anunciando a camada de MTP: é ele que faz o
# conversor esperar os tensores que acabamos de devolver.
cfg = json.loads((MESCLADO / 'config.json').read_text())
print(f"  mtp_num_hidden_layers: {cfg.get('mtp_num_hidden_layers')} "
      f"(precisa ser ≥ 1 para o conversor contar o bloco extra)")
