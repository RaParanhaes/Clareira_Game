// Climate of the world: daily weather by season, extreme sun, the lunar phase
// (a lunar month is four game weeks) and red moons. Everything is derived from
// the world timestamp, so every player sees the same sky. Kinds reuse the
// terrain names: clear, rain, snowing, storm.
import { GAME_EPOCH_MS, GAME_DAY_DURATION_MS, GAME_LUNAR_MONTH_DAYS, gameSeasonAt } from './game-time.mjs';

// A stable integer hash in [0, 1): the same day always draws the same number.
function unit(n, salt) {
  let x = (Math.imul(n | 0, 374761393) + Math.imul(salt | 0, 668265263)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

// Each season draws the day's sky from its own odds. Thresholds are cumulative.
const SEASON_SKY = Object.freeze({
  primavera: Object.freeze({ storm: 0.04, rain: 0.32, snow: 0 }),
  verao: Object.freeze({ storm: 0.02, rain: 0.08, snow: 0 }),
  outono: Object.freeze({ storm: 0.07, rain: 0.36, snow: 0 }),
  inverno: Object.freeze({ storm: 0, rain: 0, snow: 0.34 }),
});

// Weather of the day that contains the timestamp.
export function dailyWeatherAt(timestampMs) {
  const { dayIndex, season } = gameSeasonAt(timestampMs);
  const odds = SEASON_SKY[season];
  const roll = unit(dayIndex, 1);
  const intensity = 0.45 + 0.55 * unit(dayIndex, 2);
  let kind = 'clear';
  if (roll < odds.storm) kind = 'storm';
  else if (roll < odds.storm + odds.rain) kind = 'rain';
  else if (roll < odds.storm + odds.rain + odds.snow) kind = 'snowing';
  // Summer clear days can turn into extreme sun, a glare that the sky shows at noon.
  const extremeSun = season === 'verao' && kind === 'clear' && unit(dayIndex, 3) < 0.45;
  return { kind, intensity: kind === 'clear' ? 0 : intensity, extremeSun, season, dayIndex };
}

// Phase names by eighth of a lunar month, starting from the new moon.
const PHASE_NAMES = Object.freeze([
  'Lua Nova', 'Lua Crescente', 'Quarto Crescente', 'Crescente Gibosa',
  'Lua Cheia', 'Minguante Gibosa', 'Quarto Minguante', 'Lua Minguante',
]);

// The moon at a timestamp: phase, name, lit fraction, week of the lunar month,
// and whether this full moon is a red moon (every fourth full moon).
export function moonAt(timestampMs) {
  const lunarMonths = (Number(timestampMs) - GAME_EPOCH_MS) / (GAME_DAY_DURATION_MS * GAME_LUNAR_MONTH_DAYS);
  const phase = ((lunarMonths % 1) + 1) % 1;
  const octant = Math.floor(phase * 8) % 8;
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const isFull = octant === 4;
  const lunarMonthIndex = Math.floor(lunarMonths);
  return {
    phase,
    phaseName: PHASE_NAMES[octant],
    illumination,
    lunarWeek: Math.floor(phase * 4) + 1,
    isFull,
    redMoon: isFull && ((lunarMonthIndex % 4) + 4) % 4 === 3,
  };
}

// Rain comes in tiers by intensity (0..1): drizzle, rain and heavy rain.
export function rainTierFor(intensity) {
  const value = Number.isFinite(intensity) ? intensity : 0.55;
  if (value < 0.4) return 'chuvisco';
  if (value < 0.7) return 'chuva';
  return 'chuva forte';
}

// Wind multiplier of a moment: calm, breeze, rain gusts or storm. Hourly gusts
// make it breathe through the day, deterministically for every player.
const WIND_BY_KIND = Object.freeze({ clear: 1.0, rain: 1.5, snowing: 1.3, storm: 2.8 });
export function windLevelAt(timestampMs) {
  const weather = dailyWeatherAt(timestampMs);
  const hourOfDay = (Number(timestampMs) - GAME_EPOCH_MS) / GAME_DAY_DURATION_MS;
  const gust = 0.82 + 0.18 * Math.sin(hourOfDay * Math.PI * 2 * 9 + weather.dayIndex) + 0.08 * Math.sin(hourOfDay * Math.PI * 2 * 23);
  const kindLevel = WIND_BY_KIND[weather.kind] ?? 1;
  return Math.max(0.5, kindLevel * (0.7 + 0.3 * weather.intensity + 0.3 * (gust - 0.82)));
}

// The wind described for the HUD.
export function windLabel(level) {
  if (level >= 2.4) return 'vento de tempestade';
  if (level >= 1.6) return 'vento forte';
  if (level >= 1.1) return 'vento moderado';
  return 'vento calmo';
}

// Short Portuguese label for the sky, used in the HUD.
export function weatherLabel(weather) {
  if (weather.kind === 'storm') return 'tempestade';
  if (weather.kind === 'rain') return rainTierFor(weather.intensity);
  if (weather.kind === 'snowing') return 'neve';
  if (weather.extremeSun) return 'sol escaldante';
  return 'céu limpo';
}
