"""cobuilder.py — o DeepSeek como co-builder de verdade.

Uso: python3 cobuilder.py <tarefa.json>
tarefa.json:
  nome        : identificador curto (vira a worktree /tmp/ds-<nome> e o branch ds/<nome>)
  pedido      : o que fazer (direção do líder)
  arquivos    : arquivos (relativos a jubileu/) que ele PODE reescrever — vão inteiros no prompt
  contexto    : outros arquivos só para leitura (opcional)
  imagens     : capturas do jogo para ele VER (opcional)
  checklist   : {nome: pergunta} para o JEV (prefixo '!' = tem de valer no arquivo todo)
  tentativas  : padrão 4

Fluxo por tentativa: DeepSeek (texto + imagens) devolve os arquivos inteiros →
grava na worktree → tsc; erro volta para ele → compila → JEV julga → reprovado
volta com as notas. Aprovado: commit no branch ds/<nome>. Nunca imprime chaves.
"""
import base64, json, os, re, subprocess, sys, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
# chaves e logs: CHAVES_DIR (o scratchpad da sessão, com deepseek.env e rotear.sh); nunca no repo
CHAVES = os.environ.get('CHAVES_DIR', AQUI)
REPO = '/home/user/Jdjdjddj'
T = json.load(open(sys.argv[1]))
NOME = T['nome']
WT = f'/tmp/ds-{NOME}'
LOG = open(os.path.join(CHAVES, f'cb_{NOME}.log'), 'a')

def log(*a):
    print(*a, file=LOG, flush=True)

def sh(cmd, cwd=None, timeout=600):
    r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)

def chave(nome_arq, padrao):
    txt = open(os.path.join(CHAVES, nome_arq)).read()
    m = re.search(padrao, txt)
    return m.group(1) if m.groups() else m.group(0)

DS_KEY = os.environ.get('DEEPSEEK_API_KEY') or chave('deepseek.env', r'=\s*["\']?([^"\'\s]+)')

def deepseek(texto, imagens):
    conteudo = [{'type': 'text', 'text': texto}]
    for f in imagens:
        b = base64.b64encode(open(f, 'rb').read()).decode()
        conteudo.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + b}})
    corpo = json.dumps({'model': 'deepseek-flash', 'messages': [
        {'role': 'system', 'content': 'Você é co-builder sênior de um jogo React Three Fiber (TypeScript, celular). Escreve código completo, compilável, no estilo do projeto, em português nos nomes e comentários.'},
        {'role': 'user', 'content': conteudo}]}).encode()
    req = urllib.request.Request('https://api.deepseek.com/chat/completions', corpo,
                                 {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DS_KEY})
    return json.load(urllib.request.urlopen(req, timeout=900))['choices'][0]['message']['content']

def jev(resumo, codigo):
    k = os.environ.get('TYPESAFE_API_KEY') or chave('rotear.sh', r'(apikey_[A-Za-z0-9_]*)')
    itens = list(T['checklist'].items())[:8]
    perguntas = {n.lstrip('!'): {'type': 'score', 'instructions': q, 'criteria': ['não', 'em parte', 'sim']} for n, q in itens}
    notas = {}
    for i in range(0, max(1, len(codigo)), 9000):
        estado = f'PEDIDO: {resumo[:1500]}\n\nCÓDIGO ENTREGUE (trecho {i // 9000 + 1}):\n{codigo[i:i + 9000]}'
        r = subprocess.run(['python3', os.path.join(REPO, 'tools/jev-route.py')], input=json.dumps({'state': estado, 'questions': perguntas}),
                           capture_output=True, text=True, cwd=REPO, env={**os.environ, 'TYPESAFE_API_KEY': k}, timeout=300)
        try: resp = json.loads(r.stdout)['answers']
        except Exception: log('JEV falhou', r.stdout[:200]); continue
        for n, _ in itens:
            v = resp[n.lstrip('!')]['score']
            notas[n] = v if n not in notas else (min(notas[n], v) if n.startswith('!') else max(notas[n], v))
    return notas

def extrair(resp):
    """Blocos no formato: // ARQUIVO: caminho  seguido de ```tsx ... ```"""
    return re.findall(r'//\s*ARQUIVO:\s*(\S+)\s*\n```[a-z]*\n(.*?)\n```', resp, re.S)

# ── worktree própria ────────────────────────────────────────────────────────
if not os.path.exists(WT):
    sh(f'git worktree add -f -B ds/{NOME} {WT} HEAD', cwd=REPO)
    sh(f'ln -s {REPO}/jubileu/node_modules {WT}/jubileu/node_modules')
J = f'{WT}/jubileu'

def ler(p):
    return open(os.path.join(J, p)).read()

base = (T['pedido'] + '\n\nREGRAS QUE SERÃO CONFERIDAS:\n' + '\n'.join(f'- {q}' for q in T['checklist'].values())
        + '\n\nFORMATO DA RESPOSTA: para CADA arquivo que você mudar, escreva uma linha `// ARQUIVO: <caminho>` e logo abaixo o arquivo INTEIRO num bloco ```tsx (ou ```ts). Nada de trechos, nada de "resto igual". Só pode mudar: '
        + ', '.join(T['arquivos']) + '.\n')
imagens = T.get('imagens', [])
ret = ''
for t in range(T.get('tentativas', 4)):
    atuais = ''.join(f'\n--- {p} (ATUAL, pode reescrever) ---\n{ler(p)}' for p in T['arquivos'])
    ctx = ''.join(f'\n--- {p} (só leitura) ---\n{ler(p)}' for p in T.get('contexto', []))
    resp = deepseek(base + ret + atuais + ctx, imagens if t == 0 or not ret else imagens[:1])
    open(os.path.join(CHAVES, f'cb_{NOME}.t{t + 1}.md'), 'w').write(resp)
    blocos = extrair(resp)
    if not blocos:
        ret = '\n\nSUA RESPOSTA ANTERIOR NÃO TINHA NENHUM BLOCO `// ARQUIVO:`. Siga o formato.\n'; log(t + 1, 'sem blocos'); continue
    for caminho, codigo in blocos:
        caminho = caminho.replace('jubileu/', '')
        if caminho not in T['arquivos']: log('ignorado', caminho); continue
        open(os.path.join(J, caminho), 'w').write(codigo + '\n')
    rc, saida = sh('npx tsc --noEmit -p .', cwd=J)
    if rc != 0:
        erros = '\n'.join(saida.strip().splitlines()[:25])
        log(t + 1, 'tsc falhou:', erros[:500])
        ret = f'\n\nA TENTATIVA ANTERIOR NÃO COMPILOU (tsc). Os arquivos ATUAIS abaixo já têm a sua versão; corrija estes erros:\n{erros}\n'
        continue
    codigo = ''.join(ler(p) for p in T['arquivos'])
    # regras exatas por padrão (o JEV erra 'não faz X' olhando só um trecho)
    proibidos = [(n, rx) for n, rx in T.get('proibido', {}).items() if re.search(rx, codigo)]
    if proibidos:
        log(t + 1, 'proibido:', [n for n, _ in proibidos])
        ret = '\n\nA VERSÃO ATUAL VIOLA REGRAS PROIBIDAS: ' + ', '.join(n for n, _ in proibidos) + '. Remova isso sem perder o resto.\n'
        continue
    notas = jev(T['pedido'], codigo)
    falhas = {n: v for n, v in notas.items() if v < 1.6}
    log(t + 1, 'compila; JEV', json.dumps(notas))
    if not falhas:
        sh(f'git add -A jubileu/src && git commit -qm "ds/{NOME}: rascunho do co-builder DeepSeek (compila, aprovado pelo JEV)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DaoQWhb1G3Kxzx8pvbs6JT"', cwd=WT)
        log('APROVADO'); print('APROVADO', NOME); sys.exit(0)
    ret = '\n\nCOMPILOU, MAS O REVISOR REPROVOU ESTES PONTOS (os arquivos ATUAIS já têm a sua versão):\n' + '\n'.join(f'- {T["checklist"][n]} (nota {v:.2f}/2)' for n, v in falhas.items()) + '\n'
log('REPROVADO'); print('REPROVADO', NOME)
