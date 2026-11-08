import { CAMPFIRE_GATHERING_RADIUS } from './social.mjs';

const FACINGS = new Set(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);

export function getLocalAvatarView(serverSnapshot, localState) {
  return { ...serverSnapshot, ...localState };
}

export function getFacingFromVector(x, y, tileX, tileY, previous = 'south') {
  const worldX = Number(x);
  const worldY = Number(y);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)
      || !(tileX > 0) || !(tileY > 0)) return FACINGS.has(previous) ? previous : 'south';

  // Convert the world-space movement into the same screen-space projection as the map.
  const screenX = (worldX - worldY) * tileX;
  const screenY = (worldX + worldY) * tileY;
  const horizontal = Math.abs(screenX);
  const vertical = Math.abs(screenY);
  if (Math.max(horizontal, vertical) < 0.0001) return FACINGS.has(previous) ? previous : 'south';

  // Eight equal screen-space sectors; movement and art use the same projection.
  const sector = (Math.round(Math.atan2(screenY, screenX) / (Math.PI / 4)) + 8) % 8;
  return ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'][sector];
}

// Keep the last art direction while physical braking finishes after input release.
export function getFacingFromMotion(x, y, tileX, tileY, previous = 'south', hasIntent = true) {
  if (!hasIntent || Math.hypot(Number(x) || 0, Number(y) || 0) < 0.0001) {
    return FACINGS.has(previous) ? previous : 'south';
  }
  return getFacingFromVector(x, y, tileX, tileY, previous);
}

export function getFacingIntent(input = {}, motionX = 0, motionY = 0, tileX = 1, tileY = 1) {
  const inputX = Number(input.x) || 0, inputY = Number(input.y) || 0;
  if (Math.hypot(inputX, inputY) < 0.0001) return { x: 0, y: 0 };
  const actualX = Number(motionX) || 0, actualY = Number(motionY) || 0;
  if (Math.hypot(actualX, actualY) < 0.0001) return { x: inputX, y: inputY };
  const inputScreen = { x: tileX * (inputX - inputY), y: tileY * (inputX + inputY) };
  const actualScreen = { x: tileX * (actualX - actualY), y: tileY * (actualX + actualY) };
  const inputLength = Math.hypot(inputScreen.x, inputScreen.y);
  const actualLength = Math.hypot(actualScreen.x, actualScreen.y);
  const alignment = inputLength && actualLength
    ? (inputScreen.x * actualScreen.x + inputScreen.y * actualScreen.y) / (inputLength * actualLength)
    : 0;
  return alignment >= 0.25 ? { x: actualX, y: actualY } : { x: inputX, y: inputY };
}

export function advanceFacingDirection(state = {}, intent = {}, tileX, tileY, elapsed = 1 / 60) {
  const facing = FACINGS.has(state.facing) ? state.facing : 'south';
  const x = Number(intent.x) || 0, y = Number(intent.y) || 0;
  if (Math.hypot(x, y) < 0.0001) return { facing, candidate: facing, elapsed: 0 };
  const candidate = getFacingFromVector(x, y, tileX, tileY, facing);
  if (candidate === facing) return { facing, candidate, elapsed: 0 };
  const prior = FACINGS.has(state.candidate) ? state.candidate : facing;
  const duration = Math.max(0, Number(elapsed) || 0);
  const candidateElapsed = (prior === candidate ? Math.max(0, Number(state.elapsed) || 0) : 0) + duration;
  if (candidateElapsed >= 4 / 60) return { facing: candidate, candidate, elapsed: 0 };
  return { facing, candidate, elapsed: candidateElapsed };
}

export function getAvatarPose(player, now = Date.now()) {
  const emoteActive = ['sit','lie','shower'].includes(player.emote) || (Boolean(player.emote) && player.emoteUntil > now);
  const sitting = (player.sitting === true || (emoteActive && player.emote === 'sit')) && player.moving !== true;
  const gesture = emoteActive && ['wave', 'dance', 'offer'].includes(player.emote) ? player.emote : null;
  const gathering = emoteActive && player.emote === 'gather' && player.moving !== true;
  const lying=emoteActive&&player.emote==='lie'&&player.moving!==true;
  const showering=emoteActive&&player.emote==='shower'&&player.moving!==true;
  const symbol = emoteActive && player.emote === 'wave'
    ? '✦'
    : emoteActive && player.emote === 'dance' ? '♪' : null;
  return { sitting, symbol, gesture, gathering,lying,showering };
}

export function getAvatarFacing(player, position, fires, tileX, tileY, now = Date.now()) {
  const facing = FACINGS.has(player?.facing) ? player.facing : 'south';
  if (!getAvatarPose(player, now).sitting
      || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return facing;

  let nearest = null;
  for (const fire of fires || []) {
    if (!Number.isFinite(fire?.x) || !Number.isFinite(fire?.y)) continue;
    const distance = Math.hypot(position.x - fire.x, position.y - fire.y);
    if (distance <= CAMPFIRE_GATHERING_RADIUS && (!nearest || distance < nearest.distance)) {
      nearest = { fire, distance };
    }
  }
  if (!nearest) return facing;
  return getFacingFromVector(
    nearest.fire.x - position.x,
    nearest.fire.y - position.y,
    tileX,
    tileY,
    facing,
  );
}
