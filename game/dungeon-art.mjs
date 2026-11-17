// Arte procedural da masmorra (tema 'cave', nível 1 "ardósia"). Zero PNG.
// Cada sprite é pintado em pixel lógico e ampliado por um número inteiro (DUNGEON_GEOMETRY.pixel).
import { CLAREIRA } from './theme.mjs';
import { DUNGEON_GEOMETRY, DUNGEON_LIGHT, createSpriteCache } from './dungeon-render.mjs';

// Paleta do nível 1. Cores de chama e tinta vêm dos tokens do tema.
export const DUNGEON_PALETTE_SLATE = Object.freeze({
  floor: Object.freeze(['#2c3140', '#333948', '#292e3b']),
  crack: '#1d212b',
  glint: '#3d4456',
  wallTop: '#5b6378',
  wallS: '#3f4657',
  wallL: '#2d3342',
  seam: '#222733',
  outline: CLAREIRA.palette.ink,
  wood: '#6b4a33',
  woodShade: '#4a3224',
  iron: '#3a3f4c',
  flameCore: CLAREIRA.signature.ember,
  flameOuter: CLAREIRA.signature.afterglow,
  veil: '#05060c',
});

const PIX = DUNGEON_GEOMETRY.pixel;
const FLOOR_W = 32, FLOOR_H = 18;                     // losango do tile em pixels lógicos
const WALL_RISE_PX = DUNGEON_GEOMETRY.wallRise / PIX; // 20
const WALL_W = 32, WALL_H = FLOOR_H + WALL_RISE_PX;   // 32 x 38
const TORCH_W = 8, TORCH_H = 24;

function hash(c, r, salt) {
  let h = (c * 374761393 + r * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Pinta uma grade lógica: paintPixel(c, r) devolve uma cor ou null. Agrupa runs da mesma cor.
function paintLogical(ctx, w, h, paintPixel) {
  for (let r = 0; r < h; r++) {
    let run = null, start = 0;
    for (let c = 0; c <= w; c++) {
      const colour = c < w ? paintPixel(c, r) : null;
      if (colour !== run) {
        if (run) { ctx.fillStyle = run; ctx.fillRect(start * PIX, r * PIX, (c - start) * PIX, PIX); }
        run = colour; start = c;
      }
    }
  }
}

// Losango do topo do tile em coordenadas normalizadas: |u|+|v| <= 1.
function diamond(c, r) {
  const u = (c + 0.5 - FLOOR_W / 2) / (FLOOR_W / 2);
  const v = (r + 0.5 - FLOOR_H / 2) / (FLOOR_H / 2);
  return { u, v, mag: Math.abs(u) + Math.abs(v) };
}

export function createDungeonArt({ createCanvas, palette = DUNGEON_PALETTE_SLATE, cacheLimit = 256 } = {}) {
  if (typeof createCanvas !== 'function') throw new Error('createDungeonArt precisa de createCanvas(w, h)');
  const cache = createSpriteCache(cacheLimit);
  const pal = palette;

  function sprite(key, width, height, paintPixel) {
    return cache.get(key, () => {
      const canvas = createCanvas(width * PIX, height * PIX);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      paintLogical(ctx, width, height, paintPixel);
      return canvas;
    });
  }

  function floor(variant) {
    const v = variant % pal.floor.length;
    return sprite(`floor:${v}`, FLOOR_W, FLOOR_H, (c, r) => {
      const { mag } = diamond(c, r);
      if (mag > 1) return null;
      if (mag > 0.86) return pal.seam;
      const h = hash(c, r, v + 1) % 29;
      if (h === 0) return pal.crack;
      if (h === 1) return pal.glint;
      return pal.floor[v];
    });
  }

  // mask: bit 1 = face S (lado inferior esquerdo), bit 2 = face L (lado inferior direito).
  function wall(mask) {
    const m = mask & 3;
    return sprite(`wall:${m}`, WALL_W, WALL_H, (c, r) => {
      const { u, mag } = diamond(c, r);
      if (mag <= 1) {
        if (mag > 0.84) return pal.outline;
        return hash(c, r, 7) % 17 === 0 ? pal.glint : pal.wallTop;
      }
      const lowerEdge = FLOOR_H / 2 + (1 - Math.abs(u)) * (FLOOR_H / 2);
      const y = r + 0.5;
      if (y <= lowerEdge || y > lowerEdge + WALL_RISE_PX) return null;
      const left = u < 0;
      if (left ? !(m & 1) : !(m & 2)) return null;
      if (y > lowerEdge + WALL_RISE_PX - 1) return pal.outline;
      if (Math.abs(u) < 0.06) return pal.seam;
      return left ? pal.wallS : pal.wallL;
    });
  }

  // Tocha de parede: haste de madeira, suporte de ferro e chama em dois quadros.
  function torch(frame) {
    const f = frame ? 1 : 0;
    return sprite(`torch:${f}`, TORCH_W, TORCH_H, (c, r) => {
      if (r >= 11 && r <= 21 && (c === 3 || c === 4)) return c === 4 ? pal.woodShade : pal.wood;
      if (r === 21 && c >= 2 && c <= 5) return pal.iron;
      const flameTop = f ? 3 : 4;
      if (r >= flameTop && r <= 10) {
        const dx = Math.abs(c + 0.5 - 4);
        const width = 1.6 + (r - flameTop) * 0.22;
        if (dx <= width * 0.45 && r <= 9) return pal.flameCore;
        if (dx <= width) return pal.flameOuter;
      }
      return null;
    });
  }

  // Véu escuro com luzes recortadas. Recebe o contexto do quadro e as luzes em pixels de mundo.
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
    for (const light of lights) {
      const g = v.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      v.fillStyle = g;
      v.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
    }
    v.globalCompositeOperation = 'source-over';
    ctx.drawImage(veilCanvas, 0, 0);
  }

  return {
    floor,
    wall,
    torch,
    darken,
    get cacheSize() { return cache.size; },
  };
}
