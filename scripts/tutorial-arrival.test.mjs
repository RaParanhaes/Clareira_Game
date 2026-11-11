import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPrototypeServer } from './prototype-server.mjs';

const ORIGIN = 'https://arrival-test.clareira.invalid';
const profiles = new Map([
  ['arrival-a', { id:'6d41d4a4-1003-4b2f-a6f9-d87ca1195bf1', displayName:'Viajante A', guest:true, inventory:{} }],
  ['arrival-b', { id:'f725466d-8ecc-47c3-8af0-eeb90bcb11ea', displayName:'Viajante B', guest:true, inventory:{} }],
]);
function connect(address, token) {
  return new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers:{ origin:ORIGIN, cookie:`clareira_session=${token}` },
  });
}
function waitFor(socket, predicate, description, timeout=6000) {
  return new Promise((resolve,reject)=>{
    let last;
    const timer=setTimeout(()=>{socket.off('message',listener);reject(new Error(`Timed out waiting for ${description}${last?`: last state ${JSON.stringify(last.players?.[0])} dimension=${last.dimensionId}`:''}`));},timeout);
    const listener=raw=>{
      let message;try{message=JSON.parse(raw.toString());}catch{return;}
      if(message.type==='state')last=message;
      if(!predicate(message))return;
      clearTimeout(timer);socket.off('message',listener);resolve(message);
    };
    socket.on('message',listener);
  });
}

test('novatos recebem Breus planos e privados e só deixam a instância pelo fluxo de tutorial', async t => {
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-arrival-test-'));
  const server=createPrototypeServer({host:'127.0.0.1',port:0,stateDirectory,allowedOrigin:ORIGIN,arrivalTutorialEnabled:true,
    resolveSession:token=>profiles.has(token)?{profile:profiles.get(token)}:null});
  t.after(async()=>{await server.close();await rm(stateDirectory,{recursive:true,force:true});});
  const address=await server.listen();
  const first=connect(address,'arrival-a'),second=connect(address,'arrival-b');
  t.after(()=>{first.terminate();second.terminate();});
  const firstStatePromise=waitFor(first,m=>m.type==='state'&&m.dimensionId?.startsWith('arrival-')&&m.players?.length===1,'private first arrival');
  const secondStatePromise=waitFor(second,m=>m.type==='state'&&m.dimensionId?.startsWith('arrival-')&&m.players?.length===1,'private second arrival');
  const [firstState,secondState]=await Promise.all([firstStatePromise,secondStatePromise]);
  const firstId=firstState.dimensionId,secondId=secondState.dimensionId;
  assert.notEqual(firstId,secondId);
  for(const state of [firstState,secondState]){
    assert.equal(state.dimension.theme,'dark');
    assert.equal(state.dimension.instanceType,'arrival');
    assert.deepEqual(state.worldDefinition.edits,[]);
    assert.deepEqual(state.resources,[]);
    assert.deepEqual(state.animals,[]);
    assert.equal(state.fires.length,1);
    assert.equal(state.fires[0].permanent,true);
    assert.ok(state.fires[0].burnRemainingMs>24*60*60*1000);
    assert.equal(state.arrivalTutorial.phase,'welcome');
    assert.ok(Math.hypot(state.players[0].x-state.fires[0].x,state.players[0].y-state.fires[0].y)>=6.9,
      'arrival starts far enough from the unique tutorial fire');
  }
  assert.ok(firstState.dimensions.some(item=>item.id===firstId));
  assert.ok(!firstState.dimensions.some(item=>item.id===secondId));
  assert.ok(secondState.dimensions.some(item=>item.id===secondId));
  assert.ok(!secondState.dimensions.some(item=>item.id===firstId));

  const forged=waitFor(first,m=>m.type==='notice'&&m.action==='dimensionTravel'&&m.requestId==='private-forgery'&&m.result==='rejected','rejected private-dimension access');
  first.send(JSON.stringify({type:'dimensionTravel',dimensionId:secondId,requestId:'private-forgery'}));
  await forged;

  const skip=waitFor(first,m=>m.type==='notice'&&m.arrivalReady===true,'tutorial skip acknowledgement');
  first.send(JSON.stringify({type:'action',name:'arrivalTutorialChoice',choice:'skip'}));
  await skip;
  const arrived=waitFor(first,m=>m.type==='state'&&m.dimensionId==='surface'&&m.players?.length>=1,'same portal arrival in the forest',7000);
  first.send(JSON.stringify({type:'dimensionTravel',dimensionId:'surface',requestId:'arrival-complete'}));
  const forestState=await arrived;
  assert.ok(forestState.dimensions.some(item=>item.id===firstId));
  assert.ok(!forestState.dimensions.some(item=>item.id===secondId));
  const stillPrivate=await waitFor(second,m=>m.type==='state'&&m.dimensionId===secondId&&m.players?.length===1,'second player remains alone');
  assert.equal(stillPrivate.players[0].dimensionId,secondId);
});


test('approaching the unique fire starts movement guidance and walking into darkness opens the forest transit', async t => {
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-arrival-guide-test-'));
  const server=createPrototypeServer({host:'127.0.0.1',port:0,stateDirectory,allowedOrigin:ORIGIN,arrivalTutorialEnabled:true,
    resolveSession:token=>profiles.has(token)?{profile:profiles.get(token)}:null});
  t.after(async()=>{await server.close();await rm(stateDirectory,{recursive:true,force:true});});
  const address=await server.listen();
  const player=connect(address,'arrival-a');
  t.after(()=>player.terminate());
  const welcome=await waitFor(player,m=>m.type==='state'&&m.dimensionId?.startsWith('arrival-')&&m.arrivalTutorial?.phase==='welcome','private tutorial welcome');
  const guide=welcome.dimension.guide;
  const lessonPromise=waitFor(player,m=>m.type==='state'&&m.arrivalTutorial?.phase==='lesson','first fire lesson',10000);
  player.send(JSON.stringify({type:'input',x:Math.sign(guide.x-welcome.players[0].x),y:Math.sign(guide.y-welcome.players[0].y)}));
  const lesson=await lessonPromise;
  player.send(JSON.stringify({type:'input',x:0,y:0}));
  assert.equal(lesson.arrivalTutorial.step,0);
  const leavesCampfire=waitFor(player,m=>m.type==='state'&&m.dimensionId===welcome.dimensionId
    &&Math.hypot(m.players[0].x-guide.x,m.players[0].y-guide.y)>16.5,'player walks out into darkness',12000);
  player.send(JSON.stringify({type:'input',x:1,y:0}));
  await leavesCampfire;
  player.send(JSON.stringify({type:'input',x:0,y:0}));
  player.send(JSON.stringify({type:'dimensionTravel',dimensionId:'surface',requestId:'darkness-departure'}));
  const arrived=await waitFor(player,m=>m.type==='state'&&m.dimensionId==='surface','guided portal arrival',7000);
  assert.equal(arrived.dimensionId,'surface');
  assert.ok(lesson.dimensionId.startsWith('arrival-'));
});

test('tutorial progresses through movement, chat and a changed appearance', async t => {
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-arrival-steps-test-'));
  const server=createPrototypeServer({host:'127.0.0.1',port:0,stateDirectory,allowedOrigin:ORIGIN,arrivalTutorialEnabled:true,
    resolveSession:token=>profiles.has(token)?{profile:profiles.get(token)}:null});
  t.after(async()=>{await server.close();await rm(stateDirectory,{recursive:true,force:true});});
  const address=await server.listen(),player=connect(address,'arrival-a');
  t.after(()=>player.terminate());
  const welcome=await waitFor(player,m=>m.type==='state'&&m.dimensionId?.startsWith('arrival-')&&m.arrivalTutorial?.phase==='welcome','tutorial welcome');
  const guide=welcome.dimension.guide;
  const lessonPromise=waitFor(player,m=>m.type==='state'&&m.arrivalTutorial?.phase==='lesson','movement lesson');
  player.send(JSON.stringify({type:'input',x:Math.sign(guide.x-welcome.players[0].x),y:Math.sign(guide.y-welcome.players[0].y)}));
  await lessonPromise;
  player.send(JSON.stringify({type:'input',x:0,y:0}));
  const chatPromise=waitFor(player,m=>m.type==='state'&&m.arrivalTutorial?.phase==='chat','chat lesson');
  player.send(JSON.stringify({type:'input',x:1,y:0}));
  await chatPromise;
  player.send(JSON.stringify({type:'input',x:0,y:0}));
  const appearancePromise=waitFor(player,m=>m.type==='state'&&m.arrivalTutorial?.phase==='appearance','appearance lesson');
  player.send(JSON.stringify({type:'chat',text:'A chama me guia.'}));
  const appearance=await appearancePromise;
  const sameAppearance=waitFor(player,m=>m.type==='notice'&&m.text?.includes('Mude pelo menos'),'unchanged appearance rejected');
  player.send(JSON.stringify({type:'appearance',appearance:appearance.players[0].appearance}));
  await sameAppearance;
  await new Promise(resolve=>setTimeout(resolve,300));
  const find=waitFor(player,m=>m.type==='state'&&m.arrivalTutorial?.phase==='find','magic sprig appears');
  const changed={...appearance.players[0].appearance,coat:(appearance.players[0].appearance.coat+1)%5};
  player.send(JSON.stringify({type:'appearance',appearance:changed}));
  const sprig=await find;
  assert.equal(sprig.arrivalTutorial.step,3);
  const ready=waitFor(player,m=>m.type==='state'&&m.arrivalTutorial?.phase==='ready'&&m.arrivalTutorial.completed,'tutorial collection completes the arrival');
  const arrivalNotice=waitFor(player,m=>m.type==='notice'&&m.arrivalReady===true,'arrival teleport begins');
  player.send(JSON.stringify({type:'action',name:'arrivalTutorialCollect'}));
  const completed=await ready;await arrivalNotice;
  assert.equal(completed.arrivalTutorial.step,4);
  assert.equal(completed.players[0].inventory.sturdyBranch,1);
  assert.equal(completed.players[0].inventory.leaves,1);
  const travelled=waitFor(player,m=>m.type==='state'&&m.dimensionId==='surface','tutorial sends the player to the Bosque');
  player.send(JSON.stringify({type:'dimensionTravel',dimensionId:'surface',requestId:'tutorial-finish'}));
  assert.equal((await travelled).dimensionId,'surface');
});

test('o atalho pela escuridão só é possível depois que o jogador sai da área iluminada', async t => {
  const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-arrival-dark-exit-'));
  const server=createPrototypeServer({host:'127.0.0.1',port:0,stateDirectory,allowedOrigin:ORIGIN,arrivalTutorialEnabled:true,
    resolveSession:token=>profiles.has(token)?{profile:profiles.get(token)}:null});
  t.after(async()=>{await server.close();await rm(stateDirectory,{recursive:true,force:true});});
  const address=await server.listen(),player=connect(address,'arrival-a');
  t.after(()=>player.terminate());
  const welcome=await waitFor(player,m=>m.type==='state'&&m.dimensionId?.startsWith('arrival-')&&m.arrivalTutorial?.phase==='welcome','tutorial welcome');
  const fire=welcome.dimension.campfire;
  assert.ok(Math.hypot(welcome.players[0].x-fire.x,welcome.players[0].y-fire.y)>9,'the traveler wakes between the flame and deep darkness');
  const blocked=waitFor(player,m=>m.type==='notice'&&m.action==='dimensionTravel'&&m.result==='rejected','cannot skip from the light');
  player.send(JSON.stringify({type:'dimensionTravel',dimensionId:'surface',requestId:'too-early'}));
  await blocked;
  player.send(JSON.stringify({type:'input',x:1,y:0}));
  await waitFor(player,m=>m.type==='state'&&m.dimensionId===welcome.dimensionId
    &&Math.hypot(m.players[0].x-fire.x,m.players[0].y-fire.y)>=16.5,'walk out of the broad firelight',12000);
  player.send(JSON.stringify({type:'input',x:0,y:0}));
  const travelled=waitFor(player,m=>m.type==='state'&&m.dimensionId==='surface','darkness exit arrives in the forest',10000);
  player.send(JSON.stringify({type:'dimensionTravel',dimensionId:'surface',requestId:'darkness-early-exit'}));
  await travelled;
});
