const MAX_FRAME_SAMPLES=360;
const MAX_EVENT_SAMPLES=24;
const MIN_WINDOW_MS=10_000;
const REPORT_ID=/^[a-z0-9-]{12,80}$/i;
const RENDER_PHASES=['setup','background','shadows','entityPreparation','entities','effects'];

function percentile(values,ratio){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 return Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*ratio)-1)]*10)/10;
}
function id(){
 try{return globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}
 catch{return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function cleanPerformanceReport(report){
 if(!report||report.type!=='performanceMetrics'||report.version!==1
   ||typeof report.reportId!=='string'||!REPORT_ID.test(report.reportId)
   ||!Number.isFinite(report.windowMs)||report.windowMs<MIN_WINDOW_MS||report.windowMs>300_000)return null;
 const metrics=report.metrics;
 if(!metrics||typeof metrics!=='object')return null;
 const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
 const metric=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
 if(!integer(metrics.frameCount,1,72_000)||!integer(metrics.frameSamples,0,MAX_FRAME_SAMPLES)||metrics.frameSamples>metrics.frameCount
   ||!integer(metrics.drawSamples,0,MAX_FRAME_SAMPLES)||metrics.drawSamples>metrics.frameCount
   ||!integer(metrics.stalls50,0,metrics.frameCount)||!integer(metrics.stalls250,0,metrics.stalls50)
   ||!metric(metrics.fps,0,240)
   ||!metric(metrics.frameP50Ms,0,10_000)||!metric(metrics.frameP95Ms,0,10_000)||!metric(metrics.frameP99Ms,0,10_000)
   ||!metric(metrics.drawP50Ms,0,10_000)||!metric(metrics.drawP95Ms,0,10_000)||!metric(metrics.drawP99Ms,0,10_000)
   ||!integer(metrics.ackSamples,0,20_000)||!(metrics.ackP95Ms===null||metric(metrics.ackP95Ms,0,60_000))
   ||!integer(metrics.zoomChanges,0,100)||!integer(metrics.dimensionArrivals,0,100)
   ||!integer(metrics.dimensionRequests,0,100)||!(metrics.dimensionRequestP95Ms===null||metric(metrics.dimensionRequestP95Ms,0,120_000))
   ||!(metrics.zoomWaitP95Ms===null||metric(metrics.zoomWaitP95Ms,0,120_000))
   ||!(metrics.dimensionArrivalP95Ms===null||metric(metrics.dimensionArrivalP95Ms,0,300_000)))return null;
 const terrainFields=['terrainWorkSamples','terrainWorkP95Ms','terrainWorkP99Ms','terrainWorkMaxMs','terrainIncompleteFrames',
  'terrainIncompleteP95Ms','terrainIncompleteMaxMs','terrainQueuePeak'];
 const frameWorkFields=['frameWorkSamples','frameWorkP95Ms','frameWorkMaxMs','longTaskCount','longTaskP95Ms','longTaskMaxMs'];
 const stateMessageFields=['stateMessageSamples','stateMessageP95Ms','stateMessageMaxMs','statePayloadP95Chars','statePayloadMaxChars'];
 const hasTerrainFields=terrainFields.some(key=>Object.hasOwn(metrics,key));
 if(Object.hasOwn(metrics,'drawMaxMs')&&!metric(metrics.drawMaxMs,0,10_000))return null;
 if(hasTerrainFields&&(!integer(metrics.terrainWorkSamples,0,MAX_FRAME_SAMPLES)
   ||!(metrics.terrainWorkP95Ms===null||metric(metrics.terrainWorkP95Ms,0,10_000))
   ||!(metrics.terrainWorkP99Ms===null||metric(metrics.terrainWorkP99Ms,0,10_000))
   ||!(metrics.terrainWorkMaxMs===null||metric(metrics.terrainWorkMaxMs,0,10_000))
   ||!integer(metrics.terrainIncompleteFrames,0,metrics.frameCount+1)
   ||!(metrics.terrainIncompleteP95Ms===null||metric(metrics.terrainIncompleteP95Ms,0,300_000))
   ||!(metrics.terrainIncompleteMaxMs===null||metric(metrics.terrainIncompleteMaxMs,0,300_000))
   ||!integer(metrics.terrainQueuePeak,0,160)))return null;
 const hasFrameWorkFields=frameWorkFields.some(key=>Object.hasOwn(metrics,key));
 if(hasFrameWorkFields&&(!integer(metrics.frameWorkSamples,0,MAX_FRAME_SAMPLES)
   ||!(metrics.frameWorkP95Ms===null||metric(metrics.frameWorkP95Ms,0,10_000))
   ||!(metrics.frameWorkMaxMs===null||metric(metrics.frameWorkMaxMs,0,10_000))
   ||!integer(metrics.longTaskCount,0,10_000)
   ||!(metrics.longTaskP95Ms===null||metric(metrics.longTaskP95Ms,0,300_000))
   ||!(metrics.longTaskMaxMs===null||metric(metrics.longTaskMaxMs,0,300_000))))return null;
 const hasStateMessageFields=stateMessageFields.some(key=>Object.hasOwn(metrics,key));
 if(hasStateMessageFields&&(!integer(metrics.stateMessageSamples,0,MAX_FRAME_SAMPLES)
   ||!(metrics.stateMessageP95Ms===null||metric(metrics.stateMessageP95Ms,0,10_000))
   ||!(metrics.stateMessageMaxMs===null||metric(metrics.stateMessageMaxMs,0,10_000))
   ||!(metrics.statePayloadP95Chars===null||integer(metrics.statePayloadP95Chars,0,10_000_000))
   ||!(metrics.statePayloadMaxChars===null||integer(metrics.statePayloadMaxChars,0,10_000_000))))return null;
 const hasRenderPhases=Object.hasOwn(metrics,'renderPhases');
 if(hasRenderPhases&&(!metrics.renderPhases||typeof metrics.renderPhases!=='object'||Array.isArray(metrics.renderPhases)))return null;
 if(hasRenderPhases)for(const phase of RENDER_PHASES){
  const value=metrics.renderPhases[phase];
  if(!value||!integer(value.samples,0,MAX_FRAME_SAMPLES)
    ||!(value.p95Ms===null||metric(value.p95Ms,0,10_000))
    ||!(value.maxMs===null||metric(value.maxMs,0,10_000)))return null;
 }
 const category=(value,allowed)=>allowed.includes(value)?value:null;
 const location=category(report.context?.location,['room','clearing']);
 const device=category(report.context?.device,['mobile','desktop']);
 const zoom=category(report.context?.zoom,['under-80','80-110','over-110']);
 if(!location||!device||!zoom)return null;
 return {type:'performanceMetrics',version:1,reportId:report.reportId,
  windowMs:Math.round(report.windowMs),context:{location,device,zoom},metrics:{
   frameCount:metrics.frameCount,frameSamples:metrics.frameSamples,drawSamples:metrics.drawSamples,stalls50:metrics.stalls50,stalls250:metrics.stalls250,
   fps:Math.round(metrics.fps*10)/10,frameP50Ms:Math.round(metrics.frameP50Ms*10)/10,
   frameP95Ms:Math.round(metrics.frameP95Ms*10)/10,frameP99Ms:Math.round(metrics.frameP99Ms*10)/10,
   drawP50Ms:Math.round(metrics.drawP50Ms*10)/10,drawP95Ms:Math.round(metrics.drawP95Ms*10)/10,drawP99Ms:Math.round(metrics.drawP99Ms*10)/10,
   ...(Object.hasOwn(metrics,'drawMaxMs')?{drawMaxMs:Math.round(metrics.drawMaxMs*10)/10}:{}),
   ackSamples:metrics.ackSamples,ackP95Ms:metrics.ackP95Ms===null?null:Math.round(metrics.ackP95Ms),
   zoomChanges:metrics.zoomChanges,zoomWaitP95Ms:metrics.zoomWaitP95Ms===null?null:Math.round(metrics.zoomWaitP95Ms),
   dimensionRequests:metrics.dimensionRequests,dimensionRequestP95Ms:metrics.dimensionRequestP95Ms===null?null:Math.round(metrics.dimensionRequestP95Ms),
   dimensionArrivals:metrics.dimensionArrivals,dimensionArrivalP95Ms:metrics.dimensionArrivalP95Ms===null?null:Math.round(metrics.dimensionArrivalP95Ms),
   ...(hasTerrainFields?Object.fromEntries(terrainFields.map(key=>[key,metrics[key]===null?null:key.endsWith('Frames')||key.endsWith('Samples')||key==='terrainQueuePeak'?metrics[key]:Math.round(metrics[key]*10)/10])):{}),
   ...(hasFrameWorkFields?Object.fromEntries(frameWorkFields.map(key=>[key,metrics[key]===null?null:key.endsWith('Count')||key.endsWith('Samples')?metrics[key]:Math.round(metrics[key]*10)/10])):{}),
   ...(hasStateMessageFields?Object.fromEntries(stateMessageFields.map(key=>[key,metrics[key]===null?null:key.endsWith('Bytes')||key.endsWith('Samples')?metrics[key]:Math.round(metrics[key]*10)/10])):{}),
   ...(hasRenderPhases?{renderPhases:Object.fromEntries(RENDER_PHASES.map(phase=>{const value=metrics.renderPhases[phase];return[phase,{samples:value.samples,p95Ms:value.p95Ms===null?null:Math.round(value.p95Ms*10)/10,maxMs:value.maxMs===null?null:Math.round(value.maxMs*10)/10}]}))}:{}),
  }};
}

export function createPerformanceTelemetry({now=()=>globalThis.performance?.now?.()||Date.now(),windowMs=60_000}={}){
 let foregroundMs=0,frames=0,frameSamples=0,frameIndex=0,drawFrameIndex=0,stalls50=0,stalls250=0,ackSamples=0,zoomCount=0,requestCount=0,arrivalCount=0;
 let terrainFrameIndex=0,terrainWorkSamples=0,terrainIncompleteFrames=0,terrainQueuePeak=0,terrainIncompleteSince=null;
 let frameWorkIndex=0,longTaskCount=0,stateMessageIndex=0,renderPhaseFrameIndex=0;
 const frameIntervals=[],drawDurations=[],frameWorkDurations=[],longTaskDurations=[],stateMessageDurations=[],statePayloadChars=[],ackLatencies=[],zoomWaits=[],dimensionRequests=[],dimensionArrivals=[],terrainWork=[],terrainIncompleteDurations=[],seen=new Map();
 const renderPhaseDurations=new Map(RENDER_PHASES.map(phase=>[phase,[]]));
 const renderPhaseMax=new Map();let drawMaxMs=0;
 function reset(){foregroundMs=0;frames=0;frameSamples=0;frameIndex=0;drawFrameIndex=0;stalls50=0;stalls250=0;ackSamples=0;zoomCount=0;requestCount=0;arrivalCount=0;
  terrainFrameIndex=0;terrainWorkSamples=0;terrainIncompleteFrames=0;terrainQueuePeak=0;frameWorkIndex=0;longTaskCount=0;stateMessageIndex=0;renderPhaseFrameIndex=0;
  renderPhaseMax.clear();drawMaxMs=0;
  frameIntervals.length=0;drawDurations.length=0;frameWorkDurations.length=0;longTaskDurations.length=0;stateMessageDurations.length=0;statePayloadChars.length=0;ackLatencies.length=0;zoomWaits.length=0;dimensionRequests.length=0;dimensionArrivals.length=0;terrainWork.length=0;terrainIncompleteDurations.length=0;for(const samples of renderPhaseDurations.values())samples.length=0;seen.clear();}
 function record(list,value,max){
  if(!Number.isFinite(value)||value<0)return;
  const count=(seen.get(list)||0)+1;seen.set(list,count);const sample=clamp(value,0,300_000);
  if(list.length<max){list.push(sample);return;}
  const slot=Math.floor(Math.random()*count);if(slot<max)list[slot]=sample;
 }
 return{
  observeFrame(intervalMs){
   if(!Number.isFinite(intervalMs)||intervalMs<=0)return;
   foregroundMs+=Math.min(intervalMs,30_000);frames++;if(intervalMs>50)stalls50++;if(intervalMs>250)stalls250++;
   frameIndex++;if(frameIndex%10===0){frameSamples++;record(frameIntervals,intervalMs,MAX_FRAME_SAMPLES);}
  },
  observeDraw(durationMs){if(Number.isFinite(durationMs))drawMaxMs=Math.max(drawMaxMs,clamp(durationMs,0,10_000));drawFrameIndex++;if(drawFrameIndex%10===0)record(drawDurations,durationMs,MAX_FRAME_SAMPLES);},
  observeFrameWork(durationMs){frameWorkIndex++;if(frameWorkIndex%10===0)record(frameWorkDurations,durationMs,MAX_FRAME_SAMPLES);},
  observeLongTask(durationMs){if(!Number.isFinite(durationMs)||durationMs<50)return;longTaskCount=Math.min(10_000,longTaskCount+1);record(longTaskDurations,durationMs,MAX_EVENT_SAMPLES);},
  observeStateMessage(durationMs,payloadChars){stateMessageIndex++;if(stateMessageIndex%10!==0)return;
   record(stateMessageDurations,durationMs,MAX_FRAME_SAMPLES);record(statePayloadChars,payloadChars,MAX_FRAME_SAMPLES);},
  shouldSampleRenderFrame(){renderPhaseFrameIndex++;return renderPhaseFrameIndex%10===0;},
  observeRenderPhase(phase,durationMs,sample=true){const samples=renderPhaseDurations.get(phase);if(!samples||!Number.isFinite(durationMs)||durationMs<0)return;
   renderPhaseMax.set(phase,Math.max(renderPhaseMax.get(phase)||0,clamp(durationMs,0,10_000)));if(sample)record(samples,durationMs,MAX_FRAME_SAMPLES);},
  observeTerrain(workMs,pendingChunks,incompleteVisible){
   terrainFrameIndex++;if(terrainFrameIndex%10===0){terrainWorkSamples++;record(terrainWork,workMs,MAX_FRAME_SAMPLES);}
   if(Number.isFinite(pendingChunks))terrainQueuePeak=Math.max(terrainQueuePeak,clamp(Math.floor(pendingChunks),0,160));
   const at=now();
   if(incompleteVisible){terrainIncompleteFrames++;if(terrainIncompleteSince===null)terrainIncompleteSince=at;}
   else if(terrainIncompleteSince!==null){record(terrainIncompleteDurations,at-terrainIncompleteSince,MAX_EVENT_SAMPLES);terrainIncompleteSince=null;}
  },
  observeAck(latencyMs){if(Number.isFinite(latencyMs)&&latencyMs>=0){ackSamples++;record(ackLatencies,latencyMs,MAX_EVENT_SAMPLES);}},
  observeZoomWait(durationMs){if(Number.isFinite(durationMs)&&durationMs>=0){zoomCount++;record(zoomWaits,durationMs,MAX_EVENT_SAMPLES);}},
  observeDimensionRequest(durationMs){if(Number.isFinite(durationMs)&&durationMs>=0){requestCount++;record(dimensionRequests,durationMs,MAX_EVENT_SAMPLES);}},
  observeDimensionArrival(durationMs){if(Number.isFinite(durationMs)&&durationMs>=0){arrivalCount++;record(dimensionArrivals,durationMs,MAX_EVENT_SAMPLES);}},
  createReport(at=now(),context={}){
   if(foregroundMs<windowMs||foregroundMs<MIN_WINDOW_MS||frames<30)return null;
   const incompleteDurations=[...terrainIncompleteDurations];
   const activeIncompleteMs=terrainIncompleteSince===null?null:Math.max(0,at-terrainIncompleteSince);
   if(activeIncompleteMs!==null&&incompleteDurations.length<MAX_EVENT_SAMPLES)incompleteDurations.push(activeIncompleteMs);
   const terrainWorkP95Ms=percentile(terrainWork,.95),terrainWorkP99Ms=percentile(terrainWork,.99);
   const report={type:'performanceMetrics',version:1,reportId:id(),windowMs:Math.round(Math.min(foregroundMs,300_000)),
    context:{location:context.location,device:context.device,zoom:context.zoom},metrics:{
     frameCount:frames,frameSamples:frameIntervals.length,stalls50,stalls250,fps:foregroundMs?frames*1000/foregroundMs:0,
     frameP50Ms:percentile(frameIntervals,.5)??0,frameP95Ms:percentile(frameIntervals,.95)??0,frameP99Ms:percentile(frameIntervals,.99)??0,
     drawSamples:drawDurations.length,drawP50Ms:percentile(drawDurations,.5)??0,drawP95Ms:percentile(drawDurations,.95)??0,drawP99Ms:percentile(drawDurations,.99)??0,
     drawMaxMs,
     ackSamples,ackP95Ms:percentile(ackLatencies,.95),zoomChanges:Math.min(100,zoomCount),zoomWaitP95Ms:percentile(zoomWaits,.95),
     dimensionRequests:Math.min(100,requestCount),dimensionRequestP95Ms:percentile(dimensionRequests,.95),
     dimensionArrivals:Math.min(100,arrivalCount),dimensionArrivalP95Ms:percentile(dimensionArrivals,.95),
     terrainWorkSamples:terrainWork.length,terrainWorkP95Ms,terrainWorkP99Ms,terrainWorkMaxMs:terrainWork.length?Math.max(...terrainWork):null,
     terrainIncompleteFrames,terrainIncompleteP95Ms:percentile(incompleteDurations,.95),
     terrainIncompleteMaxMs:incompleteDurations.length?Math.max(...incompleteDurations):null,terrainQueuePeak,
     frameWorkSamples:frameWorkDurations.length,frameWorkP95Ms:percentile(frameWorkDurations,.95),frameWorkMaxMs:frameWorkDurations.length?Math.max(...frameWorkDurations):null,
     longTaskCount,longTaskP95Ms:percentile(longTaskDurations,.95),longTaskMaxMs:longTaskDurations.length?Math.max(...longTaskDurations):null,
     stateMessageSamples:stateMessageDurations.length,stateMessageP95Ms:percentile(stateMessageDurations,.95),
     stateMessageMaxMs:stateMessageDurations.length?Math.max(...stateMessageDurations):null,
     statePayloadP95Chars:percentile(statePayloadChars,.95),statePayloadMaxChars:statePayloadChars.length?Math.max(...statePayloadChars):null,
     renderPhases:Object.fromEntries(RENDER_PHASES.map(phase=>{const samples=renderPhaseDurations.get(phase);return[phase,{samples:samples.length,p95Ms:percentile(samples,.95),maxMs:renderPhaseMax.get(phase)??null}]})),
    }};
   reset();if(activeIncompleteMs!==null)terrainIncompleteSince=at;return cleanPerformanceReport(report);
  },
  get windowMs(){return windowMs;},
 };
}
