// Captura de tela de menus e HUD (desktop e celular), com servidor de preview local e contas de teste temporárias. Use: node scripts/ui-capture.mjs <raiz> <saida> <etiqueta>
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
const { chromium } = await import(process.env.CLAREIRA_PLAYWRIGHT || 'playwright-core');

const [, , repoArg = '.', outArg = 'logs/ui-capture', tag = 'run'] = process.argv;
const root = path.resolve(repoArg);
// Uso: CLAREIRA_PLAYWRIGHT=/caminho/playwright-core/index.mjs CLAREIRA_CHROME=/caminho/chrome node scripts/ui-capture.mjs . logs/ui-capture <etiqueta>
const { saveAccountProgress } = await import(path.join(root, 'scripts/account-store.mjs'));
const { createStorageAdapter } = await import(path.join(root, 'database/storage.mjs'));
const { WORLD_COORDINATE_VERSION } = await import(path.join(root, 'game/world.mjs'));
const { VILLAGE_BUILDINGS } = await import(path.join(root, 'game/village-buildings.mjs'));
const { createJsonPlayerLocationStore } = await import(path.join(root, 'scripts/player-location-store.mjs'));
const { createPreviewServer } = await import(path.join(root, 'scripts/dev-preview-page.mjs'));
const { createPrototypeServer } = await import(path.join(root, 'scripts/prototype-server.mjs'));

const output = path.resolve(outArg);
await mkdir(output, { recursive: true });
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-ui-capture-'));
const portProbe = http.createServer();
await new Promise((res, rej) => { portProbe.once('error', rej); portProbe.listen(0, '127.0.0.1', res); });
const pagePort = portProbe.address().port;
await new Promise(res => portProbe.close(res));
const allowedOrigin = `http://127.0.0.1:${pagePort}`;
const storage = createStorageAdapter({ directory: stateDirectory });
const locations = createJsonPlayerLocationStore(stateDirectory);
const browser = await chromium.launch({
  executablePath: process.env.CLAREIRA_CHROME || undefined,
  headless: true, args: ['--no-sandbox'],
});
let preview, room;
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createAccount(username) {
  const created = await storage.accounts.register({ username, password: 'senha-segura-de-teste' });
  const profileId = created.profile.id;
  await storage.creditWallet(profileId, 10000);
  await saveAccountProgress(stateDirectory, profileId, { wood: 5 });
  const hotel = VILLAGE_BUILDINGS.find(item => item.id === 'lodging-ember-hotel');
  await locations.savePlayerLocation(profileId, {
    location: 'clearing', dimensionId: 'surface', x: hotel.door.x - 1.2, y: hotel.door.y + 1.2,
    roomKey: '', roomOwnerName: username, worldVersion: WORLD_COORDINATE_VERSION,
  });
  return { username, token: created.token };
}

async function openPage(user, viewport, mobile) {
  const bridges = [];
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push({ tag, message: e.message }));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource: net::ERR_')) errors.push({ tag, console: m.text() }); });
  await context.addCookies([{ name: 'clareira_session', value: user.token, url: `${allowedOrigin}/dev/`, httpOnly: true, sameSite: 'Strict' }]);
  await page.route('**/dev/**', async route => {
    try {
      const requested = new URL(route.request().url());
      if (requested.pathname === '/dev/staff/capabilities') return route.fulfill({ json: { capabilities: {} } });
      const targetPath = requested.pathname.replace(/^\/dev(?=\/)/, '') || '/';
      const response = await route.fetch({ url: `${allowedOrigin}${targetPath}${requested.search}` });
      const headers = { ...response.headers() };
      if (requested.pathname === '/dev/') {
        headers['content-security-policy'] = (headers['content-security-policy'] || '')
          .replace("connect-src 'self' wss:", `connect-src 'self' ws://127.0.0.1:${room.address.port} wss:`);
      }
      await route.fulfill({ response, headers });
    } catch (e) { if (!/closed/.test(e.message)) errors.push({ tag, message: `route: ${e.message}` }); await route.abort().catch(() => {}); }
  });
  await page.routeWebSocket('**/dev/room', socket => {
    const upstream = new WebSocket(`ws://127.0.0.1:${room.address.port}/room`, { headers: { origin: allowedOrigin, cookie: `clareira_session=${user.token}` } });
    bridges.push(upstream);
    const queued = [];
    socket.onMessage(m => { if (upstream.readyState === WebSocket.OPEN) upstream.send(m); else queued.push(m); });
    upstream.on('open', () => queued.forEach(m => upstream.send(m)));
    upstream.on('message', m => { try { socket.send(m.toString()); } catch {} });
    upstream.on('close', () => { try { socket.close(); } catch {} });
    socket.onClose(() => upstream.close());
  });
  await page.goto(`${allowedOrigin}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#scene-loading').waitFor({ state: 'hidden', timeout: 120000 });
  await page.waitForSelector('.shell.is-authenticated', { timeout: 30000 });
  await sleep(4000);
  return { page, context };
}

async function shot(page, name) { await page.screenshot({ path: path.join(output, `${tag}-${name}.png`) }); }

try {
  preview = createPreviewServer({ gameDirectory: path.join(root, 'game'), stateDirectory, port: pagePort, allowedOrigin });
  preview.server.prependListener('request', req => { req.url = req.url.replace(/^\/dev(?=\/)/, '') || '/'; });
  await preview.listen();
  room = createPrototypeServer({ stateDirectory, allowedOrigin, port: 0, ambientCampfire: false });
  room.address = await room.listen();
  for (const [size, viewport, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
    const user = await createAccount(`Cap${tag}${size}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 20));
    const { page, context } = await openPage(user, viewport, mobile);
    await shot(page, `${size}-hud`);
    await page.evaluate(() => document.querySelector('#inventory-toggle').click());
    await page.locator('#inventory-dialog[open]').waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(600); await shot(page, `${size}-inventory`);
    await page.keyboard.press('Escape'); await sleep(400);
    await page.evaluate(() => document.querySelector('#settings-toggle').click());
    await page.locator('#settings-dialog[open]').waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(600); await shot(page, `${size}-settings`);
    await page.keyboard.press('Escape'); await sleep(400);
    await context.close();
  }
  if (errors.length) console.error('ERRORS', JSON.stringify(errors).slice(0, 2000));
  console.log('done', output, tag);
} finally {
  await browser.close();
  if (room) await room.close();
  if (preview) await preview.close();
  await storage.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
