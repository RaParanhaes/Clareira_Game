import test from 'node:test';
import assert from 'node:assert/strict';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYER_SPEED } from './world.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, 'art', 'avatar-frames', 'neutral-body-v2');
const layersRoot = path.join(here, 'art', 'avatar-frames', 'character-layers-v1');
const facings = ['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest'];

async function pngSize(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(26);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    assert.equal(bytesRead, header.length, `${file} has a complete PNG header`);
    assert.deepEqual([...header.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(header.toString('ascii', 12, 16), 'IHDR');
    assert.equal(header[24], 8, 'PNG must use eight bits per channel');
    assert.equal(header[25], 6, 'PNG must retain its alpha channel');
    return [header.readUInt32BE(16), header.readUInt32BE(20)];
  } finally {
    await handle.close();
  }
}

test('the male and female base atlases match the eight-view manifest and native game cell', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.name, 'neutral-body-v2');
  assert.deepEqual(manifest.canvas, { width: 96, height: 96 });
  assert.equal(manifest.artHeight, 80);
  assert.deepEqual(manifest.pivot, { x: 48, y: 84, anchor: 'sole-center' });
  assert.deepEqual(manifest.facings, facings);
  assert.deepEqual(manifest.sourceGrid.readingOrder, facings);
  assert.deepEqual(Object.keys(manifest.bodies), ['male', 'female']);

  for (const body of ['male', 'female']) {
    const entry = manifest.bodies[body];
    assert.deepEqual(Object.keys(entry.actions), ['idle'], 'missing motion actions are not exposed as finished art');
    const idle = entry.actions.idle;
    assert.equal(idle.frameCount, 1);
    assert.equal(idle.durationMs, 100);
    assert.deepEqual(Object.keys(idle.frames), facings);
    assert.deepEqual(Object.values(idle.frames).map(frames => frames.length), Array(8).fill(1));

    const atlas = path.join(root, idle.atlas);
    assert.deepEqual(await pngSize(atlas), [96 * 8, 96]);
    const atlasInfo = await stat(atlas);
    assert.ok(atlasInfo.size > 1_000 && atlasInfo.size < 500_000, `${atlas} has an unexpected file size`);

    for (const facing of facings) {
      const frame = path.join(root, idle.frames[facing][0]);
      assert.deepEqual(await pngSize(frame), [96, 96], `${body} ${facing} frame matches the fixed canvas`);
      assert.ok((await stat(frame)).size > 100, `${frame} contains pixel art`);
    }
    assert.deepEqual(await pngSize(path.join(root, entry.baseSource)), [1536, 1024]);
  }
});

test('costume, gear and effect PNGs match their eight-direction frame properties', async () => {
  const manifest = JSON.parse(await readFile(path.join(layersRoot, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.canvas, { width: 96, height: 96 });
  assert.equal(manifest.appearanceMode, 'full-body-raster-variant');
  assert.deepEqual(manifest.pivot, { x: 48, y: 84, anchor: 'sole-center' });
  assert.deepEqual(manifest.facings, facings);
  assert.deepEqual(Object.keys(manifest.outfits), ['commoner', 'mage-robe', 'dimension-coat', 'dark-armor', 'light-armor']);

  for (const [outfitId, genders] of Object.entries(manifest.outfits)) {
    assert.deepEqual(Object.keys(genders), ['male', 'female']);
    for (const [gender, outfit] of Object.entries(genders)) {
      assert.equal(outfit.silhouetteComponents, 8, `${outfitId}/${gender} has eight isolated figures`);
      assert.equal(outfit.frameCount, 1);
      assert.equal(outfit.action, 'idle');
      assert.equal(outfit.renderLayer, 'full-avatar');
      assert.equal(outfit.motionProfileId.startsWith('animation-profile.'), true);
      assert.ok(outfit.compatibleFitGroupIds.length > 0);
      assert.ok(outfit.bundledSlots.includes('headwear'));
      assert.deepEqual(Object.keys(outfit.framesByFacing), facings);
      assert.ok(outfit.scaleDiagnostics.artHeightRange[0] >= 78);
      assert.ok(outfit.scaleDiagnostics.artHeightRange[1] <= 82);
      assert.deepEqual(await pngSize(path.join(layersRoot, outfit.atlas)), [96 * 8, 96]);
      assert.deepEqual(await pngSize(path.join(layersRoot, outfit.source)), [1536, 1024]);
      for (const facing of facings) {
        assert.deepEqual(await pngSize(path.join(layersRoot, outfit.framesByFacing[facing][0])), [96, 96]);
      }
      await stat(path.join(layersRoot, 'review-gifs', `${outfitId}-${gender}-turnaround.gif`));
    }
  }

  const malePeasantWalk = manifest.outfits.commoner.male.walk;
  assert.equal(malePeasantWalk.status, 'reviewed');
  assert.equal(malePeasantWalk.layout, 'direction-rows-frames-horizontal');
  assert.equal(malePeasantWalk.frameCount, 8);
  assert.equal(malePeasantWalk.frameDurationMs, 100);
  assert.equal(malePeasantWalk.distancePerCycle, 2.56);
  assert.equal(malePeasantWalk.distancePerCycle, PLAYER_SPEED * malePeasantWalk.frameCount
    * malePeasantWalk.frameDurationMs / 1000, 'the in-game cadence matches the reviewed GIF timing at walk speed');
  assert.deepEqual(Object.keys(malePeasantWalk.framesByFacing), facings);
  assert.deepEqual(await pngSize(path.join(layersRoot, malePeasantWalk.atlas)), [96 * 8, 96 * 8]);
  for (const facing of facings) {
    assert.equal(malePeasantWalk.framesByFacing[facing].length, 8, `${facing} has eight chronological frames`);
    for (const frame of malePeasantWalk.framesByFacing[facing]) {
      assert.deepEqual(await pngSize(path.join(layersRoot, frame)), [96, 96], `${frame} matches the shared frame size`);
    }
    await stat(path.join(layersRoot, malePeasantWalk.review.gifs[facing]));
  }

  for (const [effectId, effect] of Object.entries(manifest.effects)) {
    assert.equal(effect.frameCount, 8, `${effectId} has eight chronological effect frames`);
    assert.equal(effect.frameDurationMs, effectId === 'aura-flow' ? 110 : 90);
    assert.equal(typeof effect.loop, 'boolean');
    assert.ok(effect.trigger);
    if (effect.characters) assert.ok(effect.characters.length > 0);
    assert.ok(['aura-back', 'aura-front', 'hand-item-front'].includes(effect.renderLayer));
    assert.deepEqual(await pngSize(path.join(layersRoot, effect.atlas)), effect.layout === 'direction-rows-frames-horizontal'
      ? [96 * 8, 96 * 8] : [96 * 8, 96]);
    const effectFrames = effect.frames || Object.values(effect.framesByFacing || {}).flat();
    for (const frame of effectFrames) assert.deepEqual(await pngSize(path.join(layersRoot, frame)), [96, 96]);
    await stat(path.join(layersRoot, effectId === 'aura-flow'
      ? 'review-gifs/effects/aura-flow/character-integration.png'
      : `review-gifs/${effectId}.gif`));
  }

  for (const [itemId, item] of Object.entries(manifest.equipment)) {
    assert.deepEqual(Object.keys(item.sockets), facings, `${itemId} declares a socket per facing`);
    assert.deepEqual(await pngSize(path.join(layersRoot, item.atlas)), [96 * 8, 96]);
  }
  await stat(path.join(layersRoot, 'sheets', 'avatar-outfits-all.png'));
  await stat(path.join(layersRoot, 'sheets', 'equipment-all.png'));
  await stat(path.join(layersRoot, 'sheets', 'effects-first-frame.png'));
});

test('each current male peasant animation has 8 transparent frames in all 8 views', async () => {
  const manifest = JSON.parse(await readFile(path.join(layersRoot, 'manifest.json'), 'utf8'));
  const actions = manifest.movementClips.implementedActions;
  assert.deepEqual(actions, ['walk', 'run', 'wave', 'dance', 'jump', 'sit-ground', 'sit-chair', 'crouch', 'crouch-walk', 'walk-wave']);
  assert.deepEqual(manifest.movementClips.facingOrder, facings);
  assert.equal(manifest.movementClips.frameCountPerFacing, 8);
  for (const actionName of actions) {
    const action = manifest.outfits.commoner.male[actionName];
    assert.equal(action.status, 'reviewed', `${actionName} is connected only after review`);
    assert.equal(action.frameCount, 8, `${actionName} has eight frames`);
    assert.deepEqual(action.facingOrder, facings, `${actionName} has all eight views in game order`);
    assert.deepEqual(Object.keys(action.framesByFacing), facings);
    assert.deepEqual(await pngSize(path.join(layersRoot, action.atlas)), [768, 768]);
    for (const facing of facings) {
      assert.equal(action.framesByFacing[facing].length, 8, `${actionName}/${facing} has eight frames`);
      for (const frame of action.framesByFacing[facing]) {
        assert.deepEqual(await pngSize(path.join(layersRoot, frame)), [96, 96], `${actionName}/${facing} keeps the transparent 96x96 canvas`);
      }
    }
    await stat(path.join(layersRoot, action.review.contact2x));
  }
});

test('the reviewed male peasant wave has eight transparent PNG frames in each facing', async () => {
  const manifest = JSON.parse(await readFile(path.join(layersRoot, 'manifest.json'), 'utf8'));
  const wave = manifest.outfits.commoner.male.wave;
  assert.equal(wave.status, 'reviewed');
  assert.equal(wave.layout, 'direction-rows-frames-horizontal');
  assert.equal(wave.frameCount, 8);
  assert.equal(wave.frameDurationMs, 110);
  assert.deepEqual(wave.facingOrder, facings);
  assert.deepEqual(Object.keys(wave.framesByFacing), facings);
  assert.deepEqual(await pngSize(path.join(layersRoot, wave.atlas)), [96 * 8, 96 * 8]);
  for (const facing of facings) {
    assert.equal(wave.framesByFacing[facing].length, 8, `${facing} has eight reviewed frames`);
    for (const frame of wave.framesByFacing[facing]) {
      assert.deepEqual(await pngSize(path.join(layersRoot, frame)), [96, 96], `${frame} keeps the alpha channel and fixed canvas`);
    }
  }
  await stat(path.join(layersRoot, wave.review.contact2x));
});

test('the reviewed male peasant run has eight distinct transparent PNG frames in each facing', async () => {
  const manifest = JSON.parse(await readFile(path.join(layersRoot, 'manifest.json'), 'utf8'));
  const run = manifest.outfits.commoner.male.run;
  assert.equal(run.status, 'reviewed');
  assert.equal(run.layout, 'direction-rows-frames-horizontal');
  assert.equal(run.frameCount, 8);
  assert.equal(run.frameDurationMs, 100);
  assert.equal(run.distancePerCycle, 1.8);
  assert.deepEqual(run.facingOrder, facings);
  assert.deepEqual(Object.keys(run.framesByFacing), facings);
  assert.deepEqual(await pngSize(path.join(layersRoot, run.atlas)), [96 * 8, 96 * 8]);
  for (const facing of facings) {
    assert.equal(run.framesByFacing[facing].length, 8, `${facing} has eight reviewed frames`);
    for (const frame of run.framesByFacing[facing]) {
      assert.deepEqual(await pngSize(path.join(layersRoot, frame)), [96, 96], `${frame} keeps the alpha channel and fixed canvas`);
    }
    await stat(path.join(layersRoot, run.review.gifs[facing]));
  }
  await stat(path.join(layersRoot, run.review.contact2x));
});
