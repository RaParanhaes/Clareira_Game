// Keeps the live positions of the village NPCs on the server. Each walker follows its
// route on a loop and is blocked by other bodies through the same physics as players.
import { stepNpcRoute } from './npc-motion.mjs';

// Builds one walker per villager. `routeFor(id, spot)` returns the points that villager
// walks in a loop, starting from its daytime spot.
export function createVillageNpcWalkers(roster, routeFor) {
  const walkers = new Map();
  for (const npc of roster) {
    const route = routeFor(npc.id, { x: npc.x, y: npc.y });
    walkers.set(npc.id, { route, routeIndex: 0, position: { x: route[0].x, y: route[0].y, z: 0, vx: 0, vy: 0 } });
  }
  return {
    // Advances every walker one step. A finished route starts again from its first point.
    tick(deltaSeconds, occupiedPositions = [], nowMs = 0) {
      for (const walker of walkers.values()) {
        const others = occupiedPositions.filter(other => other !== walker.position);
        const step = stepNpcRoute(walker, walker.route, deltaSeconds, others, [], nowMs);
        walker.position = step.position;
        walker.routeIndex = step.routeIndex;
        if (step.done) walker.routeIndex = 0;
      }
    },
    // Current position of every walker, by villager id.
    positions() {
      return new Map([...walkers].map(([id, walker]) => [id, walker.position]));
    },
    // Positions of every walker as bodies for the player collision lists.
    bodies() {
      return [...walkers.values()].map(walker => walker.position);
    },
  };
}
