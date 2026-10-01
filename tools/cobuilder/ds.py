"""ds.py — pergunta ao DeepSeek. Uso: python3 ds.py <arquivo_prompt> [modelo]
Lê a chave de deepseek.env (nunca imprime a chave)."""
import json, os, sys, urllib.request

aqui = os.path.dirname(os.path.abspath(__file__))
chave = ''
for linha in ([f"DEEPSEEK_API_KEY={os.environ['DEEPSEEK_API_KEY']}"] if os.environ.get('DEEPSEEK_API_KEY') else open(os.path.join(os.environ.get('CHAVES_DIR', aqui), 'deepseek.env'))):
    if linha.startswith('DEEPSEEK_API_KEY='):
        chave = linha.split('=', 1)[1].strip().strip('"\'')
prompt = open(sys.argv[1]).read()
modelo = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('DS_MODEL', 'deepseek-flash')
corpo = json.dumps({'model': modelo, 'messages': [
    {'role': 'system', 'content': 'Você é um game designer sênior. Responda em português, com ideias concretas e implementáveis.'},
    {'role': 'user', 'content': prompt}]}).encode()
req = urllib.request.Request('https://api.deepseek.com/chat/completions', corpo,
    {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + chave})
try:
    r = json.load(urllib.request.urlopen(req, timeout=850))
    print(r['choices'][0]['message']['content'])
except urllib.error.HTTPError as e:
    print('ERRO', e.code, e.read().decode()[:500])
