import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAppearance, saveAppearance } from './appearance-store.mjs';

test('appearance v4 persists gender and outfit while older saves remain readable', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-appearance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const saved = await saveAppearance(directory, 'owner-a', {
    archetypeId: 'character.mage', body: 'female', outfitId: 'outfit.mage-robe',
  });
  assert.equal(saved.body, 'female');
  assert.equal(saved.archetypeId, 'character.mage');
  assert.equal(saved.outfitId, 'outfit.mage-robe');
  const restored = await loadAppearance(directory, 'owner-a');
  assert.equal(restored.body, 'female');
  assert.equal(restored.archetypeId, 'character.mage');
  assert.equal(restored.outfitId, 'outfit.mage-robe');
  assert.equal(restored.mainHandId, 'equipment.staff');
  assert.equal((await loadAppearance(directory, 'owner-b')).body, 'male');

  const data = JSON.parse(await readFile(path.join(directory, 'appearances', 'owner-a.json'), 'utf8'));
  assert.equal(data.version, 4);
  assert.deepEqual(data.appearance, {
    archetypeId: 'character.mage', bodyId: 'female', outfitId: 'outfit.mage-robe',
  });

  const legacyFile = path.join(directory, 'appearances', 'owner-legacy.json');
  await writeFile(legacyFile, JSON.stringify({ skin: 2, outfit: 'robe' }));
  assert.equal((await loadAppearance(directory, 'owner-legacy')).body, 'male');
  assert.deepEqual(JSON.parse(await readFile(legacyFile, 'utf8')), { skin: 2, outfit: 'robe' },
    'reading an old save does not rewrite its source fields');

  const versionThreeFile = path.join(directory, 'appearances', 'owner-v3.json');
  await writeFile(versionThreeFile, JSON.stringify({ version: 3, appearance: { bodyId: 'female' } }));
  assert.equal((await loadAppearance(directory, 'owner-v3')).body, 'female');

  await assert.rejects(saveAppearance(directory, '../escape', {}));
});

test('appearance store rejects unknown future save versions', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-appearance-version-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'appearances'), { recursive: true });
  await writeFile(path.join(directory, 'appearances', 'future.json'), JSON.stringify({ version: 5, appearance: {} }));
  await assert.rejects(loadAppearance(directory, 'future'), /Unsupported appearance save version/);
});
