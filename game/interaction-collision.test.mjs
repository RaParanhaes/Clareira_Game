import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRE_RADIUS } from './obstacle-collision.mjs';
import {
  canOccupy, CLEARING_DOOR, findWalkPath, PLAYER_RADIUS, RESOURCE_NODES, SHELTER_BOUNDS, SHELTER_WALL_CLEARANCE, SOLID_TREES, SPAWN_CAMPFIRE, hasClearInteractionPath,
} from './world.mjs';

test('interaction reaches a tree itself but cannot pass through it to a second target or entity', () => {
  const tree = SOLID_TREES[2];
  const nearSide = { x: tree.x - 0.62, y: tree.y };
  const farSide = { x: tree.x + 0.55, y: tree.y };

  assert.equal(hasClearInteractionPath(nearSide, tree, { targetRadius: tree.r }), true);
  assert.equal(hasClearInteractionPath(nearSide, farSide, { targetRadius: PLAYER_RADIUS }), false);
});

test('the cabin door stays usable while its solid back wall blocks interaction', () => {
  const approach = { x: CLEARING_DOOR.x, y: SHELTER_BOUNDS.bottom + 1 };
  const insideBehindWall = { x: CLEARING_DOOR.x, y: SHELTER_BOUNDS.top + 0.3 };

  assert.equal(hasClearInteractionPath(approach, CLEARING_DOOR), true);
  assert.equal(hasClearInteractionPath(
    { x: CLEARING_DOOR.x, y: SHELTER_BOUNDS.top - 0.5 }, insideBehindWall,
  ), false);
});

test('click navigation can leave a valid start inside the path safety margin', () => {
  const start = {
    x: SHELTER_BOUNDS.right + PLAYER_RADIUS + SHELTER_WALL_CLEARANCE + 0.001,
    y: SPAWN_CAMPFIRE.y + 0.4,
  };
  const tree = SOLID_TREES[6];
  const approach = { x: tree.x, y: tree.y + 0.9 };

  assert.equal(canOccupy(start), true);
  const path = findWalkPath(start, approach, [], 'clearing', [], [SPAWN_CAMPFIRE]);
  assert.ok(path.length > 0, 'the path escapes the rounded start cell and routes around the fire');
});

test('room furniture blocks reaching a second object but not the targeted bench', () => {
  const bench = { id: 'bench-1', kind: 'stool', x: 7.5, y: 8 };
  const start = { x: 7.5, y: 9.2 };
  const otherSide = { x: 7.5, y: 7.1 };

  assert.equal(hasClearInteractionPath(start, otherSide, { location: 'room', furniture: [bench] }), false);
  assert.equal(hasClearInteractionPath({ x: 7.5, y: 8.8 }, bench, {
    location: 'room', targetRadius: 0.38,
  }), true);
});

test('social reach can cross the low campfire while movement and object use remain blocked by it', () => {
  const from = { x: SPAWN_CAMPFIRE.x - 1, y: SPAWN_CAMPFIRE.y };
  const to = { x: SPAWN_CAMPFIRE.x + 1, y: SPAWN_CAMPFIRE.y };

  assert.equal(hasClearInteractionPath(from, to, { fires: [SPAWN_CAMPFIRE] }), false);
  assert.equal(hasClearInteractionPath(from, to, { fires: [SPAWN_CAMPFIRE], ignoreFires: true }), true);
});

test('a resource beside the campfire can be collected from a safe reachable edge', () => {
  const resource = RESOURCE_NODES.reduce((nearest,node)=>
    Math.hypot(node.x-SPAWN_CAMPFIRE.x,node.y-SPAWN_CAMPFIRE.y)
      < Math.hypot(nearest.x-SPAWN_CAMPFIRE.x,nearest.y-SPAWN_CAMPFIRE.y)?node:nearest);
  const offset = { x: resource.x - SPAWN_CAMPFIRE.x, y: resource.y - SPAWN_CAMPFIRE.y };
  const distance = Math.hypot(offset.x, offset.y);
  const direction = { x: offset.x / distance, y: offset.y / distance };
  const from = {
    x: SPAWN_CAMPFIRE.x + direction.x * (FIRE_RADIUS + PLAYER_RADIUS + 0.02),
    y: SPAWN_CAMPFIRE.y + direction.y * (FIRE_RADIUS + PLAYER_RADIUS + 0.02),
  };

  assert.ok(Math.hypot(from.x - SPAWN_CAMPFIRE.x, from.y - SPAWN_CAMPFIRE.y) > FIRE_RADIUS + PLAYER_RADIUS);
  assert.equal(canOccupy(from), true);
  assert.ok(Math.hypot(from.x - resource.x, from.y - resource.y) < 1.2);
  assert.ok(distance < FIRE_RADIUS + PLAYER_RADIUS + 1.2,
    'the closest resource is reachable from outside the fire collider');
  assert.equal(hasClearInteractionPath(from, resource, { fires: [SPAWN_CAMPFIRE] }), true);
});
