import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAssetSnapshotStore } from './game-asset-snapshots.mjs';

function snapshot(version, files) {
  return { manifest: { version, files: files.map(([path, body]) => ({ path, size: body.length, sha256: body })) },
    bodies: new Map(files.map(([path, body]) => [path, Buffer.from(body)])) };
}
test('asset versions share unchanged bodies and evict the least recently used version within the memory limit', () => {
  let now = 0;
  const store = createGameAssetSnapshotStore({ now: () => now, maxBytes: 5 });
  store.add(snapshot('v1', [['code', 'a'], ['art', 'xx']]));
  now++;
  store.add(snapshot('v2', [['code', 'bb'], ['art', 'xx']]));
  assert.deepEqual(store.stats(), { versions: 2, blobs: 3, bytes: 5 });
  assert.equal(store.get('v1', 'code').bytes.toString(), 'a');
  now++;
  store.add(snapshot('v3', [['code', 'ccc'], ['art', 'xx']]));
  assert.deepEqual(store.stats(), { versions: 1, blobs: 2, bytes: 5 });
  assert.equal(store.get('v1', 'code'), null);
  assert.equal(store.get('v3', 'code').bytes.toString(), 'ccc');
});
test('an unchanged current manifest remains downloadable after an idle period', () => {
  let now = 0;
  const store = createGameAssetSnapshotStore({ now: () => now, maxAgeMs: 10 });
  store.add(snapshot('v1', [['code', 'a']]));
  now = 100;
  assert.equal(store.get('v1', 'code').bytes.toString(), 'a');
  store.add(snapshot('v2', [['code', 'b']]));
  now += 20;
  assert.equal(store.get('v1', 'code'), null);
  assert.equal(store.get('v2', 'code').bytes.toString(), 'b');
});

test('an oversized package cannot evict the valid current download', () => {
  const store = createGameAssetSnapshotStore({ maxBytes: 5 });
  store.add(snapshot('v1', [['code', 'a']]));
  assert.throws(() => store.add(snapshot('v2', [['code', '123456']])), /orçamento/);
  assert.equal(store.get('v1', 'code').bytes.toString(), 'a');
  assert.equal(store.get('v2', 'code'), null);
});
