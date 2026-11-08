import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from './dev-preview-page.mjs';

test('staff overview endpoints enforce separate permissions on every request', async t => {
  const granted = new Set(); let calls = 0;
  const staffManagement = {
    authorization: { hasPermission: async (_account, key) => granted.has(key) },
    getPlayerOverview: async username => { calls++; return username === 'missing' ? null : { username }; },
    getEconomyOverview: async () => { calls++; return { goods: [], banks: [] }; },
  };
  const storageAdapter = { accounts: { getSession: async () => ({ profile: { id: 'actor', guest: false } }) }, staffManagement, ready: async () => {}, close: async () => {} };
  const server = createPreviewServer({ port: 0, storageAdapter });
  const address = await server.listen(); t.after(() => server.close());
  const base = `http://127.0.0.1:${address.port}/staff`;
  const get = path => fetch(`${base}${path}`, { headers: { cookie: 'clareira_session=fake' } });
  assert.equal((await get('/players/example')).status, 403);
  assert.equal((await get('/economy-overview')).status, 403);
  assert.equal(calls, 0);
  granted.add('players.state.repair');
  assert.equal((await get('/players/example')).status, 200);
  assert.equal((await get('/players/missing')).status, 404);
  assert.equal((await get('/economy-overview')).status, 403);
  granted.delete('players.state.repair'); granted.add('economy.adjust');
  assert.equal((await get('/players/example')).status, 403);
  assert.equal((await get('/economy-overview')).status, 200);
});
