import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeAppearance } from '../game/appearance.mjs';

export const APPEARANCE_SAVE_VERSION = 4;

const SKIN_IDS = ['skin_clara', 'skin_dourada', 'skin_morena', 'skin_escura'];
const HAIR_COLOR_IDS = ['hair_dark_brown', 'hair_near_black', 'hair_chestnut', 'hair_honey_blonde', 'hair_copper'];
const COAT_IDS = ['coat_sea', 'coat_cedar', 'coat_moss', 'coat_berry', 'coat_slate'];
const LEGACY_KEYS = new Set(['body', 'skin', 'hair', 'hairStyle', 'height', 'muscle', 'coat', 'outfit', 'item']);

function filename(directory, id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Conta inválida');
  return path.join(directory, 'appearances', `${id}.json`);
}

function assertLegacyAppearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid legacy appearance save');
  const valid = (key, option) => {
    if (!LEGACY_KEYS.has(key)) return false;
    if (key === 'body') return ['male', 'female'].includes(option);
    if (key === 'skin' || key === 'coat') return Number.isInteger(option) && option >= 0 && option < 4 + (key === 'coat' ? 1 : 0);
    if (key === 'hair') return Number.isInteger(option) && option >= 0 && option < HAIR_COLOR_IDS.length;
    if (key === 'hairStyle') return ['short', 'long', 'curly', 'shaved'].includes(option);
    if (key === 'height') return [0.9, 1, 1.1].includes(option);
    if (key === 'muscle') return [0, 1, 2, 3].includes(option);
    if (key === 'outfit') return ['peasant', 'classic', 'coat', 'vest', 'robe'].includes(option);
    if (key === 'item') return ['none', 'branch', 'lantern'].includes(option);
    return false;
  };
  if (Object.entries(value).some(([key, option]) => !valid(key, option))) throw new Error('Invalid legacy appearance save');
  const normalized = normalizeAppearance(value);
  return {
    body: normalized.body,
    skin: normalized.skin,
    hair: normalized.hair,
    hairStyle: normalized.hairStyle,
    height: normalized.height,
    muscle: normalized.muscle,
    coat: normalized.coat,
    outfit: normalized.outfit,
    item: normalized.item,
  };
}

function encodeVersion2Appearance(value) {
  const body = normalizeAppearance(value).body;
  const skin = Number.isInteger(value.skin) && value.skin >= 0 && value.skin < SKIN_IDS.length ? value.skin : 0;
  const hair = Number.isInteger(value.hair) && value.hair >= 0 && value.hair < HAIR_COLOR_IDS.length ? value.hair : 0;
  const coat = Number.isInteger(value.coat) && value.coat >= 0 && value.coat < COAT_IDS.length ? value.coat : 2;
  return {
    bodyId: body,
    skinId: SKIN_IDS[skin],
    hairColorId: HAIR_COLOR_IDS[hair],
    hairStyleId: ['short', 'long', 'curly', 'shaved'].includes(value.hairStyle) ? value.hairStyle : body === 'female' ? 'long' : 'short',
    height: [0.9, 1, 1.1].includes(value.height) ? value.height : 1,
    muscle: [0, 1, 2, 3].includes(value.muscle) ? value.muscle : 1,
    coatId: COAT_IDS[coat],
    outfitId: ['peasant', 'classic', 'coat', 'vest', 'robe'].includes(value.outfit) ? value.outfit : 'peasant',
    heldItemId: ['none', 'branch', 'lantern'].includes(value.item) ? value.item : 'none',
  };
}

function decodeVersion2Appearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid appearance save');
  const skin = SKIN_IDS.indexOf(value.skinId);
  const hair = HAIR_COLOR_IDS.indexOf(value.hairColorId);
  const coat = COAT_IDS.indexOf(value.coatId);
  if (skin < 0 || hair < 0 || coat < 0
      || !['male', 'female'].includes(value.bodyId)
      || !['short', 'long', 'curly', 'shaved'].includes(value.hairStyleId)
      || ![0.9, 1, 1.1].includes(value.height)
      || ![0, 1, 2, 3].includes(value.muscle)
      || !['peasant', 'classic', 'coat', 'vest', 'robe'].includes(value.outfitId)
      || !['none', 'branch', 'lantern'].includes(value.heldItemId)) {
    throw new Error('Invalid appearance save');
  }
  return normalizeAppearance({ body: value.bodyId });
}

function encodeAppearance(value) {
  const appearance = normalizeAppearance(value);
  return {
    archetypeId: appearance.archetypeId,
    bodyId: appearance.body,
    outfitId: appearance.outfitId,
  };
}

function decodeVersion3Appearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['male', 'female'].includes(value.bodyId)
      || Object.keys(value).some(key => key !== 'bodyId')) throw new Error('Invalid appearance save');
  return normalizeAppearance({ body: value.bodyId });
}

function decodeVersion4Appearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['archetypeId', 'bodyId', 'outfitId'].includes(key))
      || !['male', 'female'].includes(value.bodyId)
      || typeof value.archetypeId !== 'string' || typeof value.outfitId !== 'string') {
    throw new Error('Invalid appearance save');
  }
  return normalizeAppearance({ archetypeId: value.archetypeId, body: value.bodyId, outfitId: value.outfitId });
}

const migrations = {
  0: legacy => ({ version: 2, appearance: encodeVersion2Appearance(assertLegacyAppearance(legacy.appearance)) }),
  1: saved => ({ version: 2, appearance: encodeVersion2Appearance(assertLegacyAppearance(saved.appearance)) }),
  2: saved => ({ version: 3, appearance: { bodyId: decodeVersion2Appearance(saved.appearance).body } }),
  3: saved => ({ version: 4, appearance: encodeAppearance(decodeVersion3Appearance(saved.appearance)) }),
};

export function decodeAppearanceSave(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid appearance save');
  let current = saved.version === undefined ? { version: 0, appearance: saved } : saved;
  if (!Number.isInteger(current.version) || current.version < 0 || current.version > APPEARANCE_SAVE_VERSION) {
    throw new Error('Unsupported appearance save version');
  }
  while (current.version < APPEARANCE_SAVE_VERSION) {
    const migrate = migrations[current.version];
    if (!migrate) throw new Error('Unsupported appearance save version');
    current = migrate(current);
  }
  return decodeVersion4Appearance(current.appearance);
}

export async function loadAppearance(directory, id) {
  let saved;
  try { saved = JSON.parse(await readFile(filename(directory, id), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return normalizeAppearance();
    throw error;
  }
  return decodeAppearanceSave(saved);
}

export async function saveAppearance(directory, id, value) {
  const target = filename(directory, id);
  const directoryPath = path.dirname(target);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  await chmod(directoryPath, 0o700);
  const temporary = `${target}.${randomUUID()}.tmp`;
  const envelope = { version: APPEARANCE_SAVE_VERSION, appearance: encodeAppearance(value) };
  await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, target);
  await chmod(target, 0o600);
  return normalizeAppearance(value);
}
