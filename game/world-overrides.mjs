// Staff overrides of the world's sky: the hour, the weather, the sun and moon
// strengths, the moon's colour and the darkness of the night. An override lasts
// until the end of the current day cycle, until the end of the current season,
// or forever. Pure functions only: storage and permissions live elsewhere.
import { GAME_DAY_DURATION_MS, GAME_EPOCH_MS, GAME_SEASON_DAYS, gameSeasonAt } from './game-time.mjs';
import { dailyWeatherAt } from './game-weather.mjs';

export const OVERRIDE_SCOPES = Object.freeze(['cycle', 'season', 'permanent']);
export const OVERRIDE_KEYS = Object.freeze(['hour', 'weather', 'sunIntensity', 'moonIntensity', 'moonColor', 'darkness']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const HEX = /^#[0-9a-fA-F]{6}$/;

// Checks one override and returns a normalised copy, or throws a clear error.
export function normalizeOverride(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Ajuste inválido.');
  const { key, value, scope } = input;
  if (!OVERRIDE_KEYS.includes(key)) throw new TypeError(`Controle desconhecido: ${key}.`);
  if (!OVERRIDE_SCOPES.includes(scope)) throw new TypeError(`Escopo inválido: ${scope}.`);
  let normalized;
  if (key === 'hour') {
    const hour = Number(value);
    if (!Number.isFinite(hour) || hour < 0 || hour >= 24) throw new RangeError('A hora deve estar entre 0 e 23.99.');
    normalized = hour;
  } else if (key === 'weather') {
    if (!['clear', 'rain', 'snowing', 'storm'].includes(value?.kind)) throw new TypeError('Clima inválido.');
    normalized = { kind: value.kind, intensity: clamp(Number(value.intensity ?? 0.6), 0, 1), extremeSun: value.extremeSun === true };
  } else if (key === 'moonColor') {
    if (typeof value !== 'string' || !HEX.test(value)) throw new TypeError('A cor da lua deve ser um hexadecimal, como #d9573a.');
    normalized = value.toLowerCase();
  } else {
    const number = Number(value);
    const max = key === 'sunIntensity' ? 2 : 1;
    if (!Number.isFinite(number) || number < 0 || number > max) throw new RangeError(`${key} deve estar entre 0 e ${max}.`);
    normalized = number;
  }
  return { key, value: normalized, scope };
}

// The first moment (ms) an override with this scope stops applying, from `at`.
// Permanent overrides never end.
export function overrideEndsAt(scope, at) {
  if (scope === 'permanent') return Infinity;
  const dayIndex = Math.floor((Number(at) - GAME_EPOCH_MS) / GAME_DAY_DURATION_MS);
  if (scope === 'cycle') return GAME_EPOCH_MS + (dayIndex + 1) * GAME_DAY_DURATION_MS;
  const { dayOfYearIndex } = gameSeasonAt(at);
  const daysLeftInSeason = GAME_SEASON_DAYS - (dayOfYearIndex % GAME_SEASON_DAYS);
  return GAME_EPOCH_MS + (dayIndex + daysLeftInSeason) * GAME_DAY_DURATION_MS;
}

// Overrides still in force at `now`. The list is what staff set; expired ones are dropped.
export function activeOverrides(list, now) {
  return (list || []).filter(override => Number(now) < override.endsAt);
}

// The override values in force, keyed by control. The newest value wins.
export function effectiveSky(list, now) {
  const sky = {};
  for (const override of activeOverrides(list, now)) sky[override.key] = override.value;
  return sky;
}

// Sets a timestamp for an override: it applies from `at` until its scope ends.
export function createOverride(input, at) {
  const normalized = normalizeOverride(input);
  return { ...normalized, startedAt: Number(at), endsAt: overrideEndsAt(normalized.scope, at) };
}

// The weather in force at a moment: the staff's weather override, or the day's climate.
export function effectiveWeatherAt(timestampMs, sky) {
  const base = dailyWeatherAt(timestampMs);
  if (!sky?.weather) return base;
  return { ...base, ...sky.weather, intensity: sky.weather.kind === 'clear' ? 0 : sky.weather.intensity, season: base.season, dayIndex: base.dayIndex };
}

// Applies the staff's sky values to the day state from getGameDayState.
// hour: the clock is moved to the staff's hour (see skyTimestamp); darkness sets the night;
// sunIntensity and moonIntensity scale the light; moonColor is handed to the moon's drawing.
export function applySkyToDay(day, sky) {
  if (!sky || Object.keys(sky).length === 0) return day;
  const next = { ...day };
  if (sky.darkness !== undefined) {
    next.night = sky.darkness;
    next.daylight = 1 - sky.darkness;
  }
  if (sky.sunIntensity !== undefined) next.sunlightStrength = (day.sunlightStrength || 0) * sky.sunIntensity;
  if (sky.moonIntensity !== undefined) next.moonlightStrength = (day.moonlightStrength || 0) * sky.moonIntensity;
  if (sky.moonColor !== undefined) next.moonColor = sky.moonColor;
  return next;
}

// The timestamp whose clock reads the staff's hour, taking the nearest such moment.
// It moves only the time of day; across midnight the date may advance by one.
export function skyTimestamp(timestampMs, sky) {
  if (sky?.hour === undefined) return timestampMs;
  const dayMs = GAME_DAY_DURATION_MS;
  const wanted = (sky.hour / 24) * dayMs;
  const elapsed = ((Number(timestampMs) - GAME_EPOCH_MS) % dayMs + dayMs) % dayMs;
  let shift = wanted - elapsed;
  if (shift > dayMs / 2) shift -= dayMs;
  if (shift <= -dayMs / 2) shift += dayMs;
  return Number(timestampMs) + shift;
}
