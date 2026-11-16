import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';
import { VILLAGE_JOB_POINTS } from '../game/village-jobs.mjs';
import { createAccountStore } from './account-store.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { WORLD_COORDINATE_VERSION } from '../game/dimension-layout.mjs';

const origin='https://village-jobs.test.invalid';
const profileId='7d4a6ad2-01a1-4b42-9a39-82c01f95b1ce';
const profile={id:profileId,displayName:'Ofício',guest:false,inventory:{wood:0,stone:0,berries:0,bronze:0,silver:0,gold:0}};
const point=VILLAGE_JOB_POINTS.find(value=>value.id==='board');

test('real WebSocket accepts only server-authoritative job messages and exposes guest/account requirement',async t=>{
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-village-jobs-ws-'));
  const accounts=createAccountStore({directory:stateDirectory});
  const guest=await accounts.guest();
  const locationStore=createJsonPlayerLocationStore(stateDirectory);
  await locationStore.savePlayerLocation(guest.profile.id,{location:'clearing',dimensionId:'surface',x:point.x,y:point.y,worldVersion:2});
  const room=createPrototypeServer({host:'127.0.0.1',port:19651,allowedOrigin:origin,stateDirectory,ambientCampfire:false,resolveSession:token=>accounts.getSession(token)});
  let socket;
  try {
    const address=await room.listen();
    socket=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin,cookie:`clareira_session=${guest.token}`}});
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);socket.once('close',(code,reason)=>reject(Error(`socket closed ${code}: ${reason}`)));});
    const nextMessage=predicate=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('WebSocket response timeout')),4000);
      const listener=data=>{let message;try{message=JSON.parse(data.toString());}catch{return;}if(predicate(message)){clearTimeout(timer);socket.off('message',listener);resolve(message);}};
      socket.on('message',listener);
    });
    const state=await nextMessage(message=>message.type==='villageJobs'&&message.villageJobs);
    assert.equal(state.villageJobs.requiresAccount,true);
    socket.send(JSON.stringify({type:'action',name:'villageJobStart',jobId:'carrier'}));
    const result=await nextMessage(message=>message.type==='notice'&&message.villageJobResult);
    assert.equal(result.villageJobResult.ok,false);
    assert.match(result.villageJobResult.notice,/conta/);
  } finally {
    if(socket?.readyState===WebSocket.OPEN) socket.close(1000,'test complete'); await new Promise(resolve=>setTimeout(resolve,20)); await room.close(); await rm(stateDirectory,{recursive:true,force:true});
  }
});
