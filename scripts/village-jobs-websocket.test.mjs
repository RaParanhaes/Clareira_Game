import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { createStorageAdapter } from '../database/storage.mjs';
import { EMPTY_INVENTORY } from './account-store.mjs';
import { gameDayKey } from '../game/game-calendar.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { VILLAGE_JOB_POINTS } from '../game/village-jobs.mjs';
import { createAccountStore } from './account-store.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { WORLD_COORDINATE_VERSION } from '../game/dimension-layout.mjs';
import { GAME_DAY_DURATION_MS } from '../game/game-time.mjs';
import { CURRENCY_SCALE } from '../game/lodging-catalog.mjs';
import { findWalkPath, stepPlayer } from '../game/world.mjs';

const ORIGIN = 'https://village-jobs.test.invalid';
const PASSWORD = 'senha-de-teste-2026';
const POINT = Object.fromEntries(VILLAGE_JOB_POINTS.map(point => [point.id, point]));
const REWARD = 150;
const CARRIER_MIN_MS = 12_000;
// A carteira normaliza moedas (100 bronzes = 1 prata): o valor total é a conta que vale.
const value = wallet => wallet.gold * CURRENCY_SCALE.gold + wallet.silver * CURRENCY_SCALE.silver + wallet.bronze;
// Meio de um dia de jogo: o relógio controlado começa longe da virada, e o teste pede a virada quando quer.
const BASE_AT = Math.floor(Date.UTC(2026, 10, 16) / GAME_DAY_DURATION_MS) * GAME_DAY_DURATION_MS + GAME_DAY_DURATION_MS / 2;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const closed = ws => ws.readyState === WebSocket.CLOSED ? Promise.resolve() : new Promise(resolve => ws.once('close', resolve));

async function poll(label, check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`tempo esgotado: ${label}`);
    await sleep(15);
  }
}

// Relógio do servidor: tempo real a partir de BASE_AT, mais um deslocamento que o teste controla (sem congelar os timers).
function makeClock() {
  const startedAt = Date.now();
  const clock = { offset: 0, now: () => BASE_AT + (Date.now() - startedAt) + clock.offset, advance: ms => { clock.offset += ms; } };
  return clock;
}

// O próprio jogador é o de nome igual ao da conta: a marca de viewer não distingue jogadores numa sala com duas contas.
const self = (state, name) => state?.players?.find(player => player.name === name);
const carrier = state => state?.villageJobs?.jobs.find(job => job.id === 'carrier');

async function openRoom({ port, directory, now, ambientCampfire = false }) {
  const accounts = createAccountStore({ directory });
  const room = createPrototypeServer({ host: '127.0.0.1', port, allowedOrigin: ORIGIN, stateDirectory: directory, ambientCampfire, now, resolveSession: token => accounts.getSession(token) });
  await room.listen();
  return { room, accounts, port };
}

// Conta real: cadastro pelo mesmo armazenamento de contas e posição inicial no quadro (fixture de sandbox).
async function newAccount({ accounts, directory, label, offset = { x: 0, y: 0 }, base = POINT.board }) {
  const created = await accounts.register({ username: `ofc${label}${Math.random().toString(36).slice(2, 8)}`, password: PASSWORD });
  await createJsonPlayerLocationStore(directory).savePlayerLocation(created.profile.id, { location: 'clearing', dimensionId: 'surface', x: base.x + offset.x, y: base.y + offset.y, worldVersion: WORLD_COORDINATE_VERSION });
  return { token: created.token, id: created.profile.id, name: created.profile.username };
}

async function connect(port, account) {
  const session = { ws: null, latest: null, notices: [], name: account.name };
  session.ws = new WebSocket(`ws://127.0.0.1:${port}/room`, { headers: { origin: ORIGIN, cookie: `clareira_session=${account.token}` } });
  session.ws.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'state') session.latest = message;
    else if (message.type === 'notice' && message.villageJobResult) session.notices.push(message.villageJobResult);
  });
  await new Promise((resolve, reject) => { session.ws.once('open', resolve); session.ws.once('error', reject); });
  return session;
}

const waitState = (session, label, check) => poll(label, () => (session.latest && check(session.latest) ? session.latest : null));

// Envia uma ação e espera a resposta do servidor (a notícia com villageJobResult) — nunca a resposta do cliente.
async function act(session, message) {
  const mark = session.notices.length;
  session.ws.send(JSON.stringify({ type: 'action', ...message }));
  return poll(`resposta de ${message.name}`, () => (session.notices.length > mark ? session.notices[mark] : null));
}

// Anda pelo mesmo caminho de passos que o jogador usaria; o servidor valida cada lote pelo inputSeq confirmado.
async function walkTo(session, target) {
  const start = self(session.latest, session.name);
  let position = { x: start.x, y: start.y }, seq = start.inputSeq;
  const route = findWalkPath(position, target);
  assert.ok(route.length > 0, 'há caminho até o ponto');
  const commands = [];
  for (const waypoint of route) {
    for (let i = 0; i < 400 && Math.hypot(position.x - waypoint.x, position.y - waypoint.y) > 0.08; i++) {
      const dx = waypoint.x - position.x, dy = waypoint.y - position.y, length = Math.hypot(dx, dy);
      const speed = Math.min(1, length / (3.2 / 60));
      const command = { seq: ++seq, x: dx / length * speed, y: dy / length * speed };
      position = stepPlayer(position, command, 1 / 60);
      commands.push(command);
    }
  }
  for (let i = 0; i < commands.length; i += 12) {
    const batch = commands.slice(i, i + 12);
    session.ws.send(JSON.stringify({ type: 'input', location: 'clearing', commands: batch }));
    await poll('servidor confirma os passos', () => self(session.latest, session.name)?.inputSeq >= batch.at(-1).seq, 15_000);
  }
  await poll('chegada ao ponto', () => {
    const me = self(session.latest, session.name);
    return me && Math.hypot(me.x - target.x, me.y - target.y) <= 1.2;
  }, 8000);
}

async function closeSession(session) {
  if (session?.ws && session.ws.readyState !== WebSocket.CLOSED) { session.ws.close(1000, 'test complete'); await closed(session.ws); }
}

test('real WebSocket accepts only server-authoritative job messages and exposes guest/account requirement', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-village-jobs-ws-'));
  const accounts = createAccountStore({ directory });
  const guest = await accounts.guest();
  const locationStore = createJsonPlayerLocationStore(directory);
  await locationStore.savePlayerLocation(guest.profile.id, { location: 'clearing', dimensionId: 'surface', x: POINT.board.x, y: POINT.board.y, worldVersion: 2 });
  const room = createPrototypeServer({ host: '127.0.0.1', port: 19651, allowedOrigin: ORIGIN, stateDirectory: directory, ambientCampfire: false, resolveSession: token => accounts.getSession(token) });
  let socket;
  try {
    const address = await room.listen();
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, { headers: { origin: ORIGIN, cookie: `clareira_session=${guest.token}` } });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); socket.once('close', (code, reason) => reject(Error(`socket closed ${code}: ${reason}`))); });
    const nextMessage = predicate => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket response timeout')), 4000);
      const listener = data => { let message; try { message = JSON.parse(data.toString()); } catch { return; } if (predicate(message)) { clearTimeout(timer); socket.off('message', listener); resolve(message); } };
      socket.on('message', listener);
    });
    // Os ofícios vão dentro do pacote de estado normal; não há pacote avulso villageJobs.
    const sideMessages = [];
    socket.on('message', data => { let message; try { message = JSON.parse(data.toString()); } catch { return; } if (message.type === 'villageJobs') sideMessages.push(message); });
    const state = await nextMessage(message => message.type === 'state' && Object.hasOwn(message, 'villageJobs'));
    assert.equal(state.villageJobs.requiresAccount, true);
    await sleep(250);
    assert.deepEqual(sideMessages, []);
    socket.send(JSON.stringify({ type: 'action', name: 'villageJobStart', jobId: 'carrier' }));
    const result = await nextMessage(message => message.type === 'notice' && message.villageJobResult);
    assert.equal(result.villageJobResult.ok, false);
    assert.match(result.villageJobResult.notice, /conta/);
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.close(1000, 'test complete');
    await sleep(20);
    await room.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('real account completes a carrier turn: wallet, snapshot, minimum time, forged fields and replay across a restart', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-oficio-conta-'));
  const clock = makeClock();
  let current = null, session = null, restarted = null;
  try {
    current = await openRoom({ port: 19652, directory, now: clock.now });
    const me = await newAccount({ accounts: current.accounts, directory, label: 'a' });
    session = await connect(current.port, me);
    const initial = await waitState(session, 'estado com ofícios da conta', st => self(st, me.name) && st.villageJobs?.requiresAccount === false);
    assert.equal(carrier(initial).completed, 0);
    assert.equal(carrier(initial).remaining, 3);
    assert.equal(value(initial.inventoryState.inventory), 0);

    const before = clock.now();
    const started = await act(session, { name: 'villageJobStart', jobId: 'carrier' });
    assert.equal(started.ok, true);
    assert.match(started.active.runId, /^[0-9a-f-]{36}$/i);
    assert.equal(started.active.stage, 'carrying');
    assert.ok(started.active.readyAt - before >= CARRIER_MIN_MS && started.active.readyAt - before < CARRIER_MIN_MS + 3000, 'o servidor marca 12 s de espera');

    // Tempo mínimo: entregar antes de readyAt é recusado pelo servidor, sem pagamento.
    const early = await act(session, { name: 'villageJobFinish', runId: started.active.runId });
    assert.equal(early.ok, false);
    assert.match(early.notice, /ainda não terminou/);
    assert.equal(value(await current.accounts.getWallet(me.id)), 0);

    clock.advance(CARRIER_MIN_MS);
    await walkTo(session, POINT.delivery);
    // Campos forjados (valor, carteira, limite) são ignorados: o servidor usa só o catálogo.
    const paid = await act(session, { name: 'villageJobFinish', runId: started.active.runId, amount: 99999, rewardBronze: 99999, dailyLimit: 99, wallet: { bronze: 99999 } });
    assert.equal(paid.ok, true);
    assert.equal(paid.payment.amount, REWARD);
    assert.equal(value(paid.wallet), REWARD);

    // Cache do dia invalidado: o snapshot mostra a conclusão, a carteira no jogador e o último pagamento.
    const after = await waitState(session, 'snapshot após o pagamento', st => carrier(st)?.completed === 1 && st.villageJobs?.active === null);
    assert.equal(carrier(after).remaining, 2);
    assert.equal(after.villageJobs.lastPayment.amount, REWARD);
    assert.equal(after.villageJobs.lastPayment.runId, started.active.runId);
    assert.equal(value(after.inventoryState.inventory), REWARD);
    assert.equal(value(await current.accounts.getWallet(me.id)), REWARD);

    // Replay: o mesmo runId devolve sucesso sem novo crédito.
    const replay = await act(session, { name: 'villageJobFinish', runId: started.active.runId });
    assert.equal(replay.ok, true);
    assert.equal(replay.replay, true);
    assert.equal(value(replay.wallet), REWARD);
    await sleep(150);
    assert.equal(carrier(session.latest).completed, 1);
    assert.equal(value(await current.accounts.getWallet(me.id)), REWARD);

    // Reinício do servidor: o replay sai do ledger gravado, não da memória.
    await closeSession(session);
    session = null;
    await current.room.close();
    current = null;
    restarted = await openRoom({ port: 19653, directory, now: clock.now });
    session = await connect(restarted.port, me);
    await waitState(session, 'estado depois do reinício', st => st.villageJobs?.requiresAccount === false && carrier(st)?.completed === 1);
    const afterRestart = await act(session, { name: 'villageJobFinish', runId: started.active.runId });
    assert.equal(afterRestart.ok, true);
    assert.equal(afterRestart.replay, true);
    assert.equal(value(afterRestart.wallet), REWARD);
    assert.equal(value(await restarted.accounts.getWallet(me.id)), REWARD);
  } finally {
    await closeSession(session);
    await current?.room.close();
    await restarted?.room.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('daily quota: the fourth completion is refused, and the next game day gives the quota back', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-oficio-cota-'));
  const clock = makeClock();
  const room = await openRoom({ port: 19654, directory, now: clock.now });
  let session = null;
  try {
    const me = await newAccount({ accounts: room.accounts, directory, label: 'b' });
    session = await connect(room.port, me);
    const first = await waitState(session, 'estado inicial', st => st.villageJobs?.requiresAccount === false);
    const firstDay = first.villageJobs.dayKey;

    for (let turn = 1; turn <= 3; turn++) {
      const started = await act(session, { name: 'villageJobStart', jobId: 'carrier' });
      assert.equal(started.ok, true, `turno ${turn} começa`);
      clock.advance(CARRIER_MIN_MS);
      await walkTo(session, POINT.delivery);
      const paid = await act(session, { name: 'villageJobFinish', runId: started.active.runId });
      assert.equal(paid.ok, true, `turno ${turn} é pago`);
      await waitState(session, `contagem ${turn}`, st => carrier(st)?.completed === turn);
      if (turn < 3) await walkTo(session, POINT.board);
    }
    assert.equal(value(await room.accounts.getWallet(me.id)), 3 * REWARD);

    // Quarta conclusão: recusada no início, sem abrir turno e sem pagamento.
    await walkTo(session, POINT.board);
    const fourth = await act(session, { name: 'villageJobStart', jobId: 'carrier' });
    assert.equal(fourth.ok, false);
    assert.match(fourth.notice, /cota/);
    const spent = session.latest;
    assert.equal(spent.villageJobs.active, null);
    assert.equal(carrier(spent).remaining, 0);
    assert.equal(value(await room.accounts.getWallet(me.id)), 3 * REWARD);

    // Virada do dia de jogo: a cota volta e a chave do dia muda no snapshot.
    clock.advance(GAME_DAY_DURATION_MS);
    const nextDay = await waitState(session, 'cota do novo dia', st => carrier(st)?.remaining === 3 && st.villageJobs.dayKey !== firstDay);
    assert.equal(carrier(nextDay).completed, 0);
    const again = await act(session, { name: 'villageJobStart', jobId: 'carrier' });
    assert.equal(again.ok, true);
    const cancelled = await act(session, { name: 'villageJobCancel', runId: again.active.runId });
    assert.equal(cancelled.ok, true);
    assert.equal(value(await room.accounts.getWallet(me.id)), 3 * REWARD);
  } finally {
    await closeSession(session);
    await room.room.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('reconnecting clears the active turn; an old runId is refused afterwards', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-oficio-reconexao-'));
  const clock = makeClock();
  const room = await openRoom({ port: 19655, directory, now: clock.now });
  let session = null, fresh = null;
  try {
    const me = await newAccount({ accounts: room.accounts, directory, label: 'c' });
    session = await connect(room.port, me);
    await waitState(session, 'estado inicial', st => st.villageJobs?.requiresAccount === false);
    const started = await act(session, { name: 'villageJobStart', jobId: 'carrier' });
    assert.equal(started.ok, true);
    await waitState(session, 'turno ativo no snapshot', st => st.villageJobs?.active?.runId === started.active.runId);
    await closeSession(session);
    session = null;

    fresh = await connect(room.port, me);
    const reconnected = await waitState(fresh, 'snapshot depois da reconexão', st => st.villageJobs?.requiresAccount === false);
    assert.equal(reconnected.villageJobs.active, null, 'a desconexão cancela o turno ativo');
    assert.equal(carrier(reconnected).completed, 0);
    const stale = await act(fresh, { name: 'villageJobFinish', runId: started.active.runId });
    assert.equal(stale.ok, false);
    assert.equal(value(await room.accounts.getWallet(me.id)), 0);
    const staleCancel = await act(fresh, { name: 'villageJobCancel', runId: started.active.runId });
    assert.equal(staleCancel.ok, false);
  } finally {
    await closeSession(session);
    await closeSession(fresh);
    await room.room.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid claims are refused by the server: unknown job, wrong point, forged or malformed runId, forged cancel', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-oficio-claim-'));
  const clock = makeClock();
  const room = await openRoom({ port: 19656, directory, now: clock.now });
  let session = null;
  try {
    const me = await newAccount({ accounts: room.accounts, directory, label: 'd' });
    session = await connect(room.port, me);
    await waitState(session, 'estado inicial', st => st.villageJobs?.requiresAccount === false);

    const unknown = await act(session, { name: 'villageJobStart', jobId: 'mina-de-ouro' });
    assert.equal(unknown.ok, false);
    assert.match(unknown.notice, /não existe/);
    // Fogueira é o ponto da ajudante; no quadro a recusa é de ponto.
    const wrongPoint = await act(session, { name: 'villageJobStart', jobId: 'firekeeper' });
    assert.equal(wrongPoint.ok, false);

    const started = await act(session, { name: 'villageJobStart', jobId: 'carrier' });
    assert.equal(started.ok, true);
    await waitState(session, 'turno ativo', st => st.villageJobs?.active?.runId === started.active.runId);

    const forgedId = await act(session, { name: 'villageJobFinish', runId: '00000000-0000-4000-8000-000000000000' });
    assert.equal(forgedId.ok, false);
    assert.match(forgedId.notice, /inválido/);
    for (const runId of ['nao-e-uuid', 12345, undefined]) {
      const malformed = await act(session, { name: 'villageJobFinish', runId });
      assert.equal(malformed.ok, false, `runId ${String(runId)} recusado`);
    }
    const forgedCancel = await act(session, { name: 'villageJobCancel', runId: '00000000-0000-4000-8000-000000000000' });
    assert.equal(forgedCancel.ok, false);
    await sleep(120);
    assert.equal(session.latest.villageJobs?.active?.runId, started.active.runId, 'o turno continua depois de cancelamentos forjados');
    assert.equal(value(await room.accounts.getWallet(me.id)), 0);
    assert.equal(carrier(session.latest).completed, 0);

    const cancelled = await act(session, { name: 'villageJobCancel', runId: started.active.runId });
    assert.equal(cancelled.ok, true);
  } finally {
    await closeSession(session);
    await room.room.close();
    await rm(directory, { recursive: true, force: true });
  }
});

// Concorrência no adapter JSON real: duas contas creditam ao mesmo tempo, sem perder crédito nem linha do ledger.
// (Pela rota WebSocket, duas contas no quadro ao mesmo tempo não cabem: o servidor afasta quem entra sobre outro jogador.)
test('two accounts credit in parallel on the JSON adapter without losing a credit or a ledger row', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-oficio-paralelo-'));
  try {
    const storage = createStorageAdapter({ directory });
    const first = await storage.accounts.register({ username: `ofcg${Math.random().toString(36).slice(2, 8)}`, password: PASSWORD });
    const second = await storage.accounts.register({ username: `ofch${Math.random().toString(36).slice(2, 8)}`, password: PASSWORD });
    const dayKey = gameDayKey(BASE_AT);
    const claim = () => ({ runId: randomUUID(), jobId: 'carrier', dayKey, dailyLimit: 3, rewardBronze: REWARD });
    // Quatro conclusões disparadas juntas: duas por conta, em ordem intercalada.
    const credits = [first, second, first, second].map(account => storage.creditWalletAndSaveProgress(account.profile.id, REWARD, { ...EMPTY_INVENTORY }, claim()));
    const results = await Promise.all(credits);
    assert.ok(results.every(result => result.replay === false), 'nenhuma conclusão é replay');
    assert.equal(value(await storage.accounts.getWallet(first.profile.id)), 2 * REWARD);
    assert.equal(value(await storage.accounts.getWallet(second.profile.id)), 2 * REWARD);
    const rows = JSON.parse(await readFile(path.join(directory, 'village-job-ledger.json'), 'utf8'));
    const mine = rows.filter(row => row.profileId === first.profile.id || row.profileId === second.profile.id);
    assert.equal(mine.length, 4);
    assert.equal(new Set(mine.map(row => row.runId)).size, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Fogueira real do mundo (ambientCampfire ligado, sem mock de isHearthLit): o ajudante do fogo
// precisa começar e concluir com a fogueira permanente da chegada na superfície.
test('firekeeper with the real surface hearth: starts and completes on the permanent arrival fire', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-oficio-fogo-'));
  const clock = makeClock();
  let room = null, session = null;
  try {
    room = await openRoom({ port: 19657, directory, now: clock.now, ambientCampfire: true });
    const me = await newAccount({ accounts: room.accounts, directory, label: 'f', base: POINT.hearth });
    session = await connect(room.port, me);
    await waitState(session, 'estado com ofícios da conta', st => self(st, me.name) && st.villageJobs?.requiresAccount === false);
    const started = await act(session, { name: 'villageJobStart', jobId: 'firekeeper' });
    assert.equal(started.ok, true, started.notice);
    assert.equal(started.active.stage, 'working');
    clock.advance(10_500);
    const finished = await act(session, { name: 'villageJobFinish', runId: started.active.runId });
    assert.equal(finished.ok, true, finished.notice);
    assert.equal(value(finished.wallet), REWARD);
  } finally {
    await closeSession(session);
    await room?.room.close();
    await rm(directory, { recursive: true, force: true });
  }
});
