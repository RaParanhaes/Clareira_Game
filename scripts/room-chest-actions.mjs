// Server-side handling of chest moves. The chest and the player's inventory are
// stored separately, so a move runs in two steps: commit the chest state (locked,
// idempotent, with a ledger row), then persist the inventory. If persisting the
// inventory fails, a compensating move returns the items to the chest's previous
// state, so nothing is duplicated or lost.
import { moveToRoomChest, moveFromRoomChest } from '../game/room-chest.mjs';
import { inventorySnapshot } from '../game/inventory.mjs';

const ACTION_ID = /^[A-Za-z0-9:_-]{8,64}$/;
const isCount = value => Number.isInteger(value) && value > 0;

export async function applyRoomChestMove({ player, message, store, persistPlayer, canUseChest, inReach }) {
  if (!ACTION_ID.test(String(message?.actionId ?? ''))) return { ok: false, reason: 'acao-invalida' };
  if (typeof message.chestId !== 'string' || !message.chestId) return { ok: false, reason: 'bau-invalido' };
  if (!isCount(message.quantity)) return { ok: false, reason: 'quantidade-invalida' };
  if (!['in', 'out'].includes(message.direction)) return { ok: false, reason: 'direcao-invalida' };
  const chest = await store.loadRoomChest(message.chestId);
  if (!chest) return { ok: false, reason: 'bau-inexistente' };
  if (!canUseChest(player, message.chestId)) return { ok: false, reason: 'sem-permissao' };
  if (!inReach(player, message.chestId)) return { ok: false, reason: 'longe-demais' };

  const actionId = message.actionId;
  const pure = message.direction === 'in'
    ? moveToRoomChest(player.inventory, chest, message.itemId, message.quantity)
    : moveFromRoomChest(player.inventory, chest, message.slot, message.quantity);
  if (!pure.ok) return pure;
  const itemId = message.direction === 'in' ? message.itemId : chest.slots[message.slot].itemId;

  const committed = await store.commitRoomChestMove({
    actionId, chestId: message.chestId, profileId: player.profileId, direction: message.direction,
    itemId, quantity: message.quantity, expected: chest, next: pure.chest,
  });
  if (!committed.ok) return committed;

  try {
    await persistPlayer({ ...player, inventory: pure.inventory });
  } catch {
    // Put the items back where they were: a compensating move with its own id.
    await store.commitRoomChestMove({
      actionId: `${actionId}-undo`, chestId: message.chestId, profileId: player.profileId,
      direction: message.direction === 'in' ? 'out' : 'in', itemId, quantity: message.quantity,
      expected: pure.chest, next: chest,
    });
    return { ok: false, reason: 'nao-salvou' };
  }
  player.inventory = pure.inventory;
  return { ok: true, chest: pure.chest, inventory: inventorySnapshot(pure.inventory) };
}
