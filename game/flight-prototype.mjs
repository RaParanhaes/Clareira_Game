// Experimental, self-contained flight geometry. World Z is absolute, in world
// units. This module does not grant flight to network players or alter saves.
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function flightCanOccupy(position,body,trees,terrain=()=>0){
 const radius=body.radius,height=body.height;
 if(position.z<terrain(position.x,position.y)-1e-8)return false;
 return !trees.some(tree=>{
  const dx=position.x-tree.x,dy=position.y-tree.y,reach=radius+tree.radius;
  return dx*dx+dy*dy<reach*reach && position.z<tree.topZ-1e-8 && position.z+height>tree.baseZ+1e-8;
 });
}
export function flightStep(state,intent,dt,{trees=[],body={radius:.24,height:1.4},terrain=()=>0,canOccupy=null,speed=2.2,verticalSpeed=2.6,maxStep=.06,profile='controlled',targetZ=null}={}){
 const elapsed=clamp(Number(dt)||0,0,.1),length=Math.hypot(intent.x||0,intent.y||0)||1;
 const vertical=clamp(intent.vertical||0,-1,1),smooth=profile==='smooth';
 const approach=(value,target,amount)=>value+clamp(target-value,-amount,amount);
 // A controlled descent blocked by a canopy must still allow the player to
 // move sideways to find a safe landing spot.
 const horizontalLocked=!smooth&&vertical!==0&&!(vertical<0&&state.blocked&&state.vz===0);
 const acceleration=smooth?3.5:14,verticalAcceleration=smooth?2.2:7;
 let vx=horizontalLocked?0:approach(Number(state.vx)||0,(intent.x||0)/Math.max(1,length)*speed,acceleration*elapsed);
 let vy=horizontalLocked?0:approach(Number(state.vy)||0,(intent.y||0)/Math.max(1,length)*speed,acceleration*elapsed);
 let vz=approach(Number(state.vz)||0,vertical*(smooth?verticalSpeed*.48:verticalSpeed),verticalAcceleration*elapsed);
 const dx=vx*elapsed,dy=vy*elapsed,dz=vz*elapsed;
 const count=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))/Math.max(.01,maxStep)));
 let position={x:state.x,y:state.y,z:state.z},blocked=false;
 for(let i=0;i<count;i++){
  for(const [axis,delta] of [['x',dx/count],['y',dy/count],['z',dz/count]]){
   if(!delta)continue;
   const candidate={...position,[axis]:position[axis]+delta};
   if(axis==='z'){
    candidate.z=Math.max(terrain(candidate.x,candidate.y),candidate.z);
    if(Number.isFinite(targetZ)&&((delta>0&&position.z<=targetZ&&candidate.z>=targetZ)||(delta<0&&position.z>=targetZ&&candidate.z<=targetZ)))candidate.z=targetZ;
   }
   if(flightCanOccupy(candidate,body,trees,terrain)&&(!canOccupy||canOccupy(candidate,position))){
    position=candidate;
    if(axis==='z'&&(candidate.z===targetZ||candidate.z===terrain(candidate.x,candidate.y)))vz=0;
   }else{blocked=true;if(axis==='x')vx=0;else if(axis==='y')vy=0;else vz=0;}
  }
 }
 return {...state,...position,vx,vy,vz,blocked};
}
