import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabasePool} from './pool.mjs';
import {runMigrations} from './migrate.mjs';
import {createPostgresStore} from './store.mjs';
import {createEconomyManagementStore} from './economy-management.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('village and kingdom treasuries keep independent balances, audited allocation and reserved projects', {skip:!databaseUrl}, async()=>{
  const pool=createDatabasePool({connectionString:databaseUrl,max:4});
  const accounts=createPostgresStore(pool);
  const treasury=createEconomyManagementStore(pool);
  const village='village-qa-'+randomUUID().slice(0,8);
  const kingdom='kingdom-qa-'+randomUUID().slice(0,8);
  const profiles=[];
  try{
    await runMigrations(pool);
    const account=async prefix=>{
      const saved=await accounts.accounts.register({
        username:prefix+randomUUID().replaceAll('-','').slice(0,9),
        password:randomUUID(),
      });
      profiles.push(saved.profile.id);
      return saved.profile;
    };
    const leader=await account('vl_'),king=await account('kg_');
    const minister=await account('mn_'),treasurer=await account('tr_'),outsider=await account('ou_');
    for(const [id,type,chief]of [[village,'village',leader.id],[kingdom,'kingdom',king.id]]){
      await pool.query(
        'INSERT INTO world_governments(government_id,world_id,settlement_id,government_type,leader_profile_id) VALUES($1,$2,$3,$4,$5)',
        [id,'test-world',id,type,chief],
      );
      for(const fund of ['general','donations','materials','construction','territory','diplomacy']){
        const balance=id===village ? fund==='general'?1000:fund==='materials'?300:0
          :fund==='general'?700:fund==='construction'?100:0;
        await pool.query(
          'INSERT INTO government_fund_accounts(government_id,fund_code,balance_bronze,reserved_bronze) VALUES($1,$2,$3,$4)',
          [id,fund,balance,id===village&&fund==='general'?100:0],
        );
      }
    }
    await treasury.setGovernmentEconomyRole({governmentId:village,actorProfileId:leader.id,
      username:treasurer.username,role:'treasurer'});
    await treasury.setGovernmentEconomyRole({governmentId:village,actorProfileId:leader.id,
      username:minister.username,role:'minister'});
    assert.deepEqual((await treasury.listAuthorizedEconomyGovernments({actorProfileId:treasurer.id}))
      .map(g=>g.governmentId),[village]);
    assert.deepEqual((await treasury.listAuthorizedEconomyGovernments({actorProfileId:king.id}))
      .map(g=>g.governmentId),[kingdom]);
    assert.deepEqual(await treasury.listAuthorizedEconomyGovernments({actorProfileId:outsider.id}),[]);
    assert.equal(await treasury.getGovernmentEconomyPanel({governmentId:kingdom,actorProfileId:treasurer.id}),null);
    const before=await treasury.getGovernmentEconomyPanel({governmentId:village,actorProfileId:leader.id});
    assert.equal(before.governmentType,'village');
    assert.equal(before.funds.reduce((n,f)=>n+(f.balanceBronze||0),0),1300);
    assert.equal(before.funds.find(f=>f.fundCode==='general').reservedBronze,100);
    assert.equal(before.projects.length,0);
    const transferId=randomUUID();
    const base={governmentId:village,actorProfileId:treasurer.id,fromFund:'general',toFund:'construction'};
    await assert.rejects(treasury.transferGovernmentFunds({...base,requestId:randomUUID(),amountBronze:950}),
      e=>e.status===409 && /Saldo disponível/.test(e.message));
    await assert.rejects(treasury.transferGovernmentFunds({...base,requestId:randomUUID(),
      amountBronze:1,actorProfileId:minister.id}),e=>e.status===403);
    await assert.rejects(treasury.transferGovernmentFunds({...base,requestId:randomUUID(),
      amountBronze:1,governmentId:kingdom}),e=>e.status===403);
    await assert.rejects(treasury.transferGovernmentFunds({...base,requestId:randomUUID(),
      amountBronze:1,actorProfileId:outsider.id}),e=>e.status===403);
    const transferred=await treasury.transferGovernmentFunds({...base,requestId:transferId,amountBronze:200});
    assert.equal(transferred.duplicate,false);
    assert.equal((await treasury.transferGovernmentFunds({...base,requestId:transferId,amountBronze:200})).duplicate,true);
    await assert.rejects(treasury.transferGovernmentFunds({...base,requestId:transferId,amountBronze:201}),
      e=>e.status===409);
    const after=await treasury.getGovernmentEconomyPanel({governmentId:village,actorProfileId:leader.id});
    assert.equal(after.funds.find(f=>f.fundCode==='general').balanceBronze,800);
    assert.equal(after.funds.find(f=>f.fundCode==='construction').balanceBronze,200);
    assert.equal(after.funds.reduce((n,f)=>n+(f.balanceBronze||0),0),1300);
    assert.equal(after.kpis.treasuryReceiptsBronze,0,'internal transfers are not external tax revenue');
    assert.equal(after.kpis.treasuryExpensesBronze,0,'internal transfers are not public expenditure');
    assert.equal((await treasury.getGovernmentEconomyPanel({governmentId:kingdom,actorProfileId:king.id}))
      .funds.find(f=>f.fundCode==='general').balanceBronze,700);

    const p1=randomUUID(),p2=randomUUID();
    const proposal={governmentId:village,actorProfileId:treasurer.id,projectId:p1,
      projectType:'construction',title:'Reparar ponte de acesso',budgetBronze:175};
    assert.equal((await treasury.proposeGovernmentProject(proposal)).status,'proposed');
    assert.equal((await treasury.proposeGovernmentProject(proposal)).duplicate,true);
    await assert.rejects(treasury.proposeGovernmentProject({...proposal,budgetBronze:180}),
      e=>e.status===409);
    await assert.rejects(treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:treasurer.id,projectId:p1,decision:'fund',
    }),e=>e.status===403);
    await assert.rejects(treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:king.id,projectId:p1,decision:'fund',
    }),e=>e.status===403);
    assert.equal((await treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:leader.id,projectId:p1,decision:'fund',
    })).status,'funded');
    assert.equal((await treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:leader.id,projectId:p1,decision:'fund',
    })).duplicate,true);
    let funded=await treasury.getGovernmentEconomyPanel({governmentId:village,actorProfileId:leader.id});
    assert.equal(funded.funds.find(f=>f.fundCode==='construction').reservedBronze,175);
    assert.equal(funded.funds.find(f=>f.fundCode==='construction').balanceBronze,200);
    assert.equal(funded.projects.find(p=>p.projectId===p1).status,'funded');
    await assert.rejects(treasury.transferGovernmentFunds({...base,fromFund:'construction',
      toFund:'general',requestId:randomUUID(),amountBronze:50}),e=>e.status===409);

    await treasury.proposeGovernmentProject({
      ...proposal,projectId:p2,actorProfileId:minister.id,title:'Construir um pequeno abrigo',budgetBronze:100,
    });
    await assert.rejects(treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:leader.id,projectId:p2,decision:'fund',
    }),e=>e.status===409 && /Saldo livre insuficiente/.test(e.message));
    assert.equal((await treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:leader.id,projectId:p1,decision:'cancel',
    })).status,'cancelled');
    assert.equal((await treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:leader.id,projectId:p1,decision:'cancel',
    })).duplicate,true);
    assert.equal((await treasury.decideGovernmentProject({
      governmentId:village,actorProfileId:leader.id,projectId:p2,decision:'fund',
    })).status,'funded');
    funded=await treasury.getGovernmentEconomyPanel({governmentId:village,actorProfileId:leader.id});
    assert.equal(funded.funds.find(f=>f.fundCode==='construction').reservedBronze,100);
    assert.equal(funded.funds.find(f=>f.fundCode==='construction').balanceBronze,200);
    assert.equal(funded.projects.find(p=>p.projectId===p1).status,'cancelled');
    assert.equal(funded.projects.find(p=>p.projectId===p2).status,'funded');
    const entries=await pool.query(
      `SELECT l.account_code,l.fund_code,l.amount_bronze FROM economy_journal_transactions t
         JOIN economy_journal_lines l USING(transaction_id)
        WHERE t.event_type='government_fund_transfer' AND t.reference_id=$1 ORDER BY l.line_number`,
      [village],
    );
    assert.equal(entries.rowCount,2);
    assert.equal(entries.rows.reduce((n,row)=>n+Number(row.amount_bronze),0),0);
    assert.deepEqual(entries.rows.map(row=>[row.fund_code,Number(row.amount_bronze)]),
      [['general',-200],['construction',200]]);
    const history=await pool.query('SELECT event_type FROM government_project_events WHERE government_id=$1',[village]);
    assert.equal(history.rowCount,6,'two proposals, two fundings and one cancellation include audit events');
  }finally{
    for(const id of [village,kingdom]){
      await pool.query('DELETE FROM government_project_events WHERE government_id=$1',[id]);
      await pool.query('DELETE FROM government_projects WHERE government_id=$1',[id]);
      await pool.query('DELETE FROM government_fund_transfers WHERE government_id=$1',[id]);
      await pool.query(`DELETE FROM economy_journal_lines WHERE transaction_id IN
        (SELECT transaction_id FROM economy_journal_transactions WHERE reference_id=$1 AND event_type='government_fund_transfer')`,[id]);
      await pool.query("DELETE FROM economy_journal_transactions WHERE reference_id=$1 AND event_type='government_fund_transfer'",[id]);
      await pool.query('DELETE FROM government_economy_role_events WHERE government_id=$1',[id]);
      await pool.query('DELETE FROM government_economy_roles WHERE government_id=$1',[id]);
      await pool.query('DELETE FROM government_fund_accounts WHERE government_id=$1',[id]);
      await pool.query('DELETE FROM world_governments WHERE government_id=$1',[id]);
    }
    if(profiles.length){
      await pool.query('DELETE FROM profiles WHERE id=ANY($1::uuid[])',[profiles]);
      await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',[profiles]);
    }
    await pool.end();
  }
});
