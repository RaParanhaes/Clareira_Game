// Shared authoring measures. Heights are independent of footprint/collision.
export const BUILDING_STANDARD = Object.freeze({
  version: 3, storeyHeight: 4.3, interiorWallHeight: 4.3, wallThickness: .14,
  foundationHeight: .35, doorWidth: 1.25, doorHeight: 3.6, doorJamb: .08,
  windowWidth: 1.2, windowBottom: 1.05, windowTop: 2.85,
  eave: .22, roofThickness: .12, counterHeight: 1.45,
  entranceClearHalfWidth: 1.2, entranceClearDepth: 1.25,
});
export const FIXTURE_HEIGHTS = Object.freeze({
  bed: 1.1, shower:2.65, nightstand: 1.05, wardrobe: 3, bookshelf: 2.9,
  desk: 1.5, table: 1.5, chair: 2.2, sofa: 1.9, chest: 1,
  fireplace: 2.8, plant: 1.9,
});
export function fixtureBounds(item) {
  const rotate=item.rotatable&&Math.abs(item.rotation||0)%2===1,width=rotate?item.depth:item.width,depth=rotate?item.width:item.depth;
  return {left:item.x-width/2,right:item.x+width/2,
    top:item.y-depth/2,bottom:item.y+depth/2};
}
export function roofGeometry(building) {
  const b=building.bounds,e=building.roofEave??BUILDING_STANDARD.eave,h=building.height,
    rise=building.roofRise,axis=building.roofAxis||'y',hipped=building.roofForm==='hipped';
  const x1=b.left-e,x2=b.right+e,y1=b.top-e,y2=b.bottom+e;
  const a=[x1,y1,h],c=[x2,y1,h],d=[x2,y2,h],f=[x1,y2,h];
  if(axis==='x'){
    const mid=(y1+y2)/2,back=[x1,mid,h+rise],front=[x2,mid,h+rise];
    return {planes:[[a,c,front,back],[back,front,d,f],...(hipped?[[a,back,f],[c,d,front]]:[])],
      gables:hipped?[]:[[[b.right,b.top,h],[b.right,mid,h+rise],[b.right,b.bottom,h]]],
      ridge:[back,front],eaves:[[a,c],[f,d]],fascia:[[c,front],[front,d],[f,d],...(hipped?[[a,back],[back,f]]:[])]};
  }
  const mid=(x1+x2)/2,back=[mid,y1,h+rise],front=[mid,y2,h+rise];
  return {planes:[[a,back,front,f],[back,c,d,front],...(hipped?[[a,back,c],[f,front,d]]:[])],
    gables:hipped?[]:[[[b.left,b.bottom,h],[mid,b.bottom,h+rise],[b.right,b.bottom,h]]],
    ridge:[back,front],eaves:[[a,f],[c,d]],fascia:[[f,front],[front,d],[c,d],...(hipped?[[a,back],[back,c]]:[])]};
}

export function roomWallDecor(layout) {
  if(layout.wallDecorObjects)return layout.wallDecorObjects;
  const b=layout.bounds,zToY=4/3;
  // Compare projected bounds as well as the floor plan. A tall cabinet farther
  // into the room shifts left on screen and can hide an adjacent wall opening.
  const occupied=(layout.fixtures||[]).map(item=>{
    const r=fixtureBounds(item),height=item.height+(item.kind==='bed'?.85:0);
    return {left:r.left-r.bottom-.08,right:r.right-r.top+.08,
      top:r.left+r.top-height*zToY,bottom:r.right+r.bottom};
  });
  const projection=(x,width,bottom,top)=>({left:x-width/2-b.top,right:x+width/2-b.top,
    top:x-width/2+b.top-top*zToY,bottom:x+width/2+b.top-bottom*zToY});
  const intersects=(a,c)=>a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top;
  const slot=(width,bottom,top)=>{
    for(let x=b.right-.22-width/2;x>=b.left+.22+width/2;x-=.12)
      if(!occupied.some(rect=>intersects(projection(x,width,bottom,top),rect)))return x;
    return null;
  };
  let window=null;
  for(const [bottom,top] of [[1.05,2.85],[3.35,4]]){
    for(const width of [1,.8,.65]){
      const x=slot(width*1.6,bottom,top);
      if(x!==null){window={x,width,bottom,top};occupied.push(projection(x,width*1.8,bottom,top));break;}
    }
    if(window)break;
  }
  const artWidth=Math.min(1.35,(b.right-b.left)*.18),artX=slot(artWidth+.2,1.38,2.3);
  return {window,artX,artWidth};
}
