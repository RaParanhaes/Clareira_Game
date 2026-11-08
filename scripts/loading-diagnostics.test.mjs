import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreviewServer } from './dev-preview-page.mjs';

test('loading diagnostics reject invalid origins and log only bounded approved fields', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'clareira-loading-log-'));
  const origin = 'https://test.clareira.invalid';
  const preview = createPreviewServer({ port: 0, stateDirectory: directory, allowedOrigin: origin });
  const address = await preview.listen();
  t.after(async () => { await preview.close(); await rm(directory, { recursive: true, force: true }); });
  const endpoint = `http://127.0.0.1:${address.port}/loading-diagnostics`;
  const send = (payload, requestOrigin = origin) => fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', origin: requestOrigin }, body: JSON.stringify(payload) });
  const event = { phase: 'downloading', reason: 'integrity', elapsedMs: 10000, percent: 55, username: 'private', message: 'private' };
  assert.equal((await send({ events: [event] }, 'https://other.invalid')).status, 403);
  assert.equal((await send({ events: [{ ...event, reason: 'unrecognized' }] })).status, 400);
  let output = ''; const originalWrite = process.stderr.write;
  process.stderr.write = function (chunk, ...rest) { output += String(chunk); return true; };
  try { assert.equal((await send({ events: [event] })).status, 200); } finally { process.stderr.write = originalWrite; }
  const record = JSON.parse(output.trim());
  assert.equal(record.type, 'loading-diagnostic');
  assert.deepEqual(record.events, [{ phase: 'downloading', reason: 'integrity', elapsedMs: 10000, percent: 55 }]);
});
