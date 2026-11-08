import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceFacingDirection, getFacingFromVector, getFacingIntent } from './avatar.mjs';
import { getWorldInput } from './input.mjs';
import { SOLID_TREES, PLAYER_RADIUS, stepPlayer, WORLD_TILE_X, WORLD_TILE_Y } from './world.mjs';

test('ao deslizar numa árvore, o avatar olha para o deslocamento que a colisão permitiu', async () => {
  const tree = SOLID_TREES[0];
  const start = { x: tree.x - tree.r - PLAYER_RADIUS - .1, y: tree.y - .18 };
  const keyboard = getWorldInput(new Set(['ArrowDown']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  const touch = getWorldInput(new Set(), new Map([[1, [0, 1]]]), WORLD_TILE_X, WORLD_TILE_Y);
  const keyboardEnd = stepPlayer(start, keyboard, 0.05);
  const touchEnd = stepPlayer(start, touch, 0.05);
  const keyboardFacing = getFacingFromVector(
    keyboardEnd.x - start.x, keyboardEnd.y - start.y, WORLD_TILE_X, WORLD_TILE_Y, 'south',
  );
  const touchFacing = getFacingFromVector(
    touchEnd.x - start.x, touchEnd.y - start.y, WORLD_TILE_X, WORLD_TILE_Y, 'south',
  );

  assert.equal(getFacingFromVector(keyboard.x, keyboard.y, WORLD_TILE_X, WORLD_TILE_Y), 'south');
  assert.equal(keyboardEnd.x, touchEnd.x);
  assert.equal(keyboardEnd.y, touchEnd.y);
  assert.ok(keyboardEnd.x > start.x);
  assert.equal(keyboardEnd.y, start.y);
  assert.equal(keyboardFacing, 'southeast');
  assert.equal(touchFacing, 'southeast');
  assert.equal(getFacingFromVector(0, 0, WORLD_TILE_X, WORLD_TILE_Y, keyboardFacing), 'southeast');

  let transition = { facing: 'south', candidate: 'south', elapsed: 0 };
  for (let step = 0; step < 4; step += 1) {
    transition = advanceFacingDirection(transition, {
      ...getFacingIntent(keyboard, keyboardEnd.x - start.x, keyboardEnd.y - start.y, WORLD_TILE_X, WORLD_TILE_Y),
    }, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  }
  assert.equal(transition.facing, 'southeast');

  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const frame = main.match(/function advanceFrame\(now\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(frame, 'o cliente atualiza a orientação no ciclo de movimento');
  const movementAt=frame.indexOf('stepPlayer(previousPosition, input, STEP, occupied, [...fires.values()], undefined, currentWildlifeCollisionBodies()');
  assert.ok(movementAt >= 0);
  const facingAt=frame.indexOf('facingTransition = advanceFacingDirection(');
  assert.ok(movementAt < facingAt);
  assert.match(frame, /getFacingIntent\(input,[\s\S]*localPosition\.x - previousPosition\.x,[\s\S]*localPosition\.y - previousPosition\.y/);
});
