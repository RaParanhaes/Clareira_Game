import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createDatabasePool } from '../database/pool.mjs';
import { createStorageAdapter } from '../database/storage.mjs';
import { canOccupyRoom, getRoomLayout, PLAYER_RADIUS, WORLD_COORDINATE_VERSION } from '../game/world.mjs';

const base = 'https://vmi3579939.contaboserver.net';
const output = process.argv[2] || 'logs/interaction-journal-browser';
await mkdir(output, { recursive: true });
const config = JSON.parse(await readFile(new URL('../.local/preview-backend.json', import.meta.url), 'utf8'));
const credentials = Object.fromEntries((await readFile(new URL('../.local/backends.env', import.meta.url), 'utf8'))
  .trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const adminUrl = new URL('postgres://clareira@127.0.0.1:55432/clareira');
adminUrl.password = credentials.POSTGRES_PASSWORD;
const admin = createDatabasePool({ connectionString: adminUrl.href, max: 1 });
const storage = createStorageAdapter({ directory: config.stateDirectory, databaseUrl: config.DATABASE_URL });
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
let user = null;

async function fixture() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const username = `verify_${suffix}`;
  user = await storage.accounts.register({ username, password: `Verify7!${randomUUID().slice(0, 10)}` });
  const profileId = user.profile.id;
  const layout = getRoomLayout('legacy');
  const chair = { id: 'abcdef01', kind: 'chair', x: 6.5, y: 9, rotation: 0 };
  const start = { x: 7.5, y: 9 };
  assert.equal(canOccupyRoom(start, PLAYER_RADIUS, [chair], layout), true, 'fixture starts beside an unblocked chair');
  await storage.saveRoom(profileId, [chair]);
  await storage.savePlayerLocation(profileId, {
    location: 'room', dimensionId: 'surface', ...start, roomKey: `account:${profileId}`,
    roomOwnerName: username, color: 0, worldVersion: WORLD_COORDINATE_VERSION,
  });
  return { username, token: user.token, profileId, chair };
}

async function runViewport(name, viewport, mobile, account) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.addCookies([{
    name: 'clareira_session', value: account.token, url: `${base}/dev/`, httpOnly: true, sameSite: 'Strict',
  }]);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource: net::ERR_')) errors.push(message.text());
  });
  await page.route('**/dev/update-version**', route => route.fulfill({ json: { version: 'interaction-journal-review' } }));
  await page.goto(`${base}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell.is-authenticated');
  await page.evaluate(async () => { window.checkMovement = (await import('/dev/main.js')).inspectMovement; });
  try { await page.waitForFunction(() => {
    const state = window.checkMovement();
    return state.server && state.location === 'room' && state.readiness.sceneReady
      && state.readiness.predictionReady && !state.readiness.loading && state.readiness.connected;
  }); } catch (error) {
    const state=await page.evaluate(()=>{const s=window.checkMovement();return {readiness:s.readiness,location:s.location,position:s.position,
      server:s.server,roomCanEdit:s.roomCanEdit,roomKind:s.roomKind,roomFurniture:s.roomFurniture};});
    console.error(JSON.stringify({ name, state, errors }, null, 2));
    await page.screenshot({ path: `${output}/${name}-load-failure.png` });
    throw error;
  }
  const initial = await page.evaluate(() => window.checkMovement());
  assert.equal(initial.roomCanEdit, true, `${name}: account owns its room`);
  assert.equal(initial.roomFurniture[0]?.id, account.chair.id, `${name}: saved chair loaded`);
  assert.equal(await page.locator('.coin-wallet').isVisible(), true, `${name}: coin wallet remains in the side menu`);
  assert.equal(await page.locator('.topbar > .inventory').count(), 0, `${name}: material strip is absent`);

  await page.locator('#inventory-toggle').click();
  await page.waitForSelector('#inventory-dialog[open]');
  assert.equal(await page.locator('.inventory-purse').isVisible(), true, `${name}: backpack contains the coin purse`);
  for (const kind of ['gold', 'silver', 'bronze']) {
    assert.equal(await page.locator(`#bag-${kind}-count`).innerText(), await page.locator(`#${kind}-count`).innerText(), `${name}: ${kind} purse total matches the side wallet`);
  }
  await page.screenshot({ path: `${output}/${name}-inventory.png` });
  await page.locator('#inventory-close').click();

  const contextButton = page.locator('[data-action="context"]');
  if (mobile) {
    assert.equal(await contextButton.isVisible(), true, `${name}: context action is available on touch`);
    await contextButton.click();
  } else {
    await page.locator('#world').focus();
    await page.keyboard.press('e');
  }
  await page.waitForFunction(() => window.checkMovement().pose.sitting === true, null, { timeout: 5000 });
  const seated = await page.evaluate(() => window.checkMovement());
  assert.ok(Math.hypot(seated.position.x - account.chair.x, seated.position.y - account.chair.y) < .05,
    `${name}: one contextual action seats the player at the saved chair`);
  await page.screenshot({ path: `${output}/${name}-sitting.png` });

  if (mobile) await contextButton.click();
  else { await page.locator('#world').focus(); await page.keyboard.press('e'); }
  await page.waitForFunction(() => window.checkMovement().pose.sitting === false, null, { timeout: 5000 });
  let events=[];
  for(let attempt=0;attempt<100;attempt++){
    events=await storage.listInteractionEvents({ actorProfileId: account.profileId, limit: 20 });
    if(events.filter(event=>event.action==='use_furniture'&&event.objectId===account.chair.id).length>=2)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  const seatEvents = events.filter(event => event.action === 'use_furniture' && event.objectId === account.chair.id);
  assert.ok(seatEvents.some(event => event.details.use === 'sit' && event.details.sitting === true), `${name}: seating is written to PostgreSQL`);
  assert.ok(seatEvents.some(event => event.details.use === 'sit' && event.details.sitting === false), `${name}: standing is written to PostgreSQL`);
  assert.ok(seatEvents.every(event => event.location === 'room' && event.objectProperties.x === account.chair.x),
    `${name}: events include the place and saved object properties`);
  assert.deepEqual(errors, [], `${name}: no browser errors`);
  results.push({ name, viewport, mobile, onePressUse: true, coinPurse: true, noMaterialStrip: true,
    databaseEvents: seatEvents.length, errors, screenshots: [`${output}/${name}-inventory.png`, `${output}/${name}-sitting.png`] });
  await context.close();
}

try {
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1440, height: 900 }, false],
    ['mobile', { width: 390, height: 844 }, true],
  ]) {
    const account = await fixture();
    await runViewport(name, viewport, mobile, account);
    await admin.query('DELETE FROM interaction_events WHERE actor_profile_id = $1', [account.profileId]);
    await admin.query('DELETE FROM profiles WHERE id = $1', [account.profileId]);
    await admin.query('DELETE FROM accounts WHERE id = $1', [account.profileId]);
    user = null;
  }
  await writeFile(`${output}/result.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  if (user?.profile?.id) {
    await admin.query('DELETE FROM interaction_events WHERE actor_profile_id = $1', [user.profile.id]);
    await admin.query('DELETE FROM profiles WHERE id = $1', [user.profile.id]);
    await admin.query('DELETE FROM accounts WHERE id = $1', [user.profile.id]);
  }
  await storage.close();
  await admin.end();
}
