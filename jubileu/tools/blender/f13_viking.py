"""
f13_viking.py — modela o viking de Vindhjem no Blender e exporta um GLB.

    blender -b -P tools/blender/f13_viking.py -- <pasta de texturas> <saida.glb> [preview.png]

Um só modelo serve a todos os moradores: corpo contínuo (modificador Skin +
subdivisão, sem juntas de cápsula), cabeça esculpida por deformação com
mandíbula articulada, olhos com íris, pálpebras, barba e cabelo em fios,
túnica com saia, cinto, capa com gola de pele, elmo, chifres e capuz. O jogo
liga/desliga as peças e tinge os tecidos por morador. O esqueleto tem nomes
em português porque é o código de Floor13Gente.tsx que o anima (procedural).

As texturas de tecido, couro, pele e metal são do Poly Haven (CC0).
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
TEX = argv[0] if argv else '/tmp/ph/tex'
SAIDA = argv[1] if len(argv) > 1 else '/tmp/ph/out/viking.glb'
PREVIA = argv[2] if len(argv) > 2 else ''
random.seed(13)

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene
colecao = cena.collection


# ── MATERIAIS ────────────────────────────────────────────────────────────────
def imagem(nome, cor=True):
    im = bpy.data.images.load(os.path.join(TEX, nome))
    if not cor: im.colorspace_settings.name = 'Non-Color'
    return im

def material(nome, base=None, cor=(1, 1, 1, 1), rug=.8, metal=0., escala=1.):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = cor
    b.inputs['Roughness'].default_value = rug
    b.inputs['Metallic'].default_value = metal
    if base:
        uv = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (escala, escala, 1)
        nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
        d = nt.nodes.new('ShaderNodeTexImage'); d.image = imagem(f'{base}_Diffuse.jpg')
        nt.links.new(mp.outputs['Vector'], d.inputs['Vector'])
        if cor != (1, 1, 1, 1):
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1
            nt.links.new(d.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = cor
            nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        else:
            nt.links.new(d.outputs['Color'], b.inputs['Base Color'])
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = imagem(f'{base}_nor_gl.jpg', False)
        nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        r = nt.nodes.new('ShaderNodeTexImage'); r.image = imagem(f'{base}_Rough.jpg', False)
        nt.links.new(mp.outputs['Vector'], r.inputs['Vector'])
        nt.links.new(r.outputs['Color'], b.inputs['Roughness'])
    return m

M = {
    'pele': material('pele', cor=(.80, .56, .44, 1), rug=.55),
    'tunica': material('tunica', 'linho', escala=3),
    'calca': material('calca', 'la', escala=3),
    'bota': material('bota', 'couro', cor=(.55, .42, .32, 1), escala=2),
    'couro': material('couro', 'couro', escala=2),
    'pelo': material('pelo', 'pelo', escala=2),
    'capa': material('capa', 'la', escala=2),
    'cabelo': material('cabelo', cor=(1, 1, 1, 1), rug=.6),
    'metal': material('metal', 'metal', rug=.45, metal=.85, escala=1.5),
    'chifre': material('chifre', cor=(.86, .8, .66, 1), rug=.5),
    'capuz': material('capuz', 'juta', escala=2),
    'labio': material('labio', cor=(.62, .34, .3, 1), rug=.45),
}
for nome, arq in [('olho_azul', 'olho_azul.png'), ('olho_castanho', 'olho_castanho.png')]:
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = .15
    t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = imagem(arq)
    m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    M[nome] = m


# ── ESQUELETO ────────────────────────────────────────────────────────────────
OSSOS = [
    ('quadril', (0, 0, .95), (0, 0, 1.1), None),
    ('coluna', (0, 0, 1.1), (0, 0, 1.3), 'quadril'),
    ('peito', (0, 0, 1.3), (0, 0, 1.5), 'coluna'),
    ('pescoco', (0, 0, 1.5), (0, -.01, 1.6), 'peito'),
    ('cabeca', (0, -.01, 1.6), (0, -.01, 1.84), 'pescoco'),
    ('mandibula', (0, 0, 1.655), (0, -.1, 1.6), 'cabeca'),
]
for lado, s in (('E', 1), ('D', -1)):
    OSSOS += [
        (f'ombro_{lado}', (s * .04, 0, 1.45), (s * .17, 0, 1.45), 'peito'),
        (f'braco_{lado}', (s * .17, 0, 1.45), (s * .27, .01, 1.19), f'ombro_{lado}'),
        (f'antebraco_{lado}', (s * .27, .01, 1.19), (s * .33, -.03, .95), f'braco_{lado}'),
        (f'mao_{lado}', (s * .33, -.03, .95), (s * .345, -.04, .85), f'antebraco_{lado}'),
        (f'coxa_{lado}', (s * .1, 0, .93), (s * .105, -.01, .52), 'quadril'),
        (f'canela_{lado}', (s * .105, -.01, .52), (s * .105, .02, .1), f'coxa_{lado}'),
        (f'pe_{lado}', (s * .105, .02, .1), (s * .105, -.12, .03), f'canela_{lado}'),
    ]
arm_d = bpy.data.armatures.new('esqueleto')
arm = bpy.data.objects.new('viking', arm_d); colecao.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for nome, a, b, pai in OSSOS:
    o = arm_d.edit_bones.new(nome); o.head = a; o.tail = b
    if pai: o.parent = arm_d.edit_bones[pai]; o.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')


def ligar(obj):
    colecao.objects.link(obj); return obj

def presa_ao_osso(obj, osso):
    """Peça rígida: filha do osso (vira nó filho da junta no glTF)."""
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = arm; obj.parent_type = 'BONE'; obj.parent_bone = osso
    bpy.context.view_layer.update()
    obj.matrix_world = mw

def pesos_manuais(obj, funcao):
    """funcao(co) -> {osso: peso}. Cria os grupos e o modificador de armadura."""
    for nome, *_ in OSSOS:
        if nome not in obj.vertex_groups: obj.vertex_groups.new(name=nome)
    for v in obj.data.vertices:
        pesos = funcao(obj.matrix_world @ v.co)
        tot = sum(pesos.values()) or 1
        for osso, p in pesos.items():
            if p > 0: obj.vertex_groups[osso].add([v.index], p / tot, 'REPLACE')
    obj.parent = arm
    md = obj.modifiers.new('arm', 'ARMATURE'); md.object = arm

def suave(obj):
    for p in obj.data.polygons: p.use_smooth = True

def aplicar(obj):
    bpy.context.view_layer.objects.active = obj
    for o in cena.objects: o.select_set(False)
    obj.select_set(True)
    for md in list(obj.modifiers):
        if md.type != 'ARMATURE': bpy.ops.object.modifier_apply(modifier=md.name)


# ── CORPO (Skin + subdivisão: uma malha só, sem emendas) ─────────────────────
V = []  # (pos, raio_x, raio_y)
E = []
def vert(p, rx, ry=None):
    V.append((Vector(p), rx, ry if ry is not None else rx)); return len(V) - 1
def cadeia(*ids):
    for a, b in zip(ids, ids[1:]): E.append((a, b))

q = vert((0, 0, .95), .18, .13)
c1 = vert((0, -.005, 1.07), .175, .13)
c2 = vert((0, 0, 1.2), .2, .14)
c3 = vert((0, .005, 1.35), .225, .145)
c4 = vert((0, .01, 1.45), .16, .11)
n1 = vert((0, 0, 1.52), .062, .06)
n2 = vert((0, -.005, 1.6), .048, .05)
cadeia(q, c1, c2, c3, c4, n1, n2)
for s in (1, -1):
    om = vert((s * .215, .01, 1.42), .085, .08)
    b1 = vert((s * .25, .01, 1.3), .07, .068)
    co = vert((s * .28, .01, 1.18), .055, .055)
    a1 = vert((s * .305, -.01, 1.07), .052, .048)
    pu = vert((s * .33, -.03, .965), .036, .03)
    ma = vert((s * .34, -.035, .9), .042, .022)
    de = vert((s * .345, -.045, .845), .034, .018)
    cadeia(c4, om, b1, co, a1, pu, ma, de)
    qd = vert((s * .1, 0, .9), .1, .1)
    cx = vert((s * .105, -.005, .72), .085, .085)
    jo = vert((s * .105, -.012, .52), .062, .064)
    pa = vert((s * .105, .01, .32), .06, .062)
    to = vert((s * .105, .02, .12), .055, .055)
    pe = vert((s * .105, -.07, .05), .058, .045)
    pt = vert((s * .105, -.15, .04), .048, .034)
    cadeia(q, qd, cx, jo, pa, to, pe, pt)

me = bpy.data.meshes.new('corpo')
me.from_pydata([v[0] for v in V], E, [])
corpo = ligar(bpy.data.objects.new('corpo', me))
sk = corpo.modifiers.new('skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = .6
for i, (_, rx, ry) in enumerate(V):
    corpo.data.skin_vertices[0].data[i].radius = (rx, ry)
corpo.data.skin_vertices[0].data[0].use_root = True
sub = corpo.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
aplicar(corpo)
suave(corpo)
# materiais por região
for m in ('tunica', 'calca', 'bota', 'pele'): corpo.data.materials.append(M[m])
ordem = {'tunica': 0, 'calca': 1, 'bota': 2, 'pele': 3}
for p in corpo.data.polygons:
    c = p.center
    if abs(c.x) > .31 and c.z < 1.0: r = 'pele'       # mãos
    elif c.z > 1.49: r = 'pele'                          # pescoço
    elif c.z < .36: r = 'bota'
    elif c.z < .9 and abs(c.x) < .22: r = 'calca'
    else: r = 'tunica'
    p.material_index = ordem[r]
bpy.context.view_layer.objects.active = corpo
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.cube_project(cube_size=.35)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
corpo.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# a mandíbula e a cabeça não pegam nada do corpo
for g in ('mandibula',):
    if g in corpo.vertex_groups: corpo.vertex_groups.remove(corpo.vertex_groups[g])


# ── CABEÇA esculpida por deformação ──────────────────────────────────────────
CENTRO = Vector((0, -.012, 1.695))
ESC = Vector((.098, .112, .125))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=30, radius=1)
def gauss(d2, s): return math.exp(-d2 / (2 * s * s))
for v in bm.verts:
    x, y, z = v.co
    frente = max(0., -y)
    # queixo e mandíbula: mais estreitos embaixo, maxilar marcado
    if z < -.15:
        k = (-.15 - z)
        x *= 1 - k * .42
        y *= 1 - k * .2
        if y < 0: y -= k * .12
    # nuca cheia, testa reta
    if z > .35 and y < 0: y *= 1 - (z - .35) * .25
    # arco das sobrancelhas
    y -= .085 * frente * gauss((z - .3) ** 2, .09) * (1 - .4 * abs(x))
    # órbitas
    for s in (1, -1):
        y += .07 * frente * gauss((x - s * .36) ** 2 + (z - .16) ** 2, .12)
    # maçãs do rosto
    for s in (1, -1):
        y -= .05 * frente * gauss((x - s * .5) ** 2 + (z + .02) ** 2, .14)
    # nariz: ponte e ponta
    y -= .34 * frente * gauss(x * x, .07) * gauss((z + .02) ** 2, .12) * (1 if z > -.26 else 0)
    y -= .12 * frente * gauss(x * x, .1) * gauss((z + .2) ** 2, .06)
    # boca: sulco entre os lábios
    y += .04 * frente * gauss(x * x, .2) * gauss((z + .42) ** 2, .025)
    v.co = Vector((x * ESC.x, y * ESC.y, z * ESC.z)) + CENTRO
# orelhas
cab = bpy.data.meshes.new('cabeca')
bm.to_mesh(cab); bm.free()
cabeca = ligar(bpy.data.objects.new('cabeca', cab))
sub = cabeca.modifiers.new('sub', 'SUBSURF'); sub.levels = 1
aplicar(cabeca); suave(cabeca)
cabeca.data.materials.append(M['pele']); cabeca.data.materials.append(M['labio'])
for p in cabeca.data.polygons:
    c = (p.center - CENTRO)
    if c.y < -.08 and abs(c.x) < .03 and -.058 < c.z < -.042: p.material_index = 1
def pesos_cabeca(co):
    c = co - CENTRO
    j = 0.
    if c.y < -.02:
        j = max(0., min(1., (-.045 - c.z) / .025)) * max(0., min(1., (-c.y - .02) / .04))
    return {'cabeca': 1 - j, 'mandibula': j}
pesos_manuais(cabeca, pesos_cabeca)
for s, lado in ((1, 'E'), (-1, 'D')):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=16, ring_count=12,
                                         location=CENTRO + Vector((s * .097, .005, .0)))
    o = bpy.context.object; o.name = f'orelha_{lado}'; o.scale = (.012, .028, .04)
    o.rotation_euler = (0, 0, s * -.35); o.data.materials.append(M['pele']); suave(o)
    presa_ao_osso(o, 'cabeca')

# olhos (esfera com o polo para a frente) e pálpebras
def olho(lado, s):
    p = CENTRO + Vector((s * .036, -.088, .02))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.0165, segments=24, ring_count=16, location=p)
    o = bpy.context.object; o.name = f'olho_{lado}'; o.rotation_euler = (-math.pi / 2, 0, 0)
    o.data.materials.append(M['olho_azul']); suave(o)
    presa_ao_osso(o, 'cabeca')
    # pálpebra superior: meia casca que gira para baixo no piscar
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=.0185)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < .002], context='VERTS')
    me = bpy.data.meshes.new(f'palpebra_{lado}'); bm.to_mesh(me); bm.free()
    pa = ligar(bpy.data.objects.new(f'palpebra_{lado}', me))
    pa.location = p; pa.rotation_euler = (-.55, 0, 0)
    pa.data.materials.append(M['pele']); suave(pa)
    presa_ao_osso(pa, 'cabeca')
    # sobrancelha: tubo curvo e peludo
    cu = bpy.data.curves.new(f'sobrancelha_{lado}', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    for i, (dx, dz) in enumerate(((-.02, -.004), (0, .004), (.022, 0))):
        bp = sp.bezier_points[i]; bp.co = p + Vector((s * dx, -.012, .028 + dz))
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.bevel_depth = .0045; cu.bevel_resolution = 2
    so = ligar(bpy.data.objects.new(f'sobrancelha_{lado}', cu))
    so.data.materials.append(M['cabelo'])
    bpy.context.view_layer.objects.active = so
    for o2 in cena.objects: o2.select_set(False)
    so.select_set(True); bpy.ops.object.convert(target='MESH')
    presa_ao_osso(bpy.context.object, 'cabeca')
olho('E', 1); olho('D', -1)


# ── FIOS: barba, bigode, cabelo ──────────────────────────────────────────────
def fios(nome, raizes, direcao, comp, largura, curva, osso, n_gomos=4):
    """Mechas: tubos afinados que caem e curvam, grossos o bastante para
    formar massa (barba cheia, cabelo com volume) em vez de espetos."""
    cu = bpy.data.curves.new(nome, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = largura; cu.bevel_resolution = 1; cu.resolution_u = 3
    for (r, n) in raizes:
        d = direcao(r, n).normalized()
        L = comp * random.uniform(.75, 1.25)
        sp = cu.splines.new('BEZIER'); sp.bezier_points.add(n_gomos - 1)
        for i in range(n_gomos):
            t = i / (n_gomos - 1)
            bp = sp.bezier_points[i]
            bp.co = r - n * .004 + d * L * t + Vector((0, 0, -curva * t * t))
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
            bp.radius = (1 - t * .85) * random.uniform(.8, 1.2)
    o = ligar(bpy.data.objects.new(nome, cu)); o.data.materials.append(M['cabelo'])
    for o2 in cena.objects: o2.select_set(False)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object; suave(o)
    presa_ao_osso(o, osso)
    return o

def pontos_na_cabeca(filtro, n):
    """Pontos sorteados na superfície da cabeça que passam no filtro."""
    malha = cabeca.data; saida = []
    polys = [p for p in malha.polygons if filtro(p.center - CENTRO)]
    for _ in range(n):
        p = random.choice(polys)
        saida.append((p.center.copy(), p.normal.copy()))
    return saida

barba_r = pontos_na_cabeca(lambda c: c.y < -.02 and c.z < -.035 and abs(c.x) < .09 and not (c.y < -.08 and c.z > -.065 and abs(c.x) < .035), 170)
fios('barba', barba_r, lambda r, n: (n * .35 + Vector((0, -.15, -1))), .13, .011, .02, 'mandibula')
bigode_r = pontos_na_cabeca(lambda c: c.y < -.09 and -.045 < c.z < -.028 and .004 < abs(c.x) < .035, 26)
fios('bigode', bigode_r, lambda r, n: Vector((math.copysign(1, r.x - CENTRO.x), -.3, -.7)), .05, .007, .012, 'cabeca')
# cabelo: só do alto da testa para trás, penteado para a nuca
cabelo_r = pontos_na_cabeca(lambda c: (c.z > .06 and c.y > -.06) or (c.z > .09) or (c.y > .02 and c.z > -.08), 220)
fios('cabelo', cabelo_r, lambda r, n: (n * .3 + Vector((0, .7, -.7))), .12, .014, .05, 'cabeca')
# tranças: cilindro afinado com torção, uma de cada lado
for s, lado in ((1, 'E'), (-1, 'D')):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.016, depth=.2,
                                        location=CENTRO + Vector((s * .085, .02, -.13)))
    o = bpy.context.object; o.name = f'tranca_{lado}'
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        t = (v.co.z + .1) / .2
        k = .6 + .4 * t
        a = v.co.z * 70
        v.co.x, v.co.y = (v.co.x * math.cos(a) - v.co.y * math.sin(a)) * k, (v.co.x * math.sin(a) + v.co.y * math.cos(a)) * k
    bm.to_mesh(o.data); bm.free()
    o.data.materials.append(M['cabelo']); suave(o)
    presa_ao_osso(o, 'cabeca')


# ── ROUPA ────────────────────────────────────────────────────────────────────
# saia da túnica: tronco de cone com barra ondulada, pesos pelas pernas
bm = bmesh.new()
aneis, seg = 7, 32
for i in range(aneis):
    t = i / (aneis - 1)
    z = 1.04 - t * .44
    rx, ry = .19 + t * .1, .14 + t * .08
    for j in range(seg):
        a = j / seg * math.tau
        onda = .012 * t * math.sin(a * 7 + 1.3)
        bm.verts.new((math.cos(a) * (rx + onda), math.sin(a) * (ry + onda), z - .015 * t * math.sin(a * 5)))
bm.verts.ensure_lookup_table()
for i in range(aneis - 1):
    for j in range(seg):
        a, b = i * seg + j, i * seg + (j + 1) % seg
        bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[b + seg], bm.verts[a + seg]))
me = bpy.data.meshes.new('saia'); bm.to_mesh(me); bm.free()
saia = ligar(bpy.data.objects.new('saia', me))
saia.modifiers.new('esp', 'SOLIDIFY').thickness = .008
aplicar(saia); suave(saia); saia.data.materials.append(M['tunica'])
bpy.context.view_layer.objects.active = saia
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.cylinder_project(); bpy.ops.object.mode_set(mode='OBJECT')
def pesos_saia(co):
    t = max(0., min(1., (1.04 - co.z) / .44))
    return {'quadril': 1 - t * .7, 'coxa_E': t * .7 * max(0., co.x) / .25, 'coxa_D': t * .7 * max(0., -co.x) / .25}
pesos_manuais(saia, pesos_saia)

# cinto com fivela
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=.09, major_segments=40, minor_segments=8, location=(0, 0, 1.0))
ci = bpy.context.object; ci.name = 'cinto'; ci.scale = (.185, .138, .2); ci.data.materials.append(M['couro'])
suave(ci); presa_ao_osso(ci, 'quadril')
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -.143, 1.0))
fv = bpy.context.object; fv.name = 'fivela'; fv.scale = (.035, .01, .03); fv.data.materials.append(M['metal'])
presa_ao_osso(fv, 'quadril')

# capa: lâmina curva nas costas, presa no peito, pesando para a coluna
bm = bmesh.new()
lin, col = 9, 12
for i in range(lin):
    t = i / (lin - 1)
    z = 1.47 - t * .9
    w = .26 + t * .1
    for j in range(col):
        u = j / (col - 1) * 2 - 1
        bm.verts.new((u * w, .15 + (1 - u * u) * .07 + t * .05 + .01 * math.sin(u * 9) * t, z))
bm.verts.ensure_lookup_table()
for i in range(lin - 1):
    for j in range(col - 1):
        a = i * col + j
        bm.faces.new((bm.verts[a], bm.verts[a + 1], bm.verts[a + col + 1], bm.verts[a + col]))
me = bpy.data.meshes.new('capa'); bm.to_mesh(me); bm.free()
capa = ligar(bpy.data.objects.new('capa', me))
capa.modifiers.new('esp', 'SOLIDIFY').thickness = .012
capa.modifiers.new('sub', 'SUBSURF').levels = 1
aplicar(capa); suave(capa); capa.data.materials.append(M['capa'])
bpy.context.view_layer.objects.active = capa
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.cube_project(cube_size=.5); bpy.ops.object.mode_set(mode='OBJECT')
def pesos_capa(co):
    t = max(0., min(1., (1.47 - co.z) / .9))
    return {'peito': 1 - t, 'coluna': t * .6, 'quadril': t * .4}
pesos_manuais(capa, pesos_capa)
# gola de pele
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=.35, major_segments=36, minor_segments=10, location=(0, .01, 1.47))
go = bpy.context.object; go.name = 'gola'; go.scale = (.2, .15, .12)
bm = bmesh.new(); bm.from_mesh(go.data)
for v in bm.verts:  # pele desgrenhada
    v.co += v.normal * random.uniform(-.06, .1)
bm.to_mesh(go.data); bm.free()
go.data.materials.append(M['pelo']); suave(go); presa_ao_osso(go, 'peito')

# elmo de chapas (spangenhelm): calota, aro, faixas e nasal
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=36, ring_count=18, location=CENTRO + Vector((0, .006, .03)))
el = bpy.context.object; el.name = 'elmo'
bm = bmesh.new(); bm.from_mesh(el.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.05], context='VERTS')
for v in bm.verts: v.co.z *= 1.08; v.co.z += max(0, v.co.z) ** 3 * .15  # ponta levemente ogival
bm.to_mesh(el.data); bm.free()
el.scale = (.108, .122, .125); el.modifiers.new('esp', 'SOLIDIFY').thickness = .06
aplicar(el); suave(el); el.data.materials.append(M['metal'])
bpy.context.view_layer.objects.active = el
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.sphere_project(); bpy.ops.object.mode_set(mode='OBJECT')
presa_ao_osso(el, 'cabeca')
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=.07, major_segments=40, minor_segments=8,
                                 location=CENTRO + Vector((0, .006, .026)))
ar = bpy.context.object; ar.name = 'elmo_aro'; ar.scale = (.111, .125, .13); ar.data.materials.append(M['metal'])
suave(ar); presa_ao_osso(ar, 'cabeca')
bpy.ops.mesh.primitive_cube_add(size=1, location=CENTRO + Vector((0, -.128, -.01)))
na = bpy.context.object; na.name = 'elmo_nasal'; na.scale = (.014, .008, .075); na.data.materials.append(M['metal'])
presa_ao_osso(na, 'cabeca')
# chifres curvos
for s, lado in ((1, 'E'), (-1, 'D')):
    cu = bpy.data.curves.new(f'chifre_{lado}', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    for i, off in enumerate(((.09, 0, .08), (.17, -.01, .13), (.19, -.05, .24))):
        bp = sp.bezier_points[i]; bp.co = CENTRO + Vector((s * off[0], off[1], off[2]))
        bp.handle_left_type = bp.handle_right_type = 'AUTO'; bp.radius = 1 - i * .45
    cu.bevel_depth = .03; cu.bevel_resolution = 4
    ch = ligar(bpy.data.objects.new(f'chifre_{lado}', cu)); ch.data.materials.append(M['chifre'])
    for o2 in cena.objects: o2.select_set(False)
    bpy.context.view_layer.objects.active = ch; ch.select_set(True); bpy.ops.object.convert(target='MESH')
    suave(bpy.context.object); presa_ao_osso(bpy.context.object, 'cabeca')
bpy.ops.object.select_all(action='DESELECT')
for o in cena.objects:
    if o.name.startswith('chifre_'): o.select_set(True); bpy.context.view_layer.objects.active = o
bpy.ops.object.join(); bpy.context.object.name = 'chifres'

# capuz do hóspede: casca aberta na frente, ponta caída para trás
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=36, ring_count=20, location=CENTRO + Vector((0, .01, .0)))
cz = bpy.context.object; cz.name = 'capuz'
bm = bmesh.new(); bm.from_mesh(cz.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -.35 and v.co.z < .55 and v.co.z > -.75], context='VERTS')
for v in bm.verts:
    if v.co.y > .3 and v.co.z > 0: v.co.y += (v.co.z ** 2) * .6; v.co.z -= v.co.y * .2
bm.to_mesh(cz.data); bm.free()
cz.scale = (.125, .14, .15); cz.modifiers.new('esp', 'SOLIDIFY').thickness = .08
cz.modifiers.new('sub', 'SUBSURF').levels = 1
aplicar(cz); suave(cz); cz.data.materials.append(M['capuz'])
bpy.context.view_layer.objects.active = cz
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.sphere_project(); bpy.ops.object.mode_set(mode='OBJECT')
presa_ao_osso(cz, 'cabeca')

# ── PRÉVIA E EXPORTAÇÃO ──────────────────────────────────────────────────────
if PREVIA:
    for n in ('capuz',): bpy.data.objects[n].hide_render = True
    cam = bpy.data.cameras.new('c'); cam.lens = 55
    co = bpy.data.objects.new('c', cam); colecao.objects.link(co); cena.camera = co
    co.location = (1.25, -2.6, 1.55); co.rotation_euler = (math.radians(86), 0, math.radians(26))
    w = bpy.data.worlds.new('w'); cena.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .6, .7, 1)
    sol = bpy.data.lights.new('s', 'SUN'); sol.energy = 3.5
    so = bpy.data.objects.new('s', sol); colecao.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(35))
    cena.render.engine = 'CYCLES'; cena.cycles.samples = 24
    cena.render.resolution_x, cena.render.resolution_y = 640, 800
    cena.view_settings.view_transform = 'AgX'
    tintas = {'tunica': (.55, .16, .12, 1), 'calca': (.3, .25, .2, 1), 'capa': (.18, .25, .38, 1), 'cabelo': (.55, .32, .14, 1), 'pelo': (.5, .4, .3, 1)}
    for nome, cor in tintas.items():
        b = M[nome].node_tree.nodes['Principled BSDF']
        for n in M[nome].node_tree.nodes:
            if n.type == 'TEX_IMAGE' and 'Diffuse' in n.image.name:
                mix = M[nome].node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
                M[nome].node_tree.links.new(n.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = cor
                M[nome].node_tree.links.new(mix.outputs[2], b.inputs['Base Color']); break
        else:
            b.inputs['Base Color'].default_value = cor
    cena.render.filepath = PREVIA
    bpy.ops.render.render(write_still=True)
    co.location = (.38, -.75, 1.72); co.rotation_euler = (math.radians(88), 0, math.radians(27))
    cena.render.filepath = PREVIA.replace('.png', '_rosto.png')
    bpy.ops.render.render(write_still=True)
    raise SystemExit  # a prévia tinge os materiais: não exporta dela
    for n in ('capuz',): bpy.data.objects[n].hide_render = False

for o in cena.objects: o.select_set(o.type in ('MESH', 'ARMATURE'))
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format='GLB', use_selection=True,
                          export_skins=True, export_animations=False, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=82, export_apply=False)
print('## ok', SAIDA)
