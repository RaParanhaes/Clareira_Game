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

import { CAMPFIRE_LOOP_OFF_FRAME, campfireLoopPhaseFrame, CAMPFIRE_LOOP_IGNITE_MS, CAMPFIRE_LOOP_SUSTAIN_MS, CAMPFIRE_LOOP_DECAY_MS } from './campfire-loop.mjs';

test('ignition rises from embers to full flame', () => {
  assert.equal(campfireLoopPhaseFrame(0), CAMPFIRE_LOOP_OFF_FRAME);
  assert.ok(campfireLoopPhaseFrame(CAMPFIRE_LOOP_IGNITE_MS - 1) <= 10);
});

test('sustain loops for three minutes, then decays slowly over one minute', () => {
  const sustainStart = CAMPFIRE_LOOP_IGNITE_MS;
  const seen = new Set();
  for (let t = sustainStart; t < sustainStart + CAMPFIRE_LOOP_SUSTAIN_MS; t += 500) seen.add(campfireLoopPhaseFrame(t, t / 1000));
  assert.ok(seen.size > 3, 'o fogo deve variar durante os 3 minutos');
  const decayStart = sustainStart + CAMPFIRE_LOOP_SUSTAIN_MS;
  const mid = campfireLoopPhaseFrame(decayStart + CAMPFIRE_LOOP_DECAY_MS / 2);
  assert.ok(mid > 0 && mid < CAMPFIRE_LOOP_OFF_FRAME, 'no meio do apagar, ainda há chama');
  assert.equal(campfireLoopPhaseFrame(decayStart + CAMPFIRE_LOOP_DECAY_MS + 1000), CAMPFIRE_LOOP_OFF_FRAME);
});
