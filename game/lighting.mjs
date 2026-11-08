import { CAMPFIRE_LIGHT_RADIUS_TILES } from './campfire-light.mjs';

export const FIRE_LIGHT_REACH=CAMPFIRE_LIGHT_RADIUS_TILES;

// Local sources carry farther at night, with the strongest contrast on moonless
// nights. A softer edge keeps that extra reach from ending in a hard light ring.
export function nightEmitterProfile(baseReach,baseFalloff=1.7,{night=1,hasMoon=false}={}){
 const darkness=Math.max(0,Math.min(1,Number.isFinite(night)?night:0));
 const reach=Number.isFinite(baseReach)?Math.max(0,baseReach):0;
 const falloff=Number.isFinite(baseFalloff)?baseFalloff:1.7;
 const moonless=hasMoon?0:1;
 return {
  reach:reach*(1+darkness*(.10+.10*moonless)),
  falloffExponent:Math.max(.85,falloff-darkness*(.12+.10*moonless)),
 };
}

// Moonless forest nights retain a faint ambient fill. Moonlight lifts the scene,
// but stays subdued enough for nearby windows, fires, and lanterns to read clearly.
export function exteriorNightOpacity(day,{theme='forest',dimensionId='surface'}={}){
 const night=theme==='dark'?.36+day.night*.64:day.night;
 const darkness=dimensionId.startsWith('arrival-')?.90
  :theme==='forest'?(day.hasMoon?.82:.91)
  :({dark:.995,sky:.62,magic:.82,inferno:.84,giants:.94,energy:.82})[theme]??.92;
 const moonRelief=Math.min(.09,(day.moonlightStrength||0)*.64);
 return Math.max(0,Math.min(1,(darkness-moonRelief)*night));
}
export function dominantLight(position,fires=[]) {
 let nearest=null,distance=FIRE_LIGHT_REACH;
 for(const fire of fires){const d=Math.hypot(position.x-fire.x,position.y-fire.y);if(d<distance){nearest=fire;distance=d}}
 return nearest?{kind:'fire',x:nearest.x,y:nearest.y}:{kind:'moon',x:position.x-20,y:position.y-35};
}
export function nightBrightness(position,fires=[]) {
 let brightness=.12;
 for(const fire of fires){const d=Math.hypot(position.x-fire.x,position.y-fire.y);brightness=Math.max(brightness,.12+.88*Math.max(0,1-d/FIRE_LIGHT_REACH)**1.7)}
 return brightness;
}
// Flame motion keeps its own livelier rhythm; emitted light breathes more slowly.
export function flameEnvelope(time,fire={x:0,y:0},reducedMotion=false){if(reducedMotion)return 1;const seed=fire.x*1.7+fire.y*.63;return 1+.034*Math.sin(time*5.3+seed)+.022*Math.sin(time*9.1+seed*2)+.012*Math.sin(time*2.7+seed*.4)}
function flickerNoise(sample,seed){const raw=Math.sin(sample*127.1+seed*311.7)*43758.5453;return (raw-Math.floor(raw))*2-1}
function smoothFlicker(time,seed,frequency){const position=time*frequency,index=Math.floor(position),fraction=position-index,eased=1-(1-fraction)**2.4,from=flickerNoise(index,seed),to=flickerNoise(index+1,seed);return from+(to-from)*eased}
export function flameLightEnvelope(time,fire={x:0,y:0},reducedMotion=false){if(reducedMotion)return 1;const seed=fire.x*1.7+fire.y*.63,flutter=smoothFlicker(time,seed,13.5);const variation=.042*Math.sin(time*2.1+seed)+.024*Math.sin(time*7.4+seed*1.8)+.015*Math.sin(time*13.2+seed*.4)+.08*flutter;return Math.max(.78,Math.min(1.22,1+variation))}
