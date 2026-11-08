import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createDevPreviewBridge } from './dev-preview-bridge.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const output = process.argv[2] || 'logs/loading-motion';
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-loading-motion-'));
const base = 'http://127.0.0.1:19074';
const preview = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: base });
const previewAddress = await preview.listen();
const bridge = createDevPreviewBridge(previewAddress, { port: 19074 });
const room = createPrototypeServer({ port: 19075, stateDirectory, allowedOrigin: base });
await bridge.listen();
await room.listen();
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const registration = await context.request.post(`${base}/auth/guest`, { headers: { origin: base } });
  assert.equal(registration.status(), 201, await registration.text());
  const token = registration.headers()['set-cookie'].match(/clareira_session=([^;]+)/)[1];
  await context.addCookies([{ name: 'clareira_session', value: token, url: `${base}/dev/`, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**/dev/room', async socket => {
    const upstream = new WebSocket(`ws://127.0.0.1:19075/room`, {
      headers: { origin: base, cookie: `clareira_session=${token}` },
    });
    const queued = [];
    socket.onMessage(message => upstream.readyState === WebSocket.OPEN ? upstream.send(message) : queued.push(message));
    upstream.on('open', () => queued.splice(0).forEach(message => upstream.send(message)));
    upstream.on('message', message => socket.send(message.toString()));
    upstream.on('error', error => errors.push(error.message));
    socket.onClose(() => upstream.close());
  });
  await page.goto(`${base}/dev/`);
  await page.evaluate(async () => { window.movementState = (await import('/dev/main.js')).inspectMovement; });
  await page.waitForFunction(() => {
    const state = window.movementState();
    return state.readiness.sceneReady && !state.readiness.loading && state.arrivalTutorial;
  }, null, { timeout: 60000 });
  await page.waitForFunction(() => window.movementState().arrivalCinematicAgeMs > 4000, null, { timeout: 60000 });
  await page.locator('#arrival-tutorial-skip').evaluate(button => button.click());
  await page.waitForFunction(() => {
    const state = window.movementState();
    return state.dimensionId === 'surface' && state.readiness.sceneReady && !state.readiness.loading
      && !state.teleport.local && !state.teleport.active;
  }, null, { timeout: 60000 });

  const before = await page.evaluate(() => {
    const state = window.movementState();
    window.loadingMotionFrames = [];
    let previous = 0;
    const sample = now => {
      if (previous) window.loadingMotionFrames.push(now - previous);
      previous = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return {
      position: state.position,
      lightmapsPending: state.lightmaps.pending,
      terrainPending: state.terrainPreparation.pendingChunks,
      terrainQueueMs: state.terrainPreparation.lastQueueWorkMs,
      worldWarmPending: state.terrainRetention.worldWarm.pendingCount,
    };
  });
  await page.locator('#world').evaluate(canvas => canvas.focus());
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(5000);
  await page.keyboard.up('ArrowRight');
  const after = await page.evaluate(() => {
    const state = window.movementState();
    const frames = window.loadingMotionFrames.slice().sort((a, b) => a - b);
    const percentile = p => frames[Math.min(frames.length - 1, Math.ceil(frames.length * p) - 1)] || 0;
    return {
      position: state.position,
      lightmapsPending: state.lightmaps.pending,
      terrainPending: state.terrainPreparation.pendingChunks,
      terrainQueueMs: state.terrainPreparation.lastQueueWorkMs,
      worldWarmPending: state.terrainRetention.worldWarm.pendingCount,
      frames: {
        count: frames.length,
        p50Ms: percentile(.5),
        p95Ms: percentile(.95),
        p99Ms: percentile(.99),
        maxMs: frames.at(-1) || 0,
        over50ms: frames.filter(value => value > 50).length,
        over250ms: frames.filter(value => value > 250).length,
      },
    };
  });
  const distance = Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y);
  assert.ok(distance > 0.5, `player moves during background preparation; start=${JSON.stringify(before.position)} end=${JSON.stringify(after.position)}`);
  assert.deepEqual(errors, []);
  const result = { status: 'passed', viewport: '390x844 DPR1', before, after, distance };
  await page.screenshot({ path: path.join(output, 'mobile-moving.png') });
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  await context.close();
} finally {
  await browser.close();
  await bridge.close();
  await preview.close();
  await room.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
