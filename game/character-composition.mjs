import { normalizeAppearance } from './appearance.mjs';
import { CHARACTER_BY_ID } from './character-catalog.mjs';

// The order is part of the art contract. Each facing/action frame is exported
// on the same 96x96 canvas and ground pivot before any layers are composited.
export const AVATAR_LAYER_ORDER = Object.freeze([
  'aura-back', 'back-item', 'body', 'full-avatar', 'outfit', 'hair-back', 'headwear',
  'eyes', 'hair-front', 'hand-item-back', 'hand-item-front', 'aura-front',
]);
export const AVATAR_COMPOSITION_SPEC = Object.freeze({
  schemaVersion: 1,
  canvas: Object.freeze({ width: 96, height: 96 }),
  pivot: Object.freeze({ x: 48, y: 84, anchor: 'sole-center' }),
  directions: 8,
  frameAlignment: 'same-facing-action-frame-index',
  pixelSampling: 'nearest-neighbor',
  layerOrder: AVATAR_LAYER_ORDER,
  depthMayVaryByFacingAndFrame: true,
});
const ACTION_EFFECTS = Object.freeze({ cast: 'effect.spellcast-blue', activate: 'effect.rift-activate' });
const COMPOSITION_CACHE_LIMIT = 96;
const compositionCache = new Map();
const immutableCompositions = new WeakMap();

const VISUAL_FIELDS = Object.freeze([
  ['body', 'bodyId'],
  ['body-shape', 'bodyShapeId'],
  ['outfit', 'outfitId'],
  ['hair', 'hairId'],
  ['eyes', 'eyesId'],
  ['headwear', 'headwearId'],
  ['equipment', 'mainHandId'],
  ['equipment', 'offHandId'],
  ['back-item', 'backItemId'],
  ['aura', 'auraId'],
]);

function isIntegrated(definition) {
  return definition.status === 'implemented' && ['integrated', 'none'].includes(definition.layer);
}

function actionFramesFor(definition, asset, bodyId) {
  return definition.actionFramesByBody?.[bodyId] || definition.actionFrames || {
    idle: {
      asset,
      layout: definition.frameLayout || definition.layout || 'direction-horizontal',
      frameCount: definition.frameCount || 1,
      frameDurationMs: definition.frameDurationMs || 100,
    },
  };
}

export function resolveCharacterComposition(value) {
  // Only our frozen normalized values qualify; mutable editor values are always revalidated.
  if (value && typeof value === 'object') {
    const known = immutableCompositions.get(value);
    if (known) return known;
  }
  const appearance = normalizeAppearance(value);
  const cacheKey = JSON.stringify(appearance);
  const cached = compositionCache.get(cacheKey);
  if (cached) {
    compositionCache.delete(cacheKey);
    compositionCache.set(cacheKey, cached);
    return cached;
  }
  const composition = buildCharacterComposition(appearance);
  freezeComposition(composition);
  immutableCompositions.set(composition.appearance, composition);
  compositionCache.set(cacheKey, composition);
  if (compositionCache.size > COMPOSITION_CACHE_LIMIT) {
    compositionCache.delete(compositionCache.keys().next().value);
  }
  return composition;
}

function freezeComposition(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeComposition(child);
  return Object.freeze(value);
}

function buildCharacterComposition(appearance) {
  const body = CHARACTER_BY_ID.get(appearance.bodyId);
  const outfit = CHARACTER_BY_ID.get(appearance.outfitId);
  const fullBodyAsset = outfit.fullBodyAsset === true;
  const bodyLayerIndex = AVATAR_LAYER_ORDER.indexOf('body');
  const outfitAsset = outfit.assetSetByBody?.[appearance.bodyId] || outfit.assetSet;
  const layers = fullBodyAsset ? [{
    slot: 'full-avatar',
    layerRole: 'full-avatar',
    order: AVATAR_LAYER_ORDER.indexOf('full-avatar'),
    id: outfit.id,
    asset: outfitAsset,
    layout: outfit.frameLayout || 'direction-horizontal',
    frameCount: outfit.frameCount || 1,
    actionFrames: actionFramesFor(outfit, outfitAsset, appearance.bodyId),
    motionBinding: 'gait',
    status: 'implemented',
  }] : [{
    slot: 'body', layerRole: 'body', order: bodyLayerIndex,
    id: body.id, asset: body.assetSet, layout: body.layout, frameCount: 1,
    actionFrames: actionFramesFor(body, body.assetSet, appearance.bodyId), motionBinding: 'gait', status: 'implemented',
  }];
  const missing = [];

  for (const [category, field] of VISUAL_FIELDS.slice(1)) {
    const definition = CHARACTER_BY_ID.get(appearance[field]);
    if (fullBodyAsset && (category === 'outfit' || outfit.bundledSlots?.includes(category))) continue;
    if (isIntegrated(definition)) continue;
    if (definition.status === 'planned' || !definition.assetSet) {
      missing.push({ slot: category, id: definition.id, reason: 'art-not-authored' });
      continue;
    }
    const layerRole = definition.renderLayer || definition.layer || category;
    const layerOrder = AVATAR_LAYER_ORDER.indexOf(layerRole);
    const asset = definition.assetSetByBody?.[appearance.bodyId] || definition.assetSet;
    layers.push({
      slot: category,
      layerRole,
      order: layerOrder < 0 ? bodyLayerIndex : layerOrder,
      id: definition.id,
      asset,
      layout: definition.frameLayout || 'direction-horizontal',
      frameCount: definition.frameCount || 1,
      frameDurationMs: definition.frameDurationMs || 100,
      actionFrames: actionFramesFor(definition, asset, appearance.bodyId),
      motionBinding: category === 'aura' ? 'independent' : 'gait',
      loop: definition.loop !== false,
      status: 'implemented',
    });
  }

  const profile = CHARACTER_BY_ID.get(appearance.animationProfileId);
  const bodyShape = CHARACTER_BY_ID.get(appearance.bodyShapeId);
  const mainHand = CHARACTER_BY_ID.get(appearance.mainHandId);
  const offHand = CHARACTER_BY_ID.get(appearance.offHandId);
  const compatibility = [];
  if (outfit.compatibleFitGroupIds && !outfit.compatibleFitGroupIds.includes(bodyShape.fitGroupId)) {
    compatibility.push({
      slot: 'outfitId',
      id: outfit.id,
      fitGroupId: bodyShape.fitGroupId,
      reason: 'outfit-body-fit-mismatch',
    });
  }
  if (offHand.grip === 'two-hand') {
    compatibility.push({ slot: 'offHandId', id: offHand.id, reason: 'two-handed-item-requires-main-hand' });
  }
  if (mainHand.grip === 'two-hand' && offHand.id !== 'equipment.none') {
    compatibility.push({ slot: 'offHandId', id: offHand.id, reason: 'main-hand-item-uses-both-hands' });
  }
  const motion = {
    profileId: profile.id,
    gaitProfileId: outfit.motionProfileId || profile.id,
    fitGroupId: bodyShape.fitGroupId,
    mainHandGrip: mainHand.grip || 'none',
    offHandGrip: offHand.grip || 'none',
    mainHandPoseProfileId: mainHand.motionProfileId || profile.id,
    offHandPoseProfileId: offHand.motionProfileId || profile.id,
  };

  layers.sort((left, right) => left.order - right.order);
  return {
    key: [
      appearance.bodyId,
      ...VISUAL_FIELDS.slice(1).map(([, field]) => appearance[field]),
      profile.id,
      `skin:${appearance.skin}`,
      `hair-color:${appearance.hair}`,
      `coat-color:${appearance.coat}`,
    ].join('|'),
    archetypeId: appearance.archetypeId,
    appearance,
    layers,
    missing,
    compatibility,
    motion,
    complete: missing.length === 0 && compatibility.length === 0,
  };
}

export function resolveCharacterAction(value, action) {
  const composition = resolveCharacterComposition(value);
  const { appearance } = composition;
  const appearanceProfile = CHARACTER_BY_ID.get(appearance.animationProfileId);
  const outfit = CHARACTER_BY_ID.get(appearance.outfitId);
  const heldItems = [appearance.mainHandId, appearance.offHandId]
    .map(id => CHARACTER_BY_ID.get(id))
    .filter(item => item.id !== 'equipment.none');
  const bodyPoseActions = ['wave', 'dance', 'sit-ground', 'sit-chair', 'crouch', 'crouch-walk', 'walk-wave'];
  const locomotionAction = ['idle', 'walk', 'run', 'jump'].includes(action);
  const bodyAction = locomotionAction || bodyPoseActions.includes(action);
  const unsupportedItem = locomotionAction
    ? heldItems.find(item => !item.actions?.includes(action))
    : null;

  if (composition.compatibility.length) {
    return {
      action,
      status: 'incompatible',
      profileId: appearanceProfile.id,
      reason: composition.compatibility[0].reason,
    };
  }

  if (unsupportedItem) {
    return {
      action,
      status: 'incompatible',
      profileId: appearanceProfile.id,
      itemId: unsupportedItem.id,
      reason: 'item-does-not-support-action',
    };
  }

  const actionItem = bodyAction
    ? null
    : heldItems.find(item => item.actions?.includes(action));
  if (!bodyAction && !actionItem) {
    return { action, status: 'unsupported', profileId: appearanceProfile.id, reason: 'action-needs-compatible-item' };
  }

  const profileChecks = locomotionAction
    ? [
        CHARACTER_BY_ID.get(outfit.motionProfileId || appearanceProfile.id),
        ...heldItems.map(item => CHARACTER_BY_ID.get(item.motionProfileId || appearanceProfile.id)),
      ]
    : bodyPoseActions.includes(action)
      ? [CHARACTER_BY_ID.get(outfit.motionProfileId || appearanceProfile.id)]
      : [CHARACTER_BY_ID.get(actionItem.motionProfileId || appearanceProfile.id)];
  const actionStatuses = profileChecks.map(profile => profile.actions?.[action]);
  const candidateEffect = CHARACTER_BY_ID.get(ACTION_EFFECTS[action]);
  const effectId = candidateEffect?.characters?.includes(appearance.archetypeId) ? candidateEffect.id : undefined;
  if (actionStatuses.some(status => !status)) {
    return {
      action,
      status: 'unsupported',
      profileId: profileChecks.find((profile, index) => !actionStatuses[index])?.id || appearanceProfile.id,
      reason: 'action-not-in-profile',
    };
  }
  const missingGaitFrameSet = bodyAction && composition.layers.find(layer =>
    layer.motionBinding === 'gait' && !layer.actionFrames?.[action],
  );
  if (actionStatuses.includes('planned') || !composition.complete || missingGaitFrameSet) {
    return {
      action,
      status: 'planned',
      profileId: profileChecks[0].id,
      gripProfileIds: profileChecks.slice(1).map(profile => profile.id),
      ...(effectId ? { effectId } : {}),
      reason: missingGaitFrameSet ? 'gait-frame-set-not-authored' : 'clip-or-layer-not-authored',
    };
  }
  if (action === 'idle') {
    return { action, status: 'implemented', profileId: profileChecks[0].id, clip: 'animation.avatar.idle' };
  }
  return {
    action,
    status: 'implemented',
    profileId: profileChecks[0].id,
    gripProfileIds: profileChecks.slice(1).map(profile => profile.id),
    ...(effectId ? { effectId } : {}),
  };
}
