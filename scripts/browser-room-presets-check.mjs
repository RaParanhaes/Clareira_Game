// Test runtime paths can be overridden: CLAREIRA_PLAYWRIGHT (module), CLAREIRA_CHROMIUM (binary).
const { chromium } = await import(process.env.CLAREIRA_PLAYWRIGHT || '/opt/clareira-browser/node_modules/playwright-core/index.mjs');
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
const output = path.resolve(process.argv[2] || 'logs/room-presets-browser');
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-furniture-browser-'));
await mkdir(output, { recursive: true });
// Temporary servers use ports outside the real preview (CLAREIRA_PAGE_PORT, default 8099).
const pagePort = Number(process.env.CLAREIRA_PAGE_PORT || 8099);
const allowedOrigin = `http://127.0.0.1:${pagePort}`;
const storage = createStorageAdapter({ directory: stateDirectory });
const locations = createJsonPlayerLocationStore(stateDirectory);
const browser = await chromium.launch({ executablePath: process.env.CLAREIRA_CHROMIUM || '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
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

// The build options start collapsed; open them once before using their controls.
async function openBuildOptions(page) {
  if (!(await page.locator('#room-build-options').isVisible())) await page.locator('#room-build-toggle').click();
}

async function runVisit(name, viewport, mobile, user) {
  const session = await openPage(user, viewport, mobile), { page } = session;
  try {
    const before = await inspect(page);
    assert.equal(before.roomCanEdit, true, `${name}: owner can edit the room`);
    const presets = before.roomFurniture.filter(item => item.preset);
    assert.ok(presets.length >= 4, `${name}: predefined pieces arrive with the room (${presets.length})`);
    assert.equal(before.roomFurniture.filter(item => !item.preset).length, 0, `${name}: the room starts with no player-placed pieces`);

    await openBuildOptions(page);
    await page.waitForFunction(() => /Móveis extras: 0 de 12/.test(document.querySelector('#room-build-count')?.textContent || ''),
      null, { timeout: 8000 });
    await page.screenshot({ path: path.join(output, `${name}-build-panel.png`) });

    const bed = presets.find(item => item.kind === 'bed');
    await worldTap(page, bed.x, bed.y, mobile);
    await page.waitForFunction(() => {
      const card = document.querySelector('#room-object-card');
      return card && !card.hidden;
    }, null, { timeout: 8000 });
    const actions = await page.locator('#room-object-actions button').allInnerTexts();
    assert.ok(!actions.includes('Retirar'), `${name}: predefined bed has no remove action (${actions.join(', ')})`);
    assert.ok(actions.includes('Girar'), `${name}: predefined bed can still be turned (${actions.join(', ')})`);
    const description = await page.locator('#room-object-description').innerText();
    assert.match(description, /não pode ser retirada/, `${name}: the card explains why the piece stays (${description})`);
    await page.screenshot({ path: path.join(output, `${name}-predefined-card.png`) });

    await openBuildOptions(page);
    await page.locator('#room-remove').click();
    await worldTap(page, bed.x, bed.y, mobile);
    await page.waitForTimeout(800);
    const afterRemove = await inspect(page);
    assert.ok(afterRemove.roomFurniture.some(item => item.id === bed.id && item.preset), `${name}: remove mode keeps the predefined bed`);
    await page.locator('#room-remove').click();

    await openBuildOptions(page);
    await page.locator('#room-rotate').click();
    await worldTap(page, bed.x, bed.y, mobile);
    await page.waitForFunction(id => window.checkMovement().roomFurniture.some(item => item.id === id && item.rotation === 1),
      bed.id, { timeout: 8000 });

    assert.deepEqual(errors, [], `${name}: no page errors`);
    results.push({ name, presetCount: presets.length, bedRotated: true, bedKeptAfterRemove: true });
  } finally {
    await session.context.close(); for (const bridgeSocket of session.bridges) bridgeSocket.terminate();
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
  const visits = [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]];
  for (const [name, viewport, mobile] of visits) {
    const username = `QA${name.slice(0, 4)}${Date.now() % 1_000_000}`;
    const user = await storage.accounts.register({ username, password: 'senha-segura-de-teste' });
    await locations.savePlayerLocation(user.profile.id, { location: 'room', dimensionId: 'surface', x: 7, y: 9,
      roomKey: `account:${user.profile.id}`, roomOwnerName: username, worldVersion: WORLD_COORDINATE_VERSION });
    await runVisit(name, viewport, mobile, user);
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
