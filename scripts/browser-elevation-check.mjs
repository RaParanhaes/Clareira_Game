import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/elevation-browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
 await page.locator('#guest-form button[type=submit]').click();await page.waitForSelector('.shell.is-authenticated');
 await page.evaluate(async()=>{window.inspectTerrain=(await import('/dev/main.js')).inspectMovement;window.terrainHeight=(await import('/dev/elevation.mjs')).surfaceHeight});
 await page.waitForFunction(()=>Boolean(window.inspectTerrain().server));
 const inspect=()=>page.evaluate(()=>window.inspectTerrain());
 async function go(x,y){const state=await inspect(),box=await page.locator('#world').boundingBox();const tile=box.width<600?26:32,z=await page.evaluate(({x,y})=>window.terrainHeight(x,y,window.inspectTerrain().location),{x,y});
  await page.mouse.click(box.x+box.width/2+(x-y)*tile-Math.round((state.camera.x-state.camera.y)*tile),box.y+box.height*.52+(x+y)*tile*18/32-Math.round((state.camera.x+state.camera.y)*tile*18/32)-z*12*tile/16);
  console.log('walk to',x,y);await page.waitForFunction(({x,y})=>{const p=window.inspectTerrain().position;return Math.hypot(p.x-x,p.y-y)<.35},{x,y},{timeout:25000});await page.waitForTimeout(500);
  const done=await inspect();assert.ok(Math.hypot(done.position.x-done.server.x,done.position.y-done.server.y)<.12,'authoritative position agrees');return done;
 }
 await go(3.2,15.55);await page.keyboard.press('e');await page.waitForFunction(()=>window.inspectTerrain().location==='room');
 const roomTop=await go(8,6);assert.equal(roomTop.height,2);await page.screenshot({path:`${output}/room-upper.png`});
 const roomRamp=await go(10,8.5);assert.ok(roomRamp.height>.7&&roomRamp.height<1.3);await page.screenshot({path:`${output}/room-ramp.png`});
 const roomBottom=await go(8,10);assert.equal(roomBottom.height,0);
 await go(6,7.5);await page.locator('#world').focus(); // ArrowUp is screen north; use W+D to move along world -y.
 const {x,y}= (await inspect()).position;await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowRight');await page.waitForTimeout(650);await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight');await page.waitForTimeout(500);
 const edge=await inspect();assert.ok(edge.position.y>=7,'cliff blocked');
 await go(8,10.6);await page.keyboard.press('e');await page.waitForFunction(()=>window.inspectTerrain().location==='clearing');
 const worldTop=await inspect(),worldBottom=worldTop;assert.equal(await page.evaluate(()=>window.terrainHeight(17,14)),0,'test platform removed');await page.screenshot({path:`${output}/world-flat.png`});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:`${output}/mobile-world.png`});
 assert.deepEqual(errors,[]);await writeFile(`${output}/result.json`,JSON.stringify({roomTop,roomRamp,roomBottom,edge,worldTop,worldBottom,errors},null,2));console.log('room stairs/ramp, cliff, removed world platform and server agreement passed');
} finally {await browser.close()}
