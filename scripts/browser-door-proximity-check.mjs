import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const playwrightPath = process.env.PLAYWRIGHT_CORE || '/home/rafael/clareira-tools/node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/index.mjs';
const chromiumPath = process.env.CHROMIUM_PATH || '/home/rafael/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const { chromium } = await import(playwrightPath);

const baseUrl = process.argv[2] || 'http://127.0.0.1:19400/dev/';
const output = process.argv[3] || '/home/rafael/clareira-evidencias/2026-11-17-world-masmorra/d0';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: chromiumPath, args: ['--no-sandbox'] });
const results = [];

async function inspect(page) { return page.evaluate(async () => (await import('/dev/main.js')).inspectMovement()); }
async function walkToward(page, x, y) {
  for (let step = 0; step < 70; step++) {
    const s = await inspect(page);
    if (s.location === 'room' && Math.abs(x) > 20) return;
    if (s.location === 'clearing' && Math.abs(x) < 20) return;
    const dx = x - s.position.x, dy = y - s.position.y, distance = Math.hypot(dx, dy);
    if (distance < .48) break;
    const screenX = dx - dy, screenY = dx + dy;
    const keys = [];
    if (screenX < -.2) keys.push('ArrowLeft'); else if (screenX > .2) keys.push('ArrowRight');
    if (screenY < -.2) keys.push('ArrowUp'); else if (screenY > .2) keys.push('ArrowDown');
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(distance > 3 ? 350 : distance > 1.1 ? 180 : 80);
    for (const key of keys) await page.keyboard.up(key);
    await page.waitForTimeout(80);
  }
}
async function waitState(page, predicate, description, timeout = 18000) {
  await page.waitForFunction(predicate, null, { timeout });
  await page.waitForTimeout(500);
  const state = await inspect(page);
  if (!state.readiness.connected) throw new Error(`${description}: socket disconnected`);
  return state;
}
async function exercise(label, viewport, mobile) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  await page.addInitScript(() => {
    window.lockedNotices = 0;
    const add = WebSocket.prototype.addEventListener;
    WebSocket.prototype.addEventListener = function(type, listener, options) {
      if (type !== 'message') return add.call(this, type, listener, options);
      return add.call(this, type, event => {
        try { const msg = JSON.parse(event.data); if (msg.type === 'notice' && msg.text?.includes('Porta trancada')) window.lockedNotices++; } catch {}
        return listener.call(this, event);
      }, options);
    };
  });
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__clareiraMainLoadingProgressReady === true, null, { timeout: 120000 });
    await page.locator('#guest-form button[type=submit]').click();
    await page.waitForSelector('.shell.is-authenticated', { timeout: 60000 });
    await page.waitForFunction(async () => {
      try { const s = await import('/dev/main.js').then(m => m.inspectMovement()); return s.readiness.sceneReady && !s.readiness.loading && s.readiness.predictionReady && s.readiness.connected; }
      catch { return false; }
    }, null, { timeout: 90000 });
    const api = await page.evaluate(async () => {
      const { RECEPTION_BUILDING, VILLAGE_BUILDINGS } = await import('/dev/village-buildings.mjs');
      const cabin = VILLAGE_BUILDINGS.find(building => building.id === 'cabin-cedar-one');
      return { reception: RECEPTION_BUILDING.door, cabin: cabin.door };
    });
    await page.locator('#world').focus();

    await walkToward(page, api.reception.x + 6, api.reception.y + 3.5);
    await walkToward(page, api.reception.x, api.reception.y + .2);
    const entered = await waitState(page, async () => (await import('/dev/main.js')).inspectMovement().location === 'room', 'entered reception');
    await page.waitForFunction(async () => { const s=(await import('/dev/main.js')).inspectMovement(); return s.location==='room' && s.readiness.sceneReady && !s.readiness.loading; }, null, { timeout: 90000 });
    await page.screenshot({ path: `${output}/${label}-recepcao.png` });
    await page.waitForTimeout(1800);
    const afterArrival = await inspect(page);
    assert.equal(afterArrival.location, 'room', 'arrival inside the doorway does not cause a re-entry loop');

    const roomDoor = await page.evaluate(async () => {
      const { getRoomLayout } = await import('/dev/world.mjs');
      const s = (await import('/dev/main.js')).inspectMovement();
      return getRoomLayout(s.roomKind, s.roomBuildingId, s.roomLodgingMode).door;
    });
    await walkToward(page, roomDoor.x, roomDoor.y - 3);
    await page.waitForFunction(async () => {
      const s = (await import('/dev/main.js')).inspectMovement();
      const d = await import('/dev/world.mjs').then(m => m.getRoomLayout(s.roomKind, s.roomBuildingId, s.roomLodgingMode).door);
      return s.location === 'room' && Math.hypot(s.position.x - d.x, s.position.y - d.y) > 1.8;
    }, null, { timeout: 15000 });
    await walkToward(page, roomDoor.x, roomDoor.y + .25);
    await waitState(page, async () => (await import('/dev/main.js')).inspectMovement().location === 'clearing', 'walked out of reception');
    await page.waitForFunction(async () => { const s=(await import('/dev/main.js')).inspectMovement(); return s.location==='clearing' && s.readiness.sceneReady && !s.readiness.loading; }, null, {timeout:90000});
    await page.screenshot({ path: `${output}/${label}-fora.png` });

    await walkToward(page, api.reception.x + 6, api.reception.y + 3.5);
    await walkToward(page, 100.5, 100.8);
    await walkToward(page, 100.5, 109.5);
    await walkToward(page, api.cabin.x, api.cabin.y + 2.2);
    await walkToward(page, api.cabin.x, api.cabin.y + .2);
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Porta trancada'), null, { timeout: 20000 });
    await page.screenshot({ path: `${output}/${label}-cabana-sem-chave.png` });
    await page.waitForTimeout(3500);
    const lockedNotices = await page.evaluate(() => window.lockedNotices);
    assert.equal((await inspect(page)).location, 'clearing', 'locked cabin stays outdoors');
    assert.equal(lockedNotices, 1, 'a locked approach produces one warning');
    assert.deepEqual(errors, [], `${label}: browser console has no page errors`);
    results.push({ label, entered: entered.location, exited: 'clearing', lockedNotices, pageErrors: errors.length });
  } finally { await context.close(); }
}

try {
  await exercise('desktop', { width: 1440, height: 900 }, false);
  await exercise('celular', { width: 390, height: 844 }, true);
  await writeFile(`${output}/resultado.json`, JSON.stringify({ baseUrl, capturedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
