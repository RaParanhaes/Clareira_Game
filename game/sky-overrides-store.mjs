// Shared file store for the owner's sky overrides. The game server and the staff panel
// run as separate processes, so both read and write the same JSON file. Readers reload
// the file when its modification time changes.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { overrideEndsAt } from './world-overrides.mjs';

export function skyOverridesFileIn(stateDirectory, path) {
  return path.join(stateDirectory, 'sky-overrides.json');
}

// Reads the overrides; a missing or broken file means "no overrides".
export function loadSkyOverrides(file) {
  if (!existsSync(file)) return [];
  try {
    // endsAt is recomputed: JSON cannot store Infinity, so permanent overrides lose it on disk.
    return JSON.parse(readFileSync(file, 'utf8'))
      .filter(item => item && item.key && item.scope && Number.isFinite(Number(item.startedAt)))
      .map(item => ({ ...item, endsAt: overrideEndsAt(item.scope, item.startedAt) }));
  } catch {
    return [];
  }
}

export function saveSkyOverrides(file, overrides) {
  writeFileSync(file, JSON.stringify(overrides, null, 2));
}

// Keeps a cache of the file, reloading it only when the file changed on disk.
export function createSkyOverrideCache(file) {
  let mtime = null, list = [];
  return {
    current() {
      try {
        const stamp = existsSync(file) ? statSync(file).mtimeMs : null;
        if (stamp !== mtime) { mtime = stamp; list = loadSkyOverrides(file); }
      } catch { list = []; }
      return list;
    },
    write(next) {
      saveSkyOverrides(file, next);
      mtime = existsSync(file) ? statSync(file).mtimeMs : null;
      list = next;
    },
  };
}
