import { performance } from 'node:perf_hooks';
// Observed timer lateness, not physical network RTT. Bounded two-second window.
export function createEventLoopLag({now=()=>performance.now(),schedule=setInterval,cancel=clearInterval,intervalMs=100,windowMs=2000}={}){
 let previous=now();const samples=[];
 const timer=schedule(()=>{const at=now();samples.push({at,lag:Math.max(0,at-previous-intervalMs)});previous=at;while(samples.length>20||samples[0]?.at<at-windowMs)samples.shift();},intervalMs);
 timer?.unref?.();
 return {read(){const at=now();let max=0;for(const sample of samples)if(at-sample.at<=windowMs)max=Math.max(max,sample.lag);return Math.round(max*10)/10;},close(){cancel(timer);samples.length=0;}};
}
