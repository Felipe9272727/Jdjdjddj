"""Original Floor 2 cinematic. Blender 4.0.2, Eevee or Cycles.
Game coordinates (x,y,z) become Blender (x,-z,y). The original concierge GLB
and cave PBR maps are reused, with the well at game (0,5), radius 3, water -2.5m.
blender -b -t 4 -P tools/floor2-cinematic/scene.py -- [shot|all] [first] [last]
F2_SCALE=50 renders previews; F2_ENGINE=CYCLES selects offline path tracing.
F2_STEP=8 samples the deliberately slow dollies at 3 fps for optical interpolation.
"""
import bpy, math, json, os, sys, random
from mathutils import Vector, noise
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
OUT=HERE/'frames/blender'; OUT.mkdir(parents=True,exist_ok=True)
DATA=json.loads((HERE/'scene-data.json').read_text())
TIMING=json.loads((ROOT/'jubileu/src/Floor2/cinematic.json').read_text())
SHOTS=[{'shot':'poco','frames':TIMING['introFrames']}]+TIMING['beats']
STEP=int(os.getenv('F2_STEP','8'))
WORKER=int(os.getenv('F2_WORKER','0')); WORKERS=int(os.getenv('F2_WORKERS','1'))
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['all']
random.seed(20261008)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene
sc.render.engine=os.getenv('F2_ENGINE','BLENDER_EEVEE')
sc.render.resolution_x=TIMING['width']; sc.render.resolution_y=TIMING['height']
sc.render.resolution_percentage=int(os.getenv('F2_SCALE','100'))
sc.render.image_settings.file_format='PNG'; sc.render.fps=TIMING['fps']
sc.view_settings.view_transform='AgX'
if sc.render.engine=='CYCLES':
    sc.cycles.samples=int(os.getenv('F2_SAMPLES','24')); sc.cycles.use_denoising=False
else:
    sc.eevee.taa_render_samples=32
    sc.eevee.use_gtao=True; sc.eevee.gtao_distance=3; sc.eevee.gtao_factor=1.2
    sc.eevee.use_ssr=True; sc.eevee.use_ssr_refraction=True
    sc.eevee.use_bloom=True; sc.eevee.bloom_intensity=.045; sc.eevee.bloom_threshold=1.4
world=bpy.data.worlds.new('Reservatório'); sc.world=world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.07,.09,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.3

def mat(name,color,rough=.6,metal=0,emit=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emit
    return m

def rockmat(kind):
    m=mat(kind,(.24,.22,.18),.86)
    n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord'); scale=n.new('ShaderNodeVectorMath'); scale.operation='SCALE'
    scale.inputs[3].default_value=.32 if kind=='floor' else .65
    l.new(coord.outputs['Object'],scale.inputs[0])
    for suffix,socket in [('color','Base Color'),('roughness','Roughness'),('normal',None)]:
        image=bpy.data.images.load(str(ROOT/f'jubileu/src/assets/textures/cave/{kind}_{suffix}.jpg'))
        if suffix!='color': image.colorspace_settings.name='Non-Color'
        t=n.new('ShaderNodeTexImage'); t.image=image; t.projection='BOX'; t.projection_blend=.25
        l.new(scale.outputs['Vector'],t.inputs['Vector'])
        if socket: l.new(t.outputs['Color'],p.inputs[socket])
        else:
            bump=n.new('ShaderNodeNormalMap'); bump.inputs['Strength'].default_value=.45
            l.new(t.outputs['Color'],bump.inputs['Color']); l.new(bump.outputs['Normal'],p.inputs['Normal'])
    return m
STONE=rockmat('rock'); FLOOR=rockmat('floor'); WALL=rockmat('wall')
BRASS=mat('Latão gasto',(.37,.27,.10),.4,.7)
DARK=mat('Borracha',(.015,.023,.024),.5)
GLASS=mat('Óptica verde',(.08,.45,.24),.12,.35,.4)
LANTERN=mat('Luz âmbar',(1,.48,.13),.4,0,4)
CYAN=mat('Mineral molhado',(.06,.45,.57),.4,.1,2)

def finish(obj,name,material):
    obj.name=name; obj.data.materials.append(material)
    for poly in obj.data.polygons: poly.use_smooth=True
    return obj

def cube(name,loc,scale,material,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); obj=bpy.context.object
    obj.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(obj,name,material)
    if bevel:
        mod=obj.modifiers.new('Bordas gastas','BEVEL'); mod.width=bevel; mod.segments=3
        obj.modifiers.new('Normais','WEIGHTED_NORMAL'); obj.data.use_auto_smooth=True
    return obj

def sphere(name,loc,scale,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=loc)
    obj=bpy.context.object; obj.scale=scale; return finish(obj,name,material)

def rock(name,loc,scale):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1,location=loc); obj=bpy.context.object
    for v in obj.data.vertices:
        q=v.co.copy(); v.co*=1+.14*noise.noise_vector(q*2.1)[0]+.07*math.sin(q.z*8)
    obj.scale=scale; obj.rotation_euler=(random.random()*.5,random.random()*.2,random.random()*math.tau)
    return finish(obj,name,STONE)

def area(name,loc,target,color,power,size):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.color=color; d.shape='DISK'; d.size=size
    o=bpy.data.objects.new(name,d); sc.collection.objects.link(o); o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
# Continuous floor with the actual well opening.
verts=[]; faces=[]; N=160
for r in [3,3.35,5,12,24,44]:
    for i in range(N):
        a=i*math.tau/N; x=r*math.cos(a); y=-5+r*math.sin(a)
        z=0 if r<3.4 else .06*noise.noise_vector(Vector((x*.3,y*.3,0)))[0]
        verts.append((x,y,z))
for row in range(5):
    for i in range(N):
        j=(i+1)%N; faces.append((row*N+i,row*N+j,(row+1)*N+j,(row+1)*N+i))
mesh=bpy.data.meshes.new('Chão perfurado'); mesh.from_pydata(verts,[],faces)
o=bpy.data.objects.new('Chão do reservatório',mesh); sc.collection.objects.link(o); finish(o,o.name,FLOOR)
# Shaft and water retain the gameplay rim radius and water depth.
verts=[]; faces=[]
for z in [0,-.5,-1.25,-2.5,-5]:
    for i in range(N):
        a=i*math.tau/N; r=3 if z==0 else 3+.035*math.sin(i*.9+z)
        verts.append((r*math.cos(a),-5+r*math.sin(a),z))
for row in range(4):
    for i in range(N):
        j=(i+1)%N; faces.append((row*N+i,(row+1)*N+i,(row+1)*N+j,row*N+j))
mesh=bpy.data.meshes.new('Poço'); mesh.from_pydata(verts,[],faces)
o=bpy.data.objects.new('Paredes do poço',mesh); sc.collection.objects.link(o); finish(o,o.name,WALL)
water=mat('Água profunda',(.025,.12,.14),.13,.3)
p=water.node_tree.nodes['Principled BSDF']; p.inputs['Transmission Weight'].default_value=.32; p.inputs['IOR'].default_value=1.333
wave=water.node_tree.nodes.new('ShaderNodeTexNoise'); wave.noise_dimensions='4D'; wave.inputs['Scale'].default_value=5; wave.inputs['Detail'].default_value=2
bump=water.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.25; bump.inputs['Distance'].default_value=.055
water.node_tree.links.new(wave.outputs['Fac'],bump.inputs['Height']); water.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
bpy.ops.mesh.primitive_circle_add(vertices=128,radius=2.99,fill_type='NGON',location=(0,-5,-2.5))
finish(bpy.context.object,'Água',water)
area('Reflexo no poço',(-2,-4,2),(0,-5,-2.5),(.15,.63,.75),650,4)
area('Fundo frio',(0,-5,-1.5),(0,-5,2),(.12,.50,.63),220,2)
for kind in ['CAVE_ROCKS_DARK','CAVE_ROCKS_MID','CAVE_ROCKS_LIGHT']:
    for i,(x,y,z,s,ry) in enumerate(DATA[kind]): rock(f'{kind}_{i}',(x,-z,y+s*.35),(s,s*.75,s*.7))
for x,z,h,r in DATA['STALAGMITES']:
    bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r,radius2=.07,depth=h,location=(x,-z,h*.5)); finish(bpy.context.object,'Estalagmite',STONE)
for x,z,h,r in DATA['STALACTITES']:
    bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=.06,radius2=r,depth=h,location=(x,-z,8-h*.5)); finish(bpy.context.object,'Estalactite',STONE)
for i in range(60):
    a=i*math.tau/60; rock('Parede',(29*math.cos(a),29*math.sin(a),3.5),(3,3,4.6))
for x,y,z,c in DATA['CRYSTALS']:
    for j in range(3):
        bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.16,radius2=.025,depth=.7+j*.12,location=(x+j*.16,-z,y))
        o=finish(bpy.context.object,'Cristal',CYAN); o.rotation_euler=(j*.2,.2-j*.16,0)
PANEL=mat('Painel do elevador',(.16,.21,.17),.86)
for side in [-1,1]:
    cube('Parede do elevador',(side*3.5,10,2.5),(3,.5,5),PANEL)
    cube('Moldura',(side*2.08,9.68,2.5),(.16,.25,4.8),BRASS)
cube('Lintel',(0,10,4.1),(4,.5,1.8),PANEL)
cube('Cabine escura',(0,12,1.5),(4,.1,3),DARK)
cube('Luz da cabine',(0,11.8,3.25),(3,.14,.08),LANTERN)
cube('Friso',(0,9.6,3.35),(4.1,.65,.12),BRASS)
area('Elevador',(0,10,3),(0,5,1),(1,.55,.22),450,3)
text=bpy.data.curves.new('Placa','FONT'); text.body='02  RESERVATÓRIO'; text.size=.28; text.align_x='CENTER'; text.extrude=.003
ob=bpy.data.objects.new('Placa do reservatório',text); sc.collection.objects.link(ob)
ob.location=(0,9.7,4.25); ob.rotation_euler=(math.pi/2,0,0); ob.data.materials.append(BRASS)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'jubileu/src/assets/models/hotel-concierge.glb'))
diver=next(o for o in bpy.context.selected_objects if o.type=='MESH'); diver.name='Mergulhador original'
bpy.context.view_layer.update(); corners=[diver.matrix_world@Vector(c) for c in diver.bound_box]
low=min(v.z for v in corners); high=max(v.z for v in corners); s=2.3/(high-low)
diver.scale*=s; diver.location=(0,6,-low*s)
bpy.context.view_layer.objects.active=diver; diver.select_set(True)
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
# The source mesh has no skeleton or lip sync. Deform only above the hips.
diver.shape_key_add(name='Basis'); breath=diver.shape_key_add(name='Respiração')
for v,k in zip(diver.data.vertices,breath.data):
    z=v.co.z+diver.location.z; w=max(0,1-abs(z-1.35)/.55)
    k.co.y+=.014*w; k.co.x*=1+.012*w
glance=diver.shape_key_add(name='Olhar')
for v,k in zip(diver.data.vertices,glance.data):
    z=v.co.z+diver.location.z; w=max(0,min(1,(z-1.63)/.25)); a=.10*w
    k.co.x=v.co.x*math.cos(a)-v.co.y*math.sin(a); k.co.y=v.co.x*math.sin(a)+v.co.y*math.cos(a)
mask=bpy.data.objects.new('Equipamento',None); sc.collection.objects.link(mask); mask.location=(0,5.35,1.12)
parts=[cube('Corpo da máscara',(0,0,0),(.42,.20,.30),DARK,.045),cube('Vidro da máscara',(0,-.116,0),(.30,.026,.18),GLASS,.02)]
for side in [-1,1]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.062,depth=.14,location=(side*.115,-.05,.19),rotation=(math.pi/2,0,0)); parts.append(finish(bpy.context.object,'Óptica',DARK))
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.048,depth=.008,location=(side*.115,-.125,.19),rotation=(math.pi/2,0,0)); parts.append(finish(bpy.context.object,'Lente',GLASS))
    parts.append(sphere('Fixação',(side*.24,0,0),(.04,.04,.035),BRASS))
for part in parts: part.parent=mask
area('Rosto quente',(-2,3,4),(0,6,1.7),(1,.74,.43),550,3)
area('Preenchimento',(2,3,2.3),(0,6,1.6),(.34,.62,.70),140,2.5)
area('Recorte',(-1,8,3),(0,6,1.8),(.17,.67,.77),700,2)
area('Caverna',(0,-3,6),(0,0,0),(.22,.33,.35),800,9)
bpy.ops.object.camera_add(); camera=bpy.context.object; camera.name='Câmera'; sc.camera=camera
camera.data.lens=42; camera.data.clip_start=.04; camera.data.clip_end=150
camera.data.dof.use_dof=True; camera.data.dof.aperture_fstop=4

def smooth(t): return t*t*(3-2*t)
def pose(shot,t):
    u=smooth(t); breath.value=.5+.5*math.sin(t*math.tau); glance.value=.25+.35*math.sin(t*math.pi)
    mask.location=(0,5.56,1.07); mask.rotation_euler=(0,0,0)
    if shot=='poco':
        loc=Vector((3.8-u*.6,-.4-u*.4,3.5-u*.25)); target=Vector((0,-5,-1.9)); lens=30
    elif shot=='encontro':
        loc=Vector((-.55+u*.2,1.6+u*.25,1.85)); target=Vector((0,6,1.55)); lens=42
    elif shot=='memoria':
        loc=Vector((2.9-u*.2,8.4,2.55)); target=Vector((0,6,1.25)); lens=30
    elif shot=='cuidado':
        loc=Vector((.6-u*.14,3.0+u*.15,1.89)); target=Vector((0,6,1.74)); lens=48
    elif shot=='mascara':
        loc=Vector((.35-u*.13,4.10,1.42)); target=Vector((0,5.35,1.21)); lens=52
    else:
        loc=Vector((-.35,1.9-u*.4,1.85+u*.12)); target=Vector((0,6,1.55)); lens=42-u*4
    camera.location=loc; camera.rotation_euler=(target-loc).to_track_quat('-Z','Y').to_euler()
    camera.data.lens=lens; camera.data.dof.focus_distance=(target-loc).length
    wave.inputs['W'].default_value=t*2
selected=[s for s in SHOTS if ARGS[0]=='all' or s['shot']==ARGS[0]]
for shot in selected:
    count=math.ceil(shot['frames']/STEP)+1
    first=int(ARGS[1]) if len(ARGS)>1 else 0; last=int(ARGS[2]) if len(ARGS)>2 else count-1
    for i in range(first,last+1):
        if i%WORKERS!=WORKER: continue
        file=OUT/f'{shot["shot"]}_{i:04d}.png'
        if os.getenv('F2_FORCE')!='1' and file.exists() and file.stat().st_size>8000: continue
        pose(shot['shot'],min(1,i*STEP/max(1,shot['frames']-1))); sc.render.filepath=str(file)
        bpy.ops.render.render(write_still=True)
    print('FINISHED',shot['shot'],flush=True)
