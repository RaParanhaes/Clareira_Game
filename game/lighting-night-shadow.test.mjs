import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowDirectionResolver } from './lighting.mjs';

const point = (x, y) => ({ x, y });
const surfaceHeight = () => 0;
const getCamera = () => ({ x: 0, y: 0 });
const buildingWindow = { kind: 'window', id: 'house:window', x: 5, y: 5, height: 2, reach: 6,
  strength: .8, owner: 'house', color: '#efbc79', falloffExponent: 1.4 };
const campfire = { kind: 'fire', id: 'fire:1', x: 5, y: 5, height: 1.2, reach: 6,
  strength: .8, falloffExponent: 1.35 };

test('a building window does not become a sky light on a moonless night', () => {
  const resolve = createShadowDirectionResolver({ globalLight: null, localLights: [buildingWindow],
    obstacles: [], point, surfaceHeight, getCamera });
  const direction = resolve(7, 7);
  assert.equal(direction.strength, 0, 'no shadow without sun or moon');
  assert.equal(direction.source.kind, 'ambient');
});

test('a porch lantern owned by a building does not steer the shadow either', () => {
  const porch = { ...buildingWindow, kind: 'lantern', id: 'house:porch' };
  const resolve = createShadowDirectionResolver({ globalLight: null, localLights: [porch],
    obstacles: [], point, surfaceHeight, getCamera });
  assert.equal(resolve(7, 7).strength, 0);
});

test('a campfire still casts its own shadow without celestial light', () => {
  const resolve = createShadowDirectionResolver({ globalLight: null, localLights: [campfire],
    obstacles: [], point, surfaceHeight, getCamera });
  assert.ok(resolve(7, 7).strength > 0, 'fires keep their intended local shadows');
});

test('a building window never overrides the sun or moon direction', () => {
  const globalLight = { kind: 'moon', directionX: 1, directionY: 0, strength: .3, lengthScale: 1, lightStrength: .3 };
  const resolve = createShadowDirectionResolver({ globalLight, localLights: [buildingWindow],
    obstacles: [], point, surfaceHeight, getCamera });
  const direction = resolve(7, 7);
  assert.equal(direction.x, 1);
  assert.equal(direction.y, 0);
  assert.equal(direction.source.kind, 'moon');
});
