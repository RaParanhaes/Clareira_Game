import test from 'node:test';
import assert from 'node:assert/strict';
import { VILLAGE_JOBS, VILLAGE_JOB_POINTS, villageJobAtPoint, villageJobPointById, villageJobSnapshot, villageJobWithinDistance } from './village-jobs.mjs';
import { SPAWN, SPAWN_CAMPFIRE, PLAYER_RADIUS, canOccupy, findWalkPath } from './world.mjs';
import { FIRE_RADIUS } from './obstacle-collision.mjs';
import { RECEPTION_BUILDING, VILLAGE_BUILDINGS } from './village-buildings.mjs';

// findWalkPath devolve um caminho parcial quando o alvo é inalcançável; por isso
// o critério é o último waypoint terminar no alvo.
const reaches = target => { const path = findWalkPath(SPAWN, target); const last = path.at(-1); return Boolean(last) && Math.hypot(last.x - target.x, last.y - target.y) <= 0.3; };

test('reaches() tells a walkable target from an unreachable one', () => {
  assert.equal(reaches({ x: -500, y: -500 }), false);
});

test('hearth stands 1.2 west of the spawn campfire and is labelled as the village fire', () => {
  const hearth = villageJobPointById('hearth');
  assert.equal(hearth.x, SPAWN_CAMPFIRE.x - 1.2);
  assert.equal(hearth.y, SPAWN_CAMPFIRE.y);
  assert.equal(hearth.label, 'Fogueira da vila');
  assert.ok(Math.hypot(hearth.x - SPAWN_CAMPFIRE.x, hearth.y - SPAWN_CAMPFIRE.y) > FIRE_RADIUS, 'outside the fire collider');
});

test('hearth is free floor and reachable by walking from the spawn', () => {
  const hearth = villageJobPointById('hearth');
  assert.equal(canOccupy(hearth, PLAYER_RADIUS), true);
  assert.equal(reaches(hearth), true, 'a walk path from spawn ends at the hearth');
});

test('board and delivery use a radius between 1.2 and 1.4, stay on free floor, and never cover a door', () => {
  const doors = { board: RECEPTION_BUILDING.door, delivery: VILLAGE_BUILDINGS.find(building => building.id === 'lodging-pine-inn').door };
  for (const id of ['board', 'delivery']) {
    const point = villageJobPointById(id);
    assert.ok(point.radius >= 1.2 && point.radius <= 1.4, `${id} radius ${point.radius}`);
    assert.equal(canOccupy(point, PLAYER_RADIUS), true, `${id} is free floor`);
    assert.equal(reaches(point), true, `${id} is reachable from spawn`);
    const door = doors[id];
    assert.ok(Math.hypot(point.x - door.x, point.y - door.y) > point.radius + PLAYER_RADIUS, `${id} does not reach or cover its door`);
  }
});

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
