import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DIMENSIONS, dimensionById, initialWorldForDimension, isPersonalArrivalDimensionId, personalArrivalDimension } from './dimensions.mjs';
import { campfireBurnedOutForMs, campfireDecayProgress, campfireFlameStrength, campfireRemainingMs } from './campfire-life.mjs';
import { waterwayRoutesForDimension, waterStateAt } from './waterways.mjs';
import { surfaceHeight } from './elevation.mjs';
import { WORLD_CENTER, WORLD_SIZE } from './world-scale.mjs';
import { applyWorldDefinition, canOccupy, getFallenTreesInBounds, getRocksInBounds, getResourcesInBounds, getSolidTreesInBounds, getWorldDefinition } from './world.mjs';

const PROFILE_A = '6d41d4a4-1003-4b2f-a6f9-d87ca1195bf1';
const PROFILE_B = 'f725466d-8ecc-47c3-8af0-eeb90bcb11ea';

test('novatos recebem ids de chegada próprios e spawn afastados da fogueira', () => {
  const first = personalArrivalDimension(PROFILE_A), second = personalArrivalDimension(PROFILE_B);
  assert.notEqual(first.id, second.id);
  assert.ok(isPersonalArrivalDimensionId(first.id));
  assert.equal(dimensionById(DEFAULT_DIMENSIONS, first.id).ownerProfileId, PROFILE_A);
  assert.equal(first.theme, 'dark');
  assert.deepEqual(first.campfire, WORLD_CENTER);
  assert.ok(Math.abs(first.spawn.x - WORLD_CENTER.x) < 10 && Math.abs(first.spawn.y - WORLD_CENTER.y) < 10,
    'personal arrivals stay around the center of the expanded map');
  assert.equal(first.spawn.x, first.campfire.x + 9);
  assert.equal(first.spawn.y, first.campfire.y + 2);
  assert.deepEqual(first.guide, first.campfire);
});

test('only the Breu uses the center spawn; other dimensions keep their established arrivals', () => {
  const breu = DEFAULT_DIMENSIONS.find(item => item.id === 'breu');
  assert.deepEqual(breu.spawn, WORLD_CENTER);
  assert.deepEqual(breu.campfire, WORLD_CENTER);
  assert.ok(breu.spawn.x >= WORLD_SIZE / 2);
  assert.deepEqual(DEFAULT_DIMENSIONS.find(item => item.id === 'ceu').spawn, { x: 419.5, y: 419.5 });
});

test('mundo pessoal começa plano e sem árvores ou plantas no chão', () => {
  const dimension = personalArrivalDimension(PROFILE_A);
  const definition = initialWorldForDimension(dimension, 12345);
  assert.deepEqual(definition.edits, []);
  assert.deepEqual(initialWorldForDimension(DEFAULT_DIMENSIONS.find(item => item.id === 'breu'), 54321).edits, []);
  assert.deepEqual(waterwayRoutesForDimension(dimension.id, dimension.theme, dimension.campfire), []);
  const previous = getWorldDefinition();
  try {
    applyWorldDefinition({ ...definition, revision: 1 });
    const area = { left: dimension.campfire.x - 80, right: dimension.campfire.x + 80,
      top: dimension.campfire.y - 80, bottom: dimension.campfire.y + 80 };
    assert.deepEqual(getSolidTreesInBounds(area), []);
    assert.equal(canOccupy({ x: dimension.campfire.x + 10, y: dimension.campfire.y }), true);
    assert.equal(canOccupy({ x: dimension.campfire.x + 39, y: dimension.campfire.y }), true,
      'the empty darkness has no invisible tree-ring collider');
    assert.deepEqual(getFallenTreesInBounds(area), []);
    assert.deepEqual(getRocksInBounds(area), []);
    assert.deepEqual(getResourcesInBounds(area), []);
    for (let x = area.left; x <= area.right; x += 11) for (let y = area.top; y <= area.bottom; y += 13) {
      assert.equal(waterStateAt(x, y, { dimensionId: dimension.id, theme: 'dark', origin: dimension.campfire }).depth, 0);
      assert.equal(surfaceHeight(x, y), 0, 'the black ground stays level across the entire arrival area');
    }
  } finally { applyWorldDefinition(previous); }
});

test('fogueira permanente mantém chama e não entra em decadência após vários dias', () => {
  const fire = { permanent: true, litAt: 10_000, flameRiseAt: 10_000, flameRiseFrom: 0, flameRiseDurationMs: 4_000 };
  const afterDays = fire.litAt + 10 * 24 * 60 * 60 * 1000;
  assert.ok(campfireRemainingMs(fire, afterDays) > 0);
  assert.equal(campfireBurnedOutForMs(fire, afterDays), 0);
  assert.equal(campfireDecayProgress(fire, afterDays), 0);
  assert.ok(campfireFlameStrength(fire, afterDays) > .99);
});
