import test from 'node:test';
import assert from 'node:assert/strict';
import { campfireLoopFrameIndex, campfireLoopPhaseFrame, campfireLoopSourceRect, CAMPFIRE_LOOP_FRAME_COUNT, CAMPFIRE_LOOP_SHEET_HEIGHT, CAMPFIRE_LOOP_SHEET_WIDTH, CAMPFIRE_LOOP_FLAME_FIRST, CAMPFIRE_LOOP_FLAME_LAST, CAMPFIRE_LOOP_OFF_FRAME, CAMPFIRE_LOOP_IGNITE_MS, CAMPFIRE_LOOP_SUSTAIN_MS, CAMPFIRE_LOOP_DECAY_MS } from './campfire-loop.mjs';

test('the lit loop uses only the flame frames and cycles through them', () => {
  const seen = new Set();
  for (let t = 0; t < 10; t += 0.01) seen.add(campfireLoopFrameIndex(t));
  assert.equal(seen.size, CAMPFIRE_LOOP_FLAME_LAST - CAMPFIRE_LOOP_FLAME_FIRST + 1);
  for (const i of seen) assert.ok(i >= CAMPFIRE_LOOP_FLAME_FIRST && i <= CAMPFIRE_LOOP_FLAME_LAST);
});

test('reduced motion holds a flame frame', () => {
  assert.equal(campfireLoopFrameIndex(3.3, true), CAMPFIRE_LOOP_FLAME_FIRST);
});

test('every frame rect stays inside the sheet', () => {
  for (let i = 0; i < CAMPFIRE_LOOP_FRAME_COUNT; i++) {
    const r = campfireLoopSourceRect(i);
    assert.ok(r.sx + r.sw <= CAMPFIRE_LOOP_SHEET_WIDTH && r.sy + r.sh <= CAMPFIRE_LOOP_SHEET_HEIGHT);
  }
});

test('ignition starts from embers and rises into the flame', () => {
  assert.ok(campfireLoopPhaseFrame(0) <= 1);
  assert.ok(campfireLoopPhaseFrame(CAMPFIRE_LOOP_IGNITE_MS - 1) >= CAMPFIRE_LOOP_FLAME_FIRST);
});

test('sustain loops for three minutes, then decays through frame 14 to the extinguished frame 15', () => {
  const sustainStart = CAMPFIRE_LOOP_IGNITE_MS;
  const seen = new Set();
  for (let t = sustainStart; t < sustainStart + CAMPFIRE_LOOP_SUSTAIN_MS; t += 500) seen.add(campfireLoopPhaseFrame(t, t / 1000));
  assert.ok(seen.size > 3);
  const decayStart = sustainStart + CAMPFIRE_LOOP_SUSTAIN_MS;
  const decaying = new Set();
  for (let t = decayStart; t < decayStart + CAMPFIRE_LOOP_DECAY_MS; t += 250) decaying.add(campfireLoopPhaseFrame(t));
  assert.ok(decaying.has(CAMPFIRE_LOOP_OFF_FRAME - 1), 'passa pelo quadro 14');
  assert.equal(campfireLoopPhaseFrame(decayStart + CAMPFIRE_LOOP_DECAY_MS + 1000), CAMPFIRE_LOOP_OFF_FRAME);
});

import { campfireLoopElapsedMs } from './campfire-loop.mjs';

test('elapsed time uses the server wall clock, not the browser performance clock', () => {
  const litAt = 1_700_000_000_000;               // relógio do servidor (Date.now)
  assert.equal(campfireLoopElapsedMs({ litAt }, litAt + 5000), 5000);
  // Quando o servidor manda o combustível restante, a fase segue esse valor.
  assert.equal(campfireLoopElapsedMs({ burnRemainingMs: 60_000, burnSampledAt: litAt }, litAt), 180_000);
  // Com o relógio do navegador (performance.now, ~segundos desde a página), dava negativo: não pode mais.
  assert.ok(campfireLoopElapsedMs({ litAt }, litAt + 5000) > 0);
});

test('permanent fires keep the lit loop and never go out', () => {
  const fire = { permanent: true, litAt: 1_700_000_000_000 };
  assert.ok(Number.isNaN(campfireLoopElapsedMs(fire, 1_700_000_000_000 + 10 * 60 * 1000)));
  assert.ok(campfireLoopPhaseFrame(NaN, 2.5) >= CAMPFIRE_LOOP_FLAME_FIRST);
});
