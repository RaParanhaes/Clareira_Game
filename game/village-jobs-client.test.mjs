import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBronze, normalizeVillageJobs, villageJobRemainingMs, villageJobProgress, formatJobCountdown,
  villageJobStageLabel, villageJobStartState, villageJobFinishState, villageJobCancelAvailable,
  villageJobPaymentNotice, villageJobTurnsLine, villageJobDirections, villageJobsPacketSnapshot,
} from './village-jobs-client.mjs';

const carrier = { id: 'carrier', label: 'Carregador', startPointId: 'board', finishPointId: 'delivery',
  rewardBronze: 150, minDurationMs: 12000, dailyLimit: 3, remaining: 3, completed: 0 };
const firekeeper = { id: 'firekeeper', label: 'Ajudante do fogo', startPointId: 'hearth', finishPointId: 'hearth',
  rewardBronze: 150, minDurationMs: 10000, dailyLimit: 3, remaining: 3, completed: 0 };
const idle = { dayKey: '2026-11-16', jobs: [carrier, firekeeper], active: null, lastPayment: null, requiresAccount: false };
const working = { runId: 'r1', jobId: 'firekeeper', stage: 'working', startedAt: 1000, readyAt: 11000, targetId: 'hearth' };

test('snapshot normalization keeps only the authoritative fields and rejects missing data', () => {
  assert.equal(normalizeVillageJobs(null), null);
  assert.equal(normalizeVillageJobs({ jobs: 'x' }), null);
  const normalized = normalizeVillageJobs({ ...idle, extra: 'ignored', jobs: [carrier, null, { nope: true }, firekeeper] });
  assert.deepEqual(normalized.jobs.map(job => job.id), ['carrier', 'firekeeper']);
  assert.equal(normalized.active, null);
  assert.equal(normalized.lastPayment, null);
  assert.equal(normalized.requiresAccount, false);
});

test('countdown and progress are display-only values derived from readyAt and startedAt', () => {
  assert.equal(villageJobRemainingMs(working, 4000), 7000);
  assert.equal(villageJobRemainingMs(working, 99000), 0);
  assert.equal(villageJobRemainingMs(null, 4000), null);
  assert.equal(villageJobProgress(working, 6000), 0.5);
  assert.equal(villageJobProgress(working, 0), 0);
  assert.equal(villageJobProgress(working, 90000), 1);
  assert.equal(villageJobProgress({ startedAt: 5, readyAt: 5 }, 9), 0);
  assert.equal(formatJobCountdown(7000), '0:07');
  assert.equal(formatJobCountdown(61000), '1:01');
  assert.equal(formatJobCountdown(0), 'Pronto');
  assert.equal(formatJobCountdown(NaN), '');
});

test('start is offered only at the job start point, with an account, one active turn and remaining quota', () => {
  const at = (job, pointId, extra = {}) => villageJobStartState({ job, snapshot: idle, pointId, ...extra });
  assert.equal(at(carrier, 'board').enabled, true);
  assert.equal(at(carrier, 'hearth').enabled, false);
  assert.match(at(carrier, 'hearth').reason, /Quadro da Recepção/);
  assert.equal(at(firekeeper, 'hearth').enabled, true);
  assert.equal(at(firekeeper, 'board').enabled, false);
  assert.equal(at(carrier, 'board', { nearPoint: false }).enabled, false);
  assert.equal(at(carrier, 'board', { guest: true }).enabled, false);
  assert.match(at(carrier, 'board', { guest: true }).reason, /conta/);
  assert.equal(villageJobStartState({ job: carrier, snapshot: { ...idle, active: working }, pointId: 'board' }).enabled, false);
  assert.equal(villageJobStartState({ job: { ...carrier, remaining: 0 }, snapshot: idle, pointId: 'board' }).enabled, false);
  assert.equal(villageJobStartState({ job: null, snapshot: idle, pointId: 'board' }).enabled, false);
});

test('finish waits for the target point and for readyAt on the local display clock', () => {
  assert.equal(villageJobFinishState({ active: working, pointId: 'hearth', nowMs: 12000 }).enabled, true);
  assert.equal(villageJobFinishState({ active: working, pointId: 'hearth', nowMs: 5000 }).enabled, false);
  assert.equal(villageJobFinishState({ active: working, pointId: 'board', nowMs: 12000 }).enabled, false);
  assert.equal(villageJobFinishState({ active: working, pointId: 'hearth', nowMs: 12000, nearPoint: false }).enabled, false);
  assert.equal(villageJobFinishState({ active: null, pointId: 'hearth', nowMs: 12000 }).enabled, false);
});

test('cancel is available only with an active turn and never for guests', () => {
  assert.equal(villageJobCancelAvailable(working), true);
  assert.equal(villageJobCancelAvailable(null), false);
  assert.equal(villageJobCancelAvailable(working, true), false);
});

test('payment notice comes only from the server lastPayment', () => {
  assert.equal(villageJobPaymentNotice(null), '');
  assert.equal(villageJobPaymentNotice({ runId: 'r1', amount: 150 }), 'Pagamento recebido: 150 bronzes na carteira.');
  assert.equal(villageJobPaymentNotice({ runId: 'r2', amount: 'x' }), '');
  assert.equal(formatBronze(1), '1 bronze');
});

test('labels, directions and quota line are plain text for both jobs', () => {
  assert.equal(villageJobStageLabel(working), 'Turno junto à fogueira');
  assert.equal(villageJobStageLabel({ ...working, stage: 'carrying' }), 'Caixa a caminho da Pousada');
  assert.ok(villageJobDirections(carrier).finish.includes('Pousada'));
  assert.ok(villageJobDirections(firekeeper).start.includes('fogueira'));
  assert.deepEqual(villageJobDirections({ id: 'other' }), { start: '', finish: '' });
  assert.equal(villageJobTurnsLine(carrier), 'Turnos de hoje: 3 de 3 restantes.');
});

test('a dedicated villageJobs packet yields the snapshot to apply; other packets and missing fields yield nothing (B1)', () => {
  assert.deepEqual(villageJobsPacketSnapshot({ type: 'villageJobs', villageJobs: idle }), idle);
  assert.equal(villageJobsPacketSnapshot({ type: 'villageJobs', villageJobs: null }), null, 'explicit null clears the panel');
  assert.equal(villageJobsPacketSnapshot({ type: 'villageJobs' }), undefined, 'no field: nothing to apply');
  assert.equal(villageJobsPacketSnapshot({ type: 'state', villageJobs: idle }), undefined, 'state packets keep their own path');
  assert.equal(villageJobsPacketSnapshot(null), undefined);
});
