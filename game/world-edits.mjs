// Persisted, server-authored changes layered over the deterministic world seed.
import { normalizeTerrainChunk } from './terrain-chunks.mjs';
import { lakeSignedDepthAt, normalizeLakeOutline } from './water-geometry.mjs';
export const WORLD_DOCUMENT_VERSION = 1;
export const WORLD_DOCUMENT_ID = 'clareira-shared';
export const WORLD_DIMENSION_ID = 'surface';
export const WORLD_EDIT_LIMIT = 4096;
const WORLD_CHUNK_SIZE = 16;
const EDIT_TYPES = new Set(['tile-surface', 'forest', 'clearing', 'hill', 'mountain', 'depression', 'terrain-chunk', 'lake', 'creature-zone', 'place', 'resource', 'tree', 'tree-remove', 'rock', 'rock-remove', 'resource-remove', 'resource-cooldown', 'work-progress', 'edit-remove']);
const RESOURCE_KINDS = new Set(['wood', 'sturdyBranch', 'stone', 'berries', 'apples', 'leaves', 'vines', 'log', 'copperVein', 'ironVein', 'coalSeam', 'woodBench', 'charcoalKiln', 'stoneFurnace', 'woodBatch', 'charcoalBatch', 'smeltBatch']);
const TREE_GROWTH_STAGES = new Set(['stump', 'sapling', 'youngTree']);
const REGROWING_RESOURCE_KINDS = new Set(['wood', 'sturdyBranch', 'stone', 'berries', 'apples', 'leaves', 'vines']);
const PRODUCTION_OUTPUTS = new Set(['wood', 'plank', 'charcoal', 'copperIngot', 'ironIngot']);
const WATER_KINDS = new Set(['lake', 'pond']);
const CREATURE_KINDS = new Set(['goblin', 'slime', 'dragon']);
const CREATURE_DENSITIES = new Set(['low', 'medium', 'high', 'boss']);
const WORLD_THEMES = new Set(['forest', 'dark', 'sky', 'magic', 'inferno', 'giants', 'energy']);
const PLACE_KINDS = new Set(['hotel', 'castle', 'ruins', 'standing-stones', 'broken-tower', 'inn', 'goblin-camp', 'dragon-cave', 'mine', 'secret-ruins', 'secret-cave', 'slime-field', 'lake', 'woodland', 'meadow', 'mountain-range']);
const MAP_OBJECT_ID = /^[a-z0-9-]{1,64}$/i;
const TREE_ID = /^(?:seed:-?\d{1,15}|authored:\d{1,3}|maptree:[a-z0-9-]{1,64})$/i;
const RESOURCE_ID = /^(?:seed:-?\d{1,15}|authored:\d{1,3}|maptree:[a-z0-9-]{1,64}|[a-z0-9-]{1,96})$/i;
const INTERNAL_EDIT_TYPES = new Set(['resource-cooldown', 'work-progress']);

export function emptyWorldDefinition(dimensionId = 'surface') {
  return { version: WORLD_DOCUMENT_VERSION, revision: 0, seed: 32_452_843, generationVersion: 1, dimensionId, theme: 'forest', edits: [] };
}

// Resource cooldowns and work progress change availability, not generated
// terrain. Excluding internal state keeps static chunk geometry cached.
const worldGeometryKeys = new WeakMap();
export function worldGeometryCacheKey(definition) {
  let key = worldGeometryKeys.get(definition);
  if (key) return key;
  key = JSON.stringify({
    dimensionId: definition.dimensionId,
    seed: definition.seed,
    generationVersion: definition.generationVersion,
    theme: definition.theme,
    edits: (definition.edits || []).filter(edit => !INTERNAL_EDIT_TYPES.has(edit.type)),
  });
  worldGeometryKeys.set(definition, key);
  return key;
}

export function worldDefinitionChangesGeometry(previous, next) {
  return worldGeometryCacheKey(previous) !== worldGeometryCacheKey(next);
}

export function normalizeWorldEdit(value, { worldSize = 10_000 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !EDIT_TYPES.has(value.type)) {
    throw new TypeError('Tipo de alteração do mapa inválido.');
  }
  const x = value.type === 'terrain-chunk' ? Number(value.chunkX) * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2 : Number(value.x);
  const y = value.type === 'terrain-chunk' ? Number(value.chunkY) * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2 : Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= worldSize || y >= worldSize) {
    throw new RangeError('A posição da alteração está fora do mundo.');
  }
  const id = typeof value.id === 'string' && /^[a-z0-9-]{1,64}$/i.test(value.id) ? value.id : null;
  if (!id) throw new TypeError('A alteração precisa de um identificador válido.');
  if (value.type === 'tile-surface') {
    if (!Number.isInteger(x) || !Number.isInteger(y) || id !== `tile-surface-${x}-${y}`
        || !['path', 'ground'].includes(value.surface)) throw new TypeError('Tile ou superfície inválida.');
    return { id, type: value.type, x, y, surface: value.surface };
  }
  if (value.type === 'terrain-chunk') return { id, type: value.type, ...normalizeTerrainChunk(value, { worldSize }) };
  if (value.type === 'tree' || value.type === 'rock') return { id, type: value.type, x, y };
  if (value.type === 'tree-remove' || value.type === 'rock-remove') {
    const targetId = typeof value.targetId === 'string' && (value.type === 'tree-remove' ? TREE_ID.test(value.targetId) : MAP_OBJECT_ID.test(value.targetId))
      ? value.targetId : null;
    if (!targetId) throw new TypeError('Escolha um objeto válido para remover.');
    const respawnAt = value.respawnAt === undefined ? undefined : Number(value.respawnAt);
    const growthStage = value.growthStage === undefined ? undefined : value.growthStage;
    const nextGrowthAt = value.nextGrowthAt === undefined ? undefined : Number(value.nextGrowthAt);
    if (value.type === 'rock-remove' && respawnAt !== undefined) throw new TypeError('Rochas removidas não guardam prazo de retorno.');
    if (respawnAt !== undefined && (!Number.isSafeInteger(respawnAt) || respawnAt < 0)) throw new TypeError('O prazo de retorno da árvore é inválido.');
    if (value.type === 'rock-remove' && (growthStage !== undefined || nextGrowthAt !== undefined)) throw new TypeError('Rochas removidas não têm estágio de crescimento.');
    if (growthStage !== undefined && (!TREE_GROWTH_STAGES.has(growthStage) || respawnAt === undefined
        || !Number.isSafeInteger(nextGrowthAt) || nextGrowthAt < 0 || nextGrowthAt > respawnAt)) throw new TypeError('O estágio de crescimento da árvore é inválido.');
    if (growthStage === undefined && nextGrowthAt !== undefined) throw new TypeError('A árvore precisa de um estágio para guardar o próximo crescimento.');
    return { id, type: value.type, targetId, ...(respawnAt === undefined ? {} : { respawnAt }),
      ...(growthStage === undefined ? {} : { growthStage, nextGrowthAt }), x, y };
  }
  if (value.type === 'edit-remove') {
    const targetId = typeof value.targetId === 'string' && MAP_OBJECT_ID.test(value.targetId)
      && !/^(?:seed|dimension)-/i.test(value.targetId) ? value.targetId : null;
    if (!targetId) throw new TypeError('Escolha uma marca administrativa válida para remover.');
    const radius = value.radius === undefined ? undefined : Number(value.radius);
    if (radius !== undefined && (!Number.isFinite(radius) || radius < 0 || radius > 48)) throw new RangeError('A área da marca selecionada é inválida.');
    return { id, type: 'edit-remove', targetId, x, y, ...(radius === undefined ? {} : { radius }) };
  }
  if (value.type === 'resource-remove') {
    const targetId = typeof value.targetId === 'string' && MAP_OBJECT_ID.test(value.targetId) ? value.targetId : null;
    if (!targetId) throw new TypeError('Escolha um recurso válido para remover.');
    return { id, type: 'resource-remove', targetId, x, y };
  }
  if (value.type === 'resource-cooldown') {
    const targetId = typeof value.targetId === 'string' && RESOURCE_ID.test(value.targetId) ? value.targetId : null;
    const sourceId = typeof value.sourceId === 'string' && RESOURCE_ID.test(value.sourceId) ? value.sourceId : null;
    const readyAt = Number(value.readyAt);
    if (!targetId || !sourceId || !Number.isSafeInteger(readyAt) || readyAt < 0) throw new TypeError('O retorno do recurso é inválido.');
    return { id, type: 'resource-cooldown', targetId, sourceId, readyAt, x, y };
  }
  if (value.type === 'work-progress') {
    const targetId = typeof value.targetId === 'string' && RESOURCE_ID.test(value.targetId) ? value.targetId : null;
    const targetKind = ['tree', 'log', 'deposit'].includes(value.targetKind) ? value.targetKind : null;
    const hits = Number(value.hits);
    const maxHits = targetKind === 'tree' ? 39 : targetKind === 'log' ? 29 : 11;
    if (!targetId || !targetKind || !Number.isSafeInteger(hits) || hits < 1 || hits > maxHits) throw new TypeError('O progresso de trabalho é inválido.');
    return { id, type: 'work-progress', targetId, targetKind, hits, x, y };
  }
  if (value.type === 'resource') {
    if (!RESOURCE_KINDS.has(value.resourceKind)) throw new TypeError('Tipo de recurso inválido.');
    const quantity = value.quantity === undefined ? 1 : Number(value.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) throw new RangeError('A quantidade deste recurso é inválida.');
    const outputItem = value.outputItem === undefined ? undefined : value.outputItem;
    const readyAt = value.readyAt === undefined ? undefined : Number(value.readyAt);
    const sourceId = value.sourceId === undefined ? undefined : value.sourceId;
    const respawnAt = value.respawnAt === undefined ? undefined : Number(value.respawnAt);
    if (respawnAt !== undefined && (!REGROWING_RESOURCE_KINDS.has(value.resourceKind)
        || !Number.isSafeInteger(respawnAt) || respawnAt < 0)) throw new TypeError('O prazo de retorno deste recurso é inválido.');
    if (['woodBatch', 'charcoalBatch', 'smeltBatch'].includes(value.resourceKind)) {
      if (!PRODUCTION_OUTPUTS.has(outputItem) || !Number.isSafeInteger(readyAt) || readyAt < 0
          || (sourceId !== undefined && (typeof sourceId !== 'string' || !MAP_OBJECT_ID.test(sourceId))) || respawnAt !== undefined) throw new TypeError('Lote de produção inválido.');
    } else if (outputItem !== undefined || readyAt !== undefined || sourceId !== undefined) throw new TypeError('Somente lotes podem guardar um resultado e um prazo.');
    return {
      id, type: 'resource', resourceKind: value.resourceKind, ...(quantity === 1 ? {} : { quantity }),
      ...(outputItem ? { outputItem, readyAt, ...(sourceId ? { sourceId } : {}) } : {}),
      ...(respawnAt === undefined ? {} : { respawnAt }), x, y,
    };
  }
  if (value.type === 'place') {
    if (!PLACE_KINDS.has(value.placeKind)) throw new TypeError('Tipo de local inválido.');
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 64) : '';
    if (!name) throw new TypeError('Dê um nome ao local.');
    return { id, type: 'place', placeKind: value.placeKind, name, x, y, ...(value.secret === true ? { secret: true } : {}) };
  }
  if (value.type === 'creature-zone') {
    if (!CREATURE_KINDS.has(value.creatureKind) || !CREATURE_DENSITIES.has(value.density)) throw new TypeError('Território de criatura inválido.');
    const radius = Number(value.radius);
    if (!Number.isFinite(radius) || radius < 2 || radius > 48) throw new RangeError('O território precisa ter entre 2 e 48 tiles.');
    return { id, type: 'creature-zone', creatureKind: value.creatureKind, density: value.density, x, y, radius };
  }
  if (value.type === 'lake') {
    if (!WATER_KINDS.has(value.waterKind)) throw new TypeError('Tipo de água inválido.');
    const radius = Number(value.radius);
    if (!Number.isFinite(radius) || radius < 3 || radius > 48) throw new RangeError('O lago precisa ter entre 3 e 48 tiles.');
    const outline = normalizeLakeOutline(value.outline, radius);
    return { id, type: 'lake', waterKind: value.waterKind, x, y, radius, ...(outline ? { outline } : {}) };
  }
  const radius = Number(value.radius);
  if (!Number.isFinite(radius) || radius < 2 || radius > 48) {
    throw new RangeError('O raio da região precisa ficar entre 2 e 48 tiles.');
  }
  return { id, type: value.type, x, y, radius };
}

export function normalizeWorldDefinition(value) {
  if (value === undefined || value === null) return emptyWorldDefinition();
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || (value.version !== undefined && value.version !== WORLD_DOCUMENT_VERSION)) {
    throw new TypeError('Versão do mapa compartilhado inválida.');
  }
  const edits = Array.isArray(value.edits) ? value.edits : [];
  if (edits.length > WORLD_EDIT_LIMIT) throw new RangeError('O mapa atingiu o limite de alterações.');
  const normalized = edits.map(edit => normalizeWorldEdit(edit));
  const ids = new Set();
  for (const edit of normalized) {
    if (ids.has(edit.id)) throw new TypeError('O mapa tem identificadores de alteração repetidos.');
    ids.add(edit.id);
  }
  const removedIds = new Set();
  for (const edit of normalized) {
    if (edit.type !== 'edit-remove') continue;
    const target = normalized.find(candidate => candidate.id === edit.targetId);
    if (!target || !['forest', 'clearing', 'hill', 'mountain', 'depression', 'terrain-chunk', 'lake', 'creature-zone', 'place', 'resource', 'tree', 'rock'].includes(target.type)
        || removedIds.has(edit.targetId)) throw new TypeError('A marca que você quer remover não existe mais.');
    removedIds.add(edit.targetId);
  }
  const revision = Number(value.revision ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('Revisão do mapa inválida.');
  const seed = Number(value.seed ?? 32_452_843), generationVersion = Number(value.generationVersion ?? 1);
  const dimensionId = value.dimensionId === undefined ? 'surface' : value.dimensionId;
  const theme = value.theme === undefined ? 'forest'
    : typeof value.theme === 'string' && WORLD_THEMES.has(value.theme) ? value.theme : null;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff
      || !Number.isSafeInteger(generationVersion) || generationVersion < 1) throw new TypeError('Semente do mapa inválida.');
  if (!theme) throw new TypeError('Tema do mundo inválido.');
  if (typeof dimensionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/i.test(dimensionId)) throw new TypeError('Identificador de dimensão inválido.');
  return { version: WORLD_DOCUMENT_VERSION, revision, seed, generationVersion, dimensionId: dimensionId.toLowerCase(), theme, edits: normalized };
}

export function appendWorldEdit(definition, value, { worldSize = 10_000 } = {}) {
  return appendWorldEdits(definition, [value], { worldSize });
}

export function appendWorldEdits(definition, values, { worldSize = 10_000 } = {}) {
  const current = normalizeWorldDefinition(definition);
  if (!Array.isArray(values) || values.length === 0) throw new TypeError('Informe ao menos uma alteração.');
  const edits = values.map(value => normalizeWorldEdit(value, { worldSize }));
  if (current.edits.length + edits.length > WORLD_EDIT_LIMIT) throw new RangeError('O mapa atingiu o limite de alterações.');
  const ids = new Set(current.edits.map(item => item.id));
  for (const edit of edits) {
    if (ids.has(edit.id)) throw new TypeError('Essa alteração já existe.');
    ids.add(edit.id);
    if (edit.type === 'edit-remove') {
      const target = current.edits.find(item => item.id === edit.targetId);
      if (!target || !['forest', 'clearing', 'hill', 'mountain', 'depression', 'terrain-chunk', 'lake', 'creature-zone', 'place', 'resource', 'tree', 'rock'].includes(target.type)
          || current.edits.some(item => item.type === 'edit-remove' && item.targetId === edit.targetId)) {
        throw new TypeError('A marca que você quer remover não existe mais.');
      }
    }
  }
  return normalizeWorldDefinition({ ...current, revision: current.revision + 1, edits: [...current.edits, ...edits] });
}

export function updateWorldEdits(definition, { upserts = [], removeIds = [] } = {}, { worldSize = 10_000 } = {}) {
  const current = normalizeWorldDefinition(definition);
  if (!Array.isArray(upserts) || !Array.isArray(removeIds)
      || removeIds.some(id => typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(id))) {
    throw new TypeError('A atualização do mapa é inválida.');
  }
  const normalized = upserts.map(edit => normalizeWorldEdit(edit, { worldSize }));
  const replacedIds = new Set([...removeIds, ...normalized.map(edit => edit.id)]);
  const edits = current.edits.filter(edit => !replacedIds.has(edit.id));
  edits.push(...normalized);
  if (edits.length > WORLD_EDIT_LIMIT) throw new RangeError('O mapa atingiu o limite de alterações.');
  if (edits.length === current.edits.length && edits.every((edit, index) => edit === current.edits[index])) return current;
  return normalizeWorldDefinition({ ...current, revision: current.revision + 1, edits });
}

export function undoLastWorldEdit(definition) {
  const current = normalizeWorldDefinition(definition);
  let index = -1;
  for (let candidate = current.edits.length - 1; candidate >= 0; candidate -= 1) {
    if (!current.edits[candidate].id.startsWith('dimension-') && !current.edits[candidate].id.startsWith('seed-')
        && !INTERNAL_EDIT_TYPES.has(current.edits[candidate].type)) { index = candidate; break; }
  }
  if (index < 0) throw new Error('Não há alterações administrativas para desfazer.');
  const last=current.edits[index], previous=current.edits[index-1];
  const pairedRemoval=previous&&(
    (previous.type==='edit-remove'&&last.type===current.edits.find(edit=>edit.id===previous.targetId)?.type)
    || (previous.type==='tree-remove'&&(last.type==='tree'||last.type==='resource'))
    || (previous.type==='rock-remove'&&last.type==='rock')
    || (previous.type==='resource-remove'&&last.type==='resource'));
  const removedIndexes=new Set([index,...(pairedRemoval?[index-1]:[])]);
  return { ...current, revision: current.revision + 1, edits: current.edits.filter((_, editIndex) => !removedIndexes.has(editIndex)) };
}

export function canUndoWorldEdit(definition) {
  return normalizeWorldDefinition(definition).edits.some(edit => !edit.id.startsWith('dimension-') && !edit.id.startsWith('seed-')
    && !INTERNAL_EDIT_TYPES.has(edit.type));
}

let activeDefinition = emptyWorldDefinition();
const definitionIndexes = new WeakMap();
let editsByChunk = new Map();
let reliefEditsByChunk = new Map();
let hasReliefEdits = false;
let resourcesByChunk = new Map();
let treesByChunk = new Map();
let treeGrowthByChunk = new Map();
let rocksByChunk = new Map();
let removedTreeIds = new Set();
let removedRockIds = new Set();
let removedResourceIds = new Set();

function resourceCooldownIndexes(definition) {
  const removedEdits = new Set(definition.edits.flatMap(edit => edit.type === 'edit-remove' ? [edit.targetId]
    : edit.type === 'resource-remove' ? [edit.targetId.replace(/^map-/, '')] : []));
  const removedResources = new Set();
  for (const edit of definition.edits) {
    if (edit.type === 'resource-remove'
        || edit.type === 'resource-cooldown' && !removedEdits.has(edit.id)) {
      removedResources.add(edit.targetId.replace(/^map-/, ''));
    }
  }
  return removedResources;
}

function indexDefinition(definition) {
  const chunks = new Map();
  const reliefChunks = new Map();
  let hasRelief = false;
  const resources = new Map();
  const trees = new Map();
  const treeGrowth = new Map();
  const rocks = new Map();
  const removedTrees = new Set();
  const removedRocks = new Set();
  const removedResources = new Set();
  const removedEdits = new Set(definition.edits.flatMap(edit => edit.type === 'edit-remove' ? [edit.targetId]
    : edit.type === 'resource-remove' ? [edit.targetId.replace(/^map-/, '')] : []));
  for (const edit of definition.edits) {
    if (edit.type === 'edit-remove' || edit.type === 'resource-remove') {
      if (edit.type === 'resource-remove') removedResources.add(edit.targetId.replace(/^map-/, ''));
      continue;
    }
    if (removedEdits.has(edit.id)) continue;
    if (edit.type === 'resource-cooldown') {
      removedResources.add(edit.targetId.replace(/^map-/, ''));
      continue;
    }
    if (edit.type === 'work-progress' || edit.type === 'tile-surface') continue;
    const chunkKey = `${Math.floor(edit.x / WORLD_CHUNK_SIZE)},${Math.floor(edit.y / WORLD_CHUNK_SIZE)}`;
    const isRelief = edit.type === 'hill' || edit.type === 'mountain' || edit.type === 'depression' || edit.type === 'terrain-chunk';
    if (isRelief) hasRelief = true;
    if (edit.type === 'tree') {
      if (!trees.has(chunkKey)) trees.set(chunkKey, []);
      trees.get(chunkKey).push(edit);
    } else if (edit.type === 'rock') {
      if (!rocks.has(chunkKey)) rocks.set(chunkKey, []);
      rocks.get(chunkKey).push(edit);
    } else if (edit.type === 'tree-remove') {
      removedTrees.add(edit.targetId);
      if (edit.growthStage) {
        if (!treeGrowth.has(chunkKey)) treeGrowth.set(chunkKey, []);
        treeGrowth.get(chunkKey).push(edit);
      }
    }
    else if (edit.type === 'rock-remove') removedRocks.add(edit.targetId);
    if (edit.type === 'resource') {
      if (!resources.has(chunkKey)) resources.set(chunkKey, []);
      resources.get(chunkKey).push(edit);
    }
    if (edit.type === 'tree-remove' || edit.type === 'rock-remove') continue;
    const radius = ['resource', 'tree', 'rock', 'place'].includes(edit.type) ? 0 : edit.radius;
    const minX = Math.floor((edit.x - radius) / WORLD_CHUNK_SIZE);
    const maxX = Math.floor((edit.x + radius) / WORLD_CHUNK_SIZE);
    const minY = Math.floor((edit.y - radius) / WORLD_CHUNK_SIZE);
    const maxY = Math.floor((edit.y + radius) / WORLD_CHUNK_SIZE);
    for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1) {
      const key = `${cx},${cy}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(edit);
      if (isRelief) {
        if (!reliefChunks.has(key)) reliefChunks.set(key, []);
        reliefChunks.get(key).push(edit);
      }
    }
  }
  return { chunks, reliefChunks, hasRelief, resources, trees, treeGrowth, rocks, removedTrees, removedRocks, removedResources };
}

export function setWorldDefinition(value) {
  if (value === activeDefinition) return activeDefinition;
  let cached = value && typeof value === 'object' ? definitionIndexes.get(value) : null;
  if (!cached) {
    const definition = normalizeWorldDefinition(value);
    const geometryKey = worldGeometryCacheKey(definition);
    const previous = definitionIndexes.get(activeDefinition);
    if (previous?.geometryKey === geometryKey) {
      cached = {
        definition,
        geometryKey,
        staticIndexes: previous.staticIndexes,
        indexes: { ...previous.staticIndexes, removedResources: resourceCooldownIndexes(definition) },
      };
    } else {
      const indexes = indexDefinition(definition);
      const { removedResources: _removedResources, ...staticIndexes } = indexes;
      cached = { definition, geometryKey, staticIndexes, indexes };
    }
    if (value && typeof value === 'object') definitionIndexes.set(value, cached);
    definitionIndexes.set(definition, cached);
  }
  activeDefinition = cached.definition;
  const indexes = cached.indexes;
  editsByChunk = indexes.chunks;
  reliefEditsByChunk = indexes.reliefChunks;
  hasReliefEdits = indexes.hasRelief;
  resourcesByChunk = indexes.resources;
  treesByChunk = indexes.trees;
  treeGrowthByChunk = indexes.treeGrowth;
  rocksByChunk = indexes.rocks;
  removedTreeIds = indexes.removedTrees;
  removedRockIds = indexes.removedRocks;
  removedResourceIds = indexes.removedResources;
  return activeDefinition;
}

export function getWorldDefinition() {
  return activeDefinition;
}

export function worldHasRelief() {
  return activeDefinition.dimensionId === 'ceu' && hasReliefEdits;
}

export function activeWorldEdits(definition = activeDefinition) {
  const removedIds = new Set();
  for (const edit of definition.edits) {
    if (edit.type === 'edit-remove') removedIds.add(edit.targetId);
    else if (edit.type === 'tree-remove') removedIds.add(edit.targetId.replace(/^maptree:/, ''));
    else if (edit.type === 'rock-remove') removedIds.add(edit.targetId);
    else if (edit.type === 'resource-remove') removedIds.add(edit.targetId.replace(/^map-/, ''));
  }
  return definition.edits.filter(edit => !['edit-remove', 'tree-remove', 'rock-remove', 'resource-remove', 'resource-cooldown', 'work-progress'].includes(edit.type)
    && !removedIds.has(edit.id));
}

const tileSurfacesByDefinition = new WeakMap();
export function worldTileSurfaceAt(x, y) {
  const definition = getWorldDefinition();
  let tiles = tileSurfacesByDefinition.get(definition);
  if (!tiles) {
    tiles = new Map(definition.edits.filter(edit => edit.type === 'tile-surface')
      .map(edit => [edit.id, edit.surface]));
    tileSurfacesByDefinition.set(definition, tiles);
  }
  return tiles.size ? tiles.get(`tile-surface-${Math.floor(x)}-${Math.floor(y)}`) : undefined;
}

export function worldEditsAt(x, y) {
  return editsByChunk.get(`${Math.floor(x / WORLD_CHUNK_SIZE)},${Math.floor(y / WORLD_CHUNK_SIZE)}`) || [];
}

export function worldTreeDensityAt(x, y) {
  if (worldWaterAt(x, y)) return 0;
  let density = 0;
  const nearby = worldEditsAt(x, y);
  for (let index = nearby.length - 1; index >= 0; index -= 1) {
    const edit = nearby[index];
    if (edit.type !== 'forest' && edit.type !== 'clearing') continue;
    if (Math.hypot(x - edit.x, y - edit.y) > edit.radius) continue;
    density = edit.type === 'forest' ? 1.8 : 0;
    break;
  }
  return density;
}

function smoothStep(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function plateauFalloff(t) {
  // Wide, level tops and shelves break up the climbs while keeping every edge smooth.
  if (t <= .2) return 1;
  if (t < .54) return 1 - .4 * smoothStep((t - .2) / .34);
  if (t <= .72) return .6;
  if (t < 1) return .6 * (1 - smoothStep((t - .72) / .28));
  return 0;
}

export function worldReliefAt(x, y) {
  // Relief edits remain in saved world data for compatibility, but all dimensions
  // now use a level walking surface.
  return 0;
}

function objectsInBounds(index, bounds, build) {
  const result = [];
  const minX = Math.floor(bounds.left / WORLD_CHUNK_SIZE), maxX = Math.floor(bounds.right / WORLD_CHUNK_SIZE);
  const minY = Math.floor(bounds.top / WORLD_CHUNK_SIZE), maxY = Math.floor(bounds.bottom / WORLD_CHUNK_SIZE);
  const seen = new Set();
  for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1) {
    for (const edit of index.get(`${cx},${cy}`) || []) {
      if (seen.has(edit.id)) continue;
      seen.add(edit.id);
      if (edit.x >= bounds.left && edit.x <= bounds.right && edit.y >= bounds.top && edit.y <= bounds.bottom) result.push(build(edit));
    }
  }
  return result;
}

function stableObjectIndex(id) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return 2_000_000_000 + ((hash >>> 0) % 1_000_000_000);
}

export function worldTreesInBounds(bounds) {
  return objectsInBounds(treesByChunk, bounds, edit => ({
    id: `maptree:${edit.id}`, x: edit.x, y: edit.y, r: .3, index: stableObjectIndex(edit.id),
  })).filter(tree => !removedTreeIds.has(tree.id));
}

export function worldTreeGrowthInBounds(bounds) {
  return objectsInBounds(treeGrowthByChunk, bounds, edit => ({
    id: edit.id, targetId: edit.targetId, stage: edit.growthStage, x: edit.x, y: edit.y,
  }));
}

export function worldLakesIntersecting(bounds) {
  return worldEditsIntersecting(bounds).filter(edit => edit.type === 'lake');
}

export function worldWaterAt(x, y, padding = 0) {
  return worldEditsAt(x, y).some(edit => edit.type === 'lake' && lakeSignedDepthAt(edit, x, y) + padding >= 0);
}

export function worldRocksInBounds(bounds) {
  return objectsInBounds(rocksByChunk, bounds, edit => ({ id: edit.id, x: edit.x, y: edit.y, r: .34 }))
    .filter(rock => !removedRockIds.has(rock.id));
}

export function isWorldTreeRemoved(id) { return removedTreeIds.has(id); }
export function isWorldRockRemoved(id) { return removedRockIds.has(id); }
export function isWorldResourceRemoved(id) { return removedResourceIds.has(String(id).replace(/^map-/, '')); }

export function worldResourcesInBounds(bounds) {
  const result = [];
  const minX = Math.floor(bounds.left / WORLD_CHUNK_SIZE), maxX = Math.floor(bounds.right / WORLD_CHUNK_SIZE);
  const minY = Math.floor(bounds.top / WORLD_CHUNK_SIZE), maxY = Math.floor(bounds.bottom / WORLD_CHUNK_SIZE);
  const seen = new Set();
  for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1) {
    for (const edit of resourcesByChunk.get(`${cx},${cy}`) || []) {
      if (seen.has(edit.id)) continue;
      seen.add(edit.id);
      if (edit.x >= bounds.left && edit.x <= bounds.right && edit.y >= bounds.top && edit.y <= bounds.bottom
          && !removedResourceIds.has(edit.id)) {
        result.push({ id: `map-${edit.id}`, kind: edit.resourceKind, x: edit.x, y: edit.y,
          ...(edit.quantity ? { quantity: edit.quantity } : {}), ...(edit.outputItem ? { outputItem: edit.outputItem, readyAt: edit.readyAt, ...(edit.sourceId ? { sourceId: edit.sourceId } : {}) } : {}),
          ...(edit.respawnAt === undefined ? {} : { respawnAt: edit.respawnAt }) });
      }
    }
  }
  return result;
}

export function worldEditsIntersecting(bounds) {
  const result = [];
  const minX = Math.floor(bounds.left / WORLD_CHUNK_SIZE), maxX = Math.floor(bounds.right / WORLD_CHUNK_SIZE);
  const minY = Math.floor(bounds.top / WORLD_CHUNK_SIZE), maxY = Math.floor(bounds.bottom / WORLD_CHUNK_SIZE);
  const seen = new Set();
  for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1) {
    for (const edit of editsByChunk.get(`${cx},${cy}`) || []) {
      if (seen.has(edit.id)) continue;
      seen.add(edit.id);
      const radius = ['resource', 'tree', 'tree-remove', 'rock', 'rock-remove', 'place'].includes(edit.type) ? 0 : edit.radius;
      if (edit.x + radius >= bounds.left && edit.x - radius <= bounds.right
          && edit.y + radius >= bounds.top && edit.y - radius <= bounds.bottom) result.push(edit);
    }
  }
  return result;
}
