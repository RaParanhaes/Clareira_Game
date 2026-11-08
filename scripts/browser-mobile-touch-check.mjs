import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='/opt/game-agent/logs/mobile-touch-review';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox'],headless:true});
const results=[];
try{
for(const [name,width,height,mobile] of [['mobile',390,844,true],['small',320,640,true],['landscape',844,390,true],['desktop',1440,900,false]].filter(([name])=>!process.env.CHECK_ONLY||process.env.CHECK_ONLY.split(',').includes(name))){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
 await page.locator('#guest-form button[type=submit]').click();
 await page.waitForSelector('.shell.is-authenticated');
 await page.evaluate(async()=>{window.inspect=(await import('/dev/main.js')).inspectMovement});
 await page.waitForFunction(()=>window.inspect().readiness.sceneReady,{timeout:30000});
 assert.equal(await page.locator('[data-move]').count(),0);
 if(mobile){
  assert.equal(await page.locator('.touch-actions').isVisible(),false);
  const before=await page.evaluate(()=>window.inspect().position);
  const box=await page.locator('#world').boundingBox();
  // Try visible nearby ground on either side; obstacles may block one direction.
  let moved=false;
  for(const [dx,dy] of [[48,35],[-48,35],[0,65]]){
   await page.touchscreen.tap(box.x+box.width/2+dx,box.y+box.height/2+dy);
   try{await page.waitForFunction(p=>{const q=window.inspect().position;return Math.hypot(q.x-p.x,q.y-p.y)>.12},before,{timeout:4000});moved=true;break}catch{}
  }
  assert.ok(moved,`${name}: actual movement after ground tap`);
  await page.locator('.mobile-actions-menu summary').tap();
  assert.ok(await page.locator('.touch-actions').isVisible());
  const menu=await page.locator('.touch-actions').boundingBox();assert.ok(menu.x>=0&&menu.y>=0&&menu.x+menu.width<=width+1,`${name}: actions fit viewport`);
  assert.equal(await page.locator('.touch-actions button').first().evaluate(el=>getComputedStyle(el).userSelect),'none');
  await page.screenshot({path:`${output}/${name}-actions.png`});
  await page.locator('[data-action="emote"][data-emote="wave"]').tap();
  assert.equal(await page.locator('.touch-actions').isVisible(),false);
  await page.locator('.mobile-menu-toggle').tap();await page.locator('#inventory-toggle').tap();await page.waitForSelector('#inventory-dialog[open]');await page.screenshot({path:`${output}/${name}-inventory.png`});await page.locator('#inventory-close').tap();
 }else{
  const before=await page.evaluate(()=>window.inspect().position);await page.locator('#world').focus();await page.keyboard.down('ArrowRight');await page.waitForTimeout(450);await page.keyboard.up('ArrowRight');const after=await page.evaluate(()=>window.inspect().position);assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>.1);
 }
 await page.screenshot({path:`${output}/${name}-game.png`});assert.deepEqual(errors,[]);results.push({name,passed:true,errors});await context.close();console.log(name,'passed');
}
}finally{await browser.close();await writeFile(`${output}/browser-results.json`,JSON.stringify(results,null,2))}
