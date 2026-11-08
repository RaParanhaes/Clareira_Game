import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, inventorySnapshot } from './inventory.mjs';
import { createInventoryPrediction, applyInventoryCommand } from './inventory-prediction.mjs';

const move = (from, to) => ({type:'action', name:'moveInventorySlot', from, to});
test('consecutive swaps respond immediately and stale snapshots never undo or repeat prediction', () => {
  const base = inventorySnapshot(createInventory({knife:1, wood:3}));
  const prediction = createInventoryPrediction();
  const first = prediction.enqueue(base, move(0, 10));
  const second = prediction.enqueue(first.inventory, move(10, 11));
  assert.equal(second.inventory.slots[11].itemId, base.slots[0].itemId);
  assert.equal(second.inventory.slots[0], null);
  assert.deepEqual(prediction.reconcile(base, 0), second.inventory);
  const server = createInventory(base);
  applyInventoryCommand(server, first.command);
  assert.deepEqual(prediction.reconcile(inventorySnapshot(server), first.command.inventorySeq), second.inventory);
  applyInventoryCommand(server, second.command);
  assert.deepEqual(prediction.reconcile(inventorySnapshot(server), second.command.inventorySeq), second.inventory);
  assert.equal(prediction.pending, 0);
  assert.deepEqual(base, inventorySnapshot(createInventory({knife:1, wood:3})), 'base is never mutated');
});
test('server rejection rolls back the rejected swap and replays only newer actions', () => {
  const base = inventorySnapshot(createInventory({knife:1}));
  const prediction = createInventoryPrediction();
  const first = prediction.enqueue(base, move(0, 10));
  const second = prediction.enqueue(first.inventory, {name:'selectHotbar',slot:4});
  const corrected = prediction.reconcile(base, first.command.inventorySeq);
  assert.deepEqual(corrected.slots, base.slots);
  assert.equal(corrected.selectedSlot, 4);
  assert.equal(prediction.pending, 1);
  prediction.reconcile(corrected, second.command.inventorySeq);
  assert.equal(prediction.pending, 0);
});
test('a stale hotbar snapshot preserves the immediate tool choice; reconnect clears old operations', () => {
  const base = inventorySnapshot(createInventory({knife:1}));
  const prediction = createInventoryPrediction();
  prediction.enqueue(base, {name:'selectHotbar',slot:3});
  assert.equal(prediction.reconcile(base, 0).selectedSlot, 3);
  prediction.reset();
  assert.deepEqual(prediction.reconcile(base), base);
  assert.equal(prediction.enqueue(base,{name:'selectHotbar',slot:99}), null);
});
test('a rejected earlier move cannot make a dependent move swap an unrelated item', () => {
  const base = inventorySnapshot(createInventory({knife:1, wood:2}));
  const prediction = createInventoryPrediction();
  const first = prediction.enqueue(base, move(0, 10));
  const second = prediction.enqueue(first.inventory, move(10, 1));
  const corrected = prediction.reconcile(base, first.command.inventorySeq);
  assert.deepEqual(corrected.slots, base.slots);
  const server = createInventory(base);
  assert.equal(applyInventoryCommand(server, second.command), false);
  assert.deepEqual(inventorySnapshot(server).slots, base.slots);
});
