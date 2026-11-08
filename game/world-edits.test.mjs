import test from 'node:test';
import assert from 'node:assert/strict';
import { naturalHeight } from './natural-terrain.mjs';
import { DEFAULT_DIMENSIONS, initialWorldForDimension } from './dimensions.mjs';
import { BLOCK_TERRAIN_FEATURE_ID, BLOCK_TERRAIN_MAX_HEIGHT } from './natural-terrain.mjs';
import { surfaceHeight } from './elevation.mjs';
import { WORLD_SIZE, applyWorldDefinition, getResourcesInBounds, getSolidTreesInBounds, getWorldMapOverview } from './world.mjs';
import { activeWorldEdits, appendWorldEdit, canUndoWorldEdit, emptyWorldDefinition, setWorldDefinition, undoLastWorldEdit, worldDefinitionChangesGeometry, worldGeometryCacheKey, worldReliefAt, worldTreeDensityAt } from './world-edits.mjs';

test('shared region layers drive forest density, clearings, relief, and placed resources', () => {
  const origin = emptyWorldDefinition(), centre = { x: 128, y: 160 };
  const bounds = { left: centre.x - 12, right: centre.x + 12, top: centre.y - 12, bottom: centre.y + 12 };
  applyWorldDefinition(origin);
  const before = getSolidTreesInBounds(bounds).filter(tree => Math.hypot(tree.x - centre.x, tree.y - centre.y) <= 10).length;

  let definition = appendWorldEdit(origin, { id:'forest-zone', type:'forest', ...centre, radius:12 }, { worldSize:WORLD_SIZE });
  applyWorldDefinition(definition);
  const forestTrees = getSolidTreesInBounds(bounds).filter(tree => Math.hypot(tree.x - centre.x, tree.y - centre.y) <= 10).length;
  assert.equal(worldTreeDensityAt(centre.x, centre.y), 1.8);
  assert.ok(forestTrees > before, `a dense forest adds trees (${forestTrees} > ${before})`);

  definition = appendWorldEdit(definition, { id:'mountain-zone', type:'mountain', ...centre, radius:8 }, { worldSize:WORLD_SIZE });
  definition = appendWorldEdit(definition, { id:'berry-point', type:'resource', resourceKind:'berries', x:centre.x + 10, y:centre.y }, { worldSize:WORLD_SIZE });
  applyWorldDefinition(definition);
  assert.equal(worldReliefAt(centre.x, centre.y), 0);
  assert.equal(naturalHeight(centre.x, centre.y), 0);
  assert.ok(getResourcesInBounds(bounds).some(resource => resource.id === 'map-berry-point' && resource.kind === 'berries'));
  const overview=getWorldMapOverview();
  const macroChunk=overview.chunks.find(chunk=>chunk.x===Math.floor(centre.x/overview.chunkSize)&&chunk.y===Math.floor(centre.y/overview.chunkSize));
  assert.equal(macroChunk.terrain,'dense-forest');
  assert.ok(!macroChunk.landmarks.some(item=>item.id==='forest-zone'), 'regiões de terreno são áreas coloridas, sem acrescentar placas ao mapa');
  assert.ok(macroChunk.landmarks.some(item=>item.id==='berry-point'&&item.kind==='resource'));

  definition = appendWorldEdit(definition, { id:'clear-zone', type:'clearing', ...centre, radius:5 }, { worldSize:WORLD_SIZE });
  applyWorldDefinition(definition);
  assert.equal(worldTreeDensityAt(centre.x, centre.y), 0, 'the most recent overlapping vegetation edit wins');
  assert.ok(getSolidTreesInBounds(bounds).every(tree => Math.hypot(tree.x - centre.x, tree.y - centre.y) > 5));
  applyWorldDefinition(origin);
});

test('every built-in dimension keeps its old relief locations at ground level', () => {
  for (const dimension of DEFAULT_DIMENSIONS) {
    const definition = initialWorldForDimension(dimension);
    applyWorldDefinition(definition);
    const reliefEdits = definition.edits.filter(edit => ['mountain', 'hill', 'depression'].includes(edit.type));
    for (const edit of reliefEdits) {
      assert.equal(worldReliefAt(edit.x, edit.y), 0, `${dimension.id}/${edit.id} relief`);
      const expected=dimension.id==='ceu'&&edit.id===BLOCK_TERRAIN_FEATURE_ID?BLOCK_TERRAIN_MAX_HEIGHT:0;
      assert.equal(naturalHeight(edit.x, edit.y), expected, `${dimension.id}/${edit.id} natural height`);
      assert.equal(surfaceHeight(edit.x, edit.y), expected, `${dimension.id}/${edit.id} walking height`);
    }
    assert.ok(!getWorldMapOverview().chunks.some(chunk => chunk.terrain === 'mountain' || chunk.terrain === 'highland'),
      `${dimension.id} overview should not mark raised terrain`);
  }
  applyWorldDefinition(emptyWorldDefinition());
});

test('world editor rejects bad region data and out-of-world positions', () => {
  assert.throws(() => appendWorldEdit(emptyWorldDefinition(), { id:'bad-type', type:'unknown', x:5, y:5, radius:8 }));
  assert.throws(() => appendWorldEdit(emptyWorldDefinition(), { id:'bad-radius', type:'forest', x:5, y:5, radius:100 }));
  assert.throws(() => appendWorldEdit(emptyWorldDefinition(), { id:'off-world', type:'hill', x:WORLD_SIZE, y:5, radius:8 }, { worldSize:WORLD_SIZE }));
});

test('alternar dimensões restaura seus próprios índices sem reconstruir o mapa já carregado', () => {
  const forest = appendWorldEdit(emptyWorldDefinition('forest-test'), { id:'wood', type:'forest', x:200, y:200, radius:12 });
  const open = appendWorldEdit(emptyWorldDefinition('open-test'), { id:'field', type:'clearing', x:200, y:200, radius:12 });
  const indexedForest = setWorldDefinition(forest);
  assert.equal(worldTreeDensityAt(200,200),1.8);
  setWorldDefinition(open);
  assert.equal(worldTreeDensityAt(200,200),0);
  assert.equal(setWorldDefinition(forest),indexedForest);
  assert.equal(worldTreeDensityAt(200,200),1.8);
  setWorldDefinition(emptyWorldDefinition());
});

test('coletar recurso preserva a chave da geometria estática do mundo', () => {
  const origin = emptyWorldDefinition('pickup-cache-test');
  const afterPickup = { ...origin, revision: origin.revision + 1,
    edits: [...origin.edits, { id: 'pickup-cooldown', type: 'resource-cooldown', targetId: 'resource-1',
      sourceId: 'resource-1', readyAt: 123, x: 100, y: 100 }] };
  assert.equal(worldGeometryCacheKey(afterPickup), worldGeometryCacheKey(origin));
  assert.equal(worldDefinitionChangesGeometry(origin, afterPickup), false);
  const afterWorkProgress = { ...origin, revision: origin.revision + 1,
    edits: [{ id: 'tree-work', type: 'work-progress', targetId: 'seed:1', targetKind: 'tree', hits: 3, x: 100, y: 100 }] };
  assert.equal(worldGeometryCacheKey(afterWorkProgress), worldGeometryCacheKey(origin));
  assert.equal(worldDefinitionChangesGeometry(origin, afterWorkProgress), false);
  const afterTerrainEdit = { ...afterPickup, revision: afterPickup.revision + 1,
    edits: [...afterPickup.edits, { id: 'pickup-forest', type: 'forest', x: 100, y: 100, radius: 8 }] };
  assert.notEqual(worldGeometryCacheKey(afterTerrainEdit), worldGeometryCacheKey(origin));
  assert.equal(worldDefinitionChangesGeometry(origin, afterTerrainEdit), true);
});

test('desfazer preserva o modelo inicial e remove somente alterações administrativas', () => {
  const seeded = appendWorldEdit(emptyWorldDefinition('breu'), { id:'seed-breu-open', type:'clearing', x:200, y:200, radius:48 });
  assert.equal(canUndoWorldEdit(seeded),false);
  assert.throws(() => undoLastWorldEdit(seeded));
  const edited = appendWorldEdit(seeded, { id:'admin-change', type:'tree', x:210, y:210 });
  assert.equal(canUndoWorldEdit(edited),true);
  assert.deepEqual(undoLastWorldEdit(edited).edits,seeded.edits);
});

test('remover marcações e recursos esconde o item do mundo e desfazer restaura o original', () => {
  const bounds={left:80,right:120,top:80,bottom:120};
  let definition=emptyWorldDefinition('edit-remove-test');
  definition=appendWorldEdit(definition,{id:'remove-hill',type:'hill',x:100,y:100,radius:12});
  definition=appendWorldEdit(definition,{id:'remove-hotel',type:'place',placeKind:'hotel',name:'Hotel de teste',x:102,y:101});
  definition=appendWorldEdit(definition,{id:'remove-berries',type:'resource',resourceKind:'berries',x:104,y:103});
  applyWorldDefinition(definition);
  assert.ok(getResourcesInBounds(bounds).some(item=>item.id==='map-remove-berries'));
  const hotel=definition.edits.find(edit=>edit.id==='remove-hotel');
  const hill=definition.edits.find(edit=>edit.id==='remove-hill');
  definition=appendWorldEdit(definition,{id:'delete-hotel',type:'edit-remove',targetId:hotel.id,x:hotel.x,y:hotel.y});
  definition=appendWorldEdit(definition,{id:'delete-berries',type:'resource-remove',targetId:'map-remove-berries',x:104,y:103});
  definition=appendWorldEdit(definition,{id:'delete-hill',type:'edit-remove',targetId:hill.id,x:hill.x,y:hill.y,radius:hill.radius});
  applyWorldDefinition(definition);
  assert.ok(!activeWorldEdits(definition).some(edit=>edit.id==='remove-hotel'||edit.id==='remove-hill'));
  assert.ok(!getResourcesInBounds(bounds).some(item=>item.id==='map-remove-berries'));
  assert.equal(worldReliefAt(100,100),0);
  const restored=undoLastWorldEdit(definition);
  applyWorldDefinition(restored);
  assert.ok(activeWorldEdits(restored).some(edit=>edit.id==='remove-hill'));
  assert.equal(worldReliefAt(100,100),0);
  applyWorldDefinition(emptyWorldDefinition());
});


test('reindexação por cooldown preserva remoções permanentes sem contaminar outra definição', () => {
  const bounds={left:0,right:24,top:0,bottom:24};
  let definition=emptyWorldDefinition('cooldown-index');
  definition=appendWorldEdit(definition,{id:'berry-index',type:'resource',resourceKind:'berries',x:10,y:10});
  definition=appendWorldEdit(definition,{id:'wood-index',type:'resource',resourceKind:'wood',x:12,y:12});
  definition=appendWorldEdit(definition,{id:'remove-berry-index',type:'resource-remove',targetId:'map-berry-index',x:10,y:10});
  setWorldDefinition(definition);
  assert.ok(!getResourcesInBounds(bounds).some(resource=>resource.id==='map-berry-index'));
  const cooldown=appendWorldEdit(definition,{id:'cooldown-wood-index',type:'resource-cooldown',targetId:'map-wood-index',sourceId:'wood-index',readyAt:1000,x:12,y:12});
  setWorldDefinition(cooldown);
  assert.ok(!getResourcesInBounds(bounds).some(resource=>resource.id==='map-berry-index'));
  assert.ok(!getResourcesInBounds(bounds).some(resource=>resource.id==='map-wood-index'));
  setWorldDefinition(definition);
  assert.ok(!getResourcesInBounds(bounds).some(resource=>resource.id==='map-berry-index'));
  assert.ok(getResourcesInBounds(bounds).some(resource=>resource.id==='map-wood-index'));
  setWorldDefinition(emptyWorldDefinition('unrelated-dimension'));
  setWorldDefinition(cooldown);
  assert.ok(!getResourcesInBounds(bounds).some(resource=>resource.id==='map-berry-index'));
  assert.ok(!getResourcesInBounds(bounds).some(resource=>resource.id==='map-wood-index'));
  setWorldDefinition(emptyWorldDefinition());
});

test('remoção genérica exige alvo existente e não permite apagar conteúdo-base', () => {
  const base=emptyWorldDefinition('remove-validation');
  assert.throws(()=>appendWorldEdit(base,{id:'bad-delete',type:'edit-remove',targetId:'missing-mark',x:5,y:5}));
  assert.throws(()=>appendWorldEdit(base,{id:'bad-seed-delete',type:'edit-remove',targetId:'seed-template',x:5,y:5}));
});
