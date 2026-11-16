import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresStore } from '../database/store.mjs';

function fakePool({ failInventory = false } = {}) {
  const state={ rows:[], wallet:0, committed:false, rolledBack:false }; let staged=[];
  const client={ async query(sql,args=[]){
    if(sql==='BEGIN'){staged=[];return {rows:[]};} if(sql==='COMMIT'){state.committed=true;state.rows.push(...staged);return {rows:[]};} if(sql==='ROLLBACK'){state.rolledBack=true;staged=[];return {rows:[]};}
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    if(sql.includes('FROM village_job_completions WHERE profile_id=$1 AND run_id=$2'))return {rows:[...state.rows,...staged].filter(row=>row.run===args[1]).map(row=>({job_id:row.job,amount_bronze:150,paid_at:new Date(1000)}))};
    if(sql.includes('FROM village_job_completions WHERE profile_id=$1 AND job_id=$2'))return {rows:[{completed:Math.min(3,[...state.rows,...staged].filter(row=>row.job===args[1]&&row.day===args[2]).length)}]};
    if(sql.includes('INSERT INTO village_job_completions')){staged.push({profile:args[0],run:args[1],job:args[2],day:args[3]});return {rows:[]};}
    if(sql.includes('SELECT item_id, quantity FROM inventory_items'))return {rows:[{item_id:'bronze',quantity:state.wallet%100},{item_id:'silver',quantity:Math.floor(state.wallet/100)}]};
    if(sql.includes('INSERT INTO inventory_items')){if(failInventory)throw Error('forced write failure');if(args[1]==='bronze')state.wallet=state.wallet-state.wallet%100+Number(args[2]);if(args[1]==='silver')state.wallet=Number(args[2])*100+state.wallet%100;return {rows:[]};}
    if(sql.includes('DELETE FROM inventory_items'))return {rows:[]};
    throw Error('unexpected query: '+sql);
  },release(){}};
  return {state, pool:{connect:async()=>client,query:client.query.bind(client)}};
}
const inventory={ wood:0,stone:0,berries:0,bronze:0,silver:0,gold:0,attributes:{},learnedAbilities:[] };
const id='12345678-1234-4234-9234-123456789abc';
const claim=runId=>({runId,jobId:'carrier',dayKey:'2026-11-16'});

test('PostgreSQL contract rejects replays and enforces the persisted daily quota',async()=>{
 const f=fakePool(),store=createPostgresStore(f.pool);
 for(let index=0;index<3;index++) await store.creditWalletAndSaveProgress(id,150,inventory,claim(`12345678-1234-4234-9234-12345678900${index}`));
 await assert.rejects(store.creditWalletAndSaveProgress(id,150,inventory,claim('12345678-1234-4234-9234-123456789099')),error=>error.status===409);
 assert.equal(f.state.rows.length,3);
 assert.equal(f.state.wallet,450);
 const replay=await store.creditWalletAndSaveProgress(id,150,inventory,claim('12345678-1234-4234-9234-123456789000'));
 assert.equal(replay.replay,true);
 assert.equal(f.state.wallet,450);
});

test('PostgreSQL contract rolls back ledger and wallet write failures',async()=>{
 const f=fakePool({failInventory:true}),store=createPostgresStore(f.pool);
 await assert.rejects(store.creditWalletAndSaveProgress(id,150,inventory,claim('12345678-1234-4234-9234-123456789abc')));
 assert.equal(f.state.rolledBack,true);
});
