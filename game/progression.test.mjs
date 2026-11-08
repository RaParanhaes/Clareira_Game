import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRIBUTE_KEYS, MAX_PLAYER_LEVEL, PLAYER_ABILITIES, XP_POTIONS, XP_POTION_RECIPES,
  awardPotionXp, attributeAttackBonus, attributeSpellDamageBonus, incomingKnockbackMultiplier, learnPlayerAbility,
  movementSpeedMultiplier, normalizeProgression, storageCapacityForLevel, storagePageCountForLevel,
  xpRequiredForNextLevel,
} from './progression.mjs';
import { addInventoryItem, createInventory, inventorySnapshot } from './inventory.mjs';
import { WILDLIFE_BY_ID } from './wildlife.mjs';
import { huntWildlifeTarget } from './wildlife-hunt.mjs';

test('teleporte de combate I prepara por 0,9 segundo e o nivel II nao tem preparo', () => {
  assert.equal(PLAYER_ABILITIES.combatBlink.windupMs, 900);
  assert.equal(PLAYER_ABILITIES.combatBlinkII.windupMs, 0);
  assert.match(PLAYER_ABILITIES.combatBlink.description, /0,9 segundo/u);
  assert.match(PLAYER_ABILITIES.combatBlinkII.description, /sem preparo/u);
});

test('XP só avança pelo consumo das quatro poções e a curva exige mais XP a cada nível', () => {
  assert.equal(MAX_PLAYER_LEVEL, 30);
  assert.deepEqual(Object.keys(XP_POTIONS), ['xpPotionI', 'xpPotionII', 'xpPotionIII', 'xpPotionIV']);
  assert.equal(xpRequiredForNextLevel(1), 100);
  assert.equal(xpRequiredForNextLevel(2), 160);
  assert.ok(xpRequiredForNextLevel(3) > xpRequiredForNextLevel(2));
  assert.deepEqual(awardPotionXp({ level: 1, xp: 0 }, 'xpPotionI').progression, {
    level: 2, xp: 0, attributePoints: 1, skillPoints: 1,
    attributes: { force: 0, attack: 0, defense: 0, agility: 0, magic: 0, speed: 0 }, learnedAbilities: [],
  });
  assert.equal(awardPotionXp({ level: 19 }, 'xpPotionIV').status, 'level-locked');
  assert.equal(awardPotionXp({ level: MAX_PLAYER_LEVEL }, 'xpPotionI').status, 'max-level');
});

test('poções são limitadas, receitas sobem em tempo e usam materiais de caça raros', () => {
  const recipes = Object.values(XP_POTION_RECIPES);
  assert.deepEqual(recipes.map(recipe => recipe.durationMs), [600_000, 1_800_000, 3_600_000, 7_200_000]);
  assert.ok(recipes[3].cost.emberCore > 0);
  assert.ok(recipes[2].cost.cinderShard > 0);
  assert.deepEqual(XP_POTIONS.xpPotionI.maximumCarried, 3);
  assert.deepEqual(XP_POTIONS.xpPotionII.maximumCarried, 2);
  assert.deepEqual(XP_POTIONS.xpPotionIII.maximumCarried, 1);
  assert.deepEqual(XP_POTIONS.xpPotionIV.maximumCarried, 1);
  assert.equal(addInventoryItem(createInventory(), 'xpPotionIV', 2), 1);
  const legacy = inventorySnapshot(createInventory({ xpPotionIII: 1, xpPotionIV: 1, emberCore: 1 }));
  assert.equal(legacy.xpPotionIII, 1);
  assert.equal(legacy.xpPotionIV, 1);
  assert.equal(legacy.emberCore, 1);
  assert.ok(WILDLIFE_BY_ID.get('firefly').drops.some(([item]) => item === 'glowDust'));
  assert.ok(WILDLIFE_BY_ID.get('snake').drops.some(([item]) => item === 'venom'));
  assert.ok(WILDLIFE_BY_ID.get('ashWraith').drops.some(([item, quantity, chance]) => item === 'emberCore' && quantity === 1 && chance === 0.08));
});

test('o nível libera seis páginas de 18 espaços sem alterar os nove atalhos', () => {
  assert.deepEqual([1, 4, 5, 10, 15, 20, 25, 30].map(storagePageCountForLevel), [1, 1, 2, 3, 4, 5, 6, 6]);
  assert.deepEqual([1, 5, 10, 15, 20, 25].map(storageCapacityForLevel), [27, 45, 63, 81, 99, 117]);
});

test('os seis atributos têm efeitos de movimento, combate, defesa e magia', () => {
  assert.deepEqual(ATTRIBUTE_KEYS, ['force', 'attack', 'defense', 'agility', 'magic', 'speed']);
  assert.equal(movementSpeedMultiplier({ speed: 100, agility: 100 }), 1.75);
  assert.ok(Math.abs(movementSpeedMultiplier({ speed: 100, agility: 100, hasteActive: true }) - 2.45) < 1e-12);
  assert.equal(attributeAttackBonus({ force: 20, attack: 10 }, ['quickStrike']), 6);
  assert.equal(incomingKnockbackMultiplier({ defense: 100 }), 0.5);
  assert.equal(incomingKnockbackMultiplier({ defense: 0 }), 1);
  assert.equal(attributeSpellDamageBonus({ magic: 8 }), 2);
});

test('Arrancada exige nível 2, consome seu ponto e não acumula com Hiper Velocidade', () => {
  assert.equal(learnPlayerAbility({ level: 1, skillPoints: 1 }, 'sprintBurst').status, 'level-locked');
  const learned = learnPlayerAbility({ level: 2, skillPoints: 1 }, 'sprintBurst');
  assert.equal(learned.status, 'learned');
  assert.equal(learned.progression.skillPoints, 0);
  assert.ok(learned.progression.learnedAbilities.includes('sprintBurst'));
  assert.equal(movementSpeedMultiplier({ speed: 10, sprintBurstActive: true }), 1.375);
  assert.equal(movementSpeedMultiplier({ sprintBurstActive: true, hasteActive: true }), 1.4);
});

test('aprender técnica valida nível, atributos, pré-requisitos e pontos', () => {
  const locked = learnPlayerAbility({ level: 1 }, 'quickStrike');
  assert.equal(locked.status, 'level-locked');
  const missingForce = learnPlayerAbility({ level: 2, skillPoints: 1 }, 'quickStrike');
  assert.equal(missingForce.status, 'attribute-locked');
  const learned = learnPlayerAbility({ level: 2, skillPoints: 1, attributes: { force: 1 } }, 'quickStrike');
  assert.equal(learned.status, 'learned');
  assert.deepEqual(learned.progression.learnedAbilities, ['quickStrike']);
  const missingPrerequisite = learnPlayerAbility({ level: 16, skillPoints: 2, attributes: { agility: 8, magic: 10 } }, 'combatBlinkII');
  assert.equal(missingPrerequisite.status, 'prerequisite-locked');
  const universal = PLAYER_ABILITIES.universalTeleport;
  const universalResult = learnPlayerAbility({
    level: 20, skillPoints: 3, attributes: { agility: universal.attributes.agility, magic: universal.attributes.magic },
  }, 'universalTeleport');
  assert.equal(universalResult.status, 'learned');
  assert.deepEqual(normalizeProgression({ learnedAbilities: ['quickStrike', 'unknown'] }).learnedAbilities, ['quickStrike']);
});

test('poção perto do nível máximo informa exatamente o XP excedente', () => {
  const level = MAX_PLAYER_LEVEL - 1;
  const xp = xpRequiredForNextLevel(level) - 1;
  const result = awardPotionXp({ level, xp }, 'xpPotionIV');
  assert.equal(result.status, 'consumed');
  assert.equal(result.progression.level, MAX_PLAYER_LEVEL);
  assert.equal(result.gained, 1);
  assert.equal(XP_POTIONS.xpPotionIV.xp - result.gained, 5_999);
});

test('Bola de Fogo I combina o dano da magia com Magia e atinge um alvo real de caça', async () => {
  const ability = PLAYER_ABILITIES.fireballI;
  const player = { dimensionId: 'surface', position: { x: 10, y: 10 },
    inventory: createInventory({ level: 4, attributes: { magic: 8 }, learnedAbilities: ['fireballI'] }) };
  const animal = { id: 'spell-target', speciesId: 'ashWraith', dimensionId: 'surface',
    x: 10.5, y: 10.5, health: 10, sheltered: false };
  const result = await huntWildlifeTarget({
    player, animal, population: new Map(), now: 1_000, rangeOverride: ability.range,
    damageOverride: ability.damage + attributeSpellDamageBonus(player.inventory.attributes),
    weaponOverride: 'spell',
  });
  assert.equal(result.status, 'injured');
  assert.equal(result.damage, 4);
  assert.equal(result.health, 6);
  assert.equal(animal.health, 6);
  assert.equal(PLAYER_ABILITIES.fireballII.requires[0], 'fireballI');
  assert.ok(PLAYER_ABILITIES.fireballII.damage > ability.damage);
  assert.equal(PLAYER_ABILITIES.fireballII.dimensionDiscovery, 'inferno');
});
