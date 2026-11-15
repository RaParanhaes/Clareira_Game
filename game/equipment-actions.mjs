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
  return { ok: true, itemId, slot, previous };
}

// Desfaz só o delta de um equipItem/unequipItem já aplicado ao inventário vivo.
export function revertEquipChange(inventory, result, equipping) {
  if (equipping) {
    removeInventoryItem(inventory, result.previous, 1);
    addInventoryItem(inventory, result.itemId, 1);
    inventory.equipment = { ...inventory.equipment, [result.slot]: result.previous || null };
  } else {
    removeInventoryItem(inventory, result.itemId, 1);
    inventory.equipment = { ...inventory.equipment, [result.slot]: result.itemId };
  }
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
const buying = new WeakSet();

// Compra atômica sem item fantasma: a mochila nova é montada num CLONE, gravada junto com o débito
// (`debitAndSave(price, inventoryAfter, inventoryBefore)`) e só depois do commit o item (apenas o delta)
// entra no jogador vivo. Enquanto espera, o jogador não tem o item. Uma compra por vez por jogador.
// O JSON só serve a testes e migração: a queda entre salvar e debitar fica aceita (CLAUDE.md).
// Estorno falhou: o salvo já tem o item, então o vivo também fica com ele (mochila ou corpo).
function keepGear(inventory, itemId) {
  if (canAddInventoryItems(inventory, { [itemId]: 1 }) && !ownsGear(inventory, itemId)) { addInventoryItem(inventory, itemId, 1); return; }
  if (isArmor(itemId) && !ownsGear(inventory, itemId) && !inventory.equipment?.[ARMOR_SPECS[itemId].slot]) {
    inventory.equipment = { ...inventory.equipment, [ARMOR_SPECS[itemId].slot]: itemId };
  }
}

// `runExclusive(job)` enfileira a compra INTEIRA na fila de gravações deste jogador (no servidor,
// `progressWrites`): clone, débito, delta no vivo e eventual estorno rodam num único trabalho, sem
// outra gravação do mesmo jogador no meio. Gravações enfileiradas depois já fotografam o item.
export async function purchaseGear({ player, itemId, debitAndSave, refundAndSave, runExclusive = job => job() }) {
  if (buying.has(player)) return { ok: false, message: 'Aguarde a compra anterior terminar.' };
  buying.add(player);
  try { return await runExclusive(() => buyNow({ player, itemId, debitAndSave, refundAndSave })); }
  finally { buying.delete(player); }
}

async function buyNow({ player, itemId, debitAndSave, refundAndSave }) {
  const check = gearPurchaseCheck(player.inventory, itemId);
  if (!check.ok) return check;
  const price = check.price;
  const before = inventorySnapshot(player.inventory);
  const clone = createInventory(before);
  addInventoryItem(clone, itemId, 1);
  let wallet;
  try { wallet = await debitAndSave(price, inventorySnapshot(clone), before); }
  catch (error) { return { ok: false, message: error.message || 'Não consegui concluir a compra; nada foi cobrado.' }; }
  for (const key of CURRENCY_KEYS) player.inventory[key] = wallet[key] || 0;
  if (!canAddInventoryItems(player.inventory, { [itemId]: 1 }) || ownsGear(player.inventory, itemId)) {
    // A mochila mudou durante a espera e o item não cabe mais. O estorno grava, numa só operação,
    // o crédito e a mochila VIVA (fotografada agora, sem o item).
    try {
      const refunded = await refundAndSave(price, inventorySnapshot(player.inventory));
      for (const key of CURRENCY_KEYS) player.inventory[key] = refunded[key] || 0;
      return { ok: false, refunded: true, message: 'A mochila mudou durante a compra; o pagamento foi devolvido.' };
    } catch (error) {
      process.stderr.write(`Could not refund gear purchase: ${error.message}\n`);
      keepGear(player.inventory, itemId);
      return { ok: false, refunded: false, kept: ownsGear(player.inventory, itemId),
        message: 'Não consegui devolver o pagamento; o item ficou com você.' };
    }
  }
  addInventoryItem(player.inventory, itemId, 1);
  return { ok: true, price, message: `Compra concluída: ${GEAR_LABELS[itemId].toLowerCase()} por ${formatCoins(price)}.` };
}
