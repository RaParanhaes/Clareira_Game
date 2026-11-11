import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPFIRE_SEQUENCE_FALL_MS, CAMPFIRE_SEQUENCE_LEVELS, CAMPFIRE_SEQUENCE_RISE_MS,
  CAMPFIRE_SEQUENCE_TOP_LEVEL, advanceCampfireSequence, campfireSequenceFrame,
  campfireSequenceFrameRect, campfireSequenceLevelFor, campfireSequenceSprite,
  resetCampfireSequenceStates,
} from './campfire-sequence.mjs';

test('the 20 frames each sit in their own cell of the 5x4 sheet', () => {
  const cells = new Set();
  for (let frame = 1; frame <= 20; frame++) {
    const rect = campfireSequenceFrameRect(frame);
    assert.equal(rect.sw, 64);
    assert.equal(rect.sh, 80);
    assert.ok(rect.sx >= 0 && rect.sx < 320 && rect.sy >= 0 && rect.sy < 320);
    cells.add(`${rect.sx},${rect.sy}`);
  }
  assert.equal(cells.size, 20);
});

test('every level uses only frames from 1 to 20', () => {
  for (const frames of CAMPFIRE_SEQUENCE_LEVELS) {
    for (const frame of frames) assert.ok(frame >= 1 && frame <= 20, `frame ${frame}`);
  }
});

test('strength maps to a level: no fuel is ash, full fuel is the top level', () => {
  assert.equal(campfireSequenceLevelFor(0), 0);
  assert.equal(campfireSequenceLevelFor(0.02), 0);
  assert.equal(campfireSequenceLevelFor(1), CAMPFIRE_SEQUENCE_TOP_LEVEL);
  assert.equal(campfireSequenceLevelFor(NaN), 0);
  let previous = 0;
  for (let step = 0; step <= 100; step++) {
    const level = campfireSequenceLevelFor(step / 100);
    assert.ok(level >= previous, 'level never drops when strength rises');
    previous = level;
  }
});

test('the fire climbs one level at a time, never jumping to the top', () => {
  let state = { level: 0, at: 0 };
  const levels = [];
  for (let now = 0; now <= 10 * CAMPFIRE_SEQUENCE_RISE_MS; now += 10) {
    state = advanceCampfireSequence(state, CAMPFIRE_SEQUENCE_TOP_LEVEL, now);
    levels.push(state.level);
  }
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i] - levels[i - 1] <= 1, 'at most one level per step');
  }
  assert.equal(levels[levels.length - 1], CAMPFIRE_SEQUENCE_TOP_LEVEL);
});

test('dying goes down more slowly than rising', () => {
  const rise = advanceCampfireSequence({ level: 3, at: 0 }, 4, CAMPFIRE_SEQUENCE_RISE_MS);
  assert.equal(rise.level, 4);
  const notYet = advanceCampfireSequence({ level: 4, at: 0 }, 3, CAMPFIRE_SEQUENCE_RISE_MS);
  assert.equal(notYet.level, 4, 'falling waits the longer fall time');
  const fall = advanceCampfireSequence({ level: 4, at: 0 }, 3, CAMPFIRE_SEQUENCE_FALL_MS);
  assert.equal(fall.level, 3);
});

test('reduced motion sets the level at once and keeps one still frame', () => {
  const state = advanceCampfireSequence({ level: 0, at: 0 }, 9, 1, true);
  assert.equal(state.level, 9);
  assert.equal(campfireSequenceFrame(9, 12345, true), 6);
  assert.equal(campfireSequenceFrame(0, 12345, true), 17);
});

test('the full fire varies only between its own frames', () => {
  const frames = new Set();
  for (let now = 0; now < 5000; now += 7) frames.add(campfireSequenceFrame(CAMPFIRE_SEQUENCE_TOP_LEVEL, now));
  assert.deepEqual([...frames].sort((a, b) => a - b), [6, 7, 8, 9, 10, 11]);
});

test('sprite memory keeps each fire on its own level', () => {
  resetCampfireSequenceStates();
  const cold = campfireSequenceSprite('a', 0, 0);
  assert.deepEqual(cold, campfireSequenceFrameRect(17));
  const lit = campfireSequenceSprite('b', 1, 0);
  assert.deepEqual(lit, campfireSequenceFrameRect(6));
  // Fire 'a' stays at ash until its own time passes, whatever fire 'b' does.
  const later = campfireSequenceSprite('a', 1, CAMPFIRE_SEQUENCE_RISE_MS);
  assert.deepEqual(later, campfireSequenceFrameRect(3));
  resetCampfireSequenceStates();
});
