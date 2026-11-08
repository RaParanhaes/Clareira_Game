import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/content-browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release,requested=false;const hold=new Promise(r=>release=r);
  // A future critical room bitmap, injected only into this browser fixture.
  await page.route('**/content-assets.mjs',async route=>{
   const response=await route.fetch();const source=(await response.text()).replace('export const ASSETS = Object.freeze([',"export const ASSETS = Object.freeze([{id:'image.fixture',scene:'room',url:'art/clareira-campfire-v1.webp',version:1,critical:true,maxBytes:400000},");
   await route.fulfill({response,body:source});
  });
  await page.route('**/clareira-campfire-v1.webp',async route=>{requested=true;await hold;await route.continue();});
  await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
  await page.locator('#guest-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#scene-loading').hidden);
  await page.evaluate(async()=>{window.inspect=(await import('/dev/main.js')).inspectMovement;});
  assert.equal(requested,false,'room assets must not load in clearing');
  for (const target of name==='mobile' ? [{x:6,y:15.5},{x:3.2,y:15.55}] : [{x:3.2,y:15.55}]) {
   const state=await page.evaluate(()=>window.inspect()),box=await page.locator('#world').boundingBox(),tx=box.width<600?26:32,ty=tx*4.5/8;
   await page.mouse.click(box.x+box.width/2+(target.x-state.camera.x-target.y+state.camera.y)*tx,box.y+box.height*(box.width<600?.4:.52)+(target.x-state.camera.x+target.y-state.camera.y)*ty);
   await page.waitForFunction(target=>{const p=window.inspect().position;return Math.hypot(p.x-target.x,p.y-target.y)<.8},target,{timeout:25000});
   await page.waitForTimeout(300);
  }
  await page.waitForTimeout(700);await page.keyboard.press('e');
  await page.waitForFunction(()=>window.inspect().location==='room'&&!document.querySelector('#scene-loading').hidden);
  await page.waitForTimeout(250);assert.equal(requested,true);assert.equal(await page.locator('.shell').evaluate(e=>e.inert),true);
  await page.screenshot({path:`${output}/${name}-room-loading.png`});
  release();await page.waitForFunction(()=>document.querySelector('#scene-loading').hidden);
  await page.screenshot({path:`${output}/${name}-room-ready.png`});
  assert.deepEqual(errors,[]);results.push({name,lazyScene:true,criticalGate:true,errors});await context.close();
 }
}finally{await browser.close();}
await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
