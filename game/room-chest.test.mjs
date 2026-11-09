import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomChest, moveToRoomChest, moveFromRoomChest, ROOM_CHEST_CAPACITY } from './room-chest.mjs';
import { createInventory, addInventoryItem, INVENTORY_ITEM_KEYS } from './inventory.mjs';

const ITEM = INVENTORY_ITEM_KEYS[0];
const OTHER = INVENTORY_ITEM_KEYS[1];
const stocked = (quantity = 5) => {
  const inventory = createInventory();
  addInventoryItem(inventory, ITEM, quantity);
  return inventory;
};
const total = (inventory, itemId) => inventory.slots.reduce((sum, s) => sum + (s?.itemId === itemId ? s.quantity : 0), 0);
const chestTotal = (chest, itemId) => chest.slots.reduce((sum, s) => sum + (s?.itemId === itemId ? s.quantity : 0), 0);

test('a chest starts empty with the fixed capacity', () => {
  const chest = createRoomChest();
  assert.equal(chest.capacity, ROOM_CHEST_CAPACITY);
  assert.equal(chest.slots.length, ROOM_CHEST_CAPACITY);
  assert.ok(chest.slots.every(slot => slot === null));
});

test('moving items to the chest conserves the total count', () => {
  const inventory = stocked(5), chest = createRoomChest();
  const result = moveToRoomChest(inventory, chest, ITEM, 3);
  assert.equal(result.ok, true);
  assert.equal(total(result.inventory, ITEM) + chestTotal(result.chest, ITEM), 5);
  assert.equal(chestTotal(result.chest, ITEM), 3);
});

test('a failed move leaves both the inventory and the chest untouched', () => {
  const inventory = stocked(2), chest = createRoomChest();
  const before = JSON.stringify([inventory, chest]);
  const result = moveToRoomChest(inventory, chest, ITEM, 9);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'inventario-sem-quantidade');
  assert.equal(JSON.stringify([inventory, chest]), before, 'inputs are never mutated');
});

test('a full chest refuses the move without losing items', () => {
  const inventory = stocked(5);
  const chest = createRoomChest(1);
  chest.slots[0] = { itemId: OTHER, quantity: 99 };
  const result = moveToRoomChest(inventory, chest, ITEM, 5);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bau-cheio');
  assert.equal(total(inventory, ITEM), 5);
});

test('taking items back restores them to the inventory', () => {
  const inventory = stocked(4), chest = createRoomChest();
  const stored = moveToRoomChest(inventory, chest, ITEM, 4);
  const slot = stored.chest.slots.findIndex(s => s?.itemId === ITEM);
  const back = moveFromRoomChest(stored.inventory, stored.chest, slot, 4);
  assert.equal(back.ok, true);
  assert.equal(total(back.inventory, ITEM), 4);
  assert.equal(back.chest.slots[slot], null);
});

test('partial withdrawals keep the rest in the same chest slot', () => {
  const chest = createRoomChest();
  chest.slots[2] = { itemId: ITEM, quantity: 7 };
  const result = moveFromRoomChest(createInventory(), chest, 2, 3);
  assert.equal(result.ok, true);
  assert.deepEqual(result.chest.slots[2], { itemId: ITEM, quantity: 4 });
});

test('invalid items, quantities and empty slots are rejected', () => {
  const inventory = stocked(3), chest = createRoomChest();
  assert.equal(moveToRoomChest(inventory, chest, 'nao-existe', 1).reason, 'item-inexistente');
  assert.equal(moveToRoomChest(inventory, chest, ITEM, 0).reason, 'quantidade-invalida');
  assert.equal(moveToRoomChest(inventory, chest, ITEM, 1.5).reason, 'quantidade-invalida');
  assert.equal(moveFromRoomChest(inventory, chest, 0, 1).reason, 'espaco-vazio');
});
