import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createDatabasePool } from '../database/pool.mjs';

const BOOTSTRAP_LOCK_ID = 1128352846;

export async function provisionInitialOwner(pool, { username, reason } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('Um pool PostgreSQL privilegiado é necessário.');
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!/^[a-z0-9_]{3,20}$/u.test(normalizedUsername)) {
    throw Object.assign(new Error('Informe um nome de usuário válido.'), { status: 400 });
  }
  if (cleanReason.length < 12 || cleanReason.length > 500) {
    throw Object.assign(new Error('Informe um motivo de 12 a 500 caracteres.'), { status: 400 });
  }

  const client = await pool.connect();
  let transaction = false;
  try {
    await client.query('BEGIN');
    transaction = true;
    await client.query('SELECT pg_advisory_xact_lock($1)', [BOOTSTRAP_LOCK_ID]);
    if ((await client.query(
      "SELECT 1 FROM account_role_assignments WHERE role_key = 'owner' AND revoked_at IS NULL " +
      'AND (expires_at IS NULL OR expires_at > statement_timestamp()) LIMIT 1',
    )).rowCount) {
      throw Object.assign(new Error('Já existe uma atribuição de Proprietário; bootstrap inicial recusado.'), { status: 409 });
    }
    const expiredOwners = await client.query(
      "UPDATE account_role_assignments SET revoked_at = statement_timestamp() " +
      "WHERE role_key = 'owner' AND revoked_at IS NULL AND expires_at <= statement_timestamp() " +
      'RETURNING assignment_id, account_id, scope_key',
    );
    for (const expired of expiredOwners.rows) {
      await client.query(
        "INSERT INTO staff_audit_events (actor_account_id, target_account_id, action, scope_key, reason, details) " +
        "VALUES (NULL, $1, 'owner.expired.bootstrap_recovered', $2, $3, jsonb_build_object('assignment_id', $4::bigint))",
        [expired.account_id, expired.scope_key, cleanReason, expired.assignment_id],
      );
    }
    const account = await client.query(
      'SELECT account.id, account.username FROM accounts account JOIN profiles profile ON profile.account_id = account.id WHERE account.username = $1',
      [normalizedUsername],
    );
    if (!account.rowCount) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
    const target = account.rows[0];
    const assignment = await client.query(
      "INSERT INTO account_role_assignments (account_id, role_key, scope_key, assigned_by_account_id, reason) " +
      "VALUES ($1, 'owner', 'global', NULL, $2) RETURNING assignment_id",
      [target.id, cleanReason],
    );
    await client.query(
      "INSERT INTO staff_audit_events (actor_account_id, target_account_id, action, scope_key, reason, details) " +
      "VALUES (NULL, $1, 'owner.bootstrapped', 'global', $2, jsonb_build_object('assignment_id', $3::bigint, 'provisioning', 'initial_owner'))",
      [target.id, cleanReason, assignment.rows[0].assignment_id],
    );
    await client.query('COMMIT');
    transaction = false;
    return { username: target.username, assignmentId: assignment.rows[0].assignment_id };
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , username, ...reasonParts] = process.argv;
  const connectionString = process.env.STAFF_BOOTSTRAP_DATABASE_URL;
  if (!connectionString || !username || !reasonParts.length) {
    process.stderr.write('Uso: STAFF_BOOTSTRAP_DATABASE_URL=<acesso-operacional> node scripts/provision-owner.mjs USUÁRIO "MOTIVO"\n');
    process.exitCode = 2;
  } else {
    const pool = createDatabasePool({ connectionString, applicationName: 'clareira-owner-bootstrap', max: 1 });
    try {
      const result = await provisionInitialOwner(pool, { username, reason: reasonParts.join(' ') });
      process.stdout.write('Proprietário inicial atribuído à conta @' + result.username + '; atribuição ' + result.assignmentId + ' registrada na auditoria.\n');
    } catch (error) {
      process.stderr.write((error.message || 'Não foi possível provisionar o Proprietário.') + '\n');
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
