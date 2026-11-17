// Renderer da masmorra (tema 'cave'): sem DOM, testável em Node.
// Grade: { w, h, cells: Uint8Array } com 1 = piso aberto e 0 = rocha; torches: [{x,y}].
// Paredes são objetos ordenados por profundidade (compareSceneDepth), como árvores e rochas.
import { compareSceneDepth } from './depth-order.mjs';

export const DUNGEON_GEOMETRY = Object.freeze({
  halfW: 32,        // meia largura do losango do tile, em pixels de mundo
  halfH: 18,        // meia altura do losango do tile
  wallRise: 40,     // altura física da parede acima da base, em pixels de mundo
  pixel: 2,         // escala inteira da arte: 1 pixel lógico = 2 pixels de mundo
  playerBox: Object.freeze({ left: 24, right: 24, top: 84, bottom: 12 }), // pivô (48,84) de 96x96
});
export const DUNGEON_FRONT_WALL_ALPHA = 0.45;
export const DUNGEON_LIGHT = Object.freeze({
  pxPerTile: 36,
  playerReachTiles: 3.4,
  torchReachTiles: 2.6,
  maxTorches: 16,
  veilAlpha: 0.97,
  flicker: 0.06,
});
const VIEW_MARGIN_TILES = 3;

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
// Índice das paredes com face visível e das tochas, calculado uma vez por grade.
export function dungeonIndex(grid) {
  let index = indexCache.get(grid);
  if (index) return index;
  const walls = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const mask = wallFaceMask(grid, x, y);
      if (mask) walls.push({ type: 'wall', x, y, mask, sortX: x + 0.5, sortY: y + 0.5, sortZ: 0, sortId: `w${x},${y}` });
    }
  }
  const torches = (grid.torches || []).map((t, i) => ({
    type: 'torch', x: t.x, y: t.y, sortX: t.x + 0.5, sortY: t.y + 0.5, sortZ: 0.5, sortId: `t${i}`,
  }));
  index = { walls, torches };
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

// Lista ordenada de coisas visíveis: paredes, tochas e o jogador.
export function collectDungeonThings({ grid, bounds, player, torchLimit = DUNGEON_LIGHT.maxTorches }) {
  const index = dungeonIndex(grid);
  const things = [];
  for (const wall of index.walls) {
    if (wall.x < bounds.minX || wall.x > bounds.maxX || wall.y < bounds.minY || wall.y > bounds.maxY) continue;
    things.push(wall);
  }
  const torches = index.torches
    .filter(t => t.x >= bounds.minX && t.x <= bounds.maxX && t.y >= bounds.minY && t.y <= bounds.maxY)
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
  const { halfW, halfH, wallRise, playerBox } = DUNGEON_GEOMETRY;
  const wl = w.x - halfW, wr = w.x + halfW, wt = w.y - wallRise - halfH, wb = w.y + halfH;
  const pl = p.x - playerBox.left, pr = p.x + playerBox.right, pt = p.y - playerBox.top, pb = p.y + playerBox.bottom;
  const overlaps = wl < pr && wr > pl && wt < pb && wb > pt;
  return overlaps ? DUNGEON_FRONT_WALL_ALPHA : 1;
}

// Luzes que iluminam o escuro: jogador sempre, tochas do viewport (teto por DUNGEON_LIGHT).
export function collectDungeonLights({ things, camera, viewport, time, reducedMotion = false }) {
  const toScreen = t => {
    const p = projectTile(t.x, t.y), c = projectTile(camera.x, camera.y);
    return { x: p.x - c.x + viewport.width / 2, y: p.y - c.y + viewport.height / 2 };
  };
  const lights = [];
  for (const thing of things) {
    if (thing.type === 'player') {
      const s = toScreen(thing);
      lights.push({ x: s.x, y: s.y - 24, radius: DUNGEON_LIGHT.playerReachTiles * DUNGEON_LIGHT.pxPerTile, strength: 1 });
    } else if (thing.type === 'torch') {
      const s = toScreen({ x: thing.sortX, y: thing.sortY });
      const seed = thing.x * 1.7 + thing.y * 0.63;
      const flicker = reducedMotion ? 1 : 1 + DUNGEON_LIGHT.flicker * Math.sin(time * 7.3 + seed);
      lights.push({ x: s.x, y: s.y - 30, radius: DUNGEON_LIGHT.torchReachTiles * DUNGEON_LIGHT.pxPerTile * flicker, strength: 1 });
    }
  }
  return lights;
}

// Quadro da chama da tocha: 0 e 1 alternam; com movimento reduzido fica no 0.
export function torchFrame(time, reducedMotion = false, seed = 0) {
  if (reducedMotion) return 0;
  return Math.floor(time * 4 + seed) % 2;
}

// Cache limitado por chave (sprites). make() só roda quando a chave falta.
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
// art: { floor(variant), wall(mask), torch(frame), darken(ctx, lights, w, h) }.
// drawActor(ctx, thing, screen) desenha o jogador (o avatar é responsabilidade do chamador).
export function drawDungeonFrame(ctx, { grid, camera, viewport, player, time = 0, reducedMotion = false, art, drawActor }) {
  const bounds = visibleTileBounds(camera, viewport);
  const cam = projectTile(camera.x, camera.y);
  const screenOf = t => {
    const p = projectTile(t.x, t.y);
    return { x: p.x - cam.x + viewport.width / 2, y: p.y - cam.y + viewport.height / 2 };
  };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let y = Math.max(0, bounds.minY); y <= Math.min(grid.h - 1, bounds.maxY); y++) {
    for (let x = Math.max(0, bounds.minX); x <= Math.min(grid.w - 1, bounds.maxX); x++) {
      if (!isOpenCell(grid, x, y)) continue;
      const s = screenOf({ x: x + 0.5, y: y + 0.5 });
      ctx.drawImage(art.floor((x * 73856093 ^ y * 19349663) >>> 0), s.x - DUNGEON_GEOMETRY.halfW, s.y - DUNGEON_GEOMETRY.halfH);
    }
  }
  const things = collectDungeonThings({ grid, bounds, player });
  for (const thing of things) {
    ctx.globalAlpha = wallAlphaFor(thing, player);
    if (thing.type === 'wall') {
      const s = screenOf({ x: thing.sortX, y: thing.sortY });
      ctx.drawImage(art.wall(thing.mask), s.x - DUNGEON_GEOMETRY.halfW, s.y - DUNGEON_GEOMETRY.wallRise - DUNGEON_GEOMETRY.halfH);
    } else if (thing.type === 'torch') {
      const s = screenOf({ x: thing.sortX, y: thing.sortY });
      ctx.drawImage(art.torch(torchFrame(time, reducedMotion, thing.x + thing.y)), s.x - 8, s.y - 40);
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
