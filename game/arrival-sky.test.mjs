import test from 'node:test';
import assert from 'node:assert/strict';
import {ARRIVAL_SKY_DURATION_MS,arrivalSkyState} from './arrival-sky.mjs';
test('arrival logo dissolves before the sky descends and the ground takes over',()=>{
  assert.equal(arrivalSkyState(0).logo,1);
  assert.equal(arrivalSkyState(0).opacity,0,'sky emerges from the loading screen without a flash');
  assert.ok(arrivalSkyState(350).opacity>0&&arrivalSkyState(350).opacity<1);
  assert.equal(arrivalSkyState(700).opacity,1,'the star field resolves before the logo starts fading');
  assert.equal(arrivalSkyState(3400).logo,0);
  assert.equal(arrivalSkyState(4500).descent,0);
  assert.ok(arrivalSkyState(6100).descent>0);
  assert.ok(arrivalSkyState(6100).opacity>0);
  assert.equal(arrivalSkyState(ARRIVAL_SKY_DURATION_MS).opacity,0);
  assert.equal(arrivalSkyState(ARRIVAL_SKY_DURATION_MS).complete,true);
});
