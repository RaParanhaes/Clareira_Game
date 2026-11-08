import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';
import { SPAWN, SPAWN_CAMPFIRE, RESOURCE_NODES, CLEARING_DOOR, getRoomLayout, findWalkPath, canOccupy, stepPlayer } from '../game/world.mjs';
import { reconcilePrediction } from '../game/prediction.mjs';

test('servidor confirma passos simulados; repetir pacotes não duplica movimento; chegada tem fogo e recursos',async t=>{
  const origin='http://movement-test.local';
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-movement-integration-'));
  t.after(()=>rm(stateDirectory,{recursive:true,force:true}));
  const room=createPrototypeServer({port:0,allowedOrigin:origin,stateDirectory,ambientCampfire:true,arrivalTutorialEnabled:false,resolveSession:()=>({profile:{guest:true,displayName:'Teste',inventory:{wood:0,stone:0,berries:0}}})});
  const address=await room.listen();t.after(()=>room.close());
  const ws=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin}});t.after(()=>ws.terminate());
  let latest;const waiters=[];
  ws.on('message',raw=>{
    const data=JSON.parse(raw);if(data.type!=='state')return;latest=data;
    for(const waiter of [...waiters])if(waiter.condition(data)){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timeout);waiter.resolve(data);}
  });
  const until=condition=>latest&&condition(latest)?Promise.resolve(latest):new Promise((resolve,reject)=>{
    const waiter={condition,resolve};waiter.timeout=setTimeout(()=>reject(new Error('movement state timeout')),4000);waiters.push(waiter);
  });
  const initial=await until(data=>data.players.length===1);
  assert.ok(initial.fires.some(f=>f.permanent&&f.x===SPAWN_CAMPFIRE.x));
  assert.ok(initial.resources.length > 0);
  assert.ok(initial.resources.length < 500, 'a chegada recebe recursos da área próxima, não do mundo inteiro');
  const commands=Array.from({length:60},(_,i)=>({seq:i+1,x:1,y:0}));
  for(let i=0;i<commands.length;i+=6)ws.send(JSON.stringify({type:'input',commands:commands.slice(i,i+6)}));
  const halfway=await until(data=>data.players[0].inputSeq>=18);
  let predicted={x:initial.players[0].x,y:initial.players[0].y};for(const command of commands)predicted=stepPlayer(predicted,command,1/60);
  const reconciled=reconcilePrediction(halfway.players[0],commands,stepPlayer);
  assert.ok(Math.hypot(predicted.x-reconciled.position.x,predicted.y-reconciled.position.y)<1e-8);
  const final=await until(data=>data.players[0].inputSeq===60);
  assert.ok(Math.hypot(final.players[0].x-predicted.x,final.players[0].y-predicted.y)<1e-8);
  ws.send(JSON.stringify({type:'input',commands:commands.slice(-6)}));
  await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(latest.players[0].inputSeq,60);
  assert.equal(latest.players[0].x,final.players[0].x);
  let position={x:final.players[0].x,y:final.players[0].y},seq=60;
  const route=findWalkPath(position,CLEARING_DOOR),walk=[];
  assert.ok(route.length);
  for(const waypoint of route) {
    for(let i=0;i<100&&Math.hypot(position.x-waypoint.x,position.y-waypoint.y)>.08;i++) {
      const dx=waypoint.x-position.x,dy=waypoint.y-position.y,length=Math.hypot(dx,dy),speed=Math.min(1,length/(3.2/60));
      const command={seq:++seq,x:dx/length*speed,y:dy/length*speed};
      position=stepPlayer(position,command,1/60);walk.push(command);
    }
  }
  for(let i=0;i<walk.length;i+=12) {
    const batch=walk.slice(i,i+12);ws.send(JSON.stringify({type:'input',location:'clearing',commands:batch}));
    await until(data=>data.players[0].inputSeq>=batch.at(-1).seq);
  }
  ws.send(JSON.stringify({type:'action',name:'interact'}));
  const entered=await until(data=>data.players[0].location==='room');
  const entryPosition={x:entered.players[0].x,y:entered.players[0].y};
  assert.deepEqual(entryPosition,getRoomLayout('lobby','arrival').spawn,'a recepção usa sua chegada própria');
  ws.send(JSON.stringify({type:'input',location:'clearing',commands:[{seq:++seq,x:0,y:-1}]}));
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.deepEqual({x:latest.players[0].x,y:latest.players[0].y},entryPosition,'um pacote antigo não desloca o jogador dentro do quarto');
  assert.equal(latest.resources.length,0);
  ws.send(JSON.stringify({type:'action',name:'interact'}));
  const returned=await until(data=>data.players[0]?.location==='clearing');
  assert.equal(canOccupy(returned.players[0]),true,'a saída não fica dentro do volume do abrigo');
});

test('timer lento acompanha o tempo real e reconexão curta preserva a posição da sessão',async t=>{
 const origin='http://movement-test.local';
 const room=createPrototypeServer({port:0,tickIntervalMs:80,allowedOrigin:origin,resolveSession:()=>({profile:{id:'resume-test',guest:true,displayName:'Teste',inventory:{wood:0,stone:0,berries:0}}})});
 const address=await room.listen();t.after(()=>room.close());
 const open=()=>new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin}});
 const wait=(ws,predicate)=>new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{ws.off('message',receive);reject(new Error('state timeout'))},3000);
  function receive(raw){const state=JSON.parse(raw);if(state.type==='state'&&predicate(state)){clearTimeout(timeout);ws.off('message',receive);resolve(state)}}
  ws.on('message',receive);
 });
 const ws=open();t.after(()=>ws.terminate());await wait(ws,s=>s.players.length===1);
 let seq=0;const started=Date.now();
 for(let batch=0;batch<20;batch++){
  ws.send(JSON.stringify({type:'input',location:'clearing',commands:Array.from({length:6},()=>({seq:++seq,x:1,y:0}))}));
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 const timely=await wait(ws,s=>s.players[0].inputSeq>=108);
 const elapsed=Date.now()-started;
 assert.ok(elapsed<3000,`o servidor recupera o atraso sem acumular segundos na fila (${elapsed} ms)`);
 assert.ok(timely.players[0].inputSeq>=108,'80 ms callbacks devem confirmar perto de 120 passos em dois segundos');
 const final=await wait(ws,s=>s.players[0].inputSeq===120);
 const queued=Array.from({length:6},(_,index)=>({seq:121+index,x:0,y:1}));
 ws.send(JSON.stringify({type:'input',location:'clearing',commands:queued}));
 await new Promise(resolve=>setTimeout(resolve,12));
 const closed=new Promise(resolve=>ws.once('close',resolve));ws.close();await closed;
 const resumed=open();t.after(()=>resumed.terminate());
 const state=await wait(resumed,s=>s.players.length===1&&s.players[0].inputSeq>=126);
 let expected={x:final.players[0].x,y:final.players[0].y};
 for(const command of queued)expected=stepPlayer(expected,command,1/60);
 assert.ok(Math.hypot(state.players[0].x-expected.x,state.players[0].y-expected.y)<1e-8,
  'movimentos já recebidos antes da queda terminam de ser simulados depois da retomada');
 assert.equal(state.players[0].inputSeq,126,'a sequência continua sem voltar para zero');
});

test('uma única coleta usa a posição prevista antes do tick e registra a transferência no armazenamento', async t => {
  const origin = 'http://interaction-order-test.local';
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-interaction-order-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const profileId = '33f82d37-208f-4f91-a112-f80dc8b390b1';
  const room = createPrototypeServer({ port: 0, allowedOrigin: origin, stateDirectory, arrivalTutorialEnabled: false,
    tickIntervalMs: 500, snapshotIntervalMs: 100,
    resolveSession: () => ({ profile: { id: profileId, guest: true, displayName: 'Teste', inventory: {} } }) });
  const address = await room.listen(); t.after(() => room.close());
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, { headers: { origin } });
  t.after(() => socket.terminate());
  let latest;
  const stateWaiters = [];
  const noticeWaiters = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'state') {
      latest = message;
      for (const waiter of [...stateWaiters]) if (waiter.predicate(message)) {
        stateWaiters.splice(stateWaiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(message);
      }
    } else if (message.type === 'notice') {
      for (const waiter of [...noticeWaiters]) if (waiter.predicate(message)) {
        noticeWaiters.splice(noticeWaiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(message);
      }
    }
  });
  const waitFor = (collection, predicate, current = null) => current && predicate(current) ? Promise.resolve(current) : new Promise((resolve, reject) => {
    const waiter = { predicate, resolve };
    waiter.timer = setTimeout(() => { collection.splice(collection.indexOf(waiter), 1); reject(new Error('interaction response timeout')); }, 3500);
    collection.push(waiter);
  });
  const initial = await waitFor(stateWaiters, state => state.players.length === 1, latest);
  const target = RESOURCE_NODES.find(resource => resource.id === 'dry-leaves-start');
  const dx = target.x - initial.players[0].x, dy = target.y - initial.players[0].y, length = Math.hypot(dx, dy);
  const commands = Array.from({ length: 24 }, (_, index) => ({ seq: index + 1, x: dx / length, y: dy / length, motion: true }));
  socket.send(JSON.stringify({ type: 'input', location: 'clearing', commands: commands.slice(0, 12) }));
  socket.send(JSON.stringify({ type: 'input', location: 'clearing', commands: commands.slice(12) }));
  socket.send(JSON.stringify({ type: 'action', name: 'collect', requestId: 41, inputSeq: 24, resourceId: target.id }));

  const collected = await waitFor(noticeWaiters, message => message.action === 'collect' && message.requestId === 41 && message.result === 'collected');
  assert.equal(collected.resource.id, target.id);
  const final = await waitFor(stateWaiters, state => state.players[0]?.inputSeq === 24 && state.players[0]?.inventory.leaves === 1, latest);
  assert.ok(Math.hypot(final.players[0].x - target.x, final.players[0].y - target.y) < 1.2,
    'server applies the movement commands ordered before the collection');

  const lines = (await readFile(path.join(stateDirectory, 'interactions.ndjson'), 'utf8')).trim().split('\n');
  const event = JSON.parse(lines.at(-1));
  assert.equal(event.actorProfileId, profileId);
  assert.equal(event.action, 'collect');
  assert.equal(event.placeId, 'clearing');
  assert.equal(event.objectId, target.id);
  assert.deepEqual(event.objectProperties, { x: target.x, y: target.y });
  assert.equal(event.transfer.from.type, 'ground');
  assert.equal(event.transfer.to.type, 'inventory');
  assert.equal(event.transfer.to.itemId, 'leaves');
  assert.equal(event.transfer.to.quantity, 1);
});
