"""Mirante: draft Blender source for a timber cabin with a gabled roof.
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
OUT=ROOT/'logs/lookout-cabin-revision/draft'; FRAMES=OUT/'frames'
OUT.mkdir(parents=True,exist_ok=True); FRAMES.mkdir(exist_ok=True)
R=random.Random(412)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=12 if os.environ.get('LOOKOUT_PREVIEW_ONLY')=='1' else 24; scene.cycles.use_denoising=False
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
colors=[(168,135,91),(168,135,91),(105,71,46),(66,47,34),(115,113,129),(85,84,94),
        (58,93,96),(32,31,28),(170,129,84),(122,104,70),(56,79,45),(103,102,118),
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
    elif ti in (M['stone'],M['stone_light'],M['plaster'],M['slate'],M['sage']):
        for k in range(14):
            x=R.randrange(1,53); y=R.randrange(1,54); w=R.randrange(3,11); h=R.randrange(2,7)
            delta=R.choice([-7,-4,3,6]); draw.rectangle((ox+x,oy+y,ox+x+w,oy+y+h),fill=tuple(max(0,min(255,c+delta)) for c in base))
    elif ti==M['glass']:
        draw.polygon([(ox+5,oy+5),(ox+22,oy+5),(ox+52,oy+59),(ox+39,oy+59)],fill=(68,106,109))
        draw.line((ox+7,oy+8,ox+52,oy+55),fill=(90,128,126),width=2)
atlas_path=OUT/'lookout-pixel-uv-atlas.png'; atlas.save(atlas_path)
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

# Samambaia: stone shell follows the 7x7 collider. Four real openings follow
# buildingWindows(): two front windows and two on the right elevation.
walls=box('Fern | structural masonry shell',(0,0,2.35),(7,7,4.0),M['plaster'],0)
def cut(target,name,c,s):
    cutter=box('Temporary aperture '+name,c,s,M['soot'],0)
    mod=target.modifiers.new('Real aperture '+name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.context.view_layer.objects.active=target;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
cut(walls,'door',(0,3.5,1.8),(1.25,.9,3.6))
for x in (-2.15,2.15):cut(walls,'front window',(x,3.5,1.95),(1.2,1.2,1.8))
for y in (-2,.7):cut(walls,'side window',(3.5,y,1.95),(1.2,.9,1.8))
box('Fern | foundation',(0,0,.22),(7.08,7.08,.44),M['stone_light'],.04)
# Stone foundation courses and joints give the timber frame a grounded footing.
for row in range(2):
    for side in (-1,1):
        for i in range(12):
            x=-3.23+i*.59+(row%2)*.06
            if side==1 and abs(x)<.78:continue
            box('Foundation | front and back blocks',(x,side*3.55,.12+row*.18),(.55,.055,.15),M['slate'],.006)
        for i in range(12):
            y=-3.23+i*.59+(row%2)*.06
            box('Foundation | side blocks',(side*3.55,y,.12+row*.18),(.055,.55,.15),M['slate'],.006)
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
# Structural timber frames run between the actual apertures.
for y in (-3.52,3.52):
    for x in (-3.35,-1.40,1.40,3.35):
        box('Timber | facade upright',(x,y,2.35),(.18,.12,3.85),M['darkwood'])
    for z in (.55,3.93):
        box('Timber | facade rail',(0,y,z),(6.9,.12,.18),M['oak'])
for x in (-3.52,3.52):
    for y in (-3.35,-.65,2.05,3.35):
        box('Timber | side upright',(x,y,2.35),(.12,.18,3.85),M['darkwood'])
    for z in (.55,3.93):
        box('Timber | side rail',(x,0,z),(.12,6.9,.18),M['oak'])
# Gabled slate roof, ridge along X. The two sloped surfaces are solid.
eave=3.84; ez=4.35; rz=6.45
for side in (-1,1):
    verts=[(-eave,0,rz),(eave,0,rz),(eave,side*eave,ez),(-eave,side*eave,ez)]
    verts += [(x,y,z-.16) for x,y,z in verts]
    mesh('Roof | solid slate slope',verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],M['shingle'])
    for row in range(14):
        t0=row/14;t1=min(1,(row+1.38)/14)
        x=-eave-(.22 if row%2 else 0)
        while x<eave:
            x0=max(-eave,x+.01);x1=min(eave,x+.44-.01);x+=.44
            if x1-x0<.04:continue
            y0=side*eave*t0;y1=side*eave*t1
            variation=R.uniform(.045,.061)
            z0=rz+(ez-rz)*t0+variation;z1=rz+(ez-rz)*t1+variation
            vs=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z1),(x0,y1,z1)]
            vs += [(x,y,z-.035) for x,y,z in vs]
            mesh('Roof | staggered slate tile',vs,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],R.choice([M['shingle']]*5+[M['sage']]))
    beam('Roof | fascia',(-eave,side*eave,ez),(eave,side*eave,ez),.17,.16,M['darkwood'])
for x in (-eave,eave):
    for side in (-1,1):beam('Roof | verge',(x,side*eave,ez),(x,0,rz),.15,.15,M['darkwood'])
    prism('Gable | timber infill',[(-eave,ez),(eave,ez),(0,rz)],x-.07,x+.07,M['plaster']).rotation_euler[2]=math.pi/2
beam('Roof | ridge',(-eave,0,rz),(eave,0,rz),.16,.16,M['oak'])
# Dressed masonry chimney sits on the roof, with flashing and an open clay flue.
CX=-1.9;CY=-1.15
for i in range(7):
    z=5.36+i*.25;size=.76-i*.012
    box('Chimney | stone core',(CX,CY,z),(size,size,.26),M['slate'],.018)
    for side in range(4):
        for j in range(2):
            offset=(-.25+j*.5)*size
            if side<2:c=(CX+offset,CY+(1 if side==0 else -1)*size*.5,z);size3=(size*.46,.045,.20)
            else:c=(CX+(1 if side==2 else -1)*size*.5,CY+offset,z);size3=(.045,size*.46,.20)
            box('Chimney | dressed stone',c,size3,M['stone_light'] if (i+j+side)%5==0 else M['slate'],.012)
box('Chimney | flashing',(CX,CY,5.45),(1.0,1.0,.10),M['iron'])
box('Chimney | crown',(CX,CY,7.06),(.90,.90,.16),M['stone_light'],.025)
tube('Chimney | clay collar',(CX,CY,7.19),.24,.16,M['clay'],axis='Z',inner=.15)
tube('Chimney | open clay flue',(CX,CY,7.42),.20,.32,M['clay'],axis='Z',inner=.14)
tube('Chimney | rim',(CX,CY,7.60),.24,.07,M['clay'],axis='Z',inner=.14)
for x in (-3.35,3.35):
    for y in (-3.35,3.35):box('Fern | corner upright',(x,y,2.4),(.19,.19,3.8),M['oak'])

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
    if i==0 and os.environ.get('LOOKOUT_PREVIEW_ONLY')=='1':
        print('LOOKOUT_PREVIEW_COMPLETE');sys.exit(0)
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
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'lookout-cabin.blend'))
for p in OUT.glob('*.blend1'):p.unlink()
# Every review view is visible; the old two-row sheet silently clipped the hero.
names=['iso-rot0','iso-rot1','iso-rot2','iso-rot3','front','back','left','right','iso-rot0-night','top','hero-three-quarter']
board=Image.new('RGB',(4*352,3*366),(39,48,51));d=ImageDraw.Draw(board)
for i,name in enumerate(names):
    x=(i%4)*352;y=(i//4)*366
    im=Image.open(FRAMES/(name+'.png')).convert('RGBA');im.thumbnail((320,320),Image.Resampling.NEAREST)
    board.paste(im,(x+(352-im.width)//2,y+34+(320-im.height)//2),im)
    d.text((x+16,y+12),name.replace('-',' ').upper(),fill=(240,225,194))
board.save(OUT/'lookout-multiview-contact-sheet.png')
# Construction dimensions are emitted from the same constants as the mesh.
stamp={'physicalShell':[7,7],'frame':{'width':FRAME,'height':FRAME,'pivot':list(PIVOT)},'window':{'count':4,'frontCenters':[[-2.15,3.5,1.95],[2.15,3.5,1.95]],'sideCenters':[[3.5,-2,1.95],[3.5,.7,1.95]]},'porchPosts':[[-1,4.25],[1,4.25]],'doorCenter':[0,3.5],'dayNightOnlyGlazing':True,'sourceCatalogRevision':4}
stamp['sourceHashes']={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__),Path(__file__).with_name('cottage_pixels.py')]}
stamp['exportHashes']={name:hashlib.sha256((FRAMES/name).read_bytes()).hexdigest() for name in ['iso-rot0-shell.png','iso-rot0-shell-night.png','iso-rot0-canopy.png','iso-rot0-post-left.png','iso-rot0-post-right.png']}
(OUT/'construction-checks.json').write_text(json.dumps(stamp,indent=2)+'\n')
print('LOOKOUT_EXPORT_COMPLETE',OUT)
