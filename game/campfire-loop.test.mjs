import test from 'node:test';
import assert from 'node:assert/strict';
import { campfireLoopFrameIndex, campfireLoopSourceRect, CAMPFIRE_LOOP_FRAME_COUNT, CAMPFIRE_LOOP_SHEET_HEIGHT, CAMPFIRE_LOOP_SHEET_WIDTH } from './campfire-loop.mjs';

test('loop cycles through all frames and back', () => {
  const seen = new Set();
  for (let t = 0; t < 5; t += 0.01) seen.add(campfireLoopFrameIndex(t));
  assert.equal(seen.size, CAMPFIRE_LOOP_FRAME_COUNT);
});

test('reduced motion holds the first frame', () => {
  assert.equal(campfireLoopFrameIndex(3.3, true), 0);
});

test('every frame rect stays inside the sheet', () => {
  for (let i = 0; i < CAMPFIRE_LOOP_FRAME_COUNT; i++) {
    const r = campfireLoopSourceRect(i);
    assert.ok(r.sx + r.sw <= CAMPFIRE_LOOP_SHEET_WIDTH && r.sy + r.sh <= CAMPFIRE_LOOP_SHEET_HEIGHT);
  }
});
