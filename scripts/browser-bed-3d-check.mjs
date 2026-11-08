import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import WebSocket from 'ws';
import { createStorageAdapter } from '../database/storage.mjs';
import { createDevPreviewBridge } from './dev-preview-bridge.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { WORLD_COORDINATE_VERSION } from '../game/world.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2]||'logs/bed-3d-gameplay');
const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-bed-3d-'));
await mkdir(output,{recursive:true});
const probe=http.createServer();
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const pagePort=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const allowedOrigin=`http://127.0.0.1:${pagePort}`;
const storage=createStorageAdapter({directory:stateDirectory}),locations=createJsonPlayerLocationStore(stateDirectory);
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
let preview,bridge,room;const errors=[];const visits=[];

async function runVisit(name,viewport,mobile){
 const username=`Bed3D${name}${Date.now()%1_000_000_000}`;
 const user=await storage.accounts.register({username,password:'senha-segura-de-teste'});
 await locations.savePlayerLocation(user.profile.id,{location:'room',dimensionId:'surface',x:7,y:9,
  roomKey:`account:${user.profile.id}`,roomOwnerName:username,worldVersion:WORLD_COORDINATE_VERSION});
 const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});context.setDefaultTimeout(30000);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
 page.on('response',response=>{if(response.url().includes('room-furniture-v3'))console.log('ATLAS RESPONSE',response.status(),response.url());});
 await page.addInitScript(()=>{import('/dev/main.js').then(module=>{window.checkMovement=module.inspectMovement;}).catch(()=>{});});
 await context.addCookies([{name:'clareira_session',value:user.token,url:`${allowedOrigin}/dev/`,httpOnly:true,sameSite:'Strict'}]);
 const bridges=[];
 await page.routeWebSocket('**/dev/room',socket=>{
  const upstream=new WebSocket(`ws://127.0.0.1:${room.address.port}/room`,{headers:{origin:allowedOrigin,cookie:`clareira_session=${user.token}`}});
  bridges.push(upstream);const queued=[];
  socket.onMessage(message=>upstream.readyState===WebSocket.OPEN?upstream.send(message):queued.push(message));
  upstream.on('open',()=>queued.forEach(message=>upstream.send(message)));
  upstream.on('message',message=>{try{socket.send(message.toString());}catch{}});
  upstream.on('error',error=>errors.push(error.message));
  upstream.on('close',()=>{try{socket.close();}catch{}});socket.onClose(()=>upstream.close());
 });
 try{
  await page.goto(`${allowedOrigin}/dev/`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.shell.is-authenticated');
  await page.evaluate(async()=>{window.checkMovement=(await import('/dev/main.js')).inspectMovement;});
  try{await page.waitForFunction(()=>{const s=window.checkMovement();return s.readiness.sceneReady&&s.readiness.predictionReady
   &&s.readiness.connected&&s.location==='room';},null,{timeout:30000});}
  catch(error){const diagnostic=await page.evaluate(()=>({state:window.checkMovement?.(),loading:document.querySelector('#loading-message')?.textContent,
    shell:document.querySelector('.shell')?.className,body:document.body.innerText.slice(0,500)}));
   await page.screenshot({path:path.join(output,`${name}-readiness-failure.png`)});console.error('BED READINESS DIAGNOSTIC',JSON.stringify({diagnostic,errors}));throw error;}
  assert.equal((await page.evaluate(()=>window.checkMovement())).furnitureAtlasLoaded,true,`${name}: v3 furniture atlas is loaded`);

  await page.locator('#room-build-toggle').click();
  await page.locator('#room-category').selectOption('basicos');
  await page.locator('#room-kind').selectOption('bed');
  await page.waitForFunction(()=>window.checkMovement().buildMode==='place');
  const furnitureBefore=await page.evaluate(()=>window.checkMovement().roomFurniture),bedCountBefore=furnitureBefore.filter(item=>item.kind==='bed').length;
  const initial=await page.evaluate(async()=>{const {canPlaceRoomFurniture,getRoomLayout}=await import('/dev/world.mjs'),s=window.checkMovement(),layout=getRoomLayout(s.roomKind,s.roomBuildingId),candidates=[];for(let y=5;y<=10;y+=.5)for(let x=5;x<=11;x+=.5)if(canPlaceRoomFurniture({kind:'bed',x,y,rotation:0},s.roomFurniture,[],layout))candidates.push({x,y,distance:Math.hypot(s.position.x-x,s.position.y-y)});return candidates.sort((a,b)=>b.distance-a.distance)[0]||null;});
  assert.ok(initial,`${name}: a valid initial bed tile exists`);
  async function project(x,y,lift=0){
   const state=await page.evaluate(()=>window.checkMovement()),box=await page.locator('#world').boundingBox();
   const point=await page.evaluate(async ({x,y,camera,p,roomKind,roomBuildingId,spriteScale})=>{
    const [{surfaceHeight,HEIGHT_PIXELS},{getRoomLayout}]=await Promise.all([import('/dev/elevation.mjs'),import('/dev/world.mjs')]);
    const layout=getRoomLayout(roomKind,roomBuildingId),height=surfaceHeight(x,y,'room',layout);
    return{x:p.centerX+(x-y)*p.tileX-Math.round((camera.x-camera.y)*p.tileX),
     y:p.centerY+(x+y)*p.tileY-Math.round((camera.x+camera.y)*p.tileY)-height*HEIGHT_PIXELS*spriteScale};
   },{x,y,camera:state.camera,p:state.projection,roomKind:state.roomKind,roomBuildingId:state.roomBuildingId,spriteScale:state.projection.spriteScale});
   point.y-=lift;return{x:point.x+box.x,y:point.y+box.y};
  }
  async function tap(x,y,lift=0){const p=await project(x,y,lift);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);}
  async function waitNear(x,y){await page.waitForFunction(({x,y})=>{const p=window.checkMovement().position;return Math.hypot(p.x-x,p.y-y)<.95;},{x,y},{timeout:12000});}
  await tap(initial.x,initial.y);
  await page.waitForFunction(before=>window.checkMovement().roomFurniture.filter(item=>item.kind==='bed').length>before,bedCountBefore,{timeout:8000});
  let bed=(await page.evaluate(()=>window.checkMovement().roomFurniture.filter(item=>item.kind==='bed').at(-1)));
  assert.equal(bed.rotation,0);await page.locator('#room-build-toggle').click();

  await page.locator('#room-move').click();await tap(bed.x,bed.y,3);
  await page.waitForFunction(id=>window.checkMovement().roomMovingId===id,bed.id,{timeout:16000});
  const movedTo=await page.evaluate(async ({id,player})=>{const {canPlaceRoomFurniture,getRoomLayout}=await import('/dev/world.mjs'),s=window.checkMovement(),bed=s.roomFurniture.find(item=>item.id===id),layout=getRoomLayout(s.roomKind,s.roomBuildingId),others=s.roomFurniture.filter(item=>item.id!==id);for(let y=5;y<=10;y+=.5)for(let x=5;x<=11;x+=.5)if(Math.hypot(player.x-x,player.y-y)>1.4&&[0,1,2].every(rotation=>canPlaceRoomFurniture({...bed,x,y,rotation},others,[],layout)))return{x,y};return null;},{id:bed.id,player:(await page.evaluate(()=>window.checkMovement())).position});
  assert.ok(movedTo,`${name}: a valid free tile exists for moving the bed`);await tap(movedTo.x,movedTo.y);
  try{await page.waitForFunction(({id,x,y})=>{const s=window.checkMovement(),f=s.roomFurniture.find(item=>item.id===id);return f?.x===x&&f?.y===y&&!s.roomMovingId;},{id:bed.id,...movedTo},{timeout:8000});}
  catch(error){console.error('BED MOVE DIAGNOSTIC',JSON.stringify(await page.evaluate(id=>{const s=window.checkMovement();return{bed:s.roomFurniture.find(item=>item.id===id),movingId:s.roomMovingId,mode:s.buildMode,position:s.position,server:s.server};},bed.id)));await page.screenshot({path:path.join(output,`${name}-move-failure.png`)});throw error;}
  bed=await page.evaluate(id=>window.checkMovement().roomFurniture.find(item=>item.id===id),bed.id);
  assert.deepEqual({x:bed.x,y:bed.y},movedTo,`${name}: bed moved and server state updated`);
  const moveShot=path.join(output,`${name}-bed-moved.png`);await page.screenshot({path:moveShot});

  for(const rotation of [1,2]){
   await page.getByRole('button',{name:'Girar',exact:true}).click();
   await page.waitForFunction(({id,rotation})=>window.checkMovement().roomFurniture.find(item=>item.id===id)?.rotation===rotation,
    {id:bed.id,rotation},{timeout:8000});
  }
  bed=await page.evaluate(id=>window.checkMovement().roomFurniture.find(item=>item.id===id),bed.id);
  assert.equal(bed.rotation,2,`${name}: bed turns into the near-headboard orientation`);
  const rotateShot=path.join(output,`${name}-bed-rotated.png`);await page.screenshot({path:rotateShot});
  await page.getByRole('button',{name:'Deitar',exact:true}).click();
  await page.waitForFunction(id=>{const s=window.checkMovement();return s.pose.lying&&s.furnitureUse?.id===id;},bed.id,{timeout:8000});
  const state=await page.evaluate(()=>window.checkMovement()),layers=state.roomDepthAudit;
  const order={bed:layers.find(v=>v.type==='furniture'&&v.id===bed.id&&v.kind==='bed')?.renderOrder,
   avatar:layers.find(v=>v.type==='self')?.renderOrder,cover:layers.find(v=>v.type==='furniture-cover'&&v.id===bed.id)?.renderOrder};
  assert.ok(order.bed<order.avatar&&order.avatar<order.cover,`${name}: bed/avatar/duvet draw in order ${JSON.stringify(order)}`);
  const sleepShot=path.join(output,`${name}-bed-sleeping.png`);await page.screenshot({path:sleepShot});
  await page.getByRole('button',{name:'Sair da cama',exact:true}).click();await page.waitForFunction(()=>!window.checkMovement().pose.lying&&!window.checkMovement().furnitureUse,null,{timeout:8000});
  assert.deepEqual(errors,[],`${name}: no browser JavaScript errors`);
  visits.push({name,mobile,placed:true,movedTo,rotation:bed.rotation,used:'lie-under-covers',drawOrder:order,
   screenshots:{moved:moveShot,rotated:rotateShot,sleeping:sleepShot}});
 }finally{await context.close();for(const socket of bridges)socket.terminate();}
}

try{
 await storage.ready();preview=createPreviewServer({gameDirectory:path.join(root,'game'),stateDirectory,port:0,allowedOrigin});
 const address=await preview.listen();bridge=createDevPreviewBridge(address,{port:pagePort});await bridge.listen();
 room=createPrototypeServer({stateDirectory,allowedOrigin,port:0,ambientCampfire:false});room.address=await room.listen();
 const desktopOnly=process.env.CLAREIRA_BED_DESKTOP_ONLY==='1';
 const mobileOnly=process.env.CLAREIRA_BED_MOBILE_ONLY==='1';
 if(!mobileOnly)await runVisit('desktop',{width:1440,height:900},false);
 if(!desktopOnly)await runVisit('mobile',{width:390,height:844},true);
 await writeFile(path.join(output,'result.json'),JSON.stringify({atlas:'room-furniture-v3.png',visits},null,2)+'\n');
 console.log(JSON.stringify(visits,null,2));
}finally{await browser.close();if(room)await room.close();if(bridge)await bridge.close();if(preview)await preview.close();await storage.close();await rm(stateDirectory,{recursive:true,force:true});}
