import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorldDefinition } from '../game/world-edits.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';

const ORIGIN = 'http://preview.test';

function fakeStorage({ revision = 0, granted = ['world.operate'] } = {}) {
  const saved = [];
  let world = emptyWorldDefinition('surface');
  world = { ...world, revision };
  const staffManagement = { authorization: { hasPermission: async (_account, key) => granted.includes(key) } };
  const storageAdapter = {
    accounts: { getSession: async () => ({ profile: { id: 'actor', guest: false } }) },
    staffManagement,
    loadWorld: async () => world,
    saveWorld: async (definition, expectedRevision) => {
      if (expectedRevision !== world.revision) throw Object.assign(new Error('conflict'), { status: 409 });
      saved.push({ definition, expectedRevision });
      world = definition;
      return definition;
    },
    ready: async () => {},
    close: async () => {},
  };
  return { storageAdapter, saved };
}

async function start(t, options) {
  const server = createPreviewServer({ port: 0, allowedOrigin: ORIGIN, ...options });
  const address = await server.listen();
  t.after(() => server.close());
  return `http://127.0.0.1:${address.port}/staff/world/trees`;
}

const headers = { cookie: 'clareira_session=fake', origin: ORIGIN, 'content-type': 'application/json' };

test('tree listing requires world.operate and lists standing staff trees', async t => {
  const { storageAdapter } = fakeStorage({ granted: [] });
  const base = await start(t, { storageAdapter });
  assert.equal((await fetch(`${base}?dimension=surface`, { headers })).status, 403);
});

test('staff map reuses the world overview and detailed terrain survey', async t => {
  const { storageAdapter } = fakeStorage();
  const base = await start(t, { storageAdapter });
  const response = await fetch(`${base}?dimension=surface&left=80&top=80&right=96&bottom=96`, { headers });
  assert.equal(response.status, 200);
  const map = await response.json();
  assert.equal(map.worldSize, 5933);
  assert.equal(map.overview.worldSize, map.worldSize);
  assert.equal(map.details.bounds.left, 80);
  assert.equal(map.details.terrain.length, 16);
  assert.equal(map.details.terrain[0].length, 16);
  assert.ok(map.details.buildings.length > 0);
});

test('staff places a tree and the revision advances by one', async t => {
  const { storageAdapter, saved } = fakeStorage({ revision: 3 });
  const base = await start(t, { storageAdapter });
  const response = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ dimension: 'surface', expectedRevision: 3, placements: [{ x: 50, y: 60 }] }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.changed, true);
  assert.equal(body.revision, 4);
  assert.equal(saved[0].expectedRevision, 3);
});

test('listing returns natural and staff trees inside the requested area', async t => {
  const { storageAdapter } = fakeStorage({ revision: 0 });
  const base = await start(t, { storageAdapter });
  const planted = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ dimension: 'surface', expectedRevision: 0, placements: [{ x: 5000, y: 5000 }] }),
  });
  assert.equal(planted.status, 200);
  const response = await fetch(`${base}?dimension=surface&left=4000&top=4000&right=6000&bottom=6000`, { headers });
  assert.equal(response.status, 200);
  const listing = await response.json();
  assert.equal(listing.revision, 1);
  assert.equal(listing.truncated, false);
  assert.ok(listing.trees.some(tree => tree.source === 'staff' && tree.targetId.startsWith('maptree:')));
  assert.ok(listing.trees.every(tree => tree.x >= 4000 && tree.x <= 6000 && tree.y >= 4000 && tree.y <= 6000));
});

test('invalid listing areas return 400', async t => {
  const { storageAdapter } = fakeStorage();
  const base = await start(t, { storageAdapter });
  const response = await fetch(`${base}?dimension=surface&left=6000&right=4000`, { headers });
  assert.equal(response.status, 400);
});

test('stale revisions are rejected before any change is planned', async t => {
  const { storageAdapter, saved } = fakeStorage({ revision: 5 });
  const base = await start(t, { storageAdapter });
  const response = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ dimension: 'surface', expectedRevision: 4, placements: [{ x: 1, y: 1 }] }),
  });
  assert.equal(response.status, 409);
  assert.equal(saved.length, 0);
});

test('invalid tree requests return 400 without saving', async t => {
  const { storageAdapter, saved } = fakeStorage({ revision: 0 });
  const base = await start(t, { storageAdapter });
  const response = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ dimension: 'surface', expectedRevision: 0, placements: [{ x: 99999, y: 1 }] }),
  });
  assert.equal(response.status, 400);
  assert.equal(saved.length, 0);
});

test('a removal of an already removed tree does not save a new revision', async t => {
  const { storageAdapter, saved } = fakeStorage({ revision: 0 });
  const base = await start(t, { storageAdapter });
  const body = { dimension: 'surface', expectedRevision: 0, removals: [{ targetId: 'seed:7', x: 1, y: 1 }] };
  assert.equal((await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) })).status, 200);
  const again = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ ...body, expectedRevision: 1 }) });
  assert.equal((await again.json()).changed, false);
  assert.equal(saved.length, 1);
});

test('editing one tile and moving a staff tree share the permission and revision checks', async t => {
  const { storageAdapter, saved } = fakeStorage();
  const base = await start(t, { storageAdapter });
  const post = payload => fetch(base, { method: 'POST', headers, body: JSON.stringify({ dimension: 'surface', ...payload }) });
  const tile = { x: 5010, y: 5011, surface: 'path' };
  assert.equal((await post({ expectedRevision: 0, tiles: [tile], placements: [{ x: 5012, y: 5013 }] })).status, 200);
  const listingUrl = `${base}?dimension=surface&left=5000&top=5000&right=5020&bottom=5020`;
  let listing = await (await fetch(listingUrl, { headers })).json();
  assert.deepEqual(listing.tiles, [tile]);
  const planted = listing.trees.find(tree => tree.source === 'staff');
  assert.ok(planted);
  assert.equal((await post({ expectedRevision: 0, tiles: [{ ...tile, surface: 'reset' }] })).status, 409);
  assert.equal((await post({ expectedRevision: 1, tiles: [{ ...tile, x: 5010.5 }] })).status, 400);
  assert.equal((await post({ expectedRevision: 1, tiles: [{ ...tile, surface: 'reset' }],
    moves: [{ targetId: planted.targetId, x: 5014, y: 5015 }] })).status, 200);
  listing = await (await fetch(listingUrl, { headers })).json();
  assert.deepEqual(listing.tiles, []);
  assert.deepEqual(listing.trees.find(tree => tree.targetId === planted.targetId), { ...planted, x: 5014, y: 5015 });
  assert.equal(saved.length, 2);

  const forbidden = fakeStorage({ granted: ['realms.manage'] });
  const forbiddenBase = await start(t, forbidden);
  const response = await fetch(forbiddenBase, { method: 'POST', headers,
    body: JSON.stringify({ dimension: 'surface', expectedRevision: 0, tiles: [tile] }) });
  assert.equal(response.status, 403);
  assert.equal(forbidden.saved.length, 0);
});
