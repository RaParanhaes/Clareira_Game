// Arte procedural da masmorra (tema 'cave', nível 1 "ardósia"). Zero PNG.
// Cada sprite é pintado em pixel lógico e ampliado por um número inteiro (DUNGEON_GEOMETRY.pixel).
// Paredes são rocha irregular (contorno serrilhado, alturas variadas por tile, musgo e lascas);
// o piso tem terra, pedra e cascalho, com poças e estalagmites pequenas (decoração, não sólida).
import { CLAREIRA } from './theme.mjs';
import { DUNGEON_GEOMETRY, DUNGEON_LIGHT, cellHash, createSpriteCache } from './dungeon-render.mjs';

const C = CLAREIRA.cave;

// Paleta do nível 1 (ardósia, terra e musgo). Tokens vêm de theme.mjs, bloco cave.
export const DUNGEON_PALETTE_SLATE = Object.freeze({
  // Piso: cada material tem [base, clara, escura].
  floorMaterials: Object.freeze([
    Object.freeze([C.earth, C.earthLight, C.earthShade]),       // terra batida
    Object.freeze([C.stone, C.stoneLight, C.stoneShade]),       // pedra (lajota)
    Object.freeze([C.gravel, C.gravelLight, C.gravelShade]),    // cascalho
  ]),
  seam: C.seam,
  crack: C.crack,
  puddle: C.puddle,
  puddleGlint: C.puddleGlint,
  stalagmite: C.stalagmite,
  stalagmiteShade: C.stalagmiteShade,
  stalagmiteTip: C.stalagmiteTip,
  // Parede: ardósia com veios ocre e marrons, musgo no topo e luz de borda.
  wallTop: C.slate, wallTopLight: C.slateLight, wallCrack: C.slateShade,
  wallL: C.slate, wallS: C.slateShade, wallVein: C.ochre, wallStrata: C.brown, wallStrataDark: C.brownDark,
  rim: C.rim, outline: C.ink,
  moss: C.moss, mossLight: C.mossLight, mossDark: C.mossDark,
  wood: C.wood, woodShade: C.woodShade, iron: C.iron,
  flameCore: C.torchCore, flameOuter: C.torch,
  veil: C.veil, torch: C.torch, playerLight: C.playerLight,
});

const PIX = DUNGEON_GEOMETRY.pixel;
const FLOOR_W = 32, FLOOR_H = 18;                     // losango do tile em pixels lógicos
const WALL_RISE_PX = DUNGEON_GEOMETRY.wallRise / PIX; // 20
const WALL_W = 32;
const WALL_ANCHOR = DUNGEON_GEOMETRY.wallAnchorRow;   // 15: linha do losango de altura padrão
const WALL_H = WALL_ANCHOR + WALL_RISE_PX + FLOOR_H / 2; // 44: base da rocha fica no chão em qualquer altura
const TORCH_W = 8, TORCH_H = 24;

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

// Losango do topo com centro em (FLOOR_W/2, cy): |u|+|v| <= 1.
function diamond(c, r, cy = FLOOR_H / 2) {
  const u = (c + 0.5 - FLOOR_W / 2) / (FLOOR_W / 2);
  const v = (r + 0.5 - cy) / (FLOOR_H / 2);
  return { u, v, mag: Math.abs(u) + Math.abs(v) };
}

// Cor hex com alfa (0 a 1) em rgba, para gradientes.
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
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

  // Piso: material em manchas (patch, hash de blocos 4x4 de tiles: terra, pedra ou cascalho) e decoração
  // rara por tile (h: estalagmite ou poça). Vêm de cellHash no renderer. Decoração não bloqueia nada.
  function floor(h, patch = h) {
    const mat = patch % pal.floorMaterials.length;
    const deco = (h >>> 8) % 12 === 0 ? 1 : (h >>> 8) % 12 === 1 ? 2 : 0; // 1 estalagmite, 2 poça
    return sprite(`floor:${mat}:${deco}`, FLOOR_W, FLOOR_H, (c, r) => {
      const { mag } = diamond(c, r);
      if (mag > 1) return null;
      const [base, light, shade] = pal.floorMaterials[mat];
      // Borda sem linha contínua: pequenas falhas escuras que quebram a grade de losangos.
      if (mag > 0.9 && cellHash(c, r, 12) % 3 === 0) return shade;
      if (deco === 1) {
        // Estalagmite pequena, centrada, com base no meio do losango.
        const dx = c + 0.5 - FLOOR_W / 2;
        if (r >= 6 && r <= 13) {
          const hw = 0.6 + ((r - 6) / 7) * 1.9;
          if (Math.abs(dx) <= hw) return r === 6 ? pal.stalagmiteTip : dx < 0 ? pal.stalagmite : pal.stalagmiteShade;
        }
      }
      if (deco === 2) {
        // Poça escura, elíptica, com um reflexo fraco no lado de cima.
        const ex = (c + 0.5 - FLOOR_W / 2) / 6, ey = (r + 0.5 - 10) / 2.6;
        if (ex * ex + ey * ey <= 1) return r === 8 && c >= 12 && c <= 14 ? pal.puddleGlint : pal.puddle;
      }
      const hh = cellHash(c, r, mat + 3);
      if (mat === 0) return hh % 19 === 0 ? light : hh % 11 === 1 ? shade : base;       // terra com pedrinhas
      if (mat === 1) {                                                                  // lajotas com juntas
        if (r % 6 === 0 && hh % 4 !== 0) return shade;
        if ((c + (r % 6)) % 9 === 0 && hh % 5 === 0) return shade;
        return hh % 13 === 2 ? light : base;
      }
      return hh % 5 === 0 ? light : hh % 4 === 1 ? shade : base;                       // cascalho
    });
  }

  // Parede: rocha irregular. shape escolhe o contorno; lift sobe o topo (alturas variadas por tile).
  // mask: bit 1 = face S (lado inferior esquerdo), bit 2 = face L (lado inferior direito).
  function wall(mask, variant = { lift: 0, shape: 0 }) {
    const m = mask & 3;
    const lift = variant.lift | 0, shape = variant.shape | 0;
    const cy = WALL_ANCHOR - lift;
    return sprite(`wall:${m}:${lift}:${shape}`, WALL_W, WALL_H, (c, r) => {
      const { u, v: vr, mag } = diamond(c, r, cy);
      // Topo serrilhado: a borda do losango ganha um desvio em blocos de colunas (lascas irregulares).
      const jag = ((cellHash(c >> 1, shape, 21) % 5) - 2) * 0.04;
      // Saliências: em alguns blocos de colunas a borda de trás sobe e forma uma quina de rocha.
      const bump = cellHash(c >> 2, shape, 26) % 4 === 0 ? 0.16 : 0;
      if (mag > 1 + jag && vr < 0 && mag <= 1 + bump) {
        if (mag > 1 + bump - 0.09) return pal.outline;
        return cellHash(c, r, shape + 33) % 3 === 0 ? pal.wallTopLight : pal.wallTop;
      }
      if (mag <= 1 + jag) {
        if (mag > 0.92 + jag) return pal.outline;
        const v = (r + 0.5 - cy) / (FLOOR_H / 2);
        const hh = cellHash(c, r, shape + 30);
        if (v < -0.2 && mag > 0.5 && hh % 6 === 0) return hh % 2 ? pal.mossLight : pal.moss; // musgo na parte de trás
        if (v < 0.25 && mag > 0.55 && hh % 17 === 5) return pal.mossDark;
        if (hh % 9 === 2) return pal.wallTopLight;                                           // lascas
        if (hh % 17 === 3) return pal.wallCrack;                                             // rachadura
        return pal.wallTop;
      }
      // Face: começa na borda inferior do losango e desce até a base, com desvio de 1 linha em algumas colunas.
      const lowerEdge = cy + (1 - Math.abs(u)) * (FLOOR_H / 2) + (cellHash(c >> 1, shape, 22) % 3 === 0 ? 1 : 0);
      if (r + 0.5 <= lowerEdge) return null;
      const bottom = WALL_H - 1 - (cellHash(c >> 2, shape, 23) % 4);                       // base em blocos: 0 a 3 linhas
      if (r > bottom) return null;
      const left = u < 0;
      if (left ? !(m & 1) : !(m & 2)) return null;
      if (r === bottom) return pal.outline;
      if (Math.abs(u) < 0.05) return pal.seam;                                               // quina entre as duas faces
      const depth = r + 0.5 - lowerEdge;
      if (depth < 1.5) return pal.rim;                                                       // luz de borda: topo da face levemente iluminado
      const hh = cellHash(c, r, shape + 40);
      if (depth < 4 && cellHash(c, shape, 24) % 5 === 0) return hh % 2 ? pal.mossDark : pal.moss; // musgo escorrendo
      if ((r + (cellHash(c >> 1, shape, 25) % 4)) % 6 === 0) return left ? pal.wallStrataDark : pal.wallStrata; // veios de terra
      if (hh % 23 === 0) return pal.wallVein;                                                // veio ocre
      if (hh % 15 === 0) return left ? pal.wallCrack : pal.wallTopLight;                     // lasca
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
    wall,
    torch,
    darken,
    get cacheSize() { return cache.size; },
  };
}
