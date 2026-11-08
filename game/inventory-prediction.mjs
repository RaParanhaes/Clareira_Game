import { createInventory, inventorySnapshot, swapInventorySlots, swapInventorySlotToHotbar } from './inventory.mjs';

export const INVENTORY_ACTIONS = new Set(['selectHotbar', 'moveInventorySlot', 'moveToHotbar']);
export function applyInventoryCommand(inventory, command) {
  if (command.expectedSlots && (!Array.isArray(command.expectedSlots) || command.expectedSlots.length > 2
      || !command.expectedSlots.every(entry => Number.isSafeInteger(entry?.slot) && entry.slot >= 0 && entry.slot < inventory.slots.length
        && (inventory.slots[entry.slot]?.itemId || null) === (entry.stack?.itemId || null)
        && (inventory.slots[entry.slot]?.quantity || 0) === (entry.stack?.quantity || 0)))) return false;
  if (command.name === 'selectHotbar') {
    if (!Number.isSafeInteger(command.slot) || command.slot < 0 || command.slot > 8) return false;
    inventory.selectedSlot = command.slot;
    return true;
  }
  if (command.name === 'moveInventorySlot') {
    if (!swapInventorySlots(inventory, command.from, command.to)) return false;
    if (command.equip === true && command.to < 9) inventory.selectedSlot = command.to;
    return true;
  }
  if (command.name === 'moveToHotbar') return swapInventorySlotToHotbar(inventory, command.slot);
  return false;
}

// Always replay over the latest authoritative base, never over a prior prediction.
export function createInventoryPrediction() {
  let sequence = 0;
  let pending = [];
  return {
    enqueue(inventory, command) {
      if (pending.length >= 64) return null;
      const candidate = createInventory(inventory);
      if (!applyInventoryCommand(candidate, command)) return null;
      const slots = command.name === 'moveInventorySlot' ? [command.from, command.to]
        : command.name === 'moveToHotbar' ? [command.slot, inventory.selectedSlot] : [];
      const outgoing = { ...command, inventorySeq: ++sequence,
        ...(slots.length ? { expectedSlots: slots.map(slot => ({slot, stack: inventory.slots[slot] ? {...inventory.slots[slot]} : null})) } : {}) };
      pending.push(outgoing);
      return { command: outgoing, inventory: inventorySnapshot(candidate) };
    },
    reconcile(inventory, acknowledged = 0) {
      pending = pending.filter(command => command.inventorySeq > acknowledged);
      sequence = Math.max(sequence, acknowledged);
      const predicted = createInventory(inventory);
      for (const command of pending) applyInventoryCommand(predicted, command);
      return inventorySnapshot(predicted);
    },
    cancel(seq) { pending = pending.filter(command => command.inventorySeq !== seq); },
    reset() { sequence = 0; pending = []; },
    get pending() { return pending.length; },
  };
}
