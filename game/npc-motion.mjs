// Village NPC movement. A villager walks with the same stepPlayer physics as a player,
// so trees, houses, the campfire, other players and other NPCs block it the same way.
import { stepPlayer } from './world.mjs';

export const NPC_ARRIVE_DISTANCE = .12;

// Unit direction from one point to another; arrived when already within reach.
export function npcDirectionTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
  if (distance <= NPC_ARRIVE_DISTANCE) return { x: 0, y: 0, arrived: true, distance };
  return { x: dx / distance, y: dy / distance, arrived: false, distance };
}

// One simulation step toward a target. `occupiedPositions` are other bodies (players,
// NPCs) that this NPC must not pass through. Returns the new position and whether the
// NPC was blocked this step (it pushed against something and did not move).
export function stepNpcTowards(npc, target, deltaSeconds, occupiedPositions = [], fires = [], nowMs = 0) {
  const direction = npcDirectionTo(npc.position, target);
  if (direction.arrived) return { position: npc.position, arrived: true, blocked: false };
  const next = stepPlayer(npc.position, { x: direction.x, y: direction.y }, deltaSeconds, occupiedPositions, fires, nowMs, [], {});
  const moved = Math.hypot(next.x - npc.position.x, next.y - npc.position.y);
  return { position: next, arrived: false, blocked: moved < 1e-4 };
}

// Walks a route of points in order. Returns the new position, the index of the next
// point, and whether the whole route is finished.
export function stepNpcRoute(npc, route, deltaSeconds, occupiedPositions = [], fires = [], nowMs = 0) {
  let index = npc.routeIndex ?? 0;
  while (index < route.length && npcDirectionTo(npc.position, route[index]).arrived) index += 1;
  if (index >= route.length) return { position: npc.position, routeIndex: index, done: true, blocked: false };
  const step = stepNpcTowards(npc, route[index], deltaSeconds, occupiedPositions, fires, nowMs);
  return { position: step.position, routeIndex: index, done: false, blocked: step.blocked };
}
