import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureFaceUV,fixtureUVTransform} from './room-fixture-materials.mjs';
import {paintRoomFixture} from './room-fixture-renderer.mjs';

test('material UVs attach to the same local bed faces across all rotations',()=>{
 const faces=[];
 for(const rotation of [0,1,2,3]){
  const item={kind:'bed',width:1.9,depth:1.25,height:1.1,x:0,y:0,rotation,rotatable:true};
  const uvFaces=[];
  paintRoomFixture(item,(x,y,z)=>({x:(x-y)*32,y:(x+y)*18-z*32}),(points,color)=>{
   const uv=fixtureFaceUV(points,item),m=fixtureUVTransform(points,uv);
   if(!m)return;
   for(let i=0;i<points.length;i++){
    const [u,v]=uv[i];
    assert.ok(Math.abs(m.a*u+m.c*v+m.e-points[i][0])<=2,'UV maps back onto the projected face');
    assert.ok(Math.abs(m.b*u+m.d*v+m.f-points[i][1])<=2,'UV height follows the projected face');
   }
   // Painter order changes on rotation; compare geometry and texture anchors.
   uvFaces.push(JSON.stringify(uv.map(v=>v.map(n=>n.toFixed(5))).sort()));
  });
  faces.push(uvFaces.sort());
 }
 for(const rotation of [1,2,3])assert.deepEqual(faces[rotation],faces[0],`rotation ${rotation} preserves UVs`);
});

test('UV mapping skips non-planar faces and degenerate projections',()=>{
 assert.equal(fixtureFaceUV([[0,0,0,0,0],[1,0,1,0,1],[0,1,0,1,2]],{width:1,depth:1}),null);
 assert.equal(fixtureUVTransform([[0,0],[0,0],[0,0]],[[0,0],[1,0],[0,1]]),null);
});
