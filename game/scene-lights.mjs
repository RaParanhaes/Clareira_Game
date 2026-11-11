import {furnitureVisual,furnitureUse} from './furniture.mjs';
import { buildingWindows } from './architectural-elements.mjs';
import { roomWallDecor, fixtureBounds } from './building-standard.mjs';
import { nightEmitterProfile } from './lighting.mjs';

// Windows light one at a time through the evening and go out one at a time at
// dawn. Each window draws a fixed moment from its id, so every client agrees.
const DUSK_FIRST_HOUR=18.33, DUSK_SPREAD_HOURS=3;
const DAWN_FIRST_HOUR=5, DAWN_SPREAD_HOURS=2;
const WINDOW_RAMP_HOURS=.4;
const unitHash=text=>{let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;};
const smooth01=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
// Amount of light a window gives at this game hour (0..1). The first window of each
// house always lights; about a third of the others stay dark all night.
// Each night draws its own pattern from the night's seed (the calendar day it starts on).
const nightRoll=(id,seed,salt)=>unitHash(`${id}|${seed}|${salt}`);
// A house's mood for the night: every window, some windows, or only the first one.
export function houseNightMood(buildingId,seed){
  const r=nightRoll(buildingId,seed,'mood');
  return r<.3?'all':r<.8?'some':'one';
}
// Lantern in front of the house: the first light to come on, before any window.
const PORCH_FIRST_HOUR=17.9, PORCH_SPREAD_HOURS=.4;
export function porchLightAmount(id,hours,seed=0){
  if(!Number.isFinite(hours))return null;
  const now=hours<12?hours+24:hours;
  const onset=PORCH_FIRST_HOUR+nightRoll(id,seed,'porch')*PORCH_SPREAD_HOURS;
  const offset=DAWN_FIRST_HOUR+24+DAWN_SPREAD_HOURS+nightRoll(id,seed,'porch-off')*.5;
  return smooth01((now-onset)/WINDOW_RAMP_HOURS)*(1-smooth01((now-offset)/WINDOW_RAMP_HOURS));
}
// Amount of light a window gives at this game hour (0..1). The first window of each
// house always lights, whatever the mood. Other windows follow the house's mood and
// may stay dark; lit ones come on and go out at moments drawn for this night.
export function windowLightAmount(id,primary,hours,{seed=0,mood='some'}={}){
  if(!Number.isFinite(hours))return null;
  const now=hours<12?hours+24:hours;
  if(!primary){
    if(mood==='one')return 0;
    if(mood==='some'&&nightRoll(id,seed,'keep')>.6)return 0;
  }
  const u=nightRoll(id,seed,'on'),v=nightRoll(id,seed,'off');
  const onset=primary?DUSK_FIRST_HOUR+u*DUSK_SPREAD_HOURS*.5:DUSK_FIRST_HOUR+u*DUSK_SPREAD_HOURS;
  const offset=DAWN_FIRST_HOUR+24+v*DAWN_SPREAD_HOURS;
  return smooth01((now-onset)/WINDOW_RAMP_HOURS)*(1-smooth01((now-offset)/WINDOW_RAMP_HOURS));
}

export function exteriorEmitters(buildings,daylight=1,hasMoon=false,hours=null,seed=0){
  const nightFactor=Math.max(0,Math.min(1,(.48-daylight)/.35));
  // The porch lantern is round and a little wider than a window, so the front stays lit.
  const porch=nightEmitterProfile(7.4,1.7,{night:nightFactor,hasMoon});
  return buildings.flatMap(building=>[
    ...buildingWindows(building).filter(w=>w.enabled!==false&&w.light?.enabled!==false).map((w,index)=>{
      const sourceStrength=w.light?.strength??.8;
      const baseReach=w.light?.reach??5.8+w.z*.18;
      const profile=nightEmitterProfile(baseReach,w.light?.falloffExponent??1.4,{night:nightFactor,hasMoon});
      const lit=windowLightAmount(w.id,index===0,hours,{seed,mood:houseNightMood(building.id,seed)});
      return {...w,kind:'window',height:w.z,reach:profile.reach,strength:sourceStrength*(lit??nightFactor),
        falloffExponent:profile.falloffExponent,color:w.light?.color||'#f29a4e',owner:building.id};
    }),
    {id:`${building.id}:porch`,kind:'lantern',owner:building.id,x:building.door.x+.84,y:building.bounds.bottom+.06,
      height:3.25,nx:0,ny:0,reach:porch.reach,strength:.9*(porchLightAmount(building.id,hours,seed)??nightFactor),
      falloffExponent:porch.falloffExponent,color:'#ff9f4a'},
  ]);
}
export function interiorEmitters(layout,furniture=[],daylight=1,time=0,hasMoon=false){
  const b=layout.bounds,base=layout.elevation==='raised'?2:0,decor=roomWallDecor(layout);
  const nightFactor=Math.max(0,Math.min(1,(.48-daylight)/.35));
  const sconce=nightEmitterProfile(8,1.7,{night:nightFactor,hasMoon});
  const result=[{id:`${layout.id}:sconce`,kind:'lantern',x:b.left+.1,y:b.top+1.1,height:base+3.05,
    nx:1,ny:0,reach:sconce.reach,strength:.95*nightFactor,falloffExponent:sconce.falloffExponent,color:'#ffcf88'}];
  if(decor.window&&daylight>.01)result.push({id:`${layout.id}:daylight`,kind:'daylight',x:decor.window.x,y:b.top+.02,
    height:base+(decor.window.bottom+decor.window.top)/2,nx:0,ny:1,reach:7,strength:.65*daylight,color:'#e3e7c8'});
  for(const item of layout.fixtures||[])if(item.kind==='fireplace')result.push({id:`${layout.id}:hearth`,kind:'hearth',
    x:item.x,y:item.y+item.depth/2+.02,height:base+.7,nx:0,ny:1,reach:nightEmitterProfile(6,1.7,{night:nightFactor,hasMoon}).reach,strength:.9*nightFactor,
    falloffExponent:nightEmitterProfile(6,1.7,{night:nightFactor,hasMoon}).falloffExponent,color:'#ffa85f'});
  for(const item of [...(layout.fixtures||[]).filter(item=>item.catalogId),...furniture])if(furnitureUse(item)==='light'&&item.enabled!==false){
    const visual=furnitureVisual(item),source=visual.light||{height:2.4,reach:5.5,strength:1,color:'#ffcf88',nx:0,ny:0};
    const profile=nightEmitterProfile(source.reach,source.falloffExponent??1.7,{night:nightFactor,hasMoon});
    const flicker=source.flicker||0,variation=flicker?1-flicker*.5+flicker*(.5+.5*Math.sin(time*7.1+(item.variantIndex||0)*2.3)):1;
    result.push({id:item.id||`${layout.id}:${item.catalogId}:${item.x}:${item.y}`,kind:'lamp',x:item.x,y:item.y,
      height:(layout.elevation==='raised'&&item.y<=7?2:0)+(item.baseZ||0)+source.height,
      nx:source.nx||0,ny:source.ny||0,reach:profile.reach,strength:source.strength*variation,
      falloffExponent:profile.falloffExponent,color:source.color,sourceKind:source.kind||'lamp',flicker});
  }
  return result;
}
// Room projections already use tileSize as their screen-space unit. Applying
// spriteScale again here squares the camera zoom and creates room-sized halos.
export function roomGlowProfile(light,tileSize=16,pulse=1){
  const strength=Math.max(0,Math.min(1,light?.strength||0));
  return {
    radius:tileSize*(light?.kind==='hearth'?2.6:1.7)*Math.max(.9,Math.min(1.1,pulse)),
    opacity:.04+strength*.32,
  };
}
// Slab intersection with the ray from the emitter to a ground/actor point.
// Occluders carry height, so low furniture cannot shadow above itself.
export function lightAmount(light,target,obstacles=[]){
  if(!(light.strength>0)||!(light.reach>0))return 0;
  const dx=target.x-light.x,dy=target.y-light.y,d=Math.hypot(dx,dy);
  if(d>=light.reach)return 0;
  let angular=1;
  if(light.nx||light.ny){const dot=(dx*light.nx+dy*light.ny)/(d||1);if(dot<=0)return 0;angular=Math.pow(dot,.6);}
  const z=target.height||0;
  for(const box of obstacles){
    if(box.owner===light.id||(light.owner&&box.owner===light.owner))continue;
    let lo=.015,hi=.99;
    for(const [v,delta,min,max] of [[light.x,dx,box.left,box.right],[light.y,dy,box.top,box.bottom]]){
      if(Math.abs(delta)<1e-9){if(v<min||v>max){hi=-1;break;}}
      else {const a=(min-v)/delta,b=(max-v)/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
    }
    if(lo<=hi){
      // The ray may pass through the top or bottom of the volume before it
      // exits its footprint. Test the whole segment, not just the exit point.
      const a=light.height+(z-light.height)*lo,b=light.height+(z-light.height)*hi;
      if(Math.min(a,b)<(box.height??10)&&Math.max(a,b)>=(box.base??-10))return 0;
    }
  }
  const distance=Math.hypot(dx,dy,(light.height-z)*.45)/light.reach;
  const falloff=Math.max(0,1-distance)**(light.falloffExponent??1.7);
  return light.strength*falloff*angular;
}
export function actorWindowLight(position,lights,obstacles=[],ground=0,bodyHeight=1.8){
  const samples=[.1,.5,.9].map(fraction=>{
    const height=fraction*bodyHeight;
    let amount=0,color='#efbc79';
    for(const light of lights){
      // Windows and campfires both warm the actor: the body reads lit by its surroundings.
      if(light.kind!=='window'&&light.kind!=='fire')continue;
      const value=lightAmount(light,{x:position.x,y:position.y,height:ground+(position.z||0)+height},obstacles);
      if(value>amount){amount=value;color=light.color||color;}
    }
    return {height,fraction,amount,color};
  });
  return samples.some(sample=>sample.amount>.001)?samples:null;
}
export function roomLightObstacles(layout,furniture=[]){
  const base=layout.elevation==='raised'?2:0;
  return [...(layout.fixtures||[]).map(item=>{const floor=layout.elevation==='raised'&&item.y<=7?base:0;return {...fixtureBounds(item),base:floor+(item.baseZ||0),height:floor+(item.baseZ||0)+item.height};}),
    ...(layout.counter?[{...layout.counter,base,height:base+1.45}]:[]),
    ...furniture.map(item=>{const visual=furnitureVisual(item),floor=layout.elevation==='raised'&&item.y<=7?base:0;
      return {...fixtureBounds(visual),owner:item.id,base:floor+(item.baseZ||0),height:floor+(item.baseZ||0)+visual.height};})];
}

// The strongest light reaching an actor, used to place its rim light. Returns the
// source position, colour and sampled amount, or null when no light touches it.
export function actorRimSource(position,lights,obstacles=[],ground=0,bodyHeight=1.8){
  let best=null;
  for(const light of lights){
    if(light.kind!=='window'&&light.kind!=='fire')continue;
    const amount=lightAmount(light,{x:position.x,y:position.y,height:ground+(position.z||0)+bodyHeight*.6},obstacles);
    if(amount>0.001&&(!best||amount>best.amount))best={x:light.x,y:light.y,height:light.height||0,color:light.color||'#efbc79',amount};
  }
  return best;
}
