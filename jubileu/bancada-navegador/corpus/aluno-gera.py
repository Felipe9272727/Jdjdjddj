"""O ALUNO ERRA PRIMEIRO — a metade que faltava para o treino ser on-policy.

Na destilação off-policy o aluno só vê caminhos perfeitos do professor, e nunca
aprende a sair de um lugar em que ele mesmo se meteu. É por isso que o revisor
treinado hoje decora: as 48 respostas que ele viu são todas impecáveis, e quando
a entrada real não bate com nenhuma ele encosta na mais parecida.

On-policy inverte: o ALUNO gera, e o professor corrige o que o aluno fez. A
distribuição de treino passa a ser a dos erros que ele comete de verdade.

Este script é a primeira metade — ele produz os erros. A segunda é
`destilar.mjs MODO=on-policy`, que manda cada um ao professor.

    MODELO=corpus/revisor-360m CASOS=corpus/casos.jsonl POR_CASO=2 \\
      python3 corpus/aluno-gera.py > corpus/aluno.jsonl
"""
import json
import os
import sys

from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODELO = os.environ.get('MODELO', 'corpus/revisor-360m')
CASOS = os.environ.get('CASOS', 'corpus/casos.jsonl')
POR_CASO = int(os.environ.get('POR_CASO', '2'))
TEMPERATURA = float(os.environ.get('TEMPERATURA', '0.9'))
TETO = int(os.environ.get('TETO', '48'))

# ── BASE + ADAPTADOR, SEM MESCLAR ────────────────────────────────────────
#
# Para gerar não é preciso mesclar: o PEFT carrega o LoRA por cima da base e
# responde igual. Isso economiza ~1,5 GB de disco, que é mais do que esta caixa
# tem sobrando — e a mesclagem fica para a hora de converter em gguf.
tok = AutoTokenizer.from_pretrained(MODELO)
if (Path(MODELO) / 'adapter_config.json').exists():
    from peft import PeftModel
    base = json.loads((Path(MODELO) / 'adapter_config.json').read_text())['base_model_name_or_path']
    modelo = PeftModel.from_pretrained(
        AutoModelForCausalLM.from_pretrained(base, dtype=torch.float32), MODELO)
    print(f'  base {base} + adaptador {MODELO}', file=sys.stderr)
else:
    modelo = AutoModelForCausalLM.from_pretrained(MODELO, dtype=torch.float32)
modelo.eval()

feitos = 0
for linha in open(CASOS, encoding='utf-8'):
    caso = json.loads(linha)
    # O caso traz as mesmas mensagens do treino MENOS a resposta: é exatamente
    # o que o jogo manda ao revisor na hora da fala.
    prompt = tok.apply_chat_template(caso['messages'], tokenize=False, add_generation_prompt=True)
    entrada = tok(prompt, return_tensors='pt')
    for _ in range(POR_CASO):
        with torch.no_grad():
            saida = modelo.generate(
                **entrada, max_new_tokens=TETO, do_sample=True,
                temperature=TEMPERATURA, top_p=0.95,
                pad_token_id=tok.eos_token_id,
            )
        texto = tok.decode(saida[0][entrada['input_ids'].shape[1]:], skip_special_tokens=True).strip()
        if not texto:
            continue
        print(json.dumps({'messages': caso['messages'], 'aluno': texto}, ensure_ascii=False))
        feitos += 1
    if feitos and feitos % 50 == 0:
        print(f'  {feitos} tentativas do aluno', file=sys.stderr)
print(f'\n  {feitos} tentativas do aluno geradas', file=sys.stderr)
