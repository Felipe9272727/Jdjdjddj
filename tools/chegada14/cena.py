"""A CHEGADA ao Andar 14 (Kessar-9), no Blender (headless, Cycles CPU).
  blender -b -P cena.py -- <pasta_saida> [plano] [de] [ate]
Planos: A = geral (a porta da casa-elevador no meio das dunas se abre num clarão,
o hóspede sai cambaleando e cai de joelhos); B = baixo, por trás (ele desaba na
areia; ao longe, o brilho do capacete); C = POV (um quadro só: a areia de perto e o
capacete brilhando — o Remotion anima o sufoco por cima)."""
import bpy, sys, math, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]; PLANO = args[1] if len(args) > 1 else 'A'
DE = int(args[2]) if len(args) > 2 else 1; ATE = int(args[3]) if len(args) > 3 else 72
bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

def mat(nome, cor, rough=.9, metal=0., emit=0., ecor=None):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*cor, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*(ecor or cor), 1); b.inputs['Emission Strength'].default_value = emit
    return m

# ── céu: gradiente alienígena + sol baixo (Nishita não: cor controlada) ──
w = bpy.data.worlds.new('ceu'); cena.world = w; w.use_nodes = True
nt = w.node_tree; bg = nt.nodes['Background']
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(tc.outputs['Normal'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs[0])
el = ramp.color_ramp.elements
el[0].position = 0; el[0].color = (1.0, 0.55, 0.30, 1)
el[1].position = .75; el[1].color = (0.03, 0.02, 0.09, 1)
mid = el.new(.18); mid.color = (0.50, 0.20, 0.42, 1)
nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.1

# o céu como uma esfera emissiva enorme (o gradiente do World não pegava): Z gerado 0,5 = horizonte
bpy.ops.mesh.primitive_uv_sphere_add(radius=1500, segments=48, ring_count=24, location=(0, 0, 0)); cupula = bpy.context.object
mc = bpy.data.materials.new('cupula'); mc.use_nodes = True; n2 = mc.node_tree; n2.nodes.clear()
o2 = n2.nodes.new('ShaderNodeOutputMaterial'); em = n2.nodes.new('ShaderNodeEmission'); tc2 = n2.nodes.new('ShaderNodeTexCoord'); sp2 = n2.nodes.new('ShaderNodeSeparateXYZ'); r2 = n2.nodes.new('ShaderNodeValToRGB')
n2.links.new(tc2.outputs['Generated'], sp2.inputs[0]); n2.links.new(sp2.outputs['Z'], r2.inputs[0]); n2.links.new(r2.outputs['Color'], em.inputs['Color']); n2.links.new(em.outputs[0], o2.inputs['Surface'])
e2 = r2.color_ramp.elements; e2[0].position = .5; e2[0].color = (1.0, .5, .25, 1); e2[1].position = .7; e2[1].color = (.02, .015, .07, 1)
m2 = e2.new(.56); m2.color = (.62, .22, .42, 1)
em.inputs['Strength'].default_value = 1.0; cupula.data.materials.append(mc); cupula.visible_shadow = False
# sol (luz) e o planeta anelado (malha emissiva no céu)
bpy.ops.object.light_add(type='SUN', location=(0, 0, 10)); sol = bpy.context.object
sol.data.energy = 3.2; sol.data.color = (1, .78, .55); sol.data.angle = .02
sol.rotation_euler = (math.radians(78), 0, math.radians(-35))
bpy.ops.mesh.primitive_uv_sphere_add(radius=60, location=(-260, 520, 170)); pl = bpy.context.object
pl.data.materials.append(mat('planeta', (.79, .65, .84), emit=.45)); bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_circle_add(vertices=96, radius=120, fill_type='NOTHING', location=pl.location); anel = bpy.context.object
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.extrude_region_shrink_fatten(TRANSFORM_OT_shrink_fatten={'value': -35}); bpy.ops.object.mode_set(mode='OBJECT')
anel.rotation_euler = (math.radians(70), math.radians(-25), 0)
anel.data.materials.append(mat('anel', (.92, .83, .75), emit=.35))

# ── chão: dunas (subdivisão + deslocamento por ruído) ──
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0)); chao = bpy.context.object
mod = chao.modifiers.new('sub', 'SUBSURF'); mod.subdivision_type = 'SIMPLE'; mod.levels = mod.render_levels = 7
tx = bpy.data.textures.new('dunas', 'CLOUDS'); tx.noise_scale = 22; tx.noise_depth = 2
d = chao.modifiers.new('dunas', 'DISPLACE'); d.texture = tx; d.strength = 6; d.mid_level = .5
tx2 = bpy.data.textures.new('serras', 'CLOUDS'); tx2.noise_scale = 60; tx2.noise_basis = 'VORONOI_F2'
areia = mat('areia', (.82, .45, .22), rough=.95)
chao.data.materials.append(areia); bpy.ops.object.shade_smooth()
# serras ao fundo
tx3 = bpy.data.textures.new('rocha', 'CLOUDS'); tx3.noise_scale = .35; tx3.noise_depth = 4; tx3.noise_basis = 'VORONOI_F2'
for i, (x, y, s) in enumerate([(-130, 260, 70), (40, 320, 95), (200, 250, 60), (-280, 170, 55), (120, 380, 120)]):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=1, location=(x, y, 0))
    c = bpy.context.object; c.scale = (s * 1.6, s * .7, s * .9); c.rotation_euler = (0, 0, i)
    dm = c.modifiers.new('d', 'DISPLACE'); dm.texture = tx3; dm.strength = .45
    c.data.materials.append(mat(f'serra{i}', (.30, .12, .10), rough=.9)); bpy.ops.object.shade_smooth()
# cristais verdes
cr = mat('cristal', (.03, .7, .4), rough=.15, emit=4., ecor=(.02, 1, .45))
for i in range(14):
    a = i * 2.4; r = 8 + (i % 5) * 3
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.5 + (i % 3) * .3, depth=2 + (i % 4), location=(math.cos(a) * r + 6, math.sin(a) * r + 14, .6))
    o = bpy.context.object; o.rotation_euler = (math.radians((i * 37) % 30 - 15), math.radians((i * 23) % 30 - 15), a); o.data.materials.append(cr)

# ── a PORTA da casa-elevador de Vindhjem, sozinha nas dunas ──
madeira = mat('madeira', (.36, .2, .09), rough=.8); latao = mat('latao', (.8, .58, .2), rough=.3, metal=.9)
for lx in (-.8, .8):   # batentes de troncos e a verga com cabeças de dragão (a porta de Vindhjem)
    bpy.ops.mesh.primitive_cylinder_add(radius=.18, depth=3.4, location=(lx, 0, 1.6)); bpy.context.object.data.materials.append(madeira)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 3.35)); v = bpy.context.object; v.scale = (2.3, .4, .3); v.data.materials.append(madeira)
for lx in (-1.25, 1.25):
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=.18, depth=.8, location=(lx, 0, 3.6)); o = bpy.context.object; o.rotation_euler = (0, math.copysign(.9, lx), 0); o.data.materials.append(madeira)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, .2, 1.6)); bat = bpy.context.object; bat.scale = (1.5, .1, 3.2); bat.data.materials.append(madeira)
# vão (luz quente lá de dentro) e as duas folhas de latão
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -.16, 1.45)); vao = bpy.context.object; vao.scale = (1.1, 2.6, 1); vao.rotation_euler = (math.radians(90), 0, 0)
luzv = mat('luzdavao', (1, .75, .4), emit=0.); vao.data.materials.append(luzv)
folhas = []
for lado in (-1, 1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(lado * .28, -.2, 1.45)); f = bpy.context.object; f.scale = (.56, .06, 2.6); f.data.materials.append(latao); folhas.append((f, lado))
bpy.ops.object.light_add(type='AREA', location=(0, -.6, 1.5)); clarao = bpy.context.object; clarao.data.size = 1.2; clarao.data.color = (1, .78, .45); clarao.rotation_euler = (math.radians(90), 0, 0)

# ── o hóspede: silhueta simples (jaqueta azul) ──
jaq = mat('jaqueta', (.15, .27, .5), rough=.7); pele = mat('pele', (.8, .6, .45), rough=.6)
partes = {}
def peca(nome, prim, loc, esc, m):
    getattr(bpy.ops.mesh, prim)(location=loc); o = bpy.context.object; o.scale = esc; o.data.materials.append(m); o.name = nome; return o
bpy.ops.object.empty_add(location=(0, -.3, 0)); corpo = bpy.context.object
tronco = peca('tronco', 'primitive_cube_add', (0, 0, 1.15), (.22, .14, .36), jaq); tronco.parent = corpo
cab = peca('cab', 'primitive_uv_sphere_add', (0, 0, 1.68), (.15, .15, .17), pele); cab.parent = corpo
for lado in (-1, 1):
    b = peca(f'braco{lado}', 'primitive_cube_add', (lado * .3, 0, 1.15), (.06, .06, .3), jaq); b.parent = corpo; partes[f'b{lado}'] = b
    p = peca(f'perna{lado}', 'primitive_cube_add', (lado * .11, 0, .42), (.08, .09, .42), mat(f'calca{lado}', (.12, .1, .12))); p.parent = corpo; partes[f'p{lado}'] = p

# ── o capacete brilhando ao longe ──
bpy.ops.mesh.primitive_uv_sphere_add(radius=.35, location=(3, -14, .3)); cap = bpy.context.object
cap.data.materials.append(mat('capacete', (.45, .28, .12), rough=.6, emit=3., ecor=(1, .62, .25)))
bpy.ops.object.light_add(type='POINT', location=(3, -14, 1)); fl = bpy.context.object; fl.data.energy = 300; fl.data.color = (1, .7, .35)

# ── animação ──
cena.render.fps = 24
def kf(o, path, quadro, val):
    setattr(o, path, val) if not isinstance(val, tuple) else setattr(o, path, val); o.keyframe_insert(data_path=path, frame=quadro)
# a porta abre em 14–22 num clarão
for f, lado in folhas:
    f.location = (lado * .28, -.2, 1.45); f.keyframe_insert('location', frame=12)
    f.location = (lado * .85, -.2, 1.45); f.keyframe_insert('location', frame=22)
luzv.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0; luzv.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].keyframe_insert('default_value', frame=12)
luzv.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 25; luzv.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].keyframe_insert('default_value', frame=18)
luzv.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 4; luzv.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].keyframe_insert('default_value', frame=40)
clarao.data.energy = 0; clarao.data.keyframe_insert('energy', frame=12); clarao.data.energy = 2500; clarao.data.keyframe_insert('energy', frame=18); clarao.data.energy = 300; clarao.data.keyframe_insert('energy', frame=40)
# ele sai cambaleando (de dentro do vão) e cai de joelhos, depois de cara
poses = [(18, (0, .2, 0), 0, 0), (26, (0, -1.0, 0), -8, 0), (34, (.15, -2.1, 0), 10, 0), (42, (-.1, -3.0, 0), -6, 0), (50, (0, -3.6, -.35), 25, 0),
         (60, (0, -3.7, -.45), 30, 0), (78, (0, -3.9, -.5), 30, 0), (90, (0, -4.3, -1.0), 80, 0), (120, (0, -4.4, -1.05), 86, 0)]
for q, loc, inc, _ in poses:
    corpo.location = loc; corpo.keyframe_insert('location', frame=q)
    corpo.rotation_euler = (math.radians(-inc), 0, math.radians(180)); corpo.keyframe_insert('rotation_euler', frame=q)
for q in range(18, 121, 4):   # pernas e braços tropeçando, depois a mão na garganta
    s = math.sin(q * .9) * (35 if q < 50 else 6)
    for lado in (-1, 1):
        partes[f'p{lado}'].rotation_euler = (math.radians(s * lado), 0, 0); partes[f'p{lado}'].keyframe_insert('rotation_euler', frame=q)
        partes[f'b{lado}'].rotation_euler = (math.radians(-130 if q > 46 and lado < 0 else -s * lado * .8), 0, 0); partes[f'b{lado}'].keyframe_insert('rotation_euler', frame=q)
# pulso do capacete
for q in range(1, 121, 10):
    fl.data.energy = 150 if (q // 10) % 2 else 420; fl.data.keyframe_insert('energy', frame=q)

# ── câmeras ──
bpy.ops.object.camera_add(); cam = bpy.context.object; cena.camera = cam; cam.data.lens = 28
def olhar(o, alvo):
    d = Vector(alvo) - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
if PLANO == 'A':
    for q, pos, alvo in [(1, (9, -16, 2.2), (0, 0, 2.6)), (60, (7, -13, 1.8), (0, -2, 1.6))]:
        cam.location = pos; olhar(cam, alvo); cam.keyframe_insert('location', frame=q); cam.keyframe_insert('rotation_euler', frame=q)
elif PLANO == 'B':
    cam.data.lens = 35
    for q, pos, alvo in [(60, (1.2, -1.0, .6), (0, -6, .6)), (120, (.8, -1.8, .45), (1.5, -12, .4))]:
        cam.location = pos; olhar(cam, alvo); cam.keyframe_insert('location', frame=q); cam.keyframe_insert('rotation_euler', frame=q)
else:  # C: POV de quem está caído
    cam.data.lens = 22; cam.location = (0, -4.9, .35); olhar(cam, (3, -14, .5)); corpo.hide_render = True

# ── render ──
cena.render.engine = 'CYCLES'; cena.cycles.device = 'CPU'; cena.cycles.samples = 24; cena.cycles.use_denoising = True
cena.render.resolution_x, cena.render.resolution_y = 1280, 608; cena.render.resolution_percentage = 100
cena.view_settings.view_transform = 'Standard'; cena.view_settings.look = 'Medium High Contrast'
cena.render.film_transparent = False
cena.render.image_settings.file_format = 'JPEG'; cena.render.image_settings.quality = 92
cena.frame_start, cena.frame_end = DE, ATE
cena.render.filepath = os.path.join(OUT, PLANO + '_')
bpy.ops.render.render(animation=True)
