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

function fakeStorage(balance) {
  const state = { balance, debits: 0, credits: 0 };
  return Object.assign(state, {
    async debitWallet(_id, amount) { if (state.balance < amount) throw new Error('Saldo insuficiente.'); state.balance -= amount; state.debits++; return walletFromValue(state.balance); },
    async creditWallet(_id, amount) { state.balance += amount; state.credits++; return walletFromValue(state.balance); },
  });
}

test('purchaseGear debits, saves and delivers; a failed save refunds and removes the item', async () => {
  const storage = fakeStorage(2000);
  const player = { accountId: 'a', inventory: createInventory() };
  const bought = await purchaseGear({ player, itemId: 'leatherJerkin', storage, persist: async () => {} });
  assert.equal(bought.ok, true);
  assert.match(bought.message, /gibão de couro/);
  assert.equal(player.inventory.leatherJerkin, 1);
  assert.equal(currencyValue(player.inventory), 800);

  const failing = fakeStorage(2000), buyer = { accountId: 'b', inventory: createInventory() };
  let calls = 0;
  const result = await purchaseGear({ player: buyer, itemId: 'shortSword', storage: failing,
    persist: async () => { calls += 1; if (calls === 1) throw new Error('Disco cheio.'); } });
  assert.equal(result.ok, false);
  assert.equal(result.refunded, true);
  assert.equal(buyer.inventory.shortSword, 0);
  assert.equal(failing.balance, 2000);
  assert.equal(currencyValue(buyer.inventory), 2000);

  const poor = await purchaseGear({ player: { accountId: 'c', inventory: createInventory() }, itemId: 'shortSword', storage: fakeStorage(10), persist: async () => {} });
  assert.deepEqual([poor.ok, poor.message], [false, 'Saldo insuficiente.']);
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
