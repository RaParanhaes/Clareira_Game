import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameUpdateMonitor } from './update-monitor.mjs';

test('recarrega só depois que a nova versão estabiliza e o jogador pode parar', async () => {
  let version = 'v1', time = 0, safe = false, reloads = 0, notices = 0;
  const monitor = createGameUpdateMonitor({
    initialVersion: 'v1', fetchVersion: async () => version, canReload: () => safe,
    reload: () => { reloads += 1; }, notifyWaiting: () => { notices += 1; },
    now: () => time, stableForMs: 5_000, notificationIntervalMs: 30_000,
  });
  version = 'v2';
  await monitor.check();
  time = 5_000;
  await monitor.check();
  assert.equal(reloads, 0);
  assert.equal(notices, 1);
  safe = true;
  time = 6_000;
  await monitor.check();
  await monitor.check();
  assert.equal(reloads, 1);
});

test('uma versão que volta ao valor atual não provoca atualização', async () => {
  let version = 'v1', time = 0, reloads = 0;
  const monitor = createGameUpdateMonitor({
    initialVersion: 'v1', fetchVersion: async () => version, canReload: () => true,
    reload: () => { reloads += 1; }, now: () => time, stableForMs: 5_000,
  });
  version = 'v2';
  await monitor.check();
  time = 1_000;
  version = 'v1';
  await monitor.check();
  time = 2_000;
  version = 'v2';
  await monitor.check();
  time = 6_999;
  await monitor.check();
  assert.equal(reloads, 0);
  time = 7_000;
  await monitor.check();
  assert.equal(reloads, 1);
});
