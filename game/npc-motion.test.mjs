import test from 'node:test';
import assert from 'node:assert/strict';
import { stepNpcTowards, stepNpcRoute, npcDirectionTo } from './npc-motion.mjs';
import { PLAYER_RADIUS } from './world.mjs';

const START = { x: 88.2, y: 92.3 };
const npcAt = (x, y) => ({ position: { x, y, z: 0, vx: 0, vy: 0 } });

test('a villager walks to a target on open ground with the player physics', () => {
  let npc = npcAt(START.x, START.y);
  const target = { x: START.x + 2, y: START.y };
  for (let i = 0; i < 40 && !npcDirectionTo(npc.position, target).arrived; i++) {
    const step = stepNpcTowards(npc, target, .1);
    npc = { position: step.position };
  }
  assert.ok(npcDirectionTo(npc.position, target).arrived, 'the villager reaches the target');
});

test('another body on the path blocks the villager: it never overlaps that body', () => {
  let npc = npcAt(START.x, START.y);
  const blocker = { x: START.x + 1, y: START.y };
  const target = { x: START.x + 2, y: START.y };
  for (let i = 0; i < 80; i++) {
    const step = stepNpcTowards(npc, target, .05, [blocker]);
    npc = { position: step.position };
    const gap = Math.hypot(npc.position.x - blocker.x, npc.position.y - blocker.y);
    assert.ok(gap >= PLAYER_RADIUS * 2 - .02, `step ${i}: gap ${gap.toFixed(3)} keeps bodies apart`);
  }
});

test('a route is walked point by point, in order', () => {
  const route = [{ x: START.x + 1, y: START.y }, { x: START.x + 1, y: START.y + 1 }];
  let npc = { ...npcAt(START.x, START.y), routeIndex: 0 };
  let done = false;
  for (let i = 0; i < 400 && !done; i++) {
    const step = stepNpcRoute(npc, route, .1, []);
    npc = { position: step.position, routeIndex: step.routeIndex };
    done = step.done;
  }
  assert.ok(done, 'the whole route is finished');
  assert.ok(npcDirectionTo(npc.position, route[1]).arrived, 'the last point is reached');
});

test('an NPC already on its target stays put and reports arrival', () => {
  const npc = npcAt(START.x, START.y);
  const step = stepNpcTowards(npc, { x: START.x, y: START.y }, .1);
  assert.equal(step.arrived, true);
  assert.equal(step.position, npc.position);
});
