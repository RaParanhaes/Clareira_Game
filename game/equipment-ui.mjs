import { ARMOR_SPECS, GEAR_BLURBS, GEAR_LABELS, GEAR_PRICES, isArmor, normalizeEquipment } from './equipment.mjs';

export const EQUIPMENT_SLOT_LABELS = Object.freeze({ body: 'Corpo' });
export const GEAR_ITEM_PRESENTATION = Object.freeze({
  shortSword: [GEAR_LABELS.shortSword, 'shortSword'],
  leatherJerkin: [GEAR_LABELS.leatherJerkin, 'leatherJerkin'],
});
export const GEAR_ITEM_USE = Object.freeze({
  shortSword: ['Arma', 'Deixe na barra rápida: causa 3 de dano nos animais, mais que a faca.'],
  leatherJerkin: ['Armadura', 'Vista pelo botão abaixo. Quando vestido, reduz 2 do dano de animais.'],
});

// Texto do botão da ficha do item para armaduras guardadas na mochila.
export function armorButtonFor(itemId, equipment) {
  if (!isArmor(itemId)) return null;
  const slot = ARMOR_SPECS[itemId].slot;
  return { text: equipment?.[slot] ? 'Trocar pelo vestido' : 'Vestir', slot };
}

export function renderEquipmentSlots(container, inventory, onUnequip, doc = container.ownerDocument) {
  const equipment = normalizeEquipment(inventory?.equipment);
  const rows = [];
  for (const [slot, label] of Object.entries(EQUIPMENT_SLOT_LABELS)) {
    const itemId = equipment[slot];
    const row = doc.createElement('div'); row.className = 'equipment-slot'; row.dataset.equipSlot = slot;
    const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('equipment-slot-icon'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    if (itemId) {
      const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `/dev/art/inventory-items.svg#${itemId}`); icon.append(use);
    }
    const text = doc.createElement('span');
    const strong = doc.createElement('strong'); strong.textContent = label;
    const small = doc.createElement('small');
    small.textContent = itemId ? `${GEAR_LABELS[itemId]} · defesa ${ARMOR_SPECS[itemId].defense}` : 'Nada vestido';
    text.append(strong, small);
    row.append(icon, text);
    if (itemId) {
      const button = doc.createElement('button'); button.type = 'button'; button.dataset.unequip = slot;
      button.textContent = 'Tirar'; button.setAttribute('aria-label', `Tirar ${GEAR_LABELS[itemId]}`);
      button.addEventListener('click', () => onUnequip(slot));
      row.append(button);
    }
    rows.push(row);
  }
  container.replaceChildren(...rows);
}

// Linhas da loja "Armas e armaduras". `actionButton` vem do painel do lugar.
export function renderGearShop(fragment, { element, actionButton, formatCoins, balance, state }) {
  for (const [itemId, price] of Object.entries(GEAR_PRICES)) {
    const owned = (state.inventory.slots || []).some(stack => stack?.itemId === itemId)
      || Object.values(state.inventory.equipment || {}).includes(itemId);
    const row = element('div', '', 'lodging-option');
    row.append(element('strong', GEAR_LABELS[itemId]),
      element('small', `${formatCoins(price)} · ${GEAR_BLURBS[itemId]}`),
      actionButton(owned ? 'Já está com você' : 'Comprar', 'lodgeBuyGear', { itemId },
        state.guest || owned || balance(state) < price));
    if (!owned && !state.guest && balance(state) < price) {
      row.append(element('small', `Faltam ${formatCoins(price - balance(state))} para comprar este item.`));
    }
    fragment.append(row);
  }
}
