// Coalesce superseded motion, preserving optional unchanged metadata. Actions
// and notices never enter this inbox; they keep their ordered delivery path.
export function mergeQueuedState(previous,next){
 if(!previous)return next;
 const sceneFields=['dimensionId','location','roomKey'];
 if(sceneFields.some(key=>Object.hasOwn(next,key)&&Object.hasOwn(previous,key)&&next[key]!==previous[key]))return next;
 const merged={...previous,...next};
 if(Array.isArray(next.players)){
  const known=new Map((previous.players||[]).map(player=>[player.id,player]));
  merged.players=next.players.map(player=>({...known.get(player.id),...player}));
 }
 return merged;
}
