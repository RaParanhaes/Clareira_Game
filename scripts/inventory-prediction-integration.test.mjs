import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rename, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';
import { createAccountStore } from './account-store.mjs';
import { createInventoryPrediction } from '../game/inventory-prediction.mjs';

test('compact owner snapshots promptly confirm ordered swaps, reject stale contents and deduplicate retries', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(),'clareira-predicted-inventory-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const accounts = createAccountStore({directory});
  const created = await accounts.register({username:'prediction',password:'test-password-123'});
  const origin='http://inventory-test.local';
  const room=createPrototypeServer({port:0,stateDirectory:directory,allowedOrigin:origin,ambientCampfire:false});
  const address=await room.listen();t.after(()=>room.close());
  const connect=()=>new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin,cookie:`clareira_session=${created.token}`}});
  const ws=connect();t.after(()=>ws.terminate());
  const states=[];
  ws.on('message',raw=>{const state=JSON.parse(raw);if(state.type==='state')states.push(state)});
  const until=async(predicate)=>{
    const deadline=Date.now()+3000;
    while(Date.now()<deadline){const state=states.at(-1);if(state&&predicate(state))return state;await new Promise(r=>setTimeout(r,10))}
    assert.fail('inventory acknowledgement timeout');
  };
  const initial=await until(s=>s.inventoryState);
  ws.send(JSON.stringify({type:'join',compactWorld:1,compactPlayers:1}));
  const prediction=createInventoryPrediction();
  const first=prediction.enqueue(initial.inventoryState.inventory,{type:'action',name:'moveInventorySlot',from:0,to:10});
  const second=prediction.enqueue(first.inventory,{type:'action',name:'moveInventorySlot',from:10,to:11});
  const started=Date.now();
  ws.send(JSON.stringify(first.command));ws.send(JSON.stringify(second.command));
  const confirmed=await until(s=>s.inventoryState?.seq===2);
  assert.ok(Date.now()-started<2000,'confirmation arrives before the five-second full snapshot refresh');
  assert.equal(confirmed.inventoryState.inventory.slots[11].itemId,'knife');
  assert.equal(confirmed.inventoryState.inventory.slots[0],null);
  assert.equal(confirmed.inventoryState.inventory.slots[10],null);
  assert.ok(states.some(s=>s.inventoryState?.seq>0&&!('inventory' in s.players[0])), 'compact motion carries owner inventory separately');
  ws.send(JSON.stringify(second.command)); // duplicate: would swap the knife back if applied twice
  ws.send(JSON.stringify({type:'action',name:'moveInventorySlot',from:11,to:12,inventorySeq:3,
    expectedSlots:[{slot:11,stack:{itemId:'wood',quantity:9}}]}));
  const rejected=await until(s=>s.inventoryState?.seq===3);
  assert.equal(rejected.inventoryState.inventory.slots[11].itemId,'knife');
  assert.equal(rejected.inventoryState.inventory.slots[12],null);
  ws.send(JSON.stringify({type:'action',name:'selectHotbar',slot:4,inventorySeq:4}));
  const selected=await until(s=>s.inventoryState?.seq===4);
  assert.equal(selected.inventoryState.inventory.selectedSlot,4);
  // Make only this disposable fixture's progress destination unwritable.
  const progressFile=path.join(directory,'progress',`${created.profile.id}.json`);
  await rename(progressFile,`${progressFile}.saved`);await mkdir(progressFile);
  try {
    ws.send(JSON.stringify({type:'action',name:'moveInventorySlot',from:11,to:12,inventorySeq:5}));
    const failed=await until(s=>s.inventoryState?.seq===5);
    assert.equal(failed.inventoryState.inventory.slots[11].itemId,'knife','failed save preserves authoritative contents');
    assert.equal(failed.inventoryState.inventory.slots[12],null);
  } finally {
    await rm(progressFile,{recursive:true,force:true});await rename(`${progressFile}.saved`,progressFile);
  }
  const closed=new Promise(r=>ws.once('close',r));ws.close();await closed;
  states.length=0;
  const resumed=connect();t.after(()=>resumed.terminate());
  resumed.on('message',raw=>{const state=JSON.parse(raw);if(state.type==='state')states.push(state)});
  const restored=await until(s=>s.inventoryState);
  assert.equal(restored.inventoryState.inventory.slots[11].itemId,'knife');
  assert.equal(restored.inventoryState.inventory.selectedSlot,4);
  assert.equal(restored.inventoryState.seq,0,'new connection starts a fresh command sequence');
});
