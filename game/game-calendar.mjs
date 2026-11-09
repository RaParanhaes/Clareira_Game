// The one place where the game's time is named, counted and labelled.
// The arithmetic lives in game-time.mjs; this file adds rental durations and text.
import {
  GAME_DAY_DURATION_MS, GAME_EPOCH_MS, GAME_WEEK_DAYS, GAME_MONTH_DAYS, GAME_MONTHS_PER_YEAR,
  GAME_YEAR_DAYS, GAME_SEASON_NAMES, GAME_MONTHS, gameDayIndexAt,
} from './game-time.mjs';

export {
  GAME_DAY_DURATION_MS, GAME_EPOCH_MS, GAME_WEEK_DAYS, GAME_MONTH_DAYS, GAME_MONTHS_PER_YEAR,
  GAME_YEAR_DAYS, GAME_SEASON_NAMES, GAME_MONTHS, gameDayIndexAt,
};

export const GAME_RENTAL_DAYS = Object.freeze([1, 2, GAME_WEEK_DAYS, GAME_MONTH_DAYS]);
export const gameDaysToMs = days => days * GAME_DAY_DURATION_MS;
export function gameDurationLabel(ms) {
  const days = Number(ms) / GAME_DAY_DURATION_MS;
  if (days === GAME_YEAR_DAYS) return '1 ano do jogo (360 dias)';
  if (days === GAME_MONTH_DAYS) return '1 mês do jogo (30 dias)';
  if (days === GAME_WEEK_DAYS) return '1 semana do jogo (7 dias)';
  return `${Number(days.toFixed(2))} dia${days === 1 ? '' : 's'} do jogo`;
}
export function gameTimeRemaining(expiresAt, at = Date.now()) {
  const hours = Math.max(0, Math.ceil((expiresAt - at) / GAME_DAY_DURATION_MS * 24));
  return `${Math.floor(hours / 24)}d ${hours % 24}h do jogo`;
}

// Internal DATE bucket for continuous world days; never a real-world deadline.
export function gameDayKey(at = Date.now()) { return new Date(Math.floor(Number(at) / GAME_DAY_DURATION_MS) * 86400000).toISOString().slice(0,10); }

// Years take these names in a cycle: year 9 is "do Carvalho" again.
export const GAME_WEEKDAYS = Object.freeze([
  'Dia do Brilho', 'Dia da Brisa', 'Dia da Chama', 'Dia do Musgo',
  'Dia da Colheita', 'Dia da Neblina', 'Dia do Repouso',
]);
export const GAME_YEAR_NAMES = Object.freeze([
  'do Carvalho', 'do Corvo', 'da Aurora', 'do Cedro',
  'da Brasa', 'do Lobo', 'do Orvalho', 'da Pedra',
]);

const wrapIndex = (value, length) => ((value % length) + length) % length;

// The calendar reading for a world timestamp.
export function gameCalendarAt(timestampMs) {
  const dayIndex = gameDayIndexAt(timestampMs);
  const dayOfYearIndex = wrapIndex(dayIndex, GAME_YEAR_DAYS);
  const monthIndex = Math.floor(dayOfYearIndex / GAME_MONTH_DAYS);
  const dayOfMonth = dayOfYearIndex % GAME_MONTH_DAYS + 1;
  const month = GAME_MONTHS[monthIndex];
  const year = Math.floor(dayIndex / GAME_YEAR_DAYS) + 1;
  const weekdayIndex = wrapIndex(dayIndex, GAME_WEEKDAYS.length);
  return {
    dayIndex,
    year,
    yearName: GAME_YEAR_NAMES[wrapIndex(year - 1, GAME_YEAR_NAMES.length)],
    month: monthIndex + 1,
    monthName: month.name,
    season: month.season,
    seasonName: GAME_SEASON_NAMES[month.season],
    dayOfMonth,
    dayOfYear: dayOfYearIndex + 1,
    weekOfMonth: Math.floor((dayOfMonth - 1) / GAME_WEEK_DAYS) + 1,
    weekday: GAME_WEEKDAYS[weekdayIndex],
    weekdayIndex,
  };
}

// HUD label: "Ano 1 do Carvalho · 3 de Brotar · Dia da Brisa".
export function formatGameDate(calendar) {
  if (calendar.year < 1) return `Antes do Ano 1 · ${calendar.dayOfMonth} de ${calendar.monthName} · ${calendar.weekday}`;
  return `Ano ${calendar.year} ${calendar.yearName} · ${calendar.dayOfMonth} de ${calendar.monthName} · ${calendar.weekday}`;
}

// Clock reading (HH:MM) for a world timestamp. Same arithmetic as day-night.mjs,
// so the HUD clock and the day-night label always agree.
export function gameClockLabel(timestampMs) {
  const elapsed = wrapIndex(Number(timestampMs), GAME_DAY_DURATION_MS);
  const hours = elapsed / GAME_DAY_DURATION_MS * 24;
  const hour = Math.floor(hours);
  const minute = Math.floor((hours - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// The one label for a moment of the game: date and clock together.
export function gameDateTimeLabel(timestampMs) {
  return `${formatGameDate(gameCalendarAt(timestampMs))} · ${gameClockLabel(timestampMs)}`;
}
