import test from 'node:test';
import assert from 'node:assert/strict';
import { appendPositionSample, interpolatePosition } from './interpolation.mjs';

test('remote avatar position moves smoothly between server snapshots', () => {
  const samples = [
    { time: 0, x: 2, y: 4 },
    { time: 100, x: 3, y: 5 },
  ];

  assert.deepEqual(interpolatePosition(samples, 50), { x: 2.5, y: 4.5 });
});

test('remote interpolation holds the nearest sample outside the buffered interval', () => {
  const samples = [
    { time: 100, x: 2, y: 4 },
    { time: 200, x: 3, y: 5 },
  ];

  assert.deepEqual(interpolatePosition(samples, 50), { x: 2, y: 4 });
  assert.deepEqual(interpolatePosition(samples, 250), { x: 3, y: 5 });
  assert.equal(interpolatePosition([], 150), null);
});

test('position sample history stays bounded and replaces equal-time samples', () => {
  let samples = [];
  for (let time = 0; time <= 500; time += 100) {
    samples = appendPositionSample(samples, { time, x: time / 100, y: 0 }, 3);
  }
  assert.deepEqual(samples.map(sample => sample.time), [300, 400, 500]);

  samples = appendPositionSample(samples, { time: 500, x: 6, y: 1 }, 3);
  assert.equal(samples.length, 3);
  assert.deepEqual(samples.at(-1), { time: 500, x: 6, y: 1 });
});
