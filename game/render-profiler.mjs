// Opt-in, bounded diagnostics. No telemetry and no work in ordinary visits.
export function createRenderProfiler(enabled, limit = 900) {
  if (!enabled) return null;
  const samples = [], current = {};
  let start = 0, last = 0, previous = 0;
  return {
    begin(now) {
      for (const key of Object.keys(current)) delete current[key];
      if (previous) current.frame = now - previous;
      previous = now; start = last = now;
    },
    mark(name, now) { current[name] = now - last; last = now; },
    sample(name, duration) { current[name] = duration; },
    finish(now) {
      samples.push({ ...current, draw: now - start });
      if (samples.length > limit) samples.shift();
    },
    reset() { samples.length = 0; previous = 0; },
    snapshot() {
      const metrics = {};
      for (const name of new Set(samples.flatMap(sample => Object.keys(sample)))) {
        const values = samples.map(sample => sample[name]).filter(Number.isFinite).sort((a,b) => a-b);
        metrics[name] = { mean: values.reduce((a,b) => a+b,0)/values.length,
          median: values[Math.floor(values.length*.5)], p95: values[Math.floor(values.length*.95)],
          p99: values[Math.floor(values.length*.99)], max: values.at(-1) };
      }
      return { samples: samples.length, metrics,
        longFrames: samples.filter(sample => sample.frame > 50).length,
        stalls: samples.filter(sample => sample.frame > 250).length };
    },
  };
}
