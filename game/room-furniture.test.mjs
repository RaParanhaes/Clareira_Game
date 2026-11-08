import test from 'node:test';
import assert from 'node:assert/strict';
import { canOccupyRoom, canPlaceRoomFurniture, findWalkPath, getRoomLayout, roomFurnitureSupport, stepRoomPlayer } from './world.mjs';

const bench = { id: 'bench-1', kind: 'stool', x: 7.5, y: 8 };

test('bench placement accepts a clear half-tile on either flat floor and rejects unsafe positions', () => {
  assert.equal(canPlaceRoomFurniture({ x: 6, y: 8 }, []), true);
  assert.equal(canPlaceRoomFurniture({ x: 8, y: 6 }, []), true);
  assert.equal(canPlaceRoomFurniture({ x: 8, y: 8.5 }, []), false, 'ramp stays clear');
  assert.equal(canPlaceRoomFurniture({ x: 8, y: 10 }, []), false, 'door approach stays clear');
  assert.equal(canPlaceRoomFurniture({ x: 4.5, y: 8 }, []), false, 'room edge stays clear');
  assert.equal(canPlaceRoomFurniture({ x: 5.6, y: 8.1 }, []), false, 'placement snaps to half-tiles');
  assert.equal(canPlaceRoomFurniture({ x: 8, y: 8 }, [bench]), false, 'benches do not overlap');
  assert.equal(canPlaceRoomFurniture({ x: 6, y: 8 }, [], [{ x: 6, y: 8.5 }]), false, 'do not place under a player');
});

test('furniture placement follows the selected lodging footprint and fixed fixtures', () => {
  const cabin = getRoomLayout('lodging', 'cabin-cedar-one', 'owned');
  assert.equal(canPlaceRoomFurniture({ x: 6, y: 8.5 }, [], [], cabin), false,
    'the cedar cabin plant keeps its actual footprint clear');

  const apartment = getRoomLayout('lodging', 'lodging-ember-hotel', 'owned');
  assert.equal(canPlaceRoomFurniture({ x: 3.5, y: 7 }, [], [], apartment), true,
    'the wider apartment accepts furniture on its extra floor space');
});

test('room walking and click paths respect placed furniture', () => {
  const start = { x: 7.5, y: 9.2 };
  const next = stepRoomPlayer(start, { x: 0, y: -1 }, 0.05, [], [bench]);
  assert.ok(Math.hypot(next.x - bench.x, next.y - bench.y) >= .63);
  assert.equal(canOccupyRoom(next, .25, [bench]), true);

  const path = findWalkPath(start, { x: 7.5, y: 7.1 }, [], 'room', [bench]);
  assert.ok(path.length > 1, 'path goes around the bench');
  assert.ok(path.every(position => canOccupyRoom(position, .25, [bench])));
  assert.ok(Math.hypot(path.at(-1).x - bench.x, path.at(-1).y - bench.y) >= .63);
});

test('diagonal walking resolves the full clear step before sliding along furniture',()=>{
  const layout=getRoomLayout('lobby','arrival');
  const furniture=[{id:'stool',kind:'stool',x:8,y:8}];
  const start={x:7.26,y:7.94};
  const delta=3.2*.05/Math.sqrt(2);
  const diagonal={x:start.x+delta,y:start.y-delta};
  const xFirst={x:diagonal.x,y:start.y};
  assert.equal(canOccupyRoom(start,.25,furniture,layout),true);
  assert.equal(canOccupyRoom(xFirst,.25,furniture,layout),false,'the axis-first route clips the stool collider');
  assert.equal(canOccupyRoom(diagonal,.25,furniture,layout),true,'the diagonal destination is clear');
  const moved=stepRoomPlayer(start,{x:1,y:-1},.05,[],furniture,layout);
  assert.ok(moved.x>start.x&&moved.y<start.y,'the clear diagonal step moves on both axes');
});

test('furniture uses its rotated footprint and only approved pieces can stack on supports',()=>{
  const layout={id:'empty',bounds:{left:4.25,right:11.5,top:4.5,bottom:11.5},door:{x:8,y:11.7},spawn:{x:8,y:12.4},
    elevation:'flat',wallHeight:4.3,obstacles:[],fixtures:[]};
  const table={id:'table-001',kind:'table',x:8,y:6,rotation:0};
  const plant={id:'plant-001',kind:'plant',x:8,y:6,rotation:0};
  const support=roomFurnitureSupport(plant,[table],layout);
  assert.equal(support.supportId,table.id);assert.equal(support.baseZ,1.5);
  assert.equal(canPlaceRoomFurniture(plant,[table],[],layout),true,'a small plant rests on the table top');
  assert.equal(canPlaceRoomFurniture({...plant,x:8.5},[table],[],layout),false,'the plant cannot hang beyond the support');
  assert.equal(canPlaceRoomFurniture({kind:'chair',x:8,y:6},[table],[],layout),false,'a chair is too large and is not marked stackable');
  assert.equal(canPlaceRoomFurniture({...plant,supportId:table.id},[],[],layout),false,'a saved support cannot be missing');
  const bed={kind:'bed',x:5,y:8,rotation:0};
  assert.equal(canPlaceRoomFurniture(bed,[],[],layout),false,'the wide side does not fit against this wall');
  assert.equal(canPlaceRoomFurniture({...bed,rotation:1},[],[],layout),true,'a quarter turn swaps its physical width and depth');
});

test('plant collision follows its circular pot while placement keeps the full foliage footprint clear',()=>{
  const plant={id:'plant-pot',kind:'plant',x:8,y:6};
  const layout={id:'flat-test',bounds:{left:4.5,right:11.5,top:4.5,bottom:11.5},door:{x:8,y:11.7},spawn:{x:8,y:12.4},
    elevation:'flat',wallHeight:4.3,fixtures:[plant],obstacles:[{left:7.74,right:8.26,top:5.74,bottom:6.26}],counter:null};
  assert.equal(canOccupyRoom({x:8.49,y:6},.25,[],layout),true,
    'the avatar can pass under the leaves once its body clears the pot collider');
  assert.equal(canOccupyRoom({x:8.4,y:6},.25,[],layout),false,'the pot remains solid');
  assert.equal(canPlaceRoomFurniture({kind:'chair',x:8.5,y:6},[plant],[],layout),false,
    'the full rendered footprint still prevents furniture from clipping into the leaves');
});
