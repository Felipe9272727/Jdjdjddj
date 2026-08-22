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
# ── O TETO TEM QUE CABER O PENSAMENTO ────────────────────────────────────
#
# 48 tokens bastavam para um revisor que só escrevia a frase. Um aluno
# destilado escreve <think>…</think> ANTES dela, e 48 tokens acabam no meio do
# bloco: a prova sairia sem uma única resposta e o placar diria que o treino
# fracassou, quando o que faltou foi espaço.
TETO = int(os.environ.get('TETO', 200))

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

# ── ADAPTADOR OU PESOS COMPLETOS ─────────────────────────────────────────
#
# Com MESCLAR=0 o treino guarda só o LoRA, e a pasta não tem pesos: carregar
# ela como modelo devolve lixo ou erro. A presença de `adapter_config.json` diz
# qual é o caso, e o próprio arquivo diz de qual base ele saiu — não é preciso
# lembrar nem passar por variável.
DE_ADAPTADOR = (Path(MODELO) / 'adapter_config.json').exists()
DTIPO = torch.bfloat16 if torch.cuda.is_available() else torch.float32


def carregar(nome):
    # A família qwen3_5 se declara image-text-to-text no hub e nem toda versão
    # do transformers registra o alias de CausalLM para ela.
    try:
        return AutoModelForCausalLM.from_pretrained(nome, dtype=DTIPO)
    except (ValueError, KeyError):
        import transformers
        return getattr(transformers, 'AutoModelForMultimodalLM').from_pretrained(nome, dtype=DTIPO)


if DE_ADAPTADOR:
    cfg = json.loads((Path(MODELO) / 'adapter_config.json').read_text())
    base = cfg['base_model_name_or_path']
    print(f'  adaptador sobre {base}', flush=True)
    from peft import PeftModel
    tok = AutoTokenizer.from_pretrained(base)
    modelo = PeftModel.from_pretrained(carregar(base), MODELO)
    modelo = modelo.merge_and_unload()
else:
    tok = AutoTokenizer.from_pretrained(MODELO)
    modelo = carregar(MODELO)
modelo.eval()
if torch.cuda.is_available():
    modelo.cuda()

with SAIDAS.open('w', encoding='utf-8') as fora:
    for i, caso in enumerate(casos):
        msgs = [{'role': 'system', 'content': caso['sistema']}, {'role': 'user', 'content': caso['prompt']}]
        # `apply_chat_template(..., return_tensors='pt')` devolve um BatchEncoding nas
        # versões novas do transformers e um tensor nas antigas, e o `generate` só
        # aceita o tensor. Formatar e tokenizar em dois passos serve as duas.
        _texto = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        entrada = tok(_texto, return_tensors='pt', add_special_tokens=False)['input_ids'].to(modelo.device)
        with torch.no_grad():
            # Guloso, como no jogo para o remendo: conserto é escolha, não sorteio.
            saida = modelo.generate(entrada, max_new_tokens=TETO, do_sample=False,
                                    pad_token_id=tok.pad_token_id or tok.eos_token_id)
        bruto = tok.decode(saida[0][entrada.shape[-1]:], skip_special_tokens=True).strip()
        # ── O QUE VAI PARA A RÉGUA É O QUE O JOGO USARIA ─────────────────
        #
        # O jogo descarta o bloco de pensamento e fica com a primeira frase. Se
        # a prova mandar o bloco inteiro para o juiz, ele julga um texto que o
        # jogador nunca veria — e reprova o modelo por raciocinar, que foi
        # exatamente o buraco que zerou um candidato numa rodada anterior desta
        # caçada. A régua julga a FALA.
        fim = bruto.rfind('</think>')
        texto = (bruto[fim + 8:] if fim >= 0 else ('' if '<think>' in bruto else bruto)).strip()
        fora.write(json.dumps({'nome': caso['nome'], 'saida': texto, 'pensou': fim >= 0},
                              ensure_ascii=False) + '\n')
        print(f'  {i + 1:2}/{len(casos)}  {caso["nome"][:38]:38} {texto[:70]}', flush=True)
print(f'\n  → {SAIDAS}\n  agora: node corpus/julgar-saidas.mjs {SAIDAS}', flush=True)
