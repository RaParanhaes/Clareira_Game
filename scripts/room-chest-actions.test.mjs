import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRoomChestMove } from './room-chest-actions.mjs';
import { createRoomChest } from '../game/room-chest.mjs';
import { createInventory, addInventoryItem, INVENTORY_ITEM_KEYS } from '../game/inventory.mjs';

const ITEM = INVENTORY_ITEM_KEYS[0];
const ACTION = 'action-0001';

function fakeStore(chest) {
  const chests = new Map([['chest-1', structuredClone(chest)]]);
  const ledger = new Set();
  const commits = [];
  return {
    chests, ledger, commits,
    loadRoomChest: async id => (chests.has(id) ? structuredClone(chests.get(id)) : null),
    commitRoomChestMove: async args => {
      commits.push(args.actionId);
      if (ledger.has(args.actionId)) return { ok: false, reason: 'acao-repetida' };
      if (JSON.stringify(chests.get(args.chestId).slots) !== JSON.stringify(args.expected.slots)) return { ok: false, reason: 'conflito' };
      chests.set(args.chestId, structuredClone(args.next));
      ledger.add(args.actionId);
      return { ok: true };
    },
  };
}
const playerWith = quantity => {
  const inventory = createInventory();
  addInventoryItem(inventory, ITEM, quantity);
  return { profileId: 'profile-1', inventory };
};
const allowed = () => true;
const near = () => true;
const count = (inventory, id) => inventory.slots.reduce((s, x) => s + (x?.itemId === id ? x.quantity : 0), 0);

test('putting items into a chest moves them out of the inventory and saves the player', async () => {
  const store = fakeStore(createRoomChest());
  const player = playerWith(4);
  const saved = [];
  const result = await applyRoomChestMove({ player, store, canUseChest: allowed, inReach: near,
    message: { actionId: ACTION, chestId: 'chest-1', direction: 'in', itemId: ITEM, quantity: 3 },
    persistPlayer: async p => saved.push(p.inventory) });
  assert.equal(result.ok, true);
  assert.equal(count(player.inventory, ITEM), 1);
  assert.equal(saved.length, 1);
  assert.equal(store.chests.get('chest-1').slots.find(Boolean).quantity, 3);
});

test('a repeated action id is refused and the inventory is not saved again', async () => {
  const store = fakeStore(createRoomChest());
  const player = playerWith(6);
  const message = { actionId: ACTION, chestId: 'chest-1', direction: 'in', itemId: ITEM, quantity: 2 };
  let saves = 0;
  const persistPlayer = async () => { saves += 1; };
  await applyRoomChestMove({ player, store, canUseChest: allowed, inReach: near, message, persistPlayer });
  const again = await applyRoomChestMove({ player, store, canUseChest: allowed, inReach: near, message, persistPlayer });
  assert.equal(again.reason, 'acao-repetida');
  assert.equal(saves, 1);
  assert.equal(count(player.inventory, ITEM), 4);
});

test('no permission or distance is refused before anything is committed', async () => {
  const store = fakeStore(createRoomChest());
  const player = playerWith(2);
  const base = { actionId: ACTION, chestId: 'chest-1', direction: 'in', itemId: ITEM, quantity: 1 };
  const denied = await applyRoomChestMove({ player, store, canUseChest: () => false, inReach: near, message: base, persistPlayer: async () => {} });
  const far = await applyRoomChestMove({ player, store, canUseChest: allowed, inReach: () => false, message: base, persistPlayer: async () => {} });
  assert.equal(denied.reason, 'sem-permissao');
  assert.equal(far.reason, 'longe-demais');
  assert.equal(store.commits.length, 0);
  assert.equal(count(player.inventory, ITEM), 2);
});

test('taking items out of a chest slot returns them to the inventory', async () => {
  const chest = createRoomChest();
  chest.slots[0] = { itemId: ITEM, quantity: 5 };
  const store = fakeStore(chest);
  const player = playerWith(0);
  player.inventory = createInventory();
  const result = await applyRoomChestMove({ player, store, canUseChest: allowed, inReach: near,
    message: { actionId: ACTION, chestId: 'chest-1', direction: 'out', slot: 0, quantity: 2 },
    persistPlayer: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(count(player.inventory, ITEM), 2);
  assert.equal(store.chests.get('chest-1').slots[0].quantity, 3);
});

test('when saving the inventory fails, the chest is put back to its earlier state', async () => {
  const store = fakeStore(createRoomChest());
  const player = playerWith(4);
  const before = structuredClone(player.inventory);
  const result = await applyRoomChestMove({ player, store, canUseChest: allowed, inReach: near,
    message: { actionId: ACTION, chestId: 'chest-1', direction: 'in', itemId: ITEM, quantity: 3 },
    persistPlayer: async () => { throw new Error('disco cheio'); } });
  assert.equal(result.reason, 'nao-salvou');
  assert.deepEqual(player.inventory, before, 'the inventory keeps the items');
  assert.ok(store.chests.get('chest-1').slots.every(slot => slot === null), 'the chest is empty again');
  assert.ok(store.commits.includes(`${ACTION}-undo`), 'the compensation is recorded with its own id');
});

test('malformed messages are rejected without touching storage', async () => {
  const store = fakeStore(createRoomChest());
  const player = playerWith(2);
  const bad = [
    { actionId: 'x', chestId: 'chest-1', direction: 'in', itemId: ITEM, quantity: 1 },
    { actionId: ACTION, chestId: '', direction: 'in', itemId: ITEM, quantity: 1 },
    { actionId: ACTION, chestId: 'chest-1', direction: 'in', itemId: ITEM, quantity: 0 },
    { actionId: ACTION, chestId: 'chest-1', direction: 'sideways', itemId: ITEM, quantity: 1 },
    { actionId: ACTION, chestId: 'nope', direction: 'in', itemId: ITEM, quantity: 1 },
  ];
  for (const message of bad) {
    const result = await applyRoomChestMove({ player, store, canUseChest: allowed, inReach: near, message, persistPlayer: async () => {} });
    assert.equal(result.ok, false);
  }
  assert.equal(store.commits.length, 0);
});
