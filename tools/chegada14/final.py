"""As cutscenes do FINAL do Andar 14 (Blender 4.2, Cycles), em primeira pessoa.

    blender -b -P tools/chegada14/final.py -- <pasta_saida> <plano> [de] [ate]

  descida (1–360)  a cratera: ela vai até o pedestal que sobe da areia e APERTA O BOTÃO; um círculo de
                   juntas violeta se acende, o disco desce pelo poço até a porta acesa do laboratório.
  portal  (1–480)  o laboratório: a mão de luva arremessa o béquer violeta; o vidro estilhaça; o chão
                   "esquece" e vira um portal com a luz do elevador no fundo; ela se despede, estende o
                   braço para o portal; a câmera mergulha.

Reaproveita de cinema.py os materiais (texturas Poly Haven), o céu, os sóis, o gigante e a mão
(modelo anatômico). A entidade vem de frames/entidade.blend (entidade.py).
Variáveis: K14_ESCALA, K14_AMOSTRAS, K14_MOTOR (como em cinema.py).
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Euler, Matrix, Quaternion, noise

AQUI = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(args[0] if args else '/tmp/f14final')
PLANO = args[1] if len(args) > 1 else 'descida'
PLANOS_F = {'descida': (1, 360), 'portal': (1, 480)}
DE = int(args[2]) if len(args) > 2 else PLANOS_F[PLANO][0]
ATE = int(args[3]) if len(args) > 3 else PLANOS_F[PLANO][1]
os.makedirs(OUT, exist_ok=True)

# ── o que vem do cinema.py: materiais, céu, sóis, gigante; e a mão ──
_src = open(os.path.join(AQUI, 'cinema.py')).read()
_pre = _src[:_src.index('# ═════════════════════════════ O CHÃO')]
_pre = _pre.replace("PLANOS = {", "PLANOS = {'descida': (1, 360), 'portal': (1, 480), ", 1)
exec(compile(_pre, 'cinema_pre', 'exec'))
_mao = _src[_src.index('# ═════════════════════════════ A MÃO (POV)'):_src.index('# ═════════════════════════════ CÂMERAS')]
exec(compile(_mao, 'cinema_mao', 'exec'))
random.seed(14)

def liso(a, b, t):
    x = max(0., min(1., (t - a) / (b - a))); return x * x * (3 - 2 * x)

# ── a entidade (append do .blend) ──
with bpy.data.libraries.load(os.path.join(AQUI, 'frames', 'entidade.blend'), link=False) as (de_, para):
    para.collections = ['Entidade']
ENT_COL = para.collections[0]; sc.collection.children.link(ENT_COL)
ENT = bpy.data.objects['entidade']; OMBRO = bpy.data.objects['ombroD']
ENT.scale = (1.15, 1.15, 1.15)
def ent_chave(q, loc, olha_para=None, braco=None):
    ENT.location = loc; ENT.keyframe_insert('location', frame=q)
    if olha_para is not None:
        d = Vector(olha_para) - Vector(loc); ENT.rotation_euler = (0, 0, math.atan2(-d.x, d.y)); ENT.keyframe_insert('rotation_euler', frame=q)
    if braco is not None:
        OMBRO.rotation_euler = (math.radians(braco), math.radians(7), 0); OMBRO.keyframe_insert('rotation_euler', frame=q)

# ── a câmera ──
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.sensor_width = 36; cam.data.clip_start = .02; cam.data.clip_end = 6000; cam.data.lens = 22
_ult = [None]
def cam_chave(q, loc, alvo, lente=22, rolar=0.):
    d = Vector(alvo) - Vector(loc); e = d.to_track_quat('-Z', 'Y').to_euler(); e.rotate_axis('Z', math.radians(rolar))
    if _ult[0] is not None: e.make_compatible(_ult[0])
    _ult[0] = e.copy()
    cam.location = loc; cam.rotation_euler = e; cam.data.lens = lente
    cam.keyframe_insert('location', frame=q); cam.keyframe_insert('rotation_euler', frame=q); cam.data.keyframe_insert('lens', frame=q)

def emissor(nome, cor, forca):
    m = bpy.data.materials.new(nome); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*cor, 1); b.inputs['Emission Color'].default_value = (*cor, 1); b.inputs['Emission Strength'].default_value = forca
    return m

if PLANO == 'descida':
    # ═════════ A CRATERA ═════════
    C = Vector((0., -.5, 0.)); RAIO_DISCO = 2.6
    def chao_h(x, y):
        r = math.hypot(x, y)
        parede = liso(17, 27, r) * 9. - liso(31, 46, r) * 5.
        return parede + .35 * noise.noise(Vector((x * .12, y * .12, .3))) + .08 * noise.noise(Vector((x * .6, y * .6, 1.7)))
    bm = bmesh.new(); N = 220; L = 110.
    vs = [[bm.verts.new(((i / N - .5) * L, (j / N - .5) * L, 0)) for i in range(N + 1)] for j in range(N + 1)]
    for row in vs:
        for v in row: v.co.z = chao_h(v.co.x, v.co.y) if math.hypot(v.co.x - C.x, v.co.y - C.y) > RAIO_DISCO + .1 else 0.
    for j in range(N):
        for i in range(N):
            a, b_, c, d = vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]
            if min(math.hypot(v.co.x - C.x, v.co.y - C.y) for v in (a, b_, c, d)) < RAIO_DISCO + .9: continue   # o buraco do poço (a borda redonda vem do anel)
            bm.faces.new((a, b_, c, d))
    # anel de areia redondo cobrindo a borda em degraus da grade (a boca do poço fica um círculo limpo)
    vi, ve = [], []
    for k in range(96):
        a = k / 96 * math.tau; ci, si = math.cos(a), math.sin(a)
        vi.append(bm.verts.new((C.x + ci * (RAIO_DISCO + .02), C.y + si * (RAIO_DISCO + .02), 0.)))
        xe, ye = C.x + ci * (RAIO_DISCO + 1.6), C.y + si * (RAIO_DISCO + 1.6); ve.append(bm.verts.new((xe, ye, chao_h(xe, ye) * .5)))
    for k in range(96): bm.faces.new((vi[k], vi[(k + 1) % 96], ve[(k + 1) % 96], ve[k]))
    me = bpy.data.meshes.new('cratera'); bm.to_mesh(me); bm.free()
    chao = bpy.data.objects.new('cratera', me); sc.collection.objects.link(chao)
    chao.data.materials.append(AREIA); chao.data.materials.append(SERRA)
    me.update()
    for p in me.polygons: p.use_smooth = True; p.material_index = 1 if p.normal.z < .78 else 0
    # pedras e cristais nas encostas
    for k in range(26):
        a = random.uniform(0, math.tau); r = random.uniform(14, 22); x, y = math.cos(a) * r, math.sin(a) * r
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=random.uniform(.4, 1.6), location=(x, y, chao_h(x, y)))
        p = bpy.context.object; p.scale = (1, random.uniform(.7, 1.3), random.uniform(.5, .9)); p.rotation_euler = (random.random(), random.random(), random.random())
        dm = p.modifiers.new('rocha', 'DISPLACE'); t = bpy.data.textures.new(f'r{k}', 'CLOUDS'); t.noise_scale = .5; dm.texture = t; dm.strength = .35
        p.data.materials.append(ROCHA)
    for k in range(7):
        a = random.uniform(0, math.tau); r = random.uniform(9, 15); x, y = math.cos(a) * r, math.sin(a) * r
        for n in range(random.randint(3, 6)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=.12, depth=random.uniform(.5, 1.2), location=(x + random.uniform(-.4, .4), y + random.uniform(-.4, .4), chao_h(x, y) + .3))
            c_ = bpy.context.object; c_.rotation_euler = (random.uniform(-.5, .5), random.uniform(-.5, .5), 0); c_.data.materials.append(CRISTAL)
    # o pedestal com o botão de latão
    B = Vector((2.1, 3.4, 0.))
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.26, depth=1.15, location=(0, 0, .575)); ped = bpy.context.object; ped.data.materials.append(ROCHA)
    bv = ped.modifiers.new('chanfro', 'BEVEL'); bv.width = .03
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.19, depth=.06, location=(0, 0, 1.18)); aro = bpy.context.object; aro.data.materials.append(LATAO); aro.parent = ped
    bot_mat = emissor('botao', (.55, .3, 1.), .3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.08, depth=.06, location=(0, 0, 1.22)); bot = bpy.context.object; bot.data.materials.append(bot_mat); bot.parent = ped
    for q, z in ((1, -1.3), (36, -1.3), (60, 0.)):
        ped.location = (B.x, B.y, z); ped.keyframe_insert('location', frame=q)
    eb = bot_mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    for q, v in ((1, .3), (117, .3), (119, 25.), (140, 8.), (360, 6.)): eb.default_value = v; eb.keyframe_insert('default_value', frame=q)
    bpy.ops.object.light_add(type='POINT', location=(B.x, B.y, 1.6)); lb = bpy.context.object; lb.data.color = (.6, .35, 1.); lb.data.shadow_soft_size = .1
    for q, v in ((1, 0), (117, 0), (119, 300), (150, 40)): lb.data.energy = v; lb.data.keyframe_insert('energy', frame=q)
    # o disco: areia por cima, aro de metal, juntas que acendem; o poço por baixo
    bpy.ops.object.empty_add(location=C); disco = bpy.context.object
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=RAIO_DISCO, depth=.3, location=(C.x, C.y, -.15)); tampa = bpy.context.object; tampa.data.materials.append(AREIA); tampa.parent = disco
    tampa.matrix_parent_inverse = disco.matrix_world.inverted()
    juntas = emissor('juntas', (.62, .42, 1.), 0.)
    bpy.ops.mesh.primitive_torus_add(major_radius=RAIO_DISCO + .02, minor_radius=.035, location=(C.x, C.y, .01)); anel = bpy.context.object; anel.data.materials.append(juntas); anel.parent = disco
    anel.matrix_parent_inverse = disco.matrix_world.inverted()
    for k in range(4):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(C.x, C.y, .005)); s_ = bpy.context.object; s_.scale = (RAIO_DISCO * 2, .025, .02); s_.rotation_euler.z = k * math.pi / 4
        s_.data.materials.append(juntas); s_.parent = disco; s_.matrix_parent_inverse = disco.matrix_world.inverted()
    ej = juntas.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    for q, v in ((1, 0), (128, 0), (160, 18.), (175, 10.), (200, 14.)): ej.default_value = v; ej.keyframe_insert('default_value', frame=q)
    POCO = 17.
    poco_mat = pbr('poco', 'dark_rock', .6, tom=(.55, .45, .45), relevo=1., dist=.05)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=RAIO_DISCO + .25, depth=POCO + 2, location=(C.x, C.y, -(POCO + 2) / 2), end_fill_type='NOTHING')
    poco = bpy.context.object; poco.data.materials.append(poco_mat)
    fita = emissor('fita', (.55, .35, 1.), 9.)
    for k in range(8):
        a = k / 8 * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1, location=(C.x + math.cos(a) * (RAIO_DISCO + .2), C.y + math.sin(a) * (RAIO_DISCO + .2), -POCO / 2))
        f_ = bpy.context.object; f_.scale = (.04, .04, POCO); f_.data.materials.append(fita)
    # lá embaixo: o fundo do poço e a porta acesa do laboratório (a luz quente vem de dentro)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=RAIO_DISCO + .3, depth=.2, location=(C.x, C.y, -POCO - .9)); fundo = bpy.context.object; fundo.data.materials.append(poco_mat)
    porta_mat = emissor('porta_lab', (1., .82, .6), 6.)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(C.x, C.y + RAIO_DISCO + .2, -POCO + .5)); pl = bpy.context.object
    pl.scale = (1.4, 2.3, 1); pl.rotation_euler = (math.radians(90), 0, 0); pl.data.materials.append(porta_mat)
    bpy.ops.object.light_add(type='AREA', location=(C.x, C.y + RAIO_DISCO - .3, -POCO + .6)); la = bpy.context.object
    la.data.size = 1.6; la.data.energy = 900; la.data.color = (1., .8, .55); la.rotation_euler = (math.radians(90), 0, 0)
    for q, z in ((1, 0.), (190, 0.), (330, -POCO)):
        disco.location = (C.x, C.y, z); disco.keyframe_insert('location', frame=q)
    for fc in disco.animation_data.action.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'
    def desce(q):   # quanto o disco desceu no quadro q (mesma curva das chaves: liso)
        return -POCO * liso(190, 330, q)
    # ── a entidade: encara; vai ao botão; aperta; volta para o disco; desce junto
    E0 = Vector((0, 3.2, 0.)); junto = Vector((B.x - .55, B.y - .5, 0.)); spotE = C + Vector((0, 1.15, 0)); spotJ = C + Vector((0, -1.15, 0))
    J0 = Vector((0, -4.2, chao_h(0, -4.2)))
    ent_chave(1, E0, J0, 0); ent_chave(60, E0, J0, 0)
    ent_chave(64, E0, B); ent_chave(96, junto, B, 0); ent_chave(100, junto, B, 0)
    ent_chave(112, junto, B, 78); ent_chave(119, junto + Vector((0, .04, 0)), B, 72); ent_chave(132, junto, B, 0)
    ent_chave(138, junto, spotE); ent_chave(168, spotE, spotJ, 0)
    for q in range(190, 331, 10): ent_chave(q, spotE + Vector((0, 0, desce(q))), spotJ, 0)
    ent_chave(345, spotE + Vector((1.35, -.6, -POCO)), C + Vector((0, 4, -POCO)), 0)   # lá embaixo ela dá passagem
    ent_chave(360, spotE + Vector((1.4, -.6, -POCO)), C + Vector((0, 4, -POCO)), 0)
    # ── os olhos do hóspede
    olho = 1.68
    def cabeca_ent(q):
        if q <= 60: p = E0
        elif q <= 96: p = E0.lerp(junto, liso(64, 96, q))
        elif q <= 138: p = junto
        elif q <= 168: p = junto.lerp(spotE, liso(138, 168, q))
        else: p = spotE
        return Vector((p.x, p.y, (desce(q) if q > 168 else 0.) + 2.95))
    for q in range(1, 361, 6):
        tremor = (.035 * math.sin(q * 1.9) * (liso(150, 160, q) - liso(185, 200, q)))
        if q < 170: pos = Vector((J0.x, J0.y, J0.z + olho))
        elif q < 190: pos = Vector((J0.x, J0.y, J0.z + olho)).lerp(Vector((spotJ.x, spotJ.y, olho)), liso(170, 190, q))
        else: pos = Vector((spotJ.x, spotJ.y, olho + desce(q)))
        pos.z += math.sin(q * .21) * .008 + tremor
        if q < 64: alvo = cabeca_ent(q)
        elif q < 100: alvo = cabeca_ent(q).lerp(Vector((B.x, B.y, 1.3)), liso(64, 96, q))
        elif q < 138: alvo = Vector((B.x, B.y, 1.25))
        elif q < 215: alvo = Vector((B.x, B.y, 1.25)).lerp(cabeca_ent(q), liso(138, 165, q))
        elif q < 285: alvo = cabeca_ent(q).lerp(Vector((C.x, C.y, 40.)), liso(215, 250, q) - liso(262, 285, q))
        else: alvo = cabeca_ent(q).lerp(Vector((C.x, C.y + 8, -POCO + .8)), liso(285, 320, q))
        if q >= 330: pos = pos.lerp(Vector((C.x, C.y + RAIO_DISCO - .4, -POCO + olho)), liso(330, 360, q))
        cam_chave(q, pos, alvo, 22)

elif PLANO == 'portal':
    # ═════════ O LABORATÓRIO ═════════
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .0 if 'Background' in sc.world.node_tree.nodes else 0
    for o in list(GIGANTE): o.hide_render = True
    sol.hide_render = True; sol2.hide_render = True
    PISO = pbr('piso', 'metal_plate', .7, tom=(.7, .7, .74), relevo=.4, dist=.01)
    CONCRETO = pbr('concreto', 'concrete_wall_006', .45, tom=(.75, .72, .78), relevo=.6, dist=.02)
    CONC_CHAO = pbr('conc_chao', 'concrete_floor_worn_001', .4, tom=(.6, .58, .62), relevo=.4, dist=.01)
    METAL = com_ruido(material('metal_lab', (.25, .26, .28), rough=.35, metal=.85), 30., .05)
    W, D, H = 12., 10., 5.
    def caixa_(nome, loc, dim, mat):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = nome; o.scale = dim; o.data.materials.append(mat)
        bpy.ops.object.transform_apply(scale=True); return o
    caixa_('piso', (0, 0, -.05), (W, D, .1), PISO)
    caixa_('parede_fundo', (0, D / 2, H / 2), (W, .3, H), CONCRETO); caixa_('parede_e', (-W / 2, 0, H / 2), (.3, D, H), CONCRETO)
    caixa_('parede_d', (W / 2, 0, H / 2), (.3, D, H), CONCRETO); caixa_('parede_tras', (0, -D / 2, H / 2), (W, .3, H), CONCRETO)
    caixa_('teto', (0, 0, H), (W, D, .2), CONC_CHAO)
    for x in (-3, 0, 3):   # luminárias
        caixa_('lum', (x, 1, H - .12), (1.6, .25, .05), emissor('lum', (.9, .95, 1.), 12.))
        bpy.ops.object.light_add(type='AREA', location=(x, 1, H - .2)); a = bpy.context.object; a.data.size = 1.6; a.data.energy = 260; a.data.color = (.85, .9, 1.)
    for x in (-W / 2 + .2, W / 2 - .2):
        caixa_('fita', (x, 0, 1.2), (.04, D - .4, .04), emissor('fita_lab', (.55, .35, 1.), 7.))
    # bancada, estantes com vidraria, máquinas
    caixa_('tampo', (0, -1.1, .92), (3.4, 1.1, .08), METAL)
    for x, y in ((-1.6, -1.6), (1.6, -1.6), (-1.6, -.6), (1.6, -.6)): caixa_('perna', (x, y, .45), (.06, .06, .9), METAL)
    vidro = bpy.data.materials.new('vidro_lab'); vidro.use_nodes = True; vb = vidro.node_tree.nodes['Principled BSDF']
    vb.inputs['Transmission Weight'].default_value = 1.; vb.inputs['Roughness'].default_value = .03; vb.inputs['IOR'].default_value = 1.45
    liquidos = [emissor(f'liq{i}', c, .45) for i, c in enumerate(((.77, .34, .18), (.43, .83, .91), (.65, .48, 1.)))]
    for sx in (-3.9, 3.9):
        for z in (.9, 1.8, 2.7):
            caixa_('prat', (sx, D / 2 - .5, z), (1.8, .5, .05), METAL)
            for k, dx in enumerate((-.6, -.2, .2, .6)):
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.08, depth=.3, location=(sx + dx, D / 2 - .5, z + .18)); g_ = bpy.context.object; g_.data.materials.append(vidro)
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.07, depth=.16, location=(sx + dx, D / 2 - .5, z + .11)); l_ = bpy.context.object; l_.data.materials.append(liquidos[(k + int(z)) % 3])
    caixa_('maquina', (-2.6, D / 2 - .6, 1.2), (1., .8, 2.4), METAL)
    caixa_('tela', (-2.6, D / 2 - 1.01, 1.7), (.7, .02, .4), emissor('tela', (.3, 1., .6), 3.))
    for k, x in enumerate((-1.2, -.7, .75)):   # os três frascos na bancada
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.12, depth=.4, location=(x, -1.05, 1.16)); g_ = bpy.context.object; g_.data.materials.append(vidro)
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.11, depth=.25, location=(x, -1.05, 1.09)); l_ = bpy.context.object; l_.data.materials.append(liquidos[k])
    # ── o béquer com a mistura (violeta, viva) na mão
    mistura = bpy.data.materials.new('mistura'); mistura.use_nodes = True; nt = mistura.node_tree; bm_ = nt.nodes['Principled BSDF']
    ruido = nt.nodes.new('ShaderNodeTexNoise'); ruido.inputs['Scale'].default_value = 6.; ruido.inputs['Distortion'].default_value = 4.
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); nt.links.new(tc.outputs['Object'], mp.inputs[0]); nt.links.new(mp.outputs[0], ruido.inputs['Vector'])
    for q, z in ((1, 0.), (480, 6.)): mp.inputs['Location'].default_value = (0, 0, z); mp.inputs['Location'].keyframe_insert('default_value', frame=q)
    rr = nt.nodes.new('ShaderNodeValToRGB'); rr.color_ramp.elements[0].color = (.18, .05, .55, 1); rr.color_ramp.elements[1].color = (.75, .45, 1., 1)
    nt.links.new(ruido.outputs['Fac'], rr.inputs[0]); nt.links.new(rr.outputs['Color'], bm_.inputs['Base Color']); nt.links.new(rr.outputs['Color'], bm_.inputs['Emission Color'])
    bm_.inputs['Emission Strength'].default_value = 1.4
    bpy.ops.object.empty_add(); bequer = bpy.context.object
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.055, depth=.15, location=(0, 0, 0)); bv_ = bpy.context.object; bv_.data.materials.append(vidro); bv_.parent = bequer
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.05, depth=.1, location=(0, 0, -.02)); bl_ = bpy.context.object; bl_.data.materials.append(mistura); bl_.parent = bequer
    bpy.ops.object.light_add(type='POINT', location=(0, 0, 0)); lbq = bpy.context.object; lbq.data.color = (.7, .45, 1.); lbq.data.energy = 6; lbq.data.shadow_soft_size = .05; lbq.parent = bequer
    F = Vector((.15, 1.9, 0.))   # onde o béquer cai e o portal abre
    # ── a câmera: em pé atrás da bancada, olhando o béquer na mão; arremessa; olha o portal; ela fala; mergulho
    O = Vector((0., -2.6, 1.66))
    cam_chave(1, O, O + Vector((.1, 1, -.35)), 24)
    cam_chave(40, O + Vector((0, .02, 0)), O + Vector((.1, 1, -.3)), 24)
    cam_chave(56, O + Vector((.05, -.08, .02)), O + Vector((.15, 1, -.25)), 24)          # puxa para trás
    cam_chave(66, O + Vector((0, .15, -.03)), F + Vector((0, 0, .8)), 24)                # arremessa e acompanha
    cam_chave(80, O + Vector((0, .2, -.02)), F + Vector((0, 0, .1)), 24)
    cam_chave(110, O + Vector((-.6, .25, 0)), F + Vector((0, .1, 0)), 24)
    cam_chave(150, Vector((-2.25, -1.3, 1.66)), F + Vector((0, .1, 0)), 24)               # contorna a bancada pela esquerda
    EP = F + Vector((1.9, .8, 0))   # ela, ao lado do portal
    cam_chave(185, Vector((-2.0, -.4, 1.66)), EP + Vector((-.3, 0, 2.4)), 26)
    cam_chave(390, Vector((-1.5, -.05, 1.66)), EP + Vector((-.4, 0, 2.5)), 30)
    cam_chave(420, F + Vector((0, -1.4, 1.55)), F + Vector((0, .2, 0)), 24)
    cam_chave(470, F + Vector((0, -.15, .55)), F + Vector((0, .05, -2)), 22)
    cam_chave(480, F + Vector((0, 0, -.3)), F + Vector((0, 0, -5)), 20)
    # o béquer: preso à mão até o arremesso; arco até F; some ao bater
    MAO_RIG.parent = cam; MAO_RIG.matrix_parent_inverse = Matrix.Identity(4)
    for o in sc.objects:
        if o.get('mao'): o.hide_render = False
    # a mão de lado (palma para a esquerda), o béquer na palma — à vista
    for q, loc, rot, c in ((1, (.2, -.26, -.45), (6, 72, 10), .72), (40, (.21, -.24, -.45), (8, 72, 12), .72), (56, (.25, -.14, -.33), (30, 60, 18), .75),
                           (63, (.12, -.1, -.6), (-25, 0, 10), .2), (70, (.24, -.55, -.5), (-40, 0, 0), .3), (80, (.3, -.9, -.4), (-40, 0, 0), .3)):
        mao_pose(q, Vector(loc), rot, c, polegar=c)
    # posição do béquer = a palma (aprox.) nos quadros em que está na mão
    bpy.context.view_layer.update()
    def palma_mundo(q):
        sc.frame_set(q); return (MAO_RIG.matrix_world @ Vector((0, .1, -.04)))
    for q in (1, 20, 40, 50, 56, 60):
        p = palma_mundo(q); bequer.location = p; bequer.keyframe_insert('location', frame=q)
    p0 = palma_mundo(63)
    for k in range(9):
        q = 63 + k; t = k / 8
        p = p0.lerp(F + Vector((0, 0, .08)), t); p.z += math.sin(t * math.pi) * .9
        bequer.location = p; bequer.rotation_euler = (t * 7, 0, t * 2); bequer.keyframe_insert('location', frame=q); bequer.keyframe_insert('rotation_euler', frame=q)
    sc.frame_set(1)
    for q, v in ((1, False), (71, False), (72, True)):
        for o in [bequer] + list(bequer.children): o.hide_render = v; o.keyframe_insert('hide_render', frame=q)
    # os cacos e o respingo violeta (72–110)
    cacos = []
    for k in range(34):
        bpy.ops.mesh.primitive_cube_add(size=.03); c_ = bpy.context.object; c_.scale = (random.uniform(.4, 1.4), random.uniform(.2, .6), random.uniform(.6, 1.6))
        c_.data.materials.append(vidro if k % 3 else mistura)
        v = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(.6, 1.8))).normalized() * random.uniform(1.5, 3.2)
        for q in range(70, 112, 3):
            t = max(0., (q - 72) / 24)
            pos = F + Vector((v.x * t, v.y * t, max(.01, .1 + v.z * t - 4.9 * t * t)))
            c_.location = pos; c_.rotation_euler = (t * 9 + k, t * 7, t * 5); c_.keyframe_insert('location', frame=q); c_.keyframe_insert('rotation_euler', frame=q)
        c_.hide_render = True; c_.keyframe_insert('hide_render', frame=71); c_.hide_render = False; c_.keyframe_insert('hide_render', frame=72)
    # ── o portal: o chão "esquece" — um disco de luz violeta em espiral, a borda acesa, e um poço com a luz do elevador
    portal = bpy.data.materials.new('portal'); portal.use_nodes = True; nt = portal.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord'); onda = nt.nodes.new('ShaderNodeTexWave'); onda.wave_type = 'RINGS'; onda.rings_direction = 'SPHERICAL'
    onda.inputs['Scale'].default_value = 3.; onda.inputs['Distortion'].default_value = 6.; onda.inputs['Detail'].default_value = 4.
    for q, f in ((1, 0.), (480, 40.)): onda.inputs['Phase Offset'].default_value = f; onda.inputs['Phase Offset'].keyframe_insert('default_value', frame=q)
    nt.links.new(tc.outputs['Object'], onda.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB'); e = cr.color_ramp.elements; e[0].color = (.12, .03, .4, 1); e[1].color = (1., .75, .4, 1); x = e.new(.55); x.color = (.5, .25, .95, 1)
    nt.links.new(onda.outputs['Fac'], cr.inputs[0]); nt.links.new(cr.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 1.5
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.45, fill_type='NGON', location=(F.x, F.y, .012)); disco_p = bpy.context.object; disco_p.data.materials.append(portal)
    borda = emissor('borda_portal', (.8, .6, 1.), 7.)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.47, minor_radius=.03, location=(F.x, F.y, .02)); bp_ = bpy.context.object; bp_.data.materials.append(borda)
    for o in (disco_p, bp_):
        for q, s in ((1, .001), (78, .001), (96, .45), (140, 1.)): o.scale = (s, s, 1); o.keyframe_insert('scale', frame=q)
    bpy.ops.object.light_add(type='POINT', location=(F.x, F.y, .5)); lp = bpy.context.object; lp.data.color = (.75, .55, 1.); lp.data.shadow_soft_size = .4
    for q, v in ((1, 0), (74, 0), (80, 350), (140, 160), (480, 220)): lp.data.energy = v; lp.data.keyframe_insert('energy', frame=q)
    # ── ela, ao lado do portal: olha o hóspede, estende o braço para o portal na despedida
    ent_chave(1, EP, O, 0); ent_chave(200, EP, O, 0); ent_chave(240, EP, F, 70); ent_chave(330, EP, F, 66); ent_chave(370, EP, O, 0)

# ═════════════════════════════ RENDER ═════════════════════════════
r = sc.render; r.engine = os.environ.get('K14_MOTOR', 'CYCLES')
sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('K14_AMOSTRAS', 16)); sc.cycles.use_adaptive_sampling = True; sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 5; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 5
r.use_persistent_data = True; r.fps = 24
r.resolution_x, r.resolution_y = 1280, 608; r.resolution_percentage = int(os.environ.get('K14_ESCALA', 75))
r.use_motion_blur = True; r.motion_blur_shutter = .45
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -.1 if PLANO == 'descida' else -.25
sc.use_nodes = True; nt = sc.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); comp = nt.nodes.new('CompositorNodeComposite')
glare = nt.nodes.new('CompositorNodeGlare'); glare.glare_type = 'FOG_GLOW'; glare.threshold = .9; glare.size = 7; glare.mix = -.75
nt.links.new(rl.outputs['Image'], glare.inputs[0]); nt.links.new(glare.outputs[0], comp.inputs[0])
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGB'
r.use_overwrite = False; r.use_placeholder = True
sc.frame_start, sc.frame_end = DE, ATE
exec(os.environ.get('K14_EXTRA', ''))
r.filepath = os.path.join(OUT, PLANO + '_')
bpy.ops.render.render(animation=True)
