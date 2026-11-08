import { randomUUID } from 'node:crypto';
import { GAME_DAY_DURATION_MS } from '../game/day-night.mjs';
import { gameDayKey } from '../game/game-calendar.mjs';

const DEFAULT_GOVERNMENT = 'surface:arrival';
const VALID_ROLES = new Set(['minister','treasurer','auditor']);
const WINDOW_GAME_DAYS = 7;

const safeAmount = value => {
  const amount = Number(value || 0);
  return Number.isSafeInteger(amount) ? amount : null;
};

export function economyPermissions({ isLeader = false, isAdmin = false, role = null } = {}) {
  const owner = isLeader || isAdmin;
  return {
    view: owner || VALID_ROLES.has(role),
    manageTaxes: owner || role === 'minister',
    manageRoles: owner,
  };
}

function normalizeCapabilities(row) {
  if (!row) return null;
  const isLeader = row.is_leader === true;
  const isAdmin = row.is_admin === true;
  const role = isAdmin ? 'admin' : isLeader ? 'leader' : row.delegated_role;
  const permissions = economyPermissions({ isLeader,isAdmin,role:row.delegated_role });
  return permissions.view ? { role,permissions } : null;
}

async function access(client, governmentId, profileId, { lock = false } = {}) {
  if (typeof governmentId !== 'string' || !governmentId || typeof profileId !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const result = await client.query(
    `SELECT (g.leader_profile_id=actor.id) AS is_leader, (a.role='admin') AS is_admin,
            delegated.role AS delegated_role
       FROM world_governments g
       JOIN profiles actor ON actor.id=$2 AND actor.is_guest=false
       JOIN accounts a ON a.id=actor.account_id
       LEFT JOIN government_economy_roles delegated
         ON delegated.government_id=g.government_id AND delegated.profile_id=actor.id
      WHERE g.government_id=$1 AND g.status='active'` + (lock ? ' FOR UPDATE OF g' : ''),
    [governmentId,profileId],
  );
  return normalizeCapabilities(result.rows[0]);
}

async function transaction(pool, action) {
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

function intervalDays(endDay, rows) {
  const byDay = new Map(rows.map(row => [row.flow_day, row]));
  const day = Date.parse(endDay + 'T00:00:00Z');
  return Array.from({ length: WINDOW_GAME_DAYS }, (_,index) => {
    const date = new Date(day - (WINDOW_GAME_DAYS - 1 - index)*86400000).toISOString().slice(0,10);
    const value = byDay.get(date);
    return {
      day:date,
      soldToNpc:safeAmount(value?.sold_to_npc),
      boughtFromNpc:safeAmount(value?.bought_from_npc),
      grossSalesBronze:safeAmount(value?.gross_sales_bronze),
    };
  });
}

export function createEconomyManagementStore(pool) {
  async function getGovernmentEconomyPanel({
    governmentId = DEFAULT_GOVERNMENT, actorProfileId, now = new Date(),
  } = {}) {
    const capabilities = await access(pool, governmentId, actorProfileId);
    if (!capabilities) return null;
    const currentDay = gameDayKey(now.getTime());
    const since = new Date(now.getTime() - WINDOW_GAME_DAYS * GAME_DAY_DURATION_MS);
    const [fundsResult, treasuryResult, journalResult] = await Promise.all([
      pool.query(
        'SELECT fund_code,balance_bronze,reserved_bronze FROM government_fund_accounts ' +
        'WHERE government_id=$1 ORDER BY fund_code',[governmentId],
      ),
      pool.query(
        `SELECT COALESCE(sum(CASE WHEN l.amount_bronze>0 THEN l.amount_bronze ELSE 0 END),0) AS receipts,
                COALESCE(sum(CASE WHEN l.amount_bronze<0 THEN -l.amount_bronze ELSE 0 END),0) AS expenses
           FROM economy_journal_lines l JOIN economy_journal_transactions t USING(transaction_id)
          WHERE l.account_code='government_treasury' AND l.government_id=$1 AND t.occurred_at >= $2 AND t.occurred_at <= $3`,
        [governmentId,since,now],
      ),
      governmentId===DEFAULT_GOVERNMENT
        ? pool.query(
          `SELECT count(DISTINCT t.transaction_id)::bigint AS transactions,
                  COALESCE(sum(l.amount_bronze),0) AS journal_balance,
                  COALESCE(sum(CASE WHEN t.event_type='npc_market_purchase'
                    AND l.account_code='market_treasury' AND l.amount_bronze>0
                    THEN l.amount_bronze ELSE 0 END),0) AS npc_purchase_revenue
             FROM economy_journal_transactions t
             LEFT JOIN economy_journal_lines l USING(transaction_id)
            WHERE t.occurred_at >= $1 AND t.occurred_at <= $2`,
          [since,now],
        ) : Promise.resolve({rows:[{transactions:0,journal_balance:0,npc_purchase_revenue:0}]}),
    ]);
    const funds = fundsResult.rows.map(row => ({
      fundCode:row.fund_code, balanceBronze:safeAmount(row.balance_bronze),
      reservedBronze:safeAmount(row.reserved_bronze),
    }));
    const financial = treasuryResult.rows[0] || {};
    const journal = journalResult.rows[0] || {};
    let flows = [], stock = [], monetary = null;
    if (governmentId === DEFAULT_GOVERNMENT) {
      const [daily,goods,money] = await Promise.all([
        pool.query(
          `SELECT flow_day::text AS flow_day, sum(units_sold_to_npc)::bigint AS sold_to_npc,
                  sum(units_bought_from_npc)::bigint AS bought_from_npc,
                  sum(gross_bronze)::bigint AS gross_sales_bronze
             FROM economy_daily_flows
            WHERE region_id='global' AND flow_day BETWEEN $1::date - 6 AND $1::date
            GROUP BY flow_day ORDER BY flow_day`,[currentDay],
        ),
        pool.query(
          `SELECT s.item_id,s.quantity,s.reserved,q.buy_price_bronze,q.sell_price_bronze
             FROM economy_market_stock s JOIN economy_quotes q
               ON q.item_id=s.item_id AND q.region_id=s.region_id
            WHERE s.region_id='global' AND s.market_id='arrival:market'
            ORDER BY s.item_id`,
        ),
        pool.query(
          `SELECT price_factor,reference_supply_bronze::text AS reference_supply_bronze,sampled_at
             FROM economy_money_supply_policy WHERE region_id='global'`,
        ),
      ]);
      flows = intervalDays(currentDay,daily.rows);
      stock = goods.rows.map(row => ({
        itemId:row.item_id, available:safeAmount(Number(row.quantity)-Number(row.reserved)),
        reserved:safeAmount(row.reserved), buyPrice:safeAmount(row.buy_price_bronze),
        sellPrice:safeAmount(row.sell_price_bronze),
      }));
      if (money.rowCount) monetary = {
        priceFactor:Number(money.rows[0].price_factor),
        referenceSupplyBronze:safeAmount(money.rows[0].reference_supply_bronze),
        sampledAt:money.rows[0].sampled_at ? new Date(money.rows[0].sampled_at).getTime() : null,
      };
    }
    const rolesResult = capabilities.permissions.manageRoles
      ? await pool.query(
        `SELECT r.profile_id,a.username,r.role FROM government_economy_roles r
           JOIN profiles p ON p.id=r.profile_id JOIN accounts a ON a.id=p.account_id
          WHERE r.government_id=$1 ORDER BY a.username`,[governmentId],
      ) : {rows:[]};
    const summary = flows.reduce((total,day) => ({
      soldToNpc:total.soldToNpc+(day.soldToNpc||0),
      boughtFromNpc:total.boughtFromNpc+(day.boughtFromNpc||0),
      grossSalesBronze:total.grossSalesBronze+(day.grossSalesBronze||0),
    }),{soldToNpc:0,boughtFromNpc:0,grossSalesBronze:0});
    return {
      governmentId, role:capabilities.role,permissions:capabilities.permissions,
      sampledAt:now.getTime(), periodEndDay:currentDay,periodGameDays:WINDOW_GAME_DAYS,
      funds, monetary, daily:flows, stock,
      roles:rolesResult.rows.map(row=>({profileId:row.profile_id,username:row.username,role:row.role})),
      kpis:{
        ...summary,marketStock:stock.reduce((sum,item)=>sum+(item.available||0),0),
        marketVarieties:stock.filter(item=>item.available>0).length,
        npcPurchaseRevenueBronze:safeAmount(journal.npc_purchase_revenue),
        treasuryReceiptsBronze:safeAmount(financial.receipts),
        treasuryExpensesBronze:safeAmount(financial.expenses),
        transactions:safeAmount(journal.transactions),
        journalBalanceBronze:safeAmount(journal.journal_balance),
      },
    };
  }

  async function setGovernmentEconomyRole({
    governmentId = DEFAULT_GOVERNMENT,actorProfileId,username,role,
  } = {}) {
    if (typeof username!=='string' || !/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase())
        || !(VALID_ROLES.has(role) || role==='none')) {
      throw Object.assign(new Error('Informe uma conta e um cargo válidos.'),{status:400});
    }
    return transaction(pool,async client=>{
      const granted = await access(client,governmentId,actorProfileId,{lock:true});
      if (!granted?.permissions.manageRoles)
        throw Object.assign(new Error('Somente o líder pode nomear ou revogar cargos econômicos.'),{status:403});
      const target=await client.query(
        `SELECT p.id,a.username FROM profiles p JOIN accounts a ON a.id=p.account_id
           WHERE a.username=$1 AND p.is_guest=false`,[username.trim().toLowerCase()],
      );
      if (!target.rowCount)
        throw Object.assign(new Error('Conta cadastrada não encontrada.'),{status:404});
      const targetId=target.rows[0].id;
      const government=await client.query('SELECT leader_profile_id FROM world_governments WHERE government_id=$1',[governmentId]);
      if (targetId===government.rows[0]?.leader_profile_id)
        throw Object.assign(new Error('O líder já possui acesso completo ao governo.'),{status:409});
      const prior=await client.query(
        'SELECT role FROM government_economy_roles WHERE government_id=$1 AND profile_id=$2 FOR UPDATE',
        [governmentId,targetId],
      );
      const previousRole=prior.rows[0]?.role||null;
      const nextRole=role==='none'?null:role;
      if(previousRole===nextRole)return {changed:false,username:target.rows[0].username,role:nextRole};
      if(nextRole) {
        await client.query(
          `INSERT INTO government_economy_roles(government_id,profile_id,role,appointed_by) VALUES($1,$2,$3,$4)
           ON CONFLICT(government_id,profile_id) DO UPDATE
             SET role=EXCLUDED.role,appointed_by=EXCLUDED.appointed_by,updated_at=now()`,
          [governmentId,targetId,nextRole,actorProfileId],
        );
      } else {
        await client.query('DELETE FROM government_economy_roles WHERE government_id=$1 AND profile_id=$2',
          [governmentId,targetId]);
      }
      await client.query(
        `INSERT INTO government_economy_role_events(event_id,government_id,actor_profile_id,target_profile_id,previous_role,next_role)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [randomUUID(),governmentId,actorProfileId,targetId,previousRole,nextRole],
      );
      return {changed:true,username:target.rows[0].username,role:nextRole};
    });
  }

  return { getGovernmentEconomyPanel,setGovernmentEconomyRole };
}
