"""Peças de latão da cabine art déco, modeladas no Blender (headless).
  blender -b -P cabine.py -- <saida.glb>
Coordenadas pensadas no espaço do jogo (Y pra cima, porta em +Z, cabine 6,5 x 6,0 x 4,0
centrada na origem). O Blender é Z-up e o export manda (x, y, z)_three = (x, z, -y)_blender,
então `P(x, y, z)` converte. Duas materiais só: `latao` e `vidro` (o jogo troca pelos dele)."""
import bpy, bmesh, sys, math
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
P = lambda x, y, z: (x, -z, y)

def mat(nome, cor, emit=0.0):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*cor, 1)
    b.inputs['Metallic'].default_value = 0.0 if emit else 0.85
    b.inputs['Roughness'].default_value = 0.35
    if emit:
        b.inputs['Emission Color'].default_value = (*cor, 1); b.inputs['Emission Strength'].default_value = emit
    return m
LATAO, VIDRO = mat('latao', (0.78, 0.55, 0.18)), mat('vidro', (1.0, 0.93, 0.75), 1.5)

def curva(nome, pontos, raio, fechado=False):
    cu = bpy.data.curves.new(nome, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = raio; cu.bevel_resolution = 2; cu.resolution_u = 6
    sp = cu.splines.new('POLY'); sp.points.add(len(pontos) - 1)
    for p, q in zip(sp.points, pontos): p.co = (*P(*q), 1)
    sp.use_cyclic_u = fechado
    ob = bpy.data.objects.new(nome, cu); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(LATAO); return ob

def arredonda(pts, r=0.25, n=5):
    """Quina viva vira arco: o corrimão de hotel é dobrado, não soldado em esquadro."""
    import mathutils as mu
    res = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = (mu.Vector(p) for p in pts[i - 1:i + 2])
        u, w = (a - b).normalized(), (c - b).normalized()
        p0, p1 = b + u * r, b + w * r
        for k in range(n + 1):
            t = k / n; res.append(tuple((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p1))
    res.append(pts[-1]); return res

# 1) corrimão em U pelas três paredes, com as pontas voltando para a parede
H = 1.0
trilho = [(-3.05, H, 2.3), (-2.9, H, 2.2), (-2.9, H, -2.75), (2.9, H, -2.75), (2.9, H, 2.2), (3.05, H, 2.3)]
curva('corrimao', arredonda(trilho), 0.04)
for (x, z, dx, dz) in [(-2.9, 1.0, -1, 0), (-2.9, -1.4, -1, 0), (-1.4, -2.75, 0, -1), (1.4, -2.75, 0, -1), (2.9, -1.4, 1, 0), (2.9, 1.0, 1, 0)]:
    curva('suporte', [(x, H, z), (x + dx * 0.12, H - 0.06, z + dz * 0.12), (x + dx * 0.25, H - 0.06, z + dz * 0.17)], 0.018)

# 2) moldura do mostrador acima da porta (meia-lua virada para dentro da cabine)
CY, CZ, R = 2.85, 2.86, 0.55  # o jogo usa os mesmos números (Elevator.tsx: MOSTRADOR)
arco = [(R * math.cos(math.pi * k / 24), CY + R * math.sin(math.pi * k / 24), CZ) for k in range(25)]
curva('moldura_mostrador', arco + [(-R, CY, CZ)], 0.045, fechado=True)
# (os raios do coroamento saíram: o letreiro de lâmpadas do Remotion ocupa esse anel)

# 3) luminária do teto: cúpula em degraus + bacia de vidro
def cil(nome, r1, r2, y, h, m, seg=32):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=h, location=P(0, y, 0))
    ob = bpy.context.active_object; ob.name = nome; ob.data.materials.append(m)
    bpy.ops.object.shade_smooth(); return ob
cil('lustre_a', 0.62, 0.62, 3.97, 0.05, LATAO)
cil('lustre_b', 0.5, 0.5, 3.92, 0.06, LATAO)
cil('lustre_c', 0.38, 0.38, 3.86, 0.07, LATAO)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=12, radius=0.36, location=P(0, 3.83, 0))
bacia = bpy.context.active_object; bacia.name = 'lustre_vidro'; bacia.scale = (1, 1, 0.45)
bm = bmesh.new(); bm.from_mesh(bacia.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.01], context='VERTS'); bm.to_mesh(bacia.data); bm.free()
bacia.data.materials.append(VIDRO); bpy.ops.object.shade_smooth()

# 4) pilastras de latão nas juntas dos painéis, com capitel em degraus
def caixa(nome, c, s):
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*c)); ob = bpy.context.active_object
    ob.name = nome; ob.scale = (s[0], s[2], s[1]); ob.data.materials.append(LATAO); return ob
for (x, z, nx, nz) in [(-3.15, -1.0, 1, 0), (-3.15, 1.0, 1, 0), (3.15, -1.0, -1, 0), (3.15, 1.0, -1, 0), (-1.6, -2.9, 0, 1), (1.6, -2.9, 0, 1)]:
    largo = lambda w: (0.04 if nx else w, 0, w if nx else 0.04)
    for (y, h, w, d) in [(1.95, 2.9, 0.07, 0.0), (3.47, 0.06, 0.13, 0.015), (3.53, 0.06, 0.19, 0.03), (0.6, 0.05, 0.13, 0.015)]:
        s = largo(w); caixa('pilastra', (x + nx * (0.02 + d), y, z + nz * (0.02 + d)), (s[0] + d, h, s[2] + d))

# junta tudo por material: menos draw calls no celular
bpy.ops.object.select_all(action='SELECT')
for ob in list(bpy.context.selected_objects):
    if ob.type == 'CURVE':
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.convert(target='MESH')
bpy.ops.object.select_all(action='DESELECT')
lat = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.materials[0].name == 'latao']
for o in lat: o.select_set(True)
bpy.context.view_layer.objects.active = lat[0]; bpy.ops.object.join(); lat[0].name = 'latao'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT')
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('OK', out, 'faces', tris)
