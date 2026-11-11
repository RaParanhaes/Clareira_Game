import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreAmbientFires } from './ambient-fires.mjs';

const spawnFire = { id: 'arrival', x: 92, y: 93, permanent: true, litAt: 1 };

test('a saved fire list without the permanent spawn fire gets it back', () => {
  const saved = new Map([['camp-2', { id: 'camp-2', x: 10, y: 10, litAt: 5 }]]);
  const restored = restoreAmbientFires(saved, new Map([['arrival', spawnFire]]));
  assert.equal(restored, true);
  assert.deepEqual(saved.get('arrival'), spawnFire);
  assert.ok(saved.has('camp-2'), 'the player-made fire stays');
});

test('a saved list that already has the spawn fire is left alone', () => {
  const edited = { ...spawnFire, flameRiseAt: 9 };
  const saved = new Map([['arrival', edited]]);
  assert.equal(restoreAmbientFires(saved, new Map([['arrival', spawnFire]])), false);
  assert.equal(saved.get('arrival'), edited, 'the saved copy is not overwritten');
});

test('the restored fire is a copy, not the shared template', () => {
  const saved = new Map();
  restoreAmbientFires(saved, new Map([['arrival', spawnFire]]));
  saved.get('arrival').litAt = 999;
  assert.equal(spawnFire.litAt, 1);
});
