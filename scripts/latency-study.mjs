import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { appendPositionSample, interpolatePosition } from '../game/interpolation.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const outputDirectory = process.argv[2] || 'logs/latency-study';
const repeats = Math.max(1, Number(process.argv[3]) || 3);
const FIXED_INPUT_HZ = 60;
const MOVEMENT_STEPS = 60;
const STOP_STEPS = 90;
const REMOTE_INTERPOLATION_DELAY_MS = 30;
const ORIGIN = 'http://latency-study.local';

function percentile(values, amount) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * amount) - 1)];
}

function summary(values) {
  if (!values.length) return { count: 0, p50: null, p95: null, p99: null, mean: null };
  return {
    count: values.length,
    p50: percentile(values, .5),
    p95: percentile(values, .95),
    p99: percentile(values, .99),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForState(client, predicate, description, timeoutMs = 5_000) {
  if (client.latest && predicate(client.latest)) return Promise.resolve(client.latest);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, reject, description };
    waiter.timer = setTimeout(() => {
      client.waiters.splice(client.waiters.indexOf(waiter), 1);
      reject(new Error(`Timeout esperando ${description}`));
    }, timeoutMs);
    client.waiters.push(waiter);
  });
}

async function waitUntil(predicate, description, timeoutMs = 3_000) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(`Timeout esperando ${description}`);
    await sleep(10);
  }
}

function notifyState(client, message) {
  for (const waiter of [...client.waiters]) {
    if (!waiter.predicate(message)) continue;
    clearTimeout(waiter.timer);
    client.waiters.splice(client.waiters.indexOf(waiter), 1);
    waiter.resolve(message);
  }
}

function deliverAck(client, player, sentAt, deliveredAt, kind) {
  if (!client.active || !player || !client.trackId || player.id !== client.trackId) return;
  const sequence = Number(player.inputSeq) || 0;
  const previous = kind === 'wire' ? client.wireAck : client.appAck;
  if (sequence > previous) {
    const destination = kind === 'wire' ? client.wireLatencyMs : client.appLatencyMs;
    for (let seq = previous + 1; seq <= sequence; seq++) {
      const issuedAt = sentAt.get(seq);
      if (Number.isFinite(issuedAt)) destination.push(deliveredAt - issuedAt);
    }
    if (kind === 'wire') client.wireAck = sequence;
    else client.appAck = sequence;
  }

  const stopField = kind === 'wire' ? 'wireStopAt' : 'appStopAt';
  if (client.stopStartAt !== null && client[stopField] === null
      && sequence >= client.firstStopSequence && player.moving === false
      && Math.hypot(player.vx || 0, player.vy || 0) < .05) {
    client[stopField] = deliveredAt;
  }
}

function makeClient(address, token, name, delayMs, metrics, sentAt) {
  const client = {
    id: null, latest: null, waiters: [], trackId: null, active: false,
    wireAck: 0, appAck: 0, wireLatencyMs: [], appLatencyMs: [],
    clockSequence: 0, clockProbeTimes: new Map(), clockSamples: [], clockOffsetMs: null,
    clockRoundTripMs: null, clockProbeTimer: null, legacySamples: [], alignedSamples: [],
    authoritativeSamples: [], displayFrames: [], displayTimer: null,
    stopStartAt: null, firstStopSequence: Infinity, wireStopAt: null, appStopAt: null,
    socket: null,
    send(message) {
      const payload = JSON.stringify(message);
      const transmit = () => {
        if (client.socket.readyState === WebSocket.OPEN) client.socket.send(payload);
      };
      if (delayMs > 0) setTimeout(transmit, delayMs);
      else transmit();
    },
    sendClockProbe() {
      const sequence = ++client.clockSequence;
      client.clockProbeTimes.set(sequence, performance.now());
      while (client.clockProbeTimes.size > 8) client.clockProbeTimes.delete(client.clockProbeTimes.keys().next().value);
      client.send({ type: 'clockPing', sequence });
    },
  };

  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: ORIGIN, cookie: `clareira_session=${token}` },
  });
  client.socket = socket;
  socket.on('open', () => {
    client.send({ type: 'join', name, compactWorld: 1, viewport: { width: 1440, height: 900 } });
    client.sendClockProbe();
    client.clockProbeTimer = setInterval(() => client.sendClockProbe(), 1000);
  });
  socket.on('close', () => clearInterval(client.clockProbeTimer));
  socket.on('error', error => {
    for (const waiter of client.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  });
  socket.on('message', raw => {
    const arrivedAt = performance.now();
    const bytes = Buffer.byteLength(raw);
    let message;
    try { message = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (client.active && message.type === 'state') {
      metrics.statePackets += 1;
      metrics.stateBytes += bytes;
    }
    if (message.type === 'state') {
      const player = message.players?.find(item => item.id === client.trackId);
      deliverAck(client, player, sentAt, arrivedAt, 'wire');
    }

    const deliver = () => {
      const deliveredAt = performance.now();
      if (message.type === 'welcome') client.id = message.id;
      if (message.type === 'clockPong') {
        const sentAtForProbe = client.clockProbeTimes.get(message.sequence);
        if (!Number.isFinite(sentAtForProbe) || !Number.isFinite(message.serverTime)) return;
        client.clockProbeTimes.delete(message.sequence);
        client.clockSamples.push({
          roundTripMs: Math.max(0, deliveredAt - sentAtForProbe),
          offsetMs: (sentAtForProbe + deliveredAt) / 2 - message.serverTime,
        });
        if (client.clockSamples.length > 8) client.clockSamples.shift();
        const best = client.clockSamples.reduce((current, next) =>
          next.roundTripMs < current.roundTripMs ? next : current);
        client.clockOffsetMs = best.offsetMs;
        client.clockRoundTripMs = best.roundTripMs;
        return;
      }
      if (message.type === 'state') {
        client.latest = message;
        const player = message.players?.find(item => item.id === client.trackId);
        deliverAck(client, player, sentAt, deliveredAt, 'app');
        if (client.active && player && Number.isFinite(message.serverTime)) {
          client.legacySamples = appendPositionSample(client.legacySamples, {
            time: deliveredAt, x: player.x, y: player.y, z: player.z || 0,
            vx: player.vx, vy: player.vy, vz: player.vz,
          });
          client.alignedSamples = appendPositionSample(client.alignedSamples, {
            time: message.serverTime + (client.clockOffsetMs || 0),
            x: player.x, y: player.y, z: player.z || 0,
            vx: player.vx, vy: player.vy, vz: player.vz,
          });
          client.authoritativeSamples.push({
            time: message.serverTime, x: player.x, y: player.y, inputSeq: player.inputSeq,
            moving: player.moving,
            vx: player.vx || 0, vy: player.vy || 0,
          });
        }
        notifyState(client, message);
      }
    };
    if (delayMs > 0) setTimeout(deliver, delayMs);
    else deliver();
  });
  return client;
}

function trackedPlayer(client) {
  return client.latest?.players?.find(player => player.id === client.trackId) || null;
}

async function sendInputSeries(client, firstSequence, count, x, y, sentAt) {
  const start = performance.now();
  for (let index = 0; index < count; index += 1) {
    const target = start + index * 1000 / FIXED_INPUT_HZ;
    if (target > performance.now()) await sleep(target - performance.now());
    const sequence = firstSequence + index;
    sentAt.set(sequence, performance.now());
    client.send({ type: 'input', location: 'clearing', dimensionId: 'surface', commands: [{
      seq: sequence, x, y, motion: true, run: false, crouch: false, jump: false,
    }] });
  }
  return performance.now();
}

function startDisplayCapture(client, moverId, firstSequence) {
  client.displayTimer = setInterval(() => {
    if (!client.active || client.clockOffsetMs === null) return;
    const player = client.latest?.players?.find(item => item.id === moverId);
    if (!player || player.inputSeq < firstSequence) return;
    const now = performance.now();
    const legacy = interpolatePosition(client.legacySamples, now - REMOTE_INTERPOLATION_DELAY_MS);
    const aligned = interpolatePosition(client.alignedSamples, now - REMOTE_INTERPOLATION_DELAY_MS);
    if (!legacy || !aligned) return;
    client.displayFrames.push({
      serverTime: now - client.clockOffsetMs,
      speed: Math.hypot(player.vx || 0, player.vy || 0),
      inputSeq: player.inputSeq,
      moving: player.moving,
      legacy, aligned,
    });
  }, 1000 / 60);
}

function summarizeDisplayLag(client, mode, firstMoveSequence, lastMoveSequence) {
  const errors = [], lagMs = [];
  for (const frame of client.displayFrames) {
    if (frame.inputSeq < firstMoveSequence || frame.inputSeq > lastMoveSequence || frame.speed < .2) continue;
    const authoritative = interpolatePosition(client.authoritativeSamples, frame.serverTime, 0);
    if (!authoritative) continue;
    const rendered = frame[mode];
    const error = Math.hypot(rendered.x - authoritative.x, rendered.y - authoritative.y);
    errors.push(error);
    lagMs.push(error / frame.speed * 1000);
  }
  let backwards = 0;
  let previousX = null;
  let minimumForwardStep = Infinity;
  for (const frame of client.displayFrames) {
    if (frame.inputSeq < firstMoveSequence || frame.inputSeq > lastMoveSequence) continue;
    const renderedX = frame[mode].x;
    if (previousX !== null) {
      const delta = renderedX - previousX;
      if (delta < -.005) backwards += 1;
      if (delta > .0005) minimumForwardStep = Math.min(minimumForwardStep, delta);
    }
    previousX = renderedX;
  }

  const firstStopped = client.authoritativeSamples.find(sample =>
    sample.inputSeq >= lastMoveSequence + 1 && !sample.moving && Math.hypot(sample.vx, sample.vy) < .05);
  const finalStopped = [...client.authoritativeSamples].reverse().find(sample =>
    sample.inputSeq >= lastMoveSequence + 1 && !sample.moving && Math.hypot(sample.vx, sample.vy) < .05);
  let visualStopMs = null;
  if (firstStopped && finalStopped) {
    let settledFrames = 0;
    for (const frame of client.displayFrames) {
      if (frame.serverTime < firstStopped.time) continue;
      const rendered = frame[mode];
      if (Math.hypot(rendered.x - finalStopped.x, rendered.y - finalStopped.y) <= .04) {
        settledFrames += 1;
        if (settledFrames >= 4) {
          visualStopMs = frame.serverTime - firstStopped.time;
          break;
        }
      } else settledFrames = 0;
    }
  }
  return {
    worldError: summary(errors),
    equivalentLagMs: summary(lagMs),
    backwardCorrections: backwards,
    minimumForwardStep: Number.isFinite(minimumForwardStep) ? minimumForwardStep : null,
    visualStopMs,
  };
}

async function runCase({ tickMs, snapshotMs, clientDelayMs, repeat }) {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-latency-study-'));
  const resolveSession = async token => ({ profile: {
    id: token,
    username: token === 'latency-mover' ? 'RitmoUm' : 'RitmoDois',
    displayName: token === 'latency-mover' ? 'RitmoUm' : 'RitmoDois',
    guest: true,
    inventory: { wood: 0, stone: 0, berries: 0 },
  } });
  const server = createPrototypeServer({
    host: '127.0.0.1', port: 0, stateDirectory, allowedOrigin: ORIGIN,
    resolveSession, databaseUrl: null, redisUrl: null,
    tickIntervalMs: tickMs, snapshotIntervalMs: snapshotMs,
  });
  const address = await server.listen();
  const sentAt = new Map();
  const metrics = { statePackets: 0, stateBytes: 0 };
  const sender = makeClient(address, 'latency-mover', 'RitmoUm', clientDelayMs, metrics, sentAt);
  const observer = makeClient(address, 'latency-observer', 'RitmoDois', clientDelayMs, metrics, sentAt);
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  let result;

  try {
    await Promise.all([
      new Promise((resolve, reject) => { sender.socket.once('open', resolve); sender.socket.once('error', reject); }),
      new Promise((resolve, reject) => { observer.socket.once('open', resolve); observer.socket.once('error', reject); }),
      waitForState(sender, message => message.players?.length === 2, 'dois jogadores no cliente emissor'),
      waitForState(observer, message => message.players?.length === 2, 'dois jogadores no cliente observador'),
    ]);
    await sleep(250);
    await waitUntil(() => sender.clockOffsetMs !== null && observer.clockOffsetMs !== null,
      'sincronização de relógio dos dois clientes');
    sender.trackId = sender.id;
    observer.trackId = sender.id;
    const initial = trackedPlayer(sender);
    if (!initial) throw new Error('Jogador emissor não apareceu no snapshot.');
    sender.wireAck = sender.appAck = initial.inputSeq || 0;
    observer.wireAck = observer.appAck = initial.inputSeq || 0;
    const sentSequenceBase = initial.inputSeq || 0;
    const runStartedAt = performance.now();
    const cpuStarted = process.cpuUsage();
    loopDelay.enable();
    sender.active = observer.active = true;
    const firstMoveSequence = sentSequenceBase + 1;
    const lastMoveSequence = sentSequenceBase + MOVEMENT_STEPS;
    startDisplayCapture(observer, sender.id, firstMoveSequence);

    await sendInputSeries(sender, sentSequenceBase + 1, MOVEMENT_STEPS, 1, 0, sentAt);
    const firstStopSequence = sentSequenceBase + MOVEMENT_STEPS + 1;
    const stopStartAt = performance.now();
    for (const client of [sender, observer]) {
      client.stopStartAt = stopStartAt;
      client.firstStopSequence = firstStopSequence;
    }
    const lastSequence = sentSequenceBase + MOVEMENT_STEPS + STOP_STEPS;
    await sendInputSeries(sender, firstStopSequence, STOP_STEPS, 0, 0, sentAt);
    await Promise.all([sender, observer].map(client => waitForState(
      client,
      message => {
        const player = message.players?.find(item => item.id === sender.id);
        return player && player.inputSeq >= lastSequence && player.moving === false
          && Math.hypot(player.vx || 0, player.vy || 0) < .05;
      },
      `parada e confirmação até ${lastSequence}`,
      8_000,
    )));

    const finishedAt = performance.now();
    sender.active = observer.active = false;
    clearInterval(sender.displayTimer);
    clearInterval(observer.displayTimer);
    loopDelay.disable();
    const cpu = process.cpuUsage(cpuStarted);
    const windowMs = finishedAt - runStartedAt;
    const senderFinal = trackedPlayer(sender);
    const observerFinal = observer.latest?.players?.find(item => item.id === sender.id) || null;
    const positions = [sender, observer].flatMap(client => client.appLatencyMs);
    result = {
      repeat, tickMs, snapshotMs, clientDelayMs, peers: 2,
      measurementWindowMs: windowMs,
      senderAckWireMs: summary(sender.wireLatencyMs),
      senderAckAppMs: summary(sender.appLatencyMs),
      remoteSnapshotWireMs: summary(observer.wireLatencyMs),
      remoteSnapshotAppMs: summary(observer.appLatencyMs),
      clientClockRttMs: { sender: sender.clockRoundTripMs, observer: observer.clockRoundTripMs },
      remoteRenderedLegacy: summarizeDisplayLag(observer, 'legacy', firstMoveSequence, lastMoveSequence),
      remoteRenderedClockAligned: summarizeDisplayLag(observer, 'aligned', firstMoveSequence, lastMoveSequence),
      estimatedRemotePresentationMs: {
        p50: percentile(observer.appLatencyMs, .5) + REMOTE_INTERPOLATION_DELAY_MS,
        p95: percentile(observer.appLatencyMs, .95) + REMOTE_INTERPOLATION_DELAY_MS,
        interpolationBufferMs: REMOTE_INTERPOLATION_DELAY_MS,
      },
      remoteStopWireMs: observer.wireStopAt === null ? null : observer.wireStopAt - stopStartAt,
      remoteStopMs: observer.appStopAt === null ? null : observer.appStopAt - stopStartAt,
      senderStopMs: sender.appStopAt === null ? null : sender.appStopAt - stopStartAt,
      statePackets: metrics.statePackets,
      stateBytes: metrics.stateBytes,
      statePacketsPerSecond: metrics.statePackets * 1000 / windowMs,
      stateBytesPerSecond: metrics.stateBytes * 1000 / windowMs,
      combinedProcessCpuPercent: (cpu.user + cpu.system) / 1000 / windowMs * 100,
      eventLoopDelayMs: {
        p95: loopDelay.percentile(95) / 1e6,
        max: loopDelay.max / 1e6,
      },
      movementDistance: senderFinal ? senderFinal.x - initial.x : null,
      remotePositionError: senderFinal && observerFinal
        ? Math.hypot(senderFinal.x - observerFinal.x, senderFinal.y - observerFinal.y)
        : null,
      finalSequence: senderFinal?.inputSeq ?? null,
      finalMoving: senderFinal?.moving ?? null,
      finalSpeed: senderFinal ? Math.hypot(senderFinal.vx || 0, senderFinal.vy || 0) : null,
      latencySampleCount: positions.length,
    };
    if (!senderFinal || !observerFinal || result.finalSequence < lastSequence
        || result.finalMoving !== false || result.finalSpeed >= .05
        || result.remotePositionError > .0001 || result.movementDistance < .5
        || result.remoteStopMs === null || result.senderStopMs === null) {
      throw new Error(`A medição falhou na invariável de movimento/parada: ${JSON.stringify(result)}`);
    }
  } finally {
    clearInterval(sender.displayTimer);
    clearInterval(observer.displayTimer);
    clearInterval(sender.clockProbeTimer);
    clearInterval(observer.clockProbeTimer);
    sender.socket.terminate();
    observer.socket.terminate();
    await server.close();
    await rm(stateDirectory, { recursive: true, force: true });
  }
  return result;
}

const configurations = [
  { label: 'baseline-20hz', tickMs: 50, snapshotMs: 50 },
  { label: 'candidate-25hz', tickMs: 40, snapshotMs: 40 },
  { label: 'candidate-30hz', tickMs: 1000 / 30, snapshotMs: 1000 / 30 },
];
const runs = [];
for (let repeat = 0; repeat < repeats; repeat += 1) {
  for (const clientDelayMs of [0, 80]) {
    const ordered = repeat % 2 === 0 ? configurations : [...configurations].reverse();
    for (const configuration of ordered) {
      const result = await runCase({ ...configuration, clientDelayMs, repeat: repeat + 1 });
      result.configuration = configuration.label;
      runs.push(result);
      console.log(JSON.stringify({
        repeat: result.repeat,
        configuration: result.configuration,
        clientDelayMs,
        senderAckP50: result.senderAckAppMs.p50,
        remoteP50: result.remoteSnapshotAppMs.p50,
        remoteP95: result.remoteSnapshotAppMs.p95,
        correctedLagP50: result.remoteRenderedClockAligned.equivalentLagMs.p50,
        packetsPerSecond: result.statePacketsPerSecond,
        bytesPerSecond: result.stateBytesPerSecond,
        stopMs: result.remoteStopMs,
        cpuPercent: result.combinedProcessCpuPercent,
        eventLoopP95: result.eventLoopDelayMs.p95,
      }));
    }
  }
}

const groups = new Map();
for (const run of runs) {
  const key = `${run.configuration}|delay-${run.clientDelayMs}ms`;
  const group = groups.get(key) || [];
  group.push(run);
  groups.set(key, group);
}
const aggregate = Object.fromEntries([...groups].map(([key, group]) => [key, {
  repetitions: group.length,
  senderAckAppP50Ms: summary(group.map(item => item.senderAckAppMs.p50)),
  senderAckAppP95Ms: summary(group.map(item => item.senderAckAppMs.p95)),
  remoteSnapshotAppP50Ms: summary(group.map(item => item.remoteSnapshotAppMs.p50)),
  remoteSnapshotAppP95Ms: summary(group.map(item => item.remoteSnapshotAppMs.p95)),
  remoteRenderedLegacyLagP50Ms: summary(group.map(item => item.remoteRenderedLegacy.equivalentLagMs.p50)),
  remoteRenderedLegacyLagP95Ms: summary(group.map(item => item.remoteRenderedLegacy.equivalentLagMs.p95)),
  remoteRenderedClockAlignedLagP50Ms: summary(group.map(item => item.remoteRenderedClockAligned.equivalentLagMs.p50)),
  remoteRenderedClockAlignedLagP95Ms: summary(group.map(item => item.remoteRenderedClockAligned.equivalentLagMs.p95)),
  remoteRenderedLegacyStopMs: summary(group.map(item => item.remoteRenderedLegacy.visualStopMs).filter(Number.isFinite)),
  remoteRenderedClockAlignedStopMs: summary(group.map(item => item.remoteRenderedClockAligned.visualStopMs).filter(Number.isFinite)),
  remoteRenderedLegacyBackwards: summary(group.map(item => item.remoteRenderedLegacy.backwardCorrections)),
  remoteRenderedClockAlignedBackwards: summary(group.map(item => item.remoteRenderedClockAligned.backwardCorrections)),
  remoteStopMs: summary(group.map(item => item.remoteStopMs)),
  statePacketsPerSecond: summary(group.map(item => item.statePacketsPerSecond)),
  stateBytesPerSecond: summary(group.map(item => item.stateBytesPerSecond)),
  combinedProcessCpuPercent: summary(group.map(item => item.combinedProcessCpuPercent)),
  eventLoopDelayP95Ms: summary(group.map(item => item.eventLoopDelayMs.p95)),
  movementDistance: summary(group.map(item => item.movementDistance)),
  remotePositionError: summary(group.map(item => item.remotePositionError)),
  finalSequence: group.map(item => item.finalSequence),
  finalMoving: group.map(item => item.finalMoving),
  finalSpeed: group.map(item => item.finalSpeed),
}]));

await mkdir(outputDirectory, { recursive: true });
const output = {
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cpuModel: os.cpus()[0]?.model,
    logicalCpuCount: os.cpus().length,
  },
  methodology: {
    workload: 'dois clientes; emissor caminha por 60 passos a 60 Hz e para com 90 comandos neutros; observador recebe snapshots compactados',
    artificialClientDelay: 'delay é aplicado em cada sentido do WebSocket e na entrega do evento ao cliente; 80 ms por perna para a condição congestionada',
    comparisons: configurations.map(({ label, tickMs, snapshotMs }) => ({ label, tickMs, snapshotMs })),
    metricDefinitions: {
      senderAckAppMs: 'da emissão do comando à confirmação processada pelo cliente emissor',
      remoteSnapshotAppMs: 'da emissão do comando ao snapshot processado pelo segundo cliente',
      estimatedRemotePresentationMs: 'remoteSnapshotAppMs mais o buffer de interpolação do cliente; estimativa, não captura de pixels',
      processCpu: 'CPU combinada do processo do benchmark (servidor e dois clientes WebSocket locais)',
      traffic: 'bytes e snapshots recebidos pelos dois clientes durante o intervalo medido',
    },
  },
  aggregate,
  runs,
};
await writeFile(path.join(outputDirectory, 'result.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ output: path.join(outputDirectory, 'result.json'), aggregate }, null, 2));
