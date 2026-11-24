// Bestiário da masmorra do Covil do Ninho (D2, só a parte pura).
// Espécies recoloridas a partir dos forms de wildlife.mjs, escala por nível, regras de reaparecimento por sala,
// anti-farm e o planejamento inicial de quem nasce onde a partir do nível de dungeon-gen.mjs.
// Sem DOM, sem Math.random, sem Date: o relógio (now) e as posições dos jogadores chegam por parâmetro.
// Não liga no servidor nem no cliente. Regras em ARQUITETURA.md §4 (monstros e reaparecimento).

const MINUTE_MS = 60 * 1000;

export const DUNGEON_RULES = Object.freeze({
  roomMaxAlive: 4,
  instanceMaxAlive: 36,
  respawnMs: 5 * MINUTE_MS,
  playerClearanceTiles: 14,
  entranceSafeTiles: 14,
  antiFarmWindowMs: 10 * MINUTE_MS,
  spawnPointsPerRoom: 12,
});

// Faixas de profundidade. F2-F4 recebem espécies nas fatias seguintes.
export const DUNGEON_BANDS = Object.freeze([
  Object.freeze({ id: 'F1', minLevel: 1, maxLevel: 2 }),
  Object.freeze({ id: 'F2', minLevel: 3, maxLevel: 5 }),
  Object.freeze({ id: 'F3', minLevel: 6, maxLevel: 9 }),
  Object.freeze({ id: 'F4', minLevel: 10, maxLevel: Infinity }),
]);

export function bandOfLevel(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  return DUNGEON_BANDS.find(band => n >= band.minLevel && n <= band.maxLevel) || DUNGEON_BANDS.at(-1);
}

const COMMON_SPECIES = [
  {
    id: 'caveBear', label: 'Urso-pardo', form: 'bear', family: 'bear', sprite: 'caveBear',
    bands: [1, 2], behavior: 'territorial', kind: 'melee', weight: 1, group: { min: 1, max: 1 },
    baseHealth: 9, baseForce: 2.2, reach: 1.3, cooldownMs: 1800, baseSpeed: 2.8, armor: 0,
    wakeRadius: 5, leash: 8, size: [27, 22],
    colors: { body: '#77503a', shadow: '#392920', light: '#ad7952', accent: '#d8a56d', mark: '#231d1b' },
    drops: [{ item: 'rawMeat', chance: 0.6 }, { item: 'hide', chance: 0.4 }, { item: 'bone', chance: 0.3 }],
  },
  {
    id: 'mossSlime', label: 'Gosma-de-musgo', form: 'slime', family: 'slime', sprite: 'mossSlime',
    bands: [1, 1], behavior: 'swarm', kind: 'melee', weight: 3, group: { min: 2, max: 3 },
    baseHealth: 4, baseForce: 1, reach: 0.6, cooldownMs: 1400, baseSpeed: 1.4, armor: 0,
    wakeRadius: 3, leash: 6, size: [16, 12],
    colors: { body: '#687c45', shadow: '#34402d', light: '#a5b66b', accent: '#c7ce83', mark: '#293226' },
    drops: [{ item: 'gel', chance: 0.5 }],
  },
  {
    id: 'dustSpider', label: 'Aranhinha-de-poeira', form: 'spider', family: 'spider', sprite: 'dustSpider',
    bands: [1, 1], behavior: 'pack', kind: 'ambush', weight: 2, group: { min: 3, max: 4 },
    baseHealth: 2, baseForce: 0.8, reach: 0.6, cooldownMs: 1100, baseSpeed: 3.6, armor: 0,
    wakeRadius: 3, leash: 7, size: [13, 10],
    colors: { body: '#77736b', shadow: '#3e3b38', light: '#aaa398', accent: '#c59c57', mark: '#292725' },
    drops: [{ item: 'silk', chance: 0.4 }, { item: 'bone', chance: 0.1 }],
  },
].map(species => Object.freeze({ ...species,
  bands: Object.freeze([...species.bands]), group: Object.freeze({ ...species.group }),
  colors: Object.freeze({ ...species.colors }), size: Object.freeze([...species.size]),
  drops: Object.freeze(species.drops.map(drop => Object.freeze({ ...drop }))),
}));

export const DUNGEON_SPECIES = Object.freeze(COMMON_SPECIES);
export const DUNGEON_SPECIES_BY_ID = new Map(DUNGEON_SPECIES.map(species => [species.id, species]));

export const BOSSES = Object.freeze([
  Object.freeze({
    id: 'elderBear', label: 'Urso-ancião', form: 'bear', family: 'bear', sprite: 'elderBear',
    level: 2, bands: Object.freeze([1, 2]), behavior: 'territorial', kind: 'charge', armor: 0,
    baseHealth: 45, baseForce: 2.6, reach: 1.6, cooldownMs: 1900, baseSpeed: 2.8,
    size: Object.freeze([46, 38]),
    colors: Object.freeze({ body: '#716c60', shadow: '#393832', light: '#aaa18b', accent: '#ddd2b6', mark: '#702f2b' }),
    drops: Object.freeze([{ item: 'ironShortSword', chance: 1 }, { item: 'ironJerkin', chance: 1 }].map(Object.freeze)),
  }),
]);
export function bossFor(level) { return BOSSES.find(boss => boss.level === Math.floor(level)) || null; }
export function guardianFor(level) {
  const band = bandOfLevel(level);
  if (bossFor(level)) return null;
  return DUNGEON_SPECIES.find(species => level >= band.minLevel && level <= band.maxLevel && species.bands[0] <= band.minLevel && species.bands[1] >= band.minLevel)
    || (level >= 3 ? DUNGEON_SPECIES_BY_ID.get('caveBear') : null);
}

// Números do nível: k é a distância do início da faixa, limitada a seis níveis.
export function scaleSpecies(speciesOrId, level) {
  const species = typeof speciesOrId === 'string' ? DUNGEON_SPECIES_BY_ID.get(speciesOrId) || BOSSES.find(value => value.id === speciesOrId) : speciesOrId;
  if (!species) throw new Error(`espécie desconhecida na masmorra: ${speciesOrId}`);
  const n = Math.max(1, Math.floor(level));
  const band = bandOfLevel(n);
  const isBoss = BOSSES.includes(species);
  const k = isBoss ? 0 : Math.min(6, Math.max(0, n - band.minLevel));
  // Guardião das faixas intermediárias: endurece a vida e a força, com o dano comum limitado a 10.
  const isIntermediateGuardian = !isBoss && n >= 3 && guardianFor(n)?.id === species.id;
  const health = Math.max(1, Math.ceil(species.baseHealth * (isIntermediateGuardian ? 2.5 : 1) * (1 + 0.15 * k)));
  const force = round2(species.baseForce * (isIntermediateGuardian ? 1.2 : 1) * (1 + 0.08 * k));
  const speed = round2(species.baseSpeed + Math.min(0.3, 0.05 * k));
  return {
    id: species.id, level: n, band: band.id, k, behavior: species.behavior, kind: species.kind, armor: species.armor,
    health, force, damage: isBoss ? Math.max(1, Math.round(force * 4)) : Math.min(10, Math.max(1, Math.round(force * 4))),
    reach: species.reach, cooldownMs: species.cooldownMs, speed,
    wakeRadius: species.wakeRadius, leash: species.leash,
  };
}

export function speciesIdsForLevel(level) {
  const n = Math.max(1, Math.floor(level));
  return DUNGEON_SPECIES.filter(species => n >= species.bands[0] && n <= species.bands[1]).map(species => species.id);
}

export function dungeonWildlifeDefinition(id) {
  const species = DUNGEON_SPECIES_BY_ID.get(id) || BOSSES.find(value => value.id === id);
  if (!species) return null;
  return {
    id: species.id, label: species.label, form: species.form, size: [...species.size], colors: { ...species.colors },
    stats: { health: species.baseHealth, speed: species.baseSpeed, radius: species.family === 'bear' ? 0.48 : round3(species.size[0] / 100) },
    // `drops` segue wildlife.mjs: [item, quantidade]. `dropChances`, por índice, preserva as chances
    // que o consumidor deve aplicar ao sortear cada drop (o gerador comum wildlife-hunt usa chance no 3o campo).
    drops: species.drops.map(drop => [drop.item, drop.quantity ?? 1]),
    dropChances: species.drops.map(drop => drop.chance),
    attack: { mode: species.family === 'bear' ? 'swipe' : species.family === 'spider' ? 'bite' : 'bite', when: species.id === 'elderBear' ? 'intruder' : 'cornered', reach: species.reach, force: species.baseForce, cooldownMs: species.cooldownMs },
    senses: { sight: species.wakeRadius ?? 5, hearing: 8, smell: 6, night: 1, cone: 3 },
    aggression: 'monster', isMonster: true, family: species.family, sprite: species.sprite, bands: [...species.bands], armor: species.armor, kind: species.kind,
  };
}

export function dropsFor(speciesOrId) {
  const species = typeof speciesOrId === 'string' ? DUNGEON_SPECIES_BY_ID.get(speciesOrId) || BOSSES.find(value => value.id === speciesOrId) : speciesOrId;
  if (!species) throw new Error(`espécie desconhecida na masmorra: ${speciesOrId}`);
  return species.drops.map(drop => ({ item: drop.item, chance: drop.chance }));
}

export function groupOf(speciesOrId) {
  const species = typeof speciesOrId === 'string' ? DUNGEON_SPECIES_BY_ID.get(speciesOrId) : speciesOrId;
  if (!species) throw new Error(`espécie desconhecida na masmorra: ${speciesOrId}`);
  return species.group;
}

// Planejamento inicial: quem nasce onde, a partir do nível gerado (dungeon-gen.mjs).
// Não entram: a arena (só o chefe), a sala inicial (segura) e as células a menos de entranceSafeTiles passos da entrada.
export function planDungeonSpawns(dungeon) {
  const { w, h, cells, seed, level } = dungeon;
  const rooms = dungeon.rooms || [];
  const arena = dungeon.boss?.arena || null;
  const pool = speciesIdsForLevel(level);
  if (pool.length === 0) return { ok: false, level, pool, spawners: [], initial: [], instanceMaxAlive: DUNGEON_RULES.instanceMaxAlive, reason: 'sem-especies' };
  const dist = distancesFrom(dungeon, dungeon.entrance);
  const rand = createRandom(hash32([seed >>> 0, level >>> 0, 0x5afe]));
  const inArena = (x, y) => !!arena && x >= arena.x && x < arena.x + arena.w && y >= arena.y && y < arena.y + arena.h;

  const plan = { level, pool, spawners: [], initial: [], instanceMaxAlive: DUNGEON_RULES.instanceMaxAlive };
  let total = 0;

  // Passo 1: espécies e pontos de cada sala. Passo 2: quantos nascem (uma por sala primeiro, depois o resto),
  // para o teto de 36 não deixar as últimas salas sempre vazias.
  const rooms2 = [];
  rooms.forEach((room, index) => {
    if (room.kind === 'arena' || room.kind === 'start') return;
    const candidates = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (cells[y * w + x] !== 1 || inArena(x, y)) continue;
        const d = dist[y * w + x];
        if (d < DUNGEON_RULES.entranceSafeTiles) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return;

    const roomId = `r${index}`;
    const max = Math.min(DUNGEON_RULES.roomMaxAlive, 1 + Math.floor((room.w * room.h) / 60) + (level >= 2 ? 1 : 0));
    const spawnPoints = shuffle(candidates, rand).slice(0, DUNGEON_RULES.spawnPointsPerRoom);
    const wanted = Math.min(spawnPoints.length, 1 + Math.floor(rand() * max));
    // Só espécies cujo bando inteiro cabe no teto da sala.
    const fit = pool.filter(id => groupOf(id).min <= max);
    plan.spawners.push({ roomId, kind: room.kind, max, respawnMs: DUNGEON_RULES.respawnMs, species: fit, spawnPoints });
    rooms2.push({ roomId, spawnPoints, units: composeRoom(wanted, fit, rand), used: new Set(), nextUnit: 0 });
  });

  // Passo 2: cada passada põe o próximo bando inteiro de cada sala, em volta de um ponto âncora.
  // Bando que não cabe no teto da instância espera; o resto da sala segue.
  let progress = true;
  while (progress) {
    progress = false;
    for (const room of rooms2) {
      const unit = room.units[room.nextUnit];
      if (!unit || total + unit.size > DUNGEON_RULES.instanceMaxAlive) continue;
      const free = room.spawnPoints.filter(p => !room.used.has(`${p.x},${p.y}`));
      const anchor = free[0];
      const picks = free
        .sort((a, b) => dist2(a, anchor) - dist2(b, anchor) || a.y - b.y || a.x - b.x)
        .slice(0, unit.size);
      for (const point of picks) {
        room.used.add(`${point.x},${point.y}`);
        plan.initial.push({ roomId: room.roomId, species: unit.species, x: point.x, y: point.y });
      }
      total += unit.size;
      room.nextUnit++;
      progress = true;
    }
  }

  return plan;
}

// Uma tentativa de reaparecimento numa sala. Devolve { ok:true, point, points, species, size } ou { ok:false, reason }.
// rotation escolhe a espécie da lista da sala (em ordem determinística) e o tamanho do bando, dentro do mínimo e máximo.
// Bandos de qualquer espécie voltam inteiros e só quando há vaga para o grupo todo dentro do teto da sala e da instância; senão esperam
// o próximo ciclo ('sem-vaga-grupo'). Espécies solitárias voltam uma por vez (size 1).
export function planRespawn({
  spawner, aliveInRoom = 0, aliveInInstance = 0, players = [], occupied = new Set(),
  now, lastRespawnAt = null, lastRoomDeathAt = null, rotation = 0,
}) {
  const reject = reason => ({ ok: false, reason });
  if (!spawner || !Array.isArray(spawner.species) || spawner.species.length === 0) return reject('sem-especies');
  if (aliveInRoom >= spawner.max) return reject('sala-cheia');
  if (aliveInInstance >= DUNGEON_RULES.instanceMaxAlive) return reject('instancia-cheia');
  if (lastRespawnAt !== null && now - lastRespawnAt < spawner.respawnMs) return reject('intervalo');
  if (lastRoomDeathAt !== null && now - lastRoomDeathAt < spawner.respawnMs) return reject('sala-recente');
  const species = spawner.species[rotation % spawner.species.length];
  const { min, max: maxGroup } = groupOf(species);
  const size = min + (Math.floor(rotation / spawner.species.length) % (maxGroup - min + 1));
  const slots = Math.min(spawner.max - aliveInRoom, DUNGEON_RULES.instanceMaxAlive - aliveInInstance);
  if (size > slots) return reject('sem-vaga-grupo');
  const free = spawner.spawnPoints.filter(p => !occupied.has(`${p.x},${p.y}`));
  if (free.length === 0) return reject('sem-ponto-livre');
  const clear = free.filter(p => players.every(pl => Math.hypot(pl.x - p.x, pl.y - p.y) >= DUNGEON_RULES.playerClearanceTiles));
  if (clear.length === 0) return reject('jogador-perto');
  if (clear.length < size) return reject('sem-vaga-grupo');
  // O grupo nasce junto: o ponto âncora e os pontos livres mais próximos dele.
  const anchor = clear[0];
  const points = clear.slice().sort((a, b) => dist2(a, anchor) - dist2(b, anchor) || a.y - b.y || a.x - b.x).slice(0, size);
  return { ok: true, point: anchor, points, species, size };
}

// BFS de passos a partir de origem sobre piso aberto. -1 = inalcançável.
export function distancesFrom(dungeon, origin) {
  const { w, h, cells } = dungeon;
  const dist = new Int32Array(w * h).fill(-1);
  const start = origin.y * w + origin.x;
  const queue = [start];
  dist[start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % w, y = (index - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || cells[ny * w + nx] !== 1) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[index] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

// Monta os bandos de uma sala até `wanted` monstros. Cada bando tem tamanho sorteado entre min e max da espécie
// e só entra se couber no que falta. A espécie solitária mantém a sala preenchível.
function composeRoom(wanted, pool, rand) {
  const units = [];
  let left = wanted;
  while (left > 0) {
    const options = pool.filter(id => groupOf(id).min <= left);
    if (options.length === 0) break;
    const species = weightedPick(options, rand);
    const { min, max } = groupOf(species);
    const size = Math.min(left, min + Math.floor(rand() * (max - min + 1)));
    units.push({ species, size });
    left -= size;
  }
  return units;
}

function weightedPick(ids, rand) {
  const total = ids.reduce((sum, id) => sum + (DUNGEON_SPECIES_BY_ID.get(id)?.weight || 1), 0);
  let pick = rand() * total;
  for (const id of ids) { pick -= DUNGEON_SPECIES_BY_ID.get(id)?.weight || 1; if (pick < 0) return id; }
  return ids.at(-1);
}

function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function shuffle(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// mulberry32 e hash32 iguais aos de dungeon-gen.mjs (determinismo entre servidor e cliente).
function hash32(values) {
  let h = 0x811c9dc5;
  for (const value of values) {
    h = Math.imul(h ^ (value >>> 0), 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

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

function round2(value) { return Math.round(value * 100) / 100; }
function round3(value) { return Math.round(value * 1000) / 1000; }
