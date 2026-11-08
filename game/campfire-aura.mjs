export const CAMPFIRE_AURA_FRAME_COUNT = 8;
export const CAMPFIRE_AURA_FRAME_WIDTH = 64;
export const CAMPFIRE_AURA_FRAME_HEIGHT = 64;
export const CAMPFIRE_AURA_FRAME_DURATION_MS = 120;
export const CAMPFIRE_AURA_DISPLAY_SIZE = 64;
// Keep firelight close to the campfire; earlier values made one flame wash out
// most of the clearing when the dawn scene multiplied its radius again.
export const CAMPFIRE_AURA_LIGHT_SCALE = 0.9;

export function campfireAuraFrameIndex(timeSeconds, seed = 0, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(timeSeconds)) return 0;
  const offset = Math.floor((timeSeconds * 1000 + seed * 13) / CAMPFIRE_AURA_FRAME_DURATION_MS);
  return ((offset % CAMPFIRE_AURA_FRAME_COUNT) + CAMPFIRE_AURA_FRAME_COUNT) % CAMPFIRE_AURA_FRAME_COUNT;
}
