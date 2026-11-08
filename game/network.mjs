export function reconnectSchedule(currentDelayMs, readyDurationMs, { baseDelayMs = 700, maxDelayMs = 15_000, stableReadyMs = 15_000, multiplier = 1.8, jitterRatio = 0.2, random = Math.random } = {}) {
  const base = Math.max(1, Number(baseDelayMs) || 700);
  const maximum = Math.max(base, Number(maxDelayMs) || 15_000);
  const current = Math.min(maximum, Math.max(base, Number(currentDelayMs) || base));
  const nominalDelay = Number(readyDurationMs) >= stableReadyMs ? base : current;
  const spread = Math.min(0.5, Math.max(0, Number(jitterRatio) || 0));
  const sample = Math.min(1, Math.max(0, Number(random()) || 0));
  const delayMs = Math.min(maximum, Math.round(nominalDelay * (1 - spread + 2 * spread * sample)));
  return { delayMs, nextDelayMs: Math.min(maximum, nominalDelay * multiplier) };
}

export function sendWhenOpen(socket, openState, message) {
  if (socket?.readyState !== openState) return false;
  socket.send(JSON.stringify(message));
  return true;
}

export function clearWorldSnapshot(resources, fires) {
  resources.clear();
  fires.clear();
}

export function applyCollectionSnapshot(collection, items, key) {
  // Missing means unchanged; [] deliberately removes the old scene's contents.
  if (!Array.isArray(items)) return false;
  collection.clear();
  for (const item of items) collection.set(key(item), item);
  return true;
}

export function mergePlayerSnapshots(previousPlayers, incomingPlayers) {
  if (!Array.isArray(incomingPlayers)) return [];
  return incomingPlayers.map(player => {
    const previous = previousPlayers?.get?.(player.id);
    return previous ? { ...previous, ...player } : player;
  });
}
