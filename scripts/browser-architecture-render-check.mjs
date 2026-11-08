import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'logs/architecture-render-check');
const mime = { '.mjs':'text/javascript', '.js':'text/javascript', '.png':'image/png', '.json':'application/json' };
await fs.mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><style>body{margin:0}</style>'); return; }
    const file = path.resolve(root, pathname.slice(1));
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('path outside project');
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome', headless:true, args:['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport:{width:1500,height:1120}, deviceScaleFactor:1 });
  const errors=[];page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async () => {
    const [{drawBuildingExterior,drawBuildingCanopy,drawBuildingPost},{RECEPTION_BUILDING,VILLAGE_BUILDINGS},
      {buildingArchitecture},{setBuildingMaterialAtlas}] = await Promise.all([
      import('/game/building-renderer.mjs'), import('/game/village-buildings.mjs'),
      import('/game/architectural-elements.mjs'), import('/game/building-materials.mjs')]);
    const image = new Image(); image.src='/game/art/building-materials/architecture-uv-v1.png'; await image.decode(); setBuildingMaterialAtlas(image);
    const buildings=[RECEPTION_BUILDING,...VILLAGE_BUILDINGS.filter(b=>b.kind==='cabin'||b.kind==='inn'||b.kind==='hotel')];
    const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=1120;document.body.append(canvas);
    const ctx=canvas.getContext('2d'), columns=3, cellW=500,cellH=560;
    const paint=(b,index,lit)=>{
      const col=index%columns,row=Math.floor(index/columns), ox=col*cellW,oy=row*cellH;
      ctx.fillStyle='#d8cfad';ctx.font='bold 15px sans-serif';ctx.fillText(`${b.name} · ${b.architectureStyle} · ${b.roofMaterial}`,ox+14,oy+25);
      const scale=Math.min(21,360/((b.bounds.right-b.bounds.left)+(b.bounds.bottom-b.bounds.top)));
      const ox0=ox+cellW/2,oy0=oy+cellH*.64;
      const project=(x,y,z)=>({x:ox0+(x-b.bounds.left-y+b.bounds.top)*scale,y:oy0+((x-b.bounds.left)+(y-b.bounds.top))*scale*.5-z*scale});
      const polygon=(points,color)=>{if(!Array.isArray(points?.[0]))return;ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();ctx.fillStyle=color;ctx.fill();};
      drawBuildingExterior(ctx,b,project,polygon,scale/16,{windowsLit:lit});
      const architecture=buildingArchitecture(b);
      for(const post of architecture.posts)drawBuildingPost(ctx,b,post,project,polygon);
      drawBuildingCanopy(ctx,b,project,polygon,scale/16);
    };
    ctx.fillStyle='#26333a';ctx.fillRect(0,0,canvas.width,canvas.height);
    buildings.forEach((b,i)=>paint(b,i,true));
    const warmup=12,repeats=60;
    const benchCanvas=document.createElement('canvas');benchCanvas.width=1200;benchCanvas.height=900;
    const benchCtx=benchCanvas.getContext('2d');
    const measure=withAtlas=>{
      setBuildingMaterialAtlas(withAtlas?image:null);
      for(let i=0;i<warmup;i++)for(const b of buildings)drawBuildingExterior(benchCtx,b,(x,y,z)=>({x:(x-y)*13,y:(x+y)*7-z*18}),()=>{},1,{windowsLit:false});
      const start=performance.now();
      for(let i=0;i<repeats;i++)for(const b of buildings)drawBuildingExterior(benchCtx,b,(x,y,z)=>({x:(x-y)*13,y:(x+y)*7-z*18}),()=>{},1,{windowsLit:false});
      return (performance.now()-start)/(repeats*buildings.length);
    };
    const uvMs=measure(true),fallbackMs=measure(false);setBuildingMaterialAtlas(image);
    return {count:buildings.length,styles:[...new Set(buildings.map(b=>b.architectureStyle))],roofs:[...new Set(buildings.map(b=>b.roofMaterial))],
      silhouettes:{hipped:buildings.filter(b=>b.roofForm==='hipped').length,dormers:buildings.reduce((n,b)=>n+(b.dormers?.length||0),0),jetties:buildings.filter(b=>b.jettyDepth>0).length,frontWings:buildings.filter(b=>buildingArchitecture(b).frontWing).length},
      uvMsPerBuilding:uvMs,fallbackMsPerBuilding:fallbackMs};
  });
  assert.equal(result.count,7,'the preview covers reception, inn, hotel and all three cabin variants');
  assert.ok(result.styles.includes('timber-daub')&&result.styles.includes('fieldstone'));
  assert.ok(result.roofs.includes('thatch')&&result.roofs.includes('shingles'));
  assert.ok(result.silhouettes.hipped>=1&&result.silhouettes.dormers>=3&&result.silhouettes.jetties>=1&&result.silhouettes.frontWings>=4);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'architecture-contact-sheet.png')});
  await fs.writeFile(path.join(output,'render-metrics.json'),JSON.stringify({...result,browser:'Chromium headless',iterationsPerBuilding:60},null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
