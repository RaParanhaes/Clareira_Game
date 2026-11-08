const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

export function worldToAudioPosition(x, y, height = 0) {
  const diagonal = Math.SQRT1_2;
  return { x: (x - y) * diagonal, y: height, z: -(x + y) * diagonal };
}

function pointToSegment(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 1e-9
    ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
    : 0;
  return { t, distance: Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t)) };
}

function segmentRectInterval(start, end, bounds) {
  const dx = end.x - start.x, dy = end.y - start.y;
  let enter = 0, leave = 1;
  for (const [origin, delta, lower, upper] of [
    [start.x, dx, bounds.left, bounds.right],
    [start.y, dy, bounds.top, bounds.bottom],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < lower || origin > upper) return null;
      continue;
    }
    let first = (lower - origin) / delta, second = (upper - origin) / delta;
    if (first > second) [first, second] = [second, first];
    enter = Math.max(enter, first);
    leave = Math.min(leave, second);
    if (enter > leave) return null;
  }
  return { enter, leave };
}

function inside(point, bounds) {
  return point.x >= bounds.left && point.x <= bounds.right
    && point.y >= bounds.top && point.y <= bounds.bottom;
}

function pointAt(start, end, t) {
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

/** Estimate obstruction along the straight sound path in world coordinates. */
export function campfirePathOcclusion(start, end, { trees = [], rocks = [], shelter = null, door = null } = {}) {
  if (Math.hypot(end.x - start.x, end.y - start.y) < .2) {
    return { attenuationDb: 0, gain: 1, cutoffMultiplier: 1, blockers: [] };
  }

  let attenuationDb = 0, cutoffMultiplier = 1;
  const blockers = [];
  const addBlocker = (kind, db, cutoff) => {
    attenuationDb += db;
    cutoffMultiplier *= cutoff;
    blockers.push(kind);
  };

  for (const tree of trees) {
    const hit = pointToSegment(tree, start, end);
    const trunkRadius = Number.isFinite(tree.r) ? tree.r : .3;
    if (hit.t > .08 && hit.t < .92 && hit.distance < trunkRadius + .34) {
      addBlocker('tree', 3.8, .72);
    }
  }

  for (const rock of rocks) {
    const hit = pointToSegment(rock, start, end);
    const rockRadius = Number.isFinite(rock.r) ? rock.r : .34;
    if (hit.t > .08 && hit.t < .92 && hit.distance < rockRadius + .28) {
      addBlocker('rock', 5, .62);
    }
  }

  if (shelter && !(inside(start, shelter) && inside(end, shelter))) {
    const hit = segmentRectInterval(start, end, shelter);
    if (hit && hit.leave > .04 && hit.enter < .96) {
      const crossings = [hit.enter, hit.leave].filter(t => t > .04 && t < .96);
      const nearDoor = door && crossings.some(t => {
        const crossing = pointAt(start, end, t);
        return Math.hypot(crossing.x - door.x, crossing.y - door.y) < 1.15;
      });
      // A nearby doorway leaks more sound than a path through the timber walls.
      addBlocker(nearDoor ? 'doorway' : 'shelter', nearDoor ? 3.5 : 10, nearDoor ? .78 : .48);
    }
  }

  attenuationDb = Math.min(20, attenuationDb);
  cutoffMultiplier = Math.max(.24, cutoffMultiplier);
  return {
    attenuationDb,
    gain: 10 ** (-attenuationDb / 20),
    cutoffMultiplier,
    blockers,
  };
}
