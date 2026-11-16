// Prova real no navegador dos ofícios da vila (carregador e ajudante do fogo).
// Uso (sempre com lock e limite de tempo, um navegador por vez):
//   flock <browser.lock> timeout 300 node scripts/browser-village-jobs-check.mjs [worktree] [porta=19600]
//
// Regras deste script:
// - Conta real nova por viewport (cadastro em /auth/register); visitante só para a consulta.
// - Estado inicial de sandbox: posição salva no ponto do quadro (VILLAGE_JOB_POINTS), céu fixo
//   (hora 12, clima limpo) com startedAt 1794867413633 (mesmo instante da baseline).
// - Movimento só por entrada real (teclado). Não há teletransporte nem chamada a handler interno.
// - Carteira lida de inspectMovement().inventory (somente leitura); painel lido pelo DOM.
// - Pontos e raios vêm sempre de VILLAGE_JOB_POINTS; nada é codificado à mão.
// - Não adiciona hook mutável ao jogo: só importa /dev/main.js e lê inspectMovement.
// - Fecha o navegador no finally e encerra só o PID exato do sandbox iniciado aqui.
import { spawn, execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/rafael/clareira-tools/node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WT = path.resolve(process.argv[2] || path.join(HERE, '..'));
const PORT = Number(process.argv[3] || 19600);
if (PORT < 19600 || PORT + 1 > 19899) throw new Error(`porta ${PORT} fora da faixa 19600–19899`);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOM_PORT = PORT + 1;
const SANDBOX = path.join(path.dirname(WT), 'sandbox.mjs');
const EVID = '/home/rafael/clareira-evidencias/2026-11-16-world-oficios-da-vila';
const CHROME = '/home/rafael/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const SKY_STARTED_AT = 1794867413633;
const SKY = [
  { key: 'hour', value: 12, scope: 'permanent', startedAt: SKY_STARTED_AT },
  { key: 'weather', value: { kind: 'clear', intensity: 0 }, scope: 'permanent', startedAt: SKY_STARTED_AT },
];
// Senha de fixture de teste (padrão dos outros scripts de navegador). Não é credencial real.
const FIXTURE_PASSWORD = 'LoadingTest7!safe';
const DEADLINE_MS = 265_000; // abaixo do timeout 300 do comando; fases restantes são puladas e registradas
const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const PAYMENT_BRONZE = 150; // conforme PLAN: 150 bronzes por conclusão
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900, mobile: false },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '320', width: 320, height: 640, mobile: true },
];

const T0 = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const overBudget = () => Date.now() - T0 > DEADLINE_MS;

const commit = execFileSync('git', ['-C', WT, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10000 }).trim();
const { VILLAGE_JOB_POINTS, VILLAGE_JOBS } = await import(path.join(WT, 'game/village-jobs.mjs'));
const { WORLD_COORDINATE_VERSION } = await import(path.join(WT, 'game/world.mjs'));
const { createJsonPlayerLocationStore } = await import(path.join(WT, 'scripts/player-location-store.mjs'));
if (!Array.isArray(VILLAGE_JOB_POINTS) || !Array.isArray(VILLAGE_JOBS)) throw new Error('catálogo de ofícios ausente em game/village-jobs.mjs');
const POINT = Object.fromEntries(VILLAGE_JOB_POINTS.map(point => [point.id, point]));
for (const id of ['board', 'delivery', 'hearth']) if (!POINT[id]) throw new Error(`ponto ${id} ausente no catálogo`);

const report = {
  commit, worktree: WT, base: BASE, roomPort: ROOM_PORT,
  startedAt: new Date(T0).toISOString(), finishedAt: null,
  skyStartedAt: new Date(SKY_STARTED_AT).toISOString(), sky: SKY,
  points: VILLAGE_JOB_POINTS,
  jobs: VILLAGE_JOBS.map(job => ({ id: job.id, label: job.label, rewardBronze: job.rewardBronze, minDurationMs: job.minDurationMs, dailyLimit: job.dailyLimit, startPointId: job.startPointId, finishPointId: job.finishPointId })),
  accounts: [], actions: [], assertions: [], screenshots: [], layout: [], errors: [], skipped: [],
  desktopCarrier: null, sandbox: null, sandboxClosed: null, fatal: null, limitations: [],
};
const log = (vp, msg, extra) => {
  report.actions.push({ t: new Date().toISOString(), vp, msg, extra: extra ?? null });
  console.log(`[${vp}] ${msg}${extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : ''}`);
};
const check = (vp, name, ok, detail) => {
  report.assertions.push({ vp, name, ok: Boolean(ok), detail: detail ?? null });
  log(vp, `${ok ? 'OK' : 'FALHA'} ${name}`);
};
const skip = (vp, name) => { report.skipped.push({ vp, name, reason: 'orçamento de tempo do comando' }); log(vp, `PULADO por tempo: ${name}`); };

// 1) Sandbox na porta pedida; guarda o PID exato que ele imprime.
const sb = spawn('timeout', ['330', 'node', SANDBOX, WT, String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let sandboxPid = null, stateDir = null, sandboxExit = null;
sb.on('exit', code => { sandboxExit = code; });
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

async function register(tag) {
  const username = `ofic${tag}${Math.random().toString(36).slice(2, 7)}`.slice(0, 18);
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: FIXTURE_PASSWORD }),
  });
  if (res.status !== 201) throw new Error(`/auth/register devolveu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const profileId = body.profile?.id ?? body.profileId ?? body.id;
  const token = tokenOf(res);
  if (!profileId || !token) throw new Error(`cadastro sem perfil ou cookie (chaves: ${Object.keys(body)})`);
  report.accounts.push({ username, guest: false });
  return { username, profileId, token, guest: false };
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
    roomOwnerName: account.username, worldVersion: WORLD_COORDINATE_VERSION,
  });
}

const SW_STUB = () => {
  const worker = { controller: {}, ready: Promise.resolve({}), register: async () => ({}), addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
};

async function openGame(browser, vp, account, rec) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
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

async function shot(page, vp, n, label) {
  const file = path.join(EVID, `candidate-${vp.name}-${n}-${label}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push({ vp: vp.name, label, file });
  log(vp.name, `captura ${path.basename(file)}`);
}

const isDialogOpen = page => page.evaluate(() => Boolean(document.querySelector('#lodging-dialog')?.open));

async function openPanel(page, vp) {
  if (vp.mobile) await page.locator('[data-action="context"]').first().tap();
  else { await page.locator('#world').focus(); await page.keyboard.press('e'); }
  await page.waitForSelector('#lodging-dialog[open]', { timeout: 8000 });
}

async function ensurePanel(page, vp) {
  if (!(await isDialogOpen(page))) await openPanel(page, vp);
}

// 'button' fecha pelo botão Fechar (toque no celular, clique no desktop); 'escape' usa a tecla Escape.
async function closePanel(page, vp, how = 'button') {
  if (how === 'escape') await page.keyboard.press('Escape');
  else if (vp.mobile) await page.locator('#lodging-close').tap();
  else await page.locator('#lodging-close').click();
  await page.waitForFunction(() => !document.querySelector('#lodging-dialog')?.open, null, { timeout: 5000 }).catch(() => {});
}

const holdKey = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };

// Calibra, uma vez por página, o deslocamento de cada seta no mundo (sem depender do mapeamento da câmera).
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

// Caminha por teclado até o ponto do catálogo. Escolhe a seta cujo vetor aponta mais para o alvo;
// sem progresso por 1,5 s, a seta atual é descartada por um tempo (contorno simples de obstáculo).
async function walkTo(page, vp, pointId, timeoutMs = 90000) {
  const target = POINT[pointId];
  const radius = target.radius;
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
    if (dist <= radius * 0.5) break;
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
  const ok = dist <= radius;
  log(vp.name, `caminhada até ${pointId}: ${ok ? 'alcançado' : 'NÃO alcançado'}`, {
    from: start.position, to: end, target: { x: target.x, y: target.y }, radius,
    distance: Number(dist.toFixed(2)), steps, ms: Date.now() - t0,
  });
  return { ok, distance: dist };
}

async function waitReady(page, timeoutMs = 90000) {
  await page.waitForFunction(() => {
    const l = document.querySelector('.village-job-progress');
    return Boolean(l) && !l.hidden && /Pronto/.test(l.getAttribute('aria-label') || '');
  }, null, { timeout: timeoutMs });
}

async function startJob(page, vp, jobId) {
  const btn = page.locator(`[data-service-action="villageJobStart"][data-job-id="${jobId}"]`).first();
  if (!(await btn.count())) { check(vp.name, `${jobId}: botão de início presente`, false, await panelDom(page)); return false; }
  const disabled = await btn.isDisabled();
  const dom = await panelDom(page);
  check(vp.name, `${jobId}: botão de início habilitado`, !disabled, dom.cards.map(c => c.text));
  if (disabled) return false;
  if (vp.mobile) await btn.tap(); else await btn.click();
  const started = await page.waitForSelector('.village-job-active', { timeout: 8000 }).then(() => true, () => false);
  const after = await panelDom(page);
  check(vp.name, `${jobId}: turno iniciado no servidor (card ativo)`, started, { status: after.status, toast: after.toast, cards: after.cards.map(c => c.text) });
  return started;
}

async function finishJob(page, vp, pointId, expectLabel) {
  await ensurePanel(page, vp);
  const btn = page.locator('[data-service-action="villageJobFinish"]').first();
  if (!(await btn.count())) { check(vp.name, `${pointId}: botão de conclusão presente`, false, await panelDom(page)); return null; }
  const label = (await btn.textContent()).trim();
  check(vp.name, `rótulo de conclusão em ${pointId} = "${expectLabel}"`, label === expectLabel, label);
  const before = (await readState(page)).balance;
  const enabled = !(await btn.isDisabled());
  check(vp.name, `${pointId}: botão de conclusão habilitado`, enabled, await panelDom(page));
  if (!enabled) return null;
  if (vp.mobile) await btn.tap(); else await btn.dblclick(); // duplo clique de propósito: teste de repetição
  for (let i = 0; i < 2; i++) {
    await sleep(350);
    const again = page.locator('[data-service-action="villageJobFinish"]').first();
    if ((await again.count()) && !(await again.isDisabled())) { if (vp.mobile) await again.tap(); else await again.click(); }
  }
  for (let t = 0; t < 50; t++) { if ((await readState(page)).balance !== before) break; await sleep(300); }
  await sleep(2500); // deixa qualquer clique repetido chegar ao servidor
  const after = (await readState(page)).balance;
  const dom = await panelDom(page);
  check(vp.name, `${pointId}: carteira depois - antes = ${PAYMENT_BRONZE}, sem crédito extra por clique repetido`,
    after - before === PAYMENT_BRONZE, { before, after, delta: after - before, payment: dom.payment, toast: dom.toast });
  check(vp.name, `${pointId}: aviso de pagamento exibido`, Boolean(dom.payment && dom.payment.includes(String(PAYMENT_BRONZE))), dom.payment);
  return { before, after };
}

async function runDesktop(browser, vp) {
  const account = await register(`d${vp.name}`);
  await fixtureAtBoard(account);
  const rec = { errors: [] };
  const { context, page } = await openGame(browser, vp, account, rec);
  try {
    log(vp.name, `conta real nova ${account.username} no quadro (teclado)`);
    await shot(page, vp, 1, 'mundo-quadro');
    await openPanel(page, vp);
    const dom = await panelDom(page);
    check(vp.name, 'painel no quadro lista 2 ofícios', dom.cards.length === 2, dom.cards.map(c => c.text));
    await shot(page, vp, 2, 'painel-dois-oficios');
    report.layout.push({ vp: vp.name, phase: 'painel-aberto', ...(await layoutDom(page)) });
    await closePanel(page, vp, 'escape');
    check(vp.name, 'Escape fecha o painel', !(await isDialogOpen(page)));
    await openPanel(page, vp);
    await closePanel(page, vp, 'button');
    check(vp.name, 'botão Fechar fecha o painel', !(await isDialogOpen(page)));
    await openPanel(page, vp);
    const started = await startJob(page, vp, 'carrier');
    if (started) {
      await ensurePanel(page, vp);
      await shot(page, vp, 3, 'turno-em-andamento');
      await closePanel(page, vp, 'escape');
      await shot(page, vp, 4, 'turno-andamento-hud');
      const walk = await walkTo(page, vp, 'delivery');
      check(vp.name, 'chegou à entrega por teclado', walk.ok, walk.distance);
      await waitReady(page);
      report.desktopCarrier = await finishJob(page, vp, 'delivery', 'Entregar caixa');
      await shot(page, vp, 5, 'pagamento-carteira');
      check(vp.name, 'carteira mostrada no painel', (await panelDom(page)).wallet.startsWith('Carteira:'), (await panelDom(page)).wallet);
    }
  } catch (error) {
    check(vp.name, 'fluxo de teclado sem exceção', false, String(error?.message || error));
  } finally {
    report.errors.push(...rec.errors.map(e => ({ vp: vp.name, ...e })));
    await context.close();
  }
}

async function runMobile(browser, vp, { withFirekeeper }) {
  const account = await register(`m${vp.name}`);
  await fixtureAtBoard(account);
  const rec = { errors: [] };
  const { context, page } = await openGame(browser, vp, account, rec);
  try {
    log(vp.name, `conta real nova ${account.username} no quadro (toque)`);
    await shot(page, vp, 1, 'mundo-quadro');
    await openPanel(page, vp);
    const dom = await panelDom(page);
    check(vp.name, 'painel no quadro lista 2 ofícios', dom.cards.length === 2, dom.cards.map(c => c.text));
    await shot(page, vp, 2, 'painel-dois-oficios');
    const layout = await layoutDom(page);
    report.layout.push({ vp: vp.name, phase: 'painel-aberto', ...layout });
    if (vp.name === '320') check(vp.name, 'sem rolagem horizontal no painel (320)', layout.dialogOverflowPx <= 0 && layout.docOverflowPx <= 0, layout);
    const started = await startJob(page, vp, 'carrier');
    if (started) {
      await ensurePanel(page, vp);
      await shot(page, vp, 3, 'turno-em-andamento');
      await closePanel(page, vp, 'button');
      await shot(page, vp, 4, 'turno-andamento-hud');
      const walk = await walkTo(page, vp, 'delivery');
      check(vp.name, 'chegou à entrega por teclado', walk.ok, walk.distance);
      await waitReady(page);
      await finishJob(page, vp, 'delivery', 'Entregar caixa');
      await shot(page, vp, 5, 'pagamento-carteira');
      check(vp.name, 'carteira mostrada no painel', (await panelDom(page)).wallet.startsWith('Carteira:'), (await panelDom(page)).wallet);
      await closePanel(page, vp, 'button');
    }
    if (withFirekeeper && started && !overBudget()) {
      const walk = await walkTo(page, vp, 'hearth');
      check(vp.name, 'chegou à fogueira por teclado', walk.ok, walk.distance);
      await openPanel(page, vp);
      const fire = await startJob(page, vp, 'firekeeper');
      if (fire) {
        await ensurePanel(page, vp);
        await shot(page, vp, 6, 'turno-fogo');
        await closePanel(page, vp, 'button');
        await waitReady(page);
        await finishJob(page, vp, 'hearth', 'Receber pagamento');
        await openPanel(page, vp);
        await shot(page, vp, 7, 'pagamento-carteira-fogo');
        check(vp.name, 'carteira mostrada no painel (fogo)', (await panelDom(page)).wallet.startsWith('Carteira:'), (await panelDom(page)).wallet);
        await closePanel(page, vp, 'button');
      }
    } else if (withFirekeeper) skip(vp.name, 'ajudante do fogo');
    if (vp.name === '320') report.layout.push({ vp: vp.name, phase: 'fim', ...(await layoutDom(page)) });
  } catch (error) {
    check(vp.name, 'fluxo de toque sem exceção', false, String(error?.message || error));
  } finally {
    report.errors.push(...rec.errors.map(e => ({ vp: vp.name, ...e })));
    await context.close();
  }
}

async function runGuestRefusal(browser) {
  const vp = VIEWPORTS[0];
  const account = await guest();
  await fixtureAtBoard(account);
  const rec = { errors: [] };
  const { context, page } = await openGame(browser, vp, account, rec);
  try {
    await openPanel(page, vp);
    const dom = await panelDom(page);
    const starts = dom.cards.flatMap(c => c.buttons).filter(b => b.action === 'villageJobStart');
    check('visitante', 'visitante vê os ofícios com início desabilitado', starts.length > 0 && starts.every(b => b.disabled), dom.cards.map(c => c.text));
    const text = await page.locator('#lodging-dialog').innerText();
    check('visitante', 'aviso de conta exigida no painel', text.includes('Entre com uma conta'), text.slice(0, 300));
    await shot(page, { name: 'visitante', mobile: false }, 1, 'visitante-consulta');
  } catch (error) {
    check('visitante', 'consulta de visitante sem exceção', false, String(error?.message || error));
  } finally {
    report.errors.push(...rec.errors.map(e => ({ vp: 'visitante', ...e })));
    await context.close();
  }
}

let browser = null;
let exitCode = 0;
try {
  await sandboxReady;
  report.sandbox = { pid: sandboxPid, stateDir, base: BASE, roomPort: ROOM_PORT };
  log('setup', `sandbox pronto pid=${sandboxPid} estado=${stateDir}`);
  await writeFile(path.join(stateDir, 'sky-overrides.json'), JSON.stringify(SKY, null, 2));
  log('setup', `céu fixo gravado, startedAt=${report.skyStartedAt}`);
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

  // Desktop 1440: carregador completo com teclado (E, Fechar, Escape) e movimento real.
  await runDesktop(browser, VIEWPORTS[0]);
  // Celular 390: toque nos botões, carregador e ajudante do fogo.
  if (!overBudget()) await runMobile(browser, VIEWPORTS[1], { withFirekeeper: true });
  else skip('390', 'fluxo do celular');
  // Celular 320: painel, overflow e carregador.
  if (!overBudget()) await runMobile(browser, VIEWPORTS[2], { withFirekeeper: false });
  else skip('320', 'fluxo de 320');
  // Visitante: consulta sem trabalhar.
  if (!overBudget()) await runGuestRefusal(browser);
  else skip('visitante', 'consulta de visitante');
} catch (error) {
  exitCode = 1;
  report.fatal = String(error?.stack || error);
  console.error('FALHA FATAL', report.fatal);
} finally {
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
  report.limitations = [
    'Hearth: a posição vem de VILLAGE_JOB_POINTS como está no catálogo. Se o catálogo ainda não aponta para a fogueira real (SPAWN_CAMPFIRE), a caminhada e o alcance refletem o catálogo, não a fogueira.',
    'Movimento só por teclado (setas) nos três viewports. O toque no chão não caminha: a projeção de tela não é exposta por leitura somente.',
    'Caminhada sem trilha: o contorno de obstáculo é só troca de seta. Se um obstáculo bloquear, o alcance falha e aparece no relatório.',
    'Consulta de visitante: verificada pela interface (início desabilitado e aviso). A recusa do servidor a uma ação de visitante não foi exercitada sem alterar o jogo.',
    'Snapshot de ofícios não está em inspectMovement: turno e pagamento são lidos do DOM (painel e indicador de progresso). lastPayment/active do snapshot não são lidos diretamente.',
    'Cota diária: cada conta conclui uma vez por ofício; o limite diário não é exercitado.',
    'Tempo: o comando tem 300 s. Fases que passarem do orçamento de 265 s são puladas e listadas em skipped.',
    'Nenhuma aprovação é declarada por este script: o resultado é prova automatizada para revisão do dono.',
  ];
  const lines = [
    '# Prova candidata — ofícios da vila (navegador real)', '',
    `- Commit: \`${commit}\``, `- Worktree: \`${WT}\``,
    `- Início: ${report.startedAt}; fim: ${report.finishedAt}`,
    `- Céu fixo: startedAt ${report.skyStartedAt}, hora 12, clima limpo, escopo permanente (estado do sandbox)`,
    `- Sandbox: PID ${sandboxPid}, encerrado: ${report.sandboxClosed?.alive ?? 'n/a'}`,
    `- Erro fatal: ${report.fatal ?? 'nenhum'}`, '',
    '## Asserções', '', '| Viewport | Verificação | Resultado |', '|---|---|---|',
    ...report.assertions.map(a => `| ${a.vp} | ${a.name} | ${a.ok ? 'OK' : 'FALHA'} |`),
    '', '## Capturas', '', ...report.screenshots.map(s => `- ${s.vp} · ${s.label}: \`${s.file}\``),
    '', '## Erros JS/console/HTTP', '', ...(report.errors.length ? report.errors.map(e => `- ${JSON.stringify(e)}`) : ['- nenhum']),
    '', '## Layout (overflow e foco)', '', ...report.layout.map(l => `- ${l.vp} · ${l.phase}: overflow documento ${l.docOverflowPx}px, diálogo ${l.dialogOverflowPx}px, foco ${JSON.stringify(l.focus)}`),
    '', '## Pulado', '', ...(report.skipped.length ? report.skipped.map(s => `- ${s.vp}: ${s.name} (${s.reason})`) : ['- nada']),
    '', '## Limitações', '', ...report.limitations.map(l => `- ${l}`), '',
    `Dados brutos: \`${path.join(EVID, 'candidate-report.json')}\``,
  ];
  await writeFile(path.join(EVID, 'candidate-report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(EVID, 'candidate-report.md'), lines.join('\n') + '\n');
  console.log('RELATÓRIO', path.join(EVID, 'candidate-report.md'));
  if (report.assertions.some(a => !a.ok)) exitCode = exitCode || 1;
  process.exitCode = exitCode;
}
