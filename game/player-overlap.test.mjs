import test from 'node:test';
import assert from 'node:assert/strict';
import { SPAWN, stepPlayer, stepRoomPlayer, getRoomLayout } from './world.mjs';
for (const location of ['clearing','room']) {
  test(`${location}: overlapping actors can walk apart after reconciliation without crossing others`, () => {
    const layout = getRoomLayout('lobby', 'arrival');
    const start = location === 'clearing' ? {...SPAWN} : {...layout.spawn};
    const other = {x:start.x+.08, y:start.y};
    const step = (position, input, occupied) => location === 'clearing'
      ? stepPlayer(position, input, 1/60, occupied)
      : stepRoomPlayer(position, input, 1/60, occupied, [], layout);
    const away = step(start, {motion:true,run:true,x:-1,y:0}, [other]);
    assert.ok(away.x < start.x, 'can escape an existing overlap');
    const into = step(start, {motion:true,run:true,x:1,y:0}, [other]);
    assert.equal(into.x, start.x, 'cannot deepen the overlap');
  });
}
