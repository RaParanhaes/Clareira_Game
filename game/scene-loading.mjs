// Controls are released only when the loading overlay is gone; sceneReady alone is not enough.
export function sceneInputReady({ sceneReady, overlayHidden }) {
  return sceneReady === true && overlayHidden === true;
}

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

// Releases a loading overlay that outlives a ready scene (a reveal step that never settles).
export function createOverlayReleaseGuard({ limitMs, onRelease, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  return {
    arm() {
      clear();
      timer = schedule(() => { timer = null; onRelease({ limitMs }); }, limitMs);
    },
    cancel: clear,
    get armed() { return timer !== null; },
  };
}

// Runs the reveal finalization exactly once. A late reveal that arrives after a
// forced release only sees that it already ran and returns without repeating it.
export function createRevealOnce(run) {
  let finished = false;
  return {
    get finished() { return finished; },
    run(...args) {
      if (finished) return false;
      finished = true;
      run(...args);
      return true;
    },
  };
}
