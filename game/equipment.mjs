import { AXE_TOOL_IDS } from './tool-progression.mjs';

// Armas valem quando são o item selecionado na barra rápida; armaduras valem
// quando estão no espaço de equipamento. O servidor é quem aplica os números.
export const WEAPON_SPECS = Object.freeze({
  knife: Object.freeze({ label: 'faca simples', damage: 1 }),
  shortSword: Object.freeze({ label: 'espada curta', damage: 3 }),
  ...Object.fromEntries(AXE_TOOL_IDS.map(id => [id, Object.freeze({ label: 'machado', damage: 2 })])),
});

export const ARMOR_SPECS = Object.freeze({
  leatherJerkin: Object.freeze({ label: 'gibão de couro', slot: 'body', defense: 2 }),
});

export const EQUIPMENT_SLOTS = Object.freeze(['body']);
export const GEAR_ITEM_IDS = Object.freeze(['shortSword', 'leatherJerkin']);
// Preços em bronzes (100 bronzes = 1 prata).
export const GEAR_PRICES = Object.freeze({ shortSword: 1500, leatherJerkin: 1200 });
export const GEAR_LABELS = Object.freeze({ shortSword: 'Espada curta', leatherJerkin: 'Gibão de couro' });
export const GEAR_BLURBS = Object.freeze({
  shortSword: 'Dano 3 contra animais. Deixe na barra rápida para usar.',
  leatherJerkin: 'Defesa 2. Vista pelo Inventário.',
});

export function isWeapon(itemId) { return Object.hasOwn(WEAPON_SPECS, itemId); }
export function isArmor(itemId) { return Object.hasOwn(ARMOR_SPECS, itemId); }

export function weaponDamageFor(itemId) { return isWeapon(itemId) ? WEAPON_SPECS[itemId].damage : 1; }

export function selectedItemId(inventory) {
  return inventory?.slots?.[inventory.selectedSlot]?.itemId || null;
}

export function weaponDamage(inventory) { return weaponDamageFor(selectedItemId(inventory)); }

// Sem uso ainda: a branch de vida liga isto a playerDefense(player) numa linha.
export function armorDefense(inventory) {
  let total = 0;
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = inventory?.equipment?.[slot];
    if (isArmor(itemId) && ARMOR_SPECS[itemId].slot === slot) total += ARMOR_SPECS[itemId].defense;
  }
  return total;
}

export function normalizeEquipment(value) {
  const equipment = { body: null };
  const body = value?.body;
  if (isArmor(body) && ARMOR_SPECS[body].slot === 'body') equipment.body = body;
  return equipment;
}

export function ownsGear(inventory, itemId) {
  return Boolean(inventory?.slots?.some(stack => stack?.itemId === itemId)
    || Object.values(inventory?.equipment || {}).includes(itemId));
}
