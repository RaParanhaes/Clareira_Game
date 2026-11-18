// Gerador puro e determinístico do labirinto da masmorra do Covil do Ninho.
// Mesma seed e mesmo nível dão a mesma grade, no servidor e no navegador. Sem DOM, sem Math.random, sem Date.
//
// Saída: o formato de dungeon-contract.mjs (w, h, cells, seed, torches, stairs, entrance), mais campos extras
// que o servidor usa: level, exit, up (null no nível 1), down, rooms, boss {arena, center, chest}.
//
// Passos (ARQUITETURA.md §2):
//   1. BSP até folhas de 12 a 24 tiles (divisões entre 35% e 65% do lado).
//   2. Cada folha vira sala, câmara-labirinto (~25%) ou arena do chefe (a mais distante da entrada).
//   3. Cada divisão liga uma sala de cada lado por corredor em L de 2 tiles (conexo por construção).
//   4. 15% das divisões ganham um segundo corredor (laço).
//   5. Becos: nichos de 2 tiles de largura e 3 de profundidade, sem ligar a outro piso.
//   6. Tochas na parede de cima das salas, a cada ~9 tiles.
// Conferência: BFS da entrada até as escadas, o baú e todas as salas; a descida fica longe o bastante.
// Se falhar, tenta outra variante (salt) até 8 vezes; se ainda falhar, usa um gabarito fixo.
import { validateDungeonLevel } from './dungeon-contract.mjs';

export const DUNGEON_GEN_VERSION = 1;
const BSP_LEAF_MAX = 24;
const BSP_LEAF_MIN = 12;
const MAZE_CHANCE = 0.25;
const LOOP_CHANCE = 0.15;
const NICHE_TARGET = 3;
const TORCH_SPACING = 9;
const MAX_ATTEMPTS = 8;
const DOWN_MIN_RATIO = 0.6;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Lado da grade por nível: 88, 104, 120, ... até 160.
export function dungeonSideFor(level) {
  return Math.min(160, 72 + 16 * Math.max(1, Math.floor(level)));
}

function hash32(values) {
  let h = 0x811c9dc5;
  for (const value of values) {
    h = Math.imul(h ^ (value >>> 0), 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

// mulberry32: PRNG pequeno e determinístico.
function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function leafNode(rect, leaves) {
  const leaf = { leaf: true, rect, kind: 'room', point: null, room: null };
  leaves.push(leaf);
  return leaf;
}

function buildVariant(seed, level, attempt) {
  const size = dungeonSideFor(level);
  const w = size, h = size;
  const rand = createRandom(hash32([seed, level, DUNGEON_GEN_VERSION, attempt]));
  const cells = new Uint8Array(w * h);
  const inside = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1;
  const carve = (x, y) => { if (inside(x, y)) cells[y * w + x] = 1; };
  const isOpen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] === 1;
  const isRock = (x, y) => !isOpen(x, y);

  // 1. BSP
  const leaves = [];
  const build = rect => {
    if (rect.w <= BSP_LEAF_MAX && rect.h <= BSP_LEAF_MAX) return leafNode(rect, leaves);
    const splitX = rect.w > BSP_LEAF_MAX && rect.h > BSP_LEAF_MAX ? rand() < 0.5 : rect.w > BSP_LEAF_MAX;
    const span = splitX ? rect.w : rect.h;
    if (span < 2 * BSP_LEAF_MIN) return leafNode(rect, leaves);
    const frac = 0.35 + 0.3 * rand();
    const cut = Math.min(span - BSP_LEAF_MIN, Math.max(BSP_LEAF_MIN, Math.round(span * frac)));
    const a = splitX ? { x: rect.x, y: rect.y, w: cut, h: rect.h } : { x: rect.x, y: rect.y, w: rect.w, h: cut };
    const b = splitX ? { x: rect.x + cut, y: rect.y, w: span - cut, h: rect.h } : { x: rect.x, y: rect.y + cut, w: rect.w, h: span - cut };
    return { left: build(a), right: build(b) };
  };
  const tree = build({ x: 1, y: 1, w: w - 2, h: h - 2 });
  if (leaves.length < 3) return null;

  // 2. Papéis: sala inicial = folha menor; arena = folha mais distante dela; o resto vira sala ou labirinto.
  const center = rect => ({ x: rect.x + Math.floor(rect.w / 2), y: rect.y + Math.floor(rect.h / 2) });
  const start = leaves.reduce((best, leaf) => (leaf.rect.w * leaf.rect.h < best.rect.w * best.rect.h ? leaf : best));
  const startCenter = center(start.rect);
  let arenaLeaf = null, arenaDistance = -1;
  for (const leaf of leaves) {
    if (leaf === start) continue;
    const c = center(leaf.rect);
    const d = (c.x - startCenter.x) ** 2 + (c.y - startCenter.y) ** 2;
    if (d > arenaDistance) { arenaDistance = d; arenaLeaf = leaf; }
  }
  start.kind = 'start';
  arenaLeaf.kind = 'arena';
  for (const leaf of leaves) if (leaf.kind === 'room' && rand() < MAZE_CHANCE) leaf.kind = 'maze';

  const rooms = [];
  for (const leaf of leaves) {
    const r = leaf.rect;
    if (leaf.kind === 'maze') {
      // Labirinto perfeito em passo 3: célula de 2x2 tiles, parede de 1 tile, passagem de 2 tiles.
      const nx = Math.floor((r.w - 1) / 3), ny = Math.floor((r.h - 1) / 3);
      const node = (i, j) => ({ x: r.x + 1 + 3 * i, y: r.y + 1 + 3 * j });
      const block = p => { carve(p.x, p.y); carve(p.x + 1, p.y); carve(p.x, p.y + 1); carve(p.x + 1, p.y + 1); };
      const seen = new Set(['0,0']);
      const stack = [[0, 0]];
      block(node(0, 0));
      while (stack.length) {
        const [i, j] = stack[stack.length - 1];
        const options = DIRS.filter(([di, dj]) => {
          const ni = i + di, nj = j + dj;
          return ni >= 0 && nj >= 0 && ni < nx && nj < ny && !seen.has(`${ni},${nj}`);
        });
        if (!options.length) { stack.pop(); continue; }
        const [di, dj] = options[Math.floor(rand() * options.length)];
        const ni = i + di, nj = j + dj;
        seen.add(`${ni},${nj}`);
        const from = node(i, j), to = node(ni, nj);
        block(to);
        if (di !== 0) {
          const gx = di > 0 ? from.x + 2 : to.x + 2;
          carve(gx, from.y); carve(gx, from.y + 1);
        } else {
          const gy = dj > 0 ? from.y + 2 : to.y + 2;
          carve(from.x, gy); carve(from.x + 1, gy);
        }
        stack.push([ni, nj]);
      }
      leaf.point = node(0, 0);
      rooms.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind: 'maze', point: leaf.point });
    } else {
      const room = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 };
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) carve(x, y);
      leaf.room = room;
      leaf.point = center(room);
      rooms.push({ ...room, kind: leaf.kind, point: leaf.point });
    }
  }

  // 3 e 4. Corredores de 2 tiles entre as duas metades de cada divisão, e laços.
  const corridor = (a, b) => {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    for (let x = x0; x <= x1 + 1; x++) { carve(x, a.y); carve(x, a.y + 1); }
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (let y = y0; y <= y1 + 1; y++) { carve(b.x, y); carve(b.x + 1, y); }
  };
  const pick = node => {
    if (node.leaf) return node;
    return rand() < 0.5 ? pick(node.left) : pick(node.right);
  };
  const connect = node => {
    if (node.leaf) return;
    connect(node.left);
    connect(node.right);
    corridor(pick(node.left).point, pick(node.right).point);
    if (rand() < LOOP_CHANCE) corridor(pick(node.left).point, pick(node.right).point);
  };
  connect(tree);

  // Arena do chefe: sala inteira, mesmo que a folha tenha sido cortada pelo corredor.
  const ar = arenaLeaf.room;
  const arenaCenter = arenaLeaf.point;

  // 5. Becos: nichos de 2 tiles de largura e 3 de profundidade, com rocha em volta exceto a boca.
  let niches = 0;
  for (let attempt2 = 0; attempt2 < 400 && niches < NICHE_TARGET; attempt2++) {
    const ax = 2 + Math.floor(rand() * (w - 4)), ay = 2 + Math.floor(rand() * (h - 4));
    const [dx, dy] = DIRS[Math.floor(rand() * 4)];
    const px = -dy, py = dx;
    const at = (depth, lat) => ({ x: ax + dx * depth + px * lat, y: ay + dy * depth + py * lat });
    const mouth0 = at(0, 0), mouth1 = at(0, 1);
    if (!isOpen(mouth0.x, mouth0.y) || !isOpen(mouth1.x, mouth1.y)) continue;
    if (isOpen(at(1, 0).x, at(1, 0).y) || isOpen(at(1, 1).x, at(1, 1).y)) continue;
    const tiles = [];
    for (let depth = 1; depth <= 3; depth++) for (let lat = 0; lat <= 1; lat++) tiles.push(at(depth, lat));
    if (tiles.some(t => !inside(t.x, t.y) || isOpen(t.x, t.y))) continue;
    const niche = new Set(tiles.map(t => `${t.x},${t.y}`));
    const mouths = new Set([`${mouth0.x},${mouth0.y}`, `${mouth1.x},${mouth1.y}`]);
    const ringOk = tiles.every(t => DIRS.every(([ex, ey]) => {
      const nx = t.x + ex, ny = t.y + ey;
      const k = `${nx},${ny}`;
      return niche.has(k) || mouths.has(k) || isRock(nx, ny);
    }));
    if (!ringOk) continue;
    for (const t of tiles) carve(t.x, t.y);
    niches++;
  }

  // Escadas: saída e subida na sala inicial; descida no canto de trás da arena.
  const sr = start.room;
  const entrance = center(sr);
  const exit = { x: sr.x, y: sr.y };
  const up = level >= 2 ? { x: sr.x + sr.w - 1, y: sr.y } : null;
  const down = { x: ar.x + ar.w - 1, y: ar.y + ar.h - 1 };
  const chest = { x: arenaCenter.x, y: ar.y };

  // 6. Tochas: na parede de cima das salas (não nos labirintos), cada ~9 tiles.
  const torches = [];
  for (const room of rooms) {
    if (room.kind === 'maze') continue;
    const offset = Math.floor(rand() * TORCH_SPACING);
    for (let x = room.x + 2 + offset; x < room.x + room.w - 2; x += TORCH_SPACING) {
      const ty = room.y - 1;
      if (ty < 1 || !isRock(x, ty) || !isOpen(x, ty + 1)) continue;
      torches.push({ x, y: ty });
    }
  }

  // Conferência: BFS da entrada até tudo que importa, e descida longe o bastante.
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [entrance.y * w + entrance.x];
  dist[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % w, y = (index - x) / w;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!isOpen(nx, ny)) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[index] + 1;
      queue.push(ni);
    }
  }
  const reached = p => dist[p.y * w + p.x] >= 0;
  const mustReach = [exit, down, chest, ...(up ? [up] : []), ...rooms.map(room => room.point)];
  if (!mustReach.every(reached)) return null;
  let far = 0;
  for (const index of queue) far = Math.max(far, dist[index]);
  if (dist[down.y * w + down.x] < DOWN_MIN_RATIO * far) return null;

  return {
    w, h, cells, seed, torches,
    stairs: [exit, ...(up ? [up] : []), down],
    entrance, level, exit, up, down, rooms,
    boss: { arena: { x: ar.x, y: ar.y, w: ar.w, h: ar.h }, center: arenaCenter, chest },
    spawners: [],
  };
}

// Gabarito fixo: um salão aberto com as escadas nos cantos. Só usado se as variantes falharem.
function fallbackLevel(seed, level) {
  const size = dungeonSideFor(level);
  const w = size, h = size;
  const cells = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) cells[y * w + x] = 1;
  const entrance = { x: 4, y: 4 };
  const exit = { x: 3, y: 3 };
  const up = level >= 2 ? { x: 3, y: 5 } : null;
  const down = { x: w - 4, y: h - 4 };
  const chest = { x: Math.floor(w / 2), y: 2 };
  const center = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
  const arena = { x: 1, y: 1, w: w - 2, h: h - 2 };
  return {
    w, h, cells, seed, torches: [],
    stairs: [exit, ...(up ? [up] : []), down],
    entrance, level, exit, up, down,
    rooms: [{ ...arena, kind: 'arena', point: center }],
    boss: { arena, center, chest },
    spawners: [],
  };
}

// Gera o nível. Devolve o nível validado pelo contrato; lança Error só se o contrato for quebrado.
export function generateDungeon(seed, level = 1) {
  const n = Math.max(1, Math.floor(level));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = buildVariant(seed, n, attempt);
    if (built) return validateDungeonLevel(built);
  }
  return validateDungeonLevel(fallbackLevel(seed, n));
}
