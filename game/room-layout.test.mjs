import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoomLayout, getRoomSpawnCandidates, canOccupyRoom, canPlaceRoomFurniture, crossedRoomExit, findWalkPath, stepRoomPlayer } from './world.mjs';
import { canTraverseSurface, surfaceHeight } from './elevation.mjs';

const lobbyIds = [
  'lodging-rill-guesthouse', 'lodging-pine-inn', 'lodging-ember-hotel',
];
const stayRooms = [
  ['lodging-rill-guesthouse', 'rent'], ['lodging-pine-inn', 'rent'],
  ['lodging-ember-hotel', 'rent'], ['lodging-ember-hotel', 'owned'],
  ['cabin-cedar-one', 'owned'], ['cabin-cedar-two', 'owned'], ['cabin-cedar-three', 'owned'],
];

test('lodging buildings use distinct interior plans that fit their exterior footprints', () => {
  const lobbies = lobbyIds.map(buildingId => getRoomLayout('lobby', buildingId));
  const stays = stayRooms.map(([buildingId, mode]) => getRoomLayout('lodging', buildingId, mode));
  const sizes = [...lobbies, ...stays].map(layout => [layout.bounds.right - layout.bounds.left, layout.bounds.bottom - layout.bounds.top]);
  assert.ok(new Set(sizes.map(size => size.join('x'))).size >= 6, 'small inns, cabins, rooms, suite and hotel vary in size');
  assert.equal(getRoomLayout('lobby', 'lodging-ember-hotel').id, 'hotel-lobby');
  assert.equal(getRoomLayout('lodging', 'lodging-ember-hotel', 'owned').id, 'hotel-apartment');
  assert.notEqual(getRoomLayout('lodging', 'lodging-ember-hotel', 'rent').id,
    getRoomLayout('lodging', 'lodging-ember-hotel', 'owned').id);
  assert.ok([...lobbies, ...stays].every(layout => layout.fixtures.length >= 3), 'each interior arrives furnished');
});

test('furnished room footprints leave the entrance clear and block walking through furniture', () => {
  const layouts = [getRoomLayout('legacy'), ...lobbyIds.map(id => getRoomLayout('lobby', id)),
    ...stayRooms.map(([id, mode]) => getRoomLayout('lodging', id, mode))];
  for (const layout of layouts) {
    assert.equal(canOccupyRoom(layout.spawn, .25, [], layout), true, `${layout.id} keeps its spawn open`);
    assert.ok(layout.fixtures.every(item => {
      const obstacle = layout.obstacles.find(rect => Math.abs((rect.left + rect.right) / 2 - item.x) < .001
        && Math.abs((rect.top + rect.bottom) / 2 - item.y) < .001);
      return obstacle && obstacle.left >= layout.bounds.left && obstacle.right <= layout.bounds.right
        && obstacle.top >= layout.bounds.top && obstacle.bottom <= layout.bounds.bottom;
    }), `${layout.id} keeps furniture colliders inside the floor`);
    for (const fixture of layout.fixtures) {
      assert.equal(canOccupyRoom({ x: fixture.x, y: fixture.y }, .05, [], layout), false,
        `${layout.id} blocks walking through ${fixture.kind}`);
    }
    const doorway = { x: layout.door.x, y: layout.door.y - .45 };
    const path = findWalkPath(layout.spawn, doorway, [], 'room', [], [], layout);
    assert.ok(path.length, `${layout.id} leaves a walkable route to the door`);
    assert.ok(path.every(point => canOccupyRoom(point, .25, [], layout)), `${layout.id} paths avoid furniture`);
  }
});

test('hotel lobby counter and lounge seats share the movement and flat-floor geometry', () => {
  const lobby = getRoomLayout('lobby', 'lodging-ember-hotel');
  assert.equal(lobby.bounds.right - lobby.bounds.left, 13);
  assert.equal(lobby.bounds.bottom - lobby.bounds.top, 9);
  assert.equal(canOccupyRoom({ x: 8, y: 4.9 }, .25, [], lobby), false, 'the reception counter blocks walking');
  assert.equal(canOccupyRoom({ x: 6.5, y: 6.8 }, .25, [], lobby), false, 'lounge chairs block walking');
  assert.equal(surfaceHeight(8, 6, 'room', lobby), 0);
  assert.equal(canTraverseSurface({ x: 2, y: 9 }, { x: 13, y: 3 }, 'room', lobby), true);

  const start = lobby.spawn;
  const target = { x: 13.8, y: 8.0 };
  const path = findWalkPath(start, target, [], 'room', [], [], lobby);
  assert.ok(path.length, 'a route reaches the right-hand lounge');
  assert.ok(path.every(point => canOccupyRoom(point, .25, [], lobby)));
  const next = stepRoomPlayer({ x: 8, y: 7.2 }, { x: 1, y: 0 }, .05, [], [], lobby);
  assert.ok(next.x > 8, 'movement uses the expanded hotel floor');
});

test('flat rooms place arrivals on the exterior landing and keep a walkable doorway lane',()=>{
  const lobby=getRoomLayout('lobby','lodging-ember-hotel');
  assert.ok(lobby.spawn.y>lobby.bounds.bottom,'arrival stands just outside the floor');
  assert.equal(canOccupyRoom(lobby.spawn,.25,[],lobby),true);
  assert.equal(canOccupyRoom({x:lobby.spawn.x+1.1,y:lobby.spawn.y},.25,[],lobby),false,
    'the exterior landing does not open the whole front edge');
  let position={...lobby.spawn};
  for(let index=0;index<12;index++)position=stepRoomPlayer(position,{x:0,y:-1},.05,[],[],lobby);
  assert.ok(position.y<lobby.bounds.bottom-.2,'walking inward crosses the threshold');
  for(let index=0;index<18;index++)position=stepRoomPlayer(position,{x:0,y:1},.05,[],[],lobby);
  assert.ok(position.y>lobby.bounds.bottom+.55,'walking back reaches the exterior exit tile');
});

test('a shallow diagonal step near the landing does not trigger the automatic room exit',()=>{
  for(const layout of [getRoomLayout('lobby','lodging-ember-hotel'),getRoomLayout('lodging','cabin-cedar-one','owned')]){
    let position={...layout.spawn};
    for(let index=0;index<3;index++){
      const previous=position;
      position=stepRoomPlayer(position,{x:0,y:-1},.05,[],[],layout);
      assert.equal(crossedRoomExit(previous,position,layout),false,`${layout.id}: entering the room cannot exit`);
    }
    const previous=position;
    position=stepRoomPlayer(position,{x:0,y:1},.05,[],[],layout);
    assert.ok(position.y>previous.y,`${layout.id}: the return step moves toward the doorway`);
    assert.equal(crossedRoomExit(previous,position,layout),false,`${layout.id}: a shallow return step stays inside`);

    const deep={x:layout.door.x,y:layout.bounds.bottom-.3};
    const beyondDoor={x:layout.door.x,y:layout.door.y+.05};
    assert.equal(crossedRoomExit(deep,beyondDoor,layout,{enteredFloor:true}),true,`${layout.id}: walking through the doorway exits`);
    assert.equal(crossedRoomExit(deep,{...beyondDoor,x:layout.door.x+1.1},layout,{enteredFloor:true}),false,
      `${layout.id}: crossing beside the doorway does not exit`);
  }
});

test('hotel floor silhouette has a real central entrance corridor',()=>{
  const lobby=getRoomLayout('lobby','lodging-ember-hotel');
  assert.equal(lobby.partitions.length,0);
  for(const point of [{x:2,y:10.8},{x:14,y:10.8}])
    assert.equal(canOccupyRoom(point,.25,[],lobby),false,'the cutout has no floor');
  for(const point of [{x:8,y:10.8},{x:3.7,y:9.5},{x:13,y:9.5}])
    assert.equal(canOccupyRoom(point,.25,[],lobby),true,'floor remains walkable');
  assert.equal(canPlaceRoomFurniture({x:3,y:10.5,kind:'stool'},[],[],lobby),false,'furniture cannot be placed outside the floor');
  assert.equal(canPlaceRoomFurniture({x:4.5,y:10,kind:'stool'},[],[],lobby),false,'furniture cannot hang over a cutout');
  for(const target of [{x:3.8,y:8.8},{x:8,y:6},{x:13,y:8}]){
    assert.ok(findWalkPath(lobby.spawn,target,[],'room',[],[],lobby).length,'the corridor reaches the room');
    assert.ok(findWalkPath(target,lobby.spawn,[],'room',[],[],lobby).length,'the exit remains reachable');
  }
});
