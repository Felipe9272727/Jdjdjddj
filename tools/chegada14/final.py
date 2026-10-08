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
ENT = bpy.data.objects['entidade']; RIG = bpy.data.objects['esqueleto']
ENT.scale = (1.15, 1.15, 1.15)
for b in RIG.pose.bones: b.rotation_mode = 'YXZ'   # primeiro torce no eixo do osso, depois dobra
_giro = [None]
def ent_chave(q, loc, olha_para=None, pose=None):
    ENT.location = loc; ENT.keyframe_insert('location', frame=q)
    if olha_para is not None:
        d = Vector(olha_para) - Vector(loc); z = math.atan2(-d.x, d.y)
        if _giro[0] is not None: z += math.tau * round((_giro[0] - z) / math.tau)   # vira pelo lado curto
        _giro[0] = z; ENT.rotation_euler = (0, 0, z); ENT.keyframe_insert('rotation_euler', frame=q)
    if pose is not None: ent_pose(q, pose)

# ── o braço por ossos (entidade.py: girar em +X leva o osso para a frente). Poses nomeadas; o ombro
#    puxa, o antebraço vem 2 quadros depois, a mão 4, os dedos 6 — o braço "arrasta" a mão, não é um bloco.
DEDOS_E = [f'dedo{d}_{s}' for d in range(4) for s in (1, 2, 3)]
POSES = {
    'repouso': {'antebraco': 10, 'mao': 6, **{n: 22 for n in DEDOS_E}, 'polegar_1': 12},
    'ergue':   {'braco': 38, 'antebraco': 62, 'mao': 24, 'antebraco_torce': -60, 'mao_torce': -50, **{n: 42 for n in DEDOS_E}, 'polegar_1': 25},
    'indica':  {'braco': 55, 'antebraco': 35, 'mao': 15, 'antebraco_torce': -85, 'mao_torce': -80, 'dedo0_1': -4, **{f'dedo{d}_{s}': 78 for d in (1, 2, 3) for s in (1, 2, 3)}, 'polegar_1': 50, 'polegar_2': 30},
    'estende': {'braco': 72, 'antebraco': 10, 'mao': -18, 'antebraco_torce': -50, 'mao_torce': -40, **{f'dedo{d}_{s}': 6 + 5 * d for d in range(4) for s in (1, 2, 3)}, 'polegar_1': 8},
    'despede': {'braco': 64, 'antebraco': 26, 'mao': -48, 'antebraco_torce': -20, **{f'dedo{d}_{s}': 3 * d for d in range(4) for s in (1, 2, 3)}},
    'fala':    {'braco': 22, 'antebraco': 58, 'mao': -12, **{f'dedo{d}_{s}': 18 + 6 * d for d in range(4) for s in (1, 2, 3)}, 'polegar_1': 10},
}
ATRASO = (('braco', 0), ('antebraco', 2), ('mao', 4), ('polegar', 5), ('dedo', 6))
def ent_pose(q, pose):
    P = POSES[pose] if isinstance(pose, str) else pose
    for b in RIG.pose.bones:
        a = next(v for k, v in ATRASO if b.name.startswith(k))
        b.rotation_euler = (math.radians(P.get(b.name, 0)), math.radians(P.get(b.name + '_torce', 0)), 0); b.keyframe_insert('rotation_euler', frame=q + a)

def fk_ponta(ang, osso='dedo0_3'):
    """Cinemática direta no espaço da armadura (só giros em X, como as poses): a ponta do osso."""
    memo = {}
    def M(pb):
        if pb.name not in memo:
            R = Matrix.Rotation(math.radians(ang.get(pb.name, 0)), 4, 'X') @ Matrix.Rotation(math.radians(ang.get(pb.name + '_torce', 0)), 4, 'Y')
            memo[pb.name] = (M(pb.parent) @ (pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local) if pb.parent else pb.bone.matrix_local) @ R
        return memo[pb.name]
    pb = RIG.pose.bones[osso]; m = M(pb); return m @ Vector((0, pb.bone.length, 0)), m.to_3x3() @ Vector((0, 1, 0))

def resolve_toque(alvo, loc, olha_para, base='indica', voltas=4):
    """Acha onde ela fica e os ângulos de ombro/cotovelo/pulso para a PONTA DO INDICADOR tocar `alvo`,
    com o dedo apontando para baixo. Corrige a posição dela pelo erro que sobra de lado."""
    loc = Vector(loc)
    for _ in range(voltas):
        d = Vector(olha_para) - loc; ENT.location = loc; ENT.rotation_euler = (0, 0, math.atan2(-d.x, d.y)); bpy.context.view_layer.update()
        Mw = RIG.matrix_world; Mi = Mw.inverted(); a_loc = Mi @ Vector(alvo); baixo = (Mi.to_3x3() @ Vector((0, 0, -1))).normalized()
        melhor = None
        for passo, faixa in ((5, None), (1, 6)):
            rb = range(0, 105, passo) if faixa is None else range(melhor[1]['braco'] - faixa, melhor[1]['braco'] + faixa + 1, passo)
            for a_ in rb:
                ra = range(0, 125, passo) if faixa is None else range(melhor[1]['antebraco'] - faixa, melhor[1]['antebraco'] + faixa + 1, passo)
                for b_ in ra:
                    for c_ in ((-30, -10, 10, 30, 50, 70) if faixa is None else range(melhor[1]['mao'] - 12, melhor[1]['mao'] + 13, 3)):
                        ang = dict(POSES[base], braco=a_, antebraco=b_, mao=c_); p, dr = fk_ponta(ang)
                        custo = (p - a_loc).length + .08 * (1 - dr.normalized().dot(baixo)) + .0012 * abs(b_ - 25) + .0012 * abs(c_)   # braço solto, pulso pouco dobrado
                        if melhor is None or custo < melhor[0]: melhor = (custo, ang, p)
        erro = Mw @ melhor[2] - Vector(alvo); erro.z = 0
        if os.environ.get("K14_DBG"): sys.stderr.write("TOQUE %s %s %s %s\n" % (tuple(round(x, 3) for x in loc), melhor[0], {k: melhor[1][k] for k in ("braco", "antebraco", "mao")}, tuple(round(x, 3) for x in erro)))
        loc -= erro
    return loc, melhor[1]

def ent_anda(q0, q1, passo=10):
    """O andar: sobe e desce a cada passo, balança de lado e inclina para a frente (o manto acompanha o corpo)."""
    n = max(2, round((q1 - q0) / (passo / 2)))
    for k in range(n + 1):
        q = round(q0 + (q1 - q0) * k / n); m = 1 if 0 < k < n else 0
        ENT.delta_location = (0, 0, m * (.035 if k % 2 else -.01)); ENT.keyframe_insert('delta_location', frame=q)
        ENT.delta_rotation_euler = (m * math.radians(-4), 0, m * math.radians(2.5 if k % 2 else -2.5)); ENT.keyframe_insert('delta_rotation_euler', frame=q)

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

def camera_viva(forca, escala):
    """Câmera na mão: um ruído lento e pequeno no giro (a cabeça nunca fica parada de tripé)."""
    for fc in cam.animation_data.action.fcurves:
        if fc.data_path == 'rotation_euler':
            m = fc.modifiers.new('NOISE'); m.strength = forca * (1.6 if fc.array_index == 0 else 1.); m.scale = escala; m.phase = 7 * fc.array_index + 3

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
    for q, z in ((1, 1.22), (117, 1.22), (120, 1.19), (128, 1.19), (132, 1.22)):   # o botão afunda com o dedo
        bot.location = (0, 0, z); bot.keyframe_insert('location', frame=q)
    eb = bot_mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    for q, v in ((1, .3), (118, .3), (120, 25.), (140, 8.), (360, 6.)): eb.default_value = v; eb.keyframe_insert('default_value', frame=q)
    bpy.ops.object.light_add(type='POINT', location=(B.x, B.y, 1.6)); lb = bpy.context.object; lb.data.color = (.6, .35, 1.); lb.data.shadow_soft_size = .1
    for q, v in ((1, 0), (118, 0), (120, 300), (150, 40)): lb.data.energy = v; lb.data.keyframe_insert('energy', frame=q)
    # o disco: areia por cima, aro de metal, juntas que acendem uma a uma; o poço por baixo
    bpy.ops.object.empty_add(location=C); disco = bpy.context.object
    def no_disco(o): o.parent = disco; o.matrix_parent_inverse = disco.matrix_world.inverted()
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=RAIO_DISCO, depth=.3, location=(C.x, C.y, -.15)); tampa = bpy.context.object; tampa.data.materials.append(AREIA); no_disco(tampa)
    juntas_anel = emissor('juntas_anel', (.62, .42, 1.), 0.)
    bpy.ops.mesh.primitive_torus_add(major_radius=RAIO_DISCO + .02, minor_radius=.035, location=(C.x, C.y, .01)); anel = bpy.context.object; anel.data.materials.append(juntas_anel); no_disco(anel)
    ea = juntas_anel.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    for q, v in ((1, 0), (126, 0), (134, 22.), (150, 10.), (200, 14.)): ea.default_value = v; ea.keyframe_insert('default_value', frame=q)
    for k in range(4):   # as juntas em cruz acendem em sequência, uma depois da outra (o círculo "se desenha")
        jm = emissor(f'junta{k}', (.62, .42, 1.), 0.)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(C.x, C.y, .005)); s_ = bpy.context.object; s_.scale = (RAIO_DISCO * 2, .025, .02); s_.rotation_euler.z = k * math.pi / 4
        s_.data.materials.append(jm); no_disco(s_)
        ej = jm.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
        for q, v in ((1, 0), (136 + 6 * k, 0), (141 + 6 * k, 24.), (165 + 6 * k, 10.), (200, 14.)): ej.default_value = v; ej.keyframe_insert('default_value', frame=q)
    # o elevador se revela: oito colunas de latão e dois corrimãos sobem de dentro da areia em volta deles
    R_GR = RAIO_DISCO - .14; grade = []
    for k in range(8):
        a = (k + .5) / 8 * math.tau
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.028, depth=1.12, location=(C.x + math.cos(a) * R_GR, C.y + math.sin(a) * R_GR, .56)); grade.append(bpy.context.object)
    for z in (.55, 1.1):
        bpy.ops.mesh.primitive_torus_add(major_radius=R_GR, minor_radius=.024, major_segments=96, location=(C.x, C.y, z)); grade.append(bpy.context.object)
    for o in grade:
        o.data.materials.append(LATAO); no_disco(o); z0 = o.location.z
        for p in o.data.polygons: p.use_smooth = True
        for q, dz in ((1, -1.25), (168, -1.25), (192, .03), (196, 0.)): o.location.z = z0 + dz; o.keyframe_insert('location', frame=q)
    # poeira que sobe quando a grade rasga a areia
    def poeira(nome, emissor_obj, q0, q1, n, vel, gravidade, tam, vida=40, mat=None):
        ps = emissor_obj.modifiers.new(nome, 'PARTICLE_SYSTEM').particle_system; s = ps.settings
        s.count = n; s.frame_start = q0; s.frame_end = q1; s.lifetime = vida; s.lifetime_random = .5; s.emit_from = 'VERT' if len(emissor_obj.data.polygons) == 0 else 'FACE'
        s.normal_factor = vel[0]; s.object_align_factor = (0, 0, vel[1]); s.factor_random = vel[2]; s.effector_weights.gravity = gravidade
        s.render_type = 'OBJECT'; s.particle_size = tam; s.size_random = .6; s.use_rotations = True; s.rotation_factor_random = 1.
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(0, -500, -500)); g = bpy.context.object; g.scale = (1, 1, 2.5); g.data.materials.append(mat or AREIA)
        s.instance_object = g; ps.seed = len(nome); return ps
    bm = bmesh.new()
    for k in range(64):
        a = k / 64 * math.tau; bm.verts.new((C.x + math.cos(a) * R_GR, C.y + math.sin(a) * R_GR, .02))
    me = bpy.data.meshes.new('emissor_grade'); bm.to_mesh(me); bm.free(); eg = bpy.data.objects.new('emissor_grade', me); sc.collection.objects.link(eg); no_disco(eg)
    poeira('poeira_grade', eg, 168, 194, 900, (0, 1.4, 1.2), .12, .012)
    # areia escorrendo da boca do poço para dentro quando o disco desce (fios que viram riscos com o desfoque)
    bm = bmesh.new()
    for k in range(160):
        a = k / 160 * math.tau; bm.verts.new((C.x + math.cos(a) * (RAIO_DISCO + .12), C.y + math.sin(a) * (RAIO_DISCO + .12), -.05))
    me = bpy.data.meshes.new('emissor_boca'); bm.to_mesh(me); bm.free(); eb_ = bpy.data.objects.new('emissor_boca', me); sc.collection.objects.link(eb_)
    poeira('areia_boca', eb_, 186, 300, 7000, (0, -.2, .25), 1., .0028, vida=70)
    POCO = 17.
    poco_mat = pbr('poco', 'dark_rock', .6, tom=(.55, .45, .45), relevo=1., dist=.05)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=RAIO_DISCO + .25, depth=POCO + 2, location=(C.x, C.y, -(POCO + 2) / 2), end_fill_type='NOTHING')
    poco = bpy.context.object; poco.data.materials.append(poco_mat)
    fita = emissor('fita', (.55, .35, 1.), 2.5)
    for k in range(8):
        a = k / 8 * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1, location=(C.x + math.cos(a) * (RAIO_DISCO + .2), C.y + math.sin(a) * (RAIO_DISCO + .2), -POCO / 2))
        f_ = bpy.context.object; f_.scale = (.03, .03, POCO); f_.data.materials.append(fita)
    for k in range(4):   # trilhos-guia de latão por onde o disco corre
        a = (k + .5) / 4 * math.tau
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=.05, depth=POCO + 1, location=(C.x + math.cos(a) * (RAIO_DISCO + .17), C.y + math.sin(a) * (RAIO_DISCO + .17), -(POCO + 1) / 2 - .06))
        bpy.context.object.data.materials.append(LATAO)
    # anéis de luz nas paredes: cada um acende quando o disco chega perto (a luz "acompanha" a descida)
    def desce(q):   # o disco: um tranco (cai 15 cm e para), depois desce liso até o fundo
        if q < 190: return 0.
        if q < 200: return -.15 * liso(190, 193, q)
        return -.15 - (POCO - .15) * liso(200, 330, q)
    for k in range(9):
        zk = -1.6 - k * 1.75; qk = next((q for q in range(190, 360) if desce(q) + 2.6 < zk), 340)
        rm = emissor(f'anel_poco{k}', (.7, .52, 1.), 0.)
        bpy.ops.mesh.primitive_torus_add(major_radius=RAIO_DISCO + .22, minor_radius=.025, major_segments=96, location=(C.x, C.y, zk)); bpy.context.object.data.materials.append(rm)
        e_ = rm.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
        for q, v in ((1, 0), (qk - 1, 0), (qk, 40.), (qk + 6, 9.)): e_.default_value = v; e_.keyframe_insert('default_value', frame=q)
    # lá embaixo: o fundo do poço e a porta do laboratório — duas folhas de metal que se abrem para a luz quente
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=RAIO_DISCO + .3, depth=.2, location=(C.x, C.y, -POCO - .9)); fundo = bpy.context.object; fundo.data.materials.append(poco_mat)
    porta_mat = emissor('porta_lab', (1., .82, .6), .5)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(C.x, C.y + RAIO_DISCO + .23, -POCO + 1.15)); pl = bpy.context.object
    pl.scale = (1.4, 2.3, 1); pl.rotation_euler = (math.radians(90), 0, 0); pl.data.materials.append(porta_mat)
    METAL_P = com_ruido(material('metal_porta', (.22, .23, .25), rough=.4, metal=.85), 25., .06)
    for lado in (-1, 1):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(C.x + lado * .36, C.y + RAIO_DISCO + .12, -POCO + 1.15)); fo = bpy.context.object
        fo.scale = (.72, .06, 2.3); fo.data.materials.append(METAL_P); bv = fo.modifiers.new('ch', 'BEVEL'); bv.width = .012
        for q, x in ((1, .36), (334, .36), (352, 1.15)): fo.location.x = C.x + lado * x; fo.keyframe_insert('location', frame=q)
    bpy.ops.object.light_add(type='AREA', location=(C.x, C.y + RAIO_DISCO - .1, -POCO + 1.2)); la = bpy.context.object
    la.data.size = 1.4; la.data.color = (1., .8, .55); la.rotation_euler = (math.radians(90), 0, 0)
    for q, v in ((1, 0), (334, 0), (352, 70)): la.data.energy = v; la.data.keyframe_insert('energy', frame=q)
    for q in (1, 189, 190, 193, 200, 330):
        disco.location = (C.x, C.y, desce(q)); disco.keyframe_insert('location', frame=q)
    for fc in disco.animation_data.action.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'
    # ── a entidade: encara; ANDA até o pedestal; ergue o braço; o indicador aperta o botão; volta para o disco; desce junto
    E0 = Vector((0, 3.2, 0.)); spotE = C + Vector((-1.2, .6, 0)); spotJ = Vector((.9, .9, 0.))
    J0 = Vector((0, -4.2, chao_h(0, -4.2)))
    TOPO_BOTAO = Vector((B.x, B.y, 1.255))
    dirB = (B - E0); dirB.z = 0; dirB.normalize()
    junto, ang_aperta = resolve_toque(TOPO_BOTAO + Vector((0, 0, .005)), B - dirB * 1.0, B + dirB * 3, voltas=6)
    olhar_b = B + dirB * 3   # o mesmo rumo que o resolvedor usou
    ang_sobre = dict(ang_aperta, braco=ang_aperta['braco'] + 7, mao=ang_aperta['mao'] - 6)   # o dedo paira 8–10 cm acima antes
    ent_chave(1, E0, J0, 'repouso'); ent_chave(60, E0, J0)
    ent_chave(64, E0, olhar_b); ent_chave(96, junto, olhar_b); ent_anda(64, 96)
    ent_chave(100, junto, olhar_b); ent_pose(100, 'repouso'); ent_pose(106, 'ergue'); ent_pose(111, ang_sobre)
    ent_pose(115, ang_aperta)   # (com os atrasos, o dedo chega em ~119–121)
    ent_pose(124, ang_aperta); ent_pose(127, ang_sobre); ent_pose(134, 'ergue'); ent_pose(142, 'repouso')
    ent_chave(132, junto, olhar_b); ent_chave(146, junto + (spotE - junto).normalized() * .2, spotE); ent_chave(172, spotE, spotJ); ent_anda(146, 172)
    for q in (190, 193, 200) + tuple(range(210, 331, 10)): ent_chave(q, spotE + Vector((0, 0, desce(q))), spotJ)
    ent_chave(336, spotE + Vector((0, 0, -POCO)), spotJ, 'repouso')
    ent_chave(350, spotE + Vector((.5, -.9, -POCO)), C + Vector((0, 4, -POCO)), 'estende'); ent_anda(336, 350, 7)   # dá passagem e mostra a porta
    ent_chave(360, spotE + Vector((.55, -.9, -POCO)), C + Vector((0, 4, -POCO)))
    # ── os olhos do hóspede
    olho = 1.68
    def cabeca_ent(q):
        if q <= 60: p = E0
        elif q <= 96: p = E0.lerp(junto, liso(64, 96, q))
        elif q <= 146: p = junto
        elif q <= 172: p = junto.lerp(spotE, liso(146, 172, q))
        else: p = spotE
        return Vector((p.x, p.y, (desce(q) if q > 168 else 0.) + 2.95))
    P1 = Vector((1.75, 2.15, 0.))   # o hóspede vai atrás dela e para de lado: a mão, o dedo e o botão juntos no quadro
    def passo_cab(q, q0, q1):   # o balanço da cabeça andando
        return .022 * abs(math.sin((q - q0) * .42)) * (liso(q0, q0 + 4, q) - liso(q1 - 4, q1, q))
    for q in range(1, 361, 3):
        tremor = .03 * math.sin(q * 1.9) * (liso(150, 160, q) - liso(185, 200, q))
        tranco = .09 * math.exp(-max(0, q - 190) * .35) * math.sin((q - 190) * 2.3) if q >= 190 else 0.   # o tranco do disco soltando
        if q < 170: pos = Vector((J0.x, J0.y, J0.z + olho)).lerp(Vector((P1.x, P1.y, olho)), liso(62, 112, q))
        elif q < 190: pos = Vector((P1.x, P1.y, olho)).lerp(Vector((spotJ.x, spotJ.y, olho)), liso(170, 190, q))
        else: pos = Vector((spotJ.x, spotJ.y, olho + desce(q)))
        pos.z += math.sin(q * .21) * .008 + tremor + tranco - passo_cab(q, 62, 112) - passo_cab(q, 170, 190)
        if q < 64: alvo = cabeca_ent(q)
        elif q < 100: alvo = cabeca_ent(q).lerp(Vector((B.x, B.y, 1.35)), liso(64, 96, q))
        elif q < 138: alvo = Vector((B.x, B.y, 1.3)).lerp(TOPO_BOTAO, liso(108, 118, q))
        elif q < 176: alvo = TOPO_BOTAO.lerp(Vector((C.x - 1., C.y - .2, .5)), liso(132, 172, q))   # olha as juntas se acendendo e a grade subindo
        elif q < 215: alvo = Vector((C.x - 1., C.y - .2, .5)).lerp(cabeca_ent(q), liso(186, 205, q))
        elif q < 290: alvo = cabeca_ent(q).lerp(Vector((C.x - 2.4, C.y - .3, desce(q) + 5.)), liso(215, 245, q) - liso(266, 290, q))   # a boca do poço encolhendo lá em cima, areia caindo
        else: alvo = cabeca_ent(q).lerp(Vector((C.x, C.y + 8, -POCO + .8)), liso(290, 322, q))
        if q >= 340: pos = pos.lerp(Vector((C.x, C.y + RAIO_DISCO - .7, -POCO + olho)), liso(340, 360, q))
        cam_chave(q, pos, alvo, 22 + 6 * (liso(100, 114, q) - liso(128, 142, q)), rolar=2.5 * tranco / .09)   # os olhos 'focam' no dedo
    camera_viva(.004, 22.)

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
    F = Vector((.15, 1.9, 0.))   # onde o béquer cai e o portal abre
    PX, PY = 1.05, 1.45          # o portal é oval (como em Portal 2): meia-largura e meio-comprimento
    def caixa_(nome, loc, dim, mat):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = nome; o.scale = dim; o.data.materials.append(mat)
        bpy.ops.object.transform_apply(scale=True); return o
    piso = caixa_('piso', (0, 0, -.05), (W, D, .1), PISO)
    # o furo do portal no piso: um cilindro oval que cresce junto com o portal (o booleano é avaliado a cada quadro)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1., depth=.5, location=(F.x, F.y, 0)); corte = bpy.context.object; corte.hide_render = True; corte.display_type = 'WIRE'
    bo = piso.modifiers.new('furo', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = corte; bo.solver = 'EXACT'
    caixa_('parede_fundo', (0, D / 2, H / 2), (W, .3, H), CONCRETO); caixa_('parede_e', (-W / 2, 0, H / 2), (.3, D, H), CONCRETO)
    caixa_('parede_d', (W / 2, 0, H / 2), (.3, D, H), CONCRETO); caixa_('parede_tras', (0, -D / 2, H / 2), (W, .3, H), CONCRETO)
    caixa_('teto', (0, 0, H), (W, D, .2), CONC_CHAO)
    for x in (-3, 0, 3):   # luminárias (refletem como faixas nos vidros)
        caixa_('lum', (x, 1, H - .12), (1.6, .25, .05), emissor('lum', (.9, .95, 1.), 12.))
        bpy.ops.object.light_add(type='AREA', location=(x, 1, H - .2)); a = bpy.context.object; a.data.size = 1.6; a.data.energy = 260; a.data.color = (.85, .9, 1.)
    for x in (-W / 2 + .2, W / 2 - .2):
        caixa_('fita', (x, 0, 1.2), (.04, D - .4, .04), emissor('fita_lab', (.55, .35, 1.), 7.))
    # bancada, estantes, máquinas
    caixa_('tampo', (0, -1.1, .92), (3.4, 1.1, .08), METAL)
    for x, y in ((-1.6, -1.6), (1.6, -1.6), (-1.6, -.6), (1.6, -.6)): caixa_('perna', (x, y, .45), (.06, .06, .9), METAL)

    # ── VIDRARIA: paredes com espessura de verdade (vidro duplo: entra e sai), borda arredondada, fundo grosso;
    #    líquido com absorção de cor pelo volume (mais escuro onde é mais fundo) e menisco subindo na parede
    vidro = bpy.data.materials.new('vidro_lab'); vidro.use_nodes = True; vb = vidro.node_tree.nodes['Principled BSDF']
    vb.inputs['Base Color'].default_value = (.97, .99, 1., 1); vb.inputs['Transmission Weight'].default_value = 1.; vb.inputs['Roughness'].default_value = .005; vb.inputs['IOR'].default_value = 1.5
    def liquido(nome, cor, densidade=7., brilho=0.):
        m = bpy.data.materials.new(nome); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
        b.inputs['Transmission Weight'].default_value = 1.; b.inputs['Roughness'].default_value = 0.; b.inputs['IOR'].default_value = 1.34
        b.inputs['Base Color'].default_value = (*[.5 + .5 * c for c in cor], 1)
        va = nt.nodes.new('ShaderNodeVolumeAbsorption'); va.inputs['Color'].default_value = (*cor, 1); va.inputs['Density'].default_value = densidade
        nt.links.new(va.outputs[0], nt.nodes['Material Output'].inputs['Volume'])
        if brilho: b.inputs['Emission Color'].default_value = (*cor, 1); b.inputs['Emission Strength'].default_value = brilho
        return m
    def torno(nome, perfil, mat, n=40, espessura=0., liso_=True):
        """Gira o perfil [(r, z), …] em volta do eixo z. Com espessura: casca (vidro) com borda arredondada."""
        bm = bmesh.new(); aneis = []
        for r, z in perfil:
            if r < 1e-5: aneis.append([bm.verts.new((0, 0, z))]); continue
            aneis.append([bm.verts.new((r * math.cos(k / n * math.tau), r * math.sin(k / n * math.tau), z)) for k in range(n)])
        for a, b in zip(aneis, aneis[1:]):
            if len(a) == 1: [bm.faces.new((a[0], b[k], b[(k + 1) % n])) for k in range(n)]
            elif len(b) == 1: [bm.faces.new((a[k], b[0], a[(k + 1) % n])) for k in range(n)]
            else: [bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k])) for k in range(n)]
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(nome, me); sc.collection.objects.link(o); o.data.materials.append(mat)
        if espessura:
            s = o.modifiers.new('casca', 'SOLIDIFY'); s.thickness = espessura; s.offset = -1; s.use_rim = True; s.use_even_offset = True
            sub = o.modifiers.new('liso', 'SUBSURF'); sub.levels = sub.render_levels = 1
        if liso_:
            for p in me.polygons: p.use_smooth = True
        return o
    def r_em(perfil, z):
        for (r0, z0), (r1, z1) in zip(perfil, perfil[1:]):
            if z0 <= z <= z1 and z1 > z0: return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return perfil[-1][0]
    FORMAS = {   # perfis externos (r, z), em metros; o primeiro ponto é o centro do fundo
        'bequer': lambda h, R: [(0, 0), (R * .9, 0), (R * .985, .006), (R, .02), (R, h), (R * 1.07, h + .008)],
        'erlen':  lambda h, R: [(0, 0), (R * .92, 0), (R, .012), (R * .97, h * .12), (R * .34, h * .74), (R * .3, h * .78), (R * .3, h), (R * .36, h + .006)],
        'balao':  lambda h, R: [(0, 0)] + [(R * math.sin(a), R - R * math.cos(a)) for a in (.35, .7, 1.05, 1.4, 1.75, 2.1, 2.45, 2.7)] + [(R * .28, R * 2 + .01), (R * .26, h), (R * .32, h + .006)],
        'tubo':   lambda h, R: [(0, 0)] + [(R * math.sin(a), R - R * math.cos(a)) for a in (.4, .8, 1.2, 1.5708)] + [(R, h), (R * 1.12, h + .004)],
    }
    def frasco(forma, loc, h, R, cor=None, nivel=.5, brilho=0., rot=0.):
        perfil = FORMAS[forma](h, R); g = torno('vidro_' + forma, perfil, vidro, espessura=max(.0025, R * .05))
        g.location = loc; g.rotation_euler.z = rot; pecas = [g]
        if cor:
            t = max(.0025, R * .05) + .0008; zl = h * nivel; zs = [z for _, z in perfil if 0 < z < zl]
            inter = [(0, t)] + [(max(.001, r_em(perfil, z) - t), max(z, t)) for z in sorted(set([t] + zs))]
            rl = max(.001, r_em(perfil, zl) - t)
            inter += [(rl, zl + .004), (rl * .93, zl + .0005), (rl * .6, zl), (0, zl)]   # o menisco sobe na parede
            l_ = torno('liq_' + forma, inter, liquido(f'liq_{forma}_{len(sc.objects)}', cor, brilho=brilho), espessura=0.)
            l_.parent = g; pecas.append(l_)
        return pecas
    CORES = ((.85, .32, .12), (.25, .75, .95), (.6, .35, 1.), (.4, .9, .35), (.95, .8, .2))
    random.seed(41)
    for sx in (-3.9, 3.9):
        for z in (.9, 1.8, 2.7):
            caixa_('prat', (sx, D / 2 - .5, z), (1.8, .5, .05), METAL)
            for k, dx in enumerate((-.65, -.3, .05, .38, .65)):
                forma = ('bequer', 'erlen', 'balao', 'bequer', 'tubo')[(k + int(z * 3)) % 5]
                h, R = {'bequer': (.2, .065), 'erlen': (.24, .085), 'balao': (.26, .07), 'tubo': (.18, .02)}[forma]
                frasco(forma, (sx + dx, D / 2 - .5 + random.uniform(-.08, .08), z + .025), h, R, CORES[(k + int(z)) % 5], random.uniform(.3, .7))
    caixa_('maquina', (-2.6, D / 2 - .6, 1.2), (1., .8, 2.4), METAL)
    caixa_('tela', (-2.6, D / 2 - 1.01, 1.7), (.7, .02, .4), emissor('tela', (.3, 1., .6), 3.))
    # na bancada: os três reagentes do quebra-cabeça, um balão aquecendo, uma estante de tubos
    for k, (x, forma) in enumerate(((-1.25, 'erlen'), (-.75, 'bequer'), (.8, 'erlen'))):
        frasco(forma, (x, -1.05, .96), .3 if forma == 'erlen' else .24, .11 if forma == 'erlen' else .085, CORES[k], .45)
    frasco('balao', (1.3, -.9, .96), .34, .09, (.6, .35, 1.), .4, brilho=.6)
    caixa_('estante', (-.2, -.85, 1.0), (.4, .1, .02), METAL)
    for k in range(5): frasco('tubo', (-.36 + k * .08, -.85, .96), .16, .014, CORES[k], .55)
    # ── o béquer com a mistura (violeta, viva) na mão
    mistura = liquido('mistura', (.6, .3, 1.), densidade=5., brilho=1.)
    nt = mistura.node_tree; bm_ = nt.nodes['Principled BSDF']
    ruido = nt.nodes.new('ShaderNodeTexNoise'); ruido.inputs['Scale'].default_value = 6.; ruido.inputs['Distortion'].default_value = 4.
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); nt.links.new(tc.outputs['Object'], mp.inputs[0]); nt.links.new(mp.outputs[0], ruido.inputs['Vector'])
    for q, z in ((1, 0.), (480, 6.)): mp.inputs['Location'].default_value = (0, 0, z); mp.inputs['Location'].keyframe_insert('default_value', frame=q)
    rr = nt.nodes.new('ShaderNodeValToRGB'); rr.color_ramp.elements[0].color = (.18, .05, .55, 1); rr.color_ramp.elements[1].color = (.75, .45, 1., 1)
    nt.links.new(ruido.outputs['Fac'], rr.inputs[0]); nt.links.new(rr.outputs['Color'], bm_.inputs['Emission Color'])
    bpy.ops.object.empty_add(); bequer = bpy.context.object
    for p in frasco('bequer', (0, 0, -.075), .15, .052, (.6, .3, 1.), .6):
        if p.parent is None: p.parent = bequer
        if p.name.startswith('liq_'): p.data.materials[0] = mistura
    bpy.ops.object.light_add(type='POINT', location=(0, 0, 0)); lbq = bpy.context.object; lbq.data.color = (.7, .45, 1.); lbq.data.energy = 4; lbq.data.shadow_soft_size = .05; lbq.parent = bequer
    # ── a câmera: em pé atrás da bancada, olhando o béquer na mão; arremessa; olha o portal; ela fala; mergulho no elevador
    O = Vector((0., -2.6, 1.66))
    cam_chave(1, O, O + Vector((.1, 1, -.35)), 24)
    cam_chave(40, O + Vector((0, .02, 0)), O + Vector((.1, 1, -.3)), 24)
    cam_chave(56, O + Vector((.05, -.08, .02)), O + Vector((.15, 1, -.25)), 24)          # puxa para trás
    cam_chave(66, O + Vector((0, .15, -.03)), F + Vector((0, 0, .8)), 24)                # arremessa e acompanha
    cam_chave(80, O + Vector((0, .2, -.02)), F + Vector((0, 0, .1)), 24)
    cam_chave(110, O + Vector((-.6, .25, 0)), F + Vector((0, .1, -.6)), 24)
    cam_chave(150, Vector((-2.25, -1.3, 1.66)), F + Vector((0, .1, -1.)), 24)               # contorna a bancada; olha PARA DENTRO do portal
    EP = F + Vector((1.9, .8, 0))   # ela, ao lado do portal
    cam_chave(185, Vector((-2.0, -.4, 1.66)), EP + Vector((-.3, 0, 2.4)), 26)
    cam_chave(232, Vector((-1.9, -.3, 1.66)), EP + Vector((-.4, 0, 2.4)), 26)
    cam_chave(262, Vector((-1.4, -1.6, 1.66)), EP.lerp(F, .45) + Vector((0, 0, 1.3)), 22)   # de lado: o braço dela e o portal no mesmo quadro
    cam_chave(330, Vector((-1.3, -1.5, 1.66)), EP.lerp(F, .4) + Vector((0, 0, 1.35)), 22)
    cam_chave(370, Vector((-1.6, -.2, 1.66)), EP + Vector((-.4, 0, 2.5)), 28)
    cam_chave(390, Vector((-1.5, -.05, 1.66)), EP + Vector((-.4, 0, 2.5)), 30)
    cam_chave(420, F + Vector((0, -1.75, 1.6)), F + Vector((0, .3, -1.2)), 24)
    cam_chave(452, F + Vector((0, -.55, 1.05)), F + Vector((0, .1, -3.)), 22)
    cam_chave(470, F + Vector((0, -.1, .3)), F + Vector((0, .02, -3.4)), 20)
    cam_chave(480, F + Vector((0, 0, -1.2)), F + Vector((0, 0, -3.4)), 18)
    camera_viva(.003, 26.)
    # o béquer: preso à mão até o arremesso; arco até F; some ao bater
    MAO_RIG.parent = cam; MAO_RIG.matrix_parent_inverse = Matrix.Identity(4)
    for o in sc.objects:
        if o.get('mao'): o.hide_render = False
    for q, loc, rot, c in ((1, (.2, -.26, -.45), (6, 72, 10), .72), (40, (.21, -.24, -.45), (8, 72, 12), .72), (56, (.25, -.14, -.33), (30, 60, 18), .75),
                           (63, (.12, -.1, -.6), (-25, 0, 10), .2), (70, (.24, -.55, -.5), (-40, 0, 0), .3), (80, (.3, -.9, -.4), (-40, 0, 0), .3)):
        mao_pose(q, Vector(loc), rot, c, polegar=c)
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
    for o in [bequer] + list(bequer.children_recursive):
        for q, v in ((1, False), (71, False), (72, True)): o.hide_render = v; o.keyframe_insert('hide_render', frame=q)
    # os cacos: lascas finas e curvas de vidro (não cubos) + gotas da mistura
    cacos = []
    for k in range(46):
        if k % 4:
            bpy.ops.mesh.primitive_plane_add(size=1); c_ = bpy.context.object; c_.scale = (random.uniform(.008, .03), random.uniform(.012, .045), 1)
            bm = bmesh.new(); bm.from_mesh(c_.data)
            for v in bm.verts: v.co.z = .3 * (v.co.x ** 2) + random.uniform(-.05, .05)
            bm.to_mesh(c_.data); bm.free()
            s = c_.modifiers.new('esp', 'SOLIDIFY'); s.thickness = .0025; c_.data.materials.append(vidro)
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(.006, .014), segments=10, ring_count=6); c_ = bpy.context.object; c_.data.materials.append(mistura)
        v = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(.6, 1.8))).normalized() * random.uniform(1.5, 3.2)
        for q in range(70, 112, 3):
            t = max(0., (q - 72) / 24)
            pos = F + Vector((v.x * t, v.y * t, max(.01, .1 + v.z * t - 4.9 * t * t)))
            c_.location = pos; c_.rotation_euler = (t * 9 + k, t * 7, t * 5); c_.keyframe_insert('location', frame=q); c_.keyframe_insert('rotation_euler', frame=q)
        c_.hide_render = True; c_.keyframe_insert('hide_render', frame=71); c_.hide_render = False; c_.keyframe_insert('hide_render', frame=72)
        # os que caem dentro do oval somem com o chão
        dx, dy = (F.x + v.x * 1. - F.x) / PX, (F.y + v.y * 1. - F.y) / PY
        if dx * dx + dy * dy < 1: c_.hide_render = True; c_.keyframe_insert('hide_render', frame=104)

    # ── O PORTAL (estilo Portal 2): um oval aceso no chão; por ele se vê O ELEVADOR, de cima — o poço, a
    #    grade de latão, o disco de areia lá embaixo, os anéis de luz violeta, a luz quente da porta.
    def cresce(o, base=(1., 1., 1.)):
        for q, s in ((1, .001), (74, .001), (80, .12), (96, .55), (128, 1.)):
            o.scale = (base[0] * s, base[1] * s, base[2]); o.keyframe_insert('scale', frame=q)
        for fc in o.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.easing = 'EASE_OUT'
    corte.scale = (PX, PY, 1); cresce(corte, (PX, PY, 1))
    # a "película": no começo cobre o furo (redemoinho opaco); depois clareia do centro para a borda
    portal = bpy.data.materials.new('portal'); portal.use_nodes = True; portal.blend_method = 'BLEND'; nt = portal.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    tc = nt.nodes.new('ShaderNodeTexCoord'); onda = nt.nodes.new('ShaderNodeTexWave'); onda.wave_type = 'RINGS'; onda.rings_direction = 'SPHERICAL'
    onda.inputs['Scale'].default_value = 2.; onda.inputs['Distortion'].default_value = 6.; onda.inputs['Detail'].default_value = 4.
    for q, f in ((1, 0.), (480, 40.)): onda.inputs['Phase Offset'].default_value = f; onda.inputs['Phase Offset'].keyframe_insert('default_value', frame=q)
    nt.links.new(tc.outputs['Object'], onda.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB'); e = cr.color_ramp.elements; e[0].color = (.12, .03, .4, 1); e[1].color = (1., .75, .4, 1); x = e.new(.55); x.color = (.5, .25, .95, 1)
    nt.links.new(onda.outputs['Fac'], cr.inputs[0]); nt.links.new(cr.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 1.5
    sep = nt.nodes.new('ShaderNodeVectorMath'); sep.operation = 'MULTIPLY'; sep.inputs[1].default_value = (1, 1, 0)
    ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs[0], ln.inputs[0])
    abrir = nt.nodes.new('ShaderNodeValue')
    for q, v in ((1, -.2), (104, -.2), (150, .9)): abrir.outputs[0].default_value = v; abrir.outputs[0].keyframe_insert('default_value', frame=q)
    m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'SUBTRACT'; nt.links.new(ln.outputs['Value'], m1.inputs[0]); nt.links.new(abrir.outputs[0], m1.inputs[1])
    m2 = nt.nodes.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; m2.use_clamp = True; m2.inputs[1].default_value = 6.; nt.links.new(m1.outputs[0], m2.inputs[0])
    nt.links.new(m2.outputs[0], mx.inputs['Fac']); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=1., fill_type='NGON', location=(F.x, F.y, .004)); pelicula = bpy.context.object; pelicula.data.materials.append(portal)
    pelicula.visible_shadow = False; cresce(pelicula, (PX, PY, 1))
    # a borda: um anel de luz com chama (ruído correndo) — o contorno nítido do Portal 2
    borda = bpy.data.materials.new('borda_portal'); borda.use_nodes = True; nt = borda.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tc = nt.nodes.new('ShaderNodeTexCoord')
    rz = nt.nodes.new('ShaderNodeTexNoise'); rz.noise_dimensions = '4D'; rz.inputs['Scale'].default_value = 7.; rz.inputs['Detail'].default_value = 3.
    for q, w in ((1, 0.), (480, 18.)): rz.inputs['W'].default_value = w; rz.inputs['W'].keyframe_insert('default_value', frame=q)
    nt.links.new(tc.outputs['Object'], rz.inputs['Vector'])
    rc = nt.nodes.new('ShaderNodeValToRGB'); e = rc.color_ramp.elements; e[0].position = .35; e[0].color = (.45, .2, 1., 1); e[1].position = .7; e[1].color = (1., .85, .6, 1)
    nt.links.new(rz.outputs['Fac'], rc.inputs[0]); nt.links.new(rc.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 9.
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    bpy.ops.mesh.primitive_torus_add(major_radius=1., minor_radius=.028, major_segments=128, minor_segments=10, location=(F.x, F.y, .01)); aro_p = bpy.context.object; aro_p.data.materials.append(borda)
    cresce(aro_p, (PX, PY, 1.))
    bpy.ops.mesh.primitive_torus_add(major_radius=1.03, minor_radius=.06, major_segments=128, minor_segments=8, location=(F.x, F.y, .0)); halo = bpy.context.object
    halo_m = emissor('halo_portal', (.55, .3, 1.), 1.2); halo.data.materials.append(halo_m); halo.visible_shadow = False; cresce(halo, (PX, PY, .3))
    # O ELEVADOR, embaixo do chão do laboratório (só se vê pelo portal): o mesmo poço da descida
    PROF = 3.6
    poco_mat = pbr('poco', 'dark_rock', .6, tom=(.55, .45, .45), relevo=1., dist=.05)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.7, depth=PROF + 1.5, location=(F.x, F.y, -(PROF + 1.5) / 2 - .1), end_fill_type='NOTHING'); bpy.context.object.data.materials.append(poco_mat)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.6, depth=.3, location=(F.x, F.y, -PROF - .15)); bpy.context.object.data.materials.append(AREIA)   # o disco de areia
    for k in range(4):   # os cabos de aço do elevador, sumindo no escuro do poço
        a = (k + .5) / 4 * math.tau
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.018, depth=PROF, location=(F.x + math.cos(a) * 1.3, F.y + math.sin(a) * 1.3, -.15 - PROF / 2)); bpy.context.object.data.materials.append(METAL)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.2, depth=.5, location=(F.x, F.y, -PROF + .25)); bpy.context.object.data.materials.append(ROCHA)   # o pedestal, com o botão aceso
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.07, depth=.05, location=(F.x, F.y, -PROF + .52)); bpy.context.object.data.materials.append(emissor('botao_e', (.55, .3, 1.), 12.))
    bpy.ops.mesh.primitive_torus_add(major_radius=1.6, minor_radius=.03, location=(F.x, F.y, -PROF + .01)); bpy.context.object.data.materials.append(emissor('junta_ea', (.62, .42, 1.), 12.))
    for k in range(8):   # a grade de latão
        a = (k + .5) / 8 * math.tau
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.026, depth=1.12, location=(F.x + math.cos(a) * 1.48, F.y + math.sin(a) * 1.48, -PROF + .56)); bpy.context.object.data.materials.append(LATAO)
    for z in (.55, 1.1):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.48, minor_radius=.022, major_segments=96, location=(F.x, F.y, -PROF + z)); bpy.context.object.data.materials.append(LATAO)
    for k in range(3):   # anéis de luz na parede do poço
        bpy.ops.mesh.primitive_torus_add(major_radius=1.68, minor_radius=.025, major_segments=96, location=(F.x, F.y, -.7 - k * 1.1)); bpy.context.object.data.materials.append(emissor(f'anel_e{k}', (.7, .52, 1.), 9.))
    for k in range(8):
        a = k / 8 * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1, location=(F.x + math.cos(a) * 1.66, F.y + math.sin(a) * 1.66, -PROF / 2)); f_ = bpy.context.object; f_.scale = (.03, .03, PROF); f_.data.materials.append(emissor('fita_e', (.55, .35, 1.), 2.5))
    # a porta do lab (lá embaixo, aberta: luz quente) e uma luz no fundo do poço para o elevador ter vida própria
    bpy.ops.mesh.primitive_plane_add(size=1, location=(F.x, F.y + 1.66, -PROF + 1.15)); pl = bpy.context.object; pl.scale = (1.2, 2.3, 1); pl.rotation_euler = (math.radians(90), 0, 0)
    pl.data.materials.append(emissor('porta_e', (1., .82, .6), 2.5))
    bpy.ops.object.light_add(type='AREA', location=(F.x, F.y + 1.4, -PROF + 1.2)); la = bpy.context.object; la.data.size = 1.2; la.data.energy = 220; la.data.color = (1., .8, .55); la.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.light_add(type='POINT', location=(F.x, F.y, -1.2)); lp_ = bpy.context.object; lp_.data.color = (.7, .5, 1.); lp_.data.energy = 120; lp_.data.shadow_soft_size = .5
    bpy.ops.object.light_add(type='POINT', location=(F.x, F.y, .5)); lp = bpy.context.object; lp.data.color = (.75, .55, 1.); lp.data.shadow_soft_size = .4
    for q, v in ((1, 0), (74, 0), (80, 420), (140, 220), (480, 260)): lp.data.energy = v; lp.data.keyframe_insert('energy', frame=q)
    bpy.ops.object.light_add(type='AREA', location=(F.x, F.y, -.05)); lr = bpy.context.object; lr.data.shape = 'ELLIPSE'; lr.data.size = 2 * PX; lr.data.size_y = 2 * PY
    lr.rotation_euler = (math.pi, 0, 0); lr.data.color = (.62, .4, 1.)   # a luz do portal sobe e pinta o lab de violeta
    for q, v in ((1, 0), (96, 0), (140, 380), (480, 420)): lr.data.energy = v; lr.data.keyframe_insert('energy', frame=q)
    # ── ela, ao lado do portal: olha o hóspede; gesticula enquanto fala; estende o braço para o portal na despedida
    ent_chave(1, EP, O, 'repouso'); ent_chave(80, EP, F); ent_chave(110, EP, O)
    ent_pose(150, 'repouso'); ent_pose(168, 'fala'); ent_pose(196, dict(POSES['fala'], braco=28, mao=-20)); ent_pose(222, 'repouso')
    ent_chave(232, EP, O); ent_chave(256, EP, F, 'despede'); ent_pose(300, dict(POSES['despede'], braco=60, mao=-40)); ent_pose(330, 'despede')
    ent_chave(350, EP, F); ent_chave(374, EP, O, 'repouso')

# ═════════════════════════════ RENDER ═════════════════════════════
r = sc.render; r.engine = os.environ.get('K14_MOTOR', 'CYCLES')
sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('K14_AMOSTRAS', 16)); sc.cycles.use_adaptive_sampling = True; sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 10; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 3; sc.cycles.transmission_bounces = 10; sc.cycles.volume_bounces = 1
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False; sc.cycles.blur_glossy = 1.
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
