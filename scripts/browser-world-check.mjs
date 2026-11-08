import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { ARRIVAL_CAMERA_HOLD_MS } from '../game/arrival-cinematic.mjs';
const output=process.argv[2]||'/opt/game-agent/logs/world-browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const FIRE_JUMP_LIMIT=.65,MAX_RENDER_BACKSTEP=.3;
const results=[];
let activePage,activeName;
const viewports=[['desktop',{width:1440,height:900},false,0],['delayed',{width:1440,height:900},false,80],['mobile',{width:390,height:844},true,0],['small',{width:320,height:640},true,0]];
const inspect=page=>page.evaluate(async()=> (await import('/dev/main.js')).inspectMovement());
async function worldPoint(page,x,y){
 const state=await inspect(page),box=await page.locator('#world').boundingBox(),p=state.projection;
 const elevation=await page.evaluate(async({x,y,state})=>{
  const [{surfaceHeight,HEIGHT_PIXELS},{getRoomLayout}]=await Promise.all([import('/dev/elevation.mjs'),import('/dev/world.mjs')]);
  return surfaceHeight(x,y,state.location,getRoomLayout(state.roomKind,state.roomBuildingId,state.roomLodgingMode))*HEIGHT_PIXELS;
 },{x,y,state});
 return {x:box.x+p.centerX+(x-y)*p.tileX-Math.round((state.camera.x-state.camera.y)*p.tileX),
  y:box.y+p.centerY+(x+y)*p.tileY-Math.round((state.camera.x+state.camera.y)*p.tileY)-elevation*p.spriteScale};
}
async function clickWorld(page,x,y,mobile=false){
 const p=await worldPoint(page,x,y);
 if(mobile)await page.touchscreen.tap(p.x,p.y);
 else await page.mouse.click(p.x,p.y);
}
async function bringWorldTargetIntoView(page,x,y){
 for(let attempt=0;attempt<16;attempt++){
  const box=await page.locator('#world').boundingBox(),p=await worldPoint(page,x,y);
  const screenX=p.x-box.x,screenY=p.y-box.y;
  if(screenX>=20&&screenX<=box.width-20&&screenY>=20&&screenY<=box.height-20)return;
  const key=screenY<20?'ArrowUp':screenY>box.height-20?'ArrowDown':screenX<20?'ArrowLeft':'ArrowRight';
  await page.keyboard.down(key);await page.waitForTimeout(250);await page.keyboard.up(key);await page.waitForTimeout(80);
 }
 assert.fail('the shelter did not enter the viewport during the return trip');
}
try {
 for(const [name,viewport,mobile,lag] of viewports.filter(([name])=>!process.env.CHECK_ONLY||process.env.CHECK_ONLY.split(',').includes(name))){
  console.log(name,"begin"); const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];activePage=page;activeName=name;page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.addInitScript(()=>{const Native=WebSocket;window.testSockets=[];window.pointerTrace=[];window.addEventListener('pointerdown',e=>window.pointerTrace.push({type:'down',id:e.pointerId,pointerType:e.pointerType,target:e.target?.dataset?.move||e.target?.id}),true);window.addEventListener('pointerup',e=>window.pointerTrace.push({type:'up',id:e.pointerId,pointerType:e.pointerType,target:e.target?.dataset?.move||e.target?.id}),true);window.WebSocket=class extends Native{constructor(...args){super(...args);window.testSockets.push(this)}}});
  if(lag)await page.addInitScript(delay=>{
   const add=WebSocket.prototype.addEventListener,send=WebSocket.prototype.send;
   WebSocket.prototype.addEventListener=function(type,fn,options){return add.call(this,type,type==='message'?e=>setTimeout(()=>fn.call(this,e),delay):fn,options)};
   WebSocket.prototype.send=function(data){setTimeout(()=>{if(this.readyState===1)send.call(this,data)},delay)};
  },lag);
  await page.route('**/dev/update-version**',route=>route.fulfill({json:{version:'lights-furniture-browser-review'}}));
  await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
  const loginGateStartedAt=Date.now();
  await page.waitForFunction(()=>window.__clareiraMainLoadingProgressReady===true
   &&document.querySelector('#scene-loading')?.hidden===false&&document.querySelector('.shell')?.inert===true,null,{timeout:60000});
  await page.waitForFunction(()=>window.__clareiraMainLoadingProgressReady===true
   &&document.querySelector('#scene-loading')?.hidden===true&&!document.querySelector('.shell')?.inert,null,{timeout:90000});
  const loginGateMs=Date.now()-loginGateStartedAt;
  await page.locator('#guest-form button[type=submit]').click();
  await page.waitForSelector('.shell.is-authenticated');await page.evaluate(async()=>{window.checkMovement=(await import('/dev/main.js')).inspectMovement});await page.waitForFunction(()=>Boolean(window.checkMovement().server));
  await page.waitForFunction(()=>{const state=window.checkMovement();return state.readiness.sceneReady&&state.readiness.predictionReady&&!state.readiness.loading&&state.readiness.connected});
  await page.waitForFunction(holdMs=>{const age=window.checkMovement().arrivalCinematicAgeMs;return age===null||age>=holdMs},ARRIVAL_CAMERA_HOLD_MS);
  await page.waitForTimeout(500);await page.locator('#world').focus();
  if(name==='desktop'&&!process.env.REVIEW_BUILDINGS){
   const beforeJump=await inspect(page),fire=beforeJump.firePositions[0];
   if(fire&&!beforeJump.arrivalTutorial){
    const approachClearance=await page.evaluate(async()=>{const [{FIRE_RADIUS},{PLAYER_RADIUS}]=await Promise.all([import('/dev/obstacle-collision.mjs'),import('/dev/world.mjs')]);return FIRE_RADIUS+PLAYER_RADIUS+.15});
    const approach={x:fire.x+approachClearance,y:fire.y};await clickWorld(page,approach.x,approach.y);
    await page.waitForFunction(({x,y})=>{const state=window.checkMovement();return Math.hypot(state.position.x-x,state.position.y-y)<.5||state.arrivalTutorial?.phase!=='welcome'},approach,{timeout:15000});
    const firstApproach=await inspect(page);
    if(Math.hypot(firstApproach.position.x-approach.x,firstApproach.position.y-approach.y)>=.5){
     await clickWorld(page,approach.x,approach.y);
    }
    await page.waitForFunction(({x,y})=>{const p=window.checkMovement().position;return Math.hypot(p.x-x,p.y-y)<.5},approach,{timeout:15000});
    await page.waitForFunction(()=>!window.checkMovement().walkTarget&&!window.checkMovement().nextWaypoint,{},{timeout:10000});
    const start=await inspect(page);
    const direction=await page.evaluate(async ({start,fire})=>{
     const {screenDirectionToWorld}=await import('/dev/input.mjs');
     const choices=[
      {keys:['ArrowUp'],x:0,y:-1},{keys:['ArrowDown'],x:0,y:1},
      {keys:['ArrowLeft'],x:-1,y:0},{keys:['ArrowRight'],x:1,y:0},
      {keys:['ArrowUp','ArrowLeft'],x:-1,y:-1},{keys:['ArrowUp','ArrowRight'],x:1,y:-1},
      {keys:['ArrowDown','ArrowLeft'],x:-1,y:1},{keys:['ArrowDown','ArrowRight'],x:1,y:1},
     ];
     return choices.map(choice=>{const d=screenDirectionToWorld(choice,8,4.5),rx=fire.x-start.position.x,ry=fire.y-start.position.y;
      return {...choice,dot:rx*d.x+ry*d.y,perpendicular:Math.abs(rx*d.y-ry*d.x)};})
      .filter(choice=>choice.dot>0).sort((a,b)=>a.perpendicular-b.perpendicular)[0];
    },{start,fire});
    assert.ok(direction&&direction.perpendicular<FIRE_JUMP_LIMIT,`jump line must pass over the fire: ${direction?.perpendicular}`);
    const trace=[start];for(const key of direction.keys)await page.keyboard.down(key);await page.keyboard.down('Space');
    for(let index=0;index<12;index++){await page.waitForTimeout(80);trace.push(await inspect(page));}
    await page.keyboard.up('Space');for(const key of direction.keys)await page.keyboard.up(key);await page.waitForTimeout(500);
    const landed=await inspect(page),distanceToFire=Math.hypot(landed.position.x-fire.x,landed.position.y-fire.y);
    assert.ok(trace.some(sample=>Math.hypot(sample.position.x-fire.x,sample.position.y-fire.y)<.9
      &&((sample.position.z||0)>=.28||sample.position.fireJumping===true)),'jump clears the fire collider');
    assert.ok(distanceToFire>1,`player exits the far side of the fire: ${distanceToFire}`);
    assert.ok(Math.hypot(landed.position.x-landed.server.x,landed.position.y-landed.server.y)<.05,'jump stays in sync with the server');
    console.log('campfire jump passed',JSON.stringify({fire,landed:landed.position,server:landed.server}));
   }
  }
  const samples=[await inspect(page)];
  await page.evaluate(()=>{window.motionSamples=[];window.recordMotion=true;function sample(){if(!window.recordMotion)return;window.motionSamples.push(window.checkMovement());requestAnimationFrame(sample)}sample()});
  if(mobile){
   const start=await inspect(page);
   await clickWorld(page,start.position.x+1.8,start.position.y+1.8,true);
   assert.ok((await page.evaluate(()=>window.pointerTrace)).some(event=>event.type==='down'&&event.pointerType==='touch'&&event.target==='world'),'mobile movement uses a touch on the world');
  }else await page.keyboard.down('ArrowDown');
  for(let i=0;i<15;i++){await page.waitForTimeout(100);samples.push(await inspect(page));}
  if(!mobile)await page.keyboard.up('ArrowDown');
  if(name==='desktop')for(let i=0;i<45;i++){await page.waitForTimeout(100);samples.push(await inspect(page));}
  await page.waitForTimeout(700);const stopped=await inspect(page);await page.waitForTimeout(300);const settled=await inspect(page);
  if(mobile)console.log(name,'stop diagnostics',JSON.stringify({start:samples[0].position,stopped:stopped.position,settled:settled.position,server:settled.server,focus:await page.evaluate(()=>({id:document.activeElement?.id,tag:document.activeElement?.tagName})),pointerTrace:await page.evaluate(()=>window.pointerTrace.slice(-12))}));
  const dense=await page.evaluate(()=>{window.recordMotion=false;return window.motionSamples});
  const isTransitFrame=sample=>sample.teleport?.active||sample.teleport?.local;
  const renderedDeltas=dense.slice(1).flatMap((sample,index)=>sample.dimensionId===dense[index].dimensionId
   &&!isTransitFrame(sample)&&!isTransitFrame(dense[index])
   ?[sample.rendered.x+sample.rendered.y-dense[index].rendered.x-dense[index].rendered.y]:[]);
  assert.ok(renderedDeltas.length,`${name}: render samples in a stable dimension`);
  const minRenderedDelta=Math.min(...renderedDeltas);
  assert.ok(minRenderedDelta>-MAX_RENDER_BACKSTEP,`${name}: visible backwards step ${minRenderedDelta}`);
  const sourceDimension=samples[0].dimensionId,localSamples=samples.filter(sample=>sample.dimensionId===sourceDimension&&!isTransitFrame(sample));
  assert.ok(localSamples.length>1,`${name}: movement samples in the starting dimension`);
  const progress=localSamples.map(s=>s.position.x+s.position.y),backs=progress.slice(1).map((v,i)=>v-progress[i]);
  assert.ok(progress.at(-1)-progress[0]>1,`${name}: movement`);
  assert.ok(Math.min(...backs)>-.05,`${name}: backward correction ${Math.min(...backs)}`);
  if(settled.dimensionId===stopped.dimensionId)
   assert.ok(Math.hypot(settled.position.x-stopped.position.x,settled.position.y-stopped.position.y)<.03,`${name}: stop`);
  assert.ok(Math.hypot(settled.position.x-settled.server.x,settled.position.y-settled.server.y)<.05,`${name}: client/server agreement`);
  console.log(name,"walk passed");
  let journey=null;
  const arrival=await inspect(page);
  if(arrival.dimensionId.startsWith('arrival-')&&arrival.arrivalTutorial&&!arrival.arrivalTutorial.completed){
   const sent=await page.evaluate(()=>{const socket=window.testSockets.at(-1);if(!socket||socket.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({type:'action',name:'arrivalTutorialChoice',choice:'skip'}));return true});
   assert.ok(sent,'connected session can request the supported tutorial skip');
   await page.waitForFunction(()=>{const state=window.checkMovement();return state.dimensionId==='surface'&&state.readiness.sceneReady&&!state.readiness.loading&&!state.teleport.active},{},{timeout:30000});
  }
  if(mobile)await page.locator('.mobile-menu-toggle').click();
  await page.locator('#help-toggle').click();assert.equal(await page.locator('#game-help').isVisible(),true);
  if(mobile)await page.locator('.mobile-menu-toggle').click();
  await page.locator('#help-toggle').click();
  if(name==='desktop'){
   let collected=null;
   if(!process.env.REVIEW_BUILDINGS){
   const state=await inspect(page);const branch=state.resourceNodes.filter(r=>r.kind==='wood').sort((a,b)=>Math.hypot(a.x-state.position.x,a.y-state.position.y)-Math.hypot(b.x-state.position.x,b.y-state.position.y))[0];
   console.log("pickup path",branch);await clickWorld(page,branch.x,branch.y);await page.waitForFunction(target=>{const {position:p}=window.checkMovement();return Math.hypot(p.x-target.x,p.y-target.y)<.5},branch,{timeout:20000});
   console.log("pickup reached"); await page.locator('#world').focus();await page.keyboard.press('e');await page.waitForFunction(()=>window.checkMovement().inventory.wood>=1,null,{timeout:4000});collected=String(await page.evaluate(()=>window.checkMovement().inventory.wood));assert.ok(Number(collected)>=1,'branch pickup');
   }
   console.log("shelter path");const door=await page.evaluate(async()=>{const{CLEARING_DOOR}=await import('/dev/world.mjs');return CLEARING_DOOR});await bringWorldTargetIntoView(page,door.x,door.y);await clickWorld(page,door.x,door.y);await page.waitForFunction(({x,y})=>{const p=window.checkMovement().position;return Math.hypot(p.x-x,p.y-y)<.8},door,{timeout:20000});
   await page.waitForTimeout(700);await page.keyboard.press('e');await page.waitForFunction(()=>window.checkMovement().location==='room');
   await page.waitForFunction(()=>window.checkMovement().readiness.sceneReady);
   assert.equal(await page.locator('#lodging-dialog').evaluate(dialog=>dialog.open),false,'entering a building reveals the room before service panels');
   const roomInfo=await page.evaluate(async()=>{
    const s=window.checkMovement(),{getRoomLayout}=await import('/dev/world.mjs');
    const l=getRoomLayout(s.roomKind,s.roomBuildingId);return {bounds:l.bounds,door:l.door,spawn:l.spawn,service:s.placeServices.find(p=>p.id==='reception')};
   });
   const corner={x:roomInfo.bounds.right-.6,y:roomInfo.bounds.bottom-.4};
   await clickWorld(page,corner.x,corner.y);
   await page.waitForFunction(target=>{const s=window.checkMovement();return Math.hypot(s.position.x-target.x,s.position.y-target.y)<.3},corner);
   await clickWorld(page,roomInfo.service.x,roomInfo.service.y);
   await page.waitForFunction(target=>{const s=window.checkMovement();return Math.hypot(s.position.x-target.x,s.position.y-target.y)<=target.radius},roomInfo.service);
   await page.keyboard.press('e');await page.waitForSelector('#lodging-dialog[open]');await page.locator('#lodging-close').click();
   await page.screenshot({path:`${output}/room.png`});
   await clickWorld(page,roomInfo.door.x,roomInfo.door.y);
   await page.waitForFunction(target=>{const s=window.checkMovement();return s.location==='clearing'||Math.hypot(s.position.x-target.x,s.position.y-target.y)<.3},roomInfo.door);
   if((await inspect(page)).location==='room'){
    await page.locator('#world').focus();
    await page.keyboard.press('e');
   }
   await page.waitForFunction(()=>window.checkMovement().location==='clearing');
   await page.waitForFunction(()=>{const state=window.checkMovement();return state.readiness.sceneReady&&!state.readiness.loading});
   const exit=await inspect(page),focusAfterExit=await page.evaluate(()=>({id:document.activeElement?.id,tag:document.activeElement?.tagName}));
   await page.keyboard.down('ArrowDown');await page.waitForTimeout(500);await page.keyboard.up('ArrowDown');await page.waitForTimeout(250);const afterExit=await inspect(page);
   console.log('shelter exit movement',JSON.stringify({exit:exit.position,afterExit:afterExit.position,server:afterExit.server,readiness:afterExit.readiness,focusAfterExit}));
   await page.screenshot({path:`${output}/after-shelter-exit.png`});
   assert.ok(Math.hypot(exit.position.x-afterExit.position.x,exit.position.y-afterExit.position.y)>.5,'free shelter exit');journey={collected,exit:exit.position,afterExit:afterExit.position};
   const initialChunkRange=afterExit.loadedWorldChunkRange,initialStreamPosition=afterExit.position;
   const coordinateOffset=await page.evaluate(async()=>(await import('/dev/world.mjs')).DIMENSION_COORDINATE_OFFSET);
   for(const baseTarget of [{x:10,y:24},{x:14,y:30}]){
    const target=await page.evaluate(async({x,y})=>{
     const {canOccupy,findWalkPath}=await import('/dev/world.mjs'),start=window.checkMovement().position;
     for(const [dx,dy] of [[0,0],[0,.5],[.5,0],[-.5,0],[0,-.5],[0,1],[1,0],[-1,0],[0,-1]]){
      const candidate={x:x+dx,y:y+dy};
      if(canOccupy(candidate,.32)&&findWalkPath(start,candidate).length)return candidate;
     }
     throw new Error('No clear streaming waypoint near the village path');
    },{x:baseTarget.x+coordinateOffset,y:baseTarget.y+coordinateOffset});
    console.log('streaming waypoint',target);
    await bringWorldTargetIntoView(page,target.x,target.y);
    await clickWorld(page,target.x,target.y);
    await page.waitForFunction(({x,y})=>{const p=window.checkMovement().position;return Math.hypot(p.x-x,p.y-y)<.75},target,{timeout:15000});
   }
   await page.waitForFunction(()=>{const s=window.checkMovement();return !s.walkTarget&&!s.nextWaypoint},{},{timeout:10000});
   await page.waitForTimeout(250);
   const streamed=await inspect(page);
   assert.notEqual(streamed.loadedWorldChunkRange,initialChunkRange,'walking loads the newly visible world chunks');
   assert.ok(Math.hypot(streamed.position.x-initialStreamPosition.x,streamed.position.y-initialStreamPosition.y)>8,'streaming walk crossed into new chunks');
   journey.streamedChunkRange=streamed.loadedWorldChunkRange;journey.streamedVisibleTrees=streamed.visibleTreeCount;
  }
  if(name==='desktop'){
    const before=await inspect(page);await page.evaluate(()=>window.testSockets.at(-1).close());
    await page.waitForFunction(()=>window.testSockets.length>=2&&window.testSockets.at(-1).readyState===1&&window.checkMovement().server);
    await page.waitForTimeout(400);const after=await inspect(page);
    assert.ok(Math.hypot(before.position.x-after.position.x,before.position.y-after.position.y)<.05,'reconnection preserves position');
    assert.equal(after.inventory.wood,before.inventory.wood,'guest keeps bag on short reconnect');
  }
  const frameTimes=await page.evaluate(()=>new Promise(resolve=>{const deltas=[];let last;function tick(time){if(last)deltas.push(time-last);last=time;if(deltas.length===90)resolve(deltas);else requestAnimationFrame(tick)}requestAnimationFrame(tick)}));
  await page.screenshot({path:`${output}/${name}.png`});assert.deepEqual(errors,[]);
  results.push({name,errors,loginGateMs,progress:progress.at(-1)-progress[0],minimumStep:Math.min(...backs),minRenderedDelta,maxPending:Math.max(...samples.map(s=>s.pending)),stopped:settled,journey,frameMs:{median:frameTimes.sort((a,b)=>a-b)[45],p95:frameTimes[85],max:frameTimes.at(-1)}});
  await context.close();await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));
 }
}catch(error){
 if(activePage&&!activePage.isClosed()){
  await activePage.screenshot({path:`${output}/${activeName}-failed.png`}).catch(()=>{});
  const state=await inspect(activePage).catch(()=>null);
  const motionSamples=await activePage.evaluate(()=>window.motionSamples?.map(sample=>({
   dimensionId:sample.dimensionId,position:sample.position,rendered:sample.rendered,renderCorrection:sample.renderCorrection,
   server:sample.server,pending:sample.pending,arrivalCinematicAgeMs:sample.arrivalCinematicAgeMs,
   teleport:sample.teleport,arrivalTutorial:sample.arrivalTutorial,
  }))||[]).catch(()=>[]);
  await writeFile(`${output}/${activeName}-failed.json`,JSON.stringify({error:error.message,state,motionSamples},null,2));
 }
 throw error;
}finally{await browser.close();}
console.log(JSON.stringify(results.map(({name,errors,loginGateMs,minimumStep,maxPending,journey,frameMs})=>({name,errors,loginGateMs,minimumStep,maxPending,journey,frameMs}))));
