import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createAccountStore } from './account-store.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { VILLAGE_BUILDINGS } from '../game/village-buildings.mjs';
import { CABIN_EXTERIOR_SERVICES } from '../game/place-services.mjs';
import { WORLD_COORDINATE_VERSION } from '../game/world.mjs';

function waitFor(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', listener); reject(new Error('Cabin response timed out')); }, 3000);
    function listener(raw) {
      const message = JSON.parse(raw);
      if (!predicate(message)) return;
      clearTimeout(timer); socket.off('message', listener); resolve(message);
    }
    socket.on('message', listener);
  });
}
const pause = () => new Promise(resolve => setTimeout(resolve, 280));

test('cabins stay locked outdoors; purchase, shared key, exit, revoke and reconnect use authoritative access', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-cabin-door-'));
  const accounts = createAccountStore({ directory }), locations = createJsonPlayerLocationStore(directory);
  const origin = 'https://cabin-test.clareira.invalid';
  const building = VILLAGE_BUILDINGS.find(building => building.id === 'cabin-cedar-one');
  const sign = CABIN_EXTERIOR_SERVICES[building.id].anchor;
  const sockets = new Set(); let room, address;
  async function connect(account) {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, { headers: { origin, cookie: `clareira_session=${account.token}` } });
    sockets.add(socket);
    socket.selfId = null; socket.state = null;
    socket.on('message', raw => { const msg = JSON.parse(raw); if (msg.type === 'welcome') socket.selfId = msg.id;
      if (msg.type === 'notice') console.log(account.profile.username, msg.text);
      if (msg.type === 'state') socket.state = msg; });
    await waitFor(socket, message => message.type === 'state'); return socket;
  }
  async function command(socket, data, text) {
    console.log('command', data.name, text);
    await pause(); const reply = waitFor(socket, message => message.type === 'notice' && message.text.includes(text));
    socket.send(JSON.stringify({ type: 'action', ...data })); return reply;
  }
  async function close(socket) {
    const done = new Promise(resolve => socket.once('close', resolve)); socket.close(); await done; sockets.delete(socket);
  }
  try {
    const owner = await accounts.register({ username: 'CabinOwner', password: 'cabin-test-password' });
    const friend = await accounts.register({ username: 'CabinFriend', password: 'cabin-test-password' });
    const outsider = await accounts.register({ username: 'CabinOutsider', password: 'cabin-test-password' });
    await accounts.creditWallet(owner.profile.id, 3200);
    const outside = async (account, point) => locations.savePlayerLocation(account.profile.id, {
      location: 'clearing', dimensionId: 'surface', x: point.x, y: point.y, worldVersion: WORLD_COORDINATE_VERSION });
    await outside(owner, sign); await outside(friend, { x: building.door.x, y: building.door.y + .6 });
    // A legacy public cabin lobby is never a way past the lock after upgrade.
    await locations.savePlayerLocation(outsider.profile.id, { location: 'room', dimensionId: 'surface', x: 8, y: 8.8,
      roomKey: `lobby:${building.id}`, worldVersion: WORLD_COORDINATE_VERSION });
    room = createPrototypeServer({ port: 0, stateDirectory: directory, allowedOrigin: origin, ambientCampfire: false });
    address = await room.listen();
    const unknown = await connect(outsider);
    assert.equal(unknown.state.players[0].location, 'clearing'); assert.notEqual(unknown.state.roomKind, 'lobby');
    await command(unknown, { name: 'interact' }, 'trancada');
    assert.equal(unknown.state.players[0].location, 'clearing');
    await close(unknown);
    const own = await connect(owner);
    const bought = waitFor(own, state => state.type === 'state' && state.cabinKeys?.some(key => key.isOwner));
    await command(own, { name: 'lodgeClaim', buildingId: building.id, mode: 'owned' }, 'recebeu a chave'); await bought;
    assert.equal(own.state.players.find(player => player.id === own.selfId).location, 'clearing', 'purchase never enters before using the key');
    await command(own, { name: 'cabinGrantKey', buildingId: building.id, username: friend.profile.username }, 'Chave entregue');
    let visitor = await connect(friend);
    const entered = waitFor(visitor, state => state.type === 'state' && state.roomKind === 'lodging');
    await command(visitor, { name: 'interact' }, 'com sua chave'); await entered;
    assert.equal(visitor.state.roomCanEdit, false); assert.equal(visitor.state.lodgingClaim, null, 'a shared key does not claim the owner’s property');
    const exited = waitFor(visitor, state => state.type === 'state' && state.players.find(player => player.id === visitor.selfId)?.location === 'clearing');
    await command(visitor, { name: 'interact' }, 'saiu da cabana'); await exited;
    assert.notEqual(visitor.state.roomKind, 'lobby');
    const reentered = waitFor(visitor, state => state.type === 'state' && state.roomKind === 'lodging');
    await command(visitor, { name: 'interact' }, 'com sua chave'); await reentered;
    const revoked = waitFor(visitor, state => state.type === 'state' && !state.cabinKeys.length
      && state.players.find(player => player.id === visitor.selfId)?.location === 'clearing');
    await command(own, { name: 'cabinRevokeKey', buildingId: building.id, profileId: friend.profile.id }, 'revogada'); await revoked;
    await command(visitor, { name: 'interact' }, 'trancada');
    await close(visitor);
    await command(own, { name: 'cabinGrantKey', buildingId: building.id, username: friend.profile.username }, 'Chave entregue');
    visitor = await connect(friend);
    const returning = waitFor(visitor, state => state.type === 'state' && state.roomKind === 'lodging');
    await command(visitor, { name: 'interact' }, 'com sua chave'); await returning;
    await close(visitor); await close(own); await room.close();
    room = createPrototypeServer({ port: 0, stateDirectory: directory, allowedOrigin: origin, ambientCampfire: false }); address = await room.listen();
    visitor = await connect(friend);
    assert.equal(visitor.state.roomKind, 'lodging', 'a saved key restores access after a server restart');
    await close(visitor); await room.close();
    await accounts.setCabinKey({ ownerProfileId: owner.profile.id, buildingId: building.id, profileId: friend.profile.id, revoke: true });
    room = createPrototypeServer({ port: 0, stateDirectory: directory, allowedOrigin: origin, ambientCampfire: false }); address = await room.listen();
    visitor = await connect(friend);
    assert.equal(visitor.state.players[0].location, 'clearing', 'a revoked key cannot restore a cached private room');
    assert.notEqual(visitor.state.roomKind, 'lobby');
  } finally {
    for (const socket of sockets) socket.terminate(); if (room) await room.close();
    await rm(directory, { recursive: true, force: true });
  }
});
