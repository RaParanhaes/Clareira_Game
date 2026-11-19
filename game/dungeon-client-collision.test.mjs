import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from './dungeon-gen.mjs';
import { DUNGEON_SEED } from './dungeon-ids.mjs';
import { canOccupy as clientCanOccupy, setActiveDungeonLevel as setClientDungeon } from './world.mjs';

test('colisão da grade do cliente coincide com uma instância isolada da física do servidor em 1000 pontos', async () => {
  const serverWorld = await import('./world.mjs?server-collision-fixture');
  const clientLevel = generateDungeon(DUNGEON_SEED, 1);
  const serverLevel = generateDungeon(DUNGEON_SEED, 1);
  setClientDungeon(clientLevel);
  serverWorld.setActiveDungeonLevel(serverLevel);

  let state = 0x1d1a7;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    assert.deepEqual(clientLevel.cells, serverLevel.cells);
    for (let index = 0; index < 1000; index++) {
      const position = { x: random() * clientLevel.w, y: random() * clientLevel.h };
      assert.equal(
        clientCanOccupy(position),
        serverWorld.canOccupy(position),
        `divergência de colisão no ponto ${index}: ${position.x},${position.y}`,
      );
    }
  } finally {
    setClientDungeon(null);
    serverWorld.setActiveDungeonLevel(null);
  }
});
