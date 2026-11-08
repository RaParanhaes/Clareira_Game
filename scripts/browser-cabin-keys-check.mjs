import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { saveAccountProgress } from './account-store.mjs';
import { createStorageAdapter } from '../database/storage.mjs';
import { getRoomLayout, WORLD_COORDINATE_VERSION } from '../game/world.mjs';
import { VILLAGE_BUILDINGS } from '../game/village-buildings.mjs';
import { LODGING_OFFER_BY_KEY, lobbyRoomKey, lodgingRoomKey } from '../game/lodging-catalog.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'logs/cabin-keys-browser');
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
let preview, room;
const errors = [];

async function createAccount(username, { location = 'room', buildingId, mode = null } = {}) {
  const created = await storage.accounts.register({ username, password: 'senha-segura-de-teste' });
  const profileId = created.profile.id;
  await storage.creditWallet(profileId, 10000);
  await saveAccountProgress(stateDirectory, profileId, { wood: 5 });
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
  const bridges = [];
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  context.setDefaultTimeout(30_000);
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
  await page.route('**/dev/**', async route => {
    try {
      const requested = new URL(route.request().url());
      if (requested.pathname === '/dev/update-version') return route.fulfill({ json: { version: 'cabin-browser-fixture' } });
      const targetPath = requested.pathname.replace(/^\/dev(?=\/)/, '') || '/';
      const response = await route.fetch({ url: `${allowedOrigin}${targetPath}${requested.search}` });
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
    bridges.push(upstream);
    const queued = [];
    socket.onMessage(message => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else queued.push(message);
    });
    upstream.on('open', () => queued.forEach(message => upstream.send(message)));
    upstream.on('message', message => { try { socket.send(message.toString()); } catch {} });
    upstream.on('close', () => { try { socket.close(); } catch {} });
    upstream.on('error', error => errors.push({ username: user.username, websocket: error.message }));
    socket.onClose(() => upstream.close());
  });
  await page.goto(`${allowedOrigin}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell.is-authenticated', { timeout: 20_000 });
  await page.evaluate(async () => {
    const module = await import('/dev/main.js');
    window.roomLayoutAudit = module.inspectMovement;
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
  return { context, page, bridges };
}

const results = [];
const inspect = page => page.evaluate(() => window.roomLayoutAudit());
async function closeSession(session) {
  if (!session) return;
  await session.context.close(); for (const socket of session.bridges) socket.terminate();
}
async function walk(page, target, mobile) {
  await page.waitForFunction(() => { const r = window.roomLayoutAudit().readiness; return r.sceneReady && r.predictionReady && !r.loading; });
  const state = await inspect(page), box = await page.locator('#world').boundingBox();
  const { height, pixels } = await page.evaluate(async point => {
    const { surfaceHeight, HEIGHT_PIXELS } = await import('/dev/elevation.mjs');
    return { height: surfaceHeight(point.x, point.y, 'clearing'), pixels: HEIGHT_PIXELS };
  }, target);
  const p = state.projection;
  const x = box.x + p.centerX + ((target.x - state.camera.x) - (target.y - state.camera.y)) * p.tileX;
  const y = box.y + p.centerY + ((target.x - state.camera.x) + (target.y - state.camera.y)) * p.tileY - height * pixels * p.spriteScale;
  assert.ok(x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height, 'door/sign floor is visible');
  const floorVisible = await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.id === 'world', {x,y});
  if (mobile && !floorVisible) {
    // On narrow screens the sidebar covers this floor point; use the real direction controls.
    const cdp = await page.context().newCDPSession(page);
    try {
      for (let step = 0; step < 24; step++) {
        const current = (await inspect(page)).position;
        const dx = target.x-current.x, dy = target.y-current.y;
        if (Math.hypot(dx,dy) < .3) break;
        const sx = (dx-dy)*p.tileX, sy = (dx+dy)*p.tileY;
        const direction = Math.abs(sx)>Math.abs(sy) ? (sx<0?'-1,0':'1,0') : (sy<0?'0,-1':'0,1');
        const control = await page.locator(`[data-move="${direction}"]`).boundingBox();
        await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:control.x+control.width/2,y:control.y+control.height/2}]});
        await page.waitForTimeout(100);
        await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(100);
      }
    } finally { await cdp.detach(); }
  } else if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await page.waitForFunction(point => { const s = window.roomLayoutAudit(); return Math.hypot(s.position.x - point.x, s.position.y - point.y) < .32 && !s.walkTarget; }, target, { timeout: 15000 });
}
async function use(page, mobile) {
  await page.waitForFunction(() => { const r = window.roomLayoutAudit().readiness; return r.sceneReady && r.predictionReady && !r.loading; });
  await page.waitForTimeout(300);
  if (mobile) await page.locator('[data-action="context"]').tap();
  else { await page.locator('#world').focus(); await page.keyboard.press('e'); }
}

async function checkCabin(building, owner, friend, name, viewport, alreadyOwned = false) {
  const mobile = viewport.width < 600;
  let own, visit;
  try {
    own = await openPage(owner, viewport);
    const page = own.page;
    assert.equal((await inspect(page)).location, 'clearing', 'the cabin never starts in a public lobby');
    assert.equal((await inspect(page)).panel.id, null);
    const door = { x: building.door.x, y: building.door.y + .6 };
    if (!alreadyOwned) {
      await use(page, mobile);
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('trancada'));
      assert.equal((await inspect(page)).location, 'clearing'); assert.equal((await inspect(page)).panel.id, null);
    }
    const sign = (await inspect(page)).placeServices.find(point => point.placeId === building.id);
    assert.ok(sign); await walk(page, sign, mobile); await use(page, mobile);
    await page.waitForSelector('#lodging-dialog[open]');
    const box = await page.locator('#lodging-dialog').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    await page.locator('[data-service-section="properties"]').click();
    if (!alreadyOwned) {
      await page.locator('[data-service-action="lodgeClaim"]').click();
      await page.waitForFunction(id => window.roomLayoutAudit().cabinKeys.some(key => key.buildingId === id && key.isOwner), building.id);
      assert.equal((await inspect(page)).location, 'clearing', 'buying delivers a key without entering');
    }
    await page.screenshot({ path: path.join(output, `${name}-${building.id}-outside-purchase.png`) });
    await page.locator('#lodging-back').click();
    await page.locator('[data-service-section="keys"]').click();
    await page.locator('#cabin-key-recipient').fill(friend.username);
    await page.locator('[data-service-action="cabinGrantKey"]').click();
    await page.waitForFunction(id => window.roomLayoutAudit().issuedCabinKeys.some(key => key.profileId === id), friend.profileId);
    await page.screenshot({ path: path.join(output, `${name}-${building.id}-keys.png`) });
    await page.locator('#lodging-close').click();
    await walk(page, door, mobile); await use(page, mobile);
    await page.waitForFunction(() => window.roomLayoutAudit().roomKind === 'lodging');
    assert.equal((await inspect(page)).roomCanEdit, true);
    assert.deepEqual((await inspect(page)).placeServices, [], 'the private interior has no service counter');
    await page.screenshot({ path: path.join(output, `${name}-${building.id}-private-interior.png`) });
    await use(page, mobile);
    await page.waitForFunction(() => window.roomLayoutAudit().location === 'clearing');
    await walk(page, sign, mobile); await use(page, mobile);
    await page.locator('[data-service-section="keys"]').click();
    console.log(name, building.id, 'opening visitor');
    visit = await openPage(friend, viewport);
    console.log(name, building.id, 'visitor ready', (await inspect(visit.page)).position);
    await use(visit.page, mobile);
    await visit.page.waitForFunction(() => window.roomLayoutAudit().roomKind === 'lodging');
    const visitor = await inspect(visit.page);
    assert.equal(visitor.roomCanEdit, false); assert.equal(visitor.issuedCabinKeys.length, 0);
    assert.ok(visitor.cabinKeys.some(key => !key.isOwner));
    if (name === 'desktop' && building.id === 'cabin-cedar-one') {
      await closeSession(visit); visit = null;
      await new Promise(resolve => setTimeout(resolve, 150));
      console.log(name, building.id, 'opening visitor');
    visit = await openPage(friend, viewport);
      assert.equal((await inspect(visit.page)).roomKind, 'lodging', 'a shared key restores the private visit');
      assert.equal((await inspect(visit.page)).panel.id, null);
    }
    console.log(name, building.id, 'revoking');
    await page.locator(`[data-service-action="cabinRevokeKey"][data-profile-id="${friend.profileId}"]`).click();
    await visit.page.waitForFunction(() => window.roomLayoutAudit().location === 'clearing' && window.roomLayoutAudit().cabinKeys.length === 0);
    await use(visit.page, mobile);
    await visit.page.waitForFunction(() => document.querySelector('#toast').textContent.includes('trancada'));
    assert.equal((await inspect(visit.page)).location, 'clearing');
    await visit.page.screenshot({ path: path.join(output, `${name}-${building.id}-revoked-outside.png`) });
    await page.locator('#lodging-close').click();
    results.push({ name, buildingId: building.id, passed: true }); console.log(`${name} ${building.id} passed`);
  } catch (error) {
    if (own) { await own.page.screenshot({ path: path.join(output, `failure-${name}-${building.id}.png`) });
      console.error(JSON.stringify({ error: error.message, owner: await inspect(own.page).catch(() => null), visitor: visit ? await inspect(visit.page).catch(() => null) : null, errors }, null, 2)); }
    throw error;
  } finally { await closeSession(visit); await closeSession(own); }
}

try {
  await storage.ready();
  preview = createPreviewServer({ gameDirectory: path.join(root, 'game'), stateDirectory, port: pagePort, allowedOrigin }); await preview.listen();
  room = createPrototypeServer({ stateDirectory, allowedOrigin, port: 0, ambientCampfire: false }); room.address = await room.listen();
  const cases = [];
  for (const [index, building] of VILLAGE_BUILDINGS.filter(building => building.kind === 'cabin').entries()) {
    const owner = await createAccount(`CabOwn${index}`, { location: 'clearing', buildingId: building.id });
    const friend = await createAccount(`CabGuest${index}`, { location: 'clearing', buildingId: building.id });
    for (const user of [owner, friend]) await locations.savePlayerLocation(user.profileId, { location: 'clearing', dimensionId: 'surface',
      x: building.door.x, y: building.door.y + .6, worldVersion: WORLD_COORDINATE_VERSION });
    await checkCabin(building, owner, friend, 'desktop', { width: 1440, height: 900 });
    cases.push({ building, owner, friend });
  }
  const first = cases[0], second = cases[1];
  await checkCabin(first.building, first.owner, first.friend, 'mobile', { width: 390, height: 844 }, true);
  await checkCabin(second.building, second.owner, second.friend, 'small', { width: 320, height: 640 }, true);
  assert.deepEqual(errors, []);
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(output, 'audit.json'), `${JSON.stringify({ results, errors }, null, 2)}\n`));
} finally {
  await browser.close(); if (room) await room.close(); if (preview) await preview.close(); await storage.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
