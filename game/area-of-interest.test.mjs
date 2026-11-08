import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AOI_CELL_SIZE,
  SPATIAL_CELL_SIZE,
  aoiWindow,
  normalizeViewport,
  spatialCell,
  viewportAoiRadius,
} from './area-of-interest.mjs';

test('viewport interest covers the canvas culling margin on desktop and mobile', () => {
  for (const [width, height, centerRatio] of [[1440, 900, 0.52], [390, 844, 0.4], [600, 400, 0.52]]) {
    const radius = viewportAoiRadius(width, height);
    const tileX = width < 600 ? 26 : 32;
    const tileY = tileX * 18 / 32;
    const centerX = width / 2;
    const centerY = height * centerRatio;
    for (const x of [-250, width + 250]) {
      for (const y of [-250, height + 250]) {
        const projectedX = (x - centerX) / tileX;
        const projectedY = (y - centerY) / tileY;
        const worldDistance = Math.hypot(projectedX, projectedY) / Math.SQRT2;
        assert.ok(worldDistance <= radius, `${width}x${height} corner was outside the AOI`);
      }
    }
  }
});

test('viewport bounds, negative cells and cell padding keep the prefetch region stable', () => {
  assert.deepEqual(normalizeViewport(Number.POSITIVE_INFINITY, -10), { width: 480, height: 150 });
  assert.deepEqual(spatialCell({ x: -0.01, y: -SPATIAL_CELL_SIZE }), { x: -1, y: -1 });
  const area = aoiWindow({ x: 15.9, y: 15.9 }, 20);
  assert.deepEqual({ x: area.x, y: area.y, center: area.center }, {
    x: 0, y: 0, center: { x: AOI_CELL_SIZE / 2, y: AOI_CELL_SIZE / 2 },
  });
  assert.ok(area.radius > 20);
});
