import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_ROLES, VILLAGE_ROUTINE_ROLES, createNpcRoutine, workIndexForDay, retainGathered, markDay } from './npc-routine.mjs';

test('the six villagers are split three woodcutters, two gatherers and one hunter', () => {
  const roles = Object.values(VILLAGE_ROUTINE_ROLES);
  assert.equal(roles.length, 6);
  assert.equal(roles.filter(r => r === NPC_ROLES.lumberjack).length, 3);
  assert.equal(roles.filter(r => r === NPC_ROLES.gatherer).length, 2);
  assert.equal(roles.filter(r => r === NPC_ROLES.hunter).length, 1);
});

test('a woodcutter works a different tree each day and wraps back to the first', () => {
  const routine = createNpcRoutine('village:tomas', NPC_ROLES.lumberjack);
  const trees = 4;
  const sequence = [0, 1, 2, 3, 4, 5].map(day => workIndexForDay(routine, day, trees));
  assert.deepEqual(sequence, [0, 1, 2, 3, 0, 1]);
});

test('woodcutters start from different trees so they do not all chop the same one', () => {
  const first = workIndexForDay(createNpcRoutine('a', NPC_ROLES.lumberjack, { offset: 0 }), 0, 5);
  const second = workIndexForDay(createNpcRoutine('b', NPC_ROLES.lumberjack, { offset: 2 }), 0, 5);
  assert.notEqual(first, second);
});

test('an empty tree list gives no work index', () => {
  const routine = createNpcRoutine('a', NPC_ROLES.lumberjack);
  assert.equal(workIndexForDay(routine, 3, 0), null);
});

test('what is gathered is kept on the NPC and accumulates', () => {
  let routine = createNpcRoutine('village:mara', NPC_ROLES.gatherer);
  routine = retainGathered(routine, 'stone', 2);
  routine = retainGathered(routine, 'stone', 3);
  routine = retainGathered(routine, 'berries', 1);
  assert.deepEqual(routine.stock, { stone: 5, berries: 1 });
});

test('invalid roles and quantities are refused', () => {
  assert.throws(() => createNpcRoutine('a', 'merchant'), TypeError);
  assert.throws(() => retainGathered(createNpcRoutine('a', NPC_ROLES.hunter), 'hide', 0), RangeError);
});

test('marking a day records it without changing the stock', () => {
  const routine = retainGathered(createNpcRoutine('a', NPC_ROLES.hunter), 'hide', 1);
  const marked = markDay(routine, 7);
  assert.equal(marked.lastDay, 7);
  assert.deepEqual(marked.stock, { hide: 1 });
});
