import { gameDayKey } from '../game/game-calendar.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';
import { createPostgresStore } from './store.mjs';
import { createEconomyStore } from './economy-store.mjs';
import { createPropertyMarketStatisticsStore } from './property-market-statistics.mjs';
import { calculateBankInterestQuote, calculateDynamicQuote, calculateGovernmentTaxRate, calculateMinimumShiftPay, calculateMoneySupplyPriceFactor, calculatePropertyTransfer, calculateTaxWithRemainder, calculateTradeBalance, calculateValueAdded } from '../game/economy.mjs';
import { createInventory, inventorySnapshot } from '../game/inventory.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('dynamic quotes respond to scarcity and surplus within bounded changes', () => {
  const scarce = calculateDynamicQuote({ basePrice:60, recentUnitsSold:10, expectedUnitsSold:10, eligibleStock:1, targetStock:100 });
  const surplus = calculateDynamicQuote({ basePrice:60, recentUnitsSold:10, expectedUnitsSold:10, eligibleStock:400, targetStock:100 });
  assert.ok(scarce.sellPrice > 60);
  assert.ok(surplus.sellPrice < 60);
  assert.ok(scarce.sellPrice <= 78);
  assert.ok(surplus.sellPrice >= 42);
  assert.ok(scarce.buyPrice < scarce.sellPrice);
  const tax = balance => calculateGovernmentTaxRate({
    baseRateBps:200, minimumRateBps:0, maximumRateBps:500,
    treasuryTargetBronze:300_000, treasuryBalanceBronze:balance,
    treasurySensitivityBps:100, previousRateBps:200,
  });
  assert.equal(tax(0), 220);
  assert.equal(tax(150_000), 210);
  assert.equal(tax(300_000), 200);
  assert.equal(tax(1_000_000), 180);
});

test('property transfer simulation conserves the announced price across seller and government', () => {
  for (const rate of [0, 200, 220, 500]) {
    const split = calculatePropertyTransfer(10_000, rate);
    assert.equal(split.sellerProceedsBronze + split.taxBronze, split.priceBronze);
  }
  assert.deepEqual(calculatePropertyTransfer(10_000, 220), {
    priceBronze:10_000, taxBronze:220, sellerProceedsBronze:9_780,
  });
});

test('small recurring charges carry fractional bronze tax instead of silently rounding every period to zero', () => {
  let remainder = 0, totalTax = 0;
  for (let day = 0; day < 30; day += 1) {
    const result = calculateTaxWithRemainder(24, 220, remainder);
    totalTax += result.taxBronze;
    remainder = result.remainderNumerator;
  }
  assert.equal(totalTax, 15);
  assert.equal(remainder, 8_400);
  assert.deepEqual(calculateTaxWithRemainder(1, 5_000, 0), { taxBronze:0, remainderNumerator:5_000 });
  assert.deepEqual(calculateTaxWithRemainder(1, 5_000, 5_000), { taxBronze:1, remainderNumerator:0 });
});

test('money supply changes the price level gradually and remains bounded, including large bronze balances', () => {
  const doubled = calculateMoneySupplyPriceFactor({
    currentSupplyBronze:2_000_000n, referenceSupplyBronze:1_000_000n,
  });
  assert.equal(doubled.targetFactor, 2 ** 0.25);
  assert.equal(doubled.priceFactor, 1.037841);
  const extreme = calculateMoneySupplyPriceFactor({
    currentSupplyBronze:10_000_000_000_000_000n, referenceSupplyBronze:1_000_000n,
  });
  assert.equal(extreme.targetFactor, 1.5);
  assert.equal(extreme.priceFactor, 1.1, 'a tenfold supply change cannot move the effective factor by more than 10% in a day');
  const contraction = calculateMoneySupplyPriceFactor({
    currentSupplyBronze:500_000n, referenceSupplyBronze:1_000_000n,
  });
  assert.equal(contraction.priceFactor, 0.968179);
});

test('bank budgets and reserves are distinct from circulating money; loan rates follow liquidity gradually', () => {
  const lowLiquidity=calculateBankInterestQuote({baseRateBps:500,minimumRateBps:0,maximumRateBps:2500,
    reserveTargetBronze:100_000_000n,reserveBalanceBronze:25_000_000n,rateSensitivityBps:1000,
    creditCapacityBps:50_000,outstandingCreditBronze:0n,previousRateBps:500});
  assert.equal(lowLiquidity.rateBps,600,'a reserve shortfall raises the offered rate gradually');
  assert.equal(lowLiquidity.availableCreditBronze,125_000_000n);
  const higherLiquidity=calculateBankInterestQuote({baseRateBps:500,minimumRateBps:0,maximumRateBps:2500,
    reserveTargetBronze:100_000_000n,reserveBalanceBronze:200_000_000n,rateSensitivityBps:1000,
    creditCapacityBps:50_000,outstandingCreditBronze:0n,previousRateBps:500});
  assert.equal(higherLiquidity.rateBps,400,'surplus reserve lowers new-loan rates within the daily step limit');
  const reference=500_000_000n;
  const sameCirculation=calculateMoneySupplyPriceFactor({currentSupplyBronze:reference,referenceSupplyBronze:reference});
  const afterLoan=calculateMoneySupplyPriceFactor({currentSupplyBronze:600_000_000n,referenceSupplyBronze:reference});
  assert.equal(sameCirculation.priceFactor,1,'changing a treasury balance alone does not enter this liquidity measure');
  assert.equal(afterLoan.priceFactor,1.009327,
    'a disbursed 100 million bronze loan raises circulating balances, while the treasury was not counted');
});

test('economic indicators separate produced value, minimum wages, trade balance and circulating money', () => {
  assert.equal(calculateValueAdded({outputValueBronze:60,intermediateInputCostBronze:19}),41n,
    'the copper ingot contributes only its locally created value, not the full resale price');
  assert.equal(calculateValueAdded({outputValueBronze:60,intermediateInputCostBronze:60}),0n,
    'importing or reselling a finished item alone does not create local production value');
  assert.equal(calculateTradeBalance({exportsBronze:1_600,importsBronze:1_200}),400n);
  assert.deepEqual(calculateMinimumShiftPay({minimumWageBronzePerShift:150,shifts:4,agreedGrossWageBronze:599}),
    {minimumGrossBronze:600n,agreedGrossWageBronze:599n,compliant:false});
  assert.equal(calculateMinimumShiftPay({minimumWageBronzePerShift:150,shifts:4,agreedGrossWageBronze:600}).compliant,true);
});

test('government leaders can version tax policy and outsiders cannot read or change it', { skip: !databaseUrl }, async () => {
  const pool=createDatabasePool({connectionString:databaseUrl,max:3});
  const accounts=createPostgresStore(pool).accounts;
  const market=createEconomyStore(pool);
  const governmentId=`test:${randomUUID()}`;
  let leaderId, outsiderId;
  try {
    await runMigrations(pool);
    leaderId=(await accounts.register({username:`tax_${randomUUID().replaceAll('-','').slice(0,12)}`,password:randomUUID()})).profile.id;
    outsiderId=(await accounts.register({username:`tax_${randomUUID().replaceAll('-','').slice(0,12)}`,password:randomUUID()})).profile.id;
    await pool.query('INSERT INTO world_governments(government_id,world_id,settlement_id,government_type,leader_profile_id) VALUES($1,$2,$3,$4,$5)',[governmentId,'test-world',governmentId,'village',leaderId]);
    await pool.query("INSERT INTO government_fund_accounts(government_id,fund_code,balance_bronze) VALUES($1,'general',1250)",[governmentId]);
    await pool.query("INSERT INTO government_tax_policies(government_id,tax_code,version,base_rate_bps,minimum_rate_bps,maximum_rate_bps,treasury_target_bronze,treasury_sensitivity_bps) VALUES($1,'market_sale',1,200,0,500,10000,100)",[governmentId]);
    await pool.query("INSERT INTO government_tax_quotes(government_id,tax_code,policy_version,rate_bps,treasury_balance_bronze) VALUES($1,'market_sale',1,200,1250)",[governmentId]);
    const before=await market.getGovernmentTaxPanel({governmentId,actorProfileId:leaderId});
    assert.equal(before.treasuryBalanceBronze,1250);
    assert.equal(before.policies[0].version,1);
    assert.equal(await market.getGovernmentTaxPanel({governmentId,actorProfileId:outsiderId}),null);
    await assert.rejects(()=>market.updateGovernmentTaxPolicy({governmentId,actorProfileId:outsiderId,taxCode:'market_sale',baseRateBps:300,minimumRateBps:0,maximumRateBps:500,treasuryTargetBronze:10000,treasurySensitivityBps:100}),{status:403});
    const changed=await market.updateGovernmentTaxPolicy({governmentId,actorProfileId:leaderId,taxCode:'market_sale',baseRateBps:300,minimumRateBps:100,maximumRateBps:600,treasuryTargetBronze:20000,treasurySensitivityBps:50});
    assert.equal(changed.version,2);
    const after=await market.getGovernmentTaxPanel({governmentId,actorProfileId:leaderId});
    assert.equal(after.policies[0].baseRateBps,300);
    assert.equal(after.policies[0].version,2);
    const versions=await pool.query('SELECT version,active FROM government_tax_policies WHERE government_id=$1 ORDER BY version',[governmentId]);
    assert.deepEqual(versions.rows.map(row=>[Number(row.version),row.active]),[[1,false],[2,true]]);
  } finally {
    await pool.query('DELETE FROM government_tax_quotes WHERE government_id=$1',[governmentId]);
    await pool.query('DELETE FROM government_tax_policies WHERE government_id=$1',[governmentId]);
    await pool.query('DELETE FROM government_fund_accounts WHERE government_id=$1',[governmentId]);
    await pool.query('DELETE FROM world_governments WHERE government_id=$1',[governmentId]);
    if (leaderId && outsiderId) {
      const removed=await pool.query('DELETE FROM profiles WHERE id = ANY($1::uuid[]) RETURNING account_id',[ [leaderId,outsiderId] ]);
      const accountIds=removed.rows.map(row=>row.account_id).filter(Boolean);
      if(accountIds.length) await pool.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])',[accountIds]);
    }
    await pool.end();
  }
});

test('PostgreSQL seeds quotes and settles NPC sale wallet plus measured demand atomically', { skip: !databaseUrl }, async () => {
  const pool = createDatabasePool({ connectionString:databaseUrl, max:3 });
  const accounts = createPostgresStore(pool);
  const market = createEconomyStore(pool);
  let profileId = null;
  try {
    await runMigrations(pool);
    const account = await accounts.accounts.register({
      username:`econ_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      password:randomUUID(),
    });
    profileId = account.profile.id;
    await market.ensureGoods();
    await pool.query("UPDATE economy_quotes SET buy_price_bronze=51 WHERE item_id='copperIngot' AND region_id='global'");
    const quotes = await market.getQuotes();
    assert.equal(quotes.copperIngot.sellPrice, 60);
    assert.equal(quotes.copperIngot.buyPrice, 51, 'the NPC purchase quote is below the displayed resale quote');
    assert.equal(quotes.copperIngot.marketSaleTaxBps, 200);
    assert.equal(await market.refreshGovernmentTaxQuote({ force:true }), 220,
      'low treasury raises the rate gradually within the government policy limits');
    const inventory = createInventory();
    inventory.copperIngot = 3;
    await accounts.saveProgress(profileId, inventorySnapshot(inventory));
    inventory.copperIngot = 1;
    await assert.rejects(
      market.settleNpcSale({ profileId, itemId:'copperIngot', quantity:2, inventoryAfter:inventorySnapshot(inventory), expectedPriceBronze:60 }),
      /cotação mudou/,
      'a stale confirmed price cannot debit materials or credit currency',
    );
    const beforeSale = await pool.query("SELECT COALESCE(sum(quantity),0)::integer AS quantity FROM inventory_items WHERE profile_id=$1 AND item_id LIKE 'slot:%:copperIngot'", [profileId]);
    assert.equal(Number(beforeSale.rows[0].quantity), 3, 'stale quote rejection preserves inventory');
    const result = await market.settleNpcSale({ profileId, itemId:'copperIngot', quantity:2, inventoryAfter:inventorySnapshot(inventory), expectedPriceBronze:51 });
    assert.equal(result.unitPrice, 51);
    assert.equal(result.grossAmount, 102);
    assert.equal(result.taxAmount, 2);
    assert.equal(result.taxRateBps, 220);
    assert.equal(result.amount, 100);
    assert.equal(result.wallet.silver, 1);
    assert.equal(result.wallet.bronze, 0);
    inventory.copperIngot = 0;
    const smallSale = await market.settleNpcSale({ profileId, itemId:'copperIngot', quantity:1, inventoryAfter:inventorySnapshot(inventory), expectedPriceBronze:51 });
    assert.equal(smallSale.grossAmount, 51);
    assert.equal(smallSale.taxAmount, 1, 'the prior fractional tax remainder eventually becomes a whole bronze');
    assert.equal(smallSale.wallet.silver, 1);
    assert.equal(smallSale.wallet.bronze, 50);
    const taxRemainder = await pool.query(
      "SELECT remainder_numerator FROM government_tax_remainders WHERE government_id='surface:arrival' AND tax_code='market_sale'",
    );
    assert.equal(Number(taxRemainder.rows[0].remainder_numerator), 3_660);
    const saved = await pool.query(
      "SELECT COALESCE(sum(quantity),0)::integer AS quantity FROM inventory_items WHERE profile_id=$1 AND item_id LIKE 'slot:%:copperIngot'",
      [profileId],
    );
    assert.equal(Number(saved.rows[0].quantity), 0);
    const { rows } = await pool.query(
      'SELECT units_sold_to_npc, gross_bronze FROM economy_daily_flows WHERE item_id=$1 AND region_id=$2 AND flow_day=$3::date',
      ['copperIngot', 'global', gameDayKey()],
    );
    assert.deepEqual(rows.map(row => [Number(row.units_sold_to_npc), Number(row.gross_bronze)]), [[3, 153]]);
    const marketStock = await pool.query(
      "SELECT quantity FROM economy_market_stock WHERE market_id='arrival:market' AND item_id='copperIngot' AND region_id='global'",
    );
    assert.equal(Number(marketStock.rows[0].quantity), 3,
      'items sold to the NPC become actual market stock; private player inventories are not treated as supply');
    const quoteWithNoPrivateStock = await market.refreshQuotes({ force:true });
    const privateInventory = createInventory();
    privateInventory.slots = Array.from({ length:27 }, (_, slot) => slot < 20
      ? { itemId:'copperIngot', quantity:20 } : null);
    await accounts.saveProgress(profileId, inventorySnapshot(privateInventory));
    const quoteWithPrivateStock = await market.refreshQuotes({ force:true });
    assert.equal(quoteWithPrivateStock.copperIngot.stockRatio, quoteWithNoPrivateStock.copperIngot.stockRatio,
      'holding unsold materials in player slots does not change eligible market supply');
    const journal = await pool.query(
      'SELECT sum(l.amount_bronze)::bigint AS total, ' +
      "sum(l.amount_bronze) FILTER (WHERE l.account_code='government_treasury')::bigint AS tax " +
      'FROM economy_journal_lines l JOIN economy_journal_transactions t USING (transaction_id) ' +
      "WHERE t.event_type='npc_market_sale' AND t.actor_profile_id=$1",
      [profileId],
    );
    assert.equal(Number(journal.rows[0].total), 0);
    assert.equal(Number(journal.rows[0].tax), 3);
    const balance = await pool.query(
      "SELECT balance_bronze FROM government_fund_accounts WHERE government_id='surface:arrival' AND fund_code='general'",
    );
    assert.equal(Number(balance.rows[0].balance_bronze), 3);
    const raisedAgain = await market.refreshGovernmentTaxQuote({ force:true });
    await pool.query(
      "UPDATE government_fund_accounts SET balance_bronze=1000000 WHERE government_id='surface:arrival' AND fund_code='general'",
    );
    const lowered = await market.refreshGovernmentTaxQuote({ force:true });
    assert.ok(lowered < raisedAgain, 'a funded treasury gradually lowers its tax rate');
    await pool.query("UPDATE economy_money_supply_policy SET sampled_at=NULL WHERE region_id='global'");
    await market.refreshQuotes({force:true});
    const walletSupply=await pool.query(
      "SELECT COALESCE(sum(i.quantity::numeric * CASE i.item_id WHEN 'gold' THEN 10000 WHEN 'silver' THEN 100 ELSE 1 END),0)::numeric(30,0)::text AS amount " +
      "FROM inventory_items i JOIN profiles p ON p.id=i.profile_id WHERE p.is_guest=false AND i.item_id IN ('gold','silver','bronze')",
    );
    const treasurySupply=await pool.query('SELECT COALESCE(sum(balance_bronze),0)::numeric(30,0)::text AS amount FROM government_fund_accounts');
    const reserves=await pool.query('SELECT COALESCE(sum(balance_bronze),0)::numeric(30,0)::text AS amount FROM bank_reserve_accounts');
    const history=await pool.query("SELECT supply_bronze::text,circulating_supply_bronze::text,government_treasury_bronze::text,bank_reserve_bronze::text,bank_credit_outstanding_bronze::text FROM economy_money_supply_history WHERE region_id='global' AND sample_day=$1::date",[gameDayKey()]);
    assert.equal(history.rows[0].circulating_supply_bronze,walletSupply.rows[0].amount);
    assert.equal(history.rows[0].government_treasury_bronze,treasurySupply.rows[0].amount);
    assert.equal(history.rows[0].bank_reserve_bronze,reserves.rows[0].amount);
    assert.equal(history.rows[0].bank_credit_outstanding_bronze,'0');
    assert.equal(BigInt(history.rows[0].supply_bronze),BigInt(walletSupply.rows[0].amount)+BigInt(treasurySupply.rows[0].amount)+BigInt(reserves.rows[0].amount));
  } finally {
    if (profileId) {
      await pool.query(
        'DELETE FROM economy_journal_lines WHERE transaction_id IN ' +
        '(SELECT transaction_id FROM economy_journal_transactions WHERE actor_profile_id=$1)', [profileId],
      );
      await pool.query('DELETE FROM economy_journal_transactions WHERE actor_profile_id=$1', [profileId]);
      await pool.query('DELETE FROM profiles WHERE id=$1', [profileId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [profileId]);
    }
    await pool.query('DELETE FROM economy_daily_flows');
    await pool.query('DELETE FROM economy_market_stock');
    await pool.query("DELETE FROM economy_money_supply_history WHERE region_id='global'");
    await pool.query("UPDATE economy_money_supply_policy SET reference_supply_bronze=0,reference_circulating_supply_bronze=0,price_factor=1,sampled_at=NULL WHERE region_id='global'");
    await pool.query("DELETE FROM government_tax_remainders WHERE government_id='surface:arrival' AND tax_code='market_sale'");
    await pool.query('DELETE FROM economy_quotes');
    await pool.query('DELETE FROM economy_goods');
    await pool.query("UPDATE government_fund_accounts SET balance_bronze=0,reserved_bronze=0 WHERE government_id='surface:arrival' AND fund_code='general'");
    await pool.query("UPDATE government_tax_quotes SET rate_bps=200,treasury_balance_bronze=0 WHERE government_id='surface:arrival' AND tax_code='market_sale'");
    await pool.end();
  }
});

test('listed cabin transfer settles buyer, seller, government tax, ownership and key revocation atomically', { skip: !databaseUrl }, async () => {
  const pool = createDatabasePool({ connectionString:databaseUrl, max:4 });
  const accounts = createPostgresStore(pool);
  const market = createEconomyStore(pool);
  const profileIds = [];
  try {
    await runMigrations(pool);
    const makeAccount = async prefix => {
      const account = await accounts.accounts.register({
        username:`${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`, password:randomUUID(),
      });
      profileIds.push(account.profile.id);
      return account.profile.id;
    };
    const seller = await makeAccount('owner');
    const buyer = await makeAccount('buyer');
    const stats = createPropertyMarketStatisticsStore(pool);
    const period = { from:'2020-01-01T00:00:00Z', to:'2100-01-01T00:00:00Z', dimensionId:'surface', settlementId:'arrival' };
    const before = await stats.getPropertyMarketStatistics(period);
    await assert.rejects(stats.getPropertyMarketStatistics({ ...period, dimensionId:null }), { status:400 });
    await accounts.claimLodging({ profileId:seller, buildingId:'cabin-cedar-one', mode:'owned', unitCount:1, price:0 });
    await accounts.creditWallet(buyer, 10_000);
    await pool.query('INSERT INTO cabin_keys(building_id,owner_profile_id,holder_profile_id) VALUES($1,$2,$3)',
      ['cabin-cedar-one', seller, buyer]);
    await market.listOwnedProperty({ profileId:seller, buildingId:'cabin-cedar-one', askingPriceBronze:10_000 });
    assert.equal(BigInt((await stats.getPropertyMarketStatistics(period)).listings), BigInt(before.listings) + 1n);
    assert.equal((await market.getPropertyListings()).find(row => row.buildingId === 'cabin-cedar-one').askingPriceBronze, 10_000);
    await assert.rejects(market.listOwnedProperty({profileId:buyer,buildingId:'cabin-cedar-one',askingPriceBronze:10_000}),{status:403});
    await assert.rejects(market.listOwnedProperty({profileId:seller,buildingId:'cabin-cedar-one',askingPriceBronze:0}),{status:400});
    await assert.rejects(market.removePropertyListing({profileId:buyer,buildingId:'cabin-cedar-one'}),{status:403});
    await assert.rejects(market.buyListedProperty({buyerProfileId:seller,buildingId:'cabin-cedar-one'}),{status:409});
    await market.removePropertyListing({profileId:seller,buildingId:'cabin-cedar-one'});
    assert.deepEqual(await market.getPropertyListings(),[],'withdrawn listing is no longer offered');
    await assert.rejects(market.buyListedProperty({buyerProfileId:buyer,buildingId:'cabin-cedar-one'}),{status:404});
    await market.listOwnedProperty({profileId:seller,buildingId:'cabin-cedar-one',askingPriceBronze:10_000});
    const rate = await market.refreshGovernmentTaxQuote({ governmentId:'surface:arrival', taxCode:'property_transfer', force:true });
    assert.equal(rate, 220);
    const result = await market.buyListedProperty({ buyerProfileId:buyer, buildingId:'cabin-cedar-one' });
    assert.equal(result.amount, 10_000);
    assert.equal(result.taxAmount, 220);
    assert.equal(result.sellerAmount, 9_780);
    assert.equal(result.buyerWallet.gold, 0);
    assert.equal(result.sellerWallet.silver, 97);
    assert.equal(result.sellerWallet.bronze, 80);
    const claim = await accounts.findLodgingClaim(buyer);
    assert.equal(claim.profileId, buyer);
    assert.equal(claim.buildingId, 'cabin-cedar-one');
    assert.deepEqual(await accounts.getCabinKeys(seller), []);
    assert.deepEqual(await accounts.getCabinKeys(buyer), [{ buildingId:'cabin-cedar-one', unitNumber:1,
      ownerProfileId:buyer, ownerName:(await pool.query('SELECT username FROM accounts WHERE id=$1',[buyer])).rows[0].username, isOwner:true }]);
    assert.deepEqual(await market.getPropertyListings(), []);
    const transfer = await pool.query('SELECT gross_price_bronze,tax_bronze FROM property_transfer_records WHERE transfer_id=$1',
      [result.transferId]);
    assert.deepEqual(transfer.rows.map(row => [Number(row.gross_price_bronze), Number(row.tax_bronze)]), [[10_000, 220]]);
    const ledger = await pool.query('SELECT sum(amount_bronze)::bigint AS balance FROM economy_journal_lines WHERE transaction_id=(SELECT journal_transaction_id FROM property_transfer_records WHERE transfer_id=$1)',
      [result.transferId]);
    assert.equal(Number(ledger.rows[0].balance), 0);
    const after = await stats.getPropertyMarketStatistics(period);
    assert.equal(BigInt(after.sales), BigInt(before.sales) + 1n);
    assert.equal(BigInt(after.salesValueBronze), BigInt(before.salesValueBronze) + 10_000n);
    assert.equal(BigInt(after.salesTaxBronze), BigInt(before.salesTaxBronze) + 220n);
    assert.equal((await stats.getPropertyMarketStatistics({ ...period, settlementId:'unknown' })).sales, '0');
    const dimension = await stats.getPropertyMarketStatistics({ ...period, settlementId:null });
    const global = await stats.getPropertyMarketStatistics({ ...period, settlementId:null, dimensionId:null });
    assert.ok(BigInt(dimension.sales) >= BigInt(after.sales));
    assert.ok(BigInt(global.sales) >= BigInt(dimension.sales));
  } finally {
    if (profileIds.length) {
      await pool.query('DELETE FROM property_market_listings WHERE seller_profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM lodging_claims WHERE profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM cabin_keys WHERE owner_profile_id=ANY($1::uuid[]) OR holder_profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM property_transfer_records WHERE seller_profile_id=ANY($1::uuid[]) OR buyer_profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM economy_journal_lines WHERE transaction_id IN (SELECT transaction_id FROM economy_journal_transactions WHERE actor_profile_id=ANY($1::uuid[]))', [profileIds]);
      await pool.query('DELETE FROM economy_journal_transactions WHERE actor_profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM profiles WHERE id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [profileIds]);
    }
    await pool.query("DELETE FROM government_tax_remainders WHERE government_id='surface:arrival' AND tax_code='property_transfer'");
    await pool.query("UPDATE government_fund_accounts SET balance_bronze=0,reserved_bronze=0 WHERE government_id='surface:arrival' AND fund_code='general'");
    await pool.query("UPDATE government_tax_quotes SET rate_bps=200,treasury_balance_bronze=0 WHERE government_id='surface:arrival' AND tax_code IN ('market_sale','property_transfer')");
    await pool.end();
  }
});

test('lodging leases charge and renew explicitly, journal rent and release units at the end', { skip: !databaseUrl }, async () => {
  const pool = createDatabasePool({ connectionString:databaseUrl, max:4 });
  const accounts = createPostgresStore(pool), market = createEconomyStore(pool), profileIds = [];
  try {
    await runMigrations(pool);
    const createTenant = async prefix => {
      const account = await accounts.accounts.register({
        username:`${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`, password:randomUUID(),
      });
      profileIds.push(account.profile.id);
      return account.profile.id;
    };
    const tenant = await createTenant('tenant');
    const stats = createPropertyMarketStatisticsStore(pool);
    const period = { from:'2020-01-01T00:00:00Z', to:'2100-01-01T00:00:00Z', dimensionId:'surface', settlementId:'arrival' };
    const before = await stats.getPropertyMarketStatistics(period);
    await accounts.creditWallet(tenant, 5_000);
    await pool.query(
      "UPDATE government_tax_policies SET base_rate_bps=500,minimum_rate_bps=500,maximum_rate_bps=500,treasury_sensitivity_bps=0 " +
      "WHERE government_id='surface:arrival' AND tax_code='lease_income' AND version=1",
    );
    await pool.query(
      "UPDATE government_tax_quotes SET rate_bps=500,treasury_balance_bronze=0,calculated_at=now() " +
      "WHERE government_id='surface:arrival' AND tax_code='lease_income'",
    );
    const booked = await accounts.claimLodging({ profileId:tenant, buildingId:'lodging-rill-guesthouse',
      mode:'rent', unitCount:8, price:2_000, durationMs:60_000, autoRenew:true, governmentId:'surface:arrival' });
    assert.equal(booked.lease.autoRenew, true);
    assert.equal(booked.lease.periodsPaid, 1);
    assert.equal(booked.wallet.silver, 30);
    const initialCharge = await pool.query(
      "SELECT status,rent_bronze,tax_bronze FROM lodging_lease_charges WHERE lease_id=$1 ORDER BY period_number", [booked.lease.leaseId],
    );
    assert.deepEqual(initialCharge.rows.map(row => [row.status, Number(row.rent_bronze), Number(row.tax_bronze)]), [['paid',2_000,100]]);
    const dueAt = new Date(Date.now() - 500);
    await pool.query('UPDATE lodging_leases SET next_charge_at=$2 WHERE lease_id=$1', [booked.lease.leaseId, dueAt]);
    await pool.query('UPDATE lodging_claims SET expires_at=$2 WHERE profile_id=$1', [tenant, dueAt]);
    const renewed = await market.processDueLodgingLeases({ now:new Date() });
    assert.equal(renewed.length, 1);
    assert.equal(renewed[0].outcome, 'renewed');
    assert.equal(renewed[0].taxBronze, 100);
    assert.equal(renewed[0].wallet.silver, 10);
    assert.equal((await market.getLodgingLease(tenant)).periodsPaid, 2);
    await market.setLodgingAutoRenew({ profileId:tenant, autoRenew:false });
    const nextDue = new Date(renewed[0].nextChargeAt + 500);
    const ended = await market.processDueLodgingLeases({ now:nextDue });
    assert.equal(ended[0].outcome, 'ended');
    assert.equal(await accounts.findLodgingClaim(tenant), null);
    assert.equal(await market.getLodgingLease(tenant), null);
    const journal = await pool.query(
      "SELECT count(*)::integer AS count,sum(l.amount_bronze)::bigint AS balance " +
      "FROM economy_journal_transactions t JOIN economy_journal_lines l USING(transaction_id) " +
      "WHERE t.actor_profile_id=$1 AND t.event_type='lodging_rent_payment'", [tenant],
    );
    assert.equal(Number(journal.rows[0].count), 6, 'two settled periods each contain balanced payer, operator and treasury legs');
    assert.equal(Number(journal.rows[0].balance), 0);
    const treasury = await pool.query(
      "SELECT balance_bronze FROM government_fund_accounts WHERE government_id='surface:arrival' AND fund_code='general'",
    );
    assert.equal(Number(treasury.rows[0].balance_bronze), 200);
    const after = await stats.getPropertyMarketStatistics(period);
    assert.equal(BigInt(after.rentalPayments), BigInt(before.rentalPayments) + 2n);
    assert.equal(BigInt(after.rentalValueBronze), BigInt(before.rentalValueBronze) + 4_000n);
    assert.equal(BigInt(after.rentalTaxBronze), BigInt(before.rentalTaxBronze) + 200n);
  } finally {
    if (profileIds.length) {
      await pool.query('DELETE FROM lodging_lease_charges WHERE lease_id IN (SELECT lease_id FROM lodging_leases WHERE profile_id=ANY($1::uuid[]))', [profileIds]);
      await pool.query('DELETE FROM lodging_leases WHERE profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM lodging_claims WHERE profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM economy_journal_lines WHERE transaction_id IN (SELECT transaction_id FROM economy_journal_transactions WHERE actor_profile_id=ANY($1::uuid[]))', [profileIds]);
      await pool.query('DELETE FROM economy_journal_transactions WHERE actor_profile_id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM profiles WHERE id=ANY($1::uuid[])', [profileIds]);
      await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [profileIds]);
    }
    await pool.query("DELETE FROM government_tax_remainders WHERE government_id='surface:arrival' AND tax_code='lease_income'");
    await pool.query("UPDATE government_fund_accounts SET balance_bronze=0,reserved_bronze=0 WHERE government_id='surface:arrival' AND fund_code='general'");
    await pool.query("UPDATE government_tax_policies SET base_rate_bps=0,minimum_rate_bps=0,maximum_rate_bps=500,treasury_target_bronze=300000,treasury_sensitivity_bps=100 WHERE government_id='surface:arrival' AND tax_code='lease_income' AND version=1");
    await pool.query("UPDATE government_tax_quotes SET rate_bps=0,treasury_balance_bronze=0 WHERE government_id='surface:arrival' AND tax_code='lease_income'");
    await pool.end();
  }
});

test('an automatic lodging renewal fails closed and frees the room when the wallet cannot pay', { skip: !databaseUrl }, async () => {
  const pool = createDatabasePool({ connectionString:databaseUrl, max:3 });
  const accounts = createPostgresStore(pool), market = createEconomyStore(pool);
  let profileId = null, leaseId = null;
  try {
    await runMigrations(pool);
    const account = await accounts.accounts.register({ username:`poor_${randomUUID().replaceAll('-', '').slice(0, 12)}`, password:randomUUID() });
    profileId = account.profile.id;
    await accounts.creditWallet(profileId, 80);
    const booked = await accounts.claimLodging({ profileId, buildingId:'lodging-rill-guesthouse',
      mode:'rent', unitCount:8, price:40, durationMs:60_000, autoRenew:true, governmentId:'surface:arrival' });
    leaseId = booked.lease.leaseId;
    await accounts.debitWallet(profileId, 40);
    const dueAt = new Date(Date.now() - 500);
    await pool.query('UPDATE lodging_leases SET next_charge_at=$2 WHERE lease_id=$1', [leaseId, dueAt]);
    await pool.query('UPDATE lodging_claims SET expires_at=$2 WHERE profile_id=$1', [profileId, dueAt]);
    const result = await market.processDueLodgingLeases({ now:new Date() });
    assert.equal(result[0].outcome, 'payment_failed');
    assert.equal(await accounts.findLodgingClaim(profileId), null);
    const row = await pool.query('SELECT status,auto_renew FROM lodging_leases WHERE lease_id=$1', [leaseId]);
    assert.equal(row.rows[0].status, 'payment_failed');
    assert.equal(row.rows[0].auto_renew, false);
    const balance = await pool.query('SELECT item_id,quantity FROM inventory_items WHERE profile_id=$1 AND item_id=ANY($2::text[])',
      [profileId, ['gold','silver','bronze']]);
    assert.equal(balance.rows.reduce((sum,item)=>sum+Number(item.quantity),0), 0);
  } finally {
    if (profileId) {
      await pool.query('DELETE FROM lodging_lease_charges WHERE lease_id=$1', [leaseId]);
      await pool.query('DELETE FROM lodging_leases WHERE lease_id=$1', [leaseId]);
      await pool.query('DELETE FROM lodging_claims WHERE profile_id=$1', [profileId]);
      await pool.query('DELETE FROM economy_journal_lines WHERE transaction_id IN (SELECT transaction_id FROM economy_journal_transactions WHERE actor_profile_id=$1)', [profileId]);
      await pool.query('DELETE FROM economy_journal_transactions WHERE actor_profile_id=$1', [profileId]);
      await pool.query('DELETE FROM profiles WHERE id=$1', [profileId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [profileId]);
    }
    await pool.query("DELETE FROM government_tax_remainders WHERE government_id='surface:arrival' AND tax_code='lease_income'");
    await pool.query("UPDATE government_fund_accounts SET balance_bronze=0,reserved_bronze=0 WHERE government_id='surface:arrival' AND fund_code='general'");
    await pool.query("UPDATE government_tax_quotes SET rate_bps=0,treasury_balance_bronze=0 WHERE government_id='surface:arrival' AND tax_code='lease_income'");
    await pool.query("UPDATE government_tax_policies SET base_rate_bps=0,minimum_rate_bps=0,maximum_rate_bps=500,treasury_target_bronze=300000,treasury_sensitivity_bps=100 WHERE government_id='surface:arrival' AND tax_code='lease_income' AND version=1");
    await pool.end();
  }
});
