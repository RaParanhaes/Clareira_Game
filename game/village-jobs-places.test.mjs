import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_SERVICES, SERVICE_SECTIONS, EXTERIOR_JOB_SERVICES, placeServicePoints, nearestPlaceService,
  placeServiceAllowsAction } from './place-services.mjs';
import { VILLAGE_JOB_POINTS } from './village-jobs.mjs';

const surface = { location: 'clearing', dimensionId: 'surface' };
const pointOf = (points, jobPointId) => points.find(point => point.jobPointId === jobPointId);

test('the three job points exist on the surface, outside the catalog-rebuilt PLACE_SERVICES', () => {
  const points = placeServicePoints(surface, null);
  for (const { id, x, y } of VILLAGE_JOB_POINTS) {
    const point = pointOf(points, id);
    assert.ok(point, `${id} is listed`);
    assert.equal(point.x, x);
    assert.equal(point.y, y);
    assert.deepEqual(point.sections, ['jobs']);
    assert.ok(SERVICE_SECTIONS.jobs, 'jobs section has a label');
  }
  assert.equal(EXTERIOR_JOB_SERVICES.length, VILLAGE_JOB_POINTS.length);
  assert.equal(Object.keys(PLACE_SERVICES).some(key => key.startsWith('village-job')), false);
});

test('a job point only activates inside its radius and through a reachable path', () => {
  const board = pointOf(placeServicePoints(surface, null), 'board');
  assert.equal(nearestPlaceService(surface, { x: board.x, y: board.y }, null)?.jobPointId, 'board');
  assert.equal(nearestPlaceService(surface, { x: board.x + board.radius + 1, y: board.y }, null), null);
  assert.equal(nearestPlaceService(surface, { x: board.x, y: board.y }, null, () => false), null);
});

test('start is allowed only at the board for the carrier and at the hearth for the firekeeper', () => {
  const points = placeServicePoints(surface, null);
  const board = pointOf(points, 'board'), hearth = pointOf(points, 'hearth'), delivery = pointOf(points, 'delivery');
  assert.equal(placeServiceAllowsAction(board, { name: 'villageJobStart', jobId: 'carrier' }), true);
  assert.equal(placeServiceAllowsAction(hearth, { name: 'villageJobStart', jobId: 'firekeeper' }), true);
  assert.equal(placeServiceAllowsAction(delivery, { name: 'villageJobStart', jobId: 'carrier' }), false);
  assert.equal(placeServiceAllowsAction(board, { name: 'villageJobFinish', runId: 'r' }), false);
});

test('a start is refused at the wrong job point in both crossed directions and without a known jobId', () => {
  const points = placeServicePoints(surface, null);
  const board = pointOf(points, 'board'), hearth = pointOf(points, 'hearth');
  assert.equal(placeServiceAllowsAction(board, { name: 'villageJobStart', jobId: 'firekeeper' }), false, 'firekeeper at the board');
  assert.equal(placeServiceAllowsAction(hearth, { name: 'villageJobStart', jobId: 'carrier' }), false, 'carrier at the hearth');
  assert.equal(placeServiceAllowsAction(board, { name: 'villageJobStart' }), false, 'missing jobId');
  assert.equal(placeServiceAllowsAction(hearth, { name: 'villageJobStart', jobId: 'unknown' }), false, 'unknown jobId');
  assert.equal(placeServiceAllowsAction(hearth, { name: 'villageJobStart', jobId: '' }), false, 'empty jobId');
  const nonJob = points.find(point => !point.jobPointId);
  assert.ok(nonJob, 'the surface has at least one non-job service point to cross-check');
  assert.equal(placeServiceAllowsAction(nonJob, { name: 'villageJobStart', jobId: 'carrier' }), false, 'a non-job point never starts a job');
});

test('finish happens at the delivery point or the hearth; cancel is allowed at every job point', () => {
  const points = placeServicePoints(surface, null);
  const board = pointOf(points, 'board'), hearth = pointOf(points, 'hearth'), delivery = pointOf(points, 'delivery');
  assert.equal(placeServiceAllowsAction(delivery, { name: 'villageJobFinish', runId: 'r' }), true);
  assert.equal(placeServiceAllowsAction(hearth, { name: 'villageJobFinish', runId: 'r' }), true);
  assert.equal(placeServiceAllowsAction(board, { name: 'villageJobFinish', runId: 'r' }), false);
  for (const point of [board, delivery, hearth]) {
    assert.equal(placeServiceAllowsAction(point, { name: 'villageJobCancel', runId: 'r' }), true);
  }
});
