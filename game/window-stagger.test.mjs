import test from 'node:test';
import assert from 'node:assert/strict';
import { exteriorEmitters, windowLightAmount } from './scene-lights.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING } from './village-buildings.mjs';

const buildings = [RECEPTION_BUILDING, ...VILLAGE_BUILDINGS];
const litAt = hours => exteriorEmitters(buildings, 0, false, hours).filter(e => e.kind === 'window');

test('no window lights before the evening starts at 18:20', () => {
  for (const emitter of litAt(17.5)) assert.equal(emitter.strength, 0, emitter.id);
});

test('every house keeps at least one window lit through the night', () => {
  for (const hour of [22, 1, 3]) {
    const lit = litAt(hour);
    for (const building of buildings) {
      const own = lit.filter(e => e.owner === building.id && e.strength > .5);
      assert.ok(own.length >= 1, `${building.id} has a lit window at ${hour}h`);
    }
  }
});

test('windows come on one by one: the evening is staggered, not simultaneous', () => {
  const early = litAt(18.9).filter(e => e.strength > .05).length;
  const later = litAt(21.5).filter(e => e.strength > .05).length;
  const total = litAt(21.5).length;
  assert.ok(early < later, 'more windows are lit as the evening goes on');
  assert.ok(later < total, 'some windows stay dark');
});

test('windows go out one by one at dawn', () => {
  const morning = litAt(5.8).filter(e => e.strength > .05).length;
  const late = litAt(7.5).filter(e => e.strength > .05).length;
  assert.ok(morning > late, 'the number of lit windows falls through the dawn');
  for (const building of buildings) {
    const primary = litAt(7.5).filter(e => e.owner === building.id);
    assert.ok(primary.every(e => e.strength < .05), `${building.id} is dark by 7h30`);
  }
});

test('the same window always draws the same moment', () => {
  assert.equal(windowLightAmount('house:window-2', false, 21), windowLightAmount('house:window-2', false, 21));
});

test('the porch lantern is round and reaches farther than a window', () => {
  const emitters = exteriorEmitters(buildings, 0, false, 22);
  for (const building of buildings) {
    const porch = emitters.find(e => e.id === `${building.id}:porch`);
    assert.equal(porch.nx, 0);
    assert.equal(porch.ny, 0, 'no facing: the light is round');
    const maxWindowReach = Math.max(...emitters.filter(e => e.kind === 'window' && e.owner === building.id).map(e => e.reach));
    assert.ok(porch.reach > maxWindowReach, `${building.id}: porch ${porch.reach} wider than windows ${maxWindowReach}`);
  }
});
