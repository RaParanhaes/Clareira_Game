// Keep most of the original material color: light must not replace dark clothes
// with an almost solid pastel silhouette. Source-atop preserves sprite alpha.
export function avatarLightTintOpacity(amount){
  return Number.isFinite(amount)?Math.max(0,Math.min(.24,amount*.22)):0;
}
// Apply light only to pixels already occupied by the actor. Transparent atlas
// margins must stay transparent, and the result is drawn in normal depth order.
export function applyAvatarSurfaceLight(context,width,height,samples){
  const glow=context.createLinearGradient(0,4,0,Math.min(height,84));
  for(const sample of [...samples].sort((a,b)=>b.height-a.height)){
    const rgb=[1,3,5].map(offset=>parseInt(sample.color.slice(offset,offset+2),16));
    glow.addColorStop(Math.max(0,Math.min(1,1-(sample.fraction??sample.height/1.8))),`rgba(${rgb.join(',')},${avatarLightTintOpacity(sample.amount)})`);
  }
  context.save();context.globalCompositeOperation='source-atop';context.fillStyle=glow;context.fillRect(0,0,width,height);context.restore();
}
