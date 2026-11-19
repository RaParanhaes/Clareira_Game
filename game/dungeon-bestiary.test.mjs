import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from './dungeon-gen.mjs';
import { WILDLIFE_SPECIES } from './wildlife.mjs';
import {
  DUNGEON_RULES, DUNGEON_SPECIES, scaleSpecies, dropsFor, dropFactorFor, recordRoomClear,
  planDungeonSpawns, planRespawn, speciesIdsForLevel,
} from './dungeon-bestiary.mjs';

const SEEDS = Array.from({ length: 8 }, (_, i) => 0x4e494e48 + i * 7919);
const LEVELS = [1, 2, 3];
const MIN = 60 * 1000;

// BFS própria do teste (independente da do módulo): passos a partir da entrada.
function stepsFrom(level, origin) {
  const { w, h, cells } = level;
  const dist = new Map([[`${origin.x},${origin.y}`, 0]]);
  const queue = [origin];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const d = dist.get(`${p.x},${p.y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || cells[ny * w + nx] !== 1) continue;
      const key = `${nx},${ny}`;
      if (dist.has(key)) continue;
      dist.set(key, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

function spawnPlan(seed, level) {
  return planDungeonSpawns(generateDungeon(seed, level));
}

test('cinco espécies, todas com forms existentes em wildlife.mjs e sem moeda nos drops', () => {
  assert.equal(DUNGEON_SPECIES.length, 5);
  const forms = new Set(WILDLIFE_SPECIES.map(s => s.form));
  for (const species of DUNGEON_SPECIES) {
    assert.ok(forms.has(species.form), `form ${species.form} de ${species.id} existe no catálogo da fauna`);
    assert.ok(['swarm', 'flyer', 'ambush', 'pack', 'stalker'].includes(species.behavior), species.id);
    for (const drop of dropsFor(species)) {
      assert.ok(!['bronze', 'silver', 'gold'].includes(drop.item), `${species.id} não dropa moeda`);
    }
  }
});

test('vida e dano crescem com a profundidade, de forma estrita do nível 1 ao 5', () => {
  for (const species of DUNGEON_SPECIES) {
    const levels = [1, 2, 3, 4, 5].map(n => scaleSpecies(species.id, n));
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i].health >= levels[i - 1].health, `${species.id} vida não cai`);
      assert.ok(levels[i].damage >= levels[i - 1].damage, `${species.id} dano não cai`);
      assert.ok(levels[i].speed >= levels[i - 1].speed, `${species.id} velocidade não cai`);
    }
    assert.ok(levels[4].health > levels[0].health, `${species.id} vida cresce`);
    assert.ok(levels[4].damage > levels[0].damage, `${species.id} dano cresce`);
  }
  assert.deepEqual(scaleSpecies('rat', 1), { id: 'rat', level: 1, behavior: 'swarm', health: 2, force: 0.55, damage: 2, reach: 0.57, cooldownMs: 1200, speed: 2.8, wakeRadius: 7, leash: 8 });
});

test('a sombra só aparece no nível 3 e o lobo no 2', () => {
  assert.deepEqual(speciesIdsForLevel(1), ['rat', 'bat', 'snake']);
  assert.deepEqual(speciesIdsForLevel(2), ['rat', 'bat', 'snake', 'wolf']);
  assert.ok(speciesIdsForLevel(3).includes('wraith'));
});

test('determinismo: mesma seed e nível dão o mesmo plano; seed diferente muda o plano', () => {
  for (const level of LEVELS) {
    const a = spawnPlan(SEEDS[0], level);
    const b = spawnPlan(SEEDS[0], level);
    assert.deepEqual(a, b);
  }
  assert.notDeepEqual(spawnPlan(SEEDS[0], 1).initial, spawnPlan(SEEDS[1], 1).initial);
});

test('tetos: por sala, por instância e nenhuma sala passa do máximo', () => {
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      const plan = spawnPlan(seed, level);
      assert.ok(plan.initial.length <= DUNGEON_RULES.instanceMaxAlive, 'teto de 36 por instância');
      const perRoom = new Map();
      for (const entry of plan.initial) perRoom.set(entry.roomId, (perRoom.get(entry.roomId) || 0) + 1);
      for (const spawner of plan.spawners) {
        assert.ok(spawner.max >= 1 && spawner.max <= DUNGEON_RULES.roomMaxAlive, 'max entre 1 e 4');
        assert.ok((perRoom.get(spawner.roomId) || 0) <= spawner.max, `sala ${spawner.roomId} respeita o teto`);
      }
    }
  }
});

test('nada nasce na arena, na sala inicial ou a menos de 14 passos da entrada', () => {
  for (const seed of SEEDS) {
    for (const level of LEVELS) {
      const dungeon = generateDungeon(seed, level);
      const plan = planDungeonSpawns(dungeon);
      const steps = stepsFrom(dungeon, dungeon.entrance);
      const startRoomIds = new Set(
        dungeon.rooms.map((room, index) => (room.kind === 'start' ? `r${index}` : null)).filter(Boolean),
      );
      for (const entry of plan.initial) {
        assert.ok(!inRect(entry, dungeon.boss.arena), 'nada na arena');
        assert.ok(!startRoomIds.has(entry.roomId), 'nada na sala inicial');
        assert.ok(steps.get(`${entry.x},${entry.y}`) >= DUNGEON_RULES.entranceSafeTiles, 'nada perto da entrada');
      }
      for (const spawner of plan.spawners) {
        for (const p of spawner.spawnPoints) {
          assert.ok(!inRect(p, dungeon.boss.arena), 'ponto de nascimento fora da arena');
          assert.ok(steps.get(`${p.x},${p.y}`) >= DUNGEON_RULES.entranceSafeTiles, 'ponto de nascimento longe da entrada');
        }
      }
    }
  }
});

test('o plano só usa espécies liberadas no nível', () => {
  const level1 = spawnPlan(SEEDS[2], 1);
  assert.ok(level1.initial.every(e => ['rat', 'bat', 'snake'].includes(e.species)));
  const level3 = spawnPlan(SEEDS[2], 3);
  assert.ok(level3.initial.every(e => speciesIdsForLevel(3).includes(e.species)));
});

test('anti-farm: a mesma sala limpa de novo no período perde drops', () => {
  assert.equal(dropFactorFor(0), 1);
  assert.equal(dropFactorFor(1), 0.5);
  assert.equal(dropFactorFor(2), 0.25);
  assert.equal(dropFactorFor(9), 0);
  let history = {};
  const factors = [];
  for (let i = 0; i < 5; i++) {
    const step = recordRoomClear(history, 'r3', 1000 + i * MIN);
    history = step.history;
    factors.push(step.dropFactor);
  }
  assert.deepEqual(factors, [1, 0.5, 0.25, 0, 0]);
  assert.deepEqual(dropsFor('rat', 0.5), [{ item: 'bone', chance: 0.2 }]);
  assert.deepEqual(dropsFor('rat', 0), [{ item: 'bone', chance: 0 }]);
});

test('anti-farm: fora da janela de 10 minutos o drop volta ao normal e outra sala não é afetada', () => {
  let history = {};
  history = recordRoomClear(history, 'r1', 0).history;
  history = recordRoomClear(history, 'r1', MIN).history;
  const other = recordRoomClear(history, 'r2', 2 * MIN);
  assert.equal(other.dropFactor, 1, 'outra sala começa cheia');
  const later = recordRoomClear(history, 'r1', DUNGEON_RULES.antiFarmWindowMs + 2 * MIN);
  assert.equal(later.dropFactor, 1, 'janela expirada');
  assert.equal(history.r1.length, 2, 'histórico original não foi mutado');
});

test('reaparecimento: só com sala abaixo do teto, intervalo vencido e sem jogador por perto', () => {
  const spawner = spawnPlan(SEEDS[0], 1).spawners.find(s => s.spawnPoints.length > 0);
  const far = [{ x: 0, y: 0 }];
  const base = { spawner, aliveInRoom: 0, aliveInInstance: 0, players: far, now: 10 * MIN, lastRespawnAt: null, lastRoomDeathAt: null };

  const ok = planRespawn(base);
  assert.equal(ok.ok, true);
  assert.ok(spawner.spawnPoints.some(p => p.x === ok.point.x && p.y === ok.point.y));
  assert.ok(spawner.species.includes(ok.species));

  assert.equal(planRespawn({ ...base, aliveInRoom: spawner.max }).reason, 'sala-cheia');
  assert.equal(planRespawn({ ...base, aliveInInstance: 36 }).reason, 'instancia-cheia');
  assert.equal(planRespawn({ ...base, lastRespawnAt: base.now - MIN }).reason, 'intervalo');
  assert.equal(planRespawn({ ...base, lastRoomDeathAt: base.now - MIN }).reason, 'sala-recente');
  assert.equal(planRespawn({ ...base, lastRoomDeathAt: base.now - 6 * MIN }).ok, true);

  const blocked = planRespawn({ ...base, players: spawner.spawnPoints.map(p => ({ x: p.x, y: p.y })) });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'jogador-perto');

  const occupiedAll = new Set(spawner.spawnPoints.map(p => `${p.x},${p.y}`));
  assert.equal(planRespawn({ ...base, occupied: occupiedAll }).reason, 'sem-ponto-livre');
});

test('reaparecimento nunca escolhe ponto a menos de 14 tiles de um jogador', () => {
  const spawner = spawnPlan(SEEDS[1], 2).spawners.find(s => s.spawnPoints.length > 1);
  const player = spawner.spawnPoints[0];
  const result = planRespawn({
    spawner, aliveInRoom: 0, aliveInInstance: 0, now: 10 * MIN,
    players: [{ x: player.x, y: player.y }],
  });
  if (result.ok) {
    assert.ok(Math.hypot(result.point.x - player.x, result.point.y - player.y) >= DUNGEON_RULES.playerClearanceTiles);
  }
});
