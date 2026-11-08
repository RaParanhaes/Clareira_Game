import WebSocket from 'ws';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createPreviewServer} from './dev-preview-page.mjs';
import {createPrototypeServer} from './prototype-server.mjs';
import {createJsonPlayerLocationStore} from './player-location-store.mjs';
import {SPAWN_CAMPFIRE,WORLD_COORDINATE_VERSION,getSolidTreesInBounds} from '../game/world.mjs';
import {createAccountStore} from './account-store.mjs';
import {stepWildlifePopulation,serializeWildlife,WILDLIFE_BY_ID,wildlifeIsActive} from '../game/wildlife.mjs';
const output=process.argv[2]||'logs/wildlife-browser';await mkdir(output,{recursive:true});
const directory=await mkdtemp(path.join(os.tmpdir(),'clareira-ecology-'));
const base='http://127.0.0.1:19612';
let clock=12*60000;const started=performance.now();
const fixtureNow=()=>clock+performance.now()-started;
const preview=createPreviewServer({port:19612,stateDirectory:directory,allowedOrigin:base});
const room=createPrototypeServer({port:19613,stateDirectory:directory,allowedOrigin:base,now:fixtureNow});
await preview.listen();await room.listen();
const accounts=createAccountStore({directory});
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
const results=[];
function rendererAnimals(self,hours){
 const animals=new Map();
 const trees=getSolidTreesInBounds({left:self.x-4,right:self.x+4,top:self.y-4,bottom:self.y+4}).sort((a,b)=>Math.hypot(a.x-self.x,a.y-self.y)-Math.hypot(b.x-self.x,b.y-self.y));
 assert.ok(trees.length,'renderer fixture has an actual supporting tree');
 for(const [speciesId,offset] of [['hawk',3],['mouse',-5]]){
  const definition=WILDLIFE_BY_ID.get(speciesId),tree=trees[0],x=tree.x+.85,y=tree.y,id=`review-${speciesId}`;
  const cover={kind:'tree',id:tree.id||'review-tree',x:tree.x,y:tree.y};
  const sleeping=!wildlifeIsActive(definition,hours);
  animals.set(id,{id,dimensionId:'surface',speciesId,x,y,vx:0,vy:0,homeX:x,homeY:y,shelterX:x,shelterY:y,shelterId:`review-home-${speciesId}`,shelterCover:cover,
   ageDays:definition.stats.maturityDays+1,sex:'fêmea',health:definition.stats.health,hunger:10,thirst:10,energy:90,
   state:sleeping?'dormindo':'explorando',sheltered:sleeping,targetX:x,targetY:y,thinkAt:0,fleeUntil:0,provokedUntil:0,nextAttackAt:0,pregnancyUntil:0,nextBreedAt:Infinity,randomSeed:42});
 }
 stepWildlifePopulation(animals,{players:[{id:self.id,location:'clearing',dimensionId:'surface',position:{x:self.x+30,y:self.y+30}}],hours,now:clock,deltaSeconds:0,maxActiveDistance:100});
 return [...animals.values()].map(serializeWildlife);
}
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  clock=(name==='desktop'?12:36)*60000;let mode='actual',latest=null,fixture=null;const upstreams=new Set();
  const account=await accounts.register({username:`ecology_${name}`,password:'EcologyFixture7!safe'});
  await createJsonPlayerLocationStore(directory).savePlayerLocation(account.profile.id,{location:'clearing',dimensionId:'surface',x:SPAWN_CAMPFIRE.x+36,y:SPAWN_CAMPFIRE.y+36,worldVersion:WORLD_COORDINATE_VERSION});
  const context=await browser.newContext({viewport,hasTouch:name==='mobile',isMobile:name==='mobile'});
  await context.addCookies([{name:'clareira_session',value:account.token,url:base,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/dev/**',async route=>{try{await route.fulfill({response:await route.fetch({url:route.request().url().replace('/dev/','/'),headers:{...route.request().headers(),cookie:`clareira_session=${account.token}`}})});}catch{await route.abort().catch(()=>{});}});
  await page.routeWebSocket('**/dev/room',socket=>{
   const upstream=new WebSocket('ws://127.0.0.1:19613/room',{headers:{origin:base,cookie:`clareira_session=${account.token}`}}),queued=[];
   upstreams.add(upstream);
   socket.onMessage(message=>upstream.readyState===1?upstream.send(message):queued.push(message));
   upstream.on('open',()=>queued.forEach(message=>upstream.send(message)));
   upstream.on('message',raw=>{
    const message=JSON.parse(raw.toString());
    if(message.type==='state'){
     latest=message;message.serverWallTimeMs=fixtureNow();
     if(mode==='renderer-fixture'){
      const self=message.players.find(player=>player.id===selfId)||message.players[0];
      message.animals=rendererAnimals(self,(clock/60000)%24);fixture=message.animals;
     }
    }
    if(message.type==='welcome')selfId=message.id;
    try{socket.send(JSON.stringify(message));}catch{}
   });
   let selfId=null;
   socket.onClose(()=>upstream.close());upstream.on('error',error=>errors.push(error.message));
  });
  await page.goto(`${base}/dev/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{window.ecologyState=(await import('/dev/main.js')).inspectMovement;});
  await page.waitForFunction(()=>window.ecologyState().readiness.sceneReady).catch(async error=>{await writeFile(`${output}/${name}-failure.json`,JSON.stringify({errors,state:await page.evaluate(()=>window.ecologyState()),latest},null,2));throw error;});
  assert.ok(latest.animals.length>0&&latest.animals.length<=60);
  assert.ok(latest.animals.every(a=>a.shelter?.id&&a.shelter.cover&&!['cow','ox','bull'].includes(a.speciesId)));
  const actualAnimals=latest.animals;
  await page.screenshot({path:`${output}/${name}-actual.png`});
  await page.locator('#world').focus();
  if(name==='desktop')await page.keyboard.down('ArrowDown');
  else{const b=await page.locator('[data-move="0,1"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}
  await page.waitForTimeout(700);
  if(name==='desktop')await page.keyboard.up('ArrowDown');else await page.mouse.up();
  mode='renderer-fixture';await page.waitForTimeout(500);
  assert.equal(fixture.find(a=>a.speciesId==='mouse').sheltered,true);
  await page.screenshot({path:`${output}/${name}-day-shelters.png`});
  clock=(name==='desktop'?22:46)*60000;await page.waitForTimeout(500);
  await page.waitForFunction(()=>document.querySelector('#weather-text').textContent.includes('Noite'));
  assert.equal(fixture.find(a=>a.speciesId==='hawk').sheltered,true);
  assert.equal(fixture.find(a=>a.speciesId==='mouse').sheltered,false);
  await page.screenshot({path:`${output}/${name}-night-shelters.png`});
  assert.deepEqual(errors,[]);
  results.push({name,actualAnimals,rendererFixture:{day:'mouse sleeping in burrow',night:'hawk sleeping in nest; mouse awake'},errors});
  for(const upstream of upstreams)upstream.terminate();
  await page.unrouteAll({behavior:'ignoreErrors'});
  await context.close();
 }
 if(process.env.ECOLOGY_LIVE==='1'){
  for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,isMobile:name==='mobile',hasTouch:name==='mobile'});
   const page=await context.newPage(),errors=[];let animals=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('websocket',socket=>socket.on('framereceived',({payload})=>{try{const m=JSON.parse(payload);if(m.type==='state'&&m.animals)animals=m.animals;}catch{}}));
   await page.goto('https://vmi3579939.contaboserver.net/dev/',{waitUntil:'domcontentloaded'});
   await page.locator('#guest-form button[type=submit]').click();
   await page.evaluate(async()=>{window.liveEcology=(await import('/dev/main.js')).inspectMovement;});
   await page.waitForFunction(()=>window.liveEcology().readiness.sceneReady);
   assert.ok(animals.length>0&&animals.length<=60);
   assert.ok(animals.every(a=>a.shelter?.id&&a.shelter.cover&&!['cow','ox','bull'].includes(a.speciesId)));
   const before=await page.evaluate(()=>window.liveEcology().position);
   await page.locator('#world').focus();
   if(name==='desktop')await page.keyboard.down('ArrowDown');
   else {const b=await page.locator('[data-move="0,1"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}
   await page.waitForTimeout(700);
   if(name==='desktop')await page.keyboard.up('ArrowDown');else await page.mouse.up();
   await page.waitForTimeout(350);
   const after=await page.evaluate(()=>window.liveEcology().position);
   assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>.3);
   await page.screenshot({path:`${output}/${name}-live.png`});
   assert.deepEqual(errors,[]);results.push({name,live:true,animals:animals.length,movement:true,errors});
   await context.close();
  }
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));
 console.log('Actual server density/shelters and controlled day/night renderer fixtures passed in desktop and touch.');
}finally{await browser.close();await room.close();await preview.close();await rm(directory,{recursive:true,force:true});}
