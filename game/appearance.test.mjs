import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppearance, DEFAULT_APPEARANCE, appearancePalette } from './appearance.mjs';

test('appearance accepts only bounded known values and sanitizes unknown legacy costumes', () => {
  assert.deepEqual(normalizeAppearance({ skin: 99, height: 8, item: '<script>', muscle: -1 }), DEFAULT_APPEARANCE);
  const custom = normalizeAppearance({ skin: 3, height: 1.1, muscle: 2, item: 'lantern', outfit: 'robe' });
  assert.equal(custom.height, 1.1);
  assert.equal(custom.outfit, 'white-base');
  assert.equal(custom.item, 'lantern');
  assert.notEqual(appearancePalette({}, { skin: 0 }).skin, appearancePalette({}, { skin: 3 }).skin);
});

test('male and female body choices use separate adult base artwork', () => {
  const man = normalizeAppearance();
  const woman = normalizeAppearance({ body: 'female' });
  assert.equal(man.body, 'male');
  assert.equal(woman.body, 'female');
  assert.equal(woman.hairStyle, 'long');
  assert.equal(woman.hair, 2);
  assert.equal(normalizeAppearance({ body: 'unknown' }).body, 'male');
});

test('appearance persists stable modular IDs and fills archetype defaults', () => {
  const mage = normalizeAppearance({ archetypeId: 'character.mage', body: 'female' });
  assert.equal(mage.schemaVersion, 2);
  assert.equal(mage.archetypeId, 'character.mage');
  assert.equal(mage.bodyId, 'body.female');
  assert.equal(mage.bodyShapeId, 'body-shape.average');
  assert.equal(mage.outfitId, 'outfit.mage-robe');
  assert.equal(mage.outfit, 'mage-robe');
  assert.equal(mage.hairId, 'hair.long');
  assert.equal(mage.eyesId, 'eyes.blue');
  assert.equal(mage.mainHandId, 'equipment.staff');
  assert.equal(mage.animationProfileId, 'animation-profile.spellcaster');

  const darkKnight = normalizeAppearance({ archetypeId: 'character.dark-knight' });
  assert.equal(darkKnight.bodyShapeId, 'body-shape.broad');
  assert.equal(darkKnight.outfitId, 'outfit.dark-armor');
  assert.equal(darkKnight.eyesId, 'eyes.red');
  assert.equal(darkKnight.auraId, 'aura.void');
  assert.equal(darkKnight.mainHandId, 'equipment.dark-sword');
});

test('unknown stable IDs are sanitized and legacy item/body fields migrate safely', () => {
  const migrated = normalizeAppearance({ body: 'female', hairStyle: 'curly', item: 'lantern', outfit: 'robe' });
  assert.equal(migrated.bodyId, 'body.female');
  assert.equal(migrated.hairId, 'hair.curly');
  assert.equal(migrated.mainHandId, 'equipment.lantern');
  assert.equal(migrated.outfitId, 'outfit.white-base');
  assert.equal(migrated.outfit, 'white-base');

  const invalid = normalizeAppearance({
    archetypeId: 'character.<script>',
    bodyId: 'body.unknown',
    outfitId: 'outfit.../../file',
    auraId: 'https://invalid.example',
  });
  assert.equal(invalid.archetypeId, 'character.base');
  assert.equal(invalid.bodyId, 'body.male');
  assert.equal(invalid.outfitId, 'outfit.white-base');
  assert.equal(invalid.auraId, 'aura.none');
});
