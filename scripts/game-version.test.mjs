import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGameVersionReader } from './game-version.mjs';

test('game version changes for edits and newly added files, with a short shared cache', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-game-version-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'main.js');
  await writeFile(source, 'export const version = 1;');
  let time = 0;
  const versions = createGameVersionReader(directory, { cacheMs: 100, now: () => time });

  const original = await versions.readVersion();
  assert.equal(await versions.readVersion(), original, 'reusa o hash durante a janela curta de cache');
  await writeFile(source, 'export const version = 2;');
  assert.equal(await versions.readVersion(), original, 'não refaz a varredura antes do limite de cache');
  time = 101;
  const edited = await versions.readVersion();
  assert.notEqual(edited, original);
  await writeFile(path.join(directory, 'new-scene.mjs'), 'export const scene = true;');
  time = 202;
  assert.notEqual(await versions.readVersion(), edited, 'arquivo novo também muda a versão');
});
