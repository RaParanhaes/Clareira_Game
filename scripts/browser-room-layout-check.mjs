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
const output = path.resolve(process.argv[2] || 'logs/room-layout-audit-20261018');
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
  return { context, page };
}

async function capture(user, filename, viewport) {
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
  await page.screenshot({ path: path.join(output, filename), fullPage: false });
  await context.close();
  return { username: user.username, location: state.location, roomKind: state.roomKind,
    roomBuildingId: state.roomBuildingId, position: state.position, screenshot: filename };
}

try {
  await storage.ready();
  const defaultVisitor = await createAccount('Jogador', { location: 'clearing' });
  const neighbor = await createAccount('Visitante', { location: 'clearing' });
  const hotelLobby = await createAccount('LobbyHotel', { buildingId: 'lodging-ember-hotel' });
  const hotelRoom = await createAccount('HotelQuarto', { buildingId: 'lodging-ember-hotel', mode: 'rent' });
  const hotelApartment = await createAccount('HotelSuite', { buildingId: 'lodging-ember-hotel', mode: 'owned' });
  const innRoom = await createAccount('PineInn', { buildingId: 'lodging-pine-inn', mode: 'rent' });
  const guesthouseRoom = await createAccount('RillStay', { buildingId: 'lodging-rill-guesthouse', mode: 'rent' });
  const cedarRoom = await createAccount('CedarRoom', { buildingId: 'cabin-cedar-one', mode: 'owned' });
  const fernRoom = await createAccount('FernRoom', { buildingId: 'cabin-cedar-two', mode: 'owned' });
  const lookoutRoom = await createAccount('LookoutRoom', { buildingId: 'cabin-cedar-three', mode: 'owned' });
  const mobileGuesthouseRoom = await createAccount('RillStayMobile', { buildingId: 'lodging-rill-guesthouse', mode: 'rent' });

  preview = createPreviewServer({ gameDirectory: path.join(root, 'game'), stateDirectory, port: pagePort, allowedOrigin });
  await preview.listen();
  room = createPrototypeServer({ stateDirectory, allowedOrigin, port: 0, ambientCampfire: false });
  room.address = await room.listen();

  let captures=[];
  if(process.env.ROOM_ENTRANCE_ONLY!=='1'){
    const visitors = await Promise.all([openPage(defaultVisitor), openPage(neighbor)]);
    await visitors[0].page.waitForTimeout(1200);
    const exteriorState = await visitors[0].page.evaluate(() => window.roomLayoutAudit());
    await visitors[0].page.screenshot({ path: path.join(output, 'hotel-exterior-scale.png') });
    await Promise.all(visitors.map(({ context }) => context.close()));
    captures = [{ username: 'Visitante', location: exteriorState.location,
      position: exteriorState.position, screenshot: 'hotel-exterior-scale.png' }];
    captures.push(await capture(hotelLobby, 'hotel-reception.png'));
    captures.push(await capture(hotelRoom, 'hotel-single-room.png'));
    captures.push(await capture(hotelApartment, 'hotel-apartment.png'));
    captures.push(await capture(innRoom, 'pine-inn-room.png'));
    captures.push(await capture(guesthouseRoom, 'rill-guesthouse-room.png'));
    captures.push(await capture(cedarRoom, 'cedar-cabin-room.png'));
    captures.push(await capture(fernRoom, 'fern-cabin-room.png'));
    captures.push(await capture(lookoutRoom, 'lookout-cabin-room.png'));
    captures.push(await capture(mobileGuesthouseRoom, 'rill-guesthouse-room-mobile.png', { width: 390, height: 844 }));
  }
  const doorwayAccount=await createAccount('LobbyWalkout',{buildingId:'lodging-ember-hotel'});
  const doorwaySession=await openPage(doorwayAccount);
  const doorwayPage=doorwaySession.page;
  const entranceStart=await doorwayPage.evaluate(()=>window.roomLayoutAudit());
  await doorwayPage.keyboard.down('ArrowUp');await doorwayPage.keyboard.down('ArrowRight');
  await doorwayPage.waitForTimeout(1_100);
  await doorwayPage.keyboard.up('ArrowUp');await doorwayPage.keyboard.up('ArrowRight');
  const insidePosition=await doorwayPage.evaluate(()=>window.roomLayoutAudit());
  assert.equal(insidePosition.location,'room','walking from the exterior landing enters the room');
  assert.ok(insidePosition.position.y<entranceStart.position.y-.35,
    `the player walks inward through the doorway (${entranceStart.position.y} -> ${insidePosition.position.y}; keys=${insidePosition.movementKeys})`);
  await doorwayPage.keyboard.down('ArrowDown');await doorwayPage.keyboard.down('ArrowLeft');
  await doorwayPage.waitForFunction(()=>window.roomLayoutAudit()?.location==='clearing',null,{timeout:8_000});
  await doorwayPage.keyboard.up('ArrowDown');await doorwayPage.keyboard.up('ArrowLeft');
  await doorwayPage.waitForFunction(()=>{
    const state=window.roomLayoutAudit();return state?.location==='clearing'&&state.readiness?.sceneReady;
  },null,{timeout:30_000});
  const exitPosition=await doorwayPage.evaluate(()=>window.roomLayoutAudit());
  assert.equal(exitPosition.location,'clearing','walking back to the exterior tile exits without pressing E');
  await doorwayPage.screenshot({path:path.join(output,'hotel-reception-walkout.png')});
  captures.push({username:doorwayAccount.username,location:exitPosition.location,entranceStart:entranceStart.position,
    inside:insidePosition.position,afterWalkout:exitPosition.position,screenshot:'hotel-reception-walkout.png'});
  await doorwaySession.context.close();
  assert.deepEqual(errors, [], 'browser loads the local game without runtime or HTTP errors');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(output, 'audit.json'),
    `${JSON.stringify({ captures, errors }, null, 2)}\n`));
  process.stdout.write(`${JSON.stringify({ captures, errors }, null, 2)}\n`);
} finally {
  await browser.close();
  if (room) await room.close();
  if (preview) await preview.close();
  await storage.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
