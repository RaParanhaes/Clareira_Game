import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARRIVAL_CAMPFIRE_EDGE_POWER,
  ARRIVAL_CAMPFIRE_REACH_MULTIPLIER,
  CAMPFIRE_LIGHT_RADIUS_TILES,
  campfireLightFalloff,
} from './campfire-light.mjs';
import { FIRE_LIGHT_REACH } from './lighting.mjs';
import { arrivalImpactShake, ARRIVAL_IMPACT_SHAKE_MS, ARRIVAL_LIGHTNING_IMPACT_MS } from './arrival-cinematic.mjs';

test('campfire has an explicit seven-tile light reach', () => {
  assert.equal(CAMPFIRE_LIGHT_RADIUS_TILES, 7);
  assert.equal(FIRE_LIGHT_REACH, CAMPFIRE_LIGHT_RADIUS_TILES);
});

test('spherical firelight weakens continuously with distance and reaches darkness at the edge', () => {
  const samples = [0, .1, .25, .5, .75, .95, 1].map(distance => campfireLightFalloff(distance));
  assert.equal(samples[0], 1);
  assert.ok(samples.every((value, index) => index === 0 || value < samples[index - 1]));
  assert.ok(samples[3] > .2, 'the spherical light still reaches halfway across its seven-tile pool');
  assert.ok(samples[5] < .1, 'light is nearly gone near the edge of the seven-tile pool');
  assert.equal(samples.at(-1), 0);
});

test('arrival firelight matches the player-built campfire range and falloff', () => {
  assert.equal(ARRIVAL_CAMPFIRE_REACH_MULTIPLIER, 1);
  assert.equal(ARRIVAL_CAMPFIRE_EDGE_POWER, 1.35);
  const distances = [0, .25, .5, .75, .9, .98, 1];
  for (const distance of distances) {
    assert.equal(campfireLightFalloff(distance, ARRIVAL_CAMPFIRE_EDGE_POWER), campfireLightFalloff(distance));
  }
  assert.equal(CAMPFIRE_LIGHT_RADIUS_TILES * ARRIVAL_CAMPFIRE_REACH_MULTIPLIER, 7);
});

test('lightning impact shakes the camera briefly, then damps to rest', () => {
  assert.equal(arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS - 1), null);
  assert.deepEqual(arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS), { x: 0, y: 0 });
  const peak = arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS + 90);
  const settling = arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS + 450);
  assert.ok(Math.hypot(peak.x, peak.y) > Math.hypot(settling.x, settling.y));
  assert.equal(arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS + ARRIVAL_IMPACT_SHAKE_MS), null);
  assert.equal(arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS + 90, true), null);
});
