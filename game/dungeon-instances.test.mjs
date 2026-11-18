import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDungeonRegistry, dungeonDimensionId, dungeonEntranceSpawn, dungeonLevel, dungeonModelId,
  instanceIdFor, isDungeonDimensionId, parseDungeonDimensionId, DUNGEON_IDLE_MS,
} from './dungeon-instances.mjs';
import { setActiveDungeonLevel, canOccupy } from './world.mjs';

const PROFILE_A = '11111111-1111-4111-8111-111111111111';
const PROFILE_B = '22222222-2222-4222-8222-222222222222';

test('id da instância: dg-ninho-n<N>-<inst>, e o id-modelo é igual para todas as instâncias', () => {
  const a = instanceIdFor(PROFILE_A);
  const id = dungeonDimensionId(1, a);
  assert.equal(id, `dg-ninho-n1-${a}`);
  assert.equal(dungeonModelId(1), 'dg-ninho-n1');
  assert.deepEqual(parseDungeonDimensionId(id), { lairId: 'ninho', level: 1, instanceId: a, modelId: 'dg-ninho-n1' });
  assert.equal(isDungeonDimensionId('surface'), false);
  assert.equal(isDungeonDimensionId('dg-ninho-n0-0123456789'), false);
  assert.equal(isDungeonDimensionId('dg-ninho-n1-XYZ'), false);
});

test('mesma chave de grupo dá a mesma instância; grupos diferentes ficam separados', () => {
  const registry = createDungeonRegistry({ now: () => 0 });
  const first = registry.acquire(PROFILE_A, 1, 'a');
  const again = registry.acquire(PROFILE_A, 1, 'b');
  const other = registry.acquire(PROFILE_B, 1, 'c');
  assert.equal(first.instance.dimensionId, again.instance.dimensionId);
  assert.notEqual(first.instance.dimensionId, other.instance.dimensionId);
  assert.equal(registry.count(), 2);
});

test('instância vazia é coletada só depois de 30 s; quem volta antes a mantém', () => {
  let clock = 0;
  const registry = createDungeonRegistry({ now: () => clock });
  const { instance } = registry.acquire(PROFILE_A, 1, 'a');
  registry.release(instance.dimensionId, 'a');
  clock = DUNGEON_IDLE_MS - 1;
  assert.deepEqual(registry.collect(), []);
  registry.acquire(PROFILE_A, 1, 'a');
  registry.release(instance.dimensionId, 'a');
  // A segunda saída foi em DUNGEON_IDLE_MS - 1: a coleta só vem 30 s depois dela.
  clock = 2 * DUNGEON_IDLE_MS - 2;
  assert.deepEqual(registry.collect(), []);
  clock += 1;
  assert.deepEqual(registry.collect(), [instance.dimensionId]);
  assert.equal(registry.count(), 0);
});

test('teto de 12 instâncias ativas: a 13ª é recusada', () => {
  const registry = createDungeonRegistry({ now: () => 0 });
  for (let i = 0; i < 12; i++) assert.equal(registry.acquire(`profile-${i}`, 1, `p${i}`).ok, true);
  assert.deepEqual(registry.acquire('profile-extra', 1, 'extra'), { ok: false, reason: 'cheia' });
});

test('a grade do nível é a mesma em toda chamada e a chegada cai numa célula aberta', () => {
  assert.equal(dungeonLevel(1), dungeonLevel(1));
  const level = dungeonLevel(1);
  const spawn = dungeonEntranceSpawn(1);
  assert.equal(level.cells[Math.floor(spawn.y) * level.w + Math.floor(spawn.x)], 1);
});

test('colisão da grade: rocha bloqueia, piso com folga passa, borda do mundo bloqueia', () => {
  const level = dungeonLevel(1);
  setActiveDungeonLevel(level);
  try {
    // Centro de uma célula cujas 8 vizinhas são piso: o círculo de 0,25 cabe inteiro.
    let clear = null;
    for (let y = 2; y < level.h - 2 && !clear; y++) for (let x = 2; x < level.w - 2 && !clear; x++) {
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
        if (level.cells[(y + dy) * level.w + (x + dx)] !== 1) ok = false;
      }
      if (ok) clear = { x: x + 0.5, y: y + 0.5 };
    }
    assert.ok(clear, 'a masmorra tem uma região com 3x3 de piso');
    assert.equal(canOccupy(clear, 0.25), true);
    // Centro de célula de rocha: bloqueado.
    let rock = null;
    for (let y = 1; y < level.h - 1 && !rock; y++) for (let x = 1; x < level.w - 1 && !rock; x++) {
      if (level.cells[y * level.w + x] === 0) rock = { x: x + 0.5, y: y + 0.5 };
    }
    assert.equal(canOccupy(rock, 0.25), false);
    // Encostado na parede de rocha (a 0,1 da borda de uma célula de rocha): bloqueado pelo raio.
    let wallEdge = null;
    for (let y = 2; y < level.h - 2 && !wallEdge; y++) for (let x = 2; x < level.w - 2 && !wallEdge; x++) {
      if (level.cells[y * level.w + x] === 1 && level.cells[y * level.w + x - 1] === 0) wallEdge = { x: x + 0.1, y: y + 0.5 };
    }
    assert.ok(wallEdge, 'há piso encostado em rocha');
    assert.equal(canOccupy(wallEdge, 0.25), false);
    // Fora da grade bloqueia.
    assert.equal(canOccupy({ x: -0.5, y: 5.5 }, 0.25), false);
  } finally {
    setActiveDungeonLevel(null);
  }
});
