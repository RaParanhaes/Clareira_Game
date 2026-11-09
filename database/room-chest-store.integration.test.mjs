import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ensureRoomChest, loadRoomChest, commitRoomChestMove } from './room-chest-store.mjs';
import { moveToRoomChest } from '../game/room-chest.mjs';
import { createInventory, addInventoryItem, INVENTORY_ITEM_KEYS } from '../game/inventory.mjs';

const connectionString = process.env.TEST_DATABASE_URL;
const ITEM = INVENTORY_ITEM_KEYS[0];
const skip = connectionString ? false : 'defina TEST_DATABASE_URL para rodar contra PostgreSQL';

function stockedInventory(quantity) {
  const inventory = createInventory();
  addInventoryItem(inventory, ITEM, quantity);
  return inventory;
}

test('room chest store: persists moves, rejects repeats and stale states', { skip }, async t => {
  const pool = new Pool({ connectionString });
  t.after(() => pool.end());
  const roomKey = `test-room-${randomUUID()}`;
  const chestId = await ensureRoomChest(pool, { roomKey, furnitureId: 'furniture.medieval-estantes-02' });
  const empty = await loadRoomChest(pool, chestId);
  assert.equal(empty.capacity, 12);
  assert.ok(empty.slots.every(slot => slot === null));

  const inventory = stockedInventory(5);
  const move = moveToRoomChest(inventory, empty, ITEM, 3);
  assert.equal(move.ok, true);
  const actionId = randomUUID();
  const committed = await commitRoomChestMove(pool, {
    actionId, chestId, profileId: randomUUID(), direction: 'in', itemId: ITEM, quantity: 3,
    expected: empty, next: move.chest,
  });
  assert.deepEqual(committed, { ok: true });
  assert.deepEqual(await loadRoomChest(pool, chestId), move.chest, 'stored state equals the computed state');

  const repeated = await commitRoomChestMove(pool, {
    actionId, chestId, profileId: randomUUID(), direction: 'in', itemId: ITEM, quantity: 3,
    expected: empty, next: move.chest,
  });
  assert.equal(repeated.reason, 'acao-repetida', 'the same action id is never applied twice');

  const stale = await commitRoomChestMove(pool, {
    actionId: randomUUID(), chestId, profileId: randomUUID(), direction: 'in', itemId: ITEM, quantity: 1,
    expected: empty, next: move.chest,
  });
  assert.equal(stale.reason, 'conflito', 'a move computed from an old state is refused');
  assert.deepEqual(await loadRoomChest(pool, chestId), move.chest, 'the refused move changed nothing');
});

test('room chest store: two simultaneous moves from the same state apply only one', { skip }, async t => {
  const pool = new Pool({ connectionString });
  t.after(() => pool.end());
  const roomKey = `test-room-${randomUUID()}`;
  const chestId = await ensureRoomChest(pool, { roomKey, furnitureId: 'furniture.medieval-baus-03' });
  const empty = await loadRoomChest(pool, chestId);
  const first = moveToRoomChest(stockedInventory(2), empty, ITEM, 1);
  const second = moveToRoomChest(stockedInventory(2), empty, ITEM, 2);
  const [a, b] = await Promise.all([
    commitRoomChestMove(pool, { actionId: randomUUID(), chestId, profileId: randomUUID(), direction: 'in', itemId: ITEM, quantity: 1, expected: empty, next: first.chest }),
    commitRoomChestMove(pool, { actionId: randomUUID(), chestId, profileId: randomUUID(), direction: 'in', itemId: ITEM, quantity: 2, expected: empty, next: second.chest }),
  ]);
  const results = [a, b].map(r => r.ok ? 'ok' : r.reason).sort();
  assert.deepEqual(results, ['conflito', 'ok'], 'the row lock lets only one of them win');
});
