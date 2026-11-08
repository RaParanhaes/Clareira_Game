import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPositionSample,interpolatePosition} from './interpolation.mjs';

test('remote flight interpolates absolute altitude and preserves negative world elevations',()=>{
  let samples=[];
  samples=appendPositionSample(samples,{time:0,x:0,y:0,z:1,flightZ:-2,vx:0,vy:0,vz:2});
  samples=appendPositionSample(samples,{time:100,x:0,y:0,z:1.2,flightZ:-1.8,vx:0,vy:0,vz:2});
  assert.ok(Math.abs(interpolatePosition(samples,50).flightZ-(-1.9))<1e-9);
  assert.ok(Math.abs(interpolatePosition(samples,150).flightZ-(-1.7))<1e-9);
  samples=appendPositionSample(samples,{time:200,x:0,y:0,z:0,flightZ:null});
  assert.equal(interpolatePosition(samples,200).flightZ,undefined);
});
