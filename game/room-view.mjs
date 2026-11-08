// Frame the actual room and its landing in the space left by the HUD.
export function roomView(layout,width,height,followTarget=null){
  const b=layout.bounds,mobile=width<600;
  const area={left:mobile?112:184,right:width-16,top:mobile?160:144,bottom:height-(mobile?Math.min(300,height*.34):156)};
  const ratio=9/16,wall=layout.wallHeight||4.3;
  const minX=b.left-b.bottom-.35,maxX=b.right-b.top+.35;
  const minY=(b.left+b.top)*ratio-(wall+(layout.elevation==='raised'?2:0))*.75-.25;
  const maxY=Math.max(b.right+b.bottom,layout.spawn.x+layout.spawn.y+1)*ratio+.3;
  const fitTileX=Math.max(8,Math.min(64,Math.floor(Math.min((area.right-area.left)/(maxX-minX),(area.bottom-area.top)/(maxY-minY))/2)*2));
  const tileX=followTarget
    ? Math.max(8,Math.min(72,Math.round(fitTileX*(mobile?1.8:1.25)/2)*2))
    : fitTileX;
  const difference=(minX+maxX)/2,sum=(minY+maxY)/(2*ratio);
  return {tileX,centerX:(area.left+area.right)/2,centerY:(area.top+area.bottom)/2,
    camera:followTarget?{x:followTarget.x,y:followTarget.y}:{x:(sum+difference)/2,y:(sum-difference)/2}};
}
