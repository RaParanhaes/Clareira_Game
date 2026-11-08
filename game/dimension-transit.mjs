const RUNE_URL=new URL('./art/dimension-transit/runic-circle.png',import.meta.url);
const runeImage=new Image();
runeImage.src=RUNE_URL.href;
const runeReady=runeImage.decode().then(()=>true,()=>false);

const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t)};

// The overlay owns the entire dimensional ritual so it can continue while the
// destination scene and its art are loaded underneath it.
export function createDimensionTransit({reducedMotion=()=>false,onFinish=()=>{}}={}){
 const layer=document.createElement('canvas');
 layer.id='dimension-transit-overlay';layer.setAttribute('role','status');layer.setAttribute('aria-live','polite');
 layer.setAttribute('aria-label','Ritual de viagem dimensional');
 Object.assign(layer.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'1101',pointerEvents:'none',imageRendering:'pixelated'});
 document.body.append(layer);
 const context=layer.getContext('2d');
 let active=false,starting=false,phase='idle',startedAt=0,raf=0,background=null,canvasRect=null,anchor={x:0,y:0},pendingDestination=null;
 let onDeparture=null,departed=false,resolveFinish=null,finishPromise=null,seed=0;
 let generation=0;
 const blocked=event=>{if(!active)return;if(event.type==='keydown'||event.type==='pointerdown'||event.type==='click'){event.preventDefault();event.stopImmediatePropagation();}};
 window.addEventListener('keydown',blocked,true);window.addEventListener('pointerdown',blocked,true);window.addEventListener('click',blocked,true);
 const dimensions=()=>{
  const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,window.innerWidth),h=Math.max(1,window.innerHeight);
  if(layer.width!==Math.round(w*ratio)||layer.height!==Math.round(h*ratio)){layer.width=Math.round(w*ratio);layer.height=Math.round(h*ratio);}
  context.setTransform(ratio,0,0,ratio,0,0);context.imageSmoothingEnabled=true;
  return {w,h};
 };
 function capture(source,screen){
  const rect=source.getBoundingClientRect();canvasRect={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
  background=document.createElement('canvas');background.width=source.width;background.height=source.height;
  background.getContext('2d').drawImage(source,0,0);
  anchor={x:rect.left+screen.x,y:rect.top+screen.y};
 }
 function setPhase(next){phase=next;startedAt=performance.now();layer.dataset.phase=next;}
 function useDestination(){
  if(!pendingDestination)return false;
  ({background,canvasRect,anchor}=pendingDestination);pendingDestination=null;setPhase('arrival-descent');return true;
 }
 function drawRings(x,y,w,h,time,alpha,fade=1){
  if(alpha<=.001||runeImage.naturalWidth<1)return;
  const width=Math.min(w*.78,560),height=width/3.05,rotation=reducedMotion()?0:time*.00042;
  context.save();context.translate(x,y);context.globalAlpha=alpha*fade;context.globalCompositeOperation='screen';
  context.shadowColor='#8adfff';context.shadowBlur=reducedMotion()?5:22;
  context.rotate(rotation);context.drawImage(runeImage,-width/2,-height/2,width,height);
  context.globalAlpha=alpha*fade*.46;context.shadowBlur=reducedMotion()?2:10;
  context.rotate(-rotation*2.35+.08);context.drawImage(runeImage,-width*.385,-height*.385/(3.05),width*.77,height*.77/3.05);
  context.globalAlpha=alpha*fade*.28;context.rotate(-rotation*1.8-.12);
  context.drawImage(runeImage,-width*.27,-height*.27,width*.54,height*.54);
  context.restore();
 }
 function drawColumn(x,y,w,h,time,progress,intensity=1){
  if(progress<=0)return;
  const top=y-(y+Math.max(0,h*.09))*smooth(progress);
  const beamWidth=Math.min(w*.29,170),left=x-beamWidth/2;
  const base=context.createLinearGradient(left,0,left+beamWidth,0);
  base.addColorStop(0,'rgba(134,176,255,0)');base.addColorStop(.18,`rgba(135,184,255,${.36*intensity})`);
  base.addColorStop(.38,`rgba(219,241,255,${.87*intensity})`);base.addColorStop(.52,`rgba(255,255,245,${.98*intensity})`);
  base.addColorStop(.7,`rgba(154,197,255,${.64*intensity})`);base.addColorStop(1,'rgba(126,151,255,0)');
  context.save();context.globalCompositeOperation='screen';context.fillStyle=base;
  context.fillRect(left,Math.max(0,top),beamWidth,Math.max(0,y-Math.max(0,top)));
  for(let stripe=0;stripe<7;stripe++){
   const pulse=reducedMotion()?.8:(.46+.54*Math.sin(time*.008+stripe*4.3));
   const offset=(stripe-3)*beamWidth/8;
   context.globalAlpha=intensity*pulse*(stripe===3?.8:.34);context.fillStyle=stripe===3?'#fffef1':'#b6d9ff';
   context.fillRect(Math.round(x+offset),Math.max(0,top),stripe===3?3:1,Math.max(0,y-Math.max(0,top)));
  }
  const foot=context.createRadialGradient(x,y,1,x,y,beamWidth*.95);
  foot.addColorStop(0,`rgba(255,255,255,${.94*intensity})`);foot.addColorStop(.18,`rgba(177,223,255,${.62*intensity})`);foot.addColorStop(1,'rgba(102,140,255,0)');
  context.globalAlpha=1;context.fillStyle=foot;context.fillRect(x-beamWidth,y-beamWidth*.42,beamWidth*2,beamWidth*.84);
  context.restore();
 }
 function drawLift(x,y,time,progress){
  const amount=clamp(progress),width=9;
  context.save();context.globalCompositeOperation='screen';
  const pulse=reducedMotion()?1:.65+.35*Math.sin(time*.018);
  for(let i=0;i<34;i++){
   const hash=Math.sin((i+1)*127.1+seed*311.7)*43758.5453,r=hash-Math.floor(hash);
   const rise=(amount*95+r*58)%150,side=(r-.5)*(22+amount*38),px=x+side,py=y-24-rise;
   context.globalAlpha=(1-rise/170)*amount*pulse*.92;
   context.fillStyle=i%5===0?'#fff4c4':i%2?'#a7ddff':'#bcaaff';
   const size=i%7===0?3:2;context.fillRect(Math.round(px),Math.round(py),size,size);
  }
  context.restore();
 }
 function drawMask(x,y,progress){
  const amount=smooth(progress);if(amount<=0)return;
  const radiusX=9+amount*38,radiusY=17+amount*53;
  const fade=context.createRadialGradient(x,y-22,2,x,y-22,Math.max(radiusX,radiusY));
  fade.addColorStop(0,`rgba(2,7,18,${.98*amount})`);fade.addColorStop(.55,`rgba(5,12,27,${.9*amount})`);fade.addColorStop(1,'rgba(5,12,27,0)');
  context.save();context.globalCompositeOperation='source-over';context.fillStyle=fade;
  context.beginPath();context.ellipse(x,y-22,radiusX,radiusY,0,0,Math.PI*2);context.fill();context.restore();
 }
 function draw(time){
  if(!active)return;
  const {w,h}=dimensions(),elapsed=time-startedAt,fast=reducedMotion();
  const charge=fast?560:1120,descent=fast?500:860,lift=fast?240:470,arrivalDescent=fast?500:760,reveal=fast?230:430,dissipate=fast?500:940;
  context.clearRect(0,0,w,h);context.fillStyle='rgba(3,8,20,.97)';context.fillRect(0,0,w,h);
  if(background&&canvasRect){context.globalAlpha=.79;context.drawImage(background,canvasRect.left,canvasRect.top,canvasRect.width,canvasRect.height);context.globalAlpha=1;}
  context.fillStyle='rgba(3,8,20,.55)';context.fillRect(0,0,w,h);
  const x=anchor.x,y=anchor.y;
  let ringAlpha=1,column=0,mask=0,afterglow=1;
  if(phase==='charge'){
   const p=clamp(elapsed/charge);ringAlpha=.24+.76*smooth(p);
   context.save();context.globalAlpha=.14*(1-p);context.strokeStyle='#afeaff';context.lineWidth=1;context.beginPath();context.ellipse(x,y,18+p*75,8+p*27,0,0,Math.PI*2);context.stroke();context.restore();
   if(elapsed>=charge)setPhase('descent');
  }else if(phase==='descent'){
   ringAlpha=1;column=clamp(elapsed/descent);
   if(elapsed>=descent){setPhase('depart');if(!departed){departed=true;try{onDeparture?.();}catch{cancel();return;}}}
  }else if(phase==='depart'){
   ringAlpha=1;column=1;mask=clamp(elapsed/lift);
   drawMask(x,y,mask);drawLift(x,y,time,mask);
   if(elapsed>=lift)setPhase('waiting');
  }else if(phase==='waiting'){
   if(pendingDestination){useDestination();return draw(time);}
   ringAlpha=.94+(!fast ? .06*Math.sin(time*.005) : 0);column=.78;
   drawLift(x,y,time,.34);
  }else if(phase==='arrival-descent'){
   ringAlpha=1;column=clamp(elapsed/arrivalDescent);
   drawLift(x,y,time,.28);
   if(elapsed>=arrivalDescent)setPhase('arrival-reveal');
  }else if(phase==='arrival-reveal'){
   ringAlpha=1;column=1-smooth(elapsed/reveal);drawLift(x,y,time,1-clamp(elapsed/reveal));
   if(elapsed>=reveal)setPhase('dissipate');
  }else if(phase==='dissipate'){
   ringAlpha=1;afterglow=1-smooth(elapsed/dissipate);
   const rays=Math.round(56*afterglow);
   context.save();context.globalCompositeOperation='screen';
   for(let i=0;i<rays;i++){
    const a=i*2.399963+seed,travel=(elapsed/dissipate)*100+(i%9)*5;
    const px=x+Math.cos(a)*(25+travel),py=y+Math.sin(a)*(11+travel*.43);
    context.globalAlpha=afterglow*(.22+.5*((i*37)%11)/11);context.fillStyle=i%6?'#9edcff':'#fff0b1';
    context.fillRect(Math.round(px),Math.round(py),i%5===0?3:2,2);
   }
   context.restore();
   if(elapsed>=dissipate){finish();return;}
  }
  drawRings(x,y,w,h,time,ringAlpha,phase==='dissipate'?afterglow:1);
  if(column>0)drawColumn(x,y,w,h,time,column,phase==='waiting'?.64:1);
  if(phase==='descent'&&elapsed>=descent-40){context.save();context.globalAlpha=.75;context.fillStyle='#fff9d7';context.fillRect(x-2,y-2,4,2);context.restore();}
  raf=requestAnimationFrame(draw);
 }
 function finish(){active=false;starting=false;phase='idle';layer.hidden=true;layer.removeAttribute('data-phase');cancelAnimationFrame(raf);background=null;pendingDestination=null;onDeparture=null;resolveFinish?.();resolveFinish=null;onFinish();}
 function cancel(){if(!active&&!starting)return;generation++;if(active)finish();else starting=false;}
 async function begin({source,screen,onDeparture:departureCallback}){
  if(active||starting)return false;
  starting=true;const request=++generation;
  if(!await runeReady){if(request===generation)starting=false;return false;}
  if(request!==generation||active){starting=false;return false;}
  starting=false;active=true;layer.hidden=false;seed=Math.random()*1e5;departed=false;onDeparture=departureCallback;capture(source,screen);setPhase('charge');
  finishPromise=new Promise(resolve=>{resolveFinish=resolve;});
  raf=requestAnimationFrame(draw);return true;
 }
 function arrive(destination,screen){
  if(!active||!departed)return null;
  const rect=destination.getBoundingClientRect(),snapshot=document.createElement('canvas');
  snapshot.width=destination.width;snapshot.height=destination.height;snapshot.getContext('2d').drawImage(destination,0,0);
  pendingDestination={background:snapshot,canvasRect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},
   anchor:{x:rect.left+screen.x,y:rect.top+screen.y}};
  if(phase==='waiting')useDestination();
  return finishPromise;
 }
 return {begin,arrive,cancel,get active(){return active;},get starting(){return starting;},get phase(){return phase;}};
}
