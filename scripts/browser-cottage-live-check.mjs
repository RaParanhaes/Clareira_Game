// Live visitor journey through normal UI/input. No teleports, role changes or
// loading-overlay bypass. Art-only proof remains a separate browser script.
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
const output=process.argv[2]||'logs/cottage-art-revision/browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,ignoreHTTPSErrors:true});
const page=await context.newPage(),errors=[],result={status:'pending',errors};page.on('pageerror',e=>errors.push(e.message));
const inspect=()=>page.evaluate(()=>window.cottageInspect());
const ready=()=>page.waitForFunction(()=>{const s=window.cottageInspect();return s.readiness.sceneReady&&s.readiness.predictionReady&&s.readiness.connected&&!s.readiness.loading;},null,{timeout:90000});
try{
 // Keep one actual client version for this journey. A preview update reloads
 // the document and discards instrumentation midway through the prologue.
 const version=await (await context.request.get('https://vmi3579939.contaboserver.net/dev/update-version')).json();
 await page.route('**/dev/update-version**',route=>route.fulfill({json:version}));
 result.clientVersionPinned=version;
 await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#scene-loading:not([hidden])').waitFor({state:'hidden',timeout:120000});
 await page.getByRole('button',{name:'Jogar como visitante',exact:true}).click();
 await page.waitForSelector('.shell.is-authenticated',{timeout:60000});
 await page.evaluate(async()=>{window.cottageInspect=(await import('/dev/main.js')).inspectMovement;});
 await ready();console.log('Live world ready');
 let state=await inspect();
 if(state.dimensionId.startsWith('arrival-')){
   await page.waitForFunction(()=>window.cottageInspect().arrivalCinematicAgeMs>4000,null,{timeout:20000});
   await page.locator('#world').focus();
   for(let i=0;i<12;i++){
     await page.keyboard.down('ArrowDown');await page.waitForTimeout(1000);await page.keyboard.up('ArrowDown');state=await inspect();
     if(!state.dimensionId.startsWith('arrival-')||state.teleport.active)break;
   }
   await page.keyboard.up('ArrowDown');
   await page.waitForFunction(()=>window.cottageInspect().dimensionId==='surface',null,{timeout:60000});await ready();
 }
 state=await inspect();result.start={dimensionId:state.dimensionId,position:state.position};
 if(state.dimensionId!=='surface')throw Error('The visitor has not reached the surface through the normal prologue');
 const building=await page.evaluate(async()=>{const {VILLAGE_BUILDINGS}=await import('/dev/village-buildings.mjs');return VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-one');});
 const target={x:building.door.x,y:building.bounds.bottom+1.8};
 for(let i=0;i<35;i++){
   state=await inspect();if(Math.hypot(state.position.x-target.x,state.position.y-target.y)<.6)break;
   const point=await page.evaluate(async target=>{
     const s=window.cottageInspect(),world=await import('/dev/world.mjs'),{surfaceHeight,HEIGHT_PIXELS}=await import('/dev/elevation.mjs');
     const box=document.querySelector('#world').getBoundingClientRect(),p=s.projection;
     const project=point=>({x:box.x+p.centerX+(point.x-point.y)*p.tileX-Math.round((s.camera.x-s.camera.y)*p.tileX),y:box.y+p.centerY+(point.x+point.y)*p.tileY-Math.round((s.camera.x+s.camera.y)*p.tileY)-surfaceHeight(point.x,point.y,s.location)*HEIGHT_PIXELS*p.spriteScale});
     const path=world.findWalkPath(s.position,target,[],'clearing',[],s.firePositions);
     const candidates=path.filter(v=>Math.hypot(v.x-s.position.x,v.y-s.position.y)<=6).map(project).filter(v=>v.x>box.x+30&&v.x<box.right-30&&v.y>box.y+30&&v.y<box.bottom-30);
     return candidates.at(-1)||null;
   },target);
   if(!point)throw Error('No visible reachable next step to the cottage');
   await page.mouse.click(point.x,point.y);await page.waitForTimeout(1200);
 }
 state=await inspect();
 if(Math.hypot(state.position.x-target.x,state.position.y-target.y)>1)throw Error('Visitor did not reach the cottage within the bounded walk');
 result.atCottage={position:state.position,server:state.server,dimensionId:state.dimensionId,ready:state.readiness};
 await page.screenshot({path:output+'/live-cottage-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000);
 await page.screenshot({path:output+'/live-cottage-mobile.png'});
 const touch=await page.locator('#world').boundingBox();
 await page.touchscreen.tap(touch.x+touch.width*.51,touch.y+touch.height*.69);await page.waitForTimeout(1200);
 result.afterTouch={position:(await inspect()).position};
 result.status='live-game-pass';
}catch(e){
 result.status='pending';result.reason=e.message.slice(0,1000);
 try{result.state=await inspect();}catch{result.loading=await page.locator('#scene-loading').getAttribute('data-phase').catch(()=>null);}
 await page.screenshot({path:output+'/live-cottage-pending.png'}).catch(()=>{});
 console.error(result.reason);process.exitCode=1;
}finally{
 await writeFile(output+'/live-cottage-result.json',JSON.stringify(result,null,2)+'\n');await browser.close();
}
console.log(JSON.stringify({status:result.status,reason:result.reason,errors},null,2));
