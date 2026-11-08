export const AXE_TOOL_SPECS = Object.freeze({
  stoneAxe: Object.freeze({ label:'machado de pedra', durability:210, treeHits:40, logHits:30, sharpnessLoss:2, hitDelay:[2500,4000,6000,8000] }),
  copperAxe: Object.freeze({ label:'machado de cobre', durability:420, treeHits:30, logHits:22, sharpnessLoss:1, hitDelay:[2200,3500,5000,7000] }),
  ironAxe: Object.freeze({ label:'machado de ferro', durability:630, treeHits:24, logHits:18, sharpnessLoss:1, hitDelay:[1800,3000,4500,6000] }),
});

export const PICKAXE_TOOL_SPECS = Object.freeze({
  stonePickaxe: Object.freeze({ label:'picareta de pedra', durability:180, hitsPerOre:12, hitDelay:3500 }),
  copperPickaxe: Object.freeze({ label:'picareta de cobre', durability:360, hitsPerOre:8, hitDelay:3000 }),
  ironPickaxe: Object.freeze({ label:'picareta de ferro', durability:540, hitsPerOre:5, hitDelay:2500 }),
});

export const AXE_TOOL_IDS = Object.freeze(Object.keys(AXE_TOOL_SPECS));
export const PICKAXE_TOOL_IDS = Object.freeze(Object.keys(PICKAXE_TOOL_SPECS));
export const MAX_AXE_DURABILITY = Math.max(...AXE_TOOL_IDS.map(id => AXE_TOOL_SPECS[id].durability));
export const MAX_PICKAXE_DURABILITY = Math.max(...PICKAXE_TOOL_IDS.map(id => PICKAXE_TOOL_SPECS[id].durability));
export const STONE_AXE_DURABILITY = AXE_TOOL_SPECS.stoneAxe.durability;
export const STONE_PICKAXE_DURABILITY = PICKAXE_TOOL_SPECS.stonePickaxe.durability;

export function axeToolFor(inventory) {
  return AXE_TOOL_IDS.find(id => (inventory?.[id] || 0) > 0 || inventory?.slots?.some(stack => stack?.itemId === id)) || null;
}

export function pickaxeToolFor(inventory) {
  return PICKAXE_TOOL_IDS.find(id => (inventory?.[id] || 0) > 0 || inventory?.slots?.some(stack => stack?.itemId === id)) || null;
}

export function axeDurabilityFor(inventory) {
  const tool = axeToolFor(inventory);
  return tool ? AXE_TOOL_SPECS[tool].durability : 0;
}

export function maxAxeDurabilityFor(inventory) {
  return axeDurabilityFor(inventory);
}

export function pickaxeDurabilityFor(inventory) {
  const tool = pickaxeToolFor(inventory);
  return tool ? PICKAXE_TOOL_SPECS[tool].durability : 0;
}

export function maxPickaxeDurabilityFor(inventory) {
  return pickaxeDurabilityFor(inventory);
}

export function axeUpgradeFor(inventory) {
  const current = axeToolFor(inventory);
  const index = current ? AXE_TOOL_IDS.indexOf(current) : -1;
  return index >= 0 ? AXE_TOOL_IDS[index + 1] || null : null;
}

export function pickaxeUpgradeFor(inventory) {
  const current = pickaxeToolFor(inventory);
  const index = current ? PICKAXE_TOOL_IDS.indexOf(current) : -1;
  return index >= 0 ? PICKAXE_TOOL_IDS[index + 1] || null : null;
}
