import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';
import { createPostgresStore } from './store.mjs';
import { createInventory, inventorySnapshot } from '../game/inventory.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('tool purchases atomically update wallet, inventory and the balanced journal', {
  skip: !databaseUrl,
}, async () => {
  const pool = createDatabasePool({ connectionString:databaseUrl, max:3 });
  const store = createPostgresStore(pool);
  const profileIds = [];
  try {
    await runMigrations(pool);
    const account = await store.accounts.register({
      username:`tool_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      password:randomUUID(),
    });
    const profileId = account.profile.id;
    profileIds.push(profileId);
    await store.creditWallet(profileId, 1600);
    const current = async () => (await store.accounts.getSession(account.token)).profile.inventory;

    const stale = createInventory(await current());
    stale.wood = 1;
    await assert.rejects(
      store.settleToolPurchase({ profileId, toolId:'stoneAxe', inventoryBefore:inventorySnapshot(stale) }),
      error => error.status === 409 && /mochila mudou/.test(error.message),
      'a stale inventory must not debit currency',
    );
    assert.equal((await current()).silver, 16);

    await assert.rejects(
      store.settleToolPurchase({ profileId, toolId:'stoneAxe',
        inventoryBefore:await current(), expectedPriceBronze:501 }),
      error => error.status === 400,
      'a stale displayed price must not debit currency',
    );
    assert.equal((await current()).silver, 16);

    const axe = await store.settleToolPurchase({
      profileId, toolId:'stoneAxe', inventoryBefore:await current(), expectedPriceBronze:500,
    });
    assert.equal(axe.price, 500);
    assert.equal(axe.wallet.silver, 11);
    assert.equal(axe.inventory.stoneAxe, 1);
    assert.equal(axe.inventory.axeSharpness, 100);
    assert.equal(axe.inventory.axeDurability, 210);

    await assert.rejects(
      store.settleToolPurchase({
        profileId, toolId:'stoneAxe', inventoryBefore:await current(), expectedPriceBronze:500,
      }),
      error => error.status === 409 && /já tem/.test(error.message),
      'repeating a tool purchase must not pay twice',
    );
    assert.equal((await current()).silver, 11);

    const pickaxe = await store.settleToolPurchase({
      profileId, toolId:'stonePickaxe', inventoryBefore:await current(), expectedPriceBronze:700,
    });
    assert.equal(pickaxe.price, 700);
    assert.equal(pickaxe.wallet.silver, 4);
    assert.equal(pickaxe.inventory.stonePickaxe, 1);
    assert.equal(pickaxe.inventory.pickaxeDurability, 180);

    const persistent = await current();
    assert.equal(persistent.silver, 4);
    assert.equal(persistent.stoneAxe, 1);
    assert.equal(persistent.stonePickaxe, 1);

    const journal = await pool.query(
      "SELECT count(DISTINCT t.transaction_id)::integer AS operations, " +
      "sum(l.amount_bronze)::bigint AS balance, " +
      "sum(l.amount_bronze) FILTER (WHERE l.account_code='profile')::bigint AS charged, " +
      "sum(l.amount_bronze) FILTER (WHERE l.account_code='market_treasury')::bigint AS received " +
      'FROM economy_journal_transactions t JOIN economy_journal_lines l USING(transaction_id) ' +
      "WHERE t.actor_profile_id=$1 AND t.event_type='npc_tool_purchase'",
      [profileId],
    );
    assert.equal(Number(journal.rows[0].operations), 2);
    assert.equal(Number(journal.rows[0].balance), 0);
    assert.equal(Number(journal.rows[0].charged), -1200);
    assert.equal(Number(journal.rows[0].received), 1200);

    const poor = await store.accounts.register({
      username:`poor_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      password:randomUUID(),
    });
    profileIds.push(poor.profile.id);
    await assert.rejects(
      store.settleToolPurchase({
        profileId:poor.profile.id, toolId:'stoneAxe',
        inventoryBefore:(await store.accounts.getSession(poor.token)).profile.inventory,
      }),
      error => error.status === 402 && /Faltam/.test(error.message),
      'unfunded buyers must not receive a tool',
    );
    assert.equal((await store.accounts.getSession(poor.token)).profile.inventory.stoneAxe, 0);
  } finally {
    for (const profileId of profileIds) {
      await pool.query(
        'DELETE FROM economy_journal_lines WHERE transaction_id IN (SELECT transaction_id FROM economy_journal_transactions WHERE actor_profile_id=$1)',
        [profileId],
      );
      await pool.query('DELETE FROM economy_journal_transactions WHERE actor_profile_id=$1', [profileId]);
      await pool.query('DELETE FROM profiles WHERE id=$1', [profileId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [profileId]);
    }
    await pool.end();
  }
});
