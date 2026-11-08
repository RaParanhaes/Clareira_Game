import { randomUUID } from 'node:crypto';
import { GAME_DAY_DURATION_MS } from '../game/day-night.mjs';
import { gameDayKey } from '../game/game-calendar.mjs';

const DEFAULT_GOVERNMENT = 'surface:arrival';
const VALID_ROLES = new Set(['minister','treasurer','auditor']);
const WINDOW_GAME_DAYS = 7;
const FUNDS = Object.freeze(['general','donations','materials','construction','territory','diplomacy']);
const PROJECT_FUNDS = Object.freeze({donation:'donations',material_purchase:'materials',construction:'construction',territory_expansion:'territory',diplomacy:'diplomacy'});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const operationError = (message,status=409) => Object.assign(new Error(message),{status});

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
    manageFunds: owner || role === 'treasurer',
    proposeProjects: owner || role === 'minister' || role === 'treasurer',
    approveProjects: owner,
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
  async function listAuthorizedEconomyGovernments({actorProfileId}={}) {
    if (typeof actorProfileId!=='string' || !UUID.test(actorProfileId)) return [];
    const {rows}=await pool.query(
      `SELECT g.government_id,g.world_id,g.settlement_id,g.government_type,
              g.leader_profile_id=a.id AS is_leader
         FROM world_governments g
         JOIN profiles a ON a.id=$1 AND a.is_guest=false
         JOIN accounts account ON account.id=a.account_id
         LEFT JOIN government_economy_roles delegate
           ON delegate.government_id=g.government_id AND delegate.profile_id=a.id
        WHERE g.status='active'
          AND (g.leader_profile_id=a.id OR account.role='admin' OR delegate.role IN ('minister','treasurer','auditor'))
        ORDER BY g.world_id,g.government_type,g.settlement_id LIMIT 50`,
      [actorProfileId],
    );
    return rows.map(row=>({
      governmentId:row.government_id,worldId:row.world_id,
      settlementId:row.settlement_id,governmentType:row.government_type,
    }));
  }

  async function getGovernmentEconomyPanel({
    governmentId = DEFAULT_GOVERNMENT, actorProfileId, now = new Date(),
  } = {}) {
    const capabilities = await access(pool, governmentId, actorProfileId);
    if (!capabilities) return null;
    const currentDay = gameDayKey(now.getTime());
    const since = new Date(now.getTime() - WINDOW_GAME_DAYS * GAME_DAY_DURATION_MS);
    const [fundsResult, treasuryResult, journalResult, metadata, projectsResult, transfersResult, governments] = await Promise.all([
      pool.query(
        'SELECT fund_code,balance_bronze,reserved_bronze FROM government_fund_accounts ' +
        'WHERE government_id=$1 ORDER BY fund_code',[governmentId],
      ),
      pool.query(
        `SELECT COALESCE(sum(CASE WHEN l.amount_bronze>0 THEN l.amount_bronze ELSE 0 END),0) AS receipts,
                COALESCE(sum(CASE WHEN l.amount_bronze<0 THEN -l.amount_bronze ELSE 0 END),0) AS expenses
           FROM economy_journal_lines l JOIN economy_journal_transactions t USING(transaction_id)
          WHERE l.account_code='government_treasury' AND l.government_id=$1
            AND t.event_type <> 'government_fund_transfer'
            AND t.occurred_at >= $2 AND t.occurred_at <= $3`,
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
        ) : pool.query(
          `SELECT count(DISTINCT t.transaction_id)::bigint AS transactions
             FROM economy_journal_lines l JOIN economy_journal_transactions t USING(transaction_id)
            WHERE l.account_code='government_treasury' AND l.government_id=$1
              AND t.occurred_at >= $2 AND t.occurred_at <= $3`,[governmentId,since,now],
        ),
      pool.query(
        `SELECT g.world_id,g.settlement_id,g.government_type,
                territory.parent_government_id,
                issuance.treasury_amount_bronze AS initial_treasury_bronze,
                budget.starting_treasury_bronze AS template_treasury_bronze
           FROM world_governments g
           LEFT JOIN government_territory_state territory ON territory.government_id=g.government_id
           LEFT JOIN government_initial_budget_issuances issuance ON issuance.government_id=g.government_id
           LEFT JOIN government_budget_templates budget
             ON budget.world_id=g.world_id AND budget.government_type=g.government_type AND budget.active
          WHERE g.government_id=$1 AND g.status='active'`,[governmentId],
      ),
      pool.query(
        `SELECT project_id,project_type,fund_code,title,budget_bronze,spent_bronze,status,created_at
           FROM government_projects WHERE government_id=$1
          ORDER BY created_at DESC,project_id LIMIT 20`,[governmentId],
      ),
      pool.query(
        `SELECT request_id,from_fund,to_fund,amount_bronze,created_at
           FROM government_fund_transfers WHERE government_id=$1
          ORDER BY created_at DESC LIMIT 10`,[governmentId],
      ),
      listAuthorizedEconomyGovernments({actorProfileId}),
    ]);
    const funds = fundsResult.rows.map(row => ({
      fundCode:row.fund_code, balanceBronze:safeAmount(row.balance_bronze),
      reservedBronze:safeAmount(row.reserved_bronze),
    }));
    const financial = treasuryResult.rows[0] || {};
    const gov = metadata.rows[0] || {};
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
    const summary = governmentId===DEFAULT_GOVERNMENT
      ? flows.reduce((total,day) => ({
        soldToNpc:total.soldToNpc+(day.soldToNpc||0),
        boughtFromNpc:total.boughtFromNpc+(day.boughtFromNpc||0),
        grossSalesBronze:total.grossSalesBronze+(day.grossSalesBronze||0),
      }),{soldToNpc:0,boughtFromNpc:0,grossSalesBronze:0})
      : {soldToNpc:null,boughtFromNpc:null,grossSalesBronze:null};
    return {
      governmentId,worldId:gov.world_id,settlementId:gov.settlement_id,
      governmentType:gov.government_type,parentGovernmentId:gov.parent_government_id,
      initialTreasuryBronze:gov.initial_treasury_bronze===null?null:safeAmount(gov.initial_treasury_bronze),
      budgetTemplateBronze:gov.template_treasury_bronze===null?null:safeAmount(gov.template_treasury_bronze),
      governments, role:capabilities.role,permissions:capabilities.permissions,
      sampledAt:now.getTime(), periodEndDay:currentDay,periodGameDays:WINDOW_GAME_DAYS,
      funds, monetary, daily:flows, stock,
      projects:projectsResult.rows.map(row=>({
        projectId:row.project_id,projectType:row.project_type,fundCode:row.fund_code,
        title:row.title,budgetBronze:safeAmount(row.budget_bronze),
        spentBronze:safeAmount(row.spent_bronze),status:row.status,createdAt:new Date(row.created_at).getTime(),
      })),
      transfers:transfersResult.rows.map(row=>({
        requestId:row.request_id,fromFund:row.from_fund,toFund:row.to_fund,
        amountBronze:safeAmount(row.amount_bronze),createdAt:new Date(row.created_at).getTime(),
      })),
      roles:rolesResult.rows.map(row=>({profileId:row.profile_id,username:row.username,role:row.role})),
      kpis:{
        ...summary,
        marketStock:governmentId===DEFAULT_GOVERNMENT?stock.reduce((sum,item)=>sum+(item.available||0),0):null,
        marketVarieties:governmentId===DEFAULT_GOVERNMENT?stock.filter(item=>item.available>0).length:null,
        npcPurchaseRevenueBronze:governmentId===DEFAULT_GOVERNMENT?safeAmount(journal.npc_purchase_revenue):null,
        treasuryReceiptsBronze:safeAmount(financial.receipts),
        treasuryExpensesBronze:safeAmount(financial.expenses),
        transactions:safeAmount(journal.transactions),
        journalBalanceBronze:governmentId===DEFAULT_GOVERNMENT?safeAmount(journal.journal_balance):null,
      },
    };
  }

  async function transferGovernmentFunds({
    governmentId=DEFAULT_GOVERNMENT,actorProfileId,fromFund,toFund,amountBronze,requestId,
  }={}) {
    if (!UUID.test(requestId||'') || !FUNDS.includes(fromFund) || !FUNDS.includes(toFund)
        || fromFund===toFund || !Number.isSafeInteger(amountBronze) || amountBronze<1)
      throw operationError('Transferência de fundos inválida.',400);
    return transaction(pool,async client=>{
      const granted=await access(client,governmentId,actorProfileId,{lock:true});
      if(!granted?.permissions.manageFunds)throw operationError('Você não pode movimentar fundos deste governo.',403);
      const previous=await client.query('SELECT * FROM government_fund_transfers WHERE request_id=$1',[requestId]);
      if(previous.rowCount){
        const old=previous.rows[0];
        if(old.government_id!==governmentId || old.from_fund!==fromFund
            || old.to_fund!==toFund || Number(old.amount_bronze)!==amountBronze)
          throw operationError('Esta referência já pertence a outra transferência.');
        return {requestId,duplicate:true,amountBronze,fromFund,toFund};
      }
      const funds=await client.query(
        'SELECT fund_code,balance_bronze,reserved_bronze FROM government_fund_accounts '+
        'WHERE government_id=$1 AND fund_code=ANY($2::text[]) ORDER BY fund_code FOR UPDATE',
        [governmentId,[fromFund,toFund]],
      );
      if(funds.rowCount!==2)throw operationError('Os fundos precisam estar configurados antes da transferência.');
      const source=funds.rows.find(row=>row.fund_code===fromFund);
      const dest=funds.rows.find(row=>row.fund_code===toFund);
      if(BigInt(source.balance_bronze)-BigInt(source.reserved_bronze)<BigInt(amountBronze))
        throw operationError('Saldo disponível insuficiente; reservas de projetos não podem ser transferidas.');
      if(BigInt(dest.balance_bronze)+BigInt(amountBronze)>BigInt(Number.MAX_SAFE_INTEGER))
        throw operationError('O saldo excederia o limite monetário seguro.');
      await client.query(
        'UPDATE government_fund_accounts SET balance_bronze=balance_bronze-$3,updated_at=now() '+
        'WHERE government_id=$1 AND fund_code=$2',[governmentId,fromFund,amountBronze],
      );
      await client.query(
        'UPDATE government_fund_accounts SET balance_bronze=balance_bronze+$3,updated_at=now() '+
        'WHERE government_id=$1 AND fund_code=$2',[governmentId,toFund,amountBronze],
      );
      const journalId=randomUUID();
      await client.query(
        'INSERT INTO economy_journal_transactions(transaction_id,event_type,actor_profile_id,idempotency_key,reference_id) VALUES($1,$2,$3,$4,$5)',
        [journalId,'government_fund_transfer',actorProfileId,'fund-transfer:'+requestId,governmentId],
      );
      for(const [line,fund,amount] of [[1,fromFund,-amountBronze],[2,toFund,amountBronze]]){
        await client.query(
          "INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,government_id,fund_code,amount_bronze) VALUES($1,$2,'government_treasury',$3,$4,$5)",
          [journalId,line,governmentId,fund,amount],
        );
      }
      await client.query(
        'INSERT INTO government_fund_transfers(request_id,government_id,from_fund,to_fund,amount_bronze,actor_profile_id,journal_transaction_id) '+
        'VALUES($1,$2,$3,$4,$5,$6,$7)',
        [requestId,governmentId,fromFund,toFund,amountBronze,actorProfileId,journalId],
      );
      return {requestId,duplicate:false,amountBronze,fromFund,toFund};
    });
  }

  async function proposeGovernmentProject({
    governmentId=DEFAULT_GOVERNMENT,actorProfileId,projectId,title,projectType,budgetBronze,
  }={}) {
    if (!UUID.test(projectId||'') || typeof title!=='string' || title.trim().length<4
        || title.trim().length>80 || !Object.hasOwn(PROJECT_FUNDS,projectType)
        || !Number.isSafeInteger(budgetBronze) || budgetBronze<1)
      throw operationError('Dados do projeto público inválidos.',400);
    return transaction(pool,async client=>{
      const granted=await access(client,governmentId,actorProfileId,{lock:true});
      if(!granted?.permissions.proposeProjects)throw operationError('Você não pode propor projetos deste governo.',403);
      const prior=await client.query('SELECT government_id,title,project_type,budget_bronze,status FROM government_projects WHERE project_id=$1',[projectId]);
      if(prior.rowCount){
        const row=prior.rows[0];
        if(row.government_id!==governmentId || row.title!==title.trim()
            || row.project_type!==projectType || Number(row.budget_bronze)!==budgetBronze)
          throw operationError('Esta referência já pertence a outro projeto.');
        return {projectId,status:row.status,duplicate:true};
      }
      const fundCode=PROJECT_FUNDS[projectType];
      const fund=await client.query('SELECT 1 FROM government_fund_accounts WHERE government_id=$1 AND fund_code=$2',
        [governmentId,fundCode]);
      if(!fund.rowCount)throw operationError('O fundo deste projeto não existe neste governo.');
      await client.query(
        'INSERT INTO government_projects(project_id,government_id,project_type,fund_code,title,budget_bronze,proposed_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [projectId,governmentId,projectType,fundCode,title.trim(),budgetBronze,actorProfileId],
      );
      await client.query(
        'INSERT INTO government_project_events(event_id,project_id,government_id,actor_profile_id,event_type) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(),projectId,governmentId,actorProfileId,'proposed'],
      );
      return {projectId,status:'proposed',duplicate:false};
    });
  }

  async function decideGovernmentProject({
    governmentId=DEFAULT_GOVERNMENT,actorProfileId,projectId,decision,
  }={}) {
    if(!UUID.test(projectId||'') || !['fund','cancel'].includes(decision))
      throw operationError('Decisão do projeto inválida.',400);
    return transaction(pool,async client=>{
      const granted=await access(client,governmentId,actorProfileId,{lock:true});
      if(!granted?.permissions.approveProjects)throw operationError('Somente a liderança pode aprovar ou cancelar projetos.',403);
      const found=await client.query(
        'SELECT * FROM government_projects WHERE project_id=$1 AND government_id=$2 FOR UPDATE',
        [projectId,governmentId],
      );
      if(!found.rowCount)throw operationError('Projeto não encontrado.',404);
      const project=found.rows[0];
      const status=decision==='fund'?'funded':'cancelled';
      if(project.status===status)return {projectId,status,duplicate:true};
      if(project.status!=='proposed' && project.status!=='funded')
        throw operationError('O projeto já foi encerrado ou entrou em execução.');
      if(decision==='fund' && project.status!=='proposed')
        throw operationError('O projeto já foi reservado.');
      const current=await client.query(
        'SELECT balance_bronze,reserved_bronze FROM government_fund_accounts WHERE government_id=$1 AND fund_code=$2 FOR UPDATE',
        [governmentId,project.fund_code],
      );
      if(!current.rowCount)throw operationError('Fundo do projeto não encontrado.');
      const budget=Number(project.budget_bronze);
      if(!Number.isSafeInteger(budget))throw operationError('Orçamento fora do limite monetário seguro.');
      if(decision==='fund'){
        if(Number(current.rows[0].balance_bronze)-Number(current.rows[0].reserved_bronze)<budget)
          throw operationError('Saldo livre insuficiente para reservar o orçamento do projeto.');
        await client.query(
          'UPDATE government_fund_accounts SET reserved_bronze=reserved_bronze+$3,updated_at=now() '+
          'WHERE government_id=$1 AND fund_code=$2',[governmentId,project.fund_code,budget],
        );
        await client.query(
          "UPDATE government_projects SET status='funded',approved_by=$2,updated_at=now() WHERE project_id=$1",
          [projectId,actorProfileId],
        );
      } else {
        if(project.status==='funded'){
          const released=await client.query(
            'UPDATE government_fund_accounts SET reserved_bronze=reserved_bronze-$3,updated_at=now() '+
            'WHERE government_id=$1 AND fund_code=$2 AND reserved_bronze >= $3',
            [governmentId,project.fund_code,budget-Number(project.spent_bronze)],
          );
          if(!released.rowCount)throw operationError('A reserva do projeto diverge do saldo do fundo.');
        }
        await client.query("UPDATE government_projects SET status='cancelled',updated_at=now() WHERE project_id=$1",
          [projectId]);
      }
      await client.query(
        'INSERT INTO government_project_events(event_id,project_id,government_id,actor_profile_id,event_type) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(),projectId,governmentId,actorProfileId,status],
      );
      return {projectId,status,duplicate:false};
    });
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

  return { getGovernmentEconomyPanel,listAuthorizedEconomyGovernments,setGovernmentEconomyRole,
    transferGovernmentFunds,proposeGovernmentProject,decideGovernmentProject };
}
