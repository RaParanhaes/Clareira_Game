import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIMENTAL_TREE_FLIGHT_HEIGHT, EXPERIMENTAL_MAX_FLIGHT_HEIGHT, getSolidTreesInBounds, hasTreeCollision, canOccupy, stepPlayer, SPAWN } from './world.mjs';
import { surfaceHeight } from './elevation.mjs';
import { reconcilePrediction } from './prediction.mjs';

test('world trees use absolute altitude while ordinary collision remains unchanged',()=>{
  const trees=getSolidTreesInBounds({left:60,right:116,top:60,bottom:116});
  const tree=trees.find(t=>hasTreeCollision(t));
  assert.ok(tree);
  const top=surfaceHeight(tree.x,tree.y)+EXPERIMENTAL_TREE_FLIGHT_HEIGHT;
  assert.equal(hasTreeCollision(tree,.25,top-.01),true);
  assert.equal(hasTreeCollision(tree,.25),true);
  // Rocks are intentionally still solid; find a tree without an overlapping rock.
  const clear=trees.find(t=>!hasTreeCollision(t,.25,surfaceHeight(t.x,t.y)+EXPERIMENTAL_TREE_FLIGHT_HEIGHT));
  assert.ok(clear);
  assert.equal(hasTreeCollision(clear,.25,surfaceHeight(clear.x,clear.y)+EXPERIMENTAL_TREE_FLIGHT_HEIGHT),false);
});

test('world flight crosses an actual tree and cannot descend through its trunk',()=>{
  const trees=getSolidTreesInBounds({left:60,right:116,top:60,bottom:116});
  const tree=trees.find(t=>canOccupy({x:t.x-1.5,y:t.y})
    &&!hasTreeCollision(t,.25,surfaceHeight(t.x,t.y)+EXPERIMENTAL_TREE_FLIGHT_HEIGHT));
  assert.ok(tree);
  const altitude=surfaceHeight(tree.x,tree.y)+EXPERIMENTAL_TREE_FLIGHT_HEIGHT+.2;
  const move=(p,flight)=>stepPlayer(p,{motion:true,flight},1/60,[],[],0,[],{flightAuthorized:true});
  let p={x:tree.x-1.5,y:tree.y,flightZ:altitude,z:altitude-surfaceHeight(tree.x-1.5,tree.y)};
  for(let i=0;i<120&&p.x<tree.x;i++)p=move(p,{x:1,y:0,vertical:0});
  assert.ok(Math.abs(p.x-tree.x)<.3,`reached trunk: ${p.x-tree.x}`);
  for(let i=0;i<120;i++)p=move(p,{x:0,y:0,vertical:-1});
  assert.ok(p.flightZ>=surfaceHeight(tree.x,tree.y)+EXPERIMENTAL_TREE_FLIGHT_HEIGHT-1e-8);
});

test('only a trusted simulation caller enables flight, and acknowledged replay preserves world altitude',()=>{
  const start={...SPAWN};
  const commands=Array.from({length:70},(_,i)=>({seq:i+1,motion:true,x:0,y:0,flight:{x:0,y:0,vertical:1,profile:'smooth'}}));
  const untrusted=commands.reduce((p,c)=>stepPlayer(p,c,1/60),start);
  assert.equal(untrusted.flightZ,undefined);
  const move=(p,c,dt,others=[])=>stepPlayer(p,c,dt,others,[],0,[],{flightAuthorized:true});
  const server=commands.slice(0,35).reduce((p,c)=>move(p,c,1/60),start);
  const expected=commands.reduce((p,c)=>move(p,c,1/60),start);
  const replay=reconcilePrediction({...server,inputSeq:35},commands,move);
  assert.deepEqual(replay.position,expected);
  assert.ok(expected.flightZ>surfaceHeight(start.x,start.y));
  assert.equal(replay.pending.length,35);
});

test('experimental altitude is bounded and an omitted flight command cannot reset altitude',()=>{
  const move=(p,c)=>stepPlayer(p,c,1/60,[],[],0,[],{flightAuthorized:true});
  let p={...SPAWN};
  const rise={motion:true,flight:{x:0,y:0,vertical:1,profile:'controlled'}};
  for(let i=0;i<800;i++)p=move(p,rise);
  assert.ok(p.flightZ-surfaceHeight(p.x,p.y)<=EXPERIMENTAL_MAX_FLIGHT_HEIGHT);
  const height=p.flightZ;
  p=move(p,{motion:true,x:0,y:0});
  assert.ok(p.flightZ>height-.02,'missing input keeps an airborne character hovering');
});

for(const profile of ['controlled','smooth'])test(`${profile} target altitude ascends, hovers and lands on the world surface`,()=>{
  const move=(p,targetHeight)=>stepPlayer(p,{motion:true,flight:{x:0,y:0,targetHeight,profile}},1/60,[],[],0,[],{flightAuthorized:true});
  let player={...SPAWN};
  for(let i=0;i<900;i++)player=move(player,5);
  assert.ok(Math.abs(player.z-5)<.002);
  assert.equal(player.vz,0);
  for(let i=0;i<900;i++)player=move(player,0);
  assert.equal(player.z,0);
  assert.equal(player.vz,0);
  player=stepPlayer(player,{motion:true,x:0,y:0},1/60,[],[],0,[],{flightAuthorized:true});
  assert.equal(player.flightZ,undefined);
});
