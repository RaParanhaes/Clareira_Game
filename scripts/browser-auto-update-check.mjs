import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';

const output = process.argv[2] || 'logs/browser-auto-update';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  let version = 'fixture-v1';
  let versionRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(20_000);
  await page.addInitScript(() => {
    const count = Number(sessionStorage.getItem('clareira-update-test-boots') || 0) + 1;
    sessionStorage.setItem('clareira-update-test-boots', String(count));
  });
  await page.route('**/update-version', async route => {
    versionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ version }),
    });
  });

  await page.goto('https://vmi3579939.contaboserver.net/dev/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#scene-loading')?.hidden === true);
  await page.waitForTimeout(750);
  await page.screenshot({ path: `${output}/before-update.png` });
  const firstBoot = await page.evaluate(() => Number(sessionStorage.getItem('clareira-update-test-boots')));
  assert.equal(firstBoot, 1);
  version = 'fixture-v2';
  await page.waitForFunction(() => Number(sessionStorage.getItem('clareira-update-test-boots')) > 1, {}, { timeout: 25_000 });
  await page.waitForFunction(() => document.querySelector('#scene-loading')?.hidden === true);
  const updatedBoot = await page.evaluate(() => Number(sessionStorage.getItem('clareira-update-test-boots')));
  assert.equal(updatedBoot, 2, 'a nova versão recarregou a aba automaticamente');
  assert.ok(versionRequests >= 3, 'o cliente consultou o endpoint sem cache');

  await page.locator('#guest-form button[type=submit]').click();
  await page.waitForSelector('.shell.is-authenticated');
  await page.evaluate(async () => { window.inspectGame = (await import('/dev/main.js')).inspectMovement; });
  await page.waitForFunction(() => window.inspectGame().server && window.inspectGame().fires >= 1);
  const beforeDimension = await page.evaluate(() => window.inspectGame().dimensionId);
  await page.locator('.dimension-travel summary').click();
  const destination = page.locator('#dimension-destinations button:not(:disabled)').first();
  await destination.waitFor({ state: 'visible' });
  const destinationLabel = await destination.textContent();
  await destination.click();
  await page.waitForFunction(id => window.inspectGame().dimensionId !== id, beforeDimension);
  await page.waitForFunction(() => document.querySelector('#scene-loading')?.hidden === true);
  const afterDimension = await page.evaluate(() => window.inspectGame());
  assert.notEqual(afterDimension.dimensionId, beforeDimension);
  assert.ok(afterDimension.loadedWorldChunkRange.includes(afterDimension.dimensionId));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/after-dimension.png` });
  const result = {
    automaticReloads: updatedBoot - firstBoot,
    versionRequests,
    beforeDimension,
    destinationLabel: destinationLabel?.trim(),
    afterDimension: afterDimension.dimensionId,
    loadedWorldChunkRange: afterDimension.loadedWorldChunkRange,
    errors,
  };
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await context.close();
} finally {
  await browser.close();
}
