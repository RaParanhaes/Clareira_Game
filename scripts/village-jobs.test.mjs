import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVillageJobsServer } from './village-jobs-server.mjs';
import { VILLAGE_JOB_POINTS, villageJobPointById } from '../game/village-jobs.mjs';
import { gameDayKey } from '../game/game-calendar.mjs';

const at = (id) => { const {x,y}=VILLAGE_JOB_POINTS.find(point=>point.id===id); return {x,y}; };
const CONTEXT = () => ({ inventorySnapshot:() => ({ wood:0 }) });
function fixture() {
  let time=1_800_000_000_000, lit=true, payments=0;
  const rows=[];
  const storage={ getVillageJobCompletions:async(_id,dayKey)=>rows.filter(row=>row.dayKey===dayKey),
    getVillageJobReplay:async(_id,runId)=>{ const row=rows.find(item=>item.runId===runId); return row?{wallet:{},replay:true,jobId:row.jobId,amount:row.amount,paidAt:0}:null; },
    creditWalletAndSaveProgress:async(_id,amount,_inventory,claim)=>{ if(rows.some(row=>row.runId===claim.runId))return {replay:true}; if(rows.filter(row=>row.dayKey===claim.dayKey&&row.jobId===claim.jobId).length>=3)throw Object.assign(Error('quota'),{status:409}); rows.push({...claim,amount});payments++;return {}; } };
  const engine=createVillageJobsServer({now:()=>time,storage,isHearthLit:()=>lit});
  const server={...engine, handle:(player,message)=>engine.handle(player,message,CONTEXT())};
  const player={accountId:'12345678-1234-4234-9234-123456789abc',location:'clearing',dimensionId:'surface',position:at('board'),inventorySnapshot:()=>({})};
  return {server,player,rows,setTime:value=>time=value,setLit:value=>lit=value,get payments(){return payments;}};
}

test('carrier validates reach, account, minimum duration, finish and replay', async()=>{
  const f=fixture();
  assert.equal((await f.server.handle({...f.player,accountId:null},{name:'villageJobStart',jobId:'carrier'})).ok,false);
  assert.equal((await f.server.handle({...f.player,position:{x:0,y:0}},{name:'villageJobStart',jobId:'carrier'})).ok,false);
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'}); assert.equal(started.ok,true);
  assert.equal((await f.server.handle({...f.player,position:at('delivery')},{name:'villageJobFinish',runId:started.active.runId})).ok,false);
  f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt);
  const delivery={...f.player,position:at('delivery')};
  const paid=await f.server.handle(delivery,{name:'villageJobFinish',runId:started.active.runId}); assert.equal(paid.ok,true);
  assert.equal(f.payments,1);
  assert.equal((await f.server.handle(delivery,{name:'villageJobFinish',runId:started.active.runId})).replay,true);
  assert.equal(f.payments,1);
});

test('firekeeper requires lit continuous point, cancels on movement, and supports explicit cancel', async()=>{
  const f=fixture(); f.player.position=at('hearth');
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'firekeeper'});
  assert.equal(started.ok,true);
  assert.equal((await f.server.handle({...f.player,position:at('board')},{name:'villageJobCancel',runId:started.active.runId})).ok,false);
  assert.equal(f.server.activeByProfile.has(f.player.accountId),false);
  const next=await f.server.handle(f.player,{name:'villageJobStart',jobId:'firekeeper'});
  f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt); f.setLit(false);
  assert.equal((await f.server.handle(f.player,{name:'villageJobFinish',runId:next.active.runId})).ok,false);
  assert.equal(f.payments,0);
});

test('one active run per profile and server generated run ids', async()=>{
  const f=fixture(); const first=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'});
  assert.match(first.active.runId,/^[0-9a-f-]{36}$/i);
  assert.equal((await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'})).ok,false);
  assert.equal((await f.server.handle(f.player,{name:'villageJobCancel',runId:'forged'})).ok,false);
});

test('daily quota is measured on completion day and rolls over', async()=>{
  const f=fixture();
  for(let index=0;index<3;index++){
    const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'});
    f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt);
    assert.equal((await f.server.handle({...f.player,position:at('delivery')},{name:'villageJobFinish',runId:started.active.runId})).ok,true);
    f.setTime(f.server.activeByProfile.get(f.player.accountId)?.readyAt || Date.parse('2027-01-02T00:00:00Z'));
    f.player.position=at('board');
  }
  assert.equal(f.rows.length,3);
});

test('fire turn measures reach from the hearth point, not from where the turn began', async()=>{
  const f=fixture(); const hearth=villageJobPointById('hearth'), r=hearth.radius;
  f.player.position={x:hearth.x+r-0.05,y:hearth.y};
  assert.equal((await f.server.handle(f.player,{name:'villageJobStart',jobId:'firekeeper'})).ok,true);
  // Opposite edge of the hearth: 2.5 from where the turn began (past the old 2.4), still inside the hearth point.
  f.player.position={x:hearth.x-r+0.05,y:hearth.y};
  f.server.movement(f.player);
  assert.equal(f.server.activeByProfile.has(f.player.accountId),true);
  f.player.position={x:hearth.x-r-0.3,y:hearth.y};
  f.server.movement(f.player);
  assert.equal(f.server.activeByProfile.has(f.player.accountId),false);
});

test('completion claim carries the catalog limit and reward, so persistence never hardcodes them', async()=>{
  const f=fixture();
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'});
  f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt);
  await f.server.handle({...f.player,position:at('delivery')},{name:'villageJobFinish',runId:started.active.runId});
  assert.equal(f.rows[0].dailyLimit,3);
  assert.equal(f.rows[0].rewardBronze,150);
});

// ---- Lote B: carteira viva, cota no início, 409, cache do estado, replay pelo ledger ----

function ledgerFixture() {
  let time=1_800_000_000_000;
  const state={ rows:[], wallet:{gold:0,silver:0,bronze:0}, queries:0, quotaError:false, walletFull:false };
  const chains=new Map();
  // Simula a fila por conta do servidor de verdade (progressWrites / lock do adapter).
  const serial=(id,task)=>{ const previous=chains.get(id)||Promise.resolve(); const next=previous.catch(()=>{}).then(task); chains.set(id,next); return next; };
  const storage={
    async getVillageJobCompletions(_id,dayKey){ state.queries++; await Promise.resolve(); return state.rows.filter(row=>row.dayKey===dayKey).map(({profileId,...row})=>row); },
    async getVillageJobReplay(_id,runId){ const row=state.rows.find(item=>item.runId===runId); return row?{wallet:{...state.wallet},replay:true,jobId:row.jobId,amount:row.amount,paidAt:row.paidAt}:null; },
    async creditWalletAndSaveProgress(_id,amount,_inventory,claim){
      const existing=state.rows.find(row=>row.runId===claim.runId);
      if(existing)return {wallet:{...state.wallet},replay:true,jobId:existing.jobId,amount:existing.amount,paidAt:existing.paidAt};
      if(state.quotaError||state.rows.filter(row=>row.dayKey===claim.dayKey&&row.jobId===claim.jobId).length>=claim.dailyLimit)
        throw Object.assign(new Error('A cota deste ofício já foi completada hoje.'),{status:409,code:'village_quota'});
      if(state.walletFull)throw Object.assign(new Error('A carteira atingiu o limite técnico de armazenamento.'),{status:409});
      await Promise.resolve();
      state.wallet.bronze+=amount; state.rows.push({...claim,amount,paidAt:time});
      return {wallet:{...state.wallet},replay:false,jobId:claim.jobId,amount,paidAt:time};
    },
  };
  const makeServer=()=>createVillageJobsServer({now:()=>time,storage,queueWrite:serial,isHearthLit:()=>true});
  const server=makeServer();
  // Jogador real: o mesmo objeto que o servidor guarda; sem inventorySnapshot próprio.
  const player={accountId:'12345678-1234-4234-9234-123456789abc',location:'clearing',dimensionId:'surface',position:at('board'),inventory:{gold:0,silver:0,bronze:0},inventorySnapshot:()=>({})};
  return {server,player,state,makeServer,storage,dayKey:()=>gameDayKey(time),setTime:value=>time=value,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

async function paidCarrierTurn(f) {
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'},CONTEXT());
  assert.equal(started.ok,true);
  f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt);
  f.player.position=at('delivery');
  const paid=await f.server.handle(f.player,{name:'villageJobFinish',runId:started.active.runId},CONTEXT());
  assert.equal(paid.ok,true);
  return started.active.runId;
}

test('a paid turn shows the new wallet on the real player, so the next save keeps the credit', async()=>{
  const f=ledgerFixture();
  await paidCarrierTurn(f);
  assert.equal(f.player.inventory.bronze,150);
  // Próximo persistPlayer grava o inventário vivo: precisa bater com a carteira gravada.
  assert.equal(f.player.inventory.bronze,f.state.wallet.bronze);
});

test('a replayed finish mirrors the wallet as it is now, after purchases made later', async()=>{
  const f=ledgerFixture();
  const runId=await paidCarrierTurn(f);
  f.state.wallet.bronze+=40;
  const replay=await f.server.handle(f.player,{name:'villageJobFinish',runId},CONTEXT());
  assert.equal(replay.ok,true); assert.equal(replay.replay,true);
  assert.equal(f.player.inventory.bronze,190);
  assert.equal(f.state.rows.length,1);
});

test('start refuses when the daily quota is already spent, before a turn is opened', async()=>{
  const f=ledgerFixture();
  for(let index=0;index<3;index++) f.state.rows.push({runId:`12345678-1234-4234-9234-12345678900${index}`,jobId:'carrier',dayKey:f.dayKey(),amount:150,paidAt:0});
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'},CONTEXT());
  assert.equal(started.ok,false);
  assert.match(started.notice,/cota/);
  assert.equal(f.server.activeByProfile.has(f.player.accountId),false);
});

test('a full wallet keeps the turn and says so, while a quota refusal at finish cancels it', async()=>{
  const f=ledgerFixture();
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'},CONTEXT());
  f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt); f.player.position=at('delivery');
  f.state.walletFull=true;
  const full=await f.server.handle(f.player,{name:'villageJobFinish',runId:started.active.runId},CONTEXT());
  assert.equal(full.ok,false); assert.match(full.notice,/carteira/);
  assert.equal(f.server.activeByProfile.has(f.player.accountId),true);
  f.state.walletFull=false; f.state.quotaError=true;
  const quota=await f.server.handle(f.player,{name:'villageJobFinish',runId:started.active.runId},CONTEXT());
  assert.equal(quota.ok,false);
  assert.equal(f.server.activeByProfile.has(f.player.accountId),false);
});

test('a second simultaneous finish replays and never announces a second payment', async()=>{
  const f=ledgerFixture();
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'},CONTEXT());
  f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt); f.player.position=at('delivery');
  const finish={name:'villageJobFinish',runId:started.active.runId};
  const results=await Promise.all([f.server.handle(f.player,finish,CONTEXT()),f.server.handle(f.player,finish,CONTEXT())]);
  assert.equal(f.state.rows.length,1);
  assert.equal(f.state.wallet.bronze,150);
  assert.equal(results.filter(result=>/recebidos/.test(result.notice)).length,1);
  assert.equal(results.filter(result=>result.replay===true).length,1);
});

test('after a restart a finish with a paid run replays from the ledger, not from memory', async()=>{
  const f=ledgerFixture();
  const runId=await paidCarrierTurn(f);
  const restarted=f.makeServer();
  const replay=await restarted.handle(f.player,{name:'villageJobFinish',runId},CONTEXT());
  assert.equal(replay.ok,true); assert.equal(replay.replay,true);
  assert.equal(f.state.rows.length,1); assert.equal(f.state.wallet.bronze,150);
});

test('the server handles the real player object and asks the snapshot from the call context', async()=>{
  const f=ledgerFixture();
  delete f.player.inventorySnapshot;
  assert.equal(f.player.inventorySnapshot,undefined);
  const started=await f.server.handle(f.player,{name:'villageJobStart',jobId:'carrier'},CONTEXT());
  assert.equal(started.ok,true);
  assert.equal(f.server.activeByProfile.get(f.player.accountId).playerRef,f.player);
  f.setTime(f.server.activeByProfile.get(f.player.accountId).readyAt); f.player.position=at('delivery');
  assert.equal((await f.server.handle(f.player,{name:'villageJobFinish',runId:started.active.runId},CONTEXT())).ok,true);
});

test('many broadcasts read villageJobs from one cached ledger query, and a payment reloads it once', async()=>{
  const f=ledgerFixture();
  for(let index=0;index<50;index++) f.server.state(f.player);
  await f.flush();
  let last;
  for(let index=0;index<50;index++) last=f.server.state(f.player);
  assert.equal(last.requiresAccount,false);
  assert.equal(f.state.queries,1);
  const runId=await paidCarrierTurn(f);
  const before=f.state.queries;
  for(let index=0;index<50;index++) f.server.state(f.player);
  await f.flush();
  for(let index=0;index<50;index++) last=f.server.state(f.player);
  assert.equal(f.state.queries-before,1);
  assert.equal(last.jobs.find(job=>job.id==='carrier').completed,1);
  assert.equal(f.state.rows[0].runId,runId);
});

test('the prototype sends village jobs only inside the state packet, with no 50 ms side packet and no copied player', async()=>{
  const source=await readFile(new URL('./prototype-server.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/villageJobs\.snapshot\(/);
  assert.doesNotMatch(source,/type:\s*'villageJobs'/);
  assert.doesNotMatch(source,/\{\s*\.\.\.player,\s*inventorySnapshot/);
  assert.match(source,/'vitals',\s*'villageJobs'/);
});

test('damage cancels the village turn only when the player faints', async()=>{
  const source=await readFile(new URL('./prototype-server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const applyWildlifeHit'); const end=source.indexOf('\n  };',start);
  const body=source.slice(start,end);
  const fainted=body.indexOf('if (result.fainted) {');
  assert.ok(fainted>0);
  assert.doesNotMatch(body.slice(0,fainted),/cancelForProfile/);
  assert.match(body.slice(fainted),/villageJobs\.cancelForProfile/);
});
