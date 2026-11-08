import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import {
  GAME_CACHE_MARKER, GAME_CACHE_META, GAME_CACHE_PREFIX, synchronizeGameCache,
} from './cache-update.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requestUrl(request) {
  return request instanceof URL ? request.href : new URL(request.url || request).href;
}

class MemoryCache {
  entries = new Map();
  async match(request) { return this.entries.get(requestUrl(request))?.clone() || null; }
  async put(request, response) { this.entries.set(requestUrl(request), response.clone()); }
  async delete(request) { return this.entries.delete(requestUrl(request)); }
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
}

class MemoryCacheStorage {
  entries = new Map();
  failGameCacheDelete = false;
  async open(name) {
    if (!this.entries.has(name)) this.entries.set(name, new MemoryCache());
    return this.entries.get(name);
  }
  async keys() { return [...this.entries.keys()]; }
  async delete(name) {
    if (this.failGameCacheDelete && name.startsWith(GAME_CACHE_PREFIX)) return false;
    return this.entries.delete(name);
  }
}

function manifestFor(entries) {
  const files = [...entries].map(([path, value]) => file(path, value));
  const canonicalFiles = files.map(item => [item.path, item.size, item.sha256])
    .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
  return { version: sha256(JSON.stringify(canonicalFiles)), files };
}
function file(path, value) {
  const bytes = new TextEncoder().encode(value);
  return { path, size: bytes.byteLength, sha256: sha256(bytes) };
}

function makeFetcher(manifest, files, { corrupt = false } = {}) {
  return async (request, options = {}) => {
    const url = new URL(request);
    if (url.href === 'https://game.invalid/dev/game-assets') {
      return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } });
    }
    const relative = url.pathname.slice('/dev/'.length).replace(/^__clareira_versioned_assets__\/[a-f0-9]{64}\//u, '');
    const value = files.get(relative);
    if (value === undefined) return new Response('not found', { status: 404 });
    assert.equal(options.cache, 'no-store');
    const body = corrupt ? `${value}?corrupt` : value;
    return new Response(body, { headers: { 'content-type': 'text/plain' } });
  };
}

test('a stalled manifest request fails with a bounded error even when fetch never settles', async () => {
  await assert.rejects(synchronizeGameCache({
    manifestUrl: 'https://game.invalid/dev/game-assets', scopeUrl: 'https://game.invalid/dev/',
    cachesRef: new MemoryCacheStorage(), cryptoRef: webcrypto,
    fetchRef: () => new Promise(() => {}), operationTimeoutMs: 100,
  }), error => error.code === 'GAME_CACHE_TIMEOUT' && /lista de arquivos/.test(error.message));
});

test('verification reports checked file count and identifies a stalled cache entry instead of waiting at 99%', async () => {
  const cachesRef = new MemoryCacheStorage();
  const open = cachesRef.open.bind(cachesRef);
  cachesRef.open = async name => {
    const cache = await open(name), match = cache.match.bind(cache);
    if (name.startsWith(GAME_CACHE_PREFIX)) cache.match = async url => {
      if (requestUrl(url).endsWith('/small.mjs')) return new Promise(() => {});
      return match(url);
    };
    return cache;
  };
  const files = new Map([['large.mjs', 'x'.repeat(4096)], ['small.mjs', 'x']]);
  const manifest = manifestFor(files), progress = [];
  await assert.rejects(synchronizeGameCache({
    manifestUrl: 'https://game.invalid/dev/game-assets', scopeUrl: 'https://game.invalid/dev/',
    cachesRef, cryptoRef: webcrypto, fetchRef: makeFetcher(manifest, files),
    operationTimeoutMs: 100, onProgress: item => progress.push(item),
  }), error => error.code === 'GAME_CACHE_TIMEOUT' && /small.mjs/.test(error.message));
  const checked = progress.find(item => item.phase === 'verifying' && item.completed === 1);
  assert.ok(checked);
  assert.equal(checked.overallFraction, 1.5 / 2.5);
  assert.ok(!progress.some(item => item.phase === 'verifying' && item.completed === item.total),
    'a timed-out entry is not reported as checked');
  assert.equal((await cachesRef.keys()).filter(name => name.startsWith(GAME_CACHE_PREFIX)).length, 0);
});

test('progresso do cache avança por tarefas concluídas e fecha 100%', async () => {
  const scopeUrl = 'https://game.invalid/dev/';
  const files = new Map([['index.html', '<main>v1</main>'], ['main.mjs', 'export const v = 1;']]);
  const manifest = manifestFor(files);
  const progress = [];
  await synchronizeGameCache({
    manifestUrl: scopeUrl + 'game-assets', scopeUrl,
    cachesRef: new MemoryCacheStorage(), cryptoRef: webcrypto,
    fetchRef: makeFetcher(manifest, files), onProgress: item => progress.push(item),
  });
  const taskUpdates = progress.filter(item => Number.isSafeInteger(item.overallCompleted));
  assert.ok(taskUpdates.length > 0);
  assert.ok(taskUpdates.every(item => item.overallTotal === 5));
  assert.ok(taskUpdates.every((item, index) => index === 0
    || item.overallCompleted >= taskUpdates[index - 1].overallCompleted));
  assert.ok(taskUpdates.every(item => item.overallCompleted >= 0 && item.overallCompleted <= 5));
  assert.equal(taskUpdates.at(-1).overallCompleted, 5);
  assert.equal(taskUpdates.at(-1).phase, 'complete');
});

test('baixa e confere nova versão, remove cache antigo e confirma que restou somente a versão ativa', async () => {
  const scopeUrl = 'https://game.invalid/dev/';
  const cachesRef = new MemoryCacheStorage();
  const firstFiles = new Map([['index.html', '<main>v1</main>'], ['main.mjs', 'export const v = 1;']]);
  const firstManifest = manifestFor(firstFiles);
  const first = await synchronizeGameCache({
    manifestUrl: `${scopeUrl}game-assets`, scopeUrl, cachesRef, cryptoRef: webcrypto,
    fetchRef: makeFetcher(firstManifest, firstFiles),
  });
  assert.equal(first.downloadedFiles, 2);
  assert.equal(first.oldVersion, null);
  assert.deepEqual((await cachesRef.keys()).filter(name => name.startsWith(GAME_CACHE_PREFIX)).length, 1);

  const secondFiles = new Map([['index.html', '<main>v2</main>'], ['main.mjs', 'export const v = 1;']]);
  const secondManifest = manifestFor(secondFiles);
  const second = await synchronizeGameCache({
    manifestUrl: `${scopeUrl}game-assets`, scopeUrl, cachesRef, cryptoRef: webcrypto,
    fetchRef: makeFetcher(secondManifest, secondFiles),
  });
  assert.equal(second.changed, true);
  assert.equal(second.downloadedFiles, 1);
  assert.equal(second.reusedFiles, 1);
  assert.equal(second.removedCaches, 1);
  assert.deepEqual((await cachesRef.keys()).filter(name => name.startsWith(GAME_CACHE_PREFIX)).length, 1);
  const metadata = await cachesRef.open(GAME_CACHE_META);
  const state = await (await metadata.match(`${scopeUrl}${GAME_CACHE_MARKER}`)).json();
  assert.equal(state.version, secondManifest.version);
  const active = await cachesRef.open(state.cacheName);
  const currentHtml = await active.match(`${scopeUrl}index.html`);
  assert.equal(await currentHtml.text(), '<main>v2</main>');
});

test('download inválido preserva cache ativo e remove a tentativa parcial', async () => {
  const scopeUrl = 'https://game.invalid/dev/';
  const cachesRef = new MemoryCacheStorage();
  const firstFiles = new Map([['index.html', '<main>v1</main>']]);
  const firstManifest = manifestFor(firstFiles);
  await synchronizeGameCache({
    manifestUrl: `${scopeUrl}game-assets`, scopeUrl, cachesRef, cryptoRef: webcrypto,
    fetchRef: makeFetcher(firstManifest, firstFiles),
  });
  const before = await cachesRef.keys();
  const badFiles = new Map([['index.html', '<main>v2</main>']]);
  const badManifest = manifestFor(badFiles);
  await assert.rejects(synchronizeGameCache({
    manifestUrl: `${scopeUrl}game-assets`, scopeUrl, cachesRef, cryptoRef: webcrypto,
    fetchRef: makeFetcher(badManifest, badFiles, { corrupt: true }),
  }), /conferência do arquivo/u);
  assert.deepEqual(await cachesRef.keys(), before);
  const metadata = await cachesRef.open(GAME_CACHE_META);
  const state = await (await metadata.match(`${scopeUrl}${GAME_CACHE_MARKER}`)).json();
  assert.equal(state.version, firstManifest.version);
});

test('falha ao apagar cache antigo bloqueia a conclusão e mantém o pacote novo íntegro para nova tentativa', async () => {
  const scopeUrl = 'https://game.invalid/dev/';
  const cachesRef = new MemoryCacheStorage();
  const firstFiles = new Map([['index.html', '<main>v1</main>']]);
  const firstManifest = manifestFor(firstFiles);
  await synchronizeGameCache({
    manifestUrl: `${scopeUrl}game-assets`, scopeUrl, cachesRef, cryptoRef: webcrypto,
    fetchRef: makeFetcher(firstManifest, firstFiles),
  });
  const secondFiles = new Map([['index.html', '<main>v2</main>']]);
  const secondManifest = manifestFor(secondFiles);
  cachesRef.failGameCacheDelete = true;
  await assert.rejects(synchronizeGameCache({
    manifestUrl: `${scopeUrl}game-assets`, scopeUrl, cachesRef, cryptoRef: webcrypto,
    fetchRef: makeFetcher(secondManifest, secondFiles),
  }), /caches antigos do jogo ainda presentes/u);
  let metadata = await cachesRef.open(GAME_CACHE_META);
  let state = await (await metadata.match(`${scopeUrl}${GAME_CACHE_MARKER}`)).json();
  assert.equal(state.version, secondManifest.version, 'o pacote novo só ficou ativo depois da conferência íntegra');
  assert.equal((await cachesRef.open(state.cacheName)).entries.size, 1);

  cachesRef.failGameCacheDelete = false;
  const retry = await synchronizeGameCache({
    manifestUrl: `${scopeUrl}game-assets`, scopeUrl, cachesRef, cryptoRef: webcrypto,
    fetchRef: makeFetcher(secondManifest, secondFiles),
  });
  assert.equal(retry.changed, false);
  assert.equal(retry.removedCaches, 1);
  assert.deepEqual((await cachesRef.keys()).filter(name => name.startsWith(GAME_CACHE_PREFIX)).length, 1);
});
