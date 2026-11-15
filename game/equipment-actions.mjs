import { ARMOR_SPECS, GEAR_LABELS, GEAR_PRICES, isArmor, ownsGear } from './equipment.mjs';
import { addInventoryItem, canAddInventoryItems, createInventory, inventorySnapshot, removeInventoryItem } from './inventory.mjs';
import { CURRENCY_KEYS, formatCoins } from './lodging-catalog.mjs';

// Mutam o inventário recebido e devolvem { ok, reason?, itemId? }. O chamador
// trabalha numa cópia e só confirma depois de salvar.
export function equipItem(inventory, itemId) {
  if (!isArmor(itemId)) return { ok: false, reason: 'not-armor' };
  if (!inventory.slots.some(stack => stack?.itemId === itemId)) return { ok: false, reason: 'missing' };
  const slot = ARMOR_SPECS[itemId].slot;
  const previous = inventory.equipment?.[slot] || null;
  removeInventoryItem(inventory, itemId, 1);
  if (previous) addInventoryItem(inventory, previous, 1);
  inventory.equipment = { ...inventory.equipment, [slot]: itemId };
  return { ok: true, itemId, slot };
}

export function unequipItem(inventory, slot) {
  const itemId = inventory.equipment?.[slot] || null;
  if (!itemId) return { ok: false, reason: 'empty' };
  if (!canAddInventoryItems(inventory, { [itemId]: 1 })) return { ok: false, reason: 'bag-full', itemId };
  addInventoryItem(inventory, itemId, 1);
  inventory.equipment = { ...inventory.equipment, [slot]: null };
  return { ok: true, itemId, slot };
}

// Verificações de compra que não dependem de rede ou carteira.
export function gearPurchaseCheck(inventory, itemId) {
  if (!Object.hasOwn(GEAR_PRICES, itemId)) return { ok: false, message: 'Esse item não está à venda.' };
  if (ownsGear(inventory, itemId)) return { ok: false, message: `Você já tem ${GEAR_LABELS[itemId].toLowerCase()}.` };
  if (!canAddInventoryItems(inventory, { [itemId]: 1 })) return { ok: false, message: 'Libere um espaço no Inventário antes de comprar.' };
  return { ok: true, price: GEAR_PRICES[itemId] };
}

// Compra atômica: `debitAndSave(price, inventoryAfter, inventoryBefore)` debita a carteira e grava o
// inventário (com o item) numa só operação do store. Se falhar, nada foi cobrado e só o item
// comprado sai da memória; o resto do inventário (mudanças concorrentes) não é tocado.
// Ações que mexem no inventário e ficam recusadas enquanto uma compra espera confirmação.
export const GEAR_PENDING_BLOCKED_ACTIONS = Object.freeze(['equipItem', 'unequipItem', 'moveToHotbar', 'moveInventorySlot',
  'selectHotbar', 'chestMove', 'share', 'lodgeSell', 'lodgeBuyGear', 'placeFurniture']);
export function gearPurchasePending(player, actionName) {
  return Boolean(player?.pendingGear) && GEAR_PENDING_BLOCKED_ACTIONS.includes(actionName);
}

// Remove o item comprado onde ele estiver (mochila ou espaço de equipamento).
function takeBackGear(inventory, itemId) {
  if (removeInventoryItem(inventory, itemId, 1)) return;
  for (const [slot, worn] of Object.entries(inventory.equipment || {})) {
    if (worn === itemId) inventory.equipment = { ...inventory.equipment, [slot]: null };
  }
}

export async function purchaseGear({ player, itemId, debitAndSave }) {
  if (player.pendingGear) return { ok: false, message: 'Aguarde a compra anterior terminar.' };
  const check = gearPurchaseCheck(player.inventory, itemId);
  if (!check.ok) return check;
  const price = check.price;
  // O JSON só serve a testes e migração: a queda entre salvar e debitar fica aceita (CLAUDE.md).
  addInventoryItem(player.inventory, itemId, 1);
  player.pendingGear = itemId;
  const after = inventorySnapshot(player.inventory);
  const without = createInventory(after);
  removeInventoryItem(without, itemId, 1);
  try {
    const wallet = await debitAndSave(price, after, inventorySnapshot(without));
    for (const key of CURRENCY_KEYS) player.inventory[key] = wallet[key] || 0;
    return { ok: true, price, message: `Compra concluída: ${GEAR_LABELS[itemId].toLowerCase()} por ${formatCoins(price)}.` };
  } catch (error) {
    takeBackGear(player.inventory, itemId);
    return { ok: false, message: error.message || 'Não consegui concluir a compra; nada foi cobrado.' };
  } finally { player.pendingGear = null; }
}
