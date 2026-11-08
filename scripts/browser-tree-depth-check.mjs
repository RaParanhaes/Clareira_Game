import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = process.argv[2] || '/opt/game-agent/logs/tree-depth';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];

function assertCabinTreeOrder(state, label) {
  const house = state.cabinDepthAudit.find(thing => thing.type === 'home');
  const canopy = state.cabinDepthAudit.find(thing => thing.id === 'authored:5');
  assert.ok(house, `${label}: cabin is included in the sorted scene`);
  assert.ok(canopy, `${label}: right-corner tree is visible beside the cabin`);
  assert.equal(canopy.anchored, true, `${label}: overhanging canopy has a stable cabin anchor`);
  assert.ok(canopy.depth < house.depth, `${label}: the canopy sorts behind the cabin`);
  assert.ok(canopy.renderOrder < house.renderOrder, `${label}: the renderer draws the tree before the cabin`);
  return { tree: canopy.id, treeDepth: canopy.depth, houseDepth: house.depth,
    treeRenderOrder: canopy.renderOrder, houseRenderOrder: house.renderOrder };
}

try {
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1920, height: 1080 }, false],
    ['mobile', { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.goto('https://vmi3579939.contaboserver.net/dev/', { waitUntil: 'domcontentloaded' });
    await page.locator('#guest-form button[type=submit]').click();
    await page.waitForSelector('.shell.is-authenticated');
    await page.evaluate(async () => { window.readMovement = (await import('/dev/main.js')).inspectMovement; });
    await page.waitForFunction(() => {
      const state = window.readMovement?.();
      return state?.readiness?.sceneReady && state.readiness.predictionReady && state.readiness.connected;
    });
    await page.waitForTimeout(400);

    const before = await page.evaluate(() => window.readMovement());
    const beforeOrder = assertCabinTreeOrder(before, `${name} before movement`);
    await page.screenshot({ path: `${output}/${name}-before.png` });

    let after = before;
    if (!mobile) {
      await page.locator('#world').focus();
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(1100);
      await page.keyboard.up('ArrowDown');
      await page.waitForFunction(() => {
        const state = window.readMovement();
        return state.pending === 0 && !state.position.moving
          && Math.hypot(state.position.vx || 0, state.position.vy || 0) < .04;
      });
      after = await page.evaluate(() => window.readMovement());
      assert.ok(Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y) > .5,
        'desktop scenario moves the player around the cabin');
      assert.ok(Math.hypot(after.camera.x - before.camera.x, after.camera.y - before.camera.y) > .25,
        'camera follows the player during the check');
    }

    const afterOrder = assertCabinTreeOrder(after, `${name} after movement`);
    await page.screenshot({ path: `${output}/${name}-after.png` });
    assert.deepEqual(errors, [], `${name}: no browser errors`);
    results.push({ name, before: beforeOrder, after: afterOrder,
      moved: Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y), errors });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
