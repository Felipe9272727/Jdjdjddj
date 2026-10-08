"""A ENTIDADE de Kessar-9, modelada no Blender (procedural, sem esculpir à mão).

    blender -b -P tools/chegada14/entidade.py -- [saida.glb] [saida.blend] [previa.png]

Uma figura de ~2,6 m num manto: dobras verticais que se abrem até a barra, barra rasgada em tiras,
uma capa curta sobre os ombros (camadas de pano), capuz fundo com a ponta caída para trás, mangas
caídas de punho rasgado e um braço longo, fino e escuro (pele com nós dos dedos, quatro dedos
compridos). Dentro do capuz, o vazio e dois olhos pálidos.

Saídas:
  - .glb para o jogo (jubileu/public/kessar/entidade.glb): objetos manto, capa, capuz, mangaE,
    ombroD (pivô do braço: mangaD + braco), vazio, olhos. Materiais e UVs vão juntos; o jogo troca o
    material do pano pelo shader dele (borda violeta, barra que se desfaz) usando as mesmas texturas.
  - .blend para as cutscenes (append da coleção "Entidade").
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, noise

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
GLB = args[0] if len(args) > 0 else os.path.join(RAIZ, 'jubileu/public/kessar/entidade.glb')
BLEND = args[1] if len(args) > 1 else os.path.join(AQUI, 'frames/entidade.blend')
PREVIA = args[2] if len(args) > 2 else ''
random.seed(14)

if __name__ == '__main__' or not bpy.data.objects:
    bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
TEX = os.path.join(AQUI, 'tex')

# ═════════════════════════════ materiais ═════════════════════════════
def tex_no(m, arq, dados=False, escala=1.):
    nt = m.node_tree
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEX, arq), check_existing=True)
    if dados: t.image.colorspace_settings.name = 'Non-Color'
    uv = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (escala, escala, escala)
    nt.links.new(uv.outputs['UV'], mp.inputs[0]); nt.links.new(mp.outputs[0], t.inputs[0])
    return t

def pano(nome, base, escala, tom, brilho_violeta=.35):
    """Pano escuro com textura real: cor multiplicada para quase preto, mapa normal, veludo (sheen) violeta."""
    m = bpy.data.materials.new(nome); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    d = tex_no(m, f'{base}_diff.jpg', escala=escala); mx = nt.nodes.new('ShaderNodeMixRGB'); mx.blend_type = 'MULTIPLY'; mx.inputs['Fac'].default_value = 1
    cinza = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(d.outputs['Color'], cinza.inputs[0])   # da foto, só a luz e a trama (a cor é nossa)
    mx.inputs['Color2'].default_value = (*tom, 1); nt.links.new(cinza.outputs[0], mx.inputs['Color1']); nt.links.new(mx.outputs['Color'], b.inputs['Base Color'])
    n = tex_no(m, f'{base}_nor.jpg', dados=True, escala=escala); nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.2
    nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    r = tex_no(m, f'{base}_rough.jpg', dados=True, escala=escala); nt.links.new(r.outputs['Color'], b.inputs['Roughness'])
    b.inputs['Sheen Weight'].default_value = 1.; b.inputs['Sheen Tint'].default_value = (.45, .3, .9, 1); b.inputs['Sheen Roughness'].default_value = .35
    # contraluz violeta (só no contorno): Layer Weight → emissão fraca
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = .25
    em = nt.nodes.new('ShaderNodeMath'); em.operation = 'POWER'; em.inputs[1].default_value = 2.5
    nt.links.new(lw.outputs['Facing'], em.inputs[0]); nt.links.new(em.outputs[0], b.inputs['Emission Strength'])
    b.inputs['Emission Color'].default_value = (.35 * brilho_violeta, .15 * brilho_violeta, .9 * brilho_violeta, 1)
    return m

MANTO = pano('e_manto', 'velour_velvet', 3., (.05, .045, .065))
LINHO = pano('e_linho', 'rough_linen', 4., (.045, .04, .055), .45)
PELE = bpy.data.materials.new('e_pele'); PELE.use_nodes = True
_b = PELE.node_tree.nodes['Principled BSDF']; _b.inputs['Base Color'].default_value = (.012, .01, .016, 1); _b.inputs['Roughness'].default_value = .35
_b.inputs['Coat Weight'].default_value = .6; _b.inputs['Sheen Weight'].default_value = .5; _b.inputs['Sheen Tint'].default_value = (.5, .35, 1, 1)
VAZIO = bpy.data.materials.new('e_vazio'); VAZIO.use_nodes = True
VAZIO.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0, 0, 0, 1); VAZIO.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
OLHO = bpy.data.materials.new('e_olho'); OLHO.use_nodes = True
_o = OLHO.node_tree.nodes['Principled BSDF']; _o.inputs['Base Color'].default_value = (.8, .76, 1, 1)
_o.inputs['Emission Color'].default_value = (.85, .8, 1, 1); _o.inputs['Emission Strength'].default_value = 6.

# ═════════════════════════════ geometria ═════════════════════════════
def objeto(nome, bm, mat, suave=True):
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nome, me); COL.objects.link(o); o.data.materials.append(mat)
    if suave:
        for p in me.polygons: p.use_smooth = True
    return o

def dobras(theta, h, amp):
    """Dobras verticais de pano: soma de senos em três frequências + ruído (cresce com amp)."""
    return amp * (.55 * math.sin(7 * theta + 1.3) + .3 * math.sin(11 * theta + h * 1.7) + .2 * math.sin(17 * theta + .4) +
                  .35 * noise.noise(Vector((math.cos(theta) * 2.5, math.sin(theta) * 2.5, h * 1.8))))

def torneado(nome, perfil, voltas, mat, amp_dobra, rasgo=0., rasgo_alt=.25, uv_escala=1.):
    """Peça de pano torneada a partir de um perfil [(raio, altura)] (de cima para baixo), com dobras
    e (opcional) barra rasgada: as faces mais baixas somem em tiras irregulares."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    linhas = []
    for i, (r, h) in enumerate(perfil):
        k = i / (len(perfil) - 1)   # 0 em cima … 1 embaixo
        anel = []
        for j in range(voltas):
            th = j / voltas * math.tau
            rr = r + dobras(th, h, amp_dobra(k)); z = h
            if rasgo:   # tiras pontudas: dente de serra irregular + ruído; o pano "sobe" até o rasgo
                base = perfil[-1][1]
                dente = abs(((th * 11 / math.tau + .37 * noise.noise(Vector((th * 3., 1., 2.)))) % 1.) - .5) * 2
                rasg = base + rasgo_alt * (.15 + .85 * dente ** 1.6) * (.6 + .4 * noise.noise(Vector((math.cos(th) * 4, math.sin(th) * 4, 3.))) + .4)
                if z < rasg: z = rasg - (rasg - z) * .06
            anel.append(bm.verts.new((math.cos(th) * rr, math.sin(th) * rr * .86, z)))   # um pouco achatado (ombros)
        linhas.append(anel)
    bm.verts.ensure_lookup_table()
    for i in range(len(linhas) - 1):
        for j in range(voltas):
            a, b, c, d = linhas[i][j], linhas[i][(j + 1) % voltas], linhas[i + 1][(j + 1) % voltas], linhas[i + 1][j]
            hmed = (a.co.z + c.co.z) / 2; th = (j + .5) / voltas * math.tau
            f = bm.faces.new((a, b, c, d))
            for lp, (u, v) in zip(f.loops, ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1))):
                lp[uv].uv = (u / voltas * 4 * uv_escala, v / len(perfil) * 6 * uv_escala)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    o = objeto(nome, bm, mat)
    s = o.modifiers.new('espessura', 'SOLIDIFY'); s.thickness = .012; s.offset = 0
    return o

COL = bpy.data.collections.new('Entidade'); sc.collection.children.link(COL)
raiz = bpy.data.objects.new('entidade', None); COL.objects.link(raiz)

# manto: do pescoço ao chão, ombros caídos, abre embaixo
perfil_manto = [(.13, 2.12), (.2, 2.06), (.33, 1.98), (.37, 1.88), (.36, 1.7), (.35, 1.5), (.37, 1.25), (.41, 1.0), (.46, .75), (.52, .5), (.58, .28), (.63, .1), (.66, 0.)]
perfil_manto = [(r, h) for (r, h) in perfil_manto]
dens = []
for (r0, h0), (r1, h1) in zip(perfil_manto, perfil_manto[1:]):
    for t in range(6): dens.append((r0 + (r1 - r0) * t / 6, h0 + (h1 - h0) * t / 6))
dens.append(perfil_manto[-1])
manto = torneado('manto', dens, 132, MANTO, lambda k: .004 + .07 * k ** 1.4, rasgo=1., rasgo_alt=.32)
# capa curta sobre os ombros (camadas)
dens_capa = []
for (r0, h0), (r1, h1) in zip([(.15, 2.1), (.3, 2.02), (.44, 1.9), (.5, 1.72), (.52, 1.55)], [(.3, 2.02), (.44, 1.9), (.5, 1.72), (.52, 1.55), (.53, 1.45)]):
    for t in range(5): dens_capa.append((r0 + (r1 - r0) * t / 5, h0 + (h1 - h0) * t / 5))
dens_capa.append((.53, 1.45))
capa = torneado('capa', dens_capa, 110, LINHO, lambda k: .006 + .035 * k, rasgo=1., rasgo_alt=.09, uv_escala=.6)

# capuz: casca esférica aberta na frente, ponta caída para trás
def capuz():
    bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    NT, NP = 28, 56; abre = math.radians(52)   # meia-abertura do rosto
    grade = {}
    for i in range(NT + 1):
        th = i / NT * math.pi * .86            # do topo até abaixo do queixo
        for j in range(NP + 1):
            ph = abre + j / NP * (math.tau - 2 * abre)   # contorna por trás (ph = π), deixa a frente (+y, ph = 0) aberta
            r = .27 + .012 * math.sin(ph * 9 + th * 4) + .01 * noise.noise(Vector((math.cos(ph) * 3, math.sin(ph) * 3, th * 3)))
            x, y, z = math.sin(th) * math.sin(ph) * r, math.sin(th) * math.cos(ph) * r * 1.12, math.cos(th) * r * 1.25
            atras = max(0., -math.cos(ph)) * max(0., math.cos(th))   # a ponta: puxada para trás e para baixo
            y -= atras ** 2 * .22; z += atras ** 2 * .06 - atras ** 3 * .1
            grade[i, j] = bm.verts.new((x, y, z))
    for i in range(NT):
        for j in range(NP):
            f = bm.faces.new((grade[i, j], grade[i, j + 1], grade[i + 1, j + 1], grade[i + 1, j]))
            for lp, (u, v) in zip(f.loops, ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1))): lp[uv].uv = (u / NP * 3, v / NT * 2)
    o = objeto('capuz', bm, LINHO)
    s = o.modifiers.new('espessura', 'SOLIDIFY'); s.thickness = .018; s.offset = 0
    return o
cap = capuz(); cap.location = (0, .01, 2.26)

# mangas: tubos caídos que alargam e rasgam no punho
def manga(nome):
    perfil = []
    for t in range(14):
        k = t / 13; perfil.append((.075 + .1 * k ** 1.3, -k * 1.0))
    o = torneado(nome, perfil, 36, MANTO, lambda k: .003 + .03 * k, rasgo=1., rasgo_alt=.14)
    return o
mE = manga('mangaE'); mE.location = (-.36, 0, 1.98); mE.rotation_euler = (0, math.radians(-7), 0)
ombro = bpy.data.objects.new('ombroD', None); COL.objects.link(ombro); ombro.location = (.36, 0, 1.98); ombro.rotation_euler = (0, math.radians(7), 0)
mD = manga('mangaD'); mD.parent = ombro

# o braço: pele escura e lisa, comprida demais; nós dos dedos (pele de vértices + subdivisão)
def braco():
    J = {'ombro': ((0, 0, -.35), .05), 'cotovelo': ((0, .02, -.72), .042), 'pulso': ((0, .03, -1.08), .03), 'palma': ((0, .04, -1.17), .036)}
    arestas = [('ombro', 'cotovelo'), ('cotovelo', 'pulso'), ('pulso', 'palma')]
    for d, (dx, comp) in enumerate(((-.03, .24), (-.01, .27), (.01, .26), (.03, .22))):
        ant = 'palma'
        for s in range(4):
            nome = f'd{d}{s}'; J[nome] = ((dx * (1 + s * .25), .04 + s * .012, -1.19 - (s + 1) * comp / 4), .011 - s * .0018)
            arestas.append((ant, nome)); ant = nome
    J['p0'] = ((-.045, .05, -1.15), .012); J['p1'] = ((-.07, .08, -1.21), .01); J['p2'] = ((-.08, .1, -1.27), .008)
    arestas += [('palma', 'p0'), ('p0', 'p1'), ('p1', 'p2')]
    nomes = list(J); idx = {n: i for i, n in enumerate(nomes)}
    me = bpy.data.meshes.new('braco'); me.from_pydata([J[n][0] for n in nomes], [(idx[a], idx[b]) for a, b in arestas], []); me.update()
    o = bpy.data.objects.new('braco', me); COL.objects.link(o)
    sk = o.modifiers.new('pele', 'SKIN')
    for n in nomes: r = J[n][1]; me.skin_vertices[0].data[idx[n]].radius = (r, r * (.6 if n == 'palma' else .9))
    me.skin_vertices[0].data[idx['ombro']].use_root = True
    sub = o.modifiers.new('liso', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    for p in o.data.polygons: p.use_smooth = True
    o.data.materials.append(PELE)
    return o
br = braco(); br.parent = ombro

# o vazio dentro do capuz e os olhos
bpy.ops.mesh.primitive_uv_sphere_add(radius=.21, segments=24, ring_count=16, location=(0, -.03, 2.22)); vz = bpy.context.object; vz.name = 'vazio'
vz.scale = (1, .8, 1.2); vz.data.materials.append(VAZIO)
for c in list(vz.users_collection): c.objects.unlink(vz)
COL.objects.link(vz)
olhos = []
for x in (-.06, .06):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.01, segments=12, ring_count=8, location=(x, .14, 2.24)); o = bpy.context.object; o.data.materials.append(OLHO)
    for c in list(o.users_collection): c.objects.unlink(o)
    COL.objects.link(o); olhos.append(o)
bpy.context.view_layer.objects.active = olhos[0]
for o in olhos: o.select_set(True)
bpy.ops.object.join(); olhos[0].name = 'olhos'

for o in (manto, capa, cap, mE, ombro, vz, olhos[0]): o.parent = raiz
# a figura olha para +y (frente). No jogo (y para cima) o exportador gira: frente vira +z.

# ═════════════════════════════ saídas ═════════════════════════════
def aplicar_modificadores():
    for o in COL.objects:
        if o.type == 'MESH' and o.modifiers:
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)

if __name__ == '__main__':
    aplicar_modificadores()
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)   # as cutscenes usam a malha cheia
    # o jogo leva uma versão mais leve (o pano grande vira ~40% das faces; a silhueta não muda)
    for o in COL.objects:
        if o.type == 'MESH' and o.name in ('manto', 'capa', 'capuz', 'mangaE', 'mangaD', 'braco'):
            d = o.modifiers.new('leve', 'DECIMATE'); d.ratio = .4 if o.name in ('manto', 'capa') else .55
            bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='leve')
    bpy.ops.object.select_all(action='DESELECT')
    for o in COL.objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_image_format='NONE', export_materials='PLACEHOLDER', export_normals=True, export_texcoords=True)
    tris = sum(len(o.data.polygons) for o in COL.objects if o.type == 'MESH')
    print('ENTIDADE', GLB, os.path.getsize(GLB) // 1024, 'KB', tris, 'faces')
    if PREVIA:   # uma prévia em Cycles com luz de deserto
        bpy.ops.object.camera_add(location=(1.6, 4.6, 1.9)); cam = bpy.context.object; sc.camera = cam
        d = Vector((0, 0, 1.5)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
        bpy.ops.object.light_add(type='SUN', location=(0, 0, 10)); s = bpy.context.object; s.data.energy = 4; s.data.color = (1, .75, .5)
        s.rotation_euler = (Vector((0, 0, 0)) - Vector((-2, -6, 2.5))).to_track_quat('-Z', 'Y').to_euler()   # contraluz
        bpy.ops.object.light_add(type='AREA', location=(2, 4, 3)); a = bpy.context.object; a.data.energy = 120; a.data.size = 3
        a.rotation_euler = (Vector((0, 0, 1.5)) - a.location).to_track_quat('-Z', 'Y').to_euler()
        w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.85, .5, .33, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .6
        bpy.ops.mesh.primitive_plane_add(size=30); chao = bpy.context.object; mc = bpy.data.materials.new('chao'); chao.data.materials.append(mc)
        mc.use_nodes = True; mc.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.5, .27, .14, 1)
        r = sc.render; r.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True; r.resolution_x, r.resolution_y = 720, 900
        sc.view_settings.view_transform = 'AgX'; r.filepath = PREVIA; bpy.ops.render.render(write_still=True)
