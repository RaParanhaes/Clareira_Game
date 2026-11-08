import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_CATALOG, CHARACTER_BY_ID } from './character-catalog.mjs';
import {
  AVATAR_COMPOSITION_SPEC,
  AVATAR_LAYER_ORDER,
  resolveCharacterAction,
  resolveCharacterComposition,
} from './character-composition.mjs';

test('base composition points only to reviewed PNGs and matches the shared frame contract', () => {
  const composition = resolveCharacterComposition({});
  assert.equal(composition.complete, true);
  assert.deepEqual(composition.missing, []);
  assert.deepEqual(composition.compatibility, []);
  assert.equal(composition.layers.length, 1);
  assert.equal(composition.layers[0].id, 'outfit.white-base');
  assert.equal(composition.layers[0].asset, 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/idle.png');
  assert.deepEqual(AVATAR_COMPOSITION_SPEC.canvas, { width: 96, height: 96 });
  assert.deepEqual(AVATAR_COMPOSITION_SPEC.pivot, { x: 48, y: 84, anchor: 'sole-center' });
  assert.equal(AVATAR_COMPOSITION_SPEC.directions, 8);
  assert.ok(AVATAR_LAYER_ORDER.indexOf('back-item') < AVATAR_LAYER_ORDER.indexOf('body'));
  assert.ok(AVATAR_LAYER_ORDER.indexOf('hand-item-front') > AVATAR_LAYER_ORDER.indexOf('body'));
});

test('repeated avatar composition resolves reuse an immutable cached layer graph', () => {
  const first = resolveCharacterComposition({ archetypeId: 'character.peasant', skin: 2, hair: 3 });
  const second = resolveCharacterComposition({ archetypeId: 'character.peasant', skin: 2, hair: 3 });
  assert.strictEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.layers), true);
});

test('archetypes resolve to reviewed outfit, prop and effect art without borrowing missing walk cycles', () => {
  for (const id of [
    'character.peasant',
    'character.mage',
    'character.dimensional-traveler',
    'character.dark-knight',
    'character.light-knight',
  ]) {
    const composition = resolveCharacterComposition({ archetypeId: id });
    assert.equal(composition.archetypeId, id);
    assert.ok(composition.layers.some(layer => layer.slot === 'full-avatar'), `${id} has an eight-direction look atlas`);
    assert.deepEqual(composition.missing, []);
    assert.equal(composition.complete, true);
    assert.ok(composition.layers.every(layer => layer.asset), 'the render list contains no guessed or missing paths');
  }

  const darkKnight = resolveCharacterComposition({ archetypeId: 'character.dark-knight' });
  assert.equal(darkKnight.appearance.auraId, 'aura.void');
  assert.equal(darkKnight.appearance.animationProfileId, 'animation-profile.heavy');
  assert.ok(darkKnight.layers.some(layer => layer.id === 'aura.void'));
  assert.ok(darkKnight.layers.some(layer => layer.id === 'equipment.dark-sword'));
  assert.equal(darkKnight.motion.gaitProfileId, 'animation-profile.heavy');
  assert.equal(darkKnight.motion.mainHandPoseProfileId, 'animation-profile.heavy');
  assert.equal(darkKnight.motion.fitGroupId, 'fit-group.broad');

  const lightKnight = resolveCharacterComposition({ archetypeId: 'character.light-knight' });
  assert.equal(lightKnight.appearance.auraId, 'aura.radiance');
  assert.equal(lightKnight.appearance.eyesId, 'eyes.radiant');
  assert.equal(resolveCharacterAction({ archetypeId: 'character.peasant' }, 'walk').status, 'implemented');
  assert.equal(resolveCharacterAction({ archetypeId: 'character.peasant', body: 'female' }, 'walk').status, 'planned');
  for (const id of ['character.mage', 'character.dimensional-traveler', 'character.dark-knight', 'character.light-knight']) {
    assert.equal(resolveCharacterAction({ archetypeId: id }, 'walk').status, 'planned', `${id} waits for its own walk cycle`);
  }
  const malePeasant = resolveCharacterComposition({ archetypeId: 'character.peasant' });
  assert.equal(malePeasant.layers[0].actionFrames.walk.asset,
    'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/walk.png');
  assert.equal(malePeasant.layers[0].actionFrames.walk.frameCount, 8);
});

test('motion resolver composes gait and item profiles without inventing unfinished clips', () => {
  assert.deepEqual(resolveCharacterAction({}, 'idle'), {
    action: 'idle', status: 'implemented', profileId: 'animation-profile.standard', clip: 'animation.avatar.idle',
  });
  assert.equal(resolveCharacterAction({}, 'walk').status, 'implemented');
  assert.equal(resolveCharacterAction({}, 'slash').status, 'unsupported');

  const mage = { archetypeId: 'character.mage' };
  const cast = resolveCharacterAction(mage, 'cast');
  assert.equal(cast.status, 'planned');
  assert.equal(cast.profileId, 'animation-profile.spellcaster');
  assert.equal(cast.effectId, 'effect.spellcast-blue');

  const activate = resolveCharacterAction({ archetypeId: 'character.dimensional-traveler' }, 'activate');
  assert.equal(activate.status, 'planned');
  assert.equal(activate.effectId, 'effect.rift-activate');

  const darkKnight = { archetypeId: 'character.dark-knight' };
  const slash = resolveCharacterAction(darkKnight, 'slash');
  assert.equal(slash.status, 'planned');
  assert.equal(slash.profileId, 'animation-profile.heavy');
});

test('two-handed gear cannot occupy both hands or leave an off-hand free', () => {
  const invalid = resolveCharacterComposition({
    mainHandId: 'equipment.axe',
    offHandId: 'equipment.knife',
    animationProfileId: 'animation-profile.heavy',
  });
  assert.ok(invalid.compatibility.some(entry => entry.reason === 'main-hand-item-uses-both-hands'));
  assert.equal(resolveCharacterAction({
    mainHandId: 'equipment.axe',
    offHandId: 'equipment.knife',
    animationProfileId: 'animation-profile.heavy',
  }, 'chop').status, 'incompatible');

  const invalidOffhand = resolveCharacterComposition({ offHandId: 'equipment.staff' });
  assert.ok(invalidOffhand.compatibility.some(entry => entry.reason === 'two-handed-item-requires-main-hand'));

  const swordAndLanternSlash = resolveCharacterAction({
    mainHandId: 'equipment.sword',
    offHandId: 'equipment.lantern',
    animationProfileId: 'animation-profile.trained',
  }, 'slash');
  assert.equal(swordAndLanternSlash.status, 'planned');
  assert.notEqual(swordAndLanternSlash.status, 'incompatible');
});

test('clothing declares body fit groups and rejects a silhouette it was not authored for', () => {
  const armorOnAverageBody = resolveCharacterComposition({ outfitId: 'outfit.dark-armor' });
  assert.ok(armorOnAverageBody.compatibility.some(entry => entry.reason === 'outfit-body-fit-mismatch'));
  const knight = resolveCharacterComposition({ archetypeId: 'character.dark-knight' });
  assert.ok(!knight.compatibility.some(entry => entry.reason === 'outfit-body-fit-mismatch'));
});

test('catalog IDs, categories, slots and action profiles are internally resolvable', () => {
  assert.equal(new Set(CHARACTER_CATALOG.map(entry => entry.id)).size, CHARACTER_CATALOG.length);
  for (const entry of CHARACTER_CATALOG) {
    assert.ok(entry.id.startsWith(`${entry.category}.`), entry.id);
    for (const reference of entry.refs) assert.ok(CHARACTER_BY_ID.has(reference), `${entry.id} refers to ${reference}`);
    if (entry.motionProfileId) assert.equal(CHARACTER_BY_ID.get(entry.motionProfileId)?.category, 'animation-profile');
    if (entry.category === 'character') {
      for (const [field, id] of Object.entries(entry.defaults)) {
        assert.ok(CHARACTER_BY_ID.has(id), `${entry.id}.${field} points to ${id}`);
      }
    }
  }
});

test('immutable appearance fast path preserves composition while mutable editor edits invalidate it',()=>{
 const first=resolveCharacterComposition({skin:0});
 assert.strictEqual(resolveCharacterComposition(first.appearance),first);
 const editor={skin:0};resolveCharacterComposition(editor);editor.skin=2;
 const changed=resolveCharacterComposition(editor);
 assert.equal(changed.appearance.skin,2);assert.notStrictEqual(changed,first);
 assert.strictEqual(resolveCharacterComposition(changed.appearance),changed);
});
