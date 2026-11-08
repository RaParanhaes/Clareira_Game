import { getWorldDefinition, worldEditsAt } from './world-edits.mjs';
import { terrainChunkCellAt } from './terrain-chunks.mjs';
import { DIMENSION_COORDINATE_OFFSET } from './dimension-layout.mjs';

// The first block-terrain trial is limited to the western island in Altos do Céu.
// Heights are shared with the server through naturalHeight/surfaceHeight; the
// mesh is a client-side view derived from the same seeded region edit.
export const BLOCK_TERRAIN_DIMENSION = 'ceu';
export const BLOCK_TERRAIN_FEATURE_ID = 'seed-ceu-island-east';
export const BLOCK_TERRAIN_CELL = 1;
export const BLOCK_TERRAIN_STEP = .25;
export const BLOCK_TERRAIN_MAX_HEIGHT = 3.5;
const BLOCKS_PER_UNIT = 1 / BLOCK_TERRAIN_STEP;

export const TERRAIN_BOUNDS={left:29+DIMENSION_COORDINATE_OFFSET,right:41+DIMENSION_COORDINATE_OFFSET,top:14+DIMENSION_COORDINATE_OFFSET,bottom:28+DIMENSION_COORDINATE_OFFSET};

function moundEdit(definition=getWorldDefinition()) {
 if(definition.dimensionId!==BLOCK_TERRAIN_DIMENSION)return null;
 const removed=new Set(definition.edits.filter(edit=>edit.type==='edit-remove').map(edit=>edit.targetId));
 return definition.edits.find(edit=>edit.id===BLOCK_TERRAIN_FEATURE_ID&&edit.type==='mountain'&&!removed.has(edit.id))||null;
}
function moundCellHeight(edit,x,y){
 if(!edit)return 0;
 const nx=(x-edit.x)/(edit.radius||1),ny=(y-edit.y)/(edit.radius||1);
 const radial=Math.hypot(nx,ny);
 if(radial>=1)return 0;
 // Keep the rise gradual enough that neighboring one-tile terraces differ by
 // at most one physical traversal step; hard ledges remain visibly blocky.
 const eased=1-radial;
 const stepped=Math.floor((eased*BLOCK_TERRAIN_MAX_HEIGHT+1e-7)*BLOCKS_PER_UNIT)/BLOCKS_PER_UNIT;
 return Math.max(0,Math.min(BLOCK_TERRAIN_MAX_HEIGHT,stepped));
}
function cellOrigin(value){return Math.floor(value/BLOCK_TERRAIN_CELL)*BLOCK_TERRAIN_CELL}
function cellHeight(edit,x,y){return moundCellHeight(edit,x+BLOCK_TERRAIN_CELL/2,y+BLOCK_TERRAIN_CELL/2)}

function savedTerrainCell(x,y){
 const cellX=Math.floor(x),cellY=Math.floor(y);
 for(const edit of worldEditsAt(cellX+.5,cellY+.5)){
  if(edit.type!=='terrain-chunk')continue;
  const cell=terrainChunkCellAt(edit,cellX+.5,cellY+.5);
  if(cell)return {edit,cell};
 }
 return null;
}

export function naturalHeight(x,y){
 const saved=savedTerrainCell(x,y);
 if(saved)return saved.cell.height;
 const edit=moundEdit();
 return cellHeight(edit,cellOrigin(x),cellOrigin(y));
}

export function isNaturalAccess(x,y){return naturalHeight(x,y)>.02}

export function getNaturalPatches(bounds){
 const edit=moundEdit(),cell=BLOCK_TERRAIN_CELL;
 const left=Math.max(0,cellOrigin(bounds.left)),top=Math.max(0,cellOrigin(bounds.top));
 const right=Math.ceil(bounds.right/cell)*cell,bottom=Math.ceil(bounds.bottom/cell)*cell,patches=[];
 const cellCache=new Map();
 const sample=(x,y)=>{
  const key=`${x}:${y}`;
  if(cellCache.has(key))return cellCache.get(key);
  const saved=savedTerrainCell(x+.5,y+.5);
  const value=saved?{height:saved.cell.height,saved}
    :{height:cellHeight(edit,x,y),saved:null};
  cellCache.set(key,value);return value;
 };
 for(let y=top;y<bottom;y+=cell)for(let x=left;x<right;x+=cell){
  const current=sample(x,y),height=current.height;
  if(height<=0)continue;
  const east=sample(x+cell,y).height,south=sample(x,y+cell).height,faces=[];
  const savedCell=current.saved?.cell,environment=current.saved?.edit;
  const wallMaterialId=savedCell?.wallMaterialId;
  if(height>east+.001)faces.push({id:`${x}:${y}:east`,orientation:'east',x:x+cell,y:y+cell/2,
   edge:[[x+cell,y,height],[x+cell,y+cell,height],[x+cell,y+cell,east],[x+cell,y,east]],height,base:east,
   ...(wallMaterialId?{materialId:wallMaterialId}:{}),damage:savedCell?.damage||0,snow:savedCell?.snow||0});
  if(height>south+.001)faces.push({id:`${x}:${y}:south`,orientation:'south',x:x+cell/2,y:y+cell,
   edge:[[x+cell,y+cell,height],[x,y+cell,height],[x,y+cell,south],[x+cell,y+cell,south]],height,base:south,
   ...(wallMaterialId?{materialId:wallMaterialId}:{}),damage:savedCell?.damage||0,snow:savedCell?.snow||0});
  patches.push({x,y,h:height,height,corners:[height,height,height,height],faces,
   ...(savedCell?{materialId:savedCell.materialId,wallMaterialId:savedCell.wallMaterialId,
     variantSeed:savedCell.variantSeed,damage:savedCell.damage,snow:savedCell.snow,
     season:environment.season,weather:environment.weather}: {})});
 }
 return patches;
}

export const NATURAL_PATCHES=[];
