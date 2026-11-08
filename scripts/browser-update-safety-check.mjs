import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import WebSocket from 'ws';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const output = process.argv[2] || 'logs/browser-update-safety';
await mkdir(path.dirname(output), { recursive: true });
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-update-safety-'));
const base = 'http://127.0.0.1:18222';
const preview = createPreviewServer({ port: 18222, stateDirectory, allowedOrigin: base });
await preview.listen();
const room = createPrototypeServer({ port: 0, stateDirectory, allowedOrigin: base });
const roomAddress = await room.listen();
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
let context;

try {
  const registrationResponse = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ username: `mobile_${Date.now().toString().slice(-6)}`, password: 'MobileUpdate7!safe' }),
  });
  assert.equal(registrationResponse.status, 201, await registrationResponse.text());
  const sessionToken = registrationResponse.headers.get('set-cookie')?.match(/clareira_session=([^;]+)/)?.[1];
  assert.ok(sessionToken, 'registration returns a session for the local fixture');

  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  let version = 'fixture-v1';
  let versionRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(20_000);
  await context.addCookies([{
    name: 'clareira_session', value: sessionToken, url: `${base}/dev/`, httpOnly: true, sameSite: 'Strict',
  }]);
  await page.addInitScript(() => {
    const count = Number(sessionStorage.getItem('clareira-update-safety-boots') || 0) + 1;
    sessionStorage.setItem('clareira-update-safety-boots', String(count));
  });
  await page.routeWebSocket('**/dev/room', socket => {
    const upstream = new WebSocket(`ws://127.0.0.1:${roomAddress.port}/room`, {
      headers: { origin: base, cookie: `clareira_session=${sessionToken}` },
    });
    const queued = [];
    socket.onMessage(message => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else queued.push(message);
    });
    upstream.on('open', () => { for (const message of queued) upstream.send(message); });
    upstream.on('message', message => socket.send(message.toString()));
    upstream.on('error', error => errors.push(error.message));
    socket.onClose(() => upstream.close());
  });
  await page.route('**/dev/**', async route => route.fulfill({
    response: await route.fetch({
      url: route.request().url().replace('/dev/', '/'),
      headers: { ...route.request().headers(), cookie: `clareira_session=${sessionToken}` },
    }),
  }));
  await page.route('**/dev/update-version', async route => {
    versionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ version }),
    });
  });

  await page.goto(`${base}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell.is-authenticated');
  await page.waitForSelector('#scene-loading', { state: 'hidden' });
  await page.evaluate(async () => {
    const main = await import('/dev/main.js');
    window.inspectGame = main.inspectMovement;
    window.canApplyUpdate = main.canApplyGameUpdate;
  });
  await page.waitForFunction(() => window.inspectGame().server);
  const baselineDeadline = Date.now() + 10_000;
  while (versionRequests < 2 && Date.now() < baselineDeadline) await page.waitForTimeout(100);
  assert.ok(versionRequests >= 2, 'the updater has established its initial version');
  await page.screenshot({ path: `${output}-mobile-before.png` });

  const firstBoot = await page.evaluate(() => Number(sessionStorage.getItem('clareira-update-safety-boots')));
  const beforePosition = await page.evaluate(() => window.inspectGame().position);
  const right = page.locator('button[data-move="1,0"]');
  await right.waitFor({ state: 'visible' });
  await right.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  const movingPosition = await page.evaluate(() => window.inspectGame().position);
  assert.ok(Math.hypot(movingPosition.x - beforePosition.x, movingPosition.y - beforePosition.y) > 0.4,
    'the held mobile control moves the player');
  assert.equal(await page.evaluate(() => window.canApplyUpdate()), false,
    'an update cannot reload while the mobile control is held');

  const requestsBeforeChange = versionRequests;
  version = 'fixture-v2';
  const requestDeadline = Date.now() + 20_000;
  while (versionRequests < requestsBeforeChange + 2 && Date.now() < requestDeadline) await page.waitForTimeout(100);
  assert.ok(versionRequests >= requestsBeforeChange + 2, 'the updater observed the stable replacement version');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => Number(sessionStorage.getItem('clareira-update-safety-boots'))), firstBoot,
    'the moving player is not interrupted by the new version');

  const beforeRelease = await page.evaluate(() => window.inspectGame().position);
  await page.mouse.up();
  await page.waitForFunction(() => window.canApplyUpdate(), undefined, { timeout: 8_000 });
  await page.waitForFunction(boot => Number(sessionStorage.getItem('clareira-update-safety-boots')) > boot,
    firstBoot, { timeout: 25_000 });
  await page.waitForSelector('#scene-loading', { state: 'hidden' });
  await page.evaluate(async () => {
    const main = await import('/dev/main.js');
    window.inspectGame = main.inspectMovement;
  });
  await page.waitForFunction(() => window.inspectGame().server);
  const afterReload = await page.evaluate(() => window.inspectGame().position);
  assert.ok(Math.hypot(afterReload.x - beforeRelease.x, afterReload.y - beforeRelease.y) < 0.8,
    'the player position survives the automatic refresh');

  const beforeDimension = await page.evaluate(() => window.inspectGame().dimensionId);
  await page.locator('.dimension-travel summary').click();
  const destination = page.locator('#dimension-destinations button:not(:disabled)').first();
  await destination.waitFor({ state: 'visible' });
  const destinationTitle = await destination.evaluate(button => button.textContent.match(/^↗ (.*?) · /)?.[1]);
  assert.ok(destinationTitle, 'the travel target has a readable scene name');
  await destination.click();
  await page.waitForFunction(id => window.inspectGame().dimensionId !== id
    && !document.querySelector('#scene-loading').hidden, beforeDimension);
  assert.equal(await page.locator('#loading-title').textContent(), destinationTitle,
    'the transition card names the dimension being prepared');
  await page.waitForSelector('#scene-loading', { state: 'hidden' });
  const afterDimension = await page.evaluate(() => window.inspectGame());
  assert.notEqual(afterDimension.dimensionId, beforeDimension,
    'travel activates the selected dimension without reloading the page');
  assert.ok(afterDimension.loadedWorldChunkRange.includes(afterDimension.dimensionId),
    'the selected dimension prepares its world chunks before showing the scene');

  await page.locator('.dimension-travel summary').click();
  await page.locator('#dimension-destinations button').filter({ hasText: 'Bosque das Brasas' }).click();
  await page.waitForFunction(() => window.inspectGame().dimensionId === 'surface'
    && !document.querySelector('#scene-loading').hidden);
  await page.waitForSelector('#scene-loading', { state: 'hidden' });
  const door = await page.evaluate(async () => (await import('/dev/world.mjs')).CLEARING_DOOR);
  const canvasBox = await page.locator('#world').boundingBox();
  const tileX = canvasBox.width < 600 ? 26 : 32, tileY = tileX * 4.5 / 8;
  const approach = canvasBox.width < 600 ? [{ x: door.x + 2.8, y: door.y - .05 }, door] : [door];
  for (const target of approach) {
    const state = await page.evaluate(() => window.inspectGame());
    await page.mouse.click(
      canvasBox.x + canvasBox.width / 2 + (target.x - state.camera.x - target.y + state.camera.y) * tileX,
      canvasBox.y + canvasBox.height * (canvasBox.width < 600 ? .4 : .52)
        + (target.x - state.camera.x + target.y - state.camera.y) * tileY,
    );
    await page.waitForFunction(position => {
      const player = window.inspectGame().position;
      return Math.hypot(player.x - position.x, player.y - position.y) < .8;
    }, target, { timeout: 25_000 });
    await page.waitForTimeout(350);
  }
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.inspectGame().location === 'room'
    && !document.querySelector('#scene-loading').hidden);
  assert.equal(await page.locator('#loading-title').textContent(), 'Seu quarto',
    'the room transition card names the room being prepared');
  await page.screenshot({ path: `${output}-mobile-room-loading.png` });
  await page.waitForSelector('#scene-loading', { state: 'hidden' });
  assert.equal((await page.evaluate(() => window.inspectGame().location)), 'room');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}-mobile-after.png` });
  console.log(JSON.stringify({
    automaticReload: true,
    heldMovementProtected: true,
    positionPreserved: true,
    dimensionChangedWithoutPageReload: true,
    dimensionChunksPrepared: true,
    roomLoadingTitle: 'Seu quarto',
    dimension: afterDimension.dimensionId,
    updateRequests: versionRequests,
    errors,
  }));
} finally {
  await context?.close();
  await browser.close();
  await room.close();
  await preview.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
