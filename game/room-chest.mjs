// Per-room chest storage. Pure transfer rules: every operation works on copies
// and returns either the two new states or a reason, so a failed move never
// leaves an item duplicated or lost. Persistence lives in the server store.
import { addInventoryItem, removeInventoryItem, INVENTORY_ITEM_KEYS } from './inventory.mjs';

export const ROOM_CHEST_CAPACITY = 12;
export const ROOM_CHEST_STACK_LIMIT = 99;

export function createRoomChest(capacity = ROOM_CHEST_CAPACITY) {
  return { capacity, slots: Array.from({ length: capacity }, () => null) };
}

const copyChest = chest => ({ ...chest, slots: chest.slots.map(stack => (stack ? { ...stack } : null)) });
const copyInventory = inventory => structuredClone(inventory);
const wholeQuantity = quantity => Number.isInteger(quantity) && quantity > 0;

// Fills matching stacks first, then empty slots. Returns how many were stored.
function addToChest(chest, itemId, quantity, stackLimit) {
  let remaining = quantity;
  for (const stack of chest.slots) {
    if (remaining <= 0) break;
    if (stack && stack.itemId === itemId && stack.quantity < stackLimit) {
      const room = stackLimit - stack.quantity, add = Math.min(room, remaining);
      stack.quantity += add; remaining -= add;
    }
  }
  for (let index = 0; index < chest.slots.length && remaining > 0; index++) {
    if (chest.slots[index]) continue;
    const add = Math.min(stackLimit, remaining);
    chest.slots[index] = { itemId, quantity: add }; remaining -= add;
  }
  return quantity - remaining;
}

export function moveToRoomChest(inventory, chest, itemId, quantity, stackLimit = ROOM_CHEST_STACK_LIMIT) {
  if (!INVENTORY_ITEM_KEYS.includes(itemId)) return { ok: false, reason: 'item-inexistente' };
  if (!wholeQuantity(quantity)) return { ok: false, reason: 'quantidade-invalida' };
  const nextInventory = copyInventory(inventory), nextChest = copyChest(chest);
  if (removeInventoryItem(nextInventory, itemId, quantity) !== quantity) return { ok: false, reason: 'inventario-sem-quantidade' };
  if (addToChest(nextChest, itemId, quantity, stackLimit) !== quantity) return { ok: false, reason: 'bau-cheio' };
  return { ok: true, inventory: nextInventory, chest: nextChest };
}

export function moveFromRoomChest(inventory, chest, slot, quantity) {
  const stack = Number.isInteger(slot) ? chest.slots[slot] : null;
  if (!stack) return { ok: false, reason: 'espaco-vazio' };
  if (!wholeQuantity(quantity) || quantity > stack.quantity) return { ok: false, reason: 'quantidade-invalida' };
  const nextInventory = copyInventory(inventory), nextChest = copyChest(chest);
  if (addInventoryItem(nextInventory, stack.itemId, quantity) !== quantity) return { ok: false, reason: 'inventario-cheio' };
  const left = stack.quantity - quantity;
  nextChest.slots[slot] = left > 0 ? { itemId: stack.itemId, quantity: left } : null;
  return { ok: true, inventory: nextInventory, chest: nextChest };
}
