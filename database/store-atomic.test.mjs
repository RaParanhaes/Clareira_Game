import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresStore } from './store.mjs';
import { inventoryFromRows } from '../game/inventory.mjs';

function fakePool({ failInteraction = false, failDimensionDiscovery = false, failProgress = false, existingEdits = [] } = {}) {
  const calls = [];
  const writes = [];
  const client = {
    async query(sql, values = []) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      calls.push(compact);
      writes.push({ sql: compact, values });
      if (compact === 'SELECT revision FROM worlds WHERE id = $1 FOR UPDATE') {
        return { rows: [{ revision: 0 }], rowCount: 1 };
      }
      if (compact.startsWith('SELECT chunk_x, chunk_y, entity_id, operation, payload, edit_index')) {
        return { rows: existingEdits.map((payload, edit_index) => ({
          chunk_x: Math.floor(payload.x / 16), chunk_y: Math.floor(payload.y / 16),
          entity_id: payload.id, operation: 'upsert', payload, edit_index,
        })), rowCount: existingEdits.length };
      }
      if (failInteraction && compact.startsWith('INSERT INTO interaction_events')) {
        throw new Error('simulated interaction write failure');
      }
      if (failDimensionDiscovery && compact.startsWith('INSERT INTO player_dimension_discoveries')) {
        throw new Error('simulated dimension discovery write failure');
      }
      if (failProgress && compact.startsWith('INSERT INTO inventory_items')) throw new Error('simulated inventory write failure');
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push('RELEASE'); },
  };
  return {
    calls, writes,
    async connect() { return client; },
    async query(sql, values = []) { calls.push(sql); writes.push({ sql, values }); return { rows: [], rowCount: 0 }; },
  };
}

const world = {
  version: 1, revision: 1, seed: 123, generationVersion: 1,
  dimensionId: 'surface', theme: 'forest',
  edits: [{
    id: 'cooldown-atomic-test', type: 'resource-cooldown',
    targetId: 'branch-atomic-test', sourceId: 'map-branch-atomic-test',
    readyAt: Date.now() + 60_000, x: 4, y: 5,
  }],
};
const event = {
  actorProfileId: '11111111-1111-4111-8111-111111111111',
  action: 'collect',
  context: { dimensionId: 'surface', location: 'clearing', placeId: 'clearing',
    instanceId: 'surface-clearing', position: { x: 4, y: 5 } },
  object: { id: 'map-branch-atomic-test', kind: 'wood', properties: { quantity: 1 } },
  transfer: { from: { type: 'ground', objectId: 'map-branch-atomic-test' },
    to: { type: 'inventory', itemId: 'wood', quantity: 1 } },
};

test('resource world state, player inventory and interaction commit in one PostgreSQL transaction', async () => {
  const pool = fakePool();
  const store = createPostgresStore(pool);
  const saved = await store.saveWorldAndProgressAndRecordInteraction(
    world, 0, 'surface', event.actorProfileId, { wood: 1 }, event,
  );
  assert.deepEqual(saved, world);
  const begin = pool.calls.indexOf('BEGIN');
  const worldWrite = pool.calls.findIndex(sql => sql.startsWith('UPDATE worlds SET revision='));
  const inventoryWrite = pool.calls.findIndex(sql => sql.startsWith('INSERT INTO inventory_items'));
  const eventWrite = pool.calls.findIndex(sql => sql.startsWith('INSERT INTO interaction_events'));
  const commit = pool.calls.indexOf('COMMIT');
  assert.ok(begin >= 0 && begin < worldWrite);
  assert.ok(worldWrite < inventoryWrite && inventoryWrite < eventWrite && eventWrite < commit);
  assert.ok(pool.calls.includes('RELEASE'));
});

test('a failed interaction write rolls the world and inventory updates back together', async () => {
  const pool = fakePool({ failInteraction: true });
  const store = createPostgresStore(pool);
  await assert.rejects(store.saveWorldAndProgressAndRecordInteraction(
    world, 0, 'surface', event.actorProfileId, { wood: 1 }, event,
  ), /simulated interaction write failure/);
  assert.ok(pool.calls.includes('ROLLBACK'));
  assert.ok(!pool.calls.includes('COMMIT'));
  assert.ok(pool.calls.includes('RELEASE'));
});

test('tree work progress, axe durability, and inventory save atomically with the world', async () => {
  const pool=fakePool();
  const store=createPostgresStore(pool);
  const accountId='44444444-4444-4444-8444-444444444444';
  const workWorld={...world,revision:1,edits:[...world.edits,{
    id:'work-progress-tree-test',type:'work-progress',targetId:'seed:123',targetKind:'tree',hits:1,x:4,y:5,
  }]};
  await store.saveWorldAndProgress(workWorld,0,'surface',accountId,{
    wood:0,stoneAxe:1,axeDurability:209,axeSharpness:98,
  });
  const begin=pool.calls.indexOf('BEGIN');
  const worldWrite=pool.calls.findIndex(sql=>sql.startsWith('UPDATE worlds SET revision='));
  const inventoryWrite=pool.calls.findIndex(sql=>sql.startsWith('INSERT INTO inventory_items'));
  const commit=pool.calls.indexOf('COMMIT');
  assert.ok(begin>=0&&begin<worldWrite&&worldWrite<inventoryWrite&&inventoryWrite<commit);
});

test('final log cut commits its removal and all 200 timber in one transaction', async () => {
  const pool=fakePool();
  const store=createPostgresStore(pool);
  const accountId='66666666-6666-4666-8666-666666666666';
  const finishedLog={...world,revision:1,edits:[
    {id:'fell-test',type:'tree-remove',targetId:'seed:123',growthStage:'stump',nextGrowthAt:20,respawnAt:70,x:4,y:5},
    {id:'drop-apples-test',type:'resource',resourceKind:'apples',quantity:3,respawnAt:70,x:4.35,y:5.18},
    {id:'drop-log-test',type:'resource',resourceKind:'log',x:4,y:5},
  ]};
  await store.saveWorldAndProgress(finishedLog,0,'surface',accountId,{
    slots:[{itemId:'timber',quantity:99},{itemId:'timber',quantity:99},{itemId:'timber',quantity:2}],
    selectedSlot:0,axeDurability:139,axeSharpness:20,
  });
  const worldWrite=pool.calls.findIndex(sql=>sql.startsWith('UPDATE worlds SET revision='));
  const inventoryWrite=pool.calls.findIndex(sql=>sql.startsWith('INSERT INTO inventory_items'));
  assert.ok(pool.calls.indexOf('BEGIN')<worldWrite&&worldWrite<inventoryWrite&&inventoryWrite<pool.calls.indexOf('COMMIT'));
  const timberWrites=pool.writes.filter(write=>write.sql.startsWith('INSERT INTO inventory_items')
    &&write.values[0]===accountId&&String(write.values[1]).endsWith(':timber'));
  assert.equal(timberWrites.reduce((total,write)=>total+write.values[2],0),200,
  'as 200 madeiras ficam registradas junto com a remoção da tora');
});

test('a failed axe inventory write rolls tree work progress and world changes back', async()=>{
  const pool=fakePool({failProgress:true});
  const store=createPostgresStore(pool);
  const accountId='55555555-5555-4555-8555-555555555555';
  await assert.rejects(store.saveWorldAndProgress({...world,revision:1},0,'surface',accountId,{wood:0}),/simulated inventory write failure/);
  assert.ok(pool.calls.includes('ROLLBACK'));
  assert.ok(!pool.calls.includes('COMMIT'));
});

test('saving one pickup updates a large world by its single changed edit', async () => {
  const existingEdits = Array.from({ length: 100 }, (_, index) => ({
    id: 'cooldown-' + index,
    type: 'resource-cooldown',
    targetId: 'branch-' + index,
    sourceId: 'map-branch-' + index,
    readyAt: Date.now() + 60_000,
    x: index % 15,
    y: Math.floor(index / 15),
  }));
  const changed = {
    id: 'cooldown-new-branch', type: 'resource-cooldown',
    targetId: 'branch-new', sourceId: 'map-branch-new',
    readyAt: Date.now() + 60_000, x: 4, y: 8,
  };
  const pool = fakePool({ existingEdits });
  const store = createPostgresStore(pool);
  await store.saveWorldAndProgressAndRecordInteraction(
    { ...world, edits: [...existingEdits, changed] }, 0, 'surface',
    event.actorProfileId, { wood: 1 }, event,
  );
  assert.equal(pool.calls.filter(sql => sql.startsWith('INSERT INTO world_chunk_changes')).length, 1);
  assert.equal(pool.calls.filter(sql => sql.startsWith('UPDATE world_chunk_changes')).length, 0);
  assert.equal(pool.calls.filter(sql => sql.startsWith('DELETE FROM world_chunk_changes')).length, 0);
});

test('PostgreSQL row writes round-trip level, potions, attributes and learned abilities', async () => {
  const pool = fakePool();
  const store = createPostgresStore(pool);
  const accountId = '22222222-2222-4222-8222-222222222222';
  const slots = Array.from({ length: 10 }, () => null);
  slots[9] = { itemId: 'xpPotionIV', quantity: 1 };
  await store.saveProgress(accountId, {
    level: 20, xp: 175, attributePoints: 3, skillPoints: 2,
    attributes: { force: 4, attack: 3, defense: 2, agility: 8, magic: 10, speed: 1 },
    learnedAbilities: ['fireballI', 'universalTeleport'], slots,
  });
  const rows = pool.writes.filter(write => write.sql.startsWith('INSERT INTO inventory_items'))
    .map(({ values }) => ({ itemId: values[1], quantity: Number(values[2]) }));
  const restored = inventoryFromRows(rows);
  assert.equal(restored.level, 20);
  assert.equal(restored.xp, 175);
  assert.equal(restored.attributePoints, 3);
  assert.equal(restored.skillPoints, 2);
  assert.deepEqual(restored.attributes, { force: 4, attack: 3, defense: 2, agility: 8, magic: 10, speed: 1 });
  assert.deepEqual(restored.learnedAbilities, ['fireballI', 'universalTeleport']);
  assert.equal(restored.slots[9].itemId, 'xpPotionIV');
  assert.ok(pool.calls.includes('BEGIN') && pool.calls.includes('COMMIT'));
});

test('learning a dimensional knowledge saves progress and discovery in one transaction', async () => {
  const pool = fakePool();
  const store = createPostgresStore(pool);
  const accountId = '33333333-3333-4333-8333-333333333333';
  await store.saveProgressAndDiscoverDimension(accountId, {
    level: 12, skillPoints: 0, attributes: { magic: 8 }, learnedAbilities: ['fireballI', 'fireballII'],
  }, 'inferno', 'knowledge');
  const begin = pool.calls.indexOf('BEGIN');
  const progress = pool.calls.findIndex(sql => sql.startsWith('INSERT INTO inventory_items'));
  const discovery = pool.calls.findIndex(sql => sql.startsWith('INSERT INTO player_dimension_discoveries'));
  const commit = pool.calls.indexOf('COMMIT');
  assert.ok(begin >= 0 && begin < progress && progress < discovery && discovery < commit);
  assert.deepEqual(pool.writes.find(write => write.sql.startsWith('INSERT INTO player_dimension_discoveries')).values,
    [accountId, 'inferno', 'knowledge']);
});

test('failed dimensional discovery rolls learned progress back with it', async () => {
  const pool = fakePool({ failDimensionDiscovery: true });
  const store = createPostgresStore(pool);
  await assert.rejects(store.saveProgressAndDiscoverDimension(
    '44444444-4444-4444-8444-444444444444', { learnedAbilities: ['fireballII'] }, 'inferno', 'knowledge',
  ), /simulated dimension discovery write failure/u);
  assert.ok(pool.calls.includes('ROLLBACK'));
  assert.ok(!pool.calls.includes('COMMIT'));
});
