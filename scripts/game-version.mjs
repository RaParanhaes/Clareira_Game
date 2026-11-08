import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isPrivateGameDirectory, isRuntimeGameAsset } from './game-asset-manifest.mjs';

export function createGameVersionReader(root, { cacheMs = 1_000, now = Date.now } = {}) {
  const gameRoot = path.resolve(root);
  let cachedVersion = null;
  let cachedAt = -Infinity;
  let pendingRead = null;
  let pendingFreshRead = null;
  let generation = 0;

  async function computeVersion() {
    const hash = createHash('sha256');
    const hashMetadata = (relativePath, metadata) => {
      hash.update('file').update('\0').update(relativePath).update('\0')
        .update(metadata.size.toString()).update('\0')
        .update(metadata.mtimeNs.toString()).update('\0')
        .update(metadata.ctimeNs.toString()).update('\0')
        .update(metadata.ino.toString()).update('\0')
        .update(metadata.mode.toString()).update('\n');
    };
    async function visit(directory, prefix = '', rootDirectory = false) {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (!rootDirectory && (error.code === 'EACCES' || error.code === 'EPERM')) return;
        throw error;
      }
      entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!isPrivateGameDirectory(relativePath)) await visit(filePath, relativePath);
        } else if (entry.isFile() && isRuntimeGameAsset(relativePath)) {
          try {
            hashMetadata(relativePath, await stat(filePath, { bigint: true }));
          } catch (error) {
            if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
            hash.update('unreadable-file\0').update(relativePath).update('\n');
          }
        }
      }
    }
    await visit(gameRoot, '', true);
    return hash.digest('hex');
  }

  async function readVersion() {
    if (pendingFreshRead) return pendingFreshRead;
    const time = now();
    if (cachedVersion !== null && time - cachedAt < cacheMs) return cachedVersion;
    if (pendingRead) return pendingRead;
    const readGeneration = generation;
    pendingRead = computeVersion().then(version => {
      if (readGeneration === generation) {
        cachedVersion = version;
        cachedAt = now();
      }
      return version;
    }).finally(() => { pendingRead = null; });
    return pendingRead;
  }

  async function readVersionFresh() {
    if (pendingFreshRead) return pendingFreshRead;
    generation += 1;
    pendingFreshRead = computeVersion().then(version => {
      cachedVersion = version;
      cachedAt = now();
      return version;
    }).finally(() => { pendingFreshRead = null; });
    return pendingFreshRead;
  }

  return { readVersion, readVersionFresh };
}
