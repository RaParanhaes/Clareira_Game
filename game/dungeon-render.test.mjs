import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DUNGEON_FRONT_WALL_ALPHA, DUNGEON_GEOMETRY, DUNGEON_LIGHT, collectDungeonLights, collectDungeonThings, createSpriteCache,
  dungeonIndex, drawDungeonFrame, isOpenCell, projectTile, torchFrame, visibleTileBounds, wallAlphaFor, wallDrawOffset,
  wallFaceMask, wallVariant,
} from './dungeon-render.mjs';
import { createDungeonArt } from './dungeon-art.mjs';

// Gerador mock só para teste: grade determinística com borda de rocha, sala central e tochas.
// Não é o módulo de geração do servidor; serve para validar o renderer contra o contrato {w,h,cells,torches}.
export function mockLevel(seed = 1, w = 40, h = 40) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const cells = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) cells[y * w + x] = rnd() < 0.62 ? 1 : 0;
  }
  for (let y = 12; y < 22; y++) for (let x = 12; x < 24; x++) cells[y * w + x] = 1;
  const torches = [];
  for (let y = 1; y < h - 1 && torches.length < 40; y++) {
    for (let x = 1; x < w - 1 && torches.length < 40; x++) {
      if (!cells[y * w + x] && isOpenCell({ w, h, cells }, x, y + 1) && rnd() < 0.02) torches.push({ x, y });
    }
  }
  return { w, h, cells, torches };
}

// Grade pequena e explícita: piso total, com rochas nas posições dadas.
function gridWithRock(rocks = [[5, 5]], size = 12, torches = []) {
  const grid = { w: size, h: size, cells: new Uint8Array(size * size).fill(1), torches };
  for (const [x, y] of rocks) grid.cells[y * size + x] = 0;
  return grid;
}

// Canvas falso: registra criações e chamadas de desenho sem DOM.
function fakeCanvas(log) {
  return (w, h) => {
    log.created.push({ w, h });
    const calls = [];
    const ctx = {
      calls, globalAlpha: 1, imageSmoothingEnabled: true, fillStyle: '', globalCompositeOperation: 'source-over',
      save() {}, restore() {}, setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, fill() {},
      createRadialGradient() { return { addColorStop() {} }; },
      drawImage(img, x, y) { calls.push({ img, x, y, alpha: this.globalAlpha }); },
    };
    return { width: w, height: h, getContext: () => ctx, ctx };
  };
}

// Arte de teste: cada sprite é um marcador com a chave que o renderer pediu.
const tagArt = () => ({
  floor: v => ({ tag: 'floor', variant: v }),
  wall: m => ({ tag: 'wall', mask: m }),
  torch: f => ({ tag: 'torch', frame: f }),
  darken() {},
});

test('wall faces are exposed only toward open floor on the S and L sides', () => {
  const grid = gridWithRock([[5, 5], [5, 6], [6, 5], [6, 6]]);
  assert.equal(wallFaceMask(grid, 5, 5), 0, 'a rock whose S and L neighbours are rock has no visible face');
  assert.equal(wallFaceMask(grid, 6, 6), 3, 'the corner rock of the block shows S and L faces');
  assert.equal(wallFaceMask(grid, 0, 0), 0, 'open floor is never a wall');
  assert.equal(wallFaceMask(gridWithRock([[0, 0]]), 0, 0), 3, 'grid-corner rock with open neighbours shows both faces');
  assert.equal(wallFaceMask(gridWithRock([[11, 11]]), 11, 11), 0, 'out-of-grid counts as rock, so the grid edge must be closed');
  const index = dungeonIndex(grid);
  assert.ok(index.walls.some(w => w.x === 6 && w.y === 6 && w.mask === 3));
  assert.equal(index.walls.some(w => w.x === 5 && w.y === 5), false);
});

test('a wall behind the player draws before it and a wall in front draws after it', () => {
  const grid = gridWithRock([[5, 5]]);
  const bounds = { minX: 0, minY: 0, maxX: 11, maxY: 11 };
  const behind = collectDungeonThings({ grid, bounds, player: { x: 6.5, y: 6.5 } });
  assert.ok(behind.findIndex(t => t.type === 'wall') < behind.findIndex(t => t.type === 'player'),
    'wall at depth 11 sits behind a player at depth 13');
  const front = collectDungeonThings({ grid, bounds, player: { x: 4.5, y: 4.5 } });
  assert.ok(front.findIndex(t => t.type === 'wall') > front.findIndex(t => t.type === 'player'),
    'wall at depth 11 sits in front of a player at depth 9');
});

test('a front wall covering the body is translucent, while a far or behind wall stays opaque', () => {
  const near = { type: 'wall', sortX: 5.5, sortY: 5.5, sortZ: 0, sortId: 'near', mask: 3 };
  const far = { type: 'wall', sortX: 9.5, sortY: 4.5, sortZ: 0, sortId: 'far', mask: 3 };
  const behind = { type: 'wall', sortX: 3.5, sortY: 3.5, sortZ: 0, sortId: 'behind', mask: 3 };
  const player = { x: 4.5, y: 4.5 };
  assert.equal(wallAlphaFor(near, player), DUNGEON_FRONT_WALL_ALPHA, 'front wall over the body is translucent');
  assert.equal(wallAlphaFor(far, player), 1, 'front wall that does not cover the body stays opaque');
  assert.equal(wallAlphaFor(behind, player), 1, 'wall behind the player is never translucent');
  assert.equal(wallAlphaFor({ type: 'torch', sortX: 5.5, sortY: 5.5, sortZ: 0 }, player), 1);
});

test('drawDungeonFrame makes only the covering front wall translucent and draws it after the player', () => {
  const grid = gridWithRock([[5, 5], [9, 4], [3, 3]]);
  const ctx = fakeCanvas({ created: [] })(1, 1).ctx;
  const player = { x: 4.5, y: 4.5 };
  const viewport = { width: 400, height: 300 };
  drawDungeonFrame(ctx, {
    grid, camera: player, viewport, player, art: tagArt(),
    drawActor: c => c.calls.push({ actor: true, alpha: c.globalAlpha }),
  });
  const walls = ctx.calls.filter(c => c.img?.tag === 'wall');
  assert.equal(walls.length, 3, 'the three rock cells with visible faces are drawn');
  const cam = projectTile(player.x, player.y), target = projectTile(5.5, 5.5);
  // Compara x e y: (3,3) e (5,5) têm a mesma coluna na tela.
  const nearX = target.x - cam.x + viewport.width / 2 - DUNGEON_GEOMETRY.halfW;
  const nearY = target.y - cam.y + viewport.height / 2 + wallDrawOffset().dy;
  const near = walls.find(c => c.x === nearX && c.y === nearY);
  assert.ok(near, 'the wall at (5,5) is drawn at its projected position');
  assert.equal(near.alpha, DUNGEON_FRONT_WALL_ALPHA);
  assert.equal(walls.filter(c => c.alpha === DUNGEON_FRONT_WALL_ALPHA).length, 1, 'only one wall is translucent');
  const actor = ctx.calls.find(c => c.actor);
  assert.equal(actor.alpha, 1, 'the player is never drawn translucent');
  assert.ok(ctx.calls.indexOf(near) > ctx.calls.indexOf(actor), 'the front wall is drawn after the player');
});

test('sprite cache builds each key once, evicts the oldest entry and reuses art sprites', () => {
  let made = 0;
  const cache = createSpriteCache(2);
  const make = () => { made++; return { made }; };
  const a = cache.get('a', make);
  assert.equal(cache.get('a', make), a);
  cache.get('b', make);
  cache.get('c', make);
  assert.equal(made, 3, 'a is evicted when the limit is reached');
  cache.get('a', make);
  assert.equal(made, 4, 'asking for an evicted key rebuilds it');

  const log = { created: [] };
  const art = createDungeonArt({ createCanvas: fakeCanvas(log) });
  const w3 = art.wall(3);
  assert.equal(art.wall(3), w3, 'the same mask returns the same canvas');
  assert.equal(art.wall(1) === w3, false, 'different masks are different sprites');
  art.floor(0); art.floor(0);
  assert.equal(log.created.length, 3, 'wall(3), wall(1) and floor(0) are each built once');
  assert.equal(art.floor(3), art.floor(0), 'floor variants wrap by palette length');
});

test('the wall index is computed once per grid and recomputed for a new grid', () => {
  const grid = mockLevel(7);
  const first = dungeonIndex(grid);
  assert.equal(dungeonIndex(grid), first);
  assert.notEqual(dungeonIndex(mockLevel(7)), first);
});

test('the view culls tiles outside the viewport, including far walls and torches', () => {
  const grid = gridWithRock([[5, 5], [30, 30]], 40, [{ x: 30, y: 31 }, { x: 5, y: 6 }]);
  const bounds = visibleTileBounds({ x: 5, y: 5 }, { width: 300, height: 200 }, 0);
  assert.ok(bounds.minX <= 5 && bounds.maxX >= 5 && bounds.minY <= 5 && bounds.maxY >= 5, 'the camera tile is inside');
  assert.ok(bounds.maxX < 30 && bounds.maxY < 30, 'the far rock at 30,30 is outside');
  const things = collectDungeonThings({ grid, bounds, player: { x: 5, y: 5 } });
  assert.equal(things.some(t => t.x === 30), false);
  assert.equal(things.some(t => t.type === 'torch' && t.x === 5), true, 'nearby torch is kept');
});

test('visible torches are capped and the player always has a full-reach light', () => {
  const torches = Array.from({ length: 30 }, (_, i) => ({ x: 5 + (i % 6), y: 5 + Math.floor(i / 6) }));
  const grid = gridWithRock([], 40, torches);
  const things = collectDungeonThings({ grid, bounds: { minX: 0, minY: 0, maxX: 39, maxY: 39 }, player: { x: 5, y: 5 } });
  assert.equal(things.filter(t => t.type === 'torch').length, DUNGEON_LIGHT.maxTorches, 'the torch list is capped');
  const lights = collectDungeonLights({ things, camera: { x: 5, y: 5 }, viewport: { width: 400, height: 300 }, time: 0 });
  assert.equal(lights.length, DUNGEON_LIGHT.maxTorches + 1);
  const full = DUNGEON_LIGHT.playerReachTiles * DUNGEON_LIGHT.pxPerTile;
  assert.ok(lights.some(l => l.radius === full), 'player light has the full reach');
});

test('torch flame alternates in two frames and holds still with reduced motion', () => {
  const frames = Array.from({ length: 8 }, (_, i) => torchFrame(i * 0.25));
  assert.ok(frames.includes(0) && frames.includes(1), 'the flame alternates');
  assert.ok(Array.from({ length: 8 }, (_, i) => torchFrame(i * 0.25, true)).every(f => f === 0), 'reduced motion holds frame 0');
});

test('rock height varies per tile, deterministically, and stays inside the sprite', () => {
  const lifts = new Set();
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
    const v = wallVariant(x, y);
    assert.deepEqual(wallVariant(x, y), v, 'same tile, same rock');
    assert.ok(v.lift >= 0 && v.lift <= DUNGEON_GEOMETRY.wallLiftMax);
    assert.ok(v.shape >= 0 && v.shape < 4);
    lifts.add(v.lift);
  }
  assert.ok(lifts.size >= 4, 'tiles get several different heights');
  const art = createDungeonArt({ createCanvas: fakeCanvas({ created: [] }) });
  assert.notEqual(art.wall(3, { lift: 0, shape: 0 }), art.wall(3, { lift: 2, shape: 0 }), 'different heights are different sprites');
  assert.equal(art.wall(3, { lift: 2, shape: 1 }), art.wall(3, { lift: 2, shape: 1 }), 'the same variant is reused from cache');
});

test('ambient darkness keeps about 20 to 30 percent of the room readable', () => {
  const visible = 1 - DUNGEON_LIGHT.veilAlpha;
  assert.ok(visible >= 0.2 && visible <= 0.3, `visibility ${visible}`);
});

test('torch light is warm and stronger than the player light, which is neutral', () => {
  const torches = [{ x: 5, y: 6 }];
  const grid = gridWithRock([], 12, torches);
  const things = collectDungeonThings({ grid, bounds: { minX: 0, minY: 0, maxX: 11, maxY: 11 }, player: { x: 5, y: 5 } });
  const lights = collectDungeonLights({ things, camera: { x: 5, y: 5 }, viewport: { width: 400, height: 300 }, time: 1 });
  const torch = lights.find(l => l.warm), player = lights.find(l => !l.warm);
  assert.ok(torch && player, 'one warm light and one neutral light');
  assert.ok(torch.strength > player.strength, 'torch cuts more darkness than the player');
  const still = collectDungeonLights({ things, camera: { x: 5, y: 5 }, viewport: { width: 400, height: 300 }, time: 9, reducedMotion: true });
  assert.equal(still.find(l => l.warm).radius, DUNGEON_LIGHT.torchReachTiles * DUNGEON_LIGHT.pxPerTile, 'reduced motion keeps the torch radius fixed');
  const wobble = Math.abs(torch.radius / (DUNGEON_LIGHT.torchReachTiles * DUNGEON_LIGHT.pxPerTile) - 1);
  assert.ok(wobble <= DUNGEON_LIGHT.flicker + 1e-9, 'the torch varies only a little');
});

test('mock level is deterministic and keeps torches on rock with open floor below', () => {
  const a = mockLevel(3), b = mockLevel(3);
  assert.deepEqual(Array.from(a.cells), Array.from(b.cells));
  assert.ok(a.torches.length > 0);
  for (const t of a.torches) {
    assert.equal(isOpenCell(a, t.x, t.y), false);
    assert.equal(isOpenCell(a, t.x, t.y + 1), true);
  }
});
