import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabasePool } from './pool.mjs';
import { runMigrations } from './migrate.mjs';
import { createPostgresStore } from './store.mjs';
import { createEconomyManagementStore, economyPermissions } from './economy-management.mjs';
import { createEconomyStore } from './economy-store.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('government economic roles restrict KPI, tax, appointment and revocation privileges', {skip:!databaseUrl},async()=>{
  const pool=createDatabasePool({connectionString:databaseUrl,max:4});
  const accounts=createPostgresStore(pool);
  const management=createEconomyManagementStore(pool);
  const market=createEconomyStore(pool);
  const governmentId='economy-qa-'+randomUUID().slice(0,8);
  const profiles=[];
  let governmentCreated=false;
  try {
    await runMigrations(pool);
    const create=async prefix=>{
      const account=await accounts.accounts.register({
        username:prefix+randomUUID().replaceAll('-','').slice(0,9),
        password:randomUUID(),
      });
      profiles.push(account.profile.id);
      return account;
    };
    const leader=await create('l_'), minister=await create('m_'), treasurer=await create('t_');
    const auditor=await create('a_'), outsider=await create('o_');
    const leaderId=leader.profile.id;
    await pool.query(
      'INSERT INTO world_governments(government_id,world_id,settlement_id,government_type,leader_profile_id) VALUES($1,$2,$3,$4,$5)',
      [governmentId,'test-world',governmentId,'village',leaderId],
    );
    governmentCreated=true;
    await pool.query(
      "INSERT INTO government_fund_accounts(government_id,fund_code,balance_bronze,reserved_bronze) VALUES($1,'general',1250,200)",
      [governmentId],
    );
    await pool.query(
      "INSERT INTO government_tax_policies(government_id,tax_code,version,base_rate_bps,minimum_rate_bps,maximum_rate_bps,treasury_target_bronze,treasury_sensitivity_bps) VALUES($1,'market_sale',1,200,100,500,5000,100)",
      [governmentId],
    );
    await pool.query(
      "INSERT INTO government_tax_quotes(government_id,tax_code,policy_version,rate_bps,treasury_balance_bronze) VALUES($1,'market_sale',1,200,1250)",
      [governmentId],
    );
    assert.equal(await management.getGovernmentEconomyPanel({governmentId,actorProfileId:outsider.profile.id}),null);
    const owner=await management.getGovernmentEconomyPanel({governmentId,actorProfileId:leaderId});
    assert.deepEqual(owner.permissions,{view:true,manageTaxes:true,manageRoles:true,manageFunds:true,proposeProjects:true,approveProjects:true});
    assert.equal(owner.role,'leader');
    assert.equal(owner.funds.find(item=>item.fundCode==='general').balanceBronze,1250);
    assert.equal(owner.funds.find(item=>item.fundCode==='general').reservedBronze,200);
    assert.equal(owner.kpis.treasuryReceiptsBronze,0);
    assert.equal(owner.daily.length,0,'other governments do not inherit global market measurements');
    assert.equal(owner.roles.length,0);

    await assert.rejects(
      management.setGovernmentEconomyRole({governmentId,actorProfileId:outsider.profile.id,username:minister.profile.username,role:'minister'}),
      error=>error.status===403,'nonleaders cannot appoint themselves or another person',
    );
    assert.equal((await management.setGovernmentEconomyRole({
      governmentId,actorProfileId:leaderId,username:minister.profile.username,role:'minister',
    })).changed,true);
    assert.equal((await management.setGovernmentEconomyRole({
      governmentId,actorProfileId:leaderId,username:treasurer.profile.username,role:'treasurer',
    })).changed,true);
    assert.equal((await management.setGovernmentEconomyRole({
      governmentId,actorProfileId:leaderId,username:auditor.profile.username,role:'auditor',
    })).changed,true);
    assert.deepEqual(
      (await management.getGovernmentEconomyPanel({governmentId,actorProfileId:minister.profile.id})).permissions,
      {view:true,manageTaxes:true,manageRoles:false,manageFunds:false,proposeProjects:true,approveProjects:false},
    );
    assert.deepEqual(
      (await management.getGovernmentEconomyPanel({governmentId,actorProfileId:treasurer.profile.id})).permissions,
      {view:true,manageTaxes:false,manageRoles:false,manageFunds:true,proposeProjects:true,approveProjects:false},
    );
    assert.deepEqual(
      (await management.getGovernmentEconomyPanel({governmentId,actorProfileId:auditor.profile.id})).permissions,
      {view:true,manageTaxes:false,manageRoles:false,manageFunds:false,proposeProjects:false,approveProjects:false},
    );
    assert.equal((await market.getGovernmentTaxPanel({
      governmentId,actorProfileId:minister.profile.id,
    })).policies[0].baseRateBps,200);
    assert.equal(await market.getGovernmentTaxPanel({governmentId,actorProfileId:auditor.profile.id}),null);
    const values={governmentId,taxCode:'market_sale',baseRateBps:250,minimumRateBps:100,
      maximumRateBps:500,treasuryTargetBronze:5000,treasurySensitivityBps:100};
    await assert.rejects(
      market.updateGovernmentTaxPolicy({...values,actorProfileId:auditor.profile.id}),
      error=>error.status===403,
    );
    const updated=await market.updateGovernmentTaxPolicy({...values,actorProfileId:minister.profile.id});
    assert.equal(updated.version,2);
    await assert.rejects(
      management.setGovernmentEconomyRole({
        governmentId,actorProfileId:minister.profile.id,username:outsider.profile.username,role:'treasurer',
      }),error=>error.status===403,'tax ministers cannot delegate their own authority',
    );
    const noChange=await management.setGovernmentEconomyRole({
      governmentId,actorProfileId:leaderId,username:auditor.profile.username,role:'auditor',
    });
    assert.equal(noChange.changed,false);
    await management.setGovernmentEconomyRole({
      governmentId,actorProfileId:leaderId,username:auditor.profile.username,role:'none',
    });
    assert.equal(await management.getGovernmentEconomyPanel({governmentId,actorProfileId:auditor.profile.id}),null);
    assert.equal((await management.getGovernmentEconomyPanel({governmentId,actorProfileId:leaderId})).roles.length,2);
    const audit=await pool.query('SELECT previous_role,next_role FROM government_economy_role_events WHERE government_id=$1 ORDER BY occurred_at,event_id',[governmentId]);
    assert.equal(audit.rowCount,4,'three nominations and one revocation are audited, no record for noop');
    assert.ok(audit.rows.some(row=>row.previous_role==='auditor'&&row.next_role===null));
  } finally {
    if(governmentCreated){
      await pool.query('DELETE FROM government_economy_role_events WHERE government_id=$1',[governmentId]);
      await pool.query('DELETE FROM government_economy_roles WHERE government_id=$1',[governmentId]);
      await pool.query('DELETE FROM government_tax_quotes WHERE government_id=$1',[governmentId]);
      await pool.query('DELETE FROM government_tax_policies WHERE government_id=$1',[governmentId]);
      await pool.query('DELETE FROM government_fund_accounts WHERE government_id=$1',[governmentId]);
      await pool.query('DELETE FROM world_governments WHERE government_id=$1',[governmentId]);
    }
    if(profiles.length){
      await pool.query('DELETE FROM profiles WHERE id=ANY($1::uuid[])',[profiles]);
      await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',[profiles]);
    }
    await pool.end();
  }
});

test('economy permission rules are least privilege and never grant role administration to delegates',()=>{
  assert.deepEqual(economyPermissions({role:'auditor'}),{view:true,manageTaxes:false,manageRoles:false,manageFunds:false,proposeProjects:false,approveProjects:false});
  assert.deepEqual(economyPermissions({role:'treasurer'}),{view:true,manageTaxes:false,manageRoles:false,manageFunds:true,proposeProjects:true,approveProjects:false});
  assert.deepEqual(economyPermissions({role:'minister'}),{view:true,manageTaxes:true,manageRoles:false,manageFunds:false,proposeProjects:true,approveProjects:false});
  assert.deepEqual(economyPermissions({role:'unexpected'}),{view:false,manageTaxes:false,manageRoles:false});
  assert.deepEqual(economyPermissions({isLeader:true}),{view:true,manageTaxes:true,manageRoles:true,manageFunds:true,proposeProjects:true,approveProjects:true});
});
