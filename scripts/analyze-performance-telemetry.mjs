import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function quantile(values,ratio){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 return sorted.length?Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*ratio)-1)]*10)/10:null;
}
const RENDER_PHASES=['setup','background','shadows','entityPreparation','entities','effects'];
function summarize(reports){
 const windows=reports.length,windowMinutes=reports.reduce((sum,item)=>sum+item.windowMs,0)/60_000;
 const fps=reports.map(item=>item.metrics.fps),reportedP95=reports.map(item=>item.metrics.frameP95Ms);
 const reportedP99=reports.map(item=>item.metrics.frameP99Ms),ack=reports.map(item=>item.metrics.ackP95Ms).filter(Number.isFinite);
 const reportedDrawP95=reports.map(item=>item.metrics.drawP95Ms),reportedDrawP99=reports.map(item=>item.metrics.drawP99Ms);
 const terrainWorkP95=reports.map(item=>item.metrics.terrainWorkP95Ms).filter(Number.isFinite);
 const terrainWorkP99=reports.map(item=>item.metrics.terrainWorkP99Ms).filter(Number.isFinite);
 const terrainWorkMax=reports.map(item=>item.metrics.terrainWorkMaxMs).filter(Number.isFinite);
 const frameWorkP95=reports.map(item=>item.metrics.frameWorkP95Ms).filter(Number.isFinite);
 const frameWorkMax=reports.map(item=>item.metrics.frameWorkMaxMs).filter(Number.isFinite);
 const longTaskP95=reports.map(item=>item.metrics.longTaskP95Ms).filter(Number.isFinite);
 const longTaskMax=reports.map(item=>item.metrics.longTaskMaxMs).filter(Number.isFinite);
 const stateMessageP95=reports.map(item=>item.metrics.stateMessageP95Ms).filter(Number.isFinite);
 const stateMessageMax=reports.map(item=>item.metrics.stateMessageMaxMs).filter(Number.isFinite);
 const statePayloadP95=reports.map(item=>item.metrics.statePayloadP95Chars).filter(Number.isFinite);
 const statePayloadMax=reports.map(item=>item.metrics.statePayloadMaxChars).filter(Number.isFinite);
 const terrainPendingP95=reports.map(item=>item.metrics.terrainIncompleteP95Ms).filter(Number.isFinite);
 const terrainPendingMax=reports.map(item=>item.metrics.terrainIncompleteMaxMs).filter(Number.isFinite);
 const zoom=reports.flatMap(item=>item.metrics.zoomWaitP95Ms===null?[]:[item.metrics.zoomWaitP95Ms]);
 const dimensionRequests=reports.flatMap(item=>item.metrics.dimensionRequestP95Ms===null?[]:[item.metrics.dimensionRequestP95Ms]);
 const arrival=reports.flatMap(item=>item.metrics.dimensionArrivalP95Ms===null?[]:[item.metrics.dimensionArrivalP95Ms]);
 const stalls50=reports.reduce((sum,item)=>sum+item.metrics.stalls50,0),stalls250=reports.reduce((sum,item)=>sum+item.metrics.stalls250,0);
 const renderPhases=Object.fromEntries(RENDER_PHASES.map(phase=>{
  const phaseReports=reports.map(item=>item.metrics.renderPhases?.[phase]).filter(value=>value&&Number.isFinite(value.p95Ms));
  return[phase,{p95Ms:{median:quantile(phaseReports.map(value=>value.p95Ms),.5),p95:quantile(phaseReports.map(value=>value.p95Ms),.95)},
   maxMs:{median:quantile(phaseReports.map(value=>value.maxMs).filter(Number.isFinite),.5),p95:quantile(phaseReports.map(value=>value.maxMs).filter(Number.isFinite),.95)}}];
 }));
 return {windows,windowMinutes:Math.round(windowMinutes*10)/10,medianFps:quantile(fps,.5),
  reportedFrameP95Ms:{median:quantile(reportedP95,.5),p95:quantile(reportedP95,.95)},
  reportedFrameP99Ms:{median:quantile(reportedP99,.5),p95:quantile(reportedP99,.95)},
  reportedDrawP95Ms:{median:quantile(reportedDrawP95,.5),p95:quantile(reportedDrawP95,.95)},
  reportedDrawP99Ms:{median:quantile(reportedDrawP99,.5),p95:quantile(reportedDrawP99,.95)},
  reportedDrawMaxMs:{median:quantile(reports.map(item=>item.metrics.drawMaxMs),.5),p95:quantile(reports.map(item=>item.metrics.drawMaxMs),.95)},
  terrainQueueWorkP95Ms:{median:quantile(terrainWorkP95,.5),p95:quantile(terrainWorkP95,.95)},
  terrainQueueWorkP99Ms:{median:quantile(terrainWorkP99,.5),p95:quantile(terrainWorkP99,.95)},
  terrainQueueWorkMaxMs:{median:quantile(terrainWorkMax,.5),p95:quantile(terrainWorkMax,.95)},
  preDrawFrameWorkP95Ms:{median:quantile(frameWorkP95,.5),p95:quantile(frameWorkP95,.95)},
  preDrawFrameWorkMaxMs:{median:quantile(frameWorkMax,.5),p95:quantile(frameWorkMax,.95)},
  longTaskCount:reports.reduce((sum,item)=>sum+(item.metrics.longTaskCount||0),0),
  longTaskP95Ms:{median:quantile(longTaskP95,.5),p95:quantile(longTaskP95,.95)},
  longTaskMaxMs:{median:quantile(longTaskMax,.5),p95:quantile(longTaskMax,.95)},
  stateMessageP95Ms:{median:quantile(stateMessageP95,.5),p95:quantile(stateMessageP95,.95)},
  stateMessageMaxMs:{median:quantile(stateMessageMax,.5),p95:quantile(stateMessageMax,.95)},
  statePayloadP95Chars:{median:quantile(statePayloadP95,.5),p95:quantile(statePayloadP95,.95)},
  statePayloadMaxChars:{median:quantile(statePayloadMax,.5),p95:quantile(statePayloadMax,.95)},
  renderPhases,
  terrainIncompleteP95Ms:{median:quantile(terrainPendingP95,.5),p95:quantile(terrainPendingP95,.95)},
  terrainIncompleteMaxMs:{median:quantile(terrainPendingMax,.5),p95:quantile(terrainPendingMax,.95)},
  terrainIncompleteFrames:reports.reduce((sum,item)=>sum+(item.metrics.terrainIncompleteFrames||0),0),
  terrainQueuePeak:reports.length?Math.max(...reports.map(item=>item.metrics.terrainQueuePeak||0)):0,
  ackP95Ms:{median:quantile(ack,.5),p95:quantile(ack,.95)},
  zoomWaitP95Ms:{median:quantile(zoom,.5),p95:quantile(zoom,.95)},
  dimensionRequestP95Ms:{median:quantile(dimensionRequests,.5),p95:quantile(dimensionRequests,.95)},
  dimensionArrivalP95Ms:{median:quantile(arrival,.5),p95:quantile(arrival,.95)},
  stalls50,stalls250,stalls50PerMinute:windowMinutes?Math.round(stalls50/windowMinutes*10)/10:0,
  stalls250PerMinute:windowMinutes?Math.round(stalls250/windowMinutes*10)/10:0};
}
export function analyzePerformanceTelemetry(text){
 const groups=new Map(),tickDurations=[],movementAckStalls=[],movementFrameGaps=[],failureKinds={},serverPlayerBands={};
 const tickPhases={player:[],exploration:[],wildlife:[],wildlifeStepTotal:[],wildlifeStepMax:[],wildlifeBehavior:[],wildlifeMovement:[],other:[]};
 const wildlifeWork={activeAnimals:[],decisions:[],canOccupyCalls:[],occlusionCalls:[],findWaterCalls:[]};let malformed=0,wildlifePopulationMax=0;
 for(const line of String(text||'').split(/\r?\n/u)){
  const start=line.indexOf('{');if(start<0)continue;
  let item;try{item=JSON.parse(line.slice(start));}catch{continue;}
  if(item.type==='movement-server-tick-slow'){
   if(Number.isFinite(item.tickDurationMs))tickDurations.push(item.tickDurationMs);
   for(const [phase,field] of [['player','playerPhaseMs'],['exploration','explorationPhaseMs'],['wildlife','wildlifePhaseMs'],['wildlifeStepTotal','wildlifeStepTotalMs'],['wildlifeStepMax','wildlifeStepMaxMs'],['wildlifeBehavior','wildlifeBehaviorMs'],['wildlifeMovement','wildlifeMovementMs'],['other','otherPhaseMs']])
    if(Number.isFinite(item[field]))tickPhases[phase].push(item[field]);
   if(Number.isFinite(item.wildlifePopulationMax))wildlifePopulationMax=Math.max(wildlifePopulationMax,item.wildlifePopulationMax);
   for(const [key,field] of [['activeAnimals','wildlifeActiveAnimals'],['decisions','wildlifeDecisions'],['canOccupyCalls','wildlifeCanOccupyCalls'],['occlusionCalls','wildlifeOcclusionCalls'],['findWaterCalls','wildlifeFindWaterCalls']])
    if(Number.isFinite(item[field]))wildlifeWork[key].push(item[field]);
   const band=item.players<2?'1':item.players<6?'2-5':item.players<11?'6-10':'11+';
   serverPlayerBands[band]=(serverPlayerBands[band]||0)+1;continue;
  }
  if(item.type==='movement-diagnostic-report'){
   for(const event of Array.isArray(item.events)?item.events:[]){
    if(typeof event?.kind!=='string')continue;
    failureKinds[event.kind]=(failureKinds[event.kind]||0)+1;
    if(event.kind==='input-ack-stall'&&Number.isFinite(event.ageMs))movementAckStalls.push(event.ageMs);
    if(event.kind==='frame-gap'&&Number.isFinite(event.frameGapMs))movementFrameGaps.push(event.frameGapMs);
   }
   continue;
  }
  if(item.type!=='game-performance-report'||!item.metrics||!item.context)continue;
  if(!['mobile','desktop'].includes(item.context.device)||!['room','clearing'].includes(item.context.location)
    ||!['under-80','80-110','over-110'].includes(item.context.zoom)
    ||!['1','2-5','6-10','11+'].includes(item.playerCountBand)
    ||!Number.isFinite(item.windowMs)||item.windowMs<10_000||item.windowMs>300_000){malformed++;continue;}
  const key=[item.context.device,item.context.location,item.context.zoom,item.playerCountBand].join('/');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
 }
 const byContext=Object.fromEntries([...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,reports])=>[key,summarize(reports)]));
 return {type:'clareira-performance-audit',version:1,reportWindows:Object.values(byContext).reduce((sum,item)=>sum+item.windows,0),malformed,
  server:{slowTickCount:tickDurations.length,tickDurationP95Ms:quantile(tickDurations,.95),
   slowTickPhaseP95Ms:Object.fromEntries(Object.entries(tickPhases).map(([phase,values])=>[phase,quantile(values,.95)])),
   wildlifePopulationMax,wildlifeSlowTickWorkP95:Object.fromEntries(Object.entries(wildlifeWork).map(([key,values])=>[key,quantile(values,.95)])),
   slowTickPopulationBands:serverPlayerBands},
  movementDiagnostics:{eventKinds:failureKinds,inputAckStallAgeP95Ms:quantile(movementAckStalls,.95),frameGapP95Ms:quantile(movementFrameGaps,.95)},
  aggregationNote:'Cada linha resume uma janela de um cliente. P95s aqui são percentis dos P95s por janela, não uma distribuição combinada de quadros.',byContext};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const input=process.argv[2]?await readFile(process.argv[2],'utf8'):await new Promise(resolve=>{
  let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>resolve(text));
 });
 process.stdout.write(JSON.stringify(analyzePerformanceTelemetry(input),null,2)+'\n');
}
