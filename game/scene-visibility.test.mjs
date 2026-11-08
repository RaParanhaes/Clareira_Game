import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./main.js',import.meta.url),'utf8');
// Execute the actual render branches with a recording canvas boundary.
const treeBranch=source.slice(source.indexOf("    if (thing.type === 'tree') {",source.indexOf('const terrainStreaming=isTerrainPixelationActive();')),source.indexOf("    if (thing.type === 'world-rock')",source.indexOf('const terrainStreaming=isTerrainPixelationActive();')));
const lightPaint=source.slice(source.indexOf('function paintSceneLightmaps('),source.indexOf('function drawRoomLighting('));
const groundLighting=source.slice(source.indexOf('function drawGroundLighting()'),source.indexOf('function drawClearingHome()'));

test('all solid trees remain drawn at every detail level across the old six-unit cutoff',()=>{
  for(const decorativeDetailLevel of [0,1,2])for(const x of [3.9,4.1,10]){
    const calls=[],trees=Array.from({length:12},(_,index)=>({type:'tree',index,x:10,y:0,tree:{id:index},screen:{x:200,y:200}}));
    runInNewContext(`for(const thing of trees){${treeBranch}}`,{
      trees,decorativeDetailLevel,localRenderPosition:{x,y:0},worldDimensionId:'surface',worldClock:0,
      vegetationSources:[],reducedMotion:true,terrainStreaming:false,selfScreen:{x:100,y:100},
      SOLID_TREE_LIGHTING:new Map(),
      sceneArt:{proximityMotion:()=>({})},drawTree:(tree)=>calls.push(tree.id),
    });
    assert.deepEqual(calls,trees.map(t=>t.tree.id),`detail ${decorativeDetailLevel}, player ${x}`);
  }
});

test('twilight paints exterior lightmaps while full daylight skips them',()=>{
  for(const [night,expected] of [[0,0],[.15,1],[.5,0]]){
    let calls=0;
    runInNewContext(`${groundLighting};drawGroundLighting();`,{
      gameDay:{night},dimensionTheme:'forest',paintSceneLightmaps:()=>calls++,ctx:{},fires:new Map(),
    });
    assert.equal(calls,expected,`night factor ${night}`);
  }
});

test('on-screen lightmaps remain painted when the player crosses eight units; off-screen maps stay culled',()=>{
  for(const x of [7.9,8.1,20]){
    const calls=[],lights=[{id:'visible',x:0,y:0,reach:3,height:2,strength:1},{id:'offscreen',x:-100,y:0,reach:3,height:2,strength:1},{id:'disabled',x:0,y:0,reach:3,height:2,strength:0}];
    runInNewContext(`${lightPaint};paintSceneLightmaps({},.8);`,{
      worldLocation:'clearing',localPosition:{x,y:0},camera:{},viewWidth:1440,viewHeight:900,
      TILE_X:32,TILE_Y:18,HEIGHT_PIXELS:24,spriteScale:2,
      currentSceneLights:()=>({lights,obstacles:[],key:'test'}),point:x=>({x:400+x*32,y:400}),
      lightmapFor:light=>light,paintLightmap:(_ctx,patch)=>calls.push(patch.id),
    });
    assert.deepEqual(calls,['visible']);
  }
});

test('entity culling keeps overlapping crowns and tall avatars while skipping fully off-screen props',()=>{
 const culling=source.slice(source.indexOf('  let visibleCount=0;'),source.indexOf('  lastVisibleThingCount=visibleCount;'));
 const things=[
  {id:'resource-out',type:'resource',screen:{x:-140,y:400}},
  {id:'resource-edge',type:'resource',screen:{x:-20,y:400}},
  {id:'foliage-out',type:'foliage',screen:{x:200,y:-100}},
  {id:'foliage-bottom',type:'foliage',screen:{x:200,y:860}},
  {id:'tree-crown',type:'tree',screen:{x:200,y:940}},
  {id:'tree-above',type:'tree',screen:{x:200,y:-30}},
  {id:'avatar-head',type:'player',screen:{x:200,y:1000},player:{z:2}},
  {id:'avatar-out',type:'player',screen:{x:-400,y:400},player:{}},
  {id:'self',type:'self'},
 ];
 runInNewContext(culling,{things,worldLocation:'clearing',insideBoundaryWall:()=>true,viewWidth:390,viewHeight:844,
  TILE_X:26,HEIGHT_PIXELS:24,spriteScale:1.625});
 assert.deepEqual(things.map(t=>t.id),['resource-edge','foliage-bottom','tree-crown','avatar-head','self']);
});
