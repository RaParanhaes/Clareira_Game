// Draws the sky's weather over the scene: rain, snow, storm, extreme sun and the
// red moon's tint. Particles are placed from a stable hash of their index and the
// world clock, so every player sees the same drops and flakes at the same moment.
// Reduced motion freezes the particles where they start.

const hash = (index, salt) => {
  let x = (Math.imul(index | 0, 374761393) + Math.imul(salt | 0, 668265263)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const wrap = (value, length) => ((value % length) + length) % length;

// Number of particles for a kind and intensity (0..1). Storms fall heavier.
export function precipitationCount(kind, intensity, width, height) {
  const area = Math.max(1, width * height) / (1440 * 900);
  if (kind === 'rain') return Math.round((150 + 260 * intensity) * area);
  if (kind === 'storm') return Math.round((280 + 360 * intensity) * area);
  if (kind === 'snowing') return Math.round((50 + 90 * intensity) * area);
  return 0;
}

function drawRain(ctx, width, height, count, seconds, storm) {
  ctx.lineWidth = storm ? 1.6 : 1.3;
  ctx.strokeStyle = storm ? 'rgba(186,210,232,0.7)' : 'rgba(200,220,240,0.55)';
  const fall = storm ? 620 : 420;
  const slant = storm ? 0.42 : 0.24;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = hash(i, 11) * (width + 80) - 40;
    const y = wrap(hash(i, 12) * (height + 60) + seconds * fall * (0.85 + 0.3 * hash(i, 13)), height + 60) - 30;
    ctx.moveTo(x, y);
    ctx.lineTo(x - slant * 16, y + 16);
  }
  ctx.stroke();
}

function drawSnow(ctx, width, height, count, seconds) {
  ctx.fillStyle = 'rgba(244,248,255,0.85)';
  for (let i = 0; i < count; i++) {
    const radius = 1 + hash(i, 21) * 1.8;
    const drift = Math.sin(seconds * (0.6 + hash(i, 22)) + i) * 14;
    const x = wrap(hash(i, 23) * (width + 60) + drift, width + 60) - 30;
    const y = wrap(hash(i, 24) * (height + 40) + seconds * (34 + 26 * hash(i, 25)), height + 40) - 20;
    ctx.globalAlpha = 0.5 + 0.4 * hash(i, 26);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// A warm glare from the top of the frame, harsher and whiter than a normal day.
function drawExtremeSun(ctx, width, height, strength) {
  const glare = ctx.createRadialGradient(width * 0.18, -height * 0.05, 0, width * 0.18, -height * 0.05, width * 0.7);
  glare.addColorStop(0, `rgba(255,246,214,${0.34 * strength})`);
  glare.addColorStop(0.5, `rgba(255,220,150,${0.12 * strength})`);
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
// options: { weather, moon, night, seconds, reducedMotion }.
export function drawWeatherSky(ctx, width, height, options) {
  const { weather, moon, night = 0, seconds = 0, reducedMotion = false } = options;
  const time = reducedMotion ? 0 : seconds;
  const kind = weather?.kind || 'clear';
  const intensity = Math.max(0, Math.min(1, weather?.intensity || 0));
  if (!weather && !moon) return;
  ctx.save();
  // Never inherit alpha or blend mode from the frame before this layer.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (weather?.extremeSun) drawExtremeSun(ctx, width, height, 1.5);
  if (kind === 'storm') {
    ctx.fillStyle = 'rgba(20,28,38,0.14)';
    ctx.fillRect(0, 0, width, height);
  }
  const count = precipitationCount(kind, intensity, width, height);
  if (kind === 'rain' || kind === 'storm') drawRain(ctx, width, height, count, time, kind === 'storm');
  if (kind === 'snowing') drawSnow(ctx, width, height, count, time);
  if (moon?.redMoon && night > 0.5) drawRedMoonTint(ctx, width, height, night);
  ctx.restore();
}
