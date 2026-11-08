import { CHARACTER_BY_ID } from './character-catalog.mjs';

export const SKINS = [
  ['Clara', '#f3d0a1', '#ffe1b4', '#c99272'],
  ['Dourada', '#d7a477', '#eac196', '#a66e50'],
  ['Morena', '#ad7654', '#c8936b', '#79503d'],
  ['Escura', '#704d3d', '#996d50', '#493530'],
];
export const HAIR_COLORS = ['#484038', '#241f28', '#8a5636', '#d1ad65', '#a0523f'];
export const COATS = ['#55757a', '#816652', '#596e48', '#81586c', '#555c84'];

const BASE = CHARACTER_BY_ID.get('character.base').defaults;
const ID_FIELDS = Object.freeze({
  bodyId: 'body',
  bodyShapeId: 'body-shape',
  outfitId: 'outfit',
  hairId: 'hair',
  eyesId: 'eyes',
  headwearId: 'headwear',
  mainHandId: 'equipment',
  offHandId: 'equipment',
  backItemId: 'back-item',
  auraId: 'aura',
  animationProfileId: 'animation-profile',
});
const LEGACY_ITEM_IDS = Object.freeze({
  none: 'equipment.none',
  branch: 'equipment.branch',
  lantern: 'equipment.lantern',
});

export const DEFAULT_APPEARANCE = Object.freeze({
  schemaVersion: 2,
  ...BASE,
  archetypeId: 'character.base',
  body: 'male',
  skin: 0,
  hair: 0,
  hairStyle: 'short',
  height: 1,
  muscle: 1,
  coat: 2,
  // Legacy aliases stay stable for old UI controls and existing save files.
  outfit: 'white-base',
  item: 'none',
});

function isDefinition(id, category) {
  return typeof id === 'string' && CHARACTER_BY_ID.get(id)?.category === category;
}

function index(value, key, length, fallback = 0) {
  return Number.isInteger(value[key]) && value[key] >= 0 && value[key] < length ? value[key] : fallback;
}

export function normalizeAppearance(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const archetypeId = isDefinition(source.archetypeId, 'character') ? source.archetypeId : 'character.base';
  const archetypeDefaults = CHARACTER_BY_ID.get(archetypeId).defaults;
  const legacyBody = source.body === 'female' ? 'body.female' : source.body === 'male' ? 'body.male' : null;
  const legacyHair = typeof source.hairStyle === 'string' ? `hair.${source.hairStyle}` : null;
  const legacyOutfit = typeof source.outfit === 'string' ? `outfit.${source.outfit}` : null;
  const legacyItem = LEGACY_ITEM_IDS[source.item];
  const ids = {};

  for (const [key, category] of Object.entries(ID_FIELDS)) {
    const fallback = archetypeDefaults[key] || BASE[key];
    const legacy = key === 'bodyId' ? legacyBody : key === 'hairId' ? legacyHair : key === 'outfitId' ? legacyOutfit : null;
    const explicit = source[key];
    ids[key] = isDefinition(explicit, category)
      ? explicit
      : isDefinition(legacy, category)
        ? legacy
        : key === 'mainHandId' && isDefinition(legacyItem, category)
          ? legacyItem
          : fallback;
  }

  const body = ids.bodyId === 'body.female' ? 'female' : 'male';
  const equipmentItem = Object.entries(LEGACY_ITEM_IDS).find(([, id]) => id === ids.mainHandId)?.[0] || 'none';
  const hairName = ids.hairId.slice('hair.'.length);

  return {
    schemaVersion: 2,
    archetypeId,
    ...ids,
    body,
    skin: index(source, 'skin', SKINS.length),
    hair: index(source, 'hair', HAIR_COLORS.length, body === 'female' ? 2 : 0),
    hairStyle: hairName === 'none' ? (body === 'female' ? 'long' : 'short') : hairName,
    height: [0.9, 1, 1.1].includes(source.height) ? source.height : 1,
    muscle: [0, 1, 2, 3].includes(source.muscle) ? source.muscle : 1,
    coat: index(source, 'coat', COATS.length, 2),
    // This alias now mirrors the selected directional appearance atlas.
    outfit: ids.outfitId.slice('outfit.'.length),
    item: equipmentItem,
  };
}

export function appearancePalette(base, appearance) {
  const normalized = normalizeAppearance(appearance);
  const [, skin, skinLight, skinShade] = SKINS[normalized.skin];
  return {
    ...base,
    skin,
    skinLight,
    skinShade,
    hair: HAIR_COLORS[normalized.hair],
    hairStyle: normalized.hairStyle,
    coat: COATS[normalized.coat],
    hat: null,
  };
}
