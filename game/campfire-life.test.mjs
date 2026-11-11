import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPFIRE_DECAY_DELAY_MS, CAMPFIRE_DECAY_DURATION_MS, CAMPFIRE_FEED_COST, CAMPFIRE_FEED_WINDOW_MS,
  CAMPFIRE_IGNITION_RAMP_MS, CAMPFIRE_LIFETIME_MS, CAMPFIRE_NEW_COST, CAMPFIRE_REKINDLE_COST,
  CAMPFIRE_DECAY_REBUILD_COST, campfireBurnedOutForMs, campfireDecayProgress, campfireFlameStrength,
  campfireRemainingMs, campfireSmokeState,
} from './campfire-life.mjs';
import { GAME_DAY_DURATION_MS } from './day-night.mjs';

test('campfire material costs match relighting, rebuilding, creating, and feeding', () => {
  assert.deepEqual(CAMPFIRE_NEW_COST, { wood: 20, stone: 10, leaves: 1 });
  assert.deepEqual(CAMPFIRE_REKINDLE_COST, { wood: 10, stone: 0, leaves: 1 });
  assert.deepEqual(CAMPFIRE_DECAY_REBUILD_COST, { wood: 10, stone: 5, leaves: 1 });
  assert.deepEqual(CAMPFIRE_FEED_COST, { wood: 2, stone: 0, leaves: 0 });
});

test('a lit fire burns for fifteen minutes before its one-day decay wait begins', () => {
  assert.equal(CAMPFIRE_DECAY_DELAY_MS, GAME_DAY_DURATION_MS);
  assert.equal(CAMPFIRE_DECAY_DURATION_MS, GAME_DAY_DURATION_MS);
  const fire = { litAt: 20_000 };
  assert.equal(campfireRemainingMs(fire, fire.litAt), CAMPFIRE_LIFETIME_MS);
  assert.equal(campfireRemainingMs(fire, fire.litAt + CAMPFIRE_LIFETIME_MS / 2), CAMPFIRE_LIFETIME_MS / 2);
  assert.equal(campfireRemainingMs(fire, fire.litAt + CAMPFIRE_LIFETIME_MS), 0);
  assert.equal(campfireBurnedOutForMs(fire, fire.litAt + CAMPFIRE_LIFETIME_MS + CAMPFIRE_DECAY_DELAY_MS), CAMPFIRE_DECAY_DELAY_MS);
  assert.equal(campfireDecayProgress(fire, fire.litAt + CAMPFIRE_LIFETIME_MS + CAMPFIRE_DECAY_DELAY_MS), 0);
});

test('an abandoned fire visibly decays over the next in-game day, then reaches removal time', () => {
  const fire = { litAt: 100 };
  const decayStartsAt = fire.litAt + CAMPFIRE_LIFETIME_MS + CAMPFIRE_DECAY_DELAY_MS;
  assert.equal(campfireDecayProgress(fire, decayStartsAt), 0);
  assert.equal(campfireDecayProgress(fire, decayStartsAt + CAMPFIRE_DECAY_DURATION_MS / 2), 0.5);
  assert.equal(campfireDecayProgress(fire, decayStartsAt + CAMPFIRE_DECAY_DURATION_MS), 1);
});

test('fuel fades over minutes while relighting ramps back to full strength in seconds', () => {
  const at = 10_000;
  const burning = { litAt: at };
  const strong = campfireFlameStrength(burning, at);
  const halfFuel = campfireFlameStrength(burning, at + CAMPFIRE_LIFETIME_MS / 2);
  assert.equal(strong, 1);
  assert.ok(halfFuel > 0 && halfFuel < strong);
  assert.equal(campfireFlameStrength(burning, at + CAMPFIRE_LIFETIME_MS), 0);

  const relit = { litAt: at, flameRiseAt: at, flameRiseFrom: 0, flameRiseDurationMs: CAMPFIRE_IGNITION_RAMP_MS };
  assert.equal(campfireFlameStrength(relit, at), 0);
  assert.ok(campfireFlameStrength(relit, at + CAMPFIRE_IGNITION_RAMP_MS / 2) > 0.4);
  assert.ok(campfireFlameStrength(relit, at + CAMPFIRE_IGNITION_RAMP_MS) > 0.98);

  const fed = { ...relit, flameRiseFrom: halfFuel };
  assert.equal(campfireFlameStrength(fed, at), halfFuel);
  assert.ok(campfireFlameStrength(fed, at + CAMPFIRE_IGNITION_RAMP_MS) > halfFuel);
  assert.ok(CAMPFIRE_IGNITION_RAMP_MS < CAMPFIRE_LIFETIME_MS * 0.02);
  assert.equal(CAMPFIRE_FEED_WINDOW_MS, CAMPFIRE_LIFETIME_MS * 0.25);
});

test('smoke stays after the flame goes out, then fades away', () => {
  const fire = { litAt: 0 };
  const smokeStarts = CAMPFIRE_LIFETIME_MS;
  assert.ok(campfireSmokeState(fire, smokeStarts).strength > 0.8);
  assert.ok(campfireSmokeState(fire, smokeStarts + 2 * 60_000).strength > 0.8);
  const halfway = campfireSmokeState(fire, smokeStarts + 2 * 60_000 + 45_000).strength;
  assert.ok(halfway > 0 && halfway < 0.8);
  assert.equal(campfireSmokeState(fire, smokeStarts + 2 * 60_000 + 90_000).strength, 0);
});
