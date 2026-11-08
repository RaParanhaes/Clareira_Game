import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPerformanceReport, createPerformanceTelemetry } from './performance-telemetry.mjs';
import { analyzePerformanceTelemetry } from '../scripts/analyze-performance-telemetry.mjs';

test('periodic telemetry bounds samples and reports only coarse performance fields',()=>{
 let now=0;const telemetry=createPerformanceTelemetry({now:()=>now,windowMs:11_000});
 for(let index=0;index<100;index++){telemetry.observeFrame(index%20===0?300:100);telemetry.observeDraw(8+index%3);}
 telemetry.observeAck(80);telemetry.observeAck(120);telemetry.observeZoomWait(450);telemetry.observeDimensionRequest(210);telemetry.observeDimensionArrival(2400);
 const mostlyHidden=createPerformanceTelemetry({now:()=>now,windowMs:11_000});mostlyHidden.observeFrame(16);
 assert.equal(mostlyHidden.createReport(100_000,{location:'clearing',device:'desktop',zoom:'80-110'}),null);
 const report=telemetry.createReport(11_000,{location:'clearing',device:'desktop',zoom:'80-110',dimensionId:'private-world'});
 assert.equal(report.metrics.frameCount,100);assert.equal(report.metrics.frameSamples,10);
 assert.equal(report.metrics.drawSamples,10);assert.equal(report.metrics.drawP95Ms,10);assert.equal(report.windowMs,11_000);
 assert.equal(report.metrics.stalls50,100);assert.equal(report.metrics.stalls250,5);
 assert.equal(report.metrics.ackP95Ms,120);assert.equal(report.metrics.zoomWaitP95Ms,450);
 assert.equal(report.metrics.dimensionRequests,1);assert.equal(report.metrics.dimensionRequestP95Ms,210);
 assert.equal(report.metrics.dimensionArrivalP95Ms,2400);assert.equal(report.context.dimensionId,undefined);
 assert.equal(report.playerId,undefined);assert.equal(cleanPerformanceReport({...report,account:'private'}).account,undefined);
});

test('render phase telemetry samples one frame in ten and validates only known phases',()=>{
 let now=0;const telemetry=createPerformanceTelemetry({now:()=>now,windowMs:10_000});
 for(let index=0;index<100;index++){
  telemetry.observeFrame(100);now+=100;
  if(telemetry.shouldSampleRenderFrame())for(const phase of ['setup','background','shadows','entityPreparation','entities','effects'])telemetry.observeRenderPhase(phase,index);
 }
 const report=telemetry.createReport(now,{location:'clearing',device:'mobile',zoom:'under-80'});
 assert.equal(report.metrics.renderPhases.setup.samples,10);
 assert.equal(report.metrics.renderPhases.setup.p95Ms,99);
 assert.equal(cleanPerformanceReport({...report,metrics:{...report.metrics,renderPhases:{...report.metrics.renderPhases,unknown:{samples:0,p95Ms:null,maxMs:null}}}}).metrics.renderPhases.unknown,undefined);
 assert.equal(cleanPerformanceReport({...report,metrics:{...report.metrics,renderPhases:{...report.metrics.renderPhases,entities:{samples:-1,p95Ms:null,maxMs:null}}}}),null);
});

test('server validator rejects malformed/range-invalid telemetry and limits categories',()=>{
 const base={type:'performanceMetrics',version:1,reportId:'test-report-id-1234',windowMs:60_000,
  context:{location:'room',device:'mobile',zoom:'over-110'},metrics:{frameCount:3600,frameSamples:360,drawSamples:360,
   stalls50:12,stalls250:2,fps:60,frameP50Ms:16.7,frameP95Ms:33.4,frameP99Ms:50,drawP50Ms:4,drawP95Ms:8,drawP99Ms:12,ackSamples:0,ackP95Ms:null,
   zoomChanges:0,zoomWaitP95Ms:null,dimensionRequests:0,dimensionRequestP95Ms:null,dimensionArrivals:0,dimensionArrivalP95Ms:null}};
 assert.deepEqual(cleanPerformanceReport(base),base);
 assert.equal(cleanPerformanceReport({...base,metrics:{...base.metrics,stalls250:13}}),null);
 assert.equal(cleanPerformanceReport({...base,context:{...base.context,location:'hidden-dimension-id'}}),null);
 assert.equal(cleanPerformanceReport({...base,windowMs:1_000_000}),null);
});

test('audit summarizes structured server reports by coarse context and load band',()=>{
 const entries=[
  {type:'game-performance-report',windowMs:60_000,context:{device:'mobile',location:'clearing',zoom:'80-110'},playerCountBand:'6-10',metrics:{fps:30,frameP95Ms:48,frameP99Ms:75,drawP95Ms:16,drawP99Ms:22,ackP95Ms:90,zoomWaitP95Ms:null,dimensionRequestP95Ms:null,dimensionArrivalP95Ms:4000,stalls50:4,stalls250:1}},
  {type:'game-performance-report',windowMs:60_000,context:{device:'mobile',location:'clearing',zoom:'80-110'},playerCountBand:'6-10',metrics:{fps:28,frameP95Ms:52,frameP99Ms:81,drawP95Ms:19,drawP99Ms:27,ackP95Ms:110,zoomWaitP95Ms:200,dimensionRequestP95Ms:220,dimensionArrivalP95Ms:6000,stalls50:6,stalls250:2}},
  {type:'movement-server-tick-slow',tickDurationMs:130,players:9,wildlifeStepTotalMs:40,wildlifeStepMaxMs:32,wildlifeBehaviorMs:15,wildlifeMovementMs:9,wildlifePopulationMax:12,wildlifeActiveAnimals:8,wildlifeDecisions:2,wildlifeCanOccupyCalls:4,wildlifeOcclusionCalls:3,wildlifeFindWaterCalls:1},
  {type:'movement-diagnostic-report',events:[{kind:'input-ack-stall',ageMs:800},{kind:'frame-gap',frameGapMs:300}]},
 ].map(item=>JSON.stringify(item)).join('\n');
 const result=analyzePerformanceTelemetry(entries);
 assert.equal(result.reportWindows,2);
 assert.equal(result.byContext['mobile/clearing/80-110/6-10'].medianFps,28);
 assert.equal(result.byContext['mobile/clearing/80-110/6-10'].stalls250PerMinute,1.5);
 assert.equal(result.server.tickDurationP95Ms,130);assert.equal(result.server.slowTickPopulationBands['6-10'],1);
 assert.equal(result.server.slowTickPhaseP95Ms.wildlifeStepTotal,40);assert.equal(result.server.slowTickPhaseP95Ms.wildlifeStepMax,32);assert.equal(result.server.wildlifePopulationMax,12);
 assert.equal(result.server.slowTickPhaseP95Ms.wildlifeBehavior,15);assert.equal(result.server.slowTickPhaseP95Ms.wildlifeMovement,9);
 assert.deepEqual(result.server.wildlifeSlowTickWorkP95,{activeAnimals:8,decisions:2,canOccupyCalls:4,occlusionCalls:3,findWaterCalls:1});
 assert.equal(result.movementDiagnostics.inputAckStallAgeP95Ms,800);assert.equal(result.movementDiagnostics.frameGapP95Ms,300);
});

test('rare render spikes between percentile samples are retained as maxima without biasing the percentiles',()=>{
 let now=0;const telemetry=createPerformanceTelemetry({now:()=>now,windowMs:10_000});
 for(let index=0;index<100;index++){
  telemetry.observeFrame(100);now+=100;const sample=telemetry.shouldSampleRenderFrame(),duration=index===42?1000:2;
  telemetry.observeDraw(duration);
  for(const phase of ['setup','background','shadows','entityPreparation','entities','effects'])telemetry.observeRenderPhase(phase,duration,sample);
 }
 const report=telemetry.createReport(now,{location:'clearing',device:'mobile',zoom:'under-80'});
 assert.equal(report.metrics.drawP95Ms,2);assert.equal(report.metrics.drawMaxMs,1000);
 assert.equal(report.metrics.renderPhases.entities.samples,10);
 assert.equal(report.metrics.renderPhases.entities.p95Ms,2);assert.equal(report.metrics.renderPhases.entities.maxMs,1000);
 assert.equal(cleanPerformanceReport({...report,metrics:{...report.metrics,drawMaxMs:-1}}),null);
});

test('high refresh rate windows remain valid after bounded sample reservoirs fill',()=>{
 let at=0;const telemetry=createPerformanceTelemetry({now:()=>at});
 for(let i=0;i<14400;i++){at+=5;telemetry.observeFrame(5);telemetry.observeDraw(1);telemetry.observeTerrain(0,0,false);}
 const report=telemetry.createReport(at,{location:'clearing',device:'mobile',zoom:'80-110'});
 assert.ok(report);assert.equal(report.metrics.fps,200);
 assert.equal(report.metrics.frameSamples,360);assert.equal(report.metrics.terrainWorkSamples,360);
 assert.ok(cleanPerformanceReport(report));
});
