"""A CHEGADA a Kessar-9 — cutscene ANIMADA (Blender 4.2, Cycles CPU).

    blender -b -P tools/chegada14/cinema.py -- <pasta_saida> <plano> [de] [ate]

Uma linha do tempo só (24 qps); cada PLANO tem a sua câmera e renderiza o seu trecho:
  geral  (  1– 84)  a porta de Vindhjem sozinha na crista de uma duna, o gigante gasoso atrás
  porta  ( 85–150)  a porta estoura em luz; o hóspede sai cambaleando, a mão na garganta
  queda  (151–210)  ele perde o pé e rola pela face da duna; a areia espirra
  pov    (211–330)  no chão, sem ar: o céu, a areia, a mão arranhando; ao longe, o capacete
  pega   (331–410)  ele se arrasta, agarra o capacete e o traz para a cabeça
  visor  (411–460)  de dentro do capacete: a paisagem pela escotilha, o primeiro fôlego
Variáveis: K14_ESCALA (% da resolução, padrão 100), K14_AMOSTRAS (padrão 24).
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Euler

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(args[0] if args else '/tmp/ch14')
PLANO = args[1] if len(args) > 1 else 'geral'
PLANOS = {'geral': (1, 84), 'porta': (85, 150), 'queda': (151, 210), 'pov': (211, 330), 'pega': (331, 410), 'visor': (411, 460)}
DE = int(args[2]) if len(args) > 2 else PLANOS[PLANO][0]
ATE = int(args[3]) if len(args) > 3 else PLANOS[PLANO][1]
PASSO = int(args[4]) if len(args) > 4 else 1
os.makedirs(OUT, exist_ok=True)
random.seed(14)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24

def suave(t): t = max(0., min(1., t)); return t * t * (3 - 2 * t)

# ═════════════════════════════ MATERIAIS ═════════════════════════════
def no(m, tipo, **kw):
    n = m.node_tree.nodes.new(tipo)
    for k, v in kw.items():
        if k in n.inputs: n.inputs[k].default_value = v
        else: setattr(n, k, v)
    return n
def liga(m, a, b): m.node_tree.links.new(a, b)

def material(nome, cor, rough=.7, metal=0., emissao=0., cor_em=None):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*cor, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emissao:
        b.inputs['Emission Color'].default_value = (*(cor_em or cor), 1); b.inputs['Emission Strength'].default_value = emissao
    return m

def com_ruido(m, escala, forca, cores=None, detalhe=6.):
    b = m.node_tree.nodes['Principled BSDF']
    tc = no(m, 'ShaderNodeTexCoord'); r = no(m, 'ShaderNodeTexNoise', Scale=escala, Detail=detalhe, Roughness=.6)
    liga(m, tc.outputs['Object'], r.inputs['Vector'])
    bump = no(m, 'ShaderNodeBump', Strength=forca, Distance=.05); liga(m, r.outputs['Fac'], bump.inputs['Height']); liga(m, bump.outputs['Normal'], b.inputs['Normal'])
    if cores:
        cr = no(m, 'ShaderNodeValToRGB'); e = cr.color_ramp.elements
        e[0].color = (*cores[0], 1); e[1].color = (*cores[1], 1); e[0].position = .3; e[1].position = .7
        liga(m, r.outputs['Fac'], cr.inputs[0]); liga(m, cr.outputs['Color'], b.inputs['Base Color'])
    return m

# ── materiais com textura de verdade (Poly Haven CC0, ./baixar_texturas.sh): projeção em caixa nas
#    coordenadas do objeto (sem UV), relevo pela altura (disp), aspereza pelo mapa (rough), tom multiplicado
TEXDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex')
def imagem(arq, dados=False):
    im = bpy.data.images.load(os.path.join(TEXDIR, arq), check_existing=True)
    if dados: im.colorspace_settings.name = 'Non-Color'
    return im
def pbr(nome, base, escala, tom=(1., 1., 1.), relevo=.6, dist=.03, coord='Object', mistura_larga=0.):
    m = bpy.data.materials.new(nome); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    if coord == 'Mundo':   # posição no mundo (objetos escalados: serras, chão)
        tc = no(m, 'ShaderNodeNewGeometry'); saida = tc.outputs['Position']
    else:
        tc = no(m, 'ShaderNodeTexCoord'); saida = tc.outputs[coord]
    mp = no(m, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (escala, escala, escala)
    liga(m, saida, mp.inputs['Vector'])
    def tex(arq, dados, vetor):
        t = no(m, 'ShaderNodeTexImage'); t.image = imagem(arq, dados); t.projection = 'BOX'; t.projection_blend = .3
        liga(m, vetor, t.inputs['Vector']); return t
    d = tex(f'{base}_diff.jpg', False, mp.outputs[0]); r = tex(f'{base}_rough.jpg', True, mp.outputs[0]); h = tex(f'{base}_disp.jpg', True, mp.outputs[0])
    cor = d.outputs['Color']
    if mistura_larga:   # uma segunda escala, larga, quebra a repetição
        mp2 = no(m, 'ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (escala * .21,) * 3; mp2.inputs['Location'].default_value = (.37, .11, .53)
        liga(m, saida, mp2.inputs['Vector'])
        d2 = tex(f'{base}_diff.jpg', False, mp2.outputs[0])
        mx2 = no(m, 'ShaderNodeMixRGB'); mx2.inputs['Fac'].default_value = mistura_larga
        liga(m, cor, mx2.inputs['Color1']); liga(m, d2.outputs['Color'], mx2.inputs['Color2']); cor = mx2.outputs['Color']
    mx = no(m, 'ShaderNodeMixRGB', blend_type='MULTIPLY'); mx.inputs['Fac'].default_value = 1.; mx.inputs['Color2'].default_value = (*tom, 1)
    liga(m, cor, mx.inputs['Color1']); liga(m, mx.outputs['Color'], b.inputs['Base Color'])
    liga(m, r.outputs['Color'], b.inputs['Roughness'])
    bump = no(m, 'ShaderNodeBump', Strength=relevo, Distance=dist); liga(m, h.outputs['Color'], bump.inputs['Height']); liga(m, bump.outputs['Normal'], b.inputs['Normal'])
    return m

# areia: cor com manchas grandes + ondulações de vento (ondas em coordenadas de mundo) + grão
AREIA = material('areia', (.52, .27, .12), rough=.95)
def _areia(m):
    b = m.node_tree.nodes['Principled BSDF']
    tc = no(m, 'ShaderNodeTexCoord')
    manchas = no(m, 'ShaderNodeTexNoise', Scale=.035, Detail=4.)
    liga(m, tc.outputs['Object'], manchas.inputs['Vector'])
    rampa = no(m, 'ShaderNodeValToRGB'); e = rampa.color_ramp.elements
    e[0].color = (.36, .16, .07, 1); e[1].color = (.66, .38, .18, 1); e[0].position = .35; e[1].position = .7
    liga(m, manchas.outputs['Fac'], rampa.inputs[0]); liga(m, rampa.outputs['Color'], b.inputs['Base Color'])
    onda = no(m, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Y', Scale=1.4, Distortion=7., **{'Detail Scale': 1.2})
    liga(m, tc.outputs['Object'], onda.inputs['Vector'])
    grao = no(m, 'ShaderNodeTexNoise', Scale=260., Detail=2.)
    liga(m, tc.outputs['Object'], grao.inputs['Vector'])
    soma = no(m, 'ShaderNodeMath', operation='MULTIPLY_ADD'); soma.inputs[1].default_value = .12
    liga(m, grao.outputs['Fac'], soma.inputs[0]); liga(m, onda.outputs['Fac'], soma.inputs[2])
    bump = no(m, 'ShaderNodeBump', Strength=.35, Distance=.04); liga(m, soma.outputs['Value'], bump.inputs['Height']); liga(m, bump.outputs['Normal'], b.inputs['Normal'])
_areia(AREIA)
AREIA = pbr('areia_tex', 'dense_sand', .3, tom=(1.55, .86, .52), relevo=.5, dist=.02, coord='Mundo', mistura_larga=.35)
MADEIRA = material('carvalho', (.13, .06, .025), rough=.72)
def _madeira(m, escala=7.):
    b = m.node_tree.nodes['Principled BSDF']; tc = no(m, 'ShaderNodeTexCoord')
    veio = no(m, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z', Scale=escala, Distortion=9., **{'Detail Scale': 2.})
    liga(m, tc.outputs['Object'], veio.inputs['Vector'])
    rampa = no(m, 'ShaderNodeValToRGB'); e = rampa.color_ramp.elements
    e[0].color = (.05, .022, .01, 1); e[1].color = (.26, .12, .05, 1)
    liga(m, veio.outputs['Fac'], rampa.inputs[0]); liga(m, rampa.outputs['Color'], b.inputs['Base Color'])
    bump = no(m, 'ShaderNodeBump', Strength=.25, Distance=.01); liga(m, veio.outputs['Fac'], bump.inputs['Height']); liga(m, bump.outputs['Normal'], b.inputs['Normal'])
_madeira(MADEIRA)
MADEIRA = pbr('carvalho_tex', 'dark_wood', 1.4, tom=(.75, .55, .42), relevo=.3, dist=.006)
TABUAS = pbr('tabuas_porta', 'medieval_wood', .55, tom=(.8, .62, .48), relevo=.8, dist=.01)
LATAO = com_ruido(material('latao', (.55, .36, .12), rough=.32, metal=.9), 40., .08, [(.25, .15, .05), (.72, .52, .22)])
FERRO = com_ruido(material('ferro', (.05, .045, .04), rough=.55, metal=.7), 60., .1)
COURO = com_ruido(material('couro', (.10, .05, .025), rough=.8), 30., .2)
LUVA = com_ruido(material('luva', (.20, .10, .05), rough=.75), 45., .15, [(.12, .06, .03), (.28, .15, .07)])
JAQUETA = com_ruido(material('jaqueta', (.07, .16, .36), rough=.8), 80., .1)
CALCA = material('calca', (.05, .045, .05), rough=.85)
PELE = material('pele', (.62, .40, .30), rough=.55)
ROCHA = pbr('basalto_tex', 'dark_rock', .5, tom=(1.1, .9, .85), relevo=1.2, dist=.05)
SERRA = pbr('serra_tex', 'cliff_side', .05, tom=(1.25, .8, .62), relevo=2., dist=.6, coord='Mundo', mistura_larga=.4)
CRISTAL = material('cristal', (.25, .9, .7), rough=.08, emissao=2.5, cor_em=(.05, 1., .55))
CRISTAL.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value = .6
VIDRO = material('vidro', (.6, .8, .75), rough=.04); VIDRO.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value = .95
LUZ_PORTA = material('luz_porta', (1., .8, .5), emissao=0., cor_em=(1., .72, .4))
FEIXE = bpy.data.materials.new('feixe'); FEIXE.use_nodes = True
def _feixe(m):
    nt = m.node_tree; nt.nodes.clear()
    out = no(m, 'ShaderNodeOutputMaterial'); em = no(m, 'ShaderNodeEmission', Strength=.0); em.inputs['Color'].default_value = (1., .78, .5, 1)
    tr = no(m, 'ShaderNodeBsdfTransparent'); mix = no(m, 'ShaderNodeAddShader')
    liga(m, em.outputs[0], mix.inputs[0]); liga(m, tr.outputs[0], mix.inputs[1]); liga(m, mix.outputs[0], out.inputs['Surface'])
    m.blend_method = 'BLEND'
_feixe(FEIXE)

# ═════════════════════════════ CÉU ═════════════════════════════
SOL_AZ, SOL_EL = math.radians(160), math.radians(11)   # sol baixo, quase atrás da porta (contraluz)
SOL_DIR = Vector((math.cos(SOL_EL) * math.sin(SOL_AZ), math.cos(SOL_EL) * math.cos(SOL_AZ), math.sin(SOL_EL)))
w = bpy.data.worlds.new('ceu'); sc.world = w; w.use_nodes = True
def _ceu(m):
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); fundo = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    r = nt.nodes.new('ShaderNodeValToRGB'); e = r.color_ramp.elements
    e[0].position = .0; e[0].color = (.95, .40, .17, 1)
    e[1].position = .55; e[1].color = (.006, .006, .03, 1)
    for pos, cor in ((.06, (.62, .22, .2, 1)), (.18, (.16, .06, .16, 1))):
        x = e.new(pos); x.color = cor
    nt.links.new(sep.outputs['Z'], r.inputs[0])
    # nuvens altas: ruído esticado em projeção de cúpula
    nuv = nt.nodes.new('ShaderNodeTexNoise'); nuv.inputs['Scale'].default_value = 3.; nuv.inputs['Detail'].default_value = 8.; nuv.inputs['Distortion'].default_value = 1.5
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1., 4., 1.)
    nt.links.new(tc.outputs['Generated'], mp.inputs[0]); nt.links.new(mp.outputs[0], nuv.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB'); ce = cr.color_ramp.elements; ce[0].position = .55; ce[1].position = .8
    ce[0].color = (0, 0, 0, 1); ce[1].color = (1, 1, 1, 1)
    nt.links.new(nuv.outputs['Fac'], cr.inputs[0])
    faixa = nt.nodes.new('ShaderNodeMapRange'); faixa.inputs['From Min'].default_value = .02; faixa.inputs['From Max'].default_value = .2
    nt.links.new(sep.outputs['Z'], faixa.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(cr.outputs['Color'], mul.inputs[0]); nt.links.new(faixa.outputs['Result'], mul.inputs[1])
    mx = nt.nodes.new('ShaderNodeMixRGB'); mx.inputs['Color2'].default_value = (.9, .55, .4, 1)
    nt.links.new(mul.outputs[0], mx.inputs['Fac']); nt.links.new(r.outputs['Color'], mx.inputs['Color1'])
    nt.links.new(mx.outputs['Color'], fundo.inputs['Color']); fundo.inputs['Strength'].default_value = 1.15
    nt.links.new(fundo.outputs[0], out.inputs['Surface'])
_ceu(w)
w.cycles_visibility.diffuse = True

bpy.ops.object.light_add(type='SUN', location=(0, 0, 50)); sol = bpy.context.object
sol.data.energy = 5.; sol.data.color = (1., .72, .45); sol.data.angle = math.radians(.8)
sol.rotation_euler = (-SOL_DIR).to_track_quat('-Z', 'Y').to_euler()
# o segundo sol, frio e fraco (sombra dupla discreta)
bpy.ops.object.light_add(type='SUN', location=(0, 0, 50)); sol2 = bpy.context.object
sol2.data.energy = .5; sol2.data.color = (.6, .78, 1.); d2 = Vector((-.6, .7, .25)).normalized()
sol2.rotation_euler = (-d2).to_track_quat('-Z', 'Y').to_euler()

# o gigante gasoso anelado, enorme, atrás da porta
def gigante():
    c = Vector((140., 1400., 260.))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=330, location=c); g = bpy.context.object
    m = bpy.data.materials.new('gigante'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    tc = no(m, 'ShaderNodeTexCoord'); onda = no(m, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z', Scale=3.5, Distortion=4., **{'Detail Scale': 1.5})
    liga(m, tc.outputs['Object'], onda.inputs['Vector'])
    rp = no(m, 'ShaderNodeValToRGB'); e = rp.color_ramp.elements; e[0].color = (.42, .25, .2, 1); e[1].color = (.85, .66, .5, 1)
    liga(m, onda.outputs['Fac'], rp.inputs[0]); liga(m, rp.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = .9
    g.data.materials.append(m)
    for p in g.data.polygons: p.use_smooth = True
    g.visible_shadow = False; g.pass_index = 7
    bpy.ops.mesh.primitive_circle_add(vertices=192, radius=640, fill_type='NOTHING', location=c); anel = bpy.context.object
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.extrude_region_shrink_fatten(TRANSFORM_OT_shrink_fatten={'value': 210}); bpy.ops.object.mode_set(mode='OBJECT')
    anel.rotation_euler = (math.radians(78), math.radians(14), 0)
    ma = bpy.data.materials.new('anel'); ma.use_nodes = True; nt = ma.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); dif.inputs['Color'].default_value = (.85, .7, .55, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    tc2 = nt.nodes.new('ShaderNodeTexCoord'); grad = nt.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / 850, 1 / 850, 1 / 850)
    nt.links.new(tc2.outputs['Object'], mp.inputs[0]); nt.links.new(mp.outputs[0], grad.inputs[0])
    on2 = nt.nodes.new('ShaderNodeTexWave'); on2.wave_type = 'RINGS'; on2.inputs['Scale'].default_value = 2.; on2.inputs['Distortion'].default_value = 2.
    nt.links.new(tc2.outputs['Object'], on2.inputs['Vector'])
    nt.links.new(on2.outputs['Fac'], mx.inputs['Fac']); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(dif.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    anel.data.materials.append(ma); anel.visible_shadow = False; anel.pass_index = 7
gigante()

# ═════════════════════════════ O CHÃO: CAMPO DE DUNAS ═════════════════════════════
def ruido(x, y):
    i, j = math.floor(x), math.floor(y); fx, fy = suave(x - i), suave(y - j)
    def h(a, b):
        n = (a * 374761393 + b * 668265263) & 0xffffffff; n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
        return (n ^ (n >> 16)) / 4294967295
    a, b, c, d = h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
def fbm(x, y, o=4):
    s, a, f = 0., .5, 1.
    for _ in range(o): s += a * ruido(x * f, y * f); f *= 2.03; a *= .5
    return s
PERIODO = 46.
def duna(x, y):
    """Dunas barcanas em série: crista afiada, face de deslizamento íngreme do lado -Y (o lado da câmera)."""
    u = -y + 7. * math.sin(x * .028) + 3. * math.sin(x * .07 + 1.) + PERIODO * .8
    t = (u % PERIODO) / PERIODO
    p = t / .8 if t < .8 else (1 - t) / .2
    perfil = suave(p) if t < .8 else p ** 1.6
    amp = 7. + 2.5 * fbm(x * .015 + 3, y * .015)
    return perfil * amp + fbm(x * .04, y * .04) * 1.4
def altura(x, y):
    return duna(x, y)

N = 260
def eixo(i):
    t = i / (N - 1) * 2 - 1
    return math.copysign(abs(t) ** 2.2, t) * 420
xs = [eixo(i) for i in range(N)]
verts = [(x, y, altura(x, y)) for y in xs for x in xs]
faces = [(j * N + i, j * N + i + 1, (j + 1) * N + i + 1, (j + 1) * N + i) for j in range(N - 1) for i in range(N - 1)]
me = bpy.data.meshes.new('dunas'); me.from_pydata(verts, [], faces); me.update()
chao = bpy.data.objects.new('dunas', me); sc.collection.objects.link(chao); chao.data.materials.append(AREIA)
for p in me.polygons: p.use_smooth = True
sub = chao.modifiers.new('sub', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1
CRISTA_Z = altura(0, 0)

# serras ao fundo e colunas de basalto no meio do caminho
def serra(loc, esc, rot):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=1, location=loc); o = bpy.context.object
    o.scale = esc; o.rotation_euler = (0, 0, rot)
    t = bpy.data.textures.new('serra', 'VORONOI'); t.noise_scale = .32; t.distance_metric = 'DISTANCE'
    d = o.modifiers.new('d', 'DISPLACE'); d.texture = t; d.strength = .5
    t2 = bpy.data.textures.new('serra2', 'CLOUDS'); t2.noise_scale = .12; t2.noise_depth = 4
    d2 = o.modifiers.new('d2', 'DISPLACE'); d2.texture = t2; d2.strength = .15
    o.data.materials.append(SERRA)
    for p in o.data.polygons: p.use_smooth = True
for k, (x, y, s, rot) in enumerate([(-260, 520, 120, .3), (-40, 640, 170, 1.1), (230, 560, 140, 2.), (420, 430, 90, .7), (-470, 380, 80, 2.5)]):
    serra((x, y, -s * .25), (s * 1.6, s * .8, s * .75), rot)
def colunas(cx, cy, n):
    for i in range(n):
        a = random.random() * 6.28; r = random.random() * 4
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r; h = 6 + random.random() * 9
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=.7 + random.random() * .4, depth=h, location=(x, y, altura(x, y) + h / 2 - 1))
        o = bpy.context.object; o.rotation_euler = (random.uniform(-.05, .05), random.uniform(-.05, .05), random.random() * 6.28)
        bv = o.modifiers.new('b', 'BEVEL'); bv.width = .06; bv.segments = 2
        o.data.materials.append(ROCHA)
colunas(-70, 90, 6); colunas(95, 160, 5); colunas(-150, 230, 7)
def cristais(cx, cy, n, esc=1.):
    for i in range(n):
        a = random.random() * 6.28; r = random.random() * 1.6
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r; h = (.6 + random.random() * 1.6) * esc
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=.12 * esc + random.random() * .08, depth=h, location=(x, y, altura(x, y) + h * .3))
        o = bpy.context.object; o.rotation_euler = (random.uniform(-.6, .6), random.uniform(-.6, .6), random.random() * 6.28)
        bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(o.data)
        topo = [v for v in bm.verts if v.co.z > 0]
        for v in topo: v.co.x *= .15; v.co.y *= .15; v.co.z *= 1.25
        bmesh.update_edit_mesh(o.data); bpy.ops.object.mode_set(mode='OBJECT')
        o.data.materials.append(CRISTAL)
cristais(-9, -16, 6); cristais(7, -24, 4, .8); cristais(-24, 30, 7, 1.4); cristais(30, 12, 5, 1.2)

# ═════════════════════════════ A PORTA DE VINDHJEM ═════════════════════════════
PORTA = Vector((0., 0., CRISTA_Z - .15))
def caixa(nome, loc, dim, mat, bevel=.02, pai=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = nome; o.scale = dim
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel: b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 2
    o.data.materials.append(mat)
    if pai: o.parent = pai; o.matrix_parent_inverse = pai.matrix_world.inverted()
    return o
def porta():
    P = PORTA
    for lx in (-.92, .92):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.17, depth=3.6, location=(P.x + lx, P.y, P.z + 1.6))
        o = bpy.context.object; o.data.materials.append(MADEIRA)
        for zz in (.4, 1.6, 2.8):   # anéis de ferro
            bpy.ops.mesh.primitive_torus_add(major_radius=.18, minor_radius=.025, location=(P.x + lx, P.y, P.z + zz)); bpy.context.object.data.materials.append(FERRO)
        # cabeça de dragão no alto do batente: um pescoço curvo e o focinho
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=.16, radius2=.05, depth=.9, location=(P.x + lx * 1.12, P.y - .15, P.z + 3.75))
        c = bpy.context.object; c.rotation_euler = (math.radians(-60), math.copysign(.5, lx), 0); c.data.materials.append(MADEIRA)
    caixa('verga', (P.x, P.y, P.z + 3.42), (2.5, .42, .36), MADEIRA, .03)
    caixa('soleira', (P.x, P.y, P.z - .05), (2.1, .5, .14), MADEIRA, .02)
    # o vão: luz de Vindhjem lá dentro
    bpy.ops.mesh.primitive_plane_add(size=1, location=(P.x, P.y + .12, P.z + 1.62)); v = bpy.context.object
    v.scale = (1.62, 3.2, 1); v.rotation_euler = (math.radians(90), 0, 0); v.data.materials.append(LUZ_PORTA)
    bpy.ops.object.light_add(type='AREA', location=(P.x, P.y + .4, P.z + 1.6)); luz = bpy.context.object
    luz.data.size = 1.5; luz.data.color = (1., .75, .45); luz.data.energy = 0; luz.rotation_euler = (math.radians(-90), 0, 0)
    # o feixe de luz que sai pelo vão (um cone translúcido emissivo: "raios" sem volume)
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=3.6, radius2=.85, depth=9, location=(P.x, P.y - 4.6, P.z + 1.2))
    fx = bpy.context.object; fx.rotation_euler = (math.radians(-95), 0, 0); fx.data.materials.append(FEIXE); fx.visible_shadow = False; fx.hide_render = True   # o brilho fica com o glare
    folhas = []
    for lado in (-1, 1):   # as duas folhas, com dobradiça no batente
        bpy.ops.object.empty_add(location=(P.x + lado * .8, P.y - .05, P.z + 1.6)); dob = bpy.context.object
        f = caixa('folha', (P.x + lado * .4, P.y - .05, P.z + 1.6), (.8, .09, 3.15), TABUAS, .015, pai=dob)
        for zz in (-1.05, 0., 1.05):
            caixa('cinta', (P.x + lado * .4, P.y - .11, P.z + 1.6 + zz), (.78, .02, .1), FERRO, .005, pai=dob)
        caixa('argola', (P.x + lado * .08, P.y - .13, P.z + 1.5), (.05, .05, .2), LATAO, .01, pai=dob)
        folhas.append((dob, lado))
    return luz, fx, folhas
LUZ, FEIXE_OBJ, FOLHAS = porta()

# ═════════════════════════════ O HÓSPEDE (pele + esqueleto) ═════════════════════════════
JUNTAS = {   # nome: (posição em repouso, raio da pele)
    'quadril': ((0, 0, .98), .17), 'barriga': ((0, 0, 1.17), .16), 'peito': ((0, 0, 1.38), .2), 'pescoco': ((0, 0, 1.56), .07), 'cabeca': ((0, 0, 1.72), .12), 'topo': ((0, 0, 1.86), .1),
    'ombro.L': ((.2, 0, 1.47), .07), 'cotovelo.L': ((.46, 0, 1.47), .055), 'pulso.L': ((.7, 0, 1.47), .045), 'mao.L': ((.8, 0, 1.47), .05),
    'ombro.R': ((-.2, 0, 1.47), .07), 'cotovelo.R': ((-.46, 0, 1.47), .055), 'pulso.R': ((-.7, 0, 1.47), .045), 'mao.R': ((-.8, 0, 1.47), .05),
    'anca.L': ((.1, 0, .93), .09), 'joelho.L': ((.11, -.02, .5), .065), 'tornozelo.L': ((.11, 0, .09), .05), 'pe.L': ((.11, -.15, .04), .05),
    'anca.R': ((-.1, 0, .93), .09), 'joelho.R': ((-.11, -.02, .5), .065), 'tornozelo.R': ((-.11, 0, .09), .05), 'pe.R': ((-.11, -.15, .04), .05),
}
OSSOS = [   # (osso, junta inicial, junta final, pai)
    ('quadril', 'quadril', 'barriga', None), ('coluna', 'barriga', 'peito', 'quadril'), ('peito', 'peito', 'pescoco', 'coluna'), ('cabeca', 'pescoco', 'topo', 'peito'),
    ('braco.L', 'ombro.L', 'cotovelo.L', 'peito'), ('antebraco.L', 'cotovelo.L', 'pulso.L', 'braco.L'), ('mao.L', 'pulso.L', 'mao.L', 'antebraco.L'),
    ('braco.R', 'ombro.R', 'cotovelo.R', 'peito'), ('antebraco.R', 'cotovelo.R', 'pulso.R', 'braco.R'), ('mao.R', 'pulso.R', 'mao.R', 'antebraco.R'),
    ('coxa.L', 'anca.L', 'joelho.L', 'quadril'), ('canela.L', 'joelho.L', 'tornozelo.L', 'coxa.L'), ('pe.L', 'tornozelo.L', 'pe.L', 'canela.L'),
    ('coxa.R', 'anca.R', 'joelho.R', 'quadril'), ('canela.R', 'joelho.R', 'tornozelo.R', 'coxa.R'), ('pe.R', 'tornozelo.R', 'pe.R', 'canela.R'),
]
ARESTAS = [('quadril', 'barriga'), ('barriga', 'peito'), ('peito', 'pescoco'), ('pescoco', 'cabeca'), ('cabeca', 'topo'),
           ('peito', 'ombro.L'), ('ombro.L', 'cotovelo.L'), ('cotovelo.L', 'pulso.L'), ('pulso.L', 'mao.L'),
           ('peito', 'ombro.R'), ('ombro.R', 'cotovelo.R'), ('cotovelo.R', 'pulso.R'), ('pulso.R', 'mao.R'),
           ('quadril', 'anca.L'), ('anca.L', 'joelho.L'), ('joelho.L', 'tornozelo.L'), ('tornozelo.L', 'pe.L'),
           ('quadril', 'anca.R'), ('anca.R', 'joelho.R'), ('joelho.R', 'tornozelo.R'), ('tornozelo.R', 'pe.R')]

def hospede():
    nomes = list(JUNTAS); idx = {n: i for i, n in enumerate(nomes)}
    me = bpy.data.meshes.new('hospede'); me.from_pydata([JUNTAS[n][0] for n in nomes], [(idx[a], idx[b]) for a, b in ARESTAS], []); me.update()
    corpo = bpy.data.objects.new('hospede', me); sc.collection.objects.link(corpo)
    sk = corpo.modifiers.new('pele', 'SKIN')
    for n in nomes:
        r = JUNTAS[n][1]; me.skin_vertices[0].data[idx[n]].radius = (r, r * (.8 if n in ('peito', 'barriga', 'quadril') else 1.), )
    me.skin_vertices[0].data[idx['quadril']].use_root = True
    sm = corpo.modifiers.new('liso', 'SUBSURF'); sm.levels = 1; sm.render_levels = 2
    # material: jaqueta no tronco e braços, calça nas pernas, pele na cabeça e mãos (por altura/posição, via grupo)
    for m in (JAQUETA, CALCA, PELE, LUVA): corpo.data.materials.append(m)
    bpy.context.view_layer.objects.active = corpo; corpo.select_set(True)
    bpy.ops.object.modifier_apply(modifier='pele')
    for p in corpo.data.polygons:
        c = p.center
        p.material_index = 2 if c.z > 1.6 else 3 if abs(c.x) > .68 else 1 if c.z < .95 else 0
        p.use_smooth = True
    # esqueleto
    arm = bpy.data.armatures.new('esqueleto'); rig = bpy.data.objects.new('esqueleto', arm); sc.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    for nome, a, b, pai in OSSOS:
        bo = arm.edit_bones.new(nome); bo.head = JUNTAS[a][0]; bo.tail = JUNTAS[b][0]
        if pai: bo.parent = arm.edit_bones[pai]; bo.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT'); corpo.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    return corpo, rig
CORPO, RIG = hospede()

def pose(q, raiz, rot, ossos):
    """raiz=(x,y,z) no mundo, rot=(rx,ry,rz) em graus, ossos={nome:(rx,ry,rz) graus} — chave no quadro q."""
    RIG.location = raiz; RIG.rotation_euler = Euler([math.radians(a) for a in rot]); RIG.keyframe_insert('location', frame=q); RIG.keyframe_insert('rotation_euler', frame=q)
    for pb in RIG.pose.bones:
        pb.rotation_mode = 'XYZ'; a = ossos.get(pb.name, (0, 0, 0)); pb.rotation_euler = Euler([math.radians(v) for v in a])
        pb.keyframe_insert('rotation_euler', frame=q)

# o hóspede sai cambaleando (85–150) e rola pela face da duna (151–210); some depois (o POV é dele)
P = PORTA
def zc(y): return altura(0, y)
GARGANTA = {'braco.R': (-60, 0, -55), 'antebraco.R': (0, 0, -120), 'mao.R': (0, 0, -20)}
CHAVES = [
    (85, (0, .9, zc(.9)), (0, 0, 0), {**GARGANTA, 'braco.L': (0, 0, 70)}),
    (100, (0, .9, zc(.9)), (0, 0, 0), {**GARGANTA, 'braco.L': (0, 0, 70)}),
    (110, (.05, .1, zc(.1)), (12, 0, 2), {**GARGANTA, 'braco.L': (-50, 0, 30), 'antebraco.L': (0, 0, 40), 'coxa.L': (-35, 0, 0), 'canela.L': (40, 0, 0), 'coxa.R': (20, 0, 0), 'peito': (12, 0, 0)}),
    (118, (-.05, -.7, zc(-.7)), (16, 0, -4), {**GARGANTA, 'braco.L': (40, 0, 50), 'coxa.R': (-40, 0, 0), 'canela.R': (45, 0, 0), 'coxa.L': (25, 0, 0), 'peito': (18, 0, 0), 'cabeca': (-25, 0, 0)}),
    (126, (.1, -1.4, zc(-1.4)), (22, 6, 5), {**GARGANTA, 'braco.L': (-70, 0, 20), 'coxa.L': (-30, 0, 0), 'canela.L': (60, 0, 0), 'peito': (25, 0, 0), 'cabeca': (-30, 10, 0)}),
    (136, (.0, -1.8, zc(-1.8) - .25), (30, 0, -2), {**GARGANTA, 'braco.L': (-80, 0, 60), 'coxa.L': (-70, 0, 0), 'canela.L': (110, 0, 0), 'coxa.R': (-20, 0, 0), 'canela.R': (60, 0, 0), 'peito': (30, 0, 0), 'cabeca': (-35, 0, 0)}),
    (146, (.0, -2.3, zc(-2.3) - .4), (55, 0, -2), {'braco.L': (-110, 0, 40), 'braco.R': (-120, 0, -40), 'coxa.L': (-60, 0, 0), 'canela.L': (90, 0, 0), 'coxa.R': (-50, 0, 0), 'canela.R': (80, 0, 0), 'peito': (25, 0, 0)}),
    (154, (.1, -3.4, zc(-3.4) + .1), (110, 10, -5), {'braco.L': (-150, 0, 70), 'braco.R': (-140, 0, -70), 'coxa.L': (-40, 0, 0), 'coxa.R': (-90, 0, 0), 'canela.R': (100, 0, 0)}),
    (164, (.3, -5.2, zc(-5.2) + .3), (230, 20, -10), {'braco.L': (-40, 0, 90), 'braco.R': (-160, 0, -60), 'coxa.L': (-110, 0, 0), 'canela.L': (90, 0, 0), 'coxa.R': (-30, 0, 0)}),
    (174, (.5, -7.0, zc(-7.0) + .25), (370, -10, 168), {'braco.L': (-160, 0, 40), 'braco.R': (-50, 0, -100), 'coxa.L': (-30, 0, 0), 'coxa.R': (-120, 0, 0), 'canela.R': (110, 0, 0)}),
    (184, (.6, -8.6, zc(-8.6) + .2), (500, 15, -8), {'braco.L': (-80, 0, 100), 'braco.R': (-130, 0, -80), 'coxa.L': (-90, 0, 0), 'canela.L': (70, 0, 0), 'coxa.R': (-40, 0, 0)}),
    (194, (.7, -9.9, zc(-9.9) + .18), (630, 0, -10), {'braco.L': (-20, 0, 80), 'braco.R': (-30, 0, -80), 'coxa.L': (-20, 0, 0), 'coxa.R': (-15, 0, 0)}),
    (202, (.7, -10.3, zc(-10.3) + .16), (632, 0, -8), {'braco.L': (10, 0, 85), 'braco.R': (0, 0, -95), 'coxa.L': (-10, 0, 5), 'coxa.R': (5, 0, -5), 'cabeca': (10, 15, 0)}),
    (210, (.7, -10.35, zc(-10.35) + .16), (630, 0, -8), {'braco.L': (12, 0, 88), 'braco.R': (0, 0, -98), 'coxa.L': (-10, 0, 5), 'cabeca': (8, 20, 0)}),
]
for q, raiz, rot, ossos in CHAVES: pose(q, raiz, rot, ossos)
# esconde o corpo fora dos planos dele
for q, vis in ((1, False), (84, False), (85, True), (210, True), (211, False)):
    CORPO.hide_render = not vis; CORPO.keyframe_insert('hide_render', frame=q)
# a porta: fechada com luz vazando (1–96), estoura (97–102), aberta; o feixe acende junto
for dob, lado in FOLHAS:
    for q, ang in ((96, 0), (99, -lado * 125), (103, -lado * 105), (110, -lado * 112)):
        dob.rotation_euler = (0, 0, math.radians(ang)); dob.keyframe_insert('rotation_euler', frame=q)
for q, e, ef in ((1, 60, .4), (90, 150, .6), (96, 300, .8), (99, 6000, 6.), (106, 1200, 2.5), (150, 500, 1.6)):
    LUZ.data.energy = e; LUZ.data.keyframe_insert('energy', frame=q)
    nd = LUZ_PORTA.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']; nd.default_value = ef * 6; nd.keyframe_insert('default_value', frame=q)
    fe = FEIXE.node_tree.nodes['Emission'].inputs['Strength']; fe.default_value = ef * .12; fe.keyframe_insert('default_value', frame=q)

# a areia que espirra na queda: partículas a partir do corpo
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.02, location=(0, 0, -50)); grao = bpy.context.object; grao.data.materials.append(AREIA)
ps = CORPO.modifiers.new('areia', 'PARTICLE_SYSTEM').particle_system.settings
ps.count = 2600; ps.frame_start = 150; ps.frame_end = 200; ps.lifetime = 40; ps.emit_from = 'FACE'
ps.normal_factor = 1.2; ps.factor_random = 1.5; ps.render_type = 'OBJECT'; ps.instance_object = grao; ps.particle_size = 1.; ps.size_random = .7
ps.effector_weights.gravity = .7

# ═════════════════════════════ O CAPACETE DE MADEIRA ═════════════════════════════
CAP_POS = Vector((1.3, -14.6, 0)); CAP_POS.z = altura(CAP_POS.x, CAP_POS.y) + .02
def capacete():
    bpy.ops.object.empty_add(location=CAP_POS); raiz = bpy.context.object
    # casco: perfil girado (aduelas de carvalho)
    pts = [(.0, .54), (.12, .53), (.22, .49), (.29, .41), (.33, .3), (.345, .18), (.345, .06), (.33, .0)]
    me = bpy.data.meshes.new('casco'); bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in pts]
    for a, b in zip(vs, vs[1:]): bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=48)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0005)
    bm.to_mesh(me); bm.free()
    casco = bpy.data.objects.new('casco', me); sc.collection.objects.link(casco); casco.parent = raiz
    so = casco.modifiers.new('esp', 'SOLIDIFY'); so.thickness = .025
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.118, depth=.5, location=(0, -.3, .22), rotation=(math.radians(90), 0, 0)); furo = bpy.context.object; furo.hide_render = True; furo.hide_viewport = True
    bo = casco.modifiers.new('furo', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = furo; bo.solver = 'EXACT'
    furo.parent = raiz
    casco.data.materials.append(MADEIRA)
    for p in me.polygons: p.use_smooth = True
    # aros de latão (base e meio) e a escotilha com rebites
    for z, r in ((.02, .345), (.3, .335)):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.018, location=(0, 0, z)); t = bpy.context.object; t.parent = raiz; t.data.materials.append(LATAO)
    bpy.ops.mesh.primitive_torus_add(major_radius=.13, minor_radius=.028, location=(0, -.33, .22)); e = bpy.context.object; e.rotation_euler = (math.radians(90), 0, 0); e.parent = raiz; e.data.materials.append(LATAO)
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=.12, fill_type='NGON', location=(0, -.325, .22)); vd = bpy.context.object; vd.rotation_euler = (math.radians(90), 0, 0); vd.parent = raiz; vd.data.materials.append(VIDRO)
    for k in range(8):
        a = k / 8 * math.tau
        bpy.ops.mesh.primitive_uv_sphere_add(radius=.012, location=(math.cos(a) * .13, -.36, .22 + math.sin(a) * .13)); bpy.context.object.parent = raiz; bpy.context.object.data.materials.append(LATAO)
    # a mangueira de couro, meio enterrada
    cu = bpy.data.curves.new('mangueira', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = .03; cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(3)
    for bp, co in zip(sp.bezier_points, [(.3, .1, .12), (.6, .3, .02), (.9, .1, -.02), (1.2, .5, -.05)]):
        bp.co = co; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    mg = bpy.data.objects.new('mangueira', cu); sc.collection.objects.link(mg); mg.parent = raiz; mg.data.materials.append(COURO)
    raiz.rotation_euler = (math.radians(8), math.radians(-14), math.radians(25))
    return raiz
CAPACETE = capacete()
# o capacete brilha (um ponto quente na escotilha) e, no fim, é erguido até a câmera
bpy.ops.object.light_add(type='POINT', location=CAP_POS + Vector((0, -.5, .35))); brilho = bpy.context.object
brilho.data.energy = 25; brilho.data.color = (1., .75, .4); brilho.data.shadow_soft_size = .05; brilho.parent = CAPACETE; brilho.matrix_parent_inverse = CAPACETE.matrix_world.inverted()

# ═════════════════════════════ A MÃO (POV) ═════════════════════════════
def mao():
    """Luva de couro com 5 dedos (pele + esqueleto) e a manga azul; origem no pulso, dedos para +Y."""
    J = {'pulso': ((0, 0, 0), .045), 'palma': ((0, .09, 0), .05)}
    dedos = {'polegar': (-.045, .03, (-.05, .05, 0)), 'indicador': (-.03, .1, (0, .045, 0)), 'medio': (-.008, .105, (0, .05, 0)), 'anelar': (.015, .1, (0, .045, 0)), 'minimo': (.035, .09, (0, .035, 0))}
    for d, (x, y, (dx, dy, dz)) in dedos.items():
        for s in range(3): J[f'{d}{s}'] = ((x + dx * s * (1 if d != 'polegar' else .9), y + dy * s + (.0 if s else 0), dz * s), .015 - s * .0015)
        J[f'{d}3'] = ((x + dx * 3, y + dy * 3, 0), .012)
    J['manga'] = ((0, -.28, 0), .07)
    nomes = list(J); idx = {n: i for i, n in enumerate(nomes)}
    ar = [('manga', 'pulso'), ('pulso', 'palma')] + [(('palma' if s == 0 else f'{d}{s - 1}'), f'{d}{s}') for d in dedos for s in range(4)]
    me = bpy.data.meshes.new('mao'); me.from_pydata([J[n][0] for n in nomes], [(idx[a], idx[b]) for a, b in ar], []); me.update()
    o = bpy.data.objects.new('mao', me); sc.collection.objects.link(o)
    sk = o.modifiers.new('pele', 'SKIN')
    for n in nomes: r = J[n][1]; me.skin_vertices[0].data[idx[n]].radius = (r, r * (.55 if n == 'palma' else 1.))
    me.skin_vertices[0].data[idx['manga']].use_root = True
    sm = o.modifiers.new('liso', 'SUBSURF'); sm.levels = 1; sm.render_levels = 2
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.modifier_apply(modifier='pele')
    o.data.materials.append(LUVA); o.data.materials.append(JAQUETA)
    for p in o.data.polygons: p.material_index = 1 if p.center.y < -.05 else 0; p.use_smooth = True
    arm = bpy.data.armatures.new('mao_arm'); rig = bpy.data.objects.new('mao_rig', arm); sc.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    b0 = arm.edit_bones.new('palma'); b0.head = J['pulso'][0]; b0.tail = J['palma'][0]
    bm0 = arm.edit_bones.new('manga'); bm0.head = J['manga'][0]; bm0.tail = J['pulso'][0]; b0.parent = bm0
    for d in dedos:
        pai = b0
        for s in range(3):
            b = arm.edit_bones.new(f'{d}{s}'); b.head = J[f'{d}{s}'][0]; b.tail = J[f'{d}{s + 1}'][0]; b.parent = pai; pai = b
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    return o, rig, list(dedos)
MAO, MAO_RIG, DEDOS = mao()
def mao_pose(q, loc, rot, curva, polegar=None):
    """curva: 0 = aberta … 1 = fechada (garra/agarrando)."""
    MAO_RIG.location = loc; MAO_RIG.rotation_euler = Euler([math.radians(a) for a in rot])
    MAO_RIG.keyframe_insert('location', frame=q); MAO_RIG.keyframe_insert('rotation_euler', frame=q)
    for pb in MAO_RIG.pose.bones:
        pb.rotation_mode = 'XYZ'
        if pb.name[:-1] in DEDOS:
            k = (polegar if (polegar is not None and pb.name.startswith('polegar')) else curva)
            pb.rotation_euler = Euler((math.radians(-k * (55 if pb.name[-1] == '0' else 70)), 0, 0))
        pb.keyframe_insert('rotation_euler', frame=q)

# ═════════════════════════════ CÂMERAS ═════════════════════════════
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.data.sensor_width = 36
def olhar(loc, alvo, rolar=0.):
    d = Vector(alvo) - Vector(loc); q = d.to_track_quat('-Z', 'Y'); e = q.to_euler(); e.rotate_axis('Z', math.radians(rolar)); return e
def cam_chave(q, loc, alvo, lente=35, rolar=0., foco=None, f=2.8):
    cam.location = loc; cam.rotation_euler = olhar(loc, alvo, rolar); cam.data.lens = lente
    cam.keyframe_insert('location', frame=q); cam.keyframe_insert('rotation_euler', frame=q); cam.data.keyframe_insert('lens', frame=q)
    cam.data.dof.use_dof = foco is not None
    if foco is not None:
        cam.data.dof.focus_distance = foco; cam.data.dof.aperture_fstop = f
        cam.data.dof.keyframe_insert('focus_distance', frame=q); cam.data.dof.keyframe_insert('aperture_fstop', frame=q)

OLHO_CHAO = Vector((.7, -10.6, altura(.7, -10.6) + .32))
if PLANO == 'geral':
    # do alto da duna anterior (crista em y=-46): o vale e, do outro lado, a face íngreme com a porta no topo
    cam_chave(1, (-12, -48, altura(-12, -48) + 2.0), (0, 0, CRISTA_Z + 4.5), 62)
    cam_chave(84, (-8, -40, altura(-8, -40) + 1.6), (0, 0, CRISTA_Z + 3.0), 70)
elif PLANO == 'porta':
    cam_chave(85, (2.6, -9.5, zc(-9.5) + 1.3), (0, 0, CRISTA_Z + 1.6), 40, foco=9.5, f=4)
    cam_chave(150, (1.6, -7.2, zc(-7.2) + 1.0), (0, -1.6, CRISTA_Z + .9), 36, foco=6., f=4)
elif PLANO == 'queda':
    cam_chave(151, (5.5, -3.2, zc(-3.2) + 1.6), (0, -3.4, zc(-3.4) + .5), 30, foco=5.5, f=4)
    cam_chave(185, (5.0, -7.4, zc(-7.4) + 1.1), (.4, -8.2, zc(-8.2) + .3), 30, foco=5., f=4)
    cam_chave(210, (3.6, -11.2, zc(-11.2) + .8), (.7, -10.35, zc(-10.35) + .2), 36, foco=3.2, f=4)
elif PLANO == 'pov':
    O = OLHO_CHAO
    # deitado de costas: o céu e o gigante; vira a cabeça para a areia; o capacete ao longe
    cam_chave(211, O, O + Vector((0, .3, 1)), 22, rolar=0, foco=200, f=8)
    cam_chave(240, O + Vector((0, 0, .02)), O + Vector((.15, .35, 1)), 22, rolar=-6, foco=200, f=8)
    cam_chave(262, O + Vector((.1, -.05, -.05)), O + Vector((.4, -1.2, .1)), 24, rolar=-30, foco=.6, f=1.8)
    cam_chave(285, O + Vector((.1, -.1, -.08)), CAP_POS + Vector((0, 0, .25)), 28, rolar=-14, foco=.5, f=1.8)
    cam_chave(305, O + Vector((.1, -.2, -.08)), CAP_POS + Vector((0, 0, .25)), 30, rolar=-8, foco=4.1, f=2.4)
    cam_chave(330, O + Vector((.12, -.6, -.06)), CAP_POS + Vector((0, 0, .25)), 32, rolar=-5, foco=3.7, f=2.4)
    # a mão entra no quadro e arranha a areia (dedos abrem e fecham)
    for q, dy, dz, c in ((262, -.25, -.25, .1), (272, -.42, -.1, .2), (280, -.62, -.2, .85), (290, -.62, -.21, .95), (300, -.8, -.12, .2), (310, -1.05, -.22, .9), (330, -1.2, -.21, .95)):
        mao_pose(q, O + Vector((-.14, dy - .3, dz + .08)), (-12, 0, 210), c, polegar=c * .6)   # a manga vem do canto de baixo à direita
elif PLANO == 'pega':
    O = OLHO_CHAO + Vector((.12, -.6, -.06))
    perto = CAP_POS + Vector((-.15, 1.0, .3))
    cam_chave(331, O, CAP_POS + Vector((0, 0, .25)), 32, rolar=-5, foco=3.7, f=2.4)
    cam_chave(362, perto + Vector((0, .5, .02)), CAP_POS + Vector((0, 0, .22)), 30, rolar=-3, foco=1.2, f=2.)
    cam_chave(378, perto, CAP_POS + Vector((0, 0, .22)), 30, rolar=0, foco=.8, f=2.)
    cam_chave(394, perto + Vector((0, 0, .04)), CAP_POS + Vector((0, .4, .5)), 30, rolar=0, foco=.55, f=2.)
    cam_chave(410, perto + Vector((0, 0, .06)), perto + Vector((0, -1, .2)), 30, rolar=0, foco=.3, f=2.)
    for q, loc, c in ((331, O + Vector((-.3, -.6, -.2)), .9), (350, O + Vector((-.32, -1.4, -.18)), .3), (366, CAP_POS + Vector((-.25, .6, .12)), .1),
                      (374, CAP_POS + Vector((-.12, .3, .2)), .2), (380, CAP_POS + Vector((-.1, .2, .22)), .85)):
        mao_pose(q, loc, (-8, 0, 210), c, polegar=c)
    # o capacete sobe e vem para a cabeça: a abertura vira para a câmera e a engole
    for q, loc, rot in ((380, CAP_POS, (8, -14, 25)), (392, CAP_POS + Vector((-.05, .45, .3)), (40, -8, 10)), (402, perto + Vector((0, -.45, .02)), (90, 0, 0)), (410, perto + Vector((0, -.02, .06)), (90, 0, 0))):
        CAPACETE.location = loc; CAPACETE.rotation_euler = Euler([math.radians(a) for a in rot])
        CAPACETE.keyframe_insert('location', frame=q); CAPACETE.keyframe_insert('rotation_euler', frame=q)
    for q, loc in ((392, CAP_POS + Vector((-.2, .5, .3))), (402, perto + Vector((-.3, -.35, -.05))), (410, perto + Vector((-.35, -.1, -.1)))):
        mao_pose(q, loc, (-20, 0, 205), .85, polegar=.85)
elif PLANO == 'visor':
    # de pé, de dentro do capacete: a escotilha emoldura a duna e o gigante
    O = Vector((1.0, -12.8, altura(1.0, -12.8) + 1.68))
    cam_chave(411, O + Vector((0, 0, -.35)), O + Vector((-.6, 12, .4)), 20, foco=40, f=11)
    cam_chave(460, O, O + Vector((-.4, 12, 2.2)), 20, foco=40, f=11)
    CAPACETE.location = O + Vector((0, -.08, -.24)); CAPACETE.rotation_euler = (0, 0, math.radians(180))
    MAO.hide_render = True
    # sobe junto com a câmera
    CAPACETE.keyframe_insert('location', frame=460); CAPACETE.location = O + Vector((0, -.08, -.59)); CAPACETE.keyframe_insert('location', frame=411)
    bpy.ops.object.light_add(type='POINT', location=O + Vector((0, -.05, .05))); dentro = bpy.context.object; dentro.data.energy = .6; dentro.data.color = (1., .7, .45); dentro.data.shadow_soft_size = .1
    dentro.keyframe_insert('location', frame=460); dentro.location = O + Vector((0, -.05, -.3)); dentro.keyframe_insert('location', frame=411)
    brilho.data.energy = 0
if PLANO not in ('pov', 'pega'): MAO.hide_render = True
if PLANO in ('geral',): CAPACETE.hide_render = False

# ═════════════════════════════ RENDER + NÉVOA (passe de névoa) ═════════════════════════════
r = sc.render; r.engine = os.environ.get('K14_MOTOR', 'CYCLES')
if r.engine == 'BLENDER_WORKBENCH':   # prévia rápida de pose e câmera
    sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_shadows = True; sh.show_cavity = True
    FEIXE_OBJ.hide_render = True
sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('K14_AMOSTRAS', 24)); sc.cycles.use_adaptive_sampling = True
sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 4
r.use_persistent_data = True
r.resolution_x, r.resolution_y = 1280, 608; r.resolution_percentage = int(os.environ.get('K14_ESCALA', 100))
r.use_motion_blur = True; r.motion_blur_shutter = .45
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -.15
sc.view_layers[0].use_pass_mist = True; sc.view_layers[0].use_pass_object_index = True
sc.world.mist_settings.start = 30; sc.world.mist_settings.depth = 900; sc.world.mist_settings.falloff = 'QUADRATIC'
sc.use_nodes = True; nt = sc.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); comp = nt.nodes.new('CompositorNodeComposite')
mx = nt.nodes.new('CompositorNodeMixRGB'); mx.blend_type = 'MIX'; mx.inputs[2].default_value = (.95, .55, .34, 1)
fat = nt.nodes.new('CompositorNodeMath'); fat.operation = 'MULTIPLY'; fat.inputs[1].default_value = .6
idm = nt.nodes.new('CompositorNodeIDMask'); idm.index = 7; idm.use_antialiasing = True
saida_idx = next((o for o in rl.outputs if o.name in ('IndexOB', 'Object Index')), None)
if saida_idx: nt.links.new(saida_idx, idm.inputs[0])
inv = nt.nodes.new('CompositorNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.
nt.links.new(idm.outputs[0], inv.inputs[1])
fat2 = nt.nodes.new('CompositorNodeMath'); fat2.operation = 'MULTIPLY'
saida_mist = next((o for o in rl.outputs if o.name == 'Mist'), None)
if saida_mist: nt.links.new(saida_mist, fat.inputs[0])
nt.links.new(fat.outputs[0], fat2.inputs[0]); nt.links.new(inv.outputs[0], fat2.inputs[1])
nt.links.new(fat2.outputs[0], mx.inputs['Fac'])
nt.links.new(rl.outputs['Image'], mx.inputs[1])
glare = nt.nodes.new('CompositorNodeGlare'); glare.glare_type = 'FOG_GLOW'; glare.quality = 'MEDIUM'; glare.threshold = 1.2; glare.size = 8
nt.links.new(mx.outputs[0], glare.inputs[0]); nt.links.new(glare.outputs[0], comp.inputs[0])
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGB'
r.use_overwrite = False; r.use_placeholder = True   # rodar de novo continua de onde parou
sc.frame_start, sc.frame_end = DE, ATE; sc.frame_step = PASSO
r.filepath = os.path.join(OUT, PLANO + '_')
bpy.ops.render.render(animation=True)
