import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/hud-night-browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});
 await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});await page.locator('#guest-form button[type=submit]').click();await page.waitForSelector('.shell.is-authenticated');
 await page.evaluate(async()=>{window.scene=(await import('/dev/main.js')).inspectMovement});await page.waitForFunction(()=>Boolean(window.scene().server));await page.waitForTimeout(600);
 const inspect=()=>page.evaluate(()=>window.scene());
 async function go(x,y){await page.waitForFunction(()=>{const s=window.scene();return Math.hypot(s.camera.x-s.rendered.x,s.camera.y-s.rendered.y)<.04});const s=await inspect(),box=await page.locator('#world').boundingBox();await page.mouse.click(box.x+box.width/2+(x-y)*32-Math.round((s.camera.x-s.camera.y)*32),box.y+box.height*.52+(x+y)*18-Math.round((s.camera.x+s.camera.y)*18));await page.waitForFunction(({x,y})=>{const p=window.scene().position;return Math.hypot(p.x-x,p.y-y)<.6},{x,y},{timeout:20000});await page.waitForTimeout(500);}
 const bar=await page.locator('.shell>.topbar').boundingBox();assert.ok(bar.width<150&&bar.x<20&&bar.height>bar.width,'compact side menu');
 assert.equal(await page.locator('.objective').count(),0);assert.equal(await page.locator('#world-title').textContent(),'Bosque das Brasas');
 for(const coin of ['gold','silver','bronze'])assert.equal(await page.locator(`#${coin}-count`).textContent(),'0');
 const brightness=await page.evaluate(()=>{const s=window.scene(),c=document.querySelector('#world'),b=c.getBoundingClientRect(),ctx=c.getContext('2d');const sample=(x,y)=>{const px=b.width/2+(x-y)*32-Math.round((s.camera.x-s.camera.y)*32),py=b.height*.52+(x+y)*18-Math.round((s.camera.x+s.camera.y)*18);const data=ctx.getImageData(Math.round(px),Math.round(py),4,4).data;let v=0;for(let i=0;i<data.length;i+=4)v+=data[i]+data[i+1]+data[i+2];return v/48};return {near:sample(9,12.6),far:sample(15,11)}});assert.ok(brightness.far<brightness.near*.65,'distant terrain darker than firelit terrain');
 await page.screenshot({path:`${output}/desktop.png`});
 let after=await inspect(),before=after;
 if(!process.argv.includes('--layout')){
 for(const target of [[6.2,12.1],[11.5,5.4],[11.5,7.5]]){await go(...target);await page.keyboard.press('e');await page.waitForTimeout(350)}
 assert.ok((await inspect()).inventory.wood>=2);assert.ok((await inspect()).inventory.stone>=1);
 await go(11.5,6.4);before=await inspect();await page.keyboard.press('f');await page.waitForFunction(count=>window.scene().fires>count,before.fires);
 after=await inspect();assert.equal(after.lighting.kind,'fire');assert.ok(after.brightness>.9);assert.ok(Math.hypot(after.lighting.x-after.position.x,after.lighting.y-after.position.y)<.2);
 await page.screenshot({path:`${output}/second-fire.png`});

 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);const menu=await page.locator('.shell>.topbar').boundingBox();assert.ok(menu.width<105&&menu.x<12);assert.equal(await page.locator('.weather').isVisible(),true);const contained=await page.evaluate(()=>{const p=document.querySelector('.shell>.topbar').getBoundingClientRect();return [...document.querySelectorAll('.coin-wallet b,.topbar .inventory-item,.topbar .icon-button')].every(e=>e.getBoundingClientRect().right<=p.right+1)});assert.ok(contained,'menu contents stay within the sidebar');await page.screenshot({path:`${output}/mobile.png`});
 assert.deepEqual(errors,[]);await writeFile(`${output}/result.json`,JSON.stringify({bar,menu,brightness,before:{fires:before.fires},after:{fires:after.fires,lighting:after.lighting,brightness:after.brightness},errors},null,2));console.log(JSON.stringify({brightness,fires:after.fires,lighting:after.lighting}));
}finally{await browser.close()}
