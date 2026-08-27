#!/usr/bin/env python3
"""── ALINHAR O VOCABULÁRIO DE UM DRAFT AO DO ALVO ────────────────────────

O llama.cpp exige, para especular, que o draft e o alvo tenham vocabulários
IDÊNTICOS — token a token, do id 5 em diante (SPEC_VOCAB_CHECK_START_TOKEN_ID),
mais o mesmo `add_bos` e o mesmo `add_eos`.

SmolLM3-3B e qualquer Llama-3.2 compartilham 128.248 dos 128.256 tokens. Os
oito que diferem são todos `reserved_special_token_N` do Llama — casas que a
Meta deixou vagas e que a HuggingFace preencheu no SmolLM3:

    128002 <think>        128013 <tool_response>    128017 <code>
    128003 </think>       128014 </tool_response>   128018 </code>
    128011 <|im_start|>   128015 <tool_call>
    128012 <|im_end|>     128016 </tool_call>

Renomear casa vazia é inócuo por construção: aqueles ids nunca apareceram no
texto que o draft viu treinando, porque eram reservados. E na especulativa o
alvo confere cada token, então draft errado custa velocidade, nunca qualidade.

O `tokenizer.ggml.pre` também vai junto (`llama-bpe` → `smaug-bpe`): é dele que
sai o `add_bos`, e o llama.cpp comenta a regex do SMAUG como "same as llama3".

  python3 alinhar-draft.py <alvo.gguf> <draft.gguf> <saida.gguf>

CUIDADO COM O DISCO: a saída tem o tamanho do draft inteiro, e escrever sem
espaço TRUNCA em silêncio — o arquivo sai menor, o gguf fica ilegível, e o
sintoma no navegador é um `(ABORT)` sem texto. Perdi uma rodada assim.
"""
import os
import shutil
import sys

sys.path.insert(0, '/home/user/lcpp/gguf-py')
from gguf import GGUFReader, GGUFWriter, GGUFValueType

ALVO, DRAFT, SAIDA = sys.argv[1], sys.argv[2], sys.argv[3]

livre = shutil.disk_usage(os.path.dirname(os.path.abspath(SAIDA))).free
preciso = os.path.getsize(DRAFT)
if livre < preciso * 1.05:
    sys.exit(f'disco: {livre/1e9:.2f} GB livres para escrever {preciso/1e9:.2f} GB — abortando antes de truncar')

a = GGUFReader(ALVO)
fa = a.fields['tokenizer.ggml.tokens']
# `f.data` JÁ são os índices de `f.parts` — `parts[data[i]]` indexa duas vezes.
alvo_toks = [bytes(fa.parts[i].tolist()).decode('utf-8', 'replace') for i in fa.data]
e = a.fields['tokenizer.ggml.eos_token_id']
EOS = e.parts[e.data[0]].tolist()[0]
# `tokenizer.ggml.pre` só decide `add_bos` quando NÃO existe a chave explícita.
# Quando ela existe, ela ganha — e foi assim que a parede 4 voltou no draft de
# 200M: mesmo id de BOS (128000-128000), só a flag diferindo, `add: 0 - 1`.
FLAGS = {}
for chave in ('tokenizer.ggml.add_bos_token', 'tokenizer.ggml.add_eos_token'):
    if chave in a.fields:
        f = a.fields[chave]
        FLAGS[chave] = bool(f.parts[f.data[0]].tolist()[0])
print(f'  alvo: ' + (', '.join(f'{k.split(".")[-1]}={v}' for k, v in FLAGS.items()) or 'sem flags explícitas'))
del a

r = GGUFReader(DRAFT)
fd = r.fields['tokenizer.ggml.tokens']
draft_toks = [bytes(fd.parts[i].tolist()).decode('utf-8', 'replace') for i in fd.data]
dif = [i for i in range(5, min(len(alvo_toks), len(draft_toks))) if alvo_toks[i] != draft_toks[i]]
print(f'  {len(dif)} tokens diferentes: {dif}')

arqui = bytes(r.fields['general.architecture'].parts[r.fields['general.architecture'].data[0]].tolist()).decode()
w = GGUFWriter(SAIDA, arqui, use_temp_file=False)
for nome, f in r.fields.items():
    # `GGUF.*` são pseudo-campos do LEITOR; o escritor gera os três sozinho, e
    # copiá-los duplica a chave ("Duplicate GGUF.version at offset 69").
    if nome.startswith('GGUF.') or nome == 'general.architecture':
        continue
    tipo = f.types[0]
    if nome == 'tokenizer.ggml.tokens':
        t = list(draft_toks)
        for i in dif:
            t[i] = alvo_toks[i]
        w.add_array(nome, t)
    elif nome == 'tokenizer.ggml.eos_token_id':
        w.add_key_value(nome, EOS, tipo)
    elif nome == 'tokenizer.ggml.pre':
        w.add_string(nome, 'smaug-bpe')
    elif nome in ('tokenizer.ggml.add_bos_token', 'tokenizer.ggml.add_eos_token'):
        # Sem a chave no alvo, quem manda é o `smaug-bpe` acima: add_bos falso.
        w.add_bool(nome, FLAGS.get(nome, False))
    elif tipo == GGUFValueType.ARRAY:
        sub = f.types[1]
        w.add_array(nome, [bytes(f.parts[i].tolist()).decode('utf-8', 'replace') for i in f.data]
                    if sub == GGUFValueType.STRING else [f.parts[i].tolist()[0] for i in f.data])
    elif tipo == GGUFValueType.STRING:
        w.add_string(nome, bytes(f.parts[f.data[0]].tolist()).decode('utf-8', 'replace'))
    else:
        w.add_key_value(nome, f.parts[f.data[0]].tolist()[0], tipo)
for t in r.tensors:
    w.add_tensor(t.name, t.data, raw_dtype=t.tensor_type)
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
del r

saiu, entrou = os.path.getsize(SAIDA), os.path.getsize(DRAFT)
print(f'  {saiu:,} bytes (entrada {entrou:,})')
if saiu < entrou * 0.95:
    sys.exit('  TRUNCADO — o arquivo saiu menor que a entrada')
v = GGUFReader(SAIDA)
fv = v.fields['tokenizer.ggml.tokens']
print('  confere:', {i: bytes(fv.parts[fv.data[i]].tolist()).decode() for i in dif[:4]})
for chave, esperado in FLAGS.items():
    if chave in v.fields:
        fv2 = v.fields[chave]
        virou = bool(fv2.parts[fv2.data[0]].tolist()[0])
        print(f'  {chave.split(".")[-1]}: {virou}' + ('' if virou == esperado else f'  ✗ ESPERAVA {esperado}'))
print('  tensores:', len(v.tensors))
