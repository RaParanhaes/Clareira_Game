const TAU = Math.PI * 2;

function fract(value) {
  return value - Math.floor(value);
}

function hash(x, y, salt) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123);
}

function modulo(value, period) {
  return ((value % period) + period) % period;
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Sample deterministic convection particles so every client sees the same trails for a fire.
export function sampleCampfireParticles(
  time, fire, airflow = 0, heat = 1, reducedMotion = false, smokeStrength = 0.34, afterglow = 0,
) {
  const x = Math.round((fire.x || 0) * 32);
  const y = Math.round((fire.y || 0) * 32);
  const seed = hash(x, y, 19);
  const draft = reducedMotion ? 0 : clamp(airflow, -1, 1);
  const warmth = clamp(heat, 0.9, 1.1);
  const plumeAge = clamp(afterglow, 0, 1);
  const smokeCount = Math.max(2, Math.round(3 + smokeStrength * 3));
  const smokeTime = reducedMotion ? 0.42 : time;

  const smoke = Array.from({ length: smokeCount }, (_, index) => {
    const salt = 31 + index * 7;
    const life = 1.35 + hash(x, y, salt) * 0.45 + plumeAge * 0.42;
    const age = modulo(smokeTime + hash(x, y, salt + 1) * life + index * life / smokeCount, life);
    const progress = age / life;
    const velocity = 4.2 + hash(x, y, salt + 2) * 2.2;
    const buoyancy = 1.4 + hash(x, y, salt + 3) * 1.5;
    const rise = warmth * (1 - plumeAge * 0.52) * (velocity * age + 0.5 * buoyancy * age * age);
    const phase = hash(x, y, salt + 4) * TAU;
    const drift = (draft * 2.3 + (hash(x, y, salt + 5) - 0.5) * 1.1) * age
      + (reducedMotion ? 0 : 0.48 * Math.sin(age * 3.2 + phase) * progress + 0.5 * draft * age * age);
    const alpha = (0.2 + plumeAge * 0.22) * Math.sin(progress * Math.PI) * (1 - progress * 0.12);
    const size = 2 + Number(progress > 0.38) + Number(progress > 0.72)
      + Number(progress > 0.86 && plumeAge > 0.22);
    const sourceY = -8 - 18 * (1 - plumeAge);
    return {
      x: Math.round((hash(x, y, salt + 6) - 0.5) * 5 + drift),
      y: Math.round(sourceY - rise),
      size,
      alpha,
      highlightAlpha: alpha * 0.48,
    };
  });

  const sparkColors = ['#ffc77b', '#ffe991', '#e96635', '#fff0a0', '#f7832f', '#ffd65c', '#ffad3c', '#ffe887'];
  const sparks = [];
  for (let index = 0; !reducedMotion && index < sparkColors.length; index += 1) {
    const salt = 71 + index * 7;
    const life = 0.58 + hash(x, y, salt) * 0.32;
    const pause = 0.12 + hash(x, y, salt + 1) * 0.18;
    const period = life + pause;
    const age = modulo(time + hash(x, y, salt + 2) * period + seed * index * 0.21, period);
    if (age >= life) continue;

    const progress = age / life;
    const initialUpdraft = 40 + hash(x, y, salt + 3) * 14;
    const buoyancy = 10 + hash(x, y, salt + 4) * 9;
    const rise = warmth * (initialUpdraft * age + 0.5 * buoyancy * age * age);
    const phase = hash(x, y, salt + 5) * TAU;
    const initialDrift = (hash(x, y, salt + 6) - 0.5) * 2.8;
    const drift = initialDrift * age + draft * (2.1 * age + 0.9 * age * age)
      + Math.sin(age * 5 + phase) * 0.9;
    const alpha = Math.min(1, age / 0.06) * Math.pow(1 - progress, 0.85);
    const launchSide = ((index % 4) - 1.5) * 2;
    sparks.push({
      x: Math.round(launchSide + drift),
      y: Math.round(-14 - rise),
      size: index % 3 === 0 ? 2 : 1,
      alpha,
      color: sparkColors[index],
    });
  }

  return { smoke, sparks };
}
