/* Offline film compositor. This file is an authoring source, never game JS. */
window.createLoginFilm = function createLoginFilm(images, canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2, duration = 30;
  const W = 1672, H = 941;
  const sine = (time, period, phase=0) => Math.sin(TAU*time/period+phase);
  const clamp = n => Math.max(0,Math.min(1,n));
  const ease = n => { n=clamp(n); return n*n*(3-2*n); };
  const lerp = (a,b,n) => a+(b-a)*n;
  const visible = (time,start,end,fade=.35) => ease((time-start)/fade)*ease((end-time)/fade);
  const pointPath = (points, closed=false) => {
    const path = new Path2D(); path.moveTo(...points[0]);
    for (const point of points.slice(1)) path.lineTo(...point);
    if (closed) path.closePath();
    return path;
  };
  function patch(rect, points, feather=3) {
    const layer=document.createElement('canvas'), mask=document.createElement('canvas');
    layer.width=mask.width=rect[2]; layer.height=mask.height=rect[3];
    const lc=layer.getContext('2d'), mc=mask.getContext('2d');
    lc.drawImage(images.base,rect[0],rect[1],rect[2],rect[3],0,0,rect[2],rect[3]);
    mc.filter=`blur(${feather}px)`;
    mc.fillStyle='white';
    mc.fill(pointPath(points.map(p=>[p[0]-rect[0],p[1]-rect[1]]),true));
    lc.globalCompositeOperation='destination-in';lc.drawImage(mask,0,0);
    return {image:layer,rect};
  }
  function drawPatch(layer, dx=0,dy=0,angle=0,alpha=1,pivot) {
    const [x,y,w,h]=layer.rect;const p=pivot||[x+w/2,y+h];
    ctx.save();ctx.globalAlpha=alpha;
    ctx.translate(p[0]+dx,p[1]+dy);ctx.rotate(angle);
    ctx.drawImage(layer.image,x-p[0],y-p[1]);ctx.restore();
  }
  const foliage=[
    {p:patch([60,0,570,155],[[64,0],[620,0],[612,51],[512,115],[338,99],[207,157],[105,116]],8),phase:.3,dx:1.7,rot:.0020},
    {p:patch([1190,0,482,206],[[1190,0],[1672,0],[1672,170],[1578,115],[1444,162],[1334,110],[1241,130]],7),phase:2.2,dx:1.5,rot:.0021},
    {p:patch([0,662,194,279],[[0,663],[117,673],[159,750],[194,873],[194,941],[0,941]],7),phase:1.4,dx:1.2,rot:.002},
    {p:patch([952,821,350,120],[[954,897],[1020,849],[1087,857],[1142,823],[1212,840],[1297,906],[1297,941],[952,941]],5),phase:3.2,dx:1.4,rot:.002},
    {p:patch([1510,682,162,259],[[1668,684],[1577,707],[1531,780],[1512,897],[1510,941],[1672,941]],6),phase:4.8,dx:1.2,rot:.002},
    {p:patch([1259,729,97,111],[[1281,729],[1324,738],[1352,789],[1341,833],[1280,836],[1259,789]],3),phase:2.5,dx:.65,rot:.003},
  ];
  const waters=[
    patch([192,708,655,233],[[206,738],[274,715],[322,719],[388,763],[443,791],[544,794],[650,827],[758,850],[838,941],[467,941],[369,872],[263,812],[193,776]],5),
    patch([202,643,78,111],[[216,646],[258,645],[264,688],[277,728],[252,749],[214,724],[203,702]],3),
    patch([241,398,85,91],[[253,400],[306,401],[312,447],[326,473],[293,484],[257,470],[242,440]],2),
    patch([311,181,46,80],[[321,181],[341,185],[344,229],[354,244],[343,258],[318,240],[311,220]],2),
    patch([376,272,76,87],[[386,275],[417,272],[419,301],[451,332],[434,354],[397,328],[376,304]],3),
  ];
  const fox=patch([1360,790,158,90],[[1390,799],[1412,814],[1438,810],[1491,818],[1508,845],[1499,865],[1447,871],[1382,853],[1365,832]],3);
  const strum=patch([1183,582,30,29],[[1195,584],[1207,588],[1207,597],[1199,605],[1188,606],[1184,600]],1.2);
  const hand=patch([1090,501,45,49],[[1121,504],[1130,506],[1127,516],[1117,527],[1102,542],[1094,536],[1106,520]],1.1);
  const foreground=patch([960,757,230,184],[[960,844],[1005,800],[1058,764],[1090,780],[1123,807],[1159,812],[1185,872],[1189,941],[960,941]],1.5);
  const rabbitExit=patch([1255,731,126,126],[[1325,732],[1358,753],[1378,790],[1353,828],[1274,850],[1256,813],[1269,782],[1297,760]],2);
  const bridgeOcclusion=document.createElement('canvas');bridgeOcclusion.width=W;bridgeOcclusion.height=H;
  {
    const c=bridgeOcclusion.getContext('2d');c.strokeStyle='white';c.lineWidth=3.2;c.lineCap='round';
    c.stroke(pointPath([[219,377],[254,367],[289,367],[324,373],[357,382],[382,393]]));
    c.stroke(pointPath([[218,384],[254,375],[289,375],[323,382],[357,391],[382,401]]));
    c.lineWidth=5;
    for(const p of [[234,364,388],[268,359,381],[302,360,383],[340,371,394],[374,381,408]]){
      c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(p[0],p[2]);c.stroke();
    }
    c.fillStyle='white';
    c.fill(pointPath([[383,350],[396,331],[412,353],[424,415],[399,443],[375,414]],true));
    c.fill(pointPath([[191,341],[216,341],[221,421],[191,431]],true));
    c.globalCompositeOperation='source-in';c.drawImage(images.base,0,0,W,H);
  }
  const lamps=[ [160,300,44,6,0],[537,608,45,5,1.2],[1096,276,42,10,2.7],
    [1233,256,35,6,4.1],[1504,174,47,5,3.5],[1468,305,36,10,1.3],
    [1599,454,35,6,2],[1375,364,29,5,5.1],[497,542,31,10,3.2] ];
  const windows=[
    {rect:[899,302,29,34],period:15,phase:0.3},
    {rect:[1084,252,27,39],period:10,phase:2.8},
    {rect:[1035,95,18,25],period:15,phase:4.7},
    {rect:[1459,291,23,28],period:10,phase:1.2},
    {rect:[1200,427,25,31],period:6,phase:4.2},
  ];
  const starPoints=[[598,21],[673,37],[747,8],[792,28],[709,63],[546,49],[821,7],[622,57],[575,5]];
  const actorCanvas=document.createElement('canvas');actorCanvas.width=actorCanvas.height=256;
  const actorContext=actorCanvas.getContext('2d');
  function glow(x,y,rx,ry,color,alpha) {
    ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);
    const g=ctx.createRadialGradient(0,0,0,0,0,rx);
    g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(.3,`rgba(${color},${alpha*.48})`);g.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,rx,0,TAU);ctx.fill();ctx.restore();
  }
  function sprite(name,pose,x,y,size,alpha=1,anchor=[128,248],flip=false) {
    const atlas=images[name];
    const a=((pose%8)+8)%8, index=Math.floor(a), blend=a-index;
    // Blend premultiplied poses on transparency before compositing once. This
    // keeps the overlapping torso opaque between poses instead of fading it.
    actorContext.clearRect(0,0,256,256);actorContext.globalCompositeOperation='source-over';
    actorContext.globalAlpha=1-blend;actorContext.drawImage(atlas,index*256,0,256,256,0,0,256,256);
    if(blend>0){actorContext.globalCompositeOperation='lighter';actorContext.globalAlpha=blend;actorContext.drawImage(atlas,((index+1)%8)*256,0,256,256,0,0,256,256);}
    ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);ctx.globalAlpha=alpha;
    ctx.drawImage(actorCanvas,-anchor[0]/256*size,-anchor[1]/256*size,size,size);
    ctx.restore();
  }
  function shadow(x,y,rx,alpha) {glow(x,y,rx,rx*.22,'3,8,17',alpha);}
  function actors(t) {
    const state={dragon:false,rabbit:false,deer:false};
    if(t>=3 && t<8){
      const u=(t-3)/5, alpha=visible(t,3,8,.45);
      const x=lerp(480,725,u),y=137-23*Math.sin(Math.PI*u);
      sprite('dragon',((t-3)/1.25*8),x,y,lerp(103,77,u),alpha,[128,185]);
      state.dragon={x,y,alpha};
    }
    if(t>=9 && t<16){
      let x=1070,y=806,pose=0,hop=0;
      const beats=[{start:10.1,end:11.0,from:[1070,806],to:[1141,773]},
        {start:12.05,end:12.95,from:[1141,773],to:[1210,757]},
        {start:14.3,end:15.25,from:[1210,757],to:[1308,769]}];
      for(let i=0;i<beats.length;i++){
        const beat=beats[i];
        if(t>=beat.end){[x,y]=beat.to;pose=i===0?1:0;}
        else if(t>=beat.start){
          const u=(t-beat.start)/(beat.end-beat.start);x=lerp(beat.from[0],beat.to[0],ease(u));y=lerp(beat.from[1],beat.to[1],u);
          hop=17*Math.sin(Math.PI*u);pose=2+u*5;break;
        }
      }
      if(t<10.1) pose=.15+.25*sine(t,5);
      if(t>11 && t<12.05)pose=1;
      const alpha=visible(t,9,16,.45);
      shadow(x,y,18*(1-hop/50),.38*alpha);
      sprite('rabbit',pose,x,y-hop,86,alpha);
      ctx.drawImage(foreground.image,...foreground.rect);
      ctx.drawImage(rabbitExit.image,...rabbitExit.rect);
      state.rabbit={x,y,hop,alpha};
    }
    if(t>=17 && t<25){
      let x;
      if(t<20.1)x=lerp(211,280,ease((t-17)/3.1));
      else if(t<21.1)x=280;
      else x=lerp(280,397,ease((t-21.1)/3.9));
      const distance=x-211, y=385+.0015*(x-283)**2;
      const alpha=visible(t,17,25,.3);
      shadow(x,y+1,22,.3*alpha);
      sprite('deer',distance/23*8,x,y,67,alpha);
      ctx.drawImage(bridgeOcclusion,0,0);
      state.deer={x,y,alpha,paused:t>=20.1&&t<21.1};
    }
    return state;
  }
  function drawWater(t) {
    for(let index=0;index<waters.length;index++){
      const layer=waters[index], [x,y,w,h]=layer.rect;
      ctx.save();ctx.globalAlpha=.85;
      const band=8;
      for(let row=0;row<h;row+=band){
        const height=Math.min(band,h-row);
        const dx=(index? .55:1.4)*sine(t,5,row*.042+index),dy=index?1.7*sine(t,5,index):.25*sine(t,5,row*.11);
        ctx.drawImage(layer.image,0,row,w,height,x+dx,y+row+dy,w,height);
      }
      ctx.restore();
    }
  }
  function drawLights(t) {
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const [x,y,r,period,phase] of lamps) glow(x,y,r,r,'255,169,69',.055+.035*(1+sine(t,period,phase)));
    ctx.restore();
    for(const {rect:[x,y,w,h],period,phase} of windows){
      const dim=.72*ease((sine(t,period,phase)-.15)/.85);
      ctx.save();ctx.fillStyle=`rgba(4,13,26,${dim})`;
      const columns=2,rows=3,gap=3;
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const pw=(w-gap*(columns+1))/columns,ph=(h-gap*(rows+1))/rows;
        ctx.fillRect(x+gap+col*(pw+gap),y+gap+row*(ph+gap),pw,ph);
      }
      ctx.restore();
    }
  }
  function drawSmoke(t){
    ctx.save();
    for(const [cx,cy,shift] of [[890,153,0],[1543,221,2.1]]){
      for(let i=0;i<9;i++){
        const life=((t/5+i/9+shift)%1+1)%1;
        const fade=Math.sin(Math.PI*life)**2;
        glow(cx+life*15+4*Math.sin(life*8+i),cy-life*58,8+life*13,12+life*15,'118,142,167',.045*fade);
      }
    }
    ctx.restore();
  }
  function drawFire(t){
    const phase=((t/2.5)%1)*4,index=Math.floor(phase),blend=phase-index;
    ctx.save();ctx.globalAlpha=.88*(1-blend);ctx.drawImage(images.fire,index*120,0,120,130,1000,570,120,130);
    ctx.globalAlpha=.88*blend;ctx.drawImage(images.fire,((index+1)%4)*120,0,120,130,1000,570,120,130);ctx.restore();
    const pulse=.06+.018*sine(t,2.5)+.009*sine(t,1.25,1.3);
    ctx.save();ctx.globalCompositeOperation='screen';
    glow(1064,647,108+6*sine(t,2.5),70,'255,144,41',pulse);
    glow(1064,624,32,45,'255,201,91',pulse*.8);ctx.restore();
    for(let i=0;i<11;i++){
      const life=((t/2.5+i/11)%1+1)%1,opacity=Math.sin(Math.PI*life)**2;
      const x=1052+(i*17%30)+Math.sin(life*7+i)*7+life*5,y=626-life*88;
      glow(x,y,2,3,'255,186,76',.55*opacity);
      ctx.fillStyle=`rgba(255,207,117,${.75*opacity})`;ctx.fillRect(x,y,1.2,1.8);
    }
  }
  function drawFireflies(t){
    for(let i=0;i<13;i++){
      const origin=i<7?[1230+(i*53%390),665+(i*29%150)]:[62+(i*67%320),580+(i*43%220)];
      const x=origin[0]+11*sine(t,10,i*1.7),y=origin[1]+6*sine(t,5,i*.8);
      const alpha=Math.pow(Math.max(0,sine(t,6,i*1.13)),4)*.65;
      glow(x,y,4.5,4.5,'207,235,144',alpha*.4);
      ctx.fillStyle=`rgba(222,242,170,${alpha})`;ctx.beginPath();ctx.arc(x,y,1.1,0,TAU);ctx.fill();
    }
    for(let i=0;i<starPoints.length;i++){
      const [x,y]=starPoints[i],a=.12+.4*Math.pow((1+sine(t,6,i))/2,4);
      glow(x,y,3,3,'188,218,255',a*.25);
      ctx.fillStyle=`rgba(217,232,255,${a})`;ctx.fillRect(x,y,1,1);
    }
    if(t>26.6&&t<27.5){
      const u=(t-26.6)/.9,a=Math.sin(Math.PI*u)**2,x=734-u*112,y=23+u*36;
      ctx.save();const g=ctx.createLinearGradient(x,y,x+26,y-8);g.addColorStop(0,`rgba(207,226,255,${a*.65})`);g.addColorStop(1,'rgba(207,226,255,0)');
      ctx.strokeStyle=g;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+26,y-8);ctx.stroke();ctx.restore();
    }
  }
  function render(time){
    const t=((time%duration)+duration)%duration;
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.drawImage(images.base,0,0,W,H);
    drawWater(t);
    for(const item of foliage)drawPatch(item.p,item.dx*sine(t,10,item.phase),.3*sine(t,5,item.phase),item.rot*sine(t,10,item.phase));
    const states=actors(t);
    // A breath in the painted sleeping fox, anchored at the ground contact.
    ctx.save();ctx.translate(1434,869);ctx.scale(1,1+.012*sine(t,5));ctx.drawImage(fox.image,fox.rect[0]-1434,fox.rect[1]-869);ctx.restore();
    drawPatch(strum,.55*sine(t,1.25),.85*sine(t,1.25),.045*sine(t,1.25),1,[1195,593]);
    drawPatch(hand,.35*sine(t,10),.45*sine(t,10),.012*sine(t,10),1,[1097,539]);
    drawLights(t);drawSmoke(t);drawFire(t);drawFireflies(t);
    return {...states,time:t};
  }
  return {render,duration,fps:60};
};
