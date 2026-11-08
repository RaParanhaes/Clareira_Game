// A manifest and its responses must describe the same bytes even while the
// preview working tree is being edited. Shared hashes keep old versions cheap.
export function createGameAssetSnapshotStore({
  maxBytes = 64 * 1024 * 1024, maxVersions = 16,
  maxAgeMs = 15 * 60_000, now = Date.now,
} = {}) {
  const versions = new Map(), blobs = new Map();
  let totalBytes = 0, currentVersion = null;
  function remove(version) {
    const snapshot = versions.get(version);
    if (!snapshot) return;
    versions.delete(version);
    for (const file of snapshot.files.values()) {
      const blob = blobs.get(file.sha256);
      if (--blob.references === 0) { totalBytes -= blob.bytes.length; blobs.delete(file.sha256); }
    }
  }
  function prune(protectedVersion) {
    const ordered = [...versions].sort((a,b) => a[1].touched - b[1].touched);
    for (const [version, snapshot] of ordered) {
      if (version === protectedVersion) continue;
      if (now() - snapshot.touched > maxAgeMs || versions.size > maxVersions || totalBytes > maxBytes) remove(version);
    }
  }
  return {
    add({ manifest, bodies }) {
      const incomingHashes = new Set();
      let incomingBytes = 0;
      for (const file of manifest.files) {
        if (incomingHashes.has(file.sha256)) continue;
        incomingHashes.add(file.sha256);
        incomingBytes += bodies.get(file.path).length;
      }
      if (incomingBytes > maxBytes) throw new Error('O pacote excede o orçamento de memória para downloads por versão.');
      currentVersion = manifest.version;
      if (!versions.has(manifest.version)) {
        const files = new Map(manifest.files.map(file => [file.path, file]));
        for (const file of files.values()) {
          let blob = blobs.get(file.sha256);
          if (!blob) {
            blob = { bytes: bodies.get(file.path), references: 0 };
            blobs.set(file.sha256, blob); totalBytes += blob.bytes.length;
          }
          blob.references++;
        }
        versions.set(manifest.version, { files, touched: now() });
      }
      versions.get(manifest.version).touched = now();
      prune(manifest.version);
    },
    get(version, filePath) {
      const snapshot = versions.get(version);
      if (!snapshot || (version !== currentVersion && now() - snapshot.touched > maxAgeMs)) return null;
      const file = snapshot.files.get(filePath);
      if (!file) return null;
      snapshot.touched = now();
      return { ...file, bytes: blobs.get(file.sha256).bytes };
    },
    stats: () => ({ versions: versions.size, blobs: blobs.size, bytes: totalBytes }),
  };
}
