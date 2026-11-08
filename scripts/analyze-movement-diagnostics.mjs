import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function distribution(values){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return{count:0,max:null,p95:null,average:null};
 return{count:sorted.length,max:sorted.at(-1),p95:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)],
  average:Math.round(sorted.reduce((sum,value)=>sum+value,0)/sorted.length*10)/10};
}

export function analyzeMovementDiagnostics(text){
 const eventKinds={},closeReasons={},clientQueue=[],ackAges=[],frameGaps=[],slowTicks=[],serverQueueGaps=[];
 let reports=0,reportEvents=0,sessionCloses=0;const closeCodes={},webSocketErrors={};
 for(const line of String(text||'').split(/\r?\n/u)){
  const start=line.indexOf('{');if(start<0)continue;
  let value;try{value=JSON.parse(line.slice(start));}catch{continue;}
  if(value.type==='movement-diagnostic-report'){
   reports++;const server=value.server||{};
   if(Number.isFinite(server.receivedSeq)&&Number.isFinite(server.inputSeq))serverQueueGaps.push(server.receivedSeq-server.inputSeq);
   for(const event of Array.isArray(value.events)?value.events:[]){
    if(typeof event?.kind!=='string')continue;reportEvents++;eventKinds[event.kind]=(eventKinds[event.kind]||0)+1;
    if(Number.isFinite(event.pending))clientQueue.push(event.pending);
    if(event.kind==='input-ack-stall'&&Number.isFinite(event.ageMs))ackAges.push(event.ageMs);
    if(event.kind==='frame-gap'&&Number.isFinite(event.frameGapMs))frameGaps.push(event.frameGapMs);
   }
  }else if(value.type==='movement-session-close'){
   sessionCloses++;const reason=value.reason||'unknown';closeReasons[reason]=(closeReasons[reason]||0)+1;
   if(Number.isFinite(value.code)){const code=String(value.code);closeCodes[code]=(closeCodes[code]||0)+1;}
   if(Number.isFinite(value.receivedSeq)&&Number.isFinite(value.inputSeq))serverQueueGaps.push(value.receivedSeq-value.inputSeq);
  }else if(value.type==='websocket-client-error'){
   const reason=typeof value.reason==='string'?value.reason:'unknown';webSocketErrors[reason]=(webSocketErrors[reason]||0)+1;
  }else if(value.type==='movement-server-tick-slow'&&Number.isFinite(value.tickDurationMs))slowTicks.push(value.tickDurationMs);
 }
 return{reports,reportEvents,sessionCloses,eventKinds,closeReasons,closeCodes,webSocketErrors,clientPending:distribution(clientQueue),
  ackStallAgeMs:distribution(ackAges),frameGapMs:distribution(frameGaps),serverQueueGap:distribution(serverQueueGaps),
  slowServerTickMs:distribution(slowTicks)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const input=process.argv[2]?await readFile(process.argv[2],'utf8'):await new Promise(resolve=>{
  let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>resolve(text));
 });
 process.stdout.write(JSON.stringify(analyzeMovementDiagnostics(input),null,2)+'\n');
}
