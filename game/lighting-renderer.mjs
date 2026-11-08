import { surfaceHeight, HEIGHT_PIXELS } from './elevation.mjs';
import { facadePanel } from './building-art.mjs';
import { lightmapStats } from './lightmap-renderer.mjs';
import { ARRIVAL_CAMPFIRE_REACH_MULTIPLIER, ARRIVAL_CAMPFIRE_EDGE_POWER, CAMPFIRE_LIGHT_RADIUS_TILES } from './campfire-light.mjs';
import { nightEmitterProfile, exteriorNightOpacity, nightVeilColor, flameLightEnvelope } from './lighting.mjs';
import { campfireFlameStrength } from './campfire-life.mjs';
import { campfireGlowPulse } from './campfire-flame-design.mjs';
import { windSwayAt, windStrengthAt } from './wind.mjs';
import { RECEPTION_BUILDING, VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { roofGeometry } from './building-standard.mjs';
import { buildingWindows } from './architectural-elements.mjs';

// Night drawing pass. It reads main.js state through one explicit deps object
// (getters/setters keep live bindings, including the temporary camera swap).
let D=null;
export function setNightDeps(deps){D=deps;}

const nightMask=document.createElement('canvas');

const NIGHT_MASK_SCALE=.25;

const NIGHT_LIGHT_FPS=30;

const NIGHT_MASK_PAD=640;

function paintNightMask(anchor=D.camera){
 const shiftX=-((D.camera.x-anchor.x)-(D.camera.y-anchor.y))*D.TILE_X;
 const shiftY=-((D.camera.x-anchor.x)+(D.camera.y-anchor.y))*D.TILE_Y;
 D.ctx.save();D.ctx.imageSmoothingEnabled=true;
 D.ctx.drawImage(nightMask,(NIGHT_MASK_PAD-shiftX)*NIGHT_MASK_SCALE,(NIGHT_MASK_PAD-shiftY)*NIGHT_MASK_SCALE,
   D.viewWidth*NIGHT_MASK_SCALE,D.viewHeight*NIGHT_MASK_SCALE,0,0,D.viewWidth,D.viewHeight);
 D.ctx.restore();
}

function carriedLanternSources(){
 const sources=[],seen=new Set();
 for(const player of D.livePlayers.values()){
  const appearance=player.id===D.selfId?(D.activeAvatarAppearance||player.appearance):player.appearance;
  if(!appearance||(![appearance.mainHandId,appearance.offHandId].includes('equipment.lantern')&&appearance.item!=='lantern'))continue;
  if(player.location&&player.location!=='clearing')continue;
  if(player.dimensionId&&player.dimensionId!==D.worldDimensionId)continue;
  const position=player.id===D.selfId?D.localRenderPosition:player;
  if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))continue;
  const key=String(player.id||'');if(seen.has(key))continue;seen.add(key);
  sources.push({id:key,x:position.x,y:position.y,height:surfaceHeight(position.x,position.y,'clearing')+.82});
 }
 if(D.selfId&&!seen.has(D.selfId)&&D.activeAvatarAppearance
   &&([D.activeAvatarAppearance.mainHandId,D.activeAvatarAppearance.offHandId].includes('equipment.lantern')||D.activeAvatarAppearance.item==='lantern')){
  sources.push({id:D.selfId,x:D.localRenderPosition.x,y:D.localRenderPosition.y,
    height:surfaceHeight(D.localRenderPosition.x,D.localRenderPosition.y,'clearing')+.82});
 }
 return sources;
}

function windowFacadeGeometry(project,building,win,light){
  const alongX=Boolean(win.ny),alongY=Boolean(win.nx);
  if(!alongX&&!alongY)return null;
  const halfSpan=Math.max(.8,Math.min(1.65,(win.width||1)*1.25));
  const wall={x1:win.x-(alongX?halfSpan:0),y1:win.y-(alongY?halfSpan:0),
    x2:win.x+(alongX?halfSpan:0),y2:win.y+(alongY?halfSpan:0),
    bottom:Math.max(0,win.bottom-.95),top:Math.min(win.top+.85,Math.max(building.height||0,win.top+.2))};
  if(wall.top<=wall.bottom)return null;
  const points=facadePanel(project,wall,0,0,1,1);
  const center=project(win.x,win.y,(win.bottom+win.top)/2);
  const radiusX=D.TILE_X*(1.35+Math.min(.55,(light.reach||0)*.045));
  const radiusY=Math.max(HEIGHT_PIXELS*D.spriteScale*1.85,(wall.top-wall.bottom)*HEIGHT_PIXELS*D.spriteScale*.55);
  return {points,center,radiusX,radiusY};
}

function drawNight(){
 if(D.worldLocation==='room'){D.drawRoomLighting();return;}
 if(D.worldLocation!=='clearing')return;
 const nightFactor = D.dimensionTheme === 'dark' ? .36 + D.gameDay.night * .64 : D.gameDay.night;
 // The mask and roof/window cutouts are expensive, and contribute nothing
 // during full daylight. The main canvas is redrawn each frame, so it is safe
 // to omit the mask entirely until night begins.
 if(nightFactor<=0)return;
 const maskWidth=Math.ceil((D.viewWidth+NIGHT_MASK_PAD*2)*NIGHT_MASK_SCALE);
 const maskHeight=Math.ceil((D.viewHeight+NIGHT_MASK_PAD*2)*NIGHT_MASK_SCALE);
 if(nightMask.width!==maskWidth||nightMask.height!==maskHeight){nightMask.width=maskWidth;nightMask.height=maskHeight;D.nightMaskKey='';}
 const lightFrame=D.FRAME_LIT_FIRES.length?Math.floor(D.worldClock*NIGHT_LIGHT_FPS):0;
 const nightCamera={x:Math.round(D.camera.x),y:Math.round(D.camera.y)};
 const teleportLights=D.teleportEffects.lightingPoints(D.worldDimensionId,D.clientServerTime());
 const teleportLightKey=teleportLights.map(light=>`${light.id}:${light.frame}`).join(';');
 const lanterns=carriedLanternSources();
 const lanternKey=lanterns.map(light=>`${light.id}:${light.x.toFixed(2)}:${light.y.toFixed(2)}`).join(';');
 const key=`${nightCamera.x}:${nightCamera.y}:${D.TILE_X}:${D.worldDimensionId}:${D.dimensionTheme}:${lightFrame}:${teleportLightKey}:${lanternKey}:${D.gameDay.hasMoon?1:0}:${(D.gameDay.moonlightStrength||0).toFixed(3)}:${Math.round(nightFactor*100)}:${nightMask.width}:${nightMask.height}:${lightmapStats().revision}:`+D.FRAME_LIT_FIRES.map(f=>`${f.id||''}:${f.x}:${f.y}`).join(';');
 if(key===D.nightMaskKey){paintNightMask(nightCamera);return;}D.nightMaskKey=key;
 const currentCamera=D.camera;D.camera=nightCamera;
 const mask=nightMask.getContext('2d');mask.setTransform(NIGHT_MASK_SCALE,0,0,NIGHT_MASK_SCALE,0,0);mask.translate(NIGHT_MASK_PAD,NIGHT_MASK_PAD);mask.clearRect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,D.viewWidth+NIGHT_MASK_PAD*2,D.viewHeight+NIGHT_MASK_PAD*2);
 const isArrival=D.worldDimensionId.startsWith('arrival-');
 const arrivalReach=isArrival?ARRIVAL_CAMPFIRE_REACH_MULTIPLIER:1;
 const edgePower=isArrival?ARRIVAL_CAMPFIRE_EDGE_POWER:1.35;
 const fireProfile=isArrival?{reach:CAMPFIRE_LIGHT_RADIUS_TILES,falloffExponent:edgePower}
   :nightEmitterProfile(CAMPFIRE_LIGHT_RADIUS_TILES,edgePower,{night:nightFactor,hasMoon:D.gameDay.hasMoon});
 mask.globalCompositeOperation='source-over';mask.globalAlpha=exteriorNightOpacity(D.gameDay,{theme:D.dimensionTheme,dimensionId:D.worldDimensionId});mask.fillStyle=nightVeilColor(D.dimensionTheme);mask.fillRect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,D.viewWidth+NIGHT_MASK_PAD*2,D.viewHeight+NIGHT_MASK_PAD*2);mask.globalAlpha=1;
 mask.globalCompositeOperation='destination-out';
 if(isArrival&&D.arrivalFireIgnition()<1){
  const hearth=D.dimensionList.find(item=>item.id===D.worldDimensionId)?.campfire;
  if(hearth){
   const p=D.point(hearth.x,hearth.y),radius=D.TILE_X*.9;
   const glimpse=mask.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
   glimpse.addColorStop(0,'#000000');glimpse.addColorStop(.5,'#000000a0');glimpse.addColorStop(1,'#00000000');
   mask.save();mask.globalAlpha=.4*(1-D.arrivalFireIgnition());mask.fillStyle=glimpse;
   mask.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);mask.restore();
  }
 }
 for(const fire of D.fires.values()){

  const strength=campfireFlameStrength(fire,performance.now())*(D.worldDimensionId.startsWith('arrival-')?D.arrivalFireIgnition():1);if(strength<=0)continue;
  const p=D.point(fire.x,fire.y),lightTime=lightFrame/NIGHT_LIGHT_FPS;
  const pulse=campfireGlowPulse(flameLightEnvelope(lightTime,fire,D.reducedMotion));
  const radius=D.TILE_X*fireProfile.reach*arrivalReach*(.32+.68*strength)*pulse*(D.worldDimensionId.startsWith('arrival-') ? .35+.65*D.arrivalFireIgnition() : 1);
  const sway=D.reducedMotion?0:windSwayAt(fire.x,fire.y,lightTime)*windStrengthAt(fire.x,fire.y)*5;
  const lightX=p.x+sway,lightY=p.y-7;
  mask.save();mask.translate(lightX,lightY);mask.scale(1,.66);
  const glow=mask.createRadialGradient(0,0,0,0,0,radius);
  D.addSphericalFalloffStops(glow,1,D.SHADOW_RGB_STOPS,fireProfile.falloffExponent);
  mask.globalAlpha=strength*pulse;mask.fillStyle=glow;mask.fillRect(-radius,-radius,radius*2,radius*2);mask.restore();
 }
 if(D.worldDimensionId==='surface'){
   mask.save();
   for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS].filter(b=>b.roofVisible!==false))for(const plane of roofGeometry(building).planes){
     mask.beginPath();mask.rect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,D.viewWidth+NIGHT_MASK_PAD*2,D.viewHeight+NIGHT_MASK_PAD*2);
     plane.forEach(([x,y,z],index)=>{const p=D.point(x,y,D.camera,z);if(index)mask.lineTo(p.x,p.y);else mask.moveTo(p.x,p.y);});mask.closePath();mask.clip('evenodd');
   }
   // Ground light must not erase darkness from a vertical facade that happens
   // to cover the same screen pixels. Window panes/glow are handled below.
   mask.save();
   for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
     const b=building.bounds,h=building.height;
     for(const face of [[[b.left,b.bottom,0],[b.right,b.bottom,0],[b.right,b.bottom,h],[b.left,b.bottom,h]],
       [[b.right,b.top,0],[b.right,b.bottom,0],[b.right,b.bottom,h],[b.right,b.top,h]]]){
       mask.beginPath();mask.rect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,D.viewWidth+NIGHT_MASK_PAD*2,D.viewHeight+NIGHT_MASK_PAD*2);
       face.forEach(([x,y,z],i)=>{const p=D.point(x,y,D.camera,z);if(i)mask.lineTo(p.x,p.y);else mask.moveTo(p.x,p.y);});mask.closePath();mask.clip('evenodd');
     }
   }
   D.paintSceneLightmaps(mask,.72);
   // Preserve the emitter's amber tint at night instead of only revealing
   // the unlit green terrain underneath the darkness cutout.
   mask.globalCompositeOperation='source-over';
   mask.restore();
   // Clear the actual luminous panes, without a halo leaking through the roof.
   const project=(x,y,z)=>D.point(x,y,D.camera,z);
   for(const light of D.currentSceneLights().lights.filter(light=>light.kind==='lantern'&&light.strength>0)){
     const points=facadePanel(project,{x1:light.x-.14,y1:light.y,x2:light.x+.14,y2:light.y,bottom:2.98,top:3.48},0,0,1,1);
     mask.beginPath();points.forEach(([x,y],i)=>i?mask.lineTo(x,y):mask.moveTo(x,y));mask.closePath();mask.fillStyle='#000';mask.fill();
   }
   const litWindows=new Map(D.currentSceneLights().lights.filter(light=>light.kind==='window'&&light.strength>0).map(light=>[light.id,light]));
   for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS])for(const win of buildingWindows(building)){
     const light=litWindows.get(win.id);if(!light)continue;
     const patch=windowFacadeGeometry(project,building,win,light);
     if(patch){
       const {points,center,radiusX,radiusY}=patch;
       mask.save();mask.beginPath();points.forEach(([x,y],i)=>i?mask.lineTo(x,y):mask.moveTo(x,y));mask.closePath();mask.clip();
       mask.globalCompositeOperation='destination-out';mask.globalAlpha=Math.min(.72,light.strength*.78);
       mask.translate(center.x,center.y);mask.scale(1,radiusY/radiusX);
       const glow=mask.createRadialGradient(0,0,0,0,0,radiusX);
       glow.addColorStop(0,'rgba(0,0,0,.82)');
       glow.addColorStop(.42,'rgba(0,0,0,.48)');
       glow.addColorStop(.78,'rgba(0,0,0,.16)');
       glow.addColorStop(1,'rgba(0,0,0,0)');
       mask.fillStyle=glow;mask.fillRect(-radiusX,-radiusX,radiusX*2,radiusX*2);mask.restore();
     }
     const wall={x1:win.x-(win.ny?win.width/2:0),y1:win.y-(win.nx?win.width/2:0),
       x2:win.x+(win.ny?win.width/2:0),y2:win.y+(win.nx?win.width/2:0),bottom:win.bottom,top:win.top};
     const points=facadePanel(project,wall,.1,.1,.9,.9);
     mask.beginPath();points.forEach(([x,y],i)=>i?mask.lineTo(x,y):mask.moveTo(x,y));mask.closePath();mask.fillStyle='#000';mask.fill();
   }
   mask.restore();
 }
 const lanternProfile=nightEmitterProfile(4.8,1.7,{night:nightFactor,hasMoon:D.gameDay.hasMoon});
 for(const source of lanterns){
  const p=D.point(source.x,source.y,D.camera,source.height),radius=D.TILE_X*lanternProfile.reach;
  mask.save();mask.translate(p.x,p.y-4);mask.scale(1,.7);
  const glow=mask.createRadialGradient(0,0,0,0,0,radius);
  glow.addColorStop(0,'#000000ff');glow.addColorStop(.22,'#000000e8');
  glow.addColorStop(.55,'#0000008c');glow.addColorStop(1,'#00000000');
  mask.fillStyle=glow;mask.fillRect(-radius,-radius,radius*2,radius*2);mask.restore();
 }
 for(const light of teleportLights){
  const p=D.point(light.x,light.y,D.camera,0),radius=D.TILE_X*6.5;
  mask.save();mask.translate(p.x,p.y-4);mask.scale(1.12,.82);
  const glow=mask.createRadialGradient(0,0,0,0,0,radius);
  glow.addColorStop(0,'#000000f5');glow.addColorStop(.32,'#000000cf');glow.addColorStop(.68,'#00000070');glow.addColorStop(1,'#00000000');
  mask.globalAlpha=light.strength;mask.fillStyle=glow;mask.beginPath();mask.arc(0,0,radius,0,Math.PI*2);mask.fill();mask.restore();
 }
 mask.globalCompositeOperation='source-over';D.camera=currentCamera;paintNightMask(nightCamera);
}

export { drawNight, carriedLanternSources };
