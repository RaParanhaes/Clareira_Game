import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';

function waitForState(socket, predicate, description = 'appearance snapshot') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', read);
      reject(new Error(`Missing ${description}`));
    }, 2500);
    function read(raw) {
      const value = JSON.parse(raw.toString());
      if (value.type !== 'state' || !predicate(value)) return;
      clearTimeout(timer);
      socket.off('message', read);
      resolve(value);
    }
    socket.on('message', read);
  });
}

test('body appearance reaches another player and survives a fresh server instance', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-appearance-room-'));
  const origin = 'https://appearance.test';
  const resolveSession = async token => ({ profile: {
    id: token, guest: false, displayName: token, inventory: { wood: 0, stone: 0, berries: 0 },
  } });
  const options = { port: 0, stateDirectory: directory, allowedOrigin: origin,
    arrivalTutorialEnabled: false, resolveSession };
  let server = createPrototypeServer(options);
  let address = await server.listen();
  let owner;
  let viewer;
  t.after(async () => {
    owner?.terminate();
    viewer?.terminate();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });

  const connect = id => new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin, cookie: `clareira_session=${id}` },
  });
  owner = connect('appearance-owner');
  viewer = connect('appearance-viewer');
  await Promise.all([owner, viewer].map(socket => new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  })));
  await waitForState(viewer, state => state.players.length === 2, 'two-player snapshot');

  const changed = waitForState(viewer, state => state.players.some(player =>
    player.name === 'appearance-owner' && player.appearance.body === 'female'), 'updated appearance snapshot');
  // Joining counts as an action on the server; wait out its short action cooldown.
  await new Promise(resolve => setTimeout(resolve, 300));
  owner.send(JSON.stringify({ type: 'appearance', appearance: { body: 'female' } }));
  await changed;

  owner.terminate();
  viewer.terminate();
  await server.close();
  server = createPrototypeServer(options);
  address = await server.listen();
  owner = connect('appearance-owner');
  const restored = await waitForState(owner, state => state.players.length === 1, 'restored appearance snapshot');
  assert.equal(restored.players[0].appearance.body, 'female');
});
