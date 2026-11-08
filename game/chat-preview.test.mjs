import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPreviewServer } from '../scripts/dev-preview-page.mjs';

test('preview delivers the conversation composer and module under nosniff', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-chat-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const preview = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: 'https://test.clareira.invalid' });
  const address = await preview.listen();
  t.after(() => preview.close());
  const base = `http://127.0.0.1:${address.port}`;
  const [page, client, module] = await Promise.all([
    fetch(`${base}/`),
    fetch(`${base}/main.js`),
    fetch(`${base}/chat.mjs`),
  ]);

  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="chat-form"/);
  assert.equal(client.status, 200);
  assert.match(client.headers.get('content-type'), /javascript/);
  assert.match(await client.text(), /wrapChatMessage/);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.equal(module.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await module.text(), /normalizeChatMessage/);
});
