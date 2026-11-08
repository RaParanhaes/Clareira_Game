// UVs stay in object space: rotating a fixture never moves its grain or weave.
// One world unit uses 16 material pixels, independently of the sprite scale.
export function fixtureFaceUV(points,item){
  const constant=index=>points.every(point=>Math.abs(point[index]-points[0][index])<1e-6);
  if(constant(4))return points.map(point=>[point[2]*item.width*16,point[3]*item.depth*16]);
  if(constant(3))return points.map(point=>[point[2]*item.width*16,-point[4]*16]);
  if(constant(2))return points.map(point=>[point[3]*item.depth*16,-point[4]*16]);
  return null; // Sloping roofs and foliage retain their authored flat shading.
}

export function fixtureFaceMaterial(color,palette){
  if([palette.fabric,palette.fabricShade,'#e2d6b6','#b6a589','#89795f','#f1e6cd','#d2c5a9','#b4a287'].includes(color))return 'fabric';
  if([palette.wood,palette.light,palette.dark].includes(color))return 'wood';
  if([palette.stone,'#b5c4b6','#738782','#4b5c58'].includes(color))return 'stone';
  if(['#819496','#b6c5bd'].includes(color))return 'metal';
  if(color==='#9bc5bc70')return 'glass';
  if([palette.leaf,'#7d9c62'].includes(color))return 'leaf';
  return null;
}

// CanvasPattern transform: material pixel coordinates -> projected face.
export function fixtureUVTransform(points,uv){
  if(!uv||uv.length<3)return null;
  const [s,t]=uv[0],[x,y]=points[0];
  for(let i=1;i<uv.length-1;i++){
    const du=uv[i][0]-s,dv=uv[i][1]-t,eu=uv[i+1][0]-s,ev=uv[i+1][1]-t;
    const det=du*ev-eu*dv;
    if(Math.abs(det)<1e-6)continue;
    const dx=points[i][0]-x,dy=points[i][1]-y,ex=points[i+1][0]-x,ey=points[i+1][1]-y;
    const a=(dx*ev-ex*dv)/det,b=(dy*ev-ey*dv)/det;
    const c=(ex*du-dx*eu)/det,d=(ey*du-dy*eu)/det;
    if(Math.abs(a*d-b*c)<1e-6)return null;
    return {a,b,c,d,e:x-a*s-c*t,f:y-b*s-d*t};
  }
  return null;
}
