import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DUNGEON_FLOOR_IDS, DUNGEON_FRONT_WALL_ALPHA, DUNGEON_GEOMETRY, DUNGEON_LIGHT, DUNGEON_TORCH_FRAMES, collectDungeonLights,
  collectDungeonThings, createSpriteCache, dungeonIndex, drawDungeonFrame, floorTileId, isOpenCell, projectTile, propTileId,
  torchFrame, visibleTileBounds, wallAlphaFor, wallDrawOffset, wallFaceMask, wallPiece,
} from './dungeon-render.mjs';
import { createDungeonArt } from './dungeon-art.mjs';
import { loadDungeonTileset } from './dungeon-tileset.mjs';
import { dungeonFixtureLevel, validateDungeonLevel } from './dungeon-contract.mjs';

const manifestUrl = new URL('./art/dungeon/manifest.json', import.meta.url);
const readManifest = async () => JSON.parse(await readFile(manifestUrl, 'utf8'));

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
  // Sala central é o ponto de entrada; o nível passa no contrato (borda fechada, tochas sobre rocha com piso abaixo).
  return validateDungeonLevel({ w, h, cells, torches, seed, entrance: { x: 16, y: 16 } });
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
      translate() {}, scale() {},
      createRadialGradient() { return { addColorStop() {} }; },
      drawImage(img, x, y) { calls.push({ img, x, y, alpha: this.globalAlpha }); },
    };
    return { width: w, height: h, getContext: () => ctx, ctx };
  };
}

// Tileset falso com as dimensões declaradas no manifest real.
async function fakeTileset() {
  const manifest = await readManifest();
  return new Map(manifest.artefatos.map(a => [a.id, { id: a.id, width: a.tamanho.largura, height: a.tamanho.altura }]));
}

// Arte de teste: cada sprite é um marcador com a chave que o renderer pediu.
const tagArt = () => ({
  floor: id => ({ tag: 'floor', id }),
  wall: spec => ({ tag: 'wall', id: spec.id, flip: spec.flip }),
  prop: id => ({ tag: 'prop', id }),
  torch: frame => ({ tag: 'torch', frame }),
  darken() {},
});

test('wall faces are exposed only toward open floor on the S and L sides', () => {
  const grid = gridWithRock([[5, 5], [5, 6], [6, 5], [6, 6]]);
  assert.equal(wallFaceMask(grid, 5, 5), 0, 'a rock whose S and L neighbours are rock has no visible face');
  assert.equal(wallFaceMask(grid, 6, 6), 3, 'the corner rock of the block shows S and L faces');
  assert.equal(wallFaceMask(grid, 0, 0), 0, 'open floor is never a wall');
  assert.equal(wallFaceMask(gridWithRock([[0, 0]]), 0, 0), 3, 'grid-corner rock with open neighbours shows both faces');
  assert.equal(wallFaceMask(gridWithRock([[11, 11]]), 11, 11), 0, 'out-of-grid counts as rock, so the grid edge must be closed');
  const walls = dungeonIndex(grid).chunks.flat().filter(t => t.type === 'wall');
  assert.ok(walls.some(w => w.x === 6 && w.y === 6 && w.mask === 3));
  assert.equal(walls.some(w => w.x === 5 && w.y === 5), false);
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
  const offset = wallDrawOffset();
  const nearX = target.x - cam.x + viewport.width / 2 + offset.dx;
  const nearY = target.y - cam.y + viewport.height / 2 + offset.dy;
  const near = walls.find(c => c.x === nearX && c.y === nearY);
  assert.ok(near, 'the wall at (5,5) is drawn at its projected position');
  assert.equal(near.alpha, DUNGEON_FRONT_WALL_ALPHA);
  assert.equal(walls.filter(c => c.alpha === DUNGEON_FRONT_WALL_ALPHA).length, 1, 'only one wall is translucent');
  const actor = ctx.calls.find(c => c.actor);
  assert.equal(actor.alpha, 1, 'the player is never drawn translucent');
  assert.ok(ctx.calls.indexOf(near) > ctx.calls.indexOf(actor), 'the front wall is drawn after the player');
});

test('sprite cache builds each key once and evicts the oldest entry', () => {
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
});

test('the art module serves tileset sprites by id and mirrors a flipped wall once', async () => {
  const tileset = await fakeTileset();
  const log = { created: [] };
  const art = createDungeonArt({ createCanvas: fakeCanvas(log), tileset });
  assert.equal(art.floor('piso-terra'), tileset.get('piso-terra'), 'floor is the tileset image itself');
  assert.equal(art.prop('estalagmite-2'), tileset.get('estalagmite-2'));
  assert.equal(art.torch(2), tileset.get('tocha-frame-3'), 'torch frame n is tocha-frame-(n+1)');
  assert.equal(art.wall({ id: 'parede-alta-a', flip: false }), tileset.get('parede-alta-a'), 'unflipped wall is the tileset image');
  const mirror = art.wall({ id: 'parede-alta-a', flip: true });
  assert.equal(art.wall({ id: 'parede-alta-a', flip: true }), mirror, 'the mirror is cached');
  assert.equal(log.created.length, 1, 'only the mirror creates a canvas');
  assert.deepEqual(log.created[0], { w: 96, h: 72 }, 'the mirror keeps the sprite size');
  assert.throws(() => art.floor('piso-inexistente'), /sprite ausente/, 'a missing sprite fails loudly');
  assert.throws(() => createDungeonArt({ createCanvas: fakeCanvas(log), tileset: {} }), /Map/);
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

test('torch flame cycles through the four tileset frames and holds frame 0 with reduced motion', () => {
  assert.equal(DUNGEON_TORCH_FRAMES, 4);
  const seen = new Set(Array.from({ length: 40 }, (_, i) => torchFrame(i / 12)));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3], 'all four frames appear over time');
  assert.ok(Array.from({ length: 8 }, (_, i) => torchFrame(i * 0.25, true)).every(f => f === 0), 'reduced motion holds frame 0');
  assert.notEqual(torchFrame(1, false, 0), torchFrame(1, false, 1), 'neighbouring torches are out of step');
});

test('wall pieces: corners for two faces, straight pieces for one face, mirrored for the L face', () => {
  assert.equal(wallPiece(0, 4, 4), null, 'no face, no piece');
  for (let i = 0; i < 40; i++) {
    const corner = wallPiece(3, i, 2);
    assert.ok(corner.id === 'canto-alto' || corner.id === 'canto-baixo', corner.id);
    assert.equal(corner.flip, false);
    const s = wallPiece(1, i, 2), l = wallPiece(2, i, 2);
    assert.match(s.id, /^parede-(alta|baixa)-[abc]$/);
    assert.equal(s.flip, false, 'face S uses the piece as drawn');
    assert.equal(l.flip, true, 'face L is the mirror of the piece');
    assert.equal(wallPiece(1, i, 2).id, s.id, 'the same tile always gets the same piece');
  }
  const heights = new Set(Array.from({ length: 200 }, (_, i) => wallPiece(1, i, 7).id.split('-')[1]));
  assert.deepEqual([...heights].sort(), ['alta', 'baixa'], 'both heights appear across the level');
});

test('every sprite id the renderer asks for exists in the tileset manifest', async () => {
  const manifest = await readManifest();
  const ids = new Set(manifest.artefatos.map(a => a.id));
  for (const id of DUNGEON_FLOOR_IDS) assert.ok(ids.has(id), id);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const piece = wallPiece(1 + ((x + y) % 3), x, y, 5);
    if (piece) assert.ok(ids.has(piece.id), piece.id);
    const prop = propTileId(x, y, 5);
    if (prop) assert.ok(ids.has(prop), prop);
  }
  for (let f = 0; f < DUNGEON_TORCH_FRAMES; f++) assert.ok(ids.has(`tocha-frame-${f + 1}`));
});

test('manifest pivots and sizes match the renderer anchors', async () => {
  const manifest = await readManifest();
  const G = DUNGEON_GEOMETRY;
  for (const a of manifest.artefatos) {
    const expect = {
      piso: { pivot: G.floorAnchor },
      parede: { pivot: G.wallAnchor, size: G.wallSize },
      'parede-canto': { pivot: G.wallAnchor, size: G.wallSize },
      estalagmite: { pivot: G.propAnchor },
      tocha: { pivot: G.torchAnchor },
      'tocha-frame': { pivot: G.torchAnchor },
    }[a.tipo];
    if (!expect) continue;
    assert.deepEqual(a.pivo_contato, { x: expect.pivot.x, y: expect.pivot.y }, `${a.id} pivot`);
    if (expect.size) assert.deepEqual({ w: a.tamanho.largura, h: a.tamanho.altura }, expect.size, `${a.id} size`);
  }
});

test('floor materials mix in soft patches with no checkerboard and rare puddles', () => {
  const counts = {};
  let equalRight = 0, pairs = 0, checker = 0, total = 0;
  for (const seed of [11, 3]) {
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
      const id = floorTileId(x, y, seed);
      assert.equal(floorTileId(x, y, seed), id, 'same seed, same floor');
      counts[id] = (counts[id] || 0) + 1; total++;
      if (x < 79) { pairs++; if (floorTileId(x + 1, y, seed) === id) equalRight++; }
      if (x < 79 && y < 79 && floorTileId(x + 1, y, seed) !== id && floorTileId(x, y + 1, seed) !== id
        && floorTileId(x + 1, y + 1, seed) === id) checker++;
    }
  }
  assert.deepEqual(Object.keys(counts).sort(), [...DUNGEON_FLOOR_IDS].sort(), 'all four materials appear');
  assert.ok(counts['piso-poca'] / total < 0.06, 'puddles are rare');
  assert.ok(equalRight / pairs > 0.5, 'neighbours mostly share a material, in patches');
  assert.ok(checker / total < 0.05, 'no checkerboard pattern');
  let differs = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (floorTileId(x, y, 11) !== floorTileId(x, y, 3)) differs++;
  assert.ok(differs > 200, 'a different seed gives a different map');
});

test('stalagmites are decoration on floor, never on puddles, and deterministic', () => {
  let props = 0;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const id = propTileId(x, y, 4);
    assert.equal(propTileId(x, y, 4), id);
    if (id) {
      props++;
      assert.notEqual(floorTileId(x, y, 4), 'piso-poca');
      assert.match(id, /^estalagmite-[123]$/);
    }
  }
  assert.ok(props > 0 && props < (60 * 60) / 8, 'a few stalagmites, not a forest');
});

test('loadDungeonTileset reads the manifest and loads every sprite into a map', async () => {
  const manifest = await readManifest();
  const requested = [];
  const tileset = await loadDungeonTileset({
    baseUrl: 'https://exemplo.test/art/dungeon/',
    fetchJson: async url => { requested.push(url); return manifest; },
    loadImage: async url => ({ url }),
  });
  assert.equal(requested[0], 'https://exemplo.test/art/dungeon/manifest.json');
  assert.equal(tileset.size, manifest.artefatos.length);
  assert.equal(tileset.get('parede-alta-b').url, 'https://exemplo.test/art/dungeon/parede-alta-b.png');
  await assert.rejects(
    loadDungeonTileset({ baseUrl: 'https://exemplo.test/', fetchJson: async () => ({}), loadImage: async () => ({}) }),
    /sem lista de artefatos/,
  );
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

test('every draw position is a whole pixel, even with a fractional camera and an odd viewport', () => {
  const grid = gridWithRock([[5, 5], [9, 4], [4, 3]], 20, [{ x: 4, y: 3 }]);
  const ctx = fakeCanvas({ created: [] })(1, 1).ctx;
  const player = { x: 6.37, y: 7.81 };
  let actorScreen = null;
  drawDungeonFrame(ctx, {
    grid, camera: { x: 6.37, y: 7.81 }, viewport: { width: 401, height: 301 }, player, time: 1.5, art: tagArt(),
    drawActor: (c, t, s) => { actorScreen = s; },
  });
  const tags = new Set(ctx.calls.map(c => c.img.tag));
  for (const tag of ['floor', 'wall', 'torch']) assert.ok(tags.has(tag), `${tag} is drawn in this frame`);
  for (const c of ctx.calls) assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y), `${c.img.tag} at ${c.x},${c.y}`);
  assert.ok(Number.isInteger(actorScreen.x) && Number.isInteger(actorScreen.y), 'the actor is placed on whole pixels');
  const raw = projectTile(6.37, 7.81);
  assert.ok(!Number.isInteger(raw.x), 'the camera really is fractional, so rounding is what makes the positions whole');
});

test('per-frame work follows the view size, not the level size', () => {
  const viewport = { width: 400, height: 300 };
  const frame = (size, camera) => {
    const grid = mockLevel(5, size, size);
    const ctx = fakeCanvas({ created: [] })(1, 1).ctx;
    return drawDungeonFrame(ctx, { grid, camera, viewport, player: camera, art: tagArt() });
  };
  const small = frame(120, { x: 60, y: 60 });
  const big = frame(480, { x: 60, y: 60 });
  const far = frame(480, { x: 400, y: 400 });
  assert.equal(big.visitedCells, small.visitedCells, 'same view in a 4x larger level visits the same cells');
  assert.equal(far.visitedCells, small.visitedCells, 'moving the camera in open space keeps the count');
  assert.ok(small.visitedCells < 120 * 120 / 4, `visited ${small.visitedCells} cells of ${120 * 120}`);
  const totalChunks = Math.ceil(480 / 16) ** 2;
  assert.ok(big.visitedChunks < totalChunks / 8, `visited ${big.visitedChunks} of ${totalChunks} chunks`);
});

test('the floor id per cell is computed once into a Uint8Array in the index', () => {
  const grid = mockLevel(9, 50, 50);
  const index = dungeonIndex(grid);
  assert.ok(index.floor instanceof Uint8Array);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const v = index.floor[y * 50 + x];
    if (isOpenCell(grid, x, y)) assert.equal(DUNGEON_FLOOR_IDS[v], floorTileId(x, y, 9), `cell ${x},${y}`);
    else assert.equal(v, 255, `rock ${x},${y}`);
  }
});

test('the test level and the contract fixture pass validateDungeonLevel', () => {
  assert.doesNotThrow(() => validateDungeonLevel(mockLevel(4)));
  const fixture = dungeonFixtureLevel();
  assert.equal(validateDungeonLevel(fixture), fixture);
  const ctx = fakeCanvas({ created: [] })(1, 1).ctx;
  const camera = { x: 4, y: 3 };
  const result = drawDungeonFrame(ctx, { grid: fixture, camera, viewport: { width: 300, height: 200 }, player: camera, art: tagArt() });
  assert.ok(result.visitedCells > 0 && ctx.calls.length > 0, 'the fixture renders');
});
