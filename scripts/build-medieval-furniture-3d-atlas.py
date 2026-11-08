import bpy, json, math, sys, hashlib
from pathlib import Path
from PIL import Image, ImageDraw
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
catalog_path,source_dir,atlas_path=map(Path,args)
contract=json.loads(catalog_path.read_text())
models=contract['models']; size=contract['frameSize']; columns=contract['columns']
source_dir.mkdir(parents=True,exist_ok=True); frames=source_dir/'frames'; frames.mkdir(exist_ok=True)
materials_dir=source_dir/'materials'; materials_dir.mkdir(exist_ok=True)
material_path=materials_dir/'medieval-material-uv-v1.png'
TILES={'wood':0,'fabric':1,'stone':2,'metal':3,'accent':3,'glass':4,'leaf':5}

def rgb(value):
    if isinstance(value,(tuple,list)): return tuple(value)
    value=value.lstrip('#'); return tuple(int(value[n:n+2],16) for n in (0,2,4))
def mix(a,b,t): return tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))

# One object-local UV atlas holds a complete material strip for every model.
tex=Image.new('RGBA',(48,len(models)*8),(0,0,0,255)); draw=ImageDraw.Draw(tex)
for mi,item in enumerate(models):
    c=item['colors']; palette=[c['wood'],c['fabric'],c['stone'],c['accent'],'#8fa9a0',c.get('leaf','#547b52')]
    dark=[c['dark'],mix(rgb(c['fabric']),(23,21,20),.35),mix(rgb(c['stone']),(23,25,24),.35),c['dark'],'#425d58',c.get('dark','#344034')]
    light=[c['light'],mix(rgb(c['fabric']),(255,239,211),.28),mix(rgb(c['stone']),(239,232,207),.25),'#e5d29b','#d2e0d2',mix(rgb(c.get('leaf','#547b52')),(183,207,130),.35)]
    for material in range(6):
        x0=material*8;y0=(len(models)-1-mi)*8;base=rgb(palette[material]);lo=rgb(dark[material]);hi=rgb(light[material])
        for py in range(8):
            for px in range(8):
                # Material-specific pixel clusters follow the same UV tile on every face.
                tone=lo if (py in (1,6) and (px+mi)%4!=0) or (material==3 and py==7) else hi if (py==0 and px<5) or (material==4 and px==1) else base
                if material==1 and (px+py)%5==0:tone=lo
                if material==5 and (px*3+py+mi)%7==0:tone=hi
                tex.putpixel((x0+px,y0+py),(*tone,255))
tex.save(material_path)

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name!='Collection': bpy.data.collections.remove(collection)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=8; scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=size; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'; scene.render.image_settings.color_depth='8'
scene.render.film_transparent=True; scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'
scene.render.image_settings.color_mode='RGBA'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.22,.22,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
camera_data=bpy.data.cameras.new('Isometric furniture camera'); camera=bpy.data.objects.new('Isometric furniture camera',camera_data); scene.collection.objects.link(camera)
source_camera=contract.get('sourceCamera',{'location':[6,6,9.7],'target':[0,0,1.9],'orthoScale':7})
camera.location=source_camera['location']; target=Vector(source_camera['target']); camera.rotation_euler=(target-Vector(camera.location)).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'; camera_data.ortho_scale=source_camera['orthoScale']; scene.camera=camera
light_data=bpy.data.lights.new('Soft pixel-art key','AREA'); light=bpy.data.objects.new('Soft pixel-art key',light_data); scene.collection.objects.link(light)
light.location=(4,3,7); light_data.energy=620; light_data.size=5
fill_data=bpy.data.lights.new('Soft opposite-side fill','AREA'); fill=bpy.data.objects.new('Soft opposite-side fill',fill_data); scene.collection.objects.link(fill)
fill.location=(-4,2,5); fill_data.energy=190; fill_data.size=4
material_image=bpy.data.images.load(str(material_path),check_existing=False); material_image.name='Medieval furniture UV | per-model palettes'; material_image.pack()
material=bpy.data.materials.new('Medieval furniture | local UV materials'); material.use_nodes=True
nodes=material.node_tree.nodes; links=material.node_tree.links; shader=nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.88
texture=nodes.new('ShaderNodeTexImage'); texture.image=material_image; texture.interpolation='Closest'; texture.extension='REPEAT'
links.new(texture.outputs['Color'],shader.inputs['Base Color'])

root_collection=bpy.data.collections.new('Medieval furniture catalog | generated UV models'); scene.collection.children.link(root_collection)
def collection(name,parent):
    result=bpy.data.collections.new(name); parent.children.link(result); return result
def mesh_piece(name,mi,vertices,faces,face_tiles,coll):
    mesh=bpy.data.meshes.new(name+' | UV mesh'); mesh.from_pydata(vertices,[],faces); mesh.materials.append(material); mesh.update()
    uv=mesh.uv_layers.new(name='UV0 | local material atlas')
    for poly,tile in zip(mesh.polygons,face_tiles):
        axis=max(range(3),key=lambda a:abs(poly.normal[a])); axes=[a for a in range(3) if a!=axis]
        coords=[mesh.vertices[i].co for i in poly.vertices]
        lows=[min(v[a] for v in coords) for a in axes]; highs=[max(v[a] for v in coords) for a in axes]
        for li in poly.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            values=[(co[a]-lows[j])/(highs[j]-lows[j] or 1) for j,a in enumerate(axes)]
            uv.data[li].uv=((tile*8+values[0]*7)/48,(mi*8+values[1]*7)/(len(models)*8))
    obj=bpy.data.objects.new(name,mesh); coll.objects.link(obj)
    bevel=obj.modifiers.new('Soft cut edges','BEVEL'); bevel.width=.008; bevel.segments=1
    return obj

def create_builder(item,mi,root,groups):
    w,d,h=item['width'],item['depth'],item['height']; profile=item['silhouette']; variant=item['variantIndex']
    def box(u1,v1,u2,v2,z0,z1,top='wood',side='wood',front=None,group='body'):
        coll=groups[group]; x0=(u1-.5)*w; x1=(u2-.5)*w; y0=(v1-.5)*d; y1=(v2-.5)*d; z0*=h; z1*=h
        verts=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
        faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        tiles=[TILES[side],TILES[top],TILES[side],TILES[front or side],TILES[side],TILES[side]]
        obj=mesh_piece(f"{item['id']} | {group} {len(coll.objects)}",mi,verts,faces,tiles,coll); obj.parent=root
        return obj
    def post(u,v,wu=.09,wd=.09,z1=.8,z0=0,mat='wood',group='body'):
        box(u-wu/2,v-wd/2,u+wu/2,v+wd/2,z0,z1,mat,mat,group=group)
    def legs(z1=.75,amount=4,mat='wood'):
        positions=[(.13,.13),(.87,.13),(.13,.87),(.87,.87)]
        if amount==3: positions=[(.5,.12),(.16,.84),(.84,.84)]
        for u,v in positions: post(u,v,.075,.075,z1,0,mat)
    def top_panel(z0=.78,z1=.9,mat='wood'):
        box(.04,.04,.96,.96,z0,z1,mat,'wood','wood')

    fam=item['family']; is_crib=fam=='bercos'
    if fam in ('cadeiras','tronos'):
        legs(.42); box(.06,.08,.94,.92,.38,.48,'fabric','wood','fabric')
        for u in (.12,.88):
            post(u,.09,.10,.10,.97,.4,'wood'); post(u,.1,.13,.12,.98,.4,'accent' if fam=='tronos' else 'wood')
        # Distinct back silhouettes: arched, gothic and crowned profiles use mesh peaks.
        if profile in ('arched','gothic','ceremonial','carved'):
            box(.09,.06,.91,.19,.48,.84,'wood','wood','fabric')
            crest=[(.12,.08,.84),(.28,.08,.91),(.5,.08,1.0 if profile in ('gothic','ceremonial') else .94),(.72,.08,.91),(.88,.08,.84)]
            for j in range(len(crest)-1):
                a,b=crest[j],crest[j+1]
                box(a[0],.045,b[0],.14,a[2]-.055,b[2], 'accent' if fam=='tronos' else 'wood','wood','accent' if fam=='tronos' else 'fabric')
        else: box(.17,.055,.83,.16,.5,.89,'fabric','wood','fabric')
        if fam=='tronos':
            box(.02,.18,.19,.88,.4,.48,'wood','wood','accent'); box(.81,.18,.98,.88,.4,.48,'wood','wood','accent')
            for u in (.06,.94):post(u,.52,.15,.13,.93,.4,'accent')
        elif variant%3==1:
            box(.08,.25,.22,.82,.42,.53,'wood','wood');box(.78,.25,.92,.82,.42,.53,'wood','wood')
        for j in range(1+variant%3): box(.3+j*.13,.055,.33+j*.13,.09,.57,.61,'metal','metal')
    elif fam=='bancos':
        legs(.48,3 if variant%3==0 else 4); box(.06,.08,.94,.92,.44,.58,'wood','wood','fabric' if variant%2 else 'wood')
        for u in (.12,.88):post(u,.12,.12,.12,.65,.35)
        if variant%3==0: box(.12,.12,.88,.2,.58,.66,'accent','wood')
        box(.18,.2,.82,.24,.16,.22,'wood','wood');box(.18,.76,.82,.8,.16,.22,'wood','wood')
        if variant%3==2: box(.08,.28,.92,.38,.58,.64,'fabric','wood','fabric')
    elif fam=='sofas':
        legs(.27);box(.04,.08,.96,.92,.2,.48,'wood','wood')
        box(.1,.22,.9,.88,.43,.62,'fabric','wood','fabric')
        box(.03,.06,.97,.19,.43,.91,'fabric','wood','fabric')
        box(.02,.15,.18,.94,.39,.72,'wood','wood','fabric');box(.82,.15,.98,.94,.39,.72,'wood','wood','fabric')
        for u in (.25,.52,.76):box(u,.28,u+.19,.84,.61,.73,'fabric','fabric','fabric')
        if profile in ('carved','gothic','ceremonial'):box(.4,.06,.6,.18,.74,.95,'accent','wood','accent')
    elif fam in ('mesas','escrivaninhas','aparadores','bancadas'):
        if fam in ('aparadores','bancadas'):
            for u in (.13,.87):box(u-.1,.12,u+.1,.88,.12,.76,'wood','wood')
            box(.06,.12,.94,.88,.22,.72,'wood','wood','wood')
            for n in range(1+(variant%3)):
                y=.2+n*.2; box(.1,y,.9,y+.03,.42,.45,'metal','wood','metal')
                box(.14,y+.035,.86,y+.19,.25,.4,'wood','wood','wood')
        else:
            legs(.78)
            for y in (.18,.82):box(.12,y,.88,y+.06,.2,.77,'wood','wood')
        top_panel(.77,.9,'stone' if variant%4==3 else 'wood')
        if fam=='escrivaninhas':
            for y in (.16,.78):box(.12,y,.88,y+.04,.56,.72,'wood','wood','metal')
            box(.2,.22,.72,.68,.91,.925,'fabric','fabric','fabric')
            for n in range(1+variant%3):box(.26+n*.13,.25,.28+n*.13,.29,.93,.94,'accent','accent')
        if variant%4==2:
            # A distinctive trestle brace makes the old carpenter's patterns legible from every turn.
            box(.16,.46,.84,.53,.24,.32,'metal','wood','metal')
    elif fam=='camas':
        legs(.32);box(.02,.04,.98,.96,.25,.47,'wood','wood','wood')
        box(.04,.06,.96,.94,.42,.69,'fabric','wood','fabric')
        box(.09,.1,.91,.89,.68,.77,'fabric','fabric','fabric')
        box(.12,.12,.88,.88,.76,.82,'fabric','fabric','fabric')
        # Headboard stays fixed to the back; the overlay adds it again only when that face is nearest.
        box(.08,.02,.92,.13,.42,1.0,'wood','wood','wood',group='headboard')
        box(.12,.025,.88,.1,.66,.92,'accent' if profile in ('carved','ceremonial','gothic') else 'wood','wood','fabric',group='headboard')
        for u in (.16,.84):post(u,.075,.12,.12,1.0,.7,'accent' if profile=='ceremonial' else 'wood',group='headboard')
        box(.18,.16,.82,.4,.82,.94,'fabric','fabric','fabric')
        if profile=='gothic':
            box(.42,.035,.58,.1,.91,1.12,'metal','metal','accent')
        # Blanket is an independently renderable UV layer for lie/cover composition.
        box(.14,.38,.86,.93,.73,.79,'fabric','fabric','fabric',group='cover')
        for y in (.42,.88):box(.18,y,.82,y+.025,.795,.81,'accent','accent','accent',group='cover')
        for u in (.18,.82):box(u,.45,u+.025,.86,.796,.81,'accent','accent','accent',group='cover')
        if profile in ('carved','gothic','ceremonial'):box(.45,.5,.55,.56,.812,.83,'metal','metal','accent',group='cover')
        # Covers are hidden by default; the regular bed frame is rendered covered.
    elif fam=='bercos':
        legs(.3);box(.06,.05,.94,.95,.2,.48,'wood','wood','fabric');box(.1,.1,.9,.9,.45,.62,'fabric','fabric','fabric')
        for u in (.08,.88):
            post(u,.1,.1,.1,.98,.35);post(u,.9,.1,.1,.98,.35)
        for n in range(5):
            u=.18+n*.16;post(u,.1,.035,.035,.88,.48,'wood');post(u,.9,.035,.035,.88,.48,'wood')
        box(.06,.04,.94,.13,.88,.97,'wood','wood','accent');box(.06,.87,.94,.96,.88,.97,'wood','wood','accent')
        if profile in ('arched','ceremonial'):box(.08,.06,.92,.94,.95,1.0,'fabric','wood','fabric')
    elif fam=='baus':
        legs(.17);box(.03,.06,.97,.94,.1,.66,'wood','wood','wood')
        box(.02,.04,.98,.96,.62,.82,'wood','wood','accent')
        box(.45,.035,.55,.11,.17,.7,'metal','metal','accent')
        for u in (.1,.86):box(u,.04,u+.035,.1,.12,.8,'metal','metal','accent')
        box(.1,.05,.9,.09,.84,.89,'metal','metal','metal')
    elif fam in ('armarios','estantes'):
        box(.05,.05,.95,.95,.06,.96,'wood','wood','wood')
        if fam=='armarios':
            box(.08,.92,.48,.96,.1,.9,'wood','wood','accent');box(.52,.92,.92,.96,.1,.9,'wood','wood','accent')
            box(.1,.92,.45,.96,.15,.85,'fabric','wood','wood');box(.55,.92,.9,.96,.15,.85,'fabric','wood','wood')
            for u in (.42,.58):post(u,.99,.045,.04,.55,.48,'metal')
            for u in (.08,.92):post(u,.5,.09,.08,.99,.06,'accent' if profile in ('carved','ceremonial') else 'wood')
        else:
            for n in range(4):
                z=.2+n*.18;box(.08,.92,.92,.97,z,z+.04,'accent','wood','accent')
                for j in range(5):
                    u=.14+j*.14; height=.1+((j+n+variant)%3)*.035
                    box(u,.92,u+.07,.96,z+.04,z+.04+height,['fabric','accent','metal'][j%3],'wood','fabric')
    elif fam in ('banheiras','lavatorios'):
        stone='stone' if profile in ('gothic','ceremonial') else ('metal' if variant%3==0 else 'wood')
        legs(.18,4,stone);box(.04,.04,.96,.96,.12,.48,stone,stone,stone)
        # Hollow basin has four solid rims and a visible water/ceramic floor below the rim.
        box(.12,.12,.88,.88,.45,.49,'glass' if fam=='banheiras' else 'stone',stone,stone)
        for u1,v1,u2,v2 in [(.04,.04,.96,.15),(.04,.85,.96,.96),(.04,.15,.15,.85),(.85,.15,.96,.85)]:box(u1,v1,u2,v2,.45,.62,stone,stone,stone)
        box(.38,.01,.62,.12,.6,.84,'metal','metal','accent')
        for u in (.38,.58):post(u,.12,.05,.05,.85,.6,'accent')
        if fam=='lavatorios':
            post(.5,.46,.08,.08,.6,.15,'stone');box(.18,.2,.82,.48,.82,.9,'glass','metal','glass')
        else:
            for n in range(3):box(.28+n*.19,.34,.32+n*.19,.37,.5,.51,'glass','glass','glass')
    elif fam=='tochas':
        post(.5,.5,.18,.18,.34,.08,'metal');box(.25,.34,.75,.66,.32,.45,'metal','metal','accent')
        box(.35,.38,.65,.62,.45,.74,'wood','wood','metal')
        box(.29,.34,.71,.66,.72,.81,'metal','metal','accent')
        # faceted flame volumes remain separate from the wood/metal source.
        for n in range(3):
            u=.4+n*.1;box(u,.44,u+.08,.56,.78,.94-(n%2)*.08,'accent' if n==1 else 'fabric','fabric','accent',group='flame')
    elif fam in ('velas','lanternas','candelabros','lustres'):
        hanging=fam=='lustres'; baseMat='metal' if variant%2 else 'wood'
        if hanging:
            box(.05,.05,.95,.95,.88,.96,'metal','metal','accent')
            post(.5,.5,.07,.07,.95,.72,'metal')
            for u in (.2,.5,.8):box(u-.06,.45,u+.06,.55,.7,.76,'metal','metal','accent')
            centers=[(.2,.5),(.5,.5),(.8,.5),(.35,.25),(.65,.75)]
            for u,v in centers:post(u,v,.055,.055,.72,.62,'metal')
        elif fam=='candelabros':
            legs(.18,3,baseMat);post(.5,.5,.09,.09,.8,.18,'metal')
            for u in (.16,.5,.84):
                box(u-.1,.44,u+.1,.56,.68,.74,'metal','metal','accent');post(u,.5,.045,.045,.91,.72,'metal')
        elif fam=='lanternas':
            legs(.12,3,baseMat);box(.2,.18,.8,.82,.14,.82,'wood','wood','metal')
            for u in (.2,.8):
                for v in (.18,.82):post(u,v,.045,.045,.88,.14,'metal')
            box(.16,.14,.84,.86,.82,.91,'metal','metal','accent');box(.37,.08,.63,.2,.91,.99,'metal','metal')
            box(.24,.22,.76,.78,.22,.74,'glass','metal','glass',group='flame')
            box(.24,.22,.76,.78,.22,.74,'stone','metal','stone',group='off')
        else:
            legs(.12,3,baseMat);post(.5,.5,.07,.07,.78,.12,'metal')
            post(.5,.5,.32,.11,.8,.65,'metal')
            for n in range(1 if fam=='velas' else (3+variant%3)):
                a=n*math.tau/max(1,(1 if fam=='velas' else 3+variant%3));u=.5+math.cos(a)*.29;v=.5+math.sin(a)*.29
                box(u-.08,v-.08,u+.08,v+.08,.72,.78,'metal','metal','accent');box(u-.035,v-.035,u+.035,v+.035,.78,.93,'fabric','fabric','accent',group='flame')
        # Unlit glass tint is a separate state layer; flame itself is emissive color in the atlas.
        for u,v in ([ (.24,.22) ] if fam=='lanternas' else [(u,.5) for u in ([.5] if fam=='velas' else [.2,.5,.8])]):
            box(u-.035,v-.035,u+.035,v+.035,.89,.99,'accent','fabric','accent',group='flame')
    else:
        # Failsafe leaves a dimensioned UV model rather than silently reverting to flat polygons.
        legs(.75);top_panel(.75,.9);box(.08,.1,.92,.9,.2,.72,'wood','wood','accent')

    if fam not in ('tochas','velas','lanternas','candelabros','lustres','banheiras','lavatorios'):
        if profile in ('ironbound','reinforced','ceremonial'):
            for u,v in ((.08,.08),(.83,.08),(.08,.83),(.83,.83)):
                box(u,v,u+.09,v+.045,.14,.22,'metal','metal','accent')
        if profile in ('woven','turned'):
            for j in range(2+variant%3):
                u=.18+j*.18;box(u,.1,u+.025,.9,.45,.48,'accent' if j%2 else 'wood','wood','accent')
        if profile in ('carved','gothic','ceremonial','arched') and fam not in ('camas','bercos'):
            box(.42,.025,.58,.08,.88,.96,'metal' if profile=='gothic' else 'accent','wood','accent')

def make_root(item):
    root=bpy.data.objects.new(item['id']+' | floor pivot',None); root.empty_display_type='PLAIN_AXES'; root_collection.objects.link(root)
    item_coll=collection(item['id'],root_collection)
    groups={name:collection(item['id']+' | '+name,item_coll) for name in ('body','cover','flame','headboard','off')}
    create_builder(item,models.index(item),root,groups)
    return root,item_coll,groups

model_rigs=[]
for item in models:
    root,item_coll,groups=make_root(item); model_rigs.append((item,root,item_coll,groups))

# Retain the editable mesh project with all face UVs and the authored material atlas.
scene.render.filepath=str(source_dir/'preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(source_dir/'medieval-furniture-catalog-v1.blend'))

camera_mirror=Image.Transpose.FLIP_LEFT_RIGHT
for item,root,item_coll,groups in model_rigs:
    for other in model_rigs: other[2].hide_render=True
    item_coll.hide_render=False
    for group in groups.values(): group.hide_render=False
    for state_index,state in enumerate(item['states']):
        for rotation in range(4):
            for group in groups.values(): group.hide_render=True
            if state=='covered':
                groups['body'].hide_render=False; groups['headboard'].hide_render=False
                groups['cover'].hide_render=(item['family']!='camas'); groups['flame'].hide_render=False
            elif state=='open':
                groups['body'].hide_render=False; groups['headboard'].hide_render=False; groups['flame'].hide_render=True
            elif state=='cover':
                groups['cover'].hide_render=False
                # Repeat only the near headboard in the post-avatar coat layer.
                groups['headboard'].hide_render=(rotation not in (2,3))
            elif state=='off': groups['body'].hide_render=False; groups['headboard'].hide_render=False; groups['off'].hide_render=False
            root.rotation_euler[2]=rotation*math.pi/2
            scene.render.filepath=str(frames/f"{item['id'].split('.')[-1]}-{state}-rot{rotation}.png")
            bpy.ops.render.render(write_still=True)
            rendered=Image.open(scene.render.filepath).convert('RGBA').transpose(camera_mirror)
            rendered.save(scene.render.filepath)

# Pack one bounded atlas; states and rotations follow the catalog's stable frameStart contract.
atlas=Image.new('RGBA',(contract['width'],contract['height']),(0,0,0,0))
contact=Image.new('RGBA',(10*96,20*116),(31,37,35,255)); contact_draw=ImageDraw.Draw(contact)
family_sheets={}
for item in models:
    for state_index,state in enumerate(item['states']):
        for rotation in range(4):
            frame_index=item['frameStart']+state_index*4+rotation
            x=(frame_index%columns)*size;y=(frame_index//columns)*size
            frame=Image.open(frames/f"{item['id'].split('.')[-1]}-{state}-rot{rotation}.png").convert('RGBA')
            if frame.size!=(size,size): raise RuntimeError(f"Frame size mismatch: {item['id']} {state} {rotation}")
            atlas.alpha_composite(frame,(x,y))
            if state_index==0:
                ci=models.index(item); col=ci%10; row=ci//10
                thumb=frame.resize((64,64),Image.Resampling.NEAREST)
                contact.alpha_composite(thumb,(col*96+16,row*116+23))
                contact_draw.text((col*96+2,row*116+2),item['label'][:14],fill=(235,220,183,255))
                sheet=family_sheets.setdefault(item['category'],Image.new('RGBA',(4*(size+4),10*(size+22)),(31,37,35,255)))
                local_row=item['variantIndex']
                sheet.alpha_composite(frame,(rotation*(size+4)+2,local_row*(size+22)+18))
                if rotation==0: ImageDraw.Draw(sheet).text((2,local_row*(size+22)+2),item['label'][:32],fill=(235,220,183,255))

contact.save(source_dir/'catalog-front-view.png')
sheet_dir=source_dir/'direction-sheets';sheet_dir.mkdir(exist_ok=True)
for category,sheet in family_sheets.items():
    header=ImageDraw.Draw(sheet)
    for rotation in range(4): header.text((rotation*(size+4)+3,0),f'Facing {rotation}',fill=(194,202,182,255))
    sheet.save(sheet_dir/f'{category}.png')
atlas_path.parent.mkdir(parents=True,exist_ok=True); atlas.save(atlas_path,optimize=True)
digest=hashlib.sha256(atlas_path.read_bytes()).hexdigest()
manifest={**{k:v for k,v in contract.items() if k!='models'},'url':'art/room-furniture/medieval-furniture-v1.png',
  'format':'png-frame-atlas','frameCount':sum(m['frameCount'] for m in models),'sha256':digest,'bytes':atlas_path.stat().st_size,
  'materialAtlas':{'url':'art/room-furniture/medieval-3d-v1/materials/medieval-material-uv-v1.png','tileSize':8,'columns':['wood','fabric','stone','metal','glass','leaf'],'uv':'object-local/per-face'},
  'models':[{'id':m['id'],'family':m['family'],'label':m['label'],'frameStart':m['frameStart'],'states':m['states'],'rotations':[0,1,2,3]} for m in models]}
(source_dir/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'atlas':str(atlas_path),'sha256':digest,'bytes':atlas_path.stat().st_size,'models':len(models),'frames':sum(m['frameCount'] for m in models),'dimensions':atlas.size}))
