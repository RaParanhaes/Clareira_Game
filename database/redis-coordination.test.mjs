import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createRedisCoordination } from './redis-coordination.mjs';
import { createPrototypeServer } from '../scripts/prototype-server.mjs';
import WebSocket from 'ws';

const redisUrl = process.env.TEST_REDIS_URL;
const testOrigin = 'https://redis-test.clareira.invalid';

test('a transient Redis heartbeat error keeps the lease registered for retry', async () => {
  let heartbeatCalls = 0;
  const client = new EventEmitter();
  client.isReady = true;
  client.isOpen = true;
  client.eval = async script => {
    if (!script.includes('PEXPIRE')) return 1;
    heartbeatCalls += 1;
    if (heartbeatCalls === 1) throw new Error('temporary Redis interruption');
    return heartbeatCalls === 3 ? 0 : 1;
  };
  const coordination = createRedisCoordination({ client, serverId: 'heartbeat-test', leaseTtlMs: 2_000 });
  await coordination.claimPlayer({ playerId: 'heartbeat-player', sessionId: 'heartbeat-session' });

  assert.deepEqual(await coordination.heartbeat(), new Set(), 'a transient error is not proof of lost ownership');
  assert.deepEqual(await coordination.heartbeat(), new Set(), 'the registration is retried after recovery');
  assert.equal(heartbeatCalls, 2);
  assert.deepEqual(await coordination.heartbeat(), new Set(['heartbeat-session']), 'a genuinely expired lease is reported');
  assert.equal(heartbeatCalls, 3);
  await coordination.close();
});

test('Redis coordinates one active session per player and refreshes presence context', { skip: !redisUrl }, async () => {
  const serverA = createRedisCoordination({ url: redisUrl, serverId: 'game-a', leaseTtlMs: 2_000 });
  const serverB = createRedisCoordination({ url: redisUrl, serverId: 'game-b', leaseTtlMs: 2_000 });
  const playerId = `redis-test-${randomUUID()}`;
  try {
    await Promise.all([serverA.ready(), serverB.ready()]);
    const session = await serverA.claimPlayer({
      playerId,
      sessionId: 'session-a',
      contextId: 'world.clareira/dimension.surface/place.clearing/instance.surface-clearing',
    });
    assert.ok(session);
    assert.equal(await serverB.claimPlayer({ playerId, sessionId: 'session-b' }), null);

    session.update({
      location: 'room',
      contextId: 'world.clareira/dimension.surface/place.room/instance.account%3A123',
    });
    assert.deepEqual(await serverA.heartbeat(), new Set());
    const presence = await serverA.getPlayerPresence(playerId);
    assert.equal(presence.playerId, playerId);
    assert.equal(presence.sessionId, 'session-a');
    assert.equal(presence.serverId, 'game-a');
    assert.equal(presence.contextId, 'world.clareira/dimension.surface/place.room/instance.account%3A123');
    assert.equal(presence.location, 'room');
    assert.ok(presence.lastSeenAt >= presence.connectedAt);

    await session.release();
    assert.equal(await serverA.getPlayerPresence(playerId), null);
    const replacement = await serverB.claimPlayer({ playerId, sessionId: 'session-b' });
    assert.ok(replacement);
    await replacement.release();

    const expiring = await serverA.claimPlayer({ playerId, sessionId: 'session-expiring' });
    assert.ok(expiring);
    await new Promise(resolve => setTimeout(resolve, 2_100));
    const afterExpiry = await serverB.claimPlayer({ playerId, sessionId: 'session-after-expiry' });
    assert.ok(afterExpiry, 'a crashed process stops owning the profile after its lease TTL');
    await expiring.release();
    assert.equal((await serverB.getPlayerPresence(playerId)).sessionId, 'session-after-expiry',
      'a stale process cannot delete the replacement lease');
    await afterExpiry.release();
  } finally {
    await Promise.allSettled([serverA.close(), serverB.close()]);
  }
});

function openSocket(address, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: testOrigin, cookie: `clareira_session=${token}` },
  });
  socket.on('error', () => {});
  return socket;
}

function waitForConnectionResult(socket) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ status: 0 }), 3_000);
    socket.once('open', () => { clearTimeout(timer); resolve({ status: 101 }); });
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      const status = response.statusCode;
      response.resume();
      resolve({ status });
    });
  });
}

test('game servers reject a duplicate account lease and accept it after disconnect', { skip: !redisUrl }, async t => {
  const profile = {
    id: 'd14d3e36-2311-44b1-a2d1-3af43c7407f6',
    displayName: 'Pessoa Redis',
    guest: false,
    inventory: { wood: 0, stone: 0, berries: 0 },
  };
  const resolveSession = async token => token === 'shared-account'
    ? { profile }
    : null;
  const options = { port: 0, allowedOrigin: testOrigin, resolveSession, redisUrl };
  const firstServer = createPrototypeServer(options);
  const secondServer = createPrototypeServer(options);
  const [firstAddress, secondAddress] = await Promise.all([firstServer.listen(), secondServer.listen()]);
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await Promise.all([firstServer.close(), secondServer.close()]);
  });

  const firstSocket = openSocket(firstAddress, 'shared-account');
  sockets.push(firstSocket);
  assert.equal((await waitForConnectionResult(firstSocket)).status, 101);

  const duplicate = openSocket(secondAddress, 'shared-account');
  sockets.push(duplicate);
  assert.equal((await waitForConnectionResult(duplicate)).status, 409);

  const firstClosed = new Promise(resolve => firstSocket.once('close', resolve));
  firstSocket.close();
  await firstClosed;
  let replacement;
  let replacementStatus = 409;
  for (let attempt = 0; attempt < 10 && replacementStatus === 409; attempt += 1) {
    replacement = openSocket(secondAddress, 'shared-account');
    sockets.push(replacement);
    replacementStatus = (await waitForConnectionResult(replacement)).status;
    if (replacementStatus === 409) {
      replacement.terminate();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  assert.equal(replacementStatus, 101);
});
