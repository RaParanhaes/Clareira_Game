import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, dungeonSideFor } from './dungeon-gen.mjs';
import { validateDungeonLevel } from './dungeon-contract.mjs';

// BFS na grade a partir da entrada: devolve a distância (ou -1) de cada célula.
function bfs(level) {
  const { w, h, cells, entrance } = level;
  const dist = new Int32Array(w * h).fill(-1);
  const start = entrance.y * w + entrance.x;
  const queue = [start];
  dist[start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % w, y = Math.floor(index / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || cells[ny * w + nx] !== 1) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[index] + 1;
      queue.push(ni);
    }
  }
  return { dist, reached: cell => dist[cell.y * w + cell.x] >= 0, far: Math.max(...dist) };
}

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 7919);

test('gera níveis que passam no contrato para 20 seeds', () => {
  for (const seed of SEEDS) for (const level of [1, 2, 3]) {
    const built = generateDungeon(seed, level);
    assert.doesNotThrow(() => validateDungeonLevel(built), `seed ${seed} nível ${level}`);
    assert.equal(built.w, dungeonSideFor(level));
    assert.equal(built.h, dungeonSideFor(level));
  }
});

test('entrada alcança por BFS todas as salas, a saída, a descida e o baú', () => {
  for (const seed of SEEDS) for (const level of [1, 2]) {
    const built = generateDungeon(seed, level);
    const { reached, dist, far } = bfs(built);
    const label = `seed ${seed} nível ${level}`;
    assert.ok(reached(built.exit), `saída inalcançável (${label})`);
    assert.ok(reached(built.down), `descida inalcançável (${label})`);
    assert.ok(reached(built.boss.chest), `baú inalcançável (${label})`);
    if (built.up) assert.ok(reached(built.up), `subida inalcançável (${label})`);
    for (const room of built.rooms) assert.ok(reached(room.point), `sala inalcançável (${label})`);
    assert.ok(dist[built.down.y * built.w + built.down.x] >= 0.6 * far, `descida perto demais (${label})`);
  }
});

test('mesma seed e nível dão a mesma grade (determinismo)', () => {
  const a = generateDungeon(4242, 2);
  const b = generateDungeon(4242, 2);
  assert.deepEqual(Buffer.from(a.cells), Buffer.from(b.cells));
  assert.deepEqual(a.torches, b.torches);
  assert.deepEqual(a.entrance, b.entrance);
  const c = generateDungeon(4243, 2);
  assert.notDeepEqual(Buffer.from(a.cells), Buffer.from(c.cells));
});

test('nível 1 não tem subida; níveis 2 e acima têm', () => {
  assert.equal(generateDungeon(7, 1).up, null);
  assert.ok(generateDungeon(7, 2).up);
});

test('a escada de saída e a de descida ficam em piso aberto, e a arena tem o baú', () => {
  const built = generateDungeon(99, 1);
  const { cells, w } = built;
  for (const stair of built.stairs) assert.equal(cells[stair.y * w + stair.x], 1);
  const { arena, chest } = built.boss;
  assert.ok(chest.x >= arena.x && chest.x < arena.x + arena.w && chest.y >= arena.y && chest.y < arena.y + arena.h);
});

test('gera em menos de 200 ms por nível (margem larga para máquinas lentas)', () => {
  const started = performance.now();
  generateDungeon(555, 3);
  assert.ok(performance.now() - started < 200);
});
