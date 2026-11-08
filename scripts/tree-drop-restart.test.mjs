import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonWorldStore } from './world-store.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

test('collected tree drops stay gone after regrowth and server restart; natural resources return', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-tree-cycle-'));
  const worlds = createJsonWorldStore(directory);
  let room;
  t.after(async () => { if (room) await room.close(); await rm(directory, { recursive:true, force:true }); });
  const initial = await worlds.loadWorld('surface');
  const expired = Date.now() - 1000;
  const resource = (id, kind, extra = {}) => ({ id, type:'resource', resourceKind:kind, x:100, y:100, ...extra });
  const cooldown = (id, targetId) => ({ id, type:'resource-cooldown', targetId,
    sourceId:`map-${targetId}`, readyAt:expired, x:100, y:100 });
  const edits = [
    resource('tree-drop-apples-old', 'apples', { quantity:3, respawnAt:expired }),
    cooldown('cooldown-old-tree', 'tree-drop-apples-old'),
    resource('natural-wood-test', 'wood'), cooldown('cooldown-natural-test', 'natural-wood-test'),
    // The old cooldown must never erase a newer felling at the same tree.
    resource('tree-drop-apples-new', 'apples', { quantity:3, respawnAt:expired + 60_000 }),
    cooldown('cooldown-older-felling', 'tree-drop-apples-new'),
  ];
  await worlds.saveWorld({ ...initial, revision:1, edits }, 0, 'surface');
  const start = async () => {
    room = createPrototypeServer({ port:0, stateDirectory:directory, ambientCampfire:false,
      arrivalTutorialEnabled:false });
    await room.listen();
  };
  await start();
  let saved;
  const deadline = Date.now() + 5000;
  do {
    await new Promise(resolve => setTimeout(resolve, 25));
    saved = await worlds.loadWorld('surface');
  } while (saved.edits.some(edit => edit.type === 'resource-cooldown') && Date.now() < deadline);
  assert.equal(saved.edits.some(edit => edit.type === 'resource-cooldown'), false, 'expired cooldowns are processed');
  assert.equal(saved.edits.some(edit => edit.id === 'tree-drop-apples-old'), false, 'collected drop is removed');
  assert.equal(saved.edits.some(edit => edit.id === 'natural-wood-test'), true, 'natural resource remains renewable');
  assert.equal(saved.edits.some(edit => edit.id === 'tree-drop-apples-new'), true, 'new felling survives an older cooldown');
  await room.close();
  room = null;
  await start();
  const restarted = await worlds.loadWorld('surface');
  assert.equal(restarted.edits.some(edit => edit.id === 'tree-drop-apples-old'), false, 'restart cannot restore the collected drop');
  assert.equal(restarted.edits.some(edit => edit.id === 'natural-wood-test'), true);
  assert.equal(restarted.edits.some(edit => edit.id === 'tree-drop-apples-new'), true);
});
