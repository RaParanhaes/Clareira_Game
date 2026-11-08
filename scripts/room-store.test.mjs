import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAccountRoom, saveAccountRoom } from './room-store.mjs';
import { roomFurnitureSupport } from '../game/world.mjs';

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
