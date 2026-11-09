import {HOTEL_RECEPTION_FIXTURES,HOTEL_RECEPTION_COUNTER} from './hotel-reception.mjs';
import { interiorPartitions, interiorFloorShape } from './interior-architecture.mjs';
import { WORLD_NATURE_ORIGIN, WORLD_CENTER } from './world-scale.mjs';
import {furnitureVisual,roomFurnitureDistance,roomFurnitureFootprintsOverlap,roomFurnitureOverlapsPlayer,roomFurnitureFootprintOverlapsRect,roomFurnitureFootprintBounds,roomFurnitureRadius} from './furniture.mjs';
import {objectRoomLayout,subscribeObjectCatalog} from './object-state.mjs';
import { BUILDING_STANDARD, FIXTURE_HEIGHTS, fixtureBounds } from './building-standard.mjs';
import { FIRE_RADIUS, FIRE_JUMP_CLEARANCE_HEIGHT, canMovePastFires } from './obstacle-collision.mjs';
import { contentById } from './content-catalog.mjs';
import {isNaturalAccess, TERRAIN_BOUNDS} from './natural-terrain.mjs';
import {locomotion} from './locomotion.mjs';
import {flightStep} from './flight-prototype.mjs';
import { movementSpeedMultiplier } from './progression.mjs';
import { canTraverseSurface,surfaceHeight } from './elevation.mjs';
import { chunkRandom, createChunkCache, indexWorldChunks, queryWorldChunks, WORLD_CHUNK_SIZE, WORLD_CHUNK_CACHE_LIMIT } from './world-chunks.mjs';
import { DIMENSION_COORDINATE_OFFSET, WORLD_COORDINATE_VERSION, isDimensionPathTile, isVillagePlazaTile } from './dimension-layout.mjs';
import { buildingArchitecture } from './architectural-elements.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING } from './village-buildings.mjs';
import { SOLID_WATER, WATER_WADING_DEPTH, waterBankDepthAt, waterCurrentScale, waterStateAt, waterTreeExcludedAt, waterPlantExcludedAt } from './waterways.mjs';
import {
  CAMPFIRE_DECAY_REBUILD_COST, CAMPFIRE_FEED_COST, CAMPFIRE_FEED_WINDOW_MS, CAMPFIRE_PLAYER_BURN_DURATION_MS,
  CAMPFIRE_NEW_COST, CAMPFIRE_REKINDLE_COST, campfireDecayProgress,
  campfireRemainingMs,
} from './campfire-life.mjs';
import {
  getWorldDefinition, setWorldDefinition, worldEditsIntersecting, worldResourcesInBounds, worldTreeDensityAt, worldGeometryCacheKey, worldTileSurfaceAt,
  worldTreesInBounds, worldTreeGrowthInBounds, worldRocksInBounds, worldLakesIntersecting, worldWaterAt, isWorldTreeRemoved, isWorldRockRemoved, isWorldResourceRemoved,
} from './world-edits.mjs';
export { WORLD_CHUNK_SIZE };
export { SOLID_WATER };
import { WORLD_SIZE } from './world-scale.mjs';
import { insideBoundaryWall, clampInsideBoundaryWall } from './world-boundary.mjs';
export { WORLD_SIZE };
export const WORLD_RESOURCE_GENERATION_VERSION = 4;
export { DIMENSION_COORDINATE_OFFSET, WORLD_COORDINATE_VERSION };
export const PLAYER_SPEED = 3.2;
export const PLAYER_RADIUS = 0.25;
export const WORLD_TILE_X = contentById('style.clareira').projection.tileX;
export const WORLD_TILE_Y = contentById('style.clareira').projection.tileY;
const TILE_X = WORLD_TILE_X;
const TILE_Y = WORLD_TILE_Y;
const AVATAR_CLEAR_WIDTH = 18;
const AVATAR_CLEAR_HEIGHT = 32;
const ROOM_ENTRANCE_LANE_HALF_WIDTH = .92;
const PLAYER_SEPARATION = PLAYER_RADIUS * 2;
const PATH_GRID_STEP = 0.5;
const PATH_GRID_SIZE = WORLD_SIZE / PATH_GRID_STEP;
const WORLD_CHUNK_COUNT = Math.ceil(WORLD_SIZE / WORLD_CHUNK_SIZE);
const WORLD_ORIGIN = WORLD_NATURE_ORIGIN;
const WORLD_WATER_OPTIONS = Object.freeze({ origin: WORLD_ORIGIN });
const TREE_BANK_CLEARANCE = .9;
// All water shorelines keep the complete sand/earth/grass transition free of trees.
const treeNearWaterShore = (x,y) => waterTreeExcludedAt(x,y,WORLD_WATER_OPTIONS);
const ROCK_BANK_CLEARANCE = .28;
const RESOURCE_BANK_CLEARANCE = .12;
const BOTANICAL_RESOURCE_KINDS = new Set(['berries','apples','leaves','vines']);
const TREE_GRID_STEP = 4;
const TREE_MIN_SPACING = 2;
const BUILDING_TREE_CANOPY_CLEARANCE = 3;
const TREE_SAMPLERS = [{ step: TREE_GRID_STEP, salt: 0 }, { step: 2.8, salt: 1 }];
const isSurfaceDimension = () => getWorldDefinition().dimensionId === 'surface';
const isBareDarkDimension = () => getWorldDefinition().dimensionId === 'breu' || getWorldDefinition().dimensionId?.startsWith('arrival-');
let activeWorldSeed = getWorldDefinition().seed;

const atDimensionOrigin = value => value + DIMENSION_COORDINATE_OFFSET;
export const CLEARING_DOOR = RECEPTION_BUILDING.door;
// The 7×7 interior now has an exterior footprint that can plausibly contain it.
export const SHELTER_BOUNDS = RECEPTION_BUILDING.bounds;
// The avatar sprite extends beyond its foot point. Keep its visible body clear
// of the shelter's zero-thickness facade as well as its physical footprint.
export const SHELTER_WALL_CLEARANCE = 0.14;
// Keep the arrival hearth visible and nearby while leaving the spawn trail clear.
export const SPAWN_CAMPFIRE = { x: atDimensionOrigin(12), y: atDimensionOrigin(13) };
export const ROOM_DOOR = { x: 8, y: 10.8 };
export const ROOM_SPAWN = { x: 8, y: 9.8 };
export const ROOM_BOUNDS = { left: 4.5, right: 11.5, top: 4.5, bottom: 11.5 };
const ROOM_PALETTES = Object.freeze({
  cedar: Object.freeze({ floor: Object.freeze(['#846449', '#997451', '#795c43', '#8d6c4d']),
    wall: '#866f56', sideWall: '#6d5b4a', trim: '#c19968', rug: '#865348', rugEdge: '#d7b982' }),
  pine: Object.freeze({ floor: Object.freeze(['#776747', '#8c774e', '#6e6044', '#83724b']),
    wall: '#79694e', sideWall: '#5d5a45', trim: '#b49460', rug: '#486b5c', rugEdge: '#c7b27b' }),
  hotel: Object.freeze({ floor: Object.freeze(['#a57a52', '#b68a5f', '#96693f', '#ad8457']),
    wall: '#756d5e', sideWall: '#5f5b52', trim: '#d1b17d', rug: '#684f69', rugEdge: '#dfc38d' }),
  vista: Object.freeze({ floor: Object.freeze(['#77705d', '#8d8064', '#706752', '#83765f']),
    wall: '#6e6a70', sideWall: '#53515c', trim: '#b7a17f', rug: '#5b6078', rugEdge: '#d6c4a2' }),
});

function roomFixture(kind, x, y, width, depth, palette = 'cedar', height = 1.1) {
  return Object.freeze({ kind, x, y, width, depth, height: FIXTURE_HEIGHTS[kind] ?? height, palette });
}

function roomLayout({ id, left, right, top, bottom, doorY, spawnY, elevation = 'flat', counter = null,
  fixtures = [], rug = null, palette = 'cedar', paletteOverrides = {}, wallDecorObjects = null }) {
  const bounds = Object.freeze({ left, right, top, bottom });
  // Flat rooms open toward the viewer. Put the arrival tile just outside the
  // floor so walking inward crosses a real threshold instead of spawning in
  // the middle of the room. Raised legacy rooms keep their existing ramp.
  const door = Object.freeze({ x: (left + right) / 2,
    y: elevation === 'flat' ? bottom + 0.22 : doorY });
  const spawn = Object.freeze({ x: door.x,
    y: elevation === 'flat' ? bottom + 0.92 : spawnY });
  const obstacles = fixtures.map(item => Object.freeze({
    ...fixtureBounds(item),
  }));
  const partitions = interiorPartitions({id, bounds});
  obstacles.push(...partitions);
  return Object.freeze({ id, bounds, door, spawn, elevation, partitions: Object.freeze(partitions),
    wallHeight:BUILDING_STANDARD.interiorWallHeight, wallThickness:BUILDING_STANDARD.wallThickness,
    counter: counter ? Object.freeze({ ...counter }) : null,
    fixtures: Object.freeze(fixtures), obstacles: Object.freeze(obstacles), waitingSeats: Object.freeze([]),
    rug: rug ? Object.freeze({ ...rug }) : null,
    ...(wallDecorObjects ? { wallDecorObjects: Object.freeze({ ...wallDecorObjects,
      window: wallDecorObjects.window ? Object.freeze({ ...wallDecorObjects.window }) : null }) } : {}),
    palette: Object.freeze({ ...(ROOM_PALETTES[palette] || ROOM_PALETTES.cedar), interiorStyle: palette, ...paletteOverrides }),
  });
}

const STANDARD_ROOM_LAYOUT = roomLayout({ id: 'standard', left: 4.5, right: 11.5, top: 4.5, bottom: 11.5,
  doorY: 10.8, spawnY: 9.8, elevation: 'raised', palette: 'cedar',
  rug: { left: 5.0, right: 6.8, top: 8.7, bottom: 9.7 },
  fixtures: [
    roomFixture('bed', 5.8, 5.8, 1.9, 1.25, 'cedar', .55),
    roomFixture('nightstand', 7.25, 5.5, .7, .65, 'cedar', .6),
    roomFixture('bookshelf', 10.25, 5.7, 1.15, .65, 'cedar', 1.65),
    roomFixture('plant', 5.3, 8.3, .55, .55, 'pine', 1.15),
  ],
});

const ARRIVAL_LOBBY_LAYOUT = roomLayout({ id: 'arrival-lobby', left: 4.5, right: 11.5, top: 4.5, bottom: 11.5,
  doorY: 10.8, spawnY: 9.8, elevation: 'flat', palette: 'cedar',
  counter: { left: 6.1, right: 9.9, top: 6.0, bottom: 6.8 },
  rug: { left: 6.0, right: 10.0, top: 7.3, bottom: 8.7 },
  fixtures: [roomFixture('chair', 5.5, 7.4, .65, .6), roomFixture('chair', 10.5, 7.4, .65, .6),
    roomFixture('plant', 5.1, 5.4, .6, .6, 'pine', 1.4), roomFixture('plant', 10.9, 5.4, .6, .6, 'pine', 1.4)],
});

export const HOTEL_LOBBY_LAYOUT = roomLayout({ id: 'hotel-lobby', left: 1.5, right: 14.5, top: 2.5, bottom: 11.5,
  doorY: 10.8, spawnY: 9.8, elevation: 'flat', palette: 'hotel',
  paletteOverrides:{rug:'#405e51',rugEdge:'#c3ab7d'},
  counter: HOTEL_RECEPTION_COUNTER,
  rug: {left:2.2,right:6.9,top:5.95,bottom:9.8},
  fixtures: HOTEL_RECEPTION_FIXTURES,
});

const INN_LOBBY_LAYOUT = roomLayout({ id: 'pine-inn-lobby', left: 4, right: 12, top: 5, bottom: 11,
  doorY: 10.3, spawnY: 9.3, elevation: 'flat', palette: 'pine',
  counter: { left: 6.0, right: 10.0, top: 6.15, bottom: 7.0 },
  rug: { left: 5.2, right: 10.8, top: 7.3, bottom: 8.5 },
  fixtures: [roomFixture('chair', 5.0, 8.1, .7, .65, 'pine'), roomFixture('chair', 11.0, 8.1, .7, .65, 'pine'),
    roomFixture('fireplace', 5.0, 5.8, 1.0, .7, 'pine', 1.5), roomFixture('plant', 11.0, 5.7, .65, .65, 'pine', 1.3)],
});

const GUESTHOUSE_LOBBY_LAYOUT = roomLayout({ id: 'rill-guesthouse-lobby', left: 4.5, right: 10.5, top: 5.5, bottom: 10.5,
  doorY: 9.8, spawnY: 8.8, elevation: 'flat', palette: 'pine',
  counter: { left: 5.9, right: 9.1, top: 6.15, bottom: 6.9 },
  rug: { left: 5.5, right: 9.5, top: 7.2, bottom: 8.2 },
  fixtures: [roomFixture('chair', 5.2, 8.4, .65, .6, 'pine'), roomFixture('chair', 9.8, 8.4, .65, .6, 'pine'),
    roomFixture('plant', 5.0, 5.9, .55, .55, 'pine', 1.25)],
});

const GUESTHOUSE_ROOM_LAYOUT = roomLayout({ id: 'guesthouse-single', left: 5, right: 11, top: 5.5, bottom: 10.5,
  doorY: 9.8, spawnY: 8.8, palette: 'pine', rug: { left: 6.7, right: 9.3, top: 7.8, bottom: 8.8 },
  fixtures: [roomFixture('bed', 6.2, 6.4, 1.8, 1.2, 'pine', .55), roomFixture('nightstand', 7.6, 6.0, .65, .6, 'pine', .55),
    roomFixture('wardrobe', 9.8, 6.25, .95, .7, 'pine', 1.6), roomFixture('plant', 9.8, 8.4, .55, .55, 'pine', 1.15),
    roomFixture('chair', 6.0, 8.8, .65, .6, 'pine')],
});

const INN_ROOM_LAYOUT = roomLayout({ id: 'pine-inn-double', left: 4.5, right: 11.5, top: 5, bottom: 11,
  doorY: 10.3, spawnY: 9.3, palette: 'cedar', rug: { left: 7.0, right: 9.5, top: 7.8, bottom: 8.8 },
  fixtures: [roomFixture('bed', 6.0, 6.3, 2.0, 1.35, 'cedar', .6), roomFixture('nightstand', 7.7, 5.9, .7, .65, 'cedar', .62),
    roomFixture('bookshelf', 10.25, 6.0, 1.05, .65, 'cedar', 1.55), roomFixture('desk', 10.1, 8.3, 1.0, .65, 'cedar', .85),
    roomFixture('chair', 5.3, 8.4, .7, .65, 'pine')],
});

const HOTEL_ROOM_LAYOUT = roomLayout({ id: 'hotel-room', left: 4, right: 12, top: 4.5, bottom: 11.2,
  doorY: 10.5, spawnY: 9.5, palette: 'hotel', rug: { left: 6.9, right: 9.8, top: 7.8, bottom: 9.0 },
  fixtures: [roomFixture('bed', 5.7, 6.0, 2.15, 1.45, 'hotel', .62), roomFixture('nightstand', 7.55, 5.55, .72, .65, 'hotel', .62),
    roomFixture('wardrobe', 10.6, 5.9, 1.05, .75, 'hotel', 1.75), roomFixture('desk', 10.3, 8.25, 1.2, .75, 'hotel', .9),
    roomFixture('chair', 9.2, 8.35, .7, .65, 'hotel'), roomFixture('plant', 5.1, 8.8, .6, .6, 'pine', 1.4),
    roomFixture('bookshelf', 8.7, 5.5, .85, .6, 'hotel', 1.5)],
});

export const HOTEL_APARTMENT_LAYOUT = roomLayout({ id: 'hotel-apartment', left: 3, right: 13, top: 3.5, bottom: 11.5,
  doorY: 10.8, spawnY: 9.8, palette: 'hotel', rug: { left: 6.8, right: 10.2, top: 7.5, bottom: 8.9 },
  fixtures: [roomFixture('bed', 5.25, 5.3, 2.3, 1.55, 'hotel', .65), roomFixture('nightstand', 7.2, 4.9, .75, .7, 'hotel', .62),
    roomFixture('wardrobe', 11.25, 5.1, 1.15, .8, 'hotel', 1.8), roomFixture('sofa', 5.2, 8.0, 1.55, .8, 'hotel', .9),
    roomFixture('table', 7.2, 8.35, 1.0, .8, 'hotel', .65), roomFixture('desk', 10.5, 8.0, 1.15, .75, 'hotel', .9),
    roomFixture('chair', 11.55, 8.7, .7, .65, 'hotel'), roomFixture('plant', 3.8, 8.9, .6, .6, 'pine', 1.5)],
});

const CABIN_ROOMS = Object.freeze({
  'cabin-cedar-one': roomLayout({ id: 'cedar-cabin', left: 5, right: 11, top: 5.5, bottom: 10.5,
    doorY: 9.8, spawnY: 8.8, palette: 'cedar', rug: { left: 6.7, right: 9.3, top: 7.6, bottom: 8.6 },
    wallDecorObjects: { window: { id: 'cabin-cedar-one/window-bedroom', roomId: 'cedar-main',
      x: 7.45, width: 1.2, bottom: 1.05, top: 2.85 }, artX: 6.5, artWidth: 1.1 },
    fixtures: [roomFixture('bed', 6.1, 6.75, 1.8, 1.2, 'cedar', .55), roomFixture('fireplace', 9.9, 6.0, .9, .65, 'cedar', 1.4),
      roomFixture('chest', 9.9, 8.1, .8, .65, 'cedar', .55), roomFixture('plant', 5.4, 8.5, .55, .55, 'pine', 1.2),
      roomFixture('chair', 10.0, 9.2, .65, .6, 'cedar')],
  }),
  'cabin-cedar-two': roomLayout({ id: 'fern-cabin', left: 4.75, right: 11.25, top: 5, bottom: 11,
    doorY: 10.3, spawnY: 9.3, palette: 'pine', rug: { left: 6.8, right: 9.4, top: 7.5, bottom: 8.6 },
    fixtures: [roomFixture('bed', 5.8, 6.0, 1.9, 1.3, 'pine', .58), roomFixture('table', 9.3, 7.2, 1.0, .8, 'pine', .68),
      roomFixture('chair', 10.3, 8.0, .65, .6, 'pine'), roomFixture('bookshelf', 10.3, 5.75, 1.0, .65, 'cedar', 1.45),
      roomFixture('plant', 5.2, 8.6, .55, .55, 'pine', 1.25)],
  }),
  'cabin-cedar-three': roomLayout({ id: 'lookout-cabin', left: 4.5, right: 11.5, top: 4.75, bottom: 11.25,
    doorY: 10.55, spawnY: 9.55, palette: 'vista', rug: { left: 6.9, right: 9.7, top: 7.4, bottom: 8.6 },
    fixtures: [roomFixture('bed', 5.7, 5.8, 2.0, 1.35, 'vista', .62), roomFixture('desk', 9.9, 5.9, 1.1, .7, 'vista', .85),
      roomFixture('chair', 10.6, 6.9, .65, .6, 'vista'), roomFixture('wardrobe', 10.4, 9.0, 1.0, .7, 'vista', 1.6),
      roomFixture('plant', 5.1, 8.7, .55, .55, 'pine', 1.3),
      roomFixture('fireplace', 7.1, 7.5, .9, .65, 'vista', 1.35)],
  }),
});

const LOBBY_LAYOUTS = Object.freeze({
  'lodging-ember-hotel': HOTEL_LOBBY_LAYOUT,
  'lodging-pine-inn': INN_LOBBY_LAYOUT,
  'lodging-rill-guesthouse': GUESTHOUSE_LOBBY_LAYOUT,
});

export function getRoomLayout(roomKind = 'legacy', buildingId = null, lodgingMode = null) {
  const authored=objectRoomLayout(roomKind,buildingId,lodgingMode);if(authored)return authored;
  if (roomKind === 'lobby') return LOBBY_LAYOUTS[buildingId] || CABIN_ROOMS[buildingId] || ARRIVAL_LOBBY_LAYOUT;
  if (roomKind === 'lodging' && buildingId === 'lodging-ember-hotel')
    return lodgingMode === 'owned' ? HOTEL_APARTMENT_LAYOUT : HOTEL_ROOM_LAYOUT;
  if (roomKind === 'lodging' && buildingId === 'lodging-pine-inn') return INN_ROOM_LAYOUT;
  if (roomKind === 'lodging' && buildingId === 'lodging-rill-guesthouse') return GUESTHOUSE_ROOM_LAYOUT;
  if (roomKind === 'lodging' && lodgingMode === 'owned' && CABIN_ROOMS[buildingId]) return CABIN_ROOMS[buildingId];
  return STANDARD_ROOM_LAYOUT;
}
export function builtinRoomLayouts(){return {legacy:STANDARD_ROOM_LAYOUT,arrival:ARRIVAL_LOBBY_LAYOUT,lobbies:LOBBY_LAYOUTS,cabins:CABIN_ROOMS,rentals:{'lodging-ember-hotel':HOTEL_ROOM_LAYOUT,'lodging-pine-inn':INN_ROOM_LAYOUT,'lodging-rill-guesthouse':GUESTHOUSE_ROOM_LAYOUT},apartments:{'lodging-ember-hotel':HOTEL_APARTMENT_LAYOUT}};}
export function getRoomSpawnCandidates(layout = STANDARD_ROOM_LAYOUT) {
  if (layout.id === 'standard' || layout.id === 'standard-lobby') return [
    ROOM_SPAWN, { x: 7.2, y: 9.8 }, { x: 8.8, y: 9.8 }, { x: 7.2, y: 9 }, { x: 8.8, y: 9 },
    { x: 6.2, y: 9.2 }, { x: 9.8, y: 9.2 }, { x: 6.2, y: 8 }, { x: 9.8, y: 8 }, { x: 8, y: 6.2 },
  ];
  const centerX = (layout.bounds.left + layout.bounds.right) / 2;
  const offsets = [0, -.8, .8, -1.6, 1.6, -2.4, 2.4, 0, -1.2, 1.2, -2.4, 2.4];
  const rows = [0, 0, 0, 0, 0, 0, 0, -.8, -.8, -.8, -1.6, -1.6];
  return offsets.map((offset, index) => ({ x: centerX + offset, y: layout.spawn.y + rows[index] }));
}
export const ROOM_FURNITURE_RADIUS = contentById('furniture.stool').physics.radius;
export const ROOM_FURNITURE_LIMIT = 12;

export const SOLID_TREES = [
  { x: 3.3, y: 3.2, r: 0.64 }, { x: 5.2, y: 2.35, r: 0.68 },
  { x: 12.8, y: 3.1, r: 0.7 }, { x: 14.4, y: 5.5, r: 0.72 },
  // Keep this tree behind the cabin's rear roof line; placing it inside the
  // footprint lets its animated canopy appear to jump across the facade.
  { x: 3.0, y: 6.2, r: 0.68 }, { x: 13.8, y: 13.2, r: 0.7 },
  { x: 10.8, y: 10.2, r: 0.62 },
].map(tree => ({ ...tree, x: atDimensionOrigin(tree.x), y: atDimensionOrigin(tree.y) }));

for (const tree of SOLID_TREES) tree.r = .3;

// Sparse routes connect authored landmarks; dense woodland gives exploration a boundary.
export function isPathTile(x, y) {
  const edited = worldTileSurfaceAt(x, y);
  if (edited) return edited === 'path';
  if (!isSurfaceDimension()) return false;
  return Math.hypot(x - SPAWN_CAMPFIRE.x, y - SPAWN_CAMPFIRE.y) < 2.5
    || isVillagePlazaTile(x,y)
    || (Math.abs(y - (atDimensionOrigin(15.5) - (x - atDimensionOrigin(3.2)) * .7)) < .65
      && x > atDimensionOrigin(2) && x < atDimensionOrigin(9))
    || isDimensionPathTile(x, y);
}

export const RESOURCE_NODES = [];

export const SPAWN = { x: atDimensionOrigin(8.2), y: atDimensionOrigin(12.3) };

for (let index = 0; index < SOLID_TREES.length; index += 1) {
  SOLID_TREES[index].r = .3; SOLID_TREES[index].index = index; SOLID_TREES[index].id = `authored:${index}`;
}
const authoredTreesByChunk = indexWorldChunks(SOLID_TREES);
const authoredResourcesByChunk = indexWorldChunks(RESOURCE_NODES);

function treeCandidate(gx, gy, step = TREE_GRID_STEP, samplerSalt = 0) {
  const seed = Math.imul(gx + 0x1f123bb5 + samplerSalt * 0x1f123bb5, 73856093)
    ^ Math.imul(gy + 0x5f356495 + samplerSalt * 0x5f356495, 19349663) ^ activeWorldSeed;
  const priority = chunkRandom(seed ^ 0x6d2b79f5);
  // Retain saved IDs in the old grid; reserve a disjoint range for the expansion.
  const index = gx < 512 && gy < 512
    ? samplerSalt * 1_000_000_000 + gy * 512 + gx
    : 10_000_000_000 + samplerSalt * 100_000_000 + gy * 4096 + gx;
  return {
    priority,
    x:(gx + .5) * step + (chunkRandom(seed) - .5) * step * .72,
    y:(gy + .5) * step + (chunkRandom(seed ^ 0x5bd1e995) - .5) * step * .72,
    index,
    id:`seed:${index}`,
  };
}

function hasTreePriority(candidate, gx, gy, samplerSalt, candidateDensity) {
  for (const sampler of TREE_SAMPLERS) {
    if (sampler.salt === 1 && candidateDensity < 1.5) continue;
    const reach = Math.ceil(TREE_MIN_SPACING / sampler.step) + 1;
    const centreX = Math.floor(candidate.x / sampler.step), centreY = Math.floor(candidate.y / sampler.step);
    for (let ny = centreY - reach; ny <= centreY + reach; ny += 1) for (let nx = centreX - reach; nx <= centreX + reach; nx += 1) {
      const neighbor = treeCandidate(nx, ny, sampler.step, sampler.salt);
      if (neighbor.index === candidate.index || Math.hypot(candidate.x - neighbor.x, candidate.y - neighbor.y) >= TREE_MIN_SPACING) continue;
      const density = worldTreeDensityAt(neighbor.x, neighbor.y);
      if (density <= 0 || (sampler.salt === 1 && density < 1.5)) continue;
      if (neighbor.priority < candidate.priority
          || (neighbor.priority === candidate.priority && neighbor.index < candidate.index)) return false;
    }
  }
  return true;
}

function proceduralTreeAllowed(candidate,gx,gy,sampler,surfaceDimension){
  const {x,y}=candidate;
  if(x<0||y<0||x>=WORLD_SIZE-1||y>=WORLD_SIZE-1)return false;
  const density=worldTreeDensityAt(x,y);
  if(density<=0||(sampler.salt===1&&density<1.5)||!hasTreePriority(candidate,gx,gy,sampler.salt,density))return false;
  if((surfaceDimension&&isNaturalAccess(x,y))||isPathTile(x,y)||worldWaterAt(x,y)
      ||waterBankDepthAt(x,y,WORLD_WATER_OPTIONS,TREE_BANK_CLEARANCE)>0
      ||treeNearWaterShore(x,y)
      ||(surfaceDimension&&VILLAGE_BUILDINGS.some(building=>x>building.bounds.left-BUILDING_TREE_CANOPY_CLEARANCE
        &&x<building.bounds.right+BUILDING_TREE_CANOPY_CLEARANCE&&y>building.bounds.top-BUILDING_TREE_CANOPY_CLEARANCE
        &&y<building.bounds.bottom+BUILDING_TREE_CANOPY_CLEARANCE))
      ||(surfaceDimension&&Math.hypot(x-SPAWN_CAMPFIRE.x,y-SPAWN_CAMPFIRE.y)<5.6)
      ||(surfaceDimension&&x>SHELTER_BOUNDS.left-.8&&x<SHELTER_BOUNDS.right+.8&&y>SHELTER_BOUNDS.top-.8&&y<SHELTER_BOUNDS.bottom+.8)
      ||(surfaceDimension&&x>SOLID_WATER.left-.55&&x<SOLID_WATER.right+.55&&y>SOLID_WATER.top-.55&&y<SOLID_WATER.bottom+.55))return false;
  return !surfaceDimension||!SOLID_TREES.some(tree=>Math.hypot(tree.x-x,tree.y-y)<1.8);
}

// Cold collision checks and neighboring visual chunks revisit the same jittered
// tree candidates. Cache the pure generated-tree predicate by world geometry so
// wildlife movement does not repeat density, spacing, path, and water searches
// for those candidates on every simulation step.
let proceduralTreePredicateGeometry=null;
const proceduralTreePredicateCache=new Map();
const PROCEDURAL_TREE_PREDICATE_CACHE_LIMIT=60_000;
function cachedProceduralTreeAllowed(candidate,gx,gy,sampler,surfaceDimension){
  const geometry=worldGeometryCacheKey(getWorldDefinition());
  if(geometry!==proceduralTreePredicateGeometry){
    proceduralTreePredicateGeometry=geometry;
    proceduralTreePredicateCache.clear();
  }
  const key=`${sampler.salt}:${gx},${gy}`;
  if(proceduralTreePredicateCache.has(key))return proceduralTreePredicateCache.get(key);
  const allowed=proceduralTreeAllowed(candidate,gx,gy,sampler,surfaceDimension);
  if(proceduralTreePredicateCache.size>=PROCEDURAL_TREE_PREDICATE_CACHE_LIMIT)
    proceduralTreePredicateCache.delete(proceduralTreePredicateCache.keys().next().value);
  proceduralTreePredicateCache.set(key,allowed);
  return allowed;
}

function generateWorldChunk(cx, cy) {
  const trees = [], resources = [];
  if (isBareDarkDimension()) return { trees, resources };
  const surfaceDimension = isSurfaceDimension();
  if (cx < 0 || cy < 0 || cx >= WORLD_CHUNK_COUNT || cy >= WORLD_CHUNK_COUNT) return { trees, resources };
  const left = cx * WORLD_CHUNK_SIZE, top = cy * WORLD_CHUNK_SIZE;
  // A global jittered sampling grid crosses chunk borders; priority thinning avoids clumps and seams.
  const denseForestNear = worldEditsIntersecting({left:left-3,top:top-3,right:left+WORLD_CHUNK_SIZE+3,bottom:top+WORLD_CHUNK_SIZE+3})
    .some(edit => edit.type === 'forest');
  for (const sampler of TREE_SAMPLERS) {
    if (sampler.salt === 1 && !denseForestNear) continue;
    const firstX = Math.floor(left / sampler.step) - 1;
    const lastX = Math.ceil((left + WORLD_CHUNK_SIZE) / sampler.step) + 1;
    const firstY = Math.floor(top / sampler.step) - 1;
    const lastY = Math.ceil((top + WORLD_CHUNK_SIZE) / sampler.step) + 1;
    for (let gy = firstY; gy <= lastY; gy += 1) for (let gx = firstX; gx <= lastX; gx += 1) {
      const candidate = treeCandidate(gx, gy, sampler.step, sampler.salt), { x, y } = candidate;
      if (x < left || x >= left + WORLD_CHUNK_SIZE || y < top || y >= top + WORLD_CHUNK_SIZE) continue;
      if(!cachedProceduralTreeAllowed(candidate,gx,gy,sampler,surfaceDimension))continue;
      trees.push({ x, y, r: .38, index:candidate.index, id:candidate.id });
    }
  }
  const definition = getWorldDefinition();
  const savedResources = worldResourcesInBounds({ left: left - 1.5, top: top - 1.5,
    right: left + WORLD_CHUNK_SIZE + 1.5, bottom: top + WORLD_CHUNK_SIZE + 1.5 });
  const kinds = ['wood', 'sturdyBranch', 'stone', 'berries', 'apples', 'leaves', 'vines'];
  for (let slot = 0, slots = definition.theme === 'dark' ? 0 : 2; slot < slots; slot += 1) {
    const seed = Math.imul(cx + 11, 374761393) ^ Math.imul(cy + 17, 668265263)
      ^ Math.imul(slot + 5, 2246822519) ^ Math.imul(definition.generationVersion + 31, 3266489917) ^ activeWorldSeed;
    const x = left + 1.5 + chunkRandom(seed ^ 0x165667b1) * (WORLD_CHUNK_SIZE - 3);
    const y = top + 1.5 + chunkRandom(seed ^ 0x27d4eb2d) * (WORLD_CHUNK_SIZE - 3);
    const spawnChance = worldTreeDensityAt(x, y) > 0 ? .62 : .08;
    if (chunkRandom(seed ^ 0x9e3779b9) >= spawnChance) continue;
    if (x >= WORLD_SIZE - 1 || y >= WORLD_SIZE - 1 || isPathTile(x,y) || worldWaterAt(x,y)
        || waterBankDepthAt(x,y,WORLD_WATER_OPTIONS,RESOURCE_BANK_CLEARANCE) > 0
        || (surfaceDimension && VILLAGE_BUILDINGS.some(building => x > building.bounds.left - 1.2 && x < building.bounds.right + 1.2
          && y > building.bounds.top - 1.2 && y < building.bounds.bottom + 1.2))
        || savedResources.some(resource => Math.hypot(resource.x-x,resource.y-y) < 1.5)
        || trees.some(tree => Math.hypot(tree.x-x,tree.y-y) < 1.2)
        || (surfaceDimension && SOLID_TREES.some(tree=>Math.hypot(tree.x-x,tree.y-y)<1.2))) continue;
    const kind = kinds[Math.floor(chunkRandom(seed ^ 0x85ebca6b) * kinds.length)];
    const id = `resource-${cx}-${cy}-g${definition.generationVersion}-${slot}`;
    resources.push({ id, kind, x, y });
  }
  return { trees, resources };
}
let worldChunkCaches = new WeakMap();
const worldChunkCachesByGeometry = new Map();
let worldChunk = createChunkCache(generateWorldChunk);
subscribeObjectCatalog(()=>{worldChunkCaches=new WeakMap();worldChunkCachesByGeometry.clear();worldChunk=createChunkCache(generateWorldChunk);});

export function applyWorldDefinition(definition, { chunkCacheLimit = WORLD_CHUNK_CACHE_LIMIT } = {}) {
  let state = worldChunkCaches.get(definition);
  const applied = state?.definition || setWorldDefinition(definition);
  if (!state) {
    const key = worldGeometryCacheKey(applied);
    let chunks = worldChunkCachesByGeometry.get(key);
    if (chunks) worldChunkCachesByGeometry.delete(key);
    else chunks = createChunkCache(generateWorldChunk, chunkCacheLimit);
    worldChunkCachesByGeometry.set(key, chunks);
    while (worldChunkCachesByGeometry.size > 8) worldChunkCachesByGeometry.delete(worldChunkCachesByGeometry.keys().next().value);
    state = { definition: applied, chunks };
    worldChunkCaches.set(definition, state);
  } else setWorldDefinition(applied);
  activeWorldSeed = applied.seed;
  worldChunk = state.chunks;
  return applied;
}

export { getWorldDefinition, worldGeometryCacheKey };

export function preloadWorldChunksAround(position, radius = 1) {
  const padding = (Math.max(0, Math.floor(radius)) + .5) * WORLD_CHUNK_SIZE;
  const bounds = { left:position.x-padding, right:position.x+padding, top:position.y-padding, bottom:position.y+padding };
  getSolidTreesInBounds(bounds);
  getResourcesInBounds(bounds);
}

const WORLD_LANDMARKS = Object.freeze([
  Object.freeze({ id:'shelter', kind:'shelter', x:CLEARING_DOOR.x, y:CLEARING_DOOR.y }),
  Object.freeze({ id:'campfire', kind:'campfire', x:SPAWN_CAMPFIRE.x, y:SPAWN_CAMPFIRE.y }),
  Object.freeze({ id:'pond', kind:'water', x:(SOLID_WATER.left+SOLID_WATER.right)/2, y:(SOLID_WATER.top+SOLID_WATER.bottom)/2 }),
  Object.freeze({ id:'highland', kind:'highland', x:(TERRAIN_BOUNDS.left+TERRAIN_BOUNDS.right)/2, y:(TERRAIN_BOUNDS.top+TERRAIN_BOUNDS.bottom)/2 }),
]);

export function getWorldMapOverview() {
  const builder=createWorldMapOverview();
  let result;
  do { result=builder.next(); } while(!result.done);
  return result.value;
}

// Each step computes one map cell. Browser callers can yield between batches;
// synchronous consumers keep the same overview and authoritative geometry.
export function* createWorldMapOverview() {
  const chunks = [];
  const mapChunkSize = Math.ceil(WORLD_SIZE / 48);
  const mapChunkCount = Math.ceil(WORLD_SIZE / mapChunkSize);
  const surfaceDimension = isSurfaceDimension();
  const theme = getWorldDefinition().theme;
  const defaultTerrain = isBareDarkDimension() ? 'meadow'
    : ['forest', 'magic'].includes(theme) ? 'dense-forest' : 'meadow';
  for (let cy = 0; cy < mapChunkCount; cy += 1) for (let cx = 0; cx < mapChunkCount; cx += 1) {
    const left=cx*mapChunkSize, top=cy*mapChunkSize, centerX=left+mapChunkSize/2, centerY=top+mapChunkSize/2;
    let trail=false;
    for(let sample=0;sample<5&&!trail;sample+=1){
      const offset=(sample+.5)*mapChunkSize/5;
      trail=isPathTile(left+offset,centerY)||isPathTile(centerX,top+offset);
    }
    const regionEdits=worldEditsIntersecting({left,top,right:left+mapChunkSize,bottom:top+mapChunkSize});
    const water=surfaceDimension&&left<=SOLID_WATER.right&&left+mapChunkSize>=SOLID_WATER.left
      &&top<=SOLID_WATER.bottom&&top+mapChunkSize>=SOLID_WATER.top
      || regionEdits.some(edit=>edit.type==='lake');
    const landmarks=(surfaceDimension ? WORLD_LANDMARKS : []).filter(place=>place.x>=left&&place.x<left+mapChunkSize
      &&place.y>=top&&place.y<top+mapChunkSize).map(({id,kind,x,y})=>({id,kind,x,y}));
    for(const edit of regionEdits){
      if(edit.type==='place'&&!landmarks.some(place=>place.id===edit.id))landmarks.push({id:edit.id,kind:edit.placeKind,name:edit.name,x:edit.x,y:edit.y,secret:edit.secret===true});
      else if(edit.type==='resource'&&!landmarks.some(place=>place.id===edit.id))landmarks.push({id:edit.id,kind:'resource',x:edit.x,y:edit.y});
    }
    const terrain=regionEdits.some(edit=>edit.type==='lake')?'water'
        :regionEdits.some(edit=>edit.type==='clearing')?'meadow'
          :regionEdits.some(edit=>edit.type==='forest')?'dense-forest'
          :water?'water':defaultTerrain;
    chunks.push({x:cx,y:cy,terrain,trail,landmarks});
    yield;
  }
  return { worldSize:WORLD_SIZE, chunkSize:mapChunkSize, columns:mapChunkCount, rows:mapChunkCount, chunks };
}

function chunksInBounds(bounds, select) {
  const result = [];
  const minX = Math.max(0, Math.floor(bounds.left / WORLD_CHUNK_SIZE));
  const maxX = Math.min(WORLD_CHUNK_COUNT - 1, Math.floor(bounds.right / WORLD_CHUNK_SIZE));
  const minY = Math.max(0, Math.floor(bounds.top / WORLD_CHUNK_SIZE));
  const maxY = Math.min(WORLD_CHUNK_COUNT - 1, Math.floor(bounds.bottom / WORLD_CHUNK_SIZE));
  for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1) {
    for (const item of select(worldChunk(cx, cy))) {
      if (item.x >= bounds.left && item.x <= bounds.right && item.y >= bounds.top && item.y <= bounds.bottom) result.push(item);
    }
  }
  return result;
}
export function getSolidTreesInBounds(bounds) {
  if (isBareDarkDimension()) return [];
  return [...(isSurfaceDimension() ? queryWorldChunks(authoredTreesByChunk, bounds) : []), ...chunksInBounds(bounds, chunk => chunk.trees), ...worldTreesInBounds(bounds)]
    .filter(tree => !isWorldTreeRemoved(tree.id))
    .filter(tree => tree.id?.startsWith('maptree:') || tree.id?.startsWith('authored:') || worldTreeDensityAt(tree.x, tree.y) > 0)
    .filter(tree => waterBankDepthAt(tree.x,tree.y,WORLD_WATER_OPTIONS,Math.max(TREE_BANK_CLEARANCE,tree.r||0)) <= 0)
    .filter(tree => !treeNearWaterShore(tree.x,tree.y));
}
export function arrivalForestTreesInBounds(bounds) {
  void bounds;
  return [];
}
export function getTreeGrowthInBounds(bounds) {
  if (isBareDarkDimension()) return [];
  return worldTreeGrowthInBounds(bounds)
    .filter(tree => waterBankDepthAt(tree.x, tree.y, WORLD_WATER_OPTIONS, RESOURCE_BANK_CLEARANCE) <= 0)
    .filter(tree => !treeNearWaterShore(tree.x,tree.y));
}
export function getRocksInBounds(bounds) {
  if (isBareDarkDimension()) return [];
  return worldRocksInBounds(bounds)
    .filter(rock => waterBankDepthAt(rock.x,rock.y,WORLD_WATER_OPTIONS,Math.max(ROCK_BANK_CLEARANCE,rock.r||0)) <= 0);
}
export function getLakesInBounds(bounds) { return worldLakesIntersecting(bounds); }
export function getResourcesInBounds(bounds) {
  if (isBareDarkDimension()) return [];
  return [...(isSurfaceDimension() ? queryWorldChunks(authoredResourcesByChunk, bounds) : []), ...chunksInBounds(bounds, chunk => chunk.resources), ...worldResourcesInBounds(bounds)]
    .filter(resource => !isWorldResourceRemoved(resource.id))
    .filter(resource => waterBankDepthAt(resource.x,resource.y,WORLD_WATER_OPTIONS,RESOURCE_BANK_CLEARANCE) <= 0)
    .filter(resource => !BOTANICAL_RESOURCE_KINDS.has(resource.kind)
      || !waterPlantExcludedAt(resource.x,resource.y,WORLD_WATER_OPTIONS));
}
export function getFallenTreesInBounds(bounds) { void bounds; return []; }

// Static broad phase: query nearby cells rather than every tree at each physics step.
export const EXPERIMENTAL_TREE_FLIGHT_HEIGHT = 4;
export const EXPERIMENTAL_MAX_FLIGHT_HEIGHT = 12;
export function hasTreeCollision(position,radius=PLAYER_RADIUS,absoluteFeetZ=null){
  const reach = radius + .4;
  const left=position.x-reach,right=position.x+reach,top=position.y-reach,bottom=position.y+reach;
  const collides=tree=>{
    const dx=position.x-tree.x,dy=position.y-tree.y,r=tree.r+radius;
    if(dx*dx+dy*dy>=r*r)return false;
    // Only flight uses absolute world altitude. Ground movement and jumps keep
    // their existing collision rules; rocks below remain solid at any height.
    if(Number.isFinite(absoluteFeetZ)&&absoluteFeetZ>=surfaceHeight(tree.x,tree.y)+EXPERIMENTAL_TREE_FLIGHT_HEIGHT)return false;
    return !isWorldTreeRemoved(tree.id)
      && (tree.id?.startsWith('maptree:')||tree.id?.startsWith('authored:')||worldTreeDensityAt(tree.x,tree.y)>0)
      && waterBankDepthAt(tree.x,tree.y,WORLD_WATER_OPTIONS,Math.max(TREE_BANK_CLEARANCE,tree.r||0))<=0
      && !treeNearWaterShore(tree.x,tree.y);
  };
  if(isSurfaceDimension()&&queryWorldChunks(authoredTreesByChunk,{left,right,top,bottom}).some(collides))return true;
  if(worldTreesInBounds({left,right,top,bottom}).some(collides))return true;
  // Collision must not synchronously generate an entire visual/resource chunk
  // when a player or animal crosses a cold boundary. Sample only jittered
  // grid candidates close enough to touch this body, using the same predicate
  // as visual chunk generation so physical trunks never diverge from the art.
  let coldChunk=false;
  const minX=Math.max(0,Math.floor(left/WORLD_CHUNK_SIZE)),maxX=Math.min(WORLD_CHUNK_COUNT-1,Math.floor(right/WORLD_CHUNK_SIZE));
  const minY=Math.max(0,Math.floor(top/WORLD_CHUNK_SIZE)),maxY=Math.min(WORLD_CHUNK_COUNT-1,Math.floor(bottom/WORLD_CHUNK_SIZE));
  for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++){
    const cached=worldChunk.peek(cx,cy);
    if(cached){for(const tree of cached.trees)if(collides(tree))return true;}
    else coldChunk=true;
  }
  if(coldChunk&&!isBareDarkDimension())for(const sampler of TREE_SAMPLERS){
    const firstX=Math.floor(left/sampler.step)-1,lastX=Math.floor(right/sampler.step)+1;
    const firstY=Math.floor(top/sampler.step)-1,lastY=Math.floor(bottom/sampler.step)+1;
    for(let gy=firstY;gy<=lastY;gy++)for(let gx=firstX;gx<=lastX;gx++){
      const candidate=treeCandidate(gx,gy,sampler.step,sampler.salt),dx=position.x-candidate.x,dy=position.y-candidate.y;
      if(dx*dx+dy*dy>=(.38+radius)**2)continue;
      if(worldChunk.peek(Math.floor(candidate.x/WORLD_CHUNK_SIZE),Math.floor(candidate.y/WORLD_CHUNK_SIZE)))continue;
      if(cachedProceduralTreeAllowed(candidate,gx,gy,sampler,isSurfaceDimension())&&collides({...candidate,r:.38}))return true;
    }
  }
  if(worldRocksInBounds({left,right,top,bottom}).some(rock=>{
    const dx=position.x-rock.x,dy=position.y-rock.y,r=rock.r+radius;
    if(dx*dx+dy*dy>=r*r)return false;
    return !isWorldRockRemoved(rock.id)&&waterBankDepthAt(rock.x,rock.y,WORLD_WATER_OPTIONS,Math.max(ROCK_BANK_CLEARANCE,rock.r||0))<=0;
  }))return true;
  return false;
}

let buildingPosts = null;
subscribeObjectCatalog(() => { buildingPosts = null; });
function hasBuildingCollision(position, radius) {
  if (!isSurfaceDimension()) return false;
  if (!buildingPosts) {
    buildingPosts = [RECEPTION_BUILDING, ...VILLAGE_BUILDINGS]
      .flatMap(building => buildingArchitecture(building).posts);
  }
  if(buildingPosts.some(b=>{
    // The avatar sprite extends slightly beyond its physics circle. Keep its
    // visible outline off the porch posts without narrowing the doorway.
    const visualClearance=radius+.1;
    return position.x>b.left-visualClearance&&position.x<b.right+visualClearance
      &&position.y>b.top-visualClearance&&position.y<b.bottom+visualClearance;
  }))return true;
  const shelterClearance = radius + SHELTER_WALL_CLEARANCE;
  if (position.x > SHELTER_BOUNDS.left - shelterClearance && position.x < SHELTER_BOUNDS.right + shelterClearance
      && position.y > SHELTER_BOUNDS.top - shelterClearance && position.y < SHELTER_BOUNDS.bottom + shelterClearance) return true;
  return VILLAGE_BUILDINGS.some(building => {
    // Keep the visible body clear of the facade. The collision circle alone
    // was small enough for the sprite to clip into the near side of a house.
    // Doorways are interaction points, not gaps to walk into: allowing the
    // player inside this visual margin places the sprite over the door frame.
    const b = building.bounds, wallClearance = radius + .35;
    const nearWall = position.x > b.left - wallClearance && position.x < b.right + wallClearance
      && position.y > b.top - wallClearance && position.y < b.bottom + wallClearance;
    return nearWall;
  });
}

export function canOccupy(position, radius = PLAYER_RADIUS, height = 0, { ignoreFires = false, absoluteFeetZ = null } = {}) {
  if (!insideBoundaryWall(position, radius, WORLD_SIZE)) return false;
  const surfaceDimension = isSurfaceDimension();
  if (hasBuildingCollision(position, radius)) return false;
  if (hasTreeCollision(position,radius,absoluteFeetZ)) return false;
  // Fire is dynamic world state. Movement and interaction check the live fire
  // collection explicitly; this terrain predicate must not invent a spawn fire.
  // Deep water is swimmable; the depth changes movement and animation, not collision.
  return true;
}

function avatarScreenDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot((dx - dy) * TILE_X, (dx + dy) * TILE_Y);
}

function avatarsHaveClearance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.abs((dx - dy) * TILE_X) >= AVATAR_CLEAR_WIDTH
    || Math.abs((dx + dy) * TILE_Y) >= AVATAR_CLEAR_HEIGHT;
}

function playersHaveSpace(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) >= PLAYER_SEPARATION;
}

function canMovePastPlayer(from, candidate, other) {
  if (playersHaveSpace(candidate, other)) return true;
  // Reconciliation or another moving actor can leave two bodies overlapping.
  // Permit separation, but never allow a step deeper into the other player.
  const before = Math.hypot(from.x - other.x, from.y - other.y);
  const after = Math.hypot(candidate.x - other.x, candidate.y - other.y);
  return before < PLAYER_SEPARATION && after > before + 1e-8;
}

export function findSpawnPosition(occupiedPositions = []) {
  const occupied = occupiedPositions.filter(position => Number.isFinite(position?.x) && Number.isFinite(position?.y));
  const candidates = [{ ...SPAWN }];
  const rings = [];
  for (let radius = 1.25; radius <= 16; radius += 0.65) rings.push(radius);
  const directions = 32;
  for (const radius of rings) {
    for (let index = 0; index < directions; index += 1) {
      const angle = index * Math.PI * 2 / directions;
      candidates.push({
        x: SPAWN.x + Math.cos(angle) * radius,
        y: SPAWN.y + Math.sin(angle) * radius,
      });
    }
  }

  const isClear = position => canOccupy(position)
    && (!isSurfaceDimension() || RESOURCE_NODES.every(resource => Math.hypot(position.x - resource.x, position.y - resource.y) >= 1.25))
    && occupied.every(other => avatarsHaveClearance(position, other));
  const clear = candidates.find(isClear);
  if (clear) return clear;

  // Keep player separation when the arrival pocket is busy, even if the
  // nearest safe point is beside a collectible resource.
  const separated = candidates.find(position => canOccupy(position)
    && occupied.every(other => avatarsHaveClearance(position, other)));
  if (separated) return separated;

  return candidates.filter(position => canOccupy(position)).sort((a, b) => {
    const separation = position => occupied.length
      ? Math.min(...occupied.map(other => avatarScreenDistance(position, other)))
      : Infinity;
    return separation(b) - separation(a);
  })[0] || { ...SPAWN };
}

export function findNearbyPosition(origin, occupiedPositions = [], maxRadius = 8) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;
  const occupied = occupiedPositions.filter(position => Number.isFinite(position?.x) && Number.isFinite(position?.y));
  const isFree=position=>canOccupy(position)&&occupied.every(other=>avatarsHaveClearance(position,other));
  if(isFree(origin))return {x:origin.x,y:origin.y};
  const radiusLimit=Number.isFinite(maxRadius)?Math.max(0,Math.min(64,maxRadius)):8;
  for (let ring = .5; ring <= radiusLimit; ring += .5) {
    for (let index = 0; index < 16; index += 1) {
      const angle = index * Math.PI * 2 / 16;
      const candidate={x:origin.x+Math.cos(angle)*ring,y:origin.y+Math.sin(angle)*ring};
      if(isFree(candidate))return candidate;
    }
  }
  return null;
}

export function stepPlayer(position, input, deltaSeconds, occupiedPositions = [], fires = [], nowMs = globalThis.performance?.now?.() ?? Date.now(), animals = [], attributes = {}) {
  // Saved positions can predate the light wall. Recover them to its
  // inner face before simulating so short movement steps cannot leave them stuck.
  if (!insideBoundaryWall(position, PLAYER_RADIUS, WORLD_SIZE)) {
    position = { ...position, ...clampInsideBoundaryWall(position, PLAYER_RADIUS, WORLD_SIZE), vx: 0, vy: 0 };
  }
  if (hasBuildingCollision(position, PLAYER_RADIUS)) {
    const safePosition = findNearbyPosition(position, occupiedPositions);
    if (safePosition) position = { ...position, ...safePosition, vx: 0, vy: 0 };
  }
  const dt = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.05));
  if(attributes.flightAuthorized===true&&!input?.flight&&Number.isFinite(position.flightZ)
      &&position.flightZ<=surfaceHeight(position.x,position.y)+1e-7&&Math.abs(position.vz||0)<1e-7){
    const {flightZ,blocked,...grounded}=position;
    position={...grounded,z:0,vz:0};
  }
  // This path is deliberately gated by a trusted caller, not by input. It is
  // shared by client prediction and server simulation once the pilot is wired.
  if(attributes.flightAuthorized===true&&(input?.flight||Number.isFinite(position.flightZ))){
    const terrain=surfaceHeight;
    const absoluteZ=Number.isFinite(position.flightZ)?position.flightZ:terrain(position.x,position.y)+(position.z||0);
    const state={...position,z:absoluteZ};
    const flight=input.flight||{x:0,y:0,vertical:0};
    const targetZ=Number.isFinite(flight.targetHeight)?terrain(position.x,position.y)+Math.max(0,Math.min(EXPERIMENTAL_MAX_FLIGHT_HEIGHT,flight.targetHeight)):null;
    const intent=targetZ===null?flight:{...flight,vertical:Math.abs(targetZ-absoluteZ)<.001?0:Math.sign(targetZ-absoluteZ)};
    const next=flightStep(state,intent,dt,{
      terrain,profile:flight.profile==='smooth'?'smooth':'controlled',
      targetZ,
      canOccupy:(candidate,previous)=>{
        const height=candidate.z-terrain(candidate.x,candidate.y);
        if(height>EXPERIMENTAL_MAX_FLIGHT_HEIGHT)return false;
        if(!canOccupy(candidate,PLAYER_RADIUS,height,{absoluteFeetZ:candidate.z}))return false;
        if(!canMovePastFires(previous,candidate,fires,PLAYER_RADIUS,height))return false;
        if(!occupiedPositions.every(other=>!other||canMovePastPlayer(previous,candidate,other)))return false;
        return animals.every(animal=>!animal||!Number.isFinite(animal.x)||!Number.isFinite(animal.y)
          ||Math.hypot(candidate.x-animal.x,candidate.y-animal.y)>=PLAYER_RADIUS+Math.max(0,Number(animal.radius)||0));
      },
    });
    return {...next,flightZ:next.z,z:Math.max(0,next.z-terrain(next.x,next.y))};
  }
  let dx = Math.max(-1, Math.min(1, Number(input?.x) || 0));
  let dy = Math.max(-1, Math.min(1, Number(input?.y) || 0));
  const length = Math.hypot(dx, dy);
  if (length > 1) { dx /= length; dy /= length; }
  const water = waterStateAt(position.x,position.y,WORLD_WATER_OPTIONS);
  const swimming=water.depth>WATER_WADING_DEPTH;
  const waterDrag = water.depth > .03 ? Math.max(.5,1-water.depth*.34) : 1;
  const ahead={x:position.x+dx*.12,y:position.y+dy*.12};
  const elevationGain=Math.max(0,surfaceHeight(ahead.x,ahead.y)-surfaceHeight(position.x,position.y));
  const uphillScale=1-Math.min(.04,elevationGain*.3);
  const waterSpeed=PLAYER_SPEED*movementSpeedMultiplier(attributes)*uphillScale*waterDrag;
  const distance = waterSpeed * dt;
  const movementInput=swimming?{...input,run:false,crouch:false,jump:false}:input;
  const wasAirborne=(position.z||0)>0||(position.vz||0)>0;
  const body=input?.motion===true?locomotion(position,movementInput,dt,waterSpeed,0):null;
  const nearFireForJump=fires.some(fire=>Math.hypot(position.x-fire.x,position.y-fire.y)<FIRE_RADIUS+PLAYER_RADIUS+.2);
  const jumpClearsFire=position.fireJumping===true
    ||(body?.z>=FIRE_JUMP_CLEARANCE_HEIGHT&&nearFireForJump);
  const fireCollisionHeight=jumpClearsFire?FIRE_JUMP_CLEARANCE_HEIGHT:body?.z??position.z??0;
  const currentScale=waterCurrentScale(water.depth);
  const moveX=(body?body.vx*dt:dx*distance)+water.currentX*dt*currentScale;
  const moveY=(body?body.vy*dt:dy*distance)+water.currentY*dt*currentScale;
  const canMoveTo = candidate => canTraverseSurface(position,candidate) && canOccupy(candidate,PLAYER_RADIUS,fireCollisionHeight) && canMovePastFires(position,candidate,fires,PLAYER_RADIUS,fireCollisionHeight)
    && occupiedPositions.every(other => !other || canMovePastPlayer(position, candidate, other))
    && animals.every(animal => {
      if (!animal || !Number.isFinite(animal.x) || !Number.isFinite(animal.y)) return true;
      const clearance = PLAYER_RADIUS + Math.max(0, Number(animal.radius) || 0);
      const candidateDistance = Math.hypot(candidate.x - animal.x, candidate.y - animal.y);
      const currentDistance = Math.hypot(position.x - animal.x, position.y - animal.y);
      return candidateDistance >= clearance || candidateDistance >= currentDistance - 1e-6;
    });
  let next = { x: position.x + moveX, y: position.y };
  if (!canMoveTo(next)) {next.x = position.x;if(body)body.vx=0;}
  next.y += moveY;
  if (!canMoveTo(next)) {next.y = position.y;if(body)body.vy=0;}
  const stillInsideFire=fires.some(fire=>Math.hypot(next.x-fire.x,next.y-fire.y)<FIRE_RADIUS+PLAYER_RADIUS);
  const landedOnLitFire=Boolean(body&&wasAirborne&&body.z===0&&fires.some(fire=>
    Math.hypot(next.x-fire.x,next.y-fire.y)<FIRE_RADIUS
      &&campfireRemainingMs(fire,nowMs)>0));
  const hadBurnState=Number.isFinite(position.burningRemainingMs);
  let burningRemainingMs=Math.max(0,(Number(position.burningRemainingMs)||0)-dt*1000);
  if(landedOnLitFire)burningRemainingMs=CAMPFIRE_PLAYER_BURN_DURATION_MS;
  const waterAfterMove=waterStateAt(next.x,next.y,WORLD_WATER_OPTIONS);
  if(waterAfterMove.depth>WATER_WADING_DEPTH)burningRemainingMs=0;
  // Keep the pass-through state through landing so the fire never snaps the player to its rim.
  const fireJumping=Boolean((jumpClearsFire||wasAirborne)&&((body?.z||0)>0||stillInsideFire));
  if(body)return {...next,...body,fireJumping,...(hadBurnState||burningRemainingMs>0?{burningRemainingMs}: {})};
  return hadBurnState||burningRemainingMs>0?{...next,burningRemainingMs}:next;
}

export function findWalkPath(start, target, occupiedPositions = [], location = 'clearing', furniture = [], fires = [], roomLayout = STANDARD_ROOM_LAYOUT, animals = []) {
  const animalsHaveSpace = (position, margin = 0) => location === 'room' || animals.every(animal => !animal
    || !Number.isFinite(animal.x) || !Number.isFinite(animal.y)
    || Math.hypot(position.x - animal.x, position.y - animal.y)
      >= PLAYER_RADIUS + Math.max(0, Number(animal.radius) || 0) + margin);
  const walkable = position => (location==='room'?canOccupyRoom(position, PLAYER_RADIUS, furniture, roomLayout):(canOccupy(position,PLAYER_RADIUS+.07) && canMovePastFires(start,position,fires,PLAYER_RADIUS+.07)))
    && occupiedPositions.every(other => !other || playersHaveSpace(position, other))
    && animalsHaveSpace(position, .07);
  const clearSegment = (from,to) => {
    if(!canTraverseSurface(from,to,location,roomLayout) || (location!=='room' && !canMovePastFires(from,to,fires,PLAYER_RADIUS)))return false;
    const count=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/.08);
    for(let i=1;i<count;i++){
      const p={x:from.x+(to.x-from.x)*i/count,y:from.y+(to.y-from.y)*i/count};
      if(!(location==='room'?canOccupyRoom(p,PLAYER_RADIUS,furniture.filter(item=>{
        const before=Math.hypot(from.x-item.x,from.y-item.y),after=Math.hypot(p.x-item.x,p.y-item.y);
        return !(before<PLAYER_RADIUS+roomFurnitureRadius(item)&&after>=before-1e-8);
      }),roomLayout):canOccupy(p))
        || (location!=='room' && !canMovePastFires(from,p,fires,PLAYER_RADIUS))
        || !animalsHaveSpace(p)
        || !occupiedPositions.every(other=>!other||playersHaveSpace(p,other)))return false;
    }
    return true;
  };
  const gridPosition = (x, y) => ({
    x: PATH_GRID_STEP / 2 + x * PATH_GRID_STEP,
    y: PATH_GRID_STEP / 2 + y * PATH_GRID_STEP,
  });
  const nearestIndex = value => Math.max(0, Math.min(PATH_GRID_SIZE - 1,
    Math.round((value - PATH_GRID_STEP / 2) / PATH_GRID_STEP)));
  const startX = nearestIndex(start.x);
  const startY = nearestIndex(start.y);
  const targetX = nearestIndex(target.x);
  const targetY = nearestIndex(target.y);
  const minX=Math.max(0,Math.min(startX,targetX)-24),maxX=Math.min(PATH_GRID_SIZE-1,Math.max(startX,targetX)+24);
  const minY=Math.max(0,Math.min(startY,targetY)-24),maxY=Math.min(PATH_GRID_SIZE-1,Math.max(startY,targetY)+24);
  const localStride=maxX-minX+1;
  const keyFor=(x,y)=>(y-minY)*localStride+x-minX;
  const startKey=keyFor(startX,startY);

  const goalWalkable=position=>walkable(position)&&(location==='room'||canMovePastFires(position,position,fires,PLAYER_RADIUS+.07));
  const directDistance=Math.hypot(target.x-start.x,target.y-start.y);
  if(directDistance<=16&&goalWalkable(target)&&clearSegment(start,target)){
    return directDistance>.75?[{x:(start.x+target.x)/2,y:(start.y+target.y)/2},target]:[target];
  }
  // The player can stand just outside a collider while the route grid adds a
  // small safety margin. If rounding places the start cell inside that margin,
  // step to the nearest clear grid cell first instead of returning no path.
  const startCell = gridPosition(startX, startY);
  if (!walkable(startCell)) {
    let escape = null;
    let escapeDistance = Infinity;
    for (let y = Math.max(minY, startY - 6); y <= Math.min(maxY, startY + 6); y += 1) {
      for (let x = Math.max(minX, startX - 6); x <= Math.min(maxX, startX + 6); x += 1) {
        const candidate = gridPosition(x, y);
        if (!walkable(candidate) || !clearSegment(start, candidate)) continue;
        const distance = Math.hypot(candidate.x - start.x, candidate.y - start.y);
        if (distance < escapeDistance) { escapeDistance = distance; escape = candidate; }
      }
    }
    if (escape) {
      const remaining = findWalkPath(escape, target, occupiedPositions, location, furniture, fires, roomLayout, animals);
      if (remaining.length) return [escape, ...remaining];
    }
  }
  let goalKey = goalWalkable(gridPosition(targetX,targetY)) ? keyFor(targetX,targetY) : null;
  let goalDistance = Infinity;
  if(goalKey===null)for (let y = Math.max(minY,targetY-8); y <= Math.min(maxY,targetY+8); y += 1) {
    for (let x = Math.max(minX,targetX-8); x <= Math.min(maxX,targetX+8); x += 1) {
      const position = gridPosition(x, y);
      if (!goalWalkable(position)) continue;
      const distance = Math.hypot(x - targetX, y - targetY);
      if (distance < goalDistance) { goalDistance = distance; goalKey = keyFor(x,y); }
    }
  }
  if (goalKey === null) return [];
  if (startKey === goalKey) return goalWalkable(target) && clearSegment(start,target) ? [target] : [];

  const open = [];
  let openOrder = 0;
  const comesBefore = (left, right) => left.score < right.score
    || (left.score === right.score && left.order < right.order);
  const pushOpen = (key, score) => {
    let index = open.length;
    open.push({ key, score, order: openOrder++ });
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!comesBefore(open[index], open[parent])) break;
      [open[index], open[parent]] = [open[parent], open[index]];
      index = parent;
    }
  };
  const popOpen = () => {
    const first = open[0];
    const last = open.pop();
    if (open.length) {
      open[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        let best = index;
        if (left < open.length && comesBefore(open[left], open[best])) best = left;
        if (right < open.length && comesBefore(open[right], open[best])) best = right;
        if (best === index) break;
        [open[index], open[best]] = [open[best], open[index]];
        index = best;
      }
    }
    return first;
  };
  const cameFrom = new Map();
  const costs = new Map([[startKey, 0]]);
  const scores = new Map([[startKey, Math.hypot(startX - targetX, startY - targetY)]]);
  const closed = new Set();
  pushOpen(startKey, scores.get(startKey));
  const directions = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2],
  ];

  while (open.length) {
    const queued = popOpen();
    const current = queued.key;
    if (closed.has(current) || queued.score !== scores.get(current)) continue;
    if (current === goalKey) break;
    closed.add(current);
    const currentX = minX + current % localStride;
    const currentY = minY + Math.floor(current / localStride);
    for (const [dx, dy, stepCost] of directions) {
      const x = currentX + dx;
      const y = currentY + dy;
      if (x < minX || y < minY || x > maxX || y > maxY) continue;
      const key = keyFor(x,y);
      if (closed.has(key)) continue;
      const position = gridPosition(x, y);
      if (!walkable(position) || !clearSegment(current===startKey?start:gridPosition(currentX,currentY),position)) continue;
      if (dx && dy && (!walkable(gridPosition(currentX + dx, currentY))
          || !walkable(gridPosition(currentX, currentY + dy)))) continue;
      const nextCost = costs.get(current) + stepCost;
      if (nextCost >= (costs.get(key) ?? Infinity)) continue;
      cameFrom.set(key, current);
      costs.set(key, nextCost);
      const score = nextCost + Math.hypot(x - targetX, y - targetY);
      scores.set(key, score);
      pushOpen(key, score);
    }
  }

  if (!cameFrom.has(goalKey)) return [];
  const path = [];
  for (let key = goalKey; key !== startKey; key = cameFrom.get(key)) {
    path.push(gridPosition(minX + key % localStride, minY + Math.floor(key / localStride)));
  }
  path.reverse();
  if (goalWalkable(target) && path.length && clearSegment(path.at(-1),target) && Math.hypot(path.at(-1).x - target.x, path.at(-1).y - target.y) > 0.22) path.push(target);
  return path;
}

export function canOccupyRoom(position, radius = PLAYER_RADIUS, furniture = [], roomLayout = STANDARD_ROOM_LAYOUT) {
  const { left, right, top, bottom } = roomLayout.bounds;
  if (position.x < left + radius || position.x > right - radius
      || position.y < top + radius) return false;
  const entranceLane = roomLayout.elevation === 'flat'
    && Math.abs(position.x - roomLayout.door.x) <= ROOM_ENTRANCE_LANE_HALF_WIDTH
    && position.y <= bottom + 1.18 - radius;
  if (position.y > bottom - radius && !entranceLane) return false;
  const voids=interiorFloorShape(roomLayout)?.voids||[];
  if (voids.some(r=>position.x+radius>r.left && position.x-radius<r.right
      && position.y+radius>r.top && position.y-radius<r.bottom)) return false;
  const fixtures=roomLayout.fixtures||[];
  const fixtureRects=fixtures.map(item=>roomFurnitureFootprintBounds(item));
  const isFixtureRect=rect=>fixtureRects.some(shape=>Math.abs(shape.left-rect.left)<.001&&Math.abs(shape.right-rect.right)<.001
    &&Math.abs(shape.top-rect.top)<.001&&Math.abs(shape.bottom-rect.bottom)<.001);
  const obstacles = [...(roomLayout.counter ? [roomLayout.counter] : []),
    ...(roomLayout.obstacles || []).filter(rect=>!isFixtureRect(rect))];
  if (obstacles.some(obstacle => position.x + radius > obstacle.left && position.x - radius < obstacle.right
      && position.y + radius > obstacle.top && position.y - radius < obstacle.bottom)) return false;
  if(fixtures.some(item=>roomFurnitureOverlapsPlayer(position,radius,item)))return false;
  if (furniture.some(item => (item.baseZ||0)<.02&&Math.abs(surfaceHeight(position.x, position.y, 'room', roomLayout)
      - surfaceHeight(item.x, item.y, 'room', roomLayout)) < 0.3&&roomFurnitureOverlapsPlayer(position,radius,item))) return false;
  return true;
}

// Walk-through exits are directional. A player must first stand on the real
// floor, then cross the plane of the doorway; a shallow step near the outer
// landing must never switch the whole scene back to the exterior.
export function crossedRoomExit(from, to, roomLayout = STANDARD_ROOM_LAYOUT, { enteredFloor = false } = {}) {
  if (roomLayout.elevation !== 'flat' || !from || !to) return false;
  if (!enteredFloor) return false;
  const exitY = roomLayout.door.y;
  if (to.y <= exitY || to.y <= from.y) return false;
  const fraction = (exitY - from.y) / (to.y - from.y);
  if (fraction < 0 || fraction > 1) return false;
  const crossingX = from.x + (to.x - from.x) * fraction;
  return Math.abs(crossingX - roomLayout.door.x) <= ROOM_ENTRANCE_LANE_HALF_WIDTH;
}

// Interaction checks trace sightlines through physical obstacles; the actor's
// movement margin is not added to the ray, so nearby ground items remain usable.
// Keeping this shared means server actions and client affordances agree.
export function hasClearInteractionPath(from, to, {
  location = 'clearing', furniture = [], fires = [], targetRadius = 0, ignoreFires = false, roomLayout = STANDARD_ROOM_LAYOUT,
} = {}) {
  if (![from?.x, from?.y, to?.x, to?.y].every(Number.isFinite)) return false;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  // Leave one sampling interval outside the target so edge rounding cannot
  // mistake the target's own collider for an intervening obstacle.
  const clearance = Math.min(distance, Math.max(0, Number(targetRadius) || 0) + 0.06);
  const visibleDistance = distance - clearance;
  const steps = Math.ceil(visibleDistance / 0.06);
  for (let index = 1; index <= steps; index += 1) {
    const fraction = (visibleDistance * index / steps) / distance;
    const point = { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
    const walkable = location === 'room'
      ? canOccupyRoom(point, 0, furniture, roomLayout)
      : canOccupy(point, 0, 0, { ignoreFires });
    if (!walkable) return false;
    if (location !== 'room' && !ignoreFires && fires.some(fire =>
      Math.hypot(point.x - fire.x, point.y - fire.y) < FIRE_RADIUS)) return false;
  }
  return true;
}

export function roomFurnitureSupport(position,furniture=[],roomLayout=STANDARD_ROOM_LAYOUT,excludeIds=[]){
  const child=furnitureVisual(position);
  if(!child.stackable)return null;
  const excluded=new Set(excludeIds);
  for(const parent of [...furniture].reverse()){
    if(!parent?.id||excluded.has(parent.id))continue;
    const host=furnitureVisual(parent),support=host.supports?.top;
    if(!support?.accepts?.includes(child.kind)
      ||Math.abs(surfaceHeight(position.x,position.y,'room',roomLayout)-surfaceHeight(parent.x,parent.y,'room',roomLayout))>=.3)continue;
    const hostQuarter=host.rotatable?Math.abs(parent.rotation||0)%2:0;
    const childQuarter=child.rotatable?Math.abs(position.rotation||0)%2:0;
    const supportWidth=hostQuarter?support.depth:support.width,supportDepth=hostQuarter?support.width:support.depth;
    const childWidth=childQuarter?child.depth:child.width,childDepth=childQuarter?child.width:child.depth;
    const angle=-((parent.rotation||0)%4)*Math.PI/2;
    const dx=position.x-parent.x,dy=position.y-parent.y;
    const supportOffsetX=dx*Math.cos(angle)-dy*Math.sin(angle),supportOffsetY=dx*Math.sin(angle)+dy*Math.cos(angle);
    if(Math.abs(supportOffsetX)+childWidth/2>supportWidth/2+.001
      ||Math.abs(supportOffsetY)+childDepth/2>supportDepth/2+.001)continue;
    const baseZ=(parent.baseZ||0)+host.height;
    if(baseZ+child.height>(roomLayout.wallHeight||BUILDING_STANDARD.interiorWallHeight)+.001)continue;
    return {supportId:parent.id,supportSurface:'top',supportOffsetX,supportOffsetY,baseZ};
  }
  return null;
}

export function canPlaceRoomFurniture(position, furniture = [], occupiedPositions = [], roomLayout = STANDARD_ROOM_LAYOUT) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return false;
  if (Math.abs(position.x * 2 - Math.round(position.x * 2)) > 0.001
      || Math.abs(position.y * 2 - Math.round(position.y * 2)) > 0.001) return false;
  const placement={...position,kind:position.kind||'stool'},
    {left,right,top,bottom}=roomLayout.bounds,visual=furnitureVisual(placement);
  const support=roomFurnitureSupport(placement,furniture,roomLayout);
  if(placement.supportId&&(placement.supportId!==support?.supportId||Math.abs((placement.baseZ||0)-(support.baseZ||0))>.001))return false;
  const baseZ=support?.baseZ||0,footprint=fixtureBounds({...visual,x:placement.x,y:placement.y});
  if(footprint.left<left||footprint.right>right||footprint.top<top||footprint.bottom>bottom
      ||!canOccupyRoom(position,0,[],roomLayout)) return false;
  const fixed=[...(roomLayout.obstacles||[]),...(roomLayout.counter?[roomLayout.counter]:[]),...(interiorFloorShape(roomLayout)?.voids||[])];
  if(fixed.some(rect=>roomFurnitureFootprintOverlapsRect(placement,rect)))return false;
  const onRoomRamp = roomLayout.elevation === 'raised' && ((position.x >= 7 && position.x <= 9 && position.y > 7 && position.y < 9)
    || (position.x > 9 && position.x <= 11.5 && position.y > 7 && position.y < 10));
  if (onRoomRamp) return false;
  const height = surfaceHeight(position.x, position.y, 'room', roomLayout);
  if (height > 0.01 && height < 1.99) return false;
  // Keep the existing placement exclusion so previously saved rooms remain valid.
  if (footprint.bottom > roomLayout.door.y - BUILDING_STANDARD.entranceClearDepth
      && footprint.left < roomLayout.door.x+BUILDING_STANDARD.entranceClearHalfWidth
      && footprint.right > roomLayout.door.x-BUILDING_STANDARD.entranceClearHalfWidth) return false;
  const objectBase=height+baseZ,objectTop=objectBase+visual.height;
  if (furniture.some(item=>{
    const other=furnitureVisual(item),otherBase=surfaceHeight(item.x,item.y,'room',roomLayout)+(item.baseZ||0),otherTop=otherBase+other.height;
    const verticalOverlap=objectBase<otherTop-.015&&otherBase<objectTop-.015;
    return verticalOverlap&&roomFurnitureFootprintsOverlap(placement,item,.12);
  })) return false;
  if (!support&&occupiedPositions.some(other => other
      && Math.abs(height - surfaceHeight(other.x, other.y, 'room', roomLayout)) < 0.3
      && roomFurnitureOverlapsPlayer(other,PLAYER_RADIUS+.12,placement))) return false;
  return true;
}

export function stepRoomPlayer(position, input, deltaSeconds, occupiedPositions = [], furniture = [], roomLayout = STANDARD_ROOM_LAYOUT, attributes = {}) {
  const dt = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.05));
  let dx = Math.max(-1, Math.min(1, Number(input?.x) || 0));
  let dy = Math.max(-1, Math.min(1, Number(input?.y) || 0));
  const length = Math.hypot(dx, dy);
  if (length > 1) { dx /= length; dy /= length; }
  const ahead={x:position.x+dx*.12,y:position.y+dy*.12};
  const elevationGain=Math.max(0,surfaceHeight(ahead.x,ahead.y,'room',roomLayout)-surfaceHeight(position.x,position.y,'room',roomLayout));
  const uphillScale=1-Math.min(.04,elevationGain*.3);
  const playerSpeed = PLAYER_SPEED * movementSpeedMultiplier(attributes);
  const distance = playerSpeed * dt * uphillScale;
  const body=input?.motion===true?locomotion(position,input,dt,playerSpeed*uphillScale):null;
  const moveX=body?body.vx*dt:dx*distance,moveY=body?body.vy*dt:dy*distance;
  const groundFurniture=furniture.filter(item=>(item.baseZ||0)<.02);
  const canMoveTo = candidate => canTraverseSurface(position,candidate,'room',roomLayout) && canOccupyRoom(candidate, PLAYER_RADIUS,
    groundFurniture.filter(item=>{
      const before=roomFurnitureDistance(position,item),after=roomFurnitureDistance(candidate,item);
      return !(before<PLAYER_RADIUS&&after>=before-1e-8);
    }), roomLayout)
    && occupiedPositions.every(other => !other || canMovePastPlayer(position, candidate, other));
  // When leaving a seat beside another object, a diagonal can clear both
  // footprints even though each axis alone would approach one collider.
  const diagonal={x:position.x+moveX,y:position.y+moveY};
  if(canMoveTo(diagonal))return body?{...diagonal,...body}:diagonal;
  let next = { x: position.x + moveX, y: position.y };
  if (!canMoveTo(next)) {next.x = position.x;if(body)body.vx=0;}
  next.y += moveY;
  if (!canMoveTo(next)) {next.y = position.y;if(body)body.vy=0;}
  return body?{...next,...body}:next;
}

export function nearestResource(position, resources, reach = 1.15) {
  let nearest = null;
  let bestDistance = reach;
  for (const resource of resources) {
    const distance = Math.hypot(position.x - resource.x, position.y - resource.y,surfaceHeight(position.x,position.y)-surfaceHeight(resource.x,resource.y));
    if (distance <= bestDistance) { nearest = resource; bestDistance = distance; }
  }
  return nearest;
}

function nearestFire(position,fires=[]) {
  let nearest=null;
  for(const fire of fires){
    const distance=Math.hypot(position.x-fire.x,position.y-fire.y);
    if(!nearest||distance<nearest.distance)nearest={fire,distance};
  }
  return nearest;
}

function campfireMaterialCost(fire,now=Date.now()) {
  if(!fire)return CAMPFIRE_NEW_COST;
  const remaining=campfireRemainingMs(fire,now);
  if(remaining>0)return remaining<=CAMPFIRE_FEED_WINDOW_MS?CAMPFIRE_FEED_COST:CAMPFIRE_NEW_COST;
  return campfireDecayProgress(fire,now)>0?CAMPFIRE_DECAY_REBUILD_COST:CAMPFIRE_REKINDLE_COST;
}

function hasCampfireMaterials(inventory,cost) {
  return Object.entries(cost).every(([kind,quantity])=>(inventory[kind]||0)>=quantity);
}

function campfireCostLabel(cost) {
  return [cost.wood>0?`${cost.wood} ${cost.wood===1?'graveto':'gravetos'}`:null,
    cost.stone>0?`${cost.stone} ${cost.stone===1?'pedra':'pedras'}`:null,
    cost.leaves>0?`${cost.leaves===1?'um maço de folhas secas':`${cost.leaves} maços de folhas secas`}`:null].filter(Boolean).join(' + ');
}

export function nearestCollectible(position, resources, inventory = {}, reach = 1.2, fires = [], now = Date.now()) {
  const neededKinds = new Set();
  const cost=campfireMaterialCost(nearestFire(position,fires)?.fire,now);
  if ((inventory.wood || 0) < cost.wood) neededKinds.add('wood');
  if ((inventory.stone || 0) < cost.stone) neededKinds.add('stone');
  if ((inventory.leaves || 0) < (cost.leaves || 0)) neededKinds.add('leaves');
  const collectable = resources.filter(resource => !['log', 'copperVein', 'ironVein', 'coalSeam', 'woodBench', 'charcoalKiln', 'stoneFurnace', 'woodBatch', 'charcoalBatch', 'smeltBatch'].includes(resource.kind));
  const needed = nearestResource(position, collectable.filter(resource => neededKinds.has(resource.kind)), reach);
  return needed || nearestResource(position, collectable, reach);
}

function directionTo(position, target) {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const screenX = (dx - dy) * TILE_X;
  const screenY = (dx + dy) * TILE_Y;
  const angle = Math.atan2(screenY, screenX);
  const sector = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  return ['a leste', 'a sudeste', 'ao sul', 'a sudoeste', 'a oeste', 'a noroeste', 'ao norte', 'a nordeste'][sector];
}

export function getObjectiveText(position, resources, inventory = {}, fires = [], roomStateAvailable = true) {
  if (!roomStateAvailable) return 'A trilha espera. Tentando voltar…';
  const clock=globalThis.performance?.now?.()??Date.now();
  const nearest=nearestFire(position,fires);
  const targetFire=nearest?.fire||null;
  const targetCost=campfireMaterialCost(targetFire,clock);
  const costReady=hasCampfireMaterials(inventory,targetCost);
  const fireExtinguished=Boolean(targetFire&&campfireRemainingMs(targetFire,clock)<=0);
  const fireDecaying=fireExtinguished&&campfireDecayProgress(targetFire,clock)>0;
  const fireCanFeed=Boolean(targetFire&&!fireExtinguished
    &&campfireRemainingMs(targetFire,clock)<=CAMPFIRE_FEED_WINDOW_MS);
  if(targetFire&&fireExtinguished){
    const action=fireDecaying?'reconstruir':'reacender';
    const requirement=campfireCostLabel(targetCost);
    if(nearest.distance<1.6)return costReady
      ?`Pressione F para ${action} · ${requirement}.`
      :fireDecaying?`Fogueira se desfazendo · junte ${requirement}.`:`Fogueira apagada · junte ${requirement}.`;
    if(costReady)return `Vá até a fogueira ${directionTo(position,targetFire)} para ${action}.`;
  }
  if(targetFire&&fireCanFeed&&nearest.distance<1.6){
    return costReady?'Pressione F para alimentar a fogueira · 2 gravetos.'
      :'Fogueira enfraquecendo · junte 2 gravetos.';
  }
  if(targetFire&&fireCanFeed&&costReady){
    return `Vá até a fogueira ${directionTo(position,targetFire)} para alimentá-la.`;
  }
  if(targetFire&&nearest.distance<1.6)return 'A fogueira está acesa. Sente-se ou acene para alguém.';
  if(!targetFire&&costReady)return `Pressione F para acender uma fogueira · ${campfireCostLabel(targetCost)}.`;
  if(costReady&&targetFire)return 'Você já tem materiais para acender outra fogueira.';
  const neededKinds = new Set();
  if ((inventory.wood || 0) < targetCost.wood) neededKinds.add('wood');
  if ((inventory.stone || 0) < targetCost.stone) neededKinds.add('stone');
  if ((inventory.leaves || 0) < (targetCost.leaves || 0)) neededKinds.add('leaves');
  const nearestNeeded = resources.filter(resource => neededKinds.has(resource.kind));
  const nearbyMaterial = nearestResource(position, nearestNeeded, 1.2);
  const progress = `Fogueira: ${[
    targetCost.wood > 0 ? `${inventory.wood || 0}/${targetCost.wood} gravetos` : null,
    targetCost.stone > 0 ? `${inventory.stone || 0}/${targetCost.stone} pedras` : null,
    targetCost.leaves > 0 ? `${inventory.leaves || 0}/${targetCost.leaves} maço de folhas` : null,
  ].filter(Boolean).join(', ')}`;
  if (nearbyMaterial) {
    const label = nearbyMaterial.kind === 'wood' ? 'graveto' : nearbyMaterial.kind === 'stone' ? 'pedra'
      : nearbyMaterial.kind === 'leaves' ? 'folhas secas' : nearbyMaterial.kind === 'vines' ? 'cipó' : 'frutinhas';
    return `Pegue ${label} · ${progress}.`;
  }
  if(targetFire&&!fireExtinguished&&!fireCanFeed){
    return `Vá até a fogueira ${directionTo(position,targetFire)}.`;
  }
  const target = nearestResource(position, nearestNeeded, WORLD_SIZE * 2);
  if (target) {
    const label = target.kind === 'wood' ? 'gravetos' : target.kind === 'stone' ? 'pedras'
      : target.kind === 'leaves' ? 'folhas secas' : target.kind === 'vines' ? 'cipó' : target.kind === 'apples' ? 'maçãs' : 'frutinhas';
    return `Procure ${label} ${directionTo(position, target)} · ${progress}.`;
  }
  const missingLabels = [...neededKinds].map(kind => ({wood:'os gravetos',stone:'as pedras',leaves:'as folhas secas'}[kind]));
  const returning = missingLabels.length > 1 ? `${missingLabels.slice(0,-1).join(', ')} e ${missingLabels.at(-1)}` : missingLabels[0] || 'os materiais';
  const waitHint = `enquanto ${returning} retornam`;
  const berries = resources.filter(resource => resource.kind === 'berries');
  if (nearestResource(position, berries, 1.2)) {
    return `Pegue frutinhas para oferecer a alguém ${waitHint} · ${progress}.`;
  }
  const berryTarget = nearestResource(position, berries, WORLD_SIZE * 2);
  if (berryTarget) {
    return `Procure frutinhas ${directionTo(position, berryTarget)} para oferecer ${waitHint} · ${progress}.`;
  }
  return `Explore a trilha ${waitHint} · ${progress}.`;
}
