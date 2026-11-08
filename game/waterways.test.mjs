import assert from 'node:assert/strict';
import test from 'node:test';
import { getResourcesInBounds, getSolidTreesInBounds, stepPlayer } from './world.mjs';
import { emptyWorldDefinition, getWorldDefinition, normalizeWorldDefinition, setWorldDefinition, worldWaterAt } from './world-edits.mjs';
import { seedDimensionLayout } from './dimension-layout.mjs';
import { lakeSignedDepthAt } from './water-geometry.mjs';
import { WATER_WADING_DEPTH, WATER_SHORE_BANDS, waterBankDepthAt, waterCurrentScale, waterDepthAt, waterStateAt, waterSurfaceDepthAt, waterwayRoutesForDimension, waterShoreBandAt, waterShoreProfileAt, waterShoreTileAt, waterPlantExcludedAt, waterTreeExcludedAt } from './waterways.mjs';

test('waterfall drop controls the local current and wading depth limits drift', () => {
  const previous = getWorldDefinition();
  try {
    setWorldDefinition(emptyWorldDefinition('surface'));
    const routes = waterwayRoutesForDimension('surface');
    for (const route of routes) for (const fall of route.waterfalls) {
      const current = waterStateAt(fall.x, fall.y, { dimensionId: 'surface' });
      const speedRatio = Math.hypot(current.currentX, current.currentY) / route.speed;
      assert.ok(Math.abs(speedRatio - (1 + Math.min(fall.drop, 1.2) * .75)) < 1e-6,
        `${route.id} drop ${fall.drop} scales current`);
    }
    assert.equal(waterCurrentScale(0), 0);
    assert.ok(waterCurrentScale(.78) < .58, 'shallow water attenuates its current');
    assert.equal(waterCurrentScale(WATER_WADING_DEPTH), .58);

    for (const route of routes.filter(item => item.id.startsWith('surface-brook-'))) {
      const fall = route.waterfalls[0], position = { x: fall.x, y: fall.y };
      const depth = waterStateAt(position.x, position.y, { dimensionId: 'surface' }).depth;
      assert.ok(depth < WATER_WADING_DEPTH, `${route.id} remains wadeable`);
      let moved = { ...position };
      for (let step = 0; step < 60; step++) {
        moved = stepPlayer(moved, { x: 0, y: 0, motion: false }, 1 / 60);
      }
      const drift = Math.hypot(moved.x - position.x, moved.y - position.y);
      assert.ok(drift > 0.05 && drift < .25, `${route.id} wading current should carry the player gently, got ${drift}`);
    }
  } finally {
    setWorldDefinition(previous);
  }
});


test('visual channel width expands while river depth and collision width stay unchanged', () => {
  const previous = getWorldDefinition();
  try {
    setWorldDefinition(emptyWorldDefinition('surface'));
    const route = waterwayRoutesForDimension('surface').find(item => item.id === 'surface-river-north');
    const a = route.points[4], b = route.points[5], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const x = (a.x + b.x) / 2 - dy / length * 1.3;
    const y = (a.y + b.y) / 2 + dx / length * 1.3;
    assert.equal(route.width, 1.05, 'movement keeps the existing physical width');
    assert.ok(route.renderWidths.every(width => width > route.width), 'the authored surface profile is wider');
    assert.equal(waterDepthAt(x, y, { dimensionId: 'surface' }), 0, 'the new visual fringe stays outside gameplay water');
    assert.ok(waterSurfaceDepthAt(x, y, { dimensionId: 'surface' }) > 0, 'the renderer includes the widened fringe');
  } finally {
    setWorldDefinition(previous);
  }
});

test('shore sand width scales with water size and four bands progressively transition to grass', () => {
  const previous = getWorldDefinition();
  try {
    const definition = seedDimensionLayout(emptyWorldDefinition('surface'));
    setWorldDefinition(definition);
    const route = waterwayRoutesForDimension('surface').find(item => item.id === 'surface-river-north');
    const a = route.points[2], b = route.points[3], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const midpointX = (a.x + b.x) / 2, midpointY = (a.y + b.y) / 2;
    const width = (route.renderWidths[2] + route.renderWidths[3]) / 2;
    const sample = distance => ({ x: midpointX - dy / length * distance, y: midpointY + dx / length * distance });
    const edge = sample(width + .2), riverProfile = waterShoreProfileAt(edge.x, edge.y, { dimensionId: 'surface' });
    const band1 = sample(width + Math.max(.25, riverProfile.sandWidth - .1));
    const band2 = sample(width + riverProfile.sandWidth + .4);
    const band3 = sample(width + riverProfile.sandWidth + WATER_SHORE_BANDS.mixed + .4);
    const band4 = sample(width + riverProfile.sandWidth + WATER_SHORE_BANDS.mixed + WATER_SHORE_BANDS.earth + .4);
    const gradientEnd = riverProfile.sandWidth + WATER_SHORE_BANDS.mixed
      + WATER_SHORE_BANDS.earth + WATER_SHORE_BANDS.grass;
    const treeBuffer = sample(width + gradientEnd + .5), outside = sample(width + gradientEnd + WATER_SHORE_BANDS.treeBuffer + .2);
    assert.ok(waterSurfaceDepthAt(band1.x, band1.y, { dimensionId: 'surface' }) <= .08);
    assert.equal(waterShoreBandAt(band1.x, band1.y, { dimensionId: 'surface' }), 1);
    assert.equal(waterShoreTileAt(band1.x, band1.y, { dimensionId: 'surface' }), 'sand');
    assert.equal(waterShoreBandAt(band2.x, band2.y, { dimensionId: 'surface' }), 2);
    assert.equal(waterShoreBandAt(band3.x, band3.y, { dimensionId: 'surface' }), 3);
    assert.equal(waterShoreBandAt(band4.x, band4.y, { dimensionId: 'surface' }), 4);
    assert.equal(waterShoreBandAt(outside.x, outside.y, { dimensionId: 'surface' }), 0);
    assert.ok(waterShoreProfileAt(637, 425, { dimensionId: 'surface' }).sandWidth > riverProfile.sandWidth,
      'the wider lake receives a broader sand band');
    assert.equal(waterTreeExcludedAt(treeBuffer.x, treeBuffer.y, { dimensionId: 'surface' }), true);
    assert.equal(waterTreeExcludedAt(outside.x, outside.y, { dimensionId: 'surface' }), false);
    assert.equal(waterShoreBandAt(band1.x, band1.y, { dimensionId: 'cave' }), 0);
    assert.equal(waterTreeExcludedAt(band1.x, band1.y, { dimensionId: 'cave' }), false);

    const placedTree = { id: 'shore-tree-rule-test', type: 'tree', x: treeBuffer.x, y: treeBuffer.y };
    setWorldDefinition(normalizeWorldDefinition({ ...definition, edits: [...definition.edits, placedTree] }));
    const nearbyTrees = getSolidTreesInBounds({ left: treeBuffer.x - .5, right: treeBuffer.x + .5,
      top: treeBuffer.y - .5, bottom: treeBuffer.y + .5 });
    assert.ok(!nearbyTrees.some(tree => tree.id === 'maptree:shore-tree-rule-test'),
      'placed trees are excluded from rendering inside the shoreline clearance zone');
    const sandPoint = { x: Math.floor(band1.x) + .5, y: Math.floor(band1.y) + .5 };
    assert.equal(waterPlantExcludedAt(sandPoint.x, sandPoint.y, { dimensionId: 'surface' }), true,
      'plants are excluded from sand tiles');
    const adjacentLand = [];
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const point = { x: sandPoint.x + dx, y: sandPoint.y + dy };
      if (waterSurfaceDepthAt(point.x, point.y, { dimensionId: 'surface' }) <= .08
        && waterShoreTileAt(point.x, point.y, { dimensionId: 'surface' }) !== 'sand') adjacentLand.push(point);
    }
    assert.ok(adjacentLand.some(point => waterPlantExcludedAt(point.x, point.y, { dimensionId: 'surface' })),
      'plants keep a one-tile visual clearance from sand so sprites cannot overhang it');
    const plantResource = { id: 'shore-plant-resource-test', type: 'resource', resourceKind: 'berries', ...sandPoint };
    setWorldDefinition(normalizeWorldDefinition({ ...definition, edits: [...definition.edits, placedTree, plantResource] }));
    assert.ok(!getResourcesInBounds({ left: sandPoint.x - .25, right: sandPoint.x + .25,
      top: sandPoint.y - .25, bottom: sandPoint.y + .25 }).some(item => item.id === 'map-shore-plant-resource-test'),
      'botanical resources do not appear on sand tiles');
  } finally {
    setWorldDefinition(previous);
  }
});


test('shore bands cover every map river, lake, and generated theme stream', () => {
  const previous = getWorldDefinition();
  try {
    const definition = seedDimensionLayout(emptyWorldDefinition('surface'));
    setWorldDefinition(definition);
    const findRouteSand = (route, options) => {
      for (let index = 0; index < route.segments.length; index += 1) {
        const segment = route.segments[index], dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
        const length = Math.hypot(dx, dy) || 1;
        const width = ((route.renderWidths[index] ?? route.width) + (route.renderWidths[index + 1] ?? route.width)) / 2;
        for (const side of [-1, 1]) for (const along of [.25, .5, .75]) {
          const x = segment.a.x + dx * along - dy / length * (width + .55) * side;
          const y = segment.a.y + dy * along + dx / length * (width + .55) * side;
          if (waterShoreBandAt(x, y, options) === 1 && waterShoreTileAt(x, y, options) === 'sand') return { x, y };
        }
      }
      return null;
    };

    const surfaceRoutes = waterwayRoutesForDimension('surface');
    assert.equal(surfaceRoutes.length, 4, 'the map has four watercourses to line');
    for (const route of surfaceRoutes) assert.ok(findRouteSand(route, { dimensionId: 'surface' }),
      `${route.id} has a sand shoreline`);

    const lakes = definition.edits.filter(edit => edit.type === 'lake');
    assert.equal(lakes.length, 5, 'the map has five lakes or ponds to line');
    for (const lake of lakes) {
      const edgeOffsets = Array.isArray(lake.outline) && lake.outline.length >= 3
        ? lake.outline
        : Array.from({ length: 16 }, (_, index) => [Math.cos(index * Math.PI / 8) * lake.radius,
          Math.sin(index * Math.PI / 8) * lake.radius]);
      let foundSand = false;
      for (const [offsetX, offsetY] of edgeOffsets) {
        const length = Math.hypot(offsetX, offsetY) || 1;
        for (const step of [.25, .55, 1]) {
          const x = lake.x + offsetX + offsetX / length * step;
          const y = lake.y + offsetY + offsetY / length * step;
          if (waterShoreBandAt(x, y, { dimensionId: 'surface' }) === 1) { foundSand = true; break; }
        }
        if (foundSand) break;
      }
      assert.ok(foundSand, `${lake.id} has a sand shoreline`);
    }

    for (const theme of ['forest', 'dark', 'sky', 'magic', 'inferno', 'giants', 'energy']) {
      const dimensionId = `shore-theme-${theme}`;
      setWorldDefinition(normalizeWorldDefinition({ ...emptyWorldDefinition(dimensionId), theme }));
      const origin = { x: 419.5, y: 419.5 };
      const route = waterwayRoutesForDimension(dimensionId, theme, origin)[0];
      const sandPoint = findRouteSand(route, { dimensionId, theme, origin });
      assert.ok(sandPoint, `${theme} stream has a sand shoreline`);
      assert.equal(waterPlantExcludedAt(sandPoint.x, sandPoint.y, { dimensionId, theme, origin }), true,
        `${theme} stream keeps plants off its sand`);
    }
  } finally {
    setWorldDefinition(previous);
  }
});

test('authored lake outline drives water depth, bank clearance, and world-water checks', () => {
  const previous = getWorldDefinition();
  try {
    const outline = [[-8,-6],[-4,-8],[4,-8],[8,-4],[8,4],[4,8],[-4,8],[-8,6]];
    const definition = normalizeWorldDefinition({
      ...emptyWorldDefinition('water-outline-test'),
      edits: [{ id: 'outline-lake', type: 'lake', waterKind: 'lake', x: 100, y: 100, radius: 12, outline }],
    });
    setWorldDefinition(definition);
    assert.ok(waterDepthAt(100, 100, { dimensionId: 'water-outline-test' }) > 0);
    assert.equal(waterDepthAt(109, 100, { dimensionId: 'water-outline-test' }), 0,
      'a point inside the legacy radius but outside the outline is land');
    assert.equal(worldWaterAt(109, 100), false);
    assert.ok(waterBankDepthAt(108.5, 100, { dimensionId: 'water-outline-test' }) > 0,
      'the bank clearance follows the authored shore');
    assert.equal(waterBankDepthAt(109.5, 100, { dimensionId: 'water-outline-test' }), 0);
    assert.throws(() => normalizeWorldDefinition({
      ...emptyWorldDefinition('invalid-water-outline'),
      edits: [{ id: 'self-crossing-lake', type: 'lake', waterKind: 'lake', x: 100, y: 100, radius: 12,
        outline: [[-8,-8],[8,8],[-8,8],[8,-8],[-6,0],[0,6],[6,0],[0,-6]] }],
    }), /cruzar a si mesmo/);
  } finally {
    setWorldDefinition(previous);
  }
});

test('surface lake seed migrates its legacy circle to one persistent outline', () => {
  const seeded = seedDimensionLayout(emptyWorldDefinition('surface'));
  const legacy = normalizeWorldDefinition({
    ...seeded,
    revision: seeded.revision + 1,
    edits: seeded.edits.map(edit => edit.id === 'dimension-lake-mirror'
      ? { ...edit, radius: 15, outline: undefined } : edit),
  });
  const migrated = seedDimensionLayout(legacy);
  const mirror = migrated.edits.find(edit => edit.id === 'dimension-lake-mirror');
  assert.equal(migrated.revision, legacy.revision + 1);
  assert.equal(mirror.radius, 26);
  assert.equal(mirror.outline.length, 20);
  assert.equal(mirror.x, 637, 'the persisted lake position is preserved');
  assert.equal(mirror.y, 425, 'the persisted lake position is preserved');
  assert.equal(seedDimensionLayout(migrated), migrated, 'subsequent startup does not rewrite the edit');
  assert.ok(!migrated.edits.find(edit => edit.id === 'dimension-lake-reeds').outline,
    'other lakes keep their existing circular representation');
});

test('the surface river mouth continues into the authored lake cove', () => {
  const previous = getWorldDefinition();
  try {
    const definition = seedDimensionLayout(emptyWorldDefinition('surface'));
    setWorldDefinition(definition);
    const lake = definition.edits.find(edit => edit.id === 'dimension-lake-mirror');
    const route = waterwayRoutesForDimension('surface').find(item => item.id === 'surface-river-east');
    const mouth = route.points.at(-1);
    assert.ok(lakeSignedDepthAt(lake, mouth.x, mouth.y) > 8,
      'the open river surface reaches broad, deeper water inside the lake');
    assert.ok(route.renderWidths.at(-1) >= 2.0,
      'the visual channel opens wider at the lake mouth');
    assert.ok(waterDepthAt(mouth.x, mouth.y, { dimensionId: 'surface' }) > 0,
      'the route and lake remain one continuous water area');
  } finally {
    setWorldDefinition(previous);
  }
});

test('the main river current fades out at the lake mouth', () => {
  const previous = getWorldDefinition();
  try {
    setWorldDefinition(emptyWorldDefinition('surface'));
    const route = waterwayRoutesForDimension('surface').find(item => item.id === 'surface-river-east');
    const mouth = route.points.at(-1), upstream = route.points.at(-2);
    const atMouth = waterStateAt(mouth.x, mouth.y, { dimensionId: 'surface' });
    const upstreamState = waterStateAt(upstream.x, upstream.y, { dimensionId: 'surface' });
    assert.equal(Math.hypot(atMouth.currentX, atMouth.currentY), 0);
    assert.ok(Math.hypot(upstreamState.currentX, upstreamState.currentY) > 0);
    assert.equal(route.width, 1.15, 'the existing gameplay width remains unchanged');
  } finally {
    setWorldDefinition(previous);
  }
});
