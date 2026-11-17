import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPostgresStore } from '../database/store.mjs';
import { createStorageAdapter } from '../database/storage.mjs';
import { currencyValue } from '../game/lodging-catalog.mjs';
import { createAccountStore } from './account-store.mjs';

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
const claim=runId=>({runId,jobId:'carrier',dayKey:'2026-11-16',dailyLimit:3,rewardBronze:150});

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

test('PostgreSQL claim must carry the catalog limit and reward, nothing else is accepted',async()=>{
 const f=fakePool(),store=createPostgresStore(f.pool);
 const { dailyLimit, rewardBronze, ...withoutLimits } = claim('12345678-1234-4234-9234-123456789111');
 await assert.rejects(store.creditWalletAndSaveProgress(id,150,inventory,withoutLimits),error=>error.status===400);
 await assert.rejects(store.creditWalletAndSaveProgress(id,150,inventory,{...claim('12345678-1234-4234-9234-123456789112'),dailyLimit:99}),error=>error.status===400);
 assert.equal(f.state.rows.length,0);
 assert.equal(f.state.wallet,0);
});

test('JSON adapter refuses a claim that does not match the catalog, before touching the wallet',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'village-jobs-json-'));
 try {
  const adapter=createStorageAdapter({directory});
  const { dailyLimit, rewardBronze, ...withoutLimits } = claim('12345678-1234-4234-9234-123456789113');
  await assert.rejects(adapter.creditWalletAndSaveProgress(id,150,inventory,withoutLimits),error=>error.status===400);
  await assert.rejects(adapter.creditWalletAndSaveProgress(id,150,inventory,{...claim('12345678-1234-4234-9234-123456789114'),rewardBronze:10}),error=>error.status===400);
 } finally { await rm(directory,{recursive:true,force:true}); }
});

test('readiness requires schema version 39 and the village completions table',async()=>{
 const pool=row=>({ query:async sql=>{ assert.match(sql,/to_regclass\('village_job_completions'\)/); return {rows:[row]}; }, connect:async()=>({}) });
 const adapterFor=row=>createStorageAdapter({pool:pool(row)});
 await assert.rejects(adapterFor({version:39,jobs_table:null}).ready(),/Aplique todas as migrações/);
 await assert.rejects(adapterFor({version:38,jobs_table:'village_job_completions'}).ready(),/Aplique todas as migrações/);
 await adapterFor({version:39,jobs_table:'village_job_completions'}).ready();
});

test('migration 039 grants the preview game role like the other tables and never hardcodes the 150 bronze check',async()=>{
 const sql=await readFile(new URL('../database/migrations/039_village_jobs.sql',import.meta.url),'utf8');
 assert.match(sql,/IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game'\)/);
 assert.match(sql,/GRANT SELECT, INSERT ON village_job_completions TO clareira_preview_game/);
 assert.match(sql,/REVOKE UPDATE, DELETE, TRUNCATE ON village_job_completions FROM clareira_preview_game/);
 assert.doesNotMatch(sql,/CHECK \(amount_bronze = 150\)/);
});

// ---- Lote B: retorno padronizado, replay com carteira atual, código de cota, compensação e fila do ledger ----

async function register(store, index) { const { profile } = await store.register({ username:`jogador${index}`, password:'senha-de-teste-2026' }); return { profile }; }
const runIdFor = index => `12345678-1234-4234-9234-1234567890${String(index).padStart(2, '0')}`;

test('PostgreSQL quota rejection carries its own code, so a full wallet can be told apart from it',async()=>{
 const f=fakePool(),store=createPostgresStore(f.pool);
 for(let index=0;index<3;index++) await store.creditWalletAndSaveProgress(id,150,inventory,claim(runIdFor(index)));
 await assert.rejects(store.creditWalletAndSaveProgress(id,150,inventory,claim(runIdFor(50))),error=>error.status===409&&error.code==='village_quota');
});

test('PostgreSQL credit returns the standard shape with the wallet after the payment',async()=>{
 const f=fakePool(),store=createPostgresStore(f.pool);
 const paid=await store.creditWalletAndSaveProgress(id,150,inventory,claim(runIdFor(0)));
 assert.equal(paid.replay,false); assert.equal(paid.jobId,'carrier'); assert.equal(paid.amount,150);
 assert.equal(typeof paid.paidAt,'number'); assert.equal(currencyValue(paid.wallet),150);
});

test('PostgreSQL replay reads the wallet as it is now, in the same transaction',async()=>{
 const f=fakePool(),store=createPostgresStore(f.pool);
 await store.creditWalletAndSaveProgress(id,150,inventory,claim(runIdFor(0)));
 f.state.wallet+=40;
 const replay=await store.creditWalletAndSaveProgress(id,150,inventory,claim(runIdFor(0)));
 assert.equal(replay.replay,true); assert.equal(replay.jobId,'carrier'); assert.equal(replay.amount,150);
 assert.equal(currencyValue(replay.wallet),190);
 assert.equal(f.state.wallet,190);
});

test('PostgreSQL getVillageJobReplay finds a paid run after a restart, without any memory of the earlier store',async()=>{
 const f=fakePool();
 await createPostgresStore(f.pool).creditWalletAndSaveProgress(id,150,inventory,claim(runIdFor(0)));
 const restarted=createPostgresStore(f.pool);
 const replay=await restarted.getVillageJobReplay(id,runIdFor(0));
 assert.equal(replay.replay,true); assert.equal(replay.jobId,'carrier'); assert.equal(currencyValue(replay.wallet),150);
 assert.equal(await restarted.getVillageJobReplay(id,runIdFor(9)),null);
});

test('JSON replay after a restart returns the standard shape and never credits again',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'village-jobs-json-replay-'));
 try {
  const real=createAccountStore({directory});
  const guest=await register(real,0);
  const first=createStorageAdapter({directory});
  await first.creditWalletAndSaveProgress(guest.profile.id,150,inventory,claim(runIdFor(0)));
  const restarted=createStorageAdapter({directory});
  const replay=await restarted.creditWalletAndSaveProgress(guest.profile.id,150,inventory,claim(runIdFor(0)));
  assert.equal(replay.replay,true); assert.equal(replay.jobId,'carrier'); assert.equal(replay.amount,150);
  assert.equal(currencyValue(replay.wallet),150);
  assert.equal(currencyValue(await real.getWallet(guest.profile.id)),150);
  const found=await restarted.getVillageJobReplay(guest.profile.id,runIdFor(0));
  assert.equal(found.replay,true); assert.equal(currencyValue(found.wallet),150);
 } finally { await rm(directory,{recursive:true,force:true}); }
});

test('JSON: a failed compensation is flagged in the ledger and the persistence error is not swallowed',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'village-jobs-json-compensation-'));
 try {
  const real=createAccountStore({directory});
  const guest=await register(real,0);
  const ledgerPath=path.join(directory,'village-job-ledger.json');
  const failingDebit={...real,debitWallet:async()=>{throw Object.assign(new Error('débito indisponível'),{status:500});}};
  const adapter=createStorageAdapter({directory,accounts:failingDebit});
  await adapter.creditWalletAndSaveProgress(guest.profile.id,150,inventory,claim(runIdFor(0)));
  // Torna o arquivo do ledger um diretório: a próxima gravação falha ao trocar o arquivo temporário.
  await rm(ledgerPath,{force:true}); await mkdir(ledgerPath);
  await assert.rejects(adapter.creditWalletAndSaveProgress(guest.profile.id,150,inventory,claim(runIdFor(1)))); 
  const rows=await adapter.getVillageJobCompletions(guest.profile.id,'2026-11-16');
  assert.equal(rows.find(row=>row.runId===runIdFor(1))?.compensationFailed,true);
 } finally { await rm(directory,{recursive:true,force:true}); }
});

test('JSON: concurrent completions of many accounts all land in one readable ledger file',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'village-jobs-json-queue-'));
 try {
  const real=createAccountStore({directory});
  const guests=[]; for(let index=0;index<12;index++) guests.push(await register(real,index));
  const adapter=createStorageAdapter({directory});
  await Promise.all(guests.map((guest,index)=>adapter.creditWalletAndSaveProgress(guest.profile.id,150,inventory,claim(runIdFor(index)))));
  const rows=JSON.parse(await readFile(path.join(directory,'village-job-ledger.json'),'utf8'));
  assert.equal(rows.length,12);
 } finally { await rm(directory,{recursive:true,force:true}); }
});
