import test from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGE_JOBS, VILLAGE_JOB_POINTS, villageJobAtPoint, villageJobSnapshot, villageJobWithinDistance } from './village-jobs.mjs';

test('catalog has the two fixed jobs, limits and established village points', () => {
  assert.deepEqual(VILLAGE_JOBS.map(job => [job.id, job.rewardBronze, job.dailyLimit]), [['carrier',150,3],['firekeeper',150,3]]);
  assert.deepEqual(VILLAGE_JOB_POINTS.map(point => point.id), ['board','delivery','hearth']);
  const point = VILLAGE_JOB_POINTS[0];
  assert.equal(villageJobAtPoint('board', point, 'surface'), true);
  assert.equal(villageJobAtPoint('board', point, 'breu'), false);
  assert.equal(villageJobWithinDistance(point, point, 2.4), true);
});

test('snapshot counts only completions in selected game day', () => {
  const state = villageJobSnapshot({ dayKey:'day-2', completions:[{jobId:'carrier',dayKey:'day-2'},{jobId:'carrier',dayKey:'day-1'}], requiresAccount:true });
  assert.equal(state.jobs.find(job => job.id === 'carrier').remaining, 2);
  assert.equal(state.jobs.find(job => job.id === 'firekeeper').remaining, 3);
  assert.equal(state.requiresAccount, true);
});
