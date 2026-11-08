import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkyTerrainDemoEdits, TERRAIN_CHUNK_SIZE, TERRAIN_MATERIAL_IDS, terrainChunkCellAt } from './terrain-chunks.mjs';
import { DEFAULT_DIMENSIONS, initialWorldForDimension, seedDimensionTerrain } from './dimensions.mjs';
import { canTraverseSurface, surfaceHeight } from './elevation.mjs';
import { emptyWorldDefinition, normalizeWorldDefinition, setWorldDefinition } from './world-edits.mjs';
import { getNaturalPatches, naturalHeight } from './natural-terrain.mjs';

const sky = DEFAULT_DIMENSIONS.find(dimension => dimension.id === 'ceu');

test('the sky terrain demo is one persistent 16 by 16 chunk with four materials and separate tree data', () => {
  const [rawChunk, tree] = createSkyTerrainDemoEdits(sky.spawn, 42);
  const definition = normalizeWorldDefinition({
    ...emptyWorldDefinition('ceu'), theme: 'sky', edits: [rawChunk, tree],
  });
  const [chunk, storedTree] = definition.edits;
  assert.equal(chunk.type, 'terrain-chunk');
  assert.equal(chunk.cells.length, TERRAIN_CHUNK_SIZE ** 2);
  assert.deepEqual(new Set(chunk.cells.map(cell => cell.materialId)), new Set(TERRAIN_MATERIAL_IDS));
  assert.equal(chunk.season, 'winter');
  assert.equal(chunk.weather, 'snowing');
  assert.ok(chunk.cells.some(cell => cell.snow === 0));
  assert.ok(chunk.cells.some(cell => cell.snow >= .35 && cell.snow < .85));
  assert.ok(chunk.cells.some(cell => cell.snow >= .85));
  assert.ok(chunk.cells.some(cell => cell.damage >= .55));
  assert.equal(storedTree.type, 'tree');
  assert.equal(terrainChunkCellAt(chunk, chunk.chunkX * 16 + .5, chunk.chunkY * 16 + .5), chunk.cells[0]);
  assert.equal(terrainChunkCellAt(chunk, chunk.chunkX * 16 + 16.5, chunk.chunkY * 16 + .5), null);
});

test('terrain chunks reject incomplete cells, unknown materials, invalid steps, and out-of-world coordinates', () => {
  const [chunk] = createSkyTerrainDemoEdits(sky.spawn);
  assert.throws(() => normalizeWorldDefinition({ ...emptyWorldDefinition('ceu'), theme: 'sky', edits: [{ ...chunk, cells: chunk.cells.slice(1) }] }), /256 células/);
  const wrongMaterial = chunk.cells.map((cell, index) => index ? cell : { ...cell, materialId: 'lava' });
  assert.throws(() => normalizeWorldDefinition({ ...emptyWorldDefinition('ceu'), theme: 'sky', edits: [{ ...chunk, cells: wrongMaterial }] }), /Material inválido/);
  const wrongHeight = chunk.cells.map((cell, index) => index ? cell : { ...cell, height: .3 });
  assert.throws(() => normalizeWorldDefinition({ ...emptyWorldDefinition('ceu'), theme: 'sky', edits: [{ ...chunk, cells: wrongHeight }] }), /Altura inválida/);
  assert.throws(() => normalizeWorldDefinition({ ...emptyWorldDefinition('ceu'), theme: 'sky', edits: [{ ...chunk, chunkX: 625 }] }), /fora do mundo/);
});

test('the seeded terrain chunk adds once and keeps movement on the same stepped surface', () => {
  const initial = initialWorldForDimension(sky, 77);
  const seeded = seedDimensionTerrain(initial, sky);
  const seededAgain = seedDimensionTerrain(seeded, sky);
  assert.equal(seeded.revision, initial.revision + 1);
  assert.equal(seededAgain, seeded);
  const chunk = seeded.edits.find(edit => edit.type === 'terrain-chunk');
  assert.ok(chunk);
  assert.ok(seeded.edits.some(edit => edit.id === 'seed-ceu-terrain-demo-tree' && edit.type === 'tree'));
  setWorldDefinition(seeded);
  try {
    const origin = { x: chunk.chunkX * 16, y: chunk.chunkY * 16 };
    for (let index = 0; index < chunk.cells.length; index += 1) {
      const col = index % 16, row = Math.floor(index / 16);
      assert.equal(chunk.cells[index].height, surfaceHeight(origin.x + col + .5, origin.y + row + .5));
    }
    const route = [];
    for (let t = 0; t <= 1; t += .01) route.push({ x: origin.x + .5 + t * 15, y: origin.y + .5 + t * 15 });
    for (let index = 1; index < route.length; index += 1) assert.ok(canTraverseSurface(route[index - 1], route[index]), `walkable step ${index}`);
    const patches = getNaturalPatches({ left: origin.x, top: origin.y, right: origin.x + 16, bottom: origin.y + 16 });
    assert.equal(patches.length, 256);
    assert.ok(patches.some(patch => patch.faces.length > 0));
    assert.ok(patches.every(patch => patch.corners.every(height => height === patch.height)));
    assert.ok(patches.every(patch => naturalHeight(patch.x + .5, patch.y + .5) === patch.height));
  } finally {
    setWorldDefinition(emptyWorldDefinition());
  }
});
