import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import {
  DIMENSION_COORDINATE_OFFSET, RESOURCE_NODES, ROOM_SPAWN, SPAWN_CAMPFIRE, WORLD_COORDINATE_VERSION, WORLD_SIZE,
} from '../game/world.mjs';
import { waterStateAt, WATER_WADING_DEPTH } from '../game/waterways.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { createAccountStore, saveAccountProgress } from './account-store.mjs';
import { loadAccountRoom, saveAccountRoom } from './room-store.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createJsonWorldStore } from './world-store.mjs';
import { createJsonDimensionStore } from './dimension-store.mjs';
import { LODGING_OFFER_BY_KEY, lodgingRoomKey } from '../game/lodging-catalog.mjs';
import { getCampfireGatheringCount } from '../game/social.mjs';
import { WILDLIFE_BY_ID } from '../game/wildlife.mjs';
import { DEFAULT_DIMENSIONS } from '../game/dimensions.mjs';
import { WORLD_NATURE_ORIGIN } from '../game/world-scale.mjs';
import {
  CAMPFIRE_DECAY_DELAY_MS, CAMPFIRE_DECAY_DURATION_MS, CAMPFIRE_DECAY_REBUILD_COST, CAMPFIRE_FEED_COST,
  CAMPFIRE_FEED_WINDOW_MS, CAMPFIRE_IGNITION_RAMP_MS, CAMPFIRE_LIFETIME_MS, CAMPFIRE_NEW_COST,
  CAMPFIRE_REKINDLE_COST,
} from '../game/campfire-life.mjs';

const TEST_ORIGIN = 'https://test.clareira.invalid';
const TEST_COOKIE = 'clareira_session=test-session-token';
const surfaceCoord = value => value + DIMENSION_COORDINATE_OFFSET;
const surfacePosition = (x, y) => ({ x: surfaceCoord(x), y: surfaceCoord(y) });
const southBranch = RESOURCE_NODES.find(resource => resource.id === 'branch-south');
const directionToward = (from, target) => {
  const dx = target.x - from.x, dy = target.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
};
const testServerCleanup = new WeakMap();
function createTestServer(t, options) {
  const stateDirectory = options.stateDirectory || mkdtempSync(path.join(os.tmpdir(), 'clareira-prototype-test-'));
  let directories = testServerCleanup.get(t);
  if (!directories) {
    directories = new Map();
    testServerCleanup.set(t, directories);
  }
  const directoryKey = path.resolve(stateDirectory);
  let cleanup = directories.get(directoryKey);
  if (!cleanup) {
    cleanup = { closeRooms: [] };
    directories.set(directoryKey, cleanup);
    t.after(async () => {
      for (const closeRoom of cleanup.closeRooms) await closeRoom();
      await rm(stateDirectory, { recursive: true, force: true });
    });
  }

  const server = createPrototypeServer({ arrivalTutorialEnabled: false, ...options, stateDirectory });
  let closePromise = null;
  const room = { ...server, close() { closePromise ||= server.close(); return closePromise; } };
  cleanup.closeRooms.push(() => room.close());
  return room;
}
const testIdentity = async token => token === 'test-session-token' ? {
  profile: { id: 'e04d06d9-b215-4d08-b4b9-894dd63477cc', displayName: 'Viajante', guest: true, inventory: { wood: 0, stone: 0, berries: 0 } },
} : null;

function openTestPlayer(address, token = 'test-session-token') {
  return new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: TEST_ORIGIN, cookie: `clareira_session=${token}` },
  });
}

function waitFor(socket, predicate, timeout = 2500, description = 'room message') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', listener); reject(new Error(`Timed out waiting for ${description}`)); }, timeout);
    const listener = raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer); socket.off('message', listener); resolve(message);
    };
    socket.on('message', listener);
  });
}

test('room gives each connection an identity and ignores client attempts to spoof account names', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const first = openTestPlayer(address);
  const second = openTestPlayer(address);
  t.after(() => { first.terminate(); second.terminate(); });
  const twoPlayers = waitFor(first, message => message.type === 'state' && message.players.length === 2, 2500, 'two-player snapshot');
  await Promise.all([new Promise(resolve => first.once('open', resolve)), new Promise(resolve => second.once('open', resolve))]);
  await twoPlayers;
  const joined = waitFor(second, message => message.type === 'state' && message.players.length === 2
    && message.players.every(player => player.name === 'Viajante'), 2500, 'authoritative account names');
  first.send(JSON.stringify({ type: 'join', name: 'Pessoa Clareira' }));
  const state = await joined;
  assert.ok(state.resources.length > 0);
  assert.ok(state.resources.length < 500, 'o snapshot contém recursos do interesse próximo');
  assert.ok(Array.isArray(state.animals) && state.animals.length > 0, 'a clareira envia fauna próxima no snapshot');
  assert.ok(Array.isArray(state.villageActors) && state.villageActors.length > 0,
    'os moradores próximos chegam no snapshot inicial da vila');
  assert.ok(state.villageActors.length <= 6, 'a região nunca envia mais que o teto local de moradores');
  assert.equal(new Set(state.villageActors.map(actor=>actor.id)).size,state.villageActors.length);
  assert.ok(state.villageActors.every(actor=>actor.npc===true&&actor.dimensionId==='surface'));
  for (const animal of state.animals) {
    assert.ok(WILDLIFE_BY_ID.has(animal.speciesId), `espécie desconhecida no snapshot: ${animal.speciesId}`);
    assert.ok(Number.isFinite(animal.x) && Number.isFinite(animal.y));
    assert.ok(animal.shelter?.id&&animal.shelter.kind,'fauna possui um abrigo identificado no snapshot');
    assert.ok(animal.shelter.cover?.kind&&Number.isFinite(animal.shelter.cover.x),'abrigo possui cobertura natural identificada');
    assert.ok(Number.isFinite(animal.shelter.x)&&Number.isFinite(animal.shelter.y));
    assert.ok(!['cow','ox','bull'].includes(animal.speciesId),'animais de curral não são espalhados sem uma fazenda');
  }
  assert.equal(state.players.length, 2);
  const dx = state.players[0].x - state.players[1].x;
  const dy = state.players[0].y - state.players[1].y;
  assert.ok(Math.abs((dx - dy) * 8) >= 18 || Math.abs((dx + dy) * 4.5) >= 32);
});

test('a transient presence heartbeat failure does not disconnect the connected player', async t => {
  let activeLeases = 0, heartbeatCalls = 0;
  const coordination = {
    enabled: true,
    async ready() {},
    async claimPlayer({ sessionId }) {
      activeLeases += 1;
      return { sessionId, update() {}, async release() { activeLeases -= 1; } };
    },
    async heartbeat() {
      if (!activeLeases) return new Set();
      heartbeatCalls += 1;
      if (heartbeatCalls === 1) throw new Error('temporary Redis interruption');
      return new Set();
    },
    async close() {},
  };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN,
    resolveSession: testIdentity, redisCoordination: coordination, coordinationHeartbeatMs: 1000 });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  await new Promise((resolve, reject) => { player.once('open', resolve); player.once('error', reject); });
  const deadline = Date.now() + 3500;
  while (heartbeatCalls < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(heartbeatCalls >= 2, 'the heartbeat retried after its transient failure');
  assert.equal(player.readyState, WebSocket.OPEN, 'a healthy game socket remains connected');
});

test('concurrent connections for one registered account admit only one socket', async t => {
  const profile = { id: 'd14d3e36-2311-44b1-a2d1-3af43c7407f6', username: 'same-account', guest: false,
    inventory: { wood: 0, stone: 0, berries: 0 } };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => {
      if (token !== 'same-account') return null;
      await new Promise(resolve => setTimeout(resolve, 25));
      return { profile };
    } });
  const address = await room.listen();
  t.after(() => room.close());
  const sockets = [openTestPlayer(address, 'same-account'), openTestPlayer(address, 'same-account')];
  t.after(() => sockets.forEach(socket => socket.terminate()));
  const result = socket => new Promise(resolve => {
    const finish = status => { clearTimeout(timer); resolve(status); };
    const timer = setTimeout(() => finish(0), 3000);
    socket.once('open', () => finish(101));
    socket.once('unexpected-response', (_request, response) => { response.resume(); finish(response.statusCode); });
    socket.once('close', () => finish(0));
    socket.on('error', () => {});
  });
  const statuses = await Promise.all(sockets.map(result));
  assert.deepEqual(statuses.slice().sort((a, b) => a - b), [101, 409]);
  const accepted = sockets[statuses.indexOf(101)];
  await waitFor(accepted, message => message.type === 'welcome', 2500, 'accepted account connection setup');
  sockets.forEach(socket => socket.terminate());
});

test('room synchronizes the client clock and timestamps authoritative snapshots', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initial = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial timestamped snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const state = await initial;
  assert.ok(Number.isFinite(state.serverTime));

  const pong = waitFor(player, message => message.type === 'clockPong' && message.sequence === 7, 1000, 'server clock reply');
  player.send(JSON.stringify({ type: 'clockPing', sequence: 7 }));
  const reply = await pong;
  assert.ok(Number.isFinite(reply.serverTime));
});

test('movement diagnostic reports are acknowledged only as bounded technical events',async t=>{
 const room=createTestServer(t,{ambientCampfire:false,port:0,allowedOrigin:TEST_ORIGIN,resolveSession:testIdentity});
 const address=await room.listen(),player=openTestPlayer(address);t.after(()=>player.terminate());
 const opened=new Promise(resolve=>player.once('open',resolve));
 const initial=waitFor(player,message=>message.type==='state'&&message.players.length===1,2500,'diagnostic test snapshot');
 await opened;await initial;
 const reportId='report-test-123456';
 const accepted=waitFor(player,message=>message.type==='diagnosticsAccepted'&&message.reportId===reportId,2500,'diagnostic acceptance');
 player.send(JSON.stringify({type:'clientDiagnostics',version:1,reportId,events:[
  {kind:'input-send',at:123,firstSeq:20,lastSeq:31,count:12,pending:31,outbound:0,x:1,y:0,run:true,chat:'must not be stored'},
  {kind:'private-profile',at:123,username:'must not be stored'},
 ]}));
 await accepted;
});

test('periodic performance reports are validated, coarse, idempotent, and rate limited',async t=>{
 const room=createTestServer(t,{ambientCampfire:false,port:0,allowedOrigin:TEST_ORIGIN,resolveSession:testIdentity});
 const address=await room.listen(),player=openTestPlayer(address);t.after(()=>player.terminate());
 const logs=[],originalWrite=process.stderr.write;
 process.stderr.write=function(chunk,...args){
  const value=String(chunk);
  if(value.includes('"type":"game-performance-report"')){logs.push(value);return true;}
  return originalWrite.call(this,chunk,...args);
 };
 t.after(()=>{process.stderr.write=originalWrite;});
 const opened=new Promise(resolve=>player.once('open',resolve));
 const initial=waitFor(player,message=>message.type==='state'&&message.players.length===1,2500,'telemetry test snapshot');
 await opened;await initial;
 const report={type:'performanceMetrics',version:1,reportId:'performance-report-1234',windowMs:60_000,
  context:{location:'clearing',device:'desktop',zoom:'80-110'},metrics:{frameCount:3600,frameSamples:360,drawSamples:360,
   stalls50:18,stalls250:3,fps:59.7,frameP50Ms:16.7,frameP95Ms:33.4,frameP99Ms:80,drawP50Ms:3,drawP95Ms:10,drawP99Ms:18,ackSamples:50,ackP95Ms:55,
   zoomChanges:1,zoomWaitP95Ms:680,dimensionRequests:1,dimensionRequestP95Ms:230,dimensionArrivals:1,dimensionArrivalP95Ms:4100},
  username:'private-name',playerId:'private-id',dimensionId:'private-dimension',position:{x:1,y:2}};
 const accepted=()=>waitFor(player,message=>message.type==='performanceMetricsAccepted'&&message.reportId===report.reportId,2500,'performance metrics acceptance');
 let reply=accepted();player.send(JSON.stringify(report));await reply;
 reply=accepted();player.send(JSON.stringify(report));await reply;
 assert.equal(logs.length,1,'duplicate report IDs are acknowledged without a second journal entry');
 const logged=JSON.parse(logs[0]);
 assert.equal(logged.type,'game-performance-report');assert.equal(logged.context.location,'clearing');
 assert.equal(logged.metrics.frameP95Ms,33.4);assert.equal(logged.playerId,undefined);assert.equal(logged.position,undefined);
 assert.equal(logged.context.dimensionId,undefined);assert.equal(logged.username,undefined);
});

test('room furniture is server-validated, blocks walking, and survives a short reconnect', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-furniture-'));
  await createJsonPlayerLocationStore(stateDirectory).savePlayerLocation('guest-builder-id', {
    location: 'room', dimensionId: 'surface', x: ROOM_SPAWN.x, y: ROOM_SPAWN.y,
    roomKey: 'guest:guest-builder-id', roomOwnerName: 'Construtora', color: 0,
    worldVersion: WORLD_COORDINATE_VERSION,
  });
  const guestProfiles = {
    'guest-builder': { id: 'guest-builder-id', displayName: 'Construtora', guest: true },
    'guest-outside': { id: 'guest-outside-id', displayName: 'Visitante', guest: true },
  };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => guestProfiles[token]
      ? { profile: { ...guestProfiles[token], inventory: { wood: 0, stone: 0, berries: 0 } } }
      : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  let player = openTestPlayer(address, 'guest-builder');
  const outsidePlayer = openTestPlayer(address, 'guest-outside');
  t.after(() => { player.terminate(); outsidePlayer.terminate(); });
  const initial = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'builder arrival');
  const outsideInitial = waitFor(outsidePlayer, message => message.type === 'state' && message.players.length === 1, 2500, 'outside arrival');
  await Promise.all([new Promise(resolve => player.once('open', resolve)), new Promise(resolve => outsidePlayer.once('open', resolve))]);
  let state = await initial;
  await outsideInitial;
  const id = state.players[0].id;
  assert.equal(state.roomKind, 'legacy');
  assert.equal(state.roomCanEdit, true);

  const outsideNotice = waitFor(outsidePlayer, message => message.type === 'notice' && message.text === 'Entre no quarto para colocar um móvel.', 2500, 'outdoor placement rejection');
  outsidePlayer.send(JSON.stringify({ type: 'action', name: 'placeFurniture', kind: 'stool', x: 5.5, y: 8 }));
  await outsideNotice;
  await new Promise(resolve => setTimeout(resolve, 275));

  const slopeNotice = waitFor(player, message => message.type === 'notice' && message.text === 'Esse ponto precisa estar livre, num piso plano e longe da porta.', 2500, 'ramp placement rejection');
  player.send(JSON.stringify({ type: 'action', name: 'placeFurniture', kind: 'stool', x: 8, y: 8.5 }));
  await slopeNotice;
  await new Promise(resolve => setTimeout(resolve, 300));

  const placed = waitFor(player, message => message.type === 'state' && message.roomFurniture?.length === 1, 2500, 'bench placement');
  player.send(JSON.stringify({ type: 'action', name: 'placeFurniture', kind: 'stool', x: 6, y: 9 }));
  state = await placed;
  const bench = state.roomFurniture[0];
  assert.deepEqual({ kind: bench.kind, x: bench.x, y: bench.y }, { kind: 'stool', x: 6, y: 9 });

  const nearBench = waitFor(player, message => message.type === 'state' && message.players.some(item => item.id === id
    && Math.hypot(item.x - bench.x, item.y - bench.y) < .82), 6000, 'builder approaching the bench');
  player.send(JSON.stringify({ type: 'input', ...directionToward(state.players.find(item => item.id === id), bench) }));
  state = await nearBench;
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  state = await waitFor(player, message => message.type === 'state' && message.players.some(item => item.id === id && !item.moving), 1500, 'movement stop beside the bench');
  const stopped = state.players.find(item => item.id === id);
  assert.ok(Math.hypot(stopped.x - bench.x, stopped.y - bench.y) >= .62, 'server collision leaves walking clearance');

  const disconnected = new Promise(resolve => player.once('close', resolve));
  player.close();
  await disconnected;
  player = openTestPlayer(address, 'guest-builder');
  t.after(() => player.terminate());
  const resumed = waitFor(player, message => message.type === 'state' && message.roomFurniture?.length === 1
    && message.players.some(item => item.location === 'room'), 2500, 'bench restored after reconnect');
  await new Promise(resolve => player.once('open', resolve));
  state = await resumed;
  assert.equal(state.roomFurniture[0].id, bench.id);
  const removalNotice = waitFor(player, message => message.type === 'notice' && message.text === 'Banco retirado do quarto.', 2500, 'bench removal');
  const removed = waitFor(player, message => message.type === 'state' && message.roomFurniture?.length === 0, 2500, 'empty room after removal');
  player.send(JSON.stringify({ type: 'action', name: 'removeFurniture', id: bench.id }));
  await Promise.all([removalNotice, removed]);
});

test('a nearby guest can visit an account room but cannot edit its saved furniture', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-visit-'));
  const ownerId = '1d1c4e44-d215-4e94-a1f1-2769d315457a';
  const ownerFurniture = [{ id: 'aabbccdd-1234-5678', kind: 'stool', x: 6, y: 8, rotation: 2 }];
  await saveAccountRoom(stateDirectory, ownerId, ownerFurniture);
  const profiles = {
    'room-owner': { id: ownerId, displayName: 'Pessoa da Casa', guest: false, inventory: { wood: 0, stone: 0, berries: 0 } },
    'room-visitor': { id: 'visitor-session', displayName: 'Pessoa Visitante', guest: true, inventory: { wood: 0, stone: 0, berries: 0 } },
  };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => profiles[token] ? { profile: profiles[token] } : null });
  const address = await room.listen();
  t.after(() => room.close());
  const owner = openTestPlayer(address, 'room-owner');
  let visitor = openTestPlayer(address, 'room-visitor');
  t.after(() => { owner.terminate(); visitor?.terminate(); });
  const bothPlayers = waitFor(visitor, message => message.type === 'state' && message.players.length === 2, 2500, 'owner and visitor in the clearing');
  await Promise.all([new Promise(resolve => owner.once('open', resolve)), new Promise(resolve => visitor.once('open', resolve))]);
  let state = await bothPlayers;
  const visitorId = state.players.find(player => player.name === 'Pessoa Visitante').id;
  const ownerPlayer = state.players.find(player => player.name === 'Pessoa da Casa');
  let visitorPlayer = state.players.find(player => player.id === visitorId);

  if (Math.hypot(visitorPlayer.x - ownerPlayer.x, visitorPlayer.y - ownerPlayer.y) > 1.45) {
    const refusedAtDistance = waitFor(visitor, message => message.type === 'notice' && message.text === 'Chegue perto da pessoa para visitar o quarto.', 2500, 'distant visit rejection');
    visitor.send(JSON.stringify({ type: 'action', name: 'visitRoom', playerId: ownerPlayer.id }));
    await refusedAtDistance;
    await new Promise(resolve => setTimeout(resolve, 275));
  }

  if (Math.hypot(visitorPlayer.x - ownerPlayer.x, visitorPlayer.y - ownerPlayer.y) > 1.2) {
    visitor.send(JSON.stringify({ type: 'input', x: Math.sign(ownerPlayer.x - visitorPlayer.x), y: Math.sign(ownerPlayer.y - visitorPlayer.y) }));
    state = await waitFor(visitor, message => message.type === 'state' && message.players.some(player => player.id === visitorId
      && Math.hypot(player.x - ownerPlayer.x, player.y - ownerPlayer.y) < 1.2), 8000, 'visitor approaching the owner');
    visitor.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
    visitorPlayer = state.players.find(player => player.id === visitorId);
  }
  const visited = waitFor(visitor, message => message.type === 'state' && message.roomCanEdit === false
    && message.roomFurniture?.some(item => item.id === ownerFurniture[0].id)
    && message.players.some(player => player.id === visitorId && player.location === 'room'), 3000, 'protected account room visit');
  visitor.send(JSON.stringify({ type: 'action', name: 'visitRoom', playerId: ownerPlayer.id }));
  state = await visited;
  assert.equal(state.roomOwnerName, 'Pessoa da Casa');
  assert.deepEqual(state.roomFurniture, ownerFurniture);
  await new Promise(resolve => setTimeout(resolve, 275));

  for (const [name, extra] of [
    ['placeFurniture', { kind: 'stool', x: 7, y: 8 }],
    ['rotateFurniture', { id: ownerFurniture[0].id }],
    ['moveFurniture', { id: ownerFurniture[0].id, x:7, y:8 }],
    ['removeFurniture', { id: ownerFurniture[0].id }],
  ]) {
    const protectedNotice = waitFor(visitor, message => message.type === 'notice'
      && message.text === 'Você pode visitar, mas só a pessoa dona pode mudar os móveis.', 2500, `${name} permission rejection`);
    visitor.send(JSON.stringify({ type: 'action', name, ...extra }));
    await protectedNotice;
    await new Promise(resolve => setTimeout(resolve, 275));
  }
  assert.deepEqual(await loadAccountRoom(stateDirectory, ownerId), ownerFurniture, 'guest edits cannot alter the account save');

  const disconnected = new Promise(resolve => visitor.once('close', resolve));
  visitor.close();
  await disconnected;
  visitor = openTestPlayer(address, 'room-visitor');
  const resumed = waitFor(visitor, message => message.type === 'state' && message.roomCanEdit === false
    && message.roomFurniture?.some(item => item.id === ownerFurniture[0].id)
    && message.players.some(player => player.location === 'room'), 2500, 'visitor room restored after reconnect');
  await new Promise(resolve => visitor.once('open', resolve));
  state = await resumed;
  assert.equal(state.roomOwnerName, 'Pessoa da Casa');
  const returned = waitFor(visitor, message => message.type === 'state' && message.players.some(player => player.location === 'clearing'), 2500, 'visitor returning to the clearing');
  visitor.send(JSON.stringify({ type: 'action', name: 'interact' }));
  state = await returned;
  assert.equal(state.roomCanEdit, false, 'the edit flag applies only while standing in the owned room');
  assert.deepEqual(await loadAccountRoom(stateDirectory, ownerId), ownerFurniture);
});

test('only the owner role can enter another account home, and the visit is read-only and reversible', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-owner-home-'));
  const ownerId = '762c7d65-d731-4974-9b1d-098abcb32f61';
  const residentId = '12b4a7c5-b958-42a0-bacd-f77e35d8f1c4';
  const residentFurniture = [{ id: 'cceeff00-1234-5678', kind: 'stool', x: 6, y: 8, rotation: 0 }];
  await saveAccountRoom(stateDirectory, residentId, residentFurniture);
  const profiles = {
    owner: { id: ownerId, displayName: 'Proprietário', guest: false, inventory: { wood: 0, stone: 0, berries: 0 } },
    resident: { id: residentId, displayName: 'Morador', guest: false, inventory: { wood: 0, stone: 0, berries: 0 } },
  };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => profiles[token] ? { profile: profiles[token] } : null,
    staffAuthorizationOverride: { hasPermission: async (accountId, permission) => accountId === ownerId && permission === '*' },
  });
  const address = await room.listen();
  let owner = openTestPlayer(address, 'owner');
  const resident = openTestPlayer(address, 'resident');
  t.after(() => { owner.terminate(); resident.terminate(); });
  await Promise.all([new Promise(resolve => owner.once('open', resolve)), new Promise(resolve => resident.once('open', resolve))]);
  let state = await waitFor(owner, message => message.type === 'state' && message.players.length === 2, 2500, 'two active accounts');
  const ownerPlayer = state.players.find(player => player.name === 'Proprietário');
  const residentPlayer = state.players.find(player => player.name === 'Morador');
  const entered = waitFor(owner, message => message.type === 'state' && message.roomCanEdit === false
    && message.roomFurniture?.some(item => item.id === residentFurniture[0].id)
    && message.players.some(player => player.id === ownerPlayer.id && player.location === 'room'), 3000, 'owner read-only home visit');
  owner.send(JSON.stringify({ type: 'action', name: 'ownerVisitRoom', playerId: residentPlayer.id }));
  state = await entered;
  assert.equal(state.canOwnerVisitHomes, true, 'the owner capability is personalized to the authorized account');
  assert.equal(state.roomOwnerName, 'Morador');
  assert.deepEqual(state.roomFurniture, residentFurniture);
  const denied = waitFor(resident, message => message.type === 'notice' && message.text === 'Essa ação é exclusiva do Proprietário.', 2500, 'non-owner visit rejection');
  resident.send(JSON.stringify({ type: 'action', name: 'ownerVisitRoom', playerId: ownerPlayer.id }));
  await denied;
  await new Promise(resolve => setTimeout(resolve, 300));
  const returnedNotice = waitFor(owner, message => message.type === 'notice', 3000, 'owner visit return notice');
  const returned = waitFor(owner, message => message.type === 'state' && message.roomKey === `account:${ownerId}`
    && message.players.some(player => player.id === ownerPlayer.id && player.location === 'clearing'), 3000, 'owner returned to origin');
  owner.send(JSON.stringify({ type: 'action', name: 'interact' }));
  const returnResult = await returnedNotice;
  assert.equal(returnResult.text, 'Você voltou ao local de onde entrou.');
  state = await returned;
  assert.equal(state.roomKey, `account:${ownerId}`, JSON.stringify({ roomKey: state.roomKey,
    ownerLocation: state.players.find(player => player.id === ownerPlayer.id)?.location }));
  assert.deepEqual(await loadAccountRoom(stateDirectory, residentId), residentFurniture);
  await new Promise(resolve => setTimeout(resolve, 300));
  const secondEntry = waitFor(owner, message => message.type === 'state' && message.roomKey === `account:${residentId}`
    && message.players.some(player => player.id === ownerPlayer.id && player.location === 'room'), 3000, 'second owner visit');
  owner.send(JSON.stringify({ type: 'action', name: 'ownerVisitRoom', playerId: residentPlayer.id }));
  await secondEntry;
  const disconnected = new Promise(resolve => owner.once('close', resolve));
  owner.close();
  await disconnected;
  owner = openTestPlayer(address, 'owner');
  const resumedAtOrigin = waitFor(owner, message => message.type === 'state' && message.roomKey === `account:${ownerId}`
    && message.players.some(player => player.name === 'Proprietário' && player.location === 'clearing'), 3000, 'owner resumed outside the visited home');
  await new Promise(resolve => owner.once('open', resolve));
  await resumedAtOrigin;
  assert.deepEqual(await loadAccountRoom(stateDirectory, residentId), residentFurniture);
});

test('account furniture rotation survives a full room server restart', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-restart-'));
  const accountToken = 'account-room-session';
  const accountId = '021ea54b-c917-4bda-9ba4-9f1a40e9d68b';
  const resolveSession = async token => token === accountToken ? { profile: {
    id: accountId, displayName: 'Casa', guest: false, inventory: { wood: 0, stone: 0, berries: 0 },
  } } : null;
  await createJsonPlayerLocationStore(stateDirectory).savePlayerLocation(accountId, {
    location: 'room', dimensionId: 'surface', x: ROOM_SPAWN.x, y: ROOM_SPAWN.y,
    roomKey: `account:${accountId}`, roomOwnerName: 'Casa', color: 0,
    worldVersion: WORLD_COORDINATE_VERSION,
  });
  const createRoom = () => createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory,
    allowedOrigin: TEST_ORIGIN, resolveSession });
  let room = createRoom();
  let address = await room.listen();
  let player = openTestPlayer(address, accountToken);
  t.after(async () => { player?.terminate(); await room.close(); });
  const waitOpen = socket => new Promise(resolve => socket.once('open', resolve));
  const enterRoom = async () => {
    const initial = await waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'account arrival');
    const id = initial.players[0].id;
    assert.equal(initial.roomKind, 'legacy');
    assert.equal(initial.roomCanEdit, true);
    await new Promise(resolve => setTimeout(resolve, 300));
    return id;
  };
  await waitOpen(player);
  const id = await enterRoom();

  const placed = waitFor(player, message => message.type === 'state' && message.roomFurniture?.length === 1, 2500, 'account bank placement');
  player.send(JSON.stringify({ type: 'action', name: 'placeFurniture', kind: 'stool', x: 6, y: 8 }));
  let state = await placed;
  const bench = state.roomFurniture[0];
  assert.equal(bench.rotation, 0);
  player.send(JSON.stringify({ type: 'input', x: -1, y: -1 }));
  await waitFor(player, message => message.type === 'state' && message.players.some(item => item.id === id
    && Math.hypot(item.x - bench.x, item.y - bench.y) < 1.15), 5000, 'account beside bank');
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  const rotated = waitFor(player, message => message.type === 'state' && message.roomFurniture?.[0]?.rotation === 1, 2500, 'server rotation');
  player.send(JSON.stringify({ type: 'action', name: 'rotateFurniture', id: bench.id }));
  await rotated;

  const disconnected = new Promise(resolve => player.once('close', resolve));
  player.close();
  await disconnected;
  await room.close();

  assert.equal((await loadAccountRoom(stateDirectory, accountId))[0]?.rotation, 1, 'rotation saved before restart');
  room = createRoom();
  address = await room.listen();
  player = openTestPlayer(address, accountToken);
  await waitOpen(player);
  await enterRoom();
  state = await waitFor(player, message => message.type === 'state' && message.roomFurniture?.length === 1
    && message.roomFurniture[0].rotation === 1, 2500, 'account bank restored after server restart');
  assert.deepEqual({ kind: state.roomFurniture[0].kind, x: state.roomFurniture[0].x,
    y: state.roomFurniture[0].y, rotation: state.roomFurniture[0].rotation },
  { kind: 'stool', x: 6, y: 8, rotation: 1 });
});

test('stacked furniture rotates, moves with its support, and restores from the room save',async t=>{
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-stacked-furniture-'));
  const accountToken='stacked-room-session',accountId='021ea54b-c917-4bda-9ba4-9f1a40e9d68b';
  const resolveSession=async token=>token===accountToken?{profile:{id:accountId,displayName:'Casa',guest:false,
    inventory:{wood:0,stone:0,berries:0}}}:null;
  await createJsonPlayerLocationStore(stateDirectory).savePlayerLocation(accountId,{location:'room',dimensionId:'surface',
    x:11.2,y:10,roomKey:`account:${accountId}`,roomOwnerName:'Casa',color:0,worldVersion:WORLD_COORDINATE_VERSION});
  const createRoom=()=>createTestServer(t,{ambientCampfire:false,port:0,stateDirectory,allowedOrigin:TEST_ORIGIN,resolveSession});
  let room=createRoom(),address=await room.listen(),player=openTestPlayer(address,accountToken);
  t.after(async()=>{player?.terminate();await room.close();});
  const waitOpen=socket=>new Promise(resolve=>socket.once('open',resolve));
  await waitOpen(player);
  await waitFor(player,message=>message.type==='state'&&message.roomCanEdit===true&&message.roomFurniture?.length===0);
  let lastNotice='';player.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.type==='notice')lastNotice=message.text;});
  const action=async(data,predicate)=>{
    await new Promise(resolve=>setTimeout(resolve,300));
    const state=waitFor(player,message=>message.type==='state'&&predicate(message),3000,data.name);
    player.send(JSON.stringify({type:'action',...data}));
    try{return await state;}catch(error){throw new Error(`${error.message}; aviso do servidor: ${lastNotice||'(nenhum)'}`);}
  };
  let state=await action({name:'placeFurniture',kind:'table',x:10,y:10},m=>m.roomFurniture?.length===1);
  const table=state.roomFurniture[0];
  state=await action({name:'placeFurniture',kind:'plant',x:10,y:10},m=>m.roomFurniture?.length===2);
  let plant=state.roomFurniture.find(item=>item.kind==='plant');
  assert.equal(plant.supportId,table.id);assert.equal(plant.baseZ,1.5);
  state=await action({name:'rotateFurniture',id:table.id},m=>m.roomFurniture?.find(item=>item.id===table.id)?.rotation===1);
  state=await action({name:'moveFurniture',id:table.id,x:6,y:9.5},m=>m.roomFurniture?.find(item=>item.id===table.id)?.x===6);
  plant=state.roomFurniture.find(item=>item.kind==='plant');
  assert.equal(plant.x,6);assert.equal(plant.y,9.5);assert.equal(plant.supportId,table.id);assert.equal(plant.baseZ,1.5);
  await player.close();await room.close();
  const saved=await loadAccountRoom(stateDirectory,accountId);
  assert.equal(saved[1].supportId,saved[0].id);assert.equal(saved[1].baseZ,1.5);
  room=createRoom();address=await room.listen();player=openTestPlayer(address,accountToken);await waitOpen(player);
  state=await waitFor(player,message=>message.type==='state'&&message.roomFurniture?.length===2&&message.roomFurniture[1].supportId===message.roomFurniture[0].id);
  assert.equal(state.roomFurniture[0].rotation,1);assert.equal(state.roomFurniture[1].baseZ,1.5);
});

test('owner can edit a lodging room and furniture remains editable after a server restart', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-owned-lodging-room-'));
  const accounts = createAccountStore({ directory: stateDirectory });
  const account = await accounts.register({ username: 'cabanaowner', password: 'senha-segura-de-teste' });
  await accounts.creditWallet(account.profile.id, 3_200);
  const reservation = await accounts.claimLodging({ profileId: account.profile.id, ...LODGING_OFFER_BY_KEY.get('cabin-cedar-one:owned') });
  await createJsonPlayerLocationStore(stateDirectory).savePlayerLocation(account.profile.id, {
    location: 'room', dimensionId: 'surface', x: ROOM_SPAWN.x, y: 8.8,
    roomKey: lodgingRoomKey(reservation.claim), roomOwnerName: 'Cabana do Cedro', color: 0,
    worldVersion: WORLD_COORDINATE_VERSION,
  });

  let room = createPrototypeServer({ ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  let address = await room.listen();
  let player = openTestPlayer(address, account.token);
  t.after(async () => {
    player?.terminate();
    await room?.close();
    await rm(stateDirectory, { recursive: true, force: true });
  });
  const connect = async () => {
    const opened = new Promise(resolve => player.once('open', resolve));
    const initial = waitFor(player, message => message.type === 'state' && message.players.length === 1,
      2500, 'lodging owner snapshot');
    await opened;
    return initial;
  };

  let state = await connect();
  assert.equal(state.roomKind, 'lodging');
  assert.equal(state.roomCanEdit, true);
  const placed = waitFor(player, message => message.type === 'state'
    && message.roomCanEdit === true && message.roomFurniture?.length === 1, 2500, 'owner furniture placement');
  const placedNotice = waitFor(player, message => message.type === 'notice' && message.text.startsWith('Banco colocado.')
    && message.action === 'roomFurniture' && message.requestId === 9371 && message.result === 'accepted',
    2500, 'owner placement confirmation');
  player.send(JSON.stringify({ type: 'action', name: 'placeFurniture', kind: 'stool', x: 6.5, y: 9, requestId: 9371 }));
  state = await placed;
  await placedNotice;
  const furniture = state.roomFurniture[0];

  const nearFurniture = waitFor(player, message => message.type === 'state'
    && Math.hypot(message.players[0].x - furniture.x, message.players[0].y - furniture.y) < 1.2,
  2500, 'owner approaching furniture');
  player.send(JSON.stringify({ type: 'input', x: -1, y: 0 }));
  await nearFurniture;
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  await new Promise(resolve => setTimeout(resolve, 275));
  const rotated = waitFor(player, message => message.type === 'state'
    && message.roomFurniture?.[0]?.rotation === 1, 2500, 'owner furniture rotation');
  const rotatedNotice = waitFor(player, message => message.type === 'notice' && message.text === 'Banco girado.',
    2500, 'owner rotation confirmation');
  player.send(JSON.stringify({ type: 'action', name: 'rotateFurniture', id: furniture.id }));
  state = await rotated;
  await rotatedNotice;

  const disconnected = new Promise(resolve => player.once('close', resolve));
  player.close();
  await disconnected;
  player = null;
  await room.close();
  room = createPrototypeServer({ ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  address = await room.listen();
  player = openTestPlayer(address, account.token);
  state = await connect();
  assert.equal(state.roomKind, 'lodging');
  assert.equal(state.roomCanEdit, true, 'the owner still has editing permission after restart');
  assert.deepEqual(state.roomFurniture.map(item => ({ id: item.id, rotation: item.rotation })),
    [{ id: furniture.id, rotation: 1 }]);
});

test('hotel lobby restores saved visitors and moves beyond cabin room bounds', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-hotel-lobby-'));
  const accounts = createAccountStore({ directory: stateDirectory });
  const account = await accounts.register({ username: 'hotelguest', password: 'senha-segura-de-teste' });
  // (12, 8) now overlaps the canonical hotel table; use the clear east aisle.
  await createJsonPlayerLocationStore(stateDirectory).savePlayerLocation(account.profile.id, {
    location: 'room', dimensionId: 'surface', x: 13, y: 8,
    roomKey: 'lobby:lodging-ember-hotel', roomOwnerName: 'Recepção · Hotel das Brasas', color: 0,
    worldVersion: WORLD_COORDINATE_VERSION,
  });

  const room = createPrototypeServer({ ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  const address = await room.listen();
  const player = openTestPlayer(address, account.token);
  t.after(async () => {
    player.terminate();
    await room.close();
    await rm(stateDirectory, { recursive: true, force: true });
  });
  const opened = new Promise(resolve => player.once('open', resolve));
  const initial = waitFor(player, message => message.type === 'state' && message.players.length === 1,
    2500, 'expanded hotel lobby snapshot');
  await opened;
  let state = await initial;
  assert.equal(state.roomKind, 'lobby');
  assert.equal(state.roomBuildingId, 'lodging-ember-hotel');
  assert.deepEqual({ x: state.players[0].x, y: state.players[0].y }, { x: 13, y: 8 });

  const moved = waitFor(player, message => message.type === 'state' && message.players[0].x > 13.65,
    2500, 'hotel movement outside the cabin bounds');
  player.send(JSON.stringify({ type: 'input', x: 1, y: 0 }));
  state = await moved;
  assert.ok(state.players[0].x > 13.65 && state.players[0].x < 14.25);
});

test('ações e gestos no intervalo curto recebem aviso em vez de desaparecer', async t => {
  const clock = 10_000;
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity, now: () => clock });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initial = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial cooldown snapshot');
  await new Promise(resolve => player.once('open', resolve));
  await initial;

  const wave = waitFor(player, message => message.type === 'notice' && message.text === 'Você acenou para quem está por perto.', 2500, 'first action confirmation');
  player.send(JSON.stringify({ type: 'emote', name: 'wave' }));
  await wave;

  const cooldown = waitFor(player, message => message.type === 'notice'
    && message.text === 'Espera só um instante antes da próxima ação.', 2500, 'short action cooldown notice');
  player.send(JSON.stringify({ type: 'action', name: 'fire' }));
  assert.equal((await cooldown).text, 'Espera só um instante antes da próxima ação.');

  const emoteCooldown = waitFor(player, message => message.type === 'notice'
    && message.text === 'Espera só um instante antes da próxima ação.', 2500, 'short emote cooldown notice');
  player.send(JSON.stringify({ type: 'emote', name: 'dance' }));
  assert.equal((await emoteCooldown).text, 'Espera só um instante antes da próxima ação.');
});

test('coleta recusada pelo intervalo devolve o pedido para encerrar o gesto do cliente', async t => {
  let clock = 10_000;
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity, now: () => clock });
  const address = await room.listen();
  t.after(() => room.close());
  const clockTicker = setInterval(() => { clock += 100; }, 20);
  t.after(() => clearInterval(clockTicker));
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initialState = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial cooldown pickup snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await initialState;
  const id = initial.players[0].id;

  player.send(JSON.stringify({ type: 'input', ...directionToward(initial.players[0], southBranch) }));
  await waitFor(player, message => message.type === 'state'
    && Math.hypot(message.players.find(item => item.id === id)?.x - southBranch.x,
      message.players.find(item => item.id === id)?.y - southBranch.y) <= 1.1, 5000, 'player beside the south branch');
  clearInterval(clockTicker);
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));

  const waved = waitFor(player, message => message.type === 'notice' && message.text === 'Você acenou para quem está por perto.', 2500, 'wave before collection');
  player.send(JSON.stringify({ type: 'emote', name: 'wave' }));
  await waved;
  clock += 100;

  const cooldown = waitFor(player, message => message.type === 'notice'
    && message.text === 'Espera só um instante antes da próxima ação.', 2500, 'collection cooldown notice');
  player.send(JSON.stringify({ type: 'action', name: 'collect', requestId: 31 }));
  const refused = await cooldown;
  assert.equal(refused.action, 'collect');
  assert.equal(refused.requestId, 31);
  assert.equal(refused.result, 'cooldown');
});

test('sentar mostra o gesto na sala e caminhar encerra a pose', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initialState = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial sit snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await initialState;
  const id = initial.players[0].id;

  const satNotice = waitFor(player, message => message.type === 'notice' && message.text === 'Você sentou para descansar.', 2500, 'sit confirmation');
  const satState = waitFor(player, message => message.type === 'state' && message.players.find(item => item.id === id)?.emote === 'sit', 2500, 'sitting snapshot');
  player.send(JSON.stringify({ type: 'emote', name: 'sit' }));
  const initialSit = await satState;
  await satNotice;
  assert.equal(initialSit.players.find(item => item.id === id)?.emoteUntil, 0);
  await new Promise(resolve => setTimeout(resolve, 2100));
  await waitFor(player, message => message.type === 'state' && message.players.find(item => item.id === id)?.emote === 'sit', 2500, 'persistent sitting snapshot');

  const walkingState = waitFor(player, message => {
    if (message.type !== 'state') return false;
    const self = message.players.find(item => item.id === id);
    return self?.moving === true && self.emote === null;
  }, 2500, 'standing after walking');
  player.send(JSON.stringify({ type: 'input', x: 1, y: 0 }));
  await walkingState;

  const satWhileWalking = waitFor(player, message => {
    if (message.type !== 'state') return false;
    const self = message.players.find(item => item.id === id);
    return self?.moving === false && self.sitting === true && self.emote === 'sit';
  }, 2500, 'sit requested while walking');
  player.send(JSON.stringify({ type: 'emote', name: 'sit' }));
  await satWhileWalking;
  const resumedWalking = waitFor(player, message => {
    if (message.type !== 'state') return false;
    const self = message.players.find(item => item.id === id);
    return self?.moving === true && self.sitting === false && self.emote === null;
  }, 2500, 'new movement stands up after sitting');
  player.send(JSON.stringify({ type: 'input', x: -1, y: 0 }));
  await resumedWalking;
});

test('conversa aparece para a sala, controla repetição e expira sem salvar histórico', async t => {
  let clock = 10_000;
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: testIdentity,
    now: () => clock,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const first = openTestPlayer(address);
  const second = openTestPlayer(address);
  t.after(() => { first.terminate(); second.terminate(); });
  const roomReady = waitFor(first, message => message.type === 'state' && message.players.length === 2, 2500, 'two-player chat room');
  await Promise.all([new Promise(resolve => first.once('open', resolve)), new Promise(resolve => second.once('open', resolve))]);
  await roomReady;

  const sharedMessage = waitFor(second, message => message.type === 'state' && message.players.some(player => player.chat === 'Oi, bosque! 👋'));
  first.send(JSON.stringify({ type: 'chat', text: '  Oi,\n bosque! 👋\u202e ' }));
  const shared = await sharedMessage;
  assert.equal(shared.players.filter(player => player.chat === 'Oi, bosque! 👋').length, 1);

  const limited = waitFor(first, message => message.type === 'notice' && message.text.includes('Respira'));
  first.send(JSON.stringify({ type: 'chat', text: 'Outra frase' }));
  await limited;

  clock += 5100;
  const expired = await waitFor(second, message => message.type === 'state'
    && message.players.every(player => player.chat === null), 2500, 'expired room chat');
  assert.ok(expired.players.every(player => player.chat === null));
});

test('a sala preserva 72 emojis compostos em uma fala multiplayer', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initial = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'single-player chat room');
  await new Promise(resolve => player.once('open', resolve));
  const state = await initial;
  const family = '👨‍👩‍👧‍👦';
  const text = family.repeat(72);
  const shared = waitFor(player, message => message.type === 'state' && message.players.some(item => item.chat === text), 2500, 'complete composed-emoji message');
  player.send(JSON.stringify({ type: 'chat', text }));
  const update = await shared;
  assert.equal(update.players.find(item => item.id === state.players[0].id)?.chat, text);
});

test('a fogueira reconhece duas pessoas descansando no snapshot multiplayer', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-fire-rest-'));
  const resolveSession = async token => token === 'rest-test-token' ? {
    profile: {
      id: 'e04d06d9-b215-4d08-b4b9-894dd63477cc',
      displayName: 'Viajante',
      guest: true,
      inventory: { wood: 20, stone: 10, leaves: 1, berries: 0 },
    },
  } : null;
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN, resolveSession });
  const address = await room.listen();
  t.after(() => room.close());
  const first = openTestPlayer(address, 'rest-test-token');
  const second = openTestPlayer(address, 'rest-test-token');
  t.after(() => { first.terminate(); second.terminate(); });

  const twoPlayers = waitFor(first, message => message.type === 'state' && message.players.length === 2, 2500, 'two-player rest snapshot');
  await Promise.all([new Promise(resolve => first.once('open', resolve)), new Promise(resolve => second.once('open', resolve))]);
  const initial = await twoPlayers;

  const fireReady = waitFor(first, message => message.type === 'state' && message.fires.length === 1, 2500, 'shared fire');
  first.send(JSON.stringify({ type: 'action', name: 'fire' }));
  const fireState = await fireReady;
  const fire = fireState.fires[0];
  assert.ok(fireState.players.every(player => Math.hypot(player.x - fire.x, player.y - fire.y) <= 2.8));

  await new Promise(resolve => setTimeout(resolve, 300));
  const restingState = waitFor(first, message => message.type === 'state'
    && message.players.length === 2
    && message.players.every(player => player.emote === 'sit' && player.moving === false), 2500, 'both sitting emotes');
  const sit = JSON.stringify({ type: 'emote', name: 'sit' });
  first.send(sit);
  second.send(sit);
  const state = await restingState;

  assert.equal(state.players.length, initial.players.length);
  assert.equal(getCampfireGatheringCount(fire, state.players), 2);
});

test('fogueira cobra cada material, sobe ao reacender, reabastecer e reconstruir, e some após o desmanche salvo', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-campfire-life-'));
  let clock = 50_000;
  const options = {
    ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN,
    campfireLifecycleIntervalMs: 50,
    now: () => clock,
    resolveSession: async token => token === 'campfire-life-test' ? {
      profile: { id: 'campfire-life-test', displayName: 'Brasa', guest: true,
        inventory: { wood: 0, stone: 80, leaves: 5, firewood: 80, berries: 0 } },
    } : null,
  };
  let room = createTestServer(t, options);
  let address = await room.listen();
  let player = null;
  t.after(async () => {
    player?.terminate();
    await room?.close();
  });

  const connect = async () => {
    const socket = openTestPlayer(address, 'campfire-life-test');
    const opened = new Promise(resolve => socket.once('open', resolve));
    const initial = waitFor(socket, message => message.type === 'state' && message.players.length === 1,
      2500, 'campfire lifecycle snapshot');
    await opened;
    return { socket, state: await initial };
  };
  const act = async (socket, expectedText, statePredicate, description) => {
    const notice = waitFor(socket, message => message.type === 'notice' && message.text === expectedText,
      2500, description);
    const state = waitFor(socket, message => message.type === 'state' && statePredicate(message),
      2500, `${description} state`);
    socket.send(JSON.stringify({ type: 'action', name: 'fire' }));
    return Promise.all([notice, state]);
  };

  const connected = await connect();
  player = connected.socket;
  const playerId = connected.state.players[0].id;
  const initialInventory = connected.state.players.find(item => item.id === playerId).inventory;
  assert.equal(initialInventory.wood, 80, 'legacy firewood is the same campfire fuel as sticks');
  const created = await act(player, 'Você acendeu uma fogueira nova.', message =>
    message.fires?.length === 1
      && message.players.find(item => item.id === playerId)?.inventory.wood === initialInventory.wood - CAMPFIRE_NEW_COST.wood,
  'new fire with 20 sticks, 10 stones, and one tinder bundle');
  let fire = created[1].fires[0];
  assert.equal(created[1].players.find(item => item.id === playerId).inventory.stone,
    initialInventory.stone - CAMPFIRE_NEW_COST.stone);
  assert.equal(created[1].players.find(item => item.id === playerId).inventory.leaves,
    initialInventory.leaves - CAMPFIRE_NEW_COST.leaves,
    'one dry-leaf bundle is consumed as tinder for a new fire');
  assert.equal(fire.flameRiseFrom, 0);
  assert.equal(fire.flameRiseRemainingMs, CAMPFIRE_IGNITION_RAMP_MS);

  clock += CAMPFIRE_LIFETIME_MS + 1_000;
  const relit = await act(player, 'Você reacendeu a fogueira.', message =>
    message.fires?.[0]?.burnRemainingMs === CAMPFIRE_LIFETIME_MS
      && message.players.find(item => item.id === playerId)?.inventory.wood
        === initialInventory.wood - CAMPFIRE_NEW_COST.wood - CAMPFIRE_REKINDLE_COST.wood,
  'relight after the fuel burns out');
  fire = relit[1].fires[0];
  assert.equal(relit[1].players.find(item => item.id === playerId).inventory.leaves,
    initialInventory.leaves - CAMPFIRE_NEW_COST.leaves - CAMPFIRE_REKINDLE_COST.leaves);
  assert.equal(relit[1].players.find(item => item.id === playerId).inventory.stone,
    initialInventory.stone - CAMPFIRE_NEW_COST.stone);
  assert.equal(fire.flameRiseFrom, 0);
  assert.equal(fire.flameRiseRemainingMs, CAMPFIRE_IGNITION_RAMP_MS);

  clock += CAMPFIRE_LIFETIME_MS - CAMPFIRE_FEED_WINDOW_MS + 100;
  const fed = await act(player, 'Você alimentou a fogueira; ela voltou à força máxima.', message =>
    message.fires?.[0]?.burnRemainingMs === CAMPFIRE_LIFETIME_MS
      && message.players.find(item => item.id === playerId)?.inventory.wood
        === initialInventory.wood - CAMPFIRE_NEW_COST.wood - CAMPFIRE_REKINDLE_COST.wood - CAMPFIRE_FEED_COST.wood,
  'feed a weak fire with two sticks');
  fire = fed[1].fires[0];
  assert.equal(fed[1].players.find(item => item.id === playerId).inventory.wood,
    initialInventory.wood - CAMPFIRE_NEW_COST.wood - CAMPFIRE_REKINDLE_COST.wood - CAMPFIRE_FEED_COST.wood,
    'gravetos e lenha pequena usam uma única pilha no inventário');
  assert.ok(fire.flameRiseFrom > 0 && fire.flameRiseFrom < 0.6,
    'feeding restarts the flame from its current weak strength');
  assert.equal(fire.flameRiseRemainingMs, CAMPFIRE_IGNITION_RAMP_MS);

  clock += CAMPFIRE_LIFETIME_MS + CAMPFIRE_DECAY_DELAY_MS + 1_000;
  const decaying = await waitFor(player, message => message.type === 'state'
    && message.fires?.[0]?.decayProgress > 0, 2500, 'fire begins its day-long decay');
  assert.ok(decaying.fires[0].decayProgress < 0.01);
  const rebuilt = await act(player, 'Você reconstruiu e reacendeu a fogueira.', message =>
    message.fires?.[0]?.burnRemainingMs === CAMPFIRE_LIFETIME_MS
      && message.players.find(item => item.id === playerId)?.inventory.wood
        === initialInventory.wood - CAMPFIRE_NEW_COST.wood - CAMPFIRE_REKINDLE_COST.wood
          - CAMPFIRE_FEED_COST.wood - CAMPFIRE_DECAY_REBUILD_COST.wood,
  'rebuild a decaying fire with sticks, stones, and leaves');
  fire = rebuilt[1].fires[0];
  const rebuiltInventory = rebuilt[1].players.find(item => item.id === playerId).inventory;
  assert.equal(rebuiltInventory.stone, initialInventory.stone - CAMPFIRE_NEW_COST.stone - CAMPFIRE_DECAY_REBUILD_COST.stone);
  assert.equal(rebuiltInventory.leaves, initialInventory.leaves - CAMPFIRE_NEW_COST.leaves
    - CAMPFIRE_REKINDLE_COST.leaves - CAMPFIRE_DECAY_REBUILD_COST.leaves);
  assert.equal(fire.decayProgress, 0);
  assert.equal(fire.flameRiseFrom, 0);
  assert.equal(fire.flameRiseRemainingMs, CAMPFIRE_IGNITION_RAMP_MS);

  const savedAt = fire.litAt;
  const playerClosed = new Promise(resolve => player.once('close', resolve));
  player.terminate();
  await playerClosed;
  await room.close();
  room = null;
  clock += 1;
  room = createTestServer(t, options);
  address = await room.listen();
  const reconnected = await connect();
  player = reconnected.socket;
  const restored = reconnected.state;
  assert.equal(restored.fires?.length, 1, 'fire restored after restarting the server');
  assert.equal(restored.fires[0].litAt, savedAt);

  clock += CAMPFIRE_LIFETIME_MS + CAMPFIRE_DECAY_DELAY_MS + CAMPFIRE_DECAY_DURATION_MS + 1;
  await waitFor(player, message => message.type === 'state' && message.fires?.length === 0,
    2500, 'fully decayed fire removed from the world');
  const fireSavePath = path.join(stateDirectory, 'campfires.json');
  let persistedFires = JSON.parse(await readFile(fireSavePath, 'utf8'));
  const saveDeadline = Date.now() + 2500;
  while (persistedFires.length && Date.now() < saveDeadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
    persistedFires = JSON.parse(await readFile(fireSavePath, 'utf8'));
  }
  assert.deepEqual(persistedFires, [], 'the decayed fire removal reaches durable storage');
});

test('the persisted arrival campfire is moved clear of the spawn lane', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-arrival-campfire-'));
  await writeFile(path.join(stateDirectory, 'campfires.json'), JSON.stringify([{
    id: 'arrival', x: surfaceCoord(8.2), y: surfaceCoord(11.3), permanent: true, litAt: 950,
  }]));
  const room = createTestServer(t, {
    port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity, now: () => 1000,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initial = waitFor(player, message => message.type === 'state' && Array.isArray(message.fires),
    2500, 'arrival campfire snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const state = await initial;
  assert.equal(state.fires.length, 1);
  assert.equal(state.fires[0].x, SPAWN_CAMPFIRE.x);
  assert.equal(state.fires[0].y, SPAWN_CAMPFIRE.y);
  const saved = JSON.parse(await readFile(path.join(stateDirectory, 'campfires.json'), 'utf8'));
  assert.equal(saved[0].x, SPAWN_CAMPFIRE.x);
  assert.equal(saved[0].y, SPAWN_CAMPFIRE.y);
});

test('a saved permanent Breu fire follows the dimension to the map center', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-breu-center-fire-'));
  const breu = DEFAULT_DIMENSIONS.find(item => item.id === 'breu');
  await writeFile(path.join(stateDirectory, 'campfires-breu.json'), JSON.stringify([{
    id: 'arrival', x: 419.5, y: 419.5, permanent: true, litAt: 950,
  }]));
  const room = createTestServer(t, { ambientCampfire: true, port: 0, stateDirectory });
  await room.listen();
  const saved = JSON.parse(await readFile(path.join(stateDirectory, 'campfires-breu.json'), 'utf8'));
  assert.equal(saved[0].x, breu.campfire.x);
  assert.equal(saved[0].y, breu.campfire.y);
});

test('Breu restores to the map center and removes persisted terrain edits', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-breu-flat-world-'));
  const dimensions = createJsonDimensionStore(stateDirectory);
  const oldDimensions = DEFAULT_DIMENSIONS.map(item => item.id === 'breu'
    ? { ...item, spawn: { x: 419.5, y: 419.5 }, campfire: { x: 419.5, y: 419.5 } } : item);
  await dimensions.saveDimensions(oldDimensions, 0);
  const worlds = createJsonWorldStore(stateDirectory);
  await worlds.saveWorld({ version: 1, revision: 1, seed: 12345, generationVersion: 1, dimensionId: 'breu',
    theme: 'dark', edits: [{ id: 'old-breu-hill', type: 'hill', x: 419.5, y: 419.5, radius: 22 }] }, 0, 'breu');
  const room = createTestServer(t, { port: 0, stateDirectory });
  await room.listen();
  const savedDimensions = await dimensions.loadDimensions();
  const breu = savedDimensions.dimensions.find(item => item.id === 'breu');
  assert.deepEqual(breu.spawn, { x: 2966.5, y: 2966.5 });
  assert.deepEqual(breu.campfire, { x: 2966.5, y: 2966.5 });
  assert.deepEqual(savedDimensions.dimensions.find(item => item.id === 'ceu').spawn, { x: 419.5, y: 419.5 });
  const world = await worlds.loadWorld('breu');
  assert.equal(world.theme, 'dark');
  assert.deepEqual(world.edits, [], 'old hills, water and vegetation edits cannot reappear in the black world');
  assert.equal(world.revision, 2);
});

test('o servidor aplica a queimadura ao cair no fogo, reduz o tempo e apaga ao entrar em água funda', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-player-fire-'));
  const room = createTestServer(t, {
    ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => token === 'player-fire-test' ? {
      profile: { id: 'player-fire-test', displayName: 'Brasa', guest: true,
        inventory: { wood: 20, stone: 10, leaves: 1, berries: 0 } },
    } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'player-fire-test');
  t.after(() => player.terminate());
  const initialPromise = waitFor(player, message => message.type === 'state' && message.players.length === 1,
    2500, 'initial player-fire snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await initialPromise;
  const playerId = initial.players[0].id;

  const litPromise = waitFor(player, message => message.type === 'state' && message.fires?.length === 1,
    2500, 'new player fire');
  player.send(JSON.stringify({ type: 'action', name: 'fire' }));
  const lit = await litPromise;
  const sendCommands = (firstSeq, count) => {
    for (let offset = 0; offset < count; offset += 12) {
      const commands = Array.from({ length: Math.min(12, count - offset) }, (_, index) => {
        const step = offset + index;
        return { seq: firstSeq + step, x: 0, y: 0, motion: true, jump: step < 12 };
      });
      player.send(JSON.stringify({ type: 'input', commands }));
    }
  };
  const firstBatch = waitFor(player, message => message.type === 'state'
    && message.players.find(item => item.id === playerId)?.inputSeq >= 60, 4000, 'first jump batch');
  sendCommands(1, 60);
  await firstBatch;
  const landed = waitFor(player, message => message.type === 'state'
    && message.players.find(item => item.id === playerId)?.inputSeq >= 90
    && message.players.find(item => item.id === playerId)?.burningRemainingMs > 0,
  4000, 'burning landing snapshot');
  sendCommands(61, 30);
  const burning = await landed;
  const playerOnFire = burning.players.find(item => item.id === playerId);
  assert.ok(Number.isFinite(playerOnFire.burningRemainingMs));
  assert.ok(playerOnFire.burningRemainingMs < 6000);
  assert.ok(Math.hypot(playerOnFire.x - lit.fires[0].x, playerOnFire.y - lit.fires[0].y) < .1,
    'the authoritative position stays at the landing point');

  const lowerTimer = waitFor(player, message => message.type === 'state'
    && message.players.find(item => item.id === playerId)?.burningRemainingMs < playerOnFire.burningRemainingMs,
  2000, 'idle burn timer update');
  const cooled = await lowerTimer;
  const cooledPlayer = cooled.players.find(item => item.id === playerId);
  assert.ok(cooledPlayer.burningRemainingMs < playerOnFire.burningRemainingMs);

  const waterOptions = { dimensionId: 'surface', theme: 'forest', origin: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 } };
  let nextSeq = cooledPlayer.inputSeq + 1;
  let extinguished = null;
  for (let batch = 0; batch < 8 && !extinguished; batch += 1) {
    const count = 12, lastSeq = nextSeq + count - 1;
    const batchState = waitFor(player, message => message.type === 'state'
      && message.players.find(item => item.id === playerId)?.inputSeq >= lastSeq,
    2500, 'water approach movement batch');
    player.send(JSON.stringify({ type: 'input', commands: Array.from({ length: count }, (_, index) => ({
      seq: nextSeq + index, x: 0, y: -1, motion: true,
    })) }));
    const state = await batchState;
    const item = state.players.find(entry => entry.id === playerId);
    if (waterStateAt(item.x, item.y, waterOptions).depth > WATER_WADING_DEPTH && !(item.burningRemainingMs > 0)) {
      extinguished = state;
    }
    nextSeq = item.inputSeq + 1;
  }
  assert.ok(extinguished, 'walking from the fire to deep water must extinguish the player');
  const extinguishedPlayer = extinguished.players.find(item => item.id === playerId);
  assert.ok(waterStateAt(extinguishedPlayer.x, extinguishedPlayer.y, waterOptions).depth > WATER_WADING_DEPTH);
  assert.equal(extinguishedPlayer.burningRemainingMs, undefined);
});

test('movement permits a nearby pickup and an unaffordable fire explains its cost', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-pickup-fire-'));
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initialState = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await initialState;
  const id = initial.players[0].id;
  player.send(JSON.stringify({ type: 'input', ...directionToward(initial.players[0], southBranch) }));
  const moved = await waitFor(player, message => {
    const remote = message.type === 'state' && message.players.find(item => item.id === id);
    return remote?.moving === true && Math.hypot(remote.x - southBranch.x, remote.y - southBranch.y) <= 1.1;
  }, 5000, 'movement snapshot beside a resource');
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  const stopped = await waitFor(player, message => message.type === 'state' && message.players.find(item => item.id === id)?.moving === false, 2500, 'idle snapshot');
  assert.equal(stopped.players.find(item => item.id === id)?.moving, false);
  const pickup = waitFor(player, message => message.type === 'notice' && message.text.includes('graveto'), 2500, 'pickup confirmation');
  player.send(JSON.stringify({ type: 'action', name: 'collect' }));
  await pickup;
  const collectedState = waitFor(player, message => message.type === 'state' && message.players.find(item => item.id === id)?.inventory.wood === 1, 2500, 'inventory snapshot');
  player.send(JSON.stringify({ type: 'join', name: 'Testador' }));
  const collected = await collectedState;
  assert.equal(collected.resources.some(resource => resource.id === 'branch-south'), false);
  await new Promise(resolve => setTimeout(resolve, 260));
  const unaffordable = waitFor(player, message => message.type === 'notice' && message.text.includes('20 gravetos + 10 pedras'), 2500, 'fire cost notice');
  player.send(JSON.stringify({ type: 'action', name: 'fire' }));
  await unaffordable;
  assert.ok(moved.players.find(item => item.id === id).x > initial.players[0].x);
});

test('room blocks a second fire beside an existing one when spare materials remain', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-fire-nearby-'));
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    stateDirectory,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => token === 'fire-maker' ? {
      profile: { id: 'fire-maker', displayName: 'Brasa', guest: true, inventory: { wood: 40, stone: 20, leaves: 2, berries: 0 } },
    } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'fire-maker');
  t.after(() => player.terminate());
  const firstState = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial fire maker snapshot');
  await new Promise(resolve => player.once('open', resolve));
  await firstState;

  const lit = waitFor(player, message => message.type === 'notice' && message.text === 'Você acendeu uma fogueira nova.', 2500, 'first fire');
  player.send(JSON.stringify({ type: 'action', name: 'fire' }));
  await lit;
  await new Promise(resolve => setTimeout(resolve, 260));

  const refused = waitFor(player, message => message.type === 'notice' && message.text === 'Essa fogueira ainda está forte.', 2500, 'second fire refusal');
  player.send(JSON.stringify({ type: 'action', name: 'fire' }));
  await refused;
});

test('dois jogadores não acendem fogueiras sobrepostas ao mesmo tempo', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-fire-race-'));
  const profiles = {
    'fire-race-a': { id: 'fire-race-account-a', displayName: 'Lia', guest: false, inventory: { wood: 20, stone: 10, leaves: 1, berries: 0 } },
    'fire-race-b': { id: 'fire-race-account-b', displayName: 'Noa', guest: false, inventory: { wood: 20, stone: 10, leaves: 1, berries: 0 } },
  };
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    stateDirectory,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => profiles[token] ? { profile: profiles[token] } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const first = openTestPlayer(address, 'fire-race-a');
  const second = openTestPlayer(address, 'fire-race-b');
  t.after(() => { first.terminate(); second.terminate(); });

  const initialState = waitFor(first, message => message.type === 'state' && message.players.length === 2, 2500, 'two fire makers');
  await Promise.all([new Promise(resolve => first.once('open', resolve)), new Promise(resolve => second.once('open', resolve))]);
  const initial = await initialState;
  const firstId = initial.players.find(player => player.name === 'Lia').id;
  const secondInitial = initial.players.find(player => player.name === 'Noa');
  const firstInitial = initial.players.find(player => player.id === firstId);
  second.send(JSON.stringify({
    type: 'input',
    x: Math.sign(firstInitial.x - secondInitial.x),
    y: Math.sign(firstInitial.y - secondInitial.y),
  }));
  const closeState = await waitFor(first, message => {
    if (message.type !== 'state') return false;
    const a = message.players.find(player => player.id === firstId);
    const b = message.players.find(player => player.name === 'Noa');
    return a && b && Math.hypot(a.x - b.x, a.y - b.y) <= 1.2;
  }, 2500, 'fire makers meeting');
  const secondId = closeState.players.find(player => player.name === 'Noa').id;
  second.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  const readyState = await waitFor(first, message => {
    if (message.type !== 'state') return false;
    const a = message.players.find(player => player.id === firstId);
    const b = message.players.find(player => player.id === secondId);
    return a?.moving === false && b?.moving === false && Math.hypot(a.x - b.x, a.y - b.y) < 1.6;
  }, 2500, 'both fire makers stopped within one placement radius');
  const positions = readyState.players.filter(player => player.id === firstId || player.id === secondId);
  assert.ok(Math.hypot(positions[0].x - positions[1].x, positions[0].y - positions[1].y) < 1.6);

  const outcome = message => message.type === 'notice'
    && (message.text === 'Você acendeu uma fogueira nova.'
      || message.text === 'Essa fogueira ainda está forte.');
  const firstOutcome = waitFor(first, outcome, 2500, 'first fire placement result');
  const secondOutcome = waitFor(second, outcome, 2500, 'second fire placement result');
  first.send(JSON.stringify({ type: 'action', name: 'fire' }));
  second.send(JSON.stringify({ type: 'action', name: 'fire' }));
  const notices = await Promise.all([firstOutcome, secondOutcome]);
  assert.equal(notices.filter(message => message.text === 'Você acendeu uma fogueira nova.').length, 1);
  assert.equal(notices.filter(message => message.text === 'Essa fogueira ainda está forte.').length, 1);
});

test('room allows a second fire when the player carries materials and is far from the first', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-fire-trail-'));
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    stateDirectory,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => token === 'fire-trail' ? {
      profile: { id: 'fire-trail', displayName: 'Brasa', guest: true, inventory: { wood: 40, stone: 20, leaves: 2, berries: 0 } },
    } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'fire-trail');
  t.after(() => player.terminate());
  const initialState = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial trail snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await initialState;
  const id = initial.players[0].id;
  const initialY = initial.players.find(item => item.id === id).y;

  const firstFire = waitFor(player, message => message.type === 'state' && message.fires.length === 1, 2500, 'first trail fire');
  player.send(JSON.stringify({ type: 'action', name: 'fire' }));
  await firstFire;

  player.send(JSON.stringify({ type: 'input', x: 0, y: 1 }));
  await waitFor(player, message => message.type === 'state'
    && message.players.find(item => item.id === id)?.y >= initialY + 1.8, 2500, 'player away from the first fire');
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  await waitFor(player, message => message.type === 'state'
    && message.players.find(item => item.id === id)?.moving === false, 2500, 'player stopped on the trail');

  const secondFireNotice = waitFor(player, message => message.type === 'notice'
    && message.text === 'Você acendeu uma fogueira nova.', 2500, 'second trail fire confirmation');
  const secondFireState = waitFor(player, message => message.type === 'state' && message.fires.length === 2, 2500, 'two trail fires');
  player.send(JSON.stringify({ type: 'action', name: 'fire' }));
  await Promise.all([secondFireNotice, secondFireState]);
});

test('collected resource returns to the shared world after its respawn interval', async t => {
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: testIdentity,
    resourceRespawnMs: 120,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const initialState = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial resources');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await initialState;
  const id = initial.players[0].id;

  player.send(JSON.stringify({ type: 'input', ...directionToward(initial.players[0], southBranch) }));
  await waitFor(player, message => {
    const self = message.type === 'state' && message.players.find(item => item.id === id);
    return self && Math.hypot(self.x - southBranch.x, self.y - southBranch.y) <= 1.1;
  }, 5000, 'player beside the south branch');
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));

  const absent = waitFor(player, message => message.type === 'state' && !message.resources.some(resource => resource.id === 'branch-south'), 2500, 'shared branch removal');
  const requestId = 17;
  const picked = waitFor(player, message => message.type === 'notice' && message.action === 'collect'
    && message.requestId === requestId && message.result === 'collected', 2500, 'branch pickup');
  player.send(JSON.stringify({ type: 'action', name: 'collect', requestId }));
  const pickupNotice = await picked;
  assert.equal(pickupNotice.action, 'collect');
  assert.equal(pickupNotice.requestId, requestId);
  assert.equal(pickupNotice.result, 'collected');
  assert.deepEqual(pickupNotice.resource, southBranch);
  const absentSnapshot = await absent;
  assert.ok(!absentSnapshot.resources.some(resource => resource.id === 'branch-south'));
  const collectedSnapshot = await waitFor(player, message => message.type === 'state'
    && message.players.find(item => item.id === id)?.inventory.wood === 1, 2500, 'saved pickup inventory');
  assert.equal(collectedSnapshot.players.find(item => item.id === id)?.inventory.wood, 1);

  const returned = await waitFor(player, message => message.type === 'state' && message.resources.some(resource => resource.id === 'branch-south'), 2500, 'shared branch respawn');
  assert.ok(returned.resources.some(resource => resource.id === 'branch-south'));
});

test('player gets a clear notice when someone else takes the nearby resource', async t => {
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => {
      if (!['gatherer-one', 'gatherer-two'].includes(token)) return null;
      return { profile: { id: token, displayName: token === 'gatherer-one' ? 'Brasa' : 'Folha', guest: true, inventory: { wood: 0, stone: 0, berries: 0 } } };
    },
  });
  const address = await room.listen();
  t.after(() => room.close());
  const first = openTestPlayer(address, 'gatherer-one');
  const second = openTestPlayer(address, 'gatherer-two');
  t.after(() => { first.terminate(); second.terminate(); });
  const initialState = waitFor(first, message => message.type === 'state' && message.players.length === 2, 2500, 'two nearby gatherers');
  await Promise.all([new Promise(resolve => first.once('open', resolve)), new Promise(resolve => second.once('open', resolve))]);
  const initial = await initialState;
  const firstId = initial.players.find(player => player.name === 'Brasa').id;
  const secondId = initial.players.find(player => player.name === 'Folha').id;

  const firstStart = initial.players.find(player => player.id === firstId);
  const secondStart = initial.players.find(player => player.id === secondId);
  first.send(JSON.stringify({ type: 'input', ...directionToward(firstStart, southBranch) }));
  second.send(JSON.stringify({ type: 'input', ...directionToward(secondStart, southBranch) }));
  await waitFor(first, message => {
    if (message.type !== 'state') return false;
    const gathererOne = message.players.find(player => player.id === firstId);
    const gathererTwo = message.players.find(player => player.id === secondId);
    return gathererOne && gathererTwo
      && Math.hypot(gathererOne.x - southBranch.x, gathererOne.y - southBranch.y) <= 1.2
      && Math.hypot(gathererTwo.x - southBranch.x, gathererTwo.y - southBranch.y) <= 1.2;
  }, 7000, 'both gatherers beside the branch');
  first.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  second.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  const settled = await waitFor(first, message => {
    if (message.type !== 'state') return false;
    const gathererOne = message.players.find(player => player.id === firstId);
    const gathererTwo = message.players.find(player => player.id === secondId);
    return gathererOne && gathererTwo && !gathererOne.moving && !gathererTwo.moving;
  }, 2500, 'both gatherers stopped beside the branch');
  for (const id of [firstId, secondId]) {
    const player = settled.players.find(item => item.id === id);
    assert.ok(Math.hypot(player.x - southBranch.x, player.y - southBranch.y) <= 1.2);
  }

  const picked = waitFor(first, message => message.type === 'notice' && message.text === 'Você encontrou graveto seco.', 2500, 'first gatherer pickup');
  const removed = waitFor(second, message => message.type === 'state'
    && !message.resources.some(resource => resource.id === 'branch-south')
    && message.players.find(player => player.id === firstId)?.emote === 'gather', 2500, 'branch removal and gather gesture for second gatherer');
  first.send(JSON.stringify({ type: 'action', name: 'collect', requestId: 23 }));
  const [pickup, sharedGather] = await Promise.all([picked, removed]);
  assert.equal(pickup.resource?.id, 'branch-south');

  const clearNotice = waitFor(second, message => message.type === 'notice' && message.requestId === 24, 2500, 'second gatherer collection result');
  second.send(JSON.stringify({ type: 'action', name: 'collect', requestId: 24 }));
  const missedPickup = await clearNotice;
  assert.equal(missedPickup.action, 'collect');
  assert.equal(missedPickup.requestId, 24);
  assert.equal(missedPickup.result, 'miss');
  assert.equal(missedPickup.text, 'Aquele recurso já foi levado; procure outro.');
  assert.ok(sharedGather.players.find(player => player.id === firstId).emoteUntil > Date.now());
});

test('players can offer a nearby player one berry and both see the result', async t => {
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => {
      if (token === 'berry-sender') return { profile: { id: 'sender', displayName: 'Lia', guest: true, inventory: { wood: 0, stone: 0, berries: 1 } } };
      if (token === 'berry-receiver') return { profile: { id: 'receiver', displayName: 'Noa', guest: true, inventory: { wood: 0, stone: 0, berries: 0 } } };
      return null;
    },
  });
  const address = await room.listen();
  t.after(() => room.close());
  const sender = openTestPlayer(address, 'berry-sender');
  const receiver = openTestPlayer(address, 'berry-receiver');
  t.after(() => { sender.terminate(); receiver.terminate(); });
  const initialState = waitFor(sender, message => message.type === 'state' && message.players.length === 2, 2500, 'nearby players');
  await Promise.all([new Promise(resolve => sender.once('open', resolve)), new Promise(resolve => receiver.once('open', resolve))]);
  const initial = await initialState;
  const senderId = initial.players.find(player => player.name === 'Lia').id;
  const receiverId = initial.players.find(player => player.name === 'Noa').id;
  const senderPosition = initial.players.find(player => player.id === senderId);
  const receiverPosition = initial.players.find(player => player.id === receiverId);
  receiver.send(JSON.stringify({ type: 'input', x: Math.sign(senderPosition.x - receiverPosition.x), y: Math.sign(senderPosition.y - receiverPosition.y) }));
  await waitFor(sender, message => {
    if (message.type !== 'state') return false;
    const giver = message.players.find(player => player.id === senderId);
    const guest = message.players.find(player => player.id === receiverId);
    return giver && guest && Math.hypot(giver.x - guest.x, giver.y - guest.y) <= 1.5;
  }, 2500, 'receiver walking closer');
  receiver.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  const sentNotice = waitFor(sender, message => message.type === 'notice' && message.text.includes('ofereceu uma frutinha'), 2500, 'sender confirmation');
  const receivedNotice = waitFor(receiver, message => message.type === 'notice' && message.text.includes('compartilhou uma frutinha'), 2500, 'recipient confirmation');
  const hasTransfer = message => {
    if (message.type !== 'state') return false;
    const giver = message.players.find(player => player.id === senderId);
    const guest = message.players.find(player => player.id === receiverId);
    return giver?.inventory.berries === 0 && guest?.inventory.berries === 1;
  };
  const senderState = waitFor(sender, hasTransfer, 2500, 'giver inventory snapshot');
  const receiverState = waitFor(receiver, hasTransfer, 2500, 'recipient inventory snapshot');
  sender.send(JSON.stringify({ type: 'action', name: 'share' }));
  const [giverNotice, guestNotice, giverState, guestState] = await Promise.all([sentNotice, receivedNotice, senderState, receiverState]);
  assert.match(giverNotice.text, /ofereceu uma frutinha/);
  assert.match(guestNotice.text, /compartilhou uma frutinha/);
  assert.deepEqual(guestNotice.berryOffer, giverNotice.berryOffer);
  assert.equal(giverNotice.berryOffer.fromId, senderId);
  assert.equal(giverNotice.berryOffer.toId, receiverId);
  assert.ok(Math.hypot(
    giverNotice.berryOffer.from.x - giverNotice.berryOffer.to.x,
    giverNotice.berryOffer.from.y - giverNotice.berryOffer.to.y,
  ) <= 1.8);
  assert.equal(giverState.players.length, 2);
  assert.equal(guestState.players.length, 2);
  const giverPose = giverState.players.find(player => player.id === senderId);
  assert.equal(giverPose.emote, 'offer');
  assert.ok(giverPose.emoteUntil > Date.now());
});

test('o aviso de oferta informa quando a troca não pôde ser salva', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-unsaved-share-'));
  await writeFile(path.join(stateDirectory, 'progress'), 'not a directory');
  const profiles = {
    'unsaved-sender': { id: '12345678-1234-1234-1234-123456789012', displayName: 'Lia', guest: false, inventory: { wood: 0, stone: 0, berries: 1 } },
    'unsaved-receiver': { id: '22345678-1234-1234-1234-123456789012', displayName: 'Noa', guest: false, inventory: { wood: 0, stone: 0, berries: 0 } },
  };
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    stateDirectory,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => profiles[token] ? { profile: profiles[token] } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const sender = openTestPlayer(address, 'unsaved-sender');
  const receiver = openTestPlayer(address, 'unsaved-receiver');
  t.after(() => { sender.terminate(); receiver.terminate(); });
  const initialState = waitFor(sender, message => message.type === 'state' && message.players.length === 2, 2500, 'two players before unsaved offer');
  await Promise.all([new Promise(resolve => sender.once('open', resolve)), new Promise(resolve => receiver.once('open', resolve))]);
  const initial = await initialState;
  const senderPlayer = initial.players.find(player => player.name === 'Lia');
  const receiverPlayer = initial.players.find(player => player.name === 'Noa');
  receiver.send(JSON.stringify({ type: 'input', x: Math.sign(senderPlayer.x - receiverPlayer.x), y: Math.sign(senderPlayer.y - receiverPlayer.y) }));
  await waitFor(sender, message => {
    if (message.type !== 'state') return false;
    const giver = message.players.find(player => player.id === senderPlayer.id);
    const guest = message.players.find(player => player.id === receiverPlayer.id);
    return giver && guest && Math.hypot(giver.x - guest.x, giver.y - guest.y) <= 1.5;
  }, 2500, 'receiver walking closer before unsaved offer');
  receiver.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));

  const senderNotices = [];
  const receiverNotices = [];
  const rememberNotices = list => raw => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'notice') list.push(message.text);
  };
  const rememberSender = rememberNotices(senderNotices);
  const rememberReceiver = rememberNotices(receiverNotices);
  sender.on('message', rememberSender);
  receiver.on('message', rememberReceiver);
  const senderWarning = waitFor(sender, message => message.type === 'notice' && /oferta não foi salva/.test(message.text), 2500, 'sender persistence warning');
  const receiverWarning = waitFor(receiver, message => message.type === 'notice' && /troca não foi salva/.test(message.text), 2500, 'recipient persistence warning');
  sender.send(JSON.stringify({ type: 'action', name: 'share' }));
  await Promise.all([senderWarning, receiverWarning]);
  sender.off('message', rememberSender);
  receiver.off('message', rememberReceiver);
  assert.match(senderNotices.at(-1) || '', /oferta não foi salva/);
  assert.match(receiverNotices.at(-1) || '', /troca não foi salva/);
});

test('frutinha oferecida entre contas fica salva nas duas bolsas após reconectar', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-share-'));
  const accounts = createAccountStore({ directory: stateDirectory });
  const senderAccount = await accounts.register({ username: 'liabosque', displayName: 'Lia', password: 'senha-segura-de-teste' });
  const receiverAccount = await accounts.register({ username: 'noabosque', displayName: 'Noa', password: 'senha-segura-de-teste' });
  await saveAccountProgress(stateDirectory, senderAccount.profile.id, { wood: 0, stone: 0, berries: 1 });
  await saveAccountProgress(stateDirectory, receiverAccount.profile.id, { wood: 0, stone: 0, berries: 0 });

  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  const address = await room.listen();
  t.after(() => room.close());
  const sender = openTestPlayer(address, senderAccount.token);
  const receiver = openTestPlayer(address, receiverAccount.token);
  t.after(() => { sender.terminate(); receiver.terminate(); });
  const initialState = waitFor(sender, message => message.type === 'state' && message.players.length === 2, 2500, 'two account holders');
  await Promise.all([new Promise(resolve => sender.once('open', resolve)), new Promise(resolve => receiver.once('open', resolve))]);
  const initial = await initialState;
  const senderId = initial.players.find(player => player.name === senderAccount.profile.username).id;
  const receiverId = initial.players.find(player => player.name === receiverAccount.profile.username).id;
  const senderPosition = initial.players.find(player => player.id === senderId);
  const receiverPosition = initial.players.find(player => player.id === receiverId);
  receiver.send(JSON.stringify({ type: 'input', x: Math.sign(senderPosition.x - receiverPosition.x), y: Math.sign(senderPosition.y - receiverPosition.y) }));
  await waitFor(sender, message => {
    if (message.type !== 'state') return false;
    const giver = message.players.find(player => player.id === senderId);
    const guest = message.players.find(player => player.id === receiverId);
    return giver && guest && Math.hypot(giver.x - guest.x, giver.y - guest.y) <= 1.5;
  }, 2500, 'receiver walking closer before sharing');
  receiver.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  const transferred = message => {
    if (message.type !== 'state') return false;
    const giver = message.players.find(player => player.id === senderId);
    const guest = message.players.find(player => player.id === receiverId);
    return giver?.inventory.berries === 0 && guest?.inventory.berries === 1;
  };
  const transferState = waitFor(sender, transferred, 2500, 'saved transfer');
  sender.send(JSON.stringify({ type: 'action', name: 'share' }));
  await transferState;

  const senderClosed = new Promise(resolve => sender.once('close', resolve));
  sender.close();
  await senderClosed;
  const resumedSender = openTestPlayer(address, senderAccount.token);
  t.after(() => resumedSender.terminate());
  const senderRestored = waitFor(resumedSender, message => message.type === 'state' && message.players.length === 2, 2500, 'sender account after reconnect');
  await new Promise(resolve => resumedSender.once('open', resolve));
  const afterSenderReconnect = await senderRestored;
  assert.equal(afterSenderReconnect.players.find(player => player.name === senderAccount.profile.username)?.inventory.berries, 0);

  const receiverClosed = new Promise(resolve => receiver.once('close', resolve));
  receiver.close();
  await receiverClosed;
  const resumedReceiver = openTestPlayer(address, receiverAccount.token);
  t.after(() => resumedReceiver.terminate());
  const receiverRestored = waitFor(resumedReceiver, message => message.type === 'state' && message.players.length === 2, 2500, 'receiver account after reconnect');
  await new Promise(resolve => resumedReceiver.once('open', resolve));
  const afterReceiverReconnect = await receiverRestored;
  assert.equal(afterReceiverReconnect.players.find(player => player.name === receiverAccount.profile.username)?.inventory.berries, 1);
});

test('room health endpoint answers without exposing internal state', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0 });
  const address = await room.listen();
  t.after(() => room.close());
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
});

test('bounded diagnostics fit the websocket limit and oversized frames do not crash the room', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  player.on('error', () => {});
  t.after(() => player.terminate());
  const opened = new Promise((resolve, reject) => {
    player.once('open', resolve);
    player.once('error', reject);
  });
  const closed = new Promise(resolve => player.once('close', code => resolve(code)));
  await opened;
  const diagnosticEvent = { kind: 'connection-close', at: 1_000_000, attempt: 1_000_000,
    code: 1_000_000, pending: 1_000_000, outbound: 1_000_000, lastSentSeq: 1_000_000,
    lastAckSeq: 1_000_000, reason: 'movement-ack-stalled' };
  const diagnostics = { type: 'clientDiagnostics', version: 1, reportId: 'oversize-diagnostics-test',
    events: Array.from({ length: 24 }, () => diagnosticEvent) };
  const diagnosticBytes = Buffer.byteLength(JSON.stringify(diagnostics));
  assert.ok(diagnosticBytes > 4096 && diagnosticBytes < 8 * 1024, `expected bounded diagnostic batch near 4.5 KiB, got ${diagnosticBytes}`);
  const accepted = waitFor(player, message => message.type === 'diagnosticsAccepted'
    && message.reportId === diagnostics.reportId, 2500, 'bounded diagnostic batch acceptance');
  player.send(JSON.stringify(diagnostics));
  await accepted;
  player.send('x'.repeat(8 * 1024 + 1));
  assert.equal(await closed, 1009);
  const transportOversize = openTestPlayer(address);
  transportOversize.on('error', () => {});
  t.after(() => transportOversize.terminate());
  const transportOpened = new Promise((resolve, reject) => {
    transportOversize.once('open', resolve);
    transportOversize.once('error', reject);
  });
  const transportClosed = new Promise(resolve => transportOversize.once('close', code => resolve(code)));
  await transportOpened;
  transportOversize.send('x'.repeat(64 * 1024 + 1));
  assert.equal(await transportClosed, 1009, 'the transport ceiling closes only the oversized client socket');
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
});

test('room refuses websocket sessions without a valid account or guest cookie', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const status = await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1', port: address.port, path: '/room', method: 'GET',
      headers: { connection: 'Upgrade', upgrade: 'websocket', origin: TEST_ORIGIN, 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13' },
    });
    request.once('response', response => { response.resume(); resolve(response.statusCode); });
    request.once('error', reject);
    request.end();
  });
  assert.equal(status, 401);
});

test('room closes a socket cleanly when player initialization fails and accepts the next visitor', async t => {
  const brokenProfile = { id: 'broken-session', guest: true, inventory: {},
    get displayName() { throw new Error('injected profile initialization failure'); } };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN,
    resolveSession: token => token === 'broken-session' ? { profile: brokenProfile } : testIdentity(token) });
  const address = await room.listen();
  t.after(() => room.close());

  const failed = openTestPlayer(address, 'broken-session');
  t.after(() => failed.terminate());
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('failed initialization left the websocket open')), 2500);
    failed.once('close', () => { clearTimeout(timer); resolve(); });
    failed.once('error', error => { clearTimeout(timer); reject(error); });
  });
  await new Promise((resolve, reject) => { failed.once('open', resolve); failed.once('error', reject); });
  await closed;

  const next = openTestPlayer(address);
  t.after(() => next.terminate());
  await new Promise((resolve, reject) => { next.once('open', resolve); next.once('error', reject); });
  await waitFor(next, message => message.type === 'welcome', 2500, 'visitor after failed initialization');
});

test('room enforces the 200-player limit when session checks finish concurrently', async t => {
  const room = createTestServer(t, { ambientCampfire: false,
    port: 0,
    allowedOrigin: TEST_ORIGIN,
    resolveSession: async token => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return testIdentity(token);
    },
  });
  const address = await room.listen();
  t.after(() => room.close());

  const connections = Array.from({ length: 201 }, () => new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: TEST_ORIGIN, cookie: TEST_COOKIE },
  }));
  t.after(() => connections.forEach(socket => socket.terminate()));
  const outcomes = await Promise.all(connections.map(socket => new Promise((resolve, reject) => {
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'join', compactWorld: 1, viewport: { width: 390, height: 844 } }));
      resolve('open');
    });
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('error', error => reject(error));
  })));

  assert.equal(outcomes.filter(result => result === 'open').length, 200);
  assert.equal(outcomes.filter(result => result === 503).length, 1);
});

test('registered account identity and saved inventory are restored in the multiplayer room', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-account-'));
  const accounts = createAccountStore({ directory: stateDirectory });
  const created = await accounts.register({ username: 'bosqueuser', displayName: 'Pessoa da Mata', password: 'senha-segura-de-teste' });
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  const address = await room.listen();
  t.after(() => room.close());
  const player = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: TEST_ORIGIN, cookie: `clareira_session=${created.token}` },
  });
  t.after(() => player.terminate());
  const joined = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'account snapshot');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await joined;
  const id = initial.players[0].id;
  player.send(JSON.stringify({ type: 'input', ...directionToward(initial.players[0], southBranch) }));
  await waitFor(player, message => {
    const self = message.type === 'state' && message.players.find(item => item.id === id);
    return self?.moving && Math.hypot(self.x - southBranch.x, self.y - southBranch.y) <= 1.1;
  }, 5000, 'movement toward a resource');
  player.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
  await waitFor(player, message => message.type === 'state' && message.players.find(item => item.id === id)?.moving === false, 2500, 'player stop');
  player.send(JSON.stringify({ type: 'action', name: 'collect' }));
  const collected = await waitFor(player, message => {
    const self = message.type === 'state' && message.players.find(item => item.id === id);
    return Boolean(self && self.inventory.wood === 1);
  }, 2500, 'account pickup');
  assert.equal(collected.players[0].name, created.profile.username);

  const closed = new Promise(resolve => player.once('close', resolve));
  player.close();
  await closed;
  const resumed = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: TEST_ORIGIN, cookie: `clareira_session=${created.token}` },
  });
  t.after(() => resumed.terminate());
  const restored = waitFor(resumed, message => message.type === 'state' && message.players.length === 1, 2500, 'restored account inventory');
  await new Promise(resolve => resumed.once('open', resolve));
  const resumedState = await restored;
  assert.equal(resumedState.players[0].name, created.profile.username);
  assert.equal(resumedState.players[0].inventory.wood, 1);
  assert.equal(resumedState.players[0].inventory.stone, 0);
  assert.equal(resumedState.players[0].inventory.berries, 0);
  assert.equal(resumedState.players[0].inventory.leaves, 0);
  assert.equal(resumedState.players[0].inventory.knife, 1);
  assert.equal(resumedState.players[0].inventory.slots[0].itemId, 'knife');
  assert.equal(resumedState.players[0].inventory.slots[1].itemId, 'wood');
});

test('inventory slot swaps are saved and restored after reconnecting', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-inventory-slots-'));
  const accounts = createAccountStore({ directory: stateDirectory });
  const created = await accounts.register({ username: 'mochilatest', displayName: 'Viajante', password: 'senha-segura-de-teste' });
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  const address = await room.listen();
  t.after(() => room.close());
  const connect = () => new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: TEST_ORIGIN, cookie: `clareira_session=${created.token}` },
  });
  const player = connect();
  t.after(() => player.terminate());
  const joined = waitFor(player, message => message.type === 'state' && message.players.length === 1, 2500, 'initial inventory');
  await new Promise(resolve => player.once('open', resolve));
  const initial = await joined;
  const id = initial.players[0].id;
  player.send(JSON.stringify({ type: 'action', name: 'moveInventorySlot', from: 0, to: 9 }));
  const moved = await waitFor(player, message => {
    const inventory = message.type === 'state' && message.players.find(item => item.id === id)?.inventory;
    return inventory?.slots[9]?.itemId === 'knife' && inventory.slots[0] === null;
  }, 2500, 'saved inventory slot swap');
  assert.equal(moved.players[0].inventory.selectedSlot, 0);
  player.send(JSON.stringify({ type: 'action', name: 'moveInventorySlot', from: 9, to: 10 }));
  const reorganized = await waitFor(player, message => {
    const inventory = message.type === 'state' && message.players.find(item => item.id === id)?.inventory;
    return inventory?.slots[10]?.itemId === 'knife' && inventory.slots[9] === null;
  }, 2500, 'saved backpack slot swap');
  assert.equal(reorganized.players[0].inventory.selectedSlot, 0);

  const closed = new Promise(resolve => player.once('close', resolve));
  player.close();
  await closed;
  const resumed = connect();
  t.after(() => resumed.terminate());
  const restored = waitFor(resumed, message => message.type === 'state' && message.players.length === 1, 2500, 'restored inventory slot swap');
  await new Promise(resolve => resumed.once('open', resolve));
  const restoredState = await restored;
  assert.equal(restoredState.players[0].inventory.slots[0], null);
  assert.equal(restoredState.players[0].inventory.slots[9], null);
  assert.deepEqual(restoredState.players[0].inventory.slots[10], { itemId: 'knife', quantity: 1 });
});

test('seated wave remains seated after expiry; dance and movement stand up',async t=>{
 let clock=10000;const room=createTestServer(t, {port:0,allowedOrigin:TEST_ORIGIN,resolveSession:testIdentity,now:()=>clock});
 const address=await room.listen();t.after(()=>room.close());const player=openTestPlayer(address);t.after(()=>player.terminate());
 const joined=waitFor(player,m=>m.type==='state'&&m.players.length===1);await new Promise(r=>player.once('open',r));await joined;
 const action=async(name,predicate)=>{clock+=300;const reply=waitFor(player,m=>m.type==='state'&&predicate(m.players[0]),2500,`emote ${name}`);player.send(JSON.stringify({type:'emote',name}));return reply;};
 await action('sit',p=>p.sitting&&p.emote==='sit');await action('wave',p=>p.sitting&&p.emote==='wave');
 clock+=2200;const expired=await waitFor(player,m=>m.type==='state'&&m.players[0].sitting&&m.players[0].emote===null,2500,'sit survives wave expiry');assert.equal(expired.players[0].sitting,true);
 await action('dance',p=>!p.sitting&&p.emote==='dance');await action('sit',p=>p.sitting);
 clock+=300;const moving=waitFor(player,m=>m.type==='state'&&m.players[0].moving&&!m.players[0].sitting,2500,'movement exits sit');player.send(JSON.stringify({type:'input',x:0,y:1}));await moving;
});

test('inputs queued before sitting cannot cancel the seat, but new movement can',async t=>{
 let clock=20000;const room=createTestServer(t, {port:0,allowedOrigin:TEST_ORIGIN,resolveSession:testIdentity,now:()=>clock+Date.now(),tickIntervalMs:100});
 const address=await room.listen();t.after(()=>room.close());const player=openTestPlayer(address);t.after(()=>player.terminate());
 const joined=waitFor(player,m=>m.type==='state'&&m.players.length===1);await new Promise(r=>player.once('open',r));await joined;
 player.send(JSON.stringify({type:'input',location:'clearing',commands:[{seq:1,x:0,y:1,motion:true}]}));
 const seated=waitFor(player,m=>m.type==='state'&&m.players[0].sitting);player.send(JSON.stringify({type:'emote',name:'sit'}));await seated;
 clock+=300;const stopped=waitFor(player,m=>m.type==='state'&&m.players[0].inputSeq===2&&m.players[0].sitting&&!m.players[0].moving);
 player.send(JSON.stringify({type:'input',location:'clearing',commands:[{seq:2,x:0,y:0,motion:true}]}));await stopped;
 clock+=300;const standing=waitFor(player,m=>m.type==='state'&&m.players[0].inputSeq===3&&!m.players[0].sitting);
 player.send(JSON.stringify({type:'input',location:'clearing',commands:[{seq:3,x:0,y:1,motion:true}]}));await standing;
});

test('furniture can be edited remotely while use interactions require proximity, and changes persist', async t => {
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-functional-furniture-'));
  const accountId='f04406d9-b215-4d08-b4b9-894dd63477cc';
  const furniture=[{id:'abcdef01',kind:'chair',x:5.5,y:9,rotation:0},
    {id:'abcdef02',kind:'lamp',x:6.5,y:8,rotation:0,enabled:true}];
  await saveAccountRoom(stateDirectory,accountId,furniture);
  await createJsonPlayerLocationStore(stateDirectory).savePlayerLocation(accountId,{
    location:'room',dimensionId:'surface',x:7.5,y:9,roomKey:`account:${accountId}`,worldVersion:WORLD_COORDINATE_VERSION,
  });
  const options={ambientCampfire:false,port:0,stateDirectory,allowedOrigin:TEST_ORIGIN,
    resolveSession:async()=>({profile:{id:accountId,displayName:'Moveis',guest:false}})};
  let room=createTestServer(t,options),address=await room.listen(),player=openTestPlayer(address);
  t.after(()=>player.terminate());
  const initial = await waitFor(player,m=>m.type==='state'&&m.roomFurniture?.length===2);
  assert.ok(Math.hypot(initial.players[0].x-furniture[0].x,initial.players[0].y-furniture[0].y)>1.5,
    'the owner starts outside furniture interaction range');
  const action=async (data,predicate)=>{
    await new Promise(resolve=>setTimeout(resolve,300));
    const received=waitFor(player,m=>m.type==='state'&&predicate(m),3000,data.name);
    player.send(JSON.stringify({type:'action',...data}));return received;
  };
  await action({name:'useFurniture',id:'abcdef02'},m=>m.roomFurniture?.find(i=>i.kind==='lamp')?.enabled===false);
  await action({name:'rotateFurniture',id:'abcdef01'},m=>m.roomFurniture?.find(i=>i.kind==='chair')?.rotation===1);
  await action({name:'moveFurniture',id:'abcdef01',x:6.5,y:9.5},m=>m.roomFurniture?.find(i=>i.kind==='chair')?.y===9.5);
  const seated=await action({name:'useFurniture',id:'abcdef01'},m=>m.players.some(p=>p.sitting&&Math.hypot(p.x-6.5,p.y-9.5)<.05));
  let interactions=[];
  for(let attempt=0;attempt<60;attempt++){
    try{interactions=(await readFile(path.join(stateDirectory,'interactions.ndjson'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));}catch{}
    if(interactions.some(event=>event.action==='use_furniture'&&event.objectId==='abcdef01')
        &&interactions.some(event=>event.action==='use_furniture'&&event.objectId==='abcdef02'))break;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  const lampUse=interactions.find(event=>event.action==='use_furniture'&&event.objectId==='abcdef02');
  const seatUse=interactions.find(event=>event.action==='use_furniture'&&event.objectId==='abcdef01');
  assert.ok(lampUse,`lamp interaction is journaled: ${JSON.stringify(interactions)}`);
  assert.ok(seatUse,`seat interaction is journaled: ${JSON.stringify(interactions)}`);
  assert.equal(lampUse.location,'room');assert.equal(lampUse.objectProperties.enabled,false);
  assert.equal(lampUse.details.use,'toggle_light');assert.equal(seatUse.details.use,'sit');
  assert.equal(seatUse.details.sitting,true);assert.equal(seatUse.objectProperties.x,6.5);
  const id=seated.players[0].id;
  const standing=waitFor(player,m=>m.type==='state'&&m.players.some(p=>p.id===id&&!p.sitting&&p.inputSeq>=36&&p.x>7.2),3000,'leave the chair');
  for(let seq=1;seq<=36;seq+=12)player.send(JSON.stringify({type:'input',location:'room',commands:
    Array.from({length:12},(_,index)=>({seq:seq+index,x:1,y:0,motion:true}))}));
  await standing;
  player.send(JSON.stringify({type:'input',x:0,y:0}));
  await new Promise(resolve=>setTimeout(resolve,200));
  player.terminate();await room.close();
  const saved=await loadAccountRoom(stateDirectory,accountId);
  assert.equal(saved[0].y,9.5);assert.equal(saved[0].rotation,1);assert.equal(saved[1].enabled,false);
  room=createTestServer(t,options);address=await room.listen();player=openTestPlayer(address);
  const restored=await waitFor(player,m=>m.type==='state'&&m.roomFurniture?.length===2);
  assert.deepEqual(restored.roomFurniture,saved);
});

test('bed covers and shower use synced poses, toggle off, and allow movement back through the used fixture',async t=>{
 const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-bed-shower-'));
 const accountId='c45a1928-413d-4e7f-8bc1-2248443a7f62',token='bed-shower-session';
 const furniture=[{id:'bed00001',kind:'bed',x:8,y:6.5,rotation:0},{id:'5a0e0001',kind:'shower',x:7.5,y:9,rotation:1}];
 await saveAccountRoom(stateDirectory,accountId,furniture);
 await createJsonPlayerLocationStore(stateDirectory).savePlayerLocation(accountId,{location:'room',dimensionId:'surface',
   x:7.5,y:7.6,roomKey:`account:${accountId}`,worldVersion:WORLD_COORDINATE_VERSION});
 const room=createTestServer(t,{ambientCampfire:false,port:0,stateDirectory,allowedOrigin:TEST_ORIGIN,
   resolveSession:async session=>session===token?{profile:{id:accountId,displayName:'Descanso',guest:false}}:null});
 const address=await room.listen(),player=openTestPlayer(address,token);t.after(()=>player.terminate());
 let state=await waitFor(player,message=>message.type==='state'&&message.roomFurniture?.length===2
   &&message.players[0]?.location==='room');
 player.on('message', raw => { try { const message=JSON.parse(raw.toString()); if(message.type==='state') state=message; } catch {} });
 const notices=[];player.on('message',raw=>{try{const message=JSON.parse(raw.toString());if(message.type==='notice')notices.push(message.text);}catch{}});
 const actor=()=>state.players.find(value=>value.location==='room');
 const action=async(id,predicate)=>{
   await new Promise(resolve=>setTimeout(resolve,300));
   const changed=waitFor(player,message=>message.type==='state'&&predicate(message),3000,`usar ${id}`);
   player.send(JSON.stringify({type:'action',name:'useFurniture',id}));
   try{state=await changed;}catch(error){throw new Error(`${error.message}; notices: ${notices.join(' | ')||'none'}`);}return state;
 };
 state=await action('bed00001',message=>message.players.some(value=>value.furnitureUse?.id==='bed00001'));
 assert.equal(actor().emote,'lie');assert.equal(actor().furnitureUse.action,'lie');
 await new Promise(resolve=>setTimeout(resolve,300));
 const blockedNotice=waitFor(player,message=>message.type==='notice'&&message.text==='Alguém está usando este móvel.');
 player.send(JSON.stringify({type:'action',name:'removeFurniture',id:'bed00001'}));
 const blocked=await blockedNotice;assert.equal(blocked.text,'Alguém está usando este móvel.');
 state=await action('bed00001',message=>message.players.some(value=>value.location==='room'&&!value.furnitureUse));
 assert.equal(actor().emote,null);assert.ok(Math.hypot(actor().x-7.5,actor().y-7.6)<.05,'the player returns to the safe approach tile');
 const showerApproach=waitFor(player,message=>message.type==='state'&&message.players.some(value=>value.location==='room'
   &&Math.abs(value.x-7.5)<.08&&value.y>8.1),6000,'aproximação à ducha').catch(error=>{
   const current=state.players.find(value=>value.id===actor().id);
   throw new Error(`${error.message}; posição atual: ${JSON.stringify({x:current?.x,y:current?.y,moving:current?.moving,location:current?.location})}`);
 });
 const approachInput=setInterval(()=>player.send(JSON.stringify({type:'input',location:'room',x:0,y:1})),80);
 try{state=await showerApproach;}finally{clearInterval(approachInput);}
 player.send(JSON.stringify({type:'input',location:'room',x:0,y:0}));
 state=await action('5a0e0001',message=>message.players.some(value=>value.furnitureUse?.id==='5a0e0001'));
 assert.equal(actor().emote,'shower');assert.equal(actor().furnitureUse.action,'shower');
 const moved=waitFor(player,message=>message.type==='state'&&message.players.some(value=>value.location==='room'
   &&value.furnitureUse===null&&value.x>8.2),4000,'sair andando da ducha');
 for(let step=0;step<24;step++){player.send(JSON.stringify({type:'input',location:'room',x:1,y:0}));await new Promise(resolve=>setTimeout(resolve,60));}
 state=await moved;assert.equal(actor().emote,null);assert.ok(actor().x>8.2);
 const interactions=(await readFile(path.join(stateDirectory,'interactions.ndjson'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
 assert.ok(interactions.some(event=>event.objectId==='bed00001'&&event.details.use==='lie'));
 assert.ok(interactions.some(event=>event.objectId==='5a0e0001'&&event.details.use==='shower'));
 assert.deepEqual(await loadAccountRoom(stateDirectory,accountId),furniture,'poses are transient while furniture remains saved');
});

test('dimension travel prefers each account last safe place and finds a nearby free arrival when occupied', async t => {
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-dimension-arrival-position-'));
  const accounts=createAccountStore({directory:stateDirectory});
  const first=await accounts.register({username:'returnfirst',password:'senha-segura-de-teste'});
  const second=await accounts.register({username:'returnsecond',password:'senha-segura-de-teste'});
  const locations=createJsonPlayerLocationStore(stateDirectory);
  const breu=DEFAULT_DIMENSIONS.find(item=>item.id==='breu');
  const remembered={x:breu.spawn.x+4,y:breu.spawn.y+4};
  const legacyRemembered={x:WORLD_NATURE_ORIGIN.x+4,y:WORLD_NATURE_ORIGIN.y+4};
  for(const account of [first,second])await locations.savePlayerDimensionPosition(account.profile.id,
    {dimensionId:'breu',...legacyRemembered,worldVersion:WORLD_COORDINATE_VERSION});
  const room=createTestServer(t,{ambientCampfire:false,port:0,stateDirectory,allowedOrigin:TEST_ORIGIN});
  const address=await room.listen();t.after(()=>room.close());
  const firstPlayer=openTestPlayer(address,first.token),secondPlayer=openTestPlayer(address,second.token);
  t.after(()=>{firstPlayer.terminate();secondPlayer.terminate();});
  const firstReady=waitFor(firstPlayer,m=>m.type==='state'&&m.players.some(p=>p.id)&&m.dimensionId==='surface');
  const secondReady=waitFor(secondPlayer,m=>m.type==='state'&&m.players.length>=1&&m.dimensionId==='surface');
  const firstWelcome=waitFor(firstPlayer,m=>m.type==='welcome');
  const secondWelcome=waitFor(secondPlayer,m=>m.type==='welcome');
  await Promise.all([new Promise(resolve=>firstPlayer.once('open',resolve)),new Promise(resolve=>secondPlayer.once('open',resolve))]);
  const [firstState,secondState,firstIdentity,secondIdentity]=await Promise.all([firstReady,secondReady,firstWelcome,secondWelcome]);
  assert.equal(firstState.dimensionId,'surface');assert.equal(secondState.dimensionId,'surface');
  const firstId=firstIdentity.id,secondId=secondIdentity.id;
  const firstTransitPromise=waitFor(firstPlayer,m=>m.type==='state'&&m.dimensionTransits?.some(e=>e.actorId===firstId&&e.destinationDimensionId==='breu'),2500,'first saved-destination transit');
  firstPlayer.send(JSON.stringify({type:'dimensionTravel',dimensionId:'breu',requestId:'remembered-position'}));
  const firstTransit=(await firstTransitPromise).dimensionTransits.find(e=>e.actorId===firstId);
  assert.deepEqual({x:firstTransit.destinationX,y:firstTransit.destinationY},remembered,'an unoccupied remembered spot takes priority over the dimension spawn');
  const firstArrived=waitFor(firstPlayer,m=>m.type==='state'&&m.dimensionId==='breu'&&m.players.some(p=>p.id===firstId),3500,'first arrival transfer');
  await firstArrived;
  const secondTransitPromise=waitFor(secondPlayer,m=>m.type==='state'&&m.dimensionTransits?.some(e=>e.actorId===secondId&&e.destinationDimensionId==='breu'),2500,'occupied saved-destination transit');
  secondPlayer.send(JSON.stringify({type:'dimensionTravel',dimensionId:'breu',requestId:'occupied-position'}));
  const secondTransit=(await secondTransitPromise).dimensionTransits.find(e=>e.actorId===secondId);
  const fallbackDistance=Math.hypot(secondTransit.destinationX-remembered.x,secondTransit.destinationY-remembered.y);
  assert.ok(fallbackDistance>0.01&&fallbackDistance<=2.1,`fallback should be the nearest open spot around the occupied saved location, got ${fallbackDistance}`);
  const secondArrived=waitFor(secondPlayer,m=>m.type==='state'&&m.dimensionId==='breu'&&m.players.some(p=>p.id===secondId),3500,'fallback arrival transfer');
  await secondArrived;
  let savedPosition=null;
  for(let attempt=0;attempt<40;attempt++){
    savedPosition=(await locations.loadPlayerDimensionPositions(second.profile.id)).find(item=>item.dimensionId==='breu');
    if(savedPosition?.x===secondTransit.destinationX&&savedPosition?.y===secondTransit.destinationY)break;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.deepEqual({x:savedPosition?.x,y:savedPosition?.y},{x:secondTransit.destinationX,y:secondTransit.destinationY},
    'the chosen safe arrival becomes the remembered location for the next trip');
});


test('poção, atributo e habilidade atualizam e salvam a progressão da conta', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-progression-'));
  const accountId = 'e3a1c730-29f9-4c1b-88e2-d5d945318703';
  const profile = { id: accountId, username: 'progression-test', guest: false,
    inventory: { level: 1, xp: 0, xpPotionI: 1 } };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory,
    allowedOrigin: TEST_ORIGIN, databaseUrl: null, redisUrl: null,
    resolveSession: async token => token === 'progression-account' ? { profile } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'progression-account');
  t.after(() => player.terminate());
  const welcomePromise = waitFor(player, message => message.type === 'welcome', 2500, 'progression account welcome');
  const initialPromise = waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.xpPotionI === 1, 2500, 'saved potion in initial snapshot');
  await new Promise((resolve, reject) => { player.once('open', resolve); player.once('error', reject); });
  await welcomePromise;
  const initial = await initialPromise;
  assert.equal(initial.inventoryState.inventory.level, 1);

  const noticePromise = waitFor(player, message => message.type === 'notice', 2500, 'XP potion response');
  const updatedPromise = waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.level === 2
    && message.inventoryState.inventory.xpPotionI === 0, 2500, 'updated progression snapshot');
  player.send(JSON.stringify({ type: 'action', name: 'consumeXpPotion', itemId: 'xpPotionI' }));
  const [notice, updated] = await Promise.all([noticePromise, updatedPromise]);
  assert.match(notice.text || '', /^Poção de XP I usada: \+100 XP/u);
  assert.equal(updated.inventoryState.inventory.attributePoints, 1);
  assert.equal(updated.inventoryState.inventory.skillPoints, 1);

  const attributeNoticePromise = waitFor(player, message => message.type === 'notice'
    && /Força aumentou para 1/u.test(message.text || ''), 2500, 'attribute allocation notice');
  const attributeStatePromise = waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.attributes?.force === 1
    && message.inventoryState.inventory.attributePoints === 0, 2500, 'allocated attribute state');
  player.send(JSON.stringify({ type: 'action', name: 'allocateAttribute', attribute: 'force' }));
  const [attributeNotice] = await Promise.all([attributeNoticePromise, attributeStatePromise]);
  assert.match(attributeNotice.text || '', /Força aumentou para 1/u);

  const skillNoticePromise = waitFor(player, message => message.type === 'notice'
    && /Golpe Certeiro aprendida/u.test(message.text || ''), 2500, 'skill learning notice');
  const skillStatePromise = waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.learnedAbilities?.includes('quickStrike')
    && message.inventoryState.inventory.skillPoints === 0, 2500, 'learned skill state');
  player.send(JSON.stringify({ type: 'action', name: 'learnAbility', abilityId: 'quickStrike' }));
  const [skillNotice] = await Promise.all([skillNoticePromise, skillStatePromise]);
  assert.match(skillNotice.text || '', /Golpe Certeiro aprendida/u);

  const saved = JSON.parse(await readFile(path.join(stateDirectory, 'progress', accountId + '.json'), 'utf8'));
  assert.equal(saved.version, 2);
  assert.equal(saved.inventory.level, 2);
  assert.equal(saved.inventory.xpPotionI, 0);
  assert.equal(saved.inventory.attributes.force, 1);
  assert.equal(saved.inventory.attributePoints, 0);
  assert.equal(saved.inventory.learnedAbilities[0], 'quickStrike');
  assert.equal(saved.inventory.skillPoints, 0);
});

test('Arrancada aprende, ativa com prazo e respeita a recarga autoritativa', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-sprint-burst-'));
  const accountId = 'c08f8e93-567f-4fa8-b783-19dd4d47c4fa';
  const profile = { id: accountId, username: 'sprint-test', guest: false,
    inventory: { level: 2, xp: 0, skillPoints: 1, attributes: { speed: 0, agility: 0 } } };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory,
    allowedOrigin: TEST_ORIGIN, databaseUrl: null, redisUrl: null,
    resolveSession: async token => token === 'sprint-account' ? { profile } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'sprint-account');
  t.after(() => player.terminate());
  const initialPromise = waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.level === 2, 2500, 'level-two ability snapshot');
  await new Promise((resolve, reject) => { player.once('open', resolve); player.once('error', reject); });
  const initial = await initialPromise;
  assert.equal(initial.inventoryState.inventory.skillPoints, 1);

  player.send(JSON.stringify({ type: 'action', name: 'learnAbility', abilityId: 'sprintBurst' }));
  const learned = await waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.learnedAbilities?.includes('sprintBurst'), 2500, 'learned Arrancada snapshot');
  assert.equal(learned.inventoryState.inventory.skillPoints, 0);
  player.send(JSON.stringify({ type: 'action', name: 'castAbility', abilityId: 'sprintBurst' }));
  const active = await waitFor(player, message => message.type === 'state'
    && message.players?.some(candidate => candidate.sprintBurstRemainingMs > 0
      && candidate.abilityCooldowns?.sprintBurst > 0), 2500, 'active Arrancada snapshot');
  assert.ok(active.players.some(candidate => candidate.sprintBurstRemainingMs > 0));
  await new Promise(resolve => setTimeout(resolve, 300));
  player.send(JSON.stringify({ type: 'action', name: 'castAbility', abilityId: 'sprintBurst' }));
  const cooldown = await waitFor(player, message => message.type === 'notice'
    && /Aguarde \d+ s para conjurar novamente/u.test(message.text || ''), 2500, 'Arrancada cooldown notice');
  assert.match(cooldown.text, /Aguarde/u);

  const saved = JSON.parse(await readFile(path.join(stateDirectory, 'progress', accountId + '.json'), 'utf8'));
  assert.ok(saved.inventory.learnedAbilities.includes('sprintBurst'));
});

test('conhecimento mágico revela uma dimensão e libera a viagem no servidor', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-dimension-knowledge-'));
  const accountId = '5f6f1b60-f53b-4e73-9309-5440fa5d8ef1';
  const profile = { id: accountId, username: 'dimension-knowledge', guest: false,
    inventory: { level: 12, skillPoints: 2, attributes: { magic: 8 }, learnedAbilities: ['fireballI'] } };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory,
    allowedOrigin: TEST_ORIGIN, databaseUrl: null, redisUrl: null,
    resolveSession: async token => token === 'dimension-knowledge-account' ? { profile } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'dimension-knowledge-account');
  t.after(() => player.terminate());
  const initialStatePromise = waitFor(player, message => message.type === 'state'
    && Array.isArray(message.dimensions) && message.inventoryState?.inventory?.learnedAbilities?.includes('fireballI'),
  2500, 'hidden dimension before learning');
  await new Promise((resolve, reject) => { player.once('open', resolve); player.once('error', reject); });
  const initialState = await initialStatePromise;
  assert.equal(initialState.dimensions.some(dimension => dimension.id === 'inferno'), false);

  const revealNoticePromise = waitFor(player, message => message.type === 'notice'
    && message.text?.includes('passagem dimensional desconhecida'), 2500, 'dimension knowledge notice');
  const unlockedStatePromise = waitFor(player, message => message.type === 'state'
    && message.dimensions?.some(dimension => dimension.id === 'inferno')
    && message.inventoryState?.inventory?.learnedAbilities?.includes('fireballII'), 2500, 'Inferno unlocked');
  player.send(JSON.stringify({ type: 'action', name: 'learnAbility', abilityId: 'fireballII' }));
  await revealNoticePromise;
  const unlockedState = await unlockedStatePromise;
  assert.equal(unlockedState.dimensions.some(dimension => dimension.id === 'inferno'), true);

  const transitPromise = waitFor(player, message => message.type === 'state'
    && message.dimensionTransits?.some(transit => transit.destinationDimensionId === 'inferno'),
  3000, 'travel to discovered Inferno');
  player.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: 'inferno', requestId: 'learned-inferno' }));
  const travelState = await transitPromise;
  assert.ok(travelState.dimensionTransits.some(transit => transit.destinationDimensionId === 'inferno'));
});


test('Teleporte de Combate I canaliza antes do salto e o nivel II salta sem preparo', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-combat-blink-'));
  const profile = { id:'6f2cf11e-8c11-4a4b-bf76-28666e56a2bc', username:'blink-test', guest:false,
    inventory:{ level:16, attributes:{ agility:8, magic:10 },
      learnedAbilities:['combatBlink','combatBlinkII'] } };
  const room = createTestServer(t, { ambientCampfire:false, port:0, stateDirectory,
    allowedOrigin:TEST_ORIGIN, databaseUrl:null, redisUrl:null,
    resolveSession:async token => token === 'combat-blink-account' ? { profile } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'combat-blink-account');
  t.after(() => player.terminate());
  const welcomePromise = waitFor(player, message => message.type === 'welcome', 2500, 'combat teleporter welcome');
  const initialPromise = waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.learnedAbilities?.includes('combatBlinkII'), 2500, 'combat teleport abilities');
  await new Promise((resolve, reject) => { player.once('open', resolve); player.once('error', reject); });
  const welcome = await welcomePromise;
  const initial = await initialPromise;
  const origin = initial.players.find(entry => entry.id === welcome.id);
  assert.ok(origin, 'account starts in the clearing');

  const preparingPromise = waitFor(player, message => message.type === 'notice'
    && (message.text || '').includes('canalizando por 0,9'), 2500, 'slow combat teleport preparation');
  const slowLandingPromise = waitFor(player, message => message.type === 'state'
    && message.players.some(entry => entry.id === welcome.id && entry.x > origin.x + 3),
  3000, 'slow combat teleport landing');
  const slowStarted = Date.now();
  player.send(JSON.stringify({ type:'action', name:'castAbility', abilityId:'combatBlink', dx:1, dy:0 }));
  await preparingPromise;
  const slowLanding = await slowLandingPromise;
  assert.ok(Date.now() - slowStarted >= 800, 'the first combat teleport waits for its cast time');
  const slowPosition = slowLanding.players.find(entry => entry.id === welcome.id);
  assert.ok(slowPosition.x - origin.x >= 3, 'the first combat teleport moves in the chosen direction');

  const fastLandingPromise = waitFor(player, message => message.type === 'state'
    && message.players.some(entry => entry.id === welcome.id && entry.x > slowPosition.x + 5),
  2000, 'fast combat teleport landing');
  const fastStarted = Date.now();
  player.send(JSON.stringify({ type:'action', name:'castAbility', abilityId:'combatBlinkII', dx:1, dy:0 }));
  const fastLanding = await fastLandingPromise;
  assert.ok(Date.now() - fastStarted < 900, 'the second combat teleport does not add a windup');
  assert.ok(fastLanding.players.find(entry => entry.id === welcome.id).x > slowPosition.x + 5);
});

test('Teleporte Universal leva a conta para outro ponto seguro da mesma dimensão', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-universal-teleport-'));
  const profile = { id: '5e8293a4-3728-4ff5-9ce5-65d22f257143', username: 'universal-test', guest: false,
    inventory: { level: 20, skillPoints: 3, attributes: { agility: 8, magic: 10 },
      learnedAbilities: ['universalTeleport'] } };
  const room = createTestServer(t, { ambientCampfire: false, port: 0, stateDirectory,
    allowedOrigin: TEST_ORIGIN, databaseUrl: null, redisUrl: null,
    resolveSession: async token => token === 'universal-account' ? { profile } : null,
  });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address, 'universal-account');
  t.after(() => player.terminate());
  const welcomePromise = waitFor(player, message => message.type === 'welcome', 2500, 'universal teleporter welcome');
  const initialPromise = waitFor(player, message => message.type === 'state'
    && message.inventoryState?.inventory?.learnedAbilities?.includes('universalTeleport'), 2500, 'learned universal teleport');
  await new Promise((resolve, reject) => { player.once('open', resolve); player.once('error', reject); });
  const welcome = await welcomePromise;
  const initial = await initialPromise;
  const origin = initial.players.find(entry => entry.id === welcome.id);
  assert.ok(origin, 'account starts in the overworld');
  const requested = { x: origin.x + 24, y: origin.y + 18 };
  const transitPromise = waitFor(player, message => message.type === 'state'
    && message.dimensionTransits?.some(transit => transit.actorId === welcome.id && transit.universalTeleport),
  2500, 'universal teleport transit');
  player.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: initial.dimensionId,
    universalTeleport: true, ...requested, requestId: 'universal-destination-test' }));
  const transitState = await transitPromise;
  const transit = transitState.dimensionTransits.find(entry => entry.actorId === welcome.id && entry.universalTeleport);
  assert.equal(transit.sourceDimensionId, initial.dimensionId);
  assert.equal(transit.destinationDimensionId, initial.dimensionId);
  assert.equal(transit.travelCooldownMs, 45_000);
  assert.notDeepEqual({ x: transit.destinationX, y: transit.destinationY }, { x: origin.x, y: origin.y });
  assert.ok(Math.hypot(transit.destinationX - requested.x, transit.destinationY - requested.y) <= 64,
    'server adjusts the requested point only as needed to find safe ground');
});

test('dimension arrival starts only after the traveler reports the destination scene ready', async t => {
  const room = createTestServer(t, { ambientCampfire: false, port: 0, allowedOrigin: TEST_ORIGIN, resolveSession: testIdentity });
  const address = await room.listen();
  t.after(() => room.close());
  const player = openTestPlayer(address);
  t.after(() => player.terminate());
  const welcomePromise = waitFor(player, message => message.type === 'welcome', 2500, 'traveler identity');
  await new Promise((resolve, reject) => { player.once('open', resolve); player.once('error', reject); });
  const welcome = await welcomePromise;
  player.send(JSON.stringify({ type: 'join', name: 'Viajante', compactWorld: 1 }));

  const sourceState = await waitFor(player, message => message.type === 'state' && message.dimensionId === 'surface'
    && message.players.some(entry => entry.id === welcome.id), 2500, 'source-world snapshot');
  const transitPromise = waitFor(player, message => message.type === 'state'
    && message.dimensionTransits?.some(entry => entry.actorId === welcome.id && entry.destinationDimensionId === 'breu'),
  2500, 'source portal event');
  player.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: 'breu', requestId: 'dimension-arrival-test' }));
  const transitState = await transitPromise;
  const event = transitState.dimensionTransits.find(entry => entry.actorId === welcome.id);
  assert.equal(event.destinationStartAt, null, 'arrival remains unscheduled while the destination loads');
  assert.equal(event.transferAt, event.startAt + event.durationMs);
  assert.equal(event.sourceFadeMs, 420);

  const movedState = await waitFor(player, message => message.type === 'state' && message.dimensionId === 'breu'
    && message.dimensionTransits?.some(entry => entry.id === event.id), 3000, 'destination snapshot');
  assert.equal(movedState.dimensionTransits.find(entry => entry.id === event.id).destinationStartAt, null);
  const travelerAtDestination = movedState.players.find(entry => entry.id === welcome.id);
  assert.equal(travelerAtDestination.movementLocked, true, 'the authoritative server locks movement during loading');
  player.send(JSON.stringify({ type: 'input', location: 'clearing', dimensionId: 'breu',
    commands: Array.from({ length: 12 }, (_, index) => ({ seq: index + 1, x: 1, y: 0 })) }));
  const readyStatePromise = waitFor(player, message => message.type === 'state'
    && message.dimensionTransits?.some(entry => entry.id === event.id && Number.isFinite(entry.destinationStartAt)),
  2500, 'scheduled destination arrival');
  player.send(JSON.stringify({ type: 'dimensionTransitReady', transitId: event.id }));
  const readyState = await readyStatePromise;
  const travelerDuringLoading = readyState.players.find(entry => entry.id === welcome.id);
  assert.equal(travelerDuringLoading.x, travelerAtDestination.x, 'queued movement cannot move the traveler during loading');
  assert.equal(travelerDuringLoading.y, travelerAtDestination.y, 'queued movement cannot move the traveler during loading');
  const scheduled = readyState.dimensionTransits.find(entry => entry.id === event.id).destinationStartAt;
  assert.ok(scheduled >= event.transferAt + 3_000, 'the destination remains black for at least three seconds');

  assert.equal(readyState.players.find(entry => entry.id === welcome.id).movementLocked, true,
    'server keeps movement locked while the arrival portal is playing');
  assert.ok(readyState.players.find(entry => entry.id === welcome.id).dimensionTravelCooldownUntil
    >= scheduled + event.durationMs + 5_000, 'the next dimensional trip is blocked for five seconds after the arrival portal ends');
  const afterArrivalApex = waitFor(player, message => message.type === 'state'
    && message.players.some(entry => entry.id === welcome.id && entry.dimensionId === 'breu' && entry.movementLocked === false),
  6000, 'server unlocks movement after the arrival apex');
  player.send(JSON.stringify({ type: 'input', location: 'clearing', dimensionId: 'breu',
    commands: Array.from({ length: 12 }, (_, index) => ({ seq: index + 1, x: 1, y: 0 })) }));
  const unlockedState = await afterArrivalApex;
  const stillTraveler = unlockedState.players.find(entry => entry.id === welcome.id);
  assert.ok(unlockedState.serverTime >= scheduled + event.apexMs + 50,
    'the server keeps the lock beyond the frame where the avatar appears');
  assert.equal(stillTraveler.x, travelerAtDestination.x, 'movement sent during the arrival animation is discarded');
  assert.equal(stillTraveler.y, travelerAtDestination.y, 'movement sent during the arrival animation is discarded');
  assert.equal(stillTraveler.inputSeq, travelerAtDestination.inputSeq, 'movement commands are not acknowledged while locked');

  const cooldownNotice = waitFor(player, message => message.type === 'notice'
    && /Aguarde .* para viajar de dimensão novamente/u.test(message.text || ''),
  1800, 'server rejects another dimensional trip during cooldown');
  player.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: 'surface', requestId: 'dimension-cooldown-test' }));
  await cooldownNotice;

  const canMovePromise = waitFor(player, message => message.type === 'state'
    && message.players.some(entry => entry.id === welcome.id && entry.dimensionId === 'breu' && entry.inputSeq >= 12),
  1800, 'movement works again after arrival');
  player.send(JSON.stringify({ type: 'input', location: 'clearing', dimensionId: 'breu',
    commands: Array.from({ length: 12 }, (_, index) => ({ seq: index + 1, x: 1, y: 0 })) }));
  const canMoveState = await canMovePromise;
  assert.ok(canMoveState.players.find(entry => entry.id === welcome.id).inputSeq >= 12);
  assert.ok(sourceState.serverTime < event.startAt);
});
