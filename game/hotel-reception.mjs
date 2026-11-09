import {medievalFurnitureById} from './medieval-furniture.mjs';

// Fixed public-room authoring. Use the canonical dimensions baked into each
// 3D/UV sprite: resizing a collider cannot resize an already rendered atlas.
// Footprints and heights are the dimensions the sprite was rendered with
// (art/room-furniture/medieval-3d-v1/catalog.json). The generic family sizes in
// medieval-furniture.mjs differ from what the player sees, so these pieces
// use the baked record instead.
export const HOTEL_BAKED_DIMENSIONS=Object.freeze({
  'furniture.medieval-cadeiras-02':Object.freeze({width:.81,depth:.66,height:2.02}),
  'furniture.medieval-candelabros-02':Object.freeze({width:.95,depth:.78,height:1.69}),
  'furniture.medieval-mesas-03':Object.freeze({width:1.4,depth:1.12,height:1.4}),
  'furniture.medieval-sofas-02':Object.freeze({width:1.96,depth:.87,height:1.65}),
  'furniture.medieval-estantes-02':Object.freeze({width:1.4,depth:.61,height:2.4}),
  'furniture.medieval-baus-03':Object.freeze({width:.99,depth:.75,height:1.05}),
  'furniture.medieval-aparadores-02':Object.freeze({width:1.46,depth:.6,height:1.17}),
});
const piece=(family,number,x,y,rotation=0)=>{
  const catalogId=`furniture.medieval-${family}-${String(number).padStart(2,'0')}`;
  const definition=medievalFurnitureById(catalogId);
  const baked=HOTEL_BAKED_DIMENSIONS[catalogId]||{};
  return Object.freeze({...definition,...baked,kind:definition.renderKind,x,y,rotation,rotatable:true,enabled:true,...(definition.light?{light:{...definition.light,nx:0,ny:0}}:{})});
};
// Decorative objects resting on the lounge tables. They are drawn above the
// table sprite and carry no gameplay: nothing is stored or served on them.
const LOUNGE_TABLE_PROPS=Object.freeze([
  Object.freeze({kind:'book',dx:-.35,dy:-.15,h:0,color:'#7a3e2e'}),
  Object.freeze({kind:'jar',dx:.3,dy:.2,h:0}),
  Object.freeze({kind:'book',dx:.05,dy:-.3,h:.08,color:'#3e5b4f'}),
]);
const withSurfaceProps=(item,surfaceProps)=>Object.freeze({...item,surfaceProps});
export const HOTEL_RECEPTION_FIXTURES=Object.freeze([
  piece('cadeiras',2,6.5,6.8,1),
  piece('cadeiras',2,6.5,7.8,1),
  piece('candelabros',2,2.3,5.3),
  piece('candelabros',2,13.7,6.4),
  withSurfaceProps(piece('mesas',3,4.8,7.3),LOUNGE_TABLE_PROPS),
  withSurfaceProps(piece('mesas',3,11.6,7.3),LOUNGE_TABLE_PROPS),
  Object.freeze({kind:'plant',x:2.25,y:3.3,width:.7,depth:.7,height:1.9,palette:'pine'}),
  Object.freeze({kind:'plant',x:14,y:3.3,width:.7,depth:.7,height:1.9,palette:'pine'}),
  piece('sofas',2,2.9,7.3,3),
  piece('sofas',2,11.6,9.2,2),
  Object.freeze({kind:'fireplace',x:4.2,y:3.05,width:1.35,depth:.7,height:2.8,palette:'hotel'}),
  piece('estantes',2,10.9,3.05),
  piece('baus',3,2.4,8.9),
  piece('baus',3,13.7,8.7),
  piece('cadeiras',2,8,3.4),
  piece('estantes',2,6.1,3.05),
  // A third plant fills the top-right wall between the shelf and the corner plant
  // without touching the waiting-area waypoints checked by the reception tests.
  Object.freeze({kind:'plant',x:12.4,y:3.3,width:.7,depth:.7,height:1.9,palette:'pine'}),
].map((item,index)=>Object.freeze({...item,id:`hotel-reception-${index}`})));
const sideboard={...medievalFurnitureById('furniture.medieval-aparadores-02'),...HOTEL_BAKED_DIMENSIONS['furniture.medieval-aparadores-02']};
export const HOTEL_RECEPTION_COUNTER=Object.freeze({
  left:8-sideboard.width*1.5,right:8+sideboard.width*1.5,
  top:4.9-sideboard.depth/2,bottom:4.9+sideboard.depth/2,
  height:sideboard.height,surfaceModel:sideboard.id,surfaceCount:3,
});
