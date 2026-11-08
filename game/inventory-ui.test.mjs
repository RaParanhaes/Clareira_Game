import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'game', 'index.html'), 'utf8');
const main = await readFile(path.join(root, 'game', 'main.js'), 'utf8');

test('resource totals live in the Inventory while the sidebar keeps only the coin wallet', () => {
  const topbar = html.match(/<header class="topbar"[\s\S]*?<\/header>/u)?.[0];
  assert.ok(topbar, 'player menu exists');
  assert.match(topbar, /class="coin-wallet"/u);
  assert.doesNotMatch(topbar, /wood-count|timber-count|sturdy-branch-count|stone-count|berries-count|leaves-count|vines-count/u);
  assert.match(html, /class="inventory-purse"[^>]*aria-label="Moedas guardadas"/u);
  for (const denomination of ['gold', 'silver', 'bronze']) {
    assert.match(html, new RegExp(`id="bag-${denomination}-count"`));
    assert.match(topbar, new RegExp(`id="${denomination}-count"`));
  }
  assert.doesNotMatch(main, /querySelector\('#(?:wood|timber|sturdy-branch|stone|berries|leaves|vines)-count'\)/u);
});

test('the Inventory is named consistently and every XP potion asks before consumption', () => {
  assert.match(html, /<h2 id="inventory-title">Inventário<\/h2>/u);
  const dialog = html.match(/<dialog id="xp-potion-confirm"[\s\S]*?<\/dialog>/u)?.[0];
  assert.ok(dialog, 'rare potion confirmation exists');
  assert.match(dialog, /id="xp-potion-keep"[^>]*autofocus/u);
  assert.match(dialog, /Manter no Inventário/u);
  assert.match(main, /function openXpPotionConfirmation\(potionId\)/u);
  assert.match(main, /if \(openXpPotionConfirmation\(selected\.itemId\)\) return/u);
  assert.match(main, /potion\.xp - preview\.gained/u);
  assert.doesNotMatch(main, /potion\?\.xp >= 1800/u);
});
