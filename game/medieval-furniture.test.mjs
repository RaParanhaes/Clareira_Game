import test from 'node:test';
import assert from 'node:assert/strict';
import {MEDIEVAL_FURNITURE,MEDIEVAL_FURNITURE_CATEGORIES} from './medieval-furniture.mjs';
import {paintRoomFixture} from './room-fixture-renderer.mjs';

test('catalog has 200 distinct medieval furniture records in 20 usable categories',()=>{
 assert.equal(MEDIEVAL_FURNITURE.length,200);
 assert.equal(MEDIEVAL_FURNITURE_CATEGORIES.length,20);
 assert.equal(new Set(MEDIEVAL_FURNITURE.map(item=>item.id)).size,200);
 for(const category of MEDIEVAL_FURNITURE_CATEGORIES)assert.equal(MEDIEVAL_FURNITURE.filter(item=>item.category===category.id).length,10);
 for(const item of MEDIEVAL_FURNITURE){
  assert.ok(item.label&&item.width>0&&item.depth>0&&item.height>0);
  assert.equal(item.rotations,4);assert.equal(item.physics.authority,'server');
  assert.deepEqual(item.depthOrder,{anchor:'footprint-front',vertical:'support-base'});
  assert.ok(item.capabilities&&item.dimension.native.includes('surface'),`${item.id} declares object capabilities and dimension affinity`);
  assert.equal(item.renderer,'3d-uv-frame-atlas',`${item.id} uses the authored 3D/UV sprite pipeline`);
  assert.equal(item.manifest,'art/room-furniture/medieval-3d-v1/manifest.json',`${item.id} resolves through the catalog atlas`);
  if(item.use==='light')assert.ok(item.light?.kind&&item.light.reach>0&&item.light.flicker>0,`${item.id} declares an individual fire-light profile`);
 }
});

test('medieval fire sources keep separate silhouettes, light profiles, and import rules',()=>{
 const families=['tochas','velas','lanternas','candelabros','lustres'];
 const kinds=families.map(family=>MEDIEVAL_FURNITURE.find(item=>item.family===family));
 assert.deepEqual(kinds.map(item=>item.light.kind),['torch','candle','lantern','candelabra','chandelier']);
 assert.equal(new Set(kinds.map(item=>item.light.reach)).size,5);
 assert.ok(kinds.every(item=>item.capabilities.toggle&&item.dimension.crossDimensionImport==='rare'));
});

test('all furniture designs render in four facings and carry visible shape details',()=>{
 const shapeSignatures=new Set();
 for(const item of MEDIEVAL_FURNITURE){
  let faces=0;
  for(let rotation=0;rotation<4;rotation++){
   const vertices=[];paintRoomFixture({...item,kind:item.renderKind,rotation},(x,y,z)=>({x:(x-y)*32,y:(x+y)*18-z*32}),(points,color)=>{vertices.push(`${points.length}:${color}`);});
   assert.ok(vertices.length>0,`${item.id} rotation ${rotation}`);faces+=vertices.length;
  }
  shapeSignatures.add(`${item.renderKind}:${item.silhouette}:${item.variantIndex}:${faces}`);
 }
 assert.ok(shapeSignatures.size>=100,`only ${shapeSignatures.size} distinct model profiles rendered`);
});
