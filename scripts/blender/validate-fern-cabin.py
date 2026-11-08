"""Audit the reviewed Samambaia draft in a fresh Blender process."""
import bpy,bmesh,json,math,os
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'logs/fern-cabin-revision'
blend=Path(os.environ.get('FERN_AUDIT_BLEND',ROOT/'art-source/buildings/fern-cabin-3d/fern-cabin.blend'))
bpy.ops.wm.open_mainfile(filepath=str(blend))
root=bpy.data.objects['Cottage | stable floor-centre pivot']
result={'windowPaneRays':[],'postCenters':[],'collapsedUvFaces':[], 'topology':{'degenerateFaces':0,'zeroLengthEdges':0,'nonManifoldEdges':0,'invalidCoordinates':0}}
posts=[ob for ob in bpy.data.objects if ob.name.startswith('Porch | canonical collision post')]
for ob in posts:
 points=[ob.matrix_world@Vector(v) for v in ob.bound_box]
 result['postCenters'].append([round(sum(p[a] for p in points)/8,6) for a in (0,1)])
for ob in [ob for ob in bpy.data.objects if ob.type=='MESH']:
 evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=evaluated.to_mesh()
 result['topology']['degenerateFaces']+=sum(p.area<=1e-12 for p in me.polygons)
 result['topology']['zeroLengthEdges']+=sum((me.vertices[e.vertices[0]].co-me.vertices[e.vertices[1]].co).length<=1e-9 for e in me.edges)
 result['topology']['invalidCoordinates']+=sum(not all(math.isfinite(v) for v in vertex.co) for vertex in me.vertices)
 bm=bmesh.new();bm.from_mesh(me);result['topology']['nonManifoldEdges']+=sum(not e.is_manifold for e in bm.edges);bm.free();evaluated.to_mesh_clear()
 uv=ob.data.uv_layers.active
 if not uv:result['collapsedUvFaces'].append({'object':ob.name,'issue':'missing-uv'});continue
 for poly in ob.data.polygons:
  points=[uv.data[i].uv for i in poly.loop_indices]
  area=abs(sum(a.x*b.y-b.x*a.y for a,b in zip(points,points[1:]+points[:1]))/2)
  if area<1e-12:result['collapsedUvFaces'].append({'object':ob.name,'face':poly.index})
for rotation in range(4):
 root.rotation_euler.z=rotation*math.pi/2;bpy.context.view_layer.update();matrix=root.matrix_world;deps=bpy.context.evaluated_depsgraph_get()
 for elevation,center,axis in [('front',(-2.15,3.5,1.95),'front'),('front',(2.15,3.5,1.95),'front'),('side',(3.5,-2,1.95),'side'),('side',(3.5,.7,1.95),'side')]:
  for delta in (-.22,.22):
   origin=Vector((center[0]+delta,5.3,center[2]+.25)) if axis=='front' else Vector((5.1,center[1]+delta,center[2]+.25))
   direction=Vector((0,-1,0)) if axis=='front' else Vector((-1,0,0))
   hit,location,normal,face,obj,transform=bpy.context.scene.ray_cast(deps,matrix@origin,(matrix.to_3x3()@direction).normalized(),distance=3)
   result['windowPaneRays'].append({'rotation':rotation,'elevation':elevation,'center':list(center),'offset':delta,'hit':obj.name if hit else None,'pass':bool(hit and obj.name.startswith('Window | '+elevation+' glazing'))})
root.rotation_euler.z=0;bpy.context.view_layer.update()
result['passed']=sorted(result['postCenters'])==[[-1.0,4.25],[1.0,4.25]] and not result['collapsedUvFaces'] and not any(result['topology'].values()) and all(r['pass'] for r in result['windowPaneRays'])
(out/'geometric-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'topology':result['topology'],'collapsedUvs':len(result['collapsedUvFaces']),'failedRays':[x for x in result['windowPaneRays'] if not x['pass']]},indent=2))
if not result['passed']:raise SystemExit(1)
