import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';
import { createPostgresStore } from './store.mjs';
import { createEconomyStore } from './economy-store.mjs';
import { createInventory, inventorySnapshot } from '../game/inventory.mjs';
import { currencyValue } from '../game/lodging-catalog.mjs';
import { gameDayKey } from '../game/game-calendar.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('NPC stock circulates between players with atomic payment, single delivery and no overselling', {
  skip: !databaseUrl,
}, async () => {
  const pool = createDatabasePool({ connectionString:databaseUrl, max:5 });
  const accounts = createPostgresStore(pool);
  const market = createEconomyStore(pool);
  const ids = [];
  const itemId = 'copperIngot';
  let oldQuote, oldStock, oldFund, oldRemainder;
  try {
    await runMigrations(pool);
    await market.ensureGoods();
    oldQuote = await pool.query("SELECT buy_price_bronze,sell_price_bronze FROM economy_quotes WHERE item_id=$1 AND region_id='global'",[itemId]);
    oldStock = await pool.query("SELECT quantity,reserved FROM economy_market_stock WHERE market_id='arrival:market' AND region_id='global' AND item_id=$1",[itemId]);
    oldFund = await pool.query("SELECT balance_bronze FROM government_fund_accounts WHERE government_id='surface:arrival' AND fund_code='general'");
    oldRemainder = await pool.query(
      "SELECT remainder_numerator FROM government_tax_remainders WHERE government_id='surface:arrival' AND tax_code='market_sale'",
    );
    assert.equal(Number(oldStock.rows[0].quantity), 0, 'the isolated CI database starts without merchant stock');
    await pool.query("UPDATE economy_quotes SET buy_price_bronze=51,sell_price_bronze=60 WHERE item_id=$1 AND region_id='global'",[itemId]);

    const makePlayer = async prefix => {
      const registered = await accounts.accounts.register({
        username:prefix + randomUUID().replaceAll('-', '').slice(0, 10),
        password:randomUUID(),
      });
      ids.push(registered.profile.id);
      return registered;
    };
    const seller = await makePlayer('source_');
    const buyer = await makePlayer('buyer_');
    const rivalA = await makePlayer('rival_');
    const rivalB = await makePlayer('rival_');

    const stock = createInventory(); stock[itemId] = 3;
    await accounts.saveProgress(seller.profile.id, inventorySnapshot(stock));
    stock[itemId] = 0;
    const sold = await market.settleNpcSale({
      profileId:seller.profile.id, itemId, quantity:3,
      inventoryAfter:inventorySnapshot(stock), expectedPriceBronze:51,
    });
    assert.equal(sold.grossAmount, 153);
    assert.equal((await market.getQuotes())[itemId].availableStock, 3);

    await accounts.creditWallet(buyer.profile.id, 300);
    await accounts.creditWallet(rivalA.profile.id, 200);
    await accounts.creditWallet(rivalB.profile.id, 200);
    const inventory = async player => (await accounts.accounts.getSession(player.token)).profile.inventory;
    const before = await inventory(buyer);

    await assert.rejects(
      market.settleNpcPurchase({profileId:buyer.profile.id,itemId,quantity:1,inventoryBefore:before,expectedPriceBronze:61}),
      error => error.status === 409 && /cotação mudou/.test(error.message),
      'the displayed price must be confirmed against the database quote',
    );
    const forged = createInventory(before); forged.wood = 1;
    await assert.rejects(
      market.settleNpcPurchase({profileId:buyer.profile.id,itemId,quantity:1,inventoryBefore:inventorySnapshot(forged),expectedPriceBronze:60}),
      error => error.status === 409 && /Inventário mudou/.test(error.message),
      'a stale or forged inventory cannot create resources',
    );
    const bought = await market.settleNpcPurchase({
      profileId:buyer.profile.id,itemId,quantity:2,inventoryBefore:before,expectedPriceBronze:60,
    });
    assert.equal(bought.grossAmount, 120);
    assert.equal(bought.availableStock, 1);
    assert.equal(bought.inventory.copperIngot, 2);
    assert.equal(currencyValue(bought.wallet), 180);
    assert.equal((await market.getQuotes())[itemId].availableStock, 1);

    await assert.rejects(
      market.settleNpcPurchase({profileId:buyer.profile.id,itemId,quantity:1,inventoryBefore:before,expectedPriceBronze:60}),
      error => error.status === 409,
      'repeating a previously confirmed snapshot cannot buy another material',
    );

    const competing = await Promise.allSettled([rivalA, rivalB].map(async player =>
      market.settleNpcPurchase({
        profileId:player.profile.id,itemId,quantity:1,inventoryBefore:await inventory(player),expectedPriceBronze:60,
      }),
    ));
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1, 'only one of two buyers gets the last unit');
    assert.equal(competing.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
    assert.equal((await market.getQuotes())[itemId].availableStock, 0);
    assert.equal((await inventory(buyer)).copperIngot, 2);
    assert.equal((await inventory(buyer)).silver, 1);
    assert.equal((await inventory(buyer)).bronze, 80);

    const stockNow = await pool.query(
      "SELECT quantity,reserved FROM economy_market_stock WHERE market_id='arrival:market' AND item_id=$1 AND region_id='global'",[itemId],
    );
    assert.equal(Number(stockNow.rows[0].quantity), 0);
    assert.equal(Number(stockNow.rows[0].reserved), 0);
    const flows = await pool.query(
      "SELECT units_sold_to_npc,units_bought_from_npc FROM economy_daily_flows WHERE item_id=$1 AND region_id='global' AND flow_day=$2::date",
      [itemId,gameDayKey()],
    );
    assert.equal(Number(flows.rows[0].units_sold_to_npc), 3);
    assert.equal(Number(flows.rows[0].units_bought_from_npc), 3);
    const journal = await pool.query(
      "SELECT t.event_type, sum(l.amount_bronze)::bigint AS balance, " +
      "count(DISTINCT t.transaction_id)::integer AS transactions FROM economy_journal_transactions t " +
      "JOIN economy_journal_lines l USING(transaction_id) WHERE t.actor_profile_id=ANY($1::uuid[]) " +
      "GROUP BY t.event_type ORDER BY t.event_type", [ids],
    );
    assert.deepEqual(journal.rows.map(row => [row.event_type,Number(row.balance),row.transactions]),[
      ['npc_market_purchase',0,2],['npc_market_sale',0,1],
    ]);
  } finally {
    if (ids.length) {
      await pool.query(
        'DELETE FROM economy_journal_lines WHERE transaction_id IN (SELECT transaction_id FROM economy_journal_transactions WHERE actor_profile_id=ANY($1::uuid[]))',[ids],
      );
      await pool.query('DELETE FROM economy_journal_transactions WHERE actor_profile_id=ANY($1::uuid[])',[ids]);
      await pool.query('DELETE FROM profiles WHERE id=ANY($1::uuid[])',[ids]);
      await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',[ids]);
    }
    await pool.query("DELETE FROM economy_daily_flows WHERE item_id=$1 AND region_id='global' AND flow_day=$2::date",
      [itemId,gameDayKey()]);
    if (oldStock?.rowCount) await pool.query(
      "UPDATE economy_market_stock SET quantity=$2,reserved=$3 WHERE market_id='arrival:market' AND region_id='global' AND item_id=$1",
      [itemId,oldStock.rows[0].quantity,oldStock.rows[0].reserved],
    );
    if (oldQuote?.rowCount) await pool.query(
      "UPDATE economy_quotes SET buy_price_bronze=$2,sell_price_bronze=$3 WHERE item_id=$1 AND region_id='global'",
      [itemId,oldQuote.rows[0].buy_price_bronze,oldQuote.rows[0].sell_price_bronze],
    );
    if (oldFund?.rowCount) await pool.query(
      "UPDATE government_fund_accounts SET balance_bronze=$1 WHERE government_id='surface:arrival' AND fund_code='general'",
      [oldFund.rows[0].balance_bronze],
    );
    if (oldRemainder?.rowCount) {
      await pool.query(
        "UPDATE government_tax_remainders SET remainder_numerator=$1 WHERE government_id='surface:arrival' AND tax_code='market_sale'",
        [oldRemainder.rows[0].remainder_numerator],
      );
    } else {
      await pool.query("DELETE FROM government_tax_remainders WHERE government_id='surface:arrival' AND tax_code='market_sale'");
    }
    await pool.end();
  }
});
