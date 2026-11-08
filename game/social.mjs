export const CAMPFIRE_GATHERING_RADIUS = 2.8;

export function getCampfireGatheringCount(fire, players, now = Date.now()) {
  if (!fire || !Number.isFinite(fire.x) || !Number.isFinite(fire.y)) return 0;
  let companions = 0;

  for (const player of players) {
    const resting = (player?.sitting === true || player?.emote === 'sit') && player.moving === false;
    const dancing = player?.emote === 'dance' && player.emoteUntil > now;
    if ((!resting && !dancing) || !Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
    if (Math.hypot(player.x - fire.x, player.y - fire.y) <= CAMPFIRE_GATHERING_RADIUS) companions += 1;
  }

  return companions;
}
