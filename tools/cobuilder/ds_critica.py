"""ds_critica.py — o DeepSeek OLHA imagens e critica. Uso: python3 ds_critica.py <prompt.txt> <img1> [img2 ...]
Chave em deepseek.env (CHAVES_DIR); nunca imprime a chave."""
import base64, json, os, re, sys, urllib.request
aqui = os.path.dirname(os.path.abspath(__file__))
txt = open(os.path.join(os.environ.get('CHAVES_DIR', aqui), 'deepseek.env')).read()
chave = os.environ.get('DEEPSEEK_API_KEY') or re.search(r'DEEPSEEK_API_KEY\s*=\s*["\']?([^"\'\s]+)', txt).group(1)
conteudo = [{'type': 'text', 'text': open(sys.argv[1]).read()}]
for f in sys.argv[2:]:
    conteudo.append({'type': 'image_url', 'image_url': {'url': ('data:image/jpeg;base64,' if f.endswith('.jpg') else 'data:image/png;base64,') + base64.b64encode(open(f, 'rb').read()).decode()}})
corpo = json.dumps({'model': os.environ.get('DS_MODEL', 'deepseek-flash'), 'messages': [
    {'role': 'system', 'content': 'Você é um diretor de arte e animador sênior de desenho animado (escola Fleischer/Cuphead). É exigente, direto e técnico. Responde em português.'},
    {'role': 'user', 'content': conteudo}], 'stream': True}).encode()
req = urllib.request.Request('https://api.deepseek.com/chat/completions', corpo, {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + chave})
# em streaming: a resposta chega aos pedaços e a conexão não fica parada (o proxy derrubava a espera longa)
try:
    with urllib.request.urlopen(req, timeout=900) as r:
        for linha in r:
            linha = linha.decode().strip()
            if not linha.startswith('data:') or linha.endswith('[DONE]'): continue
            j = json.loads(linha[5:])
            if 'choices' not in j: print('[resposta sem choices]', json.dumps(j)[:400], file=sys.stderr); continue
            d = j['choices'][0]['delta']
            if d.get('content'): print(d['content'], end='', flush=True)
    print()
except urllib.error.HTTPError as e:
    print('ERRO', e.code, e.read().decode()[:400])
