import test from 'node:test';import assert from 'node:assert/strict';import {surfaceHeight,canTraverseSurface} from './elevation.mjs';import {DIMENSION_COORDINATE_OFFSET} from './dimension-layout.mjs';import {BLOCK_TERRAIN_CELL,BLOCK_TERRAIN_MAX_HEIGHT,BLOCK_TERRAIN_STEP,BLOCK_TERRAIN_FEATURE_ID,getNaturalPatches,naturalHeight,NATURAL_PATCHES} from './natural-terrain.mjs';import {emptyWorldDefinition,setWorldDefinition} from './world-edits.mjs';
const atSurfaceOrigin=value=>value+DIMENSION_COORDINATE_OFFSET;
test('the former natural hill is flat and contains no raised terrain patches',()=>{
 for(const [x,y] of [[17,14],[atSurfaceOrigin(35),atSurfaceOrigin(21)],[atSurfaceOrigin(35.5),atSurfaceOrigin(28)]])assert.equal(surfaceHeight(x,y),0);
 for(const from of [{x:atSurfaceOrigin(35.5),y:atSurfaceOrigin(28)},{x:atSurfaceOrigin(29),y:atSurfaceOrigin(21)},{x:atSurfaceOrigin(41),y:atSurfaceOrigin(21)},{x:atSurfaceOrigin(35),y:atSurfaceOrigin(14)}])assert.ok(canTraverseSurface(from,{x:atSurfaceOrigin(35),y:atSurfaceOrigin(21)}));
 assert.deepEqual(NATURAL_PATCHES,[]);
});

test('the sky island trial uses stepped cells, exposed block faces, and a walkable height gradient',()=>{
 const centre={x:180.5,y:200.5},definition={...emptyWorldDefinition('ceu'),theme:'sky',edits:[{id:BLOCK_TERRAIN_FEATURE_ID,type:'mountain',...centre,radius:24}]};
 setWorldDefinition(definition);
 try{
  assert.equal(naturalHeight(centre.x,centre.y),BLOCK_TERRAIN_MAX_HEIGHT);
  assert.equal(surfaceHeight(centre.x,centre.y),BLOCK_TERRAIN_MAX_HEIGHT);
  assert.equal(naturalHeight(centre.x+30,centre.y),0);
  const route=[];
  for(let t=0;t<=1;t+=.01){const position={x:centre.x-30+t*30,y:centre.y-30+t*30};route.push(position)}
  for(let i=1;i<route.length;i++)assert.ok(canTraverseSurface(route[i-1],route[i]),`walkable sample ${i}`);
  const patches=getNaturalPatches({left:centre.x-3,top:centre.y-3,right:centre.x+3,bottom:centre.y+3});
  assert.ok(patches.length>0);
  assert.ok(patches.some(patch=>patch.faces.length>0),'raised cells expose camera-facing side faces');
  assert.ok(patches.every(patch=>patch.corners.every(height=>height===patch.height)),'tops are flat block surfaces');
  for(const patch of patches)for(const face of patch.faces){
   const lower=face.edge[2][2];assert.ok(face.height-lower<=BLOCK_TERRAIN_STEP+1e-7,'each riser stays within one authored terrain step');
  }
  assert.equal(BLOCK_TERRAIN_CELL,1);
 }finally{setWorldDefinition(emptyWorldDefinition());}
});
