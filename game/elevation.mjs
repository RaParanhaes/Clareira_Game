import {naturalHeight} from './natural-terrain.mjs';
// Authored walkable surfaces. Height is deterministic on both client and server.
export const HEIGHT_PIXELS = 12;
export const ROOM_LEVEL = {left:4.5,right:11.5,top:4.5,bottom:7,height:2};
export const WORLD_LEVEL = {left:16,right:22,top:11,bottom:16,height:2};
export function surfaceHeight(x,y,location='clearing',roomLayout=null) {
  if(location==='room') {
    if(roomLayout?.elevation==='flat') return 0;
    if(x>=4.5&&x<=11.5&&y>=4.5&&y<=7) return 2;
    // Eight shallow treads, plus a continuous accessible incline alongside them.
    if(x>=7&&x<=9&&y>7&&y<9) return Math.floor((9-y)*4+1e-7)/4;
    if(x>9&&x<=11.5&&y>7&&y<10) return (10-y)*2/3;
  }
  return location==='clearing'?naturalHeight(x,y):0;
}
export function canTraverseSurface(from,to,location='clearing',roomLayout=null) {
  const distance=Math.hypot(to.x-from.x,to.y-from.y);
  const count=Math.max(1,Math.ceil(distance/.04));
  let previous=surfaceHeight(from.x,from.y,location,roomLayout);
  for(let i=1;i<=count;i++) {
    const height=surfaceHeight(from.x+(to.x-from.x)*i/count,from.y+(to.y-from.y)*i/count,location,roomLayout);
    if(Math.abs(height-previous)>.251) return false;
    previous=height;
  }
  return true;
}
