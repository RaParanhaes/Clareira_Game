import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';

const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-cache-game-state-'));
const preview = createPreviewServer({ gameDirectory: path.resolve('game'), stateDirectory, port: 0, versionCacheMs: 0 });
const previewAddress = await preview.listen();
const bridge = http.createServer((incoming, outgoing) => {
  const pathname = incoming.url.replace(/^\/dev(?=\/|$)/u, '') || '/';
  const upstream = http.request({
    host: '127.0.0.1', port: previewAddress.port, path: pathname, method: incoming.method,
    headers: { ...incoming.headers, host: `127.0.0.1:${previewAddress.port}` },
  }, response => {
    outgoing.writeHead(response.statusCode || 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
});
await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
const bridgeAddress = bridge.address();
const base = `http://127.0.0.1:${bridgeAddress.port}`;
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(90_000);
  await page.goto(`${base}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#scene-loading')?.hidden === true);
  const state = await page.evaluate(async baseUrl => {
    const scope = `${baseUrl}/dev/`;
    const names = (await caches.keys()).filter(name => name.startsWith('clareira-game-assets-v1-'));
    const metadata = await caches.open('clareira-game-cache-metadata-v1');
    const current = await (await metadata.match(`${scope}__clareira_active_game_version__`)).json();
    const cache = await caches.open(current.cacheName);
    const manifest = await (await fetch(`${scope}game-assets`, { cache: 'no-store' })).json();
    const expected = manifest.files.find(file => file.path === 'main.js');
    const response = await cache.match(`${scope}main.js`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    return {
      names, version: current.version, manifestVersion: manifest.version,
      controller: Boolean(navigator.serviceWorker.controller),
      loadingMessage: document.querySelector('#loading-message')?.textContent,
      mainHashMatches: digest === expected.sha256,
      loadedLogin: !document.querySelector('#auth-gate')?.hidden,
    };
  }, base);
  assert.equal(state.names.length, 1);
  assert.equal(state.version, state.manifestVersion);
  assert.equal(state.controller, true);
  assert.equal(state.mainHashMatches, true);
  assert.equal(state.loadedLogin, true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...state, browserErrors: errors }));
} finally {
  await browser.close();
  await new Promise(resolve => bridge.close(resolve));
  await preview.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
