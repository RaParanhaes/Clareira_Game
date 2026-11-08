export const WORLD_MAP_FILTERS = Object.freeze(['trails','water','fires','places','resources','trees','grid']);
// Keep enough headroom to inspect individual tiles and map features on mobile.
export const WORLD_MAP_MAX_ZOOM = 256;
// A wide phone viewport must not lose detail just because one side exceeds 320.
// Bound the total survey work instead of silently dropping the entire layer.
export function worldMapDetailBounds(transform,{width,height,worldSize}){
 if(transform.scale<.7)return null;
 const a=screenToWorldMap({x:12,y:12},transform),b=screenToWorldMap({x:width-12,y:height-12},transform);
 const align=32,margin=8;
 const bounds={left:Math.max(0,Math.floor((a.x-margin)/align)*align),top:Math.max(0,Math.floor((a.y-margin)/align)*align),right:Math.min(worldSize,Math.ceil((b.x+margin)/align)*align),bottom:Math.min(worldSize,Math.ceil((b.y+margin)/align)*align)};
 const w=bounds.right-bounds.left,h=bounds.bottom-bounds.top;
 return w>0&&h>0&&w<=768&&h<=768&&w*h<=200000?bounds:null;
}
// Stable tiles let a pan reuse the overlapping parts of the last survey.
export function worldMapDetailTiles(bounds, worldSize, tileSize=64){
 if(!bounds)return [];
 const tiles=[];
 for(let top=Math.floor(bounds.top/tileSize)*tileSize;top<bounds.bottom;top+=tileSize)
  for(let left=Math.floor(bounds.left/tileSize)*tileSize;left<bounds.right;left+=tileSize)
   tiles.push({left,top,right:Math.min(worldSize,left+tileSize),bottom:Math.min(worldSize,top+tileSize)});
 return tiles;
}
const TERRAIN_COLORS = Object.freeze({meadow:['#64744f','#6d7c55','#71805a','#5d704d'],'dense-forest':['#294b3b','#315641','#365d47'],highland:['#777a63','#85836a','#707a69'],mountain:['#535c53','#5d6558'],water:['#3f738a','#477c91','#52869a']});
const BASE_MARKERS = Object.freeze({shelter:{name:'Abrigo',category:'places',symbol:'⌂'},campfire:{name:'Fogueira das Brasas',category:'fires',symbol:'✦'},pond:{name:'Lago',category:'water',symbol:'≈'},highland:{name:'Terreno elevado',category:'places',symbol:'▲'}});
const KIND_LABELS = Object.freeze({village:'Vila',lodging:'Hospedaria',shelter:'Abrigo',campfire:'Fogueira',water:'Água',highland:'Terreno elevado',resource:'Recursos'});
export function mapMarkers(overview) {
 const out=[];
 for(const chunk of overview?.chunks||[]) for(const item of chunk.landmarks||[]) {
  if(item.secret===true)continue;
  const base=BASE_MARKERS[item.id],category=base?.category||(item.kind==='resource'?'resources':item.kind==='campfire'?'fires':item.kind==='water'?'water':'places');
  out.push({id:String(item.id),x:Number(item.x),y:Number(item.y),category,name:item.name||base?.name||KIND_LABELS[item.kind]||'Lugar conhecido',
   symbol:base?.symbol||(category==='resources'?'◆':category==='water'?'≈':category==='fires'?'✦':'⌂'),kind:item.kind||'place'});
 }
 return out.filter(m=>Number.isFinite(m.x)&&Number.isFinite(m.y));
}
export function filterMapMarkers(markers,{filters={},search=''}={}) {
 const q=String(search).trim().toLocaleLowerCase('pt-BR');
 const matches=markers.filter(m=>filters[m.category]!==false&&(!q||(String(m.name||'')+' '+String(m.kind||'')).toLocaleLowerCase('pt-BR').includes(q)));
 if(!q)return matches;
 const rank=marker=>{const name=String(marker.name||'').toLocaleLowerCase('pt-BR'),combined=(name+' '+String(marker.kind||'')).trim();return name===q?0:name.startsWith(q)?1:combined.startsWith(q)?2:3;};
 return matches.map((marker,index)=>({marker,index,rank:rank(marker)})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(entry=>entry.marker);
}
export function visibleWorldMapMarkers(markers,overview,known,{filters={},search="",revealAll=false}={}) {
 return filterMapMarkers(markers,{filters,search}).filter(marker=>revealAll||!(known instanceof Set)||known.has(worldMapCellIndex(marker,overview)));
}
export function worldMapCellIndex(position, grid={}) {
 const worldSize=Math.max(1,Number(grid.worldSize)||1),columns=Math.max(1,Math.floor(grid.columns||48)),rows=Math.max(1,Math.floor(grid.rows||48));
 const cellSize=Number(grid.chunkSize)||Math.ceil(worldSize/columns);
 if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y)||position.x<0||position.y<0||position.x>=worldSize||position.y>=worldSize)return -1;
 const x=Math.min(columns-1,Math.floor(position.x/cellSize)),y=Math.min(rows-1,Math.floor(position.y/cellSize));
 return y*columns+x;
}
export function normalizeWorldMapExploration(cells,{columns=48,rows=48}={}) {
 const total=Math.max(1,Math.floor(columns))*Math.max(1,Math.floor(rows));
 if(!Array.isArray(cells)&&!(cells instanceof Set))return [];
 return [...new Set([...cells].filter(Number.isSafeInteger).filter(cell=>cell>=0&&cell<total))].sort((a,b)=>a-b);
}
export function mergeWorldMapExploration(known,cells,grid={}) {
 if(!(known instanceof Set))return [];
 const added=[];
 for(const cell of normalizeWorldMapExploration(cells,grid))if(!known.has(cell)){known.add(cell);added.push(cell);}
 if(added.length)known.revision=(Number(known.revision)||0)+1;
 return added;
}
export function isWorldMapCellKnown(position,overview,known) {
 if(!(known instanceof Set))return false;
 const cell=worldMapCellIndex(position,overview);
 return cell>=0&&known.has(cell);
}
export function worldMapExplorationLabel(known,overview,{revealAll=false}={}) {
 if(revealAll)return 'Tudo revelado';
 const columns=Math.max(1,Math.floor(overview?.columns||48)),rows=Math.max(1,Math.floor(overview?.rows||48));
 const explored=normalizeWorldMapExploration(known,{columns,rows}).length;
 if(!explored)return '0% explorado';
 const percentage=explored*100/(columns*rows);
 return percentage<1?'<1% explorado':Math.round(percentage)+'% explorado';
}
export function discoverWorldMapCells(position,overview,known=new Set(),radius=1) {
 const center=worldMapCellIndex(position,overview);
 if(center<0)return [];
 const columns=Math.max(1,overview?.columns||48),rows=Math.max(1,overview?.rows||48),cx=center%columns,cy=Math.floor(center/columns),reach=Math.max(0,Math.min(4,Math.floor(radius))),added=[];
 for(let y=Math.max(0,cy-reach);y<=Math.min(rows-1,cy+reach);y++)for(let x=Math.max(0,cx-reach);x<=Math.min(columns-1,cx+reach);x++){const cell=y*columns+x;if(!known.has(cell)){known.add(cell);added.push(cell);}}
 if(added.length)known.revision=(known.revision||0)+1;
 return added;
}
export function worldMapTransform({worldSize,width,height,zoom=1,panX=0,panY=0}) {
 const size=Math.max(1,Number(worldSize)||1),w=Math.max(1,width),h=Math.max(1,height);
 const scale=Math.min(Math.max(1,w-40)/size,Math.max(1,h-40)/size)*Math.max(.65,Math.min(WORLD_MAP_MAX_ZOOM,Number(zoom)||1));
 return {scale,originX:(w-size*scale)/2+panX,originY:(h-size*scale)/2+panY};
}
export function worldMapToScreen(p,t){return{x:t.originX+p.x*t.scale,y:t.originY+p.y*t.scale};}
export function screenToWorldMap(p,t){return{x:(p.x-t.originX)/t.scale,y:(p.y-t.originY)/t.scale};}
export function centerWorldMapOn(view,p,{worldSize,width,height}={}) {
 const t=worldMapTransform({worldSize,width,height,zoom:view.zoom});
 const desiredX=width/2-(t.originX+p.x*t.scale);
 const desiredY=height/2-(t.originY+p.y*t.scale);
 const clampAxis=(desired,origin,extent,viewport)=> {
  if(extent<=viewport-24)return desired;
  return Math.max(viewport-12-origin-extent,Math.min(12-origin,desired));
 };
 return {...view,
  panX:clampAxis(desiredX,t.originX,worldSize*t.scale,width),
  panY:clampAxis(desiredY,t.originY,worldSize*t.scale,height)};
}
export function zoomWorldMapAround(view,anchor,screenPoint,zoom,{worldSize,width,height}={}) {
 const next={...view,zoom:Math.max(.65,Math.min(WORLD_MAP_MAX_ZOOM,Number(zoom)||view.zoom))};
 const projected=worldMapToScreen(anchor,worldMapTransform({worldSize,width,height,...next}));
 next.panX+=screenPoint.x-projected.x;next.panY+=screenPoint.y-projected.y;
 return next;
}
function markerGlyph(ctx,m,p,{selected=false,waypoint=false,scale=1}={}) {
 const r=Math.max(4,Math.min(8,5+scale));ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));
 ctx.fillStyle=waypoint?'#f0c971':selected?'#fff0b7':m?.category==='fires'?'#ee9b63':m?.category==='water'?'#b8e0e7':m?.category==='resources'?'#d6bf78':'#c4d3aa';ctx.strokeStyle='#17232b';ctx.lineWidth=2;ctx.beginPath();
 if(waypoint||m?.category==='water'){ctx.moveTo(0,-r);ctx.lineTo(r,0);ctx.lineTo(0,r);ctx.lineTo(-r,0);ctx.closePath();}
 else if(m?.category==='places')ctx.rect(-r*.7,-r*.7,r*1.4,r*1.4);else ctx.arc(0,0,r,0,Math.PI*2);
 ctx.fill();ctx.stroke();
 if(selected&&m?.name&&scale>.12){ctx.font='bold 11px system-ui,sans-serif';const label=m.name,w=ctx.measureText(label).width;ctx.fillStyle='#102027ed';ctx.fillRect(8,-17,w+12,21);ctx.strokeStyle='#d5bb80';ctx.lineWidth=1;ctx.strokeRect(8,-17,w+12,21);ctx.fillStyle='#f3e5c6';ctx.textBaseline='middle';ctx.fillText(label,14,-6);}
 ctx.restore();
}
const TERRAIN_RASTER_SCALE = 8;
const terrainRasterCache = new WeakMap();
const localDetailTerrainCache = new WeakMap();
const explorationFogCache = new WeakMap();

function terrainRasterFor(overview, hideWater, documentRef) {
 if(!overview||typeof overview!=="object"||typeof documentRef?.createElement!=="function")return null;
 let variants=terrainRasterCache.get(overview);
 if(!variants){variants=new Map();terrainRasterCache.set(overview,variants);}
 const key=hideWater?"water-muted":"water-visible";
 if(variants.has(key))return variants.get(key);
 const columns=Math.max(1,overview.columns||1),rows=Math.max(1,overview.rows||1);
 const canvas=documentRef.createElement("canvas");
 canvas.width=columns*TERRAIN_RASTER_SCALE;canvas.height=rows*TERRAIN_RASTER_SCALE;
 const raster=canvas.getContext("2d");if(!raster)return null;
 raster.imageSmoothingEnabled=false;raster.clearRect(0,0,canvas.width,canvas.height);
 const trails=[];
 for(const chunk of overview.chunks||[]){
  const x=Math.round(chunk.x*TERRAIN_RASTER_SCALE),y=Math.round(chunk.y*TERRAIN_RASTER_SCALE);
  const palette=TERRAIN_COLORS[chunk.terrain]||TERRAIN_COLORS.meadow;
  const variant=(Math.floor(chunk.x/2)*17+Math.floor(chunk.y/2)*31)%palette.length;
  raster.fillStyle=chunk.terrain==="water"&&hideWater?"#6d7956":palette[variant];
  raster.fillRect(x,y,TERRAIN_RASTER_SCALE,TERRAIN_RASTER_SCALE);
  if(chunk.trail)trails.push(chunk);
 }
 if(variants.size>=2)variants.clear();
 const cached={canvas,trails};variants.set(key,cached);return cached;
}

function localDetailTerrainRasterFor(features, documentRef, hideWater=false) {
 if(!features?.terrain?.length||typeof documentRef?.createElement!=="function")return null;
 let variants=localDetailTerrainCache.get(features);if(!variants){variants=new Map();localDetailTerrainCache.set(features,variants);}
 const key=hideWater?"water-muted":"water-visible";if(variants.has(key))return variants.get(key);
 const width=features.terrain[0]?.length||0,height=features.terrain.length;if(!width||!height)return null;
 const canvas=documentRef.createElement("canvas");canvas.width=width;canvas.height=height;
 const context=canvas.getContext("2d");if(!context)return null;
 const palettes={forest:["#71835a","#304e3b","#346c83","#92917a","#8a9c7b"],dark:["#353c42","#243d39","#304d66","#777686","#61747b"],sky:["#849b80","#476756","#68a5b4","#b1b6a8","#b2c8b9"],magic:["#647c76","#354d60","#526caa","#9791ae","#88b5b6"],inferno:["#70564a","#463b36","#9b593e","#8d8176","#aa7b56"],giants:["#7b8255","#3a5140","#416e80","#918572","#a4a47e"],energy:["#526d75","#334f59","#428eaa","#8f98a7","#83b7b5"]};
 const colors=palettes[features.theme]||["#64744f","#294b3b","#3f738a","#92917a","#8a9c7b"];
 for(let y=0;y<height;y++){
  const row=features.terrain[y];let start=0;
  while(start<width){const kind=row[start];let end=start+1;while(end<width&&row[end]===kind)end++;context.fillStyle=kind===2&&hideWater?"#6d7956":colors[kind]||colors[0];context.fillRect(start,y,end-start,1);start=end;}
 }
 if(features.theme){
  // Sparse cartographic grain remains fixed in world coordinates when panning.
  context.fillStyle="#e4dfb414";
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const wx=x+features.bounds.left,wy=y+features.bounds.top;
   if((Math.imul(wx,73856093)^Math.imul(wy,19349663))%19===0)context.fillRect(x,y,1,1);
  }
 }
 variants.set(key,canvas);return canvas;
}

function explorationFogFor(overview,known,documentRef){
 if(!overview||typeof documentRef?.createElement!=="function")return null;
 const revision=Number(known.revision)||known.size||0,cached=explorationFogCache.get(known);
 if(cached?.revision===revision)return cached;
 const columns=Math.max(1,overview.columns||1),rows=Math.max(1,overview.rows||1),scale=TERRAIN_RASTER_SCALE,canvas=documentRef.createElement("canvas");
 canvas.width=columns*scale;canvas.height=rows*scale;
 const context=canvas.getContext("2d");if(!context)return null;
 context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle="#030609f2";
 for(const chunk of overview.chunks||[])if(!known.has(chunk.y*columns+chunk.x))context.fillRect(chunk.x*scale,chunk.y*scale,scale,scale);
 const result={revision,canvas};explorationFogCache.set(known,result);return result;
}

// Build only deterministic terrain rasters here. Discovery fog and live markers
// remain attached to each player's current state and are composed at draw time.
export function preloadWorldMapCaches(overview, documentRef=globalThis.document){
 if(!overview)return false;
 const visible=terrainRasterFor(overview,false,documentRef);
 const muted=terrainRasterFor(overview,true,documentRef);
 return Boolean(visible&&muted);
}

function drawMapGrid(ctx,{originX,originY,columns,rows,cell,width,height}){
 const right=originX+columns*cell,bottom=originY+rows*cell;
 const topVisible=Math.max(12,originY),bottomVisible=Math.min(height-12,bottom);
 const leftVisible=Math.max(12,originX),rightVisible=Math.min(width-12,right);
 if(topVisible>=bottomVisible||leftVisible>=rightVisible)return;
 const firstColumn=Math.max(0,Math.ceil((12-originX)/cell));
 const lastColumn=Math.min(columns,Math.floor((width-12-originX)/cell));
 const firstRow=Math.max(0,Math.ceil((12-originY)/cell));
 const lastRow=Math.min(rows,Math.floor((height-12-originY)/cell));
 ctx.beginPath();
 for(let column=firstColumn;column<=lastColumn;column++){
  const x=originX+column*cell;ctx.moveTo(x,topVisible);ctx.lineTo(x,bottomVisible);
 }
 for(let row=firstRow;row<=lastRow;row++){
  const y=originY+row*cell;ctx.moveTo(leftVisible,y);ctx.lineTo(rightVisible,y);
 }
 ctx.strokeStyle="#172d2a22";ctx.lineWidth=1;ctx.stroke();
}

function drawForestDetailGrid(ctx,{transform,bounds}){
 const step=transform.scale>=1.5?10:25,firstX=Math.ceil(bounds.left/step)*step,lastX=bounds.right,firstY=Math.ceil(bounds.top/step)*step,lastY=bounds.bottom;
 const left=transform.originX+bounds.left*transform.scale,right=transform.originX+bounds.right*transform.scale;
 const top=transform.originY+bounds.top*transform.scale,bottom=transform.originY+bounds.bottom*transform.scale;
 ctx.beginPath();
 for(let x=firstX;x<=lastX;x+=step){const sx=transform.originX+x*transform.scale;ctx.moveTo(sx,top);ctx.lineTo(sx,bottom);}
 for(let y=firstY;y<=lastY;y+=step){const sy=transform.originY+y*transform.scale;ctx.moveTo(left,sy);ctx.lineTo(right,sy);}
 ctx.strokeStyle="#e6dfc538";ctx.lineWidth=1;ctx.stroke();
 if(transform.scale>=1){ctx.save();ctx.font="8px system-ui,sans-serif";ctx.fillStyle="#f3e5c6e8";ctx.textAlign="left";ctx.textBaseline="top";
  const labelStep=step*2;for(let x=Math.ceil(firstX/labelStep)*labelStep;x<=lastX;x+=labelStep){const sx=transform.originX+x*transform.scale;ctx.fillText(String(x),Math.max(13,sx+2),Math.max(13,top+2));}
  for(let y=Math.ceil(firstY/labelStep)*labelStep;y<=lastY;y+=labelStep){const sy=transform.originY+y*transform.scale;ctx.fillText(String(y),Math.max(13,left+2),Math.max(13,sy+2));}
  ctx.restore();
 }
}

function drawTreeCanopies(ctx,trees,transform,visible,knownAt){
 const scale=transform.scale;
 const shown=(trees||[]).filter(t=>t.x>=visible.left-2&&t.x<=visible.right+2&&t.y>=visible.top-2&&t.y<=visible.bottom+2&&knownAt(t.x,t.y));
 for(const tree of shown){
  const x=transform.originX+tree.x*scale,y=transform.originY+tree.y*scale;
  const variant=Math.abs(Math.floor(tree.x*17+tree.y*31))%5,r=Math.max(1,(.72+variant*.07)*scale);
  if(scale<2.8){ctx.fillStyle=['#74966a','#83a377','#64865d','#92a879','#6d906c'][variant];ctx.beginPath();ctx.arc(x,y,Math.max(1,.36*scale),0,Math.PI*2);ctx.fill();continue;}
  ctx.fillStyle='#112e2a8c';ctx.beginPath();ctx.arc(x+r*.24,y+r*.3,r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=['#537d50','#63885b','#426c4b','#718c59','#4b7b60'][variant];ctx.beginPath();
  for(let i=0;i<10;i++){const a=i*Math.PI/5,rr=r*(i%2?.82:1);if(i)ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);else ctx.moveTo(x+rr,y);}
  ctx.closePath();ctx.fill();ctx.fillStyle='#aacd858c';ctx.beginPath();ctx.arc(x-r*.23,y-r*.25,r*.48,0,Math.PI*2);ctx.fill();
 }
}

export function clusterWorldMapMarkers(markers,transform,{threshold=18,selectedId=null}={}){
 const items=markers.map(marker=>({marker,point:worldMapToScreen(marker,transform)}));
 const parents=items.map((_,index)=>index);
 const find=index=>{while(parents[index]!==index){parents[index]=parents[parents[index]];index=parents[index];}return index;};
 const join=(left,right)=>{const a=find(left),b=find(right);if(a!==b)parents[b]=a;};
 const buckets=new Map(),cellSize=Math.max(1,threshold);
 for(let index=0;index<items.length;index++){
  const {marker,point}=items[index];
  if(marker.id===selectedId||!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
  const cellX=Math.floor(point.x/cellSize),cellY=Math.floor(point.y/cellSize);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const other of buckets.get((cellX+dx)+":"+(cellY+dy))||[]){
   const candidate=items[other].point;
   if(Math.hypot(point.x-candidate.x,point.y-candidate.y)<=threshold)join(index,other);
  }
  const key=cellX+":"+cellY;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(index);
 }
 const groups=new Map();
 for(let index=0;index<items.length;index++){
  const root=find(index);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(items[index]);
 }
 return [...groups.values()].map(group=>{
  const count=group.length;
  return{markers:group.map(item=>item.marker),x:group.reduce((sum,item)=>sum+item.marker.x,0)/count,y:group.reduce((sum,item)=>sum+item.marker.y,0)/count,
   screenX:group.reduce((sum,item)=>sum+item.point.x,0)/count,screenY:group.reduce((sum,item)=>sum+item.point.y,0)/count,clustered:count>1};
 });
}
function drawMarkerCluster(ctx,group){
 const count=group.markers.length,label=count>99?"99+":String(count),radius=label.length>2?10:9;
 ctx.save();ctx.translate(Math.round(group.screenX),Math.round(group.screenY));ctx.fillStyle="#d5bb80";ctx.strokeStyle="#17232b";ctx.lineWidth=2;
 ctx.beginPath();ctx.rect(-radius,-radius,radius*2,radius*2);ctx.fill();ctx.stroke();
 ctx.fillStyle="#17232b";ctx.font="bold 10px system-ui,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,0,0);ctx.restore();
}
export function drawWorldMap(ctx,{overview,width,height,view={zoom:1,panX:0,panY:0},player=null,waypoint=null,markers=null,filters={},search="",selectedId=null,discoveredChunks=null,revealAll=false,compact=false,detailFeatures=null}={}) {
 const w=Math.max(1,width),h=Math.max(1,height),size=overview?.worldSize||1,cols=overview?.columns||1,rows=overview?.rows||1,chunk=overview?.chunkSize||size/Math.max(cols,rows);
 ctx.clearRect(0,0,w,h);ctx.fillStyle="#111e27";ctx.fillRect(0,0,w,h);
 const transform=worldMapTransform({worldSize:size,width:w,height:h,...view}),known=discoveredChunks instanceof Set?discoveredChunks:null;
 const shown=visibleWorldMapMarkers(markers||mapMarkers(overview),overview,known,{filters,search,revealAll}),groups=clusterWorldMapMarkers(shown,transform,{selectedId});
 const cell=chunk*transform.scale,raster=terrainRasterFor(overview,filters.water===false,ctx.canvas?.ownerDocument);
 ctx.save();ctx.beginPath();ctx.rect(12,12,w-24,h-24);ctx.clip();
 if(raster){
  ctx.save();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(raster.canvas,transform.originX,transform.originY,cols*cell,rows*cell);
  ctx.restore();
  if(filters.trails!==false&&cell>2)for(const c of raster.trails){
   const x=transform.originX+c.x*cell,y=transform.originY+c.y*cell;
   if(x+cell<12||x>w-12||y+cell<12||y>h-12)continue;
   ctx.fillStyle="#e0c586";ctx.fillRect(Math.floor(x),Math.floor(y+cell*.48),Math.ceil(cell)+1,Math.max(1,Math.min(3,cell*.13)));
  }
  if(cell>12&&!compact)drawMapGrid(ctx,{originX:transform.originX,originY:transform.originY,columns:cols,rows,cell,width:w,height:h});
 }else{
  for(const c of overview?.chunks||[]){const x=transform.originX+c.x*cell,y=transform.originY+c.y*cell;if(x+cell<12||x>w-12||y+cell<12||y>h-12)continue;
   const palette=TERRAIN_COLORS[c.terrain]||TERRAIN_COLORS.meadow,variant=(Math.floor(c.x/2)*17+Math.floor(c.y/2)*31)%palette.length;ctx.fillStyle=c.terrain==="water"&&filters.water===false?"#6d7956":palette[variant];ctx.fillRect(Math.floor(x),Math.floor(y),Math.ceil(cell)+1,Math.ceil(cell)+1);
   if(filters.trails!==false&&c.trail&&cell>2){ctx.fillStyle="#e0c586";ctx.fillRect(Math.floor(x),Math.floor(y+cell*.48),Math.ceil(cell)+1,Math.max(1,Math.min(3,cell*.13)));}
   if(cell>12&&!compact){ctx.strokeStyle="#172d2a22";ctx.lineWidth=1;ctx.strokeRect(Math.floor(x),Math.floor(y),cell,cell);}
  }
 }
 const detailLayers=Array.isArray(detailFeatures)?detailFeatures:detailFeatures?[detailFeatures]:[];
 if(!compact&&transform.scale>=.7)for(const detailFeatures of detailLayers){
  const detailTerrain=localDetailTerrainRasterFor(detailFeatures,ctx.canvas?.ownerDocument,filters.water===false);
  if(detailTerrain){const bounds=detailFeatures.bounds;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(detailTerrain,transform.originX+bounds.left*transform.scale,transform.originY+bounds.top*transform.scale,detailTerrain.width*transform.scale,detailTerrain.height*transform.scale);ctx.restore();}
 }
 if(known&&!revealAll){
  const fog=explorationFogFor(overview,known,ctx.canvas?.ownerDocument);
  if(fog){ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(fog.canvas,transform.originX,transform.originY,cols*cell,rows*cell);ctx.restore();}
  else{ctx.fillStyle="#030609f2";for(const c of overview?.chunks||[])if(!known.has(c.y*cols+c.x))ctx.fillRect(Math.floor(transform.originX+c.x*cell),Math.floor(transform.originY+c.y*cell),Math.ceil(cell)+1,Math.ceil(cell)+1);}
 }
 if(!compact&&transform.scale>=.7)for(const detailFeatures of detailLayers){
  const region=detailFeatures.bounds;
  const visible={left:(12-transform.originX)/transform.scale,right:(w-12-transform.originX)/transform.scale,top:(12-transform.originY)/transform.scale,bottom:(h-12-transform.originY)/transform.scale};
  const knownAt=(x,y)=>!known||revealAll||known.has(worldMapCellIndex({x,y},overview));
  if(detailFeatures.plaza?.length){
   ctx.save();ctx.fillStyle="#d5c18c88";ctx.strokeStyle="#f1dda66b";ctx.lineWidth=Math.max(.6,.06*transform.scale);
   for(const tile of detailFeatures.plaza)if(tile.x>=visible.left-.5&&tile.x<=visible.right+.5&&tile.y>=visible.top-.5&&tile.y<=visible.bottom+.5&&knownAt(tile.x,tile.y)){
    const x=transform.originX+(tile.x-.5)*transform.scale,y=transform.originY+(tile.y-.5)*transform.scale;
    ctx.fillRect(x,y,transform.scale,transform.scale);ctx.strokeRect(x,y,transform.scale,transform.scale);
   }
   ctx.restore();
  }
  if(filters.trails!==false&&detailFeatures.paths?.length){
   ctx.fillStyle="#e3c789b8";ctx.beginPath();
   for(const p of detailFeatures.paths)if(p.x>=visible.left&&p.x<=visible.right&&p.y>=visible.top&&p.y<=visible.bottom&&knownAt(p.x,p.y))ctx.rect(transform.originX+p.x*transform.scale-.5*transform.scale,transform.originY+p.y*transform.scale-.5*transform.scale,Math.max(1,1.02*transform.scale),Math.max(1,1.02*transform.scale));
   ctx.fill();
  }
  const drawDots=(items,color,radius,filter=true)=>{if(!filter||!items?.length)return;ctx.fillStyle=color;ctx.beginPath();for(const item of items)if(item.x>=visible.left&&item.x<=visible.right&&item.y>=visible.top&&item.y<=visible.bottom&&knownAt(item.x,item.y))ctx.moveTo(transform.originX+item.x*transform.scale+radius*transform.scale,transform.originY+item.y*transform.scale),ctx.arc(transform.originX+item.x*transform.scale,transform.originY+item.y*transform.scale,Math.max(1,radius*transform.scale),0,Math.PI*2);ctx.fill();};
  if(filters.trees!==false)drawTreeCanopies(ctx,detailFeatures.trees,transform,visible,knownAt);drawDots(detailFeatures.treeGrowth,"#b2c982",.2,filters.trees!==false);drawDots(detailFeatures.rocks,"#b9b4a2",.25);drawDots(detailFeatures.fallenTrees,"#9b7149",.4);drawDots(detailFeatures.resources,"#e0ca82",.24,filters.resources!==false);
  // Lakes, buildings and fire markers may span several cached regions. Clip
  // those shared shapes, but allow individual tree crowns across tile edges.
  ctx.save();ctx.beginPath();ctx.rect(transform.originX+region.left*transform.scale,transform.originY+region.top*transform.scale,(region.right-region.left)*transform.scale,(region.bottom-region.top)*transform.scale);ctx.clip();
  drawDots(detailFeatures.fires,"#ee9b63",.34,filters.fires!==false);
  if(filters.water!==false)for(const lake of detailFeatures.lakes||[])if(lake.x>=visible.left-lake.radius&&lake.x<=visible.right+lake.radius&&lake.y>=visible.top-lake.radius&&lake.y<=visible.bottom+lake.radius&&knownAt(lake.x,lake.y)){
   ctx.beginPath();ctx.fillStyle="#4e91a4b0";ctx.strokeStyle="#9bd2d5";ctx.lineWidth=Math.max(1,.08*transform.scale);
   if(Array.isArray(lake.outline)&&lake.outline.length>=3){
    const [firstX,firstY]=lake.outline[0];ctx.moveTo(transform.originX+(lake.x+firstX)*transform.scale,transform.originY+(lake.y+firstY)*transform.scale);
    for(let index=1;index<lake.outline.length;index++){const [dx,dy]=lake.outline[index];ctx.lineTo(transform.originX+(lake.x+dx)*transform.scale,transform.originY+(lake.y+dy)*transform.scale);}
    ctx.closePath();
   }else ctx.arc(transform.originX+lake.x*transform.scale,transform.originY+lake.y*transform.scale,Math.max(1,lake.radius*transform.scale),0,Math.PI*2);
   ctx.fill();ctx.stroke();
  }
  if(filters.places!==false)for(const building of detailFeatures.buildings||[]){
   const b=building.bounds,cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
   if(!knownAt(cx,cy)||b.right<visible.left||b.left>visible.right||b.bottom<visible.top||b.top>visible.bottom)continue;
   const x=transform.originX+b.left*transform.scale,y=transform.originY+b.top*transform.scale,bw=(b.right-b.left)*transform.scale,bh=(b.bottom-b.top)*transform.scale;
   ctx.fillStyle='#102925';ctx.fillRect(x+1,y+2,bw,bh);ctx.fillStyle='#b28d62';ctx.fillRect(x,y,bw,bh);ctx.strokeStyle='#e6cba0';ctx.lineWidth=1;ctx.strokeRect(x,y,bw,bh);
   if(transform.scale>=2){ctx.beginPath();ctx.moveTo(x+bw/2,y);ctx.lineTo(x+bw/2,y+bh);ctx.strokeStyle='#725239';ctx.stroke();}
  }
  ctx.restore();
 }
 if(!compact&&detailLayers.length&&transform.scale>=.7&&filters.grid!==false){
  const grid={left:Math.max(0,(12-transform.originX)/transform.scale),right:Math.min(size,(w-12-transform.originX)/transform.scale),top:Math.max(0,(12-transform.originY)/transform.scale),bottom:Math.min(size,(h-12-transform.originY)/transform.scale)};
  if(grid.left<grid.right&&grid.top<grid.bottom)drawForestDetailGrid(ctx,{transform,bounds:grid});
 }
 ctx.strokeStyle="#e1c78a";ctx.lineWidth=2;ctx.strokeRect(transform.originX,transform.originY,size*transform.scale,size*transform.scale);
 for(const group of groups)if(group.screenX>=6&&group.screenX<=w-6&&group.screenY>=6&&group.screenY<=h-6){if(group.clustered)drawMarkerCluster(ctx,group);else{const m=group.markers[0];markerGlyph(ctx,m,{x:group.screenX,y:group.screenY},{selected:m.id===selectedId,scale:transform.scale});}}
 if(waypoint)markerGlyph(ctx,null,worldMapToScreen(waypoint,transform),{waypoint:true,scale:transform.scale});
 if(player){const p=worldMapToScreen(player,transform);ctx.save();ctx.beginPath();ctx.arc(Math.round(p.x),Math.round(p.y),9,0,Math.PI*2);ctx.fillStyle="#f3e5c6";ctx.globalAlpha=.26;ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(Math.round(p.x),Math.round(p.y),4,0,Math.PI*2);ctx.fillStyle="#fff0b7";ctx.strokeStyle="#17232b";ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();}
 ctx.restore();if(!compact){ctx.strokeStyle="#d5bb80";ctx.lineWidth=2;ctx.strokeRect(11,11,w-22,h-22);ctx.fillStyle="#f3e5c6";ctx.font="bold 11px system-ui,sans-serif";ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText("N ↑",20,20);const bar=80,barY=h-43;ctx.strokeStyle="#f3e5c6";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(23,barY);ctx.lineTo(23+bar,barY);ctx.moveTo(23,barY-4);ctx.lineTo(23,barY+4);ctx.moveTo(23+bar,barY-4);ctx.lineTo(23+bar,barY+4);ctx.stroke();ctx.font="10px system-ui,sans-serif";ctx.fillText(Math.round(bar/transform.scale)+" células",28+bar,barY+3);}
 return {transform,visibleMarkers:shown,markerGroups:groups,clusterCount:groups.filter(group=>group.clustered).length};
}
export function hitTestWorldMapMarker(p,markers,t,radius=14,{selectedId=null}={}){let best=null,distance=radius;for(const group of clusterWorldMapMarkers(markers,t,{selectedId})){const d=Math.hypot(p.x-group.screenX,p.y-group.screenY),hitRadius=group.clustered?Math.max(radius,13):radius;if(d<hitRadius&&d<distance){best=group.clustered?{...group,cluster:true}:group.markers[0];distance=d;}}return best;}
