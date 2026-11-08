import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimePerformance} from './runtime-performance.mjs';
test('bounded metrics retain spikes, distinguish transport from frames and exclude private state',()=>{
 const m=createRuntimePerformance({capacity:4,historyLimit:2});
 for(const interval of [10,10,10,300])m.frame(interval,5);
 m.connect();m.connect();m.receive(100);m.snapshot(1000);
 m.receive(200,true);m.longTask();m.ping(90);m.ping(120);const current=m.snapshot(2000,{pingMs:90,pendingInputs:3,account:'secret',x:42});
 assert.equal(current.pingMs,120);assert.equal(current.jitterMs,30);
 assert.equal(current.fps,12.1);assert.equal(current.frameP95Ms,300);assert.equal(current.stalls250,1);
 assert.equal(current.messagesPerSecond,1);assert.equal(current.payloadCharsPerSecond,200);
 assert.equal(current.coalescedStates,1);assert.equal(current.reconnections,1);assert.equal(current.heapUsedMiB,null);
 for(let i=0;i<100;i++){m.frame(16,2);m.snapshot(3000+i*1000);m.report({fps:i});}
 const report=m.export();assert.equal(report.history.length,2);assert.equal(report.reports.length,10);
 assert.equal(report.history[0].samples,4);assert.equal(report.history[0].frameMaxMs,16);
 assert.ok(!JSON.stringify(report).includes('secret'));report.history[0].fps=0;assert.notEqual(m.export().history[0].fps,0);
});

test('actual HUD updater reads module-visible diagnostics and renders without profiler or memory API',async()=>{
 const {readFile}=await import('node:fs/promises');
 const main=await readFile(new URL('./main.js',import.meta.url),'utf8');
 const source=main.slice(main.indexOf('function updateRuntimePerformance(now){'),main.indexOf('\nconst performanceToggle='));
 const panel={hidden:false,textContent:''};const runtime=createRuntimePerformance();runtime.frame(16,4);runtime.receive(100,false,900);
 const context={lightmapStats:()=>({bytes:123,pending:2}),runtimePerformance:runtime,pendingInputs:[],outboundInputs:[],socket:{readyState:1,bufferedAmount:0},WebSocket:{OPEN:1},performance:{},canvas:{width:390,height:844},lastVisibleThingCount:10,sceneReady:true,document:{hidden:false,getElementById:()=>panel},worldLocation:'clearing',cameraZoomPercent:100,canvasPixelRatio:1,innerWidth:390,innerHeight:844};
 const update=new Function(...Object.keys(context),`let runtimePerformanceSnapshot=null;${source};updateRuntimePerformance(1000);return runtimePerformanceSnapshot;`);
 const snapshot=update(...Object.values(context));assert.equal(snapshot.lastMessageAgeMs,100);assert.equal(snapshot.heapUsedMiB,null);assert.match(panel.textContent,/62.5 FPS/);assert.equal(snapshot.connected,true);
});

test('ping diagnostics preserve measured RTT and tolerate old servers or malformed optional fields',()=>{
 const metrics=createRuntimePerformance();metrics.ping(265,{serverLoopLagMs:105,serverWorkMs:.2,serverBufferedBytes:100});
 const snapshot=metrics.snapshot(1000);assert.equal(snapshot.pingMs,265);assert.equal(snapshot.serverLoopLagMs,105);assert.equal(snapshot.serverWorkMs,.2);
 metrics.ping(270,{serverLoopLagMs:Infinity,serverWorkMs:-1});const next=metrics.snapshot(2000);assert.equal(next.serverLoopLagMs,null);assert.equal(next.serverWorkMs,null);
});
