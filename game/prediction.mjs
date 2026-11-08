// Snapshots acknowledge simulated commands, not packet arrival. Replay only the remainder.
export function reconcilePrediction(authoritative, pending, step, occupied = []) {
  const remaining = pending.filter(command => command.seq > (authoritative.inputSeq || 0));
  let position = { x: authoritative.x, y: authoritative.y };
  for(const field of ['vx','vy','z','vz','flightZ','blocked','jumpHeld','running','crouching','fireJumping','burningRemainingMs'])if(authoritative[field]!==undefined)position[field]=authoritative[field];
  for (const command of remaining) position = step(position, command, 1 / 60, occupied);
  return { position, pending: remaining };
}

// Keep small authoritative corrections from appearing as a visible teleport.
// Gameplay and collision still use the authoritative predicted position; this
// offset only affects where the avatar is drawn and decays over a few frames.
export function renderCorrectionOffset(visible, target) {
  return { x: visible.x - target.x, y: visible.y - target.y };
}

export function decayRenderCorrection(offset, deltaSeconds, timeConstantSeconds = 0.14) {
  const elapsed = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.1));
  const timeConstant = Math.max(0.01, Number(timeConstantSeconds) || 0.14);
  const factor = Math.exp(-elapsed / timeConstant);
  const next = { x: offset.x * factor, y: offset.y * factor };
  return Math.hypot(next.x, next.y) < 0.001 ? { x: 0, y: 0 } : next;
}

// Do not leave the prediction window permanently full on an open but stalled socket.
export function shouldRecoverPrediction(pendingCount, lastProgressAt, now, {
  maxPending = 100,
  stalledMs = 2500,
  pressureSince = 0,
  pressureThreshold = maxPending,
  pressureMs = 0,
} = {}) {
  const fullyStalled=pendingCount>=maxPending&&now-lastProgressAt>=stalledMs;
  // A large window that is actively draining is not a dead connection.
  // Reconnecting it repeatedly discarded its recovery progress on slow clients.
  const persistentlyCongested=pressureMs>0&&pendingCount>=pressureThreshold&&pressureSince>0
    &&now-pressureSince>=pressureMs&&now-lastProgressAt>=Math.min(stalledMs,750);
  return fullyStalled||persistentlyCongested;
}
