// Visual-only footway for the reception layout in the current village.
// It never participates in procedural tree/resource placement or collision.
// Disable it if the saved reception is moved; the route then needs replanning.
export function isReceptionFootway(x,y,building){
 if(!building?.door || !building?.bounds || building.door.enabled===false)return false;
 if(Math.abs(building.door.x-83.2)>.01 || Math.abs(building.bounds.bottom-95.05)>.01)return false;
 const segments=[[83.2,96.85,84.5,97.5],[84.5,97.5,87.75,97.5],[87.75,97.5,88,99]];
 for(const [ax,ay,bx,by] of segments){
  if(x<Math.min(ax,bx)-.62||x>Math.max(ax,bx)+.62||y<Math.min(ay,by)-.62||y>Math.max(ay,by)+.62)continue;
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  if(Math.hypot(x-ax-t*dx,y-ay-t*dy)<=.62)return true;
 }
 return false;
}
