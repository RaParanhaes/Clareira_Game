// Orthographic basis of the existing Blender camera, after the exporter's
// horizontal mirror. Measured against the .blend with world_to_camera_view.
export const MEDIEVAL_SOURCE_CAMERA=Object.freeze({location:[6,6,9.7],target:[0,0,1.9],orthoScale:7});
const pixelsPerUnit=128/MEDIEVAL_SOURCE_CAMERA.orthoScale;
const horizontal=Math.hypot(6,6),vertical=9.7-1.9,length=Math.hypot(horizontal,vertical);
export const MEDIEVAL_SPRITE_PROJECTION=Object.freeze({
  anchor:Object.freeze({x:64,y:64+1.9*pixelsPerUnit*horizontal/length}),
  canonicalTileX:pixelsPerUnit/Math.SQRT2,
  canonicalTileY:pixelsPerUnit*vertical/length/Math.SQRT2,
  canonicalHeight:pixelsPerUnit*horizontal/length,
});
export function medievalSpriteDestination(position,tileX,tileY){
  const scaleX=tileX/MEDIEVAL_SPRITE_PROJECTION.canonicalTileX;
  const scaleY=tileY/MEDIEVAL_SPRITE_PROJECTION.canonicalTileY;
  return {x:Math.round(position.x-MEDIEVAL_SPRITE_PROJECTION.anchor.x*scaleX),
    y:Math.round(position.y-MEDIEVAL_SPRITE_PROJECTION.anchor.y*scaleY),
    width:Math.round(128*scaleX),height:Math.round(128*scaleY)};
}
