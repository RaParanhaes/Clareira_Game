import { DEFAULT_ATTRIBUTES, XP_POTIONS, normalizeProgression, storageCapacityForLevel } from './progression.mjs';
import { CURRENCY_KEYS, CURRENCY_QUANTITY_LIMITS } from './lodging-catalog.mjs';
export const BAG_SLOT_COUNT = 27;
export const MAX_BAG_SLOT_COUNT = 117;
export const HOTBAR_SLOT_COUNT = 9;
import { AXE_TOOL_IDS, PICKAXE_TOOL_IDS, STONE_AXE_DURABILITY, STONE_PICKAXE_DURABILITY,
  axeDurabilityFor, pickaxeDurabilityFor, maxAxeDurabilityFor, maxPickaxeDurabilityFor } from './tool-progression.mjs';
export { STONE_AXE_DURABILITY, STONE_PICKAXE_DURABILITY };

export const INVENTORY_ITEM_KEYS = Object.freeze([
  'wood', 'timber', 'sturdyBranch', 'stone', 'berries', 'apples', 'leaves', 'vines', 'plank',
  'copperOre', 'ironOre', 'coal', 'charcoal', 'copperIngot', 'ironIngot',
  'knife', ...AXE_TOOL_IDS, ...PICKAXE_TOOL_IDS, 'rawMeat', 'hide', 'bone', 'feather', 'venom', 'glowDust', 'cinderShard', 'emberCore',
  'xpPotionI', 'xpPotionII', 'xpPotionIII', 'xpPotionIV',
]);

export const INVENTORY_STACK_LIMITS = Object.freeze({
  wood: 99,
  timber: 99,
  sturdyBranch: 20,
  stone: 50,
  berries: 20,
  apples: 20,
  leaves: 20,
  vines: 20,
  plank: 20,
  copperOre: 50,
  ironOre: 50,
  coal: 50,
  charcoal: 50,
  copperIngot: 20,
  ironIngot: 20,
  knife: 1,
  stoneAxe: 1,
  copperAxe: 1,
  ironAxe: 1,
  stonePickaxe: 1,
  copperPickaxe: 1,
  ironPickaxe: 1,
  rawMeat: 20,
  hide: 20,
  bone: 20,
  feather: 20,
  venom: 20,
  glowDust: 20,
  cinderShard: 2,
  emberCore: 1,
  xpPotionI: 3,
  xpPotionII: 2,
  xpPotionIII: 1,
  xpPotionIV: 1,
});

const CURRENCIES = CURRENCY_KEYS;
const STACKABLE_ITEMS = INVENTORY_ITEM_KEYS.filter(item => INVENTORY_STACK_LIMITS[item] > 1);

function emptySlots(length = BAG_SLOT_COUNT) {
  return Array.from({ length: Math.max(BAG_SLOT_COUNT, Math.min(MAX_BAG_SLOT_COUNT, length)) }, () => null);
}

function validQuantity(value) {
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(999, value)) : 0;
}

function validCurrencyQuantity(value, key) {
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(CURRENCY_QUANTITY_LIMITS[key], value)) : 0;
}

function validSharpness(value) {
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function addToSlots(slots, itemId, requested, { enforceCarryLimit = true } = {}) {
  const limit = INVENTORY_STACK_LIMITS[itemId];
  if (!limit || requested <= 0) return 0;
  const requestedQuantity = Math.min(999, Math.floor(requested));
  const maximumCarried = XP_POTIONS[itemId]?.maximumCarried;
  const allowedQuantity = enforceCarryLimit && Number.isSafeInteger(maximumCarried)
    ? Math.min(requestedQuantity, Math.max(0, maximumCarried - countInSlots(slots, itemId)))
    : requestedQuantity;
  let remaining = allowedQuantity;
  for (const stack of slots) {
    if (stack?.itemId !== itemId || stack.quantity >= limit) continue;
    const added = Math.min(remaining, limit - stack.quantity);
    stack.quantity += added;
    remaining -= added;
    if (!remaining) return allowedQuantity - remaining;
  }
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    if (slots[index]) continue;
    const added = Math.min(remaining, limit);
    slots[index] = { itemId, quantity: added };
    remaining -= added;
  }
  return allowedQuantity - remaining;
}

function takeFromSlots(slots, itemId, requested) {
  let remaining = Math.max(0, Math.floor(requested));
  for (let index = slots.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const stack = slots[index];
    if (stack?.itemId !== itemId) continue;
    const removed = Math.min(remaining, stack.quantity);
    stack.quantity -= removed;
    remaining -= removed;
    if (!stack.quantity) slots[index] = null;
  }
  return Math.max(0, Math.floor(requested)) - remaining;
}

function normalizeSavedSlots(value, capacity = BAG_SLOT_COUNT) {
  const slots = emptySlots(capacity);
  if (!Array.isArray(value)) return null;
  for (let index = 0; index < Math.min(slots.length, value.length); index += 1) {
    const stack = value[index];
    if (!stack) continue;
    const legacyFirewood = stack.itemId === 'firewood';
    const itemId = legacyFirewood ? 'wood' : stack.itemId;
    if (!INVENTORY_ITEM_KEYS.includes(itemId)) continue;
    const quantity = validQuantity(stack.quantity);
    const limit = INVENTORY_STACK_LIMITS[itemId];
    if (!quantity || quantity > (legacyFirewood ? 20 : limit)) continue;
    slots[index] = { itemId, quantity };
  }
  return slots;
}

function slotsFromLegacy(value, capacity = BAG_SLOT_COUNT) {
  const slots = emptySlots(capacity);
  // Keep the starting knife in the first quick slot and put the axe in the next slot if available.
  const preferredItemOrder = ['knife', ...AXE_TOOL_IDS, ...PICKAXE_TOOL_IDS];
  const preferredItems = new Set(preferredItemOrder);
  const legacyItemOrder = [...preferredItemOrder, ...INVENTORY_ITEM_KEYS.filter(itemId => !preferredItems.has(itemId))];
  for (const itemId of legacyItemOrder) {
    const legacyOptions = XP_POTIONS[itemId] ? { enforceCarryLimit: false } : undefined;
    if (itemId === 'wood') {
      addToSlots(slots, 'wood', validQuantity(value?.wood));
      addToSlots(slots, 'wood', validQuantity(value?.firewood));
    } else addToSlots(slots, itemId, validQuantity(value?.[itemId]), legacyOptions);
  }
  return slots;
}

function countInSlots(slots, itemId) {
  return slots.reduce((total, stack) => total + (stack?.itemId === itemId ? stack.quantity : 0), 0);
}

export function createInventory(value = {}) {
  const progression = normalizeProgression(value);
  const capacity = storageCapacityForLevel(progression.level);
  const slots = normalizeSavedSlots(value.slots, capacity) || slotsFromLegacy(value, capacity);
  if (Array.isArray(value.slots)) {
    const savedFirewoodSlots = value.slots.reduce((total, stack) => total + (stack?.itemId === 'firewood' ? validQuantity(stack.quantity) : 0), 0);
    const looseLegacyFirewood = Math.max(0, validQuantity(value.firewood) - savedFirewoodSlots);
    if (looseLegacyFirewood) addToSlots(slots, 'wood', looseLegacyFirewood);
  }
  const inventory = {
    slots,
    level: progression.level, xp: progression.xp, attributePoints: progression.attributePoints, skillPoints: progression.skillPoints,
    attributes: { ...DEFAULT_ATTRIBUTES, ...progression.attributes },
    learnedAbilities: [...progression.learnedAbilities],
    selectedSlot: Number.isSafeInteger(value.selectedSlot)
      ? Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, value.selectedSlot)) : 0,
    axeSharpness: validSharpness(value.axeSharpness),
    axeDurability: Number.isSafeInteger(value.axeDurability)
      ? Math.max(0, Math.min(maxAxeDurabilityFor(Object.fromEntries(AXE_TOOL_IDS.map(id => [id, countInSlots(slots, id)]))), value.axeDurability))
      : axeDurabilityFor(Object.fromEntries(AXE_TOOL_IDS.map(id => [id, countInSlots(slots, id)]))),
    pickaxeDurability: Number.isSafeInteger(value.pickaxeDurability)
      ? Math.max(0, Math.min(maxPickaxeDurabilityFor(Object.fromEntries(PICKAXE_TOOL_IDS.map(id => [id, countInSlots(slots, id)]))), value.pickaxeDurability))
      : pickaxeDurabilityFor(Object.fromEntries(PICKAXE_TOOL_IDS.map(id => [id, countInSlots(slots, id)]))),
    gold: validCurrencyQuantity(value.gold, 'gold'),
    silver: validCurrencyQuantity(value.silver, 'silver'),
    bronze: validCurrencyQuantity(value.bronze, 'bronze'),
  };
  for (const itemId of INVENTORY_ITEM_KEYS) {
    Object.defineProperty(inventory, itemId, {
      enumerable: true,
      get() { return countInSlots(this.slots, itemId); },
      set(quantity) {
        const next = validQuantity(quantity);
        const current = countInSlots(this.slots, itemId);
        if (next < current) takeFromSlots(this.slots, itemId, current - next);
        else if (next > current) addToSlots(this.slots, itemId, next - current);
      },
    });
  }
  return inventory;
}

export function inventorySnapshot(inventory) {
  const progression = normalizeProgression(inventory);
  const slotCounts = Object.fromEntries(INVENTORY_ITEM_KEYS.map(itemId => [itemId, 0]));
  if (Array.isArray(inventory.slots)) {
    for (const stack of inventory.slots) {
      if (stack && Object.hasOwn(slotCounts, stack.itemId)) slotCounts[stack.itemId] += stack.quantity;
    }
  } else {
    for (const itemId of INVENTORY_ITEM_KEYS) slotCounts[itemId] = inventory[itemId] || 0;
  }
  const maxAxeDurability = maxAxeDurabilityFor(slotCounts);
  const maxPickaxeDurability = maxPickaxeDurabilityFor(slotCounts);
  const capacity = storageCapacityForLevel(progression.level);
  return {
    ...slotCounts,
    axeSharpness: validSharpness(inventory.axeSharpness),
    axeDurability: Number.isSafeInteger(inventory.axeDurability)
      ? Math.max(0, Math.min(maxAxeDurability, inventory.axeDurability)) : 0,
    pickaxeDurability: Number.isSafeInteger(inventory.pickaxeDurability)
      ? Math.max(0, Math.min(maxPickaxeDurability, inventory.pickaxeDurability)) : 0,
    gold: validCurrencyQuantity(inventory.gold, 'gold'),
    silver: validCurrencyQuantity(inventory.silver, 'silver'),
    bronze: validCurrencyQuantity(inventory.bronze, 'bronze'),
    selectedSlot: Number.isSafeInteger(inventory.selectedSlot)
      ? Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, inventory.selectedSlot)) : 0,
    slots: normalizeSavedSlots(inventory.slots, capacity) || emptySlots(capacity),
    level: progression.level,
    xp: progression.xp,
    attributePoints: progression.attributePoints,
    skillPoints: progression.skillPoints,
    attributes: progression.attributes,
    learnedAbilities: progression.learnedAbilities,
  };
}

export function restoreInventory(inventory, value) {
  const restored = createInventory(value);
  inventory.slots = restored.slots;
  inventory.selectedSlot = restored.selectedSlot;
  inventory.axeSharpness = restored.axeSharpness;
  inventory.axeDurability = restored.axeDurability;
  inventory.pickaxeDurability = restored.pickaxeDurability;
  inventory.level = restored.level; inventory.xp = restored.xp;
  inventory.attributePoints = restored.attributePoints; inventory.skillPoints = restored.skillPoints;
  inventory.attributes = { ...restored.attributes };
  inventory.learnedAbilities = [...restored.learnedAbilities];
  for (const key of CURRENCIES) inventory[key] = restored[key];
  return inventory;
}

export function addInventoryItem(inventory, itemId, quantity = 1) {
  if (!INVENTORY_ITEM_KEYS.includes(itemId)) return 0;
  return addToSlots(inventory.slots, itemId, Math.max(0, Math.floor(quantity)));
}

export function removeInventoryItem(inventory, itemId, quantity = 1) {
  if (!INVENTORY_ITEM_KEYS.includes(itemId)) return 0;
  return takeFromSlots(inventory.slots, itemId, Math.max(0, Math.floor(quantity)));
}

export function canAddInventoryItem(inventory, itemId, quantity = 1) {
  const slots = inventory.slots.map(stack => stack ? { ...stack } : null);
  return addToSlots(slots, itemId, Math.max(0, Math.floor(quantity))) === Math.max(0, Math.floor(quantity));
}

export function canAddInventoryItems(inventory, items) {
  const slots = inventory.slots.map(stack => stack ? { ...stack } : null);
  for (const [itemId, quantity] of Object.entries(items || {})) {
    if (!INVENTORY_ITEM_KEYS.includes(itemId)
        || addToSlots(slots, itemId, Math.max(0, Math.floor(quantity))) !== Math.max(0, Math.floor(quantity))) return false;
  }
  return true;
}

export function selectedInventoryItem(inventory) {
  return inventory.slots[inventory.selectedSlot]?.itemId || null;
}

export function findInventorySlot(inventory, itemId) {
  return inventory.slots.findIndex(stack => stack?.itemId === itemId);
}

export function swapInventorySlotToHotbar(inventory, sourceSlot) {
  if (!Number.isSafeInteger(sourceSlot) || sourceSlot < HOTBAR_SLOT_COUNT || sourceSlot >= inventory.slots.length) return false;
  const selected = inventory.selectedSlot;
  [inventory.slots[selected], inventory.slots[sourceSlot]] = [inventory.slots[sourceSlot], inventory.slots[selected]];
  return true;
}

export function swapInventorySlots(inventory, fromSlot, toSlot) {
  if (!Number.isSafeInteger(fromSlot) || !Number.isSafeInteger(toSlot)
      || fromSlot < 0 || fromSlot >= inventory.slots.length || toSlot < 0 || toSlot >= inventory.slots.length
      || fromSlot === toSlot) return false;
  [inventory.slots[fromSlot], inventory.slots[toSlot]] = [inventory.slots[toSlot], inventory.slots[fromSlot]];
  return true;
}

export function inventoryRows(inventory) {
  const rows = [];
  for (const [slot, stack] of inventorySnapshot(inventory).slots.entries()) {
    if (stack) rows.push({ itemId: `slot:${slot}:${stack.itemId}`, quantity: stack.quantity });
  }
  rows.push({ itemId: 'inventory:selectedSlot', quantity: inventory.selectedSlot });
  rows.push({ itemId: 'inventory:axeSharpness', quantity: inventory.axeSharpness });
  rows.push({ itemId: 'inventory:axeDurability', quantity: inventory.axeDurability });
  rows.push({ itemId: 'inventory:pickaxeDurability', quantity: inventory.pickaxeDurability });
  rows.push({ itemId: 'inventory:level', quantity: inventory.level });
  rows.push({ itemId: 'inventory:xp', quantity: inventory.xp });
  rows.push({ itemId: 'inventory:attributePoints', quantity: inventory.attributePoints });
  rows.push({ itemId: 'inventory:skillPoints', quantity: inventory.skillPoints });
  for (const [key, value] of Object.entries(inventory.attributes || {})) rows.push({ itemId: `inventory:attribute:${key}`, quantity: value });
  for (const abilityId of inventory.learnedAbilities || []) rows.push({ itemId: `inventory:ability:${abilityId}`, quantity: 1 });
  return rows;
}

export function inventoryFromRows(rows, fallback = {}) {
  const values = { ...fallback };
  const slots = emptySlots(MAX_BAG_SLOT_COUNT);
  // Saved metadata distinguishes an explicitly empty bag from legacy rows.
  let hasSlots = (rows || []).some(row => row.itemId === 'inventory:selectedSlot');
  for (const row of rows || []) {
    if (typeof row.itemId === 'string') {
      const match = /^slot:(\d+):([A-Za-z][A-Za-z0-9]*)$/.exec(row.itemId);
      if (match) {
        const slot = Number(match[1]);
        const legacyFirewood = match[2] === 'firewood';
        const itemId = legacyFirewood ? 'wood' : match[2];
        const quantity = validQuantity(Number(row.quantity));
        if (slot >= 0 && slot < MAX_BAG_SLOT_COUNT && INVENTORY_ITEM_KEYS.includes(itemId)
            && quantity > 0 && quantity <= (legacyFirewood ? 20 : INVENTORY_STACK_LIMITS[itemId])) {
          slots[slot] = { itemId: legacyFirewood ? 'firewood' : itemId, quantity };
          hasSlots = true;
        }
      } else if (row.itemId === 'inventory:selectedSlot') values.selectedSlot = Number(row.quantity);
      else if (row.itemId === 'inventory:axeSharpness') values.axeSharpness = Number(row.quantity);
      else if (row.itemId === 'inventory:axeDurability') values.axeDurability = Number(row.quantity);
      else if (row.itemId === 'inventory:pickaxeDurability') values.pickaxeDurability = Number(row.quantity);
      else if (row.itemId === 'inventory:level') values.level = Number(row.quantity);
      else if (row.itemId === 'inventory:xp') values.xp = Number(row.quantity);
      else if (row.itemId === 'inventory:attributePoints') values.attributePoints = Number(row.quantity);
      else if (row.itemId === 'inventory:skillPoints') values.skillPoints = Number(row.quantity);
      else if (/^inventory:ability:[A-Za-z][A-Za-z0-9]*$/.test(row.itemId) && Number(row.quantity) > 0) {
        values.learnedAbilities ||= []; values.learnedAbilities.push(row.itemId.slice('inventory:ability:'.length));
      } else if (/^inventory:attribute:(force|attack|defense|agility|magic|speed)$/.test(row.itemId)) {
        values.attributes ||= {}; values.attributes[row.itemId.slice('inventory:attribute:'.length)] = Number(row.quantity);
      } else if (CURRENCIES.includes(row.itemId)) values[row.itemId] = validCurrencyQuantity(Number(row.quantity), row.itemId);
      else values[row.itemId] = Number(row.quantity);
    }
  }
  if (hasSlots) values.slots = slots;
  return createInventory(values);
}
