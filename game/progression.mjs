export const MAX_PLAYER_LEVEL = 30;
export const STORAGE_PAGE_SIZE = 18;
export const STORAGE_PAGE_UNLOCK_LEVELS = Object.freeze([1, 5, 10, 15, 20, 25]);
export const ATTRIBUTE_KEYS = Object.freeze(['force', 'attack', 'defense', 'agility', 'magic', 'speed']);
export const DEFAULT_ATTRIBUTES = Object.freeze(Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 0])));

export const PLAYER_ABILITIES = Object.freeze({
  quickStrike: Object.freeze({ label:'Golpe Certeiro', kind:'combat', description:'Aumenta o dano de golpes com ferramentas de caça.', skillPoints:1, minimumLevel:2, attributes:Object.freeze({ force:1 }), requires:Object.freeze([]) }),
  livingCartography: Object.freeze({ label:'Cartografia Viva', kind:'knowledge', description:'Revela uma área maior do mapa conforme você explora. Exige Magia 2.', skillPoints:1, minimumLevel:6, attributes:Object.freeze({ magic:2 }), requires:Object.freeze([]), mapDiscoveryRadius:2 }),
  heavyStrike: Object.freeze({ label:'Golpe Pesado', kind:'combat-technique', description:'Um golpe corpo a corpo forte contra um animal próximo. Exige Golpe Certeiro, Força 4 e Ataque 3.', skillPoints:2, minimumLevel:8, attributes:Object.freeze({ force:4, attack:3 }), requires:Object.freeze(['quickStrike']), range:1.6, damage:2, cooldownMs:7000 }),
  fireballI: Object.freeze({ label:'Bola de Fogo I', kind:'spell', description:'Lança fogo a um animal distante. Exige Magia 2.', skillPoints:1, minimumLevel:4, attributes:Object.freeze({ magic:2 }), requires:Object.freeze([]), range:8, damage:2, cooldownMs:5000 }),
  fireballII: Object.freeze({ label:'Bola de Fogo II', kind:'spell', description:'Uma chama mais forte e de maior alcance. Exige Magia 8.', skillPoints:2, minimumLevel:12, attributes:Object.freeze({ magic:8 }), requires:Object.freeze(['fireballI']), range:10, damage:4, cooldownMs:7000, dimensionDiscovery:'inferno' }),
  sprintBurst: Object.freeze({ label:'Arrancada', kind:'buff', description:'Acelera 25% por 1,5 s. Exige nível 2 e 1 ponto de habilidade.', skillPoints:1, minimumLevel:2, attributes:Object.freeze({}), requires:Object.freeze([]), durationMs:1500, cooldownMs:12000 }),
  haste: Object.freeze({ label:'Hiper Velocidade', kind:'buff', description:'Corre 40% mais rápido por 8 segundos. Exige Velocidade 3 e Agilidade 3.', skillPoints:1, minimumLevel:6, attributes:Object.freeze({ speed:3, agility:3 }), requires:Object.freeze([]), durationMs:8000, cooldownMs:25000 }),
  hyperEvasion: Object.freeze({ label:'Hiper Esquiva', kind:'evasion', description:'Evita o próximo empurrão por 0,9 segundo. Exige Agilidade 6.', skillPoints:2, minimumLevel:10, attributes:Object.freeze({ agility:6 }), requires:Object.freeze([]), durationMs:900, cooldownMs:12000 }),
  combatBlink: Object.freeze({ label:'Teleporte de Combate I', kind:'mobility', description:'Canaliza por 0,9 segundo e teleporta você 3,5 espaços na direção escolhida. Exige Agilidade 3 e Magia 4.', skillPoints:2, minimumLevel:8, attributes:Object.freeze({ agility:3, magic:4 }), requires:Object.freeze([]), distance:3.5, windupMs:900, cooldownMs:10000 }),
  combatBlinkII: Object.freeze({ label:'Teleporte de Combate II', kind:'mobility', description:'Teleporta você sem preparo por 6 espaços e recarrega em 5,5 segundos. Exige Agilidade 8 e Magia 10.', skillPoints:2, minimumLevel:16, attributes:Object.freeze({ agility:8, magic:10 }), requires:Object.freeze(['combatBlink']), distance:6, windupMs:0, cooldownMs:5500 }),
  universalTeleport: Object.freeze({ label:'Teleporte Universal', kind:'travel', description:'Teletransporta você a um ponto seguro da dimensão atual, escolhido no mapa. Exige nível 20, Agilidade 8 e Magia 10.', skillPoints:3, minimumLevel:20, attributes:Object.freeze({ agility:8, magic:10 }), requires:Object.freeze([]), cooldownMs:45000 }),
});

export function normalizeLearnedAbilities(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(id => Object.hasOwn(PLAYER_ABILITIES, id)))].sort();
}

export function mapDiscoveryRadiusForAbilities(learnedAbilities = []) {
  if (!Array.isArray(learnedAbilities)) return 1;
  return learnedAbilities.reduce((radius, abilityId) =>
    Math.max(radius, PLAYER_ABILITIES[abilityId]?.mapDiscoveryRadius || 1), 1);
}

export const XP_POTION_RECIPES = Object.freeze({
  xpPotionI: Object.freeze({ durationMs:600_000, cost:Object.freeze({ glowDust:5, berries:12, charcoal:6 }) }),
  xpPotionII: Object.freeze({ durationMs:1_800_000, cost:Object.freeze({ glowDust:10, venom:2, berries:20, charcoal:10 }) }),
  xpPotionIII: Object.freeze({ durationMs:3_600_000, cost:Object.freeze({ glowDust:15, venom:5, bone:5, ironIngot:3, cinderShard:2, charcoal:12 }) }),
  xpPotionIV: Object.freeze({ durationMs:7_200_000, cost:Object.freeze({ glowDust:20, venom:10, bone:10, ironIngot:8, emberCore:1, charcoal:20 }) }),
});

export const XP_POTIONS = Object.freeze({
  xpPotionI: Object.freeze({ label: 'Poção de XP I', xp: 100, stackLimit: 3, minimumLevel: 1, maximumCarried: 3 }),
  xpPotionII: Object.freeze({ label: 'Poção de XP II', xp: 500, stackLimit: 2, minimumLevel: 5, maximumCarried: 2 }),
  xpPotionIII: Object.freeze({ label: 'Poção de XP III', xp: 1800, stackLimit: 1, minimumLevel: 10, maximumCarried: 1 }),
  xpPotionIV: Object.freeze({ label: 'Poção de XP IV', xp: 6000, stackLimit: 1, minimumLevel: 20, maximumCarried: 1 }),
});

export function xpRequiredForNextLevel(level) {
  const safeLevel = Number.isSafeInteger(level) ? Math.max(1, Math.min(MAX_PLAYER_LEVEL, level)) : 1;
  const step = safeLevel - 1;
  return 100 + 50 * step + 10 * step * step;
}

export function normalizeProgression(value = {}) {
  const level = Number.isSafeInteger(value.level) ? Math.max(1, Math.min(MAX_PLAYER_LEVEL, value.level)) : 1;
  const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [
    key, Number.isSafeInteger(value.attributes?.[key]) ? Math.max(0, Math.min(100, value.attributes[key])) : 0,
  ]));
  return {
    level,
    xp: Number.isSafeInteger(value.xp) ? Math.max(0, Math.min(xpRequiredForNextLevel(level) - 1, value.xp)) : 0,
    attributePoints: Number.isSafeInteger(value.attributePoints) ? Math.max(0, Math.min(999, value.attributePoints)) : 0,
    skillPoints: Number.isSafeInteger(value.skillPoints) ? Math.max(0, Math.min(999, value.skillPoints)) : 0,
    attributes,
    learnedAbilities: normalizeLearnedAbilities(value.learnedAbilities),
  };
}


export function learnPlayerAbility(value, abilityId) {
  const progression = normalizeProgression(value);
  const ability = PLAYER_ABILITIES[abilityId];
  if (!ability) return { status:'unknown-ability', progression };
  if (progression.learnedAbilities.includes(abilityId)) return { status:'already-known', progression, ability };
  if (progression.level < ability.minimumLevel) return { status:'level-locked', progression, ability };
  const missingAttribute = Object.entries(ability.attributes).find(([key, required]) => progression.attributes[key] < required);
  if (missingAttribute) return { status:'attribute-locked', progression, ability, attribute:missingAttribute[0], required:missingAttribute[1] };
  const missingAbility = ability.requires.find(required => !progression.learnedAbilities.includes(required));
  if (missingAbility) return { status:'prerequisite-locked', progression, ability, requiredAbility:missingAbility };
  if (progression.skillPoints < ability.skillPoints) return { status:'points-needed', progression, ability };
  progression.skillPoints -= ability.skillPoints;
  progression.learnedAbilities = normalizeLearnedAbilities([...progression.learnedAbilities, abilityId]);
  return { status:'learned', progression, ability };
}

export function storagePageCountForLevel(level) {
  const safeLevel = Number.isSafeInteger(level) ? Math.max(1, Math.min(MAX_PLAYER_LEVEL, level)) : 1;
  return STORAGE_PAGE_UNLOCK_LEVELS.filter(requiredLevel => safeLevel >= requiredLevel).length;
}

export function storageCapacityForLevel(level) {
  return 9 + storagePageCountForLevel(level) * STORAGE_PAGE_SIZE;
}

export function awardPotionXp(value, potionId) {
  const progression = normalizeProgression(value);
  const potion = XP_POTIONS[potionId];
  if (!potion) return { status: 'unknown-potion', progression, gained: 0, levelsGained: 0 };
  if (progression.level < potion.minimumLevel) return { status: 'level-locked', progression, potion, gained: 0, levelsGained: 0 };
  if (progression.level >= MAX_PLAYER_LEVEL) return { status: 'max-level', progression, potion, gained: 0, levelsGained: 0 };
  let remaining = potion.xp;
  let levelsGained = 0;
  while (remaining > 0 && progression.level < MAX_PLAYER_LEVEL) {
    const needed = xpRequiredForNextLevel(progression.level) - progression.xp;
    if (remaining < needed) {
      progression.xp += remaining;
      remaining = 0;
      break;
    }
    remaining -= needed;
    progression.level += 1;
    progression.xp = 0;
    progression.attributePoints = Math.min(999, progression.attributePoints + 1);
    if (progression.level % 2 === 0) progression.skillPoints = Math.min(999, progression.skillPoints + 1);
    levelsGained += 1;
  }
  return { status: 'consumed', progression, potion, gained: potion.xp - remaining, levelsGained,
    unlockedStoragePages: storagePageCountForLevel(progression.level) };
}


export function movementSpeedMultiplier(attributes = {}) {
  const speed = Number.isSafeInteger(attributes.speed) ? Math.max(0, Math.min(100, attributes.speed)) : 0;
  const agility = Number.isSafeInteger(attributes.agility) ? Math.max(0, Math.min(100, attributes.agility)) : 0;
  const trained = 1 + Math.min(0.5, speed * 0.01) + Math.min(0.25, agility * 0.0025);
  return trained * (attributes.hasteActive === true ? 1.4 : attributes.sprintBurstActive === true ? 1.25 : 1);
}

export function attributeAttackBonus(attributes = {}, learnedAbilities = []) {
  const attack = Number.isSafeInteger(attributes.attack) ? Math.max(0, Math.min(100, attributes.attack)) : 0;
  const force = Number.isSafeInteger(attributes.force) ? Math.max(0, Math.min(100, attributes.force)) : 0;
  return Math.floor(attack / 5) + Math.floor(force / 10) + (learnedAbilities.includes('quickStrike') ? 2 : 0);
}

export function attributeSpellDamageBonus(attributes = {}) {
  const magic = Number.isSafeInteger(attributes.magic) ? Math.max(0, Math.min(100, attributes.magic)) : 0;
  return Math.floor(magic / 4);
}

export function incomingKnockbackMultiplier(attributes = {}) {
  const defense = Number.isSafeInteger(attributes.defense) ? Math.max(0, Math.min(100, attributes.defense)) : 0;
  return 1 - Math.min(0.5, defense * 0.005);
}
