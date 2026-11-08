import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from './content-assets.mjs';
import { MEDIEVAL_FURNITURE_ATLAS, ROOM_FIXTURE_ATLAS, fixtureFrontFaceVisible, medievalFurnitureFrameIndex, paintRoomFixture } from './room-fixture-renderer.mjs';
import { MEDIEVAL_FURNITURE } from './medieval-furniture.mjs';

test('v3 atlas registers the 3D/UV bed source and keeps its authored interaction layers',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const [manifestBytes,atlasBytes]=await Promise.all([
  readFile(path.join(root,'game/art/room-furniture/manifest.json')),
  readFile(path.join(root,'game',ROOM_FIXTURE_ATLAS.url)),
 ]);
 const manifest=JSON.parse(manifestBytes.toString());
 assert.equal(ROOM_FIXTURE_ATLAS.version,3);
 assert.equal(ASSETS.find(asset=>asset.id==='image.room-furniture')?.url,ROOM_FIXTURE_ATLAS.url);
 assert.equal(manifest.version,ROOM_FIXTURE_ATLAS.version);
 assert.equal(manifest.sha256,createHash('sha256').update(atlasBytes).digest('hex'));
 assert.deepEqual(manifest.authoredModels.bed.layers,['bed','bed-open','bed-cover']);
 assert.equal(manifest.authoredModels.bed.method,'orthographic-3d-render-with-UV-texture');
});

test('all 200 medieval models have UV atlas frames for four views and their interaction states',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const manifestPath=path.join(root,'game/art/room-furniture/medieval-3d-v1/manifest.json');
 const atlasPath=path.join(root,'game',MEDIEVAL_FURNITURE_ATLAS.url);
 const framesPath=path.join(root,'game/art/room-furniture/medieval-3d-v1/frames');
 const [manifestBytes,atlasBytes,frameFiles]=await Promise.all([readFile(manifestPath),readFile(atlasPath),readdir(framesPath)]);
 const manifest=JSON.parse(manifestBytes.toString());
 assert.equal(MEDIEVAL_FURNITURE_ATLAS.frameSize,128);
 assert.equal(ASSETS.find(asset=>asset.id==='image.medieval-furniture-3d')?.url,MEDIEVAL_FURNITURE_ATLAS.url);
 assert.equal(manifest.models.length,200);
 assert.equal(manifest.frameCount,1080);
 assert.equal(frameFiles.filter(file=>file.endsWith('.png')).length,manifest.frameCount);
 assert.equal(manifest.width,MEDIEVAL_FURNITURE_ATLAS.columns*MEDIEVAL_FURNITURE_ATLAS.frameSize);
 assert.equal(atlasBytes.readUInt32BE(16),manifest.width);assert.equal(atlasBytes.readUInt32BE(20),manifest.height);
 assert.equal(manifest.sha256,createHash('sha256').update(atlasBytes).digest('hex'));
 let frame=0;
 for(const [index,item] of MEDIEVAL_FURNITURE.entries()){
  const model=manifest.models[index];
  assert.equal(model.id,item.id);assert.equal(model.frameStart,frame);
  const count=4+(item.family==='camas'?8:0)+(item.use==='light'?4:0);
  assert.equal(model.rotations.length,4);assert.equal(model.states.length*4,count);
  for(let rotation=0;rotation<4;rotation++)assert.equal(medievalFurnitureFrameIndex({...item,kind:item.renderKind,rotation}),frame+rotation);
  if(item.family==='camas'){
   assert.equal(medievalFurnitureFrameIndex({...item,kind:'bed',cover:false,rotation:2}),frame+6);
   assert.equal(medievalFurnitureFrameIndex({...item,kind:'bed-cover',rotation:1}),frame+9);
  }
  if(item.use==='light')assert.equal(medievalFurnitureFrameIndex({...item,kind:item.renderKind,enabled:false,rotation:3}),frame+7);
  frame+=count;
 }
 assert.equal(manifest.width*manifest.height,frame*MEDIEVAL_FURNITURE_ATLAS.frameSize**2);
});

test('front-face details stay on the two facings visible to the room camera',()=>{
 assert.deepEqual([0,1,2,3].map(rotation=>fixtureFrontFaceVisible(rotation)),
  [true,false,false,true]);
 assert.equal(fixtureFrontFaceVisible(-1),true,'negative rotations normalize to the same facing');
 assert.equal(fixtureFrontFaceVisible(1,false),true,'fixed-facing fixtures retain their authored face');
});

test('chair render layers keep rear geometry and only the two camera-front legs separate in all rotations',()=>{
 for(const rotation of [0,1,2,3]){
  const render=renderLayer=>{
   const polygons=[];
   paintRoomFixture({kind:'chair',renderLayer,width:.52,depth:.52,height:2.2,x:0,y:0,rotation,rotatable:true},
    (x,y,z)=>({x:(x-y)*32,y:(x+y)*18-z*32}),points=>polygons.push(points));
   return polygons;
  };
  const back=render('chair-back'),front=render('chair-front');
  assert.ok(back.length>front.length,`rotation ${rotation}: rear pass includes seat and backrest`);
  assert.equal(front.length,10,`rotation ${rotation}: front pass contains exactly two legs`);
  assert.ok(front.every(points=>points.every(point=>point[4]<=.95)),`rotation ${rotation}: front pass has no seat or backrest pixels`);
 }
});

test('near headboards occlude bedding in the full bed and sleeping overlay in all facings',()=>{
 for(const rotation of [0,1,2,3])for(const kind of ['bed','bed-cover']){
  const polygons=[];
  paintRoomFixture({kind,width:1.9,depth:1.25,height:1.1,x:0,y:0,rotation,rotatable:true},
   (x,y,z)=>({x:(x-y)*32,y:(x+y)*18-z*32}),points=>polygons.push(points));
  const headboard=polygons.map((points,index)=>points.some(p=>p[4]>1.7)?index:-1).filter(i=>i>=0);
  const pillow=polygons.map((points,index)=>points.some(p=>p[2]>=.12&&p[2]<=.31&&p[4]>1.2&&p[4]<1.3)?index:-1).filter(i=>i>=0);
  if(rotation>=2){
   assert.ok(headboard.length>0,`${kind}/${rotation}: near headboard exists`);
   assert.ok(polygons.at(-1).every(p=>p[2]<=.075),`${kind}/${rotation}: headboard finishes the layer`);
   if(kind==='bed')assert.ok(Math.min(...headboard)>Math.max(...pillow),'pillow cannot paint over near headboard');
  }else if(kind==='bed-cover')assert.equal(headboard.length,0,'rear headboard stays below the sleeper');
  else assert.ok(Math.max(...headboard)<Math.min(...pillow),'rear headboard paints before pillow');
 }
});
