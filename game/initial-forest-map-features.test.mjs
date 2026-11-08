import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialForestMapFeatures, buildWorldMapDetailFeatures, initialForestMapBounds } from './initial-forest-map-features.mjs';
import { RECEPTION_BUILDING, VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { SPAWN, applyWorldDefinition, getFallenTreesInBounds, getResourcesInBounds, getRocksInBounds, getSolidTreesInBounds, getTreeGrowthInBounds, getWorldDefinition } from './world.mjs';
import { DIMENSION_LAYOUT_EDITS, DIMENSION_COORDINATE_OFFSET, isVillagePlazaTile } from './dimension-layout.mjs';

test('initial forest detail survey covers arrival, buildings, paths, and local world objects', async () => {
  const bounds = initialForestMapBounds();
  const contains = (x, y) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  assert.ok(contains(SPAWN.x, SPAWN.y));
  assert.ok(isVillagePlazaTile(DIMENSION_COORDINATE_OFFSET + 18, DIMENSION_COORDINATE_OFFSET + 17));
  assert.ok(!isVillagePlazaTile(DIMENSION_COORDINATE_OFFSET + 24, DIMENSION_COORDINATE_OFFSET + 17));
  assert.ok(!isVillagePlazaTile(DIMENSION_COORDINATE_OFFSET + 22, DIMENSION_COORDINATE_OFFSET + 17), 'plaza edge stays before the Cedar cabin footprint');
  assert.ok(DIMENSION_LAYOUT_EDITS.some(edit => edit.id === 'dimension-forest-arrival-east'));
  assert.ok(DIMENSION_LAYOUT_EDITS.some(edit => edit.id === 'dimension-forest-arrival-south'));
  for (const building of [RECEPTION_BUILDING, ...VILLAGE_BUILDINGS]) {
    assert.ok(contains(building.bounds.left, building.bounds.top), `${building.id} left/top`);
    assert.ok(contains(building.bounds.right, building.bounds.bottom), `${building.id} right/bottom`);
  }
  const features = await buildInitialForestMapFeatures();
  assert.ok(features.paths.length > 0, 'survey should include sampled path tiles');
  assert.ok(features.plaza.length > 0, 'survey should include the central square tiles');
  assert.equal(features.trees.length,getSolidTreesInBounds(bounds).length);
  assert.equal(features.treeGrowth.length,getTreeGrowthInBounds(bounds).length);
  assert.equal(features.resources.length,getResourcesInBounds(bounds).length);
  assert.equal(features.rocks.length,getRocksInBounds(bounds).length);
  assert.equal(features.fallenTrees.length,getFallenTreesInBounds(bounds).length);
  assert.equal(new Set(features.trees.map(tree=>tree.id)).size,features.trees.length,'chunked gathering does not duplicate tree markers');
  for (const category of ['trees', 'treeGrowth', 'resources', 'rocks', 'lakes', 'fallenTrees']) {
    assert.ok(Array.isArray(features[category]), `${category} should be enumerable`);
    assert.ok(features[category].every(item => contains(item.x, item.y)), `${category} coordinates stay within the survey bounds`);
  }
});

test('detailed world map can survey an arbitrary zoomed-in region outside the starter forest',async()=>{
 const bounds={left:320,top:416,right:336,bottom:432};
 const features=await buildWorldMapDetailFeatures(bounds);
 assert.deepEqual(features.bounds,bounds);
 assert.equal(features.terrain.length,16);
 assert.ok(features.terrain.every(row=>row.length===16));
 assert.ok(Array.isArray(features.trees)&&Array.isArray(features.resources)&&Array.isArray(features.paths));
});

test('forest survey follows persisted expansion edits without relocating the starter village', () => {
  const original = getWorldDefinition();
  const expanded = { ...original, revision: original.revision + 1, edits: [
    ...(original.edits || []), { id: 'test-arrival-expansion', type: 'forest', x: SPAWN.x + 60, y: SPAWN.y + 45, radius: 24 },
  ] };
  try {
    applyWorldDefinition(expanded);
    const bounds = initialForestMapBounds();
    assert.ok(bounds.right >= SPAWN.x + 84);
    assert.ok(bounds.bottom >= SPAWN.y + 69);
    assert.equal(SPAWN.x, 88.2);
    assert.equal(SPAWN.y, 92.3);
  } finally {
    applyWorldDefinition(original);
  }
});


test('forest survey cancels when the world changes between work slices', async () => {
  const original=getWorldDefinition();
  try {
    const pending=buildInitialForestMapFeatures();
    applyWorldDefinition({ ...original, dimensionId:'breu', revision:original.revision + 1 });
    await assert.rejects(pending,{name:'AbortError'});
  } finally {applyWorldDefinition(original);}
});


test('map surveys use each dimensions real theme, water and spawn region',async()=>{
 const {DEFAULT_DIMENSIONS,initialWorldForDimension}=await import('./dimensions.mjs');
 const {waterDepthAt}=await import('./waterways.mjs');
 const {WORLD_NATURE_ORIGIN}=await import('./world-scale.mjs');
 const source=getWorldDefinition();
 try{
  for(const dimension of DEFAULT_DIMENSIONS){
   applyWorldDefinition(initialWorldForDimension(dimension));
   const left=Math.floor(dimension.spawn.x)-4,top=Math.floor(dimension.spawn.y)-4;
   const features=await buildWorldMapDetailFeatures({left,top,right:left+8,bottom:top+8});
   assert.equal(features.theme,dimension.theme,dimension.id);
   assert.equal(features.terrain.length,8);
   if(dimension.id==='breu')assert.equal(features.trees.length,0,'the dark world must not invent forest');
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const wet=waterDepthAt(left+x+.5,top+y+.5,{origin:WORLD_NATURE_ORIGIN})>0;
    assert.equal([2,4].includes(features.terrain[y][x]),wet,dimension.id+' water matches physics');
   }
  }
 }finally{applyWorldDefinition(source)}
});


test('obsolete viewport work is cancelled before publishing its details',async()=>{
 let cancelled=false;
 const pending=buildWorldMapDetailFeatures({left:0,top:0,right:64,bottom:64},{shouldCancel:()=>cancelled});
 cancelled=true;
 await assert.rejects(pending,{name:'AbortError'});
});
