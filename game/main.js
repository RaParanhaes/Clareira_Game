import { createGroundShadowLayer, avatarShadowProfile, avatarDirectionalShadowProfile, moonShadowProfile, projectedRoofShadow, strongestBuildingShadowDirection, buildingGroundShadowStrength, attenuateShadowWithLocalLight, fillFootprintShadowPath, actorShadowOutline, casterShadowOpacity, localShadowProfile, celestialShadowDirection } from './ground-shadow-layer.mjs';
import { drawCampfireFlames, campfireGlowPulse } from './campfire-flame-design.mjs';
import { createStaffModeration } from './staff-moderation-ui.mjs';
import { startLoginAnimation, stopLoginAnimation } from './login-animation.mjs';
import { interiorFloorShape } from './interior-architecture.mjs';
import { ARRIVAL_SKY_DURATION_MS, arrivalSkyState, drawArrivalSky } from './arrival-sky.mjs';
import { createRoomTransition } from './room-transition.mjs';
import { createTeleportEffects } from './teleport-effect.mjs';
import { createInventoryPrediction } from './inventory-prediction.mjs';
import { createRoomFurniturePrediction } from './room-furniture-prediction.mjs';
import { PRESET_REMOVE_MESSAGE, isPresetFurniture, placedFurnitureCount } from './room-presets.mjs';
import { createMovementDiagnostics } from './movement-diagnostics.mjs';
import { createRenderAudit } from './render-audit.mjs';
import { createRuntimePerformance } from './runtime-performance.mjs';
import { createPerformanceTelemetry } from './performance-telemetry.mjs';
import { MAX_PLAYER_LEVEL, PLAYER_ABILITIES, STORAGE_PAGE_UNLOCK_LEVELS, XP_POTION_RECIPES, XP_POTIONS, awardPotionXp, mapDiscoveryRadiusForAbilities, storagePageCountForLevel, xpRequiredForNextLevel } from './progression.mjs';
import { drawWorldBoundary, insideBoundaryWall } from './world-boundary.mjs';
import { WORLD_NATURE_ORIGIN } from './world-scale.mjs';
import { DIMENSION_THEMES } from './dimension-themes.mjs';
import {applyObjectCatalog,getObjectCatalog,objectCatalogRevision} from './object-state.mjs';
import {roomView} from './room-view.mjs';
import { exteriorEmitters, interiorEmitters, roomLightObstacles, lightAmount, roomGlowProfile, actorWindowLight } from './scene-lights.mjs';
import { buildingWindows, buildingArchitecture } from './architectural-elements.mjs';
import { lightmapFor, paintLightmap, processLightmapQueue, lightmapStats } from './lightmap-renderer.mjs';
import { BUILDING_STANDARD, fixtureBounds, roomWallDecor, roofGeometry } from './building-standard.mjs';
import { buildingUsesAuthoredExterior, drawBuildingCanopy, drawBuildingExterior, drawBuildingPost, drawWallLabel, setCottageExteriorSprites, setFernExteriorSprites } from './building-renderer.mjs';
import { setBuildingMaterialAtlas } from './building-materials.mjs';
import { drawRoomFixtureAsset,setRoomFixtureAtlas,hasRoomFixtureAtlas,setMedievalFurnitureAtlas,hasMedievalFurnitureAtlas } from './room-fixture-renderer.mjs';
import { appendWildlifeSample, interpolateWildlifePosition } from './wildlife-motion.mjs';
import { FALLEN_TREE_HALF_LENGTH, FALLEN_TREE_HEIGHT, FALLEN_TREE_RADIUS } from './obstacle-collision.mjs';
import { assetScenesFor, createAssetLoader } from './content-assets.mjs';
import { furnitureVisual,furnitureUse,roomFurnitureBedOccupantDepth,roomFurnitureDepthAnchor,roomFurnitureDrawLayers,roomFurnitureFootprintRadius,roomFurnitureRadius } from './furniture.mjs';
import { compareSceneDepth } from './depth-order.mjs';
import { contentById } from './content-catalog.mjs';
import { MEDIEVAL_FURNITURE, MEDIEVAL_FURNITURE_CATEGORIES } from './medieval-furniture.mjs';
import { mergeQueuedState } from './state-inbox.mjs';
import { createSceneReadiness } from './scene-loading.mjs';
import { calculateInitialMiniProgress, createLoadingProgress, initialLoadingMiniStage } from './loading-progress.mjs';
import {getNaturalPatches,NATURAL_PATCHES,TERRAIN_BOUNDS} from './natural-terrain.mjs';
import {buildWorldMapDetailFeatures,initialForestMapBounds} from './initial-forest-map-features.mjs';
import {worldDefinitionChangesGeometry,worldHasRelief} from './world-edits.mjs';
import {normalizeAppearance} from './appearance.mjs';
import {CHARACTER_BY_ID} from './character-catalog.mjs';
import { createRenderProfiler } from './render-profiler.mjs';
import { createGeometryCache } from './geometry-cache.mjs';
import { roomWallSections, facadePanel, drawFacadeWindow } from './building-art.mjs';
import { roomAtmosphere } from './room-atmosphere.mjs';
import { buildingAvatarDepthAnchor, buildingExteriorAvatarDepthAnchor, buildingCanopyDepthAnchor, buildingPostDepthAnchor, buildingRenderDepthAnchor, buildingStaticDepthAnchor, buildingTreeDepthAnchor } from './building-depth.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING, villageBuildingsInBounds } from './village-buildings.mjs';
import { nearestPlaceService, placeServicePoints, placeServiceAllowsAction, CABIN_EXTERIOR_SERVICES } from './place-services.mjs';
import { createPanelController } from './panel-controller.mjs';
import { discoverWorldMapCells, mergeWorldMapExploration, isWorldMapCellKnown, worldMapCellIndex, worldMapExplorationLabel, zoomWorldMapAround, preloadWorldMapCaches } from './world-map.mjs';
import { createPlacePanel } from './place-panel.mjs';
import { isCabin } from './cabin-access.mjs';
import { AXE_TOOL_IDS, AXE_TOOL_SPECS, PICKAXE_TOOL_IDS, PICKAXE_TOOL_SPECS, axeToolFor, pickaxeToolFor } from './tool-progression.mjs';
import { createDraggableHud } from './draggable-hud.mjs';
const geometryCache = createGeometryCache();
const canopyGeometryCache=createGeometryCache(16);
const resourceGeometryCache = createGeometryCache(64);
const fallenGeometryCache = createGeometryCache(4);
const naturalGeometryCache = createGeometryCache(64);
const naturalPatchCache = new Map();
const visibleNaturalTerrainFaces = [];
let projectionOverride = null;
const renderProfiler = createRenderProfiler(new URLSearchParams(location.search).get('profile') === '1');
export function inspectPerformance(reset = false) {
  const result = renderProfiler ? {...renderProfiler.snapshot(), geometryCache:geometryCache.stats(),canopyGeometryCache:canopyGeometryCache.stats(), fallenGeometryCache:fallenGeometryCache.stats(),naturalGeometryCache:naturalGeometryCache.stats(),canvasAvatarCache:canvasAvatarCacheStats(),terrainCache:sceneArt.stats(),terrainPreparation:{incompleteVisibleFrames:terrainIncompleteVisibleFrames,incompleteVisibleTotalMs:Math.round(terrainIncompleteVisibleTotalMs),incompleteVisibleMaxMs:Math.round(Math.max(terrainIncompleteVisibleMaxMs,terrainIncompleteVisibleSince?performance.now()-terrainIncompleteVisibleSince:0)),lastQueueWorkMs:Math.round(lastTerrainQueueWorkMs*10)/10},visibleThings:lastVisibleThingCount,visibleStaticThings:visibleClearingStaticThings.length,visibleSolidTrees:visibleSolidTrees.length,renderEntityCounts:lastRenderEntityCounts,livePlayers:livePlayers.size,villageNpcCount:villageActors.size,decorativeDetailLevel,canvasPixelRatio,lastPathfindingMs,lastWorldTargetMs} : null;
  if (reset) {
    renderProfiler?.reset();
    terrainIncompleteVisibleFrames=0;terrainIncompleteVisibleTotalMs=0;terrainIncompleteVisibleMaxMs=0;
    if(terrainIncompleteVisibleSince)terrainIncompleteVisibleSince=performance.now();
  }
  return result;
}
export function inspectVillageNpcActors() {
  return [...villageActors.values()].map(({id,name,roleId,x,y,sitting})=>({id,name,roleId,x,y,sitting}));
}
import {drawMaterial} from './materials.mjs';
import {blendBody} from './locomotion.mjs';
const bodyAnimations=new Map();
import {FIRE_LIGHT_REACH,dominantLight,nightBrightness,flameEnvelope,flameLightEnvelope,exteriorNightOpacity,nightEmitterProfile} from './lighting.mjs';
import { CAMPFIRE_AURA_DISPLAY_SIZE, CAMPFIRE_AURA_FRAME_COUNT, CAMPFIRE_AURA_FRAME_HEIGHT,
  CAMPFIRE_AURA_LIGHT_SCALE, campfireAuraFrameIndex } from './campfire-aura.mjs';
import { CAMPFIRE_HEARTH_ANCHOR, CAMPFIRE_HEARTH_FRAME_HEIGHT,
  CAMPFIRE_HEARTH_FRAME_WIDTH } from './campfire-hearth.mjs';
import { CAMPFIRE_SKY_RAYS_FRAME_COUNT, CAMPFIRE_SKY_RAYS_FRAME_HEIGHT, CAMPFIRE_SKY_RAYS_FRAME_WIDTH,
  campfireSkyRaysFrameIndex } from './campfire-sky-rays.mjs';
import { ARRIVAL_CAMPFIRE_EDGE_POWER, ARRIVAL_CAMPFIRE_REACH_MULTIPLIER,
  CAMPFIRE_LIGHT_RADIUS_TILES, campfireLightFalloff } from './campfire-light.mjs';
import {
  campfireDecayProgress, campfireFlameStrength,
  campfireFuelRatio, campfireSmokeState,
} from './campfire-life.mjs';
import { sampleCampfireParticles } from './campfire-motion.mjs';
import { campfirePathOcclusion, worldToAudioPosition } from './campfire-acoustics.mjs';
import {surfaceHeight,HEIGHT_PIXELS,ROOM_LEVEL} from './elevation.mjs';
import { isDimensionPathTile, isDimensionSecretPathTile, isVillagePlazaTile } from './dimension-layout.mjs';
import { isReceptionFootway } from './village-ground.mjs';
import {
  crossedRoomExit, canPlaceRoomFurniture, roomFurnitureSupport, hasClearInteractionPath, CLEARING_DOOR, getObjectiveText, nearestCollectible, PLAYER_RADIUS, PLAYER_SPEED,
  RESOURCE_NODES, SPAWN, SHELTER_BOUNDS, SHELTER_WALL_CLEARANCE, SPAWN_CAMPFIRE, isPathTile,
  SOLID_TREES, SOLID_WATER, WORLD_CHUNK_SIZE, getFallenTreesInBounds, getSolidTreesInBounds, getTreeGrowthInBounds, getResourcesInBounds, getRocksInBounds, getLakesInBounds,
  stepPlayer, stepRoomPlayer, WORLD_SIZE, applyWorldDefinition, getWorldDefinition, getRoomLayout,
  DIMENSION_COORDINATE_OFFSET, ROOM_FURNITURE_LIMIT,
  WORLD_TILE_X as BASE_TILE_X, WORLD_TILE_Y as BASE_TILE_Y, createWorldMapOverview, worldGeometryCacheKey,
} from './world.mjs';
import { advanceFacingDirection, getAvatarFacing, getAvatarPose, getFacingFromMotion, getFacingIntent, getLocalAvatarView } from './avatar.mjs';
import { limitChatInput, normalizeChatMessage, wrapChatMessage } from './chat.mjs';
import { clearHeldInputs, getWorldInput, isInteractiveKeyboardTarget, isTextEntryTarget, movementKeyForEvent, canHandleMovementKey } from './input.mjs';
import { appendPositionSample, interpolatePosition } from './interpolation.mjs';
import { advanceRemotePlayback, createRemotePlayback, observeRemoteSnapshot } from './remote-interpolation.mjs';
import { getCollisionFeedbackFrame, updateCollisionFeedback } from './collision-feedback.mjs';
import { getCampfireGatheringCount } from './social.mjs';
import { getNearestShareTarget } from './share-target.mjs';
import { applyCollectionSnapshot, clearWorldSnapshot, mergePlayerSnapshots, reconnectSchedule, sendWhenOpen } from './network.mjs';
import { advanceWorldAnimationTime, followCamera } from './visual-motion.mjs';
import { ARRIVAL_CAMERA_HOLD_MS, ARRIVAL_CAMERA_PAN_MS, ARRIVAL_LIGHTNING_IMPACT_MS, arrivalAvatarVisible, arrivalCameraTarget, arrivalImpactShake, arrivalFlameIgnition } from './arrival-cinematic.mjs';
import { beginPickupFeedback, getPickupFeedbackFrame, isPickupRequestPending, resolvePickupFeedback } from './pickup-feedback.mjs';
import { beginBerryOfferFeedback, getBerryOfferFrame } from './share-feedback.mjs';
import { decayRenderCorrection, reconcilePrediction, renderCorrectionOffset, shouldRecoverPrediction } from './prediction.mjs';
import { createSceneArt } from './scene-art.mjs';
import {centerWorldMapOn,drawWorldMap,hitTestWorldMapMarker,mapMarkers,screenToWorldMap,visibleWorldMapMarkers,worldMapTransform,worldMapDetailBounds,worldMapDetailTiles,WORLD_MAP_MAX_ZOOM} from './world-map.mjs';
import {AVATAR_SPRITE_SPEC,AVATAR_SPRITE_WORLD_SCALE,advanceAvatarSpritePhase,drawAvatarSprite,getAvatarComposition,getAvatarSpriteVariant,preloadAvatarAnimationActions,preloadAvatarIdle,preloadAvatarSprites,selectAvatarFrame,setAvatarSpritesReadyListener} from './avatar-sprites.mjs';
import {advanceAvatarMotion} from './avatar-motion.mjs';
import {canvasAvatarCacheStats,drawCanvasAvatar} from './canvas-avatar.mjs';
import { WILDLIFE_BY_ID, wildlifeCollisionBodies, canObserveWildlifeShelter } from './wildlife.mjs';
import { villageNpcAppearance, villageNpcDayRoster } from './village-npcs.mjs';
const strides=new Map();
const avatarSelections=new Map();
const avatarMotions=new Map();
const footDust=[];
const waterSplashes=[];
let lastCameraFrame=0;
let lastMotion={x:0,y:0};
import { CLAREIRA } from './theme.mjs';
import { ENTRY_COPY_VARIANTS, getDailyEntryCopy } from './entry-copy.mjs';
import { windDescriptionAt, windDirectionAt, windStrengthAt, windSwayAt } from './wind.mjs';
import { WATER_BANK_WIDTH, WATER_WADING_DEPTH, waterBankDepthAt, waterStateAt, waterSurfaceBankDepthAt, waterSurfaceDepthAt, waterwayRoutesForDimension } from './waterways.mjs';
import { getGameDayState } from './day-night.mjs';

const canvas = document.querySelector('#world');
let ctx = canvas.getContext('2d', { alpha: false });
const softShadowSprite = createSoftShadowSprite();
const sceneArt = createSceneArt();
const motion = window.gsap;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const CAMERA_ZOOM_STORAGE_KEY = 'clareira-camera-zoom-v1';
let cameraZoomPercent = 100;
let pendingCameraZoom = null;
try {
  const savedCameraZoom = Number(window.localStorage.getItem(CAMERA_ZOOM_STORAGE_KEY));
  if (Number.isInteger(savedCameraZoom) && savedCameraZoom >= 70 && savedCameraZoom <= 125 && savedCameraZoom % 5 === 0) {
    cameraZoomPercent = savedCameraZoom;
  }
} catch {}
const ui = {
  gold: document.querySelector('#gold-count'), silver: document.querySelector('#silver-count'), bronze: document.querySelector('#bronze-count'),
  bagGold: document.querySelector('#bag-gold-count'), bagSilver: document.querySelector('#bag-silver-count'), bagBronze: document.querySelector('#bag-bronze-count'),
  dot: document.querySelector('#connection-dot'), connection: document.querySelector('#connection-label'),
  players: document.querySelector('#player-count'), name: document.querySelector('#player-name'), nameLabel: document.querySelector('.name-label'),
  toolStatus: document.querySelector('#tool-status'),
  quickbar: document.querySelector('#quickbar'), inventoryDialog: document.querySelector('#inventory-dialog'), inventoryToggle: document.querySelector('#inventory-toggle'),
  inventoryClose: document.querySelector('#inventory-close'), progressionBadge: document.querySelector('#progression-points-badge'), inventoryGrid: document.querySelector('#inventory-grid'), inventoryQuickGrid: document.querySelector('#inventory-quick-grid'), inventoryPages: document.querySelector('#inventory-pages'), inventoryCapacity: document.querySelector('#inventory-capacity'), attributePoints: document.querySelector('#attribute-points'), attributeList: document.querySelector('#attribute-list'), skillPoints: document.querySelector('#skill-points'), skillList: document.querySelector('#skill-list'),
  inventoryDetailIcon: document.querySelector('#inventory-detail-image'), inventoryDetailName: document.querySelector('#inventory-detail-name'), inventoryDetailMeta: document.querySelector('#inventory-detail-meta'), inventoryDetailUse: document.querySelector('#inventory-detail-use'), inventoryEquip: document.querySelector('#inventory-equip'),
  objective: document.querySelector('#objective-text'), toast: document.querySelector('#toast'), sound: document.querySelector('#sound-toggle'), authSound: document.querySelector('#auth-sound-toggle'),
  chatForm: document.querySelector('#chat-form'), chatText: document.querySelector('#chat-text'), chatStatus: document.querySelector('#chat-status'),
  shell: document.querySelector('.shell'), authStatus: document.querySelector('#auth-status'), sessionLabel: document.querySelector('#session-label'), logout: document.querySelector('#logout-button'),
  fullscreen: document.querySelector('#fullscreen-toggle'),
  worldTitle: document.querySelector('#world-title'),
  weatherText: document.querySelector('#weather-text'),
  roomBuildTools: document.querySelector('#room-build-tools'),
  roomBuildToggle: document.querySelector('#room-build-toggle'), roomBuildOptions: document.querySelector('#room-build-options'),
  roomCategory: document.querySelector('#room-category'), roomKind: document.querySelector('#room-kind'), roomMove: document.querySelector('#room-move'),
  roomPlace: document.querySelector('#room-place'), roomRotate: document.querySelector('#room-rotate'), roomRemove: document.querySelector('#room-remove'),
  roomObjectCard: document.querySelector('#room-object-card'), roomObjectPreview: document.querySelector('#room-object-preview'),
  roomObjectName: document.querySelector('#room-object-name'), roomObjectType: document.querySelector('#room-object-type'),
  roomObjectDescription: document.querySelector('#room-object-description'), roomObjectActions: document.querySelector('#room-object-actions'),
  contextAction: document.querySelector('[data-action="context"]'),
  lodgingDialog: document.querySelector('#lodging-dialog'), lodgingOptions: document.querySelector('#lodging-options'),
  lodgingStatus: document.querySelector('#lodging-status'),
  worldMapToggle: document.querySelector('#world-map-toggle'),
};

ui.worldMapToggle.hidden=true;
const mapUi={dialog:document.querySelector('#world-map-dialog'),canvas:document.querySelector('#world-map-canvas'),miniMap:document.querySelector('#mini-map-toggle'),miniCanvas:document.querySelector('#mini-map-canvas'),miniStatus:document.querySelector('#mini-map-exploration-status'),revealAll:document.querySelector('#world-map-reveal-all'),search:document.querySelector('#world-map-search'),dimension:document.querySelector('#world-map-dimension'),results:document.querySelector('#world-map-results'),placeName:document.querySelector('#world-map-place-name'),placeMeta:document.querySelector('#world-map-place-meta'),placeCoords:document.querySelector('#world-map-place-coords'),go:document.querySelector('#world-map-go'),teleport:document.querySelector('#world-map-teleport'),teleportNote:document.querySelector('#world-map-teleport-note'),status:document.querySelector('#world-map-status')};
const arrivalUi={panel:document.querySelector('#arrival-tutorial'),step:document.querySelector('#arrival-tutorial-step'),title:document.querySelector('#arrival-tutorial-title'),text:document.querySelector('#arrival-tutorial-text'),next:document.querySelector('#arrival-tutorial-next'),skip:document.querySelector('#arrival-tutorial-skip')};
let arrivalTutorial=null,arrivalTravelPending=false,arrivalGuideAsked=false,arrivalDepartureAsked=false,arrivalTypingText='',arrivalLastDistance=Infinity,arrivalTutorialPhaseSeen='',arrivalPhaseStartedAt=0;
const keys = new Set();
const touchDirections = new Map();
let touchRunEnabled = false;
let flightPilotAllowed=false,flightTargetHeight=null,flightProfile='controlled';
const livePlayers = new Map();
const remotePositions = new Map();
const remotePlayback = new Map();
const remoteFacings = new Map();
const remoteAvatarVariants = new Map();
const lastAnnouncedChats = new Map();
const resources = new Map(RESOURCE_NODES.map(resource => [resource.id, { ...resource }]));
const fires = new Map();
const roomFurniture = new Map();
const roomPlacedCount = () => placedFurnitureCount([...roomFurniture.values()]);
const roomFurnitureMotion = new Map();
const wildlife = new Map();
const wildlifePositions = new Map();
const wildlifePlayback = new Map();
const villageActors = new Map();
const villageNpcAvatarVariants = new Map();
function renderedWildlifePosition(animal, now=performance.now()) {
  let playback=wildlifePlayback.get(animal.id);
  if(!playback){playback={};wildlifePlayback.set(animal.id,playback);}
  return interpolateWildlifePosition(wildlifePositions.get(animal.id),now,playback)||animal;
}
let wildlifeCollisionCache = [];
const pathTiles = new Set(['7,14','8,13','8,12','8,11','9,10','10,9','10,8','11,7','12,6']);
const colors = CLAREIRA.avatars;

let selfId = null;
let localPosition = { ...SPAWN };
let previousLocalPosition = { ...SPAWN };
let localRenderPosition = { ...SPAWN };
let localRenderCorrection = { x: 0, y: 0 };
let resumeCorrectionPending = false;
let resumeCorrectionUntil = 0;
let localFurnitureUseId = null;
let walkPath = [];
let localInventory = { wood: 0, timber: 0, sturdyBranch: 0, stone: 0, berries: 0, apples: 0, leaves: 0, vines: 0, plank: 0,
  copperOre: 0, ironOre: 0, coal: 0, charcoal: 0, copperIngot: 0, ironIngot: 0,
  rawMeat:0, hide:0, bone:0, feather:0, venom:0, glowDust:0, cinderShard:0, emberCore:0,
  knife: 1, stoneAxe: 0, copperAxe:0, ironAxe:0, stonePickaxe: 0, copperPickaxe:0, ironPickaxe:0,
  axeSharpness: 0, axeDurability: 0, pickaxeDurability: 0, selectedSlot: 0, level:1, xp:0, attributePoints:0, skillPoints:0, attributes:{force:0,attack:0,defense:0,agility:0,magic:0,speed:0}, learnedAbilities:[], slots: Array(27).fill(null), gold: 0, silver: 0, bronze: 0 };
let inventoryRenderKey = '';
let inventoryDragSource = null;
let inventorySelectionIndex = null;
let inventoryStoragePage = 0;
const storagePageUnlockFeedback = new Map();
const inventoryPrediction = createInventoryPrediction();
let socket = null;
let lastSentViewport = { width: 0, height: 0 };
let reconnectDelay = 700;
let reconnectTimer = null;
let disconnectedAt = 0;
let startupSnapshotFailures = 0;
let connectionAttemptNumber = 0;
const connectionProfileDiagnostics = new URLSearchParams(location.search).get("profile") === "1";
let lastInputSend = 0;
let lastInput = { x: 0, y: 0 };
let toastTimer = null;
let audioContext = null;
let ambience = null;
let soundSuspendTimer = null;
let lastFrame = 0;
let accumulator = 0;
let worldClock = 0;
let gameDay = getGameDayState();
let decorativeDetailLevel = 2;
let slowFrameCount = 0;
let fastFrameCount = 0;
let lastVisibleThingCount = 0;
let lastRenderEntityCounts = null;
let lastWeatherUpdate = 0;
let localMoving = false;
let localFacing = 'south';
let facingTransition = { facing: 'south', candidate: 'south', elapsed: 0 };
let localHasteUntil = 0;
let localSprintBurstUntil = 0;
let localAbilityCooldownUntil = new Map();
let collisionFeedback = null;
let collisionBlocked = false;
let pickupFeedback = null;
const berryOfferFeedbacks = [];
let camera = { x: SPAWN.x, y: SPAWN.y };
const roomCameraPointers = new Map();
let roomCameraPinch = null;
let ignoreRoomCanvasClickUntil = 0;
let authenticated = false;
let currentProfile = null;
let frameStarted = false;
let entryTimeline = null;
let roomStateAvailable = false;
let pendingInputs = [];
let outboundInputs = [];
let inputSequence = 0;
let lastAcknowledgedInput = 0;
let lastInputProgressAt = 0;
let predictionReady = false;
let worldLocation = 'clearing';
let worldDimensionId = 'surface';
let dimensionTheme = 'forest';
let dimensionList = [];
let worldMapOverview=null,worldMapOverviewKey='',worldMapViewKey='',worldMapMarkers=[],worldMapSelection=null,worldMapTransformState=null;
let worldMapDetailPendingKey='',worldMapDetailFailedKey='',worldMapDetailPrefix='';
let worldMapDetailDesired=new Set();
const worldMapDetailCache=new Map();
const worldMapOverviewCache=new Map();
const worldMapPreparationJobs=new Map();
const roomFurniturePrediction=createRoomFurniturePrediction();
const movementDiagnostics=createMovementDiagnostics();
const performanceTelemetry=createPerformanceTelemetry();
const runtimePerformance=createRuntimePerformance();
let runtimePerformanceSnapshot=null,lastRuntimePerformanceAt=0;
const renderAudit=createRenderAudit({onDraw:duration=>performanceTelemetry.observeDraw(duration),onSpike:spike=>{
 const details={...spike,visibleEntities:lastVisibleThingCount,pendingLights:lightmapStats().pending};
 runtimePerformance.spike(details);recordMovementDiagnostic('render-spike',details,true);
}});
if(typeof PerformanceObserver==='function'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
  try{
    const longTaskObserver=new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){performanceTelemetry.observeLongTask(entry.duration);runtimePerformance.longTask();}
    });
    longTaskObserver.observe({type:'longtask',buffered:true});
  }catch{}
}
let lastPerformanceReportAt=performance.now();
let pendingCameraZoomAt=0,dimensionArrivalStartedAt=0,dimensionRequestStartedAt=0;
const INPUT_PRESSURE_THRESHOLD=120,INPUT_PRESSURE_RECOVERY_MS=2500;
let inputPressureSince=0,inputPressureReported=false,recoveryCloseRequested=false;
let lastMovementAckDiagnosticAt=0,lastFrameGapDiagnosticAt=0,lastSendFailureDiagnosticAt=0,lastAckStallDiagnosticAt=0;
const worldMapExplorationByDimension=new Map();
const worldMapGrid={worldSize:WORLD_SIZE,chunkSize:Math.ceil(WORLD_SIZE/48),columns:48,rows:48};
let worldMapRevealAll=false,worldMapStatusNotice='',miniMapRedrawPending=false,miniMapRedrawAt=0,miniMapView={zoom:5,panX:0,panY:0};
let worldMapCanvasSize=null;
let worldMapView={zoom:32,panX:0,panY:0};
const worldMapFilters={trails:true,water:true,fires:true,places:true,resources:true,trees:true,grid:false};
let worldMapRedrawPending=false,worldMapDrag=null,worldMapPointers=new Map(),worldMapPinch=null;
let roomBuildMode = null;
let roomMovingId = null;
let roomPlacementPreview = null;
let roomSelectedId = null;
let pendingRoomFurnitureUse = null;
let roomCanEdit = false;
let canOwnerVisitHomes = false;
let roomOwnerName = '';
let worldRoomKey = '';
let worldRoomKind = 'legacy';
let worldRoomBuildingId = null;
let activeLodgingClaim = null;
let activeLodgingLease = null;
let lodgingClaims = [], lodgingLeases = [], propertyRequests = [], propertyRentalListings = [];
let recurringLeasesAvailable = false;
let worldRoomLodgingMode = null;
let cabinKeys = [], issuedCabinKeys = [], cabinOccupancy = [], propertyListings = [];
const warmedCabinsNearby=new Set();
let resourceContracts = [];
let marketQuotes = {};
let governmentTaxPanel = null;
let serverClockOffsetMs = null;
let serverClockRoundTripMs = null;
let gameDayAnchor = null;
let clockProbeSequence = 0;
let clockProbeTimer = null;
const clockProbeTimes = new Map();
const serverClockSamples = [];

const STEP = 1 / 60;
const MAX_PENDING_INPUT_COMMANDS = 180;
// Match the server's in-memory resumable-session lifetime so the client keeps
// the same sequence numbers for every session the server can still restore.
const RESUME_SCENE_GRACE_MS = 120_000;
const PREDICTION_STALL_RECOVERY_MS = 5_000;
const SERVER_SILENCE_TIMEOUT_MS = 12_000;
const REMOTE_POSITION_HISTORY = 8;
const NAMEPLATE_VISIBILITY_RADIUS = 3.2;
const AVATAR_BODY_SCALE = AVATAR_SPRITE_WORLD_SCALE;
function outsideShelterClearance(position) {
  if (worldDimensionId !== 'surface') return true;
  const margin = PLAYER_RADIUS + SHELTER_WALL_CLEARANCE;
  return !(position.x > SHELTER_BOUNDS.left - margin && position.x < SHELTER_BOUNDS.right + margin
    && position.y > SHELTER_BOUNDS.top - margin && position.y < SHELTER_BOUNDS.bottom + margin);
}
const CAMPFIRE_AUDIO_RADIUS = 32;
const CAMPFIRE_AUDIO_KEEPALIVE_RADIUS = 40;
const CAMPFIRE_AUDIO_MAX_SOURCES = 4;
const CAMPFIRE_AUDIO_SOURCE_GAIN = 2.5;
const CAMPFIRE_AUDIO_BUS_GAIN = .9;
const AMBIENT_AUDIO_ENABLED = false;
const CAMPFIRE_AUDIO_ENABLED = true;
const AMBIENT_EVENT_FADE_IN_SECONDS = 1.1;
const AMBIENT_EVENT_FADE_SECONDS = 2.4;
const CLEARING_HOME_THING = {
  type: 'home', x: CLEARING_DOOR.x, y: SHELTER_BOUNDS.bottom,
};
const SOLID_TREE_SCREEN_POINTS = new Map();
const SOLID_TREE_LIGHTING = new Map();
let frameShadowDirectionAt = null;
function currentRoomLayout() {
  return getRoomLayout(worldRoomKind, worldRoomBuildingId, worldRoomLodgingMode || activeLodgingClaim?.mode);
}
const FRAME_FIRES = [];
const FRAME_LIT_FIRES = [];
const FRAME_RESOURCES = [];
const RENDER_THINGS = [];
const VEGETATION_SOURCES = [];
const NEARBY_NAMEPLATE_THINGS = [];
const VISIBLE_NAMEPLATE_IDS = new Set();
let solidTreeLightingKey = '';
let worldChunkRangeKey = '';
let candidateSolidTrees = [];
let candidateTreeGrowth = [];
let candidateFallenTrees = [];
let candidateRocks = [];
let candidateFoliage = [];
const visibleSolidTrees = [];
const visibleClearingStaticThings = [];
let viewWidth = 480;
let viewHeight = 300;
let TILE_X = BASE_TILE_X;
let TILE_Y = BASE_TILE_Y;
let CENTRE_X = 240;
let CENTRE_Y = 150;
let spriteScale = 1;
let canvasPixelRatio = 1;
let lastPathfindingMs = null;
let lastWorldTargetMs = null;
let lastSimulationMs = 0;
let pathfindingWorker = null;
let pathfindingRequestId = 0;
const WORLD_WATER_ORIGIN=WORLD_NATURE_ORIGIN;
const WORLD_WATER_OPTIONS=Object.freeze({origin:WORLD_WATER_ORIGIN});
const WATER_PALETTES=Object.freeze({
  forest:Object.freeze(['#22566a','#83c2c4','#e1f0d0']),dark:Object.freeze(['#244552','#6d9aa0','#b3d4cf']),
  sky:Object.freeze(['#3f7994','#9fd1d8','#e2f3e6']),magic:Object.freeze(['#286b78','#76d9d1','#d3f7db']),
  inferno:Object.freeze(['#315d67','#88c7ba','#f0e6c2']),giants:Object.freeze(['#315b58','#88b9a4','#d4e4c3']),
  energy:Object.freeze(['#176f8e','#75e3ef','#e1fff5']),
});
const waterFishRouteCache=new WeakMap();
const waterRenderGeometryCache=new WeakMap();
const waterRenderGroupCache=new WeakMap();

function waterRenderRoutes(){
 const routes=waterwayRoutesForDimension(worldDimensionId,dimensionTheme,WORLD_WATER_ORIGIN);
 if(worldDimensionId!=='surface')return routes;
 const north=routes.find(route=>route.id==='surface-river-north'),east=routes.find(route=>route.id==='surface-river-east');
 if(!north||!east)return routes;
 let river=waterRenderGroupCache.get(north);
 if(!river){
  const points=[...north.points,...east.points.slice(1)];
  const renderWidths=[...north.renderWidths,...east.renderWidths.slice(1)];
  river={id:'surface-river-main',width:1.5,renderWidths,speed:.3,points,openStart:true,openEnd:true,openEndConnected:true,
   bounds:{left:Math.min(north.bounds.left,east.bounds.left),right:Math.max(north.bounds.right,east.bounds.right),
    top:Math.min(north.bounds.top,east.bounds.top),bottom:Math.max(north.bounds.bottom,east.bounds.bottom)},
   waterfalls:[...north.waterfalls,...east.waterfalls]};
  waterRenderGroupCache.set(north,river);
 }
 return [river,...routes.filter(route=>route!==north&&route!==east)];
}

function waterRenderGeometry(route){
 let cached=waterRenderGeometryCache.get(route);if(cached)return cached;
 const controls=route.points,controlWidths=Array.isArray(route.renderWidths)&&route.renderWidths.length===controls.length
  ?route.renderWidths:controls.map(()=>route.width);
 const points=[controls[0]],widths=[controlWidths[0]];
 for(let index=0;index<controls.length-1;index++){
  const previous=controls[Math.max(0,index-1)],start=controls[index],end=controls[index+1],next=controls[Math.min(controls.length-1,index+2)];
  const previousWidth=controlWidths[Math.max(0,index-1)],startWidth=controlWidths[index],endWidth=controlWidths[index+1],nextWidth=controlWidths[Math.min(controls.length-1,index+2)];
  const steps=Math.max(2,Math.min(32,Math.ceil(Math.hypot(end.x-start.x,end.y-start.y)/1.25)));
  for(let step=1;step<=steps;step++){
   const t=step/steps,t2=t*t,t3=t2*t;
   const interpolate=(a,b,c,d)=>.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
   points.push({x:interpolate(previous.x,start.x,end.x,next.x),y:interpolate(previous.y,start.y,end.y,next.y)});
   widths.push(Math.max(.5,interpolate(previousWidth,startWidth,endWidth,nextWidth)));
  }
 }
 const directions=[];
 for(let index=0;index<points.length-1;index++){
  const a=points[index],b=points[index+1],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
  directions.push({x:dx/length,y:dy/length});
 }
 const tangents=points.map((_,index)=>{
  if(index===0)return directions[0];
  if(index===points.length-1)return directions.at(-1);
  const x=directions[index-1].x+directions[index].x,y=directions[index-1].y+directions[index].y,length=Math.hypot(x,y)||1;
  return {x:x/length,y:y/length};
 });
 const distanceAt=[0];let distance=0;
 for(let index=1;index<points.length;index++){
  distance+=Math.hypot(points[index].x-points[index-1].x,points[index].y-points[index-1].y);
  distanceAt.push(distance);
 }
 const seed=hash(route.id?.length||0,route.points[0].x+route.points[0].y);
 for(let index=0;index<widths.length;index++){
  const variation=route.id==='surface-river-main'
   ?1+.05*Math.sin(distanceAt[index]*.67+seed*7)+.025*Math.sin(distanceAt[index]*1.4+seed*13)
   :1+.065*Math.sin(distanceAt[index]*.15+seed*7)+.03*Math.sin(distanceAt[index]*.31+seed*13);
  widths[index]*=variation;
 }
 const segments=points.slice(0,-1).map((a,index)=>({a,b:points[index+1],widthStart:widths[index],widthEnd:widths[index+1]}));
 cached={points,tangents,widths,segments,distanceAt,totalLength:distance};waterRenderGeometryCache.set(route,cached);return cached;
}

function waterFishRoute(route){
 let cached=waterFishRouteCache.get(route);if(cached)return cached;
 let total=0;
 const segments=waterRenderGeometry(route).segments.map(segment=>{
  const dx=segment.b.x-segment.a.x,dy=segment.b.y-segment.a.y,length=Math.hypot(dx,dy);
  const value={segment,start:total,length,dx:dx/(length||1),dy:dy/(length||1)};total+=length;return value;
 });
 const sample=distance=>{
  let low=0,high=segments.length-1;
  while(low<high){const middle=(low+high)>>1;if(distance<=segments[middle].start+segments[middle].length)high=middle;else low=middle+1;}
  const item=segments[low];
  const along=Math.max(0,Math.min(1,(distance-item.start)/(item.length||1)));
  return {x:item.segment.a.x+(item.segment.b.x-item.segment.a.x)*along,
   y:item.segment.a.y+(item.segment.b.y-item.segment.a.y)*along,dx:item.dx,dy:item.dy,
   width:item.segment.widthStart+(item.segment.widthEnd-item.segment.widthStart)*along};
 };
 const count=Math.max(2,Math.min(12,Math.floor(total/22)));
 const fish=[];
 for(let index=0;index<count;index++){
  const distance=total*(index+.5)/count,position=sample(distance);
  if(route.waterfalls.some(fall=>Math.hypot(position.x-fall.x,position.y-fall.y)<route.width+2.8))continue;
  const seed=hash(index+route.points.length,route.points[0].x+route.points[0].y);
  fish.push({distance,seed,side:seed>.5?1:-1,deep:seed<.34,size:.78+seed*.28,
   reverse:seed>.72?-1:1,school:seed>.62?2:1});
 }
 cached={segments,total,fish,sample};waterFishRouteCache.set(route,cached);return cached;
}

function drawWaterFishSprite(x,y,directionX,directionY,deep,seed,size,colors,time){
 const p=point(x,y),unit=Math.max(1,Math.round(spriteScale*size*(deep ? .78 : 1)));
 if(deep)p.y+=unit*1.15;
 const screenX=(directionX-directionY)*TILE_X,screenY=(directionX+directionY)*TILE_Y;
 const swim=reducedMotion?0:Math.sin(time*2.1+seed*9.3);
 ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));
 ctx.rotate(Math.atan2(screenY,screenX)+swim*.035);
 ctx.globalAlpha=deep ? .31 : .57;
 ctx.fillStyle=deep?colors[1]:colors[2];
 ctx.fillRect(-3*unit,-unit,5*unit,2*unit);
 ctx.fillRect(-2*unit,-2*unit,2*unit,unit);
 ctx.fillStyle=colors[1];
 ctx.fillRect(-5*unit,swim>.08?-2*unit:unit,2*unit,unit);
 ctx.fillRect(-4*unit,0,unit,unit);
 ctx.fillStyle=deep?colors[0]:colors[1];ctx.fillRect(unit,-unit,unit,unit);
 ctx.restore();
}

function drawWaterFish(colors,visible,lakes){
 const time=reducedMotion?0:worldClock;let drawn=0;
 for(const route of waterRenderRoutes()){
  const path=waterFishRoute(route);if(path.total<=0)continue;
  for(const fish of path.fish){
   if(drawn>=40)return;
   const distance=Math.max(0,Math.min(path.total,fish.distance+(reducedMotion?0:Math.sin(time*.2+fish.seed*11)*.85)));
   const position=path.sample(distance);
   const direction=fish.reverse;
   const lateral=fish.side*(route.id==='surface-river-main'?position.width:route.width)*.16+(reducedMotion?0:Math.sin(time*.27+fish.seed*7)*.07);
   const x=position.x-position.dy*lateral;
   const y=position.y+position.dx*lateral;
   if(!visible(x,y,3))continue;
   const dx=position.dx*direction,dy=position.dy*direction;
   drawWaterFishSprite(x,y,dx,dy,fish.deep,fish.seed,fish.size,colors,time);drawn++;
   if(fish.school===2&&drawn<40){
    const follower=fish.distance-.42*direction;
    const follow=Math.max(0,Math.min(path.total,follower+(reducedMotion?0:Math.sin(time*.2+fish.seed*11+1)*.85)));
    const other=path.sample(follow);
    const fx=other.x-other.dy*lateral;
    const fy=other.y+other.dx*lateral;
    if(visible(fx,fy,3)&&waterSurfaceDepthAt(fx,fy,WORLD_WATER_OPTIONS)>0){drawWaterFishSprite(fx,fy,other.dx*direction,other.dy*direction,!fish.deep,fish.seed+1,fish.size*.82,colors,time);drawn++;}
   }
  }
 }
 if(worldDimensionId==='surface'){
  const x0=(SOLID_WATER.left+SOLID_WATER.right)/2,y0=(SOLID_WATER.top+SOLID_WATER.bottom)/2;
  for(let index=0;index<3&&drawn<40;index++){
   const seed=.17+index*.23,angle=time*.12+seed*Math.PI*2+index*2.1;
   const radius=.24+(index%2)*.28;
   const x=x0+Math.cos(angle)*radius,y=y0+Math.sin(angle)*radius;
   if(!visible(x,y,3))continue;
   drawWaterFishSprite(x,y,-Math.sin(angle),Math.cos(angle),index===1,seed,.82+index*.08,colors,time);drawn++;
  }
 }
 for(const lake of lakes){
  if(drawn>=40)return;
  const seed=hash(lake.x+13,lake.y+37),timeAngle=time*.13+seed*Math.PI*2;
  for(let index=0;index<3&&drawn<40;index++){
   const angle=timeAngle+index*Math.PI*2/3,radius=lake.radius*(.11+(index%2)*.045);
   const drift=reducedMotion?0:Math.sin(time*.19+seed*8+index)*Math.min(.55,lake.radius*.012);
   const x=lake.x+Math.cos(angle)*(radius+drift),y=lake.y+Math.sin(angle)*(radius+drift);
   if(!visible(x,y,3)||waterSurfaceDepthAt(x,y,WORLD_WATER_OPTIONS)<=0)continue;
   const dx=-Math.sin(angle)*(index===1?-1:1),dy=Math.cos(angle)*(index===1?-1:1),deep=index===1;
   drawWaterFishSprite(x,y,dx,dy,deep,seed+index*.31,.76+index*.1,colors,time);drawn++;
  }
 }
}

// TILE_X/TILE_Y already include camera zoom; invert only the current viewport, with a small overhang margin.
function getCameraVisibleWorldBounds(targetCamera = camera) {
  const left=-CENTRE_X,right=viewWidth-CENTRE_X,top=-CENTRE_Y,bottom=viewHeight-CENTRE_Y;
  const corners=[[left,top],[right,top],[left,bottom],[right,bottom]]
    .map(([x,y])=>({x:x/(2*TILE_X)+y/(2*TILE_Y),y:-x/(2*TILE_X)+y/(2*TILE_Y)}));
  const pad=1;
  return {
    left:targetCamera.x+Math.min(...corners.map(point=>point.x))-pad,
    right:targetCamera.x+Math.max(...corners.map(point=>point.x))+pad,
    top:targetCamera.y+Math.min(...corners.map(point=>point.y))-pad,
    bottom:targetCamera.y+Math.max(...corners.map(point=>point.y))+pad,
  };
}
function getVisibleWorldBounds(targetCamera = camera, scale = 1) {
  const left = -250 - CENTRE_X, right = viewWidth + 250 - CENTRE_X;
  const top = -250, bottom = viewHeight + 250;
  const corners = [[left,top-CENTRE_Y],[right,top-CENTRE_Y],[left,bottom-CENTRE_Y],[right,bottom-CENTRE_Y]]
    .map(([x,y]) => ({x:x/(2*TILE_X*scale)+y/(2*TILE_Y*scale),y:-x/(2*TILE_X*scale)+y/(2*TILE_Y*scale)}));
  const pad = 3;
  return {
    left: targetCamera.x + Math.min(...corners.map(point => point.x)) - pad,
    right: targetCamera.x + Math.max(...corners.map(point => point.x)) + pad,
    top: targetCamera.y + Math.min(...corners.map(point => point.y)) - pad,
    bottom: targetCamera.y + Math.max(...corners.map(point => point.y)) + pad,
  };
}

function visibleTerrainChunks(targetCamera = camera,boundsOverride=null,scale=1) {
  const bounds=boundsOverride||getVisibleWorldBounds(targetCamera,scale),chunks=[];
  for(let cy=Math.max(0,Math.floor(bounds.top/8)-1);cy<Math.min(Math.ceil(WORLD_SIZE/8),Math.ceil(bounds.bottom/8)+1);cy++) {
    for(let cx=Math.max(0,Math.floor(bounds.left/8)-1);cx<Math.min(Math.ceil(WORLD_SIZE/8),Math.ceil(bounds.right/8)+1);cx++) {
      const p=point(cx*8,cy*8,targetCamera,0),halfWidth=TILE_X*8*scale,height=TILE_Y*16*scale;
      p.x=CENTRE_X+(p.x-CENTRE_X)*scale;p.y=CENTRE_Y+(p.y-CENTRE_Y)*scale;
      const edgeMargin=scale===1?0:2;
      if(p.x+halfWidth < -edgeMargin||p.x-halfWidth>viewWidth+edgeMargin||p.y+height < -edgeMargin||p.y-24>viewHeight+edgeMargin)continue;
      chunks.push({cx,cy});
    }
  }
  return chunks;
}
function pendingZoomTerrainChunks(){
  if(pendingCameraZoom===null)return [];
  const nextTileX=Math.round((viewWidth<600?26:32)*pendingCameraZoom/100);
  return visibleTerrainChunks(camera,null,nextTileX/TILE_X);
}

function terrainChunksWithMovementMargin(targetCamera,boundsOverride=null) {
  const visible=visibleTerrainChunks(targetCamera,boundsOverride),ordered=[],seen=new Set();
  const capacity=Math.min(160,Math.max(128,visible.length+8));
  const add=chunks=>{
    for(const chunk of chunks){
      const key=chunk.cx+':'+chunk.cy;
      if(seen.has(key))continue;
      seen.add(key);ordered.push(chunk);
      if(ordered.length>=capacity)return;
    }
  };
  add(visible);
  for(const [dx,dy] of [[-8,0],[8,0],[0,-8],[0,8],[-8,-8],[-8,8],[8,-8],[8,8]]){
    if(ordered.length>=capacity)break;
    add(visibleTerrainChunks({x:targetCamera.x+dx,y:targetCamera.y+dy}));
  }
  return ordered;
}
function updateVisibleWorldChunks() {
  if (worldLocation !== 'clearing') {
    worldChunkRangeKey = '';
    candidateSolidTrees = [];
    candidateTreeGrowth = [];
    candidateFallenTrees = [];
    candidateRocks = [];
    candidateFoliage = [];
    visibleSolidTrees.length = 0;
    visibleClearingStaticThings.length = 0;
    SOLID_TREE_SCREEN_POINTS.clear();
    return;
  }
  const bounds = getVisibleWorldBounds();
  const chunkBounds = {
    left:Math.floor(bounds.left/WORLD_CHUNK_SIZE)*WORLD_CHUNK_SIZE, right:(Math.floor(bounds.right/WORLD_CHUNK_SIZE)+1)*WORLD_CHUNK_SIZE,
    top:Math.floor(bounds.top/WORLD_CHUNK_SIZE)*WORLD_CHUNK_SIZE, bottom:(Math.floor(bounds.bottom/WORLD_CHUNK_SIZE)+1)*WORLD_CHUNK_SIZE,
  };
  const definition=getWorldDefinition();
  const rangeKey = `${worldGeometryCacheKey(definition)}:${chunkBounds.left}:${chunkBounds.right}:${chunkBounds.top}:${chunkBounds.bottom}`;
  if (rangeKey !== worldChunkRangeKey) {
    worldChunkRangeKey = rangeKey;
    candidateSolidTrees = getSolidTreesInBounds(chunkBounds);
    candidateTreeGrowth = getTreeGrowthInBounds(chunkBounds);
    candidateFallenTrees = getFallenTreesInBounds(chunkBounds);
    candidateRocks = getRocksInBounds(chunkBounds);
    candidateFoliage = worldDimensionId === 'breu' || worldDimensionId.startsWith('arrival-')
      ? [] : sceneArt.foliageInBounds(chunkBounds,candidateSolidTrees);
    SOLID_TREE_SCREEN_POINTS.clear();

    // Static scene membership changes only when the visible chunk range or world revision changes.
    // Keep these records between frames instead of rebuilding hundreds of objects while walking.
    visibleClearingStaticThings.length = 0;
    const addStaticThing = thing => {
      const screen = { x: 0, y: 0, height: surfaceHeight(thing.x, thing.y, 'clearing') };
      const record = { ...thing, screen };
      if (thing.type === 'home') Object.assign(record, buildingRenderDepthAnchor(RECEPTION_BUILDING));
      if (thing.type === 'lodging') Object.assign(record, buildingRenderDepthAnchor(thing.building));
      if (thing.type === 'building-post') Object.assign(record, buildingPostDepthAnchor(thing.post));
      if (thing.type === 'building-canopy') Object.assign(record, buildingCanopyDepthAnchor(thing.canopy));
      if (thing.type === 'tree' && worldDimensionId === 'surface')
        Object.assign(record, buildingTreeDepthAnchor(thing.tree, SHELTER_BOUNDS) || {});
      visibleClearingStaticThings.push(record);
      return screen;
    };
    if (worldDimensionId === 'surface') {
      addStaticThing(CLEARING_HOME_THING);
      const receptionCanopy=buildingArchitecture(RECEPTION_BUILDING).canopy;
      if(receptionCanopy)addStaticThing({type:'building-canopy',x:receptionCanopy.right,y:receptionCanopy.bottom,
        canopy:receptionCanopy,building:RECEPTION_BUILDING});
      for(const post of buildingArchitecture(RECEPTION_BUILDING).posts){
        const x=(post.left+post.right)/2;
        addStaticThing({type:'building-post',x,y:post.bottom,post,building:RECEPTION_BUILDING});
      }
      for (const building of villageBuildingsInBounds(chunkBounds, 2)) {
        addStaticThing({ type: 'lodging', x: (building.bounds.left + building.bounds.right) / 2,
          y: building.bounds.bottom, building });
        const canopy=buildingArchitecture(building).canopy;
        if(canopy)addStaticThing({type:'building-canopy',x:canopy.right,y:canopy.bottom,canopy,building});
        for(const post of buildingArchitecture(building).posts){
          const x=(post.left+post.right)/2;
          addStaticThing({type:'building-post',x,y:post.bottom,post,building});
        }
      }
    }
    for (const plant of candidateFoliage) addStaticThing({ type: 'foliage', ...plant });
    for (const tree of candidateFallenTrees) {
      for (let section = 0; section < 5; section += 1) {
        addStaticThing({
          type: 'fallen',
          x: tree.x - FALLEN_TREE_HALF_LENGTH + (section + .5) * FALLEN_TREE_HALF_LENGTH * 2 / 5,
          y: tree.y,
          tree,
          section,
        });
      }
    }
    for (const tree of candidateSolidTrees) {
      const screen = addStaticThing({ type: 'tree', x: tree.x, y: tree.y, tree, index: tree.index, arrivalRing: tree.arrivalRing === true });
      SOLID_TREE_SCREEN_POINTS.set(tree, screen);
    }
    for (const tree of candidateTreeGrowth) addStaticThing({ type:'tree-growth', x:tree.x, y:tree.y, tree });
    for (const rock of candidateRocks) addStaticThing({ type: 'world-rock', x: rock.x, y: rock.y, rock });
  }
  visibleSolidTrees.length = 0;
  for (const thing of visibleClearingStaticThings) {
    const screen = thing.screen;
    screen.x = CENTRE_X + (thing.x - thing.y) * TILE_X - Math.round((camera.x - camera.y) * TILE_X);
    screen.y = CENTRE_Y + (thing.x + thing.y) * TILE_Y - Math.round((camera.x + camera.y) * TILE_Y)
      - screen.height * HEIGHT_PIXELS * spriteScale;
    if (thing.type === 'tree' && screen.x >= -250 && screen.x <= viewWidth + 250
        && screen.y >= -250 && screen.y <= viewHeight + 250) {
      visibleSolidTrees.push(thing.tree);
    }
  }
}

function updateSolidTreeLighting(frameFires) {
  const now=performance.now();
  const daylight=dimensionTheme==='dark'?0:gameDay.daylight;
  const fireProfile=nightEmitterProfile(FIRE_LIGHT_REACH,1.7,{night:gameDay.night,hasMoon:gameDay.hasMoon});
  let key = `${TILE_X}:${spriteScale}:${frameFires.length}:${worldChunkRangeKey}:${Math.round(daylight*100)}`;
  for (const fire of frameFires) key += `:${fire.x},${fire.y},${Math.round(campfireFlameStrength(fire,now)*20)}`;
  key += gameDay.hasMoon?':moon':':moonless';
  if (key === solidTreeLightingKey) return;
  solidTreeLightingKey = key;
  SOLID_TREE_LIGHTING.clear();
  for (const tree of candidateSolidTrees) {
    let nearest=fireProfile.reach,strongestFire=null,strongestFireScore=0;
    for (const fire of frameFires) {
      const distance = Math.hypot(tree.x - fire.x, tree.y - fire.y);
      if(distance<nearest)nearest=distance;
      if(distance>=fireProfile.reach)continue;
      const attenuatedStrength=campfireFlameStrength(fire,now)*Math.max(0,1-distance/fireProfile.reach)**fireProfile.falloffExponent;
      if(attenuatedStrength>strongestFireScore){strongestFire=fire;strongestFireScore=attenuatedStrength;}
    }
    const visibleFireStrength=strongestFireScore*(.3+.7*gameDay.night);
    SOLID_TREE_LIGHTING.set(tree, {
      source: strongestFire ? { kind: 'fire', x: strongestFire.x, y: strongestFire.y } : { kind: 'ambient' },
      warm: Boolean(strongestFire&&nearest<5&&visibleFireStrength>.38),
    });
  }
}

let terrainPixelationHoldUntil=0;
function isTerrainPixelationActive(now=performance.now()) {
  if(worldLocation!=='clearing')return false;
  if(sceneArt.isTerrainStreaming())terrainPixelationHoldUntil=now+240;
  return now<terrainPixelationHoldUntil;
}
function maximumCanvasPixelRatio() {
  // Keep every scene at one logical pixel per two screen pixels. This is a
  // visual setting, not a load-shedding knob, so frame pressure cannot change it.
  return .5;
}

function resizeCanvas() {
  document.body.dataset.location=worldLocation;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  viewWidth = rect.width;
  viewHeight = rect.height;
  const maxPixelRatio = maximumCanvasPixelRatio();
  canvasPixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
  const backingWidth = Math.max(1, Math.round(viewWidth * canvasPixelRatio));
  const backingHeight = Math.max(1, Math.round(viewHeight * canvasPixelRatio));
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  ctx.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const framing=worldLocation==='room'?roomView(currentRoomLayout(),viewWidth,viewHeight,localRenderPosition):null;
  TILE_X = framing
    ? Math.max(8, Math.min(88, Math.round(framing.tileX * cameraZoomPercent / 200) * 2))
    : Math.round((viewWidth < 600 ? 26 : 32) * cameraZoomPercent / 100);
  TILE_Y = TILE_X * (BASE_TILE_Y / BASE_TILE_X);
  spriteScale = TILE_X / 16;
  CENTRE_X = framing?.centerX??viewWidth / 2;
  CENTRE_Y = framing?.centerY??viewHeight * (viewWidth<600 ? .4 : .52);
  return true;
}

const canvasResizeObserver = new ResizeObserver(() => {
  if (resizeCanvas() && authenticated) { sendViewport(); draw(2); }
});
canvasResizeObserver.observe(canvas.parentElement);
window.addEventListener('resize', () => { if (resizeCanvas() && authenticated) { sendViewport(); draw(2); } }, { passive: true });

function scaleAround(point, scale) {
  const x=Math.round(point.x),y=Math.round(point.y);
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.translate(-x,-y);
}

function announce(message, duration = 2100) {
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), duration);
}
window.addEventListener('clareira:update-waiting', () => {
  if (!document.hidden && loadingScreen.hidden) announce('Atualização disponível. Recarregue quando quiser aplicá-la.', 4500);
});

function send(message) {
  if(message?.type==='dimensionTravel')dimensionRequestStartedAt=performance.now();
  const sent=sendWhenOpen(socket, WebSocket.OPEN, message);
  if(message?.type==='dimensionTravel'&&!sent)dimensionRequestStartedAt=0;
  return sent;
}

function flushMovementDiagnostics(connection=socket){
  if(connection?.readyState!==WebSocket.OPEN)return false;
  const report=movementDiagnostics.takeBatch();
  return report?sendWhenOpen(connection,WebSocket.OPEN,report):false;
}
function recordMovementDiagnostic(kind,details={},upload=false){
  movementDiagnostics.record(kind,details,{persist:upload});
  if(upload)flushMovementDiagnostics();
}
function flushPerformanceTelemetry(now=performance.now()){
  if(!sceneReady||document.visibilityState==='hidden'||socket?.readyState!==WebSocket.OPEN)return false;
  const report=performanceTelemetry.createReport(now,{location:worldLocation==='room'?'room':'clearing',
    device:matchMedia('(max-width: 700px)').matches?'mobile':'desktop',
    zoom:cameraZoomPercent<80?'under-80':cameraZoomPercent>110?'over-110':'80-110'});
  lastPerformanceReportAt=now;
  if(report)runtimePerformance.report(report);
  return report?send(report):false;
}
function movementCloseReasonBucket(reason,code){
  if(reason==='movement acknowledgements stalled')return 'movement-ack-stalled';
  if(reason==='server heartbeat timed out')return 'heartbeat-timeout';
  if(reason==='initial world snapshot timed out')return 'initial-snapshot-timeout';
  if(reason==='player presence lease lost')return 'presence-lease-lost';
  if(reason==='server shutdown')return 'server-shutdown';
  if(code===1006)return 'abnormal-close';
  if(code===1009)return 'payload-too-large';
  if(code===1012)return 'server-restart';
  if(code===1013)return 'server-overloaded';
  if(code===1008)return 'policy-close';
  if(code===1000||code===1001)return 'normal';
  return reason?'other':'abnormal-close';
}

function resetServerClockSync() {
  if (clockProbeTimer !== null) clearInterval(clockProbeTimer);
  clockProbeTimer = null;
  clockProbeTimes.clear();
  serverClockSamples.length = 0;
  serverClockOffsetMs = null;
  serverClockRoundTripMs = null;
  gameDayAnchor = null;
}

function gameDayTimestampMs() {
  if (!gameDayAnchor || serverClockOffsetMs === null) return Date.now();
  const serverNow = performance.now() - serverClockOffsetMs;
  return gameDayAnchor.serverWallTimeMs + serverNow - gameDayAnchor.serverTime;
}

function sendServerClockProbe(connection) {
  if (connection !== socket || connection.readyState !== WebSocket.OPEN) return;
  const sequence = ++clockProbeSequence;
  clockProbeTimes.set(sequence, performance.now());
  while (clockProbeTimes.size > 8) clockProbeTimes.delete(clockProbeTimes.keys().next().value);
  connection.send(JSON.stringify({ type: 'clockPing', sequence }));
}

let lastPingSpikeAt=-Infinity;
function acceptServerClockPong(message) {
  const sentAt = clockProbeTimes.get(message.sequence);
  const serverTime = Number(message.serverTime);
  if (!Number.isFinite(sentAt) || !Number.isFinite(serverTime)) return;
  clockProbeTimes.delete(message.sequence);
  const receivedAt = performance.now();
  const sample = {
    roundTripMs: Math.max(0, receivedAt - sentAt),
    offsetMs: (sentAt + receivedAt) / 2 - serverTime,
  };
  runtimePerformance.ping(sample.roundTripMs,message);
  if(sample.roundTripMs>=400&&receivedAt-lastPingSpikeAt>=10_000){
    lastPingSpikeAt=receivedAt;
    recordMovementDiagnostic('ping-spike',{roundTripMs:sample.roundTripMs,serverLoopLagMs:message.serverLoopLagMs,
      serverWorkMs:message.serverWorkMs,serverBufferedBytes:message.serverBufferedBytes,
      clientFrameP95Ms:runtimePerformanceSnapshot?.frameP95Ms,pending:pendingInputs.length,outbound:outboundInputs.length},true);
  }
  serverClockSamples.push(sample);
  if (serverClockSamples.length > 8) serverClockSamples.shift();
  const best = serverClockSamples.reduce((current, next) =>
    next.roundTripMs < current.roundTripMs ? next : current);
  const wasSynchronized = serverClockOffsetMs !== null;
  serverClockOffsetMs = best.offsetMs;
  serverClockRoundTripMs = best.roundTripMs;
  if (!wasSynchronized) {
    remotePositions.clear(); remotePlayback.clear(); wildlifePositions.clear();wildlifePlayback.clear();
    // Travel controls wait for the first clock sample; release them now.
    if(typeof updateDimensionTravel==='function')updateDimensionTravel(dimensionList,worldDimensionId);
    if(arrivalTravelPending&&teleportTravelReady())requestArrivalTravel();
  }
}

function currentViewport() {
  return { width: Math.round(viewWidth), height: Math.round(viewHeight) };
}

function sendViewport() {
  if (!authenticated || socket?.readyState !== WebSocket.OPEN) return;
  const viewport = currentViewport();
  if (viewport.width === lastSentViewport.width && viewport.height === lastSentViewport.height) return;
  lastSentViewport = viewport;
  send({ type: 'view', ...viewport });
}

const sceneReadiness = createSceneReadiness();
const warmedDimensionThemes = new Set();
const transitWorldDefinitions = new Map();
const worldDefinitionCacheKey=definition=>[definition?.dimensionId,definition?.revision,definition?.seed,definition?.generationVersion,definition?.theme].join(':');
const queuedAvatarAnimationVariants = new Set();
const warmedAvatarAnimationVariants = new Set();
let dimensionWarmupPending = false;
let activeAvatarAppearance = null;
const roomTransition=createRoomTransition(canvas,{reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
let dimensionTravelStarting=false,dimensionTravelRequestPending=false,teleportEffectReady=false;
let dimensionTravelCooldownUntil=0,dimensionTravelCooldownTimer=0;
let dimensionTravelRequestSequence=0,pendingDimensionTravelRequestId=null;
const clientServerTime=()=>performance.now()-(serverClockOffsetMs??0);
// Transit timestamps come from the server clock; before the first clock sample
// the effect would be scheduled against the wrong time base and skip or glitch.
const teleportTravelReady=()=>teleportEffectReady&&serverClockOffsetMs!==null;
const teleportEffects=createTeleportEffects({getServerNow:clientServerTime,getDimensionId:()=>worldDimensionId,getListenerPosition:()=>localRenderPosition,reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,loadAssets:async()=>{
  const selected=contentAssets.assetsForScene('teleport'),loaded=await contentAssets.loadScene('teleport');
  const byId=new Map(selected.map((asset,index)=>[asset.id,loaded[index]]));
  return {images:{lower:byId.get('image.teleport-lower'),beam:byId.get('image.teleport-beam'),upper:byId.get('image.teleport-upper')},
    audio:['audio.teleport-lower','audio.teleport-beam','audio.teleport-upper','audio.teleport-vortex'].map(id=>byId.get(id)).filter(data=>data instanceof ArrayBuffer)};
},onActivity:(active,event)=>{
  if(!active&&event?.actorId===selfId&&dimensionTravelStarting){dimensionTravelStarting=false;updateDimensionTravel(dimensionList,worldDimensionId);}
}});
function scheduleIdlePreparation(callback) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(callback, { timeout: 1600 });
  else window.setTimeout(callback, 220);
}
function worldMapKeyFor(dimensionId,definition){return [dimensionId,definition.seed,definition.revision,definition.generationVersion].join(':');}
function cacheWorldMapOverview(dimensionId,definition,overview){
  const key=worldMapKeyFor(dimensionId,definition);
  worldMapOverviewCache.set(key,overview);
  while(worldMapOverviewCache.size>6)worldMapOverviewCache.delete(worldMapOverviewCache.keys().next().value);
  return overview;
}
function getCachedWorldMapOverview(dimensionId,definition){
  const key=worldMapKeyFor(dimensionId,definition);
  const cached=worldMapOverviewCache.get(key);
  if(cached)return cached;
  if(worldMapPreparationJobs.has(key))return null;
  const job={builder:createWorldMapOverview()};
  worldMapPreparationJobs.set(key,job);
  while(worldMapPreparationJobs.size>2)worldMapPreparationJobs.delete(worldMapPreparationJobs.keys().next().value);
  const pump=()=>{
    if(worldMapPreparationJobs.get(key)!==job)return;
    const source=getWorldDefinition(),started=performance.now();let result;
    try{
      applyWorldDefinition(definition);
      for(let count=0;count<128;count++){
        result=job.builder.next();
        if(result.done||performance.now()-started>=1.8)break;
      }
    }catch(error){worldMapPreparationJobs.delete(key);console.warn('Falha ao preparar o mapa.',error);return;}
    finally{applyWorldDefinition(source);}
    if(result.done){
      worldMapPreparationJobs.delete(key);
      const overview=cacheWorldMapOverview(dimensionId,definition,result.value);
      preloadWorldMapCaches(overview,document);requestMiniMapRedraw();
      if(pendingWorldMapOpen?.key===key){
        const pending=pendingWorldMapOpen;pendingWorldMapOpen=null;
        if(worldDimensionId===dimensionId&&!panels.isOpen)openWorldMap(pending.options);
      }
    }else requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
  return null;
}
let pendingWorldMapOpen=null;
function warmTransitDestination(event) {
  const targetDefinition=event?.destinationWorldDefinition;
  if(!targetDefinition||!Number.isFinite(event.destinationX)||!Number.isFinite(event.destinationY))return;
  const sourceDefinition=getWorldDefinition();
  const cacheKey=worldDefinitionCacheKey(targetDefinition);
  transitWorldDefinitions.set(cacheKey,targetDefinition);
  while(transitWorldDefinitions.size>64)transitWorldDefinitions.delete(transitWorldDefinitions.keys().next().value);
  const chunks=clearingWorldChunkCoordinates(getCameraVisibleWorldBounds({x:event.destinationX,y:event.destinationY}));
  getCachedWorldMapOverview(event.destinationDimensionId,targetDefinition);
  const warmNext=()=>{
    if(worldDimensionId!==event.sourceDimensionId||getWorldDefinition()!==sourceDefinition)return;
    try{
      const targetTheme=targetDefinition.theme;
      if(typeof targetTheme==='string'&&!warmedDimensionThemes.has(targetTheme)){
        sceneArt.preloadSharedAssets(targetTheme);
        warmedDimensionThemes.add(targetTheme);
      }
      applyWorldDefinition(targetDefinition);
      const chunk=chunks.shift();
      if(chunk){const {cx,cy}=chunk;
        const area={left:cx*WORLD_CHUNK_SIZE,right:Math.min(WORLD_SIZE,(cx+1)*WORLD_CHUNK_SIZE),
          top:cy*WORLD_CHUNK_SIZE,bottom:Math.min(WORLD_SIZE,(cy+1)*WORLD_CHUNK_SIZE)};
        getSolidTreesInBounds(area);getResourcesInBounds(area);getFallenTreesInBounds(area);getRocksInBounds(area);
      }
    }catch(error){console.warn('Falha ao aquecer o trecho de chegada.',error);}
    finally{applyWorldDefinition(sourceDefinition);}
    if(chunks.length)requestAnimationFrame(warmNext);
  };
  requestAnimationFrame(warmNext);
}
function scheduleDimensionVisualWarmup() {
  if (!sceneReady || document.visibilityState === 'hidden' || dimensionWarmupPending) return;
  if(teleportEffects.active){setTimeout(scheduleDimensionVisualWarmup,250);return;}
  const themes = [...new Set([getWorldDefinition().theme, ...dimensionList.map(dimension => dimension.theme)])]
    .filter(theme => typeof theme === 'string' && theme);
  const theme = themes.find(candidate => !warmedDimensionThemes.has(candidate));
  if (!theme) return;
  dimensionWarmupPending = true;
  scheduleIdlePreparation(() => {
    dimensionWarmupPending = false;
    if (!sceneReady || document.visibilityState === 'hidden') return;
    if (teleportEffects.active) { setTimeout(scheduleDimensionVisualWarmup, 250); return; }
    try {
      sceneArt.preloadSharedAssets(theme);
      warmedDimensionThemes.add(theme);
    } catch {}
    scheduleDimensionVisualWarmup();
  });
}
function scheduleAvatarAnimationWarmup() {
  const appearance = activeAvatarAppearance;
  if (!sceneReady || document.visibilityState === 'hidden' || !appearance || reducedMotion) return;
  if(teleportEffects.active){setTimeout(scheduleAvatarAnimationWarmup,250);return;}
  const variant = getAvatarSpriteVariant(appearance);
  if (warmedAvatarAnimationVariants.has(variant) || queuedAvatarAnimationVariants.has(variant)) return;
  queuedAvatarAnimationVariants.add(variant);
  scheduleIdlePreparation(async () => {
    if (!sceneReady || document.visibilityState === 'hidden') {
      queuedAvatarAnimationVariants.delete(variant);
      return;
    }
    if (teleportEffects.active) { queuedAvatarAnimationVariants.delete(variant); setTimeout(scheduleAvatarAnimationWarmup, 250); return; }
    try { await preloadAvatarAnimationActions(appearance); }
    catch {}
    queuedAvatarAnimationVariants.delete(variant);
    warmedAvatarAnimationVariants.add(variant);
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' && sceneReady) {
    scheduleDimensionVisualWarmup();
    scheduleAvatarAnimationWarmup();
  }
});
function clearDimensionTransitMovement(){
  lastInput=clearHeldInputs(keys,touchDirections);lastInputSend=performance.now();
  pendingInputs=[];outboundInputs=[];walkPath=[];localMoving=false;lastMotion={x:0,y:0};
  localRenderCorrection={x:0,y:0};
}
function dimensionTransitMovementLocked(){
  return roomTransition.active||dimensionTravelRequestPending||teleportEffects.shouldLockMovement(selfId,worldDimensionId,clientServerTime());
}
const loadingScreen = document.querySelector('#scene-loading');
const arrivalSkyBrand=document.createElement('div');
arrivalSkyBrand.className='arrival-sky-brand';arrivalSkyBrand.hidden=true;arrivalSkyBrand.setAttribute('aria-hidden','true');
const arrivalWordmark=document.querySelector('.loading-wordmark')?.cloneNode(true);
if(arrivalWordmark){arrivalWordmark.removeAttribute('id');arrivalSkyBrand.append(arrivalWordmark);}
document.body.append(arrivalSkyBrand);
const loadingMessage = document.querySelector('#loading-message');
const loadingCaption = document.querySelector('#loading-caption');
const loadingProgressBar = document.querySelector('#loading-progress');
const loadingPercent = document.querySelector('#loading-percent');
const loadingReload = document.querySelector('#loading-reload');
const INITIAL_LOADING_COMPLETE_HOLD_MS = 1000;
const INITIAL_LOADING_MINI_FILL_MS = 420;
const loadingMiniStep = document.querySelector('[data-loading-step="current"]');
window.__clareiraStopInitialProgress?.();
window.__clareiraMainLoadingProgressReady = true;
let sceneReady = false, snapshotReady = false, assetsReady = false, initialSceneRevealed = false;
let connectionSnapshotReady = false;
let terrainRetainedFrameCount=0,terrainRetainedTotalMs=0,terrainRetainedMaxMs=0,terrainRetainedSince=0,terrainCapacityErrorShown=false;
let terrainIncompleteVisibleFrames=0,terrainIncompleteVisibleSince=0,terrainIncompleteVisibleTotalMs=0,terrainIncompleteVisibleMaxMs=0;
let lastTerrainQueueWorkMs=0;
let loadingGeneration = 0, loadingProgress = null;
let sessionCheckCompleted = false;
let pendingMiniSceneTransition = null;
let holdingInitialSession = false;
let firstWorldSceneLoaded = false;
let firstWorldLoadAfterGate = false;
let loginGateWasRevealed = false;
const initialLoadProfile = 'all';
const initialLoadDurations = { files: Math.max(1, performance.now()) };
const initialLoadStageStartedAt = {};
let initialLoadTimingSaved = false;
const initialLoadHistoryKey = 'clareira:initial-load-duration-v1';
function startInitialLoadStage(stage) {
  if (initialSceneRevealed || initialLoadStageStartedAt[stage]) return;
  initialLoadStageStartedAt[stage] = performance.now();
}
function finishInitialLoadStage(stage) {
  if (initialLoadDurations[stage] > 0) return;
  const startedAt = initialLoadStageStartedAt[stage];
  if (Number.isFinite(startedAt)) initialLoadDurations[stage] = Math.max(1, performance.now() - startedAt);
}
function readInitialLoadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(initialLoadHistoryKey) || '{}');
    const samples = value[initialLoadProfile];
    return Array.isArray(samples) ? samples.slice(-7) : [];
  } catch { return []; }
}
function initialLoadWeights() {
  const samples = readInitialLoadHistory();
  const stages = ['files', 'session', 'character', 'scene'];
  const medians = {};
  for (const stage of stages) {
    const values = samples.map(sample => Number(sample?.[stage]))
      .filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!values.length) return { files: 0.25, session: 0.25, character: 0.25, scene: 0.25 };
    medians[stage] = values[Math.floor(values.length / 2)];
  }
  const total = stages.reduce((sum, stage) => sum + medians[stage], 0);
  return Object.fromEntries(stages.map(stage => [stage, medians[stage] / total]));
}
function saveInitialLoadTiming() {
  if (initialLoadTimingSaved || !sessionCheckCompleted) return;
  const stages = ['files', 'session', 'character', 'scene'];
  if (!stages.every(stage => Number.isFinite(initialLoadDurations[stage]) && initialLoadDurations[stage] > 0)) return;
  try {
    const value = JSON.parse(localStorage.getItem(initialLoadHistoryKey) || '{}');
    const samples = Array.isArray(value[initialLoadProfile]) ? value[initialLoadProfile] : [];
    samples.push(Object.fromEntries(stages.map(stage => [stage, initialLoadDurations[stage]])));
    value[initialLoadProfile] = samples.slice(-7);
    localStorage.setItem(initialLoadHistoryKey, JSON.stringify(value));
    initialLoadTimingSaved = true;
  } catch {}
}
function finishInitialSessionCheck() {
  if (!sessionCheckCompleted) {
    sessionCheckCompleted = true;
    finishInitialLoadStage('session');
  }
}
const initialLoadWeightsForSession = initialLoadWeights();
let initialLoadingPercentValue = Math.max(0, Math.min(100, Number(loadingProgressBar.getAttribute('aria-valuenow')) || 0));
let initialLoadingPercentTarget = initialLoadingPercentValue;
let initialLoadingPercentFrame = null;
function setInitialLoadingPercent(requested, immediate = false) {
  const numeric = Number(requested);
  const safeRequested = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
  const visibleValue = Number.parseFloat(loadingProgressBar.getAttribute("aria-valuenow"));
  const highWater = Math.max(initialLoadingPercentValue, Number.isFinite(visibleValue) ? visibleValue : 0);
  initialLoadingPercentValue = highWater;
  const target = Math.max(initialLoadingPercentTarget, highWater, safeRequested);
  initialLoadingPercentTarget = target;
  if (initialLoadingPercentFrame !== null) {
    if (!immediate) return;
    cancelAnimationFrame(initialLoadingPercentFrame);
    initialLoadingPercentFrame = null;
  }
  const start = Math.max(0, Math.min(100, highWater));
  const duration = immediate || matchMedia("(prefers-reduced-motion: reduce)").matches ? 0
    : Math.min(560, Math.max(220, Math.abs(target - start) * 13));
  const startedAt = performance.now();
  const render = value => {
    const requestedValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    const currentVisible = Number.parseFloat(loadingProgressBar.getAttribute("aria-valuenow"));
    const safeValue = Math.max(requestedValue, Number.isFinite(currentVisible) ? currentVisible : 0);
    initialLoadingPercentValue = safeValue;
    loadingProgressBar.setAttribute("aria-valuenow", safeValue.toFixed(1));
    loadingProgressBar.style.setProperty("--loading-progress", safeValue + "%");
    loadingScreen.style.setProperty("--loading-scene-progress", String(safeValue / 100));
    loadingPercent.textContent = safeValue.toFixed(1).replace(".", ",") + "%";
    loadingPercent.hidden = false;
    loadingPercent.setAttribute("aria-hidden", "false");
  };
  if (!duration) { render(target); initialLoadingPercentFrame = null; return; }
  const tick = now => {
    const ratio = Math.max(0, Math.min(1, (now - startedAt) / duration));
    const eased = 1 - Math.pow(1 - ratio, 3);
    render(start + (initialLoadingPercentTarget - start) * eased);
    if (ratio < 1) initialLoadingPercentFrame = requestAnimationFrame(tick);
    else { render(initialLoadingPercentTarget); initialLoadingPercentFrame = null; }
  };
  initialLoadingPercentFrame = requestAnimationFrame(tick);
}

window.__clareiraSyncInitialCacheProgress = cache => {
  if (loadingScreen.dataset.context !== 'login' || initialSceneRevealed) return;
  const cacheProgress = cache || { completed: 0, total: 0 };
  const filesFraction = initialCacheFraction(cacheProgress);
  const totalFraction = initialLoadWeightsForSession.files * filesFraction
    + initialLoadWeightsForSession.session * Number(sessionCheckCompleted);
  setInitialLoadingPercent(totalFraction * 100);
  const stageState = loadingProgress?.stageSnapshot?.();
  const miniState = { filesFraction, sessionCompleted: sessionCheckCompleted,
    character: stageState?.stages?.character, scene: stageState?.stages?.scene };
  const miniStage = initialLoadingMiniStage(miniState);
  let detail;
  if (miniStage === 'files') detail = String(cacheProgress.completed || 0) + "/" + String(cacheProgress.total || 0) + " arquivos";
  else if (miniStage === 'session') detail = sessionCheckCompleted ? 'Sessão verificada' : 'Verificando sessão';
  else if (stageState?.stages?.[miniStage]) detail = stageState.stages[miniStage].completed + "/" + stageState.stages[miniStage].total + " tarefas";
  else detail = miniStage === 'character' ? 'Preparando personagem' : 'Preparando cena';
  updateLoadingMini(miniStage, calculateInitialMiniProgress(miniState), 'active', 'determinate', detail);
};
window.__clareiraSyncInitialCacheProgress(window.__clareiraInitialCacheProgress);
const sceneRetryKey = 'clareira:scene-load-retries';
let sceneProgressWatchdog = null, sceneProgressRetry = null, lastProgressSignature = null;
function prepareFirstWorldLoading() {
  firstWorldLoadAfterGate = true;
  loadingScreen.dataset.context = 'login';
  loadingScreen.dataset.phase = 'world';
  loadingScreen.dataset.progressMode = 'determinate';
}

function finishInitialMiniProgress(detail = 'Pronto') {
  updateLoadingMini('scene', 100, 'complete', 'determinate', detail);
}
function cancelMiniSceneTransition() {
  const pending = pendingMiniSceneTransition;
  if (!pending) return;
  pendingMiniSceneTransition = null;
  clearTimeout(pending.timer);
  if (pending.frame !== null) cancelAnimationFrame(pending.frame);
  pending.resolve();
}
function updateLoadingMini(stage, percent, state, mode = 'determinate', detail = '') {
  const initialScreen = loadingScreen.dataset.context !== 'world';
  if (!initialScreen || state === 'error') {
    cancelMiniSceneTransition();
    return renderLoadingMini(stage, percent, state, mode, detail);
  }
  const nextScene = stage === 'scene' || stage === 'dimension';
  if (holdingInitialSession && stage !== 'session') return;
  if (pendingMiniSceneTransition && !nextScene) return;
  if (nextScene && (pendingMiniSceneTransition || ['session', 'character'].includes(loadingMiniStep.dataset.stage))) {
    if (!pendingMiniSceneTransition) {
      let resolve;
      const pending = { target: null, timer: null, frame: null, promise: new Promise(done => { resolve = done; }), resolve };
      pendingMiniSceneTransition = pending;
      renderLoadingMini('character', 100, 'complete', 'determinate', 'Pronto');
      pending.timer = setTimeout(() => {
        if (pendingMiniSceneTransition !== pending) return;
        renderLoadingMini('scene', 0, 'active', 'determinate', pending.target.detail);
        pending.frame = requestAnimationFrame(() => {
          pending.frame = requestAnimationFrame(() => {
            if (pendingMiniSceneTransition !== pending) return;
            const target = pending.target;
            pendingMiniSceneTransition = null;
            renderLoadingMini('scene', target.percent, target.state, target.mode, target.detail);
            pending.resolve();
          });
        });
      }, INITIAL_LOADING_COMPLETE_HOLD_MS + (reducedMotion ? 0 : INITIAL_LOADING_MINI_FILL_MS));
    }
    pendingMiniSceneTransition.target = { percent, state, mode, detail };
    return;
  }
  renderLoadingMini(stage, percent, state, mode, detail);
}
function renderLoadingMini(stage, percent, state, mode = 'determinate', detail = '') {
  const initialScreen = loadingScreen.dataset.context !== 'world';
  const step = loadingMiniStep;
  const track = step.querySelector('[role="progressbar"]');
  const requested = Math.max(0, Math.min(100, Number(percent) || 0));
  const visibleStage = stage === 'dimension' ? 'scene' : stage;
  const stageChanged = initialScreen && step.dataset.stage !== visibleStage;
  if (stageChanged) {
    step.dataset.stageReset = 'true';
    requestAnimationFrame(() => {
      if (step.dataset.stage === visibleStage) delete step.dataset.stageReset;
    });
  }
  const prior = initialScreen && step.dataset.stage === visibleStage
    ? Math.max(0, Number.parseFloat(track.style.getPropertyValue('--loading-mini-progress')) || 0)
    : 0;
  // Individual sub-stages may report 100%, but the main bar only reaches 100%
  // when the whole initial load is ready.
  const safeRequested = requested;
  const value = initialScreen ? Math.max(prior, safeRequested) : requested;
  const labels = { files: 'Arquivos', session: 'Sessão', character: 'Personagem', scene: 'Cena' };
  step.dataset.activeStage = visibleStage;
  step.dataset.stage = visibleStage;
  if (initialScreen) loadingScreen.dataset.loadingStage = visibleStage;
  step.querySelector('[data-loading-label]').textContent = labels[visibleStage] || 'Local';
  step.dataset.state = state;
  step.setAttribute('aria-hidden', String(state === 'pending'));
  step.dataset.progressMode = mode;
  track.style.setProperty('--loading-mini-progress', `${value}%`);
  if (initialScreen && mode === 'indeterminate') track.removeAttribute('aria-valuenow');
  else track.setAttribute('aria-valuenow', initialScreen ? value.toFixed(1) : String(Math.round(value)));
  track.setAttribute('aria-valuetext', initialScreen
    ? mode === 'indeterminate' ? (detail || 'Em andamento') : `${value.toFixed(1)}%${detail ? ` · ${detail}` : ''}`
    : detail || `${Math.round(value)}%`);
  const description = step.querySelector('[data-loading-detail]');
  if (description && detail) description.textContent = detail;
  const checkpointStages = ['files', 'session', 'character', 'scene'];
  const checkpointStage = checkpointStages.indexOf(visibleStage);
  document.querySelectorAll('[data-loading-checkpoints] [data-checkpoint]').forEach(checkpoint => {
    const index = checkpointStages.indexOf(checkpoint.dataset.checkpoint);
    const completed = checkpointStage >= 0
      && (index < checkpointStage || (index === checkpointStage && state === 'complete'));
    checkpoint.dataset.state = state === 'error' && index === checkpointStage ? 'error'
      : completed ? 'complete'
        : checkpointStage === index && state === 'active' ? 'active' : 'pending';
  });
}
function clearSceneProgressWatchdog() {
  if (sceneProgressWatchdog) clearTimeout(sceneProgressWatchdog);
  sceneProgressWatchdog = null;
}
function scheduleSceneProgressWatchdog(state, signature) {
  clearSceneProgressWatchdog();
  if (!state?.known || state.finished || loadingScreen.hidden) return;
  sceneProgressWatchdog = setTimeout(() => {
    sceneProgressWatchdog = null;
    if (document.hidden) { scheduleSceneProgressWatchdog(state, signature); return; }
    if (loadingProgress?.snapshot().finished || lastProgressSignature !== signature || loadingScreen.hidden) return;
    const label=state.activeLabel || 'preparando o local';
    showLoadingFailure(`A etapa “${label}” está demorando. Você pode tentar novamente sem sair da sessão.`);
    loadingReload.textContent='Tentar esta etapa novamente';
    loadingReload.onclick=retryCurrentSceneLoading;
  }, 30_000);
}
function retryCurrentSceneLoading() {
  if(!authenticated){void restoreSession();return;}
  loadingReload.hidden=true;
  const self=livePlayers.get(selfId);
  if(!connectionSnapshotReady||!self||socket?.readyState!==WebSocket.OPEN){
    const previous=socket;socket=null;previous?.close(1000,'retry loading');connect();return;
  }
  // Keep the confirmed world and successfully cached assets. Only rerun the
  // preparation that failed; generation guards discard its obsolete callbacks.
  clearSceneProgressWatchdog();
  ++loadingGeneration;sceneReady=false;assetsReady=false;
  lightingRevealStartedAt=null;assetScene=null;avatarAssetVariant=null;
  loadingScreen.dataset.phase='world';
  prepareSceneAssets(self.location,self.appearance,self,worldDimensionId);
}
function currentDimensionLoadingName() {
  return dimensionList.find(dimension => dimension.id === worldDimensionId)?.name
    || contentById('place.clearing').label;
}
function showLoadingFailure(message) {
  const failureReason = /demor|tempo/iu.test(message) ? 'timeout' : /conex|estado do mundo/iu.test(message) ? 'network' : /sess[aã]o/iu.test(message) ? 'session' : 'scene';
  window.__clareiraReportLoadingFailure?.(failureReason, loadingMiniStep?.dataset.stage || 'scene');
  clearSceneProgressWatchdog();
  if(teleportEffects.localTransit){
    teleportEffects.cancelLocal();
    dimensionTravelStarting=false;
    dimensionTravelRequestPending=false;
    pendingDimensionTravelRequestId=null;
  }
  ui.shell.inert=true;
  ui.shell.setAttribute('aria-busy','true');
  if (sceneProgressRetry) clearTimeout(sceneProgressRetry);
  sceneProgressRetry = null;
  roomTransition.cancel();
  loadingScreen.dataset.roomTransition = 'false';
  loadingScreen.hidden = false;
  loadingScreen.dataset.phase = 'error';
  const initialScreen = loadingScreen.dataset.context === 'login';
  loadingScreen.dataset.progressMode = initialScreen ? 'indeterminate' : 'determinate';
  if (initialScreen) {
    loadingProgressBar.removeAttribute('aria-valuenow');
    loadingPercent.hidden = true;
    loadingPercent.setAttribute('aria-hidden', 'true');
  }
  const failingSession = /sess[aã]o/iu.test(message);
  updateLoadingMini(failingSession ? 'session' : 'dimension', 0, 'error', initialScreen ? 'indeterminate' : 'determinate', 'Erro');
  loadingMessage.textContent = message;
  loadingCaption.textContent = message;
  loadingReload.textContent = authenticated ? 'Tentar esta etapa novamente' : 'Tentar recarregar';
  loadingReload.hidden = false;
  loadingReload.onclick = () => {
    if(authenticated){retryCurrentSceneLoading();return;}
    try { sessionStorage.removeItem('clareira:bootstrap-retries'); sessionStorage.removeItem(sceneRetryKey); } catch {}
    location.reload();
  };
}
let assetScene = null;
let avatarAssetVariant = null;
const criticalFonts = new Promise(resolve=>{
  const timeout=setTimeout(resolve,3000);
  Promise.resolve(document.fonts?.ready).catch(()=>undefined).finally(()=>{clearTimeout(timeout);resolve();});
});
// Bounded loading diagnostics also survive a failed connection and upload on
// reconnect. Only counts/flags are retained, never task IDs or account data.
function reportCurrentLoading(){
  if(loadingScreen.hidden||document.hidden)return;
  const tasks=loadingProgress?.pendingTasks?.()||[];
  const count=prefix=>tasks.filter(task=>task.id.startsWith(prefix)).length;
  const details={
    stage:['files','session','character','scene'].indexOf(loadingMiniStep.dataset.stage)+1,
    percent:Number.parseFloat(loadingProgressBar.getAttribute('aria-valuenow'))||0,
    authenticated,snapshotReady,assetsReady,predictionReady,sceneReady,
    pendingAssets:count('asset:'),pendingAvatar:count('avatar:'),pendingTerrain:count('terrain:')+count('world:'),
    pendingThemes:count('dimension-theme:'),pendingLights:lightmapStats().pending,
    receivedMessages:loadingReceivedMessages,receivedStates:loadingReceivedStates,welcomeReceived:loadingWelcomeReceived,
    processingPhase:loadingProcessingPhase,lastMessageAgeMs:Math.max(0,performance.now()-loadingLastMessageAt),
  };
  movementDiagnostics.record('loading-wait',details,{persist:true});
  // A stale, unacknowledged report must not hide the current loading state.
  // Send one bounded fresh event, independently of that report's retry ID.
  if(socket?.readyState===WebSocket.OPEN)send({type:'clientDiagnostics',version:1,reportId:crypto.randomUUID(),
    events:[{kind:'loading-wait',at:Math.round(performance.now()),...details}]});
}
setInterval(reportCurrentLoading,10_000);
function advanceLoadingProgress(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}
function initialCacheFraction(cache = window.__clareiraInitialCacheProgress) {
  if (!cache) return 0;
  if (cache.fraction !== null && cache.fraction !== undefined) {
    const reportedFraction = Number(cache.fraction);
    if (Number.isFinite(reportedFraction)) return Math.max(0, Math.min(1, reportedFraction));
  }
  const total = Number(cache.total), completed = Number(cache.completed);
  if (Number.isSafeInteger(total) && total > 0 && Number.isSafeInteger(completed)) {
    return Math.max(0, Math.min(1, completed / total));
  }
  return cache.complete === true || cache.phase === 'complete' ? 1 : 0;
}
function updateLoadingProgress(state) {
  if (loadingScreen.dataset.phase === 'complete' && !loadingScreen.hidden) return;
  const initialScreen = loadingScreen.dataset.context === 'login';
  teleportEffects.updateLocalProgress(state?.known ? state.percent : 0);
  if (!state?.known) {
    const phase = authenticated ? 'world' : 'session';
    loadingScreen.dataset.phase = phase;
    if (initialScreen) {
      const cache = window.__clareiraInitialCacheProgress;
      const filesFraction = initialCacheFraction(cache);
      const overallFraction = initialLoadWeightsForSession.files * filesFraction
        + initialLoadWeightsForSession.session * Number(sessionCheckCompleted);
      const miniPercent = calculateInitialMiniProgress({ filesFraction, sessionCompleted: sessionCheckCompleted });
      const miniStage = initialLoadingMiniStage({ filesFraction, sessionCompleted: sessionCheckCompleted });
      const miniDetail = miniStage === 'files' ? 'Conferindo arquivos'
        : miniStage === 'session' ? 'Verificando sessão' : 'Aguardando o personagem';
      updateLoadingMini(miniStage, miniPercent, 'active', 'determinate', miniDetail);
      loadingScreen.dataset.progressMode = 'determinate';
      setInitialLoadingPercent(overallFraction * 100);
      loadingProgressBar.setAttribute('aria-valuetext', 'Progresso total do carregamento inicial');
    } else {
      loadingScreen.dataset.progressMode = 'indeterminate';
      loadingProgressBar.removeAttribute('aria-valuenow');
      loadingProgressBar.setAttribute('aria-valuetext', phase === 'session'
        ? 'Aguardando conexão da sessão' : 'Aguardando o estado do mundo');
      loadingProgressBar.style.removeProperty('--loading-progress');
      loadingPercent.hidden = true;
      loadingPercent.setAttribute('aria-hidden', 'true');
      loadingMiniStep.dataset.state = 'pending';
      loadingMiniStep.dataset.progressMode = 'indeterminate';
      loadingMiniStep.setAttribute('aria-hidden', 'true');
    }
    loadingCaption.textContent = initialScreen ? loadingMessage.textContent : (phase === 'session' ? 'Conferindo sua sessão' : 'Preparando o mundo');
    return;
  }
  const stage = initialScreen ? loadingProgress?.stageSnapshot?.() : null;
  if (initialScreen && stage?.stages) {
    for (const name of ['character', 'scene']) {
      const group = stage.stages[name];
      if (group?.total && group.completed >= group.total) finishInitialLoadStage(name);
    }
  }
  const cacheForMini = initialScreen ? window.__clareiraInitialCacheProgress : null;
  const filesFraction = initialCacheFraction(cacheForMini);
  const initialMiniState = {
    filesFraction,
    sessionCompleted: sessionCheckCompleted,
    character: stage?.stages?.character,
    scene: stage?.stages?.scene,
  };
  const miniStage = initialScreen ? initialLoadingMiniStage(initialMiniState) : 'dimension';
  const cacheMiniCompleted = Number(cacheForMini?.completed) || 0;
  const cacheMiniTotal = Number(cacheForMini?.total) || 0;
  const miniPercent = initialScreen
    ? calculateInitialMiniProgress(initialMiniState)
    : stage?.total ? stage.completed / stage.total * 100 : state.percent;
  const miniDetail = initialScreen
    ? miniStage === 'files' ? `${cacheMiniCompleted}/${cacheMiniTotal} arquivos`
      : miniStage === 'session' ? (sessionCheckCompleted ? 'Sessão verificada' : 'Verificando sessão')
        : stage?.stages?.[miniStage]
          ? `${stage.stages[miniStage].completed}/${stage.stages[miniStage].total} tarefas`
          : miniStage === 'character' ? 'Preparando personagem' : 'Preparando cena'
    : (state.activeLabel || (state.finished ? 'Pronto' : 'Preparando'));
  const cacheFinished = window.__clareiraInitialCacheProgress;
  const initialLoadReady = initialScreen && state.finished && sessionCheckCompleted
    && Number.isSafeInteger(cacheFinished?.total) && Number.isSafeInteger(cacheFinished?.completed)
    && cacheFinished.completed === cacheFinished.total && cacheFinished.complete === true;
  if (initialLoadReady) finishInitialMiniProgress();
  updateLoadingMini(initialScreen ? miniStage : 'dimension', initialScreen ? miniPercent
    : (stage?.total ? stage.completed / stage.total * 100 : state.percent),
    state.finished ? 'complete' : 'active', 'determinate', miniDetail);
  let percent;
  if (initialScreen) {
    const cache = window.__clareiraInitialCacheProgress;
    const cacheTotal = Number(cache?.total);
    const cacheCompleted = Number(cache?.completed);
    if (!Number.isSafeInteger(cacheTotal) || cacheTotal < 0 || !Number.isSafeInteger(cacheCompleted)
        || cacheCompleted < 0 || cacheCompleted > cacheTotal) {
      loadingScreen.dataset.progressMode = 'determinate';
      setInitialLoadingPercent(initialLoadingPercentTarget);
      loadingCaption.textContent = loadingMessage.textContent;
      return;
    }
    const fraction = name => {
      if (name === 'files') return initialCacheFraction(cache);
      if (name === 'session') return Number(sessionCheckCompleted);
      const group = stage?.stages?.[name];
      if (group?.total) return group.completed / group.total;
      return name === 'scene' && state.total ? state.completed / state.total : 0;
    };
    const weightedFraction = Object.entries(initialLoadWeightsForSession)
      .reduce((sum, [name, weight]) => sum + weight * fraction(name), 0);
    percent = advanceLoadingProgress(weightedFraction * 100);
    if (state.finished) saveInitialLoadTiming();
  } else {
    percent = advanceLoadingProgress(70 + state.percent * 0.30);
  }
  const percentLabel = initialScreen ? `${percent.toFixed(1).replace('.', ',')}%` : `${Math.round(percent)}%`;
  const signature = `${state.completed}/${state.total}:${state.percent}:${state.activeLabel || ''}`;
  if (signature !== lastProgressSignature) {
    if (sceneProgressRetry) {
      clearTimeout(sceneProgressRetry);
      sceneProgressRetry = null;
      try { sessionStorage.removeItem(sceneRetryKey); } catch {}
    }
    loadingScreen.dataset.phase = 'world';
    lastProgressSignature = signature;
    scheduleSceneProgressWatchdog(state, signature);
  }
  loadingScreen.dataset.phase = 'world';
  loadingScreen.dataset.progressMode = 'determinate';
  if (initialScreen) {
    setInitialLoadingPercent(percent);
    loadingProgressBar.setAttribute('aria-valuetext', percentLabel + ' · Total ponderado por etapas concluídas');
  } else {
    loadingProgressBar.setAttribute('aria-valuenow', String(percent));
    loadingProgressBar.setAttribute('aria-valuetext', percentLabel + ' · ' + state.completed + ' de ' + state.total + ' etapas do mundo');
    loadingProgressBar.style.setProperty('--loading-progress', percent + '%');
    loadingPercent.textContent = percentLabel;
    loadingPercent.hidden = false;
    loadingPercent.setAttribute('aria-hidden', 'false');
  }
  if (state.activeLabel) loadingCaption.textContent = initialScreen ? loadingMessage.textContent : state.activeLabel;
}
function setHudText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}
function updateLoadingDesign(context = firstWorldLoadAfterGate ? 'login'
  : initialSceneRevealed && authenticated ? 'world' : 'login') {
  if (loadingScreen.dataset.context === 'login' && loadingScreen.dataset.phase === 'complete'
      && !loadingScreen.hidden && !firstWorldLoadAfterGate) return;
  if (context === 'world' && sceneReady && loadingScreen.hidden) return;
  loadingScreen.dataset.context = context;
  loadingScreen.dataset.phase = authenticated ? 'world' : 'session';
  if (context === 'world') {
    delete loadingScreen.dataset.loadingStage;
    loadingMessage.textContent = currentDimensionLoadingName();
    updateLoadingMini('dimension', 0, 'active', 'indeterminate', 'Preparando');
  } else if (!loadingProgress && !sessionCheckCompleted) {
    updateLoadingMini('session', 0, 'active', 'indeterminate', 'Verificando');
  }
  loadingCaption.textContent = context === 'login' ? loadingMessage.textContent : 'Preparando o próximo local';
  if (loadingProgress) updateLoadingProgress(loadingProgress.snapshot());
}
function beginSceneLoading(text, { fade = false, genericTitle = false, showOverlay = true, statusMessage = null } = {}) {
  const useRoomFade=fade;
  if(useRoomFade)roomTransition.start();else roomTransition.cancel();
  clearTimeout(pendingRoomTravelTimer);pendingRoomTravelRequestId=null;
  loadingScreen.dataset.roomTransition=String(useRoomFade);
  clearSceneProgressWatchdog();
  if (sceneProgressRetry) clearTimeout(sceneProgressRetry);
  sceneProgressRetry = null;
  lastProgressSignature = null;
  ++loadingGeneration; sceneReady = false; snapshotReady = false;
  lightingRevealStartedAt=null;
  assetScene = null; avatarAssetVariant = null; assetsReady = false;
  loadingProgress = null;
  clearMovement(); sceneReadiness.reset();
  const transitOwnsLoading=teleportEffects.localTransit;
  loadingScreen.hidden = !showOverlay||transitOwnsLoading;
  document.documentElement.classList.remove('cache-verifying');
  window.__clareiraLoadingPhrase?.(); updateLoadingDesign();
  updateLoadingProgress(null);
  if (statusMessage) loadingMessage.textContent = statusMessage;
  ui.shell.inert = true; ui.shell.setAttribute('aria-busy','true');
}
let campfireFlameImage = null;
let campfireAuraImage = null;
let campfireSkyRaysImage = null;
let campfireHearthBaseImage = null;
let campfireHearthFlamesImage = null;
let arrivalThunderData = null,arrivalThunderPending=false,arrivalThunderPlayed=false,arrivalCinematicDimension='',arrivalCinematicStartedAt=0,arrivalCinematicElapsedMs=0,arrivalCinematicLastFrameAt=0;
let arrivalChargePlayed=false;
const contentAssets = createAssetLoader({load: async (asset,{signal}) => {
  if(asset.type==='audio'){const response=await fetch(new URL(asset.url,import.meta.url),{signal});if(!response.ok)throw new Error('Áudio indisponível');const data=await response.arrayBuffer();if(asset.id==='audio.arrival-thunder'){
    arrivalThunderData=data;
    if(audioContext&&ambience&&!ambience.arrivalThunderBuffer){
      void audioContext.decodeAudioData(data.slice(0)).then(buffer=>{
        ambience.arrivalThunderBuffer=buffer;if(arrivalThunderPending)playArrivalThunder();
      }).catch(error=>console.warn('Não foi possível preparar o estrondo do Breu.',error));
    }
  }return data;}
  const image = new Image();
  image.src = new URL(asset.url, import.meta.url).href;
  const abort=()=>{image.src='';};
  signal.addEventListener('abort',abort,{once:true});
  try { await image.decode();signal.throwIfAborted(); }
  finally { signal.removeEventListener('abort',abort); }
  if (asset.id === 'image.campfire-flame') campfireFlameImage = image;
  if (asset.id === 'image.campfire-hearth-base') campfireHearthBaseImage = image;
  if (asset.id === 'image.campfire-hearth-flames') campfireHearthFlamesImage = image;
  if (asset.id === 'image.campfire-aura') campfireAuraImage = image;
  if (asset.id === 'image.campfire-sky-rays') campfireSkyRaysImage = image;
  if (asset.id === 'image.room-furniture') setRoomFixtureAtlas(image);
  if (asset.id === 'image.medieval-furniture-3d') setMedievalFurnitureAtlas(image);
  if (asset.id === 'image.building-material-uv') { setBuildingMaterialAtlas(image); geometryCache.clear(); }
  if (asset.id === 'image.building-cottage-day') { setCottageExteriorSprites({day:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-cottage-night') { setCottageExteriorSprites({night:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-cottage-canopy') { setCottageExteriorSprites({canopy:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-cottage-post-left') { setCottageExteriorSprites({postLeft:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-cottage-post-right') { setCottageExteriorSprites({postRight:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-fern-day') { setFernExteriorSprites({day:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-fern-night') { setFernExteriorSprites({night:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-fern-canopy') { setFernExteriorSprites({canopy:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-fern-post-left') { setFernExteriorSprites({postLeft:image}); geometryCache.clear(); }
  if (asset.id === 'image.building-fern-post-right') { setFernExteriorSprites({postRight:image}); geometryCache.clear(); }
  return image;
}});
function revealLoginScreen() {
  if (authenticated) return;
  if (loadingScreen.hidden) {
    hideSceneLoading({ worldReady: false });
    animateEntryScreen();
    return;
  }
  loginGateWasRevealed = true;
  const cache = window.__clareiraInitialCacheProgress;
  const filesFraction = initialCacheFraction(cache);
  const gatePercent = advanceLoadingProgress((
    initialLoadWeightsForSession.files * filesFraction
    + initialLoadWeightsForSession.session * Number(sessionCheckCompleted)
  ) * 100);
  loadingScreen.dataset.phase = 'session';
  loadingScreen.dataset.progressMode = 'determinate';
  setInitialLoadingPercent(gatePercent);
  loadingProgressBar.setAttribute('aria-valuetext', gatePercent.toFixed(1) + '% · Arquivos e sessão prontos');
  loadingCaption.textContent = loadingMessage.textContent;
  return new Promise(resolve => requestAnimationFrame(() => {
    hideSceneLoading({ worldReady: false }); animateEntryScreen(); resolve();
  }));
}

function markInitialLoadingComplete() {
  if ((initialSceneRevealed && !firstWorldLoadAfterGate) || loadingScreen.dataset.context !== 'login') return false;
  loadingScreen.dataset.phase = 'complete';
  loadingScreen.dataset.progressMode = 'determinate';
  loadingScreen.dataset.progressFloor = '100';
  setInitialLoadingPercent(100, true);
  loadingProgressBar.setAttribute('aria-valuenow', '100');
  loadingProgressBar.setAttribute('aria-valuetext', '100% · Clareira pronta');
  loadingProgressBar.style.setProperty('--loading-progress', '100%');
  loadingPercent.textContent = '100%';
  loadingPercent.hidden = false;
  loadingPercent.setAttribute('aria-hidden', 'false');
  finishInitialMiniProgress('Pronto');
  firstWorldSceneLoaded = true;
  firstWorldLoadAfterGate = false;
  initialSceneRevealed = true;
  return true;
}
function hideSceneLoading({ worldReady = true } = {}) {
  clearSceneProgressWatchdog();
  document.documentElement.classList.remove('cache-verifying');
  if (worldReady) {
    markInitialLoadingComplete();
    initialSceneRevealed = true;
  }
  loadingScreen.hidden = true;
  ui.shell.inert = false; ui.shell.removeAttribute('aria-busy');
}
let lightingRevealScheduled=false, lightingRevealStartedAt=null;
function revealLoadedScene() {
  if (!authenticated || !snapshotReady || !assetsReady || !predictionReady || sceneReady) return;
  gameDay = getGameDayState(gameDayTimestampMs(), { theme: dimensionTheme, dimensionId: worldDimensionId });
  resizeCanvas();
  const lightingReady=paintSceneLightmaps(null,0);
  if(lightingRevealStartedAt===null)lightingRevealStartedAt=performance.now();
  // Accurate light/shadow maps improve progressively. They cannot hold the
  // authoritative scene hostage when visible sources exceed the cache budget.
  if(!lightingReady&&performance.now()-lightingRevealStartedAt<1500){
    if(!lightingRevealScheduled){
      lightingRevealScheduled=true;
      const generation=loadingGeneration;
      requestAnimationFrame(()=>{
        lightingRevealScheduled=false;
        if(generation!==loadingGeneration)return;
        processLightmapQueue(5,2048);
        revealLoadedScene();
      });
    }
    return;
  }
  sceneReady = true; updateLoadingDesign();
  void teleportEffects.prepare().then(ready=>{teleportEffectReady=ready;updateDimensionTravel(dimensionList,worldDimensionId);if(arrivalTravelPending)requestArrivalTravel();});
  lastFrame = 0; accumulator = 0; lastCameraFrame = 0;
  resizeCanvas(); draw(1);
  const generation = loadingGeneration;
  requestAnimationFrame(function revealReadyFrame() {
    if (!sceneReady || generation !== loadingGeneration) return;
    if(!draw(1)){requestAnimationFrame(revealReadyFrame);return;}
    loadingProgress?.complete('first-frame');
    const finish=()=>{
      if(!sceneReady||generation!==loadingGeneration)return;
      const initialCompletion=markInitialLoadingComplete();
      const reveal=()=>{
        if(!sceneReady||generation!==loadingGeneration)return;
        const enteringArrival = initialCompletion && worldLocation === 'clearing' && worldDimensionId.startsWith('arrival-');
        if (enteringArrival && arrivalWordmark) {
          const source = document.querySelector('.loading-layout .loading-wordmark');
          const rect = source?.getBoundingClientRect();
          if (rect && rect.width > 0) {
            Object.assign(arrivalWordmark.style, { position: 'fixed', left: `${rect.left / innerWidth * 100}vw`,
              top: `${rect.top / innerHeight * 100}vh`, width: `${rect.width / innerWidth * 100}vw`, transform: 'none' });
          }
          arrivalSkyBrand.style.opacity = '1';
          arrivalSkyBrand.hidden = false;
        }
        if(initialCompletion&&!reducedMotion&&!enteringArrival){
          ui.shell.classList.add('initial-world-entering');
          setTimeout(()=>ui.shell.classList.remove('initial-world-entering'),1050);
        }
        hideSceneLoading();
        // Paint the first sky frame before the browser can expose the world.
        if (enteringArrival) draw(1);
        // Give the first active seconds to movement and rendering. Optional
        // dimension/emote assets can warm after the player has entered play.
        setTimeout(scheduleDimensionVisualWarmup, 15_000);
        setTimeout(scheduleAvatarAnimationWarmup, 15_000);
        if(dimensionArrivalStartedAt){performanceTelemetry.observeDimensionArrival(performance.now()-dimensionArrivalStartedAt);dimensionArrivalStartedAt=0;}
        const transitId=teleportEffects.finishLocalScene(worldDimensionId);
        if(transitId)send({type:'dimensionTransitReady',transitId});
        canvas.focus({preventScroll:true});
        ui.connection.textContent='Você chegou';
      };
      // Keep both progress bars visibly complete before revealing the world.
      if(initialCompletion){
        const settling = pendingMiniSceneTransition?.promise || Promise.resolve();
        void settling.then(()=>setTimeout(reveal,INITIAL_LOADING_COMPLETE_HOLD_MS+INITIAL_LOADING_MINI_FILL_MS));
      } else reveal();
    };
    if(roomTransition.active)void roomTransition.reveal().then(finish);else finish();
  });
}
function clearingWorldChunkCoordinates(bounds) {
  const minX=Math.max(0,Math.floor(bounds.left/WORLD_CHUNK_SIZE));
  const maxX=Math.min(Math.ceil(WORLD_SIZE/WORLD_CHUNK_SIZE)-1,Math.floor(bounds.right/WORLD_CHUNK_SIZE));
  const minY=Math.max(0,Math.floor(bounds.top/WORLD_CHUNK_SIZE));
  const maxY=Math.min(Math.ceil(WORLD_SIZE/WORLD_CHUNK_SIZE)-1,Math.floor(bounds.bottom/WORLD_CHUNK_SIZE));
  const chunks=[];
  for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++)chunks.push({cx,cy});
  return chunks;
}
const warmedWorldChunks=new Map(),pendingWorldChunks=new Set(),worldWarmQueue=[];
let worldWarmPumpScheduled=false,worldWarmDefinition=null,worldWarmDefinitionKey='',lastWorldWarmCell='';
let worldWarmLast={chunk:null,outsideView:false,completedAt:0};
function worldWarmKeyFor(definition,cx,cy) {
  if(worldWarmDefinition!==definition){
    worldWarmDefinition=definition;
    worldWarmDefinitionKey=worldGeometryCacheKey(definition);
    lastWorldWarmCell='';
  }
  return worldWarmDefinitionKey+':'+cx+','+cy;
}
function queueWorldChunkWarmupAhead(targetCamera,vx,vy) {
  if(worldLocation!=='clearing'||!Number.isFinite(targetCamera?.x)||!Number.isFinite(targetCamera?.y))return;
  const definition=getWorldDefinition(),cellX=Math.floor(targetCamera.x/4),cellY=Math.floor(targetCamera.y/4);
  const cellKey=worldWarmKeyFor(definition,cellX,cellY);
  if(cellKey===lastWorldWarmCell)return;
  lastWorldWarmCell=cellKey;
  const current=new Set(clearingWorldChunkCoordinates(getCameraVisibleWorldBounds(camera)).map(({cx,cy})=>cx+','+cy));
  const future=clearingWorldChunkCoordinates(getCameraVisibleWorldBounds(targetCamera))
    .filter(({cx,cy})=>!current.has(cx+','+cy))
    .sort((a,b)=>(((b.cx+.5)*WORLD_CHUNK_SIZE-targetCamera.x)*(vx||0)+((b.cy+.5)*WORLD_CHUNK_SIZE-targetCamera.y)*(vy||0))
      -(((a.cx+.5)*WORLD_CHUNK_SIZE-targetCamera.x)*(vx||0)+((a.cy+.5)*WORLD_CHUNK_SIZE-targetCamera.y)*(vy||0)));
  for(const {cx,cy} of future){
    if(worldWarmQueue.length>=8)break;
    const key=worldWarmKeyFor(definition,cx,cy);
    if(warmedWorldChunks.has(key)||pendingWorldChunks.has(key))continue;
    worldWarmQueue.push({key,cx,cy,definition,dimensionId:worldDimensionId});
    pendingWorldChunks.add(key);
  }
  pumpWorldChunkWarmup();
}
function pumpWorldChunkWarmup() {
  if(worldWarmPumpScheduled||!worldWarmQueue.length)return;
  worldWarmPumpScheduled=true;
  scheduleIdlePreparation(()=>{
    worldWarmPumpScheduled=false;
    const job=worldWarmQueue.shift();
    if(job){
      pendingWorldChunks.delete(job.key);
      if(sceneReady&&worldLocation==='clearing'&&worldDimensionId===job.dimensionId
          &&getWorldDefinition()===job.definition&&worldWarmKeyFor(job.definition,job.cx,job.cy)===job.key){
        const currentChunks=new Set(clearingWorldChunkCoordinates(getCameraVisibleWorldBounds(camera)).map(({cx,cy})=>cx+','+cy));
        const area={left:job.cx*WORLD_CHUNK_SIZE,right:Math.min(WORLD_SIZE,(job.cx+1)*WORLD_CHUNK_SIZE),
          top:job.cy*WORLD_CHUNK_SIZE,bottom:Math.min(WORLD_SIZE,(job.cy+1)*WORLD_CHUNK_SIZE)};
        const trees=getSolidTreesInBounds(area);
        getResourcesInBounds(area);getFallenTreesInBounds(area);getRocksInBounds(area);
        sceneArt.foliageInBounds(area,trees);
        warmedWorldChunks.delete(job.key);warmedWorldChunks.set(job.key,true);
        worldWarmLast={chunk:{cx:job.cx,cy:job.cy},outsideView:!currentChunks.has(job.cx+','+job.cy),completedAt:performance.now()};
        while(warmedWorldChunks.size>64)warmedWorldChunks.delete(warmedWorldChunks.keys().next().value);
      }
    }
    pumpWorldChunkWarmup();
  });
}
async function preloadClearingWorld(bounds, isCurrentLoad, onChunkReady) {
  for(const {cx,cy} of clearingWorldChunkCoordinates(bounds)){
    if(!isCurrentLoad())return false;
    const area={left:cx*WORLD_CHUNK_SIZE,right:Math.min(WORLD_SIZE,(cx+1)*WORLD_CHUNK_SIZE),
      top:cy*WORLD_CHUNK_SIZE,bottom:Math.min(WORLD_SIZE,(cy+1)*WORLD_CHUNK_SIZE)};
    const trees=getSolidTreesInBounds(area);
    getResourcesInBounds(area);
    getFallenTreesInBounds(area);
    getRocksInBounds(area);
    sceneArt.foliageInBounds(area,trees);
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(!isCurrentLoad())return false;
    onChunkReady?.({cx,cy});
  }
  return true;
}
// Game modules are loaded before execution; await critical font readiness as well.
function prepareSceneAssets(scene, appearance, position=localPosition, dimensionId=worldDimensionId,
  {deferOutdoorWarmup=false,transitWarmup=false}={}) {
  activeAvatarAppearance = appearance;
  const definition=getWorldDefinition();
  const sceneKey = scene === 'clearing'
    ? `${scene}:${dimensionId}:${dimensionTheme}:${worldGeometryCacheKey(definition)}`
    : scene;
  const avatarVariant=getAvatarSpriteVariant(appearance);
  const villageAvatarWarmups=scene==='clearing'&&dimensionId==='surface'
    ?[...new Map(villageNpcDayRoster().map(npc=>[
      getAvatarSpriteVariant(npc.appearance),npc.appearance,
    ])).entries()].filter(([variant])=>variant!==avatarVariant)
    :[];
  const sceneChanged=assetScene!==sceneKey;
  const avatarChanged=avatarAssetVariant!==avatarVariant;
  if(!sceneChanged&&!avatarChanged)return;
  assetScene = sceneKey; avatarAssetVariant=avatarVariant; assetsReady = false;
  const generation = loadingGeneration;
  const isCurrentLoad=()=>generation===loadingGeneration&&assetScene===sceneKey&&avatarAssetVariant===avatarVariant;
  const warmClearing = sceneChanged && scene === 'clearing';
  if(warmClearing)camera={x:position.x,y:position.y};
  const targetCamera={x:position.x,y:position.y};
  const visibleBounds=warmClearing?getCameraVisibleWorldBounds(targetCamera):null;
  const worldChunks=warmClearing?clearingWorldChunkCoordinates(visibleBounds):[];
  const terrainChunks=warmClearing?terrainChunksWithMovementMargin(targetCamera,visibleBounds):[];
  const visibleTerrain=warmClearing?visibleTerrainChunks(targetCamera,visibleBounds):[];
  const visibleTerrainKeys=new Set(visibleTerrain.map(({cx,cy})=>`${cx}:${cy}`));
  const lookaheadTerrain=terrainChunks.filter(({cx,cy})=>!visibleTerrainKeys.has(`${cx}:${cy}`));
  const deferWorldWarmup=warmClearing&&deferOutdoorWarmup;
  const initialWarmup=!initialSceneRevealed&&loadingScreen.dataset.context==='login';
  const assetSceneNames=[...new Set([...assetScenesFor(scene,dimensionId),...(initialWarmup?['room','teleport']:[])])];
  const sceneAssets=assetSceneNames.map(assetSceneName=>({
    name:assetSceneName,assets:contentAssets.assetsForScene(assetSceneName),
  }));
  const dimensionThemes=initialWarmup?[...new Set([dimensionTheme,...DIMENSION_THEMES.map(theme=>theme.id),...dimensionList.map(dimension=>dimension.theme)])]:[];
  const tasks=[
    {id:'snapshot',label:'Recebendo seu personagem',stage:'scene',complete:snapshotReady},
    {id:'prediction',label:'Sincronizando sua chegada',stage:'scene',complete:predictionReady},
    {id:'avatar:idle',label:'Preparando o personagem',stage:'character'},
    {id:'avatar:sprites',label:'Preparando as animações',stage:'character'},
    ...villageAvatarWarmups.map(([variant])=>({
      id:`village-avatar:${variant}`,label:'Preparando os personagens do bosque',stage:'character',
    })),
    {id:'fonts',label:'Preparando os textos',stage:'scene'},
    ...sceneAssets.flatMap(group=>group.assets.map(asset=>({
      id:`asset:${asset.scene}:${asset.id}`,label:'Carregando os recursos do local',stage:'scene',
    }))),
    ...dimensionThemes.map(theme=>({id:`dimension-theme:${theme}`,label:`Preparando a dimensão ${theme}`,stage:'scene'})),
    ...(initialWarmup?[{id:'teleport-effect-ready',label:'Preparando o efeito de teleporte',stage:'scene'},
      {id:'clock-sync',label:'Sincronizando com o servidor',stage:'scene'}]:[]),
    ...(warmClearing&&!initialWarmup?[{id:'shared-art',label:'Preparando a arte do bosque',stage:'scene'}]:[]),
    ...worldChunks.map(({cx,cy})=>({id:`world:${cx},${cy}`,label:'Organizando os elementos do bosque',stage:'scene'})),
    ...visibleTerrain.map(({cx,cy})=>({id:`terrain:${cx},${cy}`,label:'Preparando o terreno visível',stage:'scene'})),
    {id:'first-frame',label:'Abrindo o local',stage:'scene'},
  ];
  if (!initialSceneRevealed && loadingScreen.dataset.context === 'login') {
    startInitialLoadStage('character');
    startInitialLoadStage('scene');
  }
  const progress=createLoadingProgress(tasks,updateLoadingProgress);
  loadingProgress=progress;
  updateLoadingDesign();
  updateLoadingProgress(progress.snapshot());

  const loadAttempt=async attempt=>{
    const warmScene=()=>warmClearing?Promise.resolve().then(async()=>{
      if(!isCurrentLoad())return false;
      const grassAsset=contentAssets.assetsForScene('clearing').find(asset=>asset.id==='image.grass-surface');
      const soilAsset=contentAssets.assetsForScene('clearing').find(asset=>asset.id==='image.soil-texture');
      const fadeAsset=contentAssets.assetsForScene('clearing').find(asset=>asset.id==='image.soil-fade');
      if(!grassAsset||!soilAsset||!fadeAsset)throw new Error('Os atlas de superfície e transição do bosque não estão catalogados.');
      const [grassImage,soilImage,fadeImage]=await contentAssets.loadScene('clearing',[grassAsset,soilAsset,fadeAsset]);
      sceneArt.setGrassSurfaceAtlas(grassImage);
      sceneArt.setSoilMaterialAtlases(soilImage,fadeImage);
      if(!initialWarmup){await sceneArt.preloadSharedAssets();progress.complete('shared-art');}
      sceneArt.prioritizeTerrainChunks(visibleTerrainChunks(targetCamera,visibleBounds),terrainChunks);
      const terrain=sceneArt.preloadTerrainChunks(visibleTerrain,
        ({cx,cy})=>{if(isCurrentLoad())progress.complete('terrain:'+cx+','+cy)});
      const visibleWorld=preloadClearingWorld(visibleBounds,isCurrentLoad,
        ({cx,cy})=>{if(isCurrentLoad())progress.complete('world:'+cx+','+cy)});
      return Promise.all([visibleWorld,terrain]).then(result=>{
        if(isCurrentLoad()&&lookaheadTerrain.length)scheduleIdlePreparation(()=>{
          if(isCurrentLoad())sceneArt.requestTerrainChunks(lookaheadTerrain);
        });
        return result;
      });
    }):Promise.resolve();
    // Dimension arrivals hide the world behind the travel overlay, so the visible terrain
    // and objects can be awaited there at no visible cost; the cap keeps a slow device from hanging.
    let transitWorldWarm=null;
    if(deferWorldWarmup){
      const warmWhenSafe=()=>{
        if(!isCurrentLoad())return;
        if(teleportEffects.active){setTimeout(()=>scheduleIdlePreparation(warmWhenSafe),250);return;}
        void warmScene().catch(error=>console.warn('Falha ao aquecer o destino em segundo plano.',error));
      };
      if(transitWarmup){
        const capped=new Promise(resolve=>setTimeout(()=>resolve(null),8000));
        transitWorldWarm=Promise.race([warmScene(),capped]);
      }else scheduleIdlePreparation(warmWhenSafe);
    }
    const sceneAssetLoads=sceneAssets.map(group=>contentAssets.loadScene(group.name,undefined,{
      onProgress:({asset,loaded,fallback})=>{
        if(isCurrentLoad()&&(loaded||fallback))progress.complete(`asset:${asset.scene}:${asset.id}`);
      },
    }));
    // Start decoding the transition animation at the same time as scene and
    // avatar assets; the loader cache shares these requests with sceneAssetLoads.
    const teleportPreparation=teleportEffects.prepare().then(ready=>{
      if(isCurrentLoad()){
        teleportEffectReady=ready;
        updateDimensionTravel(dimensionList,worldDimensionId);
      }
      if(isCurrentLoad()&&initialWarmup&&ready)progress.complete('teleport-effect-ready');
      return ready;
    }).catch(error=>{
      console.warn('O efeito de viagem continua carregando em segundo plano.',error);
      return false;
    });
    const avatarIdle=preloadAvatarIdle(appearance).then(()=>{if(isCurrentLoad())progress.complete('avatar:idle')}).catch(error=>{
      if(['outfit.commoner','outfit.white-base'].includes(appearance.outfitId))throw error;
      console.warn('Falha ao preparar o personagem; usando a arte disponível.',error);
      if(isCurrentLoad())progress.complete('avatar:idle');
    });
    const avatarAssets=preloadAvatarSprites(appearance).then(()=>{if(isCurrentLoad())progress.complete('avatar:sprites')});
    // Emote/action frames are optional: decode them during the first load without blocking entry.
    if(initialWarmup&&!reducedMotion){
      const animationVariant=getAvatarSpriteVariant(appearance);
      if(!warmedAvatarAnimationVariants.has(animationVariant)&&!queuedAvatarAnimationVariants.has(animationVariant)){
        queuedAvatarAnimationVariants.add(animationVariant);
        void avatarAssets.then(()=>preloadAvatarAnimationActions(appearance)).then(()=>warmedAvatarAnimationVariants.add(animationVariant))
          .catch(()=>{}).finally(()=>queuedAvatarAnimationVariants.delete(animationVariant));
      }
    }
    const villageAvatarAssets=Promise.all(villageAvatarWarmups.map(([variant,npcAppearance])=>
      preloadAvatarIdle(npcAppearance).then(()=>{
        if(isCurrentLoad())progress.complete(`village-avatar:${variant}`);
      })));
    const fonts=criticalFonts.then(()=>{if(isCurrentLoad())progress.complete('fonts')});
    const dimensionThemeWarmups=dimensionThemes.map(theme=>Promise.resolve().then(async()=>{
      if(!warmedDimensionThemes.has(theme)){
        await sceneArt.preloadSharedAssets(theme);
        warmedDimensionThemes.add(theme);
      }
      if(isCurrentLoad())progress.complete(`dimension-theme:${theme}`);
    }));
    try{
      // The first tutorial/world reveal waits for every dimension theme,
      // furniture atlas, and teleport frame. Later transitions only wait for
      // their destination's critical assets and visible area.
      const initialTeleportReady=initialWarmup?teleportPreparation.then(ready=>{
        if(!ready)throw new Error('Os recursos do teleporte não ficaram prontos.');
      }):Promise.resolve();
      // Travel timing depends on the server clock; wait for it, but never block entry for long.
      const initialClockSync=initialWarmup?new Promise(resolve=>{
        const started=performance.now();
        const poll=()=>{
          if(serverClockOffsetMs!==null||!isCurrentLoad()||performance.now()-started>10_000){
            if(isCurrentLoad())progress.complete('clock-sync');
            resolve();
          }else setTimeout(poll,100);
        };
        poll();
      }):Promise.resolve();
      await Promise.all([avatarIdle,avatarAssets,villageAvatarAssets,fonts,initialTeleportReady,initialClockSync,...dimensionThemeWarmups,
        ...(deferWorldWarmup?(transitWorldWarm?[transitWorldWarm]:[]):[warmScene()]),...sceneAssetLoads]);
      if(generation!==loadingGeneration||assetScene!==sceneKey||avatarAssetVariant!==avatarVariant)return;
      assetsReady=true;updateLoadingDesign();revealLoadedScene();
    }catch(error){
      if(generation!==loadingGeneration||assetScene!==sceneKey||avatarAssetVariant!==avatarVariant)return;
      console.warn(`Falha temporária ao preparar "${scene}"; nova tentativa automática.`,error);
      roomTransition.cancel();loadingScreen.dataset.roomTransition='false';
      if (attempt >= 4) {
        showLoadingFailure(loadingScreen.dataset.context === 'world'
          ? `Erro ao carregar ${currentDimensionLoadingName()}. Tente recarregar.`
          : 'Erro ao preparar o local. Tente recarregar.');
        return;
      }
      window.__clareiraLoadingPhrase?.();
      const wait=Math.min(900*2**Math.min(attempt,4),12000);
      await new Promise(resolve=>setTimeout(resolve,wait));
      if(generation===loadingGeneration&&assetScene===sceneKey&&avatarAssetVariant===avatarVariant)await loadAttempt(attempt+1);
    }
  };
  void loadAttempt(0);
}

function markConnectionSnapshotReady(){
  if(connectionSnapshotReady)return false;
  connectionSnapshotReady=true;
  // Partial resumed packets can ACK old steps before the required collections
  // arrive. Start the send/recovery clock when this connection can first send.
  lastInputProgressAt=performance.now();inputPressureSince=0;inputPressureReported=false;
  recoveryCloseRequested=false;
  return true;
}
let loadingReceivedMessages=0,loadingReceivedStates=0,loadingWelcomeReceived=false,loadingProcessingPhase=0,loadingLastMessageAt=0;
function connect() {
  if (!authenticated) return;
  connectionSnapshotReady = false;
  loadingReceivedMessages=0;loadingReceivedStates=0;loadingWelcomeReceived=false;loadingProcessingPhase=0;loadingLastMessageAt=performance.now();
  const reconnecting = disconnectedAt > 0;
  const resumeScene = sceneReady && predictionReady && disconnectedAt > 0
    && Date.now() - disconnectedAt <= RESUME_SCENE_GRACE_MS;
  teleportEffects.clear();dimensionTravelStarting=false;dimensionTravelRequestPending=false;pendingDimensionTravelRequestId=null;
  clearTimeout(reconnectTimer);
  resetServerClockSync();
  // Decode room furniture art alongside the first authoritative scene load.
  // Entering a room before it finishes reuses the same cached asset request.
  void contentAssets.loadScene('room').catch(() => {});
  if (resumeScene) {
    snapshotReady = false;
    sceneReadiness.reset();
    resumeCorrectionPending = true;
    ui.connection.textContent = 'Retomando sua sessão…';
  } else {
    beginSceneLoading('Carregando seu personagem e o local…',{genericTitle:true,
      statusMessage:reconnecting?'Conexão instável. Tentando retomar sua sessão…':null});
    roomStateAvailable = false;
    predictionReady = false;
    localRenderCorrection = { x: 0, y: 0 };
    resumeCorrectionPending = false;
    resumeCorrectionUntil = 0;
    pendingInputs = []; outboundInputs = []; inputSequence = 0;
    inventoryPrediction.reset();
    lastAcknowledgedInput = 0;
  }
  lastInputProgressAt = performance.now();
  inputPressureSince = 0;
  inputPressureReported = false;
  ui.dot.className = 'status-dot';
  ui.connection.textContent = resumeScene ? 'Retomando sua sessão…' : 'Conectando à clareira…';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const connection = new WebSocket(`${protocol}//${location.host}/dev/room`);
  const connectionAttempt = ++connectionAttemptNumber;
  let lastServerMessageAt = performance.now();
  if(connectionProfileDiagnostics)ui.connection.dataset.connectionAttempt=String(connectionAttempt);
  let connectionReadyAt = null;
  let startupDeadline = setTimeout(() => {
    if (socket === connection && connection.readyState === WebSocket.CONNECTING) {
      startupSnapshotFailures++;
      connection.close();
    }
  }, 10_000);
  socket = connection;
  connection.binaryType='arraybuffer';
  socket.addEventListener('open', () => {
    if (socket !== connection) return;
    recoveryCloseRequested=false;
    runtimePerformance.connect();
    recordMovementDiagnostic('connection-open',{attempt:connectionAttempt,pending:pendingInputs.length,outbound:outboundInputs.length,resume:resumeScene});
    clearTimeout(startupDeadline);
    startupDeadline = setTimeout(() => {
      if (socket === connection && !snapshotReady && connection.readyState === WebSocket.OPEN) {
        startupSnapshotFailures++;
        connection.close(4000, 'initial world snapshot timed out');
      }
    }, 18_000);
    ui.dot.className = 'status-dot connected';
    ui.connection.textContent = resumeScene ? 'Sincronizando movimento…' : 'Carregando o local…';
    if (reconnecting && !resumeScene) loadingMessage.textContent = 'Conexão restabelecida. Sincronizando seu mundo…';
    const viewport = currentViewport();
    lastSentViewport = viewport;
    send({ type: 'join', name: ui.name.value, compactWorld: 1, compactPlayers: 1, viewport });
    flushMovementDiagnostics(connection);
    sendServerClockProbe(connection);
    clockProbeTimer = setInterval(() => {
      if (connection !== socket || connection.readyState !== WebSocket.OPEN) return;
      if (performance.now() - lastServerMessageAt >= SERVER_SILENCE_TIMEOUT_MS) {
        connection.close(4000, 'server heartbeat timed out');
        return;
      }
      sendServerClockProbe(connection);
    }, 1000);
  });
  const applyServerMessage=event=>{
    if (socket !== connection) return;
    const messageStartedAt=performance.now();
    loadingReceivedMessages++;loadingLastMessageAt=messageStartedAt;
    try {
    loadingProcessingPhase=1;
    const raw=typeof event.data==='string'?event.data:new TextDecoder().decode(event.data);
    const message=event.packet||JSON.parse(raw);
    if(!message||typeof message!=='object')return;
    lastServerMessageAt = performance.now();
    if (message.type === 'clockPong') { acceptServerClockPong(message); return; }
    if(message.type==='diagnosticsAccepted'&&typeof message.reportId==='string'){
      if(movementDiagnostics.acknowledge(message.reportId))flushMovementDiagnostics(connection);
      return;
    }
    if(message.type==='performanceMetricsAccepted')return;
    if (message.type === 'welcome') {
      loadingWelcomeReceived=true;
      const previousSelfId = selfId;
      selfId = message.id;
      if (previousSelfId && previousSelfId !== selfId) {
        livePlayers.delete(previousSelfId);
        // An expired/server-restarted session starts at a new authoritative
        // position. Commands from the old actor must not be replayed there.
        predictionReady = false;
        pendingInputs = []; outboundInputs = [];
        inputSequence = 0; lastAcknowledgedInput = 0;
        resumeCorrectionPending = false;
      }
      return;
    }
    if(message.type==='roomTravelResult'){
      if(message.accepted===false&&message.requestId===pendingRoomTravelRequestId){
        clearTimeout(pendingRoomTravelTimer);pendingRoomTravelRequestId=null;roomTransition.cancel();
      }
      return;
    }
    if (message.type === 'mapExploration') { mergeMapExploration(message); return; }
    if (message.type === 'notice') {
      if(message.action==='roomFurniture'&&Number.isSafeInteger(message.requestId)){
        const restored=roomFurniturePrediction.acknowledge(message.requestId,message.result==='accepted');
        if(restored)applyRoomFurnitureSnapshot(restored,{predicted:true});
      }
      if (message.progressionLevelUp === true && Array.isArray(message.newlyUnlockedPages)) {
        for (const pageNumber of message.newlyUnlockedPages) {
          if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > STORAGE_PAGE_UNLOCK_LEVELS.length) continue;
          const expiresAt = performance.now() + 6000;
          storagePageUnlockFeedback.set(pageNumber, expiresAt);
          setTimeout(() => {
            if (storagePageUnlockFeedback.get(pageNumber) !== expiresAt) return;
            storagePageUnlockFeedback.delete(pageNumber);
            ui.inventoryPages.querySelector('[data-storage-page="' + (pageNumber - 1) + '"]')?.classList.remove('newly-unlocked');
          }, 6100);
        }
      }
      if(message.arrivalReady===true){arrivalTravelPending=true;if(teleportTravelReady())requestArrivalTravel();}
      if (typeof message.text === 'string') placePanel.notice(message.text);
      if(dimensionTravelRequestPending && message.action === 'dimensionTravel' && message.result === 'rejected'){
        dimensionTravelRequestPending=false;dimensionRequestStartedAt=0;pendingDimensionTravelRequestId=null;dimensionTravelStarting=false;teleportEffects.cancelLocal();updateDimensionTravel(dimensionList,worldDimensionId);
        if(message.action==='dimensionTravel'&&message.result==='rejected'&&worldDimensionId.startsWith('arrival-')&&!arrivalTutorial?.completed)arrivalDepartureAsked=false;
      }
      if (message.berryOffer) {
        const feedback = beginBerryOfferFeedback(message.berryOffer, performance.now());
        if (feedback) {
          berryOfferFeedbacks.push(feedback);
          if (berryOfferFeedbacks.length > 8) berryOfferFeedbacks.shift();
        }
      }
      const pendingInteraction = pendingInteractionCommands.get(message.requestId);
      if (message.result === 'cooldown' && pendingInteraction && pendingInteraction.retries < 3) {
        pendingInteraction.retries += 1;
        setTimeout(() => {
          if (pendingInteractionCommands.get(message.requestId) !== pendingInteraction) return;
          sendPendingMovementBeforeInteraction();
          pendingInteraction.message = { ...pendingInteraction.message, inputSeq: inputSequence };
          if (!send(pendingInteraction.message)) pendingInteractionCommands.delete(message.requestId);
        }, 285);
      } else if (message.requestId !== undefined) pendingInteractionCommands.delete(message.requestId);
      if (message.action === 'collect' && pickupFeedback?.requestId === message.requestId) {
        if (message.result === 'collected') {
          const target = message.resource && Number.isFinite(message.resource.x) && Number.isFinite(message.resource.y)
            ? { ...pickupFeedback, ...message.resource, resourceId: message.resource.id }
            : pickupFeedback;
          pickupFeedback = resolvePickupFeedback(target, true, performance.now());
        } else if (message.result !== 'cooldown') pickupFeedback = null;
      }
      const noticeDuration = Number.isFinite(message.durationMs) ? Math.max(2100, Math.min(7000, message.durationMs)) : 2100;
      announce(message.text, noticeDuration);
      if (message.sound) playEffect(message.sound);
      return;
    }
    if (message.type !== 'state') return;
    loadingReceivedStates++;loadingProcessingPhase=2;
    const statePayloadChars=typeof event.data==='string'?event.data.length:0;
    if(Array.isArray(message.dimensionTransits)){
      for(const transit of message.dimensionTransits){
        if(teleportEffects.accept(transit,message.serverTime)&&transit.actorId===selfId){const transitAcceptedAt=performance.now();if(dimensionRequestStartedAt){performanceTelemetry.observeDimensionRequest(transitAcceptedAt-dimensionRequestStartedAt);dimensionRequestStartedAt=0;}dimensionTravelRequestPending=false;pendingDimensionTravelRequestId=null;dimensionTravelStarting=true;dimensionArrivalStartedAt=transitAcceptedAt;clearDimensionTransitMovement();warmTransitDestination(transit);}
      }
    }
    if(message.objectCatalog){
      const applied=applyObjectCatalog(message.objectCatalog);
      send({type:'objectCatalogReady',revision:message.objectCatalog.revision});
      if(applied&&ui.roomCategory){ui.roomCategory.replaceChildren(...[{id:'basicos',label:'Móveis básicos'},...MEDIEVAL_FURNITURE_CATEGORIES].map(group=>{const option=document.createElement('option');option.value=group.id;option.textContent=group.label;return option;}));populateRoomFurnitureCategory();}
      if(applied){
        geometryCache.clear();fallenGeometryCache.clear();naturalGeometryCache.clear();naturalPatchCache.clear();
        outdoorEmitters=exteriorEmitters([RECEPTION_BUILDING,...VILLAGE_BUILDINGS],gameDay.daylight,gameDay.hasMoon);worldChunkRangeKey='';solidTreeLightingKey='';
        walkPath=[];pendingInputs=[];outboundInputs=[];localRenderCorrection={x:0,y:0};
      }
    }
    const snapshotDimensionId = message.dimensionId || worldDimensionId;
    const dimensionChanged = snapshotDimensionId !== worldDimensionId;
    const leavingArrivalTutorial=dimensionChanged&&worldDimensionId.startsWith('arrival-');
    if(dimensionChanged)dimensionTravelRequestPending=false;
    if(dimensionChanged){arrivalGuideAsked=false;arrivalDepartureAsked=false;arrivalTypingText='';arrivalLastDistance=Infinity;resumeCorrectionPending=false;resumeCorrectionUntil=0;remotePositions.clear();remotePlayback.clear();remoteFacings.clear();remoteAvatarVariants.clear();wildlife.clear();wildlifePositions.clear();wildlifePlayback.clear();wildlifeCollisionCache=[];villageActors.clear();villageNpcAvatarVariants.clear();}
    if (message.dimensions) updateDimensionTravel(message.dimensions, snapshotDimensionId);
    if(Object.hasOwn(message,'arrivalTutorial'))arrivalTutorial=message.arrivalTutorial||null;
    else if(dimensionChanged)arrivalTutorial=null;
    if(Array.isArray(message.villageActors)){
      const visibleNpcIds=new Set();
      for(const npc of message.villageActors){
        if(!npc?.id||!Number.isFinite(npc.x)||!Number.isFinite(npc.y))continue;
        const appearance=villageNpcAppearance(npc.id);
        if(!appearance)continue;
        visibleNpcIds.add(npc.id);
        const actor={...npc,appearance,npc:true,location:'clearing',dimensionId:worldDimensionId,
          z:0,vx:0,vy:0,moving:false,running:0,crouching:0,facing:'south'};
        villageActors.set(npc.id,actor);
        const variant=getAvatarSpriteVariant(appearance);
        if(villageNpcAvatarVariants.get(npc.id)!==variant){
          villageNpcAvatarVariants.set(npc.id,variant);
          void preloadAvatarIdle(appearance).catch(error=>console.error(
            'Falha ao preparar o sprite de repouso de um personagem da vila.',error));
        }
      }
      for(const id of villageActors.keys())if(!visibleNpcIds.has(id))villageActors.delete(id);
      for(const id of villageNpcAvatarVariants.keys())if(!visibleNpcIds.has(id))villageNpcAvatarVariants.delete(id);
    }
    const transitDefinition=message.worldDefinition
      ?transitWorldDefinitions.get(worldDefinitionCacheKey(message.worldDefinition))
      :null;
    const nextWorldDefinition=transitDefinition||message.worldDefinition;
    if (message.worldDefinition && (dimensionChanged || message.worldDefinition.revision !== getWorldDefinition().revision
        || message.worldDefinition.theme !== dimensionTheme)) {
      const geometryChanged=dimensionChanged
        ||worldDefinitionChangesGeometry(getWorldDefinition(),nextWorldDefinition);
      applyWorldDefinition(nextWorldDefinition);
      dimensionTheme = message.worldDefinition.theme || 'forest';
      canvas.dataset.dimensionTheme = dimensionTheme;
      canvas.style.filter = 'none';
      if(geometryChanged){
        naturalGeometryCache.clear();
        naturalPatchCache.clear();
        worldChunkRangeKey='';solidTreeLightingKey='';
      }
    }
    worldDimensionId = snapshotDimensionId;teleportEffects.updateLocalDimension(worldDimensionId);
    updateArrivalTutorialPanel();
    loadingProcessingPhase=3;
    snapshotReady = sceneReadiness.accept(message, selfId);
    const firstConnectionSnapshot=snapshotReady?markConnectionSnapshotReady():false;
    if (snapshotReady) {
      clearTimeout(startupDeadline);
      startupSnapshotFailures = 0;
      disconnectedAt = 0;
      ui.connection.textContent = 'Conectado à clareira';
      loadingProgress?.complete('snapshot');
      if (connectionReadyAt === null) connectionReadyAt = performance.now();
    }
    roomStateAvailable = true;
    const receivedAt = performance.now();
    if (Number.isFinite(message.serverTime) && Number.isFinite(message.serverWallTimeMs)) {
      gameDayAnchor = { serverTime: message.serverTime, serverWallTimeMs: message.serverWallTimeMs };
    }
    const snapshotTime = Number.isFinite(message.serverTime) && serverClockOffsetMs !== null
      ? message.serverTime + serverClockOffsetMs
      : receivedAt;
    const visiblePlayerIds = new Set();
    loadingProcessingPhase=4;
    const receivedPlayers = mergePlayerSnapshots(livePlayers, message.players || []);
    livePlayers.clear();
    for (const player of receivedPlayers) {
      livePlayers.set(player.id, player);
      visiblePlayerIds.add(player.id);
      if (player.id === selfId) continue;
      if (player.appearance) {
        const avatarVariant = getAvatarSpriteVariant(player.appearance);
        if (remoteAvatarVariants.get(player.id) !== avatarVariant) {
          remoteAvatarVariants.set(player.id, avatarVariant);
          void preloadAvatarSprites(player.appearance).catch(() => {});
        }
      }
      let samples = remotePositions.get(player.id) || [];
      let playback = remotePlayback.get(player.id) || createRemotePlayback();
      let previous = samples.at(-1);
      if (previous && Math.hypot(player.x - previous.x, player.y - previous.y) > 8) {
        samples = [];
        previous = null;
        playback = createRemotePlayback();
        remoteFacings.set(player.id, 'south');
      }
      if (!remoteFacings.has(player.id)) remoteFacings.set(player.id, 'south');
      if (previous && Math.hypot(player.x - previous.x, player.y - previous.y) > 0.002) {
        const hasVelocity = Number.isFinite(player.vx) && Number.isFinite(player.vy);
        const hasIntent = hasVelocity ? Math.hypot(player.vx, player.vy) > 0.2 : player.moving === true;
        remoteFacings.set(player.id, getFacingFromMotion(
          player.x - previous.x,
          player.y - previous.y,
          TILE_X,
          TILE_Y,
          remoteFacings.get(player.id),
          hasIntent,
        ));
      }
      const sampleTime = Math.max(snapshotTime, (samples.at(-1)?.time ?? -Infinity) + .01);
      observeRemoteSnapshot(playback, sampleTime, receivedAt, serverClockRoundTripMs);
      remotePlayback.set(player.id, playback);
      remotePositions.set(player.id, appendPositionSample(samples, {
        time: sampleTime,
        x: player.x,
        y: player.y,
        z: player.z || 0,
        flightZ: player.flightZ,
        vx: player.vx,
        vy: player.vy,
        vz: player.vz,
      }, REMOTE_POSITION_HISTORY));
    }
    announceChatMessages(message.players || []);
    for (const id of remotePositions.keys()) {
      if (!visiblePlayerIds.has(id)) {
        remotePositions.delete(id);
        remotePlayback.delete(id);
        remoteFacings.delete(id);
        remoteAvatarVariants.delete(id);
      }
    }
    applyCollectionSnapshot(resources,message.resources,item=>item.id);
    if (Array.isArray(message.resourceContracts)) resourceContracts = message.resourceContracts;
    if (message.marketQuotes && typeof message.marketQuotes === 'object' && !Array.isArray(message.marketQuotes)) marketQuotes = message.marketQuotes;
    if (Object.hasOwn(message, 'governmentTaxPanel')) governmentTaxPanel = message.governmentTaxPanel;
    if(Array.isArray(message.animals)){
      const visibleAnimalIds=new Set();
      for(const animal of message.animals){
        if(!animal||typeof animal.id!=='string'||!WILDLIFE_BY_ID.has(animal.speciesId))continue;
        visibleAnimalIds.add(animal.id);
        wildlife.set(animal.id,animal);
        const samples=wildlifePositions.get(animal.id)||[];
        wildlifePositions.set(animal.id,appendWildlifeSample(samples,animal,snapshotTime));
      }
      for(const id of wildlife.keys())if(!visibleAnimalIds.has(id)){wildlife.delete(id);wildlifePositions.delete(id);wildlifePlayback.delete(id);}
      wildlifeCollisionCache=wildlifeCollisionBodies(wildlife.values());
    }
    if (Array.isArray(message.fires)) {
      applyCollectionSnapshot(fires,message.fires,item=>`${item.x},${item.y}`);
      const burnSampledAt=performance.now();
      for (const fire of fires.values()) {
        fire.burnSampledAt=burnSampledAt;
        fire.flameRiseSampledAt=burnSampledAt;
      }
    }
    if((typeof message.roomKey==='string'&&message.roomKey!==worldRoomKey)||message.location&&message.location!=='room')roomFurniturePrediction.reset();
    applyRoomFurnitureSnapshot(message.roomFurniture);
    if (Object.hasOwn(message, 'roomCanEdit')) roomCanEdit = message.roomCanEdit === true;
    if (Object.hasOwn(message, 'canOwnerVisitHomes')) canOwnerVisitHomes = message.canOwnerVisitHomes === true;
    if (Object.hasOwn(message, 'flightPilotAllowed')) {
      flightPilotAllowed=message.flightPilotAllowed===true;
      const group=document.querySelector('[data-flight-pilot]');
      if(group)group.hidden=!flightPilotAllowed;
      if(!flightPilotAllowed)flightTargetHeight=null;
    }
    if (typeof message.roomOwnerName === 'string') roomOwnerName = message.roomOwnerName;
    const nextRoomKey = typeof message.roomKey === 'string' ? message.roomKey : worldRoomKey;
    if (nextRoomKey !== worldRoomKey || dimensionChanged) panels.close();
    const roomChanged=nextRoomKey!==worldRoomKey;
    worldRoomKey = nextRoomKey;
    worldRoomKind = typeof message.roomKind === 'string' ? message.roomKind : worldRoomKind;
    if (Object.hasOwn(message, 'roomBuildingId')) worldRoomBuildingId = typeof message.roomBuildingId === 'string' ? message.roomBuildingId : null;
    if (Object.hasOwn(message, 'propertyRequests')) propertyRequests=message.propertyRequests || [];
    if (Object.hasOwn(message, 'propertyRentalListings')) propertyRentalListings=message.propertyRentalListings || [];
    if (Object.hasOwn(message, 'lodgingClaims')) lodgingClaims = message.lodgingClaims || [];
    if (Object.hasOwn(message, 'lodgingLeases')) lodgingLeases = message.lodgingLeases || [];
    if (Object.hasOwn(message, 'lodgingClaim')) activeLodgingClaim = message.lodgingClaim || null;
    if (Object.hasOwn(message, 'lodgingLease')) activeLodgingLease = message.lodgingLease || null;
    if (typeof message.recurringLeasesAvailable === 'boolean') recurringLeasesAvailable = message.recurringLeasesAvailable;
    if (Object.hasOwn(message, 'roomLodgingMode')) worldRoomLodgingMode = message.roomLodgingMode || null;
    if (Array.isArray(message.cabinKeys)) cabinKeys = message.cabinKeys;
    if (Array.isArray(message.issuedCabinKeys)) issuedCabinKeys = message.issuedCabinKeys;
    if (Array.isArray(message.cabinOccupancy)) cabinOccupancy = message.cabinOccupancy;
    if (Array.isArray(message.propertyListings)) propertyListings = message.propertyListings;
    loadingProcessingPhase=5;
    const self = livePlayers.get(selfId);
    const nextFurnitureUseId=self?.location==='room'?self.furnitureUse?.id||null:null;
    refreshRoomObjectCardUseState();
    if(nextFurnitureUseId&&nextFurnitureUseId!==localFurnitureUseId){
      localPosition={x:self.x,y:self.y,vx:0,vy:0,z:self.z||0,vz:self.vz||0};
      previousLocalPosition={...localPosition};localRenderPosition={...localPosition};
      localRenderCorrection={x:0,y:0};pendingInputs=[];outboundInputs=[];walkPath=[];localMoving=false;
    }
    localFurnitureUseId=nextFurnitureUseId;
    if(self&&self.location==='clearing')updateMapExploration({x:self.x,y:self.y},snapshotDimensionId);
    requestMiniMapRedraw();
    if(self&&Number.isFinite(self.hasteRemainingMs))localHasteUntil=performance.now()+self.hasteRemainingMs;
    if(self&&Number.isFinite(self.sprintBurstRemainingMs))localSprintBurstUntil=performance.now()+self.sprintBurstRemainingMs;
    if(self&&self.abilityCooldowns&&typeof self.abilityCooldowns==='object')localAbilityCooldownUntil=new Map(Object.entries(self.abilityCooldowns).filter(([,remainingMs])=>Number.isFinite(remainingMs)&&remainingMs>0).map(([abilityId,remainingMs])=>[abilityId,performance.now()+remainingMs]));
    if(self&&Number.isFinite(self.dimensionTravelCooldownUntil)&&self.dimensionTravelCooldownUntil!==dimensionTravelCooldownUntil){
      dimensionTravelCooldownUntil=self.dimensionTravelCooldownUntil;scheduleDimensionCooldownRefresh();
    }
    const returningFromRoom = !dimensionChanged && worldLocation === 'room' && self?.location === 'clearing';
    updateLoadingDesign();
    if (self) {
      if (sceneReady && (self.location !== worldLocation || dimensionChanged || (self.location==='room'&&roomChanged))) {
        beginSceneLoading('Carregando o próximo local…',{fade:!dimensionChanged&&(self.location==='room'||worldLocation==='room'),showOverlay:!dimensionChanged});
        snapshotReady = sceneReadiness.accept(message, selfId);
      }
      if (self.location && (self.location !== worldLocation || dimensionChanged || (self.location==='room'&&roomChanged))) {
        worldLocation = self.location;clientRoomEnteredFloor=false;
        roomBuildMode = null; roomMovingId=null;
        pendingRoomFurnitureUse=null;roomSelectedId=null;ui.roomObjectCard.hidden=true;ui.roomBuildOptions.hidden=true;
        ui.roomBuildToggle.setAttribute('aria-expanded','false');
        roomPlacementPreview = null;
        updateRoomBuildButtons();
        localPosition = { x: self.x, y: self.y, vx:self.vx||0,vy:self.vy||0,z:self.z||0,vz:self.vz||0,jumpHeld:self.jumpHeld,fireJumping:self.fireJumping===true,burningRemainingMs:self.burningRemainingMs,...(Number.isFinite(self.flightZ)?{flightZ:self.flightZ,blocked:self.blocked===true}:{}) };
        previousLocalPosition = { ...localPosition };
        localRenderPosition = { ...localPosition };
        localRenderCorrection = { x: 0, y: 0 };
        camera = worldLocation==='room'
          ? roomView(currentRoomLayout(),viewWidth,viewHeight,localRenderPosition).camera
          : { ...localPosition };
        walkPath = [];
        pendingInputs = []; outboundInputs = [];
        document.querySelector('#weather-text').textContent=worldLocation==='room'?'sem vento':(message.dimension?.theme==='dark'?'uma fogueira no breu':message.dimension?.theme==='sky'?'vento das alturas':message.dimension?.theme==='inferno'?'calor profundo':message.dimension?.theme==='magic'?'brisa encantada':message.dimension?.theme==='energy'?'correntes de energia':message.dimension?.theme==='giants'?'vento das montanhas':'brisa calma');
      }
      setHudText(ui.worldTitle, worldLocation === 'room'
        ? worldRoomKind === 'lobby' ? roomOwnerName || 'Recepção da Vila'
          : worldRoomKind === 'lodging' ? roomOwnerName || 'Sua hospedagem'
            : roomCanEdit ? 'Seu quarto' : `Quarto de ${roomOwnerName || 'outra pessoa'}`
        : (message.dimension?.name || dimensionList.find(dimension => dimension.id === worldDimensionId)?.name || contentById('place.clearing').label));
      ui.roomBuildTools.hidden = worldLocation !== 'room'||!roomCanEdit;
      ui.worldMapToggle.hidden=worldLocation!=='clearing';mapUi.miniMap.hidden=worldLocation!=='clearing';requestMiniMapRedraw();
        ui.roomBuildToggle.hidden=!roomCanEdit;
        for(const element of [ui.roomPlace,ui.roomCategory,ui.roomKind,ui.roomMove,ui.roomRotate,ui.roomRemove])element.hidden=!roomCanEdit;
      canvas.setAttribute('aria-label', worldLocation === 'room'
        ? `${worldRoomKind === 'lobby' ? roomOwnerName || 'Recepção da Vila' : roomOwnerName || 'Hospedagem'}. Caminhe com WASD, as setas ou toque; use a roda do mouse ou aproxime dois dedos para ajustar o zoom; E na porta volta ao local anterior.`
        : 'Bosque isométrico. Use WASD, as setas ou os controles de toque para caminhar; E usa portas e pontos de atendimento; cabanas exigem chave; longe deles coleta; H trabalha com o machado; V visita alguém com hospedagem.');
      const touchWalkHint=document.querySelector('.touch-walk-hint');
      if(touchWalkHint)touchWalkHint.textContent=worldLocation==='room'?'Toque para caminhar · pinça ajusta o zoom':'Toque no chão para caminhar';
      const acknowledgedSeq=self.inputSeq||0,ackDelta=acknowledgedSeq-lastAcknowledgedInput;
      const ackObservedAt=performance.now();
      if(ackDelta>0)performanceTelemetry.observeAck(ackObservedAt-lastInputProgressAt);
      if(ackDelta>0&&ackObservedAt-lastMovementAckDiagnosticAt>=250){
        const now=ackObservedAt;
        recordMovementDiagnostic('input-ack',{serverSeq:acknowledgedSeq,ackDelta,pending:pendingInputs.length,
          outbound:outboundInputs.length,ackAgeMs:Math.max(0,now-lastInputProgressAt)});
        lastMovementAckDiagnosticAt=now;
      }
      if (!pendingInputs.length || acknowledgedSeq > lastAcknowledgedInput) {
        lastInputProgressAt = performance.now();
        lastAcknowledgedInput = acknowledgedSeq;
      }
      const occupied = [...livePlayers.values()].filter(player => player.id !== selfId);
      if (!predictionReady) {
        localPosition = { x: self.x, y: self.y, vx:self.vx||0,vy:self.vy||0,z:self.z||0,vz:self.vz||0,jumpHeld:self.jumpHeld,fireJumping:self.fireJumping===true,burningRemainingMs:self.burningRemainingMs,...(Number.isFinite(self.flightZ)?{flightZ:self.flightZ,blocked:self.blocked===true}:{}) };
        previousLocalPosition = { ...localPosition };
        localRenderPosition = { ...localPosition };
        localRenderCorrection = { x: 0, y: 0 };
        camera = worldLocation==='room'
          ? roomView(currentRoomLayout(),viewWidth,viewHeight,localRenderPosition).camera
          : { ...localPosition };
        pendingInputs = []; outboundInputs = [];
        inputSequence = Math.max(inputSequence, self.inputSeq || 0);
        walkPath = [];
        localMoving = false;
        collisionFeedback = null;
        collisionBlocked = false;
        predictionReady = true;
        loadingProgress?.complete('prediction');
      } else {
        const wasResumeSnapshot = resumeCorrectionPending || (firstConnectionSnapshot&&resumeScene);
        const visibleBeforeCorrection = { x: localRenderPosition.x, y: localRenderPosition.y };
        const corrected = reconcilePrediction(self, pendingInputs,
          worldLocation === 'room'
            ? (position, input, delta, others) => stepRoomPlayer(position, input, delta, others, [...roomFurniture.values()], currentRoomLayout(), { ...localInventory.attributes, hasteActive:performance.now()<localHasteUntil })
            : (position, input, delta, others) => stepPlayer(position, input, delta, others, [...fires.values()], undefined, currentWildlifeCollisionBodies(), { ...localInventory.attributes, hasteActive:performance.now()<localHasteUntil, sprintBurstActive:worldLocation==='clearing'&&performance.now()<localSprintBurstUntil, flightAuthorized:flightPilotAllowed }), occupied);
        const correctionDistance = Math.hypot(localPosition.x - corrected.position.x, localPosition.y - corrected.position.y);
        if (correctionDistance > 0.2) {
          const reconnectCorrection = wasResumeSnapshot && correctionDistance <= 1.25
            && (worldLocation === 'room' ? correctionDistance <= 0.35
              : worldLocation === 'clearing' && outsideShelterClearance(visibleBeforeCorrection));
          localRenderCorrection = reconnectCorrection
            || worldLocation === 'clearing' && outsideShelterClearance(visibleBeforeCorrection) && !wasResumeSnapshot
            ? renderCorrectionOffset(visibleBeforeCorrection, corrected.position)
            : { x: 0, y: 0 };
          if (reconnectCorrection) resumeCorrectionUntil = performance.now() + 900;
        }
        resumeCorrectionPending = false;
        localPosition = corrected.position;
        pendingInputs = corrected.pending;
        if (wasResumeSnapshot) {
          // send() only proves that a packet entered the old socket's buffer.
          // Re-send every unacknowledged command once after the new snapshot;
          // the server ignores sequences already received on either socket.
          outboundInputs = corrected.pending.slice();
          inputPressureSince = 0; inputPressureReported = false;
          lastInputProgressAt = performance.now();
        }
        const dx=localPosition.x-previousLocalPosition.x,dy=localPosition.y-previousLocalPosition.y;
        if(Math.hypot(dx,dy)>.2) previousLocalPosition={...localPosition};
      }
      const inventoryState = message.inventoryState;
      if (inventoryState && typeof inventoryState === 'object') {
        localInventory = inventoryPrediction.reconcile(inventoryState.inventory || self.inventory, inventoryState.seq || 0);
      }
      renderInventory();
      updateContextActionLabel();
      loadingProcessingPhase=6;
      prepareSceneAssets(self.location,self.appearance,self,snapshotDimensionId,{
        deferOutdoorWarmup:returningFromRoom||(dimensionChanged&&!leavingArrivalTutorial),transitWarmup:dimensionChanged,
      });
    }
    setHudText(ui.players, `${livePlayers.size} aqui`);
    if (ui.gold) setHudText(ui.gold, String(localInventory.gold || 0));
    if (ui.silver) setHudText(ui.silver, String(localInventory.silver || 0));
    if (ui.bronze) setHudText(ui.bronze, String(localInventory.bronze || 0));
    if (ui.bagGold) setHudText(ui.bagGold, String(localInventory.gold || 0));
    if (ui.bagSilver) setHudText(ui.bagSilver, String(localInventory.silver || 0));
    if (ui.bagBronze) setHudText(ui.bagBronze, String(localInventory.bronze || 0));
    if (ui.toolStatus) {
      const equippedTool = selectedLocalItem();
      const ownedAxe = axeToolFor(localInventory), ownedPickaxe = pickaxeToolFor(localInventory);
      const axeSpec = AXE_TOOL_SPECS[equippedTool], pickaxeSpec = PICKAXE_TOOL_SPECS[equippedTool];
      setHudText(ui.toolStatus, pickaxeSpec && localInventory[equippedTool]
        ? `${pickaxeSpec.label} · cerca de ${Math.ceil((localInventory.pickaxeDurability || 0) / pickaxeSpec.hitsPerOre)} unidades restantes`
        : axeSpec && localInventory[equippedTool]
          ? `${axeSpec.label} · fio ${localInventory.axeSharpness || 0}% · cerca de ${Math.ceil((localInventory.axeDurability || 0) / (axeSpec.treeHits+axeSpec.logHits))} ciclos restantes`
          : ownedAxe ? `${AXE_TOOL_SPECS[ownedAxe].label} no Inventário · equipe na barra`
            : ownedPickaxe ? `${PICKAXE_TOOL_SPECS[ownedPickaxe].label} no Inventário · equipe na barra` : 'Faca simples · sem machado');
    }
    refreshLodgingDialog();
    revealLoadedScene();
    performanceTelemetry.observeStateMessage(performance.now()-messageStartedAt,statePayloadChars);
    loadingProcessingPhase=7;
    }catch(error){
      console.error('Falha ao processar os dados do local.',error);
      if(!sceneReady){
        reportCurrentLoading();
        showLoadingFailure('A conexão abriu, mas houve uma falha ao preparar os dados do local. Tente esta etapa novamente.');
      }
    }
  };
  let queuedState=null,stateFramePending=false,queuedPayload='';
  socket.addEventListener('message',event=>{
    if(socket!==connection)return;
    let raw,packet;
    try{
      raw=typeof event.data==='string'?event.data:new TextDecoder().decode(event.data);
      packet=JSON.parse(raw);
    }catch{applyServerMessage(event);return;}
    runtimePerformance.receive(raw.length,packet?.type==='state'&&Boolean(queuedState),performance.now());
    if(packet?.type!=='state'){applyServerMessage({data:raw,packet});return;}
    // Receipt itself proves transport liveness even if drawing is slow.
    lastServerMessageAt=performance.now();
    queuedState=mergeQueuedState(queuedState,packet);queuedPayload=raw;
    if(stateFramePending)return;
    stateFramePending=true;
    requestAnimationFrame(()=>{
      stateFramePending=false;
      if(socket!==connection){queuedState=null;return;}
      const latest=queuedState,payload=queuedPayload;queuedState=null;queuedPayload='';
      if(latest)applyServerMessage({data:payload,packet:latest});
    });
  });
  socket.addEventListener('close', event => {
    if(connectionProfileDiagnostics){ui.connection.dataset.lastCloseCode=String(event.code);ui.connection.dataset.lastCloseReason=String(event.reason||'').slice(0,120);ui.connection.dataset.lastCloseAttempt=String(connectionAttempt);}
    if (socket !== connection) return;
    recordMovementDiagnostic('connection-close',{attempt:connectionAttempt,code:event.code,pending:pendingInputs.length,
      outbound:outboundInputs.length,lastSentSeq:inputSequence,lastAckSeq:lastAcknowledgedInput,
      reason:movementCloseReasonBucket(event.reason,event.code)},true);
    // Do not charge offline/reconnect time to dimension travel latency. A
    // transition interrupted by a dropped socket must start a fresh sample.
    dimensionArrivalStartedAt=0;dimensionRequestStartedAt=0;
    clearTimeout(startupDeadline);
    panels.close();
    resetServerClockSync();
    if(dimensionTravelCooldownTimer)clearTimeout(dimensionTravelCooldownTimer);dimensionTravelCooldownTimer=0;dimensionTravelCooldownUntil=0;
    const canKeepScene = authenticated && sceneReady && predictionReady;
    if (authenticated) {
      disconnectedAt ||= Date.now();
      if (!canKeepScene) beginSceneLoading('A conexão caiu. Reconectando ao seu mundo…',{genericTitle:true,
        statusMessage:'Conexão instável. Tentando retomar sua sessão…'});
    }
    if (!canKeepScene) {
      clearMovement();
      roomStateAvailable = false;
      predictionReady = false;
      selfId = null;
      livePlayers.clear();
      remotePositions.clear();
      remotePlayback.clear();
      remoteFacings.clear();
      remoteAvatarVariants.clear();
      lastAnnouncedChats.clear();
      clearWorldSnapshot(resources, fires);
      roomFurniture.clear();
      wildlife.clear(); wildlifePositions.clear();wildlifePlayback.clear(); wildlifeCollisionCache=[];
    }
    pickupFeedback = null;
    berryOfferFeedbacks.length = 0;
    if (!canKeepScene) ui.players.textContent = '0 aqui';
    ui.dot.className = 'status-dot offline';
    if (!authenticated) { ui.connection.textContent = 'Você saiu da clareira'; return; }
    const resumableScene = canKeepScene && Date.now() - disconnectedAt <= RESUME_SCENE_GRACE_MS;
    if (startupSnapshotFailures >= 3 && !resumableScene) {
      ui.connection.textContent = 'Não foi possível receber o estado do mundo';
      showLoadingFailure('A conexão não recebeu o estado do mundo após três tentativas. Verifique a conexão e tente recarregar.');
      return;
    }
    ui.connection.textContent = resumableScene
      ? 'Conexão instável · sua caminhada continua enquanto reconecto…'
      : 'A conexão caiu; tentando voltar…';
    const schedule = reconnectSchedule(reconnectDelay, connectionReadyAt === null ? 0 : performance.now() - connectionReadyAt);
    reconnectTimer = setTimeout(connect, schedule.delayMs);
    reconnectDelay = schedule.nextDelayMs;
  });
  socket.addEventListener('error', () => connection.close());
}

function movementIntent(position = localPosition) {
  if (panels.isOpen) return { x: 0, y: 0 };
  const manual = getWorldInput(keys, touchDirections, TILE_X, TILE_Y);
  if (manual.x || manual.y) {
    walkPath = [];
    pendingRoomFurnitureUse=null;
    return manual;
  }
  while (walkPath.length && Math.hypot(walkPath[0].x - position.x, walkPath[0].y - position.y) < 0.08) walkPath.shift();
  const next = walkPath[0];
  if (!next) {finishPendingRoomFurnitureUse(position);return { x: 0, y: 0 };}
  const dx = next.x - position.x;
  const dy = next.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return { x: 0, y: 0 };
  const speed = Math.min(1, distance / (PLAYER_SPEED * STEP));
  return { x: dx / distance * speed, y: dy / distance * speed };
}

function finishPendingRoomFurnitureUse(position){
  const pending=pendingRoomFurnitureUse;
  if(!pending||pending.awaitingPath||walkPath.length)return;
  pendingRoomFurnitureUse=null;
  const item=roomFurniture.get(pending.id),use=item&&furnitureUse(item);
  if(!item||!['sit','light','lie','shower','bathe','wash'].includes(use))return;
  const layout=currentRoomLayout(),distance=Math.hypot(position.x-item.x,position.y-item.y,
    surfaceHeight(position.x,position.y,'room',layout)-surfaceHeight(item.x,item.y,'room',layout)-(item.baseZ||0));
  if(distance<=1.5&&hasClearInteractionPath(position,item,{location:'room',furniture:[...roomFurniture.values()].filter(other=>other.id!==item.id),targetRadius:roomFurnitureRadius(item),roomLayout:layout})
      &&(use!=='light'||roomCanEdit)){
    sendPlayerCommand({type:'action',name:'useFurniture',id:item.id});return;
  }
  announce('Chegue mais perto para usar esse móvel.');
}

function currentWildlifeCollisionBodies() {
  return worldLocation === 'clearing' ? wildlifeCollisionCache : [];
}

function currentInput(position=localPosition){
  if(worldDimensionId.startsWith('arrival-')&&arrivalCinematicAge()<ARRIVAL_CAMERA_HOLD_MS)return {x:0,y:0,motion:true,run:false,crouch:false,jump:false};
  const intent=movementIntent(position),crouch=keys.has('Control')||keys.has('c')||keys.has('C');
  const moving=Math.hypot(intent.x,intent.y)>.001;
  if(flightTargetHeight===0&&Number.isFinite(position.flightZ)&&position.z<.001&&Math.abs(position.vz||0)<.001)flightTargetHeight=null;
  const flight=flightPilotAllowed&&worldLocation==='clearing'&&flightTargetHeight!==null
    ?{x:intent.x,y:intent.y,targetHeight:flightTargetHeight,profile:flightProfile}:null;
  return {...intent,motion:true,run:(keys.has('Shift')||touchRunEnabled)&&moving&&!crouch,crouch,jump:keys.has(' '),...(flight?{flight}:{})};
}

function canSkipSettledNeutralInput(input) {
  if(input.flight||Number.isFinite(livePlayers.get(selfId)?.flightZ))return false;
  if (input.x !== 0 || input.y !== 0 || input.jump) return false;
  const authoritative = livePlayers.get(selfId);
  if (!authoritative
      || Math.abs(authoritative.vx || 0) >= 1e-7
      || Math.abs(authoritative.vy || 0) >= 1e-7
      || (authoritative.z || 0) !== 0
      || (authoritative.vz || 0) !== 0
      || authoritative.jumpHeld === true
      || Number(authoritative.burningRemainingMs)>0) return false;

  const running = Boolean(input.run && !input.crouch);
  const crouching = Boolean(input.crouch);
  if (Boolean(authoritative.running) !== running || Boolean(authoritative.crouching) !== crouching) return false;
  const isSameNeutral = command => command.motion === true
    && command.x === 0 && command.y === 0 && command.jump !== true
    && Boolean(command.run && !command.crouch) === running
    && Boolean(command.crouch) === crouching;
  return pendingInputs.every(isSameNeutral) && outboundInputs.every(isSameNeutral);
}


function worldTargetAt(clientX, clientY, snap = false) {
  const bounds = canvas.getBoundingClientRect();
  const screenX = clientX - bounds.left - CENTRE_X;
  const screenY = clientY - bounds.top - CENTRE_Y;
  // Solve projected height directly; retain the scan for discontinuous surfaces that do not converge.
  let target=null;
  const roomLayout=currentRoomLayout();
  const boundsWorld=worldLocation==='room'?roomLayout.bounds:{left:0,right:WORLD_SIZE,top:0,bottom:WORLD_SIZE};
  const projectedX=(screenX+Math.round((camera.x-camera.y)*TILE_X))/TILE_X;
  const pointAtHeight = height => {
    const projectedY=(screenY+Math.round((camera.x+camera.y)*TILE_Y)+height*HEIGHT_PIXELS*spriteScale)/TILE_Y;
    const x=(projectedX+projectedY)/2,y=(projectedY-projectedX)/2;
    const landing=worldLocation==='room'&&!snap&&roomLayout.elevation==='flat'
      &&Math.abs(x-roomLayout.door.x)<=.92&&y<=boundsWorld.bottom+1.18;
    if(x<boundsWorld.left||x>boundsWorld.right||y<boundsWorld.top||y>boundsWorld.bottom&&!landing)return null;
    return {x,y,height:surfaceHeight(x,y,worldLocation,roomLayout)};
  };
  const solveFrom = initialHeight => {
    let estimate=initialHeight;
    for(let iteration=0;iteration<10;iteration++){
      const point=pointAtHeight(estimate);
      if(!point)return null;
      if(Math.abs(point.height-estimate)<.012)return point;
      estimate=point.height;
    }
    return null;
  };
  const candidates=[solveFrom(8),solveFrom(4),solveFrom(0)].filter(Boolean);
  if(candidates.length)target=candidates.reduce((highest,point)=>point.height>highest.height?point:highest);
  if(!target)for(let h=8;h>=-2.51;h-=.025){
    const point=pointAtHeight(h);
    if(point&&Math.abs(point.height-h)<.012){target=point;break;}
  }
  if (!target) return null;
  if (snap) target = { x: Math.round(target.x * 2) / 2, y: Math.round(target.y * 2) / 2 };
  return target;
}

function roomFurnitureAtPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
  const hits = [...roomFurniture.values()].map(item => {
    const pose=roomFurniturePose(item).item;
    const p = point(pose.x, pose.y,camera,surfaceHeight(pose.x,pose.y,'room',currentRoomLayout())+(pose.baseZ||0));
    const visual=furnitureVisual(item),halfWidth=(visual.width+visual.depth)*TILE_X*.34;
    const dx = Math.max(0, Math.abs(x - p.x) - halfWidth);
    const height=visual.height*HEIGHT_PIXELS*spriteScale;
    const dy = Math.max(0, y < p.y - height ? p.y - height - y : y > p.y + 3 * spriteScale ? y - p.y - 3 * spriteScale : 0);
    return { item, distance: Math.hypot(dx, dy) };
  }).filter(hit => hit.distance < TILE_X * .35).sort((a, b) => a.distance - b.distance);
  return hits[0]?.item || null;
}

function describeRoomFurnitureUse(use,item){
  if(use==='sit')return 'Clique no assento: seu personagem caminha até ele e se senta.';
  if(use==='lie')return 'Clique para caminhar até a cama e deitar sob as cobertas.';
  if(use==='shower')return 'Clique para caminhar até a ducha e tomar banho.';
  if(use==='bathe')return 'Clique para caminhar até a tina e tomar banho.';
  if(use==='wash')return 'Clique para caminhar até o lavatório e lavar as mãos.';
  if(use==='light')return item.enabled===false?'Clique para acender a luz.':'Clique para apagar a luz.';
  return 'Objeto decorativo do quarto.';
}

function roomFurnitureActionLabel(use,item,active,pending){
  if(pending)return 'Indo até lá…';
  if(use==='sit')return '';
  if(active)return use==='lie'?'Sair da cama':['shower','bathe','wash'].includes(use)?'Encerrar banho':'Usar';
  if(use==='lie')return 'Deitar';
  if(use==='shower'||use==='bathe')return 'Tomar banho';
  if(use==='wash')return 'Lavar as mãos';
  if(use==='light')return item.enabled===false?'Acender':'Apagar';
  return 'Usar';
}

// Every writer of the card text goes through here, so the predefined-piece note is never lost.
function setRoomObjectDescription(item,text){
  ui.roomObjectDescription.textContent=roomCanEdit&&isPresetFurniture(item)
    ?`${text} Peça do quarto: pode mudar de lugar e girar, mas não pode ser retirada.`:text;
}

function updateRoomObjectCard(item){
  if(!ui.roomObjectCard||!item){if(ui.roomObjectCard)ui.roomObjectCard.hidden=true;return;}
  if(roomBuildMode!==null){ui.roomObjectCard.hidden=true;return;}
  ui.roomObjectCard.hidden=false;
  const definition=MEDIEVAL_FURNITURE.find(entry=>entry.id===(item.properties?.catalogId||item.catalogId));
  const selectedOption=[...ui.roomKind.options].find(option=>option.value===item.kind);
  ui.roomObjectName.textContent=definition?.label||selectedOption?.textContent||item.kind;
  ui.roomObjectType.textContent=definition?.categoryLabel||({bed:'CAMA',chair:'ASSENTO',stool:'ASSENTO',sofa:'ASSENTO',lamp:'ILUMINAÇÃO',shower:'BANHO'}[item.kind]||'MÓVEL');
  const currentUse=livePlayers.get(selfId)?.furnitureUse?.id===item.id;
  setRoomObjectDescription(item,currentUse?furnitureUse(item)==='lie'?'Você está deitado sob as cobertas.':'Você está usando este móvel.':describeRoomFurnitureUse(furnitureUse(item),item));
  const context=ui.roomObjectPreview.getContext('2d');
  context.clearRect(0,0,ui.roomObjectPreview.width,ui.roomObjectPreview.height);
  drawRoomFixtureAsset(context,item,{x:80,y:136},{tileX:32,tileY:16,heightPixels:17,scale:1});
  const actions=[];
  const addAction=(label,className,onClick)=>{const button=document.createElement('button');button.type='button';button.className=className;button.textContent=label;button.addEventListener('click',onClick);actions.push(button);};
  const use=furnitureUse(item),usable=['sit','light','lie','shower','bathe','wash'].includes(use)&&(use!=='light'||roomCanEdit);
  const useLabel=roomFurnitureActionLabel(use,item,currentUse,pendingRoomFurnitureUse?.id===item.id);
  if(usable&&useLabel)addAction(useLabel,'primary',()=>walkToAndUseRoomFurniture(item));
  if(roomCanEdit){
    addAction(roomMovingId===item.id?'Cancelar mover':'Mover','',()=>{
      if(roomMovingId===item.id){roomMovingId=null;roomBuildMode=null;roomPlacementPreview=null;updateRoomBuildButtons();announce('Movimento cancelado.');return;}
      roomBuildMode='move';roomMovingId=item.id;roomSelectedId=item.id;roomPlacementPreview=null;ui.roomBuildOptions.hidden=false;ui.roomBuildToggle.setAttribute('aria-expanded','true');updateRoomBuildButtons();ui.roomObjectCard.hidden=true;announce('Escolha o novo lugar do móvel.');
    });
    addAction('Girar','',()=>sendPlayerCommand({type:'action',name:'rotateFurniture',id:item.id}));
    if(!isPresetFurniture(item))addAction('Retirar','danger',()=>sendPlayerCommand({type:'action',name:'removeFurniture',id:item.id}));
  }
  ui.roomObjectActions.replaceChildren(...actions);
}

function refreshRoomObjectCardUseState(){
  if(!roomSelectedId||ui.roomObjectCard.hidden)return;
  const item=roomFurniture.get(roomSelectedId);if(!item)return;
  const use=furnitureUse(item),active=livePlayers.get(selfId)?.furnitureUse?.id===item.id;
  setRoomObjectDescription(item,active?use==='lie'?'Você está deitado sob as cobertas.':'Você está usando este móvel.':describeRoomFurnitureUse(use,item));
  const button=ui.roomObjectActions.querySelector('.primary');
  if(button)button.textContent=roomFurnitureActionLabel(use,item,active,pendingRoomFurnitureUse?.id===item.id);
}

function walkToAndUseRoomFurniture(item){
  if(!item||!sceneReady||worldLocation!=='room')return;
  const use=furnitureUse(item),layout=currentRoomLayout(),distance=Math.hypot(localPosition.x-item.x,localPosition.y-item.y,
    surfaceHeight(localPosition.x,localPosition.y,'room',layout)-surfaceHeight(item.x,item.y,'room',layout)-(item.baseZ||0));
  if(distance<=1.5&&hasClearInteractionPath(localPosition,item,{location:'room',furniture:[...roomFurniture.values()].filter(other=>other.id!==item.id),targetRadius:roomFurnitureRadius(item),roomLayout:layout})
      &&(use!=='light'||roomCanEdit)){
    pendingRoomFurnitureUse=null;clearMovement();sendPlayerCommand({type:'action',name:'useFurniture',id:item.id});return;
  }
  if(!requestWalkPath({x:item.x,y:item.y},{useFurnitureId:item.id}))announce('Não encontrei um caminho livre até esse móvel.');
  else updateRoomObjectCard(item);
}

function roomFurnitureCandidate(item,target,furniture,layout){
  const candidate={...item,...target};
  for(const key of ['supportId','supportSurface','supportOffsetX','supportOffsetY','baseZ'])delete candidate[key];
  const support=roomFurnitureSupport(candidate,furniture,layout);
  if(support)Object.assign(candidate,support);
  return candidate;
}

function roomFurniturePose(item,now=performance.now()){
  const motion=roomFurnitureMotion.get(item.id);
  if(!motion)return {item,progress:1,fromRotation:item.rotation||0};
  const raw=Math.min(1,Math.max(0,(now-motion.startedAt)/motion.duration)),progress=1-(1-raw)**3;
  if(raw>=1)return {item,progress:1,fromRotation:motion.from.rotation||0};
  const from=motion.from,to=motion.to;
  return {item:{...to,x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress,
    baseZ:(from.baseZ||0)+((to.baseZ||0)-(from.baseZ||0))*progress},progress,fromRotation:from.rotation||0};
}

function applyRoomFurnitureSnapshot(items,{predicted=false}={}){
  if(!Array.isArray(items))return;
  const incoming=predicted?items:roomFurniturePrediction.snapshot(items),now=performance.now(),previous=new Map(roomFurniture);
  const incomingIds=new Set(incoming.map(item=>item.id));
  if(roomSelectedId&&!incomingIds.has(roomSelectedId)){roomSelectedId=null;if(ui.roomObjectCard)ui.roomObjectCard.hidden=true;}
  for(const item of incoming){
    const prior=previous.get(item.id);
    if(roomSelectedId===item.id&&prior&&(prior.rotation!==item.rotation||prior.enabled!==item.enabled))updateRoomObjectCard(item);
    if(prior&&(prior.x!==item.x||prior.y!==item.y||prior.baseZ!==item.baseZ||prior.rotation!==item.rotation)){
      const from=roomFurniturePose(prior,now).item,travel=Math.hypot(item.x-from.x,item.y-from.y);
      roomFurnitureMotion.set(item.id,{from:{...from},to:{...item},startedAt:now,duration:Math.max(150,Math.min(480,travel*95))});
    }
  }
  for(const id of roomFurnitureMotion.keys())if(!incomingIds.has(id))roomFurnitureMotion.delete(id);
  applyCollectionSnapshot(roomFurniture,incoming,item=>item.id);
  updateRoomBuildCount();
}

function getPathfindingWorker() {
  if (pathfindingWorker) return pathfindingWorker;
  pathfindingWorker = new Worker(new URL('./pathfinding-worker.mjs', import.meta.url), { type: 'module' });
  pathfindingWorker.addEventListener('message', ({ data }) => {
    if (data.requestId !== pathfindingRequestId) return;
    lastPathfindingMs = data.durationMs;
    if (!Array.isArray(data.path) || !data.path.length) {
      walkPath = [];
      if(pendingRoomFurnitureUse){pendingRoomFurnitureUse.awaitingPath=false;finishPendingRoomFurnitureUse(localPosition);}
      announce(data.error ? 'Não consegui calcular esse caminho.' : 'Não encontrei um caminho livre até ali.');
      return;
    }
    walkPath = data.path;
    if(pendingRoomFurnitureUse)pendingRoomFurnitureUse.awaitingPath=false;
    canvas.focus({ preventScroll: true });
  });
  pathfindingWorker.addEventListener('error', () => {
    lastPathfindingMs = null;
    walkPath = [];
    announce('Não consegui calcular esse caminho.');
  });
  return pathfindingWorker;
}

function setWalkDestination(event) {
  if(worldDimensionId.startsWith('arrival-')&&arrivalCinematicAge()<ARRIVAL_CAMERA_HOLD_MS)return;
  if (worldLocation === 'room' && performance.now() < ignoreRoomCanvasClickUntil) return;
  if (!sceneReady || !authenticated || panels.isOpen || event.button !== 0 || dimensionTransitMovementLocked()) return;
  if(worldLocation==='room'&&roomBuildMode==null){
    const hit=roomFurnitureAtPointer(event);
    if(hit){
      roomSelectedId=hit.id;
      updateRoomObjectCard(hit);
      const use=furnitureUse(hit),layout=currentRoomLayout();
      if(['sit','light','lie','shower','bathe','wash'].includes(use)&&(use!=='light'||roomCanEdit)){
        walkToAndUseRoomFurniture(hit);return;
      }
      return;
    }
  }
  if(worldLocation==='room'&&['remove','rotate','use','move'].includes(roomBuildMode)&&!(roomBuildMode==='move'&&roomMovingId)){
    const item=roomFurnitureAtPointer(event);
    if(!item){announce('Toque em um móvel próximo.');return;}
    roomSelectedId=item.id;updateRoomObjectCard(item);
    if(roomBuildMode==='remove'&&isPresetFurniture(item)){announce(PRESET_REMOVE_MESSAGE);return;}
    if(roomBuildMode==='move'){
      roomMovingId=item.id;roomSelectedId=item.id;announce('Móvel selecionado. Agora escolha o novo lugar no piso.');return;
    }
    roomSelectedId=item.id;
    if(roomBuildMode==='use'){walkToAndUseRoomFurniture(item);return;}
    sendPlayerCommand({type:'action',name:{remove:'removeFurniture',rotate:'rotateFurniture'}[roomBuildMode],id:item.id});
    roomBuildMode=null;ui.roomBuildOptions.hidden=true;ui.roomBuildToggle.setAttribute('aria-expanded','false');updateRoomBuildButtons();updateRoomObjectCard(item);return;
  }
  const editing=worldLocation==='room'&&(roomBuildMode==='place'||roomBuildMode==='move'&&roomMovingId);
  const targetStarted=renderProfiler?performance.now():0;
  const target=worldTargetAt(event.clientX,event.clientY,editing);
  if(renderProfiler)lastWorldTargetMs=performance.now()-targetStarted;
  if(!target){announce('Clique em um piso acessível.');return;}
  if(worldLocation==='clearing'&&worldDimensionId.startsWith('arrival-')&&arrivalTutorial?.phase==='find'&&arrivalTutorial.target){
    const sprig=arrivalTutorial.target;
    if(Math.hypot(target.x-sprig.x,target.y-sprig.y)<1.6){
      const distance=Math.hypot(localPosition.x-sprig.x,localPosition.y-sprig.y);
      if(distance<=1.8)sendPlayerCommand({type:'action',name:'arrivalTutorialCollect'});
      else requestWalkPath(sprig);
      return;
    }
  }
  if(editing){
    const position={x:target.x,y:target.y};
    const occupied=[...livePlayers.values()];
    const furniture=[...roomFurniture.values()].filter(item=>item.id!==roomMovingId);
    const selected=MEDIEVAL_FURNITURE.find(item=>item.id===ui.roomKind.value),source=roomBuildMode==='move'?roomFurniture.get(roomMovingId):selected?{...selected,kind:selected.renderKind,properties:selected}: {kind:ui.roomKind.value};
    const candidate=roomFurnitureCandidate(source||{kind:ui.roomKind.value},position,furniture,currentRoomLayout());
    if((roomBuildMode==='place'&&roomPlacedCount()>=ROOM_FURNITURE_LIMIT)||!canPlaceRoomFurniture(candidate,furniture,occupied,currentRoomLayout())){announce('Escolha um piso livre, longe da porta.');return;}
    const movedId=roomMovingId;
    const wasMove=roomBuildMode==='move';
    sendPlayerCommand({type:'action',name:roomBuildMode==='move'?'moveFurniture':'placeFurniture',
      kind:source?.kind||ui.roomKind.value,catalogId:roomBuildMode==='place'?selected?.catalogId:undefined,id:roomMovingId,...position});
    roomMovingId=null;roomSelectedId=wasMove?movedId:null;roomPlacementPreview=null;roomBuildMode=null;
    ui.roomBuildOptions.hidden=true;ui.roomBuildToggle.setAttribute('aria-expanded','false');updateRoomBuildButtons();
    if(roomSelectedId)updateRoomObjectCard(roomFurniture.get(roomSelectedId));return;
  }
  requestWalkPath(target);
}

function requestWalkPath(target,{useFurnitureId=null}={}) {
  if(!sceneReady||!authenticated||panels.isOpen||dimensionTransitMovementLocked()){pendingRoomFurnitureUse=null;return false;}
  pendingRoomFurnitureUse=useFurnitureId?{id:useFurnitureId,awaitingPath:true}:null;
  const occupied=[...livePlayers.values()].filter(player=>player.id!==selfId);
  const requestId=++pathfindingRequestId;walkPath=[];lastPathfindingMs=null;
  const usedFurnitureId=livePlayers.get(selfId)?.furnitureUse?.id;
  getPathfindingWorker().postMessage({requestId,worldDefinition:getWorldDefinition(),objectCatalog:getObjectCatalog(),
    start:{...localPosition},target:{x:Number(target.x),y:Number(target.y)},occupied,location:worldLocation,
    furniture:[...roomFurniture.values()].filter(item=>item.id!==usedFurnitureId),fires:[...fires.values()],roomLayout:currentRoomLayout(),animals:currentWildlifeCollisionBodies()});
  return true;
}

// Quantos móveis o jogador ainda pode colocar. Os predefinidos do quarto não contam.
function updateRoomBuildCount() {
  const element=document.querySelector('#room-build-count');
  if(!element)return;
  const placed=roomPlacedCount();
  element.textContent=`Móveis extras: ${placed} de ${ROOM_FURNITURE_LIMIT}. Peças do quarto podem ser movidas e giradas.`;
}

function updateRoomBuildButtons() {
  if (!ui.roomPlace || !ui.roomRotate || !ui.roomRemove) return;
  ui.roomMove.setAttribute('aria-pressed', String(roomBuildMode === 'move'));
  ui.roomPlace.setAttribute('aria-pressed', String(roomBuildMode === 'place'));
  ui.roomRotate.setAttribute('aria-pressed', String(roomBuildMode === 'rotate'));
  ui.roomRemove.setAttribute('aria-pressed', String(roomBuildMode === 'remove'));
}

const builtinRoomFurnitureOptions=[...ui.roomKind.options].map(option=>({value:option.value,label:option.textContent}));
function populateRoomFurnitureCategory(category=ui.roomCategory?.value||'basicos'){
 if(!ui.roomCategory||!ui.roomKind)return;
 const rows=category==='basicos'?builtinRoomFurnitureOptions:MEDIEVAL_FURNITURE.filter(item=>item.category===category).map(item=>({value:item.id,label:item.label}));
 const prior=ui.roomKind.value;ui.roomKind.replaceChildren(...rows.map(row=>{const option=document.createElement('option');option.value=row.value;option.textContent=row.label;return option;}));
 if(rows.some(row=>row.value===prior))ui.roomKind.value=prior;
}

function setRoomBuildMode(mode) {
  if (worldLocation !== 'room'||mode!=='use'&&!roomCanEdit) return;
  roomMovingId=null;
  if(mode!=='move')roomSelectedId=null;
  roomBuildMode = roomBuildMode === mode ? null : mode;
  roomPlacementPreview = null;
  updateRoomBuildButtons();
  if(ui.roomBuildOptions){ui.roomBuildOptions.hidden=roomBuildMode===null;ui.roomBuildToggle.setAttribute('aria-expanded',String(roomBuildMode!==null));}
  if(roomBuildMode!==null)ui.roomObjectCard.hidden=true;
  else if(roomSelectedId)updateRoomObjectCard(roomFurniture.get(roomSelectedId));
  announce(roomBuildMode === 'place' ? 'Escolha um ponto livre do piso para colocar o móvel.'
    : roomBuildMode==='move'?'Toque no móvel para selecioná-lo; depois escolha o novo lugar.':roomBuildMode==='use'?'Toque no móvel para caminhar até ele e usar.': roomBuildMode === 'rotate' ? 'Toque no móvel para girá-lo.'
      : roomBuildMode === 'remove' ? 'Toque no móvel para retirá-lo.' : 'Modo de construção fechado.');
  canvas.focus({ preventScroll: true });
}

function previewRoomFurniture(event) {
  if (roomCameraPinch || worldLocation !== 'room' || !(roomBuildMode === 'place'||roomBuildMode==='move'&&roomMovingId)) return;
  const target=worldTargetAt(event.clientX,event.clientY,true);
  const source=roomMovingId?roomFurniture.get(roomMovingId):{kind:ui.roomKind.value};
  const furniture=[...roomFurniture.values()].filter(item=>item.id!==roomMovingId);
  roomPlacementPreview=target?roomFurnitureCandidate(source||{kind:ui.roomKind.value},target,furniture,currentRoomLayout()):null;
}

const inventoryItemPresentation = Object.freeze({
  wood: ['Graveto seco', 'wood'], timber: ['Madeira bruta', 'timber'], sturdyBranch: ['Galho forte', 'sturdyBranch'], stone: ['Pedra', 'stone'],
  berries: ['Frutinha', 'berries'], apples: ['Maçã', 'apples'], leaves: ['Folhas secas', 'leaves'],
  vines: ['Cipó', 'vines'], plank: ['Ripa de madeira', 'plank'], copperOre: ['Minério de cobre', 'copperOre'], ironOre: ['Minério de ferro', 'ironOre'],
  coal: ['Carvão mineral', 'coal'], charcoal: ['Carvão vegetal', 'charcoal'], copperIngot: ['Lingote de cobre', 'copperIngot'], ironIngot: ['Lingote de ferro', 'ironIngot'],
  knife: ['Faca simples', 'knife'], stoneAxe: ['Machado de pedra', 'stoneAxe'], copperAxe:['Machado de cobre','copperAxe'], ironAxe:['Machado de ferro','ironAxe'],
  stonePickaxe: ['Picareta de pedra', 'stonePickaxe'], copperPickaxe:['Picareta de cobre','copperPickaxe'], ironPickaxe:['Picareta de ferro','ironPickaxe'],
  rawMeat:['Carne crua','rawMeat'], hide:['Couro','hide'], bone:['Osso','bone'], feather:['Pena','feather'], venom:['Veneno','venom'], glowDust:['Pó de luz','glowDust'], cinderShard:['Fragmento de cinza','glowDust'], emberCore:['Núcleo de brasa','glowDust'],
  xpPotionI:['Poção de XP I','xpPotionI'], xpPotionII:['Poção de XP II','xpPotionI'], xpPotionIII:['Poção de XP III','xpPotionI'], xpPotionIV:['Poção de XP IV','xpPotionI'],
});

const inventoryItemUse = Object.freeze({
  knife: ['Ferramenta', 'Selecione na barra e use E perto dos cipós para coletá-los.'],
  stoneAxe: ['Ferramenta', 'Selecione na barra e use H perto de árvores ou toras.'],
  copperAxe: ['Ferramenta', 'Selecione na barra e use H perto de árvores ou toras.'],
  ironAxe: ['Ferramenta', 'Selecione na barra e use H perto de árvores ou toras.'],
  stonePickaxe: ['Ferramenta', 'Selecione na barra e use H perto de um veio de minério.'],
  copperPickaxe: ['Ferramenta', 'Selecione na barra e use H perto de um veio de minério.'],
  ironPickaxe: ['Ferramenta', 'Selecione na barra e use H perto de um veio de minério.'],
  berries: ['Coleta', 'Você pode oferecer frutinhas a alguém que esteja por perto.'],
  apples: ['Coleta', 'Maçãs encontradas durante a exploração.'],
  rawMeat: ['Coleta', 'Carne obtida na caça.'],
  hide: ['Coleta', 'Material obtido na caça.'],
  bone: ['Coleta', 'Material obtido na caça.'],
  feather: ['Coleta', 'Material encontrado ao explorar o bosque.'],
  venom: ['Coleta', 'Material raro encontrado durante a exploração.'],
  glowDust: ['Coleta', 'Pó luminoso encontrado durante a exploração.'],
  cinderShard: ['Material raro', 'Fragmento deixado por uma Cinza-viva derrotada.'],
  emberCore: ['Material lendário', 'Núcleo valioso obtido ao derrotar uma Cinza-viva rara.'],
  xpPotionI: ['Poção · 100 XP', 'Uma poção rara. Beber adiciona experiência; a subida de nível e o desbloqueio de páginas são salvos juntos.'],
  xpPotionII: ['Poção · 500 XP', 'Uma poção rara e concentrada. Beber adiciona experiência; a subida de nível e o desbloqueio de páginas são salvos juntos.'],
  xpPotionIII: ['Poção · 1.800 XP', 'Uma poção muito rara. Beber adiciona experiência; a subida de nível e o desbloqueio de páginas são salvos juntos.'],
  xpPotionIV: ['Poção · 6.000 XP', 'Uma poção excepcional. Beber adiciona experiência; a subida de nível e o desbloqueio de páginas são salvos juntos.'],
});

function inventoryItemUseFor(itemId) {
  const detail = inventoryItemUse[itemId];
  if (detail) return detail;
  if (['wood', 'timber', 'sturdyBranch', 'stone', 'leaves', 'vines', 'plank', 'copperOre', 'ironOre', 'coal', 'charcoal', 'copperIngot', 'ironIngot'].includes(itemId)) {
    return ['Material', 'Use este material nas receitas e melhorias da aventura.'];
  }
  return ['Achado', 'Guarde este item para usar durante sua jornada.'];
}

function createInventorySlot(index, { quick = false } = {}) {
  const stack = localInventory.slots?.[index] || null;
  const [label, iconName] = stack ? inventoryItemPresentation[stack.itemId] || [stack.itemId, 'stone'] : ['Vazio', ''];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `inventory-slot${stack ? ' filled' : ''}${index === (localInventory.selectedSlot || 0) ? ' selected' : ''}${index === inventorySelectionIndex ? ' item-selected' : ''}${index === inventoryDragSource ? ' source-selected' : ''}`;
  button.title = stack ? `${label} · ${stack.quantity}` : `Espaço ${index + 1} vazio`;
  if (quick) button.dataset.quickSlot = String(index);
  else button.dataset.bagSlot = String(index);
  button.dataset.inventorySlot = String(index);
  if (stack) button.dataset.item = stack.itemId;
  button.draggable = Boolean(stack);
  button.setAttribute('aria-label', stack ? `${quick ? `Barra ${index + 1}: ` : `Espaço ${index + 1}: `}${label}, ${stack.quantity}`
    : `Espaço ${index + 1} vazio`);
  button.setAttribute('aria-pressed', String(index === inventorySelectionIndex));
  const key = document.createElement('span'); key.className = 'inventory-slot-key'; key.textContent = String(index + 1);
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.classList.add('inventory-slot-icon'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('viewBox', '0 0 24 24');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `/dev/art/inventory-items.svg#${iconName}`); icon.append(use);
  const count = document.createElement('span'); count.className = 'inventory-slot-count'; count.textContent = stack && Number(stack.quantity) > 1 ? String(stack.quantity) : '';
  button.append(key, icon, count);
  return button;
}

function syncInventoryGrid(container, indexes, { quick = false } = {}) {
  const current = [...container.children];
  if (current.length !== indexes.length || current.some((slot, i) => Number(slot.dataset.inventorySlot) !== indexes[i])) {
    const fragment = document.createDocumentFragment();
    for (const index of indexes) fragment.append(createInventorySlot(index, { quick }));
    container.replaceChildren(fragment);
    return;
  }
  current.forEach((button, i) => {
    const index = indexes[i], stack = localInventory.slots?.[index] || null;
    const [label, iconName] = stack ? inventoryItemPresentation[stack.itemId] || [stack.itemId, 'stone'] : ['Vazio', ''];
    const setClass = (name, present) => {
      if (button.classList.contains(name) !== present) button.classList.toggle(name, present);
    };
    setClass('filled', Boolean(stack));
    setClass('selected', index === (localInventory.selectedSlot || 0));
    setClass('item-selected', index === inventorySelectionIndex);
    setClass('source-selected', index === inventoryDragSource);
    const title = stack ? `${label} · ${stack.quantity}` : `Espaço ${index + 1} vazio`;
    if (button.title !== title) button.title = title;
    if (button.draggable !== Boolean(stack)) button.draggable = Boolean(stack);
    if (stack ? button.dataset.item !== stack.itemId : button.hasAttribute('data-item')) {
      if (stack) button.dataset.item = stack.itemId; else delete button.dataset.item;
    }
    const ariaLabel = stack ? `${quick ? `Barra ${index + 1}: ` : `Espaço ${index + 1}: `}${label}, ${stack.quantity}` : `Espaço ${index + 1} vazio`;
    if (button.getAttribute('aria-label') !== ariaLabel) button.setAttribute('aria-label', ariaLabel);
    const pressed = String(index === inventorySelectionIndex);
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    const iconHref = `/dev/art/inventory-items.svg#${iconName}`;
    const iconUse = button.querySelector('.inventory-slot-icon use');
    if (iconUse?.getAttribute('href') !== iconHref) iconUse?.setAttribute('href', iconHref);
    const count = button.querySelector('.inventory-slot-count');
    const countText = stack && Number(stack.quantity) > 1 ? String(stack.quantity) : '';
    if (count && count.textContent !== countText) count.textContent = countText;
  });
}

let renderedInventorySelection;
function renderInventorySelection(force = false) {
  if (!force && renderedInventorySelection === inventorySelectionIndex) return;
  renderedInventorySelection = inventorySelectionIndex;
  for (const slot of ui.inventoryDialog.querySelectorAll('[data-inventory-slot]')) {
    slot.classList.toggle('item-selected', Number(slot.dataset.inventorySlot) === inventorySelectionIndex);
  }
  renderInventoryDetails();
}

const xpPotionIngredientNames = Object.freeze({
  glowDust:'pó de luz', berries:'frutinhas', charcoal:'carvão vegetal', venom:'veneno', bone:'ossos',
  ironIngot:'lingote de ferro', cinderShard:'fragmento de cinza', emberCore:'núcleo de brasa',
});
const xpPotionSourceHints = Object.freeze({
  xpPotionI:'Onde buscar: vagalumes deixam pó de luz; frutinhas vêm da coleta.',
  xpPotionII:'Onde buscar: cobras deixam veneno; procure-as durante a exploração.',
  xpPotionIII:'Onde buscar: Cinzas-vivas deixam fragmentos; funda minério para obter ferro.',
  xpPotionIV:'Onde buscar: o núcleo de brasa tem 8% de chance de queda da Cinza-viva no Inferno.',
});
function renderAbilityCooldowns() {
  const now = performance.now();
  for (const button of document.querySelectorAll('[data-action^="cast:"]')) {
    const abilityId = button.dataset.action.slice(5);
    if (!button.dataset.readyLabel) button.dataset.readyLabel = button.textContent;
    if (!button.dataset.readyAriaLabel) button.dataset.readyAriaLabel = button.getAttribute('aria-label') || button.textContent;
    const remaining = Math.max(0, (localAbilityCooldownUntil.get(abilityId) || 0) - now);
    const label = button.dataset.readyLabel;
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      const text=label+' · '+seconds+' s';
      if(button.textContent!==text)button.textContent=text;
      const aria=button.dataset.readyAriaLabel+' · disponível em '+seconds+' segundos';
      if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
      button.disabled = true;
    } else {
      if(button.textContent!==label)button.textContent=label;
      if(button.getAttribute('aria-label')!==button.dataset.readyAriaLabel)button.setAttribute('aria-label',button.dataset.readyAriaLabel);
      button.disabled = false;
    }
  }
}

function renderXpPotionRecipes() {
  for (const [potionId, recipe] of Object.entries(XP_POTION_RECIPES)) {
    const card = document.querySelector('[data-xp-potion-card="'+potionId+'"]');
    const note = card?.querySelector('[data-xp-potion-note]');
    if (!note) continue;
    const potion = XP_POTIONS[potionId];
    const duration = recipe.durationMs >= 3_600_000
      ? String(recipe.durationMs / 3_600_000) + ' h'
      : String(recipe.durationMs / 60_000) + ' min';
    const ingredients = Object.entries(recipe.cost)
      .map(([item, quantity]) => String(quantity) + ' ' + (xpPotionIngredientNames[item] || item)).join(' · ');
    const missing = Object.entries(recipe.cost)
      .filter(([item, quantity]) => (localInventory[item] || 0) < quantity)
      .map(([item, quantity]) => String(quantity - (localInventory[item] || 0)) + ' ' + (xpPotionIngredientNames[item] || item));
    const carried = localInventory[potionId] || 0;
    const atMaxLevel = (localInventory.level || 1) >= MAX_PLAYER_LEVEL;
    const status = atMaxLevel
      ? 'Nível máximo atingido; estas poções não concedem mais XP.'
      : carried >= potion.maximumCarried
        ? 'Limite de ' + potion.maximumCarried + ' no Inventário; beba uma para liberar espaço.'
        : (localInventory.level || 1) < potion.minimumLevel
          ? 'Disponível no nível ' + potion.minimumLevel + '.'
          : missing.length ? 'Faltam: ' + missing.join(', ') + '.'
          : 'Você tem os ingredientes; prepare perto de uma fornalha de pedra.';
    const brewButton = card.querySelector('button');
    if (brewButton) brewButton.disabled = atMaxLevel;
    note.textContent = '+' + potion.xp.toLocaleString('pt-BR') + ' XP · limite ' + potion.maximumCarried + ' · ' + duration + ' · Receita: ' + ingredients + '. ' + status;
    let sourceHint = card.querySelector('[data-xp-potion-source]');
    if (!sourceHint) {
      sourceHint = document.createElement('small');
      sourceHint.dataset.xpPotionSource = '';
      note.after(sourceHint);
    }
    sourceHint.textContent = xpPotionSourceHints[potionId] || '';
  }
}

let inventoryHudRenderKey='';
function renderInventory(forcePanel = false) {
  if (!ui.quickbar || !ui.inventoryGrid) return;
  const hudKey=JSON.stringify([localInventory,inventorySelectionIndex,inventoryDragSource]);
  if(!forcePanel&&!ui.inventoryDialog.open&&hudKey===inventoryHudRenderKey){
    // Cooldowns depend on time; inventory, recipes and slot DOM do not.
    if(localAbilityCooldownUntil.size)renderAbilityCooldowns();
    return;
  }
  inventoryHudRenderKey=hudKey;
  const attributePointsAvailable = localInventory.attributePoints || 0;
  const skillPointsAvailable = localInventory.skillPoints || 0;
  const totalPointsAvailable = attributePointsAvailable + skillPointsAvailable;
  if (ui.progressionBadge) {
    ui.progressionBadge.hidden = totalPointsAvailable <= 0;
    ui.progressionBadge.textContent = totalPointsAvailable > 0 ? String(totalPointsAvailable) : '';
    const pointSummary = [];
    if (attributePointsAvailable) pointSummary.push(attributePointsAvailable + (attributePointsAvailable === 1 ? ' ponto de atributo' : ' pontos de atributo'));
    if (skillPointsAvailable) pointSummary.push(skillPointsAvailable + (skillPointsAvailable === 1 ? ' ponto de habilidade' : ' pontos de habilidade'));
    const label = totalPointsAvailable > 0
      ? 'Abrir Inventário. ' + pointSummary.join(' e ') + ' disponíveis para distribuir.'
      : 'Abrir Inventário';
    ui.inventoryToggle.setAttribute('aria-label', label);
    ui.inventoryToggle.title = label;
  }
  renderXpPotionRecipes();
  const learnedAbilities = new Set(localInventory.learnedAbilities || []);
  const abilityGroup = document.querySelector('[data-ability-group]');
  if (abilityGroup) {
    let visibleActions = 0;
    for (const button of abilityGroup.querySelectorAll('[data-action^="cast:"]')) {
      const abilityId = button.dataset.action.slice(5);
      button.dataset.abilityBaseLabel ||= button.textContent.trim();
      button.dataset.abilityBaseAriaLabel ||= button.getAttribute('aria-label') || button.dataset.abilityBaseLabel;
      button.hidden = !learnedAbilities.has(abilityId);
      if (!button.hidden) {
        const hotkey = visibleActions < 4 ? visibleActions + 1 : null;
        const label = button.dataset.abilityBaseLabel + (hotkey ? ` · Shift+${hotkey}` : '');
        button.dataset.readyLabel = label;
        button.dataset.readyAriaLabel = button.dataset.abilityBaseAriaLabel + (hotkey ? `. Atalho Shift+${hotkey}.` : '');
        button.textContent = label;
        if (hotkey) button.dataset.abilityHotkey = String(hotkey);
        else delete button.dataset.abilityHotkey;
        visibleActions += 1;
      } else {
        button.textContent = button.dataset.abilityBaseLabel;
        delete button.dataset.abilityHotkey;
      }
    }
    abilityGroup.hidden = visibleActions === 0;
  }
  renderAbilityCooldowns();
  syncInventoryGrid(ui.quickbar, Array.from({length:9}, (_, slot) => slot), {quick:true});
  if (!forcePanel && !ui.inventoryDialog.open) return;
  const signature = JSON.stringify([localInventory.slots, localInventory.selectedSlot, localInventory.level, localInventory.xp, localInventory.attributePoints, localInventory.skillPoints, localInventory.attributes, localInventory.learnedAbilities, inventoryStoragePage, inventoryDragSource, localInventory.axeSharpness, localInventory.axeDurability, localInventory.pickaxeDurability, localInventory.gold, localInventory.silver, localInventory.bronze]);
  if (signature === inventoryRenderKey) { renderInventorySelection(); return; }
  const active = document.activeElement;
  const activeSlot = active?.closest?.('[data-inventory-slot]');
  const focusGroup = activeSlot && ui.inventoryDialog.contains(activeSlot)
    ? activeSlot.closest('#inventory-quick-grid') ? 'quick' : 'bag' : null;
  const focusIndex = focusGroup ? activeSlot.dataset.inventorySlot : null;
  const focusEquipAction = active?.id === 'inventory-equip';
  inventoryRenderKey = signature;
  setHudText(ui.bagGold, String(localInventory.gold || 0));
  setHudText(ui.bagSilver, String(localInventory.silver || 0));
  setHudText(ui.bagBronze, String(localInventory.bronze || 0));
  syncInventoryGrid(ui.inventoryQuickGrid, Array.from({length:9}, (_, slot) => slot));
  const unlockedPages = storagePageCountForLevel(localInventory.level || 1);
  inventoryStoragePage = Math.min(inventoryStoragePage, unlockedPages - 1);
  const pageButtons = document.createDocumentFragment();
  for (let page = 0; page < STORAGE_PAGE_UNLOCK_LEVELS.length; page += 1) {
    const button = document.createElement('button');
    const unlocked = page < unlockedPages;
    const unlockFeedback = storagePageUnlockFeedback.get(page + 1) > performance.now();
    button.type = 'button'; button.className = `inventory-page${page === inventoryStoragePage ? ' active' : ''}${unlocked ? '' : ' locked'}${unlockFeedback && unlocked ? ' newly-unlocked' : ''}`;
    button.disabled = !unlocked; button.dataset.storagePage = String(page);
    button.textContent = unlocked ? `Página ${page + 1}` : `Página ${page + 1} · nível ${STORAGE_PAGE_UNLOCK_LEVELS[page]}`;
    button.setAttribute('aria-current', String(page === inventoryStoragePage));
    pageButtons.append(button);
  }
  ui.inventoryPages.replaceChildren(pageButtons);
  const firstStorageSlot = 9 + inventoryStoragePage * 18;
  syncInventoryGrid(ui.inventoryGrid, Array.from({length:18}, (_, offset) => firstStorageSlot + offset));
  const occupied = (localInventory.slots || []).filter(Boolean).length;
  const capacity = localInventory.slots?.length || 27;
  const nextPageLevel = STORAGE_PAGE_UNLOCK_LEVELS[unlockedPages];
  ui.inventoryCapacity.textContent = `${occupied}/${capacity} espaços · ${unlockedPages} ${unlockedPages === 1 ? 'página liberada' : 'páginas liberadas'} · Nível ${localInventory.level || 1}${nextPageLevel ? ` · Próxima página no nível ${nextPageLevel}` : ' · Todas as páginas liberadas'}`;
  const attributeNames = { force:'Força', attack:'Ataque', defense:'Defesa', agility:'Agilidade', magic:'Magia', speed:'Velocidade' };
  const attributeEffects = {
    force:'+1 dano corpo a corpo a cada 10 pontos.', attack:'+1 dano corpo a corpo a cada 5 pontos.',
    defense:'−0,5% de empurrão sofrido por ponto; máximo de 50%.',
    agility:'+0,25% de velocidade por ponto; máximo de 25%.',
    magic:'+1 dano de magia a cada 4 pontos.', speed:'+1% de velocidade por ponto; máximo de 50%.',
  };
  ui.attributePoints.textContent = `${localInventory.attributePoints || 0} pontos disponíveis`;
  const attributeRows = document.createDocumentFragment();
  for (const [key, label] of Object.entries(attributeNames)) {
    const row = document.createElement('div'); row.className = 'attribute-row';
    const name = document.createElement('span'); name.className='attribute-name';
    const title = document.createElement('b'); title.textContent = label;
    const effect = document.createElement('small'); effect.textContent = attributeEffects[key];
    name.append(title,effect);
    const value = document.createElement('b'); value.textContent = String(localInventory.attributes?.[key] || 0);
    const add = document.createElement('button'); add.type = 'button'; add.dataset.allocateAttribute = key;
    add.setAttribute('aria-label', `Aumentar ${label}. ${attributeEffects[key]}`); add.textContent = '+';
    add.disabled = (localInventory.attributePoints || 0) < 1 || (localInventory.attributes?.[key] || 0) >= 100;
    row.append(name, value, add); attributeRows.append(row);
  }
  ui.attributeList.replaceChildren(attributeRows);
  ui.skillPoints.textContent = `${localInventory.skillPoints || 0} pontos disponíveis`;
  const skillRows = document.createDocumentFragment();
  const abilityGroupLabels = { combat:'Combate', 'combat-technique':'Combate', spell:'Magia', buff:'Movimento', evasion:'Movimento', mobility:'Movimento', travel:'Viagem' };
  for (const [abilityId, ability] of Object.entries(PLAYER_ABILITIES)) {
    const row = document.createElement('div'); row.className = 'attribute-row skill-row';
    const detail = document.createElement('span');
    const heading = document.createElement('b');
    heading.textContent = `${ability.label} · ${abilityGroupLabels[ability.kind] || 'Conhecimento'}`;
    const description = document.createElement('small'); description.textContent = ability.description;
    const learned = learnedAbilities.has(abilityId);
    const missing = [];
    if (!learned && (localInventory.level || 1) < ability.minimumLevel) missing.push(`nível ${ability.minimumLevel} (atual ${localInventory.level || 1})`);
    for (const [key, required] of Object.entries(ability.attributes)) {
      const current = localInventory.attributes?.[key] || 0;
      if (!learned && current < required) missing.push(`${attributeNames[key]} ${current}/${required}`);
    }
    for (const required of ability.requires) {
      if (!learned && !learnedAbilities.has(required)) missing.push(`pré-requisito: ${PLAYER_ABILITIES[required]?.label || required}`);
    }
    const availableSkillPoints = localInventory.skillPoints || 0;
    if (!learned && availableSkillPoints < ability.skillPoints) missing.push(`pontos de habilidade ${availableSkillPoints}/${ability.skillPoints}`);
    const requirements = document.createElement('small');
    requirements.textContent = learned ? 'Aprendida.' : missing.length ? `Falta: ${missing.join(' · ')}.` : 'Disponível para aprender.';
    detail.append(heading, description, requirements);
    const learn = document.createElement('button'); learn.type='button'; learn.dataset.learnAbility=abilityId;
    learn.textContent = learned ? 'Aprendida' : missing.length ? 'Bloqueada' : 'Aprender';
    learn.disabled = learned || missing.length > 0;
    learn.setAttribute('aria-label', learned ? `${ability.label}, aprendida.`
      : missing.length ? `${ability.label}, bloqueada. ${missing.join('; ')}.` : `Aprender ${ability.label}.`);
    row.append(detail, learn); skillRows.append(row);
  }
  ui.skillList.replaceChildren(skillRows);
  const inventoryEyebrow = ui.inventoryDialog.querySelector('.inventory-dialog-head .eyebrow');
  const currentLevel = localInventory.level || 1;
  if (inventoryEyebrow) inventoryEyebrow.textContent = currentLevel >= MAX_PLAYER_LEVEL
    ? `NÍVEL ${currentLevel} · NÍVEL MÁXIMO`
    : `NÍVEL ${currentLevel} · ${localInventory.xp || 0}/${xpRequiredForNextLevel(currentLevel)} XP`;
  renderInventorySelection(true);
  if (focusGroup && focusIndex !== null) {
    const group = focusGroup === 'quick' ? ui.inventoryQuickGrid : ui.inventoryGrid;
    group.querySelector(`[data-inventory-slot="${focusIndex}"]`)?.focus({ preventScroll: true });
  } else if (focusEquipAction) ui.inventoryEquip.focus({ preventScroll: true });
}

function renderInventoryDetails() {
  const index = inventorySelectionIndex;
  const stack = Number.isInteger(index) ? localInventory.slots?.[index] : null;
  if (!stack) {
    ui.inventoryDetailIcon.setAttribute('href', '/dev/art/inventory-items.svg#knife');
    ui.inventoryDetailName.textContent = Number.isInteger(index) ? 'Espaço vazio' : 'Escolha um item';
    ui.inventoryDetailMeta.textContent = Number.isInteger(index) ? 'Toque em um item guardado para começar.' : `${localInventory.slots?.length || 27} espaços disponíveis`;
    ui.inventoryDetailUse.textContent = 'Veja o que cada achado faz e como ele pode ajudar na aventura.';
    ui.inventoryEquip.disabled = true;
    ui.inventoryEquip.textContent = 'Levar para acesso rápido';
    return;
  }
  const [label, iconName] = inventoryItemPresentation[stack.itemId] || [stack.itemId, 'stone'];
  const [category, use] = inventoryItemUseFor(stack.itemId);
  const firstStorageSlot = localInventory.slots.findIndex((candidate, slot) => slot >= 9 && !candidate);
  ui.inventoryDetailIcon.setAttribute('href', `/dev/art/inventory-items.svg#${iconName}`);
  ui.inventoryDetailName.textContent = label;
  ui.inventoryDetailMeta.textContent = `${category} · ${stack.quantity} ${stack.quantity === 1 ? 'unidade' : 'unidades'} · ${index < 9 ? `barra ${index + 1}` : 'Inventário'}`;
  ui.inventoryDetailUse.textContent = use;
  const isXpPotion = stack.itemId.startsWith('xpPotion');
  const atMaxLevel = isXpPotion && (localInventory.level || 1) >= MAX_PLAYER_LEVEL;
  ui.inventoryEquip.disabled = isXpPotion ? atMaxLevel || localInventory.level < ({ xpPotionI:1, xpPotionII:5, xpPotionIII:10, xpPotionIV:20 }[stack.itemId] || 99) : (index < 9 && firstStorageSlot < 0);
  ui.inventoryEquip.textContent = isXpPotion ? atMaxLevel ? 'Nível máximo' : 'Beber poção' : index < 9
    ? firstStorageSlot < 0 ? 'Inventário cheio' : 'Guardar no Inventário'
    : `Levar para acesso rápido ${localInventory.selectedSlot + 1}`;
}

function sendInventoryCommand(command) {
  if (!sceneReady) return false;
  const previous = localInventory;
  const predicted = inventoryPrediction.enqueue(previous, command);
  if (!predicted) return false;
  localInventory = predicted.inventory;
  renderInventory();
  updateContextActionLabel();
  if (sendPlayerCommand(predicted.command)) return true;
  inventoryPrediction.cancel(predicted.command.inventorySeq);
  localInventory = previous;
  renderInventory();
  return false;
}

function selectHotbarSlot(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 8) return;
  sendInventoryCommand({ type: 'action', name: 'selectHotbar', slot });
}

function openInventory() {
  inventorySelectionIndex = localInventory.selectedSlot || 0;
  inventoryDragSource = null;
  renderInventory(true);
  panels.open('inventory');
}

function closeInventory() {
  if (panels.current === 'inventory') panels.close();
}

function moveInventorySlot(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= localInventory.slots.length || to < 0 || to >= localInventory.slots.length || from === to) return false;
  const sourceStack = localInventory.slots?.[from];
  if (!sourceStack) return false;
  inventoryDragSource = null;
  inventorySelectionIndex = to;
  return sendInventoryCommand({ type: 'action', name: 'moveInventorySlot', from, to, equip: from >= 9 && to < 9 });
}

function sendInputIfChanged(now, force = false) {
  // Pair the 60 Hz simulation steps into 30 Hz packets. Prediction remains
  // local and immediate, while the server receives the same ordered commands
  // with roughly half the WebSocket framing and repeated JSON fields.
  // Pair commands for 30 Hz packets, but never strand a final odd command
  // after the player releases movement. Flush it after a short batching window.
  if ((!force && outboundInputs.length < 2 && now-lastInputSend < 40)
      || !connectionSnapshotReady || !outboundInputs.length || socket?.readyState !== WebSocket.OPEN) return;
  const commands=outboundInputs.slice(0,12),last=commands.at(-1),first=commands[0];
  if(send({type:'input',location:worldLocation,dimensionId:worldDimensionId,commands})){
    outboundInputs.splice(0,commands.length);lastInputSend=now;
    recordMovementDiagnostic('input-send',{firstSeq:first.seq,lastSeq:last.seq,count:commands.length,
      pending:pendingInputs.length,outbound:outboundInputs.length,bufferedBytes:socket?.bufferedAmount||0,
      x:last.x,y:last.y,run:last.run===true,crouch:last.crouch===true});
  }else if(now-lastSendFailureDiagnosticAt>1000){
    recordMovementDiagnostic('input-send-failed',{firstSeq:first.seq,lastSeq:last.seq,count:commands.length,
      pending:pendingInputs.length,outbound:outboundInputs.length,bufferedBytes:socket?.bufferedAmount||0},true);
    lastSendFailureDiagnosticAt=now;
  }
}

const interactionActionNames = new Set(['collect', 'interact', 'useFurniture']);
const movementActionNames = new Set([...interactionActionNames, 'work', 'hunt', 'castAbility']);
const pendingInteractionCommands = new Map();
let interactionCommandId = 0;

function sendPendingMovementBeforeInteraction() {
  let rounds = 0;
  while (outboundInputs.length && socket?.readyState === WebSocket.OPEN && rounds++ < 12) {
    const remaining = outboundInputs.length;
    sendInputIfChanged(performance.now(), true);
    if (outboundInputs.length >= remaining) break;
  }
}

let pendingRoomTravelTimer=null,pendingRoomTravelRequestId=null,clientRoomEnteredFloor=false;
function beginPendingRoomTravel(requestId=null){
  if(roomTransition.active)return;
  pendingRoomTravelRequestId=requestId;
  roomTransition.start();clearMovement();
  pendingRoomTravelTimer=setTimeout(()=>{
    if(!sceneReady)return;
    roomTransition.cancel();pendingRoomTravelRequestId=null;
    announce('A passagem não foi confirmada. Tente novamente.');
  },12_000);
}
function sendPlayerCommand(message) {
  if (!sceneReady) return false;
  let outgoing = message;
  if (message.type === 'action' && movementActionNames.has(message.name)) {
    sendPendingMovementBeforeInteraction();
    outgoing = { ...message, inputSeq: inputSequence };
  }
  if (message.type === 'action' && interactionActionNames.has(message.name)) {
    const requestId = Number.isSafeInteger(message.requestId) ? message.requestId : ++interactionCommandId;
    outgoing = { ...message, requestId, inputSeq: inputSequence };
    pendingInteractionCommands.set(requestId, { message: outgoing, retries: 0 });
    setTimeout(() => pendingInteractionCommands.delete(requestId), 2400);
  }
  if(message.type==='action'&&worldLocation==='room'&&['placeFurniture','moveFurniture','rotateFurniture','removeFurniture','useFurniture'].includes(message.name)){
    const requestId=Number.isSafeInteger(message.requestId)?message.requestId:++interactionCommandId;
    outgoing={...outgoing,requestId};
    const predicted=roomFurniturePrediction.enqueue([...roomFurniture.values()],outgoing);
    if(predicted){applyRoomFurnitureSnapshot(predicted,{predicted:true});setTimeout(()=>{
      if(roomFurniturePrediction.pending?.requestId!==requestId)return;
      const restored=roomFurniturePrediction.cancel(requestId);if(restored)applyRoomFurnitureSnapshot(restored,{predicted:true});
    },4000);}
  }
  const sent = send(outgoing);
  if(sent&&message.type==='action'&&message.name==='interact'&&nearestInteractionDoor()?.distance<=1.2)
    beginPendingRoomTravel(outgoing.requestId);
  if (!sent && Number.isSafeInteger(outgoing.requestId)) {pendingInteractionCommands.delete(outgoing.requestId);const restored=roomFurniturePrediction.cancel(outgoing.requestId);if(restored)applyRoomFurnitureSnapshot(restored,{predicted:true});}
  if (!sent) announce('A clareira está voltando. Tente de novo daqui a pouco.');
  return sent;
}

function serviceContext() {
  return { location: worldLocation, dimensionId: worldDimensionId, roomKind: worldRoomKind, roomBuildingId: worldRoomBuildingId };
}

function serviceContextKey() {
  return `${worldDimensionId}:${worldLocation}:${worldRoomKey}`;
}

const panels = createPanelController({ beforeOpen: () => clearMovement(), fallbackFocus: () => canvas });
panels.register('inventory', ui.inventoryDialog, { initialFocus: '#inventory-close' });
const settingsDialog = document.querySelector('#settings-dialog');
panels.register('settings', settingsDialog, { initialFocus: '#settings-close' });
const staffTools = {
  toggle: document.querySelector('#staff-tools-toggle'), dialog: document.querySelector('#staff-tools-dialog'),
  home: document.querySelector('#staff-tools-home'), wallet: document.querySelector('#staff-tools-wallet'),
  review: document.querySelector('#staff-tools-review'), walletOpen: document.querySelector('#staff-wallet-open'),
  audit: document.querySelector('#staff-tools-audit'), auditOpen: document.querySelector('#staff-audit-open'),
  auditList: document.querySelector('#staff-audit-list'), auditStatus: document.querySelector('#staff-audit-status'),
  auditMore: document.querySelector('#staff-audit-more'),
  form: document.querySelector('#staff-wallet-form'), status: document.querySelector('#staff-wallet-status'),
  summary: document.querySelector('#staff-review-summary'), reason: document.querySelector('#staff-review-reason'), confirm: document.querySelector('#staff-wallet-confirm'),
};
let staffCapabilities = null, staffSessionGeneration = 0, staffWalletDraft = null, staffWalletPending = false;
let staffAuditRequest = 0, staffAuditBefore = null, staffOverviewRequest = 0;
const staffModeration = createStaffModeration({ dialog: staffTools.dialog, panels, capabilities: () => staffCapabilities, generation: () => staffSessionGeneration });
function clearStaffTools() {
  staffSessionGeneration++; staffOverviewRequest++; staffModeration.reset();
  document.querySelector('#staff-player-form').reset(); document.querySelector('#staff-player-result').replaceChildren(); document.querySelector('#staff-market-result').replaceChildren();
  staffCapabilities = null; staffModeration.sync(null); staffWalletDraft = null; staffTools.toggle.hidden = true;
  staffTools.walletOpen.hidden = true; staffTools.auditOpen.hidden = true; staffTools.form.reset(); staffTools.status.textContent = '';
  staffAuditRequest++; staffAuditBefore = null; staffTools.auditList.replaceChildren(); staffTools.auditStatus.textContent = ''; staffTools.auditMore.hidden = true;
  if (panels.current === 'staff-tools') panels.close();
}
async function refreshStaffCapabilities() {
  const generation = staffSessionGeneration;
  if (!authenticated || currentProfile?.guest) return false;
  try {
    const response = await fetch('/dev/staff/capabilities', { cache: 'no-store' });
    const result = response.ok ? await response.json() : null;
    if (generation !== staffSessionGeneration || !authenticated) return false;
    staffCapabilities = result?.capabilities && Object.values(result.capabilities).some(value => value === true) ? result.capabilities : null;
    staffTools.toggle.hidden = !staffCapabilities;
    staffTools.walletOpen.hidden = !staffCapabilities?.adjustEconomy;
    document.querySelector('#staff-player-open').hidden = !staffCapabilities?.inspectPlayers;
    document.querySelector('#staff-market-open').hidden = !staffCapabilities?.adjustEconomy;
    staffTools.auditOpen.hidden = !staffCapabilities?.readAudit; staffModeration.sync(panels.route);
    if (!staffCapabilities && panels.current === 'staff-tools') panels.close();
    return Boolean(staffCapabilities);
  } catch {
    if (generation === staffSessionGeneration) {
      staffCapabilities = null; staffTools.toggle.hidden = true; staffTools.walletOpen.hidden = true; staffTools.auditOpen.hidden = true;
      if (panels.current === 'staff-tools') panels.close();
    }
    return false;
  }
}
panels.register('staff-tools', staffTools.dialog, {
  initialFocus: '#staff-tools-close',
  render(route) {
    staffTools.home.hidden = route !== 'home'; staffTools.wallet.hidden = route !== 'wallet'; staffTools.review.hidden = route !== 'review'; staffTools.audit.hidden = route !== 'audit';
    document.querySelector('#staff-tools-player').hidden = route !== 'player';
    document.querySelector('#staff-tools-market').hidden = route !== 'market';
    staffModeration.sync(route);
    for (const heading of staffTools.dialog.querySelectorAll('h3')) heading.toggleAttribute('data-panel-heading', !heading.closest('section').hidden);
  },
  onClose() { staffModeration.reset(); staffWalletDraft = null; staffOverviewRequest++; document.querySelector('#staff-player-form').reset(); document.querySelector('#staff-player-result').replaceChildren(); document.querySelector('#staff-market-result').replaceChildren(); staffAuditRequest++; staffAuditBefore = null; staffTools.auditList.replaceChildren(); staffTools.auditStatus.textContent = ''; staffTools.auditMore.hidden = true; },
});
staffTools.toggle.addEventListener('click', async () => {
  if (await refreshStaffCapabilities()) panels.open('staff-tools');
});
document.querySelector('#staff-tools-close').addEventListener('click', () => panels.close());
staffTools.walletOpen.addEventListener('click', () => { staffTools.status.textContent = ''; panels.navigate('wallet'); });
document.querySelector('#staff-player-open').addEventListener('click', () => panels.navigate('player'));
document.querySelector('#staff-market-open').addEventListener('click', () => { panels.navigate('market'); loadStaffMarket(); });
document.querySelector('#staff-player-back').addEventListener('click', () => panels.back());
document.querySelector('#staff-market-back').addEventListener('click', () => panels.back());
function staffResultLine(target, text) { const line = document.createElement('p'); line.textContent = text; target.append(line); }
document.querySelector('#staff-player-form').addEventListener('submit', async event => {
  event.preventDefault(); const request = ++staffOverviewRequest; const output = document.querySelector('#staff-player-result'); const generation = staffSessionGeneration;
  output.textContent = 'Carregando…';
  try {
    const username = event.currentTarget.elements.username.value.trim().toLowerCase();
    const response = await fetch(`/dev/staff/players/${encodeURIComponent(username)}`, { cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Consulta indisponível.');
    if (request !== staffOverviewRequest || generation !== staffSessionGeneration || panels.current !== 'staff-tools' || panels.route !== 'player') return;
    const p = data.player; output.replaceChildren();
    staffResultLine(output, `${p.displayName} · ${p.username} · nível ${p.progression.level} · ${p.progression.xp} XP`);
    staffResultLine(output, `Atributos: ${Object.entries(p.progression.attributes).map(([key, value]) => `${({force:'Força',attack:'Ataque',defense:'Defesa',agility:'Agilidade',magic:'Magia',speed:'Velocidade'})[key] || key} ${value}`).join(' · ')}`);
    staffResultLine(output, `Carteira: ${p.wallet.gold} ouro · ${p.wallet.silver} prata · ${p.wallet.bronze} bronze`);
    staffResultLine(output, `Imóveis: ${p.properties.map(item => `${item.building_id} / ${item.unit_number}${item.tenant_username ? ` · locatário ${item.tenant_username}` : ''}`).join('; ') || 'nenhum'}`);
    staffResultLine(output, `Aluguéis: ${p.leases.map(item => `${item.building_id} / ${item.unit_number} · proprietário ${item.landlord_username || 'não informado'}`).join('; ') || 'nenhum'}`);
    if (staffCapabilities?.adjustEconomy) { const button = document.createElement('button'); button.type = 'button'; button.className = 'staff-secondary-action'; button.textContent = 'Ajustar carteira'; button.addEventListener('click', () => { staffTools.form.elements.username.value = p.username; panels.navigate('wallet'); }); output.append(button); }
  } catch (error) { if (request === staffOverviewRequest && generation === staffSessionGeneration && panels.route === 'player') output.textContent = error.message; }
});
async function loadStaffMarket() {
  const output = document.querySelector('#staff-market-result'); const generation = staffSessionGeneration; output.textContent = 'Carregando…';
  try {
    const response = await fetch('/dev/staff/economy-overview', { cache: 'no-store' }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Mercado indisponível.');
    if (generation !== staffSessionGeneration || panels.current !== 'staff-tools' || panels.route !== 'market') return;
    output.replaceChildren();
    if (!data.goods.length) staffResultLine(output, 'Nenhum produto registrado.');
    for (const item of data.goods) staffResultLine(output, `${item.label || item.item_id}: compra ${item.buy_price_bronze ?? '—'} · venda ${item.sell_price_bronze ?? '—'} · estoque ${item.available}`);
    for (const bank of data.banks) staffResultLine(output, `Banco ${bank.bank_id}: juros ${bank.rate_bps == null ? 'não calculados' : `${Number(bank.rate_bps) / 100}%`}`);
  } catch (error) { if (generation === staffSessionGeneration && panels.route === 'market') output.textContent = error.message; }
}
document.querySelector('#staff-market-refresh').addEventListener('click', loadStaffMarket);
const staffAuditLabels = {
  'role.created':'Cargo criado', 'role.permission.granted':'Permissão concedida', 'role.permission.revoked':'Permissão removida',
  'role.assignment.granted':'Cargo atribuído', 'role.assignment.revoked':'Cargo revogado', 'owner.bootstrapped':'Proprietário inicial definido',
  'owner.expired.bootstrap_recovered':'Acesso inicial recuperado', 'player.report.submitted':'Denúncia enviada',
  'player.report.claim':'Denúncia assumida', 'player.report.resolve':'Denúncia concluída', 'player.report.dismiss':'Denúncia arquivada',
  'player.report.reopen':'Denúncia reaberta', 'player.sanction.warning':'Advertência aplicada', 'player.sanction.mute':'Silenciamento aplicado',
  'player.sanction.kick':'Expulsão aplicada', 'player.sanction.suspend':'Suspensão aplicada', 'player.sanction.ban':'Banimento aplicado',
  'player.sanction.revoked':'Sanção revogada', 'player.wallet.adjusted':'Saldo ajustado',
};
async function loadStaffAudit({ more = false } = {}) {
  if (!staffCapabilities?.readAudit || (more && !staffAuditBefore)) return;
  const request = ++staffAuditRequest, generation = staffSessionGeneration;
  const before = more ? staffAuditBefore : null;
  staffTools.auditStatus.textContent = 'Carregando histórico…'; staffTools.auditMore.hidden = true;
  try {
    const response = await fetch(`/dev/staff/audit?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 403 && request === staffAuditRequest && generation === staffSessionGeneration) {
        staffTools.auditList.replaceChildren(); staffAuditBefore = null; staffTools.auditOpen.hidden = true;
      }
      throw new Error(response.status === 403 ? 'Sua conta não tem mais acesso ao histórico.' : 'Não foi possível carregar o histórico.');
    }
    const result = await response.json();
    if (request !== staffAuditRequest || generation !== staffSessionGeneration || panels.current !== 'staff-tools' || panels.route !== 'audit') return;
    const events = Array.isArray(result.events) ? result.events : [];
    if (!more) staffTools.auditList.replaceChildren();
    for (const entry of events) {
      const item = document.createElement('li'), heading = document.createElement('strong'), time = document.createElement('time'), detail = document.createElement('span'), reason = document.createElement('span');
      const date = new Date(entry.happened_at);
      heading.textContent = staffAuditLabels[entry.action] || entry.action || 'Ação';
      time.textContent = Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
      if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
      detail.textContent = `${entry.actor_username || 'Sistema'}${entry.target_username ? ` → ${entry.target_username}` : ''}`;
      reason.textContent = entry.reason ? `Motivo: ${entry.reason}` : 'Sem motivo informado';
      item.append(time, heading, detail, reason); staffTools.auditList.append(item);
    }
    const last = events.at(-1)?.event_id;
    staffAuditBefore = last != null && /^\d+$/u.test(String(last)) ? String(last) : null;
    staffTools.auditMore.hidden = events.length < 20 || !staffAuditBefore;
    staffTools.auditStatus.textContent = events.length ? '' : more ? 'Não há ações anteriores.' : 'Nenhuma ação registrada.';
  } catch (error) {
    if (request !== staffAuditRequest || generation !== staffSessionGeneration || panels.current !== 'staff-tools' || panels.route !== 'audit') return;
    staffTools.auditStatus.textContent = error.message || 'Não foi possível carregar o histórico.';
    staffTools.auditMore.hidden = !more || !staffAuditBefore;
  }
}
staffTools.auditOpen.addEventListener('click', () => { panels.navigate('audit'); void loadStaffAudit(); });
document.querySelector('#staff-audit-back').addEventListener('click', () => { staffAuditRequest++; panels.back(); });
document.querySelector('#staff-audit-refresh').addEventListener('click', () => void loadStaffAudit());
staffTools.auditMore.addEventListener('click', () => void loadStaffAudit({ more: true }));

document.querySelector('#staff-wallet-back').addEventListener('click', () => panels.back());
document.querySelector('#staff-review-back').addEventListener('click', () => panels.back());
staffTools.form.addEventListener('submit', event => {
  event.preventDefault();
  if (!staffCapabilities?.adjustEconomy || staffWalletPending || !staffTools.form.reportValidity()) return;
  const fields = new FormData(staffTools.form);
  const username = String(fields.get('username')).trim().toLowerCase();
  const operation = String(fields.get('operation')), amount = Number(fields.get('amount'));
  const reason = String(fields.get('reason')).trim();
  if (!reason || !Number.isSafeInteger(amount) || amount < 1 || amount > 21474836479999) {
    staffTools.status.textContent = 'Informe um motivo e uma quantidade válida.'; return;
  }
  staffWalletDraft = { username, operation, amount, reason };
  staffTools.reason.textContent = reason;
  staffTools.confirm.dataset.operation = operation;
  staffTools.confirm.textContent = operation === 'credit' ? 'Adicionar moedas' : 'Retirar moedas';
  staffTools.summary.textContent = `${operation === 'credit' ? 'Adicionar' : 'Retirar'} ${amount.toLocaleString('pt-BR')} moedas ${operation === 'credit' ? 'à' : 'da'} conta @${username}.`;
  panels.navigate('review');
});
staffTools.confirm.addEventListener('click', async () => {
  if (!staffWalletDraft || staffWalletPending || !staffCapabilities?.adjustEconomy) return;
  const draft = staffWalletDraft, generation = staffSessionGeneration;
  staffWalletDraft = null; staffWalletPending = true; staffTools.confirm.disabled = true;
  staffTools.confirm.textContent = 'Aguardando servidor…';
  staffTools.review.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/dev/staff/wallet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível ajustar a carteira.');
    if (generation !== staffSessionGeneration) return;
    staffTools.form.reset();
    staffTools.status.textContent = `Saldo de @${result.username}: ${result.wallet.gold} ouro, ${result.wallet.silver} prata e ${result.wallet.bronze} bronze. Ajuste registrado.`;
  } catch (error) {
    if (generation !== staffSessionGeneration) return;
    staffTools.status.textContent = error instanceof TypeError || error instanceof SyntaxError
      ? 'Não foi possível confirmar o resultado. Consulte a auditoria antes de tentar novamente.'
      : (error.message || 'Não foi possível ajustar a carteira.');
  } finally {
    staffWalletPending = false; staffTools.confirm.disabled = false;
    staffTools.confirm.textContent = 'Confirmar ajuste'; staffTools.review.removeAttribute('aria-busy');
    if (generation === staffSessionGeneration && panels.current === 'staff-tools' && panels.route === 'review') panels.back();
  }
});

panels.register('world-map',mapUi.dialog,{initialFocus:'#world-map-search',render:drawWorldMapPanel});
function currentWorldMapMarkers(){
 const result=mapMarkers(worldMapOverview),ids=new Set(result.map(marker=>marker.id));
 if(worldDimensionId==='surface')for(const building of VILLAGE_BUILDINGS){
  const id='building-'+building.id;if(ids.has(id))continue;ids.add(id);
  result.push({id,x:(building.bounds.left+building.bounds.right)/2,y:(building.bounds.top+building.bounds.bottom)/2,category:'places',name:building.name||'Construção',kind:building.kind||'place'});
 }
 for(const fire of fires.values()){
  if(!Number.isFinite(fire.x)||!Number.isFinite(fire.y))continue;
  const id='fire-'+String(fire.id);if(ids.has(id))continue;ids.add(id);
  result.push({id,x:fire.x,y:fire.y,category:'fires',name:fire.name||'Fogueira',kind:'campfire'});
 }
 return result;
}
function activeMapExploration(dimensionId=worldDimensionId){
 let explored=worldMapExplorationByDimension.get(dimensionId);
 if(!explored){explored=new Set();worldMapExplorationByDimension.set(dimensionId,explored);}
 return explored;
}
function updateMapExploration(position,dimensionId=worldDimensionId){
 if(worldLocation!=='clearing'||!Number.isFinite(position?.x)||!Number.isFinite(position?.y))return;
 const explored=activeMapExploration(dimensionId),added=discoverWorldMapCells(position,worldMapGrid,explored,mapDiscoveryRadiusForAbilities(localInventory.learnedAbilities));
 if(added.length){worldMapStatusNotice='';requestMiniMapRedraw();if(mapUi.dialog.open)requestWorldMapRedraw();}
}
function mergeMapExploration(message){
 if(typeof message.dimensionId!=='string'||!Array.isArray(message.chunks))return;
 const explored=activeMapExploration(message.dimensionId),added=mergeWorldMapExploration(explored,message.chunks,worldMapGrid);
 if(added.length){requestMiniMapRedraw();if(mapUi.dialog.open&&message.dimensionId===worldDimensionId)requestWorldMapRedraw();}
}
function drawMiniMap(){
 if(!sceneReady||!mapUi.miniMap||mapUi.miniMap.hidden||mapUi.dialog.open||worldLocation!=='clearing')return;
 const definition=getWorldDefinition(),key=worldMapKeyFor(worldDimensionId,definition);
 if(key!==worldMapOverviewKey){
  const overview=getCachedWorldMapOverview(worldDimensionId,definition);
  if(!overview){mapUi.miniCanvas.getContext('2d')?.clearRect(0,0,mapUi.miniCanvas.width,mapUi.miniCanvas.height);mapUi.miniStatus.textContent='Preparando mapa…';return;}
  worldMapOverview=overview;worldMapOverviewKey=key;worldMapMarkers=currentWorldMapMarkers();worldMapSelection=null;miniMapView={zoom:5,panX:0,panY:0};
 }
 else worldMapMarkers=currentWorldMapMarkers();
 const rect=mapUi.miniCanvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
 const ratio=Math.min(1.25,window.devicePixelRatio||1),width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
 if(mapUi.miniCanvas.width!==width||mapUi.miniCanvas.height!==height){mapUi.miniCanvas.width=width;mapUi.miniCanvas.height=height;}
 const context=mapUi.miniCanvas.getContext('2d');if(!context)return;context.setTransform(ratio,0,0,ratio,0,0);
 const view=centerWorldMapOn({...miniMapView,zoom:5},localPosition,{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height});
 const explored=activeMapExploration(),selectedMarkerId=worldMapSelection?.marker?.id;
 const miniMarkers=selectedMarkerId?worldMapMarkers.filter(marker=>marker.id!==selectedMarkerId):worldMapMarkers;
 const waypoint=worldMapSelection?{x:worldMapSelection.x,y:worldMapSelection.y}:null;
 drawWorldMap(context,{overview:worldMapOverview,width:rect.width,height:rect.height,view,player:localPosition,waypoint,markers:miniMarkers,filters:worldMapFilters,discoveredChunks:explored,revealAll:worldMapRevealAll,compact:true});
 mapUi.miniStatus.textContent=worldMapExplorationLabel(explored,worldMapOverview,{revealAll:worldMapRevealAll});
 mapUi.miniMap.setAttribute('aria-label',worldMapSelection?`Abrir minimapa e mapa completo. Destino marcado: ${worldMapSelection.name}.`:'Abrir minimapa e mapa completo');
}
function requestMiniMapRedraw(){
 if(!sceneReady||!mapUi.miniMap||mapUi.miniMap.hidden||mapUi.dialog.open||miniMapRedrawPending)return;
 miniMapRedrawPending=true;requestAnimationFrame(()=>{miniMapRedrawPending=false;const now=performance.now(),wait=Math.max(0,100-(now-miniMapRedrawAt));if(wait){setTimeout(requestMiniMapRedraw,wait);return;}miniMapRedrawAt=now;drawMiniMap();});
}
function focusInitialForestMap(features=null){
 if(!features){
  const spawn=dimensionList.find(item=>item.id===worldDimensionId)?.spawn||localPosition;
  features={bounds:worldDimensionId==='surface'?initialForestMapBounds():{left:Math.max(0,spawn.x-64),top:Math.max(0,spawn.y-64),right:Math.min(worldMapOverview.worldSize,spawn.x+64),bottom:Math.min(worldMapOverview.worldSize,spawn.y+64)}};
 }
 const rect=mapUi.canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
 const bounds=features?.bounds;if(!bounds)return;
 const worldSize=worldMapOverview.worldSize,base=worldMapTransform({worldSize,width:rect.width,height:rect.height,zoom:1}).scale;
 const width=Math.max(1,bounds.right-bounds.left),height=Math.max(1,bounds.bottom-bounds.top);
 const targetScale=Math.min((rect.width-56)/width,(rect.height-56)/height);
 const zoom=Math.max(1,Math.min(WORLD_MAP_MAX_ZOOM,targetScale/Math.max(.0001,base)));
 worldMapView=centerWorldMapOn({zoom,panX:0,panY:0},{x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2},{worldSize,width:rect.width,height:rect.height});
 worldMapCanvasSize={width:rect.width,height:rect.height};
}
function drawWorldMapPanel(){
 if(!mapUi.dialog.open||!worldMapOverview)return;
 const rect=mapUi.canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
 if(worldMapCanvasSize&&(Math.abs(worldMapCanvasSize.width-rect.width)>1||Math.abs(worldMapCanvasSize.height-rect.height)>1)){
  const oldTransform=worldMapTransform({worldSize:worldMapOverview.worldSize,...worldMapCanvasSize,...worldMapView});
  const center=screenToWorldMap({x:worldMapCanvasSize.width/2,y:worldMapCanvasSize.height/2},oldTransform);
  worldMapView=centerWorldMapOn(worldMapView,center,{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height});
 }
 worldMapCanvasSize={width:rect.width,height:rect.height};
 const ratio=Math.min(1.5,window.devicePixelRatio||1),width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
 if(mapUi.canvas.width!==width||mapUi.canvas.height!==height){mapUi.canvas.width=width;mapUi.canvas.height=height;}
 const context=mapUi.canvas.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);
 const search=mapUi.search.value,explored=activeMapExploration();
 const detailTransform=worldMapTransform({worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height,...worldMapView});
 const bounds=worldMapDetailBounds(detailTransform,{width:rect.width,height:rect.height,worldSize:worldMapOverview.worldSize});
 const detailFeatures=[];
 let detailTiles=[],detailFailed=false;
 if(bounds){
  const geometry=worldGeometryCacheKey(getWorldDefinition());
  worldMapDetailPrefix=`${worldDimensionId}:${objectCatalogRevision()}:${geometry}:`;
  const center=screenToWorldMap({x:rect.width/2,y:rect.height/2},detailTransform);
  detailTiles=worldMapDetailTiles(bounds,worldMapOverview.worldSize).map(tile=>({
   bounds:tile,key:worldMapDetailPrefix+`${tile.left}:${tile.top}:${tile.right}:${tile.bottom}`,
   distance:Math.hypot((tile.left+tile.right)/2-center.x,(tile.top+tile.bottom)/2-center.y),
  })).sort((a,b)=>a.distance-b.distance);
  worldMapDetailDesired=new Set(detailTiles.map(tile=>tile.key));
  if(worldMapDetailFailedKey&&!worldMapDetailDesired.has(worldMapDetailFailedKey))worldMapDetailFailedKey='';
  for(const tile of detailTiles){
   const cached=worldMapDetailCache.get(tile.key);
   if(cached){worldMapDetailCache.delete(tile.key);worldMapDetailCache.set(tile.key,cached);detailFeatures.push(cached);}
  }
  detailFailed=worldMapDetailDesired.has(worldMapDetailFailedKey);
  const next=detailTiles.find(tile=>!worldMapDetailCache.has(tile.key)&&tile.key!==worldMapDetailFailedKey);
  if(next&&!worldMapDetailPendingKey&&!detailFailed){
   const key=next.key;
   worldMapDetailPendingKey=key;
   void buildWorldMapDetailFeatures(next.bounds,{shouldCancel:()=>!mapUi.dialog.open||!worldMapDetailDesired.has(key)})
    .then(features=>{
     if(mapUi.dialog.open&&worldMapDetailDesired.has(key)){
      worldMapDetailCache.set(key,features);
      while(worldMapDetailCache.size>96)worldMapDetailCache.delete(worldMapDetailCache.keys().next().value);
     }
     if(worldMapDetailPendingKey===key)worldMapDetailPendingKey='';
     if(mapUi.dialog.open)requestWorldMapRedraw();
    }).catch(error=>{
     if(worldMapDetailPendingKey===key)worldMapDetailPendingKey='';
     if(error.name!=='AbortError'&&worldMapDetailDesired.has(key)){worldMapDetailFailedKey=key;worldMapStatusNotice='Não foi possível preparar esta região. Mova o mapa para tentar novamente.';}
     if(mapUi.dialog.open)requestWorldMapRedraw();
    });
  }
 }else{worldMapDetailDesired=new Set();worldMapDetailPrefix='';worldMapDetailFailedKey='';}
 const complete=Boolean(bounds)&&detailFeatures.length===detailTiles.length;
 mapUi.canvas.dataset.detail=complete?'ready':detailFailed?'error':detailFeatures.length?'partial':bounds?'loading':'overview';
 mapUi.canvas.dataset.detailLoaded=String(detailFeatures.length);
 mapUi.canvas.dataset.detailTotal=String(detailTiles.length);
 const detailStatus=document.getElementById('world-map-detail-status');
 if(detailStatus)detailStatus.textContent=complete?(detailTransform.scale>=3?'Copas e terreno':'Terreno e trilhas'):detailFailed?'Mova o mapa para tentar novamente':bounds?`Preparando detalhes ${detailFeatures.length}/${detailTiles.length}`:'Visão geral · aproxime para ver o terreno';
 const zoomControl=document.getElementById('world-map-zoom-range');
 if(zoomControl)zoomControl.value=String(Math.log(worldMapView.zoom/.65)/Math.log(WORLD_MAP_MAX_ZOOM/.65)*100);
 const zoomValue=document.getElementById('world-map-zoom-value');if(zoomValue)zoomValue.textContent=worldMapView.zoom.toFixed(worldMapView.zoom<10?1:0)+'×';
 document.getElementById('world-map-zoom-in').disabled=worldMapView.zoom>=WORLD_MAP_MAX_ZOOM;
 document.getElementById('world-map-zoom-out').disabled=worldMapView.zoom<=.65;
 const detailFires=worldMapMarkers.filter(marker=>marker.category==='fires');
 for(const features of detailFeatures)features.fires=detailFires;
 const rendered=drawWorldMap(context,{overview:worldMapOverview,width:rect.width,height:rect.height,view:worldMapView,
  player:localPosition,waypoint:worldMapSelection&&!worldMapSelection.marker?worldMapSelection:null,
  markers:worldMapMarkers,filters:worldMapFilters,search,discoveredChunks:explored,revealAll:worldMapRevealAll,selectedId:worldMapSelection&&worldMapSelection.marker?worldMapSelection.marker.id:null,detailFeatures});
 worldMapTransformState=rendered.transform;
 const matches=visibleWorldMapMarkers(worldMapMarkers,worldMapOverview,explored,{filters:worldMapFilters,search,revealAll:worldMapRevealAll}).slice(0,12);
 mapUi.results.replaceChildren();
 if(matches.length)for(const item of matches){
  const button=document.createElement('button');button.type='button';button.className='map-result';
  button.setAttribute('aria-pressed',String(worldMapSelection&&worldMapSelection.marker&&worldMapSelection.marker.id===item.id));
  const name=document.createElement('span');name.textContent=item.name;
  const category=document.createElement('small');category.textContent=mapCategoryLabel(item.category);
  button.append(name,category);button.addEventListener('click',()=>selectWorldMapMarker(item,true));mapUi.results.append(button);
 }else if(search){const empty=document.createElement('p');empty.className='map-empty';empty.textContent='Nenhum lugar conhecido com esse nome.';mapUi.results.append(empty);}
 const selected=worldMapSelection;
 mapUi.placeName.textContent=selected?selected.name:'Escolha um lugar';
 mapUi.placeMeta.textContent=selected?(selected.marker?mapCategoryLabel(selected.marker.category):'Ponto marcado')+' · '+mapUi.dimension.textContent:'Toque no mapa ou busque um local conhecido.';
 mapUi.placeCoords.textContent=selected?'X '+selected.x.toFixed(1)+' · Y '+selected.y.toFixed(1)+' · '+Math.round(Math.hypot(selected.x-localPosition.x,selected.y-localPosition.y))+' células de você':'';
 const selectedKnown=Boolean(selected&&(worldMapRevealAll||isWorldMapCellKnown(selected,worldMapOverview,explored)));
 mapUi.go.disabled=!selected||!selectedKnown;const canTeleport=Boolean(localInventory?.learnedAbilities?.includes('universalTeleport'));const cooldownRemaining=Math.max(0,dimensionTravelCooldownUntil-clientServerTime());mapUi.teleport.disabled=!selected||!selectedKnown||!canTeleport||dimensionTravelStarting||dimensionTravelRequestPending||!teleportTravelReady()||cooldownRemaining>0;mapUi.teleport.textContent=canTeleport?'Teletransportar':'Teletransporte · Nv. 20';mapUi.teleportNote.textContent=!canTeleport?'Aprenda no nível 20 com Agilidade 8, Magia 10 e 3 pontos de habilidade.':!selected?'Escolha um destino; a chegada será ajustada a um ponto seguro.':cooldownRemaining>0?'Disponível em '+Math.ceil(cooldownRemaining/1000)+' s.':!teleportTravelReady()?'Preparando o efeito de viagem…':'A chegada será ajustada a um ponto seguro.';mapUi.status.textContent=selected?selected.name+', coordenadas '+Math.round(selected.x)+', '+Math.round(selected.y)+'.':worldMapStatusNotice||'As áreas pretas ainda não foram exploradas.';
 mapUi.revealAll.setAttribute('aria-pressed',String(worldMapRevealAll));mapUi.revealAll.textContent=worldMapRevealAll?'Voltar à exploração':'Revelar tudo';
}
function mapCategoryLabel(category){return({fires:'Fogueira',places:'Lugar conhecido',water:'Água',resources:'Área de recursos'})[category]||'Lugar';}
function requestWorldMapRedraw(){if(worldMapRedrawPending)return;worldMapRedrawPending=true;requestAnimationFrame(()=>{worldMapRedrawPending=false;drawWorldMapPanel();});}
function selectWorldMapMarker(marker,center=false){
 worldMapStatusNotice='';worldMapSelection={x:marker.x,y:marker.y,name:marker.name,marker};
 if(center&&worldMapTransformState){const rect=mapUi.canvas.getBoundingClientRect();worldMapView=centerWorldMapOn({...worldMapView,zoom:Math.max(32,worldMapView.zoom)},marker,{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height});}
 drawWorldMapPanel();
}
function openWorldMap({localDetail=false}={}){
 if(!sceneReady||!authenticated||worldLocation!=='clearing'||dimensionTransitMovementLocked())return;
 const definition=getWorldDefinition(),key=worldMapKeyFor(worldDimensionId,definition);
 const shouldCenter=key!==worldMapViewKey;
 if(shouldCenter){
  const overview=getCachedWorldMapOverview(worldDimensionId,definition);
  if(!overview){pendingWorldMapOpen={key,options:{localDetail}};mapUi.miniStatus.textContent='Preparando mapa…';return;}
  worldMapOverview=overview;worldMapOverviewKey=key;worldMapView={zoom:32,panX:0,panY:0};worldMapSelection=null;
 }
if(localDetail){worldMapView={zoom:30,panX:0,panY:0};worldMapStatusNotice='';}
 worldMapMarkers=currentWorldMapMarkers();
 mapUi.dimension.textContent=dimensionList.find(item=>item.id===worldDimensionId)?.name||ui.worldTitle.textContent||'Mundo atual';
 document.getElementById('world-map-initial-forest').textContent=worldDimensionId==='surface'?'Bosque inicial':'Área inicial';
 panels.open('world-map');requestAnimationFrame(()=>{
  if(shouldCenter||localDetail){const rect=mapUi.canvas.getBoundingClientRect();if(localDetail)focusInitialForestMap();else worldMapView=centerWorldMapOn(worldMapView,localPosition,{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height});worldMapCanvasSize={width:rect.width,height:rect.height};worldMapViewKey=key;}
  drawWorldMapPanel();
 });
}
ui.worldMapToggle.addEventListener('click',()=>{document.querySelector('.dimension-travel').open=false;openWorldMap();});
mapUi.miniMap.addEventListener('click',()=>openWorldMap({localDetail:true}));
mapUi.revealAll.addEventListener('click',()=>{worldMapRevealAll=!worldMapRevealAll;worldMapStatusNotice=worldMapRevealAll?'Visão completa ativada. A exploração salva continua igual.':'';if(!worldMapRevealAll&&worldMapSelection&&!isWorldMapCellKnown(worldMapSelection,worldMapOverview,activeMapExploration()))worldMapSelection=null;requestWorldMapRedraw();requestMiniMapRedraw();});
document.querySelector('#world-map-close').addEventListener('click',()=>panels.close());
mapUi.dialog.addEventListener('close',()=>requestMiniMapRedraw());
function zoomWorldMapAtViewportCenter(factor){
 const rect=mapUi.canvas.getBoundingClientRect();if(rect.width<1||rect.height<1||!worldMapOverview)return;
 const point={x:rect.width/2,y:rect.height/2};
 const transform=worldMapTransform({worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height,...worldMapView});
 const anchor=screenToWorldMap(point,transform);
 worldMapView=zoomWorldMapAround(worldMapView,anchor,point,worldMapView.zoom*factor,{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height});
 requestWorldMapRedraw();
}
document.querySelector('#world-map-zoom-in').addEventListener('click',()=>zoomWorldMapAtViewportCenter(1.35));
document.querySelector('#world-map-zoom-out').addEventListener('click',()=>zoomWorldMapAtViewportCenter(1/1.35));
const mapZoomRange=document.getElementById('world-map-zoom-range');
mapZoomRange?.addEventListener('input',()=>{const target=.65*Math.pow(WORLD_MAP_MAX_ZOOM/.65,Number(mapZoomRange.value)/100);zoomWorldMapAtViewportCenter(target/worldMapView.zoom);});
const mapLegend=document.querySelector('details.map-legend');
if(mapLegend&&matchMedia('(max-width:760px)').matches)mapLegend.open=false;
document.querySelector('#world-map-reset').addEventListener('click',()=>{worldMapView={zoom:1,panX:0,panY:0};requestWorldMapRedraw();});
document.querySelector('#world-map-initial-forest').addEventListener('click',()=>{focusInitialForestMap();requestWorldMapRedraw();});
document.querySelector('#world-map-center-player').addEventListener('click',()=>{const rect=mapUi.canvas.getBoundingClientRect();worldMapView=centerWorldMapOn({...worldMapView,zoom:Math.max(32,worldMapView.zoom)},localPosition,{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height});requestWorldMapRedraw();});
mapUi.search.addEventListener('input',requestWorldMapRedraw);
document.querySelector('#world-map-search-form').addEventListener('submit',event=>{event.preventDefault();const found=visibleWorldMapMarkers(worldMapMarkers,worldMapOverview,activeMapExploration(),{filters:worldMapFilters,search:mapUi.search.value,revealAll:worldMapRevealAll});if(found[0])selectWorldMapMarker(found[0],true);else{worldMapSelection=null;worldMapStatusNotice='Nenhum lugar conhecido com esse nome.';requestWorldMapRedraw();}});
for(const checkbox of mapUi.dialog.querySelectorAll('[data-map-filter]'))checkbox.addEventListener('change',()=>{worldMapFilters[checkbox.dataset.mapFilter]=checkbox.checked;requestWorldMapRedraw();});
mapUi.go.addEventListener('click',()=>{if(!worldMapSelection||(!worldMapRevealAll&&!isWorldMapCellKnown(worldMapSelection,worldMapOverview,activeMapExploration())))return;const target={x:worldMapSelection.x,y:worldMapSelection.y},name=worldMapSelection.name;panels.close();if(requestWalkPath(target))announce('Caminho marcado para '+name+'.');});
mapUi.teleport.addEventListener('click',()=>{const selected=worldMapSelection;if(!selected||!localInventory?.learnedAbilities?.includes('universalTeleport')||dimensionTravelStarting||dimensionTravelRequestPending||!teleportTravelReady()||dimensionTravelCooldownUntil>clientServerTime())return;panels.close();dimensionTravelStarting=true;dimensionTravelRequestPending=true;clearDimensionTransitMovement();teleportEffects.beginLocal(selfId,selected.name);pendingDimensionTravelRequestId=++dimensionTravelRequestSequence;requestWorldMapRedraw();if(!send({type:'dimensionTravel',dimensionId:worldDimensionId,universalTeleport:true,x:selected.x,y:selected.y,requestId:pendingDimensionTravelRequestId})){dimensionTravelRequestPending=false;pendingDimensionTravelRequestId=null;dimensionTravelStarting=false;teleportEffects.cancelLocal();updateDimensionTravel(dimensionList,worldDimensionId);placePanel.notice('A conexão caiu antes do teletransporte começar.');}});
function worldMapCanvasPoint(clientX,clientY){const rect=mapUi.canvas.getBoundingClientRect();return{x:clientX-rect.left,y:clientY-rect.top};}
function worldMapBounds(){const rect=mapUi.canvas.getBoundingClientRect();return{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height};}
function beginWorldMapPinch(){
 const first=[...worldMapPointers.entries()].slice(0,2);if(first.length<2)return false;
 const [[firstId,a],[secondId,b]]=first,midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 const bounds=worldMapBounds(),view={...worldMapView},transform=worldMapTransform({...bounds,...view});
 worldMapPinch={ids:[firstId,secondId],distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),view,anchor:screenToWorldMap(worldMapCanvasPoint(midpoint.x,midpoint.y),transform)};
 worldMapDrag=null;return true;
}
function resumeWorldMapSinglePointer(){
 const remaining=[...worldMapPointers.entries()][0];worldMapPinch=null;worldMapDrag=null;
 if(remaining){const[id,point]=remaining;worldMapDrag={id,x:point.x,y:point.y,panX:worldMapView.panX,panY:worldMapView.panY,moved:true};}
}
mapUi.canvas.addEventListener('wheel',event=>{
 event.preventDefault();const rect=mapUi.canvas.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top};
 const bounds={worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height};
 const anchor=screenToWorldMap(point,worldMapTransform({...bounds,...worldMapView}));
 worldMapView=zoomWorldMapAround(worldMapView,anchor,point,worldMapView.zoom*(event.deltaY<0?1.15:1/1.15),bounds);requestWorldMapRedraw();
},{passive:false});
mapUi.canvas.addEventListener('pointerdown',event=>{
 if(event.pointerType==='mouse'&&event.button!==0)return;event.preventDefault();
 try{mapUi.canvas.setPointerCapture(event.pointerId);}catch{}
 worldMapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(worldMapPointers.size>=2){beginWorldMapPinch();return;}
 worldMapDrag={id:event.pointerId,x:event.clientX,y:event.clientY,panX:worldMapView.panX,panY:worldMapView.panY,moved:false};
});
mapUi.canvas.addEventListener('pointermove',event=>{
 if(!worldMapPointers.has(event.pointerId))return;worldMapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(worldMapPinch&&worldMapPinch.ids.every(id=>worldMapPointers.has(id))){
  const a=worldMapPointers.get(worldMapPinch.ids[0]),b=worldMapPointers.get(worldMapPinch.ids[1]),midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),point=worldMapCanvasPoint(midpoint.x,midpoint.y);
  worldMapView=zoomWorldMapAround(worldMapPinch.view,worldMapPinch.anchor,point,worldMapPinch.view.zoom*distance/worldMapPinch.distance,worldMapBounds());requestWorldMapRedraw();return;
 }
 if(!worldMapDrag||event.pointerId!==worldMapDrag.id)return;
 const dx=event.clientX-worldMapDrag.x,dy=event.clientY-worldMapDrag.y;if(Math.hypot(dx,dy)>3)worldMapDrag.moved=true;
 if(worldMapDrag.moved){worldMapView.panX=worldMapDrag.panX+dx;worldMapView.panY=worldMapDrag.panY+dy;requestWorldMapRedraw();}
});
mapUi.canvas.addEventListener('pointerup',event=>{
 const wasPinching=Boolean(worldMapPinch);worldMapPointers.delete(event.pointerId);
 if(wasPinching){resumeWorldMapSinglePointer();return;}
 const drag=worldMapDrag;if(!drag||event.pointerId!==drag.id){if(!worldMapPointers.size)worldMapDrag=null;return;}
 worldMapDrag=null;worldMapPointers.clear();if(drag.moved)return;
 const rect=mapUi.canvas.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top},visible=visibleWorldMapMarkers(worldMapMarkers,worldMapOverview,activeMapExploration(),{filters:worldMapFilters,search:mapUi.search.value,revealAll:worldMapRevealAll});
 const found=hitTestWorldMapMarker(point,visible,worldMapTransformState||worldMapTransform({worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height,...worldMapView}),14,{selectedId:worldMapSelection?.marker?.id});
 if(found?.cluster){worldMapView=centerWorldMapOn({...worldMapView,zoom:Math.min(WORLD_MAP_MAX_ZOOM,Math.max(worldMapView.zoom*1.7,worldMapView.zoom+.75))},found,{worldSize:worldMapOverview.worldSize,width:rect.width,height:rect.height});requestWorldMapRedraw();return;}
 if(found){selectWorldMapMarker(found);return;}
 const world=screenToWorldMap(point,worldMapTransformState);world.x=Math.max(0,Math.min(worldMapOverview.worldSize-.1,world.x));world.y=Math.max(0,Math.min(worldMapOverview.worldSize-.1,world.y));
 if(!worldMapRevealAll&&!isWorldMapCellKnown(world,worldMapOverview,activeMapExploration())){worldMapSelection=null;worldMapStatusNotice='Esta área ainda está encoberta. Explore-a a pé ou escolha Revelar tudo.';drawWorldMapPanel();return;}
 worldMapStatusNotice='';worldMapSelection={x:world.x,y:world.y,name:'Ponto marcado',marker:null};drawWorldMapPanel();
});
mapUi.canvas.addEventListener('pointercancel',event=>{worldMapPointers.delete(event.pointerId);if(worldMapPinch||worldMapPointers.size)resumeWorldMapSinglePointer();else worldMapDrag=null;});
new ResizeObserver(requestWorldMapRedraw).observe(mapUi.canvas);
const placePanel = createPlacePanel({
  dialog: ui.lodgingDialog, controller: panels,
  getState: () => ({ guest: currentProfile?.guest === true, inventory: localInventory,
    worldTime:gameDayTimestampMs(), claim: activeLodgingClaim, claims:lodgingClaims, lodgingLeases, propertyRequests, propertyRentalListings, lodgingLease: activeLodgingLease, recurringLeasesAvailable, contracts: resourceContracts, marketQuotes,
    cabinKeys, issuedCabinKeys, cabinOccupancy, propertyListings, governmentTaxPanel }),
  onAction: (message, point) => {
    const nearby = nearestReceptionService();
    if (!sceneReady || nearby?.key !== point.key || !placeServiceAllowsAction(nearby, message)) {
      panels.close(); announce('Aproxime-se do ponto de atendimento para usar este serviço.'); return false;
    }
    return sendPlayerCommand(message);
  },
});

function refreshLodgingDialog() {
  placePanel.refresh(nearestReceptionService(), serviceContextKey());
}

function nearestWildlifeTarget(position=localPosition,maxDistance=1.45) {
  if(worldLocation!=='clearing')return null;
  let nearest=null,gap=maxDistance;
  for(const animal of wildlife.values()){
    if(animal.health<=0||animal.sheltered)continue;
    const distance=Math.hypot(position.x-animal.x,position.y-animal.y);
    if(distance>=gap)continue;
    const definition=WILDLIFE_BY_ID.get(animal.speciesId);
    if(maxDistance<=1.45&&definition&&!hasClearInteractionPath(position,animal,{fires:[...fires.values()],targetRadius:definition.stats.radius}))continue;
    nearest=animal;gap=distance;
  }
  return nearest?{...nearest,distance:gap}:null;
}

function nearestVisitTarget() {
  if (worldLocation !== 'clearing') return null;
  let nearest = null;
  let distance = 1.35;
  for (const player of livePlayers.values()) {
    if (player.id === selfId || player.location !== 'clearing'
        || (!canOwnerVisitHomes && (player.hasLodging !== true || player.privateLodging))) continue;
    const candidate = Math.hypot(localPosition.x - player.x, localPosition.y - player.y);
    if (candidate < distance && hasClearInteractionPath(localPosition, player, {
      targetRadius: PLAYER_RADIUS, ignoreFires: true,
    })) { nearest = player; distance = candidate; }
  }
  return nearest;
}

function nearestInteractionDoor() {
  if (worldLocation === 'room') {
    const roomDoor=currentRoomLayout().door;
    const door = { ...roomDoor, kind: 'room', distance: Math.hypot(localPosition.x - roomDoor.x, localPosition.y - roomDoor.y) };
    return door.distance <= 1.5 && hasClearInteractionPath(localPosition, door, {
      location: 'room', furniture: [...roomFurniture.values()], roomLayout: currentRoomLayout(),
    }) ? door : null;
  }
  if (worldDimensionId !== 'surface') return null;
  const interactionFires = [...fires.values()];
  const doors = [{ x: CLEARING_DOOR.x, y: CLEARING_DOOR.y, kind: 'arrival', name: 'Recepção da Vila' },
    ...VILLAGE_BUILDINGS.filter(building=>building.door.enabled!==false).map(building => ({ ...building.door, kind: 'lobby', name: building.name, buildingId: building.id, private: isCabin(building.id) }))];
  return doors.map(door => ({ ...door, distance: Math.hypot(localPosition.x - door.x, localPosition.y - door.y) }))
    .filter(door => door.distance <= 1.5 && hasClearInteractionPath(localPosition, door, { fires: interactionFires }))
    .sort((first, next) => first.distance - next.distance)[0] || null;
}

function warmNearbyCabin(){
 if(worldLocation!=='clearing'||worldDimensionId!=='surface'||!cabinKeys.length){warmedCabinsNearby.clear();return;}
 for(const building of VILLAGE_BUILDINGS){
  if(!isCabin(building.id)||!cabinKeys.some(key=>key.buildingId===building.id))continue;
  const distance=Math.hypot(localPosition.x-building.door.x,localPosition.y-building.door.y);
  if(distance<=4.5&&!warmedCabinsNearby.has(building.id)){
   warmedCabinsNearby.add(building.id);send({type:'roomWarm',buildingId:building.id});
  }else if(distance>7)warmedCabinsNearby.delete(building.id);
 }
}

function nearestReceptionService() {
  return nearestPlaceService(serviceContext(), localPosition, currentRoomLayout(), target =>
    hasClearInteractionPath(localPosition, target, { location: worldLocation, roomLayout: currentRoomLayout(),
      furniture: [...roomFurniture.values()], fires: [...fires.values()] }));
}

function nearestUsableRoomFurniture() {
  if (worldLocation !== 'room') return null;
  const layout = currentRoomLayout();
  return [...roomFurniture.values()].map(item => {
    const use = furnitureUse(item);
    if (!['sit','light','lie','shower','bathe','wash'].includes(use) || (use === 'light' && !roomCanEdit)) return null;
    const distance = Math.hypot(localPosition.x - item.x, localPosition.y - item.y,
      surfaceHeight(localPosition.x, localPosition.y, 'room', layout)
        - surfaceHeight(item.x, item.y, 'room', layout) - (item.baseZ || 0));
    const others = [...roomFurniture.values()].filter(other => other.id !== item.id);
    return distance <= 1.5 && hasClearInteractionPath(localPosition, item, {
      location: 'room', furniture: others, targetRadius: roomFurnitureRadius(item), roomLayout: layout,
    }) ? { ...item, use, distance } : null;
  }).filter(Boolean).sort((a, b) => a.distance - b.distance)[0] || null;
}

function useNearestRoomFurniture() {
  const item = nearestUsableRoomFurniture();
  if (!item) return false;
  clearMovement();
  sendPlayerCommand({ type: 'action', name: 'useFurniture', id: item.id });
  return true;
}

function openReceptionServices() {
  const point = nearestReceptionService();
  if (!point || !sceneReady) return false;
  placePanel.open(point, serviceContextKey());
  return true;
}

function updateContextActionLabel() {
  const button = ui.contextAction;
  if (!button) return;
  const describe = description => {
    const label = `Usar ou interagir: ${description}`;
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  const guide=nearestTutorialGuide();
  if(guide){describe('Falar com o Deus do Fogo');return;}
  const service = nearestReceptionService();
  if (service) {
    describe(`${service.prompt}: ${service.label}`);
    return;
  }
  const door = nearestInteractionDoor();
  if (door && door.distance <= 1.15) {
    const destination = worldLocation === 'room'
      ? worldRoomKind === 'lodging' && !isCabin(worldRoomBuildingId) ? 'Voltar à recepção' : 'Voltar ao bosque'
      : `Entrar em ${door.name}`;
    const hasKey = door.private && cabinKeys.some(key => key.buildingId === door.buildingId);
    describe(door.private && !hasKey ? `${destination} (precisa de chave)` : destination);
    return;
  }
  const furniture = nearestUsableRoomFurniture();
  if (furniture) {
    const sitting = livePlayers.get(selfId)?.sitting === true;
    const description = furniture.use === 'sit'
      ? sitting ? 'Levantar do móvel' : `Sentar em ${furniture.kind}`
      : furniture.use === 'lie' ? livePlayers.get(selfId)?.furnitureUse?.id === furniture.id ? 'Sair de baixo das cobertas' : 'Deitar na cama'
        : ['shower','bathe','wash'].includes(furniture.use) ? livePlayers.get(selfId)?.furnitureUse?.id === furniture.id ? 'Encerrar banho' : furniture.use==='wash'?'Lavar as mãos':furniture.use==='bathe'?'Tomar banho de tina':'Tomar banho de ducha'
          : furniture.enabled === false ? 'Acender luminária' : 'Apagar luminária';
    describe(description);
    return;
  }
  const animal = nearestWildlifeTarget();
  if (animal) {
    const species = WILDLIFE_BY_ID.get(animal.speciesId);
    describe(`Caçar ${species?.label || 'animal'} com a ferramenta equipada`);
    return;
  }
  const target = nearestVisitTarget();
  if (target) {
    describe(`${canOwnerVisitHomes ? 'Entrar na casa de' : 'Visitar o quarto de'} ${target.name}`);
    return;
  }
  const selectedTool = selectedLocalItem();
  const canCraftAxe = !axeToolFor(localInventory) && localInventory.sturdyBranch > 0 && localInventory.stone > 0 && localInventory.vines > 0;
  const workTarget = AXE_TOOL_IDS.includes(selectedTool) && localInventory[selectedTool] ? nearestWoodworkTarget() : null;
  const mineTarget = PICKAXE_TOOL_IDS.includes(selectedTool) && localInventory[selectedTool] ? nearestMiningTarget() : null;
  const useWork = worldLocation === 'clearing' && (canCraftAxe || workTarget || mineTarget);
  describe(worldLocation === 'room' ? 'personagem, móvel ou porta próxima'
    : useWork ? mineTarget ? 'Extrair minério com a picareta' : 'Criar ou usar a ferramenta equipada'
      : 'Coletar um recurso próximo');
}

function nearestWoodworkTarget() {
  if (worldLocation !== 'clearing') return null;
  const bounds = { left:localPosition.x-1.5, right:localPosition.x+1.5, top:localPosition.y-1.5, bottom:localPosition.y+1.5 };
  const interactionFires = [...fires.values()];
  const tree = getSolidTreesInBounds(bounds).map(item => ({...item, woodworkKind:'tree', distance:Math.hypot(localPosition.x-item.x,localPosition.y-item.y)}))
    .filter(item => item.distance <= 1.5 && hasClearInteractionPath(localPosition, item, {
      targetRadius: item.r, fires: interactionFires,
    })).sort((a,b)=>a.distance-b.distance)[0];
  const log = getResourcesInBounds(bounds).filter(item=>item.kind==='log')
    .map(item=>({...item,woodworkKind:'log',distance:Math.hypot(localPosition.x-item.x,localPosition.y-item.y)}))
    .filter(item=>item.distance<=1.5&&hasClearInteractionPath(localPosition,item,{fires:interactionFires,targetRadius:0.3}))
    .sort((a,b)=>a.distance-b.distance)[0];
  return !tree ? log : !log ? tree : tree.distance <= log.distance ? tree : log;
}

function nearestMiningTarget() {
  if (worldLocation !== 'clearing') return null;
  const bounds = { left:localPosition.x-1.5, right:localPosition.x+1.5, top:localPosition.y-1.5, bottom:localPosition.y+1.5 };
  const interactionFires = [...fires.values()];
  return getResourcesInBounds(bounds).filter(item => ['copperVein','ironVein','coalSeam'].includes(item.kind))
    .map(item => ({ ...item, distance:Math.hypot(localPosition.x-item.x,localPosition.y-item.y) }))
    .filter(item => item.distance <= 1.5 && hasClearInteractionPath(localPosition,item,{fires:interactionFires,targetRadius:0.3}))
    .sort((a,b) => a.distance-b.distance)[0] || null;
}

function selectedLocalItem() {
  return localInventory.slots?.[localInventory.selectedSlot || 0]?.itemId || null;
}

function action(name) {
  if (panels.isOpen) return;
  if (name === 'visit-nearest') {
    const target = nearestVisitTarget();
    if (!target) { announce('Chegue perto de alguém para visitar o quarto.'); return; }
    sendPlayerCommand({ type: 'action', name: canOwnerVisitHomes ? 'ownerVisitRoom' : 'visitRoom', playerId: target.id });
    return;
  }
  if (name === 'context') {
    const guide=nearestTutorialGuide();
    if(guide){sendPlayerCommand({type:'action',name:'talkTutorialGuide'});return;}
    if (openReceptionServices()) return;
    const door = nearestInteractionDoor();
    if (door && door.distance <= 1.15) {
      action('interact');
      return;
    }
    if (useNearestRoomFurniture()) return;
    if (worldLocation === 'room') { announce('Aproxime-se da porta, de um móvel utilizável ou de um ponto de atendimento.'); return; }
    if(nearestWildlifeTarget()){action('hunt');return;}
    const target = nearestVisitTarget();
    if (target) {
      action('visit-nearest');
      return;
    }
    const selectedTool = selectedLocalItem();
    const canCraftAxe = !axeToolFor(localInventory) && localInventory.sturdyBranch > 0 && localInventory.stone > 0 && localInventory.vines > 0;
    const canHit = (AXE_TOOL_IDS.includes(selectedTool) && localInventory[selectedTool] && nearestWoodworkTarget())
      || (PICKAXE_TOOL_IDS.includes(selectedTool) && localInventory[selectedTool] && nearestMiningTarget());
    action(canCraftAxe || canHit ? 'work' : 'collect');
    return;
  }
  if(name==='hunt'){
    const animal=nearestWildlifeTarget();
    if(!animal){announce('Chegue mais perto de um animal.');return;}
    sendPlayerCommand({type:'action',name:'hunt',animalId:animal.id});
    return;
  }
  if(name.startsWith('cast:')){
    const abilityId=name.slice('cast:'.length);
    const ability=PLAYER_ABILITIES[abilityId];
    if(ability?.kind==='travel'){if(abilityId==='universalTeleport'){openWorldMap();announce('Escolha um ponto seguro no mapa para usar o Teleporte Universal.');}return;}
    if(ability?.kind==='buff'||ability?.kind==='evasion'){sendPlayerCommand({type:'action',name:'castAbility',abilityId});return;}
    if(ability?.kind==='mobility'){
      let direction=movementIntent(localPosition);
      if(Math.hypot(direction.x,direction.y)<.05){
        const facingVectors={north:{x:0,y:-1},northeast:{x:1,y:-1},east:{x:1,y:0},southeast:{x:1,y:1},south:{x:0,y:1},southwest:{x:-1,y:1},west:{x:-1,y:0},northwest:{x:-1,y:-1}};
        direction=facingVectors[localFacing]||facingVectors.south;
      }
      sendPlayerCommand({type:'action',name:'castAbility',abilityId,dx:direction.x,dy:direction.y});return;
    }
    const animal=ability?nearestWildlifeTarget(localPosition,ability.range):null;
    if(!animal){announce('Escolha um animal dentro do alcance da magia.');return;}
    sendPlayerCommand({type:'action',name:'castAbility',abilityId,targetId:animal.id});return;
  }
  if (name === 'collect') {
    if (isPickupRequestPending(pickupFeedback, performance.now())) return;
    const requestId = ++interactionCommandId;
    const interactionFires = [...fires.values()];
    const reachableResources = [...resources.values()].filter(resource =>
      Math.hypot(localPosition.x - resource.x, localPosition.y - resource.y) <= 1.2
        && hasClearInteractionPath(localPosition, resource, { fires: interactionFires }));
    const nearbyBatch = reachableResources.filter(resource => ['woodBatch','charcoalBatch','smeltBatch'].includes(resource.kind)
      && Math.hypot(localPosition.x-resource.x,localPosition.y-resource.y) <= 1.2)
      .sort((first, next) => Math.hypot(localPosition.x-first.x,localPosition.y-first.y)
        - Math.hypot(localPosition.x-next.x,localPosition.y-next.y))[0] || null;
    const resource = nearbyBatch || nearestCollectible(localPosition, reachableResources, localInventory, 1.2, interactionFires, performance.now());
    const feedback = resource ? beginPickupFeedback(resource, performance.now()) : null;
    pickupFeedback = feedback ? { ...feedback, requestId } : null;
    if (!sendPlayerCommand({ type: 'action', name, requestId, ...(resource ? { resourceId: resource.id } : {}) })) pickupFeedback = null;
    return;
  }
  if (name === 'work') {
    sendPlayerCommand({ type:'action', name:'work' });
    return;
  }
  if (name === 'craftPickaxe') {
    sendPlayerCommand({ type:'action', name:'craftPickaxe' });
    return;
  }
  if (name === 'upgradeAxe' || name === 'upgradePickaxe') {
    sendPlayerCommand({ type:'action', name });
    return;
  }
  if (name.startsWith('brewXpPotion')) {
    const tier = name === 'brewXpPotion' ? 'I' : name.slice(-2);
    sendPlayerCommand({ type:'action', name:'process', output:`xpPotion${tier}` });
    return;
  }
  if (name === 'processSticks') {
    sendPlayerCommand({ type:'action', name:'process', output:'wood' });
    return;
  }
  if (name === 'sharpen') {
    sendPlayerCommand({ type:'action', name:'sharpen' });
    return;
  }
  sendPlayerCommand({ type: 'action', name });
}
function emote(name) {
  if (panels.isOpen) return;
  // A wave can ride the walking cycle; other gestures still settle the avatar first.
  if(name!=='wave')clearMovement();
  // Deliver older predicted inputs before the gesture so its stop boundary is ordered.
  sendPendingMovementBeforeInteraction();
  sendPlayerCommand({ type: 'emote', name });
}

function point(x, y, target = camera, height = surfaceHeight(x,y,worldLocation,currentRoomLayout())) {
  if (projectionOverride) {
    const {anchor,left,top} = projectionOverride;
    return {x:(x-anchor.x-y+anchor.y)*TILE_X-left,
      y:(x-anchor.x+y-anchor.y)*TILE_Y-height*HEIGHT_PIXELS*spriteScale-top};
  }
  return {
    x: CENTRE_X + (x-y)*TILE_X - Math.round((target.x-target.y)*TILE_X),
    y: CENTRE_Y + (x+y)*TILE_Y - Math.round((target.x+target.y)*TILE_Y) - height*HEIGHT_PIXELS*spriteScale,
  };
}

function drawCachedGeometry(name, anchor, bounds, paint, cache = geometryCache) {
  const p=point(anchor.x,anchor.y,camera,0),{left,top,right,bottom}=bounds;
  if(!geometryIntersectsViewport(p,bounds))return;
  const key=`${name}:${TILE_X}:${objectCatalogRevision()}:${currentRoomLayout().objectId||worldRoomBuildingId||''}`;
  const image=cache.get(key,right-left,bottom-top,context=>{
    const previousContext=ctx,previousProjection=projectionOverride;
    ctx=context;projectionOverride={anchor,left,top};
    try { paint(); } finally { ctx=previousContext;projectionOverride=previousProjection; }
  });
  ctx.drawImage(image,Math.round(p.x+left),Math.round(p.y+top));
}

function geometryIntersectsViewport(p,{left,top,right,bottom}) {
  return p.x+right>=0&&p.x+left<=viewWidth&&p.y+bottom>=0&&p.y+top<=viewHeight;
}

function announceChatMessages(players) {
  const currentIds = new Set();
  const newMessages = [];
  for (const player of players) {
    currentIds.add(player.id);
    if (typeof player.chat !== 'string' || !player.chat) {
      lastAnnouncedChats.delete(player.id);
      continue;
    }
    const sentAt = Number.isFinite(player.chatAt) ? player.chatAt : player.chat;
    if (lastAnnouncedChats.get(player.id) === sentAt) continue;
    lastAnnouncedChats.set(player.id, sentAt);
    newMessages.push(`${player.name}: ${player.chat}`);
  }
  for (const id of lastAnnouncedChats.keys()) if (!currentIds.has(id)) lastAnnouncedChats.delete(id);
  if (newMessages.length) ui.chatStatus.textContent = newMessages.join('. ');
}

function hash(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function diamond(x, y, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_Y);
  ctx.lineTo(x + TILE_X, y);
  ctx.lineTo(x, y + TILE_Y);
  ctx.lineTo(x - TILE_X, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.65; ctx.stroke(); }
}

function drawTileTexture(p, x, y, kind) {
  const count = kind === 'ground' ? 7 : kind === 'path' ? 5 : 2;
  for (let index = 0; index < count; index += 1) {
    const u = hash(x * 13 + index * 7, y * 17 + index * 3) * 1.5 - .75;
    const v = hash(x * 19 + index * 5, y * 11 + index * 13) * 1.5 - .75;
    if (Math.abs(u) + Math.abs(v) > .84) continue;
    const seed = hash(x + index * 23, y + index * 31);
    if (kind === 'water' && seed < .5) continue;
    ctx.globalAlpha = kind === 'path' ? .2 + seed * .18 : kind === 'water' ? .14 + seed * .22 : .16 + seed * .2;
    ctx.fillStyle = kind === 'path'
      ? (seed > .5 ? CLAREIRA.material.stone.light : CLAREIRA.palette.ink)
      : kind === 'water'
        ? (seed > .5 ? CLAREIRA.tiles.waterShimmer : CLAREIRA.tiles.waterShadow)
        : (seed > .52 ? CLAREIRA.tiles.groundMoss : CLAREIRA.tiles.groundFern);
    const width = Math.max(1, Math.round(TILE_X * (kind === 'path' ? .075 : .035)));
    const height = Math.max(1, Math.round(TILE_Y * (kind === 'path' ? .09 : .12)));
    ctx.fillRect(Math.round(p.x + u * TILE_X), Math.round(p.y + v * TILE_Y), width, height);
  }
  ctx.globalAlpha = 1;
}

function blendSkyColor(nightColor, dayColor, daylight) {
  const amount = Math.max(0, Math.min(1, daylight));
  const channels = [1, 3, 5].map(index => {
    const night = Number.parseInt(nightColor.slice(index, index + 2), 16);
    const day = Number.parseInt(dayColor.slice(index, index + 2), 16);
    return Math.round(night + (day - night) * amount);
  });
  return `rgb(${channels.join(',')})`;
}

const SKY_PALETTES = Object.freeze({
  forest: { night:['#101c20','#243b45','#253b35'], day:['#6d9c9d','#afc5a7','#829470'] },
  dark: { night:['#000000','#000000','#000000'], day:['#000000','#000000','#000000'] },
  sky: { night:['#b4d4d8','#80aebe','#587e8d'], day:['#d5e9df','#a9d0d3','#7298a0'] },
  magic: { night:['#10152d','#29334e','#293a39'], day:['#777c9d','#aaa8ba','#75847d'] },
  inferno: { night:['#1d1015','#412124','#593323'], day:['#673b43','#9b5d49','#825133'] },
  giants: { night:['#15221c','#344a35','#424b32'], day:['#879e78','#b3b984','#83875f'] },
  energy: { night:['#071522','#163b53','#1d4956'], day:['#3b6373','#63909a','#397775'] },
});

function getDimensionSkyColors() {
  const palette = SKY_PALETTES[dimensionTheme];
  const visualDaylight = dimensionTheme === 'dark' ? .2 + gameDay.daylight * .4 : gameDay.daylight;
  const colors = palette
    ? palette.night.map((color,index)=>blendSkyColor(color,palette.day[index],visualDaylight))
    : [CLAREIRA.palette.ink,CLAREIRA.palette.sky,CLAREIRA.palette.deepSky];
  return { colors, visualDaylight };
}

function drawCelestialSky() {
  if (dimensionTheme === 'dark' || worldLocation === 'room') return;
  const night = gameDay.night;
  const daylight = gameDay.daylight;

  if (night > .06) {
    const starColor = ({forest:'#e2f0d9',dark:'#d6e5f5',sky:'#f0ffff',magic:'#f1e4ff',inferno:'#ffd8b0',giants:'#f4f4dc',energy:'#d0fcff'})[dimensionTheme] || '#e2f0d9';
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const numStars = 32;
    for (let i = 0; i < numStars; i++) {
      const seedX = Math.sin(i * 127.1 + 31.7) * 43758.5453;
      const seedY = Math.sin(i * 269.5 + 183.3) * 24634.6345;
      const rx = (seedX - Math.floor(seedX));
      const ry = (seedY - Math.floor(seedY));
      const sx = (rx * viewWidth + (gameDay.starsRotation || 0) * viewWidth * .2) % viewWidth;
      const sy = ry * viewHeight * .38;
      const twinkle = reducedMotion ? .75 : .45 + .55 * Math.sin(worldClock * 1.7 + i * 2.3);
      const alpha = night * twinkle * .65;
      if (alpha > .02) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = starColor;
        const size = (i % 7 === 0) ? 2 : 1;
        ctx.fillRect(Math.round(sx), Math.round(sy), size, size);
      }
    }
    ctx.restore();
  }

  if (gameDay.moonPosition && (night > .04 || (gameDay.moonPosition.elevation || 0) > .04)) {
    const mx = Math.round(gameDay.moonPosition.x * viewWidth);
    const my = Math.round(gameDay.moonPosition.y * viewHeight);
    const moonElevation = gameDay.moonPosition.elevation || 0;
    const moonAlpha = Math.max(0, Math.min(1, night * 1.2 + moonElevation * .3));
    if (moonAlpha > .02) {
      ctx.save();
      const haloRadius = 24 + 10 * (gameDay.moonIllumination || .5);
      const halo = ctx.createRadialGradient(mx, my, 2, mx, my, haloRadius);
      halo.addColorStop(0, `rgba(220, 240, 255, ${.22 * moonAlpha})`);
      halo.addColorStop(.4, `rgba(180, 220, 255, ${.09 * moonAlpha})`);
      halo.addColorStop(1, 'rgba(180, 220, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mx, my, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      const moonR = 6;
      ctx.globalAlpha = moonAlpha;
      ctx.fillStyle = '#f2f8fc';
      ctx.beginPath();
      ctx.arc(mx, my, moonR, 0, Math.PI * 2);
      ctx.fill();

      if ((gameDay.moonIllumination ?? 1) < .92) {
        ctx.fillStyle = 'rgba(20, 36, 48, .72)';
        ctx.beginPath();
        const phaseOffset = ((gameDay.moonPhase ?? .5) - .5) * moonR * 2.2;
        ctx.arc(mx + phaseOffset, my, moonR * .92, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  if (gameDay.sunPosition && daylight > .02 && (gameDay.sunPosition.elevation || 0) > .01) {
    const sx = Math.round(gameDay.sunPosition.x * viewWidth);
    const sy = Math.round(gameDay.sunPosition.y * viewHeight);
    const sunElevation = gameDay.sunElevation || 0;
    const isDawnOrDusk = sunElevation < .55;
    const sunColor = gameDay.sunColor || '#f7d987';
    ctx.save();

    const coronaRadius = 36 + 28 * (1 - sunElevation * .5);
    const corona = ctx.createRadialGradient(sx, sy, 3, sx, sy, coronaRadius);
    const glowInner = isDawnOrDusk ? 'rgba(255, 185, 90, .42)' : 'rgba(255, 248, 205, .38)';
    const glowMid = isDawnOrDusk ? 'rgba(255, 130, 50, .18)' : 'rgba(255, 225, 150, .14)';
    corona.addColorStop(0, glowInner);
    corona.addColorStop(.35, glowMid);
    corona.addColorStop(1, 'rgba(255, 180, 80, 0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(sx, sy, coronaRadius, 0, Math.PI * 2);
    ctx.fill();

    const sunR = 8;
    ctx.fillStyle = isDawnOrDusk ? '#ffe8b5' : '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = sunColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.stroke();

    const flareLen = (reducedMotion ? 5 : 4 + Math.sin(worldClock * 2.2) * 2) * (1 - sunElevation * .3);
    if (flareLen > 1) {
      ctx.strokeStyle = isDawnOrDusk ? '#ffb870' : '#fff4c8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - sunR - flareLen, sy); ctx.lineTo(sx - sunR - 1, sy);
      ctx.moveTo(sx + sunR + 1, sy); ctx.lineTo(sx + sunR + flareLen, sy);
      ctx.moveTo(sx, sy - sunR - flareLen); ctx.lineTo(sx, sy - sunR - 1);
      ctx.moveTo(sx, sy + sunR + 1); ctx.lineTo(sx, sy + sunR + flareLen);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBackground() {
  if (worldLocation === 'room') {
    ctx.fillStyle='#101d24';ctx.fillRect(0,0,viewWidth,viewHeight);
    drawCachedGeometry(`room-standard-v5:${currentRoomLayout().id}:${gameDay.daylight>.08?'day':'night'}`,{x:8,y:8},{left:-TILE_X*8-180,right:TILE_X*8+180,
      top:-TILE_Y*7-HEIGHT_PIXELS*spriteScale*2-45*spriteScale-180,bottom:TILE_Y*7+180},drawRoomInterior);
    ctx.save();ctx.globalCompositeOperation='screen';paintSceneLightmaps(ctx,.48);ctx.restore();
    return;
  }
  const { colors:skies, visualDaylight } = getDimensionSkyColors();
  const sky = ctx.createLinearGradient(0, 0, 0, viewHeight);
  sky.addColorStop(0, skies[0]); sky.addColorStop(.52, skies[1]); sky.addColorStop(1, skies[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, viewWidth, viewHeight);
  drawCelestialSky();
  // Each dimension keeps its own sky mood while sharing the same renderer.
  if(dimensionTheme==='sky'){
    for(let bank=0;bank<5;bank++){const x=viewWidth*(.08+bank*.23),y=viewHeight*(.08+(bank%3)*.06);ctx.fillStyle=bank%2?'#e4eeeb':'#d0e4e4';ctx.globalAlpha=.52*(.35+.65*visualDaylight);ctx.fillRect(Math.round(x),Math.round(y),126,9);ctx.fillRect(Math.round(x+18),Math.round(y-6),74,6);ctx.fillRect(Math.round(x-16),Math.round(y+9),156,5);}
    ctx.globalAlpha=1;
  }else if(dimensionTheme!=='dark'){
    for(let bank=0;bank<3;bank++){const x=viewWidth*(.12+bank*.34),y=viewHeight*(.07+bank*.035);ctx.fillStyle=dimensionTheme==='inferno'?'#6a3931':dimensionTheme==='magic'?'#3b4562':'#37475b';ctx.globalAlpha=.3+.3*visualDaylight;ctx.fillRect(Math.round(x),Math.round(y),110,8);ctx.fillRect(Math.round(x+17),Math.round(y-5),67,5);ctx.fillRect(Math.round(x-19),Math.round(y+8),151,5);}
    ctx.globalAlpha=1;
  }
  // Static terrain is composed once per eight-tile region, then drawn as a single image.
  const terrainStarted=renderProfiler?performance.now():0;
  for(const {cx,cy} of visibleTerrainChunks()){
    const origin=point(cx*8,cy*8,camera,0);
    sceneArt.terrain(ctx,origin,cx,cy,TILE_X,false);
  }

  if(renderProfiler)renderProfiler.sample('terrainTiles',performance.now()-terrainStarted);
  const reliefStarted=renderProfiler?performance.now():0;
  drawNaturalTerrain();
  if(renderProfiler)renderProfiler.sample('naturalRelief',performance.now()-reliefStarted);
  const waterReedsStarted=renderProfiler?performance.now():0;
  drawWaterReeds();
  if(renderProfiler)renderProfiler.sample('waterReeds',performance.now()-waterReedsStarted);
  const waterMotionStarted=renderProfiler?performance.now():0;
  drawWaterMotion();
  if(renderProfiler)renderProfiler.sample('waterMotion',performance.now()-waterMotionStarted);
  const groundLightingStarted=renderProfiler?performance.now():0;
  drawGroundLighting();
  if(renderProfiler)renderProfiler.sample('groundLighting',performance.now()-groundLightingStarted);
}

function drawPixelPolygon(points, fill, stroke = null) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, Math.round(spriteScale)); ctx.stroke(); }
}

function createSoftShadowSprite() {
  const shadow = document.createElement('canvas');
  shadow.width = 64;
  shadow.height = 64;
  const shadowCtx = shadow.getContext('2d');
  const gradient = shadowCtx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(2, 6, 10, .76)');
  gradient.addColorStop(.25, 'rgba(2, 6, 10, .60)');
  gradient.addColorStop(.55, 'rgba(3, 8, 14, .34)');
  gradient.addColorStop(.82, 'rgba(4, 10, 16, .12)');
  gradient.addColorStop(1, 'rgba(4, 10, 16, 0)');
  shadowCtx.fillStyle = gradient;
  shadowCtx.fillRect(0, 0, shadow.width, shadow.height);
  return shadow;
}

const groundSoftShadows=new Map();
function groundShadowGray(strength){const v=Math.round(Math.max(0,Math.min(.75,strength))*255);return `rgb(${v},${v},${v})`;}
function groundSoftShadowSprite(opacity){
  const key=Math.round(Math.max(0,Math.min(1,opacity))*32);
  if(groundSoftShadows.has(key))return groundSoftShadows.get(key);
  const image=document.createElement('canvas');image.width=image.height=64;
  const c=image.getContext('2d'),gradient=c.createRadialGradient(32,32,1,32,32,32);
  for(const [stop,value]of [[0,.76],[.25,.60],[.55,.34],[.82,.12],[1,0]])gradient.addColorStop(stop,groundShadowGray(value*key/32));
  c.fillStyle=gradient;c.fillRect(0,0,64,64);groundSoftShadows.set(key,image);return image;
}
const groundShadows=createGroundShadowLayer(()=>document.createElement('canvas'));
function shadowPrimitive(bounds,paint){
  if(groundShadows.active)groundShadows.add(bounds,paint);else paint(ctx);
}
function shadowEllipseBounds(x,y,rx,ry,angle){
  const w=Math.hypot(rx*Math.cos(angle),ry*Math.sin(angle))+2;
  const h=Math.hypot(rx*Math.sin(angle),ry*Math.cos(angle))+2;
  return {left:x-w,top:y-h,right:x+w,bottom:y+h};
}
function drawSoftShadow(x,y,width,height,angle=0,opacity=.5){
  shadowPrimitive(shadowEllipseBounds(x,y,width/2,height/2,angle),target=>{
    target.save();target.imageSmoothingEnabled=true;
    if(!groundShadows.active)target.globalAlpha*=opacity;
    target.translate(x,y);target.rotate(angle);
    target.drawImage(groundShadows.active?groundSoftShadowSprite(opacity):softShadowSprite,-width/2,-height/2,width,height);target.restore();
  });
}
function drawHardShadow(x,y,radiusX,radiusY,angle,alpha){
  shadowPrimitive(shadowEllipseBounds(x,y,radiusX,radiusY,angle),target=>{
    target.save();target.translate(x,y);target.rotate(angle);
    target.fillStyle=groundShadows.active?groundShadowGray(alpha):`rgba(3,6,8,${Math.max(0,Math.min(.75,alpha))})`;
    target.beginPath();target.ellipse(0,0,radiusX,radiusY,0,0,Math.PI*2);target.fill();target.restore();
  });
}
function drawTreeSilhouetteShadow(tree,center,direction,opacity,shape){
  if(!(opacity>0))return;
  const silhouette=sceneArt.treeShadowSilhouette(tree.index);if(!silhouette)return;
  const width=80,height=100,norm=Math.hypot(direction.x,direction.y)||1,dx=direction.x/norm,dy=direction.y/norm;
  const length=shape.length,sideScale=shape.width/width,along=length/height,sideX=-dy,sideY=dx;
  const a=sideX*sideScale,b=sideY*sideScale,c=-dx*along,d=-dy*along;
  const e=center.x-dx*length/2-sideX*shape.width/2+dx*length;
  const f=center.y-dy*length/2-sideY*shape.width/2+dy*length;
  const bounds=shadowEllipseBounds(center.x,center.y,shape.radiusX,shape.radiusY,shape.angle);
  shadowPrimitive({left:bounds.left-5,top:bounds.top-5,right:bounds.right+5,bottom:bounds.bottom+5},target=>{
    target.save();target.beginPath();target.ellipse(center.x,center.y,shape.radiusX,shape.radiusY,shape.angle,0,Math.PI*2);target.clip();
    target.globalAlpha=opacity;target.filter=`blur(${2.8*spriteScale}px)`;target.transform(a,b,c,d,e,f);
    target.drawImage(silhouette,0,0,width,height);target.restore();
  });
}

function drawFootprintShadow(points,dx,dy,opacity){
  const xs=points.flatMap(p=>[p.x,p.x+dx]),ys=points.flatMap(p=>[p.y,p.y+dy]);
  shadowPrimitive({left:Math.min(...xs)-2,top:Math.min(...ys)-2,right:Math.max(...xs)+2,bottom:Math.max(...ys)+2},target=>{
    target.save();if(!groundShadows.active)target.globalAlpha*=opacity;target.fillStyle=groundShadows.active?groundShadowGray(opacity*.9):'rgba(3,6,8,.9)';
    fillFootprintShadowPath(target,points,dx,dy);target.restore();
  });
}

function drawWaterMotion(){
 if(worldLocation!=='clearing')return;
 const bounds=getVisibleWorldBounds(),phase=reducedMotion?0:worldClock*.52;
 const waterColors=WATER_PALETTES[dimensionTheme]||WATER_PALETTES.forest;
 const visible=(x,y,pad=4)=>x>=bounds.left-pad&&x<=bounds.right+pad&&y>=bounds.top-pad&&y<=bounds.bottom+pad;
 const shoreColors=({forest:['#91805d','#766d54'],dark:['#696665','#51595a'],sky:['#b6aa86','#89948b'],magic:['#897d70','#657872'],inferno:['#9b7556','#775d4e'],giants:['#8d8159','#6d7658'],energy:['#728c82','#4e7779']})[dimensionTheme]||['#91805d','#766d54'];
 const drawRibbon=(route,geometry,screenPoints,widthScale,extraWidth,color,taperOpenEnds=false,taperConnectedEnd=true)=>{
  const left=[],right=[];
  for(let index=0;index<geometry.points.length;index++){
   const tangent=geometry.tangents[index]||{x:1,y:0};
   const normalX=-tangent.y,normalY=tangent.x;
   const screenNormalX=(normalX-normalY)*TILE_X,screenNormalY=(normalX+normalY)*TILE_Y;
   let taper=1;
   if(taperOpenEnds&&route.openStart)taper=Math.min(taper,Math.min(1,geometry.distanceAt[index]/5));
   if(taperOpenEnds&&route.openEnd&&(!route.openEndConnected||taperConnectedEnd))taper=Math.min(taper,Math.min(1,(geometry.totalLength-geometry.distanceAt[index])/6));
   const halfWidth=((geometry.widths[index]||route.width)*widthScale+extraWidth)*taper,p=screenPoints[index];
   left.push([p.x+screenNormalX*halfWidth,p.y+screenNormalY*halfWidth]);
   right.push([p.x-screenNormalX*halfWidth,p.y-screenNormalY*halfWidth]);
  }
  ctx.beginPath();
  left.forEach(([x,y],index)=>index===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
  for(let index=right.length-1;index>=0;index--)ctx.lineTo(right[index][0],right[index][1]);
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
  for(const index of [0,geometry.points.length-1]){
   if((index===0&&route.openStart)||(index===geometry.points.length-1&&route.openEnd))continue;
   const tangent=geometry.tangents[index],normalX=-tangent.y,normalY=tangent.x;
   const screenNormalX=(normalX-normalY)*TILE_X,screenNormalY=(normalX+normalY)*TILE_Y;
   const halfWidth=(geometry.widths[index]||route.width)*widthScale+extraWidth;
   const radius=Math.hypot(screenNormalX,screenNormalY)*halfWidth,p=screenPoints[index];
   const flowX=(tangent.x-tangent.y)*TILE_X,flowY=(tangent.x+tangent.y)*TILE_Y;
   ctx.beginPath();ctx.ellipse(p.x,p.y,radius*.58,radius,Math.atan2(flowY,flowX),0,Math.PI*2);ctx.fill();
  }
 };
 const drawRoute=route=>{
  if(route.bounds.right<bounds.left-6||route.bounds.left>bounds.right+6||route.bounds.bottom<bounds.top-6||route.bounds.top>bounds.bottom+6)return;
  const geometry=waterRenderGeometry(route),screenPoints=geometry.points.map(sample=>point(sample.x,sample.y));
  if(route.id!=='surface-river-main'){
   // Other waterways retain their existing rendering.
   drawRibbon(route,geometry,screenPoints,1,WATER_BANK_WIDTH,shoreColors[0]+'24');
   drawRibbon(route,geometry,screenPoints,1,WATER_BANK_WIDTH*.74,shoreColors[0]+'38');
   drawRibbon(route,geometry,screenPoints,1,WATER_BANK_WIDTH*.46,shoreColors[1]+'50');
   drawRibbon(route,geometry,screenPoints,1,WATER_BANK_WIDTH*.2,waterColors[2]+'58');
   drawRibbon(route,geometry,screenPoints,1,.08,waterColors[1]+'66');
   drawRibbon(route,geometry,screenPoints,1,0,waterColors[0]+'f0');
  }
  const path=waterFishRoute(route);
  if(!reducedMotion&&path.total>0){
   const rippleCount=Math.max(8,Math.min(24,Math.floor(path.total/15)));
   const spacing=path.total/rippleCount,flow=(worldClock*(.58+route.speed*.58))%spacing;
   ctx.save();ctx.lineCap='round';ctx.lineWidth=Math.max(1,spriteScale*.82);
   for(let ripple=0;ripple<rippleCount;ripple++){
    const distance=(ripple*spacing+flow)%path.total,sample=path.sample(distance);
    let flowFade=1;
    if(route.openStart)flowFade=Math.min(flowFade,Math.min(1,distance/4));
    if(route.openEnd)flowFade=Math.min(flowFade,Math.min(1,(path.total-distance)/6));
    if(flowFade<=.02)continue;
    const visualWidth=route.id==='surface-river-main'?sample.width:route.width;
    const side=Math.sin(ripple*4.13+geometry.points.length)*visualWidth*.34;
    const p=point(sample.x-sample.dy*side,sample.y+sample.dx*side);
    const tangentX=(sample.dx-sample.dy)*TILE_X,tangentY=(sample.dx+sample.dy)*TILE_Y,tangentLength=Math.hypot(tangentX,tangentY)||1;
    const normalX=-tangentY/tangentLength,normalY=tangentX/tangentLength;
    const angle=Math.atan2(tangentY,tangentX),textureKind=ripple%3;
    if(textureKind===1){
     const halfLength=Math.max(1.5,Math.min(6*spriteScale,visualWidth*tangentLength*.24));
     const bend=(ripple%2?1:-1)*1.8*spriteScale;
     ctx.globalAlpha=.28*flowFade;
     ctx.strokeStyle=waterColors[1];ctx.beginPath();ctx.moveTo(p.x-normalX*halfLength,p.y-normalY*halfLength);
     ctx.quadraticCurveTo(p.x+tangentX/tangentLength*bend,p.y+tangentY/tangentLength*bend,
       p.x+normalX*halfLength,p.y+normalY*halfLength);ctx.stroke();
    }else{
     ctx.globalAlpha=(textureKind===0?.3:.24)*flowFade;
     ctx.fillStyle=textureKind===0?waterColors[1]:waterColors[0];
     const length=(2.2+(ripple%4)*.45)*spriteScale;
     ctx.beginPath();ctx.ellipse(p.x,p.y,length,Math.max(1,spriteScale*1.15),angle,0,Math.PI*2);ctx.fill();
    }
   }
   ctx.restore();
  }
  for(const fall of route.waterfalls){
   if(!visible(fall.x,fall.y,route.width+2))continue;
   let nearest=0,nearestDistance=Infinity;
   for(let index=0;index<geometry.points.length;index++){
    const dx=geometry.points[index].x-fall.x,dy=geometry.points[index].y-fall.y,distance=dx*dx+dy*dy;
    if(distance<nearestDistance){nearest=index;nearestDistance=distance;}
   }
   const tangent=geometry.tangents[nearest],normalX=-tangent.y,normalY=tangent.x;
   const acrossX=(normalX-normalY)*TILE_X,acrossY=(normalX+normalY)*TILE_Y,acrossLength=Math.hypot(acrossX,acrossY)||1;
   const p=point(fall.x,fall.y),halfWidth=(geometry.widths[nearest]||route.width)*acrossLength*.58;
   const height=Math.max(8,Math.round(fall.drop*HEIGHT_PIXELS*spriteScale*1.8));
   const flowX=(tangent.x-tangent.y)*TILE_X,flowY=(tangent.x+tangent.y)*TILE_Y;
   const flowAngle=Math.atan2(flowY,flowX),poolY=Math.round(p.y+height);
   ctx.save();ctx.globalAlpha=.48;ctx.fillStyle=waterColors[0];
   ctx.fillRect(Math.round(p.x-halfWidth),Math.round(p.y-1),Math.round(halfWidth*2),Math.round(height));
   ctx.globalAlpha=.34;ctx.fillStyle=waterColors[1];
   ctx.fillRect(Math.round(p.x-halfWidth*.56),Math.round(p.y),Math.max(1,Math.round(halfWidth*1.12)),Math.round(height));
   ctx.globalAlpha=.78;ctx.fillStyle=waterColors[2];
   for(let stripe=0;stripe<3;stripe++){
    const offset=(stripe-1)*halfWidth*.48,dropShift=reducedMotion?0:Math.floor((worldClock*8+stripe*height/3)%Math.max(5,height));
    ctx.fillRect(Math.round(p.x+offset),Math.round(p.y+dropShift),Math.max(2,Math.round(spriteScale*1.5)),Math.max(3,Math.round(height*.48)));
   }
   ctx.globalAlpha=.68;ctx.fillStyle=waterColors[2];
   for(let lip=0;lip<2;lip++){
    const segmentWidth=Math.round(halfWidth*.72),segmentX=Math.round(p.x-halfWidth+lip*halfWidth*1.28);
    ctx.fillRect(segmentX,Math.round(p.y-1),segmentWidth,Math.max(1,Math.round(spriteScale)));
   }
   ctx.globalAlpha=.38;ctx.fillStyle=waterColors[1];
   ctx.beginPath();ctx.ellipse(p.x,poolY,Math.max(4,halfWidth*.86),Math.max(2,spriteScale*2.2),flowAngle,0,Math.PI*2);ctx.fill();
   ctx.globalAlpha=.94;ctx.strokeStyle=waterColors[2];ctx.lineWidth=Math.max(1,spriteScale*1.2);
   ctx.beginPath();ctx.ellipse(p.x,poolY,Math.max(3,halfWidth*.72),Math.max(1,spriteScale*1.35),flowAngle,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle=waterColors[2];
   for(let spray=0;spray<4;spray++){
    const side=spray%2===0?-1:1,offset=side*halfWidth*(.52+Math.floor(spray/2)*.24);
    ctx.fillRect(Math.round(p.x+offset),Math.round(poolY-spriteScale*(1+spray%2)),Math.max(1,Math.round(spriteScale)),Math.max(1,Math.round(spriteScale)));
   }
   ctx.restore();
  }
 };
 if(worldDimensionId==='surface'){
  const pondX=(SOLID_WATER.left+SOLID_WATER.right)/2,pondY=(SOLID_WATER.top+SOLID_WATER.bottom)/2;
  const gust=reducedMotion?0:windSwayAt(pondX,pondY,worldClock)*windStrengthAt(pondX,pondY);
  for(let row=0;row<4;row++){
   const x=SOLID_WATER.left+.35+(row%3)*.62+gust*.24;
   const y=SOLID_WATER.top+.2+((row*.37+phase*.52)%(SOLID_WATER.bottom-SOLID_WATER.top-.35)),p=point(x,y),width=8+(row%2)*4;
   ctx.fillStyle=row%2?waterColors[1]+'38':waterColors[2]+'24';
   ctx.fillRect(Math.round(p.x-width/2),Math.round(p.y),width,Math.max(1,Math.round(spriteScale)));
   ctx.fillRect(Math.round(p.x-width*.16),Math.round(p.y-2*spriteScale),Math.max(2,Math.round(width*.32)),Math.max(1,Math.round(spriteScale)));
  }
 }
 const lakeBounds={left:bounds.left-48,right:bounds.right+48,top:bounds.top-48,bottom:bounds.bottom+48};
 const visibleLakes=getLakesInBounds(lakeBounds);
 for(const lake of visibleLakes){
  const direction=windDirectionAt(lake.x,lake.y),sideX=-direction.y,sideY=direction.x;
  const gust=reducedMotion?0:windSwayAt(lake.x,lake.y,worldClock),strength=windStrengthAt(lake.x,lake.y);
  for(let row=0;row<5;row++){
  const along=(((phase*(.64+strength*.28)+row*.31)%1)-.5)*lake.radius*.62;
  const across=(row-3.5)*lake.radius*.115;
  const x=lake.x+direction.x*along+sideX*across+direction.x*gust*.16;
  const y=lake.y+direction.y*along+sideY*across+direction.y*gust*.16;
  if(!visible(x,y,2)||waterSurfaceDepthAt(x,y,WORLD_WATER_OPTIONS)<=0)continue;
  const p=point(x,y),width=Math.max(3,Math.round(TILE_X*(lake.waterKind==='lake' ? .28 : .2)));
  const screenX=(direction.x-direction.y)*TILE_X,screenY=(direction.x+direction.y)*TILE_Y,screenLength=Math.hypot(screenX,screenY)||1;
  ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle=row%2?waterColors[1]:waterColors[2];ctx.lineWidth=Math.max(.7,spriteScale*.72);
  ctx.beginPath();ctx.moveTo(p.x-screenX/screenLength*width/2,p.y-screenY/screenLength*width/2);
  ctx.quadraticCurveTo(p.x+sideX*.5,p.y+sideY*.5,p.x+screenX/screenLength*width/2,p.y+screenY/screenLength*width/2);ctx.stroke();ctx.restore();
  }
 }
 for(const route of waterRenderRoutes())drawRoute(route);
 drawWaterFish(waterColors,visible,visibleLakes);
}

function drawNaturalTerrain(){
 visibleNaturalTerrainFaces.length=0;
 if(worldLocation!=='clearing')return;
 const definition=getWorldDefinition(),hasEditedRelief=worldHasRelief();
 if(!hasEditedRelief){
  if(definition.dimensionId!=='surface')return;
  drawCachedGeometry(`natural-terrain:${definition.dimensionId}:${definition.revision}`,{x:35,y:22.5},{left:-TILE_X*13,right:TILE_X*13,
    top:-TILE_Y*13-HEIGHT_PIXELS*spriteScale*2,bottom:TILE_Y*13},()=>renderNaturalTerrain(NATURAL_PATCHES),naturalGeometryCache);
  return;
 }
 const visible=getVisibleWorldBounds(),minX=Math.max(0,Math.floor(visible.left/8)),maxX=Math.min(Math.ceil(WORLD_SIZE/8)-1,Math.floor(visible.right/8));
 const minY=Math.max(0,Math.floor(visible.top/8)),maxY=Math.min(Math.ceil(WORLD_SIZE/8)-1,Math.floor(visible.bottom/8));
 const geometryBounds={left:-TILE_X*8,right:TILE_X*8,top:-TILE_Y*8-8*HEIGHT_PIXELS*spriteScale-4,bottom:TILE_Y*8+4};
 for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++){
  const anchor={x:cx*8+4,y:cy*8+4};
  if(!geometryIntersectsViewport(point(anchor.x,anchor.y,camera,0),geometryBounds))continue;
  const key=`${definition.dimensionId}:${definition.seed}:${definition.theme}:${definition.revision}:${cx}:${cy}`,bounds={left:cx*8,top:cy*8,right:cx*8+8,bottom:cy*8+8};
  let patches=naturalPatchCache.get(key);
  if(!patches){patches=getNaturalPatches(bounds);naturalPatchCache.set(key,patches);if(naturalPatchCache.size>96)naturalPatchCache.delete(naturalPatchCache.keys().next().value);}
  if(!patches.length)continue;
  for(const cell of patches)for(const face of cell.faces)visibleNaturalTerrainFaces.push(face);
  drawCachedGeometry(`natural-terrain:${key}`,anchor,geometryBounds,
    ()=>renderNaturalTerrain(patches),naturalGeometryCache);
 }
}
function drawWaterReflections(){
 if(worldLocation!=='clearing')return;
 const bounds=getVisibleWorldBounds(),waterColors=WATER_PALETTES[dimensionTheme]||WATER_PALETTES.forest;
 for(const route of waterRenderRoutes()){
  if(route.bounds.right<bounds.left-6||route.bounds.left>bounds.right+6||route.bounds.bottom<bounds.top-6||route.bounds.top>bounds.bottom+6)continue;
  const path=waterFishRoute(route),count=Math.max(12,Math.min(72,Math.floor(path.total/6)));
  if(path.total<=0)continue;
  const spacing=path.total/count,flow=reducedMotion?0:(worldClock*(.8+route.speed*.65))%spacing;
  ctx.save();
  for(let index=0;index<count;index++){
   const distance=(index*spacing+flow)%path.total,sample=path.sample(distance);
   let flowFade=1;
   if(route.openStart)flowFade=Math.min(flowFade,Math.min(1,distance/4));
   if(route.openEnd)flowFade=Math.min(flowFade,Math.min(1,(path.total-distance)/6));
   if(flowFade<=.02)continue;
   const visualWidth=route.id==='surface-river-main'?sample.width:route.width;
   const side=Math.sin(index*3.7+route.points.length)*visualWidth*.34;
   const p=point(sample.x-sample.dy*side,sample.y+sample.dx*side);
   if(p.x<-5||p.x>viewWidth+5||p.y<-5||p.y>viewHeight+5)continue;
   const tangentX=(sample.dx-sample.dy)*TILE_X,tangentY=(sample.dx+sample.dy)*TILE_Y;
   const angle=Math.atan2(tangentY,tangentX),length=(1.7+(index%4)*.38)*spriteScale;
   const height=(.9+(index%3)*.25)*spriteScale;
   // Small, varied teal flecks drift with the current and read as water texture rather than streaks.
   ctx.globalAlpha=(.19+(index%4)*.035)*flowFade;ctx.fillStyle=index%5===0?waterColors[0]:waterColors[1];
   ctx.beginPath();ctx.ellipse(p.x,p.y,length,height,angle,0,Math.PI*2);ctx.fill();
   if(index%5===2){
    const sideX=-(tangentY/(Math.hypot(tangentX,tangentY)||1)),sideY=tangentX/(Math.hypot(tangentX,tangentY)||1);
    ctx.globalAlpha=.14*flowFade;ctx.fillStyle=waterColors[1];
    ctx.beginPath();ctx.ellipse(p.x+sideX*2.2*spriteScale,p.y+sideY*2.2*spriteScale,
      length*.56,height*.82,angle,0,Math.PI*2);ctx.fill();
   }
  }
  if(gameDay.night>.01){
   const starColor=({forest:'#d7e9ce',dark:'#d6e5f5',sky:'#efffff',magic:'#eadcff',inferno:'#ffd0a0',giants:'#f1f1d2',energy:'#c5fbff'})[dimensionTheme]||'#d7e9ce';
   const routeSeed=hash(route.points[0]?.x||0,route.points.at(-1)?.y||0);
   ctx.globalCompositeOperation='screen';
   for(let index=0;index<12;index++){
    const seed=hash(index+routeSeed*31,route.points.length+17);
    const drift=reducedMotion?0:worldClock*.018;
    const distance=((seed+drift)%1)*path.total;
    const sample=path.sample(distance),visualWidth=route.id==='surface-river-main'?sample.width:route.width,
    across=(hash(index+9,routeSeed+43)-.5)*visualWidth*.28;
    const p=point(sample.x-sample.dy*across,sample.y+sample.dx*across);
    if(p.x<-3||p.x>viewWidth+3||p.y<-3||p.y>viewHeight+3)continue;
    const twinkle=reducedMotion ? .65 : .5+.5*Math.sin(worldClock*1.35+index*2.17+routeSeed*Math.PI*2);
    ctx.globalAlpha=gameDay.night*(.07+.11*twinkle);ctx.fillStyle=starColor;
    const size=index%5===0?2:1;
    ctx.fillRect(Math.round(p.x-size/2),Math.round(p.y),size,1);
   }
   ctx.globalCompositeOperation='source-over';
  }
  ctx.restore();
 }
}

const TERRAIN_MATERIAL_PALETTES={
 sky:{
  grass:{top:'#738b71',accent:'#a8ba91',shadow:'#506b5b'},
  grass_dirt:{top:'#8b8667',accent:'#82946c',shadow:'#665c46'},
  dirt:{top:'#8b6e51',accent:'#b08b63',shadow:'#654c3c'},
  stone:{top:'#86969a',accent:'#b9c0b8',shadow:'#596a70'},
 },
 forest:{
  grass:{top:'#5e7c43',accent:'#a1b476',shadow:'#34543b'},
  grass_dirt:{top:'#776d4d',accent:'#78905e',shadow:'#4e513d'},
  dirt:{top:'#805d40',accent:'#aa8259',shadow:'#574333'},
  stone:{top:'#747b79',accent:'#a4a69a',shadow:'#4c5753'},
 },
};
function terrainPalette(materialId){
 return (TERRAIN_MATERIAL_PALETTES[dimensionTheme]||TERRAIN_MATERIAL_PALETTES.sky)[materialId]
  ||TERRAIN_MATERIAL_PALETTES.sky.grass;
}
function terrainRandom(seed){
 let state=(Number(seed)||0)>>>0;
 return ()=>{state=(state+0x6d2b79f5)>>>0;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296;};
}
function clippedTerrainPolygon(points,paint){
 ctx.save();ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();paint();ctx.restore();
}
function terrainInset(points,fraction){
 const cx=points.reduce((sum,p)=>sum+p[0],0)/points.length,cy=points.reduce((sum,p)=>sum+p[1],0)/points.length;
 return points.map(([x,y])=>[Math.round(x+(cx-x)*fraction),Math.round(y+(cy-y)*fraction)]);
}
function drawTerrainSnow(points,amount,random){
 if(amount<=.01)return;
 if(amount>=.85){
  drawPixelPolygon(terrainInset(points,.1),'#e5eff0');
  drawPixelPolygon(terrainInset(points,.24),'#d2e2e4');
  return;
 }
 const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
 const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
 const count=amount>=.35?3:1,unit=Math.max(1,Math.round(spriteScale));
 for(let i=0;i<count;i++){
  const x=Math.round(minX+(maxX-minX)*(.24+random()*.52)),y=Math.round(minY+(maxY-minY)*(.24+random()*.45));
  const radius=Math.max(unit,Math.round(unit*(1+amount*2)));
  drawPixelPolygon([[x-radius,y],[x,y-radius],[x+radius,y],[x,y+radius]],'#e2ecec');
  ctx.fillStyle='#b9d0d3';ctx.fillRect(x-unit,y+unit,unit,unit);
 }
}
function drawTerrainDamage(points,amount,materialId,seed){
 if(amount<.18)return;
 const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
 const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
 const cx=Math.round((minX+maxX)/2),cy=Math.round((minY+maxY)/2),unit=Math.max(1,Math.round(spriteScale));
 const random=terrainRandom(seed+71);
 ctx.strokeStyle=materialId==='stone'?'#3f4b50':'#4b4033';ctx.lineWidth=unit;ctx.beginPath();
 ctx.moveTo(cx-unit*3,cy-unit*3);ctx.lineTo(cx,cy);ctx.lineTo(cx-unit,cy+unit*3);ctx.lineTo(cx+unit*2,cy+unit*4);
 if(amount>.55){ctx.moveTo(cx,cy);ctx.lineTo(cx+unit*3,cy-unit*2);ctx.lineTo(cx+unit*4,cy-unit);}
 ctx.stroke();
 if(amount>.55){ctx.fillStyle=terrainPalette(materialId).accent;for(let i=0;i<2;i++)ctx.fillRect(Math.round(minX+unit*8+random()*unit*20),Math.round(minY+unit*8+random()*unit*10),unit,unit);}
}
function drawTerrainCellSurface(cell,points){
 const materialId=cell.materialId,palette=terrainPalette(materialId),random=terrainRandom(cell.variantSeed);
 drawPixelPolygon(points,palette.top);
 clippedTerrainPolygon(points,()=>{
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const unit=Math.max(1,Math.round(spriteScale));
  if(materialId==='grass'||materialId==='grass_dirt'){
   const count=materialId==='grass'?7:5;
   for(let i=0;i<count;i++){
    const x=Math.round(minX+unit*(8+random()*48)),y=Math.round(minY+unit*(8+random()*19));
    ctx.fillStyle=random()>.5?palette.accent:palette.shadow;
    ctx.fillRect(x,y,unit,unit*2);ctx.fillRect(x-unit,y+unit,unit,unit);
    if(materialId==='grass_dirt'&&i%2===0){ctx.fillStyle='#765a3f';ctx.fillRect(x+unit*2,y+unit,unit*2,unit);}
   }
  }else if(materialId==='dirt'){
   for(let i=0;i<10;i++){
    const x=Math.round(minX+unit*(7+random()*50)),y=Math.round(minY+unit*(6+random()*24));
    ctx.fillStyle=i%3===0?palette.accent:palette.shadow;
    ctx.fillRect(x,y,unit*(i%4===0?3:2),unit);
   }
  }else if(materialId==='stone'){
   for(let i=0;i<4;i++){
    const x=Math.round(minX+unit*(9+random()*44)),y=Math.round(minY+unit*(8+random()*20));
    ctx.fillStyle=i%2?palette.accent:palette.shadow;
    ctx.fillRect(x,y,unit*(2+i%2),unit);ctx.fillRect(x+unit,y-unit,unit,unit);
   }
  }
  drawTerrainDamage(points,cell.damage,materialId,cell.variantSeed);
  drawTerrainSnow(points,cell.snow,random);
 });
}
function drawTerrainFaceSurface(points,face){
 const palette=terrainPalette(face.materialId);
 const base=face.materialId==='stone'
  ?(face.orientation==='east'?'#64757a':'#53666d')
  :(face.orientation==='east'?'#715940':'#594633');
 drawPixelPolygon(points,base);
 clippedTerrainPolygon(points,()=>{
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const unit=Math.max(1,Math.round(spriteScale)),random=terrainRandom(face.id.length+Math.floor(face.height*100));
  const bands=Math.max(1,Math.floor((maxY-minY)/Math.max(2,unit*3)));
  for(let i=1;i<=bands;i++){
   const y=Math.round(minY+(maxY-minY)*i/(bands+1));
   ctx.fillStyle=i%2?palette.shadow:palette.accent;
   ctx.fillRect(Math.round(minX+unit*2+random()*unit*5),y,Math.max(unit,Math.round((maxX-minX)*(0.25+random()*.5))),unit);
  }
  if(face.damage>.18)drawTerrainDamage(points,face.damage,face.materialId,face.id.length+101);
  if(face.snow>.2){
   const amount=face.snow>=.85?.34:.18;
   const a=points[0],b=points[1],c=points[2],d=points[3];
   const innerA=[Math.round(a[0]+(d[0]-a[0])*amount),Math.round(a[1]+(d[1]-a[1])*amount)];
   const innerB=[Math.round(b[0]+(c[0]-b[0])*amount),Math.round(b[1]+(c[1]-b[1])*amount)];
   drawPixelPolygon([a,b,innerB,innerA],face.snow>=.85?'#e5eff0':'#d5e4e5');
  }
 });
}
function renderNaturalTerrain(patches){
 const vertex=(x,y,z)=>{const p=point(x,y,camera,z);return [Math.round(p.x),Math.round(p.y)]};
 for(const cell of patches){
  const {x,y,h}=cell,p=point(x+.25,y+.25,camera,h);
  const [a,b,c,d]=cell.corners;
  const points=[vertex(x,y,a),vertex(x+1,y,b),vertex(x+1,y+1,c),vertex(x,y+1,d)];
  if(cell.materialId)drawTerrainCellSurface(cell,points);
  else{
   const riseX=(b+c-a-d)*.5,riseY=(d+c-a-b)*.5;
   const grade=Math.hypot(riseX,riseY),northwestLight=-riseX-riseY;
   const reliefPalette=({sky:['#9aafb4','#768f99','#89a1aa'],magic:['#554e67','#343b51','#434960'],inferno:['#775043','#462d29','#5e3a31'],energy:['#477384','#244650','#345d6d']})[dimensionTheme]||['#52715b','#203a36','#315347'];
   const facingShade=northwestLight>.02?reliefPalette[0]:northwestLight<-.02?reliefPalette[1]
    :Math.abs(riseX)>Math.abs(riseY)?(riseX<0?reliefPalette[0]:reliefPalette[1])
     :(riseY<0?reliefPalette[0]:reliefPalette[1]);
   const color=isPathTile(x+.5,y+.5)?'#796e52':grade<.025?(dimensionTheme==='sky'?'#879f99':reliefPalette[2]):facingShade;
   drawPixelPolygon(points,color);
   if(Math.floor(x*13+y*7)%9===0){ctx.fillStyle=dimensionTheme==='sky'?'#a5b7a9':'#749166';ctx.fillRect(Math.round(p.x),Math.round(p.y-3),3,1);ctx.fillRect(Math.round(p.x)+1,Math.round(p.y-5),1,2)}
  }
 }
}

function drawNaturalTerrainFace(face){
 const points=face.edge.map(([x,y,z])=>{const p=point(x,y,camera,z);return [Math.round(p.x),Math.round(p.y)]});
 if(face.materialId){drawTerrainFaceSurface(points,face);return;}
 const baseStone=face.base<.75;
 const sideColor=dimensionTheme==='sky'
  ?baseStone?(face.orientation==='east'?'#879694':'#718387'):(face.orientation==='east'?'#71898a':'#586f77')
  :baseStone?(face.orientation==='east'?'#53675a':'#405448'):(face.orientation==='east'?'#596b50':'#465943');
 drawPixelPolygon(points,sideColor);
}

let outdoorEmitters=exteriorEmitters([RECEPTION_BUILDING,...VILLAGE_BUILDINGS]);
let sceneLightKey='',sceneLightState=null;
function currentSceneLights(){
  const indoor=worldLocation==='room',layout=indoor?currentRoomLayout():null;
  const daylight=Math.round(gameDay.daylight*4)/4;
  const furniture=[...roomFurniture.values()];
  const definition=getWorldDefinition();
  const geometryKey=(indoor?`${layout.id}:`+furniture.map(item=>`${item.id}:${item.x}:${item.y}:${item.baseZ||0}:${item.rotation}:${item.enabled}:${JSON.stringify(item.properties||{})}`).join(';')
    :worldGeometryCacheKey(definition))+`:objects:${objectCatalogRevision()}`;
  const key=`${geometryKey}:${daylight}:${gameDay.hasMoon?1:0}`;
  if(sceneLightState&&sceneLightKey===key)return sceneLightState;
  if(!indoor&&worldDimensionId==='surface')outdoorEmitters=exteriorEmitters([RECEPTION_BUILDING,...VILLAGE_BUILDINGS],daylight,gameDay.hasMoon);
  const lights=indoor?interiorEmitters(layout,furniture,daylight,0,gameDay.hasMoon):worldDimensionId==='surface'?outdoorEmitters:[];
  const obstacles=indoor?roomLightObstacles(layout,furniture):[RECEPTION_BUILDING,...VILLAGE_BUILDINGS].flatMap(building=>[
    {...building.bounds,height:building.height,owner:building.id},
    ...buildingArchitecture(building).posts.map(post=>({...post,owner:building.id}))]);
  sceneLightKey=key;sceneLightState={key,geometryKey,lights,obstacles,bounds:indoor?layout.bounds:null,
    surface:(x,y)=>surfaceHeight(x,y,indoor?'room':'clearing',layout),
    withContext:callback=>{
      const previous=getWorldDefinition();
      try{if(previous!==definition)applyWorldDefinition(definition);return callback();}
      finally{if(previous!==definition)applyWorldDefinition(previous);}
    }};
  return sceneLightState;
}
function paintSceneLightmaps(context,alpha){
  const scene=currentSceneLights();
  let ready=true;
  for(const light of scene.lights){
    if(!(light.strength>0))continue;
    const p=point(light.x,light.y,camera,0);
    if(p.x<-light.reach*TILE_X*2||p.x>viewWidth+light.reach*TILE_X*2||p.y<-light.reach*TILE_Y*2||p.y>viewHeight+light.reach*TILE_Y*2+light.height*HEIGHT_PIXELS*spriteScale)continue;
    const patch=lightmapFor(light,scene.obstacles,scene.bounds,scene.surface,scene.geometryKey||scene.key,{withContext:scene.withContext});
    if(!patch)ready=false;
    if(context&&patch)paintLightmap(context,patch,p,TILE_X/16,alpha);
  }
  return ready;
}
function drawRoomLighting(){
  const scene=currentSceneLights();
  // Floor light belongs below opaque props and actors. Applying its projected
  // texture over the finished scene made furniture appear translucent.
  ctx.save();ctx.fillStyle=`rgba(9,17,26,${.12+gameDay.night*.12})`;ctx.fillRect(0,0,viewWidth,viewHeight);ctx.restore();
  // A visible sconce replaces the previous invisible lamp point.
  for(const light of scene.lights){
    const project=(x,y,z)=>point(x,y,camera,z);
    if(light.kind==='lamp'||light.kind==='hearth'){
      if(!(light.strength>0))continue;
      const p=project(light.x,light.y,light.height-.18),flicker=light.flicker||.12;
      const pulse=reducedMotion?1:(1-flicker*.5)+flicker*(.5+.5*Math.sin(performance.now()/73+(light.x+light.y)*2));
      const glowProfile=roomGlowProfile(light,TILE_X,pulse);
      const radius=glowProfile.radius;
      const glow=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,radius);
      glow.addColorStop(0,'#fff0b860');glow.addColorStop(.3,'#ffc56d35');glow.addColorStop(1,'#e98b3500');
      ctx.save();ctx.globalAlpha=glowProfile.opacity;ctx.globalCompositeOperation='screen';ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(p.x,p.y,radius,radius*.62,0,0,Math.PI*2);ctx.fill();ctx.restore();
      const flameHeight=(light.kind==='hearth'?8:5)*spriteScale*pulse;
      drawPixelPolygon([[p.x,p.y-flameHeight],[p.x-flameHeight*.32,p.y+flameHeight*.25],[p.x,p.y+flameHeight*.1],[p.x+flameHeight*.3,p.y+flameHeight*.3]],'#f2a34f');
      drawPixelPolygon([[p.x,p.y-flameHeight*.45],[p.x-flameHeight*.12,p.y+flameHeight*.18],[p.x+flameHeight*.15,p.y+flameHeight*.16]],'#ffe29a');
      continue;
    }
    if(light.kind!=='lantern')continue;
    const r={x1:light.x,y1:light.y-.14,x2:light.x,y2:light.y+.14,bottom:light.height-.3,top:light.height+.3};
    drawPixelPolygon(facadePanel(project,r,-.15,-.1,1.15,1.1),'#493c30');
    drawPixelPolygon(facadePanel(project,r,.12,.12,.88,.88),'#f6d798');
  }
}

const FIRELIGHT_RGB_STOPS=Object.freeze([
  [0,255,244,210],[.08,255,210,120],[.22,255,160,60],[.42,235,105,35],
  [.65,175,65,24],[.84,105,38,18],[1,35,14,8],
]);
const SHADOW_RGB_STOPS=Object.freeze(FIRELIGHT_RGB_STOPS.map(([distance])=>[distance,0,0,0]));
function addSphericalFalloffStops(gradient,opacity,palette,edgePower=1.35){
  for(const [distance,red,green,blue] of palette){
    const alpha=campfireLightFalloff(distance,edgePower)*opacity;
    gradient.addColorStop(distance,`rgba(${red},${green},${blue},${alpha})`);
  }
}

function drawGroundLighting() {
  if(dimensionTheme==='dark')return;
  // The night mask already clears darkness around nearby windows and porches.
  // Keep the warm floor tint for twilight, then avoid compositing the same
  // large lightmaps again over the full-resolution scene at deeper night.
  if(gameDay.night>.05&&gameDay.night<.35)paintSceneLightmaps(ctx,.05+.32*gameDay.night);
  if(gameDay.night>=.05)return;
  for (const fire of fires.values()) {
    const strength=campfireFlameStrength(fire,performance.now())*(worldDimensionId.startsWith('arrival-')?arrivalFireIgnition():1);
    if(strength<=0)continue;
    const p=point(fire.x,fire.y);
    const pulse=campfireGlowPulse(flameLightEnvelope(worldClock,fire,reducedMotion));
    const fireProfile=nightEmitterProfile(CAMPFIRE_LIGHT_RADIUS_TILES,1.35,{night:gameDay.night,hasMoon:gameDay.hasMoon});
    const radius=TILE_X*fireProfile.reach*(.32+.68*strength)*pulse;
    const sway=reducedMotion?0:windSwayAt(fire.x,fire.y,worldClock)*windStrengthAt(fire.x,fire.y)*TILE_X*.12;
    const lightX=p.x+sway,lightY=p.y+2;
    ctx.save();ctx.globalAlpha=strength*.22*pulse;ctx.globalCompositeOperation='screen';
    ctx.translate(lightX,lightY);ctx.scale(1,.66);
    const glow=ctx.createRadialGradient(0,0,2,0,0,radius);
    addSphericalFalloffStops(glow,.9,FIRELIGHT_RGB_STOPS,fireProfile.falloffExponent);
    ctx.fillStyle=glow;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
  }
}

function drawClearingHome() {
  const b=SHELTER_BOUNDS,spanX=(b.right-b.left+b.bottom-b.top)*TILE_X,spanY=(b.right-b.left+b.bottom-b.top)*TILE_Y;
  drawCachedGeometry(`shelter-standard-v5:${gameDay.daylight<.32?'night':'day'}`,{x:(b.left+b.right)/2,y:(b.top+b.bottom)/2},
    {left:-spanX*.58,right:spanX*.58,top:-spanY*.64-(RECEPTION_BUILDING.height+RECEPTION_BUILDING.roofRise+1.5)*HEIGHT_PIXELS*spriteScale,bottom:spanY*.64+12*spriteScale},renderClearingHome);
  const front=point(CLEARING_DOOR.x,CLEARING_DOOR.y);
  for(const step of [0.48,1.04,1.6]){
    const p=point(CLEARING_DOOR.x+(step === 1.04 ? 0.08 : 0),CLEARING_DOOR.y+step);
    diamond(p.x,p.y,step===1.04?'#796b52':'#8b7a5c','#ad98704f');
  }
  if(Math.hypot(localPosition.x-CLEARING_DOOR.x,localPosition.y-CLEARING_DOOR.y)<2){
    ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffe3a2';ctx.fillText('E · Recepção da Vila',front.x,front.y+27);
  }
}
function renderClearingHome() {
  drawBuildingExterior(ctx,RECEPTION_BUILDING,(x,y,z)=>point(x,y,camera,z),drawPixelPolygon,spriteScale,
    {windowsLit:gameDay.daylight<.32});
}

function drawCachedBuildingCanopy(building){
  const paint=()=>drawBuildingCanopy(ctx,building,(x,y,z)=>point(x,y,camera,z),drawPixelPolygon,spriteScale);
  if(buildingUsesAuthoredExterior(building)){paint();return;}
  const canopy=buildingArchitecture(building).canopy;if(!canopy)return;
  const anchor={x:canopy.right,y:canopy.bottom},origin=point(anchor.x,anchor.y,camera,0),corners=[];
  for(const x of [canopy.left-.2,canopy.right+.2])for(const y of [canopy.top-.2,canopy.bottom+.2])
    for(const z of [canopy.z-.4,canopy.z+1])corners.push(point(x,y,camera,z));
  const margin=8*spriteScale;
  const bounds={left:Math.floor(Math.min(...corners.map(p=>p.x))-origin.x-margin),
    right:Math.ceil(Math.max(...corners.map(p=>p.x))-origin.x+margin),
    top:Math.floor(Math.min(...corners.map(p=>p.y))-origin.y-margin),
    bottom:Math.ceil(Math.max(...corners.map(p=>p.y))-origin.y+margin)};
  drawCachedGeometry(`canopy:${building.id}`,anchor,bounds,paint,canopyGeometryCache);
}
function drawVillageBuilding(building) {
  const b=building.bounds,anchor={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};
  const screenSpanX=(b.right-b.left+b.bottom-b.top)*TILE_X,
    screenSpanY=(b.right-b.left+b.bottom-b.top)*TILE_Y;
  drawCachedGeometry(`village-building:v5:${building.id}:${gameDay.daylight<.32?'night':'day'}`,anchor,
    {left:-screenSpanX*.58,right:screenSpanX*.58,
      top:-screenSpanY*.64-(building.height+building.roofRise)*HEIGHT_PIXELS*spriteScale-28*spriteScale,
      bottom:screenSpanY*.64+12*spriteScale},()=>renderVillageBuilding(building));
}

function renderVillageBuilding(building) {
  drawBuildingExterior(ctx,building,(x,y,z)=>point(x,y,camera,z),drawPixelPolygon,spriteScale,
    {windowsLit:gameDay.daylight<.32});
  const service = CABIN_EXTERIOR_SERVICES[building.id];
  if (service) {
    const { x, y } = service.anchor;
    const project = (px, py, z) => point(px, py, camera, z);
    const foot = project(x, y - .45, 0), top = project(x, y - .45, 1.05);
    ctx.save(); ctx.strokeStyle = '#72583d'; ctx.lineWidth = 3 * spriteScale;
    ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(top.x, top.y); ctx.stroke(); ctx.restore();
    drawWallLabel(ctx, project, { x, y: y - .45, z: .85, width: 1.15, text: 'PLACA' }, spriteScale);
    const ring = [[x-.25,y],[x,y-.25],[x+.25,y],[x,y+.25]].map(([px,py]) => { const p=project(px,py,.015); return [p.x,p.y]; });
    drawPixelPolygon(ring, '#cbb17a28', '#cbb17a70');
  }
}

function drawElevatedSurface(level,accessLeft,accessBottom,room) {
  const vertex=(x,y,z)=>{const p=point(x,y,camera,0);return [Math.round(p.x),Math.round(p.y-z*HEIGHT_PIXELS*spriteScale)]};
  const patch=(x1,y1,x2,y2,z1,z2,color)=>drawPixelPolygon([vertex(x1,y1,z1),vertex(x2,y1,z1),vertex(x2,y2,z2),vertex(x1,y2,z2)],color);
  const face=(x1,y1,x2,y2,z1,z2,color)=>drawPixelPolygon([vertex(x1,y1,z1),vertex(x2,y2,z2),vertex(x2,y2,0),vertex(x1,y1,0)],color);
  const seam=(x1,y1,x2,y2,z1,z2,color)=>{ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...vertex(x1,y1,z1));ctx.lineTo(...vertex(x2,y2,z2));ctx.stroke()};
  const wood=room?'#ad8b61':'#4e7051',front=room?'#80603f':'#525e62',side=room?'#654832':'#343f48';
  const rampLeft=room?9:16,rampRight=room?level.right:18,stairsLeft=room?7:20,stairsRight=room?9:22;
  const stairEnd=room?9:20;
  // Whole planes have no tiny tile seams, and their two faces catch different light.
  face(level.right,level.top,level.right,level.bottom,2,2,side);
  face(room?level.left:18,level.bottom,room?7:20,level.bottom,2,2,front);
  patch(level.left,level.top,level.right,level.bottom,2,2,wood);
  for(let y=level.top+.5;y<level.bottom;y+=.5)if(room){
    seam(level.left,y,level.right,y,2,2,'#71523666');
    for(let x=level.left+1+(Math.round(y*2)%2);x<level.right;x+=2)seam(x,y-.5,x,y,2,2,'#71523655');
  }
  if(!room)for(let y=level.top+.6;y<level.bottom;y+=1.1)for(let x=level.left+.7;x<level.right;x+=1.3){const v=vertex(x,y,2);ctx.fillStyle='#7f9666';ctx.fillRect(v[0],v[1],3,1);ctx.fillRect(v[0]+1,v[1]-2,1,2)}
  // Eight distinct treads match the quantized collision surface exactly.
  const tread=(stairEnd-level.bottom)/8;
  for(let i=0;i<8;i++){
    const y=level.bottom+i*tread,z=(7-i)/4,above=z+.25;
    drawPixelPolygon([vertex(stairsLeft,y,above),vertex(stairsRight,y,above),vertex(stairsRight,y,z),vertex(stairsLeft,y,z)],front);
    face(stairsRight,y,stairsRight,y+tread,z,z,side);
    patch(stairsLeft,y,stairsRight,y+tread,z,z,wood);
    seam(stairsLeft,y,stairsRight,y,z,z,room?'#d8b983':'#829772');
  }
  face(rampRight,level.bottom,rampRight,accessBottom,2,0,side);
  patch(rampLeft,level.bottom,rampRight,accessBottom,2,0,wood);
  if(room)for(let y=level.bottom+.5;y<accessBottom;y+=.5){const z=(accessBottom-y)*2/(accessBottom-level.bottom);seam(rampLeft,y,rampRight,y,z,z,'#73553b66')}
  const label=point(room?8:17,room?9.6:20.4);

}

// Parquet planks for the public hotel lobby. Each plank is a 2 × 0.5 tile
// rectangle in one palette tone; rows are offset by half a plank, and the
// joint outline keeps the butt joints readable at the game's zoom.
function drawHotelParquet(bounds,tones){
  const palette=tones?.length?tones:['#8b6c4d','#987654','#816448','#927351'];
  const row=.5,plank=2,joint='#4f3b2b66';
  for(let index=0,y=bounds.top;y<bounds.bottom-1e-6;y+=row,index++){
    const shift=index%2?plank/2:0;
    for(let x=bounds.left-plank+shift,plankIndex=index*3;x<bounds.right;x+=plank,plankIndex++){
      const x0=Math.max(bounds.left,x),x1=Math.min(bounds.right,x+plank),y1=Math.min(bounds.bottom,y+row);
      if(x1-x0<1e-6)continue;
      const corners=[[x0,y],[x1,y],[x1,y1],[x0,y1]].map(([px,py])=>{const p=point(px,py,camera,0);return [p.x,p.y]});
      drawPixelPolygon(corners,palette[((plankIndex%palette.length)+palette.length)%palette.length],joint);
    }
  }
}

function drawRoomInterior() {
  const roomLayout=currentRoomLayout(),bounds=roomLayout.bounds;
  const palette=roomLayout.palette||{};
  const atmosphere=roomAtmosphere(roomLayout);
  const floorCorners=[[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.right,bounds.bottom],[bounds.left,bounds.bottom]].map(([x,y])=>{const p=point(x,y,camera,0);return [p.x,p.y]});
  const shape=interiorFloorShape(roomLayout);
  const edges=shape ? shape.outline.slice(1).map((p,i)=>[shape.outline[i],p]).slice(1)
    : [[[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]],[[bounds.right,bounds.top],[bounds.right,bounds.bottom]]];
  for(const edge of edges){
    const top=edge.map(([x,y])=>point(x,y,camera,0)),bottom=edge.slice().reverse().map(([x,y])=>point(x,y,camera,-.14));
    drawPixelPolygon([...top,...bottom].map(p=>[p.x,p.y]),'#584a38');
  }
  ctx.save();
  if(shape){
    ctx.beginPath();shape.outline.forEach(([x,y],i)=>{const p=point(x,y,camera,0);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)});
    ctx.closePath();ctx.clip();
  }
  drawMaterial(drawPixelPolygon,floorCorners,4,12,palette.floor||['#8b6c4d','#927352','#86694b','#90704d'],'#57453555',true);
  // The public lobby gets crafted parquet: planks alternate tones and butt-join
  // on a staggered grid, so the floor reads as wood rather than a flat sheet.
  if(roomLayout.id==='hotel-lobby')drawHotelParquet(bounds,palette.floor);
  // Two woven waiting-area rugs use the authored hotel rug palette while
  // keeping the central approach to the counter and entrance unobstructed.
  if(roomLayout.id==='hotel-lobby' && roomLayout.rug){
    for(const [left,right] of [[2.2,6.9],[10.2,13.15]]){
      const rug=(inset,color)=>{const z=.012,corners=[[left+inset,5.95+inset],[right-inset,5.95+inset],
        [right-inset,9.85-inset],[left+inset,9.85-inset]].map(([x,y])=>{const p=point(x,y,camera,z);return [p.x,p.y]});
        drawPixelPolygon(corners,color);};
      rug(0,palette.rugEdge||'#c8aa77');rug(.09,'#263c34');rug(.18,palette.rug||'#405e51');
    }
  }
  ctx.save();ctx.strokeStyle='#5e49374d';ctx.lineWidth=Math.max(1,spriteScale*.42);
  for(let y=bounds.top+.5;y<bounds.bottom;y+=.5){
    const first=point(bounds.left,y),last=point(bounds.right,y);
    ctx.beginPath();ctx.moveTo(first.x,first.y);ctx.lineTo(last.x,last.y);ctx.stroke();
    const stagger=Math.round(y*2)%2;
    for(let x=bounds.left+1+stagger;x<bounds.right;x+=2){
      const joint=point(x,y),end=point(x,y+.48);
      ctx.beginPath();ctx.moveTo(joint.x,joint.y);ctx.lineTo(end.x,end.y);ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore(); // floor footprint clip
  const roomLevel=roomLayout.elevation==='raised'?ROOM_LEVEL:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.top,height:0};
  if(roomLayout.elevation==='raised')drawElevatedSurface(ROOM_LEVEL,7,10,true);
  // Keep the exit lane visually clear; room floors no longer draw rugs.
  const wall = (x1,y1,x2,y2,color,z) => {
    const h=roomLayout.wallHeight,t=roomLayout.wallThickness;
    const project=(x,y,height)=>{const p=point(x,y,camera,height);return [Math.round(p.x),Math.round(p.y)];};
    const a=project(x1,y1,z),b=project(x2,y2,z),c=project(x2,y2,z+h),d=project(x1,y1,z+h);
    drawPixelPolygon([a,b,c,d],color);
    const normal=x1===x2?[-t,0]:[0,-t];
    drawPixelPolygon([d,c,project(x2+normal[0],y2+normal[1],z+h),project(x1+normal[0],y1+normal[1],z+h)],atmosphere.trim);
    const facade={x1,y1,x2,y2,bottom:z,top:z+h};
    const face=(u1,v1,u2,v2,fill)=>drawPixelPolygon(facadePanel(
      (x,y,height)=>point(x,y,camera,height),facade,u1,v1,u2,v2),fill);
    face(0,0,1,.065,'#514536');
    face(0,.96,1,1,atmosphere.trim);
    face(0,.28,1,.315,atmosphere.panelEdge);
    face(0,.315,1,.34,atmosphere.trim);
    face(0,.075,1,.28,atmosphere.panel);
    const span=Math.abs(x2-x1)+Math.abs(y2-y1);
    const boards=Math.max(3,Math.ceil(span/1.05));
    for(let index=1;index<boards;index++){
      const u=index/boards;
      face(u-.006,.085,u+.006,.28,atmosphere.panelEdge);
    }
    const wallpaperLines=Math.max(4,Math.ceil(span/.48));
    for(let index=1;index<wallpaperLines;index++){
      const u=index/wallpaperLines;
      face(u-.0025,.405,u+.0025,.93,atmosphere.wallpaperStripe);
    }
    for(const u of [0,.5,1])face(Math.max(0,u-.009),.04,Math.min(1,u+.009),.96,atmosphere.panelEdge);
  };
  for(const section of roomWallSections(bounds,roomLevel,shape))wall(section.x1,section.y1,section.x2,section.y2,
    section.side?atmosphere.sideWall:atmosphere.wall,section.z);
  if(roomLayout.elevation==='raised'){
    const stepUpper=point(bounds.left,ROOM_LEVEL.bottom,camera,ROOM_LEVEL.height),stepLower=point(bounds.left,ROOM_LEVEL.bottom,camera,0);
    drawPixelPolygon([[stepUpper.x,stepUpper.y-roomLayout.wallHeight*HEIGHT_PIXELS*spriteScale],[stepUpper.x+3*spriteScale,stepUpper.y-roomLayout.wallHeight*HEIGHT_PIXELS*spriteScale],
      [stepLower.x+3*spriteScale,stepLower.y-roomLayout.wallHeight*HEIGHT_PIXELS*spriteScale],[stepLower.x,stepLower.y-roomLayout.wallHeight*HEIGHT_PIXELS*spriteScale]],'#a08160');
  }


  const project=(x,y,z)=>point(x,y,camera,z);
  const decor=roomWallDecor(roomLayout);
  const wallBase=roomLayout.elevation==='flat'?0:2;
  const lampX=decor.window?.x??(bounds.left+bounds.right)/2,lampHeight=wallBase+(decor.window?.top??2.85)+.3;
  if(decor.window){
    const windowWall={x1:lampX-decor.window.width/2,y1:bounds.top,x2:lampX+decor.window.width/2,y2:bounds.top,
      bottom:wallBase+decor.window.bottom,top:wallBase+decor.window.top};
    drawFacadeWindow(drawPixelPolygon,project,windowWall,{lit:gameDay.daylight>.08});
    const curtain=(u1,v1,u2,v2,fill)=>drawPixelPolygon(facadePanel(project,windowWall,u1,v1,u2,v2),fill);
    curtain(-.05,.9,1.05,.97,atmosphere.curtainRod);
    curtain(-.02,.16,.2,.88,atmosphere.curtainShade);
    curtain(.8,.16,1.02,.88,atmosphere.curtainShade);
    curtain(.015,.18,.16,.84,atmosphere.curtain);
    curtain(.84,.18,.985,.84,atmosphere.curtain);
    curtain(.2,.82,.8,.94,atmosphere.curtain);
    curtain(.08,.48,.22,.53,atmosphere.curtainLight);
    curtain(.78,.48,.92,.53,atmosphere.curtainLight);
    curtain(.02,.12,.095,.2,atmosphere.curtainRod);
    curtain(.905,.12,.98,.2,atmosphere.curtainRod);
  }
  const artPalette=atmosphere.art;
  if(decor.artX!==null){
  const artCenterX=decor.artX,artWidth=decor.artWidth;
  const artBaseZ=roomLayout.elevation==='flat'?1.38:3.4,artHeight=.92;
  const artPoint=(u,v)=>{const p=project(artCenterX-artWidth/2+artWidth*u,bounds.top,artBaseZ+artHeight*v);return [Math.round(p.x),Math.round(p.y)]};
  drawPixelPolygon([artPoint(0,0),artPoint(1,0),artPoint(1,1),artPoint(0,1)],'#49392e','#261f1c');
  drawPixelPolygon([artPoint(.08,.09),artPoint(.92,.09),artPoint(.92,.91),artPoint(.08,.91)],'#c29b62','#725438');
  drawPixelPolygon([artPoint(.16,.18),artPoint(.84,.18),artPoint(.84,.82),artPoint(.16,.82)],artPalette.sky);
  drawPixelPolygon([artPoint(.16,.5),artPoint(.4,.37),artPoint(.57,.57),artPoint(.72,.33),artPoint(.84,.48),
    artPoint(.84,.82),artPoint(.16,.82)],artPalette.far);
  drawPixelPolygon([artPoint(.16,.63),artPoint(.37,.51),artPoint(.58,.7),artPoint(.73,.53),artPoint(.84,.63),
    artPoint(.84,.82),artPoint(.16,.82)],artPalette.near);
  const sun=artPoint(.69,.68);ctx.fillStyle=artPalette.sun;ctx.fillRect(sun[0]-1,sun[1]-1,3,3);
  }

  // The front wall is cut away: show the walkable threshold on the floor,
  // rather than an upright door panel floating without a supporting wall.
  const roomDoor=roomLayout.door,landing=roomLayout.spawn;
  if(roomLayout.elevation==='flat'){
    const strip=[[roomDoor.x-.54,bounds.bottom-.04],[roomDoor.x+.54,bounds.bottom-.04],
      [landing.x+.5,landing.y+.28],[landing.x-.5,landing.y+.28]]
      .map(([x,y])=>{const p=project(x,y,.012);return [p.x,p.y];});
    drawPixelPolygon(strip,'#927c55');
  }
  const tile=(half,color)=>drawPixelPolygon([
    project(landing.x-half,landing.y-half,.025),project(landing.x+half,landing.y-half,.025),
    project(landing.x+half,landing.y+half,.025),project(landing.x-half,landing.y+half,.025),
  ].map(p=>[Math.round(p.x),Math.round(p.y)]),color);
  tile(.58,'#483a30');
  tile(.47,'#c6a16a');
  tile(.35,'#8c704f');

}

// Low cutaway partitions reveal the actor while still showing the corridor.
function drawInteriorPartition(item) {
  const p=(x,y,z)=>{const v=point(x,y,camera,z);return [v.x,v.y];};
  const {left,right,top,bottom,height}=item;
  drawPixelPolygon([p(left,bottom,0),p(right,bottom,0),p(right,bottom,height),p(left,bottom,height)], '#786954');
  drawPixelPolygon([p(right,top,0),p(right,bottom,0),p(right,bottom,height),p(right,top,height)], '#594d40');
  drawPixelPolygon([p(left,top,height),p(right,top,height),p(right,bottom,height),p(left,bottom,height)], '#b99a6e');
  const face=(bottom-top>right-left)
    ? {x1:right,y1:top,x2:right,y2:bottom,bottom:0,top:height}
    : {x1:left,y1:bottom,x2:right,y2:bottom,bottom:0,top:height};
  const project=(x,y,z)=>point(x,y,camera,z);
  for(const [v1,v2,color] of [[0,.12,'#514335'],[.12,.18,'#b08b60'],[.76,.84,'#514335']])
    drawPixelPolygon(facadePanel(project,face,0,v1,1,v2),color);
}

function drawRoomFixture(item) {
  const height=surfaceHeight(item.x,item.y,'room',currentRoomLayout());
  const p=point(item.x,item.y,camera,height);
  if(item.kind!=='bed-cover')drawSoftShadow(p.x,p.y+2*spriteScale,(item.width+item.depth)*TILE_X*.35,
    (item.width+item.depth)*TILE_Y*.25,0,.24);
  drawRoomFixtureAsset(ctx,item,p,{tileX:TILE_X,tileY:TILE_Y,heightPixels:HEIGHT_PIXELS,scale:spriteScale});
  if(item.surfaceProps)drawSurfaceProps(item,height);
}

// Small decorative objects on a table top: a flat book or a clay jar. Their
// sizes are in screen pixels, scaled like the room sprites.
function drawSurfaceProps(item,baseHeight){
  const top=baseHeight+item.height;
  for(const prop of item.surfaceProps){
    const base=point(item.x+prop.dx,item.y+prop.dy,camera,top+(prop.h||0));
    if(prop.kind==='book'){
      const w=8*spriteScale,h=3*spriteScale;
      drawPixelPolygon([[base.x-w/2,base.y],[base.x+w/2,base.y],[base.x+w/2,base.y-h],[base.x-w/2,base.y-h]],prop.color||'#7a3e2e','#2e1d16');
    }else{
      const r=3.5*spriteScale,h=7*spriteScale;
      drawPixelPolygon([[base.x-r,base.y],[base.x+r,base.y],[base.x+r*.6,base.y-h],[base.x-r*.6,base.y-h]],'#c9a36a','#4d3a25');
    }
  }
}

function drawRoomCounter() {
  const layout=currentRoomLayout(),b=layout.counter;
  if(!b)return;
  if(b.surfaceModel){
    const model=furnitureVisual({kind:'table',catalogId:b.surfaceModel});
    for(let index=0;index<b.surfaceCount;index++)drawRoomFixture({...model,
      x:b.left+(index+.5)*model.width,y:(b.top+b.bottom)/2,rotation:0,rotatable:true});
  }else drawRoomFixture({kind:'counter',x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,
    width:b.right-b.left,depth:b.bottom-b.top,height:b.height||BUILDING_STANDARD.counterHeight,
    palette:layout.id==='hotel-lobby'?'hotel':'cedar'});
  const project=(x,y,z)=>point(x,y,camera,z);
  for(const service of placeServicePoints(serviceContext(),layout)){
    drawWallLabel(ctx,project,{x:service.x,y:b.bottom+.01,z:BUILDING_STANDARD.counterHeight*.6,
      width:Math.min(1.8,(b.right-b.left)*.42),text:service.label.toUpperCase()},spriteScale);
    const marker=project(service.x,service.y,.015);
    ctx.save();ctx.strokeStyle='#d8be8280';ctx.lineWidth=Math.max(1,spriteScale*.5);
    ctx.beginPath();ctx.ellipse(marker.x,marker.y,TILE_X*.16,TILE_Y*.16,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
}

function drawRoomFurniture(item,preview=false,valid=true) {
  const layout=currentRoomLayout(),pose=preview?{item,progress:1,fromRotation:item.rotation||0}:roomFurniturePose(item),display=pose.item;
  const p=point(display.x,display.y,camera,surfaceHeight(display.x,display.y,'room',layout)+(display.baseZ||0));
  const radius=roomFurnitureFootprintRadius(display);
  const movingSource=!preview&&roomBuildMode==='move'&&roomMovingId===item.id;
  const occupiedBed=!preview&&display.kind==='bed'&&[...livePlayers.values()].some(player=>player.furnitureUse?.id===display.id&&player.furnitureUse.action==='lie');
  if(!preview&&!movingSource)drawSoftShadow(p.x,p.y+spriteScale,radius*TILE_X*1.7,radius*TILE_Y,0,.3);
  ctx.save();
  const alpha=preview?(valid ? .72 : .42):(movingSource ? .28 : 1);
  const targetVisual=furnitureVisual(display),spriteVisual=occupiedBed?{...targetVisual,cover:false}:targetVisual,
    rotating=!preview&&pose.progress<1&&pose.fromRotation!==(display.rotation||0);
  if(rotating){
    ctx.globalAlpha=alpha*(1-pose.progress);
    drawRoomFixtureAsset(ctx,{...spriteVisual,rotation:pose.fromRotation},p,
      {tileX:TILE_X,tileY:TILE_Y,heightPixels:HEIGHT_PIXELS,scale:spriteScale});
    ctx.globalAlpha=alpha*pose.progress;
  }else ctx.globalAlpha=alpha;
  drawRoomFixtureAsset(ctx,spriteVisual,p,{tileX:TILE_X,tileY:TILE_Y,heightPixels:HEIGHT_PIXELS,scale:spriteScale});
  if(preview||movingSource||roomSelectedId===item.id){
    ctx.strokeStyle=movingSource||roomSelectedId===item.id?'#f1ce7f':valid?'#b8d99a':'#e98b6d';ctx.lineWidth=Math.max(1,spriteScale);
    ctx.beginPath();ctx.ellipse(p.x,p.y,radius*TILE_X*1.4,radius*TILE_Y*1.4,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function drawRoomFurnitureLayer(item,part){
  const pose=roomFurniturePose(item),display=pose.item,p=point(display.x,display.y,camera,
    surfaceHeight(display.x,display.y,'room',currentRoomLayout())+(display.baseZ||0));
  const movingSource=roomBuildMode==='move'&&roomMovingId===item.id;
  if(part==='chair-back'&&!movingSource)drawSoftShadow(p.x,p.y+spriteScale,
    roomFurnitureFootprintRadius(display)*TILE_X*1.7,roomFurnitureFootprintRadius(display)*TILE_Y,0,.3);
  const visual={...furnitureVisual(display),renderLayer:part};
  const alpha=movingSource ? .28 : 1;
  ctx.save();ctx.globalAlpha=alpha;
  if(pose.progress<1&&pose.fromRotation!==(display.rotation||0)){
    ctx.globalAlpha=alpha*(1-pose.progress);
    drawRoomFixtureAsset(ctx,{...visual,rotation:pose.fromRotation},p,{tileX:TILE_X,tileY:TILE_Y,heightPixels:HEIGHT_PIXELS,scale:spriteScale});
    ctx.globalAlpha=alpha*pose.progress;
  }
  drawRoomFixtureAsset(ctx,visual,p,{tileX:TILE_X,tileY:TILE_Y,heightPixels:HEIGHT_PIXELS,scale:spriteScale});
  if(part==='chair-front'&&(movingSource||roomSelectedId===item.id)){
    const radius=roomFurnitureFootprintRadius(display);ctx.strokeStyle='#f1ce7f';ctx.lineWidth=Math.max(1,spriteScale);
    ctx.beginPath();ctx.ellipse(p.x,p.y,radius*TILE_X*1.4,radius*TILE_Y*1.4,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function drawWaterReeds() {
  const reeds=[];
  const bounds=getVisibleWorldBounds(),lakeBounds={left:bounds.left-48,right:bounds.right+48,top:bounds.top-48,bottom:bounds.bottom+48};
  for(const lake of getLakesInBounds(lakeBounds)){
    if(Array.isArray(lake.outline)&&lake.outline.length){
      const stride=Math.max(1,Math.floor(lake.outline.length/7));
      for(let index=0;index<lake.outline.length;index+=stride){
        const [dx,dy]=lake.outline[index],length=Math.hypot(dx,dy)||1;
        const x=lake.x+dx+dx/length*(WATER_BANK_WIDTH+.28),y=lake.y+dy+dy/length*(WATER_BANK_WIDTH+.28);
        if(x>=bounds.left-3&&x<=bounds.right+3&&y>=bounds.top-3&&y<=bounds.bottom+3)reeds.push([x,y]);
      }
    }else{
      for(const angle of [-.75,.18,1.05]){
        const radius=lake.radius+WATER_BANK_WIDTH+.18,x=lake.x+Math.cos(angle)*radius,y=lake.y+Math.sin(angle)*radius;
        if(x>=bounds.left-3&&x<=bounds.right+3&&y>=bounds.top-3&&y<=bounds.bottom+3)reeds.push([x,y]);
      }
    }
  }
  for(const route of waterwayRoutesForDimension(worldDimensionId,dimensionTheme,WORLD_WATER_ORIGIN)){
    if(route.bounds.right<bounds.left-3||route.bounds.left>bounds.right+3||route.bounds.bottom<bounds.top-3||route.bounds.top>bounds.bottom+3)continue;
    for(let index=1;index<route.points.length-1;index+=3){
      const a=route.points[index-1],b=route.points[index+1],length=Math.hypot(b.x-a.x,b.y-a.y)||1;
      const nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
      const centre=route.points[index];
      const bankOffset=Math.max(route.maxRenderWidth||route.width,route.width)+WATER_BANK_WIDTH+.18;
      const x=centre.x+nx*bankOffset,y=centre.y+ny*bankOffset;
      if(x>=bounds.left-3&&x<=bounds.right+3&&y>=bounds.top-3&&y<=bounds.bottom+3)reeds.push([x,y]);
    }
  }
  for (const [x, y] of reeds) {
    if(waterSurfaceBankDepthAt(x,y,WORLD_WATER_OPTIONS)>0)continue;
    const gust=reducedMotion?0:windSwayAt(x,y,worldClock)*windStrengthAt(x,y)*2.4;
    const p = point(x, y);
    ctx.save(); scaleAround(p, spriteScale);
    const bend=Math.round(gust);
    ctx.fillStyle = CLAREIRA.tree.reed; ctx.fillRect(Math.round(p.x + bend), Math.round(p.y - 5), 1, 6);
    ctx.fillStyle = CLAREIRA.tree.reedTip; ctx.fillRect(Math.round(p.x + bend + 1), Math.round(p.y - 5), 2, 2);
    ctx.fillStyle = CLAREIRA.tree.reedLight; ctx.fillRect(Math.round(p.x - 3 + bend), Math.round(p.y - 2), 3, 1);
    ctx.restore();
  }
}

function drawWaterSplashes() {
  for(let index=waterSplashes.length-1;index>=0;index--){
    const splash=waterSplashes[index],age=worldClock-splash.born;
    if(age<0||age>.48||splash.dimensionId!==worldDimensionId||splash.location!==worldLocation){waterSplashes.splice(index,1);continue;}
    const p=point(splash.x,splash.y),progress=age/.48,strength=splash.strength||1;
    const themeWater=WATER_PALETTES[dimensionTheme]?.[2]||WATER_PALETTES.forest[2];
    ctx.save();ctx.globalAlpha=(1-progress)*.72;
    ctx.strokeStyle=themeWater;ctx.lineWidth=Math.max(1,spriteScale);
    ctx.beginPath();ctx.ellipse(p.x,p.y+1,Math.max(2,(4+progress*12)*strength),Math.max(1,(1+progress*2.5)*strength),0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=themeWater;
    const drift=progress*5*strength;
    for(let drop=0;drop<3;drop++){
      const side=drop-1,phase=drop*2.1+(splash.seed||0);
      const x=p.x+Math.sin(phase)*drift*1.3+side*2,y=p.y-2-drift*(.7+(drop%2)*.35);
      ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(spriteScale)),Math.max(1,Math.round(spriteScale)));
    }
    ctx.restore();
  }
}

function drawTree(tree,index,p,selfScreen,interaction,simplified=false,arrivalWarm=false) {
  const scale=spriteScale*.7;
  if(p.x < -110 || p.x>viewWidth+110 || p.y< -10 || p.y>viewHeight+150)return;
  const hidden=worldLocation==='clearing' && Math.abs(selfScreen.x-p.x)<42*scale && selfScreen.y<p.y && selfScreen.y>p.y-105*scale;
  sceneArt.tree(ctx,p,index,scale,hidden,worldClock,SOLID_TREE_LIGHTING.get(tree)?.warm===true||arrivalWarm,tree.x,tree.y,reducedMotion,interaction,decorativeDetailLevel,simplified);
}

function drawTreeGrowth(tree) {
  const p = point(tree.x, tree.y);
  ctx.save(); scaleAround(p, spriteScale);
  drawSoftShadow(p.x, p.y + 2, tree.stage === 'stump' ? 10 : 7, 3, .16, .45);
  if (tree.stage === 'stump') {
    ctx.fillStyle = '#503b2e'; ctx.fillRect(Math.round(p.x - 6), Math.round(p.y - 4), 12, 5);
    ctx.fillStyle = '#9a7045'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 6), 10, 3);
    ctx.fillStyle = '#d0a76d'; ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 5), 6, 1);
    ctx.fillStyle = '#594332'; ctx.fillRect(Math.round(p.x + 1), Math.round(p.y - 5), 2, 2);
  } else {
    const young = tree.stage === 'youngTree';
    const trunkHeight = young ? 8 : 5;
    ctx.fillStyle = '#65452f'; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - trunkHeight), 3, trunkHeight + 2);
    ctx.fillStyle = young ? '#476540' : '#557349';
    ctx.fillRect(Math.round(p.x - (young ? 5 : 4)), Math.round(p.y - trunkHeight - (young ? 7 : 5)), young ? 10 : 8, young ? 8 : 6);
    ctx.fillStyle = young ? '#83a05c' : '#91a960';
    ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - trunkHeight - (young ? 8 : 6)), 4, 3);
    ctx.fillStyle = '#c0a468'; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 2), 2, 2);
  }
  ctx.restore();
}

function drawWorldRock(rock) {
  const p = point(rock.x, rock.y);
  const z = surfaceHeight(rock.x, rock.y, 'clearing');
  const top = point(rock.x, rock.y, camera, z + .22);
  const left = point(rock.x - .28, rock.y, camera, z + .05);
  const right = point(rock.x + .28, rock.y, camera, z + .05);
  const front = point(rock.x, rock.y + .22, camera, z);
  drawPixelPolygon([[left.x,left.y],[p.x-2,p.y+2],[front.x,front.y],[p.x+3,p.y+1],[right.x,right.y],[p.x+4,p.y-2],[top.x,top.y],[p.x-4,p.y-2]], '#3b484a');
  drawPixelPolygon([[left.x,left.y],[p.x-2,p.y+2],[p.x-1,p.y-2],[top.x,top.y],[p.x+1,p.y-2]], '#82908a');
  drawPixelPolygon([[top.x,top.y],[p.x+1,p.y-2],[p.x+4,p.y-2],[right.x,right.y]], '#58696a');
  ctx.fillStyle = '#b5b296'; ctx.fillRect(Math.round(p.x-2), Math.round(top.y+2), 3, 1);
}

function drawFallenTree(tree, section = 0){
  // Clip one fifth of the cached cylinder; each slice has its own ground depth.
  const p=point(tree.x,tree.y),step=FALLEN_TREE_HALF_LENGTH*2/5;
  const left=section===0?0:Math.round(p.x+(-FALLEN_TREE_HALF_LENGTH+section*step)*TILE_X);
  const right=section===4?viewWidth:Math.round(p.x+(-FALLEN_TREE_HALF_LENGTH+(section+1)*step)*TILE_X);
  if(right<=0||left>=viewWidth)return;
  ctx.save();ctx.beginPath();ctx.rect(left,0,right-left,viewHeight);ctx.clip();
  drawCachedGeometry(`fallen:${tree.x}:${tree.y}`,tree,
    {left:-TILE_X*2,right:TILE_X*2,top:-TILE_Y*2-30*spriteScale,bottom:TILE_Y*2+10*spriteScale},()=>renderFallenTree(tree),fallenGeometryCache);
  ctx.restore();
}
function renderFallenTree(tree){
  const floor=surfaceHeight(tree.x,tree.y,'clearing'),radius=FALLEN_TREE_HEIGHT;
  const ring=(x,angle,scale=1)=>{const p=point(x,tree.y+Math.cos(angle)*FALLEN_TREE_RADIUS*scale,camera,floor+radius+Math.sin(angle)*radius*scale);return [Math.round(p.x),Math.round(p.y)]};
  const left=tree.x-FALLEN_TREE_HALF_LENGTH,right=tree.x+FALLEN_TREE_HALF_LENGTH;
  const bands=[Math.PI/2,Math.PI/4,0,-Math.PI/4,-Math.PI/2];
  const bark=['#96724b','#755337','#513b2e','#302c27'];
  for(let i=0;i<bands.length-1;i++)drawPixelPolygon([ring(left,bands[i]),ring(right,bands[i]),ring(right,bands[i+1]),ring(left,bands[i+1])],bark[i]);
  // Jagged bark follows the round shoulder instead of flat, parallel plank lines.
  for(let i=0;i<6;i++){
    const x=left+.2+i*.36,a=ring(x,.18),b=ring(x+.22,.3),c=ring(x+.28,.12);
    drawPixelPolygon([a,b,c,[c[0],c[1]+2],[b[0],b[1]+2],[a[0],a[1]+2]],'#342d27');
    const light=ring(x,.92);ctx.fillStyle='#b08c5b';ctx.fillRect(light[0],light[1],3,1);
  }
  const cap=(x,scale,color)=>drawPixelPolygon(Array.from({length:12},(_,i)=>ring(x,i*Math.PI/6,scale)),color);
  cap(right,1,'#3b3028');cap(right,.7,'#68523b');
  cap(left,1,'#332b25');cap(left,.85,'#b49362');cap(left,.6,'#735b3d');cap(left,.45,'#c4a66e');cap(left,.19,'#76583c');
  // Broken branch and root splinters give the trunk an irregular silhouette.
  const branch=point(tree.x+.35,tree.y,camera,floor+.82),tip=point(tree.x+.1,tree.y+.12,camera,floor+1.65);
  drawPixelPolygon([[branch.x-4,branch.y+2],[tip.x-3,tip.y],[tip.x+2,tip.y-3],[branch.x+5,branch.y]],'#49392e');
  drawPixelPolygon([[branch.x-2,branch.y],[tip.x-1,tip.y],[tip.x+1,tip.y-1],[branch.x+1,branch.y]],'#a78351');
  for(const offset of [-.16,.14]){
    const root=point(left-.12,tree.y+offset,camera,floor+.38),end=point(left-.4,tree.y+offset*2,camera,floor+.2);
    drawPixelPolygon([[root.x,root.y-3],[end.x,end.y-1],[end.x-3,end.y+1],[root.x,root.y+2]],'#715136');
  }
}
function drawWorldShadows(frameFires, litFires=frameFires) {
  frameShadowDirectionAt=null;
  if(worldLocation==='room'){
    const scene=currentSceneLights();
    frameShadowDirectionAt=(x,y)=>{
      let lamp=null,best=0;
      for(const light of scene.lights){const amount=lightAmount(light,{x,y,height:scene.surface(x,y)+.2},scene.obstacles);if(amount>best){lamp=light;best=amount;}}
      if(!lamp)return {x:.3,y:1,source:{kind:'ambient'},strength:.12,lengthScale:.75};
      const target=point(x,y),source=point(lamp.x,lamp.y,camera,lamp.height);
      const dx=target.x-source.x,dy=target.y-source.y,length=Math.hypot(dx,dy)||1;
      return {x:dx/length,y:dy/length,source:lamp,strength:.15+.45*best,lengthScale:.85};
    };return;
  }
  if(worldLocation!=='clearing')return;
  const shadowNow=performance.now();
  const architecturalScene=currentSceneLights();
  const fireProfile=nightEmitterProfile(FIRE_LIGHT_REACH,1.35,{night:gameDay.night,hasMoon:gameDay.hasMoon});
  const localLights=litFires.map(fire=>({kind:'fire',fire,x:fire.x,y:fire.y,
    height:surfaceHeight(fire.x,fire.y,'clearing')+1.2,reach:fireProfile.reach,
    falloffExponent:fireProfile.falloffExponent,strength:campfireFlameStrength(fire,shadowNow)}))
    .filter(light=>light.strength>.01);
  for(const light of architecturalScene.lights)localLights.push({...light});
  const carriedLanternProfile=nightEmitterProfile(4.8,1.7,{night:gameDay.night,hasMoon:gameDay.hasMoon});
  for(const light of carriedLanternSources())localLights.push({...light,kind:'lantern',reach:carriedLanternProfile.reach,
    falloffExponent:carriedLanternProfile.falloffExponent,strength:.65});
  const sunStrength=gameDay.sunlightStrength??gameDay.daylight;
  const moonStrength=gameDay.moonlightStrength;
  const hasSun=Boolean(gameDay.sunPosition&&sunStrength>=moonStrength&&sunStrength>.01);
  const globalLight=(()=>{
    if(sunStrength<=.001&&moonStrength<=.001)return null;
    // Celestial rays belong to the world: phone aspect ratio must not rotate them.
    const sunDirection=celestialShadowDirection(gameDay.sunPosition),moonDirection=celestialShadowDirection(gameDay.moonPosition);
    // At dawn and dusk the sun and moon overlap in strength; blend their directions
    // so the single stylized shadow turns smoothly instead of snapping across the scene.
    const mixedX=sunDirection.x*sunStrength+moonDirection.x*moonStrength;
    const mixedY=sunDirection.y*sunStrength+moonDirection.y*moonStrength;
    const mixedLength=Math.hypot(mixedX,mixedY);
    const direction=mixedLength>.001
      ? {x:mixedX/mixedLength,y:mixedY/mixedLength}
      : hasSun?sunDirection:moonDirection;
    const elevation=hasSun?gameDay.sunElevation:gameDay.moonElevation;
    return {
      kind:hasSun?'sun':'moon',
      directionX:direction.x,directionY:direction.y,
      lightStrength:Math.max(sunStrength,moonStrength),
      strength:hasSun ? .34 + .5*sunStrength : moonShadowProfile(moonStrength,elevation).strength,
      // Shadows lengthen as either celestial light approaches the horizon.
      lengthScale:hasSun ? .18+1.45*(1-elevation) : moonShadowProfile(moonStrength,elevation).lengthScale,
    };
  })();
  const shadowDirection=(x,y,ignoreOwner=null)=>{
    const p=point(x,y);
    let strongestLocalLight=null,strongestLocalStrength=0,strongestLocalDistance=0;
    for(const light of localLights){
      // A building cannot cast a shadow from its own windows or porch lantern,
      // but neighboring buildings' lights still illuminate its roof and walls.
      if(ignoreOwner&&light.owner===ignoreOwner)continue;
      const distance=Math.hypot(x-light.x,y-light.y);
      if(distance>=light.reach)continue;
      const strength=lightAmount(light,{x,y,height:surfaceHeight(x,y,'clearing')+.3},architecturalScene.obstacles);
      if(strength>strongestLocalStrength){strongestLocalLight=light;strongestLocalStrength=strength;strongestLocalDistance=distance;}
    }
    // Blend nearby emitters with the broad sky light so shadows turn gradually as
    // a fire or window becomes the stronger source.
    if(strongestLocalLight){
      const ratio=globalLight?strongestLocalStrength/Math.max(.01,globalLight.lightStrength):Infinity;
      const blendProgress=globalLight?Math.max(0,Math.min(1,(ratio-.65)/.9)):1;
      const localMix=blendProgress*blendProgress*(3-2*blendProgress);
      if(localMix>.001){
        const source=point(strongestLocalLight.x,strongestLocalLight.y,camera,strongestLocalLight.height);
        const localAngle=Math.atan2(p.y-source.y,p.x-source.x);
        const globalAngle=globalLight?Math.atan2(globalLight.directionY,globalLight.directionX):localAngle;
        let angleDelta=Math.atan2(Math.sin(localAngle-globalAngle),Math.cos(localAngle-globalAngle));
        if(Math.abs(Math.abs(angleDelta)-Math.PI)<.001)angleDelta=Math.PI;
        const angle=globalAngle+angleDelta*localMix;
        const localProfile=localShadowProfile(strongestLocalStrength,strongestLocalLight.kind,strongestLocalDistance);
        const localStrength=localProfile.strength,localLength=localProfile.lengthScale;
        return {
          x:Math.cos(angle),y:Math.sin(angle),
          source:!globalLight||localMix>.78?{kind:strongestLocalLight.kind,id:strongestLocalLight.id||strongestLocalLight.fire?.id,x:strongestLocalLight.x,y:strongestLocalLight.y}:{kind:globalLight.kind},
          strength:globalLight?globalLight.strength+(localStrength-globalLight.strength)*localMix:localStrength,
          lengthScale:globalLight?globalLight.lengthScale+(localLength-globalLight.lengthScale)*localMix:localLength,
        };
      }
    }
    if(!globalLight)return {x:0,y:1,source:{kind:'ambient'},strength:0,lengthScale:1};
    return {x:globalLight.directionX,y:globalLight.directionY,source:{kind:globalLight.kind},
      strength:globalLight.strength,lengthScale:globalLight.lengthScale};
  };
  frameShadowDirectionAt=shadowDirection;


  for(const tree of getFallenTreesInBounds(getVisibleWorldBounds())){
    const p=point(tree.x,tree.y);if(p.x<-120||p.x>viewWidth+120||p.y<-50||p.y>viewHeight+100)continue;
    const direction=shadowDirection(tree.x,tree.y),end=point(tree.x+1,tree.y),start=point(tree.x-1,tree.y);
    const angle=Math.atan2(end.y-start.y,end.x-start.x),length=Math.hypot(end.x-start.x,end.y-start.y)*FALLEN_TREE_HALF_LENGTH+8*spriteScale;
    const height=FALLEN_TREE_RADIUS*TILE_Y*2+8*spriteScale;
    const pulse=direction.source.kind==='fire'?campfireGlowPulse(flameLightEnvelope(worldClock,direction.source,reducedMotion)):1;
    const offset=8*spriteScale*pulse*direction.lengthScale;
    drawSoftShadow(p.x,p.y+2*spriteScale,length+8*spriteScale,height+4*spriteScale,angle,.62*direction.strength);
    drawSoftShadow(p.x+direction.x*offset,p.y+direction.y*offset,length+18*spriteScale*direction.lengthScale,
      height+7*spriteScale,angle,.5*direction.strength+(pulse-1)*.12);
  }

  if(worldDimensionId==='surface')for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
    const b=building.bounds;
    const direction=strongestBuildingShadowDirection(b,(x,y)=>shadowDirection(x,y,building.id));
    if(direction.strength<=.001)continue;
    const hull=projectedRoofShadow(building,roofGeometry(building),(x,y)=>point(x,y),direction,HEIGHT_PIXELS*spriteScale);
    // Cull the projected footprint, not only the building: an offscreen roof can
    // cast a visible shadow into the viewport.
    if(hull.every(p=>p.x<0)||hull.every(p=>p.x>viewWidth)||hull.every(p=>p.y<0)||hull.every(p=>p.y>viewHeight))continue;
    const centerX=(b.left+b.right)/2,centerY=(b.top+b.bottom)/2;
    const edge=.24;
    let localFill=0;
    for(const light of localLights){
      const sourceId=String(light.id||light.fire?.id||'');
      if(sourceId&&sourceId===String(direction.source?.id||''))continue;
      let targetX,targetY;
      if(light.owner===building.id){
        const nx=light.nx||0,ny=light.ny||0,normalLength=Math.hypot(nx,ny);
        targetX=light.x+(normalLength?nx/normalLength*edge:0);
        targetY=light.y+(normalLength?ny/normalLength*edge:0);
      }else{
        targetX=Math.max(b.left-edge,Math.min(b.right+edge,light.x));
        targetY=Math.max(b.top-edge,Math.min(b.bottom+edge,light.y));
        if(Math.hypot(light.x-targetX,light.y-targetY)>light.reach)continue;
      }
      const amount=lightAmount(light,{x:targetX,y:targetY,
        height:surfaceHeight(targetX,targetY,'clearing')+.3},architecturalScene.obstacles);
      if(amount>localFill)localFill=amount;
    }
    const groundShadow=attenuateShadowWithLocalLight(buildingGroundShadowStrength(direction),localFill);
    drawFootprintShadow(hull,0,0,groundShadow);
    const wing=buildingArchitecture(building).frontWing;
    if(wing){
      const part={bounds:wing,height:wing.wallHeight,roofRise:wing.roofRise,roofEave:wing.roofEave,roofAxis:building.roofAxis};
      drawFootprintShadow(projectedRoofShadow(part,roofGeometry(part),(x,y)=>point(x,y),direction,HEIGHT_PIXELS*spriteScale),0,0,groundShadow);
    }
  }

  for(const tree of visibleSolidTrees){
    const p=SOLID_TREE_SCREEN_POINTS.get(tree);
    if(!p||p.x<-100||p.x>viewWidth+100||p.y<-100||p.y>viewHeight+100)continue;
    const direction=shadowDirection(tree.x,tree.y),ground=point(tree.x,tree.y);
    const gust=reducedMotion?0:windSwayAt(tree.x,tree.y,worldClock)*windStrengthAt(tree.x,tree.y);
    const angle=Math.atan2(direction.y,direction.x),contactStrength=direction.strength;
    const offset=(12+gust*2)*spriteScale*direction.lengthScale;
    const shadowX=ground.x+direction.x*offset+gust*2*spriteScale,shadowY=ground.y+direction.y*offset;
    const castLength=(28+42*direction.lengthScale)*spriteScale,castWidth=(12+5*direction.lengthScale)*spriteScale;
    drawSoftShadow(ground.x,ground.y+2*spriteScale,22*spriteScale,8*spriteScale,0,.3);
    drawHardShadow(shadowX,shadowY,castLength*.37,castWidth*.40,angle,casterShadowOpacity(contactStrength)*.88);
    drawSoftShadow(shadowX,shadowY,castLength,castWidth,angle,.62*contactStrength);
    drawTreeSilhouetteShadow(tree,{x:shadowX,y:shadowY},direction,Math.min(.12,contactStrength*.12),
      {radiusX:castLength*.5,radiusY:castWidth*.5,angle,length:castLength*.48,width:castWidth*.76});
  }

  for(const rock of candidateRocks){
    const p=point(rock.x,rock.y);if(p.x<-80||p.x>viewWidth+80||p.y<-50||p.y>viewHeight+70)continue;
    const direction=shadowDirection(rock.x,rock.y),angle=Math.atan2(direction.y,direction.x);
    drawSoftShadow(p.x,p.y+1,9*spriteScale,4*spriteScale,0,.64*direction.strength);
    drawSoftShadow(p.x+direction.x*2*spriteScale*direction.lengthScale,p.y+direction.y*2*spriteScale*direction.lengthScale,
      15*spriteScale*direction.lengthScale,5*spriteScale,angle,.52*direction.strength);
  }

  for(const plant of candidateFoliage){
    const p=point(plant.x,plant.y);if(p.x<-50||p.x>viewWidth+50||p.y<-40||p.y>viewHeight+50)continue;
    const direction=shadowDirection(plant.x,plant.y);
    drawSoftShadow(p.x+direction.x*spriteScale*direction.lengthScale,p.y+1+direction.y*spriteScale*direction.lengthScale,
      12*spriteScale*direction.lengthScale,4*spriteScale,0,.38*direction.strength);
  }

  for(const fire of frameFires){
    const p=point(fire.x,fire.y);if(p.x<-70||p.x>viewWidth+70||p.y<-60||p.y>viewHeight+70)continue;
    const direction=shadowDirection(fire.x,fire.y),pulse=campfireFuelRatio(fire,performance.now())>0?campfireGlowPulse(flameLightEnvelope(worldClock,fire,reducedMotion)):1;
    drawSoftShadow(p.x+direction.x*spriteScale,p.y+direction.y*spriteScale,
      23*spriteScale,8*spriteScale,Math.atan2(direction.y,direction.x),.32*direction.strength+(pulse-1)*.1);
  }

}
const nightMask=document.createElement('canvas');
const NIGHT_MASK_SCALE=.25;
const NIGHT_LIGHT_FPS=30;
const NIGHT_MASK_PAD=640;
function paintNightMask(anchor=camera){
 const shiftX=-((camera.x-anchor.x)-(camera.y-anchor.y))*TILE_X;
 const shiftY=-((camera.x-anchor.x)+(camera.y-anchor.y))*TILE_Y;
 ctx.save();ctx.imageSmoothingEnabled=true;
 ctx.drawImage(nightMask,(NIGHT_MASK_PAD-shiftX)*NIGHT_MASK_SCALE,(NIGHT_MASK_PAD-shiftY)*NIGHT_MASK_SCALE,
   viewWidth*NIGHT_MASK_SCALE,viewHeight*NIGHT_MASK_SCALE,0,0,viewWidth,viewHeight);
 ctx.restore();
}
let nightMaskKey='';
function carriedLanternSources(){
 const sources=[],seen=new Set();
 for(const player of livePlayers.values()){
  const appearance=player.id===selfId?(activeAvatarAppearance||player.appearance):player.appearance;
  if(!appearance||(![appearance.mainHandId,appearance.offHandId].includes('equipment.lantern')&&appearance.item!=='lantern'))continue;
  if(player.location&&player.location!=='clearing')continue;
  if(player.dimensionId&&player.dimensionId!==worldDimensionId)continue;
  const position=player.id===selfId?localRenderPosition:player;
  if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))continue;
  const key=String(player.id||'');if(seen.has(key))continue;seen.add(key);
  sources.push({id:key,x:position.x,y:position.y,height:surfaceHeight(position.x,position.y,'clearing')+.82});
 }
 if(selfId&&!seen.has(selfId)&&activeAvatarAppearance
   &&([activeAvatarAppearance.mainHandId,activeAvatarAppearance.offHandId].includes('equipment.lantern')||activeAvatarAppearance.item==='lantern')){
  sources.push({id:selfId,x:localRenderPosition.x,y:localRenderPosition.y,
    height:surfaceHeight(localRenderPosition.x,localRenderPosition.y,'clearing')+.82});
 }
 return sources;
}
function paintFirelightColor(time, intensity = 1){
 ctx.save();ctx.globalCompositeOperation='screen';
 const isArrival=worldDimensionId.startsWith('arrival-');
 // The void needs visibility from the shadow cutout, with only a restrained warm tint.
 const sceneLight=intensity*(isArrival?.18:.28);
 const arrivalReach=isArrival?ARRIVAL_CAMPFIRE_REACH_MULTIPLIER:1;
 const edgePower=isArrival?ARRIVAL_CAMPFIRE_EDGE_POWER:1.35;
 const fireProfile=isArrival?{reach:CAMPFIRE_LIGHT_RADIUS_TILES,falloffExponent:edgePower}
   :nightEmitterProfile(CAMPFIRE_LIGHT_RADIUS_TILES,edgePower,{night:intensity,hasMoon:gameDay.hasMoon});
 const lanternProfile=nightEmitterProfile(4.8,1.7,{night:intensity,hasMoon:gameDay.hasMoon});
 for(const fire of fires.values()){
  const strength=campfireFlameStrength(fire,performance.now())*(worldDimensionId.startsWith('arrival-')?arrivalFireIgnition():1);if(strength<=0)continue;
  const p=point(fire.x,fire.y);
  const gust=reducedMotion?0:windSwayAt(fire.x,fire.y,time)*windStrengthAt(fire.x,fire.y);
  const pulse=campfireGlowPulse(flameLightEnvelope(time,fire,reducedMotion));
  const radius=TILE_X*fireProfile.reach*arrivalReach*(.32+.68*strength)*pulse*(isArrival ? .35+.65*arrivalFireIgnition() : 1),x=p.x+gust*TILE_X*.34,y=p.y-4;
  ctx.save();ctx.globalAlpha=strength*sceneLight*pulse;ctx.translate(x,y);ctx.scale(1,.66);
  const glow=ctx.createRadialGradient(0,0,1,0,0,radius);
  addSphericalFalloffStops(glow,.88,FIRELIGHT_RGB_STOPS,fireProfile.falloffExponent);
  ctx.fillStyle=glow;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
 }
 for(const source of carriedLanternSources()){
  const p=point(source.x,source.y,camera,source.height),radius=TILE_X*lanternProfile.reach;
  ctx.save();ctx.globalAlpha=intensity*.3;ctx.translate(p.x,p.y-4);ctx.scale(1,.7);
  const glow=ctx.createRadialGradient(0,0,1,0,0,radius);
  glow.addColorStop(0,'rgba(255,232,170,.62)');glow.addColorStop(.22,'rgba(255,183,91,.32)');
  glow.addColorStop(.55,'rgba(244,120,45,.11)');glow.addColorStop(1,'rgba(220,92,31,0)');
  ctx.fillStyle=glow;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
 }
 ctx.restore();
}
function windowFacadeGeometry(project,building,win,light){
  const alongX=Boolean(win.ny),alongY=Boolean(win.nx);
  if(!alongX&&!alongY)return null;
  const halfSpan=Math.max(.8,Math.min(1.65,(win.width||1)*1.25));
  const wall={x1:win.x-(alongX?halfSpan:0),y1:win.y-(alongY?halfSpan:0),
    x2:win.x+(alongX?halfSpan:0),y2:win.y+(alongY?halfSpan:0),
    bottom:Math.max(0,win.bottom-.95),top:Math.min(win.top+.85,Math.max(building.height||0,win.top+.2))};
  if(wall.top<=wall.bottom)return null;
  const points=facadePanel(project,wall,0,0,1,1);
  const center=project(win.x,win.y,(win.bottom+win.top)/2);
  const radiusX=TILE_X*(1.35+Math.min(.55,(light.reach||0)*.045));
  const radiusY=Math.max(HEIGHT_PIXELS*spriteScale*1.85,(wall.top-wall.bottom)*HEIGHT_PIXELS*spriteScale*.55);
  return {points,center,radiusX,radiusY};
}

function drawNight(){
 if(worldLocation==='room'){drawRoomLighting();return;}
 if(worldLocation!=='clearing')return;
 const nightFactor = dimensionTheme === 'dark' ? .36 + gameDay.night * .64 : gameDay.night;
 // The mask and roof/window cutouts are expensive, and contribute nothing
 // during full daylight. The main canvas is redrawn each frame, so it is safe
 // to omit the mask entirely until night begins.
 if(nightFactor<=0)return;
 const maskWidth=Math.ceil((viewWidth+NIGHT_MASK_PAD*2)*NIGHT_MASK_SCALE);
 const maskHeight=Math.ceil((viewHeight+NIGHT_MASK_PAD*2)*NIGHT_MASK_SCALE);
 if(nightMask.width!==maskWidth||nightMask.height!==maskHeight){nightMask.width=maskWidth;nightMask.height=maskHeight;nightMaskKey='';}
 const lightFrame=FRAME_LIT_FIRES.length?Math.floor(worldClock*NIGHT_LIGHT_FPS):0;
 const nightCamera={x:Math.round(camera.x),y:Math.round(camera.y)};
 const teleportLights=teleportEffects.lightingPoints(worldDimensionId,clientServerTime());
 const teleportLightKey=teleportLights.map(light=>`${light.id}:${light.frame}`).join(';');
 const lanterns=carriedLanternSources();
 const lanternKey=lanterns.map(light=>`${light.id}:${light.x.toFixed(2)}:${light.y.toFixed(2)}`).join(';');
 const key=`${nightCamera.x}:${nightCamera.y}:${TILE_X}:${worldDimensionId}:${dimensionTheme}:${lightFrame}:${teleportLightKey}:${lanternKey}:${gameDay.hasMoon?1:0}:${(gameDay.moonlightStrength||0).toFixed(3)}:${Math.round(nightFactor*100)}:${nightMask.width}:${nightMask.height}:${lightmapStats().revision}:`+FRAME_LIT_FIRES.map(f=>`${f.id||''}:${f.x}:${f.y}`).join(';');
 if(key===nightMaskKey){paintNightMask(nightCamera);return;}nightMaskKey=key;
 const currentCamera=camera;camera=nightCamera;
 const mask=nightMask.getContext('2d');mask.setTransform(NIGHT_MASK_SCALE,0,0,NIGHT_MASK_SCALE,0,0);mask.translate(NIGHT_MASK_PAD,NIGHT_MASK_PAD);mask.clearRect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,viewWidth+NIGHT_MASK_PAD*2,viewHeight+NIGHT_MASK_PAD*2);
 const isArrival=worldDimensionId.startsWith('arrival-');
 const arrivalReach=isArrival?ARRIVAL_CAMPFIRE_REACH_MULTIPLIER:1;
 const edgePower=isArrival?ARRIVAL_CAMPFIRE_EDGE_POWER:1.35;
 const fireProfile=isArrival?{reach:CAMPFIRE_LIGHT_RADIUS_TILES,falloffExponent:edgePower}
   :nightEmitterProfile(CAMPFIRE_LIGHT_RADIUS_TILES,edgePower,{night:nightFactor,hasMoon:gameDay.hasMoon});
 mask.globalCompositeOperation='source-over';mask.globalAlpha=exteriorNightOpacity(gameDay,{theme:dimensionTheme,dimensionId:worldDimensionId});mask.fillStyle=({dark:'#000000',sky:'#173044',magic:'#06091b',inferno:'#120604',giants:'#06100e',energy:'#020a18'})[dimensionTheme]||'#020812';mask.fillRect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,viewWidth+NIGHT_MASK_PAD*2,viewHeight+NIGHT_MASK_PAD*2);mask.globalAlpha=1;
 mask.globalCompositeOperation='destination-out';
 if(isArrival&&arrivalFireIgnition()<1){
  const hearth=dimensionList.find(item=>item.id===worldDimensionId)?.campfire;
  if(hearth){
   const p=point(hearth.x,hearth.y),radius=TILE_X*.9;
   const glimpse=mask.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
   glimpse.addColorStop(0,'#000000');glimpse.addColorStop(.5,'#000000a0');glimpse.addColorStop(1,'#00000000');
   mask.save();mask.globalAlpha=.4*(1-arrivalFireIgnition());mask.fillStyle=glimpse;
   mask.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);mask.restore();
  }
 }
 for(const fire of fires.values()){

  const strength=campfireFlameStrength(fire,performance.now())*(worldDimensionId.startsWith('arrival-')?arrivalFireIgnition():1);if(strength<=0)continue;
  const p=point(fire.x,fire.y),lightTime=lightFrame/NIGHT_LIGHT_FPS;
  const pulse=campfireGlowPulse(flameLightEnvelope(lightTime,fire,reducedMotion));
  const radius=TILE_X*fireProfile.reach*arrivalReach*(.32+.68*strength)*pulse*(worldDimensionId.startsWith('arrival-') ? .35+.65*arrivalFireIgnition() : 1);
  const sway=reducedMotion?0:windSwayAt(fire.x,fire.y,lightTime)*windStrengthAt(fire.x,fire.y)*5;
  const lightX=p.x+sway,lightY=p.y-7;
  mask.save();mask.translate(lightX,lightY);mask.scale(1,.66);
  const glow=mask.createRadialGradient(0,0,0,0,0,radius);
  addSphericalFalloffStops(glow,1,SHADOW_RGB_STOPS,fireProfile.falloffExponent);
  mask.globalAlpha=strength*pulse;mask.fillStyle=glow;mask.fillRect(-radius,-radius,radius*2,radius*2);mask.restore();
 }
 if(worldDimensionId==='surface'){
   mask.save();
   for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS].filter(b=>b.roofVisible!==false))for(const plane of roofGeometry(building).planes){
     mask.beginPath();mask.rect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,viewWidth+NIGHT_MASK_PAD*2,viewHeight+NIGHT_MASK_PAD*2);
     plane.forEach(([x,y,z],index)=>{const p=point(x,y,camera,z);if(index)mask.lineTo(p.x,p.y);else mask.moveTo(p.x,p.y);});mask.closePath();mask.clip('evenodd');
   }
   // Ground light must not erase darkness from a vertical facade that happens
   // to cover the same screen pixels. Window panes/glow are handled below.
   mask.save();
   for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
     const b=building.bounds,h=building.height;
     for(const face of [[[b.left,b.bottom,0],[b.right,b.bottom,0],[b.right,b.bottom,h],[b.left,b.bottom,h]],
       [[b.right,b.top,0],[b.right,b.bottom,0],[b.right,b.bottom,h],[b.right,b.top,h]]]){
       mask.beginPath();mask.rect(-NIGHT_MASK_PAD,-NIGHT_MASK_PAD,viewWidth+NIGHT_MASK_PAD*2,viewHeight+NIGHT_MASK_PAD*2);
       face.forEach(([x,y,z],i)=>{const p=point(x,y,camera,z);if(i)mask.lineTo(p.x,p.y);else mask.moveTo(p.x,p.y);});mask.closePath();mask.clip('evenodd');
     }
   }
   paintSceneLightmaps(mask,.72);
   // Preserve the emitter's amber tint at night instead of only revealing
   // the unlit green terrain underneath the darkness cutout.
   mask.globalCompositeOperation='source-over';
   mask.restore();
   // Clear the actual luminous panes, without a halo leaking through the roof.
   const project=(x,y,z)=>point(x,y,camera,z);
   for(const light of currentSceneLights().lights.filter(light=>light.kind==='lantern'&&light.strength>0)){
     const points=facadePanel(project,{x1:light.x-.14,y1:light.y,x2:light.x+.14,y2:light.y,bottom:2.98,top:3.48},0,0,1,1);
     mask.beginPath();points.forEach(([x,y],i)=>i?mask.lineTo(x,y):mask.moveTo(x,y));mask.closePath();mask.fillStyle='#000';mask.fill();
   }
   const litWindows=new Map(currentSceneLights().lights.filter(light=>light.kind==='window'&&light.strength>0).map(light=>[light.id,light]));
   for(const building of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS])for(const win of buildingWindows(building)){
     const light=litWindows.get(win.id);if(!light)continue;
     const patch=windowFacadeGeometry(project,building,win,light);
     if(patch){
       const {points,center,radiusX,radiusY}=patch;
       mask.save();mask.beginPath();points.forEach(([x,y],i)=>i?mask.lineTo(x,y):mask.moveTo(x,y));mask.closePath();mask.clip();
       mask.globalCompositeOperation='destination-out';mask.globalAlpha=Math.min(.72,light.strength*.78);
       mask.translate(center.x,center.y);mask.scale(1,radiusY/radiusX);
       const glow=mask.createRadialGradient(0,0,0,0,0,radiusX);
       glow.addColorStop(0,'rgba(0,0,0,.82)');
       glow.addColorStop(.42,'rgba(0,0,0,.48)');
       glow.addColorStop(.78,'rgba(0,0,0,.16)');
       glow.addColorStop(1,'rgba(0,0,0,0)');
       mask.fillStyle=glow;mask.fillRect(-radiusX,-radiusX,radiusX*2,radiusX*2);mask.restore();
     }
     const wall={x1:win.x-(win.ny?win.width/2:0),y1:win.y-(win.nx?win.width/2:0),
       x2:win.x+(win.ny?win.width/2:0),y2:win.y+(win.nx?win.width/2:0),bottom:win.bottom,top:win.top};
     const points=facadePanel(project,wall,.1,.1,.9,.9);
     mask.beginPath();points.forEach(([x,y],i)=>i?mask.lineTo(x,y):mask.moveTo(x,y));mask.closePath();mask.fillStyle='#000';mask.fill();
   }
   mask.restore();
 }
 const lanternProfile=nightEmitterProfile(4.8,1.7,{night:nightFactor,hasMoon:gameDay.hasMoon});
 for(const source of lanterns){
  const p=point(source.x,source.y,camera,source.height),radius=TILE_X*lanternProfile.reach;
  mask.save();mask.translate(p.x,p.y-4);mask.scale(1,.7);
  const glow=mask.createRadialGradient(0,0,0,0,0,radius);
  glow.addColorStop(0,'#000000ff');glow.addColorStop(.22,'#000000e8');
  glow.addColorStop(.55,'#0000008c');glow.addColorStop(1,'#00000000');
  mask.fillStyle=glow;mask.fillRect(-radius,-radius,radius*2,radius*2);mask.restore();
 }
 for(const light of teleportLights){
  const p=point(light.x,light.y,camera,0),radius=TILE_X*6.5;
  mask.save();mask.translate(p.x,p.y-4);mask.scale(1.12,.82);
  const glow=mask.createRadialGradient(0,0,0,0,0,radius);
  glow.addColorStop(0,'#000000f5');glow.addColorStop(.32,'#000000cf');glow.addColorStop(.68,'#00000070');glow.addColorStop(1,'#00000000');
  mask.globalAlpha=light.strength;mask.fillStyle=glow;mask.beginPath();mask.arc(0,0,radius,0,Math.PI*2);mask.fill();mask.restore();
 }
 mask.globalCompositeOperation='source-over';camera=currentCamera;paintNightMask(nightCamera);
}

function paintResource(resource, p) {
  const bob = 0;
  ctx.save(); scaleAround(p, spriteScale);
  drawSoftShadow(p.x, p.y + 2, 17, 6, .12, .5);
  if (resource.kind === 'wood') {
    ctx.fillStyle = CLAREIRA.material.branch.shadow; ctx.fillRect(Math.round(p.x - 6), Math.round(p.y - 4 + bob), 12, 3);
    ctx.fillStyle = CLAREIRA.material.branch.wood; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 5 + bob), 10, 2);
    ctx.fillStyle = CLAREIRA.material.branch.light; ctx.fillRect(Math.round(p.x + 3), Math.round(p.y - 5 + bob), 2, 2);
    ctx.fillStyle = CLAREIRA.material.branch.leaf; ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 7 + bob), 3, 3);
    ctx.fillStyle = CLAREIRA.signature.ember; ctx.fillRect(Math.round(p.x), Math.round(p.y - 5 + bob), 1, 3);
    ctx.fillStyle = CLAREIRA.signature.leaf; ctx.fillRect(Math.round(p.x + 1), Math.round(p.y - 7 + bob), 2, 1);
  } else if (resource.kind === 'sturdyBranch') {
    ctx.fillStyle = '#533d2c'; ctx.fillRect(Math.round(p.x - 8), Math.round(p.y - 4 + bob), 16, 4);
    ctx.fillStyle = '#936643'; ctx.fillRect(Math.round(p.x - 7), Math.round(p.y - 6 + bob), 13, 3);
    ctx.fillStyle = '#c28d57'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 6 + bob), 6, 1);
    ctx.fillStyle = '#69472f'; ctx.fillRect(Math.round(p.x + 4), Math.round(p.y - 8 + bob), 5, 2);
    ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 8 + bob), 4, 2);
  } else if (resource.kind === 'stone') {
    ctx.fillStyle = CLAREIRA.material.stone.shadow; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 6 + bob), 10, 6);
    ctx.fillStyle = CLAREIRA.material.stone.stone; ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 7 + bob), 5, 3);
    ctx.fillStyle = CLAREIRA.material.stone.light; ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 6 + bob), 2, 2);
    ctx.fillStyle = CLAREIRA.signature.ember; ctx.fillRect(Math.round(p.x), Math.round(p.y - 5 + bob), 1, 1);
    ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 3 + bob), 1, 1);
    ctx.fillRect(Math.round(p.x + 1), Math.round(p.y - 2 + bob), 1, 1);
  } else if (resource.kind === 'leaves') {
    ctx.fillStyle = '#59452d'; ctx.fillRect(Math.round(p.x - 7), Math.round(p.y - 3 + bob), 14, 3);
    ctx.fillStyle = '#9c7444'; ctx.fillRect(Math.round(p.x - 6), Math.round(p.y - 5 + bob), 5, 2);
    ctx.fillRect(Math.round(p.x + 1), Math.round(p.y - 6 + bob), 5, 2);
    ctx.fillStyle = '#c4a45f'; ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 7 + bob), 5, 2);
    ctx.fillStyle = '#dfc77f'; ctx.fillRect(Math.round(p.x - 4), Math.round(p.y - 5 + bob), 2, 1);
    ctx.fillRect(Math.round(p.x + 2), Math.round(p.y - 6 + bob), 2, 1);
  } else if (resource.kind === 'vines') {
    ctx.fillStyle = '#294536'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 2 + bob), 10, 2);
    ctx.fillStyle = '#72945a';
    ctx.fillRect(Math.round(p.x - 4), Math.round(p.y - 6 + bob), 2, 6);
    ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 8 + bob), 2, 8);
    ctx.fillRect(Math.round(p.x + 2), Math.round(p.y - 5 + bob), 2, 5);
    ctx.fillStyle = '#a9bd75'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 7 + bob), 3, 2);
    ctx.fillRect(Math.round(p.x + 1), Math.round(p.y - 9 + bob), 3, 2);
  } else if (resource.kind === 'copperVein' || resource.kind === 'ironVein' || resource.kind === 'coalSeam') {
    ctx.fillStyle = '#353a39'; ctx.fillRect(Math.round(p.x - 10), Math.round(p.y - 4 + bob), 20, 7);
    ctx.fillStyle = '#686d68'; ctx.fillRect(Math.round(p.x - 8), Math.round(p.y - 8 + bob), 15, 7);
    ctx.fillStyle = '#a1a49a'; ctx.fillRect(Math.round(p.x - 4), Math.round(p.y - 9 + bob), 8, 3);
    ctx.fillStyle = resource.kind === 'copperVein' ? '#d47b4b' : resource.kind === 'ironVein' ? '#d9c7a4' : '#242624';
    ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 6 + bob), 4, 3);
    ctx.fillRect(Math.round(p.x + 3), Math.round(p.y - 3 + bob), 4, 2);
  } else if (resource.kind === 'woodBench' || resource.kind === 'charcoalKiln' || resource.kind === 'stoneFurnace') {
    ctx.fillStyle = '#392d24'; ctx.fillRect(Math.round(p.x - 11), Math.round(p.y - 3 + bob), 22, 8);
    ctx.fillStyle = resource.kind === 'charcoalKiln' ? '#704a31' : resource.kind === 'woodBench' ? '#9b6a40' : '#777d7b';
    ctx.fillRect(Math.round(p.x - 9), Math.round(p.y - 8 + bob), 18, 7);
    if (resource.kind === 'woodBench') {
      ctx.fillStyle = '#d3a265'; ctx.fillRect(Math.round(p.x - 8), Math.round(p.y - 11 + bob), 16, 2);
      ctx.fillStyle = '#67472d'; ctx.fillRect(Math.round(p.x - 7), Math.round(p.y - 3 + bob), 2, 6);
      ctx.fillRect(Math.round(p.x + 5), Math.round(p.y - 3 + bob), 2, 6);
    } else {
      ctx.fillStyle = '#34312d'; ctx.fillRect(Math.round(p.x - 4), Math.round(p.y - 12 + bob), 8, 5);
      ctx.fillStyle = '#d77d3f'; ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 6 + bob), 4, 4);
      if (resource.kind === 'charcoalKiln') { ctx.fillStyle = '#a86a3e'; ctx.fillRect(Math.round(p.x - 7), Math.round(p.y - 10 + bob), 3, 2); }
    }
  } else if (resource.kind === 'woodBatch' || resource.kind === 'charcoalBatch' || resource.kind === 'smeltBatch') {
    ctx.fillStyle = resource.outputItem === 'wood' || resource.outputItem === 'plank' ? '#8c5c37'
      : resource.outputItem === 'charcoal' ? '#222625' : resource.outputItem === 'copperIngot' ? '#bd7048' : '#b4a58d';
    ctx.fillRect(Math.round(p.x - 7), Math.round(p.y - 5 + bob), 14, 5);
    ctx.fillStyle = '#e3c58e'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 7 + bob), 10, 2);
  } else if (resource.kind === 'log') {
    ctx.fillStyle = '#493a2c'; ctx.fillRect(Math.round(p.x - 9), Math.round(p.y - 5 + bob), 18, 7);
    ctx.fillStyle = '#8a5c3b'; ctx.fillRect(Math.round(p.x - 8), Math.round(p.y - 7 + bob), 16, 6);
    ctx.fillStyle = '#bd8a55'; ctx.fillRect(Math.round(p.x - 6), Math.round(p.y - 6 + bob), 11, 2);
    ctx.fillStyle = '#d2b17a'; ctx.fillRect(Math.round(p.x + 5), Math.round(p.y - 6 + bob), 3, 4);
    ctx.fillStyle = '#826142'; ctx.fillRect(Math.round(p.x + 6), Math.round(p.y - 5 + bob), 1, 2);
  } else if (resource.kind === 'apples') {
    ctx.fillStyle = '#4f613c'; ctx.fillRect(Math.round(p.x - 6), Math.round(p.y - 3 + bob), 12, 3);
    ctx.fillStyle = '#789052'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 5 + bob), 10, 3);
    ctx.fillStyle = '#bb4f38'; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 7 + bob), 5, 5);
    ctx.fillRect(Math.round(p.x + 1), Math.round(p.y - 7 + bob), 5, 5);
    ctx.fillStyle = '#efbb6a'; ctx.fillRect(Math.round(p.x - 4), Math.round(p.y - 6 + bob), 1, 2);
    ctx.fillStyle = '#aac278'; ctx.fillRect(Math.round(p.x), Math.round(p.y - 10 + bob), 3, 2);
  } else {
    ctx.fillStyle = CLAREIRA.material.berry.leaf; ctx.fillRect(Math.round(p.x - 6), Math.round(p.y - 7 + bob), 12, 7);
    ctx.fillStyle = CLAREIRA.material.berry.lightLeaf; ctx.fillRect(Math.round(p.x - 5), Math.round(p.y - 8 + bob), 9, 5);
    ctx.fillStyle = CLAREIRA.material.berry.fruit; ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 7 + bob), 3, 3);
    ctx.fillRect(Math.round(p.x + 2), Math.round(p.y - 5 + bob), 3, 3);
    ctx.fillStyle = CLAREIRA.material.berry.seed; ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 6 + bob), 1, 1);
    ctx.fillStyle = CLAREIRA.material.berry.newLeaf; ctx.fillRect(Math.round(p.x), Math.round(p.y - 9 + bob), 3, 2);
    ctx.fillRect(Math.round(p.x + 2), Math.round(p.y - 10 + bob), 2, 1);
  }
  if (resource.quantity > 1) {
    const amount = String(resource.quantity);
    ctx.font = 'bold 6px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = '#132321'; ctx.fillRect(Math.round(p.x + 3), Math.round(p.y - 13), 11, 8);
    ctx.fillStyle = '#f2dfaf'; ctx.fillText(amount, p.x + 8, p.y - 7);
  }
  ctx.restore();
}

function drawResource(resource, active, time) {
  const p = point(resource.x, resource.y);
  // Resource art is static; keep the proximity prompt dynamic and outside the cache.
  const offset = 24 * spriteScale;
  const key = `${resource.kind}:${resource.outputItem || ''}:${resource.quantity || 0}:${spriteScale}`;
  const image = resourceGeometryCache.get(key, 48 * spriteScale, 40 * spriteScale, context => {
    const previousContext = ctx;
    ctx = context;
    try { paintResource(resource, {x:offset, y:offset}); }
    finally { ctx = previousContext; }
  });
  ctx.drawImage(image, Math.round(p.x - offset), Math.round(p.y - offset));
  if (!active) return;
  ctx.save(); scaleAround(p, spriteScale);
  if (active) {
    ctx.strokeStyle = '#f4d895'; ctx.lineWidth = 1; ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 10, 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    const label = 'COLETAR';
    ctx.font = 'bold 6px system-ui';
    const labelWidth = Math.ceil(ctx.measureText(label).width);
    const plaqueWidth = labelWidth + 15;
    const plaqueLeft = Math.round(p.x - plaqueWidth / 2);
    const plaqueTop = Math.round(p.y - 20);
    ctx.fillStyle = CLAREIRA.signature.afterglow;
    ctx.fillRect(plaqueLeft, plaqueTop, plaqueWidth, 10);
    ctx.fillStyle = CLAREIRA.palette.ink;
    ctx.fillRect(plaqueLeft + 1, plaqueTop + 1, plaqueWidth - 2, 8);
    ctx.fillStyle = CLAREIRA.signature.ember;
    ctx.fillRect(plaqueLeft + 3, plaqueTop + 4, 2, 2);
    ctx.fillRect(plaqueLeft + 7, plaqueTop + 4, 2, 2);
    ctx.fillStyle = CLAREIRA.signature.afterglow;
    ctx.fillRect(plaqueLeft + 5, plaqueTop + 3, 2, 2);
    ctx.fillStyle = CLAREIRA.signature.leaf;
    ctx.fillRect(plaqueLeft + 7, plaqueTop + 2, 2, 1);
    ctx.fillRect(plaqueLeft + 8, plaqueTop + 1, 1, 1);
    ctx.fillStyle = CLAREIRA.palette.parchment; ctx.textAlign = 'left';
    ctx.fillText(label, plaqueLeft + 12, plaqueTop + 7);
  }
  ctx.restore();
}

function drawCampfireGatheringMark(p, time, companionCount) {
  if (companionCount < 2) return;
  const lift = reducedMotion ? 0 : Math.round((Math.sin(time * 4) + 1) * 1.5);
  const sway = reducedMotion ? 0 : Math.round(Math.sin(time * 3) * 1);
  const x = Math.round(p.x);
  const y = Math.round(p.y - 16 - lift);
  ctx.globalAlpha = reducedMotion ? .9 : .66 + (Math.sin(time * 7) + 1) * .14;
  ctx.fillStyle = CLAREIRA.signature.ember;
  ctx.fillRect(x - 5 - sway, y, 2, 2);
  ctx.fillStyle = CLAREIRA.signature.afterglow;
  ctx.fillRect(x - 1, y - 4, 2, 2);
  ctx.fillStyle = CLAREIRA.signature.ember;
  ctx.fillRect(x + 4 + sway, y + 1, 2, 2);
  ctx.fillStyle = CLAREIRA.signature.leaf;
  ctx.fillRect(x + 6 + sway, y - 4, 2, 1);
  ctx.fillRect(x + 7 + sway, y - 5, 1, 1);
  ctx.fillStyle = CLAREIRA.signature.afterglow;
  ctx.fillRect(x + 5 + sway, y - 3, 1, 1);
  ctx.globalAlpha = 1;
}

function drawCampfireAura(p, time, seed, flameStrength, layer) {
  if (!campfireAuraImage?.naturalWidth || flameStrength <= .04) return;
  const frameIndex = campfireAuraFrameIndex(time, seed, reducedMotion);
  const frameWidth = campfireAuraImage.naturalWidth / CAMPFIRE_AURA_FRAME_COUNT;
  if (!Number.isInteger(frameWidth) || campfireAuraImage.naturalHeight < CAMPFIRE_AURA_FRAME_HEIGHT) return;
  const size = CAMPFIRE_AURA_DISPLAY_SIZE * spriteScale;
  const left = Math.round(p.x - size / 2);
  const top = Math.round(p.y - 48 * spriteScale);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = flameStrength * (layer === 'ground' ? .85 : .95);
  ctx.beginPath();
  if (layer === 'ground') ctx.rect(left, top + size * .6, size, size * .4);
  else ctx.rect(left, top, size, size * .55);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(campfireAuraImage, frameIndex * frameWidth, 0, frameWidth, CAMPFIRE_AURA_FRAME_HEIGHT,
    left, top, size, size);
  ctx.restore();
}

function campfireSpentWoodColor(litColor, spentColor, flameStrength) {
  const amount = Math.round((1 - flameStrength) * 8) / 8;
  const channel = (color, offset) => Number.parseInt(color.slice(offset, offset + 2), 16);
  const blended = [1, 3, 5].map(offset => Math.round(
    channel(litColor, offset) + (channel(spentColor, offset) - channel(litColor, offset)) * amount,
  ).toString(16).padStart(2, '0'));
  return `#${blended.join('')}`;
}

function drawCampfireSmokePuffs(p,puffs,smokeStrength,sway=0,soot=false){
  const pixel=(color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(p.x+x),Math.round(p.y+y),w,h);};
  for(const puff of puffs){
    const puffX=sway+puff.x;
    const smokeAlpha=soot?Math.min(.72,puff.alpha*1.5):puff.alpha;
    ctx.globalAlpha=smokeAlpha*smokeStrength;
    pixel(soot?'#242826':'#858b87',puffX,puff.y,puff.size,puff.size);
    pixel(soot?'#353a36':'#a1a398',puffX+1,puff.y+1,Math.max(1,puff.size-1),Math.max(1,puff.size-1));
    ctx.globalAlpha=(soot?Math.min(.64,puff.highlightAlpha*1.5):puff.highlightAlpha)*smokeStrength;
    pixel(soot?'#4a4e44':'#d0c9b8',puffX+1,puff.y-1,1,1);
  }
  ctx.globalAlpha=1;
}

function drawFire(fire,time,companionCount=0) {
  if(worldDimensionId==='breu'){drawArrivalHearth(fire,time);return;}
  const arrivalHearth=worldDimensionId.startsWith('arrival-');
  const p=point(fire.x,fire.y);
  const pixel=(color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(p.x+x),Math.round(p.y+y),w,h);};
  const seed=fire.x*1.7+fire.y*.63;
  const airflow=reducedMotion?0:windSwayAt(fire.x,fire.y,time);
  const sway=Math.round(airflow*2.1);
  const emberPulse=reducedMotion?0:(Math.sin(time*3.1+seed)+1)*.5;
  const fireSampleNow=performance.now();
  const flameStrength=campfireFlameStrength(fire,fireSampleNow)*(arrivalHearth?arrivalFireIgnition():1);
  const decayProgress=campfireDecayProgress(fire,fireSampleNow);
  const smokeState=campfireSmokeState(fire,fireSampleNow);
  const warmth=flameEnvelope(time,fire,reducedMotion);
  const particles=sampleCampfireParticles(time,fire,airflow,.9+(warmth-.9)*flameStrength,reducedMotion,
    smokeState.strength,smokeState.afterglow);
  const daylightVisibility=.3+.7*gameDay.night;
  const lightRadius=TILE_X*(3.5+(flameLightEnvelope(time,fire,reducedMotion)-1)*.55)*(.32+.68*flameStrength)*(.78+.22*gameDay.night)*CAMPFIRE_AURA_LIGHT_SCALE;
  const lightSway=reducedMotion?0:airflow*windStrengthAt(fire.x,fire.y)*TILE_X*.18;
  if(flameStrength>0){
    ctx.save();ctx.globalAlpha=flameStrength*daylightVisibility;ctx.globalCompositeOperation='screen';ctx.translate(p.x+lightSway,p.y+2);ctx.scale(1.15,.66);
    const groundGlow=ctx.createRadialGradient(0,0,0,0,0,lightRadius);
    groundGlow.addColorStop(0,'rgba(255,210,120,.26)');groundGlow.addColorStop(.2,'rgba(255,160,65,.16)');
    groundGlow.addColorStop(.48,'rgba(240,110,40,.07)');groundGlow.addColorStop(.75,'rgba(205,75,25,.02)');groundGlow.addColorStop(1,'rgba(190,50,20,0)');
    ctx.fillStyle=groundGlow;ctx.fillRect(-lightRadius,-lightRadius,lightRadius*2,lightRadius*2);ctx.restore();
  }
  if(campfireHearthBaseImage?.naturalWidth===CAMPFIRE_HEARTH_FRAME_WIDTH
    &&campfireHearthBaseImage.naturalHeight===CAMPFIRE_HEARTH_FRAME_HEIGHT){
    const left=Math.round(p.x-CAMPFIRE_HEARTH_ANCHOR.x*spriteScale);
    const top=Math.round(p.y-CAMPFIRE_HEARTH_ANCHOR.y*spriteScale);
    const size=CAMPFIRE_HEARTH_FRAME_WIDTH*spriteScale;
    ctx.save();scaleAround(p,spriteScale);ctx.imageSmoothingEnabled=false;
    ctx.drawImage(campfireHearthBaseImage,left,top,size,size);
    if(flameStrength>0){
      drawCampfireSmokePuffs(p,particles.smoke,smokeState.strength,sway);
      ctx.save();ctx.globalAlpha=flameStrength;
      const flameScale=.4+.6*flameStrength;
      ctx.translate(p.x+sway,p.y);ctx.scale(flameScale,flameScale);
      drawCampfireFlames(ctx,0,0,time,seed,reducedMotion);
      ctx.restore();
      ctx.globalAlpha=1;
      if(!reducedMotion){
        for(const spark of particles.sparks){
          ctx.globalAlpha=spark.alpha*flameStrength;
          pixel(spark.color,sway+spark.x,spark.y,spark.size,spark.size);
        }
      }
      ctx.globalAlpha=1;
      if(flameStrength>.2)drawCampfireGatheringMark(p,time,companionCount);
    }
    ctx.restore();return;
  }
  // A soft local ground glow keeps the flame and crossed logs as the focal point.

  ctx.save();scaleAround(p,spriteScale);
  const polygon=(points,color)=>drawPixelPolygon(points.map(([x,y])=>[p.x+x,p.y+y]),color);

  // Contact shadow and separated ash patches keep the hearth grounded without making a slab.
  polygon([[-11,2],[-7,1],[-3,2],[2,1],[8,2],[11,4],[7,5],[1,4],[-5,5],[-10,4]],'#101411');
  polygon([[-8,1],[-5,0],[-2,1],[-3,2],[-8,2]],'#292b26');
  polygon([[1,1],[4,0],[8,1],[7,3],[2,2]],'#302b25');
  ctx.globalAlpha=flameStrength;
  pixel('#9c4328',-5,0,3,1);pixel('#e17b31',-2,-1,3,1);
  pixel(emberPulse>.46?'#ffc66b':'#c34d2b',-5,-1,2,1);
  pixel(emberPulse<.58?'#ffb955':'#d85e2e',3,-1,2,1);
  pixel(emberPulse>.6?'#fff0a0':'#e86c35',0,-2,2,1);
  ctx.globalAlpha=1;

  // Individual dark stones form an open ring with gaps between them.
  const stones=[
    {x:-12,y:-1,shape:[[0,1],[1,0],[3,0],[4,1],[3,3],[1,3],[0,2]],base:'#4a5551',top:'#83877a'},
    {x:-8,y:-5,shape:[[0,1],[2,0],[3,1],[3,3],[1,3],[0,2]],base:'#56605a',top:'#92907f'},
    {x:-3,y:-7,shape:[[0,1],[1,0],[4,0],[4,2],[2,3],[0,2]],base:'#46524e',top:'#858a7c'},
    {x:4,y:-6,shape:[[0,1],[1,0],[3,0],[4,1],[3,3],[1,2],[0,2]],base:'#59615a',top:'#99917e'},
    {x:10,y:-2,shape:[[0,1],[1,0],[3,1],[3,3],[1,3],[0,2]],base:'#4c5752',top:'#858879'},
    {x:7,y:2,shape:[[0,1],[1,0],[4,1],[3,3],[1,3],[0,2]],base:'#515a54',top:'#8c8979'},
    {x:-8,y:2,shape:[[0,1],[1,0],[4,0],[4,2],[2,3],[0,2]],base:'#4a5550',top:'#898879'},
  ];
  for(const [stoneIndex,stone] of stones.entries()){
    if(decayProgress>.12+stoneIndex*.1)continue;
    const {x,y,shape,base,top}=stone;
    polygon(shape.map(([sx,sy])=>[x+sx,y+sy+1]),'#202724');
    polygon(shape.map(([sx,sy])=>[x+sx,y+sy]),base);
    pixel(top,x+1,y,2,1);
    if(flameStrength>.04){
      ctx.globalAlpha=flameStrength;
      if(emberPulse>.5&&x<0)pixel('#a95b37',x+2,y+1,1,1);
      if(emberPulse<.45&&x>0)pixel('#865139',x+1,y+1,1,1);
      ctx.globalAlpha=1;
    }
  }

  ctx.save();
  ctx.globalAlpha=1-decayProgress;
  // Two charred sticks visibly cross; their pale cut ends and bark ridges break the X silhouette.
  polygon([[-11,-4],[-8,-7],[11,1],[9,4],[-10,-2]],'#251d19');
  polygon([[-11,-5],[-9,-7],[11,1],[9,3],[-10,-3]],campfireSpentWoodColor('#69432f','#302a25',flameStrength));
  polygon([[-11,1],[-9,4],[10,-5],[8,-7],[-10,-1]],'#241d19');
  polygon([[-11,0],[-9,3],[10,-6],[8,-8],[-10,-2]],campfireSpentWoodColor('#78503a','#332c26',flameStrength));
  pixel(campfireSpentWoodColor('#b18459','#443b33',flameStrength),-7,-6,3,1);
  pixel(campfireSpentWoodColor('#a97a4e','#40372f',flameStrength),5,-4,3,1);
  pixel('#392923',-4,-2,5,1);pixel('#493126',2,-3,5,1);
  // Exposed log ends read as wood cuts instead of flat rectangular bars.
  polygon([[-12,-5],[-10,-7],[-8,-6],[-9,-4],[-11,-3]],campfireSpentWoodColor('#9b6c48','#403832',flameStrength));
  pixel(campfireSpentWoodColor('#d0a16a','#50473d',flameStrength),-11,-6,1,1);
  pixel(campfireSpentWoodColor('#5b3929','#302a25',flameStrength),-9,-5,1,1);
  polygon([[8,1],[10,0],[12,1],[11,3],[9,4]],campfireSpentWoodColor('#916343','#3e3730',flameStrength));
  pixel(campfireSpentWoodColor('#c2915a','#4c4339',flameStrength),10,1,1,1);
  pixel(campfireSpentWoodColor('#50372a','#302a25',flameStrength),10,2,1,1);
  polygon([[-12,1],[-10,0],[-8,1],[-9,3],[-11,4]],campfireSpentWoodColor('#80563d','#39332d',flameStrength));
  pixel(campfireSpentWoodColor('#bd8b57','#494137',flameStrength),-11,1,1,1);
  pixel(campfireSpentWoodColor('#53382a','#302a25',flameStrength),-10,2,1,1);
  polygon([[8,-6],[10,-8],[12,-7],[11,-5],[9,-4]],campfireSpentWoodColor('#9b704c','#403832',flameStrength));
  pixel(campfireSpentWoodColor('#d1a16c','#50473d',flameStrength),10,-7,1,1);
  pixel(campfireSpentWoodColor('#5b3e2d','#302a25',flameStrength),10,-6,1,1);
  ctx.restore();

  if(decayProgress>.02){
    ctx.save();ctx.globalAlpha=decayProgress*.5;
    pixel('#4b514a',-17,3,2,1);pixel('#5b5b4c',-13,7,1,1);
    pixel('#53564e',13,4,2,1);pixel('#494d48',17,-1,1,1);
    ctx.restore();
  }
  ctx.globalAlpha=flameStrength;
  pixel(emberPulse>.5?'#e17638':'#9d4028',-2,-1,2,1);
  pixel(emberPulse>.55?'#ffd36b':'#ba4a2a',2,-2,2,1);
  ctx.globalAlpha=1;

  // Smoke is a separate effect: it thickens while the logs smolder and lingers after the flame dies.
  if(flameStrength>0)drawCampfireSmokePuffs(p,particles.smoke,smokeState.strength,sway);
  ctx.globalAlpha=1;

  if(flameStrength>0){
    ctx.save();ctx.globalAlpha=flameStrength;
    const flameScale=.4+.6*flameStrength;
    ctx.translate(p.x+sway,p.y-2);ctx.scale(flameScale,flameScale);ctx.translate(-p.x-sway,-p.y+2);
    drawCampfireFlames(ctx,Math.round(p.x+sway),Math.round(p.y),time,seed,reducedMotion);
    ctx.restore();
  }

  if(!reducedMotion){
    for(const spark of particles.sparks){
      ctx.globalAlpha=spark.alpha*flameStrength;
      pixel(spark.color,sway+spark.x,spark.y,spark.size,spark.size);
    }
  }
  ctx.globalAlpha=1;
  if(flameStrength>.2)drawCampfireGatheringMark(p,time,companionCount);ctx.restore();
}

function drawArrivalHearth(fire,time){
  const p=point(fire.x,fire.y),seed=fire.x*1.7+fire.y*.63,strength=campfireFlameStrength(fire,performance.now())*arrivalFireIgnition();
  const pulse=reducedMotion?1:.94+.06*Math.sin(time*1.45+seed);
  const radius=TILE_X*(3.7+.25*Math.sin(time*1.1+seed))*pulse;
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.24*strength;
  const aura=ctx.createRadialGradient(p.x,p.y-7,2* spriteScale,p.x,p.y-7,radius);
  aura.addColorStop(0,'rgba(255,225,158,.28)');aura.addColorStop(.12,'rgba(255,199,121,.18)');
  aura.addColorStop(.36,'rgba(255,165,88,.09)');aura.addColorStop(.68,'rgba(244,149,83,.03)');aura.addColorStop(1,'rgba(255,190,113,0)');
  ctx.fillStyle=aura;ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);ctx.restore();
  if(campfireAuraImage?.naturalWidth)drawCampfireAura(p,time,seed,strength,'ground');
  ctx.save();ctx.globalAlpha=strength;ctx.globalCompositeOperation='lighter';
  ctx.globalCompositeOperation='source-over';
  if(!reducedMotion){
    for(let i=0;i<7;i++){
      const phase=(time*(.18+i*.012)+i*.173)%1,angle=i*2.399+time*.18;
      const x=p.x+Math.cos(angle)*(7+phase*20)*spriteScale,y=p.y-(10+phase*42)*spriteScale;
      ctx.globalAlpha=(1-phase)*.72*strength;ctx.fillStyle=i%3?'#ffd889':'#a6f1da';ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,2*spriteScale),Math.max(1,2*spriteScale));
    }
    ctx.strokeStyle='rgba(171,242,218,.62)';ctx.lineWidth=Math.max(1,spriteScale);
    for(let arc=0;arc<2;arc++){
      const phase=time*.55+arc*Math.PI;ctx.globalAlpha=.28+.22*Math.sin(phase);
      ctx.beginPath();ctx.ellipse(p.x,p.y-17*spriteScale,(19+arc*8+Math.sin(phase)*2)*spriteScale,(9+arc*4)*spriteScale,phase*.15,phase,phase+1.1);ctx.stroke();
    }
  }
  ctx.restore();
}
function arrivalFireIgnition(){
  return arrivalFlameIgnition(arrivalCinematicAge());
}

function drawCampfireAfterglow(time){
  if(worldLocation!=='clearing')return;
  const sampleNow=performance.now();
  for(const fire of fires.values()){
    if(campfireFlameStrength(fire,sampleNow)>0)continue;
    const smokeState=campfireSmokeState(fire,sampleNow);
    if(smokeState.strength<=.01)continue;
    const airflow=reducedMotion?0:windSwayAt(fire.x,fire.y,time);
    const particles=sampleCampfireParticles(time,fire,airflow,.9,reducedMotion,smokeState.strength,1);
    const p=point(fire.x,fire.y),sway=Math.round(airflow*2.1);
    ctx.save();scaleAround(p,spriteScale);
    drawCampfireSmokePuffs(p,particles.smoke,smokeState.strength,sway,true);
    ctx.restore();
  }
}

function drawChatBubble(player, p, shareTarget) {
  if (typeof player.chat !== 'string' || !player.chat) return;
  ctx.save();
  ctx.font = '7px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = wrapChatMessage(player.chat, text => ctx.measureText(text).width, 104);
  if (!lines.length) { ctx.restore(); return; }
  const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
  const width = Math.max(54, Math.ceil(textWidth + 20));
  const height = lines.length * 8 + 6;
  if (p.x < -40 || p.x > viewWidth + 40 || p.y < -40 || p.y > viewHeight + 40) { ctx.restore(); return; }
  const left = Math.round(Math.max(3, Math.min(viewWidth - width - 3, p.x - width / 2)));
  const top = Math.round(Math.max(4, p.y - (shareTarget ? 67 : 51) - height));
  ctx.fillStyle = CLAREIRA.palette.ink;
  ctx.fillRect(left - 1, top - 1, width + 2, height + 2);
  ctx.fillStyle = CLAREIRA.palette.parchment;
  ctx.fillRect(left, top, width, height);
  ctx.fillStyle = CLAREIRA.signature.afterglow;
  ctx.fillRect(left + 2, top + 2, 5, 1);
  ctx.fillStyle = CLAREIRA.signature.ember;
  ctx.fillRect(left + width - 10, top + 3, 2, 1);
  ctx.fillRect(left + width - 7, top + 2, 2, 1);
  ctx.fillRect(left + width - 4, top + 3, 2, 1);
  ctx.fillStyle = CLAREIRA.signature.leaf;
  ctx.fillRect(left + width - 3, top + 1, 2, 1);
  ctx.fillStyle = CLAREIRA.palette.ink;
  lines.forEach((line, index) => ctx.fillText(line, left + 5, top + 4 + index * 8));
  const tailX = Math.max(left + 2, Math.min(left + width - 7, Math.round(p.x - 2)));
  ctx.fillStyle = CLAREIRA.palette.ink;
  ctx.fillRect(tailX - 1, top + height, 6, 3);
  ctx.fillStyle = CLAREIRA.palette.parchment;
  ctx.fillRect(tailX, top + height, 3, 1);
  ctx.fillRect(tailX + 1, top + height + 1, 1, 1);
  ctx.restore();
}

function drawAvatarBreeze(px, py, worldX, worldY, time, playerId) {
  if (reducedMotion || worldLocation !== 'clearing') return;
  const strength = windStrengthAt(worldX, worldY);
  if (strength < .24) return;
  const direction = windDirectionAt(worldX, worldY, time);
  const screenX = (direction.x - direction.y) * TILE_X;
  const screenY = (direction.x + direction.y) * TILE_Y;
  const length = Math.hypot(screenX, screenY) || 1;
  const dx = screenX / length, dy = screenY / length;
  const sideX = -dy, sideY = dx;
  const sway = windSwayAt(worldX, worldY, time);
  const phase = time * (.48 + strength * .42) + (String(playerId || '').length * .19);
  for (let index = 0; index < 3; index += 1) {
    const travel = ((phase + index * .34) % 1 + 1) % 1;
    const crosswind = (index - 1) * 7 + sway * 2.2;
    const x = px - dx * (4 + travel * 20) + sideX * crosswind;
    const y = py - 65 + index * 12 - dy * (4 + travel * 20) + sideY * crosswind;
    const streakLength = 2 + Math.round(strength * 3);
    const alpha = .12 + strength * .24;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = index === 1 ? '#d5efd4' : '#a9d8d0';
    ctx.fillRect(-Math.floor(streakLength / 2), 0, streakLength, 1);
    ctx.fillRect(-Math.floor(streakLength / 2) - 2, -1, 1, 1);
    ctx.restore();
  }
}

function drawAvatarFire(px, py, time, playerId, remainingMs) {
  if(!(remainingMs>0))return;
  const phase=reducedMotion?0:time*8+(String(playerId||'').length*.73);
  const sway=reducedMotion?0:Math.round(Math.sin(phase)*1.5);
  ctx.save();
  ctx.globalAlpha=.84;
  for(let index=0;index<3;index++){
    const offset=index-1;
    const flicker=reducedMotion?0:Math.round(Math.sin(phase+index*1.8)*2);
    const x=px+offset*7+sway+flicker;
    const height=13+Math.round((1-offset*offset)*3)+(!reducedMotion&&Math.sin(phase+index)>0?2:0);
    const top=py-8-height;
    ctx.fillStyle='#c94b32';
    ctx.fillRect(x-2,top+2,4,height);
    ctx.fillRect(x-1,top,2,3);
    ctx.fillStyle='#f17b35';
    ctx.fillRect(x-1,top+4,2,height-5);
    ctx.fillStyle='#ffd15d';
    ctx.fillRect(x,top+8,1,height-10);
    ctx.fillRect(x,top+3,1,2);
  }
  ctx.restore();
}

function drawAvatarGroundShadow(player,isSelf=false){
  if(player.furnitureUse?.action==='lie')return;
  const position=isSelf?localRenderPosition:player;
  const p=point(position.x,position.y,camera,surfaceHeight(position.x,position.y,worldLocation,currentRoomLayout()));
  const water=worldLocation==='clearing'?waterStateAt(position.x,position.y,WORLD_WATER_OPTIONS):{depth:0};
  const direction=frameShadowDirectionAt?.(position.x,position.y);
  const scale=spriteScale*AVATAR_BODY_SCALE;
  const profile=avatarShadowProfile({scale,bodyHeight:AVATAR_SPRITE_SPEC.baseHeight,z:position.z,swimming:water.depth>WATER_WADING_DEPTH,
    strength:direction?.strength,lengthScale:direction?.lengthScale});
  const night=gameDay.daylight<.18;
  drawHardShadow(p.x,p.y+scale,profile.contactWidth*.5,profile.contactHeight*.5,0,profile.contactOpacity*(night ? .68 : 1));
  drawSoftShadow(p.x,p.y+scale,profile.contactWidth*1.4,profile.contactHeight*2,0,(night ? .28 : .45)/(1+Math.max(0,position.z||0)));
  if(direction&&direction.source?.kind!=='ambient'&&direction.strength>.01){
    const cast=avatarDirectionalShadowProfile(profile,{daylight:gameDay.daylight,sourceKind:direction.source.kind});
    if(cast.opacity>.005){
      const angle=Math.atan2(direction.y,direction.x),length=cast.length;
      drawSoftShadow(p.x+direction.x*length*.4,p.y+direction.y*length*.4,
        length*(night?1.05:1.4),cast.width*(night?1.45:1.8),angle,cast.opacity*(night?1.2:1.5));
      if(cast.hardSilhouette)
        drawFootprintShadow(actorShadowOutline({x:p.x,y:p.y+scale},direction,length,cast.width),0,0,cast.opacity);
    }
  }
}

function drawAvatar(player, time, isSelf = false, shareTarget = false, pickupFrame = null, visibleNameplateIds = new Set()) {
  const position = isSelf ? localRenderPosition : player;
  const restingBed=worldLocation==='room'&&player.furnitureUse?.action==='lie'
    ?roomFurniture.get(player.furnitureUse.id):null;
  const restingBedVisual=restingBed?furnitureVisual(restingBed):null;
  const restingHeight=restingBedVisual?.height||0;
  const bedAngle=((restingBedVisual?.rotation||0)%4)*Math.PI/2,bedInset=(restingBedVisual?.width||0)*.24;
  const renderX=position.x+Math.cos(bedAngle)*bedInset,renderY=position.y+Math.sin(bedAngle)*bedInset;
  const p=point(renderX,renderY,camera,
    surfaceHeight(position.x,position.y,worldLocation,currentRoomLayout())+restingHeight);
  const water=worldLocation==='clearing'
    ? waterStateAt(position.x,position.y,WORLD_WATER_OPTIONS)
    : {depth:0};
  const wet=water.depth>.035;
  const immersionAmount=Math.max(0,Math.min(1,water.depth/1.45));
  const immersion=immersionAmount*immersionAmount*(3-2*immersionAmount);
  const waterSink=immersion*4.2;
  const swimming=water.depth>WATER_WADING_DEPTH;
  const swimBob=swimming&&!reducedMotion?Math.sin(time*1.55+(player.id?.length||0))*1.05:0;
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';scaleAround(p,spriteScale);
  const appearance=getAvatarComposition(player.appearance).appearance;
  const moving = isSelf ? localMoving : player.moving === true;
  const pose = getAvatarPose(player, Date.now());
  let facing = getAvatarFacing(
    player,
    isSelf ? localRenderPosition : player,
    fires.values(),
    TILE_X,
    TILE_Y,
  );
  const px=Math.round(p.x),groundY=Math.round(p.y),py=groundY-Math.round((position.z||0)*24+swimBob)+Math.round(waterSink);
  const oldBody=bodyAnimations.get(player.id),bodyTime=performance.now()/1000;
  const previous=strides.get(player.id);
  const distance=previous?Math.hypot(position.x-previous.x,position.y-previous.y):0;
  const grounded=(position.z||0)<=.02;
  const running=Boolean(position.running??player.running);
  const crouching=Boolean(position.crouching??player.crouching);
  const gaitFrameSets=getAvatarComposition(appearance).layers.find(layer=>layer.motionBinding==='gait')?.actionFrames;
  const walkFrameSet=gaitFrameSets?.walk;
  const runFrameSet=gaitFrameSets?.run;
  const walkCycleDistance=Number(walkFrameSet?.distancePerCycle)||1.4;
  const runCycleDistance=Number(runFrameSet?.distancePerCycle)||1.8;
  const phase=advanceAvatarSpritePhase(previous?.phase||0,moving&&!swimming&&grounded?distance:0,reducedMotion,running?runCycleDistance:walkCycleDistance);
  const animationDelta=Math.max(0,oldBody?bodyTime-oldBody.time:1/60);
  const animatedBody=blendBody(oldBody,{...pose,crouching,running,gathering:pose.gathering||(isSelf&&pickupFrame?.reaching)},reducedMotion?1:animationDelta);
  bodyAnimations.set(player.id,{...animatedBody,time:bodyTime,z:position.z||0});
  if(bodyAnimations.size>128)bodyAnimations.delete(bodyAnimations.keys().next().value);
  const motionState=advanceAvatarMotion(avatarMotions.get(player.id),{
    moving:moving&&!swimming,running:running&&!swimming,grounded,airborne:(position.z||0)>.02,
    crouching:crouching&&!swimming,swimming,sitting:pose.sitting,gesture:pose.gesture,
    gathering:pose.gathering||(isSelf&&pickupFrame?.reaching),
  },bodyTime,reducedMotion);
  avatarMotions.set(player.id,motionState);
  if(avatarMotions.size>128)avatarMotions.delete(avatarMotions.keys().next().value);
  ctx.save(); scaleAround(p, AVATAR_BODY_SCALE);
  if(wet&&(position.z||0)<=.02){
    const wave=reducedMotion?0:Math.sin(time*(swimming?1.8:3.2)+(player.id?.length||0))*(swimming?1.1:1.4);
    ctx.strokeStyle=dimensionTheme==='energy'?'#9bf1ee99':'#bee4d499';ctx.lineWidth=Math.max(1,spriteScale);
    ctx.beginPath();ctx.ellipse(px,groundY+1,6+(swimming?3:0)+Math.abs(wave),2+(swimming?1:0)+Math.max(0,wave*.2),0,0,Math.PI*2);ctx.stroke();
    if(swimming&&moving&&previous){
      const dx=(position.x-previous.x)-(position.y-previous.y),dy=(position.x-previous.x)+(position.y-previous.y);
      const length=Math.hypot(dx,dy)||1,trailX=dx/length,trailY=dy/length;
      ctx.globalAlpha=.42;ctx.beginPath();ctx.ellipse(px-trailX*7,groundY+1-trailY*3,5,1.5,Math.atan2(trailY,trailX),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    }
  }
  const walkingOnGround=moving&&!swimming&&grounded&&worldLocation!=='room';
  if(walkingOnGround){
    const dist=isSelf?0:Math.hypot(position.x-localRenderPosition.x,position.y-localRenderPosition.y);
    const maxFootstepDist=18;
    if(dist<maxFootstepDist){
      const distFactor=dist<=2?1:Math.max(0,(maxFootstepDist-dist)/(maxFootstepDist-2));
      const factor=distFactor*distFactor;
      if(isPathGround(position.x,position.y)){
        const config=FOOTSTEP_LOOPS.path;
        const vol=factor*(running?config.runVolume:config.walkVolume);
        if(vol>pendingFootstepFrameState.pathVolume){
          pendingFootstepFrameState.pathVolume=vol;
          pendingFootstepFrameState.pathRunning=running;
        }
      } else if(isGrassGround(position.x,position.y)){
        const config=FOOTSTEP_LOOPS.grass;
        const vol=factor*(running?config.runVolume:config.walkVolume);
        if(vol>pendingFootstepFrameState.grassVolume){
          pendingFootstepFrameState.grassVolume=vol;
          pendingFootstepFrameState.grassRunning=running;
        }
      }
    }
  }
  const footstep=!reducedMotion&&moving&&!swimming&&grounded&&previous&&Math.floor(phase/Math.PI)!==Math.floor(previous.phase/Math.PI);
  const waterTransition=Boolean(previous&&previous.wet!==wet);
  const swimTransition=Boolean(previous&&previous.swimming!==swimming);
  if(!reducedMotion&&(waterTransition||swimTransition)){
    waterSplashes.push({x:position.x,y:position.y,born:time,strength:wet?(swimming ? .72 : 1.2):.78,seed:player.id?.length||0,dimensionId:worldDimensionId,location:worldLocation});
    if(waterSplashes.length>32)waterSplashes.shift();
  } else if(footstep&&wet&&!swimming){
    waterSplashes.push({x:position.x,y:position.y,born:time,strength:.72,seed:phase,dimensionId:worldDimensionId,location:worldLocation});
    if(waterSplashes.length>32)waterSplashes.shift();
  } else if(footstep){
    footDust.push({x:position.x,y:position.y,born:time,room:worldLocation==='room'});
    if(footDust.length>32)footDust.shift();
  }
  strides.set(player.id,{x:position.x,y:position.y,phase,wet,swimming});
  if(strides.size>128)strides.delete(strides.keys().next().value);
  const nearbySeat=worldLocation==='room'&&player.sitting&&!player.moving
    ?[...roomFurniture.values()].find(item=>['stool','chair'].includes(item.kind)&&Math.hypot(position.x-item.x,position.y-item.y)<=1.05)
    :null;
  if(nearbySeat)facing=['southeast','southwest','northwest','northeast'][nearbySeat.rotation||0];
  const framePlayer=nearbySeat?{...player,seatType:'chair'}:player;
  const selected=selectAvatarFrame({appearance,facing,phase,travelDistance:moving&&!swimming?distance:0,moving:moving&&!swimming,running:running&&!swimming,crouching:crouching&&!swimming,pose:{...pose,...animatedBody},position,player:framePlayer,motionState,time,now:Date.now(),reducedMotion});
  avatarSelections.set(player.id,{...selected,phase,motion:motionState.action});
  if(avatarSelections.size>128)avatarSelections.delete(avatarSelections.keys().next().value);
  drawAvatarBreeze(px,py,position.x,position.y,time,player.id);
  const animation={phase,moving:moving&&!swimming,running:running&&!swimming,crouching:crouching&&!swimming,
    swimming,pose:{...pose,...animatedBody},position,time,nowMs:Date.now(),
    transition:motionState.transition,transitionProgress:motionState.transitionProgress,suppressAura:true};
  const smoothAvatar=worldLocation==='clearing'&&!isTerrainPixelationActive();
  const windowScene=worldLocation==='clearing'&&gameDay.night>=.08?currentSceneLights():null;
  const surfaceLight=windowScene?actorWindowLight(position,windowScene.lights,windowScene.obstacles,surfaceHeight(position.x,position.y,'clearing'),AVATAR_SPRITE_SPEC.baseHeight*AVATAR_BODY_SCALE/HEIGHT_PIXELS):null;
  const pngOnlyAvatar=['outfit.commoner','outfit.white-base'].includes(appearance.outfitId);
  const idlePngFrame={...selected,action:'idle',group:'idle',frame:0};
  const drawCanvasFallback=()=>{
    drawAvatarSprite(ctx,px,py,selected,appearance,{layerRoles:['aura-back'],smooth:smoothAvatar});
    if(pngOnlyAvatar)drawAvatarSprite(ctx,px,py,idlePngFrame,appearance,{smooth:smoothAvatar,surfaceLight});
    else drawCanvasAvatar(ctx,px,py,selected,appearance,{animation,smooth:smoothAvatar,surfaceLight});
    drawAvatarSprite(ctx,px,py,selected,appearance,{layerRoles:['aura-front'],smooth:smoothAvatar});
  };
  const drawBody=()=>{if(!drawAvatarSprite(ctx,px,py,selected,appearance,{smooth:smoothAvatar,surfaceLight}))drawCanvasFallback();};
  if(pose.lying){
    const skew=Math.atan2(TILE_Y,TILE_X),angles=[-Math.PI/2+skew,Math.PI/2-skew,Math.PI/2+skew,-Math.PI/2-skew];
    ctx.save();ctx.translate(px,py);ctx.rotate(angles[(player.furnitureUse?.rotation||0)%4]);ctx.scale(.64,.64);ctx.translate(-px,-py);drawBody();ctx.restore();
  }else drawBody();

  if(pose.showering){
    const unit=Math.max(1,spriteScale*.78),showerPhase=reducedMotion?0:time*1.8;
    ctx.save();ctx.globalAlpha=.82;ctx.fillStyle='#a8dce0';
    for(let drop=0;drop<5;drop++){
      const progress=reducedMotion?0.45:((showerPhase+drop*.23)%1),dx=(drop-2)*3+Math.round(Math.sin(showerPhase+drop)*1.2);
      const dy=-30*AVATAR_BODY_SCALE+progress*27*AVATAR_BODY_SCALE;
      ctx.fillRect(Math.round(px+dx*AVATAR_BODY_SCALE),Math.round(py+dy),unit,unit*1.8);
      if(progress>.82){ctx.globalAlpha=.48;ctx.fillRect(Math.round(px+dx*AVATAR_BODY_SCALE-2*AVATAR_BODY_SCALE),Math.round(py-2),unit*2,unit);ctx.globalAlpha=.82;}
    }
    ctx.restore();
  }
  drawAvatarFire(px,py,time,player.id,position.burningRemainingMs??player.burningRemainingMs);
  ctx.restore();
  if(wet&&immersion>.28&&(position.z||0)<=.02){
    const waterlineY=groundY-Math.round(immersion*3.5),radiusX=6+immersion*3,radiusY=1.4+immersion*.8;
    ctx.save();ctx.globalAlpha=.18+immersion*.12;ctx.fillStyle=WATER_PALETTES[dimensionTheme]?.[0]||WATER_PALETTES.forest[0];
    ctx.beginPath();ctx.ellipse(px,waterlineY+1,radiusX,radiusY,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.5+immersion*.14;ctx.strokeStyle=WATER_PALETTES[dimensionTheme]?.[1]||WATER_PALETTES.forest[1];
    ctx.lineWidth=Math.max(1,spriteScale*.55);ctx.beginPath();ctx.ellipse(px,waterlineY,radiusX+1,radiusY+1,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  if (pose.symbol) {
    const gestureLift = !reducedMotion ? Math.round(Math.sin(time * 6) * 2) : 0;
    ctx.fillStyle = '#fff0bd'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(pose.symbol, p.x + 8, p.y - 52 - gestureLift);
  }
    const name = isSelf ? (ui.name.value.trim().slice(0, 20) || 'Visitante') : player.name;
  // Keep the plate attached to this avatar; nearby plates can occupy separate heights naturally.
  const showNameplate = visibleNameplateIds.has(player.id);
  const nameLift=(worldLocation==='room'?Math.round((pose.sitting?60:80)*AVATAR_BODY_SCALE+6):56)+Math.round((position.z||0)*24);
  if (showNameplate) {
    ctx.font = '6px system-ui'; ctx.textAlign = 'center';
    const width = Math.min(82, ctx.measureText(name).width + 8);
    ctx.fillStyle = '#14251fdc'; ctx.fillRect(Math.round(p.x - width / 2), Math.round(p.y - nameLift), width, 9);
    ctx.fillStyle = isSelf ? '#f2dda2' : '#e1ebd9'; ctx.fillText(name, p.x, p.y - nameLift + 7);
    if (isSelf) { ctx.fillStyle = '#f5d586'; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - nameLift - 2), 2, 1); }
  } else if (isSelf && worldLocation!=='room') {
    const markerX=Math.round(p.x),markerY=Math.round(p.y-nameLift-5);
    ctx.fillStyle='#14251fdc';
    ctx.fillRect(markerX-1,markerY,3,1);ctx.fillRect(markerX-3,markerY+1,7,1);
    ctx.fillRect(markerX-4,markerY+2,9,2);ctx.fillRect(markerX-3,markerY+4,7,1);
    ctx.fillRect(markerX-1,markerY+5,3,1);
    ctx.fillStyle='#f5d586';
    ctx.fillRect(markerX-1,markerY+1,3,1);ctx.fillRect(markerX-2,markerY+2,5,2);
    ctx.fillRect(markerX-1,markerY+4,3,1);
    ctx.fillStyle='#fff2bf';ctx.fillRect(markerX,markerY+2,1,1);
  }
  if (shareTarget) {
    const label = 'OFERECER FRUTINHA';
    ctx.font = 'bold 8px system-ui';
    const width = Math.ceil(ctx.measureText(label).width) + 15;
    const left = Math.round(p.x - width / 2);
    const top = Math.round(p.y - nameLift - 15);
    ctx.fillStyle = CLAREIRA.signature.afterglow;
    ctx.fillRect(left, top, width, 1); ctx.fillRect(left, top + 9, width, 1);
    ctx.fillRect(left, top + 1, 1, 8); ctx.fillRect(left + width - 1, top + 1, 1, 8);
    ctx.fillStyle = CLAREIRA.palette.ink;
    ctx.fillRect(left + 1, top + 1, width - 2, 8);
    ctx.fillStyle = CLAREIRA.signature.ember;
    ctx.fillRect(left + 3, top + 3, 1, 1); ctx.fillRect(left + 5, top + 2, 1, 1); ctx.fillRect(left + 7, top + 3, 1, 1);
    ctx.fillStyle = CLAREIRA.signature.leaf;
    ctx.fillRect(left + 8, top + 2, 2, 1); ctx.fillRect(left + 9, top + 3, 1, 1);
    ctx.fillStyle = CLAREIRA.palette.parchment; ctx.textAlign = 'center';
    ctx.fillText(label, p.x + 5, top + 8);
  }
  drawChatBubble(player, {...p,y:p.y-(nameLift-22)}, shareTarget);
  ctx.restore();
}

function drawPickupResponse(frame) {
  if (!frame?.showBurst) return;
  const p = point(frame.x, frame.y);
  const spread = reducedMotion ? 0 : Math.round(frame.burstProgress * 5);
  const lift = reducedMotion ? 0 : Math.round(frame.burstProgress * 4);
  ctx.globalAlpha = reducedMotion ? .9 : 1 - frame.burstProgress * .58;
  ctx.fillStyle = CLAREIRA.signature.ember;
  ctx.fillRect(Math.round(p.x - 4 - spread), Math.round(p.y - 3 - lift), 2, 2);
  ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 5 - lift), 2, 2);
  ctx.fillRect(Math.round(p.x + 3 + spread), Math.round(p.y - 3 - lift), 2, 2);
  ctx.fillStyle = CLAREIRA.signature.leaf;
  ctx.fillRect(Math.round(p.x + 5 + spread), Math.round(p.y - 6 - lift), 2, 1);
  ctx.fillRect(Math.round(p.x + 6 + spread), Math.round(p.y - 5 - lift), 1, 1);
  ctx.globalAlpha = 1;
}

function drawCollisionResponse(frame) {
  if (!frame) return;
  const p = point(localRenderPosition.x, localRenderPosition.y);
  const spread = frame.spread;
  const x = Math.round(p.x + frame.direction.x * 10);
  const y = Math.round(p.y - 7 + frame.direction.y * 4 - frame.lift);

  ctx.globalAlpha = frame.alpha;
  ctx.fillStyle = CLAREIRA.signature.ember;
  ctx.fillRect(x - 2 - spread, y, 2, 2);
  ctx.fillRect(x - 1, y - 3, 2, 2);
  ctx.fillStyle = CLAREIRA.signature.afterglow;
  ctx.fillRect(x + 2 + spread, y, 2, 2);
  ctx.fillStyle = CLAREIRA.signature.leaf;
  ctx.fillRect(x + 3 + spread, y - 3, 2, 1);
  ctx.fillRect(x + 4 + spread, y - 2, 1, 1);
  ctx.globalAlpha = 1;
}

function drawBerryOfferResponses(now = performance.now()) {
  for (let index = berryOfferFeedbacks.length - 1; index >= 0; index -= 1) {
    const frame = getBerryOfferFrame(berryOfferFeedbacks[index], now, reducedMotion);
    if (!frame) { berryOfferFeedbacks.splice(index, 1); continue; }
    const from = point(frame.from.x, frame.from.y);
    const to = point(frame.to.x, frame.to.y);
    const progress = frame.progress;
    const x = Math.round(from.x + (to.x - from.x) * progress);
    const arc = reducedMotion ? 0 : Math.round(Math.sin(progress * Math.PI) * 17);
    const y = Math.round(from.y + (to.y - from.y) * progress - arc);

    ctx.globalAlpha = frame.opacity;
    ctx.fillStyle = CLAREIRA.signature.ember;
    ctx.fillRect(x - 7, y + 1, 2, 2);
    ctx.fillRect(x - 5, y - 3, 2, 2);
    ctx.fillRect(x - 2, y - 5, 2, 2);
    ctx.fillStyle = CLAREIRA.signature.leaf;
    ctx.fillRect(x - 1, y - 8, 3, 2);
    ctx.fillRect(x + 1, y - 9, 2, 1);
    ctx.fillStyle = CLAREIRA.material.berry.fruit;
    ctx.fillRect(x - 1, y - 3, 5, 4);
    ctx.fillRect(x, y - 4, 3, 1);
    ctx.fillStyle = CLAREIRA.material.berry.seed;
    ctx.fillRect(x + 2, y - 2, 1, 1);
    ctx.fillStyle = CLAREIRA.material.berry.newLeaf;
    ctx.fillRect(x + 2, y - 5, 2, 2);
    ctx.globalAlpha = 1;
  }
}

function drawWildlifeShelter(shelter,time) {
  if(!canObserveWildlifeShelter(shelter,localRenderPosition))return;
  const cover=shelter.cover,kind=shelter.kind;
  const nest=['canopy-nest','high-nest','hedge-nest'].includes(kind);
  const p=nest?point(cover.x,cover.y):point(shelter.x,shelter.y);
  ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));ctx.scale(spriteScale,spriteScale);
  const pixel=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  if(['canopy-nest','high-nest','hedge-nest'].includes(kind)){
    const lift=kind==='hedge-nest'?12:42;
    pixel(-6,-lift+3,17,2,'#594630');
    pixel(-6,-lift-2,12,2,'#705035');pixel(-8,-lift,3,3,'#8d7049');pixel(5,-lift,3,3,'#8d7049');
    pixel(-5,-lift+2,10,2,'#80643d');pixel(-3,-lift,6,2,'#302b24');
    // Leaves interrupt the silhouette: no free-standing post or exposed platform.
    pixel(-10,-lift-4,6,4,'#376449');pixel(4,-lift-5,8,4,'#376449');
    pixel(-9,-lift+3,7,3,'#426d48');pixel(3,-lift+2,8,4,'#426d48');
  }else if(['cave','rock-shelter','warm-rock'].includes(kind)){
    pixel(-13,-9,26,9,'#515751');pixel(-9,-14,19,9,'#747a6c');pixel(-5,-15,12,3,'#959584');
    pixel(-6,-8,12,8,'#262c29');pixel(-3,-11,7,7,'#262c29');pixel(-13,0,26,2,'#373f32');
  }else if(['burrow','tree-hollow','root-hollow','den'].includes(kind)){
    pixel(-11,-2,22,5,'#6e5236');pixel(-8,-6,16,4,'#917448');pixel(-4,-8,8,2,'#917448');
    pixel(-6,-1,12,4,'#202820');pixel(-4,-3,8,2,'#202820');
    pixel(-12,0,3,4,'#536943');pixel(9,-1,3,5,'#789055');pixel(-7,3,13,1,'#b4975e');
  }else{
    pixel(-14,-3,28,6,'#394d35');pixel(-11,-6,7,5,'#687b48');pixel(4,-7,7,6,'#6f8051');
    pixel(-8,-2,16,5,'#9b8a56');pixel(-5,0,10,2,'#c0a975');
  }
  if(!nest){
    // Ground entrances remain partly covered by roots, ferns or reeds.
    pixel(-13,-5,7,4,'#304b34');pixel(6,-6,8,5,'#304b34');
    pixel(-10,1,6,4,'#48653d');pixel(4,0,8,4,'#48653d');
    pixel(-9,-7,2,6,'#6c7950');pixel(8,-8,2,7,'#6c7950');
  }
  ctx.restore();
}

function drawTutorialGuide(guide,time){
  const p=point(guide.x,guide.y),pulse=reducedMotion?0:Math.sin(time*2.2)*1.2;
  drawSoftShadow(p.x,p.y+1,12*spriteScale,4*spriteScale,0,.42);
  ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));ctx.scale(spriteScale,spriteScale);
  const glow=ctx.createRadialGradient(0,-13,1,0,-13,19+pulse);
  glow.addColorStop(0,'#ffd478aa');glow.addColorStop(.45,'#ef853a33');glow.addColorStop(1,'#e7771c00');
  ctx.fillStyle=glow;ctx.fillRect(-21,-34,42,38);
  const pixel=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  pixel(-7,-18,14,16,'#32271f');pixel(-6,-17,12,13,'#d77a32');
  pixel(-5,-27,10,10,'#39251b');pixel(-4,-28,8,8,'#e5a052');
  pixel(-7,-29,14,3,'#f7c46a');pixel(-2,-32,5,4,'#ffdd80');
  pixel(-3,-23,2,2,'#fff1bd');pixel(2,-23,2,2,'#fff1bd');
  pixel(-8,-9,5,8,'#58321e');pixel(3,-9,5,8,'#58321e');
  pixel(-5,-3,10,3,'#bf5a2e');pixel(-1,-5,2,3,'#ffc15b');
  ctx.fillStyle='#f4d09a';ctx.font='bold 7px system-ui';ctx.textAlign='center';ctx.fillText('Deus do Fogo',0,-35);
  ctx.restore();
}

function drawWildlife(animal,time,highlight=false) {
  const definition=WILDLIFE_BY_ID.get(animal.speciesId);
  if(!definition||animal.sheltered)return;
  const p=point(animal.x,animal.y),[width,standingHeight]=definition.size;
  const height=animal.state==='dormindo'?Math.round(standingHeight*.6):standingHeight;
  const colors=definition.colors,form=definition.form;
  const moving=Math.hypot(animal.vx||0,animal.vy||0)>.22;
  const gait=moving?Math.round(Math.sin(time*(animal.state==='fugindo'?15:9)+(animal.id.length%7))*1.4):0;
  const bob=moving?Math.round(Math.abs(Math.sin(time*8+(animal.id.length%5)))):0;
  drawSoftShadow(p.x,p.y+1,width*spriteScale*.52,height*spriteScale*.14,.08,.32);
  ctx.save();
  ctx.translate(Math.round(p.x),Math.round(p.y));
  ctx.scale(spriteScale,spriteScale);
  if((animal.vx||0)<-.04)ctx.scale(-1,1);
  const pixel=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};
  const outline='#292820';

  if(form==='ashWraith'){
    pixel(-width*.36,-height*.58,width*.72,height*.48,colors.shadow);
    pixel(-width*.3,-height*.62,width*.6,height*.42,colors.body);
    pixel(-width*.24,-height*.94,width*.48,height*.39,colors.body);
    pixel(-width*.2,-height*.99,width*.14,height*.12,colors.light);
    pixel(width*.06,-height*.99,width*.14,height*.12,colors.light);
    pixel(-width*.16,-height*.55,width*.32,height*.1,colors.accent);
    pixel(-width*.32,-height*.87,width*.13,height*.29,colors.shadow);
    pixel(width*.19,-height*.86,width*.13,height*.28,colors.shadow);
    pixel(-width*.22,-height*.17,width*.15,height*.17,colors.light);
    pixel(width*.08,-height*.15,width*.17,height*.16,colors.accent);
  }else if(form==='firefly'){
    pixel(-3,-6,6,4,colors.shadow);pixel(-2,-6,4,3,colors.body);
    pixel(-1,-8,2,2,colors.light);pixel(-.5,-7,1,1,colors.accent);
    pixel(-4,-6,2,2,colors.mark);pixel(2,-6,2,2,colors.mark);
  }else if(form==='snake'){
    const sway=Math.round(Math.sin(time*5+(animal.id.length%9))*1.5);
    pixel(-width*.48,-height*.5+sway,width*.24,height*.8,colors.shadow);
    pixel(-width*.25,-height*.7-sway,width*.24,height,colors.body);
    pixel(0,-height*.4+sway,width*.24,height*.8,colors.light);
    pixel(width*.2,-height*.65-sway,width*.2,height*.85,colors.body);
    pixel(width*.32,-height*.85,Math.max(3,width*.17),Math.max(3,height*.8),colors.light);
    pixel(width*.43,-height*.76,1.4,1.4,colors.mark);
    if(animal.state==='em-alerta'||animal.state==='ferido')pixel(width*.44,-height*1.04,2,1,colors.accent);
  }else if(form==='bird'||form==='raptor'){
    const flap=reducedMotion?0:Math.round(Math.sin(time*(form==='raptor'?10:14)+(animal.id.length%7))*2);
    pixel(-width*.34,-height*.36+flap,width*.42,height*.28,colors.shadow);
    pixel(-width*.27,-height*.35+flap,width*.37,height*.22,colors.body);
    pixel(-width*.1,-height*.76+flap,width*.48,height*.23,colors.light);
    pixel(width*.2,-height*.62,width*.28,height*.31,colors.body);
    pixel(width*.43,-height*.5,width*.22,Math.max(1,height*.11),colors.accent);
    pixel(-width*.48,-height*.3,width*.22,height*.2,colors.mark);
    pixel(width*.28,-height*.33,1,Math.max(2,height*.2),outline);
    pixel(width*.42,-height*.62,1.3,1.3,'#f5df8b');
  }else if(form==='frog'){
    pixel(-width*.42,-height*.57,width*.82,height*.48,colors.shadow);
    pixel(-width*.35,-height*.67,width*.7,height*.48,colors.body);
    pixel(-width*.35,-height*.91,width*.24,height*.28,colors.light);
    pixel(width*.12,-height*.91,width*.24,height*.28,colors.light);
    pixel(-width*.29,-height*.84,1.5,1.5,outline);pixel(width*.18,-height*.84,1.5,1.5,outline);
    pixel(-width*.48,-height*.12,width*.25,height*.15,colors.accent);
    pixel(width*.22,-height*.12,width*.27,height*.15,colors.accent);
    if(colors.mark)pixel(-width*.1,-height*.55,width*.18,height*.1,colors.mark);
  }else{
    const legHeight=height*.33,legWidth=Math.max(2,width*.1),bodyY=-height*.67+bob;
    pixel(-width*.31,bodyY,width*.58,height*.4,outline);
    pixel(-width*.29,bodyY+1,width*.54,height*.35,colors.body);
    pixel(-width*.28,bodyY+1,width*.34,Math.max(2,height*.08),colors.light);
    pixel(-width*.3,-legHeight+gait,legWidth,legHeight,colors.shadow);
    pixel(-width*.02,-legHeight-gait,legWidth,legHeight,colors.body);
    pixel(width*.18,-legHeight+gait,legWidth,legHeight,colors.shadow);
    pixel(width*.34,-legHeight-gait,legWidth,legHeight,colors.body);
    pixel(width*.19,-height*.76,width*.3,height*.34,outline);
    pixel(width*.2,-height*.75,width*.27,height*.3,colors.body);
    pixel(width*.39,-height*.77,2.5,1.5,'#f2de9d');
    pixel(width*.47,-height*.71,1.5,1.5,outline);
    if(form==='rabbit'){
      pixel(width*.24,-height*1.25,width*.1,height*.42,colors.shadow);pixel(width*.36,-height*1.3,width*.1,height*.47,colors.accent);
    }else if(form==='bear'){
      pixel(width*.2,-height*.88,width*.12,height*.15,colors.shadow);pixel(width*.4,-height*.88,width*.12,height*.15,colors.shadow);
    }else if(form==='deer'){
      pixel(width*.28,-height*1.12,1.5,height*.38,colors.accent);pixel(width*.2,-height*.99,width*.23,1.2,colors.accent);
      pixel(width*.39,-height*1.03,1.5,height*.3,colors.accent);pixel(width*.32,-height*.94,width*.21,1.2,colors.accent);
    }else if(form==='cow'||form==='ox'||form==='bull'||form==='wildebeest'){
      pixel(width*.2,-height*.9,width*.08,height*.18,colors.accent);pixel(width*.46,-height*.91,width*.08,height*.18,colors.accent);
      pixel(width*.14,-height*.99,width*.2,1.5,colors.light);pixel(width*.42,-height,width*.19,1.5,colors.light);
    }
    if(form==='horse'||form==='wolf'||form==='leopard'||form==='cat'){
      pixel(width*.28,-height*.92,width*.11,height*.16,colors.shadow);pixel(width*.47,-height*.91,width*.1,height*.15,colors.shadow);
    }
    if(form==='horse')pixel(width*.07,-height*.88,width*.13,height*.5,colors.shadow);
    if(form==='raccoon'){
      pixel(width*.35,-height*.76,width*.19,height*.09,colors.mark);
      pixel(-width*.49,-height*.43,width*.28,height*.12,colors.shadow);pixel(-width*.62,-height*.42,width*.12,height*.18,colors.light);
    }else if(form==='leopard'){
      for(const spot of [[-.15,-.56],[0,-.48],[.1,-.62],[-.27,-.42]])pixel(width*spot[0],height*spot[1],2,2,colors.mark);
    }else if(form==='cow'){
      pixel(-width*.18,-height*.59,width*.16,height*.18,colors.mark);pixel(-width*.03,-height*.34,width*.18,height*.13,colors.mark);
    }else if(form==='wolf'){
      pixel(-width*.19,-height*.67,width*.34,height*.1,colors.light);
    }else if(form==='deer'||form==='wildebeest'){
      pixel(-width*.48,-height*.5,width*.17,height*.13,colors.accent);
    }else if(form==='mouse'||form==='rat'){
      pixel(-width*.56,-height*.16,width*.2,1,colors.accent);pixel(width*.19,-height*.91,width*.14,height*.22,colors.accent);
    }
  }
  if(animal.state==='em-alerta'||animal.state==='atacando'){ctx.fillStyle='#e0a254';ctx.font='bold 8px system-ui';ctx.fillText('!',width*.35,-height*1.2);}
  if(animal.state==='dormindo'){ctx.fillStyle='#d7d6ac';ctx.font='bold 7px system-ui';ctx.fillText('zz',width*.4,-height*1.2);}
  if(highlight){
    ctx.strokeStyle=CLAREIRA.signature.afterglow;ctx.lineWidth=Math.max(1,.8/spriteScale);
    ctx.beginPath();ctx.ellipse(0,0,width*.68,height*.2,0,0,Math.PI*2);ctx.stroke();
    const text=definition.label+(animal.lifeStage==='filhote'?' · filhote':'');
    ctx.font=`bold ${Math.max(6,6.4/spriteScale)}px system-ui`;ctx.textAlign='center';
    const textWidth=ctx.measureText(text).width;
    pixel(-textWidth/2-2,-height*1.48,textWidth+4,8,'#192621');
    ctx.fillStyle=CLAREIRA.palette.parchment;ctx.fillText(text,0,-height*1.48+6);
  }
  ctx.restore();
}

function drawFireflies(time) {
  if(worldLocation!=='clearing'||gameDay.night<.22)return;
  for(const animal of wildlife.values()){
    if(animal.speciesId!=='firefly'||animal.state==='dormindo'||animal.sheltered)continue;
    const position=renderedWildlifePosition(animal)||animal;
    const p=point(position.x,position.y),phase=(Math.sin(time*2.5+(animal.id.length%11)*.7)+1)*.5;
    const glow=.3+phase*.55;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=glow;
    const radius=5*spriteScale,light=ctx.createRadialGradient(p.x,p.y-5*spriteScale,0,p.x,p.y-5*spriteScale,radius);
    light.addColorStop(0,'#fff4a5');light.addColorStop(.38,'#e8ed8a88');light.addColorStop(1,'#c6d87300');
    ctx.fillStyle=light;ctx.fillRect(p.x-radius,p.y-5*spriteScale-radius,radius*2,radius*2);
    ctx.fillStyle='#fff4a5';ctx.fillRect(Math.round(p.x),Math.round(p.y-5*spriteScale),2*spriteScale,2*spriteScale);
    ctx.restore();
  }
}

function drawWalkTarget() {
  const target = walkPath.at(-1);
  if (!target) return;
  const p = point(target.x, target.y);
  const pulse = reducedMotion ? 0 : Math.sin(worldClock * 5) * 1.5;
  ctx.save();
  ctx.globalAlpha = .78;
  ctx.strokeStyle = CLAREIRA.signature.ember;
  ctx.lineWidth = Math.max(1, spriteScale * .45);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, TILE_X * .44 + pulse, TILE_Y * .42 + pulse * .45, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = CLAREIRA.palette.parchment;
  ctx.globalAlpha = .9;
  ctx.fillRect(Math.round(p.x - spriteScale), Math.round(p.y - spriteScale), spriteScale * 2, spriteScale * 2);
  ctx.restore();
}

function updateObjective() {
  const door = nearestInteractionDoor();
  const nearDoor = Boolean(door && door.distance <= 1.5);
  const nearReceptionService = Boolean(nearestReceptionService());
  const objectiveFires=[...fires.values()];
  const nearbyAnimal=nearestWildlifeTarget(localRenderPosition,5.5);
  const nearbySpecies=nearbyAnimal&&WILDLIFE_BY_ID.get(nearbyAnimal.speciesId);
  const shelterNames={burrow:'toca',cave:'caverna',thicket:'moita',den:'covil','tree-hollow':'oco de árvore','root-hollow':'raízes','high-nest':'ninho alto','canopy-nest':'copa','hedge-nest':'cerca viva','pond-edge':'beira d’água','warm-rock':'pedras quentes','open-meadow':'campo aberto','barn-edge':'abrigo do rebanho','rock-shelter':'abrigo de pedra','tall-grass':'capim alto'};
  const nearbyAnimalText=nearbyAnimal?`${nearbySpecies?.label||'Animal'} · ${nearbyAnimal.lifeStage} · ${nearbyAnimal.state.replaceAll('-',' ')}. ${(nearbySpecies?.lifeGoal||'explorar o bosque').split(',')[0]}. Abrigo: ${shelterNames[nearbySpecies?.shelter]||'vegetação'}. ${nearbyAnimal.awareness?`Notou você por ${nearbyAnimal.awareness}.`:'Agache com C para se aproximar em silêncio.'}`:'';
  const guide=nearestTutorialGuide();
  const text = worldDimensionId.startsWith('arrival-')&&arrivalTutorial?.phase==='welcome'
    ? guide ? 'O Deus do Fogo está aqui. Pressione E ou Usar para conversar.' : 'Caminhe até a borda da luz para encontrar o Deus do Fogo; você também pode seguir sem tutorial.'
    : nearReceptionService
    ? `${nearestReceptionService().label}. Pressione E ou toque em ${nearestReceptionService().prompt} para consultar.`
    : worldLocation === 'room' && roomBuildMode === 'place'
    ? 'Escolha um ponto livre no piso para colocar o móvel.'
    : worldLocation === 'room' && roomBuildMode === 'remove'
      ? 'Chegue perto do móvel e toque nele para retirar.'
      : nearDoor ? (worldLocation === 'room'
    ? worldRoomKind === 'lodging' && !isCabin(worldRoomBuildingId) ? 'A porta leva à recepção. Pressione E para sair.' : 'A porta leva de volta ao bosque. Pressione E para sair.'
    : door.private ? `${door.name}: porta trancada. Use E com sua chave para entrar; a placa fica do lado de fora.` : `A porta de ${door.name} está aqui. Pressione E para entrar.`)
    : worldLocation === 'room' && worldRoomKind === 'lobby' ? 'Explore o estabelecimento e vá ao balcão para ver os serviços. E perto da porta sai.'
      : worldLocation === 'room' ? 'Explore o quarto. E perto da porta muda de local.'
      : nearbyAnimal ? nearbyAnimalText
      : getObjectiveText(localPosition, [...resources.values()], localInventory, objectiveFires, roomStateAvailable);
  if(ui.objective.textContent !== text) ui.objective.textContent = text;
}

function draw(origin=0){
  if(!sceneReady)return;
  return renderAudit.run(drawScene,origin);
}
function drawScene() {
  if (!sceneReady) return;
  const sampleRender=performanceTelemetry.shouldSampleRenderFrame();
  let renderPhaseStartedAt=performance.now();
  const markRenderPhase=phase=>{
    const at=performance.now();renderAudit.mark(phase,at);performanceTelemetry.observeRenderPhase(phase,at-renderPhaseStartedAt,sampleRender);renderPhaseStartedAt=at;
  };
  syncArrivalCinematic();
  gameDay = getGameDayState(gameDayTimestampMs(), { theme: dimensionTheme, dimensionId: worldDimensionId });
  renderProfiler?.begin(performance.now());
  renderProfiler?.sample('simulation',lastSimulationMs);
  renderProfiler?.sample('terrainQueue',lastTerrainQueueWorkMs);
  FRAME_FIRES.length = 0;
  for (const fire of fires.values()) FRAME_FIRES.push(fire);
  const frameFires = FRAME_FIRES;
  FRAME_LIT_FIRES.length = 0;
  const fireSampleNow=performance.now();
  for(const fire of frameFires)if(campfireFuelRatio(fire,fireSampleNow)>0)FRAME_LIT_FIRES.push(fire);
  const litFires=FRAME_LIT_FIRES;
  const alpha = Math.max(0, Math.min(1, accumulator / STEP));
  const interpolatedLocal = {
    x: previousLocalPosition.x + (localPosition.x - previousLocalPosition.x) * alpha,
    y: previousLocalPosition.y + (localPosition.y - previousLocalPosition.y) * alpha,
  };
  const correctedRender = {
    x: interpolatedLocal.x + localRenderCorrection.x,
    y: interpolatedLocal.y + localRenderCorrection.y,
  };
  if (!outsideShelterClearance(correctedRender)) localRenderCorrection = { x: 0, y: 0 };
  localRenderPosition = {
    x: localRenderCorrection.x ? correctedRender.x : interpolatedLocal.x,
    y: localRenderCorrection.y ? correctedRender.y : interpolatedLocal.y,
    z:(previousLocalPosition.z||0)+((localPosition.z||0)-(previousLocalPosition.z||0))*alpha,
    ...(Number.isFinite(localPosition.flightZ)?{flightZ:(Number.isFinite(previousLocalPosition.flightZ)?previousLocalPosition.flightZ:localPosition.flightZ)+(localPosition.flightZ-(Number.isFinite(previousLocalPosition.flightZ)?previousLocalPosition.flightZ:localPosition.flightZ))*alpha}:{}),
    running:localPosition.running,crouching:localPosition.crouching,
    burningRemainingMs:localPosition.burningRemainingMs,
  };
  syncCampfireAudio(arrivalCinematicAge()<1650?[]:litFires);
  const currentFootsteps = pendingFootstepFrameState;
  pendingFootstepFrameState = { grassVolume: 0, grassRunning: false, pathVolume: 0, pathRunning: false };
  syncFootstepLoop('grass', currentFootsteps.grassVolume, currentFootsteps.grassRunning);
  syncFootstepLoop('path', currentFootsteps.pathVolume, currentFootsteps.pathRunning);
  syncAmbientEvents();
  const cameraNow=performance.now(),cameraDelta=lastCameraFrame?(cameraNow-lastCameraFrame)/1000:1/60;lastCameraFrame=cameraNow;
  if(worldLocation==='room')camera=followCamera(camera,roomView(currentRoomLayout(),viewWidth,viewHeight,localRenderPosition).camera,reducedMotion,cameraDelta);
  else {
    const arrivalFire=worldLocation==='clearing'&&worldDimensionId.startsWith('arrival-')
      ?dimensionList.find(dimension=>dimension.id===worldDimensionId)?.campfire:null;
    const cameraTarget=arrivalCinematicStartedAt&&arrivalFire
      ?arrivalCameraTarget(arrivalFire,localRenderPosition,arrivalCinematicAge(),reducedMotion)
      :localRenderPosition;
    camera=followCamera(camera,cameraTarget,reducedMotion,cameraDelta);
  }
  if(worldLocation==='clearing'){
    const visible=visibleTerrainChunks();
    const hardLimit=sceneArt.stats().terrainChunkHardLimit||160;
    if(visible.length>hardLimit){
      if(!terrainCapacityErrorShown){showLoadingFailure("A janela excede o limite de terreno. Reduza o tamanho da janela e tente novamente.");terrainCapacityErrorShown=true;}
      renderProfiler?.finish(performance.now());
      return;
    }
    if(terrainCapacityErrorShown){loadingScreen.hidden=true;ui.shell.inert=false;ui.shell.setAttribute("aria-busy","false");terrainCapacityErrorShown=false;}
    const speed=Math.hypot(localPosition.vx||0,localPosition.vy||0);
    const lookaheadTiles=Math.min(16,Math.max(0,speed*1.5));
    const lookaheadTarget=speed>.05?{
      x:camera.x+(localPosition.vx||0)/speed*lookaheadTiles,
      y:camera.y+(localPosition.vy||0)/speed*lookaheadTiles,
    }:camera;
    const ahead=speed>.05?visibleTerrainChunks(lookaheadTarget):[];
    const zoomChunks=pendingZoomTerrainChunks();
    const protectedChunks=[],seen=new Set();
    for(const chunk of [...visible,...zoomChunks,...ahead]){
      const key=chunk.cx+':'+chunk.cy;
      if(seen.has(key))continue;
      seen.add(key);protectedChunks.push(chunk);
      if(protectedChunks.length>=160)break;
    }
    sceneArt.prioritizeTerrainChunks(zoomChunks.length?protectedChunks:visible,ahead);
    sceneArt.requestTerrainChunks(protectedChunks);
    if(speed>.05)queueWorldChunkWarmupAhead(lookaheadTarget,localPosition.vx||0,localPosition.vy||0);
    const visibleTerrainReady=sceneArt.terrainChunksReady(visible);
    const terrainStateAt=performance.now();
    performanceTelemetry.observeTerrain(lastTerrainQueueWorkMs,sceneArt.stats().pendingTerrainChunks,!visibleTerrainReady);
    if(!visibleTerrainReady){
      if(!terrainIncompleteVisibleSince)terrainIncompleteVisibleSince=terrainStateAt;
      terrainIncompleteVisibleFrames++;
    }else if(terrainIncompleteVisibleSince){
      const pendingFor=terrainStateAt-terrainIncompleteVisibleSince;
      terrainIncompleteVisibleTotalMs+=pendingFor;
      terrainIncompleteVisibleMaxMs=Math.max(terrainIncompleteVisibleMaxMs,pendingFor);
      terrainIncompleteVisibleSince=0;
    }
    updateVisibleWorldChunks();
    updateSolidTreeLighting(litFires);
  }else performanceTelemetry.observeTerrain(lastTerrainQueueWorkMs,sceneArt.stats().pendingTerrainChunks,false);
  const selfScreen=point(localRenderPosition.x,localRenderPosition.y);
  const shake=arrivalCameraShake();
  if(shake){ctx.save();ctx.translate(shake.x,shake.y);}
  markRenderPhase('setup');
  drawBackground();
  markRenderPhase('background');
  renderProfiler?.mark('background', performance.now());
  groundShadows.begin(viewWidth,viewHeight);
  drawWorldShadows(frameFires,litFires);
  renderProfiler?.mark('shadows', performance.now());
  markRenderPhase('shadows');
  const pickupFrame = getPickupFeedbackFrame(pickupFeedback, performance.now(), reducedMotion);
  if (pickupFeedback && !pickupFrame) pickupFeedback = null;
  const collisionFrame = getCollisionFeedbackFrame(collisionFeedback, performance.now(), reducedMotion);
  if (collisionFeedback && !collisionFrame) collisionFeedback = null;
  const self = getLocalAvatarView(
    livePlayers.get(selfId) || { id: 'self', name: ui.name.value, color: 0 },
    { ...localRenderPosition, moving: localMoving, facing: localFacing,
      vx: localPosition.vx || (localMoving ? lastMotion.x / STEP : 0),
      vy: localPosition.vy || (localMoving ? lastMotion.y / STEP : 0) },
  );
  FRAME_RESOURCES.length = 0;
  for (const resource of resources.values())
    if(waterBankDepthAt(resource.x,resource.y,WORLD_WATER_OPTIONS,.18)<=0)FRAME_RESOURCES.push(resource);
  const things = RENDER_THINGS;
  things.length = 0;
  if(worldLocation==='clearing')for(const face of visibleNaturalTerrainFaces)things.push({type:'terrain-face',x:face.x,y:face.y,
    sortX:face.x,sortY:face.y,sortZ:0,sortId:`terrain:${worldDimensionId}:${face.id}`,face});
  if(worldLocation==='clearing')for(const thing of visibleClearingStaticThings)things.push(thing);
  const tutorialGuide=currentTutorialGuide();
    if(worldLocation==='clearing'&&tutorialGuide&&!worldDimensionId.startsWith('arrival-'))things.push({type:'tutorial-guide',x:tutorialGuide.x,y:tutorialGuide.y,guide:tutorialGuide});
  for(const resource of FRAME_RESOURCES)things.push({type:'resource',x:resource.x,y:resource.y,resource});
  for(const fire of frameFires)things.push({type:'fire',x:fire.x,y:fire.y,fire});
  if(worldLocation==='clearing'){
    const shelters=new Map();
    for(const animal of wildlife.values())if(animal.shelter?.id){
      const shelter=shelters.get(animal.shelter.id)||{...animal.shelter,sleeping:false};
      shelter.sleeping ||= animal.state==='dormindo';shelters.set(animal.shelter.id,shelter);
    }
    for(const shelter of shelters.values()){
      if(!canObserveWildlifeShelter(shelter,localRenderPosition))continue;
      const nest=['canopy-nest','high-nest','hedge-nest'].includes(shelter.kind),anchor=shelter.cover;
      things.push({type:'wildlife-shelter',x:nest?anchor.x:shelter.x,y:nest?anchor.y:shelter.y,
        sortX:anchor.x+(nest?.01:-.01),sortY:anchor.y+(nest?.01:-.01),shelter});
    }
  }
  if(worldLocation==='clearing')for(const animal of wildlife.values()){
    const position=renderedWildlifePosition(animal)||animal;
    things.push({type:'animal',x:position.x,y:position.y,animal:{...animal,...position}});
  }
  if(worldLocation==='clearing')for(const npc of villageActors.values()){
    const thing={type:'village-npc',x:npc.x,y:npc.y,player:npc};
    anchorBuildingActor(thing);
    things.push(thing);
  }
  if(worldLocation==='room'){
    for(const wall of currentRoomLayout().partitions||[]){
      // Short pieces sort against nearby actors rather than using one distant corner.
      const vertical=wall.bottom-wall.top>wall.right-wall.left;
      const start=vertical?wall.top:wall.left,end=vertical?wall.bottom:wall.right;
      for(let a=start;a<end-.001;a+=.5){
        const b=Math.min(end,a+.5),item=vertical?{...wall,top:a,bottom:b}:{...wall,left:a,right:b};
        things.push({type:'room-partition',x:(item.left+item.right)/2,y:(item.top+item.bottom)/2,
          ...buildingStaticDepthAnchor(item),sortId:`${wall.id}:${a}`,item});
      }
    }
    for(const item of currentRoomLayout().fixtures||[])things.push({type:'room-fixture',x:item.x,y:item.y,
      ...buildingStaticDepthAnchor(fixtureBounds(item)),sortZ:item.baseZ||0,sortId:item.id||item.kind,item});
    const counter=currentRoomLayout().counter;
    if(counter)things.push({type:'room-counter',x:(counter.left+counter.right)/2,y:(counter.top+counter.bottom)/2,
      ...buildingStaticDepthAnchor(counter),sortZ:counter.baseZ||0,sortId:'room-counter'});
    for(const item of roomFurniture.values()){
      const pose=roomFurniturePose(item).item;
      const layers=roomFurnitureDrawLayers(pose);
      if(layers)for(const layer of layers)things.push({type:'furniture-layer',x:pose.x,y:pose.y,
        ...roomFurnitureDepthAnchor(pose),...layer,item});
      else things.push({type:'furniture',x:pose.x,y:pose.y,...roomFurnitureDepthAnchor(pose),item});
      if(item.kind==='bed'&&[...livePlayers.values()].some(player=>player.furnitureUse?.id===item.id&&player.furnitureUse.action==='lie')){
        const cover={...pose,kind:'bed-cover'};
        things.push({type:'furniture-cover',x:pose.x,y:pose.y,...roomFurnitureDepthAnchor(pose),sortZ:(pose.baseZ||0)+.002,sortId:`${item.id}:cover`,item:cover});
      }
    }
  }
  function anchorBuildingActor(actor){
    const boundsList=worldLocation==='room'
      ? [...currentRoomLayout().obstacles,...(currentRoomLayout().counter?[currentRoomLayout().counter]:[])]
      : worldLocation==='clearing'&&worldDimensionId==='surface'
        ? [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]
        : [];
    for(const entry of boundsList){
      const anchor=worldLocation==='room'?buildingAvatarDepthAnchor(actor,entry,.35):buildingExteriorAvatarDepthAnchor(actor,entry);
      if(anchor&&anchor.sortX+anchor.sortY>(actor.sortX??actor.x)+(actor.sortY??actor.y))Object.assign(actor,anchor);
    }
  }
  const interpolationNow=performance.now();
  for(const player of livePlayers.values()){
    if(player.id===selfId)continue;
    const playback=advanceRemotePlayback(remotePlayback.get(player.id),interpolationNow);
    const position=interpolatePosition(remotePositions.get(player.id),playback.time,playback.maxExtrapolationMs)||player;
    const renderedPlayer={...player,...position,facing:remoteFacings.get(player.id)||'south'};
    const thing={type:'player',x:renderedPlayer.x,y:renderedPlayer.y,player:renderedPlayer};
    anchorBuildingActor(thing);
    if(worldLocation==='room'&&renderedPlayer.furnitureUse?.action==='lie'){
      const bed=roomFurniture.get(renderedPlayer.furnitureUse.id);
      if(bed)Object.assign(thing,roomFurnitureBedOccupantDepth(bed));
    }
    things.push(thing);
  }
  const selfThing={type:'self',x:localRenderPosition.x,y:localRenderPosition.y,player:self};
  anchorBuildingActor(selfThing);
  if(worldLocation==='room'&&self?.furnitureUse?.action==='lie'){
    const bed=roomFurniture.get(self.furnitureUse.id);
    if(bed)Object.assign(selfThing,roomFurnitureBedOccupantDepth(bed));
  }
  things.push(selfThing);
  if(worldLocation==='room'&&['place','move'].includes(roomBuildMode)&&roomPlacementPreview){
    const furniture=[...roomFurniture.values()].filter(item=>item.id!==roomMovingId),otherPlayers=[...livePlayers.values()];
    const valid=(roomBuildMode==='move'||roomPlacedCount()<ROOM_FURNITURE_LIMIT)&&canPlaceRoomFurniture(roomPlacementPreview,furniture,otherPlayers,currentRoomLayout());
    things.push({type:'furniture-preview',x:roomPlacementPreview.x,y:roomPlacementPreview.y,
      ...roomFurnitureDepthAnchor(roomPlacementPreview),item:roomPlacementPreview,
      valid});
  }
  let visibleCount=0;
  for(let index=0;index<things.length;index++){
    const thing=things[index];
    if(worldLocation==='clearing'&&!insideBoundaryWall({x:thing.x,y:thing.y}))continue;
    if(thing.type==='self'){things[visibleCount++]=thing;continue;}
    const p=thing.screen||point(thing.x,thing.y);
    const building=thing.type==='home'?RECEPTION_BUILDING:
      ['lodging','building-post','building-canopy'].includes(thing.type)?thing.building:null;
    const span=building?(building.bounds.right-building.bounds.left+building.bounds.bottom-building.bounds.top):0;
    const padding=building?Math.max(250,span*TILE_X*.6,(building.height+building.roofRise)*HEIGHT_PIXELS*spriteScale+span*TILE_Y*.6):250;
    let left=padding,right=padding,top=padding,bottom=padding;
    // Conservative visual footprints, including sway/interaction margins.
    // The old fixed 250px margin ran full character/prop work far off screen.
    if(!building){
      if(thing.type==='foliage'){left=right=24*spriteScale+8;top=36*spriteScale+8;bottom=12*spriteScale+8;}
      else if(thing.type==='resource'){left=right=36*spriteScale+8;top=44*spriteScale+8;bottom=28*spriteScale+8;}
      else if(thing.type==='tree'){left=right=110;top=150;bottom=10;}
      else if(['player','village-npc'].includes(thing.type)){
        left=right=Math.max(120,80*spriteScale);top=160*spriteScale+Math.max(0,thing.player?.z||0)*HEIGHT_PIXELS*spriteScale;bottom=64*spriteScale;
      }
    }
    if(p.x>-right&&p.x<viewWidth+left&&p.y>-bottom&&p.y<viewHeight+top)things[visibleCount++]=thing;
  }
  things.length=visibleCount;
  lastVisibleThingCount=visibleCount;
  if(renderProfiler){
    lastRenderEntityCounts={};
    for(const thing of things)lastRenderEntityCounts[thing.type]=(lastRenderEntityCounts[thing.type]||0)+1;
  }
  things.sort(compareSceneDepth);
  for(const thing of things){
    const actor=thing.type==='player'||thing.type==='village-npc'?thing.player:thing.type==='self'?self:null;
    if(actor&&!teleportEffects.shouldHide(actor.id,worldDimensionId,clientServerTime()))drawAvatarGroundShadow(actor,thing.type==='self');
  }
  // Diffuse light belongs to the ground. Drawing it after actors replaces their
  // material contrast with luminous haze, even when their alpha is unchanged.
  if(worldLocation==='clearing'&&gameDay.night>0){
    ctx.save();ctx.globalCompositeOperation='screen';paintSceneLightmaps(ctx,.07*gameDay.night);ctx.restore();
    paintFirelightColor(worldClock,gameDay.night);
  }
  // Composite ground shadows after diffuse ground light so windows and fires
  // cannot wash their silhouettes away. Buildings and characters still draw
  // in normal depth order above the shared shadow layer.
  groundShadows.composite(ctx);
  if(worldLocation==='clearing')drawWorldBoundary(ctx,{bounds:getVisibleWorldBounds(),project:(x,y)=>point(x,y,camera,0),
    time:worldClock,reducedMotion,height:viewHeight,scale:spriteScale,theme:dimensionTheme});
  const vegetationSources=VEGETATION_SOURCES;
  vegetationSources.length=0;
  if(worldLocation==='clearing'){
    const maxVegetationSources=decorativeDetailLevel===0?4:decorativeDetailLevel===1?8:16;
    if(localMoving)vegetationSources.push(selfThing.player);
    for(const thing of things){
      if(vegetationSources.length>=maxVegetationSources)break;
      if(thing.type!=='player'||(thing.player.location||worldLocation)!=='clearing'
          ||(thing.player.dimensionId&&thing.player.dimensionId!==worldDimensionId))continue;
      const player=thing.player;
      if((player.moving===true||Math.hypot(player.vx||0,player.vy||0)>.12)
          &&Number.isFinite(player.x)&&Number.isFinite(player.y))vegetationSources.push(player);
    }
  }
  const nearbyNameplateThings=NEARBY_NAMEPLATE_THINGS;
  nearbyNameplateThings.length=0;
  for(const thing of things)if((thing.type==='player'||thing.type==='village-npc')
      &&Math.hypot(thing.x-localRenderPosition.x,thing.y-localRenderPosition.y)<=NAMEPLATE_VISIBILITY_RADIUS){
    nearbyNameplateThings.push(thing);
  }
  if(nearbyNameplateThings.length)nearbyNameplateThings.push(selfThing);
  const visibleNameplateIds=VISIBLE_NAMEPLATE_IDS;
  visibleNameplateIds.clear();
  for(const thing of nearbyNameplateThings)visibleNameplateIds.add(thing.player.id);
  const reachableResources = FRAME_RESOURCES.filter(resource =>
    Math.hypot(localPosition.x - resource.x, localPosition.y - resource.y) <= 1.2
      && hasClearInteractionPath(localPosition, resource, { fires: FRAME_FIRES }));
  const nearest = nearestCollectible(localPosition, reachableResources, localInventory, 1.2, FRAME_FIRES, performance.now());
  const nearestAnimal=nearestWildlifeTarget(localRenderPosition,4.5);
  const reachablePlayers = [...livePlayers.values()].filter(player => player.id !== selfId
    && Math.hypot(localPosition.x - player.x, localPosition.y - player.y) <= 1.8
    && hasClearInteractionPath(localPosition, player, { targetRadius: PLAYER_RADIUS, ignoreFires: true }));
  const shareTarget = selfId && socket?.readyState === WebSocket.OPEN && localInventory.berries > 0
    ? getNearestShareTarget(localPosition, reachablePlayers, selfId)
    : null;
  const terrainStreaming=isTerrainPixelationActive();
  markRenderPhase('entityPreparation');
  teleportEffects.drawUnder(ctx,worldDimensionId,clientServerTime(),(x,y)=>point(x,y,camera,0),spriteScale);
  for (const thing of things) {
    if(thing.type==='terrain-face')drawNaturalTerrainFace(thing.face);
    if (thing.type === 'home') drawClearingHome();
    if (thing.type === 'lodging') drawVillageBuilding(thing.building);
    if (thing.type === 'building-post') drawBuildingPost(ctx,thing.building,thing.post,
      (x,y,z)=>point(x,y,camera,z),drawPixelPolygon);
    if (thing.type === 'building-canopy') drawCachedBuildingCanopy(thing.building);
    if(thing.type==='foliage'){
      if(decorativeDetailLevel===0&&(thing.index&1))continue;
      const p=point(thing.x,thing.y),nearSelf=worldLocation==='clearing'&&Math.abs(selfScreen.x-p.x)<24*spriteScale&&selfScreen.y<p.y&&selfScreen.y>p.y-28*spriteScale;
      const interaction=sceneArt.proximityMotion(`foliage:${worldDimensionId}:${thing.index}`,thing.x,thing.y,worldClock,vegetationSources,1.3,6,reducedMotion);
      const simplified=terrainStreaming&&(thing.x-localRenderPosition.x)**2+(thing.y-localRenderPosition.y)**2>36;
      sceneArt.foliage(ctx,p,thing.style,thing.variant,thing.index,spriteScale*.9,worldClock,dimensionTheme,thing.x,thing.y,reducedMotion,nearSelf,interaction,decorativeDetailLevel,simplified);
    }
    if(thing.type==='fallen')drawFallenTree(thing.tree,thing.section);
    if(thing.type==='tree-growth')drawTreeGrowth(thing.tree);
    if (thing.type === 'tree') {
      // Reduce canopy animation at low detail, never the world's tree population.
      const interaction=sceneArt.proximityMotion(`tree:${worldDimensionId}:${thing.index}:${thing.x}:${thing.y}`,thing.x,thing.y,worldClock,vegetationSources,2.4,8.5,reducedMotion);
      const simplified=terrainStreaming&&(thing.x-localRenderPosition.x)**2+(thing.y-localRenderPosition.y)**2>36;
      const arrivalHearth=thing.arrivalRing&&dimensionList.find(item=>item.id===worldDimensionId)?.campfire;
      const firelitArrivalTree=Boolean(arrivalHearth&&Math.hypot(thing.x-arrivalHearth.x,thing.y-arrivalHearth.y)<39);
      drawTree(thing.tree, thing.index, thing.screen, selfScreen, interaction,simplified,
        SOLID_TREE_LIGHTING.get(thing.tree)?.warm===true||firelitArrivalTree);
    }
    if (thing.type === 'world-rock') drawWorldRock(thing.rock);
    if (thing.type === 'resource') drawResource(thing.resource, nearest?.id === thing.resource.id, worldClock);
    if (thing.type === 'wildlife-shelter') drawWildlifeShelter(thing.shelter,worldClock);
    if (thing.type === 'animal') drawWildlife(thing.animal,worldClock,nearestAnimal?.id===thing.animal.id);
    if (thing.type === 'tutorial-guide') drawTutorialGuide(thing.guide,worldClock);
    if (thing.type === 'fire') {
      drawFire(thing.fire, worldClock, getCampfireGatheringCount(thing.fire, livePlayers.values()));
    }
    if (thing.type === 'room-partition') drawInteriorPartition(thing.item);
    if (thing.type === 'room-counter') drawRoomCounter();
    if (thing.type === 'room-fixture') drawRoomFixture(thing.item);
    if (thing.type === 'furniture') drawRoomFurniture(thing.item);
    if (thing.type === 'furniture-layer') drawRoomFurnitureLayer(thing.item,thing.part);
    if (thing.type === 'furniture-cover') drawRoomFixture(thing.item);
    if (thing.type === 'furniture-preview') drawRoomFurniture(thing.item, true, thing.valid);
    if (thing.type === 'player'&&!teleportEffects.shouldHide(thing.player.id,worldDimensionId,clientServerTime())) drawAvatar(thing.player, worldClock, false, thing.player.id === shareTarget?.id, null, visibleNameplateIds);
    if (thing.type === 'village-npc') drawAvatar(thing.player, worldClock, false, false, null, visibleNameplateIds);
    if (thing.type === 'self'&&!teleportEffects.shouldHide(thing.player.id,worldDimensionId,clientServerTime())
      &&arrivalAvatarVisible(arrivalCinematicAge())) {
      const age=performance.now()-arrivalCinematicStartedAt-850,fire=dimensionList.find(item=>item.id===worldDimensionId)?.campfire;
      const recoil=fire&&age>0&&age<330?(1-age/330)*.34:0;
      const dx=fire?thing.player.x-fire.x:0,dy=fire?thing.player.y-fire.y:0,length=Math.hypot(dx,dy)||1;
      const visualPlayer=recoil?{...thing.player,x:thing.player.x+dx/length*recoil,y:thing.player.y+dy/length*recoil}:thing.player;
      drawAvatar(visualPlayer, worldClock, true, false, pickupFrame, visibleNameplateIds);
    }
  }
  renderProfiler?.mark('entities', performance.now());
  markRenderPhase('entities');
  drawWaterSplashes();
  for(let i=footDust.length-1;i>=0;i--){const dust=footDust[i],age=worldClock-dust.born;if(age>.35||age<0){footDust.splice(i,1);continue;}const p=point(dust.x,dust.y);ctx.globalAlpha=(1-age/.35)*.45;ctx.fillStyle=dust.room?'#d2ac7a':'#94a680';ctx.fillRect(Math.round(p.x-4-age*7),Math.round(p.y-age*8),2,2);ctx.fillRect(Math.round(p.x+4+age*7),Math.round(p.y-age*5),2,1);ctx.globalAlpha=1;}
function paintDirectionalSunTint(colors,intensity){
  const sourceX=(gameDay.sunPosition?.x??.5)*viewWidth;
  const sourceY=(gameDay.sunPosition?.y??.1)*viewHeight;
  const radius=Math.max(Math.hypot(sourceX,sourceY),Math.hypot(viewWidth-sourceX,sourceY),
    Math.hypot(sourceX,viewHeight-sourceY),Math.hypot(viewWidth-sourceX,viewHeight-sourceY));
  const gradient=ctx.createRadialGradient(sourceX,sourceY,0,sourceX,sourceY,radius);
  const rgba=(color,alpha)=>`rgba(${color.join(',')},${alpha})`;
  gradient.addColorStop(0,rgba(colors[0],intensity));
  gradient.addColorStop(.42,rgba(colors[1],intensity*.56));
  gradient.addColorStop(1,rgba(colors[2],0));
  ctx.fillStyle=gradient;ctx.fillRect(0,0,viewWidth,viewHeight);
}

function drawDaylightAtmosphere() {
  if (worldLocation !== 'clearing' || dimensionTheme === 'dark') return;
  const daylight = gameDay.daylight;
  if (daylight <= .01) return;
  const hours = gameDay.hours;
  const sunElevation = gameDay.sunElevation || 0;
  const ease=value=>{
    const t=Math.max(0,Math.min(1,value));
    return t*t*(3-2*t);
  };

  ctx.save();
  if (hours >= 4.5 && hours < 9.5) {
    const dawnProgress = hours < 7 ? ease((hours-4.5)/2.5) : 1-ease((hours-7)/2.5);
    const intensity = dawnProgress * .68*(.55+.45*(1-sunElevation));
    if (intensity > .005) {
      ctx.globalCompositeOperation = 'soft-light';
      paintDirectionalSunTint([[255,137,66],[255,184,104],[255,226,177]],intensity);
    }
  } else if (hours >= 16.5 && hours < 20.5) {
    const duskProgress = hours < 18 ? ease((hours-16.5)/1.5) : 1-ease((hours-18)/2.5);
    const intensity = duskProgress * .72*(.55+.45*(1-sunElevation));
    if (intensity > .005) {
      ctx.globalCompositeOperation = 'soft-light';
      paintDirectionalSunTint([[235,78,48],[255,137,69],[255,195,128]],intensity);
    }
  } else if (daylight > .4) {
    const intensity = (gameDay.sunlightStrength||daylight) * .16;
    if (intensity > .002) {
      ctx.globalCompositeOperation = 'soft-light';
      paintDirectionalSunTint([[255,246,218],[255,250,233],[245,249,232]],intensity);
    }
  }
  ctx.restore();
}

  drawWalkTarget();
  drawPickupResponse(pickupFrame);
  drawCollisionResponse(collisionFrame);
  drawBerryOfferResponses();
  drawNight();
  drawDaylightAtmosphere();
  teleportEffects.drawOver(ctx,worldDimensionId,clientServerTime(),(x,y)=>point(x,y,camera,0),spriteScale);
  drawWaterReflections();
  drawCampfireAfterglow(worldClock);
  if(shake)ctx.restore();
  drawArrivalSprig(worldClock);
  updateArrivalTutorialPanel();
  drawArrivalTutorialGuide();
  renderProfiler?.mark('effectsAndNight', performance.now());
  if(worldLocation==='clearing') drawFireflies(worldClock);
  drawArrivalCinematicOverlay();
  updateObjective();
  markRenderPhase('effects');
  renderProfiler?.finish(performance.now());
  return true;
}

function createAudioBuffer(context,samples){
  const buffer=context.createBuffer(1,samples.length,context.sampleRate);
  buffer.copyToChannel(samples,0);
  return buffer;
}

function synthesizeAmbientBuffers(context,state){
  if(typeof Worker!=='function')return;
  let worker;
  try{worker=new Worker(new URL('./audio-synthesis-worker.mjs',import.meta.url),{type:'module'});}
  catch(error){console.warn('Não foi possível preparar o áudio ambiente.',error);return;}
  worker.addEventListener('message',({data})=>{
    if(audioContext!==context){worker.terminate();return;}
    state.ambientNoiseBuffer=createAudioBuffer(context,data.ambient);
    state.birdChirpsBuffer=createAudioBuffer(context,data.birds);
    state.pianoNoteBuffer=createAudioBuffer(context,data.piano);
    worker.terminate();
  },{once:true});
  worker.addEventListener('error',error=>{
    console.warn('Não foi possível preparar o áudio ambiente.',error.message);
    worker.terminate();
  },{once:true});
  worker.postMessage({sampleRate:context.sampleRate});
}

function createAmbience() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) { announce('Este navegador não tem suporte a áudio.'); return null; }
  audioContext = new AudioContextClass();
  const campfireBus = audioContext.createGain(); campfireBus.gain.value = CAMPFIRE_AUDIO_ENABLED ? CAMPFIRE_AUDIO_BUS_GAIN : .0001;
  const ambientBus = audioContext.createGain(); ambientBus.gain.value = AMBIENT_AUDIO_ENABLED ? 1.15 : .0001;
  const teleportBus = audioContext.createGain(); teleportBus.gain.value = ui.sound.getAttribute('aria-pressed') === 'true' ? .55 : .0001;
  const campfireCompressor = audioContext.createDynamicsCompressor();
  campfireCompressor.threshold.value = -16;
  campfireCompressor.knee.value = 12;
  campfireCompressor.ratio.value = 2.5;
  campfireCompressor.attack.value = .012;
  campfireCompressor.release.value = .28;
  campfireBus.connect(campfireCompressor); ambientBus.connect(campfireCompressor); teleportBus.connect(campfireCompressor);
  campfireCompressor.connect(audioContext.destination);
  const campfireSources = new Map();
  const state = { campfireBus, ambientBus, teleportBus, campfireCompressor,
    campfireBuffer: null, arrivalThunderBuffer:null, campfireEpoch: audioContext.currentTime,
    ambientNoiseBuffer: null, birdChirpsBuffer: null, pianoNoteBuffer: null, campfireSources,
    ambientEvents: new Set(), ambientRegion: null, ambientNextAt: null,
    lastCampfireSyncAt: -Infinity, lastAmbientSyncAt: -Infinity };
  teleportEffects.setAudio(audioContext,teleportBus);
  if(arrivalThunderData){
    void audioContext.decodeAudioData(arrivalThunderData.slice(0)).then(buffer=>{
      state.arrivalThunderBuffer=buffer;if(arrivalThunderPending)playArrivalThunder();
    }).catch(error=>console.warn('Não foi possível preparar o estrondo do Breu.',error));
  }
  if (CAMPFIRE_AUDIO_ENABLED) {
    const assetUrl = new URL('./art/audio/campfire-soft-loop.mp3', import.meta.url);
    void fetch(assetUrl).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(data => audioContext.decodeAudioData(data)).then(buffer => {
      state.campfireBuffer = buffer;
    }).catch(error => console.warn('Não foi possível carregar o som da fogueira.', error));
  }
  setCampfireListener(audioContext.listener, { x: 0, y: 0, z: 0 }, audioContext.currentTime, true);
  return state;
}

function setSpatialParam(parameter, value, now = audioContext?.currentTime || 0, smoothing = .12) {
  if (!parameter) return;
  if (typeof parameter.setTargetAtTime === 'function') parameter.setTargetAtTime(value, now, smoothing);
  else parameter.value = value;
}

function setCampfireListener(listener, position, now, orientation = false) {
  if (listener.positionX && listener.positionY && listener.positionZ) {
    setSpatialParam(listener.positionX, position.x, now);
    setSpatialParam(listener.positionY, position.y, now);
    setSpatialParam(listener.positionZ, position.z, now);
  } else if (typeof listener.setPosition === 'function') {
    listener.setPosition(position.x, position.y, position.z);
  }
  if (!orientation) return;
  if (listener.forwardX && listener.forwardY && listener.forwardZ
      && listener.upX && listener.upY && listener.upZ) {
    setSpatialParam(listener.forwardX, 0, now);
    setSpatialParam(listener.forwardY, 0, now);
    setSpatialParam(listener.forwardZ, -1, now);
    setSpatialParam(listener.upX, 0, now);
    setSpatialParam(listener.upY, 1, now);
    setSpatialParam(listener.upZ, 0, now);
  } else if (typeof listener.setOrientation === 'function') {
    listener.setOrientation(0, 0, -1, 0, 1, 0);
  }
}

function setAudioNodePosition(node, position, now) {
  if (node.positionX && node.positionY && node.positionZ) {
    setSpatialParam(node.positionX, position.x, now);
    setSpatialParam(node.positionY, position.y, now);
    setSpatialParam(node.positionZ, position.z, now);
  } else if (typeof node.setPosition === 'function') {
    node.setPosition(position.x, position.y, position.z);
  }
}

function createCampfireAudioSource(fire, key) {
  if (!ambience?.campfireBuffer || !audioContext) return null;
  const source = audioContext.createBufferSource();
  source.buffer = ambience.campfireBuffer;
  source.loop = true;
  source.playbackRate.value = 1;
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = .45;
  const presence = audioContext.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2_200;
  presence.Q.value = .85;
  presence.gain.value = 2.5;
  const gain = audioContext.createGain();
  gain.gain.value = .0001;
  const panner = audioContext.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.rolloffFactor = .72;
  panner.maxDistance = CAMPFIRE_AUDIO_KEEPALIVE_RADIUS;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  panner.coneOuterGain = 1;
  source.connect(filter); filter.connect(presence); presence.connect(gain); gain.connect(panner); panner.connect(ambience.campfireBus);
  const duration=ambience.campfireBuffer.duration;
  const phaseSeed=Math.sin(fire.x*127.1+fire.y*311.7)*43758.5453;
  const phaseOffset=(phaseSeed-Math.floor(phaseSeed))*duration;
  const elapsed=Math.max(0,audioContext.currentTime-ambience.campfireEpoch);
  const phase=(elapsed+phaseOffset)%duration;
  source.start(0,phase);
  const entry = { key, x: fire.x, y: fire.y, source, filter, presence, gain, panner, stopping: false,
    targetGain: .0001, playbackRate: 1, filterFrequency: 0, occlusion: null, occlusionDb: 0, occluders: [],
    lastOcclusionAt: -Infinity, lastListenerPosition: null, distance: 0, phaseOffset };
  ambience.campfireSources.set(key, entry);
  return entry;
}

function retireCampfireAudioSource(entry, now) {
  if (!entry || entry.stopping) return;
  entry.stopping = true;
  if (ambience?.campfireSources.get(entry.key) === entry) ambience.campfireSources.delete(entry.key);
  entry.gain.gain.cancelScheduledValues(now);
  entry.gain.gain.setTargetAtTime(.0001, now, .09);
  entry.source.onended = () => {
    entry.source.disconnect(); entry.filter.disconnect(); entry.presence.disconnect(); entry.gain.disconnect(); entry.panner.disconnect();
  };
  entry.source.stop(now + .55);
}

function syncCampfireAudio(frameFires) {
  if (!CAMPFIRE_AUDIO_ENABLED || !ambience || audioContext?.state !== 'running' || !ambience.campfireBuffer) return;
  const now = audioContext.currentTime;
  if (now - ambience.lastCampfireSyncAt < .09) return;
  ambience.lastCampfireSyncAt = now;

  const available = worldLocation === 'clearing' ? frameFires : [];
  const listenerSurface = surfaceHeight(localRenderPosition.x, localRenderPosition.y, 'clearing');
  const listenerPosition = worldToAudioPosition(localRenderPosition.x, localRenderPosition.y,
    listenerSurface * .75 + 1.4 + (localRenderPosition.z || 0) * .75);
  setCampfireListener(audioContext.listener, listenerPosition, now);

  const audioSampleNow = performance.now();
  const desired = available.map(fire => {
    const surface = surfaceHeight(fire.x, fire.y, 'clearing');
    const flameStrength = campfireFlameStrength(fire, audioSampleNow);
    // The audible source follows the flame down toward the embers as the fire burns out.
    const position = worldToAudioPosition(fire.x, fire.y, surface * .75 + .08 + .34 * flameStrength);
    const distance = Math.hypot(position.x - listenerPosition.x, position.y - listenerPosition.y,
      position.z - listenerPosition.z);
    return { fire, position, distance, flameStrength, key: `${fire.x},${fire.y}` };
  }).filter(item => item.distance <= CAMPFIRE_AUDIO_KEEPALIVE_RADIUS)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, CAMPFIRE_AUDIO_MAX_SOURCES);
  const wanted = new Set(desired.map(item => item.key));
  for (const entry of ambience.campfireSources.values()) {
    if (!wanted.has(entry.key)) retireCampfireAudioSource(entry, now);
  }
  for (const item of desired) {
    const entry = ambience.campfireSources.get(item.key) || createCampfireAudioSource(item.fire, item.key);
    if (!entry || entry.stopping) continue;
    entry.x = item.fire.x; entry.y = item.fire.y;
    setAudioNodePosition(entry.panner, item.position, now);
    const listenerMoved = !entry.lastListenerPosition
      || Math.hypot(localRenderPosition.x - entry.lastListenerPosition.x,
        localRenderPosition.y - entry.lastListenerPosition.y) >= .32;
    if (!entry.occlusion || listenerMoved || now - entry.lastOcclusionAt >= .24) {
      const bounds = {
        left: Math.min(item.fire.x, localRenderPosition.x) - .75,
        right: Math.max(item.fire.x, localRenderPosition.x) + .75,
        top: Math.min(item.fire.y, localRenderPosition.y) - .75,
        bottom: Math.max(item.fire.y, localRenderPosition.y) + .75,
      };
      entry.occlusion = campfirePathOcclusion(item.fire, localRenderPosition, {
        trees: getSolidTreesInBounds(bounds),
        rocks: getRocksInBounds(bounds),
        shelter: SHELTER_BOUNDS,
        door: CLEARING_DOOR,
      });
      entry.lastOcclusionAt = now;
      entry.lastListenerPosition = { x: localRenderPosition.x, y: localRenderPosition.y };
    }
    entry.distance = item.distance;
    const audibleRadius = CAMPFIRE_AUDIO_RADIUS * (.35 + .65 * item.flameStrength);
    const fadeStart=audibleRadius*.72;
    const fadePosition=Math.max(0,Math.min(1,(audibleRadius-item.distance)/(audibleRadius-fadeStart)));
    const distanceFade=fadePosition*fadePosition*(3-2*fadePosition);
    const fuelPresence=.1+.9*item.flameStrength**1.5;
    const targetGain = Math.max(.0001,CAMPFIRE_AUDIO_SOURCE_GAIN * entry.occlusion.gain * distanceFade * fuelPresence);
    if (Math.abs(targetGain - entry.targetGain) > .004) {
      entry.gain.gain.setTargetAtTime(targetGain, now, .55);
      entry.targetGain = targetGain;
    }
    // A small, slow drop in pitch and high-frequency detail makes the last embers sound softer.
    const playbackRate = .94 + .06 * item.flameStrength;
    if (Math.abs(playbackRate - entry.playbackRate) > .002) {
      setSpatialParam(entry.source.playbackRate, playbackRate, now, .8);
      entry.playbackRate = playbackRate;
    }
    entry.occlusionDb = entry.occlusion.attenuationDb;
    entry.occluders = entry.occlusion.blockers;
    const fuelCutoff = .48 + .52 * item.flameStrength;
    const cutoff = Math.max(900,
      (1_500 + 16_500 * Math.exp(-item.distance / 12))
        * fuelCutoff * entry.occlusion.cutoffMultiplier);
    if (Math.abs(cutoff - entry.filterFrequency) > 180) {
      setSpatialParam(entry.filter.frequency, cutoff, now, .2);
      entry.filterFrequency = cutoff;
    }
  }
}

function ambientRegionAt(position) {
  if (worldLocation !== 'clearing') return null;
  if (worldDimensionId === 'breu' || dimensionTheme === 'dark') return 'breu';
  if (worldDimensionId === 'energy' || dimensionTheme === 'energy') return 'energy';

  let closestSpooky = null;
  let woodland = false;
  const considerSpooky = (region, distance, radius) => {
    if (distance > radius) return;
    const score = distance / radius;
    if (!closestSpooky || score < closestSpooky.score) closestSpooky = { region, score };
  };
  for (const edit of getWorldDefinition().edits || []) {
    const distance = Math.hypot(position.x - edit.x, position.y - edit.y);
    if (edit.type === 'forest' && distance <= (edit.radius || 0)) woodland = true;
    if (edit.type === 'creature-zone' && edit.creatureKind === 'goblin') {
      considerSpooky('goblins', distance, (edit.radius || 0) + 12);
      continue;
    }
    if (edit.type !== 'place') continue;
    const kind = edit.placeKind;
    if (kind === 'woodland' && distance <= 24) woodland = true;
    if (['ruins', 'secret-ruins', 'secret-cave', 'standing-stones', 'broken-tower'].includes(kind)) {
      considerSpooky('ruins', distance, kind === 'secret-cave' ? 13 : 16);
    }
  }
  if (gameDay.period === 'Dia') return woodland ? 'woodland-day' : 'day';
  if (!gameDay.isNight) return null;
  return closestSpooky?.region || null;
}

const AMBIENT_EVENT_PROFILES = Object.freeze({
  dayStrings: {
    duration: 12.4, volume: .4, noiseFrequency: 320, noiseEndFrequency: 240,
    noiseQ: .55, noiseGain: .12, echo: .5, tones: [
      { type:'sawtooth', start:174.61, end:174.2, gain:.12 },
      { type:'triangle', start:261.63, end:262.1, gain:.095 },
      { type:'sine', start:349.23, end:348.9, gain:.072 },
      { type:'triangle', start:523.25, end:523, gain:.046 },
    ],
  },
  ruins: {
    duration: 9.2, volume: .46, noiseFrequency: 560, noiseEndFrequency: 250, noiseQ: 1.15,
    echo: .28, tones: [
      { type:'triangle', start:148, end:58, gain:.14 },
      { type:'sine', start:412, end:286, gain:.055 },
    ],
  },
  goblins: {
    duration: 7, volume: .48, noiseFrequency: 330, noiseEndFrequency: 190, noiseQ: 3.4,
    echo: .12, tones: [
      { type:'triangle', start:93, end:54, gain:.13 },
      { type:'sine', start:248, end:174, gain:.075 },
    ],
  },
  breu: {
    duration: 11.2, volume: .43, noiseFrequency: 410, noiseEndFrequency: 150, noiseQ: .8,
    echo: .3, tones: [
      { type:'sine', start:78, end:36, gain:.12 },
      { type:'triangle', start:164, end:76, gain:.065 },
    ],
  },
  haunting: {
    duration: 9.4, volume: .42, noiseFrequency: 720, noiseEndFrequency: 210, noiseQ: .72,
    echo: .42, tones: [
      { type:'triangle', start:228, end:68, gain:.105 },
      { type:'sine', start:618, end:188, gain:.05 },
    ],
  },
  shadow: {
    duration: 8.6, volume: .44, noiseFrequency: 285, noiseEndFrequency: 105, noiseQ: 2.2,
    echo: .36, tones: [
      { type:'sine', start:116, end:43, gain:.12 },
      { type:'triangle', start:302, end:82, gain:.06 },
    ],
  },
  energyKeys: {
    duration: 8.8, volume: .38, noiseFrequency: 1_180, noiseEndFrequency: 570,
    noiseQ: 2.1, noiseGain: .12, echo: .5, tones: [
      { type:'sine', start:659, end:1_318, gain:.075 },
      { type:'triangle', start:988, end:494, gain:.055 },
      { type:'sine', start:1_318, end:1_760, gain:.028 },
    ],
  },
  energyChoir: {
    duration: 11.4, volume: .34, noiseFrequency: 480, noiseEndFrequency: 710,
    noiseQ: .65, noiseGain: .09, echo: .62, tones: [
      { type:'triangle', start:220, end:330, gain:.075 },
      { type:'sine', start:330, end:247, gain:.05 },
      { type:'sawtooth', start:494, end:440, gain:.022 },
    ],
  },
  energyGlints: {
    duration: 7.6, volume: .39, noiseFrequency: 1_850, noiseEndFrequency: 920,
    noiseQ: 3.1, noiseGain: .1, echo: .24, tones: [
      { type:'sine', start:880, end:1_660, gain:.065 },
      { type:'triangle', start:1_320, end:660, gain:.052 },
      { type:'sine', start:1_980, end:1_485, gain:.024 },
    ],
  },
  energyWaves: {
    duration: 10.2, volume: .36, noiseFrequency: 350, noiseEndFrequency: 640,
    noiseQ: 1.2, noiseGain: .14, echo: .58, tones: [
      { type:'sine', start:130, end:261, gain:.09 },
      { type:'triangle', start:196, end:392, gain:.055 },
      { type:'sine', start:392, end:784, gain:.024 },
    ],
  },
  energyResonance: {
    duration: 12.2, volume: .34, noiseFrequency: 225, noiseEndFrequency: 145,
    noiseQ: .8, noiseGain: .16, echo: .68, tones: [
      { type:'triangle', start:82, end:164, gain:.1 },
      { type:'sine', start:123, end:246, gain:.065 },
      { type:'sine', start:246, end:369, gain:.028 },
    ],
  },
  energyImpulse: {
    duration: 5.8, volume: .42, noiseFrequency: 2_100, noiseEndFrequency: 260,
    noiseQ: 1, noiseGain: .26, echo: .34, tones: [
      { type:'triangle', start:1_500, end:150, gain:.08 },
      { type:'sine', start:300, end:68, gain:.085 },
      { type:'sine', start:720, end:210, gain:.035 },
    ],
  },
});

const AMBIENT_CUES_BY_REGION = Object.freeze({
  day: ['dayStrings'],
  'woodland-day': ['birds', 'birds', 'birds', 'birds', 'birds', 'dayStrings'],
  ruins: ['ruins', 'haunting', 'piano'],
  goblins: ['goblins', 'haunting', 'shadow'],
  breu: ['breu', 'haunting', 'shadow', 'piano'],
  energy: ['energyKeys', 'energyChoir', 'energyGlints', 'energyWaves',
    'energyResonance', 'energyImpulse'],
});

function playAmbientEvent(region, worldPosition) {
  if (!ambience?.ambientNoiseBuffer || !audioContext) return;
  const choices = AMBIENT_CUES_BY_REGION[region];
  const profileId = choices?.[Math.floor(Math.random() * choices.length)];
  if (profileId === 'birds') {
    playBirdEvent(worldPosition);
    return;
  }
  if (profileId === 'piano') {
    playAmbientPianoEvent(worldPosition);
    return;
  }
  const profile = AMBIENT_EVENT_PROFILES[profileId];
  if (!profile) return;
  const now = audioContext.currentTime;
  const distance = 4.5 + Math.random() * 4.5;
  const angle = Math.random() * Math.PI * 2;
  const x = Math.max(0, Math.min(WORLD_SIZE, worldPosition.x + Math.cos(angle) * distance));
  const y = Math.max(0, Math.min(WORLD_SIZE, worldPosition.y + Math.sin(angle) * distance));
  const position = worldToAudioPosition(x, y, surfaceHeight(x, y, 'clearing') * .75 + .9);
  const source = audioContext.createBufferSource();
  source.buffer = ambience.ambientNoiseBuffer;
  source.playbackRate.value = .84 + Math.random() * .22;
  const filter = audioContext.createBiquadFilter();
  filter.type = 'bandpass'; filter.Q.value = profile.noiseQ;
  filter.frequency.setValueAtTime(profile.noiseFrequency, now);
  filter.frequency.exponentialRampToValueAtTime(profile.noiseEndFrequency, now + profile.duration);
  const noiseGain = audioContext.createGain(); noiseGain.gain.value = profile.noiseGain ?? .32;
  const echo = audioContext.createDelay(.8); echo.delayTime.value = .21 + profile.echo * .3;
  const echoGain = audioContext.createGain(); echoGain.gain.value = profile.echo;
  const eventGain = audioContext.createGain(); eventGain.gain.setValueAtTime(.0001, now);
  eventGain.gain.exponentialRampToValueAtTime(profile.volume, now + AMBIENT_EVENT_FADE_IN_SECONDS);
  const fadeOutStartsAt = now + profile.duration - AMBIENT_EVENT_FADE_SECONDS;
  eventGain.gain.setValueAtTime(profile.volume, fadeOutStartsAt);
  eventGain.gain.exponentialRampToValueAtTime(.0001, now + profile.duration);
  const panner = audioContext.createPanner();
  panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
  panner.refDistance = 3; panner.rolloffFactor = .82; panner.maxDistance = 26;
  panner.coneInnerAngle = 360; panner.coneOuterAngle = 360; panner.coneOuterGain = 1;
  source.connect(filter); filter.connect(noiseGain); noiseGain.connect(eventGain);
  filter.connect(echo); echo.connect(echoGain); echoGain.connect(eventGain);
  const oscillators = [];
  for (const tone of profile.tones) {
    const oscillator = audioContext.createOscillator(); oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(tone.end, now + profile.duration);
    const toneGain = audioContext.createGain(); toneGain.gain.value = tone.gain;
    oscillator.connect(toneGain); toneGain.connect(eventGain);
    oscillator.start(now); oscillator.stop(now + profile.duration + .08);
    oscillators.push({ oscillator, gain: toneGain });
  }
  eventGain.connect(panner); panner.connect(ambience.ambientBus);
  setAudioNodePosition(panner, position, now);
  source.start(now, 0);
  source.stop(now + profile.duration + .08);
  const event = { source, filter, noiseGain, echo, echoGain, eventGain, panner, oscillators,
    startedAt: now, duration: profile.duration, volume: profile.volume,
    fadeInSeconds: AMBIENT_EVENT_FADE_IN_SECONDS, stopping: false };
  ambience.ambientEvents.add(event);
  source.onended = () => {
    if (event.finished) return;
    event.finished = true;
    ambience?.ambientEvents.delete(event);
    for (const node of [source, filter, noiseGain, echo, echoGain, eventGain, panner,
      ...oscillators.flatMap(item => [item.oscillator, item.gain])]) node.disconnect();
  };
}

function playAmbientPianoEvent(worldPosition) {
  if (!ambience?.pianoNoteBuffer || !audioContext) return;
  const now = audioContext.currentTime;
  const distance = 5 + Math.random() * 6;
  const angle = Math.random() * Math.PI * 2;
  const x = Math.max(0, Math.min(WORLD_SIZE, worldPosition.x + Math.cos(angle) * distance));
  const y = Math.max(0, Math.min(WORLD_SIZE, worldPosition.y + Math.sin(angle) * distance));
  const position = worldToAudioPosition(x, y, surfaceHeight(x, y, 'clearing') * .75 + 1.1);
  const source = audioContext.createBufferSource();
  source.buffer = ambience.pianoNoteBuffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 5_200; filter.Q.value = .55;
  const eventGain = audioContext.createGain();
  const volume = .56;
  eventGain.gain.value = volume;
  const panner = audioContext.createPanner();
  panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
  panner.refDistance = 3; panner.rolloffFactor = .82; panner.maxDistance = 28;
  panner.coneInnerAngle = 360; panner.coneOuterAngle = 360; panner.coneOuterGain = 1;
  source.connect(filter); filter.connect(eventGain); eventGain.connect(panner);
  panner.connect(ambience.ambientBus);
  setAudioNodePosition(panner, position, now);
  source.start(now);
  source.stop(now + ambience.pianoNoteBuffer.duration + .08);
  const event = { source, filter, eventGain, panner, oscillators: [], startedAt: now,
    duration: ambience.pianoNoteBuffer.duration, volume, fadeInSeconds: 0,
    naturalDecay: true, preservedToFinish: false, stopping: false };
  ambience.ambientEvents.add(event);
  source.onended = () => {
    if (event.finished) return;
    event.finished = true;
    ambience?.ambientEvents.delete(event);
    for (const node of [source, filter, eventGain, panner]) node.disconnect();
  };
}

function playBirdEvent(worldPosition) {
  if (!ambience?.birdChirpsBuffer || !audioContext) return;
  const now = audioContext.currentTime;
  const distance = 4 + Math.random() * 7;
  const angle = Math.random() * Math.PI * 2;
  const x = Math.max(0, Math.min(WORLD_SIZE, worldPosition.x + Math.cos(angle) * distance));
  const y = Math.max(0, Math.min(WORLD_SIZE, worldPosition.y + Math.sin(angle) * distance));
  const position = worldToAudioPosition(x, y, surfaceHeight(x, y, 'clearing') * .75 + 1.4);
  const source = audioContext.createBufferSource();
  source.buffer = ambience.birdChirpsBuffer;
  source.playbackRate.value = .82 + Math.random() * .34;
  const duration = ambience.birdChirpsBuffer.duration / source.playbackRate.value;
  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 1_050 + Math.random() * 350;
  const lowpass = audioContext.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 5_800 + Math.random() * 1_600;
  const eventGain = audioContext.createGain(); eventGain.gain.setValueAtTime(.0001, now);
  const volume = .58;
  eventGain.gain.exponentialRampToValueAtTime(volume, now + AMBIENT_EVENT_FADE_IN_SECONDS);
  const fadeOutStartsAt = now + duration - AMBIENT_EVENT_FADE_SECONDS;
  eventGain.gain.setValueAtTime(volume, fadeOutStartsAt);
  eventGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  const panner = audioContext.createPanner();
  panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
  panner.refDistance = 3; panner.rolloffFactor = .72; panner.maxDistance = 30;
  panner.coneInnerAngle = 360; panner.coneOuterAngle = 360; panner.coneOuterGain = 1;
  source.connect(highpass); highpass.connect(lowpass); lowpass.connect(eventGain);
  eventGain.connect(panner); panner.connect(ambience.ambientBus);
  setAudioNodePosition(panner, position, now);
  source.start(now);
  source.stop(now + duration + .08);
  const event = { source, highpass, lowpass, eventGain, panner, oscillators: [],
    startedAt: now, duration, volume, fadeInSeconds: AMBIENT_EVENT_FADE_IN_SECONDS, stopping: false };
  ambience.ambientEvents.add(event);
  source.onended = () => {
    if (event.finished) return;
    event.finished = true;
    ambience?.ambientEvents.delete(event);
    for (const node of [source, highpass, lowpass, eventGain, panner]) node.disconnect();
  };
}

function stopAmbientEvent(event, now, { preserveNaturalDecay = false } = {}) {
  if (preserveNaturalDecay && event?.naturalDecay) {
    event.preservedToFinish = true;
    return;
  }
  if (!event || event.stopping || event.finished) return;
  event.stopping = true;
  const parameter = event.eventGain.gain;
  if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
  else {
    const elapsed = Math.max(0, now - event.startedAt);
    const fadeInSeconds = event.fadeInSeconds ?? AMBIENT_EVENT_FADE_IN_SECONDS;
    const naturalFadeStart = event.duration
      - (event.naturalDecay ? 0 : AMBIENT_EVENT_FADE_SECONDS);
    const fadeProgress = Math.max(0, Math.min(1,
      (elapsed - naturalFadeStart) / AMBIENT_EVENT_FADE_SECONDS));
    const heldGain = fadeInSeconds > 0 && elapsed < fadeInSeconds
      ? .0001 * (event.volume / .0001) ** (elapsed / fadeInSeconds)
      : elapsed < naturalFadeStart ? event.volume
        : event.volume * (.0001 / event.volume) ** fadeProgress;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(Math.max(.0001, heldGain), now);
  }
  parameter.exponentialRampToValueAtTime(.0001, now + AMBIENT_EVENT_FADE_SECONDS);
  try { event.source.stop(now + AMBIENT_EVENT_FADE_SECONDS + .08); } catch {}
  for (const item of event.oscillators) {
    try { item.oscillator.stop(now + AMBIENT_EVENT_FADE_SECONDS + .08); } catch {}
  }
}

function stopAmbientEvents(now = audioContext?.currentTime || 0, options = {}) {
  if (!ambience) return;
  for (const event of ambience.ambientEvents) stopAmbientEvent(event, now, options);
  ambience.ambientRegion = null;
  ambience.ambientNextAt = null;
}

function ambientEventDelay(region, first = false) {
  if (region === 'woodland-day') return first ? 5 + Math.random() * 18 : 18 + Math.random() * 34;
  if (region === 'day') return first ? 30 + Math.random() * 60 : 100 + Math.random() * 120;
  if (region === 'energy') return first ? 8 + Math.random() * 24 : 30 + Math.random() * 60;
  return first ? 22 + Math.random() * 48 : 68 + Math.random() * 92;
}

const FOOTSTEP_LOOPS = {
  grass: { url: './art/audio/grass-run.wav', runRate: 1, walkRate: .68, runVolume: .88, walkVolume: .70, lowpassHz: 0 },
  path: { url: './art/audio/path-run.wav', runRate: 1, walkRate: .68, runVolume: .52, walkVolume: .28, lowpassHz: 1100 },
};
const footstepLoops = { grass: null, path: null };
let pendingFootstepFrameState = { grassVolume: 0, grassRunning: false, pathVolume: 0, pathRunning: false };

function isPathGround(x, y) {
  if (isVillagePlazaTile(x, y) || isReceptionFootway(x, y, RECEPTION_BUILDING)) return false;
  return isPathTile(x, y) || isDimensionPathTile(x, y) || isDimensionSecretPathTile(x, y);
}

function isGrassGround(x, y) {
  return !isPathGround(x, y) && !isVillagePlazaTile(x, y) && !isReceptionFootway(x, y, RECEPTION_BUILDING);
}

function syncFootstepLoop(name, targetGain = 0, isRunning = false) {
  if (!audioContext) return;
  const config = FOOTSTEP_LOOPS[name];
  const audible = targetGain > .0001 && audioContext.state === 'running'
    && ui.sound.getAttribute('aria-pressed') === 'true' && !document.hidden;
  let state = footstepLoops[name];
  if (!state) {
    if (!audible) return;
    state = footstepLoops[name] = { buffer: null, source: null, gain: null, filter: null, stopAt: undefined };
    fetch(new URL(config.url, import.meta.url)).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then(data => audioContext.decodeAudioData(data)).then(buffer => {
      state.buffer = buffer;
    }).catch(error => console.warn('Não foi possível carregar o som de passos.', error));
  }
  if (!state.buffer) return;
  const now = audioContext.currentTime;
  if (!state.source) {
    if (!audible) return;
    state.gain = audioContext.createGain();
    state.gain.gain.value = .0001;
    state.source = audioContext.createBufferSource();
    state.source.buffer = state.buffer;
    state.source.loop = true;
    let node = state.source;
    if (config.lowpassHz) {
      state.filter = audioContext.createBiquadFilter();
      state.filter.type = 'lowpass';
      state.filter.frequency.value = config.lowpassHz;
      node.connect(state.filter);
      node = state.filter;
    }
    node.connect(state.gain); state.gain.connect(audioContext.destination);
    state.source.start(now);
  }
  setSpatialParam(state.source.playbackRate, isRunning ? config.runRate : config.walkRate, now, .08);
  setSpatialParam(state.gain.gain, audible ? targetGain : .0001, now, .08);
  if (audible) state.stopAt = undefined;
  else if (state.stopAt === undefined) state.stopAt = now + .6;
  if (state.stopAt !== undefined && now >= state.stopAt) {
    state.source.stop(); state.source.disconnect(); state.filter?.disconnect(); state.gain.disconnect();
    state.source = null; state.gain = null; state.filter = null; state.stopAt = undefined;
  }
}

function syncAmbientEvents() {
  if (!AMBIENT_AUDIO_ENABLED || !ambience || !audioContext) return;
  const now = audioContext.currentTime;
  if (now - ambience.lastAmbientSyncAt < .16) return;
  ambience.lastAmbientSyncAt = now;
  const allowed = audioContext.state === 'running'
    && ui.sound.getAttribute('aria-pressed') === 'true'
    && !document.hidden;
  const region = allowed ? ambientRegionAt(localRenderPosition) : null;
  if (!region) {
    const hasEventsToStop = [...ambience.ambientEvents]
      .some(event => !event.preservedToFinish && !event.stopping);
    if (hasEventsToStop || ambience.ambientRegion) {
      stopAmbientEvents(now, { preserveNaturalDecay: true });
    }
    return;
  }

  const listenerHeight = surfaceHeight(localRenderPosition.x, localRenderPosition.y, 'clearing') * .75
    + 1.4 + (localRenderPosition.z || 0) * .75;
  setCampfireListener(audioContext.listener,
    worldToAudioPosition(localRenderPosition.x, localRenderPosition.y, listenerHeight), now);
  if (ambience.ambientRegion !== region) {
    stopAmbientEvents(now, { preserveNaturalDecay: true });
    ambience.ambientRegion = region;
    ambience.ambientNextAt = now + ambientEventDelay(region, true);
    return;
  }
  if (ambience.ambientNextAt !== null && now >= ambience.ambientNextAt
      && ambience.ambientEvents.size === 0) {
    playAmbientEvent(region, localRenderPosition);
    ambience.ambientNextAt = now + ambientEventDelay(region);
  }
}

function fadeSoundBuses(enabled, now = audioContext?.currentTime || 0) {
  if (!ambience || !audioContext) return;
  for (const [bus, target] of [
    [ambience.campfireBus, enabled && CAMPFIRE_AUDIO_ENABLED ? CAMPFIRE_AUDIO_BUS_GAIN : .0001],
    [ambience.ambientBus, enabled && AMBIENT_AUDIO_ENABLED ? 1.15 : .0001],
    [ambience.teleportBus, enabled ? .55 : .0001],
  ]) {
    const parameter = bus.gain;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(Math.max(.0001, parameter.value), now);
    }
    parameter.exponentialRampToValueAtTime(target, now + AMBIENT_EVENT_FADE_SECONDS);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAmbientEvents();
    fadeSoundBuses(false);
  } else if (ui.sound.getAttribute('aria-pressed') === 'true') {
    fadeSoundBuses(true);
  }
});

async function toggleSound() {
  if (!audioContext) ambience = createAmbience();
  if (!audioContext || !ambience) return;
  const enabled = ui.sound.getAttribute('aria-pressed') !== 'true';
  for (const button of [ui.sound, ui.authSound]) {
    if (!button) continue;
    button.setAttribute('aria-pressed', String(enabled));
    button.title = button === ui.authSound
      ? (enabled ? 'Desligar som' : 'Ativar som')
      : (enabled ? 'Desligar som' : 'Ativar som');
    const label = button.querySelector('span');
    if (label) label.textContent = enabled ? 'Ligado' : 'Desligado';
  }
  if (soundSuspendTimer !== null) clearTimeout(soundSuspendTimer);
  soundSuspendTimer = null;
  if (enabled) {
    await audioContext.resume();
    fadeSoundBuses(true);
  } else {
    stopAmbientEvents(audioContext.currentTime);
    fadeSoundBuses(false, audioContext.currentTime);
    soundSuspendTimer = window.setTimeout(() => {
      soundSuspendTimer = null;
      if (ui.sound.getAttribute('aria-pressed') === 'true' || audioContext?.state !== 'running') return;
      void audioContext.suspend();
    }, Math.ceil((AMBIENT_EVENT_FADE_SECONDS + .12) * 1_000));
  }
}

function unlockDefaultSound() {
  if (ui.sound.getAttribute('aria-pressed') !== 'true') return;
  if (!audioContext || audioContext.state === 'running') return;
  // Browsers require a real user gesture before they allow audio playback.
  void audioContext.resume().then(()=>{if(arrivalThunderPending)playArrivalThunder();})
    .catch(error => console.warn('Não foi possível iniciar o áudio.', error));
}

function playArrivalCharge(){
  arrivalChargePlayed=true;
  if(ui.sound.getAttribute('aria-pressed')!=='true'||audioContext?.state!=='running'||!ambience)return;
  const now=audioContext.currentTime,duration=.32;
  const buffer=audioContext.createBuffer(1,Math.ceil(audioContext.sampleRate*duration),audioContext.sampleRate);
  const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(i/data.length);
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  source.buffer=buffer;filter.type='highpass';filter.frequency.value=1600;
  gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(.16,now+.2);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  source.connect(filter);filter.connect(gain);gain.connect(ambience.teleportBus);source.start(now);source.stop(now+duration);
}

function playArrivalThunder(){
  if(arrivalThunderPlayed)return;
  if(ui.sound.getAttribute('aria-pressed')!=='true'){arrivalThunderPending=false;arrivalThunderPlayed=true;return;}
  if(!audioContext||audioContext.state!=='running'||!ambience?.arrivalThunderBuffer){arrivalThunderPending=true;return;}
  const source=audioContext.createBufferSource(),gain=audioContext.createGain();
  source.buffer=ambience.arrivalThunderBuffer;gain.gain.value=.72;source.connect(gain);gain.connect(ambience.teleportBus);
  const now=audioContext.currentTime;
  source.start(now);
  // The contact has its own low impulse; the recorded thunder supplies the rolling tail.
  const body=audioContext.createOscillator(),bodyGain=audioContext.createGain();
  body.type='sine';body.frequency.setValueAtTime(86,now);body.frequency.exponentialRampToValueAtTime(28,now+.7);
  bodyGain.gain.setValueAtTime(.001,now);bodyGain.gain.exponentialRampToValueAtTime(.5,now+.012);bodyGain.gain.exponentialRampToValueAtTime(.001,now+.85);
  body.connect(bodyGain);bodyGain.connect(ambience.teleportBus);body.start(now);body.stop(now+.9);
  arrivalThunderPlayed=true;arrivalThunderPending=false;
}

function playEffect(kind) {
  if (!audioContext || audioContext.state !== 'running') return;
  const start = audioContext.currentTime;
  const frequency = kind === 'pickup' ? 587 : kind === 'fire' ? 330 : kind === 'chime' ? 440 : 392;
  const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
  oscillator.type = ['fire', 'chime', 'pickup'].includes(kind) ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * .82, start + .16);
  gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(kind === 'chime' ? .32 : .4, start + .025); gain.gain.exponentialRampToValueAtTime(.0001, start + .23);
  oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + .25);
}

function updateDecorativeDetail(frameSeconds) {
  const crowdedRoom=worldLocation==='room'&&roomFurniture.size>=6;
  const veryCrowdedRoom=worldLocation==='room'&&roomFurniture.size>=10;
  const pressureLevel=lastVisibleThingCount>=240||veryCrowdedRoom||livePlayers.size>=64?0
    :lastVisibleThingCount>=160||crowdedRoom||livePlayers.size>=24?1:2;
  const applyLevel=level=>{
    if(level===decorativeDetailLevel)return;
    decorativeDetailLevel=level;
    resizeCanvas();
  };
  if(pressureLevel<decorativeDetailLevel){applyLevel(pressureLevel);slowFrameCount=0;fastFrameCount=0;}
  const maxPixelRatio = maximumCanvasPixelRatio();
  if(Math.abs(canvasPixelRatio-Math.min(window.devicePixelRatio||1,maxPixelRatio))>.001)resizeCanvas();
  if(frameSeconds>1/32){
    slowFrameCount++;fastFrameCount=0;
    if(slowFrameCount>=4&&decorativeDetailLevel>0){applyLevel(decorativeDetailLevel-1);slowFrameCount=0;}
  }else if(frameSeconds<1/40&&pressureLevel===2){
    fastFrameCount++;slowFrameCount=0;
    if(fastFrameCount>=120&&decorativeDetailLevel<2){applyLevel(decorativeDetailLevel+1);fastFrameCount=0;}
  }else{slowFrameCount=0;fastFrameCount=0;}
}

let lastFrameErrorAt=-Infinity;
function frame(now){
  if(!authenticated){frameStarted=false;return;}
  try{advanceFrame(now);}catch(error){
    lastFrame=0;accumulator=0;
    if(now-lastFrameErrorAt>10_000){
      lastFrameErrorAt=now;console.error('Falha recuperável no quadro do jogo.',error);
      recordMovementDiagnostic('runtime-error',{pending:pendingInputs.length,outbound:outboundInputs.length},true);
    }
  }finally{if(authenticated)requestAnimationFrame(frame);else frameStarted=false;}
}
function advanceFrame(now) {
  const frameWorkStartedAt=performance.now();
  if(sceneReady)processLightmapQueue(1.5,256);
  lastTerrainQueueWorkMs=0;
  if(worldLocation==='clearing'){
    const terrainStarted=performance.now();
    sceneArt.processTerrainQueue(256,sceneReady?1.8:5);
    lastTerrainQueueWorkMs=performance.now()-terrainStarted;
  }
  if(pendingCameraZoom!==null&&sceneReady&&worldLocation==='clearing'
      &&sceneArt.terrainChunksReady(pendingZoomTerrainChunks()))commitCameraZoom(pendingCameraZoom);
  if (!sceneReady) { lastFrame = 0; accumulator = 0; return; }
  const previousFrameAt=lastFrame,frameGapMs=previousFrameAt?Math.max(0,now-previousFrameAt):0;
  if(previousFrameAt&&document.visibilityState!=='hidden')performanceTelemetry.observeFrame(frameGapMs);
  if(now-lastPerformanceReportAt>=10_000)flushPerformanceTelemetry(now);
  if (!lastFrame) lastFrame = now;
  const elapsed = Math.min(.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if(frameGapMs>=250&&now-lastFrameGapDiagnosticAt>=5000){
    recordMovementDiagnostic('frame-gap',{frameGapMs:Math.round(frameGapMs),pending:pendingInputs.length,
      outbound:outboundInputs.length,ackLag:Math.max(0,inputSequence-lastAcknowledgedInput)},true);
    lastFrameGapDiagnosticAt=now;
  }
  localRenderCorrection = decayRenderCorrection(localRenderCorrection, elapsed,
    resumeCorrectionUntil > now ? 0.45 : 0.14);
  updateDecorativeDetail(elapsed);
  warmNearbyCabin();
  if(pendingInputs.length>=INPUT_PRESSURE_THRESHOLD){
    inputPressureSince||=now;
    if(!inputPressureReported&&now-inputPressureSince>=750){
      recordMovementDiagnostic('queue-pressure',{pending:pendingInputs.length,outbound:outboundInputs.length,
        ackLag:Math.max(0,inputSequence-lastAcknowledgedInput),ageMs:Math.round(now-inputPressureSince),
        bufferedBytes:socket?.bufferedAmount||0},true);
      inputPressureReported=true;
    }
  }else{inputPressureSince=0;inputPressureReported=false;}
  if(pendingInputs.length&&now-lastInputProgressAt>=1500&&now-lastAckStallDiagnosticAt>=5000){
    recordMovementDiagnostic('input-ack-stall',{pending:pendingInputs.length,outbound:outboundInputs.length,
      ackLag:Math.max(0,inputSequence-lastAcknowledgedInput),ageMs:Math.round(now-lastInputProgressAt),
      bufferedBytes:socket?.bufferedAmount||0},true);
    lastAckStallDiagnosticAt=now;
  }
  if (connectionSnapshotReady&&predictionReady&&!recoveryCloseRequested&&shouldRecoverPrediction(pendingInputs.length, lastInputProgressAt, now, {
    maxPending: MAX_PENDING_INPUT_COMMANDS,
    stalledMs: PREDICTION_STALL_RECOVERY_MS,
    pressureSince:inputPressureSince,pressureThreshold:INPUT_PRESSURE_THRESHOLD,
    pressureMs:INPUT_PRESSURE_RECOVERY_MS,
  })&&socket?.readyState===WebSocket.OPEN){
    const reason=pendingInputs.length>=MAX_PENDING_INPUT_COMMANDS&&now-lastInputProgressAt>=PREDICTION_STALL_RECOVERY_MS?'stalled':'pressure';
    recordMovementDiagnostic('prediction-recovery',{pending:pendingInputs.length,outbound:outboundInputs.length,
      ackLag:Math.max(0,inputSequence-lastAcknowledgedInput),ageMs:Math.round(now-lastInputProgressAt),reason},true);
    recoveryCloseRequested=true;
    // Sustained congestion is a control failure even if occasional ACKs arrive.
    send({type:'recoverMovement'});
    socket.close(4000, 'movement acknowledgements stalled');
  }
  accumulator += elapsed;
  const simulationStarted=renderProfiler?performance.now():0;
  while (accumulator >= STEP) {
    const previousPosition = localPosition;
    const canPredict = predictionReady && pendingInputs.length < MAX_PENDING_INPUT_COMMANDS && !dimensionTransitMovementLocked();
    const input = canPredict ? currentInput(previousPosition) : { x:0, y:0 };
    if (canPredict && !canSkipSettledNeutralInput(input)) {
      const command = {seq:++inputSequence, ...input};
      pendingInputs.push(command); outboundInputs.push(command);
      // If confirmations stall, pause prediction instead of reconnecting at the spawn.
    }
    previousLocalPosition = previousPosition;
    const occupied = [...livePlayers.values()].filter(player => player.id !== selfId);
    localPosition = !canPredict?previousPosition:worldLocation === 'room'
      ? stepRoomPlayer(previousPosition, input, STEP, occupied, [...roomFurniture.values()], currentRoomLayout(), { ...localInventory.attributes, hasteActive:performance.now()<localHasteUntil })
      : stepPlayer(previousPosition, input, STEP, occupied, [...fires.values()], undefined, currentWildlifeCollisionBodies(), { ...localInventory.attributes, hasteActive:performance.now()<localHasteUntil, sprintBurstActive:worldLocation==='clearing'&&performance.now()<localSprintBurstUntil, flightAuthorized:flightPilotAllowed });
    if(worldLocation==='room'&&canPredict){
      const layout=currentRoomLayout();
      if(previousPosition.y<=layout.bounds.bottom-PLAYER_RADIUS)clientRoomEnteredFloor=true;
      if(crossedRoomExit(previousPosition,localPosition,layout,{enteredFloor:clientRoomEnteredFloor})){
        sendPendingMovementBeforeInteraction();beginPendingRoomTravel();
      }
    }
    const collision = updateCollisionFeedback(
      { blocked: collisionBlocked, feedback: collisionFeedback },
      previousPosition,
      localPosition,
      input,
      now,
      TILE_X,
      TILE_Y,
    );
    collisionBlocked = collision.blocked;
    collisionFeedback = collision.feedback;
    localMoving = localPosition.x !== previousPosition.x || localPosition.y !== previousPosition.y;
    if(localMoving)lastMotion={x:localPosition.x-previousPosition.x,y:localPosition.y-previousPosition.y};
    const facingIntent = getFacingIntent(input,
      localPosition.x - previousPosition.x,
      localPosition.y - previousPosition.y,
      TILE_X,
      TILE_Y,
    );
    facingTransition = advanceFacingDirection(facingTransition,facingIntent,TILE_X,TILE_Y,STEP);
    localFacing = facingTransition.facing;
    worldClock = advanceWorldAnimationTime(worldClock, STEP, reducedMotion);
    accumulator -= STEP;
  }
  if(renderProfiler)lastSimulationMs=performance.now()-simulationStarted;
  if(now-lastWeatherUpdate>1_000){
    lastWeatherUpdate=now;
    const weather=worldLocation==='clearing'
      ? (({dark:'uma fogueira no breu',sky:'vento das alturas',inferno:'calor profundo',magic:'brisa encantada',energy:'correntes de energia',giants:'vento das montanhas'})[dimensionTheme]||windDescriptionAt(localPosition.x,localPosition.y))
      : '';
    const skySymbol=gameDay.hasMoon&&gameDay.moonOpacity>.15?'☾ ✦':gameDay.daylight>.02&&gameDay.sunPosition?'☀':'✦';
    ui.weatherText.textContent=`${skySymbol} ${gameDay.period}${gameDay.label?` · ${gameDay.label}`:''}${weather?` · ${weather}`:''}`;
  }
  sendInputIfChanged(now);
  const drawStartedAt=performance.now();
  performanceTelemetry.observeFrameWork(drawStartedAt-frameWorkStartedAt);
  if(draw()){
    const drawDuration=performance.now()-drawStartedAt;
    if(document.visibilityState!=='hidden')runtimePerformance.frame(frameGapMs,drawDuration);
  }
  if(now-lastRuntimePerformanceAt>=1000){lastRuntimePerformanceAt=now;updateRuntimePerformance(now);}
}

function isTyping(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement; }
function normalizeHeldKey(key) { return /^[a-z]$/i.test(key) ? key.toLowerCase() : key; }

window.addEventListener('keydown', event => {
  const movementKey = movementKeyForEvent(event);
  if (movementKey && dimensionTransitMovementLocked()) { event.preventDefault(); return; }
  const interactive = isInteractiveKeyboardTarget(event.target);
  if ((event.key==='n'||event.key==='N')&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&sceneReady&&!panels.isOpen&&!isTextEntryTarget(event.target)&&worldLocation==='clearing') {event.preventDefault();openWorldMap();return;}
  if (!sceneReady || panels.isOpen || isTextEntryTarget(event.target)) return;
  if (movementKey ? !canHandleMovementKey(event) : interactive) return;
  const shiftAbilityMatch = event.shiftKey ? /^(?:Digit|Numpad)([1-4])$/.exec(event.code || '') : null;
  if (shiftAbilityMatch) {
    event.preventDefault();
    const abilitySlot = Number(shiftAbilityMatch[1]);
    const abilityButtons = [...document.querySelectorAll('[data-ability-group] button[data-action^="cast:"]:not([hidden])')];
    const button = abilityButtons[abilitySlot - 1];
    if (button) action(button.dataset.action);
    else announce('Aprenda uma habilidade ativa para preencher este atalho.');
    return;
  }
  const key = movementKey || event.key;
  if (movementKey) {
    event.preventDefault();
    // Choosing to walk returns control to the world, including after a menu or
    // non-modal button. Keep native keyboard activation when no walk is requested.
    if (interactive) canvas.focus({ preventScroll: true });
  }
  if(key==='Escape'&&roomBuildMode){event.preventDefault();roomBuildMode=null;roomMovingId=null;roomPlacementPreview=null;updateRoomBuildButtons();return;}
  if (key === 'Enter' && event.target === canvas) { event.preventDefault(); ui.chatText.focus(); return; }
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','n','N','e','E','v','V','f','F','g','G','h','H','r','R','i','I','p','P','u','U','y','Y','b','B','k','K','o','O','m','M','q','Q','1','2','3','4','5','6','7','8','9','Shift','Control','c','C'].includes(key)
      || (worldLocation === 'room' && ['b','B','x','X'].includes(key))) event.preventDefault();
  keys.add(normalizeHeldKey(key));
  if (event.repeat) return;
  if (key === 'i' || key === 'I') { openInventory(); return; }
  if (/^[1-9]$/.test(key) && event.altKey && key <= '3') { emote(key === '1' ? 'wave' : key === '2' ? 'dance' : 'sit'); return; }
  if (/^[1-9]$/.test(key)) { selectHotbarSlot(Number(key) - 1); return; }
  if (key === 'e' || key === 'E') action('context');
  if (key === 'q' || key === 'Q') action('cast:sprintBurst');
  if (key === 'v' || key === 'V') action('visit-nearest');
  if (key === 'f' || key === 'F') action('fire');
  if (key === 'g' || key === 'G') action('share');
  if (key === 'h' || key === 'H') action('work');
  if (key === 'p' || key === 'P') action('craftPickaxe');
  if (key === 'u' || key === 'U') action('upgradeAxe');
  if (key === 'y' || key === 'Y') action('upgradePickaxe');
  if (key === 'b' || key === 'B') { if (worldLocation === 'clearing') action('buildBench'); }
  if (key === 'k' || key === 'K') action('buildKiln');
  if (key === 'o' || key === 'O') action('buildFurnace');
  if ((key === 'm' || key === 'M') && event.shiftKey) action('processSticks');
  else if (key === 'm' || key === 'M') action('process');
  if (key === 'r' || key === 'R') action('sharpen');
  if (worldLocation === 'room' && (key === 'b' || key === 'B')) setRoomBuildMode('place');
  if (worldLocation === 'room' && (key === 'x' || key === 'X')) setRoomBuildMode('remove');
});
window.addEventListener('keyup', event => keys.delete(movementKeyForEvent(event) || normalizeHeldKey(event.key)));
const clearMovement = () => {
  lastInput = clearHeldInputs(keys, touchDirections);
  lastInputSend = performance.now();
  walkPath = [];
  pendingRoomFurnitureUse=null;
  // The next fixed step sends the stop command in sequence.
};
window.addEventListener('blur', clearMovement);
document.addEventListener('focusin', event => {
  if (isTextEntryTarget(event.target)) clearMovement();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {lastFrame=0;clearMovement();}
});
ui.name.addEventListener('change', async () => {
  if (!authenticated || !currentProfile || currentProfile.guest) return;
  const previousName = currentProfile.username;
  try {
    const response = await fetch('/dev/auth/username', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ui.name.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não consegui atualizar o nome de usuário.');
    currentProfile = result.profile;
    ui.name.value = currentProfile.username;
    send({ type: 'join', name: currentProfile.username });
    ui.sessionLabel.textContent = currentProfile.guest ? 'VISITANTE' : `@${currentProfile.username}`;
    announce('Nome de usuário atualizado.');
  } catch (error) {
    ui.name.value = previousName;
    announce(error.message || 'Não consegui atualizar o nome de usuário.');
  }
});
document.querySelector('#help-toggle').addEventListener('click',event=>{
  const panel=document.querySelector('#game-help');panel.hidden=!panel.hidden;
  event.currentTarget.setAttribute('aria-expanded',String(!panel.hidden));
  if(panel.hidden)canvas.focus({preventScroll:true});
});
ui.inventoryToggle.addEventListener('click', openInventory);
ui.inventoryClose.addEventListener('click', closeInventory);
document.querySelector('#settings-toggle').addEventListener('click', () => panels.open('settings'));
document.querySelector('#settings-close').addEventListener('click', () => panels.close());
document.querySelector('#chat-focus-toggle').addEventListener('click', () => { clearMovement(); const menuToggle = document.querySelector('.mobile-menu-toggle'); menuToggle.closest('.topbar').classList.remove('menu-expanded'); menuToggle.setAttribute('aria-expanded', 'false'); ui.chatText.focus({ preventScroll: true }); });
ui.inventoryDialog.addEventListener('close', () => {
  inventoryDragSource = null;
  renderInventory();
  canvas.focus({ preventScroll: true });
});
ui.inventoryDialog.addEventListener('keydown', event => {
  const current = event.target.closest?.('[data-inventory-slot]');
  if (!current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const grid = current.closest('.inventory-grid');
  const slots = [...(grid?.querySelectorAll('[data-inventory-slot]') || [])];
  const index = slots.indexOf(current);
  if (index < 0) return;
  const columns = Math.max(1, getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/u).length);
  const target = index + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key]);
  if (target < 0 || target >= slots.length) return;
  event.preventDefault();
  event.stopPropagation();
  slots[target].focus();
});
ui.inventoryDialog.addEventListener('focusin', event => {
  const slot = event.target.closest?.('[data-inventory-slot]');
  if (!slot || !ui.inventoryDialog.open) return;
  const index = Number(slot.dataset.inventorySlot);
  if (index === inventorySelectionIndex) return;
  inventorySelectionIndex = index;
  // Focusing a slot occurs between pointerdown and click. Keep the same DOM
  // button alive so mouse/touch clicks and keyboard activation reach it.
  renderInventorySelection();
});
ui.quickbar.addEventListener('click', event => {
  const slot = event.target.closest('[data-quick-slot]');
  if (!slot) return;
  inventorySelectionIndex = Number(slot.dataset.quickSlot);
  selectHotbarSlot(inventorySelectionIndex);
  canvas.focus({ preventScroll: true });
});
function inventorySlotClick(event) {
  const button = event.target.closest('[data-inventory-slot]');
  if (!button || !ui.inventoryDialog.open) return;
  const target = Number(button.dataset.inventorySlot);
  if (inventoryDragSource === null) {
    inventorySelectionIndex = target;
    if (target < 9) { selectHotbarSlot(target); return; }
    if (!localInventory.slots[target]) { renderInventory(); return; }
    inventoryDragSource = target;
    renderInventory();
    return;
  }
  if (inventoryDragSource === target) {
    inventoryDragSource = null;
    inventorySelectionIndex = target;
    renderInventory();
    return;
  }
  moveInventorySlot(inventoryDragSource, target);
}
function startInventoryDrag(event) {
  const button = event.target.closest('[data-inventory-slot]');
  if (!button || !button.classList.contains('filled')) { event.preventDefault(); return; }
  inventoryDragSource = Number(button.dataset.inventorySlot);
  inventorySelectionIndex = inventoryDragSource;
  renderInventoryDetails();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(inventoryDragSource));
  button.classList.add('is-dragging');
}
function finishInventoryDrag(event) {
  const button = event.target.closest('[data-inventory-slot]');
  if (!button || inventoryDragSource === null) return;
  event.preventDefault();
  const target = Number(button.dataset.inventorySlot);
  document.querySelectorAll('.inventory-slot.drop-ready').forEach(slot => slot.classList.remove('drop-ready'));
  if (target !== inventoryDragSource) moveInventorySlot(inventoryDragSource, target);
}
for (const grid of [ui.inventoryGrid, ui.inventoryQuickGrid, ui.quickbar]) {
  if (grid !== ui.quickbar) grid.addEventListener('click', inventorySlotClick);
  grid.addEventListener('dragstart', startInventoryDrag);
  grid.addEventListener('dragover', event => { if (event.target.closest('[data-inventory-slot]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } });
  grid.addEventListener('dragenter', event => event.target.closest('[data-inventory-slot]')?.classList.add('drop-ready'));
  grid.addEventListener('dragleave', event => event.target.closest('[data-inventory-slot]')?.classList.remove('drop-ready'));
  grid.addEventListener('drop', finishInventoryDrag);
  grid.addEventListener('dragend', () => {
    inventoryDragSource = null;
    document.querySelectorAll('.inventory-slot.drop-ready').forEach(slot => slot.classList.remove('drop-ready'));
    renderInventory();
  });
}
const abilityConfirm = {
  dialog:document.querySelector('#ability-confirm-dialog'),
  message:document.querySelector('#ability-confirm-message'),
  learn:document.querySelector('#ability-confirm-learn'),
  keep:document.querySelector('#ability-confirm-keep'),
};
let pendingAbilityId = null;
function openAbilityConfirmation(abilityId) {
  const ability = PLAYER_ABILITIES[abilityId];
  if (!ability) return false;
  pendingAbilityId = abilityId;
  const pointLabel = ability.skillPoints === 1 ? 'ponto de habilidade' : 'pontos de habilidade';
  abilityConfirm.message.textContent = ability.label + ' custa ' + ability.skillPoints + ' ' + pointLabel + '. Esta escolha não pode ser desfeita nesta versão. Quer aprender agora?';
  abilityConfirm.learn.textContent = 'Aprender ' + ability.label;
  abilityConfirm.dialog.showModal();
  return true;
}
abilityConfirm.keep.addEventListener('click', () => {
  pendingAbilityId = null;
  abilityConfirm.dialog.close();
});
abilityConfirm.learn.addEventListener('click', () => {
  const abilityId = pendingAbilityId;
  pendingAbilityId = null;
  abilityConfirm.dialog.close();
  const button = abilityId && ui.skillList.querySelector('[data-learn-ability="' + abilityId + '"]');
  if (!button || button.disabled) return;
  sendPlayerCommand({ type:'action', name:'learnAbility', abilityId });
});
abilityConfirm.dialog.addEventListener('close', () => { pendingAbilityId = null; });
ui.skillList.addEventListener('click', event => {
  const button = event.target.closest('[data-learn-ability]');
  if (!button || button.disabled) return;
  openAbilityConfirmation(button.dataset.learnAbility);
});
ui.attributeList.addEventListener('click', event => {
  const button = event.target.closest('[data-allocate-attribute]');
  if (!button || button.disabled) return;
  sendPlayerCommand({ type:'action', name:'allocateAttribute', attribute:button.dataset.allocateAttribute });
});
ui.inventoryPages.addEventListener('click', event => {
  const button = event.target.closest('[data-storage-page]');
  if (!button || button.disabled) return;
  inventoryStoragePage = Number(button.dataset.storagePage);
  inventorySelectionIndex = null;
  inventoryRenderKey = '';
  renderInventory();
  button.focus({ preventScroll: true });
});
const xpPotionConfirm = {
  dialog:document.querySelector('#xp-potion-confirm'),
  message:document.querySelector('#xp-potion-confirm-message'),
  drink:document.querySelector('#xp-potion-drink'),
  keep:document.querySelector('#xp-potion-keep'),
};
let pendingXpPotionId = null;
function openXpPotionConfirmation(potionId) {
  const potion = XP_POTIONS[potionId];
  if (!potion || !xpPotionConfirm.dialog) return false;
  const preview = awardPotionXp(localInventory, potionId);
  const overflow = Math.max(0, potion.xp - preview.gained);
  pendingXpPotionId = potionId;
  const levelText = preview.levelsGained
    ? ' Você pode chegar ao nível ' + preview.progression.level + '.'
    : '';
  const overflowText = overflow
    ? ' ' + overflow.toLocaleString('pt-BR') + ' XP ultrapassariam o nível máximo e não seriam aproveitados.'
    : '';
  xpPotionConfirm.message.textContent = potion.label + ' é rara e concede até ' + potion.xp.toLocaleString('pt-BR')
    + ' XP.' + levelText + overflowText + ' Depois de beber, você não poderá recuperá-la. Quer usá-la agora?';
  xpPotionConfirm.drink.textContent = 'Beber ' + potion.label;
  xpPotionConfirm.dialog.showModal();
  return true;
}
xpPotionConfirm.keep.addEventListener('click', () => {
  pendingXpPotionId = null;
  xpPotionConfirm.dialog.close();
});
xpPotionConfirm.drink.addEventListener('click', () => {
  const potionId = pendingXpPotionId;
  pendingXpPotionId = null;
  xpPotionConfirm.dialog.close();
  if (!potionId || !localInventory.slots?.some(stack => stack?.itemId === potionId && stack.quantity > 0)) return;
  sendPlayerCommand({ type:'action', name:'consumeXpPotion', itemId:potionId });
});
xpPotionConfirm.dialog.addEventListener('close', () => { pendingXpPotionId = null; });
ui.inventoryEquip.addEventListener('click', () => {
  const index = inventorySelectionIndex;
  if (!Number.isInteger(index) || index < 0 || index >= localInventory.slots.length || !localInventory.slots?.[index]) return;
  const selected = localInventory.slots[index];
  if (selected.itemId.startsWith('xpPotion')) {
    if (openXpPotionConfirmation(selected.itemId)) return;
    sendPlayerCommand({ type:'action', name:'consumeXpPotion', itemId:selected.itemId }); return;
  }
  const target = index < 9
    ? localInventory.slots.findIndex((candidate, slot) => slot >= 9 && !candidate)
    : localInventory.selectedSlot || 0;
  if (target < 0) return;
  moveInventorySlot(index, target);
});
ui.sound.addEventListener('click', toggleSound);
ui.authSound.addEventListener('click', toggleSound);
document.addEventListener('pointerdown', unlockDefaultSound, true);
document.addEventListener('keydown', unlockDefaultSound, true);
canvas.addEventListener('click', setWalkDestination);
canvas.addEventListener('pointermove', previewRoomFurniture);
canvas.addEventListener('pointerleave', () => { roomPlacementPreview = null; });
const dimensionDestinations=document.querySelector('#dimension-destinations');
function currentTutorialGuide(){
  if(!worldDimensionId.startsWith('arrival-'))return null;
  return dimensionList.find(dimension=>dimension.id===worldDimensionId)?.guide||null;
}
function nearestTutorialGuide(){
  const guide=currentTutorialGuide();
  if(worldLocation!=='clearing'||!guide)return null;
  const distance=Math.hypot(localPosition.x-guide.x,localPosition.y-guide.y);
  return distance<=1.7&&hasClearInteractionPath(localPosition,guide,{fires:[...fires.values()],targetRadius:.25})
    ?{...guide,distance}:null;
}
function drawArrivalTutorialGuide(){
  if(worldLocation!=='clearing'||!worldDimensionId.startsWith('arrival-')||!arrivalTutorial)return;
  // Let the fire-to-avatar camera pan finish before introducing tutorial copy.
  if(arrivalCinematicAge()<ARRIVAL_CAMERA_HOLD_MS+ARRIVAL_CAMERA_PAN_MS+350)return;
  const fire=dimensionList.find(item=>item.id===worldDimensionId)?.campfire;
  if(!fire)return;
  const target=point(fire.x,fire.y),player=point(localPosition.x,localPosition.y);
  const distance=Math.hypot(localPosition.x-fire.x,localPosition.y-fire.y);
  ctx.save();
  // A small directional marker guides back to an offscreen hearth without a line across the scene.
  if(distance>5.2&&(target.x<32||target.x>viewWidth-32||target.y<190||target.y>viewHeight-60)){
    const dx=target.x-player.x,dy=target.y-player.y,angle=Math.atan2(dy,dx);
    const reach=Math.min((viewWidth/2-36)/Math.max(1,Math.abs(dx)),(viewHeight/2-190)/Math.max(1,Math.abs(dy)));
    const x=player.x+dx*Math.max(0,Math.min(1,reach)),y=player.y+dy*Math.max(0,Math.min(1,reach));
    ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#d5b478';
    ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-4,-4);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

function drawArrivalSprig(time){
  const target=arrivalTutorial?.phase==='find'?arrivalTutorial.target:null;
  if(worldLocation!=='clearing'||!worldDimensionId.startsWith('arrival-')||!target)return;
  const p=point(target.x,target.y),bob=reducedMotion?0:Math.sin(time*3.2)*2*spriteScale;
  ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y+bob));ctx.globalCompositeOperation='screen';
  const glow=ctx.createRadialGradient(0,-7*spriteScale,1,0,-7*spriteScale,25*spriteScale);
  glow.addColorStop(0,'rgba(197,255,225,.72)');glow.addColorStop(.35,'rgba(114,241,199,.27)');glow.addColorStop(1,'rgba(114,241,199,0)');
  ctx.fillStyle=glow;ctx.fillRect(-25*spriteScale,-32*spriteScale,50*spriteScale,50*spriteScale);
  ctx.globalCompositeOperation='source-over';ctx.fillStyle='#a87448';ctx.fillRect(-2*spriteScale,-8*spriteScale,13*spriteScale,2*spriteScale);
  ctx.fillStyle='#d0a16a';ctx.fillRect(3*spriteScale,-9*spriteScale,7*spriteScale,1*spriteScale);
  ctx.fillStyle='#9af0be';ctx.beginPath();ctx.moveTo(1*spriteScale,-9*spriteScale);ctx.lineTo(-6*spriteScale,-15*spriteScale);ctx.lineTo(2*spriteScale,-14*spriteScale);ctx.fill();
  ctx.fillStyle='#c4ffd9';ctx.beginPath();ctx.moveTo(5*spriteScale,-9*spriteScale);ctx.lineTo(11*spriteScale,-15*spriteScale);ctx.lineTo(5*spriteScale,-13*spriteScale);ctx.fill();
  const t=performance.now()/1000;ctx.fillStyle='#fff2ae';
  for(let i=0;i<4;i++){const a=t*1.2+i*Math.PI/2,r=(8+Math.sin(t*2+i)*2)*spriteScale;ctx.globalAlpha=.7;ctx.fillRect(Math.round(Math.cos(a)*r),Math.round(-12*spriteScale+Math.sin(a)*r),Math.max(1,spriteScale),Math.max(1,spriteScale));}
  ctx.restore();
}

function syncArrivalCinematic(){
  if(worldLocation!=='clearing'||!worldDimensionId.startsWith('arrival-')){
    arrivalSkyBrand.hidden=true;arrivalCinematicDimension='';arrivalCinematicStartedAt=0;arrivalCinematicElapsedMs=0;arrivalCinematicLastFrameAt=0;arrivalThunderPending=false;return;
  }
  if(!sceneReady||!loadingScreen.hidden){
    arrivalSkyBrand.hidden=true;arrivalCinematicDimension='';arrivalCinematicStartedAt=0;arrivalCinematicElapsedMs=0;arrivalCinematicLastFrameAt=0;arrivalThunderPending=false;return;
  }
  if(arrivalCinematicDimension!==worldDimensionId){
    arrivalCinematicDimension=worldDimensionId;arrivalCinematicStartedAt=performance.now();arrivalCinematicElapsedMs=0;arrivalCinematicLastFrameAt=arrivalCinematicStartedAt;arrivalThunderPlayed=false;arrivalThunderPending=false;arrivalChargePlayed=false;
    return;
  }
  const now=performance.now(),delta=now-arrivalCinematicLastFrameAt;
  arrivalCinematicElapsedMs+=Math.max(0,Math.min(50,delta));arrivalCinematicLastFrameAt=now;
}
function arrivalCinematicAge(){return arrivalCinematicStartedAt?arrivalCinematicElapsedMs-ARRIVAL_SKY_DURATION_MS:Infinity;}
function arrivalCameraShake(){
  return arrivalCinematicStartedAt?arrivalImpactShake(arrivalCinematicAge(),reducedMotion):null;
}
const arrivalRayFrames=new Map();
function arrivalRayFrame(index){
  if(arrivalRayFrames.has(index))return arrivalRayFrames.get(index);
  const layer=document.createElement('canvas');layer.width=CAMPFIRE_SKY_RAYS_FRAME_WIDTH;layer.height=CAMPFIRE_SKY_RAYS_FRAME_HEIGHT;
  const paint=layer.getContext('2d');
  paint.drawImage(campfireSkyRaysImage,index*layer.width,0,layer.width,layer.height,0,0,layer.width,layer.height);
  // Feather branches that meet an atlas edge instead of exposing the rectangular crop.
  paint.globalCompositeOperation='destination-in';
  const edge=paint.createLinearGradient(0,0,layer.width,0);
  edge.addColorStop(0,'#00000000');edge.addColorStop(.12,'#000000');edge.addColorStop(.88,'#000000');edge.addColorStop(1,'#00000000');
  paint.fillStyle=edge;paint.fillRect(0,0,layer.width,layer.height);
  arrivalRayFrames.set(index,layer);return layer;
}
function drawArrivalSkyRays(firePoint, age) {
  if (!campfireSkyRaysImage?.naturalWidth || !Number.isFinite(age)) return;
  const frameWidth = campfireSkyRaysImage.naturalWidth / CAMPFIRE_SKY_RAYS_FRAME_COUNT;
  if (!Number.isInteger(frameWidth) || campfireSkyRaysImage.naturalHeight < CAMPFIRE_SKY_RAYS_FRAME_HEIGHT) return;
  const reveal = Math.max(0, Math.min(1, (age - 690) / 190));
  const fade = Math.max(0, Math.min(1, (ARRIVAL_LIGHTNING_IMPACT_MS + 320 - age) / 200));
  const strength = Math.min(reveal, fade);
  if (strength <= 0) return;
  // Hold the first grounded impact pose, then fade it; later atlas frames are
  // separated residual sparks that look like a second light source under the bolt.
  const frameIndex = Math.min(8, campfireSkyRaysFrameIndex((age - 690) / 1000, reducedMotion));
  // The upper endpoint stays beyond the viewport, so the bolt descends from the sky.
  const height=Math.max(220,firePoint.y+48*spriteScale);
  const width=height*(frameWidth/CAMPFIRE_SKY_RAYS_FRAME_HEIGHT);
  const left=Math.round(firePoint.x-width/2),top=Math.round(firePoint.y-height),frame=arrivalRayFrame(frameIndex);
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalCompositeOperation='lighter';
  // Shadow emission is attached to the sprite and can extend outside its atlas cell.
  ctx.globalAlpha=strength*.85;ctx.shadowColor='#b8eadc';ctx.shadowBlur=24*spriteScale;
  ctx.drawImage(frame,left,top,Math.round(width),Math.round(height));
  ctx.shadowBlur=0;ctx.globalAlpha=strength;
  ctx.drawImage(frame,left,top,Math.round(width),Math.round(height));
  ctx.restore();
}
function drawArrivalCinematicOverlay(){
  if(!arrivalCinematicStartedAt||worldLocation!=='clearing'||!worldDimensionId.startsWith('arrival-'))return;
  const age=arrivalCinematicAge();
  if(age<0){
    const skyAge=age+ARRIVAL_SKY_DURATION_MS;
    // Hide the pre-rendered world until the sky's descent reveals it.
    ctx.save();ctx.globalAlpha=1-arrivalSkyState(skyAge).descent;
    ctx.fillStyle='#000';ctx.fillRect(0,0,viewWidth,viewHeight);ctx.restore();
    const sky=drawArrivalSky(ctx,viewWidth,viewHeight,skyAge,reducedMotion);
    arrivalSkyBrand.hidden=false;arrivalSkyBrand.style.opacity=String(sky.logo);
    return;
  }
  arrivalSkyBrand.hidden=true;
  arrivalWordmark?.removeAttribute('style');
  if(age>=690&&!arrivalChargePlayed)playArrivalCharge();
  if(age>=ARRIVAL_LIGHTNING_IMPACT_MS&&!arrivalThunderPlayed)playArrivalThunder();
  if(age>=3800)return;
  const impactAge=age-ARRIVAL_LIGHTNING_IMPACT_MS;
  if(!reducedMotion&&impactAge>=0&&impactAge<170){
    ctx.save();ctx.globalAlpha=.14*(1-impactAge/170);ctx.fillStyle='#dfefe7';ctx.fillRect(0,0,viewWidth,viewHeight);ctx.restore();
  }
  ctx.save();ctx.globalAlpha=1;
  if(age>=1500){
    ctx.globalAlpha=Math.min(1,(age-1500)/220);ctx.textAlign='center';ctx.textBaseline='top';ctx.font=`bold ${Math.max(14,Math.round(17*spriteScale))}px monospace`;
    ctx.fillStyle='#e7dfc1';ctx.shadowColor='#b8f2dc';ctx.shadowBlur=8*spriteScale;
    ctx.fillText('BREU',viewWidth/2,Math.max(24,viewHeight*.075));
  }
  const fire=dimensionList.find(item=>item.id===worldDimensionId)?.campfire;
  const firePoint=fire?point(fire.x,fire.y):{x:viewWidth/2,y:viewHeight/2};
  if(age>=690&&age<ARRIVAL_LIGHTNING_IMPACT_MS+320&&fire){
    // The atlas contains its own emission. Its anchor lands on the crossed logs.
    drawArrivalSkyRays(firePoint,age);
  }
  ctx.restore();
}
function updateArrivalTutorialPanel(){
  if(!arrivalUi.panel)return;
  const active=worldLocation==='clearing'&&worldDimensionId.startsWith('arrival-')&&Boolean(arrivalTutorial);
  ui.shell.classList.toggle('arrival-tutorial-mode',active);
  const cinematicAge=arrivalCinematicAge();
  ui.shell.classList.toggle('arrival-cinematic-active',active&&(!Number.isFinite(cinematicAge)||cinematicAge<3800));
  ui.shell.classList.toggle('arrival-tutorial-chat-step',active&&arrivalTutorial.phase==='chat');
  ui.shell.classList.toggle('arrival-tutorial-appearance-step',active&&arrivalTutorial.phase==='appearance');
  arrivalUi.panel.hidden=!active;
  if(!active)return;
  if(arrivalTutorialPhaseSeen!==arrivalTutorial.phase){
    arrivalTutorialPhaseSeen=arrivalTutorial.phase;arrivalPhaseStartedAt=performance.now();arrivalTypingText='';
    if(arrivalTutorial.phase==='chat')requestAnimationFrame(()=>{if(authenticated && arrivalTutorial?.phase === 'chat')ui.chatText?.focus({preventScroll:true});});
  }
  const fire=dimensionList.find(item=>item.id===worldDimensionId)?.campfire;
  const distance=fire?Math.hypot(localPosition.x-fire.x,localPosition.y-fire.y):Infinity;
  if(arrivalTutorial.phase==='welcome'&&!arrivalGuideAsked&&distance<5.2){arrivalGuideAsked=true;clearDimensionTransitMovement();sendPlayerCommand({type:'action',name:'talkTutorialGuide'});}
  const walkingDeeper=localMoving&&distance>=16.5;
  if(!arrivalDepartureAsked&&!arrivalTutorial.completed&&walkingDeeper){arrivalDepartureAsked=true;  arrivalTravelPending=true;if(teleportTravelReady())requestArrivalTravel();}
  arrivalLastDistance=distance;
  const steps={
    welcome:['O BREU','A chama despertou','Clique ou toque no chão para se aproximar. Para seguir sem tutorial, caminhe para a escuridão.'],
    lesson:['LIÇÃO · 01','Movimento','Use W, A, S, D, as setas ou clique no chão. Dê alguns passos para a fogueira mostrar a próxima lição.'],
    chat:['LIÇÃO · 02','Sua primeira mensagem','Escreva uma mensagem no campo que apareceu. Pode dizer: “A chama me guia.”'],
    appearance:['LIÇÃO · 03','Seu personagem','Abra Configurações e escolha Aparência. Mude uma opção e aplique para seguir.'],
    find:['LIÇÃO · 04','Um pequeno presente','A fagulha deixou um galho e uma folha no chão. Aproxime-se do brilho e clique nele para recolher.'],
    ready:['CAMINHO ABERTO','O Bosque das Brasas','A fagulha deixou um galho e uma folha. O teletransporte para o bosque já está começando.'],
  }[arrivalTutorial.phase]||['PRÓLOGO','O Breu','Aproxime-se da fogueira para aprender ou caminhe para a escuridão para seguir.'];
  const [step,title,text]=steps;
  arrivalUi.step.textContent=step;
  arrivalUi.title.textContent=title;
  if(arrivalTypingText!==text){arrivalTypingText=text;arrivalUi.text.textContent='';}
  if(arrivalUi.text.textContent.length<text.length)arrivalUi.text.textContent=text.slice(0,Math.min(text.length,arrivalUi.text.textContent.length+2));
  arrivalUi.next.hidden=true;arrivalUi.skip.hidden=true;
  if(ui.chatText){
    ui.chatText.placeholder=arrivalTutorial.phase==='chat'?'Escreva: A chama me guia…':(ui.chatText.dataset.tutorialPlaceholder||'Diga algo a quem está por perto…');
    ui.chatText.dataset.tutorialPlaceholder||='Diga algo a quem está por perto…';
  }
}
function requestArrivalTravel(){
  if(!arrivalTravelPending)return;
  if(!teleportTravelReady())return;
  const destination=dimensionList.find(dimension=>dimension.id==='surface');
  if(!destination){announce('A conexão ainda está preparando o caminho ao bosque.');return;}
  arrivalTravelPending=false;
  dimensionTravelStarting=true;dimensionTravelRequestPending=true;
  clearDimensionTransitMovement();
  teleportEffects.beginLocal(selfId,destination.name);
  pendingDimensionTravelRequestId=++dimensionTravelRequestSequence;
  updateDimensionTravel(dimensionList,worldDimensionId);
  if(!send({type:'dimensionTravel',dimensionId:destination.id,requestId:pendingDimensionTravelRequestId})){
    dimensionTravelRequestPending=false;pendingDimensionTravelRequestId=null;dimensionTravelStarting=false;
    teleportEffects.cancelLocal();updateDimensionTravel(dimensionList,worldDimensionId);
    announce('A conexão caiu antes da viagem começar.');
  }
}
function scheduleDimensionCooldownRefresh(){
  if(dimensionTravelCooldownTimer)clearTimeout(dimensionTravelCooldownTimer);
  const refresh=()=>{
    dimensionTravelCooldownTimer=0;
    const remaining=Math.max(0,dimensionTravelCooldownUntil-clientServerTime()+300);
    for(let index=0;index<dimensionDestinations.children.length;index++){
      const button=dimensionDestinations.children[index],dimension=dimensionList[index];if(!button||!dimension)continue;
      button.textContent=remaining>0?`↗ ${dimension.name} · aguarde ${Math.ceil(remaining/1000)} s`:`↗ ${dimension.name} · ${dimension.universeId}`;
      button.disabled=(dimension.id===worldDimensionId&&worldLocation==='clearing')||dimensionTravelStarting||!teleportTravelReady()||remaining>0;
    }
    if(mapUi.dialog.open)requestWorldMapRedraw();
    if(remaining>0)dimensionTravelCooldownTimer=setTimeout(refresh,Math.min(1000,remaining));
  };
  refresh();
}
function updateDimensionTravel(list, currentId = worldDimensionId) {
  if (!Array.isArray(list)) return;
  dimensionList = list;
  scheduleDimensionVisualWarmup();
  const current = dimensionList.find(dimension => dimension.id === currentId);
  const travelDetails=document.querySelector('.dimension-travel');
  if(travelDetails)travelDetails.querySelector('summary').textContent='Destinos';
  if(dimensionDestinations){
    const fragment=document.createDocumentFragment();
    for(const dimension of dimensionList){
      const button=document.createElement('button');button.type='button';
      button.dataset.dimensionId=dimension.id;
      const cooldownRemaining=Math.max(0,dimensionTravelCooldownUntil-clientServerTime()+300);
      button.textContent=cooldownRemaining>0
        ?`↗ ${dimension.name} · aguarde ${Math.ceil(cooldownRemaining/1000)} s`
        :`↗ ${dimension.name} · ${dimension.universeId}`;
      button.disabled=(dimension.id===currentId&&worldLocation==='clearing')||dimensionTravelStarting||!teleportTravelReady()||cooldownRemaining>0;
      button.addEventListener('click',()=>{
        if(dimensionTravelStarting||dimensionTravelCooldownUntil>clientServerTime())return;
        travelDetails.open=false;
        dimensionTravelStarting=true;dimensionTravelRequestPending=true;clearDimensionTransitMovement();updateDimensionTravel(dimensionList,currentId);
        teleportEffects.beginLocal(selfId,dimension.name);
        pendingDimensionTravelRequestId=++dimensionTravelRequestSequence;
        if(!send({type:'dimensionTravel',dimensionId:dimension.id,requestId:pendingDimensionTravelRequestId})){
          dimensionTravelRequestPending=false;pendingDimensionTravelRequestId=null;dimensionTravelStarting=false;teleportEffects.cancelLocal();
          updateDimensionTravel(dimensionList,worldDimensionId);
          placePanel.notice('A conexão caiu antes da viagem começar.');
        }
      });
      fragment.append(button);
    }
    dimensionDestinations.replaceChildren(fragment);
  }
}
ui.roomBuildToggle.addEventListener('click',()=>{
  const opening=ui.roomBuildOptions.hidden;ui.roomBuildOptions.hidden=!opening;
  ui.roomBuildToggle.setAttribute('aria-expanded',String(opening));
  if(!opening&&roomBuildMode){roomBuildMode=null;roomMovingId=null;roomPlacementPreview=null;updateRoomBuildButtons();}
  announce(opening?'Construção aberta. Escolha um móvel ou uma ação.':'Construção fechada.');
});
document.querySelector('#room-object-close').addEventListener('click',()=>{roomSelectedId=null;ui.roomObjectCard.hidden=true;});
ui.roomMove.addEventListener('click', () => setRoomBuildMode('move'));
ui.roomCategory.addEventListener('change',()=>populateRoomFurnitureCategory());
ui.roomKind.addEventListener('change',()=>{roomBuildMode=null;setRoomBuildMode('place');});
ui.roomPlace.addEventListener('click', () => setRoomBuildMode('place'));
ui.roomRotate.addEventListener('click', () => setRoomBuildMode('rotate'));
ui.roomRemove.addEventListener('click', () => setRoomBuildMode('remove'));
ui.fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await ui.shell.requestFullscreen();
  } catch {
    announce('O navegador não permitiu abrir em tela inteira.');
  }
});
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  ui.fullscreen.setAttribute('aria-pressed', String(active));
  ui.fullscreen.title = active ? 'Sair da tela inteira' : 'Abrir em tela inteira';
  const label = ui.fullscreen.querySelector('span');
  if (label) label.textContent = active ? 'Sair da tela inteira' : 'Tela inteira';
});
ui.chatText.addEventListener('input', () => {
  const previous = ui.chatText.value;
  const limited = limitChatInput(previous);
  if (previous === limited) return;
  const cursor = ui.chatText.selectionStart;
  const nextCursor = cursor === null ? limited.length : limitChatInput(previous.slice(0, cursor)).length;
  ui.chatText.value = limited;
  ui.chatText.setSelectionRange(nextCursor, nextCursor);
});
ui.chatText.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
});
ui.chatForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = normalizeChatMessage(ui.chatText.value);
  if (!text) { announce('Escreva algo para quem está por perto.'); return; }
  if (!sendPlayerCommand({ type: 'chat', text })) return;
  ui.chatText.value = '';
  canvas.focus({ preventScroll: true });
});

function showAuthStatus(message, success = false) {
  ui.authStatus.textContent = message;
  ui.authStatus.classList.toggle('success', success);
  ui.authStatus.classList.toggle('is-loading', message === 'Chegando à Clareira…');
}

function applyDailyEntryCopy() {
  let copy = ENTRY_COPY_VARIANTS[0];
  try { copy = getDailyEntryCopy(window.localStorage); } catch {}
  for (const [key, value] of Object.entries(copy)) {
    const element = document.querySelector(`[data-entry-copy="${key}"]`);
    if (element) element.textContent = value;
  }
}

function animateEntryScreen() {
  startLoginAnimation();
  if (!motion || reducedMotion) return;
  entryTimeline?.kill();
  entryTimeline = motion.timeline({ defaults: { ease: 'power2.out' } });
  entryTimeline
    .fromTo('#auth-gate', { autoAlpha: 0, y: 10, scale: 0.995 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, clearProps: 'all' }, 0)
    .fromTo('.auth-topbar', { autoAlpha: 0, y: -7 }, { autoAlpha: 1, y: 0, duration: 0.3, clearProps: 'all' }, 0.04)
    .fromTo('.auth-stage', { autoAlpha: 0, y: 9 }, { autoAlpha: 1, y: 0, duration: 0.4, clearProps: 'all' }, 0.09)
    .fromTo('.auth-scene', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.36, clearProps: 'all' }, 0.19)
    .fromTo('.auth-panel', { autoAlpha: 0, x: 9 }, { autoAlpha: 1, x: 0, duration: 0.36, clearProps: 'all' }, 0.21)
    .fromTo('.auth-footer', { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration: 0.28, clearProps: 'all' }, 0.3);

}

function selectAuthMode(mode) {
  const guest = mode === 'guest';
  document.querySelector('.auth-scene').hidden = !guest;
  document.querySelector('.auth-panel').hidden = guest;
  document.querySelector('.auth-panel-heading h2').textContent = mode === 'register' ? 'Crie seu lugar na Clareira' : 'Entrar na minha conta';
  for (const tab of document.querySelectorAll('[data-auth-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.authTab === mode));
  const forms = [...document.querySelectorAll('[data-auth-form="login"], [data-auth-form="register"]')];
  for (const form of forms) {
    form.hidden = form.dataset.authForm !== mode;
    if (form.dataset.authForm === mode && motion && !reducedMotion) {
      motion.killTweensOf(form);
      motion.fromTo(form, { autoAlpha: 0, y: 9, filter: 'blur(3px)' }, {
        autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.28, ease: 'power2.out', clearProps: 'all',
      });
    }
  }
  showAuthStatus('');
}

async function enterGame(profile) {
  stopLoginAnimation();
  entryTimeline?.kill();
  entryTimeline = null;
  currentProfile = profile;
  if (loginGateWasRevealed && !firstWorldSceneLoaded) {
    prepareFirstWorldLoading();
    loadingScreen.hidden = false;
    ui.shell.inert = true;
    ui.shell.setAttribute('aria-busy', 'true');
    // The verified cache and the just-authorized session are already complete.
    // Show each result before starting the remaining character and scene work.
    renderLoadingMini('files', 100, 'complete', 'determinate', 'Arquivos conferidos');
    await new Promise(resolve => setTimeout(resolve, INITIAL_LOADING_COMPLETE_HOLD_MS + (reducedMotion ? 0 : INITIAL_LOADING_MINI_FILL_MS)));
    renderLoadingMini('session', 100, 'complete', 'determinate', 'Sessão verificada');
    await new Promise(resolve => setTimeout(resolve, INITIAL_LOADING_COMPLETE_HOLD_MS + (reducedMotion ? 0 : INITIAL_LOADING_MINI_FILL_MS)));
  }
  // Prepare audio while the world is loading so the first movement input only
  // resumes the context instead of constructing its rendering pipeline.
  try {
    if(!audioContext&&(ui.sound.getAttribute('aria-pressed')==='true'||ui.authSound?.getAttribute('aria-pressed')==='true'))
      ambience=createAmbience();
    if (ui.sound.getAttribute('aria-pressed') === 'true' && !document.hidden) fadeSoundBuses(true);
  } catch(error) { console.warn('Áudio indisponível; a entrada continua sem som.',error); }
  finishInitialSessionCheck();
  authenticated = true;
  updateLoadingMini('character',0,'active','indeterminate','Conectando ao local');
  clearStaffTools();
  void refreshStaffCapabilities();
  ui.name.value = profile.username || profile.displayName || '';
  ui.name.hidden = profile.guest === true;
  ui.nameLabel.hidden = profile.guest === true;
  ui.sessionLabel.textContent = profile.guest ? 'VISITANTE' : `@${profile.username}`;
  ui.shell.classList.add('is-authenticated');
  document.body.classList.add('in-world');
  resizeCanvas();
  connect();
  if (!frameStarted) { frameStarted = true; requestAnimationFrame(frame); }
}

async function sendAuthForm(form, endpoint) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.classList.add('is-loading');
  button.setAttribute('aria-busy', 'true');
  showAuthStatus('Chegando à Clareira…');
  try {
    const payload = Object.fromEntries(new FormData(form));
    const response = await fetch(`/dev/auth/${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não consegui entrar agora. Tente novamente.');
    await enterGame(result.profile);
  } catch (error) { showAuthStatus(error.message || 'A conexão caiu. Tente novamente.'); }
  finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
  }
}

for (const tab of document.querySelectorAll('[data-auth-tab]')) tab.addEventListener('click', () => selectAuthMode(tab.dataset.authTab));
for (const shortcut of document.querySelectorAll('[data-auth-shortcut]')) shortcut.addEventListener('click', () => {
  const mode = shortcut.dataset.authShortcut;
  selectAuthMode(mode);
  document.querySelector(mode === 'register' ? '#register-username' : '#login-username')?.focus({ preventScroll: true });
});
for (const back of document.querySelectorAll('[data-auth-back]')) back.addEventListener('click', () => {
  selectAuthMode('guest');
  document.querySelector('[data-auth-shortcut="login"]')?.focus({ preventScroll: true });
});
async function enterFullscreenFromGesture(){try{if(!document.fullscreenElement)await ui.shell.requestFullscreen();}catch{/* Browser denied fullscreen; keep the game in its viewport. */}}
document.querySelector('#guest-form').addEventListener('submit', event => { event.preventDefault(); void enterFullscreenFromGesture(); void sendAuthForm(event.currentTarget, 'guest'); });
document.querySelector('#login-form').addEventListener('submit', event => { event.preventDefault(); void enterFullscreenFromGesture(); void sendAuthForm(event.currentTarget, 'login'); });
document.querySelector('#register-form').addEventListener('submit', event => { event.preventDefault(); void enterFullscreenFromGesture(); void sendAuthForm(event.currentTarget, 'register'); });

ui.logout.addEventListener('click', async () => {
  ui.logout.disabled = true;
  try {
    await fetch('/dev/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  } finally {
    authenticated = false;
    sceneReady = false; ++loadingGeneration;
    initialSceneRevealed = false;
    firstWorldSceneLoaded = false;
    loginGateWasRevealed = true;
    initialLoadingPercentValue = 0;
    initialLoadingPercentTarget = 0;
    loadingProgressBar.setAttribute('aria-valuenow', '0');
    loadingProgressBar.style.setProperty('--loading-progress', '0%');
    currentProfile = null;
    clearStaffTools();
    clearTimeout(reconnectTimer);
    const previousSocket = socket;
    socket = null;
    previousSocket?.close(1000, 'logout');
    clearMovement();
    teleportEffects.clear();
    arrivalTutorial = null;
    arrivalTravelPending = false; arrivalGuideAsked = false; arrivalDepartureAsked = false;
    arrivalTypingText = ''; arrivalLastDistance = Infinity; arrivalTutorialPhaseSeen = ''; arrivalPhaseStartedAt = 0;
    arrivalCinematicDimension = ''; arrivalCinematicStartedAt = 0; arrivalCinematicElapsedMs = 0; arrivalCinematicLastFrameAt = 0;
    arrivalThunderPending = false; arrivalThunderPlayed = false; arrivalChargePlayed = false;
    arrivalSkyBrand.hidden = true;
    updateArrivalTutorialPanel();
    if (ui.chatText?.dataset.tutorialPlaceholder) ui.chatText.placeholder = ui.chatText.dataset.tutorialPlaceholder;
    stopAmbientEvents();
    if (ambience && audioContext) {
      for (const source of [...ambience.campfireSources.values()]) retireCampfireAudioSource(source, audioContext.currentTime);
      fadeSoundBuses(false);
    }
    ui.shell.classList.remove('is-authenticated');
    document.body.classList.remove('in-world');
    selectAuthMode('guest');
    await revealLoginScreen();
    showAuthStatus('Você saiu da clareira.', true);
    ui.logout.disabled = false;
  }
});

applyDailyEntryCopy();

async function restoreSession() {
  startInitialLoadStage('session');
  beginSceneLoading('Verificando sua sessão…');
  let attempt = 0;
  while (!authenticated) {
    try {
      const response = await fetch('/dev/auth/me', {cache:'no-store', signal:AbortSignal.timeout(15000)});
      if (response.ok) {
        const result = await response.json();
        await showInitialSessionComplete();
        await enterGame(result.profile); return;
      }
      if (response.status === 401) { await showInitialSessionComplete(); await revealLoginScreen(); return; }
      throw new Error(`session unavailable (${response.status})`);
    } catch (error) {
      if(authenticated){
        console.warn('Falha ao iniciar a cena após verificar a sessão.',error);
        showLoadingFailure('Sessão confirmada. Não foi possível preparar o local; tente esta etapa novamente.');
        return;
      }
      if (navigator.onLine === false) {
        if (initialLoadingPercentFrame !== null) cancelAnimationFrame(initialLoadingPercentFrame);
        initialLoadingPercentFrame = null;
        loadingScreen.dataset.phase = 'error';
        loadingScreen.dataset.progressMode = 'indeterminate';
        loadingProgressBar.removeAttribute('aria-valuenow');
        loadingProgressBar.setAttribute('aria-valuetext', 'Sem conexão. Aguardando a internet voltar.');
        loadingPercent.hidden = true;
        loadingPercent.setAttribute('aria-hidden', 'true');
        updateLoadingMini('session', 0, 'error', 'indeterminate', 'Sem conexão');
        loadingMessage.textContent = 'Sem conexão. O carregamento continuará quando a internet voltar.';
        loadingCaption.textContent = loadingMessage.textContent;
        loadingReload.hidden = true;
        await new Promise(resolve => {
          const online = () => { window.removeEventListener('online', online); resolve(); };
          window.addEventListener('online', online, { once: true });
          if (navigator.onLine !== false) online();
        });
        loadingScreen.dataset.phase = 'session';
        window.__clareiraLoadingPhrase?.();
        updateLoadingProgress(null);
        continue;
      }
      if (attempt >= 5) {
        console.warn('Não foi possível confirmar a sessão após as tentativas automáticas.', error);
        showLoadingFailure('Erro ao verificar sua sessão. Confira a conexão e tente recarregar.');
        return;
      }
      const wait = Math.min(900 * 2 ** Math.min(attempt, 4), 12000);
      window.__clareiraLoadingPhrase?.();
      updateLoadingMini('session', 0, 'active', 'indeterminate', `Tentativa ${attempt + 1}`);
      loadingCaption.textContent = 'Reconectando com segurança';
      updateLoadingProgress(null);
      console.warn('Falha temporária ao verificar a sessão; nova tentativa automática.', error);
      await new Promise(resolve => setTimeout(resolve, wait));
      attempt += 1;
    }
  }
}
arrivalUi.skip?.addEventListener('click',()=>sendPlayerCommand({type:'action',name:'arrivalTutorialChoice',choice:'skip'}));
arrivalUi.next?.addEventListener('click',()=>{
  if(arrivalTutorial?.phase==='ready')sendPlayerCommand({type:'action',name:'arrivalTutorialChoice',choice:'finish'});
  else sendPlayerCommand({type:'action',name:'arrivalTutorialChoice',choice:'next'});
});
async function showInitialSessionComplete() {
  finishInitialSessionCheck();
  if (loadingScreen.hidden || loadingScreen.dataset.context !== 'login') return;
  holdingInitialSession = true;
  try {
    updateLoadingMini('session', 100, 'complete', 'determinate', 'Sessão verificada');
    await new Promise(resolve => setTimeout(resolve, INITIAL_LOADING_COMPLETE_HOLD_MS + (reducedMotion ? 0 : INITIAL_LOADING_MINI_FILL_MS)));
  } finally { holdingInitialSession = false; }
}
void restoreSession();

const cameraZoomInput = document.querySelector('#camera-zoom');
const cameraZoomValue = document.querySelector('#camera-zoom-value');
function commitCameraZoom(next){
  if(pendingCameraZoomAt)performanceTelemetry.observeZoomWait(performance.now()-pendingCameraZoomAt);
  pendingCameraZoomAt=0;
  pendingCameraZoom=null;cameraZoomPercent=next;
  cameraZoomInput.value=String(next);cameraZoomValue.value=`${next}%`;
  try{window.localStorage.setItem(CAMERA_ZOOM_STORAGE_KEY,String(next));}catch{}
  if(resizeCanvas()&&authenticated)sendViewport();
}
if (cameraZoomInput && cameraZoomValue) {
  cameraZoomInput.value = String(cameraZoomPercent);
  cameraZoomValue.value = `${cameraZoomPercent}%`;
  function setCameraZoom(value) {
    const next = Math.max(70, Math.min(125, Math.round(Number(value) / 5) * 5));
    if (next === cameraZoomPercent) {pendingCameraZoom=null;pendingCameraZoomAt=0;cameraZoomInput.value=String(next);cameraZoomValue.value=`${next}%`;return;}
    pendingCameraZoom=next;pendingCameraZoomAt=performance.now();
    cameraZoomInput.value = String(next);
    cameraZoomValue.value = `${next}%`;
    if(!sceneReady||worldLocation!=='clearing')commitCameraZoom(next);
    if(authenticated)draw(3);
  }
  cameraZoomInput.addEventListener('input', () => setCameraZoom(cameraZoomInput.value));

  canvas.addEventListener('wheel', event => {
    if (!authenticated || worldLocation !== 'room' || panels.isOpen || !sceneReady) return;
    event.preventDefault();
    setCameraZoom(cameraZoomPercent + (event.deltaY < 0 ? 5 : -5));
  }, { passive: false });

  canvas.addEventListener('pointerdown', event => {
    if (!authenticated || worldLocation !== 'room' || panels.isOpen || event.pointerType !== 'touch') return;
    roomCameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (roomCameraPointers.size === 2) {
      const [first, second] = [...roomCameraPointers.values()];
      roomCameraPinch = { distance: Math.hypot(first.x - second.x, first.y - second.y), zoom: cameraZoomPercent };
    }
  }, { passive: true });
  canvas.addEventListener('pointermove', event => {
    if (!roomCameraPointers.has(event.pointerId)) return;
    roomCameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!roomCameraPinch || roomCameraPointers.size < 2) return;
    const [first, second] = [...roomCameraPointers.values()];
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    if (roomCameraPinch.distance > 0 && distance > 0) {
      setCameraZoom(roomCameraPinch.zoom * distance / roomCameraPinch.distance);
      ignoreRoomCanvasClickUntil = performance.now() + 500;
    }
    event.preventDefault();
  }, { passive: false });
  const releaseRoomCameraPointer = event => {
    if (!roomCameraPointers.delete(event.pointerId)) return;
    if (roomCameraPinch) {
      roomCameraPinch = null;
      ignoreRoomCanvasClickUntil = performance.now() + 500;
    }
  };
  canvas.addEventListener('pointerup', releaseRoomCameraPointer);
  canvas.addEventListener('pointercancel', releaseRoomCameraPointer);
}

const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
mobileMenuToggle.addEventListener('click', () => {
  const expanded = mobileMenuToggle.getAttribute('aria-expanded') !== 'true';
  mobileMenuToggle.setAttribute('aria-expanded', String(expanded));
  mobileMenuToggle.closest('.topbar').classList.toggle('menu-expanded', expanded);
  clearMovement();
});
const mobileHeader = mobileMenuToggle.closest('.topbar');
function closeMobileHeader({ restoreFocus = false } = {}) {
  mobileHeader.classList.remove('menu-expanded');
  mobileMenuToggle.setAttribute('aria-expanded', 'false');
  for (const menu of mobileHeader.querySelectorAll('.player-menu, .dimension-travel')) menu.open = false;
  if (restoreFocus) mobileMenuToggle.focus({ preventScroll: true });
}
mobileHeader.addEventListener('click', event => {
  const actionTarget = event.target.closest('button, a');
  if (!actionTarget || actionTarget === mobileMenuToggle) return;
  closeMobileHeader();
});
document.addEventListener('pointerdown', event => {
  if (!mobileHeader.contains(event.target)) closeMobileHeader();
});
// Compact menus stop a pending walk and never pass their touches to the world.
const compactMenus = [...document.querySelectorAll('.mobile-actions-menu, .player-menu, .dimension-travel')];
for (const menu of compactMenus) {
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    clearMovement();
    for (const other of compactMenus) if (other !== menu) other.open = false;
  });
}
document.addEventListener('pointerdown', event => {
  for (const menu of compactMenus) if (menu.open && !menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const headerWasOpen = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
    for (const menu of compactMenus) {
      if (menu.open) { menu.open = false; menu.querySelector('summary')?.focus(); }
    }
    if (headerWasOpen) {
      event.preventDefault();
      closeMobileHeader({ restoreFocus: true });
    }
  }
});
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => {
    if (button.dataset.action === 'context' || button.dataset.action === 'collect' || button.dataset.action === 'fire' || button.dataset.action === 'share' || button.dataset.action === 'sharpen' || button.dataset.action === 'craftPickaxe' || button.dataset.action === 'upgradeAxe' || button.dataset.action === 'upgradePickaxe' || button.dataset.action === 'buildBench' || button.dataset.action === 'buildKiln' || button.dataset.action === 'buildFurnace' || button.dataset.action === 'process' || button.dataset.action === 'processSticks' || button.dataset.action.startsWith('brewXpPotion') || button.dataset.action.startsWith('cast:')) action(button.dataset.action);
    if (button.dataset.action === 'emote') emote(button.dataset.emote);
    const menu = button.closest('.mobile-actions-menu');
    if (menu) menu.open = false;
  });
}

const runToggleButton = document.querySelector('[data-run-toggle]');
document.querySelector('[data-flight-rise]')?.addEventListener('click',()=>{if(flightPilotAllowed&&worldLocation==='clearing')flightTargetHeight=5;});
document.querySelector('[data-flight-land]')?.addEventListener('click',()=>{if(flightPilotAllowed)flightTargetHeight=0;});
document.querySelector('[data-flight-profile]')?.addEventListener('click',event=>{
  flightProfile=flightProfile==='controlled'?'smooth':'controlled';
  event.currentTarget.textContent=flightProfile==='smooth'?'Voo suave':'Voo controlado';
  event.currentTarget.setAttribute('aria-pressed',String(flightProfile==='smooth'));
});
runToggleButton.addEventListener('click', () => {
  if (panels.isOpen) return;
  touchRunEnabled = !touchRunEnabled;
  const label = touchRunEnabled ? 'Desativar corrida' : 'Ativar corrida';
  runToggleButton.setAttribute('aria-pressed', String(touchRunEnabled));
  runToggleButton.setAttribute('aria-label', label);
  runToggleButton.title = label;
});

// Read-only diagnostics for replayable movement/browser checks; no account data.
export function canApplyGameUpdate() {
  // A pause in input is not permission to discard an authenticated session.
  if(authenticated)return false;
  if (dimensionTravelStarting || dimensionTravelRequestPending || teleportEffects.active) return false;
  if (document.hidden || !loadingScreen.hidden || ui.logout.disabled
      || document.querySelector('#auth-gate button[aria-busy="true"]')) return false;
  const activeElement = document.activeElement;
  if (isTyping(activeElement) || activeElement?.isContentEditable
      || document.querySelector('dialog[open], details[open]')) return false;

  if (!authenticated) {
    return ![...document.querySelectorAll('#auth-gate input, #auth-gate textarea')]
      .some(input => input.value.length > 0);
  }

  if (!sceneReady || !predictionReady || socket?.readyState !== WebSocket.OPEN
      || pendingInputs.length > 0 || outboundInputs.length > 0 || walkPath.length > 0
      || keys.size > 0 || touchDirections.size > 0 || localMoving
      || ui.chatText.value.length > 0) return false;
  return Math.hypot(localPosition.vx || 0, localPosition.vy || 0) < .04;
}

export function inspectWildlifeMotion() {
  const now=performance.now();
  return [...wildlife.values()].map(animal=>({
    id:animal.id,speciesId:animal.speciesId,
    authoritative:{x:animal.x,y:animal.y},
    rendered:renderedWildlifePosition(animal,now),
    samples:wildlifePositions.get(animal.id)?.length||0,
  }));
}

export function inspectMovement(atTime = performance.now()) {
  const self = livePlayers.get(selfId);
  const inspectionNow = Number.isFinite(atTime) ? atTime : performance.now();
  const roomFurnitureRender=[...roomFurniture.values()].map(item=>{
    const pose=roomFurniturePose(item,inspectionNow),motion=roomFurnitureMotion.get(item.id);
    return {id:item.id,kind:item.kind,rotation:item.rotation||0,rendered:{x:pose.item.x,y:pose.item.y,baseZ:pose.item.baseZ||0},
      fromRotation:pose.fromRotation,progress:pose.progress,durationMs:motion?.duration||0,
      startedAt:motion?.startedAt??null};
  });
  const roomPreview=roomPlacementPreview?(()=>{
    const furniture=[...roomFurniture.values()].filter(item=>item.id!==roomMovingId);
    return {item:{...roomPlacementPreview},valid:(roomBuildMode==='move'||roomPlacedCount()<ROOM_FURNITURE_LIMIT)
      &&canPlaceRoomFurniture(roomPlacementPreview,furniture,[...livePlayers.values()],currentRoomLayout())};
  })():null;
  const litFires=[...fires.values()].filter(fire=>campfireFuelRatio(fire,inspectionNow)>0);
  const homeRenderOrder=RENDER_THINGS.findIndex(thing=>thing.type==='home');
  const cabinDepthAudit=RENDER_THINGS
    .map((thing,renderOrder)=>({thing,renderOrder}))
    .filter(({thing})=>thing.type==='home'||(thing.type==='tree'
      &&buildingTreeDepthAnchor(thing.tree,SHELTER_BOUNDS)))
    .map(({thing,renderOrder})=>({type:thing.type,id:thing.tree?.id||null,x:thing.x,y:thing.y,
      screen:thing.screen?{x:thing.screen.x,y:thing.screen.y}:null,
      naturalDepth:thing.x+thing.y,depth:(thing.sortX??thing.x)+(thing.sortY??thing.y),renderOrder,
      beforeHome:renderOrder<homeRenderOrder,anchored:Boolean(thing.type==='tree'&&buildingTreeDepthAnchor(thing.tree,SHELTER_BOUNDS))}));
  const roomDepthAudit=worldLocation==='room'?RENDER_THINGS
    .map((thing,renderOrder)=>({thing,renderOrder}))
    .filter(({thing})=>['room-fixture','room-counter','furniture','furniture-layer','furniture-cover','furniture-preview','self','player'].includes(thing.type))
    .map(({thing,renderOrder})=>({type:thing.type,id:thing.item?.id||thing.player?.id||thing.sortId||null,
      kind:thing.item?.kind||null,x:thing.x,y:thing.y,sortX:thing.sortX??thing.x,sortY:thing.sortY??thing.y,
      sortZ:thing.sortZ??thing.item?.baseZ??thing.player?.z??0,
      part:thing.part||null,depth:(thing.sortX??thing.x)+(thing.sortY??thing.y)+(thing.sortDepthOffset||0),renderOrder})) : [];
  const remotePlayers = [...livePlayers.values()].filter(player => player.id !== selfId).map(player => {
    const samples = remotePositions.get(player.id) || [];
    const playback = advanceRemotePlayback(remotePlayback.get(player.id), inspectionNow);
    const rendered = interpolatePosition(samples, playback.time, playback.maxExtrapolationMs) || player;
    const latestSample = samples.at(-1);
    return {
      id: player.id,
      authoritative: { x: player.x, y: player.y, vx: player.vx || 0, vy: player.vy || 0, moving: player.moving },
      rendered: { x: rendered.x, y: rendered.y, z: rendered.z || 0 },
      sampleAgeMs: latestSample ? inspectionNow - latestSample.time : null,
      sampleCount: samples.length,
      interpolationDelayMs: playback.delayMs,
      arrivalJitterMs: playback.jitterMs,
      networkDelayMs: playback.networkDelayMs,
    };
  });
  return { localId:selfId,objectCatalogRevision:objectCatalogRevision(),lightmaps:lightmapStats(),
    canvasPixelRatio,assetPreparation:contentAssets.stats(),cameraZoom:{current:cameraZoomPercent,requested:pendingCameraZoom},terrainRetention:{frames:terrainRetainedFrameCount,totalMs:Math.round(terrainRetainedTotalMs),maxMs:Math.round(terrainRetainedMaxMs),
      currentMs:terrainRetainedSince?Math.round(inspectionNow-terrainRetainedSince):0,cache:sceneArt.stats(),
      worldWarm:{readyCount:warmedWorldChunks.size,pendingCount:worldWarmQueue.length,last:worldWarmLast}},
    terrainPreparation:{incompleteVisibleFrames:terrainIncompleteVisibleFrames,
      incompleteVisibleTotalMs:Math.round(terrainIncompleteVisibleTotalMs),
      incompleteVisibleMaxMs:Math.round(Math.max(terrainIncompleteVisibleMaxMs,terrainIncompleteVisibleSince?inspectionNow-terrainIncompleteVisibleSince:0)),
      pendingChunks:sceneArt.stats().pendingTerrainChunks,lastQueueWorkMs:Math.round(lastTerrainQueueWorkMs*10)/10},
    readiness:{documentVisible:!document.hidden,loading:!loadingScreen.hidden,authenticated,sceneReady,predictionReady,connected:socket?.readyState===WebSocket.OPEN},
    loading:{context:loadingScreen.dataset.context,phase:loadingScreen.dataset.phase,percent:loadingPercent.textContent,
      tasks:loadingProgress?.snapshot(),pendingTasks:loadingProgress?.pendingTasks()||[],taskIds:loadingProgress?.taskIds()||[]},
    teleport:{active:teleportEffects.active,local:teleportEffects.localTransit,
      selfHidden:teleportEffects.shouldHide(selfId,worldDimensionId,clientServerTime()),timings:teleportEffects.timings},
    walkTarget:walkPath.at(-1),nextWaypoint:walkPath[0],walkPath:walkPath.map(point=>({...point})),movementKeys:[...keys],controls:{focusTag:document.activeElement?.tagName,focusId:document.activeElement?.id,textEntry:isTextEntryTarget(document.activeElement),modalOpen:panels.isOpen},projection:{tileX:TILE_X,tileY:TILE_Y,centerX:CENTRE_X,centerY:CENTRE_Y,spriteScale},body:{...bodyAnimations.get(selfId)},avatarFrame:{...avatarSelections.get(selfId)}, position:{...localPosition}, rendered:{...localRenderPosition}, renderCorrection:{...localRenderCorrection}, camera:{...camera},
    facing:localFacing, motion:{...lastMotion}, height:surfaceHeight(localPosition.x,localPosition.y,worldLocation), location:worldLocation, dimensionId:worldDimensionId, dimensionTheme, arrivalTutorial:arrivalTutorial?{...arrivalTutorial}:null, arrivalCinematicAgeMs:Number.isFinite(arrivalCinematicAge())?Math.round(arrivalCinematicAge()):null, arrivalSkyAgeMs:arrivalCinematicStartedAt?Math.round(arrivalCinematicElapsedMs):null, arrivalImpactOffset:arrivalCameraShake(), arrivalAudio:{chargePlayed:arrivalChargePlayed,impactPlayed:arrivalThunderPlayed,bufferReady:Boolean(ambience?.arrivalThunderBuffer),running:audioContext?.state==='running'}, arrivalAvatarVisible:arrivalAvatarVisible(arrivalCinematicAge()), arrivalFlameIntensity:arrivalFireIgnition(), pending:pendingInputs.length, inventoryPending:inventoryPrediction.pending, outbound:outboundInputs.length,
    networkClock:{synchronized:serverClockOffsetMs!==null,roundTripMs:serverClockRoundTripMs,serverOffsetMs:serverClockOffsetMs},
    remotePlayers,
    server:self ? {x:self.x,y:self.y,z:self.z||0,vx:self.vx||0,vy:self.vy||0,inputSeq:self.inputSeq} : null,
    animationTime:worldClock, pose:getAvatarPose(self||{},Date.now()), furnitureUse:self?.furnitureUse||null,
    furnitureAtlasLoaded:hasRoomFixtureAtlas(),medievalFurnitureAtlasLoaded:hasMedievalFurnitureAtlas(),campfireAuraLoaded:Boolean(campfireAuraImage?.naturalWidth),
    campfireSkyRaysLoaded:Boolean(campfireSkyRaysImage?.naturalWidth),
    bodyPose:{...bodyAnimations.get(selfId)},
    windStrength:windStrengthAt(localPosition.x,localPosition.y),
    inventory:{...localInventory}, appearance:normalizeAppearance(self?.appearance),roomFurniture:[...roomFurniture.values()].map(item=>({...item,rotation:item.rotation||0})),
    roomCanEdit,roomOwnerName,roomKind:worldRoomKind,roomBuildingId:worldRoomBuildingId,cabinKeys,issuedCabinKeys,cabinOccupancy,
    placeServices:placeServicePoints(serviceContext(),currentRoomLayout()),
    panel:{id:panels.current,route:panels.route,point:placePanel.sessionKey},loadedWorldChunkRange:worldChunkRangeKey,visibleTreeCount:visibleSolidTrees.length,
    cabinDepthAudit,
    roomDepthAudit,
    buildMode:roomBuildMode,roomSelectedId,roomMovingId,roomPreview,roomFurnitureRender,
    resourceNodes:[...resources.values()].map(({id,kind,x,y})=>({id,kind,x,y})),
    lightSources:currentSceneLights().lights.map(({id,kind,x,y,height,reach,nx,ny,strength})=>({id,kind,x,y,height,reach,nx,ny,strength})),
    lighting:dominantLight(localPosition,litFires), brightness:nightBrightness(localPosition,litFires), firePositions:[...fires.values()].map(({x,y})=>({x,y})), resources:resources.size, fires:fires.size,
    burningRemainingMs:localPosition.burningRemainingMs||0,
    campfireAudio:ambience?{assetLoaded:Boolean(ambience.campfireBuffer),ambientBuffersReady:Boolean(ambience.ambientNoiseBuffer&&ambience.birdChirpsBuffer&&ambience.pianoNoteBuffer),activeSources:ambience.campfireSources.size,
      positions:[...ambience.campfireSources.values()].map(({x,y,distance,occlusionDb,occluders})=>({x,y,
        distance:Number.isFinite(distance)?Math.round(distance*100)/100:null,occlusionDb,occluders:[...occluders]}))}:null };
}

for(const button of document.querySelectorAll('[data-motion-key]')){
 const key=button.dataset.motionKey;
 button.addEventListener('pointerdown',event=>{event.preventDefault();if(panels.isOpen)return;button.setPointerCapture(event.pointerId);keys.add(key);button.setAttribute('aria-pressed','true')});
 const release=()=>{keys.delete(key);button.setAttribute('aria-pressed','false')};
 for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,release);
}

const appearanceDialog=document.querySelector('#appearance-dialog'),appearanceForm=document.querySelector('#appearance-form');
panels.register('appearance', appearanceDialog, { initialFocus: '#appearance-close' });
const mainHandControl=appearanceForm.elements.namedItem('mainHandId');
for(const definition of CHARACTER_BY_ID.values())if(definition.category==='equipment'){
 const option=document.createElement('option');option.value=definition.id;
 option.textContent=definition.id==='equipment.lantern'?'Lanterna':definition.label;
 mainHandControl.append(option);
}
const outfitArchetypes={
 'white-base':'character.base','commoner':'character.peasant','mage-robe':'character.mage',
 'dimension-coat':'character.dimensional-traveler','dark-armor':'character.dark-knight','light-armor':'character.light-knight',
};
appearanceForm.elements.namedItem('outfit').addEventListener('change',()=>{
 const archetypeId=outfitArchetypes[appearanceForm.elements.namedItem('outfit').value];
 const defaultAura=CHARACTER_BY_ID.get(archetypeId)?.defaults?.auraId||'aura.none';
 appearanceForm.elements.namedItem('aura').value=defaultAura.slice('aura.'.length);
});
document.querySelector('#appearance-open').addEventListener('click',()=>{
 clearMovement();const value=normalizeAppearance(livePlayers.get(selfId)?.appearance);for(const [key,item] of Object.entries(value)){const control=appearanceForm.elements.namedItem(key);if(control)control.value=String(key==='outfit'?item:value[key]);}const auraControl=appearanceForm.elements.namedItem('aura');if(auraControl)auraControl.value=value.auraId.slice('aura.'.length);panels.open('appearance');appearanceDialog.scrollTop=0;
});
document.querySelector('#appearance-close').addEventListener('click',()=>panels.close());
function readAppearanceForm(){
 const current=normalizeAppearance(livePlayers.get(selfId)?.appearance),fields=Object.fromEntries(new FormData(appearanceForm));
 const archetypeId=outfitArchetypes[fields.outfit]||current.archetypeId,preset=CHARACTER_BY_ID.get(archetypeId)?.defaults||{};
 const value={...current,...preset,...fields,archetypeId,skin:current.skin,hair:current.hair,height:current.height,muscle:current.muscle,coat:current.coat};
 if(fields.body==='male'||fields.body==='female')value.bodyId=`body.${fields.body}`;
 if(fields.outfit)value.outfitId=`outfit.${fields.outfit}`;
 if(fields.aura)value.auraId=`aura.${fields.aura}`;
 return normalizeAppearance(value);
}
appearanceForm.addEventListener('submit',event=>{
 event.preventDefault();const appearance=readAppearanceForm();
 if(arrivalTutorial?.phase==='appearance'&&JSON.stringify(appearance)===JSON.stringify(normalizeAppearance(livePlayers.get(selfId)?.appearance))){
   announce('Mude uma opção do personagem para concluir esta etapa.');return;
 }
 sendPlayerCommand({type:'appearance',appearance});panels.close();
});

const previewFacings=['south','southwest','west','northwest','north','northeast','east','southeast'];
let previewDirection=7,previewFrame=0,previewLastFrame=0,previewSpriteKey='';
function renderAppearancePreview(){
 const appearance=readAppearanceForm(),preview=document.querySelector('#appearance-preview'),context=preview.getContext('2d');
 context.fillStyle='#102329';context.fillRect(0,0,preview.width,preview.height);
 const time=reducedMotion?0:performance.now()/1000,facing=previewFacings[previewDirection];
 const pose={sitting:false,sit:0};
 const selected=selectAvatarFrame({appearance,facing,phase:0,travelDistance:0,running:false,pose,time,now:Date.now(),reducedMotion});
 const variantKey=getAvatarSpriteVariant(appearance);
 if(previewSpriteKey!==variantKey){previewSpriteKey=variantKey;void preloadAvatarSprites(appearance).catch(error=>console.error('Falha ao carregar a prévia PNG do personagem',error));}
 context.fillStyle='rgba(174,177,158,.22)';context.beginPath();context.ellipse(80,170,22,7,0,0,Math.PI*2);context.fill();
 context.fillStyle='rgba(3,11,20,.55)';context.beginPath();context.ellipse(80,168,12,3,0,0,Math.PI*2);context.fill();
 drawAvatarSprite(context,80,168,selected,appearance,{scale:2});
}
function animateAppearancePreview(timestamp){
 if(!appearanceDialog.open){previewFrame=0;return;}
 if(reducedMotion){renderAppearancePreview();previewFrame=0;return;}
 if(timestamp-previewLastFrame>=1000/24){renderAppearancePreview();previewLastFrame=timestamp;}
 previewFrame=requestAnimationFrame(animateAppearancePreview);
}
document.querySelector('#appearance-open').addEventListener('click',()=>{if(!previewFrame)previewFrame=requestAnimationFrame(animateAppearancePreview);});
appearanceDialog.addEventListener('close',()=>{cancelAnimationFrame(previewFrame);previewFrame=0;});
for(const [id,step] of [['appearance-turn-left',-1],['appearance-turn-right',1]])document.querySelector('#'+id).addEventListener('click',()=>{previewDirection=(previewDirection+step+8)%8;renderAppearancePreview();});
appearanceForm.elements.namedItem('body').addEventListener('change',renderAppearancePreview);
appearanceForm.addEventListener('change',renderAppearancePreview);document.querySelector('#appearance-open').addEventListener('click',renderAppearancePreview);
// The running RAF already draws ready sprites on its next frame.
setAvatarSpritesReadyListener(()=>{if(appearanceDialog.open)renderAppearancePreview();});
createDraggableHud({
  container: document.querySelector('.canvas-wrap'),
  items: [
    { id: 'quickbar', element: document.querySelector('#quickbar') },
    { id: 'mini-map', element: document.querySelector('#mini-map-toggle') },
    { id: 'room-build', element: document.querySelector('#room-build-tools') },
  ],
  toggle: document.querySelector('#hud-edit-toggle'),
  reset: document.querySelector('#hud-reset'),
});


export function inspectRuntimePerformance(){return runtimePerformanceSnapshot?{...runtimePerformanceSnapshot}:null;}
export function exportPerformanceLog(){return runtimePerformance.export();}
function updateRuntimePerformance(now){
 const lights=lightmapStats();
 runtimePerformanceSnapshot=runtimePerformance.snapshot(now,{
  pendingInputs:pendingInputs.length,outboundInputs:outboundInputs.length,
  bufferedBytes:socket?.bufferedAmount||0,heapUsedBytes:performance.memory?.usedJSHeapSize,
  canvasPixels:canvas.width*canvas.height,visibleEntities:lastVisibleThingCount,
  lightmapBytes:lights.bytes,lightmapPending:lights.pending,sceneReady,hidden:document.hidden,
  connected:socket?.readyState===WebSocket.OPEN,
  longTasksSupported:globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask'),
  location:worldLocation,zoomPercent:cameraZoomPercent,pixelRatio:canvasPixelRatio,viewportWidth:innerWidth,viewportHeight:innerHeight,
 });
 const panel=document.getElementById('performance-overlay');
 if(panel&&!panel.hidden){const m=runtimePerformanceSnapshot;
  panel.textContent=`${m.fps??'—'} FPS · quadro p95 ${m.frameP95Ms??'—'} ms\nDesenho p95 ${m.drawP95Ms??'—'} ms · ping ${m.pingMs??'—'} ms · var. ${m.jitterMs??'—'} ms\nFila ${m.pendingInputs} · envio ${m.outboundInputs} · reconexões ${m.reconnections}\nPausas >250 ms: ${m.stalls250} · memória JS ${m.heapUsedMiB??'—'} MiB`;
 }
}
const performanceToggle=document.getElementById('performance-toggle');
performanceToggle?.addEventListener('click',()=>{
 const panel=document.getElementById('performance-overlay');panel.hidden=!panel.hidden;
 performanceToggle.setAttribute('aria-pressed',String(!panel.hidden));
 if(!panel.hidden)updateRuntimePerformance(performance.now());
});
document.getElementById('performance-export')?.addEventListener('click',()=>{
 const blob=new Blob([JSON.stringify(exportPerformanceLog(),null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='clareira-desempenho.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
