import bpy, math, json, sys
from PIL import Image
from mathutils import Vector
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
out = Path(args[0]); source = Path(args[1]); root = Path(args[2])
out.mkdir(parents=True, exist_ok=True); source.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.materials, bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.images):
    pass

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = False
scene.render.resolution_x = scene.render.resolution_y = 192
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.render.image_settings.color_depth = '8'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
scene.world.color = (0.18, 0.18, 0.18)
scene.render.film_transparent = True

tex = bpy.data.images.load(str(source / 'bed-material-atlas.png'), check_existing=False)
tex.name = 'bed-material-atlas-uv'; tex.pack()
mat = bpy.data.materials.new('Medieval bed | pixel UV atlas'); mat.diffuse_color=(0.53,0.37,0.24,1); mat.use_nodes=True
nodes=mat.node_tree.nodes; links=mat.node_tree.links
bsdf=nodes.get('Principled BSDF'); bsdf.inputs['Roughness'].default_value=0.88
image_node=nodes.new('ShaderNodeTexImage'); image_node.image=tex; image_node.interpolation='Closest'; image_node.extension='EXTEND'
links.new(image_node.outputs['Color'],bsdf.inputs['Base Color'])
linen = mat

def add_box(name, center, size, tile, collection):
    sx,sy,sz=size; cx,cy,cz=center
    verts=[(cx-sx/2,cy-sy/2,cz-sz/2),(cx+sx/2,cy-sy/2,cz-sz/2),(cx+sx/2,cy+sy/2,cz-sz/2),(cx-sx/2,cy+sy/2,cz-sz/2),
           (cx-sx/2,cy-sy/2,cz+sz/2),(cx+sx/2,cy-sy/2,cz+sz/2),(cx+sx/2,cy+sy/2,cz+sz/2),(cx-sx/2,cy+sy/2,cz+sz/2)]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh=bpy.data.meshes.new(name+' UV mesh'); mesh.from_pydata(verts,[],faces); mesh.materials.append(mat); mesh.update()
    ob=bpy.data.objects.new(name,mesh); collection.objects.link(ob)
    uv=mesh.uv_layers.new(name='UV0 | local face atlas')
    # Each face gets the tile for its material; UV stays attached to the authored mesh.
    u0=tile*8/32; u1=(tile*8+7)/32; v0=0.5/8; v1=7.5/8
    for poly in mesh.polygons:
        coords=[mesh.vertices[i].co for i in poly.vertices]
        normal=poly.normal
        axis=min(range(3),key=lambda a:abs(normal[a]))
        axes=[a for a in range(3) if a!=axis]
        vals0=[min(v[a] for v in coords) for a in axes]; vals1=[max(v[a] for v in coords) for a in axes]
        for li in poly.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(u0+(u1-u0)*(co[axes[0]]-vals0[0])/(vals1[0]-vals0[0] or 1),
                            v0+(v1-v0)*(co[axes[1]]-vals0[1])/(vals1[1]-vals0[1] or 1))
    return ob

def collection(name):
    c=bpy.data.collections.new(name); scene.collection.children.link(c); return c
structure=collection('01 | frame and legs')
headboard=collection('02 | headboard')
bedding=collection('03 | mattress and pillow')
duvet=collection('04 | removable duvet')
# Local X is the long bed axis; the headboard is at X=-1.125. Ground contact is Z=0.
def box(c,n,center,size,tile): return add_box(n,center,size,tile,c)
# Four substantial oak legs and rails make the furniture read as a real object.
for x in (-1.01,1.01):
  for y in (-0.53,0.53): box(structure,'oak bed post',(x,y,0.28),(0.15,0.15,0.56),0 if x<0 else 2)
box(structure,'left side rail',(0,-0.57,0.46),(2.12,0.12,0.32),2)
box(structure,'right side rail',(0,0.57,0.46),(2.12,0.12,0.32),0)
box(structure,'foot rail',(1.02,0,0.54),(0.13,1.16,0.34),2)
box(headboard,'headboard lower rail',(-1.04,0,0.62),(0.14,1.18,0.42),0)
box(headboard,'headboard panel',(-1.09,0,1.22),(0.13,0.98,0.86),0)
for y in (-0.51,0.51):
  box(headboard,'headboard finial',(-1.09,y,1.40),(0.18,0.18,0.80),2)
box(bedding,'mattress',(0,0,0.77),(1.94,1.03,0.34),1)
box(bedding,'pillow',(-0.70,0,1.00),(0.47,0.77,0.16),3)
# A quilt slab with a small skirt; it is a named optional geometry group.
box(duvet,'wool duvet top',(0.39,0,1.00),(1.08,1.06,0.13),3)
box(duvet,'duvet foot drape',(0.96,0,0.82),(0.13,1.06,0.42),1)
for y in (-0.53,0.53): box(duvet,'duvet side hem',(0.40,y,0.88),(1.04,0.09,0.30),3)

# A single floor-center pivot rotates the whole assembly as one furniture item.
rig=bpy.data.objects.new('Bed rotation pivot | floor center',None); scene.collection.objects.link(rig)
rig.empty_display_type='PLAIN_AXES'
rig.scale.x=0.84 # fit the catalog footprint (1.9 x 1.25 world units)
for ob in [obj for obj in bpy.data.objects if obj.type=='MESH']:
    ob.parent=rig

# Clean orthographic iso projection; fixed framing/pivot across all rotations and states.
cam_data=bpy.data.cameras.new('orthographic isometric camera'); cam=bpy.data.objects.new('orthographic isometric camera',cam_data); scene.collection.objects.link(cam)
cam.location=(6,6,9.7); target=Vector((0,0,1.9)); cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler(); cam_data.type='ORTHO'; cam_data.ortho_scale=7.0; scene.camera=cam
light_data=bpy.data.lights.new('large soft key','AREA'); light=bpy.data.objects.new('large soft key',light_data); scene.collection.objects.link(light); light.location=(-3,-4,7); light_data.energy=480; light_data.size=5
for c in (structure,headboard,bedding,duvet): c.hide_render=False

# A stable saved source model with actual face UVs and a single packed atlas.
bpy.ops.wm.save_as_mainfile(filepath=str(source/'medieval-bed.blend'))

frames=source/'frames'; frames.mkdir(exist_ok=True)
def render(rotation, state):
    rig.rotation_euler[2]=rotation*math.pi/2
    structure.hide_render=state=='cover'; bedding.hide_render=state=='cover'
    headboard.hide_render=state=='cover' and rotation not in (2,3)
    duvet.hide_render=state=='bare'
    suffix={'covered':'covered','bare':'bare','cover':'cover'}[state]
    final=out / f'3d-rot{rotation}-{suffix}.png'
    scene.render.filepath=str(out / ('render-source-' + final.name))
    bpy.ops.render.render(write_still=True)
    # The DCC camera's horizontal screen axis is the inverse of the game projection.
    # Flip the render so atlas rotation 0/1/2/3 matches the room's +x/-y screen basis.
    Image.open(out / ('render-source-' + final.name)).convert('RGBA').transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(final)
    frame_name={'covered':'bed','bare':'bed-open','cover':'bed-cover'}[state]
    Image.open(final).convert('RGBA').save(frames/f'{frame_name}-rot{rotation}.png')

for r in range(4):
  render(r,'bare'); render(r,'covered'); render(r,'cover')

# Transparent contact sheet rows: current sprite vs 3D render, covered and bare.
sheet=Image.new('RGBA',(4*224,4*224),(39,43,42,255)); d=__import__('PIL.ImageDraw',fromlist=['ImageDraw']).Draw(sheet)
atlas=Image.open(root/'game/art/room-furniture/room-furniture-v2.png').convert('RGBA')
manifest=json.loads((root/'game/art/room-furniture/manifest.json').read_text())
rows=manifest['rows']; palettes=manifest['palettes']; fs=manifest['frameSize']; pi=palettes.index('cedar')
def atlas_frame(row,r):
  ri=rows.index(row); y=(ri*len(palettes)+pi)*fs
  return atlas.crop((r*fs,y,(r+1)*fs,y+fs))
labels=[('ATLAS bed', 'bed'),('3D UV bed',None),('ATLAS uncovered','bed-open'),('3D UV uncovered',None)]
for row_i,(label,atlas_row) in enumerate(labels):
  d.text((8,row_i*224+5),label,fill='white')
  for r in range(4):
    im=atlas_frame(atlas_row,r) if atlas_row else Image.open(out / f"3d-rot{r}-{'covered' if row_i==1 else 'bare'}.png").convert('RGBA')
    sheet.alpha_composite(im,(r*224+16,row_i*224+24))
    d.text((r*224+16,row_i*224+208),f'rotation {r}',fill='#f2dcae')
sheet.save(out/'bed-atlas-vs-3d-uv.png')
