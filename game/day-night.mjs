export const GAME_DAY_DURATION_MS = 24 * 60 * 1000;

const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const modulo = (value, period) => ((value % period) + period) % period;

const CYCLES = Object.freeze({
  forest: Object.freeze({ dawnStart: 5, dawnEnd: 8, dayEnd: 17, nightStart: 20 }),
  sky: Object.freeze({ dawnStart: 5, dawnEnd: 7, dayEnd: 17, nightStart: 19 }),
  magic: Object.freeze({ dawnStart: 3, dawnEnd: 5, dayEnd: 13, nightStart: 15 }),
  inferno: Object.freeze({ dawnStart: 5, dawnEnd: 7, dayEnd: 17, nightStart: 19 }),
  giants: Object.freeze({ dawnStart: 5, dawnEnd: 7, dayEnd: 17, nightStart: 19 }),
  energy: Object.freeze({ dawnStart: 5, dawnEnd: 7, dayEnd: 17, nightStart: 19 }),
});

const CELESTIAL_PROFILES = Object.freeze({
  forest: Object.freeze({ sun: true, moon: true }),
  sky: Object.freeze({ sun: true, moon: true }),
  magic: Object.freeze({ sun: true, moon: true }),
  inferno: Object.freeze({ sun: true, moon: true }),
  giants: Object.freeze({ sun: true, moon: true }),
  energy: Object.freeze({ sun: true, moon: true }),
  dark: Object.freeze({ sun: false, moon: false }),
});

function smoothstep(value) {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

function blendHex(from,to,amount){
  const t=clamp01(amount),a=[1,3,5].map(offset=>parseInt(from.slice(offset,offset+2),16));
  const b=[1,3,5].map(offset=>parseInt(to.slice(offset,offset+2),16));
  return `#${a.map((value,index)=>Math.round(value+(b[index]-value)*t).toString(16).padStart(2,'0')).join('')}`;
}

function skyPosition(progress, eastToWest = true) {
  const amount = clamp01(progress);
  const elevation = Math.sin(amount * Math.PI);
  const horizontal = eastToWest ? amount : 1 - amount;
  return {
    x: 0.06 + horizontal * 0.88,
    y: 0.2 - elevation * 0.13,
    elevation,
  };
}

export function getGameDayState(timestampMs = Date.now(), { theme = 'forest', dimensionId = 'surface' } = {}) {
  const elapsed = modulo(timestampMs, GAME_DAY_DURATION_MS);
  const hours = elapsed / GAME_DAY_DURATION_MS * 24;
  const starsRotation = elapsed / GAME_DAY_DURATION_MS;
  const lunarPhase = modulo(timestampMs / (GAME_DAY_DURATION_MS * 8), 1);
  const moonIllumination = (1 - Math.cos(lunarPhase * TAU)) / 2;
  const eternalNight = dimensionId === 'breu' || theme === 'dark';
  const celestialProfile = CELESTIAL_PROFILES[theme] || CELESTIAL_PROFILES.forest;

  if (eternalNight) {
    return {
      hours,
      daylight: 0,
      sunlightStrength: 0,
      night: 1,
      isNight: true,
      period: 'Noite eterna',
      label: '',
      sunColor: '#f7d987',
      sunProgress: null,
      sunElevation: 0,
      sunPosition: null,
      moonProgress: null,
      moonElevation: 0,
      moonPosition: null,
      moonOpacity: 0,
      moonPhase: lunarPhase,
      moonIllumination,
      moonlightStrength: 0,
      starsRotation,
    };
  }

  const cycle = CYCLES[theme] || CYCLES.forest;
  let daylight = 0;
  if (hours >= cycle.dawnStart && hours < cycle.dawnEnd) {
    daylight = smoothstep((hours - cycle.dawnStart) / (cycle.dawnEnd - cycle.dawnStart));
  } else if (hours >= cycle.dawnEnd && hours < cycle.dayEnd) daylight = 1;
  else if (hours >= cycle.dayEnd && hours < cycle.nightStart) {
    daylight = 1 - smoothstep((hours - cycle.dayEnd) / (cycle.nightStart - cycle.dayEnd));
  }

  const sunProgress = clamp01((hours - cycle.dawnStart) / (cycle.nightStart - cycle.dawnStart));
  const sunPosition = celestialProfile.sun ? skyPosition(sunProgress) : null;
  const sunElevation=sunPosition?.elevation||0;
  const sunlightStrength=daylight*(.22+.78*sunElevation);
  const lowSunColor=sunProgress<.5?'#f3a259':'#e9784f';
  const celestialSunColor=blendHex(lowSunColor,'#fff3d7',smoothstep((sunElevation-.08)/.82));
  const moonDuration = 24 - cycle.nightStart + cycle.dawnEnd;
  const moonHours = hours >= cycle.nightStart
    ? hours - cycle.nightStart
    : hours <= cycle.dawnEnd
      ? 24 - cycle.nightStart + hours
      : 0;
  // The eight-day phase cycle includes genuinely moonless nights. Keep the
  // threshold above the faint crescent so a dark night has no lunar fill.
  const moonVisible = celestialProfile.moon && moonIllumination > .14;
  const moonProgress = moonVisible ? clamp01(moonHours / moonDuration) : null;
  const moonPosition = moonProgress === null ? null : skyPosition(moonProgress, false);
  const night = 1 - daylight;
  const themeMoonBoost = theme === 'sky' || theme === 'energy' ? 1.18 : theme === 'inferno' ? 0.82 : 1;
  const moonlightStrength = moonPosition
    ? night * themeMoonBoost * (0.035 + 0.105 * moonIllumination)
      * (0.35 + 0.65 * moonPosition.elevation)
    : 0;
  const hour = Math.floor(hours);
  const minute = Math.floor((hours - hour) * 60);
  const period = hours >= cycle.nightStart || hours < cycle.dawnStart
    ? 'Noite'
    : hours < cycle.dawnEnd ? 'Amanhecer' : hours < cycle.dayEnd ? 'Dia' : 'Anoitecer';

  return {
    hours,
    daylight,
    sunlightStrength,
    night,
    isNight: period === 'Noite',
    period,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    sunColor: theme === 'magic' ? blendHex('#bd83eb','#e7d4ff',sunElevation) : theme === 'inferno' ? blendHex('#e97448','#ffc27d',sunElevation) : celestialSunColor,
    sunProgress,
    sunElevation,
    sunPosition,
    moonProgress,
    moonElevation: moonPosition?.elevation || 0,
    moonPosition,
    moonOpacity: moonVisible ? night : 0,
    hasMoon: moonVisible,
    moonPhase: lunarPhase,
    moonIllumination,
    moonlightStrength,
    starsRotation,
  };
}
