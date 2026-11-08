import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import WebSocket from 'ws';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {createPreviewServer} from './dev-preview-page.mjs';
import {createDevPreviewBridge} from './dev-preview-bridge.mjs';
import {createPrototypeServer} from './prototype-server.mjs';
const output=process.argv[2]||'logs/20261105-fix-dusk-lighting';
const windowCheck=process.argv.includes('--windows');
const campfireCheck=process.argv.includes('--campfire');
const shadowCheck=process.argv.includes('--shadows');
const buildingCheck=process.argv.includes('--buildings');
const shadowCompare=process.argv.includes('--shadow-compare');
const actorCheck=process.argv.includes('--actor')||shadowCheck;
const directory=await mkdtemp(path.join(os.tmpdir(),'clareira-dusk-'));
await mkdir(output,{recursive:true});
const base='http://127.0.0.1:18442';
const preview=createPreviewServer({port:0,stateDirectory:directory,allowedOrigin:base});
const room=createPrototypeServer({port:18443,stateDirectory:directory,allowedOrigin:base});
let bridge,browser;
try{
 const address=await preview.listen();bridge=createDevPreviewBridge(address,{port:18442});await bridge.listen();await room.listen();
 let source=await readFile('game/main.js','utf8');
 source=source.replace('function gameDayTimestampMs() {',`function gameDayTimestampMs() { return ${process.argv.includes('--afternoon')?900000:process.argv.includes('--lateafternoon')?957000:process.argv.includes('--midnight')?65000+(process.argv.includes('--fullmoon')?5760000:0):process.argv.includes('--day')?720000:1182000};`);
 if(!windowCheck){
  source=source.replace('mask.globalAlpha=exteriorNightOpacity(gameDay,{theme:dimensionTheme,dimensionId:worldDimensionId});',"mask.globalAlpha=window.lightingLegacy ? .997*gameDay.night : exteriorNightOpacity(gameDay,{theme:dimensionTheme,dimensionId:worldDimensionId});");
  source=source.replace('paintSceneLightmaps(mask,.72);','paintSceneLightmaps(mask,window.lightingLegacy?.95:.72);');
 }else{
  source=source.replace('for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){\n     const b=building.bounds,h=building.height;', 'for(const building of (window.lightingLegacy?[]:[RECEPTION_BUILDING,...VILLAGE_BUILDINGS])){\n     const b=building.bounds,h=building.height;');
  source=source.replace('paintSceneLightmaps(mask,.14*nightFactor);','paintSceneLightmaps(mask,window.lightingLegacy?0:.14*nightFactor);');
 }
 if(shadowCompare){
  const original=source;
  source=source.replace("if(worldDimensionId==='surface')for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){", "if(!window.disableBuildingShadows&&worldDimensionId==='surface')for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){");
  assert.notEqual(source,original,'building shadow comparison hook must match the production pass');
  source=source.replace('    const groundShadow=attenuateShadowWithLocalLight(buildingGroundShadowStrength(direction),localFill);', '    const groundShadow=attenuateShadowWithLocalLight(buildingGroundShadowStrength(direction),localFill);if(window.buildingShadowProbe)window.buildingShadowProbe.push({id:building.id,strength:groundShadow,hull:hull.map(p=>({x:p.x,y:p.y}))});');
 }
 source+='\nwindow.captureLighting=legacy=>{window.lightingLegacy=legacy;sceneLightKey="";nightMaskKey="";paintSceneLightmaps(null,0);for(let i=0;i<500&&lightmapStats().pending;i++)processLightmapQueue(20,100000);};';
 source+='\nwindow.requestWindowWalk=target=>requestWalkPath(target);window.projectWindowProbe=(x,y)=>point(x,y,camera,surfaceHeight(x,y,"clearing"));window.actorWindowProbe=id=>{const s=currentSceneLights();return actorWindowLight(localRenderPosition,s.lights.filter(l=>l.id===id),s.obstacles,surfaceHeight(localRenderPosition.x,localRenderPosition.y,"clearing"),AVATAR_SPRITE_SPEC.baseHeight*AVATAR_BODY_SCALE/HEIGHT_PIXELS);};';
 if(process.argv.includes('--midnight')){
  source=source.replace('function paintFirelightColor(time, intensity = 1){', 'function paintFirelightColor(time, intensity = 1){ if(window.checkingNightPass)window.actorLightViolations=(window.actorLightViolations||0)+1;');
  source=source.replace('function paintSceneLightmaps(context,alpha){', 'function paintSceneLightmaps(context,alpha){ if(window.checkingNightPass&&context===ctx)window.actorLightViolations=(window.actorLightViolations||0)+1;');
  source=source.replace('  drawNight();', '  window.checkingNightPass=true;drawNight();window.checkingNightPass=false;');
  source=source.replace('  const drawBody=()=>{', "  const drawBody=()=>{window.actorBodyState={alpha:ctx.globalAlpha,composition:ctx.globalCompositeOperation};");
  source+='\nwindow.checkActualActorOpacity=()=>{const saved=ctx,c=document.createElement("canvas");c.width=viewWidth;c.height=viewHeight;ctx=c.getContext("2d");ctx.globalAlpha=.25;ctx.globalCompositeOperation="screen";try{drawAvatar(livePlayers.get(selfId)||{id:selfId},worldClock,true);const p=point(localRenderPosition.x,localRenderPosition.y,camera,surfaceHeight(localRenderPosition.x,localRenderPosition.y,"clearing"));const pixelScale=spriteScale*AVATAR_BODY_SCALE;const left=Math.max(0,Math.round(p.x-10*pixelScale)),top=Math.max(0,Math.round(p.y-65*pixelScale));const pixels=ctx.getImageData(left,top,Math.max(1,Math.min(c.width-left,Math.ceil(20*pixelScale))),Math.max(1,Math.min(c.height-top,Math.ceil(55*pixelScale)))).data;let solid=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>240)solid++;return {solid,restoredAlpha:ctx.globalAlpha,restoredComposition:ctx.globalCompositeOperation};}finally{ctx=saved;}};';

 }
 source+='\nwindow.testAfternoon='+JSON.stringify(process.argv.includes('--afternoon')||process.argv.includes('--lateafternoon'))+';';
 source+='\nwindow.shadowSourceAudit=()=>({sky:{hasMoon:gameDay.hasMoon,moonlight:gameDay.moonlightStrength,sunlight:gameDay.sunlightStrength},actor:frameShadowDirectionAt(localRenderPosition.x,localRenderPosition.y),trees:visibleSolidTrees.map(tree=>{const d=frameShadowDirectionAt(tree.x,tree.y);return {x:tree.x,y:tree.y,source:d.source,strength:d.strength,treeOpacity:casterShadowOpacity(d.strength),actorOpacity:avatarShadowProfile({strength:d.strength}).castOpacity,direction:{x:d.x,y:d.y}};})});';
 source+='\nwindow.buildingShadowAudit=()=>[RECEPTION_BUILDING,...VILLAGE_BUILDINGS].map(building=>{const d=strongestBuildingShadowDirection(building.bounds,(x,y)=>frameShadowDirectionAt(x,y,building.id));return {id:building.id,source:d.source,strength:d.strength,lengthScale:d.lengthScale,direction:{x:d.x,y:d.y}};});';
 if(shadowCompare)source+='\nwindow.captureBuildingShadowPair=()=>{window.buildingShadowProbe=[];window.disableBuildingShadows=false;drawScene();const on=document.querySelector("#world").toDataURL(),onProbe=window.buildingShadowProbe;window.buildingShadowProbe=[];window.disableBuildingShadows=true;drawScene();const off=document.querySelector("#world").toDataURL(),offProbe=window.buildingShadowProbe;window.disableBuildingShadows=false;return {on,off,onProbe,offProbe};};';
 source+='\nwindow.projectionProbe=()=>{const d=frameShadowDirectionAt(localRenderPosition.x,localRenderPosition.y);const scale=spriteScale*AVATAR_BODY_SCALE;return {hours:gameDay.hours,direction:d,actor:avatarShadowProfile({scale,z:localRenderPosition.z,strength:d.strength,lengthScale:d.lengthScale}),bodyHeight:80*scale,buildings:[RECEPTION_BUILDING,...VILLAGE_BUILDINGS].map(b=>({id:b.id,height:b.height,roofRise:b.roofRise,hull:projectedRoofShadow(b,roofGeometry(b),(x,y)=>point(x,y),frameShadowDirectionAt((b.bounds.left+b.bounds.right)/2,(b.bounds.top+b.bounds.bottom)/2,true),HEIGHT_PIXELS*spriteScale)}))};};';
 source+='\nwindow.campfireProbe=()=>[...fires.values()].map(f=>({x:f.x,y:f.y,screen:point(f.x,f.y)}));';
 browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
 const results=[];
 for(const [name,width,height]of [['desktop',1440,900],['mobile',390,844]]){
  if(process.env.CHECK_ONLY&&process.env.CHECK_ONLY!==name)continue;
  const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});
  try{
   const registration=await context.request.post(base+'/auth/guest',{headers:{origin:base}});assert.equal(registration.status(),201);
   const token=registration.headers()['set-cookie'].match(/clareira_session=([^;]+)/)[1];
   await context.addCookies([{name:'clareira_session',value:token,url:base+'/dev/',httpOnly:true,sameSite:'Strict'}]);
   await context.addInitScript(()=>{Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{controller:{},ready:Promise.resolve({}),register:async()=>({}),addEventListener(){},removeEventListener(){}}});const Native=WebSocket;window.testSockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);window.testSockets.push(this);}};});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const version=createHash('sha256').update('[]').digest('hex');
   await page.route('**/dev/game-assets',r=>r.fulfill({json:{version,files:[]}}));await page.route('**/dev/update-version',r=>r.fulfill({json:{version}}));
   await page.route('**/dev/main.js',r=>r.fulfill({contentType:'text/javascript',body:source}));
   if(windowCheck){const lights=(await readFile('game/scene-lights.mjs','utf8')).replace('const reach=baseReach;', 'const reach=window.lightingLegacy?baseReach*(.9+.35*Math.sqrt(Math.max(.16,Math.min(1.5,sourceStrength/.8)))):baseReach;');await page.route('**/dev/scene-lights.mjs',r=>r.fulfill({contentType:'text/javascript',body:lights}));}
   await page.routeWebSocket('**/dev/room',socket=>{const upstream=new WebSocket('ws://127.0.0.1:18443/room',{headers:{origin:base,cookie:`clareira_session=${token}`}}),queue=[];socket.onMessage(m=>upstream.readyState===1?upstream.send(m):queue.push(m));upstream.on('open',()=>queue.forEach(m=>upstream.send(m)));upstream.on('message',m=>{try{socket.send(m.toString());}catch{}});upstream.on('error',e=>errors.push(e.message));socket.onClose(()=>upstream.terminate());});
   await page.goto(base+'/dev/',{waitUntil:'domcontentloaded'});
   await page.evaluate(async()=>window.lightingState=(await import('/dev/main.js')).inspectMovement);
   await page.waitForFunction(()=>window.lightingState().readiness.sceneReady,null,{timeout:60000});
   await page.locator('#arrival-tutorial-skip').evaluate(button=>button.click());
   await page.waitForFunction(()=>window.lightingState().dimensionId==='surface'&&window.lightingState().readiness.sceneReady,null,{timeout:60000});
   await page.waitForSelector('#scene-loading',{state:'hidden',timeout:30000});
   await page.waitForFunction(()=>!window.lightingState().teleport.active,null,{timeout:30000});
   if(shadowCompare){
    await page.evaluate(()=>window.captureLighting(false));await page.waitForTimeout(350);
    const pair=await page.evaluate(()=>window.captureBuildingShadowPair());
    assert.ok(pair.onProbe.length>0&&pair.offProbe.length===0,'the on/off frames must isolate actual house shadow draws');
    await writeFile(`${output}/${name}-building-shadows-on.png`,Buffer.from(pair.on.split(',')[1],'base64'));
    await writeFile(`${output}/${name}-building-shadows-off.png`,Buffer.from(pair.off.split(',')[1],'base64'));
    await writeFile(`${output}/${name}-building-shadow-pair-audit.json`,JSON.stringify({on:pair.onProbe,off:pair.offProbe},null,2));
   }
   let walkSamples=[];
   if(shadowCheck){
    const overlap=await page.evaluate(async()=>{
     const {createGroundShadowLayer}=await import('/dev/ground-shadow-layer.mjs');
     const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;const c=canvas.getContext('2d');
     const layer=createGroundShadowLayer(()=>document.createElement('canvas'));
     const shape=(left,opacity)=>layer.add({left,top:10,right:left+35,bottom:60},x=>{const v=Math.round(opacity*255);x.fillStyle=`rgb(${v},${v},${v})`;x.fillRect(left,10,35,50);});
     const render=order=>{c.globalCompositeOperation='source-over';c.fillStyle='#c8b48c';c.fillRect(0,0,80,80);layer.begin(80,80);for(const [left,opacity]of order)shape(left,opacity);layer.composite(c);return [...c.getImageData(0,0,80,80).data];};
     const first=render([[10,.4],[25,.4]]),reverse=render([[25,.4],[10,.4]]),duplicate=render([[10,.4],[10,.4]]),single=render([[10,.4]]);
     return {sameOrder:JSON.stringify(first)===JSON.stringify(reverse),idempotent:JSON.stringify(duplicate)===JSON.stringify(single),left:first[(30*80+15)*4],overlap:first[(30*80+30)*4],alpha:first[(30*80+30)*4+3]};
    });
    assert.ok(overlap.sameOrder,'shadow merge is independent of draw order');assert.ok(overlap.idempotent,'duplicate shadows do not darken twice');
    assert.equal(overlap.left,overlap.overlap,'overlap retains the strongest shade without a black seam');assert.equal(overlap.alpha,255);
    await writeFile(`${output}/${name}-shadow-overlap.json`,JSON.stringify(overlap,null,2));
   }
   if(campfireCheck){
    await page.evaluate(()=>window.captureLighting(false));
    const fire=await page.evaluate(()=>window.campfireProbe()[0]);assert.ok(fire,'world has a campfire');
    await page.evaluate(f=>window.requestWindowWalk({x:f.x+(window.testAfternoon?6:-3),y:f.y+(window.testAfternoon?1:3)}),fire);
    await page.waitForTimeout(6000);
    const screen=await page.evaluate(()=>window.campfireProbe()[0].screen);
    assert.ok(screen.x>0&&screen.x<width&&screen.y>0&&screen.y<height,'campfire visible');
    const raster=await page.evaluate(async()=>{
     const {drawCampfireFlames}=await import('/dev/campfire-flame-design.mjs');
     const c=document.createElement('canvas');c.width=40;c.height=40;const x=c.getContext('2d');
     const render=(t,reduce)=>{x.clearRect(0,0,40,40);drawCampfireFlames(x,20,36,t,2,reduce);return c.toDataURL();};
     return {animated:[render(0,false),render(.25,false),render(.5,false)],reduced:[render(0,true),render(5,true)]};
    });
    assert.equal(new Set(raster.animated).size,3,'flame pixels change independently of the scene');
    assert.equal(new Set(raster.reduced).size,1,'reduced motion freezes flame pixels');
    await page.evaluate(async()=>{
     const {drawCampfireFlames}=await import('/dev/campfire-flame-design.mjs');
     const c=document.createElement('canvas');c.id='campfire-design-proof';c.width=480;c.height=160;
     c.style='position:fixed;inset:0;z-index:999999;width:480px;height:160px;image-rendering:pixelated';
     const x=c.getContext('2d');x.fillStyle='#182321';x.fillRect(0,0,480,160);x.imageSmoothingEnabled=false;
     const base=new Image();base.src='/dev/art/fire/campfire-hearth-base.png';await base.decode();
     for(let i=0;i<4;i++){x.save();x.translate(i*120,0);x.scale(3,3);x.drawImage(base,0,8);drawCampfireFlames(x,20,44,i*.25,2);x.restore();}
     document.body.append(c);
    });
    await page.locator('#campfire-design-proof').screenshot({path:`${output}/${name}-flame-sequence.png`});
    await page.evaluate(()=>document.querySelector('#campfire-design-proof').remove());
    const frames=[];
    for(let frame=0;frame<4;frame++){
     await page.waitForTimeout(170);const shot=await page.screenshot({path:`${output}/${name}-fire-${frame}.png`});frames.push(createHash('sha256').update(shot).digest('hex'));
    }
    assert.ok(new Set(frames).size>1,'scene animates');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(400);
    await page.screenshot({path:`${output}/${name}-reduced-motion.png`});
    walkSamples={fire,screen,frames};
   }else if(actorCheck){
    const alpha=await page.evaluate(async()=>{const {applyAvatarSurfaceLight}=await import('/dev/avatar-surface-light.mjs');const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.fillStyle='#141414';x.fillRect(30,20,20,60);applyAvatarSurfaceLight(x,96,96,[.15,.85,1.55].map(height=>({height,amount:.8,color:'#efbc79'})));return {outside:[...x.getImageData(10,30,1,1).data],inside:[...x.getImageData(40,40,1,1).data]};});
    assert.equal(alpha.outside[3],0,'lighting cannot paint a halo outside the sprite');assert.equal(alpha.inside[3],255,'opaque actor pixels remain opaque');assert.ok(alpha.inside[0]>20&&alpha.inside[0]<70,'dark material receives light without becoming pastel');
    const edge=await page.evaluate(async()=>{const {applyAvatarSurfaceLight}=await import('/dev/avatar-surface-light.mjs');const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.fillStyle='rgba(20,20,20,.5)';x.fillRect(30,20,20,60);const before=[...x.getImageData(40,40,1,1).data];applyAvatarSurfaceLight(x,96,96,[{height:1,fraction:.5,amount:100,color:'#ffffff'}]);return {before,after:[...x.getImageData(40,40,1,1).data]};});
    assert.equal(edge.after[3],edge.before[3],'translucent sprite edges retain their original alpha');assert.ok(edge.after[0]<70,'even extreme light retains dark material detail');
    await page.evaluate(()=>window.captureLighting(false));
    const win=await page.evaluate(async()=>{const {RECEPTION_BUILDING}=await import('/dev/village-buildings.mjs');return (await import('/dev/architectural-elements.mjs')).buildingWindows(RECEPTION_BUILDING).filter(w=>w.ny===1).at(-1);});
    for(const [index,offset]of [-1.5,0,1.5].entries()){
     const target={x:win.x+offset,y:win.y+1.8};
     const screen=await page.evaluate(target=>window.projectWindowProbe(target.x,target.y),target);
     await page.evaluate(target=>window.requestWindowWalk(target),target);
     // The navigation solver can stop at the adjacent free point when an NPC
     // occupies the requested cell. Exposure is checked at the actual position.
     try{await page.waitForFunction(target=>{const s=window.lightingState(),p=s.position;return !s.walkPath.length&&Math.hypot(p.x-target.x,p.y-target.y)<.8;},target,{timeout:15000});}
     catch(error){await page.screenshot({path:`${output}/${name}-walk-failure.png`});await writeFile(`${output}/${name}-walk-failure.json`,JSON.stringify({target,screen,state:await page.evaluate(()=>window.lightingState())},null,2));throw error;}
     await page.waitForTimeout(350);
     const actorScreen=await page.evaluate(()=>{const p=window.lightingState().rendered;return window.projectWindowProbe(p.x,p.y);});
     assert.ok(actorScreen.x>0&&actorScreen.x<width&&actorScreen.y>0&&actorScreen.y<height,'the walking actor is visible in the capture');
     walkSamples.push({offset,position:await page.evaluate(()=>window.lightingState().position),light:await page.evaluate(id=>window.actorWindowProbe(id),win.id)});
     await page.screenshot({path:`${output}/${name}-walk-${index}.png`});
    }
    const amount=sample=>Math.max(0,...(sample.light||[]).map(value=>value.amount));
    assert.ok(amount(walkSamples[1])>amount(walkSamples[0])&&amount(walkSamples[1])>amount(walkSamples[2]),'walking in front of the window increases and then reduces exposure');
   }else for(const legacy of [true,false]){await page.evaluate(value=>window.captureLighting(value),legacy);await page.waitForTimeout(1800);await page.screenshot({path:`${output}/${name}-${legacy?'before':'after'}.png`});}
   if(process.argv.includes('--afternoon')||process.argv.includes('--lateafternoon')){
    const projection=await page.evaluate(()=>window.projectionProbe());
    assert.ok(projection.actor.castLength>15,'afternoon actor shadow extends visibly beyond its contact patch');
    assert.ok(Math.abs(projection.actor.castLength/projection.bodyHeight-projection.direction.lengthScale)<.001,'shadow length follows actual rendered actor height');
    assert.ok(projection.buildings.every(b=>b.hull.length>=3&&b.hull.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
    await writeFile(`${output}/${name}-projection.json`,JSON.stringify(projection,null,2));
   }
   if(process.argv.includes('--midnight')){
    const sources=await page.evaluate(()=>window.shadowSourceAudit());
    assert.ok(sources.trees.length>0);
    for(const tree of sources.trees){assert.equal(tree.treeOpacity,tree.actorOpacity,'trees and actors respond equally at the same position');if(tree.source.kind==='ambient'){assert.equal(tree.strength,0);assert.equal(tree.treeOpacity,0);}}
    if(process.argv.includes('--fullmoon')){assert.ok(sources.sky.hasMoon&&sources.sky.moonlight>0);assert.ok(sources.trees.some(tree=>tree.source.kind==='moon'&&tree.treeOpacity>0),'moonlight casts tree shadows');}
    else{assert.equal(sources.sky.moonlight,0);assert.ok(sources.trees.some(tree=>tree.source.kind==='ambient'),'unlit forest has no projected shadows');assert.ok(sources.trees.every(tree=>tree.source.kind!=='moon'&&tree.source.kind!=='sun'));}
    await writeFile(`${output}/${name}-source-audit.json`,JSON.stringify(sources,null,2));
    const audit=await page.evaluate(()=>({violations:window.actorLightViolations||0,body:window.actorBodyState}));
    assert.equal(audit.violations,0,'no diffuse color glow is drawn over actors during the night pass');
    const actual=await page.evaluate(()=>window.checkActualActorOpacity());assert.ok(actual.solid>10,'actual actor body stays opaque even when the previous object used a transparent screen effect');assert.equal(actual.restoredAlpha,.25);assert.equal(actual.restoredComposition,'screen');audit.actual=actual;
    assert.equal(audit.body.alpha,1,'actor body cannot inherit opacity from scenery');assert.equal(audit.body.composition,'source-over');
    await writeFile(`${output}/${name}-actor-layer-audit.json`,JSON.stringify(audit,null,2));
   }
   if(buildingCheck){
    const buildings=await page.evaluate(()=>window.buildingShadowAudit());
    assert.ok(buildings.length>1&&buildings.every(building=>Number.isFinite(building.strength)));
    if(process.argv.includes('--day'))assert.ok(buildings.every(building=>building.source.kind==='sun'),'daytime building shadows use the sun');
    await writeFile(`${output}/${name}-building-shadow-audit.json`,JSON.stringify(buildings,null,2));
   }
   assert.deepEqual(errors,[]);results.push({name,errors,walkSamples,dimension:(await page.evaluate(()=>window.lightingState())).dimensionId});
   await writeFile(`${output}/${name}-result.json`,JSON.stringify(results.at(-1),null,2));
  }finally{await context.close();}
 }
 await writeFile(output+'/result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{if(browser)await browser.close();if(bridge)await bridge.close();await preview.close();await room.close();await rm(directory,{recursive:true,force:true});}
