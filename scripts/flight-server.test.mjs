import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import {createPrototypeServer} from './prototype-server.mjs';
import {surfaceHeight} from '../game/elevation.mjs';
import {canOccupy,stepPlayer} from '../game/world.mjs';
import {reconcilePrediction} from '../game/prediction.mjs';

const origin='https://flight-test.invalid';
const resolveSession=async()=>({profile:{id:'e04d06d9-b215-4d08-b4b9-894dd63477cc',displayName:'Teste',guest:true,inventory:{wood:0,stone:0,berries:0}}});
function waitFor(socket,predicate){return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{socket.off('message',onMessage);reject(new Error('flight snapshot timeout'));},5000);
  function onMessage(raw){const message=JSON.parse(raw);if(!predicate(message))return;clearTimeout(timeout);socket.off('message',onMessage);resolve(message);}
  socket.on('message',onMessage);
});}

for(const [enabled,authorized] of [[false,true],[true,false],[true,true]])test(`server pilot=${enabled} authorization=${authorized}`,async t=>{
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-flight-server-'));
  const server=createPrototypeServer({port:0,allowedOrigin:origin,resolveSession,stateDirectory,arrivalTutorialEnabled:false,ambientCampfire:false,flightPilotEnabled:enabled,flightPilotAuthorize:()=>authorized});
  const address=await server.listen();
  const socket=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin,cookie:'clareira_session=test'}});
  t.after(async()=>{socket.terminate();await server.close();await rm(stateDirectory,{recursive:true,force:true});});
  const initial=await waitFor(socket,m=>m.type==='state'&&m.players?.length===1);
  const id=initial.players[0].id;
  const commands=Array.from({length:36},(_,i)=>({seq:i+1,motion:true,x:0,y:0,flight:{x:0,y:0,vertical:1,profile:'smooth'}}));
  let earlier;
  for(let start=1;start<=36;start+=12){
    const ack=waitFor(socket,m=>m.type==='state'&&m.players?.some(p=>p.id===id&&p.inputSeq>=start+11));
    socket.send(JSON.stringify({type:'input',commands:commands.slice(start-1,start+11)}));
    var snapshot=await ack;
    if(start===13)earlier=snapshot.players.find(p=>p.id===id);
  }
  const player=snapshot.players.find(p=>p.id===id);
  assert.equal(snapshot.flightPilotAllowed,enabled&&authorized);
  if(enabled&&authorized){
    assert.ok(player.flightZ>surfaceHeight(player.x,player.y));assert.ok(player.z>0);
    const move=(p,c,dt,others)=>stepPlayer(p,c,dt,others,[],0,[],{flightAuthorized:true});
    const replay=reconcilePrediction(earlier,commands,move).position;
    assert.ok(Math.abs(replay.flightZ-player.flightZ)<1e-9,'replay matches server altitude');
    const closed=new Promise(resolve=>socket.once('close',resolve));socket.close();await closed;
    const next=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin,cookie:'clareira_session=test'}});
    t.after(()=>next.terminate());
    const resumed=await waitFor(next,m=>m.type==='state'&&m.players?.length===1);
    const restored=resumed.players[0];
    assert.equal(restored.z,0,'reconnect returns safely to ground');
    assert.equal(restored.flightZ,null);
    assert.ok(canOccupy(restored));
    assert.ok(restored.inputSeq>=player.inputSeq);
  }
  else {assert.equal(player.flightZ,undefined);assert.equal(player.z,0);}
});
