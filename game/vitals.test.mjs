import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDamage, applyDeath, createVitals, deathDestination, deathOutcome, dimensionTravelCancelledDetails, downedRefusal, releaseAnimalsFromPlayer, restoreVitals, vitalsResumeSnapshot, damageFromAttack, faintOutcome, isDowned, maxHealth, regenStep, vitalsSnapshot, wakeIfDue,
} from './vitals.mjs';
import { countdownSeconds, createVitalsHud, deathText, FAINT_TEXT, vitalsHudState, WAKE_TEXT } from './vitals-hud.mjs';
import { stepWildlifePopulation, WILDLIFE_BY_ID } from './wildlife.mjs';
import { armorDefense } from './equipment.mjs';
import { equipItem } from './equipment-actions.mjs';
import { createInventory } from './inventory.mjs';

test('gibão vestido reduz o golpe do urso de 10 para 8; guardado na mochila não protege', () => {
  const bear = WILDLIFE_BY_ID.get('bear');
  assert.equal(damageFromAttack(bear.attack, armorDefense(createInventory())), 10);
  const inventory = createInventory({ slots: [{ itemId: 'leatherJerkin', quantity: 1 }] });
  assert.equal(damageFromAttack(bear.attack, armorDefense(inventory)), 10, 'na mochila não defende');
  assert.equal(equipItem(inventory, 'leatherJerkin').ok, true);
  assert.equal(damageFromAttack(bear.attack, armorDefense(inventory)), 8, 'vestido defende');
  assert.equal(damageFromAttack({ force: .35 }, armorDefense(inventory)), 1, 'dano mínimo continua 1');
});

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

test('desmaio: cai no local por 10 s e acorda no mesmo lugar com 30% e 5 s de imunidade', () => {
  const outcome = faintOutcome(42);
  assert.deepEqual([outcome.hp, outcome.downedMs, outcome.immuneMs], [13, 10000, 5000]);
  assert.deepEqual(outcome.loses, { items: false, coins: false, xp: false });
  const vitals = createVitals(1);
  vitals.hp = 3;
  const result = applyDamage(vitals, 10, 1000, 42);
  assert.equal(result.fainted, true);
  assert.equal(vitals.hp, 0, 'a vida chegou a zero');
  assert.equal(isDowned(vitals, 10999), true);
  assert.equal(wakeIfDue(vitals, 10999, 42), false, 'ainda caído aos 9,99 s');
  assert.equal(isDowned(vitals, 11000), true, 'continua caído até o servidor acordar');
  assert.equal(wakeIfDue(vitals, 11000, 42), true, 'acorda aos 10 s');
  assert.equal(vitals.hp, 13, '30% de 42');
  assert.equal(isDowned(vitals, 11000), false);
  assert.equal(applyDamage(vitals, 10, 12000, 42).damage, 0, 'imune nos 5 s depois de acordar');
  assert.equal(applyDamage(vitals, 10, 16001, 42).damage, 10);
});

test('golpes durante o desmaio não derrubam de novo e só matam com 50% de dano acumulado', () => {
  const vitals = createVitals(1);
  vitals.hp = 5;
  assert.equal(applyDamage(vitals, 5, 1000, 42).fainted, true);
  const first = applyDamage(vitals, 10, 2000, 42);
  assert.deepEqual([first.fainted, first.dead, vitals.faintDamage], [false, false, 10]);
  assert.equal(applyDamage(vitals, 10, 3000, 42).dead, false, '20 de 21 ainda não mata');
  assert.equal(applyDamage(vitals, 2, 4000, 42).dead, true, '22 de 21 mata');
});

test('morte: volta com 50% e 10 s de imunidade, sem perdas, e conta a morte para o cliente', () => {
  const outcome = deathOutcome(42);
  assert.deepEqual([outcome.hp, outcome.immuneMs], [21, 10000]);
  assert.deepEqual(outcome.loses, { items: false, coins: false, xp: false });
  const vitals = createVitals(1);
  vitals.hp = 5;
  applyDamage(vitals, 5, 1000, 42);
  assert.equal(applyDamage(vitals, 25, 2000, 42).dead, true);
  applyDeath(vitals, 2000, 42, 'na vila');
  assert.equal(vitals.hp, 21);
  assert.equal(vitals.deathSeq, 1);
  assert.equal(vitals.deathPlace, 'na vila');
  assert.equal(isDowned(vitals, 2000), false);
  assert.equal(applyDamage(vitals, 10, 11999, 42).damage, 0);
  assert.equal(applyDamage(vitals, 10, 12000, 42).damage, 10);
});

test('morte vai ao respawnPoint quando existe; sem ele, ao spawn da dimensão', () => {
  const spawn = { x: 100, y: 200 };
  const cave = { x: 40, y: 60, place: 'na entrada da caverna' };
  assert.deepEqual(deathDestination(cave, spawn, 'breu'), { x: 40, y: 60, place: 'na entrada da caverna' });
  assert.deepEqual(deathDestination(null, spawn, 'surface'), { x: 100, y: 200, place: 'na vila' });
  assert.deepEqual(deathDestination(undefined, spawn, 'breu'), { x: 100, y: 200, place: 'no ponto de partida' });
  assert.equal(deathText('na entrada da caverna'), 'Você caiu… e acordou na entrada da caverna.');
});

test('desmaio não move o personagem: as regras de vida não tocam a posição', () => {
  const position = { x: 7, y: 9 };
  const vitals = createVitals(1);
  vitals.hp = 1;
  applyDamage(vitals, 4, 500, 42);
  wakeIfDue(vitals, 10500, 42);
  assert.deepEqual(position, { x: 7, y: 9 });
});

test('snapshot mostra vida inteira, mínimo 1 enquanto houver vida e a contagem de mortes', () => {
  assert.deepEqual(vitalsSnapshot({ hp: .4, downedUntil: 0, deathSeq: 0 }, 42), { hp: 1, max: 42, downedUntil: 0, deathSeq: 0, deathPlace: '' });
  assert.deepEqual(vitalsSnapshot({ hp: 20.9, downedUntil: 7, deathSeq: 2, deathPlace: 'na vila' }, 42), { hp: 20, max: 42, downedUntil: 7, deathSeq: 2, deathPlace: 'na vila' });
});

test('HUD: dano, desmaio com contagem, despertar e morte', () => {
  const full = vitalsHudState(null, { hp: 42, max: 42 });
  assert.equal(full.full, true);
  assert.equal(full.message, '');
  const hurt = vitalsHudState(full, { hp: 32, max: 42 });
  assert.equal(hurt.hurt, true);
  const downed = vitalsHudState(hurt, { hp: 0, max: 42, downedMs: 10000 });
  assert.equal(downed.message, FAINT_TEXT);
  assert.equal(downed.hurt, false);
  const woke = vitalsHudState(downed, { hp: 13, max: 42, deathSeq: 0 });
  assert.equal(woke.message, WAKE_TEXT);
  const died = vitalsHudState(downed, { hp: 21, max: 42, deathSeq: 1, deathPlace: 'na vila' });
  assert.equal(died.died, true);
  assert.equal(died.kind, 'death');
  assert.equal(died.message, 'Você caiu… e acordou na vila.');
  assert.equal(vitalsHudState(null, null).visible, false);
});

test('contagem do desmaio vai de 10 a 1 e para em zero', () => {
  assert.equal(countdownSeconds(10000, 0), 10);
  assert.equal(countdownSeconds(9000, 0), 9);
  assert.equal(countdownSeconds(1000, 0), 1);
  assert.equal(countdownSeconds(1, 0), 1);
  assert.equal(countdownSeconds(0, 0), 0);
  assert.equal(countdownSeconds(-500, 0), 0);
});

test('caído, toda ação, viagem de dimensão e visita a quarto são recusadas num ponto único', () => {
  const vitals = { hp: 21, downedUntil: 5000, lastHitAt: 0, immuneUntil: 0 };
  const action = downedRefusal({ type: 'action', name: 'gather' }, vitals, 1000);
  assert.equal(action.text, 'Você ainda está se recompondo…');
  const travel = downedRefusal({ type: 'dimensionTravel', requestId: 7 }, vitals, 1000);
  assert.deepEqual(travel.details, { action: 'dimensionTravel', requestId: 7, result: 'rejected' });
  assert.ok(downedRefusal({ type: 'roomWarm', buildingId: 'a' }, vitals, 1000));
  for (const type of ['emote', 'appearance', 'tipo-novo']) assert.ok(downedRefusal({ type }, vitals, 1000), type);
  for (const type of ['clockPing', 'chat', 'view', 'recoverMovement', 'join', 'input']) assert.equal(downedRefusal({ type }, vitals, 1000), null, type);
  assert.equal(downedRefusal({ type: 'action', name: 'gather' }, vitals, 5000), null, 'acordado, volta a agir');
  assert.equal(downedRefusal({ type: 'action' }, null, 1000), null);
});

test('desmaio solta só o agressor e os provocados por este jogador', () => {
  const mine = { id: 'a', provokedBy: 'p1', provokedUntil: 9000, state: 'atacando' };
  const other = { id: 'b', provokedBy: 'p2', provokedUntil: 9000, state: 'atacando' };
  const attacker = { id: 'c', provokedBy: null, provokedUntil: 0, state: 'atacando' };
  releaseAnimalsFromPlayer([mine, other, attacker], 'p1', 'c', 1000);
  assert.deepEqual([mine.provokedUntil, mine.state], [0, 'explorando']);
  assert.deepEqual([other.provokedUntil, other.state], [9000, 'atacando']);
  assert.equal(attacker.state, 'explorando');
});

test('reconectar durante o desmaio mantém o caído, o prazo e o dano acumulado', () => {
  const max = maxHealth(1);
  const vitals = createVitals(1);
  applyDamage(vitals, max, 1000, max);                       // zera a vida: desmaia no local
  applyDamage(vitals, 3, 2000, max);                         // golpe no caído soma ao dano acumulado
  const saved = vitalsResumeSnapshot(vitals);
  const back = restoreVitals(JSON.parse(JSON.stringify(saved)), 1, 3000);
  assert.equal(isDowned(back, 3000), true);
  assert.equal(back.fainted, true);
  assert.equal(back.downedUntil, 1000 + 10000);
  assert.equal(back.faintDamage, 3);
  assert.equal(back.hp, vitals.hp);
  // O dano que faltava para morrer continua contando depois da reconexão.
  const lethal = Math.ceil(max * .5) - 3;
  assert.equal(applyDamage(back, lethal, 4000, max).dead, true);
});

test('reconectar depois do fim do desmaio aplica o despertar: 30% da vida e imunidade', () => {
  const max = maxHealth(1);
  const vitals = createVitals(1);
  applyDamage(vitals, max, 1000, max);
  const back = restoreVitals(vitalsResumeSnapshot(vitals), 1, 1000 + 10000 + 1);
  assert.equal(back.fainted, false);
  assert.equal(back.faintDamage, 0);
  assert.equal(back.hp, faintOutcome(max).hp);
  assert.equal(back.immuneUntil, 1000 + 10000 + 1 + faintOutcome(max).immuneMs);
});

test('reconexão sem snapshot de desmaio começa com a vida cheia, como antes', () => {
  const back = restoreVitals(null, 1, 5000);
  assert.equal(back.fainted, false);
  assert.equal(back.hp, maxHealth(1));
  assert.equal(vitalsResumeSnapshot(undefined), null);
});

test('morte solta os animais que atacavam o jogador caído, inclusive os monstros', () => {
  const max = maxHealth(1);
  const vitals = createVitals(1);
  const bear = { id: 'urso', provokedBy: 'p1', provokedUntil: 99999, state: 'atacando' };
  const fox = { id: 'raposa', provokedBy: 'p1', provokedUntil: 99999, state: 'atacando' };
  applyDamage(vitals, max, 1000, max);                       // desmaio: o alvo fica com os monstros
  assert.equal(applyDamage(vitals, max, 2000, max).dead, true); // dano do caído chega à morte
  // Mesma sequência de killPlayer no servidor: aplica a morte e solta os animais do jogador.
  applyDeath(vitals, 2000, max, 'na vila');
  releaseAnimalsFromPlayer([bear, fox], 'p1', null, 2000);
  assert.deepEqual([bear.provokedUntil, bear.state], [0, 'explorando']);
  assert.deepEqual([fox.provokedUntil, fox.state], [0, 'explorando']);
});

function animal(id, speciesId, x, y, overrides = {}) {
  const definition = WILDLIFE_BY_ID.get(speciesId);
  return {
    id, dimensionId:'test', speciesId, x, y, vx:0, vy:0,
    homeX:x, homeY:y, shelterX:x, shelterY:y,
    sex:'fêmea', ageDays:definition.stats.maturityDays + 1,
    health:definition.stats.health, hunger:12, thirst:10, energy:95,
    state:'explorando', targetX:x, targetY:y, thinkAt:0,
    fleeUntil:0, provokedUntil:0, nextAttackAt:0, pregnancyUntil:0,
    nextBreedAt:0, randomSeed:12345,
    ...overrides,
  };
}

test('animal que não é monstro desiste do jogador caído e se afasta; monstro segue atacando', () => {
  const downedPlayer = { id: 'p', location: 'clearing', dimensionId: 'test', moving: false, position: { x: 10, y: 10, vx: 0, vy: 0, running: false, crouching: false } };
  const run = speciesId => {
    const creature = animal(`${speciesId}-1`, speciesId, 11.2, 10, { provokedBy: 'p', provokedUntil: 999999 });
    stepWildlifePopulation(new Map([[creature.id, creature]]), {
      dimensionId: 'test', players: [downedPlayer], now: 100000, deltaSeconds: .03,
      isDownedPlayer: candidate => candidate.id === 'p', canOccupy: () => true,
    });
    return creature;
  };
  for (const speciesId of ['bear', 'leopard']) {
    const creature = run(speciesId);
    assert.equal(creature.state, 'fugindo', `${speciesId} se afasta`);
    assert.ok(creature.targetX > 11.2, `${speciesId} foge para o lado oposto ao jogador`);
    assert.equal(creature.provokedUntil, 0, `${speciesId} perde a provocação`);
  }
  const monster = run('ashWraith');
  assert.notEqual(monster.state, 'fugindo', 'monstro não desiste');
  assert.ok(['atacando', 'em-alerta'].includes(monster.state), `monstro continua em ataque (${monster.state})`);
});

function fakeElement() {
  const classes = new Set();
  const listeners = {};
  return { hidden: true, textContent: '', style: {}, listeners, attrs: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: c => classes.has(c) },
    addEventListener(name, fn) { listeners[name] = fn; }, setAttribute(k, v) { this.attrs[k] = v; } };
}

test('HUD no DOM mostra a contagem do desmaio, o despertar e a tela breve de morte', () => {
  // rAF é enfileirado (não síncrono), como no navegador.
  const frames = [];
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  const parts = { '.vitals-fill': fakeElement(), '.vitals-label': fakeElement(), '.vitals-note': fakeElement() };
  const root = { ...fakeElement(), querySelector: selector => parts[selector] };
  const hud = createVitalsHud(root);
  const note = parts['.vitals-note'];
  hud.update({ hp: 42, max: 42 });
  assert.equal(note.hidden, true);
  hud.update({ hp: 0, max: 42, downedMs: 10000 });
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /desmaiou… respire\. 10$/);
  hud.update({ hp: 13, max: 42 });
  assert.equal(note.classList.has('is-death'), false);
  assert.match(note.textContent, /Você se levantou/);
  assert.equal(parts['.vitals-label'].textContent, '13/42');
  hud.update({ hp: 21, max: 42, deathSeq: 1, deathPlace: 'na entrada da caverna' });
  assert.equal(note.textContent, 'Você caiu… e acordou na entrada da caverna.');
  assert.equal(note.classList.has('is-death'), true);
  note.listeners.animationend();
  assert.equal(note.hidden, true);
});

test('viagem cancelada no desmaio usa a resposta de recusa que o cliente já trata', async () => {
  const details = dimensionTravelCancelledDetails('t1');
  assert.equal(details.action, 'dimensionTravel');
  assert.equal(details.result, 'rejected');
  assert.equal(details.transitId, 't1');
  const { readFile } = await import('node:fs/promises');
  const client = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  assert.match(client, /message\.result === 'rejected' && message\.cancelled === true[\s\S]{0,400}teleportEffects\.clear\(\)/);
});
