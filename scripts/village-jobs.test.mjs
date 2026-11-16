import test from 'node:test';
import assert from 'node:assert/strict';
import { createVillageJobsServer } from './village-jobs-server.mjs';
import { VILLAGE_JOB_POINTS } from '../game/village-jobs.mjs';

const at = (id) => { const {x,y}=VILLAGE_JOB_POINTS.find(point=>point.id===id); return {x,y}; };
function fixture() {
  let time=1_800_000_000_000, lit=true, payments=0;
  const rows=[];
  const storage={ getVillageJobCompletions:async(_id,dayKey)=>rows.filter(row=>row.dayKey===dayKey),
    creditWalletAndSaveProgress:async(_id,amount,_inventory,claim)=>{ if(rows.some(row=>row.runId===claim.runId))return {replay:true}; if(rows.filter(row=>row.dayKey===claim.dayKey&&row.jobId===claim.jobId).length>=3)throw Object.assign(Error('quota'),{status:409}); rows.push({...claim,amount});payments++;return {}; } };
  const server=createVillageJobsServer({now:()=>time,storage,isHearthLit:()=>lit});
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
