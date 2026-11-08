import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createStorageAdapter } from '../database/storage.mjs';
import { getRoomLayout, WORLD_COORDINATE_VERSION } from '../game/world.mjs';
import { VILLAGE_BUILDINGS } from '../game/village-buildings.mjs';
import { LODGING_OFFER_BY_KEY, lobbyRoomKey, lodgingRoomKey } from '../game/lodging-catalog.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'logs/20261024-room-fade-browser');
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-layout-'));
await mkdir(output, { recursive: true });
const portProbe = http.createServer();
await new Promise((resolve, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolve);
});
const previewPort = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const browserProbe = http.createServer();
await new Promise((resolve, reject) => {
  browserProbe.once('error', reject);
  browserProbe.listen(0, '127.0.0.1', resolve);
});
const browserPort = browserProbe.address().port;
await new Promise(resolve => browserProbe.close(resolve));
const allowedOrigin = `http://127.0.0.1:${browserPort}`;
const storage = createStorageAdapter({ directory: stateDirectory });
const locations = createJsonPlayerLocationStore(stateDirectory);
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});
let preview, room, prefixProxy;
const errors = [];

async function createAccount(username, { location = 'room', buildingId, mode = null } = {}) {
  const created = await storage.accounts.register({ username, password: 'senha-segura-de-teste' });
  const profileId = created.profile.id;
  const layout = location === 'room'
    ? getRoomLayout(buildingId ? (mode ? 'lodging' : 'lobby') : 'lobby', buildingId, mode)
    : null;
  let roomKey = '';
  if (location === 'room' && mode) {
    const offer = LODGING_OFFER_BY_KEY.get(`${buildingId}:${mode}`);
    assert.ok(offer, `lodging offer exists for ${buildingId}:${mode}`);
    await storage.creditWallet(profileId, 100_000);
    const result = await storage.claimLodging({ profileId, ...offer });
    roomKey = lodgingRoomKey(result.claim);
  } else if (location === 'room') {
    roomKey = lobbyRoomKey(buildingId || 'arrival');
  }
  const hotel = VILLAGE_BUILDINGS.find(item => item.id === 'lodging-ember-hotel');
  const position = location === 'clearing'
    ? { x: hotel.door.x - 1.2, y: hotel.door.y + 1.2 }
    : layout.spawn;
  await locations.savePlayerLocation(profileId, {
    location, dimensionId: 'surface', ...position, roomKey,
    roomOwnerName: username, worldVersion: WORLD_COORDINATE_VERSION,
  });
  return { username, password: 'senha-segura-de-teste', profileId, token: created.token, buildingId, mode };
}

async function openPage(user, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const upstreamSockets=new Set();
  context.on('close',()=>{for(const socket of upstreamSockets)socket.close(1000);});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ username: user.username, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource: net::ERR_'))
      errors.push({ username: user.username, console: message.text() });
  });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText;
    if (!request.url().includes('/dev/update-version') && reason !== 'net::ERR_ABORTED')
      errors.push({ username: user.username, failed: request.url(), reason });
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('/dev/auth/me'))
      errors.push({ username: user.username, status: response.status(), url: response.url() });
  });
  await context.addCookies([{
    name: 'clareira_session', value: user.token, url: `${allowedOrigin}/dev/`, httpOnly: true, sameSite: 'Strict',
  }]);
  let pinnedReviewVersion=null;
  await page.route('**/dev/**', async route => {
    try {
      const requested = new URL(route.request().url());
      const versionRequest=process.env.PIN_REVIEW_VERSION&&requested.pathname.endsWith('/update-version');
      if(versionRequest&&pinnedReviewVersion){await route.fulfill(pinnedReviewVersion);return;}
      const targetPath = requested.pathname.replace(/^\/dev(?=\/)/, '') || '/';
      const response = await route.fetch({ url: `${allowedOrigin}${targetPath}${requested.search}` });
      if(versionRequest){pinnedReviewVersion={status:response.status(),headers:response.headers(),body:await response.body()};await route.fulfill(pinnedReviewVersion);return;}
      const headers = { ...response.headers() };
      if (requested.pathname === '/dev/') {
        headers['content-security-policy'] = (headers['content-security-policy'] || '')
          .replace("connect-src 'self' wss:", `connect-src 'self' ws://127.0.0.1:${room.address.port} wss:`);
      }
      await route.fulfill({ response, headers });
    } catch (error) {
      if (!error.message.includes('Target page, context or browser has been closed'))
        errors.push({ username: user.username, message: `preview route: ${error.message}` });
      await route.abort().catch(() => {});
    }
  });
  await page.routeWebSocket('**/dev/room', socket => {
    const upstream = new WebSocket(`ws://127.0.0.1:${room.address.port}/room`, {
      headers: { origin: allowedOrigin, cookie: `clareira_session=${user.token}` },
    });
    upstreamSockets.add(upstream);upstream.on('close',()=>upstreamSockets.delete(upstream));
    const queued = [];
    socket.onMessage(message => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else queued.push(message);
    });
    upstream.on('open', () => queued.forEach(message => upstream.send(message)));
    upstream.on('message', message => { try { socket.send(message.toString()); } catch {} });
    upstream.on('error', error => errors.push({ username: user.username, websocket: error.message }));
    socket.onClose(() => upstream.close());
  });
  await page.goto(`${allowedOrigin}/dev/`, { waitUntil: 'domcontentloaded' });
  // Bootstrap downloads and verifies the runtime before authentication starts.
  // Keep the auth assertion separate so cold asset loading is diagnosed correctly.
  await page.waitForFunction(()=>window.__clareiraMainLoadingProgressReady===true);
  try { await page.waitForSelector('.shell.is-authenticated', { timeout: 20_000 }); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ username: user.username, errors,
      shell: await page.locator('.shell').getAttribute('class').catch(() => null),
      text: await page.locator('body').innerText().catch(() => ''),
      session: await page.request.get(`${allowedOrigin}/dev/auth/me`).then(r => r.json()).catch(() => null) }, null, 2)}\n`);
    throw error;
  }
  await page.evaluate(async () => {
    const [module, world] = await Promise.all([import('/dev/main.js'), import('/dev/world.mjs')]);
    window.roomLayoutAudit = module.inspectMovement;
    window.roomLayoutConfig = () => {
      const state=module.inspectMovement();
      const layout=world.getRoomLayout(state.roomKind,state.roomBuildingId);
      return {id:layout.id,bounds:layout.bounds,door:layout.door,spawn:layout.spawn,elevation:layout.elevation,fixtures:layout.fixtures,counter:layout.counter};
    };
  });
  try {
    await page.waitForFunction(() => {
      const readiness = window.roomLayoutAudit?.()?.readiness;
      return readiness?.sceneReady && readiness?.predictionReady && readiness?.connected;
    }, null, { timeout: 30_000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({ url: location.href, auth: document.querySelector('.shell')?.className,
      loading: document.querySelector('#loading-message')?.textContent, state: window.roomLayoutAudit?.() })).catch(() => null);
    process.stderr.write(`${JSON.stringify({ user: user.username, debug, errors }, null, 2)}\n`);
    throw error;
  }
  await page.waitForFunction(() => window.roomLayoutAudit()?.location === 'room'
    || window.roomLayoutAudit()?.position?.x > 0, null, { timeout: 10_000 });
  await page.waitForTimeout(350);
  // A brief approach stays inside; crossing the doorway floor exits promptly.
  // After checking that boundary, return through the door before measuring both fades.
  const thresholdLayout = await page.evaluate(() => window.roomLayoutConfig());
  const thresholdMovement = [];
  thresholdMovement.push(await page.evaluate(() => window.roomLayoutAudit()));
  await page.locator('#world').focus();
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight');
  thresholdMovement.push(await page.evaluate(() => window.roomLayoutAudit()));
  await page.keyboard.down('ArrowDown'); await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowDown'); await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(400);
  const thresholdEnd = await page.evaluate(() => window.roomLayoutAudit());
  assert.equal(thresholdMovement[1].location,'room',
    `${user.username}: the first shallow step toward the doorway stays inside; state=${JSON.stringify(thresholdMovement[1])}`);
  if(thresholdEnd.location==='clearing'){
    await page.waitForFunction(()=>window.roomLayoutAudit().location==='clearing'
      &&document.querySelector('#room-transition').hidden
      &&document.querySelector('#scene-loading').hidden
      &&!document.querySelector('.shell').inert,null,{timeout:10000});
    await page.keyboard.press('e');
    await page.waitForFunction(()=>window.roomLayoutAudit().location==='room'
      &&document.querySelector('#room-transition').hidden
      &&document.querySelector('#scene-loading').hidden
      &&!document.querySelector('.shell').inert,null,{timeout:10000});
  }else assert.equal(thresholdEnd.location,'room',
    `${user.username}: before the door threshold the player stays inside; end=${JSON.stringify(thresholdEnd.position)}`);
  return { context, page };
}


async function captureFade(page,filename){
 await page.evaluate(()=>{const shade=document.querySelector('.room-transition-shade');window.captureAnimation=shade.getAnimations()[0];if(window.captureAnimation){window.captureAnimation.pause();window.captureAnimation.currentTime=window.captureAnimation.effect.getTiming().duration/2;}});
 await page.screenshot({path:path.join(output,filename)});
 await page.evaluate(()=>window.captureAnimation?.play());
}
const results=[];
try{
 await storage.ready();
 if(process.env.CATALOG_FILE){const {readFile,writeFile}=await import('node:fs/promises');await writeFile(path.join(stateDirectory,'object-catalog.json'),await readFile(process.env.CATALOG_FILE),{mode:0o600});}
  preview=createPreviewServer({gameDirectory:path.join(root,'game'),stateDirectory,port:previewPort,allowedOrigin});await preview.listen();
  room=createPrototypeServer({stateDirectory,allowedOrigin,port:0,ambientCampfire:false});room.address=await room.listen();
  // Service worker script requests bypass Playwright page routing. Serve the
  // same /dev/ prefix as the real preview so browser checks exercise the
  // actual cache/bootstrap path instead of failing before the scene loads.
  prefixProxy=http.createServer((request,response)=>{
    const requested=new URL(request.url,allowedOrigin),targetPath=requested.pathname.replace(/^\/dev(?=\/)/,'')||'/';
    const upstream=http.request({hostname:'127.0.0.1',port:previewPort,
      path:`${targetPath}${requested.search}`,method:request.method,
      headers:{...request.headers}},incoming=>{
      response.writeHead(incoming.statusCode||502,incoming.headers);incoming.pipe(response);
    });
    upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end();});
    request.pipe(upstream);
  });
  await new Promise((resolve,reject)=>{prefixProxy.once('error',reject);prefixProxy.listen(browserPort,'127.0.0.1',resolve);});
 for(const [label,viewport,motion] of [['desktop',{width:1440,height:900},'no-preference'],['mobile',{width:390,height:844},'no-preference'],['reduced',{width:390,height:844},'reduce'],['cabin',{width:1440,height:900},'no-preference']]){
  if(process.env.CHECK_ONLY&&!process.env.CHECK_ONLY.split(',').includes(label))continue;
  const user=await createAccount('Fade'+label,{buildingId:label==='cabin'?'cabin-cedar-one':'lodging-ember-hotel',...(label==='cabin'?{mode:'owned'}:{})});
  const {page,context}=await openPage(user,viewport);
  await page.emulateMedia({reducedMotion:motion});
  await page.evaluate(()=>{
   window.fadeFrames=[];
   const record=()=>{const el=document.querySelector('#room-transition');
    if(el&&!el.hidden){const shade=el.querySelector('.room-transition-shade');window.fadeFrames.push({time:performance.now(),phase:el.dataset.phase,opacity:Number(getComputedStyle(shade).opacity),duration:shade.getAnimations()[0]?.effect.getTiming().duration,location:window.roomLayoutAudit().location,loading:!document.querySelector('#scene-loading').hidden});}
    requestAnimationFrame(record);
   };requestAnimationFrame(record);
  });
  // Exit through the real threshold by walking, then re-enter with E.
  await page.locator('#world').focus();
  await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1100);await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight');
  const interiorStart = await page.evaluate(() => window.roomLayoutAudit());
  const activeLayout = await page.evaluate(() => window.roomLayoutConfig());
  assert.equal(interiorStart.location,'room',`${label}: walking inward stays in the room`);
  assert.ok(interiorStart.position.y < activeLayout.bounds.bottom - .25,
    `${label}: walking inward reaches the floor; position=${JSON.stringify(interiorStart.position)} layout=${JSON.stringify(activeLayout)}`);
  await page.waitForTimeout(200);
  await page.keyboard.down('ArrowDown');await page.keyboard.down('ArrowLeft');
  try { await page.waitForFunction(()=>!document.querySelector('#room-transition').hidden,null,{timeout:10000}); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({label,interiorStart,state:await page.evaluate(()=>window.roomLayoutAudit()),layout:await page.evaluate(()=>window.roomLayoutConfig())},null,2)}\n`);
    throw error;
  }
  await page.keyboard.up('ArrowDown');await page.keyboard.up('ArrowLeft');
  await captureFade(page,`${label}-exit-fade.png`);
  await page.waitForFunction(()=>window.roomLayoutAudit().location==='clearing'&&document.querySelector('#room-transition').hidden&&!window.roomLayoutAudit().readiness.loading);
  await page.screenshot({path:path.join(output,`${label}-outside.png`)});
  await page.locator('#world').focus();await page.keyboard.press('e');
  await page.waitForFunction(()=>!document.querySelector('#room-transition').hidden,null,{timeout:10000});
  await captureFade(page,`${label}-enter-fade.png`);
  await page.waitForFunction(()=>window.roomLayoutAudit().location==='room'&&document.querySelector('#room-transition').hidden&&!window.roomLayoutAudit().readiness.loading);
  if(viewport.width<600){
    const before=await page.evaluate(()=>window.roomLayoutAudit().position),box=await page.locator('#world').boundingBox();
    const touchPoint=await page.evaluate(()=>{
      const state=window.roomLayoutAudit(),layout=window.roomLayoutConfig(),p={x:layout.door.x,y:layout.bounds.bottom-1};
      const {tileX,tileY,centerX,centerY}=state.projection,camera=state.camera;
      return {x:centerX+(p.x-p.y)*tileX-Math.round((camera.x-camera.y)*tileX),
        y:centerY+(p.x+p.y)*tileY-Math.round((camera.x+camera.y)*tileY)};
    });
    await page.touchscreen.tap(box.x+touchPoint.x,box.y+touchPoint.y);
    await page.waitForFunction(p=>{const state=window.roomLayoutAudit(),layout=window.roomLayoutConfig();
      return state.location==='room'&&Math.hypot(state.position.x-p.x,state.position.y-p.y)>.12
        &&state.position.y<layout.bounds.bottom-.25},before,{timeout:10000});
    assert.equal((await page.evaluate(()=>window.roomLayoutAudit().location)),'room',`${label}: touch movement keeps the player inside`);
  }
  await page.screenshot({path:path.join(output,`${label}-inside.png`)});
  if(process.env.CHECK_RECEPTION&&label!=='cabin'){
    await page.waitForFunction(()=>window.roomLayoutAudit().medievalFurnitureAtlasLoaded);
    const layout=await page.evaluate(()=>window.roomLayoutConfig());
    assert.ok(layout.fixtures.filter(item=>['chair','sofa','table','bookshelf','chest','lamp'].includes(item.kind))
      .every(item=>item.catalogId?.startsWith('furniture.medieval-')),'reception uses medieval asset references');
    assert.equal(layout.counter.surfaceCount,3,'counter is assembled from canonical medieval sideboards');
    for(const target of [{name:'balcao',x:8,y:6},{name:'espera',x:3.8,y:8.8},{name:'canto',x:2.1,y:9.85},{name:'sala',x:13,y:8}]){
      const route=await page.evaluate(async goal=>{
        const world=await import('/dev/world.mjs'),state=window.roomLayoutAudit();
        const layout=world.getRoomLayout(state.roomKind,state.roomBuildingId);
        const points=world.findWalkPath(state.position,goal,[],'room',[],[],layout);
        const sampled=points.filter((p,index)=>index%3===2||index===points.length-1);
        // Pathfinding may return a single distant endpoint for a clear segment.
        // Split it so every simulated tap stays within the phone's visible floor.
        const visibleSteps=[];let previous=state.position;
        for(const point of sampled){const count=Math.max(1,Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y)/1.25));
          for(let step=1;step<=count;step++)visibleSteps.push({x:previous.x+(point.x-previous.x)*step/count,y:previous.y+(point.y-previous.y)*step/count});
          previous=point;
        }
        return visibleSteps;
      },target);
      assert.ok(route.length,`${label}: route to ${target.name} exists`);
      for(const waypoint of route){
        await page.waitForFunction(()=>window.roomLayoutAudit().walkPath.length===0,null,{timeout:8000});
        await page.waitForTimeout(150);
        const projected=await page.evaluate(p=>{
          const state=window.roomLayoutAudit(),{tileX,tileY,centerX,centerY}=state.projection,camera=state.camera;
          return {x:centerX+(p.x-p.y)*tileX-Math.round((camera.x-camera.y)*tileX),
            y:centerY+(p.x+p.y)*tileY-Math.round((camera.x+camera.y)*tileY)};
        },waypoint);
        const box=await page.locator('#world').boundingBox();
        if(viewport.width<600)await page.touchscreen.tap(box.x+projected.x,box.y+projected.y);
        else await page.mouse.click(box.x+projected.x,box.y+projected.y);
        try{await page.waitForFunction(p=>{const s=window.roomLayoutAudit();return s.location==='room'&&Math.hypot(s.position.x-p.x,s.position.y-p.y)<.26;},waypoint,{timeout:8000});}
        catch(error){console.error(JSON.stringify({target,waypoint,projected,state:await page.evaluate(()=>window.roomLayoutAudit())}));await page.screenshot({path:path.join(output,`${label}-route-failure.png`)});throw error;}
      }
      await page.waitForTimeout(250);
      await page.screenshot({path:path.join(output,`${label}-${target.name}.png`)});
    }
  }
  const frames=await page.evaluate(()=>window.fadeFrames);
  for(const location of ['clearing','room']){
   const samples=frames.filter(f=>f.location===location);
   assert.ok(samples.some(f=>f.phase==='out'),`${label} ${location} fades out`);
   assert.ok(samples.some(f=>f.phase==='in'),`${label} ${location} fades in`);
   assert.ok(samples.some(f=>f.opacity>0&&f.opacity<1),`${label} ${location} has intermediate opacity`);
   assert.ok(samples.some(f=>f.opacity>.95),`${label} ${location} passes through black`);
  }
  assert.ok(frames.every(f=>[...(motion==='reduce'?[60,80]:[180,260]),undefined].includes(f.duration)),`${label} uses the requested motion timing`);
  assert.equal(await page.locator('.shell').evaluate(el=>el.inert),false);
  results.push({label,frames});
  await import('node:fs/promises').then(({writeFile})=>writeFile(path.join(output,`${label}-result.json`),JSON.stringify({passed:true,label,frames,errors},null,2)));
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await import('node:fs/promises').then(({writeFile})=>writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,results,errors},null,2)));
 console.log(JSON.stringify({passed:true,scenarios:results.map(r=>r.label)}));
}finally{
 await browser.close();if(room)await room.close();if(preview)await preview.close();
 if(prefixProxy?.listening)await new Promise(resolve=>prefixProxy.close(resolve));
 await storage.close();await rm(stateDirectory,{recursive:true,force:true});
}
