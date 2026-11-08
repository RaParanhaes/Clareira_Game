import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const publicExtensions = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.webp', '.jpg', '.jpeg',
  '.gif', '.ico', '.mp3', '.ogg', '.wav', '.woff', '.woff2', '.mp4',
]);
const privateRoots = [
  // Individual animation frames are authoring inputs; the client loads the
  // reviewed atlases from `atlases/` instead. Some frame folders are private
  // to the asset author, so skip the whole tree before attempting to read it.
  'art/avatar-frames/character-layers-v1/frames',
  'art/avatar-frames/character-layers-v1/source',
  'art/avatar-frames/character-layers-v1/review-gifs',
  'art/avatar-frames/character-layers-v1/sheets',
  'art/avatar-frames/neutral-body-v2/source',
  'art/audio/source',
];
const nonRuntimeFiles = new Set([
  // The page loads login art as a decorative image so it can arrive alongside
  // bootstrap without holding the verified runtime cache or login form.
  'art/clareira-login-vila-v1.webp',
  'art/clareira-login-vila-v2.webp',
  'art/clareira-login-loop-v3.mp4',
  'art/clareira-login-loop-v4.mp4',
  'art/clareira-login-loop-v5.mp4',
  'art/clareira-login-poster-v5.webp',
  // Design reference only; it is not loaded by the game client.
  'art/dimension-transit/concept-storyboard.png',
  // The runtime uses the interpolated 60-frame sheets, not these 30-frame
  // intermediate exports. Keep them in the repository without downloading them.
  'art/dimension-transit/official/beam-final.webp',
  'art/dimension-transit/official/lower-final.webp',
  'art/dimension-transit/official/upper-final.webp',
  // The renderer and content manifest use room-furniture-v3 only.
  'art/room-furniture/room-furniture-v1.png',
  'art/room-furniture/room-furniture-v2.png',
  // Authoring sheet for the reviewed atlas; the client loads only the compact frame PNG.
  'art/fire/campfire-aura-source.png',
  'art/fire/campfire-sky-rays-source.png',
  'art/tree-sprites/uv-tree-contact-sheet.png',
]);

// These are source renders and review boards. The game consumes the packed
// furniture atlases and the five cottage layers declared in content-assets.mjs.
const nonRuntimeRoots = [
  'art/concepts/',
  'art/room-furniture/medieval-3d-v1/frames/',
  'art/room-furniture/medieval-3d-v1/direction-sheets/',
  'art/room-furniture/medieval-3d-v1/materials/',
  'art/room-furniture/bed-3d-prototype/',
  'art/buildings/medieval-cottage-3d/',
];
const runtimeSourceExceptions = new Set([
  ...['iso-rot0-shell.png', 'iso-rot0-shell-night.png', 'iso-rot0-canopy.png',
    'iso-rot0-post-left.png', 'iso-rot0-post-right.png']
    .map(name => `art/buildings/medieval-cottage-3d/frames/${name}`),
]);

export function isPrivateGameDirectory(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return privateRoots.some(directory => normalized === directory || normalized.startsWith(`${directory}/`));
}

export function isRuntimeGameAsset(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return isServableGameAsset(relativePath) && !nonRuntimeFiles.has(normalized)
    && (runtimeSourceExceptions.has(normalized) || !nonRuntimeRoots.some(root => normalized.startsWith(root)))
    && normalized !== 'art/room-furniture/medieval-3d-v1/catalog-front-view.png';
}

export function isServableGameAsset(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return publicExtensions.has(path.extname(relativePath).toLowerCase())
    && normalized !== 'art/clareira-login-vila-v1.png'
    && !/(?:^|\/)[^/]*\.test\.[^.]+$/u.test(normalized)
    && !privateRoots.some(directory => normalized === directory || normalized.startsWith(`${directory}/`));
}

export function gameAssetManifestVersion(files) {
  const canonicalFiles = files
    .map(file => [file.path, file.size, file.sha256])
    .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
  return createHash('sha256').update(JSON.stringify(canonicalFiles)).digest('hex');
}

export async function createGameAssetManifest(root, version, { onFile } = {}) {
  const gameRoot = path.resolve(root);
  const files = [];

  async function visit(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (isPrivateGameDirectory(relativePath)) continue;
        await visit(path.join(directory, entry.name), relativePath);
        continue;
      }
      if (!entry.isFile() || !isRuntimeGameAsset(relativePath)) continue;
      const bytes = await readFile(path.join(directory, entry.name));
      files.push({
        path: relativePath,
        size: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      onFile?.(relativePath, bytes);
    }
  }

  await visit(gameRoot);
  return { version: typeof version === 'string' ? version : gameAssetManifestVersion(files), files };
}

export async function createGameAssetSnapshot(root) {
  const bodies = new Map();
  const manifest = await createGameAssetManifest(root, undefined, {
    onFile: (filePath, bytes) => bodies.set(filePath, bytes),
  });
  return { manifest, bodies };
}
