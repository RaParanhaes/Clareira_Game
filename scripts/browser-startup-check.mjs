import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createPreviewServer} from './dev-preview-page.mjs';
import {createDevPreviewBridge} from './dev-preview-bridge.mjs';

const output=process.argv[2]||'logs/startup-recovery';await mkdir(output,{recursive:true});
const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-startup-'));
const base='http://127.0.0.1:18213';
const preview=createPreviewServer({port:0,stateDirectory,allowedOrigin:base});
const previewAddress=await preview.listen();
let interceptRequest=async()=>false;
const bridge=createDevPreviewBridge(previewAddress,{port:18213,beforeProxy:args=>interceptRequest(args)});
await bridge.listen();
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});const results=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  let failures=1,requests=0;
  page.on('pageerror',error=>errors.push(error.message));
  interceptRequest=async({pathname,outgoing})=>{
   if(pathname!=='/avatar-sprites.mjs')return false;
   requests++;
   if(failures<=0)return false;
   failures--;outgoing.writeHead(500,{'content-type':'text/plain'});outgoing.end('Fixture unavailable');return true;
  };
  await page.goto(`${base}/dev/`,{waitUntil:'domcontentloaded'});
  // The verified package now comes from the real server instead of a tiny
  // manifest fixture; keep the form-reveal deadline separate from that work.
  await page.waitForFunction(()=>window.__clareiraInitialCacheProgress?.complete===true,null,{timeout:90_000});
  await page.waitForSelector('#scene-loading',{state:'hidden',timeout:15000});
  await page.waitForSelector('#guest-form',{state:'visible'});
  assert.equal(requests,2,
    'the client graph recovered automatically after repeated transient module failures');
  assert.equal(await page.locator('#loading-reload').isVisible(),false,'transient startup failures do not require a click');
  await page.screenshot({path:`${output}/${name}-recovered.png`});
  assert.deepEqual(errors,[]);
  results.push({name,moduleFailureRecoveredAutomatically:true,automaticAttempts:1,loginAvailable:true,manualReloadNotNeeded:true,errors});await context.close();
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await bridge.close();await preview.close();await rm(stateDirectory,{recursive:true,force:true})}
