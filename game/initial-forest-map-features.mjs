import {
  getFallenTreesInBounds, getLakesInBounds, getResourcesInBounds,
  getRocksInBounds, getSolidTreesInBounds, getTreeGrowthInBounds,
  getWorldDefinition, isPathTile, SPAWN, WORLD_SIZE,
} from './world.mjs';
import { worldTreeDensityAt } from './world-edits.mjs';
import { RECEPTION_BUILDING, VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { DIMENSION_COORDINATE_OFFSET, isVillagePlazaTile } from './dimension-layout.mjs';
import { waterSurfaceDepthAt } from './waterways.mjs';
import { WORLD_NATURE_ORIGIN } from './world-scale.mjs';
import { surfaceHeight } from './elevation.mjs';

// A close survey around the arrival clearing, derived from the live world and
// object catalog. It is a read-only view; coordinates are never rewritten.
export function initialForestMapBounds() {
  const buildings = [RECEPTION_BUILDING, ...VILLAGE_BUILDINGS];
  const anchors = [{ x: SPAWN.x, y: SPAWN.y }, ...buildings.flatMap(({ bounds }) => [
    { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.bottom },
  ])];
  const localForestEdits=(getWorldDefinition().edits||[]).filter(edit=>edit.type==='forest'&&Math.hypot(edit.x-SPAWN.x,edit.y-SPAWN.y)<=100);
  for(const edit of localForestEdits)anchors.push({x:edit.x-edit.radius,y:edit.y-edit.radius},{x:edit.x+edit.radius,y:edit.y+edit.radius});
  const margin = 14;
  return {
    left: Math.max(0, Math.floor(Math.min(...anchors.map(p => p.x)) - margin)),
    top: Math.max(0, Math.floor(Math.min(...anchors.map(p => p.y)) - margin)),
    right: Math.min(WORLD_SIZE, Math.ceil(Math.max(...anchors.map(p => p.x)) + margin)),
    bottom: Math.min(WORLD_SIZE, Math.ceil(Math.max(...anchors.map(p => p.y)) + margin)),
  };
}

function yieldToBrowser() {
  // A busy game can starve idle callbacks even when the map is open. A timer
  // yields input/animation work without waiting for the renderer to become idle.
  return new Promise(resolve => setTimeout(resolve, 0));
}

export async function buildWorldMapDetailFeatures(requestedBounds, { shouldCancel = () => false } = {}) {
  const definition = getWorldDefinition();
  const yieldCurrentWorld = async () => {
    await yieldToBrowser();
    if (getWorldDefinition() !== definition || shouldCancel()) {
      const error = new Error('O mundo mudou durante a preparação do mapa.');
      error.name = 'AbortError';
      throw error;
    }
  };
  const bounds = {
    left: Math.max(0, Math.floor(requestedBounds.left)),
    top: Math.max(0, Math.floor(requestedBounds.top)),
    right: Math.min(WORLD_SIZE, Math.ceil(requestedBounds.right)),
    bottom: Math.min(WORLD_SIZE, Math.ceil(requestedBounds.bottom)),
  };
  if(bounds.right<=bounds.left||bounds.bottom<=bounds.top)throw new RangeError('A área do mapa precisa ter largura e altura.');
  const position = (item) => ({ ...item, radius: Number(item.radius ?? item.r) || 0.3 });
  const paths = [];
  const plaza = [];
  const terrain = [];
  let sliceStarted=performance.now();
  for (let y = Math.floor(bounds.top); y < bounds.bottom; y++) {
    const row = new Uint8Array(bounds.right - bounds.left);
    for (let x = Math.floor(bounds.left); x < bounds.right; x++) {
      if (definition.dimensionId==='surface'&&isVillagePlazaTile(x + 0.5, y + 0.5)) plaza.push({ x: x + 0.5, y: y + 0.5 });
      else if (isPathTile(x + 0.5, y + 0.5)) paths.push({ x: x + 0.5, y: y + 0.5 });
      const water=waterSurfaceDepthAt(x+.5,y+.5,{origin:WORLD_NATURE_ORIGIN});
      row[x - bounds.left] = water>0 ? (water<.45?4:2) : surfaceHeight(x+.5,y+.5)>.1 ? 3 : worldTreeDensityAt(x + 0.5, y + 0.5) > 0 ? 1 : 0;
      if((x&7)===7&&performance.now()-sliceStarted>=3){await yieldCurrentWorld();sliceStarted=performance.now();}
    }
    terrain.push(row);
    if(performance.now()-sliceStarted>=3){await yieldCurrentWorld();sliceStarted=performance.now();}
  }
  const collectByPatches=async getter=>{
    const items=[],step=32,epsilon=1e-7;
    for(let top=Math.floor(bounds.top/step)*step;top<bounds.bottom;top+=step)for(let left=Math.floor(bounds.left/step)*step;left<bounds.right;left+=step){
      const patch={left:Math.max(bounds.left,left),top:Math.max(bounds.top,top),right:Math.min(bounds.right,left+step-epsilon),bottom:Math.min(bounds.bottom,top+step-epsilon)};
      items.push(...getter(patch).map(position));
      if(performance.now()-sliceStarted>=3){await yieldCurrentWorld();sliceStarted=performance.now();}
    }
    return items;
  };
  const trees=await collectByPatches(getSolidTreesInBounds);
  const treeGrowth=await collectByPatches(getTreeGrowthInBounds);
  const resources=await collectByPatches(getResourcesInBounds);
  const rocks=await collectByPatches(getRocksInBounds);
  const lakes=getLakesInBounds(bounds).map(position);await yieldCurrentWorld();
  const fallenTrees=await collectByPatches(getFallenTreesInBounds);
  if (getWorldDefinition() !== definition || shouldCancel()) {
    const error = new Error('A região do mapa deixou de ser necessária.');
    error.name = 'AbortError';
    throw error;
  }
  return {
    theme:definition.theme,
    buildings:definition.dimensionId==='surface'?[RECEPTION_BUILDING,...VILLAGE_BUILDINGS].map(building=>({id:building.id,bounds:{...building.bounds}})):[],
    bounds,
    paths, plaza, terrain,
    villageSquare:{id:'dimension-clearing-village-square',x:DIMENSION_COORDINATE_OFFSET+18,y:DIMENSION_COORDINATE_OFFSET+17,radiusX:3.8,radiusY:3.2},
    trees, treeGrowth, resources, rocks, lakes, fallenTrees,
  };
}

export async function buildInitialForestMapFeatures() {
  return buildWorldMapDetailFeatures(initialForestMapBounds());
}
