import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPreviewServer } from '../scripts/dev-preview-page.mjs';

test('o convite de frutinha usa o mesmo gesto em teclado e toque', async () => {
  const client = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  assert.match(client, /getNearestShareTarget\(localPosition, reachablePlayers, selfId\)/);
  assert.match(client, /const label = 'OFERECER FRUTINHA'/);
  assert.match(client, /if \(key === 'g' \|\| key === 'G'\) action\('share'\)/);
  assert.match(client, /thing\.player\.id === shareTarget\?\.id/);
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /data-action="share" aria-label="Oferecer frutinha">Oferecer/);
});

test('preview entrega o seletor de oferta como JavaScript protegido contra sniffing', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-share-target-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const preview = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: 'https://test.clareira.invalid' });
  const address = await preview.listen();
  t.after(() => preview.close());

  const response = await fetch(`http://127.0.0.1:${address.port}/share-target.mjs`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await response.text(), /getNearestShareTarget/);
});
