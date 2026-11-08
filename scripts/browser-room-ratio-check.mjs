import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const output=process.argv[2]||'logs/20261025-pixel-room-ratio';
await mkdir(output,{recursive:true});const b=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('https://vmi3579939.contaboserver.net/dev/?profile=1',{waitUntil:'domcontentloaded'});
 await p.waitForSelector('#guest-form button[type=submit]',{state:'visible',timeout:20000});
 await p.locator('#guest-form button[type=submit]').click();
 await p.waitForFunction(()=>document.querySelector('.shell').classList.contains('is-authenticated'),null,{timeout:15000});
 await p.evaluate(async()=>{const m=await import('/dev/main.js');window.__d=()=>m.inspectMovement()});
 await p.waitForFunction(()=>window.__d?.().readiness.sceneReady&&!window.__d().readiness.loading&&!document.querySelector('.shell').inert,null,{timeout:60000});
 await p.waitForFunction(()=>!document.querySelector('.shell').classList.contains('initial-world-entering'),null,{timeout:5000}).catch(()=>{});
 const entry=await p.evaluate(()=>({state:window.__d(),overlay:{hidden:document.querySelector('#scene-loading').hidden,phase:document.querySelector('#scene-loading').dataset.phase},
   html:document.elementFromPoint(720,450)?.id||document.elementFromPoint(720,450)?.tagName}));
 await p.screenshot({path:`${output}/before.png`});
 const hotel=await p.evaluate(async()=>{const {VILLAGE_BUILDINGS}=await import('/dev/village-buildings.mjs');return VILLAGE_BUILDINGS.find(b=>b.id==='lodging-ember-hotel').door;});
 async function clickWorldTarget(target){
   const xy=await p.evaluate(({x,y})=>{const s=window.__d(),c=document.querySelector('#world'),r=c.getBoundingClientRect();
     const {tileX,tileY,centerX,centerY}=s.projection,cam=s.camera;
     return {x:centerX+(x-y)*tileX-Math.round((cam.x-cam.y)*tileX),
       y:centerY+(x+y)*tileY-Math.round((cam.x+cam.y)*tileY),width:r.width,height:r.height};},target);
   assert.ok(xy.x>=0&&xy.x<xy.width&&xy.y>=0&&xy.y<xy.height,'world target must be in viewport before the click: '+JSON.stringify(xy));
   const hit=await p.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return {tag:e?.tagName,id:e?.id};},xy);
   assert.equal(hit.id,'world','the visible game canvas must receive the pointer');
   await p.locator('#world').click({position:{x:xy.x,y:xy.y},timeout:5000});
   return {screen:xy,hit};
 }
 const steps=[];await p.locator('#world').focus();await p.keyboard.down('Shift');
 for(const target of [{x:95,y:93},{x:101,y:92},{x:106,y:92},hotel]){
   const click=await clickWorldTarget(target);
   const started=Date.now();
   while(Date.now()-started<16000){
     const state=await p.evaluate(()=>window.__d());
     if(Math.hypot(state.position.x-target.x,state.position.y-target.y)<1.1)break;
     await p.waitForTimeout(250);
   }
   const state=await p.evaluate(()=>window.__d());
   steps.push({target,click,position:state.position,camera:state.camera,retention:state.terrainRetention});
   assert.ok(Math.hypot(state.position.x-target.x,state.position.y-target.y)<1.4,'avatar reached route point '+JSON.stringify({target,position:state.position}));
 }
 await p.keyboard.up('Shift');await p.keyboard.down('e');await p.keyboard.up('e');
 await p.waitForFunction(()=>window.__d().location==='room',null,{timeout:20000});
 await p.waitForFunction(()=>window.__d().readiness.sceneReady&&!window.__d().readiness.loading,null,{timeout:45000});
 const room=await p.evaluate(()=>{const c=document.querySelector('#world'),r=c.getBoundingClientRect(),s=window.__d();return {location:s.location,ratio:s.canvasPixelRatio,devicePixelRatio,surfaceRatio:c.width/r.width,retention:s.terrainRetention};});
 assert.equal(room.location,'room');assert.equal(room.ratio,.5);assert.ok(Math.abs(room.surfaceRatio-.5)<.01);
 assert.deepEqual(errors,[]);
 await p.screenshot({path:`${output}/room.png`});
 await writeFile(`${output}/result.json`,JSON.stringify({entry,steps,room,errors},null,2));
 console.log(JSON.stringify({entry:{position:entry.state.position,overlay:entry.overlay,shellInert:entry.state.readiness.loading},
   steps:steps.map(s=>({target:s.target,position:s.position,heldMs:s.retention?.maxMs})),room,errors}));
}finally{await b.close();}
