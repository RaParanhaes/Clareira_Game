import { isPresetFurnitureKind, presetFurnitureItem } from './room-presets.mjs';
import {interiorPartitions} from './interior-architecture.mjs';
import {fixtureBounds} from './building-standard.mjs';
import {copyData,resolveObjectCatalog} from './object-catalog.mjs';
let catalog=null,resolved=null;
const listeners=new Set(),rooms=new Map(),buildings=new Map();
export const objectCatalogRevision=()=>catalog?.revision??-1;
export const getObjectCatalog=()=>catalog;
export const objectTemplate=id=>resolved?.templates.get(id)||null;
export const objectBuildings=()=>[...buildings.values()];
export const subscribeObjectCatalog=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const roomObjectKey=(kind='legacy',id=null,mode=null)=>`${kind}:${id||'arrival'}:${mode||''}`;
export function objectRoomLayout(kind='legacy',id=null,mode=null){return rooms.get(roomObjectKey(kind,id,mode))||rooms.get(roomObjectKey(kind,id,null))||null;}
function translated(value,bounds){
 const v=copyData(value);
 for(const key of ['x','left','right'])if(Number.isFinite(v[key]))v[key]+=bounds.left;
 for(const key of ['y','top','bottom'])if(Number.isFinite(v[key]))v[key]+=bounds.top;
 return v;
}
export function applyObjectCatalog(value,{validateOnly=false}={}){
 if(!validateOnly&&catalog&&catalog.revision===value.revision&&JSON.stringify(catalog)===JSON.stringify(value))return false;
 const graph=resolveObjectCatalog(value),active=[...graph.objects.values()].filter(o=>!o.archived&&o.properties.visible!==false),children=new Map();
 for(const o of active){if(!children.has(o.parentId))children.set(o.parentId,[]);children.get(o.parentId).push(o);}
 const nextBuildings=new Map(),nextRooms=new Map();
 for(const o of active.filter(o=>o.kind==='building')){
  const b={...copyData(o.properties),objectId:o.id},parts=children.get(o.id)||[];
  const select=kind=>parts.filter(p=>p.kind===kind);
  const door=select('door')[0];b.door=door?translated(door.properties,b.bounds):{x:(b.bounds.left+b.bounds.right)/2,y:b.bounds.bottom+.5,enabled:false};
  b.doorWidth=1.25/(b.bounds.right-b.bounds.left);b.doorHeight=door?.properties.height||3.6;
  const roof=select('roof')[0];b.roofVisible=Boolean(roof);if(roof)Object.assign(b,{roof:roof.properties.colors,roofAxis:roof.properties.axis,roofRise:roof.properties.rise});
  b.hiddenFaces=[];
  for(const face of ['front','side']){const wall=select('wall').find(p=>p.properties.face===face);if(wall)b[face==='front'?'walls':'side']=wall.properties.colors;else b.hiddenFaces.push(face);}
  b.windowObjects=select('window').map(p=>{const v=translated(p.properties,b.bounds);return {...v,z:(v.bottom+v.top)/2,id:p.id};});
  b.architectureObjects={canopy:select('canopy')[0]?translated(select('canopy')[0].properties,b.bounds):null,
   posts:select('post').map(p=>translated(p.properties,b.bounds)),balcony:select('balcony')[0]?translated(select('balcony')[0].properties,b.bounds):null};
  if(nextBuildings.has(b.id))throw new Error('Identificador de prédio repetido.');nextBuildings.set(b.id,b);
 }
 for(const o of active.filter(o=>o.kind==='room')){
  const layout={...copyData(o.properties),objectId:o.id},parts=children.get(o.id)||[],parent=nextBuildings.get(graph.objects.get(o.parentId)?.properties.id);
  if(o.parentId&&!parent)continue;
  const allFixtures=parts.filter(p=>p.kind==='fixture'&&p.properties.kind!=='counter').map(p=>({...copyData(p.properties),id:p.id,objectId:p.id}));
  // Private rooms (legacy home and lodgings) hand their movable pieces to the room as predefined furniture.
  const privateRoom=layout.roomKind==='lodging'||layout.roomKind==='legacy';
  const fixtures=privateRoom?allFixtures.filter(item=>!isPresetFurnitureKind(item.kind)):allFixtures;
  layout.presets=privateRoom?Object.freeze(allFixtures.filter(item=>isPresetFurnitureKind(item.kind)).map((item,index)=>presetFurnitureItem(item,index))):Object.freeze([]);
  const counter=parts.find(p=>p.kind==='fixture'&&p.properties.kind==='counter');
  layout.fixtures=fixtures;layout.partitions=interiorPartitions(layout);layout.obstacles=[...fixtures.map(fixtureBounds),...layout.partitions];
  layout.counter=counter?{left:counter.properties.x-counter.properties.width/2,right:counter.properties.x+counter.properties.width/2,
   top:counter.properties.y-counter.properties.depth/2,bottom:counter.properties.y+counter.properties.depth/2,height:counter.properties.height,
   ...(counter.properties.surfaceModel?{surfaceModel:counter.properties.surfaceModel,surfaceCount:counter.properties.surfaceCount}:{})}:null;
  layout.rug=copyData(parts.find(p=>p.kind==='rug')?.properties||null);layout.waitingSeats=[];
  layout.wallDecorObjects={window:copyData(parts.find(p=>p.kind==='window')?.properties||null),...copyData(parts.find(p=>p.kind==='decor')?.properties||{artX:null,artWidth:1})};
  // All doorway/spawn positions and fixture colliders are reconstructed from
  // exactly the same records that the renderer receives.
  for(const p of [layout.spawn,layout.door]){
   const outsideFront=layout.elevation==='flat'&&Math.abs(p.x-layout.door.x)<.01
    &&p.y>=layout.bounds.bottom&&p.y<=layout.bounds.bottom+1;
   if(p.x<layout.bounds.left||p.x>layout.bounds.right||p.y<layout.bounds.top||p.y>layout.bounds.bottom&&!outsideFront)throw new Error('Entrada fora do cômodo.');
  }
  if(layout.obstacles.some(r=>layout.spawn.x>r.left-.25&&layout.spawn.x<r.right+.25&&layout.spawn.y>r.top-.25&&layout.spawn.y<r.bottom+.25))throw new Error('Móvel bloqueia a chegada.');
  const key=roomObjectKey(layout.roomKind,parent?.id||null,layout.lodgingMode);if(nextRooms.has(key))throw new Error('Plantas repetidas para o mesmo local.');nextRooms.set(key,layout);
 }
 const footprints=[...nextBuildings.values()];for(let i=0;i<footprints.length;i++)for(let j=i+1;j<footprints.length;j++){const a=footprints[i].bounds,b=footprints[j].bounds;if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)throw new Error('Construções sobrepostas.');}
 if(!nextBuildings.has('arrival'))throw new Error('A recepção inicial precisa ser preservada.');
 if(validateOnly)return {buildings:nextBuildings,rooms:nextRooms};
 catalog=copyData(value);resolved=graph;buildings.clear();rooms.clear();for(const [id,v]of nextBuildings)buildings.set(id,v);for(const [id,v]of nextRooms)rooms.set(id,v);
 for(const listener of listeners)listener();return true;
}
