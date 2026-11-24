// Renderizador do personagem em camadas. Sem DOM global: imagens e canvas entram por injeção
// (loadImage, createCanvas), então roda em Node nos testes e no navegador no jogo.
//
// Pipeline por quadro (tudo em cache LRU com limite):
//   atlas da camada (Image, 1x por URL) -> [recolor da célula 96x96, se o mapeamento não é identidade]
//   -> quadro composto no canvas offscreen 96x96 -> drawImage no destino, sem suavização,
//   pivô (48, 84) x escala, como drawAvatarSprite.
// Sem setTimeout/setInterval: o desenho é síncrono; a carga é uma promessa.
import {
  PAPERDOLL_CELL, PAPERDOLL_PIVOT, paperdollAtlasUrl, paperdollCellOrigin, paperdollLayersFor,
} from './paperdoll-manifest.mjs';
import { appearanceRecolorKey, buildMapping, isIdentityMapping, mappingKey, recolorRGBA } from './recolor.mjs';

// Orçamento (docs/PERFORMANCE-STANDARD.md, item 4: todo cache tem limite e descarte).
// Cada célula 96x96 RGBA custa 36.864 bytes: 256 quadros ~ 9 MiB e 192 células recoloridas ~ 6,75 MiB.
// Os atlas decodificados somam ~ 27 MiB com as 3 animações (parado 4,5; andar 9; golpear 13,5 MiB)
// e são contados em stats(); `preload(appearance, { anims })` permite carregar só parte deles.
export const PAPERDOLL_CACHE_LIMITS = Object.freeze({
  maxFrames: 256,
  maxRecoloredCells: 192,
  maxMappingSets: 256,
  retryAfterMs: 5000,
});
const CELL_BYTES = PAPERDOLL_CELL.width * PAPERDOLL_CELL.height * 4;

class Lru {
  constructor(limit) { this.limit = limit; this.map = new Map(); }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
    return value;
  }
  get size() { return this.map.size; }
  clear() { this.map.clear(); }
}

export function createPaperdollRenderer({
  manifest, baseUrl, loadImage, createCanvas, now = () => Date.now(), limits = {},
} = {}) {
  if (!manifest?.animations) throw new Error('createPaperdollRenderer precisa de um manifest validado.');
  if (typeof loadImage !== 'function' || typeof createCanvas !== 'function') {
    throw new Error('createPaperdollRenderer precisa de loadImage e createCanvas.');
  }
  const config = { ...PAPERDOLL_CACHE_LIMITS, ...limits };
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const { width: CW, height: CH } = PAPERDOLL_CELL;

  const images = new Map(); // url -> { state, image, promise, retryAt, error }
  const frames = new Lru(config.maxFrames);
  const recolored = new Lru(config.maxRecoloredCells);
  const mappingSets = new Lru(config.maxMappingSets);
  const counters = { frameHits: 0, frameMisses: 0, recolorHits: 0, recolorMisses: 0, loadFailures: 0 };
  let scratch = null;

  function mappingsFor(appearance) {
    const key = appearanceRecolorKey(appearance);
    let set = mappingSets.get(key);
    if (!set) {
      set = { key, layers: {} };
      for (const [layer, def] of Object.entries(manifest.recolor?.layers || {})) {
        const mapping = buildMapping(def.ramps, appearance);
        set.layers[layer] = { mapping, key: mappingKey(mapping), identity: isIdentityMapping(mapping) };
      }
      mappingSets.set(key, set);
    }
    return set;
  }

  function requestImage(url) {
    let entry = images.get(url);
    if (entry?.state === 'failed' && entry.retryAt <= now()) entry = null;
    if (!entry) {
      entry = { state: 'loading', image: null, promise: null, retryAt: 0, error: null };
      let pending;
      try { pending = Promise.resolve(loadImage(url)); } catch (error) { pending = Promise.reject(error); }
      entry.promise = pending.then(image => {
        entry.state = 'ready';
        entry.image = image;
        return image;
      }, error => {
        entry.state = 'failed';
        entry.error = error;
        entry.retryAt = now() + config.retryAfterMs;
        counters.loadFailures++;
        throw error;
      });
      entry.promise.catch(() => {}); // a falha fica registrada; quem chama `preload` a recebe.
      images.set(url, entry);
    }
    return entry;
  }

  function layerEntries(anim, layers) {
    return layers.map(layer => ({ layer, url: paperdollAtlasUrl(manifest, base, anim, layer) })).filter(item => item.url);
  }

  function recoloredCell(layer, layerMapping, anim, direction, frame, image) {
    const key = `${layer}|${layerMapping.key}|${anim}|${direction}|${frame}`;
    const hit = recolored.get(key);
    if (hit) { counters.recolorHits++; return hit; }
    counters.recolorMisses++;
    scratch ??= createCanvas(CW, CH);
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
    const { sx, sy } = paperdollCellOrigin(direction, frame);
    scratchContext.clearRect(0, 0, CW, CH);
    scratchContext.drawImage(image, sx, sy, CW, CH, 0, 0, CW, CH);
    const pixels = scratchContext.getImageData(0, 0, CW, CH);
    pixels.data.set(recolorRGBA(pixels.data, layerMapping.mapping));
    const canvas = createCanvas(CW, CH);
    canvas.getContext('2d').putImageData(pixels, 0, 0);
    return recolored.set(key, canvas);
  }

  // Devolve o quadro composto (canvas 96x96) ou null enquanto faltar algum atlas.
  function frameCanvas(appearance, selection, omit) {
    const { anim, direction, frame } = selection;
    const spec = manifest.animations[anim];
    if (!spec || !Number.isInteger(direction) || direction < 0 || direction > 7) return null;
    if (!Number.isInteger(frame) || frame < 0 || frame >= spec.frameCount) return null;
    const mappings = mappingsFor(appearance);
    const names = (selection.layers || paperdollLayersFor(manifest, anim, direction))
      .filter(layer => !omit.includes(layer));
    const key = `${mappings.key}|${names.join('+')}|${anim}|${direction}|${frame}`;
    const cached = frames.get(key);
    if (cached) { counters.frameHits++; return cached; }

    const entries = layerEntries(anim, names).map(item => ({ ...item, entry: requestImage(item.url) }));
    if (!entries.length || entries.some(item => item.entry.state !== 'ready')) return null;
    counters.frameMisses++;
    const canvas = createCanvas(CW, CH);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    const { sx, sy } = paperdollCellOrigin(direction, frame);
    for (const { layer, entry } of entries) {
      const layerMapping = mappings.layers[layer];
      if (!layerMapping || layerMapping.identity) {
        context.drawImage(entry.image, sx, sy, CW, CH, 0, 0, CW, CH);
      } else {
        const cell = recoloredCell(layer, layerMapping, anim, direction, frame, entry.image);
        context.drawImage(cell, 0, 0, CW, CH, 0, 0, CW, CH);
      }
    }
    return frames.set(key, canvas);
  }

  return {
    manifest,

    /** Carrega os atlas das animações pedidas (padrão: todas). Resolve { loaded, failed }. */
    async preload(appearance, { anims = Object.keys(manifest.animations) } = {}) {
      mappingsFor(appearance);
      const pending = [];
      for (const anim of anims) {
        for (const layer of Object.keys(manifest.animations[anim]?.atlases || {})) {
          if (manifest.layers?.[layer]?.drawn === false) continue;
          const url = paperdollAtlasUrl(manifest, base, anim, layer);
          pending.push(requestImage(url).promise.then(() => true, () => false));
        }
      }
      const results = await Promise.all(pending);
      return { loaded: results.filter(Boolean).length, failed: results.filter(ok => !ok).length };
    },

    /** true se todos os atlas da animação já estão decodificados. */
    isReady(anim) {
      const layers = Object.keys(manifest.animations[anim]?.atlases || {}).filter(layer => manifest.layers?.[layer]?.drawn !== false);
      return layers.length > 0 && layers.every(layer => images.get(paperdollAtlasUrl(manifest, base, anim, layer))?.state === 'ready');
    },

    /**
     * Desenha o personagem com a base dos pés em (x, y). `selection` vem de selectPaperdollFrame.
     * Retorna false (sem desenhar) se a seleção não é suportada ou se os atlas ainda carregam;
     * nesse caso o chamador usa o renderizador antigo, como com drawAvatarSprite.
     */
    draw(context, x, y, appearance, selection, { scale = 1, omit = [] } = {}) {
      if (!context || !selection?.supported) return false;
      const canvas = frameCanvas(appearance, selection, omit);
      if (!canvas) return false;
      context.save();
      context.imageSmoothingEnabled = false;
      context.translate(Math.round(x), Math.round(y));
      context.scale(scale, scale);
      context.drawImage(canvas, -PAPERDOLL_PIVOT.x, -PAPERDOLL_PIVOT.y, CW, CH);
      context.restore();
      return true;
    },

    /** Quadro composto sem desenhar (testes e miniaturas). null enquanto carrega. */
    composeFrame(appearance, selection, { omit = [] } = {}) {
      return selection?.supported ? frameCanvas(appearance, selection, omit) : null;
    },

    stats() {
      let imageBytes = 0, loadedImages = 0;
      for (const entry of images.values()) {
        if (entry.state !== 'ready') continue;
        loadedImages++;
        imageBytes += (entry.image.width || entry.image.naturalWidth || 0) * (entry.image.height || entry.image.naturalHeight || 0) * 4;
      }
      return {
        ...counters,
        frames: frames.size,
        recoloredCells: recolored.size,
        mappingSets: mappingSets.size,
        loadedImages,
        imageBytes,
        estimatedBytes: imageBytes + (frames.size + recolored.size) * CELL_BYTES,
        limits: { ...config },
      };
    },

    clear() { frames.clear(); recolored.clear(); mappingSets.clear(); },
  };
}
