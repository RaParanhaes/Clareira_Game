// Constant space, no per-frame DOM, and no player/account/position data.
const round=value=>Number.isFinite(value)?Math.round(value*10)/10:null;
export function createRuntimePerformance({capacity=240,historyLimit=60}={}){
 const frames=new Float64Array(capacity),draws=new Float64Array(capacity);
 let cursor=0,count=0,messages=0,payloadChars=0,coalesced=0,connections=0,longTasks=0,last=null,lastReceipt=null;
 const history=[],reports=[],pings=[],spikes=[];let serverLoopLagMs=null,serverWorkMs=null,serverBufferedBytes=null;
 return {
  spike(event){spikes.push({...event});if(spikes.length>20)spikes.shift();},
  frame(interval,draw){if(!Number.isFinite(interval)||interval<=0)return;frames[cursor]=interval;draws[cursor]=Math.max(0,draw||0);cursor=(cursor+1)%capacity;count=Math.min(capacity,count+1);},
  receive(chars,merged=false,at=null){if(Number.isFinite(at))lastReceipt=at;messages++;payloadChars+=Math.max(0,chars||0);if(merged)coalesced++;},
  ping(ms,details={}){
   const safe=value=>Number.isFinite(value)&&value>=0&&value<=1000000?round(value):null;
   serverLoopLagMs=safe(details.serverLoopLagMs);serverWorkMs=safe(details.serverWorkMs);serverBufferedBytes=safe(details.serverBufferedBytes);
   if(Number.isFinite(ms)&&ms>=0){pings.push(ms);if(pings.length>20)pings.shift();}},
  connect(){connections++;},longTask(){longTasks++;},
  report(report){reports.push(report);if(reports.length>10)reports.shift();},
  snapshot(at,context={}){
   const values=Array.from(frames.subarray(0,count)).sort((a,b)=>a-b),drawValues=Array.from(draws.subarray(0,count)).sort((a,b)=>a-b);
   const percentile=(list,p)=>round(list[Math.max(0,Math.ceil(list.length*p)-1)]);
   const elapsed=last?Math.max(1,at-last.at):null;
   const result={atMs:Math.round(at),samples:count,fps:count?round(count*1000/values.reduce((a,b)=>a+b,0)):null,
    frameP95Ms:percentile(values,.95),frameP99Ms:percentile(values,.99),frameMaxMs:round(values.at(-1)),
    drawP95Ms:percentile(drawValues,.95),stalls50:values.filter(v=>v>50).length,stalls250:values.filter(v=>v>250).length,
    messagesPerSecond:elapsed?round((messages-last.messages)*1000/elapsed):null,
    payloadCharsPerSecond:elapsed?round((payloadChars-last.payloadChars)*1000/elapsed):null,
    coalescedStates:coalesced,reconnections:Math.max(0,connections-1),longTasks,
    // Explicit allowlist prevents accidental export of inspectMovement's private state.
    pingMs:round(pings.at(-1)),serverLoopLagMs,serverWorkMs,serverBufferedBytes,jitterMs:pings.length>1?round(pings.slice(1).reduce((sum,value,index)=>sum+Math.abs(value-pings[index]),0)/(pings.length-1)):null,pendingInputs:context.pendingInputs||0,outboundInputs:context.outboundInputs||0,
    bufferedBytes:context.bufferedBytes||0,heapUsedMiB:round(context.heapUsedBytes/1048576),
    canvasPixels:context.canvasPixels||0,visibleEntities:context.visibleEntities||0,
    lightmapBytes:context.lightmapBytes||0,lightmapPending:context.lightmapPending||0,
    sceneReady:Boolean(context.sceneReady),hidden:Boolean(context.hidden),connected:Boolean(context.connected),
    lastMessageAgeMs:lastReceipt===null?null:round(Math.max(0,at-lastReceipt)),longTasksSupported:Boolean(context.longTasksSupported),
    location:['room','clearing'].includes(context.location)?context.location:null,zoomPercent:round(context.zoomPercent),
    pixelRatio:round(context.pixelRatio),viewportWidth:round(context.viewportWidth),viewportHeight:round(context.viewportHeight)};
   last={at,messages,payloadChars};history.push(result);if(history.length>historyLimit)history.shift();return result;
  },
  export(){return {schemaVersion:1,frameWindowCapacity:capacity,renderSpikes:spikes.map(event=>({...event})),history:history.map(item=>({...item})),reports:structuredClone(reports)};},
 };
}
