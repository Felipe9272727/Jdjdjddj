"""
f13_casa.py — a casa longa viking de Vindhjem, modelada no Blender.

    blender -b -P tools/blender/f13_casa.py -- <pasta de texturas> <saida.glb> [previa.png]

Casca da casa: embasamento de pedra, paredes de tábuas verticais (stave) com
as laterais levemente abauladas, postes de canto e vigas, telhado de turfa
com espessura, beiral e cumeeira curva, as tábuas de empena cruzadas com
cabeças de dragão, batente entalhado e janelinhas com postigo. A porta, a
runa, a chaminé e a fumaça ficam no jogo (Floor13Mundo.tsx), porque mudam
de casa para casa e a casa certa anima a porta. Medidas batem com as do
jogo: 3,4 m de largura (x), 5,6 m de fundo (z), frente em +z, vão da porta
de 1,1 × 1,65 m no centro da frente.
Texturas: Poly Haven (CC0).
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
TEX, SAIDA = argv[0], argv[1]
PREVIA = argv[2] if len(argv) > 2 else ''
random.seed(21)
bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

def img(nome, cor=True):
    i = bpy.data.images.load(os.path.join(TEX, nome), check_existing=True)
    if not cor: i.colorspace_settings.name = 'Non-Color'
    return i

def mat(nome, base, tinta=(1, 1, 1, 1), escala=1.):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    uv = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (escala, escala, 1); nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    d = nt.nodes.new('ShaderNodeTexImage'); d.image = img(f'{base}_Diffuse.jpg'); nt.links.new(mp.outputs['Vector'], d.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    nt.links.new(d.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = tinta
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = img(f'{base}_nor_gl.jpg', False); nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    r = nt.nodes.new('ShaderNodeTexImage'); r.image = img(f'{base}_Rough.jpg', False); nt.links.new(mp.outputs['Vector'], r.inputs['Vector'])
    nt.links.new(r.outputs['Color'], b.inputs['Roughness'])
    return m

M = {
    'tabua': mat('tabua', 'oak_wood_planks', (.62, .48, .36, 1), 1),
    'viga': mat('viga', 'brown_planks_05', (.42, .3, .22, 1), .6),
    'pedra': mat('pedra', 'rock_face_03', (1, 1, 1, 1), 1.5),
    'turfa': mat('turfa', 'leafy_grass', (.8, .95, .6, 1), 5),
    'terra': mat('terra', 'moss_wood', (.8, .75, .6, 1), 1.5),
}

objs = []
def ligar(me, nome, m):
    o = bpy.data.objects.new(nome, me); cena.collection.objects.link(o); o.data.materials.append(M[m]); objs.append(o); return o

def caixa(nome, m, c, s, rot=(0, 0, 0), bisel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c, rotation=rot)
    o = bpy.context.object; o.name = nome; o.scale = s
    bpy.ops.object.transform_apply(scale=True)
    if bisel:
        md = o.modifiers.new('b', 'BEVEL'); md.width = bisel; md.segments = 2
        bpy.ops.object.modifier_apply(modifier='b')
    o.data.materials.append(M[m]); objs.append(o)
    return o

def tora(nome, m, a, b, r):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.name = nome
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.data.materials.append(M[m]); objs.append(o)
    for p in o.data.polygons: p.use_smooth = True
    return o

W, L, H = 3.4, 5.6, 1.9          # largura (x), fundo (y no Blender = -z no jogo... ver exportação), altura da parede
# Blender: z para cima, y para trás. glTF (+Y up) converte y do Blender em -z do jogo.
# Queremos a FRENTE da casa em +z do jogo = -y do Blender.
FRENTE = -L / 2

# ── embasamento de pedras ────────────────────────────────────────────────────
for lado, (x0, y0, x1, y1) in enumerate([(-W/2, FRENTE, W/2, FRENTE), (W/2, FRENTE, W/2, -FRENTE), (W/2, -FRENTE, -W/2, -FRENTE), (-W/2, -FRENTE, -W/2, FRENTE)]):
    comp = math.hypot(x1 - x0, y1 - y0); n = int(comp / .38)
    for i in range(n):
        t = (i + .5) / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        if lado == 0 and abs(x) < .6: continue          # soleira livre na porta
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.22, location=(x, y, .08))
        o = bpy.context.object; o.name = 'pedra'
        o.scale = (random.uniform(.9, 1.3), random.uniform(.8, 1.1), random.uniform(.5, .75))
        bm = bmesh.new(); bm.from_mesh(o.data)
        for v in bm.verts: v.co *= random.uniform(.88, 1.1)
        bm.to_mesh(o.data); bm.free()
        for p in o.data.polygons: p.use_smooth = True
        o.data.materials.append(M['pedra']); objs.append(o)
caixa('soleira', 'pedra', (0, FRENTE - .05, .05), (1.25, .5, .12))

# ── paredes de tábuas verticais ──────────────────────────────────────────────
def parede_de_tabuas(x0, y0, x1, y1, abaulado=0., porta=False):
    comp = math.hypot(x1 - x0, y1 - y0); n = int(comp / .19)
    nx, ny = (y1 - y0) / comp, -(x1 - x0) / comp          # normal para fora
    for i in range(n):
        t = (i + .5) / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        s = math.sin(t * math.pi) * abaulado                 # parede lateral curva (casa em forma de barco)
        x += nx * s; y += ny * s
        if porta and abs(x) < .56:
            # acima do vão da porta: tábua curta
            h = H - 1.7
            caixa('tabua', 'tabua', (x, y, 1.7 + h / 2 + .1), (.18, .07, h), (0, 0, math.atan2(y1 - y0, x1 - x0)), .01)
            continue
        h = H + random.uniform(-.04, .04)
        caixa('tabua', 'tabua', (x + random.uniform(-.005, .005), y, .12 + h / 2), (.18, .07 + random.uniform(0, .02), h),
              (random.uniform(-.01, .01), 0, math.atan2(y1 - y0, x1 - x0)), .012)
parede_de_tabuas(-W/2, FRENTE, W/2, FRENTE, porta=True)
parede_de_tabuas(W/2, -FRENTE, -W/2, -FRENTE)
parede_de_tabuas(W/2, FRENTE, W/2, -FRENTE, .18)
parede_de_tabuas(-W/2, -FRENTE, -W/2, FRENTE, .18)

# postes de canto, soleira e frechal
for x in (-W/2, W/2):
    for y in (FRENTE, -FRENTE):
        tora('poste', 'viga', (x, y, 0), (x, y, H + .25), .11)
for y in (FRENTE, -FRENTE):
    tora('frechal', 'viga', (-W/2 - .15, y, H + .15), (W/2 + .15, y, H + .15), .08)
for x in (-W/2, W/2):
    tora('frechal', 'viga', (x, FRENTE - .1, H + .15), (x, -FRENTE + .1, H + .15), .08)

# batente entalhado da porta
for x in (-.6, .6):
    tora('batente', 'viga', (x, FRENTE - .06, .1), (x, FRENTE - .06, 1.78), .075)
caixa('verga', 'viga', (0, FRENTE - .07, 1.8), (1.45, .16, .16))
# anéis entalhados no batente
for x in (-.6, .6):
    for z in (.5, 1.0, 1.5):
        bpy.ops.mesh.primitive_torus_add(major_radius=.08, minor_radius=.018, location=(x, FRENTE - .06, z))
        o = bpy.context.object; o.data.materials.append(M['viga']); objs.append(o)

# janelinhas com postigo nas laterais
for x in (-W/2 - .12, W/2 + .12):
    for y in (-1.2, 1.2):
        caixa('janela', 'viga', (x, y, 1.35), (.06, .55, .45))
        caixa('postigo', 'tabua', (x + math.copysign(.05, x), y + .2, 1.35), (.04, .28, .42), (0, 0, math.copysign(.5, x)))

# ── telhado de turfa ─────────────────────────────────────────────────────────
def telhado(lado):
    """Uma água do telhado: placa com espessura, cumeeira que cede um pouco
    no meio (o peso da turfa) e beiral que avança além da parede."""
    bm = bmesh.new()
    nL, nW = 16, 6
    comp = L + .9
    vs = {}
    for i in range(nL + 1):
        y = -comp / 2 + comp * i / nL
        cede = .12 * math.sin(i / nL * math.pi)
        for j in range(nW + 1):
            u = j / nW
            x = lado * (.02 + u * (W / 2 + .55))
            z = (H + 1.65 - cede) - u * (1.65 + .1) + (1 - u) * 0
            for k, off in enumerate((0, -.26)):
                vs[(i, j, k)] = bm.verts.new((x, y, z + off))
    for i in range(nL):
        for j in range(nW):
            for k in range(2):
                q = [vs[(i, j, k)], vs[(i + 1, j, k)], vs[(i + 1, j + 1, k)], vs[(i, j + 1, k)]]
                bm.faces.new(q if (k == 0) == (lado > 0) else q[::-1])
    for i in range(nL):   # borda do beiral e da cumeeira
        for j in (0, nW):
            q = [vs[(i, j, 0)], vs[(i + 1, j, 0)], vs[(i + 1, j, 1)], vs[(i, j, 1)]]
            bm.faces.new(q)
    for i in (0, nL):
        for j in range(nW):
            bm.faces.new([vs[(i, j, 0)], vs[(i, j + 1, 0)], vs[(i, j + 1, 1)], vs[(i, j, 1)]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # turfa irregular: o topo ondula
    for (i, j, k), v in vs.items():
        if k == 0: v.co.z += random.uniform(-.03, .05)
    me = bpy.data.meshes.new('telhado'); bm.to_mesh(me); bm.free()
    o = ligar(me, 'telhado', 'turfa'); o.data.materials.append(M['terra'])
    for p in o.data.polygons:
        p.use_smooth = True
        p.material_index = 0 if p.normal.z > .3 else 1   # grama em cima, terra nas bordas e embaixo
    bpy.context.view_layer.objects.active = o
    for x in cena.objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=1.2); bpy.ops.object.mode_set(mode='OBJECT')
telhado(1); telhado(-1)

# empenas: triângulo de tábuas acima do frechal, frente e fundo
for y in (FRENTE, -FRENTE):
    for i in range(18):
        x = -W / 2 + (i + .5) * W / 18
        h = max(.05, (1 - abs(x) / (W / 2 + .55)) * 1.3)
        caixa('empena', 'tabua', (x, y, H + .22 + h / 2), (.19, .06, h), bisel=.008)

# tábuas de empena cruzadas terminando em cabeça de dragão
for y in (FRENTE - .12, -FRENTE + .12):
    for lado in (-1, 1):
        cu = bpy.data.curves.new('dragao', 'CURVE'); cu.dimensions = '3D'
        sp = cu.splines.new('BEZIER'); sp.bezier_points.add(3)
        pts = [(lado * (W / 2 + .5), y, H + .02), (lado * .2, y, H + 1.72), (-lado * .35, y, H + 2.3), (-lado * .5, y, H + 2.2)]
        for k, pt in enumerate(pts):
            bp = sp.bezier_points[k]; bp.co = pt; bp.handle_left_type = bp.handle_right_type = 'AUTO'
            bp.radius = 1 if k < 2 else 1.4 - (k - 2) * .6
        cu.bevel_depth = .07; cu.bevel_resolution = 2
        o = bpy.data.objects.new('dragao', cu); cena.collection.objects.link(o); o.data.materials.append(M['viga'])
        for x in cena.objects: x.select_set(False)
        bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH')
        o = bpy.context.object; objs.append(o)
        for p in o.data.polygons: p.use_smooth = True

# junta tudo por material numa malha só (poucas chamadas de desenho no jogo)
for x in cena.objects: x.select_set(False)
for o in objs:
    if o.name in bpy.data.objects: o.select_set(True)
bpy.context.view_layer.objects.active = objs[-1]
bpy.ops.object.join()
casa = bpy.context.object; casa.name = 'casa'
# UV das peças de madeira/pedra sem UV próprio
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT')
for i, m in enumerate(casa.data.materials):
    if m.name.startswith(('turfa', 'terra')): continue
    casa.active_material_index = i; bpy.ops.object.material_slot_select()
bpy.ops.uv.cube_project(cube_size=2.2); bpy.ops.object.mode_set(mode='OBJECT')

if PREVIA:
    cam = bpy.data.cameras.new('c'); cam.lens = 35
    co = bpy.data.objects.new('c', cam); cena.collection.objects.link(co); cena.camera = co
    co.location = (5.5, -8.5, 3.2); co.rotation_euler = (math.radians(78), 0, math.radians(33))
    sol = bpy.data.lights.new('s', 'SUN'); sol.energy = 3.5
    so = bpy.data.objects.new('s', sol); cena.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(40))
    w = bpy.data.worlds.new('w'); cena.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .65, .8, 1)
    cena.render.engine = 'CYCLES'; cena.cycles.samples = 24
    cena.render.resolution_x, cena.render.resolution_y = 800, 600
    cena.view_settings.view_transform = 'AgX'
    cena.render.filepath = PREVIA; bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format='GLB', use_selection=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=82)
print('## ok', len(casa.data.polygons), 'faces')
