export const CAMPFIRE_LIGHT_RADIUS_TILES = 7;
export const ARRIVAL_CAMPFIRE_REACH_MULTIPLIER = 1;
export const ARRIVAL_CAMPFIRE_EDGE_POWER = 1.35;

// Approximate a raised, spherical point source projected onto the isometric ground.
// Inverse-square attenuation shapes the pool; the exponent only feathers its edge.
export function campfireLightFalloff(normalizedDistance, edgePower = 1.35) {
  if (!Number.isFinite(normalizedDistance)) return 0;
  const distance = Math.max(0, Math.min(1, normalizedDistance));
  const edge = Number.isFinite(edgePower) ? Math.max(.1, edgePower) : 1.35;
  const sourceHeight = .85;
  const inverseSquare = (sourceHeight * sourceHeight)
    / (sourceHeight * sourceHeight + distance * distance);
  return inverseSquare * (1 - distance) ** edge;
}
