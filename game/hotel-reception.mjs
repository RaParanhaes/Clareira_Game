import {medievalFurnitureById} from './medieval-furniture.mjs';

// Fixed public-room authoring. Use the canonical dimensions baked into each
// 3D/UV sprite: resizing a collider cannot resize an already rendered atlas.
const piece=(family,number,x,y,rotation=0)=>{
  const definition=medievalFurnitureById(`furniture.medieval-${family}-${String(number).padStart(2,'0')}`);
  return Object.freeze({...definition,kind:definition.renderKind,x,y,rotation,rotatable:true,enabled:true,...(definition.light?{light:{...definition.light,nx:0,ny:0}}:{})});
};
export const HOTEL_RECEPTION_FIXTURES=Object.freeze([
  piece('cadeiras',2,6.5,6.8,1),
  piece('cadeiras',2,6.5,7.8,1),
  piece('candelabros',2,2.3,5.3),
  piece('candelabros',2,13.7,6.4),
  piece('mesas',3,4.8,7.3),
  piece('mesas',3,11.6,7.3),
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
].map((item,index)=>Object.freeze({...item,id:`hotel-reception-${index}`})));
const sideboard=medievalFurnitureById('furniture.medieval-aparadores-02');
export const HOTEL_RECEPTION_COUNTER=Object.freeze({
  left:8-sideboard.width*1.5,right:8+sideboard.width*1.5,
  top:4.9-sideboard.depth/2,bottom:4.9+sideboard.depth/2,
  height:sideboard.height,surfaceModel:sideboard.id,surfaceCount:3,
});
