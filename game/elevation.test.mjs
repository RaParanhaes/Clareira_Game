import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceHeight,canTraverseSurface} from './elevation.mjs';
import {stepPlayer,stepRoomPlayer,findWalkPath} from './world.mjs';
function walk(start,input,seconds,step){let p=start;for(let i=0;i<seconds*60;i++)p=step(p,input,1/60);return p}
test('room stairs and ramp can be climbed and descended; sheer edges cannot',()=>{
 for(const x of [8,10]){
  const start={x,y:10};const top=walk(start,{x:0,y:-1},1.25,stepRoomPlayer);
  assert.ok(top.y<7);assert.equal(surfaceHeight(top.x,top.y,'room'),2);
  const bottom=walk(top,{x:0,y:1},1.25,stepRoomPlayer);assert.ok(bottom.y>9);assert.equal(surfaceHeight(bottom.x,bottom.y,'room'),0);
 }
 const blocked=walk({x:6,y:8},{x:0,y:-1},1,stepRoomPlayer);assert.ok(blocked.y>=7);
 const blockedDown=walk({x:6,y:6.5},{x:0,y:1},1,stepRoomPlayer);assert.ok(blockedDown.y<=7);
});
test('the experimental world platform has been removed, room levels remain',()=>{
 assert.equal(surfaceHeight(17,14),0);assert.equal(surfaceHeight(21,17),0);
 assert.equal(canTraverseSurface({x:19,y:17},{x:19,y:15}),true);
 assert.equal(surfaceHeight(8,6,'room'),2);
});
test('click paths route through level access instead of across a cliff',()=>{
 const start={x:6,y:9},target={x:8,y:6};const path=findWalkPath(start,target,[],'room');
 assert.ok(path.length>0);let previous=start;
 for(const p of path){assert.ok(canTraverseSurface(previous,p,'room'));previous=p}
 assert.ok(path.some(p=>p.x>=7));assert.ok(Math.hypot(previous.x-target.x,previous.y-target.y)<.4);
});
