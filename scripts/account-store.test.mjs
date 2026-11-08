import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAccountStore, EMPTY_INVENTORY, parseCookies, saveAccountProgress, validateInventory } from './account-store.mjs';
const expectedInventory=values=>validateInventory({...EMPTY_INVENTORY,...values});

test('account passwords are salted, login creates a new session, and logout revokes it', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const accounts = createAccountStore({ directory });

  const created = await accounts.register({ username: 'Rafa_01', password: 'caminho-da-clareira' });
  assert.equal(created.profile.username, 'rafa_01');
  assert.equal(Object.hasOwn(created.profile, 'displayName'), false);
  assert.deepEqual(created.profile.inventory, expectedInventory());
  const stored = JSON.parse(await readFile(path.join(directory, 'accounts.json'), 'utf8'));
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.accounts[0].password, undefined);
  assert.notEqual(stored.accounts[0].passwordHash, 'caminho-da-clareira');
  assert.equal(stored.accounts[0].salt.length, 32);

  await assert.rejects(accounts.register({ username: 'rafa_01', password: 'caminho-da-clareira' }), error => error.status === 409);
  await assert.rejects(accounts.register({ username: 'putaria', password: 'caminho-da-clareira' }), error => error.status === 400);
  await assert.rejects(accounts.login({ username: 'rafa_01', password: 'senha-errada-123' }), error => error.status === 401);
  await accounts.register({ username: 'outro_nome', password: 'caminho-da-clareira' });
  const loggedIn = await accounts.login({ username: 'RAFA_01', password: 'caminho-da-clareira' });
  assert.notEqual(loggedIn.token, created.token);
  assert.equal((await accounts.getSession(loggedIn.token)).profile.username, 'rafa_01');
  const renamed = await accounts.updateUsername(loggedIn.token, 'Rafa_02');
  assert.equal(renamed.username, 'rafa_02');
  assert.equal(Object.hasOwn(renamed, 'displayName'), false);
  await assert.rejects(accounts.updateUsername(loggedIn.token, 'outro_nome'), error => error.status === 409);
  await assert.rejects(accounts.updateUsername(loggedIn.token, 'buceta'), error => error.status === 400);
  assert.equal((await accounts.login({ username: 'rafa_02', password: 'caminho-da-clareira' })).profile.username, 'rafa_02');
  await assert.rejects(accounts.login({ username: 'rafa_01', password: 'caminho-da-clareira' }), error => error.status === 401);
  await accounts.logout(loggedIn.token);
  assert.equal(await accounts.getSession(loggedIn.token), null);
});

test('guest sessions receive an automatic name, while account inventory survives a new store instance', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-guest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'accounts.json'), JSON.stringify({ accounts: [], sessions: [] }));
  const accounts = createAccountStore({ directory });

  const visitor = await accounts.guest();
  assert.equal(visitor.profile.guest, true);
  assert.equal(visitor.maxAge, 24 * 60 * 60 * 1000);
  assert.match(visitor.profile.displayName, /^Visitante [0-9a-f]{4}$/);
  await assert.rejects(accounts.updateUsername(visitor.token, 'Pessoa_01'), error => error.status === 403);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'accounts.json'), 'utf8')).schemaVersion, 1,
    'legacy account file gains a version marker on its next write');

  const registered = await accounts.register({ username: 'bosque01', password: 'uma-senha-bem-longa' });
  const progressFile = path.join(directory, 'progress', `${registered.profile.id}.json`);
  await mkdir(path.dirname(progressFile), { recursive: true });
  await writeFile(progressFile, JSON.stringify({ wood: 3, stone: 1, berries: 2 }));
  assert.deepEqual((await createAccountStore({ directory }).getSession(registered.token)).profile.inventory,
    expectedInventory({ wood: 3, stone: 1, berries: 2 }), 'legacy flat inventory remains readable');
  await saveAccountProgress(directory, registered.profile.id, { wood: 7, stone: 2, berries: 4 });
  const savedProgress = JSON.parse(await readFile(progressFile, 'utf8'));
  assert.equal(savedProgress.version, 2);
  const expectedSavedInventory = expectedInventory({ wood: 7, stone: 2, berries: 4 });
  delete expectedSavedInventory.gold;
  delete expectedSavedInventory.silver;
  delete expectedSavedInventory.bronze;
  assert.deepEqual(savedProgress.inventory, expectedSavedInventory);
  const afterRestart = await createAccountStore({ directory }).getSession(registered.token);
  assert.deepEqual(afterRestart.profile.inventory, expectedInventory({ wood: 7, stone: 2, berries: 4 }));
  assert.deepEqual(await createAccountStore({ directory }).getSession(visitor.token).then(value => value.profile.inventory), expectedInventory());
});

test('cookie parser preserves opaque session values and does not accept later duplicates', () => {
  const cookies = parseCookies('other=abc; clareira_session=Abc_123-xyz; clareira_session=attacker');
  assert.equal(cookies.get('clareira_session'), 'Abc_123-xyz');
});
