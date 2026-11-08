// Shared fixed-step state: the server and prediction integrate identical motion.
export function locomotion(position,input,dt,speed,groundHeight=0) {
 const scale=input.crouch===true?.42:input.run===true?1.65:1;
 let x=Math.max(-1,Math.min(1,Number(input.x)||0)),y=Math.max(-1,Math.min(1,Number(input.y)||0));
 const length=Math.hypot(x,y);if(length>1){x/=length;y/=length}
 const approach=(value,target,amount)=>value+Math.max(-amount,Math.min(amount,target-value));
 const acceleration=length?speed*10:speed*16;
 const vx=approach(Number(position.vx)||0,x*speed*scale,acceleration*dt),vy=approach(Number(position.vy)||0,y*speed*scale,acceleration*dt);
 const floor=Math.max(0,Number(groundHeight)||0);
 let z=Math.max(floor,Number(position.z)||0),vz=Number(position.vz)||0;
 if(input.jump===true&&!position.jumpHeld&&z===floor&&vz===0&&input.crouch!==true)vz=5.2;
 if(z>floor||vz>0){z+=vz*dt-7*dt*dt;vz-=14*dt;if(z<=floor){z=floor;vz=0}}
 return {vx,vy,z,vz,jumpHeld:input.jump===true,running:input.run===true&&input.crouch!==true&&length>1e-6,crouching:input.crouch===true};
}
export function blendBody(previous={},target={},dt=1/60) {
 const channels=[
  ['sit',target.sitting===true,.55],['crouch',target.crouching===true,.24],
  ['run',target.running===true,.18],['reach',target.gathering===true,.25],
  ['wave',target.gesture==='wave',.22],['dance',target.gesture==='dance',.25],
  ['offer',target.gesture==='offer',.25],
 ];
 const elapsed=Math.max(0,Number(dt)||0),result={};
 for(const [name,active,duration] of channels){
  const end=active?1:0,start=Math.max(0,Math.min(1,Number(previous[name])||0));
  let velocity=Number(previous[`${name}Velocity`])||0;
  const delta=end-start;
  if(elapsed===0||delta===0){result[name]=start;result[`${name}Velocity`]=delta===0?0:velocity;continue;}
  // A reversed input cancels the old direction first, so sit/stand never overshoot.
  if(velocity*delta<0)velocity=0;
  const omega=5.5/duration,offset=start-end,tangent=velocity+omega*offset,decay=Math.exp(-omega*elapsed);
  let value=end+(offset+tangent*elapsed)*decay;
  let nextVelocity=(velocity-omega*tangent*elapsed)*decay;
  value=Math.max(0,Math.min(1,value));
  if(Math.abs(end-value)<.001&&Math.abs(nextVelocity)<.01){value=end;nextVelocity=0;}
  else if(value===0||value===1)nextVelocity=0;
  result[name]=value;result[`${name}Velocity`]=nextVelocity;
 }
 return result;
}
