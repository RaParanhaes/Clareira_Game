import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';

const origin = 'https://network-latency-test.invalid';

function openClient(address, name) {
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin, cookie: `clareira_session=${name}` },
  });
  const client = { socket, messages: [], stateCount: 0, waiters: [] };
  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    client.messages.push(message);
    if (message.type === 'state') client.stateCount += 1;
    for (const waiter of [...client.waiters]) {
      if (!waiter.predicate(message)) continue;
      client.waiters.splice(client.waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'join', compactWorld: 1, viewport: { width: 1440, height: 900 } }));
      resolve(client);
    });
  });
}

function waitFor(client, predicate, timeoutMs = 3000) {
  const existing = client.messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve };
    waiter.timeout = setTimeout(() => {
      client.waiters.splice(client.waiters.indexOf(waiter), 1);
      reject(new Error('Timeout waiting for a multiplayer state'));
    }, timeoutMs);
    client.waiters.push(waiter);
  });
}

test('movement reaches another client quickly and compact snapshots stay near 20 Hz', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-network-latency-'));
  const room = createPrototypeServer({
    port: 0,
    stateDirectory,
    allowedOrigin: origin,
    ambientCampfire: false,
    arrivalTutorialEnabled: false,
    resolveSession: token => ({ profile: {
      id: token,
      guest: true,
      displayName: token,
      inventory: { wood: 0, stone: 0, berries: 0 },
    } }),
  });
  const address = await room.listen();
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.socket.terminate();
    await room.close();
    await rm(stateDirectory, { recursive: true, force: true });
  });

  const first = await openClient(address, 'latency-first');
  clients.push(first);
  const firstId = (await waitFor(first, message => message.type === 'welcome')).id;
  await waitFor(first, message => message.type === 'state' && message.players.length === 1);

  const second = await openClient(address, 'latency-second');
  clients.push(second);
  const secondId = (await waitFor(second, message => message.type === 'welcome')).id;
  const [firstState, secondState] = await Promise.all([
    waitFor(first, message => message.type === 'state' && message.players.some(player => player.id === secondId)),
    waitFor(second, message => message.type === 'state' && message.players.some(player => player.id === firstId)),
  ]);
  const initial = secondState.players.find(player => player.id === firstId);
  assert.ok(initial, 'the receiving client sees the moving player before input');
  first.stateCount = 0;
  second.stateCount = 0;

  const movementStarted = performance.now();
  const remoteMovement = waitFor(second, message => {
    const player = message.type === 'state' && message.players.find(item => item.id === firstId);
    return player && Math.hypot(player.x - initial.x, player.y - initial.y) > 0.01;
  });
  first.socket.send(JSON.stringify({
    type: 'input',
    location: 'clearing',
    dimensionId: 'surface',
    commands: Array.from({ length: 6 }, (_, index) => ({ seq: index + 1, x: -1, y: 0, motion: true })),
  }));
  const observed = await remoteMovement;
  const inputToRemoteMs = performance.now() - movementStarted;
  assert.ok(observed.players.some(player => player.id === firstId && player.moving));
  assert.ok(!('resources' in observed), 'ordinary movement packets omit unchanged world data');
  assert.ok(inputToRemoteMs < 150, `remote movement took ${inputToRemoteMs.toFixed(1)} ms`);

  second.stateCount = 0;
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.ok(second.stateCount >= 14 && second.stateCount <= 26,
    `received ${second.stateCount} snapshots in one second`);
  t.diagnostic(`input-to-remote ${inputToRemoteMs.toFixed(1)} ms; ${second.stateCount} snapshots/s`);

  assert.equal(firstState.players.length, 2);
});

test('authenticated clock pong reports bounded server diagnostics without changing protocol timing',async t=>{
 const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-clock-'));
 const room=createPrototypeServer({port:0,stateDirectory,allowedOrigin:origin,ambientCampfire:false,arrivalTutorialEnabled:false,
  resolveSession:token=>({profile:{id:token,guest:true,displayName:'Clock probe'}})});
 const address=await room.listen();const client=await openClient(address,'clock-probe');
 t.after(async()=>{client.socket.terminate();await room.close();await rm(stateDirectory,{recursive:true,force:true});});
 await waitFor(client,m=>m.type==='welcome');
 client.socket.send(JSON.stringify({type:'clockPing',sequence:1}));
 const pong=await waitFor(client,m=>m.type==='clockPong'&&m.sequence===1);
 for(const field of ['serverTime','serverLoopLagMs','serverWorkMs','serverBufferedBytes'])assert.ok(Number.isFinite(pong[field])&&pong[field]>=0,field);
 assert.equal(pong.accountId,undefined);
 client.socket.send(JSON.stringify({type:'clockPing',sequence:2}));
 await new Promise(resolve=>setTimeout(resolve,80));
 assert.ok(!client.messages.some(m=>m.type==='clockPong'&&m.sequence===2),'existing anti-flood interval remains active');
});
