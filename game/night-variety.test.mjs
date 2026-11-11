import test from 'node:test';
import assert from 'node:assert/strict';
import { houseNightMood, windowLightAmount, porchLightAmount, exteriorEmitters } from './scene-lights.mjs';
import { VILLAGE_BUILDINGS } from './village-buildings.mjs';

const SEEDS = Array.from({ length: 40 }, (_, index) => 1000 + index);

test('each night draws a different mood for the same house', () => {
  const moods = new Set(SEEDS.map(seed => houseNightMood('lodging-pine-inn', seed)));
  assert.ok(moods.has('all') && moods.has('some') && moods.has('one'), 'all three moods occur across nights');
});

test('the first window lights every night, whatever the mood', () => {
  for (const seed of SEEDS) {
    for (const mood of ['all', 'some', 'one']) {
      assert.ok(windowLightAmount('house:window-0', true, 22, { seed, mood }) > .9, `seed ${seed} ${mood}`);
    }
  }
});

test('a house in the one-window mood keeps only its first window lit', () => {
  for (const seed of SEEDS) {
    assert.equal(windowLightAmount('house:window-3', false, 22, { seed, mood: 'one' }), 0);
  }
});

test('an all-windows night lights every window; some-windows nights leave a few dark', () => {
  const allLit = windowLightAmount('house:window-2', false, 22, { seed: 1, mood: 'all' });
  assert.ok(allLit > .9, 'all mood lights a secondary window');
  let dark = 0;
  for (const seed of SEEDS) if (windowLightAmount('house:window-2', false, 22, { seed, mood: 'some' }) === 0) dark += 1;
  assert.ok(dark > 0 && dark < SEEDS.length, 'some mood keeps some windows dark on some nights only');
});

test('the lantern in front of each house comes on before any window', () => {
  const hours = Array.from({ length: 121 }, (_, index) => 18 + index * .025);
  for (const seed of SEEDS) {
    const firstPorch = hours.find(h => porchLightAmount('lodging-pine-inn', h, seed) > .5);
    const firstWindow = hours.find(h => windowLightAmount('house:window-0', true, h, { seed, mood: 'one' }) > .5);
    assert.ok(firstPorch !== undefined && firstWindow !== undefined, `seed ${seed} lights up`);
    assert.ok(firstPorch <= firstWindow, `seed ${seed}: porch ${firstPorch} before window ${firstWindow}`);
  }
});

test('every village house has its lantern lit at night', () => {
  const emitters = exteriorEmitters(VILLAGE_BUILDINGS, 0, false, 22, 1234);
  for (const building of VILLAGE_BUILDINGS) {
    const porch = emitters.find(e => e.id === `${building.id}:porch`);
    assert.ok(porch.strength > .5, `${building.id} lantern is lit`);
  }
});
