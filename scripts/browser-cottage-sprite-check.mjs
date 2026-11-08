import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2]||'logs/cottage-3d-browser');
await fs.mkdir(output,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><style>body{margin:0;background:#253238}</style>');return;}
    const file=path.resolve(root,url.slice(1));if(!file.startsWith(`${root}${path.sep}`))throw new Error('outside project');
    res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1040,height:460}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result=await page.evaluate(async()=>{
    const [{drawBuildingExterior,drawBuildingPost,drawBuildingCanopy,setCottageExteriorSprites},{VILLAGE_BUILDINGS},{buildingArchitecture},depth,{compareSceneDepth},{drawCanvasAvatar}]=await Promise.all([
      import('/game/building-renderer.mjs'),import('/game/village-buildings.mjs'),import('/game/architectural-elements.mjs'),import('/game/building-depth.mjs'),import('/game/depth-order.mjs'),import('/game/canvas-avatar.mjs')]);
    const load=async name=>{const image=new Image();image.src='/game/art/buildings/medieval-cottage-3d/frames/'+name+'.png';await image.decode();return image;};
    const [day,night,canopy,postLeft,postRight]=await Promise.all(['iso-rot0-shell','iso-rot0-shell-night','iso-rot0-canopy','iso-rot0-post-left','iso-rot0-post-right'].map(load));
    setCottageExteriorSprites({day,night,canopy,postLeft,postRight});
    const building=VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-one'),architecture=buildingArchitecture(building);
    const canvas=document.createElement('canvas');canvas.width=1040;canvas.height=900;document.body.append(canvas);
    const ctx=canvas.getContext('2d'),orders=[];
    window.renderCottageProof=(mobile=false)=>{
      canvas.width=mobile?390:1040;canvas.height=mobile?780:900;
      ctx.imageSmoothingEnabled=false;ctx.fillStyle='#26343a';ctx.fillRect(0,0,canvas.width,canvas.height);
      const panels=mobile?[{x:0,y:0,lit:false,label:'CABANA · DIA'},{x:0,y:380,lit:true,label:'CABANA · NOITE'}]:[
        {x:0,y:0,lit:false,label:'DIA · CAMADAS BLENDER'},{x:520,y:0,lit:true,label:'NOITE · JANELA'},
        {x:0,y:450,actor:'behind',label:'PERSONAGEM ATRÁS DO PILAR'},{x:520,y:450,actor:'ahead',label:'PERSONAGEM À FRENTE DO PILAR'}];
      for(const panel of panels){
        const scale=mobile?1.10:1.5,mid=mobile?195:260,baseY=mobile?278:318;
        ctx.fillStyle='#e8d9b6';ctx.font='bold 14px sans-serif';ctx.fillText(panel.label,panel.x+18,panel.y+28);
        const cx=(building.bounds.left+building.bounds.right)/2,cy=(building.bounds.top+building.bounds.bottom)/2;
        const project=(x,y,z=0)=>({x:panel.x+mid+(x-cx-y+cy)*16*scale,y:panel.y+baseY+((x-cx)+(y-cy))*8*scale-z*12*scale});
        const things=[{type:'shell',...depth.buildingRenderDepthAnchor(building)},
          ...architecture.posts.map((post,i)=>({type:'post'+i,post,...depth.buildingPostDepthAnchor(post)})),
          {type:'canopy',...depth.buildingCanopyDepthAnchor(architecture.canopy)}];
        if(panel.actor){
          const post=architecture.posts[1],actor={type:'player',x:(post.left+post.right)/2,y:panel.actor==='behind'?post.top-.35:post.bottom+.35};
          Object.assign(actor,depth.buildingExteriorAvatarDepthAnchor(actor,building));things.push(actor);
        }
        things.sort(compareSceneDepth);orders.push({label:panel.label,order:things.map(t=>t.type)});
        for(const item of things){
          if(item.type==='shell')drawBuildingExterior(ctx,building,project,()=>{},scale,{windowsLit:panel.lit});
          else if(item.post)drawBuildingPost(ctx,building,item.post,project,()=>{});
          else if(item.type==='canopy')drawBuildingCanopy(ctx,building,project,()=>{},scale);
          else {const p=project(item.x,item.y);drawCanvasAvatar(ctx,p.x,p.y,{direction:0,action:'idle',reducedMotion:true},{outfitId:'commoner'},{scale:scale*.72});}
        }
      }
    };
    window.renderCottageProof();
    return {building:building.id,frameSize:[day.naturalWidth,day.naturalHeight],layersLoaded:[day,night,canopy,postLeft,postRight].every(i=>i.complete&&i.naturalWidth===320),orders};
  });
  assert.equal(result.building,'cabin-cedar-one');assert.ok(result.layersLoaded);assert.deepEqual(result.frameSize,[320,320]);assert.deepEqual(errors,[]);
  const behind=result.orders.find(o=>o.label.includes('ATRÁS')).order,ahead=result.orders.find(o=>o.label.includes('À FRENTE')).order;
  assert.ok(behind.indexOf('player')<behind.indexOf('post1'));assert.ok(ahead.indexOf('player')>ahead.indexOf('post1'));
  await page.setViewportSize({width:1040,height:900});
  await page.screenshot({path:path.join(output,'canvas-day-night-depth-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.renderCottageProof(true));
  await page.screenshot({path:path.join(output,'canvas-day-night-mobile.png')});
  await fs.writeFile(path.join(output,'canvas-integration-result.json'),JSON.stringify({...result,browser:'Chromium Canvas 2D',errors},null,2)+'\n');
  console.log(JSON.stringify({...result,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
