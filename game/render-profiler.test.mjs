import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderProfiler } from './render-profiler.mjs';

test('profiling bounds history and distinguishes long frames from stalls', () => {
  assert.equal(createRenderProfiler(false), null);
  const profiler = createRenderProfiler(true, 3);
  for (const time of [1, 17, 77, 377]) { profiler.begin(time); profiler.finish(time + 2); }
  const report = profiler.snapshot();
  assert.equal(report.samples, 3);
  assert.equal(report.longFrames, 2);
  assert.equal(report.stalls, 1);
  assert.equal(report.metrics.frame.p99, 300);
  assert.equal(report.metrics.draw.max, 2);
  profiler.reset();
  assert.equal(profiler.snapshot().samples, 0);
});
