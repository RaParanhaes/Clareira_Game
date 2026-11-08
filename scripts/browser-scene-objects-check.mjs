import assert from 'node:assert/strict';import {randomUUID}from'node:crypto';
import{readFile,writeFile,mkdir,mkdtemp,rm}from'node:fs/promises';import os from'node:os';import path from'node:path';import http from'node:http';
import WebSocket from'ws';import{chromium}from'/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import{createDatabasePool}from'../database/pool.mjs';import{runMigrations}from'../database/migrate.mjs';import{createPostgresStore}from'../database/store.mjs';
import{createPostgresObjectStore}from'../database/object-store.mjs';import{applyObjectCatalog}from'../game/object-state.mjs';
import{createPreviewServer}from'./dev-preview-page.mjs';import{createPrototypeServer}from'./prototype-server.mjs';
import{WORLD_COORDINATE_VERSION}from'../game/world.mjs';import{lodgingRoomKey,lobbyRoomKey}from'../game/lodging-catalog.mjs';
const output=process.argv[2]||'logs/objects-browser';await mkdir(output,{recursive:true});
const config=JSON.parse(await readFile(new URL('../.local/preview-backend.json',import.meta.url),'utf8'));
const secrets=Object.fromEntries((await readFile(new URL('../.local/backends.env',import.meta.url),'utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
const adminUrl=new URL(config.DATABASE_URL);adminUrl.username='clareira';adminUrl.password=secrets.POSTGRES_PASSWORD;
const admin=createDatabasePool({connectionString:adminUrl.href,max:1}),name='objects_browser_'+randomUUID().replaceAll('-','');
const directory=await mkdtemp(path.join(os.tmpdir(),'clareira-object-browser-'));
let pool,preview,room,browser,created=false;const upstreams=new Set(),errors=[],packets=[];
try{
 await admin.query(`CREATE DATABASE "${name}"`);created=true;const databaseUrl=new URL(adminUrl);databaseUrl.pathname='/'+name;
 pool=createDatabasePool({connectionString:databaseUrl.href,max:3});await runMigrations(pool);const objects=createPostgresObjectStore(pool),store=createPostgresStore(pool);await objects.ensureObjectCatalog();
 const probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));const base=`http://127.0.0.1:${port}`;
 preview=createPreviewServer({port,stateDirectory:directory,databaseUrl:databaseUrl.href,allowedOrigin:base});await preview.listen();
 room=createPrototypeServer({port:0,stateDirectory:directory,databaseUrl:databaseUrl.href,redisUrl:config.REDIS_URL,allowedOrigin:base,worldSyncIntervalMs:500});const address=await room.listen();
 browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',args:['--no-sandbox']});
 async function open(account,mobile=false){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});await context.addCookies([{name:'clareira_session',value:account.token,url:base,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  await page.route('**/dev/**',async route=>{try{const requested=new URL(route.request().url());const response=await route.fetch({url:base+requested.pathname.replace(/^\/dev(?=\/)/,'')+requested.search});await route.fulfill({response});}catch(error){if(!error.message.includes('closed'))errors.push(error.message);await route.abort().catch(()=>{});}});
  await page.routeWebSocket('**/dev/room',socket=>{
   const upstream=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin:base,cookie:`clareira_session=${account.token}`}}),queued=[];upstreams.add(upstream);
   socket.onMessage(message=>upstream.readyState===1?upstream.send(message):queued.push(message));upstream.on('open',()=>queued.forEach(data=>upstream.send(data)));
   upstream.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.type==='state')packets.push({manifest:Boolean(message.objectCatalog),revision:message.objectCatalogRevision,bytes:raw.length});socket.send(raw.toString());});socket.onClose(()=>upstream.close());upstream.on('error',error=>errors.push(error.message));
  });
  await page.goto(base+'/dev/',{waitUntil:'domcontentloaded'});await page.evaluate(async()=>window.inspectObjects=(await import('/dev/main.js')).inspectMovement);
  await page.waitForFunction(()=>window.inspectObjects().readiness.sceneReady);return {page,context};
 }
 let catalog=await objects.loadObjectCatalog(),view=applyObjectCatalog(catalog,{validateOnly:true});
 const owner=await store.accounts.register({username:'ObjOwner',password:randomUUID()});await store.creditWallet(owner.profile.id,100);
 const claim=await store.claimLodging({profileId:owner.profile.id,buildingId:'lodging-rill-guesthouse',mode:'rent',unitCount:8,price:6,durationMs:86400000});
 const layout=view.rooms.get('lodging:lodging-rill-guesthouse:rent');
 await store.savePlayerLocation(owner.profile.id,{location:'room',dimensionId:'surface',...layout.spawn,roomKey:lodgingRoomKey(claim.claim),worldVersion:WORLD_COORDINATE_VERSION});
 const desktop=await open(owner);await desktop.page.screenshot({path:`${output}/desktop-before.png`});
 const bed=layout.fixtures.find(f=>f.kind==='bed');
 catalog=await objects.editObjectCatalog({expectedRevision:catalog.revision,actor:'browser-test',operations:[{action:'patch',id:bed.objectId,properties:{height:1.4,palette:'vista',comfort:7}}]});
 await desktop.page.waitForFunction(revision=>window.inspectObjects().objectCatalogRevision===revision,catalog.revision);
 const inspected=await desktop.page.evaluate(async()=>{const {getRoomLayout,canOccupyRoom}=await import('/dev/world.mjs');const l=getRoomLayout('lodging','lodging-rill-guesthouse','rent'),b=l.fixtures.find(f=>f.kind==='bed');return {height:b.height,palette:b.palette,comfort:b.comfort,blocked:!canOccupyRoom(b,.25,[],l)};});
 assert.deepEqual(inspected,{height:1.4,palette:'vista',comfort:7,blocked:true});await desktop.page.waitForTimeout(150);await desktop.page.screenshot({path:`${output}/desktop-after.png`});
 assert.equal(await desktop.page.locator('#lodging-dialog').evaluate(d=>d.open),false);
 catalog=await objects.editObjectCatalog({expectedRevision:catalog.revision,actor:'browser-test',operations:[{action:'copy',id:'building:lodging-rill-guesthouse',newId:'building:browser-copy',buildingId:'browser-copy',offset:{x:100,y:100},properties:{name:'Hospedaria de teste'}}]});
 await desktop.page.waitForFunction(revision=>window.inspectObjects().objectCatalogRevision===revision,catalog.revision);await desktop.context.close();
 view=applyObjectCatalog(catalog,{validateOnly:true});const copy=view.buildings.get('browser-copy');assert.ok(copy);
 const visitor=await store.accounts.register({username:'ObjVisitor',password:randomUUID()});await store.savePlayerLocation(visitor.profile.id,{location:'clearing',dimensionId:'surface',x:copy.door.x,y:copy.door.y+.6,worldVersion:WORLD_COORDINATE_VERSION});
 const mobile=await open(visitor,true);await mobile.page.screenshot({path:`${output}/mobile-copy-exterior.png`});await mobile.page.locator('[data-action="context"]').tap();
 await mobile.page.waitForFunction(()=>window.inspectObjects().location==='room'&&window.inspectObjects().roomBuildingId==='browser-copy');await mobile.page.waitForFunction(()=>window.inspectObjects().readiness.sceneReady);await mobile.page.screenshot({path:`${output}/mobile-copy-interior.png`});
 catalog=await objects.editObjectCatalog({expectedRevision:catalog.revision,actor:'browser-test',operations:[{action:'archive',id:'building:browser-copy'}]});
 await mobile.page.waitForFunction(revision=>window.inspectObjects().objectCatalogRevision===revision&&window.inspectObjects().location==='clearing',catalog.revision);
 await mobile.page.screenshot({path:`${output}/mobile-after-remove.png`});await mobile.context.close();
 assert.ok(packets.some(p=>p.manifest));assert.ok(packets.some(p=>!p.manifest));assert.deepEqual(errors,[]);
 await writeFile(`${output}/result.json`,JSON.stringify({postgres:true,redis:true,hotUpdate:true,bed:inspected,copiedBuildingDoor:true,removedBuildingEvictsVisitor:true,compactPacketsExcludeCatalog:true,errors,finalRevision:catalog.revision},null,2)+'\n');
 console.log('PostgreSQL → Redis → servidor → navegador: edição de cama, cópia completa, porta/interior e remoção aprovados.');
}finally{
 await browser?.close();for(const upstream of upstreams)upstream.terminate();await room?.close();await preview?.close();await pool?.end();if(created)await admin.query(`DROP DATABASE "${name}" WITH(FORCE)`);await admin.end();await rm(directory,{recursive:true,force:true});
}
