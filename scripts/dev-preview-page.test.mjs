import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createPreviewServer } from './dev-preview-page.mjs';

const TEST_ORIGIN = 'https://test.clareira.invalid';

test('preview publishes a fresh game version without caching the response', async t => {
  const gameDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-version-game-'));
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-version-state-'));
  t.after(() => Promise.all([
    rm(gameDirectory, { recursive: true, force: true }),
    rm(stateDirectory, { recursive: true, force: true }),
  ]));
  await writeFile(path.join(gameDirectory, 'index.html'), '<main>one</main>');
  await writeFile(path.join(gameDirectory, 'main.js'), 'export const revision = 1;');
  const preview = createPreviewServer({ port: 0, gameDirectory, stateDirectory, versionCacheMs: 0 });
  const address = await preview.listen();
  t.after(() => preview.close());
  const endpoint = `http://127.0.0.1:${address.port}/update-version`;

  const firstResponse = await fetch(endpoint);
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
  const firstVersion = (await firstResponse.json()).version;
  assert.match(firstVersion, /^[a-f0-9]{64}$/u);
  const headResponse = await fetch(endpoint, { method: 'HEAD' });
  assert.equal(headResponse.status, 200);
  assert.equal(headResponse.headers.get('cache-control'), 'no-store');
  assert.equal(await headResponse.text(), '');

  await writeFile(path.join(gameDirectory, 'main.js'), 'export const revision = 2;');
  const secondVersion = (await (await fetch(endpoint)).json()).version;
  assert.notEqual(secondVersion, firstVersion, 'alterar um arquivo do jogo altera a versão observada');
});

test('preview publica manifesto de assets com hash e exclui arquivos de edição', async t => {
  const gameDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-manifest-game-'));
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-manifest-state-'));
  t.after(() => Promise.all([
    rm(gameDirectory, { recursive: true, force: true }),
    rm(stateDirectory, { recursive: true, force: true }),
  ]));
  await writeFile(path.join(gameDirectory, 'index.html'), '<main>manifesto</main>');
  await writeFile(path.join(gameDirectory, 'main.mjs'), 'export const runtime = true;');
  await writeFile(path.join(gameDirectory, 'main.test.mjs'), 'não publicar');
  const preview = createPreviewServer({ port: 0, gameDirectory, stateDirectory, versionCacheMs: 0 });
  const address = await preview.listen();
  t.after(() => preview.close());
  const base = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${base}/game-assets`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const manifest = await response.json();
  assert.match(manifest.version, /^[a-f0-9]{64}$/u);
  assert.deepEqual(manifest.files.map(file => file.path), ['index.html', 'main.mjs']);
  assert.equal(manifest.files[1].sha256, createHash('sha256').update('export const runtime = true;').digest('hex'));
  const head = await fetch(`${base}/game-assets`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('versioned downloads keep the manifest bytes when the preview changes during loading', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clareira-pinned-assets-'));
  const gameDirectory = path.join(root, 'game');
  await (await import('node:fs/promises')).mkdir(gameDirectory);
  await writeFile(path.join(gameDirectory, 'main.js'), 'export const version = 1;');
  const preview = createPreviewServer({ port: 0, gameDirectory, stateDirectory: path.join(root, 'state'), versionCacheMs: 0 });
  const address = await preview.listen(), base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await preview.close(); await rm(root, { recursive: true, force: true }); });
  const first = await (await fetch(base + '/game-assets')).json();
  await writeFile(path.join(gameDirectory, 'main.js'), 'export const version = 222;');
  const second = await (await fetch(base + '/game-assets')).json();
  assert.notEqual(first.version, second.version);
  for (const manifest of [first, second]) {
    const response = await fetch(`${base}/__clareira_versioned_assets__/${manifest.version}/main.js`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-clareira-asset-version'), manifest.version);
    assert.equal(bytes.length, manifest.files[0].size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files[0].sha256);
  }
  const legacyResponse = await fetch(`${base}/main.js?__clareira_download_version=${first.version}`);
  assert.equal(await legacyResponse.text(), 'export const version = 1;');
  assert.equal((await fetch(`${base}/main.js?__clareira_download_version=${'0'.repeat(64)}`)).status, 409);
  assert.equal(await (await fetch(base + '/main.js')).text(), 'export const version = 222;');
});

test('preview creates accounts, uses protected cookies, updates usernames, and revokes logout sessions', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const preview = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  const address = await preview.listen();
  t.after(() => preview.close());
  const base = `http://127.0.0.1:${address.port}`;

  const wrongOrigin = await fetch(`${base}/auth/guest`, {
    method: 'POST', headers: { origin: 'https://elsewhere.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Pessoa' }),
  });
  assert.equal(wrongOrigin.status, 403);

  const registration = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'conta_teste', password: 'senha-de-teste-123' }),
  });
  assert.equal(registration.status, 201);
  const cookieHeader = registration.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /Secure/);
  assert.match(cookieHeader, /SameSite=Strict/);
  assert.match(cookieHeader, /Path=\/dev/);
  const cookie = cookieHeader.split(';')[0];
  const created = await registration.json();
  assert.equal(created.profile.guest, false);
  assert.equal(created.profile.username, 'conta_teste');
  assert.equal(Object.hasOwn(created.profile, 'displayName'), false);

  const duplicate = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'CONTA_TESTE', password: 'senha-de-teste-123' }),
  });
  assert.equal(duplicate.status, 409);
  const obscene = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'putaria', password: 'senha-de-teste-123' }),
  });
  assert.equal(obscene.status, 400);

  const me = await fetch(`${base}/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).profile.username, 'conta_teste');

  const rename = await fetch(`${base}/auth/username`, {
    method: 'POST', headers: { cookie, origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nova_pessoa' }),
  });
  assert.equal(rename.status, 200);
  assert.equal((await rename.json()).profile.username, 'nova_pessoa');

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'NOVA_PESSOA', password: 'senha-de-teste-123' }),
  });
  assert.equal(login.status, 200);
  const loginCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(`${base}/auth/me`, { headers: { cookie: loginCookie } })).json()).profile.username, 'nova_pessoa');
  const oldLogin = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'conta_teste', password: 'senha-de-teste-123' }),
  });
  assert.equal(oldLogin.status, 401);

  const logout = await fetch(`${base}/auth/logout`, {
    method: 'POST', headers: { cookie, origin: TEST_ORIGIN, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(logout.status, 200);
  const expired = await fetch(`${base}/auth/me`, { headers: { cookie } });
  assert.equal(expired.status, 401);
});

test('preview delivers the berry offer feedback module', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-share-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const preview = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  const address = await preview.listen();
  t.after(() => preview.close());
  const response = await fetch(`http://127.0.0.1:${address.port}/share-feedback.mjs`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(await response.text(), /getBerryOfferFrame/);
});

test('preview login keeps its full-screen image outside the verified startup manifest', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-assets-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const preview = createPreviewServer({ port: 0, stateDirectory, allowedOrigin: TEST_ORIGIN });
  const address = await preview.listen();
  t.after(() => preview.close());
  const base = `http://127.0.0.1:${address.port}`;

  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<img class="auth-illustration-image" src="\/dev\/art\/clareira-login-poster-v5\.webp"[^>]*fetchpriority="low" loading="eager"/);
  const decorativeVideo = html.match(/<video\b[^>]*id="auth-scene-video"[^>]*>/)?.[0];
  assert.ok(decorativeVideo, 'login keeps its requested animated scene');
  assert.match(decorativeVideo, /muted loop playsinline preload="none"/);
  assert.doesNotMatch(decorativeVideo, /\ssrc=/, 'video waits until the form is interactive');
  assert.doesNotMatch(html, /auth-world-motion|auth-environment|field-rabbit|sky-dragon/);
  const motionStyles = await fetch(`${base}/style.css`);
  assert.equal(motionStyles.status, 200);
  const motionCss = await motionStyles.text();
  assert.match(motionCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(motionCss, /\.auth-stage\{[^}]*background:radial-gradient/);
  assert.match(motionCss, /\.auth-illustration-image\{position:absolute/);
  assert.doesNotMatch(motionCss, /auth-world-motion|auth-environment|@keyframes rabbit-visits-bridge/);
  const gameScript = await fetch(`${base}/main.js`);
  const gameSource = await gameScript.text();
  assert.match(gameSource, /document\.addEventListener\('visibilitychange'/);
  assert.doesNotMatch(gameSource, /authWorldMotion|has-music|auth-world-motion/);
  const gameModules = [...gameSource.matchAll(/from\s+['"]\.\/([^'"]+\.mjs)['"]/g)].map((match) => match[1]);
  assert.ok(gameModules.length > 0, 'the browser client should import its game modules');
  for (const modulePath of gameModules) {
    const moduleResponse = await fetch(`${base}/${modulePath}`);
    assert.equal(moduleResponse.status, 200, `${modulePath} must load in the browser module graph`);
    assert.match(moduleResponse.headers.get('content-type'), /javascript/);
  }
  const localMainSource = await readFile(new URL('../game/main.js', import.meta.url), 'utf8');
  const localModules = [...localMainSource.matchAll(/from\s+['"]\.\/([^'"]+\.mjs)['"]/g)].map((match) => match[1]);
  for (const modulePath of localModules) {
    const moduleStat = await stat(new URL(`../game/${modulePath}`, import.meta.url));
    assert.ok(moduleStat.mode & 0o004, `${modulePath} must be readable by the www-data preview service`);
  }
  assert.equal((html.match(/class="(?:brand auth-brand|brand)" href="\/dev\/"/g) || []).length, 2);

  const avatar = await fetch(`${base}/avatar.mjs`);
  assert.equal(avatar.status, 200);
  assert.match(avatar.headers.get('content-type'), /javascript/);
  assert.match(await avatar.text(), /getFacingFromVector/);

  for (const [asset, expectedType, expectedStatus] of [
    ['/art/clareira-login-vila-v1.webp', 'image/webp', 200],
    ['/art/clareira-campfire-v1.webp', 'image/webp', 200],
  ]) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, expectedStatus);
    if (expectedStatus === 404) continue;
    assert.equal(response.headers.get('content-type'), expectedType);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    if (asset.endsWith('.webp')) assert.ok((await response.arrayBuffer()).byteLength <= 600_000, 'the entry poster should stay below its 600 KB transfer budget');
  }
});

test('decorative login video supports byte ranges and stays outside startup verification', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-media-'));
  const gameDirectory = path.join(root, 'game');
  await (await import('node:fs/promises')).mkdir(path.join(gameDirectory, 'art'), { recursive: true });
  await writeFile(path.join(gameDirectory, 'index.html'), '<main>video</main>');
  const media = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
  await writeFile(path.join(gameDirectory, 'art/clareira-login-loop-v5.mp4'), media);
  const preview = createPreviewServer({ port: 0, gameDirectory, stateDirectory: path.join(root, 'state') });
  const address = await preview.listen();
  t.after(async () => { await preview.close(); await rm(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${address.port}`;
  const url = `${base}/art/clareira-login-loop-v5.mp4`;
  const full = await fetch(url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), media);
  const partial = await fetch(url, { headers: { Range: 'bytes=4-9' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), `bytes 4-9/${media.length}`);
  assert.equal(partial.headers.get('content-length'), '6');
  assert.equal(await partial.text(), '456789');
  const suffix = await fetch(url, { headers: { Range: 'bytes=-3' } });
  assert.equal(suffix.status, 206);
  assert.equal(await suffix.text(), 'xyz');
  const head = await fetch(url, { method: 'HEAD', headers: { Range: 'bytes=0-1' } });
  assert.equal(head.status, 206);
  assert.equal(head.headers.get('content-length'), '2');
  assert.equal(await head.text(), '');
  const invalid = await fetch(url, { headers: { Range: 'bytes=999-' } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('content-range'), `bytes */${media.length}`);
  const manifest = await (await fetch(`${base}/game-assets`)).json();
  assert.ok(manifest.files.every(file => !file.path.endsWith('.mp4')));
});
