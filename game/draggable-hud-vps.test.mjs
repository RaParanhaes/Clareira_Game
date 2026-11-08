import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clampPosition } from './draggable-hud.mjs';

test('mantém painéis arrastados dentro da área do jogo', () => {
  const size = { width: 100, height: 40 }, bounds = { width: 400, height: 300 };
  assert.deepEqual(clampPosition(-20, -5, size, bounds), { left: 0, top: 0 });
  assert.deepEqual(clampPosition(390, 290, size, bounds), { left: 300, top: 260 });
  assert.deepEqual(clampPosition(50, 60, size, bounds), { left: 50, top: 60 });
});

test('liga a edição dos painéis do HUD ao menu e aos controles existentes', async () => {
  const [html, main, styles, hud] = await Promise.all(
    ['index.html', 'main.js', 'style.css', 'draggable-hud.mjs'].map(file =>
      readFile(new URL(file, import.meta.url), 'utf8')),
  );
  assert.match(html, /id="hud-edit-toggle"[^>]*aria-pressed="false"/);
  assert.match(html, /id="hud-reset"/);
  assert.match(main, /createDraggableHud\(\{[\s\S]*#quickbar[\s\S]*#hud-edit-toggle/);
  assert.match(styles, /\.hud-editing \[data-hud-movable\]/);
  assert.match(hud, /event\.altKey/);
  assert.match(hud, /localStorage/);
});
