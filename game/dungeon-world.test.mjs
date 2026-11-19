// Mundo da masmorra por nível: uma definição compartilhada, tema 'cave' e soak de ativação (12 instâncias, 24 jogadores).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorldDefinition, setActiveDungeonLevel } from './world.mjs';
import { emptyWorldDefinition, normalizeWorldDefinition, worldGeometryCacheKey } from './world-edits.mjs';
import { dungeonDimensionId, dungeonLevel, instanceIdFor } from './dungeon-instances.mjs';
import { createWorldActivator, dungeonWorldDefinition } from './dungeon-world.mjs';

const surface = normalizeWorldDefinition(emptyWorldDefinition('surface'));
// Limite do cache de geometria em world.mjs (worldChunkCachesByGeometry): mais chaves que isso fazem o LRU girar.
const GEOMETRY_CACHE_LIMIT = 8;
const MODEL_SUFFIX = /-[0-9a-f]{10}$/;

function recordingActivator(applied) {
  return createWorldActivator({
    applyWorldDefinition: definition => { applied.push(definition); applyWorldDefinition(definition); },
    setActiveDungeonLevel, dungeonLevel,
    definitionFor: () => surface, hasDefinition: () => false,
  });
}

// Alterna 24 jogadores entre 12 instâncias por 600 ticks. Devolve quantas trocas de chave de mundo deveriam aplicar.
function alternate(activator, dimensions) {
  let expectedApplies = 0, previousKey = null;
  for (let tick = 0; tick < 600; tick += 1) {
    for (let player = 0; player < 24; player += 1) {
      const dimensionId = dimensions[(player + tick) % dimensions.length];
      const key = dimensionId.replace(MODEL_SUFFIX, '');
      if (key !== previousKey) { expectedApplies += 1; previousKey = key; }
      activator.activate(dimensionId);
    }
  }
  return expectedApplies;
}

test('masmorra: uma definição por nível, com tema cave e a mesma seed em todas as instâncias', () => {
  const first = dungeonWorldDefinition(1);
  assert.equal(dungeonWorldDefinition(1), first, 'o mesmo objeto para todas as instâncias do nível');
  assert.equal(first.theme, 'cave');
  assert.equal(first.dimensionId, 'dg-ninho-n1');
  assert.notEqual(dungeonWorldDefinition(2), first, 'cada nível tem a sua');
});

test('chave de geometria da masmorra usa seed + nível, não o id da instância', () => {
  const base = dungeonWorldDefinition(1);
  const instanceA = { ...base, dimensionId: dungeonDimensionId(1, instanceIdFor('conta-a')) };
  const instanceB = { ...base, dimensionId: dungeonDimensionId(1, instanceIdFor('conta-b')) };
  assert.equal(worldGeometryCacheKey(instanceA), worldGeometryCacheKey(instanceB));
  assert.notEqual(worldGeometryCacheKey(dungeonWorldDefinition(2)), worldGeometryCacheKey(base), 'níveis diferentes, chaves diferentes');
});

test('soak: 12 instâncias e 24 jogadores alternando por 600 ticks não reaplicam o mundo a cada tick, e o LRU não estoura', () => {
  const applied = [];
  try {
    const dimensions = Array.from({ length: 12 }, (_, group) => dungeonDimensionId(1, instanceIdFor(`conta-${group}`)));
    const expectedApplies = alternate(recordingActivator(applied), dimensions);
    assert.equal(applied.length, expectedApplies, 'só aplica quando a chave muda, nunca por tick');
    assert.equal(applied.length, 1, 'um nível, uma aplicação');
    const geometryKeys = new Set(applied.map(definition => worldGeometryCacheKey(definition)));
    assert.ok(geometryKeys.size <= GEOMETRY_CACHE_LIMIT, `chaves de geometria (${geometryKeys.size}) cabem no cache de ${GEOMETRY_CACHE_LIMIT}`);
  } finally {
    setActiveDungeonLevel(null);
  }
});

test('soak misto: instâncias de três níveis aplicam só nas trocas de nível e usam uma chave de geometria por nível', () => {
  const applied = [];
  try {
    const dimensions = Array.from({ length: 12 }, (_, group) => dungeonDimensionId(1 + (group % 3), instanceIdFor(`conta-${group}`)));
    const expectedApplies = alternate(recordingActivator(applied), dimensions);
    assert.equal(applied.length, expectedApplies);
    const geometryKeys = new Set(applied.map(definition => worldGeometryCacheKey(definition)));
    assert.equal(geometryKeys.size, 3, 'um cache por nível, não um por instância (12 chaves estourariam o LRU)');
    assert.ok(geometryKeys.size <= GEOMETRY_CACHE_LIMIT);
  } finally {
    setActiveDungeonLevel(null);
  }
});
