import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR_SPECS, GEAR_PRICES, WEAPON_SPECS, armorDefense, weaponDamage } from './equipment.mjs';
import { equipItem, gearPurchaseCheck, purchaseGear, unequipItem } from './equipment-actions.mjs';
import { INVENTORY_STACK_LIMITS, addInventoryItem, createInventory, inventoryFromRows, inventoryRows, inventorySnapshot, restoreInventory } from './inventory.mjs';
import { huntWildlifeTarget } from './wildlife-hunt.mjs';
import { currencyValue, walletFromValue } from './lodging-catalog.mjs';
import { armorButtonFor } from './equipment-ui.mjs';

test('weapon damage follows the selected hotbar item', () => {
  const inventory = createInventory({ slots: [{ itemId: 'knife', quantity: 1 }, { itemId: 'shortSword', quantity: 1 }, { itemId: 'stoneAxe', quantity: 1 }] });
  assert.equal(WEAPON_SPECS.knife.damage, 1);
  assert.equal(WEAPON_SPECS.shortSword.damage, 3);
  inventory.selectedSlot = 0; assert.equal(weaponDamage(inventory), 1);
  inventory.selectedSlot = 1; assert.equal(weaponDamage(inventory), 3);
  inventory.selectedSlot = 2; assert.equal(weaponDamage(inventory), 2);
  inventory.selectedSlot = 5; assert.equal(weaponDamage(inventory), 1);
});

test('armorDefense reads only the equipped slot, not the bag', () => {
  const inventory = createInventory({ slots: [{ itemId: 'leatherJerkin', quantity: 1 }] });
  assert.equal(armorDefense(inventory), 0);
  assert.equal(equipItem(inventory, 'leatherJerkin').ok, true);
  assert.equal(armorDefense(inventory), ARMOR_SPECS.leatherJerkin.defense);
  assert.equal(inventory.leatherJerkin, 0, 'o item sai da mochila ao vestir');
  assert.equal(unequipItem(inventory, 'body').ok, true);
  assert.equal(armorDefense(inventory), 0);
  assert.equal(inventory.leatherJerkin, 1);
});

test('gear items stack to one and equipment survives snapshot, restore and row round trips', () => {
  assert.equal(INVENTORY_STACK_LIMITS.shortSword, 1);
  assert.equal(INVENTORY_STACK_LIMITS.leatherJerkin, 1);
  const inventory = createInventory({ slots: [{ itemId: 'shortSword', quantity: 1 }, { itemId: 'leatherJerkin', quantity: 1 }], selectedSlot: 0 });
  assert.equal(addInventoryItem(inventory, 'shortSword', 1), 1, 'segunda espada ocupa outro espaço, nunca empilha');
  equipItem(inventory, 'leatherJerkin');
  const snapshot = inventorySnapshot(inventory);
  assert.deepEqual(snapshot.equipment, { body: 'leatherJerkin' });
  assert.deepEqual(inventorySnapshot(createInventory(snapshot)).equipment, { body: 'leatherJerkin' });
  const rows = inventoryRows(inventory);
  assert.ok(rows.some(row => row.itemId === 'inventory:equip:body:leatherJerkin' && row.quantity === 1));
  const fromRows = inventoryFromRows(rows);
  assert.deepEqual(inventorySnapshot(fromRows), snapshot);
  const target = createInventory();
  restoreInventory(target, snapshot);
  assert.deepEqual(target.equipment, { body: 'leatherJerkin' });
  assert.equal(inventoryFromRows(inventoryRows(createInventory())).equipment.body, null);
  assert.equal(createInventory({ equipment: { body: 'shortSword' } }).equipment.body, null, 'arma não vai no corpo');
  assert.equal(inventoryFromRows([{ itemId: 'inventory:equip:body:stoneAxe', quantity: 1 }]).equipment.body, null);
});

test('unequip refuses when the bag is full and keeps the armor worn', () => {
  const full = Array.from({ length: 27 }, () => ({ itemId: 'knife', quantity: 1 }));
  const inventory = createInventory({ slots: full, equipment: { body: 'leatherJerkin' } });
  const result = unequipItem(inventory, 'body');
  assert.deepEqual([result.ok, result.reason], [false, 'bag-full']);
  assert.equal(inventory.equipment.body, 'leatherJerkin');
  assert.equal(equipItem(createInventory(), 'leatherJerkin').reason, 'missing');
  assert.equal(equipItem(createInventory(), 'shortSword').reason, 'not-armor');
  assert.equal(unequipItem(createInventory(), 'body').reason, 'empty');
});

test('purchase check blocks duplicates, including worn items, and unknown goods', () => {
  assert.equal(gearPurchaseCheck(createInventory(), 'shortSword').price, GEAR_PRICES.shortSword);
  assert.equal(gearPurchaseCheck(createInventory(), 'xpPotionI').ok, false);
  assert.equal(gearPurchaseCheck(createInventory({ equipment: { body: 'leatherJerkin' } }), 'leatherJerkin').ok, false);
  assert.equal(gearPurchaseCheck(createInventory({ slots: [{ itemId: 'shortSword', quantity: 1 }] }), 'shortSword').ok, false);
});

// Armazenamento falso com a mesma garantia do store: débito e inventário mudam juntos ou nada muda.
function fakeStore(balance, { failSaveOnce = false } = {}) {
  const state = { balance, saved: null, failSaveOnce };
  state.debitAndSave = async (price, after) => {
    if (state.balance < price) throw new Error('Saldo insuficiente.');
    if (state.failSaveOnce) { state.failSaveOnce = false; throw new Error('Queda simulada entre débito e gravação.'); }
    state.balance -= price; state.saved = after;
    return walletFromValue(state.balance);
  };
  return state;
}

test('purchaseGear delivers and charges once; a crash charges nothing and removes only the bought item', async () => {
  const store = fakeStore(2000);
  const player = { accountId: 'a', inventory: createInventory() };
  const bought = await purchaseGear({ player, itemId: 'leatherJerkin', debitAndSave: store.debitAndSave });
  assert.equal(bought.ok, true);
  assert.match(bought.message, /gibão de couro/);
  assert.equal(player.inventory.leatherJerkin, 1);
  assert.equal(currencyValue(player.inventory), 800);
  assert.equal(store.saved.slots.some(stack => stack?.itemId === 'leatherJerkin'), true);

  const crashing = fakeStore(2000, { failSaveOnce: true });
  const buyer = { accountId: 'b', inventory: createInventory({ slots: [{ itemId: 'knife', quantity: 1 }], gold: 0 }) };
  const during = addInventoryItem; // mudança concorrente simulada durante a compra
  let result;
  const pending = purchaseGear({ player: buyer, itemId: 'shortSword', debitAndSave: async (...args) => {
    during(buyer.inventory, 'stone', 4);
    return crashing.debitAndSave(...args);
  } });
  result = await pending;
  assert.equal(result.ok, false);
  assert.equal(crashing.balance, 2000, 'nada foi cobrado');
  assert.equal(buyer.inventory.shortSword, 0);
  assert.equal(buyer.inventory.stone, 4, 'a mudança concorrente é preservada');
  assert.equal(buyer.inventory.knife, 1);
  const retry = await purchaseGear({ player: buyer, itemId: 'shortSword', debitAndSave: crashing.debitAndSave });
  assert.equal(retry.ok, true);
  assert.equal(crashing.balance, 500);

  const poor = { accountId: 'c', inventory: createInventory() };
  const refused = await purchaseGear({ player: poor, itemId: 'shortSword', debitAndSave: fakeStore(10).debitAndSave });
  assert.deepEqual([refused.ok, refused.message, poor.inventory.shortSword], [false, 'Saldo insuficiente.', 0]);
});

test('a second purchase while the first is in flight is refused as already owned', async () => {
  const store = fakeStore(5000);
  const player = { accountId: 'd', inventory: createInventory() };
  const first = purchaseGear({ player, itemId: 'shortSword', debitAndSave: store.debitAndSave });
  const second = await purchaseGear({ player, itemId: 'shortSword', debitAndSave: store.debitAndSave });
  assert.equal(second.ok, false);
  assert.equal((await first).ok, true);
  assert.equal(store.balance, 3500);
});

test('JSON storage saves the item first, debits second, and never charges without delivering', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const os = await import('node:os'); const path = await import('node:path');
  const { createStorageAdapter } = await import('../database/storage.mjs');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-gear-store-'));
  const storage = createStorageAdapter({ directory });
  try {
    const account = await storage.accounts.register({ username: 'GearStore', password: 'gear-store-test-password' });
    const id = account.profile.id;
    await storage.creditWallet(id, 1300);
    const owner = { accountId: id, inventory: createInventory() };
    const ok = await purchaseGear({ player: owner, itemId: 'leatherJerkin', debitAndSave: (price, after, before) => storage.debitWalletAndSaveProgress(id, price, after, before) });
    assert.equal(ok.ok, true);
    let session = await storage.accounts.getSession(account.token);
    assert.equal(session.profile.inventory.leatherJerkin, 1);
    assert.equal(currencyValue(session.profile.inventory), 100);
    // Saldo insuficiente: o item gravado antes do débito é retirado de novo.
    const broke = await purchaseGear({ player: owner, itemId: 'shortSword', debitAndSave: (price, after, before) => storage.debitWalletAndSaveProgress(id, price, after, before) });
    assert.equal(broke.ok, false);
    session = await storage.accounts.getSession(account.token);
    assert.equal(session.profile.inventory.shortSword, 0);
    assert.equal(session.profile.inventory.leatherJerkin, 1);
    assert.equal(currencyValue(session.profile.inventory), 100);
  } finally { await storage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('armor button text depends on whether the slot is occupied', () => {
  assert.equal(armorButtonFor('leatherJerkin', { body: null }).text, 'Vestir');
  assert.equal(armorButtonFor('leatherJerkin', { body: 'leatherJerkin' }).text, 'Trocar pelo vestido');
  assert.equal(armorButtonFor('shortSword', {}), null);
});

test('hunting accepts the short sword and hits for 3', async () => {
  const mk = weapon => ({ inventory: createInventory({ slots: [{ itemId: weapon, quantity: 1 }], selectedSlot: 0 }), position: { x: 0, y: 0 }, dimensionId: 'surface' });
  const animal = () => ({ id: 'w1', speciesId: 'hare', dimensionId: 'surface', x: 0.5, y: 0, health: 10, sheltered: false });
  const { WILDLIFE_BY_ID } = await import('./wildlife.mjs');
  const speciesId = [...WILDLIFE_BY_ID.keys()][0];
  const sword = animal(); sword.speciesId = speciesId; sword.health = 50;
  const hit = await huntWildlifeTarget({ player: mk('shortSword'), animal: sword, population: new Map([[sword.id, sword]]) });
  assert.equal(hit.status, 'injured');
  assert.equal(hit.damage, 3);
  const knife = animal(); knife.speciesId = speciesId; knife.health = 50;
  assert.equal((await huntWildlifeTarget({ player: mk('knife'), animal: knife, population: new Map([[knife.id, knife]]) })).damage, 1);
  const stone = animal(); stone.speciesId = speciesId; stone.health = 50;
  assert.equal((await huntWildlifeTarget({ player: mk('stone'), animal: stone, population: new Map([[stone.id, stone]]) })).status, 'no-tool');
});
