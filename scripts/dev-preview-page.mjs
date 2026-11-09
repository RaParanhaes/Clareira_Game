import { loadBackendConfig } from '../database/runtime-config.mjs';
import { createSkyOverrideCache, skyOverridesFileIn } from '../game/sky-overrides-store.mjs';
import { createOverride } from '../game/world-overrides.mjs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCookies } from './account-store.mjs';
import { createGameVersionReader } from './game-version.mjs';
import { createGameAssetSnapshot, isRuntimeGameAsset, isServableGameAsset } from './game-asset-manifest.mjs';
import { createGameAssetSnapshotStore } from './game-asset-snapshots.mjs';
import { createStorageAdapter } from '../database/storage.mjs';
import { createDownloadCapacityManager } from './download-capacity.mjs';
import { MAX_WALLET_VALUE } from '../game/lodging-catalog.mjs';
import { applyWorldDefinition, getSolidTreesInBounds, getWorldMapOverview, WORLD_SIZE } from '../game/world.mjs';
import { buildWorldMapDetailFeatures } from '../game/initial-forest-map-features.mjs';
import { normalizeWorldDefinition } from '../game/world-edits.mjs';
import { planStaffTreeChanges } from '../game/world-staff-trees.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GAME_DIRECTORY = path.resolve(here, '..', 'game');
const DEFAULT_STATE_DIRECTORY = path.join(os.tmpdir(), 'clareira-dev');
const DEFAULT_ALLOWED_ORIGIN = 'https://vmi3579939.contaboserver.net';
const maximumBodyBytes = 8 * 1024;
const WORLD_MAP_SIZE = 10000;
const WORLD_TREE_LIST_LIMIT = 1500;
function parseWorldDimension(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-z0-9_-]{1,40}$/i.test(id)) throw Object.assign(new Error('Dimensão inválida.'), { status: 400 });
  return id;
}
function parseTreeBounds(params) {
  const read = (name, fallback) => {
    const raw = params.get(name);
    if (raw === null || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > WORLD_MAP_SIZE) throw Object.assign(new Error('Área do mapa inválida.'), { status: 400 });
    return value;
  };
  const bounds = { left: read('left', 0), top: read('top', 0), right: read('right', WORLD_MAP_SIZE), bottom: read('bottom', WORLD_MAP_SIZE) };
  if (bounds.left >= bounds.right || bounds.top >= bounds.bottom) throw Object.assign(new Error('Área do mapa inválida.'), { status: 400 });
  return bounds;
}
const authAttempts = new Map();
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.ico', 'image/x-icon'],
  ['.mp3', 'audio/mpeg'], ['.ogg', 'audio/ogg'], ['.wav', 'audio/wav'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
  ['.mp4', 'video/mp4'],
]);
const HOUSEKEEPING_CAPABILITIES = Object.freeze({
  manageRoles: 'roles.manage', delegatePermissions: 'permissions.delegate', readAudit: 'audit.read',
  readReports: 'reports.read', manageReports: 'reports.manage', readPlayers: 'players.read',
  warnPlayers: 'players.warn', mutePlayers: 'players.mute', kickPlayers: 'players.kick',
  suspendPlayers: 'players.suspend', banPlayers: 'players.ban.permanent', revokeSanctions: 'players.sanction.revoke',
  adjustEconomy: 'economy.adjust', inspectPlayers: 'players.state.repair', operateWorld: 'world.operate',
  // Only the owner holds the '*' permission, so only the owner sees the sky tools.
  setSky: '*',
});

async function resolveHousekeepingCapabilities(staff, accountId) {
  const entries = await Promise.all(Object.entries(HOUSEKEEPING_CAPABILITIES).map(async ([key, permission]) =>
    [key, await staff.authorization.hasPermission(accountId, permission)]));
  return Object.fromEntries(entries);
}

async function hasHousekeepingAccess(staff, accountId) {
  const capabilities = await resolveHousekeepingCapabilities(staff, accountId);
  return Object.values(capabilities).some(Boolean);
}

function staticEntityTag(metadata) {
  return `W/"${metadata.size.toString(16)}-${metadata.mtimeNs.toString(16)}-${metadata.ctimeNs.toString(16)}"`;
}

function matchesStaticValidator(request, metadata, entityTag) {
  const ifNoneMatch = request.headers['if-none-match'];
  if (typeof ifNoneMatch === 'string') {
    const weakValue = value => value.trim().replace(/^W\//u, '');
    const expected = weakValue(entityTag);
    return ifNoneMatch.split(',').some(value => value.trim() === '*' || weakValue(value) === expected);
  }

  const ifModifiedSince = Date.parse(request.headers['if-modified-since'] || '');
  if (!Number.isFinite(ifModifiedSince)) return false;
  const modifiedAtMs = Number(metadata.mtimeNs / 1_000_000n);
  return Math.floor(modifiedAtMs / 1000) * 1000 <= ifModifiedSince;
}

function securityHeaders() {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'sha256-YUHv8rVFryIyJfa0aqYCJoEeXQjriH3yQMxqzL+QTGo='; connect-src 'self' wss:; img-src 'self' data:; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  };
}

function send(response, status, body = '', type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { ...securityHeaders(), 'content-type': type });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw Object.assign(new Error('Envie os dados em formato JSON.'), { status: 415 });
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBodyBytes) throw Object.assign(new Error('Dados muito grandes.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Dados inválidos.'), { status: 400 }); }
}

function setSessionCookie(response, token, maxAge) {
  response.setHeader('set-cookie', `clareira_session=${token}; Path=/dev; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(maxAge / 1000)}`);
}

function clearSessionCookie(response) {
  response.setHeader('set-cookie', 'clareira_session=; Path=/dev; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}

function clientAddress(request) {
  return (request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function consumeLimit(request, bucket, maximum, periodMs) {
  const now = Date.now();
  const key = `${bucket}:${clientAddress(request)}`;
  const recent = (authAttempts.get(key) || []).filter(timestamp => now - timestamp < periodMs);
  if (recent.length >= maximum) { authAttempts.set(key, recent); return false; }
  recent.push(now);
  authAttempts.set(key, recent);
  if (authAttempts.size > 2000) {
    for (const [entryKey, timestamps] of authAttempts) {
      if (!timestamps.some(timestamp => now - timestamp < 60 * 60 * 1000)) authAttempts.delete(entryKey);
    }
  }
  return true;
}

export function createPreviewServer({
  host = '127.0.0.1',
  port = 8100,
  gameDirectory = DEFAULT_GAME_DIRECTORY,
  stateDirectory = process.env.STATE_DIRECTORY || DEFAULT_STATE_DIRECTORY,
  allowedOrigin = DEFAULT_ALLOWED_ORIGIN,
  databaseUrl = process.env.DATABASE_URL,
  versionCacheMs = 1_000,
  storageAdapter = null,
} = {}) {
  const gameRoot = path.resolve(gameDirectory);
  const stateRoot = path.resolve(stateDirectory);
  const skyOverrideStore = createSkyOverrideCache(skyOverridesFileIn(stateDirectory, path));
  let canonicalGameRoot = null;
  const storage = storageAdapter || createStorageAdapter({ directory: stateRoot, databaseUrl });
  let appliedTreeWorldKey = "";
  const accounts = storage.accounts;
  const gameVersion = createGameVersionReader(gameRoot, { cacheMs: versionCacheMs });
  let cachedGameAssetManifest = null;
  let cachedGameAssetFingerprint = null;
  let pendingGameAssetManifest = null;
  const assetSnapshots = createGameAssetSnapshotStore();
  const downloadCapacity = createDownloadCapacityManager();

  async function readGameAssetManifest() {
    if (pendingGameAssetManifest) return pendingGameAssetManifest;
    pendingGameAssetManifest = (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const observed = await gameVersion.readVersion();
        if (cachedGameAssetManifest && cachedGameAssetFingerprint === observed) return cachedGameAssetManifest;
        const before = await gameVersion.readVersionFresh();
        if (cachedGameAssetManifest && cachedGameAssetFingerprint === before) return cachedGameAssetManifest;
        const snapshot = await createGameAssetSnapshot(gameRoot);
        const candidate = snapshot.manifest;
        const after = await gameVersion.readVersionFresh();
        if (before === after) {
          assetSnapshots.add(snapshot);
          cachedGameAssetManifest = candidate;
          cachedGameAssetFingerprint = after;
          return candidate;
        }
      }
      return null;
    })().finally(() => { pendingGameAssetManifest = null; });
    return pendingGameAssetManifest;
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/health') return send(response, 200, 'ok');
      if (url.pathname === '/update-version') {
        if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, 'Method not allowed');
        const manifest = await readGameAssetManifest();
        if (!manifest) return sendJson(response, 503, { error: 'A versão do jogo está sendo atualizada. Tente novamente.' });
        const body = JSON.stringify({ version: manifest.version });
        response.writeHead(200, { ...securityHeaders(), 'content-type': 'application/json; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }
      if (url.pathname === '/game-assets') {
        if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, 'Method not allowed');
        const manifest = await readGameAssetManifest();
        if (!manifest) return sendJson(response, 503, { error: 'A versão do jogo está sendo atualizada. Tente novamente.' });
        const body = JSON.stringify(manifest);
        response.writeHead(200, { ...securityHeaders(), 'content-type': 'application/json; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }
      if (url.pathname === '/loading-diagnostics') {
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Método não permitido.' });
        if (request.headers.origin !== allowedOrigin) return sendJson(response, 403, { error: 'Origem não permitida.' });
        if (!consumeLimit(request, 'loading-diagnostics', 20, 60 * 1000)) return sendJson(response, 429, { error: 'Aguarde antes de enviar outro diagnóstico.' });
        const payload = await readJson(request);
        const phases = new Set(['manifest','checking-cache','downloading','verifying','activating','files','session','character','scene','world','unknown']);
        const reasons = new Set(['timeout','offline','integrity','network','session','scene','unknown']);
        if (!payload || !Array.isArray(payload.events) || payload.events.length < 1 || payload.events.length > 8) return sendJson(response, 400, { error: 'Diagnóstico inválido.' });
        const events = payload.events.map(event => {
          if (!event || !phases.has(event.phase) || !reasons.has(event.reason) || !Number.isFinite(event.elapsedMs) || !Number.isFinite(event.percent)) return null;
          return { phase: event.phase, reason: event.reason, elapsedMs: Math.max(0, Math.min(86400000, Math.round(event.elapsedMs))), percent: Math.max(0, Math.min(100, Math.round(event.percent * 10) / 10)) };
        });
        if (events.some(event => !event)) return sendJson(response, 400, { error: 'Diagnóstico inválido.' });
        process.stderr.write(JSON.stringify({ type: 'loading-diagnostic', receivedAt: new Date().toISOString(), events }) + '\n');
        return sendJson(response, 200, { accepted: true });
      }
      if (url.pathname === '/download-capacity') {
        if (request.method !== 'POST') return send(response, 405, 'Method not allowed');
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) return sendJson(response, 403, { error: 'Origem não permitida.' });
        const payload = await readJson(request);
        if (!['start', 'heartbeat', 'release'].includes(payload?.action)) return sendJson(response, 400, { error: 'Ação de download inválida.' });
        const result = downloadCapacity.update({ id: payload.id, action: payload.action });
        if (!result.ok) return sendJson(response, 400, { error: 'Identificador de download inválido.' });
        response.writeHead(200, { ...securityHeaders(), 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(result));
        return;
      }
      const cookies = parseCookies(request.headers.cookie);
      const token = cookies.get('clareira_session');

      if (url.pathname === '/staff' || url.pathname === '/staff/'
          || url.pathname === '/staff-panel.mjs' || url.pathname === '/staff-panel.css') {
        if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, 'Method not allowed');
        const staff = storage.staffManagement;
        if (!staff) return sendJson(response, 503, { error: 'As operações de staff exigem o PostgreSQL.' });
        const current = await accounts.getSession(token);
        if (!current || current.profile.guest) return sendJson(response, 401, { error: 'Entre com uma conta para acessar as ferramentas da equipe.' });
        if (!await hasHousekeepingAccess(staff, current.profile.id)) {
          return sendJson(response, 403, { error: 'Você não tem permissão para acessar o Housekeeping.' });
        }
        if (url.pathname === '/staff/') {
          // Normalize the URL before the browser resolves the panel's relative
          // stylesheet, script and "back to game" link.
          response.writeHead(308, { ...securityHeaders(), location: `../staff${url.search}` });
          response.end();
          return;
        }
        const assetName = url.pathname.startsWith('/staff-panel.') ? url.pathname.slice(1) : 'staff-panel.html';
        const assetPath = path.join(here, assetName);
        const contentType = mimeTypes.get(path.extname(assetPath));
        if (!contentType || !['staff-panel.html', 'staff-panel.mjs', 'staff-panel.css'].includes(assetName)) {
          return send(response, 404, 'Not found');
        }
        const body = await readFile(assetPath);
        response.writeHead(200, { ...securityHeaders(), 'content-type': contentType, 'content-length': body.length });
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }

      if (url.pathname.startsWith('/auth/')) {
        if (request.method === 'GET' && url.pathname === '/auth/me') {
          const current = await accounts.getSession(token);
          return current ? sendJson(response, 200, { profile: current.profile }) : sendJson(response, 401, { error: 'Entre ou escolha entrar como visitante.' });
        }
        if (request.method !== 'POST') return send(response, 405, 'Method not allowed');
        if (request.headers.origin !== allowedOrigin) return sendJson(response, 403, { error: 'Origem não permitida.' });

        if (url.pathname === '/auth/guest') {
          if (!consumeLimit(request, 'guest', 30, 10 * 60 * 1000)) return sendJson(response, 429, { error: 'Muitas entradas seguidas. Tente mais tarde.' });
          const created = await accounts.guest();
          setSessionCookie(response, created.token, created.maxAge);
          return sendJson(response, 201, { profile: created.profile });
        }
        if (url.pathname === '/auth/register') {
          if (!consumeLimit(request, 'register', 5, 60 * 60 * 1000)) return sendJson(response, 429, { error: 'Muitas tentativas de cadastro. Tente mais tarde.' });
          const payload = await readJson(request);
          const created = await accounts.register(payload || {});
          setSessionCookie(response, created.token, created.maxAge);
          return sendJson(response, 201, { profile: created.profile });
        }
        if (url.pathname === '/auth/login') {
          if (!consumeLimit(request, 'login', 10, 15 * 60 * 1000)) return sendJson(response, 429, { error: 'Muitas tentativas de entrada. Tente mais tarde.' });
          const payload = await readJson(request);
          const created = await accounts.login(payload || {});
          if (!created.profile.guest && storage.staffManagement?.activeSanctions) {
            let active;
            try {
              active = await storage.staffManagement.activeSanctions([created.profile.id]);
            } catch {
              await accounts.logout(created.token).catch(() => {});
              throw Object.assign(new Error('Não foi possível validar o estado da conta. Tente novamente.'), { status: 503 });
            }
            if (active.some(sanction => ['kick', 'suspend', 'ban'].includes(sanction.kind))) {
              await accounts.logout(created.token);
              return sendJson(response, 403, { error: 'Esta conta está temporariamente impedida de entrar no jogo.' });
            }
          }
          setSessionCookie(response, created.token, created.maxAge);
          return sendJson(response, 200, { profile: created.profile });
        }
        if (url.pathname === '/auth/logout') {
          await accounts.logout(token);
          clearSessionCookie(response);
          return sendJson(response, 200, { ok: true });
        }
        if (url.pathname === '/auth/username') {
          const current = await accounts.getSession(token);
          if (!current) return sendJson(response, 401, { error: 'Sua sessão expirou. Entre de novo.' });
          const payload = await readJson(request);
          const profile = await accounts.updateUsername(token, payload?.username);
          return sendJson(response, 200, { profile });
        }
        return send(response, 404, 'Not found');
      }

      if (url.pathname === '/reports') {
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Método não permitido.' });
        if (request.headers.origin !== allowedOrigin) return sendJson(response, 403, { error: 'Origem não permitida.' });
        if (!consumeLimit(request, 'player-report', 5, 10 * 60 * 1000)) return sendJson(response, 429, { error: 'Você já enviou denúncias recentemente. Tente mais tarde.' });
        const current = await accounts.getSession(token);
        if (!current || current.profile.guest) return sendJson(response, 401, { error: 'Entre com uma conta para enviar uma denúncia.' });
        const staff = storage.staffManagement;
        if (!staff) return sendJson(response, 503, { error: 'O envio de denúncias exige o PostgreSQL.' });
        const payload = await readJson(request);
        const reportId = await staff.submitReport(token, payload || {});
        return sendJson(response, 201, { reportId: String(reportId) });
      }

      if (url.pathname.startsWith('/staff/')) {
        if (request.method !== 'GET' && request.method !== 'POST') return sendJson(response, 405, { error: 'Método não permitido.' });
        const staff = storage.staffManagement;
        if (!staff) return sendJson(response, 503, { error: 'As operações de staff exigem o PostgreSQL.' });
        const current = await accounts.getSession(token);
        if (!current || current.profile.guest) return sendJson(response, 401, { error: 'Entre com uma conta para acessar as ferramentas da equipe.' });
        const actorId = current.profile.id;
        const requirePermission = async permissionKey => {
          if (!await staff.authorization.hasPermission(actorId, permissionKey)) {
            throw Object.assign(new Error('Você não tem permissão para essa ação.'), { status: 403 });
          }
        };
        if (request.method === 'GET' && url.pathname === '/staff/capabilities') {
          const capabilities = await resolveHousekeepingCapabilities(staff, actorId);
          if (!Object.values(capabilities).some(Boolean)) return sendJson(response, 403, { error: 'Você não tem acesso às ferramentas da equipe.' });
          return sendJson(response, 200, { capabilities });
        }
        if (request.method === 'GET' && url.pathname === '/staff/world/trees') {
          await requirePermission('world.operate');
          const dimensionId = parseWorldDimension(url.searchParams.get('dimension'));
          const bounds = parseTreeBounds(url.searchParams);
          const world = normalizeWorldDefinition({ ...await storage.loadWorld(dimensionId), dimensionId });
          const key = `${dimensionId}:${world.revision}`;
          if (appliedTreeWorldKey !== key) { applyWorldDefinition(world); appliedTreeWorldKey = key; }
          const found = getSolidTreesInBounds(bounds).filter(tree => typeof tree.id === 'string');
          const trees = found.slice(0, WORLD_TREE_LIST_LIMIT).map(tree => ({
            targetId: tree.id, x: tree.x, y: tree.y, source: tree.id.startsWith('maptree:') ? 'staff' : 'natural',
          }));
          const tiles = world.edits.filter(edit => edit.type === 'tile-surface'
            && edit.x >= bounds.left && edit.x < bounds.right && edit.y >= bounds.top && edit.y < bounds.bottom)
            .map(({ x, y, surface }) => ({ x, y, surface }));
          const detailArea = bounds.right <= WORLD_SIZE && bounds.bottom <= WORLD_SIZE
            && (bounds.right - bounds.left) <= 100 && (bounds.bottom - bounds.top) <= 100;
          const details = detailArea ? await buildWorldMapDetailFeatures(bounds) : null;
          if (details) details.terrain = details.terrain.map(row => Array.from(row));
          return sendJson(response, 200, { revision: world.revision, worldSize: WORLD_SIZE,
            overview: getWorldMapOverview(), trees, tiles, details, truncated: found.length > WORLD_TREE_LIST_LIMIT });
        }
        if (request.method === 'POST') {
          if (request.headers.origin !== allowedOrigin) return sendJson(response, 403, { error: 'Origem não permitida.' });
          if (!consumeLimit(request, 'staff', 60, 60 * 1000)) return sendJson(response, 429, { error: 'Muitas ações administrativas seguidas. Tente mais tarde.' });
        }

        if (request.method === 'POST' && url.pathname === '/staff/sky') {
          await requirePermission('*');
          const payload = await readJson(request);
          const now = Date.now();
          const next = payload.clear === true ? [] : skyOverrideStore.current().slice();
          if (payload.clear !== true) next.push(createOverride(payload.override, now));
          skyOverrideStore.write(next.filter(override => override.endsAt > now));
          return sendJson(response, 200, { ok: true, active: next.filter(override => override.endsAt > now).length });
        }
        if (request.method === 'GET' && url.pathname === '/staff/economy-overview') {
          await requirePermission('economy.adjust');
          return sendJson(response, 200, await staff.getEconomyOverview());
        }
        const playerOverview = /^\/staff\/players\/([a-z0-9_]{3,20})$/u.exec(url.pathname);
        if (request.method === 'GET' && playerOverview) {
          await requirePermission('players.state.repair');
          const player = await staff.getPlayerOverview(playerOverview[1]);
          if (!player) return sendJson(response, 404, { error: 'Conta não encontrada.' });
          return sendJson(response, 200, { player });
        }
        if (request.method === 'GET' && url.pathname === '/staff/roles') {
          await requirePermission('roles.manage');
          return sendJson(response, 200, { roles: await staff.listRoles() });
        }
        if (request.method === 'GET' && url.pathname === '/staff/permissions') {
          await requirePermission('permissions.delegate');
          return sendJson(response, 200, { permissions: await staff.listPermissionsForActor(actorId) });
        }
        if (request.method === 'GET' && url.pathname === '/staff/audit') {
          await requirePermission('audit.read');
          const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 100;
          const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : null;
          return sendJson(response, 200, { events: await staff.listAudit({ limit, beforeEventId: before }) });
        }
        if (request.method === 'GET' && url.pathname === '/staff/reports') {
          await requirePermission('reports.read');
          const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50;
          const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : null;
          const status = url.searchParams.get('status') || null;
          const canManageAll = await staff.authorization.hasPermission(actorId, 'reports.manage');
          return sendJson(response, 200, { reports: await staff.listReports({
            limit, beforeReportId: before, status, actorAccountId: actorId, canManageAll,
          }) });
        }
        const accountRoles = /^\/staff\/accounts\/([a-z0-9_]{3,20})\/roles$/u.exec(url.pathname);
        if (request.method === 'GET' && accountRoles) {
          await requirePermission('roles.manage');
          const account = await staff.findAccountByUsername(accountRoles[1]);
          if (!account) return sendJson(response, 404, { error: 'Conta não encontrada.' });
          return sendJson(response, 200, { account, assignments: await staff.listAssignments(account.id) });
        }
        const accountSanctions = /^\/staff\/accounts\/([a-z0-9_]{3,20})\/sanctions$/u.exec(url.pathname);
        if (request.method === 'GET' && accountSanctions) {
          await requirePermission('players.read');
          const account = await staff.findAccountByUsername(accountSanctions[1]);
          if (!account) return sendJson(response, 404, { error: 'Conta não encontrada.' });
          return sendJson(response, 200, { sanctions: await staff.listSanctions(account.id) });
        }

        if (request.method === 'POST') {
          const payload = await readJson(request);
          if (url.pathname === '/staff/world/trees') {
            await requirePermission('world.operate');
            const dimensionId = parseWorldDimension(payload?.dimension);
            const expectedRevision = Number(payload?.expectedRevision);
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return sendJson(response, 400, { error: 'Revisão do mundo inválida.' });
            const current = normalizeWorldDefinition({ ...await storage.loadWorld(dimensionId), dimensionId });
            if (current.revision !== expectedRevision) return sendJson(response, 409, { error: 'O mundo mudou. Recarregue antes de salvar.' });
            let planned;
            try {
              planned = planStaffTreeChanges(current, { placements: payload?.placements, removals: payload?.removals, tiles: payload?.tiles, moves: payload?.moves });
            } catch (error) {
              if (error instanceof TypeError || error instanceof RangeError) return sendJson(response, 400, { error: error.message });
              throw error;
            }
            if (!planned.changed) return sendJson(response, 200, { revision: current.revision, changed: false });
            const saved = await storage.saveWorld(planned.definition, current.revision, dimensionId);
            return sendJson(response, 200, { revision: saved.revision, changed: true });
          }
          if (url.pathname === '/staff/wallet') {
            await requirePermission('economy.adjust');
            const amount = Number(payload?.amount);
            if (!['credit', 'debit'].includes(payload?.operation)
                || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_WALLET_VALUE) {
              return sendJson(response, 400, { error: 'Informe a operação e um valor inteiro dentro da capacidade da carteira.' });
            }
            const target = await staff.findAccountByUsername(payload?.username);
            if (!target) return sendJson(response, 404, { error: 'Conta não encontrada.' });
            const wallet = await staff.adjustWallet(token, {
              targetAccountId: target.id, delta: payload.operation === 'credit' ? amount : -amount, reason: payload?.reason,
            });
            return sendJson(response, 200, { username: target.username, wallet });
          }
          if (url.pathname === '/staff/roles') {
            await requirePermission('roles.manage');
            const roleKey = await staff.createRole(token, payload || {});
            return sendJson(response, 201, { roleKey });
          }
          if (url.pathname === '/staff/assignments') {
            await requirePermission('roles.manage');
            const target = await staff.findAccountByUsername(payload?.username);
            if (!target) return sendJson(response, 404, { error: 'Conta não encontrada.' });
            const assignmentId = await staff.assignRole(token, {
              targetAccountId: target.id,
              roleKey: payload?.roleKey,
              scopeKey: payload?.scopeKey,
              reason: payload?.reason,
              expiresAt: payload?.expiresAt ?? null,
            });
            return sendJson(response, 201, { assignmentId: String(assignmentId) });
          }
          if (url.pathname === '/staff/sanctions') {
            const requiredPermission = ({ warning: 'players.warn', mute: 'players.mute', kick: 'players.kick',
              suspend: 'players.suspend', ban: 'players.ban.permanent' })[payload?.kind];
            if (!requiredPermission) return sendJson(response, 400, { error: 'Tipo de sanção inválido.' });
            await requirePermission(requiredPermission);
            const target = await staff.findAccountByUsername(payload?.username);
            if (!target) return sendJson(response, 404, { error: 'Conta não encontrada.' });
            const sanctionId = await staff.applySanction(token, {
              targetAccountId: target.id, kind: payload?.kind, expiresAt: payload?.expiresAt ?? null,
              reason: payload?.reason, reportId: payload?.reportId ?? null,
            });
            return sendJson(response, 201, { sanctionId: String(sanctionId) });
          }
          const reportAction = /^\/staff\/reports\/(\d+)$/u.exec(url.pathname);
          if (reportAction) {
            await requirePermission('reports.manage');
            const changed = await staff.updateReport(token, {
              reportId: reportAction[1], action: payload?.action, reason: payload?.reason,
            });
            return sendJson(response, 200, { changed });
          }
          const revokeSanction = /^\/staff\/sanctions\/(\d+)\/revoke$/u.exec(url.pathname);
          if (revokeSanction) {
            await requirePermission('players.sanction.revoke');
            const revoked = await staff.revokeSanction(token, { sanctionId: revokeSanction[1], reason: payload?.reason });
            return sendJson(response, 200, { revoked });
          }
          const rolePermission = /^\/staff\/roles\/([a-z][a-z0-9_]{1,47})\/permissions$/u.exec(url.pathname);
          if (rolePermission) {
            await requirePermission('permissions.delegate');
            const changed = await staff.setRolePermission(token, {
              roleKey: rolePermission[1],
              permissionKey: payload?.permissionKey,
              granted: payload?.granted,
              reason: payload?.reason,
            });
            return sendJson(response, 200, { changed });
          }
          const revokeAssignment = /^\/staff\/assignments\/(\d+)\/revoke$/u.exec(url.pathname);
          if (revokeAssignment) {
            await requirePermission('roles.manage');
            const revoked = await staff.revokeRole(token, {
              assignmentId: revokeAssignment[1], reason: payload?.reason,
            });
            return sendJson(response, 200, { revoked });
          }
        }
        return sendJson(response, 404, { error: 'Operação de staff não encontrada.' });
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, 'Method not allowed');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { return send(response, 400, 'Invalid path'); }
      let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!relative || relative.split('/').includes('..') || relative.includes('\\')) return send(response, 403, 'Forbidden');
      const versionedPath = /^__clareira_versioned_assets__\/([a-f0-9]{64})\/(.+)$/u.exec(relative);
      const downloadVersion = versionedPath?.[1] ?? url.searchParams.get('__clareira_download_version');
      if (versionedPath) relative = versionedPath[2];
      if (!isServableGameAsset(relative)) return send(response, 404, 'Not found');
      if (downloadVersion !== null) {
        if (!/^[a-f0-9]{64}$/u.test(downloadVersion)) return send(response, 400, 'Invalid asset version');
        const asset = assetSnapshots.get(downloadVersion, relative);
        if (!asset) return sendJson(response, 409, { error: 'Esta versão do pacote expirou. Consulte o manifesto novamente.' });
        response.writeHead(200, {
          ...securityHeaders(),
          'content-type': mimeTypes.get(path.extname(relative)) || 'application/octet-stream',
          'content-length': asset.size,
          'x-clareira-asset-version': downloadVersion,
        });
        response.end(request.method === 'HEAD' ? undefined : asset.bytes);
        return;
      }
      const file = path.resolve(gameRoot, relative);
      if (!file.startsWith(`${gameRoot}${path.sep}`)) return send(response, 403, 'Forbidden');
      const canonicalFile = await realpath(file);
      const canonicalRelative = path.relative(canonicalGameRoot, canonicalFile);
      if (!isServableGameAsset(canonicalRelative)) return send(response, 404, 'Not found');
      const metadata = await stat(canonicalFile, { bigint: true });
      if (!metadata.isFile()) return send(response, 404, 'Not found');
      const extension = path.extname(file);
      const isHtml = extension === '.html';
      const entityTag = staticEntityTag(metadata);
      const modifiedAt = new Date(Number(metadata.mtimeNs / 1_000_000n)).toUTCString();
      const staticHeaders = {
        ...securityHeaders(),
        ...(isHtml ? {} : {
          // Keep public code and art in the browser cache, while validating each
          // reuse so a new game version never waits for an arbitrary TTL.
          'cache-control': 'public, max-age=0, must-revalidate',
          etag: entityTag,
          'last-modified': modifiedAt,
        }),
      };
      if (!isHtml && matchesStaticValidator(request, metadata, entityTag)) {
        response.writeHead(304, staticHeaders);
        response.end();
        return;
      }
      if (extension === '.mp4') {
        const size = Number(metadata.size);
        let start = 0, end = size - 1, status = 200;
        const range = request.headers.range;
        const ifRange = request.headers['if-range'];
        if (range && (!ifRange || ifRange === entityTag || ifRange === modifiedAt)) {
          const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
          if (match && (match[1] || match[2])) {
            if (match[1]) {
              start = Number(match[1]);
              if (match[2]) end = Math.min(end, Number(match[2]));
            } else start = Math.max(0, size - Number(match[2]));
          }
          if (!match || !(match[1] || match[2]) || !Number.isSafeInteger(start)
            || !Number.isSafeInteger(end) || start > end || start >= size) {
            response.writeHead(416, { ...staticHeaders, 'content-range': `bytes */${size}` });
            response.end(); return;
          }
          status = 206;
        }
        response.writeHead(status, {
          ...staticHeaders, 'content-type': 'video/mp4', 'accept-ranges': 'bytes',
          'content-length': end - start + 1,
          ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
        });
        if (request.method === 'HEAD') { response.end(); return; }
        const stream = createReadStream(canonicalFile, { start, end });
        stream.on('error', error => response.destroy(error));
        response.on('close', () => stream.destroy());
        stream.pipe(response);
        return;
      }
      response.writeHead(200, {
        ...staticHeaders,
        'content-type': mimeTypes.get(extension) || 'application/octet-stream',
        'content-length': metadata.size.toString(),
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      response.end(await readFile(canonicalFile));
    } catch (error) {
      if (!response.headersSent) {
        const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
        const message = error.status ? error.message : error.code === 'ENOENT' ? 'Not found' : 'Internal error';
        if (status >= 500) {
          const route = request.url?.split('?', 1)[0] || '/';
          console.error(`[preview] ${request.method} ${route} failed: ${error.name || 'Error'}${error.code ? ` (${error.code})` : ''}: ${error.message || 'unknown error'}`);
        }
        if (request.url?.startsWith('/auth/') || request.url?.startsWith('/staff/')) sendJson(response, status, { error: message });
        else send(response, status, message);
      } else response.destroy();
    }
  });

  return {
    server,
    listen: async () => {
      await storage.ready();
      canonicalGameRoot = await realpath(gameRoot);
      return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()); });
      });
    },
    close: async () => {
      if (server.listening) await new Promise(resolve => server.close(() => resolve()));
      await storage.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await loadBackendConfig();
  const preview = createPreviewServer({ port: Number(process.env.PORT || 8100), host: process.env.HOST || '127.0.0.1' });
  const address = await preview.listen();
  process.stdout.write(`Clareira preview listening on ${address.address}:${address.port}\n`);
}
