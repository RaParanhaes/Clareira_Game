import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CAMPFIRE_SKY_RAYS_FRAME_COUNT, CAMPFIRE_SKY_RAYS_FRAME_DURATION_MS,
  CAMPFIRE_SKY_RAYS_FRAME_HEIGHT, CAMPFIRE_SKY_RAYS_FRAME_WIDTH,
  campfireSkyRaysFrameIndex,
} from './campfire-sky-rays.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

test('sky-ray PNG atlas has 16 interpolated frames converging at the campfire anchor', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'art/fire/campfire-sky-rays-frames.json'), 'utf8'));
  const png = await readFile(path.join(root, 'art/fire/campfire-sky-rays-frames.png'));
  assert.equal(manifest.frameCount, CAMPFIRE_SKY_RAYS_FRAME_COUNT);
  assert.equal(manifest.frameWidth, CAMPFIRE_SKY_RAYS_FRAME_WIDTH);
  assert.equal(manifest.frameHeight, CAMPFIRE_SKY_RAYS_FRAME_HEIGHT);
  assert.equal(manifest.frameDurationMs, CAMPFIRE_SKY_RAYS_FRAME_DURATION_MS);
  assert.deepEqual(manifest.anchor, { x: CAMPFIRE_SKY_RAYS_FRAME_WIDTH / 2, y: CAMPFIRE_SKY_RAYS_FRAME_HEIGHT });
  assert.equal(manifest.emission?.bakedIntoFrames, true, 'each bolt frame contains its own warm emissive glow');
  assert.ok(manifest.emission.outerGlowBlurPx > manifest.emission.innerGlowBlurPx);
  assert.equal(png.readUInt32BE(16), CAMPFIRE_SKY_RAYS_FRAME_WIDTH * CAMPFIRE_SKY_RAYS_FRAME_COUNT);
  assert.equal(png.readUInt32BE(20), CAMPFIRE_SKY_RAYS_FRAME_HEIGHT);
  assert.ok(png.byteLength < 1_200_000);
});

test('celestial rays loop through all frames and respect reduced motion', () => {
  const frames = Array.from({ length: CAMPFIRE_SKY_RAYS_FRAME_COUNT }, (_, index) =>
    campfireSkyRaysFrameIndex(index * CAMPFIRE_SKY_RAYS_FRAME_DURATION_MS / 1000));
  assert.deepEqual(frames, Array.from({ length: CAMPFIRE_SKY_RAYS_FRAME_COUNT }, (_, index) => index));
  assert.equal(campfireSkyRaysFrameIndex(CAMPFIRE_SKY_RAYS_FRAME_COUNT * CAMPFIRE_SKY_RAYS_FRAME_DURATION_MS / 1000), 0);
  assert.equal(campfireSkyRaysFrameIndex(-1), 0);
  assert.equal(campfireSkyRaysFrameIndex(1, true), 0);
  assert.equal(campfireSkyRaysFrameIndex(Number.NaN), 0);
});
