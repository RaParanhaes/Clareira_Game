const LEASE_TTL_MS = 15_000;
const MAX_TRACKED_DOWNLOADS = 2_048;
const TOTAL_REQUEST_BUDGET = 32;

export function createDownloadCapacityManager({ now = Date.now } = {}) {
  const leases = new Map();

  function prune(currentTime) {
    for (const [id, touchedAt] of leases) {
      if (currentTime - touchedAt > LEASE_TTL_MS) leases.delete(id);
    }
  }

  function policy() {
    const activeDownloaders = leases.size;
    const perPlayerCeiling = activeDownloaders <= 2 ? 24
      : activeDownloaders <= 8 ? 12 : 6;
    const fairShare = Math.max(1, Math.floor(TOTAL_REQUEST_BUDGET / Math.max(1, activeDownloaders)));
    return { activeDownloaders, maxConcurrentRequests: Math.min(perPlayerCeiling, fairShare) };
  }

  return {
    update({ id, action }) {
      const currentTime = now();
      prune(currentTime);
      if (typeof id !== 'string' || !/^[a-f0-9]{32}$/u.test(id)) {
        return { ok: false, ...policy() };
      }
      if (action === 'release') leases.delete(id);
      else if (action === 'start' || action === 'heartbeat') {
        if (leases.has(id) || leases.size < MAX_TRACKED_DOWNLOADS) leases.set(id, currentTime);
      }
      return { ok: true, ...policy() };
    },
    snapshot() {
      prune(now());
      return policy();
    },
  };
}
