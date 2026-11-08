import { normalizeAppearance } from './appearance.mjs';
import { applyAvatarSurfaceLight } from './avatar-surface-light.mjs';
import { resolveCharacterAction, resolveCharacterComposition } from './character-composition.mjs';

export const AVATAR_SPRITE_WORLD_SCALE = .52;
export const AVATAR_SPRITE_SPEC = Object.freeze({
  version: 2,
  cell: Object.freeze({ width: 96, height: 96 }),
  pivot: Object.freeze([48, 84]),
  facings: Object.freeze(['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest']),
  actions: Object.freeze({
    idle: 1, walk: 8, run: 8, wave: 8, dance: 8, jump: 8,
    'sit-ground': 8, 'sit-chair': 8, crouch: 8, 'crouch-walk': 8, 'walk-wave': 8,
  }),
  baseHeight: 80,
});

const IMAGE_CACHE_LIMIT = 12;
const imageCache = new Map();
const listeners = new Set();
const failedLoads = new Map();
const reportedFailures = new Set();

export function getAvatarSpriteVariant(appearance) {
  return resolveCharacterComposition(appearance).key;
}

export function getAvatarSpriteURLs(appearance, action = 'idle') {
  const composition = resolveCharacterComposition(appearance);
  return composition.layers.map(layer => {
    const frameSet = frameSetForLayer(layer, action);
    return new URL(`./${frameSet.asset}`, import.meta.url).href;
  });
}

export function getAvatarComposition(appearance) {
  return resolveCharacterComposition(appearance);
}

export function setAvatarSpritesReadyListener(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function preloadAvatarSprites(appearance, { onProgress } = {}) {
  const actions = ['idle', ...['walk', 'run'].filter(action =>
    resolveCharacterAction(appearance, action).status === 'implemented')];
  return Promise.all(actions.map(async action => {
    const images = await loadSpriteGroup(appearance, action);
    onProgress?.({ action, complete: true });
    return images;
  }));
}

const BACKGROUND_ANIMATION_ACTIONS = Object.freeze([
  'jump', 'wave', 'dance', 'sit-ground', 'sit-chair', 'crouch', 'crouch-walk', 'walk-wave',
]);

// Optional emotes and poses are warmed after the first frame so they never
// delay entry into the world. Unsupported actions stay on their existing fallback.
export async function preloadAvatarAnimationActions(appearance, { onProgress } = {}) {
  const actions = BACKGROUND_ANIMATION_ACTIONS.filter(action =>
    resolveCharacterAction(appearance, action).status === 'implemented');
  for (const action of actions) {
    let loaded = false;
    try {
      await loadSpriteGroup(appearance, action);
      loaded = true;
    } catch {}
    onProgress?.({ action, complete: true, loaded });
  }
  return actions;
}

// The idle pose is enough to draw the first scene. Movement sheets warm up
// concurrently without keeping the player behind the loading screen.
export function preloadAvatarIdle(appearance) {
  return loadSpriteGroup(appearance, 'idle');
}

export function selectAvatarFrame({
  appearance,
  facing = 'south',
  phase = 0,
  travelDistance = 0,
  moving = false,
  running = false,
  crouching = false,
  pose = {},
  position = {},
  player = {},
  motionState = {},
  time = 0,
  now,
  reducedMotion = false,
} = {}) {
  const direction = AVATAR_SPRITE_SPEC.facings.indexOf(facing);
  const clock = Number.isFinite(now) ? now : Math.max(0, finite(time)) * 1000;
  const composition = resolveCharacterComposition(appearance);
  const hasAction = action => composition.layers.some(layer => layer.actionFrames?.[action]);
  const z = finite(position?.z ?? player?.z);
  const vz = finite(position?.vz ?? player?.vz);
  const grounded = z <= .02;
  const sitting = Boolean(pose?.sitting || finite(pose?.sit) > .85);
  const hasMovement = moving || finite(travelDistance) > .001;
  const hasOtherPose = Boolean(sitting || pose?.symbol || pose?.gesture);
  const waving = pose?.gesture === 'wave';
  const dancing = pose?.gesture === 'dance';
  const chairSeat = [pose?.sitStyle, player?.sitStyle, player?.seatType, player?.sittingStyle]
    .some(value => value === 'chair' || value === 'sit-chair');
  const canWalk = resolveCharacterAction(appearance, 'walk').status === 'implemented';
  const canRun = resolveCharacterAction(appearance, 'run').status === 'implemented';
  const canCrouchWalk = resolveCharacterAction(appearance, 'crouch-walk').status === 'implemented';
  const airborne = !grounded || motionState?.target === 'jump'
    || ['jump-takeoff', 'jump-land'].includes(motionState?.transition);
  const jumping = airborne && hasAction('jump');
  const crouchMoving = canCrouchWalk && !reducedMotion && hasMovement && !running && crouching && grounded;
  const runningCycle = canRun && !reducedMotion && running && hasMovement && !crouching && grounded && !hasOtherPose;
  const walking = canWalk && !reducedMotion && hasMovement
    && !running && !crouching && grounded && !hasOtherPose;
  const cyclePhase = ((finite(phase) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const waveElapsed = Number.isFinite(Number(player?.emoteUntil))
    ? Math.max(0, 1900 - Math.max(0, Number(player.emoteUntil) - clock))
    : Math.max(0, clock);
  const waveFrame = reducedMotion ? 0 : waveElapsed >= 1760 ? 7 : Math.floor(waveElapsed / 110) % 8;
  const transition = motionState?.transition;
  const transitionProgress = Math.max(0, Math.min(1, finite(motionState?.transitionProgress)));
  const sitAction = chairSeat ? 'sit-chair' : 'sit-ground';
  let action = 'idle';
  if (jumping) action = waving && hasAction('jump-wave') ? 'jump-wave' : 'jump';
  else if (sitting && hasAction(sitAction)) action = waving && hasAction(`${sitAction}-wave`) ? `${sitAction}-wave` : sitAction;
  else if (crouching && hasAction('crouch')) action = crouchMoving && hasAction('crouch-walk') ? 'crouch-walk' : 'crouch';
  else if (dancing && hasAction('dance')) action = 'dance';
  else if (waving && hasMovement && running && canRun) action = 'run';
  else if (waving && hasMovement && !running && hasAction('walk-wave')) action = 'walk-wave';
  else if (waving && hasAction('wave')) action = 'wave';
  else if (runningCycle) action = 'run';
  else if (walking) action = 'walk';

  let frame = 0;
  if (action === 'walk' || action === 'run' || action === 'walk-wave' || action === 'crouch-walk') {
    frame = Math.floor(cyclePhase / (Math.PI * 2) * 8 + 1e-9) % 8;
  } else if (action === 'wave') {
    frame = waveFrame;
  } else if (action === 'dance') {
    frame = reducedMotion ? 0 : Math.floor(waveElapsed / 115) % 8;
  } else if (action === 'jump' || action === 'jump-wave') {
    const apex = 5.4 * 5.4 / (2 * 14);
    const heightProgress = Math.max(0, Math.min(1, z / apex));
    if (transition === 'jump-takeoff') frame = Math.min(2, Math.floor(transitionProgress * 3));
    else if (transition === 'jump-land') frame = 5 + Math.min(2, Math.floor(transitionProgress * 3));
    else if (vz > 0) frame = 2 + Math.round(heightProgress * 2);
    else frame = 4 + Math.round((1 - heightProgress) * 2);
  } else if (action.startsWith('sit-')) {
    if (transition === 'sit-down') frame = Math.min(3, Math.floor(transitionProgress * 4));
    else if (transition === 'stand-up') frame = 3 - Math.min(3, Math.floor(transitionProgress * 4));
    else frame = 4;
  } else if (action === 'crouch') {
    if (transition === 'crouch-down') frame = Math.min(3, Math.floor(transitionProgress * 4));
    else if (transition === 'crouch-up') frame = 3 - Math.min(3, Math.floor(transitionProgress * 4));
    else frame = 4;
  }
  return {
    action, group: action,
    direction: Math.max(0, direction), frame,
    nowMs: reducedMotion ? 0 : clock, reducedMotion, mirror: false,
  };
}

let litSpriteSurface;
export function drawAvatarSprite(context, x, y, selected, appearance, { scale = 1, layerRoles = null, smooth = false, surfaceLight = null } = {}) {
  if (!context || !selected || !Object.hasOwn(AVATAR_SPRITE_SPEC.actions, selected.action)) return false;
  const composition = resolveCharacterComposition(appearance);
  const pngOnlyAvatar = ['outfit.commoner', 'outfit.white-base'].includes(composition.appearance.outfitId);
  let action = selected.action;
  let images = peekSpriteGroup(composition, action);
  if (!images || images.length !== composition.layers.length) {
    const failureKey = spriteCacheKey(composition, action);
    const failure = failedLoads.get(failureKey);
    if (!failure || failure.retryAt <= Date.now()) {
      void loadSpriteGroup(appearance, action).catch(error => {
        if (reportedFailures.has(failureKey)) return;
        reportedFailures.add(failureKey);
        console.error('Falha ao carregar os PNGs da aparência do personagem', error);
      });
    }
    // The peasant stays on the authored PNG base while an action sheet loads.
    // Other outfits retain their existing Canvas animation fallback.
    if (!pngOnlyAvatar || action === 'idle') return false;
    action = 'idle';
    images = peekSpriteGroup(composition, action);
    if (!images || images.length !== composition.layers.length) return false;
  }

  const { width, height } = AVATAR_SPRITE_SPEC.cell;
  if(surfaceLight&&!litSpriteSurface&&globalThis.document){litSpriteSurface=document.createElement('canvas');litSpriteSurface.width=width;litSpriteSurface.height=height;}
  const lightCanvas=surfaceLight?litSpriteSurface:null;
  const target=lightCanvas?lightCanvas.getContext('2d'):context;
  if(lightCanvas){target.setTransform(1,0,0,1,0,0);target.clearRect(0,0,width,height);target.globalCompositeOperation='source-over';target.globalAlpha=1;target.imageSmoothingEnabled=false;}
  const direction = Math.max(0, Math.min(AVATAR_SPRITE_SPEC.facings.length - 1, Math.floor(Number(selected.direction) || 0)));
  context.save();
  context.imageSmoothingEnabled = smooth;
  if(smooth)context.imageSmoothingQuality='high';
  context.translate(Math.round(x), Math.round(y));
  context.scale(scale, scale);
  composition.layers.forEach((layer, index) => {
    if (layerRoles && !layerRoles.includes(layer.layerRole)) return;
    const image = images[index];
    const frameSet = frameSetForLayer(layer, action);
    const count = Math.max(1, Number(frameSet.frameCount) || 1);
    const frame = frameSet.layout === 'frames-horizontal'
      ? (selected.reducedMotion ? 0 : Math.floor(Math.max(0, finite(selected.nowMs)) / Math.max(1, finite(frameSet.frameDurationMs) || 100)) % count)
      : Math.max(0, Math.min(count - 1, Number(selected.frame) || 0));
    const sx = frameSet.layout === 'direction-rows-frames-horizontal'
      ? frame * width
      : (frameSet.layout === 'frames-horizontal' ? frame : direction * count + frame) * width;
    const sy = frameSet.layout === 'direction-rows-frames-horizontal' ? direction * height : 0;
    target.drawImage(
      image,
      sx,
      sy,
      width,
      height,
      lightCanvas?0:-AVATAR_SPRITE_SPEC.pivot[0],
      lightCanvas?0:-AVATAR_SPRITE_SPEC.pivot[1],
      width,
      height,
    );
  });
  if(lightCanvas){
    applyAvatarSurfaceLight(target,width,height,surfaceLight);
    context.drawImage(lightCanvas,-AVATAR_SPRITE_SPEC.pivot[0],-AVATAR_SPRITE_SPEC.pivot[1]);
  }
  context.restore();
  return true;
}

export function advanceAvatarSpritePhase(phase, distance, reducedMotion = false, distancePerCycle = 1.4) {
  const current = finite(phase), traveled = Math.max(0, finite(distance));
  return reducedMotion ? current : current + traveled * Math.PI * 2 / Math.max(.01, finite(distancePerCycle) || 1.4);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function frameSetForLayer(layer, action) {
  return layer.actionFrames?.[action]
    || layer.actionFrames?.idle
    || { asset: layer.asset, layout: layer.layout || 'direction-horizontal', frameCount: layer.frameCount || 1, frameDurationMs: layer.frameDurationMs || 100 };
}

const spriteKeys = new WeakMap();
function spriteCacheKey(composition, action) {
  // Colors and character IDs do not change the decoded PNG pixels.
  // Keep one group per ordered asset list, shared by all matching appearances.
  let keys = spriteKeys.get(composition);
  if (!keys) { keys = new Map(); spriteKeys.set(composition, keys); }
  if (!keys.has(action)) keys.set(action, JSON.stringify(composition.layers.map(layer => frameSetForLayer(layer, action).asset)));
  return keys.get(action);
}

function peekSpriteGroup(composition, action) {
  const key = spriteCacheKey(composition, action);
  const entry = imageCache.get(key);
  if (!entry?.images?.length || entry.images.some(image => !image.complete || image.naturalWidth === 0)) return null;
  imageCache.delete(key);
  imageCache.set(key, entry);
  return entry.images;
}

function loadSpriteGroup(appearance, action = 'idle') {
  const composition = resolveCharacterComposition(appearance);
  const variant = composition.key;
  const key = spriteCacheKey(composition, action);
  if (imageCache.has(key)) {
    const entry = imageCache.get(key);
    imageCache.delete(key);
    imageCache.set(key, entry);
    return entry.promise;
  }
  const failure = failedLoads.get(key);
  if (failure && failure.retryAt > Date.now()) return Promise.reject(failure.error);
  failedLoads.delete(key);
  const entry = { images: null, promise: null };
  const promise = Promise.all(getAvatarSpriteURLs(appearance, action).map(loadImage))
    .then(images => {
      entry.images = images;
      failedLoads.delete(key);
      reportedFailures.delete(key);
      trimImageCache();
      for (const listener of listeners) listener({ variant, group: action });
      return images;
    })
    .catch(error => {
      if (imageCache.get(key) === entry) imageCache.delete(key);
      failedLoads.set(key, { error, retryAt: Date.now() + 5000 });
      throw error;
    });
  entry.promise = promise;
  imageCache.set(key, entry);
  trimImageCache(key);
  return promise;
}

function loadImage(url) {
  const image = new Image();
  image.decoding = 'async';
  return new Promise((resolve, reject) => {
    image.addEventListener('load', async () => {
      try {
        await image.decode();
        resolve(image);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    image.addEventListener('error', () => reject(new Error(`Não foi possível carregar ${url}`)), { once: true });
    image.src = url;
  });
}

function trimImageCache(protectKey = '') {
  if (imageCache.size <= IMAGE_CACHE_LIMIT) return;
  for (const [key, entry] of imageCache) {
    if (imageCache.size <= IMAGE_CACHE_LIMIT) break;
    if (key === protectKey || !entry.images?.every(image => image.complete && image.naturalWidth > 0)) continue;
    imageCache.delete(key);
  }
}
