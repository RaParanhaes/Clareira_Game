import { validateInventory } from '../scripts/account-store.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';
import { createPostgresStore } from './store.mjs';
import { applyJsonImport, buildJsonImportPlan } from './json-import.mjs';
import { createPreviewServer } from '../scripts/dev-preview-page.mjs';
import { createPrototypeServer } from '../scripts/prototype-server.mjs';
import { saveAccountRoom } from '../scripts/room-store.mjs';
import { roomFurnitureSupport, WORLD_COORDINATE_VERSION } from '../game/world.mjs';

const connectionString = process.env.TEST_DATABASE_URL;

function waitForState(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', read);
      reject(new Error('Timed out waiting for PostgreSQL-backed room state'));
    }, 4000);
    function read(raw) {
      const state = JSON.parse(raw.toString());
      if (state.type !== 'state' || !predicate(state)) return;
      clearTimeout(timer);
      socket.off('message', read);
      resolve(state);
    }
    socket.on('message', read);
  });
}

test('PostgreSQL persistence and HTTP-to-game login work end to end', {
  skip: !connectionString,
}, async t => {
  const pool = createDatabasePool({ connectionString, max: 6, applicationName: 'clareira-integration-test' });
  const cleanupProfileIds = new Set();
  const cleanupInteractionEventIds = new Set();
  const directories = [];
  let preview;
  let room;
  let socket;
  t.after(async () => {
    socket?.terminate();
    await room?.close();
    await preview?.close();
    for (const eventId of cleanupInteractionEventIds) {
      await pool.query('DELETE FROM interaction_events WHERE event_id = $1', [eventId]).catch(() => {});
    }
    for (const profileId of cleanupProfileIds) {
      await pool.query('DELETE FROM profiles WHERE id = $1', [profileId]).catch(() => {});
      await pool.query('DELETE FROM accounts WHERE id = $1', [profileId]).catch(() => {});
    }
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
    await pool.end();
  });

  const migration = await runMigrations(pool);
  assert.equal(migration.migrations,
    (await readdir(new URL('./migrations/', import.meta.url))).filter(filename => filename.endsWith('.sql')).length);
  assert.equal((await runMigrations(pool)).applied.length, 0);
  const bank = await pool.query(
    "SELECT b.bank_id,r.balance_bronze,p.base_rate_bps,p.credit_capacity_bps " +
    "FROM world_banks b JOIN bank_reserve_accounts r USING(bank_id) " +
    "JOIN bank_interest_policies p USING(bank_id) WHERE b.bank_id='surface:arrival:bank' AND p.active",
  );
  assert.equal(bank.rows.length,1);
  assert.deepEqual(bank.rows[0],{bank_id:'surface:arrival:bank',balance_bronze:'0',base_rate_bps:500,credit_capacity_bps:0});
  assert.equal(Number((await pool.query('SELECT count(*) FROM government_budget_templates')).rows[0].count),0,
    'illustrative government budgets are not silently installed as world defaults');
  const indicatorTables=await pool.query(
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",
    [['government_minimum_wage_policies','government_wage_payments','economic_production_events',
      'government_trade_tariff_policies','intergovernmental_trade_records','economy_indicator_snapshots','player_dimension_positions','player_map_exploration']],
  );
  assert.equal(Number(indicatorTables.rows[0].count),8,'migrations install the indicator/audit tables, arrival checkpoints and map exploration');
  const store = createPostgresStore(pool);

  const source = await mkdtemp(path.join(os.tmpdir(), 'clareira-pg-import-'));
  directories.push(source);
  const importedId = randomUUID();
  const importedGuestId = randomUUID();
  const importedModernId = randomUUID();
  const now = Date.now();
  const importedToken = 'account-token-' + randomUUID();
  const guestToken = 'guest-token-' + randomUUID();
  cleanupProfileIds.add(importedId);
  cleanupProfileIds.add(importedGuestId);
  cleanupProfileIds.add(importedModernId);
  await writeFile(path.join(source, 'accounts.json'), JSON.stringify({
    schemaVersion: 1,
    accounts: [{
      id: importedId, username: 'fixture_01', displayName: 'Conta fixture',
      salt: 'ab'.repeat(16), passwordHash: 'cd'.repeat(64), scryptN: 131072, createdAt: now,
    }, {id:importedModernId,username:'fixture_modern',role:'admin',wallet:{gold:1,silver:23,bronze:4},salt:'ab'.repeat(16),passwordHash:'cd'.repeat(64),scryptN:131072,createdAt:now}],
    sessions: [
      {
        id: randomUUID(), tokenHash: createHash('sha256').update(importedToken).digest('hex'),
        accountId: importedId, displayName: 'Conta fixture', guest: false,
        createdAt: now, expiresAt: now + 60_000,
      },
      {
        id: importedGuestId, tokenHash: createHash('sha256').update(guestToken).digest('hex'),
        accountId: null, displayName: 'Visitante', guest: true,
        createdAt: now, expiresAt: now + 60_000,
      },
    ],
  }));
  await mkdir(path.join(source, 'progress'), { recursive: true });
  await writeFile(path.join(source, 'progress', importedId + '.json'), JSON.stringify({
    wood: 7, stone: 2, berries: 4,
  }));
  await mkdir(path.join(source, 'appearances'), { recursive: true });
  await writeFile(path.join(source, 'appearances', importedId + '.json'), JSON.stringify({
    body: 'female', skin: 2, hair: 4, hairStyle: 'curly', height: 1.1,
    muscle: 2, coat: 4, outfit: 'robe', item: 'lantern',
  }));
  await saveAccountRoom(source, importedId, [
    { id: 'abc123ef', kind: 'stool', x: 6, y: 8, rotation: 2 },
    {id:'abc123f0',kind:'lamp',x:6,y:9,rotation:1,enabled:false},
  ]);
  await writeFile(path.join(source,'progress',importedModernId+'.json'),JSON.stringify({version:2,inventory:validateInventory({slots:[{itemId:'rawMeat',quantity:3}],selectedSlot:2})}));
  await writeFile(path.join(source,'appearances',importedModernId+'.json'),JSON.stringify({version:4,appearance:{archetypeId:'character.mage',bodyId:'female',outfitId:'outfit.mage-robe'}}));
  const {createJsonPlayerLocationStore}=await import('../scripts/player-location-store.mjs');
  await createJsonPlayerLocationStore(source).savePlayerLocation(importedModernId,{location:'clearing',dimensionId:'breu',x:88,y:96,worldVersion:2});
  await writeFile(path.join(source,'world-breu.json'),JSON.stringify({version:1,revision:7,seed:123,generationVersion:1,dimensionId:'breu',theme:'forest',edits:[{id:'z-tree',type:'tree',x:100,y:110},{id:'a-tree',type:'tree',x:103,y:112}]}));
  await writeFile(path.join(source,'campfires-breu.json'),JSON.stringify([{id:'test-fire',x:88,y:92,litAt:now}]));
  const importPlan = await buildJsonImportPlan(source);
  assert.equal(importPlan.counts.accounts, 2);
  assert.equal(importPlan.counts.guestProfiles, 1);
  assert.equal(importPlan.counts.roomObjects, 2);
  await applyJsonImport(pool, importPlan);
  assert.deepEqual((await store.accounts.getSession(importedToken)).profile.inventory, validateInventory({wood:7, stone:2, berries:4}));
  assert.equal(Number((await pool.query("SELECT quantity FROM inventory_items WHERE profile_id=$1 AND item_id='slot:0:rawMeat'",[importedModernId])).rows[0].quantity),3);
  const modern = await store.loadAppearance(importedModernId);
  assert.equal(modern.body,'female');assert.equal(modern.archetypeId,'character.mage');assert.equal(modern.outfitId,'outfit.mage-robe');
  assert.equal((await pool.query('SELECT role FROM accounts WHERE id=$1',[importedModernId])).rows[0].role,'admin');
  assert.equal(Number((await pool.query("SELECT quantity FROM inventory_items WHERE profile_id=$1 AND item_id='silver'",[importedModernId])).rows[0].quantity),23);
  assert.equal((await store.loadPlayerLocation(importedModernId)).dimensionId,'breu');
  await store.savePlayerDimensionPosition(importedModernId,{dimensionId:'arcano',x:91.5,y:104.25,worldVersion:WORLD_COORDINATE_VERSION});
  assert.deepEqual(await store.loadPlayerDimensionPositions(importedModernId),[
    {dimensionId:'arcano',x:91.5,y:104.25,worldVersion:WORLD_COORDINATE_VERSION},
  ]);
  await store.savePlayerMapExploration(importedModernId,'arcano',[12,5,12,-1,2304]);
  assert.deepEqual(await store.loadPlayerMapExploration(importedModernId,'arcano'),[5,12]);
  await store.savePlayerMapExploration(importedModernId,'arcano',[13]);
  assert.deepEqual(await store.loadPlayerMapExploration(importedModernId,'arcano'),[5,12,13]);
  assert.deepEqual((await store.loadWorld('breu')).edits.map(e=>e.id),['z-tree','a-tree']);
  assert.equal((await store.loadWorld('breu')).seed,123);
  assert.equal((await store.loadCampfires('breu'))[0].id,'test-fire');
  const dims=await store.loadDimensions();await store.saveDimensions(dims.dimensions,dims.revision);
  await assert.rejects(store.saveDimensions(dims.dimensions,dims.revision),e=>e.status===409);
  const world=await store.loadWorld('breu');
  await store.saveWorld({...world,revision:world.revision+1,seed:456},world.revision,'breu');
  assert.equal((await store.loadWorld('breu')).seed,456);
  await assert.rejects(store.saveWorld({...world,revision:world.revision+1},world.revision,'breu'),e=>e.status===409);
  await store.saveCampfires('breu',[]);assert.deepEqual(await store.loadCampfires('breu'),[]);
  await store.deleteCampfires('breu');assert.equal(await store.loadCampfires('breu'),null);
  const importedAppearance = await pool.query(
    'SELECT version, body_id, skin_id, hair_color_id, hair_style_id, coat_id, outfit_id, held_item_id ' +
    'FROM appearances WHERE profile_id = $1',
    [importedId],
  );
  assert.deepEqual(importedAppearance.rows[0], {
    version: 2, body_id: 'female', skin_id: 'skin_morena', hair_color_id: 'hair_copper',
    hair_style_id: 'curly', coat_id: 'coat_slate', outfit_id: 'robe', held_item_id: 'lantern',
  });
  assert.deepEqual(await store.loadRoom(importedId), [
    { id: 'abc123ef', kind: 'stool', x: 6, y: 8, rotation: 2 },
    {id:'abc123f0',kind:'lamp',x:6,y:9,rotation:1,enabled:false},
  ]);
  const table={id:'abc123f1',kind:'table',x:10,y:10,rotation:0};
  const plant={id:'abc123f2',kind:'plant',x:10,y:10,rotation:0,...roomFurnitureSupport({kind:'plant',x:10,y:10},[table])};
  await store.saveRoom(importedId,[table,plant]);
  assert.deepEqual(await store.loadRoom(importedId),[table,plant],'PostgreSQL preserves the support link and elevation');
  await pool.query('DELETE FROM profiles WHERE id = $1', [importedId]);
  await pool.query('DELETE FROM profiles WHERE id = $1', [importedGuestId]);
  await pool.query('DELETE FROM accounts WHERE id = $1', [importedId]);

  const username = 'pg_' + randomUUID().replaceAll('-', '').slice(0, 12);
  const created = await store.accounts.register({
    username, password: 'Test-password-123!', displayName: 'Banco teste',
  });
  const profileId = created.profile.id;
  cleanupProfileIds.add(profileId);
  assert.equal((await store.accounts.getSession(created.token)).profile.id, profileId);
  await store.saveProgress(profileId, { wood: 9, stone: 3, berries: 1 });
  const collectedEvent = await store.saveProgressAndRecordInteraction(profileId, { wood: 9, stone: 3, berries: 1 }, {
    actorProfileId: profileId,
    action: 'collect',
    context: { dimensionId: 'surface', location: 'clearing', placeId: 'clearing',
      instanceId: 'surface-clearing', position: { x: 8.4, y: 12.1 } },
    object: { id: 'branch-test', kind: 'wood', properties: { x: 8.7, y: 12.2, quantity: 1 } },
    transfer: { from: { type: 'ground', objectId: 'branch-test' },
      to: { type: 'inventory', profileId, itemId: 'wood', quantity: 1 } },
  });
  cleanupInteractionEventIds.add(collectedEvent.eventId);
  const beforeAtomicWorld = await store.loadWorld('breu');
  const atomicEventId = randomUUID();
  const atomicWorld = {
    ...beforeAtomicWorld,
    revision: beforeAtomicWorld.revision + 1,
    edits: [...beforeAtomicWorld.edits, {
      id: 'atomic-cooldown-' + randomUUID(),
      type: 'resource-cooldown',
      targetId: 'atomic-drop-' + randomUUID(),
      sourceId: 'map-atomic-drop-' + randomUUID(),
      readyAt: Date.now() + 60_000,
      x: 8,
      y: 9,
    }],
  };
  const atomicEvent = await store.saveWorldAndProgressAndRecordInteraction(
    atomicWorld, beforeAtomicWorld.revision, 'breu', profileId, { wood: 10, stone: 3, berries: 1 },
    {
      eventId: atomicEventId,
      actorProfileId: profileId,
      action: 'collect',
      context: { dimensionId: 'breu', location: 'clearing', placeId: 'clearing',
        instanceId: 'surface-clearing', position: { x: 8, y: 9 } },
      object: { id: 'atomic-drop', kind: 'wood', properties: { quantity: 1 } },
      transfer: { from: { type: 'ground', objectId: 'atomic-drop' },
        to: { type: 'inventory', profileId, itemId: 'wood', quantity: 1 } },
    },
  );
  cleanupInteractionEventIds.add(atomicEvent.eventId);
  assert.equal((await store.loadWorld('breu')).revision, atomicWorld.revision);
  assert.ok((await store.loadWorld('breu')).edits.some(edit => edit.id === atomicWorld.edits.at(-1).id));
  assert.deepEqual((await store.accounts.getSession(created.token)).profile.inventory, validateInventory({wood:10, stone:3, berries:1}));
  const savedAtomicEvent = (await store.listInteractionEvents({ actorProfileId: profileId })).find(event => event.eventId === atomicEventId);
  assert.equal(savedAtomicEvent.objectId, 'atomic-drop');
  const worldAfterAtomicSave = await store.loadWorld('breu');
  await store.saveWorld({ ...beforeAtomicWorld, revision: worldAfterAtomicSave.revision + 1 }, worldAfterAtomicSave.revision, 'breu');
  await store.saveProgress(profileId, { wood: 9, stone: 3, berries: 1 });
  const savedEvent = (await store.listInteractionEvents({ actorProfileId: profileId })).find(event => event.eventId === collectedEvent.eventId);
  assert.equal(savedEvent.action, 'collect');
  assert.equal(savedEvent.placeId, 'clearing');
  assert.deepEqual(savedEvent.objectProperties, { x: 8.7, y: 12.2, quantity: 1 });
  assert.equal(savedEvent.transfer.to.profileId, profileId);
  assert.equal(savedEvent.transfer.to.itemId, 'wood');
  await store.saveRoom(profileId, [{ id: '01020304', kind: 'stool', x: 5, y: 9, rotation: 1 },
    {id:'01020305',kind:'lamp',x:6.5,y:9,rotation:2,enabled:false}]);
  await store.saveAppearance(profileId, { body: 'female' });

  const restored = createPostgresStore(pool);
  assert.deepEqual((await restored.accounts.getSession(created.token)).profile.inventory, validateInventory({wood:9, stone:3, berries:1}));
  assert.deepEqual(await restored.loadRoom(profileId), [
    { id: '01020304', kind: 'stool', x: 5, y: 9, rotation: 1 },
    {id:'01020305',kind:'lamp',x:6.5,y:9,rotation:2,enabled:false},
  ]);
  await store.saveProgress(profileId,{slots:Array(27).fill(null),selectedSlot:2});
  const emptyBag=(await restored.accounts.getSession(created.token)).profile.inventory;
  assert.equal(emptyBag.knife,0,'an empty saved bag must not receive a new starting knife');
  assert.ok(emptyBag.slots.every(slot=>slot===null));
  await store.saveProgress(profileId,{wood:9,stone:3,berries:1});
  const restoredAppearance = await restored.loadAppearance(profileId);
  assert.equal(restoredAppearance.body, 'female');
  assert.equal(restoredAppearance.archetypeId, 'character.base');
  assert.equal(restoredAppearance.outfitId, 'outfit.white-base');
  await assert.rejects(store.accounts.register({
    username, password: 'Test-password-123!', displayName: 'Duplicado',
  }), error => error.status === 409);

  await pool.query(
    "UPDATE appearances SET version = 2, archetype_id = NULL, body_shape_id = NULL, aura_id = NULL, " +
    "skin_id = 'skin_escura', hair_color_id = 'hair_copper', " +
    "hair_style_id = 'long', height = 1.1, muscle = 3, coat_id = 'coat_berry', " +
    "outfit_id = 'robe', held_item_id = 'lantern' WHERE profile_id = $1",
    [profileId],
  );
  await store.saveAppearance(profileId, { body: 'male' });
  const preserved = await pool.query(
    'SELECT version, body_id, archetype_id, body_shape_id, outfit_id, held_item_id, aura_id, skin_id, hair_color_id ' +
    'FROM appearances WHERE profile_id = $1',
    [profileId],
  );
  assert.deepEqual(preserved.rows[0], {
    version: 4, body_id: 'male', archetype_id: 'character.base', body_shape_id: 'body-shape.average',
    outfit_id: 'outfit.white-base', held_item_id: 'equipment.none', aura_id: 'aura.none',
    skin_id: null, hair_color_id: null,
  });

  await store.creditWallet(profileId,10000);
  await store.claimLodging({profileId,buildingId:'cabin-cedar-one',mode:'owned',unitCount:1,price:3200});
  const friend=await store.accounts.register({username:'friend_'+randomUUID().replaceAll('-','').slice(0,9),password:'Friend-password-123!'});
  cleanupProfileIds.add(friend.profile.id);
  await store.setCabinKey({ownerProfileId:profileId,buildingId:'cabin-cedar-one',username:friend.profile.username});
  assert.equal((await store.getCabinKeys(friend.profile.id))[0].ownerProfileId,profileId);
  assert.equal((await store.getIssuedCabinKeys(profileId)).length,1);
  await store.setCabinKey({ownerProfileId:profileId,buildingId:'cabin-cedar-one',profileId:friend.profile.id,revoke:true});
  assert.deepEqual(await store.getCabinKeys(friend.profile.id),[]);
  await pool.query('DELETE FROM lodging_claims WHERE profile_id=$1',[profileId]);
  const guest = await store.accounts.guest('Pessoa teste');
  cleanupProfileIds.add(guest.profile.id);
  assert.equal((await store.accounts.getSession(guest.token)).profile.guest, true);
  await assert.rejects(store.accounts.updateUsername(guest.token, 'Visitante'), error => error.status === 403);
  await store.accounts.logout(guest.token);
  assert.equal(await store.accounts.getSession(guest.token), null);
  await store.accounts.logout(created.token);
  assert.equal(await store.accounts.getSession(created.token), null);

  const origin = 'https://test.clareira.invalid';
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-pg-game-'));
  directories.push(stateDirectory);
  preview = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: origin, databaseUrl: connectionString });
  room = createPrototypeServer({
    port: 0, stateDirectory, allowedOrigin: origin, databaseUrl: connectionString, redisUrl: process.env.TEST_REDIS_URL, ambientCampfire: false,
  });
  const previewAddress = await preview.listen();
  const roomAddress = await room.listen();
  const response = await fetch('http://127.0.0.1:' + previewAddress.port + '/auth/register', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'web_' + randomUUID().replaceAll('-', '').slice(0, 10),
      password: 'Web-password-123!',
      displayName: 'Jogadora web',
    }),
  });
  assert.equal(response.status, 201);
  const authResult = await response.json();
  cleanupProfileIds.add(authResult.profile.id);
  const cookie = response.headers.get('set-cookie');
  const token = /clareira_session=([^;]+)/.exec(cookie)?.[1];
  assert.ok(token);

  socket = new WebSocket('ws://127.0.0.1:' + roomAddress.port + '/room', {
    headers: { origin, cookie: 'clareira_session=' + token },
  });
  const firstState = await waitForState(socket, state => state.players.length === 1);
  assert.equal(firstState.players[0].name, authResult.profile.username);
  const changed = waitForState(socket, state =>
    state.players.some(player => player.id === firstState.players[0].id && player.appearance.body === 'female'));
  socket.send(JSON.stringify({ type: 'appearance', appearance: { body: 'female' } }));
  await changed;
  const persisted = await pool.query(
    'SELECT body_id FROM appearances WHERE profile_id = $1',
    [authResult.profile.id],
  );
  assert.equal(persisted.rows[0].body_id, 'female');
});
