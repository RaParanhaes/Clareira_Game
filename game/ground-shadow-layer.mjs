// Shadow strength is opaque grayscale over black. Lighten selects the strongest
// coverage without accumulating darkness. Invert once, then multiply the ground.
export function clippedShadowBounds(bounds,width,height){
  const left=Math.max(0,Math.floor(bounds.left)),top=Math.max(0,Math.floor(bounds.top));
  const right=Math.min(width,Math.ceil(bounds.right)),bottom=Math.min(height,Math.ceil(bounds.bottom));
  return right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null;
}
export function createGroundShadowLayer(createCanvas){
  const mask=createCanvas();let active=false,width=0,height=0;
  return {
    get active(){return active;},
    begin(w,h){
      width=Math.ceil(w);height=Math.ceil(h);
      if(mask.width!==width)mask.width=width;if(mask.height!==height)mask.height=height;
      const c=mask.getContext('2d');c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
      c.fillStyle='#000';c.fillRect(0,0,width,height);active=true;
    },
    add(bounds,paint){
      const b=clippedShadowBounds(bounds,width,height);if(!b)return;
      const c=mask.getContext('2d');c.save();c.globalCompositeOperation='lighten';c.globalAlpha=1;
      paint(c);c.restore();
    },
    composite(context){
      if(!active)return;active=false;
      const c=mask.getContext('2d');c.save();c.globalCompositeOperation='difference';c.globalAlpha=1;c.fillStyle='#fff';c.fillRect(0,0,width,height);c.restore();
      context.save();context.globalAlpha=1;context.globalCompositeOperation='multiply';context.drawImage(mask,0,0);context.restore();
    },
  };
}

export function avatarShadowProfile({scale=1,z=0,swimming=false,strength=0,lengthScale=1,bodyHeight=80}={}){
  const lift=Math.max(0,Number.isFinite(z)?z:0);
  const light=Math.max(0,Math.min(1,strength||0));
  const length=Math.max(.35,Math.min(2,lengthScale||1));
  return {contactWidth:17*scale/(1+lift*.12),contactHeight:(swimming?2:4)*scale,
    contactOpacity:(swimming?.12:.32)/(1+lift*.6),
    castLength:(bodyHeight+lift*12)*scale*length,castWidth:(swimming?6:14)*scale,
    castOpacity:casterShadowOpacity(light)*(swimming?.4:1)/(1+lift*.18)};
}

// At night, a sharp body-shaped projection reads like a second, detached
// character on dark terrain. Keep the contact shadow, but make the directional
// projection shorter and softer so it stays visually attached to the feet.
export function avatarDirectionalShadowProfile(profile,{daylight=1,sourceKind='ambient'}={}){
  if(daylight>=.18)return {length:profile.castLength,width:profile.castWidth,opacity:profile.castOpacity,hardSilhouette:true};
  if(sourceKind==='ambient'||profile.castOpacity<=0)return {length:0,width:profile.castWidth,opacity:0,hardSilhouette:false};
  const night=1-Math.max(0,Math.min(1,daylight/.18));
  return {
    length:profile.castLength*(1-.38*night),
    width:profile.castWidth*(1-.24*night),
    opacity:profile.castOpacity*(1-(sourceKind==='moon' ? .24 : .42)*night),
    hardSilhouette:false,
  };
}

export function moonShadowProfile(strength=0,elevation=0){
  const amount=Math.max(0,Math.min(1,(Number.isFinite(strength)?strength:0)/.14));
  const height=Math.max(0,Math.min(1,Number.isFinite(elevation)?elevation:0));
  return {strength:.30*Math.sqrt(amount),lengthScale:.45+.65*(1-height)};
}

export function convexShadowHull(points){
  const sorted=points.map(p=>({x:p.x,y:p.y})).sort((a,b)=>a.x-b.x||a.y-b.y)
    .filter((p,i,a)=>!i||p.x!==a[i-1].x||p.y!==a[i-1].y);
  if(sorted.length<3)return sorted;
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half=values=>{const out=[];for(const p of values){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  return [...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)];
}

export function projectedRoofShadow(building,roof,project,direction,heightPixels){
  const b=building.bounds,base=[[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]].map(([x,y])=>project(x,y));
  const slope=Math.max(0,direction.lengthScale);
  const elevated=roof.planes.flat().map(([x,y,z])=>{const p=project(x,y),length=z*heightPixels*slope;return {x:p.x+direction.x*length,y:p.y+direction.y*length};});
  return convexShadowHull([...base,...elevated]);
}

// A building's center is inside its walls, so checking light there incorrectly
// marks nearby lamps as occluded by the building that should cast the shadow.
// Sample just outside each facade and use the strongest exposed light.
export function strongestBuildingShadowDirection(bounds,resolve,clearance=.22){
  const centerX=(bounds.left+bounds.right)/2,centerY=(bounds.top+bounds.bottom)/2;
  const samples=[
    {x:centerX,y:bounds.top-clearance},
    {x:bounds.right+clearance,y:centerY},
    {x:centerX,y:bounds.bottom+clearance},
    {x:bounds.left-clearance,y:centerY},
  ];
  return samples.map(({x,y})=>resolve(x,y)).reduce((best,current)=>
    current.strength>best.strength?current:best);
}

// The final night veil reduces contrast in the ground pass. Boost only local
// and lunar building projections enough to remain legible through that veil.
export function buildingGroundShadowStrength(direction){
  const strength=Math.max(0,Math.min(1,Number.isFinite(direction?.strength)?direction.strength:0));
  if(direction?.source?.kind==='sun')return .62*strength;
  // Lua: sombra suave. Antes ficava até .40 e pesava no chão à noite.
  if(direction?.source?.kind==='moon')return Math.min(.20,strength*.6);
  if(['window','fire','lantern'].includes(direction?.source?.kind))return Math.min(.7,strength*7);
  return 0;
}

// Local emitters fill celestial shade where their light reaches the ground.
// Strong direct light can erase a house projection in that lit patch.
export function attenuateShadowWithLocalLight(shadowOpacity,lightAmount){
  const shadow=Math.max(0,Math.min(1,Number.isFinite(shadowOpacity)?shadowOpacity:0));
  const fill=Math.max(0,Math.min(1,Number.isFinite(lightAmount)?lightAmount:0));
  return shadow*Math.pow(1-fill,1.6);
}

export function fillFootprintShadowPath(context,points,dx=0,dy=0){
  if(!Array.isArray(points)||points.length<3)return false;
  context.beginPath();
  points.forEach((point,index)=>index?context.lineTo(point.x,point.y):context.moveTo(point.x,point.y));
  // A zero offset is a solid projected silhouette. Tracing the same polygon
  // backwards would cancel its winding and make Canvas fill nothing.
  if(dx||dy)for(let index=points.length-1;index>=0;index--)
    context.lineTo(points[index].x+dx,points[index].y+dy);
  context.closePath();context.fill();return true;
}

export function actorShadowOutline(origin,direction,length,width){
  const norm=Math.hypot(direction.x,direction.y)||1,dx=direction.x/norm,dy=direction.y/norm;
  return [[0,-.25],[.35,-.34],[.57,-.4],[.7,-.55],[.78,-.4],[.8,-.22],
    [.9,-.27],[1,-.15],[1, .15],[.9,.27],[.8,.22],[.78,.4],[.7,.55],[.57,.4],[.35,.34],[0,.25],[.26,0]]
    .map(([along,across])=>({x:origin.x+dx*along*length-dy*across*width,y:origin.y+dy*along*length+dx*across*width}));
}

// Shared response for every caster; zero incident light means no projection.
export function casterShadowOpacity(strength){
  return .42*Math.max(0,Math.min(1,Number.isFinite(strength)?strength:0));
}
export function localShadowProfile(strength,kind='lantern',distance=0){
  const amount=Math.max(0,Math.min(1,Number.isFinite(strength)?strength:0));
  return {strength:(kind==='fire'?.44:.36)*amount,
    lengthScale:kind==='fire'?.75+Math.min(.65,distance*.08):.78+Math.min(.42,distance*.1)};
}
export function celestialShadowDirection(position){
  const dx=(.5-(position?.x??.5))*1280,dy=(.5-(position?.y??.15))*720;
  const length=Math.hypot(dx,dy)||1;return {x:dx/length,y:dy/length};
}
