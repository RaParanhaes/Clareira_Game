import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoomLayout, ROOM_FURNITURE_LIMIT, HOTEL_LOBBY_LAYOUT } from './world.mjs';
import { ROOM_PRESET_KINDS, MAX_ROOM_PRESETS, isPresetFurniture, placedFurnitureCount, withPresetFurniture } from './room-presets.mjs';
import { createRoomFurniturePrediction } from './room-furniture-prediction.mjs';

const PRIVATE_LAYOUTS = [
  ['legacy', null, null],
  ['lodging', 'cabin-cedar-one', 'owned'],
  ['lodging', 'cabin-cedar-two', 'owned'],
  ['lodging', 'cabin-cedar-three', 'owned'],
  ['lodging', 'lodging-ember-hotel', 'rent'],
  ['lodging', 'lodging-ember-hotel', 'owned'],
  ['lodging', 'lodging-pine-inn', 'rent'],
  ['lodging', 'lodging-rill-guesthouse', 'rent'],
];

test('private rooms expose their movable pieces as predefined furniture, not as fixed fixtures', () => {
  for (const [kind, buildingId, mode] of PRIVATE_LAYOUTS) {
    const layout = getRoomLayout(kind, buildingId, mode);
    assert.ok(layout.presets.length > 0, `${layout.id} has predefined furniture`);
    assert.ok(layout.presets.every(item => item.preset === true && ROOM_PRESET_KINDS.includes(item.kind)),
      `${layout.id} presets are movable kinds`);
    assert.equal(layout.fixtures.some(item => ROOM_PRESET_KINDS.includes(item.kind)), false,
      `${layout.id} keeps no movable kind as a fixed fixture`);
    assert.equal(new Set(layout.presets.map(item => item.id)).size, layout.presets.length, `${layout.id} ids are unique`);
  }
});

test('fixed architecture stays in the layout and shares no collider with predefined furniture', () => {
  const cabin = getRoomLayout('lodging', 'cabin-cedar-one', 'owned');
  assert.deepEqual(cabin.fixtures.map(item => item.kind), ['fireplace'], 'the cabin fireplace is architecture, not furniture');
  assert.equal(cabin.obstacles.length, cabin.fixtures.length + cabin.partitions.length,
    'obstacles come only from fixed fixtures and partitions');
});

test('public lobbies keep their authored fixtures and have no predefined furniture', () => {
  assert.deepEqual(HOTEL_LOBBY_LAYOUT.presets, []);
  assert.ok(HOTEL_LOBBY_LAYOUT.fixtures.length > 0);
  assert.deepEqual(getRoomLayout('lobby', 'arrival').presets, []);
});

test('predefined furniture is added once, keeps moved positions, and never comes back after saving', () => {
  const layout = getRoomLayout('lodging', 'lodging-ember-hotel', 'rent');
  const furniture = [];
  assert.equal(withPresetFurniture(furniture, layout), furniture, 'the same array is returned');
  assert.equal(furniture.length, layout.presets.length);
  assert.ok(furniture.every(item => item.preset === true));

  const moved = furniture[0];
  moved.x += 0.5; moved.rotation = 1;
  moved.width = 9;
  withPresetFurniture(furniture, layout);
  assert.equal(furniture.length, layout.presets.length, 'seeding again does not duplicate pieces');
  assert.equal(moved.x, layout.presets[0].x + 0.5, 'the saved position wins');
  assert.equal(moved.rotation, 1, 'the saved rotation wins');
  assert.equal(moved.width, layout.presets[0].width, 'the size comes from the layout');
});

test('only pieces the player placed count toward the build limit', () => {
  const layout = getRoomLayout('lodging', 'lodging-ember-hotel', 'owned');
  const furniture = withPresetFurniture([], layout);
  assert.equal(placedFurnitureCount(furniture), 0);
  for (let index = 0; index < ROOM_FURNITURE_LIMIT; index += 1) furniture.push({ id: `placed-${index}`, kind: 'stool', x: 1, y: 1, rotation: 0 });
  assert.equal(placedFurnitureCount(furniture), ROOM_FURNITURE_LIMIT);
  assert.ok(furniture.length <= ROOM_FURNITURE_LIMIT + MAX_ROOM_PRESETS);
  assert.ok(layout.presets.length <= MAX_ROOM_PRESETS);
});

test('the predicted removal of a predefined piece is refused before the server answers', () => {
  const furniture = [{ id: 'preset-0', kind: 'bed', x: 6, y: 6, rotation: 0, preset: true },
    { id: 'chair-1', kind: 'chair', x: 8, y: 8, rotation: 0 }];
  const refused = createRoomFurniturePrediction();
  assert.equal(refused.enqueue(furniture, { name: 'removeFurniture', id: 'preset-0', requestId: 7 }), null);
  assert.equal(refused.pending, null);

  const placed = createRoomFurniturePrediction();
  assert.equal(placed.enqueue(furniture, { name: 'removeFurniture', id: 'chair-1', requestId: 8 }).length, 1,
    'placed pieces still predict their removal');

  const turned = createRoomFurniturePrediction();
  assert.ok(turned.enqueue(furniture, { name: 'rotateFurniture', id: 'preset-0', requestId: 9 }),
    'predefined pieces can still be rotated');
});

test('predefined pieces are recognized only by their preset flag', () => {
  assert.equal(isPresetFurniture({ id: 'preset-0', preset: true }), true);
  assert.equal(isPresetFurniture({ id: 'abcdef01', kind: 'bed' }), false);
  assert.equal(isPresetFurniture(undefined), false);
});
