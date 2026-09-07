#!/usr/bin/env python3
"""
enxugar-glb.py — tira de um GLB as texturas que o jogo não lê.

── O QUE ESTE SCRIPT DESCOBRIU ──────────────────────────────────────────────

O `diabrete.glb` tem 3,01 MB. Destes, 2,87 MB são TEXTURA: três PNGs de
1024×1024 que o Tripo gerou junto com o modelo — basecolor, normal e
metallic-roughness. A malha em si são 3.433 vértices, sem skin e sem animação
(o rig do Andar 3 é pintado à mão, por posição de vértice, em diabreteRig.ts).

E o andar renderiza esse personagem em DOIS TONS CHAPADOS. O `buildDiabreteRig`
monta um MeshToonMaterial e leva só `map` — a cor base — que serve de entrada
para um limiar de posterização. O normal map e o metallic-roughness NUNCA são
lidos por ninguém: são 1,69 MB baixados, decodificados e enviados à GPU para
nada, num jogo cuja regra número um é não gastar o celular do dono.

A cor base fica, porque o limiar precisa dela — mas não em 1024×1024. Ela
alimenta uma comparação com um número; um oitavo da resolução dá o mesmo
resultado visual e um quarto do peso.

E O MESMO VALE PARA AS LUVAS. `cartoon_gloves.glb` são 1,72 MB, 92% textura,
três PNGs de 1024×1024 do mesmo gerador — e `Floor3Hands` lê só `std?.map`, para
o mesmíssimo limiar de dois tons (`materialDeLuva`). É o mesmo defeito no mesmo
lugar, e por isso este script deixou de ser do Diabrete e passou a receber o
caminho: quem gera modelo por IA entrega o pacote completo de PBR, e um jogo de
dois tons paga por ele sem usar.

Rodar: python3 ferramentas/enxugar-glb.py <caminho.glb> [--escrever]
Sem --escrever ele só relata, que é como um script que mexe em asset binário
deve começar.
"""
import io, json, os, struct, sys
from PIL import Image

ENTRADA = next((a for a in sys.argv[1:] if not a.startswith('--')), None)
if not ENTRADA:
    print(__doc__); raise SystemExit(2)
LADO_DA_COR = 256          # a cor base só alimenta um limiar de dois tons

def ler(caminho):
    d = open(caminho, 'rb').read()
    off, js, binario = 12, None, b''
    while off < len(d):
        clen, ctype = struct.unpack('<II', d[off:off + 8])
        pedaco = d[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A: js = json.loads(pedaco)
        else: binario = pedaco
        off += 8 + clen
    return js, binario

def escrever(caminho, js, binario):
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    bb = binario + b'\0' * ((4 - len(binario) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(caminho, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(bb), 0x004E4942)); f.write(bb)

def main():
    js, binario = ler(ENTRADA)
    bv = js['bufferViews']
    mat = js['materials'][0]

    # Quem sobrevive: só a textura de cor base, e encolhida.
    usada = mat.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index')
    if usada is None:
        print('sem baseColorTexture — nada a fazer'); return
    img_da_cor = js['textures'][usada]['source']

    relatorio = []
    for i, im in enumerate(js['images']):
        v = bv[im['bufferView']]
        n = v['byteLength']
        relatorio.append((im.get('name'), n, i == img_da_cor))
    for nome, n, fica in relatorio:
        print(f"  {'MANTÉM' if fica else 'REMOVE'}  {nome:42} {n/1e6:.2f} MB")

    # Reconstrói o binário com um bufferView só: a cor base reduzida.
    v = bv[js['images'][img_da_cor]['bufferView']]
    inicio = v.get('byteOffset', 0)
    png = binario[inicio:inicio + v['byteLength']]
    antes = Image.open(io.BytesIO(png))
    menor = antes.convert('RGB').resize((LADO_DA_COR, LADO_DA_COR), Image.LANCZOS)
    saida = io.BytesIO(); menor.save(saida, format='PNG', optimize=True)
    png_novo = saida.getvalue()
    print(f"  cor base {antes.size[0]}x{antes.size[1]} → {LADO_DA_COR}x{LADO_DA_COR}: "
          f"{len(png)/1e6:.2f} MB → {len(png_novo)/1e6:.3f} MB")

    # Os bufferViews da MALHA continuam iguais; só o da imagem muda de lugar.
    daMalha = [i for i, b in enumerate(bv) if i != js['images'][img_da_cor]['bufferView']
               and i not in {js['images'][k]['bufferView'] for k in range(len(js['images']))}]
    novoBin = bytearray()
    mapa = {}
    novosBV = []
    for i in daMalha:
        b = bv[i]
        ini = b.get('byteOffset', 0)
        dados = binario[ini:ini + b['byteLength']]
        while len(novoBin) % 4: novoBin.append(0)
        mapa[i] = len(novosBV)
        nb = dict(b); nb['byteOffset'] = len(novoBin)
        novosBV.append(nb); novoBin += dados
    while len(novoBin) % 4: novoBin.append(0)
    bvImagem = len(novosBV)
    novosBV.append({'buffer': 0, 'byteOffset': len(novoBin), 'byteLength': len(png_novo)})
    novoBin += png_novo

    for a in js['accessors']:
        if 'bufferView' in a: a['bufferView'] = mapa[a['bufferView']]
    js['bufferViews'] = novosBV
    js['buffers'] = [{'byteLength': len(novoBin)}]
    js['images'] = [{'name': js['images'][img_da_cor].get('name'),
                     'mimeType': 'image/png', 'bufferView': bvImagem}]
    js['textures'] = [{'source': 0, **({'sampler': js['textures'][usada]['sampler']}
                                       if 'sampler' in js['textures'][usada] else {})}]
    mat.pop('normalTexture', None)
    mat['pbrMetallicRoughness'] = {'baseColorTexture': {'index': 0}}

    if '--escrever' in sys.argv:
        antes_bytes = os.path.getsize(ENTRADA)
        escrever(ENTRADA, js, bytes(novoBin))
        depois = os.path.getsize(ENTRADA)
        print(f"\n  escrito: {antes_bytes/1e6:.2f} MB → {depois/1e6:.2f} MB "
              f"(−{100*(1-depois/antes_bytes):.0f}%)")
    else:
        print(f"\n  (ensaio — passe --escrever para gravar; ficaria "
              f"~{(len(novoBin) + len(json.dumps(js)))/1e6:.2f} MB)")

main()
