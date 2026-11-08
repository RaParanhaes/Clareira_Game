// A compact snapshot may omit unchanged collections, but a new connection needs all of them.
export function createSceneReadiness() {
  let collections = new Set();
  let playerReady = false;
  let knownSelf = null;
  return {
    reset() { collections = new Set(); playerReady = false; knownSelf = null; },
    accept(message, selfId) {
      if (message?.type !== 'state') return false;
      for (const name of ['resources', 'fires', 'roomFurniture']) {
        if (Array.isArray(message[name])) collections.add(name);
      }
      const self = message.players?.find(player => player.id === selfId);
      // Compact motion intentionally omits unchanged appearance/location.
      // Keep only metadata already received for this actor/connection.
      knownSelf = self ? { ...(knownSelf?.id === selfId ? knownSelf : {}), ...self } : null;
      playerReady = !!knownSelf && Number.isFinite(knownSelf.x) && Number.isFinite(knownSelf.y)
        && ['clearing', 'room'].includes(knownSelf.location) && !!knownSelf.appearance;
      return playerReady && collections.size === 3;
    },
  };
}
