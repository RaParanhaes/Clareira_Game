import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';

// Com a picareta equipada, `work` tentaria minerar; `craftAxe` precisa fabricar sempre.
test('craftAxe fabrica o machado mesmo com a picareta equipada, e recusa quem já tem um', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-craft-axe-'));
  const origin = 'https://craft-axe.test';
  const resolveSession = async token => ({ profile: {
    id: token, guest: false, displayName: token,
    inventory: { sturdyBranch: 1, stone: 1, vines: 1, stonePickaxe: 1, pickaxeDurability: 180,
      slots: [{ itemId: 'stonePickaxe', quantity: 1 }, { itemId: 'sturdyBranch', quantity: 1 }, { itemId: 'stone', quantity: 1 }, { itemId: 'vines', quantity: 1 }], selectedSlot: 0 },
  } });
  const server = createPrototypeServer({ port: 0, stateDirectory: directory, allowedOrigin: origin,
    arrivalTutorialEnabled: false, resolveSession });
  const address = await server.listen();
  let socket;
  t.after(async () => { socket?.terminate(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  const seen = [];
  socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, { headers: { origin, cookie: 'clareira_session=craft-axe' } });
  socket.on('message', raw => seen.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const until = async (predicate, label) => {
    for (let i = 0; i < 60; i++) { const hit = seen.find(predicate); if (hit) return hit; await new Promise(r => setTimeout(r, 50)); }
    throw new Error(`sem ${label}: ${JSON.stringify(seen.slice(-3)).slice(0, 400)}`);
  };
  const inventoryOf = message => message.inventory || message.self?.inventory
    || message.players?.find(player => player.name === 'craft-axe')?.inventory;
  await until(message => message.type === 'state', 'primeiro estado');
  await new Promise(resolve => setTimeout(resolve, 300));
  seen.length = 0;
  // Prova do cenário: com a picareta equipada, `work` vai para a mineração e não fabrica.
  socket.send(JSON.stringify({ type: 'action', name: 'work' }));
  await until(message => /veio de cobre, ferro ou carvão/u.test(JSON.stringify(message)), 'aviso de mineração do work');
  assert.ok(!seen.some(message => inventoryOf(message)?.stoneAxe === 1), 'work não deve fabricar com a picareta equipada');
  seen.length = 0;
  await new Promise(resolve => setTimeout(resolve, 600));
  socket.send(JSON.stringify({ type: 'action', name: 'craftAxe' }));
  const crafted = await until(message => inventoryOf(message)?.stoneAxe === 1, 'machado fabricado');
  const inventory = inventoryOf(crafted);
  assert.equal(inventory.sturdyBranch, 0);
  assert.equal(inventory.stone, 0);
  assert.equal(inventory.vines, 0);
  assert.equal(inventory.stonePickaxe, 1);
  seen.length = 0;
  await new Promise(resolve => setTimeout(resolve, 400));
  socket.send(JSON.stringify({ type: 'action', name: 'craftAxe' }));
  const refused = await until(message => /já tem um machado/u.test(JSON.stringify(message)), 'recusa do segundo machado');
  assert.ok(refused);
});
