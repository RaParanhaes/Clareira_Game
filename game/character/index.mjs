// API pública do personagem em camadas (paper doll). Ligada ao jogo só pela flag ?avatar=paperdoll (paperdoll-runtime.mjs).
export {
  PAPERDOLL_ASSET_URL, PAPERDOLL_CELL, PAPERDOLL_FACINGS, PAPERDOLL_LAYOUT, PAPERDOLL_PIVOT,
  loadPaperdollManifest, paperdollAtlasUrl, paperdollCellOrigin, paperdollHandSocket,
  paperdollLayersFor, parsePaperdollManifest, validatePaperdollManifest,
} from './paperdoll-manifest.mjs';
export {
  PAPERDOLL_ACTIONS, PAPERDOLL_UNSUPPORTED_ACTIONS, paperdollDirection, selectPaperdollFrame,
} from './paperdoll-frames.mjs';
export { PAPERDOLL_CACHE_LIMITS, createPaperdollRenderer } from './paperdoll-renderer.mjs';
export {
  RECOLOR_CHANNELS, appearanceRecolorKey, buildMapping, isIdentityMapping, mappingKey, recolorRGBA,
} from './recolor.mjs';
export {
  PAPERDOLL_DEFAULT_PRELOAD, PAPERDOLL_FLAG_KEY, createPaperdollRuntime, isPaperdollEnabled,
  mapGameStateToPaperdollInput, readPaperdollFlag, tryDrawPaperdollAvatar,
} from './paperdoll-runtime.mjs';
