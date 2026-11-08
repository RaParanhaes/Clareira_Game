import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createPreviewServer} from './dev-preview-page.mjs';
import {createDevPreviewBridge} from './dev-preview-bridge.mjs';
import {createGameAssetManifest} from './game-asset-manifest.mjs';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const output=process.argv[2]||'logs/login-loading-browser';await mkdir(output,{recursive:true});
const runtimeManifest=await createGameAssetManifest(new URL('../game/',import.meta.url).pathname);
const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-login-loading-'));
const base='http://127.0.0.1:18212';
const preview=createPreviewServer({port:0,stateDirectory,allowedOrigin:base});
const previewAddress=await preview.listen();
let interceptRequest=async()=>false;
const bridge=createDevPreviewBridge(previewAddress,{port:18212,beforeProxy:args=>interceptRequest(args)});
await bridge.listen();
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});const results=[];
try{
 for(const [name,viewport,mode] of [['desktop',{width:1440,height:900},'normal'],['mobile',{width:390,height:844},'normal'],['reduced',{width:390,height:844},'reduce']]){
  const context=await browser.newContext({viewport,reducedMotion:mode==='reduce'?'reduce':'no-preference'}),page=await context.newPage(),errors=[];
  let releaseLoginArt;const heldLoginArt=new Promise(resolve=>releaseLoginArt=resolve),loginArtRequests=[];
  await page.route('**/dev/art/clareira-login-poster-v5.webp',async route=>{loginArtRequests.push(route.request().url());await heldLoginArt;await route.continue()});
  page.on('pageerror',error=>errors.push(error.message));let releaseSession,sessionAttempts=0;
  page.on('response',response=>{if(new URL(response.url()).pathname==='/dev/auth/me'&&response.status()===401)void page.evaluate(()=>window.__lastSessionResponseAt=performance.now())});
  const heldSession=new Promise(resolve=>releaseSession=resolve);
  interceptRequest=async({pathname,outgoing})=>{
   if(pathname!=='/auth/me')return false;
   await heldSession;sessionAttempts++;
   if(sessionAttempts!==1)return false;
   outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end('{}');return true;
  };
  await page.goto(`${base}/dev/`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#scene-loading',{state:'visible'});
  assert.equal(await page.locator('#scene-loading').getAttribute('data-context'),'login');
  assert.equal(await page.locator('.loading-wordmark').count(),1,'initial loader shows the Clareira mark');
  assert.equal(await page.locator('#loading-progress[role=progressbar]').count(),1,'initial loader has the total progress bar');
  assert.equal(await page.locator('[data-loading-step=current] [role=progressbar]').count(),1,'initial loader has the active-stage bar');
  assert.deepEqual(await page.locator('[data-loading-checkpoints] [data-checkpoint]').allTextContents(),['Arquivos','Sessão','Personagem','Cena']);
  assert.equal(await page.locator('#scene-loading').evaluate(element=>getComputedStyle(element).display!=='none'),true);
  assert.equal(await page.locator('.shell').evaluate(e=>e.inert),true);
  const animation=await page.locator('.loading-wordmark').evaluate(e=>e.getAnimations().map(a=>a.currentTime));
  if(mode==='reduce')assert.deepEqual(animation,[]);
  else{await page.waitForTimeout(220);const next=await page.locator('.loading-wordmark').evaluate(e=>e.getAnimations()[0]?.currentTime);assert.ok(next>animation[0])}
  await page.waitForFunction(()=>Number(document.querySelector("[data-loading-step=current] [role=progressbar]").getAttribute("aria-valuenow"))>0,null,{timeout:60000});
  const progressAtCapture=await page.evaluate(()=>{
   const total=Number(document.getElementById("loading-progress").getAttribute("aria-valuenow"));
   const mini=Number(document.querySelector("[data-loading-step=current] [role=progressbar]").getAttribute("aria-valuenow"));
   return {total,mini,cache:window.__clareiraInitialCacheProgress,context:document.getElementById("scene-loading").dataset.context,ready:window.__clareiraMainLoadingProgressReady};
  });
  if(progressAtCapture.mini>0)assert.ok(progressAtCapture.total>0,
    "the total percentage advances whenever the cache stage has real progress: "+JSON.stringify(progressAtCapture));
  console.log("LOADING_PROGRESS_CAPTURE",name,JSON.stringify(progressAtCapture));
  await page.screenshot({path:`${output}/${name}-loading.png`});
  if(process.env.CLAREIRA_PROGRESS_PROBE_ONLY==="1"){await context.close();break;}
  releaseSession();
  await page.waitForSelector('#scene-loading',{state:'hidden',timeout:90000});
  console.log("POST_HIDDEN_DEBUG",name,sessionAttempts,JSON.stringify(await page.evaluate(()=>({
   loading:document.getElementById("scene-loading").hidden,
   context:document.getElementById("scene-loading").dataset.context,
   phase:document.getElementById("scene-loading").dataset.phase,
   shellInert:document.querySelector(".shell").inert,
   guestHidden:document.getElementById("guest-form").hidden,
   error:document.getElementById("loading-message").textContent,
   cache:window.__clareiraInitialCacheProgress
  }))));
  await page.waitForFunction(()=>!document.querySelector(".shell").inert);
  const gateDelayMs=await page.evaluate(()=>performance.now()-window.__lastSessionResponseAt);
  assert.equal(await page.locator('.shell').evaluate(e=>e.inert),false);
  assert.ok(sessionAttempts>=2,'a temporary session-check failure is retried automatically');
  await page.waitForSelector('#guest-form',{state:'visible'});
  assert.equal(await page.locator('#guest-form').isVisible(),true,'login form is available as soon as session retries finish');
  assert.equal(loginArtRequests.length,1,'login requests its background art independently of the form');
  assert.equal(await page.locator('.auth-illustration-image').count(),1,'login keeps its full-screen background image');
  releaseLoginArt();
  await page.waitForFunction(()=>{const image=document.querySelector('.auth-illustration-image');return image.complete&&image.naturalWidth>0});
  assert.doesNotMatch(await page.locator('.auth-stage').evaluate(element=>getComputedStyle(element).backgroundImage),/clareira-login-vila-v1/);
  assert.ok(gateDelayMs<2000,`login should reveal promptly after the final session response; got ${gateDelayMs.toFixed(0)} ms`);
  await page.waitForTimeout(150);await page.screenshot({path:`${output}/${name}-login.png`});
  assert.deepEqual(errors,[]);
  results.push({name,verifiedPackageFiles:runtimeManifest.files.length,backgroundArtPreserved:true,loginNotBlockedByBackgroundArt:true,loginRevealDelayMs:Math.round(gateDelayMs),sessionLoadingVisible:true,sessionRetriedAutomatically:true,formAccessible:true,reducedMotion:mode==='reduce',loginArtRequests:loginArtRequests.length,errors});
  await context.close();
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await bridge.close();await preview.close();await rm(stateDirectory,{recursive:true,force:true})}
