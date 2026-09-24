"""
f13_nuvens.py — renderiza nuvens volumétricas de verdade no Cycles e as
salva num atlas 2×2 com alfa, para o jogo usar como impostores (cartões
virados para a câmera). Uma nuvem de volume custaria caro demais no
celular; o atlas guarda a luz e a maciez do volume por quase nada.

    blender -b -P tools/blender/f13_nuvens.py -- <saida.png>
"""
import bpy, math, random, sys

saida = sys.argv[sys.argv.index('--') + 1]
random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

mat = bpy.data.materials.new('nuvem'); mat.use_nodes = True
nt = mat.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
vol = nt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Color'].default_value = (1, 1, 1, 1)
vol.inputs['Anisotropy'].default_value = .55
coord = nt.nodes.new('ShaderNodeTexCoord')
ruido = nt.nodes.new('ShaderNodeTexNoise'); ruido.inputs['Scale'].default_value = 2.2; ruido.inputs['Detail'].default_value = 8; ruido.inputs['Roughness'].default_value = .62
nt.links.new(coord.outputs['Object'], ruido.inputs['Vector'])
rampa = nt.nodes.new('ShaderNodeValToRGB')
rampa.color_ramp.elements[0].position = .3; rampa.color_ramp.elements[0].color = (0, 0, 0, 1)
rampa.color_ramp.elements[1].position = .66; rampa.color_ramp.elements[1].color = (1, 1, 1, 1)
nt.links.new(ruido.outputs['Fac'], rampa.inputs['Fac'])
mult = nt.nodes.new('ShaderNodeMath'); mult.operation = 'MULTIPLY'; mult.inputs[1].default_value = 30
nt.links.new(rampa.outputs['Color'], mult.inputs[0])
# base reta: a densidade some abaixo de um plano (cúmulo tem fundo liso)
sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(coord.outputs['Object'], sep.inputs['Vector'])
fundo = nt.nodes.new('ShaderNodeMapRange'); fundo.inputs['From Min'].default_value = -.3; fundo.inputs['From Max'].default_value = -.18
nt.links.new(sep.outputs['Z'], fundo.inputs['Value'])
corta = nt.nodes.new('ShaderNodeMath'); corta.operation = 'MULTIPLY'
nt.links.new(mult.outputs['Value'], corta.inputs[0]); nt.links.new(fundo.outputs['Result'], corta.inputs[1])
nt.links.new(corta.outputs['Value'], vol.inputs['Density'])
nt.links.new(vol.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume'])

W = 2.2
for k in range(4):
    cx, cz = (k % 2) * W, (k // 2) * W
    mb = bpy.data.metaballs.new(f'n{k}'); mb.resolution = .08
    o = bpy.data.objects.new(f'n{k}', mb); cena.collection.objects.link(o)
    o.location = (cx - W / 2, 0, cz - W / 2)
    n = 7 + k * 2
    for i in range(n):
        el = mb.elements.new()
        a = (i / n - .5) * 1.7
        alto = (1 - abs(a) / .85) ** .7
        el.co = (a + random.uniform(-.12, .12), random.uniform(-.25, .25), -.35 + alto * random.uniform(.25, .6))
        el.radius = random.uniform(.38, .62) * (.55 + .45 * alto)
    bpy.context.view_layer.objects.active = o
    for x in cena.objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    bpy.context.object.data.materials.append(mat)

cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = W * 2
co = bpy.data.objects.new('c', cam); cena.collection.objects.link(co); cena.camera = co
co.location = (0, -6, .05); co.rotation_euler = (math.pi / 2, 0, 0)
sol = bpy.data.lights.new('s', 'SUN'); sol.energy = 7; sol.color = (1, .93, .82)
so = bpy.data.objects.new('s', sol); cena.collection.objects.link(so); so.rotation_euler = (math.radians(58), 0, math.radians(-35))
w = bpy.data.worlds.new('w'); cena.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .68, .9, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .55
cena.render.engine = 'CYCLES'; cena.cycles.samples = 96; cena.cycles.volume_bounces = 8
cena.cycles.volume_step_rate = 2
cena.render.film_transparent = True
cena.render.resolution_x = cena.render.resolution_y = 1024
cena.view_settings.view_transform = 'AgX'
cena.render.image_settings.color_mode = 'RGBA'
cena.render.filepath = saida
bpy.ops.render.render(write_still=True)
