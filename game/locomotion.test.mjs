import test from 'node:test';import assert from 'node:assert/strict';
import {locomotion,blendBody} from './locomotion.mjs';import {stepPlayer,stepRoomPlayer} from './world.mjs';import {reconcilePrediction} from './prediction.mjs';
const intent={x:1,y:0,motion:true};
test('acceleration, run, crouch and braking preserve bounded physical velocity',()=>{
 const first=locomotion({},intent,1/60,3.2);assert.ok(first.vx>0&&first.vx<3.2);
 let walking={},running={},crouched={};for(let i=0;i<60;i++){walking=locomotion(walking,intent,1/60,3.2);running=locomotion(running,{...intent,run:true},1/60,3.2);crouched=locomotion(crouched,{...intent,crouch:true},1/60,3.2)}
 assert.ok(running.vx>walking.vx);assert.ok(crouched.vx<walking.vx);
 for(let i=0;i<10;i++)running=locomotion(running,{x:0,y:0},1/60,3.2);assert.equal(running.vx,0);
});
test('jump follows gravity, lands and cannot repeat while held',()=>{
 let state={};let highest=0;for(let i=0;i<90;i++){state=locomotion(state,{jump:true},1/60,3.2);highest=Math.max(highest,state.z)}
 assert.ok(highest>.7&&highest<1);assert.equal(state.z,0);assert.equal(state.vz,0);
 state=locomotion(state,{jump:false},1/60,3.2);state=locomotion(state,{jump:true},1/60,3.2);assert.ok(state.z>0);
});
test('sitting, standing and crouching blend over time',()=>{
 let pose=blendBody({},{sitting:true},.1);assert.ok(pose.sit>0&&pose.sit<1);
 for(let i=0;i<120;i++)pose=blendBody(pose,{sitting:true},1/60);assert.equal(pose.sit,1);
 pose=blendBody(pose,{},.1);assert.ok(pose.sit>0&&pose.sit<1);
});
test('body transitions ease in, match across frame rates and reverse without overshoot',()=>{
 const sample=(fps,seconds,target,initial={})=>{let pose=initial;for(let i=0;i<fps*seconds;i++)pose=blendBody(pose,target,1/fps);return pose;};
 const first=blendBody({},{sitting:true},1/60);
 assert.ok(first.sit>0&&first.sit<.03,'sit eases into motion instead of stepping at a constant rate');
 const mid30=sample(30,.3,{sitting:true}),mid120=sample(120,.3,{sitting:true});
 assert.ok(Math.abs(mid30.sit-mid120.sit)<1e-6,'pose depends on elapsed time, not frame count');
 const reversed=sample(60,.2,{sitting:false},mid120);
 assert.ok(reversed.sit>=0&&reversed.sit<mid120.sit,'standing eases back without passing through the floor');
});
test('prediction replays velocity and vertical state from the authoritative snapshot',()=>{
 const start={x:6,y:17},commands=Array.from({length:30},(_,i)=>({...intent,jump:i<10,seq:i+1}));let state=start;
 for(const command of commands.slice(0,12))state=stepPlayer(state,command,1/60);
 const expected=commands.slice(12).reduce((p,c)=>stepPlayer(p,c,1/60),state);
 const actual=reconcilePrediction({...state,inputSeq:12},commands,stepPlayer).position;assert.deepEqual(actual,expected);
});
test('running and jumping retain room wall collision',()=>{
 let state={x:1,y:8};for(let i=0;i<90;i++)state=stepRoomPlayer(state,{motion:true,x:-1,y:0,run:true,jump:true},1/60);
 assert.ok(state.x>=.75);assert.equal(state.vx,0);assert.equal(state.z,0);
});
