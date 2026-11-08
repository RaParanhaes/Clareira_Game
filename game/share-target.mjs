export const SHARE_REACH = 1.8;

export function getNearestShareTarget(origin, players, excludedId, reach = SHARE_REACH) {
  if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.y) || !Number.isFinite(reach) || reach < 0) return null;
  let nearest = null;
  let nearestDistance = reach;

  for (const player of players) {
    if (!player || player.id === excludedId) continue;
    const position = player.position || player;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
    const distance = Math.hypot(position.x - origin.x, position.y - origin.y);
    if (distance <= reach && (!nearest || distance < nearestDistance)) {
      nearest = player;
      nearestDistance = distance;
    }
  }

  return nearest;
}
