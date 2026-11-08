import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createDevPreviewBridge } from './dev-preview-bridge.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { createGameAssetManifest } from './game-asset-manifest.mjs';
const output=process.argv[2]||'logs/loading-browser';await mkdir(output,{recursive:true});
const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-loading-'));
const runtimeManifest=await createGameAssetManifest(new URL('../game/',import.meta.url).pathname);
const bridgePort=Number(process.env.CLAREIRA_LOADING_BRIDGE_PORT||18210);
const roomPort=Number(process.env.CLAREIRA_LOADING_ROOM_PORT||18211);
const base=`http://127.0.0.1:${bridgePort}`;
const preview=createPreviewServer({port:0,stateDirectory,allowedOrigin:base});
const room=createPrototypeServer({port:roomPort,stateDirectory,allowedOrigin:base});
const previewAddress=await preview.listen();
const bridge=createDevPreviewBridge(previewAddress,{port:bridgePort});
await bridge.listen();await room.listen();
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try {
 const cases=process.env.CLAREIRA_LOADING_MATRIX==='1'
   ? [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}],['small',{width:320,height:640}],
     ['landscape',{width:844,height:390}],['reduced',{width:390,height:844}]]
   : process.env.CLAREIRA_BROWSER_DESKTOP_ONLY==='1'?[['desktop',{width:1440,height:900}]]
   : process.env.CLAREIRA_BROWSER_MOBILE_ONLY==='1'?[['mobile',{width:390,height:844}]]
   : [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]];
 for(const [name,viewport] of cases){
  const touch=viewport.width<600||name==='landscape';
  const context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,
    reducedMotion:name==='reduced'?'reduce':'no-preference',deviceScaleFactor:name==='mobile'?2:1});
  await context.addInitScript(()=>{
   // Hold the portal atlas once per browser context; later authenticated
   // reloads must not inherit an intentionally blocked decode from this test.
   window.__holdCriticalAssetDecode=!sessionStorage.getItem('clareira:loading-check-held-portal');
   window.__criticalAssetFailureRequested=false;
   const nativeImageDecode=HTMLImageElement.prototype.decode;
   HTMLImageElement.prototype.decode=async function(){
    const source=this.currentSrc||this.src||'';
   if(window.__holdCriticalAssetDecode&&source.includes('beam-60.webp')){
     sessionStorage.setItem('clareira:loading-check-held-portal','1');
     window.__criticalAssetFailureRequested=true;
     await new Promise(resolve=>{window.__releaseCriticalAssetDecode=resolve});
     window.__holdCriticalAssetDecode=false;
    }
    return nativeImageDecode.call(this);
   };
   document.addEventListener('DOMContentLoaded',()=>{
    const samples=[];window.__initialLoadingSamples=samples;window.__visibleLoadingSamples=[];
    const sample=()=>{
     const screen=document.querySelector('#scene-loading'),bar=document.querySelector('#loading-progress');
     if(!screen||screen.hidden||!bar)return;
     const miniStep=document.querySelector('[data-loading-group="initial"] [data-loading-step="current"]');
     const mini=miniStep?.querySelector('[role="progressbar"]');
     const value=Number(bar.getAttribute('aria-valuenow'));
     const miniValue=Number(mini?.getAttribute('aria-valuenow')??'0');
     if(Number.isFinite(value)&&Number.isFinite(miniValue)){
      const record={value,mini:miniValue,time:performance.now(),context:screen.dataset.context,stage:miniStep?.dataset.stage,
       topAccent:getComputedStyle(screen).getPropertyValue('--loading-accent').trim(),
       miniAccent:getComputedStyle(miniStep).getPropertyValue('--loading-mini-accent').trim()};
      window.__visibleLoadingSamples.push(record);
      if(screen.dataset.context==='login')samples.push(record);
     }
    };
    // Record the completion mutation itself: a busy renderer can delay an
    // interval until late in the hold, making its measured duration too short.
    new MutationObserver(() => {
      if(document.querySelector('#scene-loading')?.dataset.phase==='complete')sample();
    }).observe(document.querySelector('#scene-loading'),{attributes:true,attributeFilter:['data-phase']});
    sample();window.__initialLoadingSampler=setInterval(sample,20);
   },{once:true});
  });
  const page=await context.newPage();const errors=[],warnings=[],responses=[];
  // Keep this flow on its actual published package while other work edits the
  // checkout. Update detection itself is exercised in browser-cache-update-check.
  let observedPackageVersion=runtimeManifest.version;
  page.on('response',async response=>{
    if(new URL(response.url()).pathname==='/dev/game-assets'&&response.ok())
      observedPackageVersion=(await response.json()).version;
  });
  await page.route('**/dev/update-version',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:observedPackageVersion})}));
  // This loading fixture uses JSON storage; staff capabilities are covered by PostgreSQL tests.
  await page.route('**/dev/staff/capabilities',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({capabilities:{}}),
  }));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push({text:m.text(),location:m.location()});else if(m.type()==='warning')warnings.push(m.text())});page.on('response',r=>{responses.push({status:r.status(),url:r.url()});if(r.status()>=400)errors.push({status:r.status(),url:r.url()})});let delay=0,latestSocket,blocked=false,connections=0;
  await page.routeWebSocket('**/dev/room',socket=>{
   latestSocket=socket;connections++;
   const upstream=new WebSocket(`ws://127.0.0.1:${roomPort}/room`,{headers:{origin:base,cookie:`clareira_session=${token}`}});
   const queued=[];
   socket.onMessage(message=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(message);else queued.push(message)});
   upstream.on('open',()=>{for(const message of queued)upstream.send(message)});
   upstream.on('message',message=>{if(blocked)return;setTimeout(()=>{try{socket.send(message.toString())}catch{}},delay)});
   upstream.on('error',error=>errors.push(error.message));
   socket.onClose(()=>upstream.close());
  });
  const registration=await context.request.post(`${base}/auth/register`,{headers:{origin:base},data:{username:`load_${name}`,password:'LoadingTest7!safe'}});
  assert.equal(registration.status(),201,await registration.text());
  const registered=await registration.json();
  const accountId=registered.profile.id;
  // The preview's production Secure cookie is installed as local-only for this HTTP fixture.
  const token=registration.headers()['set-cookie'].match(/clareira_session=([^;]+)/)[1];
  await context.addCookies([{name:'clareira_session',value:token,url:base+'/dev/',httpOnly:true,sameSite:'Strict'}]);
  await page.goto(base+'/dev/');
  await page.waitForSelector('#scene-loading',{state:'visible'});
  await page.screenshot({path:`${output}/${name}-loading-start.png`});
  await page.waitForSelector('.shell.is-authenticated',{timeout:30000}).catch(async error=>{
   console.log('ACCOUNT_START_DEBUG',name,JSON.stringify({errors,responses:responses.filter(r=>/game-assets|update-version|auth\/me|bootstrap|main\.js/.test(r.url)),state:await page.evaluate(()=>({loading:document.querySelector('#scene-loading')?.hidden,phase:document.querySelector('#scene-loading')?.dataset.phase,message:document.querySelector('#loading-message')?.textContent,caption:document.querySelector('#loading-caption')?.textContent,reload:document.querySelector('#loading-reload')?.hidden,shell:document.querySelector('.shell')?.className,guest:document.querySelector('#guest-form')?.hidden}))}));
   throw error;
  });
  // Hold a real portal image during decoding. The tutorial must wait for the
  // reusable teleport, furniture, and dimension-theme warmup.
  await page.waitForSelector('#scene-loading',{state:'visible'});
  await page.waitForFunction(()=>window.__criticalAssetFailureRequested||document.querySelector('#loading-reload')?.hidden===false,{},{timeout:30000});
  await page.waitForTimeout(150);
  const waitingForState=await page.evaluate(async()=>({
   hidden:document.querySelector('#scene-loading')?.hidden,
   percent:Number((document.querySelector('#loading-percent')?.textContent||'0').replace('%','').replace(',','.')),
   inert:document.querySelector('.shell')?.inert,
   loadingCoversShell:Number(getComputedStyle(document.querySelector('#scene-loading')).zIndex)>Number(getComputedStyle(document.querySelector('.shell')).zIndex),
   tasks:(await import('/dev/main.js')).inspectMovement().loading,
  }));
  assert.equal(waitingForState.hidden,false,'the initial loader remains visible while reusable startup art is decoding');
  assert.equal(waitingForState.inert,true,'player input stays blocked during initial warmup');
  assert.equal(waitingForState.loadingCoversShell,true,'the loading overlay covers the tutorial until startup warmup completes');
  assert.ok(waitingForState.percent<100,`progress cannot report completion with a pending teleport image: ${JSON.stringify(waitingForState)}`);
  assert.ok(waitingForState.tasks.pendingTasks.some(task=>task.id==='asset:teleport:image.teleport-beam'),'the held portal image is counted as real work');
  assert.ok(waitingForState.tasks.taskIds.filter(id=>id.startsWith('dimension-theme:')).length>=7,'progress registers every available dimension theme');
  assert.ok(waitingForState.tasks.taskIds.includes('asset:room:image.room-furniture'),'progress registers the room furniture atlas');
  assert.ok(waitingForState.tasks.taskIds.includes('asset:teleport:image.teleport-beam'),'progress registers the portal animation');
  await page.screenshot({path:`${output}/${name}-portal-art-blocks-first-tutorial.png`});
  assert.equal(await page.evaluate(()=>window.__criticalAssetFailureRequested),true,'the fixture held a real portal image during decode');
  assert.equal(await page.locator('#loading-reload').isVisible(),false,'a pending image decode is not treated as a load failure');
  await page.evaluate(()=>window.__releaseCriticalAssetDecode?.());
  await page.waitForFunction(()=>{
    const root=document.querySelector('#scene-loading'),step=document.querySelector('[data-loading-step=current]');
    return !root.hidden&&root.dataset.phase==='complete'&&step.dataset.stage==='scene'
      && Number(document.querySelector('#loading-progress').getAttribute('aria-valuenow'))===100
      && Number(step.querySelector('[role=progressbar]').getAttribute('aria-valuenow'))===100;
  });
  assert.equal(await page.locator('[data-loading-step=current]').evaluate(e=>getComputedStyle(e).visibility), 'visible',
    'the final mini bar must actually be visible at 100%, not only have a hidden DOM value');
  assert.equal(await page.locator('[data-loading-step=current]').getAttribute('aria-hidden'), 'false');
  await page.screenshot({path:`${output}/${name}-both-bars-complete.png`});
  await page.waitForSelector('#scene-loading',{state:'hidden'});
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false,'the tutorial opens only after all initial warmup tasks complete');
  await page.evaluate(async()=>{window.inspect=(await import('/dev/main.js')).inspectMovement});
  await page.evaluate(async()=>{
   document.querySelector('#appearance-open').click();const f=document.querySelector('#appearance-form');
   f.elements.body.value='female';f.elements.body.dispatchEvent(new Event('change',{bubbles:true}));
   f.requestSubmit();
  });
  await page.waitForFunction(()=>window.inspect().appearance.body==='female',{},{timeout:5000}).catch(async error=>{console.log(JSON.stringify({errors,scene:await page.evaluate(()=>{const s=window.inspect();return {server:s.server,appearance:s.appearance,fires:s.fires}}),loading:await page.locator('#scene-loading').isVisible(),inert:await page.locator('.shell').evaluate(el=>el.inert)}));throw error});
  const savedAppearance=JSON.parse(await readFile(path.join(stateDirectory,'appearances',`${accountId}.json`),'utf8'));
  assert.ok(Number.isInteger(savedAppearance.version) && savedAppearance.version >= 1);
  assert.equal(savedAppearance.appearance.bodyId,'female');
  const before=await page.evaluate(()=>window.inspect());
  delay=1400;
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.shell.is-authenticated',{timeout:30000}).catch(async error=>{
   console.log('ACCOUNT_START_DEBUG',name,JSON.stringify({errors,state:await page.evaluate(()=>({loading:document.querySelector('#scene-loading')?.hidden,phase:document.querySelector('#scene-loading')?.dataset.phase,message:document.querySelector('#loading-message')?.textContent,caption:document.querySelector('#loading-caption')?.textContent,reload:document.querySelector('#loading-reload')?.hidden,shell:document.querySelector('.shell')?.className,guest:document.querySelector('#guest-form')?.hidden}))}));
   throw error;
  });
  assert.equal(await page.locator('#scene-loading').isVisible(),true);assert.equal(await page.locator('#scene-loading').getAttribute('data-context'),'login','an authenticated F5 uses the same initial loader as the guest flow');
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),true);
  await page.waitForFunction(()=>!document.querySelector('#loading-percent').hidden,{},{timeout:10000});
  const loadingPercent=Number((await page.locator('#loading-percent').textContent()).replace('%','').replace(',','.'));
  assert.ok(loadingPercent>0&&loadingPercent<100,`expected honest intermediate progress, got ${loadingPercent}%`);
  assert.equal(await page.locator('#loading-progress').getAttribute('role'),'progressbar');
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');
  await page.screenshot({path:`${output}/${name}-loading.png`});
  await page.waitForSelector('#scene-loading',{state:'hidden',timeout:20000}).catch(async error=>{
   console.log('INITIAL_LOADING_DEBUG',name,JSON.stringify({
    errors,warnings,roomTransition:await page.locator('#scene-loading').getAttribute('data-room-transition'),layoutVisibility:await page.locator('.loading-layout').evaluate(el=>getComputedStyle(el).visibility),
    progress:await page.evaluate(async()=>{
     const state=(await import('/dev/main.js')).inspectMovement();
     const step=document.querySelector('[data-loading-group="initial"] [data-loading-step="current"]');
      return {readiness:state.readiness,loading:state.loading,context:document.querySelector('#scene-loading')?.dataset.context,
      phase:document.querySelector('#scene-loading')?.dataset.phase,percent:document.querySelector('#loading-percent')?.textContent,
      mini:{label:step?.querySelector('[data-loading-label]')?.textContent,detail:step?.querySelector('[data-loading-detail]')?.textContent,value:step?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')},
      errors:window.__clareiraLoadingErrors||[]};
    }),
   }));
   throw error;
  });
  const initialProgressAudit=await page.evaluate(()=>{
   const samples=window.__initialLoadingSamples||[];
   const visibleSamples=window.__visibleLoadingSamples||[];
   const values=samples.map(sample=>sample.value);
   const firstHundred=visibleSamples.find(sample=>sample.value>=99.9);
   const firstMiniHundred=samples.find(sample=>sample.mini>=99.9&&sample.stage==='scene');
   return {
    samples:values,
    miniSamples:samples.map(sample=>sample.mini),
    stageSamples:samples.map(({stage,mini,topAccent,miniAccent,time})=>({stage,mini,topAccent,miniAccent,time})),
    holdMs:firstHundred?performance.now()-firstHundred.time:0,
    miniHoldMs:firstMiniHundred?performance.now()-firstMiniHundred.time:0,
   };
  });
  assert.ok(initialProgressAudit.samples.length>0,'the initial loading percentage was sampled');
  assert.ok(initialProgressAudit.samples.every(value=>value>=0&&value<=100),'the initial percentage stays within 0–100');
  const regressionIndex=initialProgressAudit.samples.findIndex((value,index,values)=>index>0&&value<values[index-1]);
  assert.ok(regressionIndex<0,`the initial percentage never regresses; index=${regressionIndex}, samples=${JSON.stringify(initialProgressAudit.samples)}`);
  const lastMiniByStage=new Map();
  for(const sample of initialProgressAudit.stageSamples){
   const previous=lastMiniByStage.get(sample.stage);
   assert.ok(!previous||sample.mini>=previous.mini,`the initial mini bar never regresses within ${sample.stage}: ${JSON.stringify({previous,sample})}`);
   assert.equal(sample.topAccent,sample.miniAccent,`the total and active-stage bars use the same color during ${sample.stage}`);
   lastMiniByStage.set(sample.stage,sample);
  }
  for (const stage of ['files', 'session', 'character', 'scene']) {
   const full = initialProgressAudit.stageSamples.filter(sample => sample.stage === stage && sample.mini >= 99.9);
   assert.ok(full.length > 1 && full.at(-1).time - full[0].time >= 950, `the ${stage} stage remains at 100% for at least one second: ${JSON.stringify(full)}`);
  }
  assert.ok(initialProgressAudit.samples.some(value=>value===0),'the initial percentage is present from the start');
  assert.ok(initialProgressAudit.samples.some(value=>value>=99.9),`the initial percentage reaches 100%; samples=${JSON.stringify(initialProgressAudit)}`);
  for(const stage of ['files','session','character','scene']){
   assert.ok(initialProgressAudit.stageSamples.some(sample=>sample.stage===stage&&sample.mini>=99.9),`the ${stage} mini bar reaches 100%`);
  }
  assert.ok(initialProgressAudit.holdMs>=900,'the initial total 100% remains visible for about one second');
  assert.ok(initialProgressAudit.miniHoldMs>=1200,`mini bar settles, then remains full for one second: ${JSON.stringify({holdMs:initialProgressAudit.holdMs,miniHoldMs:initialProgressAudit.miniHoldMs})}`);
  const first=await page.evaluate(async()=>(await import('/dev/main.js')).inspectMovement());
  assert.equal(first.appearance.body,'female');assert.ok(first.fires>=1);
  assert.ok(Math.hypot(first.rendered.x-first.server.x,first.rendered.y-first.server.y)<.1);
  assert.ok(Math.hypot(first.position.x-before.position.x,first.position.y-before.position.y)<.1,'loading key did not move the player');
  await page.screenshot({path:`${output}/${name}-ready.png`});
  // A warm reconnect retains the ready scene; it should not cover it with the initial loader.
  delay=0;blocked=true;latestSocket.close({code:1012,reason:'fixture reconnect'});
  await page.waitForFunction(()=>document.querySelector('#connection-label')?.textContent.includes('Conexão instável'));
  assert.equal(await page.locator('#scene-loading').isVisible(),false,'a resumable connection keeps the ready world visible');
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false,'the ready scene stays interactive during a resumable reconnect');
  await page.waitForTimeout(1800);
  assert.ok(connections>=3,'the game automatically reconnected after the socket closed');
  assert.equal(await page.locator('#loading-reload').isVisible(),false,'transient reconnects do not ask for a click');
  await page.screenshot({path:`${output}/${name}-warm-reconnect.png`});
  // Let the next reconnect receive its first snapshot instead of dropping it.
  blocked=false;latestSocket.close({code:1012,reason:'fixture recovered'});
  await page.waitForFunction(()=>document.querySelector('#connection-label')?.textContent==='Conectado à clareira',{},{timeout:20000});
  assert.equal(await page.locator('#scene-loading').isVisible(),false,'a recovered resumable connection does not show the initial loader');
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false);
  if(errors.length)console.log('LOADING_RUNTIME_DIAGNOSTIC',JSON.stringify({errors,resources:await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>({name:item.name,responseStatus:item.responseStatus,initiatorType:item.initiatorType})).filter(item=>item.responseStatus>=400))}));
  assert.deepEqual(errors,[]);
  results.push({name,verifiedPackageFiles:runtimeManifest.files.length,accountReload:true,rasterBodyChoicePersisted:true,completeFireState:true,alignedFirstFrame:true,loadingInputBlocked:true,firstTutorialWaitsForDimensionFurnitureAndTeleportWarmup:true,initialProgress:{samples:initialProgressAudit.samples.length,monotonic:true,reached100:true,holdMs:Math.round(initialProgressAudit.holdMs),miniHoldMs:Math.round(initialProgressAudit.miniHoldMs)},automaticReconnect:true,errors});
  await context.close();
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await room.close();await bridge.close();await preview.close();await rm(stateDirectory,{recursive:true,force:true})}
