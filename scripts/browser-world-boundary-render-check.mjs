import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_SIZE } from '../game/world-scale.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../game');
const output=process.argv[2]||'logs/20261026-world-boundary-corners-render';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await page.route('http://boundary-render.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><canvas id="world" width="1440" height="900"></canvas>'});
    const relative=url.pathname.replace(/^\/game\//,'');
    if(!['world-boundary.mjs','world-scale.mjs','world-chunks.mjs'].includes(relative))return route.abort();
    return route.fulfill({contentType:'text/javascript; charset=utf-8',body:await readFile(path.join(root,relative))});
  });
  await page.goto('http://boundary-render.test/');
  const rendered=await page.evaluate(async size=>{
    const {drawWorldBoundary,boundaryGlowPulse}=await import('/game/world-boundary.mjs');
    const canvas=document.querySelector('#world'),ctx=canvas.getContext('2d'),tile=1.5;
    const palette=['#264c3e','#2c5544','#315b49','#294f41','#345e4b'];
    const corners=[
      {name:'northwest',x:0,y:0,sx:-1,sy:-1,id:0},
      {name:'northeast',x:size,y:0,sx:1,sy:-1,id:1},
      {name:'southwest',x:0,y:size,sx:-1,sy:1,id:2},
      {name:'southeast',x:size,y:size,sx:1,sy:1,id:3},
    ];
    const views=[];
    for(const corner of corners){
      const edges=corner.id===0?[0,2]:corner.id===1?[1,2]:corner.id===2?[0,3]:[1,3];
      let time=0,score=-1;
      for(let frame=0;frame<=600;frame++){
        const candidate=frame*.1;
        const value=[...edges.flatMap(edge=>Array.from({length:8},(_,index)=>boundaryGlowPulse(candidate,edge*981+index*719))),
          boundaryGlowPulse(candidate,corner.id*71783+1907)].reduce((sum,pulse)=>sum+pulse,0);
        if(value>score){time=candidate;score=value;}
      }
      ctx.fillStyle='#10241f';ctx.fillRect(0,0,canvas.width,canvas.height);
      const project=(x,y)=>({x:720+((x-corner.x)-(y-corner.y))*28,y:440+((x-corner.x)+(y-corner.y))*14});
      // A small isometric patch of the playable ground gives the boundary a
      // clear reference for its scale and makes the corner gap easy to see.
      for(let col=0;col<16;col++)for(let row=0;row<16;row++){
        const x0=corner.sx<0?corner.x+col*tile:corner.x-(col+1)*tile;
        const y0=corner.sy<0?corner.y+row*tile:corner.y-(row+1)*tile;
        const points=[[x0,y0],[x0+tile,y0],[x0+tile,y0+tile],[x0,y0+tile]].map(([x,y])=>project(x,y));
        ctx.beginPath();points.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.closePath();
        ctx.fillStyle=palette[(col*3+row*2)%palette.length];ctx.fill();
      }
      const extent=30;
      const bounds={left:corner.sx<0?-extent:size-extent,right:corner.sx<0?extent:size+extent,
        top:corner.sy<0?-extent:size-extent,bottom:corner.sy<0?extent:size+extent};
      drawWorldBoundary(ctx,{bounds,project,time,reducedMotion:false,height:900,scale:1,theme:'forest'});
      ctx.fillStyle='#f2dfae';ctx.font='bold 20px sans-serif';ctx.fillText(`QUINA ${corner.name.toUpperCase()} · CLARÕES SOB O PISO`,32,42);
      views.push({corner:corner.name,score,time});
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
      views.at(-1).image=data;
    }
    return views;
  },WORLD_SIZE);
  for(const view of rendered){
    const image=Buffer.from(view.image.slice(view.image.indexOf(',')+1),'base64');
    await writeFile(path.join(output,`${view.corner}.png`),image);
    delete view.image;
  }
  const report={passed:true,rendered,output};
  await writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await browser.close();}
