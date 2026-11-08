import WebSocket from 'ws';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createPreviewServer} from './dev-preview-page.mjs';
import {createPrototypeServer} from './prototype-server.mjs';
import {createJsonPlayerLocationStore} from './player-location-store.mjs';
import {SPAWN_CAMPFIRE,WORLD_COORDINATE_VERSION} from '../game/world.mjs';
import {createAccountStore} from './account-store.mjs';
import {stepWildlifePopulation,serializeWildlife,WILDLIFE_BY_ID} from '../game/wildlife.mjs';
const output=process.argv[2]||'logs/wildlife-motion-browser';await mkdir(output,{recursive:true});
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
 for(const [speciesId,offset] of [['hawk',3],['mouse',-5]]){
  const definition=WILDLIFE_BY_ID.get(speciesId),x=self.x+offset,y=self.y+offset,id=`review-${speciesId}`;
  animals.set(id,{id,dimensionId:'surface',speciesId,x,y,vx:0,vy:0,homeX:x,homeY:y,shelterX:x,shelterY:y,shelterId:`review-home-${speciesId}`,
   ageDays:definition.stats.maturityDays+1,sex:'fêmea',health:definition.stats.health,hunger:10,thirst:10,energy:90,
   state:'explorando',targetX:x,targetY:y,thinkAt:0,fleeUntil:0,provokedUntil:0,nextAttackAt:0,pregnancyUntil:0,nextBreedAt:Infinity,randomSeed:42});
 }
 stepWildlifePopulation(animals,{players:[{id:self.id,location:'clearing',dimensionId:'surface',position:self}],hours,now:clock,deltaSeconds:0});
 return [...animals.values()].map(serializeWildlife);
}
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  clock=(name==='desktop'?12:36)*60000;let mode='actual',latest=null,fixture=null,trackOrigin=null,trackStart=0;
  const delayed=[];let packetNumber=0;
  const deliveryTimer=setInterval(()=>{for(const deliver of delayed.splice(0))deliver();},80);
  const account=await accounts.register({username:`ecology_${name}`,password:'EcologyFixture7!safe'});
  await createJsonPlayerLocationStore(directory).savePlayerLocation(account.profile.id,{location:'clearing',dimensionId:'surface',x:SPAWN_CAMPFIRE.x+36,y:SPAWN_CAMPFIRE.y+36,worldVersion:WORLD_COORDINATE_VERSION});
  const context=await browser.newContext({viewport,hasTouch:name==='mobile',isMobile:name==='mobile'});
  await context.addCookies([{name:'clareira_session',value:account.token,url:base,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/dev/**',async route=>{try{await route.fulfill({response:await route.fetch({url:route.request().url().replace('/dev/','/'),headers:{...route.request().headers(),cookie:`clareira_session=${account.token}`}})});}catch{await route.abort().catch(()=>{});}});
  await page.routeWebSocket('**/dev/room',socket=>{
   const upstream=new WebSocket('ws://127.0.0.1:19613/room',{headers:{origin:base,cookie:`clareira_session=${account.token}`}}),queued=[];
   socket.onMessage(message=>upstream.readyState===1?upstream.send(message):queued.push(message));
   upstream.on('open',()=>queued.forEach(message=>upstream.send(message)));
   upstream.on('message',raw=>{
    const message=JSON.parse(raw.toString());
    if(message.type==='state'){
     latest=message;message.serverWallTimeMs=fixtureNow();
     if(mode==='motion-fixture'){
      const self=message.players.find(player=>player.id===selfId)||message.players[0];
      if(!trackOrigin){trackOrigin={x:self.x+2,y:self.y+1};trackStart=message.serverTime;}
      message.animals=[{id:'motion-fixture',speciesId:'mouse',x:trackOrigin.x+(message.serverTime-trackStart)/1000*.7,y:trackOrigin.y,vx:.7,vy:0,state:'explorando'}];
     }
     if(mode==='renderer-fixture'){
      const self=message.players.find(player=>player.id===selfId)||message.players[0];
      message.animals=rendererAnimals(self,(clock/60000)%24);fixture=message.animals;
     }
    }
    if(message.type==='welcome')selfId=message.id;
    const deliver=()=>{try{socket.send(JSON.stringify(message));}catch{}};
    if(mode==='motion-fixture'&&message.type==='state'&&++packetNumber%4!==0)delayed.push(deliver);
    else {for(const pending of delayed.splice(0))pending();deliver();}
   });
   let selfId=null;
   socket.onClose(()=>upstream.close());upstream.on('error',error=>errors.push(error.message));
  });
  await page.goto(`${base}/dev/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{const module=await import('/dev/main.js');window.ecologyState=module.inspectMovement;window.animalMotion=module.inspectWildlifeMotion;});
  await page.waitForFunction(()=>window.ecologyState().readiness.sceneReady).catch(async error=>{await writeFile(`${output}/${name}-failure.json`,JSON.stringify({errors,state:await page.evaluate(()=>window.ecologyState()),latest},null,2));throw error;});
  assert.ok(latest.animals.length>0&&latest.animals.length<=60);
  assert.ok(latest.animals.every(a=>a.shelter?.id&&!['cow','ox','bull'].includes(a.speciesId)));
  const actualAnimals=latest.animals;
  await page.screenshot({path:`${output}/${name}-actual.png`});
  await page.locator('#world').focus();
  if(name==='desktop')await page.keyboard.down('ArrowDown');
  else{const b=await page.locator('[data-move="0,1"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}
  await page.waitForTimeout(700);
  if(name==='desktop')await page.keyboard.up('ArrowDown');else await page.mouse.up();
  mode='motion-fixture';await page.waitForTimeout(450);
  const motion=await page.evaluate(async()=>{
    const rows=[];const start=performance.now();
    while(performance.now()-start<2500){
      await new Promise(requestAnimationFrame);
      const animal=window.animalMotion().find(a=>a.id==='motion-fixture');
      if(animal?.rendered)rows.push({time:performance.now(),x:animal.rendered.x});
    }
    return rows;
  });
  await writeFile(`${output}/${name}-motion.json`,JSON.stringify(motion,null,2));
  assert.ok(motion.length>15);
  assert.ok(motion.at(-1).x-motion[0].x>1,'animal advances through jitter');
  for(let i=1;i<motion.length;i++){
    assert.ok(motion[i].x>=motion[i-1].x-1e-6,'no backwards correction');
    assert.ok(motion[i].x-motion[i-1].x<.7*(motion[i].time-motion[i-1].time)/1000+.09,'no burst teleport');
  }
  await page.screenshot({path:`${output}/${name}-moving.png`});
  clearInterval(deliveryTimer);for(const deliver of delayed.splice(0))deliver();
  mode='renderer-fixture';await page.waitForTimeout(500);
  assert.equal(fixture.find(a=>a.speciesId==='mouse').sheltered,true);
  await page.screenshot({path:`${output}/${name}-day-shelters.png`});
  clock=(name==='desktop'?22:46)*60000;await page.waitForTimeout(500);
  assert.equal(fixture.find(a=>a.speciesId==='hawk').sheltered,true);
  assert.equal(fixture.find(a=>a.speciesId==='mouse').sheltered,false);
  await page.screenshot({path:`${output}/${name}-night-shelters.png`});
  assert.deepEqual(errors,[]);
  results.push({name,motion,actualAnimals,rendererFixture:{day:'mouse sleeping in burrow',night:'hawk sleeping in nest; mouse awake'},errors});
  await page.unrouteAll({behavior:'ignoreErrors'});
  await context.close();
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));
 console.log('Wildlife jitter motion, no backwards corrections, shelters and desktop/touch passed.');
}finally{await browser.close();await room.close();await preview.close();await rm(directory,{recursive:true,force:true});}
