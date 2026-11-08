import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';
import { createPostgresStore } from './store.mjs';
import { createInventory, inventorySnapshot } from '../game/inventory.mjs';
import { resourceContractDayKey } from '../game/resource-contracts.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('resource delivery consumes materials, credits reward and journals in one PostgreSQL transaction', {
  skip: !databaseUrl,
}, async () => {
  const pool = createDatabasePool({ connectionString:databaseUrl, max:3 });
  const store = createPostgresStore(pool);
  let profileId = null;
  try {
    await runMigrations(pool);
    const registered = await store.accounts.register({
      username:`contract_${randomUUID().replaceAll('-', '').slice(0, 10)}`,
      password:randomUUID(),
    });
    profileId = registered.profile.id;
    const before = createInventory();
    before.wood = 25;
    await store.saveProgress(profileId, inventorySnapshot(before));
    const dayKey = resourceContractDayKey();

    const wrong = createInventory(before);
    wrong.wood = 6;
    await assert.rejects(
      store.completeResourceContract({
        profileId, contractId:'dry-sticks', dayKey, inventoryAfter:inventorySnapshot(wrong),
      }),
      error => error.status === 409 && /materiais.*mudaram/.test(error.message),
      'stale inventory must not create currency or a completion record',
    );
    const failedState = await store.getResourceContractState(profileId, dayKey);
    assert.deepEqual(failedState.completed, []);
    assert.equal((await store.accounts.getSession(registered.token)).profile.inventory.wood, 25);

    const forged = createInventory(before);
    forged.wood = 5;
    forged.plank = 1;
    await assert.rejects(
      store.completeResourceContract({
        profileId, contractId:'dry-sticks', dayKey, inventoryAfter:inventorySnapshot(forged),
      }),
      error => error.status === 409 && /materiais.*mudaram/.test(error.message),
      'delivery cannot silently add unrelated items to the persisted inventory',
    );
    const after = createInventory(before);
    after.wood = 5;
    const settlement = await store.completeResourceContract({
      profileId, contractId:'dry-sticks', dayKey, inventoryAfter:inventorySnapshot(after),
    });
    assert.deepEqual(settlement.contractState.completed, ['dry-sticks']);
    assert.equal(settlement.wallet.bronze, 30);
    const persisted = await store.accounts.getSession(registered.token);
    assert.equal(persisted.profile.inventory.wood, 5);
    assert.equal(persisted.profile.inventory.bronze, 30);

    await assert.rejects(
      store.completeResourceContract({
        profileId, contractId:'dry-sticks', dayKey, inventoryAfter:inventorySnapshot(after),
      }),
      error => error.status === 409,
      'replaying a contract cannot pay it twice',
    );
    const journal = await pool.query(
      "SELECT count(DISTINCT t.transaction_id)::integer AS count, sum(l.amount_bronze)::bigint AS balance, " +
      "sum(l.amount_bronze) FILTER (WHERE l.account_code='profile')::bigint AS rewards " +
      'FROM economy_journal_transactions t JOIN economy_journal_lines l USING(transaction_id) ' +
      "WHERE t.actor_profile_id=$1 AND t.event_type='resource_contract_reward'",
      [profileId],
    );
    assert.equal(Number(journal.rows[0].count), 1);
    assert.equal(Number(journal.rows[0].balance), 0);
    assert.equal(Number(journal.rows[0].rewards), 30);
    const finalState = await store.accounts.getSession(registered.token);
    assert.equal(finalState.profile.inventory.wood, 5);
    assert.equal(finalState.profile.inventory.bronze, 30);
  } finally {
    if (profileId) {
      await pool.query(
        'DELETE FROM economy_journal_lines WHERE transaction_id IN (SELECT transaction_id FROM economy_journal_transactions WHERE actor_profile_id=$1)',
        [profileId],
      );
      await pool.query('DELETE FROM economy_journal_transactions WHERE actor_profile_id=$1', [profileId]);
      await pool.query('DELETE FROM resource_contract_completions WHERE profile_id=$1', [profileId]);
      await pool.query('DELETE FROM profiles WHERE id=$1', [profileId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [profileId]);
    }
    await pool.end();
  }
});
