import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {createPreviewServer} from './dev-preview-page.mjs';
import {createDevPreviewBridge} from './dev-preview-bridge.mjs';
import {createPrototypeServer} from './prototype-server.mjs';
const output=process.argv[2]||'logs/20261029-map-design';await mkdir(output,{recursive:true});
const dir=await mkdtemp(path.join(os.tmpdir(),'clareira-map-design-'));
const base='http://127.0.0.1:18974';
const preview=createPreviewServer({port:0,stateDirectory:dir,allowedOrigin:base});
const address=await preview.listen();const bridge=createDevPreviewBridge(address,{port:18974});
const room=createPrototypeServer({port:18975,stateDirectory:dir,allowedOrigin:base});await bridge.listen();await room.listen();
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
let page;const errors=[],samples=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const registration=await context.request.post(base+'/auth/guest',{headers:{origin:base}});assert.equal(registration.status(),201);
 const token=registration.headers()['set-cookie'].match(/clareira_session=([^;]+)/)[1];await context.addCookies([{name:'clareira_session',value:token,url:base+'/dev/',httpOnly:true,sameSite:'Strict'}]);
 await context.addInitScript(()=>{Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{controller:{},ready:Promise.resolve({}),register:async()=>({}),addEventListener(){},removeEventListener(){}}});});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 const version=createHash('sha256').update('[]').digest('hex');
 await page.route('**/dev/game-assets',r=>r.fulfill({json:{version,files:[]}}));await page.route('**/dev/update-version',r=>r.fulfill({json:{version}}));
 await page.routeWebSocket('**/dev/room',async socket=>{
  const cookies=await context.cookies(base+'/dev/');const session=cookies.find(c=>c.name==='clareira_session')?.value;
  const upstream=new WebSocket('ws://127.0.0.1:18975/room',{headers:{origin:base,cookie:`clareira_session=${session}`}}),queue=[];
  socket.onMessage(message=>upstream.readyState===WebSocket.OPEN?upstream.send(message):queue.push(message));
  upstream.on('open',()=>queue.forEach(message=>upstream.send(message)));upstream.on('message',message=>{try{socket.send(message.toString())}catch{}});upstream.on('error',e=>errors.push(e.message));socket.onClose(()=>upstream.close());
 });
 await page.goto(base+'/dev/');await page.evaluate(async()=>{window.mapMovement=(await import('/dev/main.js')).inspectMovement});
 await page.waitForFunction(()=>{const s=window.mapMovement();return s.readiness.sceneReady&&!s.readiness.loading&&s.arrivalTutorial},null,{timeout:60000});
 await page.waitForFunction(()=>window.mapMovement().arrivalCinematicAgeMs>4000,null,{timeout:60000});
 // Disposable fixture uses the existing tutorial transition; it never edits a real account.
 await page.locator('#arrival-tutorial-skip').evaluate(button=>button.click());
 await page.waitForFunction(()=>window.mapMovement().dimensionId==='surface'&&document.querySelector('#teleport-travel-overlay').hidden,null,{timeout:60000});
 await page.waitForFunction(()=>{const s=window.mapMovement();return s.readiness.sceneReady&&!s.readiness.loading&&!s.teleport.local&&!s.teleport.active},null,{timeout:60000});
 await page.locator('.mobile-menu-toggle').tap();await page.locator('.dimension-travel summary').tap();await page.locator('#world-map-toggle').tap();
 await page.locator('#world-map-dialog[open]').waitFor();
 const ready=async name=>{const started=Date.now();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.locator('#world-map-canvas[data-detail="ready"]').waitFor({timeout:30000});samples.push({name,readyWaitMs:Date.now()-started});};
 await ready('first-local');await page.screenshot({path:path.join(output,'mobile-exploration.png')});
 await page.locator('#world-map-reveal-all').click();await ready('revealed');await page.screenshot({path:path.join(output,'mobile-local.png')});
 await page.locator('#world-map-search').fill('Fogueira das Brasas');
 await page.locator('#world-map-search-form button').click();
 await page.waitForFunction(()=>document.querySelector('#world-map-place-coords').textContent.includes('células de você'));
 assert.equal(await page.locator('#world-map-go').isEnabled(),true,'a known destination offers walking');
 await page.locator('#world-map-search').fill('');
 await page.locator('#world-map-center-player').click();await ready('center-player');
 // Pan to an actual tree, then inspect its canopy using the normal zoom control.
 const target=await page.evaluate(async()=>{
  const w=await import('/dev/world.mjs'),m=await import('/dev/world-map.mjs'),s=window.mapMovement(),p=s.position;
  const trees=w.getSolidTreesInBounds({left:p.x-32,top:p.y-32,right:p.x+32,bottom:p.y+32});trees.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  const r=document.querySelector('#world-map-canvas').getBoundingClientRect(),bounds={worldSize:w.WORLD_SIZE,width:r.width,height:r.height};
  const t=m.worldMapTransform({...bounds,...m.centerWorldMapOn({zoom:32,panX:0,panY:0},p,bounds)}),screen=m.worldMapToScreen(trees[0],t);
  return{dx:r.width/2-screen.x,dy:r.height/2-screen.y,x:r.x+r.width/2,y:r.y+r.height/2,tree:trees[0]?.id};
 });
 assert.ok(target.tree);await page.mouse.move(target.x,target.y);await page.mouse.down();await page.mouse.move(target.x+target.dx,target.y+target.dy,{steps:8});await page.mouse.up();
 await page.locator('#world-map-zoom-range').focus();await page.keyboard.press('End');await ready('canopies');
 assert.equal(await page.locator('#world-map-zoom-value').textContent(),'256×');await page.screenshot({path:path.join(output,'mobile-canopies.png')});
 const colors=await page.locator('#world-map-canvas').evaluate(c=>{const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data,colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return colors.size});assert.ok(colors>25,`detailed canvas has ${colors} distinct colors`);
 await page.locator('#world-map-reset').click();await page.locator('#world-map-canvas[data-detail="overview"]').waitFor();await page.screenshot({path:path.join(output,'mobile-world.png')});
 await page.locator('#world-map-initial-forest').click();await ready('return-local');
 for(const [name,width,height] of [['landscape',844,390],['desktop',1440,900]]){
  await page.setViewportSize({width,height});await ready(name);await page.screenshot({path:path.join(output,name+'-resized.png')});
  await page.locator('#world-map-initial-forest').click();await ready(name+'-initial-area');await page.screenshot({path:path.join(output,name+'.png')});
  const boxes=await page.evaluate(()=>({canvas:document.querySelector('#world-map-canvas').getBoundingClientRect().toJSON(),sidebar:document.querySelector('.world-map-sidebar').getBoundingClientRect().toJSON()}));
  assert.ok(boxes.canvas.right<=boxes.sidebar.left+1||boxes.canvas.bottom<=boxes.sidebar.top+1,'map and sidebar must not overlap');
 }
 assert.deepEqual(errors,[]);const result={status:'passed',samples,canopyColorCount:colors,errors};await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));await context.close();
}catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(error);if(page)console.error(JSON.stringify(await page.evaluate(()=>({readiness:window.mapMovement?.().readiness,teleport:window.mapMovement?.().teleport,detail:document.querySelector('#world-map-canvas').dataset.detail,notice:document.querySelector('#world-map-status').textContent})).catch(()=>({}))));throw error;}
finally{await browser.close();await bridge.close();await preview.close();await room.close();await rm(dir,{recursive:true,force:true});}
