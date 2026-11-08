// Material patches follow the surface plane, rather than a screen-space noise grid.
export function surfacePatches(corners,columns,rows,palette,stagger=false) {
 const point=(u,v)=>{const top=corners[0].map((n,i)=>n+(corners[1][i]-n)*u),bottom=corners[3].map((n,i)=>n+(corners[2][i]-n)*u);return top.map((n,i)=>Math.round(n+(bottom[i]-n)*v))};
 const patches=[];
 for(let row=0;row<rows;row++)for(let col=-1;col<columns;col++){
  const shift=stagger&&row%2?.5:0,u1=Math.max(0,(col+shift)/columns),u2=Math.min(1,(col+1+shift)/columns);if(u1>=u2)continue;
  const v1=row/rows,v2=(row+1)/rows,color=palette[(row*7+col*3+palette.length*3)%palette.length];
  patches.push({points:[point(u1,v1),point(u2,v1),point(u2,v2),point(u1,v2)],color,edge:[point(u1,v2),point(u2,v2)]});
 }
 return patches;
}
export function drawMaterial(drawPolygon,corners,columns,rows,palette,seam,stagger=false){
 for(const patch of surfacePatches(corners,columns,rows,palette,stagger)){
  drawPolygon(patch.points,patch.color);
  const [a,b]=patch.edge;drawPolygon([a,b,[b[0],b[1]-1],[a[0],a[1]-1]],seam);
 }
}
