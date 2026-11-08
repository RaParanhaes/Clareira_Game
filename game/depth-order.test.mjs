import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSceneDepth } from './depth-order.mjs';
import { CONTENT } from './content-catalog.mjs';
import { furnitureVisual,roomFurnitureBedOccupantDepth,roomFurnitureDepthAnchor,roomFurnitureDrawLayers,roomFurnitureFootprintBounds } from './furniture.mjs';

test('wide furniture sorts by its front footprint so characters cross behind and in front cleanly',()=>{
 const sofa={id:'sofa-1',kind:'sofa',x:8,y:6,rotation:0};
 const furniture={type:'furniture',...roomFurnitureDepthAnchor(sofa),item:sofa};
 const behind={type:'player',x:8,y:7.1};
 const inFront={type:'player',x:8,y:8.2};
 assert.ok(compareSceneDepth(behind,furniture)<0,'the sofa draws over a player behind it');
 assert.ok(compareSceneDepth(furniture,inFront)<0,'a player in front draws over the sofa');
});

test('rotating furniture keeps its contact depth, while supported items draw above their support',()=>{
 const table={id:'table-1',kind:'table',x:8,y:6,rotation:0};
 const turned={...table,rotation:1};
 assert.equal(roomFurnitureDepthAnchor(table).sortX+roomFurnitureDepthAnchor(table).sortY,
  roomFurnitureDepthAnchor(turned).sortX+roomFurnitureDepthAnchor(turned).sortY);
 const support={type:'furniture',sortX:9,sortY:7,sortZ:0,sortId:'table-1'};
 const child={type:'furniture',sortX:9,sortY:7,sortZ:1.5,sortId:'plant-1'};
 assert.ok(compareSceneDepth(support,child)<0,'the tabletop is drawn before the object resting on it');
});

test('all 213 furniture footprints keep stable contact depth in all four facings',()=>{
 const catalog=CONTENT.filter(value=>value.category==='furniture'&&value.status==='implemented');
 assert.equal(catalog.length,213);
 for(const definition of catalog){
  const center={id:`${definition.kind}-audit`,kind:definition.kind,x:8,y:6,rotation:0,...(definition.catalogId?{properties:definition}: {})};
  const expectedDepth=14+(definition.width+definition.depth)/2;
  for(let rotation=0;rotation<4;rotation++){
   const item={...center,rotation},visual=furnitureVisual(item),footprint=roomFurnitureFootprintBounds(item),
    depth=roomFurnitureDepthAnchor(item),axisSwap=rotation%2===1;
   assert.ok(Math.abs((footprint.right-footprint.left)-(axisSwap?visual.depth:visual.width))<1e-8,
    `${item.kind} width at rotation ${rotation}`);
   assert.ok(Math.abs((footprint.bottom-footprint.top)-(axisSwap?visual.width:visual.depth))<1e-8,
    `${item.kind} depth at rotation ${rotation}`);
   assert.ok(Math.abs(depth.sortX+depth.sortY-expectedDepth)<1e-8,
    `${item.kind} contact depth at rotation ${rotation}`);
   const object={type:'furniture',...depth,item};
   assert.ok(compareSceneDepth({type:'self',x:7.5,y:5.5},object)<0,`${item.kind} behind`);
   assert.ok(compareSceneDepth(object,{type:'self',x:9,y:7})<0,`${item.kind} in front`);
  }
 }
});

test('equal scene depths use actor priority and a stable object ID tie break',()=>{
 const actor={type:'self',x:8,y:8},fixture={type:'room-fixture',x:8,y:8,sortId:'fixture-1'};
 assert.ok(compareSceneDepth(fixture,actor)<0,'the avatar remains legible on the contact line');
 assert.ok(compareSceneDepth({type:'furniture',x:8,y:8,sortId:'a'},
  {type:'furniture',x:8,y:8,sortId:'b'})<0);
});

test('terrain side faces interleave avatars by their ground contact depth',()=>{
 const face={type:'terrain-face',x:10,y:10,sortX:10,sortY:10,sortZ:0,sortId:'terrain:test'};
 const behind={type:'player',x:9.5,y:10},inFront={type:'player',x:10.5,y:10};
 assert.ok(compareSceneDepth(behind,face)<0,'the side face covers an avatar behind its ground edge');
 assert.ok(compareSceneDepth(face,inFront)<0,'an avatar in front of the side face remains visible');
});

test('rendered chair layers bracket an avatar between the rear and front legs',()=>{
 const chair={id:'chair-1',kind:'chair',x:8,y:8,rotation:0};
 const anchor=roomFurnitureDepthAnchor(chair),layers=roomFurnitureDrawLayers(chair);
 const chairBack={type:'furniture-layer',...anchor,...layers[0],item:chair};
 const avatar={type:'self',x:8,y:8};
 const chairFront={type:'furniture-layer',...anchor,...layers[1],item:chair};
 const ordered=[chairFront,avatar,chairBack].sort(compareSceneDepth);
 assert.deepEqual(ordered.map(part=>part.part||part.type),['chair-back','self','chair-front']);
 for(let rotation=0;rotation<4;rotation++){
  const oriented={...chair,rotation},[back,front]=roomFurnitureDrawLayers(oriented);
  assert.ok(compareSceneDepth({...anchor,...back,type:'furniture-layer'},avatar)<0,`back at rotation ${rotation}`);
  assert.ok(compareSceneDepth(avatar,{...anchor,...front,type:'furniture-layer'})<0,`front at rotation ${rotation}`);
 }
});

test('the sleeper draws over the bed frame and below the duvet so the head remains visible',()=>{
 const bed={id:'bed-sleep',kind:'bed',x:8,y:6,rotation:0,baseZ:0};
 const base={type:'furniture',...roomFurnitureDepthAnchor(bed),item:bed};
 const sleeper={type:'self',x:bed.x,y:bed.y,...roomFurnitureBedOccupantDepth(bed)};
 const duvet={type:'furniture-cover',x:bed.x,y:bed.y,...roomFurnitureDepthAnchor(bed),sortZ:.002,sortId:'bed-sleep:cover'};
 assert.ok(base.sortX===sleeper.sortX&&base.sortY===sleeper.sortY,'bed and sleeper share the footprint contact depth');
 assert.ok(compareSceneDepth(base,sleeper)<0,'the pillow and bed frame render behind the sleeper');
 assert.ok(compareSceneDepth(sleeper,duvet)<0,'the duvet renders over the sleeping body');
});
