"""Assa a oclusão ambiente do rosto do andar 12 com Cycles (path tracing).

Rodar (de dentro de jubileu/), depois de exportar a cabeça:
  npx tsx tools/blender/exportar-cabeca-para-bake.ts /tmp/cabeca.json
  python3 tools/blender/bake_concierge_ao.py /tmp/cabeca.json [--distancia 1.0] [--amostras 1024] [--foto /tmp/ao.png]

Funciona com o Blender instalado como módulo (pip install bpy) ou com
`blender -b --python ... -- args`. Coordenadas do Blender = X/Y/Z do jogo,
sem rotação, como em build_concierge.py.

Cada vértice do rosto dispara raios pelo hemisfério da própria normal; o
que bate no quepe, na arcada, no poço do olho ou no próprio rosto dentro de
`distancia` escurece o vértice. Sai um byte por vértice, na ordem da malha
do jogo, em src/f12ConciergeAO.ts.
"""
import argparse
import base64
import json
import sys
from pathlib import Path

import bpy
import addon_utils  # só existe depois de `import bpy` no módulo pip

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument('entrada')
ap.add_argument('--distancia', type=float, default=1.0)
ap.add_argument('--amostras', type=int, default=1024)
ap.add_argument('--saida', default=str(Path(__file__).resolve().parents[2] / 'src' / 'f12ConciergeAO.ts'))
ap.add_argument('--foto', default=None)
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('cycles', default_set=True, persistent=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = args.amostras
sc.world = bpy.data.worlds.new('mundo')
sc.world.light_settings.distance = args.distancia

dados = json.loads(Path(args.entrada).read_text())


def malha(nome, pos, idx, suave):
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(pos[i:i + 3]) for i in range(0, len(pos), 3)], [],
                   [tuple(idx[i:i + 3]) for i in range(0, len(idx), 3)])
    me.update()
    for p in me.polygons:
        p.use_smooth = suave
    ob = bpy.data.objects.new(nome, me)
    sc.collection.objects.link(ob)
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    me.materials.append(mat)
    return ob


rosto = malha('rosto', dados['receptor']['pos'], dados['receptor']['idx'], True)
n = len(rosto.data.vertices)
assert n * 3 == len(dados['receptor']['pos']), 'o Blender fundiu ou perdeu vértices do rosto'
for o in dados['oclusores']:
    malha(o['nome'], o['pos'], o['idx'], False)

ao = rosto.data.color_attributes.new(name='AO', type='FLOAT_COLOR', domain='POINT')
rosto.data.color_attributes.active_color = ao
bpy.ops.object.select_all(action='DESELECT')
rosto.select_set(True)
bpy.context.view_layer.objects.active = rosto
bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')

valores = [rosto.data.color_attributes['AO'].data[i].color[0] for i in range(n)]
bytes_ = bytes(max(0, min(255, round(v * 255))) for v in valores)
Path(args.saida).write_text(
    '/**\n'
    ' * Oclusão ambiente do rosto do andar 12, assada com Cycles (path tracing).\n'
    ' * Um byte por vértice, na ordem de `conciergeVertices`: 255 = céu aberto,\n'
    ' * 0 = fechado. Gerado por tools/blender/bake_concierge_ao.py — não editar\n'
    ' * à mão; se a malha do rosto mudar, rode o bake de novo.\n'
    ' */\n'
    f'export const CONCIERGE_AO_DISTANCIA = {args.distancia};\n'
    f"export const conciergeAO = '{base64.b64encode(bytes_).decode()}';\n")
media = sum(valores) / n
print(f'AO: {n} vértices, média {media:.3f}, mínimo {min(valores):.3f}, '
      f'distância {args.distancia}, {args.amostras} amostras -> {args.saida}')

if args.foto:
    # Só o rosto, com o AO como emissão pura: o que a bake enxergou, sem luz.
    for ob in sc.objects:
        ob.hide_render = ob is not rosto
    mat = rosto.data.materials[0]
    nos, fios = mat.node_tree.nodes, mat.node_tree.links
    nos.clear()
    attr = nos.new('ShaderNodeAttribute')
    attr.attribute_name = 'AO'
    emis = nos.new('ShaderNodeEmission')
    saida = nos.new('ShaderNodeOutputMaterial')
    fios.new(attr.outputs['Color'], emis.inputs['Color'])
    fios.new(emis.outputs['Emission'], saida.inputs['Surface'])
    cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    sc.collection.objects.link(cam)
    cam.location = (0, .3, 16)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 8.2
    sc.camera = cam
    sc.cycles.samples = 16
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x = sc.render.resolution_y = 420
    sc.render.filepath = args.foto
    bpy.ops.render.render(write_still=True)
    print('foto:', args.foto)
