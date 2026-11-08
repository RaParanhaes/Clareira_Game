import {VILLAGE_BUILDINGS,RECEPTION_BUILDING} from './village-buildings.mjs';
import {builtinRoomLayouts} from './world.mjs';
import {BUILDING_STANDARD,FIXTURE_HEIGHTS,roomWallDecor} from './building-standard.mjs';
import {buildingWindows,buildingArchitecture} from './architectural-elements.mjs';
import {LODGING_OFFERS} from './lodging-catalog.mjs';
import {PLACE_SERVICES} from './place-services.mjs';
import {CONTENT} from './content-catalog.mjs';
import {copyData} from './object-catalog.mjs';

const furniturePhysics=new Map(CONTENT.filter(item=>item.category==='furniture').map(item=>[item.kind,item.physics]));
function fixtureBehavior(kind){
 const physics=furniturePhysics.get(kind)||{shape:'box',authority:'server'};
 return {physics:copyData(physics),depthOrder:{anchor:'footprint-front',vertical:'support-base'}};
}

const local=(value,bounds)=>{
 const v=copyData(value);for(const key of ['x','left','right'])if(Number.isFinite(v[key]))v[key]-=bounds.left;
 for(const key of ['y','top','bottom'])if(Number.isFinite(v[key]))v[key]-=bounds.top;return v;
};
export function createBuiltinObjectCatalog(){
 const templates=[],objects=[],known=new Set();
 function model(id,kind,properties={}){if(!known.has(id)){templates.push({id,kind,properties,baseId:null,version:1,archived:false});known.add(id);}return id;}
 function add(id,kind,properties,parentId=null,templateId=null,sceneId='surface'){
  objects.push({id,templateId:templateId||model(`architecture.${kind}`,kind),sceneId,parentId,properties:copyData(properties),version:1,archived:false});return id;
 }
for(const f of CONTENT.filter(c=>c.category==='furniture'&&c.status==='implemented'))model(f.id,'fixture',{
  kind:f.kind,width:f.width,depth:f.depth,height:f.height,palette:'cedar',physics:f.physics,...(f.use?{use:f.use}:{}),
  ...(f.catalogId?{catalogId:f.catalogId,label:f.label,category:f.catalogCategory,categoryLabel:f.categoryLabel,
    family:f.family,variantIndex:f.variantIndex,renderKind:f.renderKind,silhouette:f.silhouette,
    colors:copyData(f.colors),renderer:f.renderer,rotations:f.rotations}:{}),
  depthOrder:copyData(f.depthOrder),...(f.capabilities?{capabilities:copyData(f.capabilities)}:{}),...(f.dimension?{dimension:copyData(f.dimension)}:{}),...(f.light?{light:copyData(f.light)}:{}),...(f.supports?{supports:copyData(f.supports)}:{}),...(f.stackable?{stackable:true}:{}),
 });

 const layouts=builtinRoomLayouts();
 function room(layout,buildingId,roomKind,mode=null){
  const parent=buildingId?`building:${buildingId}`:null,id=`room:${buildingId||'legacy'}:${roomKind}:${mode||'main'}`;
  const props=copyData(layout);delete props.fixtures;delete props.obstacles;delete props.waitingSeats;delete props.rug;delete props.counter;
  props.roomKind=roomKind;props.lodgingMode=mode;add(id,'room',props,parent,null,`interior:${buildingId||'legacy'}`);
  for(const [i,fixture]of layout.fixtures.entries()){
   const p=copyData(fixture),template=p.catalogId||`fixture.${p.kind}`;
   if(!p.catalogId){model(template,'fixture',{kind:p.kind,height:FIXTURE_HEIGHTS[p.kind]||p.height,palette:'cedar',...fixtureBehavior(p.kind)});
     if(p.height===(FIXTURE_HEIGHTS[p.kind]||p.height))delete p.height;}
   add(`${id}/fixture-${i}`,'fixture',p,id,template,`interior:${buildingId||'legacy'}`);
  }
  if(layout.counter){const b=layout.counter;add(`${id}/counter`,'fixture',{kind:'counter',x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,width:b.right-b.left,depth:b.bottom-b.top,height:b.height||BUILDING_STANDARD.counterHeight,...(b.surfaceModel?{surfaceModel:b.surfaceModel,surfaceCount:b.surfaceCount}:{})},id,model('fixture.counter','fixture',{kind:'counter',palette:'cedar',...fixtureBehavior('counter')}),`interior:${buildingId||'legacy'}`);}
  if(layout.rug)add(`${id}/rug`,'rug',layout.rug,id,null,`interior:${buildingId||'legacy'}`);
  const decor=roomWallDecor(layout);
  if(decor.window)add(`${id}/window`,'window',decor.window,id,null,`interior:${buildingId||'legacy'}`);
  add(`${id}/art`,'decor',{artX:decor.artX,artWidth:decor.artWidth},id,null,`interior:${buildingId||'legacy'}`);
 }
 for(const b of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
  const id=`building:${b.id}`,props=copyData(b);delete props.door;
  props.services=copyData(PLACE_SERVICES[b.id]||[]);props.offers=LODGING_OFFERS.filter(o=>o.buildingId===b.id).map(({buildingId,buildingName,buildingKind,...offer})=>offer);
  add(id,'building',props,null,model(`building.${b.kind}`,'building',{regionId:'ember-woods'}));
  add(`${id}/door`,'door',local({...b.door,height:b.doorHeight,enabled:true},b.bounds),id);
  add(`${id}/roof`,'roof',{colors:b.roof,axis:b.roofAxis,rise:b.roofRise},id);
  for(const face of ['front','side'])add(`${id}/wall-${face}`,'wall',{face,colors:face==='front'?b.walls:b.side},id);
  buildingWindows(b).forEach((w,i)=>{const p=local(w,b.bounds);delete p.id;add(`${id}/window-${i}`,'window',p,id);});
  const architecture=buildingArchitecture(b);
  if(architecture.canopy)add(`${id}/canopy`,'canopy',local(architecture.canopy,b.bounds),id);
  architecture.posts.forEach((p,i)=>add(`${id}/post-${i}`,'post',local(p,b.bounds),id));
  if(architecture.balcony)add(`${id}/balcony`,'balcony',local(architecture.balcony,b.bounds),id);
  if(b.id==='arrival')room(layouts.arrival,b.id,'lobby');
  else if(layouts.lobbies[b.id])room(layouts.lobbies[b.id],b.id,'lobby');
  if(layouts.rentals[b.id])room(layouts.rentals[b.id],b.id,'lodging','rent');
  if(layouts.apartments[b.id])room(layouts.apartments[b.id],b.id,'lodging','owned');
  if(layouts.cabins[b.id])room(layouts.cabins[b.id],b.id,'lodging','owned');
 }
 room(layouts.legacy,null,'legacy');
 return {version:1,revision:0,templates,objects};
}
// Capture authored defaults once: later database updates must never become a
// new seed or overwrite saved authoring decisions on process restart.
export const BUILTIN_OBJECT_CATALOG=createBuiltinObjectCatalog();
