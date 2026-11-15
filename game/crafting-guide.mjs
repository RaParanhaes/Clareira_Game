// Guia de fabricação: a partir do inventário, diz o próximo passo e quanto
// falta para cada receita de ferramenta. É só leitura e pura; o servidor
// continua dono das regras (scripts/prototype-server.mjs, ações `work` e
// `craftPickaxe`). Os números abaixo repetem as quantidades do servidor, e
// crafting-guide.test.mjs confere que as mensagens dele continuam iguais.
import { AXE_TOOL_IDS, PICKAXE_TOOL_IDS, axeToolFor, pickaxeToolFor } from './tool-progression.mjs';
import { TOOL_PRICES, formatCoins } from './lodging-catalog.mjs';

export const CRAFTING_MATERIALS = Object.freeze({
  sturdyBranch: Object.freeze({ label: 'galho forte', plural: 'galhos fortes', how: 'recolha no chão do bosque (E)' }),
  stone: Object.freeze({ label: 'pedra', plural: 'pedras', how: 'recolha pedras soltas no bosque (E)' }),
  vines: Object.freeze({ label: 'cipó', plural: 'cipós', how: 'equipe a faca (1–9) e corte nas trepadeiras (E)' }),
});

export const CRAFTING_RECIPES = Object.freeze({
  stoneAxe: Object.freeze({
    id: 'stoneAxe', label: 'Machado de pedra', key: 'H', action: 'work', toolIds: AXE_TOOL_IDS,
    cost: Object.freeze({ sturdyBranch: 1, stone: 1, vines: 1 }),
    price: TOOL_PRICES.stoneAxe, use: 'corta árvores e toras',
  }),
  stonePickaxe: Object.freeze({
    id: 'stonePickaxe', label: 'Picareta de pedra', key: 'P', action: 'craftPickaxe', toolIds: PICKAXE_TOOL_IDS,
    cost: Object.freeze({ stone: 2, sturdyBranch: 1, vines: 1 }),
    price: TOOL_PRICES.stonePickaxe, use: 'extrai cobre, ferro e carvão dos veios',
  }),
});

function countOf(inventory, itemId) {
  const total = Number(inventory?.[itemId]);
  if (Number.isFinite(total)) return Math.max(0, Math.floor(total));
  return (inventory?.slots || []).reduce((sum, stack) => sum + (stack?.itemId === itemId ? Number(stack.quantity) || 0 : 0), 0);
}

function recipeStatus(recipe, inventory, owned) {
  const materials = Object.entries(recipe.cost).map(([itemId, need]) => {
    const info = CRAFTING_MATERIALS[itemId];
    const have = countOf(inventory, itemId);
    return { itemId, label: info.label, plural: info.plural, how: info.how, have, need, ok: have >= need };
  });
  const missing = materials.filter(material => !material.ok);
  return {
    id: recipe.id, label: recipe.label, key: recipe.key, action: recipe.action, use: recipe.use,
    price: recipe.price, priceLabel: formatCoins(recipe.price),
    owned, ready: !owned && missing.length === 0, materials, missing,
    summary: materials.map(material => `${material.label} ${Math.min(material.have, material.need)}/${material.need}`).join(', '),
  };
}

function missingLine(status) {
  return status.missing
    .map(material => `${material.need - material.have} ${material.need - material.have === 1 ? material.label : material.plural}`)
    .join(', ');
}

// Como conseguir o que falta. Galho e pedra se recolhem com E; cipó exige a
// faca equipada (servidor: "Equipe a faca na barra rápida para cortar cipó").
function nextMaterialHint(status, inventory) {
  const loose = status.missing.filter(material => material.itemId !== 'vines').map(material => material.label);
  const needsVines = status.missing.some(material => material.itemId === 'vines');
  const parts = [];
  if (loose.length) parts.push(`recolha ${loose.join(' e ')} no bosque (E)`);
  if (needsVines) {
    parts.push(countOf(inventory, 'knife') > 0
      ? 'corte o cipó com a faca equipada (1–9, depois E)'
      : 'sem a faca não há cipó; a recepção também vende a ferramenta pronta');
  }
  const sentence = parts.join('; ');
  return sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` : '';
}

export function craftingGuide(inventory = {}) {
  const axe = axeToolFor(inventory);
  const pickaxe = pickaxeToolFor(inventory);
  const recipes = [
    recipeStatus(CRAFTING_RECIPES.stoneAxe, inventory, Boolean(axe)),
    recipeStatus(CRAFTING_RECIPES.stonePickaxe, inventory, Boolean(pickaxe)),
  ];
  const [axeRecipe, pickaxeRecipe] = recipes;
  let stage;
  let title;
  let text;
  let key = '';
  if (!axe) {
    stage = 'axe';
    const recipe = axeRecipe;
    title = 'Faça um machado de pedra';
    if (recipe.ready) { text = `Você tem tudo: aperte H no bosque para amarrar o machado.`; key = 'H'; }
    else text = `Faltam ${missingLine(recipe)}. ${nextMaterialHint(recipe, inventory)}`;
  } else if (!pickaxe) {
    stage = 'pickaxe';
    const recipe = pickaxeRecipe;
    title = 'Agora, uma picareta de pedra';
    if (recipe.ready) { text = `Você tem tudo: aperte P no bosque para montar a picareta.`; key = 'P'; }
    else text = `Faltam ${missingLine(recipe)}. ${nextMaterialHint(recipe, inventory)}`;
  } else {
    stage = 'mine';
    title = 'Ferramentas prontas';
    text = 'Leve a picareta às rochas da mina (cobre, ferro, carvão).';
  }
  // Quem já minerou algo não precisa do lembrete fixo no mundo.
  const mined = ['copperOre', 'ironOre', 'coal', 'copperIngot', 'ironIngot', 'charcoal'].some(itemId => countOf(inventory, itemId) > 0);
  const showHint = stage !== 'mine' || !mined;
  return { stage, title, text, key, showHint, recipes, axe, pickaxe };
}
