import { CAMPFIRE_LIGHT_RADIUS_TILES } from './campfire-light.mjs';
import { lightAmount } from './scene-lights.mjs';
import { celestialShadowDirection, moonShadowProfile, localShadowProfile } from './ground-shadow-layer.mjs';

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

// Central lighting decisions: what each light is (colour, direction, strength, occlusion).
// Drawing stays in the renderers; these functions only decide.
export const NIGHT_VEIL_COLORS=Object.freeze({dark:'#000000',sky:'#173044',magic:'#06091b',inferno:'#120604',giants:'#06100e',energy:'#020a18'});
export function nightVeilColor(theme){return NIGHT_VEIL_COLORS[theme]||'#0c1a2a';}

export function celestialLightState(gameDay){
  const sunStrength=gameDay.sunlightStrength??gameDay.daylight;
  const moonStrength=gameDay.moonlightStrength;
  const hasSun=Boolean(gameDay.sunPosition&&sunStrength>=moonStrength&&sunStrength>.01);
  return (()=>{
    if(sunStrength<=.001&&moonStrength<=.001)return null;
    // Celestial rays belong to the world: phone aspect ratio must not rotate them.
    const sunDirection=celestialShadowDirection(gameDay.sunPosition),moonDirection=celestialShadowDirection(gameDay.moonPosition);
    // At dawn and dusk the sun and moon overlap in strength; blend their directions
    // so the single stylized shadow turns smoothly instead of snapping across the scene.
    const mixedX=sunDirection.x*sunStrength+moonDirection.x*moonStrength;
    const mixedY=sunDirection.y*sunStrength+moonDirection.y*moonStrength;
    const mixedLength=Math.hypot(mixedX,mixedY);
    const direction=mixedLength>.001
      ? {x:mixedX/mixedLength,y:mixedY/mixedLength}
      : hasSun?sunDirection:moonDirection;
    const elevation=hasSun?gameDay.sunElevation:gameDay.moonElevation;
    return {
      kind:hasSun?'sun':'moon',
      directionX:direction.x,directionY:direction.y,
      lightStrength:Math.max(sunStrength,moonStrength),
      strength:hasSun ? .34 + .5*sunStrength : moonShadowProfile(moonStrength,elevation).strength,
      // Shadows lengthen as either celestial light approaches the horizon.
      lengthScale:hasSun ? .18+1.45*(1-elevation) : moonShadowProfile(moonStrength,elevation).lengthScale,
    };
  })();
}

export function createShadowDirectionResolver({globalLight,localLights,obstacles,point,surfaceHeight,getCamera}){
  const shadowDirection=(x,y,ignoreOwner=null)=>{
    const p=point(x,y);
    let strongestLocalLight=null,strongestLocalStrength=0,strongestLocalDistance=0;
    for(const light of localLights){
      // A building cannot cast a shadow from its own windows or porch lantern,
      // but neighboring buildings' lights still illuminate its roof and walls.
      if(ignoreOwner&&light.owner===ignoreOwner)continue;
      const distance=Math.hypot(x-light.x,y-light.y);
      if(distance>=light.reach)continue;
      const strength=lightAmount(light,{x,y,height:surfaceHeight(x,y,'clearing')+.3},obstacles);
      if(strength>strongestLocalStrength){strongestLocalLight=light;strongestLocalStrength=strength;strongestLocalDistance=distance;}
    }
    // Blend nearby emitters with the broad sky light so shadows turn gradually as
    // a fire or window becomes the stronger source.
    if(strongestLocalLight){
      const ratio=globalLight?strongestLocalStrength/Math.max(.01,globalLight.lightStrength):Infinity;
      const blendProgress=globalLight?Math.max(0,Math.min(1,(ratio-.65)/.9)):1;
      const localMix=blendProgress*blendProgress*(3-2*blendProgress);
      if(localMix>.001){
        const source=point(strongestLocalLight.x,strongestLocalLight.y,getCamera(),strongestLocalLight.height);
        const localAngle=Math.atan2(p.y-source.y,p.x-source.x);
        const globalAngle=globalLight?Math.atan2(globalLight.directionY,globalLight.directionX):localAngle;
        let angleDelta=Math.atan2(Math.sin(localAngle-globalAngle),Math.cos(localAngle-globalAngle));
        if(Math.abs(Math.abs(angleDelta)-Math.PI)<.001)angleDelta=Math.PI;
        const angle=globalAngle+angleDelta*localMix;
        const localProfile=localShadowProfile(strongestLocalStrength,strongestLocalLight.kind,strongestLocalDistance);
        const localStrength=localProfile.strength,localLength=localProfile.lengthScale;
        return {
          x:Math.cos(angle),y:Math.sin(angle),
          source:!globalLight||localMix>.78?{kind:strongestLocalLight.kind,id:strongestLocalLight.id||strongestLocalLight.fire?.id,x:strongestLocalLight.x,y:strongestLocalLight.y}:{kind:globalLight.kind},
          strength:globalLight?globalLight.strength+(localStrength-globalLight.strength)*localMix:localStrength,
          lengthScale:globalLight?globalLight.lengthScale+(localLength-globalLight.lengthScale)*localMix:localLength,
        };
      }
    }
    if(!globalLight)return {x:0,y:1,source:{kind:'ambient'},strength:0,lengthScale:1};
    return {x:globalLight.directionX,y:globalLight.directionY,source:{kind:globalLight.kind},
      strength:globalLight.strength,lengthScale:globalLight.lengthScale};
  };
  return shadowDirection;
}

export function buildingLocalFill(building,direction,localLights,obstacles,surfaceHeight){
  const b=building.bounds,edge=.24;
  let localFill=0;
    for(const light of localLights){
      const sourceId=String(light.id||light.fire?.id||'');
      if(sourceId&&sourceId===String(direction.source?.id||''))continue;
      // A building's own windows and porch lantern must not erase its own shadow;
      // only neighboring emitters fill it.
      if(light.owner===building.id)continue;
      const targetX=Math.max(b.left-edge,Math.min(b.right+edge,light.x));
      const targetY=Math.max(b.top-edge,Math.min(b.bottom+edge,light.y));
      if(Math.hypot(light.x-targetX,light.y-targetY)>light.reach)continue;
      const amount=lightAmount(light,{x:targetX,y:targetY,
        height:surfaceHeight(targetX,targetY,'clearing')+.3},obstacles);
      if(amount>localFill)localFill=amount;
    }
  return localFill;
}
