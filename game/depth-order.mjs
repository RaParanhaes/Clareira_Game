const actorPriority=thing=>['player','self'].includes(thing?.type)?1:0;
const stableId=thing=>String(thing?.sortId??thing?.id??thing?.item?.id??thing?.player?.id??thing?.animal?.id??thing?.type??'');

export function compareSceneDepth(a,b){
 const aDepth=(a.sortX??a.x)+(a.sortY??a.y)+(a.sortDepthOffset||0),bDepth=(b.sortX??b.x)+(b.sortY??b.y)+(b.sortDepthOffset||0);
 if(aDepth!==bDepth)return aDepth-bDepth;
 const aLevel=a.sortZ??a.item?.baseZ??0,bLevel=b.sortZ??b.item?.baseZ??0;
 if(aLevel!==bLevel)return aLevel-bLevel;
 const priority=actorPriority(a)-actorPriority(b);
 if(priority)return priority;
 const left=stableId(a),right=stableId(b);
 return left<right?-1:left>right?1:0;
}
