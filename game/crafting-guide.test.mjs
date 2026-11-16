import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRAFTING_RECIPES, craftingGuide, workKeyAction } from './crafting-guide.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await readFile(path.join(root, 'scripts', 'prototype-server.mjs'), 'utf8');
const html = await readFile(path.join(root, 'game', 'index.html'), 'utf8');
const main = await readFile(path.join(root, 'game', 'main.js'), 'utf8');

const recipe = (guide, id) => guide.recipes.find(entry => entry.id === id);

test('quem acabou de chegar com a faca é guiado ao machado, com as contagens reais', () => {
  const guide = craftingGuide({ knife: 1, sturdyBranch: 0, stone: 0, vines: 0 });
  assert.equal(guide.stage, 'axe');
  assert.equal(guide.key, '');
  assert.match(guide.text, /Faltam 1 galho forte, 1 pedra, 1 cipó\./u);
  assert.match(guide.text, /Recolha galho forte e pedra no bosque \(E\); corte o cipó com a faca equipada/u);
  assert.equal(recipe(guide, 'stoneAxe').summary, 'galho forte 0/1, pedra 0/1, cipó 0/1');
  assert.equal(recipe(guide, 'stonePickaxe').summary, 'pedra 0/2, galho forte 0/1, cipó 0/1');
  assert.equal(guide.showHint, true);
});

test('o primeiro material que falta ganha a dica certa, e cipó sem faca não finge que é possível', () => {
  const comFaca = craftingGuide({ knife: 1, sturdyBranch: 1, stone: 1, vines: 0 });
  assert.match(comFaca.text, /Faltam 1 cipó\. Corte o cipó com a faca equipada/u);
  const semFaca = craftingGuide({ knife: 0, sturdyBranch: 1, stone: 1, vines: 0 });
  assert.match(semFaca.text, /Sem a faca não há cipó/u);
  const pedra = craftingGuide({ knife: 1, sturdyBranch: 1, stone: 0, vines: 1 });
  assert.match(pedra.text, /Faltam 1 pedra\. Recolha pedra no bosque/u);
});

test('com os três materiais o guia manda apertar H, e o machado fica pronto', () => {
  const guide = craftingGuide({ knife: 1, sturdyBranch: 1, stone: 1, vines: 1 });
  assert.equal(guide.stage, 'axe');
  assert.equal(guide.key, 'H');
  assert.equal(recipe(guide, 'stoneAxe').ready, true);
  assert.equal(recipe(guide, 'stonePickaxe').ready, false);
  assert.match(guide.text, /H/u);
});

test('materiais a mais ficam limitados ao necessário na contagem e as pilhas contam', () => {
  const guide = craftingGuide({ stone: 5, slots: [{ itemId: 'knife', quantity: 1 }] });
  assert.equal(recipe(guide, 'stoneAxe').summary, 'galho forte 0/1, pedra 1/1, cipó 0/1');
  const viaPilhas = craftingGuide({ slots: [{ itemId: 'stone', quantity: 1 }, null, { itemId: 'stone', quantity: 1 }] });
  assert.equal(recipe(viaPilhas, 'stonePickaxe').materials.find(item => item.itemId === 'stone').have, 2);
});

test('com o machado e sem picareta o guia passa para a picareta de 2 pedras', () => {
  const guide = craftingGuide({ stoneAxe: 1, stone: 1, sturdyBranch: 1, vines: 1 });
  assert.equal(guide.stage, 'pickaxe');
  assert.equal(recipe(guide, 'stoneAxe').owned, true);
  assert.equal(recipe(guide, 'stoneAxe').ready, false);
  assert.match(guide.text, /Faltam 1 pedra\./u);
  const pronta = craftingGuide({ stoneAxe: 1, stone: 2, sturdyBranch: 1, vines: 1 });
  assert.equal(pronta.key, 'P');
  assert.equal(recipe(pronta, 'stonePickaxe').ready, true);
});

test('ferramentas de nível maior também contam como posse', () => {
  const guide = craftingGuide({ copperAxe: 1, ironPickaxe: 1 });
  assert.equal(guide.stage, 'mine');
  const viaPilha = craftingGuide({ slots: [{ itemId: 'stoneAxe', quantity: 1 }, { itemId: 'copperPickaxe', quantity: 1 }] });
  assert.equal(viaPilha.stage, 'mine');
});

test('com machado e picareta o guia leva às rochas da mina, e some depois de minerar', () => {
  const guide = craftingGuide({ stoneAxe: 1, stonePickaxe: 1 });
  assert.equal(guide.stage, 'mine');
  assert.equal(guide.text, 'Leve a picareta às rochas da mina (cobre, ferro, carvão).');
  assert.equal(guide.showHint, true);
  assert.equal(craftingGuide({ stoneAxe: 1, stonePickaxe: 1, copperOre: 1 }).showHint, false);
});

test('preços da recepção vêm do catálogo: 500 e 700 bronzes', () => {
  assert.equal(CRAFTING_RECIPES.stoneAxe.price, 500);
  assert.equal(CRAFTING_RECIPES.stonePickaxe.price, 700);
  const guide = craftingGuide({});
  assert.equal(recipe(guide, 'stoneAxe').priceLabel, '5 pratas');
  assert.equal(recipe(guide, 'stonePickaxe').priceLabel, '7 pratas');
});

test('as quantidades e teclas repetem o que o servidor e o cliente de fato exigem', () => {
  assert.match(server, /junte 1 galho forte, 1 pedra e 1 cipó/u);
  assert.match(server, /junte 2 pedras, 1 galho forte e 1 cipó/u);
  assert.match(server, /resource\.kind === 'vines' && selectedInventoryItem\(player\.inventory\) !== 'knife'/u);
  assert.deepEqual(CRAFTING_RECIPES.stoneAxe.cost, { sturdyBranch: 1, stone: 1, vines: 1 });
  assert.deepEqual(CRAFTING_RECIPES.stonePickaxe.cost, { stone: 2, sturdyBranch: 1, vines: 1 });
  assert.match(main, /key === 'h' \|\| key === 'H'\) action\(workKeyAction\(localInventory\)\)/u);
  assert.equal(CRAFTING_RECIPES.stoneAxe.action, 'craftAxe');
  assert.match(server, /message\.name === 'craftAxe'/u);
  assert.match(main, /key === 'p' \|\| key === 'P'\) action\('craftPickaxe'\)/u);
  assert.equal(CRAFTING_RECIPES.stoneAxe.key, 'H');
  assert.equal(CRAFTING_RECIPES.stonePickaxe.key, 'P');
});

test('o cliente liga o guia ao aviso do mundo e à seção de receitas do Inventário', () => {
  assert.match(html, /id="craft-hint"/u);
  assert.match(html, /id="crafting-guide"[\s\S]*data-craft-recipes/u);
  assert.match(main, /createCraftingGuideView\(/u);
  assert.match(main, /craftingGuideView\.update\(localInventory/u);
});

test('"Montar agora" só vale no bosque, a mesma regra de localização do servidor', async () => {
  const ui = await readFile(path.join(root, 'game', 'crafting-guide-ui.mjs'), 'utf8');
  assert.match(server, /player\.location !== 'clearing'\) \{ notice\(socket, 'Monte ferramentas no bosque\.'\)/u);
  assert.match(ui, /recipe\.ready && canCraft/u);
  assert.match(ui, /Monte no bosque\./u);
  assert.match(main, /canCraft: worldLocation === 'clearing'/u);
});

test('a tecla H fabrica o machado quando falta só apertar, mesmo com a picareta equipada; senão segue como work', () => {
  const pronto = { sturdyBranch: 1, stone: 1, vines: 1 };
  assert.equal(workKeyAction(pronto), 'craftAxe');
  assert.equal(workKeyAction({ ...pronto, stonePickaxe: 1, selectedSlot: 0, slots: [{ itemId: 'stonePickaxe', quantity: 1 }] }), 'craftAxe');
  assert.equal(workKeyAction({ sturdyBranch: 1, stone: 1, vines: 0 }), 'work');
  assert.equal(workKeyAction({ ...pronto, stoneAxe: 1 }), 'work');
  assert.equal(workKeyAction({ stonePickaxe: 1 }), 'work');
  assert.equal(workKeyAction(), 'work');
});

test('o texto do guia fala em toque no celular e em H, P e E no teclado', () => {
  const pronto = { sturdyBranch: 1, stone: 1, vines: 1 };
  assert.match(craftingGuide(pronto).text, /aperte H/);
  const touch = craftingGuide(pronto, { touch: true });
  assert.match(touch.text, /toque em Montar agora/);
  assert.doesNotMatch(touch.text, /aperte|\bH\b/);
  assert.match(craftingGuide({ stoneAxe: 1, sturdyBranch: 1, stone: 2, vines: 1 }).text, /aperte P/);
  const faltando = craftingGuide({ knife: 1 }, { touch: true }).text;
  assert.match(faltando, /toque em Usar/);
  assert.doesNotMatch(faltando, /\(E\)|depois E/);
  assert.match(craftingGuide({ knife: 1 }).text, /\(E\)/);
});
