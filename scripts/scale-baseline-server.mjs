import { mkdtemp, rm } from 'node:fs/promises';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import { createPrototypeServer } from './prototype-server.mjs';

const origin = 'https://scale-test.invalid';
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-scale-baseline-'));
const room = createPrototypeServer({
  ambientCampfire: false,
  port: 0,
  stateDirectory,
  databaseUrl: null,
  redisUrl: null,
  arrivalTutorialEnabled: false,
  allowedOrigin: origin,
  webSocketCompression: process.env.BENCHMARK_WS_COMPRESSION === '1',
  compressMovementSnapshots: process.env.BENCHMARK_COMPRESS_MOVEMENT === '1',
  resolveSession: async token => ({ profile: {
    id: token,
    displayName: `Bot ${token.slice(-4)}`,
    guest: true,
    inventory: { wood: 0, stone: 0, berries: 0 },
  } }),
});

let loopDelay = null;
let cpuStart = null;
let startedAt = null;

process.on('message', async message => {
  if (message?.type === 'start-measurement' && !loopDelay) {
    loopDelay = monitorEventLoopDelay({ resolution: 10 });
    loopDelay.enable();
    cpuStart = process.cpuUsage();
    startedAt = performance.now();
    process.send({ type: 'measurement-started' });
    return;
  }
  if (message?.type === 'stop-measurement' && loopDelay) {
    const elapsedMs = Math.max(1, performance.now() - startedAt);
    const cpu = process.cpuUsage(cpuStart);
    loopDelay.disable();
    process.send({
      type: 'measurement-stopped',
      cpuPercentOfOneCore: +(((cpu.user + cpu.system) / 1000) / elapsedMs * 100).toFixed(1),
      eventLoopDelayP95Ms: +(loopDelay.percentile(95) / 1e6).toFixed(2),
      eventLoopDelayMaxMs: +(loopDelay.max / 1e6).toFixed(2),
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
    });
    loopDelay = null;
    return;
  }
  if (message?.type === 'shutdown') {
    await room.close();
    await rm(stateDirectory, { recursive: true, force: true });
    process.exit(0);
  }
});

const address = await room.listen();
process.send({ type: 'ready', port: address.port });

process.once('SIGTERM', async () => {
  await room.close();
  await rm(stateDirectory, { recursive: true, force: true });
  process.exit(0);
});
