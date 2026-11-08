import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLEARING_DOOR, PLAYER_RADIUS, SHELTER_BOUNDS, SHELTER_WALL_CLEARANCE, SOLID_TREES, canOccupy, findNearbyPosition, hasClearInteractionPath, stepPlayer,
} from './world.mjs';
import { buildingAvatarDepthAnchor, buildingExteriorAvatarDepthAnchor, buildingCanopyDepthAnchor, buildingPostDepthAnchor, buildingRenderDepthAnchor, buildingStaticDepthAnchor, buildingTreeDepthAnchor } from './building-depth.mjs';
import { decayRenderCorrection, renderCorrectionOffset } from './prediction.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING } from './village-buildings.mjs';
import { buildingArchitecture } from './architectural-elements.mjs';

const shelterClearance = PLAYER_RADIUS + SHELTER_WALL_CLEARANCE;

test('the front wall blocks the player while leaving a walkable door approach', () => {
  const doorApproach = { x: CLEARING_DOOR.x, y: SHELTER_BOUNDS.bottom + shelterClearance + .08 };
  assert.equal(canOccupy(doorApproach), true);
  assert.equal(canOccupy({ x: CLEARING_DOOR.x, y: SHELTER_BOUNDS.bottom + shelterClearance - .02 }), false);

  let position = { x: CLEARING_DOOR.x, y: SHELTER_BOUNDS.bottom + .9 };
  let largestStep = 0;
  for (let frame = 0; frame < 180; frame += 1) {
    const previous = position;
    position = stepPlayer(position, { x: 0, y: -1 }, 1 / 60);
    largestStep = Math.max(largestStep, Math.hypot(position.x - previous.x, position.y - previous.y));
    assert.equal(canOccupy(position), true, 'the player remains outside the shelter collider');
  }
  assert.ok(position.y >= SHELTER_BOUNDS.bottom + shelterClearance - .01);
  assert.ok(largestStep <= .06, 'fixed steps cannot tunnel through the facade');
});

test('village door openings match their visible width and block the adjacent facade', () => {
  for (const building of VILLAGE_BUILDINGS) {
    const { bounds, door } = building;
    const visualMargin = PLAYER_RADIUS + .35;
    assert.equal(canOccupy({ x: door.x, y: bounds.bottom + .2 }), false,
      `${building.name}: the doorway cannot pull the avatar into the facade`);
    assert.equal(canOccupy({ x: door.x, y: bounds.bottom + visualMargin - .01 }), false,
      `${building.name}: the avatar remains outside the full facade margin`);
    const threshold = { x: door.x, y: bounds.bottom + visualMargin + .01 };
    assert.equal(canOccupy(threshold), true, `${building.name}: the safe exterior threshold stays walkable`);
    assert.ok(Math.hypot(threshold.x - door.x, threshold.y - door.y) <= 1.2,
      `${building.name}: the door remains within interaction reach from the safe threshold`);
    assert.equal(hasClearInteractionPath(threshold, door), true,
      `${building.name}: the door remains visible and usable from the safe threshold`);
  }
});

test('a saved position in the doorway margin restores outside the facade', () => {
  for (const building of VILLAGE_BUILDINGS) {
    const legacy = { x: building.door.x, y: building.bounds.bottom + .2 };
    assert.equal(canOccupy(legacy), false, `${building.name}: an old door-overlap position is invalid`);
    const restored = findNearbyPosition(legacy);
    assert.ok(restored, `${building.name}: an old position can be recovered`);
    assert.equal(canOccupy(restored), true, `${building.name}: recovery chooses a walkable position`);
    assert.ok(restored.y >= building.bounds.bottom + PLAYER_RADIUS + .35,
      `${building.name}: recovery places the avatar beyond the facade's visual margin`);
    assert.equal(hasClearInteractionPath(restored, building.door), true,
      `${building.name}: recovery keeps the door usable`);
  }
});

test('each village side wall keeps the full avatar sprite clear of the facade', () => {
  const visualClearance = PLAYER_RADIUS + .35;
  for (const building of VILLAGE_BUILDINGS) {
    const { bounds } = building;
    const side = { x: bounds.right + visualClearance, y: (bounds.top + bounds.bottom) / 2 };
    assert.equal(canOccupy({ ...side, x: side.x - .01 }), false,
      `${building.name}: avatar footprint stops before touching the side facade`);
    assert.equal(canOccupy({ ...side, x: side.x + .01 }), true,
      `${building.name}: the path remains walkable beyond the visible wall`);
  }
});

test('porch posts keep the full avatar sprite clear while leaving the doorway open', () => {
  const visualClearance = PLAYER_RADIUS + .1;
  for (const building of VILLAGE_BUILDINGS) {
    for (const post of buildingArchitecture(building).posts) {
      const y = (post.top + post.bottom) / 2;
      const outside = post.left - visualClearance;
      assert.equal(canOccupy({ x: outside - .01, y }), true,
        `${building.name}: the path remains walkable beside the post`);
      assert.equal(canOccupy({ x: outside + .01, y }), false,
        `${building.name}: the sprite footprint stays clear of the post`);
    }
    assert.equal(canOccupy({ x: building.door.x, y: building.bounds.bottom + .75 }), true,
      `${building.name}: the center of the entrance stays clear`);
  }
});

test('walking toward a village door stays outside, remains interactable, and recovers legacy positions inside', () => {
  for (const building of VILLAGE_BUILDINGS) {
    const { bounds, door } = building;
    let position = { x: door.x, y: bounds.bottom + 1.5 };
    for (let frame = 0; frame < 180; frame += 1) {
      position = stepPlayer(position, { x: 0, y: -1 }, 1 / 60);
      assert.equal(canOccupy(position), true, `${building.name}: the player stays on a walkable surface`);
      assert.ok(position.y >= bounds.bottom, `${building.name}: walking cannot cross the facade`);
    }
    assert.ok(Math.hypot(position.x - door.x, position.y - door.y) <= 1.2,
      `${building.name}: the exterior threshold stays within interaction reach`);
    assert.equal(hasClearInteractionPath(position, door), true,
      `${building.name}: the exterior door remains usable with E`);

    const legacyPosition = { x: door.x, y: bounds.bottom - .02 };
    assert.equal(canOccupy(legacyPosition), false, `${building.name}: legacy positions inside the house are blocked`);
    const recovered = stepPlayer(legacyPosition, { x: 0, y: 1 }, 1 / 60);
    assert.equal(canOccupy(recovered), true, `${building.name}: an embedded player can recover and move again`);
  }
});

test('saved positions in the exterior wall clearance recover instead of locking movement', () => {
  for (const building of VILLAGE_BUILDINGS) {
    const { bounds } = building;
    for (const side of [-1, 1]) {
      const legacyPosition = { x: (side < 0 ? bounds.left : bounds.right) + side * (PLAYER_RADIUS + .2),
        y: (bounds.top + bounds.bottom) / 2 };
      assert.equal(canOccupy(legacyPosition), false, `${building.name}: old side clearance overlaps the new collider`);
      const recovered = stepPlayer(legacyPosition, { x: side, y: 0, motion: true }, 1 / 60);
      assert.equal(canOccupy(recovered), true, `${building.name}: the exterior collision margin cannot trap the player`);
      assert.ok(Math.hypot(recovered.x - legacyPosition.x, recovered.y - legacyPosition.y) < 1,
        `${building.name}: recovery stays beside the original wall`);
      const moved = stepPlayer(recovered, { x: side, y: 0, motion: true }, 1 / 60);
      assert.ok(Math.hypot(moved.x - recovered.x, moved.y - recovered.y) > 0,
        `${building.name}: movement continues after recovery`);
    }
  }
});

test('the right wall blocks a direct push and the avatar keeps a visual clearance', () => {
  let position = {
    x: SHELTER_BOUNDS.right + .9,
    // Keep this side-wall approach clear of the nearby spawn campfire.
    y: SHELTER_BOUNDS.top + 1,
  };
  for (let frame = 0; frame < 180; frame += 1) {
    position = stepPlayer(position, { x: -1, y: 0 }, 1 / 60);
    assert.equal(canOccupy(position), true, 'the player remains outside the shelter collider');
  }
  assert.ok(position.x >= SHELTER_BOUNDS.right + shelterClearance - .01);
  assert.ok(position.y > SHELTER_BOUNDS.top && position.y < SHELTER_BOUNDS.bottom);
});

test('diagonal pressure at all four corners never enters the house clearance', () => {
  const reach = PLAYER_RADIUS + SHELTER_WALL_CLEARANCE;
  const cases = [
    { name: 'front-left', start: { x: SHELTER_BOUNDS.left - reach - .5, y: SHELTER_BOUNDS.bottom + reach + .5 }, input: { x: 1, y: -1 } },
    { name: 'front-right', start: { x: SHELTER_BOUNDS.right + reach + .5, y: SHELTER_BOUNDS.bottom + reach + .5 }, input: { x: -1, y: -1 } },
    { name: 'back-left', start: { x: SHELTER_BOUNDS.left - reach - .5, y: SHELTER_BOUNDS.top - reach - .5 }, input: { x: 1, y: 1 } },
    { name: 'back-right', start: { x: SHELTER_BOUNDS.right + reach + .5, y: SHELTER_BOUNDS.top - reach - .5 }, input: { x: -1, y: 1 } },
  ];

  for (const corner of cases) {
    let position = corner.start;
    for (let frame = 0; frame < 60; frame += 1) {
      position = stepPlayer(position, corner.input, 1 / 60);
      assert.equal(canOccupy(position), true, `${corner.name}: player remains outside the collider`);
      const withinClearance = position.x > SHELTER_BOUNDS.left - reach
        && position.x < SHELTER_BOUNDS.right + reach
        && position.y > SHELTER_BOUNDS.top - reach
        && position.y < SHELTER_BOUNDS.bottom + reach;
      assert.equal(withinClearance, false, `${corner.name}: diagonal pressure must not cross the corner`);
    }
  }
});

test('house depth stays fixed while avatars sort in front of the visible walls', () => {
  const bounds = SHELTER_BOUNDS;
  const house = buildingStaticDepthAnchor(bounds);
  const houseDepth = house.sortX + house.sortY;
  const rearTree = { x: bounds.left + .3, y: bounds.top - .4 };
  const foregroundTree = { x: bounds.right + .8, y: bounds.bottom + .3 };
  assert.ok(rearTree.x + rearTree.y < houseDepth, 'a tree behind the house sorts behind it');
  assert.ok(foregroundTree.x + foregroundTree.y > houseDepth, 'a tree in front of the house sorts in front');

  for (const position of [
    { x: bounds.left + .2, y: bounds.bottom + .8 },
    { x: bounds.right - .2, y: bounds.bottom + .8 },
    { x: bounds.right + .3, y: (bounds.top + bounds.bottom) / 2 },
  ]) {
    const avatar = buildingAvatarDepthAnchor(position, bounds);
    const avatarDepth = avatar ? avatar.sortX + avatar.sortY : position.x + position.y;
    assert.ok(avatarDepth > houseDepth, 'avatars outside the front or right wall render over the facade');
    assert.ok(rearTree.x + rearTree.y < houseDepth, 'moving the avatar cannot move the tree across the house');
  }

  for (const position of [
    { x: bounds.left - .4, y: (bounds.top + bounds.bottom) / 2 },
    { x: (bounds.left + bounds.right) / 2, y: bounds.top - .4 },
  ]) assert.equal(buildingAvatarDepthAnchor(position, bounds), null, 'avatars behind the house keep their natural depth');
});

test('the authored tree beside the cabin stays behind its footprint and draw depth', () => {
  const bounds = SHELTER_BOUNDS;
  const tree = SOLID_TREES.find(candidate => candidate.id === 'authored:4');
  assert.ok(tree, 'the rear cabin tree remains part of the authored grove');
  assert.ok(tree.y + tree.r + SHELTER_WALL_CLEARANCE < bounds.top,
    'the tree trunk remains outside the cabin footprint');

  const house = buildingStaticDepthAnchor(bounds);
  const houseDepth = house.sortX + house.sortY;
  const rearTree = buildingTreeDepthAnchor(tree, bounds);
  assert.ok(rearTree, 'the rear canopy receives a fixed depth behind the cabin');
  const treeDepth = rearTree.sortX + rearTree.sortY;
  assert.ok(treeDepth < bounds.left + bounds.top,
    'the canopy stays behind the back roof line, not only behind the cabin front');
  assert.ok(treeDepth < houseDepth, 'the tree is drawn before the cabin');

  for (const player of [
    { x: bounds.left + .2, y: bounds.bottom + .8 },
    { x: bounds.right - .2, y: bounds.bottom + .8 },
    { x: bounds.right + .3, y: (bounds.top + bounds.bottom) / 2 },
  ]) {
    const avatar = buildingAvatarDepthAnchor(player, bounds);
    const avatarDepth = avatar ? avatar.sortX + avatar.sortY : player.x + player.y;
    assert.ok(treeDepth < houseDepth && houseDepth < avatarDepth,
      'walking around the cabin cannot bring the rear tree in front of it');
  }

  const foregroundTree = { x: bounds.right + .8, y: bounds.bottom + .3, r: .3 };
  assert.equal(buildingTreeDepthAnchor(foregroundTree, bounds), null,
    'a tree in front of the cabin keeps its natural depth');
});

test('a wind-swaying tree beyond the right corner stays behind the cabin roof', () => {
  const bounds = SHELTER_BOUNDS;
  const houseDepth = buildingStaticDepthAnchor(bounds).sortX + buildingStaticDepthAnchor(bounds).sortY;
  const tree = { x: bounds.right + 6.8, y: bounds.bottom - 1.85, r: .3 };
  const anchor = buildingTreeDepthAnchor(tree, bounds);

  assert.ok(anchor, 'the canopy overlaps the projected right roof edge');
  assert.equal(anchor.sortX + anchor.sortY, houseDepth - .02,
    'the nearby canopy is consistently drawn just behind the cabin');

  const clearForegroundTree = { x: bounds.right + .8, y: bounds.bottom + .3, r: .3 };
  assert.equal(buildingTreeDepthAnchor(clearForegroundTree, bounds), null,
    'trees clearly in front of the facade retain their natural depth');
});

test('authoritative corrections preserve the visible position and fade smoothly', () => {
  const visible = { x: 83.1, y: 95.8 };
  const corrected = { x: 82.6, y: 95.5 };
  const offset = renderCorrectionOffset(visible, corrected);
  assert.ok(Math.abs(corrected.x + offset.x - visible.x) < 1e-9);
  assert.ok(Math.abs(corrected.y + offset.y - visible.y) < 1e-9);

  const afterOneFade = decayRenderCorrection(offset, 0.14);
  assert.ok(Math.hypot(afterOneFade.x, afterOneFade.y) < Math.hypot(offset.x, offset.y));
  const afterSettling = decayRenderCorrection(afterOneFade, 0.1);
  assert.ok(Math.hypot(afterSettling.x, afterSettling.y) < Math.hypot(afterOneFade.x, afterOneFade.y));
});

// Every exterior needs the same facade ordering as the original reception.
test('exterior avatars remain ahead of the rendered front and side facades', () => {
  for (const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]) {
    const {id,bounds}=building;
    const depth=buildingRenderDepthAnchor(building);
    for(const position of [
      {x:bounds.left+.6,y:bounds.bottom+.4},
      {x:bounds.right+.4,y:bounds.top+.6},
    ]) {
      const anchor=buildingAvatarDepthAnchor(position,bounds);
      const actual=anchor||{sortX:position.x,sortY:position.y};
      assert.ok(actual.sortX+actual.sortY>depth.sortX+depth.sortY,id);
    }
    assert.equal(buildingAvatarDepthAnchor({x:bounds.left+.5,y:bounds.top-.5},bounds),null);
  }
});

test('facades and porch posts switch depth against an avatar as it passes the threshold', () => {
  for (const building of VILLAGE_BUILDINGS) {
    const facade = buildingRenderDepthAnchor(building);
    const post = buildingArchitecture(building).posts.find(item => item.left > building.door.x);
    const column = buildingPostDepthAnchor(post);
    const actorFromY = y => building.door.x + y;
    assert.ok(facade.sortX + facade.sortY < actorFromY(building.bounds.bottom + .1),
      `${building.name}: the approaching avatar draws in front of the facade`);
    assert.ok(column.sortX + column.sortY > actorFromY(building.bounds.bottom + .1),
      `${building.name}: the column draws in front while the avatar is behind it`);
    assert.ok(column.sortX + column.sortY < actorFromY(building.bounds.bottom + 2.1),
      `${building.name}: the avatar draws in front after passing the column`);
  }
});

test('porch covers draw over both pilaster heads to close their top seams', () => {
  for (const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]) {
    const architecture=buildingArchitecture(building),canopy=architecture.canopy;
    if(!canopy||!architecture.posts.length)continue;
    const cover=buildingCanopyDepthAnchor(canopy),coverDepth=cover.sortX+cover.sortY;
    for(const post of architecture.posts){
      const column=buildingPostDepthAnchor(post);
      assert.ok(coverDepth>column.sortX+column.sortY,`${building.name}: canopy caps the pilaster head`);
    }
  }
});

test('the live exterior actor anchor preserves passage behind and ahead of each porch post',()=>{
  const depth=thing=>(thing.sortX??thing.x)+(thing.sortY??thing.y);
  for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
    const facade=buildingRenderDepthAnchor(building);
    for(const post of buildingArchitecture(building).posts){
      const x=(post.left+post.right)/2,column=buildingPostDepthAnchor(post);
      const behind={x,y:post.top-.35},ahead={x,y:post.bottom+.35};
      const anchor=position=>buildingExteriorAvatarDepthAnchor(position,building)||position;
      assert.ok(depth(anchor(behind))>depth(facade),`${building.id}: actor stays in front of the wall`);
      assert.ok(depth(anchor(behind))<depth(column),`${building.id}: actor can be occluded by a post`);
      assert.ok(depth(anchor(ahead))>depth(column),`${building.id}: actor appears ahead of a passed post`);
    }
  }
});
