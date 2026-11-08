import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.argv[2]||'logs/movement-deep/baseline';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();const errors=[],samples=[];let failure=null;
page.on('pageerror',error=>{errors.push({message:error.message,stack:error.stack});console.log('PAGE ERROR',error.stack)});
await page.addInitScript(()=>{window.probeFrames=0;const pulse=()=>{window.probeFrames++;requestAnimationFrame(pulse)};requestAnimationFrame(pulse)});
try{
await page.route('**/dev/update-version**',r=>r.fulfill({json:{version:'movement-soak'}}));
await page.goto('https://vmi3579939.contaboserver.net/dev/?profile=1',{waitUntil:'domcontentloaded'});await page.locator('#guest-form button[type=submit]').click();
await page.evaluate(async()=>{const m=await import('/dev/main.js');window.scene=m.inspectMovement;window.profile=m.inspectPerformance});await page.waitForFunction(()=>window.scene().readiness.sceneReady);
await page.locator('#world').focus();const directions=process.env.USE_WASD?['s','d','w','a','s','a','w','d']:['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','ArrowDown','ArrowLeft','ArrowUp','ArrowRight'];
for(let i=0;i<Number(process.env.SOAK_STEPS||120);i++){
 if(process.env.EXERCISE_FOCUS&&i%12===0){
  await page.locator('#help-toggle').click();
 }
 const key=directions[i%directions.length];if(i%8===0)await page.keyboard.down('Shift');if(i%8===4)await page.keyboard.up('Shift');
 await page.keyboard.down(key);await page.waitForTimeout(1800);
 const sample=await page.evaluate(()=>({at:performance.now(),probeFrames:window.probeFrames,state:window.scene(),focus:{tag:document.activeElement?.tagName,id:document.activeElement?.id},profile:window.profile()}));
 if(process.env.USE_WASD&&!sample.state.movementKeys.includes(key)) {
  failure=`WASD input dropped at step ${i}, focused ${sample.focus.tag}#${sample.focus.id}`;
 }
 sample.i=i;samples.push(sample);
 if(samples.length>=8){
  const recent=samples.slice(-8),origin=recent[0].state.position;
  const extent=Math.max(...recent.map(sample=>Math.hypot(sample.state.position.x-origin.x,sample.state.position.y-origin.y)));
  if(extent<.1)failure='no movement across eight consecutive direction attempts';
 }
 await writeFile(`${output}/samples.json`,JSON.stringify(samples,null,2));
 console.log(JSON.stringify({i,key,position:sample.state.position,server:sample.state.server,pending:sample.state.pending,ready:sample.state.readiness,frames:sample.probeFrames,clock:sample.state.animationTime,focus:sample.focus}));
 await page.keyboard.up(key);
 if(failure)break;
 if(errors.length){failure='JavaScript exception';break}
 if(samples.length>2&&sample.state.animationTime===samples.at(-2).state.animationTime&&sample.state.readiness.sceneReady){failure='game loop stopped';break}
 if(i%16===15)await page.screenshot({path:`${output}/walk-${i}.png`});
}
await page.keyboard.up('Shift');await page.screenshot({path:`${output}/final.png`});
}catch(error){failure=error.stack;console.log(error.stack)}finally{await writeFile(`${output}/result.json`,JSON.stringify({failure,errors,samples:samples.length},null,2));await browser.close()}
if(failure)process.exitCode=1;
