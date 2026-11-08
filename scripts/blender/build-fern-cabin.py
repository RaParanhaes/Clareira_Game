"""Samambaia: offline Blender source for a stone cottage with a hipped roof.
Run: blender --background --factory-startup --python scripts/blender/build-fern-cabin.py
The draft is kept outside the served game directory pending visual review.
The physical shell and openings match cabin-cedar-two's runtime geometry.
"""
import bpy, bmesh, math, random, json, sys, hashlib, os
from pathlib import Path
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0,str(Path(__file__).resolve().parent))
from cottage_pixels import normalize_transparent_rgb

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'logs/fern-cabin-revision/draft'; FRAMES=OUT/'frames'
OUT.mkdir(parents=True,exist_ok=True); FRAMES.mkdir(exist_ok=True)
R=random.Random(412)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=12 if os.environ.get('FERN_PREVIEW_ONLY')=='1' else 24; scene.cycles.use_denoising=False
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'
scene.view_settings.exposure=0; scene.view_settings.gamma=1
world=bpy.data.worlds.new('Cottage neutral ambient'); scene.world=world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.55,.62,.69,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.48
FRAME=320; PIVOT=(160,207); TILE=64; COLS=8; ROWS=2
# Material IDs are durable UV atlas cells. Pixel clusters, not photographic noise.
M=dict(stone=0,plaster=1,oak=2,darkwood=3,shingle=4,slate=5,glass=6,soot=7,
       stone_light=8,oak_light=9,leaf=10,sage=11,flower=12,gold=13,clay=14,iron=15)
colors=[(152,114,78),(153,148,123),(105,71,46),(66,47,34),(112,128,91),(76,87,75),
        (58,93,96),(32,31,28),(170,129,84),(122,104,70),(56,79,45),(89,111,60),
        (181,103,84),(205,174,99),(139,89,62),(51,58,55)]
atlas=Image.new('RGB',(COLS*TILE,ROWS*TILE)); draw=ImageDraw.Draw(atlas)
for ti,base in enumerate(colors):
    ox=(ti%COLS)*TILE; oy=(ti//COLS)*TILE
    draw.rectangle((ox,oy,ox+63,oy+63),fill=base)
    if ti in (M['oak'],M['darkwood'],M['oak_light'],M['shingle']):
        for x in range(4,62,5):
            shade=R.choice([-15,-9,7,13]); rgb=tuple(max(0,min(255,c+shade)) for c in base)
            y=R.randrange(2,17); draw.line((ox+x,oy+y,ox+x,oy+R.randrange(44,63)),fill=rgb,width=1)
            if x%3==0: draw.line((ox+x+1,oy+28,ox+x+2,oy+50),fill=rgb)
        draw.arc((ox+24,oy+23,ox+33,oy+39),20,330,fill=tuple(c-12 for c in base),width=1)
    elif ti in (M['stone'],M['stone_light'],M['slate']):
        for k in range(14):
            x=R.randrange(1,53); y=R.randrange(1,54); w=R.randrange(3,11); h=R.randrange(2,7)
            delta=R.choice([-7,-4,3,6]); draw.rectangle((ox+x,oy+y,ox+x+w,oy+y+h),fill=tuple(max(0,min(255,c+delta)) for c in base))
    elif ti==M['plaster']:
        for k in range(16):
            x=R.randrange(2,60); y=R.randrange(2,60); w=R.randrange(1,4); h=R.randrange(1,3)
            delta=R.choice([-4,-2,2,4]); draw.rectangle((ox+x,oy+y,ox+x+w,oy+y+h),fill=tuple(max(0,min(255,c+delta)) for c in base))
    elif ti==M['glass']:
        draw.polygon([(ox+5,oy+5),(ox+22,oy+5),(ox+52,oy+59),(ox+39,oy+59)],fill=(68,106,109))
        draw.line((ox+7,oy+8,ox+52,oy+55),fill=(90,128,126),width=2)
atlas_path=OUT/'fern-pixel-uv-atlas.png'; atlas.save(atlas_path)
img=bpy.data.images.load(str(atlas_path)); img.pack(); img.name='Cottage | 16-cell packed pixel atlas'
mat=bpy.data.materials.new('Cottage | nearest UV surfaces');mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.88
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;tex.interpolation='Closest'
mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
glass=bpy.data.materials.new('Cottage | one bedroom glazing');glass.use_nodes=True
gbsdf=glass.node_tree.nodes.get('Principled BSDF');gbsdf.inputs['Roughness'].default_value=.4
gtex=glass.node_tree.nodes.new('ShaderNodeTexImage');gtex.image=img;gtex.interpolation='Closest'
glass.node_tree.links.new(gtex.outputs['Color'],gbsdf.inputs['Base Color'])
gbsdf.inputs['Emission Color'].default_value=(.27,.39,.37,1);gbsdf.inputs['Emission Strength'].default_value=.12

def mesh(name,vs,fs,tile=1,ids=None):
    me=bpy.data.meshes.new(name+' UV mesh');me.from_pydata(vs,[],fs)
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    me.materials.append(mat);me.materials.append(glass);me.update()
    ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob)
    uv=me.uv_layers.new(name='UV0 | face-local atlas')
    for p,ti in zip(me.polygons,ids or [tile]*len(me.polygons)):
        p.material_index=1 if ti==M['glass'] else 0
        # Drop the DOMINANT normal axis: the old minimum-axis mapping collapsed
        # one texture coordinate on every axis-aligned face.
        axis=max(range(3),key=lambda a:abs(p.normal[a]));axes=[a for a in range(3) if a!=axis]
        coords=[me.vertices[i].co for i in p.vertices];lo=[min(v[a] for v in coords) for a in axes];hi=[max(v[a] for v in coords) for a in axes]
        for li in p.loop_indices:
            co=me.vertices[me.loops[li].vertex_index].co
            u=(co[axes[0]]-lo[0])/(hi[0]-lo[0] or 1);v=(co[axes[1]]-lo[1])/(hi[1]-lo[1] or 1)
            uv.data[li].uv=(((ti%COLS)*TILE+.75+u*(TILE-1.5))/(COLS*TILE),1-((ti//COLS)*TILE+.75+(1-v)*(TILE-1.5))/(ROWS*TILE))
    return ob

def box(name,c,s,tile,bevel=.025):
    x,y,z=c;a,b,d=[v/2 for v in s]
    vs=[(x-a,y-b,z-d),(x+a,y-b,z-d),(x+a,y+b,z-d),(x-a,y+b,z-d),(x-a,y-b,z+d),(x+a,y-b,z+d),(x+a,y+b,z+d),(x-a,y+b,z+d)]
    ob=mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],tile)
    if bevel:
        mod=ob.modifiers.new('Soft hand-cut edges','BEVEL');mod.width=min(bevel,min(s)*.20);mod.segments=2
    return ob

def beam(name,a,b,w=.16,d=.18,tile=2):
    delta=Vector(b)-Vector(a);ob=box(name,(0,0,0),(w,d,delta.length),tile,.018)
    ob.location=(Vector(a)+Vector(b))/2;ob.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return ob

def prism(name,section,y0,y1,tile):
    n=len(section);vs=[(x,y0,z) for x,z in section]+[(x,y1,z) for x,z in section]
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,tile)

def slab(name,x0,x1,y0,y1,z0,z1,tile,thick=.12):
    return mesh(name,[(x0,y0,z0),(x1,y0,z1),(x1,y1,z1),(x0,y1,z0),
                      (x0,y0,z0-thick),(x1,y0,z1-thick),(x1,y1,z1-thick),(x0,y1,z0-thick)],
                [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],tile)

def tube(name,c,radius,depth,tile,axis='Y',segments=12,inner=None):
    x,y,z=c;vs=[]
    for radius_at,offset in [(radius,-depth/2),(radius,depth/2)]+([] if inner is None else [(inner,-depth/2),(inner,depth/2)]):
        for i in range(segments):
            a=2*math.pi*i/segments
            vs.append((x+radius_at*math.cos(a),y+offset,z+radius_at*math.sin(a)) if axis=='Y' else (x+radius_at*math.cos(a),y+radius_at*math.sin(a),z+offset))
    fs=[(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    if inner is None:fs += [tuple(range(segments-1,-1,-1)),tuple(range(segments,2*segments))]
    else:
        for i in range(segments):
            j=(i+1)%segments;fs.extend([(i+2*segments,i+3*segments,j+3*segments,j+2*segments),(i,j,j+2*segments,i+2*segments),(i+segments,i+3*segments,j+3*segments,j+segments)])
    return mesh(name,vs,fs,tile)

# Samambaia: warm plaster shell follows the 7x7 collider. Four real openings follow
# buildingWindows(): two front windows and two on the right elevation.
walls=box('Fern | warm plaster shell',(0,0,2.35),(7,7,4.0),M['plaster'],0)
def cut(target,name,c,s):
    cutter=box('Temporary aperture '+name,c,s,M['soot'],0)
    mod=target.modifiers.new('Real aperture '+name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.context.view_layer.objects.active=target;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
cut(walls,'door',(0,3.5,1.8),(1.25,.9,3.6))
for x in (-2.15,2.15):cut(walls,'front window',(x,3.5,1.95),(1.2,1.2,1.8))
for y in (-2,.7):cut(walls,'side window',(3.5,y,1.95),(1.2,.9,1.8))
box('Fern | foundation',(0,0,.22),(7.08,7.08,.44),M['stone_light'],.04)
# Door aligned to porch; the masonry is actually cut, not a decal.
box('Door | recessed dark',(0,3.22,1.8),(1.24,.08,3.58),M['soot'],0)
box('Door | oak leaf',(0,3.48,1.8),(1.16,.10,3.54),M['oak'])
for x in (-.72,.72):box('Door | jamb',(x,3.59,1.9),(.18,.22,3.8),M['darkwood'])
box('Door | lintel',(0,3.59,3.80),(1.62,.24,.22),M['oak'])
for z in (.94,2.72):box('Door | iron strap',(-.12,3.55,z),(.9,.05,.09),M['iron'])
tube('Door | handle',(.38,3.6,1.74),.095,.035,M['iron'],inner=.06)
box('Door | threshold',(0,3.67,.12),(1.42,.52,.24),M['stone_light'])
# The porch emitter in scene-lights.mjs is at (+.84, +3.56, z 3.25).
# Keep a visible fixture at that same point, with glazing sharing night state.
box('Lantern | wall mount',(.84,3.54,3.26),(.31,.11,.62),M['darkwood'])
box('Lantern | glazing',(.84,3.62,3.25),(.22,.09,.40),M['glass'],.008)
for x in (.70,.98):box('Lantern | upright',(x,3.68,3.25),(.045,.045,.50),M['iron'],.006)
for z in (3.01,3.49):box('Lantern | rim',(.84,3.68,z),(.32,.09,.055),M['iron'],.006)
box('Lantern | cap',(.84,3.68,3.55),(.37,.15,.09),M['iron'])
# Both windows are flush with the front plane in saved catalogue revision 4.
# Frames stay outside the clear opening and glazing shares the night state.
for x,y in [(-2.15,3.5),(2.15,3.5)]:
    box('Window | front glazing',(x,y-.05,1.95),(1.10,.045,1.68),M['glass'],.005)
    for dx in (-.65,.65):box('Window | front jamb',(x+dx,y+.08,1.95),(.13,.20,2.02),M['darkwood'])
    for z in (.99,2.91):box('Window | front rail',(x,y+.08,z),(1.42,.20,.13),M['oak'])
    box('Window | front mullion',(x,y+.11,1.95),(.055,.06,1.80),M['darkwood'],.008)
    box('Window | front crossbar',(x,y+.11,2.08),(1.20,.06,.055),M['darkwood'],.008)
    box('Window | front sill',(x,y+.14,.96),(1.52,.34,.14),M['stone_light'])
    box('Planter | soil',(x,y+.37,.78),(1.30,.28,.10),M['soot'])
    box('Planter | front',(x,y+.54,.65),(1.38,.09,.32),M['oak'])
    for dx in (-.64,.64):
        box('Planter | end',(x+dx,y+.37,.65),(.08,.34,.32),M['darkwood'])
        beam('Planter | support',(x+dx*.8,y+.08,.44),(x+dx*.8,y+.40,.74),.065,.065,M['iron'])
    for i in range(6):
        px=x-.51+i*.20
        box('Planter | leaf',(px,y+.39,.91),(.16,.14,.09),M['leaf'] if i%2 else M['sage'],.02)
        tube('Planter | blossom',(px,y+.39,1.0),.055,.06,M['flower'] if i%2 else M['gold'],axis='Z',segments=6)
for y in (-2,.7):
    box('Window | side glazing',(3.45,y,1.95),(.045,.8,1.68),M['glass'],.005)
    for dy in (-.50,.50):box('Window | side jamb',(3.58,y+dy,1.95),(.20,.13,2.02),M['darkwood'])
    for z in (.99,2.91):box('Window | side rail',(3.58,y,z),(.20,1.12,.13),M['oak'])
    box('Window | side mullion',(3.61,y,1.95),(.06,.055,1.80),M['darkwood'],.008)
    box('Window | side sill',(3.64,y,.96),(.34,1.22,.14),M['stone_light'])
# A low stone plinth follows the wall and stops at actual apertures.
# Splitting the intervals keeps masonry clear of jambs and the doorway.
def wall_courses(side):
    for row in range(2):
        low=.46+row*.305;high=low+.275;mid=(low+high)/2
        blocked=[]
        if side=='front':
            if low<3.62:blocked.append((-.78,.78))
            if low<2.98 and high>.92:blocked.extend([(-2.84,-1.46),(1.46,2.84)])
        if side=='right' and low<2.98 and high>.92:blocked.extend([(-2.55,-1.45),(.15,1.25)])
        lo,hi=(-3.47,3.47)
        chunks=[(lo,hi)]
        for a,b in blocked:
            chunks=[part for x,y in chunks for part in ((x,min(y,a)),(max(x,b),y)) if part[1]-part[0]>.08]
        for x,y in chunks:
            cursor=x;index=0
            while cursor<y-.08:
                length=min((.61 if (row+index)%3 else .84),y-cursor)
                center=cursor+length/2
                tile=(M['stone_light'] if (row*7+index)%7==0 else M['stone']) if side in ('front','back') else M['slate']
                if side in ('front','back'):
                    py=3.51 if side=='front' else -3.51
                    box('Stone | '+side+' course',(center,py,mid),(length-.018,.055,high-low),tile,.008)
                else:
                    px=3.51 if side=='right' else -3.51
                    box('Stone | '+side+' course',(px,center,mid),(.055,length-.018,high-low),tile,.008)
                cursor+=length;index+=1
for side in ('front','back','left','right'):wall_courses(side)
# Four-plane hipped roof: solid shell, pitched on all sides. The ridge is
# longitudinal and capped; it is not a gabled roof repainted green.
eave=3.88;ez=4.35;rz=6.95;ridge=1.0
v=[(-eave,-eave,ez),(eave,-eave,ez),(eave,eave,ez),(-eave,eave,ez),(-ridge,0,rz),(ridge,0,rz)]
v += [(x,y,z-.16) for x,y,z in v]
f=[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4),(10,11,7,6),(11,8,7),(11,10,9,8),(10,6,9),(0,6,7,1),(1,7,8,2),(2,8,9,3),(3,9,6,0)]
mesh('Roof | four sided hipped thatch shell',v,f,M['shingle'])
for a,b in [((-eave,-eave,ez),(eave,-eave,ez)),((eave,-eave,ez),(eave,eave,ez)),((eave,eave,ez),(-eave,eave,ez)),((-eave,eave,ez),(-eave,-eave,ez))]:beam('Roof | continuous eave fascia',a,b,.17,.16,M['darkwood'])
beam('Roof | ridge',(-ridge,0,rz),(ridge,0,rz),.16,.16,M['oak'])
# Staggered shingles sit on the four actual roof planes and share their slope.
def roof_tile(name,points,tile):
    upper=[(x,y,z+.045) for x,y,z in points]
    lower=[(x,y,z-.005) for x,y,z in points]
    mesh(name,upper+lower,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],tile)
rows=12
for side in (-1,1):
    for row in range(rows):
        t0=row/rows;t1=min(.985,(row+1.12)/rows);z0=ez+(rz-ez)*t0;z1=ez+(rz-ez)*t1
        width0=eave-(eave-ridge)*t0;width1=eave-(eave-ridge)*t1
        count=16
        for col in range(count):
            p=col/count;q=(col+1)/count
            a=-width0+2*width0*p;b=-width0+2*width0*q
            c=-width1+2*width1*q;d=-width1+2*width1*p
            roof_tile('Roof | thatch course',[(a,side*eave*(1-t0),z0),(b,side*eave*(1-t0),z0),
                (c,side*eave*(1-t1),z1),(d,side*eave*(1-t1),z1)],M['shingle'])
        # Triangular end planes narrow toward their respective ridge ends.
        for col in range(12):
            p=col/12;q=(col+1)/12;y0=eave*(1-t0);y1=eave*(1-t1)
            x0=side*(eave-(eave-ridge)*t0);x1=side*(eave-(eave-ridge)*t1)
            roof_tile('Roof | hipped end course',[(x0,-y0+2*y0*p,z0),(x0,-y0+2*y0*q,z0),
                (x1,-y1+2*y1*q,z1),(x1,-y1+2*y1*p,z1)],M['shingle'])
for x in (-3.35,3.35):
    for y in (-3.35,3.35):box('Fern | corner upright',(x,y,2.4),(.19,.19,3.8),M['oak'])

# Exposed oak framing brings the facade into the Cedar family while the green
# hipped roof, stone plinth and planted windows keep the Fern cabin distinct.
for z in (.55,4.05):
    beam('Timber frame | front plate',(-3.35,3.68,z),(3.35,3.68,z),.18,.18,M['oak'])
    beam('Timber frame | rear plate',(-3.35,-3.68,z),(3.35,-3.68,z),.18,.18,M['oak'])
    beam('Timber frame | right plate',(3.68,-3.35,z),(3.68,3.35,z),.18,.18,M['oak'])
    beam('Timber frame | left plate',(-3.68,-3.35,z),(-3.68,3.35,z),.18,.18,M['oak'])
for x in (-1.10,1.10):
    beam('Timber frame | rear stud',(x,-3.58,.55),(x,-3.58,4.05),.15,.16,M['oak'])
for y in (-1.10,1.10):
    beam('Timber frame | left stud',(-3.58,y,.55),(-3.58,y,4.05),.15,.16,M['oak'])
for left,right in [(-1.36,-.80),(.80,1.36)]:
    beam('Timber frame | front brace',(left,3.68,.72),(right,3.68,3.42),.12,.14,M['darkwood'])
    beam('Timber frame | front brace',(right,3.68,.72),(left,3.68,3.42),.12,.14,M['darkwood'])
for low,high in [(-1.30,0.0),(1.30,3.15)]:
    beam('Timber frame | side brace',(3.68,low,.72),(3.68,high,3.78),.12,.14,M['darkwood'])
    beam('Timber frame | side brace',(3.68,high,.72),(3.68,low,3.78),.12,.14,M['darkwood'])
for left,right in [(-3.15,-1.10),(-1.10,1.10),(1.10,3.15)]:
    beam('Timber frame | rear brace',(left,-3.59,.78),(right,-3.59,3.78),.11,.12,M['darkwood'])
    beam('Timber frame | rear brace',(right,-3.59,.78),(left,-3.59,3.78),.11,.12,M['darkwood'])
for low,high in [(-3.10,-1.10),(-1.10,1.10),(1.10,3.10)]:
    beam('Timber frame | left brace',(-3.59,low,.78),(-3.59,high,3.78),.11,.12,M['darkwood'])
    beam('Timber frame | left brace',(-3.59,high,.78),(-3.59,low,3.78),.11,.12,M['darkwood'])

# Gabled porch centred on the entrance; the main beam rests on canonical posts.
# +0.92 extension and post +/-1 at y=4.25 come directly from the game contract.
for x in (-1.0,1.0):
    box('Porch | stone post foot',(x,4.25,.30),(.30,.30,.60),M['stone_light'],.04)
    box('Porch | canonical collision post',(x,4.25,2.51),(.23,.23,3.90),M['oak'],.03)
    beam('Porch | knee joint',(x,4.25,3.73),(x*.53,4.25,4.38),.13,.15,M['darkwood'])
beam('Porch | front tie',(-1.13,4.25,4.40),(1.13,4.25,4.40),.19,.23,M['oak'])
for x in (-1.13,1.13):beam('Porch | longitudinal bearer',(x,3.52,4.40),(x,4.43,4.40),.17,.18,M['darkwood'])
for side in (-1,1):
    a,b=sorted([0,side*1.27])
    # Explicit two slopes remove dependence on the house's off-centre ridge.
    z0=5.10 if a==0 else 4.46;z1=5.10 if b==0 else 4.46
    slab('Porch | roof substrate',a,b,3.44,4.55,z0,z1,M['darkwood'],.13)
    for row in range(4):
        xa=side*1.27*(1-row/4);xb=side*1.27*(1-min(1,(row+1.3)/4));lo,hi=sorted([xa,xb])
        for j in range(4):
            y0=3.44+j*.28;y1=min(4.55,y0+.30)
            h=lambda x:5.10-abs(x)/1.27*.64+.055
            slab('Porch | cedar shingle',lo,hi,y0,y1,h(lo),h(hi),M['shingle'],.04)
    beam('Porch | front verge',(side*1.30,4.57,4.45),(0,4.57,5.12),.12,.12,M['oak'])
beam('Porch | ridge',(0,3.46,5.14),(0,4.57,5.14),.14,.14,M['darkwood'])
# Solid front triangular pediment, with a small medallion rather than a false room.
prism('Porch | triangular pediment',[(-1.03,4.44),(1.03,4.44),(0,4.98)],4.21,4.29,M['plaster'])
beam('Porch | king post',(0,4.32,4.46),(0,4.32,4.96),.09,.09,M['oak'])
box('Porch | hanging cabin nameboard',(0,4.42,4.10),(1.48,.10,.58),M['darkwood'],.035)

root=bpy.data.objects.new('Cottage | stable floor-centre pivot',None);scene.collection.objects.link(root)
for ob in list(scene.objects):
    if ob.type=='MESH':ob.parent=root
for name,loc,energy,size in [('large soft key',(-5,-7,13),1250,8),('warm facade fill',(4,8,9),900,7)]:
    data=bpy.data.lights.new(name,'AREA');ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;data.energy=energy;data.size=size
    ob.rotation_euler=(Vector((0,0,2.7))-ob.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('Camera | fixed orthographic');cam=bpy.data.objects.new('Camera | fixed orthographic',camd);scene.collection.objects.link(cam);scene.camera=cam;camd.type='ORTHO'
def render(name,loc,target,rotation=0,game=False,hero=False):
    root.scale.z=.6123724357 if game else 1
    root.rotation_euler[2]=rotation*math.pi/2
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    # 320 / (sqrt(2)*10) produces 16px/world in X and 8px/world in Y.
    camd.ortho_scale=14.142135624 if game else 13.8
    res=640 if game else 768 if hero else 512
    scene.render.resolution_x=res;scene.render.resolution_y=res;scene.render.resolution_percentage=100
    raw=OUT/(name+'-raw.png');scene.render.filepath=str(raw);bpy.ops.render.render(write_still=True)
    im=Image.open(raw).convert('RGBA')
    if game:im=im.resize((FRAME,FRAME),Image.Resampling.NEAREST).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    normalize_transparent_rgb(im).save(FRAMES/(name+'.png'),optimize=True);raw.unlink();root.scale.z=1

for i in range(4):
    render('iso-rot'+str(i),(9,9,9.748469228),(0,0,2.4),i,True)
    if i==0 and os.environ.get('FERN_PREVIEW_ONLY')=='1':
        print('FERN_PREVIEW_COMPLETE');sys.exit(0)
# Export physical porch pieces into the game's existing independent depth slots.
# Camera-ray visibility preserves authored cast shadows from the full assembly.
mesh_objects=[ob for ob in scene.objects if ob.type=='MESH']
def group(ob):
    if ob.name.startswith('Porch |'):
        if any(token in ob.name for token in ('stone post foot','canonical collision post','knee joint')):
            center=sum((ob.matrix_local @ Vector(v) for v in ob.bound_box),Vector())/8
            return 'post-left' if center.x<0 else 'post-right'
        return 'canopy'
    return 'shell'
def show_group(which):
    for ob in mesh_objects:ob.visible_camera=(which is None or group(ob)==which)
for which in ('shell','canopy','post-left','post-right'):
    show_group(which);render('iso-rot0-'+which,(9,9,9.748469228),(0,0,2.4),0,True)
show_group(None)
gbsdf.inputs['Emission Color'].default_value=(1,.47,.15,1);gbsdf.inputs['Emission Strength'].default_value=1.05
render('iso-rot0-night',(9,9,9.748469228),(0,0,2.4),0,True)
show_group('shell');render('iso-rot0-shell-night',(9,9,9.748469228),(0,0,2.4),0,True);show_group(None)
gbsdf.inputs['Emission Color'].default_value=(.27,.39,.37,1);gbsdf.inputs['Emission Strength'].default_value=.12
# Orthogonal views have a horizontal camera axis to compare physical dimensions.
for name,loc,target in [('front',(0,16,3.9),(0,0,3.9)),('back',(0,-16,3.9),(0,0,3.9)),('left',(-16,0,3.9),(0,0,3.9)),('right',(16,0,3.9),(0,0,3.9)),('top',(0,0,18),(0,0,0))]:render(name,loc,target)
render('hero-three-quarter',(11,12,10),(0,0,3.0),hero=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fern-cabin.blend'))
for p in OUT.glob('*.blend1'):p.unlink()
# Every review view is visible; the old two-row sheet silently clipped the hero.
names=['iso-rot0','iso-rot1','iso-rot2','iso-rot3','front','back','left','right','iso-rot0-night','top','hero-three-quarter']
board=Image.new('RGB',(4*352,3*366),(39,48,51));d=ImageDraw.Draw(board)
for i,name in enumerate(names):
    x=(i%4)*352;y=(i//4)*366
    im=Image.open(FRAMES/(name+'.png')).convert('RGBA');im.thumbnail((320,320),Image.Resampling.NEAREST)
    board.paste(im,(x+(352-im.width)//2,y+34+(320-im.height)//2),im)
    d.text((x+16,y+12),name.replace('-',' ').upper(),fill=(240,225,194))
board.save(OUT/'fern-multiview-contact-sheet.png')
# Construction dimensions are emitted from the same constants as the mesh.
stamp={'physicalShell':[7,7],'frame':{'width':FRAME,'height':FRAME,'pivot':list(PIVOT)},'window':{'count':4,'frontCenters':[[-2.15,3.5,1.95],[2.15,3.5,1.95]],'sideCenters':[[3.5,-2,1.95],[3.5,.7,1.95]]},'porchPosts':[[-1,4.25],[1,4.25]],'doorCenter':[0,3.5],'dayNightOnlyGlazing':True,'sourceCatalogRevision':4}
stamp['sourceHashes']={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__),Path(__file__).with_name('cottage_pixels.py')]}
stamp['exportHashes']={name:hashlib.sha256((FRAMES/name).read_bytes()).hexdigest() for name in ['iso-rot0-shell.png','iso-rot0-shell-night.png','iso-rot0-canopy.png','iso-rot0-post-left.png','iso-rot0-post-right.png']}
(OUT/'construction-checks.json').write_text(json.dumps(stamp,indent=2)+'\n')
print('FERN_EXPORT_COMPLETE',OUT)
