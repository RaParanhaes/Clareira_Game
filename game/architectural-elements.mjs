import { BUILDING_STANDARD as S } from './building-standard.mjs';

function frontWingBounds(building){
  const spec=building.frontWing,b=building.bounds;
  if(!spec)return null;
  const width=Math.min(spec.width||2.6,(b.right-b.left)*.48);
  const depth=Math.min(spec.depth||2.5,(b.bottom-b.top)*.48);
  const left=spec.side==='right'?b.right-width:b.left;
  return {left,right:left+width,top:b.bottom-depth,bottom:b.bottom+.32,
    wallHeight:spec.wallHeight||3.15,roofRise:spec.roofRise||1.6,roofEave:.16};
}

// One source for facade openings, light emitters and structural footprints.
export function buildingWindows(building) {
  if(building.windowObjects)return building.windowObjects.filter(w=>w.enabled!==false);
  const b=building.bounds,result=[];
  for(let floor=0;floor<(building.storeys||1);floor++){
    const z=floor*S.storeyHeight;
    const xs=building.kind==='hotel'?[b.left+1.9,b.left+4.4,b.right-4.4,b.right-1.9]:[b.left+1.35,b.right-1.35];
    for(const x of xs){
      if(floor===0&&Math.abs(x-building.door.x)<1.65)continue;
      const wing=building.frontWing&&floor===0?frontWingBounds(building):null;
      const inWing=wing&&x>=wing.left+.15&&x<=wing.right-.15;
      result.push({id:`${building.id}:front:${floor}:${x}`,x,y:inWing?wing.bottom:b.bottom+(floor?building.jettyDepth||0:0),z:z+(S.windowBottom+S.windowTop)/2,
        nx:0,ny:1,width:S.windowWidth,bottom:z+S.windowBottom,top:z+S.windowTop});
    }
    for(let y=b.top+1.5;y<b.bottom-1.1;y+=2.7)result.push({id:`${building.id}:side:${floor}:${y}`,
      x:b.right+(floor?building.jettyDepth||0:0),y,z:z+(S.windowBottom+S.windowTop)/2,nx:1,ny:0,width:.9,bottom:z+S.windowBottom,top:z+S.windowTop});
  }
  if(building.kind==='inn'&&building.roofAxis!=='x')result.push({id:`${building.id}:gable`,x:building.door.x,y:b.bottom,
    z:building.height+.9,nx:0,ny:1,width:.64,bottom:building.height+.45,top:building.height+1.35});
  return result;
}
export function buildingArchitecture(building){
  if(building.architectureObjects)return {...building.architectureObjects,
    dormers:building.dormers||[],frontWing:frontWingBounds(building)};
  const b=building.bounds,door=building.door.x;
  const canopy={left:door-1.12,right:door+1.12,top:b.bottom,bottom:b.bottom+.92,z:building.kind==='hotel'?S.storeyHeight-.18:S.doorHeight+.86};
  const posts=[canopy.left+.12,canopy.right-.12].map(x=>({left:x-.15,right:x+.15,top:b.bottom+.6,bottom:b.bottom+.9,height:canopy.z}));
  const balcony=building.kind==='hotel'?{left:door-1.65,right:door+1.65,top:b.bottom,bottom:b.bottom+.5,z:S.storeyHeight}:null;
  const dormers=(building.dormers||[]).map(item=>({...item,x:door+(item.offsetX||0),y:b.bottom-(item.recess||.38)}));
  return {canopy,posts,balcony,dormers,frontWing:frontWingBounds(building)};
}
