import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonInteractionStore } from './json-interaction-store.mjs';

test('JSON backend keeps item transfers with place, object properties and inventory destination', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-interactions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createJsonInteractionStore(directory);
  const profileId = 'aa42fa9b-f05e-42d9-ad51-392ec98ddf33';
  const event = await store.recordInteraction({
    actorProfileId: profileId,
    action: 'collect',
    context: { dimensionId: 'surface', location: 'clearing', placeId: 'clearing',
      instanceId: 'surface-clearing', position: { x: 87.4, y: 93, z: 0 } },
    object: { id: 'dry-leaves-start', kind: 'leaves', properties: { x: 87.1, y: 93.1, quantity: 1 } },
    transfer: { from: { type: 'ground', objectId: 'dry-leaves-start', position: { x: 87.1, y: 93.1 } },
      to: { type: 'inventory', profileId, itemId: 'leaves', quantity: 1 } },
  });
  assert.equal(event.actorProfileId, profileId);
  assert.deepEqual(await store.listInteractionEvents({ actorProfileId: profileId }), [event]);
  const lines = (await readFile(path.join(directory, 'interactions.ndjson'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]).transfer.to, { type: 'inventory', profileId, itemId: 'leaves', quantity: 1 });
});

test('interaction records reject invalid world positions and unbounded object snapshots', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-interactions-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createJsonInteractionStore(directory);
  await assert.rejects(store.recordInteraction({ context: { position: { x: Infinity } } }), /Posição/);
  await assert.rejects(store.recordInteraction({ object: { properties: { payload: 'x'.repeat(13_000) } } }), /limite/);
  assert.deepEqual(await store.listInteractionEvents(), []);
});
