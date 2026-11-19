// Ponte entre o jogo e o personagem em camadas (paper doll).
// Atrás de uma flag: `?avatar=paperdoll` (ou localStorage['clareira.avatar']==='paperdoll') liga;
// `?avatar=classic` desliga. Sem a flag, nada aqui carrega nem desenha, e o jogo usa o desenho antigo.
// `tryDrawPaperdollAvatar` devolve false sempre que o chamador deve usar o desenho antigo
// (flag desligada, manifest ainda carregando ou falho, ação sem arte, atlas ainda decodificando).
import { PAPERDOLL_ASSET_URL, loadPaperdollManifest } from './paperdoll-manifest.mjs';
import { selectPaperdollFrame } from './paperdoll-frames.mjs';
import { createPaperdollRenderer } from './paperdoll-renderer.mjs';

export const PAPERDOLL_FLAG_KEY = 'clareira.avatar';
export const PAPERDOLL_FLAG_VALUE = 'paperdoll';
// Só as animações que o jogo usa hoje; `golpear` fica fora até existir estado de ferramenta no jogo.
// Só o traje camponês tem arte em camadas; armadura, manto etc. caem no desenho antigo.
export const PAPERDOLL_OUTFIT_IDS = Object.freeze(['outfit.commoner', 'outfit.white-base']);
export const PAPERDOLL_MANIFEST_RETRY_MS = 5000;

/** Aparência sem outfitId usa o alias legado `outfit` ('white-base'); sem nenhum dos dois vale o padrão (camponês). */
export function isPaperdollOutfit(appearance) {
  if (!appearance) return false;
  const id = typeof appearance.outfitId === 'string' ? appearance.outfitId
    : typeof appearance.outfit === 'string' ? `outfit.${appearance.outfit}` : 'outfit.white-base';
  return PAPERDOLL_OUTFIT_IDS.includes(id);
}

export const PAPERDOLL_DEFAULT_PRELOAD = Object.freeze(['parado', 'andar']);

/** URL (?avatar=) vence o armazenamento; valor desconhecido na URL não liga nada. */
export function readPaperdollFlag({ search = '', storage = null } = {}) {
  let fromUrl = null;
  try { fromUrl = new URLSearchParams(search).get('avatar'); } catch { fromUrl = null; }
  if (fromUrl === PAPERDOLL_FLAG_VALUE) return true;
  if (fromUrl === 'classic') return false;
  try { return storage?.getItem?.(PAPERDOLL_FLAG_KEY) === PAPERDOLL_FLAG_VALUE; } catch { return false; }
}

/**
 * Estado do jogo -> entrada de selectPaperdollFrame.
 * info: { action, facing, phase, moving, running, reducedMotion, nowMs, tool: { action, progress, elapsedMs } }
 * `action` é a do jogo (idle, walk, run, sit-ground, ...); ação sem arte cai no desenho antigo.
 * `tool.action` ('chop' | 'use-tool') tem prioridade: é o golpe de ferramenta em andamento.
 */
export function mapGameStateToPaperdollInput(info = {}) {
  const tool = info.tool && (info.tool.action === 'chop' || info.tool.action === 'use-tool') ? info.tool : null;
  const action = tool ? tool.action : (typeof info.action === 'string' && info.action ? info.action : undefined);
  const input = {
    action,
    facing: info.facing,
    phase: info.phase,
    nowMs: info.nowMs,
    moving: Boolean(info.moving),
    running: Boolean(info.running),
    reducedMotion: Boolean(info.reducedMotion),
  };
  if (tool) {
    if (tool.progress !== undefined) input.progress = tool.progress;
    if (tool.elapsedMs !== undefined) input.elapsedMs = tool.elapsedMs;
  }
  return input;
}

function browserImageLoader(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Falha ao carregar o atlas do personagem: ${url}`));
    image.src = url;
  }).then(async image => {
    if (typeof image.decode === 'function') await image.decode().catch(() => {});
    return image;
  });
}

function browserCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Cria o runtime com dependências injetáveis (testes e navegador). */
export function createPaperdollRuntime({
  enabled = false,
  loadManifest = () => loadPaperdollManifest({ baseUrl: PAPERDOLL_ASSET_URL }),
  loadImage = browserImageLoader,
  createCanvas = browserCanvas,
  now = () => Date.now(),
  onReady = null,
  retryMs = PAPERDOLL_MANIFEST_RETRY_MS,
  onError = error => console.warn('Personagem em camadas indisponível; usando o desenho clássico.', error),
} = {}) {
  let state = enabled ? 'idle' : 'off'; // off | idle | loading | ready | failed
  let renderer = null;
  let manifestPromise = null;
  const preloaded = new Set();
  let lastError = null;
  let failedAt = 0;

  function ensureRenderer() {
    if (!enabled || manifestPromise) return manifestPromise;
    // Falha antiga: tenta de novo só depois de retryMs (relógio injetável), nunca a cada quadro.
    if (state === 'failed' && now() - failedAt < retryMs) return Promise.resolve(null);
    state = 'loading';
    manifestPromise = Promise.resolve().then(loadManifest).then(({ manifest, baseUrl }) => {
      renderer = createPaperdollRenderer({ manifest, baseUrl, loadImage, createCanvas, now });
      state = 'ready';
      return renderer;
    }).catch(error => {
      state = 'failed';
      failedAt = now();
      manifestPromise = null;
      lastError = error;
      try { onError(error); } catch { /* o aviso não pode derrubar o jogo */ }
      return null;
    });
    return manifestPromise;
  }

  async function preload(appearance, { anims = PAPERDOLL_DEFAULT_PRELOAD } = {}) {
    if (!enabled || !isPaperdollOutfit(appearance)) return null;
    const active = await ensureRenderer();
    if (!active || !appearance) return null;
    const result = await active.preload(appearance, { anims });
    try { onReady?.(result); } catch { /* ouvinte opcional */ }
    return result;
  }

  function tryDraw(context, x, y, appearance, info = {}) {
    if (!enabled || !context || !appearance || !isPaperdollOutfit(appearance)) return false;
    if (!renderer) {
      void ensureRenderer();
      return false;
    }
    const selection = selectPaperdollFrame(renderer.manifest, mapGameStateToPaperdollInput({ nowMs: now(), ...info }));
    if (!selection.supported) return false;
    // O primeiro quadro pede os atlas; enquanto decodificam, draw devolve false e o jogo usa o antigo.
    if (!preloaded.has(`${selection.anim}`) && !renderer.isReady(selection.anim)) {
      preloaded.add(selection.anim);
      void preload(appearance, { anims: [selection.anim] }).catch(() => {});
    }
    return renderer.draw(context, x, y, appearance, selection, { scale: info.scale ?? 1, omit: info.omit });
  }

  return {
    isEnabled: () => enabled,
    state: () => state,
    error: () => lastError,
    preload,
    tryDraw,
    stats: () => (renderer ? renderer.stats() : null),
    getRenderer: () => renderer,
  };
}

let defaultRuntime = null;
function readableStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Runtime do jogo, criado uma vez a partir da URL e do armazenamento. */
export function getPaperdollRuntime() {
  defaultRuntime ??= createPaperdollRuntime({
    enabled: readPaperdollFlag({ search: globalThis.location?.search || '', storage: readableStorage() }),
    onReady: () => { try { paperdollReadyListener?.(); } catch { /* ouvinte opcional */ } },
  });
  return defaultRuntime;
}

let paperdollReadyListener = null;
/** Avisa quando atlas novos terminam de carregar (a prévia da aparência redesenha). */
export function setPaperdollReadyListener(listener) { paperdollReadyListener = typeof listener === 'function' ? listener : null; }

export function isPaperdollEnabled() { return getPaperdollRuntime().isEnabled(); }
export function preloadPaperdoll(appearance, options) { return getPaperdollRuntime().preload(appearance, options); }
export function tryDrawPaperdollAvatar(context, x, y, appearance, info) {
  return getPaperdollRuntime().tryDraw(context, x, y, appearance, info);
}
