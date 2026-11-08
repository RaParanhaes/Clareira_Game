// Screen-space cinematic sky: no world objects, collisions or external assets.
export const ARRIVAL_SKY_DURATION_MS = 7200;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => value * value * (3 - 2 * value);
export function arrivalSkyState(age) {
  const descent = ease(clamp((age - 5100) / 2100));
  return { logo: 1 - ease(clamp((age - 1600) / 1800)), descent,
    opacity: ease(clamp(age / 700)) * (1 - descent), complete: age >= ARRIVAL_SKY_DURATION_MS };
}
const random = index => { const n = Math.sin(index * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export function drawArrivalSky(ctx, width, height, age, reducedMotion = false) {
  const state = arrivalSkyState(age), time = age / 1000;
  ctx.save();ctx.globalAlpha = state.opacity;
  const bg = ctx.createLinearGradient(0,0,0,height);
  bg.addColorStop(0,'#02050d');bg.addColorStop(.55,'#091322');bg.addColorStop(1,'#050a11');
  ctx.fillStyle = bg;ctx.fillRect(0,0,width,height);
  const rise = reducedMotion ? 0 : 35 * ease(clamp(age/1400)) - height * state.descent * .65;
  ctx.translate(0,rise);
  // A sparse field with a faint diagonal dust band, each star on its own clock.
  for(let i=0;i<360;i++){
    const x=random(i*4)*width,y=random(i*4+1)*height*1.2-60;
    const twinkle=reducedMotion?1:.68+.32*Math.sin(time*(.35+random(i+8)) + random(i+2)*6.28);
    const bright=random(i*4+2),size=bright>.97?2:1;
    ctx.globalAlpha=state.opacity*(.22+bright*.68)*twinkle;
    ctx.fillStyle=i%7===0?'#e9cfa4':i%3===0?'#a8c9e2':'#e4eaf0';
    ctx.fillRect(Math.round(x),Math.round(y),size,size);
    if(bright>.985){ctx.globalAlpha*=.3;ctx.fillRect(x-2,y,5,1);ctx.fillRect(x,y-2,1,5);}
  }
  const moonX=width*.76,moonY=height*.21,r=Math.max(15,Math.min(29,width*.025));
  ctx.globalAlpha=state.opacity;
  const halo=ctx.createRadialGradient(moonX,moonY,r*.6,moonX,moonY,r*3.5);
  halo.addColorStop(0,'#abc9e529');halo.addColorStop(1,'#abc9e500');ctx.fillStyle=halo;
  ctx.fillRect(moonX-r*4,moonY-r*4,r*8,r*8);
  ctx.fillStyle='#c6d2cf';ctx.beginPath();ctx.arc(moonX,moonY,r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#91a6aa';
  for(let i=0;i<8;i++){const a=random(i+400)*6.28,d=random(i+420)*r*.75;ctx.beginPath();ctx.arc(moonX+Math.cos(a)*d,moonY+Math.sin(a)*d,2+random(i+430)*3,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#07101c';ctx.beginPath();ctx.arc(moonX+r*.65,moonY-r*.13,r*.97,0,Math.PI*2);ctx.fill();
  // A pair of quiet cloud banks partially veils the stars.
  for(let bank=0;bank<2;bank++){
    const x=width*(bank?.65:.12)+(reducedMotion?0:time*(bank?-2:3)),y=height*(bank?.4:.25);
    ctx.globalAlpha=state.opacity*.35;ctx.fillStyle='#263443';
    ctx.beginPath();ctx.ellipse(x,y,width*.13,13,0,0,Math.PI*2);ctx.ellipse(x+width*.07,y-8,width*.08,16,0,0,Math.PI*2);ctx.ellipse(x-width*.05,y-5,width*.06,12,0,0,Math.PI*2);ctx.fill();
  }
  if(!reducedMotion)for(const [start,x,y] of [[1900,.18,.2],[3900,.62,.32]]){
    const phase=(age-start)/750;if(phase<0||phase>1)continue;
    const headX=width*x+phase*width*.2,headY=height*y+phase*height*.13;
    const tail=ctx.createLinearGradient(headX-70,headY-25,headX,headY);
    tail.addColorStop(0,'#c9e9ff00');tail.addColorStop(1,'#e5f5ff');
    ctx.globalAlpha=state.opacity*Math.sin(phase*Math.PI);ctx.strokeStyle=tail;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(headX-70,headY-25);ctx.lineTo(headX,headY);ctx.stroke();
  }
  ctx.restore();return state;
}
