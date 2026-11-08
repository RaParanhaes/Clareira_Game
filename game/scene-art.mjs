import { WORLD_NATURE_ORIGIN } from './world-scale.mjs';
import { isPathTile, WORLD_SIZE, WORLD_TILE_X, WORLD_TILE_Y } from './world.mjs';
import { getWorldDefinition, worldGeometryCacheKey, worldTileSurfaceAt, worldTreeDensityAt } from './world-edits.mjs';
import { waterBankDepthAt, waterSurfaceDepthAt, waterPlantExcludedAt, waterShoreTileAt } from './waterways.mjs';
import { isDimensionPathTile, isDimensionSecretPathTile, isVillagePlazaTile } from './dimension-layout.mjs';
import { treeWindAt, windDirectionAt } from './wind.mjs';
import { villageBuildingAt, RECEPTION_BUILDING } from './village-buildings.mjs';
import { objectCatalogRevision } from './object-state.mjs';
import { isReceptionFootway } from './village-ground.mjs';
// Original code-native pixel art: stable grids, cached textures, shared night lighting.
const random = (x,y) => { const n=Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); };
const TREE_BROADLEAF_CLUSTERS=[[30,23,17],[18,38,16],[49,36,19],[15,55,14],[36,53,21],[59,57,14],[31,69,14]];
const TREE_CANOPY_GROUPS=[[0],[1,3],[2,5],[4,6]];
const TREE_LEAF_TUFTS=[[30,22,1.05,0],[19,40,.92,1],[50,35,.84,2],[18,55,.62,1],[38,53,.72,3],[57,57,.55,2],[32,65,.38,3]];
const TREE_WIND_CYCLE_SECONDS=14,TREE_WIND_FADE=.06,TREE_WIND_ACTIVE_WINDOW=.28;
const BROADLEAF_CANOPY_WEIGHTS=[1,.79,.79,.42];
const BROADLEAF_CANOPY_LAGS=[0,.28,.12,.48];
const PINE_CANOPY_WEIGHTS=[1,.88,.74,.60,.46];
const GRASS_SURFACE_VARIANTS=[0,1,2,3];
const TERRAIN_TILE_ORDER=[];
for(let diagonal=0;diagonal<=14;diagonal++){
  for(let x=Math.max(0,diagonal-7);x<=Math.min(7,diagonal);x++)TERRAIN_TILE_ORDER.push({x,y:diagonal-x});
}
const FOLIAGE_PALETTES=Object.freeze({
  forest:{shadow:'#122520',dark:'#1a372c',leaf:'#376449',light:'#688958',tip:'#9bb56c',stem:'#5e4937',blooms:['#d86472','#ed9ab5','#e8d6a5','#d29bd0'],glow:'#e7be78'},
  dark:{shadow:'#10121e',dark:'#242736',leaf:'#35384a',light:'#615a70',tip:'#9b8bad',stem:'#403946',blooms:['#804d69','#a2739d','#c299b0','#755ca2'],glow:'#b4a0df'},
  sky:{shadow:'#46686a',dark:'#5c8581',leaf:'#76a59a',light:'#a5c3a2',tip:'#d4d59d',stem:'#756b58',blooms:['#e8a8ae','#f2cfb1','#d4b8e0','#f3e2b7'],glow:'#eaf0c7'},
  magic:{shadow:'#162c35',dark:'#23463f',leaf:'#326c5b',light:'#58a17a',tip:'#a2d484',stem:'#5d493d',blooms:['#df79b9','#c694ef','#edbb70','#72d6ce'],glow:'#c0ed9b'},
  inferno:{shadow:'#281d1a',dark:'#472c24',leaf:'#664234',light:'#94603d',tip:'#c17a42',stem:'#594033',blooms:['#e56845','#ef9b51','#d45460','#e6bd6a'],glow:'#ffd174'},
  giants:{shadow:'#1b281e',dark:'#304331',leaf:'#506447',light:'#82905a',tip:'#bac06e',stem:'#62513a',blooms:['#d67464','#e2b764','#d9a6b2','#f0db8b'],glow:'#e5ca7b'},
  energy:{shadow:'#102a35',dark:'#194354',leaf:'#247064',light:'#38a38d',tip:'#8ee0b1',stem:'#36525a',blooms:['#48d4e2','#81ecd1','#62c2ed','#d3f18f'],glow:'#a3f4e0'},
});
const FOLIAGE_CELL_SIZE=3.15;
const NO_FOLIAGE=Object.freeze({});
const WATER_ORIGIN=WORLD_NATURE_ORIGIN;
const WATER_OPTIONS=Object.freeze({origin:WATER_ORIGIN});
function treeWindEnvelope(time,seed){
  const phase=((time/TREE_WIND_CYCLE_SECONDS+seed)%1+1)%1,fade= TREE_WIND_FADE;
  if(phase<fade){const t=phase/fade;return t*t*(3-2*t);}
  if(phase<TREE_WIND_ACTIVE_WINDOW-fade)return 1;
  if(phase<TREE_WIND_ACTIVE_WINDOW){const t=(phase-(TREE_WIND_ACTIVE_WINDOW-fade))/fade;return 1-t*t*(3-2*t);}
  return 0;
}
function surface(width,height) { const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return [canvas,canvas.getContext('2d')]; }
export function createSceneArt() {
  const terrainCoordinateKey=(cx,cy)=>String(cx)+":"+String(cy);
  const tiles=new Map(), trees=new Map(), treeCanopies=new Map(), treeCanopyComposites=new Map(), simplifiedTreeImages=new Map(), treeShadowSilhouettes=new Map(), foliageSprites=new Map(), foliageCells=new Map(), groundChunks=new Map(), terrainQueue=[], terrainPlaceholders=new Map(), terrainScenes=new Map(), vegetationReactions=new Map(), pixelatedTerrain=new WeakMap();
  let completedTerrain=new Map(),terrainCacheHits=0;
  let foliageCellWorldKey='';
  let terrainWorldKey="",terrainWorldDefinition=null;
  let grassSurfaceAtlas=null,soilMaterialAtlas=null,soilFadeAtlas=null,grassGroundRevision=0;
  let terrainVisiblePriority=new Set(),terrainLookaheadPriority=new Set(),terrainPrioritySignature='';
  // 4K at minimum zoom exposes up to 145 chunks in the sampled viewport sweep.
  // Follow visible count plus eight warm chunks; 160 bounds full terrain to ~101 MB.
  const MIN_TERRAIN_CHUNKS=128,MAX_TERRAIN_CHUNKS=160;
  let terrainChunkLimit=MIN_TERRAIN_CHUNKS;
  const trimTerrainImages=()=>{
    const images=new Set([...terrainScenes.values()].flatMap(scene=>[...scene.values()]));
    for(const entry of groundChunks.values())if(entry.image)images.add(entry.image);
    const activeImages=new Set([...groundChunks.values()].map(entry=>entry.image).filter(Boolean));
    for(const [sceneKey,scene] of terrainScenes){
      for(const [key,image] of scene){
        if(images.size<=MAX_TERRAIN_CHUNKS)break;
        if(activeImages.has(image))continue;
        scene.delete(key);images.delete(image);
      }
      if(!scene.size&&scene!==completedTerrain)terrainScenes.delete(sceneKey);
    }
  };
  const noReaction=Object.freeze({x:0,y:0});
  const treeBranchOffsetX=new Float64Array(5),treeBranchOffsetY=new Float64Array(5);
  const treeBranchOffsets={x:treeBranchOffsetX,y:treeBranchOffsetY};
  const leafTuftX=new Int32Array(TREE_LEAF_TUFTS.length),leafTuftY=new Int32Array(TREE_LEAF_TUFTS.length);
  const leafTuftWidth=new Int32Array(TREE_LEAF_TUFTS.length),leafTuftHeight=new Int32Array(TREE_LEAF_TUFTS.length);
  const vineX=new Int32Array(120),vineY=new Int32Array(120),vineLeafSide=new Int8Array(120);
  function proximityMotion(key,x,y,time,sources=[],radius=1.25,amplitude=3,reducedMotion=false) {
    if(reducedMotion){vegetationReactions.delete(key);return noReaction;}
    let targetX=0,targetY=0;
    for(const source of sources){
      const dx=x-source.x,dy=y-source.y,distance=Math.hypot(dx,dy);
      if(distance>=radius)continue;
      const speedX=Number(source.vx)||0,speedY=Number(source.vy)||0,speed=Math.hypot(speedX,speedY);
      if(speed<.12)continue;
      const pressure=(1-distance/radius)**1.55*Math.min(1,speed/1.65);
      const motionX=(speedX-speedY)*WORLD_TILE_X,motionY=(speedX+speedY)*WORLD_TILE_Y;
      const motionLength=Math.hypot(motionX,motionY)||1;
      const awayX=(dx-dy)*WORLD_TILE_X,awayY=(dx+dy)*WORLD_TILE_Y;
      const awayLength=Math.hypot(awayX,awayY);
      const awayDirectionX=awayLength>.001?awayX/awayLength:-motionX/motionLength;
      const awayDirectionY=awayLength>.001?awayY/awayLength:-motionY/motionLength;
      targetX+=(awayDirectionX*.9+motionX/motionLength*.1)*pressure*amplitude;
      targetY+=(awayDirectionY*.9+motionY/motionLength*.1)*pressure*amplitude;
    }
    const targetLength=Math.hypot(targetX,targetY);
    if(targetLength>amplitude){targetX*=amplitude/targetLength;targetY*=amplitude/targetLength;}
    let state=vegetationReactions.get(key);
    if(!state){
      if(targetLength<.015)return noReaction;
      state={x:0,y:0,vx:0,vy:0,time};
      vegetationReactions.set(key,state);
      return noReaction;
    }
    const dt=Math.max(0,Math.min(1,time-state.time));
    state.time=time;
    if(dt>0){
      const omega=16,decay=Math.exp(-omega*dt);
      const errorX=state.x-targetX,errorY=state.y-targetY;
      const termX=state.vx+omega*errorX,termY=state.vy+omega*errorY;
      state.x=targetX+(errorX+termX*dt)*decay;
      state.y=targetY+(errorY+termY*dt)*decay;
      state.vx=(state.vx-omega*termX*dt)*decay;
      state.vy=(state.vy-omega*termY*dt)*decay;
    }
    if(targetLength<.015&&Math.hypot(state.x,state.y,state.vx,state.vy)<.04){
      vegetationReactions.delete(key);
      return noReaction;
    }
    if(vegetationReactions.size>512)vegetationReactions.delete(vegetationReactions.keys().next().value);
    return state;
  }
  function tileImage(kind,variant,themeOverride) {
    const theme=themeOverride||getWorldDefinition().theme;
    const key=`${theme}:${kind}:${variant}`; if(tiles.has(key)) return tiles.get(key);
    const [image,c]=surface(64,36);
    c.beginPath();c.moveTo(32,0);c.lineTo(64,18);c.lineTo(32,36);c.lineTo(0,18);c.closePath();c.clip();
    const themedGround=({dark:['#000000'],sky:['#8ca5ae','#90a9b1','#879fa9'],magic:['#363c50','#394054','#343b4f'],inferno:['#50362d','#55382e','#4e332c'],giants:['#30473c','#344b3f'],energy:['#294d59','#2c525e','#274a56']})[theme];
    const palette=kind==='ground'&&themedGround?themedGround:kind==='water'?['#183a4e','#1b4052','#214557']:kind==='sand'?['#cbb98a','#d8c89b','#c1ad79']:
      kind==='shore-dirt'?['#756849','#837351','#6d6249']:kind==='shore-gravel'?['#777767','#858371','#6f7063']:kind==='shore-grass'?['#3b5542','#425b46','#36503f']:kind==='plaza'?['#92866e','#a09275','#887e69']:kind==='path'?['#74664d','#796b50','#6e614b']
      :kind==='secret-path'?['#554b58','#5f5261','#584d59']:['#27443e','#28463f','#28453f','#29453f'];
    c.fillStyle=palette[variant%palette.length];c.fillRect(0,0,64,36);
    for(let i=0;i<(kind==='ground'&&theme==='dark'?0:kind==='ground'?1:kind==='sand'?8:kind==='shore-dirt'?8:kind==='shore-gravel'?12:kind==='shore-grass'?6:kind==='path'||kind==='secret-path'?5:kind==='plaza'?8:12);i++) {
      const x=Math.floor(random(i+variant*23,4)*64),y=Math.floor(random(i,variant*7+2)*36);
      const bright=random(i+11,variant)> .55;
      c.fillStyle=kind==='ground'?(bright?'#52715b':'#1b403d'):kind==='plaza'?(bright?'#c2b28d':'#6c6352'):kind==='sand'?(bright?'#ead9a6':'#9b875c')
        :kind==='shore-dirt'?(bright?'#aa936a':'#554b3c'):kind==='shore-gravel'?(bright?'#b3ad98':'#55564d')
        :kind==='shore-grass'?(bright?'#789261':'#263d35'):kind==='path'?(bright?'#ad9570':'#5e543f')
        :kind==='secret-path'?(bright?'#947b99':'#514755'):(bright?'#426679':'#16354a');
      c.fillRect(x,y,kind==='path'||kind==='plaza'?3:2,kind==='ground'?2:1);
      if(kind==='ground' && i%8===0){c.fillStyle='#799367';c.fillRect(x,y-2,1,2);}
    }
    tiles.set(key,image);return image;
  }
  const forestPathAt=(x,y)=>isPathTile(x+.5,y+.5)||isReceptionFootway(x+.5,y+.5,RECEPTION_BUILDING);
  function tile(ctx,p,x,y,kind,tx,ty,time,depth=0) {
    const definition=getWorldDefinition();
    const forestSurface=definition.dimensionId==='surface'&&definition.theme==='forest';
    if(forestSurface&&soilMaterialAtlas&&kind==='path'){
      const roll=random(x+31.7,y+13.9);
      const variant=Math.floor(roll*24);
      ctx.save();
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(soilMaterialAtlas,(variant%6)*64,Math.floor(variant/6)*36,64,36,
        Math.round(p.x-32),Math.round(p.y-18),64,36);
      ctx.restore();
      return;
    }
    if(kind==='ground'||kind==='grass-edge'){
      if(grassSurfaceAtlas&&forestSurface){
        const roll=random(x+17.7,y+29.3);
        const variant=GRASS_SURFACE_VARIANTS[Math.floor(roll*GRASS_SURFACE_VARIANTS.length)];
        ctx.save();
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(grassSurfaceAtlas,(variant%4)*64,Math.floor(variant/4)*36,64,36,
          Math.round(p.x-32),Math.round(p.y-18),64,36);
        if(kind==='grass-edge'&&soilFadeAtlas&&roll<.3){
          const fadeRoll=random(x+83.9,y+29.3);
          const fadeRow=fadeRoll<.2?4:5;
          const fadeVariant=Math.floor(random(x+49.1,y+67.3)*6);
          ctx.drawImage(soilFadeAtlas,fadeVariant*64,fadeRow*36,64,36,
            Math.round(p.x-32),Math.round(p.y-18),64,36);
        }
        ctx.restore();
        return;
      }
    }
    const variant=Math.floor(random(Math.floor(x),Math.floor(y))*12);
    const previousAlpha=ctx.globalAlpha;
    if(kind==='water'){
      ctx.globalAlpha=previousAlpha*(.58+Math.min(1.2,depth)*.16);
    }
    ctx.drawImage(tileImage(kind,variant),Math.round(p.x-tx)-1,Math.round(p.y-ty)-1,tx*2+2,ty*2+2);
    ctx.globalAlpha=previousAlpha;
  }
  function treeImage(index,warm=false) {
    const key='trunk'; if(trees.has(key))return trees.get(key);
    const [image,c]=surface(80,104);
    c.fillStyle='#302d2d';c.fillRect(35,65,10,35);
    c.fillStyle='#715b45';c.fillRect(37,61,6,35);
    c.fillStyle='#b39163';c.fillRect(37,70,2,25);
    c.fillStyle='#1b3333';c.fillRect(42,70,3,29);
    c.fillStyle='#51473a';c.fillRect(31,96,19,3);c.fillRect(27,99,26,2);
    c.fillStyle='#836345';c.fillRect(30,94,7,3);c.fillRect(25,98,9,2);c.fillRect(43,96,10,3);
    c.fillStyle='#302d2d';c.fillRect(40,82,1,10);c.fillRect(36,73,1,8);
    c.fillStyle='#66543f';c.fillRect(27,53,12,4);c.fillRect(43,60,12,4);
    trees.set(key,image);return image;
  }
  function drawBroadleafCluster(c,index,clusterIndex,warm) {
    const [x,y,r]=TREE_BROADLEAF_CLUSTERS[clusterIndex];
    const disc=(cx,cy,radius,color)=>{c.fillStyle=color;for(let row=-radius;row<=radius;row+=2){const width=Math.floor(Math.sqrt(Math.max(0,radius*radius-row*row))/2)*2;c.fillRect(cx-width,cy+row,width*2,2)}};
    disc(x,y+3,r,'#132e30');disc(x-1,y-1,r-2,clusterIndex%2?'#2c5145':'#315b49');
    disc(x-4,y-5,r*.6|0,warm?'#7a8455':'#4c7557');
    for(let n=0;n<6;n++){
      c.fillStyle=n%2?(warm?'#bdac6c':'#77936a'):'#23463e';
      const lx=x-r/2+Math.floor(random(n+clusterIndex,index+3)*r),ly=y-r/2+Math.floor(random(n+3,index+clusterIndex)*r);
      c.fillRect(lx,ly,4,2);c.fillRect(lx+1,ly-1,2,1);
    }
  }
  function treeCanopyLayers(index,warm) {
    const pine=index%3===0,key=pine?'pine':`broadleaf:${index%7}:${warm}`;
    if(treeCanopies.has(key))return treeCanopies.get(key);
    let layers;
    if(pine){
      layers=[];
      for(let layer=0;layer<5;layer++){
        const [image,c]=surface(80,104);c.imageSmoothingEnabled=false;
        const y=8+layer*13,half=9+layer*5;
        c.fillStyle='#163835';c.fillRect(40-half,y+7,half*2,10);c.fillRect(36-half,y+14,half*2+8,5);
        c.fillStyle='#28534a';c.fillRect(40-half+3,y+5,half+8,9);
        c.fillStyle='#497761';c.fillRect(40-half+5,y+6,half,3);
        c.fillStyle='#6b9474';c.fillRect(38,y+2,4,3);
        layers.push(image);
      }
    }else{
      layers=TREE_CANOPY_GROUPS.map(group=>{
        const [image,c]=surface(80,104);c.imageSmoothingEnabled=false;
        for(const clusterIndex of group)drawBroadleafCluster(c,index,clusterIndex,warm);
        return image;
      });
    }
    treeCanopies.set(key,layers);return layers;
  }
  function treeCanopyComposite(index,warm) {
    const pine=index%3===0,key=`${pine?'pine':'broadleaf'}:${index%7}:${warm}`;
    if(treeCanopyComposites.has(key))return treeCanopyComposites.get(key);
    const [image,c]=surface(80,104);c.imageSmoothingEnabled=false;
    for(const layer of treeCanopyLayers(index,warm))c.drawImage(layer,0,0);
    treeCanopyComposites.set(key,image);return image;
  }
  function simplifiedTreeImage(index,warm) {
    const pine=index%3===0,key=`${pine?'pine':`broadleaf:${index%7}`}:${warm}`;
    if(simplifiedTreeImages.has(key))return simplifiedTreeImages.get(key);
    const [image,c]=surface(80,104);c.imageSmoothingEnabled=false;
    c.drawImage(treeImage(index,warm),0,0);
    c.drawImage(treeCanopyComposite(index,warm),0,0);
    simplifiedTreeImages.set(key,image);return image;
  }
  function treeShadowSilhouette(index) {
    const key=index%3===0?'pine':`broadleaf:${((index%7)+7)%7}`;
    if(treeShadowSilhouettes.has(key))return treeShadowSilhouettes.get(key);
    const [image,c]=surface(80,100);c.imageSmoothingEnabled=false;
    c.drawImage(simplifiedTreeImage(index,false),0,0,80,100,0,0,80,100);
    c.globalCompositeOperation='source-in';c.fillStyle='#fff';c.fillRect(0,0,80,100);
    c.globalCompositeOperation='source-over';treeShadowSilhouettes.set(key,image);return image;
  }
  function foliageImage(style,variant,theme) {
    const palette=FOLIAGE_PALETTES[theme]||FOLIAGE_PALETTES.forest;
    const key=`${theme}:${style}:${variant%7}`;
    if(foliageSprites.has(key))return foliageSprites.get(key);
    const [image,c]=surface(28,25);c.imageSmoothingEnabled=false;
    c.fillStyle=palette.shadow;c.fillRect(4,22,20,2);c.fillRect(7,21,14,2);
    const disc=(x,y,r,color)=>{c.fillStyle=color;for(let row=-r;row<=r;row+=2){const width=Math.floor(Math.sqrt(Math.max(0,r*r-row*row))/2)*2;c.fillRect(x-width,y+row,width*2,2);}};
    const flower=(x,y,color,size=2)=>{
      c.fillStyle=palette.stem;c.fillRect(x+1,y+2,1,4);
      c.fillStyle=color;c.fillRect(x,y,3,size);c.fillRect(x+1,y-1,1,1);
      c.fillStyle=palette.glow;c.fillRect(x+1,y+1,1,1);
    };
    const clumps=(flowers=false)=>{
      const groups=[[7,17,6],[13,13,7],[20,16,7],[12,19,7],[19,20,5]];
      for(let i=0;i<groups.length;i++){
        const [x,y,r]=groups[i];
        disc(x,y+2,r,palette.shadow);disc(x-1,y,r-1,i%2?palette.dark:palette.leaf);
        disc(x-2,y-2,Math.floor(r*.58),i%2?palette.leaf:palette.light);
      }
      if(flowers){
        for(let i=0;i<5;i++){
          const x=3+i*4+Math.floor(random(variant+i,style+3)*2),y=5+(i%3)*2+Math.floor(random(i+9,variant+4)*2);
          c.fillStyle=palette.stem;c.fillRect(x+1,y+2,1,5);
          c.fillStyle=palette.leaf;c.fillRect(x-2,y+5,3,1);c.fillRect(x+1,y+7,3,1);
          flower(x,y,palette.blooms[(variant+i)%palette.blooms.length],3);
        }
      }else{
        c.fillStyle=palette.tip;
        for(let i=0;i<8;i++){
          const x=4+Math.floor(random(i+variant*7,style+1)*20),y=10+Math.floor(random(i+2,variant+5)*10);
          c.fillRect(x,y,2,1);if(i%3===0)c.fillRect(x+1,y-1,1,1);
        }
      }
    };
    if(style===0||style===2)clumps(style===2);
    else if(style===1){
      const tips=[[2,15],[5,8],[9,5],[18,5],[23,9],[26,16]];
      for(let frond=0;frond<tips.length;frond++){
        const [tipX,tipY]=tips[frond],startX=14+(frond-2)*.45,startY=23;
        const steps=Math.max(Math.abs(tipX-startX),Math.abs(tipY-startY));
        c.fillStyle=palette.dark;
        for(let step=0;step<=steps;step++){
          const t=step/steps,x=Math.round(startX+(tipX-startX)*t),y=Math.round(startY+(tipY-startY)*t);
          c.fillRect(x,y,1,1);
          if(step>1&&step<steps-1){
            const side=tipX<14?1:-1;
            c.fillStyle=palette.leaf;c.fillRect(x+side*2,y+1,3,2);c.fillRect(x-side*2-2,y+2,3,2);
            c.fillStyle=palette.dark;
          }
        }
      }
      c.fillStyle=palette.tip;
      for(let i=0;i<7;i++){const x=3+Math.floor(random(i+3,variant+7)*22),y=8+Math.floor(random(i+11,variant+2)*10);c.fillRect(x,y,2,1);}
    }else if(style===3){
      for(let i=0;i<9;i++){
        const x=3+Math.floor(random(i+variant*5,style+2)*22),height=4+Math.floor(random(i+7,variant+8)*6),y=23-height;
        c.fillStyle=i%2?palette.dark:palette.leaf;c.fillRect(x,y,1,height);
        c.fillRect(x-2,y+Math.floor(height*.45),3,1);c.fillRect(x+1,y+Math.floor(height*.62),3,1);
        if(i%2===0)flower(x-1,y-2,palette.blooms[(i+variant)%palette.blooms.length],2);
      }
    }else{
      for(let i=0;i<4;i++){
        const x=4+i*5+(variant%3),y=18-(i%2)*4;
        c.fillStyle=palette.tip;c.fillRect(x+1,y+2,2,5);c.fillRect(x,y+5,4,1);
        c.fillStyle=palette.blooms[(i+variant)%palette.blooms.length];c.fillRect(x-1,y,6,3);c.fillRect(x,y-1,4,1);
        c.fillStyle=palette.glow;c.fillRect(x+1,y+1,1,1);
      }
    }
    foliageSprites.set(key,image);return image;
  }
  function foliageInBounds(bounds,nearbyTrees=[]) {
    const definition=getWorldDefinition(),spacing=FOLIAGE_CELL_SIZE;
    let salt=(Number(definition.seed)||0)%1_000_003;
    for(const character of `${definition.dimensionId}:${definition.theme}`)salt=(salt*31+character.charCodeAt(0))%1_000_003;
    const worldKey=`${definition.dimensionId}:${definition.theme}:${definition.seed}:${definition.generationVersion}:${definition.revision}`;
    if(worldKey!==foliageCellWorldKey){foliageCellWorldKey=worldKey;foliageCells.clear();}
    const result=[];
    const firstX=Math.floor(bounds.left/spacing),lastX=Math.floor(bounds.right/spacing);
    const firstY=Math.floor(bounds.top/spacing),lastY=Math.floor(bounds.bottom/spacing);
    for(let gy=firstY;gy<=lastY;gy++)for(let gx=firstX;gx<=lastX;gx++){
      const index=(gy+2048)*8192+gx+4096;
      let plant=foliageCells.get(index);
      if(plant===undefined){
        const roll=random(gx+salt*.013,gy-salt*.017);
        const x=(gx+.18+random(gx+salt*.021+17,gy+salt*.009)*.64)*spacing;
        const y=(gy+.18+random(gx-salt*.011,gy+salt*.019+37)*.64)*spacing;
        const forest=worldTreeDensityAt(x,y)>0;
        if(roll<=(forest ? .47 : .095)&&x>=1&&y>=1&&x<WORLD_SIZE-1&&y<WORLD_SIZE-1
          &&!isPathTile(x,y)&&!isDimensionPathTile(x,y)&&!isDimensionSecretPathTile(x,y)
          &&(definition.dimensionId!=='surface'||!villageBuildingAt(x,y,1.65))
          &&waterBankDepthAt(x,y,WATER_OPTIONS,.18)<=0
          &&!waterPlantExcludedAt(x,y,WATER_OPTIONS)){
          const species=random(gx+salt*.03+71,gy-salt*.027+13);
          const style=species<.12?2:species<.31?1:species<.48?3:species<.91?0:4;
          const variant=Math.floor(random(gx+salt*.007+5,gy+salt*.011+19)*7);
          plant={x,y,style,variant,index};
        }else plant=NO_FOLIAGE;
        foliageCells.set(index,plant);
      }
      if(plant===NO_FOLIAGE)continue;
      if(nearbyTrees.some(tree=>Math.hypot(tree.x-plant.x,tree.y-plant.y)<.88))continue;
      result.push(plant);
    }
    return result;
  }
  function drawFoliage(ctx,p,style,variant,index,scale,time,theme,worldX,worldY,reducedMotion=false,fade=false,interaction=noReaction,detailLevel=2,simplified=false) {
    const image=foliageImage(style,variant,theme),palette=FOLIAGE_PALETTES[theme]||FOLIAGE_PALETTES.forest;
    const x=Math.round(p.x-14*scale),y=Math.round(p.y-23*scale),previousAlpha=ctx.globalAlpha;
    if(fade)ctx.globalAlpha=previousAlpha*.58;
    const touchX=Math.round(interaction.x*scale),touchY=Math.round(interaction.y*scale);
    if(touchX||touchY){
      ctx.drawImage(image,0,0,28,21,x+touchX,y+touchY,28*scale,21*scale);
      ctx.drawImage(image,0,18,28,7,x,y+18*scale,28*scale,7*scale);
    }else ctx.drawImage(image,x,y,28*scale,25*scale);
    if(!simplified&&!reducedMotion&&style!==4&&(detailLevel===2||(detailLevel===1&&index%3===0))){
      const wind=treeWindAt(worldX,worldY,time),points=style===2?[[6,9],[14,6],[22,10]]:[[7,12],[14,7],[21,12]];
      ctx.beginPath();
      for(let leaf=0;leaf<points.length;leaf++){
        const [px,py]=points[leaf],phase=time*(1.8+leaf*.21)+index*.017+worldX*.1-worldY*.08;
        const dx=Math.round((wind.sway*3.2+Math.sin(phase)*wind.flutter*2.6)*scale);
        const dy=Math.round(Math.cos(phase*.8)*wind.flutter*1.7*scale);
        const lx=Math.round(x+px*scale+dx+touchX),ly=Math.round(y+py*scale+dy+touchY);
        ctx.rect(lx,ly,Math.max(2,Math.round(2*scale)),Math.max(1,Math.round(scale)));
      }
      ctx.fillStyle=palette.tip;ctx.fill();
    }
    ctx.globalAlpha=previousAlpha;
  }
  function leafTufts(ctx,left,top,scale,index,worldX,worldY,time,sway,flutter,warm,branchOffsets) {
    for(let i=0;i<TREE_LEAF_TUFTS.length;i++){
      const [leafX,leafY,weight,group]=TREE_LEAF_TUFTS[i];
      const phase=time*(.75+(i%3)*.12)+worldX*.11-worldY*.07+index*1.9+i*1.73;
      const branchX=branchOffsets.x[group]||0,branchY=branchOffsets.y[group]||0;
      const dx=branchX+Math.round(sway*1.8*weight*scale+Math.sin(phase)*flutter*.9*scale);
      const dy=branchY+Math.round(Math.cos(phase*.83)*flutter*.55*scale);
      const x=Math.round(left+leafX*scale+dx),y=Math.round(top+leafY*scale+dy);
      const width=Math.max(2,Math.round((2+(i%3===0?1:0))*scale));
      const height=Math.max(1,Math.round(scale));
      leafTuftX[i]=x;leafTuftY[i]=y;leafTuftWidth[i]=width;leafTuftHeight[i]=height;
    }
    ctx.beginPath();
    for(let i=0;i<TREE_LEAF_TUFTS.length;i++)ctx.rect(leafTuftX[i],leafTuftY[i],leafTuftWidth[i],leafTuftHeight[i]);
    ctx.fillStyle=warm?'#bdac6c':'#77936a';ctx.fill();
    ctx.beginPath();
    const highlightOffset=Math.max(1,Math.round(scale)),highlightRise=Math.max(1,Math.round(scale*.5));
    for(let i=0;i<TREE_LEAF_TUFTS.length;i++)ctx.rect(leafTuftX[i]+highlightOffset,leafTuftY[i]-highlightRise,highlightOffset,highlightRise);
    ctx.fillStyle=warm?'#e0c982':'#b3c588';ctx.fill();
  }
  function driftingLeaf(ctx,left,top,scale,index,worldX,worldY,time,direction,warm) {
    const seed=random(index+worldX*1.7,worldY*2.3+13);
    const period=8.5+seed*5.5,cycle=((time+seed*period)%period)/period;
    if(cycle<.45||cycle>.92)return;
    const progress=(cycle-.45)/.47,phase=time*8+seed*31;
    const rawScreenWindX=direction.x-direction.y;
    const screenWindX=Math.sign(rawScreenWindX||1)*(.55+Math.min(1,Math.abs(rawScreenWindX))*.45);
    const originX=left+(20+Math.round(seed*37))*scale;
    const originY=top+(20+Math.round((1-seed)*22))*scale;
    const x=Math.round(originX+screenWindX*(7+progress*31)*scale+Math.sin(phase)*3*scale);
    const y=Math.round(originY+progress*33*scale+Math.cos(phase*.72)*2*scale);
    const flap=Math.floor(phase)%4;
    const oldAlpha=ctx.globalAlpha;
    ctx.globalAlpha=oldAlpha*Math.sin(progress*Math.PI)*.9;
    ctx.fillStyle=warm?'#6f633e':'#355846';
    if(flap===0||flap===2)ctx.fillRect(x,y,Math.max(2,Math.round(3*scale)),Math.max(1,Math.round(scale)));
    else {ctx.fillRect(x,y,Math.max(1,Math.round(scale)),Math.max(2,Math.round(3*scale)));ctx.fillRect(x+Math.round(scale),y+Math.round(scale),Math.max(1,Math.round(2*scale)),Math.max(1,Math.round(scale)));}
    ctx.fillStyle=warm?'#dec779':'#abc27a';
    ctx.fillRect(x+Math.round(scale),y,Math.max(1,Math.round(scale)),Math.max(1,Math.round(scale)));
    ctx.globalAlpha=oldAlpha;
  }
  function drawTreeVines(ctx,left,top,scale,index,worldX,worldY,time,sway,flutter,theme,reducedMotion,branchOffsets) {
    const chance=theme==='magic' ? .62 : (theme==='forest'||theme==='giants') ? .3 : theme==='energy' ? .22 : .12;
    const seed=random(worldX+index*.013,worldY-index*.019);
    if(seed>chance)return;
    const palette=FOLIAGE_PALETTES[theme]||FOLIAGE_PALETTES.forest;
    const strands=seed>.58?2:1;
    let stemCount=0;
    for(let strand=0;strand<strands;strand++){
      const rootX=18+Math.round(random(index+strand*13,worldX+5)*43);
      const rootY=27+Math.round(random(worldY+strand*7,index+19)*12);
      const rootGroup=rootX<28?1:rootX>51?2:rootY<39?0:3;
      const branchX=branchOffsets.x[rootGroup]||0,branchY=branchOffsets.y[rootGroup]||0;
      const length=Math.min(94-rootY,42+Math.floor(random(worldX+index+strand,worldY+29)*18));
      const phase=index*.7+worldX*.09+worldY*.05+strand*2.3;
      for(let step=0;step<=length;step++){
        const t=step/length;
        const wave=reducedMotion?0:Math.sin(time*.7+phase+step*.12)*(.65+t*.3)*scale
          +sway*2*scale+Math.sin(time*.95+phase+step*.09)*flutter*.8*scale;
        const x=Math.round(left+(rootX+Math.sin(t*Math.PI)*1.4)*scale+branchX+wave);
        const y=Math.round(top+(rootY+step)*scale+branchY);
        vineX[stemCount]=x;vineY[stemCount]=y;
        vineLeafSide[stemCount]=step>2&&step%4===1?(step%2?1:-1):0;
        stemCount++;
      }
    }
    const darkInset=Math.max(1,Math.round(scale*.4)),darkWidth=Math.max(2,Math.round(scale*1.35));
    const lightWidth=Math.max(1,Math.round(scale*.55)),lightHeight=Math.max(1,Math.round(scale*.65));
    const leafOffset=Math.round(scale),leafWidth=Math.max(1,Math.round(scale*1.6));
    ctx.beginPath();
    for(let i=0;i<stemCount;i++)ctx.rect(vineX[i]-darkInset,vineY[i],darkWidth,Math.max(1,Math.round(scale)));
    ctx.fillStyle=palette.dark;ctx.fill();
    ctx.beginPath();
    for(let i=0;i<stemCount;i++)ctx.rect(vineX[i],vineY[i],lightWidth,lightHeight);
    ctx.fillStyle=palette.light;ctx.fill();
    ctx.beginPath();
    for(let i=0;i<stemCount;i++)if(vineLeafSide[i])ctx.rect(vineX[i]+vineLeafSide[i]*leafOffset,vineY[i],leafWidth,Math.max(1,Math.round(scale)));
    ctx.fillStyle=palette.tip;ctx.fill();
  }
  function tree(ctx,p,index,scale,fade,time,warm=false,worldX=0,worldY=0,reducedMotion=false,interaction=noReaction,detailLevel=2,simplified=false) {
    const previousAlpha=ctx.globalAlpha;
    ctx.globalAlpha=fade?.48:1;
    const pine=index%3===0,left=Math.round(p.x-40*scale),top=Math.round(p.y-100*scale);
    if(detailLevel===0){
      ctx.drawImage(simplifiedTreeImage(index,warm),left,top,80*scale,104*scale);
      ctx.globalAlpha=previousAlpha;
      return;
    }
    const image=treeImage(index,warm),canopy=treeCanopyComposite(index,warm);
    if(simplified){
      ctx.drawImage(image,left,top,80*scale,104*scale);
      let windOffsetX=0,windOffsetY=0;
      const detailSeed=random(index+worldX*.31,worldY*.27+7);
      if(!reducedMotion&&detailSeed<.42){
        const windActivity=treeWindEnvelope(time,detailSeed);
        if(windActivity>0){
          const wind=treeWindAt(worldX,worldY,time),direction=windDirectionAt(worldX,worldY,time);
          const rawScreenWindX=direction.x-direction.y;
          const screenWindX=rawScreenWindX;
          const screenWindY=(direction.x+direction.y)*.26;
          const displacement=wind.sway*(pine?14:17)*windActivity;
          windOffsetX=Math.round(displacement*screenWindX*scale);
          windOffsetY=Math.round(displacement*screenWindY*scale);
        }
      }
      ctx.drawImage(canopy,left+windOffsetX,top+windOffsetY,80*scale,104*scale);
      ctx.globalAlpha=previousAlpha;
      return;
    }
    const detailSeed=random(index+worldX*.31,worldY*.27+7);
    const windActivity=reducedMotion?0:treeWindEnvelope(time,detailSeed);
    const windDelay=random(worldX+19,worldY+43)*1.8;
    const windTime=time-windDelay;
    const wind=reducedMotion?{sway:0,flutter:0,gust:0}:treeWindAt(worldX,worldY,windTime);
    const {sway,flutter}=wind;
    const animatedSway=sway*windActivity,animatedFlutter=flutter*windActivity;
    const direction=windDirectionAt(worldX,worldY,windTime);
    const rawScreenWindX=direction.x-direction.y;
    const screenWindX=rawScreenWindX;
    const screenWindY=(direction.x+direction.y)*.26;
    const phase=windTime*.66+worldX*.036+worldY*.021;
    const weights=pine?PINE_CANOPY_WEIGHTS:BROADLEAF_CANOPY_WEIGHTS;
    let crownOffsetX=0,crownOffsetY=0,totalWeight=0;
    for(let i=0;i<weights.length;i++){
      const weight=weights[i];
      const lag=pine?i*.16:BROADLEAF_CANOPY_LAGS[i];
      const branchWave=reducedMotion?0:Math.sin(phase-lag+i*.11)*(.32+weight*.2)
        +Math.sin(phase*.53-lag*.7+i*.19)*.2;
      const flutterWave=reducedMotion?0:Math.sin(time*1.1+phase+i*1.61)*flutter*.45*weight;
      const displacement=reducedMotion?0:(sway*(pine?14:17)*weight+branchWave+flutterWave)*windActivity;
      const xOffset=Math.round((displacement*screenWindX+interaction.x*weight)*scale);
      const yOffset=reducedMotion?0:Math.round((displacement*screenWindY+interaction.y*weight)*scale+Math.sin(phase*.82-lag)*.42*weight*scale*windActivity);
      treeBranchOffsetX[i]=xOffset;treeBranchOffsetY[i]=yOffset;
      crownOffsetX+=xOffset*weight;crownOffsetY+=yOffset*weight;totalWeight+=weight;
    }
    crownOffsetX=Math.round(crownOffsetX/(totalWeight||1));crownOffsetY=Math.round(crownOffsetY/(totalWeight||1));
    if(pine){
      ctx.drawImage(image,0,84,80,20,left,Math.round(top+84*scale),80*scale,20*scale);
      ctx.drawImage(image,0,70,80,18,left+Math.round(crownOffsetX*.18),Math.round(top+70*scale),80*scale,18*scale);
      ctx.drawImage(image,0,59,80,18,left+Math.round(crownOffsetX*.42),Math.round(top+59*scale),80*scale,18*scale);
    }else{
      ctx.drawImage(image,0,86,80,18,left,Math.round(top+86*scale),80*scale,18*scale);
      ctx.drawImage(image,0,72,80,18,left+Math.round(crownOffsetX*.18),Math.round(top+72*scale),80*scale,18*scale);
      ctx.drawImage(image,0,58,80,18,left+Math.round(crownOffsetX*.42),Math.round(top+58*scale),80*scale,18*scale);
      ctx.drawImage(image,0,53,80,11,left+Math.round(crownOffsetX*.56),Math.round(top+53*scale),80*scale,11*scale);
    }
    ctx.drawImage(canopy,left+crownOffsetX,top+crownOffsetY,80*scale,104*scale);
    const animateDetails=detailLevel===2||(detailLevel===1&&detailSeed<.52);
    if(!pine&&animateDetails){
      leafTufts(ctx,left,top,scale,index,worldX,worldY,reducedMotion?0:time,animatedSway,animatedFlutter,warm,treeBranchOffsets);
      drawTreeVines(ctx,left,top,scale,index,worldX,worldY,time,animatedSway,animatedFlutter,getWorldDefinition().theme,reducedMotion,treeBranchOffsets);
      if(detailLevel===2&&!reducedMotion&&wind.gust*windActivity>.76&&index%4===2)
        driftingLeaf(ctx,left,top,scale,index,worldX,worldY,time,direction,warm);
    }
    ctx.globalAlpha=previousAlpha;
  }
  function preloadSharedAssets(themeOverride=getWorldDefinition().theme) {
    for(const kind of ['ground','path','plaza','secret-path','water','sand','shore-dirt','shore-gravel','shore-grass'])for(let variant=0;variant<12;variant++)tileImage(kind,variant,themeOverride);
    for(let style=0;style<5;style++)for(let variant=0;variant<7;variant++)foliageImage(style,variant,themeOverride);
    return Promise.resolve();
  }
  function groundDetails(ctx,p,x,y,scale,path,grassRelief=false) {
    const seed=random(x+73,y+51); if(path||seed<(grassRelief ? .91 : .965))return;
    const offsetX=grassRelief?(random(x+19,y+91)-.5)*16:0;
    const offsetY=grassRelief?(random(x+33,y+17)-.5)*7:0;
    ctx.save();ctx.translate(Math.round(p.x+offsetX),Math.round(p.y+offsetY));ctx.scale(scale,scale);
    if(grassRelief){
      ctx.fillStyle='#1b3828';ctx.fillRect(-8,1,16,2);
    }
    if(seed>.995) {
      ctx.fillStyle='#243b35';ctx.fillRect(-10,0,19,4);
      ctx.fillStyle='#a18459';ctx.fillRect(-8,-2,15,2);ctx.fillRect(-3,-5,2,5);ctx.fillRect(4,-4,4,2);
      ctx.fillStyle='#d2b385';ctx.fillRect(-7,-2,8,1);
    } else if(seed>.935){
      ctx.fillStyle='#345d42';ctx.fillRect(-6,-3,13,5);ctx.fillRect(-3,-6,7,4);
      ctx.fillStyle='#799962';ctx.fillRect(-4,-4,4,2);ctx.fillStyle='#d6ae72';ctx.fillRect(3,-3,2,2);
    } else {
      ctx.fillStyle='#437557';
      for(let i=0;i<4;i++){ctx.fillRect(-6+i*4,-3-i%2*3,2,6+i%2*3);ctx.fillRect(-8+i*4,-4-i%2*2,4,2);}
      ctx.fillStyle='#85a274';ctx.fillRect(-6,-5,2,2);
    }
    ctx.restore();
  }
  function resetTerrainWorld(definition) {
    const nextKey=worldGeometryCacheKey(definition)+(definition.dimensionId==='surface'?`:objects:${objectCatalogRevision()}:grass:${grassGroundRevision}`:'');
    if(terrainWorldDefinition===definition&&terrainWorldKey===nextKey)return;
    if(terrainWorldKey===nextKey){terrainWorldDefinition=definition;return;}
    // Share a single bounded image budget across geometry revisions/dimensions.
    // Returning to an unchanged world reuses its completed terrain, never another seed.
    completedTerrain=terrainScenes.get(nextKey)||new Map();
    terrainScenes.delete(nextKey);terrainScenes.set(nextKey,completedTerrain);
    while(terrainScenes.size>8)terrainScenes.delete(terrainScenes.keys().next().value);
    for(const entry of groundChunks.values())entry.resolveReady?.(entry);
    terrainQueue.length=0;groundChunks.clear();terrainVisiblePriority.clear();terrainLookaheadPriority.clear();terrainPrioritySignature='';terrainWorldKey=nextKey;terrainWorldDefinition=definition;
  }
  function displayTerrain(entry,theme) {
    const coordinate=`${entry.cx}:${entry.cy}`;
    const image=completedTerrain.get(coordinate);
    if(image){completedTerrain.delete(coordinate);completedTerrain.set(coordinate,image);}
    // Never reveal a half-rasterized chunk while movement continues during
    // preparation. Reuse this world's completed copy, or show one flat tile.
    if(entry.complete)return entry.image;
    return image||terrainPlaceholder(theme);
  }
  function terrainPlaceholder(theme) {
    let image=terrainPlaceholders.get(theme);if(image)return image;
    const [canvas,c]=surface(512,324);c.imageSmoothingEnabled=false;
    const baseColor=({dark:'#000000',sky:'#8ca5ae',magic:'#363c50',inferno:'#50362d',giants:'#30473c',energy:'#294d59',forest:'#5b7a1c'})[theme]||'#27443e';
    c.fillStyle=baseColor;c.beginPath();c.moveTo(256,20);c.lineTo(512,164);c.lineTo(256,308);c.lineTo(0,164);c.closePath();c.fill();
    terrainPlaceholders.set(theme,canvas);return canvas;
  }
  function terrainImage(cx,cy) {
    const definition=getWorldDefinition();
    resetTerrainWorld(definition);
    const key=`${cx}:${cy}`;
    let entry=groundChunks.get(key);
    if(entry){groundChunks.delete(key);groundChunks.set(key,entry);return displayTerrain(entry,definition.theme);}
    const cached=completedTerrain.get(key);
    entry={key,cx,cy,image:cached||null,context:null,nextTile:cached?64:0,complete:Boolean(cached),resolveReady:null,readyPromise:null};
    if(cached){entry.readyPromise=Promise.resolve(entry);terrainCacheHits++;}
    else {entry.readyPromise=new Promise(resolve=>{entry.resolveReady=resolve;});terrainQueue.push(entry);}
    groundChunks.set(key,entry);
    while(groundChunks.size>terrainChunkLimit){
      const unprotected=[...groundChunks].filter(([,candidate])=>!terrainVisiblePriority.has(candidate.cx+':'+candidate.cy));
      const oldestComplete=unprotected.find(([,candidate])=>candidate.complete);
      const oldestPending=oldestComplete||unprotected.find(([,candidate])=>!candidate.complete);
      if(!oldestPending)break;
      const [oldestKey,oldestEntry]=oldestPending;
      groundChunks.delete(oldestKey);
      const queueIndex=terrainQueue.indexOf(oldestEntry);
      if(queueIndex>=0)terrainQueue.splice(queueIndex,1);
      oldestEntry.resolveReady?.({cancelled:true,complete:false});
      trimTerrainImages();
    }
    if(groundChunks.size>terrainChunkLimit&&groundChunks.has(entry.key)){
      groundChunks.delete(entry.key);
      const queueIndex=terrainQueue.indexOf(entry);
      if(queueIndex>=0)terrainQueue.splice(queueIndex,1);
      entry.resolveReady?.({cancelled:true,complete:false});
    }
    trimTerrainImages();
    return displayTerrain(entry,definition.theme);
  }
  function processTerrainQueue(maxTiles=256,budgetMs=1.8) {
    resetTerrainWorld(getWorldDefinition());
    const started=performance.now();let rendered=0,startedChunks=0;
    while(terrainQueue.length&&rendered<maxTiles){
      const entry=terrainQueue.shift();
      if(groundChunks.get(entry.key)!==entry||entry.complete)continue;
      if(!entry.image){
        if(startedChunks>=1){terrainQueue.unshift(entry);break;}
        const [image,context]=surface(512,324);context.imageSmoothingEnabled=false;
        const definition=getWorldDefinition(),theme=definition.theme;
        const grassSurface=definition.dimensionId==='surface'&&theme==='forest'&&Boolean(grassSurfaceAtlas);
        const baseColor=grassSurface?'#516d25':({dark:'#000000',sky:'#8ca5ae',magic:'#363c50',inferno:'#50362d',giants:'#30473c',energy:'#294d59'})[theme]||'#27443e';
        context.save();context.beginPath();context.moveTo(256,20);context.lineTo(512,164);context.lineTo(256,308);context.lineTo(0,164);context.closePath();context.clip();
        context.fillStyle=baseColor;
        context.fillRect(0,0,512,324);context.restore();
        entry.image=image;entry.context=context;
        entry.grassSurface=grassSurface;
        startedChunks++;
        trimTerrainImages();
      }
      const {x,y}=TERRAIN_TILE_ORDER[entry.nextTile],wx=entry.cx*8+x,wy=entry.cy*8+y;
      const centre={x:256+(x-y)*32,y:20+(x+y+1)*18};
      const depth=waterSurfaceDepthAt(wx+.5,wy+.5,WATER_OPTIONS),water=depth>.08;
      const editedSurface=worldTileSurfaceAt(wx,wy);
      const surfaceDimension=!editedSurface&&getWorldDefinition().dimensionId==='surface',plaza=surfaceDimension&&isVillagePlazaTile(wx+.5,wy+.5);
      const path=isPathTile(wx+.5,wy+.5)||(surfaceDimension&&isReceptionFootway(wx+.5,wy+.5,RECEPTION_BUILDING)),secret=surfaceDimension&&isDimensionSecretPathTile(wx+.5,wy+.5);
      const shoreTile=!water?waterShoreTileAt(wx,wy,WATER_OPTIONS):null;
      const grassEdge=surfaceDimension&&getWorldDefinition().theme==='forest'&&!path&&!plaza&&!secret
        &&[[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy])=>forestPathAt(wx+dx,wy+dy));
      if(wx>=0&&wy>=0&&wx<WORLD_SIZE&&wy<WORLD_SIZE){
      tile(entry.context,centre,wx,wy,grassEdge?'grass-edge':'ground',32,18,0);
      if(water)tile(entry.context,centre,wx,wy,'water',32,18,0,depth);
      else if(secret||plaza||path)tile(entry.context,centre,wx,wy,secret?'secret-path':plaza?'plaza':'path',32,18,0);
      else if(shoreTile)tile(entry.context,centre,wx,wy,shoreTile,32,18,0);
      else if(!entry.grassSurface&&getWorldDefinition().theme!=='dark')groundDetails(entry.context,centre,wx,wy,1.4,false);
      }
      entry.nextTile++;rendered++;
      if(entry.nextTile===64){
        entry.complete=true;
        completedTerrain.set(`${entry.cx}:${entry.cy}`,entry.image);
        trimTerrainImages();
        entry.resolveReady?.(entry);
      }
      else terrainQueue.unshift(entry);
      if(rendered>0&&performance.now()-started>=budgetMs)break;
    }
    return rendered;
  }
  function prioritizeTerrainChunks(visible=[],ahead=[]) {
    resetTerrainWorld(getWorldDefinition());
    const visibleKeys=visible.map(({cx,cy})=>cx+':'+cy);
    const aheadKeys=ahead.map(({cx,cy})=>cx+':'+cy);
    const signature=visibleKeys.join('|')+';'+aheadKeys.join('|');
    if(signature===terrainPrioritySignature)return false;
    terrainPrioritySignature=signature;
    terrainVisiblePriority=new Set(visibleKeys);
    terrainLookaheadPriority=new Set(aheadKeys);
    terrainChunkLimit=Math.min(MAX_TERRAIN_CHUNKS,Math.max(MIN_TERRAIN_CHUNKS,visible.length+8));
    while(groundChunks.size>terrainChunkLimit){
      const victim=[...groundChunks].find(([,entry])=>!terrainVisiblePriority.has(entry.cx+":"+entry.cy));
      if(!victim)break;const [key,entry]=victim;groundChunks.delete(key);const index=terrainQueue.indexOf(entry);if(index>=0)terrainQueue.splice(index,1);entry.resolveReady?.({cancelled:true,complete:false});
    }
    trimTerrainImages();
    terrainQueue.sort((a,b)=>{
      const rank=key=>terrainVisiblePriority.has(key)?0:terrainLookaheadPriority.has(key)?1:2;
      return rank(a.cx+':'+a.cy)-rank(b.cx+':'+b.cy);
    });
    return true;
  }
  function requestTerrainChunks(chunks=[]) {
    for(const chunk of chunks){
      const cx=Math.floor(Number(chunk?.cx)),cy=Math.floor(Number(chunk?.cy));
      if(!Number.isFinite(cx)||!Number.isFinite(cy))continue;
      const definition=getWorldDefinition();
      resetTerrainWorld(definition);
      const key=terrainCoordinateKey(cx,cy);
      if(groundChunks.has(key)||completedTerrain.has(key))continue;
      terrainImage(cx,cy);
    }
  }
  function terrainChunksReady(chunks=[]) {
    const definition=getWorldDefinition();
    resetTerrainWorld(definition);
    return chunks.every(({cx,cy})=>{
      const x=Math.floor(Number(cx)),y=Math.floor(Number(cy));
      if(!Number.isFinite(x)||!Number.isFinite(y))return false;
      const key=terrainCoordinateKey(x,y);
      const entry=groundChunks.get(key);
      return entry?.complete===true||completedTerrain.has(key);
    });
  }
  function terrainChunksAround(x,y,radius=1) {
    const centreX=Math.floor(x/8),centreY=Math.floor(y/8),reach=Math.max(0,Math.floor(radius));
    const chunks=[];
    for(let cy=centreY-reach;cy<=centreY+reach;cy++)for(let cx=centreX-reach;cx<=centreX+reach;cx++)chunks.push([cx,cy]);
    chunks.sort((a,b)=>Math.hypot(a[0]-centreX,a[1]-centreY)-Math.hypot(b[0]-centreX,b[1]-centreY));
    return chunks.map(([cx,cy])=>({cx,cy}));
  }
  function preloadTerrainAround(x,y,radius=1,onChunkReady) {
    return preloadTerrainChunks(terrainChunksAround(x,y,radius),onChunkReady);
  }
  function preloadTerrainChunks(chunks=[],onChunkReady) {
    const ready=[];
    const requested=new Set();
    for(const chunk of chunks){
      const cx=Math.floor(Number(chunk?.cx)),cy=Math.floor(Number(chunk?.cy));
      if(!Number.isFinite(cx)||!Number.isFinite(cy))continue;
      const key=`${cx},${cy}`;
      if(requested.has(key))continue;
      requested.add(key);
      const definition=getWorldDefinition();
      resetTerrainWorld(definition);
      terrainImage(cx,cy);
      const entry=groundChunks.get(terrainCoordinateKey(cx,cy));
      if(entry)ready.push(entry.readyPromise.then(value=>{if(!value?.complete)throw new Error('Terrain chunk left the bounded cache before readiness.');onChunkReady?.({cx,cy});return value;}));
    }
    return Promise.all(ready);
  }
  function terrain(ctx,p,cx,cy,tx,pixelate=false) {
    const image=terrainImage(cx,cy);
    const factor=tx/32;
    let source=image;
    if(pixelate){
      source=pixelatedTerrain.get(image);
      if(!source){
        const [low,lowContext]=surface(128,81);lowContext.imageSmoothingEnabled=true;
        lowContext.drawImage(image,0,0,128,81);pixelatedTerrain.set(image,low);source=low;
      }
    }
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(source,Math.round(p.x-256*factor),Math.round(p.y-20*factor),512*factor,324*factor);ctx.restore();
  }
  function stats() {
    const images=new Set([...terrainScenes.values()].flatMap(scene=>[...scene.values()]));
    for(const entry of groundChunks.values())if(entry.image)images.add(entry.image);
    let terrainBytes=0;
    for(const image of images)terrainBytes+=image.width*image.height*4;
    return {terrainChunks:groundChunks.size,terrainBytes,terrainCachedScenes:terrainScenes.size,terrainCacheHits,pendingTerrainChunks:terrainQueue.length,geometryKeyLength:terrainWorldKey.length,terrainChunkLimit,terrainChunkHardLimit:MAX_TERRAIN_CHUNKS,terrainVisiblePriority:terrainVisiblePriority.size,terrainCapacityExceeded:terrainVisiblePriority.size>MAX_TERRAIN_CHUNKS};
  }
  function isTerrainStreaming() { return terrainQueue.length>0; }
  function setGrassSurfaceAtlas(image) {
    if(!image||image.width!==256||image.height!==36)throw new TypeError('Atlas de superfície de grama inválido: esperado 256×36 px.');
    if(grassSurfaceAtlas===image)return false;
    grassSurfaceAtlas=image;grassGroundRevision++;return true;
  }
  function setSoilMaterialAtlases(soilImage,fadeImage) {
    if(!soilImage||soilImage.width!==384||soilImage.height!==144)throw new TypeError('Atlas de terra inválido: esperado 384×144 px.');
    if(!fadeImage||fadeImage.width!==384||fadeImage.height!==216)throw new TypeError('Atlas de degradê terra-grama inválido: esperado 384×216 px.');
    if(soilMaterialAtlas===soilImage&&soilFadeAtlas===fadeImage)return false;
    soilMaterialAtlas=soilImage;soilFadeAtlas=fadeImage;grassGroundRevision++;return true;
  }
  return {tile,tree,treeShadowSilhouette,foliage:drawFoliage,foliageInBounds,proximityMotion,groundDetails,terrain,setGrassSurfaceAtlas,setSoilMaterialAtlases,preloadSharedAssets,terrainChunksAround,preloadTerrainAround,preloadTerrainChunks,terrainChunksReady,prioritizeTerrainChunks,requestTerrainChunks,processTerrainQueue,isTerrainStreaming,stats};
}
