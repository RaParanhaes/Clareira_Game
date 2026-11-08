import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_SIZE } from '../game/world-scale.mjs';
import { BOUNDARY_WALL_INSET } from '../game/world-boundary.mjs';
const gameRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../game');
const output=process.argv[2]||'logs/20261024-world-boundary-wall-check';
const cornersOnly=process.argv.includes('--corners-only');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const results=[];
try{
 const viewports=cornersOnly?[['desktop',{width:1440,height:900},false]]:
  [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]];
 for(const [name,viewport,mobile] of viewports){
  // Visual fixture intercepts only this isolated browser's inbound snapshots.
  // It never moves a real account, writes the world, or alters server physics.
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(({size,visualForest})=>{
   window.boundaryFixture=null;
   const nativeAdd=WebSocket.prototype.addEventListener;
   WebSocket.prototype.addEventListener=function(type,listener,options){
    if(type!=='message')return nativeAdd.call(this,type,listener,options);
    return nativeAdd.call(this,type,event=>{
     if(!window.boundaryFixture)return listener.call(this,event);
     let message;try{message=JSON.parse(event.data);}catch{return listener.call(this,event);}
     if(message.type==='state'){
      message.players=message.players.map(p=>({...p,...window.boundaryFixture,z:0,vx:0,vy:0,location:'clearing',moving:false}));
      message.resources=[];message.fires=[];message.wildlife=[];
      if(visualForest){
       message.dimensionId='surface';
       message.dimension={...(message.dimension||{}),id:'surface',name:'Bosque das Brasas',theme:'forest'};
       if(message.worldDefinition)message.worldDefinition={...message.worldDefinition,theme:'forest',revision:(message.worldDefinition.revision||0)+1000000};
      }
     }
     return listener.call(this,new MessageEvent('message',{data:JSON.stringify(message)}));
    },options);
   };
  },{size:WORLD_SIZE,visualForest:cornersOnly});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Use the current working-tree client while retaining the shared preview's
  // account and room services. This avoids restarting a service owned elsewhere.
  await page.route('**/dev/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   const relative=decodeURIComponent(pathname.replace(/^\/dev\//,''));
   if(!relative||relative.includes('..')||relative.includes('\\'))return route.continue();
   const extension=path.extname(relative);
   const contentType={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png',
    '.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[extension];
   if(!contentType)return route.continue();
   const file=path.resolve(gameRoot,relative);
   if(!file.startsWith(`${gameRoot}${path.sep}`))return route.continue();
   try{return await route.fulfill({status:200,contentType,body:await readFile(file)});}
   catch(error){if(error.code==='ENOENT')return route.continue();throw error;}
  });
  await page.route('**/dev/update-version**',route=>route.fulfill({json:{version:'world-boundary-review'}}));
  await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
  await page.locator('#guest-form button[type=submit]').click();
  await page.waitForSelector('.shell.is-authenticated');
  await page.evaluate(async()=>{window.inspectWorld=(await import('/dev/main.js')).inspectMovement});
  await page.waitForFunction(()=>window.inspectWorld().readiness.sceneReady);
  const boundaryPhysics=await page.evaluate(async()=>{
   const [{canOccupy,stepPlayer,PLAYER_RADIUS},{WORLD_SIZE},{BOUNDARY_WALL_INSET,insideBoundaryWall}]=await Promise.all([
    import('/dev/world.mjs'),import('/dev/world-scale.mjs'),import('/dev/world-boundary.mjs')]);
   const specs=[
    {edge:'west',axis:'x',limit:BOUNDARY_WALL_INSET+PLAYER_RADIUS,input:{x:-1,y:0},start:t=>({x:BOUNDARY_WALL_INSET+PLAYER_RADIUS+1.4,y:t})},
    {edge:'east',axis:'x',limit:WORLD_SIZE-BOUNDARY_WALL_INSET-PLAYER_RADIUS,input:{x:1,y:0},start:t=>({x:WORLD_SIZE-BOUNDARY_WALL_INSET-PLAYER_RADIUS-1.4,y:t})},
    {edge:'north',axis:'y',limit:BOUNDARY_WALL_INSET+PLAYER_RADIUS,input:{x:0,y:-1},start:t=>({x:t,y:BOUNDARY_WALL_INSET+PLAYER_RADIUS+1.4})},
    {edge:'south',axis:'y',limit:WORLD_SIZE-BOUNDARY_WALL_INSET-PLAYER_RADIUS,input:{x:0,y:1},start:t=>({x:t,y:WORLD_SIZE-BOUNDARY_WALL_INSET-PLAYER_RADIUS-1.4})},
   ];
   const results=[];
   for(const spec of specs){
    let chosen=null;
    for(let t=512;t<WORLD_SIZE-512&&!chosen;t+=31){
     const start=spec.start(t);let clear=canOccupy(start,PLAYER_RADIUS,0,{ignoreFires:true});
     for(let d=.08;clear&&d<1.4;d+=.08){
      const point={...start,[spec.axis]:start[spec.axis]+Math.sign(spec.limit-start[spec.axis])*d};
      clear=canOccupy(point,PLAYER_RADIUS,0,{ignoreFires:true});
     }
     if(!clear)continue;
     let position=start;
     for(let frame=0;frame<12;frame++)position=stepPlayer(position,spec.input,.05,[],[],Date.now());
     if(insideBoundaryWall(position,PLAYER_RADIUS)&&Math.abs(position[spec.axis]-spec.limit)<.25)
      chosen={edge:spec.edge,position:{x:position.x,y:position.y},wall:spec.limit};
    }
    if(!chosen)throw new Error(`No clear physical approach to ${spec.edge} boundary.`);
    results.push(chosen);
   }
   return results;
  });
  assert.equal(boundaryPhysics.length,4,'shared client physics reaches all four walls without crossing');
  if(cornersOnly)await page.evaluate(()=>{const panel=document.querySelector('#arrival-tutorial');if(panel)panel.hidden=true;});
  if(!cornersOnly){
  const before=await page.evaluate(()=>window.inspectWorld().position);
  if(mobile){
   const box=await page.locator('#world').boundingBox();
   for(const [dx,dy] of [[48,35],[-48,35],[0,65]]){
    await page.touchscreen.tap(box.x+box.width/2+dx,box.y+box.height/2+dy);
    try{await page.waitForFunction(p=>Math.hypot(window.inspectWorld().position.x-p.x,window.inspectWorld().position.y-p.y)>.15,before,{timeout:4000});break;}catch{}
   }
  }
  else{await page.locator('#world').focus();await page.keyboard.down('ArrowRight');await page.waitForTimeout(450);await page.keyboard.up('ArrowRight');}
  await page.waitForTimeout(600);
  const after=await page.evaluate(()=>window.inspectWorld().position);
  assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>.15,'normal live movement');
  await page.screenshot({path:`${output}/${name}-arrival.png`});
  for(const [edge,position] of [['west',{x:BOUNDARY_WALL_INSET+.25,y:5500}],
    ['east',{x:WORLD_SIZE-BOUNDARY_WALL_INSET-.25,y:5500}],
    ['north',{x:5500,y:BOUNDARY_WALL_INSET+.25}],
    ['south',{x:5500,y:WORLD_SIZE-BOUNDARY_WALL_INSET-.25}]]){
   await page.evaluate(p=>window.boundaryFixture=p,position);
   await page.waitForFunction(p=>Math.hypot(window.inspectWorld().position.x-p.x,window.inspectWorld().position.y-p.y)<2,position);
   await page.waitForTimeout(1800);
   await page.screenshot({path:`${output}/${name}-${edge}.png`});
   if(edge==='east'){
    await page.waitForTimeout(1000);await page.screenshot({path:`${output}/${name}-east-later.png`});
   }
   results.push({name,edge,fixture:true,position:await page.evaluate(()=>window.inspectWorld().position),boundaryPhysics});
  }
  }
  for(const [corner,position] of [['nw',{x:.25,y:.25}],['ne',{x:WORLD_SIZE-.25,y:.25}],
    ['sw',{x:.25,y:WORLD_SIZE-.25}],['se',{x:WORLD_SIZE-.25,y:WORLD_SIZE-.25}]] ){
   await page.evaluate(p=>window.boundaryFixture=p,position);
   await page.waitForFunction(p=>Math.hypot(window.inspectWorld().position.x-p.x,window.inspectWorld().position.y-p.y)<2,position);
   await page.waitForTimeout(1800);
   if(cornersOnly)await page.evaluate(()=>{const panel=document.querySelector('#arrival-tutorial');if(panel)panel.style.setProperty('display','none','important');});
   await page.screenshot({path:`${output}/${name}-corner-${corner}.png`});
   results.push({name,corner,fixture:true,position:await page.evaluate(()=>window.inspectWorld().position)});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();}
const report={passed:true,mode:cornersOnly?'corners-only':'movement-and-boundaries',views:results.length,output,results};
await writeFile(`${output}/result.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,mode:report.mode,views:report.views,output}));
