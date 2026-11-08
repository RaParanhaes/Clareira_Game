export const CAMPFIRE_SKY_RAYS_FRAME_COUNT = 16;
export const CAMPFIRE_SKY_RAYS_FRAME_WIDTH = 128;
export const CAMPFIRE_SKY_RAYS_FRAME_HEIGHT = 384;
export const CAMPFIRE_SKY_RAYS_FRAME_DURATION_MS = 60;

export function campfireSkyRaysFrameIndex(elapsedSeconds, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(elapsedSeconds)) return 0;
  const frame = Math.floor(Math.max(0, elapsedSeconds) * 1000 / CAMPFIRE_SKY_RAYS_FRAME_DURATION_MS);
  return frame % CAMPFIRE_SKY_RAYS_FRAME_COUNT;
}
