import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationFile = path.join(directory, '..', 'database', 'migrations', '001_core_schema.sql');
const interactionMigrationFile = path.join(directory, '..', 'database', 'migrations', '015_interaction_events.sql');
const breuCenterMigrationFile = path.join(directory, '..', 'database', 'migrations', '028_breu_center_arrival.sql');
const runnerFile = path.join(directory, '..', 'database', 'migrate.mjs');

test('initial PostgreSQL schema is additive and replay-safe under the migration runner', async () => {
  const sql = await readFile(migrationFile, 'utf8');
  const tables = [
    'accounts', 'profiles', 'sessions', 'inventory_items',
    'appearances', 'rooms', 'room_objects', 'worlds', 'world_chunk_changes', 'item_transactions',
  ];

  for (const table of tables) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`));
  assert.match(sql, /PRIMARY KEY \(world_id, dimension_id, chunk_x, chunk_y, entity_id\)/);
  assert.match(sql, /transaction_id uuid PRIMARY KEY/);
  assert.match(sql, /token_hash bytea NOT NULL UNIQUE/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM)\b/i);
});

test('interaction journal stores place, object snapshot and item transfer in the database', async () => {
  const sql = await readFile(interactionMigrationFile, 'utf8');
  assert.match(sql, /CREATE TABLE interaction_events\s*\(/);
  for (const field of ['actor_profile_id', 'dimension_id', 'place_id', 'object_properties', 'transfer', 'happened_at']) {
    assert.match(sql, new RegExp(`\\b${field}\\b`));
  }
  assert.match(sql, /jsonb_typeof\(object_properties\) = 'object'/);
  assert.match(sql, /interaction_events_actor_time_idx/);
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE FROM)\b/i);
});

test('migration runner owns transactions, advisory locking, and checksums', async () => {
  const runner = await readFile(runnerFile, 'utf8');
  assert.match(runner, /pg_advisory_lock/);
  assert.match(runner, /pg_advisory_unlock/);
  assert.match(runner, /BEGIN/);
  assert.match(runner, /COMMIT/);
  assert.match(runner, /ROLLBACK/);
  assert.match(runner, /createHash\('sha256'\)/);
  assert.match(runner, /checksum/);
});

test('Breu relocation updates only dark-world positions and keeps other dimension spawns intact', async () => {
  const sql = await readFile(breuCenterMigrationFile, 'utf8');
  assert.match(sql, /'\{spawn\}', '\{"x":2966\.5,"y":2966\.5\}'::jsonb/);
  assert.match(sql, /WHERE \(dimension_id = 'breu' OR dimension_id LIKE 'arrival-%'\)\s+AND world_version < 3/);
  assert.match(sql, /world_version = 3/);
  assert.match(sql, /WHERE catalog\.id = true/);
});
