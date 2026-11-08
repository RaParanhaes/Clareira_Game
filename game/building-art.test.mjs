import test from 'node:test';import assert from 'node:assert/strict';
import {roomWallSections,facadePanel,drawFacadeWindow} from './building-art.mjs';
import {ROOM_BOUNDS} from './world.mjs';import {ROOM_LEVEL,surfaceHeight} from './elevation.mjs';
test('each room wall segment follows its floor and the side wall drops at the level boundary',()=>{
 const sections=roomWallSections(ROOM_BOUNDS,ROOM_LEVEL);
 for(const wall of sections)assert.equal(wall.z,surfaceHeight((wall.x1+wall.x2)/2,(wall.y1+wall.y2)/2,'room'));
 const [upper,lower]=sections.filter(w=>w.side);
 assert.equal(upper.y2,lower.y1);assert.equal(upper.y2,ROOM_LEVEL.bottom);assert.equal(upper.z-lower.z,2);
});
test('facade panels project along the wall, with parallel vertical edges',()=>{
 const points=facadePanel((x,y,z)=>({x:(x-y)*32,y:(x+y)*18-z*24}),
  {x1:9.5,y1:4.5,x2:10.5,y2:4.5,bottom:3,top:4.5},0,0,1,1);
 assert.equal(points[1][1]-points[0][1],18);
 assert.equal(points[2][1]-points[3][1],18);
 assert.equal(points[0][0],points[3][0]);assert.equal(points[1][0],points[2][0]);
});
test('medieval facade window has a deep timber frame, divided lights and braced shutters',()=>{
 const polygons=[];
 drawFacadeWindow((points,color)=>polygons.push({points,color}),
  (x,y,z)=>({x:(x-y)*32,y:(x+y)*18-z*24}),
  {x1:0,y1:3,x2:1.2,y2:3,bottom:1.05,top:2.85},{lit:false});
 assert.ok(polygons.length>=26,`window assembly has its frame, small panes and shutter details (${polygons.length})`);
 assert.ok(polygons.some(item=>item.color==='#b68a52'),'outer frame is distinct from the dark wall opening');
 assert.ok(polygons.some(item=>item.color==='#715338'),'open timber shutter is visible');
 assert.ok(polygons.every(item=>item.points.every(point=>point.every(Number.isFinite))));
});
