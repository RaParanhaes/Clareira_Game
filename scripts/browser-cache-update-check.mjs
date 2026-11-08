import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'clareira-cache-update-browser-'));
const gameDirectory = path.join(root, 'game');
const stateDirectory = path.join(root, 'state');
await mkdir(gameDirectory, { recursive: true });
await mkdir(stateDirectory, { recursive: true });
const server = createPreviewServer({ port: 0, gameDirectory, stateDirectory, versionCacheMs: 0 });
const address = await server.listen();
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});

try {
  await writeFile(path.join(gameDirectory, 'index.html'), `<!doctype html><html><body>
    <section id="scene-loading" data-context="login"><p id="loading-message"></p><span id="loading-caption"></span><div id="loading-progress"></div><strong id="loading-percent" hidden></strong>
    <div data-loading-step="current"><span data-loading-label></span><div role="progressbar"></div><small data-loading-detail></small></div>
    <button id="loading-reload" hidden></button></section>
    <script type="module" src="./bootstrap.mjs"></script>
  </body></html>`);
  for (const filename of ['bootstrap.mjs', 'cache-update.mjs', 'service-worker.js', 'update-monitor.mjs']) {
    const source = await (await import('node:fs/promises')).readFile(new URL(`../game/${filename}`, import.meta.url));
    // Seed the old worker behavior so this test also covers an existing browser
    // upgrading to the worker that preserves versioned download URLs.
    await writeFile(path.join(gameDirectory, filename), filename === 'service-worker.js'
      ? source.toString().replace('if (url.searchParams.has(DOWNLOAD_PARAMETER)) {',
        'if (url.searchParams.has(DOWNLOAD_PARAMETER)) { url.searchParams.delete(DOWNLOAD_PARAMETER);')
      : source);
  }
  await writeFile(path.join(gameDirectory, 'main.js'), `
    window.__gameVersion = 'v1';
    sessionStorage.setItem('cache-update-boots', String(Number(sessionStorage.getItem('cache-update-boots') || 0) + 1));
    document.querySelector('#scene-loading').hidden = true;
    export function canApplyGameUpdate() { return !window.__auditHoldMonitor; }
  `);
  await writeFile(path.join(gameDirectory, 'scene-data.json'), JSON.stringify({ revision: 1 }));

  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(30_000);
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gameVersion === 'v1');
  const firstCacheState = await page.evaluate(async baseUrl => {
    const names = (await caches.keys()).filter(name => name.startsWith('clareira-game-assets-v1-'));
    const metadata = await caches.open('clareira-game-cache-metadata-v1');
    const marker = await metadata.match(`${baseUrl}/__clareira_active_game_version__`);
    const state = await marker.json();
    return { names, state };
  }, base);
  assert.equal(firstCacheState.names.length, 1, 'a primeira carga deixa um cache ativo do jogo');

  await writeFile(path.join(gameDirectory, 'main.js'), `
    window.__gameVersion = 'v2';
    sessionStorage.setItem('cache-update-boots', String(Number(sessionStorage.getItem('cache-update-boots') || 0) + 1));
    document.querySelector('#scene-loading').hidden = true;
    export function canApplyGameUpdate() { return !window.__auditHoldMonitor; }
  `);
  await page.waitForFunction(() => window.__gameVersion === 'v2', undefined, { timeout: 25_000 });
  const finalCacheState = await page.evaluate(async baseUrl => {
    const names = (await caches.keys()).filter(name => name.startsWith('clareira-game-assets-v1-'));
    const metadata = await caches.open('clareira-game-cache-metadata-v1');
    const state = await (await metadata.match(`${baseUrl}/__clareira_active_game_version__`)).json();
    const active = await caches.open(state.cacheName);
    const script = await (await active.match(`${baseUrl}/main.js`)).text();
    const data = await (await active.match(`${baseUrl}/scene-data.json`)).text();
    return { names, state, script, data };
  }, base);
  assert.equal(finalCacheState.names.length, 1, 'os caches anteriores foram removidos e a limpeza foi conferida');
  assert.notEqual(finalCacheState.state.cacheName, firstCacheState.state.cacheName);
  assert.match(finalCacheState.script, /v2/u, 'o novo módulo foi baixado e está no cache ativo');
  assert.deepEqual(JSON.parse(finalCacheState.data), { revision: 1 }, 'arquivos inalterados foram mantidos após conferência');
  assert.deepEqual(errors, []);
  // The installed worker still removes the old query parameter. Exercise it
  // while a file changes after its manifest was delivered.
  await page.evaluate(() => { window.__auditHoldMonitor = true; });
  await writeFile(path.join(gameDirectory, 'scene-data.json'), JSON.stringify({ revision: 2 }));
  const synchronization = page.evaluate(async () => {
    const { synchronizeGameCache } = await import('./cache-update.mjs');
    return synchronizeGameCache({ manifestUrl: new URL('./game-assets', location), scopeUrl: new URL('./', location),
      fetchRef: async (url, options) => {
        if (new URL(url).pathname.includes('/__clareira_versioned_assets__/') && !window.__pinnedDownloadHeld) {
          window.__pinnedDownloadHeld = true;
          await new Promise(resolve => { window.__releasePinnedDownload = resolve; });
        }
        return fetch(url, options);
      },
    });
  });
  await page.waitForFunction(() => window.__pinnedDownloadHeld);
  await writeFile(path.join(gameDirectory, 'scene-data.json'), JSON.stringify({ revision: 3 }));
  const futureVersion = await (await fetch(`${base}/game-assets`)).json();
  await page.evaluate(() => window.__releasePinnedDownload());
  const pinned = await synchronization;
  assert.notEqual(pinned.version, futureVersion.version);
  const pinnedData = await page.evaluate(async baseUrl => {
    const metadata = await caches.open('clareira-game-cache-metadata-v1');
    const state = await (await metadata.match(`${baseUrl}/__clareira_active_game_version__`)).json();
    const cache = await caches.open(state.cacheName);
    return (await cache.match(`${baseUrl}/scene-data.json`)).json();
  }, base);
  assert.deepEqual(pinnedData, { revision: 2 }, 'service worker preserves the download version while current files change');
  await writeFile(path.join(gameDirectory, 'service-worker.js'),
    await (await import('node:fs/promises')).readFile(new URL('../game/service-worker.js', import.meta.url)));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gameVersion === 'v2');
  console.log(JSON.stringify({
    firstVersion: firstCacheState.state.version,
    currentVersion: finalCacheState.state.version,
    oldCachesRemoved: firstCacheState.names.length === 1 && finalCacheState.names.length === 1,
    updatedModuleServed: /v2/u.test(finalCacheState.script),
    unchangedAssetPreserved: JSON.parse(finalCacheState.data).revision === 1,
    browserErrors: errors,
    pinnedDownloadSurvivesConcurrentEdit: true,
    legacyWorkerPinnedDownload: true,
    workerUpdateReloaded: true,
  }));
  await context.close();
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
