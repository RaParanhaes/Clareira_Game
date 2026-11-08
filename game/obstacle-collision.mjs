import {contentById} from './content-catalog.mjs';
export const FIRE_RADIUS=contentById('object.fire').physics.radius;
// Feet must clear the log ring before the fire collider stops blocking movement.
export const FIRE_JUMP_CLEARANCE_HEIGHT=.28;
export const FALLEN_TREE_HALF_LENGTH=contentById('object.fallen-tree').physics.halfLength;
export const FALLEN_TREE_RADIUS=contentById('object.fallen-tree').physics.radius;
// The fallen-log renderer uses the same rounded radius for its vertical profile.
export const FALLEN_TREE_HEIGHT=.42;
export function fallenTreeDistance(position,tree){
 const nearestX=Math.max(tree.x-FALLEN_TREE_HALF_LENGTH,Math.min(position.x,tree.x+FALLEN_TREE_HALF_LENGTH));
 return Math.hypot(position.x-nearestX,position.y-tree.y);
}
// New fires may initially surround their builder: permit escape, never deeper entry.
export function canMovePastFires(from,to,fires=[],radius=.25,height=0){
 if(height>=FIRE_JUMP_CLEARANCE_HEIGHT)return true;
 for(const fire of fires){
  const reach=FIRE_RADIUS+radius,distance=Math.hypot(to.x-fire.x,to.y-fire.y);
  if(distance>=reach)continue;
  const previous=Math.hypot(from.x-fire.x,from.y-fire.y);
  if(previous>=reach || distance<=previous+1e-8)return false;
 }
 return true;
}
