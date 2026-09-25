"""
f13_humano.py — gera um morador de Vindhjem com o MPFB (MakeHuman para
Blender) e exporta um GLB com esqueleto de jogo.

    blender -b -P tools/blender/f13_humano.py -- <config.json> <saida.glb> [previa.png]

O corpo, a pele, os olhos, as sobrancelhas, os cílios e o cabelo vêm dos
pacotes CC0 do MakeHuman (makehuman_system_assets, hair01, shirts01,
pants01, shoes01). Por cima entram as peças vikings feitas aqui: túnica de
linho, cinto, capa com gola de pele, elmo, chifres, barba em mechas e capuz —
com texturas do Poly Haven (CC0).
"""
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
CONF = json.load(open(argv[0]))
SAIDA = argv[1]
PREVIA = argv[2] if len(argv) > 2 else ''
TEX = CONF.get('texturas', '/tmp/ph/tex')
random.seed(CONF.get('semente', 13))

from bl_ext.user_default.mpfb.services.humanservice import HumanService

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

info = HumanService._create_default_human_info_dict()
info['phenotype'].update(CONF['fenotipo'])
info['phenotype']['race'] = CONF.get('raca', {'caucasian': 1., 'asian': 0., 'african': 0.})
info['rig'] = 'game_engine'
info['eyes'] = 'low-poly/low-poly.mhclo'
info['eyebrows'] = CONF.get('sobrancelha', 'eyebrow001') + '/' + CONF.get('sobrancelha', 'eyebrow001') + '.mhclo'
info['eyelashes'] = 'eyelashes01/eyelashes01.mhclo'
info['teeth'] = 'teeth_base/teeth_base.mhclo'
info['tongue'] = 'tongue01/tongue01.mhclo'
if CONF.get('cabelo'):
    info['hair'] = CONF['cabelo'] + '/' + CONF['cabelo'] + '.mhclo'
info['proxy'] = CONF.get('proxy', 'male_generic') + '/' + CONF.get('proxy', 'male_generic') + '.proxy'
info['skin_mhmat'] = CONF.get('pele', 'middleage_caucasian_male') + '/' + CONF.get('pele', 'middleage_caucasian_male') + '.mhmat'
info['skin_material_type'] = 'MAKESKIN'
info['eyes_material_type'] = 'MAKESKIN'
info['clothes'] = [c + '/' + c + '.mhclo' for c in CONF.get('roupas', [])]
# o rosto de cada um: alvos de nariz, queixo, boca, olhos, orelhas, testa…
# do MPFB ({"nose-hump-incr": .6, …}) — sem isto todos saíam com a mesma cara
info['targets'] = [{'target': k, 'value': float(v)} for k, v in CONF.get('rosto', {}).items()]
ajustes = HumanService.get_default_deserialization_settings()
ajustes['subdiv_levels'] = 0
ajustes['override_skin_model'] = 'MAKESKIN'
corpo = HumanService.deserialize_from_dict(info, ajustes)

objs = {o.name: o for o in cena.objects}
print('## objetos', sorted(objs))
arm = next(o for o in cena.objects if o.type == 'ARMATURE')
print('## ossos', [b.name for b in arm.data.bones][:80])


# ── MATERIAIS VIKINGS ────────────────────────────────────────────────────────
def imagem(nome, cor=True):
    im = bpy.data.images.load(os.path.join(TEX, nome), check_existing=True)
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
        nt.links.new(mp.outputs['Vector'], d.inputs['Vector']); nt.links.new(d.outputs['Color'], b.inputs['Base Color'])
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = imagem(f'{base}_nor_gl.jpg', False)
        nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        r = nt.nodes.new('ShaderNodeTexImage'); r.image = imagem(f'{base}_Rough.jpg', False)
        nt.links.new(mp.outputs['Vector'], r.inputs['Vector']); nt.links.new(r.outputs['Color'], b.inputs['Roughness'])
    return m

M = {
    'tunica': material('tunica', 'linho', escala=4),
    'calca': material('calca', 'la', escala=4),
    'bota': material('bota', 'couro', escala=3),
    'couro': material('couro', 'couro', escala=2),
    'capa': material('capa', 'la', escala=3),
    'pelo': material('pelo', 'pelo', escala=2),
    'metal': material('metal', 'aco', rug=.4, metal=.9, escala=1.5),
    'chifre': material('chifre', cor=(.86, .8, .66, 1), rug=.5),
    'capuz': material('capuz', 'juta', escala=2),
    'barba': material('barba', cor=(.35, .2, .1, 1), rug=.55),
}

def trocar(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)

for o in list(cena.objects):
    if o.type != 'MESH': continue
    if 'sweater' in o.name or 't-shirt' in o.name or 'shirt' in o.name: trocar(o, M['tunica']); o.name = 'tunica'
    elif 'pants' in o.name: trocar(o, M['calca']); o.name = 'calca'
    elif 'boots' in o.name or 'shoes' in o.name: trocar(o, M['bota']); o.name = 'botas'
    elif 'beard' in o.name: o.name = 'barba'
    elif 'moustache' in o.name: o.name = 'bigode'
    elif 'helmet' in o.name: o.name = 'elmo'

corpo_px = next(o for o in cena.objects if o.type == 'MESH' and o.name.startswith('Human.') and o.name.split('.')[1] in ('male_generic', 'female_generic', 'proxy741', 'male1591', 'female1605'))
corpo_px.name = 'corpo'
for o in list(cena.objects):
    if o.type != 'MESH': continue
    n = o.name
    if n.endswith('low-poly'): o.name = 'olhos'
    elif 'eyebrow' in n: o.name = 'sobrancelhas'
    elif 'eyelash' in n: o.name = 'cilios'
    elif n.startswith('Human.') and CONF.get('cabelo') and CONF['cabelo'] in n: o.name = 'cabelo'
arm.name = 'viking'

def osso_mundo(nome):
    b = arm.data.bones[nome]
    return arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local

def ligar(obj):
    cena.collection.objects.link(obj); return obj

def presa_ao_osso(obj, osso):
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = arm; obj.parent_type = 'BONE'; obj.parent_bone = osso
    bpy.context.view_layer.update()
    obj.matrix_world = mw

def suave(obj):
    for p in obj.data.polygons: p.use_smooth = True

def aplicar(obj):
    bpy.context.view_layer.objects.active = obj
    for o in cena.objects: o.select_set(False)
    obj.select_set(True)
    for md in list(obj.modifiers):
        if md.type != 'ARMATURE': bpy.ops.object.modifier_apply(modifier=md.name)

def pesos_manuais(obj, funcao):
    for v in obj.data.vertices:
        pesos = funcao(obj.matrix_world @ v.co)
        tot = sum(pesos.values()) or 1
        for osso, p in pesos.items():
            if p <= 0: continue
            g = obj.vertex_groups.get(osso) or obj.vertex_groups.new(name=osso)
            g.add([v.index], p / tot, 'REPLACE')
    obj.parent = arm
    md = obj.modifiers.new('arm', 'ARMATURE'); md.object = arm

def uv(obj, tipo='cube', tam=.4):
    bpy.context.view_layer.objects.active = obj
    for o in cena.objects: o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    if tipo == 'cube': bpy.ops.uv.cube_project(cube_size=tam)
    elif tipo == 'cil': bpy.ops.uv.cylinder_project()
    else: bpy.ops.uv.sphere_project()
    bpy.ops.object.mode_set(mode='OBJECT')

# ── a pele não atravessa a roupa: some o corpo que o pano cobre ───────────
# (um raio da face para fora que bate num pano a menos de 7 cm = face
# coberta, que nunca aparece e só serve para furar o tecido ao dobrar)
from mathutils.bvhtree import BVHTree
dg = bpy.context.evaluated_depsgraph_get()
panos = [BVHTree.FromObject(o, dg) for o in cena.objects if o.type == 'MESH' and o.name in ('tunica', 'calca', 'botas')]
mw = corpo_px.matrix_world; n3 = mw.to_3x3()
cobertas = []
for p_ in corpo_px.data.polygons:
    c = mw @ p_.center; n = (n3 @ p_.normal).normalized()
    for arv in panos:
        if arv.ray_cast(c - n * .005, n, .07)[0] is not None and arv.ray_cast(c - n * .005, -n, .03)[0] is None:
            cobertas.append(p_.index); break
bm = bmesh.new(); bm.from_mesh(corpo_px.data); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in cobertas], context='FACES_ONLY')
bm.to_mesh(corpo_px.data); bm.free()
print('## faces cobertas apagadas', len(cobertas))

# medidas do corpo gerado
pelve, _ = osso_mundo('pelvis')
cab0, cab1 = osso_mundo('head')
pesc, _ = osso_mundo('neck_01')
peito, _ = osso_mundo('spine_03')
coxaE, joelhoE = osso_mundo('thigh_l')
vs = [corpo_px.matrix_world @ v.co for v in corpo_px.data.vertices]
def largura_em(z, faixa=.03):
    fat = [v for v in vs if abs(v.z - z) < faixa and abs(v.x) < .2]
    return (max(v.x for v in fat) - min(v.x for v in fat)) / 2, (max(v.y for v in fat) - min(v.y for v in fat)) / 2, sum(v.y for v in fat) / len(fat)
cabeca_pts = [v for v in vs if v.z > pesc.z + .02]
topo = max(v.z for v in cabeca_pts)
cx = sum(v.x for v in cabeca_pts) / len(cabeca_pts); cy = sum(v.y for v in cabeca_pts) / len(cabeca_pts)
frente_y = min(v.y for v in cabeca_pts)
print('## medidas', pelve, cab0, topo, frente_y)

# ── saia da túnica: do quadril a meia coxa ───────────────────────────────────
z0 = pelve.z + .1; z1 = z0 - CONF.get('saia', .36) - .06
rx0, ry0, cy0 = largura_em(z0)
bm = bmesh.new(); aneis, seg = 7, 36
for i in range(aneis):
    t = i / (aneis - 1)
    z = z0 - t * (z0 - z1)
    rx, ry = rx0 + .025 + t * .1, ry0 + .03 + t * .07
    for j in range(seg):
        a = j / seg * math.tau
        onda = .01 * t * math.sin(a * 7 + 1.3)
        bm.verts.new((math.cos(a) * (rx + onda), cy0 + math.sin(a) * (ry + onda), z - .012 * t * math.sin(a * 5)))
bm.verts.ensure_lookup_table()
for i in range(aneis - 1):
    for j in range(seg):
        a_, b_ = i * seg + j, i * seg + (j + 1) % seg
        bm.faces.new((bm.verts[a_], bm.verts[b_], bm.verts[b_ + seg], bm.verts[a_ + seg]))
me = bpy.data.meshes.new('saia'); bm.to_mesh(me); bm.free()
saia = ligar(bpy.data.objects.new('saia', me))
saia.modifiers.new('esp', 'SOLIDIFY').thickness = .008
aplicar(saia); suave(saia); saia.data.materials.append(M['tunica']); uv(saia, 'cube', .5)
def pesos_saia(co):
    t = max(0., min(1., (z0 - co.z) / .36))
    return {'pelvis': 1 - t * .75, 'thigh_l': t * .75 * max(0., co.x) / .2, 'thigh_r': t * .75 * max(0., -co.x) / .2}
pesos_manuais(saia, pesos_saia)

# ── cinto largo com fivela ──────────────────────────────────────────────────
rxc, ryc, cyc = largura_em(z0)
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1, depth=1, location=(0, cyc, z0))
ci = bpy.context.object; ci.name = 'cinto'; ci.scale = (rxc + .035, ryc + .038, .055)
bm = bmesh.new(); bm.from_mesh(ci.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > .9], context='FACES')
bm.to_mesh(ci.data); bm.free()
ci.modifiers.new('esp', 'SOLIDIFY').thickness = .01
aplicar(ci); suave(ci); ci.data.materials.append(M['couro']); uv(ci, 'cube', .3)
presa_ao_osso(ci, 'pelvis')
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, cyc - ryc - .045, z0))
fv = bpy.context.object; fv.name = 'fivela'; fv.scale = (.05, .012, .045); fv.data.materials.append(M['metal'])
presa_ao_osso(fv, 'pelvis')

# ── capa com gola de pele ───────────────────────────────────────────────────
zc = peito.z + .12
rxp, ryp, cyp = largura_em(zc - .05)
bm = bmesh.new(); lin, col = 10, 14
for i in range(lin):
    t = i / (lin - 1)
    z = zc - t * (zc - (joelhoE.z + .05))
    w = rxp + .02 + t * .1
    for j in range(col):
        u = j / (col - 1) * 2 - 1
        bm.verts.new((u * w, cyp + ryp + .03 + (1 - u * u) * .06 + t * .06 + .012 * math.sin(u * 9) * t, z))
bm.verts.ensure_lookup_table()
for i in range(lin - 1):
    for j in range(col - 1):
        k = i * col + j
        bm.faces.new((bm.verts[k], bm.verts[k + 1], bm.verts[k + col + 1], bm.verts[k + col]))
me = bpy.data.meshes.new('capa'); bm.to_mesh(me); bm.free()
capa = ligar(bpy.data.objects.new('capa', me))
capa.modifiers.new('esp', 'SOLIDIFY').thickness = .012
capa.modifiers.new('sub', 'SUBSURF').levels = 1
aplicar(capa); suave(capa); capa.data.materials.append(M['capa']); uv(capa, 'cube', .6)
def pesos_capa(co):
    t = max(0., min(1., (zc - co.z) / (zc - joelhoE.z)))
    return {'spine_03': 1 - t, 'spine_02': t * .5, 'pelvis': t * .5}
pesos_manuais(capa, pesos_capa)
# gola: anel de pele assentado na base do pescoço, sobre os ombros
rxn, ryn, cyn = largura_em(pesc.z, .02)
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=.3, major_segments=40, minor_segments=10, location=(0, cyn + .005, pesc.z - .015))
go = bpy.context.object; go.name = 'gola'; go.scale = (rxn + .05, ryn + .045, .055)
bm = bmesh.new(); bm.from_mesh(go.data)
for v in bm.verts: v.co += v.normal * random.uniform(-.02, .05)
bm.to_mesh(go.data); bm.free()
go.data.materials.append(M['pelo']); suave(go); uv(go, 'cube', .3); presa_ao_osso(go, 'spine_03')

# ── elmo de chapas, aro, nasal e chifres ────────────────────────────────────
cc = Vector((cx, cy, topo - .072))
rcab = max(largura_em(topo - .08, .02)[0], .085)
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=36, ring_count=18, location=cc + Vector((0, .005, .005)))
el = bpy.context.object; el.name = 'elmo'
bm = bmesh.new(); bm.from_mesh(el.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.02], context='VERTS')
for v in bm.verts: v.co.z *= 1.05; v.co.z += max(0, v.co.z) ** 3 * .16
bm.to_mesh(el.data); bm.free()
el.scale = (rcab + .012, rcab + .022, .105); el.modifiers.new('esp', 'SOLIDIFY').thickness = .05
aplicar(el); suave(el); el.data.materials.append(M['metal']); uv(el, 'esf')
presa_ao_osso(el, 'head')
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=.06, major_segments=40, minor_segments=8, location=cc + Vector((0, .005, .0)))
ar = bpy.context.object; ar.name = 'elmo_aro'; ar.scale = (rcab + .016, rcab + .026, .1); ar.data.materials.append(M['metal'])
suave(ar); presa_ao_osso(ar, 'head')
bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, frente_y + .028, cc.z - .03))
na = bpy.context.object; na.name = 'elmo_nasal'; na.scale = (.014, .007, .05); na.data.materials.append(M['metal'])
presa_ao_osso(na, 'head')
for s_, lado in ((1, 'E'), (-1, 'D')):
    cu = bpy.data.curves.new(f'chifre_{lado}', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    for i, off in enumerate(((rcab, .01, .04), (rcab + .07, 0, .1), (rcab + .09, -.04, .2))):
        bp = sp.bezier_points[i]; bp.co = cc + Vector((s_ * off[0], off[1], off[2]))
        bp.handle_left_type = bp.handle_right_type = 'AUTO'; bp.radius = 1 - i * .45
    cu.bevel_depth = .026; cu.bevel_resolution = 4
    ch = ligar(bpy.data.objects.new(f'chifre_{lado}', cu)); ch.data.materials.append(M['chifre'])
    for o2 in cena.objects: o2.select_set(False)
    bpy.context.view_layer.objects.active = ch; ch.select_set(True); bpy.ops.object.convert(target='MESH')
    suave(bpy.context.object); presa_ao_osso(bpy.context.object, 'head')
bpy.ops.object.select_all(action='DESELECT')
for o in cena.objects:
    if o.name.startswith('chifre_'): o.select_set(True); bpy.context.view_layer.objects.active = o
bpy.ops.object.join(); bpy.context.object.name = 'chifres'

# ── barba em mechas, nascendo da pele do rosto ─────────────────────────────
queixo_z = min(v.z for v in cabeca_pts if v.y < cy - .03)
def raiz_barba(v, n):
    rel = v - Vector((cx, cy, 0))
    return (rel.y < -.02 and queixo_z - .01 < v.z < queixo_z + .075 and abs(rel.x) < .075)
faces_b = [(corpo_px.matrix_world @ p.center, (corpo_px.matrix_world.to_3x3() @ p.normal).normalized())
           for p in corpo_px.data.polygons if raiz_barba(corpo_px.matrix_world @ p.center, None)]
boca_z = queixo_z + .05
cu = bpy.data.curves.new('barba', 'CURVE'); cu.dimensions = '3D'
cu.bevel_depth = .0075; cu.bevel_resolution = 1; cu.resolution_u = 3
comp_barba = 0 if 'barba' in bpy.data.objects else CONF.get('barba', 0)
for k in range(260 if comp_barba > 0 else 0):
    r, n = random.choice(faces_b)
    if abs(r.z - boca_z) < .012 and abs(r.x - cx) < .03: continue  # boca livre
    d = (n * .45 + Vector((0, -.1, -1))).normalized()
    L = comp_barba * random.uniform(.6, 1.2) * (1 - abs(r.x - cx) * 4)
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(3)
    for i in range(4):
        t = i / 3; bp = sp.bezier_points[i]
        bp.co = r - n * .003 + d * L * t + Vector((0, -.01 * t, -.02 * t * t))
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = (1 - t * .8) * random.uniform(.7, 1.3)
barba = ligar(bpy.data.objects.new('barba', cu)); barba.data.materials.append(M['barba'])
for o2 in cena.objects: o2.select_set(False)
bpy.context.view_layer.objects.active = barba; barba.select_set(True); bpy.ops.object.convert(target='MESH')
barba = bpy.context.object; suave(barba); presa_ao_osso(barba, 'head')
if comp_barba <= 0: bpy.data.objects.remove(barba)

# ── capuz (só o hóspede usa) ────────────────────────────────────────────────
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=36, ring_count=20, location=cc + Vector((0, .01, -.01)))
cz = bpy.context.object; cz.name = 'capuz'
bm = bmesh.new(); bm.from_mesh(cz.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -.3 and -.8 < v.co.z < .6], context='VERTS')
for v in bm.verts:
    if v.co.y > .3 and v.co.z > 0: v.co.y += (v.co.z ** 2) * .6; v.co.z -= v.co.y * .2
bm.to_mesh(cz.data); bm.free()
cz.scale = (rcab + .035, rcab + .05, .16); cz.modifiers.new('esp', 'SOLIDIFY').thickness = .06
cz.modifiers.new('sub', 'SUBSURF').levels = 1
aplicar(cz); suave(cz); cz.data.materials.append(M['capuz']); uv(cz, 'esf')
presa_ao_osso(cz, 'head')

# ── peças que este morador não usa ──────────────────────────────────────────
tirar = []
if not CONF.get('elmo'): tirar += ['elmo', 'elmo_aro', 'elmo_nasal']
if not CONF.get('chifres'): tirar += ['chifres']
if not CONF.get('capa', True): tirar += ['capa', 'gola']
if not CONF.get('capuz'): tirar += ['capuz']
if CONF.get('saia', .36) <= 0: tirar += ['saia']
for n in tirar:
    if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n])

# ── limpeza, cabelo tingível, texturas menores ──────────────────────────────
for n in list(cena.objects):
    if n.type == 'MESH' and (n.name == 'Human' or 'tongue' in n.name):
        bpy.data.objects.remove(n)
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, 1024 * im.size[1] // im.size[0])
for o in cena.objects: o.select_set(o.type in ('MESH', 'ARMATURE'))
bpy.ops.export_scene.gltf(filepath=SAIDA, export_format='GLB', use_selection=True, export_skins=True,
                          export_animations=False, export_yup=True, export_image_format='JPEG',
                          export_jpeg_quality=82, export_morph=False)
print('## ok', SAIDA)

if PREVIA:
    cam = bpy.data.cameras.new('c'); cam.lens = 50
    co = bpy.data.objects.new('c', cam); cena.collection.objects.link(co); cena.camera = co
    co.location = (0, -3.2, 1.0); co.rotation_euler = (math.radians(88), 0, 0)
    w = bpy.data.worlds.new('w'); cena.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .6, .7, 1)
    sol = bpy.data.lights.new('s', 'SUN'); sol.energy = 3
    so = bpy.data.objects.new('s', sol); cena.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
    cena.render.engine = 'CYCLES'; cena.cycles.samples = 24
    cena.render.resolution_x, cena.render.resolution_y = 500, 800
    cena.view_settings.view_transform = 'AgX'
    for nome, cor in {'tunica': (.55, .16, .12, 1), 'calca': (.3, .25, .2, 1), 'capa': (.18, .25, .38, 1)}.items():
        nt = M[nome].node_tree; b = nt.nodes['Principled BSDF']
        d = next(n for n in nt.nodes if n.type == 'TEX_IMAGE' and 'Diffuse' in n.image.name)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        nt.links.new(d.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = cor
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    cena.render.filepath = PREVIA
    bpy.ops.render.render(write_still=True)
    co.location = (.45, -1.0, topo - .12); co.rotation_euler = (math.radians(88), 0, math.radians(24))
    cena.render.filepath = PREVIA.replace('.png', '_rosto.png')
    bpy.ops.render.render(write_still=True)

