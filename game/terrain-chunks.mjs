export const TERRAIN_CHUNK_SIZE = 16;
export const TERRAIN_CELL_COUNT = TERRAIN_CHUNK_SIZE * TERRAIN_CHUNK_SIZE;
export const TERRAIN_HEIGHT_STEP = .25;
export const TERRAIN_MATERIAL_IDS = Object.freeze(['grass', 'grass_dirt', 'dirt', 'stone']);
const materialIds = new Set(TERRAIN_MATERIAL_IDS);
const seasons = new Set(['spring', 'summer', 'autumn', 'winter']);
const weatherKinds = new Set(['clear', 'rain', 'snowing', 'storm']);

export function normalizeTerrainChunk(value, { worldSize = 10_000 } = {}) {
  const chunkX = Number(value?.chunkX), chunkY = Number(value?.chunkY);
  if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY) || chunkX < 0 || chunkY < 0) {
    throw new TypeError('Coordenadas do chunk de terreno inválidas.');
  }
  const x = chunkX * TERRAIN_CHUNK_SIZE, y = chunkY * TERRAIN_CHUNK_SIZE;
  if (x + TERRAIN_CHUNK_SIZE > worldSize || y + TERRAIN_CHUNK_SIZE > worldSize) {
    throw new RangeError('O chunk de terreno está fora do mundo.');
  }
  if (!Array.isArray(value.cells) || value.cells.length !== TERRAIN_CELL_COUNT) {
    throw new TypeError('O chunk de terreno precisa conter 256 células.');
  }
  const season = value.season === undefined ? 'spring' : value.season;
  const weather = value.weather === undefined ? 'clear' : value.weather;
  if (!seasons.has(season) || !weatherKinds.has(weather)) throw new TypeError('Clima do chunk de terreno inválido.');
  const cells = value.cells.map((cell, index) => {
    if (!cell || typeof cell !== 'object' || Array.isArray(cell) || !materialIds.has(cell.materialId)) {
      throw new TypeError(`Material inválido na célula ${index}.`);
    }
    const height = Number(cell.height), damage = Number(cell.damage ?? 0), snow = Number(cell.snow ?? 0);
    const variantSeed = Number(cell.variantSeed);
    const wallMaterialId = cell.wallMaterialId === undefined ? 'dirt' : cell.wallMaterialId;
    if (!materialIds.has(wallMaterialId)) throw new TypeError(`Material de face inválido na célula ${index}.`);
    if (!Number.isFinite(height) || height < 0 || height > 3.5
        || Math.abs(height / TERRAIN_HEIGHT_STEP - Math.round(height / TERRAIN_HEIGHT_STEP)) > 1e-7) {
      throw new RangeError(`Altura inválida na célula ${index}.`);
    }
    if (!Number.isFinite(damage) || damage < 0 || damage > 1 || !Number.isFinite(snow) || snow < 0 || snow > 1) {
      throw new RangeError(`Estado persistente inválido na célula ${index}.`);
    }
    if (!Number.isSafeInteger(variantSeed) || variantSeed < 0 || variantSeed > 0xffff_ffff) {
      throw new RangeError(`Semente visual inválida na célula ${index}.`);
    }
    return { materialId: cell.materialId, wallMaterialId, height, variantSeed, damage, snow };
  });
  return {
    chunkX, chunkY,
    x: x + TERRAIN_CHUNK_SIZE / 2,
    y: y + TERRAIN_CHUNK_SIZE / 2,
    radius: TERRAIN_CHUNK_SIZE * .75,
    season, weather, cells,
  };
}

export function terrainChunkCellAt(chunk, x, y) {
  if (chunk?.type !== 'terrain-chunk') return null;
  const col = Math.floor(x) - chunk.chunkX * TERRAIN_CHUNK_SIZE;
  const row = Math.floor(y) - chunk.chunkY * TERRAIN_CHUNK_SIZE;
  if (col < 0 || row < 0 || col >= TERRAIN_CHUNK_SIZE || row >= TERRAIN_CHUNK_SIZE) return null;
  return chunk.cells[row * TERRAIN_CHUNK_SIZE + col] || null;
}

function terrainHash(seed, x, y) {
  let value = (seed ^ Math.imul(Math.floor(x * 4) + 0x9e3779b9, 0x85ebca6b)
    ^ Math.imul(Math.floor(y * 4) + 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function mountainHeight(center, radius, x, y) {
  const radial = Math.hypot((x - center.x) / radius, (y - center.y) / radius);
  if (radial >= 1) return 0;
  return Math.max(0, Math.min(3.5, Math.floor(((1 - radial) * 3.5 + 1e-7) / TERRAIN_HEIGHT_STEP) * TERRAIN_HEIGHT_STEP));
}

export function createSkyTerrainDemoEdits(spawn, seed = 32_452_843) {
  const center = { x: spawn.x + 23, y: spawn.y - 13 }, radius = 20;
  const chunkX = Math.floor(center.x / TERRAIN_CHUNK_SIZE), chunkY = Math.floor(center.y / TERRAIN_CHUNK_SIZE);
  const originX = chunkX * TERRAIN_CHUNK_SIZE, originY = chunkY * TERRAIN_CHUNK_SIZE;
  const stoneCenter = { x: center.x + 1.5, y: center.y - 1.25 };
  const trailStart = { x: originX + 1, y: originY + 14 };
  const trailEnd = { x: center.x - 1.5, y: center.y + .5 };
  const crackStart = { x: stoneCenter.x - 1.5, y: stoneCenter.y + 1.5 };
  const crackEnd = { x: stoneCenter.x + 1.5, y: stoneCenter.y - 1.5 };
  const cells = [];
  for (let row = 0; row < TERRAIN_CHUNK_SIZE; row += 1) for (let col = 0; col < TERRAIN_CHUNK_SIZE; col += 1) {
    const x = originX + col, y = originY + row, point = { x: x + .5, y: y + .5 };
    const radial = Math.hypot((point.x - center.x) / radius, (point.y - center.y) / radius);
    const height = mountainHeight(center, radius, point.x, point.y);
    const trail = distanceToSegment(point, trailStart, trailEnd);
    const materialId = Math.hypot(point.x - stoneCenter.x, point.y - stoneCenter.y) < 2.6 ? 'stone'
      : trail < .75 ? 'dirt' : trail < 1.7 || radial > .57 ? 'grass_dirt' : 'grass';
    const variantSeed = terrainHash(seed, x, y);
    const crackDistance = distanceToSegment(point, crackStart, crackEnd);
    const damage = materialId === 'stone' ? crackDistance < .8 ? .75 : variantSeed % 4 === 0 ? .25 : 0 : 0;
    const snowRoll = variantSeed % 10;
    const snow = height < .75 ? 0 : materialId === 'stone' && snowRoll < 5 ? .9
      : snowRoll === 0 ? .9 : radial > .55 && snowRoll < 7 ? .45 : 0;
    cells.push({
      materialId,
      wallMaterialId: materialId === 'stone' || height >= 2.75 ? 'stone' : 'dirt',
      height, variantSeed, damage, snow,
    });
  }
  return [
    { id: 'seed-ceu-terrain-demo', type: 'terrain-chunk', chunkX, chunkY, season: 'winter', weather: 'snowing', cells },
    { id: 'seed-ceu-terrain-demo-tree', type: 'tree', x: originX + 4.5, y: originY + 11.5 },
  ];
}
