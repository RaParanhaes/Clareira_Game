import test from 'node:test';
import assert from 'node:assert/strict';
import { villageJobMarkThing, drawVillageJobMark } from './village-jobs-render.mjs';
import { compareSceneDepth } from './depth-order.mjs';
import { VILLAGE_JOB_POINTS } from './village-jobs.mjs';

const board = VILLAGE_JOB_POINTS.find(point => point.id === 'board');
const hearth = VILLAGE_JOB_POINTS.find(point => point.id === 'hearth');
const delivery = VILLAGE_JOB_POINTS.find(point => point.id === 'delivery');

// Contexto mínimo que registra o que foi desenhado, sem canvas real.
function recordingContext() {
  const calls = [];
  const record = name => (...args) => calls.push({ name, args });
  return {
    calls,
    save: record('save'), restore: record('restore'), beginPath: record('beginPath'),
    ellipse: record('ellipse'), arc: record('arc'), stroke: record('stroke'),
    fillRect: record('fillRect'), strokeRect: record('strokeRect'),
    fillStyle: null, strokeStyle: null, lineWidth: 1,
  };
}
const project = (x, y, z) => ({ x: x * 10, y: y * 10 - z });
const arcsOf = ctx => ctx.calls.filter(call => call.name === 'arc');

const working = { runId: 'r1', jobId: 'firekeeper', stage: 'working', startedAt: 1000, readyAt: 11000, targetId: 'hearth' };

test('each job point becomes a depth-queue record at its own position, not part of the Reception bitmap', () => {
  for (const point of VILLAGE_JOB_POINTS) {
    const thing = villageJobMarkThing(point);
    assert.equal(thing.type, 'village-job-mark');
    assert.equal(thing.sortX, point.x);
    assert.equal(thing.sortY, point.y);
    assert.equal(thing.sortZ, 0);
    assert.equal(thing.point, point);
    assert.equal(thing.sortId, `village-job:${point.id}`);
  }
});

test('the board sorts behind a player standing in front of it and in front of one standing behind it', () => {
  const mark = villageJobMarkThing(board);
  const depth = board.x + board.y;
  const behind = { type: 'player', x: board.x - 1, y: board.y - 1, sortX: board.x - 1, sortY: board.y - 1, player: { id: 'a' } };
  const inFront = { type: 'player', x: board.x + 1, y: board.y + 1, sortX: board.x + 1, sortY: board.y + 1, player: { id: 'b' } };
  assert.ok(behind.x + behind.y < depth);
  assert.ok(compareSceneDepth(behind, mark) < 0, 'player behind the board is drawn first');
  assert.ok(compareSceneDepth(mark, inFront) < 0, 'player in front of the board is drawn after it');
});

test('a ground mark at the same spot is drawn after terrain but before a character standing there', () => {
  const mark = villageJobMarkThing(hearth);
  const terrain = { type: 'terrain-face', x: hearth.x, y: hearth.y, sortX: hearth.x, sortY: hearth.y, sortZ: 0,
    sortId: 'terrain:surface:face-1' };
  const character = { type: 'player', x: hearth.x, y: hearth.y, sortX: hearth.x, sortY: hearth.y, player: { id: 'c' } };
  assert.ok(compareSceneDepth(terrain, mark) < 0, 'terrain is drawn first');
  assert.ok(compareSceneDepth(mark, character) < 0, 'the character stands above the mark');
});

test('the progress arc advances with the frame clock, so it is redrawn each frame instead of frozen', () => {
  const at = nowMs => {
    const ctx = recordingContext();
    drawVillageJobMark(ctx, project, { point: hearth, active: working, nowMs, scale: 1 });
    return arcsOf(ctx).at(-1).args[4];
  };
  const halfway = at(6000);
  const later = at(9000);
  assert.ok(Math.abs(halfway - Math.PI / 2) < 1e-9, `halfway ends at PI/2, got ${halfway}`);
  assert.ok(later > halfway, 'later frame sweeps further');
  const readyEnd = at(11000);
  assert.ok(Math.abs(readyEnd - 3 * Math.PI / 2) < 1e-9, 'full circle at readyAt');
});

test('no arc is drawn at a point that is not the active target', () => {
  const ctx = recordingContext();
  drawVillageJobMark(ctx, project, { point: board, active: working, nowMs: 6000, scale: 1 });
  assert.equal(arcsOf(ctx).length, 0);
  const idle = recordingContext();
  drawVillageJobMark(idle, project, { point: hearth, active: null, nowMs: 6000, scale: 1 });
  assert.equal(arcsOf(idle).length, 0);
});

test('delivery and hearth draw ground rings, the board draws its sign, and a missing point draws nothing', () => {
  const ring = recordingContext();
  drawVillageJobMark(ring, project, { point: delivery, active: null, nowMs: 0, scale: 1 });
  assert.equal(ring.calls.filter(call => call.name === 'ellipse').length, 1);
  assert.equal(ring.calls.filter(call => call.name === 'fillRect').length, 0, 'no active box for an idle delivery point');

  const sign = recordingContext();
  drawVillageJobMark(sign, project, { point: board, active: null, nowMs: 0, scale: 1 });
  assert.equal(sign.calls.filter(call => call.name === 'strokeRect').length, 1);

  const none = recordingContext();
  drawVillageJobMark(none, project, { point: undefined, active: null, nowMs: 0, scale: 1 });
  assert.equal(none.calls.length, 0);
});
