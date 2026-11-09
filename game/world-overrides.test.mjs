import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOverride, createOverride, activeOverrides, effectiveSky, overrideEndsAt } from './world-overrides.mjs';
import { GAME_EPOCH_MS, GAME_DAY_DURATION_MS, GAME_SEASON_DAYS } from './game-time.mjs';

const at = (days, fraction = 0) => GAME_EPOCH_MS + days * GAME_DAY_DURATION_MS + fraction * GAME_DAY_DURATION_MS;

test('controls are checked: known keys, valid ranges and hex colours only', () => {
 assert.equal(normalizeOverride({ key: 'hour', value: 13, scope: 'cycle' }).value, 13);
 assert.throws(() => normalizeOverride({ key: 'hour', value: 24, scope: 'cycle' }), RangeError);
 assert.throws(() => normalizeOverride({ key: 'sunIntensity', value: 3, scope: 'cycle' }), RangeError);
 assert.throws(() => normalizeOverride({ key: 'moonColor', value: 'vermelho', scope: 'permanent' }), TypeError);
 assert.equal(normalizeOverride({ key: 'moonColor', value: '#D9573A', scope: 'permanent' }).value, '#d9573a');
 assert.throws(() => normalizeOverride({ key: 'gravity', value: 1, scope: 'cycle' }), TypeError);
 assert.throws(() => normalizeOverride({ key: 'hour', value: 5, scope: 'forever' }), TypeError);
});

test('a cycle override ends at the end of the current game day', () => {
 const start = at(10, 0.2);
 const override = createOverride({ key: 'weather', value: { kind: 'rain', intensity: 0.8 }, scope: 'cycle' }, start);
 assert.equal(override.endsAt, at(11, 0));
 assert.equal(activeOverrides([override], at(10, 0.9)).length, 1);
 assert.equal(activeOverrides([override], at(11, 0.01)).length, 0);
});

test('a season override lasts until the season ends, then the next season takes over', () => {
 const start = at(2, 0.5);
 const override = createOverride({ key: 'darkness', value: 0.9, scope: 'season' }, start);
 assert.equal(override.endsAt, at(GAME_SEASON_DAYS, 0));
 assert.equal(activeOverrides([override], at(GAME_SEASON_DAYS - 1, 0.9)).length, 1);
 assert.equal(activeOverrides([override], at(GAME_SEASON_DAYS, 0.1)).length, 0);
});

test('a permanent override never expires', () => {
 const override = createOverride({ key: 'moonColor', value: '#ff0000', scope: 'permanent' }, at(0));
 assert.equal(overrideEndsAt('permanent', at(0)), Infinity);
 assert.equal(activeOverrides([override], at(5000)).length, 1);
});

test('the newest override of a control wins, and expired ones do not apply', () => {
 const old = createOverride({ key: 'hour', value: 6, scope: 'permanent' }, at(0));
 const newer = createOverride({ key: 'hour', value: 18, scope: 'permanent' }, at(1));
 const expiring = createOverride({ key: 'sunIntensity', value: 1.5, scope: 'cycle' }, at(1));
 const sky = effectiveSky([old, newer, expiring], at(1, 0.5));
 assert.equal(sky.hour, 18);
 assert.equal(sky.sunIntensity, 1.5);
 assert.equal(effectiveSky([expiring], at(2, 0.1)).sunIntensity, undefined);
});

import { effectiveWeatherAt, applySkyToDay, skyTimestamp } from './world-overrides.mjs';
import { dailyWeatherAt } from './game-weather.mjs';
test('a staff weather override replaces the day climate and keeps the season', () => {
 const day = at(40, 0.5);
 const w = effectiveWeatherAt(day, { weather: { kind: 'storm', intensity: 0.9, extremeSun: false } });
 assert.equal(w.kind, 'storm');
 assert.equal(w.season, dailyWeatherAt(day).season);
 assert.equal(effectiveWeatherAt(day, {}).kind, dailyWeatherAt(day).kind);
});
test('darkness, sun and moon values scale the day state', () => {
 const day = { night: 0.2, daylight: 0.8, sunlightStrength: 0.5, moonlightStrength: 0.1 };
 const next = applySkyToDay(day, { darkness: 0.9, sunIntensity: 2, moonIntensity: 0.5, moonColor: '#d9573a' });
 assert.equal(next.night, 0.9);
 assert.ok(Math.abs(next.daylight - 0.1) < 1e-9);
 assert.equal(next.sunlightStrength, 1);
 assert.equal(next.moonlightStrength, 0.05);
 assert.equal(next.moonColor, '#d9573a');
 assert.equal(applySkyToDay(day, {}), day);
});
test('the hour override moves the clock to the chosen time of day, the nearest such moment', () => {
 const t = at(25, 0.7);
 const moved = skyTimestamp(t, { hour: 6 });
 const elapsed = ((moved - GAME_EPOCH_MS) % GAME_DAY_DURATION_MS + GAME_DAY_DURATION_MS) % GAME_DAY_DURATION_MS;
 assert.ok(Math.abs(elapsed - (6 / 24) * GAME_DAY_DURATION_MS) < 1);
 assert.ok(Math.abs(moved - t) <= GAME_DAY_DURATION_MS / 2);
 assert.equal(skyTimestamp(t, {}), t);
});
