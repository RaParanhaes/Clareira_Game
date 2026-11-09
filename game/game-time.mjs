// Base of the world's time. This module imports nothing, so day-night.mjs,
// game-calendar.mjs and game-weather.mjs can all depend on it without cycles.
// Everything is derived from the world timestamp, so every player agrees.

// One game day is one day-night cycle: 24 real minutes.
export const GAME_DAY_DURATION_MS = 24 * 60 * 1000;

// Year 1, day 1 begins at launch: 2026-11-08 00:00 UTC, a day-cycle boundary.
export const GAME_EPOCH_MS = Date.UTC(2026, 10, 8);

export const GAME_WEEK_DAYS = 7;
export const GAME_MONTH_DAYS = 30;
export const GAME_MONTHS_PER_YEAR = 12;
export const GAME_YEAR_DAYS = GAME_MONTH_DAYS * GAME_MONTHS_PER_YEAR;
// Each season is three months long.
export const GAME_SEASON_DAYS = GAME_MONTH_DAYS * 3;
// The moon completes a lunar month every four game weeks.
export const GAME_LUNAR_MONTH_DAYS = GAME_WEEK_DAYS * 4;

export const GAME_SEASON_NAMES = Object.freeze({
  primavera: 'Primavera', verao: 'Verão', outono: 'Outono', inverno: 'Inverno',
});

export const GAME_MONTHS = Object.freeze([
  { name: 'Brotar', season: 'primavera' },
  { name: 'Florir', season: 'primavera' },
  { name: 'Verdalva', season: 'primavera' },
  { name: 'Solenda', season: 'verao' },
  { name: 'Sol-Alto', season: 'verao' },
  { name: 'Ceifa', season: 'verao' },
  { name: 'Ventania', season: 'outono' },
  { name: 'Folhaqueda', season: 'outono' },
  { name: 'Brasa-Fria', season: 'outono' },
  { name: 'Geada', season: 'inverno' },
  { name: 'Neve-Alva', season: 'inverno' },
  { name: 'Lua-Longa', season: 'inverno' },
]);

const wrapIndex = (value, length) => ((value % length) + length) % length;

// Absolute game day index since the epoch (negative before it).
export function gameDayIndexAt(timestampMs) {
  return Math.floor((Number(timestampMs) - GAME_EPOCH_MS) / GAME_DAY_DURATION_MS);
}

// Where a timestamp falls in the year: month, season and the day within the year.
export function gameSeasonAt(timestampMs) {
  const dayIndex = gameDayIndexAt(timestampMs);
  const dayOfYearIndex = wrapIndex(dayIndex, GAME_YEAR_DAYS);
  const monthIndex = Math.floor(dayOfYearIndex / GAME_MONTH_DAYS);
  const month = GAME_MONTHS[monthIndex];
  return { dayIndex, dayOfYearIndex, monthIndex, season: month.season };
}
