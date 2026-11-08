const FRAME_MS=45,FRAME_COUNT=60,FRAME_COLUMNS=10,FRAME_ROWS=6,APEX_MS=1080,DURATION_MS=2700,ARRIVAL_DELAY_MS=360,SOURCE_FADE_MS=420,READY_TIMEOUT_MS=120000;
const EFFECT_LAYOUT=Object.freeze({lower:{width:240,height:144,y:1},beam:{width:218,height:196,y:65},upper:{width:124,height:42,y:134}});
const clamp=value=>Math.max(0,Math.min(1,value));
const MIN_BLACKOUT_MS=3000;
const frameIndex=(elapsed,reducedMotion)=>reducedMotion?24:Math.floor(elapsed/FRAME_MS);
const destinationStart=event=>Number.isFinite(event?.destinationStartAt)?event.destinationStartAt:null;
function transitSideForDimension(event,dimensionId,time){
 if(event?.sourceDimensionId===dimensionId&&event?.destinationDimensionId===dimensionId){
  const transferAt=Number.isFinite(event.transferAt)?event.transferAt:event.startAt+(Number(event.durationMs)||DURATION_MS);
  return time>=transferAt?'destination':'source';
 }
 return event?.sourceDimensionId===dimensionId?'source':event?.destinationDimensionId===dimensionId?'destination':null;
}

export function transitVisualState(event,side,time){
 if(!event||!Number.isFinite(time))return null;
 if(side==='source'){
  const elapsed=time-event.startAt,duration=Number(event.durationMs)||DURATION_MS,fadeMs=Number(event.sourceFadeMs)||SOURCE_FADE_MS;
  if(elapsed<0||elapsed>=duration)return null;
  return {elapsed,alpha:elapsed<=duration-fadeMs?1:clamp((duration-elapsed)/fadeMs)};
 }
 if(side==='destination'){
  const started=destinationStart(event);
  if(started===null)return null;
  const elapsed=time-started,duration=Number(event.durationMs)||DURATION_MS;
  if(elapsed<0||elapsed>=duration)return null;
  return {elapsed,alpha:elapsed>duration-250?clamp((duration-elapsed)/250):1};
 }
 return null;
}

export function shouldLockTransitMovement(event,playerId,dimensionId,time){
 if(!event||event.actorId!==playerId||!Number.isFinite(time))return false;
 if(dimensionId===event.sourceDimensionId&&dimensionId===event.destinationDimensionId){
  const started=destinationStart(event);
  return time>=event.startAt&&(started===null||time<started+(Number(event.apexMs)||APEX_MS));
 }
 if(dimensionId===event.sourceDimensionId)return time>=event.startAt;
 if(dimensionId===event.destinationDimensionId){
  const started=destinationStart(event);
  return started===null||time<started+(Number(event.apexMs)||APEX_MS);
 }
 return false;
}

export function shouldHideTransitActor(event,playerId,dimensionId,time){
 if(!event||event.actorId!==playerId)return false;
 if(dimensionId===event.sourceDimensionId&&dimensionId===event.destinationDimensionId){
  const started=destinationStart(event),apex=Number(event.apexMs)||APEX_MS;
  return time>=event.startAt+apex&&(started===null||time<started+apex);
 }
 if(dimensionId===event.sourceDimensionId)return time>=event.startAt+(Number(event.apexMs)||APEX_MS);
 if(dimensionId===event.destinationDimensionId){
  const started=destinationStart(event);
  return started===null||time<started+(Number(event.apexMs)||APEX_MS);
 }
 return false;
}

function frame(ctx,image,number,columns,rows,dw,dh,x,y){
 if(!image?.naturalWidth)return;
 const sw=image.naturalWidth/columns,sh=image.naturalHeight/rows,index=Math.max(0,Math.min(FRAME_COUNT-1,number));
 ctx.drawImage(image,(index%columns)*sw,Math.floor(index/columns)*sh,sw,sh,x-dw/2,y-dh/2,dw,dh);
}
export function createTeleportEffects({onActivity=()=>{},getServerNow=()=>performance.now(),getDimensionId=()=>'',getListenerPosition=null,reducedMotion=()=>false,loadAssets=async()=>({images:{},audio:[]})}={}){
 const events=new Map(),scheduledSoundKeys=new Set(),expiryTimers=new Map();let audioContext=null,bus=null,buffers=null,loadAudioPromise=null,predecodePromise=null,local=null,overlayRaf=0,images={lower:null,beam:null,upper:null},audioData=[],preparePromise=null;
 const overlay=document.createElement('canvas');overlay.id='teleport-travel-overlay';
 Object.assign(overlay.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'1101',pointerEvents:'none',imageRendering:'pixelated'});
 overlay.hidden=true;document.body.append(overlay);const overlayContext=overlay.getContext('2d');
 const nowServer=()=>getServerNow();
 function localEventTime(event,fallback=nowServer()){
  if(!local||local.actorId!==event.actorId||local.eventId!==event.id)return fallback;
  if(local.dimensionId===event.destinationDimensionId&&Number.isFinite(local.localArrivalAt)
      &&Number.isFinite(event.destinationStartAt))
   return event.destinationStartAt+(performance.now()-local.localArrivalAt);
  if(Number.isFinite(local.localStartAt))return event.startAt+(performance.now()-local.localStartAt);
  return fallback;
 }
 function prepare(){
  if(!preparePromise)preparePromise=Promise.resolve().then(loadAssets).then(assets=>{
   images=assets?.images||images;audioData=assets?.audio||[];predecodeAudio();loadAudioBuffers();
   return ['lower','beam','upper'].every(key=>images[key]?.naturalWidth>0);
  }).then(ready=>{if(!ready)preparePromise=null;return ready;}).catch(()=>{preparePromise=null;return false;});
  return preparePromise;
 }
 function scheduleExpiry(event){
  clearTimeout(expiryTimers.get(event.id));
  const start=destinationStart(event),endAt=start===null?event.startAt+READY_TIMEOUT_MS:start+(Number(event.durationMs)||DURATION_MS);
  const timer=setTimeout(()=>expireEvent(event),Math.max(0,endAt-nowServer()+80));
  expiryTimers.set(event.id,timer);
 }
 function expireEvent(event){
  if(!events.delete(event.id))return;
  clearTimeout(expiryTimers.get(event.id));expiryTimers.delete(event.id);
  scheduledSoundKeys.delete(event.id+':source');scheduledSoundKeys.delete(event.id+':destination');
  if(local?.eventId===event.id)cancelLocal();
  onActivity(false,event);
 }
 function accept(event,snapshotServerTime=null){
  if(!event||typeof event.id!=='string'||!Number.isFinite(event.startAt))return false;
  const sourceDimensionId=String(event.sourceDimensionId||''),destinationDimensionId=String(event.destinationDimensionId||'');
  if(!sourceDimensionId||!destinationDimensionId||!Number.isFinite(event.sourceX)||!Number.isFinite(event.sourceY)
      ||!Number.isFinite(event.destinationX)||!Number.isFinite(event.destinationY))return false;
  const existing=events.get(event.id);
  if(existing){
   if(destinationStart(event)!==null&&existing.destinationStartAt!==event.destinationStartAt){
    const updated={...existing,destinationStartAt:event.destinationStartAt};
    if(local?.actorId===updated.actorId){
     const untilArrival=Number.isFinite(snapshotServerTime)?updated.destinationStartAt-snapshotServerTime:180;
     local.localArrivalAt=performance.now()+Math.max(0,untilArrival);
    }
    events.set(updated.id,updated);
    scheduleExpiry(updated);scheduleSounds(updated);
   }
   return false;
  }
  void prepare();
  const normalized={...event,apexMs:Number(event.apexMs)||APEX_MS,arrivalDelayMs:Number(event.arrivalDelayMs)||ARRIVAL_DELAY_MS,
   durationMs:Number(event.durationMs)||DURATION_MS,sourceFadeMs:Number(event.sourceFadeMs)||SOURCE_FADE_MS,
   destinationStartAt:Number.isFinite(event.destinationStartAt)?event.destinationStartAt:null};
  if(local?.actorId===normalized.actorId){
   const untilStart=Number.isFinite(snapshotServerTime)?normalized.startAt-snapshotServerTime:140;
   local.localStartAt=performance.now()+Math.max(0,untilStart);
  }
  events.set(normalized.id,normalized);bindLocalEvent(normalized);onActivity(true,normalized);scheduleSounds(normalized);scheduleExpiry(normalized);
  if(local?.eventId===normalized.id){overlay.hidden=false;if(!overlayRaf)overlayRaf=requestAnimationFrame(renderOverlay);}
  return true;
 }
 function active(dimensionId,time=nowServer()){
  for(const event of events.values()){
   const side=transitSideForDimension(event,dimensionId,localEventTime(event,time));
   if(!side)continue;
   const visual=transitVisualState(event,side,localEventTime(event,time));
   if(visual)yieldEffect.push({event,side,...visual});
  }
 }
 const yieldEffect=[];
 function drawUnder(ctx,dimensionId,time,point,scale=1){
  yieldEffect.length=0;active(dimensionId,time);
  for(const {event,side,elapsed,alpha} of yieldEffect){
   const index=frameIndex(elapsed,reducedMotion()),x=side==='source'?event.sourceX:event.destinationX,y=side==='source'?event.sourceY:event.destinationY,p=point(x,y);
   ctx.save();ctx.globalAlpha=alpha;
   frame(ctx,images.lower,index,FRAME_COLUMNS,FRAME_ROWS,EFFECT_LAYOUT.lower.width*scale,EFFECT_LAYOUT.lower.height*scale,p.x,p.y-EFFECT_LAYOUT.lower.y*scale);
   ctx.restore();
  }
 }
 function drawOver(ctx,dimensionId,time,point,scale=1){
  yieldEffect.length=0;active(dimensionId,time);
  for(const {event,side,elapsed,alpha} of yieldEffect){
   const index=frameIndex(elapsed,reducedMotion()),x=side==='source'?event.sourceX:event.destinationX,y=side==='source'?event.sourceY:event.destinationY,p=point(x,y);
   ctx.save();ctx.globalAlpha=alpha;
   frame(ctx,images.beam,index,FRAME_COLUMNS,FRAME_ROWS,EFFECT_LAYOUT.beam.width*scale,EFFECT_LAYOUT.beam.height*scale,p.x,p.y-EFFECT_LAYOUT.beam.y*scale);
   frame(ctx,images.upper,index,FRAME_COLUMNS,FRAME_ROWS,EFFECT_LAYOUT.upper.width*scale,EFFECT_LAYOUT.upper.height*scale,p.x,p.y-EFFECT_LAYOUT.upper.y*scale);
   ctx.restore();
  }
 }
 function lightingPoints(dimensionId,time=nowServer()){
  const points=[];
  for(const event of events.values()){
   const side=transitSideForDimension(event,dimensionId,localEventTime(event,time));
   if(!side)continue;
   const visual=transitVisualState(event,side,localEventTime(event,time));if(!visual)continue;
   points.push({id:event.id,x:side==='source'?event.sourceX:event.destinationX,y:side==='source'?event.sourceY:event.destinationY,
    strength:visual.alpha,frame:Math.min(FRAME_COUNT-1,Math.floor(visual.elapsed/FRAME_MS))});
  }
  return points;
 }
 function shouldHide(playerId,dimensionId,time=nowServer()){
  for(const event of events.values())if(shouldHideTransitActor(event,playerId,dimensionId,localEventTime(event,time)))return true;
  return false;
 }
 function shouldLockMovement(playerId,dimensionId,time=nowServer()){
  for(const event of events.values())if(shouldLockTransitMovement(event,playerId,dimensionId,localEventTime(event,time)))return true;
  return false;
 }
 function predecodeAudio(){
  // Decoding needs no user gesture on an offline context; AudioBuffers can be played by any context later.
  const Offline=typeof window==='undefined'?null:window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!Offline||buffers||predecodePromise||!audioData.length)return;
  const offline=new Offline(1,1,44100);
  predecodePromise=Promise.all(audioData.map(data=>offline.decodeAudioData(data.slice(0)))).then(decoded=>{if(!buffers)buffers=decoded;},()=>{});
 }
 function loadAudioBuffers(){
  if(buffers||!audioContext||!bus||!audioData.length||loadAudioPromise)return;
  const context=audioContext;
  loadAudioPromise=Promise.all(audioData.map(data=>context.decodeAudioData(data.slice(0)))).then(decoded=>{buffers=decoded;},()=>{buffers=null;loadAudioPromise=null;});
 }
 function setAudio(context,nextBus){audioContext=context;bus=nextBus;loadAudioBuffers();}
 async function scheduleSound(event,side){
  const context=audioContext,currentBus=bus;
  if(!context||!currentBus||context.state!=='running')return;
  if(!buffers){loadAudioBuffers();if(loadAudioPromise)await loadAudioPromise;}
  if(context!==audioContext||context.state!=='running'||!buffers?.length)return;
  const started=side==='source'?event.startAt:destinationStart(event);if(started===null)return;
  const remaining=started-nowServer();if(remaining<-(Number(event.durationMs)||DURATION_MS))return;
  const when=context.currentTime+Math.max(0,remaining)/1000;
  let distanceGain=1;
  if(local?.actorId!==event.actorId&&typeof getListenerPosition==='function'){
   const listener=getListenerPosition();
   const tx=side==='source'?event.sourceX:event.destinationX,ty=side==='source'?event.sourceY:event.destinationY;
   if(listener&&Number.isFinite(listener.x)&&Number.isFinite(listener.y)&&Number.isFinite(tx)&&Number.isFinite(ty)){
    const dist=Math.hypot(tx-listener.x,ty-listener.y),refDist=3,maxDist=36;
    if(dist<=refDist)distanceGain=1;
    else if(dist>=maxDist)distanceGain=0;
    else{const t=(maxDist-dist)/(maxDist-refDist);distanceGain=t*t*(3-2*t);}
   }
  }
  if(distanceGain<=.0001)return;
  buffers.forEach((buffer,index)=>{
   const source=context.createBufferSource(),gain=context.createGain();
   source.buffer=buffer;gain.gain.value=(index===3?.42:.35)*distanceGain;
   source.connect(gain);gain.connect(currentBus);source.start(when);
  });
 }
 function scheduleSounds(event){
  for(const side of ['source','destination']){
   const dimensionId=side==='source'?event.sourceDimensionId:event.destinationDimensionId;
   const started=side==='source'?event.startAt:destinationStart(event),key=event.id+':'+side;
   if(dimensionId!==getDimensionId()||scheduledSoundKeys.has(key)||started===null)continue;
   const delay=started-nowServer();if(delay>=-(Number(event.durationMs)||DURATION_MS)&&delay<3000){
    scheduledSoundKeys.add(key);setTimeout(()=>{void scheduleSound(event,side);},Math.max(0,delay));
   }
  }
 }
 function renderOverlay(){
  if(!local){overlay.hidden=true;overlayRaf=0;return;}
  const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,window.innerWidth),h=Math.max(1,window.innerHeight);
  if(overlay.width!==Math.round(w*ratio)||overlay.height!==Math.round(h*ratio)){
   overlay.width=Math.round(w*ratio);overlay.height=Math.round(h*ratio);
  }
  overlayContext.setTransform(ratio,0,0,ratio,0,0);overlayContext.imageSmoothingEnabled=false;overlayContext.clearRect(0,0,w,h);
  const event=events.get(local.eventId);
  if(!event){
   overlay.hidden=true;overlay.dataset.phase='departure';overlayRaf=0;
   if(local.eventId!==null)local=null;
   return;
  }
  const time=localEventTime(event,nowServer()),transferAt=Number.isFinite(event.transferAt)?event.transferAt:event.startAt+event.apexMs;
  const side=transitSideForDimension(event,local.dimensionId,time);
  if(side!=='destination'||time<transferAt){overlay.dataset.phase='departure';overlay.hidden=true;overlayRaf=requestAnimationFrame(renderOverlay);return;}
  overlay.hidden=false;
  if(local.blackoutStartedAt===null){local.blackoutStartedAt=performance.now();overlay.dataset.blackoutStartedAt=String(local.blackoutStartedAt);}
  const blackoutElapsedMs=performance.now()-local.blackoutStartedAt;
  const blackoutElapsed=blackoutElapsedMs>=MIN_BLACKOUT_MS;
  const started=destinationStart(event),revealing=local.sceneReady&&blackoutElapsed&&started!==null&&time>=started;
  overlay.dataset.phase=!revealing?'loading':time-started>=event.apexMs?'arrival-apex':'arrival';
  if(revealing)overlay.dataset.blackoutDurationMs=String(Math.round(blackoutElapsedMs));
  const reveal=revealing?clamp((time-started)/420):0;
  overlayContext.fillStyle=`rgba(0,0,0,${1-reveal})`;overlayContext.fillRect(0,0,w,h);
  const titleElapsed=time-transferAt,titleAlpha=Math.min(1,clamp(titleElapsed/180))*(1-reveal);
  if(local.destinationName&&titleAlpha>0){
   overlayContext.save();overlayContext.globalAlpha=titleAlpha;overlayContext.textAlign='center';overlayContext.textBaseline='middle';
   overlayContext.fillStyle='#d9c9a4';overlayContext.font='600 12px system-ui, sans-serif';overlayContext.fillText('CLAREIRA · DESTINO',w/2,h/2-24);
   overlayContext.fillStyle='#f4ead3';overlayContext.font='500 28px system-ui, sans-serif';overlayContext.fillText(local.destinationName,w/2,h/2+8,Math.min(w-48,640));
   const progressNow=performance.now(),progressDelta=Math.max(0,progressNow-local.progressAt);
   const targetProgress=local.sceneReady?1:Math.min(.94,local.progressTarget);
   local.progress+=(targetProgress-local.progress)*(1-Math.exp(-progressDelta/180));
   local.progressAt=progressNow;
   if(Math.abs(targetProgress-local.progress)<.001)local.progress=targetProgress;
   const barWidth=Math.min(340,Math.max(180,w-64)),barHeight=5,barX=(w-barWidth)/2,barY=h/2+50;
   overlayContext.shadowBlur=0;overlayContext.fillStyle='rgba(235,240,244,.16)';overlayContext.fillRect(barX,barY,barWidth,barHeight);
   if(local.progress>0){
    overlayContext.fillStyle='#ffffff';overlayContext.shadowColor='rgba(255,255,255,.78)';overlayContext.shadowBlur=8;
    overlayContext.fillRect(barX,barY,barWidth*local.progress,barHeight);overlayContext.shadowBlur=0;
   }
   overlayContext.restore();
  }
  if(revealing&&reveal>=1){local=null;overlay.dataset.phase='complete';overlay.hidden=true;overlayRaf=0;return;}
  overlayRaf=requestAnimationFrame(renderOverlay);
 }
 function beginLocal(actorId,destinationName=''){
  const event=[...events.values()].find(item=>item.actorId===actorId);
  local={actorId,eventId:event?.id||null,dimensionId:getDimensionId(),destinationName:String(destinationName||''),sceneReady:false,readyRequested:false,blackoutStartedAt:null,localStartAt:null,localArrivalAt:null,progressTarget:0,progress:0,progressAt:performance.now()};
  delete overlay.dataset.blackoutStartedAt;delete overlay.dataset.blackoutDurationMs;
  overlay.dataset.phase='departure';
  overlay.hidden=false;if(!overlayRaf)overlayRaf=requestAnimationFrame(renderOverlay);
 }
 function bindLocalEvent(event){
  if(!local||local.actorId!==event.actorId)return;
  local.eventId=event.id;
  // A slow server response may arrive after the initial frame stopped while
  // waiting for this event. Restart the overlay as soon as it is available.
  if(!overlayRaf)overlayRaf=requestAnimationFrame(renderOverlay);
 }
 function updateLocalDimension(dimensionId){if(local)local.dimensionId=dimensionId;for(const event of events.values())scheduleSounds(event);}
 function updateLocalProgress(percent){if(!local)return;local.progressTarget=clamp((Number(percent)||0)/100);}
 function finishLocalScene(dimensionId){
  if(!local||!dimensionId||local.dimensionId!==dimensionId)return null;
  const event=events.get(local.eventId);if(!event||dimensionId!==event.destinationDimensionId)return null;
  local.sceneReady=true;local.progressTarget=1;if(local.readyRequested)return null;local.readyRequested=true;return event.id;
 }
 function cancelLocal(){local=null;overlay.hidden=true;delete overlay.dataset.phase;if(overlayRaf)cancelAnimationFrame(overlayRaf);overlayRaf=0;}
 function clear(){for(const timer of expiryTimers.values())clearTimeout(timer);expiryTimers.clear();events.clear();scheduledSoundKeys.clear();cancelLocal();onActivity(false,null);}
 return {accept,drawUnder,drawOver,lightingPoints,shouldHide,shouldLockMovement,setAudio,clear,beginLocal,bindLocalEvent,updateLocalDimension,updateLocalProgress,finishLocalScene,cancelLocal,prepare,get ready(){return preparePromise||Promise.resolve(false);},get active(){return events.size>0;},get localTransit(){return Boolean(local);},get timings(){return {apexMs:APEX_MS,arrivalDelayMs:ARRIVAL_DELAY_MS,durationMs:DURATION_MS,sourceFadeMs:SOURCE_FADE_MS};}};
}
