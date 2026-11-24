// Desenho do guia de fabricação: um aviso pequeno no mundo ("Próximo passo")
// e a seção "Receitas" no Inventário. A lógica vive em crafting-guide.mjs;
// aqui só se monta o DOM, e só se mexe nele quando o texto muda.
import { craftingGuide } from './crafting-guide.mjs';
import { isTouchInput } from './input-mode.mjs';

export function shouldShowCraftingHint(guide, { visible = true, dismissedStage = '', dimensionId = '' } = {}) {
  return visible && !String(dimensionId).startsWith('dg-') && guide.showHint && dismissedStage !== guide.stage;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function recipeCard(recipe, { onCraft, canCraft }) {
  const card = element('li', `craft-recipe${recipe.owned ? ' is-owned' : recipe.ready ? ' is-ready' : ''}`);
  const head = element('div', 'craft-recipe-head');
  head.append(element('b', '', recipe.label), element('kbd', '', recipe.key));
  const state = recipe.owned ? 'Você já tem' : recipe.ready ? 'Pronta para montar' : 'Faltam materiais';
  head.append(element('span', 'craft-recipe-state', state));
  const materials = element('p', 'craft-recipe-materials');
  for (const material of recipe.materials) {
    materials.append(element('span', `craft-material${material.ok ? ' is-ok' : ''}`, `${material.label} ${Math.min(material.have, material.need)}/${material.need}`));
  }
  const note = element('small', 'craft-recipe-note',
    `${recipe.use[0].toUpperCase()}${recipe.use.slice(1)}. Cipó: corte com a faca. Pronta na recepção: ${recipe.priceLabel} (com conta).`);
  card.append(head, materials, note);
  if (recipe.ready && canCraft) {
    const button = element('button', 'craft-recipe-button', 'Montar agora');
    button.type = 'button';
    button.addEventListener('click', () => onCraft(recipe.action));
    card.append(button);
  } else if (recipe.ready) {
    // O servidor só monta ferramentas no bosque (location === 'clearing').
    card.append(element('small', 'craft-recipe-note', 'Monte no bosque.'));
  }
  return card;
}

export function createCraftingGuideView({ hint, panel, onOpen, onCraft, onDismiss }) {
  const hintText = hint?.querySelector('[data-craft-hint-text]');
  const hintOpen = hint?.querySelector('[data-craft-hint-open]');
  const hintClose = hint?.querySelector('[data-craft-hint-close]');
  const panelNext = panel?.querySelector('[data-craft-next]');
  const panelList = panel?.querySelector('[data-craft-recipes]');
  let panelKey = '';
  let hintKey = '';
  hintOpen?.addEventListener('click', () => onOpen?.());
  hintClose?.addEventListener('click', () => onDismiss?.());
  return {
    guideFor: craftingGuide,
    // `visible` diz se o aviso do mundo deve aparecer agora (bosque, sem dispensa).
    update(inventory, { visible = true, dismissedStage = '', canCraft = true, dimensionId = '' } = {}) {
      const guide = craftingGuide(inventory, { touch: isTouchInput(), inClearing: canCraft });
      const showHint = shouldShowCraftingHint(guide, { visible, dismissedStage, dimensionId });
      const nextHintKey = `${showHint}|${guide.stage}|${guide.text}`;
      if (hint && nextHintKey !== hintKey) {
        hintKey = nextHintKey;
        hint.hidden = !showHint;
        hint.dataset.stage = guide.stage;
        if (hintText) hintText.textContent = `${guide.title}. ${guide.text}`;
      }
      const nextPanelKey = JSON.stringify([canCraft, guide.stage, guide.text, guide.recipes.map(recipe => [recipe.owned, recipe.ready, recipe.summary])]);
      if (panel && nextPanelKey !== panelKey) {
        panelKey = nextPanelKey;
        if (panelNext) panelNext.textContent = `${guide.title}. ${guide.text}`;
        if (panelList) panelList.replaceChildren(...guide.recipes.map(recipe => recipeCard(recipe, { onCraft, canCraft })));
      }
      return guide;
    },
  };
}
