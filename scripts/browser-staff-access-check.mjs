import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createDevPreviewBridge } from './dev-preview-bridge.mjs';

const output = process.argv[2] || 'logs/staff-access-browser';
await mkdir(output, { recursive: true });
const stateDirectory = await mkdtemp('/tmp/clareira-staff-audit-');
const allowed = { full: ['*'], reports: ['reports.read'], players: ['players.read'], none: [] };
const calls = [];
const storageAdapter = {
  ready: async () => {}, close: async () => {},
  accounts: { getSession: async token => token === 'guest' ? { profile: { id: 'guest', guest: true } }
    : Object.hasOwn(allowed, token) ? { profile: { id: token, guest: false } } : null },
  staffManagement: {
    authorization: { hasPermission: async (id, key) => allowed[id]?.includes('*') || allowed[id]?.includes(key) || false },
    listRoles: async () => [], listPermissionsForActor: async () => [], listAudit: async () => [],
    listReports: async () => { calls.push('reports'); return []; },
    findAccountByUsername: async username => username === 'test_user' ? { id: 'synthetic', username } : null,
    listSanctions: async () => [],
  },
};
const base = 'http://127.0.0.1:18272';
const server = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: base, storageAdapter });
const bridge = createDevPreviewBridge(await server.listen(), { port: 18272 });
await bridge.listen();
const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome', args: ['--no-sandbox'] });
const results = [];
try {
  for (const [token, status] of [['', 401], ['guest', 401], ['none', 403]]) {
    const response = await fetch(`${base}/dev/staff/`, { redirect: 'manual', headers: token ? { cookie: `clareira_session=${token}` } : {} });
    assert.equal(response.status, status, `access is denied for ${token || 'no session'}`);
  }
  const redirect = await fetch(`${base}/dev/staff/?from=test`, { redirect: 'manual', headers: { cookie: 'clareira_session=full' } });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '../staff?from=test');
  for (const [name, token, viewport] of [['owner-desktop', 'full', { width: 1440, height: 900 }], ['owner-mobile', 'full', { width: 390, height: 844 }], ['reports-only', 'reports', { width: 390, height: 844 }], ['players-only', 'players', { width: 390, height: 844 }]]) {
    calls.length = 0;
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: 'clareira_session', value: token, url: `${base}/dev/` }]);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await page.goto(`${base}/dev/staff/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.nav-item:not([hidden])', { timeout: 10000 });
    assert.equal(new URL(page.url()).pathname, '/dev/staff', 'the slash form resolves to the canonical panel');
    assert.equal(await page.locator('link[rel="stylesheet"]').evaluate(element => Boolean(element.sheet?.cssRules.length)), true);
    assert.equal(await page.locator('.brand').evaluate(element => new URL(element.href).pathname), '/dev/');
    assert.equal(await page.locator('.footer a').evaluate(element => new URL(element.href).pathname), '/dev/');
    if (token === 'reports') {
      assert.equal(await page.locator('#reports-panel').isVisible(), true);
      assert.equal(await page.locator('#moderation-player-panel').isVisible(), false);
      assert.equal(await page.locator('#reports-refresh').isVisible(), true);
    }
    if (token === 'players') {
      assert.equal(await page.locator('#reports-panel').isVisible(), false);
      assert.equal(await page.locator('#reports-refresh').isVisible(), false);
      assert.equal(await page.locator('#moderation-player-panel').isVisible(), true);
      await page.locator('#sanction-username').fill('test_user');
      await page.getByRole('button', { name: 'Consultar histórico' }).click();
      await page.getByRole('heading', { name: 'test_user' }).waitFor();
      assert.equal(calls.includes('reports'), false, 'readPlayers alone never queries the reports API');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ name, canonical: '/dev/staff', styleLoaded: true, returnLink: '/dev/', noForbiddenRequests: true, errors });
    await context.close();
  }
  await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close(); await bridge.close(); await server.close(); await rm(stateDirectory, { recursive: true, force: true });
}
