import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createDevPreviewBridge } from './dev-preview-bridge.mjs';

const output = process.argv[2] || 'logs/login-animation-browser';
await mkdir(output, { recursive: true });
let server, bridge, stateDirectory;
let origin = process.env.CLAREIRA_LOGIN_ANIMATION_URL;
if (!origin) {
  origin = 'http://127.0.0.1:18267/dev/';
  stateDirectory = await mkdtemp('/tmp/clareira-login-animation-');
  server = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: 'http://127.0.0.1:18267' });
  bridge = createDevPreviewBridge(await server.listen(), { port: 18267 });
  await bridge.listen();
}
const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome', args: ['--no-sandbox'] });
const results = [];
const mobileOnly = process.env.CLAREIRA_LOGIN_ANIMATION_PUBLIC === '1';
const cases = process.env.CLAREIRA_LOGIN_ANIMATION_FAILURE_ONLY === '1' ? [] : mobileOnly ? [['mobile', { width: 390, height: 844 }, false]] : [
  ['desktop', { width: 1440, height: 900 }, false],
  ['mobile', { width: 390, height: 844 }, false],
  ['small', { width: 320, height: 640 }, false],
  ['landscape', { width: 844, height: 390 }, false],
  ['reduced', { width: 390, height: 844 }, true],
];
try {
  for (const [name, viewport, reduced] of cases) {
    const context = await browser.newContext({ viewport, isMobile: name !== 'desktop', hasTouch: name !== 'desktop', reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#scene-loading').hidden && !document.querySelector('.shell').inert, {}, { timeout: 90000 });
    const video = page.locator('#auth-scene-video');
    const button = page.locator('#auth-animation-toggle');
    if (reduced) {
      assert.equal(await video.getAttribute('src'), null, 'reduced motion does not automatically download video');
      assert.equal(await button.getAttribute('aria-pressed'), 'false');
      await button.click();
    }
    await page.waitForFunction(() => {
      const video = document.querySelector('#auth-scene-video');
      return video.dataset.playing === 'true' && !video.paused && video.readyState >= 2 && video.currentTime > .1;
    }, {}, { timeout: 45000 });
    const initial = await video.evaluate(video => ({ time: video.currentTime, duration: video.duration, quality: video.getVideoPlaybackQuality().toJSON?.() || { totalVideoFrames: video.getVideoPlaybackQuality().totalVideoFrames, droppedVideoFrames: video.getVideoPlaybackQuality().droppedVideoFrames } }));
    assert.ok(Math.abs(initial.duration - 30) < .05, `actual encoded duration is 30 seconds: ${initial.duration}`);
    await page.screenshot({ path: `${output}/${name}-playing-a.png` });
    await page.waitForTimeout(1800);
    const next = await video.evaluate(video => ({ time: video.currentTime, total: video.getVideoPlaybackQuality().totalVideoFrames, dropped: video.getVideoPlaybackQuality().droppedVideoFrames }));
    assert.ok(next.time > initial.time + 1, 'the real video timeline advances');
    await page.screenshot({ path: `${output}/${name}-playing-b.png` });
    const sampleStart = await video.evaluate(video => ({ time: video.currentTime, total: video.getVideoPlaybackQuality().totalVideoFrames, dropped: video.getVideoPlaybackQuality().droppedVideoFrames }));
    await page.waitForTimeout(2000);
    const sampleEnd = await video.evaluate(video => ({ time: video.currentTime, total: video.getVideoPlaybackQuality().totalVideoFrames, dropped: video.getVideoPlaybackQuality().droppedVideoFrames }));
    const playbackSample = { seconds: sampleEnd.time - sampleStart.time, frames: sampleEnd.total - sampleStart.total, dropped: sampleEnd.dropped - sampleStart.dropped };
    await button.click();
    const pausedTime = await video.evaluate(video => video.currentTime);
    await page.waitForTimeout(500);
    assert.equal(await video.evaluate(video => video.paused), true);
    assert.ok(Math.abs(await video.evaluate(video => video.currentTime) - pausedTime) < .1);
    await button.click();
    await page.waitForFunction(() => !document.querySelector('#auth-scene-video').paused);
    await video.evaluate(video => { video.currentTime = video.duration - .15; });
    await page.waitForFunction(() => {
      const video = document.querySelector('#auth-scene-video');
      return video.currentTime < 2 && !video.paused && video.readyState >= 2;
    }, {}, { timeout: 15000 });
    const layout = await button.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return { right: rect.right, left: rect.left, width: innerWidth, background: getComputedStyle(document.body).backgroundColor };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.width, 'animation controls fit the viewport');
    assert.equal(layout.background, 'rgb(0, 0, 0)');
    assert.deepEqual(errors, []);
    results.push({ name, initial, next, playbackSample, realPlayback: true, pauseResume: true, loopRestarted: true, reducedMotionExplicitlyEnabled: reduced, layout, errors });
    await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
    await context.close();
  }
  if (!mobileOnly) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route('**/art/clareira-login-loop-v5.mp4', route => route.abort('failed'));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const video = document.querySelector('#auth-scene-video');
      return document.querySelector('#scene-loading').hidden && !document.querySelector('.shell').inert
        && video.error && document.querySelector('#auth-animation-toggle').getAttribute('aria-pressed') === 'false';
    }, {}, { timeout: 90000 });
    await page.waitForSelector('#guest-form', { state: 'visible', timeout: 5000 });
    assert.equal(await page.locator('#guest-form').isVisible(), true, 'a media failure never blocks the login form');
    assert.notEqual(await page.locator('#auth-scene-video').getAttribute('data-playing'), 'true');
    await page.screenshot({ path: `${output}/video-failed-poster.png` });
    await page.unroute('**/art/clareira-login-loop-v5.mp4');
    await page.locator('#auth-animation-toggle').click();
    await page.waitForFunction(() => {
      const video = document.querySelector('#auth-scene-video');
      return !video.paused && !video.error && video.currentTime > .1;
    }, {}, { timeout: 30000 });
    results.push({ name: 'media-failure', formRemainedAccessible: true, posterFallback: true, explicitRetryRecovered: true });
    await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
    await context.close();
  }
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  if (bridge) await bridge.close();
  if (server) await server.close();
  if (stateDirectory) await rm(stateDirectory, { recursive: true, force: true });
}
