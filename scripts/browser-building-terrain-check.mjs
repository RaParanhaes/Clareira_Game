import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const out=process.argv[2]||'logs/building-terrain';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://vmi3579939.contaboserver.net/dev/?profile=1',{waitUntil:'domcontentloaded'});await page.locator('#guest-form button[type=submit]').click();await page.waitForSelector('.shell.is-authenticated');
 await page.evaluate(async()=>{const m=await import('/dev/main.js');window.scene=m.inspectMovement;window.profile=m.inspectPerformance;window.surface=(await import('/dev/elevation.mjs')).surfaceHeight});await page.waitForFunction(()=>window.scene().server);await page.waitForTimeout(500);
 async function go(x,y,reach=.4){console.log("go",x,y);await page.waitForFunction(()=>{const s=window.scene();return Math.hypot(s.camera.x-s.rendered.x,s.camera.y-s.rendered.y)<.03});const s=await page.evaluate(()=>window.scene()),b=await page.locator('#world').boundingBox(),z=await page.evaluate(({x,y})=>window.surface(x,y,window.scene().location),{x,y});const tx=b.width<600?26:32;
  await page.mouse.click(b.x+b.width/2+(x-y)*tx-Math.round((s.camera.x-s.camera.y)*tx),b.y+b.height*(b.width<600?.4:.52)+(x+y)*tx*18/32-Math.round((s.camera.x+s.camera.y)*tx*18/32)-z*12*tx/16);
  try{await page.waitForFunction(({x,y,reach})=>{const p=window.scene().position;return Math.hypot(p.x-x,p.y-y)<reach},{x,y,reach});}catch(error){console.log(JSON.stringify(await page.evaluate(()=>window.scene())));await page.screenshot({path:`${out}/blocked.png`});throw error;}await page.waitForTimeout(200);
 }
 await page.screenshot({path:`${out}/arrival.png`});if(!process.argv.includes('--hill-only')){await go(3.2,15.55);await page.keyboard.press('e');await page.waitForFunction(()=>window.scene().location==='room');
 await go(8,6);assert.equal((await page.evaluate(()=>window.scene())).height,2);await page.screenshot({path:`${out}/room-upper.png`});
 await go(6,8.8);assert.equal((await page.evaluate(()=>window.scene())).height,0);await page.screenshot({path:`${out}/room-lower.png`});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:`${out}/mobile-room.png`});await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(400);await go(8,10.8);await page.keyboard.press('e');await page.waitForFunction(()=>window.scene().location==='clearing');
 for(const [x,y] of [[2.3,7],[6.2,12.1],[11.5,5.4],[11.5,7.5],[10.1,12.6]]){await go(x,y,.9);await page.keyboard.press('e');await page.waitForTimeout(450)}
 const inventory=await page.evaluate(()=>window.scene().inventory);assert.ok(inventory.wood>=3&&inventory.stone>=2,'resources for two real lights');
 await go(7,19);const count=await page.evaluate(()=>window.scene().fires);await page.keyboard.press('f');await page.waitForFunction(n=>window.scene().fires>n,count);await page.waitForTimeout(500);await page.screenshot({path:`${out}/fallen-log.png`});
 await go(17.4,16);await page.keyboard.press('e');await page.waitForTimeout(450);
 }else{for(const [x,y,collect] of [[13,16,false],[13,22,true],[17.4,22,true],[21.8,16,true]]){await go(x,y,collect?.9:.4);if(collect){await page.keyboard.press('e');await page.waitForTimeout(450)}}}
 for(const [x,y] of [[19,23],[25,25],[31,27],[35.5,27],[35.5,22]])await go(x,y);
 const top=await page.evaluate(()=>window.scene());assert.ok(top.height>1.4);const serverHeight=await page.evaluate(()=>{const s=window.scene();return window.surface(s.server.x,s.server.y,s.location)});assert.ok(Math.abs(top.height-serverHeight)<.02);const fires=top.fires;await page.keyboard.press('f');await page.waitForFunction(n=>window.scene().fires>n,fires);await page.waitForTimeout(500);await page.screenshot({path:`${out}/natural-hill.png`});
 await go(35.5,27);const bottom=await page.evaluate(()=>window.scene());assert.ok(bottom.height<.1);assert.deepEqual(errors,[]);
 await writeFile(`${out}/result.json`,JSON.stringify({mode:process.argv.includes('--hill-only')?'hill-only':'full',top:top.height,bottom:bottom.height,errors,performance:await page.evaluate(()=>window.profile())},null,2));console.log(process.argv.includes('--hill-only')?'continuous hillside and real lighting passed':'stepped walls, projected windows, log and continuous hillside passed');
} finally {await browser.close()}
