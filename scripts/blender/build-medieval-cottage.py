"""Clareira: reproducible UV cottage, actual architectural joints and pixel sprites.
Run: blender --background --factory-startup --python scripts/blender/build-medieval-cottage.py
Offline Blender only. Runtime remains Canvas 2D. Physical shell and porch sockets
match buildingArchitecture(cabin-cedar-one); 16/8/12 pixel world projection.
"""
import bpy, bmesh, math, random, json, sys, hashlib
from pathlib import Path
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0,str(Path(__file__).resolve().parent))
from cottage_pixels import normalize_transparent_rgb

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'game/art/buildings/medieval-cottage-3d'; FRAMES=OUT/'frames'
OUT.mkdir(parents=True,exist_ok=True); FRAMES.mkdir(exist_ok=True)
R=random.Random(412)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=False
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
colors=[(109,113,104),(199,185,147),(105,71,46),(66,47,34),(112,95,62),(83,91,78),
        (58,93,96),(32,31,28),(138,139,124),(122,104,70),(56,79,45),(89,111,60),
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
    elif ti in (M['stone'],M['stone_light'],M['plaster'],M['slate']):
        for k in range(14):
            x=R.randrange(1,53); y=R.randrange(1,54); w=R.randrange(3,11); h=R.randrange(2,7)
            delta=R.choice([-7,-4,3,6]); draw.rectangle((ox+x,oy+y,ox+x+w,oy+y+h),fill=tuple(max(0,min(255,c+delta)) for c in base))
    elif ti==M['glass']:
        draw.polygon([(ox+5,oy+5),(ox+22,oy+5),(ox+52,oy+59),(ox+39,oy+59)],fill=(68,106,109))
        draw.line((ox+7,oy+8,ox+52,oy+55),fill=(90,128,126),width=2)
atlas_path=OUT/'cottage-pixel-uv-atlas.png'; atlas.save(atlas_path)
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

# Primary silhouette: an off-centre ridge, gently swept eaves, a lower right
# saltbox wing and a roofed entrance, all sharing one 7x7 habitable shell.
RIDGE=-1.05
LX=[(-4.0,4.18),(-3.45,4.42),(-2.7,5.16),(-1.85,6.25),(RIDGE,7.10)]
RX=[(RIDGE,7.10),(-.10,6.66),(1.10,5.78),(2.32,4.65),(3.40,3.78),(4.0,3.56)]
PROFILE=LX+RX[1:]
def roof_z(x):
    for (a,z0),(b,z1) in zip(PROFILE,PROFILE[1:]):
        if a-1e-6<=x<=b+1e-6:return z0+(z1-z0)*(x-a)/(b-a)
    return PROFILE[0][1] if x<PROFILE[0][0] else PROFILE[-1][1]
section=[(-3.5,.56),(3.5,.56),(3.5,roof_z(3.5)-.18)]+[(x,z-.18) for x,z in reversed(PROFILE) if -3.5<x<3.5]+[(-3.5,roof_z(-3.5)-.18)]
walls=prism('House | solid saltbox walls with actual openings',section,-3.5,3.5,M['plaster'])
# Cut apertures before assembling jambs. Front shell plane is canonically +3.5.
for name,c,s in [('door',(0,3.5,1.8),(1.25,.9,3.6)),('bedroom',(2.15,3.5,1.95),(1.2,.9,1.8))]:
    cutter=box('Temporary aperture '+name,c,s,M['soot'],0)
    boolean=walls.modifiers.new('Real aperture '+name,'BOOLEAN');boolean.operation='DIFFERENCE';boolean.solver='EXACT';boolean.object=cutter
    bpy.context.view_layer.objects.active=walls;bpy.ops.object.modifier_apply(modifier=boolean.name);bpy.data.objects.remove(cutter,do_unlink=True)
box('Foundation | continuous mortared core',(0,0,.29),(7,7,.58),M['stone'],.07)
# Broken masonry courses with proper staggered joints on every elevation.
for side in range(4):
    for row in range(3):
        pos=-3.48;index=0
        while pos<3.46:
            length=min(R.uniform(.62,1.07),3.48-pos)
            if length<.04:break
            mid=pos+length/2;z=.11+row*.19
            if side in (0,1):c=(mid,3.505*(1 if side==0 else -1),z);s=(length-.025,.13,.175)
            else:c=(3.505*(1 if side==2 else -1),mid,z);s=(.13,length-.025,.175)
            box('Foundation | staggered fieldstone',c,s,R.choice([M['stone'],M['stone_light']]),.028)
            pos+=length;index+=1
# Sills and wall plates, interrupted at the entrance instead of spanning the door.
for y in (-3.54,3.54):
    if y>0:
        for a,b in [(-3.46,-.72),(.72,3.46)]:box('Front sill | clear threshold',((a+b)/2,y,.69),(b-a,.16,.17),M['darkwood'])
    else:box('Rear oak sill',(0,y,.69),(6.94,.16,.17),M['darkwood'])
    for x in [-3.38,-2.22,-1.12,1.26,3.38]:
        ztop=min(4.25,roof_z(x)-.27)
        box('Frame | mortised upright',(x,y,(ztop+.64)/2),(.19,.18,ztop-.64),M['oak'])
    beam('Front/rear eave rail',(-3.45,y,4.25),(1.31,y,4.25),.20,.19,M['darkwood'])
    beam('Wing upper rail',(1.31,y,4.25),(3.45,y,3.43),.18,.19,M['darkwood'])
    # Raised gable bracing stays strictly above all apertures.
    beam('Gable king post',(RIDGE,y,4.30),(RIDGE,y,6.90),.18,.18,M['oak'])
    for end in (-3.05,.92):beam('Gable arch brace',(end,y,4.36),(RIDGE,y,5.98),.14,.16,M['oak'])
    if y<0:
        beam('Rear lower brace',(-3.25,y,.80),(-2.34,y,2.15),.15,.18,M['oak'])
        beam('Rear lower brace',(3.25,y,.80),(1.26,y,2.35),.15,.18,M['oak'])
for x in (-3.54,3.54):
    high=min(4.3,roof_z(x)-.26)
    for z in (.69,high):box('Side longitudinal rail',(x,0,z),(.19,6.92,.18),M['darkwood'])
    for y in (-3.37,-1.12,1.12,3.37):box('Side structural post',(x,y,(.65+high)/2),(.19,.19,high-.65),M['oak'])
    for y in (-2.3,2.3):beam('Side raised knee brace',(x,y,high-.08),(x,y+.65,high-.85),.15,.17,M['oak'])
    # Plank wainscot gives low walls substance without a grid of random sticks.
    for i in range(16):box('Side oak wainscot',(x, -3.3+i*.44,1.03),(.09,.41,.55),M['oak'],.012)

# Deep opening, arched-head field and fitted single door. Door centre matches
# the server's access point, and porch post centres remain +/-1.0 at y=4.25.
box('Door | recess',(0,3.16,1.82),(1.25,.08,3.59),M['soot'])
box('Door | six-plank oak leaf',(0,3.45,1.82),(1.17,.11,3.55),M['oak'],.025)
for i in range(6):
    x=-.4875+i*.195;box('Door | board',(x,3.518,1.82),(.178,.028,3.50),M['oak'] if i%2 else M['darkwood'],.009)
for x in (-.73,.73):box('Door | carved jamb',(x,3.59,1.9),(.18,.22,3.80),M['darkwood'])
box('Door | heavy lintel',(0,3.59,3.80),(1.62,.24,.22),M['oak'])
for z in (.94,2.72):
    box('Door | forged strap hinge',(-.13,3.551,z),(.90,.055,.09),M['iron'],.015)
    for x in (-.48,.23):tube('Door | iron hinge stud',(x,3.585,z),.034,.025,M['iron'])
tube('Door | ring handle',(.38,3.60,1.74),.095,.035,M['iron'],inner=.060)
box('Door | foot threshold',(0,3.67,.12),(1.42,.52,.24),M['stone_light'],.04)

# Exactly one glazed bedroom window. Trim is outside the 1.2x1.8 aperture;
# shutters fold flat beside it and never cross the glass in any rotation.
WX=2.15;WZ=1.95
box('Window | reveal shadow',(WX,3.16,WZ),(1.20,.08,1.80),M['soot'],0)
box('Window | single glazing',(WX,3.43,WZ),(1.10,.045,1.69),M['glass'],.008)
for x in (WX-.65,WX+.65):box('Window | jamb',(x,3.56,WZ),(.13,.22,2.03),M['darkwood'])
for z in (WZ- .96,WZ+.96):box('Window | rail',(WX,3.56,z),(1.42,.22,.13),M['oak'])
box('Window | vertical mullion',(WX,3.58,WZ),(.055,.06,1.80),M['darkwood'],.008)
box('Window | horizontal mullion',(WX,3.58,WZ+.14),(1.20,.06,.055),M['darkwood'],.008)
for x in (1.24,3.06):
    box('Window | open shutter',(x,3.585,WZ),(.30,.11,1.83),M['oak'],.018)
    for z in (WZ-.62,WZ+.62):box('Window | shutter strap',(x,3.652,z),(.26,.035,.055),M['iron'],.008)
box('Window | stone drip sill',(WX,3.64,.95),(1.54,.42,.16),M['stone_light'],.04)
# Suspended planter: flower/leaf geometry stays outside the glazing and above
# the foot path. A few large silhouettes remain legible at native game scale.
box('Window | planter soil',(WX,3.88,.83),(1.36,.32,.12),M['soot'])
box('Window | planter front',(WX,4.06,.67),(1.48,.10,.40),M['oak'])
for x in (WX-.70,WX+.70):box('Window | planter end',(x,3.87,.67),(.09,.39,.40),M['darkwood'])
for x in (WX-.49,WX+.49):beam('Window | planter support',(x,3.55,.45),(x,3.94,.76),.07,.07,M['iron'])
for i in range(7):
    x=WX-.56+i*.185;y=3.93+R.uniform(-.08,.08);z=1.03+R.uniform(-.04,.10)
    beam('Planter | stem',(x,y,.86),(x,y,z),.035,.035,M['leaf'])
    for dx,dy in [(-.09,.02),(.06,-.03)]:box('Planter | leaf',(x+dx,y+dy,z-.06),(.18,.14,.06),R.choice([M['leaf'],M['sage']]),.025)
    tube('Planter | blossom',(x,y,z+.035),.072,.08,M['flower'] if i%3 else M['gold'],axis='Z',segments=6)

# Roof surfaces: closed slabs with genuine staggered, overlapping shingles.
# No unsupported lattice beams. Each shingle follows the swept roof profile.
def slab(name,x0,x1,y0,y1,z0,z1,tile,thick=.12):
    return mesh(name,[(x0,y0,z0),(x1,y0,z1),(x1,y1,z1),(x0,y1,z0),
                      (x0,y0,z0-thick),(x1,y0,z1-thick),(x1,y1,z1-thick),(x0,y1,z0-thick)],
                [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],tile)
for side,(start,end) in enumerate([(-4.0,RIDGE),(4.0,RIDGE)]):
    cuts=sorted(set([start,end]+[x for x,z in PROFILE if min(start,end)<x<max(start,end)]))
    for a,b in zip(cuts,cuts[1:]):slab('Roof | solid swept substrate',a,b,-3.91,3.91,roof_z(a),roof_z(b),M['darkwood'],.16)
    rows=9 if side==0 else 14
    for row in range(rows):
        t0=row/rows;t1=min(1,(row+1.42)/rows)
        x0=start+(end-start)*t0;x1=start+(end-start)*t1
        y=-3.91-(.23 if row%2 else 0);index=0
        while y<3.9:
            y0=max(-3.91,y+.008);y1=min(3.91,y+.48-.008)
            if y1-y0>.045:
                # Geometry variation is small, deterministic, never view-specific.
                offset=.055+(rows-row)*.0015+R.uniform(0,.012)
                a,b=sorted([x0,x1]);slab('Roof | hand split cedar shingle',a,b,y0,y1,roof_z(a)+offset,roof_z(b)+offset,R.choice([M['shingle']]*7+[M['oak_light']]*3),.045)
            y+=.48;index+=1
# Fascia follows each profile segment and returns along the eave thickness.
for y in (-3.94,3.94):
    for (a,z0),(b,z1) in zip(PROFILE,PROFILE[1:]):beam('Roof | carved continuous bargeboard',(a,y,z0-.08),(b,y,z1-.08),.16,.14,M['oak'])
for x in (-4.0,4.0):beam('Roof | eave fascia',(x,-3.92,roof_z(x)-.10),(x,3.92,roof_z(x)-.10),.19,.16,M['darkwood'])
for i in range(19):
    y=-3.81+i*.42
    # A capped ridge with two pitched facets instead of a floating rectangular rod.
    slab('Roof | ridge cap left',RIDGE-.20,RIDGE,y-.20,y+.20,7.02,7.19,M['darkwood'],.08)
    slab('Roof | ridge cap right',RIDGE,RIDGE+.20,y-.20,y+.20,7.19,7.02,M['darkwood'],.08)

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
# Small gable vent has no glazing or night emission, and is not another bedroom.
tube('Gable | blind round timber vent',(RIDGE,3.57,5.52),.38,.16,M['darkwood'],inner=.27)
box('Gable | vent backing',(RIDGE,3.52,5.52),(.55,.04,.55),M['soot'],.04)
for dz in (-.17,-.06,.06,.17):
    width=2*math.sqrt(.27**2-dz**2)
    box('Gable | louvre',(RIDGE,3.66,5.52+dz),(width,.06,.045),M['oak'],.008)

# Tapered, coursed chimney rooted below the roof, with flashing and hollow pot.
CX=1.70;CY=-1.80
for i in range(9):
    z=5.18+i*.29;size=.89-i*.022
    box('Chimney | tapered masonry core',(CX,CY,z),(size,size,.30),M['stone'],.025)
    for side in range(4):
        for j in range(2):
            off=(-.25+j*.5)*size
            if side<2:c=(CX+off,CY+(1 if side==0 else -1)*size*.5,z);s=(size*.46,.055,.24)
            else:c=(CX+(1 if side==2 else -1)*size*.5,CY+off,z);s=(.055,size*.46,.24)
            box('Chimney | staggered dressed stone',c,s,M['stone_light'] if (i+j+side)%4==0 else M['stone'],.018)
box('Chimney | slate flashing',(CX,CY,5.70),(1.12,1.12,.12),M['slate'])
box('Chimney | projecting crown',(CX,CY,7.69),(1.02,1.02,.20),M['stone_light'],.035)
tube('Chimney | clay collar',(CX,CY,7.85),.31,.18,M['clay'],axis='Z',inner=.20)
tube('Chimney | open clay pot',(CX,CY,8.12),.245,.47,M['clay'],axis='Z',inner=.18)
tube('Chimney | pot rim',(CX,CY,8.36),.29,.09,M['clay'],axis='Z',inner=.18)
box('Chimney | dark flue',(CX,CY,7.88),(.30,.30,.03),M['soot'])
# Restrained repairs on reverse walls; all braces are supported by framing.
for y in (-3.55,):
    for i in range(6):box('Rear | weathered infill repair',(-2.7+i*.22,y,1.45),(.19,.05,1.02),M['oak'],.012)

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

for i in range(4):render('iso-rot'+str(i),(9,9,9.748469228),(0,0,2.4),i,True)
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
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'medieval-cottage.blend'))
for p in OUT.glob('*.blend1'):p.unlink()
# Every review view is visible; the old two-row sheet silently clipped the hero.
names=['iso-rot0','iso-rot1','iso-rot2','iso-rot3','front','back','left','right','iso-rot0-night','top','hero-three-quarter']
board=Image.new('RGB',(4*352,3*366),(39,48,51));d=ImageDraw.Draw(board)
for i,name in enumerate(names):
    x=(i%4)*352;y=(i//4)*366
    im=Image.open(FRAMES/(name+'.png')).convert('RGBA');im.thumbnail((320,320),Image.Resampling.NEAREST)
    board.paste(im,(x+(352-im.width)//2,y+34+(320-im.height)//2),im)
    d.text((x+16,y+12),name.replace('-',' ').upper(),fill=(240,225,194))
board.save(OUT/'cottage-multiview-contact-sheet.png')
# Construction dimensions are emitted from the same constants as the mesh.
stamp={'physicalShell':[7,7],'frame':{'width':FRAME,'height':FRAME,'pivot':list(PIVOT)},'window':{'count':1,'clearWidth':1.2,'clearHeight':1.8,'center':[WX,3.5,WZ]},'porchPosts':[[-1,4.25],[1,4.25]],'doorCenter':[0,3.5],'dayNightOnlyGlazing':True}
stamp['sourceHashes']={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__),Path(__file__).with_name('cottage_pixels.py')]}
stamp['exportHashes']={name:hashlib.sha256((FRAMES/name).read_bytes()).hexdigest() for name in ['iso-rot0-shell.png','iso-rot0-shell-night.png','iso-rot0-canopy.png','iso-rot0-post-left.png','iso-rot0-post-right.png']}
(OUT/'construction-checks.json').write_text(json.dumps(stamp,indent=2)+'\n')
print('COTTAGE_EXPORT_COMPLETE',OUT)
