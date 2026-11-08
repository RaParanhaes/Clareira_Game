import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CAMPFIRE_AURA_DISPLAY_SIZE, CAMPFIRE_AURA_FRAME_COUNT, CAMPFIRE_AURA_FRAME_DURATION_MS,
  CAMPFIRE_AURA_FRAME_HEIGHT, CAMPFIRE_AURA_FRAME_WIDTH, CAMPFIRE_AURA_LIGHT_SCALE,
  campfireAuraFrameIndex,
} from './campfire-aura.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

test('aura atlas keeps eight timed frames with a restrained light radius', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'art/fire/campfire-aura-frames.json'), 'utf8'));
  const png = await readFile(path.join(root, 'art/fire/campfire-aura-frames.png'));
  assert.equal(manifest.frameCount, CAMPFIRE_AURA_FRAME_COUNT);
  assert.equal(manifest.frameWidth, CAMPFIRE_AURA_FRAME_WIDTH);
  assert.equal(manifest.frameHeight, CAMPFIRE_AURA_FRAME_HEIGHT);
  assert.equal(manifest.frameDurationMs, CAMPFIRE_AURA_FRAME_DURATION_MS);
  assert.equal(manifest.displaySize.width, CAMPFIRE_AURA_DISPLAY_SIZE);
  assert.equal(manifest.displaySize.height, CAMPFIRE_AURA_DISPLAY_SIZE);
  assert.equal(png.readUInt32BE(16), CAMPFIRE_AURA_FRAME_WIDTH * CAMPFIRE_AURA_FRAME_COUNT);
  assert.equal(png.readUInt32BE(20), CAMPFIRE_AURA_FRAME_HEIGHT);
  assert.equal(CAMPFIRE_AURA_LIGHT_SCALE, 0.9, 'glow radius stays smaller than the original');
});

test('aura loops over every frame and holds still when reduced motion is enabled', () => {
  const frames = Array.from({ length: CAMPFIRE_AURA_FRAME_COUNT * 4 }, (_, index) =>
    campfireAuraFrameIndex(index * CAMPFIRE_AURA_FRAME_DURATION_MS / 1000, 1));
  assert.deepEqual(new Set(frames.slice(0, CAMPFIRE_AURA_FRAME_COUNT)),
    new Set(Array.from({ length: CAMPFIRE_AURA_FRAME_COUNT }, (_, index) => index)));
  assert.equal(campfireAuraFrameIndex(1, 3, true), 0);
  assert.equal(campfireAuraFrameIndex(80, 3, true), 0);
  assert.equal(campfireAuraFrameIndex(Number.NaN, 3), 0);
});
