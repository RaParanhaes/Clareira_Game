const GAME_CACHE_PREFIX = 'clareira-game-assets-v1-';
const META_CACHE = 'clareira-game-cache-metadata-v1';
const VERSION_MARKER = '__clareira_active_game_version__';
const DOWNLOAD_PARAMETER = '__clareira_download_version';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function isControlEndpoint(url, scopeUrl) {
  const relative = url.pathname.slice(scopeUrl.pathname.length);
  return relative === 'update-version' || relative === 'game-assets'
    || relative === 'health' || relative.startsWith('auth/')
    || relative === 'staff' || relative.startsWith('staff/');
}

function isUpdateCoordinator(url, scopeUrl) {
  const relative = url.pathname.slice(scopeUrl.pathname.length);
  return relative === 'bootstrap.mjs' || relative === 'cache-update.mjs';
}

async function fetchUpdateCoordinator(request, scopeUrl) {
  try {
    const response = await fetch(new Request(request, { cache: 'no-store' }));
    if (response.ok) return response;
  } catch {}

  const cacheName = await activeVersion(scopeUrl);
  if (cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
  }
  return new Response('O carregador do jogo está temporariamente indisponível.', {
    status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function activeVersion(scopeUrl) {
  const metadata = await caches.open(META_CACHE);
  const marker = await metadata.match(new URL(VERSION_MARKER, scopeUrl));
  if (!marker) return null;
  try {
    const state = await marker.json();
    return typeof state.cacheName === 'string' && state.cacheName.startsWith(GAME_CACHE_PREFIX)
      ? state.cacheName : null;
  } catch {
    return null;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;
  // Range requests must reach the media server intact; decorative video is
  // intentionally outside the verified startup package.
  if (request.destination === 'video') return;
  if (url.pathname.slice(scopeUrl.pathname.length).startsWith('__clareira_versioned_assets__/')) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }
  if (url.searchParams.has(DOWNLOAD_PARAMETER)) {
    // Preserve the version: the server serves the immutable manifest snapshot,
    // rather than a file that may have changed halfway through this download.
    event.respondWith(fetch(new Request(url, {
      method: 'GET',
      headers: request.headers,
      credentials: request.credentials,
      cache: 'no-store',
      redirect: request.redirect,
    })));
    return;
  }
  if (isControlEndpoint(url, scopeUrl)) return;
  if (isUpdateCoordinator(url, scopeUrl)) {
    event.respondWith(fetchUpdateCoordinator(request, scopeUrl));
    return;
  }

  event.respondWith((async () => {
    const cacheName = await activeVersion(scopeUrl);
    if (cacheName) {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
    }
    return fetch(request);
  })());
});
