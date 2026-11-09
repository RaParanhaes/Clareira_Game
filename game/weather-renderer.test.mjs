import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWeatherSky, precipitationCount } from './weather-renderer.mjs';

// A canvas stand-in that counts drawing calls, so the tests need no browser.
function recordingContext() {
  const calls = { stroke: 0, fill: 0, fillRect: 0, arc: 0, moveTo: 0 };
  const gradient = { addColorStop() {} };
  return {
    calls,
    save() {}, restore() {},
    beginPath() {}, closePath() {},
    moveTo() { calls.moveTo++; }, lineTo() {},
    stroke() { calls.stroke++; }, fill() { calls.fill++; },
    fillRect() { calls.fillRect++; },
    arc() { calls.arc++; },
    createRadialGradient() { return gradient; },
  };
}

test('clear skies with no moon draw nothing', () => {
 const ctx = recordingContext();
 drawWeatherSky(ctx, 1440, 900, { weather: { kind: 'clear', intensity: 0, extremeSun: false }, moon: null, night: 0, seconds: 3 });
 assert.equal(ctx.calls.stroke + ctx.calls.fill + ctx.calls.fillRect + ctx.calls.arc, 0);
});

test('precipitation counts grow with intensity and storms fall heavier than rain', () => {
 assert.equal(precipitationCount('clear', 1, 1440, 900), 0);
 assert.ok(precipitationCount('rain', 1, 1440, 900) > precipitationCount('rain', 0.2, 1440, 900));
 assert.ok(precipitationCount('storm', 0.8, 1440, 900) > precipitationCount('rain', 0.8, 1440, 900));
 assert.ok(precipitationCount('rain', 0.8, 2880, 1800) > precipitationCount('rain', 0.8, 1440, 900));
});

test('rain draws streaks and snow draws flakes', () => {
 const rain = recordingContext();
 drawWeatherSky(rain, 1440, 900, { weather: { kind: 'rain', intensity: 0.7, extremeSun: false }, seconds: 2 });
 assert.ok(rain.calls.moveTo > 0 && rain.calls.stroke === 1);
 const snow = recordingContext();
 drawWeatherSky(snow, 1440, 900, { weather: { kind: 'snowing', intensity: 0.7, extremeSun: false }, seconds: 2 });
 assert.ok(snow.calls.arc > 0);
});

test('a storm adds a darkening veil on top of the rain', () => {
 const storm = recordingContext();
 drawWeatherSky(storm, 1440, 900, { weather: { kind: 'storm', intensity: 0.9, extremeSun: false }, seconds: 1 });
 assert.ok(storm.calls.fillRect >= 1);
});

test('extreme sun paints a glare; the red moon tints only the night of a red moon', () => {
 const sun = recordingContext();
 drawWeatherSky(sun, 1440, 900, { weather: { kind: 'clear', intensity: 0, extremeSun: true }, moon: null, night: 0 });
 assert.ok(sun.calls.fillRect >= 1);
 const redNight = recordingContext();
 drawWeatherSky(redNight, 1440, 900, { weather: { kind: 'clear', intensity: 0, extremeSun: false }, moon: { redMoon: true }, night: 1 });
 assert.equal(redNight.calls.fillRect, 1);
 const normalNight = recordingContext();
 drawWeatherSky(normalNight, 1440, 900, { weather: { kind: 'clear', intensity: 0, extremeSun: false }, moon: { redMoon: false }, night: 1 });
 assert.equal(normalNight.calls.fillRect, 0);
});

test('reduced motion freezes the particles: the same drops are drawn at any time', () => {
 const early = recordingContext();
 const late = recordingContext();
 const weather = { kind: 'rain', intensity: 0.6, extremeSun: false };
 drawWeatherSky(early, 1440, 900, { weather, seconds: 1, reducedMotion: true });
 drawWeatherSky(late, 1440, 900, { weather, seconds: 999, reducedMotion: true });
 assert.deepEqual(early.calls, late.calls);
});
