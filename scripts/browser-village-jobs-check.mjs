// Prova real no navegador dos ofícios da vila (carregador e ajudante do fogo).
// Uma fase por chamada, sempre sequencial sob lock global e com limite de tempo:
//   flock <browser.lock> timeout 300 node scripts/browser-village-jobs-check.mjs [worktree] [porta=19600] --viewport=1440|390|320
// Cada fase grava final-<viewport>-report.md e .json; a fase falha se qualquer etapa essencial não ocorreu.
//
// Regras deste script:
// - Conta real nova por fase (cadastro em /auth/register); visitante só na fase 1440, para a consulta.
// - Movimento: 1440 por teclado com waypoints; 390 e 320 só por toque no canvas (#world), fora do HUD.
//   A posição do toque vem de leitura: inspectMovement().projection + camera + getBoundingClientRect.
// - Diálogo fechado antes de qualquer movimento.
// - Pontos e raios vêm de VILLAGE_JOB_POINTS; a trilha é a única coordenada escrita à mão (waypoints da prova).
// - Data e hora fixas: sky-overrides fixa só hora 12 e clima limpo; a data é fixada por um preload
//   --import só no processo do sandbox desta prova (não existe no código de produto). Ver limitações.
// - Carteira lida de inspectMovement().inventory (somente leitura); painel lido pelo DOM.
// - Não adiciona hook mutável ao jogo: só importa /dev/main.js e lê inspectMovement.
// - Fecha o navegador no finally (e em SIGTERM/SIGINT) e encerra só o PID exato do sandbox iniciado aqui.
import { spawn, execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/rafael/clareira-tools/node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const VIEWPORT_ARG = ARGS.find(arg => arg.startsWith('--viewport='))?.slice('--viewport='.length);
const POSITIONAL = ARGS.filter(arg => !arg.startsWith('--'));
const VIEWPORTS = {
  1440: { name: '1440', width: 1440, height: 900, mobile: false },
  390: { name: '390', width: 390, height: 844, mobile: true },
  320: { name: '320', width: 320, height: 640, mobile: true },
};
if (!VIEWPORT_ARG || !VIEWPORTS[VIEWPORT_ARG]) throw new Error('informe --viewport=1440|390|320 (uma fase por chamada)');
const VP = VIEWPORTS[VIEWPORT_ARG];
const WT = path.resolve(POSITIONAL[0] || path.join(HERE, '..'));
const PORT = Number(POSITIONAL[1] || 19600);
if (PORT < 19600 || PORT + 1 > 19899) throw new Error(`porta ${PORT} fora da faixa 19600–19899`);
const BASE = `http://127.0.0.1:${PORT}`;
const SANDBOX = path.join(path.dirname(WT), 'sandbox.mjs');
const EVID = '/home/rafael/clareira-evidencias/2026-11-16-world-oficios-da-vila/prova-final';
const CHROME = '/home/rafael/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

// Instante fixo da prova (mesmo startedAt da baseline): 2026-11-16T22:16:53.633Z (19:16:53 em UTC-3).
const FIXED_NOW_MS = 1794867413633;
const SKY_STARTED_AT = FIXED_NOW_MS;
const SKY = [
  { key: 'hour', value: 12, scope: 'permanent', startedAt: SKY_STARTED_AT },
  { key: 'weather', value: { kind: 'clear', intensity: 0 }, scope: 'permanent', startedAt: SKY_STARTED_AT },
];
// Preload só do sandbox desta prova: Date.now e new Date() começam em FIXED_NOW_MS e avançam monotonicamente.
const CLOCK_PRELOAD = 'data:text/javascript,' + encodeURIComponent(
  `const F=${FIXED_NOW_MS};const R=Date;const s=R.now();` +
  'class FixedDate extends R{constructor(...a){if(a.length===0)super(F+(R.now()-s));else super(...a);}static now(){return F+(R.now()-s);}}' +
  'globalThis.Date=FixedDate;'
);
// Senha de fixture de teste (padrão dos outros scripts de navegador). Não é credencial real.
const FIXTURE_PASSWORD = 'LoadingTest7!safe';
const DEADLINE_MS = 265_000;
const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const PAYMENT_BRONZE = 150; // conforme PLAN: 150 bronzes por conclusão
const TRAIL_RADIUS = 0.9;   // tolerância de chegada em waypoints intermediários (tiles)
// Trilha da prova (waypoints reais). Ida: quadro -> trilha -> entrega. Volta: entrega -> trilha -> fogueira.
const TRAIL = [
  { x: 88, y: 99, radius: TRAIL_RADIUS, label: 'ida-1' },
  { x: 89.5, y: 101, radius: TRAIL_RADIUS, label: 'ida-2' },
  { x: 89.5, y: 109, radius: TRAIL_RADIUS, label: 'ida-3' },
];
const RETURN_TRAIL = [
  { x: 89.5, y: 109, radius: TRAIL_RADIUS, label: 'volta-1' },
  { x: 89.5, y: 101, radius: TRAIL_RADIUS, label: 'volta-2' },
  { x: 88, y: 99, radius: TRAIL_RADIUS, label: 'volta-3' },
];
const HEARTH_WAYPOINT = { x: 90.8, y: 93 };
// Etapas essenciais por fase: a fase só passa se todas ocorreram (cada etapa = verificação aprovada).
const ESSENTIAL = {
  1440: ['visitante-consulta', 'painel-abre', 'escape-fecha', 'botao-fecha', 'turno-carrier', 'caminhada-entrega', 'pagamento-carrier', 'carteira-visivel', 'caminhada-fogueira', 'turno-fogo', 'pagamento-fogo'],
  390: ['painel-abre', 'turno-carrier', 'toque-ida', 'toque-entrega', 'pagamento-carrier', 'toque-retorno-fogueira', 'turno-fogo', 'pagamento-fogo'],
  320: ['painel-abre', 'overflow-320', 'turno-carrier', 'toque-ida', 'toque-entrega', 'pagamento-carrier'],
};

const T0 = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const overBudget = () => Date.now() - T0 > DEADLINE_MS;

const commit = execFileSync('git', ['-C', WT, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10000 }).trim();
const { VILLAGE_JOB_POINTS, VILLAGE_JOBS } = await import(path.join(WT, 'game/village-jobs.mjs'));
const WORLD = await import(path.join(WT, 'game/world.mjs'));
const { gameDayKey } = await import(path.join(WT, 'game/game-calendar.mjs'));
const { createJsonPlayerLocationStore } = await import(path.join(WT, 'scripts/player-location-store.mjs'));
if (!Array.isArray(VILLAGE_JOB_POINTS) || !Array.isArray(VILLAGE_JOBS)) throw new Error('catálogo de ofícios ausente em game/village-jobs.mjs');
const POINT = Object.fromEntries(VILLAGE_JOB_POINTS.map(point => [point.id, point]));
for (const id of ['board', 'delivery', 'hearth']) if (!POINT[id]) throw new Error(`ponto ${id} ausente no catálogo`);

const report = {
  viewport: VP.name, commit, worktree: WT, base: BASE, roomPort: PORT + 1,
  startedAt: new Date(T0).toISOString(), finishedAt: null,
  clock: {
    fixedStartIso: new Date(FIXED_NOW_MS).toISOString(),
    mechanism: 'preload --import só no sandbox desta prova; Date.now avança monotonicamente a partir do instante fixo',
    gameDayKey: gameDayKey(FIXED_NOW_MS),
  },
  skyStartedAt: new Date(SKY_STARTED_AT).toISOString(), sky: SKY,
  points: VILLAGE_JOB_POINTS, trail: { outbound: TRAIL, returnTrail: RETURN_TRAIL, hearthWaypoint: HEARTH_WAYPOINT },
  jobs: VILLAGE_JOBS.map(job => ({ id: job.id, label: job.label, rewardBronze: job.rewardBronze, minDurationMs: job.minDurationMs, dailyLimit: job.dailyLimit, startPointId: job.startPointId, finishPointId: job.finishPointId })),
  accounts: [], actions: [], assertions: [], screenshots: [], layout: [], touches: [], errors: [], skipped: [],
  essential: null, sandbox: null, sandboxClosed: null, sandboxStderr: '', fatal: null, limitations: [],
};
const done = new Set();
const stage = name => done.add(name);
const log = (msg, extra) => {
  report.actions.push({ t: new Date().toISOString(), vp: VP.name, msg, extra: extra ?? null });
  console.log(`[${VP.name}] ${msg}${extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : ''}`);
};
const check = (vp, name, ok, detail) => {
  report.assertions.push({ vp, name, ok: Boolean(ok), detail: detail ?? null });
  log(`${ok ? 'OK' : 'FALHA'} ${name}`);
  return Boolean(ok);
};
const skip = (name) => { report.skipped.push({ vp: VP.name, name, reason: 'orçamento de tempo da fase' }); log(`PULADO por tempo: ${name}`); };

// 1) Sandbox na porta pedida, com relógio fixo só dentro dele; guarda o PID exato que ele imprime.
const sb = spawn('timeout', ['330', 'node', '--import', CLOCK_PRELOAD, SANDBOX, WT, String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let sandboxPid = null, stateDir = null, sandboxExit = null;
sb.on('exit', code => { sandboxExit = code; });
sb.stderr.on('data', chunk => { report.sandboxStderr = (report.sandboxStderr + chunk).slice(-2000); });
const sandboxReady = new Promise((resolve, reject) => {
  let buf = '';
  sb.stdout.on('data', chunk => {
    buf += chunk;
    const m = buf.match(/SANDBOX PRONTO \S+ estado=(\S+) pid=(\d+)/);
    if (m) { stateDir = m[1]; sandboxPid = Number(m[2]); resolve(); }
  });
  sb.on('exit', code => reject(new Error(`sandbox saiu antes de ficar pronto (código ${code})`)));
  setTimeout(() => reject(new Error('sandbox não ficou pronto em 40s')), 40000);
});

const locations = () => createJsonPlayerLocationStore(stateDir);

function tokenOf(res) {
  return res.headers.getSetCookie().find(c => c.startsWith('clareira_session='))?.match(/clareira_session=([^;]+)/)?.[1];
}

// Usuário: 3–20 caracteres [A-Za-z0-9_] (scripts/account-store.mjs). Filtro de termos recusa com 400: tenta outro nome.
async function register(tag) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const username = `ofic${tag}${Math.random().toString(36).slice(2, 7)}`.slice(0, 18);
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: FIXTURE_PASSWORD }),
    });
    if (res.status === 400 && attempt < 3) continue;
    if (res.status !== 201) throw new Error(`/auth/register devolveu ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const profileId = body.profile?.id ?? body.profileId ?? body.id;
    const token = tokenOf(res);
    if (!profileId || !token) throw new Error(`cadastro sem perfil ou cookie (chaves: ${Object.keys(body)})`);
    report.accounts.push({ username, guest: false });
    return { username, profileId, token, guest: false };
  }
  throw new Error('cadastro recusado em três nomes');
}

async function guest() {
  const res = await fetch(`${BASE}/auth/guest`, { method: 'POST', headers: { origin: BASE } });
  if (res.status !== 201) throw new Error(`/auth/guest devolveu ${res.status}`);
  const body = await res.json();
  const profileId = body.profile?.id ?? body.profileId ?? body.id;
  const token = tokenOf(res);
  if (!profileId || !token) throw new Error(`visitante sem perfil ou cookie (chaves: ${Object.keys(body)})`);
  report.accounts.push({ username: 'visitante', guest: true });
  return { username: 'visitante', profileId, token, guest: true };
}

// Fixture de posição: ponto do quadro, só no estado do sandbox (não teletransporta durante a prova).
async function fixtureAtBoard(account) {
  await locations().savePlayerLocation(account.profileId, {
    location: 'clearing', dimensionId: 'surface', x: POINT.board.x, y: POINT.board.y, roomKey: '',
    roomOwnerName: account.username, worldVersion: WORLD.WORLD_COORDINATE_VERSION,
  });
}

const SW_STUB = () => {
  const worker = { controller: {}, ready: Promise.resolve({}), register: async () => ({}), addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
};

async function openGame(account, rec) {
  const context = await browser.newContext({ viewport: { width: VP.width, height: VP.height }, isMobile: VP.mobile, hasTouch: VP.mobile });
  await context.addInitScript(SW_STUB);
  await context.addCookies([{ name: 'clareira_session', value: account.token, url: `${BASE}/dev/`, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage();
  page.on('pageerror', e => rec.errors.push({ kind: 'pageerror', message: e.message }));
  page.on('console', m => { if (m.type() === 'error') rec.errors.push({ kind: 'console', text: m.text() }); });
  page.on('response', r => { if (r.status() >= 400) rec.errors.push({ kind: 'http', status: r.status(), url: r.url() }); });
  await page.goto(`${BASE}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#scene-loading').waitFor({ state: 'hidden', timeout: 120000 });
  await page.waitForSelector('.shell.is-authenticated', { timeout: 20000 });
  // Leitura somente: o módulo já carregado pelo jogo expõe inspectMovement; nada é alterado.
  await page.evaluate(async () => { window.__inspectReadOnly = (await import('/dev/main.js')).inspectMovement; });
  await page.waitForFunction(() => {
    const r = window.__inspectReadOnly?.()?.readiness;
    return r?.sceneReady && r?.predictionReady && r?.connected;
  }, null, { timeout: 60000 });
  await sleep(800);
  return { context, page };
}

// Carteira: inspectMovement().inventory (não há inspectInventory exportado). Posição: inspectMovement().position.
const readState = page => page.evaluate(() => {
  const s = window.__inspectReadOnly();
  const inv = s.inventory || {};
  return {
    location: s.location, dimensionId: s.dimensionId,
    position: { x: s.position.x, y: s.position.y },
    inventory: { gold: inv.gold || 0, silver: inv.silver || 0, bronze: inv.bronze || 0 },
    balance: (inv.gold || 0) * 10000 + (inv.silver || 0) * 100 + (inv.bronze || 0),
    camera: s.camera,
  };
});

const panelDom = page => page.evaluate(() => {
  const d = document.querySelector('#lodging-dialog');
  const hud = document.querySelector('.village-job-progress');
  return {
    open: Boolean(d?.open),
    wallet: d?.querySelector('#lodging-wallet')?.textContent?.trim() || '',
    status: d?.querySelector('#lodging-status')?.textContent?.trim() || '',
    payment: d?.querySelector('.village-job-payment')?.textContent?.trim() || null,
    cards: [...(d?.querySelectorAll('.village-job-card') || [])].map(c => ({
      active: c.classList.contains('village-job-active'),
      text: c.innerText.replace(/\s+/g, ' ').trim(),
      buttons: [...c.querySelectorAll('button')].map(b => ({ action: b.dataset.serviceAction || null, jobId: b.dataset.jobId || null, text: b.textContent.trim(), disabled: b.disabled })),
    })),
    hud: hud ? { hidden: hud.hidden, label: hud.getAttribute('aria-label') } : null,
    toast: document.querySelector('#toast')?.textContent?.trim() || '',
  };
});

const layoutDom = page => page.evaluate(() => {
  const d = document.querySelector('#lodging-dialog');
  const r = d?.getBoundingClientRect();
  const a = document.activeElement;
  return {
    docOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dialogOverflowPx: d ? d.scrollWidth - d.clientWidth : null,
    dialogRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    viewport: { w: innerWidth, h: innerHeight },
    focus: { tag: a?.tagName || null, id: a?.id || null, inDialog: Boolean(a?.closest?.('#lodging-dialog')), focusKey: a?.dataset?.focusKey || null },
  };
});

async function shot(page, n, label) {
  const file = path.join(EVID, `final-${VP.name}-${n}-${label}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push({ vp: VP.name, label, file });
  log(`captura ${path.basename(file)}`);
}

const isDialogOpen = page => page.evaluate(() => Boolean(document.querySelector('#lodging-dialog')?.open));

async function openPanel(page) {
  if (VP.mobile) await page.locator('[data-action="context"]').first().tap();
  else { await page.locator('#world').focus(); await page.keyboard.press('e'); }
  await page.waitForSelector('#lodging-dialog[open]', { timeout: 8000 });
  // No Quadro da Recepção o painel abre na lista de serviços; "Trabalhos da vila" é um deles (data-service-section="jobs").
  const jobsChoice = page.locator('#lodging-dialog [data-service-section="jobs"]');
  if (await jobsChoice.count()) {
    if (VP.mobile) await jobsChoice.first().tap(); else await jobsChoice.first().click();
    await page.waitForSelector('#lodging-dialog .village-job-card', { timeout: 8000 });
  }
}

async function ensurePanel(page) {
  if (!(await isDialogOpen(page))) await openPanel(page);
}

// 'button' fecha pelo botão Fechar (toque no celular, clique no desktop); 'escape' usa a tecla Escape.
async function closePanel(page, how = 'button') {
  if (how === 'escape') await page.keyboard.press('Escape');
  else if (VP.mobile) await page.locator('#lodging-close').tap();
  else await page.locator('#lodging-close').click();
  await page.waitForFunction(() => !document.querySelector('#lodging-dialog')?.open, null, { timeout: 5000 }).catch(() => {});
}

// Diálogo fecha antes de qualquer movimento.
async function closeIfOpen(page) {
  if (!(await isDialogOpen(page))) return;
  await closePanel(page, 'button');
  check(VP.name, 'diálogo fechado antes de mover', !(await isDialogOpen(page)));
}

const holdKey = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };

// Calibra, uma vez por página, o deslocamento de cada seta no mundo (só desktop, por teclado).
const calibrations = new WeakMap();
async function calibrate(page) {
  if (calibrations.has(page)) return calibrations.get(page);
  const vec = {};
  for (const key of KEYS) {
    const a = (await readState(page)).position;
    await holdKey(page, key, 350);
    await sleep(250);
    const b = (await readState(page)).position;
    vec[key] = { x: b.x - a.x, y: b.y - a.y };
    await sleep(250);
  }
  calibrations.set(page, vec);
  return vec;
}

// Desktop: caminha por teclado até o alvo. Sem progresso por 1,5 s, a seta atual é descartada por um tempo.
async function walkTo(page, label, target, timeoutMs = 45000) {
  await closeIfOpen(page);
  const vec = await calibrate(page);
  const start = await readState(page);
  const t0 = Date.now();
  let best = Infinity, lastImprove = Date.now(), lastKey = KEYS[0];
  const banned = new Set();
  let steps = 0;
  while (Date.now() - t0 < timeoutMs) {
    const pos = (await readState(page)).position;
    const d = { x: target.x - pos.x, y: target.y - pos.y };
    const dist = Math.hypot(d.x, d.y);
    if (dist <= target.radius * 0.5) break;
    if (dist < best - 0.05) { best = dist; lastImprove = Date.now(); banned.clear(); }
    else if (Date.now() - lastImprove > 1500) {
      banned.add(lastKey); best = dist; lastImprove = Date.now();
      if (banned.size >= KEYS.length) banned.clear();
    }
    const ranked = KEYS.filter(k => !banned.has(k))
      .map(k => ({ k, s: vec[k].x * d.x + vec[k].y * d.y }))
      .sort((a, b) => b.s - a.s);
    lastKey = ranked[0].k;
    await holdKey(page, lastKey, 260);
    steps++;
    await sleep(60);
  }
  const end = (await readState(page)).position;
  const dist = Math.hypot(target.x - end.x, target.y - end.y);
  const ok = dist <= target.radius;
  log(`caminhada por teclado até ${label}: ${ok ? 'alcançado' : 'NÃO alcançado'}`, {
    from: start.position, to: end, target: { x: target.x, y: target.y }, radius: target.radius,
    distance: Number(dist.toFixed(2)), steps, ms: Date.now() - t0,
  });
  return { ok, distance: dist };
}

// Projeção de um ponto do mundo para coordenadas da tela, espelhando worldTargetAt/point() do jogo.
// Só leitura: projection e camera vêm de inspectMovement(); a altura é 0 (clareira plana nos waypoints).
async function screenOf(page, x, y) {
  return page.evaluate(([x, y]) => {
    const s = window.__inspectReadOnly();
    const p = s.projection;
    const c = s.camera;
    const canvas = document.querySelector('#world');
    const r = canvas.getBoundingClientRect();
    const sx = r.left + p.centerX + (x - y) * p.tileX - Math.round((c.x - c.y) * p.tileX);
    const sy = r.top + p.centerY + (x + y) * p.tileY - Math.round((c.x + c.y) * p.tileY);
    const hit = document.elementFromPoint(sx, sy);
    return {
      x: sx, y: sy,
      inside: sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom,
      onCanvas: hit === canvas,
      hit: hit ? { tag: hit.tagName, id: hit.id || null, cls: String(hit.className || '').slice(0, 80) } : null,
    };
  }, [x, y]);
}

// Espera chegar a até `tolerance` do alvo; para se ficar parado por 4 s (caminho bloqueado).
async function waitArrival(page, target, tolerance, timeoutMs = 30000) {
  const t0 = Date.now();
  let prev = null, lastMove = Date.now(), pos = null;
  while (Date.now() - t0 < timeoutMs) {
    pos = (await readState(page)).position;
    const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
    if (dist <= tolerance) return { ok: true, distance: dist, ms: Date.now() - t0, end: pos };
    if (!prev || Math.hypot(pos.x - prev.x, pos.y - prev.y) > 0.03) lastMove = Date.now();
    else if (Date.now() - lastMove > 4000) break;
    prev = pos;
    await sleep(200);
  }
  return { ok: false, distance: pos ? Math.hypot(target.x - pos.x, target.y - pos.y) : null, ms: Date.now() - t0, end: pos };
}

// Mobile: um toque no canvas, fora do HUD, e espera a chegada pelo pathfinding normal.
// Maior ponto da reta from→to (passo 0,5 tile) que ainda cai no canvas, fora do HUD. Null se nenhum.
async function visibleAlong(page, from, to) {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  let best = null;
  for (let step = 0.5; step <= d; step += 0.5) {
    const p = { x: from.x + (to.x - from.x) * step / d, y: from.y + (to.y - from.y) * step / d };
    const sc = await screenOf(page, p.x, p.y);
    if (sc.inside && sc.onCanvas) best = p; else if (best) break;
  }
  return best;
}

// Alvo fora da tela do celular (ex.: ida-3 em 390 px): toca primeiro um ponto visível na direção dele, e repete.
async function tapGo(page, target, depth = 0) {
  await closeIfOpen(page);
  const direct = await screenOf(page, target.x, target.y);
  if (!(direct.inside && direct.onCanvas) && depth < 6) {
    const pos = (await readState(page)).position;
    const via = await visibleAlong(page, pos, target);
    if (via && Math.hypot(via.x - pos.x, via.y - pos.y) > 0.6) {
      log(`${target.label} fora da tela: passo intermediário visível`, { via: { x: Number(via.x.toFixed(2)), y: Number(via.y.toFixed(2)) } });
      const hop = await tapGo(page, { x: via.x, y: via.y, radius: 0.5, label: `${target.label} (passo)` }, depth + 1);
      if (!hop.ok) return hop;
      return tapGo(page, target, depth + 1);
    }
  }
  const s = await screenOf(page, target.x, target.y);
  const onGround = check(VP.name, `toque para ${target.label} cai no canvas, fora do HUD`, s.inside && s.onCanvas, s);
  if (!onGround) return { ok: false, distance: null };
  report.touches.push({ label: target.label, world: { x: target.x, y: target.y }, screen: { x: Math.round(s.x), y: Math.round(s.y) } });
  await page.touchscreen.tap(s.x, s.y);
  const r = await waitArrival(page, target, target.radius);
  log(`toque até ${target.label}: ${r.ok ? 'alcançado' : 'NÃO alcançado'}`, { to: r.end, distance: r.distance == null ? null : Number(r.distance.toFixed(2)), ms: r.ms });
  return { ok: r.ok, distance: r.distance };
}

async function routeKeyboard(page, legs) {
  for (const leg of legs) {
    const w = await walkTo(page, leg.label, leg);
    if (!w.ok) return false;
  }
  return true;
}

async function routeTap(page, legs) {
  for (const leg of legs) {
    if (overBudget()) { skip(`toque até ${leg.label}`); return false; }
    const w = await tapGo(page, leg);
    if (!w.ok) return false;
  }
  return true;
}

const DELIVERY_LEG = () => ({ x: POINT.delivery.x, y: POINT.delivery.y, radius: POINT.delivery.radius, label: 'entrega' });
const HEARTH_LEG = () => ({ x: HEARTH_WAYPOINT.x, y: HEARTH_WAYPOINT.y, radius: POINT.hearth.radius, label: 'fogueira' });

async function waitReady(page, timeoutMs = 90000) {
  await page.waitForFunction(() => {
    const l = document.querySelector('.village-job-progress');
    return Boolean(l) && !l.hidden && /Pronto/.test(l.getAttribute('aria-label') || '');
  }, null, { timeout: timeoutMs });
}

async function startJob(page, jobId) {
  const btn = page.locator(`[data-service-action="villageJobStart"][data-job-id="${jobId}"]`).first();
  if (!(await btn.count())) { check(VP.name, `${jobId}: botão de início presente`, false, await panelDom(page)); return false; }
  const disabled = await btn.isDisabled();
  const dom = await panelDom(page);
  check(VP.name, `${jobId}: botão de início habilitado`, !disabled, dom.cards.map(c => c.text));
  if (disabled) return false;
  if (VP.mobile) await btn.tap(); else await btn.click();
  const started = await page.waitForSelector('.village-job-active', { timeout: 8000 }).then(() => true, () => false);
  const after = await panelDom(page);
  const diag = started ? null : await readState(page);
  check(VP.name, `${jobId}: turno iniciado no servidor (card ativo)`, started, { status: after.status, toast: after.toast, cards: after.cards.map(c => c.text), clientState: diag });
  return started;
}

async function finishJob(page, pointId, expectLabel) {
  await ensurePanel(page);
  const btn = page.locator('[data-service-action="villageJobFinish"]').first();
  if (!(await btn.count())) { check(VP.name, `${pointId}: botão de conclusão presente`, false, await panelDom(page)); return null; }
  const label = (await btn.textContent()).trim();
  check(VP.name, `rótulo de conclusão em ${pointId} = "${expectLabel}"`, label === expectLabel, label);
  const before = (await readState(page)).balance;
  const enabled = !(await btn.isDisabled());
  check(VP.name, `${pointId}: botão de conclusão habilitado`, enabled, await panelDom(page));
  if (!enabled) return null;
  if (VP.mobile) await btn.tap(); else await btn.dblclick(); // duplo clique de propósito: teste de repetição
  for (let i = 0; i < 2; i++) {
    await sleep(350);
    const again = page.locator('[data-service-action="villageJobFinish"]').first();
    if ((await again.count()) && !(await again.isDisabled())) { if (VP.mobile) await again.tap(); else await again.click(); }
  }
  // O relógio do navegador (tempo real) e o do servidor da sandbox (data fixa) não batem: "Pronto" pode aparecer
  // antes de readyAt. Então repete a conclusão a cada 1,5 s até o servidor aceitar; o pagamento só entra uma vez.
  for (let t = 0; t < 100; t++) {
    if ((await readState(page)).balance !== before) break;
    if (t % 5 === 4) {
      const again = page.locator('[data-service-action="villageJobFinish"]').first();
      if ((await again.count()) && !(await again.isDisabled())) { if (VP.mobile) await again.tap(); else await again.click(); }
    }
    await sleep(300);
  }
  await sleep(2500); // deixa qualquer clique repetido chegar ao servidor
  const after = (await readState(page)).balance;
  const dom = await panelDom(page);
  const paid = check(VP.name, `${pointId}: carteira depois - antes = ${PAYMENT_BRONZE}, sem crédito extra por clique repetido`,
    after - before === PAYMENT_BRONZE, { before, after, delta: after - before, payment: dom.payment, toast: dom.toast });
  check(VP.name, `${pointId}: aviso de pagamento exibido`, Boolean(dom.payment && dom.payment.includes(String(PAYMENT_BRONZE))), dom.payment);
  return paid ? { before, after } : null;
}

async function runDesktop() {
  const account = await register(`d${VP.name}`);
  await fixtureAtBoard(account);
  const rec = { errors: [] };
  const { context, page } = await openGame(account, rec);
  try {
    log(`conta real nova ${account.username} no quadro (teclado)`);
    await shot(page, 1, 'mundo-quadro');
    await openPanel(page);
    const dom = await panelDom(page);
    if (check(VP.name, 'painel no quadro lista 2 ofícios', dom.cards.length === 2, dom.cards.map(c => c.text))) stage('painel-abre');
    await shot(page, 2, 'painel-dois-oficios');
    report.layout.push({ vp: VP.name, phase: 'painel-aberto', ...(await layoutDom(page)) });
    // Escape volta uma tela (panel-controller.mjs): dos trabalhos para a lista de serviços; o diálogo continua aberto.
    await page.keyboard.press('Escape');
    const backToServices = await page.waitForSelector('#lodging-dialog [data-service-section="jobs"]', { timeout: 5000 }).then(() => true, () => false);
    check(VP.name, 'Escape volta dos trabalhos para a lista de serviços (diálogo segue aberto)', backToServices && await isDialogOpen(page));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#lodging-dialog')?.open, null, { timeout: 5000 }).catch(() => {});
    if (check(VP.name, 'segundo Escape fecha o painel', !(await isDialogOpen(page)))) stage('escape-fecha');
    await openPanel(page);
    await closePanel(page, 'button');
    if (check(VP.name, 'botão Fechar fecha o painel', !(await isDialogOpen(page)))) stage('botao-fecha');
    await openPanel(page);
    const started = await startJob(page, 'carrier');
    if (started) {
      stage('turno-carrier');
      await ensurePanel(page);
      await shot(page, 3, 'turno-em-andamento');
      await closePanel(page, 'button');
      await shot(page, 4, 'turno-andamento-hud');
      if (await routeKeyboard(page, [...TRAIL, DELIVERY_LEG()])) stage('caminhada-entrega');
      else check(VP.name, 'chegou à entrega por teclado', false);
      await waitReady(page);
      await ensurePanel(page);
      await shot(page, '5a', 'carteira-antes-pagamento');
      if (await finishJob(page, 'delivery', 'Entregar caixa')) stage('pagamento-carrier');
      await shot(page, 5, 'pagamento-carteira');
      const wallet = (await panelDom(page)).wallet;
      if (check(VP.name, 'carteira mostrada no painel', wallet.startsWith('Carteira:'), wallet)) stage('carteira-visivel');
      // Ajudante do fogo no mesmo fluxo de teclado: volta ao quadro, anda até a fogueira e conclui o turno.
      if (overBudget()) skip('ajudante do fogo (1440)');
      else {
        if (await routeKeyboard(page, [...RETURN_TRAIL, HEARTH_LEG()])) stage('caminhada-fogueira');
        await openPanel(page);
        const fire = await startJob(page, 'firekeeper');
        if (fire) {
          stage('turno-fogo');
          await ensurePanel(page);
          await shot(page, 6, 'turno-fogo');
          await closePanel(page, 'button');
          await waitReady(page).catch(() => check(VP.name, 'indicador de pronto aparece no fogo', false));
          if (await finishJob(page, 'hearth', 'Receber pagamento')) stage('pagamento-fogo');
          await ensurePanel(page); // o painel segue aberto após o pagamento
          await shot(page, 7, 'pagamento-carteira-fogo');
          check(VP.name, 'carteira mostrada no painel (fogo)', (await panelDom(page)).wallet.startsWith('Carteira:'), (await panelDom(page)).wallet);
          await closePanel(page, 'button');
        }
      }
    }
  } catch (error) {
    check(VP.name, 'fluxo de teclado sem exceção', false, String(error?.message || error));
  } finally {
    report.errors.push(...rec.errors.map(e => ({ vp: VP.name, ...e })));
    await context.close();
  }
}

async function runMobile({ withFirekeeper }) {
  const account = await register(`m${VP.name}`);
  await fixtureAtBoard(account);
  const rec = { errors: [] };
  const { context, page } = await openGame(account, rec);
  try {
    log(`conta real nova ${account.username} no quadro (toque)`);
    await shot(page, 1, 'mundo-quadro');
    await openPanel(page);
    const dom = await panelDom(page);
    if (check(VP.name, 'painel no quadro lista 2 ofícios', dom.cards.length === 2, dom.cards.map(c => c.text))) stage('painel-abre');
    await shot(page, 2, 'painel-dois-oficios');
    const layout = await layoutDom(page);
    report.layout.push({ vp: VP.name, phase: 'painel-aberto', ...layout });
    if (VP.name === '320' && check(VP.name, 'sem rolagem horizontal no painel (320)', layout.dialogOverflowPx <= 0 && layout.docOverflowPx <= 0, layout)) stage('overflow-320');
    const started = await startJob(page, 'carrier');
    if (started) {
      stage('turno-carrier');
      await ensurePanel(page);
      await shot(page, 3, 'turno-em-andamento');
      await closePanel(page, 'button');
      await shot(page, 4, 'turno-andamento-hud');
      if (await routeTap(page, TRAIL)) stage('toque-ida');
      if (await routeTap(page, [DELIVERY_LEG()])) stage('toque-entrega');
      await waitReady(page).catch(() => check(VP.name, 'indicador de pronto aparece na entrega', false));
      await ensurePanel(page);
      await shot(page, '5a', 'carteira-antes-pagamento');
      if (await finishJob(page, 'delivery', 'Entregar caixa')) stage('pagamento-carrier');
      await shot(page, 5, 'pagamento-carteira');
      const wallet = (await panelDom(page)).wallet;
      check(VP.name, 'carteira mostrada no painel', wallet.startsWith('Carteira:'), wallet);
      await closePanel(page, 'button');
    }
    if (withFirekeeper && started) {
      if (overBudget()) skip('ajudante do fogo');
      else {
        if (await routeTap(page, RETURN_TRAIL) && await routeTap(page, [HEARTH_LEG()])) stage('toque-retorno-fogueira');
        await openPanel(page);
        const fire = await startJob(page, 'firekeeper');
        if (fire) {
          stage('turno-fogo');
          await ensurePanel(page);
          await shot(page, 6, 'turno-fogo');
          await closePanel(page, 'button');
          await waitReady(page).catch(() => check(VP.name, 'indicador de pronto aparece no fogo', false));
          if (await finishJob(page, 'hearth', 'Receber pagamento')) stage('pagamento-fogo');
          await ensurePanel(page); // o painel segue aberto após o pagamento
          await shot(page, 7, 'pagamento-carteira-fogo');
          check(VP.name, 'carteira mostrada no painel (fogo)', (await panelDom(page)).wallet.startsWith('Carteira:'), (await panelDom(page)).wallet);
          await closePanel(page, 'button');
        }
      }
    }
    if (VP.name === '320') report.layout.push({ vp: VP.name, phase: 'fim', ...(await layoutDom(page)) });
  } catch (error) {
    check(VP.name, 'fluxo de toque sem exceção', false, String(error?.message || error));
  } finally {
    report.errors.push(...rec.errors.map(e => ({ vp: VP.name, ...e })));
    await context.close();
  }
}

async function runGuestRefusal() {
  const account = await guest();
  await fixtureAtBoard(account);
  const rec = { errors: [] };
  const { context, page } = await openGame(account, rec);
  try {
    await openPanel(page);
    const dom = await panelDom(page);
    const starts = dom.cards.flatMap(c => c.buttons).filter(b => b.action === 'villageJobStart');
    const noStart = check(VP.name, 'visitante vê os ofícios com início desabilitado', starts.length > 0 && starts.every(b => b.disabled), dom.cards.map(c => c.text));
    const text = await page.locator('#lodging-dialog').innerText();
    const notice = check(VP.name, 'aviso de conta exigida no painel', text.includes('Entre com uma conta'), text.slice(0, 300));
    await shot(page, 1, 'visitante-consulta');
    if (noStart && notice) stage('visitante-consulta');
  } catch (error) {
    check(VP.name, 'consulta de visitante sem exceção', false, String(error?.message || error));
  } finally {
    report.errors.push(...rec.errors.map(e => ({ vp: 'visitante', ...e })));
    await context.close();
  }
}

// Navegador único da fase, aberto no início e fechado em finish().
let browser = null;

let finished = false;
async function finish(exitCode) {
  if (finished) return exitCode;
  finished = true;
  if (browser) await browser.close().catch(() => {});
  if (sandboxPid) {
    try { process.kill(sandboxPid, 'SIGTERM'); } catch {}
    await sleep(1500);
    let alive = true;
    try { process.kill(sandboxPid, 0); } catch { alive = false; }
    report.sandboxClosed = { pid: sandboxPid, alive: alive ? 'AINDA VIVO' : 'encerrado' };
  }
  if (sb.exitCode === null) sb.kill('SIGTERM');
  report.finishedAt = new Date().toISOString();
  report.sandboxExitCode = sandboxExit;
  const missing = (ESSENTIAL[VP.name] || []).filter(name => !done.has(name));
  report.essential = { required: ESSENTIAL[VP.name], done: [...done], missing };
  if (missing.length) check(VP.name, `etapas essenciais ocorreram (faltam: ${missing.join(', ')})`, false);
  const pageErrors = report.errors.filter(e => e.kind === 'pageerror');
  check(VP.name, 'sem exceção JS na página (pageerror)', pageErrors.length === 0, pageErrors.slice(0, 5));
  if (report.fatal) exitCode = 1;
  if (report.assertions.some(a => !a.ok)) exitCode = exitCode || 1;
  report.limitations = [
    `Data e hora fixas: ${report.clock.fixedStartIso} (19:16:53 em UTC-3), dia do jogo ${report.clock.gameDayKey}. O override de céu só fixa hora e clima; a data foi fixada por preload --import apenas no processo do sandbox desta prova (sem alterar código de produto). O navegador não tem relógio fixado; o cliente recebe dia e tempos do servidor no snapshot.`,
    'Hearth: a checagem do catálogo confere se VILLAGE_JOB_POINTS.hearth = (90.8, 93). Se não bater, a fase falha; a caminhada usa o waypoint (90.8, 93) e o raio do catálogo.',
    'Toque: o ponto de tela é calculado com projection e camera de inspectMovement() e a altura do piso é 0 (clareira plana). Se a altura não for 0 no waypoint, a chegada pode falhar e aparece no relatório.',
    'Toque fora do HUD: o ponto é aceito só se elementFromPoint devolve o canvas #world. Se um elemento do HUD cobrir o waypoint, a fase falha no próprio passo.',
    'Desktop: movimento por teclado com waypoints da mesma trilha; o contorno de obstáculo é só troca de seta.',
    'Visitante: verificado pela interface (início desabilitado e aviso). A recusa do servidor a uma ação de visitante não foi exercitada sem alterar o jogo.',
    'Snapshot de ofícios não está em inspectMovement: turno e pagamento são lidos do DOM (painel e indicador de progresso).',
    'Cota diária: cada conta conclui uma vez por ofício; o limite diário não é exercitado.',
    `Tempo: cada fase tem limite de ${DEADLINE_MS / 1000} s dentro do comando de 300 s. Etapas que não rodarem por tempo entram em skipped e em etapas essenciais faltando, o que reprova a fase.`,
    'Nenhuma aprovação é declarada por este script: o resultado é prova automatizada para revisão do dono.',
  ];
  const json = path.join(EVID, `final-${VP.name}-report.json`);
  const md = path.join(EVID, `final-${VP.name}-report.md`);
  const lines = [
    `# Prova candidata — ofícios da vila (navegador real), viewport ${VP.name}`, '',
    `- Commit: \`${commit}\``, `- Worktree: \`${WT}\``,
    `- Início: ${report.startedAt}; fim: ${report.finishedAt}`,
    `- Data e hora fixas: ${report.clock.fixedStartIso}; dia do jogo ${report.clock.gameDayKey}; ${report.clock.mechanism}`,
    `- Céu fixo: startedAt ${report.skyStartedAt}, hora 12, clima limpo, escopo permanente`,
    `- Sandbox: PID ${sandboxPid}, encerrado: ${report.sandboxClosed?.alive ?? 'n/a'}`,
    `- Erro fatal: ${report.fatal ?? 'nenhum'}`,
    `- Etapas essenciais faltando: ${missing.length ? missing.join(', ') : 'nenhuma'}`, '',
    '## Asserções', '', '| Verificação | Resultado |', '|---|---|',
    ...report.assertions.map(a => `| ${a.name} | ${a.ok ? 'OK' : 'FALHA'} |`),
    '', '## Toques (mobile)', '', ...(report.touches.length ? report.touches.map(t => `- ${t.label}: mundo ${JSON.stringify(t.world)}, tela ${JSON.stringify(t.screen)}`) : ['- nenhum']),
    '', '## Capturas', '', ...report.screenshots.map(s => `- ${s.vp} · ${s.label}: \`${s.file}\``),
    '', '## Erros JS/console/HTTP', '', ...(report.errors.length ? report.errors.map(e => `- ${JSON.stringify(e)}`) : ['- nenhum']),
    '', '## Layout (overflow e foco)', '', ...report.layout.map(l => `- ${l.vp} · ${l.phase}: overflow documento ${l.docOverflowPx}px, diálogo ${l.dialogOverflowPx}px, foco ${JSON.stringify(l.focus)}`),
    '', '## Pulado', '', ...(report.skipped.length ? report.skipped.map(s => `- ${s.vp}: ${s.name} (${s.reason})`) : ['- nada']),
    '', '## Limitações', '', ...report.limitations.map(l => `- ${l}`), '',
    `Dados brutos: \`${json}\``,
  ];
  await writeFile(json, JSON.stringify(report, null, 2));
  await writeFile(md, lines.join('\n') + '\n');
  console.log('RELATÓRIO', md);
  return exitCode;
}

async function onSignal(signal) {
  report.fatal = `interrompido por ${signal}`;
  const code = await finish(1);
  process.exit(code || 1);
}
process.on('SIGTERM', () => { void onSignal('SIGTERM'); });
process.on('SIGINT', () => { void onSignal('SIGINT'); });

let exitCode = 0;
try {
  await sandboxReady;
  report.sandbox = { pid: sandboxPid, stateDir, base: BASE, roomPort: PORT + 1, preload: 'data:text/javascript (relógio fixo, só nesta prova)' };
  log(`sandbox pronto pid=${sandboxPid} estado=${stateDir}`);
  check(VP.name, 'catálogo: fogueira da vila em (90.8, 93)', Math.abs(POINT.hearth.x - HEARTH_WAYPOINT.x) < 0.01 && Math.abs(POINT.hearth.y - HEARTH_WAYPOINT.y) < 0.01, POINT.hearth);
  await writeFile(path.join(stateDir, 'sky-overrides.json'), JSON.stringify(SKY, null, 2));
  log(`céu fixo gravado, startedAt=${report.skyStartedAt}; dia do jogo ${report.clock.gameDayKey}`);
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

  if (VP.name === '1440') {
    await runGuestRefusal();
    if (!overBudget()) await runDesktop(); else skip('fluxo de teclado (1440)');
  } else if (VP.name === '390') {
    await runMobile({ withFirekeeper: true });
  } else {
    await runMobile({ withFirekeeper: false });
  }
} catch (error) {
  report.fatal = String(error?.stack || error);
  console.error('FALHA FATAL', report.fatal);
} finally {
  exitCode = await finish(report.fatal ? 1 : 0);
  process.exitCode = exitCode;
}
