import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createStorageAdapter } from '../database/storage.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createDevPreviewBridge } from './dev-preview-bridge.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { WORLD_COORDINATE_VERSION } from '../game/world.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'logs/room-furniture-browser');
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-furniture-browser-'));
await mkdir(output, { recursive: true });
const probe = http.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const pagePort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const allowedOrigin = `http://127.0.0.1:${pagePort}`;
const storage = createStorageAdapter({ directory: stateDirectory });
const locations = createJsonPlayerLocationStore(stateDirectory);
const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true, args: ['--no-sandbox'] });
const results = [], errors = [];
let preview, bridge, room;

async function targetPoint(page, box, state, x, y) {
  return page.evaluate(async ({ x, y, camera, projection, roomKind, roomBuildingId }) => {
    const [{ surfaceHeight, HEIGHT_PIXELS }, { getRoomLayout }] = await Promise.all([
      import('/dev/elevation.mjs'), import('/dev/world.mjs'),
    ]);
    const layout = getRoomLayout(roomKind, roomBuildingId);
    const height = surfaceHeight(x, y, 'room', layout), p = projection;
    return { x: p.centerX + (x-y)*p.tileX - Math.round((camera.x-camera.y)*p.tileX),
      y: p.centerY + (x+y)*p.tileY - Math.round((camera.x+camera.y)*p.tileY)
        - height*HEIGHT_PIXELS*p.spriteScale };
  }, { x, y, camera: state.camera, projection: state.projection,
    roomKind: state.roomKind, roomBuildingId: state.roomBuildingId }).then(point => ({
      x: point.x + box.x, y: point.y + box.y,
    }));
}
async function inspect(page) { return page.evaluate(() => window.checkMovement()); }
async function triggerContext(page,mobile) {
  await page.locator('#world').focus();
  if(!mobile){await page.keyboard.press('e');return;}
  await page.locator('.mobile-primary-actions [data-action="context"]').tap();
}
async function checkDepthCrossing(page, target, furnitureId, side, mobile, name) {
  await worldTap(page, target.x, target.y, mobile);
  await page.waitForFunction(({x,y}) => {
    const p=window.checkMovement().position;
    return Math.hypot(p.x-x,p.y-y)<.45;
  }, target, { timeout: 12_000 });
  await page.waitForTimeout(180);
  const state=await inspect(page),actor=state.roomDepthAudit.find(item=>item.type==='self'),
    furniture=state.roomDepthAudit.find(item=>item.type==='furniture'&&item.id===furnitureId);
  assert.ok(actor&&furniture,`${name}: actual room render order exposes the avatar and furniture`);
  if(side==='behind')assert.ok(actor.renderOrder<furniture.renderOrder,
    `${name}: furniture draws over the avatar behind its footprint (${JSON.stringify({actor,furniture})})`);
  else assert.ok(furniture.renderOrder<actor.renderOrder,
    `${name}: avatar draws over furniture from the front (${JSON.stringify({actor,furniture})})`);
  const screenshot=path.join(output,`${mobile?'mobile':'desktop'}-depth-${side}.png`);
  if(!mobile)await page.screenshot({path:screenshot});
  return {side,position:{x:state.position.x,y:state.position.y},actorOrder:actor.renderOrder,
    furnitureOrder:furniture.renderOrder,depth:{actor:actor.depth,furniture:furniture.depth},screenshot:mobile?null:screenshot};
}
async function projectWorldPoint(page, x, y, lift = 0) {
  const state = await inspect(page), box = await page.locator('#world').boundingBox();
  const point = await targetPoint(page, box, state, x, y); point.y += lift; return point;
}
async function tapPoint(page, point, mobile) {
  if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}
async function worldTap(page, x, y, mobile, lift = 0) {
  await tapPoint(page, await projectWorldPoint(page, x, y, lift), mobile);
}
async function worldHover(page, x, y) {
  const state = await inspect(page), box = await page.locator('#world').boundingBox();
  const point = await targetPoint(page, box, state, x, y); await page.mouse.move(point.x, point.y);
}
async function openPage(user, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await context.addCookies([{ name: 'clareira_session', value: user.token, url: `${allowedOrigin}/dev/`,
    httpOnly: true, sameSite: 'Strict' }]);
  const bridges = [];
  await page.routeWebSocket('**/dev/room', socket => {
    const upstream = new WebSocket(`ws://127.0.0.1:${room.address.port}/room`, {
      headers: { origin: allowedOrigin, cookie: `clareira_session=${user.token}` },
    });
    bridges.push(upstream);
    const queued = [];
    socket.onMessage(message => upstream.readyState === WebSocket.OPEN ? upstream.send(message) : queued.push(message));
    upstream.on('open', () => queued.forEach(message => upstream.send(message)));
    upstream.on('message', message => { try { socket.send(message.toString()); } catch {} });
    upstream.on('close', () => { try { socket.close(); } catch {} });
    upstream.on('error', error => errors.push(error.message));
    socket.onClose(() => upstream.close());
  });
  await page.goto(`${allowedOrigin}/dev/`, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('.shell.is-authenticated'); }
  catch (error) {
    const debug = await page.evaluate(async () => ({ shell: document.querySelector('.shell')?.className,
      loading: document.querySelector('#loading-message')?.textContent,
      authMe: await fetch('/dev/auth/me').then(async response => ({ status: response.status, body: await response.text() })).catch(value => value.message) }));
    console.error('FURNITURE AUTH DIAGNOSTIC', JSON.stringify({ ...debug, cookies: await context.cookies(`${allowedOrigin}/dev/`) }));
    throw error;
  }
  await page.evaluate(async () => { window.checkMovement = (await import('/dev/main.js')).inspectMovement; });
  await page.waitForFunction(() => {
    const state = window.checkMovement();
    return state.readiness.sceneReady && state.readiness.predictionReady && state.readiness.connected
      && state.location === 'room';
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(200);
  return { context, page, bridges };
}

async function runVisit(name, viewport, mobile, user) {
  const session = await openPage(user, viewport, mobile), { page } = session;
  try {
    assert.equal((await inspect(page)).furnitureAtlasLoaded,true,`${name}: PNG furniture atlas loaded before room use`);
    assert.equal((await inspect(page)).medievalFurnitureAtlasLoaded,true,`${name}: 3D/UV atlas for all medieval models loaded before room use`);
    assert.equal((await inspect(page)).roomCanEdit, true, `${name}: test account owns the room`);
    assert.equal(await page.locator('#room-build-tools').isVisible(), true, `${name}: room tools visible`);

    let item = { x: 6, y: 8 };
    if (await page.locator('#room-kind').inputValue() !== 'stool') await page.locator('#room-kind').selectOption('stool');
    if ((await inspect(page)).buildMode !== 'place') await page.locator('#room-place').click();
    await worldTap(page, item.x, item.y, mobile);
    try { await page.waitForFunction(() => window.checkMovement().roomFurniture.length === 1, null, { timeout: 8000 }); }
    catch (error) {
      const state = await inspect(page), toast = await page.locator('#toast').innerText();
      await page.screenshot({ path: path.join(output, `${name}-placement-failure.png`) });
      console.error('FURNITURE PLACEMENT DIAGNOSTIC', JSON.stringify({ mode: state.buildMode,
        location: state.location, position: state.position, roomCanEdit: state.roomCanEdit,
        preview: state.roomPreview, furniture: state.roomFurniture, toast }));
      throw error;
    }
    const placed = (await inspect(page)).roomFurniture[0];
    assert.equal(placed.kind, 'stool');
    assert.ok(Math.hypot(placed.x - item.x, placed.y - item.y) < .12,
      `${name}: stool snaps onto a legal tile (${JSON.stringify({ item, placed })})`);
    await page.locator('#room-place').click();

    await worldTap(page, item.x+.5, item.y-.5, mobile);
    await page.waitForFunction(() => {
      const state = window.checkMovement(), furniture = state.roomFurniture[0];
      return furniture && Math.hypot(state.position.x - furniture.x, state.position.y - furniture.y) < .85;
    }, null, { timeout: 12_000 });
    await page.waitForFunction(() => {
      const state=window.checkMovement();
      return Math.hypot(state.position.x-state.server.x,state.position.y-state.server.y)<.06
        &&Math.hypot(state.server.vx||0,state.server.vy||0)<.12;
    },null,{timeout:4000});
    const collision = await inspect(page);
    if(Math.hypot(collision.position.x-placed.x,collision.position.y-placed.y)<.58)
      await page.screenshot({path:path.join(output,`${name}-stool-collision-failure.png`)});
    assert.ok(Math.hypot(collision.position.x - placed.x, collision.position.y - placed.y) >= .58,
      `${name}: avatar stops outside the stool collider (${JSON.stringify({position:collision.position,server:collision.server,placed})})`);
    assert.ok(Math.hypot(collision.position.x - collision.server.x, collision.position.y - collision.server.y) < .06,
      `${name}: client and server agree beside the stool (${JSON.stringify({position:collision.position,server:collision.server})})`);

    const depthBehind=await checkDepthCrossing(page,{x:6,y:6.9},placed.id,'behind',mobile,name);
    const depthInFront=await checkDepthCrossing(page,{x:6,y:9.2},placed.id,'front',mobile,name);
    assert.ok(depthBehind.depth.actor<depthBehind.depth.furniture
      &&depthInFront.depth.actor>depthInFront.depth.furniture,
    `${name}: depth follows the avatar across the furniture footprint`);
    await worldTap(page,item.x+.5,item.y-.5,mobile);
    await page.waitForFunction(() => {
      const state=window.checkMovement(),furniture=state.roomFurniture[0];
      return furniture&&Math.hypot(state.position.x-furniture.x,state.position.y-furniture.y)<.85;
    },null,{timeout:12_000});

    await page.waitForFunction(()=>{const state=window.checkMovement();return Math.hypot(state.position.x-state.server.x,state.position.y-state.server.y)<.06
      &&Math.hypot(state.server.vx||0,state.server.vy||0)<.12;},null,{timeout:4000});
    const directTapSat=(await inspect(page)).pose.sitting;
    if(directTapSat){
      await triggerContext(page,mobile);
      await page.waitForFunction(() => window.checkMovement().pose.sitting === false, null, { timeout: 5000 });
      await triggerContext(page,mobile);
    }else await triggerContext(page,mobile);
    try{await page.waitForFunction(() => window.checkMovement().pose.sitting === true, null, { timeout: 5000 });}
    catch(error){const state=await inspect(page);console.error('STOOL USE DIAGNOSTIC',JSON.stringify({position:state.position,server:state.server,
      pose:state.pose,context:await page.locator('[data-action="context"]').getAttribute('aria-label'),toast:await page.locator('#toast').innerText()}));throw error;}
    await triggerContext(page,mobile);
    await page.waitForFunction(() => window.checkMovement().pose.sitting === false, null, { timeout: 5000 });

    const furnitureId = (await inspect(page)).roomFurniture[0].id;
    await page.locator('#room-move').click();
    await worldTap(page, item.x, item.y, mobile, 3);
    await page.waitForFunction(() => Boolean(window.checkMovement().roomMovingId), null, { timeout: 8000 });
    assert.equal((await inspect(page)).roomMovingId, furnitureId, `${name}: selects the source furniture`);
    assert.equal((await inspect(page)).roomSelectedId,furnitureId,`${name}: selection is visible while moving`);
    if (!mobile) {
      await worldHover(page, 10, 10);
      await page.waitForFunction(() => window.checkMovement().roomPreview?.item, null, { timeout: 3000 });
      assert.equal((await inspect(page)).roomPreview.valid, true, `${name}: clear destination is marked valid`);
      await page.screenshot({ path: path.join(output, 'desktop-moving-valid.png') });
      await worldHover(page, 8, 11);
      await page.waitForFunction(() => window.checkMovement().roomPreview?.item?.y === 11, null, { timeout: 3000 });
      assert.equal((await inspect(page)).roomPreview.valid, false, `${name}: doorway destination is marked invalid`);
      await page.screenshot({ path: path.join(output, 'desktop-moving-invalid.png') });
    }
    const beforeMove = await inspect(page);
    const movePoint = await projectWorldPoint(page, 10, 10);
    await tapPoint(page, movePoint, mobile);
    await page.waitForFunction(() => {
      const state = window.checkMovement();
      return state.roomFurniture[0]?.x === 10 && state.roomFurniture[0]?.y === 10 && !state.roomMovingId;
    }, null, { timeout: 8000 });
    item = { x: 10, y: 10 };
    const moved = await inspect(page);
    const midpoint = await page.evaluate(id => {
      const entry = window.checkMovement().roomFurnitureRender.find(value => value.id === id);
      return entry && window.checkMovement(entry.startedAt + entry.durationMs / 2)
        .roomFurnitureRender.find(value => value.id === id);
    }, furnitureId);
    const motionCaptured = midpoint?.progress > 0 && midpoint?.progress < 1
      && midpoint.rendered.x > beforeMove.roomFurniture[0].x && midpoint.rendered.x < item.x;
    assert.ok(motionCaptured, `${name}: furniture render interpolates to the saved position; before=${JSON.stringify(beforeMove.roomFurnitureRender)} moved=${JSON.stringify(moved.roomFurnitureRender)} midpoint=${JSON.stringify(midpoint)} snapshot=${JSON.stringify(moved.roomFurnitureMotionDebug)}`);
    assert.deepEqual({ x: moved.roomFurniture[0].x, y: moved.roomFurniture[0].y }, item);

    await page.locator('#room-move').click();
    await worldTap(page, item.x, item.y, mobile, 3);
    await page.waitForFunction(() => {
      const state = window.checkMovement(), furniture = state.roomFurniture[0];
      return furniture && Math.hypot(state.position.x - furniture.x, state.position.y - furniture.y) < .95;
    }, null, { timeout: 12_000 });
    await page.waitForTimeout(200);

    await page.locator('#room-rotate').click();
    const rotatePoint = await projectWorldPoint(page, item.x, item.y, -8 * (mobile ? 26 / 16 : 32 / 16));
    await tapPoint(page, rotatePoint, mobile);
    await page.waitForFunction(() => window.checkMovement().roomFurniture[0]?.rotation === 1, null, { timeout: 8000 });
    const rotatedState = await inspect(page);
    const rotationMidpoint = await page.evaluate(id => {
      const entry = window.checkMovement().roomFurnitureRender.find(value => value.id === id);
      return entry && window.checkMovement(entry.startedAt + entry.durationMs / 2)
        .roomFurnitureRender.find(value => value.id === id);
    }, furnitureId);
    const rotationAnimated = rotationMidpoint?.durationMs === 150 && rotationMidpoint?.progress > 0
      && rotationMidpoint?.progress < 1 && rotationMidpoint.rotation === 1 && rotationMidpoint.fromRotation === 0;
    assert.ok(rotationAnimated, `${name}: quarter-turn uses a short visual cross-fade`);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-rotated.png`) });
    const rotationNotice = await page.locator('#toast').innerText();
    await page.locator('#room-rotate').click();

    const viewingPosition = { x: 7, y: 9 };
    await worldTap(page, viewingPosition.x, viewingPosition.y, mobile);
    await page.waitForFunction(({ x, y }) => {
      const position = window.checkMovement().position;
      return Math.hypot(position.x - x, position.y - y) < .9;
    }, viewingPosition, { timeout: 12_000 });
    await page.waitForTimeout(300);
    const screenshot = path.join(output, `${mobile ? 'mobile' : 'desktop'}-room.png`);
    await page.screenshot({ path: screenshot });

    await worldTap(page, item.x, item.y, mobile, 4);
    await page.waitForFunction(() => {
      const state = window.checkMovement(), furniture = state.roomFurniture[0];
      return furniture && Math.hypot(state.position.x - furniture.x, state.position.y - furniture.y) < .95;
    }, null, { timeout: 12_000 });
    await page.waitForTimeout(300);
    await page.locator('#room-remove').click();
    await worldTap(page, item.x, item.y, mobile);
    await page.waitForFunction(() => window.checkMovement().roomFurniture.length === 0, null, { timeout: 8000 });
    await page.waitForTimeout(300);
    await page.locator('#room-category').selectOption('mesas');
    assert.equal(await page.locator('#room-kind option').count(),10,`${name}: the medieval tables category exposes ten designs`);
    const medievalTableId='furniture.medieval-mesas-02',medievalTableCatalogId=medievalTableId;
    await page.locator('#room-kind').selectOption(medievalTableId);
    if ((await inspect(page)).buildMode !== 'place') await page.locator('#room-place').click();
    const tablePosition = { x: 6.5, y: 8.5 };
    await worldTap(page, tablePosition.x, tablePosition.y, mobile);
    try { await page.waitForFunction(id => window.checkMovement().roomFurniture[0]?.kind === 'table'
      &&window.checkMovement().roomFurniture[0]?.properties?.catalogId===id, medievalTableCatalogId, { timeout: 8000 }); }
    catch (error) {
      const state = await inspect(page), toast = await page.locator('#toast').innerText();
      await page.screenshot({ path: path.join(output, `${name}-table-placement-failure.png`) });
      console.error('TABLE ROTATION DIAGNOSTIC', JSON.stringify({ mode: state.buildMode, position: state.position,
        preview: state.roomPreview, furniture: state.roomFurniture, toast }));
      throw error;
    }
    assert.equal((await inspect(page)).roomFurniture[0].properties.label,'mesa de banquete I',`${name}: selected catalog design is persisted from the server`);
    await page.locator('#room-place').click();
    const approachTable = { x: 7.75, y: 9 };
    await worldTap(page, approachTable.x, approachTable.y, mobile);
    await page.waitForFunction(({ x, y }) => {
      const position = window.checkMovement().position;
      return Math.hypot(position.x - x, position.y - y) < .95;
    }, approachTable, { timeout: 12_000 });
    await page.waitForFunction(()=>{const state=window.checkMovement();return Math.hypot(state.position.x-state.server.x,state.position.y-state.server.y)<.06
      &&Math.hypot(state.server.vx||0,state.server.vy||0)<.12;},null,{timeout:4000});
    await page.locator('#room-rotate').click();
    await worldTap(page, tablePosition.x, tablePosition.y, mobile, -8 * (mobile ? 26 / 16 : 32 / 16));
    await page.waitForFunction(() => window.checkMovement().roomFurniture[0]?.rotation === 1, null, { timeout: 8000 });
    await page.waitForTimeout(180);
    const rotatedTable = (await inspect(page)).roomFurniture[0];
    const tableRotationScreenshot = path.join(output, `${mobile ? 'mobile' : 'desktop'}-table-rotated.png`);
    await page.screenshot({ path: tableRotationScreenshot });
    assert.equal(rotatedTable.rotation, 1, `${name}: rectangular table visibly keeps the quarter-turn orientation`);
    await page.waitForTimeout(300);
    await page.locator('#room-remove').click();
    await worldTap(page, tablePosition.x, tablePosition.y, mobile);
    await page.waitForFunction(() => window.checkMovement().roomFurniture.length === 0, null, { timeout: 8000 });
    await page.waitForTimeout(300);
    await page.locator('#room-category').selectOption('basicos');
    await page.locator('#room-kind').selectOption('bed');
    await page.waitForFunction(() => window.checkMovement().buildMode === 'place');
    const bedPosition={x:8,y:6.5};
    await worldTap(page,bedPosition.x,bedPosition.y,mobile);
    try{await page.waitForFunction(() => window.checkMovement().roomFurniture.some(item=>item.kind==='bed'),null,{timeout:8000});}
    catch(error){const state=await inspect(page);console.error('BED PLACEMENT DIAGNOSTIC',JSON.stringify({position:state.position,
      mode:state.buildMode,preview:state.roomPreview,furniture:state.roomFurniture,toast:await page.locator('#toast').innerText()}));
      await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-bed-placement-failure.png`)});throw error;}
    let bed=(await inspect(page)).roomFurniture.find(value=>value.kind==='bed');
    await page.locator('#room-place').click();
    await page.locator('#room-move').click();
    await worldTap(page,bed.x,bed.y,mobile,3);
    await page.waitForFunction(id=>window.checkMovement().roomMovingId===id,bed.id,{timeout:8000});
    const bedMovedTo={x:9,y:6.5};
    await worldTap(page,bedMovedTo.x,bedMovedTo.y,mobile);
    await page.waitForFunction(({x,y,id})=>{
      const state=window.checkMovement(),item=state.roomFurniture.find(value=>value.id===id);
      return item?.x===x&&item?.y===y&&!state.roomMovingId;
    },{...bedMovedTo,id:bed.id},{timeout:8000});
    bed=(await inspect(page)).roomFurniture.find(value=>value.id===bed.id);
    assert.deepEqual({x:bed.x,y:bed.y},bedMovedTo,`${name}: bed move is accepted and saved`);
    const bedMovedScreenshot=path.join(output,`${mobile?'mobile':'desktop'}-bed-moved.png`);
    await page.screenshot({path:bedMovedScreenshot});

    await page.locator('#room-move').click();
    await worldTap(page,bed.x,bed.y,mobile,3);
    await page.waitForFunction(({x,y})=>{
      const p=window.checkMovement().position;return Math.hypot(p.x-x,p.y-y)<.95;
    },{x:bed.x,y:bed.y},{timeout:12000});
    await page.locator('#room-rotate').click();
    const bedRotatePoint=await projectWorldPoint(page,bed.x,bed.y,-8*(mobile?26/16:32/16));
    await tapPoint(page,bedRotatePoint,mobile);
    await page.waitForFunction(id=>window.checkMovement().roomFurniture.find(value=>value.id===id)?.rotation===1,
      bed.id,{timeout:8000});
    bed=(await inspect(page)).roomFurniture.find(value=>value.id===bed.id);
    assert.equal(bed.rotation,1,`${name}: bed quarter-turn is accepted and saved`);
    await tapPoint(page,bedRotatePoint,mobile);
    await page.waitForFunction(id=>window.checkMovement().roomFurniture.find(value=>value.id===id)?.rotation===2,
      bed.id,{timeout:8000});
    bed=(await inspect(page)).roomFurniture.find(value=>value.id===bed.id);
    assert.equal(bed.rotation,2,`${name}: second bed turn reaches the near-headboard orientation`);
    const bedRotatedScreenshot=path.join(output,`${mobile?'mobile':'desktop'}-bed-rotated.png`);
    await page.screenshot({path:bedRotatedScreenshot});
    await page.locator('#room-rotate').click();

    const bedApproach={x:9,y:7.5};
    await worldTap(page,bedApproach.x,bedApproach.y,mobile);
    await page.waitForFunction(({x,y})=>Math.hypot(window.checkMovement().position.x-x,window.checkMovement().position.y-y)<.9,bedApproach,{timeout:12000});
    await page.waitForFunction(()=>{const state=window.checkMovement();return Math.hypot(state.position.x-state.server.x,state.position.y-state.server.y)<.06
      &&Math.hypot(state.server.vx||0,state.server.vy||0)<.12;},null,{timeout:4000});
    await worldTap(page,bed.x,bed.y,mobile);
    try { await page.waitForFunction(({x,y})=>{
      const state=window.checkMovement();
      return state.pose.lying&&state.furnitureUse?.id&&Math.hypot(state.rendered.x-x,state.rendered.y-y)<.08;
    },bed,{timeout:8000}); }
    catch(error){const state=await inspect(page);console.error('BED USE DIAGNOSTIC',JSON.stringify({position:state.position,server:state.server,
      buildMode:state.buildMode,furniture:state.roomFurniture,pose:state.pose,furnitureUse:state.furnitureUse,
      context:await page.locator('[data-action="context"]').getAttribute('aria-label'),toast:await page.locator('#toast').innerText()}));
      await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-bed-use-failure.png`)});throw error;}
    const bedLayers=(await inspect(page)).roomDepthAudit;
    const bedLayerOrder={
      bed:bedLayers.find(value=>value.type==='furniture'&&value.id===bed.id&&value.kind==='bed')?.renderOrder,
      sleeper:bedLayers.find(value=>value.type==='self')?.renderOrder,
      duvet:bedLayers.find(value=>value.type==='furniture-cover'&&value.id===bed.id)?.renderOrder,
    };
    assert.ok(bedLayerOrder.bed<bedLayerOrder.sleeper&&bedLayerOrder.sleeper<bedLayerOrder.duvet,
      `${name}: draw bed, sleeping avatar, then duvet: ${JSON.stringify(bedLayerOrder)}`);
    const sleepingBedScreenshot=path.join(output,`${mobile?'mobile':'desktop'}-sleeping-bed.png`);
    await page.screenshot({path:sleepingBedScreenshot});
    await worldTap(page,bed.x,bed.y,mobile);
    await page.waitForFunction(()=>!window.checkMovement().pose.lying&&!window.checkMovement().furnitureUse,null,{timeout:8000});
    await page.waitForTimeout(300);

    await page.locator('#room-category').selectOption('banheiras');
    await page.locator('#room-kind').selectOption('furniture.medieval-banheiras-01');
    await page.waitForFunction(() => window.checkMovement().buildMode === 'place');
    const showerPosition={x:7.5,y:9};
    await worldTap(page,showerPosition.x,showerPosition.y,mobile);
    await page.waitForFunction(() => window.checkMovement().roomFurniture.some(item=>item.kind==='shower'),null,{timeout:8000});
    const shower=(await inspect(page)).roomFurniture.find(value=>value.kind==='shower');
    assert.equal(shower.properties.catalogId,'furniture.medieval-banheiras-01',`${name}: the selected medieval tub is saved`);
    await page.waitForTimeout(300);
    await page.locator('#room-place').click();
    const showerApproach={x:7.5,y:8.3};
    await worldTap(page,showerApproach.x,showerApproach.y,mobile);
    await page.waitForFunction(({x,y})=>Math.hypot(window.checkMovement().position.x-x,window.checkMovement().position.y-y)<.9,showerApproach,{timeout:12000});
    await page.waitForFunction(()=>{const state=window.checkMovement();return Math.hypot(state.position.x-state.server.x,state.position.y-state.server.y)<.06
      &&Math.hypot(state.server.vx||0,state.server.vy||0)<.12;},null,{timeout:4000});
    await worldTap(page,shower.x,shower.y,mobile);
    await page.waitForFunction(()=>window.checkMovement().pose.showering&&window.checkMovement().furnitureUse?.id,
      null,{timeout:8000});
    const showerScreenshot=path.join(output,`${mobile?'mobile':'desktop'}-shower.png`);
    await page.screenshot({path:showerScreenshot});
    await worldTap(page,8.8,9,mobile);
    await page.waitForFunction(()=>!window.checkMovement().pose.showering&&!window.checkMovement().furnitureUse
      &&window.checkMovement().position.x>8.2,null,{timeout:12000});
    await page.locator('#room-remove').click();
    await worldTap(page,shower.x,shower.y,mobile);
    await page.waitForFunction(()=>window.checkMovement().roomFurniture.length===1,null,{timeout:8000});
    assert.deepEqual(errors, [], `${name}: no browser errors`);
    results.push({ name, viewport, mobile, furniturePlaced: placed, collision: { x: collision.position.x, y: collision.position.y },
      depthOrder:[depthBehind,depthInFront],
      moved: { id: furnitureId, ...item, durationMs: moved.roomFurnitureRender[0].durationMs, motionCaptured },
      invalidPreview: mobile ? null : true,
      rotation: rotatedState.roomFurniture[0]?.rotation, rotationAnimated, rotationNotice,
      rectangularTableRotation: rotatedTable.rotation, tableRotationScreenshot, removed: true, screenshot,
      furnitureAtlasLoaded:true,bed:{movedTo:bedMovedTo,rotation:bed.rotation,moveScreenshot:bedMovedScreenshot,
        rotationScreenshot:bedRotatedScreenshot,pose:'lying-under-covers',sleepingBedScreenshot},
      bedLayerOrder,
      showerPose:'water-animation-and-walk-out',showerRotation:1,showerScreenshot });
    await writeFile(path.join(output, 'result.json'), `${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await session.context.close(); for (const bridge of session.bridges) bridge.terminate();
  }
}

try {
  await storage.ready();
  preview = createPreviewServer({ gameDirectory: path.join(root, 'game'), stateDirectory, port: 0, allowedOrigin });
  const previewAddress = await preview.listen();
  bridge = createDevPreviewBridge(previewAddress, { port: pagePort });
  await bridge.listen();
  room = createPrototypeServer({ stateDirectory, allowedOrigin, port: 0, ambientCampfire: false });
  room.address = await room.listen();
  const desktopVisit=['desktop',{width:1440,height:900},false],mobileVisit=['mobile',{width:390,height:844},true];
  const visits=process.env.CLAREIRA_BROWSER_MOBILE_ONLY==='1'?[mobileVisit]
    :process.env.CLAREIRA_BROWSER_DESKTOP_ONLY==='1'?[desktopVisit]:[desktopVisit,mobileVisit];
  for(const [name,viewport,mobile] of visits){
    const username=`MobQA${name}${Date.now()%1_000_000_000}`;
    const user=await storage.accounts.register({username,password:'senha-segura-de-teste'});
    await locations.savePlayerLocation(user.profile.id,{location:'room',dimensionId:'surface',x:7,y:9,
      roomKey:`account:${user.profile.id}`,roomOwnerName:username,worldVersion:WORLD_COORDINATE_VERSION});
    await runVisit(name,viewport,mobile,user);
  }
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  if (room) await room.close();
  if (bridge) await bridge.close();
  if (preview) await preview.close();
  await storage.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
