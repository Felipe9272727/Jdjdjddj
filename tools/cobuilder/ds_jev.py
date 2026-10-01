"""ds_jev.py — o DeepSeek escreve, o JEV julga, o DeepSeek refaz até passar.

Uso: python3 ds_jev.py <tarefa.json> <saida.txt>
tarefa.json: {"pedido": "...", "contexto_arquivos": ["caminho", ...],
              "checklist": {"nome": "pergunta objetiva sobre a resposta", ...},
              "tentativas": 3}
Cada item da checklist vira uma pergunta de nota (não / em parte / sim) no JEV.
Passa quando todo item tem nota >= 1.6 (de 0 a 2). Nunca imprime chaves.
"""
import json, os, re, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = '/home/user/Jdjdjddj'
tarefa = json.load(open(sys.argv[1]))
saida = sys.argv[2]

def deepseek(prompt: str) -> str:
    arq = saida + '.prompt'
    open(arq, 'w').write(prompt)
    return subprocess.run(['python3', os.path.join(AQUI, 'ds.py'), arq], capture_output=True, text=True, timeout=900).stdout

def jev(resposta: str) -> dict:
    """Julga em pedaços (o JEV aceita 16 KB). Regra com '!' na frente do nome
    tem de valer em todos os pedaços (nota mínima); as outras basta aparecerem
    em algum (nota máxima)."""
    chave = os.environ.get('TYPESAFE_API_KEY') or re.search(r'apikey_[A-Za-z0-9_]*', open(os.path.join(os.environ.get('CHAVES_DIR', AQUI), 'rotear.sh')).read()).group(0)
    itens = list(tarefa['checklist'].items())[:8]
    perguntas = {n.lstrip('!'): {'type': 'score', 'instructions': q, 'criteria': ['não', 'em parte', 'sim']} for n, q in itens}
    pedacos = [resposta[i:i + 9000] for i in range(0, max(len(resposta), 1), 9000)]
    notas: dict = {}
    for k, pd in enumerate(pedacos):
        estado = (f'PEDIDO (resumo): {tarefa["pedido"][:1500]}\n\n'
                  f'RESPOSTA DO CO-BUILDER, parte {k + 1} de {len(pedacos)}:\n{pd}')
        r = subprocess.run(['python3', os.path.join(RAIZ, 'tools/jev-route.py')],
                           input=json.dumps({'state': estado, 'questions': perguntas}),
                           capture_output=True, text=True, cwd=RAIZ,
                           env={**os.environ, 'TYPESAFE_API_KEY': chave}, timeout=300)
        try: resp = json.loads(r.stdout)['answers']
        except Exception: print('JEV falhou:', r.stdout[:200], r.stderr[:200]); continue
        for n, _ in itens:
            v = resp[n.lstrip('!')]['score']
            ant = notas.get(n)
            notas[n] = v if ant is None else (min(ant, v) if n.startswith('!') else max(ant, v))
    return notas

ctx = ''
for c in tarefa.get('contexto_arquivos', []):
    ctx += f'\n--- {os.path.basename(c)} ---\n' + open(c).read()
base = tarefa['pedido'] + '\n\nREGRAS DE ENTREGA (serão conferidas uma a uma):\n' + \
    '\n'.join(f'- {q}' for q in tarefa['checklist'].values()) + '\n' + ctx
prompt, resposta, notas = base, '', {}
for t in range(tarefa.get('tentativas', 3)):
    resposta = deepseek(prompt)
    open(saida + f'.t{t + 1}', 'w').write(resposta)
    notas = jev(resposta)
    falhas = {n: v for n, v in notas.items() if v < 1.6}
    print(f'tentativa {t + 1}:', json.dumps(notas), flush=True)
    if not falhas:
        break
    prompt = (base + '\n\nSUA RESPOSTA ANTERIOR FOI REPROVADA NESTES PONTOS:\n' +
              '\n'.join(f'- {tarefa["checklist"][n]} (nota {v:.2f}/2)' for n, v in falhas.items()) +
              '\nCorrija esses pontos e devolva a resposta COMPLETA de novo.\n\n--- RESPOSTA ANTERIOR ---\n' + resposta)
open(saida, 'w').write(resposta)
print('APROVADO' if all(v >= 1.6 for v in notas.values()) else 'REPROVADO', '->', saida)
