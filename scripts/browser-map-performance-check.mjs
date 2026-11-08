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
const output=process.argv[2]||'logs/20261030-map-performance';await mkdir(output,{recursive:true});
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
 await page.screenshot({path:path.join(output,'mobile-surface-ready.png')});
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.screenshot({path:path.join(output,'desktop-surface-ready.png')});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  window.mapProgressiveTrace=[]; window.mapPerf={phase:'opening',frames:[],last:0}; function sample(t){const p=window.mapPerf;if(p.last && document.visibilityState==='visible')p.frames.push({phase:p.phase,ms:t-p.last});p.last=t;requestAnimationFrame(sample)} requestAnimationFrame(sample);
  const canvas=document.querySelector('#world-map-canvas');
  new MutationObserver(()=>window.mapProgressiveTrace.push({state:canvas.dataset.detail,loaded:Number(canvas.dataset.detailLoaded||0),total:Number(canvas.dataset.detailTotal||0),at:performance.now()})).observe(canvas,{attributes:true,attributeFilter:['data-detail','data-detail-loaded','data-detail-total']});
 });
 await page.locator('.mobile-menu-toggle').tap();await page.locator('.dimension-travel summary').tap();await page.locator('#world-map-toggle').tap();
 const openStarted=Date.now();
 await page.locator('#world-map-dialog[open]').waitFor();
 await page.waitForFunction(()=>window.mapProgressiveTrace.some(p=>p.state==='partial'&&p.loaded>0&&p.loaded<p.total),null,{timeout:30000});
 const firstPartialMs=Date.now()-openStarted;await page.screenshot({path:path.join(output,'mobile-progressive.png')});
 await page.evaluate(()=>window.mapPerf.phase='drag-loading');
 // Interact while preparation is still in flight, not just after it finishes.
 const partialRect=await page.locator('#world-map-canvas').boundingBox();
 await page.mouse.move(partialRect.x+partialRect.width*.6,partialRect.y+partialRect.height*.5);await page.mouse.down();
 await page.mouse.move(partialRect.x+partialRect.width*.47,partialRect.y+partialRect.height*.5,{steps:4});await page.mouse.up();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const duringLoad=await page.locator('#world-map-canvas').evaluate(c=>({state:c.dataset.detail,loaded:Number(c.dataset.detailLoaded),total:Number(c.dataset.detailTotal)}));
 assert.ok(duringLoad.loaded>0,'already drawn regions remain visible during a drag');
 const ready=async name=>{const started=Date.now();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.locator('#world-map-canvas[data-detail="ready"]').waitFor({timeout:30000});samples.push({name,readyWaitMs:Date.now()-started});};
 await ready('partial-pan'); await page.evaluate(()=>window.mapPerf.phase='local-ready');
 await page.locator('#world-map-center-player').click();await ready('first-local');await page.screenshot({path:path.join(output,'mobile-exploration.png')});
 await page.evaluate(()=>window.mapPerf.phase='drag-new-area'); const rect=await page.locator('#world-map-canvas').boundingBox();
 await page.mouse.move(rect.x+rect.width*.70,rect.y+rect.height*.5);await page.mouse.down();
 await page.mouse.move(rect.x+rect.width*.40,rect.y+rect.height*.5,{steps:5});await page.mouse.up();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const afterPan=await page.locator('#world-map-canvas').evaluate(c=>({state:c.dataset.detail,loaded:Number(c.dataset.detailLoaded),total:Number(c.dataset.detailTotal)}));
 assert.ok(afterPan.loaded>0,'cached terrain remains while exploring nearby');
 await page.screenshot({path:path.join(output,'mobile-pan.png')});await ready('pan-complete');
 await page.locator('#world-map-center-player').click();await ready('back-to-player');
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
 await page.evaluate(()=>window.mapPerf.phase='zoom-256'); await page.locator('#world-map-zoom-range').focus();await page.keyboard.press('End');await ready('canopies');
 assert.equal(await page.locator('#world-map-zoom-value').textContent(),'256×');await page.screenshot({path:path.join(output,'mobile-canopies.png')});
 const colors=await page.locator('#world-map-canvas').evaluate(c=>{const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data,colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return colors.size});assert.ok(colors>25,`detailed canvas has ${colors} distinct colors`);
 await page.locator('#world-map-reset').click();await page.locator('#world-map-canvas[data-detail="overview"]').waitFor();await page.screenshot({path:path.join(output,'mobile-world.png')});
 await page.locator('#world-map-initial-forest').click();await ready('return-local');
 for(const [name,width,height] of [['landscape',844,390],['desktop',1440,900]]){
  await page.evaluate(name=>window.mapPerf.phase=name,name); await page.setViewportSize({width,height});await ready(name);await page.screenshot({path:path.join(output,name+'-resized.png')});
  await page.locator('#world-map-initial-forest').click();await ready(name+'-initial-area');await page.screenshot({path:path.join(output,name+'.png')});
  const boxes=await page.evaluate(()=>({canvas:document.querySelector('#world-map-canvas').getBoundingClientRect().toJSON(),sidebar:document.querySelector('.world-map-sidebar').getBoundingClientRect().toJSON()}));
  assert.ok(boxes.canvas.right<=boxes.sidebar.left+1||boxes.canvas.bottom<=boxes.sidebar.top+1,'map and sidebar must not overlap');
 }
 // Exercise a real dimension transition in the disposable server and ensure
 // the forest cache never appears in the dark world's map.
 await page.evaluate(()=>window.mapPerf.phase='dimension-transition'); await page.setViewportSize({width:390,height:844});await page.locator('#world-map-close').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('#dimension-destinations button')].some(b=>b.dataset.dimensionId?.startsWith('arrival-')&&!b.disabled),null,{timeout:30000});
 await page.locator('.mobile-menu-toggle').tap();await page.locator('.dimension-travel summary').tap();
 await page.locator('#dimension-destinations button[data-dimension-id^="arrival-"]').tap();
 await page.waitForFunction(()=>{const s=window.mapMovement();return s.dimensionId.startsWith('arrival-')&&s.readiness.sceneReady&&!s.readiness.loading&&document.querySelector('#teleport-travel-overlay').hidden&&!s.teleport.active},null,{timeout:60000});
 await page.locator('#world-map-toggle').evaluate(button=>button.click());await page.locator('#world-map-dialog[open]').waitFor();await ready('dark-dimension');
 const dark=await page.locator('#world-map-canvas').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let forestPixels=0;for(let i=0;i<p.length;i+=4)if(p[i]===48&&p[i+1]===78&&p[i+2]===59)forestPixels++;return{forestPixels,dimension:document.querySelector('#world-map-dimension').textContent};});
 assert.ok(dark.forestPixels<20,'surface forest terrain must not leak into the dark dimension');
 assert.match(dark.dimension,/Breu/i,'the map must show the new dimension');
 await page.screenshot({path:path.join(output,'dark-dimension.png')});
 assert.deepEqual(errors,[]);const performance=await page.evaluate(()=>{const groups={};for(const f of window.mapPerf.frames)(groups[f.phase]??=[]).push(f.ms);return Object.fromEntries(Object.entries(groups).map(([phase,values])=>{values.sort((a,b)=>a-b);const q=x=>values[Math.min(values.length-1,Math.ceil(values.length*x)-1)];return [phase,{frames:values.length,p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:values.at(-1),over50ms:values.filter(x=>x>50).length,over100ms:values.filter(x=>x>100).length}] }));});const trace=await page.evaluate(()=>window.mapProgressiveTrace);const result={status:'passed',performance,firstPartialMs,duringLoad,afterPan,dark,samples,canopyColorCount:colors,trace,errors};await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));await context.close();
}catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});console.error(error);if(page)console.error(JSON.stringify(await page.evaluate(()=>({readiness:window.mapMovement?.().readiness,teleport:window.mapMovement?.().teleport,detail:document.querySelector('#world-map-canvas').dataset.detail,notice:document.querySelector('#world-map-status').textContent})).catch(()=>({}))));throw error;}
finally{await browser.close();await bridge.close();await preview.close();await room.close();await rm(dir,{recursive:true,force:true});}
