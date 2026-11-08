import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import WebSocket from 'ws';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createPrototypeServer} from './prototype-server.mjs';
const output=process.argv[2]||'logs/zoom-travel-performance';await mkdir(output,{recursive:true});
const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-zoom-travel-'));
const origin='https://zoom-test.invalid';
const room=createPrototypeServer({port:0,stateDirectory,databaseUrl:null,redisUrl:null,arrivalTutorialEnabled:false,allowedOrigin:origin,
 resolveSession:async()=>({profile:{id:'zoom-travel-probe',displayName:'Teste de fluidez',guest:true}})});
const address=await room.listen();let browser,page;const sockets=[],errors=[],results=[];
try{
 browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true});page=await context.newPage();
 const version=await page.request.get('https://vmi3579939.contaboserver.net/dev/update-version').then(r=>r.json());
 await page.route('**/dev/update-version',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(version)}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('**/dev/room',route=>{
  const socket=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin,cookie:'clareira_session=zoom-travel-probe'}}),pending=[];
  sockets.push(socket);socket.on('open',()=>{for(const m of pending)socket.send(m);pending.length=0;});
  socket.on('message',raw=>route.send(raw.toString()));socket.on('error',e=>errors.push(e.message));
  route.onMessage(m=>socket.readyState===1?socket.send(m):pending.push(m));route.onClose(()=>socket.close());
 });
 await page.goto('https://vmi3579939.contaboserver.net/dev/?profile=1',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#scene-loading',{state:'hidden',timeout:180000});
 await page.locator('#guest-form button[type=submit]').click();
 await page.evaluate(async()=>{window.game=await import('/dev/main.js');});
 await page.waitForFunction(()=>window.game.inspectMovement().readiness.sceneReady,null,{timeout:120000});
 const snapshot=()=>page.evaluate(()=>{const s=window.game.inspectMovement();return {dimension:s.dimensionId,position:s.position,rendered:s.rendered,zoom:s.cameraZoom,assets:s.assetPreparation,retention:s.terrainRetention,readiness:s.readiness,teleport:s.teleport};});
 const save=()=>writeFile(`${output}/result.json`,JSON.stringify({results,errors},null,2));
 for(const [name,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]].filter(([name])=>!process.env.PERFORMANCE_VIEWPORT||process.env.PERFORMANCE_VIEWPORT===name)){
  await page.setViewportSize(viewport);await page.waitForTimeout(1500);
  for(const zoom of [125,70,100,70]){
   await page.evaluate(()=>window.game.inspectPerformance(true));const before=await snapshot();
   await page.locator('#world').focus();await page.keyboard.down('KeyS');
   await page.locator('#camera-zoom').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},zoom);
   const start=Date.now(),samples=[];
   do{await page.waitForTimeout(80);samples.push(await snapshot());}while((samples.at(-1).zoom.requested!==null||Date.now()-start<650)&&Date.now()-start<20000);
   await page.keyboard.up('KeyS');const after=await snapshot();
   results.push({name,action:'zoom',target:zoom,elapsedMs:Date.now()-start,before,after,samples,performance:await page.evaluate(()=>window.game.inspectPerformance())});await save();
   assert.equal(after.zoom.current,zoom);assert.equal(after.zoom.requested,null);
   assert.ok(Math.hypot(after.rendered.x-before.rendered.x,after.rendered.y-before.rendered.y)>.05,'rendered player keeps moving during zoom');
  }
  await page.screenshot({path:`${output}/${name}-zoom70.png`});
  for(const [target,label]of [['breu','Breu'],['surface','Bosque']]){
   const menu=page.locator('.mobile-menu-toggle');
   if(await menu.isVisible()&&await menu.getAttribute('aria-expanded')!=='true')await menu.click();
   await page.evaluate(()=>{document.querySelector('.dimension-travel').open=true;});
   const button=page.locator(`#dimension-destinations button[data-dimension-id="${target}"]`);
   await page.waitForFunction(id=>[...document.querySelectorAll('#dimension-destinations button')].some(b=>b.dataset.dimensionId===id&&!b.disabled),target,{timeout:90000});
   const before=await snapshot(),started=Date.now();await button.click();
   await page.waitForFunction(id=>{const s=window.game.inspectMovement();return s.dimensionId===id&&s.readiness.sceneReady&&!s.readiness.loading&&!s.teleport.active;},target,{timeout:120000});
   const after=await snapshot();results.push({name,action:'travel',target,elapsedMs:Date.now()-started,before,after,performance:await page.evaluate(()=>window.game.inspectPerformance())});await save();
   await page.screenshot({path:`${output}/${name}-${target}.png`});
   assert.equal(after.assets.loads,before.assets.loads,'travel reuses initial decoded scene assets');
  }
 }
 assert.deepEqual(errors,[]);await save();console.log(JSON.stringify({checks:results.length,errors}));
}catch(error){
 const state=await page?.evaluate(()=>window.game?.inspectMovement()).catch(()=>null);
 await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});
 await writeFile(`${output}/failure.json`,JSON.stringify({message:error.message,errors,state},null,2));throw error;
}
finally{await browser?.close();for(const socket of sockets)socket.terminate();await room.close();await rm(stateDirectory,{recursive:true,force:true});}
