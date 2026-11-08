// Draws the sky's weather over the scene: rain in four strengths, snow, storm,
// extreme sun and the red moon's tint. Particles are placed from a stable hash of
// their index and the world clock, so every player sees the same drops and flakes
// at the same moment. The wind leans the rain and drifts the snow. Reduced motion
// freezes the particles where they start.

const hash = (index, salt) => {
  let x = (Math.imul(index | 0, 374761393) + Math.imul(salt | 0, 668265263)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const wrap = (value, length) => ((value % length) + length) % length;

// Drop count and look for each rain strength. Drizzle is sparse and thin; a storm is dense.
const RAIN_STYLE = Object.freeze({
  chuvisco: Object.freeze({ base: 60, span: 60, fall: 260, width: 0.9, color: 'rgba(200,220,240,0.32)' }),
  chuva: Object.freeze({ base: 150, span: 120, fall: 420, width: 1.3, color: 'rgba(200,220,240,0.55)' }),
  'chuva forte': Object.freeze({ base: 260, span: 180, fall: 520, width: 1.5, color: 'rgba(196,216,238,0.66)' }),
  tempestade: Object.freeze({ base: 300, span: 300, fall: 640, width: 1.7, color: 'rgba(186,210,232,0.74)' }),
});

// Rain strength name from an intensity (0..1), the same bands as the HUD.
export function rainStrengthFor(kind, intensity) {
  if (kind === 'storm') return 'tempestade';
  const value = Number.isFinite(intensity) ? intensity : 0.55;
  if (value < 0.4) return 'chuvisco';
  if (value < 0.7) return 'chuva';
  return 'chuva forte';
}

// Number of particles for a kind and intensity (0..1), scaled to the viewport.
export function precipitationCount(kind, intensity, width, height) {
  const area = Math.max(1, width * height) / (1440 * 900);
  if (kind === 'rain' || kind === 'storm') {
    const style = RAIN_STYLE[rainStrengthFor(kind, intensity)];
    return Math.round((style.base + style.span * intensity) * area);
  }
  if (kind === 'snowing') return Math.round((50 + 90 * intensity) * area);
  return 0;
}

// The wind leans rain: a calm day falls almost straight, a storm slants hard.
function rainSlant(wind) {
  return Math.max(0.05, Math.min(0.9, 0.1 + 0.16 * (wind - 1)));
}

function drawRain(ctx, width, height, count, seconds, strength, wind) {
  const style = RAIN_STYLE[strength];
  ctx.lineWidth = style.width;
  ctx.strokeStyle = style.color;
  const slant = rainSlant(wind);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = hash(i, 11) * (width + 120) - 60;
    const y = wrap(hash(i, 12) * (height + 60) + seconds * style.fall * (0.85 + 0.3 * hash(i, 13)), height + 60) - 30;
    ctx.moveTo(x, y);
    ctx.lineTo(x - slant * 18, y + 18);
  }
  ctx.stroke();
}

function drawSnow(ctx, width, height, count, seconds, wind) {
  ctx.fillStyle = 'rgba(244,248,255,0.85)';
  const sway = 14 * Math.max(0.6, wind);
  for (let i = 0; i < count; i++) {
    const radius = 1 + hash(i, 21) * 1.8;
    const drift = Math.sin(seconds * (0.6 + hash(i, 22)) + i) * sway + seconds * 10 * (wind - 1);
    const x = wrap(hash(i, 23) * (width + 60) + drift, width + 60) - 30;
    const y = wrap(hash(i, 24) * (height + 40) + seconds * (34 + 26 * hash(i, 25)), height + 40) - 20;
    ctx.globalAlpha = 0.5 + 0.4 * hash(i, 26);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Each season tints the whole landscape: cool and grey in winter, warm in autumn,
// fresh in spring and untinted in summer.
const SEASON_VEIL = Object.freeze({
  primavera: 'rgba(170,220,150,0.07)',
  verao: null,
  outono: 'rgba(210,120,40,0.11)',
  inverno: 'rgba(150,178,210,0.24)',
});
function drawSeasonVeil(ctx, width, height, season) {
  const veil = SEASON_VEIL[season];
  if (!veil) return;
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);
}

// A warm glare from the top of the frame, harsher and whiter than a normal day.
function drawExtremeSun(ctx, width, height, strength) {
  const glare = ctx.createRadialGradient(width * 0.18, -height * 0.05, 0, width * 0.18, -height * 0.05, width * 0.7);
  glare.addColorStop(0, `rgba(255,246,214,${0.55 * strength})`);
  glare.addColorStop(0.5, `rgba(255,220,150,${0.22 * strength})`);
  glare.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
}

// A dim red wash for the night of a red moon, kept light so the scene stays readable.
function drawRedMoonTint(ctx, width, height, night) {
  ctx.fillStyle = `rgba(140,28,20,${0.34 * night})`;
  ctx.fillRect(0, 0, width, height);
}

// Entry point: draws what the sky of this moment asks for.
// options: { weather, moon, night, seconds, reducedMotion, wind }.
// wind is the wind level of the moment (1 is a breeze, 2.8 a storm).
export function drawWeatherSky(ctx, width, height, options) {
  const { weather, moon, night = 0, seconds = 0, reducedMotion = false, wind = 1 } = options;
  const time = reducedMotion ? 0 : seconds;
  const kind = weather?.kind || 'clear';
  const intensity = Math.max(0, Math.min(1, weather?.intensity || 0));
  if (!weather && !moon) return;
  ctx.save();
  // Never inherit alpha or blend mode from the frame before this layer.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (weather) drawSeasonVeil(ctx, width, height, weather.season);
  if (weather?.extremeSun) drawExtremeSun(ctx, width, height, 1.5);
  if (kind === 'storm') {
    ctx.fillStyle = 'rgba(20,28,38,0.16)';
    ctx.fillRect(0, 0, width, height);
  }
  const count = precipitationCount(kind, intensity, width, height);
  if (kind === 'rain' || kind === 'storm') {
    drawRain(ctx, width, height, count, time, rainStrengthFor(kind, intensity), wind);
  }
  if (kind === 'snowing') drawSnow(ctx, width, height, count, time, wind);
  if (moon?.redMoon && night > 0.5) drawRedMoonTint(ctx, width, height, night);
  ctx.restore();
}
