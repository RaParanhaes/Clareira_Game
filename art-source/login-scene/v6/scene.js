/* Offline film compositor. This file is an authoring source, never game JS. */
window.createLoginFilm = function createLoginFilm(images, canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2, duration = 360;
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
  const foxFront=patch([1350,840,185,70],[[1351,854],[1382,857],[1410,876],[1448,878],[1472,861],[1504,850],[1534,864],[1533,909],[1350,909]],2.5);
  const musicianFront=patch([1165,535,100,115],[[1185,548],[1198,540],[1217,543],[1226,552],[1236,559],[1248,568],[1259,570],[1263,579],[1245,584],[1236,600],[1243,621],[1254,637],[1241,648],[1174,649],[1168,633],[1172,601],[1172,580]],1.5);
  const planterFront=patch([1100,484,95,76],[[1101,516],[1111,505],[1129,504],[1139,496],[1160,503],[1173,510],[1194,512],[1194,559],[1100,559]],1.5);
  const castleOcclusion=patch([205,22,265,160],[[207,122],[235,119],[264,105],[292,108],[321,89],[330,65],[329,24],[364,25],[368,81],[385,59],[402,78],[424,75],[444,93],[461,121],[455,169],[205,169]],1.2);
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
  const smoothPoint = (time, keys) => {
    for(let i=0;i<keys.length-1;i++) if(time<=keys[i+1][0]){
      const [t0,x0,y0]=keys[i],[t1,x1,y1]=keys[i+1],u=ease((time-t0)/(t1-t0));
      return [lerp(x0,x1,u),lerp(y0,y1,u),u];
    }
    const last=keys.at(-1);return [last[1],last[2],1];
  };
  function rabbitAt(t,variant){
    const start=variant===0?[1035,842]:[1280,828];
    const hops=variant===0
      ? [[38.5,39.6,1060,827],[43,44.1,1090,809],[46,47.2,1114,794],[55,56.1,1148,788],[57,58.2,1194,776],[59.5,60.5,1212,785],[60.7,61.8,1240,802]]
      : [[244,245.2,1248,814],[249,250.2,1210,797],[253,254.2,1190,792],[261,262.2,1150,784],[265,266.2,1110,785],[269,270.2,1072,801]];
    let [x,y]=start,hop=0,pose=.12+.08*sine(t,9,variant*1.3);
    for(const [from,to,tx,ty] of hops){
      if(t>=to){x=tx;y=ty;continue;}
      if(t>=from){const h=(t-from)/(to-from),u=ease(h);x=lerp(x,tx,u);y=lerp(y,ty,u);hop=14*Math.sin(Math.PI*h);pose=2+h*4;}
      break;
    }
    if(hop===0&&((variant===0&&t>=48&&t<54)||(variant===1&&t>=254.2&&t<260)))pose=1;
    return {x,y,hop,pose,flip:variant===1};
  }
  function actors(t) {
    const state={dragon:false,rabbit:false,deer:false,fox:false,traveler:false};
    // First dragon visit: emerges from the castle-side trees, lands on the wide
    // rampart beside the tower, rests for a long time, then leaves to the east.
    if(t>=88&&t<185){
      const flyingIn=t<99.5, landing=t>=99.5&&t<104, resting=t>=104&&t<163, leaving=t>=163;
      let x,y,size,alpha=1,phase='flight';
      if(flyingIn){
        const [px,py,u]=smoothPoint(t,[[88,247,152],[92,284,127],[96,315,98],[99.5,338,70]]);
        x=px;y=py;size=lerp(65,72,ease((t-88)/11));alpha=ease((t-88)/1.5);
        sprite('dragon',Math.max(0,((t-88)/1.05*8)),x,y,size,alpha,[128,185]);
      } else if(landing){
        const u=ease((t-99.5)/4.5);x=338;y=70;size=72;
        sprite('dragonGround',u,x,y,size,1,[128,248]);phase='landing';
      } else if(resting){
        x=338;y=70;size=72;shadow(x+12,y+1,17,.22);
        let pose=1;
        if(t>=118&&t<123)pose=lerp(1,2,ease((t-118)/1.2));
        else if(t>=123&&t<126)pose=2;
        else if(t>=126&&t<129)pose=lerp(2,1,ease((t-126)/1.2));
        else if(t>=135&&t<138)pose=lerp(1,2,ease((t-135)/1.2));
        else if(t>=138&&t<140)pose=2;
        else if(t>=140&&t<142)pose=lerp(2,1,ease((t-140)/.8));
        if(t>=147&&t<149)pose=lerp(2,4,ease((t-147)/.35));
        else if(t>=149&&t<150.5)pose=lerp(4,2,ease((t-149)/.8));
        else if(t>=150.5&&t<152)pose=lerp(2,1,ease((t-150.5)/.8));
        sprite('dragonGround',pose,x,y,size,1,[128,248]);
        if(t>=147&&t<150.5){
          const f=ease((t-147)/.35)*(1-ease((t-149)/.8));
          ctx.save();ctx.globalCompositeOperation='screen';
          glow(x+33,y-32,24,31,'255,129,48',.22*f);glow(x+39,y-46,13,20,'255,194,95',.3*f);
          ctx.restore();
        }
        phase=t>=147&&t<150.5?'breath':'perched';
      } else {
        const [px,py,u]=smoothPoint(t,[[163,338,70],[166,355,51],[171,420,43],[178,675,112],[185,1300,155]]);
        x=px;y=py;size=lerp(72,47,ease((t-163)/22));
        if(t>184)alpha=1-ease(t-184);
        if(t<166)sprite('dragonGround',lerp(.6,0,ease((t-163)/3)),x,y,size,alpha,[128,248]);
        else sprite('dragon',((t-166)/1.05*8),x,y,size,alpha,[128,185]);
        if(t>183){phase='behind east canopy';}
        else phase='departure';
      }
      state.dragon={x,y,size,alpha,phase};
    }
    // A later, distant return takes a different arc and hides behind the left canopy.
    if(t>=298&&t<317){
      const [x,y,u]=smoothPoint(t,[[298,1320,139],[303,1120,102],[308,840,77],[313,550,94],[317,339,138]]);
      const size=lerp(46,82,ease((t-298)/19));
      const alpha=ease((t-298)/1.2)*(1-ease((t-315.5)/1.5));
      sprite('dragon',((t-298)/1.2*8),x,y,size,alpha,[128,185],true);
      state.dragon={x,y,size,alpha,phase:'return'};
    }
    const activeRabbit=(t>=35&&t<62)?rabbitAt(t,0):(t>=242&&t<271)?rabbitAt(t,1):null;
    if(activeRabbit){
      const {x,y,hop,pose,flip}=activeRabbit;
      const alpha=t<62?ease((t-35)/1.2)*(1-ease((t-60.8)/1.2)):ease((t-242)/1.2)*(1-ease((t-269.8)/1.2));
      shadow(x,y,16*(1-hop/48),.32*alpha);
      sprite('rabbit',pose,x,y-hop,86,alpha,[128,248],flip);
      // Restore the original leaves in front of the path so the rabbit enters
      // and leaves through vegetation instead of appearing on top of it.
      ctx.drawImage(foreground.image,...foreground.rect);
      ctx.drawImage(rabbitExit.image,...rabbitExit.rect);
      state.rabbit={x,y,hop,alpha,route:t<62?'A':'B'};
    }
    if(t>=185&&t<214){
      let x;
      if(t<195)x=lerp(211,280,ease((t-185)/10));
      else if(t<198)x=280;
      else if(t<211)x=lerp(280,397,ease((t-198)/13));
      else x=lerp(397,415,ease((t-211)/3));
      const distance=x-211,y=385+.0015*(x-283)**2,alpha=1;
      shadow(x,y+1,20,.27);sprite('deer',distance/23*8,x,y,67,alpha);
      ctx.drawImage(bridgeOcclusion,0,0);
      state.deer={x,y,alpha,paused:t>=195&&t<198};
    }
    // One visitor walks along the rear edge of the square, pauses near a
    // resident, then returns behind the planter. The foreground musician and
    // planter remain in front of the visitor throughout the crossing.
    if(t>=214&&t<242){
      let x,y,walking,flip=false,distance;
      if(t<224){const u=ease((t-214)/10);x=lerp(1138,1247,u);y=lerp(541,550,u);walking=true;distance=x-1138;}
      else if(t<233){x=1247;y=550;walking=false;distance=109;}
      else {const u=ease((t-233)/9);x=lerp(1247,1138,u);y=lerp(550,541,u);walking=true;distance=1247-x;flip=true;}
      const alpha=ease((t-214)/1.5)*(1-ease((t-240.5)/1.5));
      const pose=walking?distance/21*8:2;
      shadow(x,y,17,.23*alpha);
      ctx.save();ctx.translate(x,y);ctx.scale(1,1+.003*sine(t,4.5));ctx.translate(-x,-y);
      sprite('traveler',pose,x,y,112,alpha,[128,248],flip);ctx.restore();
      ctx.drawImage(musicianFront.image,...musicianFront.rect);
      ctx.drawImage(planterFront.image,...planterFront.rect);
      state.traveler={x,y,walking,alpha,flip};
    }
    // The old fox has been cleaned from the plate. Every pose shares one baseline.
    let foxPose=.05+.05*sine(t,12);
    if(t>=223&&t<232){
      if(t<224)foxPose=ease((t-223)/.45);
      else if(t<229)foxPose=lerp(1,2,ease((t-224)/.5));
      else if(t<230)foxPose=lerp(2,1,ease((t-229)/.5));
      else foxPose=lerp(1,0,ease((t-230)/.5));
    }
    if(t>=271&&t<298){
      if(t<274)foxPose=ease((t-271)/.5);
      else if(t<279)foxPose=lerp(1,2,ease((t-274)/.55));
      else if(t<284)foxPose=lerp(3,4,ease((t-279)/.55));
      else if(t<289)foxPose=lerp(4,5,ease((t-284)/.55));
      else foxPose=lerp(5,6,ease((t-289)/.65));
    }
    const foxX=1434,foxY=872,foxScale=160;
    shadow(foxX,foxY-2,36,.3);
    sprite('fox',foxPose,foxX,foxY,foxScale,1,[128,248]);
    ctx.drawImage(foxFront.image,...foxFront.rect);
    state.fox={x:foxX,y:foxY,pose:foxPose};
    if(state.dragon&&t<96)drawPatch(castleOcclusion);
    if(state.dragon&&t>313&&state.dragon.x<620)drawPatch(castleOcclusion);
    // The canopy is a real foreground plane, so departing/returning silhouettes
    // pass behind its leaves instead of fading in open sky.
    if(state.dragon&&state.dragon.x>1160)drawPatch(foliage[1].p);
    return state;
  }
  function drawWater(t) {
    for(let index=0;index<waters.length;index++){
      const layer=waters[index], [x,y,w,h]=layer.rect;
      ctx.save();ctx.globalAlpha=.85;
      const band=7;
      for(let row=0;row<h;row+=band){
        const height=Math.min(band,h-row);
        const dx=(index? .9:2.1)*sine(t,index?12:9,row*.042+index),dy=index?1.25*sine(t,12,index):.5*sine(t,9,row*.11);
        ctx.drawImage(layer.image,0,row,w,height,x+dx,y+row+dy,w,height);
      }
      ctx.restore();
    }
    // Small water highlights travel downstream along the fixed channel.
    // A 36-second cycle returns exactly at the six-minute seam.
    const channel=[[208,746],[276,748],[342,769],[408,793],[498,801],[592,819],[682,847],[760,882],[820,927]];
    const lengths=[];let total=0;
    for(let i=0;i<channel.length-1;i++){
      const a=channel[i],b=channel[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);lengths.push([total,len,a,b]);total+=len;
    }
    ctx.save();ctx.globalCompositeOperation='screen';ctx.lineCap='round';
    for(let i=0;i<16;i++){
      let d=((t/36+i/16)%1)*total,seg=lengths.find(s=>d>=s[0]&&d<s[0]+s[1])||lengths.at(-1);
      const u=(d-seg[0])/seg[1],x=lerp(seg[2][0],seg[3][0],u),y=lerp(seg[2][1],seg[3][1],u);
      const angle=Math.atan2(seg[3][1]-seg[2][1],seg[3][0]-seg[2][0]);
      ctx.globalAlpha=.12+.05*sine(t,18,i);ctx.strokeStyle='#b6e7ef';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.moveTo(x-2*Math.cos(angle),y-2*Math.sin(angle));ctx.lineTo(x+3*Math.cos(angle),y+3*Math.sin(angle));ctx.stroke();
    }
    ctx.restore();
  }
  function drawWindowState(t){
    const off=ease((t-72)/2)*(1-ease((t-178)/2));
    if(off>0){ctx.save();ctx.globalAlpha=off;ctx.drawImage(images.windowOff,1068,231,63,70);ctx.restore();}
    const castleOff=ease((t-276)/2)*(1-ease((t-325)/2));
    if(castleOff>0){ctx.save();ctx.globalAlpha=castleOff;ctx.drawImage(images.castleWindowOff,350,100,32,40);ctx.restore();}
  }
  function drawLights(t) {
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<lamps.length;i++){
      const [x,y,r]=lamps[i],period=[18,24,30,12,45,18,60,15,36][i],phase=[.3,1.2,2.7,4.1,3.5,1.3,2,5.1,3.2][i];
      const slow=sine(t,period,phase),quick=sine(t,period/3,phase*1.7);
      glow(x,y,r,r,'255,169,69',.035+.012*(1+slow)+.004*(1+quick));
    }
    ctx.restore();
  }
  function drawSmoke(t){
    ctx.save();
    for(const [cx,cy,shift] of [[890,153,0],[1543,221,2.1]]){
      for(let i=0;i<7;i++){
        const life=((t/12+i/7+shift)%1+1)%1;
        const fade=Math.sin(Math.PI*life)**2;
        glow(cx+life*12+3*Math.sin(life*6+i),cy-life*42,7+life*10,10+life*12,'118,142,167',.035*fade);
      }
    }
    ctx.restore();
  }
  function drawFire(t){
    const phase=((t/3.6)%1)*4,index=Math.floor(phase),blend=phase-index;
    ctx.save();ctx.globalAlpha=.88*(1-blend);ctx.drawImage(images.fire,index*120,0,120,130,1000,570,120,130);
    ctx.globalAlpha=.88*blend;ctx.drawImage(images.fire,((index+1)%4)*120,0,120,130,1000,570,120,130);ctx.restore();
    const pulse=.055+.008*sine(t,7.2,.4)+.004*sine(t,3.6,1.3)+.003*sine(t,18,2.1);
    ctx.save();ctx.globalCompositeOperation='screen';
    glow(1064,647,102+4*sine(t,18),66,'255,144,41',pulse);
    glow(1064,624,32,45,'255,201,91',pulse*.8);ctx.restore();
    for(let i=0;i<11;i++){
      const life=((t/3.6+i/11)%1+1)%1,opacity=Math.sin(Math.PI*life)**2;
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
    if(t>204&&t<206){
      const u=(t-204)/2,a=Math.sin(Math.PI*u)**2,x=734-u*112,y=23+u*36;
      ctx.save();const g=ctx.createLinearGradient(x,y,x+26,y-8);g.addColorStop(0,`rgba(207,226,255,${a*.65})`);g.addColorStop(1,'rgba(207,226,255,0)');
      ctx.strokeStyle=g;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+26,y-8);ctx.stroke();ctx.restore();
    }
  }
  function render(time){
    const t=((time%duration)+duration)%duration;
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.drawImage(images.base,0,0,W,H);
    drawWindowState(t);
    drawWater(t);
    for(const item of foliage)drawPatch(item.p,item.dx*sine(t,10,item.phase),.3*sine(t,5,item.phase),item.rot*sine(t,10,item.phase));
    const states=actors(t);
    const musician=t%36,play=Math.max(ease(musician/.8),ease((musician-18)/.8)*(1-ease((musician-25)/.8)));
    drawPatch(strum,1.1*sine(t,2.4),1.1*sine(t,2.4,.8),.018*sine(t,2.4),play,[1195,593]);
    const gesture=t%90,gestureA=ease((gesture-34)/2)*(1-ease((gesture-39)/2));
    const gestureB=ease((gesture-74)/2)*(1-ease((gesture-79)/2));
    drawPatch(hand,.45*(gestureA+gestureB)*sine(t,4),.65*(gestureA+gestureB)*sine(t,4,.7),.015*(gestureA+gestureB)*sine(t,5),1,[1097,539]);
    drawLights(t);drawSmoke(t);drawFire(t);drawFireflies(t);
    return {...states,time:t};
  }
  return {render,duration,fps:60};
};
