import bpy, math, os, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out_dir, atlas_path = args
os.makedirs(out_dir, exist_ok=True)

def clear_scene():
    for obj in list(bpy.data.objects):
        if obj.type in {'MESH','EMPTY'}: bpy.data.objects.remove(obj,do_unlink=True)
    for item in list(bpy.data.meshes):
        if item.users==0:bpy.data.meshes.remove(item)

def add_uv_box(name, center, size, tile, group=None):
    cx,cy,cz=center; sx,sy,sz=[v/2 for v in size]
    verts=[(cx+dx*sx,cy+dy*sy,cz+dz*sz) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh=bpy.data.meshes.new(name+'Mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    uv=mesh.uv_layers.new(name='UVMap');u0=(tile%4)/4;v0=tile//4/15
    # One complete authored material tile per face, with UVs at the atlas cell borders.
    coords=[(u0,v0),(u0+.25,v0),(u0+.25,v0+1/15),(u0,v0+1/15)]
    for poly in mesh.polygons:
        for loop_index, coord in zip(poly.loop_indices,coords):uv.data[loop_index].uv=coord
    if group is not None: obj.parent=group
    return obj

def create_material():
    image=bpy.data.images.load(atlas_path,check_existing=True)
    mat=bpy.data.materials.new('UV foliage atlas • nearest pixel');mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links
    principled=nodes.get('Principled BSDF');texture=nodes.new('ShaderNodeTexImage')
    texture.image=image;texture.interpolation='Closest';texture.extension='EXTEND'
    links.new(texture.outputs['Color'],principled.inputs['Base Color'])
    principled.inputs['Roughness'].default_value=.88
    return mat

def attach_material(obj, mat):
    obj.data.materials.append(mat)

def make_tree(kind, variant, warm, material, save_mesh=False):
    clear_scene()
    row=variant*2+int(warm) if kind=='broadleaf' else 14
    # Tile atlas is 4 columns × 15 palette rows: bark, deep, mid, sunlit foliage.
    trunk=add_uv_box(f'{kind}-{variant}-trunk',(0,0,1.0),(.24,.26,2.0),row*4)
    attach_material(trunk,material)
    branches=[]
    if kind=='broadleaf':
        width=[1.38,1.58,1.72,1.94,1.5,2.05,1.66][variant]
        height=[.68,.76,.62,.84,.73,.7,.9][variant]
        for tier,z in enumerate([1.62,2.06,2.48,2.82]):
            shrink=1-tier*.16
            group=bpy.data.objects.new(f'crown-pivot-{tier}',None);bpy.context.collection.objects.link(group)
            center=add_uv_box(f'crown-{tier}-core',(0,0,z),(width*shrink,.9*shrink,height*shrink),row*4+2,group)
            attach_material(center,material);branches.append((group,tier))
            offsets=[(-.42,.1,0),(.42,-.06,.04),(-.16,-.32,.1),(.22,.34,-.02)]
            for i,(x,y,dz) in enumerate(offsets):
                leaf=add_uv_box(f'crown-{tier}-leaf-{i}',(x*width*shrink,y,z+dz),
                    (width*.38*shrink,.56*shrink,height*.52*shrink),row*4+(3 if (i+tier)%3==0 else 2),group)
                attach_material(leaf,material)
    else:
        for tier,z in enumerate([1.42,1.76,2.1,2.44,2.77,3.06]):
            radius=[.84,.7,.57,.44,.3,.16][tier]
            group=bpy.data.objects.new(f'pine-crown-pivot-{tier}',None);bpy.context.collection.objects.link(group)
            count=5 if tier<4 else 4
            for i in range(count):
                angle=2*math.pi*i/count
                x=math.cos(angle)*radius*.43;y=math.sin(angle)*radius*.43
                leaf=add_uv_box(f'pine-tier-{tier}-branch-{i}',(x,y,z-.1),
                    (radius*.72,radius*.72,.28),row*4+(3 if (i+tier)%3==0 else 2),group)
                attach_material(leaf,material)
            cap=add_uv_box(f'pine-tier-{tier}-cap',(0,0,z+.04),(radius*.72,radius*.72,.32),row*4+2,group)
            attach_material(cap,material);branches.append((group,tier))
    bpy.context.view_layer.objects.active=trunk;trunk.select_set(True)
    bpy.ops.object.shade_flat()
    if save_mesh:return branches
    return branches

def camera_and_lights():
    bpy.ops.object.camera_add(location=(6,-8,7.0));camera=bpy.context.object
    target=Vector((0,0,1.65));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=4.15;bpy.context.scene.camera=camera
    bpy.ops.object.light_add(type='AREA',location=(3,-4,6));light=bpy.context.object
    light.data.energy=480;light.data.shape='DISK';light.data.size=5
    light.rotation_euler=(Vector((0,0,1.4))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=2
    bpy.context.scene.cycles.use_denoising=False
    bpy.context.scene.render.resolution_x=80;bpy.context.scene.render.resolution_y=104
    bpy.context.scene.render.resolution_percentage=100
    bpy.context.scene.render.image_settings.file_format='PNG';bpy.context.scene.render.image_settings.color_mode='RGBA'
    bpy.context.scene.render.film_transparent=True;bpy.context.scene.render.filepath=os.path.join(out_dir,'frame.png')
    bpy.context.scene.view_settings.view_transform='Standard';bpy.context.scene.view_settings.look='None'
    bpy.context.scene.view_settings.exposure=0;bpy.context.scene.view_settings.gamma=1

mat=create_material();camera_and_lights();scene=bpy.context.scene
scene.render.image_settings.color_mode='RGBA'
for kind,variants in [('broadleaf',7),('pine',1)]:
  for variant in range(variants):
    for warm in ([False,True] if kind=='broadleaf' else [False]):
      branches=make_tree(kind,variant,warm,mat,True)
      row=variant*2+int(warm) if kind=='broadleaf' else 0
      for frame in range(9):
        phase=frame/8*math.pi*2
        for group,tier in branches:
          weight=(tier+1)/(len(branches)+1)
          displacement=math.sin(phase-tier*.54)*(.18+weight*.48)*(frame not in (0,8))
          group.location.x=displacement
          group.rotation_euler.y=math.sin(phase-tier*.5)*.035*(frame not in (0,8))
        filename=os.path.join(out_dir,f'{kind}-{row:02d}-{frame:02d}.png')
        scene.render.filepath=filename;bpy.ops.render.render(write_still=True)
      # Save an editable UV model source at its neutral pose once per palette row.
      if (kind=='broadleaf' and variant==0 and not warm) or kind=='pine':
        if kind=='pine' or (variant==0 and not warm):
          for group,_ in branches:group.location=(0,0,0);group.rotation_euler=(0,0,0)
          bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir,'tree-uv-catalog-v1.blend'))
