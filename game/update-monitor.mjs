export function createGameUpdateMonitor({
  initialVersion = null,
  fetchVersion,
  canReload = () => false,
  reload = () => {},
  notifyWaiting = () => {},
  now = () => performance.now(),
  stableForMs = 5_000,
  notificationIntervalMs = 30_000,
} = {}) {
  if (typeof fetchVersion !== 'function') throw new TypeError('Fetcher de versão ausente');

  let baseline = typeof initialVersion === 'string' ? initialVersion : null;
  let candidate = null;
  let candidateSince = 0;
  let lastNotificationAt = -Infinity;
  let checking = false;
  let reloading = false;

  async function check() {
    if (checking || reloading) return;
    checking = true;
    try {
      const observed = await fetchVersion();
      if (typeof observed !== 'string' || observed.length === 0) return;
      if (baseline === null) {
        baseline = observed;
        return;
      }
      if (observed === baseline) {
        candidate = null;
        candidateSince = 0;
        return;
      }
      if (candidate !== observed) {
        candidate = observed;
        candidateSince = now();
        return;
      }
      if (now() - candidateSince < stableForMs) return;
      if (!canReload()) {
        const time = now();
        if (time - lastNotificationAt >= notificationIntervalMs) {
          lastNotificationAt = time;
          notifyWaiting();
        }
        return;
      }
      reloading = true;
      reload();
    } catch {
      // A temporary version-endpoint failure must not interrupt the running game.
    } finally {
      checking = false;
    }
  }

  function start({ pollIntervalMs = 5_000, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
    const timer = setInterval(() => { void check(); }, pollIntervalMs);
    const refreshWhenVisible = () => {
      if (!documentRef || documentRef.visibilityState === 'visible') void check();
    };
    documentRef?.addEventListener('visibilitychange', refreshWhenVisible);
    windowRef?.addEventListener('focus', refreshWhenVisible);
    void check();
    return () => {
      clearInterval(timer);
      documentRef?.removeEventListener('visibilitychange', refreshWhenVisible);
      windowRef?.removeEventListener('focus', refreshWhenVisible);
    };
  }

  return { check, start };
}
