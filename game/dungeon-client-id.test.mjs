import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEON_CLIENT_SEED, parseDungeonClientId } from './dungeon-render.mjs';

test('id de instância da masmorra vira nível, instância e id-modelo', () => {
  assert.deepEqual(parseDungeonClientId('dg-ninho-n1-0123456789'), {
    lairId: 'ninho', level: 1, instanceId: '0123456789', modelId: 'dg-ninho-n1',
  });
});

test('ids que não são de masmorra devolvem null', () => {
  for (const id of ['surface', 'arrival-abc', 'dg-ninho-n0-0123456789', 'dg-ninho-n1-XYZ', 'dg-ninho-n1', undefined, null]) {
    assert.equal(parseDungeonClientId(id), null, String(id));
  }
});

test('semente do cliente é a mesma do servidor (DUNGEON_SEED em scripts/dungeon-instances.mjs)', () => {
  assert.equal(DUNGEON_CLIENT_SEED, 0x4e494e48);
});
