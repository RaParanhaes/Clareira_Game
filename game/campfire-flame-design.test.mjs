import test from 'node:test';
import assert from 'node:assert/strict';
import {campfireFlamePose,drawCampfireFlames,campfireGlowPulse} from './campfire-flame-design.mjs';
test('flames animate with independent bounded tongues and stable bases',()=>{
 const poses=Array.from({length:24},(_,i)=>campfireFlamePose(i/12,4));
 assert.ok(new Set(poses.map(p=>JSON.stringify(p))).size>12);
 for(const pose of poses){assert.deepEqual(pose.map(p=>p.x),[-5,0,5]);for(const p of pose){assert.ok(p.height>=12&&p.height<=25);assert.ok(Math.abs(p.tip)<=2);}}
 assert.deepEqual(campfireFlamePose(1,3),campfireFlamePose(1.01,3));
 assert.notDeepEqual(campfireFlamePose(1,3),campfireFlamePose(1,7));
});
test('reduced motion freezes the flame; invalid time remains safe',()=>{
 assert.deepEqual(campfireFlamePose(1,3,true),campfireFlamePose(90,3,true));
 assert.deepEqual(campfireFlamePose(NaN),campfireFlamePose(0));
});
test('renderer uses finite coordinates without changing context alpha or composition',()=>{
 const c={globalAlpha:.4,globalCompositeOperation:'source-over',beginPath(){},closePath(){},fill(){},
 moveTo(...p){assert.ok(p.every(Number.isFinite));},lineTo(...p){assert.ok(p.every(Number.isFinite));},fillRect(...p){assert.ok(p.every(Number.isFinite));}};
 drawCampfireFlames(c,20,36,1,2);assert.equal(c.globalAlpha,.4);assert.equal(c.globalCompositeOperation,'source-over');
});

test('light flicker stays within seven percent and has a safe stationary value',()=>{
 assert.equal(campfireGlowPulse(1),1);assert.equal(campfireGlowPulse(NaN),1);
 assert.ok(campfireGlowPulse(-1)>=.934);assert.ok(campfireGlowPulse(9)<=1.066);
});
