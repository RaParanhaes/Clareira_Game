import { furnitureByCatalogId,furnitureByKind } from './content-catalog.mjs';
import { objectTemplate } from './object-state.mjs';
import { fixtureBounds } from './building-standard.mjs';
export function furnitureVisual(item){
 const catalogId=item.properties?.catalogId||item.catalogId;
 const definition=catalogId?objectTemplate(catalogId)?.properties||furnitureByCatalogId(catalogId):furnitureByKind(item.kind),model=objectTemplate(catalogId)?.properties||objectTemplate(`furniture.${item.kind}`)?.properties
  ||objectTemplate(`fixture.${item.kind}`)?.properties||{};
 return {...definition,...model,...item,...item.properties,kind:item.kind,
  width:item.properties?.width??item.width??model.width??definition?.width??(item.kind==='stool'?.76:.52),
  depth:item.properties?.depth??item.depth??model.depth??definition?.depth??(item.kind==='stool'?.76:.52),
  height:item.properties?.height??item.height??model.height??definition?.height??1.05,
  palette:item.properties?.palette||item.palette||model.palette||definition?.palette||'cedar',
  rotatable:item.properties?.rotatable??item.rotatable??model.rotatable??true,
 };
}
export function roomFurnitureRadius(item={}){
 const v=furnitureVisual(item),model=objectTemplate(`furniture.${item.kind||'stool'}`)?.properties;
 const physics=v.physics||model?.physics||furnitureByKind(item.kind||'stool')?.physics;
 return physics?.shape==='circle'?(physics.radius??Math.min(v.width,v.depth)*(physics.radiusRatio??1))
  :Math.hypot((physics?.colliderWidth??v.width*(physics?.colliderWidthRatio??1))/2,
    (physics?.colliderDepth??v.depth*(physics?.colliderDepthRatio??1))/2);
}
function collider(item){return furnitureVisual(item).physics?.shape==='circle'?'circle':'box';}
export function roomFurnitureFootprintBounds(item){return fixtureBounds({...furnitureVisual(item),x:item.x,y:item.y});}
export function roomFurnitureColliderBounds(item){
 const visual=furnitureVisual(item),physics=visual.physics||{};
 return fixtureBounds({...visual,width:physics.colliderWidth??visual.width*(physics.colliderWidthRatio??1),
  depth:physics.colliderDepth??visual.depth*(physics.colliderDepthRatio??1),x:item.x,y:item.y});
}
export function roomFurnitureFootprintRadius(item){
 const visual=furnitureVisual(item);return Math.hypot(visual.width/2,visual.depth/2);
}
function bounds(item){return roomFurnitureColliderBounds(item);}
function distanceToBox(position,rect){
 const dx=Math.max(rect.left-position.x,0,position.x-rect.right),dy=Math.max(rect.top-position.y,0,position.y-rect.bottom);
 if(dx||dy)return Math.hypot(dx,dy);
 return -Math.min(position.x-rect.left,rect.right-position.x,position.y-rect.top,rect.bottom-position.y);
}
export function roomFurnitureDistance(position,item){
 return collider(item)==='circle'?Math.hypot(position.x-item.x,position.y-item.y)-roomFurnitureRadius(item)
  :distanceToBox(position,bounds(item));
}
export function roomFurnitureOverlapsPlayer(position,radius,item){return roomFurnitureDistance(position,item)<radius;}
export function roomFurnitureOverlapsRect(item,rect,padding=0){
 if(collider(item)==='circle')return distanceToBox(item,rect)<roomFurnitureRadius(item)+padding;
 const shape=bounds(item);
 return shape.left<rect.right+padding&&shape.right>rect.left-padding
  &&shape.top<rect.bottom+padding&&shape.bottom>rect.top-padding;
}
export function roomFurnitureFootprintsOverlap(a,b,padding=0){
 const ra=roomFurnitureFootprintBounds(a),rb=roomFurnitureFootprintBounds(b);
 return ra.left<rb.right+padding&&ra.right>rb.left-padding
  &&ra.top<rb.bottom+padding&&ra.bottom>rb.top-padding;
}
export function roomFurnitureFootprintOverlapsRect(item,rect,padding=0){
 const shape=roomFurnitureFootprintBounds(item);
 return shape.left<rect.right+padding&&shape.right>rect.left-padding
  &&shape.top<rect.bottom+padding&&shape.bottom>rect.top-padding;
}
export function roomFurnitureOverlaps(a,b,padding=0){
 const aCircle=collider(a)==='circle',bCircle=collider(b)==='circle';
 if(aCircle&&bCircle)return Math.hypot(a.x-b.x,a.y-b.y)<roomFurnitureRadius(a)+roomFurnitureRadius(b)+padding;
 if(aCircle)return distanceToBox(a,bounds(b))<roomFurnitureRadius(a)+padding;
 if(bCircle)return distanceToBox(b,bounds(a))<roomFurnitureRadius(b)+padding;
 const ra=bounds(a),rb=bounds(b);
 return ra.left<rb.right+padding&&ra.right>rb.left-padding&&ra.top<rb.bottom+padding&&ra.bottom>rb.top-padding;
}
export function furnitureUse(item){
 const kind=typeof item==='string'?item:item?.kind,custom=typeof item==='object'&&(item?.properties?.catalogId||item?.catalogId);
 return objectTemplate(custom||`furniture.${kind}`)?.properties.use??furnitureByKind(kind)?.use??null;
}
export function roomFurnitureDepthAnchor(item){
 const visual=furnitureVisual(item),footprint=roomFurnitureFootprintBounds(item);
 if(visual.depthOrder?.anchor!=='footprint-front')return {sortX:item.x,sortY:item.y,sortZ:item.baseZ||0,sortId:item.id||item.kind||''};
 return {sortX:footprint.right,sortY:footprint.bottom,sortZ:item.baseZ||0,sortId:item.id||item.kind||''};
}
export function roomFurnitureDrawLayers(item){
 const visual=furnitureVisual(item);
 if((visual.renderKind||visual.kind)!=='chair')return null;
 const halfDiagonal=(visual.width+visual.depth)/2;
 const anchor=roomFurnitureDepthAnchor(item);
 return [
  {part:'chair-back',sortDepthOffset:-halfDiagonal,sortId:`${anchor.sortId}:back`},
  {part:'chair-front',sortDepthOffset:halfDiagonal,sortId:`${anchor.sortId}:front`},
 ];
}
export function roomFurnitureBedOccupantDepth(item){
 const anchor=roomFurnitureDepthAnchor(item);
 return {...anchor,sortZ:(item.baseZ||0)+.001};
}
