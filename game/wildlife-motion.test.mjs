import test from 'node:test';
import assert from 'node:assert/strict';
import { appendWildlifeSample, interpolateWildlifePosition } from './wildlife-motion.mjs';

test('batched wildlife snapshots retain simulation spacing instead of receipt spacing', () => {
  let samples=[];
  // Eight packets delivered together after a short stall still describe 280ms.
  for(let time=0;time<=280;time+=40)samples=appendWildlifeSample(samples,{x:time/1000,y:4},time);
  const positions=[280,296,312,328,344,360,376,392].map(now=>interpolateWildlifePosition(samples,now));
  for(let i=1;i<positions.length;i++)assert.ok(Math.abs(positions[i].x-positions[i-1].x-.016)<1e-9);
  assert.equal(positions[0].y,4);
});

test('wildlife stops at the last authoritative position during a gap without overshooting and returning', () => {
  let samples=appendWildlifeSample([],{x:0,y:0,vx:3,vy:0},0);
  samples=appendWildlifeSample(samples,{x:.3,y:0,vx:3,vy:0},100);
  const paused=interpolateWildlifePosition(samples,400);
  assert.equal(paused.x,.3);
  samples=appendWildlifeSample(samples,{x:.3,y:0,vx:0,vy:0},300);
  assert.equal(interpolateWildlifePosition(samples,420).x,paused.x);
});

test('old wildlife snapshots cannot rewind motion and history stays bounded', () => {
  let samples=[];
  for(let time=0;time<=2000;time+=30)samples=appendWildlifeSample(samples,{x:time/1000,y:0},time);
  const last=samples.at(-1);
  samples=appendWildlifeSample(samples,{x:-100,y:0},100);
  assert.equal(samples.length,64);
  assert.deepEqual(samples.at(-1),last);
});

test('wildlife playback resumes a stalled stream without consuming its backlog in a single frame', () => {
  let samples=[];const playback={};
  for(let time=0;time<=200;time+=40)samples=appendWildlifeSample(samples,{x:time/1000,y:0},time);
  const before=interpolateWildlifePosition(samples,400,playback);
  // Resume with ten new positions after a long pause.
  for(let time=240;time<=600;time+=40)samples=appendWildlifeSample(samples,{x:time/1000,y:0},time);
  const after=interpolateWildlifePosition(samples,416,playback);
  assert.ok(after.x>=before.x);
  assert.ok(after.x-before.x<=.017600001);
});
