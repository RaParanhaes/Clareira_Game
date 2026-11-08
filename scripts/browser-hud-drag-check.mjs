import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';

const output = process.argv[2] || '/opt/game-agent/logs/browser-hud-drag';
const previewUrl = process.env.PREVIEW_URL || 'https://vmi3579939.contaboserver.net/dev/';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];

try {
  const ensureWorldReady = async page => {
    await page.waitForSelector('#scene-loading', { state: 'hidden', timeout: 60000 }).catch(() => {});
    const shellReady = await page.locator('.shell.is-authenticated').isVisible().catch(() => false);
    if (!shellReady) {
      await page.evaluate(() => {
        const button = document.querySelector('#guest-form button[type=submit]');
        button?.click();
      });
    }
    await page.waitForSelector('.shell.is-authenticated', { timeout: 45000 });
    await page.waitForFunction(() => window.testSockets.at(-1)?.readyState === WebSocket.OPEN,
      null, { timeout: 20000 });
    const tutorialVisible = await page.locator('.shell').evaluate(element =>
      element.classList.contains('arrival-tutorial-mode'));
    if (tutorialVisible) {
      await page.evaluate(() => window.testSockets.at(-1).send(JSON.stringify({
        type: 'action', name: 'arrivalTutorialChoice', choice: 'skip',
      })));
    }
    await page.waitForFunction(() => !document.querySelector('.shell')?.classList.contains('arrival-tutorial-mode'),
      null, { timeout: 30000 });
    await page.waitForSelector('#scene-loading', { state: 'hidden', timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#quickbar')?.getClientRects().length > 0,
      null, { timeout: 10000 });
  };

  const viewports = [
    ['desktop', { width: 1440, height: 900 }, false],
    ['mobile', { width: 390, height: 844 }, true],
  ].filter(([name]) => !process.env.HUD_CHECK_ONLY || process.env.HUD_CHECK_ONLY.split(',').includes(name));
  for (const [name, viewport, mobile] of viewports) {
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      window.testSockets = [];
      window.WebSocket = class extends NativeWebSocket {
        constructor(...args) {
          super(...args);
          window.testSockets.push(this);
        }
      };
    });

    await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });
    await ensureWorldReady(page);
    await page.waitForTimeout(1000);

    const quickbar = page.locator('#quickbar');
    assert.equal(await quickbar.isVisible(), true, `${name}: quickbar must be visible`);
    const menuToggle = page.locator('.mobile-menu-toggle');
    const openPlayerMenu = async () => {
      if (await menuToggle.isVisible() && await menuToggle.getAttribute('aria-expanded') !== 'true') {
        await menuToggle.click();
      }
      await page.locator('.player-menu summary').click();
    };
    await openPlayerMenu();
    await page.locator('#hud-edit-toggle').click();
    assert.equal(await page.locator('#hud-edit-toggle').getAttribute('aria-pressed'), 'true');
    if (!mobile) await page.locator('.player-menu summary').click();

    const before = await quickbar.boundingBox();
    assert.ok(before, `${name}: quickbar must have a box before dragging`);
    const positionInCanvas = async () => page.evaluate(() => {
      const element = document.querySelector('#quickbar');
      const bounds = document.querySelector('.canvas-wrap');
      const rect = element.getBoundingClientRect();
      return {
        x: element.offsetLeft, y: element.offsetTop,
        width: rect.width, height: rect.height,
        containerWidth: bounds.clientWidth, containerHeight: bounds.clientHeight,
      };
    });
    const beforeRelative = await positionInCanvas();
    const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    if (mobile) {
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: start.x, y: start.y }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: start.x + 18, y: start.y + 16 }],
      });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 24, start.y + 18, { steps: 4 });
      await page.mouse.up();
    }

    let after = await positionInCanvas();
    assert.ok(Math.abs(after.x - beforeRelative.x) > 5 || Math.abs(after.y - beforeRelative.y) > 5,
      `${name}: dragging must change the quickbar position`);
    let keyboardPosition = null;
    let keyboardEvent = null;
    if (!mobile) {
      await quickbar.focus();
      const beforeKeyboard = await positionInCanvas();
      keyboardEvent = await quickbar.evaluate(element => {
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true,
        });
        const notCanceled = element.dispatchEvent(event);
        return { defaultPrevented: event.defaultPrevented, notCanceled };
      });
      keyboardPosition = await positionInCanvas();
      assert.equal(keyboardEvent.defaultPrevented, true, `${name}: Alt+Left is handled by the panel`);
      assert.ok(keyboardPosition.x < beforeKeyboard.x, `${name}: Alt+Left must move the focused panel`);
      after = keyboardPosition;
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('clareira:hud-layout:v1') || '{}'));
    assert.ok(saved.quickbar, `${name}: dragged position must persist`);
    assert.ok(Math.abs(after.x / after.containerWidth - saved.quickbar.x) < 0.01,
      `${name}: horizontal position must be stored relative to the canvas: ${JSON.stringify({ after, saved })}`);
    assert.ok(Math.abs(after.y / after.containerHeight - saved.quickbar.y) < 0.01,
      `${name}: vertical position must be stored relative to the canvas: ${JSON.stringify({ after, saved })}`);
    await page.screenshot({ path: `${output}/${name}-hud-dragged.png` });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureWorldReady(page);
    const restored = await positionInCanvas();
    assert.ok(restored, `${name}: quickbar must remain visible after reload`);
    assert.ok(Math.abs(restored.x / restored.containerWidth - saved.quickbar.x) < 0.01
      && Math.abs(restored.y / restored.containerHeight - saved.quickbar.y) < 0.01,
    `${name}: normalized position must restore after reload: ${JSON.stringify({ saved, after, restored })}`);

    await openPlayerMenu();
    await page.locator('#hud-reset').click();
    const reset = await page.evaluate(() => JSON.parse(localStorage.getItem('clareira:hud-layout:v1') || '{}'));
    assert.deepEqual(reset, {}, `${name}: reset must clear saved positions`);
    assert.deepEqual(errors, [], `${name}: browser must have no JavaScript errors`);
    results.push({ name, errors, before, dragged: after, keyboard: keyboardPosition, keyboardEvent, restored });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
