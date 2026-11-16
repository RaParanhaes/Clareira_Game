// Apresentação DOM dos ofícios: conteúdo do painel comum de atendimento e o
// indicador de progresso que fica fora do diálogo. Não abre nenhuma janela e
// não envia nada por conta própria; cada botão só dispara uma ação que o
// painel comum já encaminha ao servidor.
import {
  normalizeVillageJobs, villageJobRemainingMs, villageJobProgress, formatJobCountdown, villageJobStageLabel,
  villageJobStartState, villageJobFinishState, villageJobCancelAvailable, villageJobPaymentNotice,
  villageJobTurnsLine, villageJobDirections, formatBronze, VILLAGE_JOB_POINT_LABELS,
} from './village-jobs-client.mjs';

const FINISH_LABELS = Object.freeze({ carrier: 'Entregar caixa', firekeeper: 'Receber pagamento' });

// Preenche `fragment` com o conteúdo da página "Trabalhos da vila".
// Devolve as referências vivas do turno ativo (ou null), para que o relógio do
// painel atualize só contagem e botão, sem refazer a página nem perder foco.
export function renderVillageJobsPanel(fragment, { element, actionButton, snapshot, pointId, nearPoint = true, guest = false, nowMs = Date.now() }) {
  const state = normalizeVillageJobs(snapshot);
  if (!state) { fragment.append(element('p', 'Carregando trabalhos da vila…', 'lodging-note')); return null; }
  if (state.requiresAccount || guest) fragment.append(element('p', 'Visitantes podem consultar. Entre com uma conta para trabalhar.', 'lodging-note'));
  const payment = villageJobPaymentNotice(state.lastPayment);
  if (payment) fragment.append(element('p', payment, 'lodging-note village-job-payment'));

  if (state.active) {
    const active = state.active;
    const job = state.jobs.find(item => item.id === active.jobId);
    const remaining = villageJobRemainingMs(active, nowMs);
    const card = element('div', '', 'lodging-option village-job-card village-job-active');
    const countdown = element('span', formatJobCountdown(remaining));
    const line = element('small', '');
    line.append(countdown, ` · ${VILLAGE_JOB_POINT_LABELS[active.targetId] || 'ponto indicado'}`);
    card.append(element('strong', `${job?.label || 'Turno ativo'} · ${villageJobStageLabel(active)}`), line);
    const finish = villageJobFinishState({ active, pointId, nowMs, nearPoint, guest });
    const reason = element('small', finish.reason);
    let finishButton = null;
    if (pointId === active.targetId) {
      finishButton = actionButton(FINISH_LABELS[active.jobId] || 'Concluir', 'villageJobFinish', { runId: active.runId }, !finish.enabled);
      finishButton.dataset.focusKey = 'village-job-finish';
      card.append(finishButton, reason);
    } else card.append(reason);
    if (villageJobCancelAvailable(active, guest)) {
      const cancel = actionButton('Cancelar turno', 'villageJobCancel', { runId: active.runId }, false);
      cancel.dataset.focusKey = 'village-job-cancel';
      card.append(cancel, element('small', 'Cancelar não tem custo. A cota de hoje não é consumida.'));
    }
    fragment.append(card);
    return { active, countdown, reason, finish: finishButton, pointId };
  }

  if (pointId === 'delivery') {
    fragment.append(element('p', 'Nenhum trabalho de entrega ativo. Pegue uma caixa no Quadro da Recepção.', 'lodging-note'));
    return;
  }
  for (const job of state.jobs) {
    const start = villageJobStartState({ job, snapshot: state, pointId, nearPoint, guest });
    const directions = villageJobDirections(job);
    const card = element('div', '', 'lodging-option village-job-card');
    card.append(element('strong', job.label || job.id),
      element('small', job.description || ''),
      element('small', `Recompensa: ${formatBronze(job.rewardBronze)} por conclusão.`),
      element('small', villageJobTurnsLine(job)),
      element('small', `Começar: ${directions.start}`),
      element('small', `Concluir: ${directions.finish} Mínimo de ${Math.round((job.minDurationMs || 0) / 1000)} s.`));
    const button = actionButton('Começar trabalho', 'villageJobStart', { jobId: job.id }, !start.enabled);
    button.dataset.focusKey = `village-job-${job.id}`;
    card.append(button);
    if (start.reason) card.append(element('small', start.reason));
    fragment.append(card);
  }
  return null;
}

// Atualiza só a contagem, o motivo e o botão Concluir do turno ativo, sem
// reconstruir o painel: o foco e a posição do leitor continuam onde estavam.
// Devolve true enquanto ainda faltar esperar pelo `readyAt` no ponto de destino.
export function updateVillageJobTemporal(refs, { guest = false, busy = false, nowMs = Date.now() } = {}) {
  if (!refs?.active) return false;
  const { active, countdown, reason, finish, pointId } = refs;
  const remaining = villageJobRemainingMs(active, nowMs);
  const text = formatJobCountdown(remaining);
  if (countdown.textContent !== text) countdown.textContent = text;
  if (!finish) return false;
  const state = villageJobFinishState({ active, pointId, nowMs, nearPoint: true, guest });
  const disabled = busy || !state.enabled;
  if (finish.disabled !== disabled) finish.disabled = disabled;
  if (reason.textContent !== state.reason) reason.textContent = state.reason;
  return remaining > 0;
}

// Liga uma atualização por quadro (requestAnimationFrame) enquanto `update`
// pedir continuidade. Parar é idempotente; reiniciar não duplica o quadro.
export function createVillageJobTicker(update, {
  raf = globalThis.requestAnimationFrame?.bind(globalThis),
  caf = globalThis.cancelAnimationFrame?.bind(globalThis),
} = {}) {
  let frame = 0;
  const tick = () => {
    frame = 0;
    if (update(Date.now())) frame = raf(tick);
  };
  return {
    start() { if (!frame) frame = raf(tick); },
    stop() { if (frame) caf(frame); frame = 0; },
    get running() { return frame !== 0; },
  };
}

// Indicador fora do diálogo: barra de progresso e contagem derivadas do snapshot.
// A contagem é só exibição (1 Hz); a conclusão depende sempre do servidor.
export function createVillageJobHud(doc = globalThis.document) {
  let node = null, bar = null, label = null, timer = null, seenPayment = null, latest = null;
  const ensure = () => {
    if (node) return;
    node = doc.createElement('div');
    node.className = 'village-job-progress';
    node.hidden = true;
    label = doc.createElement('span');
    bar = doc.createElement('div');
    bar.className = 'village-job-progress-bar';
    node.append(label, bar);
    doc.body.append(node);
  };
  const paint = nowMs => {
    ensure();
    const active = latest?.active;
    if (!active) { node.hidden = true; return; }
    const remaining = villageJobRemainingMs(active, nowMs);
    node.hidden = false;
    label.textContent = `${villageJobStageLabel(active)} · ${formatJobCountdown(remaining)}`;
    bar.style.width = `${Math.round(villageJobProgress(active, nowMs) * 100)}%`;
    node.setAttribute('aria-label', label.textContent);
  };
  const schedule = () => {
    const active = latest?.active;
    const needsTick = Boolean(active) && villageJobRemainingMs(active, Date.now()) > 0;
    if (needsTick && !timer) timer = setInterval(() => paint(Date.now()), 1000);
    if (!needsTick && timer) { clearInterval(timer); timer = null; }
  };
  return {
    // Retorna o aviso de pagamento novo (uma vez por runId), ou ''.
    update(snapshot, nowMs = Date.now()) {
      latest = normalizeVillageJobs(snapshot);
      let notice = '';
      const payment = latest?.lastPayment;
      if (payment && payment.runId !== seenPayment) {
        seenPayment = payment.runId;
        notice = villageJobPaymentNotice(payment);
      }
      paint(nowMs);
      schedule();
      return notice;
    },
    destroy() {
      if (timer) clearInterval(timer);
      timer = null;
      node?.remove();
      node = null;
    },
  };
}
