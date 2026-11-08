import test from 'node:test';
import assert from 'node:assert/strict';
import { exteriorEmitters, interiorEmitters, lightAmount, roomLightObstacles, roomGlowProfile, actorWindowLight } from './scene-lights.mjs';
import { buildingArchitecture, buildingWindows } from './architectural-elements.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING } from './village-buildings.mjs';
import { canOccupy, canPlaceRoomFurniture, getRoomLayout, stepRoomPlayer, findWalkPath } from './world.mjs';
import { validateFurniture } from '../scripts/room-store.mjs';
import { BUILTIN_OBJECT_CATALOG } from './object-catalog-seed.mjs';
import { copyData,editObjectCatalog } from './object-catalog.mjs';
import { applyObjectCatalog } from './object-state.mjs';
import { MEDIEVAL_FURNITURE } from './medieval-furniture.mjs';

test('every window has an outward emitter and porch posts share physical footprints',()=>{
 for(const b of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
  const emitters=exteriorEmitters([b],0);
  const architecture=buildingArchitecture(b);
  if(architecture.balcony)assert.ok(architecture.canopy.z+.16<=architecture.balcony.z,'porch roof meets the balcony floor below its railing');
  for(const win of buildingWindows(b)){
   const light=emitters.find(l=>l.id===win.id);
   assert.ok(lightAmount(light,{x:win.x+win.nx,y:win.y+win.ny,height:0})>0);
   assert.equal(lightAmount(light,{x:win.x-win.nx,y:win.y-win.ny,height:0}),0);
   assert.equal(lightAmount(light,{x:win.x+win.nx*light.reach,y:win.y+win.ny*light.reach}),0);
  }
  for(const post of buildingArchitecture(b).posts)assert.equal(canOccupy({x:(post.left+post.right)/2,y:(post.top+post.bottom)/2},.05),false);
  assert.equal(canOccupy({x:b.door.x,y:b.door.y+.6},.25),true,'posts leave the doorway clear');
 }
});
test('Cedar cabin window light follows night and day at the authored bedroom opening',()=>{
 const cabin=VILLAGE_BUILDINGS.find(building=>building.id==='cabin-cedar-one'),window=buildingWindows(cabin)[0];
 const day=exteriorEmitters([cabin],1).find(light=>light.id===window.id);
 const night=exteriorEmitters([cabin],0).find(light=>light.id===window.id);
 assert.equal(day.strength,0);
 assert.ok(night.strength>0);
 assert.equal(night.x,window.x);assert.equal(night.y,window.y);
 assert.equal(exteriorEmitters([{...cabin,windowObjects:[{...window,light:{...window.light,enabled:false}}]}],0)
  .some(light=>light.id===window.id),false,'a disabled window circuit emits no exterior light');
});
test('window reach expands at night while keeping its warm color and source strength',()=>{
 const cabin=VILLAGE_BUILDINGS.find(building=>building.id==='cabin-cedar-one');
 const window=buildingWindows(cabin)[0];
 for(const strength of [.3,1.2]){
  const light=exteriorEmitters([{...cabin,windowObjects:[{...window,light:{enabled:true,reach:3.5,strength,color:'#efbc79'}}]}],0).find(l=>l.id===window.id);
  assert.ok(Math.abs(light.reach-4.2)<1e-12);
  const moonlit=exteriorEmitters([{...cabin,windowObjects:[{...window,light:{enabled:true,reach:3.5,strength,color:'#efbc79'}}]}],0,true)
    .find(l=>l.id===window.id);
  assert.ok(moonlit.reach<light.reach&&moonlit.reach>3.5);
  assert.ok(lightAmount(light,{x:window.x+window.nx*3.6,y:window.y+window.ny*3.6,height:0})>0);
  assert.equal(light.color,'#efbc79');
 }
});
test('walking across a window uses height, wall occlusion and the same outward light field as the floor',()=>{
 const light={id:'window',kind:'window',x:0,y:0,height:1.5,reach:4,strength:.8,nx:0,ny:1,color:'#efbc79'};
 assert.equal(actorWindowLight({x:0,y:-1},[light]),null,'behind the window wall stays unlit');
 assert.equal(actorWindowLight({x:0,y:4.1},[light]),null,'outside the reach stays unlit');
 const front=actorWindowLight({x:0,y:1},[light]);assert.ok(front.every(sample=>sample.amount>0));
 assert.ok(front[2].amount>front[0].amount,'the head near the opening receives more than the feet');
 const wall={left:-1,right:1,top:.4,bottom:.6,base:0,height:3};
 assert.equal(actorWindowLight({x:0,y:1},[light],[wall]),null,'another wall blocks all body heights');
 const lowWall={...wall,height:.8};const partial=actorWindowLight({x:0,y:1},[light],[lowWall]);
 assert.equal(partial[0].amount,0);assert.ok(partial[2].amount>0,'a low obstacle does not light the blocked feet');
 assert.notDeepEqual(actorWindowLight({x:0,y:1,z:1},[light]),front,'jump height changes actual exposure');
 const tall=actorWindowLight({x:0,y:1},[light],[],0,3.4);
 assert.equal(tall[2].height,3.4*.9,'samples follow the rendered body scale in world height units');
 assert.ok(tall[1].amount>tall[2].amount,'a low window can illuminate the torso more than the head');
});
test('room glow stays within a few projected tiles and follows authored light strength',()=>{
 const day=roomGlowProfile({kind:'hearth',strength:0},72,1);
 const night=roomGlowProfile({kind:'hearth',strength:.9},72,1);
 assert.ok(day.radius<=72*2.7,'glow radius uses projected tile size once, not squared camera zoom');
 assert.ok(day.opacity<night.opacity,'daytime fire does not paint a warm veil over the room');
 assert.ok(night.opacity<.35,'full firelight remains restrained');
 assert.ok(roomGlowProfile({kind:'lamp',strength:1},72,1).radius<night.radius);
});
test('walls and high furniture occlude light; low furniture permits rays above it',()=>{
 const light={id:'lamp',x:0,y:0,height:3,reach:8,strength:1,nx:0,ny:0};
 const target={x:4,y:0,height:0},box={left:1,right:2,top:-1,bottom:1,height:4};
 assert.equal(lightAmount(light,target,[box]),0);
 assert.ok(lightAmount(light,target,[{...box,height:.4}])>0);
 assert.ok(lightAmount(light,{x:0,y:0})>lightAmount(light,target));
});
test('a descending ray is blocked when it enters through the top before leaving a raised obstacle',()=>{
 const light={id:'lamp',x:0,y:0,height:4,reach:10,strength:1,nx:0,ny:0};
 const raised={left:1,right:3,top:-1,bottom:1,base:1,height:3};
 assert.equal(lightAmount(light,{x:4,y:0,height:0},[raised]),0);
 assert.ok(lightAmount(light,{x:4,y:0,height:0},[{...raised,base:4,height:5}])>0);
});
test('room lamp switch removes its emitter and daylight window follows the sun',()=>{
 const layout=getRoomLayout('lodging','cabin-cedar-one','owned');
 const lamp={id:'abcdef12',kind:'lamp',x:7,y:8,enabled:true};
 assert.ok(interiorEmitters(layout,[lamp],1).some(l=>l.id===lamp.id));
 assert.ok(!interiorEmitters(layout,[{...lamp,enabled:false}],1).some(l=>l.id===lamp.id));
 assert.ok(interiorEmitters(layout,[],1).some(l=>l.kind==='daylight'));
 assert.ok(!interiorEmitters(layout,[],0).some(l=>l.kind==='daylight'));
 const daytime=interiorEmitters(layout,[],1),nighttime=interiorEmitters(layout,[],0);
 assert.equal(daytime.find(light=>light.id===`${layout.id}:sconce`).strength,0);
 assert.equal(nighttime.find(light=>light.id===`${layout.id}:sconce`).strength,.95);
 assert.equal(daytime.find(light=>light.kind==='hearth').strength,0);
 assert.equal(nighttime.find(light=>light.kind==='hearth').strength,.9);
});

test('all 50 medieval flames emit their authored light and switch fully off',()=>{
 const layout=getRoomLayout('lodging','cabin-cedar-one','owned');
 const sources=MEDIEVAL_FURNITURE.filter(item=>item.use==='light');
 assert.equal(sources.length,50);
 for(const source of sources){
  const fixture={...source,id:source.id,kind:'lamp',catalogId:source.id,x:6,y:8,enabled:true,properties:source};
  const emitter=interiorEmitters(layout,[fixture],0,1).find(light=>light.id===source.id);
  assert.ok(emitter,`${source.id} creates an emitter`);
  assert.equal(emitter.sourceKind,source.light.kind);
  assert.ok(emitter.reach>0&&emitter.strength>0);
  assert.equal(interiorEmitters(layout,[{...fixture,enabled:false}],0,1).some(light=>light.id===source.id),false,
   `${source.id} stops emitting when switched off`);
 }
});

test('lamp range, direction and stacked height come from editable catalog properties',()=>{
 const base=copyData(BUILTIN_OBJECT_CATALOG),custom=editObjectCatalog(base,[{action:'patch',collection:'templates',id:'furniture.lamp',properties:{
  light:{height:1.75,reach:3.25,strength:.6,color:'#abcdef',nx:1,ny:0},
 }}]);
 applyObjectCatalog(custom);
 try{
  const layout=getRoomLayout('legacy'),lamp={id:'lamp-placed',kind:'lamp',x:6,y:6,baseZ:1.5};
  const emitter=interiorEmitters(layout,[lamp],1).find(light=>light.id===lamp.id);
  assert.equal(emitter.reach,3.25);assert.equal(emitter.strength,.6);assert.equal(emitter.color,'#abcdef');
  assert.equal(emitter.nx,1);assert.equal(emitter.height,layout.elevation==='raised'?5.25:3.25);
  const obstacle=roomLightObstacles(layout,[lamp]).find(value=>value.owner===lamp.id);
  assert.equal(obstacle.base,(layout.elevation==='raised'?2:0)+1.5);
 }finally{applyObjectCatalog(base);}
});
test('saved furniture validates the entire actual apartment, keeps switches and rejects overlap',()=>{
 const items=[{id:'abcdef12',kind:'chair',x:3.5,y:7,rotation:1},{id:'abcdef13',kind:'lamp',x:3.5,y:8,rotation:2,enabled:false}];
 assert.deepEqual(validateFurniture(items),items);
 assert.throws(()=>validateFurniture([...items,{...items[0],id:'abcdef14'}]));
 assert.throws(()=>validateFurniture([{...items[0],x:NaN}]));
 assert.throws(()=>validateFurniture([{...items[0],x:300}]));
});
test('a seated actor can leave its chair without weakening outside collisions',()=>{
 const chair={x:6,y:8,kind:'chair'},start={x:6,y:8};
 const next=stepRoomPlayer(start,{x:1,y:0},.05,[],[chair]);
 assert.ok(next.x>start.x);
 assert.ok(findWalkPath(start,{x:7.2,y:8},[],'room',[chair]).length,'click movement can leave a seat');
 const fromOutside={x:6.7,y:8};
 const blocked=stepRoomPlayer(fromOutside,{x:-1,y:0},.05,[],[chair]);
 assert.ok(blocked.x>=6.51,'the chair collider matches its 0.52-unit footprint');
 assert.equal(canPlaceRoomFurniture(start,[],[start]),false,'cannot place furniture under an actor');
});

test('diagonal seat exits do not wedge between the chair and a nearby lamp',()=>{
 const start={x:8.3706531983,y:8.4660125055};
 const furniture=[{x:8,y:8,kind:'chair'},{x:9,y:8.5,kind:'lamp'}];
 const layout=getRoomLayout('lodging','cabin-cedar-one','owned');
 const next=stepRoomPlayer(start,{x:-.76,y:.65},.0167,[],furniture,layout);
 assert.ok(next.x<start.x&&next.y>start.y);
});
