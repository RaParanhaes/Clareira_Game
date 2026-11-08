"""Fresh-Blender geometric audit of the actual authored cottage (no rendering)."""
import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'game/art/buildings/medieval-cottage-3d/medieval-cottage.blend'))
root=bpy.data.objects['Cottage | stable floor-centre pivot']
glazing=bpy.data.objects['Window | single glazing']
posts=[ob for ob in bpy.data.objects if ob.name.startswith('Porch | canonical collision post')]
result={'windowPaneRays':[],'rotationGlazingDimensions':[],'postCenters':[],'collapsedUvFaces':[], 'topology':{'degenerateFaces':0,'zeroLengthEdges':0,'nonManifoldEdges':0,'invalidCoordinates':0}}
for ob in posts:
    points=[ob.matrix_world@Vector(v) for v in ob.bound_box]
    result['postCenters'].append([round(sum(p[a] for p in points)/8,6) for a in (0,1)])
assert sorted(result['postCenters'])==[[-1.0,4.25],[1.0,4.25]],result['postCenters']
for ob in [ob for ob in bpy.data.objects if ob.type=='MESH']:
    evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=evaluated.to_mesh()
    result['topology']['degenerateFaces']+=sum(p.area<=1e-12 for p in me.polygons)
    result['topology']['zeroLengthEdges']+=sum((me.vertices[e.vertices[0]].co-me.vertices[e.vertices[1]].co).length<=1e-9 for e in me.edges)
    result['topology']['invalidCoordinates']+=sum(not all(math.isfinite(v) for v in vertex.co) for vertex in me.vertices)
    bm=bmesh.new();bm.from_mesh(me);result['topology']['nonManifoldEdges']+=sum(not e.is_manifold for e in bm.edges);bm.free();evaluated.to_mesh_clear()
    uv=ob.data.uv_layers.active
    assert uv,ob.name
    for poly in ob.data.polygons:
        points=[uv.data[i].uv for i in poly.loop_indices]
        area=abs(sum(a.x*b.y-b.x*a.y for a,b in zip(points,points[1:]+points[:1]))/2)
        if area<1e-12:result['collapsedUvFaces'].append({'object':ob.name,'face':poly.index})
for rotation in range(4):
    root.rotation_euler.z=rotation*math.pi/2;bpy.context.view_layer.update()
    matrix=root.matrix_world
    # Measure the saved object's actual corners in its rotated width/height
    # directions, rather than reporting transformed design constants.
    points=[glazing.matrix_world@Vector(v) for v in glazing.bound_box]
    width_axis=(glazing.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
    height_axis=(glazing.matrix_world.to_3x3()@Vector((0,0,1))).normalized()
    width=max(p.dot(width_axis) for p in points)-min(p.dot(width_axis) for p in points)
    height=max(p.dot(height_axis) for p in points)-min(p.dot(height_axis) for p in points)
    assert abs(width-1.10)<1e-4 and abs(height-1.69)<1e-4,(rotation,width,height)
    result['rotationGlazingDimensions'].append({'rotation':rotation,'width':width,'height':height})
    deps=bpy.context.evaluated_depsgraph_get()
    for dx in (-.28,.28):
        for dz in (-.34,.34):
            origin=matrix@Vector((2.15+dx,5.0,1.95+dz));direction=(matrix.to_3x3()@Vector((0,-1,0))).normalized()
            hit,location,normal,face,obj,transform=bpy.context.scene.ray_cast(deps,origin,direction,distance=3)
            record={'rotation':rotation,'dx':dx,'dz':dz,'hit':obj.name if hit else None}
            result['windowPaneRays'].append(record)
            assert hit and obj.original==glazing,record
root.rotation_euler.z=0;bpy.context.view_layer.update()
result['passed']=not result['collapsedUvFaces'] and not any(result['topology'].values())
path=ROOT/'logs/cottage-art-revision/geometric-audit.json';path.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert result['passed'],'Collapsed UV faces remain'
