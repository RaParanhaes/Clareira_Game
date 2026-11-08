export const ARRIVAL_CAMERA_HOLD_MS = 2_000;
export const ARRIVAL_CAMERA_PAN_MS = 1_250;
// The atlas reaches its first grounded impact at frame 8 (690 ms + 8 × 60 ms).
export const ARRIVAL_LIGHTNING_IMPACT_MS = 1_170;
export const ARRIVAL_IMPACT_SHAKE_MS = 950;

// The hearth stays unlit until the bolt contacts its logs.
export function arrivalFlameIgnition(elapsedMs) {
  if (!Number.isFinite(elapsedMs)) return 1;
  if (elapsedMs <= ARRIVAL_LIGHTNING_IMPACT_MS) return 0;
  const progress = Math.min(1, (elapsedMs - ARRIVAL_LIGHTNING_IMPACT_MS) / 300);
  return progress * progress * (3 - 2 * progress);
}

export function arrivalAvatarVisible(elapsedMs) {
  return !Number.isFinite(elapsedMs) || elapsedMs >= ARRIVAL_CAMERA_HOLD_MS;
}

export function arrivalImpactShake(elapsedMs, reducedMotion = false) {
  const elapsed = elapsedMs - ARRIVAL_LIGHTNING_IMPACT_MS;
  if (reducedMotion || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= ARRIVAL_IMPACT_SHAKE_MS) return null;
  const attack = Math.min(1, elapsed / 42);
  const strength = 22 * attack * Math.exp(-elapsed / 290);
  return {
    x: Math.sin(elapsed * .13) * strength,
    y: Math.cos(elapsed * .16) * strength * .72,
  };
}

export function arrivalCameraTarget(fire, avatar, elapsedMs, reducedMotion = false) {
  if (!fire || !Number.isFinite(fire.x) || !Number.isFinite(fire.y)
    || !avatar || !Number.isFinite(avatar.x) || !Number.isFinite(avatar.y)
    || !Number.isFinite(elapsedMs)) return avatar;

  if (elapsedMs < ARRIVAL_CAMERA_HOLD_MS) return fire;
  const progress = reducedMotion
    ? 1
    : Math.max(0, Math.min(1, (elapsedMs - ARRIVAL_CAMERA_HOLD_MS) / ARRIVAL_CAMERA_PAN_MS));
  const eased = progress * progress * (3 - 2 * progress);
  return {
    x: fire.x + (avatar.x - fire.x) * eased,
    y: fire.y + (avatar.y - fire.y) * eased,
  };
}
