import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./main.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function getVisibleWorldBounds('),source.indexOf('function terrainChunksWithMovementMargin('));
const projection=source.slice(source.indexOf('function point('),source.indexOf('\n}',source.indexOf('function point('))+2);

test('preparing a requested zoom covers the committed viewport despite pixel rounding',()=>{
 for(const [viewWidth,viewHeight]of [[390,844],[1440,900],[3840,2160]])for(const from of [70,100,125])for(const to of [70,100,125]){
  const tile=Math.round((viewWidth<600?26:32)*from/100);
  const context={WORLD_SIZE:5933,viewWidth,viewHeight,CENTRE_X:viewWidth/2,CENTRE_Y:viewHeight*(viewWidth<600?.4:.52),
   TILE_X:tile,TILE_Y:tile*18/32,HEIGHT_PIXELS:24,spriteScale:tile/16,pendingCameraZoom:to,camera:{x:92.123,y:93.456},projectionOverride:null};
  runInNewContext(`${projection}\n${helpers}\nprepared=pendingZoomTerrainChunks();TILE_X=Math.round((viewWidth<600?26:32)*pendingCameraZoom/100);TILE_Y=TILE_X*18/32;committed=visibleTerrainChunks();`,context);
  const keys=new Set(context.prepared.map(c=>`${c.cx}:${c.cy}`));
  assert.ok(context.committed.every(c=>keys.has(`${c.cx}:${c.cy}`)),`${viewWidth}: ${from}→${to}`);
 }
});

test('destination readiness is acknowledged only after a complete drawn frame',()=>{
 const reveal=source.slice(source.indexOf('function revealLoadedScene()'),source.indexOf('function clearingWorldChunkCoordinates('));
 const callbacks=[],events=[],timers=[];let draws=0,lightingReady=false;
 const context={authenticated:true,snapshotReady:true,assetsReady:true,predictionReady:true,sceneReady:false,loadingGeneration:1,dimensionArrivalStartedAt:0,
  teleportEffects:{prepare:()=>Promise.resolve(true),finishLocalScene:()=> 'test-transit'},dimensionList:[],worldDimensionId:'surface',arrivalTravelPending:false,
  performance:{now:()=>0},lightingRevealStartedAt:null,gameDay:{},getGameDayState:()=>({}),gameDayTimestampMs:()=>0,dimensionTheme:'forest',lightingRevealScheduled:false,
  paintSceneLightmaps:()=>lightingReady,processLightmapQueue:()=>{lightingReady=true;},
  updateLoadingDesign(){},updateDimensionTravel(){},resizeCanvas(){},draw(){return ++draws>=3;},
  setTimeout:(callback,delay)=>timers.push({callback,delay}),
  requestAnimationFrame:callback=>callbacks.push(callback),loadingProgress:{complete:id=>events.push(id)},markInitialLoadingComplete:()=>false,
  hideSceneLoading:()=>events.push('revealed'),scheduleDimensionVisualWarmup(){},scheduleAvatarAnimationWarmup(){},
  roomTransition:{active:false},send:message=>events.push(message.type),canvas:{focus(){}},ui:{connection:{}},
 };
 runInNewContext(`${reveal};revealLoadedScene();`,context);
 assert.deepEqual(events,[]);
 assert.equal(context.sceneReady,false,'lighting stays behind the loading screen');
 callbacks.shift()();assert.deepEqual(events,[],'completing lightmaps is not a drawn destination frame');
 callbacks.shift()();assert.deepEqual(events,[],'retained terrain frame is not a ready destination');
 callbacks.shift()();assert.deepEqual(events,['first-frame','revealed','dimensionTransitReady']);
 assert.deepEqual(timers.map(timer=>timer.delay),[15000,15000],'optional warmups stay outside the first active seconds');
});


test('optional lighting cannot deadlock entry while the authoritative scene still requires a complete frame',()=>{
 const reveal=source.slice(source.indexOf('function revealLoadedScene()'),source.indexOf('function clearingWorldChunkCoordinates('));
 const callbacks=[],events=[];let now=0,frameReady=false;
 const context={authenticated:true,snapshotReady:true,assetsReady:true,predictionReady:true,sceneReady:false,loadingGeneration:1,
  dimensionArrivalStartedAt:0,teleportEffects:{prepare:()=>Promise.resolve(true),finishLocalScene:()=>null},
  dimensionList:[],worldDimensionId:'surface',arrivalTravelPending:false,gameDay:{},getGameDayState:()=>({}),
  gameDayTimestampMs:()=>0,dimensionTheme:'forest',lightingRevealScheduled:false,lightingRevealStartedAt:null,performance:{now:()=>now},
  paintSceneLightmaps:()=>false,processLightmapQueue(){},updateLoadingDesign(){},updateDimensionTravel(){},resizeCanvas(){},
  draw:()=>frameReady,setTimeout(){},requestAnimationFrame:callback=>callbacks.push(callback),
  loadingProgress:{complete:id=>events.push(id)},markInitialLoadingComplete:()=>false,hideSceneLoading:()=>events.push('revealed'),
  scheduleDimensionVisualWarmup(){},scheduleAvatarAnimationWarmup(){},roomTransition:{active:false},send(){},canvas:{focus(){}},ui:{connection:{}}};
 runInNewContext(`${reveal};revealLoadedScene();`,context);
 assert.equal(context.sceneReady,false);
 now=1501;callbacks.shift()();
 assert.equal(context.sceneReady,true,'optional light queue is no longer a gate');
 callbacks.shift()();assert.deepEqual(events,[],'incomplete terrain/first frame still blocks revelation');
 frameReady=true;callbacks.shift()();assert.deepEqual(events,['first-frame','revealed']);
});
