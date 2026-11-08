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
import { surfaceHeight, HEIGHT_PIXELS } from '../game/elevation.mjs';
import { VILLAGE_BUILDINGS } from '../game/village-buildings.mjs';
import { LODGING_OFFER_BY_KEY, lobbyRoomKey, lodgingRoomKey } from '../game/lodging-catalog.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'logs/place-panels-browser');
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
      if (requested.pathname === '/dev/staff/capabilities') return route.fulfill({json:{capabilities:{}}});
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
  await page.locator('#scene-loading').waitFor({state:'hidden',timeout:120000});
  await page.waitForSelector('.shell.is-authenticated', { timeout: 20_000 }).catch(async error => { await page.screenshot({path:path.join(output,'auth-failure.png')}); console.error(JSON.stringify({errors,loading:await page.locator('#loading-message').textContent().catch(()=>null)})); throw error; });
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
async function walkToPoint(page, point, mobile) {
  const state = await inspect(page), box = await page.locator('#world').boundingBox();
  const p = state.projection;
  const x = box.x + p.centerX + ((point.x - state.camera.x) - (point.y - state.camera.y)) * p.tileX;
  const layout = getRoomLayout(state.roomKind, state.roomBuildingId);
  const y = box.y + p.centerY + ((point.x - state.camera.x) + (point.y - state.camera.y)) * p.tileY
    - surfaceHeight(point.x, point.y, state.location, layout) * HEIGHT_PIXELS * p.spriteScale;
  assert.ok(x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height, 'activation floor is visible');
  const hit = await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return {tag:el?.tagName,id:el?.id,className:el?.className};},{x,y});
  console.log(JSON.stringify({navigationTarget:{x,y,point,hit}}));
  if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await page.waitForFunction(({ x, y }) => {
    const state = window.roomLayoutAudit();
    return Math.hypot(state.position.x - x, state.position.y - y) < .3 && !state.walkTarget;
  }, point, { timeout: 12000 });
}

async function checkPanel(user, size, viewport, mobile) {
  const { page, context, bridges } = await openPage(user, viewport);
  try {
    const initial = await inspect(page);
    page.on('worker', worker => worker.evaluate(() => { self.addEventListener('error', event => console.error('PATH_WORKER_ERROR', event.message)); }).catch(()=>{}));
    assert.equal(await page.locator('#lodging-dialog').evaluate(dialog => dialog.open), false, 'entering does not open a panel');
    assert.ok(initial.placeServices.length);
    for (const point of initial.placeServices) {
      await walkToPoint(page, point, mobile);
      await page.waitForFunction(() => document.querySelector('[data-action="context"]').getAttribute('aria-label')?.includes('Conversar'));
      await page.screenshot({ path: path.join(output, `${size}-${user.buildingId || 'arrival'}-${point.id}-interior.png`) });
      const beforeOpen = await inspect(page);
      if (mobile) await page.locator('[data-action="context"]').tap();
      else { await page.locator('#world').focus(); await page.keyboard.press('e'); }
      await page.waitForSelector('#lodging-dialog[open]');
      const bounds = await page.locator('#lodging-dialog').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width
        && bounds.y + bounds.height <= viewport.height, 'panel fits the viewport');
      const sections = point.sections.filter(section => section !== 'government' && section !== 'keys'); // fixture accounts have neither government authority nor cabin ownership
      assert.deepEqual(await page.locator('[data-service-section]').evaluateAll(buttons => buttons.map(button => button.dataset.serviceSection)), sections);
      assert.equal((await inspect(page)).panel.route, 'home');
      assert.deepEqual((await inspect(page)).movementKeys, [], 'opening clears held input');
      if (user.buildingId && user.buildingId !== 'arrival') {
        assert.equal(await page.locator('[data-service-section="trade"], [data-service-section="tools"], [data-service-section="orders"]').count(), 0);
      }
      await page.screenshot({ path: path.join(output, `${size}-${user.buildingId || 'arrival'}-${point.id}-home.png`) });
      for (const section of sections) {
        await page.locator(`[data-service-section="${section}"]`).click();
        assert.equal((await inspect(page)).panel.route, section);
        assert.equal(await page.locator('#lodging-back').isVisible(), true);
        if (section === 'trade') {
          const input = page.locator('[data-quantity-item="wood"]');
          await input.fill('0');
          await page.locator('[data-service-action="lodgeSell"][data-item="wood"]').click();
          assert.equal((await inspect(page)).inventory.wood, 5, 'invalid quantity cannot sell a different amount');
          await input.fill('2');
          await page.waitForTimeout(350);
          assert.equal(await input.inputValue(), '2', 'snapshots preserve entered quantities');
          await page.locator('[data-service-action="lodgeSell"][data-item="wood"]').click();
          assert.equal((await inspect(page)).inventory.wood, 5, 'review does not mutate inventory');
          await page.locator('[data-service-action="__confirm"]').click();
          await page.waitForFunction(() => window.roomLayoutAudit().inventory.wood === 3);
          await page.waitForFunction(() => document.querySelector('#lodging-status').textContent.startsWith('Venda concluída'));
        }
        if (section === 'rooms' || section === 'properties') {
          const offeredBuildings = await page.locator('[data-building-id]').evaluateAll(buttons => buttons.map(button => button.dataset.buildingId));
          assert.ok(offeredBuildings.every(id => id === user.buildingId), 'offers belong to this building');
        }
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('w');
        await page.waitForTimeout(300);
        const whileOpen = await inspect(page);
        assert.ok(Math.hypot(whileOpen.position.x - beforeOpen.position.x, whileOpen.position.y - beforeOpen.position.y) < .15,
          'panel navigation never moves the avatar');
        for (let tab = 0; tab < 8; tab++) await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.id), 'lodging-dialog', 'focus stays in the panel');
        await page.screenshot({ path: path.join(output, `${size}-${user.buildingId || 'arrival'}-${section}.png`) });
        if (mobile) await page.locator('#lodging-back').tap(); else await page.keyboard.press('Escape');
        assert.equal((await inspect(page)).panel.route, 'home', 'Back and Escape return one level');
      }
      if (mobile) await page.locator('#lodging-close').tap(); else await page.keyboard.press('Escape');
      await page.waitForSelector('#lodging-dialog[open]', { state: 'detached' });
    }
    await page.locator('#world').focus(); await page.keyboard.press('i');
    await page.waitForSelector('#inventory-dialog[open]');
    await page.keyboard.press('Escape');
    assert.equal((await inspect(page)).panel.id, null);
    if (mobile && await page.locator('.mobile-menu-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('.mobile-menu-toggle').tap();
    await page.locator('#settings-toggle').click();
    await page.locator('#appearance-open').click();
    await page.waitForSelector('#appearance-dialog[open]');
    const beforeAppearance = await inspect(page);
    await page.keyboard.press('w'); await page.waitForTimeout(250);
    assert.ok(Math.hypot((await inspect(page)).position.x - beforeAppearance.position.x,
      (await inspect(page)).position.y - beforeAppearance.position.y) < .15);
    await page.keyboard.press('Escape');
    assert.equal((await inspect(page)).panel.id, null);
    if (user.buildingId === 'lodging-rill-guesthouse' && !mobile) {
      await page.locator('#world').focus(); await page.keyboard.press('e');
      await page.locator('[data-service-section="rooms"]').click();
      await page.locator('[data-service-action="lodgeClaim"]').click();
      await page.locator('[data-service-action="__confirm"]').click();
      await page.waitForFunction(() => window.roomLayoutAudit().roomKind === 'lodging');
      assert.equal((await inspect(page)).panel.id, null, 'reservation changes the room and closes the previous panel');
    }
    results.push({ size, place: user.buildingId || 'arrival', points: initial.placeServices.map(point => point.id), passed: true });
    console.log(`${size} ${user.buildingId || 'arrival'} passed`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `failure-${size}-${user.buildingId || 'arrival'}.png`) });
    console.error(JSON.stringify({ error: error.message, toast: await page.evaluate(()=>document.querySelector('.toast')?.textContent), state: await inspect(page), errors }, null, 2));
    throw error;
  } finally { await context.close(); for (const socket of bridges) socket.terminate(); }
}

async function checkGuestLifecycle() {
  const guest = await storage.accounts.guest();
  const buildingId = 'lodging-ember-hotel';
  const layout = getRoomLayout('lobby', buildingId);
  const point = { x: 8, y: layout.counter.bottom + .65 };
  await locations.savePlayerLocation(guest.profile.id, { location: 'room', dimensionId: 'surface',
    ...point, roomKey: `lobby:${buildingId}`, worldVersion: WORLD_COORDINATE_VERSION });
  const { page, context, bridges } = await openPage({ ...guest, buildingId, username: 'GuestLifecycle' });
  try {
    assert.equal((await inspect(page)).panel.id, null, 'restoring at the counter never opens a panel');
    await page.locator('#world').focus(); await page.keyboard.press('e');
    await page.locator('[data-service-section="rooms"]').click();
    assert.equal(await page.locator('[data-service-action="lodgeClaim"]').isDisabled(), true);
    assert.match(await page.locator('#lodging-note').textContent(), /conta/);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'world');
    await page.keyboard.press('i'); await page.waitForSelector('#inventory-dialog[open]');
    // Exercise a controller switch directly; native inertness normally keeps
    // the underlying appearance button inaccessible until the bag closes.
    await page.evaluate(() => document.querySelector('#appearance-open').click());
    assert.equal(await page.locator('dialog[open]').count(), 1);
    assert.equal((await inspect(page)).panel.id, 'appearance');
    await page.keyboard.press('Escape');
    await page.locator('#world').focus(); await page.keyboard.press('e');
    await page.waitForSelector('#lodging-dialog[open]');
    for (const socket of bridges) socket.close();
    await page.waitForFunction(() => window.roomLayoutAudit().panel.id === null);
    await page.waitForFunction(() => window.roomLayoutAudit().readiness.connected
      && window.roomLayoutAudit().readiness.sceneReady, null, { timeout: 15000 });
    assert.equal((await inspect(page)).panel.id, null, 'reconnection never reopens the old panel');
    results.push({ size: 'desktop', place: 'guest-lifecycle', passed: true });
    console.log('guest permissions, exclusive modals and reconnect passed');
  } finally { await context.close(); for (const socket of bridges) socket.terminate(); }
}

try {
  await storage.ready();
  preview = createPreviewServer({ gameDirectory: path.join(root, 'game'), stateDirectory, port: pagePort, allowedOrigin });
  // Real service-worker requests bypass Playwright routing; mirror the public /dev mount at the HTTP boundary.
  preview.server.prependListener('request', request => { request.url = request.url.replace(/^\/dev(?=\/)/, '') || '/'; });
  await preview.listen();
  room = createPrototypeServer({ stateDirectory, allowedOrigin, port: 0, ambientCampfire: false });
  room.address = await room.listen();
  const sizes = [
    ['desktop', { width: 1440, height: 900 }, false, [null, ...VILLAGE_BUILDINGS.filter(building => building.kind !== 'cabin').map(building => building.id)]],
    ['mobile', { width: 390, height: 844 }, true, [null, 'lodging-ember-hotel', 'lodging-rill-guesthouse']],
    ['small', { width: 320, height: 640 }, true, ['lodging-ember-hotel']],
  ];
  for (const [size, viewport, mobile, places] of sizes) {
    if (process.env.CHECK_SIZE && process.env.CHECK_SIZE !== size) continue;
    for (const [index, buildingId] of places.entries()) {
      if (process.env.CHECK_PLACE && process.env.CHECK_PLACE !== (buildingId || 'arrival')) continue;
      const user = await createAccount(`Panel${size}${index}`, { buildingId });
      await checkPanel(user, size, viewport, mobile);
    }
  }
  if (process.env.CHECK_GUEST) await checkGuestLifecycle();
  assert.deepEqual(errors, [], 'no runtime or HTTP errors');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(output, 'audit.json'), `${JSON.stringify({ results, errors }, null, 2)}\n`));
} finally {
  await browser.close(); if (room) await room.close(); if (preview) await preview.close(); await storage.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
