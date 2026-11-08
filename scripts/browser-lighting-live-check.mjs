import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/lights-furniture/live-focused';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox'],headless:true});
const results=[];
try{
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844],['small',320,640]]){
  console.log(`Checking ${name}`);
  const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/dev/update-version**',route=>route.fulfill({json:{version:'lighting-live-check'}}));
  try{
   await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
   await page.locator('#guest-form button').click();
   await page.waitForSelector('.shell.is-authenticated');
   await page.evaluate(async()=>window.liveLightingCheck=(await import('/dev/main.js')).inspectMovement);
   await page.waitForFunction(()=>window.liveLightingCheck()?.readiness.sceneReady);
   const state=()=>page.evaluate(()=>window.liveLightingCheck());
   const before=await state();await page.locator('#world').focus();
   if(width<600){
    const box=await page.locator('[data-move="0,1"]').boundingBox(),cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
    await page.waitForTimeout(550);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   }else{await page.keyboard.down('ArrowDown');await page.waitForTimeout(550);await page.keyboard.up('ArrowDown');}
   await page.waitForTimeout(800);const stopped=await state();await page.waitForTimeout(300);const settled=await state();
   assert.ok(Math.hypot(settled.position.x-before.position.x,settled.position.y-before.position.y)>.25,'walking moves the actor');
   assert.ok(Math.hypot(settled.position.x-stopped.position.x,settled.position.y-stopped.position.y)<.06,'release stops movement');
   assert.ok(Math.hypot(settled.position.x-settled.server.x,settled.position.y-settled.server.y)<.08,'server and client agree');
   const walk=async target=>{
    const s=await state(),p=s.projection;
    const x=p.centerX+(target.x-target.y)*p.tileX-Math.round((s.camera.x-s.camera.y)*p.tileX);
    const y=p.centerY+(target.x+target.y)*p.tileY-Math.round((s.camera.x+s.camera.y)*p.tileY);
    assert.ok(x>5&&x<width-5&&y>5&&y<height-5,'walk target is visible');
    await page.mouse.click(x,y);
    await page.waitForFunction(target=>{const s=window.liveLightingCheck();return Math.hypot(s.position.x-target.x,s.position.y-target.y)<.25;},target,{timeout:15000});
   };
   if(name==='desktop'){
    const door=await page.evaluate(async()=>({...((await import('/dev/world.mjs')).CLEARING_DOOR)}));
    await walk(door);await page.waitForTimeout(500);await page.keyboard.press('e');
    await page.waitForFunction(()=>window.liveLightingCheck().location==='room'&&window.liveLightingCheck().readiness.sceneReady);
    const layout=await page.evaluate(async()=>{const s=window.liveLightingCheck();return (await import('/dev/world.mjs')).getRoomLayout(s.roomKind,s.roomBuildingId);});
    const corner={x:layout.bounds.right-.6,y:layout.bounds.bottom-.4};
    await walk(corner);await page.screenshot({path:`${output}/reception.png`});
    if(layout.elevation==='flat'){
     await walk({x:layout.door.x,y:layout.bounds.bottom-.55});
     const s=await state(),p=s.projection,target=layout.spawn;
     await page.mouse.click(p.centerX+(target.x-target.y)*p.tileX-Math.round((s.camera.x-s.camera.y)*p.tileX),
      p.centerY+(target.x+target.y)*p.tileY-Math.round((s.camera.x+s.camera.y)*p.tileY));
    }else{await walk(layout.spawn);await page.waitForTimeout(500);await page.locator('#world').focus();await page.keyboard.press('e');}
    await page.waitForFunction(()=>window.liveLightingCheck().location==='clearing'&&window.liveLightingCheck().readiness.sceneReady);
   }
   await page.screenshot({path:`${output}/${name}.png`});assert.deepEqual(errors,[]);
   results.push({name,passed:true,errors,lightSources:(await state()).lightSources});
  }catch(error){await page.screenshot({path:`${output}/${name}-failure.png`}).catch(()=>{});await writeFile(`${output}/${name}-failure.json`,JSON.stringify({error:error.message,errors,state:await page.evaluate(()=>window.liveLightingCheck?.()).catch(()=>null)},null,2));throw error;}
  finally{await context.close();}
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({name,passed})=>({name,passed}))));
}finally{await browser.close();}
