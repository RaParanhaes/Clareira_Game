// A building keeps one stable depth in the world sort. Moving this anchor with
// the player also moves the building relative to nearby trees, making trees
// jump between the foreground and background as the camera follows the player.
export function buildingStaticDepthAnchor(bounds) {
  return { sortX: bounds.right, sortY: bounds.bottom };
}

// Exterior architecture is a single cached layer; anchor it just behind the
// entrance plane, while the porch posts themselves use their own footprints.
export function buildingRenderDepthAnchor(building) {
  return { sortX: building.door.x, sortY: building.bounds.bottom - 0.45 };
}

// Sort a vertical porch column from its frontmost ground corner. Its height
// must not affect ordering against actors on the same floor.
export function buildingPostDepthAnchor(post) {
  return { sortX: (post.left + post.right) / 2, sortY: post.bottom };
}

// Draw the porch cover after both column heads so its fascia caps the joint.
export function buildingCanopyDepthAnchor(canopy) {
  return { sortX: canopy.right, sortY: canopy.bottom };
}

// A rear tree can have a trunk depth that falls inside the cabin footprint.
// Keep it behind the back roof line so the whole animated canopy stays behind
// the cabin while the camera and player move around it.
export function buildingTreeDepthAnchor(tree, bounds, margin = 0.02) {
  const radius = Number.isFinite(tree.r) ? tree.r : 0;
  const behindRearEdge = tree.y + radius < bounds.top
    && tree.x >= bounds.left - radius
    && tree.x <= bounds.right + radius;
  if (behindRearEdge) {
    const rearRoofDepth = bounds.left + bounds.top - margin;
    return { sortX: tree.x, sortY: rearRoofDepth - tree.x };
  }

  // A tree just beyond the cabin's right corner can have a front-facing trunk
  // while its wind-swaying crown crosses the roof. Keep that crown behind the
  // cabin so its layer does not appear to change as the camera follows players.
  const houseFrontDepth = bounds.right + bounds.bottom;
  const treeDepth = tree.x + tree.y;
  const rightFacadeScreenX = bounds.right - bounds.top;
  const treeScreenX = tree.x - tree.y;
  const overlapsRightFacade = Math.abs(treeScreenX - rightFacadeScreenX) <= 1.6
    && treeDepth >= houseFrontDepth
    && treeDepth <= houseFrontDepth + 5.5;
  if (!overlapsRightFacade) return null;

  const behindCabinDepth = houseFrontDepth - margin;
  return { sortX: tree.x, sortY: behindCabinDepth - tree.x };
}

// Sort an avatar in front of the house when it is standing outside the front
// or right wall. The house itself stays fixed, so this cannot reorder trees.
export function buildingAvatarDepthAnchor(position, bounds, margin = 1.4, tieBreak = 0.02, minimumDepth = bounds.right + bounds.bottom) {
  const nearFront = position.x >= bounds.left - margin && position.x <= bounds.right + margin
    && position.y >= bounds.bottom;
  const nearRightWall = position.x >= bounds.right && position.x <= bounds.right + margin
    && position.y >= bounds.top - margin && position.y <= bounds.bottom + margin;
  if (!nearFront && !nearRightWall) return null;

  const houseDepth = minimumDepth;
  const avatarDepth = position.x + position.y;
  if (avatarDepth > houseDepth + tieBreak) return null;
  return { sortX: position.x, sortY: position.y + houseDepth + tieBreak - avatarDepth };
}

// Exterior walls use a door-plane anchor, while each porch post has its own
// depth. Raising an actor to the far corner of the entire house incorrectly
// pulled it in front of both posts even while standing behind the porch.
export function buildingExteriorAvatarDepthAnchor(position, building) {
  const facade=buildingRenderDepthAnchor(building);
  return buildingAvatarDepthAnchor(position,building.bounds,1.4,.02,facade.sortX+facade.sortY);
}
