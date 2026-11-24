import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from './dungeon-gen.mjs';
import { WILDLIFE_BY_ID } from './wildlife.mjs';
import {
  DUNGEON_BANDS, DUNGEON_RULES, DUNGEON_SPECIES, BOSSES, bandOfLevel, bossFor,
  scaleSpecies, dropsFor, groupOf, planDungeonSpawns, planRespawn,
  speciesIdsForLevel, dungeonWildlifeDefinition,
} from './dungeon-bestiary.mjs';

const SEEDS = [0x4e494e48, 0x4e494e48 + 7919, 0x4e494e48 + 2 * 7919];
const MIN = 60 * 1000;
function distancesFrom(dungeon, origin) {
  const distances = new Map([[`${origin.x},${origin.y}`, 0]]);
  const queue = [origin];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], d = distances.get(`${p.x},${p.y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h || dungeon.cells[y * dungeon.w + x] !== 1 || distances.has(key)) continue;
      distances.set(key, d + 1); queue.push({ x, y });
    }
  }
  return distances;
}
const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const spawnPlan = (seed, level) => planDungeonSpawns(generateDungeon(seed, level));
function roomSpawner(species, max = 4) {
  return { roomId: 'rT', kind: 'cave', max, respawnMs: 5 * MIN,
    species, spawnPoints: Array.from({ length: 12 }, (_, i) => ({ x: 100 + i * 3, y: 50 })) };
}

test('faixas e tabela F1 conferem com o plano A', () => {
  assert.deepEqual(DUNGEON_BANDS.map(({ id, minLevel, maxLevel }) => [id, minLevel, maxLevel]), [
    ['F1', 1, 2], ['F2', 3, 5], ['F3', 6, 9], ['F4', 10, Infinity],
  ]);
  assert.deepEqual(DUNGEON_SPECIES.map(s => [s.id, s.label, s.bands, s.baseHealth, s.baseForce, s.reach, s.cooldownMs, s.behavior, s.kind, s.weight, s.group, s.drops.map(d => [d.item, d.chance])]), [
    ['caveBear', 'Urso-pardo', [1, 2], 9, 2.2, 1.3, 1800, 'territorial', 'melee', 1, { min: 1, max: 1 }, [['rawMeat', 0.6], ['hide', 0.4], ['bone', 0.3]]],
    ['mossSlime', 'Gosma-de-musgo', [1, 1], 4, 1, 0.6, 1400, 'swarm', 'melee', 3, { min: 2, max: 3 }, [['gel', 0.5]]],
    ['dustSpider', 'Aranhinha-de-poeira', [1, 1], 2, 0.8, 0.6, 1100, 'pack', 'ambush', 2, { min: 3, max: 4 }, [['silk', 0.4], ['bone', 0.1]]],
  ]);
  assert.deepEqual([BOSSES[0].id, BOSSES[0].label, BOSSES[0].level, BOSSES[0].baseHealth, BOSSES[0].baseForce, BOSSES[0].reach, BOSSES[0].cooldownMs],
    ['elderBear', 'Urso-ancião', 2, 45, 2.6, 1.6, 1900]);
  assert.equal(bandOfLevel(1).id, 'F1');
  assert.equal(bandOfLevel(3).id, 'F2');
  assert.equal(bandOfLevel(6).id, 'F3');
  assert.equal(bandOfLevel(10).id, 'F4');
  assert.deepEqual(speciesIdsForLevel(1), ['caveBear', 'mossSlime', 'dustSpider']);
  assert.deepEqual(speciesIdsForLevel(2), ['caveBear']);
  assert.deepEqual(speciesIdsForLevel(3), []);
  assert.equal(bossFor(2).id, 'elderBear');
  assert.equal(bossFor(1), null);
});

test('F1 números usam k relativo à faixa e a fórmula aprovada', () => {
  assert.deepEqual(scaleSpecies('caveBear', 1), {
    id: 'caveBear', level: 1, band: 'F1', k: 0, behavior: 'territorial', kind: 'melee', armor: 0,
    health: 9, force: 2.2, damage: 9, reach: 1.3, cooldownMs: 1800, speed: 2.8, wakeRadius: 5, leash: 8,
  });
  const scaled = scaleSpecies('caveBear', 2);
  assert.equal(scaled.k, 1);
  assert.equal(scaled.health, Math.ceil(9 * 1.15));
  assert.equal(scaled.force, 2.38);
  assert.equal(scaled.speed, 2.85);
  assert.equal(scaleSpecies('elderBear', 2).damage, 10);
  const synthetic = { id: 'synthetic', baseHealth: 10, baseForce: 1, baseSpeed: 2, behavior: 'melee', kind: 'melee', armor: 0 };
  assert.equal(scaleSpecies(synthetic, 30).k, 6);
  assert.equal(scaleSpecies(synthetic, 30).health, 19);
});

test('ids F1 não colidem com fauna, v1 foi removido, e wildlife adapter expõe os ids', () => {
  const retired = ['stoneRat', 'caveBat', 'blindSnake', 'gloomWolf', 'coldWraith'];
  const ids = [...DUNGEON_SPECIES, ...BOSSES].map(s => s.id);
  for (const id of ids) {
    assert.equal(WILDLIFE_BY_ID.has(id), false, `${id} não colide com wildlife.mjs`);
    const definition = dungeonWildlifeDefinition(id);
    for (const key of ['id', 'label', 'form', 'size', 'colors', 'stats', 'drops', 'attack']) assert.ok(key in definition, `${id}.${key}`);
  }
  for (const id of retired) assert.equal(dungeonWildlifeDefinition(id), null);
  assert.equal(dungeonWildlifeDefinition('elderBear').id, 'elderBear');
});

test('cada nível contém apenas espécies cujas faixas o incluem', () => {
  for (let level = 1; level <= 20; level++) {
    const expected = DUNGEON_SPECIES.filter(s => level >= s.bands[0] && level <= s.bands[1]).map(s => s.id);
    assert.deepEqual(speciesIdsForLevel(level), expected);
  }
});

test('spawns determinísticos, com teto por sala e instância e sem arena nem entrada', () => {
  for (const level of [1, 2]) for (const seed of SEEDS) {
    const dungeon = generateDungeon(seed, level);
    const first = planDungeonSpawns(dungeon);
    const distances = distancesFrom(dungeon, dungeon.entrance);
    assert.deepEqual(first, planDungeonSpawns(dungeon));
    assert.ok(first.initial.length <= DUNGEON_RULES.instanceMaxAlive);
    for (const entry of first.initial) {
      assert.ok(speciesIdsForLevel(level).includes(entry.species));
      assert.equal(inRect(entry, dungeon.boss.arena), false);
      assert.ok(distances.get(`${entry.x},${entry.y}`) >= DUNGEON_RULES.entranceSafeTiles);
      assert.equal(dungeon.rooms.some(room => room.kind === 'start' && inRect(entry, room)), false);
    }
    for (const spawner of first.spawners) assert.ok(spawner.max <= DUNGEON_RULES.roomMaxAlive);
  }
});

test('bandos inteiros reaparecem em pontos livres longe dos jogadores', () => {
  const far = [{ x: 0, y: 0 }];
  for (const id of ['mossSlime', 'dustSpider']) {
    const result = planRespawn({ spawner: roomSpawner([id]), players: far, now: 10 * MIN, rotation: 0 });
    assert.equal(result.ok, true);
    assert.ok(result.size >= groupOf(id).min && result.size <= groupOf(id).max);
    assert.equal(result.points.length, result.size);
    assert.equal(new Set(result.points.map(p => `${p.x},${p.y}`)).size, result.size);
  }
  const noRoom = planRespawn({ spawner: roomSpawner(['mossSlime']), aliveInRoom: 3, players: far, now: 10 * MIN });
  assert.equal(noRoom.reason, 'sem-vaga-grupo');
  const bear = planRespawn({ spawner: roomSpawner(['caveBear']), aliveInRoom: 3, players: far, now: 10 * MIN });
  assert.equal(bear.ok, true);
  assert.equal(bear.size, 1);
});

test('drops permanecem fixos e sem moeda', () => {
  for (const species of DUNGEON_SPECIES) {
    assert.deepEqual(dropsFor(species).map(d => [d.item, d.chance]), species.drops.map(d => [d.item, d.chance]));
    assert.ok(dropsFor(species).every(d => !['bronze', 'silver', 'gold'].includes(d.item)));
  }
});
