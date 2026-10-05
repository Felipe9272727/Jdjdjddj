"""Kessar-9: physically lit cinematic plates (Blender 4.3+, Cycles CPU).
Usage: blender -b -P tools/chegada14/cena.py -- tools/chegada14/frames [portal|vista|fall|helmet|ground|all]
Plates are edited/animated in Remotion; there is intentionally no placeholder humanoid.
Coordinates map game (x,y,z) to Blender (x,z,y), preserving landing and helmet positions.
"""
import bpy, math, os, sys, random
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
OUT=os.path.abspath(args[0] if args else 'tools/chegada14/frames'); SHOT=args[1] if len(args)>1 else 'all'
os.makedirs(OUT,exist_ok=True); random.seed(14)
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
# Exact JS signed/unsigned conversion and float multiply from f14Terreno.ts.
def i32(n):
 n=int(n)&0xffffffff
 return n-4294967296 if n>=2147483648 else n
def hash2(i,j):
 h=i32(i*374761393+j*668265263); h=i32(float(h ^ ((h&0xffffffff)>>13))*1274126177)
 return ((h ^ ((h&0xffffffff)>>16))&0xffffffff)/4294967295

def smooth(t):return t*t*(3-2*t)
def noise(x,z):
 i,j=math.floor(x),math.floor(z); fx,fz=smooth(x-i),smooth(z-j); a,b,c,d=hash2(i,j),hash2(i+1,j),hash2(i,j+1),hash2(i+1,j+1)
 return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz

def fbm(x,z,n=4):
 s=0;a=.5;f=1
 for _ in range(n):s+=a*noise(x*f,z*f);f*=2.03;a*=.5
 return s

def ridge(x,z):
 s=0;a=.5;f=1
 for _ in range(4):n=1-abs(noise(x*f,z*f)*2-1);s+=a*n*n;f*=2.1;a*=.5
 return s

def mix(a,b,x):return smooth(max(0,min(1,(x-a)/(b-a))))
def height(x,z):
 h=math.sin(x*.045+fbm(x*.01,z*.01)*4)*2.2+fbm(x*.03,z*.03)*3
 h+=(1-mix(30,90,math.hypot((x-10)*.55,z+150)))*(ridge(x*.02,z*.02)*70+8)
 ks=1-mix(25,70,math.hypot(x-150,z+20));h=h*(1-ks*.9)-ks*16
 kp=1-mix(40,85,math.hypot(x+150,z-30))
 if kp>0:
  m=fbm(x*.018+7,z*.018-3,3);h+=kp*(26+math.floor((m-.52)*40)*6 if m>.52 else (m-.45)/.07*26 if m>.45 else 0)
 dk=math.hypot(x-20,z-170);h+=math.exp(-((dk-42)**2)/120)*18+(1-mix(10,40,dk))*-20
 r=math.hypot(x,z);h+=mix(210,290,r)*(60+ridge(x*.015,z*.015)*80)
 return h*(.35+.65*mix(6,30,r))

def mat(name,color,metal=0,rough=.7):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 return m

def procedural(m,scale,strength,distance,colors=None):
 n=m.node_tree.nodes;l=m.node_tree.links;b=n.get('Principled BSDF');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=4
 bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=strength;bump.inputs['Distance'].default_value=distance;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],b.inputs['Normal'])
 if colors:
  r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(*colors[0],1);r.color_ramp.elements[1].color=(*colors[1],1);l.new(noise.outputs['Fac'],r.inputs[0]);l.new(r.outputs['Color'],b.inputs['Base Color'])
 return m
sand=procedural(mat('Wind-carved ochre sand',(.40,.21,.095),rough=.94),160,.5,.025,[(.24,.16,.10),(.52,.37,.23)])
# Directional dunes/ripples use world coordinates, maintaining a human-sized grain scale.
n=sand.node_tree.nodes;l=sand.node_tree.links;b=n.get('Principled BSDF');coord=n.new('ShaderNodeTexCoord');wave=n.new('ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction='X';wave.inputs['Scale'].default_value=5;wave.inputs['Distortion'].default_value=6;wave.inputs['Detail Scale'].default_value=.5;l.new(coord.outputs['Object'],wave.inputs['Vector']);bp=n.new('ShaderNodeBump');bp.inputs['Strength'].default_value=.28;bp.inputs['Distance'].default_value=.035;l.new(wave.outputs['Color'],bp.inputs['Height']);l.new(n.get('Bump').outputs['Normal'],bp.inputs['Normal']);l.new(bp.outputs['Normal'],b.inputs['Normal'])
wood=procedural(mat('Weathered dark oak',(.095,.045,.02),rough=.73),8,.3,.015,[(.025,.014,.008),(.24,.11,.035)])
brass=procedural(mat('Oxidised brass',(.44,.27,.09),metal=.85,rough=.31),35,.15,.002,[(.12,.075,.026),(.62,.43,.17)])
dark=mat('Leather hose',(.026,.021,.014),rough=.93)
rock=procedural(mat('Basalt',(.09,.055,.035),rough=.95),7,.7,.15,[(.045,.025,.015),(.23,.13,.065)])
glass=mat('Smoke green porthole',(.045,.14,.13),metal=.48,rough=.1)
# Terrain samples are denser around spawn, one continuous surface avoids overlap artifacts.
N=221
axis=[math.copysign((abs((i/(N-1))*2-1)**2)*340,(i/(N-1))*2-1) for i in range(N)]
verts=[(x,y,height(x,y)) for y in axis for x in axis];faces=[(j*N+i,j*N+i+1,(j+1)*N+i+1,(j+1)*N+i) for j in range(N-1) for i in range(N-1)]
mesh=bpy.data.meshes.new('Runtime heightfield');mesh.from_pydata(verts,[],faces);mesh.update();terrain=bpy.data.objects.new('Continuous Kessar terrain',mesh);sc.collection.objects.link(terrain);terrain.data.materials.append(sand)
for p in mesh.polygons:p.use_smooth=True

def uv(name,loc,scale,material,segments=48):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=24,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o

def box(name,loc,scale,material,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:mo=o.modifiers.new('Worn edges','BEVEL');mo.width=bevel;mo.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o

def torus(name,loc,r,minor,material,rot=(math.pi/2,0,0)):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=minor,major_segments=64,minor_segments=12,location=loc,rotation=rot);o=bpy.context.object;o.name=name;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o
# A handful of weathered rocks stay on the physical surface, away from the landing path.
for i in range(90):
 x=random.uniform(-65,65);y=random.uniform(-95,12)
 if abs(x)<2.5 and -8<y<6:continue
 r=random.uniform(.08,.8);bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,height(x,y)+r*.22));o=bpy.context.object;o.scale=(r*1.4,r,r*.7);o.rotation_euler=(.1,random.random(),random.random()*6);o.data.materials.append(rock)
 for p in o.data.polygons:p.use_smooth=True
# Wooden threshold/doorway, warm interior emitted by a recessed panel.
py=2.6;pz=height(0,py)
for x in [-.95,.95]:
 box('Oak jamb',(x,py,pz+1.55),(.24,.32,3.1),wood,.055)
 for z in [.35,2.65]:box('Brass door strap',(x,py-.175,pz+z),(.26,.035,.12),brass,.012)
box('Lintel',(0,py,pz+3.12),(2.35,.38,.25),wood,.06)
box('Threshold',(0,py,pz+.06),(2.18,.7,.12),wood,.025)
for x in [-.76,.76]:box('Interior brass trim',(x,py+.02,pz+1.6),(.055,.06,2.9),brass,.009)
lightmat=mat('Warm portal',(.8,.38,.12),rough=.3);bs=lightmat.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.43,.12,1);bs.inputs['Emission Strength'].default_value=4
box('Portal luminous interior',(0,py+.15,pz+1.58),(1.6,.04,2.98),lightmat,0)
# Open heavy door on its hinge, gives the portal architectural thickness.
door=box('Open oak door',(-1.52,py+.61,pz+1.57),(1.48,.12,2.99),wood);door.rotation_euler.z=math.radians(-58)
for z in [.55,2.5]:
 strap=box('Door horizontal strap',(-1.52,py+.54,pz+z),(1.45,.04,.13),brass,.01);strap.rotation_euler.z=math.radians(-58)
# Hero prop: same .36 m wood/brass helmet as gameplay, with machined porthole and rivets.
hx,hy=.4,-4.2;hz=height(hx,hy)+.28
uv('Timber diving helmet',(hx,hy,hz),(.36,.33,.36),wood)
torus('Neck flange',(hx,hy,hz-.21),.29,.045,brass,(0,0,0))
torus('Porthole brass rim',(hx,hy+.305,hz+.005),.151,.032,brass)
uv('Convex porthole glass',(hx,hy+.315,hz+.005),(.148,.025,.148),glass)
for i in range(8):
 a=i*math.tau/8;uv('Porthole rivet',(hx+math.cos(a)*.151,hy+.339,hz+.005+math.sin(a)*.151),(.014,.011,.014),brass,16)
# Visible stave seams following the round shell and brass crown band.
torus('Crown reinforcing band',(hx,hy,hz),.337,.015,brass,(0,0,0))
for a in [-.95,-.48,0,.48,.95]:
 curve=bpy.data.curves.new('Timber stave join','CURVE');curve.dimensions='3D';curve.bevel_depth=.003;curve.bevel_resolution=2;s=curve.splines.new('POLY');s.points.add(30)
 for i in range(31):
  t=.15+i/30*2.7;s.points[i].co=(hx+.362*math.sin(t)*math.sin(a),hy+.333*math.sin(t)*math.cos(a),hz+.362*math.cos(t),1)
 ob=bpy.data.objects.new('Dark wood join',curve);sc.collection.objects.link(ob);curve.materials.append(dark)
curve=bpy.data.curves.new('Air hose','CURVE');curve.dimensions='3D';curve.bevel_depth=.028;curve.bevel_resolution=4;s=curve.splines.new('BEZIER');s.bezier_points.add(4)
for p,(x,y) in zip(s.bezier_points,[(hx+.26,hy),(hx+.55,hy+.05),(hx+.67,hy+.34),(hx+.5,hy+.63),(hx+.29,hy+.58)]):p.co=(x,y,height(x,y)+.04);p.handle_left_type=p.handle_right_type='AUTO'
ob=bpy.data.objects.new('Buried leather hose',curve);sc.collection.objects.link(ob);curve.materials.append(dark)
beacon=mat('Amber locator',(.7,.28,.04));b=beacon.node_tree.nodes.get('Principled BSDF');b.inputs['Emission Color'].default_value=(1,.48,.10,1);b.inputs['Emission Strength'].default_value=6
uv('Locator lamp',(hx+.2,hy+.1,hz+.27),(.04,.04,.045),beacon,24)
# Sky and illumination: broad cool fill against a low, warm directional sun.
w=bpy.data.worlds.new('Dust dusk atmosphere');sc.world=w;w.use_nodes=True;n=w.node_tree.nodes;l=w.node_tree.links;n.clear();out=n.new('ShaderNodeOutputWorld');bg=n.new('ShaderNodeBackground');sky=n.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_elevation=math.radians(7);sky.sun_rotation=math.radians(135);sky.altitude=.3;sky.air_density=1.1;sky.dust_density=2.1;bg.inputs['Strength'].default_value=.22;l.new(sky.outputs[0],bg.inputs[0]);l.new(bg.outputs[0],out.inputs[0])
bpy.ops.object.light_add(type='SUN',location=(0,0,100));sun=bpy.context.object;sun.rotation_euler=Vector((-.55,.8,-.32)).to_track_quat('-Z','Y').to_euler();sun.data.energy=2.8;sun.data.angle=.05;sun.data.color=(1,.82,.63)
bpy.ops.object.light_add(type='AREA',location=(0,py-.4,pz+1.8));area=bpy.context.object;area.data.energy=140;area.data.color=(1,.48,.19);area.data.shape='RECTANGLE';area.data.size=1.3;area.data.size_y=2.7;area.rotation_euler=(math.pi/2,0,0)
bpy.ops.object.light_add(type='AREA',location=(0,-1,5));fill=bpy.context.object;fill.data.energy=110;fill.data.size=9;fill.data.color=(.48,.62,1)
# Ringed world, placed beyond the northern ridge, physically shaded with readable bands.
planetmat=procedural(mat('Distant ringed world',(.37,.26,.2),rough=1),4,.08,.01,[(.18,.13,.12),(.55,.38,.24)])
p=uv('Ringed world',(-260,-620,330),(70,70,70),planetmat)
ring=mat('Dust ice rings',(.32,.26,.21),rough=1)
Nring=192;v=[];f=[]
for i in range(Nring):
 a=i/Nring*math.tau
 for r in [91,145]:v.append((math.cos(a)*r,math.sin(a)*r,0))
for i in range(Nring):f.append((i*2,i*2+1,((i+1)%Nring)*2+1,((i+1)%Nring)*2))
me=bpy.data.meshes.new('Ring annulus');me.from_pydata(v,[],f);o=bpy.data.objects.new('Orbital ring',me);sc.collection.objects.link(o);o.location=p.location;o.rotation_euler=Vector((.24,.45,.86)).to_track_quat('Z','Y').to_euler();o.data.materials.append(ring)
# Render design: physically meaningful AgX response; only optical glare in compositor.
sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=32;sc.cycles.use_denoising=False;sc.cycles.max_bounces=5
sc.render.resolution_x=1280;sc.render.resolution_y=608;sc.render.resolution_percentage=int(os.environ.get('PLATE_SCALE','100'));sc.render.image_settings.file_format='PNG';sc.render.fps=24
sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.2
sc.use_nodes=True;nt=sc.node_tree;nt.nodes.clear();rl=nt.nodes.new('CompositorNodeRLayers');gl=nt.nodes.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='HIGH';gl.threshold=2;gl.size=7;co=nt.nodes.new('CompositorNodeComposite');sc.view_layers[0].use_pass_mist=True;w.mist_settings.start=12;w.mist_settings.depth=240;w.mist_settings.falloff='QUADRATIC';mixnode=nt.nodes.new('CompositorNodeMixRGB');mixnode.blend_type='MIX';mixnode.inputs[2].default_value=(.34,.28,.22,1);strength=nt.nodes.new('CompositorNodeMath');strength.operation='MULTIPLY';strength.inputs[1].default_value=.55;nt.links.new(rl.outputs['Mist'],strength.inputs[0]);nt.links.new(strength.outputs[0],mixnode.inputs[0]);nt.links.new(rl.outputs['Image'],mixnode.inputs[1]);nt.links.new(mixnode.outputs[0],gl.inputs['Image']);nt.links.new(gl.outputs['Image'],co.inputs['Image'])
bpy.ops.object.camera_add();cam=bpy.context.object;sc.camera=cam;cam.data.clip_end=2000
shots={
 'portal':((6,-9,height(6,-9)+2.1),(0,py,pz+1.5),40,10),
 'vista':((0,.4,height(0,.4)+1.65),(-24,-110,64),26,110),
 'fall':((0,.1,height(0,.1)+.92),(.4,-4.2,hz+.02),30,4.5),
 'helmet':((-.28,-2.65,height(-.28,-2.65)+.55),(.4,-4.2,hz+.07),58,1.7),
 'ground':((0,0,height(0,0)+.36),(.4,-4.2,hz+.1),32,4.2),
}
for name,(pos,target,lens,focus) in shots.items():
 if SHOT not in ['all',name] or os.environ.get('SKIP_PORTAL')=='1' and name=='portal':continue
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;cam.data.dof.use_dof=True;cam.data.dof.focus_distance=focus;cam.data.dof.aperture_fstop=5.6 if name=='helmet' else 10
 sc.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
# Keep one portable scene for inspection/re-rendering, all materials procedural.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'chegada14.blend'))
