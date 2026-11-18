// Arte da masmorra (tema 'cave', nível 1 "ardósia"). Piso, paredes, estalagmites e tochas são os sprites
// do tileset aprovado em game/art/dungeon/ (carregados por dungeon-tileset.mjs). Este módulo só escolhe
// e espelha sprites já carregados. O véu escuro e a luz âmbar continuam procedurais, com tokens de theme.mjs.
import { CLAREIRA } from './theme.mjs';
import { DUNGEON_LIGHT, DUNGEON_TORCH_FRAMES, createSpriteCache } from './dungeon-render.mjs';

const C = CLAREIRA.cave;

// Cores da luz e do véu do nível 1 (tokens vêm de theme.mjs, bloco cave).
export const DUNGEON_PALETTE_SLATE = Object.freeze({
  veil: C.veil,
  torch: C.torch,
  playerLight: C.playerLight,
});

// Cor hex com alfa (0 a 1) em rgba, para gradientes.
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// tileset: Map id -> imagem (HTMLImageElement ou canvas), vinda de loadDungeonTileset().
// Peças de parede com flip: true são espelhadas uma vez e guardadas no cache.
export function createDungeonArt({ createCanvas, tileset, palette = DUNGEON_PALETTE_SLATE, cacheLimit = 64 } = {}) {
  if (typeof createCanvas !== 'function') throw new Error('createDungeonArt precisa de createCanvas(w, h)');
  if (!(tileset instanceof Map)) throw new Error('createDungeonArt precisa de tileset (Map id -> imagem) de loadDungeonTileset');
  const mirrored = createSpriteCache(cacheLimit);
  const pal = palette;

  function sprite(id) {
    const img = tileset.get(id);
    if (!img) throw new Error(`sprite ausente no tileset da masmorra: ${id}`);
    return img;
  }

  function floor(id) { return sprite(id); }
  function prop(id) { return sprite(id); }
  function torch(frame) { return sprite(`tocha-frame-${(frame % DUNGEON_TORCH_FRAMES) + 1}`); }

  // spec: { id, flip } vindo de wallPiece(). Espelhar é intencional para a face L (ver dungeon-render.mjs).
  function wall(spec) {
    const img = sprite(spec.id);
    if (!spec.flip) return img;
    return mirrored.get(`${spec.id}:flip`, () => {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      return canvas;
    });
  }

  // Véu escuro com luzes recortadas, depois brilho quente (tocha) ou frio e fraco (jogador).
  // Recebe o contexto do quadro e as luzes em pixels de mundo: { x, y, radius, warm, strength }.
  let veilCanvas = null, veilKey = '';
  function darken(ctx, lights, width, height) {
    const key = `${width}x${height}`;
    if (!veilCanvas || veilKey !== key) {
      veilCanvas = createCanvas(width, height);
      veilKey = key;
    }
    const v = veilCanvas.getContext('2d');
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.globalCompositeOperation = 'source-over';
    v.clearRect(0, 0, width, height);
    v.fillStyle = pal.veil;
    v.globalAlpha = DUNGEON_LIGHT.veilAlpha;
    v.fillRect(0, 0, width, height);
    v.globalAlpha = 1;
    v.globalCompositeOperation = 'destination-out';
    // Recorte suave: o corte perde força até zero na borda, sem disco branco.
    for (const light of lights) {
      const s = light.strength;
      const g = v.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
      g.addColorStop(0, `rgba(0,0,0,${s})`);
      g.addColorStop(0.4, `rgba(0,0,0,${0.85 * s})`);
      g.addColorStop(0.75, `rgba(0,0,0,${0.35 * s})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      v.fillStyle = g;
      v.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
    }
    v.globalCompositeOperation = 'source-over';
    ctx.drawImage(veilCanvas, 0, 0);
    // Brilho aditivo: tocha âmbar e jogador neutro, ambos com borda suave.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const light of lights) {
      const col = light.warm ? pal.torch : pal.playerLight;
      const a = (light.warm ? 0.22 : 0.07) * light.strength;
      const g = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
      g.addColorStop(0, withAlpha(col, a));
      g.addColorStop(0.5, withAlpha(col, a * 0.4));
      g.addColorStop(1, withAlpha(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
    }
    ctx.restore();
  }

  return {
    floor,
    prop,
    wall,
    torch,
    darken,
    get cacheSize() { return mirrored.size; },
  };
}
