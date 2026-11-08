// Stable visual IDs shared by saves, multiplayer messages and the renderer.
// A definition can be planned without exposing it in the game UI: only entries
// with reviewed runtime assets are currently drawable.
const define = (category, id, label, status, extra = {}) => ({
  id: `${category}.${id}`,
  category,
  label,
  status,
  refs: [],
  ...extra,
});

const BASE_DEFAULTS = Object.freeze({
  bodyId: 'body.male', bodyShapeId: 'body-shape.average', outfitId: 'outfit.white-base',
  hairId: 'hair.none', eyesId: 'eyes.none', headwearId: 'headwear.none',
  mainHandId: 'equipment.none', offHandId: 'equipment.none', backItemId: 'back-item.none',
  auraId: 'aura.none', animationProfileId: 'animation-profile.standard',
});
const COMMONER_ASSETS = Object.freeze({
  'body.male': 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/idle.png',
  'body.female': 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/female/idle.png',
});
const COMMONER_ACTION_FRAMES = Object.freeze({
  'body.male': {
    idle: { asset: COMMONER_ASSETS['body.male'], layout: 'direction-horizontal', frameCount: 1 },
    walk: {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/walk.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 100, distancePerCycle: 2.56,
    },
    run: {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/run.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 100, distancePerCycle: 1.8,
    },
    wave: {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/wave.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 110, loop: true,
    },
    dance: {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/dance.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 115, loop: true,
    },
    jump: {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/jump.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 110, loop: false,
    },
    'sit-ground': {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/sit-ground.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 120, loop: false,
    },
    'sit-chair': {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/sit-chair.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 120, loop: false,
    },
    crouch: {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/crouch.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 110, loop: false,
    },
    'crouch-walk': {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/crouch-walk.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 105, loop: true,
      distancePerCycle: 2.56,
    },
    'walk-wave': {
      asset: 'art/avatar-frames/character-layers-v1/atlases/outfits/commoner/male/walk-wave.png',
      layout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 100, loop: true,
      distancePerCycle: 2.56,
    },
  },
  'body.female': {
    idle: { asset: COMMONER_ASSETS['body.female'], layout: 'direction-horizontal', frameCount: 1 },
  },
});

export const CHARACTER_CATALOG = Object.freeze([
  define('body', 'male', 'Base masculina adulta', 'implemented', {
    assetSet: 'art/avatar-frames/neutral-body-v2/atlases/male/idle.png',
    layout: 'direction-horizontal',
  }),
  define('body', 'female', 'Base feminina adulta', 'implemented', {
    assetSet: 'art/avatar-frames/neutral-body-v2/atlases/female/idle.png',
    layout: 'direction-horizontal',
  }),

  define('fit-group', 'average', 'Ajuste médio', 'implemented'),
  define('fit-group', 'slim', 'Ajuste estreito', 'planned'),
  define('fit-group', 'broad', 'Ajuste largo', 'planned'),
  define('fit-group', 'heavy', 'Ajuste reforçado', 'planned'),
  define('fit-group', 'hunched', 'Ajuste para postura curvada', 'planned'),
  define('body-shape', 'average', 'Proporção média', 'implemented', {
    refs: ['fit-group.average'], fitGroupId: 'fit-group.average', source: 'body', layer: 'integrated',
  }),
  define('body-shape', 'slim', 'Proporção magra', 'planned', {
    refs: ['fit-group.slim'], fitGroupId: 'fit-group.slim', variation: 'silhouette',
  }),
  define('body-shape', 'broad', 'Proporção larga', 'planned', {
    refs: ['fit-group.broad'], fitGroupId: 'fit-group.broad', variation: 'silhouette',
  }),
  define('body-shape', 'heavy', 'Proporção pesada', 'planned', {
    refs: ['fit-group.heavy'], fitGroupId: 'fit-group.heavy', variation: 'silhouette',
  }),
  define('body-shape', 'hunched', 'Postura curvada', 'planned', {
    refs: ['fit-group.hunched'], fitGroupId: 'fit-group.hunched', variation: 'silhouette-and-pose',
  }),

  define('outfit', 'white-base', 'Viajante da Clareira', 'implemented', {
    refs: ['fit-group.average', 'animation-profile.standard'],
    source: 'character-layers-v1', layer: 'full-avatar', renderLayer: 'full-avatar',
    assetSet: COMMONER_ASSETS['body.male'], assetSetByBody: COMMONER_ASSETS,
    actionFramesByBody: COMMONER_ACTION_FRAMES, frameLayout: 'direction-horizontal', fullBodyAsset: true,
    bundledSlots: ['body-shape', 'hair', 'eyes', 'headwear', 'back-item'],
    motionProfileId: 'animation-profile.standard',
    compatibleFitGroupIds: ['fit-group.average'],
  }),
  define('outfit', 'commoner', 'Roupa de camponês', 'implemented', {
    refs: ['fit-group.average', 'animation-profile.standard'], layer: 'full-avatar', renderLayer: 'full-avatar',
    assetSet: COMMONER_ASSETS['body.male'],
    assetSetByBody: COMMONER_ASSETS,
    actionFramesByBody: COMMONER_ACTION_FRAMES,
    frameLayout: 'direction-horizontal', fullBodyAsset: true,
    bundledSlots: ['body-shape', 'hair', 'eyes', 'headwear', 'back-item'],
    motionProfileId: 'animation-profile.standard', compatibleFitGroupIds: ['fit-group.average'],
  }),
  define('outfit', 'mage-robe', 'Túnica de mago', 'implemented', {
    refs: ['fit-group.average', 'fit-group.slim', 'fit-group.hunched', 'animation-profile.spellcaster'],
    layer: 'full-avatar', renderLayer: 'full-avatar',
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/outfits/mage-robe/male/idle.png',
    assetSetByBody: {
      'body.male': 'art/avatar-frames/character-layers-v1/atlases/outfits/mage-robe/male/idle.png',
      'body.female': 'art/avatar-frames/character-layers-v1/atlases/outfits/mage-robe/female/idle.png',
    },
    frameLayout: 'direction-horizontal', fullBodyAsset: true,
    bundledSlots: ['body-shape', 'hair', 'eyes', 'headwear', 'back-item'],
    motionProfileId: 'animation-profile.spellcaster',
    compatibleFitGroupIds: ['fit-group.average', 'fit-group.slim', 'fit-group.hunched'],
  }),
  define('outfit', 'dimension-coat', 'Casaco de viajante dimensional', 'implemented', {
    refs: ['fit-group.average', 'fit-group.slim', 'fit-group.broad', 'fit-group.heavy', 'fit-group.hunched', 'animation-profile.nimble'],
    layer: 'full-avatar', renderLayer: 'full-avatar',
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/outfits/dimension-coat/male/idle.png',
    assetSetByBody: {
      'body.male': 'art/avatar-frames/character-layers-v1/atlases/outfits/dimension-coat/male/idle.png',
      'body.female': 'art/avatar-frames/character-layers-v1/atlases/outfits/dimension-coat/female/idle.png',
    },
    frameLayout: 'direction-horizontal', fullBodyAsset: true,
    bundledSlots: ['body-shape', 'hair', 'eyes', 'headwear', 'back-item'],
    motionProfileId: 'animation-profile.nimble',
    compatibleFitGroupIds: ['fit-group.average', 'fit-group.slim', 'fit-group.broad', 'fit-group.heavy', 'fit-group.hunched'],
  }),
  define('outfit', 'dark-armor', 'Armadura de cavaleiro das trevas', 'implemented', {
    refs: ['fit-group.broad', 'animation-profile.heavy'], layer: 'full-avatar', renderLayer: 'full-avatar',
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/outfits/dark-armor/male/idle.png',
    assetSetByBody: {
      'body.male': 'art/avatar-frames/character-layers-v1/atlases/outfits/dark-armor/male/idle.png',
      'body.female': 'art/avatar-frames/character-layers-v1/atlases/outfits/dark-armor/female/idle.png',
    },
    frameLayout: 'direction-horizontal', fullBodyAsset: true,
    bundledSlots: ['body-shape', 'hair', 'eyes', 'headwear', 'back-item'],
    motionProfileId: 'animation-profile.heavy',
    compatibleFitGroupIds: ['fit-group.broad'],
  }),
  define('outfit', 'light-armor', 'Armadura de cavaleiro da luz', 'implemented', {
    refs: ['fit-group.broad', 'animation-profile.trained'], layer: 'full-avatar', renderLayer: 'full-avatar',
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/outfits/light-armor/male/idle.png',
    assetSetByBody: {
      'body.male': 'art/avatar-frames/character-layers-v1/atlases/outfits/light-armor/male/idle.png',
      'body.female': 'art/avatar-frames/character-layers-v1/atlases/outfits/light-armor/female/idle.png',
    },
    frameLayout: 'direction-horizontal', fullBodyAsset: true,
    bundledSlots: ['body-shape', 'hair', 'eyes', 'headwear', 'back-item'],
    motionProfileId: 'animation-profile.trained',
    compatibleFitGroupIds: ['fit-group.broad'],
  }),

  define('hair', 'none', 'Sem cabelo', 'implemented', { layer: 'integrated' }),
  ...[
    ['short', 'Cabelo curto'], ['long', 'Cabelo comprido'], ['curly', 'Cabelo cacheado'],
    ['shaved', 'Cabelo raspado'], ['hooded', 'Cabelo coberto'],
  ].map(([id, label]) => define('hair', id, label, 'planned', { layer: 'hair' })),

  define('eyes', 'none', 'Sem detalhes nos olhos', 'implemented', { layer: 'integrated' }),
  ...[
    ['brown', 'Olhos castanhos'], ['blue', 'Olhos azuis'], ['red', 'Olhos vermelhos'],
    ['rift', 'Olhos dimensionais'], ['radiant', 'Olhos luminosos'],
  ].map(([id, label]) => define('eyes', id, label, 'planned', { layer: 'face-detail' })),

  define('headwear', 'none', 'Sem cobertura de cabeça', 'implemented', { layer: 'integrated' }),
  ...[
    ['farm-cap', 'Chapéu de camponês'], ['mage-hood', 'Capuz de mago'],
    ['knight-helm', 'Elmo de cavaleiro'], ['dimension-visor', 'Visor dimensional'],
  ].map(([id, label]) => define('headwear', id, label, 'planned', { layer: 'headwear' })),

  define('equipment', 'none', 'Mãos vazias', 'implemented', { slot: 'main-or-off-hand', grip: 'none', actions: ['idle'], layer: 'none' }),
  ...[
    ['axe', 'Machado', 'two-hand', ['idle', 'walk', 'chop'], 'animation-profile.heavy'],
    ['sword', 'Espada', 'one-hand', ['idle', 'walk', 'slash'], 'animation-profile.trained'],
    ['knife', 'Faca', 'one-hand', ['idle', 'walk', 'stab'], 'animation-profile.nimble'],
    ['lantern', 'Luminária', 'one-hand', ['idle', 'walk', 'carry'], 'animation-profile.lantern-carry'],
    ['branch', 'Galho', 'one-hand', ['idle', 'walk', 'carry'], 'animation-profile.standard'],
    ['staff', 'Cajado', 'two-hand', ['idle', 'walk', 'cast'], 'animation-profile.spellcaster'],
    ['dimensional-device', 'Dispositivo dimensional', 'one-hand', ['idle', 'walk', 'activate'], 'animation-profile.nimble'],
    ['dark-sword', 'Espada das trevas', 'one-hand', ['idle', 'walk', 'slash'], 'animation-profile.heavy'],
    ['light-sword', 'Espada luminosa', 'one-hand', ['idle', 'walk', 'slash'], 'animation-profile.trained'],
  ].map(([id, label, grip, actions, motionProfileId]) => define('equipment', id, label, 'implemented', {
    slot: 'hand', grip, actions, motionProfileId, layer: 'hand-item-front', renderLayer: 'hand-item-front',
    assetSet: `art/avatar-frames/character-layers-v1/atlases/equipment/${id}.png`,
    frameLayout: 'direction-horizontal', frameCount: 1, socketProfileId: 'avatar-sockets.v1.main-hand',
  })),

  define('back-item', 'none', 'Sem item nas costas', 'implemented', { layer: 'integrated' }),
  ...[
    ['dimension-cape', 'Capa dimensional'], ['dark-cape', 'Capa das trevas'], ['light-cape', 'Capa luminosa'],
  ].map(([id, label]) => define('back-item', id, label, 'planned', { layer: 'behind-body' })),

  define('aura', 'none', 'Sem aura', 'implemented', { layer: 'none' }),
  define('aura', 'void', 'Aura maligna', 'implemented', {
    layer: 'aura-back', renderLayer: 'aura-back',
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/effects/aura-void.png',
    frameLayout: 'frames-horizontal', frameCount: 8, frameDurationMs: 90, loop: true,
    motionProfileId: 'animation-profile.heavy',
  }),
  define('aura', 'radiance', 'Aura reluzente', 'implemented', {
    layer: 'aura-back', renderLayer: 'aura-back',
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/effects/aura-radiance.png',
    frameLayout: 'frames-horizontal', frameCount: 8, frameDurationMs: 90, loop: true,
    motionProfileId: 'animation-profile.trained',
  }),
  define('aura', 'flow', 'Energia percorrendo o corpo', 'implemented', {
    layer: 'aura-front', renderLayer: 'aura-front',
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/effects/aura-flow.png',
    frameLayout: 'direction-rows-frames-horizontal', frameCount: 8, frameDurationMs: 110, loop: true,
    motionProfileId: 'animation-profile.standard',
  }),

  define('effect', 'spellcast-blue', 'Selo azul de conjuração', 'implemented', {
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/effects/spellcast-blue.png',
    frameLayout: 'frames-horizontal', frameCount: 8, frameDurationMs: 90, loop: false,
    trigger: 'cast', renderLayer: 'hand-item-front', characters: ['character.mage'],
  }),
  define('effect', 'rift-activate', 'Pulso de ativação dimensional', 'implemented', {
    assetSet: 'art/avatar-frames/character-layers-v1/atlases/effects/rift-activate.png',
    frameLayout: 'frames-horizontal', frameCount: 8, frameDurationMs: 90, loop: false,
    trigger: 'activate', renderLayer: 'hand-item-front', characters: ['character.dimensional-traveler'],
  }),

  define('animation-profile', 'standard', 'Movimento padrão', 'implemented', {
    actions: {
      idle: 'implemented', walk: 'implemented', run: 'implemented', jump: 'implemented',
      wave: 'implemented', dance: 'implemented', 'walk-wave': 'implemented',
      'sit-ground': 'implemented', 'sit-chair': 'implemented', crouch: 'implemented',
      'crouch-walk': 'implemented', carry: 'planned',
    },
  }),
  ...[
    ['careful', 'Movimento cuidadoso', { idle: 'planned', walk: 'planned', cast: 'planned' }],
    ['nimble', 'Movimento ágil', { idle: 'implemented', walk: 'planned', run: 'planned', slash: 'planned', stab: 'planned', activate: 'planned' }],
    ['heavy', 'Movimento pesado', { idle: 'implemented', walk: 'planned', chop: 'planned', slash: 'planned' }],
    ['trained', 'Movimento treinado', { idle: 'implemented', walk: 'planned', slash: 'planned' }],
    ['spellcaster', 'Gestos de conjuração', { idle: 'implemented', walk: 'planned', cast: 'planned' }],
    ['lantern-carry', 'Movimento com luminária', { idle: 'implemented', walk: 'planned', carry: 'planned' }],
  ].map(([id, label, actions]) => define('animation-profile', id, label, 'planned', {
    actions,
  })),

  define('character', 'base', 'Personagem-base', 'implemented', {
    defaults: BASE_DEFAULTS,
  }),
  ...[
    {
      id: 'peasant', label: 'Camponês', defaults: {
        outfitId: 'outfit.commoner', hairId: 'hair.short', headwearId: 'headwear.farm-cap',
      },
    },
    {
      id: 'mage', label: 'Mago', defaults: {
        outfitId: 'outfit.mage-robe', hairId: 'hair.long', eyesId: 'eyes.blue', headwearId: 'headwear.mage-hood',
        mainHandId: 'equipment.staff', animationProfileId: 'animation-profile.spellcaster',
      },
    },
    {
      id: 'dimensional-traveler', label: 'Viajante dimensional', defaults: {
        outfitId: 'outfit.dimension-coat', eyesId: 'eyes.rift', headwearId: 'headwear.dimension-visor',
        mainHandId: 'equipment.dimensional-device', backItemId: 'back-item.dimension-cape',
        animationProfileId: 'animation-profile.nimble',
      },
    },
    {
      id: 'dark-knight', label: 'Cavaleiro das trevas', defaults: {
        bodyShapeId: 'body-shape.broad', outfitId: 'outfit.dark-armor', eyesId: 'eyes.red', headwearId: 'headwear.knight-helm',
        mainHandId: 'equipment.dark-sword', backItemId: 'back-item.dark-cape', auraId: 'aura.void',
        animationProfileId: 'animation-profile.heavy',
      },
    },
    {
      id: 'light-knight', label: 'Cavaleiro da luz', defaults: {
        bodyShapeId: 'body-shape.broad', outfitId: 'outfit.light-armor', eyesId: 'eyes.radiant', headwearId: 'headwear.knight-helm',
        mainHandId: 'equipment.light-sword', backItemId: 'back-item.light-cape', auraId: 'aura.radiance',
        animationProfileId: 'animation-profile.trained',
      },
    },
  ].map(({ id, label, defaults }) => define('character', id, label, 'planned', {
    defaults: { ...BASE_DEFAULTS, ...defaults },
  })),
]);

export const CHARACTER_BY_ID = new Map(CHARACTER_CATALOG.map(entry => [entry.id, entry]));
export const CHARACTER_CATEGORIES = Object.freeze([...new Set(CHARACTER_CATALOG.map(entry => entry.category))]);

export function characterDefinition(id) {
  return CHARACTER_BY_ID.get(id);
}

