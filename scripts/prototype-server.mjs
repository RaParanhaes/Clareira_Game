import { GAME_RENTAL_DAYS, gameDaysToMs } from '../game/game-calendar.mjs';
import { lodgingStorageKey } from '../game/lodging-catalog.mjs';
import { INVENTORY_ACTIONS, applyInventoryCommand } from '../game/inventory-prediction.mjs';
import { applyRoomChestMove } from './room-chest-actions.mjs';
import { roomChestId } from '../database/room-chest-store.mjs';
import { cleanMovementDiagnosticEvent, MAX_MOVEMENT_DIAGNOSTIC_MESSAGE_BYTES } from '../game/movement-diagnostics.mjs';
import { cleanPerformanceReport } from '../game/performance-telemetry.mjs';
import { ATTRIBUTE_KEYS, MAX_PLAYER_LEVEL, PLAYER_ABILITIES, XP_POTIONS, XP_POTION_RECIPES, attributeAttackBonus, attributeSpellDamageBonus, awardPotionXp, learnPlayerAbility, mapDiscoveryRadiusForAbilities, storagePageCountForLevel } from '../game/progression.mjs';
import { DARK_WORLD_COORDINATE_VERSION, WORLD_CENTER, WORLD_NATURE_ORIGIN } from '../game/world-scale.mjs';
import {applyObjectCatalog,objectCatalogRevision,objectTemplate} from '../game/object-state.mjs';
import {createObjectCatalogCache,objectCacheNamespace} from '../database/object-cache.mjs';
import { discoverWorldMapCells } from '../game/world-map.mjs';
import { loadBackendConfig } from '../database/runtime-config.mjs';
import { furnitureUse,furnitureVisual,roomFurnitureDistance,roomFurnitureRadius } from '../game/furniture.mjs';
import { furnitureByKind } from '../game/content-catalog.mjs';
import {copyData} from '../game/object-catalog.mjs';
import {
  addInventoryItem, canAddInventoryItems, createInventory, findInventorySlot, inventorySnapshot,
  removeInventoryItem, restoreInventory, selectedInventoryItem, STONE_AXE_DURABILITY, STONE_PICKAXE_DURABILITY,
} from '../game/inventory.mjs';
import { AXE_TOOL_SPECS, AXE_TOOL_IDS, PICKAXE_TOOL_SPECS, PICKAXE_TOOL_IDS, axeToolFor, axeUpgradeFor, pickaxeToolFor, pickaxeUpgradeFor } from '../game/tool-progression.mjs';
import { RESOURCE_CONTRACTS, resourceContractBoard, resourceContractDayKey } from '../game/resource-contracts.mjs';
import {normalizeAppearance} from '../game/appearance.mjs';
import { createSnapshotStream } from './snapshot-stream.mjs';
import { performance } from 'node:perf_hooks';
import { createEventLoopLag } from './event-loop-lag.mjs';
import { simulationBudget } from './simulation-clock.mjs';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { EMPTY_INVENTORY, parseCookies } from './account-store.mjs';
import { createStorageAdapter } from '../database/storage.mjs';
import { createRedisCoordination } from '../database/redis-coordination.mjs';
import { aoiCell, aoiWindow, normalizeViewport, viewportAoiRadius } from '../game/area-of-interest.mjs';
import { PlayerSpatialIndex } from './player-spatial-index.mjs';
import {
  canOccupy, canOccupyRoom, canPlaceRoomFurniture, roomFurnitureSupport, hasClearInteractionPath, CLEARING_DOOR, PLAYER_RADIUS,
  ROOM_FURNITURE_LIMIT,
  findNearbyPosition, getResourcesInBounds, getSolidTreesInBounds, getRocksInBounds, isPathTile, nearestCollectible, stepPlayer, stepRoomPlayer, getRoomLayout, getRoomSpawnCandidates, crossedRoomExit,
  applyWorldDefinition, DIMENSION_COORDINATE_OFFSET, WORLD_COORDINATE_VERSION, WORLD_RESOURCE_GENERATION_VERSION, WORLD_SIZE, SPAWN_CAMPFIRE,
} from '../game/world.mjs';
import { FIRE_RADIUS } from '../game/obstacle-collision.mjs';
import { surfaceHeight } from '../game/elevation.mjs';
import { appendWorldEdits, emptyWorldDefinition, normalizeWorldDefinition, updateWorldEdits } from '../game/world-edits.mjs';
import { getNearestShareTarget } from '../game/share-target.mjs';
import { normalizeChatMessage } from '../game/chat.mjs';
import { seedDimensionLayout } from '../game/dimension-layout.mjs';
import { DEFAULT_DIMENSIONS, dimensionById, initialWorldForDimension, isPersonalArrivalDimensionId, normalizeDimensions, personalArrivalDimension, seedDimensionTerrain } from '../game/dimensions.mjs';
import { CURRENCY_KEYS, LODGING_OFFER_BY_KEY, TOOL_PRICES, TRADE_PRICES, formatCoins, lobbyRoomKey, lodgingLocation, lodgingRoomKey } from '../game/lodging-catalog.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING } from '../game/village-buildings.mjs';
import { isCabin, cabinClaimForKey } from '../game/cabin-access.mjs';
import { isPlaceServiceAction, nearestPlaceService, placeServiceAllowsAction } from '../game/place-services.mjs';
import { waterStateAt } from '../game/waterways.mjs';
import { GAME_DAY_DURATION_MS, getGameDayState } from '../game/day-night.mjs';
import {
  WILDLIFE_BY_ID, WILDLIFE_ZONE_SIZE, WILDLIFE_POPULATION_LIMIT, createWildlifeForZone, stepWildlifePopulation, wildlifeCollisionBodies,
} from '../game/wildlife.mjs';
import { huntWildlifeTarget } from '../game/wildlife-hunt.mjs';
import { villageActorsFor } from '../game/village-npcs.mjs';
import {
  CAMPFIRE_DECAY_REBUILD_COST, CAMPFIRE_FEED_COST, CAMPFIRE_FEED_WINDOW_MS,
  CAMPFIRE_IGNITION_RAMP_MS, CAMPFIRE_NEW_COST,
  CAMPFIRE_REKINDLE_COST, campfireBurnedOutForMs, campfireDecayProgress,
  campfireFlameStrength, campfireRemainingMs,
} from '../game/campfire-life.mjs';

function wildlifeOutsideVillage(position,dimensionId,padding=4) {
  return dimensionId!=='surface'||(
    Math.hypot(position.x-SPAWN_CAMPFIRE.x,position.y-SPAWN_CAMPFIRE.y)>12
    &&VILLAGE_BUILDINGS.every(({bounds:b})=>position.x<b.left-padding||position.x>b.right+padding||position.y<b.top-padding||position.y>b.bottom+padding));
}

const MAX_PLAYERS = 200;
const WORLD_MAP_GRID=Object.freeze({worldSize:WORLD_SIZE,chunkSize:Math.ceil(WORLD_SIZE/48),columns:48,rows:48});
// The transport ceiling leaves room to inspect and safely reject an oversized
// client message. The application protocol remains much smaller.
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_CLIENT_MESSAGE_BYTES = MAX_MOVEMENT_DIAGNOSTIC_MESSAGE_BYTES;
const MAX_EARLY_MESSAGES = 16;
const FIXED_STEP_SECONDS = 1 / 60;
const TICK_INTERVAL_MS = 1000 / 30;
// Keep authoritative simulation at 30 Hz, but stream remote positions at 20 Hz.
// The browser predicts local WASD movement and interpolates remote samples.
const SNAPSHOT_MS = 50;
const WORLD_ORIGIN = WORLD_NATURE_ORIGIN;
const LOCATION_CHECKPOINT_MS = 5_000;
// One second of movement at 60 fixed input steps per second.
// Three seconds of fixed-step input is enough to bridge a short reconnect while
// keeping catch-up work bounded on the authoritative simulation.
const MAX_QUEUED_INPUT_COMMANDS = 180;
const ACTION_COOLDOWN_MS = 250;
const CHAT_COOLDOWN_MS = 900;
const CHAT_DURATION_MS = 5000;
const TREE_REGROWTH_MS = GAME_DAY_DURATION_MS * 7;
const TREE_STUMP_MS = GAME_DAY_DURATION_MS * 2;
const TREE_SAPLING_MS = GAME_DAY_DURATION_MS * 3;
const validEmotes = new Set(['wave', 'dance', 'sit', 'stand']);

function isBareDarkDimension(dimension) {
  return dimension?.id === 'breu' || dimension?.instanceType === 'arrival'
    || isPersonalArrivalDimensionId(dimension?.id);
}

function coordinateVersionForDimension(dimensionId) {
  return dimensionId === 'breu' || isPersonalArrivalDimensionId(dimensionId)
    ? DARK_WORLD_COORDINATE_VERSION : WORLD_COORDINATE_VERSION;
}

const DARK_WORLD_COORDINATE_OFFSET = Object.freeze({
  x: WORLD_CENTER.x - WORLD_NATURE_ORIGIN.x,
  y: WORLD_CENTER.y - WORLD_NATURE_ORIGIN.y,
});

function hasFlatDarkWorld(definition) {
  return definition.theme === 'dark' && definition.edits.length === 0;
}

function flatDarkWorld(definition, dimensionId) {
  if (hasFlatDarkWorld(definition)) return definition;
  return normalizeWorldDefinition({ ...definition, dimensionId, theme: 'dark', edits: [] });
}

function clampAxis(value) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function isSettledNeutralCommand(position, command) {
  const crouching = command.crouch === true;
  const running = command.run === true && !crouching;
  return !command.flight && command.motion === true && command.x === 0 && command.y === 0 && command.jump !== true
    && Math.abs(position.vx || 0) < 1e-7 && Math.abs(position.vy || 0) < 1e-7
    && (position.z || 0) === 0 && (position.vz || 0) === 0 && position.jumpHeld !== true
    && Boolean(position.running) === running && Boolean(position.crouching) === crouching;
}

function isBlockedAtRest(previous, next, command) {
  return !command.flight && command.motion === true
    && (command.x !== 0 || command.y !== 0)
    && command.jump !== true
    && previous.x === next.x && previous.y === next.y
    && Math.abs(next.vx || 0) < 1e-7 && Math.abs(next.vy || 0) < 1e-7
    && (next.z || 0) === 0 && (next.vz || 0) === 0
    && next.jumpHeld !== true;
}

function hasSameMovementIntent(first, next) {
  return !first.flight && !next?.flight && next?.motion === true
    && next.jump !== true
    && first.x === next.x && first.y === next.y
    && first.run === next.run && first.crouch === next.crouch;
}

function enqueueInputCommand(player, command) {
  if (!Number.isSafeInteger(command?.seq) || command.seq <= player.receivedSeq) return;
  player.commands.push({
    seq: command.seq,
    x: clampAxis(command.x),
    y: clampAxis(command.y),
    motion: command.motion === true,
    run: command.run === true,
    crouch: command.crouch === true,
    jump: command.jump === true,
    ...(player.flightPilotEnabled && command.flight && typeof command.flight === 'object' ? {
      flight: { x: clampAxis(command.flight.x), y: clampAxis(command.flight.y),
        vertical: clampAxis(command.flight.vertical), profile: command.flight.profile === 'smooth' ? 'smooth' : 'controlled',
        ...(Number.isFinite(command.flight.targetHeight)?{targetHeight:Math.max(0,Math.min(12,command.flight.targetHeight))}:{}) },
    } : {}),
  });
  player.receivedSeq = command.seq;

  // If the bounded queue overflows, skip its oldest steps and acknowledge them
  // in order. Silently dropping new steps lets a later sequence number make the
  // client discard movement the server never simulated.
  const overflow = player.commands.length - MAX_QUEUED_INPUT_COMMANDS;
  if (overflow > 0) {
    const skipped = player.commands.splice(0, overflow);
    player.inputSeq = Math.max(player.inputSeq, skipped[skipped.length - 1].seq);
  }
}

function advanceQueuedInput(player, { throughSeq = Infinity, maxSteps = Infinity, step, move, crossedRoomExit, walkOutOfRoom }) {
  let simulatedSteps = 0;
  while (simulatedSteps < maxSteps && player.commands.length && player.commands[0].seq <= throughSeq) {
    const command = player.commands.shift();
    if (isSettledNeutralCommand(player.position, command)) {
      player.inputSeq = command.seq;
      continue;
    }
    if (player.sitting && command.seq > player.sitInputSeq && (command.x || command.y || command.jump)) {
      player.sitting = false;
      if (player.emote?.name === 'sit') player.emote = null;
    }
    const previousPosition = player.position;
    player.position = move(previousPosition, command, step);
    player.inputSeq = command.seq;
    simulatedSteps += 1;
    if (crossedRoomExit(player, previousPosition, player.position)) {
      walkOutOfRoom(player);
      break;
    }
    if (isBlockedAtRest(previousPosition, player.position, command)) {
      while (player.commands.length && player.commands[0].seq <= throughSeq
          && hasSameMovementIntent(command, player.commands[0])) {
        player.inputSeq = player.commands.shift().seq;
      }
    }
  }
  return simulatedSteps;
}

function playerContextId(player) {
  const dimensionId = player.dimensionId || 'surface';
  return player.location === 'room'
    ? `world.clareira/dimension.${dimensionId}/place.room/instance.${encodeURIComponent(player.roomKey)}`
    : `world.clareira/dimension.${dimensionId}/place.clearing/instance.surface-clearing`;
}

function makeInteractionRecord(player, action, object, { transfer = {}, details = {}, context: contextOverride = null } = {}) {
  const location = player.location === 'room' ? 'room' : 'clearing';
  const placeId = location === 'room'
    ? `room:${player.roomBuildingId || player.roomKind || 'home'}` : 'clearing';
  return {
    actorProfileId: player.sessionId || null,
    action,
    context: contextOverride || {
      dimensionId: player.dimensionId || 'surface', location, placeId,
      instanceId: location === 'room' ? player.roomKey : 'surface-clearing',
      position: { x: player.position.x, y: player.position.y, z: player.position.z || 0 },
    },
    object: {
      id: object?.id || '', kind: object?.kind || action,
      properties: object?.properties || {},
    },
    transfer,
    details,
  };
}

const villageBuildingById = {get:id=>VILLAGE_BUILDINGS.find(b=>b.id===id),has:id=>VILLAGE_BUILDINGS.some(b=>b.id===id)};

function roomDetails(roomKey) {
  if (typeof roomKey !== 'string') return { kind: 'legacy', buildingId: null, unitNumber: null };
  if (roomKey.startsWith('lobby:')) {
    const buildingId = roomKey.slice('lobby:'.length);
    return { kind: 'lobby', buildingId: villageBuildingById.has(buildingId) ? buildingId : 'arrival', unitNumber: null };
  }
  const lodging = lodgingLocation(roomKey);
  if (lodging) return { kind: 'lodging', buildingId: lodging.buildingId, unitNumber: lodging.unitNumber };
  return { kind: 'legacy', buildingId: null, unitNumber: null };
}

function roomDisplayName(roomKey, playerName, claim = null) {
  const detail = roomDetails(roomKey);
  if (detail.kind === 'lobby') {
    return detail.buildingId === 'arrival' ? RECEPTION_BUILDING.name : `Recepção · ${villageBuildingById.get(detail.buildingId)?.name || 'Bosque'}`;
  }
  if (detail.kind === 'lodging') {
    const building = villageBuildingById.get(detail.buildingId);
    if (building?.kind === 'cabin') return building.name;
    const unitLabel = claim?.mode === 'owned' && building?.kind === 'hotel' ? 'Apartamento' : 'Quarto';
    return `${unitLabel} ${detail.unitNumber} · ${building?.name || 'Hospedagem'}`;
  }
  return playerName;
}

function canEditCurrentRoom(player) {
  if (player?.location !== 'room') return false;
  if (player.roomKind === 'legacy' && player.roomKey === player.homeRoomKey) return true;
  const claim = player.lodgingClaim;
  return player.roomKind === 'lodging'
    && typeof player.accountId === 'string'
    && claim?.profileId === player.accountId
    && lodgingRoomKey(claim) === player.roomKey;
}

function setFurnitureSupport(item,support){
  for(const key of ['supportId','supportSurface','supportOffsetX','supportOffsetY','baseZ'])delete item[key];
  if(support)Object.assign(item,support);
}

function snapshotGroupKey(player) {
  const cell = aoiCell(player.position);
  const roomPermission = canEditCurrentRoom(player) ? 'owner' : 'visitor';
  return `${playerContextId(player)}|${cell.x}:${cell.y}|r${player.aoiRadius}|${roomPermission}|compact-${player.compactPlayers ? 1 : 0}`;
}

function serializeWildlifeForNetwork(animal) {
  const definition = WILDLIFE_BY_ID.get(animal.speciesId);
  return {
    id: animal.id, speciesId: animal.speciesId,
    x: animal.x, y: animal.y, vx: animal.vx, vy: animal.vy,
    state: animal.state, health: animal.health, lifeStage: animal.lifeStage,
    awareness: animal.awarenessUntil > Date.now() ? animal.awareness : null,
    shelter: {
      id: animal.shelterId || animal.groupId || animal.id,
      kind: definition?.shelter || null,
      x: animal.shelterX, y: animal.shelterY,
      cover: animal.shelterCover || null,
    },
    sheltered: animal.sheltered === true,
  };
}

function stableWorldStateId(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}

function migrateLegacyResourceCycles(definition) {
  const respawnAt = Date.now() + TREE_REGROWTH_MS;
  const upserts = [];
  const removeIds = [];
  for (const edit of definition.edits) {
    if (edit.type === 'tree-remove' && edit.id.startsWith('fell-') && edit.respawnAt === undefined) {
      upserts.push({ ...edit, respawnAt });
    } else if (edit.type === 'resource-remove' && edit.id.startsWith('tree-pick-') && edit.targetId.startsWith('tree-drop-')) {
      removeIds.push(edit.id);
      upserts.push({
        id: edit.id, type: 'resource-cooldown', targetId: edit.targetId, sourceId: `map-${edit.targetId}`,
        readyAt: respawnAt, x: edit.x, y: edit.y,
      });
    }
  }
  return upserts.length ? updateWorldEdits(definition, { upserts, removeIds }, { worldSize: WORLD_SIZE }) : definition;
}

const NATURAL_GROUND_RESOURCE_KINDS = new Set(['wood', 'sturdyBranch', 'stone', 'berries', 'apples', 'leaves', 'vines', 'log']);
const LEGACY_FIXED_RESOURCE_IDS = new Set([
  'branch-east', 'branch-south', 'branch-west', 'sturdy-branch-start', 'sturdy-branch-north', 'sturdy-branch-west',
  'stone-path', 'stone-south', 'berry-grove', 'berry-north', 'berry-east', 'leaves-southwest', 'dry-leaves-start',
  'vine-southwest', 'vine-northeast',
]);

function migrateNaturalResourceSpawns(definition) {
  if (definition.generationVersion >= WORLD_RESOURCE_GENERATION_VERSION) return definition;
  const naturalResourceIds = new Set(LEGACY_FIXED_RESOURCE_IDS);
  for (const edit of definition.edits) {
    if (edit.type === 'resource' && NATURAL_GROUND_RESOURCE_KINDS.has(edit.resourceKind)) naturalResourceIds.add(edit.id);
  }
  const isLegacyNaturalResourceId = value => {
    if (typeof value !== 'string') return false;
    const id = value.replace(/^map-/, '');
    return naturalResourceIds.has(id) || id.startsWith('tree-drop-') || /^resource-\d+-\d+-\d+$/.test(id);
  };
  const edits = definition.edits.filter(edit => {
    if (edit.type === 'tree-remove' && edit.id.startsWith('fell-')) return false;
    if (edit.type === 'resource' && NATURAL_GROUND_RESOURCE_KINDS.has(edit.resourceKind)) return false;
    if (edit.type === 'work-progress' && (edit.targetKind === 'tree' || edit.targetKind === 'log')) return false;
    if (edit.type === 'resource-remove' && isLegacyNaturalResourceId(edit.targetId)) return false;
    if (edit.type === 'resource-cooldown'
        && (isLegacyNaturalResourceId(edit.targetId) || isLegacyNaturalResourceId(edit.sourceId))) return false;
    return true;
  });
  return normalizeWorldDefinition({ ...definition, revision: definition.revision + 1,
    generationVersion: WORLD_RESOURCE_GENERATION_VERSION, edits });
}

function applyViewport(player, width, height) {
  const viewport = normalizeViewport(width, height);
  player.viewportWidth = viewport.width;
  player.viewportHeight = viewport.height;
  player.aoiRadius = viewportAoiRadius(viewport.width, viewport.height);
}

function isInsideAoi(position, area) {
  const dx = position.x - area.center.x;
  const dy = position.y - area.center.y;
  return dx * dx + dy * dy <= area.radius * area.radius;
}

export function createPrototypeServer({
  host = '127.0.0.1',
  port = 8099,
  now = Date.now,
  stateDirectory = process.env.STATE_DIRECTORY || path.join(os.tmpdir(), 'clareira-dev'),
  allowedOrigin = 'https://vmi3579939.contaboserver.net',
  resolveSession,
  arrivalTutorialEnabled = true,
  resourceRespawnMs = 240_000,
  ambientCampfire = true,
  campfireLifecycleIntervalMs = 5_000,
  tickIntervalMs = TICK_INTERVAL_MS,
  snapshotIntervalMs = SNAPSHOT_MS,
  webSocketCompression = process.env.WEBSOCKET_COMPRESSION === '1',
  webSocketCompressionThreshold = Number(process.env.WEBSOCKET_COMPRESSION_THRESHOLD) || 16_384,
  compressMovementSnapshots = process.env.WEBSOCKET_COMPRESS_MOVEMENT === '1',
  webSocketHeartbeatMs = 30_000,
  databaseUrl = process.env.DATABASE_URL,
  redisUrl = process.env.REDIS_URL,
  staffAuthorizationOverride = null,
  redisCoordination,
  coordinationHeartbeatMs = 5_000,
  worldSyncIntervalMs = 2_000,
  flightPilotEnabled = false,
  flightPilotAuthorize = ({canStaffTravelDimensions}) => canStaffTravelDimensions,
} = {}) {
  const storage = createStorageAdapter({ directory: stateDirectory, databaseUrl });
  const staffAuthorization = staffAuthorizationOverride || storage.staffManagement?.authorization || null;
  const marketGovernmentId = 'surface:arrival';
  let marketQuotes = Object.fromEntries(Object.entries(TRADE_PRICES).map(([itemId, price]) => [itemId, { buyPrice:price, sellPrice:price }]));
  let propertyListings = [], propertyRentalListings = [];
  let sanctionEnforcementTimer = null;
  let lastSanctionRefreshErrorAt = 0;
  const objectCache=createObjectCatalogCache(storage,{url:redisUrl,namespace:objectCacheNamespace(databaseUrl,stateDirectory)});
  let sceneObjectCatalog=null;
  const coordination = redisCoordination || createRedisCoordination({ url: redisUrl });
  const coordinationReleases = new Set();
  const releaseCoordination = registration => {
    if (!registration) return Promise.resolve();
    const pending = Promise.resolve().then(() => registration.release());
    coordinationReleases.add(pending);
    pending.finally(() => coordinationReleases.delete(pending));
    return pending;
  };
  const resolveIdentity = resolveSession || (token => storage.accounts.getSession(token));
  const httpServer = http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' });
      response.end();
      return;
    }
    if (new URL(request.url, 'http://localhost').pathname !== '/health') {
      response.writeHead(404, { 'cache-control': 'no-store' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('ok');
  });
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: webSocketCompression ? {
      threshold: Math.max(0, Number(webSocketCompressionThreshold) || 16_384), concurrencyLimit: 4,
      serverNoContextTakeover: true, clientNoContextTakeover: true,
      zlibDeflateOptions: { level: 1, memLevel: 7 },
    } : false });
  const heartbeatIntervalMs = Math.max(10, Math.min(60_000, Number(webSocketHeartbeatMs) || 30_000));
  const webSocketHeartbeatTimer = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping(undefined, false, error => {
        if (error) socket.terminate();
      });
    }
  }, heartbeatIntervalMs);
  webSocketHeartbeatTimer.unref();
  const peers = new Map();
  const acceptedMovementDiagnosticReports=new Map();
  const acceptedPerformanceReports=new Map();
  const activeDimensionTransits = new Map();
  const dimensionTransitTimers = new Map();
  let pendingAdmissions = 0;
  const pendingAccountAdmissions = new Set();
  const coordinatedSockets = new Map();
  const spatialIndex = new PlayerSpatialIndex();
  const collisionIndex = new PlayerSpatialIndex({ cellSize: 2 });
  const indexPlayer = (socket, player) => {
    const contextId = playerContextId(player);
    spatialIndex.upsert(socket, contextId, player.position, player);
    collisionIndex.upsert(socket, contextId, player.position, player);
  };
  const removeIndexedPlayer = socket => {
    spatialIndex.remove(socket);
    collisionIndex.remove(socket);
  };
  const refreshPlayerLodgings = async player => {
    player.lodgingClaims = (await storage.listLodgingClaims(player.accountId)).filter(claim => claim.profileId === player.accountId);
    player.propertyRequests = storage.getPropertyRequests ? await storage.getPropertyRequests(player.accountId) : [];
    player.lodgingLeases = storage.getLodgingLeases ? await storage.getLodgingLeases(player.accountId) : [];
    player.lodgingClaim=player.lodgingClaims.find(c=>lodgingRoomKey(c)===player.roomKey)
      || player.lodgingClaims.find(c=>lodgingRoomKey(c)===lodgingRoomKey(player.lodgingClaim||{})) || player.lodgingClaims[0] || null;
  };
  const roomStates = new Map();
  const cabinRoomLoads = new Map();
  const loadCabinRoomState = (roomKey, ownerProfileId, playerName, claim, buildingId) => {
    const existing=roomStates.get(roomKey);if(existing)return Promise.resolve(existing);
    if(cabinRoomLoads.has(roomKey))return cabinRoomLoads.get(roomKey);
    const loading=storage.loadRoom(ownerProfileId, lodgingStorageKey(claim)).then(furniture=>{
      const state=roomStates.get(roomKey)||{furniture,name:roomDisplayName(roomKey,playerName,claim),kind:'lodging',buildingId};
      roomStates.set(roomKey,state);return state;
    }).finally(()=>cabinRoomLoads.delete(roomKey));
    cabinRoomLoads.set(roomKey,loading);return loading;
  };
  let cabinOccupancy = [];
  const resetSceneMotion = player => {
    player.input = { x: 0, y: 0 }; player.commands = []; player.inputSeq = player.receivedSeq;
    if (Number.isFinite(player.position.flightZ)) {
      const {flightZ,blocked,...grounded}=player.position;
      player.position={...grounded,z:0,vz:0,vx:0,vy:0};
    }
    player.moving = false; player.emote = null; player.sitting = false;
    player.furnitureUse=null;player.exitFurnitureId=null;
    player.roomEntryContext = null; player.roomEnteredFloor = false;
    player.registration?.update({ location: player.location, contextId: playerContextId(player) });
    indexPlayer(player.socket, player);
  };
  const moveRoomPlayer=(player,position,input,delta,occupied)=>{
    const layout=getRoomLayout(player.roomKind,player.roomBuildingId,player.roomLodgingMode||player.lodgingClaim?.mode);
    const fixtures=player.exitFurnitureId?player.roomFurniture.filter(item=>item.id!==player.exitFurnitureId):player.roomFurniture;
    const next=stepRoomPlayer(position,input,delta,occupied,fixtures,layout,{...player.inventory.attributes,hasteActive:performance.now()<(player.hasteUntil||0)});
    const exitFixture=player.exitFurnitureId&&player.roomFurniture.find(item=>item.id===player.exitFurnitureId);
    if(exitFixture&&roomFurnitureDistance(next,exitFixture)>PLAYER_RADIUS+.08)player.exitFurnitureId=null;
    return next;
  };
  const leaveCabin = player => {
    const building = villageBuildingById.get(player.roomBuildingId);
    player.location = 'clearing'; player.dimensionId = 'surface';
    player.roomKey = player.homeRoomKey; player.roomKind = 'legacy'; player.roomBuildingId = null;
    player.roomLodgingMode = null;
    player.roomState = player.homeRoomState; player.roomFurniture = player.roomState.furniture;
    const door = building?.door || CLEARING_DOOR;
    player.position = findNearbyPosition({ x: door.x, y: door.y + .6 },
      spatialIndex.query(playerContextId(player), door, 8).filter(other => other !== player).map(other => other.position))
      || { x: door.x, y: door.y + .6 };
    resetSceneMotion(player);
  };
  const walkOutOfRoom = player => {
    if (player.staffRoomReturn) {
      const origin = player.staffRoomReturn;
      player.staffRoomReturn = null;
      player.location = origin.location; player.dimensionId = origin.dimensionId;
      player.position = { ...origin.position };
      if (origin.location === 'room') {
        player.roomKey = origin.roomKey; player.roomKind = origin.roomKind;
        player.roomBuildingId = origin.roomBuildingId; player.roomLodgingMode = origin.roomLodgingMode;
        player.roomState = origin.roomState; player.roomFurniture = origin.roomState.furniture;
      } else {
        player.roomKey = player.homeRoomKey; player.roomKind = 'legacy'; player.roomBuildingId = null;
        player.roomLodgingMode = null; player.roomState = player.homeRoomState;
        player.roomFurniture = player.homeRoomState.furniture;
      }
      resetSceneMotion(player); notice(player.socket, 'Você voltou ao local de onde entrou.', 'chime'); return true;
    }
    const details=getRoomLayout(player.roomKind,player.roomBuildingId,player.roomLodgingMode||player.lodgingClaim?.mode);
    if(details.elevation!=='flat')return false;
    player.roomEntryContext=null;player.roomEnteredFloor=false;
    const building=player.roomKind==='lobby'?villageBuildingById.get(player.roomBuildingId):null;
    if(player.roomKind==='lodging'&&isCabin(player.roomBuildingId)){
      leaveCabin(player);notice(player.socket,'Você saiu pela porta da cabana.','chime');return true;
    }
    if(player.roomKind==='lodging'&&player.roomBuildingId){
      const lobbyKey=lobbyRoomKey(player.roomBuildingId),lobbyDetails=roomDetails(lobbyKey);
      const lobbyState=roomStates.get(lobbyKey)||{furniture:[],name:roomDisplayName(lobbyKey,player.name),kind:'lobby',buildingId:lobbyDetails.buildingId};
      roomStates.set(lobbyKey,lobbyState);player.location='room';player.roomKey=lobbyKey;player.roomKind='lobby';
      player.roomBuildingId=lobbyDetails.buildingId;player.roomState=lobbyState;player.roomFurniture=lobbyState.furniture;
      player.position={...getRoomLayout('lobby',lobbyDetails.buildingId).spawn};
      resetSceneMotion(player);notice(player.socket,'Você voltou à recepção.','chime');return true;
    }
    const outsideDoor=building?.door||CLEARING_DOOR;
    player.location='clearing';player.dimensionId='surface';player.roomKey=player.homeRoomKey;
    player.roomKind='legacy';player.roomBuildingId=null;player.roomLodgingMode=null;
    player.roomState=player.homeRoomState;player.roomFurniture=player.roomState.furniture;
    player.position=findNearbyPosition({x:outsideDoor.x,y:outsideDoor.y+.6},
      spatialIndex.query(playerContextId({location:'clearing',dimensionId:'surface'}),outsideDoor,8)
        .filter(other=>other!==player).map(other=>other.position))||{x:outsideDoor.x,y:outsideDoor.y+.6};
    resetSceneMotion(player);notice(player.socket,'Você voltou ao bosque.','chime');return true;
  };
  const didCrossRoomExit = (player, from, to) => {
    if (player.location !== 'room') return false;
    const layout=getRoomLayout(player.roomKind, player.roomBuildingId, player.roomLodgingMode || player.lodgingClaim?.mode);
    if (player.roomEntryContext !== player.roomKey) {
      player.roomEntryContext=player.roomKey;
      player.roomEnteredFloor=false;
    }
    if (from.y <= layout.bounds.bottom - PLAYER_RADIUS || to.y <= layout.bounds.bottom - PLAYER_RADIUS)
      player.roomEnteredFloor=true;
    return crossedRoomExit(from,to,layout,{enteredFloor:player.roomEnteredFloor});
  };
  const advancePlayerToInput = (player, throughSeq) => {
    if (!player.sequenced || !Number.isSafeInteger(throughSeq) || throughSeq <= player.inputSeq) return;
    const targetSeq = Math.min(throughSeq, player.receivedSeq);
    if (targetSeq <= player.inputSeq) return;
    const previousPosition = { x: player.position.x, y: player.position.y };
    const occupied = collisionIndex.query(playerContextId(player), player.position, 1)
      .filter(other => other !== player).map(other => other.position);
    const move = (position, input, delta) => player.location === 'room'
      ? moveRoomPlayer(player,position,input,delta,occupied)
      : stepPlayer(position, input, delta, occupied, [...firesFor(player.dimensionId).values()], now(),
        wildlifeCollisionBodies(wildlifeFor(player.dimensionId).values()), { ...player.inventory.attributes, hasteActive:performance.now()<(player.hasteUntil||0), sprintBurstActive:performance.now()<(player.sprintBurstUntil||0), flightAuthorized:player.flightPilotEnabled });
    advanceQueuedInput(player, { throughSeq: targetSeq, maxSteps: MAX_QUEUED_INPUT_COMMANDS,
      step: FIXED_STEP_SECONDS, move, crossedRoomExit: didCrossRoomExit, walkOutOfRoom });
    player.moving = player.position.x !== previousPosition.x || player.position.y !== previousPosition.y;
    indexPlayer(player.socket, player);
  };
  const refreshCabinViews = async () => {
    cabinOccupancy = (await storage.listLodgingClaims()).filter(claim => isCabin(claim.buildingId))
      .map(claim => ({ buildingId: claim.buildingId }));
    propertyListings = storage.getPropertyListings ? await storage.getPropertyListings() : [];
    propertyRentalListings = storage.getPropertyRentalListings ? await storage.getPropertyRentalListings() : [];
    for (const player of peers.values()) {
      if (!player.accountId) continue;
      if(storage.getPropertyRequests)player.propertyRequests=await storage.getPropertyRequests(player.accountId);
      [player.cabinKeys, player.issuedCabinKeys] = await Promise.all([
        storage.getCabinKeys(player.accountId), storage.getIssuedCabinKeys(player.accountId),
      ]);
      if (player.location === 'room' && player.roomKind === 'lodging' && isCabin(player.roomBuildingId)
          && !player.cabinKeys.some(key => lodgingRoomKey(cabinClaimForKey(key)) === player.roomKey)) {
        leaveCabin(player);
        notice(player.socket, 'A chave desta cabana foi revogada. Você voltou para fora.', 'soft');
      }
    }
  };
  const enterCabin = async (player, buildingId) => {
    if (!player.accountId) { notice(player.socket, 'Porta trancada. Você precisa de uma conta e da chave desta cabana.'); return false; }
    try {
      const keys = await storage.getCabinKeys(player.accountId);
      const access = keys.find(key => key.buildingId === buildingId);
      if (!access) { notice(player.socket, 'Porta trancada. Você precisa da chave desta cabana.'); return false; }
      const claim = cabinClaimForKey(access), roomKey = lodgingRoomKey(claim);
      const layout = getRoomLayout('lodging', buildingId, 'owned');
      const state = await loadCabinRoomState(roomKey,access.ownerProfileId,player.name,claim,buildingId);
      // Loading an offline owner's room can yield; a revoked key must not open it afterwards.
      const freshKeys = await storage.getCabinKeys(player.accountId);
      if (!freshKeys.some(key => key.buildingId === buildingId && key.ownerProfileId === access.ownerProfileId)) {
        notice(player.socket, 'Essa chave não abre mais a cabana.'); return false;
      }
      const occupants = spatialIndex.query(playerContextId({ location: 'room', dimensionId: 'surface', roomKey }), layout.spawn, 16)
        .filter(other => other !== player).map(other => other.position);
      const spawn = getRoomSpawnCandidates(layout).find(point => canOccupyRoom(point, PLAYER_RADIUS, state.furniture, layout)
        && occupants.every(other => Math.hypot(point.x - other.x, point.y - other.y) > PLAYER_RADIUS * 2 + .12));
      if (!spawn) { notice(player.socket, 'A entrada da cabana está ocupada. Tente de novo em um instante.'); return false; }
      roomStates.set(roomKey, state);
      player.cabinKeys = freshKeys; player.location = 'room'; player.dimensionId = 'surface';
      player.roomKey = roomKey; player.roomKind = 'lodging'; player.roomBuildingId = buildingId; player.roomLodgingMode = 'owned';
      player.roomState = state; player.roomFurniture = state.furniture; player.position = { ...spawn };
      resetSceneMotion(player);
      notice(player.socket, `Você abriu ${villageBuildingById.get(buildingId).name} com sua chave.`, 'chime');
      return true;
    } catch (error) { notice(player.socket, 'Não consegui conferir sua chave agora. A porta continua trancada.'); return false; }
  };
  const resumableSessions = new Map();
  let dimensions = normalizeDimensions(DEFAULT_DIMENSIONS);
  let dimensionsRevision = 0;
  const worldDefinitions = new Map();
  const resourceStates = new Map();
  const woodworkLocks = new Set();
  const resourceContractLocks = new Set();
  const firesByDimension = new Map();
  const wildlifeByDimension = new Map();
  const generatedWildlifeZones = new Set();
  const fireWrites = new Map();
  const campfireActionQueues = new Map();
  let fireLifecycleTimer = null;
  let fireLifecycleRunning = false;
  const resourceState = dimensionId => {
    if (!resourceStates.has(dimensionId)) resourceStates.set(dimensionId, { collected: new Set(), respawns: new Map(), treeRespawns: new Map() });
    return resourceStates.get(dimensionId);
  };
  const wildlifeFor = dimensionId => {
    if (!wildlifeByDimension.has(dimensionId)) wildlifeByDimension.set(dimensionId, new Map());
    return wildlifeByDimension.get(dimensionId);
  };
  const initialCampfiresFor = dimensionId => {
    const dimension = dimensionById(dimensions, dimensionId);
    const fires = new Map();
    if (ambientCampfire && (dimension.id === 'surface' || dimension.id === 'breu'
        || dimension.instanceType === 'arrival' || isPersonalArrivalDimensionId(dimension.id))) {
      const startedAt = now();
      fires.set('arrival', {
        ...(dimension.id === 'surface' ? SPAWN_CAMPFIRE : dimension.campfire || dimension.spawn),
        permanent: true,
        litAt: startedAt,
        flameRiseAt: startedAt,
        flameRiseFrom: 0,
        flameRiseDurationMs: CAMPFIRE_IGNITION_RAMP_MS,
      });
    }
    return fires;
  };
  const saveCampfires = dimensionId => {
    if (typeof storage.saveCampfires !== 'function') return Promise.resolve();
    const previous = fireWrites.get(dimensionId) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => storage.saveCampfires(
      dimensionId,
      [...(firesByDimension.get(dimensionId) || new Map())].map(([id, fire]) => ({ ...fire, id })),
    ));
    fireWrites.set(dimensionId, next);
    return next.catch(error => {
      process.stderr.write(`Could not save campfires: ${error.message}\n`);
      throw error;
    }).finally(() => {
      if (fireWrites.get(dimensionId) === next) fireWrites.delete(dimensionId);
    });
  };
  const loadCampfires = async dimensionId => {
    if (firesByDimension.has(dimensionId)) return firesByDimension.get(dimensionId);
    const saved = typeof storage.loadCampfires === 'function' ? await storage.loadCampfires(dimensionId) : null;
    const fires = saved == null ? initialCampfiresFor(dimensionId)
      : new Map(saved.map(fire => [fire.id, { ...fire }]));
    let migratedArrival = false;
    const dimension = dimensionById(dimensions, dimensionId);
    const arrivalAnchor = dimensionId === 'surface' ? SPAWN_CAMPFIRE
      : dimensionId === 'breu' || isPersonalArrivalDimensionId(dimensionId)
        ? dimension.campfire || dimension.spawn : null;
    const arrival = fires.get('arrival');
    if (arrivalAnchor && arrival?.permanent === true
        && (arrival.x !== arrivalAnchor.x || arrival.y !== arrivalAnchor.y)) {
      arrival.x = arrivalAnchor.x;
      arrival.y = arrivalAnchor.y;
      migratedArrival = true;
    }
    firesByDimension.set(dimensionId, fires);
    if (saved == null || migratedArrival) await saveCampfires(dimensionId);
    return fires;
  };
  const firesFor = dimensionId => {
    if (!firesByDimension.has(dimensionId)) {
      firesByDimension.set(dimensionId, initialCampfiresFor(dimensionId));
    }
    return firesByDimension.get(dimensionId);
  };
  const progressWrites = new Map();
  const roomWrites = new Map();
  const locationWriteStates = new Map();
  const dimensionPositionWriteStates = new Map();
  const dimensionPositionSaveErrors = new Set();
  const mapExplorationWriteStates = new Map();
  const mapExplorationStorageErrors = new Set();
  const locationSaveErrors = new Set();
  let serverClosing = false;
  worldDefinitions.set('surface', emptyWorldDefinition());
  let activeWorldDimensionId = null;
  let activeWorldRevision = -1;
  const worldFor = dimensionId => worldDefinitions.get(dimensionId) || worldDefinitions.get('surface') || emptyWorldDefinition();
  const dimensionsForPlayer = player => {
    const personal = personalArrivalDimension(player.sessionId);
    if (player.canStaffTravelDimensions) return [...dimensions, personal];
    const known = player.discoveredDimensionIds || new Set(['surface', 'breu']);
    return [...dimensions.filter(dimension => known.has(dimension.id)), personal];
  };
  const persistFlatDarkWorld = async (dimension, source) => {
    let current = normalizeWorldDefinition({ ...source, dimensionId: dimension.id });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (hasFlatDarkWorld(current)) return current;
      const cleaned = normalizeWorldDefinition({ ...current, dimensionId: dimension.id, theme: 'dark', edits: [],
        revision: current.revision + 1 });
      try { return await storage.saveWorld(cleaned, current.revision, dimension.id); }
      catch (error) {
        if (error.status !== 409) throw error;
        current = normalizeWorldDefinition({ ...await storage.loadWorld(dimension.id), dimensionId: dimension.id });
      }
    }
    return flatDarkWorld(current, dimension.id);
  };
  const ensurePersonalArrivalWorld = async dimension => {
    if (worldDefinitions.has(dimension.id)) return worldDefinitions.get(dimension.id);
    const stored = normalizeWorldDefinition({ ...await storage.loadWorld(dimension.id), dimensionId: dimension.id, theme: 'dark' });
    let definition = stored;
    if (stored.revision === 0 && stored.edits.length === 0) {
      const seed = Number.parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) >>> 0;
      definition = { ...initialWorldForDimension(dimension, seed), revision: 1 };
      try {
        definition = await storage.saveWorld(definition, 0, dimension.id);
      } catch (error) {
        const latest = await storage.loadWorld(dimension.id);
        if (!latest || latest.revision === 0) throw error;
        definition = latest;
      }
    }
    definition = await persistFlatDarkWorld(dimension, definition);
    worldDefinitions.set(dimension.id, normalizeWorldDefinition({ ...definition, dimensionId: dimension.id, theme: 'dark' }));
    await loadCampfires(dimension.id);
    return worldDefinitions.get(dimension.id);
  };
  const activateWorld = dimensionId => {
    const key = worldDefinitions.has(dimensionId) ? dimensionId : 'surface';
    const definition = worldFor(key);
    if (activeWorldDimensionId !== key || activeWorldRevision !== definition.revision) {
      applyWorldDefinition(definition);
      activeWorldDimensionId = key;
      activeWorldRevision = definition.revision;
    }
    return definition;
  };
  const ensureWildlifeForArea = (dimensionId, area) => {
    if (isPersonalArrivalDimensionId(dimensionId)) return;
    activateWorld(dimensionId);
    const dimension=dimensionById(dimensions,dimensionId);
    const population=wildlifeFor(dimensionId);
    const minZoneX=Math.max(0,Math.floor(area.left/WILDLIFE_ZONE_SIZE));
    const maxZoneX=Math.min(Math.ceil(WORLD_SIZE/WILDLIFE_ZONE_SIZE)-1,Math.floor(area.right/WILDLIFE_ZONE_SIZE));
    const minZoneY=Math.max(0,Math.floor(area.top/WILDLIFE_ZONE_SIZE));
    const maxZoneY=Math.min(Math.ceil(WORLD_SIZE/WILDLIFE_ZONE_SIZE)-1,Math.floor(area.bottom/WILDLIFE_ZONE_SIZE));
    for(let zoneY=minZoneY;zoneY<=maxZoneY;zoneY+=1)for(let zoneX=minZoneX;zoneX<=maxZoneX;zoneX+=1){
      const zoneKey=`${dimensionId}:${zoneX}:${zoneY}`;
      if(generatedWildlifeZones.has(zoneKey))continue;
      if(population.size>=WILDLIFE_POPULATION_LIMIT)continue;
      generatedWildlifeZones.add(zoneKey);
      const nearPlayers=[...peers.values()].filter(player=>player.location==='clearing'&&(player.dimensionId||'surface')===dimensionId);
      const bounds={left:zoneX*WILDLIFE_ZONE_SIZE,right:(zoneX+1)*WILDLIFE_ZONE_SIZE,
        top:zoneY*WILDLIFE_ZONE_SIZE,bottom:(zoneY+1)*WILDLIFE_ZONE_SIZE};
      const trees=getSolidTreesInBounds(bounds),rocks=getRocksInBounds(bounds);
      const centre={x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
      const waterOptions={dimensionId,theme:dimension.theme,origin:WORLD_ORIGIN};
      const waterPoints=[];
      for(const ring of [4,8,12])for(let index=0;index<8;index++){
        const point={x:centre.x+Math.cos(index*Math.PI/4)*ring,y:centre.y+Math.sin(index*Math.PI/4)*ring};
        const depth=waterStateAt(point.x,point.y,waterOptions).depth;
        if(depth>.08&&depth<1.05)waterPoints.push(point);
      }
      const awayFromVillage=position=>wildlifeOutsideVillage(position,dimensionId);
      const habitat={farm:false,woodland:trees.length>=3,rocky:rocks.length>0,water:waterPoints.length>0,
        meadow:trees.length<12,settlementDistance:dimensionId==='surface'?Math.hypot(centre.x-SPAWN_CAMPFIRE.x,centre.y-SPAWN_CAMPFIRE.y):Infinity};
      const spawned=createWildlifeForZone({dimensionId,theme:dimension.theme,zoneX,zoneY,now:now(),habitat,
        canSpawn:(position,definition)=>awayFromVillage(position)
          &&canOccupy(position,definition.stats.radius)
          &&waterStateAt(position.x,position.y,waterOptions).depth<.25
          &&nearPlayers.every(player=>Math.hypot(position.x-player.position.x,position.y-player.position.y)>3)
          &&[...population.values()].every(other=>Math.hypot(position.x-other.x,position.y-other.y)>1.5),
        shelterAt:(kind,x,y,random,definition)=>{
          const treeKinds=['burrow','tree-hollow','canopy-nest','high-nest','thicket','den','root-hollow','hedge-nest'];
          const rockKinds=['cave','rock-shelter','warm-rock'];
          const anchors=treeKinds.includes(kind)?trees:rockKinds.includes(kind)?rocks:kind==='pond-edge'?waterPoints:[{x,y}];
          const nearest=[...anchors].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)).slice(0,8);
          for(const anchor of nearest){
            for(let attempt=0;attempt<8;attempt++){
              const angle=random()*Math.PI*2,offset=(anchor.r||.3)+definition.stats.radius+.14;
              const position={x:anchor.x+Math.cos(angle)*offset,y:anchor.y+Math.sin(angle)*offset};
              if(Math.hypot(position.x-x,position.y-y)>10||!awayFromVillage(position))continue;
              if(isPathTile(position.x,position.y)||isPathTile(position.x+.75,position.y)||isPathTile(position.x-.75,position.y)
                  ||isPathTile(position.x,position.y+.75)||isPathTile(position.x,position.y-.75))continue;
              if(canOccupy(position,definition.stats.radius)&&waterStateAt(position.x,position.y,waterOptions).depth<.25){
                const coverKind=treeKinds.includes(kind)?'tree':rockKinds.includes(kind)?'rock':kind==='pond-edge'?'reeds':'grass';
                return {...position,cover:{kind:coverKind,id:anchor.id||`${kind}:${anchor.x}:${anchor.y}`,x:anchor.x,y:anchor.y}};
              }
            }
          }
          return null;
        }});
      for(const animal of spawned.slice(0,Math.max(0,WILDLIFE_POPULATION_LIMIT-population.size)))population.set(animal.id,animal);
    }
  };
  let worldSyncTimer = null;
  let worldSyncRunning = null;
  let marketRefreshTimer = null;
  let leaseRenewalTimer = null;

  const persistPlayer = (player, interaction = null, dimensionDiscovery = null) => {
    if (!player.accountId) return interaction ? storage.recordInteraction(interaction) : undefined;
    const previous = progressWrites.get(player.accountId) || Promise.resolve();
      const next = previous.catch(() => {}).then(() => dimensionDiscovery && storage.saveProgressAndDiscoverDimension
        ? storage.saveProgressAndDiscoverDimension(player.accountId, inventorySnapshot(player.inventory), dimensionDiscovery.dimensionId, dimensionDiscovery.source)
        : interaction
          ? storage.saveProgressAndRecordInteraction(player.accountId, inventorySnapshot(player.inventory), interaction)
          : storage.saveProgress(player.accountId, inventorySnapshot(player.inventory)));
    progressWrites.set(player.accountId, next);
    return next.catch(error => {
      process.stderr.write(`Could not save player progress: ${error.message}\n`);
      throw error;
    });
  };

  const persistMarketSale = (player, itemId, quantity) => {
    const profileId = player.accountId;
    if (!profileId || !storage.settleNpcSale) return Promise.reject(new Error('O mercado persistente não está disponível.'));
    const previous = progressWrites.get(profileId) || Promise.resolve();
    const inventoryAfter = inventorySnapshot(player.inventory);
    const next = previous.catch(() => {}).then(() => storage.settleNpcSale({
      profileId, itemId, quantity, inventoryAfter, governmentId:marketGovernmentId,
    }));
    progressWrites.set(profileId, next);
    return next.catch(error => {
      process.stderr.write(`Could not settle market sale: ${error.message}\n`);
      throw error;
    });
  };

  const persistWorldCollection = (player, definition, expectedRevision, interaction, inventory) => {
    const save = () => storage.saveWorldAndProgressAndRecordInteraction(
      definition, expectedRevision, player.dimensionId, player.accountId || null,
      player.accountId ? inventorySnapshot(inventory) : null, interaction,
    );
    if (!player.accountId) return save();
    const previous = progressWrites.get(player.accountId) || Promise.resolve();
    const next = previous.catch(() => {}).then(save);
    progressWrites.set(player.accountId, next);
    return next.catch(error => {
      process.stderr.write('Could not save player collection: ' + error.message + '\n');
      throw error;
    });
  };

  const persistWorldAndProgress = (player, definition, expectedRevision) => {
    const save=()=>storage.saveWorldAndProgress(definition,expectedRevision,player.dimensionId,
      player.accountId||null,player.accountId?inventorySnapshot(player.inventory):null);
    if(!player.accountId)return save();
    const previous=progressWrites.get(player.accountId)||Promise.resolve();
    const next=previous.catch(()=>{}).then(save);
    progressWrites.set(player.accountId,next);
    return next;
  };
  const persistWoodworkState = async (player, definition, expectedRevision) => {
    if(typeof storage.saveWorldAndProgress==='function')
      return persistWorldAndProgress(player,definition,expectedRevision);
    await persistPlayer(player);
    return storage.saveWorld(definition,expectedRevision,player.dimensionId);
  };

  const campfireCostText = cost => [
    cost.wood > 0 ? `${cost.wood} ${cost.wood === 1 ? 'graveto' : 'gravetos'}` : null,
    cost.stone > 0 ? `${cost.stone} ${cost.stone === 1 ? 'pedra' : 'pedras'}` : null,
    cost.leaves > 0 ? `${cost.leaves === 1 ? 'um maço de folhas secas' : `${cost.leaves} maços de folhas secas`}` : null,
  ].filter(Boolean).join(' + ');
  const spendCampfireMaterials = async (player, cost) => {
    if (!Object.entries(cost).every(([kind,quantity]) => (player.inventory[kind] || 0) >= quantity)) return 'materials';
    for (const [kind,quantity] of Object.entries(cost)) player.inventory[kind] -= quantity;
    try {
      await persistPlayer(player);
      return 'ok';
    } catch {
      for (const [kind,quantity] of Object.entries(cost)) player.inventory[kind] += quantity;
      return 'save';
    }
  };
  const refundCampfireMaterials = async (player, cost) => {
    for (const [kind,quantity] of Object.entries(cost)) player.inventory[kind] += quantity;
    try { await persistPlayer(player); } catch {}
  };
  const startCampfireRise = (fire, at, from) => {
    fire.litAt = at;
    fire.flameRiseAt = at;
    fire.flameRiseFrom = Math.max(0, Math.min(1, from));
    fire.flameRiseDurationMs = CAMPFIRE_IGNITION_RAMP_MS;
  };
  const serializeCampfireAction = (dimensionId, action) => {
    const previous = campfireActionQueues.get(dimensionId) || Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    campfireActionQueues.set(dimensionId, current);
    return current.finally(() => {
      if (campfireActionQueues.get(dimensionId) === current) campfireActionQueues.delete(dimensionId);
    });
  };

  const persistRoom = player => {
    if (!player.accountId) return Promise.resolve();
    const previous = roomWrites.get(player.accountId) || Promise.resolve();
    const furniture = player.roomFurniture.map(item => ({ ...item }));
    const storageKey=player.roomKind === 'lodging' ? lodgingStorageKey({ ...lodgingLocation(player.roomKey), mode:player.roomLodgingMode || player.lodgingClaim?.mode }) : null;
    const next = previous.catch(() => {}).then(() => storage.saveRoom(player.accountId, furniture, storageKey));
    roomWrites.set(player.accountId, next);
    return next.catch(error => {
      process.stderr.write(`Could not save player room: ${error.message}\n`);
      throw error;
    });
  };

  const locationCheckpoint = player => {
    const origin = player.staffRoomReturn;
    const location = origin?.location || player.location;
    const dimensionId = origin?.dimensionId || player.dimensionId || 'surface';
    const position = origin?.position || player.position;
    const roomKey = origin ? (origin.location === 'room' ? origin.roomKey : player.homeRoomKey) : player.roomKey;
    return { location, dimensionId, x: position.x, y: position.y, roomKey,
      roomOwnerName: (origin?.roomState || player.roomState)?.name || player.name,
      color: player.color, worldVersion: coordinateVersionForDimension(dimensionId) };
  };
  const sameLocationCheckpoint = (a, b) => Boolean(a && b
    && a.location === b.location && a.dimensionId === b.dimensionId && a.x === b.x && a.y === b.y
    && a.roomKey === b.roomKey && a.roomOwnerName === b.roomOwnerName && a.color === b.color);
  const sameDimensionPosition=(a,b)=>Boolean(a&&b&&a.dimensionId===b.dimensionId&&a.x===b.x&&a.y===b.y&&a.worldVersion===b.worldVersion);
  const persistPlayerDimensionPosition=(player,dimensionId=player.dimensionId,position=player.position,force=false)=>{
    if(player.location!=='clearing'||typeof dimensionId!=='string'||!Number.isFinite(position?.x)||!Number.isFinite(position?.y))return Promise.resolve();
    const checkpoint={dimensionId,x:position.x,y:position.y,worldVersion:coordinateVersionForDimension(dimensionId)};
    player.dimensionPositions ||= new Map();player.persistedDimensionPositions ||= new Map();
    player.dimensionPositions.set(dimensionId,checkpoint);
    if(!player.accountId||typeof storage.savePlayerDimensionPosition!=='function')return Promise.resolve();
    if(!force&&sameDimensionPosition(checkpoint,player.persistedDimensionPositions.get(dimensionId)))return Promise.resolve();
    const key=`${player.sessionId}:${dimensionId}`;let state=dimensionPositionWriteStates.get(key);
    if(state){if(!sameDimensionPosition(checkpoint,state.inFlight)&&!sameDimensionPosition(checkpoint,state.pending))state.pending=checkpoint;return state.promise;}
    state={inFlight:null,pending:checkpoint,promise:null};dimensionPositionWriteStates.set(key,state);
    state.promise=(async()=>{
      while(state.pending){const next=state.pending;state.pending=null;state.inFlight=next;
        try{await storage.savePlayerDimensionPosition(player.sessionId,next);player.persistedDimensionPositions.set(dimensionId,next);dimensionPositionSaveErrors.delete(key);}
        catch(error){if(!dimensionPositionSaveErrors.has(key)){process.stderr.write(`Could not save player dimension position: ${error.message}\n`);dimensionPositionSaveErrors.add(key);}}
        finally{state.inFlight=null;}
      }
    })().finally(()=>{if(dimensionPositionWriteStates.get(key)===state)dimensionPositionWriteStates.delete(key);});
    return state.promise;
  };

  const updatePlayerMapExploration=(player)=>{
    if(player.location!=='clearing'||player.socket.readyState!==WebSocket.OPEN)return;
    const dimensionId=player.dimensionId||'surface';
    player.mapExplorationByDimension ||= new Map();
    let state=player.mapExplorationByDimension.get(dimensionId);
    if(!state){
      state={cells:new Set(),lastCell:-1,loading:true};player.mapExplorationByDimension.set(dimensionId,state);
      void (async()=>{
        try{if(typeof storage.loadPlayerMapExploration==='function')state.cells=new Set(await storage.loadPlayerMapExploration(player.sessionId,dimensionId));}
        catch(error){const key=player.sessionId+':'+dimensionId;if(!mapExplorationStorageErrors.has(key)){process.stderr.write(`Could not load map exploration: ${error.message}\n`);mapExplorationStorageErrors.add(key);}}
        state.loading=false;
        if(player.socket.readyState===WebSocket.OPEN&&player.dimensionId===dimensionId){player.socket.send(JSON.stringify({type:'mapExploration',dimensionId,chunks:[...state.cells]}));updatePlayerMapExploration(player);}
      })();
      return;
    }
    if(state.loading)return;
    const x=Math.max(0,Math.min(WORLD_SIZE-.1,player.position.x)),y=Math.max(0,Math.min(WORLD_SIZE-.1,player.position.y));
    const cell=Math.floor(y/WORLD_MAP_GRID.chunkSize)*WORLD_MAP_GRID.columns+Math.floor(x/WORLD_MAP_GRID.chunkSize);
    if(cell===state.lastCell)return;state.lastCell=cell;
    const added=discoverWorldMapCells({x,y},WORLD_MAP_GRID,state.cells,mapDiscoveryRadiusForAbilities(player.inventory.learnedAbilities));if(!added.length)return;
    player.socket.send(JSON.stringify({type:'mapExploration',dimensionId,chunks:[...state.cells]}));
    if(typeof storage.savePlayerMapExploration!=='function')return;
    const key=player.sessionId+':'+dimensionId;let write=mapExplorationWriteStates.get(key);
    if(write){write.pending=[...state.cells];return;}
    write={pending:[...state.cells],promise:null};mapExplorationWriteStates.set(key,write);
    write.promise=(async()=>{while(write.pending){const cells=write.pending;write.pending=null;try{await storage.savePlayerMapExploration(player.sessionId,dimensionId,cells);mapExplorationStorageErrors.delete(key);}catch(error){if(!mapExplorationStorageErrors.has(key)){process.stderr.write(`Could not save map exploration: ${error.message}\n`);mapExplorationStorageErrors.add(key);}}}})().finally(()=>{if(mapExplorationWriteStates.get(key)===write)mapExplorationWriteStates.delete(key);});
  };

  const persistPlayerLocation = (player, force = false) => {
    if (!player.sessionId || !Number.isFinite(player.position?.x) || !Number.isFinite(player.position?.y)) {
      return Promise.resolve();
    }
    const checkpoint = locationCheckpoint(player);
    if (!force && sameLocationCheckpoint(checkpoint, player.persistedLocation)) return Promise.resolve();

    let state = locationWriteStates.get(player.sessionId);
    if (state) {
      if (!sameLocationCheckpoint(checkpoint, state.inFlight)
          && !sameLocationCheckpoint(checkpoint, state.pending)) state.pending = checkpoint;
      return state.promise;
    }

    state = { inFlight: null, pending: checkpoint, promise: null };
    locationWriteStates.set(player.sessionId, state);
    state.promise = (async () => {
      while (state.pending) {
        const next = state.pending;
        state.pending = null;
        state.inFlight = next;
        try {
          await storage.savePlayerLocation(player.sessionId, next);
          player.persistedLocation = next;
          locationSaveErrors.delete(player.sessionId);
        } catch (error) {
          if (!locationSaveErrors.has(player.sessionId)) {
            process.stderr.write(`Could not save player location: ${error.message}\n`);
            locationSaveErrors.add(player.sessionId);
          }
        } finally {
          state.inFlight = null;
        }
      }
    })().finally(() => {
      if (locationWriteStates.get(player.sessionId) === state) locationWriteStates.delete(player.sessionId);
    });
    return state.promise;
  };

  const personalSnapshot = viewer => ({
      inventoryState: { seq: viewer.inventorySeq || 0, inventory: inventorySnapshot(viewer.inventory) },
      flightPilotAllowed: viewer.flightPilotEnabled === true,
      roomOwnerName: viewer.roomState.name,
      roomCanEdit: canEditCurrentRoom(viewer),
      canOwnerVisitHomes: viewer.canOwnerVisitHomes === true,
      objectCatalog: viewer.objectCatalogRevisionSeen === (sceneObjectCatalog?.revision ?? -1)
        ? null : sceneObjectCatalog,
      roomKey: viewer.roomKey,
      roomKind: viewer.roomKind,
      roomBuildingId: viewer.roomBuildingId,
      roomLodgingMode: viewer.roomLodgingMode || null,
      lodgingClaim: viewer.lodgingClaim || null,
      lodgingClaims: viewer.lodgingClaims || [], lodgingLeases: viewer.lodgingLeases || [],
      lodgingLease: viewer.lodgingLease || null,
      dimensions: dimensionsForPlayer(viewer),
      recurringLeasesAvailable: storage.recurringLeasesAvailable === true,
      cabinKeys: (viewer.cabinKeys || []).map(({ buildingId, isOwner }) => ({ buildingId, isOwner })),
      issuedCabinKeys: viewer.issuedCabinKeys || [],
      cabinOccupancy,
      propertyListings, propertyRentalListings, propertyRequests:viewer.propertyRequests || [],
      resourceContracts: resourceContractBoard(viewer.contractState, Date.now()),
      marketQuotes,
      governmentTaxPanel: viewer.governmentTaxPanel || null,
      resourceContractsRequireAccount: !viewer.accountId,
      arrivalTutorial: viewer.arrivalTutorial || null,
  });

  const snapshot = (viewer, includeWorld = true, includeWildlife = true) => {
    const dimensionId = viewer.dimensionId || 'surface';
    const area = aoiWindow(viewer.position, viewer.aoiRadius);
    const serverWallTimeMs = Date.now();
    if(viewer.location==='clearing')ensureWildlifeForArea(dimensionId,{left:area.center.x-area.radius,right:area.center.x+area.radius,top:area.center.y-area.radius,bottom:area.center.y+area.radius});
    const players = spatialIndex.query(playerContextId(viewer), area.center, area.radius).map(player => ({
        id: player.id,
        name: player.name,
        x: player.position.x,
        y: player.position.y,
        vx: player.position.vx ?? 0,
        vy: player.position.vy ?? 0,
        z: player.position.z ?? 0,
        vz: player.position.vz ?? 0,
        ...(player.flightPilotEnabled ? { flightZ: Number.isFinite(player.position.flightZ) ? player.position.flightZ : null,
          blocked: player.position.blocked === true } : {}),
        jumpHeld: player.position.jumpHeld ?? 0,
        fireJumping: player.position.fireJumping === true,
        ...(Number(player.position.burningRemainingMs)>0?{burningRemainingMs:player.position.burningRemainingMs}:{}),
        running: player.position.running ?? 0,
        crouching: player.position.crouching ?? 0,
        location: player.location,
        dimensionId: player.dimensionId || 'surface',
        moving: player.moving,
        sitting: player.sitting === true,
        inputSeq: player.inputSeq,
        movementLocked: Boolean(player.pendingDimensionTransitId),
        ...(player.id === viewer.id ? { dimensionTravelCooldownUntil: player.dimensionTravelCooldownUntil || 0, hasteRemainingMs: Math.max(0,(player.hasteUntil||0)-performance.now()), sprintBurstRemainingMs: player.location === 'clearing' ? Math.max(0,(player.sprintBurstUntil||0)-performance.now()) : 0, abilityCooldowns:Object.fromEntries([...(player.abilityCooldowns||new Map())].map(([abilityId,readyAt])=>[abilityId,Math.max(0,Math.ceil(readyAt-performance.now()))]).filter(([,remainingMs])=>remainingMs>0)) } : {}),
        ...(!viewer.compactPlayers ? { inventory: inventorySnapshot(player.inventory) } : {}),
        hasLodging: Boolean(player.lodgingClaim && (player.lodgingClaim.mode === 'owned' || player.lodgingClaim.expiresAt > now())),
        privateLodging: isCabin(player.lodgingClaim?.buildingId),
        emote: player.emote && (['sit','lie','shower'].includes(player.emote.name) || player.emote.until > now()) ? player.emote.name : null,
        emoteUntil: player.emote?.until ?? 0,
        furnitureUse:player.furnitureUse?{id:player.furnitureUse.id,kind:player.furnitureUse.kind,action:player.furnitureUse.action,rotation:player.furnitureUse.rotation}:null,
        chat: player.chat && player.chat.until > now() ? player.chat.text : null,
        chatAt: player.chat && player.chat.until > now() ? player.chat.sentAt : 0,
        color: player.color, appearance: player.appearance,
      }));
    const dimensionTransits = viewer.location === 'clearing' ? [...activeDimensionTransits.values()]
      .filter(transit => transit.sourceDimensionId === dimensionId || transit.destinationDimensionId === dimensionId)
      .map(transit => {
        if (viewer.id === transit.actorId && transit.destinationWorldDefinition && !transit.destinationWorldDefinitionSent) {
          transit.destinationWorldDefinitionSent = true;
          return transit;
        }
        const { destinationWorldDefinition, destinationWorldDefinitionSent, ...publicTransit } = transit;
        return publicTransit;
      }) : [];
    const state = {
      type: 'state',
      dimensionId,
      serverTime: performance.now(),
      villageActors: viewer.location === 'clearing' ? villageActorsFor({
        dimensionId, location:viewer.location, now:serverWallTimeMs,
        bounds:{left:area.center.x-area.radius,right:area.center.x+area.radius,
          top:area.center.y-area.radius,bottom:area.center.y+area.radius},
      }) : [],
      animals: viewer.location==='clearing'?(includeWildlife?[...wildlifeFor(dimensionId).values()]
        .filter(animal=>isInsideAoi(animal,area)||isInsideAoi({x:animal.shelterX,y:animal.shelterY},area)).map(serializeWildlifeForNetwork):undefined):[],
      serverWallTimeMs,
      players,
      ...(dimensionTransits.length ? { dimensionTransits } : {}),
      objectCatalogRevision:sceneObjectCatalog?.revision??-1,
    };
    if (!includeWorld) return state;

    const definition = activateWorld(dimensionId);
    return {
      ...state,
      dimensionId,
      dimension: dimensionById(dimensions, dimensionId),
      dimensions: dimensionsForPlayer(viewer),
      worldDefinition: definition,
      resources: viewer.location === 'clearing'
        ? getResourcesInBounds({ left:area.center.x-area.radius, right:area.center.x+area.radius,
          top:area.center.y-area.radius, bottom:area.center.y+area.radius })
          .filter(resource => !resourceState(dimensionId).collected.has(resource.id) && isInsideAoi(resource, area))
        : [],
      fires: viewer.location === 'clearing' ? [...firesFor(dimensionId).values()]
        .filter(item => isInsideAoi(item, area))
        .map(item => {
          const sampledAt = now();
          const flameRiseDurationMs = Number.isFinite(item.flameRiseDurationMs)
            ? item.flameRiseDurationMs : CAMPFIRE_IGNITION_RAMP_MS;
          return {
            ...item,
            burnRemainingMs: campfireRemainingMs(item, sampledAt),
            burnedOutForMs: campfireBurnedOutForMs(item, sampledAt),
            decayProgress: campfireDecayProgress(item, sampledAt),
            flameRiseDurationMs,
            flameRiseRemainingMs: Number.isFinite(item.flameRiseAt)
              ? Math.max(0, flameRiseDurationMs - Math.max(0, sampledAt - item.flameRiseAt)) : 0,
          };
        }) : [],
      roomFurniture: viewer.location === 'room' ? viewer.roomFurniture.map(item => ({ ...item })) : [],
    };
  };

  const streamSnapshots = createSnapshotStream({
    compressMovement: compressMovementSnapshots,
    groupKey: snapshotGroupKey,
    personalize: personalSnapshot,
    personalFields: [
      'inventoryState', 'flightPilotAllowed', 'roomOwnerName', 'roomCanEdit', 'canOwnerVisitHomes', 'roomKey', 'roomKind', 'roomBuildingId',
      'roomLodgingMode', 'lodgingClaim', 'lodgingClaims', 'lodgingLeases', 'lodgingLease', 'recurringLeasesAvailable', 'cabinKeys',
      'issuedCabinKeys', 'cabinOccupancy', 'propertyListings', 'propertyRentalListings', 'propertyRequests', 'resourceContracts', 'marketQuotes', 'objectCatalog',
      'governmentTaxPanel', 'resourceContractsRequireAccount', 'arrivalTutorial', 'dimensions',
    ],
  });
  let pendingBroadcast = null;
  let pendingBroadcastRefreshWorld = false;
  const broadcast = (refreshWorld = true) => {
    if (serverClosing) return;
    pendingBroadcastRefreshWorld ||= refreshWorld;
    if (pendingBroadcast) return;
    pendingBroadcast = setImmediate(() => {
      pendingBroadcast = null;
      const refresh = pendingBroadcastRefreshWorld;
      pendingBroadcastRefreshWorld = false;
      streamSnapshots(peers, (player, includeWorld, includeWildlife) => snapshot(player, includeWorld, includeWildlife), now(), refresh);
    });
  };
  const snapshotTimer = setInterval(() => broadcast(false), Math.max(1, Number(snapshotIntervalMs) || SNAPSHOT_MS));
  snapshotTimer.unref();
  const DIMENSION_TRANSIT_SOURCE_FADE_MS = 420;
  const DIMENSION_TRANSIT_BLACK_MIN_MS = 3_100;
  const DIMENSION_TRAVEL_COOLDOWN_MS = 5_000;
  const DIMENSION_TRANSIT_READY_TIMEOUT_MS = 120_000;
  const clearDimensionTransitTimer = key => {
    const timer = dimensionTransitTimers.get(key);
    if (timer) clearTimeout(timer);
    dimensionTransitTimers.delete(key);
  };
  const removeDimensionTransit = transit => {
    if (!transit || activeDimensionTransits.get(transit.id) !== transit) return;
    activeDimensionTransits.delete(transit.id);
    for (const key of [transit.id, 'ready:'+transit.id, 'unlock:'+transit.id, 'expire:'+transit.id]) clearDimensionTransitTimer(key);
    broadcast(false);
  };
  const scheduleDimensionTransitExpiry = transit => {
    clearDimensionTransitTimer(`expire:${transit.id}`);
    const endsAt = transit.destinationStartAt + transit.durationMs;
    const timer = setTimeout(() => removeDimensionTransit(transit), Math.max(0, endsAt - performance.now() + 80));
    timer.unref?.();
    dimensionTransitTimers.set(`expire:${transit.id}`, timer);
  };
  const announceDimensionTransitReady = transit => {
    if (!transit || activeDimensionTransits.get(transit.id) !== transit || Number.isFinite(transit.destinationStartAt)) return false;
    transit.destinationStartAt = Math.max(performance.now() + 80, transit.transferAt + DIMENSION_TRANSIT_BLACK_MIN_MS);
    clearDimensionTransitTimer(`ready:${transit.id}`);
    scheduleDimensionTransitExpiry(transit);
    return true;
  };
  const scheduleResourceCooldown = (dimensionId, cooldown, delayOverride = null) => {
    const state = resourceState(dimensionId);
    const existing = state.respawns.get(cooldown.id);
    if (existing?.readyAt === cooldown.readyAt) return;
    if (existing) clearTimeout(existing.timer);
    const delay = delayOverride === null ? Math.max(0, cooldown.readyAt - Date.now()) : Math.max(0, delayOverride);
    const timer = setTimeout(() => {
      state.respawns.delete(cooldown.id);
      void expireResourceCooldown(dimensionId, cooldown.id, cooldown.sourceId);
    }, Math.min(delay, 2_147_000_000));
    timer.unref?.();
    state.respawns.set(cooldown.id, { timer, sourceId: cooldown.sourceId, readyAt: cooldown.readyAt });
  };
  const scheduleTreeRegrowth = (dimensionId, marker, delayOverride = null) => {
    const state = resourceState(dimensionId);
    if (state.treeRespawns.has(marker.id)) return;
    const readyAt = marker.nextGrowthAt ?? marker.respawnAt;
    const delay = delayOverride === null ? Math.max(0, readyAt - Date.now()) : Math.max(0, delayOverride);
    const timer = setTimeout(() => {
      state.treeRespawns.delete(marker.id);
      void expireTreeRegrowth(dimensionId, marker.id);
    }, Math.min(delay, 2_147_000_000));
    timer.unref?.();
    state.treeRespawns.set(marker.id, timer);
  };
  const expireResourceCooldown = async (dimensionId, editId, sourceId) => {
    try {
      const latest = normalizeWorldDefinition(await storage.loadWorld(dimensionId));
      worldDefinitions.set(dimensionId, latest);
      const cooldown = latest.edits.find(edit => edit.id === editId && edit.type === 'resource-cooldown');
      if (!cooldown) {
        resourceState(dimensionId).collected.delete(sourceId);
        activeWorldRevision = -1;
        activateWorld(dimensionId);
        broadcast();
        return;
      }
      if (cooldown.readyAt > Date.now()) { scheduleResourceCooldown(dimensionId, cooldown); return; }
      // Tree drops are created by a particular felling, unlike renewable
      // natural resources. Expiring their pickup cooldown must consume the
      // saved drop as well, otherwise it reappears when the tree regrows.
      const dropId = cooldown.targetId.replace(/^map-/, '');
      const drop = latest.edits.find(edit => edit.id === dropId && edit.type === 'resource');
      const sameFelling = drop && (drop.respawnAt === undefined || drop.respawnAt <= cooldown.readyAt);
      const removeIds = dropId.startsWith('tree-drop-') && sameFelling ? [editId, dropId] : [editId];
      const updated = updateWorldEdits(latest, { removeIds }, { worldSize: WORLD_SIZE });
      const saved = await storage.saveWorld(updated, latest.revision, dimensionId);
      worldDefinitions.set(dimensionId, saved);
      resourceState(dimensionId).collected.delete(cooldown.sourceId);
      activeWorldRevision = -1;
      activateWorld(dimensionId);
      broadcast();
    } catch (error) {
      if (error.status === 409) {
        const latest = normalizeWorldDefinition(await storage.loadWorld(dimensionId));
        worldDefinitions.set(dimensionId, latest);
        const current = latest.edits.find(edit => edit.id === editId && edit.type === 'resource-cooldown');
        if (current) scheduleResourceCooldown(dimensionId, current);
        else resourceState(dimensionId).collected.delete(sourceId);
        activeWorldRevision = -1;
        activateWorld(dimensionId);
        broadcast();
        return;
      }
      process.stderr.write(`Could not restore gathered resource: ${error.message}\n`);
      const current = worldFor(dimensionId).edits.find(edit => edit.id === editId && edit.type === 'resource-cooldown');
      if (current) scheduleResourceCooldown(dimensionId, current, 5_000);
    }
  };
  const expireTreeRegrowth = async (dimensionId, editId) => {
    try {
      const latest = normalizeWorldDefinition(await storage.loadWorld(dimensionId));
      worldDefinitions.set(dimensionId, latest);
      const marker = latest.edits.find(edit => edit.id === editId && edit.type === 'tree-remove' && edit.respawnAt !== undefined);
      if (!marker) { activeWorldRevision = -1; activateWorld(dimensionId); broadcast(); return; }
      const sampledAt = Date.now();
      if ((marker.nextGrowthAt ?? marker.respawnAt) > sampledAt) { scheduleTreeRegrowth(dimensionId, marker); return; }
      let nextMarker = null;
      if (marker.respawnAt > sampledAt && marker.growthStage === 'stump') {
        nextMarker = { ...marker, growthStage:'sapling', nextGrowthAt:Math.min(marker.respawnAt, marker.nextGrowthAt + TREE_SAPLING_MS) };
      } else if (marker.respawnAt > sampledAt && marker.growthStage === 'sapling') {
        nextMarker = { ...marker, growthStage:'youngTree', nextGrowthAt:marker.respawnAt };
      }
      const updated = updateWorldEdits(latest, nextMarker
        ? { upserts:[nextMarker] }
        : { removeIds:[editId] }, { worldSize:WORLD_SIZE });
      const saved = await storage.saveWorld(updated, latest.revision, dimensionId);
      worldDefinitions.set(dimensionId, saved);
      activeWorldRevision = -1;
      activateWorld(dimensionId);
      if (nextMarker) scheduleTreeRegrowth(dimensionId, nextMarker);
      broadcast();
    } catch (error) {
      if (error.status === 409) {
        const latest = normalizeWorldDefinition(await storage.loadWorld(dimensionId));
        worldDefinitions.set(dimensionId, latest);
        const current = latest.edits.find(edit => edit.id === editId && edit.type === 'tree-remove' && edit.respawnAt !== undefined);
        if (current) scheduleTreeRegrowth(dimensionId, current);
        activeWorldRevision = -1;
        activateWorld(dimensionId);
        broadcast();
        return;
      }
      process.stderr.write(`Could not regrow tree: ${error.message}\n`);
      const current = worldFor(dimensionId).edits.find(edit => edit.id === editId && edit.type === 'tree-remove' && edit.respawnAt !== undefined);
      if (current) scheduleTreeRegrowth(dimensionId, current, 5_000);
    }
  };
  const syncWorldTimers = (dimensionId, definition) => {
    const state = resourceState(dimensionId);
    const cooldowns = definition.edits.filter(edit => edit.type === 'resource-cooldown');
    const cooldownIds = new Set(cooldowns.map(edit => edit.id));
    for (const [id, scheduled] of state.respawns) {
      if (cooldownIds.has(id)) continue;
      clearTimeout(scheduled.timer);
      state.respawns.delete(id);
      state.collected.delete(scheduled.sourceId);
    }
    for (const cooldown of cooldowns) scheduleResourceCooldown(dimensionId, cooldown);
    const treeMarkers = definition.edits.filter(edit => edit.type === 'tree-remove' && edit.respawnAt !== undefined);
    const treeMarkerIds = new Set(treeMarkers.map(edit => edit.id));
    for (const [id, timer] of state.treeRespawns) {
      if (treeMarkerIds.has(id)) continue;
      clearTimeout(timer);
      state.treeRespawns.delete(id);
    }
    for (const marker of treeMarkers) scheduleTreeRegrowth(dimensionId, marker);
  };
  const removeFullyDecayedCampfires = async dimensionId => {
    const fires = firesFor(dimensionId);
    const sampledAt = now();
    const removed = [...fires].filter(([, fire]) => campfireDecayProgress(fire, sampledAt) >= 1);
    if (!removed.length) return false;
    for (const [id] of removed) fires.delete(id);
    try {
      await saveCampfires(dimensionId);
      return true;
    } catch {
      for (const [id, fire] of removed) fires.set(id, fire);
      return false;
    }
  };
  const pruneExpiredCampfires = async () => {
    if (fireLifecycleRunning) return;
    fireLifecycleRunning = true;
    let changed = false;
    try {
      for (const dimensionId of firesByDimension.keys()) {
        await serializeCampfireAction(dimensionId, async () => {
          if (await removeFullyDecayedCampfires(dimensionId)) changed = true;
        });
      }
    } finally {
      fireLifecycleRunning = false;
    }
    if (changed) broadcast();
  };

  const notice = (socket, text, sound = 'soft', details = null) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'notice', text, sound, ...(details || {}) }));
  };

  httpServer.on('upgrade', (request, socket, head) => {
    void (async () => {
      let releaseAdmission = () => {};
      let releaseAccountAdmission = () => {};
      const reject = (status, reason) => {
        releaseAdmission();
        releaseAccountAdmission();
        socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n`);
        socket.destroy();
      };
      if (serverClosing) return reject(503, 'Service Unavailable');
      if (new URL(request.url, 'http://localhost').pathname !== '/room') return reject(404, 'Not Found');
      if (request.headers.origin !== allowedOrigin) return reject(403, 'Forbidden');
      if (peers.size + pendingAdmissions >= MAX_PLAYERS) return reject(503, 'Service Unavailable');
      pendingAdmissions += 1;
      let admissionPending = true;
      releaseAdmission = () => {
        if (!admissionPending) return;
        admissionPending = false;
        pendingAdmissions -= 1;
      };
      socket.once('close', releaseAdmission);
      const token = parseCookies(request.headers.cookie).get('clareira_session');
      const identity = await resolveIdentity(token);
      if (!identity?.profile) return reject(401, 'Unauthorized');
      if (socket.destroyed) { releaseAdmission(); releaseAccountAdmission(); return; }
      if (serverClosing) return reject(503, 'Service Unavailable');
      const profile = identity.profile;
      let activeSanctions = [];
      if (!profile.guest && storage.staffManagement?.activeSanctions) {
        try { activeSanctions = await storage.staffManagement.activeSanctions([profile.id]); }
        catch (error) {
          process.stderr.write(`Could not check player sanctions: ${error.message}\n`);
          return reject(503, 'Service Unavailable');
        }
        if (activeSanctions.some(sanction => ['kick', 'suspend', 'ban'].includes(sanction.kind))) {
          return reject(403, 'Forbidden');
        }
      }
      if (!profile.guest) {
        if (pendingAccountAdmissions.has(profile.id)
            || [...peers.values()].some(player => player.accountId === profile.id)) return reject(409, 'Conflict');
        pendingAccountAdmissions.add(profile.id);
        let accountAdmissionPending = true;
        releaseAccountAdmission = () => {
          if (!accountAdmissionPending) return;
          accountAdmissionPending = false;
          pendingAccountAdmissions.delete(profile.id);
        };
        socket.once('close', releaseAccountAdmission);
      }
      const sessionId = randomUUID();
      let registration = null;
      if (coordination.enabled) {
        try {
          registration = await coordination.claimPlayer({
            playerId: profile.id,
            sessionId,
            contextId: 'world.clareira/dimension.surface/place.clearing/instance.surface-clearing',
            location: 'clearing',
          });
        } catch (error) {
          process.stderr.write(`Could not reserve player presence: ${error.message}\n`);
          return reject(503, 'Service Unavailable');
        }
        if (!registration) return reject(409, 'Conflict');
      }
      let transferred = false;
      socket.once('close', () => {
        if (!transferred) void releaseCoordination(registration).catch(() => {});
      });
      try {
        webSocketServer.handleUpgrade(request, socket, head, webSocket => {
          transferred = true;
          // Attach before handing the upgraded socket to connection handlers.
          // `ws` reports max-payload violations as socket errors; an unhandled
          // error here used to terminate the entire room process.
          let payloadErrorReported = false;
          webSocket.on('error', error => {
            if (payloadErrorReported) return;
            payloadErrorReported = true;
            const tooLarge = error?.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH';
            process.stderr.write(JSON.stringify({
              type: 'websocket-client-error', at: new Date(now()).toISOString(),
              reason: tooLarge ? 'payload-too-large' : 'socket-error',
              code: typeof error?.code === 'string' ? error.code : 'unknown',
              transportLimitBytes: MAX_MESSAGE_BYTES,
            }) + '\n');
          });
          const getCurrentProfile = async () => (await resolveIdentity(token))?.profile || null;
          webSocketServer.emit('connection', webSocket, profile, registration, releaseAdmission, releaseAccountAdmission, getCurrentProfile, activeSanctions);
        });
      } catch (error) {
        releaseAdmission();
        releaseAccountAdmission();
        await releaseCoordination(registration).catch(() => {});
        throw error;
      }
    })().catch(error => {
      // An admission can fail before the upgraded socket gets its close event.
      // The pending slot is released by reject(), or by the upgraded connection.
      process.stderr.write(`WebSocket session check failed: ${error.message}\n`);
      releaseAdmission();
      releaseAccountAdmission();
      if (!socket.destroyed) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        socket.destroy();
      }
    });
  });

  const initializePlayerConnection = async (socket, profile, registration, releaseAdmission = () => {}, releaseAccountAdmission = () => {}, getCurrentProfile = async () => profile, initialSanctions = []) => {
    const diagnosticConnectionTag=randomUUID().slice(0,12);
    let oversizedMessageReported=false;
    const rejectOversizedClientMessage=(raw,phase)=>{
      if((raw?.byteLength??raw?.length??0)<=MAX_CLIENT_MESSAGE_BYTES)return false;
      if(!oversizedMessageReported){
        oversizedMessageReported=true;
        let messageType='unknown';
        try{const parsed=JSON.parse(raw.toString('utf8'));if(typeof parsed?.type==='string')messageType=parsed.type.slice(0,40);}catch{}
        process.stderr.write(JSON.stringify({type:'websocket-client-message-rejected',at:new Date(now()).toISOString(),
          reason:'application-payload-too-large',receivedBytes:raw.byteLength??raw.length,
          applicationLimitBytes:MAX_CLIENT_MESSAGE_BYTES,phase,messageType})+'\n');
      }
      if(socket.readyState===WebSocket.OPEN)socket.close(1009,'client message too large');
      return true;
    };
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    const earlyMessages = [];
    const holdEarlyMessage = raw => {
      if(rejectOversizedClientMessage(raw,'setup'))return;
      if (earlyMessages.length >= MAX_EARLY_MESSAGES) {
        socket.close(1008, 'too many messages during player setup');
        return;
      }
      earlyMessages.push(raw);
    };
    socket.on('message', holdEarlyMessage);
    socket.once('close', releaseAccountAdmission);
    if (registration) coordinatedSockets.set(registration.sessionId, socket);
    socket.once('close', () => {
      if (registration) coordinatedSockets.delete(registration.sessionId);
      void releaseCoordination(registration).catch(() => {});
    });
    const sessionId = typeof profile.id === 'string' && profile.id.trim() ? profile.id.trim() : randomUUID();
    const discoveredDimensionIds = new Set(['surface', 'breu']);
    let canStaffTravelDimensions = false;
    let canOwnerVisitHomes = false;
    if (!profile.guest && typeof storage.loadPlayerDimensionDiscoveries === 'function'
        && typeof storage.discoverPlayerDimension === 'function') {
      try {
        await storage.discoverPlayerDimension(sessionId, 'surface', 'starter');
        await storage.discoverPlayerDimension(sessionId, 'breu', 'starter');
        for (const dimensionId of await storage.loadPlayerDimensionDiscoveries(sessionId)) discoveredDimensionIds.add(dimensionId);
      } catch (error) {
        process.stderr.write(`Could not load dimension discoveries: ${error.message}\n`);
        socket.close(1011, 'dimension access unavailable');
        return;
      }
    }
    if (!profile.guest && staffAuthorization?.hasPermission) {
      try {
        canStaffTravelDimensions = await staffAuthorization.hasPermission(profile.id, 'dimensions.staff_travel');
        canOwnerVisitHomes = await staffAuthorization.hasPermission(profile.id, '*', { scopeKey: 'global' });
      } catch (error) {
        process.stderr.write(`Could not load dimension travel permission: ${error.message}\n`);
        socket.close(1011, 'dimension permission unavailable');
        return;
      }
    }
    const savedVisit=resumableSessions.get(sessionId);
    resumableSessions.delete(sessionId);
    const validSavedVisit=savedVisit&&now()-savedVisit.at<120_000?savedVisit:null;
    const id = validSavedVisit?.id || randomUUID().slice(0, 8);
    let durableVisit = null,savedDimensionPositions=[];
    try { durableVisit = await storage.loadPlayerLocation(sessionId); }
    catch (error) { process.stderr.write(`Could not load player location: ${error.message}\n`); }
    if(typeof storage.loadPlayerDimensionPositions==='function'){
      try{savedDimensionPositions=await storage.loadPlayerDimensionPositions(sessionId);}catch(error){process.stderr.write(`Could not load dimension positions: ${error.message}\n`);}
    }
    const resume=validSavedVisit || durableVisit;
    // Flight is transient. Reconnect uses the existing safe ground-position
    // recovery; never replay queued airborne commands after that relocation.
    const recoveringFlight=Number.isFinite(validSavedVisit?.position?.flightZ);
    const profileName = profile.username || profile.displayName;
    const playerName = typeof profileName === 'string' && profileName.trim()
      ? profileName
      : `Visitante ${id.slice(0, 3)}`;
    let lodgingClaim = null, lodgingLease = null;
    let lodgingClaims = [], lodgingLeases = [];
    let cabinKeys = [], issuedCabinKeys = [];
    let contractState = { dayKey:resourceContractDayKey(), completed:[] };
    if (!profile.guest) {
      try { [cabinKeys, issuedCabinKeys] = await Promise.all([storage.getCabinKeys(profile.id), storage.getIssuedCabinKeys(profile.id)]); }
      catch (error) { process.stderr.write(`Could not load cabin keys: ${error.message}\n`); }
      try { lodgingClaims = (await storage.listLodgingClaims(profile.id)).filter(c => c.profileId === profile.id);
        lodgingClaim = lodgingClaims.find(c => lodgingRoomKey(c) === resume?.roomKey) || lodgingClaims[0] || null; }
      catch (error) { process.stderr.write(`Could not load lodging reservation: ${error.message}\n`); }
      if (storage.recurringLeasesAvailable) {
        try { lodgingLeases=storage.getLodgingLeases ? await storage.getLodgingLeases(profile.id) : [];
          lodgingLease=lodgingLeases.find(l=>l.buildingId===lodgingClaim?.buildingId && l.unitNumber===lodgingClaim?.unitNumber)||null; }
        catch (error) { process.stderr.write(`Could not load lodging lease: ${error.message}\n`); }
      }
      try { contractState = await storage.getResourceContractState(profile.id, contractState.dayKey); }
      catch (error) { process.stderr.write(`Could not load resource contracts: ${error.message}\n`); }
    }
    const homeRoomKey = resume?.homeRoomKey || (profile.guest ? `guest:${sessionId}` : `account:${profile.id}`);
    let location = resume?.location === 'room' ? 'room' : 'clearing';
    const savedRoomKey = resume?.roomKey || homeRoomKey;
    const savedRoomDetails = roomDetails(savedRoomKey);
    if (location === 'room' && savedRoomDetails.kind === 'legacy'
        && savedRoomKey !== homeRoomKey && !savedRoomKey.startsWith('account:')) location = 'clearing';
    let forcedCabinOutsideId = null;
    if (location === 'room' && isCabin(savedRoomDetails.buildingId)) {
      const authorized = savedRoomDetails.kind === 'lodging' && cabinKeys.some(key => lodgingRoomKey(cabinClaimForKey(key)) === savedRoomKey);
      if (!authorized) { location = 'clearing'; forcedCabinOutsideId = savedRoomDetails.buildingId; }
    } else if (location === 'room' && savedRoomDetails.kind === 'lodging'
        && (!lodgingClaim || lodgingRoomKey({ ...lodgingClaim, profileId: profile.id }) !== savedRoomKey)) location = 'clearing';
    let roomKey = location === 'room' ? savedRoomKey : homeRoomKey;
    let savedHomeFurniture = resume?.homeFurniture?.map(item => ({ ...item })) || null;
    if (!savedHomeFurniture && !profile.guest && !roomStates.has(homeRoomKey)) {
      try { savedHomeFurniture = await storage.loadRoom(profile.id); }
      catch (error) {
        process.stderr.write(`Could not load player room: ${error.message}\n`);
        socket.close(1011, 'room load failed');
        return;
      }
    }
    let resumedFurniture = resume?.roomFurniture?.map(item => ({ ...item })) || [];
    if (location === 'room' && isCabin(savedRoomDetails.buildingId) && !roomStates.has(roomKey)) {
      const access = cabinKeys.find(key => lodgingRoomKey(cabinClaimForKey(key)) === roomKey);
      if (access) {
        try { resumedFurniture = await storage.loadRoom(access.ownerProfileId, lodgingStorageKey(cabinClaimForKey(access))); }
        catch { socket.close(1011, 'cabin room load failed'); return; }
      }
    }
    if (location === 'room' && roomKey !== homeRoomKey && !roomStates.has(roomKey)
        && !resumedFurniture.length && roomKey.startsWith('account:')) {
      const ownerProfileId = roomKey.slice('account:'.length);
      if (/^[0-9a-f-]{36}$/i.test(ownerProfileId)) {
        try { resumedFurniture = await storage.loadRoom(ownerProfileId); }
        catch (error) { process.stderr.write(`Could not load visited room: ${error.message}\n`); }
      }
    }
    const homeRoomState = roomStates.get(homeRoomKey) || {
      furniture: savedHomeFurniture || (roomKey === homeRoomKey ? resumedFurniture : []),
      name: playerName,
      kind: 'legacy',
      buildingId: null,
    };
    roomStates.set(homeRoomKey, homeRoomState);
    const activeRoomDetails = roomDetails(roomKey);
    const activeRoomMode = activeRoomDetails.kind === 'lodging' && isCabin(activeRoomDetails.buildingId) ? 'owned' : lodgingClaim?.mode;
    const activeRoomLayout = getRoomLayout(activeRoomDetails.kind, activeRoomDetails.buildingId, activeRoomMode);
    const ownLodgingKey = lodgingClaim ? lodgingRoomKey({ ...lodgingClaim, profileId: profile.id }) : null;
    const isOwnLodgingRoom = roomKey === ownLodgingKey;
    let roomState = roomStates.get(roomKey) || (roomKey === homeRoomKey ? homeRoomState : {
      furniture: isOwnLodgingRoom ? await storage.loadRoom(profile.id, lodgingStorageKey(lodgingClaim)) : resumedFurniture,
      name: roomDisplayName(roomKey, playerName, lodgingClaim),
      kind: activeRoomDetails.kind,
      buildingId: activeRoomDetails.buildingId,
    });
    roomState.kind ||= activeRoomDetails.kind;
    roomState.buildingId ??= activeRoomDetails.buildingId;
    roomStates.set(roomKey, roomState);
    if (lodgingClaim) {
      const lodgingKey = lodgingRoomKey({ ...lodgingClaim, profileId: profile.id });
      const detail = roomDetails(lodgingKey);
      if (!roomStates.has(lodgingKey)) roomStates.set(lodgingKey, {
        furniture: await storage.loadRoom(profile.id, lodgingStorageKey(lodgingClaim)), name: roomDisplayName(lodgingKey, playerName, lodgingClaim), kind: detail.kind, buildingId: detail.buildingId,
      });
    }
    const arrivalDimension = personalArrivalDimension(sessionId);
    const dimensionId = !forcedCabinOutsideId && resume?.dimensionId === arrivalDimension.id
      ? arrivalDimension.id
      : !forcedCabinOutsideId && !resume && arrivalTutorialEnabled
        ? arrivalDimension.id
        : !forcedCabinOutsideId && dimensions.some(item => item.id === resume?.dimensionId) ? resume.dimensionId : 'surface';
    if (dimensionId === arrivalDimension.id) await ensurePersonalArrivalWorld(arrivalDimension);
    activateWorld(dimensionId);
    const discardSavedRoomPosition = resume?.location === 'room' && location !== 'room';
    const forcedCabinDoor = forcedCabinOutsideId && villageBuildingById.get(forcedCabinOutsideId)?.door;
    const originalSavedPosition = forcedCabinDoor ? { x: forcedCabinDoor.x, y: forcedCabinDoor.y + .6 }
      : discardSavedRoomPosition || resume?.dimensionId !== dimensionId || isPersonalArrivalDimensionId(dimensionId)
        ? null : resume?.position || resume;
    const resumeWorldVersion = Number.isSafeInteger(resume?.worldVersion) ? resume.worldVersion : 1;
    const savedSurfacePosition = originalSavedPosition && dimensionId === 'surface' && resume?.location !== 'room' && resumeWorldVersion < WORLD_COORDINATE_VERSION
      ? { ...originalSavedPosition, x: originalSavedPosition.x + DIMENSION_COORDINATE_OFFSET,
        y: originalSavedPosition.y + DIMENSION_COORDINATE_OFFSET }
      : originalSavedPosition;
    const savedPosition = dimensionId === 'surface'
      ? savedSurfacePosition
      : originalSavedPosition && isBareDarkDimension(dimensionById(dimensions, dimensionId))
        && resumeWorldVersion < DARK_WORLD_COORDINATE_VERSION
        ? { ...originalSavedPosition, x: originalSavedPosition.x + DARK_WORLD_COORDINATE_OFFSET.x,
          y: originalSavedPosition.y + DARK_WORLD_COORDINATE_OFFSET.y }
        : originalSavedPosition;
    const restoredPosition = location === 'clearing' && savedPosition
      && Number.isFinite(savedPosition.x) && Number.isFinite(savedPosition.y)
      ? findNearbyPosition(savedPosition, [
        ...spatialIndex.query(playerContextId({ location: 'clearing', dimensionId }), savedPosition, 10).map(existing => existing.position),
        ...firesFor(dimensionId).values(),
      ])
      : null;
    const canRestorePosition = savedPosition && Number.isFinite(savedPosition.x) && Number.isFinite(savedPosition.y)
      && (location === 'room'
        ? canOccupyRoom(savedPosition, PLAYER_RADIUS, roomState.furniture, activeRoomLayout)
        : canOccupy(savedPosition) && Boolean(restoredPosition));
    let position;
    if (canRestorePosition) {
      position = {
        x: restoredPosition?.x ?? savedPosition.x,
        y: restoredPosition?.y ?? savedPosition.y,
        vx: 0, vy: 0, z: 0, vz: 0, jumpHeld: false, running: false, crouching: false,
      };
    } else {
      const nearbyRestore = location === 'clearing' && savedPosition
        ? findNearbyPosition(savedPosition, [
          ...spatialIndex.query(playerContextId({ location: 'clearing', dimensionId }), savedPosition, 10).map(existing => existing.position),
          ...firesFor(dimensionId).values(),
        ])
        : null;
      if (nearbyRestore) {
        position = { ...nearbyRestore, vx: 0, vy: 0, z: 0, vz: 0, jumpHeld: false, running: false, crouching: false };
      } else {
        if (location === 'room') { roomKey = homeRoomKey; roomState = homeRoomState; }
        location = 'clearing';
        const dimensionSpawn = dimensionById(dimensions, dimensionId).spawn;
        const nearbySpawn = findNearbyPosition(dimensionSpawn, [
          ...spatialIndex.query(playerContextId({ location: 'clearing', dimensionId }), dimensionSpawn, 8).map(existing => existing.position),
          ...firesFor(dimensionId).values(),
        ]);
        position = nearbySpawn || { ...dimensionSpawn };
      }
    }
    const migratedDimensionPositions=savedDimensionPositions.map(entry=>
      isBareDarkDimension(dimensionById(dimensions, entry.dimensionId))
        && entry.worldVersion < DARK_WORLD_COORDINATE_VERSION
        ? { ...entry, x: entry.x + DARK_WORLD_COORDINATE_OFFSET.x, y: entry.y + DARK_WORLD_COORDINATE_OFFSET.y,
          worldVersion: DARK_WORLD_COORDINATE_VERSION }
        : { ...entry });
    const dimensionPositions=new Map(migratedDimensionPositions.map(entry=>[entry.dimensionId,{...entry}]));
    const persistedDimensionPositions=new Map(savedDimensionPositions.map(entry=>[entry.dimensionId,{...entry}]));
    if(location==='clearing')dimensionPositions.set(dimensionId,{dimensionId,x:position.x,y:position.y,
      worldVersion:coordinateVersionForDimension(dimensionId)});
    const player = {
      socket,
      registration,
      id,
      name: playerName,
      accountId: profile.guest ? null : profile.id,
      governmentTaxPanel: profile.guest || !storage.getGovernmentTaxPanel ? null
        : await storage.getGovernmentTaxPanel({ governmentId: marketGovernmentId, actorProfileId: profile.id }).catch(() => null),
      sessionId,
      homeRoomKey,
      roomKey,
      roomKind: roomDetails(roomKey).kind,
      roomBuildingId: roomDetails(roomKey).buildingId,
      lodgingClaim, lodgingLease, lodgingClaims, lodgingLeases, cabinKeys, issuedCabinKeys, roomLodgingMode: activeRoomDetails.kind === 'lodging' ? activeRoomMode : null,
      contractState,
      dimensionId,
      discoveredDimensionIds, canStaffTravelDimensions,
      flightPilotEnabled: flightPilotEnabled === true && flightPilotAuthorize({profile,canStaffTravelDimensions}) === true,
      canOwnerVisitHomes,
      arrivalTutorial: dimensionId === arrivalDimension.id ? { phase: 'welcome', step: 0, completed: false } : null,
      homeRoomState,
      roomState,
      staffRoomReturn: null,
      roomFurniture: roomState.furniture,
      location,
      position,
      dimensionPositions,persistedDimensionPositions,
      aoiRadius: viewportAoiRadius(480, 300),
      moving: false,
      input: { x: 0, y: 0 },
      commands: !recoveringFlight && Array.isArray(resume?.commands) ? resume.commands.slice(-MAX_QUEUED_INPUT_COMMANDS).map(command => ({ ...command })) : [],
      inputSeq: recoveringFlight && Number.isSafeInteger(resume?.receivedSeq) ? Math.max(0,resume.receivedSeq)
        : Number.isSafeInteger(resume?.inputSeq) ? Math.max(0,resume.inputSeq) : 0,
      receivedSeq: Number.isSafeInteger(resume?.receivedSeq)
        ? Math.max(Number.isSafeInteger(resume?.inputSeq) ? resume.inputSeq : 0,resume.receivedSeq)
        : Number.isSafeInteger(resume?.inputSeq) ? resume.inputSeq : 0,
      sequenced: resume?.sequenced === true,
      // Recent authoritative state also protects accounts from a stale session read during a pending save.
      inventory: createInventory({ ...EMPTY_INVENTORY, ...(resume?.inventory ?? profile.inventory), knife: 1 }),
      emote: null, sitting:false,furnitureUse:null,exitFurnitureId:null,
      lastActionAt: 0,
      nextWoodworkAt: 0,
      woodworkBusy: false,
      lastClockPingAt: 0,
      lastChatAt: Number.NEGATIVE_INFINITY,
      mutedUntil: initialSanctions.reduce((until, sanction) => sanction.kind === 'mute'
        ? Math.max(until, sanction.expires_at ? new Date(sanction.expires_at).getTime() : Number.POSITIVE_INFINITY)
        : until, 0),
      color: resume?.color ?? Math.floor(Math.random() * 4),
      appearance:resume?.appearance||(!profile.guest?await storage.loadAppearance(profile.id).catch(()=>normalizeAppearance()):normalizeAppearance()),
      objectCatalogRevisionSeen: null,
    };
    player.persistedLocation = canRestorePosition && durableVisit
      && sameLocationCheckpoint(locationCheckpoint(player), durableVisit) ? durableVisit : null;
    if (resume?.viewportWidth && resume?.viewportHeight) applyViewport(player, resume.viewportWidth, resume.viewportHeight);
    if (serverClosing || socket.readyState !== WebSocket.OPEN) {
      if (socket.readyState === WebSocket.OPEN) socket.terminate();
      socket.off('message', holdEarlyMessage);
      releaseAdmission();
      releaseAccountAdmission();
      return;
    }
    registration?.update({ location: player.location, contextId: playerContextId(player) });
    if(player.accountId && storage.getPropertyRequests) player.propertyRequests=await storage.getPropertyRequests(player.accountId);
    peers.set(socket, player);
    releaseAdmission();
    releaseAccountAdmission();
    indexPlayer(socket, player);
    socket.send(JSON.stringify({ type: 'welcome', id }));
    // A new peer needs a full snapshot; existing peers only need the updated
    // player list. Avoid rebuilding every scene's world snapshot per admission.
    broadcast(false);
    updatePlayerMapExploration(player);

    // dispatchMessage decodes each bounded WebSocket frame once; reuse it here
    // so the 30 Hz input path does not parse every packet twice.
    const handleMessage = async message => {
      if(message.type==='recoverMovement'){socket.terminate();return;}
      if (message.type === 'clockPing') {
        if (!Number.isSafeInteger(message.sequence) || performance.now() - player.lastClockPingAt < 250) return;
        const serverTime = performance.now();
        player.lastClockPingAt = serverTime;
        socket.send(JSON.stringify({ type: 'clockPong', sequence: message.sequence, serverTime,
          serverLoopLagMs:pingLoopLag.read(),serverWorkMs:Math.round((performance.now()-serverTime)*10)/10,
          serverBufferedBytes:socket.bufferedAmount }));
        return;
      }

      activateWorld(player.dimensionId || 'surface');

      if(message.type==='clientDiagnostics'){
        const reportId=typeof message.reportId==='string'&&/^[a-z0-9-]{12,80}$/i.test(message.reportId)?message.reportId:null;
        if(!reportId||message.version!==1||!Array.isArray(message.events)||message.events.length>24)return;
        const prior=acceptedMovementDiagnosticReports.get(reportId);
        if(prior){socket.send(JSON.stringify({type:'diagnosticsAccepted',reportId}));return;}
        const reportEvents=message.events.map(cleanMovementDiagnosticEvent).filter(Boolean);
        if(!reportEvents.length){socket.send(JSON.stringify({type:'diagnosticsAccepted',reportId}));return;}
        const at=now();
        process.stderr.write(JSON.stringify({type:'movement-diagnostic-report',receivedAt:new Date(at).toISOString(),
          connection:diagnosticConnectionTag,reportId,server:{inputSeq:player.inputSeq,receivedSeq:player.receivedSeq,
            queuedCommands:player.commands.length,moving:player.moving===true,location:player.location==='room'?'room':'clearing'},events:reportEvents})+'\n');
        acceptedMovementDiagnosticReports.set(reportId,at);
        while(acceptedMovementDiagnosticReports.size>512)acceptedMovementDiagnosticReports.delete(acceptedMovementDiagnosticReports.keys().next().value);
        socket.send(JSON.stringify({type:'diagnosticsAccepted',reportId}));
        return;
      }

      if(message.type==='performanceMetrics'){
        const report=cleanPerformanceReport(message);
        if(!report)return;
        if(acceptedPerformanceReports.has(report.reportId)){
          socket.send(JSON.stringify({type:'performanceMetricsAccepted',reportId:report.reportId}));return;
        }
        const at=now();
        if(socket.lastPerformanceMetricsAt!==undefined&&at-socket.lastPerformanceMetricsAt<30_000)return;
        socket.lastPerformanceMetricsAt=at;
        const players=peers.size;
        const playerCountBand=players<2?'1':players<6?'2-5':players<11?'6-10':'11+';
        process.stderr.write(JSON.stringify({type:'game-performance-report',receivedAt:new Date(at).toISOString(),
          reportId:report.reportId,windowMs:report.windowMs,context:report.context,playerCountBand,metrics:report.metrics})+'\n');
        acceptedPerformanceReports.set(report.reportId,at);
        while(acceptedPerformanceReports.size>512)acceptedPerformanceReports.delete(acceptedPerformanceReports.keys().next().value);
        socket.send(JSON.stringify({type:'performanceMetricsAccepted',reportId:report.reportId}));
        return;
      }

      if (message.type === 'objectCatalogReady') {
        const revision = Number(message.revision);
        if (Number.isSafeInteger(revision) && revision === (sceneObjectCatalog?.revision ?? -1)) {
          player.objectCatalogRevisionSeen = revision;
        }
        return;
      }

      if(message.type==='roomWarm'){
        if(player.location!=='clearing'||player.dimensionId!=='surface'||!player.accountId||now()-player.lastRoomWarmAt<650)return;
        const building=villageBuildingById.get(message.buildingId);
        if(!building||!isCabin(building.id)||building.door.enabled===false)return;
        const distance=Math.hypot(player.position.x-building.door.x,player.position.y-building.door.y);
        if(distance>5||!hasClearInteractionPath(player.position,building.door,{fires:[...firesFor('surface').values()]}))return;
        player.lastRoomWarmAt=now();
        void storage.getCabinKeys(player.accountId).then(async keys=>{
          const key=keys.find(item=>item.buildingId===building.id);if(!key)return;
          const claim=cabinClaimForKey(key),roomKey=lodgingRoomKey(claim);
          await loadCabinRoomState(roomKey,key.ownerProfileId,player.name,claim,building.id);
        }).catch(()=>{});
        return;
      }

      if(message.type==='appearance'){
        if(now()-player.lastActionAt<ACTION_COOLDOWN_MS)return;
        player.lastActionAt=now();const appearance=normalizeAppearance(message.appearance);
        if(isPersonalArrivalDimensionId(player.dimensionId)&&player.arrivalTutorial?.phase==='appearance'
            &&JSON.stringify(appearance)===JSON.stringify(normalizeAppearance(player.appearance))){
          notice(socket,'Mude pelo menos uma opção do personagem para seguir.');return;
        }
        try{
          if(player.accountId)await storage.saveAppearance(player.accountId,appearance);
          player.appearance=appearance;
          if(isPersonalArrivalDimensionId(player.dimensionId)&&player.arrivalTutorial?.phase==='appearance')
            player.arrivalTutorial={phase:'find',step:3,completed:false,
              target:{x:player.position.x+1.5,y:player.position.y+.5}};
          notice(socket,player.accountId?'Aparência salva.':'Aparência aplicada nesta visita.');broadcast();
        }
        catch{notice(socket,'Não consegui salvar a aparência. Tente novamente.')}return;
      }
      if (message.type === 'dimensionTransitReady') {
        const transit = activeDimensionTransits.get(String(message.transitId || ''));
        if (transit && transit.actorId === player.id && player.location === 'clearing'
            && player.dimensionId === transit.destinationDimensionId && player.pendingDimensionTransitId === transit.id
            && announceDimensionTransitReady(transit)) {
          player.dimensionTravelCooldownUntil = transit.staffDimensionTravel ? 0
            : transit.destinationStartAt + transit.durationMs + (transit.travelCooldownMs || DIMENSION_TRAVEL_COOLDOWN_MS);
          broadcast(false);
          const unlockTimer=setTimeout(()=>{
            dimensionTransitTimers.delete('unlock:'+transit.id);
            if(player.pendingDimensionTransitId!==transit.id)return;
            delete player.pendingDimensionTransitId;player.input={x:0,y:0};player.commands=[];player.moving=false;
            broadcast(false);
          },Math.max(0,transit.destinationStartAt+transit.apexMs+80-performance.now()));
          dimensionTransitTimers.set('unlock:'+transit.id,unlockTimer);
        }
        return;
      }

      if (message.type === 'dimensionTravel') {
        const rejectTransit = text => notice(socket, text, 'soft', { action: 'dimensionTravel', requestId: message.requestId, result: 'rejected' });
        const universalTeleport = message.universalTeleport === true;
        const universalAbility = PLAYER_ABILITIES.universalTeleport;
        if (universalTeleport && (!universalAbility || !player.inventory.learnedAbilities.includes('universalTeleport'))) { rejectTransit('Você ainda não aprendeu Teleporte Universal.'); return; }
        if (player.woodworkBusy) { rejectTransit('Termine esta etapa do trabalho antes de viajar.'); return; }
        if (player.pendingDimensionTransitId) { rejectTransit('Sua viagem já está começando.'); return; }
        let canStaffTravel = false;
        if (!profile.guest && storage.staffManagement?.authorization?.hasPermission) {
          try { canStaffTravel = await storage.staffManagement.authorization.hasPermission(player.sessionId, 'dimensions.staff_travel'); }
          catch { rejectTransit('Não foi possível confirmar sua autorização dimensional. Tente novamente.'); return; }
        }
        player.canStaffTravelDimensions = canStaffTravel;
        const dimensionCooldownRemaining = (player.dimensionTravelCooldownUntil || 0) - performance.now();
        if (!canStaffTravel && dimensionCooldownRemaining > 0) {
          rejectTransit(`Aguarde ${Math.ceil(dimensionCooldownRemaining / 1000)} s para viajar de dimensão novamente.`);
          return;
        }
        if (player.location !== 'clearing') { rejectTransit('A viagem começa na clareira.'); return; }
        if (universalTeleport && (!Number.isFinite(message.x) || !Number.isFinite(message.y))) { rejectTransit('Escolha um destino válido no mapa.'); return; }
        const ownArrivalDimension = personalArrivalDimension(player.sessionId);
        const targetDimension = message.dimensionId === ownArrivalDimension.id
          ? ownArrivalDimension : dimensions.find(item => item.id === message.dimensionId);
        if (!targetDimension) { rejectTransit('Essa dimensão não está disponível.'); return; }
        if (!canStaffTravel && !player.discoveredDimensionIds?.has(targetDimension.id)
            && targetDimension.id !== ownArrivalDimension.id) {
          rejectTransit('Você ainda não descobriu um caminho para essa dimensão.'); return;
        }
        if (isPersonalArrivalDimensionId(targetDimension.id) && targetDimension.ownerProfileId !== player.sessionId) {
          rejectTransit('Essa dimensão pessoal pertence a outra pessoa.'); return;
        }
        if (isPersonalArrivalDimensionId(player.dimensionId) && player.arrivalTutorial?.completed !== true
            && targetDimension.id !== 'surface') {
          rejectTransit('Conclua ou dispense a orientação antes de viajar.'); return;
        }
        if(isPersonalArrivalDimensionId(player.dimensionId)&&player.arrivalTutorial?.completed!==true
            &&targetDimension.id==='surface'){
          const ownGuide=dimensionById(dimensions,player.dimensionId)?.guide;
          if(ownGuide&&Math.hypot(player.position.x-ownGuide.x,player.position.y-ownGuide.y)<15.5){
            rejectTransit('Caminhe além do brilho da fogueira, rumo à escuridão, para seguir ao bosque.');return;
          }
        }
        if (isPersonalArrivalDimensionId(targetDimension.id)) await ensurePersonalArrivalWorld(targetDimension);
        if (universalTeleport && targetDimension.id !== player.dimensionId) { rejectTransit('Escolha destinos no mapa da dimensão atual.'); return; }
        if (!universalTeleport && targetDimension.id === player.dimensionId) { rejectTransit('Você já está nesta dimensão.'); return; }
        activateWorld(targetDimension.id);
        void persistPlayerDimensionPosition(player,player.dimensionId,player.position,true);
        const context=playerContextId({location:'clearing',dimensionId:targetDimension.id});
        const destinationBlockers=origin=>[
          ...spatialIndex.query(context,origin,68).filter(other=>other!==player).map(other=>other.position),
          ...firesFor(targetDimension.id).values(),
          ...wildlifeFor(targetDimension.id).values(),
        ];
        const findArrivalPosition=origin=>findNearbyPosition(origin,destinationBlockers(origin),64);
        const preferred=player.dimensionPositions?.get(targetDimension.id);
        const requestedTarget=universalTeleport?{x:message.x,y:message.y}:null;
        const safe=universalTeleport?findArrivalPosition(requestedTarget):((preferred&&findArrivalPosition(preferred))||findArrivalPosition(targetDimension.spawn));
        if (!safe) { rejectTransit(universalTeleport?'Esse ponto não é seguro para teletransportar.':'Não encontrei um ponto seguro para chegar nesta dimensão.'); return; }
        const startAt = performance.now() + 140, apexMs = 1080, arrivalDelayMs = 360, durationMs = 2700;
        const transit = {
          id: randomUUID(), actorId: player.id,
          sourceDimensionId: player.dimensionId || 'surface', sourceX: player.position.x, sourceY: player.position.y,
          destinationDimensionId: targetDimension.id, destinationX: safe.x, destinationY: safe.y,
          staffDimensionTravel: canStaffTravel,
          destinationWorldDefinition: worldFor(targetDimension.id),
          ...(universalTeleport?{universalTeleport:true,travelCooldownMs:universalAbility.cooldownMs}:{}),
          startAt, apexMs, arrivalDelayMs, durationMs, sourceFadeMs: DIMENSION_TRANSIT_SOURCE_FADE_MS,
          transferAt: startAt + durationMs, destinationStartAt: null,
        };
        activeDimensionTransits.set(transit.id, transit);
        player.pendingDimensionTransitId = transit.id;
        player.input = { x: 0, y: 0 }; player.commands = []; player.inputSeq = player.receivedSeq;
        player.moving = false;
        const transferTimer = setTimeout(() => {
          dimensionTransitTimers.delete(transit.id);
          if (activeDimensionTransits.get(transit.id) !== transit || player.pendingDimensionTransitId !== transit.id
              || !peers.has(socket) || socket.readyState !== WebSocket.OPEN) return;
          player.dimensionId = targetDimension.id;
          player.arrivalTutorial = isPersonalArrivalDimensionId(targetDimension.id) ? { phase: 'welcome', step: 0, completed: false } : null;
          player.location = 'clearing'; player.roomKey = player.homeRoomKey;
          player.roomState = player.homeRoomState; player.roomFurniture = player.roomState.furniture;
          player.position = { ...safe, vx: 0, vy: 0, z: 0, vz: 0, jumpHeld: false, running: false, crouching: false };
          player.input = { x: 0, y: 0 }; player.commands = []; player.inputSeq = player.receivedSeq;
          player.moving = false; player.emote = null; player.sitting = false;
          indexPlayer(socket, player); registration?.update({ location: player.location, contextId: playerContextId(player) });
          void persistPlayerLocation(player, true);
          void persistPlayerDimensionPosition(player,targetDimension.id,safe,true);
          const arrivedFromPersonalTutorial = isPersonalArrivalDimensionId(transit.sourceDimensionId)
            && targetDimension.id === 'surface';
          const arrivalText = arrivedFromPersonalTutorial
            ? 'Você chegou ao Bosque das Brasas. E para coletar materiais; H cria ou usa o machado; P monta a picareta; 1–9 equipa uma ferramenta.'
            : `Você chegou a ${universalTeleport?'um novo destino em '+targetDimension.name:targetDimension.name}.`;
          notice(socket, arrivalText, 'chime', arrivedFromPersonalTutorial ? { durationMs: 6500 } : null);
          broadcast();
        }, Math.max(0, transit.transferAt - performance.now()));
        dimensionTransitTimers.set(transit.id, transferTimer);
        const readyTimer = setTimeout(() => {
          if(player.pendingDimensionTransitId===transit.id){delete player.pendingDimensionTransitId;player.input={x:0,y:0};player.commands=[];player.moving=false;}
          removeDimensionTransit(transit);
        }, DIMENSION_TRANSIT_READY_TIMEOUT_MS);
        readyTimer.unref?.();
        dimensionTransitTimers.set(`ready:${transit.id}`, readyTimer);
        broadcast();
        return;
      }
      if (message.type === 'join') {
        let currentProfile;
        try { currentProfile = await getCurrentProfile(); }
        catch { socket.close(1011, 'session lookup failed'); return; }
        if (!currentProfile) { socket.close(1008, 'session expired'); return; }
        player.name = currentProfile.username || currentProfile.displayName || player.name;
        if(message.compactWorld === 1) player.compactWorld = true;
        if(message.compactPlayers === 1) player.compactPlayers = true;
        if (message.viewport && typeof message.viewport === 'object') {
          applyViewport(player, message.viewport.width, message.viewport.height);
        }
        player.homeRoomState.name = player.name;
        broadcast(false);
        return;
      }
      if (message.type === 'view') {
        applyViewport(player, message.width, message.height);
        broadcast(false);
        return;
      }
      if (message.type === 'input') {
        if (player.pendingDimensionTransitId) {
          player.input = { x: 0, y: 0 }; player.commands = [];
          return;
        }
        // Discard steps sent before crossing a door but received after the teleport.
        if (message.location && message.location !== player.location) return;
        if (message.dimensionId && message.dimensionId !== player.dimensionId) return;
        if (Array.isArray(message.commands)) {
          player.sequenced = true;
          const commands=message.commands.slice(0,12);
          if(player.furnitureUse&&commands.some(command=>(command.x||command.y||command.jump)&&command.seq>player.furnitureUse.inputSeq)){
            player.exitFurnitureId=player.furnitureUse.id;player.furnitureUse=null;
            if(['lie','shower'].includes(player.emote?.name))player.emote=null;
          }
          for (const command of commands) {
            enqueueInputCommand(player, command);
          }
          return;
        }
        player.input = { x: clampAxis(message.x), y: clampAxis(message.y) };
        if(player.furnitureUse&&(player.input.x||player.input.y)){
          player.exitFurnitureId=player.furnitureUse.id;player.furnitureUse=null;
          if(['lie','shower'].includes(player.emote?.name))player.emote=null;
        }
        return;
      }
      if (message.type === 'emote' && validEmotes.has(message.name)) {
        if (now() - player.lastActionAt < ACTION_COOLDOWN_MS) {
          notice(socket, 'Espera só um instante antes da próxima ação.');
          return;
        }
        player.lastActionAt = now();
        if(message.name==='sit'||message.name==='stand'){
          player.sitting=message.name==='sit'&&!player.sitting;
          player.emote=player.sitting?{name:'sit',until:0}:null;
          player.position.vx=0;player.position.vy=0;
          player.input={x:0,y:0};player.sitInputSeq=player.receivedSeq;player.moving=false;
        }else{
          if(message.name==='dance')player.sitting=false;
          player.emote={name:message.name,until:now()+1900};
        }
        notice(socket, message.name === 'wave' ? 'Você acenou para quem está por perto.' : message.name === 'dance' ? 'Um passinho no meio do bosque.' : player.emote?.name==='sit'?'Você sentou para descansar.':'Você se levantou.', 'chime');
        broadcast();
        return;
      }
      if (message.type === 'chat') {
        if (player.mutedUntil > now()) {
          const until = Number.isFinite(player.mutedUntil)
            ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(player.mutedUntil))
            : 'por tempo indeterminado';
          notice(socket, `Você está silenciado até ${until}.`);
          return;
        }
        const text = normalizeChatMessage(message.text);
        if (!text) { notice(socket, 'Escreva algo para quem está por perto.'); return; }
        if (now() - player.lastChatAt < CHAT_COOLDOWN_MS) {
          notice(socket, 'Respira um pouquinho antes de falar de novo.');
          return;
        }
        const sentAt = now();
        player.lastChatAt = sentAt;
        player.chat = { text, until: sentAt + CHAT_DURATION_MS, sentAt };
        if (isPersonalArrivalDimensionId(player.dimensionId) && player.arrivalTutorial?.phase === 'chat')
          player.arrivalTutorial = { phase: 'appearance', step: 2, completed: false };
        broadcast();
        return;
      }
      if (message.type === 'action' && message.name === 'talkTutorialGuide') {
        const ownArrival = personalArrivalDimension(player.sessionId);
        if (player.location !== 'clearing' || player.dimensionId !== ownArrival.id || !player.arrivalTutorial) return;
        // The campfire speaks when the traveler reaches its broad ring of light.
        if (Math.hypot(player.position.x - ownArrival.guide.x, player.position.y - ownArrival.guide.y) > 5.2) {
          notice(socket, 'Aproxime-se do Deus do Fogo para conversar.'); return;
        }
        if (player.arrivalTutorial.completed) { notice(socket, 'O Deus do Fogo espera por você sempre que quiser rever a orientação.'); return; }
        if (player.arrivalTutorial.phase !== 'welcome') return;
        player.arrivalTutorial = { phase: 'lesson', step: 0, completed: false, movementStart: { ...player.position } };
        broadcast(false);
        return;
      }
      if (message.type === 'action' && message.name === 'arrivalTutorialChoice') {
        const flow = player.arrivalTutorial;
        if (!flow || !isPersonalArrivalDimensionId(player.dimensionId) || flow.completed) return;
        if (message.choice === 'skip') {
          player.arrivalTutorial = { phase: 'ready', step: flow.step || 0, completed: true };
          notice(socket, 'Tudo bem. Vamos ao bosque.', 'chime', { arrivalReady: true });
          broadcast(false); return;
        }
        if (message.choice === 'next' && flow.phase === 'lesson') {
          const step = Math.min(2, (Number(flow.step) || 0) + 1);
          player.arrivalTutorial = { phase: step >= 2 ? 'ready' : 'lesson', step, completed: false };
          broadcast(false); return;
        }
        if (message.choice === 'finish' && flow.phase === 'ready') {
          player.arrivalTutorial = { ...flow, completed: true };
          notice(socket, 'A fogueira vai acompanhá-lo. O bosque espera por você.', 'chime', { arrivalReady: true });
          broadcast(false); return;
        }
        return;
      }
      if (message.type === 'action' && message.name === 'arrivalTutorialCollect') {
        const flow=player.arrivalTutorial, target=flow?.target;
        if(player.location!=='clearing'||!isPersonalArrivalDimensionId(player.dimensionId)||flow?.phase!=='find'||!target)return;
        if(Math.hypot(player.position.x-target.x,player.position.y-target.y)>1.8){notice(socket,'Aproxime-se da fagulha para recolher o presente.');return;}
        const before=inventorySnapshot(player.inventory);
        addInventoryItem(player.inventory,'sturdyBranch',1);addInventoryItem(player.inventory,'leaves',1);
        try{await persistPlayer(player);}
        catch{restoreInventory(player.inventory,before);notice(socket,'Não consegui guardar o presente. Tente novamente.');return;}
        player.arrivalTutorial={phase:'ready',step:4,completed:true};
        notice(socket,'A fagulha deixou um galho e uma folha para você. O Bosque das Brasas espera.','chime',{arrivalReady:true});
        broadcast(false);return;
      }
      if (message.type !== 'action' || !['collect', 'hunt', 'work', 'craftPickaxe', 'upgradeAxe', 'upgradePickaxe', 'buildBench', 'buildKiln', 'buildFurnace', 'process', 'sharpen', 'selectHotbar', 'moveToHotbar', 'moveInventorySlot', 'chestMove', 'consumeXpPotion', 'allocateAttribute', 'learnAbility', 'castAbility', 'fire', 'share', 'interact', 'arrivalTutorialChoice', 'arrivalTutorialCollect', 'talkTutorialGuide', 'visitRoom', 'ownerVisitRoom', 'placeFurniture', 'removeFurniture', 'rotateFurniture', 'moveFurniture', 'useFurniture', 'lodgeClaim', 'lodgeEnter', 'lodgeSell', 'lodgeBuyTool', 'lodgeCompleteContract', 'cabinGrantKey', 'cabinRevokeKey', 'propertyList', 'propertyDelist', 'propertyBuy', 'propertyRequest', 'propertyQuote', 'propertyRentList', 'propertyRentDelist', 'propertyRent', 'setLodgingAutoRenew'].includes(message.name)) return;
      if (message.name === 'allocateAttribute') {
        const key = typeof message.attribute === 'string' ? message.attribute : '';
        if (!ATTRIBUTE_KEYS.includes(key)) { notice(socket, 'Esse atributo não existe.'); return; }
        if (player.inventory.attributePoints < 1) { notice(socket, 'Você não tem pontos de atributo disponíveis.'); return; }
        if (player.inventory.attributes[key] >= 100) { notice(socket, 'Esse atributo já chegou ao limite.'); return; }
        const before = inventorySnapshot(player.inventory);
        const attributes = { ...before.attributes, [key]: before.attributes[key] + 1 };
        player.inventory = createInventory({ ...before, attributes, attributePoints: before.attributePoints - 1 });
        try { await persistPlayer(player); }
        catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar o atributo; o ponto foi devolvido.'); return; }
        const labels = { force:'Força', attack:'Ataque', defense:'Defesa', agility:'Agilidade', magic:'Magia', speed:'Velocidade' };
        notice(socket, `${labels[key]} aumentou para ${player.inventory.attributes[key]}.`, 'chime');
        broadcast(false);
        return;
      }
      if (message.name === 'learnAbility') {
        const before = inventorySnapshot(player.inventory);
        const result = learnPlayerAbility(before, typeof message.abilityId === 'string' ? message.abilityId : '');
        if (result.status !== 'learned') {
          const labels = { 'level-locked':`Essa técnica exige nível ${result.ability?.minimumLevel || '?'}.`, 'attribute-locked':`Aumente ${result.attribute || 'o atributo exigido'} para ${result.required || '?'}.`, 'prerequisite-locked':'Aprenda a técnica anterior primeiro.', 'points-needed':'Você ainda não tem pontos de habilidade suficientes.', 'already-known':'Você já aprendeu essa técnica.', 'unknown-ability':'Essa técnica não existe.' };
          notice(socket, labels[result.status] || 'Não foi possível aprender essa técnica.'); return;
        }
        player.inventory = createInventory({ ...before, ...result.progression });
        try { await persistPlayer(player, null, result.ability.dimensionDiscovery
          ? { dimensionId:result.ability.dimensionDiscovery, source:'knowledge' } : null); }
        catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar a técnica; os pontos foram devolvidos.'); return; }
        if (result.ability.dimensionDiscovery) {
          player.discoveredDimensionIds?.add(result.ability.dimensionDiscovery);
          notice(socket, 'A magia revelou uma passagem dimensional desconhecida.', 'chime');
          broadcast(false);
          return;
        }
        if (result.ability.mapDiscoveryRadius) {
          const mapState = player.mapExplorationByDimension?.get(player.dimensionId || 'surface');
          if (mapState) mapState.lastCell = -1;
          updatePlayerMapExploration(player);
        }
        notice(socket, `${result.ability.label} aprendida.`, 'chime'); broadcast(false); return;
      }
      if (message.name === 'castAbility') {
        if (player.location !== 'clearing') { notice(socket, 'Use essa técnica no bosque.'); return; }
        if (player.woodworkBusy || player.pendingDimensionTransitId) { notice(socket, 'Termine o trabalho ou a viagem antes de usar essa técnica.'); return; }
        const abilityId = typeof message.abilityId === 'string' ? message.abilityId : '';
        const ability = PLAYER_ABILITIES[abilityId];
        if (!ability || !['spell','combat-technique','mobility','buff','evasion'].includes(ability.kind) || !player.inventory.learnedAbilities.includes(abilityId)) { notice(socket, 'Você ainda não aprendeu essa magia.'); return; }
        const cooldowns = player.abilityCooldowns ||= new Map();
        const nowAt = performance.now();
        const readyAt = cooldowns.get(abilityId) || 0;
        if (nowAt < readyAt) { notice(socket, `Aguarde ${Math.ceil((readyAt-nowAt)/1000)} s para conjurar novamente.`, 'soft'); return; }
        const cooldownUntil = nowAt + ability.cooldownMs;
        cooldowns.set(abilityId, cooldownUntil);
        const releaseCooldown = () => { if (cooldowns.get(abilityId) === cooldownUntil) cooldowns.delete(abilityId); };
        if (ability.kind === 'mobility' && ability.windupMs > 0) {
          const seconds = (ability.windupMs / 1000).toLocaleString('pt-BR', { minimumFractionDigits:1, maximumFractionDigits:1 });
          notice(socket, ability.label + ': canalizando por ' + seconds + ' segundo(s).', 'soft');
          await new Promise(resolve => setTimeout(resolve, ability.windupMs));
          if (socket.readyState !== WebSocket.OPEN || peers.get(socket) !== player
              || player.location !== 'clearing' || player.woodworkBusy || player.pendingDimensionTransitId) {
            notice(socket, ability.label + ' foi interrompido antes do salto.'); releaseCooldown(); return;
          }
        }
        if (ability.kind === 'buff' || ability.kind === 'evasion') {
          if (player.location !== 'clearing' || player.woodworkBusy || player.pendingDimensionTransitId) { notice(socket, 'Essa técnica só pode ser usada livre no bosque.'); releaseCooldown(); return; }
          if (ability.kind === 'buff') {
            if (abilityId === 'sprintBurst') player.sprintBurstUntil = nowAt + ability.durationMs;
            else player.hasteUntil = nowAt + ability.durationMs;
          }
          else player.evasionUntil = now() + ability.durationMs;
          const durationSeconds = (ability.durationMs/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
          notice(socket, `${ability.label} preparada por ${durationSeconds} segundo(s).`, 'chime');broadcast(false);return;
        }
        if (ability.kind === 'mobility') {
          const release = releaseCooldown;
          if (player.position.z > 0.05 || player.pendingDimensionTransitId || player.woodworkBusy) { notice(socket, 'Espere tocar o chão e terminar qualquer trabalho ou viagem.'); release(); return; }
          let dx = Number.isFinite(message.dx) ? Math.max(-1, Math.min(1, message.dx)) : player.input?.x || 0;
          let dy = Number.isFinite(message.dy) ? Math.max(-1, Math.min(1, message.dy)) : player.input?.y || 0;
          const length = Math.hypot(dx,dy);
          if (length < .05) { notice(socket, 'Escolha uma direção para avançar.'); release(); return; }
          dx /= length; dy /= length;
          const destination = { x:player.position.x + dx * ability.distance, y:player.position.y + dy * ability.distance };
          const context = playerContextId(player);
          const blockers = [
            ...spatialIndex.query(context,destination,2).filter(other=>other!==player).map(other=>other.position),
            ...wildlifeFor(player.dimensionId || 'surface').values(),
          ];
          const safe = findNearbyPosition(destination,blockers,0);
          const fires = [...firesFor(player.dimensionId || 'surface').values()];
          const fireBlocked = fires.some(fire=>Math.hypot(destination.x-fire.x,destination.y-fire.y)<FIRE_RADIUS+PLAYER_RADIUS);
          if (!safe || fireBlocked || !hasClearInteractionPath(player.position,destination,{fires})) {
            notice(socket, 'O caminho está bloqueado; ' + ability.label + ' foi cancelado.'); release(); return;
          }
          player.position={...player.position,...safe,vx:0,vy:0,vz:0,z:0,jumpHeld:false,running:false,crouching:false};
          player.input={x:0,y:0};player.commands=[];player.inputSeq=player.receivedSeq;player.moving=false;player.sitting=false;player.emote=null;
          indexPlayer(socket,player);
          notice(socket, `${ability.label}: você avançou ${ability.distance} espaços.`, 'chime');broadcast(false);return;
        }
        const population = wildlifeFor(player.dimensionId || 'surface');
        const animal = population.get(typeof message.targetId === 'string' ? message.targetId : '');
        if (!animal) { notice(socket, 'Escolha um animal visível para mirar.'); releaseCooldown(); return; }
        const combatTechnique = ability.kind === 'combat-technique';
        const weapon = selectedInventoryItem(player.inventory);
        const weaponDamage = AXE_TOOL_IDS.includes(weapon) ? 2 : 1;
        const damage = combatTechnique
          ? ability.damage + weaponDamage + attributeAttackBonus(player.inventory.attributes,player.inventory.learnedAbilities)
          : ability.damage + attributeSpellDamageBonus(player.inventory.attributes);
        const result = await huntWildlifeTarget({ player, animal, population, now:now(), persist:persistPlayer,
          rangeOverride:ability.range, damageOverride:damage, weaponOverride:combatTechnique?null:'spell',
          hasClearPath:(from,to,definition)=>hasClearInteractionPath(from,to,{targetRadius:definition.stats.radius,
            fires:[...firesFor(player.dimensionId||'surface').values()],ignoreWildlife:animal.id}), });
        if (result.status === 'too-far') { notice(socket, combatTechnique?'O alvo está longe demais para o Golpe Pesado.':'O alvo está fora do alcance desta magia.'); releaseCooldown(); return; }
        if (result.status === 'no-tool') { notice(socket, 'Equipe uma faca ou um machado para usar o Golpe Pesado.'); releaseCooldown(); return; }
        if (result.status === 'blocked') { notice(socket, 'Não há um caminho livre até o alvo.'); releaseCooldown(); return; }
        if (result.status === 'inventory-full') { notice(socket, 'O Inventário está cheio; libere espaço antes de derrotar o animal.'); releaseCooldown(); return; }
        if (result.status === 'save-failed') { notice(socket, 'Não consegui salvar o resultado; o alvo continua no bosque.'); releaseCooldown(); return; }
        if (result.status !== 'injured' && result.status !== 'killed') { notice(socket, 'Não foi possível conjurar contra esse alvo.'); releaseCooldown(); return; }
        const label = result.status === 'killed' ? `${result.definition.label} derrotado` : `${result.definition.label} atingido · ${result.health} de vida restante`;
        notice(socket, `${ability.label}: ${label}.`, 'chime'); broadcast(false); return;
      }
      if (message.name === 'consumeXpPotion') {
        const potion = XP_POTIONS[message.itemId];
        if (!potion || (player.inventory[message.itemId] || 0) < 1) { notice(socket, 'Essa poção não está no seu Inventário.'); return; }
        if (player.inventory.level < potion.minimumLevel) { notice(socket, `Essa poção exige nível ${potion.minimumLevel}.`); return; }
        const before = inventorySnapshot(player.inventory);
        const result = awardPotionXp(player.inventory, message.itemId);
        if (result.status !== 'consumed' || result.gained <= 0) { notice(socket, result.status === 'level-locked' ? `Essa poção exige nível ${result.potion.minimumLevel}.` : 'Você já alcançou o nível máximo.'); return; }
        player.inventory = createInventory({ ...before, ...result.progression });
        removeInventoryItem(player.inventory, message.itemId, 1);
        try { await persistPlayer(player); }
        catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar a poção e a experiência; nada foi consumido.'); return; }
        const levelText = result.levelsGained
          ? ` Você alcançou o nível ${before.level} → ${result.progression.level}.`
          : '';
        const attributePointsGained = Math.max(0, result.progression.attributePoints - before.attributePoints);
        const skillPointsGained = Math.max(0, result.progression.skillPoints - before.skillPoints);
        const rewards = [];
        if (attributePointsGained) rewards.push(`+${attributePointsGained} ${attributePointsGained === 1 ? 'ponto de atributo' : 'pontos de atributo'}`);
        if (skillPointsGained) rewards.push(`+${skillPointsGained} ${skillPointsGained === 1 ? 'ponto de habilidade' : 'pontos de habilidade'}`);
        const rewardText = rewards.length ? ` ${rewards.join(' · ')}.` : '';
        const previousPageCount = storagePageCountForLevel(before.level || 1);
        const newlyUnlockedPages = Array.from(
          { length: Math.max(0, result.unlockedStoragePages - previousPageCount) },
          (_, index) => previousPageCount + index + 1,
        );
        const pageText = newlyUnlockedPages.length
          ? ` ${newlyUnlockedPages.length === 1 ? 'Página' : 'Páginas'} ${newlyUnlockedPages.length > 1
            ? `${newlyUnlockedPages.slice(0, -1).join(', ')} e ${newlyUnlockedPages.at(-1)}`
            : newlyUnlockedPages[0]} do Inventário liberada${newlyUnlockedPages.length === 1 ? '' : 's'}.`
          : '';
        notice(socket, `${potion.label} usada: +${result.gained} XP.${levelText}${rewardText}${pageText}`, 'chime',
          result.levelsGained ? { progressionLevelUp: true, newlyUnlockedPages, durationMs: 6000 } : null);
        broadcast(false);
        return;
      }
      if (INVENTORY_ACTIONS.has(message.name)) {
        const seq = message.inventorySeq;
        if (seq !== undefined && (!Number.isSafeInteger(seq) || seq <= (player.inventorySeq || 0))) return;
        const before = inventorySnapshot(player.inventory);
        const candidate = createInventory(before);
        if (applyInventoryCommand(candidate, message)) {
          try {
            // Keep snapshots authoritative while the durable write is pending.
            await persistPlayer({ ...player, inventory: candidate });
            if (JSON.stringify(inventorySnapshot(player.inventory)) === JSON.stringify(before)) {
              player.inventory = candidate;
            } else {
              // Another player may have transferred items while this write was
              // in flight. Preserve that live inventory and reject this swap.
              await persistPlayer(player);
              notice(socket, 'O Inventário mudou durante a troca. Tente mover o item novamente.');
            }
          } catch { notice(socket, 'Não consegui salvar a alteração do Inventário.'); }
        }
        if (seq !== undefined) player.inventorySeq = seq;
        broadcast(false);
        return;
      }
      if (player.woodworkBusy) { notice(socket, 'Termine esta etapa do trabalho antes de começar outra.', 'soft'); return; }
      if (now() - player.lastActionAt < ACTION_COOLDOWN_MS) {
        const rejectedInteraction = ['collect', 'interact', 'useFurniture'].includes(message.name)
          && Number.isSafeInteger(message.requestId) && message.requestId >= 0
          ? { action: message.name, requestId: message.requestId, result: 'cooldown' }
          : null;
        notice(socket, 'Espera só um instante antes da próxima ação.', 'soft', rejectedInteraction);
        return;
      }
      player.lastActionAt = now();
      advancePlayerToInput(player, message.inputSeq);

      if (isPlaceServiceAction(message.name)) {
        const layout = getRoomLayout(player.roomKind, player.roomBuildingId, player.roomLodgingMode || player.lodgingClaim?.mode);
        const point = nearestPlaceService(player, player.position, layout, target =>
          hasClearInteractionPath(player.position, target, { location: player.location, roomLayout: layout,
            furniture: player.roomFurniture || [], fires: [...firesFor(player.dimensionId).values()] }));
        if (!placeServiceAllowsAction(point, message)) {
          notice(socket, point ? 'Este serviço não é oferecido neste balcão.'
            : 'Aproxime-se do ponto de atendimento para usar este serviço.');
          return;
        }
      }

      if (message.name === 'cabinGrantKey' || message.name === 'cabinRevokeKey') {
        if (!player.accountId) { notice(socket, 'Entre com a conta do dono para gerenciar as chaves.'); return; }
        try {
          const result = await storage.setCabinKey({ ownerProfileId: player.accountId, buildingId: message.buildingId,
            username: message.username, profileId: message.profileId, revoke: message.name === 'cabinRevokeKey' });
          if (result.revoked) for (const other of peers.values()) {
            if (other.accountId === result.profileId && other.location === 'room' && other.roomKind === 'lodging'
                && other.roomBuildingId === message.buildingId) {
              leaveCabin(other); notice(other.socket, 'Sua chave foi revogada. Você voltou para fora da cabana.', 'soft');
            }
          }
          await refreshCabinViews();
          notice(socket, result.revoked ? `Chave de ${result.username} revogada.` : `Chave entregue para ${result.username}.`, 'chime');
          broadcast();
        } catch (error) { notice(socket, error.message || 'Não consegui salvar a alteração da chave.'); }
        return;
      }

      if (message.name === 'governmentTaxPolicySet') {
        if (!player.accountId || !storage.updateGovernmentTaxPolicy) {
          notice(socket, 'Entre com uma conta autorizada pelo governo para alterar impostos.'); return;
        }
        try {
          const taxCode = typeof message.taxCode === 'string' ? message.taxCode : '';
          const result = await storage.updateGovernmentTaxPolicy({
            governmentId: marketGovernmentId, actorProfileId: player.accountId, taxCode,
            baseRateBps: Number(message.baseRateBps), minimumRateBps: Number(message.minimumRateBps),
            maximumRateBps: Number(message.maximumRateBps), treasuryTargetBronze: Number(message.treasuryTargetBronze),
            treasurySensitivityBps: Number(message.treasurySensitivityBps), now: new Date(now()),
          });
          await storage.refreshGovernmentTaxQuote({ governmentId: marketGovernmentId, taxCode, force: true });
          marketQuotes = await storage.refreshQuotes({ governmentId: marketGovernmentId, force: true });
          player.governmentTaxPanel = await storage.getGovernmentTaxPanel({ governmentId: marketGovernmentId, actorProfileId: player.accountId });
          notice(socket, `Imposto atualizado para a versão ${result.version}.`, 'chime'); broadcast();
        } catch (error) { notice(socket, error.message || 'Não foi possível atualizar o imposto.'); }
        return;
      }

      if(message.name==='hunt'){
        if(player.location!=='clearing'){notice(socket,'A fauna vive no bosque, não nos quartos.');return;}
        const population=wildlifeFor(player.dimensionId||'surface');
        const animal=population.get(typeof message.animalId==='string'?message.animalId:'');
        const result=await huntWildlifeTarget({player,animal,population,now:now(),persist:persistPlayer,
          hasClearPath:(from,to,definition)=>hasClearInteractionPath(from,to,{targetRadius:definition.stats.radius,
            fires:[...firesFor(player.dimensionId).values()]})});
        if(result.status==='missing'||result.status==='too-far'){
          notice(socket,'Chegue mais perto do animal para tentar uma captura.','soft');return;
        }
        if(result.status==='blocked'){
          notice(socket,'A árvore está entre você e o animal. Aproxime-se por outro lado.','soft');return;
        }
        if(result.status==='no-tool'){
          notice(socket,'Equipe a faca simples ou um machado na barra rápida para caçar.');return;
        }
        if(result.status==='injured'){
          notice(socket,`${result.definition.label} foi ferido e tenta fugir.`, 'soft');broadcast(false);return;
        }
        if(result.status==='inventory-full'){
          notice(socket,'O Inventário está cheio. Libere espaço antes de recolher os itens do animal.');return;
        }
        if(result.status==='save-failed'){
          notice(socket,'Não consegui salvar os itens. O animal continua no bosque.');return;
        }
        const {definition,loot}=result;
        const lootNames={rawMeat:'carne crua',hide:'couro',bone:'osso',feather:'pena',venom:'veneno',glowDust:'pó de luz',cinderShard:'fragmento de cinza',emberCore:'núcleo de brasa'};
        const details=Object.entries(loot).map(([item,quantity])=>`${quantity} ${lootNames[item]||item}`).join(', ');
        player.emote={name:'gather',until:now()+700};
        notice(socket,`${definition.label}: ${details}.`, 'pickup');broadcast();return;
      }

      if (message.name === 'lodgeClaim') {
        const cabinPurchase = isCabin(message.buildingId) && player.location === 'clearing' && player.dimensionId === 'surface';
        if (!cabinPurchase && (player.location !== 'room' || player.roomKind !== 'lobby')) {
          notice(socket, 'Entre na recepção de uma hospedagem para fazer uma reserva.');
          return;
        }
        const offer = LODGING_OFFER_BY_KEY.get(`${message.buildingId}:${message.mode}`);
        const receptionMatches = cabinPurchase || player.roomBuildingId === offer?.buildingId;
        if (!offer || !receptionMatches) { notice(socket, 'Essa opção não pertence a esta recepção.'); return; }
        if (!player.accountId) { notice(socket, 'Crie uma conta para guardar moedas e reservar uma unidade limitada.'); return; }
        try {
          if (offer.mode === 'rent' && storage.refreshGovernmentTaxQuote) await storage.refreshGovernmentTaxQuote({
            governmentId:marketGovernmentId, taxCode:'lease_income' });
          const days = message.rentalDays === undefined ? 1 : Number(message.rentalDays);
          if (offer.mode === 'rent' && !GAME_RENTAL_DAYS.includes(days)) throw new Error('Escolha um período válido em dias do jogo.');
          if(message.expectedPriceBronze !== undefined && message.expectedPriceBronze !== offer.price*(offer.mode==='rent'?days:1)) throw new Error('O preço mudou. Confira a oferta novamente.');
          const result = await storage.claimLodging({ profileId: player.accountId, ...offer, requestId:message.requestId || null,
            price:offer.price*(offer.mode==='rent'?days:1), durationMs:offer.mode==='rent'?gameDaysToMs(days):null, additionalUnit:message.additionalUnit === true || message.additionalUnit === 'true',
            autoRenew:offer.mode === 'rent' && message.autoRenew === true, governmentId:marketGovernmentId });
          player.lodgingClaim = result.claim;
          player.lodgingLease = result.lease || null;
          await refreshPlayerLodgings(player);
          for (const key of CURRENCY_KEYS) player.inventory[key] = result.wallet[key] || 0;
          if (cabinPurchase) {
            await refreshCabinViews();
            notice(socket, 'Cabana comprada. Você recebeu a chave de proprietário. Use a chave na porta para entrar.', 'chime');
            broadcast(); return;
          }
          player.roomLodgingMode = result.claim.mode;
          const roomKey = lodgingRoomKey(result.claim);
          const detail = roomDetails(roomKey);
          const state = roomStates.get(roomKey) || {
            furniture: [],
            name: roomDisplayName(roomKey, player.name, result.claim),
            kind: detail.kind,
            buildingId: detail.buildingId,
          };
          roomStates.set(roomKey, state);
          player.location = 'room'; player.roomKey = roomKey; player.roomKind = 'lodging';
          player.roomBuildingId = result.claim.buildingId;
          player.roomState = state; player.roomFurniture = state.furniture;
          player.position = { ...getRoomLayout('lodging', result.claim.buildingId, result.claim.mode).spawn };
          indexPlayer(socket, player);
          player.input = { x: 0, y: 0 }; player.commands = []; player.inputSeq = player.receivedSeq;
          player.moving = false; player.emote = null; player.sitting = false;
          registration?.update({ location: player.location, contextId: playerContextId(player) });
          notice(socket, result.alreadyClaimed ? 'Sua unidade já estava reservada. Entre e aproveite a hospedagem.'
            : `${offer.roomLabel} reservado em ${offer.buildingName}. A porta leva de volta à recepção.`, 'chime');
          broadcast();
        } catch (error) {
          notice(socket, error.message || 'Não consegui concluir a reserva.');
        }
        return;
      }

      if (message.name === 'setLodgingAutoRenew') {
        if (!player.accountId || !storage.recurringLeasesAvailable) {
          notice(socket, 'A renovação de aluguel não está disponível nesta hospedagem.'); return;
        }
        try {
          const current = await storage.getLodgingLease(player.accountId, message.leaseId || null);
          if (!current || current.buildingId !== message.buildingId) {
            notice(socket, 'Este balcão não corresponde ao seu aluguel ativo.'); return;
          }
          player.lodgingLease = await storage.setLodgingAutoRenew({
            profileId:player.accountId, leaseId:message.leaseId || null, autoRenew:message.autoRenew === true || message.autoRenew === 'true',
          });
          await refreshPlayerLodgings(player);
          notice(socket, player.lodgingLease.autoRenew
            ? `Renovação automática ativada. Serão cobrados ${formatCoins(player.lodgingLease.rentBronze)} a cada período.`
            : 'Renovação automática desativada. Sua hospedagem termina na data informada.', 'chime');
          broadcast();
        } catch (error) { notice(socket, error.message || 'Não consegui alterar a renovação do aluguel.'); }
        return;
      }

      if (['propertyRequest','propertyQuote','propertyRentList','propertyRentDelist','propertyRent'].includes(message.name)) {
        if(!player.accountId){notice(socket,'Entre com uma conta para negociar imóveis.');return;}
        try {
          const args={profileId:player.accountId,buildingId:message.buildingId};
          if(message.name==='propertyRequest')await storage.requestPropertyPurchase(args);
          else if(message.name==='propertyQuote')await storage.quotePropertyPurchase({...args,requestId:message.requestId,askingPriceBronze:Number(message.askingPriceBronze),decline:message.decline==='true'});
          else if(message.name==='propertyRentList'||message.name==='propertyRentDelist')await storage.listPropertyRental({...args,rentBronze:Number(message.askingPriceBronze),remove:message.name==='propertyRentDelist'});
          else {
            const listing=(await storage.getPropertyRentalListings()).find(l=>l.buildingId===message.buildingId&&!l.occupied);
            const days=Number(message.rentalDays||1);
            if(!listing||!GAME_RENTAL_DAYS.includes(days))throw new Error('O aluguel não está disponível. Atualize a placa.');
            if(message.expectedPriceBronze!==listing.rentBronze*days)throw new Error('O preço do aluguel mudou. Revise novamente.');
            const result=await storage.claimLodging({...args,mode:'rent',unitCount:1,price:listing.rentBronze*days,durationMs:gameDaysToMs(days),landlordProfileId:listing.ownerProfileId,
              additionalUnit:true,requestId:message.requestId,governmentId:marketGovernmentId,autoRenew:message.autoRenew===true});
            for(const key of CURRENCY_KEYS)player.inventory[key]=result.wallet[key]||0;
            await refreshPlayerLodgings(player);
            for(const other of peers.values())if(other.accountId===listing.ownerProfileId){const inv=await storage.getWallet(other.accountId);for(const key of CURRENCY_KEYS)other.inventory[key]=inv[key]||0;}
          }
          await refreshCabinViews();
          for(const other of peers.values())if(other.accountId&&storage.getPropertyRequests)other.propertyRequests=await storage.getPropertyRequests(other.accountId);
          if(message.name==='propertyRequest')for(const other of peers.values())if(other.accountId!==player.accountId&&other.propertyRequests?.some(r=>r.buildingId===message.buildingId&&r.buyerProfileId===player.accountId&&!r.isBuyer))
            notice(other.socket,`${player.name} solicitou comprar sua cabana. Responda na placa ou no diretório de hospedagens.`,'chime');
          if(message.name==='propertyQuote')for(const other of peers.values())if(other.propertyRequests?.some(r=>r.requestId===message.requestId&&r.isBuyer))
            notice(other.socket,`O dono respondeu à sua solicitação de compra. Confira o preço na placa ou no diretório.`,'chime');
          notice(socket,message.name==='propertyRequest'?'Solicitação enviada ao dono. A resposta aparecerá na placa e no diretório.':message.name==='propertyQuote'?'Resposta registrada. O comprador decide se aceita o preço.':message.name==='propertyRent'?'Aluguel pago. Sua chave funciona até o fim do período contratado.':'Anúncio de aluguel atualizado.','chime');broadcast();
        }catch(error){notice(socket,error.message||'Não foi possível concluir a negociação.');}return;
      }
      if (['propertyList', 'propertyDelist', 'propertyBuy'].includes(message.name)) {
        if (!player.accountId) { notice(socket, 'Entre com uma conta para negociar propriedades.'); return; }
        if (message.name !== 'propertyBuy' && !isCabin(message.buildingId)) {
          notice(socket, 'Esta placa não representa uma propriedade negociável.'); return;
        }
        try {
          if (message.name === 'propertyList') {
            if (!storage.listOwnedProperty) throw new Error('O mercado de propriedades ainda não está disponível neste banco.');
            const askingPriceBronze = Number.isSafeInteger(message.askingPriceBronze) ? message.askingPriceBronze : 0;
            await storage.listOwnedProperty({ profileId: player.accountId, buildingId: message.buildingId,
              askingPriceBronze, governmentId: marketGovernmentId });
            await refreshCabinViews();
            notice(socket, 'Anúncio publicado. Você pode retirá-lo na placa da cabana.', 'chime');
            broadcast(); return;
          }
          if (message.name === 'propertyDelist') {
            await storage.removePropertyListing({ profileId: player.accountId, buildingId: message.buildingId });
            await refreshCabinViews();
            notice(socket, 'Anúncio retirado. A propriedade continua sua.', 'chime');
            broadcast(); return;
          }
          if (!isCabin(message.buildingId)) { notice(socket, 'Esta propriedade não está habilitada para compra.'); return; }
          if (storage.refreshGovernmentTaxQuote) await storage.refreshGovernmentTaxQuote({
            governmentId: marketGovernmentId, taxCode: 'property_transfer' });
          const result = await storage.buyListedProperty({ buyerProfileId: player.accountId,
            buildingId: message.buildingId, governmentId: marketGovernmentId, requestId:message.requestId || null, expectedPriceBronze:message.expectedPriceBronze ?? null });
          for (const key of CURRENCY_KEYS) player.inventory[key] = result.buyerWallet[key] || 0;
          player.lodgingClaim = await storage.findLodgingClaim(player.accountId);
          await refreshPlayerLodgings(player);
          for (const other of peers.values()) {
            if (other.accountId === result.sellerProfileId) {
              for (const key of CURRENCY_KEYS) other.inventory[key] = result.sellerWallet[key] || 0;
              other.lodgingClaim = await storage.findLodgingClaim(other.accountId);
              await refreshPlayerLodgings(other);
            }
          }
          await refreshCabinViews();
          notice(socket, `Propriedade comprada por ${formatCoins(result.amount)}. ${formatCoins(result.taxAmount)} foram para o tesouro da vila.`, 'chime');
          for (const other of peers.values()) if (other.accountId === result.sellerProfileId)
            notice(other.socket, `Sua propriedade foi vendida. Você recebeu ${formatCoins(result.sellerAmount)} após o imposto.`, 'chime');
          broadcast(); return;
        } catch (error) { notice(socket, error.message || 'Não consegui concluir a negociação.'); return; }
      }

      if (message.name === 'lodgeEnter') {
        if (isCabin(message.buildingId) && player.location === 'clearing') {
          await enterCabin(player, message.buildingId); broadcast(); return;
        }
        if (player.location !== 'room' || player.roomKind !== 'lobby' || !player.accountId) {
          notice(socket, 'Esta recepção não tem uma unidade sua para abrir.');
          return;
        }
        try {
          const claim = await storage.findLodgingClaim(player.accountId, { buildingId:player.roomBuildingId, mode:message.mode, unitNumber:Number(message.unitNumber)||null });
          if (!claim || claim.buildingId !== player.roomBuildingId) {
            notice(socket, 'Você ainda não tem uma unidade nesta hospedagem.');
            return;
          }
          player.lodgingClaim = claim; player.lodgingLease = player.lodgingLeases?.find(l=>l.buildingId===claim.buildingId&&l.unitNumber===claim.unitNumber)||null; player.roomLodgingMode = claim.mode;
          const roomKey = lodgingRoomKey(claim), detail = roomDetails(roomKey);
          const state = roomStates.get(roomKey) || {
            furniture: await storage.loadRoom(player.accountId, lodgingStorageKey(claim)), name: roomDisplayName(roomKey, player.name, claim), kind: detail.kind, buildingId: detail.buildingId,
          };
          roomStates.set(roomKey, state);
          player.location = 'room'; player.roomKey = roomKey; player.roomKind = 'lodging';
          player.roomBuildingId = claim.buildingId; player.roomState = state; player.roomFurniture = state.furniture;
          player.position = { ...getRoomLayout('lodging', claim.buildingId, claim.mode).spawn };
          indexPlayer(socket, player);
          player.input = { x: 0, y: 0 }; player.commands = []; player.inputSeq = player.receivedSeq;
          player.moving = false; player.emote = null; player.sitting = false;
          registration?.update({ location: player.location, contextId: playerContextId(player) });
          notice(socket, 'Você entrou na sua unidade. A porta volta à recepção.', 'chime');
          broadcast();
        } catch (error) { notice(socket, error.message || 'Não consegui abrir sua unidade.'); }
        return;
      }

      if (message.name === 'lodgeSell') {
        if (player.location !== 'room' || player.roomKind !== 'lobby') {
          notice(socket, 'As vendas de materiais são feitas na recepção.');
          return;
        }
        if (player.roomBuildingId !== 'arrival') {
          notice(socket, 'Esta hospedaria oferece quartos e propriedades, não compra materiais.');
          return;
        }
        if (!player.accountId) { notice(socket, 'Entre com uma conta para guardar as moedas desta venda.'); return; }
        const item = typeof message.item === 'string' ? message.item : '';
        const quote = marketQuotes[item];
        const price = Number.isSafeInteger(quote?.sellPrice) ? quote.sellPrice : TRADE_PRICES[item];
        const quantity = Number.isSafeInteger(message.quantity) && message.quantity >= 1 && message.quantity <= 50 ? message.quantity : 0;
        if (!quantity) { notice(socket, 'Informe uma quantidade inteira entre 1 e 50 para vender.'); return; }
        if (!price) { notice(socket, 'Esse material não está na tabela da recepção.'); return; }
        if ((player.inventory[item] || 0) < quantity) { notice(socket, 'Você não tem essa quantidade no Inventário.'); return; }
        player.inventory[item] -= quantity;
        try {
          const settlement = storage.settleNpcSale
            ? await persistMarketSale(player, item, quantity)
            : (await persistPlayer(player), {
              wallet:await storage.creditWallet(player.accountId, price * quantity), unitPrice:price, amount:price * quantity,
            });
          const wallet = settlement.wallet;
          for (const key of CURRENCY_KEYS) player.inventory[key] = wallet[key] || 0;
          const itemLabels = {
            wood:['graveto seco','gravetos secos'], timber:['peça de madeira bruta','peças de madeira bruta'],
            stone:['pedra','pedras'], sturdyBranch:['galho forte','galhos fortes'], berries:['frutinha','frutinhas'],
            apples:['maçã','maçãs'], leaves:['maço de folhas secas','maços de folhas secas'], vines:['cipó','cipós'], plank:['ripa','ripas'],
            copperOre:['minério de cobre','minérios de cobre'], ironOre:['minério de ferro','minérios de ferro'],
            coal:['carvão mineral','carvões minerais'], charcoal:['carvão vegetal','carvões vegetais'],
            copperIngot:['lingote de cobre','lingotes de cobre'], ironIngot:['lingote de ferro','lingotes de ferro'],
          };
          notice(socket, `Venda concluída: ${quantity} ${itemLabels[item][quantity === 1 ? 0 : 1]} por ${formatCoins(settlement.amount)}.`, 'chime');
          broadcast();
        } catch (error) {
          player.inventory[item] += quantity;
          try { await persistPlayer(player); } catch {}
          notice(socket, error.message || 'Não consegui salvar esta venda. Seus materiais foram devolvidos.');
        }
        return;
      }

      if (message.name === 'lodgeCompleteContract') {
        if (player.location !== 'room' || player.roomKind !== 'lobby') {
          notice(socket, 'Entregue encomendas na recepção.');
          return;
        }
        if (!player.accountId) { notice(socket, 'Entre com uma conta para receber a recompensa da encomenda.'); return; }
        const contract = RESOURCE_CONTRACTS.find(item => item.id === message.contractId);
        if (!contract) { notice(socket, 'Essa encomenda não está disponível.'); return; }
        const dayKey = resourceContractDayKey();
        const lockKey = `${player.accountId}:${dayKey}`;
        if (resourceContractLocks.has(lockKey)) { notice(socket, 'Aguarde a outra entrega terminar.'); return; }
        resourceContractLocks.add(lockKey);
        try {
          try { player.contractState = await storage.getResourceContractState(player.accountId, dayKey); }
          catch { notice(socket, 'Não consegui consultar as encomendas agora. Tente novamente.'); return; }
          if (player.contractState?.dayKey === dayKey && player.contractState.completed.includes(contract.id)) {
            notice(socket, 'Você já entregou esta encomenda hoje.');
            broadcast(false);
            return;
          }
          if ((player.inventory[contract.item] || 0) < contract.quantity) {
            notice(socket, `Junte ${contract.quantity} ${contract.item === 'wood' ? 'gravetos secos' : contract.item === 'plank' ? 'ripas' : contract.item === 'charcoal' ? 'carvões vegetais' : 'lingotes de cobre'} antes de entregar.`);
            return;
          }
          const before = inventorySnapshot(player.inventory);
          removeInventoryItem(player.inventory, contract.item, contract.quantity);
          try { await persistPlayer(player); }
          catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar os materiais; a encomenda continua disponível.'); return; }
          try {
            const result = await storage.completeResourceContract({ profileId:player.accountId, contractId:contract.id, dayKey });
            player.contractState = result.contractState;
            for (const key of CURRENCY_KEYS) player.inventory[key] = result.wallet[key] || 0;
            notice(socket, `Encomenda entregue: ${contract.quantity} materiais por ${formatCoins(contract.reward)}.`, 'chime');
            broadcast(false);
          } catch (error) {
            restoreInventory(player.inventory, before);
            await persistPlayer(player).catch(() => {});
            notice(socket, error.message || 'Não consegui concluir a encomenda; seus materiais foram devolvidos.');
          }
        } finally { resourceContractLocks.delete(lockKey); }
        return;
      }

      if (message.name === 'lodgeBuyTool') {
        if (player.location !== 'room' || player.roomKind !== 'lobby') {
          notice(socket, 'As ferramentas são compradas na recepção.');
          return;
        }
        if (!player.accountId) { notice(socket, 'Entre com uma conta para pagar e guardar uma ferramenta.'); return; }
        const tool = typeof message.tool === 'string' ? message.tool : '';
        const price = TOOL_PRICES[tool];
        if (!price) { notice(socket, 'Essa ferramenta não está à venda.'); return; }
        if (player.inventory[tool] || (AXE_TOOL_IDS.includes(tool) && axeToolFor(player.inventory))
            || (PICKAXE_TOOL_IDS.includes(tool) && pickaxeToolFor(player.inventory))) { notice(socket, 'Você já tem uma ferramenta desse tipo no Inventário.'); return; }
        if (!canAddInventoryItems(player.inventory, { [tool]:1 })) { notice(socket, 'Libere um espaço no Inventário antes de comprar a ferramenta.'); return; }
        let wallet;
        try { wallet = await storage.debitWallet(player.accountId, price); }
        catch (error) { notice(socket, error.message || 'Não consegui concluir a compra.'); return; }
        const before = inventorySnapshot(player.inventory);
        addInventoryItem(player.inventory, tool, 1);
        if (tool === 'stoneAxe') {
          player.inventory.axeSharpness = 100;
          player.inventory.axeDurability = STONE_AXE_DURABILITY;
        } else player.inventory.pickaxeDurability = STONE_PICKAXE_DURABILITY;
        player.inventory.selectedSlot = findInventorySlot(player.inventory, tool);
        for (const key of CURRENCY_KEYS) player.inventory[key] = wallet[key] || 0;
        try {
          await persistPlayer(player);
          notice(socket, `Compra concluída: ${tool === 'stoneAxe' ? 'machado de pedra' : 'picareta de pedra'} por ${formatCoins(price)}.`, 'chime');
          broadcast(false);
        } catch (error) {
          restoreInventory(player.inventory, before);
          try {
            const refunded = await storage.creditWallet(player.accountId, price);
            for (const key of CURRENCY_KEYS) player.inventory[key] = refunded[key] || 0;
            await persistPlayer(player);
          } catch (refundError) { process.stderr.write(`Could not refund failed tool purchase: ${refundError.message}\n`); }
          notice(socket, error.message || 'Não consegui salvar a ferramenta; o pagamento foi devolvido.');
        }
        return;
      }

      if (message.name === 'ownerVisitRoom') {
        let isOwner = false;
        try { isOwner = !!player.accountId && !!staffAuthorization?.hasPermission
          && await staffAuthorization.hasPermission(player.accountId, '*', { scopeKey: 'global' }); }
        catch { notice(socket, 'Não consegui validar a autoridade do Proprietário agora.'); return; }
        if (!isOwner) { notice(socket, 'Essa ação é exclusiva do Proprietário.'); return; }
        const target = [...peers.values()].find(other => other.id === message.playerId);
        if (!target || target === player || !target.accountId || !target.homeRoomKey) {
          notice(socket, 'A casa dessa conta não está disponível agora.'); return;
        }
        const targetRoomKey = target.lodgingClaim ? lodgingRoomKey(target.lodgingClaim) : target.homeRoomKey;
        const targetRoomState = roomStates.get(targetRoomKey) || target.roomState;
        const targetRoomKind = target.lodgingClaim ? 'lodging' : roomDetails(targetRoomKey).kind;
        const targetRoomBuildingId = target.lodgingClaim?.buildingId || null;
        const targetRoomMode = target.lodgingClaim?.mode || null;
        const layout = getRoomLayout(targetRoomKind, targetRoomBuildingId, targetRoomMode);
        const context = playerContextId({ location: 'room', dimensionId: 'surface', roomKey: targetRoomKey });
        const occupied = spatialIndex.query(context, layout.spawn, 16).filter(other => other !== player).map(other => other.position);
        const spawn = getRoomSpawnCandidates(layout).find(point => canOccupyRoom(point, PLAYER_RADIUS, targetRoomState.furniture, layout)
          && occupied.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= PLAYER_RADIUS * 2 + .12));
        if (!spawn) { notice(socket, 'A casa está sem espaço livre para a visita.'); return; }
        player.staffRoomReturn = { location: player.location, dimensionId: player.dimensionId, position: { ...player.position },
          roomKey: player.roomKey, roomKind: player.roomKind, roomBuildingId: player.roomBuildingId,
          roomLodgingMode: player.roomLodgingMode, roomState: player.roomState };
        player.location = 'room'; player.dimensionId = 'surface'; player.roomKey = targetRoomKey;
        player.roomKind = targetRoomKind; player.roomBuildingId = targetRoomBuildingId;
        player.roomLodgingMode = targetRoomMode; player.roomState = targetRoomState;
        player.roomFurniture = targetRoomState.furniture; player.position = { ...spawn };
        resetSceneMotion(player);
        notice(socket, `Você entrou na casa de ${target.name} como visitante.`, 'chime'); broadcast(); return;
      }

      if (message.name === 'visitRoom') {
        const target = [...peers.values()].find(other => other.id === message.playerId);
        if (player.location !== 'clearing' || !target || target === player || target.location !== 'clearing'
            || !target.homeRoomKey || (target.lodgingClaim?.mode === 'rent' && target.lodgingClaim.expiresAt <= now())) {
          notice(socket, 'Essa pessoa não está mais por perto.');
          return;
        }
        if (Math.hypot(player.position.x - target.position.x, player.position.y - target.position.y) > 1.45) {
          notice(socket, 'Chegue perto da pessoa para visitar o quarto.');
          return;
        }
        if (!hasClearInteractionPath(player.position, target.position, {
          targetRadius: PLAYER_RADIUS, ignoreFires: true,
        })) {
          notice(socket, 'Há um obstáculo entre você e essa pessoa.');
          return;
        }
        if (isCabin(target.lodgingClaim?.buildingId)) {
          notice(socket, 'Cabanas são privadas. Vá até a porta e use uma chave concedida pelo dono.'); return;
        }
        const targetRoomKey = target.lodgingClaim ? lodgingRoomKey(target.lodgingClaim) : target.homeRoomKey;
        const targetRoomState = roomStates.get(targetRoomKey) || target.roomState;
        const targetRoomContext = playerContextId({ location: 'room', roomKey: targetRoomKey });
        const targetRoomKind = target.lodgingClaim ? 'lodging' : roomDetails(targetRoomKey).kind;
        const targetRoomBuildingId = target.lodgingClaim?.buildingId || target.roomBuildingId || null;
        const targetRoomLayout = getRoomLayout(targetRoomKind, targetRoomBuildingId, target.lodgingClaim?.mode);
        const occupied = spatialIndex.query(targetRoomContext, targetRoomLayout.spawn, 12)
          .filter(other => other !== player).map(other => other.position);
        const spawns = getRoomSpawnCandidates(targetRoomLayout);
        const spawn = spawns.find(candidate => canOccupyRoom(candidate, PLAYER_RADIUS, targetRoomState.furniture, targetRoomLayout)
          && occupied.every(other => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= PLAYER_RADIUS * 2 + 0.12));
        if (!spawn) {
          notice(socket, 'O quarto está cheio por enquanto.');
          return;
        }
        player.location = 'room';
        player.roomKey = targetRoomKey;
        player.roomKind = targetRoomKind;
        player.roomBuildingId = targetRoomBuildingId;
        player.roomLodgingMode = target.lodgingClaim?.mode || null;
        player.roomState = targetRoomState;
        player.roomFurniture = player.roomState.furniture;
        player.position = { ...spawn };
        indexPlayer(socket, player);
        player.input = { x: 0, y: 0 };
        player.commands = []; player.inputSeq = player.receivedSeq;
        player.moving = false;
        player.emote = null; player.sitting=false;
        registration?.update({ location: player.location, contextId: playerContextId(player) });
        notice(socket, `Você visitou o quarto de ${target.name}. Só a pessoa dona pode mudar os móveis.`, 'chime');
        broadcast();
        return;
      }

      if (message.name === 'placeFurniture') {
        const furnitureNotice=(text,sound='soft',result='rejected')=>notice(socket,text,sound,{action:'roomFurniture',requestId:message.requestId,result});
        if (player.location !== 'room') { furnitureNotice('Entre no quarto para colocar um móvel.'); return; }
        if (!canEditCurrentRoom(player)) { furnitureNotice('Você pode visitar, mas só a pessoa dona pode mudar os móveis.'); return; }
        const customModel=typeof message.catalogId==='string'?objectTemplate(message.catalogId):null;
        const customProperties=customModel&&customModel.properties?.catalogId===message.catalogId?copyData(customModel.properties):null;
        const savedProperties=customProperties?copyData(customProperties):null;
        if(savedProperties){delete savedProperties.kind;delete savedProperties.id;}
        if ((!furnitureByKind(message.kind)||message.catalogId&&!customProperties||customProperties&&customProperties.kind!==message.kind) || player.roomFurniture.length >= ROOM_FURNITURE_LIMIT) {
          furnitureNotice(player.roomFurniture.length >= ROOM_FURNITURE_LIMIT
            ? 'O quarto já está cheio de móveis.' : 'Esse móvel ainda não está disponível.');
          return;
        }
        const position = { x: Number(message.x), y: Number(message.y) };
        const roomLayout = getRoomLayout(player.roomKind, player.roomBuildingId, player.roomLodgingMode || player.lodgingClaim?.mode);
        const occupied = collisionIndex.query(playerContextId(player), position, 1.5)
          .map(other => other.position);
        if (!canPlaceRoomFurniture({...position,kind:message.kind}, player.roomFurniture, occupied, roomLayout)) {
          furnitureNotice('Esse ponto precisa estar livre, num piso plano e longe da porta.');
          return;
        }
        const item = { id: randomUUID().slice(0, 8), kind: message.kind, ...position, rotation: 0, ...(savedProperties?{properties:savedProperties}:{}), ...(message.kind==='lamp'?{enabled:true}:{}) };
        setFurnitureSupport(item,roomFurnitureSupport(item,player.roomFurniture,roomLayout));
        player.roomFurniture.push(item);
        try { await persistRoom(player); }
        catch {
          player.roomFurniture.pop();
          furnitureNotice('Não consegui salvar o quarto. O banco não foi colocado.');
          broadcast();
          return;
        }
        furnitureNotice(customProperties?`${customProperties.label} colocado no quarto.`:item.kind==='stool'?'Banco colocado. Agora o quarto tem um lugar para sentar.':`${furnitureByKind(item.kind).label} colocado no quarto.`, 'chime','accepted');
        broadcast();
        return;
      }

      if (message.name === 'chestMove') {
        const chestNotice = text => notice(socket, text, 'soft', { action: 'roomChest', requestId: message.requestId, result: 'rejected' });
        if (player.location !== 'room') return;
        const chest = player.roomFurniture.find(item => item.kind === 'chest' && roomChestId(player.roomKey, item.id) === message.chestId);
        if (!chest) { chestNotice('Este baú não está neste cômodo.'); return; }
        let outcome;
        try {
          outcome = await applyRoomChestMove({
            player, message, store: storage.roomChests,
            persistPlayer: candidate => persistPlayer(candidate),
            canUseChest: candidate => canEditCurrentRoom(candidate),
            inReach: candidate => Math.hypot(candidate.position.x - chest.x, candidate.position.y - chest.y) <= 1.5,
          });
        } catch { chestNotice('Não consegui acessar o baú agora.'); return; }
        if (!outcome.ok) {
          const text = {
            'sem-permissao': 'Só a pessoa dona deste cômodo pode usar o baú.',
            'longe-demais': 'Chegue mais perto do baú.',
            'bau-cheio': 'O baú está cheio.',
            'inventario-sem-quantidade': 'Você não tem essa quantidade no inventário.',
            'inventario-cheio': 'O inventário está cheio.',
            'nao-salvou': 'Não consegui salvar a mudança do baú. Tente de novo.',
            'acao-repetida': 'Esta ação já foi feita.',
          }[outcome.reason] || 'Não foi possível mover o item.';
          chestNotice(text);
          return;
        }
        notice(socket, 'Baú atualizado.', 'soft', { action: 'roomChest', requestId: message.requestId, result: 'accepted' });
        broadcast(false);
        return;
      }
      if (['removeFurniture','rotateFurniture','moveFurniture','useFurniture'].includes(message.name)) {
        const furnitureNotice=(text,sound='soft',result='rejected')=>notice(socket,text,sound,{action:'roomFurniture',requestId:message.requestId,result});
        if(player.location!=='room')return;
        const use=message.name==='useFurniture';
        if(!use&&!canEditCurrentRoom(player)){furnitureNotice('Você pode visitar, mas só a pessoa dona pode mudar os móveis.');return;}
        const index=player.roomFurniture.findIndex(item=>item.id===message.id),item=player.roomFurniture[index];
        if(!item)return;
        const layout=getRoomLayout(player.roomKind,player.roomBuildingId,player.roomLodgingMode||player.lodgingClaim?.mode);
        const others=player.roomFurniture.filter(other=>other.id!==item.id);
        const distance=Math.hypot(player.position.x-item.x,player.position.y-item.y,
          surfaceHeight(player.position.x,player.position.y,'room',layout)-surfaceHeight(item.x,item.y,'room',layout)-(item.baseZ||0));
        if(use&&distance>1.5){furnitureNotice('Chegue mais perto do móvel.');return;}
        if(use&&!hasClearInteractionPath(player.position,item,{location:'room',furniture:others,targetRadius:roomFurnitureRadius(item),roomLayout:layout})){
          furnitureNotice('Há um obstáculo entre você e o móvel.');return;
        }
        const occupants=spatialIndex.query(playerContextId(player),item,2).filter(other=>other!==player);
        if(occupants.some(other=>roomFurnitureDistance(other.position,item)<PLAYER_RADIUS)){
          furnitureNotice('Este móvel está ocupado.');return;
        }
        const supported=player.roomFurniture.filter(other=>other.supportId===item.id);
        if(!use&&[...peers.values()].some(other=>other.location==='room'&&other.roomKey===player.roomKey&&other.furnitureUse?.id===item.id)){
          furnitureNotice('Alguém está usando este móvel.');return;
        }
        if(message.name==='removeFurniture'&&supported.length){furnitureNotice('Retire primeiro os objetos que estão apoiados neste móvel.');return;}
        if(use&&furnitureUse(item)==='sit'){
          const previous = { position: { ...player.position }, sitting: player.sitting, emote: player.emote };
          if(player.sitting&&distance<.1){player.sitting=false;player.emote=null;}
          else{
            player.position={...player.position,x:item.x,y:item.y,vx:0,vy:0,z:0,vz:0};
            player.sitting=true;player.emote={name:'sit',until:0};
          }
          try {
            await storage.recordInteraction(makeInteractionRecord(player, 'use_furniture', {
              id: item.id, kind: item.kind,
              properties: { x: item.x, y: item.y, rotation: item.rotation || 0, baseZ: item.baseZ || 0,
                supportId: item.supportId || null },
            }, { details: { use: 'sit', sitting: player.sitting } }));
          } catch {
            player.position = previous.position; player.sitting = previous.sitting; player.emote = previous.emote;
            indexPlayer(socket, player);
            furnitureNotice('Não consegui registrar o uso deste móvel. Tente de novo.');
            return;
          }
          player.furnitureUse=null;player.exitFurnitureId=null;
          player.input={x:0,y:0};player.commands=[];player.inputSeq=player.receivedSeq;
          player.sitInputSeq=player.receivedSeq;player.moving=false;indexPlayer(socket,player);broadcast();return;
        }
        const interaction=furnitureUse(item);
        if(use&&(interaction==='lie'||['shower','bathe','wash'].includes(interaction))){
          if(player.furnitureUse&&player.furnitureUse.id!==item.id){furnitureNotice('Saia do outro móvel antes de usar este.');return;}
          const previous={position:{...player.position},emote:player.emote,sitting:player.sitting,furnitureUse:player.furnitureUse,exitFurnitureId:player.exitFurnitureId};
          const ending=player.furnitureUse?.id===item.id;
          if(ending){player.position={...player.furnitureUse.returnPosition,vx:0,vy:0,vz:0};player.furnitureUse=null;player.emote=null;player.sitting=false;player.exitFurnitureId=null;}
          else{
            player.position={...player.position,x:item.x,y:item.y,vx:0,vy:0,z:0,vz:0};
            player.sitting=false;player.exitFurnitureId=null;
            const poseAction=['bathe','wash'].includes(interaction)?'shower':interaction;
            player.furnitureUse={id:item.id,kind:item.kind,action:poseAction,rotation:item.rotation||0,
              returnPosition:previous.position,inputSeq:player.receivedSeq};
            player.emote={name:poseAction,until:0};
          }
          try{await storage.recordInteraction(makeInteractionRecord(player,'use_furniture',{
            id:item.id,kind:item.kind,properties:{x:item.x,y:item.y,rotation:item.rotation||0,baseZ:item.baseZ||0},
          },{details:{use:interaction,active:!ending}}));}
          catch{
            player.position=previous.position;player.emote=previous.emote;player.sitting=previous.sitting;
            player.furnitureUse=previous.furnitureUse;player.exitFurnitureId=previous.exitFurnitureId;
            indexPlayer(socket,player);furnitureNotice('Não consegui registrar o uso deste móvel. Tente de novo.');return;
          }
          player.input={x:0,y:0};player.commands=[];player.inputSeq=player.receivedSeq;player.moving=false;
          indexPlayer(socket,player);
          furnitureNotice(ending?(interaction==='lie'?'Você saiu da cama.':'Você encerrou o banho.')
            :(interaction==='lie'?'Você se cobriu para descansar.':interaction==='wash'?'Você lavou as mãos.':interaction==='bathe'?'A tina ficou pronta para o banho.':'A água da ducha começou a cair.'),'chime');
          broadcast();return;
        }
        if(use&&furnitureUse(item)!=='light')return;
        if(use&&!canEditCurrentRoom(player)){furnitureNotice('Só a pessoa dona pode ajustar esta luminária.');return;}
        // A seated owner stands before changing the seat. Movement can exit its footprint.
        if(!use&&distance<.1){player.sitting=false;player.emote=null;}
        const beforeFurniture=player.roomFurniture.map(value=>({...value}));
        const previousEnabled = item.enabled !== false;
        if(message.name==='moveFurniture'){
          const position={x:Number(message.x),y:Number(message.y)};
          const occupied=collisionIndex.query(playerContextId(player),position,2).map(other=>other.position);
          const candidate={...item,...position};setFurnitureSupport(candidate,null);
          const support=roomFurnitureSupport(candidate,others,layout);setFurnitureSupport(candidate,support);
          if(!canPlaceRoomFurniture(candidate,others,occupied,layout)){furnitureNotice('Escolha um piso livre, longe da porta.');return;}
          item.x=position.x;item.y=position.y;setFurnitureSupport(item,support);
          for(const child of supported){
            const angle=(item.rotation||0)*Math.PI/2,offsetX=child.supportOffsetX||0,offsetY=child.supportOffsetY||0;
            child.x=item.x+offsetX*Math.cos(angle)-offsetY*Math.sin(angle);
            child.y=item.y+offsetX*Math.sin(angle)+offsetY*Math.cos(angle);
            child.baseZ=(item.baseZ||0)+furnitureVisual(item).height;
          }
          if(supported.some(child=>!canPlaceRoomFurniture(child,player.roomFurniture.filter(other=>other.id!==child.id),occupied,layout))){
            player.roomFurniture.splice(0,player.roomFurniture.length,...beforeFurniture);
            furnitureNotice('Esse lugar não comporta os objetos apoiados no móvel.');return;
          }
        }else if(message.name==='rotateFurniture'){
          const candidate={...item,rotation:((item.rotation||0)+1)%4};
          if(!canPlaceRoomFurniture(candidate,others,[],layout)){furnitureNotice('Não há espaço para girar esse móvel aqui.');return;}
          item.rotation=candidate.rotation;
          const angle=item.rotation*Math.PI/2;
          for(const child of supported){
            const offsetX=child.supportOffsetX||0,offsetY=child.supportOffsetY||0;
            child.x=item.x+offsetX*Math.cos(angle)-offsetY*Math.sin(angle);
            child.y=item.y+offsetX*Math.sin(angle)+offsetY*Math.cos(angle);
          }
          if(supported.some(child=>!canPlaceRoomFurniture(child,player.roomFurniture.filter(other=>other.id!==child.id),[],layout))){
            player.roomFurniture.splice(0,player.roomFurniture.length,...beforeFurniture);
            furnitureNotice('Não há espaço para girar os objetos apoiados.');return;
          }
        }
        else if(message.name==='removeFurniture')player.roomFurniture.splice(index,1);
        else item.enabled=item.enabled===false;
        try{
          await persistRoom(player);
          if (use) await storage.recordInteraction(makeInteractionRecord(player, 'use_furniture', {
            id: item.id, kind: item.kind,
            properties: { x: item.x, y: item.y, rotation: item.rotation || 0, baseZ: item.baseZ || 0,
              enabled: item.enabled !== false, previousEnabled, ...(item.properties ? { custom: item.properties } : {}) },
          }, { details: { use: 'toggle_light', enabled: item.enabled !== false } }));
        }catch{
          player.roomFurniture.splice(0,player.roomFurniture.length,...beforeFurniture);
          try { await persistRoom(player); } catch {}
          furnitureNotice('Não consegui salvar. O móvel continua como estava.');broadcast();return;
        }
        const objectLabel=furnitureVisual(item).label||furnitureByKind(item.kind)?.label||'Móvel';
        const label=objectLabel;
        furnitureNotice(use?(item.enabled?`${objectLabel} aceso.`:`${objectLabel} apagado.`):
          message.name==='removeFurniture'?`${label} retirado do quarto.`:
          message.name==='rotateFurniture'?`${label} girado.`:
          message.name==='moveFurniture'?`${label} movido.`:'Móvel atualizado.','chime','accepted');broadcast();return;
      }

      if (message.name === 'interact') {
        if (player.location === 'clearing') {
          if (player.dimensionId !== 'surface') {
            notice(socket, 'As recepções e hospedagens ficam no Bosque das Brasas.');
            return;
          }
          const interactionFires = [...firesFor(player.dimensionId).values()];
          const buildingDoor = VILLAGE_BUILDINGS.filter(building=>building.door.enabled!==false).map(building => ({
            building,
            distance: Math.hypot(player.position.x - building.door.x, player.position.y - building.door.y),
          })).filter(item => item.distance <= 1.2 && hasClearInteractionPath(player.position, item.building.door, { fires: interactionFires }))
            .sort((a, b) => a.distance - b.distance)[0];
          const atArrivalDoor = CLEARING_DOOR.enabled!==false && Math.hypot(player.position.x - CLEARING_DOOR.x, player.position.y - CLEARING_DOOR.y) <= 1.2
            && hasClearInteractionPath(player.position, CLEARING_DOOR, { fires: interactionFires });
          const building = buildingDoor?.building || null;
          if (!building && !atArrivalDoor) { notice(socket, 'Chegue perto da porta para atravessar.'); return; }
          const fromPlace = { location: player.location, dimensionId: player.dimensionId, position: { x: player.position.x, y: player.position.y } };
          const usedDoor = building?.door || CLEARING_DOOR;
          if (building?.kind === 'cabin') {
            const entered = await enterCabin(player, building.id);
            if (entered) {
              try { await storage.recordInteraction(makeInteractionRecord(player, 'enter_place', {
                id: building.id, kind: 'door', properties: { x: usedDoor.x, y: usedDoor.y, buildingId: building.id, buildingKind: building.kind },
              }, { context: { dimensionId: fromPlace.dimensionId || 'surface', location: 'clearing', placeId: 'clearing',
                instanceId: 'surface-clearing', position: fromPlace.position },
                details: { from: fromPlace, to: { location: player.location, roomKey: player.roomKey } } })); }
              catch (error) { process.stderr.write(`Could not record door interaction: ${error.message}\n`); }
            }
            broadcast(); return;
          }
          const lobbyId = building?.id || 'arrival';
          const lobbyKey = lobbyRoomKey(lobbyId);
          const lobbyDetails = roomDetails(lobbyKey);
          const lobbyState = roomStates.get(lobbyKey) || {
            furniture: [], name: roomDisplayName(lobbyKey, player.name), kind: 'lobby', buildingId: lobbyDetails.buildingId,
          };
          roomStates.set(lobbyKey, lobbyState);
          player.location = 'room';
          player.roomKey = lobbyKey; player.roomKind = 'lobby'; player.roomBuildingId = lobbyDetails.buildingId;
          player.roomState = lobbyState; player.roomFurniture = lobbyState.furniture;
          player.position = { ...getRoomLayout('lobby', lobbyDetails.buildingId).spawn };
          // Move the player between AOI indexes before awaiting the journal write,
          // so an intervening snapshot cannot omit the player from their scene.
          resetSceneMotion(player);
          notice(socket, `Você entrou na recepção${building ? ` de ${building.name}` : ' da Vila'}.`, 'chime');
          try { await storage.recordInteraction(makeInteractionRecord(player, 'enter_place', {
            id: building?.id || 'arrival', kind: 'door',
            properties: { x: usedDoor.x, y: usedDoor.y, buildingId: building?.id || 'arrival', buildingKind: building?.kind || 'arrival' },
          }, { context: { dimensionId: fromPlace.dimensionId || 'surface', location: 'clearing', placeId: 'clearing',
            instanceId: 'surface-clearing', position: fromPlace.position },
            details: { from: fromPlace, to: { location: player.location, roomKey: player.roomKey } } })); }
          catch (error) { process.stderr.write(`Could not record door interaction: ${error.message}\n`); }
        } else {
          const roomLayout = getRoomLayout(player.roomKind, player.roomBuildingId, player.roomLodgingMode || player.lodgingClaim?.mode);
          if (Math.hypot(player.position.x - roomLayout.door.x, player.position.y - roomLayout.door.y) > 1.2) {
            notice(socket, 'Chegue perto da porta para atravessar.');
            return;
          }
          const fromPlace = { location: player.location, dimensionId: player.dimensionId, roomKey: player.roomKey,
            roomKind: player.roomKind, roomBuildingId: player.roomBuildingId,
            position: { x: player.position.x, y: player.position.y } };
          const usedDoor = { x: roomLayout.door.x, y: roomLayout.door.y };
          if (player.staffRoomReturn) { walkOutOfRoom(player); broadcast(); return; }
          if (player.roomKind === 'lodging' && isCabin(player.roomBuildingId)) {
            const buildingId = player.roomBuildingId;
            leaveCabin(player);
            indexPlayer(socket, player);
            player.input = { x: 0, y: 0 };
            player.commands = []; player.inputSeq = player.receivedSeq;
            player.moving = false;
            player.emote = null; player.sitting = false;
            broadcast();
            try { await storage.recordInteraction(makeInteractionRecord(player, 'leave_place', {
              id: buildingId, kind: 'door', properties: { ...usedDoor, buildingId, buildingKind: 'cabin' },
            }, { context: { dimensionId: fromPlace.dimensionId || 'surface', location: 'room',
              placeId: `room:${fromPlace.roomBuildingId || fromPlace.roomKind || 'home'}`,
              instanceId: fromPlace.roomKey, position: fromPlace.position },
              details: { from: fromPlace, to: { location: player.location, position: { x: player.position.x, y: player.position.y } } } })); }
            catch (error) { process.stderr.write(`Could not record door interaction: ${error.message}\n`); }
            notice(socket, 'Você saiu da cabana. A porta continua trancada.', 'chime'); return;
          }
          if (player.roomKind === 'lodging' && player.roomBuildingId) {
            const lobbyKey = lobbyRoomKey(player.roomBuildingId), detail = roomDetails(lobbyKey);
            const lobbyState = roomStates.get(lobbyKey) || {
              furniture: [], name: roomDisplayName(lobbyKey, player.name), kind: 'lobby', buildingId: detail.buildingId,
            };
            roomStates.set(lobbyKey, lobbyState);
            player.location = 'room'; player.roomKey = lobbyKey; player.roomKind = 'lobby';
            player.roomBuildingId = detail.buildingId; player.roomState = lobbyState; player.roomFurniture = lobbyState.furniture;
            player.position = { ...getRoomLayout('lobby', detail.buildingId).spawn };
            resetSceneMotion(player);
            notice(socket, 'Você voltou à recepção.', 'chime');
          } else {
            const building = player.roomKind === 'lobby' ? villageBuildingById.get(player.roomBuildingId) : null;
            const outsideDoor = building?.door || CLEARING_DOOR;
            player.location = 'clearing'; player.roomKey = player.homeRoomKey; player.roomKind = 'legacy'; player.roomBuildingId = null;
            player.roomState = player.homeRoomState; player.roomFurniture = player.roomState.furniture;
            player.position = { x: outsideDoor.x, y: outsideDoor.y + 0.5 };
            resetSceneMotion(player);
            notice(socket, 'Você voltou ao bosque.', 'chime');
          }
          indexPlayer(socket, player);
          player.input = { x: 0, y: 0 };
          player.commands = []; player.inputSeq = player.receivedSeq;
          player.moving = false;
          player.emote = null; player.sitting = false;
          broadcast();
          try { await storage.recordInteraction(makeInteractionRecord(player, 'leave_place', {
            id: fromPlace.roomKey || 'room-door', kind: 'door',
            properties: { ...usedDoor, buildingId: fromPlace.roomBuildingId || null, buildingKind: fromPlace.roomKind },
          }, { context: { dimensionId: fromPlace.dimensionId || 'surface', location: 'room',
            placeId: `room:${fromPlace.roomBuildingId || fromPlace.roomKind || 'home'}`,
            instanceId: fromPlace.roomKey, position: fromPlace.position },
            details: { from: fromPlace, to: { location: player.location, roomKey: player.roomKey,
              position: { x: player.position.x, y: player.position.y } } } })); }
          catch (error) { process.stderr.write(`Could not record door interaction: ${error.message}\n`); }
        }
        return;
      }
      if (player.location !== 'clearing') {
        notice(socket, message.name === 'collect' ? 'Seu quarto está vazio por enquanto.' : 'Essa ação espera por você na Clareira.');
        return;
      }

      if (message.name === 'collect') {
        const pickupRequest = Number.isSafeInteger(message.requestId) && message.requestId >= 0
          ? { action: 'collect', requestId: message.requestId }
          : null;
        const requestedResourceId = typeof message.resourceId === 'string'
          && message.resourceId.length > 0 && message.resourceId.length <= 180 ? message.resourceId : null;
        const targetReach = requestedResourceId ? 1.5 : 1.2;
        const reach = { left:player.position.x-targetReach, right:player.position.x+targetReach,
          top:player.position.y-targetReach, bottom:player.position.y+targetReach };
        const resourcesForDimension = resourceState(player.dimensionId);
        const interactionFires = [...firesFor(player.dimensionId).values()];
        const nearbyResources = getResourcesInBounds(reach).filter(node => !resourcesForDimension.collected.has(node.id)
          && hasClearInteractionPath(player.position, node, { fires: interactionFires }));
        const batch = nearbyResources.filter(node => ['woodBatch', 'charcoalBatch', 'smeltBatch'].includes(node.kind))
          .map(node => ({ ...node, distance:Math.hypot(player.position.x-node.x, player.position.y-node.y) }))
          .filter(node => node.distance <= targetReach && (!requestedResourceId || node.id === requestedResourceId))
          .sort((a,b) => a.distance-b.distance)[0];
        if (batch) {
          if (batch.readyAt > now()) {
            notice(socket, `Ainda falta ${Math.ceil((batch.readyAt - now()) / 1000)} s para concluir o lote.`, 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
            return;
          }
          const quantity = Math.max(1, Math.min(999, batch.quantity || 1));
          if (!canAddInventoryItems(player.inventory, { [batch.outputItem]:quantity })) {
            const potion = XP_POTIONS[batch.outputItem];
            const messageText = potion && (player.inventory[batch.outputItem] || 0) >= potion.maximumCarried
              ? `Você já carrega o limite de ${potion.maximumCarried} ${potion.label}. Beba uma antes de recolher o lote.`
              : 'O Inventário está cheio. Libere espaço antes de recolher o lote.';
            notice(socket, messageText, 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
            return;
          }
          const before = inventorySnapshot(player.inventory);
          const currentDefinition = worldFor(player.dimensionId);
          const batchEditId = batch.id.replace(/^map-/, '');
          try {
            const updated = updateWorldEdits(currentDefinition, { removeIds: [batchEditId] }, { worldSize:WORLD_SIZE });
            const saved = await storage.saveWorld(updated, currentDefinition.revision, player.dimensionId);
            worldDefinitions.set(player.dimensionId, saved);
            activeWorldRevision = -1;
            activateWorld(player.dimensionId);
            addInventoryItem(player.inventory, batch.outputItem, quantity);
            const interaction = makeInteractionRecord(player, 'collect_batch', {
              id: batch.id, kind: batch.kind,
              properties: { x: batch.x, y: batch.y, quantity, outputItem: batch.outputItem,
                readyAt: batch.readyAt, ...(batch.sourceId ? { sourceId: batch.sourceId } : {}) },
            }, { transfer: {
              from: { type: 'ground', dimensionId: player.dimensionId, placeId: 'clearing',
                instanceId: 'surface-clearing', objectId: batch.id, position: { x: batch.x, y: batch.y } },
              to: { type: 'inventory', profileId: player.sessionId, itemId: batch.outputItem, quantity },
            } });
            try { await persistPlayer(player, interaction); }
            catch {
              restoreInventory(player.inventory, before);
              try { await persistPlayer(player); } catch {}
              try {
                const returned = updateWorldEdits(saved, { upserts: [{
                  id:batchEditId, type:'resource', resourceKind:batch.kind, quantity,
                  outputItem:batch.outputItem, readyAt:batch.readyAt, ...(batch.sourceId ? { sourceId:batch.sourceId } : {}), x:batch.x, y:batch.y,
                }] }, { worldSize:WORLD_SIZE });
                const restored = await storage.saveWorld(returned, saved.revision, player.dimensionId);
                worldDefinitions.set(player.dimensionId, restored);
                activeWorldRevision = -1;
                activateWorld(player.dimensionId);
              } catch (error) { process.stderr.write(`Could not restore production batch: ${error.message}\n`); }
              notice(socket, 'Não consegui salvar o resultado; o lote foi devolvido.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
              broadcast();
              return;
            }
            const outputLabels = {
              wood:['graveto seco','gravetos secos'], plank:['ripa','ripas'], charcoal:['carvão vegetal','carvões vegetais'],
              copperIngot:['lingote de cobre','lingotes de cobre'], ironIngot:['lingote de ferro','lingotes de ferro'],
              xpPotionI:['poção rara de XP I','poções raras de XP I'], xpPotionII:['poção rara de XP II','poções raras de XP II'], xpPotionIII:['poção rara de XP III','poções raras de XP III'], xpPotionIV:['poção rara de XP IV','poções raras de XP IV'],
            };
            notice(socket, `Lote concluído: ${quantity} ${outputLabels[batch.outputItem][quantity === 1 ? 0 : 1]}.`, 'pickup', pickupRequest && {
              ...pickupRequest, result: 'collected', resource: { id: batch.id, kind: batch.kind, x: batch.x, y: batch.y },
            });
            broadcast();
          } catch (error) {
            if (error.status === 409) {
              const latest = await storage.loadWorld(player.dimensionId);
              worldDefinitions.set(player.dimensionId, normalizeWorldDefinition(latest));
              activeWorldRevision = -1;
              activateWorld(player.dimensionId);
              notice(socket, 'Alguém recolheu esse lote antes de você.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
            }
            else notice(socket, 'Não consegui registrar a retirada do lote.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
            broadcast();
          }
          return;
        }
        const collectibleCandidates = requestedResourceId
          ? nearbyResources.filter(node => node.id === requestedResourceId) : nearbyResources;
        const resource = nearestCollectible(player.position, collectibleCandidates, player.inventory, targetReach,
          [...firesFor(player.dimensionId).values()], now());
        if (!resource) {
          const alreadyTakenHere = getResourcesInBounds(reach).some(node => resourcesForDimension.collected.has(node.id)
            && (!requestedResourceId || node.id === requestedResourceId)
            && Math.hypot(player.position.x - node.x, player.position.y - node.y) <= targetReach)
            || worldFor(player.dimensionId).edits.some(edit => edit.type === 'resource-cooldown'
              && (!requestedResourceId || edit.sourceId === requestedResourceId)
              && Math.hypot(player.position.x - edit.x, player.position.y - edit.y) <= targetReach
              && hasClearInteractionPath(player.position, edit, { fires: interactionFires }));
          notice(socket, alreadyTakenHere ? 'Aquele recurso já foi levado; procure outro.' : 'Chegue um pouco mais perto de um recurso.', 'soft', pickupRequest && { ...pickupRequest, result: 'miss' });
          return;
        }
        if (resource.kind === 'vines' && selectedInventoryItem(player.inventory) !== 'knife') {
          notice(socket, 'Equipe a faca na barra rápida para cortar cipó.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
          return;
        }
        if (resource.kind === 'log') {
          notice(socket, 'Essa tora precisa ser cortada com o machado. Pressione H.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
          return;
        }
        if (['copperVein', 'ironVein', 'coalSeam'].includes(resource.kind)) {
          notice(socket, 'Esse depósito precisa ser extraído com uma picareta.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
          return;
        }
        const quantity = Number.isSafeInteger(resource.quantity) ? Math.max(1, Math.min(999, resource.quantity)) : 1;
        if (!canAddInventoryItems(player.inventory, { [resource.kind]: quantity })) {
          notice(socket, 'O Inventário está cheio. Abra o Inventário e libere um espaço antes de coletar.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
          return;
        }
        const beforeInventory = inventorySnapshot(player.inventory);
        resourcesForDimension.collected.add(resource.id);
        const currentDefinition = worldFor(player.dimensionId);
        const respawnAt = Math.max(Date.now() + resourceRespawnMs, Number(resource.respawnAt) || 0);
        const cooldown = {
          id: stableWorldStateId('resource-cooldown', `${player.dimensionId}:${resource.id}`),
          type: 'resource-cooldown', targetId: resource.id.replace(/^map-/, ''), sourceId: resource.id,
          readyAt: respawnAt, x: resource.x, y: resource.y,
        };
        const updated = updateWorldEdits(currentDefinition, { upserts: [cooldown] }, { worldSize: WORLD_SIZE });
        const interaction = makeInteractionRecord(player, 'collect', {
          id: resource.id, kind: resource.kind,
          properties: Object.fromEntries(['x', 'y', 'r', 'quantity', 'respawnAt', 'sourceId', 'sourceType']
            .filter(key => resource[key] !== undefined).map(key => [key, resource[key]])),
        }, { transfer: {
          from: { type: 'ground', dimensionId: player.dimensionId, placeId: 'clearing',
            instanceId: 'surface-clearing', objectId: resource.id, position: { x: resource.x, y: resource.y } },
          to: { type: 'inventory', profileId: player.sessionId, itemId: resource.kind, quantity },
        } });
        const label = resource.kind === 'wood' ? 'graveto seco' : resource.kind === 'sturdyBranch' ? 'galho forte' : resource.kind === 'stone' ? 'pedra solta'
          : resource.kind === 'leaves' ? 'maço de folhas secas' : resource.kind === 'vines' ? 'cipó'
            : resource.kind === 'apples' ? 'maçã' : 'frutinha';
        if (typeof storage.saveWorldAndProgressAndRecordInteraction === 'function') {
          const candidateInventory = createInventory(beforeInventory);
          addInventoryItem(candidateInventory, resource.kind, quantity);
          try {
            const saved = await persistWorldCollection(player, updated, currentDefinition.revision, interaction, candidateInventory);
            restoreInventory(player.inventory, inventorySnapshot(candidateInventory));
            worldDefinitions.set(player.dimensionId, saved);
            activeWorldRevision = -1;
            activateWorld(player.dimensionId);
          } catch (error) {
            restoreInventory(player.inventory, beforeInventory);
            resourcesForDimension.collected.delete(resource.id);
            if (error.status === 409) {
              const latest = normalizeWorldDefinition(await storage.loadWorld(player.dimensionId));
              worldDefinitions.set(player.dimensionId, latest);
              activeWorldRevision = -1;
              activateWorld(player.dimensionId);
              notice(socket, 'Alguém recolheu esse recurso antes de você.');
            } else notice(socket, 'Não consegui registrar a coleta. O recurso continua no chão.');
            return;
          }
        } else {
          try {
            const saved = await storage.saveWorld(updated, currentDefinition.revision, player.dimensionId);
            worldDefinitions.set(player.dimensionId, saved);
            activeWorldRevision = -1;
            activateWorld(player.dimensionId);
          } catch (error) {
            resourcesForDimension.collected.delete(resource.id);
            if (error.status === 409) {
              const latest = normalizeWorldDefinition(await storage.loadWorld(player.dimensionId));
              worldDefinitions.set(player.dimensionId, latest);
              activeWorldRevision = -1;
              activateWorld(player.dimensionId);
              notice(socket, 'Alguém recolheu esse recurso antes de você.');
            } else notice(socket, 'Não consegui registrar a coleta. O recurso continua no chão.');
            return;
          }
          addInventoryItem(player.inventory, resource.kind, quantity);
          try { await persistPlayer(player, interaction); }
          catch {
            restoreInventory(player.inventory, beforeInventory);
            try { await persistPlayer(player); } catch {}
            resourcesForDimension.collected.delete(resource.id);
            try {
              const latest = normalizeWorldDefinition(await storage.loadWorld(player.dimensionId));
              if (latest.edits.some(edit => edit.id === cooldown.id && edit.type === 'resource-cooldown')) {
                const restored = updateWorldEdits(latest, { removeIds: [cooldown.id] }, { worldSize: WORLD_SIZE });
                const returned = await storage.saveWorld(restored, latest.revision, player.dimensionId);
                worldDefinitions.set(player.dimensionId, returned);
                activeWorldRevision = -1;
                activateWorld(player.dimensionId);
              }
            } catch (error) {
              process.stderr.write('Could not restore gathered resource: ' + error.message + '\n');
              const pending = worldFor(player.dimensionId).edits.find(edit => edit.id === cooldown.id && edit.type === 'resource-cooldown');
              if (pending) scheduleResourceCooldown(player.dimensionId, pending);
            }
            notice(socket, 'Não consegui salvar o Inventário; a coleta foi desfeita.', 'soft', pickupRequest && { ...pickupRequest, result: 'rejected' });
            broadcast();
            return;
          }
        }
        player.emote = { name: 'gather', until: now() + 700 };
        scheduleResourceCooldown(player.dimensionId, cooldown);
        const plural = { apples: 'maçãs', leaves: 'maços de folhas secas', vines: 'cipós', sturdyBranch: 'galhos fortes', berries: 'frutinhas', wood: 'gravetos secos', stone: 'pedras soltas' };
        const found = quantity === 1 ? label : `${quantity} ${plural[resource.kind] || `${label}s`}`;
        notice(socket, resource.kind === 'vines' ? 'Você cortou um cipó com a faca simples.' : `Você encontrou ${found}.`, 'pickup', pickupRequest && {
            ...pickupRequest,
            result: 'collected',
            resource: { id: resource.id, kind: resource.kind, x: resource.x, y: resource.y },
          });
        broadcast();
        return;
      }

        if (message.name === 'craftPickaxe') {
          if (player.location !== 'clearing') { notice(socket, 'Monte ferramentas no bosque.'); return; }
          if (pickaxeToolFor(player.inventory)) { notice(socket, 'Você já tem uma picareta.'); return; }
          if (player.inventory.stone < 2 || player.inventory.sturdyBranch < 1 || player.inventory.vines < 1) {
            notice(socket, 'Para montar uma picareta simples, junte 2 pedras, 1 galho forte e 1 cipó.');
            return;
          }
          const before = inventorySnapshot(player.inventory);
          removeInventoryItem(player.inventory, 'stone', 2);
          removeInventoryItem(player.inventory, 'sturdyBranch', 1);
          removeInventoryItem(player.inventory, 'vines', 1);
          addInventoryItem(player.inventory, 'stonePickaxe', 1);
          player.inventory.pickaxeDurability = STONE_PICKAXE_DURABILITY;
          player.inventory.selectedSlot = findInventorySlot(player.inventory, 'stonePickaxe');
          try { await persistPlayer(player); }
          catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar a picareta. Os materiais foram devolvidos.'); return; }
          notice(socket, 'Você montou uma picareta de pedra. Equipe-a na barra rápida para extrair os veios.');
          broadcast(false);
          return;
        }

        if (message.name === 'upgradeAxe' || message.name === 'upgradePickaxe') {
          if (player.location !== 'clearing') { notice(socket, 'Melhore ferramentas no bosque.'); return; }
          const upgradingAxe = message.name === 'upgradeAxe';
          const previousTool = upgradingAxe ? axeToolFor(player.inventory) : pickaxeToolFor(player.inventory);
          const nextTool = upgradingAxe ? axeUpgradeFor(player.inventory) : pickaxeUpgradeFor(player.inventory);
          if (!previousTool) {
            notice(socket, upgradingAxe ? 'Monte ou compre um machado de pedra antes de melhorá-lo.' : 'Monte ou compre uma picareta de pedra antes de melhorá-la.');
            return;
          }
          if (!nextTool) { notice(socket, 'Essa ferramenta já está no melhor nível disponível.'); return; }
          const recipe = nextTool === 'copperAxe' ? { cost:{ copperIngot:3, plank:2 }, label:'machado de cobre' }
            : nextTool === 'ironAxe' ? { cost:{ ironIngot:3, plank:2 }, label:'machado de ferro' }
              : nextTool === 'copperPickaxe' ? { cost:{ copperIngot:2, plank:2 }, label:'picareta de cobre' }
                : { cost:{ ironIngot:3, plank:2 }, label:'picareta de ferro' };
          const nearby = getResourcesInBounds({ left:player.position.x-1.6, right:player.position.x+1.6,
            top:player.position.y-1.6, bottom:player.position.y+1.6 });
          const bench = nearby.filter(item => item.kind === 'woodBench')
            .map(item => ({ ...item, distance:Math.hypot(player.position.x-item.x, player.position.y-item.y) }))
            .filter(item => item.distance <= 1.6 && hasClearInteractionPath(player.position, item, {
              fires:[...firesFor(player.dimensionId).values()], targetRadius:.3,
            })).sort((a,b) => a.distance-b.distance)[0];
          if (!bench) { notice(socket, 'Aproxime-se da bancada para montar uma ferramenta de metal.'); return; }
          const missing = Object.entries(recipe.cost).filter(([item, quantity]) => player.inventory[item] < quantity);
          if (missing.length) {
            const labels = { copperIngot:'lingotes de cobre', ironIngot:'lingotes de ferro', plank:'ripas' };
            notice(socket, `Para fazer ${recipe.label}, faltam ${missing.map(([item,quantity]) => `${quantity} ${labels[item]}`).join(' e ')}.`);
            return;
          }
          const before = inventorySnapshot(player.inventory);
          removeInventoryItem(player.inventory, previousTool, 1);
          for (const [item, quantity] of Object.entries(recipe.cost)) removeInventoryItem(player.inventory, item, quantity);
          addInventoryItem(player.inventory, nextTool, 1);
          if (upgradingAxe) {
            player.inventory.axeSharpness = 100;
            player.inventory.axeDurability = AXE_TOOL_SPECS[nextTool].durability;
          } else player.inventory.pickaxeDurability = PICKAXE_TOOL_SPECS[nextTool].durability;
          player.inventory.selectedSlot = findInventorySlot(player.inventory, nextTool);
          try { await persistPlayer(player); }
          catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar a melhoria; os materiais e a ferramenta antiga foram devolvidos.'); return; }
          notice(socket, `Você melhorou a ferramenta para ${recipe.label}. O metal aumenta a vida útil e reduz o trabalho por recurso.`);
          broadcast(false);
          return;
        }

        if (message.name === 'buildBench' || message.name === 'buildKiln' || message.name === 'buildFurnace') {
          if (player.location !== 'clearing') { notice(socket, 'Construa máquinas no bosque.'); return; }
          const building = message.name === 'buildBench' ? { kind:'woodBench', cost:{ timber:24, stone:8, vines:4 }, label:'bancada de corte' }
            : message.name === 'buildKiln' ? { kind:'charcoalKiln', cost:{ timber:20, stone:12, plank:4 }, label:'caieira' }
              : { kind:'stoneFurnace', cost:{ stone:25, timber:8, plank:8 }, label:'fornalha de pedra' };
          const reach = { left:player.position.x-2, right:player.position.x+2, top:player.position.y-2, bottom:player.position.y+2 };
          if (getResourcesInBounds(reach).some(item => ['woodBench','charcoalKiln','stoneFurnace'].includes(item.kind)
              && Math.hypot(player.position.x-item.x, player.position.y-item.y) < 1.6)) {
            notice(socket, 'Escolha um ponto livre, afastado das outras máquinas.');
            return;
          }
          const missing = Object.entries(building.cost).filter(([item, quantity]) => player.inventory[item] < quantity);
          if (missing.length) {
            const labels = { timber:'madeira bruta', stone:'pedras', vines:'cipós', plank:'ripas' };
            const need = missing.map(([item, quantity]) => `${quantity} ${labels[item] || item}`).join(', ');
            notice(socket, `Para construir a ${building.label}, faltam ${need}.`);
            return;
          }
          const before = inventorySnapshot(player.inventory);
          for (const [item, quantity] of Object.entries(building.cost)) removeInventoryItem(player.inventory, item, quantity);
          try { await persistPlayer(player); }
          catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar os materiais; eles foram devolvidos.'); return; }
          const currentDefinition = worldFor(player.dimensionId);
          const id = `${building.kind}-${randomUUID().replaceAll('-', '').slice(0, 18)}`;
          try {
            const updated = appendWorldEdits(currentDefinition, [{ id, type:'resource', resourceKind:building.kind, x:player.position.x, y:player.position.y }], { worldSize:WORLD_SIZE });
            const saved = await storage.saveWorld(updated, currentDefinition.revision, player.dimensionId);
            worldDefinitions.set(player.dimensionId, saved);
            activeWorldRevision = -1;
            activateWorld(player.dimensionId);
            notice(socket, `Você construiu uma ${building.label}. Ela fica no mundo para todos usarem.`);
            broadcast();
          } catch (error) {
            restoreInventory(player.inventory, before);
            await persistPlayer(player).catch(() => {});
            if (error.status === 409) {
              const latest = await storage.loadWorld(player.dimensionId);
              worldDefinitions.set(player.dimensionId, normalizeWorldDefinition(latest));
              activeWorldRevision = -1;
              activateWorld(player.dimensionId);
            }
            notice(socket, error.status === 409 ? 'O mundo mudou; tente construir novamente.' : 'Não consegui salvar a máquina; os materiais foram devolvidos.');
          }
          return;
        }

        if (message.name === 'process') {
          if (player.location !== 'clearing') { notice(socket, 'Use as máquinas no bosque.'); return; }
          const reach = { left:player.position.x-1.6, right:player.position.x+1.6, top:player.position.y-1.6, bottom:player.position.y+1.6 };
          const nearby = getResourcesInBounds(reach);
          const machine = nearby.filter(item => ['woodBench','charcoalKiln','stoneFurnace'].includes(item.kind))
            .map(item => ({ ...item, distance:Math.hypot(player.position.x-item.x, player.position.y-item.y) }))
            .filter(item => item.distance <= 1.6 && hasClearInteractionPath(player.position, item, {
              fires: [...firesFor(player.dimensionId).values()], targetRadius: 0.3,
            })).sort((a,b) => a.distance-b.distance)[0];
          if (!machine) { notice(socket, 'Chegue perto de uma bancada, caieira ou fornalha para iniciar um lote.'); return; }
          const sourceId = machine.id.replace(/^map-/, '');
          if (nearby.some(item => ['woodBatch','charcoalBatch','smeltBatch'].includes(item.kind) && item.sourceId === sourceId)) {
            notice(socket, 'Esta máquina ainda tem um lote no chão. Recolha-o antes de iniciar outro.');
            return;
          }
          let recipe;
          if (XP_POTION_RECIPES[message.output]) {
            if ((player.inventory.level || 1) >= MAX_PLAYER_LEVEL) {
              notice(socket, 'Nível máximo atingido; poções de XP não podem ser preparadas.'); return;
            }
            const potion = XP_POTIONS[message.output];
            if ((player.inventory[message.output] || 0) >= potion.maximumCarried) {
              notice(socket, `Você já carrega o limite de ${potion.maximumCarried} ${potion.label}. Beba uma antes de preparar outra.`); return;
            }
            const potionRecipe = XP_POTION_RECIPES[message.output];
            const tier = message.output.slice(-1);
            if (machine.kind !== 'stoneFurnace') { notice(socket, 'As poções de XP precisam ser preparadas numa fornalha de pedra.'); return; }
            const minimumLevel = XP_POTIONS[message.output].minimumLevel;
            if ((player.inventory.level || 1) < minimumLevel) {
              notice(socket, `A poção de XP ${tier} exige nível ${minimumLevel}.`); return;
            }
            recipe = { kind:'smeltBatch', outputItem:message.output, quantity:1, durationMs:potionRecipe.durationMs,
              cost:potionRecipe.cost, label:`poção rara de XP ${tier}` };
          } else if (machine.kind === 'woodBench') {
            const outputItem = message.output === 'wood' ? 'wood' : 'plank';
            recipe = outputItem === 'plank'
              ? { kind:'woodBatch', outputItem, quantity:5, durationMs:30_000, cost:{ timber:20 }, label:'5 ripas' }
              : { kind:'woodBatch', outputItem, quantity:12, durationMs:18_000, cost:{ plank:2 }, label:'12 gravetos secos' };
          } else if (machine.kind === 'charcoalKiln') {
            recipe = { kind:'charcoalBatch', outputItem:'charcoal', quantity:6, durationMs:90_000, cost:{ timber:20 }, label:'carvão vegetal' };
          } else {
            const fuel = player.inventory.charcoal >= 2 ? { charcoal:2 } : player.inventory.coal >= 1 ? { coal:1 } : null;
            if (fuel && player.inventory.ironOre >= 1) recipe = { kind:'smeltBatch', outputItem:'ironIngot', quantity:1, durationMs:75_000, cost:{ ironOre:1, ...fuel }, label:'lingote de ferro' };
            else if (fuel && player.inventory.copperOre >= 1) recipe = { kind:'smeltBatch', outputItem:'copperIngot', quantity:1, durationMs:45_000, cost:{ copperOre:1, ...fuel }, label:'lingote de cobre' };
            else {
              notice(socket, 'A fornalha precisa de 1 minério e de 2 carvões vegetais ou 1 carvão mineral.');
              return;
            }
          }
          const missing = Object.entries(recipe.cost).filter(([item, quantity]) => player.inventory[item] < quantity);
          if (missing.length) {
            const labels = { timber:'madeira bruta', plank:'ripas', ironOre:'minério de ferro', copperOre:'minério de cobre', ironIngot:'lingotes de ferro', cinderShard:'fragmentos de cinza', emberCore:'núcleo de brasa', charcoal:'carvões vegetais', coal:'carvão mineral', glowDust:'pó de luz', berries:'frutinhas', venom:'veneno', bone:'ossos' };
            const need = missing.map(([item, quantity]) => `${quantity} ${labels[item] || item}`).join(', ');
            notice(socket, `Para preparar ${recipe.label}, faltam ${need}.`);
            return;
          }
          const before = inventorySnapshot(player.inventory);
          for (const [item, quantity] of Object.entries(recipe.cost)) removeInventoryItem(player.inventory, item, quantity);
          try { await persistPlayer(player); }
          catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar os insumos; eles foram devolvidos.'); return; }
          const currentDefinition = worldFor(player.dimensionId);
          const serial = randomUUID().replaceAll('-', '').slice(0, 18);
          const readyAt = now() + recipe.durationMs;
          try {
            const updated = appendWorldEdits(currentDefinition, [{
              id:`${recipe.kind}-${serial}`, type:'resource', resourceKind:recipe.kind, outputItem:recipe.outputItem,
              quantity:recipe.quantity, readyAt, sourceId, x:machine.x + .45, y:machine.y + .32,
            }], { worldSize:WORLD_SIZE });
            const saved = await storage.saveWorld(updated, currentDefinition.revision, player.dimensionId);
            worldDefinitions.set(player.dimensionId, saved);
            activeWorldRevision = -1;
            activateWorld(player.dimensionId);
            const minutes = Math.floor(recipe.durationMs / 60_000);
            const seconds = Math.ceil((recipe.durationMs % 60_000) / 1_000);
            const durationLabel = minutes && seconds ? `${minutes} min e ${seconds} s` : minutes ? `${minutes} min` : `${seconds} s`;
            notice(socket, `A máquina começou a preparar ${recipe.label}. Volte em ${durationLabel}.`);
            broadcast();
          } catch (error) {
            restoreInventory(player.inventory, before);
            await persistPlayer(player).catch(() => {});
            if (error.status === 409) {
              const latest = await storage.loadWorld(player.dimensionId);
              worldDefinitions.set(player.dimensionId, normalizeWorldDefinition(latest));
              activeWorldRevision = -1;
              activateWorld(player.dimensionId);
            }
            notice(socket, error.status === 409 ? 'O mundo mudou; tente iniciar o lote novamente.' : 'Não consegui registrar o lote; os insumos foram devolvidos.');
          }
          return;
        }

        if (message.name === 'sharpen') {
          if (player.location !== 'clearing') { notice(socket, 'Afie o machado no bosque.'); return; }
          const equippedAxe = selectedInventoryItem(player.inventory);
          if (!AXE_TOOL_IDS.includes(equippedAxe) || !player.inventory[equippedAxe] || player.inventory.axeDurability <= 0) { notice(socket, 'Equipe um machado inteiro para afiá-lo.'); return; }
          if (player.inventory.axeSharpness >= 100) { notice(socket, 'O machado já está afiado.'); return; }
          if (player.inventory.stone < 1) { notice(socket, 'Você precisa de uma pedra solta para afiar o machado.'); return; }
          player.woodworkBusy = true;
          try {
            notice(socket, 'Você começa a afiar o machado. Leva alguns instantes.');
            await new Promise(resolve => setTimeout(resolve, 10_000));
            const before = inventorySnapshot(player.inventory);
            removeInventoryItem(player.inventory, 'stone', 1);
            player.inventory.axeSharpness = 100;
            try { await persistPlayer(player); }
            catch { restoreInventory(player.inventory, before); notice(socket, 'A afiação não foi salva; a pedra foi devolvida.'); return; }
            notice(socket, `Machado afiado. A durabilidade não mudou: ${player.inventory.axeDurability}/${AXE_TOOL_SPECS[equippedAxe].durability} golpes.`);
            broadcast(false);
          } finally { player.woodworkBusy = false; }
          return;
        }

        if (message.name === 'work') {
        if (player.location !== 'clearing') { notice(socket, 'Esse trabalho espera por você no bosque.'); return; }
        player.woodworkBusy = true;
        try {
        const at = now();
        if (at < player.nextWoodworkAt) {
          notice(socket, 'Deixe o machado completar o golpe antes de continuar.', 'soft');
          return;
        }
        activateWorld(player.dimensionId);

        const equippedPickaxe = selectedInventoryItem(player.inventory);
        if (PICKAXE_TOOL_IDS.includes(equippedPickaxe)) {
          const pickaxeSpec = PICKAXE_TOOL_SPECS[equippedPickaxe];
          if (!player.inventory[equippedPickaxe] || player.inventory.pickaxeDurability <= 0) {
            removeInventoryItem(player.inventory, equippedPickaxe, 1);
            player.inventory.pickaxeDurability = 0;
            notice(socket, 'A picareta se partiu. Monte ou compre outra para continuar minerando.');
            await persistPlayer(player).catch(() => {});
            broadcast(false);
            return;
          }
          const reach = { left:player.position.x-1.5, right:player.position.x+1.5, top:player.position.y-1.5, bottom:player.position.y+1.5 };
          const target = getResourcesInBounds(reach)
            .filter(item => ['copperVein', 'ironVein', 'coalSeam'].includes(item.kind))
            .map(item => ({ ...item, distance: Math.hypot(player.position.x-item.x, player.position.y-item.y) }))
            .filter(item => item.distance <= 1.5 && hasClearInteractionPath(player.position, item, {
              fires: [...firesFor(player.dimensionId).values()], targetRadius: 0.3,
            })).sort((a,b) => a.distance-b.distance)[0];
          if (!target) { notice(socket, 'Chegue perto de um veio de cobre, ferro ou carvão para minerar.'); return; }
          const outputItem = ({ copperVein:'copperOre', ironVein:'ironOre', coalSeam:'coal' })[target.kind];
          const workKey = `deposit:${target.id}`;
          const progressId = stableWorldStateId('work-progress', `${player.dimensionId}:deposit:${target.id}`);
          const currentDefinition = worldFor(player.dimensionId);
          const lockKey = `${player.dimensionId}:${workKey}`;
          if (woodworkLocks.has(lockKey)) { notice(socket, 'Alguém já está minerando esse veio.'); return; }
          woodworkLocks.add(lockKey);
          try {
            const current = currentDefinition.edits.find(edit => edit.id === progressId && edit.type === 'work-progress')?.hits || 0;
            const neededHits = pickaxeSpec.hitsPerOre;
            if (current + 1 >= neededHits && !canAddInventoryItems(player.inventory, { [outputItem]: 1 })) {
              notice(socket, 'O Inventário precisa de um espaço para guardar o minério antes do golpe final.');
              return;
            }
            const before = inventorySnapshot(player.inventory);
            player.inventory.pickaxeDurability = Math.max(0, player.inventory.pickaxeDurability - 1);
            const pickaxeBreaks = player.inventory.pickaxeDurability === 0;
            if (pickaxeBreaks) removeInventoryItem(player.inventory, equippedPickaxe, 1);
            try { await persistPlayer(player); }
            catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar o golpe; tente de novo.'); return; }

            const nextHit = current + 1;
            player.nextWoodworkAt = now() + pickaxeSpec.hitDelay;
            player.emote = { name: 'gather', until: now() + 800 };
            if (nextHit < neededHits) {
              try {
                const updated = updateWorldEdits(currentDefinition, { upserts: [{
                  id:progressId, type:'work-progress', targetId:target.id, targetKind:'deposit', hits:nextHit, x:target.x, y:target.y,
                }] }, { worldSize:WORLD_SIZE });
                const saved = await storage.saveWorld(updated, currentDefinition.revision, player.dimensionId);
                worldDefinitions.set(player.dimensionId, saved);
                activeWorldRevision = -1;
                activateWorld(player.dimensionId);
              } catch (error) {
                restoreInventory(player.inventory, before);
                await persistPlayer(player).catch(() => {});
                player.nextWoodworkAt = now();
                if (error.status === 409) {
                  const latest = normalizeWorldDefinition(await storage.loadWorld(player.dimensionId));
                  worldDefinitions.set(player.dimensionId, latest);
                  activeWorldRevision = -1;
                  activateWorld(player.dimensionId);
                  notice(socket, 'O veio mudou em outra sessão. Tente o próximo golpe novamente.');
                } else notice(socket, 'Não consegui salvar o golpe; a durabilidade foi devolvida.');
                broadcast();
                return;
              }
              notice(socket, pickaxeBreaks ? 'A picareta se partiu antes de soltar o minério; o trabalho fica marcado no veio.'
                : `A picareta abre o veio · ${nextHit}/${neededHits} golpes · ${Math.max(0, target.quantity || 1)} unidades visíveis.`);
              broadcast(false);
              return;
            }
            const originalQuantity = Math.max(1, Math.min(999, target.quantity || 1));
            const resourceEditId = target.id.replace(/^map-/, '');
            const remainingDeposit = originalQuantity - 1;
            const upserts = remainingDeposit > 0 ? [{
              id:resourceEditId, type:'resource', resourceKind:target.kind, quantity:remainingDeposit, x:target.x, y:target.y,
            }] : [];
            const removals = [...(remainingDeposit ? [] : [resourceEditId]), progressId];
            try {
              const updated = updateWorldEdits(currentDefinition, { upserts, removeIds: removals }, { worldSize:WORLD_SIZE });
              const saved = await storage.saveWorld(updated, currentDefinition.revision, player.dimensionId);
              worldDefinitions.set(player.dimensionId, saved);
              activeWorldRevision = -1;
              activateWorld(player.dimensionId);
              addInventoryItem(player.inventory, outputItem, 1);
              try { await persistPlayer(player); }
              catch {
                restoreInventory(player.inventory, before);
                try {
                  const restoredWorld = updateWorldEdits(saved, { upserts: [
                    { id:resourceEditId, type:'resource', resourceKind:target.kind, quantity:originalQuantity, x:target.x, y:target.y },
                    { id:progressId, type:'work-progress', targetId:target.id, targetKind:'deposit', hits:current, x:target.x, y:target.y },
                  ] }, { worldSize:WORLD_SIZE });
                  const restored = await storage.saveWorld(restoredWorld, saved.revision, player.dimensionId);
                  worldDefinitions.set(player.dimensionId, restored);
                  activeWorldRevision = -1;
                  activateWorld(player.dimensionId);
                } catch (error) { process.stderr.write(`Could not restore mined deposit: ${error.message}\\n`); }
                notice(socket, 'Não consegui salvar o minério; a unidade foi devolvida ao veio.');
                broadcast();
                return;
              }
              const labels = { copperOre:'minério de cobre', ironOre:'minério de ferro', coal:'carvão mineral' };
              notice(socket, pickaxeBreaks ? `Você extraiu ${labels[outputItem]}, mas a picareta se partiu.` : `Você extraiu 1 ${labels[outputItem]}.`);
              broadcast();
            } catch (error) {
              restoreInventory(player.inventory, before);
              await persistPlayer(player).catch(() => {});
              player.nextWoodworkAt = now();
              if (error.status === 409) {
                const latest = await storage.loadWorld(player.dimensionId);
                worldDefinitions.set(player.dimensionId, normalizeWorldDefinition(latest));
                activeWorldRevision = -1;
                activateWorld(player.dimensionId);
                notice(socket, 'Alguém terminou esse veio antes de você.');
              } else notice(socket, 'Não consegui registrar a extração. O último golpe foi desfeito.');
              broadcast();
            }
          } finally { woodworkLocks.delete(lockKey); }
          return;
        }

        const ownedAxe = axeToolFor(player.inventory);
        if (!ownedAxe) {
          if (player.inventory.sturdyBranch < 1 || player.inventory.stone < 1 || player.inventory.vines < 1) {
            notice(socket, 'Para montar um machado simples, junte 1 galho forte, 1 pedra e 1 cipó.');
            return;
          }
          const before = inventorySnapshot(player.inventory);
          removeInventoryItem(player.inventory, 'sturdyBranch', 1);
          removeInventoryItem(player.inventory, 'stone', 1);
          removeInventoryItem(player.inventory, 'vines', 1);
          addInventoryItem(player.inventory, 'stoneAxe', 1);
          player.inventory.axeSharpness = 100;
          player.inventory.axeDurability = STONE_AXE_DURABILITY;
          player.inventory.selectedSlot = findInventorySlot(player.inventory, 'stoneAxe');
          try { await persistPlayer(player); }
          catch { restoreInventory(player.inventory, before); notice(socket, 'Não consegui salvar o machado. Os materiais foram devolvidos.'); return; }
          player.emote = { name: 'gather', until: now() + 700 };
          notice(socket, 'Você amarrou a pedra ao galho forte e fez um machado. Ele dura cerca de três ciclos completos de árvore e tora; 1–9 troca a ferramenta equipada.');
          broadcast(false);
          return;
        }

        const equippedAxe = selectedInventoryItem(player.inventory);
        if (player.inventory.axeDurability <= 0) {
          if (ownedAxe) removeInventoryItem(player.inventory, ownedAxe, 1);
          player.inventory.axeSharpness = 0;
          notice(socket, 'O machado se partiu. Refaça a ferramenta para continuar.');
          return;
        }
        if (!AXE_TOOL_IDS.includes(equippedAxe) || !player.inventory[equippedAxe]) {
          notice(socket, 'Equipe o machado na barra rápida para cortar madeira. Use 1–9 para trocar.');
          return;
        }
        const axeSpec = AXE_TOOL_SPECS[equippedAxe];

        const reach = { left:player.position.x-1.5, right:player.position.x+1.5, top:player.position.y-1.5, bottom:player.position.y+1.5 };
        const interactionFires = [...firesFor(player.dimensionId).values()];
        const tree = getSolidTreesInBounds(reach)
          .map(item => ({...item,distance:Math.hypot(player.position.x-item.x,player.position.y-item.y)}))
          .filter(item => item.distance <= 1.5 && hasClearInteractionPath(player.position, item, {
            targetRadius: item.r, fires: interactionFires,
          })).sort((a,b)=>a.distance-b.distance)[0];
        const log = getResourcesInBounds(reach).filter(item => item.kind === 'log')
          .map(item => ({...item,distance:Math.hypot(player.position.x-item.x,player.position.y-item.y)}))
          .filter(item => item.distance <= 1.5 && hasClearInteractionPath(player.position, item, {
            fires: interactionFires, targetRadius: 0.3,
          }))
          .sort((a,b)=>a.distance-b.distance)[0];
        const target = !tree ? log : !log ? tree : tree.distance <= log.distance ? tree : log;
        if (!target) { notice(socket, 'Chegue perto de uma árvore ou de uma tora para trabalhar.'); return; }

        const isTree = target.id && !target.kind;
        const workKey = `${isTree ? 'tree' : 'log'}:${target.id}`;
        const targetKind = isTree ? 'tree' : 'log';
        const progressId = stableWorldStateId('work-progress', `${player.dimensionId}:${targetKind}:${target.id}`);
        const currentDefinition = worldFor(player.dimensionId);
        const lockKey = `${player.dimensionId}:${workKey}`;
        if (woodworkLocks.has(lockKey)) { notice(socket, 'Alguém já está trabalhando nessa árvore ou tora.'); return; }
        woodworkLocks.add(lockKey);
        try {
        const current = currentDefinition.edits.find(edit => edit.id === progressId && edit.type === 'work-progress')?.hits || 0;
        const neededHits = isTree ? axeSpec.treeHits : axeSpec.logHits;
        if (!isTree && current + 1 >= neededHits
            && !canAddInventoryItems(player.inventory, { timber: 200 })) {
          notice(socket, 'O Inventário precisa de espaço para 200 peças de madeira bruta antes de terminar a tora.');
          return;
        }
        const before = inventorySnapshot(player.inventory);
        const beforeSharpness = player.inventory.axeSharpness;
        const beforeDurability = player.inventory.axeDurability;
        player.inventory.axeSharpness = Math.max(0, beforeSharpness - axeSpec.sharpnessLoss);
        player.inventory.axeDurability = Math.max(0, beforeDurability - 1);
        const axeBreaks = player.inventory.axeDurability === 0;
        if (axeBreaks) {
          removeInventoryItem(player.inventory, equippedAxe, 1);
          player.inventory.axeSharpness = 0;
        }
        const nextHit = current + 1;
        const delayTier = beforeSharpness >= 60 ? 0 : beforeSharpness >= 30 ? 1 : beforeSharpness > 0 ? 2 : 3;
        const hitDelayMs = axeSpec.hitDelay[delayTier];
        player.nextWoodworkAt = now() + hitDelayMs;
        player.emote = { name: 'gather', until: now() + 800 };
        if (nextHit < neededHits) {
          try {
            const updated = updateWorldEdits(currentDefinition, { upserts: [{
              id:progressId, type:'work-progress', targetId:target.id, targetKind, hits:nextHit, x:target.x, y:target.y,
            }] }, { worldSize:WORLD_SIZE });
            const saved = await persistWoodworkState(player,updated,currentDefinition.revision);
            worldDefinitions.set(player.dimensionId, saved);
            activeWorldRevision = -1;
            activateWorld(player.dimensionId);
          } catch (error) {
            restoreInventory(player.inventory, before);
            await persistPlayer(player).catch(() => {});
            player.nextWoodworkAt = now();
            if (error.status === 409) {
              const latest = normalizeWorldDefinition(await storage.loadWorld(player.dimensionId));
              worldDefinitions.set(player.dimensionId, latest);
              activeWorldRevision = -1;
              activateWorld(player.dimensionId);
              notice(socket, 'O mundo mudou em outra sessão. Tente o próximo golpe novamente.');
            } else notice(socket, 'Não consegui salvar o golpe; a durabilidade foi devolvida.');
            broadcast();
            return;
          }
          notice(socket, axeBreaks ? 'O machado se partiu no golpe. Termine o trabalho com outra ferramenta.'
            : isTree ? `O machado entra na madeira · ${nextHit}/${neededHits} golpes · fio ${player.inventory.axeSharpness}%.`
              : `A tora começa a abrir · ${nextHit}/${neededHits} cortes · fio ${player.inventory.axeSharpness}%.`);
          broadcast(false);
          return;
        }

        const serial = randomUUID().replaceAll('-', '').slice(0, 18);
        const treeFelledAt = Date.now();
        const treeRespawnAt = treeFelledAt + TREE_REGROWTH_MS;
        const edits = isTree
          ? [
            { id:`fell-${serial}`, type:'tree-remove', targetId:target.id, growthStage:'stump', nextGrowthAt:treeFelledAt + TREE_STUMP_MS,
              respawnAt:treeRespawnAt, x:target.x, y:target.y },
            { id:`log-${serial}`, type:'resource', resourceKind:'log', x:target.x, y:target.y },
            { id:stableWorldStateId('tree-drop-apples', `${player.dimensionId}:${target.id}`), type:'resource', resourceKind:'apples', quantity:3, respawnAt:treeRespawnAt, x:target.x + .35, y:target.y + .18 },
            { id:stableWorldStateId('tree-drop-leaves', `${player.dimensionId}:${target.id}`), type:'resource', resourceKind:'leaves', quantity:4, respawnAt:treeRespawnAt, x:target.x + .65, y:target.y + .42 },
            { id:stableWorldStateId('tree-drop-vines', `${player.dimensionId}:${target.id}`), type:'resource', resourceKind:'vines', quantity:2, respawnAt:treeRespawnAt, x:target.x + .85, y:target.y + .08 },
            { id:stableWorldStateId('tree-drop-branches', `${player.dimensionId}:${target.id}`), type:'resource', resourceKind:'sturdyBranch', quantity:2, respawnAt:treeRespawnAt, x:target.x + .22, y:target.y + .72 },
          ] : [];
        try {
          const updated = updateWorldEdits(currentDefinition, {
            upserts: edits,
            removeIds: [progressId, ...(!isTree ? [target.id.replace(/^map-/, '')] : [])],
          }, { worldSize:WORLD_SIZE });
          let saved;
          if(!isTree&&typeof storage.saveWorldAndProgress==='function'){
            addInventoryItem(player.inventory,'timber',200);
            saved=await persistWorldAndProgress(player,updated,currentDefinition.revision);
          }else saved=await persistWoodworkState(player,updated,currentDefinition.revision);
          worldDefinitions.set(player.dimensionId, saved);
          activeWorldRevision = -1;
          activateWorld(player.dimensionId);
          if (isTree) {
            scheduleTreeRegrowth(player.dimensionId, edits[0]);
            notice(socket, 'A árvore caiu. Maçãs, folhas, cipós e alguns galhos ficaram no chão; a tora ainda precisa ser cortada. O toco vira muda e árvore jovem antes da árvore adulta voltar, após 7 dias do jogo.');
          } else {
            if(typeof storage.saveWorldAndProgress==='function')
              notice(socket, 'Você cortou a tora e guardou 200 peças de madeira bruta. Na bancada, transforme a madeira em ripas e fatie algumas para obter gravetos.');
            else {
            const rewardBefore = inventorySnapshot(player.inventory);
            addInventoryItem(player.inventory, 'timber', 200);
            try { await persistPlayer(player); }
            catch {
              restoreInventory(player.inventory, rewardBefore);
              try {
                const returned = updateWorldEdits(saved, {
                  upserts: [
                    { id:target.id.replace(/^map-/, ''), type:'resource', resourceKind:'log', x:target.x, y:target.y },
                    { id:progressId, type:'work-progress', targetId:target.id, targetKind:'log', hits:current, x:target.x, y:target.y },
                  ],
                }, { worldSize:WORLD_SIZE });
                const restored = await storage.saveWorld(returned, saved.revision, player.dimensionId);
                worldDefinitions.set(player.dimensionId, restored);
                activeWorldRevision = -1;
                activateWorld(player.dimensionId);
              } catch (error) { process.stderr.write(`Could not restore cut log: ${error.message}\n`); }
              notice(socket, 'Não consegui salvar a madeira; a tora foi devolvida.');
              broadcast();
              return;
            }
            notice(socket, 'Você cortou a tora e guardou 200 peças de madeira bruta. Na bancada, transforme a madeira em ripas e fatie algumas para obter gravetos.');
            }
          }
          broadcast();
        } catch (error) {
          restoreInventory(player.inventory, before);
          await persistPlayer(player).catch(() => {});
          player.nextWoodworkAt = now();
          if (error.status === 409) {
            const latest = await storage.loadWorld(player.dimensionId);
            worldDefinitions.set(player.dimensionId, normalizeWorldDefinition(latest));
            activeWorldRevision = -1;
            activateWorld(player.dimensionId);
            notice(socket, 'Alguém terminou esse trabalho antes de você.');
          } else notice(socket, 'Não consegui registrar este trabalho. O último golpe foi desfeito.');
          broadcast();
        }
        } finally { woodworkLocks.delete(lockKey); }
        return;
        } finally { player.woodworkBusy = false; }
      }

      if (message.name === 'share') {
        if (player.inventory.berries < 1) { notice(socket, 'Encontre uma frutinha antes de oferecer.'); return; }
        const nearbyPlayers = collisionIndex.query(playerContextId(player), player.position, 1.8);
        const visiblePlayers = nearbyPlayers.filter(other => other.id !== player.id
          && hasClearInteractionPath(player.position, other.position, {
            targetRadius: PLAYER_RADIUS, ignoreFires: true,
          }));
        const recipient = getNearestShareTarget(player.position, visiblePlayers, player.id);
        if (!recipient) { notice(socket, 'Ninguém está ao alcance sem um obstáculo entre vocês.'); return; }
        if (!canAddInventoryItems(recipient.inventory, { berries: 1 })) { notice(socket, 'O Inventário da outra pessoa está cheia.'); return; }
        const senderBefore = inventorySnapshot(player.inventory);
        const recipientBefore = inventorySnapshot(recipient.inventory);
        removeInventoryItem(player.inventory, 'berries', 1);
        addInventoryItem(recipient.inventory, 'berries', 1);
        const saveResults = await Promise.allSettled([persistPlayer(player), persistPlayer(recipient)]);
        const saved = saveResults.every(result => result.status === 'fulfilled');
        if (!saved) {
          restoreInventory(player.inventory, senderBefore);
          restoreInventory(recipient.inventory, recipientBefore);
          await Promise.allSettled([persistPlayer(player), persistPlayer(recipient)]);
          notice(socket, 'A oferta não foi salva; a frutinha voltou para o Inventário.');
          notice(recipient.socket, 'A troca não foi salva; a frutinha continua com quem ofereceu.', 'soft');
          return;
        }
        player.emote = { name: 'offer', until: now() + 650 };
        const berryOffer = {
          fromId: player.id,
          toId: recipient.id,
          from: { ...player.position },
          to: { ...recipient.position },
        };
        notice(socket, `Você ofereceu uma frutinha para ${recipient.name}.`, 'chime', { berryOffer });
        notice(recipient.socket, `${player.name} compartilhou uma frutinha com você.`, 'pickup', { berryOffer });
        broadcast();
        return;
      }

      const actionDimensionId = player.dimensionId;
      await serializeCampfireAction(actionDimensionId, async () => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (player.location !== 'clearing' || player.dimensionId !== actionDimensionId) {
          notice(socket, 'Essa ação espera por você na Clareira.');
          return;
        }
        if (await removeFullyDecayedCampfires(actionDimensionId)) broadcast();
        const playerFires = firesFor(actionDimensionId);
        const nearbyFire = [...playerFires.values()]
          .map(fire => ({ fire, distance: Math.hypot(fire.x - player.position.x, fire.y - player.position.y) }))
          .filter(item => item.distance < 1.6 && hasClearInteractionPath(player.position, item.fire, {
            targetRadius: FIRE_RADIUS, fires: [...playerFires.values()],
          }))
          .sort((left, right) => left.distance - right.distance)[0]?.fire;
        if (nearbyFire?.permanent === true) {
          notice(socket, 'Essa fogueira nunca se apaga.');
          return;
        }
        if (nearbyFire) {
          const at = now();
          const remainingMs = campfireRemainingMs(nearbyFire, at);
          let cost;
          let from;
          let successText;
          if (remainingMs > 0) {
            if (remainingMs > CAMPFIRE_FEED_WINDOW_MS) {
              notice(socket, 'Essa fogueira ainda está forte.');
              return;
            }
            cost = CAMPFIRE_FEED_COST;
            from = campfireFlameStrength(nearbyFire, at);
            successText = 'Você alimentou a fogueira; ela voltou à força máxima.';
          } else if (campfireDecayProgress(nearbyFire, at) > 0) {
            cost = CAMPFIRE_DECAY_REBUILD_COST;
            from = 0;
            successText = 'Você reconstruiu e reacendeu a fogueira.';
          } else {
            cost = CAMPFIRE_REKINDLE_COST;
            from = 0;
            successText = 'Você reacendeu a fogueira.';
          }

          const spend = await spendCampfireMaterials(player, cost);
          if (spend !== 'ok') {
            notice(socket, spend === 'save'
              ? 'Não consegui salvar os materiais; tente de novo.'
              : remainingMs > 0
                ? `A fogueira está enfraquecendo; precisa de ${campfireCostText(cost)} para alimentá-la.`
                : campfireDecayProgress(nearbyFire, at) > 0
                  ? `A fogueira está se desfazendo; precisa de ${campfireCostText(cost)} para reconstruí-la.`
                  : `Para reacender, junte ${campfireCostText(cost)}.`, 'soft');
            return;
          }

          const previous = { ...nearbyFire };
          startCampfireRise(nearbyFire, at, from);
          try {
            await saveCampfires(actionDimensionId);
          } catch {
            Object.assign(nearbyFire, previous);
            await refundCampfireMaterials(player, cost);
            notice(socket, 'Não consegui salvar a fogueira; os materiais foram devolvidos.');
            return;
          }
          notice(socket, successText, 'fire');
          broadcast();
          return;
        }

        const spend = await spendCampfireMaterials(player, CAMPFIRE_NEW_COST);
        if (spend !== 'ok') {
          notice(socket, spend === 'save'
            ? 'Não consegui salvar os materiais; tente de novo.'
            : `Uma fogueira nova precisa de ${campfireCostText(CAMPFIRE_NEW_COST)}.`);
          return;
        }
        const id = randomUUID().slice(0, 8);
        const at = now();
        const fire = { x: player.position.x, y: player.position.y };
        startCampfireRise(fire, at, 0);
        playerFires.set(id, fire);
        try {
          await saveCampfires(actionDimensionId);
        } catch {
          playerFires.delete(id);
          await refundCampfireMaterials(player, CAMPFIRE_NEW_COST);
          notice(socket, 'Não consegui salvar a fogueira; os materiais foram devolvidos.');
          return;
        }
        notice(socket, 'Você acendeu uma fogueira nova.', 'fire');
        broadcast();
      });
    };
    // Serialize mutations without holding up movement or clock messages.
    let actionQueue = Promise.resolve();
    let queuedActions = 0;
    const dispatchMessage = raw => {
      if(rejectOversizedClientMessage(raw,'ready'))return;
      let message;
      try { message = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (['action', 'emote', 'appearance', 'dimensionTravel', 'dimensionTransitReady'].includes(message.type)) {
        if (queuedActions >= 64) { socket.close(1008, 'action queue full'); return; }
        queuedActions++;
        actionQueue = actionQueue.then(async()=>{
          if(socket.readyState!==WebSocket.OPEN)return;
          const originContext=playerContextId(player);
          await handleMessage(message);
          if(message.type==='action'&&message.name==='interact'&&Number.isSafeInteger(message.requestId)
              &&socket.readyState===WebSocket.OPEN)
            socket.send(JSON.stringify({type:'roomTravelResult',requestId:message.requestId,accepted:originContext!==playerContextId(player)}));
        })
          .catch(error => { process.stderr.write(`Player action failed: ${error.message}\n`); socket.close(1011, 'action failed'); })
          .finally(() => { queuedActions--; });
      } else void handleMessage(message).catch(error => {
        process.stderr.write(`Player message failed: ${error.message}\n`);
        if (socket.readyState === WebSocket.OPEN) socket.close(1011, 'message failed');
      });
    };
    socket.off('message', holdEarlyMessage);
    socket.on('message', dispatchMessage);
    for (const raw of earlyMessages) dispatchMessage(raw);

    socket.on('close', (code, rawReason) => {
      const closeReason=Buffer.isBuffer(rawReason)?rawReason.toString('utf8'):String(rawReason||'');
      const reasonBucket=closeReason==='movement acknowledgements stalled'?'movement-ack-stalled':
        closeReason==='server heartbeat timed out'?'heartbeat-timeout':closeReason==='player presence lease lost'?'presence-lease-lost':
        closeReason==='server shutdown'?'server-shutdown':code===1006?'abnormal-close':code===1009?'payload-too-large':
        code===1012?'server-restart':code===1013?'server-overloaded':code===1008?'policy-close':
        code===1000||code===1001?'normal':closeReason?'other':'abnormal-close';
      if(code!==1000&&code!==1001||player.commands.length||player.receivedSeq>player.inputSeq||player.moving){
        process.stderr.write(JSON.stringify({type:'movement-session-close',at:new Date(now()).toISOString(),connection:diagnosticConnectionTag,
          code:Number(code)||0,reason:reasonBucket,inputSeq:player.inputSeq,receivedSeq:player.receivedSeq,
          queuedCommands:player.commands.length,moving:player.moving===true})+'\n');
      }
      if (player.pendingDimensionTransitId) {
        const transitId = player.pendingDimensionTransitId;
        activeDimensionTransits.delete(transitId);
        for (const key of [transitId, 'ready:'+transitId, 'unlock:'+transitId, 'expire:'+transitId]) clearDimensionTransitTimer(key);
        delete player.pendingDimensionTransitId;
      }
      for (const transit of activeDimensionTransits.values()) {
        if (transit.actorId === player.id && !Number.isFinite(transit.destinationStartAt)) removeDimensionTransit(transit);
      }
      // Staff visits are transient. If the connection drops, resume at the
      // original location instead of persisting the visitor inside someone else's home.
      if (player.staffRoomReturn) walkOutOfRoom(player);
      if (!serverClosing) {
        void persistPlayerLocation(player, true);
        void persistPlayerDimensionPosition(player,player.dimensionId,player.position,true);
      }
      if(player.sessionId) {
        resumableSessions.set(player.sessionId,{at:now(),id:player.id,position:{...player.position},location:player.location,
          dimensionId:player.dimensionId,
          inputSeq:player.inputSeq,receivedSeq:player.receivedSeq,sequenced:player.sequenced,
          commands:player.commands.map(command=>({...command})),
          worldVersion:WORLD_COORDINATE_VERSION,
          homeRoomKey:player.homeRoomKey,roomKey:player.roomKey,roomFurniture:player.roomFurniture.map(item=>({...item})),
          homeFurniture:player.homeRoomState.furniture.map(item=>({...item})),roomOwnerName:player.roomState.name,
          inventory:inventorySnapshot(player.inventory),color:player.color,appearance:player.appearance,
          viewportWidth:player.viewportWidth,viewportHeight:player.viewportHeight});
        if(resumableSessions.size>128)resumableSessions.delete(resumableSessions.keys().next().value);
      }
      peers.delete(socket);
      removeIndexedPlayer(socket);
      broadcast();
    });
    socket.on('error', () => {
      peers.delete(socket);
      removeIndexedPlayer(socket);
      void releaseCoordination(registration).catch(error => {
        process.stderr.write(`Could not release player presence: ${error.message}\n`);
      });
      broadcast();
    });
  };
  webSocketServer.on('connection', (socket, profile, registration, releaseAdmission, releaseAccountAdmission, getCurrentProfile, initialSanctions = []) => {
    void initializePlayerConnection(socket, profile, registration, releaseAdmission, releaseAccountAdmission, getCurrentProfile, initialSanctions)
      .catch(error => {
        process.stderr.write(`WebSocket player initialization failed: ${error.message}\n`);
        releaseAdmission?.();
        releaseAccountAdmission?.();
        const player = peers.get(socket);
        if (player) {
          peers.delete(socket);
          removeIndexedPlayer(socket);
          broadcast(false);
        }
        socket.terminate();
      });
  });

  const pingLoopLag=createEventLoopLag();
  let tickAt=performance.now(), tickRemainder=0, wildlifeTickAt=performance.now(),lastSlowTickDiagnosticAt=0;
  const tick = setInterval(() => {
    const tickStartedAt=performance.now();
    const tickCpuStart=process.cpuUsage();
    const tickNow=performance.now();
    const elapsedSincePreviousTickMs=tickNow-tickAt;
    const budget=simulationBudget(tickRemainder,elapsedSincePreviousTickMs/1000);
    tickAt=tickNow;tickRemainder=budget.remainder;
    const step = FIXED_STEP_SECONDS;
    const wildlifeCollidersByDimension = new Map();
    const wildlifeCollidersFor = dimensionId => {
      if (!wildlifeCollidersByDimension.has(dimensionId)) {
        wildlifeCollidersByDimension.set(dimensionId, wildlifeCollisionBodies(wildlifeFor(dimensionId).values()));
      }
      return wildlifeCollidersByDimension.get(dimensionId);
    };
    const playerPhaseStartedAt=performance.now();
    for (const player of peers.values()) {
      const activeLease=player.lodgingLeases?.find(l=>l.buildingId===player.lodgingClaim?.buildingId&&l.unitNumber===player.lodgingClaim?.unitNumber) || player.lodgingLease;
      const awaitingAutoRenewal = player.lodgingClaim?.mode === 'rent' && activeLease?.autoRenew === true
        && activeLease.nextChargeAt <= now() && now() - activeLease.nextChargeAt < 65_000;
      if (player.lodgingClaim?.mode === 'rent' && player.lodgingClaim.expiresAt <= now() && !awaitingAutoRenewal) {
        if(player.location==='room' && isCabin(player.roomBuildingId) && player.roomBuildingId===player.lodgingClaim.buildingId) leaveCabin(player);
        if (player.location === 'room' && player.roomKind === 'lodging' && player.roomKey === lodgingRoomKey(player.lodgingClaim)) {
          const lobbyKey = lobbyRoomKey(player.lodgingClaim.buildingId);
          const detail = roomDetails(lobbyKey);
          const lobbyState = roomStates.get(lobbyKey) || {
            furniture: [], name: roomDisplayName(lobbyKey, player.name), kind: 'lobby', buildingId: detail.buildingId,
          };
          roomStates.set(lobbyKey, lobbyState);
          player.roomKey = lobbyKey; player.roomKind = 'lobby'; player.roomBuildingId = detail.buildingId;
          player.roomState = lobbyState; player.roomFurniture = lobbyState.furniture;
          player.position = { ...getRoomLayout('lobby', detail.buildingId).spawn };
          player.input = { x: 0, y: 0 }; player.commands = []; player.inputSeq = player.receivedSeq;
          player.moving = false; player.emote = null; player.sitting = false;
          player.registration?.update({ location: player.location, contextId: playerContextId(player) });
          indexPlayer(player.socket, player);
          notice(player.socket, 'Sua diária terminou. Você voltou à recepção; o quarto foi liberado.', 'soft');
        }
        player.lodgingClaim = null;
      }
      activateWorld(player.dimensionId || 'surface');
      if (player.chat && player.chat.until <= now()) player.chat = null;
      const position = player.position;
      const input = player.sequenced ? null : player.input;
      const hasIntent = player.sequenced ? player.commands.length > 0 : Boolean(input.x || input.y);
      const hasResidualMotion = Math.abs(position.vx || 0) >= 1e-7 || Math.abs(position.vy || 0) >= 1e-7
        || (position.z || 0) !== 0 || Math.abs(position.vz || 0) >= 1e-7 || position.jumpHeld === true
        || Number(position.burningRemainingMs)>0;
      const current = !hasIntent && !hasResidualMotion && player.location === 'clearing'
        ? waterStateAt(position.x, position.y, {
          dimensionId: player.dimensionId || 'surface',
          theme: dimensionById(dimensions, player.dimensionId || 'surface')?.theme,
          origin: WORLD_ORIGIN,
        })
        : null;
      if (!hasIntent && !hasResidualMotion && !current?.currentX && !current?.currentY) {
        player.moving = false;
        continue;
      }
      const previous = player.position;
      const occupied = collisionIndex.query(playerContextId(player), player.position, 1)
        .filter(other => other !== player).map(other => other.position);
      const move = (position, input, delta) => player.location === 'room'
        ? moveRoomPlayer(player,position,input,delta,occupied)
        : stepPlayer(position,input,delta,occupied,[...firesFor(player.dimensionId).values()],now(),wildlifeCollidersFor(player.dimensionId), { ...player.inventory.attributes, hasteActive:performance.now()<(player.hasteUntil||0), sprintBurstActive:performance.now()<(player.sprintBurstUntil||0), flightAuthorized:player.flightPilotEnabled });
      if (player.sequenced) {
        let simulatedSteps = advanceQueuedInput(player, { throughSeq: Infinity, maxSteps: budget.steps,
          step, move, crossedRoomExit: didCrossRoomExit, walkOutOfRoom });
        while(simulatedSteps<budget.steps&&Number(player.position.burningRemainingMs)>0&&!player.commands.length){
          player.position=move(player.position,{motion:true,x:0,y:0,jump:false},step,occupied);
          simulatedSteps++;
        }
      } else {
        if(player.sitting && (player.input.x||player.input.y)){player.sitting=false;if(player.emote?.name==='sit')player.emote=null;}
        for(let simulatedSteps=0;simulatedSteps<budget.steps;simulatedSteps++){
          const previousPosition=player.position;
          player.position = move(previousPosition, player.input, step, occupied);
          if(didCrossRoomExit(player,previousPosition,player.position)){walkOutOfRoom(player);break;}
        }
      }
      player.moving = player.position.x !== previous.x || player.position.y !== previous.y;
      if(player.location==='clearing'&&isPersonalArrivalDimensionId(player.dimensionId)){
        if(player.arrivalTutorial?.phase==='welcome'){
          const guide=dimensionById(dimensions,player.dimensionId).guide;
          if(guide&&Math.hypot(player.position.x-guide.x,player.position.y-guide.y)<=5.2){
            player.arrivalTutorial={phase:'lesson',step:0,completed:false,movementStart:{...player.position}};
            broadcast(false);
          }
        }else if(player.arrivalTutorial?.phase==='lesson'&&player.arrivalTutorial.step===0){
          const start=player.arrivalTutorial.movementStart||previous;
          if(Math.hypot(player.position.x-start.x,player.position.y-start.y)>=.55){
            player.arrivalTutorial={phase:'chat',step:1,completed:false};
            broadcast(false);
          }
        }
      }
      indexPlayer(player.socket, player);
      // Residual motion from inputs older than the sit action must not cancel its posture.
    }
    const playerPhaseMs=performance.now()-playerPhaseStartedAt;
    const explorationPhaseStartedAt=performance.now();
    for(const player of peers.values())updatePlayerMapExploration(player);
    const explorationPhaseMs=performance.now()-explorationPhaseStartedAt;
    const wildlifePhaseStartedAt=performance.now();
    const wildlifeNow=now();
    const wildlifeDelta=Math.max(0,Math.min(.12,(tickNow-wildlifeTickAt)/1000));
    wildlifeTickAt=tickNow;
    let wildlifeStepMs=0,wildlifeStepMaxMs=0,wildlifePopulationMax=0,wildlifeStepCount=0;
    const wildlifeProfile={activeAnimals:0,decisions:0,behaviorMs:0,movementMs:0,canOccupyCalls:0,canOccupyMs:0,isOccludedCalls:0,isOccludedMs:0,findWaterCalls:0,findWaterMs:0};
    const activeWildlifePlayers=new Map();
    for(const player of peers.values())if(player.location==='clearing'){
      const dimensionId=player.dimensionId||'surface';
      if(!activeWildlifePlayers.has(dimensionId))activeWildlifePlayers.set(dimensionId,[]);
      activeWildlifePlayers.get(dimensionId).push(player);
    }
    for(const [dimensionId,dimensionPlayers] of activeWildlifePlayers){
      activateWorld(dimensionId);
      const dimension=dimensionById(dimensions,dimensionId);
      const day=getGameDayState(wildlifeNow,{theme:dimension.theme,dimensionId});
      const population=wildlifeFor(dimensionId);
      wildlifePopulationMax=Math.max(wildlifePopulationMax,population.size);
      const wildlifeStepStartedAt=performance.now();
      const wildlifeOcclusionCache=new Map();
      const timedWildlifeQuery=(field,callback)=> (...args)=>{
        const startedAt=performance.now();
        try{return callback(...args);}finally{wildlifeProfile[`${field}Ms`]+=performance.now()-startedAt;}
      };
      const events=stepWildlifePopulation(population,{dimensionId,players:dimensionPlayers,now:wildlifeNow,
        deltaSeconds:wildlifeDelta,night:day.night>.48,hours:day.hours,worldSize:WORLD_SIZE,playerRadius:PLAYER_RADIUS,
        canOccupy:timedWildlifeQuery('canOccupy',(position,radius)=>wildlifeOutsideVillage(position,dimensionId)&&canOccupy(position,radius)),
        isOccluded:timedWildlifeQuery('isOccluded',(from,to)=>{
          const fromKey=from.id||`${from.x},${from.y}`,toKey=to.id||`${to.x},${to.y}`;
          const key=fromKey<toKey?`${fromKey}|${toKey}`:`${toKey}|${fromKey}`;
          if(wildlifeOcclusionCache.has(key))return wildlifeOcclusionCache.get(key);
          const left=Math.min(from.x,to.x),right=Math.max(from.x,to.x),top=Math.min(from.y,to.y),bottom=Math.max(from.y,to.y);
          const trees=getSolidTreesInBounds({left,right,top,bottom});
          const dx=to.x-from.x,dy=to.y-from.y,lengthSquared=dx*dx+dy*dy;
          let occluded=false;
          for(const tree of trees){
            const along=lengthSquared?Math.max(.05,Math.min(.95,((tree.x-from.x)*dx+(tree.y-from.y)*dy)/lengthSquared)):0;
            const gap=Math.hypot(tree.x-(from.x+dx*along),tree.y-(from.y+dy*along));
            if(gap<Math.max(.78,(tree.r||.3)*1.9)){occluded=true;break;}
          }
          wildlifeOcclusionCache.set(key,occluded);
          return occluded;
        }),
        findWater:timedWildlifeQuery('findWater',(x,y,radius)=>{
          let nearest=null,nearestDistance=Infinity;
          for(const ring of [1,2,3,4.5,6.5]){
            if(ring>radius)continue;
            for(let index=0;index<12;index++){
              const angle=index*Math.PI/6;
              const candidate={x:x+Math.cos(angle)*ring,y:y+Math.sin(angle)*ring};
              const water=waterStateAt(candidate.x,candidate.y,{dimensionId,theme:dimension.theme,origin:WORLD_ORIGIN});
              if(water.depth<.25||water.depth>1.05)continue;
              const gap=Math.hypot(candidate.x-x,candidate.y-y);
              if(gap<nearestDistance){nearest=candidate;nearestDistance=gap;}
            }
          }
          return nearest;
        }),populationLimit:WILDLIFE_POPULATION_LIMIT,profile:wildlifeProfile});
      const wildlifeStepDurationMs=performance.now()-wildlifeStepStartedAt;
      wildlifeStepMs+=wildlifeStepDurationMs;wildlifeStepMaxMs=Math.max(wildlifeStepMaxMs,wildlifeStepDurationMs);wildlifeStepCount++;
      for(const event of events)if(event.type==='player-attacked'||event.type==='player-evaded'){
        const target=[...peers.entries()].find(([,player])=>player.id===event.playerId);
        if(target){const definition=WILDLIFE_BY_ID.get(event.speciesId);notice(target[0],event.type==='player-evaded'?`Você esquivou do ataque de ${definition?.label||'um animal'}.`:`${definition?.label||'O animal'} se defendeu e empurrou você.`,event.type==='player-evaded'?'chime':'thud');}
      }
    }
    const wildlifePhaseMs=performance.now()-wildlifePhaseStartedAt;
    const tickDurationMs=performance.now()-tickStartedAt;
    if(tickDurationMs>=100&&tickStartedAt-lastSlowTickDiagnosticAt>=10_000){
      lastSlowTickDiagnosticAt=tickStartedAt;
      const tickCpu=process.cpuUsage(tickCpuStart);
      process.stderr.write(JSON.stringify({type:'movement-server-tick-slow',at:new Date(now()).toISOString(),tickDurationMs:Math.round(tickDurationMs),processCpuMs:Math.round((tickCpu.user+tickCpu.system)/100)/10,serverLoopLagMs:pingLoopLag.read(),
        elapsedSincePreviousTickMs:Math.round(elapsedSincePreviousTickMs),budgetSteps:budget.steps,players:peers.size,
        movingPlayers:[...peers.values()].filter(player=>player.moving||player.commands.length).length,
        playerPhaseMs:Math.round(playerPhaseMs*10)/10,explorationPhaseMs:Math.round(explorationPhaseMs*10)/10,
        wildlifePhaseMs:Math.round(wildlifePhaseMs*10)/10,
        wildlifeStepCount,wildlifePopulationMax,
        wildlifeStepTotalMs:Math.round(wildlifeStepMs*10)/10,wildlifeStepMaxMs:Math.round(wildlifeStepMaxMs*10)/10,
        wildlifeActiveAnimals:wildlifeProfile.activeAnimals,wildlifeDecisions:wildlifeProfile.decisions,
        wildlifeBehaviorMs:Math.round(wildlifeProfile.behaviorMs*10)/10,wildlifeMovementMs:Math.round(wildlifeProfile.movementMs*10)/10,
        wildlifeCanOccupyCalls:wildlifeProfile.canOccupyCalls,wildlifeCanOccupyMs:Math.round(wildlifeProfile.canOccupyMs*10)/10,
        wildlifeOcclusionCalls:wildlifeProfile.isOccludedCalls,wildlifeOcclusionMs:Math.round(wildlifeProfile.isOccludedMs*10)/10,
        wildlifeFindWaterCalls:wildlifeProfile.findWaterCalls,wildlifeFindWaterMs:Math.round(wildlifeProfile.findWaterMs*10)/10,
        otherPhaseMs:Math.round(Math.max(0,tickDurationMs-playerPhaseMs-explorationPhaseMs-wildlifePhaseMs)*10)/10})+'\n');
    }
  }, tickIntervalMs);
  tick.unref();

  const locationCheckpointTimer = setInterval(() => {
    for (const player of peers.values()){
      void persistPlayerLocation(player);
      void persistPlayerDimensionPosition(player);
    }
  }, LOCATION_CHECKPOINT_MS);
  locationCheckpointTimer.unref();

  const coordinationTimer = setInterval(async () => {
    try {
      const lostSessions = await coordination.heartbeat();
      if (!lostSessions.size) return;
      for (const sessionId of lostSessions) {
        const socket = coordinatedSockets.get(sessionId);
        if (socket?.readyState === WebSocket.OPEN) {
          socket.close(1013, 'player presence lease lost');
        }
      }
    } catch (error) {
      // A missed Redis heartbeat is not an immediate lease loss. Keep healthy
      // game sockets open and retry; expired leases are closed when Redis
      // returns and the heartbeat script confirms they no longer belong here.
      process.stderr.write(`Player presence heartbeat unavailable; retrying: ${error.message}\n`);
    }
  }, Math.max(1_000, coordinationHeartbeatMs));
  coordinationTimer.unref();

  return {
    server: httpServer,
    async listen() {
      await Promise.all([storage.ready(), coordination.ready()]);
      if (storage.ensureGoods && storage.refreshQuotes) {
        await storage.ensureGoods();
        marketQuotes = await storage.refreshQuotes({ governmentId:marketGovernmentId });
        marketRefreshTimer = setInterval(() => {
          void storage.refreshQuotes({ governmentId:marketGovernmentId }).then(quotes => { marketQuotes = quotes; broadcast(false); })
            .catch(error => process.stderr.write(`Could not refresh market quotes: ${error.message}\n`));
        }, gameDaysToMs(1));
        marketRefreshTimer.unref?.();
      }
      if (storage.processDueLodgingLeases) {
        leaseRenewalTimer = setInterval(() => {
          void storage.processDueLodgingLeases({ now:new Date(now()) }).then(async changes => {
            for (const change of changes) {
              if(change.landlordProfileId)for(const landlord of peers.values())if(landlord.accountId===change.landlordProfileId){const wallet=await storage.getWallet(landlord.accountId);for(const key of CURRENCY_KEYS)landlord.inventory[key]=wallet[key]||0;}
              const player = [...peers.values()].find(entry => entry.accountId === change.profileId);
              if (!player) continue;
              player.lodgingClaim = await storage.findLodgingClaim(change.profileId);
              player.lodgingLease = await storage.getLodgingLease(change.profileId);
              await refreshPlayerLodgings(player);
              if (change.outcome === 'renewed') {
                const wallet=await storage.getWallet(player.accountId);
                for (const key of CURRENCY_KEYS) player.inventory[key] = wallet[key] || 0;
                notice(player.socket, `Sua diária foi renovada por ${formatCoins(change.rentBronze)}. O tesouro recebeu ${formatCoins(change.taxBronze)} de imposto.`, 'chime');
              } else {
                if (player.location === 'room' && player.roomKind === 'lodging' && player.roomKey === lodgingRoomKey({profileId:change.profileId,buildingId:change.buildingId,unitNumber:change.unitNumber,mode:'rent'})
                    && !walkOutOfRoom(player)) leaveCabin(player);
                notice(player.socket, change.outcome === 'payment_failed'
                  ? 'Não havia saldo para renovar o aluguel. Você foi levado à recepção.'
                  : 'Sua diária terminou. Você foi levado à recepção.', 'soft');
              }
            }
            if (changes.length) { await refreshCabinViews(); broadcast(); }
          }).catch(error => process.stderr.write(`Could not process lodging lease charges: ${error.message}\n`));
        }, 60_000);
        leaseRenewalTimer.unref?.();
      }
      if (storage.staffManagement?.activeSanctions && !sanctionEnforcementTimer) {
        sanctionEnforcementTimer = setInterval(async () => {
          const connected = [...peers.values()].filter(player => player.accountId);
          if (!connected.length) return;
          try {
            const sanctions = await storage.staffManagement.activeSanctions(connected.map(player => player.accountId));
            const byAccount = new Map();
            for (const sanction of sanctions) {
              if (!byAccount.has(sanction.target_account_id)) byAccount.set(sanction.target_account_id, []);
              byAccount.get(sanction.target_account_id).push(sanction);
            }
            for (const player of connected) {
              if (player.canStaffTravelDimensions && storage.staffManagement.authorization?.hasPermission) {
                try {
                  const canStillTravel = await staffAuthorization.hasPermission(player.accountId, 'dimensions.staff_travel');
                  if (!canStillTravel) { player.canStaffTravelDimensions = false; broadcast(false); }
                } catch {
                  player.canStaffTravelDimensions = false; broadcast(false);
                }
              }
              const current = byAccount.get(player.accountId) || [];
              const blocking = current.find(sanction => ['kick', 'suspend', 'ban'].includes(sanction.kind));
              if (blocking) {
                player.socket.close(4003, 'staff sanction');
                continue;
              }
              player.mutedUntil = current.reduce((until, sanction) => sanction.kind === 'mute'
                ? Math.max(until, sanction.expires_at ? new Date(sanction.expires_at).getTime() : Number.POSITIVE_INFINITY)
                : until, 0);
            }
          } catch (error) {
            const at = now();
            if (at - lastSanctionRefreshErrorAt >= 30_000) {
              lastSanctionRefreshErrorAt = at;
              process.stderr.write(`Could not refresh player sanctions: ${error.message}\n`);
            }
          }
        }, 2000);
        sanctionEnforcementTimer.unref?.();
      }
      await storage.ensureObjectCatalog();sceneObjectCatalog=await objectCache.load();applyObjectCatalog(sceneObjectCatalog);
      cabinOccupancy = (await storage.listLodgingClaims()).filter(claim => isCabin(claim.buildingId))
        .map(claim => ({ buildingId: claim.buildingId }));
      propertyListings = storage.getPropertyListings ? await storage.getPropertyListings() : [];
    propertyRentalListings = storage.getPropertyRentalListings ? await storage.getPropertyRentalListings() : [];
      let catalog = await storage.loadDimensions();
      let catalogDimensions = normalizeDimensions(catalog.dimensions);
      if (storage.backend === 'json') {
        const darkWorldIndex = catalogDimensions.findIndex(item => item.id === 'breu');
        const canonicalDarkWorld = DEFAULT_DIMENSIONS.find(item => item.id === 'breu');
        const storedDarkWorld = catalogDimensions[darkWorldIndex];
        if (storedDarkWorld && canonicalDarkWorld
            && (storedDarkWorld.spawn.x !== WORLD_CENTER.x || storedDarkWorld.spawn.y !== WORLD_CENTER.y
              || storedDarkWorld.campfire?.x !== WORLD_CENTER.x || storedDarkWorld.campfire?.y !== WORLD_CENTER.y)) {
          const corrected = catalogDimensions.map((item, index) => index === darkWorldIndex
            ? { ...item, spawn: { ...WORLD_CENTER }, campfire: { ...WORLD_CENTER } } : item);
          try { catalog = await storage.saveDimensions(corrected, catalog.revision); }
          catch (error) {
            if (error.status !== 409) throw error;
            catalog = await storage.loadDimensions();
          }
          catalogDimensions = normalizeDimensions(catalog.dimensions);
        }
      }
      dimensions = catalogDimensions.map(item => item.id === 'breu'
        ? { ...item, spawn: { ...WORLD_CENTER }, campfire: { ...WORLD_CENTER }, theme: 'dark' } : item);
      dimensionsRevision = catalog.revision;
      for (const dimension of dimensions) {
        let definition = normalizeWorldDefinition({ ...await storage.loadWorld(dimension.id), dimensionId: dimension.id, theme: dimension.theme });
        if (dimension.id === 'surface') definition = seedDimensionLayout(definition);
        else if (definition.revision === 0 && definition.edits.length === 0) {
          const seed = Number.parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) >>> 0;
          definition = initialWorldForDimension(dimension, seed);
          definition = { ...definition, revision: 1 };
        }
        if (isBareDarkDimension(dimension)) definition = await persistFlatDarkWorld(dimension, definition);
        if (dimension.id !== 'surface') definition = seedDimensionTerrain(definition, dimension);
        definition = migrateLegacyResourceCycles(definition);
        definition = migrateNaturalResourceSpawns(definition);
        const expectedRevision = (await storage.loadWorld(dimension.id)).revision;
        if (definition.revision !== expectedRevision) {
          const pendingDefinition = normalizeWorldDefinition({ ...definition, revision: expectedRevision + 1 });
          try { definition = await storage.saveWorld(pendingDefinition, expectedRevision, dimension.id); }
          catch (error) { if (error.status !== 409) throw error; definition = await storage.loadWorld(dimension.id); }
          definition = normalizeWorldDefinition({ ...definition, dimensionId: dimension.id, theme: dimension.theme });
        }
        worldDefinitions.set(dimension.id, definition);
        await loadCampfires(dimension.id);
      }
      activateWorld('surface');
      for (const dimension of dimensions) syncWorldTimers(dimension.id, worldFor(dimension.id));
      await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => { httpServer.removeListener('error', reject); resolve(); });
      });
      const synchronizeWorld=async()=>{
        try{
          const latestObjects=await objectCache.load();
          let objectsChanged=latestObjects.revision!==sceneObjectCatalog.revision;
          if(objectsChanged){
            const oldBuildings=new Map(VILLAGE_BUILDINGS.map(b=>[b.id,b]));
            applyObjectCatalog(latestObjects);sceneObjectCatalog=latestObjects;activeWorldRevision=-1;
            const claimsForNames=await storage.listLodgingClaims();
            for(const [roomKey,state]of roomStates){const detail=roomDetails(roomKey);if(detail.kind!=='legacy')state.name=roomDisplayName(roomKey,state.name,claimsForNames.find(c=>c.profileId===lodgingLocation(roomKey)?.profileId));}
            for(const player of peers.values()){
              if(player.location==='room'){
                if(player.roomBuildingId&&player.roomBuildingId!=='arrival'&&!villageBuildingById.has(player.roomBuildingId)){
                  const old=oldBuildings.get(player.roomBuildingId);player.location='clearing';player.dimensionId='surface';
                  player.position={...(old?.door||CLEARING_DOOR),y:(old?.door||CLEARING_DOOR).y+.7};player.roomKey=player.homeRoomKey;player.roomKind='legacy';player.roomBuildingId=null;player.roomLodgingMode=null;player.roomState=player.homeRoomState;player.roomFurniture=player.roomState.furniture;
                }else{
                  const layout=getRoomLayout(player.roomKind,player.roomBuildingId,player.roomLodgingMode);
                  if(!canOccupyRoom(player.position,PLAYER_RADIUS,player.roomFurniture,layout)){
                    const spawn=getRoomSpawnCandidates(layout).find(p=>canOccupyRoom(p,PLAYER_RADIUS,player.roomFurniture,layout));if(spawn)player.position={...spawn};
                  }
                }
              }
              if(player.location==='clearing'){activateWorld(player.dimensionId);if(!canOccupy(player.position,PLAYER_RADIUS)){const free=findNearbyPosition(player.position,[]);if(free)player.position=free;}}
              resetSceneMotion(player);
            }
          }
          const latestCatalog = await storage.loadDimensions();
          if (latestCatalog.revision > dimensionsRevision) {
            dimensions = normalizeDimensions(latestCatalog.dimensions);
            dimensionsRevision = latestCatalog.revision;
          }
          let changed = objectsChanged;
          for (const dimension of dimensions) {
            const latest = normalizeWorldDefinition({ ...await storage.loadWorld(dimension.id), dimensionId: dimension.id, theme: dimension.theme });
            if (latest.revision > (worldDefinitions.get(dimension.id)?.revision ?? -1)) {
              worldDefinitions.set(dimension.id, latest); changed = true;
              syncWorldTimers(dimension.id, latest);
            }
            if (!firesByDimension.has(dimension.id)) await loadCampfires(dimension.id);
          }
          if (changed) { activeWorldRevision = -1; broadcast(); }
        }catch(error){process.stderr.write(`Could not refresh shared world: ${error.message}\n`)}
      };
      worldSyncTimer=setInterval(()=>{if(!worldSyncRunning)worldSyncRunning=synchronizeWorld().finally(()=>{worldSyncRunning=null;});},Math.max(500,worldSyncIntervalMs));
      worldSyncTimer.unref();
      const lifecycleInterval = Math.max(50, Math.min(60_000, Number(campfireLifecycleIntervalMs) || 5_000));
      fireLifecycleTimer=setInterval(()=>{void pruneExpiredCampfires()},lifecycleInterval);
      fireLifecycleTimer.unref();
      return httpServer.address();
    },
    async close() {
      serverClosing = true;
      const closingPlayers = [...peers.values()];
      // Upgraded sockets can still be awaiting profile/world reads and have no
      // peer entry yet. Drain those too, before waiting on background writes.
      for (const socket of webSocketServer.clients) socket.terminate();
      for (const timer of dimensionTransitTimers.values()) clearTimeout(timer);
      dimensionTransitTimers.clear();
      activeDimensionTransits.clear();
      clearInterval(webSocketHeartbeatTimer);
      clearInterval(tick);
      pingLoopLag.close();
      clearInterval(snapshotTimer);
      clearInterval(locationCheckpointTimer);
      clearInterval(coordinationTimer);
      if (sanctionEnforcementTimer) clearInterval(sanctionEnforcementTimer);
      if (marketRefreshTimer) clearInterval(marketRefreshTimer);
      if (leaseRenewalTimer) clearInterval(leaseRenewalTimer);
      if (pendingBroadcast) clearImmediate(pendingBroadcast);
      pendingBroadcast = null;
      pendingBroadcastRefreshWorld = false;
      if(worldSyncTimer)clearInterval(worldSyncTimer);
      if(worldSyncRunning)await worldSyncRunning;
      if(fireLifecycleTimer)clearInterval(fireLifecycleTimer);
      for (const state of resourceStates.values()) {
        for (const scheduled of state.respawns.values()) clearTimeout(scheduled.timer);
        for (const timer of state.treeRespawns.values()) clearTimeout(timer);
      }
      resourceStates.clear();
      await Promise.allSettled([...campfireActionQueues.values()]);
      await Promise.allSettled([...firesByDimension.keys()].map(saveCampfires));
      for (const socket of new Set([...peers.keys(), ...coordinatedSockets.values()])) socket.terminate();
      await new Promise(resolve => webSocketServer.close(() => resolve()));
      await Promise.allSettled(closingPlayers.flatMap(player => [
        persistPlayerLocation(player, true),
        persistPlayerDimensionPosition(player, player.dimensionId, player.position, true),
      ]));
      await Promise.allSettled([...coordinationReleases]);
      await coordination.close();
      await objectCache.close();
      // A restart must not race outstanding atomic save writes.
      await Promise.allSettled([
        ...[...locationWriteStates.values()].map(state => state.promise),
        ...[...dimensionPositionWriteStates.values()].map(state=>state.promise),
        ...roomWrites.values(),
        ...progressWrites.values(),...[...mapExplorationWriteStates.values()].map(state=>state.promise).filter(Boolean),
        ...fireWrites.values(),
      ]);
      if (httpServer.listening) await new Promise(resolve => httpServer.close(() => resolve()));
      await storage.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await loadBackendConfig();
  const port = Number(process.env.PORT || 8099);
  const room = createPrototypeServer({ port, host: process.env.HOST || '127.0.0.1' });
  const address = await room.listen();
  process.stdout.write(`Clareira room listening on ${address.address}:${address.port}\n`);
  const stop = async () => { await room.close(); process.exit(0); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
