import { ARMOR_SPECS, GEAR_LABELS, GEAR_PRICES, isArmor, ownsGear } from './equipment.mjs';
import { addInventoryItem, canAddInventoryItems, inventorySnapshot, removeInventoryItem, restoreInventory } from './inventory.mjs';
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

// Compra com débito na carteira, gravação e estorno se a gravação falhar
// (mesmo padrão de lodgeBuyTool). Devolve { ok, message, refunded? }.
export async function purchaseGear({ player, itemId, storage, persist }) {
  const check = gearPurchaseCheck(player.inventory, itemId);
  if (!check.ok) return check;
  const price = check.price;
  let wallet;
  try { wallet = await storage.debitWallet(player.accountId, price); }
  catch (error) { return { ok: false, message: error.message || 'Não consegui concluir a compra.' }; }
  const before = inventorySnapshot(player.inventory);
  addInventoryItem(player.inventory, itemId, 1);
  for (const key of CURRENCY_KEYS) player.inventory[key] = wallet[key] || 0;
  try {
    await persist(player);
    return { ok: true, price, message: `Compra concluída: ${GEAR_LABELS[itemId].toLowerCase()} por ${formatCoins(price)}.` };
  } catch (error) {
    restoreInventory(player.inventory, before);
    let refunded = false;
    try {
      const wallet2 = await storage.creditWallet(player.accountId, price);
      for (const key of CURRENCY_KEYS) player.inventory[key] = wallet2[key] || 0;
      await persist(player);
      refunded = true;
    } catch (refundError) { process.stderr.write(`Could not refund failed gear purchase: ${refundError.message}\n`); }
    return { ok: false, refunded, message: error.message || 'Não consegui salvar o equipamento; o pagamento foi devolvido.' };
  }
}
