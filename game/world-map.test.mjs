import test from 'node:test';import assert from 'node:assert/strict';import{centerWorldMapOn,clusterWorldMapMarkers,drawWorldMap,filterMapMarkers,hitTestWorldMapMarker,mapMarkers,screenToWorldMap,worldMapToScreen,worldMapTransform,discoverWorldMapCells,mergeWorldMapExploration,isWorldMapCellKnown,normalizeWorldMapExploration,worldMapCellIndex,worldMapExplorationLabel,visibleWorldMapMarkers,zoomWorldMapAround,preloadWorldMapCaches,worldMapDetailBounds,worldMapDetailTiles,WORLD_MAP_MAX_ZOOM}from'./world-map.mjs';
import {createWorldMapOverview,getWorldMapOverview,getWorldDefinition,applyWorldDefinition} from './world.mjs';

test('incremental map matches the synchronous map across interleaved dimension slices',()=>{
 const source=getWorldDefinition(),target={...source,seed:source.seed+1,dimensionId:'map-slice-test',theme:'magic'};
 try{
  applyWorldDefinition(target);const expected=getWorldMapOverview(),builder=createWorldMapOverview();
  let result,steps=0;
  do{
   applyWorldDefinition(target);
   for(let i=0;i<64;i++){result=builder.next();if(result.done)break;steps++;}
   applyWorldDefinition(source);
  }while(!result.done);
  assert.equal(steps,expected.chunks.length);
  assert.deepEqual(result.value,expected);
 }finally{applyWorldDefinition(source);}
});
test('world map projection round trips after pan and zoom',()=>{const s={worldSize:5933,width:900,height:600,zoom:2.4,panX:-44,panY:31},p={x:1820.5,y:4099.25},q=worldMapToScreen(p,worldMapTransform(s)),b=screenToWorldMap(q,worldMapTransform(s));assert.ok(Math.abs(p.x-b.x)<1e-8);assert.ok(Math.abs(p.y-b.y)<1e-8);});
test('local forest map supports high zoom and clamps all zoom inputs consistently',()=>{const bounds={worldSize:5933,width:700,height:500},maximum=worldMapTransform({...bounds,zoom:999}),expected=worldMapTransform({...bounds,zoom:WORLD_MAP_MAX_ZOOM});assert.equal(maximum.scale,expected.scale);const around=zoomWorldMapAround({zoom:30,panX:0,panY:0},{x:80,y:90},{x:350,y:250},999,bounds);assert.equal(around.zoom,WORLD_MAP_MAX_ZOOM);});
test('map recenters a selected location without changing its zoom',()=>{const v=centerWorldMapOn({zoom:2,panX:0,panY:0},{x:2400,y:2200},{worldSize:5933,width:800,height:600}),p=worldMapToScreen({x:2400,y:2200},worldMapTransform({worldSize:5933,width:800,height:600,...v}));assert.deepEqual(p,{x:400,y:300});assert.equal(v.zoom,2);});

test('map recentering clamps to world edges instead of leaving blank space outside the map',()=>{const v=centerWorldMapOn({zoom:2.4,panX:0,panY:0},{x:10,y:10},{worldSize:5933,width:800,height:600}),t=worldMapTransform({worldSize:5933,width:800,height:600,...v});assert.ok(Math.abs(t.originX-12)<1e-8);assert.ok(Math.abs(t.originY-12)<1e-8);const player=worldMapToScreen({x:10,y:10},t);assert.ok(player.x>=12&&player.x<32);assert.ok(player.y>=12&&player.y<32);});
test('secret places never become map markers and filters/search stay category scoped',()=>{const o={chunks:[{landmarks:[{id:'fire',kind:'campfire',x:8,y:9},{id:'hut',kind:'place',name:'Casa do Lago',x:20,y:21},{id:'ore',kind:'resource',x:30,y:31},{id:'hidden',kind:'place',name:'Segredo',x:40,y:41,secret:true}]}]},m=mapMarkers(o);assert.equal(m.length,3);assert.equal(filterMapMarkers(m,{filters:{resources:false}}).length,2);assert.equal(filterMapMarkers(m,{search:'casa'}).length,1);assert.equal(filterMapMarkers(m,{search:'segredo'}).length,0);});
test("fogged markers are excluded consistently from selection until discovered or revealed",()=>{
 const overview={worldSize:100,columns:2,rows:2,chunkSize:50},markers=[{id:"known",x:10,y:10,name:"Abrigo"},{id:"hidden",x:70,y:70,name:"Lago",category:"water"}],known=new Set([0]);
 assert.deepEqual(visibleWorldMapMarkers(markers,overview,known).map(marker=>marker.id),["known"]);
 assert.deepEqual(visibleWorldMapMarkers(markers,overview,known,{search:"lago"}),[]);
 assert.deepEqual(visibleWorldMapMarkers(markers,overview,known,{revealAll:true}).map(marker=>marker.id),["known","hidden"]);
 assert.deepEqual(visibleWorldMapMarkers(markers,overview,new Set([0,3])).map(marker=>marker.id),["known","hidden"]);
});

test("map search ranks an exact place name before longer partial matches",()=>{
 const markers=[{id:"vein",name:"Veio dos Morros do Sul",kind:"resource"},{id:"ridge",name:"Morros do Sul",kind:"mountain-range"}];
 assert.deepEqual(filterMapMarkers(markers,{search:"Morros do Sul"}).map(marker=>marker.id),["ridge","vein"]);
 assert.deepEqual(filterMapMarkers(markers,{search:"Morros"}).map(marker=>marker.id),["ridge","vein"]);
});

test('map marker hit testing picks the nearest marker within the tap radius',()=>{const m=[{id:'a',x:10,y:10},{id:'b',x:100,y:100}],t=worldMapTransform({worldSize:200,width:400,height:400}),p=worldMapToScreen({x:11,y:10},t);assert.equal(hitTestWorldMapMarker(p,m,t,14)?.id,'a');assert.equal(hitTestWorldMapMarker({x:0,y:0},m,t,4),null);});
test("recentring a second location replaces the previous pan instead of accumulating it",()=>{const bounds={worldSize:5933,width:800,height:600};let view={zoom:1,panX:0,panY:0};view=centerWorldMapOn(view,{x:1900,y:2200},bounds);view=centerWorldMapOn(view,{x:2950,y:3100},bounds);const position=worldMapToScreen({x:2950,y:3100},worldMapTransform({...bounds,...view}));assert.deepEqual(position,{x:400,y:300});});

test("terrain raster is reused for redraws and rebuilt only when the water filter changes",()=>{
 const counts={created:0,rasterized:0,drawn:0};
 const documentRef={createElement(){
  counts.created+=1;
  const rasterContext={clearRect(){},fillRect(){counts.rasterized+=1;}};
  return{width:0,height:0,getContext(){return rasterContext;}};
 }};
 const ctx={canvas:{ownerDocument:documentRef},clearRect(){},fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){counts.drawn+=1;},strokeRect(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const overview={worldSize:100,columns:1,rows:1,chunkSize:100,chunks:[{x:0,y:0,terrain:"water",trail:false,landmarks:[]}]};
 const options={overview,width:120,height:120,view:{zoom:1,panX:0,panY:0}};
 drawWorldMap(ctx,options);drawWorldMap(ctx,options);
 assert.equal(counts.created,1);assert.equal(counts.rasterized,1);assert.equal(counts.drawn,2);
 drawWorldMap(ctx,{...options,filters:{water:false}});
 assert.equal(counts.created,2);assert.equal(counts.rasterized,2);assert.equal(counts.drawn,3);
});

test('local detail terrain raster is cached instead of rebuilt on each map redraw',()=>{
 const counts={created:0,tiles:0,drawn:0};
 const documentRef={createElement(){counts.created++;return{width:0,height:0,getContext(){return{clearRect(){},fillRect(){counts.tiles++;}};}};}};
 const ctx={canvas:{ownerDocument:documentRef},clearRect(){},fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){counts.drawn++;},strokeRect(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const overview={worldSize:100,columns:1,rows:1,chunkSize:100,chunks:[{x:0,y:0,terrain:'meadow',trail:false,landmarks:[]}]};
 const detailFeatures={bounds:{left:20,top:20,right:22,bottom:22},terrain:[Uint8Array.of(0,1),Uint8Array.of(2,2)]};
 const options={overview,width:240,height:220,view:{zoom:10},revealAll:true,detailFeatures};
 drawWorldMap(ctx,options);drawWorldMap(ctx,options);
 assert.equal(counts.created,2,'one coarse map canvas and one local detail canvas');
 assert.equal(counts.tiles,4,'coarse terrain and three local tile runs are rasterized once');
 drawWorldMap(ctx,{...options,filters:{water:false}});
 assert.equal(counts.created,4,'muting water prepares one reusable local and overview variant');
});

test('village square tiles render as a distinct tiled plaza overlay on the detailed map',()=>{
 const filled=[];const documentRef={createElement(){return{width:0,height:0,getContext(){return{clearRect(){},fillRect(){}};}};}};
 const ctx={canvas:{ownerDocument:documentRef},fillStyle:'',clearRect(){},fillRect(...args){filled.push({color:this.fillStyle,args});},save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){},strokeRect(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const overview={worldSize:100,columns:1,rows:1,chunkSize:100,chunks:[{x:0,y:0,terrain:'meadow',trail:false,landmarks:[]}]};
 drawWorldMap(ctx,{overview,width:240,height:220,view:{zoom:10},revealAll:true,detailFeatures:{bounds:{left:49,top:49,right:52,bottom:52},terrain:[Uint8Array.of(0,0,0),Uint8Array.of(0,0,0),Uint8Array.of(0,0,0)],plaza:[{x:50.5,y:50.5}]}});
 assert.ok(filled.some(({color,args})=>color==='#d5c18c88'&&args[2]>0&&args[3]>0),'plaza tile should have its own readable fill');
});

test('dimension transition preloading prepares shared terrain rasters before first map draw',()=>{
 const counts={created:0};const documentRef={createElement(){counts.created++;return{width:0,height:0,getContext(){return{clearRect(){},fillRect(){}};}};}};
 const overview={columns:1,rows:1,chunks:[{x:0,y:0,terrain:'meadow'}]};
 assert.equal(preloadWorldMapCaches(overview,documentRef),true);assert.equal(counts.created,2);
 assert.equal(preloadWorldMapCaches(overview,documentRef),true);assert.equal(counts.created,2);
});

test("nearby map markers group at overview scale and split when zoomed",()=>{
 const markers=[{id:"a",x:10,y:10},{id:"b",x:13,y:10},{id:"c",x:80,y:80}],bounds={worldSize:100,width:300,height:300};
 const overview=clusterWorldMapMarkers(markers,worldMapTransform(bounds));
 assert.equal(overview.filter(group=>group.clustered).length,1);assert.equal(overview.find(group=>group.clustered).markers.length,2);
 const close=hitTestWorldMapMarker({x:worldMapToScreen({x:11.5,y:10},worldMapTransform(bounds)).x,y:worldMapToScreen({x:11.5,y:10},worldMapTransform(bounds)).y},markers,worldMapTransform(bounds));
 assert.equal(close?.cluster,true);assert.equal(close.markers.length,2);
 const zoomedView={zoom:3,panX:0,panY:0},zoomed=clusterWorldMapMarkers(markers,worldMapTransform({...bounds,...zoomedView}));
 assert.equal(zoomed.some(group=>group.clustered),false);
 const selected=clusterWorldMapMarkers(markers,worldMapTransform(bounds),{selectedId:"a"});
 assert.equal(selected.find(group=>group.markers[0].id==="a").clustered,false);
});


test("exploration reveals nearby chunks once and clamps discovery to world bounds",()=>{
 const grid={worldSize:1000,chunkSize:250,columns:4,rows:4},known=new Set();
 assert.equal(worldMapCellIndex({x:500,y:500},grid),10);
 assert.deepEqual(discoverWorldMapCells({x:5,y:5},grid,known,1),[0,1,4,5]);
 assert.deepEqual(discoverWorldMapCells({x:5,y:5},grid,known,1),[]);
 assert.equal(isWorldMapCellKnown({x:5,y:5},grid,known),true);
 assert.equal(isWorldMapCellKnown({x:999,y:999},grid,known),false);
 assert.deepEqual(normalizeWorldMapExploration([5,5,-1,16,2.5,0],grid),[0,5]);
});

test("merging newly discovered map cells rebuilds cached fog only when exploration changes",()=>{
 const known=new Set([0]);known.revision=1;const counts={created:0};
 const documentRef={createElement(){counts.created+=1;return{width:0,height:0,getContext(){return{clearRect(){},fillRect(){}};}};}};
 const ctx={canvas:{ownerDocument:documentRef},clearRect(){},fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){},strokeRect(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const overview={worldSize:200,columns:2,rows:2,chunkSize:100,chunks:[0,1,2,3].map(cell=>({x:cell%2,y:Math.floor(cell/2),terrain:"meadow",trail:false,landmarks:[]}))};
 const options={overview,width:220,height:180,view:{zoom:1},discoveredChunks:known};
 drawWorldMap(ctx,options);assert.equal(counts.created,2,"terrain and fog rasters should be created once");
 assert.deepEqual(mergeWorldMapExploration(known,[1,1,-1,16],overview),[1]);assert.equal(known.revision,2);
 drawWorldMap(ctx,options);assert.equal(counts.created,3,"new exploration should rebuild the fog raster");
 assert.deepEqual(mergeWorldMapExploration(known,[1],overview),[]);assert.equal(known.revision,2);
 drawWorldMap(ctx,options);assert.equal(counts.created,3,"duplicate exploration should reuse the fog raster");
});

test("fog hides map markers outside discovered chunks",()=>{
 const counts={filled:0,drawn:0};
 const documentRef={createElement(){return{width:0,height:0,getContext(){return{clearRect(){},fillRect(){}};}};}};
 const ctx={canvas:{ownerDocument:documentRef},clearRect(){},fillRect(){counts.filled++;},save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},closePath(){},arc(){},fill(){},drawImage(){counts.drawn++},strokeRect(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const overview={worldSize:200,columns:2,rows:2,chunkSize:100,chunks:[{x:0,y:0,terrain:"meadow",trail:false,landmarks:[{id:"camp",kind:"campfire",x:150,y:150} ]},{x:1,y:0,terrain:"meadow",trail:false,landmarks:[]},{x:0,y:1,terrain:"meadow",trail:false,landmarks:[]},{x:1,y:1,terrain:"meadow",trail:false,landmarks:[]}]};
 const result=drawWorldMap(ctx,{overview,width:220,height:180,discoveredChunks:new Set([0]),view:{zoom:1}});
 assert.equal(result.visibleMarkers.length,0);
 assert.equal(counts.drawn,2,"fog raster should be drawn while unknown cells are hidden");
 const revealed=drawWorldMap(ctx,{overview,width:220,height:180,discoveredChunks:new Set([0]),revealAll:true,view:{zoom:1}});
 assert.equal(revealed.visibleMarkers.length,1);
 assert.equal(counts.drawn,3,"revealing the world should omit the fog raster");
});

test("map exploration label never says zero after a real discovery and reveal-all does not mutate it",()=>{
 const overview={columns:48,rows:48},known=new Set();
 assert.equal(worldMapExplorationLabel(known,overview),"0% explorado");
 known.add(49);assert.equal(worldMapExplorationLabel(known,overview),"<1% explorado");
 for(let cell=50;cell<73;cell++)known.add(cell);
 assert.equal(worldMapExplorationLabel(known,overview),"1% explorado");
 assert.equal(worldMapExplorationLabel(known,overview,{revealAll:true}),"Tudo revelado");
 assert.equal(known.size,24);
});

test("pinch zoom preserves the world point under the moving midpoint",()=>{
 const bounds={worldSize:5933,width:360,height:420},view={zoom:1.8,panX:-85,panY:42},start={x:150,y:180};
 const anchor=screenToWorldMap(start,worldMapTransform({...bounds,...view}));
 const zoomed=zoomWorldMapAround(view,anchor,start,3.6,bounds);
 const projected=worldMapToScreen(anchor,worldMapTransform({...bounds,...zoomed}));
 assert.ok(Math.abs(projected.x-start.x)<1e-8);assert.ok(Math.abs(projected.y-start.y)<1e-8);
 const translated=zoomWorldMapAround(view,anchor,{x:176,y:159},3.6,bounds);
 const moved=worldMapToScreen(anchor,worldMapTransform({...bounds,...translated}));
 assert.ok(Math.abs(moved.x-176)<1e-8);assert.ok(Math.abs(moved.y-159)<1e-8);
 assert.equal(zoomWorldMapAround(view,anchor,start,999,bounds).zoom,WORLD_MAP_MAX_ZOOM);
 assert.ok(zoomWorldMapAround(view,anchor,start,.01,bounds).zoom>=.65);
});


test('wide mobile viewport keeps real detail instead of silently falling back to coarse blocks',()=>{
 const viewport={worldSize:5933,width:368,height:226};
 const transform=worldMapTransform({...viewport,zoom:32,panX:0,panY:0});
 const centered=centerWorldMapOn({zoom:32,panX:0,panY:0},{x:88.2,y:92.3},viewport);
 const bounds=worldMapDetailBounds(worldMapTransform({...viewport,...centered}),viewport);
 assert.ok((viewport.width-24)/transform.scale>320,'reproduces the old width cutoff');
 assert.ok(bounds,'a wide local viewport must get a detail survey');
 assert.ok(bounds.left<=88.2&&bounds.right>=88.2&&bounds.top<=92.3&&bounds.bottom>=92.3);
 assert.ok((bounds.right-bounds.left)*(bounds.bottom-bounds.top)<=200000);
 assert.equal(worldMapDetailBounds(worldMapTransform({...viewport,zoom:1}),viewport),null,'world overview must not survey millions of cells');
});

test('centering a local region near the edge fills the viewport and stays stable after repeated centering',()=>{
 const bounds={worldSize:5933,width:580,height:188},point={x:88.2,y:92.3};
 let view={zoom:42,panX:0,panY:0};
 for(let i=0;i<3;i++){
  view=centerWorldMapOn(view,point,bounds);
  const t=worldMapTransform({...bounds,...view});
  assert.ok(t.originX<=12+1e-8&&t.originY<=12+1e-8,'no large empty border outside the world');
  const p=worldMapToScreen(point,t);assert.ok(p.x>=12&&p.x<=bounds.width-12&&p.y>=12&&p.y<=bounds.height-12);
 }
});


test('adjacent views reuse stable detail regions and clamp tiles at the world boundary',()=>{
 const first=worldMapDetailTiles({left:0,top:0,right:180,bottom:130},200);
 const second=worldMapDetailTiles({left:64,top:0,right:200,bottom:130},200);
 const key=b=>`${b.left}:${b.top}:${b.right}:${b.bottom}`;
 const original=new Set(first.map(key)),reused=second.filter(tile=>original.has(key(tile)));
 assert.ok(reused.length>0,'panning keeps existing regions');
 assert.ok(second.some(tile=>!original.has(key(tile))),'only newly exposed regions need work');
 assert.ok(second.every(tile=>tile.right<=200&&tile.bottom<=200));
 assert.equal(new Set(second.map(key)).size,second.length);
});

test('detailed world map follows authored lake outlines and keeps legacy circles',()=>{
 const moves=[],lines=[];let arcs=0;const doc={createElement(){return{width:0,height:0,getContext(){return{clearRect(){},fillRect(){}};}};}};
 const ctx={canvas:{ownerDocument:doc},clearRect(){},fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){},strokeRect(){},moveTo(x,y){moves.push([x,y]);},lineTo(x,y){lines.push([x,y]);},arc(){arcs++;},closePath(){},fill(){},stroke(){},fillText(){}};
 const overview={worldSize:100,columns:1,rows:1,chunkSize:100,chunks:[{x:0,y:0,terrain:'meadow',trail:false,landmarks:[]}]};
 const outline=[[-8,-6],[-4,-8],[4,-8],[8,-4],[8,4],[4,8],[-4,8],[-8,6]];
 const detailFeatures={bounds:{left:0,top:0,right:100,bottom:100},lakes:[{x:40,y:40,radius:12,outline},{x:65,y:65,radius:9}]};
 const transform=worldMapTransform({worldSize:100,width:240,height:220,zoom:2});
 drawWorldMap(ctx,{overview,width:240,height:220,view:{zoom:2},revealAll:true,detailFeatures});
 const hasPoint=(points,[dx,dy],lake)=>points.some(([x,y])=>Math.abs(x-(transform.originX+(lake.x+dx)*transform.scale))<1e-8&&Math.abs(y-(transform.originY+(lake.y+dy)*transform.scale))<1e-8);
 assert.ok(hasPoint(moves,outline[0],detailFeatures.lakes[0]),'the polygon starts at its authored shore point');
 assert.ok(outline.slice(1).every(point=>hasPoint(lines,point,detailFeatures.lakes[0])),'all remaining shore points reach the map path');
 assert.equal(arcs,1,'legacy lakes without an outline retain circle rendering');
});

test('map renderer composes several detailed regions without repeating fog',()=>{
 const counters={draws:0},doc={createElement(){return{width:0,height:0,getContext(){return{clearRect(){},fillRect(){}}}}}};
 const ctx={canvas:{ownerDocument:doc},clearRect(){},fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){counters.draws++},strokeRect(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const overview={worldSize:64,columns:1,rows:1,chunkSize:64,chunks:[{x:0,y:0,terrain:'meadow'}]};
 const layers=[{bounds:{left:0,top:0,right:2,bottom:2},terrain:[Uint8Array.of(0,1),Uint8Array.of(1,0)]},{bounds:{left:2,top:0,right:4,bottom:2},terrain:[Uint8Array.of(0,0),Uint8Array.of(1,1)]}];
 drawWorldMap(ctx,{overview,width:200,height:180,view:{zoom:2},detailFeatures:layers,discoveredChunks:new Set([0])});
 assert.equal(counters.draws,4,'one overview, two detail layers and one fog layer');
});
