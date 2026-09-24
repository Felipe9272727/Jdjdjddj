"""
f13_bichos.py — cães e gatos de Vindhjem a partir do "Ultimate Animated
Animals" da Quaternius (CC0): Husky, ShibaInu e, para o gato, a Raposa (mesmo
esqueleto e mesmos clipes), remodelada aqui.

    blender -b -P tools/blender/f13_bichos.py -- entrada.gltf saida.glb COMPRIMENTO [gato] [cores.json]

• solda e uma subdivisão (formas redondas sem pesar: ~9 mil triângulos);
• materiais SIMPLES, só cor e rugosidade: a versão anterior ligava a cor por
  um nó Mix que o exportador glTF não entende, e todo material saía branco
  (o husky branco); a pelagem fina é aplicada no jogo (Floor13Vida.tsx);
• gato: focinho encurtado, cabeça mais redonda, orelhas menores, rabo fino;
• só os clipes usados: Walk, Idle, Gallop, Idle_2_HeadLow, Eating.
"""
import bpy, sys, json, mathutils

a = sys.argv[sys.argv.index('--') + 1:]
ENTRADA, SAIDA, COMP = a[0], a[1], float(a[2])
GATO = len(a) > 3 and a[3] == 'gato'
CORES = json.load(open(a[4])) if len(a) > 4 else {}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=ENTRADA)
c = bpy.context.scene
arm = [o for o in c.objects if o.type == 'ARMATURE'][0]
# só o que é do bicho: um add-on do Blender deixa uma icosfera solta na cena,
# que ia junto no GLB (uma bola de 2 m invisível para o recorte por câmera)
for o in list(c.objects):
    if o.type == 'MESH' and o.parent != arm: bpy.data.objects.remove(o)
ms = [o for o in c.objects if o.type == 'MESH']

def peso(o, v, nomes):
    t = 0.
    for g in v.groups:
        if any(o.vertex_groups[g.group].name.startswith(n) for n in nomes): t += g.weight
    return t

if GATO:
    # as posições dos ossos no espaço da malha (a malha e a armadura dividem a raiz)
    B = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
    for o in ms:
        toArm = arm.matrix_world.inverted() @ o.matrix_world
        fromArm = toArm.inverted()
        cab_h, cab_t = B['Head']
        eixo = (cab_t - cab_h).normalized()
        for v in o.data.vertices:
            p = toArm @ v.co
            wc = peso(o, v, ['Head'])
            if wc > .3 and peso(o, v, ['Ear']) < .2:
                # focinho: o que passa do meio da cabeça para a frente encolhe
                rel = p - cab_h
                frente = rel.dot(eixo)
                lim = (cab_t - cab_h).length * .15
                if frente > lim: p = p - eixo * (frente - lim) * .72 * wc
                # cabeça mais redonda: incha um pouco para os lados
                lado = rel - eixo * rel.dot(eixo)
                p = p + lado * .18 * wc
            we = peso(o, v, ['Ear'])
            if we > .3:
                base = min((B['Ear1.L'][0], B['Ear1.R'][0]), key=lambda b: (p - b).length)
                p = base + (p - base) * (1 - .5 * we)
            wt = peso(o, v, ['Tail'])
            if wt > .3:
                # rabo fino: cada vértice chega perto da linha do osso mais forte
                g = max(v.groups, key=lambda g: g.weight if o.vertex_groups[g.group].name.startswith('Tail') else -1)
                h, t = B[o.vertex_groups[g.group].name]
                d = t - h; k = max(0., min(1., (p - h).dot(d) / max(d.length_squared, 1e-6)))
                perto = h + d * k
                p = perto + (p - perto) * (1 - .6 * wt)
            v.co = fromArm @ p

bb = [o.matrix_world @ mathutils.Vector(v) for o in ms for v in o.bound_box]
comp = max(max(v[i] for v in bb) - min(v[i] for v in bb) for i in range(3))
raiz = arm
while raiz.parent: raiz = raiz.parent
raiz.scale = [s * COMP / comp for s in raiz.scale]

for o in ms:
    bpy.context.view_layer.objects.active = o
    for x in c.objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.0005)
    bpy.ops.uv.smart_project(island_margin=.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = 1
    while o.modifiers[0].name != 'sub': bpy.ops.object.modifier_move_up(modifier='sub')
    bpy.ops.object.modifier_apply(modifier='sub')
    for p in o.data.polygons: p.use_smooth = True
    for m in o.data.materials:
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        if m.name in CORES: b.inputs['Base Color'].default_value = (*CORES[m.name], 1)
        b.inputs['Roughness'].default_value = .3 if 'Eye' in m.name else .85

keep = {'Walk', 'Idle', 'Gallop', 'Idle_2_HeadLow', 'Eating'}
for ac in list(bpy.data.actions):
    if ac.name.split('_AnimalArmature')[0] not in keep: bpy.data.actions.remove(ac)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format='GLB', export_animations=True)
print('## ok', SAIDA)
