import test from 'node:test';
import assert from 'node:assert/strict';
import { LAIRS, createLairGuards, lairView } from './lairs.mjs';
import { WILDLIFE_BY_ID, wildlifeIsActive, stepWildlifePopulation } from './wildlife.mjs';
import { WORLD_SIZE, canOccupy } from './world.mjs';
import { GAME_DAY_DURATION_MS } from './game-time.mjs';

test('covil exporta guardas fixos, baú, boca e obstáculos dentro do mundo', () => {
  const lair = LAIRS.ninho;
  assert.equal(lair.dimensionId, 'surface');
  assert.ok(lair.center.x > 0 && lair.center.x < WORLD_SIZE && lair.center.y < WORLD_SIZE);
  assert.equal(lair.guards.length, 3);
  assert.equal(lair.respawnMs, GAME_DAY_DURATION_MS);
  for (const point of [...lair.guards, lair.chest, lair.mouth]) assert.equal(canOccupy(point, .48), true);
  assert.ok(lair.obstacles.length > 0);
  assert.deepEqual(createLairGuards(lair).map(animal=>animal.id), ['lair:ninho:0','lair:ninho:1','lair:ninho:2']);
  assert.deepEqual(Object.keys(lairView(lair)), ['id','x','y','chest','mouth','state','readyAt']);
});

test('guardião está sempre ativo, fixo no posto e não perde vida por fome', () => {
  const definition = WILDLIFE_BY_ID.get('caveWarden');
  assert.equal(definition.alwaysActive, true);
  assert.equal(definition.fixed, true);
  assert.equal(wildlifeIsActive(definition, 3), true);
  assert.equal(wildlifeIsActive(definition, 12), true);
  const guard = createLairGuards()[0]; guard.hunger=99;guard.thirst=99;guard.energy=5;guard.thinkAt=0;
  const population = new Map([[guard.id, guard]]);
  stepWildlifePopulation(population, { dimensionId:'surface', players:[{id:'p',location:'clearing',dimensionId:'surface',position:{x:guard.x+20,y:guard.y}}], now:100000, deltaSeconds:.12 });
  assert.equal(population.has(guard.id), true);
  assert.equal(guard.health, 6);
  assert.equal(guard.hunger, 99);
  assert.equal(guard.state, 'vigiando');
});
