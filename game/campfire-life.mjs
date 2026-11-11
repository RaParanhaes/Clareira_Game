import { GAME_DAY_DURATION_MS } from './day-night.mjs';

// Combustível: 3 minutos de fogo alto e 1 minuto apagando (4 minutos no total).
export const CAMPFIRE_LIFETIME_MS = 4 * 60 * 1000;
export const CAMPFIRE_PLAYER_BURN_DURATION_MS = 6 * 1000;
export const CAMPFIRE_DECAY_DELAY_MS = GAME_DAY_DURATION_MS;
export const CAMPFIRE_DECAY_DURATION_MS = GAME_DAY_DURATION_MS;
export const CAMPFIRE_IGNITION_RAMP_MS = 4 * 1000;
export const CAMPFIRE_FEED_WINDOW_MS = CAMPFIRE_LIFETIME_MS * 0.25;
export const CAMPFIRE_SMOKE_HOLD_MS = 2 * 60 * 1000;
export const CAMPFIRE_SMOKE_FADE_MS = 90 * 1000;
export const CAMPFIRE_SMOKE_TAIL_MS = CAMPFIRE_SMOKE_HOLD_MS + CAMPFIRE_SMOKE_FADE_MS;
export const CAMPFIRE_REKINDLE_COST = Object.freeze({ wood: 10, stone: 0, leaves: 1 });
export const CAMPFIRE_DECAY_REBUILD_COST = Object.freeze({ wood: 10, stone: 5, leaves: 1 });
export const CAMPFIRE_NEW_COST = Object.freeze({ wood: 20, stone: 10, leaves: 1 });
export const CAMPFIRE_FEED_COST = Object.freeze({ wood: 2, stone: 0, leaves: 0 });

const clamp01 = value => Math.max(0, Math.min(1, value));

export function campfireRemainingMs(fire, now = Date.now()) {
  if (fire?.permanent === true) return Number.MAX_SAFE_INTEGER;
  if (Number.isFinite(fire?.burnRemainingMs)) {
    const sampledAt = Number.isFinite(fire.burnSampledAt) ? fire.burnSampledAt : now;
    return Math.max(0, fire.burnRemainingMs - Math.max(0, now - sampledAt));
  }
  if (!Number.isFinite(fire?.litAt)) return CAMPFIRE_LIFETIME_MS;
  return Math.max(0, CAMPFIRE_LIFETIME_MS - Math.max(0, now - fire.litAt));
}

export function campfireFuelRatio(fire, now = 0) {
  return clamp01(campfireRemainingMs(fire, now) / CAMPFIRE_LIFETIME_MS);
}

export function campfireBurnedOutForMs(fire, now = Date.now()) {
  if (fire?.permanent === true) return 0;
  if (campfireRemainingMs(fire, now) > 0) return 0;
  if (Number.isFinite(fire?.burnedOutForMs)) {
    const sampledAt = Number.isFinite(fire.burnSampledAt) ? fire.burnSampledAt : now;
    return Math.max(0, fire.burnedOutForMs + Math.max(0, now - sampledAt));
  }
  return Number.isFinite(fire?.litAt)
    ? Math.max(0, now - fire.litAt - CAMPFIRE_LIFETIME_MS)
    : 0;
}

export function campfireDecayProgress(fire, now = Date.now()) {
  const elapsed = campfireBurnedOutForMs(fire, now) - CAMPFIRE_DECAY_DELAY_MS;
  return clamp01(elapsed / CAMPFIRE_DECAY_DURATION_MS);
}

export function campfireFlameRampProgress(fire, now = 0) {
  const duration = Number.isFinite(fire?.flameRiseDurationMs)
    ? Math.max(1, fire.flameRiseDurationMs) : CAMPFIRE_IGNITION_RAMP_MS;
  if (Number.isFinite(fire?.flameRiseRemainingMs)) {
    const sampledAt = Number.isFinite(fire.flameRiseSampledAt) ? fire.flameRiseSampledAt : now;
    const remaining = Math.max(0, fire.flameRiseRemainingMs - Math.max(0, now - sampledAt));
    return clamp01(1 - remaining / duration);
  }
  if (!Number.isFinite(fire?.flameRiseAt)) return 1;
  return clamp01((now - fire.flameRiseAt) / duration);
}

export function campfireFlameStrength(fire, now = 0) {
  const fuel = campfireFuelRatio(fire, now);
  if (fuel === 0) return 0;
  const naturalStrength = fuel ** 0.72;
  const progress = campfireFlameRampProgress(fire, now);
  if (progress >= 1) return naturalStrength;
  const from = clamp01(Number.isFinite(fire?.flameRiseFrom) ? fire.flameRiseFrom : 0);
  const easedProgress = progress * progress * (3 - 2 * progress);
  return Math.min(naturalStrength, from + (1 - from) * easedProgress);
}

export function campfireSmokeState(fire, now = 0) {
  const fuel = campfireFuelRatio(fire, now);
  if (fuel > 0) {
    // Smoke thickens as the last fuel smolders instead of disappearing with the flame.
    const smolder = Math.max(0, Math.min(1, (0.34 - fuel) / 0.34));
    return { strength: 0.34 + smolder * 0.48, afterglow: smolder };
  }

  const afterBurnMs = campfireBurnedOutForMs(fire, now);
  const fadeProgress = clamp01((afterBurnMs - CAMPFIRE_SMOKE_HOLD_MS) / CAMPFIRE_SMOKE_FADE_MS);
  const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
  return { strength: 0.9 * (1 - easedFade), afterglow: 1 };
}
