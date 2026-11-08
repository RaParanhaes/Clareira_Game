export const GAME_CACHE_PREFIX = 'clareira-game-assets-v1-';
export const GAME_CACHE_META = 'clareira-game-cache-metadata-v1';
export const GAME_CACHE_MARKER = '__clareira_active_game_version__';
const VERSIONED_ASSETS_PATH = '__clareira_versioned_assets__/';
const MAX_MANIFEST_FILES = 5_000;
const MAX_MANIFEST_BYTES = 128 * 1024 * 1024;

async function withInactivityTimeout(work, timeoutMs, label, abort = () => {}) {
  let timer, touch;
  const timeout = new Promise((_, reject) => {
    touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        abort();
        reject(Object.assign(new Error(`Sem resposta ao ${label}. Tente novamente.`), { code: 'GAME_CACHE_TIMEOUT' }));
      }, timeoutMs);
    };
    touch();
  });
  try { return await Promise.race([Promise.resolve().then(() => work(touch)), timeout]); }
  finally { clearTimeout(timer); }
}

function normalizeScope(scopeUrl) {
  const scope = new URL(scopeUrl);
  if (!scope.pathname.endsWith('/')) scope.pathname += '/';
  return scope;
}

function urlForPath(path, scope) {
  const encoded = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const url = new URL(encoded, scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) {
    throw new Error('O manifesto contém um caminho fora do jogo.');
  }
  return url;
}

async function validateManifest(value, cryptoRef) {
  if (!value || typeof value !== 'object' || !/^[a-f0-9]{64}$/u.test(value.version)
      || !Array.isArray(value.files) || value.files.length > MAX_MANIFEST_FILES) {
    throw new Error('A lista de arquivos da atualização é inválida.');
  }
  const seen = new Set();
  let totalBytes = 0;
  const files = value.files.map(file => {
    if (!file || typeof file.path !== 'string' || !file.path || file.path.startsWith('/')
        || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..')
        || !Number.isSafeInteger(file.size) || file.size < 0
        || !/^[a-f0-9]{64}$/u.test(file.sha256) || seen.has(file.path)) {
      throw new Error('A lista da atualização contém um arquivo inválido.');
    }
    seen.add(file.path);
    totalBytes += file.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_MANIFEST_BYTES) {
      throw new Error('O pacote da atualização excede o limite permitido.');
    }
    return { path: file.path, size: file.size, sha256: file.sha256 };
  });
  const canonicalFiles = files
    .map(file => [file.path, file.size, file.sha256])
    .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
  const expectedVersion = await sha256Hex(new TextEncoder().encode(JSON.stringify(canonicalFiles)), cryptoRef);
  if (value.version !== expectedVersion) {
    throw new Error('A versão informada não corresponde aos hashes do manifesto.');
  }
  return { version: value.version, files, totalBytes };
}

async function sha256Hex(bytes, cryptoRef) {
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function readResponseWithProgress(response, onBytes) {
  if (!response.body?.getReader) {
    const bytes = await response.arrayBuffer();
    onBytes(bytes.byteLength);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
    onBytes(value.byteLength);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function readCacheState(cachesRef, scope) {
  const metadata = await cachesRef.open(GAME_CACHE_META);
  const response = await metadata.match(new URL(GAME_CACHE_MARKER, scope));
  if (!response) return null;
  try {
    const value = await response.json();
    if (value && typeof value.version === 'string' && /^[a-f0-9]{64}$/u.test(value.version)
        && typeof value.cacheName === 'string' && value.cacheName.startsWith(GAME_CACHE_PREFIX)) return value;
  } catch {}
  throw new Error('Não foi possível conferir a versão ativa do cache local.');
}

async function verifyCachedFile(cache, assetUrl, file, cryptoRef, timeoutMs, includeResponse = true) {
  return withInactivityTimeout(async () => {
    const response = await cache.match(assetUrl);
    if (!response) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== file.size || await sha256Hex(bytes, cryptoRef) !== file.sha256) return null;
    return includeResponse ? new Response(bytes, { status: 200, headers: response.headers }) : true;
  }, timeoutMs, `conferir ${file.path}`);
}

function randomCacheName(version, cryptoRef) {
  const token = typeof cryptoRef.randomUUID === 'function'
    ? cryptoRef.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${GAME_CACHE_PREFIX}${version}-${token}`;
}

export async function synchronizeGameCache({
  manifestUrl,
  scopeUrl,
  cachesRef = globalThis.caches,
  cryptoRef = globalThis.crypto,
  fetchRef = globalThis.fetch,
  responseFactory = (body, init) => new Response(body, init),
  onProgress = () => {},
  getDownloadConcurrency = () => 16,
  operationTimeoutMs = 30_000,
} = {}) {
  if (!manifestUrl || !scopeUrl || !cachesRef?.open || !cachesRef?.keys || !cryptoRef?.subtle
      || typeof fetchRef !== 'function') throw new Error('O navegador não oferece atualização segura dos arquivos.');
  const scope = normalizeScope(scopeUrl);
  if (!Number.isFinite(operationTimeoutMs) || operationTimeoutMs <= 0) throw new TypeError('Prazo de carregamento inválido.');
  const cacheOperation = (work, label) => withInactivityTimeout(work, operationTimeoutMs, label);
  onProgress({ phase: 'manifest', completed: 0, total: 0, doneBytes: 0, totalBytes: 0 });
  const manifestController = new AbortController();
  const manifestValue = await withInactivityTimeout(async () => {
    const manifestResponse = await fetchRef(manifestUrl, { cache: 'no-store', credentials: 'same-origin', signal: manifestController.signal });
    if (!manifestResponse.ok) throw new Error(`Não consegui consultar os arquivos da atualização (${manifestResponse.status}).`);
    return manifestResponse.json();
  }, operationTimeoutMs, 'consultar a lista de arquivos', () => manifestController.abort());
  const manifest = await cacheOperation(() => validateManifest(manifestValue, cryptoRef), 'validar a lista de arquivos');
  const oldState = await withInactivityTimeout(() => readCacheState(cachesRef, scope), operationTimeoutMs, 'ler a versão do cache');
  const oldCache = oldState ? await cacheOperation(() => cachesRef.open(oldState.cacheName), 'abrir o cache anterior') : null;
  const fileTaskCount = manifest.files.length;
  const fileTaskPhases = oldCache ? 3 : 2;
  const overallTaskTotal = fileTaskCount * fileTaskPhases + 1;
  const activationWork = fileTaskCount > 0 ? 1 / fileTaskCount : 0;
  const overallWorkTotal = fileTaskPhases + activationWork;
  const reportCacheProgress = (phase, details) => {
    const phaseOffset = phase === "checking-cache" ? 0
      : phase === "downloading" ? (oldCache ? fileTaskCount : 0)
        : phase === "verifying" ? fileTaskCount * (oldCache ? 2 : 1)
          : overallTaskTotal - 1;
    const phaseCompleted = Number(details.completed);
    const completedInPhase = Number.isSafeInteger(phaseCompleted)
      ? Math.max(0, Math.min(fileTaskCount, phaseCompleted)) : 0;
    const overallCompleted = phase === "complete" ? overallTaskTotal
      : phase === "activating" ? overallTaskTotal - 1
        : phaseOffset + completedInPhase;
    const byteFraction = phase !== 'downloading' ? completedInPhase / Math.max(1, fileTaskCount)
      : manifest.totalBytes > 0
      ? Math.max(0, Math.min(1, (Number(details.doneBytes) || 0) / manifest.totalBytes))
      : (Number(details.completed) || 0) / Math.max(1, fileTaskCount);
    const bytePhaseOffset = phase === "checking-cache" ? 0
      : phase === "downloading" ? (oldCache ? 1 : 0)
        : phase === "verifying" ? (oldCache ? 2 : 1)
          : fileTaskPhases;
    const overallFraction = phase === "complete" ? 1
      : phase === "activating" ? fileTaskPhases / overallWorkTotal
        : Math.max(0, Math.min(1, (bytePhaseOffset + byteFraction) / overallWorkTotal));
    onProgress({ ...details, phase, overallCompleted, overallTotal: overallTaskTotal, overallFraction });
  };
  const targetMatches = oldState?.version === manifest.version && oldCache
    ? await verifyWholeCache(oldCache, manifest, scope, cryptoRef, progress => reportCacheProgress('checking-cache', progress), 'checking-cache', operationTimeoutMs)
    : false;

  if (targetMatches) {
    const removedCaches = await cacheOperation(() => removeStaleCaches(cachesRef, oldState.cacheName), 'limpar o cache anterior');
    await cacheOperation(() => verifyActiveState(cachesRef, scope, oldState), 'confirmar a versão ativa');
    reportCacheProgress('complete', { completed: manifest.files.length, total: manifest.files.length,
      doneBytes: manifest.totalBytes, totalBytes: manifest.totalBytes });
    return { version: manifest.version, oldVersion: oldState.version, changed: false,
      downloadedFiles: 0, reusedFiles: manifest.files.length, removedCaches };
  }

  const cacheName = randomCacheName(manifest.version, cryptoRef);
  const nextCache = await cacheOperation(() => cachesRef.open(cacheName), 'abrir o novo cache');
  let downloadedFiles = 0, reusedFiles = 0, doneBytes = 0, transferBytes = 0;
  let activated = false;
  try {
    // Start requests in descending size order. Capacity can change while the
    // load is active, so later files pause when other players begin loading.
    const transferFiles = [...manifest.files].sort((left, right) => right.size - left.size);
    let nextIndex = 0, completed = 0, failure = null, activeTransfers = 0;
    const transferFile = async file => {
      const assetUrl = urlForPath(file.path, scope);
      let verified = null;
      if (oldCache) {
        try { verified = await verifyCachedFile(oldCache, assetUrl, file, cryptoRef, operationTimeoutMs); }
        catch { verified = null; }
      }
      if (verified) reusedFiles += 1;
      else {
        // A path also works with older installed workers which remove the
        // legacy query parameter before forwarding requests to the server.
        const downloadPath = file.path.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const downloadUrl = new URL(`${VERSIONED_ASSETS_PATH}${manifest.version}/${downloadPath}`, scope);
        const controller = new AbortController();
        let response;
        const bytes = await withInactivityTimeout(async touch => {
          response = await fetchRef(downloadUrl, {
            cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Download falhou para ${file.path} (${response.status}).`);
          return readResponseWithProgress(response, byteCount => {
            touch();
            transferBytes += byteCount;
            reportCacheProgress('downloading', { completed, total: manifest.files.length,
              doneBytes: doneBytes + transferBytes, totalBytes: manifest.totalBytes,
              downloadedFiles, reusedFiles });
          });
        }, operationTimeoutMs, `baixar ${file.path}`, () => controller.abort());
        if (bytes.byteLength !== file.size || await cacheOperation(() => sha256Hex(bytes, cryptoRef), `validar ${file.path}`) !== file.sha256) {
          throw new Error(`A conferência do arquivo ${file.path} falhou.`);
        }
        transferBytes -= file.size;
        verified = responseFactory(bytes, { status: 200, headers: response.headers });
        downloadedFiles += 1;
      }
      await withInactivityTimeout(() => nextCache.put(assetUrl, verified.clone()), operationTimeoutMs, `salvar ${file.path}`);
      completed += 1;
      doneBytes += file.size;
      reportCacheProgress('downloading', { completed, total: manifest.files.length,
        doneBytes, totalBytes: manifest.totalBytes, downloadedFiles, reusedFiles });
    };
    const transferWorker = async () => {
      while (!failure) {
        const requestedLimit = Number(getDownloadConcurrency());
        const concurrencyLimit = Number.isInteger(requestedLimit)
          ? Math.max(1, Math.min(24, requestedLimit)) : 16;
        if (activeTransfers >= concurrencyLimit) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        const index = nextIndex++;
        if (index >= transferFiles.length) return;
        activeTransfers += 1;
        try { await transferFile(transferFiles[index]); }
        catch (error) { failure ||= error; }
        finally { activeTransfers -= 1; }
      }
    };
    const workerCount = Math.min(24, manifest.files.length);
    await Promise.all(Array.from({ length: workerCount }, () => transferWorker()));
    if (failure) throw failure;

    if (!await verifyWholeCache(nextCache, manifest, scope, cryptoRef, progress => reportCacheProgress('verifying', progress), 'verifying', operationTimeoutMs)) {
      throw new Error('A conferência final dos arquivos baixados falhou.');
    }

    const newState = { version: manifest.version, cacheName };
    reportCacheProgress('activating', { completed: manifest.files.length, total: manifest.files.length,
      doneBytes: manifest.totalBytes, totalBytes: manifest.totalBytes, downloadedFiles, reusedFiles });
    const metadata = await cacheOperation(() => cachesRef.open(GAME_CACHE_META), 'abrir a versão ativa');
    await cacheOperation(() => metadata.put(new URL(GAME_CACHE_MARKER, scope), responseFactory(JSON.stringify(newState), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })), 'ativar a versão conferida');
    activated = true;
    await cacheOperation(() => verifyActiveState(cachesRef, scope, newState), 'confirmar a versão ativa');
    const removedCaches = await cacheOperation(() => removeStaleCaches(cachesRef, cacheName), 'limpar o cache anterior');
    await cacheOperation(() => verifyOnlyActiveCache(cachesRef, cacheName), 'conferir a limpeza do cache');
    reportCacheProgress('complete', { completed: manifest.files.length, total: manifest.files.length,
      doneBytes: manifest.totalBytes, totalBytes: manifest.totalBytes, downloadedFiles, reusedFiles,
      removedCaches });
    return { version: manifest.version, oldVersion: oldState?.version || null,
      changed: oldState?.version !== manifest.version, downloadedFiles, reusedFiles, removedCaches };
  } catch (error) {
    if (!activated) await cacheOperation(() => cachesRef.delete(cacheName), 'remover o download incompleto');
    throw error;
  }
}

async function verifyWholeCache(cache, manifest, scope, cryptoRef, onProgress, phase = 'verifying', timeoutMs = 30_000) {
  let valid = true, nextIndex = 0, completed = 0, doneBytes = 0, failure = null;
  const expected = new Set();
  for (const file of manifest.files) expected.add(urlForPath(file.path, scope).href);
  const verifyWorker = async () => {
    while (!failure) {
      const index = nextIndex++;
      if (index >= manifest.files.length) return;
      const file = manifest.files[index];
      const url = urlForPath(file.path, scope);
      let checked = true;
      try {
        if (!await verifyCachedFile(cache, url, file, cryptoRef, timeoutMs, false)) valid = false;
      } catch (error) {
        if (error.code === 'GAME_CACHE_TIMEOUT') { failure ||= error; checked = false; }
        valid = false;
      }
      if (!checked) return;
      completed += 1;
      doneBytes += file.size;
      onProgress({ phase, completed, total: manifest.files.length,
        doneBytes, totalBytes: manifest.totalBytes });
    }
  };
  await Promise.all(Array.from({ length: Math.min(24, manifest.files.length) }, () => verifyWorker()));
  if (failure) throw failure;
  const entries = await withInactivityTimeout(() => cache.keys(), timeoutMs, 'conferir a lista do cache');
  if (entries.length !== expected.size || entries.some(entry => !expected.has(entry.url))) valid = false;
  return valid;
}

async function verifyActiveState(cachesRef, scope, expected) {
  const metadata = await cachesRef.open(GAME_CACHE_META);
  const response = await metadata.match(new URL(GAME_CACHE_MARKER, scope));
  if (!response) throw new Error('Não foi possível confirmar a nova versão ativa.');
  const actual = await response.json();
  if (actual.version !== expected.version || actual.cacheName !== expected.cacheName) {
    throw new Error('A versão ativa do cache não corresponde ao download conferido.');
  }
}

async function removeStaleCaches(cachesRef, activeCacheName) {
  const stale = (await cachesRef.keys()).filter(name => name.startsWith(GAME_CACHE_PREFIX) && name !== activeCacheName);
  for (const name of stale) {
    await cachesRef.delete(name);
  }
  const remaining = (await cachesRef.keys()).filter(name => name.startsWith(GAME_CACHE_PREFIX) && name !== activeCacheName);
  if (remaining.length) throw new Error('A conferência encontrou caches antigos do jogo ainda presentes.');
  return stale.length;
}

async function verifyOnlyActiveCache(cachesRef, activeCacheName) {
  const remaining = (await cachesRef.keys()).filter(name => name.startsWith(GAME_CACHE_PREFIX));
  if (remaining.length !== 1 || remaining[0] !== activeCacheName) {
    throw new Error('A limpeza do cache antigo não foi confirmada.');
  }
}
