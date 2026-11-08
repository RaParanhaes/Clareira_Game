import test from 'node:test';
import assert from 'node:assert/strict';
import {gameDaysToMs,gameDayKey,gameDurationLabel,gameTimeRemaining} from './game-calendar.mjs';
import {resourceContractDayKey} from './resource-contracts.mjs';
import {LODGING_DAY_MS} from './lodging-catalog.mjs';
test('housing, daily contracts and economy share continuous world days',()=>{
 const day=24*60*1000;assert.equal(LODGING_DAY_MS,day);assert.equal(gameDaysToMs(7),day*7);assert.equal(gameDaysToMs(30),day*30);
 const start=Math.floor(Date.UTC(2026,9,29)/day)*day;
 assert.equal(resourceContractDayKey(start),gameDayKey(start));assert.equal(gameDayKey(start+day-1),gameDayKey(start));assert.notEqual(gameDayKey(start+day),gameDayKey(start));
 assert.equal(gameTimeRemaining(start+day/2,start),'0d 12h do jogo');assert.match(gameDurationLabel(day*30),/mês do jogo/);
});

import {GAME_DAY_DURATION_MS} from './day-night.mjs';
import {gameCalendarAt,formatGameDate,GAME_EPOCH_MS,GAME_YEAR_DAYS,GAME_MONTHS} from './game-calendar.mjs';
test('chronology: day, weekday and month advance from the epoch without gaps', () => {
 const at = days => GAME_EPOCH_MS + days * GAME_DAY_DURATION_MS;
 assert.equal(gameCalendarAt(at(0)).dayOfMonth, 1);
 assert.equal(gameCalendarAt(at(0)).monthName, 'Brotar');
 assert.equal(gameCalendarAt(at(29)).monthName, 'Brotar');
 assert.equal(gameCalendarAt(at(30)).monthName, 'Florir');
 assert.equal(gameCalendarAt(at(1)).weekday, 'Dia da Brisa');
});
test('chronology: a year has 12 months and rolls over to year 2 after 360 days', () => {
 const at = days => GAME_EPOCH_MS + days * GAME_DAY_DURATION_MS;
 assert.equal(GAME_YEAR_DAYS, 360);
 assert.equal(GAME_MONTHS.length, 12);
 assert.equal(gameCalendarAt(at(359)).monthName, 'Lua-Longa');
 const second = gameCalendarAt(at(360));
 assert.equal(second.year, 2);
 assert.equal(second.dayOfYear, 1);
 assert.equal(second.monthName, 'Brotar');
});
test('chronology: seasons follow the months and year names cycle after eight years', () => {
 const at = days => GAME_EPOCH_MS + days * GAME_DAY_DURATION_MS;
 assert.equal(gameCalendarAt(at(0)).seasonName, 'Primavera');
 assert.equal(gameCalendarAt(at(3 * 30)).seasonName, 'Verão');
 assert.equal(gameCalendarAt(at(6 * 30)).seasonName, 'Outono');
 assert.equal(gameCalendarAt(at(9 * 30)).seasonName, 'Inverno');
 assert.equal(gameCalendarAt(at(0)).yearName, 'do Carvalho');
 assert.equal(gameCalendarAt(at(8 * GAME_YEAR_DAYS)).yearName, 'do Carvalho');
});
test('chronology: the HUD label names the year, month, day and weekday', () => {
 const label = formatGameDate(gameCalendarAt(GAME_EPOCH_MS));
 assert.equal(label, 'Ano 1 do Carvalho · 1 de Brotar · Dia do Brilho');
});

import {gameClockLabel,gameDateTimeLabel} from './game-calendar.mjs';
import {getGameDayState} from './day-night.mjs';
test('one source of time: HUD clock matches the day-night label at any moment', () => {
 for (const offset of [0, 123456, 987654, 1439999]) {
  const t = GAME_EPOCH_MS + 5 * GAME_DAY_DURATION_MS + offset;
  assert.equal(gameClockLabel(t), getGameDayState(t).label);
 }
});
test('one source of time: the date and clock label is built from the calendar', () => {
 const t = GAME_EPOCH_MS + 5 * GAME_DAY_DURATION_MS + 1234567;
 assert.equal(gameDateTimeLabel(t), 'Ano 1 do Carvalho · 6 de Brotar · Dia da Neblina · 20:34');
});
test('rental durations are named in calendar units, including a year', () => {
 assert.equal(gameDurationLabel(gameDaysToMs(1)), '1 dia do jogo');
 assert.equal(gameDurationLabel(gameDaysToMs(7)), '1 semana do jogo (7 dias)');
 assert.equal(gameDurationLabel(gameDaysToMs(30)), '1 mês do jogo (30 dias)');
 assert.equal(gameDurationLabel(gameDaysToMs(360)), '1 ano do jogo (360 dias)');
});
test('chronology: dates before the epoch read as "Antes do Ano 1", never a negative year', () => {
 const label = formatGameDate(gameCalendarAt(Date.UTC(2023, 10, 14)));
 assert.ok(label.startsWith('Antes do Ano 1'));
 assert.ok(!/Ano -\d/.test(label));
});
