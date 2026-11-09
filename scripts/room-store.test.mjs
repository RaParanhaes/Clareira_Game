import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAccountRoom, saveAccountRoom } from './room-store.mjs';
import { canPlaceRoomFurniture, getRoomLayout, roomFurnitureSupport, ROOM_FURNITURE_LIMIT } from '../game/world.mjs';
import { withPresetFurniture } from '../game/room-presets.mjs';

test('account room furniture is versioned, private, and survives a server restart', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-account-room-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const accountId = '021ea54b-c917-4bda-9ba4-9f1a40e9d68b';
  const furniture = [{ id: 'abc123ef', kind: 'stool', x: 6, y: 8, rotation: 2 }];

  assert.deepEqual(await loadAccountRoom(directory, accountId), []);
  await saveAccountRoom(directory, accountId, furniture);
  assert.deepEqual(await loadAccountRoom(directory, accountId), furniture);

  const files = await readdir(path.join(directory, 'rooms'));
  assert.equal(files.length, 1);
  assert.equal((await stat(path.join(directory, 'rooms'))).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(directory, 'rooms', files[0]))).mode & 0o777, 0o600);
  await assert.rejects(saveAccountRoom(directory, accountId, [{ ...furniture[0], rotation: 4 }]), /Invalid room furniture/);
  assert.deepEqual(await loadAccountRoom(directory, accountId), furniture, 'invalid data cannot replace the last good save');
});

test('stacked room furniture preserves its support and height in the private save',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'clareira-stacked-room-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const accountId='021ea54b-c917-4bda-9ba4-9f1a40e9d68b';
  const table={id:'abc123ef',kind:'table',x:10,y:10,rotation:0};
  const plant={id:'abc123f0',kind:'plant',x:10,y:10,rotation:0};
  Object.assign(plant,roomFurnitureSupport(plant,[table]));
  assert.equal(plant.supportId,table.id);assert.equal(plant.baseZ,1.5);
  const furniture=[table,plant];
  await saveAccountRoom(directory,accountId,furniture);
  assert.deepEqual(await loadAccountRoom(directory,accountId),furniture);
  await assert.rejects(saveAccountRoom(directory,accountId,[table,{...plant,baseZ:2}]),/Invalid room furniture/);
});

test('predefined room furniture keeps its flag after a save, and the build limit counts only placed pieces', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preset-room-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const accountId = '021ea54b-c917-4bda-9ba4-9f1a40e9d68c';
  const layout = getRoomLayout('lodging', 'lodging-ember-hotel', 'rent');
  const presets = withPresetFurniture([], layout);
  // Pick distinct free spots with the same rule the server uses, so each save is a valid room.
  const spots = [];
  for (let y = 6; y <= 10.5 && spots.length < ROOM_FURNITURE_LIMIT + 1; y += .5) {
    for (let x = 4.5; x <= 11.5 && spots.length < ROOM_FURNITURE_LIMIT + 1; x += .5) {
      const candidate = { id: `a1b2c3d4${String(spots.length).padStart(2, '0')}`, kind: 'stool', x, y, rotation: 0 };
      if (canPlaceRoomFurniture(candidate, [...presets, ...spots], [], layout)) spots.push(candidate);
    }
  }
  assert.equal(spots.length, ROOM_FURNITURE_LIMIT + 1, 'the room has room for a full build limit plus one');
  // Player-placed pieces use the same hexadecimal ids the server creates.
  const placed = spots.slice(0, ROOM_FURNITURE_LIMIT).map((spot, index) => ({ ...spot, id: `a1b2c3d4${String(index).padStart(2, '0')}` }));

  await saveAccountRoom(directory, accountId, [...presets, ...placed.slice(0, 1)]);
  const reloaded = await loadAccountRoom(directory, accountId);
  assert.equal(reloaded.filter(item => item.preset === true).length, presets.length, 'predefined pieces keep their flag');
  assert.equal(reloaded.find(item => item.id === 'preset-0').x, presets[0].x, 'the predefined piece keeps its saved position');

  await saveAccountRoom(directory, accountId, [...presets, ...placed]);
  await assert.rejects(saveAccountRoom(directory, accountId, [...presets, ...placed, { ...spots[ROOM_FURNITURE_LIMIT], id: 'a1b2c3d4ff' }]),
    /Invalid room furniture/, 'a thirteenth piece placed by the player is still refused');
});
