import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyWeatherAt, moonAt, weatherLabel } from './game-weather.mjs';
import { GAME_EPOCH_MS, GAME_DAY_DURATION_MS, GAME_YEAR_DAYS, GAME_MONTH_DAYS } from './game-time.mjs';
import { getGameDayState, seasonalDaylightShift } from './day-night.mjs';

const at = (days, hour = 0) => GAME_EPOCH_MS + days * GAME_DAY_DURATION_MS + (hour / 24) * GAME_DAY_DURATION_MS;

test('weather is the same for every moment of a day and for every player', () => {
 const a = dailyWeatherAt(at(40, 1));
 const b = dailyWeatherAt(at(40, 22));
 assert.deepEqual(a, b);
});

test('each season has its own sky: winter snows, summer has extreme sun, spring and autumn rain', () => {
 const kindsBySeason = {};
 for (let day = 0; day < GAME_YEAR_DAYS; day++) {
  const w = dailyWeatherAt(at(day));
  (kindsBySeason[w.season] ||= new Set()).add(w.kind);
  if (w.season === 'verao' && w.extremeSun) kindsBySeason.summerSun = true;
 }
 assert.ok(kindsBySeason.inverno.has('snowing'));
 assert.ok(!kindsBySeason.inverno.has('rain'));
 assert.ok(kindsBySeason.summerSun);
 assert.ok(kindsBySeason.primavera.has('rain'));
 assert.ok(kindsBySeason.outono.has('rain'));
});

test('no rain falls in summer days marked as extreme sun', () => {
 for (let day = 0; day < GAME_YEAR_DAYS; day++) {
  const w = dailyWeatherAt(at(day));
  if (w.extremeSun) assert.equal(w.kind, 'clear');
 }
});

test('the moon completes a lunar month in four weeks and names its phases', () => {
 const lunar = 28;
 assert.equal(moonAt(at(0)).phaseName, 'Lua Nova');
 assert.ok(moonAt(at(lunar / 2)).isFull);
 assert.equal(moonAt(at(lunar / 2)).phaseName, 'Lua Cheia');
 assert.equal(moonAt(at(lunar)).phaseName, 'Lua Nova');
 assert.equal(moonAt(at(0)).lunarWeek, 1);
 assert.equal(moonAt(at(lunar * 3 / 4 + 1)).lunarWeek, 4);
});

test('a red moon appears on every fourth full moon, and never on other full moons', () => {
 const lunar = 28;
 const reds = [];
 for (let month = 0; month < 12; month++) {
  const full = moonAt(at(month * lunar + lunar / 2));
  assert.ok(full.isFull);
  if (full.redMoon) reds.push(month);
 }
 assert.deepEqual(reds, [3, 7, 11]);
});

test('sunrise and sunset move with the season: summer days are longer than winter days', () => {
 const summerDay = Math.floor((GAME_MONTH_DAYS * 4) + 1);
 const winterDay = Math.floor((GAME_MONTH_DAYS * 10) + 1);
 const dawnAt = (day) => {
  for (let hour = 0; hour < 24; hour += 0.25) {
   if (getGameDayState(at(day, hour)).daylight > 0.5) return hour;
  }
  return null;
 };
 assert.ok(dawnAt(summerDay) < dawnAt(winterDay), 'summer sun rises earlier than winter sun');
 assert.ok(seasonalDaylightShift('verao').dusk > 0);
 assert.ok(seasonalDaylightShift('inverno').dusk < 0);
});

test('weather labels are short Portuguese names for the HUD', () => {
 assert.equal(weatherLabel({ kind: 'rain', extremeSun: false }), 'chuva');
 assert.equal(weatherLabel({ kind: 'snowing', extremeSun: false }), 'neve');
 assert.equal(weatherLabel({ kind: 'storm', extremeSun: false }), 'tempestade');
 assert.equal(weatherLabel({ kind: 'clear', extremeSun: true }), 'sol escaldante');
 assert.equal(weatherLabel({ kind: 'clear', extremeSun: false }), 'céu limpo');
});
