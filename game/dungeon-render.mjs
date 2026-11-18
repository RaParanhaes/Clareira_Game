// Renderer da masmorra (tema 'cave'): sem DOM, testável em Node.
// Grade: { w, h, cells: Uint8Array, seed, torches: [{x,y}] } com 1 = piso aberto e 0 = rocha.
// Piso, paredes, estalagmites e tochas vêm do tileset aprovado (game/art/dungeon/manifest.json).
// Paredes e estalagmites são objetos ordenados por profundidade (compareSceneDepth), como árvores e rochas.
import { compareSceneDepth } from './depth-order.mjs';

// Âncoras e tamanhos dos sprites do tileset, em pixels de mundo (1 pixel do PNG = 1 pixel de mundo).
// Conferidos contra game/art/dungeon/manifest.json pelo teste dungeon-render.test.mjs.
export const DUNGEON_GEOMETRY = Object.freeze({
  halfW: 32,         // meia largura do losango do tile
  halfH: 18,         // meia altura do losango do tile
  floorAnchor: Object.freeze({ x: 32, y: 18 }),     // piso 64x36: contato no centro do losango
  wallSize: Object.freeze({ w: 96, h: 72 }),        // parede 96x72
  wallAnchor: Object.freeze({ x: 48, y: 61 }),      // parede: contato da base no centro do tile
  propAnchor: Object.freeze({ x: 32, y: 67 }),      // estalagmite 64x72: contato no chão
  torchAnchor: Object.freeze({ x: 16, y: 28 }),     // tocha 32x48: suporte no centro do tile
  playerBox: Object.freeze({ left: 24, right: 24, top: 84, bottom: 12 }), // pivô (48,84) de 96x96
});
export const DUNGEON_FRONT_WALL_ALPHA = 0.45;
export const DUNGEON_LIGHT = Object.freeze({
  pxPerTile: 36,
  playerReachTiles: 3.4,
  torchReachTiles: 2.6,
  maxTorches: 16,
  veilAlpha: 0.76,     // escuridão ambiente: sobra ~24% de visibilidade fria
  flicker: 0.04,       // variação lenta do raio da tocha (fração), sem tremor
  playerStrength: 0.5, // luz do jogador: corta metade do véu, neutra e mais fraca
  torchStrength: 1,
});
export const DUNGEON_TORCH_FRAMES = 4;
const TORCH_FPS = 6;   // 4 quadros em 6 por segundo: chama viva, sem tremor
const VIEW_MARGIN_TILES = 3;

export const DUNGEON_FLOOR_IDS = Object.freeze(['piso-terra', 'piso-pedra', 'piso-cascalho', 'piso-poca']);

// Hash determinístico de uma célula: mesma seed, mesmo resultado em qualquer quadro.
export function cellHash(c, r, salt = 0) {
  let h = (c * 374761393 + r * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Ruído de valor em [0, 1): hashes nos cantos de uma grade de `scale` tiles, com interpolação suave.
// Mesma seed, mesmo campo. Dá manchas grandes e irregulares, não um padrão de tabuleiro.
export function valueNoise(x, y, seed = 0, scale = 3) {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (a, b) => cellHash(a, b, seed) / 4294967296;
  const top = h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx;
  const bottom = h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

// Material do piso de um tile. O ruído de manchas escolhe a região; um jitter por tile mistura as bordas,
// então as transições são irregulares e não se alternam tile a tile. Poça é rara (pico do ruído).
export function floorTileId(x, y, seed = 0) {
  const jitter = (cellHash(x, y, seed + 7) / 4294967296 - 0.5) * 0.18;
  const v = valueNoise(x, y, seed * 2 + 101, 3.5) + jitter;
  if (v >= 0.9) return 'piso-poca';
  if (v < 0.38) return 'piso-terra';
  if (v < 0.66) return 'piso-pedra';
  return 'piso-cascalho';
}

// Estalagmite decorativa (não bloqueia): cerca de 1 em 24 tiles de piso fora das poças.
export function propTileId(x, y, seed = 0) {
  if (floorTileId(x, y, seed) === 'piso-poca') return null;
  const h = cellHash(x, y, seed + 31);
  if (h % 24 !== 0) return null;
  return `estalagmite-${((h >>> 8) % 3) + 1}`;
}

// Peça de parede para uma rocha com face visível. mask: bit 1 = face S, bit 2 = face L.
// Duas faces viram canto; uma face vira reta, espelhada quando a face é a L.
// A altura (baixa ou alta) segue o ruído, em grupos, e a variante a para a parede é por hash.
export function wallPiece(mask, x, y, seed = 0) {
  if (!(mask & 3)) return null;
  const high = valueNoise(x, y, seed * 2 + 205, 4) >= 0.5;
  if ((mask & 3) === 3) return { id: high ? 'canto-alto' : 'canto-baixo', flip: false };
  const letter = 'abc'[(cellHash(x, y, seed + 5) >>> 8) % 3];
  return { id: `parede-${high ? 'alta' : 'baixa'}-${letter}`, flip: (mask & 3) === 2 };
}

// Canto do sprite da parede em relação ao centro da tela do tile: a base do sprite fica no chão do tile.
export function wallDrawOffset() {
  return { dx: -DUNGEON_GEOMETRY.wallAnchor.x, dy: -DUNGEON_GEOMETRY.wallAnchor.y };
}

// Projeção isométrica de um ponto contínuo (px, py) em tiles para pixels de mundo.
export function projectTile(px, py) {
  return { x: (px - py) * DUNGEON_GEOMETRY.halfW, y: (px + py) * DUNGEON_GEOMETRY.halfH };
}

export function isOpenCell(grid, x, y) {
  if (!grid || x < 0 || y < 0 || x >= grid.w || y >= grid.h) return false;
  return grid.cells[y * grid.w + x] !== 0;
}

// Bit 1 = face S (+y, lado inferior esquerdo); bit 2 = face L (+x, lado inferior direito).
// Uma rocha só tem face quando a célula vizinha nesse lado é piso aberto.
// Fora da grade conta como rocha, então a borda do nível precisa ser fechada.
export function wallFaceMask(grid, x, y) {
  if (isOpenCell(grid, x, y)) return 0;
  let mask = 0;
  if (isOpenCell(grid, x, y + 1)) mask |= 1;
  if (isOpenCell(grid, x + 1, y)) mask |= 2;
  return mask;
}

const indexCache = new WeakMap();
// Índice das paredes com face visível, das estalagmites e das tochas, calculado uma vez por grade.
export function dungeonIndex(grid) {
  let index = indexCache.get(grid);
  if (index) return index;
  const seed = grid.seed | 0;
  const walls = [], props = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (isOpenCell(grid, x, y)) {
        const id = propTileId(x, y, seed);
        if (id) props.push({ type: 'prop', id, x, y, sortX: x + 0.5, sortY: y + 0.5, sortZ: 0, sortId: `p${x},${y}` });
        continue;
      }
      const mask = wallFaceMask(grid, x, y);
      if (mask) {
        walls.push({ type: 'wall', x, y, mask, sprite: wallPiece(mask, x, y, seed), sortX: x + 0.5, sortY: y + 0.5, sortZ: 0, sortId: `w${x},${y}` });
      }
    }
  }
  const torches = (grid.torches || []).map((t, i) => ({
    type: 'torch', x: t.x, y: t.y, sortX: t.x + 0.5, sortY: t.y + 0.5, sortZ: 0.5, sortId: `t${i}`,
  }));
  index = { walls, props, torches };
  indexCache.set(grid, index);
  return index;
}

// Retângulo de tiles que cabe no viewport, com margem. camera: {x, y} em tiles.
export function visibleTileBounds(camera, viewport, margin = VIEW_MARGIN_TILES) {
  const { halfW, halfH } = DUNGEON_GEOMETRY;
  const du = camera.x - camera.y, dv = camera.x + camera.y;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const sx of [0, viewport.width]) {
    for (const sy of [0, viewport.height]) {
      const u = (sx - viewport.width / 2) / halfW + du;
      const v = (sy - viewport.height / 2) / halfH + dv;
      const px = (u + v) / 2, py = (v - u) / 2;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
  }
  return {
    minX: Math.floor(minX) - margin, minY: Math.floor(minY) - margin,
    maxX: Math.ceil(maxX) + margin, maxY: Math.ceil(maxY) + margin,
  };
}

function inBounds(thing, b) {
  return thing.x >= b.minX && thing.x <= b.maxX && thing.y >= b.minY && thing.y <= b.maxY;
}

// Lista ordenada de coisas visíveis: paredes, estalagmites, tochas e o jogador.
export function collectDungeonThings({ grid, bounds, player, torchLimit = DUNGEON_LIGHT.maxTorches }) {
  const index = dungeonIndex(grid);
  const things = [];
  for (const wall of index.walls) {
    if (wall.x < bounds.minX || wall.x > bounds.maxX || wall.y < bounds.minY || wall.y > bounds.maxY) continue;
    things.push(wall);
  }
  for (const prop of index.props) {
    if (inBounds(prop, bounds)) things.push(prop);
  }
  const torches = index.torches
    .filter(t => inBounds(t, bounds))
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))
    .slice(0, torchLimit);
  things.push(...torches);
  things.push({ type: 'player', id: 'player', sortId: 'player', x: player.x, y: player.y, sortX: player.x, sortY: player.y, sortZ: 0 });
  things.sort(compareSceneDepth);
  return things;
}

// Parede à frente do jogador (depois dele na ordem) e cujo desenho cobre o corpo fica translúcida.
export function wallAlphaFor(thing, player) {
  if (thing.type !== 'wall') return 1;
  if (compareSceneDepth(thing, player) <= 0) return 1;
  const w = projectTile(thing.sortX, thing.sortY), p = projectTile(player.x, player.y);
  const { wallAnchor, wallSize, playerBox } = DUNGEON_GEOMETRY;
  const wl = w.x - wallAnchor.x, wr = wl + wallSize.w, wt = w.y - wallAnchor.y, wb = wt + wallSize.h;
  const pl = p.x - playerBox.left, pr = p.x + playerBox.right, pt = p.y - playerBox.top, pb = p.y + playerBox.bottom;
  const overlaps = wl < pr && wr > pl && wt < pb && wb > pt;
  return overlaps ? DUNGEON_FRONT_WALL_ALPHA : 1;
}

// Luzes que iluminam o escuro: jogador sempre (neutra e fraca), tochas do viewport (quentes, teto por DUNGEON_LIGHT).
// warm = luz de chama (âmbar); strength = quanto ela corta o véu escuro (0 a 1).
export function collectDungeonLights({ things, camera, viewport, time, reducedMotion = false }) {
  const toScreen = t => {
    const p = projectTile(t.x, t.y), c = projectTile(camera.x, camera.y);
    return { x: p.x - c.x + viewport.width / 2, y: p.y - c.y + viewport.height / 2 };
  };
  const lights = [];
  for (const thing of things) {
    if (thing.type === 'player') {
      const s = toScreen(thing);
      lights.push({ x: s.x, y: s.y - 24, radius: DUNGEON_LIGHT.playerReachTiles * DUNGEON_LIGHT.pxPerTile, warm: false, strength: DUNGEON_LIGHT.playerStrength });
    } else if (thing.type === 'torch') {
      const s = toScreen({ x: thing.sortX, y: thing.sortY });
      const seed = thing.x * 1.7 + thing.y * 0.63;
      // Duas ondas lentas (período de segundos), nunca um tremor rápido. Movimento reduzido: fixo.
      const wobble = 0.7 * Math.sin(time * 1.3 + seed) + 0.3 * Math.sin(time * 2.9 + seed * 1.7);
      const flicker = reducedMotion ? 1 : 1 + DUNGEON_LIGHT.flicker * wobble;
      lights.push({ x: s.x, y: s.y - 30, radius: DUNGEON_LIGHT.torchReachTiles * DUNGEON_LIGHT.pxPerTile * flicker, warm: true, strength: DUNGEON_LIGHT.torchStrength });
    }
  }
  return lights;
}

// Quadro da chama da tocha (0 a 3), em 6 quadros por segundo; cada tocha começa em um ponto diferente.
// Movimento reduzido: fica no quadro 0, parado.
export function torchFrame(time, reducedMotion = false, seed = 0) {
  if (reducedMotion) return 0;
  const n = Math.floor(time * TORCH_FPS + seed);
  return ((n % DUNGEON_TORCH_FRAMES) + DUNGEON_TORCH_FRAMES) % DUNGEON_TORCH_FRAMES;
}

// Cache limitado por chave (sprites espelhados). make() só roda quando a chave falta.
export function createSpriteCache(limit = 512) {
  const map = new Map();
  return {
    get(key, make) {
      if (map.has(key)) {
        const value = map.get(key);
        map.delete(key); map.set(key, value);
        return value;
      }
      const value = make();
      map.set(key, value);
      while (map.size > limit) map.delete(map.keys().next().value);
      return value;
    },
    get size() { return map.size; },
  };
}

// Desenha um quadro: piso visível, coisas em ordem de profundidade, véu escuro com luzes.
// art: { floor(id), wall(spec), prop(id), torch(frame), darken(ctx, lights, w, h) } (ver dungeon-art.mjs).
// drawActor(ctx, thing, screen) desenha o jogador (o avatar é responsabilidade do chamador).
export function drawDungeonFrame(ctx, { grid, camera, viewport, player, time = 0, reducedMotion = false, art, drawActor }) {
  const bounds = visibleTileBounds(camera, viewport);
  const cam = projectTile(camera.x, camera.y);
  const screenOf = t => {
    const p = projectTile(t.x, t.y);
    return { x: p.x - cam.x + viewport.width / 2, y: p.y - cam.y + viewport.height / 2 };
  };
  const seed = grid.seed | 0;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let y = Math.max(0, bounds.minY); y <= Math.min(grid.h - 1, bounds.maxY); y++) {
    for (let x = Math.max(0, bounds.minX); x <= Math.min(grid.w - 1, bounds.maxX); x++) {
      if (!isOpenCell(grid, x, y)) continue;
      const s = screenOf({ x: x + 0.5, y: y + 0.5 });
      ctx.drawImage(art.floor(floorTileId(x, y, seed)), s.x - DUNGEON_GEOMETRY.floorAnchor.x, s.y - DUNGEON_GEOMETRY.floorAnchor.y);
    }
  }
  const things = collectDungeonThings({ grid, bounds, player });
  const wallOffset = wallDrawOffset();
  for (const thing of things) {
    ctx.globalAlpha = wallAlphaFor(thing, player);
    if (thing.type === 'wall') {
      const s = screenOf({ x: thing.sortX, y: thing.sortY });
      ctx.drawImage(art.wall(thing.sprite), s.x + wallOffset.dx, s.y + wallOffset.dy);
    } else if (thing.type === 'prop') {
      const s = screenOf({ x: thing.sortX, y: thing.sortY });
      ctx.drawImage(art.prop(thing.id), s.x - DUNGEON_GEOMETRY.propAnchor.x, s.y - DUNGEON_GEOMETRY.propAnchor.y);
    } else if (thing.type === 'torch') {
      const s = screenOf({ x: thing.sortX, y: thing.sortY });
      ctx.drawImage(art.torch(torchFrame(time, reducedMotion, thing.x + thing.y)), s.x - DUNGEON_GEOMETRY.torchAnchor.x, s.y - DUNGEON_GEOMETRY.torchAnchor.y);
    } else if (thing.type === 'player') {
      ctx.globalAlpha = 1;
      drawActor?.(ctx, thing, screenOf(thing));
    }
  }
  ctx.globalAlpha = 1;
  const lights = collectDungeonLights({ things, camera, viewport, time, reducedMotion });
  art.darken(ctx, lights, viewport.width, viewport.height);
  ctx.restore();
  return { things: things.length, bounds };
}
