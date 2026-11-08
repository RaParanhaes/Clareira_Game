import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementDiagnostics, MAX_MOVEMENT_DIAGNOSTIC_MESSAGE_BYTES } from './movement-diagnostics.mjs';

function memoryStorage(){const values=new Map();return{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}

test('movement reports persist across reconnect, acknowledge idempotently, and exclude arbitrary text',()=>{
 const storage=memoryStorage();let clock=100;
 const first=createMovementDiagnostics({storage,now:()=>clock});
 first.record('input-send',{firstSeq:2,lastSeq:13,count:12,pending:13,x:1,y:0,run:true,chat:'private text'});
 first.record('connection-close',{attempt:2,code:1006,pending:4,outbound:1,lastSentSeq:13,lastAckSeq:9,reason:'abnormal-close'},{persist:true});
 const report=first.takeBatch();assert.equal(report.events.length,2);assert.equal(report.events[0].chat,undefined);
 assert.equal(report.events[1].reason,'abnormal-close');
 const restored=createMovementDiagnostics({storage,now:()=>clock+1});
 assert.deepEqual(restored.takeBatch(),report,'the same unacknowledged report is resent after reconnect');
 assert.equal(restored.acknowledge('wrong-id'),false);assert.equal(restored.acknowledge(report.reportId),true);
 assert.equal(restored.size,0);
});

test('movement diagnostics keep a bounded ring without corrupting an in-flight report',()=>{
 const diagnostics=createMovementDiagnostics({storage:memoryStorage(),now:()=>50});
 for(let i=0;i<30;i++)diagnostics.record('frame-gap',{frameGapMs:i});
 const report=diagnostics.takeBatch();assert.equal(report.events.length,24);
 for(let i=30;i<100;i++)diagnostics.record('frame-gap',{frameGapMs:i});
 assert.equal(diagnostics.size,64);
 assert.equal(diagnostics.takeBatch().reportId,report.reportId);
 assert.deepEqual(diagnostics.takeBatch().events,report.events);
 diagnostics.acknowledge(report.reportId);
 assert.equal(diagnostics.size,40);
});

test('movement reports stay within the WebSocket byte limit and continue in order after acknowledgment',()=>{
 const storage=memoryStorage();const diagnostics=createMovementDiagnostics({storage,now:()=>50});
 const details={stage:4,percent:100,authenticated:true,snapshotReady:true,assetsReady:true,predictionReady:true,sceneReady:true,
  pendingAssets:1_000_000,pendingAvatar:1_000_000,pendingTerrain:1_000_000,pendingThemes:1_000_000,pendingLights:1_000_000,
  receivedMessages:1_000_000,receivedStates:1_000_000,welcomeReceived:true,processingPhase:1_000_000,lastMessageAgeMs:1_000_000};
 for(let i=0;i<30;i++)diagnostics.record('loading-wait',details,{persist:true});
 const saved=JSON.parse(storage.getItem('clareira-movement-diagnostics-v1'));
 saved.pendingReport={reportId:'legacy-oversized-report',count:24};
 storage.setItem('clareira-movement-diagnostics-v1',JSON.stringify(saved));

 const encoder=new TextEncoder();
 const restored=createMovementDiagnostics({storage,now:()=>51});
 const first=restored.takeBatch();
 assert.ok(first.events.length<24,'large batches are split before they exceed the server limit');
 assert.equal(first.reportId,'legacy-oversized-report','an old oversized report keeps its id while being reduced');
 assert.ok(encoder.encode(JSON.stringify(first)).byteLength<=MAX_MOVEMENT_DIAGNOSTIC_MESSAGE_BYTES);
 const reconnected=createMovementDiagnostics({storage,now:()=>52});
 assert.deepEqual(reconnected.takeBatch(),first,'an unacknowledged, size-limited batch is stable across reconnects');

 const sent=[];
 let report=first;
 while(report){
  sent.push(...report.events);
  assert.ok(encoder.encode(JSON.stringify(report)).byteLength<=MAX_MOVEMENT_DIAGNOSTIC_MESSAGE_BYTES);
  assert.equal(reconnected.acknowledge(report.reportId),true);
  report=reconnected.takeBatch();
 }
 assert.equal(sent.length,30);
 assert.equal(reconnected.size,0);
});

test('loading diagnostics keep readiness counters and discard arbitrary scene/account details',()=>{
 const diagnostics=createMovementDiagnostics({storage:{getItem:()=>null,setItem(){}},now:()=>10});
 diagnostics.record('loading-wait',{stage:3,percent:60.7,authenticated:true,snapshotReady:true,assetsReady:false,
  pendingAssets:2,pendingAvatar:0,pendingTerrain:5,pendingLights:3,username:'private',roomKey:'private',taskId:'private'});
 const event=diagnostics.takeBatch().events[0];
 assert.equal(event.percent,60.7);assert.equal(event.pendingLights,3);assert.equal(event.assetsReady,false);
 assert.equal(event.username,undefined);assert.equal(event.roomKey,undefined);assert.equal(event.taskId,undefined);
});
