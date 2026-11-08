import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import {createDatabasePool} from '../database/pool.mjs';
import {createPostgresStore} from '../database/store.mjs';
import {createRedisCoordination} from '../database/redis-coordination.mjs';
const output=process.argv[2]||'logs/backends-browser';await mkdir(output,{recursive:true});
const config=JSON.parse(await readFile(new URL('../.local/preview-backend.json',import.meta.url),'utf8'));
const pool=createDatabasePool({connectionString:config.DATABASE_URL,max:2});const store=createPostgresStore(pool);
const coordination=createRedisCoordination({url:config.REDIS_URL});
const origin='https://vmi3579939.contaboserver.net';
let account,browser;const results=[],errors=[];
try {
 const response=await fetch('http://127.0.0.1:8100/auth/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'db_'+randomUUID().replaceAll('-','').slice(0,12),password:randomUUID()})});
 assert.equal(response.status,201);account=await response.json();
 const token=/clareira_session=([^;]+)/.exec(response.headers.get('set-cookie'))?.[1];assert.ok(token);
 browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
 let persisted,priorServer;
 for(const [name,viewport,mobile] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]){
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
  await context.addCookies([{name:'clareira_session',value:token,url:origin,httpOnly:true,sameSite:'Strict',secure:true}]);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/dev/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>window.backendInspect=(await import('/dev/main.js')).inspectMovement);
  await page.waitForFunction(()=>window.backendInspect().readiness.sceneReady);
  const before=await page.evaluate(()=>window.backendInspect());
  assert.ok(before.objectCatalogRevision>=1,'the saved scene object catalog reached the live preview');
  if(persisted)assert.ok(Math.hypot(before.position.x-persisted.x,before.position.y-persisted.y)<.05,'position restored after room restart');
  if(mobile){const box=await page.locator('.mobile-input [data-move="0,1"]').boundingBox();const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await page.waitForTimeout(450);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.locator('#world').focus();await page.keyboard.down('ArrowDown');await page.waitForTimeout(450);await page.keyboard.up('ArrowDown');}
  await page.waitForTimeout(700);
  const after=await page.evaluate(()=>window.backendInspect());console.log(name,JSON.stringify({before:before.position,after:after.position,readiness:after.readiness}));assert.ok(Math.hypot(after.position.x-before.position.x,after.position.y-before.position.y)>.3,'movement works');
  assert.ok(after.inventory.knife>=1);assert.equal(after.readiness.connected,true);
  const presence=await coordination.getPlayerPresence(account.profile.id);assert.equal(presence.playerId,account.profile.id);
  if(priorServer)assert.notEqual(presence.serverId,priorServer,'Redis reflects replacement process');priorServer=presence.serverId;
  await page.screenshot({path:`${output}/${name}.png`});
  await context.close();await new Promise(resolve=>setTimeout(resolve,300));
  if(!mobile)await promisify(execFile)('systemctl',['restart','clareira-dev-preview-room.service']);
  persisted=await store.loadPlayerLocation(account.profile.id);assert.ok(persisted);
  assert.ok(Math.hypot(persisted.x-after.position.x,persisted.y-after.position.y)<.05,'PostgreSQL keeps last position');
  assert.equal((await store.accounts.getSession(token)).profile.id,account.profile.id,'session survives restart');
  results.push({name,movement:true,persistedPosition:true,redisPresence:true,objectCatalogRevision:before.objectCatalogRevision});
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/result.json`,JSON.stringify({results,errors,roomRestartVerified:true},null,2)+'\n');
 console.log('PostgreSQL sessions/position and Redis presence passed in desktop and touch, including preview restart.');
}catch(error){console.error(error);throw error;}finally{
 await browser?.close();await coordination.close();
 if(account?.profile?.id){await pool.query('DELETE FROM profiles WHERE id=$1',[account.profile.id]);await pool.query('DELETE FROM accounts WHERE id=$1',[account.profile.id]);}
 await pool.end();
}
