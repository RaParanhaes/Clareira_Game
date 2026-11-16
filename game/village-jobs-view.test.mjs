import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVillageJobsPanel, updateVillageJobTemporal, createVillageJobTicker } from './village-jobs-view.mjs';

// DOM mínimo: só o necessário para observar nós, texto, atributos e foco lógico.
function fakeElement(tag, text = '', className = '') {
  const node = {
    tag, className, dataset: {}, disabled: false, children: [],
    get textContent() { return this._text ?? ''; },
    set textContent(value) { this._text = String(value); },
    get lastChild() { return this.children.at(-1) || null; },
    append(...items) {
      for (const item of items) this.children.push(typeof item === 'string' ? { tag: '#text', textContent: item } : item);
    },
  };
  if (text) node.textContent = text;
  return node;
}
const element = (tag, text, className) => fakeElement(tag, text, className);
const actionButton = (text, action, fields = {}, disabled = false) => {
  const button = fakeElement('button', text);
  button.dataset.serviceAction = action;
  Object.assign(button.dataset, fields);
  button.disabled = disabled;
  return button;
};
const textOf = node => node.textContent + (node.children || []).map(textOf).join('');
const findAll = (node, predicate, out = []) => {
  if (predicate(node)) out.push(node);
  for (const child of node.children || []) findAll(child, predicate, out);
  return out;
};

const firekeeper = { id: 'firekeeper', label: 'Ajudante do fogo', startPointId: 'hearth', finishPointId: 'hearth',
  rewardBronze: 150, minDurationMs: 10000, dailyLimit: 3, remaining: 2, completed: 1 };
const carrier = { id: 'carrier', label: 'Carregador', startPointId: 'board', finishPointId: 'delivery',
  rewardBronze: 150, minDurationMs: 12000, dailyLimit: 3, remaining: 3, completed: 0 };
const working = { runId: 'r1', jobId: 'firekeeper', stage: 'working', startedAt: 1000, readyAt: 11000, targetId: 'hearth' };
const snapshotWith = active => ({ dayKey: '2026-11-16', jobs: [carrier, firekeeper], active, lastPayment: null, requiresAccount: false });

function renderAt(pointId, snapshot, nowMs, extra = {}) {
  const fragment = fakeElement('fragment');
  const refs = renderVillageJobsPanel(fragment, { element, actionButton, snapshot, pointId, nowMs, ...extra });
  return { fragment, refs };
}

test('finish stays disabled before readyAt and becomes enabled after readyAt with the same snapshot, keeping the same button', () => {
  const snapshot = snapshotWith(working);
  const { fragment, refs } = renderAt('hearth', snapshot, 5000);
  const finishButton = refs.finish;
  assert.ok(finishButton, 'finish button exists at the target point');
  assert.equal(finishButton.disabled, true);
  const childCountBefore = fragment.children.length;

  assert.equal(updateVillageJobTemporal(refs, { nowMs: 9000 }), true, 'still waiting, keep ticking');
  assert.equal(finishButton.disabled, true);
  assert.equal(refs.countdown.textContent, '0:02');

  assert.equal(updateVillageJobTemporal(refs, { nowMs: 11000 }), false, 'ready: ticker can stop');
  assert.equal(refs.finish, finishButton, 'same node: focus stays on it');
  assert.equal(finishButton.disabled, false);
  assert.equal(refs.countdown.textContent, 'Pronto');
  assert.equal(refs.reason.textContent, '');
  assert.equal(fragment.children.length, childCountBefore, 'the page was not rebuilt');
});

test('temporal update keeps the finish button disabled while busy and never enables it at other points', () => {
  const { refs } = renderAt('hearth', snapshotWith(working), 5000);
  updateVillageJobTemporal(refs, { nowMs: 12000, busy: true });
  assert.equal(refs.finish.disabled, true, 'a pending server answer keeps the button disabled');
  updateVillageJobTemporal(refs, { nowMs: 12000, busy: false });
  assert.equal(refs.finish.disabled, false);

  const elsewhere = renderAt('board', snapshotWith(working), 5000);
  assert.equal(elsewhere.refs.finish, null, 'no finish button away from the target point');
  assert.equal(updateVillageJobTemporal(elsewhere.refs, { nowMs: 12000 }), false);
  assert.match(elsewhere.refs.reason.textContent, /Leve até/);
});

test('updating the countdown never moves focus-bearing nodes: cancel keeps its focus key and identity', () => {
  const { refs, fragment } = renderAt('hearth', snapshotWith(working), 5000);
  const cancel = findAll(fragment, node => node.dataset?.serviceAction === 'villageJobCancel')[0];
  assert.equal(cancel.dataset.focusKey, 'village-job-cancel', 'cancel has a stable focus key');
  updateVillageJobTemporal(refs, { nowMs: 6000 });
  updateVillageJobTemporal(refs, { nowMs: 12000 });
  assert.equal(findAll(fragment, node => node.dataset?.serviceAction === 'villageJobCancel')[0], cancel);
});

test('finish carries the focus key used to restore focus after a full rebuild', () => {
  const { fragment } = renderAt('hearth', snapshotWith(working), 5000);
  const finish = findAll(fragment, node => node.dataset?.serviceAction === 'villageJobFinish')[0];
  assert.equal(finish.dataset.focusKey, 'village-job-finish');
  assert.equal(finish.dataset.runId, 'r1');
});

test('the start page offers only the job whose start point is here, with the same key as before', () => {
  const { fragment } = renderAt('board', snapshotWith(null), 5000);
  const starts = findAll(fragment, node => node.dataset?.serviceAction === 'villageJobStart');
  assert.equal(starts.length, 2, 'both jobs are listed');
  const carrierStart = starts.find(node => node.dataset.jobId === 'carrier');
  const fireStart = starts.find(node => node.dataset.jobId === 'firekeeper');
  assert.equal(carrierStart.disabled, false);
  assert.equal(fireStart.disabled, true, 'firekeeper cannot start at the board');
  assert.equal(carrierStart.dataset.focusKey, 'village-job-carrier');
});

test('a missing snapshot returns no refs and shows a loading note', () => {
  const { fragment, refs } = renderAt('hearth', null, 5000);
  assert.equal(refs, null);
  assert.equal(textOf(fragment).includes('Carregando trabalhos da vila'), true);
});

test('ticker runs one frame at a time, stops when update asks, and never double-schedules', () => {
  const frames = new Map();
  let nextId = 1, cancelled = [];
  const raf = callback => { const id = nextId++; frames.set(id, callback); return id; };
  const caf = id => { cancelled.push(id); frames.delete(id); };
  const answers = [true, true, false];
  let calls = 0;
  const ticker = createVillageJobTicker(() => { calls += 1; return answers.shift(); }, { raf, caf });

  ticker.start();
  ticker.start();
  assert.equal(frames.size, 1, 'a second start does not add a frame');
  const runFrame = () => { const [[id, cb]] = [...frames.entries()]; frames.delete(id); cb(); };
  runFrame(); runFrame();
  assert.equal(calls, 2);
  assert.equal(frames.size, 1, 'still running');
  runFrame();
  assert.equal(calls, 3);
  assert.equal(frames.size, 0, 'stopped by update returning false');
  assert.equal(ticker.running, false);

  ticker.start();
  ticker.stop();
  ticker.stop();
  assert.equal(cancelled.length, 1, 'stop cancels the scheduled frame once');
  assert.equal(frames.size, 0);
});
