// Masmorra do Covil do Ninho no servidor: entrar pela boca, sair pela escada, colisão da grade, instância
// separada por grupo e o exterior sem guardas nem baú. Usa porta 0 (aleatória) e fecha tudo no t.after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';
import { createAccountStore } from './account-store.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createInventory } from '../game/inventory.mjs';
import { WORLD_COORDINATE_VERSION } from '../game/world.mjs';
import { LAIRS } from '../game/lairs.mjs';
import { dungeonLevel } from '../game/dungeon-instances.mjs';

const TEST_ORIGIN = 'https://test.clareira.invalid';
const LAIR_MOUTH = LAIRS.ninho.mouth;

// Abre a sala de jogo com contas registradas; cada nome vira um perfil diferente (um grupo diferente).
async function startRoom(t, usernames, { placeAt } = {}) {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-dungeon-'));
  const accounts = createAccountStore({ directory: stateDirectory });
  for (const username of usernames) await accounts.register({ username, password: 'dungeon-fixture-only' });
  const registry = JSON.parse(await readFile(path.join(stateDirectory, 'accounts.json'), 'utf8')).accounts;
  const ids = Object.fromEntries(usernames.map(username => [username, registry.find(item => item.username === username).id]));
  const room = createPrototypeServer({
    arrivalTutorialEnabled: false, ambientCampfire: false, port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN,
    databaseUrl: null, redisUrl: null,
    resolveSession: async token => usernames.includes(token.replace(/^token-/, '')) ? {
      profile: { id: ids[token.replace(/^token-/, '')], username: token.replace(/^token-/, ''), guest: false,
        inventory: createInventory({ slots: [{ itemId: 'shortSword', quantity: 1 }], selectedSlot: 0 }) },
    } : null,
  });
  // Um só hook: fecha o servidor antes de apagar o diretório de estado (senão as gravações pendentes falham).
  t.after(async () => {
    await room.close();
    await rm(stateDirectory, { recursive: true, force: true });
  });
  const address = await room.listen();
  if (placeAt) {
    const store = createJsonPlayerLocationStore(stateDirectory);
    for (const username of usernames) {
      await store.savePlayerLocation(ids[username], { location: 'clearing', dimensionId: 'surface',
        x: placeAt[username].x, y: placeAt[username].y, worldVersion: WORLD_COORDINATE_VERSION });
    }
  }
  return { address, token: username => `token-${username}` };
}

// Espera a próxima mensagem que cumpre o predicado; o erro diz o que faltou.
function waitFor(socket, predicate, timeout, description) {
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

async function openPlayer(t, address, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin: TEST_ORIGIN, cookie: `clareira_session=${token}` },
  });
  t.after(() => socket.terminate());
  const welcome = waitFor(socket, message => message.type === 'welcome', 4000, `welcome for ${token}`);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const { id } = await welcome;
  const nextState = (predicate = () => true, timeout = 4000, description = 'state') =>
    waitFor(socket, message => message.type === 'state' && predicate(message), timeout, `${description} (${token})`);
  const self = state => state.players.find(item => item.id === id);
  return { socket, id, nextState, self, act: name => socket.send(JSON.stringify({ type: 'action', name })) };
}

// Anda em direção ao alvo com o input do cliente até ficar a até `gap`; desiste após 25 s.
async function walkTo(player, target, gap, description) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const state = await player.nextState(() => true, 4000, `${description} position`);
    const me = player.self(state);
    if (!me) continue;
    const dx = target.x - me.x, dy = target.y - me.y;
    if (Math.hypot(dx, dy) <= gap) {
      player.socket.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
      return me;
    }
    const length = Math.hypot(dx, dy) || 1;
    player.socket.send(JSON.stringify({ type: 'input', x: dx / length, y: dy / length }));
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`Não cheguei a ${description} em 25 s`);
}

test('masmorra: E na boca do covil desce ao nível 1 e a escada de saída devolve à boca', async t => {
  const { address, token } = await startRoom(t, ['dungeon_entrada'], {
    placeAt: { dungeon_entrada: { x: LAIR_MOUTH.x, y: LAIR_MOUTH.y + 0.6 } },
  });
  const player = await openPlayer(t, address, token('dungeon_entrada'));
  player.act('interact');
  const entered = await player.nextState(state => String(state.dimensionId || '').startsWith('dg-ninho-n1-'), 6000, 'dungeon dimension');
  assert.match(entered.dimensionId, /^dg-ninho-n1-[0-9a-f]{10}$/, 'instância com id dg-ninho-n<N>-<inst>');
  assert.equal(entered.dimension.theme, 'cave');
  assert.equal(entered.dimension.name, 'Covil do Ninho · Nível 1');

  const level = dungeonLevel(1);
  const exit = { x: level.exit.x + 0.5, y: level.exit.y + 0.5 };
  const atExit = await walkTo(player, exit, 1.0, 'escada de saída');
  assert.ok(Math.hypot(atExit.x - exit.x, atExit.y - exit.y) <= 1.0);
  player.act('interact');
  const back = await player.nextState(state => state.dimensionId === 'surface', 6000, 'return to surface');
  const me = player.self(back);
  assert.ok(Math.hypot(me.x - LAIR_MOUTH.x, me.y - (LAIR_MOUTH.y + 1.4)) <= 2.5, 'volta à frente da boca');
  player.socket.terminate();
});

test('masmorra: a grade bloqueia a rocha; o centro do jogador fica sempre em célula aberta', async t => {
  const { address, token } = await startRoom(t, ['dungeon_colisao'], {
    placeAt: { dungeon_colisao: { x: LAIR_MOUTH.x, y: LAIR_MOUTH.y + 0.6 } },
  });
  const player = await openPlayer(t, address, token('dungeon_colisao'));
  player.act('interact');
  await player.nextState(state => String(state.dimensionId || '').startsWith('dg-ninho-n1-'), 6000, 'dungeon dimension');
  const level = dungeonLevel(1);
  const entrance = { x: level.entrance.x + 0.5, y: level.entrance.y + 0.5 };
  await walkTo(player, entrance, 0.6, 'entrada da masmorra');
  for (const input of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }]) {
    player.socket.send(JSON.stringify({ type: 'input', ...input }));
    await new Promise(resolve => setTimeout(resolve, 5000));
    player.socket.send(JSON.stringify({ type: 'input', x: 0, y: 0 }));
    const me = player.self(await player.nextState(() => true, 4000, 'position after pushing a wall'));
    const cx = Math.floor(me.x), cy = Math.floor(me.y);
    assert.equal(level.cells[cy * level.w + cx], 1, `ao empurrar para ${input.x},${input.y} o centro ficou em célula aberta`);
  }
  player.socket.terminate();
});

test('masmorra: cada grupo tem a sua instância e não vê o outro', async t => {
  const names = ['dungeon_grupo_a', 'dungeon_grupo_b'];
  const { address, token } = await startRoom(t, names, {
    placeAt: Object.fromEntries(names.map(name => [name, { x: LAIR_MOUTH.x, y: LAIR_MOUTH.y + 0.6 }])),
  });
  // O segundo grupo entra depois que o primeiro desceu: os dois nascem sobrepostos na mesma boca.
  const a = await openPlayer(t, address, token(names[0]));
  a.act('interact');
  const stateA = await a.nextState(state => String(state.dimensionId || '').startsWith('dg-ninho-n1-'), 6000, 'group A dungeon');
  const b = await openPlayer(t, address, token(names[1]));
  b.act('interact');
  const stateB = await b.nextState(state => String(state.dimensionId || '').startsWith('dg-ninho-n1-'), 6000, 'group B dungeon');
  assert.notEqual(stateA.dimensionId, stateB.dimensionId, 'grupos diferentes ficam em instâncias diferentes');
  assert.deepEqual(stateA.players.map(item => item.id), [a.id], 'a instância A não mostra o jogador B');
  assert.deepEqual(stateB.players.map(item => item.id), [b.id], 'a instância B não mostra o jogador A');
  a.socket.terminate();
  b.socket.terminate();
});

test('exterior do covil: sem guardas e sem baú; a boca vai ao cliente com chest nulo', async t => {
  const { address, token } = await startRoom(t, ['dungeon_exterior'], {
    placeAt: { dungeon_exterior: { x: LAIR_MOUTH.x, y: LAIR_MOUTH.y + 6 } },
  });
  const player = await openPlayer(t, address, token('dungeon_exterior'));
  const state = await player.nextState(message => Array.isArray(message.lairs) && message.lairs.length > 0, 6000, 'lair mouth in snapshot');
  assert.equal(state.animals?.some(animal => String(animal.id).startsWith('lair:ninho:')), false, 'nenhum guardião no exterior');
  const [lair] = state.lairs;
  assert.equal(lair.id, 'ninho');
  assert.equal(lair.state, 'mouth');
  assert.equal(lair.chest, null);
  assert.deepEqual(lair.mouth, { x: LAIR_MOUTH.x, y: LAIR_MOUTH.y });
  player.socket.terminate();
});
