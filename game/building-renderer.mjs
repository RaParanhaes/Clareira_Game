import { buildingWindows, buildingArchitecture } from './architectural-elements.mjs';
import { BUILDING_STANDARD as S, roofGeometry } from './building-standard.mjs';
import { facadePanel, drawFacadeWindow } from './building-art.mjs';
import { drawMaterial } from './materials.mjs';
import { drawArchitectureUvFace } from './building-materials.mjs';
import { subscribeObjectCatalog } from './object-state.mjs';

const layerBounds=new WeakMap();
function prepareLayerBounds(image){
  if(!image?.naturalWidth||layerBounds.has(image)||typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  try{
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const {data,width,height}=ctx.getImageData(0,0,canvas.width,canvas.height);
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    layerBounds.set(image,right<left?null:{left,top,width:right-left+1,height:bottom-top+1});
  }catch{layerBounds.set(image,undefined);}
  finally{canvas.width=canvas.height=1;}
}
let cottageDaySprite=null,cottageNightSprite=null,cottageCanopySprite=null,cottagePostLeftSprite=null,cottagePostRightSprite=null;
let fernDaySprite=null,fernNightSprite=null,fernCanopySprite=null,fernPostLeftSprite=null,fernPostRightSprite=null;
let fernCompatibilityCache=new WeakMap();
subscribeObjectCatalog(()=>{fernCompatibilityCache=new WeakMap();});
export function setCottageExteriorSprites({day,night,canopy,postLeft,postRight}={}){
  for(const image of [day,night,canopy,postLeft,postRight])prepareLayerBounds(image);
  if(day!==undefined)cottageDaySprite=day?.naturalWidth?day:null;
  if(night!==undefined)cottageNightSprite=night?.naturalWidth?night:null;
  if(canopy!==undefined)cottageCanopySprite=canopy?.naturalWidth?canopy:null;
  if(postLeft!==undefined)cottagePostLeftSprite=postLeft?.naturalWidth?postLeft:null;
  if(postRight!==undefined)cottagePostRightSprite=postRight?.naturalWidth?postRight:null;
}

export function setFernExteriorSprites({day,night,canopy,postLeft,postRight}={}){
  for(const image of [day,night,canopy,postLeft,postRight])prepareLayerBounds(image);
  if(day!==undefined)fernDaySprite=day?.naturalWidth?day:null;
  if(night!==undefined)fernNightSprite=night?.naturalWidth?night:null;
  if(canopy!==undefined)fernCanopySprite=canopy?.naturalWidth?canopy:null;
  if(postLeft!==undefined)fernPostLeftSprite=postLeft?.naturalWidth?postLeft:null;
  if(postRight!==undefined)fernPostRightSprite=postRight?.naturalWidth?postRight:null;
}

// The sprite was authored against saved catalogue revision 4. If a future
// edit changes its footprint, openings, posts or palette, keep the data-driven
// renderer until an asset matching that edited building is authored.
function fernMatchesCatalog(building){
  const b=building.bounds;if(!b||!building.door||building.door.enabled===false)return false;
  const near=(a,c)=>Number.isFinite(a)&&Math.abs(a-c)<.001;
  if(!near(b.right-b.left,7)||!near(b.bottom-b.top,7)||!near(building.height,4.3)
    ||!near(building.door.x,(b.left+b.right)/2)||!near(building.door.y,b.bottom+.42)
    ||!near(building.door.height??building.doorHeight??3.6,3.6)||!near(building.doorWidth,1.25/7)
    ||!near(building.roofRise,2.1)||building.chimney||building.frontWing
    ||building.roofAxis!=='x'||(building.roofForm&&building.roofForm!=='hipped')
    ||(building.roofMaterial&&building.roofMaterial!=='thatch')||(building.storeys??1)!==1
    ||(building.hiddenFaces?.length??0)>0||(building.dormers?.length??0)>0
    ||(building.architectureStyle&&building.architectureStyle!=='timber-daub'))return false;
  const same=(a,c)=>Array.isArray(a)&&a.length===c.length&&a.every((v,i)=>v===c[i]);
  const sideWarm=['#564a40','#625044','#4a413b'],sideLegacy=['#4c574b','#59634e','#404b43'];
  if(!same(building.roof,['#53634e','#70805b','#84946a','#404e43'])
    ||!same(building.walls,['#98724e','#aa8154','#846343','#6f543c'])
    ||(!same(building.side,sideWarm)&&!same(building.side,sideLegacy))||building.foundation!=='#435052')return false;
  const cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2,windows=buildingWindows(building);
  const expected=[[-2.15,3.5,1.2,0,1],[2.15,3.5,1.2,0,1],[3.5,-2,.9,1,0],[3.5,.7,.9,1,0]];
  if(windows.length!==expected.length||!expected.every(([x,y,width,nx,ny])=>windows.some(w=>
    w.enabled!==false&&w.light?.enabled!==false&&near(w.x-cx,x)&&near(w.y-cy,y)
    &&near(w.width,width)&&near(w.bottom,1.05)&&near(w.top,2.85)&&w.nx===nx&&w.ny===ny)))return false;
  const {posts,canopy}=buildingArchitecture(building);
  return Boolean(canopy&&near(canopy.right-canopy.left,2.24)&&near(canopy.bottom-canopy.top,.92)
    &&near((canopy.left+canopy.right)/2-cx,0)&&near((canopy.top+canopy.bottom)/2-cy,3.96)&&near(canopy.z,4.46)
    &&posts.length===2&&[-1,1].every(x=>posts.some(post=>
      near((post.left+post.right)/2-cx,x)&&near((post.top+post.bottom)/2-cy,4.25)
      &&near(post.right-post.left,.30)&&near(post.bottom-post.top,.30)&&near(post.height,4.46))));
}

function cedarMatchesCatalog(building){
  const b=building.bounds;if(!b)return false;
  const near=(a,c)=>Number.isFinite(a)&&Math.abs(a-c)<.001;
  if(!near(b.right-b.left,7)||!near(b.bottom-b.top,7))return false;
  const windows=buildingWindows(building);if(windows.length!==1)return false;
  const window=windows[0],cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
  return window.enabled!==false&&window.light?.enabled!==false
    &&near(window.x-cx,2.15)&&near(window.y-cy,3.5)&&near(window.width,1.2)
    &&near(window.bottom,1.05)&&near(window.top,2.85)&&window.nx===0&&window.ny===1;
}

export function buildingUsesAuthoredExterior(building){
  if(building.id==='cabin-cedar-one')return cedarMatchesCatalog(building)&&Boolean(cottageDaySprite&&cottageCanopySprite&&cottagePostLeftSprite&&cottagePostRightSprite);
  if(building.id==='cabin-cedar-two'){
    if(!(fernDaySprite&&fernNightSprite&&fernCanopySprite&&fernPostLeftSprite&&fernPostRightSprite))return false;
    if(!fernCompatibilityCache.has(building))fernCompatibilityCache.set(building,fernMatchesCatalog(building));
    return fernCompatibilityCache.get(building);
  }
  return false;
}
function cottageLayers(building){
  if(!buildingUsesAuthoredExterior(building))return null;
  return building.id==='cabin-cedar-one'
    ? {day:cottageDaySprite,night:cottageNightSprite,canopy:cottageCanopySprite,postLeft:cottagePostLeftSprite,postRight:cottagePostRightSprite}
    : {day:fernDaySprite,night:fernNightSprite,canopy:fernCanopySprite,postLeft:fernPostLeftSprite,postRight:fernPostRightSprite};
}
function drawCottageLayer(ctx,sprite,building,project,scale){
  const b=building.bounds,p=project((b.left+b.right)/2,(b.top+b.bottom)/2,0);
  // Every layer shares the exact world scale and ground-centre pivot. Padding
  // includes the real 7x7 walls, eaves and canonical posts outside the front wall.
  const left=Math.round(p.x-160*scale),top=Math.round(p.y-207*scale),crop=layerBounds.get(sprite);
  if(crop===null)return;
  if(crop){
    const sx=320*scale/sprite.naturalWidth,sy=320*scale/sprite.naturalHeight;
    ctx.drawImage(sprite,crop.left,crop.top,crop.width,crop.height,
      left+crop.left*sx,top+crop.top*sy,crop.width*sx,crop.height*sy);
  }else ctx.drawImage(sprite,left,top,320*scale,320*scale);
}
function drawCottageExteriorSprite(ctx,building,project,scale,{windowsLit=false}={}){
  const layers=cottageLayers(building);if(!layers)return false;
  const sprite=windowsLit&&layers.night?layers.night:layers.day;
  drawCottageLayer(ctx,sprite,building,project,scale);
  return true;
}

const shade=(hex,amount)=>'#'+[1,3,5].map(i=>Math.max(0,Math.min(255,parseInt(hex.slice(i,i+2),16)+amount)).toString(16).padStart(2,'0')).join('');

export function drawWallLabel(ctx, project, {x,y,z,width,text}, scale=1) {
  const left=project(x-width/2,y,z+.31),right=project(x+width/2,y,z+.31),lower=project(x-width/2,y,z-.31);
  ctx.save();
  ctx.transform((right.x-left.x)/96,(right.y-left.y)/96,(lower.x-left.x)/16,(lower.y-left.y)/16,Math.round(left.x),Math.round(left.y));
  ctx.fillStyle='#322c27';ctx.fillRect(0,0,96,16);
  ctx.fillStyle='#cbb17a';ctx.fillRect(2,2,92,12);
  ctx.fillStyle='#46372c';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,48,8,88);ctx.restore();
}

function architectureStyle(building){
  return building.architectureStyle||(building.kind==='hotel'?'fieldstone':'timber-daub');
}
function roofMaterial(building){return building.roofMaterial||(building.kind==='cabin'?'thatch':'shingles');}
function uvPalette(base){return [-16,-6,4,12].map(offset=>shade(base,offset));}
function drawFramedWall(ctx,polygon,project,wall,scale){
  const length=Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1),height=wall.top-wall.bottom;
  const point=(u,v)=>project(wall.x1+(wall.x2-wall.x1)*u,wall.y1+(wall.y2-wall.y1)*u,wall.bottom+height*v);
  const beam=(u1,v1,u2,v2,width=.13)=>{
    const dx=(u2-u1)*length,dz=(v2-v1)*height,n=Math.hypot(dx,dz)||1;
    const du=(-dz/n*width/2)/length,dv=(dx/n*width/2)/height;
    const uv=[[u1+du,v1+dv],[u2+du,v2+dv],[u2-du,v2-dv],[u1-du,v1-dv]];
    const corners=uv.map(([u,v])=>{const p=point(u,v);return [p.x,p.y];});
    if(!drawArchitectureUvFace(ctx,polygon,corners,'timber',uvPalette('#49372a'),Math.max(1,Math.round(n/1.6)),1))
      polygon(corners,'#49372a');
  };
  // Keep the lower frame above the stone plinth instead of drawing timber
  // across the masonry course.
  for(const u of [.035,.5,.965])beam(u,.105,u,.965,.14);
  for(const v of [.115,.52,.965])beam(.035,v,.965,v,.13);
  beam(.055,.11,.48,.48,.105);beam(.52,.48,.945,.11,.105);
  beam(.055,.89,.48,.56,.095);beam(.52,.56,.945,.89,.095);
}

function drawGableFrame(gable,project,polygon,scale){
  const peak=gable[1],left=gable[0],right=gable[2];
  const beam=(a,b,width=.12)=>{
    const pa=project(...a),pb=project(...b),dx=pb.x-pa.x,dy=pb.y-pa.y,length=Math.hypot(dx,dy)||1;
    const nx=-dy/length*width*16*scale/2,ny=dx/length*width*16*scale/2;
    polygon([[pa.x+nx,pa.y+ny],[pb.x+nx,pb.y+ny],[pb.x-nx,pb.y-ny],[pa.x-nx,pa.y-ny]],'#49372a');
  };
  beam(left,peak,.15);beam(peak,right,.15);beam(left,right,.13);
  const mid=[(left[0]+right[0])/2,left[1],left[2]+(peak[2]-left[2])*.56];
  beam(mid,peak,.11);
  // A lighter inner edge and short rafter tails break the plain triangle into
  // readable carpentry at game scale without changing the building footprint.
  const inset=(from,to,t)=>from.map((value,index)=>value+(to[index]-value)*t);
  beam(inset(left,peak,.12),inset(left,peak,.86),.055);
  beam(inset(peak,right,.12),inset(peak,right,.86),.055);
  for(const corner of [left,right]){
    const cap=project(...corner),tip=project(corner[0],corner[1],corner[2]+.2);
    const half=Math.max(1,Math.round(.055*16*scale));
    polygon([[cap.x-half,cap.y],[tip.x,tip.y-half],[cap.x+half,cap.y]],'#bc9665');
  }
}

function drawThatchedEave(edge,project,polygon,scale){
  const [a,b]=edge,pa=project(...a),pb=project(...b),dx=pb.x-pa.x,dy=pb.y-pa.y,length=Math.hypot(dx,dy)||1;
  const nx=-dy/length,ny=dx/length,half=Math.max(1,Math.round(.11*16*scale));
  polygon([[pa.x+nx*half,pa.y+ny*half],[pb.x+nx*half,pb.y+ny*half],
    [pb.x-nx*half,pb.y-ny*half],[pa.x-nx*half,pa.y-ny*half]],'#92733e');
  polygon([[pa.x+nx,pa.y+ny],[pb.x+nx,pb.y+ny],[pb.x-nx, pb.y-ny],[pa.x-nx,pa.y-ny]],'#c4a65d');
}

function drawJetty(building,project,face,ctx,polygon){
  const depth=building.jettyDepth||0;
  if(!depth||building.storeys<2)return;
  const b=building.bounds,floor=S.storeyHeight,h=building.height;
  const front={x1:b.left,y1:b.bottom+depth,x2:b.right,y2:b.bottom+depth,bottom:floor,top:h};
  const side={x1:b.right+depth,y1:b.top,x2:b.right+depth,y2:b.bottom+depth,bottom:floor,top:h};
  const material=architectureStyle(building)==='fieldstone'?'masonry':'daub';
  for(const wall of [front,side]){
    const p=facadePanel(project,wall,0,0,1,1);
    if(!drawArchitectureUvFace(ctx,polygon,p,material,[-12,-3,5,13].map(offset=>shade(building.walls[0],offset)),5,8))
      drawMaterial(polygon,p,5,8,[-4,2,5,-2].map(offset=>shade(building.walls[0],offset)),'#332c2935',true);
  }
  face([[b.left,b.bottom+depth,floor-.22],[b.right,b.bottom+depth,floor-.22],
    [b.right,b.bottom+depth,floor+.02],[b.left,b.bottom+depth,floor+.02]],'#493a2d');
  face([[b.right+depth,b.top,floor-.22],[b.right+depth,b.bottom+depth,floor-.22],
    [b.right+depth,b.bottom+depth,floor+.02],[b.right+depth,b.top,floor+.02]],'#584536');
  for(let x=b.left+.7;x<b.right-.4;x+=1.65){
    // Paired faces read as timber knee-brackets carrying the jettied sill.
    // Their world-space extent remains inside the existing exterior footprint.
    face([[x-.28,b.bottom,floor-.68],[x+.28,b.bottom,floor-.68],
      [x+.28,b.bottom+depth,floor-.18],[x-.28,b.bottom+depth,floor-.18]],'#493a2d');
    face([[x-.28,b.bottom+depth,floor-.18],[x+.28,b.bottom+depth,floor-.18],
      [x+.28,b.bottom+depth,floor-.7],[x-.28,b.bottom+depth,floor-.7]],'#70543b');
  }
}

function drawDormer(ctx,building,dormer,project,polygon,scale){
  const {x,y,width,depth,height,rise}=dormer,b=building.bounds;
  const left=x-width/2,right=x+width/2,back=y-depth/2,front=y+depth/2;
  const span=(b.right-b.left)+2*(building.roofEave??S.eave);
  const base=building.height+building.roofRise*(1-Math.min(1,Math.abs(x-(b.left+b.right)/2)/(span/2)))+.07;
  const top=base+height;
  const point=(px,py,pz)=>{const p=project(px,py,pz);return [Math.round(p.x),Math.round(p.y)];};
  const face=(points,color)=>polygon(points.map(([px,py,pz])=>point(px,py,pz)),color);
  const frontWall={x1:left,y1:front,x2:right,y2:front,bottom:base,top};
  const frontFace=facadePanel(project,frontWall,0,0,1,1);
  if(!drawArchitectureUvFace(ctx,polygon,frontFace,architectureStyle(building)==='fieldstone'?'masonry':'daub',
    [-14,-4,5,12].map(offset=>shade(building.walls[0],offset)),2,2))polygon(frontFace,building.walls[0]);
  const rightFace=[[right,back,base],[right,front,base],[right,front,top],[right,back,top]];
  face(rightFace,building.side?.[0]||building.walls[1]);
  face([[left,front,top],[right,front,top],[right,front,base+height*.78],[left,front,base+height*.78]],'#574331');
  const windowWidth=Math.min(.56,width*.55),windowBottom=base+.12,windowTop=base+height*.76;
  drawFacadeWindow(polygon,project,{x1:x-windowWidth/2,y1:front+.012,x2:x+windowWidth/2,y2:front+.012,
    bottom:windowBottom,top:windowTop},{lit:false});
  const roof=roofGeometry({bounds:{left,right,top:back,bottom:front},height:top,roofRise:rise,
    roofAxis:'y',roofEave:.12,roofForm:'gable'});
  for(const gable of roof.gables)face(gable,building.walls[1]);
  for(const [index,plane] of roof.planes.entries()){
    const corners=plane.map(([px,py,pz])=>point(px,py,pz));
    if(!drawArchitectureUvFace(ctx,polygon,corners,roofMaterial(building),
      [-18,-7,0,8].map(offset=>shade(building.roof[1],offset+(index?-10:0))),1,1))
      polygon(corners,building.roof[1]);
  }
  for(const [a,c] of roof.fascia)face([a,c,[c[0],c[1],c[2]-S.roofThickness],[a[0],a[1],a[2]-S.roofThickness]],'#594637');
  for(const gable of roof.gables)if(architectureStyle(building)==='timber-daub')drawGableFrame(gable,project,polygon,scale);
}

function drawFrontWing(ctx,building,wing,project,polygon,scale){
  if(!wing)return;
  const b=wing,style=architectureStyle(building),material=style==='fieldstone'?'masonry':'daub';
  const vertex=([x,y,z])=>{const p=project(x,y,z);return [Math.round(p.x),Math.round(p.y)];};
  const face=(points,color)=>polygon(points.map(vertex),color);
  const front={x1:b.left,y1:b.bottom,x2:b.right,y2:b.bottom,bottom:0,top:b.wallHeight};
  const side={x1:b.right,y1:b.top,x2:b.right,y2:b.bottom,bottom:0,top:b.wallHeight};
  for(const [wall,palette]of [[front,building.walls],[side,building.side]]){
    const width=Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1);
    const panel=facadePanel(project,wall,0,0,1,1);
    if(!drawArchitectureUvFace(ctx,polygon,panel,material,
      [-12,-3,5,13].map(offset=>shade(palette[0],offset)),Math.max(2,Math.round(width*1.5)),8))
      drawMaterial(polygon,panel,Math.max(2,Math.round(width*1.5)),8,
        [-4,2,5,-2].map(offset=>shade(palette[0],offset)),'#332c2935',true);
    const foundation=facadePanel(project,wall,0,0,1,S.foundationHeight/b.wallHeight);
    if(!drawArchitectureUvFace(ctx,polygon,foundation,'foundation',
      [-18,-5,0,9].map(offset=>shade(building.foundation,offset)),Math.max(2,Math.round(width)),2))
      polygon(foundation,building.foundation);
    if(style==='timber-daub')drawFramedWall(ctx,polygon,project,wall,scale);
  }
  const roof=roofGeometry({bounds:b,height:b.wallHeight,roofRise:b.roofRise,
    roofEave:b.roofEave,roofAxis:'y',roofForm:'gable'});
  for(const gable of roof.gables){face(gable,building.walls[1]);drawGableFrame(gable,project,polygon,scale);}
  for(const [index,plane]of roof.planes.entries()){
    const corners=plane.map(vertex),palette=[-18,-7,0,8].map(offset=>shade(building.roof[1],offset+(index?-11:0)));
    if(!drawArchitectureUvFace(ctx,polygon,corners,roofMaterial(building),palette,3,2))polygon(corners,building.roof[1]);
  }
  for(const [a,c]of roof.fascia)face([a,c,[c[0],c[1],c[2]-S.roofThickness],[a[0],a[1],a[2]-S.roofThickness]],'#594637');
  const [ridgeA,ridgeB]=roof.ridge;
  face([ridgeA,ridgeB,[ridgeB[0]+.04,ridgeB[1]+.04,ridgeB[2]-.08],
    [ridgeA[0]+.04,ridgeA[1]+.04,ridgeA[2]-.08]],building.roof[2]);
}

function drawWindowPlanter(building,win,project,face){
  if(win.ny!==1||win.bottom>=S.storeyHeight)return;
  const width=Math.min(win.width*.88,1.25),x=win.x,y=win.y+.06,z=win.bottom-.43;
  const back=y-.06,front=y+.22,left=x-width/2,right=x+width/2;
  const trim=building.kind==='hotel'?'#77766a':'#735034';
  face([[left,back,z],[right,back,z],[right,front,z],[left,front,z]],'#392c25');
  face([[left,front,z],[right,front,z],[right,front,z+.25],[left,front,z+.25]],trim);
  face([[right,back,z],[right,front,z],[right,front,z+.25],[right,back,z+.25]],'#49372a');
  face([[left,back,z+.25],[right,back,z+.25],[right,front,z+.25],[left,front,z+.25]],'#44342a');
  const colors=building.flowerColors||['#c85d48','#e7bb58','#e5d9b7'];
  const count=4;
  for(let i=0;i<count;i++){
    const fx=left+.16+(width-.32)*i/(count-1),fy=y+.05;
    const stem=z+.44+(i%2)*.025;
    face([[fx-.025,fy, z+.22],[fx+.025,fy,z+.22],[fx+.012,fy,stem],[fx-.012,fy,stem]],'#49633b');
    for(let leaf=0;leaf<2;leaf++){
      const sign=leaf?1:-1;
      face([[fx,fy,stem-.12],[fx+sign*.12,fy+.025,stem-.06],
        [fx+sign*.1,fy+.025,stem],[fx,fy,stem-.025]],leaf?'#66804a':'#536c3e');
    }
    const color=colors[i%colors.length],petal=.09;
    face([[fx-petal,fy,stem],[fx,fy,stem+petal],[fx+petal,fy,stem],
      [fx,fy,stem-petal]],color);
    face([[fx-.055,fy-.025,stem],[fx,fy-.025,stem+.055],[fx+.055,fy-.025,stem],
      [fx,fy-.025,stem-.055]],colors[(i+1)%colors.length]);
    face([[fx-.018,fy-.04,stem-.01],[fx+.018,fy-.04,stem-.01],
      [fx+.018,fy-.04,stem+.018],[fx-.018,fy-.04,stem+.018]],'#e8cf83');
  }
}

export function drawBuildingExterior(ctx, building, project, polygon, scale=1, { windowsLit = false } = {}) {
  if(drawCottageExteriorSprite(ctx,building,project,scale,{windowsLit}))return;
  const b=building.bounds,h=building.height,w=b.right-b.left,d=b.bottom-b.top;
  const style=architectureStyle(building),roofKind=roofMaterial(building);
  const doorHeight=building.doorHeight||S.doorHeight,doorWidth=building.door.width||S.doorWidth;
  const vertex=([x,y,z])=>{const p=project(x,y,z);return [Math.round(p.x),Math.round(p.y)];};
  const face=(points,color)=>polygon(points.map(vertex),color);
  const front={x1:b.left,y1:b.bottom,x2:b.right,y2:b.bottom,bottom:0,top:h};
  const side={x1:b.right,y1:b.top,x2:b.right,y2:b.bottom,bottom:0,top:h};
  for(const [wall,palette] of [[front,building.walls],[side,building.side]]){
    if(building.hiddenFaces?.includes(wall===front?'front':'side'))continue;
    const corners=facadePanel(project,wall,0,0,1,1);
    const wallColumns=Math.max(2,Math.round((wall===front?w:d)/2)),wallRows=Math.ceil(h/.32);
    const wallPalette=[-7,-2,3,7].map(offset=>shade(palette[0],offset));
    const wallMaterial=style==='fieldstone'?'masonry':style==='timber-daub'?'daub':'timber';
    if(!drawArchitectureUvFace(ctx,polygon,corners,wallMaterial,style==='timber-daub'?[
      shade(palette[0],-16),shade(palette[0],-5),palette[0],shade(palette[0],12)]:wallPalette,wallColumns,wallRows))
      drawMaterial(polygon,corners,wallColumns,wallRows,[-4,2,5,-2].map(offset=>shade(palette[0],offset)),'#332c2935',true);
    const foundationFace=facadePanel(project,wall,0,0,1,S.foundationHeight/h);
    if(!drawArchitectureUvFace(ctx,polygon,foundationFace,'foundation',[
      shade(building.foundation,-18),shade(building.foundation,-5),building.foundation,shade(building.foundation,9)],
      Math.max(1,Math.round((wall===front?w:d)/1.2)),Math.max(1,Math.round(S.foundationHeight/.32))))
      polygon(foundationFace,building.foundation);
    for(const u of [0,1])polygon(facadePanel(project,wall,Math.max(0,u-.016),.04,Math.min(1,u+.016),1),'#624c38');
    polygon(facadePanel(project,wall,0,1-.14/h,1,1),building.walls[1]);
    if(building.storeys>1){
      const v=S.storeyHeight/h;
      polygon(facadePanel(project,wall,0,v-.09/h,1,v+.09/h),building.foundation);
    }
  }
  drawJetty(building,project,face,ctx,polygon);
  if(style==='timber-daub'){
    for(const wall of [front,side])if(!building.hiddenFaces?.includes(wall===front?'front':'side'))
      drawFramedWall(ctx,polygon,project,wall,scale);
  }
  if(building.roofVisible!==false){
  const roof=roofGeometry(building);
  for(const gable of roof.gables){
    face(gable,building.walls[1]);
    if(style==='timber-daub')drawGableFrame(gable,project,polygon,scale);
    const peak=gable[1],base=(gable[0][2]+gable[2][2])/2;
    const dx=building.roofAxis==='x'?0:.045,dy=building.roofAxis==='x'?.045:0;
    face([[peak[0]-dx,peak[1]-dy,base],[peak[0]+dx,peak[1]+dy,base],
      [peak[0]+dx,peak[1]+dy,peak[2]],[peak[0]-dx,peak[1]-dy,peak[2]]],'#70543b');
  }
  // Small courses follow roof planes; both sides share material, with a shaded face.
  roof.planes.forEach((plane,index)=>{
    const roofFace=plane.map(vertex),roofColumns=Math.ceil((building.roofAxis==='x'?w:d)*1.7),
      roofRows=Math.ceil((building.roofAxis==='x'?d:w)*1.2),roofPalette=[-17,-7,0,6].map(offset=>shade(building.roof[1],offset+(index?-12:0)));
    if(roofFace.length!==4)polygon(roofFace,building.roof[1]);
    else if(!drawArchitectureUvFace(ctx,polygon,roofFace,roofKind,roofPalette,roofColumns,roofRows))
      drawMaterial(polygon,roofFace,roofColumns,roofRows,[-7,0,6,3].map(offset=>shade(building.roof[1],offset+(index?-17:0))),'#292a303d',true);
  });
  for(const [a,c] of roof.fascia){
    if(roofKind==='thatch')drawThatchedEave([a,c],project,polygon,scale);
    else face([a,c,[c[0],c[1],c[2]-S.roofThickness],[a[0],a[1],a[2]-S.roofThickness]],'#594637');
  }
  const [r1,r2]=roof.ridge;
  face([r1,r2,[r2[0]+.04,r2[1]+.04,r2[2]-.08],[r1[0]+.04,r1[1]+.04,r1[2]-.08]],building.roof[2]);

  }
  const facadeArchitecture=buildingArchitecture(building);
  drawFrontWing(ctx,building,facadeArchitecture.frontWing,project,polygon,scale);
  for(const dormer of facadeArchitecture.dormers||[])
    drawDormer(ctx,building,dormer,project,polygon,scale);
  const doorX=building.door.x,doorWall={x1:doorX-doorWidth/2,y1:b.bottom,x2:doorX+doorWidth/2,y2:b.bottom,bottom:0,top:doorHeight};
  const panel=(u1,v1,u2,v2,color)=>polygon(facadePanel(project,doorWall,u1,v1,u2,v2),color);
  if(building.door.enabled!==false){
  panel(-.08,0,1.08,1.035,'#302926');panel(0,.025,1,1,'#735034');
  for(let slat=0;slat<5;slat++)panel(slat/5+.018,.035,(slat+1)/5-.018,.97,slat%2?'#8d6542':'#9c744b');
  panel(-.06,0,.035,1.025,'#c19a65');panel(.965,0,1.06,1.025,'#5b4433');
  panel(-.08,.995,1.08,1.04,'#bd9662');
  for(const v of [.23,.76])panel(.02,v,.28,v+.035,'#39332f');
  panel(.79,.46,.88,.51,'#e3c483');
  }
  for(const win of buildingWindows(building))drawFacadeWindow(polygon,project,
    {x1:win.x-(win.ny?win.width/2:0),y1:win.y-(win.nx?win.width/2:0),
      x2:win.x+(win.ny?win.width/2:0),y2:win.y+(win.nx?win.width/2:0),bottom:win.bottom,top:win.top},
    { lit: windowsLit && win.enabled !== false && win.light?.enabled !== false });
  for(const win of buildingWindows(building))drawWindowPlanter(building,win,project,face);
  drawWallLabel(ctx,project,{x:building.kind==='hotel'?doorX-2.4:doorX,y:b.bottom+.015,z:building.kind==='hotel'?3.65:doorHeight+.38,
    width:Math.min(w*.5,Math.max(1.8,building.sign.length*.24)),text:building.sign},scale);
  // A flush sill connects the door to the path without drawing fake steps.
  face([[doorX-.72,b.bottom,.035],[doorX+.72,b.bottom,.035],
    [doorX+.72,b.bottom+.75,.035],[doorX-.72,b.bottom+.75,.035]],'#aa956c');
  const architecture=buildingArchitecture(building);
  const prism=(r,z0,z1,top,front,side)=>{
    face([[r.left,r.bottom,z0],[r.right,r.bottom,z0],[r.right,r.bottom,z1],[r.left,r.bottom,z1]],front);
    face([[r.right,r.top,z0],[r.right,r.bottom,z0],[r.right,r.bottom,z1],[r.right,r.top,z1]],side);
    face([[r.left,r.top,z1],[r.right,r.top,z1],[r.right,r.bottom,z1],[r.left,r.bottom,z1]],top);
  };
  const stone=building.kind==='hotel',trim=stone?'#c0b899':'#bc9665',dark=stone?'#686f70':'#574331';
  if(architecture.balcony){
    const r=architecture.balcony;
    prism(r,r.z-.18,r.z,trim,dark,building.foundation);
    // Shallow facade balcony with balusters and brackets, no walkable upper floor.
    for(let x=r.left;x<=r.right+.01;x+=.3)prism({left:x-.035,right:x+.035,top:r.bottom-.08,bottom:r.bottom},r.z,r.z+1,trim,trim,dark);
    prism({left:r.left-.06,right:r.right+.06,top:r.bottom-.12,bottom:r.bottom+.03},r.z+.95,r.z+1.1,trim,trim,dark);
    for(const x of [r.left+.2,r.right-.2])face([[x-.07,r.top,r.z-.85],[x+.07,r.top,r.z-.85],[x+.07,r.bottom,r.z-.18],[x-.07,r.bottom,r.z-.18]],dark);
  }
  // Wall-mounted porch lantern; the light definition uses this exact pivot.
  const lx=doorX+.84,ly=b.bottom+.06;
  prism({left:lx-.14,right:lx+.14,top:ly-.12,bottom:ly+.12},2.95,3.5,trim,'#f5d79a','#d6a766');
  prism({left:lx-.2,right:lx+.2,top:ly-.17,bottom:ly+.17},3.5,3.62,trim,dark,dark);
  if(building.chimney){
    const x=b.left+1.1,y=b.top+1.5;
    const roofSpan=(building.roofAxis==='x'?b.bottom-b.top:w)+2*(building.roofEave??S.eave);
    const roofCoordinate=building.roofAxis==='x'?y-(b.top+b.bottom)/2:x-(b.left+b.right)/2;
    const roofBase=h+building.roofRise*(1-Math.min(1,Math.abs(roofCoordinate)/(roofSpan/2)));
    const z=roofBase-.12;
    const width=.48,depth=.48,shaftBase=z+.22,shoulder=z+.42,top=z+1.48;
    const prism=(left,back,right,front,bottom,upper,frontColor,sideColor)=>{
      face([[left,front,bottom],[right,front,bottom],[right,front,upper],[left,front,upper]],frontColor);
      face([[right,back,bottom],[right,front,bottom],[right,front,upper],[right,back,upper]],sideColor);
    };
    // Flared stone shoulder, tapered-looking shaft, raised crown and twin flues.
    prism(x-.08,y-.08,x+width+.08,y+depth+.08,z,shoulder,'#767568','#565a54');
    prism(x,y,x+width,y+depth,shaftBase,top-.08,'#898779','#62675e');
    for(let course=0;course<4;course++){
      const band=shaftBase+.2+course*.31;
      face([[x,y+depth+.006,band],[x+width,y+depth+.006,band],
        [x+width,y+depth+.006,band+.035],[x,y+depth+.006,band+.035]],course%2?'#675f53':'#a2977d');
      face([[x+width+.006,y,band],[x+width+.006,y+depth,band],
        [x+width+.006,y+depth,band+.035],[x+width+.006,y,band+.035]],'#504e49');
    }
    face([[x-.08,y-.08,top-.08],[x+width+.08,y-.08,top-.08],
      [x+width+.08,y+depth+.08,top-.08],[x-.08,y+depth+.08,top-.08]],'#4c4943');
    face([[x-.12,y-.12,top],[x+width+.12,y-.12,top],
      [x+width+.12,y+depth+.12,top],[x-.12,y+depth+.12,top]],'#b4ad91');
    for(const offset of [.08,.3]){
      face([[x+offset,y+.08,top],[x+offset+.12,y+.08,top],
        [x+offset+.12,y+.08,top+.28],[x+offset,y+.08,top+.28]],'#a5533b');
      face([[x+offset+.12,y+.08,top],[x+offset+.18,y+.14,top],
        [x+offset+.18,y+.14,top+.28],[x+offset+.12,y+.08,top+.28]],'#754237');
      face([[x+offset-.025,y+.05,top+.25],[x+offset+.145,y+.05,top+.25],
        [x+offset+.145,y+.17,top+.25],[x+offset-.025,y+.17,top+.25]],'#433d38');
    }
  }
}

// Keep the porch cover in front of the separate columns so its edge closes
// their top seam instead of allowing each cap to cut through the fascia.
export function drawBuildingCanopy(ctx, building, project, polygon, scale=1) {
  const layers=cottageLayers(building);
  if(layers){
    drawCottageLayer(ctx,layers.canopy,building,project,scale);
    drawWallLabel(ctx,project,{x:building.door.x,y:building.bounds.bottom+.985,z:4.10,width:1.25,text:building.sign||'CABANA'},scale);
    return;
  }
  const canopy=buildingArchitecture(building).canopy;
  if(!canopy)return;
  const vertex=([x,y,z])=>{const p=project(x,y,z);return [Math.round(p.x),Math.round(p.y)];};
  const face=(points,color)=>polygon(points.map(vertex),color);
  const roof=roofGeometry({bounds:canopy,height:canopy.z,roofRise:.62,roofEave:.12,roofAxis:'y',roofForm:'gable'});
  for(const gable of roof.gables){
    face(gable,building.walls[1]);
    drawGableFrame(gable,project,polygon,scale);
  }
  for(const [index,plane] of roof.planes.entries()){
    const corners=plane.map(vertex);
    if(!drawArchitectureUvFace(ctx,polygon,corners,roofMaterial(building),
      [-18,-7,0,8].map(offset=>shade(building.roof[1],offset+(index?-10:0))),1,1))polygon(corners,building.roof[1]);
  }
  for(const [a,b] of roof.fascia)face([a,b,[b[0],b[1],b[2]-.14],[a[0],a[1],a[2]-.14]],'#594637');
  const [a,b]=roof.ridge;
  face([a,b,[b[0]+.035,b[1]+.035,b[2]-.06],[a[0]+.035,a[1]+.035,a[2]-.06]],building.roof[2]);
}

// A porch column has its own ground depth so an actor can pass behind it.
export function drawBuildingPost(ctx, building, post, project, polygon) {
  const layers=cottageLayers(building);
  if(layers){
    const sprite=(post.left+post.right)/2<building.door.x?layers.postLeft:layers.postRight;
    const p=project(building.door.x,building.door.y,0),q=project(building.door.x+1,building.door.y,0);
    drawCottageLayer(ctx,sprite,building,project,Math.abs(q.x-p.x)/16);
    return;
  }
  const vertex=([x,y,z])=>{const p=project(x,y,z);return [Math.round(p.x),Math.round(p.y)];};
  const face=(points,color)=>polygon(points.map(vertex),color);
  const prism=(r,z0,z1,top,front,side)=>{
    face([[r.left,r.bottom,z0],[r.right,r.bottom,z0],[r.right,r.bottom,z1],[r.left,r.bottom,z1]],front);
    face([[r.right,r.top,z0],[r.right,r.bottom,z0],[r.right,r.bottom,z1],[r.right,r.top,z1]],side);
    face([[r.left,r.top,z1],[r.right,r.top,z1],[r.right,r.bottom,z1],[r.left,r.bottom,z1]],top);
  };
  const architecture=buildingArchitecture(building),canopy=architecture.canopy;
  const stone=building.kind==='hotel',trim=stone?'#c0b899':'#bc9665',dark=stone?'#686f70':'#574331';
  // Foot, shaft, neck moulding and cap all fit the existing post footprint.
  prism(post,0,.22,trim,dark,building.foundation);
  prism({...post,left:post.left+.05,right:post.right-.05,top:post.top+.05,bottom:post.bottom-.05},
    .22,post.height-.22,trim,stone?'#96947f':'#88643e',dark);
  prism({...post,left:post.left+.015,right:post.right-.015},post.height-.31,post.height-.2,
    stone?'#d0c9ad':'#d0aa72',trim,dark);
  prism(post,post.height-.2,post.height,trim,trim,dark);
  if(canopy){
    const mid=(post.left+post.right)/2;
    face([[mid-.06,post.bottom,post.height-.8],[mid+.08,post.bottom,post.height-.8],
      [mid+.08,canopy.top,post.height-.08],[mid-.06,canopy.top,post.height-.08]],dark);
  }
}
