import test from 'node:test';
import assert from 'node:assert/strict';
import {HOTEL_RECEPTION_FIXTURES,HOTEL_RECEPTION_COUNTER,HOTEL_BAKED_DIMENSIONS} from './hotel-reception.mjs';
import {medievalFurnitureById} from './medieval-furniture.mjs';
import {getRoomLayout,canOccupyRoom,findWalkPath} from './world.mjs';
import {roomFurnitureFootprintsOverlap} from './furniture.mjs';
import {interiorEmitters} from './scene-lights.mjs';
import {BUILTIN_OBJECT_CATALOG as seed} from './object-catalog-seed.mjs';
import {applyObjectCatalog} from './object-state.mjs';
import {editObjectCatalog} from './object-catalog.mjs';

test('public reception furniture uses canonical medieval sprite dimensions and facing directions',()=>{
  const layout=getRoomLayout('lobby','lodging-ember-hotel');
  const furnishings=HOTEL_RECEPTION_FIXTURES.filter(item=>!['plant','fireplace'].includes(item.kind));
  assert.ok(furnishings.length>=12);
  for(const item of furnishings){
    const model=medievalFurnitureById(item.catalogId);
    assert.ok(model,`${item.id} has a medieval sprite`);
    const baked=HOTEL_BAKED_DIMENSIONS[item.catalogId]||model;
    for(const key of ['width','depth','height'])assert.equal(item[key],baked[key],`${item.id}: ${key} matches baked asset`);
    assert.ok(item.rotation>=0&&item.rotation<=3);
    assert.equal(canOccupyRoom(item,.1,[],layout),false,`${item.id} blocks its physical footprint`);
  }
  assert.ok(new Set(furnishings.filter(i=>['chair','sofa'].includes(i.kind)).map(i=>i.rotation)).size>=3);
  for(let i=0;i<HOTEL_RECEPTION_FIXTURES.length;i++)for(let j=0;j<i;j++)
    assert.equal(roomFurnitureFootprintsOverlap(HOTEL_RECEPTION_FIXTURES[i],HOTEL_RECEPTION_FIXTURES[j]),false,`furniture ${i} and ${j} do not overlap`);
});

test('waiting areas and counter are reachable from the actual doorway',()=>{
  const layout=getRoomLayout('lobby','lodging-ember-hotel');
  for(const destination of [{x:8,y:6},{x:3.8,y:8.8},{x:13,y:8},{x:2.1,y:9.85}]){
    assert.equal(canOccupyRoom(destination,.25,[],layout),true);
    assert.ok(findWalkPath(layout.spawn,destination,[],'room',[],[],layout).length);
    assert.ok(findWalkPath(destination,layout.spawn,[],'room',[],[],layout).length);
  }
});

test('catalog-backed fixtures retain the medieval reference, canonical scale and rotation',()=>{
  const layout=applyObjectCatalog(seed,{validateOnly:true}).rooms.get('lobby:lodging-ember-hotel:');
  for(let i=0;i<HOTEL_RECEPTION_FIXTURES.length;i++){
    const expected=HOTEL_RECEPTION_FIXTURES[i],actual=layout.fixtures.find(f=>f.id.endsWith(`/fixture-${i}`));
    assert.ok(actual);
    for(const key of ['catalogId','rotation','width','depth','height'])assert.equal(actual[key],expected[key]);
  }
  assert.equal(layout.counter.surfaceModel,HOTEL_RECEPTION_COUNTER.surfaceModel);
  const surface=medievalFurnitureById(layout.counter.surfaceModel);
  assert.ok(Math.abs(layout.counter.right-layout.counter.left-surface.width*layout.counter.surfaceCount)<1e-9);
  const id='room:lodging-ember-hotel:lobby:main/counter';
  assert.throws(()=>editObjectCatalog(seed,[{action:'patch',id,properties:{width:5}}]),/colisor/);
});

test('fixed medieval candelabra emit distinct switchable lights',()=>{
  const layout=getRoomLayout('lobby','lodging-ember-hotel');
  const lights=interiorEmitters(layout,[],0).filter(l=>l.kind==='lamp');
  assert.equal(lights.length,2);
  assert.equal(new Set(lights.map(l=>l.id)).size,2);
  assert.ok(lights.every(l=>l.strength>0&&l.strength<=1));
  const unlit={...layout,fixtures:layout.fixtures.map(item=>({...item,enabled:false}))};
  assert.equal(interiorEmitters(unlit,[],0).filter(l=>l.kind==='lamp').length,0);
});
