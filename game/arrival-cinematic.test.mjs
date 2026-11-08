import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ARRIVAL_CAMERA_HOLD_MS,
  ARRIVAL_CAMERA_PAN_MS,
  ARRIVAL_IMPACT_SHAKE_MS,
  ARRIVAL_LIGHTNING_IMPACT_MS,
  arrivalImpactShake,
  arrivalFlameIgnition,
  arrivalAvatarVisible,
  arrivalCameraTarget,
} from './arrival-cinematic.mjs';

const fire = { x: 100, y: 200 };
const avatar = { x: 109, y: 202 };

test('arrival camera holds on the fire before revealing the avatar', () => {
  assert.deepEqual(arrivalCameraTarget(fire, avatar, 0), fire);
  assert.deepEqual(arrivalCameraTarget(fire, avatar, ARRIVAL_CAMERA_HOLD_MS - 1), fire);
  assert.equal(arrivalAvatarVisible(ARRIVAL_CAMERA_HOLD_MS - 1), false);
  assert.equal(arrivalAvatarVisible(ARRIVAL_CAMERA_HOLD_MS), true);
});

test('arrival camera eases from fire to avatar and settles on the avatar', () => {
  const midpoint = arrivalCameraTarget(fire, avatar, ARRIVAL_CAMERA_HOLD_MS + ARRIVAL_CAMERA_PAN_MS / 2);
  assert.deepEqual(midpoint, { x: 104.5, y: 201 });
  const samples = Array.from({ length: 11 }, (_, index) =>
    arrivalCameraTarget(fire, avatar, ARRIVAL_CAMERA_HOLD_MS + ARRIVAL_CAMERA_PAN_MS * index / 10));
  assert.ok(samples.every((point, index) => index === 0 || point.x >= samples[index - 1].x));
  assert.deepEqual(samples.at(-1), avatar);
});

test('reduced motion skips the camera pan after the fire focus', () => {
  assert.deepEqual(arrivalCameraTarget(fire, avatar, ARRIVAL_CAMERA_HOLD_MS - 1, true), fire);
  assert.deepEqual(arrivalCameraTarget(fire, avatar, ARRIVAL_CAMERA_HOLD_MS, true), avatar);
});

test('lightning impact produces a short, damped camera tremor', () => {
  const peak = arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS + 80);
  const late = arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS + ARRIVAL_IMPACT_SHAKE_MS - 80);
  assert.ok(Math.hypot(peak.x, peak.y) > Math.hypot(late.x, late.y));
  assert.equal(arrivalImpactShake(ARRIVAL_LIGHTNING_IMPACT_MS + ARRIVAL_IMPACT_SHAKE_MS), null);
});

test('game camera and avatar rendering use the arrival cinematic phases', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  assert.match(main, /arrivalCameraTarget\(arrivalFire,localRenderPosition,arrivalCinematicAge\(\),reducedMotion\)/);
  assert.match(main, /&&arrivalAvatarVisible\(arrivalCinematicAge\(\)\)/);
});

test('logs precede impact, flames grow after contact, and avatar follows the established fire', () => {
  for (const age of [0, 450, 900, ARRIVAL_LIGHTNING_IMPACT_MS]) {
    assert.equal(arrivalFlameIgnition(age), 0);
    assert.equal(arrivalAvatarVisible(age), false);
  }
  assert.ok(arrivalFlameIgnition(ARRIVAL_LIGHTNING_IMPACT_MS + 150) > 0);
  assert.ok(arrivalFlameIgnition(ARRIVAL_LIGHTNING_IMPACT_MS + 150) < 1);
  assert.equal(arrivalFlameIgnition(ARRIVAL_LIGHTNING_IMPACT_MS + 300), 1);
  assert.equal(arrivalAvatarVisible(ARRIVAL_LIGHTNING_IMPACT_MS + 300), false);
  assert.equal(arrivalFlameIgnition(ARRIVAL_CAMERA_HOLD_MS), 1);
  assert.equal(arrivalAvatarVisible(ARRIVAL_CAMERA_HOLD_MS), true);
});
