// Keep recovery independent of the game module graph: a failed import never starts main.
const loading = document.querySelector('#scene-loading');
const message = document.querySelector('#loading-message');
const reload = document.querySelector('#loading-reload');
const loadingProgress = document.querySelector('#loading-progress');
const loadingPercent = document.querySelector('#loading-percent');
const loadingCaption = document.querySelector('#loading-caption');
const initialLoadHistoryKey = 'clareira:initial-load-duration-v1';
const initialLoadStages = ['files', 'session', 'character', 'scene'];
function initialProgressWeights() {
  const fallback = { files: 0.25, session: 0.25, character: 0.25, scene: 0.25 };
  try {
    const history = JSON.parse(localStorage.getItem(initialLoadHistoryKey) || '{}');
    const samples = Array.isArray(history.all) ? history.all.slice(-7) : [];
    const medians = {};
    for (const stage of initialLoadStages) {
      const values = samples.map(sample => Number(sample?.[stage]))
        .filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
      if (!values.length) return fallback;
      medians[stage] = values[Math.floor(values.length / 2)];
    }
    const total = initialLoadStages.reduce((sum, stage) => sum + medians[stage], 0);
    return Object.fromEntries(initialLoadStages.map(stage => [stage, medians[stage] / total]));
  } catch { return fallback; }
}
const initialProgressStageWeights = initialProgressWeights();
let initialPercentValue = Math.max(0, Math.min(100, Number(loadingProgress?.getAttribute('aria-valuenow')) || 0));
let initialPercentTarget = initialPercentValue;
let initialPercentFrame = null;
function setInitialTotalPercent(requested, immediate = false) {
  if (window.__clareiraMainLoadingProgressReady) return;
  const numeric = Number(requested);
  const target = Math.max(initialPercentTarget, Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0);
  initialPercentTarget = target;
  if (initialPercentFrame !== null) {
    if (!immediate) return;
    cancelAnimationFrame(initialPercentFrame);
    initialPercentFrame = null;
  }
  const start = Math.max(0, Math.min(100, initialPercentValue));
  const duration = immediate || matchMedia("(prefers-reduced-motion: reduce)").matches ? 0
    : Math.min(560, Math.max(220, Math.abs(target - start) * 13));
  const startedAt = performance.now();
  const render = value => {
    if (window.__clareiraMainLoadingProgressReady) return;
    const visible = Number.parseFloat(loadingProgress?.getAttribute("aria-valuenow"));
    const requestedValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    const safeValue = Math.max(requestedValue, Number.isFinite(visible) ? visible : 0);
    initialPercentValue = safeValue;
    loadingProgress?.setAttribute("aria-valuenow", safeValue.toFixed(1));
    loadingProgress?.setAttribute("aria-valuetext", safeValue.toFixed(1).replace(".", ",") + "% do carregamento");
    loadingProgress?.style.setProperty("--loading-progress", safeValue + "%");
    loading?.style.setProperty("--loading-scene-progress", String(safeValue / 100));
    if (loadingPercent) {
      loadingPercent.textContent = safeValue.toFixed(1).replace(".", ",") + "%";
      loadingPercent.hidden = false;
      loadingPercent.setAttribute("aria-hidden", "false");
    }
  };
  if (!duration) { render(target); initialPercentFrame = null; return; }
  const tick = now => {
    if (window.__clareiraMainLoadingProgressReady) { initialPercentFrame = null; return; }
    const ratio = Math.max(0, Math.min(1, (now - startedAt) / duration));
    const eased = 1 - Math.pow(1 - ratio, 3);
    render(start + (initialPercentTarget - start) * eased);
    if (ratio < 1) initialPercentFrame = requestAnimationFrame(tick);
    else { render(initialPercentTarget); initialPercentFrame = null; }
  };
  initialPercentFrame = requestAnimationFrame(tick);
}

function advanceLoadingProgress(requested) {
  return Math.max(0, Math.min(100, Number(requested) || 0));
}
window.__clareiraAdvanceLoadingProgress = advanceLoadingProgress;
const loadingPhrases = [
  'Toda trilha começa com um primeiro passo.',
  'Há sempre uma luz acesa em algum canto do bosque.',
  'Às vezes, o melhor caminho é aquele que ainda não conhecemos.',
  'Respire fundo. A Clareira está despertando.',
  'Boas histórias começam quando alguém chega.',
  'Até a noite guarda seus pequenos encantos.',
  'Um instante de calma antes da próxima aventura.',
];
const loadingPhraseOpeners = [
  'No coração do bosque,', 'Perto da fogueira,', 'Ao cair da noite,',
  'Entre uma trilha e outra,', 'Na beira do riacho,', 'Sob as copas antigas,',
  'No silêncio da manhã,', 'Quando a chuva passa,', 'À luz das janelas,',
  'Depois da última curva,',
];
const loadingPhraseSubjects = [
  { text: 'a brisa', plural: false }, { text: 'o riacho', plural: false },
  { text: 'a luz da fogueira', plural: false }, { text: 'uma coruja curiosa', plural: false },
  { text: 'o caminho de pedras', plural: false }, { text: 'as folhas douradas', plural: true },
  { text: 'a lua', plural: false }, { text: 'um viajante cansado', plural: false },
  { text: 'as lanternas acesas', plural: true }, { text: 'o bosque inteiro', plural: false },
];
const loadingPhrasePredicates = [
  ['guarda espaço para novas histórias', 'guardam espaço para novas histórias'],
  ['segue seu próprio ritmo', 'seguem seu próprio ritmo'],
  ['acolhe quem chega sem pressa', 'acolhem quem chega sem pressa'],
  ['esconde pequenos sinais pelo caminho', 'escondem pequenos sinais pelo caminho'],
  ['convida a olhar mais de perto', 'convidam a olhar mais de perto'],
  ['transforma o silêncio em companhia', 'transformam o silêncio em companhia'],
  ['faz cada chegada parecer especial', 'fazem cada chegada parecer especial'],
];
for (const opener of loadingPhraseOpeners) {
  for (const subject of loadingPhraseSubjects) {
    for (const predicate of loadingPhrasePredicates) {
      loadingPhrases.push(opener + ' ' + subject.text + ' ' + predicate[Number(subject.plural)] + '.');
    }
  }
}
const loadingPhraseCycleKey = 'clareira:loading-phrase-cycle-v2';
let loadingPhraseOrder = [];
let loadingPhraseCursor = 0;
let currentLoadingPhrase = '';
function shuffleLoadingPhrases() {
  const order = loadingPhrases.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}
function saveLoadingPhraseCycle() {
  try {
    sessionStorage.setItem(loadingPhraseCycleKey, JSON.stringify({
      order: loadingPhraseOrder, cursor: loadingPhraseCursor,
    }));
  } catch {}
}
function loadLoadingPhraseCycle() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(loadingPhraseCycleKey) || 'null');
    if (saved && Array.isArray(saved.order) && saved.order.length === loadingPhrases.length
        && Number.isSafeInteger(saved.cursor) && saved.cursor >= 0 && saved.cursor <= saved.order.length
        && new Set(saved.order).size === loadingPhrases.length
        && saved.order.every(index => Number.isSafeInteger(index) && index >= 0 && index < loadingPhrases.length)) {
      loadingPhraseOrder = saved.order;
      loadingPhraseCursor = saved.cursor;
      return;
    }
  } catch {}
  loadingPhraseOrder = shuffleLoadingPhrases();
  loadingPhraseCursor = 0;
}
function nextLoadingPhrase() {
  if (!loadingPhraseOrder.length) loadLoadingPhraseCycle();
  if (loadingPhraseCursor >= loadingPhraseOrder.length) {
    const previous = loadingPhraseOrder.at(-1);
    loadingPhraseOrder = shuffleLoadingPhrases();
    loadingPhraseCursor = 0;
    if (loadingPhraseOrder[0] === previous) {
      [loadingPhraseOrder[0], loadingPhraseOrder[1]] = [loadingPhraseOrder[1], loadingPhraseOrder[0]];
    }
  }
  currentLoadingPhrase = loadingPhrases[loadingPhraseOrder[loadingPhraseCursor++]];
  saveLoadingPhraseCycle();
  return currentLoadingPhrase;
}
function showLoadingPhrase(advance = false) {
  if (loading.hidden || loading.dataset.context !== 'login' || loading.dataset.phase === 'error') return;
  if (advance || !currentLoadingPhrase) nextLoadingPhrase();
  if (message.textContent === currentLoadingPhrase) return;
  message.textContent = currentLoadingPhrase;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    message.animate([{ opacity: 0.45, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 380, easing: 'ease-out',
    });
  }
}
window.__clareiraLoadingPhrase = showLoadingPhrase;
showLoadingPhrase(true);
setInterval(() => showLoadingPhrase(true), 6500);
const loadingMiniStep = document.querySelector('[data-loading-step="current"]');
// Keep only bounded technical categories; never store messages, URLs or account data.
const loadingDiagnosticKey = 'clareira:loading-diagnostics-v1';
const loadingDiagnosticStartedAt = performance.now();
let loadingDiagnosticSending = false;
function readLoadingDiagnostics() {
  try { const events = JSON.parse(sessionStorage.getItem(loadingDiagnosticKey) || '[]'); return Array.isArray(events) ? events.slice(-8) : []; } catch { return []; }
}
async function flushLoadingDiagnostics() {
  if (loadingDiagnosticSending || navigator.onLine === false) return;
  const events = readLoadingDiagnostics(); if (!events.length) return;
  loadingDiagnosticSending = true;
  let delivered = false;
  try {
    const response = await fetch(new URL('./loading-diagnostics', import.meta.url), { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }), signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const current = readLoadingDiagnostics();
      if (JSON.stringify(current.slice(0, events.length)) === JSON.stringify(events)) { sessionStorage.setItem(loadingDiagnosticKey, JSON.stringify(current.slice(events.length))); delivered = true; }
    }
  } catch {} finally { loadingDiagnosticSending = false; }
  if (delivered && readLoadingDiagnostics().length) void flushLoadingDiagnostics();
}
function reportLoadingFailure(reason, phase = loading.dataset.phase) {
  const phases = ['manifest','checking-cache','downloading','verifying','activating','files','session','character','scene','world'];
  const reasons = ['timeout','offline','integrity','network','session','scene','unknown'];
  const event = { phase: phases.includes(phase) ? phase : 'unknown', reason: reasons.includes(reason) ? reason : 'unknown',
    elapsedMs: Math.max(0, Math.min(86400000, Math.round(performance.now() - loadingDiagnosticStartedAt))),
    percent: Math.max(0, Math.min(100, Number(loadingProgress?.getAttribute('aria-valuenow')) || 0)) };
  try { sessionStorage.setItem(loadingDiagnosticKey, JSON.stringify([...readLoadingDiagnostics(), event].slice(-8))); } catch {}
  void flushLoadingDiagnostics();
}
window.__clareiraReportLoadingFailure = reportLoadingFailure;
window.addEventListener('online', flushLoadingDiagnostics);
void flushLoadingDiagnostics();
const retryKey = 'clareira:bootstrap-retries';
let retryTimer = null;
let deadline = null;
let recoveryScheduled = false;
let waitingForNetwork = false;
function waitForNetworkRecovery() {
  if (navigator.onLine !== false) return false;
  if (deadline) clearTimeout(deadline);
  if (retryTimer) clearTimeout(retryTimer);
  loading.hidden = false;
  loading.dataset.phase = 'error';
  loading.dataset.progressMode = 'indeterminate';
  loadingPercent.hidden = true;
  updateLoadingMini('files', 0, 'error', 'indeterminate', 'Sem conexão');
  message.textContent = 'Sem conexão. O carregamento continuará quando a internet voltar.';
  loadingCaption.textContent = message.textContent;
  reload.hidden = true;
  if (!waitingForNetwork) {
    waitingForNetwork = true;
    reportLoadingFailure('offline');
    window.addEventListener('online', () => { if (!loading.hidden) location.reload(); }, { once: true });
  }
  return true;
}
function updateLoadingMini(stage, percent, state, mode = 'determinate', detail = '') {
  if (window.__clareiraMainLoadingProgressReady) return;
  const initialScreen = loading.dataset.context !== 'world';
  const step = loadingMiniStep;
  const requested = Math.max(0, Math.min(100, Number(percent) || 0));
  const visibleStage = stage === 'dimension' ? 'scene' : stage;
  const stageChanged = initialScreen && step.dataset.stage !== visibleStage;
  if (stageChanged) {
    step.dataset.stageReset = 'true';
    requestAnimationFrame(() => {
      if (step.dataset.stage === visibleStage) delete step.dataset.stageReset;
    });
  }
  loading.dataset.loadingStage = visibleStage;
  const currentTrack = step.querySelector('[role="progressbar"]');
  const prior = initialScreen && step.dataset.stage === visibleStage
    ? Math.max(0, Number.parseFloat(currentTrack.style.getPropertyValue('--loading-mini-progress')) || 0)
    : 0;
  const value = initialScreen ? Math.max(prior, requested) : requested;
  const labels = { files: 'Arquivos', session: 'Sessão', character: 'Personagem', scene: 'Local' };
  step.dataset.activeStage = visibleStage;
  step.dataset.stage = visibleStage;
  step.querySelector('[data-loading-label]').textContent = labels[visibleStage] || 'Local';
  step.dataset.state = state;
  step.setAttribute('aria-hidden', String(state === 'pending'));
  step.dataset.progressMode = mode;
  const track = step.querySelector('[role="progressbar"]');
  track.style.setProperty('--loading-mini-progress', `${value}%`);
  if (mode === 'indeterminate') track.removeAttribute('aria-valuenow');
  else track.setAttribute('aria-valuenow', value.toFixed(1));
  track.setAttribute('aria-valuetext', mode === 'indeterminate' ? (detail || 'Em andamento') : `${value.toFixed(1)}%${detail ? ` · ${detail}` : ''}`);
  const description = step.querySelector('[data-loading-detail]');
  if (description && detail) description.textContent = detail;
  const stages = ['files', 'session', 'character', 'scene'];
  document.querySelectorAll('[data-checkpoint]').forEach(checkpoint => {
    const index = stages.indexOf(checkpoint.dataset.checkpoint), current = stages.indexOf(visibleStage);
    checkpoint.dataset.state = index < current || (index === current && state === 'complete') ? 'complete'
      : index === current ? state : 'pending';
  });
}
updateLoadingMini('files', 0, 'pending', 'determinate');
function showFinalRecovery(error) {
  if (loading.hidden) return;
  const detail = String(error?.message || 'Falha inesperada ao iniciar o jogo.').replace(/\s+/gu, ' ').slice(0, 180);
  loading.dataset.phase = 'error';
  loading.dataset.progressMode = 'indeterminate';
  loadingPercent.hidden = true;
  loadingPercent.setAttribute('aria-hidden', 'true');
  updateLoadingMini('files', 0, 'error', 'indeterminate', 'Falha');
  message.textContent = `Erro ao carregar: ${detail}`;
  loadingCaption.textContent = detail;
  reload.hidden = false;
  reload.textContent = 'Tentar recarregar';
  reload.onclick = () => {
    try { sessionStorage.removeItem(retryKey); } catch {}
    location.reload();
  };
}
function retryCount() {
  try {
    const value = Number(sessionStorage.getItem(retryKey) || 0);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch { return null; }
}
function scheduleRecovery() {
  if (loading.hidden || recoveryScheduled) return;
  if (waitForNetworkRecovery()) return;
  recoveryScheduled = true;
  reportLoadingFailure('timeout');
  showFinalRecovery(new Error('O preparo de arquivos está demorando. Tente novamente para retomar o cache já conferido.'));
}
async function readGameVersion() {
  try {
    const response = await fetch(new URL('./update-version', import.meta.url), {
      cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result.version === 'string' && /^[a-f0-9]{64}$/u.test(result.version)
      ? result.version : null;
  } catch {
    return null;
  }
}

function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function showCacheProgress(progress) {
  const total = Number(progress.total) || 0;
  const completed = Number(progress.completed) || 0;
  const overallTotal = Number(progress.overallTotal);
  const overallCompleted = Number(progress.overallCompleted);
  const hasTaskProgress = Number.isSafeInteger(overallTotal) && overallTotal > 0
    && Number.isSafeInteger(overallCompleted);
  const overallFraction = Number(progress.overallFraction);
  const hasByteProgress = Number.isFinite(overallFraction) && overallFraction >= 0 && overallFraction <= 1;
  const phasePercent = progress.phase === 'complete' ? 100
    : hasByteProgress ? overallFraction * 100
      : hasTaskProgress
      ? Math.max(0, Math.min(100, overallCompleted / overallTotal * 100))
      : ['checking-cache', 'downloading', 'verifying'].includes(progress.phase) && total > 0
        ? Math.max(0, Math.min(100, completed / total * 100))
        : null;
  const percent = phasePercent === null ? null : advanceLoadingProgress(phasePercent);
  const phaseDetails = {
    'checking-cache': 'Arquivos do cache', downloading: 'Arquivos do jogo',
    verifying: 'Conferindo arquivos', activating: 'Preparando arquivos',
  };
  const filesDetail = progress.phase === 'complete' ? 'Pronto'
    : `${phaseDetails[progress.phase] || 'Preparando arquivos'}${total ? ` · ${completed}/${total} arquivos` : ''}`;
  const progressCompleted = hasTaskProgress ? overallCompleted : completed;
  const progressTotal = hasTaskProgress ? overallTotal : total;
  window.__clareiraInitialCacheProgress = {
    completed: progressCompleted, total: progressTotal,
    fraction: percent === null ? null : percent / 100,
    phase: progress.phase, complete: progress.phase === 'complete',
  };
  const filesProgressDetail = progress.phase === 'complete' ? 'Pronto'
    : `${progress.phase === 'verifying' || progress.phase === 'checking-cache' ? 'Conferindo' : 'Baixando'} · ${completed}/${total}`;
  window.__clareiraSyncInitialCacheProgress?.(window.__clareiraInitialCacheProgress);
  updateLoadingMini('files', percent ?? 0,
    progress.phase === 'complete' ? 'complete' : 'active', 'determinate', filesProgressDetail);
  showLoadingPhrase();
  if (loadingCaption) loadingCaption.textContent = filesDetail;
  // The large bar is reserved for the whole initial load. Cache work has its
  // own small stage bar until session and scene totals are known.
  loading.dataset.phase = progress.phase;
  loading.dataset.loadingStage = 'files';
  loading.dataset.progressMode = 'determinate';
  setInitialTotalPercent(initialProgressStageWeights.files * (percent ?? 0));
  if (deadline) {
    clearTimeout(deadline);
    deadline = setTimeout(scheduleRecovery, 90_000);
  }
}

async function registerCacheWorker() {
  if (!navigator.serviceWorker || !globalThis.caches || !globalThis.crypto?.subtle) {
    throw new Error('Este navegador não oferece cache verificado para as atualizações.');
  }
  showLoadingPhrase();
  loadingCaption.textContent = message.textContent;
  updateLoadingMini('files', 0, 'active', 'determinate', 'Preparando arquivos');
  loading.dataset.progressMode = 'determinate';
  setInitialTotalPercent(initialPercentTarget);
  const workerUrl = new URL('./service-worker.js', import.meta.url);
  const scopeUrl = new URL('./', import.meta.url);
  const registration = await navigator.serviceWorker.register(workerUrl, { scope: scopeUrl.pathname, updateViaCache: 'none' });
  const updatingWorker = registration.installing || registration.waiting;
  if (updatingWorker && updatingWorker.state !== 'activated') {
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); updatingWorker.removeEventListener('statechange', changed); };
      const changed = () => {
        if (updatingWorker.state === 'activated') { cleanup(); resolve(); }
        else if (updatingWorker.state === 'redundant') { cleanup(); reject(new Error('A atualização do cache foi interrompida.')); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('A atualização do cache não respondeu.')); }, 10_000);
      updatingWorker.addEventListener('statechange', changed);
      changed();
    });
  }
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('O cache do jogo não ficou pronto a tempo.')), 10_000);
    const ready = () => {
      if (!navigator.serviceWorker.controller) return;
      clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', ready);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', ready);
    ready();
  });
}

async function beginDownloadCapacityLease() {
  const fallbackConcurrency = 16;
  if (!globalThis.crypto?.getRandomValues) return { concurrency: fallbackConcurrency, close() {} };
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  const endpoint = new URL('./download-capacity', import.meta.url);
  let concurrency = fallbackConcurrency, closed = false, timer = null, requestPending = false;
  const send = async action => {
    if (requestPending || (closed && action !== 'release')) return;
    requestPending = true;
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) return;
      const policy = await response.json();
      const requested = Number(policy.maxConcurrentRequests);
      if (Number.isInteger(requested)) concurrency = Math.max(1, Math.min(24, requested));
    } catch {}
    finally { requestPending = false; }
  };
  await send('start');
  timer = setInterval(() => { void send('heartbeat'); }, 4_000);
  return {
    getConcurrency: () => concurrency,
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      void send('release');
    },
  };
}

async function startGame() {
  deadline = setTimeout(scheduleRecovery, 90_000);
  showLoadingPhrase();
  // Stylesheets preceding this module have finished loading or failed. Keep
  // the real interface hidden when its stylesheet could not be applied.
  const stylesheet = document.querySelector('link[rel="stylesheet"][href="/dev/style.css"]');
  let stylesheetReady = false;
  try { stylesheetReady = Boolean(stylesheet?.sheet?.cssRules.length); } catch {}
  if (!stylesheetReady) throw new Error('Não foi possível carregar o visual do jogo.');
  document.documentElement.classList.add('clareira-styles-ready');
  const { synchronizeGameCache } = await import('./cache-update.mjs');
  // Some embedded browsers (such as the desktop app's pane) refuse the service worker.
  // The game still loads over the network; only the offline cache and its update check are skipped.
  let cacheAvailable = true;
  let cacheState = null;
  try { await registerCacheWorker(); }
  catch (error) {
    cacheAvailable = false;
    console.warn('Cache do jogo indisponível; carregando pela rede.', error);
    // Nothing to download here, so the file stage is complete rather than stuck at its start.
    showCacheProgress({ phase: 'complete', total: 0, completed: 0 });
  }
  if (cacheAvailable) {
    const downloadLease = await beginDownloadCapacityLease();
    try {
      cacheState = await synchronizeGameCache({
        manifestUrl: new URL('./game-assets', import.meta.url),
        scopeUrl: new URL('./', import.meta.url),
        onProgress: showCacheProgress,
        getDownloadConcurrency: downloadLease.getConcurrency,
      });
    } finally { downloadLease.close(); }
    if (cacheState.changed && cacheState.oldVersion) {
      showLoadingPhrase();
      await new Promise(resolve => setTimeout(resolve, 80));
      location.reload();
      return;
    }
  }
  // Let the completed file stage finish filling before session verification
  // replaces it. This is a presentation hold after the real cache is ready.
  await new Promise(resolve => setTimeout(resolve,
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 1000 : 1420));
  const main = await import('./main.js');
  clearTimeout(deadline);
  clearTimeout(retryTimer);
  recoveryScheduled = false;
  try { sessionStorage.removeItem(retryKey); } catch {}
  reload.onclick = null;
  const startupVersion = cacheState?.version || await readGameVersion();
  void import('./update-monitor.mjs').then(({ createGameUpdateMonitor }) => {
    const monitor = createGameUpdateMonitor({
      initialVersion: startupVersion,
      fetchVersion: readGameVersion,
      canReload: main.canApplyGameUpdate,
      reload: () => location.reload(),
      notifyWaiting: () => window.dispatchEvent(new Event('clareira:update-waiting')),
    });
    monitor.start();
  }).catch(error => console.warn('Não consegui iniciar a verificação automática de atualizações.', error));
}

function handleStartupError(error) {
  const failureText = String(error?.message || '').toLowerCase();
  reportLoadingFailure(error?.code === 'GAME_CACHE_TIMEOUT' ? 'timeout' : /conferência|validar|correspond/u.test(failureText) ? 'integrity' : /fetch|download|rede|conex/u.test(failureText) ? 'network' : 'unknown');
  if (deadline) clearTimeout(deadline);
  if (retryTimer) clearTimeout(retryTimer);
  console.error('Falha ao conferir o cache do jogo.', error);
  const attempts = retryCount();
  if (loading.hidden) return;
  if (waitForNetworkRecovery()) return;
  if (attempts !== null && attempts < 3) {
    try { sessionStorage.setItem(retryKey, String(attempts + 1)); }
    catch { showFinalRecovery(error); return; }
    loading.dataset.phase = 'error';
    message.textContent = `Falha ao carregar. Tentando novamente automaticamente (${attempts + 1}/3)…`;
    loadingCaption.textContent = String(error?.message || 'O carregamento não pôde ser concluído.');
    retryTimer = setTimeout(() => {
      if (!loading.hidden && !waitForNetworkRecovery()) {
        recoveryScheduled=false;reload.hidden=true;
        startGame().catch(handleStartupError);
      }
    }, 900 * 2 ** attempts);
    return;
  }
  showFinalRecovery(error);
}

startGame().catch(handleStartupError);
