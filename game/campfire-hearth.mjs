export const CAMPFIRE_HEARTH_FRAME_COUNT = 8;
export const CAMPFIRE_HEARTH_FRAME_WIDTH = 40;
export const CAMPFIRE_HEARTH_FRAME_HEIGHT = 40;
export const CAMPFIRE_HEARTH_FRAME_DURATION_MS = 100;
export const CAMPFIRE_HEARTH_ANCHOR = Object.freeze({ x: 20, y: 36 });

export function campfireHearthFrameIndex(timeSeconds, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(timeSeconds)) return 0;
  const frame = Math.floor(timeSeconds * 1000 / CAMPFIRE_HEARTH_FRAME_DURATION_MS);
  return ((frame % CAMPFIRE_HEARTH_FRAME_COUNT) + CAMPFIRE_HEARTH_FRAME_COUNT)
    % CAMPFIRE_HEARTH_FRAME_COUNT;
}
