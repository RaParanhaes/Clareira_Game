import test from 'node:test';
import assert from 'node:assert/strict';
import {flightCanOccupy,flightStep} from './flight-prototype.mjs';
const trees=[{x:0,y:0,radius:.38,baseZ:0,topZ:4}];
const body={radius:.24,height:1.4};
const options={trees,body,speed:8,verticalSpeed:4};
test('trunk blocks below canopy, but permits full body to pass above it',()=>{
 assert.equal(flightCanOccupy({x:0,y:0,z:0},body,trees),false);
 assert.equal(flightCanOccupy({x:0,y:0,z:3.99},body,trees),false);
 assert.equal(flightCanOccupy({x:0,y:0,z:4},body,trees),true);
 for(const height of [0,4]){
  let state={x:-2,y:0,z:height};for(let i=0;i<10;i++)state=flightStep(state,{x:1},.1,options);
  if(height===0)assert.ok(state.x<-.61);else assert.ok(state.x>2);
 }
});
test('descending over a crown stops on its top and movement cannot tunnel through the trunk',()=>{
 let state={x:0,y:0,z:5};for(let i=0;i<10;i++)state=flightStep(state,{vertical:-1},.1,options);
 assert.ok(state.z>=4&&state.z<4.06);assert.equal(flightCanOccupy(state,body,trees),true);
 state={x:-1,y:0,z:1};state=flightStep(state,{x:1},.1,{...options,speed:30});assert.ok(state.x<-.61);
});
test('altitude is absolute above varying terrain; floor prevents sinking',()=>{
 const terrain=x=>x>0?2:0;let state={x:-1,y:0,z:4};
 for(let i=0;i<5;i++)state=flightStep(state,{x:1},.1,{trees:[],body,terrain,speed:4});
 assert.equal(state.z,4);assert.ok(state.x>0);
 for(let i=0;i<20;i++)state=flightStep(state,{vertical:-1},.1,{trees:[],body,terrain});
 assert.equal(state.z,2);
});

test('controlled ascent locks horizontal movement while smooth flight combines axes with gentler acceleration',()=>{
 const start={x:0,y:0,z:0};const intent={x:1,vertical:1};
 const controlled=flightStep(start,intent,.1,{trees:[],profile:'controlled'});
 const smooth=flightStep(start,intent,.1,{trees:[],profile:'smooth'});
 assert.equal(controlled.x,0);assert.ok(smooth.x>0);assert.ok(smooth.z>0&&smooth.z<controlled.z);
});
test('smooth descent decelerates at the requested altitude without oscillating or sinking',()=>{
 let state={x:2,y:0,z:5};for(let i=0;i<100;i++)state=flightStep(state,{vertical:-1},.05,{trees,body,profile:'smooth',targetZ:0});
 assert.equal(state.z,0);assert.equal(state.vz,0);
 for(let i=0;i<20;i++)state=flightStep(state,{vertical:0},.05,{trees,body,profile:'smooth',targetZ:0});
 assert.equal(state.z,0);
});
