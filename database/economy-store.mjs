import { GAME_DAY_DURATION_MS } from '../game/day-night.mjs';
import { gameDayKey } from '../game/game-calendar.mjs';
import { randomUUID } from 'node:crypto';
import { CURRENCY_KEYS, MAX_WALLET_VALUE, TRADE_PRICES, currencyValue, formatCoins, walletFromValue } from '../game/lodging-catalog.mjs';
import { calculateDynamicQuote, calculateGovernmentTaxRate, calculateInputCost, calculateMoneySupplyPriceFactor, ECONOMY_RECIPES, MONEY_SUPPLY_POLICY } from '../game/economy.mjs';
import { addInventoryItem, canAddInventoryItems, createInventory, inventoryFromRows, inventoryRows, inventorySnapshot, removeInventoryItem } from '../game/inventory.mjs';
import { EMPTY_INVENTORY, validateInventory } from '../scripts/account-store.mjs';
import { isCabin } from '../game/cabin-access.mjs';
import { accumulateGovernmentTax } from './tax-remainders.mjs';

const REGION = 'global';
const DAY_MS = GAME_DAY_DURATION_MS;
const DEFAULT_GOVERNMENT = 'surface:arrival';

async function withTransaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}

function quoteMapFromRows(rows, marketSaleTaxBps = 0) {
  return Object.fromEntries(rows.map(row => [row.item_id, {
    buyPrice: Number(row.buy_price_bronze), sellPrice: Number(row.sell_price_bronze),
    demandRatio: Number(row.demand_ratio), stockRatio: Number(row.stock_ratio),
    inputCost: Number(row.input_cost_bronze), marketSaleTaxBps, calculatedAt: new Date(row.calculated_at).getTime(),
    moneySupplyFactor: Number(row.money_supply_factor ?? 1),
    availableStock: Number(row.available_stock ?? 0),
  }]));
}

function utcDay(date = new Date()) {
  return gameDayKey(date.getTime());
}

export function createEconomyStore(pool) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A market economy store requires a PostgreSQL pool.');
  }

  async function ensureGoods() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [itemId, basePrice] of Object.entries(TRADE_PRICES)) {
        await client.query(
          'INSERT INTO economy_goods (item_id, region_id, base_price_bronze, target_stock, expected_daily_sales, recipe) ' +
          'VALUES ($1, $2, $3, 100, 10, $4::jsonb) ON CONFLICT (item_id, region_id) DO NOTHING',
          [itemId, REGION, basePrice, JSON.stringify(ECONOMY_RECIPES[itemId] || {})],
        );
        await client.query(
          "INSERT INTO economy_quotes (item_id, region_id, buy_price_bronze, sell_price_bronze, demand_ratio, stock_ratio, calculated_at) " +
          "VALUES ($1, $2, $3, $3, 1, 1, 'epoch'::timestamptz) ON CONFLICT (item_id, region_id) DO NOTHING",
          [itemId, REGION, basePrice],
        );
        await client.query(
          'INSERT INTO economy_market_stock (market_id,item_id,region_id,quantity) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING',
          ['arrival:market', itemId, REGION],
        );
      }
      await client.query('INSERT INTO economy_money_supply_policy(region_id) VALUES($1) ON CONFLICT DO NOTHING', [REGION]);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  }

  async function getQuotes(regionId = REGION) {
    return getQuotesForGovernment(regionId, DEFAULT_GOVERNMENT);
  }

  async function getGovernmentTaxRate(governmentId = DEFAULT_GOVERNMENT) {
    const { rows } = await pool.query(
      'SELECT rate_bps FROM government_tax_quotes WHERE government_id=$1 AND tax_code=$2',
      [governmentId, 'market_sale'],
    );
    return Number(rows[0]?.rate_bps || 0);
  }

  async function getGovernmentTaxPanel({ governmentId = DEFAULT_GOVERNMENT, actorProfileId } = {}) {
    if (!actorProfileId) return null;
    const { rows } = await pool.query(
      `SELECT g.government_id,g.world_id,g.settlement_id,g.government_type,
              f.balance_bronze AS treasury_balance_bronze,
              p.tax_code,p.version,p.base_rate_bps,p.minimum_rate_bps,p.maximum_rate_bps,
              p.treasury_target_bronze,p.treasury_sensitivity_bps,
              q.rate_bps,q.calculated_at
         FROM world_governments g
         JOIN profiles actor ON actor.id=$2 JOIN accounts a ON a.id=actor.account_id
          AND (g.leader_profile_id=actor.id OR a.role='admin')
         JOIN government_fund_accounts f ON f.government_id=g.government_id AND f.fund_code='general'
         LEFT JOIN government_tax_policies p ON p.government_id=g.government_id AND p.active
         LEFT JOIN government_tax_quotes q ON q.government_id=p.government_id AND q.tax_code=p.tax_code
        WHERE g.government_id=$1 AND g.status='active'
        ORDER BY p.tax_code`, [governmentId, actorProfileId],
    );
    if (!rows.length) return null;
    const first = rows[0];
    return { governmentId:first.government_id,worldId:first.world_id,settlementId:first.settlement_id,
      governmentType:first.government_type,treasuryBalanceBronze:Number(first.treasury_balance_bronze),
      policies:rows.filter(row=>row.tax_code).map(row=>({taxCode:row.tax_code,version:Number(row.version),
        baseRateBps:Number(row.base_rate_bps),minimumRateBps:Number(row.minimum_rate_bps),
        maximumRateBps:Number(row.maximum_rate_bps),treasuryTargetBronze:Number(row.treasury_target_bronze),
        treasurySensitivityBps:Number(row.treasury_sensitivity_bps),rateBps:row.rate_bps===null?null:Number(row.rate_bps),
        calculatedAt:row.calculated_at?new Date(row.calculated_at).getTime():null})) };
  }

  async function updateGovernmentTaxPolicy({ governmentId = DEFAULT_GOVERNMENT, actorProfileId,
    taxCode, baseRateBps, minimumRateBps, maximumRateBps, treasuryTargetBronze,
    treasurySensitivityBps, now = new Date() } = {}) {
    const values = [baseRateBps,minimumRateBps,maximumRateBps,treasuryTargetBronze,treasurySensitivityBps];
    if (!actorProfileId || !['market_sale','property_transfer','lease_income'].includes(taxCode)
        || values.some(value=>!Number.isSafeInteger(value)) || minimumRateBps<0
        || maximumRateBps>10000 || minimumRateBps>baseRateBps || baseRateBps>maximumRateBps
        || treasuryTargetBronze<0 || treasurySensitivityBps<0 || treasurySensitivityBps>10000) {
      throw Object.assign(new Error('Parâmetros de imposto inválidos.'),{status:400});
    }
    return withTransaction(pool,async client=>{
      const auth=await client.query(
        `SELECT g.government_id FROM world_governments g
         JOIN profiles actor ON actor.id=$2 JOIN accounts a ON a.id=actor.account_id
          AND (g.leader_profile_id=actor.id OR a.role='admin')
         WHERE g.government_id=$1 AND g.status='active' FOR UPDATE OF g`,[governmentId,actorProfileId]);
      if(!auth.rowCount) throw Object.assign(new Error('Você não pode alterar os impostos deste governo.'),{status:403});
      const current=await client.query('SELECT version FROM government_tax_policies WHERE government_id=$1 AND tax_code=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE',[governmentId,taxCode]);
      const version=Number(current.rows[0]?.version||0)+1;
      await client.query('UPDATE government_tax_policies SET active=false WHERE government_id=$1 AND tax_code=$2 AND active',[governmentId,taxCode]);
      await client.query(
        `INSERT INTO government_tax_policies(government_id,tax_code,version,base_rate_bps,minimum_rate_bps,
          maximum_rate_bps,treasury_target_bronze,treasury_sensitivity_bps,active,effective_at,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)`,
        [governmentId,taxCode,version,baseRateBps,minimumRateBps,maximumRateBps,treasuryTargetBronze,treasurySensitivityBps,now,actorProfileId]);
      return {governmentId,taxCode,version};
    });
  }

  async function getQuotesForGovernment(regionId, governmentId) {
    const [{ rows }, rateBps] = await Promise.all([pool.query(
      'SELECT q.item_id, q.buy_price_bronze, q.sell_price_bronze, q.demand_ratio, q.stock_ratio, q.input_cost_bronze, ' +
      'q.money_supply_factor, q.calculated_at, COALESCE(s.quantity-s.reserved,0) AS available_stock ' +
      "FROM economy_quotes q LEFT JOIN economy_market_stock s ON s.item_id=q.item_id AND s.region_id=q.region_id AND s.market_id='arrival:market' " +
      'WHERE q.region_id = $1', [regionId],
    ), getGovernmentTaxRate(governmentId)]);
    return quoteMapFromRows(rows, rateBps);
  }

  async function refreshGovernmentTaxQuote({ governmentId = DEFAULT_GOVERNMENT, taxCode = 'market_sale', now = new Date(), force = false } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const policy = await client.query(
        'SELECT version, base_rate_bps, minimum_rate_bps, maximum_rate_bps, treasury_target_bronze, treasury_sensitivity_bps ' +
        'FROM government_tax_policies WHERE government_id=$1 AND tax_code=$2 AND active AND effective_at <= $3 ' +
        'ORDER BY version DESC LIMIT 1 FOR UPDATE', [governmentId, taxCode, now],
      );
      if (!policy.rowCount) throw Object.assign(new Error('Este governo ainda não definiu o imposto deste comércio.'), { status:409 });
      const current = policy.rows[0];
      const previous = await client.query(
        'SELECT rate_bps, calculated_at FROM government_tax_quotes WHERE government_id=$1 AND tax_code=$2 FOR UPDATE',
        [governmentId, taxCode],
      );
      if (!force && previous.rowCount && now.getTime() - new Date(previous.rows[0].calculated_at).getTime() < DAY_MS) {
        await client.query('COMMIT');
        return Number(previous.rows[0].rate_bps);
      }
      const treasury = await client.query(
        "SELECT balance_bronze FROM government_fund_accounts WHERE government_id=$1 AND fund_code='general' FOR UPDATE",
        [governmentId],
      );
      if (!treasury.rowCount) throw Object.assign(new Error('O tesouro deste governo não está configurado.'), { status:409 });
      const balance = Number(treasury.rows[0].balance_bronze);
      const priorRate = previous.rowCount ? Number(previous.rows[0].rate_bps) : Number(current.base_rate_bps);
      const rate = calculateGovernmentTaxRate({
        baseRateBps:Number(current.base_rate_bps),
        minimumRateBps:Number(current.minimum_rate_bps),
        maximumRateBps:Number(current.maximum_rate_bps),
        treasuryTargetBronze:Number(current.treasury_target_bronze),
        treasuryBalanceBronze:balance,
        treasurySensitivityBps:Number(current.treasury_sensitivity_bps),
        previousRateBps:priorRate,
      });
      await client.query(
        'INSERT INTO government_tax_quotes(government_id,tax_code,policy_version,rate_bps,treasury_balance_bronze,calculated_at) ' +
        'VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(government_id,tax_code) DO UPDATE SET ' +
        'policy_version=EXCLUDED.policy_version,rate_bps=EXCLUDED.rate_bps,treasury_balance_bronze=EXCLUDED.treasury_balance_bronze,' +
        'calculated_at=EXCLUDED.calculated_at',
        [governmentId, taxCode, Number(current.version), rate, balance, now],
      );
      await client.query('COMMIT');
      return rate;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  }

  async function refreshQuotes({ now = new Date(), force = false, governmentId = DEFAULT_GOVERNMENT } = {}) {
    const taxRateBps = await refreshGovernmentTaxQuote({ governmentId, now, force });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const supplyResult = await client.query(
        "WITH wallet AS (SELECT COALESCE(sum(i.quantity::numeric * CASE i.item_id WHEN 'gold' THEN 10000 WHEN 'silver' THEN 100 ELSE 1 END),0) AS amount " +
        "FROM inventory_items i JOIN profiles p ON p.id=i.profile_id WHERE p.is_guest=false AND i.item_id IN ('gold','silver','bronze')), " +
        "treasury AS (SELECT COALESCE(sum(balance_bronze::numeric),0) AS amount FROM government_fund_accounts), " +
        "bank AS (SELECT COALESCE(sum(balance_bronze::numeric),0) AS amount FROM bank_reserve_accounts), " +
        "credit AS (SELECT COALESCE(sum(outstanding_principal_bronze::numeric),0) AS amount FROM bank_loans WHERE status='active') " +
        "SELECT (wallet.amount+treasury.amount+bank.amount)::numeric(30,0)::text AS supply_bronze, " +
        "wallet.amount::numeric(30,0)::text AS circulating_bronze, treasury.amount::numeric(30,0)::text AS treasury_bronze, " +
        "bank.amount::numeric(30,0)::text AS bank_reserve_bronze, credit.amount::numeric(30,0)::text AS credit_outstanding_bronze " +
        "FROM wallet CROSS JOIN treasury CROSS JOIN bank CROSS JOIN credit",
      );
      const policyResult = await client.query(
        'SELECT reference_supply_bronze::text, reference_circulating_supply_bronze::text, price_factor, sensitivity, minimum_factor, maximum_factor, smoothing, max_daily_change, sampled_at ' +
        'FROM economy_money_supply_policy WHERE region_id=$1 FOR UPDATE', [REGION],
      );
      if (!policyResult.rowCount) throw new Error('Money supply policy is not initialized.');
      const moneyPolicy = policyResult.rows[0];
      let moneySupplyFactor = Number(moneyPolicy.price_factor);
      let moneyTargetFactor = moneySupplyFactor;
      if (!moneyPolicy.sampled_at || now.getTime() - new Date(moneyPolicy.sampled_at).getTime() >= DAY_MS) {
        const supply = BigInt(supplyResult.rows[0].circulating_bronze || '0');
        const reference = BigInt(moneyPolicy.reference_circulating_supply_bronze || '0');
        const calc = calculateMoneySupplyPriceFactor({
          currentSupplyBronze: supply,
          referenceSupplyBronze: reference,
          previousFactor: moneySupplyFactor,
          policy: {
            sensitivity: Number(moneyPolicy.sensitivity), minFactor: Number(moneyPolicy.minimum_factor),
            maxFactor: Number(moneyPolicy.maximum_factor), smoothing: Number(moneyPolicy.smoothing),
            maxDailyChange: Number(moneyPolicy.max_daily_change),
          },
        });
        moneySupplyFactor = calc.priceFactor;
        moneyTargetFactor = calc.targetFactor;
        await client.query(
          'UPDATE economy_money_supply_policy SET reference_supply_bronze=$2, reference_circulating_supply_bronze=$2, price_factor=$3, sampled_at=$4 WHERE region_id=$1',
          [REGION, calc.referenceSupplyBronze.toString(), moneySupplyFactor, now],
        );
        await client.query(
          'INSERT INTO economy_money_supply_history(region_id,sample_day,supply_bronze,reference_supply_bronze,target_factor,effective_factor,sampled_at,circulating_supply_bronze,government_treasury_bronze,bank_reserve_bronze,bank_credit_outstanding_bronze) ' +
          'VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(region_id,sample_day) DO UPDATE SET ' +
          'supply_bronze=EXCLUDED.supply_bronze,reference_supply_bronze=EXCLUDED.reference_supply_bronze,' +
          'target_factor=EXCLUDED.target_factor,effective_factor=EXCLUDED.effective_factor,sampled_at=EXCLUDED.sampled_at,' +
          'circulating_supply_bronze=EXCLUDED.circulating_supply_bronze,government_treasury_bronze=EXCLUDED.government_treasury_bronze,' +
          'bank_reserve_bronze=EXCLUDED.bank_reserve_bronze,bank_credit_outstanding_bronze=EXCLUDED.bank_credit_outstanding_bronze',
          [REGION, utcDay(now), supplyResult.rows[0].supply_bronze || '0', calc.referenceSupplyBronze.toString(), moneyTargetFactor, moneySupplyFactor, now,
            supply.toString(), supplyResult.rows[0].treasury_bronze || '0', supplyResult.rows[0].bank_reserve_bronze || '0',
            supplyResult.rows[0].credit_outstanding_bronze || '0'],
        );
      }
      const goodsResult = await client.query(
        'SELECT g.item_id, g.base_price_bronze, g.target_stock, g.expected_daily_sales, g.recipe, ' +
          'q.buy_price_bronze, q.sell_price_bronze, q.calculated_at ' +
        'FROM economy_goods g JOIN economy_quotes q USING (item_id, region_id) ' +
        'WHERE g.region_id = $1 AND g.enabled = true ORDER BY g.item_id FOR UPDATE OF q', [REGION],
      );
      const latest = goodsResult.rows.reduce((max, row) => Math.max(max, new Date(row.calculated_at).getTime()), 0);
      if (!force && latest && now.getTime() - latest < DAY_MS) {
        const cached = await client.query(
          'SELECT q.item_id, q.buy_price_bronze, q.sell_price_bronze, q.demand_ratio, q.stock_ratio, q.input_cost_bronze, ' +
          'q.money_supply_factor, q.calculated_at, COALESCE(s.quantity-s.reserved,0) AS available_stock ' +
          "FROM economy_quotes q LEFT JOIN economy_market_stock s ON s.item_id=q.item_id AND s.region_id=q.region_id AND s.market_id='arrival:market' " +
          'WHERE q.region_id = $1', [REGION],
        );
        await client.query('COMMIT');
        return quoteMapFromRows(cached.rows, taxRateBps);
      }
      const flowResult = await client.query(
        'SELECT item_id, COALESCE(sum(units_bought_from_npc), 0)::bigint AS units_bought ' +
        'FROM economy_daily_flows WHERE region_id = $1 AND flow_day >= $2::date - 6 GROUP BY item_id',
        [REGION, utcDay(now)],
      );
      const flowByItem = new Map(flowResult.rows.map(row => [row.item_id, Number(row.units_bought)]));
      const stockResult = await client.query(
        'SELECT item_id, COALESCE(sum(quantity-reserved), 0)::bigint AS quantity FROM economy_market_stock ' +
        'WHERE region_id=$1 AND item_id = ANY($2::text[]) GROUP BY item_id',
        [REGION, goodsResult.rows.map(row => row.item_id)],
      );
      const stockByItem = new Map(stockResult.rows.map(row => [row.item_id, Number(row.quantity)]));
      const previousQuotes = await client.query(
        'SELECT item_id, buy_price_bronze, sell_price_bronze, demand_ratio, stock_ratio, input_cost_bronze, money_supply_factor, calculated_at ' +
        'FROM economy_quotes WHERE region_id = $1', [REGION],
      );
      const quoteMap = quoteMapFromRows(previousQuotes.rows, taxRateBps);
      const rows = goodsResult.rows;
      // Raw inputs first; recipes reference only earlier market goods in this catalogue.
      const pending = new Map(rows.map(row => [row.item_id, row]));
      while (pending.size) {
        let advanced = false;
        for (const [itemId, row] of pending) {
          const recipe = typeof row.recipe === 'string' ? JSON.parse(row.recipe) : row.recipe;
          if (Object.keys(recipe).some(input => pending.has(input))) continue;
          const inputCost = calculateInputCost(recipe, quoteMap, TRADE_PRICES);
          const expected = Number(row.expected_daily_sales);
          const observed = flowByItem.get(itemId) || 0;
          const quote = calculateDynamicQuote({
            basePrice: Number(row.base_price_bronze),
            previousPrice: Number(row.sell_price_bronze),
            recentUnitsSold: observed,
            expectedUnitsSold: flowByItem.has(itemId) ? expected * 7 : 0,
            eligibleStock: stockByItem.get(itemId) || 0,
            targetStock: Number(row.target_stock),
            inputCost,
            moneySupplyFactor,
          });
          const sellPrice = Math.max(quote.sellPrice, quote.productionFloor);
          const buyPrice = Math.max(1, Math.min(sellPrice, Math.round(sellPrice * 0.85)));
          await client.query(
            'UPDATE economy_quotes SET buy_price_bronze=$3, sell_price_bronze=$4, demand_ratio=$5, stock_ratio=$6, ' +
            'input_cost_bronze=$7, money_supply_factor=$8, calculated_at=$9 WHERE item_id=$1 AND region_id=$2',
            [itemId, REGION, buyPrice, sellPrice, quote.demandRatio, quote.stockRatio, inputCost, moneySupplyFactor, now],
          );
          quoteMap[itemId] = { buyPrice, sellPrice };
          pending.delete(itemId);
          advanced = true;
        }
        if (!advanced) throw new Error('Economy recipe dependency cycle; refusing to update quotes.');
      }
      await client.query('COMMIT');
      const refreshed = await client.query(
        'SELECT q.item_id, q.buy_price_bronze, q.sell_price_bronze, q.demand_ratio, q.stock_ratio, q.input_cost_bronze, ' +
        'q.money_supply_factor, q.calculated_at, COALESCE(s.quantity-s.reserved,0) AS available_stock ' +
        "FROM economy_quotes q LEFT JOIN economy_market_stock s ON s.item_id=q.item_id AND s.region_id=q.region_id AND s.market_id='arrival:market' " +
        'WHERE q.region_id = $1', [REGION],
      );
      return quoteMapFromRows(refreshed.rows, taxRateBps);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  }

  async function recordSaleFlow({ itemId, quantity, grossBronze, at = new Date() }) {
    if (!TRADE_PRICES[itemId] || !Number.isSafeInteger(quantity) || quantity < 1
        || !Number.isSafeInteger(grossBronze) || grossBronze < 1) {
      throw new TypeError('Invalid NPC market sale flow.');
    }
    await pool.query(
      'INSERT INTO economy_daily_flows (item_id, region_id, flow_day, units_sold_to_npc, gross_bronze) ' +
      'VALUES ($1, $2, $3::date, $4, $5) ON CONFLICT (item_id, region_id, flow_day) DO UPDATE SET ' +
      'units_sold_to_npc = economy_daily_flows.units_sold_to_npc + EXCLUDED.units_sold_to_npc, ' +
      'gross_bronze = economy_daily_flows.gross_bronze + EXCLUDED.gross_bronze',
      [itemId, REGION, utcDay(at), quantity, grossBronze],
    );
  }

  async function settleNpcSale({ profileId, itemId, quantity, inventoryAfter, governmentId = DEFAULT_GOVERNMENT, at = new Date(), requestId = null, expectedPriceBronze = null }) {
    if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
        || !TRADE_PRICES[itemId] || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50
        || typeof governmentId !== 'string' || !governmentId
        || !inventoryAfter || typeof inventoryAfter !== 'object'
        || !Number.isSafeInteger(inventoryAfter[itemId]) || inventoryAfter[itemId] < 0) {
      throw Object.assign(new Error('Esta venda não pôde ser concluída.'), { status: 400 });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['lodging-profile', profileId]);
      const quoteResult = await client.query(
        'SELECT buy_price_bronze FROM economy_quotes WHERE item_id=$1 AND region_id=$2 FOR SHARE', [itemId, REGION],
      );
      const profile = await client.query('SELECT id FROM profiles WHERE id=$1 AND is_guest=false', [profileId]);
      if (!profile.rowCount) throw Object.assign(new Error('Crie uma conta para guardar as moedas desta venda.'), { status: 403 });
      const savedRows = await client.query(
        'SELECT item_id,quantity FROM inventory_items WHERE profile_id=$1 ORDER BY item_id FOR UPDATE',
        [profileId],
      );
      const persisted = validateInventory(inventoryFromRows(
        savedRows.rows.map(row => ({ itemId:row.item_id, quantity:Number(row.quantity) })),
        { ...EMPTY_INVENTORY, attributes:{ ...EMPTY_INVENTORY.attributes }, learnedAbilities:[...EMPTY_INVENTORY.learnedAbilities] },
      ));
      const expectedAfter = createInventory(persisted);
      if (removeInventoryItem(expectedAfter, itemId, quantity) !== quantity
          || JSON.stringify(validateInventory(expectedAfter)) !== JSON.stringify(validateInventory(inventoryAfter))) {
        throw Object.assign(new Error('A mochila mudou. Atualize a venda e tente novamente.'), { status:409 });
      }
      const unitPrice = quoteResult.rowCount ? Number(quoteResult.rows[0].buy_price_bronze) : TRADE_PRICES[itemId];
       if (expectedPriceBronze !== null && (!Number.isSafeInteger(expectedPriceBronze) || expectedPriceBronze !== unitPrice)) {
         throw Object.assign(new Error('A cotação mudou. Revise a venda antes de confirmar.'), { status:409 });
       }
      const grossAmount = unitPrice * quantity;
      if (!Number.isSafeInteger(grossAmount) || grossAmount < 1) throw Object.assign(new Error('Esta cotação não é válida.'), { status: 409 });
      const taxRule = await client.query(
        "SELECT rate_bps FROM government_tax_quotes WHERE government_id=$1 AND tax_code='market_sale'",
        [governmentId],
      );
      if (!taxRule.rowCount) throw Object.assign(new Error('O imposto desta vila não está disponível.'), { status:409 });
      const taxRateBps = Number(taxRule.rows[0].rate_bps);
      const { taxBronze:taxAmount } = await accumulateGovernmentTax(client, {
        governmentId, taxCode:'market_sale', grossBronze:grossAmount, rateBps:taxRateBps,
      });
      const amount = grossAmount - taxAmount;
      if (amount < 0) throw Object.assign(new Error('A regra de imposto não é válida.'), { status: 409 });
      const balances = await client.query(
        'SELECT item_id, quantity FROM inventory_items WHERE profile_id=$1 AND item_id=ANY($2::text[]) FOR UPDATE',
        [profileId, [...CURRENCY_KEYS]],
      );
      const wallet = Object.fromEntries(CURRENCY_KEYS.map(key => [key, 0]));
      for (const row of balances.rows) wallet[row.item_id] = Number(row.quantity);
      const nextValue = currencyValue(wallet) + amount;
      if (nextValue > MAX_WALLET_VALUE) throw Object.assign(new Error('A carteira atingiu o limite técnico de armazenamento.'), { status: 409 });
      const nextWallet = walletFromValue(nextValue);
      await client.query('DELETE FROM inventory_items WHERE profile_id=$1 AND NOT (item_id=ANY($2::text[]))', [profileId, CURRENCY_KEYS]);
      for (const { itemId: storedItem, quantity: storedQuantity } of inventoryRows(inventoryAfter)) {
        await client.query(
          'INSERT INTO inventory_items(profile_id,item_id,quantity) VALUES($1,$2,$3) ' +
          'ON CONFLICT(profile_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()',
          [profileId, storedItem, storedQuantity],
        );
      }
      for (const key of CURRENCY_KEYS) {
        await client.query(
          'INSERT INTO inventory_items(profile_id,item_id,quantity) VALUES($1,$2,$3) ' +
          'ON CONFLICT(profile_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()',
          [profileId, key, nextWallet[key]],
        );
      }
      await client.query(
        'INSERT INTO economy_market_stock(market_id,item_id,region_id,quantity) VALUES($1,$2,$3,$4) ' +
        'ON CONFLICT(market_id,item_id,region_id) DO UPDATE SET quantity=economy_market_stock.quantity+EXCLUDED.quantity,updated_at=$5',
        ['arrival:market', itemId, REGION, quantity, at],
      );
      await client.query(
        'INSERT INTO economy_daily_flows(item_id,region_id,flow_day,units_sold_to_npc,gross_bronze) ' +
        'VALUES($1,$2,$3::date,$4,$5) ON CONFLICT(item_id,region_id,flow_day) DO UPDATE SET ' +
        'units_sold_to_npc=economy_daily_flows.units_sold_to_npc+EXCLUDED.units_sold_to_npc,' +
        'gross_bronze=economy_daily_flows.gross_bronze+EXCLUDED.gross_bronze',
        [itemId, REGION, utcDay(at), quantity, grossAmount],
      );
      if (taxAmount > 0) {
        const fund = await client.query(
          "UPDATE government_fund_accounts SET balance_bronze=balance_bronze+$2,updated_at=$3 " +
          "WHERE government_id=$1 AND fund_code='general' RETURNING balance_bronze",
          [governmentId, taxAmount, at],
        );
        if (!fund.rowCount) throw Object.assign(new Error('O tesouro da vila não está disponível para receber o imposto.'), { status:409 });
      }
      const transactionId = randomUUID();
      await client.query(
        'INSERT INTO economy_journal_transactions(transaction_id,event_type,actor_profile_id,reference_id,occurred_at) ' +
        'VALUES($1,$2,$3,$4,$5)',
        [transactionId, 'npc_market_sale', profileId, itemId, at],
      );
      let lineNumber = 1;
      if (amount > 0) await client.query(
        'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,$2,$3,$4,$5)',
        [transactionId, lineNumber++, 'profile', profileId, amount],
      );
      if (taxAmount > 0) await client.query(
        'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze,government_id,fund_code) ' +
        'VALUES($1,$2,$3,NULL,$4,$5,$6)',
        [transactionId, lineNumber++, 'government_treasury', taxAmount, governmentId, 'general'],
      );
      await client.query(
        'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,$2,$3,NULL,$4)',
        [transactionId, lineNumber, 'market_treasury', -grossAmount],
      );
      await client.query('COMMIT');
      return { wallet: nextWallet, unitPrice, amount, grossAmount, taxAmount, taxRateBps };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  }

  async function settleNpcPurchase({ profileId, itemId, quantity, inventoryBefore, expectedPriceBronze, at = new Date() }) {
    if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
        || !Object.hasOwn(TRADE_PRICES, itemId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50
        || !inventoryBefore || typeof inventoryBefore !== 'object'
        || !Number.isSafeInteger(expectedPriceBronze) || expectedPriceBronze < 1) {
      throw Object.assign(new Error('Esta compra de materiais não é válida.'), { status:400 });
    }
    const expected = validateInventory(inventoryBefore);
    return withTransaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['lodging-profile', profileId]);
      const profile = await client.query('SELECT id FROM profiles WHERE id=$1 AND is_guest=false', [profileId]);
      if (!profile.rowCount) throw Object.assign(new Error('Entre com uma conta para comprar materiais.'), { status:403 });
      const quote = await client.query(
        'SELECT sell_price_bronze FROM economy_quotes WHERE item_id=$1 AND region_id=$2 FOR SHARE',
        [itemId, REGION],
      );
      const unitPrice = Number(quote.rows[0]?.sell_price_bronze);
      if (!Number.isSafeInteger(unitPrice) || unitPrice < 1 || unitPrice !== expectedPriceBronze) {
        throw Object.assign(new Error('A cotação mudou. Revise a compra antes de confirmar.'), { status:409 });
      }
      const stock = await client.query(
        "SELECT quantity-reserved AS available FROM economy_market_stock WHERE market_id='arrival:market' AND item_id=$1 AND region_id=$2 FOR UPDATE",
        [itemId, REGION],
      );
      if (!stock.rowCount || Number(stock.rows[0].available) < quantity) {
        throw Object.assign(new Error('Estoque insuficiente no balcão. Confira a disponibilidade.'), { status:409 });
      }
      const savedRows = await client.query(
        'SELECT item_id,quantity FROM inventory_items WHERE profile_id=$1 ORDER BY item_id FOR UPDATE', [profileId],
      );
      const saved = validateInventory(inventoryFromRows(
        savedRows.rows.map(row => ({ itemId:row.item_id, quantity:Number(row.quantity) })),
        { ...EMPTY_INVENTORY, attributes:{ ...EMPTY_INVENTORY.attributes }, learnedAbilities:[...EMPTY_INVENTORY.learnedAbilities] },
      ));
      if (JSON.stringify(saved) !== JSON.stringify(expected)) {
        throw Object.assign(new Error('O Inventário mudou. Atualize a compra e tente novamente.'), { status:409 });
      }
      const inventory = createInventory(saved);
      if (!canAddInventoryItems(inventory, { [itemId]:quantity })
          || addInventoryItem(inventory, itemId, quantity) !== quantity) {
        throw Object.assign(new Error('Libere espaço na mochila antes de comprar materiais.'), { status:409 });
      }
      const grossAmount = unitPrice * quantity;
      const balance = currencyValue(saved);
      if (!Number.isSafeInteger(grossAmount) || grossAmount < 1 || grossAmount > balance) {
        throw Object.assign(new Error('Você não tem moedas suficientes para esta compra.'), { status:402 });
      }
      const wallet = walletFromValue(balance - grossAmount);
      for (const key of CURRENCY_KEYS) inventory[key] = wallet[key];
      const reduced = await client.query(
        "UPDATE economy_market_stock SET quantity=quantity-$3,updated_at=$4 " +
        "WHERE market_id='arrival:market' AND item_id=$1 AND region_id=$2 AND quantity-reserved >= $3 RETURNING quantity-reserved AS available",
        [itemId, REGION, quantity, at],
      );
      if (!reduced.rowCount) {
        throw Object.assign(new Error('Estoque insuficiente no balcão. Confira a disponibilidade.'), { status:409 });
      }
      await client.query('DELETE FROM inventory_items WHERE profile_id=$1 AND NOT (item_id=ANY($2::text[]))',
        [profileId, CURRENCY_KEYS]);
      for (const { itemId:storedItem, quantity:storedQuantity } of inventoryRows(inventorySnapshot(inventory))) {
        await client.query(
          'INSERT INTO inventory_items(profile_id,item_id,quantity) VALUES($1,$2,$3) ' +
          'ON CONFLICT(profile_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()',
          [profileId, storedItem, storedQuantity],
        );
      }
      for (const key of CURRENCY_KEYS) {
        await client.query(
          'INSERT INTO inventory_items(profile_id,item_id,quantity) VALUES($1,$2,$3) ' +
          'ON CONFLICT(profile_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()',
          [profileId, key, wallet[key]],
        );
      }
      await client.query(
        'INSERT INTO economy_daily_flows(item_id,region_id,flow_day,units_bought_from_npc) VALUES($1,$2,$3::date,$4) ' +
        'ON CONFLICT(item_id,region_id,flow_day) DO UPDATE SET units_bought_from_npc=economy_daily_flows.units_bought_from_npc+EXCLUDED.units_bought_from_npc',
        [itemId, REGION, utcDay(at), quantity],
      );
      const transactionId = randomUUID();
      await client.query(
        'INSERT INTO economy_journal_transactions(transaction_id,event_type,actor_profile_id,reference_id,occurred_at) VALUES($1,$2,$3,$4,$5)',
        [transactionId, 'npc_market_purchase', profileId, itemId, at],
      );
      await client.query(
        "INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,1,'profile',$2,$3)",
        [transactionId, profileId, -grossAmount],
      );
      await client.query(
        "INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,amount_bronze) VALUES($1,2,'market_treasury',$2)",
        [transactionId, grossAmount],
      );
      return { wallet, inventory:inventorySnapshot(inventory), unitPrice, grossAmount, quantity, availableStock:Number(reduced.rows[0].available) };
    });
  }

  async function getPropertyListings() {
    const { rows } = await pool.query(
      'SELECT l.building_id, l.unit_number, l.seller_profile_id, a.username AS seller_name, ' +
      'l.government_id, l.asking_price_bronze, l.listed_at ' +
      'FROM property_market_listings l JOIN profiles p ON p.id=l.seller_profile_id ' +
      'JOIN accounts a ON a.id=p.account_id ORDER BY l.listed_at, l.building_id',
    );
    return rows.filter(row => isCabin(row.building_id)).map(row => ({
      buildingId: row.building_id, unitNumber: Number(row.unit_number), sellerProfileId: row.seller_profile_id,
      sellerName: row.seller_name, governmentId: row.government_id,
      askingPriceBronze: Number(row.asking_price_bronze), listedAt: new Date(row.listed_at).getTime(),
    }));
  }

  async function listOwnedProperty({ profileId, buildingId, askingPriceBronze, governmentId = DEFAULT_GOVERNMENT }) {
    if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId) || !isCabin(buildingId)
        || !Number.isSafeInteger(askingPriceBronze) || askingPriceBronze < 1 || askingPriceBronze > 9_999_999) {
      throw Object.assign(new Error('Informe um preço válido para uma propriedade sua.'), { status:400 });
    }
    return withTransaction(pool, async client => {
      const claim = await client.query(
        "SELECT unit_number FROM lodging_claims WHERE profile_id=$1 AND building_id=$2 AND mode='owned' FOR UPDATE",
        [profileId, buildingId],
      );
      if (!claim.rowCount) throw Object.assign(new Error('Somente o proprietário pode anunciar esta cabana.'), { status:403 });
      const unitNumber = Number(claim.rows[0].unit_number);
      await client.query(
        'INSERT INTO property_market_listings(building_id,unit_number,seller_profile_id,government_id,asking_price_bronze) ' +
        'VALUES($1,$2,$3,$4,$5) ON CONFLICT(building_id,unit_number) DO UPDATE SET ' +
        'seller_profile_id=EXCLUDED.seller_profile_id,government_id=EXCLUDED.government_id,' +
        'asking_price_bronze=EXCLUDED.asking_price_bronze,listed_at=now(),updated_at=now()',
        [buildingId, unitNumber, profileId, governmentId, askingPriceBronze],
      );
      return { buildingId, unitNumber, askingPriceBronze };
    });
  }

  async function removePropertyListing({ profileId, buildingId }) {
    if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId) || !isCabin(buildingId))
      throw Object.assign(new Error('Anúncio de propriedade inválido.'), { status:400 });
    const result = await pool.query(
      'DELETE FROM property_market_listings WHERE building_id=$1 AND seller_profile_id=$2 RETURNING unit_number',
      [buildingId, profileId],
    );
    if (!result.rowCount) throw Object.assign(new Error('Este anúncio não pertence a você ou já foi retirado.'), { status:403 });
    return { buildingId, unitNumber: Number(result.rows[0].unit_number) };
  }

  async function buyListedProperty({ buyerProfileId, buildingId, governmentId = DEFAULT_GOVERNMENT, at = new Date(), requestId = null, expectedPriceBronze = null }) {
    if (typeof buyerProfileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(buyerProfileId) || !isCabin(buildingId))
      throw Object.assign(new Error('Compra de propriedade inválida.'), { status:400 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const initial = await client.query(
        requestId ? "SELECT seller_profile_id FROM property_purchase_requests WHERE request_id=$2 AND buyer_profile_id=$3 AND building_id=$1 AND status='quoted'" : 'SELECT seller_profile_id FROM property_market_listings WHERE building_id=$1', requestId ? [buildingId,requestId,buyerProfileId] : [buildingId],
      );
      if (!initial.rowCount) throw Object.assign(new Error('Esta propriedade não está à venda.'), { status:404 });
      const sellerProfileId = initial.rows[0].seller_profile_id;
      if (sellerProfileId === buyerProfileId) throw Object.assign(new Error('Você já é dono desta propriedade.'), { status:409 });
      for (const profileId of [buyerProfileId, sellerProfileId].sort()) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['lodging-profile', profileId]);
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['property-market', buildingId]);
      const listing = await client.query(
        requestId ? "SELECT seller_profile_id,'surface:arrival' AS government_id,asking_price_bronze,unit_number FROM property_purchase_requests WHERE building_id=$1 AND request_id=$2 AND buyer_profile_id=$3 AND status='quoted' FOR UPDATE" :
        'SELECT seller_profile_id,government_id,asking_price_bronze,unit_number FROM property_market_listings WHERE building_id=$1 FOR UPDATE', requestId ? [buildingId,requestId,buyerProfileId] : [buildingId],
      );
      if (!listing.rowCount || listing.rows[0].seller_profile_id !== sellerProfileId)
        throw Object.assign(new Error('O anúncio mudou. Consulte a placa e tente novamente.'), { status:409 });
      const government = listing.rows[0].government_id || governmentId;
      if (government !== governmentId) throw Object.assign(new Error('O governo responsável por esta venda mudou. Atualize o anúncio.'), { status:409 });
      const amount = Number(listing.rows[0].asking_price_bronze), unitNumber = Number(listing.rows[0].unit_number);
      const buyer = await client.query('SELECT id FROM profiles WHERE id=$1 AND is_guest=false', [buyerProfileId]);
      const seller = await client.query('SELECT id FROM profiles WHERE id=$1 AND is_guest=false', [sellerProfileId]);
      if (!buyer.rowCount || !seller.rowCount) throw Object.assign(new Error('Uma das contas não pode concluir esta negociação.'), { status:403 });
      const ownership = await client.query(
        "SELECT profile_id FROM lodging_claims WHERE building_id=$1 AND unit_number=$2 AND mode='owned' FOR UPDATE",
        [buildingId, unitNumber],
      );
      if (!ownership.rowCount || ownership.rows[0].profile_id !== sellerProfileId)
        throw Object.assign(new Error('O anúncio não corresponde ao proprietário atual.'), { status:409 });
      if(expectedPriceBronze!==null && expectedPriceBronze!==amount)throw Object.assign(new Error('O preço mudou. Revise a proposta novamente.'),{status:409});
      const tenant=await client.query("SELECT 1 FROM lodging_leases WHERE building_id=$1 AND status='active' AND next_charge_at>now()",[buildingId]);
      if(tenant.rowCount)throw Object.assign(new Error('A propriedade está alugada. Aguarde o fim do contrato antes de transferir.'),{status:409});
      const taxRule = await client.query(
        "SELECT rate_bps FROM government_tax_quotes WHERE government_id=$1 AND tax_code='property_transfer'", [government],
      );
      if (!taxRule.rowCount) throw Object.assign(new Error('O imposto de transferência deste governo não está configurado.'), { status:409 });
      const taxRateBps = Number(taxRule.rows[0].rate_bps);
      const { taxBronze:taxAmount } = await accumulateGovernmentTax(client, {
        governmentId:government, taxCode:'property_transfer', grossBronze:amount, rateBps:taxRateBps,
      });
      const sellerAmount = amount - taxAmount;
      const balances = await client.query(
        'SELECT profile_id,item_id,quantity FROM inventory_items WHERE profile_id=ANY($1::uuid[]) AND item_id=ANY($2::text[]) FOR UPDATE',
        [[buyerProfileId, sellerProfileId], CURRENCY_KEYS],
      );
      const walletFor = profileId => {
        const wallet = Object.fromEntries(CURRENCY_KEYS.map(key => [key, 0]));
        for (const row of balances.rows) if (row.profile_id === profileId) wallet[row.item_id] = Number(row.quantity);
        return wallet;
      };
      const buyerWallet = walletFor(buyerProfileId), sellerWallet = walletFor(sellerProfileId);
      const buyerValue = currencyValue(buyerWallet), sellerValue = currencyValue(sellerWallet);
      if (buyerValue < amount) throw Object.assign(new Error(`Faltam ${formatCoins(amount - buyerValue)} para comprar esta propriedade.`), { status:402 });
      if (sellerValue + sellerAmount > MAX_WALLET_VALUE) throw Object.assign(new Error('A carteira do vendedor atingiu o limite técnico de armazenamento.'), { status:409 });
      const nextBuyer = walletFromValue(buyerValue - amount), nextSeller = walletFromValue(sellerValue + sellerAmount);
      for (const [profileId, wallet] of [[buyerProfileId, nextBuyer], [sellerProfileId, nextSeller]]) {
        for (const key of CURRENCY_KEYS) await client.query(
          'INSERT INTO inventory_items(profile_id,item_id,quantity) VALUES($1,$2,$3) ' +
          'ON CONFLICT(profile_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()',
          [profileId, key, wallet[key]],
        );
      }
      if (taxAmount > 0) {
        const fund = await client.query(
          "UPDATE government_fund_accounts SET balance_bronze=balance_bronze+$2,updated_at=$3 " +
          "WHERE government_id=$1 AND fund_code='general' RETURNING balance_bronze", [government, taxAmount, at],
        );
        if (!fund.rowCount) throw Object.assign(new Error('O tesouro do governo não está disponível.'), { status:409 });
      }
      await client.query('UPDATE lodging_claims SET profile_id=$3 WHERE building_id=$1 AND unit_number=$2 AND mode=\'owned\'',
        [buildingId, unitNumber, buyerProfileId]);
      await client.query('UPDATE rooms SET owner_profile_id=$2 WHERE lodging_key=$1', [`${buildingId}:owned:${unitNumber}`, buyerProfileId]);
      await client.query('DELETE FROM cabin_keys WHERE building_id=$1', [buildingId]);
      await client.query('DELETE FROM property_market_listings WHERE building_id=$1', [buildingId]);
      await client.query('DELETE FROM property_rental_listings WHERE building_id=$1',[buildingId]);
      await client.query("UPDATE property_purchase_requests SET status=CASE WHEN request_id=$2::uuid THEN 'completed' ELSE 'declined' END,updated_at=now() WHERE building_id=$1 AND status IN ('requested','quoted')",[buildingId,requestId]);
      const transactionId = randomUUID();
      await client.query(
        'INSERT INTO economy_journal_transactions(transaction_id,event_type,actor_profile_id,reference_id,occurred_at) VALUES($1,$2,$3,$4,$5)',
        [transactionId, 'property_transfer', buyerProfileId, `${buildingId}:${unitNumber}`, at],
      );
      let line = 1;
      await client.query('INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,$2,$3,$4,$5)',
        [transactionId, line++, 'profile', buyerProfileId, -amount]);
      if (sellerAmount > 0) await client.query('INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,$2,$3,$4,$5)',
        [transactionId, line++, 'profile', sellerProfileId, sellerAmount]);
      if (taxAmount > 0) await client.query(
        'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze,government_id,fund_code) VALUES($1,$2,$3,NULL,$4,$5,$6)',
        [transactionId, line, 'government_treasury', taxAmount, government, 'general'],
      );
      const transferId = randomUUID();
      await client.query(
        'INSERT INTO property_transfer_records(transfer_id,building_id,unit_number,seller_profile_id,buyer_profile_id,government_id,gross_price_bronze,tax_bronze,journal_transaction_id,transferred_at) ' +
        'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [transferId, buildingId, unitNumber, sellerProfileId, buyerProfileId, government, amount, taxAmount, transactionId, at],
      );
      await client.query('COMMIT');
      return { transferId, buildingId, unitNumber, sellerProfileId, buyerProfileId, amount, sellerAmount, taxAmount, taxRateBps,
        buyerWallet: nextBuyer, sellerWallet: nextSeller };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  }

  async function getLodgingLeases(profileId, leaseId = null, selector = {}) {
    if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return [];
    const { rows } = await pool.query(
      "SELECT lease_id,profile_id,building_id,unit_number,government_id,rent_bronze,period_ms,periods_paid," +
      "next_charge_at,auto_renew,status FROM lodging_leases WHERE profile_id=$1 AND status='active' AND ($2::uuid IS NULL OR lease_id=$2) AND ($3::text IS NULL OR building_id=$3) AND ($4::integer IS NULL OR unit_number=$4) ORDER BY created_at,lease_id", [profileId, leaseId, selector.buildingId || null, selector.unitNumber || null],
    );
    return rows.map(row=>({ leaseId:row.lease_id, profileId:row.profile_id, buildingId:row.building_id,
      unitNumber:Number(row.unit_number), governmentId:row.government_id, rentBronze:Number(row.rent_bronze),
      periodMs:Number(row.period_ms), periodsPaid:Number(row.periods_paid),
      nextChargeAt:new Date(row.next_charge_at).getTime(), autoRenew:row.auto_renew, status:row.status }));
  }

  async function getLodgingLease(...args) { return (await getLodgingLeases(...args))[0] || null; }

  async function setLodgingAutoRenew({ profileId, autoRenew, leaseId = null }) {
    if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId) || typeof autoRenew !== 'boolean')
      throw Object.assign(new Error('Configuração de renovação inválida.'), { status:400 });
    return withTransaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['lodging-profile', profileId]);
      const lease = await client.query(
        "SELECT lease_id,building_id,unit_number,rent_bronze,period_ms,periods_paid,next_charge_at,auto_renew,government_id " +
        "FROM lodging_leases WHERE profile_id=$1 AND status='active' AND ($2::uuid IS NULL OR lease_id=$2) FOR UPDATE", [profileId, leaseId],
      );
      if (lease.rowCount > 1) throw Object.assign(new Error('Escolha qual quarto deseja alterar.'), { status:400 });
      if (!lease.rowCount) throw Object.assign(new Error('Você não tem um aluguel ativo para alterar.'), { status:404 });
      const updated = await client.query(
        "UPDATE lodging_leases SET auto_renew=$2,updated_at=now() WHERE lease_id=$1 RETURNING auto_renew",
        [lease.rows[0].lease_id, autoRenew],
      );
      const row = lease.rows[0];
      return { leaseId:row.lease_id, profileId, buildingId:row.building_id, unitNumber:Number(row.unit_number),
        governmentId:row.government_id, rentBronze:Number(row.rent_bronze), periodMs:Number(row.period_ms),
        periodsPaid:Number(row.periods_paid), nextChargeAt:new Date(row.next_charge_at).getTime(),
        autoRenew:updated.rows[0].auto_renew, status:'active' };
    });
  }

  async function processDueLodgingLeases({ now = new Date(), limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
    const dueGovernments = await pool.query(
      "SELECT DISTINCT government_id FROM lodging_leases WHERE status='active' AND next_charge_at<=$1 ORDER BY government_id",
      [now],
    );
    for (const { government_id:governmentId } of dueGovernments.rows)
      await refreshGovernmentTaxQuote({ governmentId, taxCode:'lease_income', now });
    return withTransaction(pool, async client => {
      const due = await client.query(
        "SELECT l.lease_id,l.profile_id,l.building_id,l.unit_number,l.government_id,l.rent_bronze,l.period_ms," +
        "l.periods_paid,l.next_charge_at,l.auto_renew,l.landlord_profile_id,c.expires_at FROM lodging_leases l " +
        "LEFT JOIN lodging_claims c ON c.profile_id=l.profile_id AND c.building_id=l.building_id " +
        "AND c.unit_number=l.unit_number AND c.mode='rent' WHERE l.status='active' AND l.next_charge_at<=$1 " +
        "ORDER BY l.next_charge_at LIMIT $2 FOR UPDATE OF l SKIP LOCKED", [now, safeLimit],
      );
      const outcomes = [];
      for (const row of due.rows) {
        let walletsAvailable=true;
        for(const id of [...new Set([row.profile_id,row.landlord_profile_id].filter(Boolean))].sort()){
          const lock=await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1),hashtext($2)) AS acquired',['lodging-profile',id]);if(!lock.rows[0].acquired){walletsAvailable=false;break;}
        }
        if(!walletsAvailable)continue;
        const leaseId = row.lease_id, profileId = row.profile_id;
        const unitNumber = Number(row.unit_number), periodNumber = Number(row.periods_paid) + 1;
        const dueAt = new Date(row.next_charge_at), rent = Number(row.rent_bronze), periodMs = Number(row.period_ms);
        const claimExists = row.expires_at && new Date(row.expires_at).getTime() <= now.getTime() + 1000;
        const missedMoreThanOnePeriod = now.getTime() - dueAt.getTime() >= periodMs;
        if (!row.expires_at || !row.auto_renew || missedMoreThanOnePeriod || !claimExists) {
          const status = row.auto_renew && missedMoreThanOnePeriod ? 'payment_failed' : 'ended';
          await client.query('UPDATE lodging_leases SET status=$2,auto_renew=false,ended_at=$3,updated_at=$3 WHERE lease_id=$1',
            [leaseId, status, now]);
          await client.query(
            'INSERT INTO lodging_lease_charges(charge_id,lease_id,period_number,due_at,status,rent_bronze,tax_bronze) ' +
            'VALUES($1,$2,$3,$4,$5,0,0) ON CONFLICT(lease_id,period_number) DO NOTHING',
            [randomUUID(), leaseId, periodNumber, dueAt, status === 'ended' ? 'expired' : 'failed'],
          );
          await client.query('DELETE FROM lodging_claims WHERE profile_id=$1 AND building_id=$2 AND unit_number=$3 AND mode=\'rent\'',
            [profileId, row.building_id, unitNumber]);
          outcomes.push({ outcome:status, leaseId, profileId, buildingId:row.building_id, unitNumber });
          continue;
        }
        const walletRows = await client.query(
          'SELECT item_id,quantity FROM inventory_items WHERE profile_id=$1 AND item_id=ANY($2::text[]) FOR UPDATE',
          [profileId, CURRENCY_KEYS],
        );
        const wallet = Object.fromEntries(CURRENCY_KEYS.map(key => [key, 0]));
        for (const item of walletRows.rows) wallet[item.item_id] = Number(item.quantity);
        const balance = currencyValue(wallet);
        if (balance < rent) {
          await client.query("UPDATE lodging_leases SET status='payment_failed',auto_renew=false,ended_at=$2,updated_at=$2 WHERE lease_id=$1",
            [leaseId, now]);
          await client.query(
            "INSERT INTO lodging_lease_charges(charge_id,lease_id,period_number,due_at,status,rent_bronze,tax_bronze) " +
            "VALUES($1,$2,$3,$4,'failed',0,0) ON CONFLICT(lease_id,period_number) DO NOTHING",
            [randomUUID(), leaseId, periodNumber, dueAt],
          );
          await client.query("DELETE FROM lodging_claims WHERE profile_id=$1 AND building_id=$2 AND unit_number=$3 AND mode='rent'",
            [profileId, row.building_id, unitNumber]);
          outcomes.push({ outcome:'payment_failed', leaseId, profileId, buildingId:row.building_id, unitNumber });
          continue;
        }
        const quote = await client.query(
          "SELECT rate_bps FROM government_tax_quotes WHERE government_id=$1 AND tax_code='lease_income'", [row.government_id],
        );
        if (!quote.rowCount) throw Object.assign(new Error('A política de imposto de aluguel está ausente.'), { status:409 });
        const rateBps = Number(quote.rows[0].rate_bps);
        const { taxBronze:tax } = await accumulateGovernmentTax(client, {
          governmentId:row.government_id, taxCode:'lease_income', grossBronze:rent, rateBps,
        });
        const proceeds = rent - tax, nextWallet = walletFromValue(balance - rent);
        if(row.landlord_profile_id){
          const credit=await client.query('SELECT item_id,quantity FROM inventory_items WHERE profile_id=$1 AND item_id=ANY($2::text[]) FOR UPDATE',[row.landlord_profile_id,CURRENCY_KEYS]);
          const wallet=Object.fromEntries(credit.rows.map(r=>[r.item_id,Number(r.quantity)]));
          const next=walletFromValue(currencyValue(wallet)+proceeds);
          for(const key of CURRENCY_KEYS)await client.query('INSERT INTO inventory_items(profile_id,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(profile_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()',[row.landlord_profile_id,key,next[key]]);
        }

        for (const key of CURRENCY_KEYS) await client.query(
          'INSERT INTO inventory_items(profile_id,item_id,quantity) VALUES($1,$2,$3) ' +
          'ON CONFLICT(profile_id,item_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=now()', [profileId, key, nextWallet[key]],
        );
        if (tax > 0) {
          const fund = await client.query(
            "UPDATE government_fund_accounts SET balance_bronze=balance_bronze+$2,updated_at=$3 " +
            "WHERE government_id=$1 AND fund_code='general' RETURNING balance_bronze", [row.government_id, tax, now],
          );
          if (!fund.rowCount) throw Object.assign(new Error('O tesouro deste governo não está disponível.'), { status:409 });
        }
        const transactionId = randomUUID();
        await client.query(
          'INSERT INTO economy_journal_transactions(transaction_id,event_type,actor_profile_id,reference_id,occurred_at) VALUES($1,$2,$3,$4,$5)',
          [transactionId, 'lodging_rent_payment', profileId, `${row.building_id}:${unitNumber}:${periodNumber}`, now],
        );
        await client.query(
          'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,1,$2,$3,$4)',
          [transactionId, 'profile', profileId, -rent],
        );
        let lineNumber = 2;
        if (proceeds > 0) await client.query(
          'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,$2,$3,$4,$5)',
          [transactionId, lineNumber++, row.landlord_profile_id?'profile':'market_treasury', row.landlord_profile_id || null, proceeds],
        );
        if (tax > 0) await client.query(
          'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze,government_id,fund_code) VALUES($1,$2,$3,NULL,$4,$5,$6)',
          [transactionId, lineNumber, 'government_treasury', tax, row.government_id, 'general'],
        );
        const nextDue = new Date(dueAt.getTime() + periodMs);
        await client.query(
          'UPDATE lodging_claims SET expires_at=$4 WHERE profile_id=$1 AND building_id=$2 AND unit_number=$3 AND mode=\'rent\'',
          [profileId, row.building_id, unitNumber, nextDue],
        );
        await client.query(
          'UPDATE lodging_leases SET periods_paid=$2,next_charge_at=$3,updated_at=$4 WHERE lease_id=$1',
          [leaseId, periodNumber, nextDue, now],
        );
        await client.query(
          "INSERT INTO lodging_lease_charges(charge_id,lease_id,period_number,due_at,status,rent_bronze,tax_bronze,journal_transaction_id,processed_at) " +
          "VALUES($1,$2,$3,$4,'paid',$5,$6,$7,$8)",
          [randomUUID(), leaseId, periodNumber, dueAt, rent, tax, transactionId, now],
        );
        outcomes.push({ outcome:'renewed', leaseId, profileId, landlordProfileId:row.landlord_profile_id || null, buildingId:row.building_id, unitNumber,
          rentBronze:rent, taxBronze:tax, wallet:nextWallet, nextChargeAt:nextDue.getTime() });
      }
      return outcomes;
    });
  }

  return { ensureGoods, getQuotes, refreshQuotes, refreshGovernmentTaxQuote, getGovernmentTaxPanel, updateGovernmentTaxPolicy, recordSaleFlow, settleNpcSale, settleNpcPurchase,
    getPropertyListings, listOwnedProperty, removePropertyListing, buyListedProperty,
    getLodgingLease, getLodgingLeases, setLodgingAutoRenew, processDueLodgingLeases };
}
