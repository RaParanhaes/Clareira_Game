import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/initial-gait';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
try {
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[],assets=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/dev/update-version',route=>route.fulfill({json:{version:'gait-check'}}));
  await page.route('**/atlases/**/walk.png',async route=>{await new Promise(r=>setTimeout(r,2000));await route.continue();});
  page.on('response',response=>{if(response.url().includes('/walk.png'))assets.push({at:Date.now(),status:response.status()});});
  await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
  await page.locator('#guest-form button[type=submit]').click();
  await page.waitForSelector('.shell.is-authenticated');
  await page.evaluate(async()=>window.inspect=(await import('/dev/main.js')).inspectMovement);
  await page.waitForFunction(()=>window.inspect().readiness.sceneReady&&window.inspect().readiness.predictionReady);
  const readyAt=Date.now();
  await page.locator('#world').focus();
  if(mobile){const b=await page.locator('[data-move="0,1"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}
  else await page.keyboard.down('ArrowDown');
  const samples=[];
  for(let i=0;i<12;i++){await page.waitForTimeout(80);samples.push(await page.evaluate(()=>{const s=window.inspect();return {position:s.position,frame:s.avatarFrame,body:s.body,appearance:s.appearance};}));if(i===2||i===6)await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-step-${i}.png`});}
  if(mobile)await page.mouse.up();else await page.keyboard.up('ArrowDown');
  await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}.png`});
  results.push({mobile,readyAt,assets,samples,errors});
  await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));
  if(process.env.ASSERT_GAIT){assert.ok(assets.length>0&&assets.every(a=>a.at<=readyAt),'walk decoded before controls open');assert.ok(new Set(samples.map(s=>s.frame.frame)).size>1,'first movement animates');assert.deepEqual(errors,[]);}
  await context.close();
 }
}finally{await browser.close();}
