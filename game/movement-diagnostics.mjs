const STORAGE_KEY='clareira-movement-diagnostics-v1';
const MAX_EVENTS=64;
const MAX_BATCH=24;
export const MAX_MOVEMENT_DIAGNOSTIC_MESSAGE_BYTES=8*1024;
const EVENT_FIELDS=Object.freeze({
 'runtime-error':['pending','outbound'],
 'ping-spike':['roundTripMs','serverLoopLagMs','serverWorkMs','serverBufferedBytes','clientFrameP95Ms','pending','outbound'],
 'render-spike':['durationMs','origin','renderSequence','setupMs','backgroundMs','shadowsMs','entityPreparationMs','entitiesMs','effectsMs','visibleEntities','pendingLights'],
 'loading-wait':['stage','percent','authenticated','snapshotReady','assetsReady','predictionReady','sceneReady','pendingAssets','pendingAvatar','pendingTerrain','pendingThemes','pendingLights','receivedMessages','receivedStates','welcomeReceived','processingPhase','lastMessageAgeMs'],
 'input-send':['firstSeq','lastSeq','count','pending','outbound','bufferedBytes','x','y','run','crouch'],
 'input-send-failed':['firstSeq','lastSeq','count','pending','outbound','bufferedBytes'],
 'input-ack':['serverSeq','ackDelta','pending','outbound','ackAgeMs'],
 'input-ack-stall':['pending','outbound','ackLag','ageMs','bufferedBytes'],
 'queue-pressure':['pending','outbound','ackLag','ageMs','bufferedBytes'],
 'frame-gap':['frameGapMs','pending','outbound','ackLag'],
 'connection-open':['attempt','pending','outbound','resume'],
 'connection-close':['attempt','code','pending','outbound','lastSentSeq','lastAckSeq','reason'],
 'prediction-recovery':['pending','outbound','ackLag','ageMs','reason'],
});
const REASONS=new Set(['other','heartbeat-timeout','movement-ack-stalled','initial-snapshot-timeout','presence-lease-lost','server-shutdown','normal','pressure','stalled','abnormal-close','payload-too-large','server-restart','server-overloaded','policy-close']);
function safeStorage(storage){try{return storage||globalThis.localStorage||null;}catch{return null;}}
export function cleanMovementDiagnosticEvent(event){
 if(!event||!Object.hasOwn(EVENT_FIELDS,event.kind))return null;
 const clean={kind:event.kind,at:Math.max(0,Number(event.at)||0)};
 for(const field of EVENT_FIELDS[event.kind]){
  if(!Object.hasOwn(event,field))continue;
  const value=event[field];
  if(field==='reason'){if(REASONS.has(value))clean[field]=value;continue;}
  if(typeof value==='boolean'){clean[field]=value;continue;}
  if(Number.isFinite(value))clean[field]=Math.max(-1_000_000,Math.min(1_000_000,value));
 }
 return clean;
}
function newId(){try{return globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}catch{return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;}}

export function createMovementDiagnostics({storage:storageInput,now=()=>globalThis.performance?.now?.()||Date.now()}={}){
 const storage=safeStorage(storageInput);let events=[],pendingReport=null;
 try{
  const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');
  if(Array.isArray(saved?.events))events=saved.events.map(cleanMovementDiagnosticEvent).filter(Boolean).slice(-MAX_EVENTS);
  if(typeof saved?.pendingReport?.reportId==='string'&&Number.isSafeInteger(saved.pendingReport.count)&&saved.pendingReport.count>0)
   pendingReport={reportId:saved.pendingReport.reportId,count:Math.min(saved.pendingReport.count,events.length)};
 }catch{}
 function persist(){try{storage?.setItem(STORAGE_KEY,JSON.stringify({events,pendingReport}));}catch{}}
 return{
  record(kind,details={}, {persist:save=false}={}){
   const event=cleanMovementDiagnosticEvent({kind,at:Math.round(now()),...details});if(!event)return false;
   events.push(event);
   if(events.length>MAX_EVENTS){
    if(pendingReport)events.splice(pendingReport.count,events.length-MAX_EVENTS);
    else events=events.slice(-MAX_EVENTS);
   }
   if(save)persist();return true;
  },
  takeBatch(){
   if(!events.length)return null;
   if(!pendingReport)pendingReport={reportId:newId(),count:Math.min(MAX_BATCH,events.length)};
   const report={type:'clientDiagnostics',version:1,reportId:pendingReport.reportId,events:events.slice(0,pendingReport.count)};
   const encoder=new TextEncoder();
   while(report.events.length&&encoder.encode(JSON.stringify(report)).byteLength>MAX_MOVEMENT_DIAGNOSTIC_MESSAGE_BYTES)
    report.events.pop();
   if(!report.events.length)throw new RangeError('A movement diagnostic event exceeds the WebSocket message limit');
   pendingReport.count=report.events.length;
   persist();return report;
  },
  acknowledge(reportId){
   if(!pendingReport||pendingReport.reportId!==reportId)return false;
   events=events.slice(pendingReport.count);pendingReport=null;persist();return true;
  },
  get size(){return events.length;},
  get pendingReportId(){return pendingReport?.reportId||null;},
  clear(){events=[];pendingReport=null;try{storage?.removeItem(STORAGE_KEY);}catch{}},
 };
}
