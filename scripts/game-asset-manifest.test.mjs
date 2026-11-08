import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createGameAssetManifest, isRuntimeGameAsset, isServableGameAsset } from './game-asset-manifest.mjs';

test('asset manifest hashes public runtime files and excludes source, private and test files', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clareira-assets-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'art/avatar-frames/character-layers-v1/source'), { recursive: true });
  await mkdir(path.join(root, 'art/fire'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<main>Clareira</main>');
  await writeFile(path.join(root, 'main.mjs'), 'export const ready = true;');
  await writeFile(path.join(root, 'main.test.mjs'), 'private test fixture');
  await writeFile(path.join(root, 'art/avatar-frames/character-layers-v1/source/original.png'), 'source');
  await writeFile(path.join(root, 'art/fire/campfire-aura-source.png'), 'authoring sheet');
  await writeFile(path.join(root, 'art/fire/campfire-sky-rays-source.png'), 'authoring sheet');
  await writeFile(path.join(root, 'art/clareira-login-vila-v1.png'), 'private original');
  await writeFile(path.join(root, 'art/clareira-login-vila-v1.webp'), 'unused login art');

  await writeFile(path.join(root, 'art/clareira-login-loop-v5.mp4'), 'decorative video');
  assert.equal(isServableGameAsset('art/clareira-login-loop-v5.mp4'), true);
  assert.equal(isRuntimeGameAsset('art/clareira-login-loop-v5.mp4'), false);
  const manifest = await createGameAssetManifest(root, 'a'.repeat(64));
  assert.equal(manifest.version, 'a'.repeat(64));
  assert.deepEqual(manifest.files.map(file => file.path), ['index.html', 'main.mjs']);
  assert.equal(isServableGameAsset('art/clareira-login-vila-v1.webp'), true, 'the login image remains directly available while excluded from bulk startup caching');
  assert.equal(manifest.files[0].sha256, createHash('sha256').update('<main>Clareira</main>').digest('hex'));
  assert.equal(manifest.files[1].size, Buffer.byteLength('export const ready = true;'));
});

test('source furniture renders and review boards stay outside the game download; runtime atlas/layers stay included', () => {
  for (const file of [
    'art/room-furniture/medieval-3d-v1/frames/chair-rot0.png',
    'art/room-furniture/medieval-3d-v1/direction-sheets/chairs.png',
    'art/room-furniture/bed-3d-prototype/frames/bed.png',
    'art/concepts/mountains.png',
    'art/tree-sprites/uv-tree-contact-sheet.png',
    'art/buildings/medieval-cottage-3d/manifest.json',
  ]) assert.equal(isRuntimeGameAsset(file), false, file);
  for (const file of [
    'art/room-furniture/room-furniture-v3.png',
    'art/room-furniture/medieval-furniture-v1.png',
    'art/room-furniture/medieval-3d-v1/manifest.json',
    'art/buildings/medieval-cottage-3d/frames/iso-rot0-shell.png',
    'art/buildings/medieval-cottage-3d/frames/iso-rot0-shell-night.png',
    'art/buildings/medieval-cottage-3d/frames/iso-rot0-canopy.png',
    'art/buildings/medieval-cottage-3d/frames/iso-rot0-post-left.png',
    'art/buildings/medieval-cottage-3d/frames/iso-rot0-post-right.png',
  ]) assert.equal(isRuntimeGameAsset(file), true, file);
});
