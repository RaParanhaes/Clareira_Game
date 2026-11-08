import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createStorageAdapter } from '../database/storage.mjs';
import { getRoomLayout, WORLD_COORDINATE_VERSION, CLEARING_DOOR } from '../game/world.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING } from '../game/village-buildings.mjs';
import { LODGING_OFFER_BY_KEY, lobbyRoomKey, lodgingRoomKey } from '../game/lodging-catalog.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createDevPreviewBridge } from './dev-preview-bridge.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'logs/building-standard/playable');
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-room-layout-'));
await mkdir(output, { recursive: true });
const portProbe = http.createServer();
await new Promise((resolve, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolve);
});
const pagePort = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const allowedOrigin = `http://127.0.0.1:${pagePort}`;
const storage = createStorageAdapter({ directory: stateDirectory });
const locations = createJsonPlayerLocationStore(stateDirectory);
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});
let preview, bridge, room;
const errors = [];

async function createAccount(username, { location = 'room', buildingId, mode = null, legacy = false } = {}) {
  const created = await storage.accounts.register({ username, password: 'senha-segura-de-teste' });
  const profileId = created.profile.id;
  if(buildingId==='cabin-cedar-one'&&mode==='owned')await storage.saveRoom(profileId,[{
    id:'12345678-abcd-4321-abcd-123456789abc',kind:'stool',x:6.5,y:9,rotation:0,
  }]);
  const layout = location === 'room'
    ? getRoomLayout(legacy?'legacy':buildingId ? (mode ? 'lodging' : 'lobby') : 'lobby', buildingId, mode)
    : null;
  let roomKey = '';
  if (location === 'room' && mode) {
    const offer = LODGING_OFFER_BY_KEY.get(`${buildingId}:${mode}`);
    assert.ok(offer, `lodging offer exists for ${buildingId}:${mode}`);
    await storage.creditWallet(profileId, 100_000);
    const result = await storage.claimLodging({ profileId, ...offer });
    roomKey = lodgingRoomKey(result.claim);
  } else if (location === 'room' && legacy) {
    roomKey=`account:${profileId}`;
  } else if (location === 'room') {
    roomKey = lobbyRoomKey(buildingId || 'arrival');
  }
  const hotel = VILLAGE_BUILDINGS.find(item => item.id === 'lodging-ember-hotel');
  const exteriorBuilding=[RECEPTION_BUILDING,...VILLAGE_BUILDINGS].find(b=>b.id===buildingId)||hotel;
  const position = location === 'clearing'
    ? buildingId && buildingId !== 'arrival'
      ? {x:exteriorBuilding.bounds.right+.9,y:(exteriorBuilding.bounds.top+exteriorBuilding.bounds.bottom)/2}
      : buildingId ? {x:exteriorBuilding.door.x,y:exteriorBuilding.door.y+2} : { x: hotel.door.x - 1.2, y: hotel.door.y + 1.2 }
    : layout.spawn;
  await locations.savePlayerLocation(profileId, {
    location, dimensionId: 'surface', ...position, roomKey,
    roomOwnerName: username, worldVersion: WORLD_COORDINATE_VERSION,
  });
  return { username, password: 'senha-segura-de-teste', profileId, token: created.token, buildingId, mode };
}

async function openPage(user, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600,
    reducedMotion:process.env.REVIEW_REDUCED_MOTION?'reduce':'no-preference' });
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
    if (response.status() >= 400)
      errors.push({ username: user.username, status: response.status(), url: response.url() });
  });
  await context.addCookies([{
    name: 'clareira_session', value: user.token, url: `${allowedOrigin}/dev/`, httpOnly: true, sameSite: 'Strict',
  }]);
  await page.routeWebSocket('**/dev/room', socket => {
    const upstream = new WebSocket(`ws://127.0.0.1:${room.address.port}/room`, {
      headers: { origin: allowedOrigin, cookie: `clareira_session=${user.token}` },
    });
    const queued = [];
    socket.onMessage(message => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else queued.push(message);
    });
    upstream.on('open', () => queued.forEach(message => upstream.send(message)));
    upstream.on('message', message => { try { const state=JSON.parse(message.toString());if(state.type==='state')state.serverWallTimeMs=(Number(process.env.REVIEW_HOUR)||12)*60*1000;socket.send(JSON.stringify(state)); } catch {} });
    upstream.on('error', error => errors.push({ username: user.username, websocket: error.message }));
    socket.onClose(() => upstream.close());
  });
  await page.goto(`${allowedOrigin}/dev/${process.env.PROFILE_RENDER ? '?profile=1' : ''}`, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('.shell.is-authenticated', { timeout: 20_000 }); }
  catch(error){
    const debug=await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(0,1200),
      shell:document.querySelector('.shell')?.className,authDialog:document.querySelector('#auth-dialog')?.outerHTML?.slice(0,500)})).catch(()=>null);
    process.stderr.write(`${JSON.stringify({user:user.username,debug,errors},null,2)}\n`);throw error;
  }
  await page.evaluate(async () => {
    const module = await import('/dev/main.js');
    window.roomLayoutAudit = module.inspectMovement;
    window.renderPerformance = module.inspectPerformance;
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
  return { context, page };
}

async function walkTo(page,target) {
  const state=await page.evaluate(()=>window.roomLayoutAudit());
  const p=state.projection;
  const x=p.centerX+(target.x-target.y)*p.tileX-Math.round((state.camera.x-state.camera.y)*p.tileX);
  const y=p.centerY+(target.x+target.y)*p.tileY-Math.round((state.camera.x+state.camera.y)*p.tileY);
  await page.mouse.click(x,y);
  try{await page.waitForFunction(target=>{
    const s=window.roomLayoutAudit();return Math.hypot(s.position.x-target.x,s.position.y-target.y)<.22;
  },target,{timeout:12000});}catch(error){
    const debug=await page.evaluate(({x,y,target})=>({target,screen:{x,y},element:document.elementFromPoint(x,y)?.outerHTML?.slice(0,300),state:window.roomLayoutAudit()}),{x,y,target});
    await import('node:fs/promises').then(({writeFile})=>writeFile(path.join(output,'walk-failure.json'),JSON.stringify(debug,null,2)));
    await page.screenshot({path:path.join(output,'walk-failure.png')});throw error;
  }
}

async function capture(user, filename, viewport) {
  if(process.env.CHECK_ONLY&&!filename.includes(process.env.CHECK_ONLY))return {skipped:filename};
  console.log(`Checking ${filename}`);
  const session = await openPage(user, viewport);
  const { page, context } = session;
  const state = await page.evaluate(() => window.roomLayoutAudit());
  if (state.location === 'room') {
    await page.evaluate(() => {
      const dialog = document.querySelector('#lodging-dialog');
      if (dialog?.open) dialog.close();
    });
  }
  await page.waitForTimeout(350);
  if(user.buildingId==='cabin-cedar-one'&&user.mode==='owned'){
    assert.equal(state.roomFurniture.length,1,'saved owner furniture loads inside the cabin');
    await walkTo(page,{x:7.5,y:9});
    await page.locator('#room-build-toggle').click();
    await page.locator('#room-rotate').click();
    for(const rotation of [1,2,3,0]){
      // Server actions have a 250ms cooldown; pace distinct user clicks.
      await page.waitForTimeout(600);
      const s=await page.evaluate(()=>window.roomLayoutAudit()),p=s.projection,item=s.roomFurniture[0];
      const x=p.centerX+(item.x-item.y)*p.tileX-Math.round((s.camera.x-s.camera.y)*p.tileX);
      const y=p.centerY+(item.x+item.y)*p.tileY-Math.round((s.camera.x+s.camera.y)*p.tileY);
      await page.mouse.click(x,y-10);
      try { await page.waitForFunction(rotation=>window.roomLayoutAudit().roomFurniture[0]?.rotation===rotation,rotation,{timeout:8000}); }
      catch(error){
        const debug=await page.evaluate(()=>window.roomLayoutAudit());
        await page.screenshot({path:path.join(output,`stool-rotation-failure-${rotation}.png`)});
        process.stderr.write(`${JSON.stringify({rotation,debug,errors},null,2)}\n`);throw error;
      }
      if(rotation===1||rotation===2)await page.screenshot({path:path.join(output,`stool-rotation-${rotation}.png`)});
    }
    await page.locator('#room-rotate').click();
    const saved=await storage.loadRoom(user.profileId);assert.equal(saved[0].rotation,0,'rotation is saved');
    if(process.env.FURNITURE_REVIEW){
      // Exercise the same toolbar and canvas clicks available to a player.
      const clickFloor=async target=>{
        const state=await page.evaluate(()=>window.roomLayoutAudit()),p=state.projection;
        const x=p.centerX+(target.x-target.y)*p.tileX-Math.round((state.camera.x-state.camera.y)*p.tileX);
        const y=p.centerY+(target.x+target.y)*p.tileY-Math.round((state.camera.x+state.camera.y)*p.tileY);
        if(page.viewportSize().width<600)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
      };
      await page.locator('#room-kind').selectOption('chair');
      await clickFloor({x:8,y:8});
      await page.waitForFunction(()=>window.roomLayoutAudit().roomFurniture.some(i=>i.kind==='chair'));
      await page.locator('#room-place').click();
      await page.locator('#room-kind').selectOption('lamp');
      await page.waitForTimeout(300);await clickFloor({x:9,y:8.5});
      await page.waitForFunction(()=>window.roomLayoutAudit().roomFurniture.some(i=>i.kind==='lamp'));
      await page.locator('#room-place').click();
      await page.locator('#room-move').click();
      await page.waitForTimeout(300);await clickFloor({x:6.5,y:9});await clickFloor({x:6,y:9});
      try{await page.waitForFunction(()=>window.roomLayoutAudit().roomFurniture.some(i=>i.kind==='stool'&&i.x===6&&i.y===9),undefined,{timeout:6000});}
      catch(error){
        const debug=await page.evaluate(()=>({state:window.roomLayoutAudit(),canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),toast:document.querySelector('#toast')?.textContent}));
        await import('node:fs/promises').then(({writeFile})=>writeFile(path.join(output,'furniture-move-failure.json'),JSON.stringify(debug,null,2)));
        await page.screenshot({path:path.join(output,'furniture-move-failure.png')});throw error;
      }
      await page.locator('#room-move').click();
      await walkTo(page,{x:8,y:9});
      await page.locator('#room-use').click();
      await page.waitForTimeout(300);await clickFloor({x:9,y:8.5});
      await page.waitForFunction(()=>window.roomLayoutAudit().roomFurniture.find(i=>i.kind==='lamp')?.enabled===false);
      await page.screenshot({path:path.join(output,'lamp-off.png')});
      await page.waitForTimeout(300);await clickFloor({x:9,y:8.5});
      await page.waitForFunction(()=>window.roomLayoutAudit().roomFurniture.find(i=>i.kind==='lamp')?.enabled===true);
      await page.screenshot({path:path.join(output,'lamp-on.png')});
      await page.waitForTimeout(300);await clickFloor({x:8,y:8});
      await page.waitForFunction(()=>{const s=window.roomLayoutAudit();return s.pose.sitting&&Math.hypot(s.server.x-8,s.server.y-8)<.1;});
      await page.waitForTimeout(600);await page.screenshot({path:path.join(output,'chair-use.png')});
      await page.locator('#room-use').click();
      if(page.viewportSize().width<600)await walkTo(page,{x:8,y:9});
      else{await page.locator('#world').focus();await page.keyboard.down('s');await page.waitForTimeout(450);await page.keyboard.up('s');}
      await page.waitForFunction(()=>!window.roomLayoutAudit().pose.sitting);
      const saved=await storage.loadRoom(user.profileId);
      assert.ok(saved.some(i=>i.kind==='lamp'&&i.enabled));assert.ok(saved.some(i=>i.kind==='stool'&&i.x===6&&i.y===9));
      await import('node:fs/promises').then(({writeFile})=>writeFile(path.join(output,'furniture-state.json'),JSON.stringify(saved,null,2)));
    }
    const cabinLayout=getRoomLayout('lodging',user.buildingId,'owned');
    await walkTo(page,{x:cabinLayout.door.x,y:cabinLayout.bounds.bottom-.55});
  }
  await page.screenshot({ path: path.join(output, filename), fullPage: false });
  const layout=getRoomLayout(state.roomKind,state.roomBuildingId,user.mode);
  // The old invisible front strip blocked this visibly open floor corner.
  const target={x:layout.bounds.right-.6,y:layout.bounds.bottom-.4};
  await walkTo(page,target);
  await page.waitForFunction(()=>{const s=window.roomLayoutAudit();return s.walkPath.length===0&&Math.hypot(s.position.vx||0,s.position.vy||0)<.1&&Math.hypot(s.position.x-s.server.x,s.position.y-s.server.y)<.08;},null,{timeout:6000});
  const cornerState=await page.evaluate(()=>window.roomLayoutAudit());
  assert.ok(Math.hypot(cornerState.position.x-cornerState.server.x,cornerState.position.y-cornerState.server.y)<.12,'client/server agree at the front floor corner');
  if(layout.elevation==='flat'){
    // Flat interiors now leave by walking through the actual floor entrance.
    await walkTo(page,{x:layout.door.x,y:layout.bounds.bottom-.55});
    const s=await page.evaluate(()=>window.roomLayoutAudit()),p=s.projection,target=layout.spawn;
    const x=p.centerX+(target.x-target.y)*p.tileX-Math.round((s.camera.x-s.camera.y)*p.tileX);
    const y=p.centerY+(target.x+target.y)*p.tileY-Math.round((s.camera.x+s.camera.y)*p.tileY);
    if(viewport?.width<600)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
  }else{
    await walkTo(page,layout.spawn);
    await page.locator('#world').focus();await page.keyboard.press('e');
  }
  await page.waitForFunction(previous=>{
    const s=window.roomLayoutAudit();return s.readiness.sceneReady&&(previous.roomKind==='lobby'||previous.roomKind==='legacy'||previous.roomBuildingId?.startsWith('cabin-')
      ?s.location==='clearing':s.location==='room'&&s.roomKind==='lobby');
  },state,{timeout:12000});
  if(state.roomKind==='lodging'&&!state.roomBuildingId?.startsWith('cabin-'))await page.screenshot({path:path.join(output,`return-${filename}`)});

  await context.close();
  return { username: user.username, location: state.location, roomKind: state.roomKind,
    roomBuildingId: state.roomBuildingId, position: state.position, screenshot: filename };
}

try {
  await storage.ready();
  const defaultVisitor = await createAccount('Jogador', { location: 'clearing' });
  const neighbor = await createAccount('Visitante', { location: 'clearing' });
  const legacyRoom = await createAccount('LegacyRoom',{legacy:true});
  const arrivalLobby = await createAccount('ArrivalLobby', {});
  const innLobby = await createAccount('InnLobby', {buildingId:'lodging-pine-inn'});
  const rillLobby = await createAccount('RillLobby', {buildingId:'lodging-rill-guesthouse'});
  const hotelLobby = await createAccount('LobbyHotel', { buildingId: 'lodging-ember-hotel' });
  const hotelRoom = await createAccount('HotelQuarto', { buildingId: 'lodging-ember-hotel', mode: 'rent' });
  const hotelApartment = await createAccount('HotelSuite', { buildingId: 'lodging-ember-hotel', mode: 'owned' });
  const innRoom = await createAccount('PineInn', { buildingId: 'lodging-pine-inn', mode: 'rent' });
  const guesthouseRoom = await createAccount('RillStay', { buildingId: 'lodging-rill-guesthouse', mode: 'rent' });
  const cedarRoom = await createAccount('CedarRoom', { buildingId: 'cabin-cedar-one', mode: 'owned' });
  const fernRoom = await createAccount('FernRoom', { buildingId: 'cabin-cedar-two', mode: 'owned' });
  const lookoutRoom = await createAccount('LookoutRoom', { buildingId: 'cabin-cedar-three', mode: 'owned' });
  const mobileGuesthouseRoom = await createAccount('RillStayMobile', { buildingId: 'lodging-rill-guesthouse', mode: 'rent' });

  const exteriorUsers=[];
  for(const [index,b] of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS].entries())exteriorUsers.push({building:b,user:await createAccount(`Exterior${index}`,{location:'clearing',buildingId:b.id})});

  preview = createPreviewServer({ gameDirectory: path.join(root, 'game'), stateDirectory, port: 0, allowedOrigin });
  const previewAddress = await preview.listen();
  bridge = createDevPreviewBridge(previewAddress, { port: pagePort });
  await bridge.listen();
  room = createPrototypeServer({ stateDirectory, allowedOrigin, port: 0, ambientCampfire: false });
  room.address = await room.listen();

  const visitors = await Promise.all([openPage(defaultVisitor), openPage(neighbor)]);
  await visitors[0].page.waitForTimeout(1200);
  const exteriorState = await visitors[0].page.evaluate(() => window.roomLayoutAudit());
  await visitors[0].page.screenshot({ path: path.join(output, 'hotel-exterior-scale.png') });
  if (process.env.PROFILE_RENDER) {
    const page = visitors[0].page;
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    await page.evaluate(() => window.renderPerformance(true));
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(4000);
    await page.keyboard.up('ArrowUp');
    const profile = await page.evaluate(() => ({ movement: window.roomLayoutAudit(), performance: window.renderPerformance() }));
    assert.equal(profile.movement.campfireAudio?.ambientBuffersReady,true,'ambient audio buffers finish in the worker');
    const {profile:cpu}=await cdp.send('Profiler.stop');
    const nodes=new Map(cpu.nodes.map(node=>[node.id,node])),hot={};
    for(let i=0;i<(cpu.samples||[]).length;i++){
      const name=nodes.get(cpu.samples[i])?.callFrame.functionName||'(anonymous)';
      hot[name]=(hot[name]||0)+(cpu.timeDeltas?.[i]||0)/1000;
    }
    profile.cpuTop=Object.entries(hot).sort((a,b)=>b[1]-a[1]).slice(0,15);
    await cdp.detach();
    await import('node:fs/promises').then(({ writeFile }) => writeFile(
      path.join(output, 'night-map-movement-performance.json'), `${JSON.stringify(profile, null, 2)}\n`));
    assert.ok(profile.performance.samples > 5, 'night movement profile collected frames');
  }
  await Promise.all(visitors.map(({ context }) => context.close()));

  const exteriorCases = process.env.CHECK_ONLY === 'exterior' || !process.env.CHECK_ONLY ? exteriorUsers : [];
  for(const {building,user} of exteriorCases){
    const session=await openPage(user);
    const sideState=await session.page.evaluate(async()=>{
      const state=window.roomLayoutAudit(),{canOccupy,PLAYER_RADIUS}=await import('/dev/world.mjs');
      return {position:state.position,canOccupy:canOccupy(state.position,PLAYER_RADIUS)};
    });
    assert.equal(sideState.canOccupy,true,`${building.name}: the side-wall position is walkable`);
    if(building.id!=='arrival')assert.ok(sideState.position.x>building.bounds.right+.55,
      `${building.name}: the avatar stays clear of the right-side facade`);
    await session.page.screenshot({path:path.join(output,`exterior-${building.id}.png`)});
    await session.context.close();
  }

  const captures = [{ username: 'Visitante', location: exteriorState.location,
    position: exteriorState.position, screenshot: 'hotel-exterior-scale.png' }];
  captures.push(await capture(legacyRoom,'legacy-home.png'));
  captures.push(await capture(arrivalLobby,'arrival-reception.png'));
  captures.push(await capture(innLobby,'pine-inn-reception.png'));
  captures.push(await capture(rillLobby,'rill-guesthouse-reception.png'));
  captures.push(await capture(hotelLobby, 'hotel-reception.png'));
  captures.push(await capture(hotelRoom, 'hotel-single-room.png'));
  captures.push(await capture(hotelApartment, 'hotel-apartment.png'));
  captures.push(await capture(innRoom, 'pine-inn-room.png'));
  captures.push(await capture(guesthouseRoom, 'rill-guesthouse-room.png'));
  captures.push(await capture(cedarRoom, 'cedar-cabin-room.png',process.env.FURNITURE_MOBILE?{width:390,height:844}:undefined));
  captures.push(await capture(fernRoom, 'fern-cabin-room.png'));
  captures.push(await capture(lookoutRoom, 'lookout-cabin-room.png'));
  captures.push(await capture(mobileGuesthouseRoom, 'rill-guesthouse-room-mobile.png', { width: 390, height: 844 }));
  await import('node:fs/promises').then(({writeFile})=>writeFile(path.join(output,'errors.json'),JSON.stringify(errors,null,2)));
  assert.deepEqual(errors, [], 'browser loads the local game without runtime or HTTP errors');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(output, 'audit.json'),
    `${JSON.stringify({ captures, errors }, null, 2)}\n`));
  process.stdout.write(`${JSON.stringify({ captures, errors }, null, 2)}\n`);
} finally {
  await browser.close();
  if (room) await room.close();
  if (bridge) await bridge.close();
  if (preview) await preview.close();
  await storage.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
