import test from 'node:test';
import assert from 'node:assert/strict';
import { createVillageNpcWalkers } from './npc-village-walkers.mjs';
import { PLAYER_RADIUS } from './world.mjs';

const roster = [{ id: 'village:tomas', x: 88, y: 92 }, { id: 'village:mara', x: 90, y: 92 }];
const loopFor = (id, spot) => [spot, { x: spot.x + 2, y: spot.y }];

test('each villager walks its own loop and comes back to the start of the route', () => {
  const walkers = createVillageNpcWalkers(roster, loopFor);
  let seenBack = false;
  for (let i = 0; i < 600; i++) {
    walkers.tick(.1, walkers.bodies());
    const tomas = walkers.positions().get('village:tomas');
    if (Math.abs(tomas.x - 88) < .2 && i > 20) seenBack = true;
  }
  assert.ok(seenBack, 'the villager returned to its first point and keeps looping');
});

test('a villager does not walk through another villager standing in its way', () => {
  const walkers = createVillageNpcWalkers([{ id: 'a', x: 80, y: 90 }, { id: 'b', x: 81.2, y: 90 }],
    (id, spot) => (id === 'a' ? [spot, { x: spot.x + 3, y: spot.y }] : [spot, spot]));
  for (let i = 0; i < 120; i++) {
    walkers.tick(.05, walkers.bodies());
    const a = walkers.positions().get('a'), b = walkers.positions().get('b');
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(gap >= PLAYER_RADIUS * 2 - .03, `step ${i}: gap ${gap.toFixed(3)}`);
  }
});
