import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';
import { createStaffAuthorizationStore } from './staff-authorization.mjs';
import { createStaffManagementStore } from './staff-management.mjs';
import { createPostgresStore } from './store.mjs';
import { applyStaffRuntimePrivileges } from './staff-runtime-privileges.mjs';
import { createPreviewServer } from '../scripts/dev-preview-page.mjs';
import { provisionInitialOwner } from '../scripts/provision-owner.mjs';
import WebSocket from 'ws';
import { createPrototypeServer } from '../scripts/prototype-server.mjs';
import { MAX_WALLET_VALUE } from '../game/lodging-catalog.mjs';

const connectionString = process.env.TEST_DATABASE_URL;
const migrationDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

function waitForSocketMessage(socket, predicate, description, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error(`Timed out waiting for ${description}`)); }, timeoutMs);
    const onMessage = raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer); socket.off('message', onMessage); resolve(message);
    };
    socket.on('message', onMessage);
  });
}

test('staff migrations preserve legacy admins and enforce delegated management through sessions', {
  skip: !connectionString || process.env.STAFF_MIGRATION_ISOLATED !== '1',
}, async t => {
  const pool = createDatabasePool({ connectionString, max: 2, applicationName: 'clareira-staff-migration-test' });
  const legacyAdminId = randomUUID();
  const username = `legacy_${legacyAdminId.replaceAll('-', '').slice(0, 12)}`;
  const fixtureAccounts = [];
  const fixtureRoles = [];
  const preStaffMigrationDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-pre-staff-migrations-'));
  t.after(async () => {
    if (fixtureAccounts.length) {
      await pool.query('DELETE FROM player_sanctions WHERE target_account_id = ANY($1::uuid[]) OR created_by_account_id = ANY($1::uuid[]) OR lifted_by_account_id = ANY($1::uuid[])', [fixtureAccounts]).catch(() => {});
      await pool.query('DELETE FROM player_reports WHERE reporter_account_id = ANY($1::uuid[]) OR target_account_id = ANY($1::uuid[]) OR assigned_to_account_id = ANY($1::uuid[])', [fixtureAccounts]).catch(() => {});
      await pool.query('DELETE FROM staff_audit_events WHERE actor_account_id = ANY($1::uuid[]) OR target_account_id = ANY($1::uuid[])', [fixtureAccounts]).catch(() => {});
      await pool.query('DELETE FROM account_role_assignments WHERE account_id = ANY($1::uuid[]) OR assigned_by_account_id = ANY($1::uuid[])', [fixtureAccounts]).catch(() => {});
      await pool.query('DELETE FROM sessions WHERE profile_id = ANY($1::uuid[])', [fixtureAccounts]).catch(() => {});
      await pool.query('DELETE FROM profiles WHERE id = ANY($1::uuid[])', [fixtureAccounts]).catch(() => {});
      await pool.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [fixtureAccounts]).catch(() => {});
    }
    if (fixtureRoles.length) {
      await pool.query('DELETE FROM staff_role_permissions WHERE role_key = ANY($1::text[])', [fixtureRoles]).catch(() => {});
      await pool.query('DELETE FROM staff_roles WHERE role_key = ANY($1::text[])', [fixtureRoles]).catch(() => {});
    }
    await pool.query('DELETE FROM account_role_assignments WHERE account_id = $1', [legacyAdminId]).catch(() => {});
    await pool.query('DELETE FROM accounts WHERE id = $1', [legacyAdminId]).catch(() => {});
    await pool.end();
    await rm(preStaffMigrationDirectory, { recursive: true, force: true });
  });

  const filenames = (await readdir(migrationDirectory)).filter(filename => filename.endsWith('.sql'));
  const beforeStaff = filenames.filter(filename => Number(filename.slice(0, 3)) < 27);
  for (const filename of beforeStaff) {
    await copyFile(path.join(migrationDirectory, filename), path.join(preStaffMigrationDirectory, filename));
  }
  const base = await runMigrations(pool, { directory: preStaffMigrationDirectory });
  assert.equal(base.migrations, beforeStaff.length);
  await pool.query(
    "INSERT INTO accounts (id, username, password_salt, password_hash, scrypt_n, created_at, role) " +
    "VALUES ($1, $2, $3, $4, 16384, now(), 'admin')",
    [legacyAdminId, username, Buffer.alloc(16), Buffer.alloc(64)],
  );

  const upgrade = await runMigrations(pool);
  assert.ok(upgrade.applied.some(entry => entry.version === 27));
  assert.equal((await pool.query('SELECT role FROM accounts WHERE id = $1', [legacyAdminId])).rows[0].role, 'admin',
    'the compatibility column remains intact during rollout');
  assert.deepEqual((await pool.query(
    "SELECT role_key, scope_key FROM account_role_assignments WHERE account_id = $1 AND revoked_at IS NULL",
    [legacyAdminId],
  )).rows, [{ role_key: 'administrator', scope_key: 'global' }]);

  const authorization = createStaffAuthorizationStore(pool);
  assert.equal(await authorization.hasPermission(legacyAdminId, 'players.ban.permanent'), true,
    'legacy administrators keep inherited moderator permissions');
  assert.equal(await authorization.hasPermission(legacyAdminId, 'world.operate'), true,
    'legacy administrators gain the new administrator capability');

  const makeAccountSession = async label => {
    const accountId = randomUUID();
    const username = `hk_${label}_${accountId.replaceAll('-', '').slice(0, 8)}`;
    const token = randomBytes(32).toString('hex');
    fixtureAccounts.push(accountId);
    await pool.query(
      "INSERT INTO accounts (id, username, password_salt, password_hash, scrypt_n, created_at, role) " +
      "VALUES ($1, $2, $3, $4, 16384, now(), 'player')",
      [accountId, username, Buffer.alloc(16), Buffer.alloc(64)],
    );
    await pool.query(
      "INSERT INTO profiles (id, account_id, display_name, is_guest, created_at) " +
      "VALUES ($1, $1, $2, false, now())",
      [accountId, `Staff ${label}`],
    );
    await pool.query(
      'INSERT INTO sessions (id, profile_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, now(), now() + interval \'1 hour\')',
      [randomUUID(), accountId, createHash('sha256').update(token).digest()],
    );
    return { accountId, username, token };
  };

  const owner = await makeAccountSession('owner');
  const manager = await makeAccountSession('manager');
  const target = await makeAccountSession('target');
  const reportReader = await makeAccountSession('reader');
  await pool.query(
    "INSERT INTO account_role_assignments (account_id, role_key, scope_key, reason, created_at, expires_at) " +
    "VALUES ($1, 'owner', 'global', 'expired bootstrap recovery fixture', now() - interval '2 hours', now() - interval '1 hour')",
    [manager.accountId],
  );
  const initialOwner = await provisionInitialOwner(pool, {
    username: owner.username, reason: 'Provisionamento inicial no banco de teste isolado',
  });
  assert.equal(String(initialOwner.assignmentId).length > 0, true);
  assert.equal((await pool.query(
    "SELECT revoked_at IS NOT NULL AS revoked FROM account_role_assignments WHERE account_id = $1 AND role_key = 'owner'",
    [manager.accountId],
  )).rows[0].revoked, true);
  await assert.rejects(provisionInitialOwner(pool, {
    username: manager.username, reason: 'Tentativa duplicada de bootstrap inicial',
  }), error => error.status === 409);
  await pool.query(
    "INSERT INTO account_role_assignments (account_id, role_key, scope_key, reason) VALUES ($1, 'manager', 'global', 'isolated management test manager')",
    [manager.accountId],
  );
  assert.equal(await authorization.hasPermission(manager.accountId, 'dimensions.staff_travel'), true,
    'manager inherits dimensional travel from the moderator role');
  const management = createStaffManagementStore(pool);
  const creditedWallet = await management.adjustWallet(owner.token, {
    targetAccountId: target.accountId, delta: 250, reason: 'Teste de crédito administrativo',
  });
  assert.deepEqual(creditedWallet, { gold: 0, silver: 2, bronze: 50, total: 250, delta: 250 });
  const debitedWallet = await management.adjustWallet(owner.token, {
    targetAccountId: target.accountId, delta: -75, reason: 'Teste de retirada administrativa',
  });
  assert.deepEqual(debitedWallet, { gold: 0, silver: 1, bronze: 75, total: 175, delta: -75 });
  await assert.rejects(management.adjustWallet(owner.token, {
    targetAccountId: target.accountId, delta: -176, reason: 'Teste de saldo insuficiente',
  }), error => error.status === 400);
  assert.equal(Number((await pool.query(
    "SELECT sum(quantity::bigint * CASE item_id WHEN 'gold' THEN 10000 WHEN 'silver' THEN 100 WHEN 'bronze' THEN 1 ELSE 0 END) AS total FROM inventory_items WHERE profile_id = $1",
    [target.accountId],
  )).rows[0].total), 175, 'failed withdrawal leaves the wallet unchanged');
  assert.equal(Number((await pool.query(
    "SELECT count(*) FROM staff_audit_events WHERE target_account_id = $1 AND action = 'player.wallet.adjusted'",
    [target.accountId],
  )).rows[0].count), 2, 'only successful wallet operations are audited');
  const largeWalletGrant = await management.adjustWallet(owner.token, {
    targetAccountId: target.accountId, delta: 10_000_000, reason: 'Teste acima do limite antigo de carteira',
  });
  assert.deepEqual(largeWalletGrant, { gold: 1000, silver: 1, bronze: 75, total: 10_000_175, delta: 10_000_000 });
  assert.deepEqual((await pool.query(
    "SELECT item_id, quantity FROM inventory_items WHERE profile_id = $1 AND item_id IN ('gold','silver','bronze') ORDER BY item_id",
    [target.accountId],
  )).rows, [
    { item_id: 'bronze', quantity: 75 }, { item_id: 'gold', quantity: 1000 }, { item_id: 'silver', quantity: 1 },
  ], 'currency rows accept normalized balances above the old 999-quantity cap');
  const maxWalletGrant = await management.adjustWallet(owner.token, {
    targetAccountId: target.accountId, delta: MAX_WALLET_VALUE - largeWalletGrant.total,
    reason: 'Teste do teto técnico normalizado',
  });
  assert.equal(maxWalletGrant.total, MAX_WALLET_VALUE);
  assert.deepEqual({ gold: maxWalletGrant.gold, silver: maxWalletGrant.silver, bronze: maxWalletGrant.bronze },
    { gold: 2_147_483_647, silver: 99, bronze: 99 });
  await assert.rejects(management.adjustWallet(owner.token, {
    targetAccountId: target.accountId, delta: 1, reason: 'Teste acima do teto técnico',
  }));
  await assert.rejects(management.adjustWallet(manager.token, {
    targetAccountId: target.accountId, delta: 1, reason: 'Gestor sem delegação econômica',
  }), error => error.status === 403);
  const reportReaderRole = `hk_report_reader_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  fixtureRoles.push(reportReaderRole);
  await management.createRole(owner.token, {
    roleKey: reportReaderRole, displayName: 'Leitor de denúncias', hierarchyLevel: 1, reason: 'Fixture de visibilidade de casos',
  });
  await management.setRolePermission(owner.token, {
    roleKey: reportReaderRole, permissionKey: 'reports.read', granted: true, reason: 'Consulta somente casos atribuídos',
  });
  await management.assignRole(owner.token, {
    targetAccountId: reportReader.accountId, roleKey: reportReaderRole, reason: 'Fixture de leitor de denúncias',
  });
  const customRoleKey = `hk_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const elevatedRoleKey = `${customRoleKey}_high`;
  fixtureRoles.push(customRoleKey, elevatedRoleKey);

  assert.equal(await management.createRole(owner.token, {
    roleKey: customRoleKey, displayName: 'Cargo de teste', hierarchyLevel: 1, reason: 'Teste isolado de criação',
  }), customRoleKey);
  assert.equal(await management.setRolePermission(owner.token, {
    roleKey: customRoleKey, permissionKey: 'players.kick', granted: true, reason: 'Delegação de teste',
  }), true);
  const assignmentId = await management.assignRole(owner.token, {
    targetAccountId: target.accountId, roleKey: customRoleKey, reason: 'Atribuição de teste',
  });
  assert.equal(await authorization.hasPermission(target.accountId, 'players.kick'), true);
  await assert.rejects(management.assignRole(owner.token, {
    targetAccountId: target.accountId, roleKey: customRoleKey, reason: 'Atribuição duplicada',
  }), error => error.status === 409);
  assert.equal(await management.revokeRole(owner.token, { assignmentId, reason: 'Revogação de teste' }), true);
  assert.equal(await management.revokeRole(owner.token, { assignmentId, reason: 'Repetição idempotente' }), false);
  assert.equal(await authorization.hasPermission(target.accountId, 'players.kick'), false);

  assert.equal(await management.createRole(owner.token, {
    roleKey: elevatedRoleKey, displayName: 'Delegação total teste', hierarchyLevel: 5, reason: 'Teste da autoridade total',
  }), elevatedRoleKey);
  assert.equal(await management.setRolePermission(owner.token, {
    roleKey: elevatedRoleKey, permissionKey: '*', granted: true, reason: 'Delegação total autorizada pelo proprietário',
  }), true);
  const elevatedAssignmentId = await management.assignRole(owner.token, {
    targetAccountId: target.accountId, roleKey: elevatedRoleKey, reason: 'Delegação total de teste',
  });
  assert.equal(await authorization.hasPermission(target.accountId, 'capability.added.later'), true,
    'the owner can explicitly delegate all current and future capabilities');
  assert.equal(await management.revokeRole(owner.token, {
    assignmentId: elevatedAssignmentId, reason: 'Remoção da delegação de teste',
  }), true);

  assert.equal(await management.setRolePermission(owner.token, {
    roleKey: 'manager', permissionKey: 'roles.manage', granted: true, reason: 'Delegação hierárquica controlada',
  }), true);
  const lowerAssignmentId = await management.assignRole(manager.token, {
    targetAccountId: target.accountId, roleKey: 'moderator', reason: 'Gestor atribui nível inferior',
  });
  await assert.rejects(management.assignRole(manager.token, {
    targetAccountId: target.accountId, roleKey: 'administrator', reason: 'Escalada acima do gestor',
  }), error => error.status === 403);
  await assert.rejects(management.setRolePermission(manager.token, {
    roleKey: 'moderator', permissionKey: 'economy.adjust', granted: true, reason: 'Tentativa de delegar poder ausente',
  }), error => error.status === 403);
  assert.equal(await management.revokeRole(manager.token, {
    assignmentId: lowerAssignmentId, reason: 'Gestor revoga nível inferior',
  }), true);
  await assert.rejects(management.assignRole(randomBytes(32).toString('hex'), {
    targetAccountId: target.accountId, roleKey: 'moderator', reason: 'Sessão inexistente',
  }), error => error.status === 403);

  const reportId = await management.submitReport(target.token, {
    targetAccountId: owner.accountId, category: 'harassment',
    description: 'A conta publicou insultos repetidos no espaço público.',
  });
  assert.ok((await management.listReports({ status: 'open', actorAccountId: owner.accountId, canManageAll: true }))
    .some(report => Number(report.report_id) === Number(reportId)));
  await assert.rejects(management.updateReport(target.token, {
    reportId, action: 'claim', reason: 'Jogador não pode assumir denúncia',
  }), error => error.status === 403);
  assert.equal(await management.updateReport(manager.token, {
    reportId, action: 'claim', reason: 'Assumida para análise',
  }), true);
  assert.equal(await management.updateReport(manager.token, {
    reportId, action: 'resolve', reason: 'Análise concluída',
  }), true);
  const muteId = await management.applySanction(manager.token, {
    targetAccountId: target.accountId, kind: 'mute',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    reason: 'Interromper a repetição enquanto a equipe revisa o caso', reportId,
  });
  assert.ok((await management.activeSanctions([target.accountId])).some(sanction => Number(sanction.sanction_id) === Number(muteId)));
  await assert.rejects(management.applySanction(manager.token, {
    targetAccountId: owner.accountId, kind: 'ban', reason: 'Tentativa contra cargo superior',
  }), error => error.status === 403);
  assert.equal(await management.revokeSanction(manager.token, {
    sanctionId: muteId, reason: 'Recurso aceito após revisão',
  }), true);
  assert.equal((await management.activeSanctions([target.accountId])).length, 0);
  const ownerSelfSanctionId = await management.applySanction(owner.token, {
    targetAccountId: owner.accountId, kind: 'warning', reason: 'Teste da autoridade total do Proprietário',
  });
  assert.ok((await management.activeSanctions([owner.accountId])).some(row => Number(row.sanction_id) === Number(ownerSelfSanctionId)) === false,
    'advertências não bloqueiam acesso, mesmo quando o Proprietário as aplica a si');
  assert.equal(await management.revokeSanction(owner.token, {
    sanctionId: ownerSelfSanctionId, reason: 'Encerramento da verificação de autoridade total',
  }), true);

  const managementAudit = await management.listAudit({ limit: 50 });
  assert.ok(managementAudit.some(event => event.action === 'role.created' && event.actor_account_id === owner.accountId));
  assert.ok(managementAudit.some(event => event.action === 'role.assignment.granted' && event.target_account_id === target.accountId));
  assert.ok(managementAudit.some(event => event.action === 'role.assignment.revoked' && event.target_account_id === target.accountId));
  assert.ok(managementAudit.some(event => event.action === 'owner.bootstrapped' && event.actor_account_id === null));
  assert.ok(managementAudit.some(event => event.action === 'owner.expired.bootstrap_recovered' && event.actor_account_id === null));

  const preview = createPreviewServer({
    port: 0,
    stateDirectory: path.join(os.tmpdir(), `clareira-staff-api-${randomUUID()}`),
    databaseUrl: connectionString,
    allowedOrigin: 'https://staff-test.clareira.invalid',
  });
  const address = await preview.listen();
  t.after(() => preview.close());
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const register = async username => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'senha-teste-housekeeping-123' }),
    });
    assert.equal(response.status, 201);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    return { cookie, token: cookie.slice('clareira_session='.length), profile: (await response.json()).profile };
  };
  const apiOwner = await register(`web_owner_${randomUUID().replaceAll('-', '').slice(0, 8)}`);
  const apiPlayer = await register(`web_player_${randomUUID().replaceAll('-', '').slice(0, 8)}`);
  const apiBanned = await register(`web_banned_${randomUUID().replaceAll('-', '').slice(0, 8)}`);
  fixtureAccounts.push(apiOwner.profile.id, apiPlayer.profile.id, apiBanned.profile.id);
  await pool.query(
    "INSERT INTO account_role_assignments (account_id, role_key, scope_key, reason) VALUES ($1, 'owner', 'global', 'isolated HTTP staff API owner')",
    [apiOwner.profile.id],
  );
  const banId = await management.applySanction(apiOwner.token, {
    targetAccountId: apiBanned.profile.id, kind: 'ban', reason: 'Bloqueio usado para testar o login protegido',
  });
  const bannedLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ username: apiBanned.profile.username, password: 'senha-teste-housekeeping-123' }),
  });
  assert.equal(bannedLogin.status, 403, 'a conta banida não recebe sessão pelo login HTTP');
  assert.equal(bannedLogin.headers.get('set-cookie'), null);
  await management.revokeSanction(apiOwner.token, { sanctionId: banId, reason: 'Fim do teste de login' });
  const unauthorized = await fetch(`${baseUrl}/staff/roles`);
  assert.equal(unauthorized.status, 401);
  const regularPlayer = await fetch(`${baseUrl}/staff/roles`, { headers: { cookie: apiPlayer.cookie } });
  assert.equal(regularPlayer.status, 403);
  assert.equal((await fetch(`${baseUrl}/staff`, { headers: { cookie: apiPlayer.cookie } })).status, 403,
    'regular players cannot open the protected Housekeeping page');
  assert.equal((await fetch(`${baseUrl}/staff-panel.mjs`, { headers: { cookie: apiPlayer.cookie } })).status, 403,
    'panel code is protected by the same live permission check');
  assert.equal((await fetch(`${baseUrl}/staff`)).status, 401, 'anonymous visitors cannot open Housekeeping');
  assert.equal((await fetch(`${baseUrl}/staff/`, { redirect: 'manual' })).status, 401, 'the slash route also requires a session');
  assert.equal((await fetch(`${baseUrl}/staff/`, { headers: { cookie: apiPlayer.cookie }, redirect: 'manual' })).status, 403, 'the slash route does not reveal the panel to ordinary players');
  const slashPage = await fetch(`${baseUrl}/staff/?source=game`, { headers: { cookie: apiOwner.cookie }, redirect: 'manual' });
  assert.equal(slashPage.status, 308);
  assert.equal(slashPage.headers.get('location'), '../staff?source=game', 'the redirect preserves the dev prefix and query');
  const housekeepingPage = await fetch(`${baseUrl}/staff`, { headers: { cookie: apiOwner.cookie } });
  assert.equal(housekeepingPage.status, 200);
  assert.match(await housekeepingPage.text(), /Cargos e permissões/u);
  assert.match(housekeepingPage.headers.get('content-security-policy'), /script-src 'self'/u);
  assert.equal((await fetch(`${baseUrl}/staff-panel.mjs`, { headers: { cookie: apiOwner.cookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/staff-panel.css`, { headers: { cookie: apiOwner.cookie } })).status, 200);
  const ownerCapabilitiesResponse = await fetch(`${baseUrl}/staff/capabilities`, { headers: { cookie: apiOwner.cookie } });
  assert.equal(ownerCapabilitiesResponse.status, 200);
  const ownerCapabilities = (await ownerCapabilitiesResponse.json()).capabilities;
  assert.equal(ownerCapabilities.manageRoles, true);
  assert.equal(ownerCapabilities.readReports, true);
  assert.equal(ownerCapabilities.adjustEconomy, true);
  const walletApiResponse = await fetch(`${baseUrl}/staff/wallet`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ username: apiPlayer.profile.username, operation: 'credit', amount: 121, reason: 'Teste HTTP de ajuste econômico' }),
  });
  assert.equal(walletApiResponse.status, 200);
  assert.equal((await walletApiResponse.json()).wallet.total, 121);
  const largeWalletApiResponse = await fetch(`${baseUrl}/staff/wallet`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ username: apiPlayer.profile.username, operation: 'credit', amount: 10_000_000, reason: 'Teste HTTP acima do teto antigo' }),
  });
  assert.equal(largeWalletApiResponse.status, 200);
  assert.equal((await largeWalletApiResponse.json()).wallet.total, 10_000_121);
  const playerWalletApi = await fetch(`${baseUrl}/staff/wallet`, {
    method: 'POST', headers: { cookie: apiPlayer.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ username: apiPlayer.profile.username, operation: 'credit', amount: 121, reason: 'Tentativa não autorizada' }),
  });
  assert.equal(playerWalletApi.status, 403, 'ordinary players cannot use the economy adjustment route');
  const moderatorPanel = await fetch(`${baseUrl}/staff`, { headers: { cookie: `clareira_session=${manager.token}` } });
  assert.equal(moderatorPanel.status, 200, 'moderators can open the panel using their moderation access');
  const moderatorCapabilities = await fetch(`${baseUrl}/staff/capabilities`, { headers: { cookie: `clareira_session=${manager.token}` } });
  assert.equal(moderatorCapabilities.status, 200);
  assert.equal((await moderatorCapabilities.json()).capabilities.readReports, true);
  const playerCapabilities = await fetch(`${baseUrl}/staff/capabilities`, { headers: { cookie: apiPlayer.cookie } });
  assert.equal(playerCapabilities.status, 403, 'ordinary players receive no housekeeping capabilities');
  const reportReaderPanel = await fetch(`${baseUrl}/staff`, { headers: { cookie: `clareira_session=${reportReader.token}` } });
  assert.equal(reportReaderPanel.status, 200, 'a reports-only moderator can open the panel');
  const reportReaderCapabilities = await fetch(`${baseUrl}/staff/capabilities`, {
    headers: { cookie: `clareira_session=${reportReader.token}` },
  });
  assert.equal(reportReaderCapabilities.status, 200);
  const readerCapabilities = (await reportReaderCapabilities.json()).capabilities;
  assert.equal(readerCapabilities.readReports, true);
  assert.equal(readerCapabilities.manageReports, false);
  const wrongOrigin = await fetch(`${baseUrl}/staff/roles`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://attacker.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(wrongOrigin.status, 403);

  const apiRoleKey = `web_staff_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  fixtureRoles.push(apiRoleKey);
  const createRoleResponse = await fetch(`${baseUrl}/staff/roles`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ roleKey: apiRoleKey, displayName: 'Equipe web', hierarchyLevel: 1, reason: 'Teste HTTP isolado' }),
  });
  assert.equal(createRoleResponse.status, 201, await createRoleResponse.text());
  const roleListResponse = await fetch(`${baseUrl}/staff/roles`, { headers: { cookie: apiOwner.cookie } });
  assert.equal(roleListResponse.status, 200);
  const roleList = (await roleListResponse.json()).roles;
  assert.ok(roleList.find(role => role.role_key === 'manager').inherited_permissions.includes('players.kick'));
  assert.ok(roleList.find(role => role.role_key === 'administrator').inherited_permissions.includes('players.kick'),
    'the role list resolves transitive permission inheritance');
  assert.ok(roleList.some(role => role.role_key === apiRoleKey && role.member_count === 0));
  const permissionsResponse = await fetch(`${baseUrl}/staff/permissions`, { headers: { cookie: apiOwner.cookie } });
  assert.equal(permissionsResponse.status, 200);
  const permissionCatalog = (await permissionsResponse.json()).permissions;
  assert.ok(permissionCatalog.some(permission => permission.permission_key === 'roles.manage' && permission.canDelegate));
  assert.ok(permissionCatalog.some(permission => permission.permission_key === '*' && permission.canDelegate),
    'Owner can delegate full authority, including capabilities added in the future');
  const assignResponse = await fetch(`${baseUrl}/staff/assignments`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ username: apiPlayer.profile.username, roleKey: apiRoleKey, scopeKey: 'global', reason: 'Atribuição por API isolada' }),
  });
  const assignmentResult = await assignResponse.json();
  assert.equal(assignResponse.status, 201, JSON.stringify(assignmentResult));
  const { assignmentId: apiAssignmentId } = assignmentResult;
  const assignmentsResponse = await fetch(`${baseUrl}/staff/accounts/${apiPlayer.profile.username}/roles`, {
    headers: { cookie: apiOwner.cookie },
  });
  assert.equal(assignmentsResponse.status, 200);
  assert.ok((await assignmentsResponse.json()).assignments.some(assignment => assignment.role_key === apiRoleKey));
  const permissionResponse = await fetch(`${baseUrl}/staff/roles/${apiRoleKey}/permissions`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ permissionKey: 'community.help', granted: true, reason: 'Delegação pela API isolada' }),
  });
  const permissionResult = await permissionResponse.json();
  assert.equal(permissionResponse.status, 200, JSON.stringify(permissionResult));
  assert.equal(permissionResult.changed, true);
  const revokeResponse = await fetch(`${baseUrl}/staff/assignments/${apiAssignmentId}/revoke`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Revogação pela API isolada' }),
  });
  const revokeResult = await revokeResponse.json();
  assert.equal(revokeResponse.status, 200, JSON.stringify(revokeResult));
  assert.equal(revokeResult.revoked, true);
  const auditResponse = await fetch(`${baseUrl}/staff/audit`, { headers: { cookie: apiOwner.cookie } });
  assert.equal(auditResponse.status, 200);
  assert.ok((await auditResponse.json()).events.some(event => event.action === 'role.assignment.granted'));

  const reportSubmission = await fetch(`${baseUrl}/reports`, {
    method: 'POST', headers: { cookie: apiPlayer.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ targetAccountId: apiOwner.profile.id, category: 'exploit', description: 'A conta usou uma falha para atravessar a parede do salão.' }),
  });
  const reportResult = await reportSubmission.json();
  assert.equal(reportSubmission.status, 201, JSON.stringify(reportResult));
  const reportsResponse = await fetch(`${baseUrl}/staff/reports?status=open`, { headers: { cookie: apiOwner.cookie } });
  assert.equal(reportsResponse.status, 200);
  assert.ok((await reportsResponse.json()).reports.some(report => String(report.report_id) === reportResult.reportId));
  const claimReportResponse = await fetch(`${baseUrl}/staff/reports/${reportResult.reportId}`, {
    method: 'POST', headers: { cookie: `clareira_session=${manager.token}`, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'claim', reason: 'Análise assumida pela equipe' }),
  });
  assert.equal(claimReportResponse.status, 200, await claimReportResponse.text());
  const managerReportQueue = await fetch(`${baseUrl}/staff/reports?status=claimed`, {
    headers: { cookie: `clareira_session=${manager.token}` },
  });
  assert.equal(managerReportQueue.status, 200);
  assert.ok((await managerReportQueue.json()).reports.some(report => String(report.report_id) === reportResult.reportId),
    'the assigned moderator can see the report in their queue');
  const readerReportQueue = await fetch(`${baseUrl}/staff/reports?status=claimed`, {
    headers: { cookie: `clareira_session=${reportReader.token}` },
  });
  assert.equal(readerReportQueue.status, 200);
  assert.equal((await readerReportQueue.json()).reports.length, 0,
    'reports.read without reports.manage cannot see cases assigned to another moderator');
  const sanctionResponse = await fetch(`${baseUrl}/staff/sanctions`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ username: apiPlayer.profile.username, kind: 'mute', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), reason: 'Pausa temporária após o caso', reportId: reportResult.reportId }),
  });
  const sanctionResult = await sanctionResponse.json();
  assert.equal(sanctionResponse.status, 201, JSON.stringify(sanctionResult));
  assert.ok((await management.activeSanctions([apiPlayer.profile.id])).some(row => String(row.sanction_id) === sanctionResult.sanctionId));
  const sanctionHistory = await fetch(`${baseUrl}/staff/accounts/${apiPlayer.profile.username}/sanctions`, { headers: { cookie: apiOwner.cookie } });
  assert.equal(sanctionHistory.status, 200);
  assert.ok((await sanctionHistory.json()).sanctions.some(row => String(row.sanction_id) === sanctionResult.sanctionId));
  const revokeSanctionResponse = await fetch(`${baseUrl}/staff/sanctions/${sanctionResult.sanctionId}/revoke`, {
    method: 'POST', headers: { cookie: apiOwner.cookie, origin: 'https://staff-test.clareira.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Teste encerrado no banco isolado' }),
  });
  assert.equal(revokeSanctionResponse.status, 200, await revokeSanctionResponse.text());
  assert.equal((await management.activeSanctions([apiPlayer.profile.id])).length, 0);

  // Exercise every in-game sanction through the real HTTP API and persisted history.
  for (const kind of ['warning', 'mute', 'kick', 'suspend', 'ban']) {
    const payload = { username:apiPlayer.profile.username, kind, reason:`Verificação isolada de ${kind}`,
      expiresAt:['mute','suspend'].includes(kind) ? new Date(Date.now()+60_000).toISOString() : null };
    const created = await fetch(`${baseUrl}/staff/sanctions`, {method:'POST',headers:{cookie:apiOwner.cookie,origin:'https://staff-test.clareira.invalid','content-type':'application/json'},body:JSON.stringify(payload)});
    const result = await created.json();assert.equal(created.status,201,JSON.stringify(result));
    const history = await fetch(`${baseUrl}/staff/accounts/${apiPlayer.profile.username}/sanctions`, {headers:{cookie:apiOwner.cookie}});
    const row = (await history.json()).sanctions.find(item=>String(item.sanction_id)===String(result.sanctionId));
    assert.equal(row?.kind,kind);assert.equal(Boolean(row?.expires_at),['mute','suspend','kick'].includes(kind));
    if(kind==='kick') assert.equal(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime(),30_000,'kick blocks re-entry for the existing 30-second period');
    const revoked = await fetch(`${baseUrl}/staff/sanctions/${result.sanctionId}/revoke`,{method:'POST',headers:{cookie:apiOwner.cookie,origin:'https://staff-test.clareira.invalid','content-type':'application/json'},body:JSON.stringify({reason:'Verificação encerrada no banco isolado'})});
    assert.equal(revoked.status,200);
  }

  const wsBanId = await management.applySanction(apiOwner.token, {
    targetAccountId: apiPlayer.profile.id, kind: 'ban', reason: 'Bloqueio usado para testar o handshake do jogo',
  });
  const game = createPrototypeServer({
    port: 0, stateDirectory: path.join(os.tmpdir(), `clareira-staff-game-${randomUUID()}`),
    databaseUrl: connectionString, ambientCampfire: false, arrivalTutorialEnabled: false,
    allowedOrigin: 'https://staff-test.clareira.invalid',
    resolveSession: async token => token === 'synthetic-sanction-test-token' ? { profile: {
      id: apiPlayer.profile.id, displayName: apiPlayer.profile.username, guest: false,
      inventory: { wood: 0, stone: 0, berries: 0 },
    } } : null,
  });
  const gameAddress = await game.listen();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${gameAddress.port}/room`, {
      headers: { origin: 'https://staff-test.clareira.invalid', cookie: 'clareira_session=synthetic-sanction-test-token' },
    });
    await new Promise((resolve, reject) => {
      ws.once('open', () => { ws.terminate(); reject(new Error('Conta banida recebeu conexão WebSocket.')); });
      ws.once('error', error => {
        assert.match(error.message, /403/u);
        resolve();
      });
    });
  } finally {
    await game.close();
    await management.revokeSanction(apiOwner.token, { sanctionId: wsBanId, reason: 'Fim do teste do handshake' });
  }

  const dimensionGame = createPrototypeServer({
    port: 0, stateDirectory: path.join(os.tmpdir(), `clareira-dimension-access-${randomUUID()}`),
    databaseUrl: connectionString, ambientCampfire: false, arrivalTutorialEnabled: false,
    allowedOrigin: 'https://staff-test.clareira.invalid',
    resolveSession: async token => {
      const profiles = new Map([
        [apiOwner.token, { id: apiOwner.profile.id, username: apiOwner.profile.username, guest: false, inventory: {} }],
        [apiPlayer.token, { id: apiPlayer.profile.id, username: apiPlayer.profile.username, guest: false,
          inventory: { level:12, skillPoints:2, attributes:{ magic:8 }, learnedAbilities:['fireballI'] } }],
      ]);
      const profile = profiles.get(token);
      return profile ? { profile } : null;
    },
  });
  await createPostgresStore(pool).saveProgress(apiPlayer.profile.id, {
    level: 12, skillPoints: 2, attributes: { magic: 8 }, learnedAbilities: ['fireballI'],
  });
  const dimensionAddress = await dimensionGame.listen();
  const ownerSocket = new WebSocket(`ws://127.0.0.1:${dimensionAddress.port}/room`, {
    headers: { origin: 'https://staff-test.clareira.invalid', cookie: `clareira_session=${apiOwner.token}` },
  });
  const playerSocket = new WebSocket(`ws://127.0.0.1:${dimensionAddress.port}/room`, {
    headers: { origin: 'https://staff-test.clareira.invalid', cookie: `clareira_session=${apiPlayer.token}` },
  });
  try {
    const ownerStatePromise = waitForSocketMessage(ownerSocket, message => message.type === 'state' && Array.isArray(message.dimensions), 'owner dimensions');
    const playerStatePromise = waitForSocketMessage(playerSocket, message => message.type === 'state' && Array.isArray(message.dimensions), 'player dimensions');
    await Promise.all([
      new Promise((resolve, reject) => { ownerSocket.once('open', resolve); ownerSocket.once('error', reject); }),
      new Promise((resolve, reject) => { playerSocket.once('open', resolve); playerSocket.once('error', reject); }),
    ]);
    const [ownerState, playerState] = await Promise.all([ownerStatePromise, playerStatePromise]);
    assert.ok(ownerState.dimensions.some(dimension => dimension.id === 'inferno'),
      `Owner sees every world dimension (owner=${apiOwner.profile.id}; player=${apiPlayer.profile.id}; arrival=${ownerState.dimensions.at(-1)?.id}; permission=${await management.authorization.hasPermission(apiOwner.profile.id, 'dimensions.staff_travel')}; ids=${ownerState.dimensions.map(dimension => dimension.id).join(',')})`);
    assert.equal(playerState.dimensions.some(dimension => dimension.id === 'inferno'), false,
      `ordinary player snapshots do not expose undiscovered dimension names (owner=${apiOwner.profile.id}; player=${apiPlayer.profile.id}; arrival=${playerState.dimensions.at(-1)?.id}; ids=${playerState.dimensions.map(dimension => dimension.id).join(',')}; permission=${await management.authorization.hasPermission(apiPlayer.profile.id, 'dimensions.staff_travel')})`);
    assert.deepEqual(new Set(playerState.dimensions.map(dimension => dimension.id)),
      new Set(['surface', 'breu', `arrival-${apiPlayer.profile.id}`]));
    const deniedTravel = waitForSocketMessage(playerSocket, message => message.type === 'notice'
      && message.action === 'dimensionTravel' && message.requestId === 'player-forged-dimension'
      && message.result === 'rejected', 'player denied from undiscovered dimension');
    playerSocket.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: 'inferno', requestId: 'player-forged-dimension' }));
    await deniedTravel;
    const knowledgeNotice = waitForSocketMessage(playerSocket, message => message.type === 'notice'
      && message.text?.includes('passagem dimensional desconhecida'), 'knowledge reveals a dimension');
    const knownInfernoPromise = waitForSocketMessage(playerSocket, message => message.type === 'state'
      && message.dimensions?.some(dimension => dimension.id === 'inferno')
      && message.inventoryState?.inventory?.learnedAbilities?.includes('fireballII'), 'learned magic unlocks Inferno');
    playerSocket.send(JSON.stringify({ type: 'action', name: 'learnAbility', abilityId: 'fireballII' }));
    await knowledgeNotice;
    const knownInferno = await knownInfernoPromise;
    assert.equal(knownInferno.dimensions.some(dimension => dimension.id === 'inferno'), true);
    assert.deepEqual((await pool.query(
      "SELECT discovery_source FROM player_dimension_discoveries WHERE profile_id=$1 AND dimension_id='inferno'",
      [apiPlayer.profile.id],
    )).rows, [{ discovery_source:'knowledge' }]);
    const playerInfernoTransit = waitForSocketMessage(playerSocket, message => message.type === 'state'
      && message.dimensionTransits?.some(transit => transit.destinationDimensionId === 'inferno'), 'player travels to discovered Inferno');
    playerSocket.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: 'inferno', requestId: 'player-known-dimension' }));
    await playerInfernoTransit;
    const ownerTransit = waitForSocketMessage(ownerSocket, message => message.type === 'state'
      && message.dimensionTransits?.some(transit => transit.staffDimensionTravel === true && transit.destinationDimensionId === 'inferno'),
    'Owner staff travel');
    ownerSocket.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: 'inferno', requestId: 'owner-staff-travel' }));
    const travelState = await ownerTransit;
    const infernoTransit = travelState.dimensionTransits.find(transit => transit.staffDimensionTravel === true && transit.destinationDimensionId === 'inferno');
    assert.equal(infernoTransit.staffDimensionTravel, true, 'the server tags authorized staff travel');
    const infernoArrival = waitForSocketMessage(ownerSocket, message => message.type === 'state'
      && message.dimensionId === 'inferno' && message.dimensionTransits?.some(transit => transit.id === infernoTransit.id),
    'Owner destination scene');
    await infernoArrival;
    const scheduledArrival = waitForSocketMessage(ownerSocket, message => message.type === 'state'
      && message.dimensionTransits?.some(transit => transit.id === infernoTransit.id && Number.isFinite(transit.destinationStartAt))
      && message.players.some(player => player.dimensionTravelCooldownUntil === 0), 'staff cooldown bypass');
    ownerSocket.send(JSON.stringify({ type: 'dimensionTransitReady', transitId: infernoTransit.id }));
    await scheduledArrival;
    const staffUnlocked = waitForSocketMessage(ownerSocket, message => message.type === 'state'
      && message.dimensionId === 'inferno' && message.players.some(player => player.movementLocked === false),
    'staff arrival unlock');
    await staffUnlocked;
    const secondStaffTransit = waitForSocketMessage(ownerSocket, message => message.type === 'state'
      && message.dimensionTransits?.some(transit => transit.destinationDimensionId === 'ceu'), 'immediate second staff travel');
    ownerSocket.send(JSON.stringify({ type: 'dimensionTravel', dimensionId: 'ceu', requestId: 'owner-staff-travel-again' }));
    await secondStaffTransit;
    assert.equal((await pool.query(
      "SELECT count(*) FROM player_dimension_discoveries WHERE profile_id=$1 AND dimension_id='inferno'",
      [apiOwner.profile.id],
    )).rows[0].count, '0', 'staff travel does not turn into player discovery');
  } finally {
    ownerSocket.terminate(); playerSocket.terminate();
    await dimensionGame.close();
  }

  const runtimeRole = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game'");
  if (runtimeRole.rowCount) {
    await pool.query(
      'REVOKE ALL ON FUNCTION public.staff_create_role_from_session(bytea, text, text, smallint, text), ' +
      'public.staff_assign_role_from_session(bytea, uuid, text, text, text, timestamptz), ' +
      'public.staff_revoke_role_from_session(bytea, bigint, text), ' +
      'public.staff_set_role_permission_from_session(bytea, text, text, boolean, text) FROM clareira_preview_game',
    );
    assert.equal((await pool.query(
      "SELECT has_function_privilege('clareira_preview_game', 'public.staff_assign_role_from_session(bytea,uuid,text,text,text,timestamp with time zone)', 'EXECUTE') AS can_call_role_assign",
    )).rows[0].can_call_role_assign, false,
    'the fresh-role fixture starts without migration-time EXECUTE grants');
    const executable = await pool.query(
      "SELECT has_function_privilege('clareira_preview_game', 'public.staff_assign_role_from_session(bytea,uuid,text,text,text,timestamp with time zone)', 'EXECUTE') AS can_call_role_assign, " +
      "has_function_privilege('clareira_preview_game', 'public.staff_actor_has_permission(uuid,text,text)', 'EXECUTE') AS can_call_internal_authorizer",
    );
    assert.deepEqual(executable.rows[0], { can_call_role_assign: false, can_call_internal_authorizer: false },
      'before bootstrap, the fresh runtime role has no staff function grants');
    // Reproduce activate-preview.mjs's broad bootstrap grants before applying
    // the staff-specific restriction, then verify the final effective rights.
    await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clareira_preview_game');
    await pool.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO clareira_preview_game');
    await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clareira_preview_game');
    await applyStaffRuntimePrivileges(pool);
    const bootstrapExecutable = await pool.query(
      "SELECT has_function_privilege('clareira_preview_game', 'public.staff_assign_role_from_session(bytea,uuid,text,text,text,timestamp with time zone)', 'EXECUTE') AS can_call_role_assign, " +
      "has_function_privilege('clareira_preview_game', 'public.staff_actor_has_permission(uuid,text,text)', 'EXECUTE') AS can_call_internal_authorizer",
    );
    assert.deepEqual(bootstrapExecutable.rows[0], {
      can_call_role_assign: true,
      can_call_internal_authorizer: false,
    }, 'bootstrap grants only the narrow staff mutation routines to the runtime');
    const futureTable = `staff_privilege_future_${randomUUID().replaceAll('-', '')}`;
    await pool.query(`CREATE TABLE ${futureTable} (id integer PRIMARY KEY, value text)`);
    t.after(() => pool.query(`DROP TABLE IF EXISTS ${futureTable}`).catch(() => {}));
    const privileges = await pool.query(
      "SELECT has_table_privilege('clareira_preview_game', 'staff_role_inheritance', 'SELECT') AS can_read_inheritance, " +
      "has_table_privilege('clareira_preview_game', 'staff_audit_events', 'SELECT') AS can_read_audit, " +
      "has_table_privilege('clareira_preview_game', 'staff_roles', 'UPDATE') AS can_change_roles, " +
      "has_table_privilege('clareira_preview_game', 'account_role_assignments', 'INSERT') AS can_insert_assignments, " +
      "has_table_privilege('clareira_preview_game', 'account_role_assignments', 'UPDATE') AS can_update_assignments, " +
      "has_table_privilege('clareira_preview_game', 'account_role_assignments', 'DELETE') AS can_delete_assignments, " +
      "has_table_privilege('clareira_preview_game', 'staff_role_permissions', 'INSERT') AS can_insert_permissions, " +
      "has_table_privilege('clareira_preview_game', 'staff_role_permissions', 'UPDATE') AS can_update_permissions, " +
      "has_table_privilege('clareira_preview_game', 'staff_role_permissions', 'DELETE') AS can_delete_permissions, " +
      "has_table_privilege('clareira_preview_game', 'staff_audit_events', 'INSERT') AS can_forge_audit, " +
      "has_table_privilege('clareira_preview_game', 'staff_audit_events', 'UPDATE') AS can_update_audit, " +
      "has_table_privilege('clareira_preview_game', 'staff_audit_events', 'DELETE') AS can_delete_audit, " +
      "has_table_privilege('clareira_preview_game', 'staff_audit_events', 'TRUNCATE') AS can_truncate_audit, " +
      "has_sequence_privilege('clareira_preview_game', 'account_role_assignments_assignment_id_seq', 'USAGE') AS can_use_assignment_sequence, " +
      "has_sequence_privilege('clareira_preview_game', 'staff_audit_events_event_id_seq', 'USAGE') AS can_use_audit_sequence, " +
      `has_table_privilege('clareira_preview_game', '${futureTable}', 'SELECT') AS can_read_future_table, ` +
      `has_table_privilege('clareira_preview_game', '${futureTable}', 'INSERT') AS can_insert_future_table, ` +
      `has_table_privilege('clareira_preview_game', '${futureTable}', 'UPDATE') AS can_update_future_table, ` +
      `has_table_privilege('clareira_preview_game', '${futureTable}', 'DELETE') AS can_delete_future_table`,
    );
    assert.deepEqual(privileges.rows[0], {
      can_read_inheritance: true,
      can_read_audit: true,
      can_change_roles: false,
      can_insert_assignments: false,
      can_update_assignments: false,
      can_delete_assignments: false,
      can_insert_permissions: false,
      can_update_permissions: false,
      can_delete_permissions: false,
      can_forge_audit: false,
      can_update_audit: false,
      can_delete_audit: false,
      can_truncate_audit: false,
      can_use_assignment_sequence: false,
      can_use_audit_sequence: false,
      can_read_future_table: true,
      can_insert_future_table: false,
      can_update_future_table: false,
      can_delete_future_table: false,
    }, 'runtime can resolve access and read audit history, but cannot mutate grants or audit');
  } else t.diagnostic('clareira_preview_game is absent in this PostgreSQL cluster; catalog SQL assertions cover its grants');
});
