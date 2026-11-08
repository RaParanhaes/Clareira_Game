import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./main.js',import.meta.url),'utf8');
const retry=source.slice(source.indexOf('function retryCurrentSceneLoading()'),source.indexOf('function currentDimensionLoadingName()'));
test('retrying a prepared connection preserves the confirmed scene and cached assets',()=>{
 const calls=[],self={location:'room',appearance:{body:'male'},x:13,y:8};
 const context={authenticated:true,connectionSnapshotReady:true,socket:{readyState:1},WebSocket:{OPEN:1},
  loadingReload:{hidden:false},livePlayers:new Map([['self',self]]),selfId:'self',loadingGeneration:3,
  sceneReady:false,assetsReady:false,lightingRevealStartedAt:1,assetScene:'room',avatarAssetVariant:'male',
  loadingScreen:{dataset:{}},worldDimensionId:'surface',clearSceneProgressWatchdog(){},
  prepareSceneAssets:(...args)=>calls.push(args),connect:()=>assert.fail('a complete connection must not be replaced')};
 runInNewContext(`${retry};retryCurrentSceneLoading();`,context);
 assert.equal(context.authenticated,true);assert.equal(context.loadingGeneration,4);
 assert.equal(context.assetScene,null);assert.equal(context.loadingReload.hidden,true);
 assert.equal(calls[0][0],'room');assert.equal(calls[0][2],self);
});
test('retrying before an authoritative snapshot replaces only the failed connection',()=>{
 const calls=[];const old={readyState:1,close:()=>calls.push('close')};
 const context={authenticated:true,connectionSnapshotReady:false,socket:old,WebSocket:{OPEN:1},
  loadingReload:{},livePlayers:new Map(),selfId:'self',connect:()=>calls.push('connect')};
 runInNewContext(`${retry};retryCurrentSceneLoading();`,context);
 assert.deepEqual(calls,['close','connect']);assert.equal(context.authenticated,true);
});
test('a stalled known loading step offers local recovery without automatically reloading the page',()=>{
 const watchdog=source.slice(source.indexOf('function scheduleSceneProgressWatchdog('),source.indexOf('function retryCurrentSceneLoading()'));
 let callback;const actions=[];const state={known:true,finished:false,activeLabel:'Preparando os textos'};
 const context={clearSceneProgressWatchdog(){},sceneReady:false,loadingScreen:{hidden:false},
  setTimeout:fn=>{callback=fn;},document:{hidden:false},lastProgressSignature:'same',
  loadingProgress:{snapshot:()=>state},showLoadingFailure:text=>actions.push(text),loadingReload:{},retryCurrentSceneLoading(){},
  location:{reload:()=>assert.fail('automatic reload loses loading progress')}};
 runInNewContext(`${watchdog};scheduleSceneProgressWatchdog(${JSON.stringify(state)},'same');`,context);
 callback();assert.equal(actions.length,1);assert.match(actions[0],/Preparando os textos/);
 assert.equal(context.loadingReload.onclick,context.retryCurrentSceneLoading);
});

test('a newly deployed version never automatically reloads an authenticated session',()=>{
 const policy=source.slice(source.indexOf('export function canApplyGameUpdate()'),source.indexOf('export function inspectWildlifeMotion()')).replace('export ','');
 const context={authenticated:true};
 assert.equal(runInNewContext(`${policy};canApplyGameUpdate();`,context),false);
});


test('the first complete resumed snapshot starts a fresh send window after earlier partial ACKs',()=>{
 const mark=source.slice(source.indexOf('function markConnectionSnapshotReady()'),source.indexOf('let loadingReceivedMessages='));
 const context={connectionSnapshotReady:false,lastInputProgressAt:1000,inputPressureSince:1000,inputPressureReported:true,
  recoveryCloseRequested:false,performance:{now:()=>8000}};
 runInNewContext(`${mark};first=markConnectionSnapshotReady();`,context);
 assert.equal(context.first,true);assert.equal(context.lastInputProgressAt,8000);assert.equal(context.inputPressureSince,0);
 context.performance.now=()=>8500;
 assert.equal(runInNewContext('markConnectionSnapshotReady()',context),false,'ordinary snapshots cannot conceal a real stalled ACK');
 assert.equal(context.lastInputProgressAt,8000);
});
