import test from 'node:test';
import assert from 'node:assert/strict';
import {canMovePastFires,fallenTreeDistance,FIRE_RADIUS,FALLEN_TREE_RADIUS,FALLEN_TREE_HALF_LENGTH} from './obstacle-collision.mjs';
import {stepPlayer,findWalkPath,PLAYER_RADIUS,SPAWN,SPAWN_CAMPFIRE,SOLID_WATER} from './world.mjs';
import {reconcilePrediction} from './prediction.mjs';
import {CAMPFIRE_PLAYER_BURN_DURATION_MS} from './campfire-life.mjs';
import {waterStateAt,waterwayRoutesForDimension,WATER_WADING_DEPTH} from './waterways.mjs';
test('placed fire blocks walking and replay, while its builder can escape',()=>{
 const fire={x:6.2,y:12.1},fires=[fire];let p={x:6.2,y:13.2};
 const move=(p,input,dt,others)=>stepPlayer(p,input,dt,others,fires);
 for(let i=0;i<100;i++)p=move(p,{x:0,y:-1,motion:true},1/60,[]);
 assert.ok(Math.hypot(p.x-fire.x,p.y-fire.y)>=FIRE_RADIUS+PLAYER_RADIUS);
 assert.deepEqual(reconcilePrediction({...p,inputSeq:1},[{seq:2,x:0,y:-1,motion:true}],move).position,move(p,{seq:2,x:0,y:-1,motion:true},1/60,[]));
 let escaping={...fire};for(let i=0;i<30;i++)escaping=move(escaping,{x:0,y:1,motion:true},1/60,[]);
 assert.ok(escaping.y>fire.y+.6);
 assert.equal(canMovePastFires({x:fire.x,y:fire.y+.1},fire,fires),false);
 assert.ok(findWalkPath(fire,{x:fire.x,y:fire.y+1.5},[],'clearing',[],fires).length,'builder can also escape by clicking');
 const escape=findWalkPath(fire,fire,[],'clearing',[],fires);assert.ok(escape.length);assert.ok(Math.hypot(escape.at(-1).x-fire.x,escape.at(-1).y-fire.y)>=FIRE_RADIUS+PLAYER_RADIUS);
});
test('click paths sample around a placed fire instead of crossing its center',()=>{
 const fire={x:6.2,y:12.1},start={x:5,y:12.1},path=findWalkPath(start,{x:7.5,y:12.1},[],'clearing',[],[fire]);
 assert.ok(path.length);let previous=start;
 for(const node of path){for(let t=0;t<=1;t+=.02){const p={x:previous.x+(node.x-previous.x)*t,y:previous.y+(node.y-previous.y)*t};assert.ok(Math.hypot(p.x-fire.x,p.y-fire.y)>=FIRE_RADIUS+PLAYER_RADIUS-1e-6);}previous=node;}
});
test('trunk collider is a round-ended capsule matching the ground footprint',()=>{
 const tree={x:10,y:10};assert.equal(fallenTreeDistance(tree,tree),0);
 assert.equal(fallenTreeDistance({x:tree.x+FALLEN_TREE_HALF_LENGTH+.3,y:10},tree).toFixed(2),'0.30');
 assert.equal(fallenTreeDistance({x:10,y:10+.6},tree).toFixed(2),'0.60');
 assert.ok(.6>FALLEN_TREE_RADIUS+PLAYER_RADIUS);
});

test('jumping carries the player over a fire without a landing snap and reconciles with the server',()=>{
 const fire=SPAWN_CAMPFIRE,fires=[fire],start={x:fire.x,y:fire.y+1.5};
 const commands=Array.from({length:90},(_,index)=>({seq:index+1,x:0,y:-1,jump:index<15,motion:true}));
 const move=(position,input,dt,others)=>stepPlayer(position,input,dt,others,fires);
 let server={...start};
 for(const command of commands.slice(0,35))server=move(server,command,1/60,[]);
 const expected=commands.reduce((position,command)=>move(position,command,1/60,[]),start);
 const predicted=reconcilePrediction({...server,inputSeq:35},commands,move).position;
 assert.deepEqual(predicted,expected);
 assert.ok(expected.y<fire.y-FIRE_RADIUS-PLAYER_RADIUS,'the jump clears the far side of the fire');
 assert.equal(expected.burningRemainingMs,undefined,'a clean jump does not catch fire');
});

test('the arrival fire no longer overlaps the spawn trail', () => {
 const oldSpawnFire={x:SPAWN.x,y:SPAWN.y-1};
 assert.ok(Math.hypot(SPAWN.x-SPAWN_CAMPFIRE.x,SPAWN.y-SPAWN_CAMPFIRE.y)>FIRE_RADIUS+PLAYER_RADIUS+1);
 let player={...SPAWN};
 for(let index=0;index<120;index++)player=stepPlayer(player,{x:0,y:-1,motion:true},1/60,[],[SPAWN_CAMPFIRE]);
 assert.ok(player.y<oldSpawnFire.y-1,'the player can walk through the formerly blocked spawn lane');
 assert.equal(player.burningRemainingMs,undefined);
});

test('a spawn without a live fire has no invisible collision or burning', () => {
 const fire=SPAWN_CAMPFIRE;
 assert.equal(canMovePastFires({x:fire.x,y:fire.y+1},{x:fire.x,y:fire.y},[]),true);
 let player={x:fire.x,y:fire.y+1.5};
 for(let index=0;index<100;index++)player=stepPlayer(player,{x:0,y:-1,motion:true},1/60,[],[]);
 assert.ok(player.y<fire.y-.5,'the player walks through the reserved fire spot when no fire exists');
 assert.equal(player.burningRemainingMs,undefined);
});

test('landing on a lit fire ignites the avatar until its timer expires or deep water is reached',()=>{
 const fire=SPAWN_CAMPFIRE,fires=[fire];
 let player={x:fire.x,y:fire.y,z:0,vx:0,vy:0,vz:0,jumpHeld:false};
 for(let index=0;index<80;index++){
  player=stepPlayer(player,{x:0,y:0,jump:index<12,motion:true},1/60,[],fires);
  if(player.burningRemainingMs>0)break;
 }
 assert.equal(player.burningRemainingMs,CAMPFIRE_PLAYER_BURN_DURATION_MS);
 for(let index=0;index<30;index++)player=stepPlayer(player,{x:0,y:0,jump:false,motion:true},1/60,[],fires);
 assert.ok(player.burningRemainingMs>0&&player.burningRemainingMs<CAMPFIRE_PLAYER_BURN_DURATION_MS);
 for(let index=0;index<400&&player.burningRemainingMs>0;index++)player=stepPlayer(player,{x:0,y:0,jump:false,motion:true},1/60,[],fires);
 assert.equal(player.burningRemainingMs,0);

 const pond={x:(SOLID_WATER.left+SOLID_WATER.right)/2,y:(SOLID_WATER.top+SOLID_WATER.bottom)/2};
 assert.ok(waterStateAt(pond.x,pond.y).depth>WATER_WADING_DEPTH);
 const extinguished=stepPlayer({...pond,burningRemainingMs:4000},{x:0,y:0,motion:true},1/60,[],fires);
 assert.equal(extinguished.burningRemainingMs,0);

 const river=waterwayRoutesForDimension('surface')[0].segments[0].b;
 const riverSample=waterStateAt(river.x,river.y);
 assert.ok(riverSample.depth>WATER_WADING_DEPTH,'the river reaches the extinguishing depth');
 const riverExtinguished=stepPlayer({x:river.x,y:river.y,burningRemainingMs:4000},{x:0,y:0,motion:true},1/60,[],fires);
 assert.equal(riverExtinguished.burningRemainingMs,0);
});
