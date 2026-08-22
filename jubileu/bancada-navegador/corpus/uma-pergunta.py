# ── UMA PERGUNTA SÓ, PARA LER COM OS OLHOS ───────────────────────────────
#
# O placar diz se passou. Ele não diz COMO o modelo chegou lá, e num aluno
# destilado para raciocinar isso é metade do que interessa: o bloco de
# pensamento pode estar vazio, pode ser meta ("preciso escrever uma frase do
# Nilo"), pode ser longo demais para o aparelho, ou pode estar certo. As quatro
# coisas dão o mesmo ponto na régua.
#
# Por isso este script imprime a saída CRUA, com as tags, sem cortar nada — é o
# oposto do que a prova faz, e de propósito.
#
# O caso padrão não está no corpus nem na prova: ver o modelo numa entrada que
# ele nunca viu é o ponto. Dá para trocar por variável.
#
#   MODELO=corpus/revisor-v3 python3 corpus/uma-pergunta.py
import json, os, subprocess, time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

AQUI = Path(__file__).parent
MODELO = os.environ.get('MODELO', str(AQUI / 'revisor-v3'))
N = int(os.environ.get('N', 3))
TEMPERATURA = float(os.environ.get('TEMPERATURA', 0.7))
TETO = int(os.environ.get('TETO', 200))

PERGUNTA = os.environ.get(
    'PERGUNTA', 'How long has it been since anyone else came through here?')
ERRADA = os.environ.get(
    'ERRADA', 'Nilo checks his watch and tells you it has been three days since the last guest.')
MOTIVO = os.environ.get(
    'MOTIVO', 'it narrates him from outside instead of letting him speak, and he has no way to count days.')

# O enunciado e a persona vêm do JS, que é onde eles moram — a mesma decisão do
# `gerar-saidas.py`. Duplicar o enunciado em Python faria o teste medir um
# prompt que o jogo não usa.
sistema, prompt = json.loads(subprocess.run(
    ['node', '-e', f'''
    import('./corpus/enunciado.mjs').then((e) => {{
      console.log(JSON.stringify([e.PERSONA, e.enunciado(
        {json.dumps(PERGUNTA)}, {json.dumps(ERRADA)}, {json.dumps(MOTIVO)})]));
    }});'''],
    cwd=AQUI.parent, capture_output=True, text=True, check=True).stdout)

DE_ADAPTADOR = (Path(MODELO) / 'adapter_config.json').exists()
DTIPO = torch.bfloat16 if torch.cuda.is_available() else torch.float32


def carregar(nome):
    try:
        return AutoModelForCausalLM.from_pretrained(nome, dtype=DTIPO)
    except (ValueError, KeyError):
        import transformers
        return getattr(transformers, 'AutoModelForMultimodalLM').from_pretrained(nome, dtype=DTIPO)


if DE_ADAPTADOR:
    base = json.loads((Path(MODELO) / 'adapter_config.json').read_text())['base_model_name_or_path']
    from peft import PeftModel
    tok = AutoTokenizer.from_pretrained(base)
    modelo = PeftModel.from_pretrained(carregar(base), MODELO).merge_and_unload()
else:
    tok = AutoTokenizer.from_pretrained(MODELO)
    modelo = carregar(MODELO)
modelo.eval()
if torch.cuda.is_available():
    modelo.cuda()

msgs = [{'role': 'system', 'content': sistema}, {'role': 'user', 'content': prompt}]
# `apply_chat_template(..., return_tensors='pt')` devolve um BatchEncoding nas
# versões novas do transformers e um tensor nas antigas, e o `generate` só
# aceita o tensor. Formatar e tokenizar em dois passos serve as duas.
_texto = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
entrada = tok(_texto, return_tensors='pt', add_special_tokens=False)['input_ids'].to(modelo.device)

print('═' * 74)
print('  O QUE O MODELO RECEBE\n')
print(prompt)
print('═' * 74)


def uma(rotulo, **kw):
    t0 = time.time()
    with torch.no_grad():
        saida = modelo.generate(entrada, max_new_tokens=TETO,
                                pad_token_id=tok.pad_token_id or tok.eos_token_id, **kw)
    novos = saida[0][entrada.shape[-1]:]
    texto = tok.decode(novos, skip_special_tokens=True)
    gasto = time.time() - t0
    print(f'\n── {rotulo} · {len(novos)} tokens · {gasto:.1f}s · {len(novos) / gasto:.1f} tok/s')
    print(texto)
    # ── A CONTA QUE DECIDE SE ISTO SERVE NO APARELHO ─────────────────────
    #
    # Na GPU tudo é rápido e não quer dizer nada. O que vale é o número de
    # TOKENS: no aparelho do dono do jogo o revisor escreve a ~11,6 tok/s, e o
    # turno inteiro dele tem que caber em segundos. Um bloco de pensamento de
    # 100 tokens são 8,6 s só de raciocínio, antes da primeira palavra do Nilo.
    fim = texto.rfind('</think>')
    if fim >= 0:
        dentro = len(tok(texto[:fim], add_special_tokens=False)['input_ids'])
        print(f'   [pensamento: {dentro} tokens → ~{dentro / 11.6:.1f}s no aparelho]')
    else:
        print('   [SEM bloco de pensamento]')


uma('GULOSO (o que o jogo usa)', do_sample=False)
for i in range(N):
    uma(f'amostra {i + 1} · temperatura {TEMPERATURA}', do_sample=True,
        temperature=TEMPERATURA, top_p=0.95)
print('\n' + '═' * 74)
