import { GAME_DAY_DURATION_MS } from './day-night.mjs';
export const GAME_WEEK_DAYS = 7;
export const GAME_MONTH_DAYS = 30;
export const GAME_RENTAL_DAYS = Object.freeze([1, 2, GAME_WEEK_DAYS, GAME_MONTH_DAYS]);
export const gameDaysToMs = days => days * GAME_DAY_DURATION_MS;
export function gameDurationLabel(ms) {
  const days = Number(ms) / GAME_DAY_DURATION_MS;
  return days === 30 ? '1 mês do jogo (30 dias)' : days === 7 ? '1 semana do jogo (7 dias)' : `${Number(days.toFixed(2))} dia${days === 1 ? '' : 's'} do jogo`;
}
export function gameTimeRemaining(expiresAt, at = Date.now()) {
  const hours = Math.max(0, Math.ceil((expiresAt - at) / GAME_DAY_DURATION_MS * 24));
  return `${Math.floor(hours / 24)}d ${hours % 24}h do jogo`;
}

// Internal DATE bucket for continuous world days; never a real-world deadline.
export function gameDayKey(at = Date.now()) { return new Date(Math.floor(Number(at) / GAME_DAY_DURATION_MS) * 86400000).toISOString().slice(0,10); }
