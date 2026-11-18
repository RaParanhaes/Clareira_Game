import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoorTriggerState, stepDoorTrigger, failDoorTrigger } from './door-proximity.mjs';

test('door trigger waits inside radius and rearms only after leaving hysteresis distance', () => {
  let state = createDoorTriggerState();
  let result = stepDoorTrigger(state, { distance: .8, now: 0 }); state = result.state;
  assert.equal(result.fire, false);
  result = stepDoorTrigger(state, { distance: .8, now: 299 }); state = result.state;
  assert.equal(result.fire, false);
  result = stepDoorTrigger(state, { distance: .8, now: 300 }); state = result.state;
  assert.equal(result.fire, true);
  result = stepDoorTrigger(state, { distance: .6, now: 2000 }); state = result.state;
  assert.equal(result.fire, false, 'standing in the arrival radius cannot retrigger');
  result = stepDoorTrigger(state, { distance: 1.81, now: 2100 }); state = result.state;
  assert.equal(state.armed, true);
  result = stepDoorTrigger(state, { distance: .8, now: 2200 }); state = result.state;
  assert.equal(result.fire, false);
  result = stepDoorTrigger(state, { distance: .8, now: 2500 });
  assert.equal(result.fire, true);
});

test('clear path, door direction, lock, and failure gate the shared trigger', () => {
  let state = createDoorTriggerState();
  assert.equal(stepDoorTrigger(state, { distance: .5, clear: false, now: 0 }).fire, false);
  assert.equal(stepDoorTrigger(state, { distance: .5, towardDoor: false, now: 0 }).fire, false);
  state = { ...state, since: 0 };
  const fired = stepDoorTrigger(state, { distance: .5, now: 300 });
  assert.equal(fired.fire, true);
  assert.equal(stepDoorTrigger(fired.state, { distance: .5, now: 3000 }).fire, false);
  const failed = failDoorTrigger(createDoorTriggerState(), 1000);
  assert.equal(stepDoorTrigger(failed, { distance: .5, now: 2000 }).fire, false);
  assert.equal(stepDoorTrigger(failed, { distance: 1.81, now: 2000 }).state.armed, false);
  assert.equal(stepDoorTrigger(failed, { distance: 1.81, now: 4000 }).state.armed, true);
});
