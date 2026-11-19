import test from 'node:test';
import assert from 'node:assert/strict';
import { LAIRS, createLairGuards, formatLairCountdown, lairView } from './lairs.mjs';
import { createDungeonBoss, dungeonChestView, dungeonChestLair, DUNGEON_REWARDS } from './lairs.mjs';
import { dungeonLevel } from './dungeon-instances.mjs';
import { WILDLIFE_BY_ID, wildlifeIsActive, wildlifeStage, stepWildlifePopulation } from './wildlife.mjs';
import { damageFromAttack } from './vitals.mjs';
import { WORLD_SIZE, canOccupy } from './world.mjs';
import { GAME_DAY_DURATION_MS } from './game-time.mjs';

test('covil exporta guardas fixos, baú, boca e obstáculos dentro do mundo', () => {
  const lair = LAIRS.ninho;
  assert.equal(lair.dimensionId, 'surface');
  assert.ok(lair.center.x > 0 && lair.center.x < WORLD_SIZE && lair.center.y < WORLD_SIZE);
  assert.equal(lair.guards.length, 3);
  assert.equal(lair.respawnMs, GAME_DAY_DURATION_MS);
  for (const point of [...lair.guards, lair.chest, lair.mouth]) assert.equal(canOccupy(point, .48), true);
  assert.ok(lair.obstacles.length > 0);
  assert.deepEqual(createLairGuards(lair).map(animal=>animal.id), ['lair:ninho:0','lair:ninho:1','lair:ninho:2']);
  assert.deepEqual(Object.keys(lairView(lair)), ['id','x','y','chest','mouth','state','readyAt']);
});

test('guardião está sempre ativo, fixo no posto e não perde vida por fome', () => {
  const definition = WILDLIFE_BY_ID.get('caveWarden');
  assert.equal(definition.alwaysActive, true);
  assert.equal(definition.fixed, true);
  assert.equal(wildlifeIsActive(definition, 3), true);
  assert.equal(wildlifeIsActive(definition, 12), true);
  const guard = createLairGuards()[0]; guard.hunger=99;guard.thirst=99;guard.energy=5;guard.thinkAt=0;
  const population = new Map([[guard.id, guard]]);
  stepWildlifePopulation(population, { dimensionId:'surface', players:[{id:'p',location:'clearing',dimensionId:'surface',position:{x:guard.x+20,y:guard.y}}], now:100000, deltaSeconds:.12 });
  assert.equal(population.has(guard.id), true);
  assert.equal(guard.health, 6);
  assert.equal(guard.hunger, 99);
  assert.equal(guard.state, 'vigiando');
});

test('guardas ficam à frente da entrada, fora do vão, e são adultos', () => {
  const lair = LAIRS.ninho;
  for (const post of lair.guards) {
    assert.ok(post.y > lair.mouth.y, `posto ${post.x},${post.y} precisa estar à frente da boca`);
    assert.equal(canOccupy(post, .48), true);
  }
  const [guard] = createLairGuards(lair);
  assert.equal(wildlifeStage(WILDLIFE_BY_ID.get('caveWarden'), guard.ageDays), 'adulto');
});

test('obstáculos do morro bloqueiam a caminhada, e o vão até o baú continua livre', () => {
  const lair = LAIRS.ninho;
  for (const obstacle of lair.obstacles) assert.equal(canOccupy(obstacle, .25), false, `obstáculo ${obstacle.x},${obstacle.y} bloqueia`);
  for (const y of [137, 135.5, 134.5, 133.5]) assert.equal(canOccupy({ x: lair.mouth.x, y }, .25), true, `vão livre em y ${y}`);
});

test('guardião dorme no posto até o jogador entrar em 4 tiles e volta a dormir fora da coleira', () => {
  const guard = createLairGuards(LAIRS.ninho)[0];
  const at = distance => [{ id: 'p1', location: 'clearing', dimensionId: 'surface', position: { x: guard.homeX + distance, y: guard.homeY } }];
  const step = players => {
    guard.thinkAt = 0;
    stepWildlifePopulation(new Map([[guard.id, guard]]), { dimensionId: 'surface', players, now: 100000, deltaSeconds: .12 });
  };
  step(at(5));
  assert.equal(guard.awake, false, 'a 5 tiles o guardião continua dormindo no posto');
  assert.equal(guard.state, 'vigiando');
  step(at(3));
  assert.equal(guard.awake, true, 'a 3 tiles ele desperta');
  step(at(7));
  assert.equal(guard.awake, true, 'desperto, persegue dentro da coleira');
  step(at(10));
  assert.equal(guard.awake, false, 'fora da coleira de 9 tiles ele volta a dormir');
});

test('guardião bate com força 1 (4 de dano, 2 com o gibão) a cada 2,2 s', () => {
  const attack = WILDLIFE_BY_ID.get('caveWarden').attack;
  assert.equal(attack.force, 1);
  assert.equal(attack.cooldownMs, 2200);
  assert.equal(damageFromAttack({ force: attack.force }, 0), 4);
  assert.equal(damageFromAttack({ force: attack.force }, 2), 2);
});

test('recarga aparece em mm:ss, arredondada para cima', () => {
  assert.equal(formatLairCountdown(2200), '00:03');
  assert.equal(formatLairCountdown(125000), '02:05');
  assert.equal(formatLairCountdown(1200000), '20:00');
  assert.equal(formatLairCountdown(-5), '00:00');
});


test('chefe da masmorra fica no centro da arena, preso à coleira da própria arena', () => {
  const { boss } = dungeonLevel(1);
  const animal = createDungeonBoss({ level: 1, dimensionId: 'dg-ninho-n1-0123456789', arena: boss.arena, center: boss.center, now: 0 });
  assert.equal(animal.lairId, 'ninho-n1');
  assert.equal(animal.dungeonBoss, true);
  assert.deepEqual([animal.x, animal.y], [boss.center.x + 0.5, boss.center.y + 0.5]);
  assert.equal(animal.homeX, animal.x);
  // Coleira menor que o meio da arena: o chefe não sai do retângulo da arena quando está em casa.
  assert.ok(animal.leash <= Math.min(boss.arena.w, boss.arena.h) / 2, 'coleira cabe na arena');
  assert.ok(animal.health > 6, 'vida de chefe, acima da do guardião comum');
});

test('estado do baú: trancado com chefe vivo, sem parte depois da queda, recarga e pronto', () => {
  assert.deepEqual(dungeonChestView({ bossAlive: true, contributor: true, now: 1000 }), { state: 'trancado', readyAt: null });
  assert.deepEqual(dungeonChestView({ bossAlive: false, contributor: false, now: 1000 }), { state: 'sem-parte', readyAt: null });
  assert.deepEqual(dungeonChestView({ bossAlive: false, contributor: true, availableAt: 5000, now: 1000 }), { state: 'recarregando', readyAt: 5000 });
  assert.deepEqual(dungeonChestView({ bossAlive: false, contributor: true, availableAt: 500, now: 1000 }), { state: 'pronto', readyAt: null });
});

test('baú da masmorra usa a recompensa do nível e o id ninho-n<N>', () => {
  const lair = dungeonChestLair(1, { x: 9, y: 3 });
  assert.equal(lair.id, 'ninho-n1');
  assert.deepEqual(lair.chest, { x: 9.5, y: 3.5 });
  assert.deepEqual(lair.reward, DUNGEON_REWARDS[1]);
});
