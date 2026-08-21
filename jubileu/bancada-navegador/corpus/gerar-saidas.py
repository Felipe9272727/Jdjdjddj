# ── GERAR AS SAÍDAS DA PROVA COM O MODELO TREINADO ───────────────────────
#
# Roda no Colab (GPU) ou aqui (CPU). Não julga nada: só gera e grava. O
# julgamento é do `corpus/julgar-saidas.mjs`, que usa a MESMA régua do jogo.
#
#   MODELO=corpus/revisor-360m SAIDAS=saidas.jsonl python3 corpus/gerar-saidas.py
import json, os, subprocess, sys
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

AQUI = Path(__file__).parent
MODELO = os.environ.get('MODELO', str(AQUI / 'revisor-360m'))
SAIDAS = Path(os.environ.get('SAIDAS', AQUI / 'saidas.jsonl'))
TETO = int(os.environ.get('TETO', 48))

# A prova e o enunciado vêm do JS, que é onde eles moram. Um `node -e` evita
# manter uma segunda cópia da prova em Python — a duplicata é o defeito que
# esta bancada mais pagou caro.
casos = json.loads(subprocess.run(
    ['node', '-e', '''
    Promise.all([import('./prova.mjs'), import('./defeitos.mjs'), import('./corpus/enunciado.mjs')])
      .then(([p, d, e]) => {
        const linhas = [
          ...p.GRANDE.map((c) => ({ nome: c.nome, prompt: e.enunciado(c.q, c.f, c.porque), sistema: e.PERSONA })),
          ...d.CERTAS.map((c) => ({ nome: c.nome, prompt: e.enunciado(c.q, c.f, 'the judge flagged it, but check it against the canon and keep what is true.'), sistema: e.PERSONA })),
        ];
        console.log(JSON.stringify(linhas));
      });'''],
    cwd=AQUI.parent, capture_output=True, text=True, check=True).stdout)
print(f'  {len(casos)} casos (prova + controles) · modelo {MODELO}', flush=True)

# Um caminho local que não existe vira "repo do Hub" no transformers, e o erro
# que chega é um 401 do huggingface.co — que não tem nada a ver com o problema.
# `corpus/revisor-360m` tem uma barra, igual a `org/modelo` do Hub. O que
# separa os dois é o PAI existir aqui: se `corpus/` existe e o filho não,
# a intenção era local.
if not Path(MODELO).exists() and Path(MODELO).parent.exists() and str(Path(MODELO).parent) != '.':
    sys.exit(f'  não existe: {MODELO}\n  (treine antes: python3 corpus/treinar.py)')

tok = AutoTokenizer.from_pretrained(MODELO)
modelo = AutoModelForCausalLM.from_pretrained(
    MODELO, dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32)
modelo.eval()
if torch.cuda.is_available():
    modelo.cuda()

with SAIDAS.open('w', encoding='utf-8') as fora:
    for i, caso in enumerate(casos):
        msgs = [{'role': 'system', 'content': caso['sistema']}, {'role': 'user', 'content': caso['prompt']}]
        entrada = tok.apply_chat_template(msgs, return_tensors='pt', add_generation_prompt=True)
        entrada = entrada.to(modelo.device)
        with torch.no_grad():
            # Guloso, como no jogo para o remendo: conserto é escolha, não sorteio.
            saida = modelo.generate(entrada, max_new_tokens=TETO, do_sample=False,
                                    pad_token_id=tok.pad_token_id or tok.eos_token_id)
        texto = tok.decode(saida[0][entrada.shape[-1]:], skip_special_tokens=True).strip()
        fora.write(json.dumps({'nome': caso['nome'], 'saida': texto}, ensure_ascii=False) + '\n')
        print(f'  {i + 1:2}/{len(casos)}  {caso["nome"][:38]:38} {texto[:70]}', flush=True)
print(f'\n  → {SAIDAS}\n  agora: node corpus/julgar-saidas.mjs {SAIDAS}', flush=True)
