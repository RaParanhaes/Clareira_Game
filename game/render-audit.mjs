const PHASES=['setup','background','shadows','entityPreparation','entities','effects'];
const round=value=>Math.round(value*10)/10;
// Every completed render is timed, including scene preparation and resize.
// Only slow renders allocate a diagnostic, at most once per cooldown.
export function createRenderAudit({now=()=>performance.now(),onDraw=()=>{},onSpike=()=>{},thresholdMs=50,cooldownMs=5000}={}){
 const phases=new Float64Array(PHASES.length);let phaseStarted=0,lastSpike=-Infinity,active=false,sequence=0;
 return {
  mark(phase,at=now()){if(!active)return;const index=PHASES.indexOf(phase);if(index>=0)phases[index]+=Math.max(0,at-phaseStarted);phaseStarted=at;},
  run(render,origin=0){
   if(active)return render();
   const start=now();phaseStarted=start;phases.fill(0);active=true;
   try{
    const rendered=render();
    if(rendered){
     const at=now(),duration=Math.max(0,at-start);sequence++;onDraw(duration);
     if(duration>=thresholdMs&&at-lastSpike>=cooldownMs){
      lastSpike=at;const event={durationMs:round(duration),origin,renderSequence:sequence};
      PHASES.forEach((phase,index)=>{event[`${phase}Ms`]=round(phases[index]);});onSpike(event);
     }
    }
    return rendered;
   }finally{active=false;}
  },
 };
}
