import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDamage, createVitals, damageFromAttack, faintOutcome, isDowned, maxHealth, regenStep, vitalsSnapshot,
} from './vitals.mjs';
import { vitalsHudState, wakeText } from './vitals-hud.mjs';
import { WILDLIFE_BY_ID } from './wildlife.mjs';

test('vida máxima cresce com o nível', () => {
  assert.equal(maxHealth(1), 42);
  assert.equal(maxHealth(10), 60);
  assert.equal(maxHealth(undefined), 42);
});

test('dano vem da força do ataque, com mínimo de 1 e defesa subtraída', () => {
  assert.equal(damageFromAttack({ force: 2.6 }), 10);
  assert.equal(damageFromAttack({ force: 2.6 }, 4), 6);
  assert.equal(damageFromAttack({ force: .35 }, 50), 1);
  assert.equal(damageFromAttack({ force: .7 }), 3);
});

test('o urso não derruba um jogador nível 1 com vida cheia em dois golpes', () => {
  const bear = WILDLIFE_BY_ID.get('bear');
  const vitals = createVitals(1);
  const hit = damageFromAttack(bear.attack);
  assert.ok(2 * hit < maxHealth(1));
  applyDamage(vitals, hit, 1000, 42);
  const second = applyDamage(vitals, hit, 3000, 42);
  assert.equal(second.fainted, false);
  assert.ok(vitals.hp > 0);
});

test('nenhuma espécie com ataque derruba nível 1 em dois golpes', () => {
  for (const definition of WILDLIFE_BY_ID.values()) {
    if (definition.attack) assert.ok(2 * damageFromAttack(definition.attack) < maxHealth(1), definition.id);
  }
});

test('regeneração espera 6 s sem dano e triplica perto da fogueira', () => {
  const vitals = { hp: 20, downedUntil: 0, lastHitAt: 1000, immuneUntil: 0 };
  const base = { max: 42, dtMs: 1000, location: 'clearing' };
  assert.equal(regenStep(vitals, { ...base, now: 6900 }), 20);
  assert.equal(regenStep(vitals, { ...base, now: 7000 }), 21);
  assert.equal(regenStep(vitals, { ...base, now: 7000, nearFire: true }), 23);
  assert.equal(regenStep({ ...vitals, hp: 41.5 }, { ...base, now: 9000, nearFire: true }), 42);
});

test('fora da clareira a vida volta cheia; caído não regenera', () => {
  const vitals = { hp: 5, downedUntil: 0, lastHitAt: 0, immuneUntil: 0 };
  assert.equal(regenStep(vitals, { now: 100, dtMs: 33, max: 42, location: 'room' }), 42);
  const downed = { ...vitals, downedUntil: 5000 };
  assert.equal(regenStep(downed, { now: 1000, dtMs: 1000, max: 42 }), 5);
});

test('desmaio: 4 s caído, acorda com metade da vida, 10 s de imunidade e sem perdas', () => {
  const outcome = faintOutcome(42);
  assert.deepEqual([outcome.hp, outcome.downedMs, outcome.immuneMs], [21, 4000, 10000]);
  assert.deepEqual(outcome.loses, { items: false, coins: false, xp: false });
  const vitals = { hp: 3, downedUntil: 0, lastHitAt: 0, immuneUntil: 0 };
  const result = applyDamage(vitals, 10, 1000, 42);
  assert.equal(result.fainted, true);
  assert.equal(isDowned(vitals, 4999), true);
  assert.equal(isDowned(vitals, 5000), false);
  assert.equal(vitals.hp, 21);
  assert.equal(applyDamage(vitals, 10, 12000, 42).damage, 0, 'imune após acordar');
  assert.equal(applyDamage(vitals, 10, 15001, 42).damage, 10);
});

test('snapshot mostra vida inteira e mínimo 1 enquanto houver vida', () => {
  assert.deepEqual(vitalsSnapshot({ hp: .4, downedUntil: 0 }, 42), { hp: 1, max: 42, downedUntil: 0 });
  assert.deepEqual(vitalsSnapshot({ hp: 20.9, downedUntil: 7 }, 42), { hp: 20, max: 42, downedUntil: 7 });
});

test('HUD: dano, desmaio e despertar', () => {
  const full = vitalsHudState(null, { hp: 42, max: 42 });
  assert.equal(full.full, true);
  assert.equal(full.message, '');
  const hurt = vitalsHudState(full, { hp: 32, max: 42 });
  assert.equal(hurt.hurt, true);
  const downed = vitalsHudState(hurt, { hp: 21, max: 42, downedMs: 3000 });
  assert.match(downed.message, /desmaiou/);
  assert.equal(downed.hurt, false);
  const woke = vitalsHudState(downed, { hp: 21, max: 42 }, { dimensionId: 'surface' });
  assert.equal(woke.message, wakeText('surface'));
  assert.match(woke.message, /acordou na vila/);
  assert.equal(vitalsHudState(null, null).visible, false);
});
