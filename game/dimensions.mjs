import { WORLD_CENTER, WORLD_NATURE_ORIGIN } from './world-scale.mjs';
import { createHash } from 'node:crypto';
import { WORLD_SIZE, SPAWN } from './world.mjs';
import { emptyWorldDefinition, normalizeWorldDefinition } from './world-edits.mjs';
import { DIMENSION_THEMES } from './dimension-themes.mjs';
import { createSkyTerrainDemoEdits } from './terrain-chunks.mjs';
export { DIMENSION_THEMES } from './dimension-themes.mjs';

export const DEFAULT_DIMENSIONS = Object.freeze([
  { id: 'surface', universeId: 'clareira', name: 'Bosque das Brasas', theme: 'forest', spawn: { ...SPAWN }, builtIn: true },
  { id: 'breu', universeId: 'clareira', name: 'O Breu', theme: 'dark', spawn: { ...WORLD_CENTER }, campfire: { ...WORLD_CENTER }, builtIn: true },
  { id: 'ceu', universeId: 'clareira', name: 'Altos do Céu', theme: 'sky', spawn: { ...WORLD_NATURE_ORIGIN }, builtIn: true },
  { id: 'arcano', universeId: 'clareira', name: 'Mundo Mágico', theme: 'magic', spawn: { ...WORLD_NATURE_ORIGIN }, builtIn: true },
  { id: 'inferno', universeId: 'clareira', name: 'Inferno', theme: 'inferno', spawn: { ...WORLD_NATURE_ORIGIN }, builtIn: true },
  { id: 'gigantes', universeId: 'clareira', name: 'Terra dos Gigantes', theme: 'giants', spawn: { ...WORLD_NATURE_ORIGIN }, builtIn: true },
  { id: 'energia', universeId: 'clareira', name: 'Mundo Energético', theme: 'energy', spawn: { ...WORLD_NATURE_ORIGIN }, builtIn: true },
].map(value => Object.freeze(value)));

const themes = new Set(DIMENSION_THEMES.map(theme => theme.id));
const idPattern = /^[a-z0-9][a-z0-9-]{0,47}$/;
const profileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalProfileId = value => {
  const raw = String(value || '').trim().toLowerCase();
  if (profileIdPattern.test(raw)) return raw;
  if (!raw || raw.length > 256) throw new TypeError('Invalid arrival profile.');
  const hex = createHash('sha256').update(raw).digest('hex').slice(0, 32).split('');
  hex[12] = '4'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return [hex.slice(0,8).join(''),hex.slice(8,12).join(''),hex.slice(12,16).join(''),hex.slice(16,20).join(''),hex.slice(20).join('')].join('-');
};

export const PERSONAL_ARRIVAL_PREFIX = 'arrival-';
export const isPersonalArrivalDimensionId = id => typeof id === 'string' && /^arrival-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export function personalArrivalDimension(profileId) {
  const canonicalId = canonicalProfileId(profileId);
  const fire = { ...WORLD_CENTER };
  return { id: `${PERSONAL_ARRIVAL_PREFIX}${canonicalId}`, universeId: 'clareira',
    name: 'O Breu', theme: 'dark', spawn: { x: fire.x + 9, y: fire.y + 2 }, campfire: fire, guide: fire,
    instanceType: 'arrival', ownerProfileId: canonicalId, builtIn: true };
}
const TERRAIN_FEATURES = Object.freeze({
  forest: [
    { type: 'hill', dx: -42, dy: 34, radius: 26, suffix: 'rise' },
    { type: 'depression', dx: 44, dy: 46, radius: 30, suffix: 'basin' },
  ],
  dark: [
    { type: 'hill', dx: -74, dy: -8, radius: 22, suffix: 'rise' },
    { type: 'depression', dx: 12, dy: 74, radius: 22, suffix: 'basin' },
  ],
  sky: [
    { type: 'depression', dx: -39, dy: -38, radius: 22, suffix: 'basin' },
  ],
  magic: [
    { type: 'hill', dx: -35, dy: 26, radius: 22, suffix: 'rise' },
    { type: 'depression', dx: 37, dy: 34, radius: 24, suffix: 'basin' },
  ],
  giants: [
    { type: 'depression', dx: -42, dy: 43, radius: 28, suffix: 'basin' },
  ],
});

function terrainFeaturesForDimension(dimension) {
  if (dimension.id === 'surface' || dimension.id === 'breu' || dimension.instanceType === 'arrival' || isPersonalArrivalDimensionId(dimension.id)) return [];
  return (TERRAIN_FEATURES[dimension.theme] || []).map(feature => ({
    id: `seed-${dimension.id}-${feature.suffix}`,
    type: feature.type,
    x: Math.max(feature.radius, Math.min(WORLD_SIZE - feature.radius, dimension.spawn.x + feature.dx)),
    y: Math.max(feature.radius, Math.min(WORLD_SIZE - feature.radius, dimension.spawn.y + feature.dy)),
    radius: feature.radius,
  }));
}

export function normalizeDimension(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Dimensão inválida.');
  const id = typeof value.id === 'string' ? value.id.trim().toLowerCase() : '';
  const universeId = typeof value.universeId === 'string' ? value.universeId.trim().toLowerCase() : 'clareira';
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 48) : '';
  const theme = typeof value.theme === 'string' ? value.theme : '';
  const x = Number(value.spawn?.x), y = Number(value.spawn?.y);
  if (!idPattern.test(id) || !idPattern.test(universeId)) throw new TypeError('Use um identificador curto, com letras, números ou hífen.');
  if (!name) throw new TypeError('Dê um nome para a dimensão.');
  if (!themes.has(theme)) throw new TypeError('Escolha um tema disponível.');
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 1 || y < 1 || x >= WORLD_SIZE - 1 || y >= WORLD_SIZE - 1) {
    throw new RangeError('O ponto de chegada precisa ficar dentro do mapa.');
  }
  const ownerProfileId = typeof value.ownerProfileId === 'string' && profileIdPattern.test(value.ownerProfileId) ? value.ownerProfileId.toLowerCase() : null;
  const instanceType = value.instanceType === 'arrival' && ownerProfileId && isPersonalArrivalDimensionId(id) ? 'arrival' : null;
  const campfire = Number.isFinite(Number(value.campfire?.x)) && Number.isFinite(Number(value.campfire?.y))
    ? { x: Number(value.campfire.x), y: Number(value.campfire.y) } : null;
  const guide = Number.isFinite(Number(value.guide?.x)) && Number.isFinite(Number(value.guide?.y))
    ? { x: Number(value.guide.x), y: Number(value.guide.y) } : null;
  return { id, universeId, name, theme, spawn: { x, y }, ...(campfire ? { campfire } : {}), ...(guide ? { guide } : {}),
    ...(instanceType ? { instanceType, ownerProfileId } : {}), builtIn: value.builtIn === true };
}

export function normalizeDimensions(values) {
  if (!Array.isArray(values)) return DEFAULT_DIMENSIONS.map(normalizeDimension);
  if (values.length < 1 || values.length > 64) throw new RangeError('O universo pode ter de 1 a 64 dimensões.');
  const result = values.map(normalizeDimension), ids = new Set();
  for (const item of result) {
    if (ids.has(item.id)) throw new TypeError('Há dimensões com o mesmo identificador.');
    ids.add(item.id);
  }
  if (!ids.has('surface')) throw new TypeError('A dimensão inicial Bosque das Brasas precisa continuar existindo.');
  return result;
}

export function dimensionById(dimensions, id) {
  const found = dimensions.find(item => item.id === id);
  if (found) return found;
  if (isPersonalArrivalDimensionId(id)) return personalArrivalDimension(id.slice(PERSONAL_ARRIVAL_PREFIX.length));
  return dimensions.find(item => item.id === 'surface') || normalizeDimension(DEFAULT_DIMENSIONS[0]);
}

export function seedDimensionTerrain(definition, dimension) {
  const existingIds = new Set(definition.edits.map(edit => edit.id));
  const additions = terrainFeaturesForDimension(dimension).filter(edit => !existingIds.has(edit.id));
  const removedIds = new Set(definition.edits.filter(edit => edit.type === 'edit-remove').map(edit => edit.targetId));
  const skyIslandExists = dimension.id === 'ceu'
    && definition.edits.some(edit => edit.id === 'seed-ceu-island-east' && edit.type === 'mountain')
    && !removedIds.has('seed-ceu-island-east');
  if (skyIslandExists) {
    for (const edit of createSkyTerrainDemoEdits(dimension.spawn, definition.seed)) {
      if (!existingIds.has(edit.id)) additions.push(edit);
    }
  }
  if (!additions.length) return definition;
  return normalizeWorldDefinition({
    ...definition,
    revision: definition.revision + 1,
    dimensionId: dimension.id,
    theme: dimension.theme,
    edits: [...definition.edits, ...additions],
  });
}

export function initialWorldForDimension(dimension, seed = 32_452_843) {
  const spawn = dimension.spawn;
  if (dimension.id === 'breu' || dimension.instanceType === 'arrival' || isPersonalArrivalDimensionId(dimension.id)) {
    return normalizeWorldDefinition({ ...emptyWorldDefinition(dimension.id), seed, theme: 'dark', edits: [] });
  }
  const edits = [];
  const add = (type, x, y, radius, suffix) => edits.push({ id: `seed-${dimension.id}-${suffix}`, type, x, y, radius });
  switch (dimension.theme) {
    case 'dark':
      add('clearing', spawn.x, spawn.y, 48, 'open');
      break;
    case 'sky':
      add('clearing', spawn.x, spawn.y, 14, 'landing');
      add('mountain', spawn.x - 22, spawn.y + 10, 24, 'island-west');
      add('mountain', spawn.x + 23, spawn.y - 13, 20, 'island-east');
      break;
    case 'magic':
      add('clearing', spawn.x, spawn.y, 8, 'sanctuary');
      add('forest', spawn.x - 19, spawn.y - 12, 28, 'mystic-wood');
      add('forest', spawn.x + 24, spawn.y + 20, 25, 'glowing-grove');
      add('lake', spawn.x + 22, spawn.y - 20, 9, 'moon-pool');
      edits.at(-1).waterKind = 'pond';
      break;
    case 'inferno':
      add('clearing', spawn.x, spawn.y, 10, 'landing');
      add('mountain', spawn.x - 22, spawn.y - 15, 28, 'ember-ridge');
      add('mountain', spawn.x + 23, spawn.y + 18, 30, 'ash-ridge');
      add('depression', spawn.x + 17, spawn.y - 17, 14, 'lava-basin');
      break;
    case 'giants':
      add('clearing', spawn.x, spawn.y, 12, 'old-road');
      add('mountain', spawn.x - 22, spawn.y - 20, 35, 'colossus-west');
      add('mountain', spawn.x + 24, spawn.y + 20, 38, 'colossus-east');
      add('forest', spawn.x + 5, spawn.y - 29, 21, 'giant-pines');
      break;
    case 'energy':
      add('clearing', spawn.x, spawn.y, 9, 'arrival');
      add('hill', spawn.x - 18, spawn.y + 13, 24, 'pulse-hill');
      add('depression', spawn.x + 21, spawn.y - 12, 22, 'rift');
      add('lake', spawn.x - 23, spawn.y - 19, 10, 'charged-pool');
      edits.at(-1).waterKind = 'pond';
      break;
    default:
      add('clearing', spawn.x, spawn.y, 10, 'arrival');
      add('forest', spawn.x + 21, spawn.y + 15, 30, 'nearby-wood');
      break;
  }
  edits.push(...terrainFeaturesForDimension(dimension));
  return normalizeWorldDefinition({ ...emptyWorldDefinition(dimension.id), seed, theme: dimension.theme, edits });
}
