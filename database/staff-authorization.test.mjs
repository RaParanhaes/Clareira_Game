import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaffAuthorizationStore, hasStaffPermission } from './staff-authorization.mjs';
import { applyStaffRuntimePrivileges } from './staff-runtime-privileges.mjs';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));

test('exact grants honor global and matching scopes only', () => {
  const rows = [
    { permission_key: 'reports.read', scope_key: 'global' },
    { permission_key: 'world.content.publish', scope_key: 'dimension:ash' },
  ];
  assert.equal(hasStaffPermission(rows, 'reports.read', { scopeKey: 'dimension:forest' }), true);
  assert.equal(hasStaffPermission(rows, 'world.content.publish', { scopeKey: 'dimension:ash' }), true);
  assert.equal(hasStaffPermission(rows, 'world.content.publish', { scopeKey: 'dimension:forest' }), false);
  assert.equal(hasStaffPermission(rows, 'roles.manage'), false);
});

test('wildcard owner grant covers current and future permissions, while expiry/revocation denies', () => {
  const now = Date.parse('2026-10-27T00:00:00Z');
  const ownerRows = [{ permission_key: '*', scope_key: 'global' }];
  assert.equal(hasStaffPermission(ownerRows, 'future.permission', { now }), true);
  assert.equal(hasStaffPermission([...ownerRows, {
    permission_key: 'future.permission',
    scope_key: 'global',
    expires_at: new Date(now - 1),
  }], 'future.permission', { now }), true, 'another active owner grant still applies');
  assert.equal(hasStaffPermission([{
    permission_key: '*', scope_key: 'global', expires_at: new Date(now),
  }], 'future.permission', { now }), false);
  assert.equal(hasStaffPermission([{
    permission_key: '*', scope_key: 'global', revoked_at: new Date(now - 1),
  }], 'future.permission', { now }), false);
});

test('PostgreSQL authorization reads live assignments and never trusts client-supplied roles', async () => {
  let call;
  const pool = { async query(sql, values) {
    call = { sql, values };
    return { rows: [{ role_key: 'owner', scope_key: 'global', permission_key: '*', expires_at: null, revoked_at: null }] };
  } };
  const authorization = createStaffAuthorizationStore(pool);
  assert.equal(await authorization.hasPermission('account-1', 'economy.adjust', {
    scopeKey: 'dimension:ash',
    now: new Date('2026-10-27T00:00:00Z'),
  }), true);
  assert.deepEqual(call.values, ['account-1', new Date('2026-10-27T00:00:00Z'), 'dimension:ash', 'economy.adjust']);
  assert.match(call.sql, /account_role_assignments/);
  assert.match(call.sql, /permission\.permission_key IN \(\$4, '\*'\)/);
  assert.match(call.sql, /assignment.revoked_at IS NULL/);
  assert.match(call.sql, /assignment\.expires_at > \$2/);
  assert.match(call.sql, /role.active/);
  assert.match(call.sql, /staff_role_inheritance/);
});

test('runtime bootstrap can only restore read access to staff data', async () => {
  const statements = [];
  const pool = { async query(sql) { statements.push(sql); return { rows: [] }; } };
  await applyStaffRuntimePrivileges(pool);
  assert.deepEqual(statements, [
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM "clareira_preview_game"',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "clareira_preview_game"',
    'REVOKE ALL ON staff_roles, staff_permission_catalog, staff_role_inheritance, staff_role_permissions, account_role_assignments, staff_audit_events, player_reports, player_sanctions FROM "clareira_preview_game"',
    'GRANT SELECT ON staff_roles, staff_permission_catalog, staff_role_inheritance, staff_role_permissions, account_role_assignments, staff_audit_events, player_reports, player_sanctions TO "clareira_preview_game"',
    'REVOKE ALL ON SEQUENCE account_role_assignments_assignment_id_seq, staff_audit_events_event_id_seq, player_reports_report_id_seq, player_sanctions_sanction_id_seq FROM "clareira_preview_game"',
    'REVOKE ALL ON FUNCTION public.staff_session_account_id(bytea), public.staff_actor_has_permission(uuid, text, text), public.staff_actor_highest_level(uuid, text) FROM "clareira_preview_game"',
    'GRANT EXECUTE ON FUNCTION public.staff_create_role_from_session(bytea, text, text, smallint, text), public.staff_assign_role_from_session(bytea, uuid, text, text, text, timestamptz), public.staff_revoke_role_from_session(bytea, bigint, text), public.staff_set_role_permission_from_session(bytea, text, text, boolean, text), public.staff_submit_report_from_session(bytea, uuid, text, text), public.staff_update_report_from_session(bytea, bigint, text, text), public.staff_apply_sanction_from_session(bytea, uuid, text, timestamptz, text, bigint), public.staff_revoke_sanction_from_session(bytea, bigint, text), public.staff_adjust_wallet_from_session(bytea, uuid, bigint, text) TO "clareira_preview_game"',
  ]);
  await assert.rejects(applyStaffRuntimePrivileges(pool, 'runtime_role; DROP TABLE accounts'), TypeError);
});

test('staff-role migration seeds agreed hierarchy, permissions, owner wildcard, and legacy admin backfill', async () => {
  const migration = await readFile(path.join(directory, 'migrations', '027_staff_roles_and_permissions.sql'), 'utf8');
  for (const key of ['player', 'community_guide', 'moderator', 'manager', 'administrator', 'owner', 'village_governor']) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  for (const permission of ['dimensions.staff_travel', 'players.ban.permanent',
    'world.content.publish', 'economy.adjust', 'badges.award', 'homes.enter_any', '*']) {
    assert.match(migration, new RegExp(`'${permission.replaceAll('.', '\\.')}'`));
  }
  assert.match(migration, /role = 'admin'/);
  assert.match(migration, /\('manager', 'moderator'\)/);
  assert.match(migration, /\('administrator', 'manager'\)/);
  assert.match(migration, /reason/);
  assert.match(migration, /GRANT SELECT ON staff_roles, staff_permission_catalog, staff_role_inheritance, staff_role_permissions/);
  assert.match(migration, /REVOKE ALL ON staff_roles, staff_permission_catalog, staff_role_inheritance,\s+staff_role_permissions, account_role_assignments, staff_audit_events FROM clareira_preview_game/);
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|TRUNCATE)\b|(?:^|\n)\s*DELETE FROM\b/im);
});

test('staff moderation migration keeps reports private and writes sanctions through audited functions', async () => {
  const migration = await readFile(path.join(directory, 'migrations', '030_staff_moderation.sql'), 'utf8');
  for (const name of ['player_reports', 'player_sanctions', 'staff_submit_report_from_session',
    'staff_update_report_from_session', 'staff_apply_sanction_from_session', 'staff_revoke_sanction_from_session']) {
    assert.match(migration, new RegExp(name));
  }
  for (const permission of ['reports.manage', 'players.sanction.revoke']) assert.match(migration, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(migration, /SECURITY DEFINER/g);
  assert.match(migration, /staff_audit_events/);
  assert.match(migration, /REVOKE ALL ON player_reports, player_sanctions FROM clareira_preview_game/);
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|TRUNCATE)\b|(?:^|\n)\s*DELETE FROM\b/im);
});

test('staff wallet migration serializes bounded adjustments and records the resulting balance', async () => {
  const migration = await readFile(path.join(directory, 'migrations', '031_staff_wallet_adjustment.sql'), 'utf8');
  assert.match(migration, /staff_adjust_wallet_from_session/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('lodging-profile'\)/);
  assert.match(migration, /'economy\.adjust'/);
  assert.match(migration, /player\.wallet\.adjusted/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|TRUNCATE)\b|(?:^|\n)\s*DELETE FROM\b/im);
});

test('wallet range migration removes artificial caps while preserving currency normalization and audit', async () => {
  const migration = await readFile(path.join(directory, 'migrations', '033_staff_wallet_range.sql'), 'utf8');
  assert.match(migration, /inventory_items_quantity_check/u);
  assert.match(migration, /item_id IN \('gold', 'silver', 'bronze'\) OR quantity <= 999/u);
  assert.match(migration, /21474836479999/u);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('lodging-profile'\)/u);
  assert.match(migration, /player\.wallet\.adjusted/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.staff_adjust_wallet_from_session/u);
  assert.doesNotMatch(migration.replace(/^\s*--.*$/gm, ''), /999,999|9,999,999/u);
  const executableSql = migration.replace(/^\s*--.*$/gm, '');
  assert.match(executableSql, /DROP CONSTRAINT IF EXISTS inventory_items_quantity_check/u);
  assert.doesNotMatch(executableSql, /(?:^|\n)\s*(?:DROP TABLE|TRUNCATE)\b|(?:^|\n)\s*DELETE FROM\b/imu);
});

test('dimension discoveries persist starter and legacy access without converting staff travel into discovery', async () => {
  const migration = await readFile(path.join(directory, 'migrations', '032_player_dimension_discoveries.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS player_dimension_discoveries/u);
  assert.match(migration, /discovery_source IN \('starter', 'legacy', 'portal', 'knowledge'\)/u);
  assert.match(migration, /staff_actor_has_permission\(position\.profile_id, 'dimensions\.staff_travel', 'global'\)/u);
  assert.match(migration, /SELECT, INSERT ON player_dimension_discoveries TO clareira_preview_game/u);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/u);
});

if (process.env.TEST_DATABASE_URL) {
  test('PostgreSQL enforces migrated staff grants, inherited roles, scopes, and owner wildcard', async t => {
    const pool = createDatabasePool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const accountId = randomUUID();
    const username = `rbac_${accountId.replaceAll('-', '').slice(0, 15)}`;
    await runMigrations(pool);
    t.after(async () => {
      await pool.query('DELETE FROM staff_audit_events WHERE actor_account_id = $1 OR target_account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_role_assignments WHERE account_id = $1 OR assigned_by_account_id = $1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
      await pool.end();
    });
    await pool.query(
      "INSERT INTO accounts (id, username, password_salt, password_hash, scrypt_n, created_at, role) " +
      "VALUES ($1, $2, $3, $4, 16384, now(), 'player')",
      [accountId, username, Buffer.alloc(16), Buffer.alloc(64)],
    );
    await pool.query(
      "INSERT INTO account_role_assignments (account_id, role_key, scope_key, reason) " +
      "VALUES ($1, 'manager', 'dimension:ash', 'isolated permission test')",
      [accountId],
    );

    const authorization = createStaffAuthorizationStore(pool);
    assert.equal(await authorization.hasPermission(accountId, 'world.content.publish', { scopeKey: 'dimension:ash' }), true);
    assert.equal(await authorization.hasPermission(accountId, 'players.ban.permanent', { scopeKey: 'dimension:ash' }), true,
      'Manager inherits moderator authority');
    assert.equal(await authorization.hasPermission(accountId, 'world.content.publish', { scopeKey: 'dimension:forest' }), false);
    assert.equal(await authorization.hasPermission(accountId, 'economy.adjust', { scopeKey: 'dimension:ash' }), false);

    await pool.query(
      "INSERT INTO account_role_assignments (account_id, role_key, scope_key, reason) " +
      "VALUES ($1, 'owner', 'global', 'isolated owner wildcard test')",
      [accountId],
    );
    assert.equal(await authorization.hasPermission(accountId, 'future.permission', { scopeKey: 'dimension:forest' }), true,
      'Owner wildcard covers capabilities added later');
  });
}
