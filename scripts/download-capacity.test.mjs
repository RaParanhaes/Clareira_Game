import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadCapacityManager } from './download-capacity.mjs';

test('download concurrency expands when few players load and shares a bounded request budget', () => {
  let now = 1_000;
  const manager = createDownloadCapacityManager({ now: () => now });
  const ids = Array.from({ length: 9 }, (_, index) => index.toString(16).padStart(32, '0'));

  assert.equal(manager.update({ id: ids[0], action: 'start' }).maxConcurrentRequests, 24);
  assert.equal(manager.update({ id: ids[1], action: 'start' }).maxConcurrentRequests, 16);
  assert.equal(manager.update({ id: ids[2], action: 'start' }).maxConcurrentRequests, 10);
  for (let index = 3; index < 8; index += 1) manager.update({ id: ids[index], action: 'start' });
  assert.equal(manager.update({ id: ids[7], action: 'start' }).maxConcurrentRequests, 4);
  assert.equal(manager.update({ id: ids[8], action: 'start' }).maxConcurrentRequests, 3);

  const released = manager.update({ id: ids[8], action: 'release' });
  assert.equal(released.activeDownloaders, 8);
  assert.equal(released.maxConcurrentRequests, 4);
  assert.equal(manager.snapshot().activeDownloaders, 8);

  now += 15_001;
  assert.deepEqual(manager.snapshot(), { activeDownloaders: 0, maxConcurrentRequests: 24 });
});
