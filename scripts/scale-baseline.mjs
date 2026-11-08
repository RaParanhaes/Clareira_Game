import WebSocket from 'ws';
import { fork } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const MAX_TEST_DURATION_SECONDS = 120;

function parseOptions(argv) {
  const options = { clients: 12, seconds: 5 };
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--help') {
      process.stdout.write('Uso: node scripts/scale-baseline.mjs [--clients N] [--seconds N]\n');
      process.exit(0);
    }
    if (!['--clients', '--seconds'].includes(key)) throw new Error(`Opção desconhecida: ${key}`);
    const value = Number(argv[++index]);
    if (!Number.isInteger(value)) throw new Error(`Valor inválido para ${key}`);
    options[key === '--clients' ? 'clients' : 'seconds'] = value;
  }
  if (options.clients < 1 || options.clients > 32) throw new Error('--clients deve ficar entre 1 e 32');
  if (options.seconds < 1 || options.seconds > MAX_TEST_DURATION_SECONDS) {
    throw new Error(`--seconds deve ficar entre 1 e ${MAX_TEST_DURATION_SECONDS}`);
  }
  return options;
}

const options = parseOptions(process.argv.slice(2));
const webSocketCompression = process.env.BENCHMARK_WS_COMPRESSION === '1';
const compactPlayers = process.env.BENCHMARK_COMPACT_PLAYERS !== '0';
const inputBatchSize = process.env.BENCHMARK_INPUT_BATCH === '2' ? 2 : 1;
const origin = 'https://scale-test.invalid';
const serverExecArgv = process.env.BENCHMARK_PROFILE_SERVER === '1'
  ? [...process.execArgv, '--cpu-prof', '--cpu-prof-dir=/tmp'] : process.execArgv;
const server = fork(new URL('./scale-baseline-server.mjs', import.meta.url), [], {
  stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  execArgv: serverExecArgv,
  env: process.env,
});
let serverReady = null;
const serverMessages = [];
server.on('message', message => {
  serverMessages.push(message);
  serverReady?.(message);
});
const waitForServerMessage = (type, timeoutMs = 30_000) => new Promise((resolve, reject) => {
  const existing = serverMessages.find(message => message.type === type);
  if (existing) return resolve(existing);
  const timer = setTimeout(() => { serverReady = null; reject(new Error(`Timeout aguardando ${type} do servidor`)); }, timeoutMs);
  serverReady = message => {
    if (message.type !== type) return;
    clearTimeout(timer);
    serverReady = null;
    resolve(message);
  };
});
const sockets = [];
const STATE_PREFIX = Buffer.from('{"type":"state"');
const RESOURCE_FIELD = Buffer.from('"resources"');
let stateMessages = 0;
let receivedBytes = 0;
let fullStateMessages = 0;
let fullStateBytes = 0;
let scenePlayers = 0;
const readyClients = new Set();
let inputPackets = 0;
let inputPayloadBytes = 0;

function connect(socket) {
  return new Promise(resolve => {
    socket.once('open', () => resolve(true));
    socket.once('error', () => resolve(false));
  });
}

try {
  const ready = await waitForServerMessage('ready');
  const address = { port: ready.port };
  const connectionAttempts = Array.from({ length: options.clients }, (_, index) => {
    const token = `scale-bot-${index + 1}`;
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
      headers: { origin, cookie: `clareira_session=${token}` },
    });
    socket.on('open', () => socket.send(JSON.stringify({
      type: 'join', compactWorld: 1, ...(compactPlayers ? { compactPlayers: 1 } : {}),
      viewport: { width: 1440, height: 900 },
    })));
    socket.on('error', () => {});
    socket.on('message', raw => {
      if (!Buffer.isBuffer(raw) || !raw.subarray(0, STATE_PREFIX.length).equals(STATE_PREFIX)) return;
      const firstState = !readyClients.has(index);
      readyClients.add(index);
      stateMessages++;
      receivedBytes += raw.length;
      if (raw.includes(RESOURCE_FIELD)) {
        fullStateMessages++;
        fullStateBytes += raw.length;
        const state = JSON.parse(raw.toString());
        if (state.objectCatalog) socket.send(JSON.stringify({
          type: 'objectCatalogReady', revision: state.objectCatalog.revision,
        }));
      }
      if (firstState) {
        try {
          const message = JSON.parse(raw.toString());
          scenePlayers = Math.max(scenePlayers, message.players?.length || 0);
        } catch { /* Malformed snapshots are counted as transport data, not readiness. */ }
      }
    });
    sockets.push(socket);
    return connect(socket);
  });
  const connected = await Promise.all(connectionAttempts);
  const connectedCount = connected.filter(Boolean).length;
  if (!connectedCount) throw new Error('Nenhum cliente de teste foi aceito');

  const readyUntil = Date.now() + 5000;
  while (readyClients.size < connectedCount && Date.now() < readyUntil) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (readyClients.size !== connectedCount) {
    throw new Error(`Snapshots recebidos por ${readyClients.size} jogador(es) de ${connectedCount} conexões`);
  }

  await new Promise(resolve => setTimeout(resolve, 300));
  stateMessages = 0;
  receivedBytes = 0;
  fullStateMessages = 0;
  fullStateBytes = 0;
  const wireStart = sockets.map(socket => ({ read: socket._socket.bytesRead, written: socket._socket.bytesWritten }));
  server.send({ type: 'start-measurement' });
  await waitForServerMessage('measurement-started');
  const startedAt = performance.now();
  const sequences = sockets.map(() => 0);
  const movementTimer = setInterval(() => {
    for (const [index, socket] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const first = sequences[index] + 1;
      sequences[index] += inputBatchSize;
      const command = seq => ({ seq, x: 1, y: 0, motion: true, run: false, crouch: false, jump: false });
      const payload = JSON.stringify({ type: 'input', location: 'clearing', dimensionId: 'surface',
        commands: Array.from({ length: inputBatchSize }, (_, offset) => command(first + offset)) });
      socket.send(payload);
      inputPackets += 1;
      inputPayloadBytes += Buffer.byteLength(payload);
    }
  }, 1000 * inputBatchSize / 60);
  await new Promise(resolve => setTimeout(resolve, options.seconds * 1000));
  clearInterval(movementTimer);
  const elapsedMs = performance.now() - startedAt;
  server.send({ type: 'stop-measurement' });
  const serverMetrics = await waitForServerMessage('measurement-stopped');
  const wireReceivedBytes = sockets.reduce((total, socket, index) => total
    + Math.max(0, socket._socket.bytesRead - wireStart[index].read), 0);
  const wireSentBytes = sockets.reduce((total, socket, index) => total
    + Math.max(0, socket._socket.bytesWritten - wireStart[index].written), 0);
  process.stdout.write(`${JSON.stringify({
    clientsRequested: options.clients,
    clientsAccepted: connectedCount,
    clientsRejected: options.clients - connectedCount,
    playersVisibleInScene: scenePlayers,
    compactPlayers,
    inputBatchSize,
    inputPacketsSent: inputPackets,
    inputPayloadBytesSent: inputPayloadBytes,
    webSocketCompression,
    compressedMovementSnapshots: process.env.BENCHMARK_COMPRESS_MOVEMENT === '1',
    negotiatedCompressionClients: sockets.filter(socket => socket.extensions.includes('permessage-deflate')).length,
    durationSeconds: +(elapsedMs / 1000).toFixed(2),
    stateMessagesAcrossClients: stateMessages,
    stateMessagesPerSecond: +(stateMessages / (elapsedMs / 1000)).toFixed(1),
    bytesReceivedAcrossClients: receivedBytes,
    wireBytesReceivedAcrossClients: wireReceivedBytes,
    wireBytesSentAcrossClients: wireSentBytes,
    wireBytesReceivedPerSecond: Math.round(wireReceivedBytes / (elapsedMs / 1000)),
    wireBytesSentPerSecond: Math.round(wireSentBytes / (elapsedMs / 1000)),
    averageBytesPerStateMessage: stateMessages ? Math.round(receivedBytes / stateMessages) : 0,
    fullStateMessagesAcrossClients: fullStateMessages,
    fullStateBytesAcrossClients: fullStateBytes,
    fullStateShare: stateMessages ? +(fullStateMessages / stateMessages).toFixed(4) : 0,
    serverProcessCpuPercentOfOneCore: serverMetrics.cpuPercentOfOneCore,
    serverEventLoopDelayP95Ms: serverMetrics.eventLoopDelayP95Ms,
    serverEventLoopDelayMaxMs: serverMetrics.eventLoopDelayMaxMs,
    serverRssMiB: +(serverMetrics.rssBytes / 1024 / 1024).toFixed(1),
    serverHeapUsedMiB: +(serverMetrics.heapUsedBytes / 1024 / 1024).toFixed(1),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  }, null, 2)}\n`);
} finally {
  for (const socket of sockets) socket.terminate();
  if (server.connected) {
    server.send({ type: 'shutdown' });
    let shutdownTimeout;
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      new Promise(resolve => {
        shutdownTimeout = setTimeout(resolve, 10_000);
        shutdownTimeout.unref();
      }),
    ]);
    clearTimeout(shutdownTimeout);
  }
  if (server.exitCode === null) server.kill('SIGTERM');
}
