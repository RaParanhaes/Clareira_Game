import WebSocket from 'ws';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createPreviewServer} from './dev-preview-page.mjs';
import {createPrototypeServer} from './prototype-server.mjs';
import {createAccountStore,saveAccountProgress} from './account-store.mjs';
const output=process.argv[2]||'logs/action-obstacle-browser';await mkdir(output,{recursive:true});
const directory=await mkdtemp(path.join(os.tmpdir(),'clareira-actions-')),base='http://127.0.0.1:18212';
const preview=createPreviewServer({port:18212,stateDirectory:directory,allowedOrigin:base});
let room=createPrototypeServer({port:18213,stateDirectory:directory,allowedOrigin:base});await preview.listen();await room.listen();
const accounts=createAccountStore({directory});const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});const results=[];
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const created=await accounts.register({username:`bug_${name}`,password:'SafeFixture7!pass'});await saveAccountProgress(directory,created.profile.id,{wood:40,stone:20,leaves:2,berries:0});
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addCookies([{name:'clareira_session',value:created.token,url:base+'/dev/',httpOnly:true,sameSite:'Strict'}]);
  await page.route('**/dev/**',async route=>route.fulfill({response:await route.fetch({url:route.request().url().replace('/dev/','/'),headers:{...route.request().headers(),cookie:`clareira_session=${created.token}`}})}));
  await page.routeWebSocket('**/dev/room',socket=>{const upstream=new WebSocket('ws://127.0.0.1:18213/room',{headers:{origin:base,cookie:`clareira_session=${created.token}`}}),queued=[];socket.onMessage(m=>{if(upstream.readyState===1)upstream.send(m);else queued.push(m)});upstream.on('open',()=>queued.forEach(m=>upstream.send(m)));upstream.on('message',m=>{try{socket.send(m.toString())}catch{}});upstream.on('error',e=>errors.push(e.message));socket.onClose(()=>upstream.close());});
  await page.goto(base+'/dev/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.shell').classList.contains('is-authenticated')&&document.querySelector('#scene-loading').hidden);
  await page.evaluate(async()=>{window.inspect=(await import('/dev/main.js')).inspectMovement;});
  const inspect=()=>page.evaluate(()=>window.inspect());
  async function action(value){if(name==='mobile')await page.locator(`[data-emote="${value}"]`).click();else{await page.locator('#world').focus();await page.keyboard.press({sit:'3',wave:'1',dance:'2'}[value]);}await page.waitForTimeout(400);}
  async function fireAction(){if(name==='mobile')await page.locator('[data-action="fire"]').click();else{await page.locator('#world').focus();await page.keyboard.press('f');}}
  await action('sit');await page.waitForFunction(()=>window.inspect().pose.sitting);await page.screenshot({path:`${output}/${name}-sit.png`});
  await action('wave');await page.waitForFunction(()=>window.inspect().pose.gesture==='wave'&&window.inspect().pose.sitting);
  const waveBefore=await inspect();await page.waitForTimeout(350);await page.screenshot({path:`${output}/${name}-seated-wave.png`});const waveAfter=await inspect();assert.ok(waveAfter.animationTime>waveBefore.animationTime,'render loop continues during gestures');
  await page.waitForTimeout(1600);assert.equal((await inspect()).pose.sitting,true,'wave expiration preserves seat');
  await action('dance');await page.waitForFunction(()=>window.inspect().pose.gesture==='dance'&&!window.inspect().pose.sitting);await page.screenshot({path:`${output}/${name}-dance.png`});
  for(const value of ['sit','wave','sit','wave','dance']){await action(value);assert.deepEqual(errors,[]);}
  await page.waitForTimeout(700);await page.locator('#world').focus();await page.keyboard.down('ArrowDown');await page.waitForTimeout(550);await page.keyboard.up('ArrowDown');await page.waitForTimeout(700);
  const before=await inspect();await fireAction();await page.waitForFunction(count=>window.inspect().fires>count,before.fires);
  const after=await inspect(),fire=after.firePositions.find(f=>Math.hypot(f.x-before.position.x,f.y-before.position.y)<.15);assert.ok(fire,'real newly placed fire');
  await page.locator('#world').focus();await page.keyboard.down('ArrowDown');await page.waitForTimeout(550);await page.keyboard.up('ArrowDown');await page.waitForTimeout(450);
  assert.ok(Math.hypot((await inspect()).position.x-fire.x,(await inspect()).position.y-fire.y)>.9,'builder can escape fire');
  await page.keyboard.down('ArrowUp');const distances=[];
  for(let i=0;i<18;i++){await page.waitForTimeout(90);const s=await inspect();distances.push({client:Math.hypot(s.position.x-fire.x,s.position.y-fire.y),server:Math.hypot(s.server.x-fire.x,s.server.y-fire.y)});}
  await page.keyboard.up('ArrowUp');assert.ok(distances.every(d=>d.client>=.9-1e-5&&d.server>=.9-1e-5),'both prediction and authority block fire');await page.screenshot({path:`${output}/${name}-fire-collision.png`});
  async function walkTo(target){
   for(let i=0;i<12;i++){
    const s=await inspect();if(Math.hypot(s.position.x-target.x,s.position.y-target.y)<.65)return;
    const box=await page.locator('#world').boundingBox(),tx=box.width<600?26:32,ty=tx*4.5/8,dx=target.x-s.camera.x,dy=target.y-s.camera.y;
    const scale=Math.min(1,(box.width/2-30)/(Math.abs((dx-dy)*tx)||1),(box.height*.25)/(Math.abs((dx+dy)*ty)||1));
    const point={x:s.camera.x+dx*scale,y:s.camera.y+dy*scale};
    await page.mouse.click(box.x+box.width/2+(point.x-s.camera.x-point.y+s.camera.y)*tx,box.y+box.height*(box.width<600?.4:.52)+(point.x-s.camera.x+point.y-s.camera.y)*ty);
    await page.waitForTimeout(150);await page.waitForFunction(()=>!window.inspect().walkTarget,null,{timeout:18000}).catch(async error=>{console.log(JSON.stringify({name,point,state:await inspect()}));throw error;});await page.waitForTimeout(300);
   }throw Error('trunk route incomplete');
  }
  await walkTo({x:5.5,y:19.6});await page.waitForTimeout(700);const logBefore=await inspect();
  await fireAction();await page.waitForFunction(count=>window.inspect().fires>count,logBefore.fires);await page.screenshot({path:`${output}/${name}-trunk-shadow.png`});
  await walkTo({x:7.5,y:19.1});const near=await inspect();await page.waitForTimeout(350);assert.ok((await inspect()).animationTime>near.animationTime);assert.deepEqual(errors,[]);
  results.push({name,seatedWave:true,gestureLoopAlive:true,placedFireBlocked:true,minimumFireDistance:Math.min(...distances.map(d=>Math.min(d.client,d.server))),trunkApproach:true,errors});await context.close();
  if(name==='desktop'){await room.close();room=createPrototypeServer({port:18213,stateDirectory:directory,allowedOrigin:base});await room.listen();}
 }
 await writeFile(`${output}/result.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await room.close();await preview.close();await rm(directory,{recursive:true,force:true});}
