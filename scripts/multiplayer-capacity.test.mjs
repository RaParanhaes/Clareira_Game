import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';

const origin = 'https://capacity-test.clareira.invalid';

test('50 jogadores ativos recebem estados compartilhados e confirmam movimento', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-capacity-'));
  const room = createPrototypeServer({
    port: 0,
    stateDirectory,
    allowedOrigin: origin,
    ambientCampfire: false,
    arrivalTutorialEnabled: false,
    resolveSession: token => {
      const id = token.replace('capacity-', '');
      return { profile: { id, guest: true, displayName: `Jogador ${id}`, inventory: { wood: 0, stone: 0, berries: 0 } } };
    },
  });
  const address = await room.listen();
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.socket.terminate();
    await room.close();
    await rm(stateDirectory, { recursive: true, force: true });
  });

  clients.push(...Array.from({ length: 50 }, (_, index) => ({
    socket: new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
      headers: { origin, cookie: `clareira_session=capacity-${index}` },
    }),
    latest: null,
    id: null,
    seq: 0,
  })));

  await Promise.all(clients.map(client => new Promise((resolve, reject) => {
    client.socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'welcome') client.id = message.id;
      if (message.type === 'state') client.latest = message;
    });
    client.socket.once('open', () => {
      client.socket.send(JSON.stringify({ type: 'join', name: 'Teste de carga', compactWorld: 1,
        viewport: { width: 1440, height: 900 } }));
      resolve();
    });
    client.socket.once('error', reject);
  })));

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitForAllVisible = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (clients.every(client => client.latest?.players?.length === 50)) return;
      await delay(50);
    }
    assert.fail('nem todos os clientes receberam os 50 jogadores visíveis');
  };
  await waitForAllVisible();

  for (let batch = 0; batch < 30; batch += 1) {
    for (let index = 0; index < clients.length; index += 1) {
      const client = clients[index], angle = (index % 8) * Math.PI / 4;
      const commands = Array.from({ length: 3 }, () => ({
        seq: ++client.seq,
        x: Math.cos(angle),
        y: Math.sin(angle),
      }));
      client.socket.send(JSON.stringify({ type: 'input', location: 'clearing', commands }));
    }
    await delay(50);
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (clients.every(client => (client.latest?.players?.find(player => player.id === client.id)?.inputSeq || 0) >= 60)) break;
    await delay(50);
  }
  for (const client of clients) {
    const self = client.latest?.players?.find(player => player.id === client.id);
    assert.ok(self?.inputSeq >= 60, 'o servidor confirmou os comandos do jogador');
  }
});
