import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditPlayerSaves } from './audit-player-saves.mjs';
import { saveAccountRoom } from './room-store.mjs';
import { EMPTY_INVENTORY, validateInventory } from './account-store.mjs';

test('player save audit counts legacy formats without changing any files', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-save-audit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const accountId = '021ea54b-c917-4bda-9ba4-9f1a40e9d68b';
  const auth = {
    schemaVersion: 1,
    accounts: [{
      id: accountId, username: 'bosque01', displayName: 'Pessoa', salt: 'a'.repeat(32),
      passwordHash: 'b'.repeat(128), scryptN: 131072, createdAt: Date.now(),
    }],
    sessions: [{
      id: 'e04d06d9-b215-4d08-b4b9-894dd63477cc', tokenHash: 'c'.repeat(64), accountId,
      displayName: 'Pessoa', guest: false, createdAt: Date.now(), expiresAt: Date.now() + 60_000,
    }],
  };
  const authFile = path.join(directory, 'accounts.json');
  await writeFile(authFile, JSON.stringify(auth));
  await mkdir(path.join(directory, 'progress'), { recursive: true });
  const progressFile = path.join(directory, 'progress', `${accountId}.json`);
  await writeFile(progressFile, JSON.stringify({ wood: 2, stone: 0, berries: 5 }));
  await mkdir(path.join(directory, 'appearances'), { recursive: true });
  const appearanceFile = path.join(directory, 'appearances', `${accountId}.json`);
  await writeFile(appearanceFile, JSON.stringify({ skin: 2, outfit: 'robe' }));
  await saveAccountRoom(directory, accountId, []);
  await writeFile(path.join(directory, 'feedback.jsonl'), `${JSON.stringify({ message: 'private feedback' })}\n`);

  const before = await Promise.all([authFile, progressFile, appearanceFile].map(file => readFile(file, 'utf8')));
  const result = await auditPlayerSaves(directory);
  const after = await Promise.all([authFile, progressFile, appearanceFile].map(file => readFile(file, 'utf8')));

  assert.equal(result.status, 'clean');
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.totals, {
    accounts: 1, sessions: 1, activeSessions: 1, expiredSessions: 0, guestSessions: 0,
    activeGuestSessions: 0, activeAccountSessions: 1,
    inventoryFiles: 1, nonEmptyInventoryItems: 2, appearanceFiles: 1,
    rooms: 1, roomObjects: 0, feedbackRecords: 1,
  });
  assert.equal(result.formats.legacyInventories, 1);
  assert.equal(result.formats.legacyAppearances, 1);
  assert.deepEqual(result.issues, {});
  assert.deepEqual(after, before, 'audit leaves source files byte-for-byte unchanged');
  assert.equal(JSON.stringify(result).includes('private feedback'), false, 'audit never returns private feedback content');
});

test('player save audit flags future and orphan saves without exposing identifiers', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-save-audit-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'accounts.json'), JSON.stringify({ schemaVersion: 1, accounts: [], sessions: [] }));
  await mkdir(path.join(directory, 'progress'), { recursive: true });
  const orphanId = '11111111-1111-4111-8111-111111111111';
  await writeFile(path.join(directory, 'progress', `${orphanId}.json`), JSON.stringify({ version: 3, inventory: {} }));

  const result = await auditPlayerSaves(directory);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.issues.orphanProgressFiles, 1);
  assert.equal(result.issues.unsupportedInventoryVersions, 1);
  assert.equal(JSON.stringify(result).includes(orphanId), false, 'audit omits account identifiers');
});

test('player save audit recognizes stable appearance versions 2, 3 and 4', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-save-audit-appearance-versions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const accounts = [
    { id: '021ea54b-c917-4bda-9ba4-9f1a40e9d68b', username: 'bosque01' },
    { id: '121ea54b-c917-4bda-9ba4-9f1a40e9d68b', username: 'bosque02' },
    { id: '221ea54b-c917-4bda-9ba4-9f1a40e9d68b', username: 'bosque03' },
  ];
  await writeFile(path.join(directory, 'accounts.json'), JSON.stringify({ schemaVersion: 1, accounts: accounts.map(account => ({
    ...account, displayName: 'Pessoa', salt: 'a'.repeat(32), passwordHash: 'b'.repeat(128), scryptN: 131072, createdAt: Date.now(),
  })), sessions: [] }));
  await mkdir(path.join(directory, 'appearances'), { recursive: true });
  await writeFile(path.join(directory, 'appearances', `${accounts[0].id}.json`), JSON.stringify({ version: 2, appearance: {
    bodyId: 'female', skinId: 'skin_escura', hairColorId: 'hair_copper', hairStyleId: 'curly',
    height: 1.1, muscle: 2, coatId: 'coat_berry', outfitId: 'robe', heldItemId: 'lantern',
  } }));
  await writeFile(path.join(directory, 'appearances', `${accounts[1].id}.json`), JSON.stringify({ version: 3, appearance: { bodyId: 'male' } }));
  await writeFile(path.join(directory, 'appearances', `${accounts[2].id}.json`), JSON.stringify({ version: 4, appearance: {
    archetypeId: 'character.mage', bodyId: 'female', outfitId: 'outfit.mage-robe',
  } }));

  const result = await auditPlayerSaves(directory);
  assert.equal(result.status, 'clean');
  assert.equal(result.totals.appearanceFiles, 3);
  assert.equal(result.formats.version2Appearances, 1);
  assert.equal(result.formats.version3Appearances, 1);
  assert.equal(result.formats.version4Appearances, 1);
});

test('player save audit accepts normalized progression data in versioned inventory saves', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-save-audit-progression-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const accountId = '321ea54b-c917-4bda-9ba4-9f1a40e9d68b';
  await writeFile(path.join(directory, 'accounts.json'), JSON.stringify({
    schemaVersion: 1,
    accounts: [{ id: accountId, username: 'progresso01', salt: 'a'.repeat(32), passwordHash: 'b'.repeat(128), scryptN: 131072, createdAt: Date.now() }],
    sessions: [],
  }));
  await mkdir(path.join(directory, 'progress'), { recursive: true });
  const inventory = validateInventory({ ...EMPTY_INVENTORY,
    attributes: { force: 1, magic: 2 }, learnedAbilities: ['fireballI'],
    slots: [{ itemId: 'rawMeat', quantity: 3 }], selectedSlot: 0,
  });
  await writeFile(path.join(directory, 'progress', `${accountId}.json`), JSON.stringify({ version: 2, inventory }));

  const result = await auditPlayerSaves(directory);
  assert.equal(result.status, 'clean');
  assert.deepEqual(result.issues, {});
});
