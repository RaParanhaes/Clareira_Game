import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const serviceWorkerSource=await readFile(new URL('../game/service-worker.js',import.meta.url),'utf8');
const output=process.argv[2]||'logs/dimension-transit-browser';
await mkdir(output,{recursive:true});
const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-dimension-transit-'));
const base='http://127.0.0.1:18410';
const preview=createPreviewServer({port:18410,stateDirectory,allowedOrigin:base});
const room=createPrototypeServer({port:18411,stateDirectory,allowedOrigin:base});
await preview.listen();await room.listen();
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try{
 const cases=process.env.CLAREIRA_BROWSER_DESKTOP_ONLY==='1'?[['desktop',{width:1440,height:900}]]:[['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]];
 for(const [name,viewport] of cases){
  const context=await browser.newContext({viewport,recordVideo:{dir:path.join(output,`${name}-video`),size:viewport}});
  const page=await context.newPage(),errors=[],readySignals=[];
  await context.addInitScript(()=>{
   const serviceWorker={controller:{},ready:Promise.resolve({}),register:async()=>({}),addEventListener(){},removeEventListener(){}};
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:serviceWorker});
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')console.log('BROWSER',name,message.text());});
  let upstream,browserSocket,holdDestination=false;const destinationQueue=[];
  const registration=await context.request.post(`${base}/auth/register`,{
   headers:{origin:base},data:{username:`tr_${name.slice(0,2)}_${Date.now().toString(36).slice(-5)}`,password:'TransitTest7!safe'},
  });
  assert.equal(registration.status(),201,await registration.text());
  const token=registration.headers()['set-cookie'].match(/clareira_session=([^;]+)/)?.[1];
  assert.ok(token,'the isolated test account received a session');
  await context.addCookies([{name:'clareira_session',value:token,url:`${base}/dev/`,httpOnly:true,sameSite:'Strict'}]);
  const sessionProbe=await context.request.get(`${base}/auth/me`,{headers:{cookie:`clareira_session=${token}`}});
  assert.equal(sessionProbe.status(),200,'the isolated account session is valid on the preview endpoint');
  const sessionBody=await sessionProbe.text();
  await page.routeWebSocket('**/dev/room',socket=>{
   browserSocket=socket;
   upstream=new WebSocket('ws://127.0.0.1:18411/room',{headers:{origin:base,cookie:`clareira_session=${token}`}});
   const queued=[];
   socket.onMessage(message=>{
    const raw=String(message);
    try{const parsed=JSON.parse(raw);if(parsed.type==='dimensionTravel'){holdDestination=true;}
     if(parsed.type==='dimensionTransitReady')readySignals.push({transitId:parsed.transitId,at:Date.now()});}catch{}
    if(upstream.readyState===WebSocket.OPEN)upstream.send(raw);else queued.push(raw);
   });
   upstream.on('open',()=>{for(const message of queued)upstream.send(message);});
   upstream.on('message',message=>{
    const raw=message.toString();let destination=false;
    try{const parsed=JSON.parse(raw);destination=parsed.dimensionId==='breu';}catch{}
    if(holdDestination&&destination){destinationQueue.push(raw);return;}
    try{socket.send(raw);}catch{}
   });
   upstream.on('error',error=>errors.push(error.message));
   socket.onClose(()=>upstream?.close());
  });
  await context.route('**/dev/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:sessionBody});
   if(pathname.endsWith('/service-worker.js'))return route.fulfill({status:200,contentType:'text/javascript',body:serviceWorkerSource});
   const response=await route.fetch({url:route.request().url().replace('/dev/','/'),
    headers:{...route.request().headers(),cookie:`clareira_session=${token}`}});
   await route.fulfill({response});
  });
  await page.goto(`${base}/dev/`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.shell.is-authenticated',{timeout:30000}).catch(async error=>{
   const state=await page.evaluate(()=>({title:document.title,loading:document.querySelector('#loading-message')?.textContent,caption:document.querySelector('#loading-caption')?.textContent,authenticated:document.querySelector('.shell')?.className,guest:document.querySelector('#guest-form')?.hidden,bootstrap:document.querySelector('#loading-reload')?.hidden}));
   console.log('STARTUP_DEBUG',name,JSON.stringify({state,errors}));await page.screenshot({path:path.join(output,`${name}-startup-failure.png`)});throw error;
  });
  await page.waitForSelector('#scene-loading',{state:'hidden',timeout:60000});
  await page.waitForTimeout(900);
  let inspectorReady=false;
  for(let attempt=0;attempt<3&&!inspectorReady;attempt++){
   try{await page.evaluate(async()=>{window.inspectMovement=(await import('/dev/main.js')).inspectMovement;});inspectorReady=true;}
   catch(error){if(attempt===2)throw error;await page.waitForLoadState('domcontentloaded').catch(()=>{});await page.waitForSelector('#scene-loading',{state:'hidden',timeout:60000});}
  }
  await page.waitForFunction(()=>[...document.querySelectorAll('#dimension-destinations button')]
   .some(button=>button.textContent.includes('O Breu')&&!button.disabled),null,{timeout:30000});
  await page.locator('.dimension-travel summary').click();
  await page.getByRole('button',{name:/O Breu/}).click();
  await page.waitForTimeout(520);
  const departure=await page.evaluate(async()=>(await import('/dev/main.js')).inspectMovement());
  console.log('DEPARTURE_STATE',JSON.stringify({dimensionId:departure.dimensionId,teleport:departure.teleport,phase:await page.locator('#teleport-travel-overlay').getAttribute('data-phase')}));
  assert.equal(departure.dimensionId,'surface');
  assert.equal(departure.teleport.local,true);
  await page.screenshot({path:path.join(output,`${name}-origem.png`)});

  await page.waitForFunction(()=>document.querySelector('#teleport-travel-overlay')?.dataset.phase==='loading',null,{timeout:5000});
  const blackout=await page.evaluate(async()=>(await import('/dev/main.js')).inspectMovement());
  assert.equal(blackout.dimensionId,'surface','destination snapshots are intentionally held for this black-screen check');
  await page.screenshot({path:path.join(output,`${name}-tela-preta.png`)});
  assert.ok(destinationQueue.length>0,'the server transferred the traveler while the browser remained in blackout');
  holdDestination=false;for(const message of destinationQueue.splice(0))browserSocket.send(message);

  try {
  await page.waitForFunction(()=>['arrival','arrival-apex'].includes(document.querySelector('#teleport-travel-overlay')?.dataset.phase),null,{timeout:30000});
  } catch(error) {
    const debug=await page.evaluate(()=>({phase:document.querySelector("#teleport-travel-overlay")?.dataset.phase,loading:{hidden:document.querySelector("#scene-loading")?.hidden,phase:document.querySelector("#scene-loading")?.dataset.phase,caption:document.querySelector("#loading-caption")?.textContent},movement:window.inspectMovement?.()}));
    console.log("ARRIVAL_TIMEOUT_DEBUG",JSON.stringify({debug,readySignals,destinationQueueCount:destinationQueue.length,errors}));
    await page.screenshot({path:path.join(output,name+"-arrival-timeout.png")});
    throw error;
  }
  const arrival=await page.evaluate(async()=>(await import('/dev/main.js')).inspectMovement());
  assert.equal(arrival.dimensionId,'breu');
  assert.equal(arrival.readiness.sceneReady,true);
  assert.equal(arrival.teleport.selfHidden,true,'the avatar stays hidden while the destination effect restarts');
  await page.screenshot({path:path.join(output,`${name}-chegada-inicio.png`)});
  await page.waitForFunction(async()=>(await import('/dev/main.js')).inspectMovement().teleport.selfHidden===false,null,{timeout:10000});
  const apex=await page.evaluate(async()=>(await import('/dev/main.js')).inspectMovement());
  assert.equal(apex.dimensionId,'breu');
  assert.equal(apex.teleport.selfHidden,false,'the avatar appears at the destination effect apex');
  await page.screenshot({path:path.join(output,`${name}-chegada-apice.png`)});
  assert.deepEqual(errors,[]);
  const video=page.video();
  await context.close();
  if(video)await video.saveAs(path.join(output,`${name}-teleporte.webm`));
  results.push({name,sourceDimensionAtCapture:departure.dimensionId,blackoutHeldUntilDestinationReady:true,
   arrivalRestartedFromBeginning:true,avatarHiddenAtArrivalSample:arrival.teleport.selfHidden,arrivalDimension:apex.dimensionId,errors});
 }
 await import('node:fs/promises').then(({writeFile})=>writeFile(path.join(output,'result.json'),JSON.stringify(results,null,2)));
 console.log(JSON.stringify(results));
}finally{await browser.close();await room.close();await preview.close();await rm(stateDirectory,{recursive:true,force:true});}
