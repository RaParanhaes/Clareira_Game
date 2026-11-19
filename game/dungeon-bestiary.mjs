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
  dropFactors: Object.freeze([1, 0.5, 0.25, 0]),
  spawnPointsPerRoom: 12,
});

// Escala por nível: vida x(1+.35(N-1)) arredondada para cima; força x min(1.8, 1+.2(N-1)); velocidade +0,1 por nível (teto +0,4).
// Dano ao jogador = round(força x 4), antes da defesa.
export const DUNGEON_SCALE = Object.freeze({
  healthGrowth: 0.35,
  forceGrowth: 0.2,
  forceCap: 1.8,
  speedGrowth: 0.1,
  speedCap: 0.4,
});

const BASE_DROP = Object.freeze({ item: 'bone', chance: 0.4 });

export const DUNGEON_SPECIES = Object.freeze([
  {
    id: 'rat', label: 'Rato-da-pedra', form: 'rat', behavior: 'swarm', minLevel: 1,
    baseHealth: 2, baseForce: 0.55, reach: 0.57, cooldownMs: 1200, baseSpeed: 2.8,
    wakeRadius: 7, leash: 8,
    colors: { body: '#5d5862', shadow: '#2c2a31', light: '#837b86', accent: '#a7948f', mark: '#1e1d22' },
  },
  {
    id: 'bat', label: 'Morcego-da-gruta', form: 'raptor', behavior: 'flyer', minLevel: 1,
    baseHealth: 2, baseForce: 0.75, reach: 0.8, cooldownMs: 1400, baseSpeed: 5.0,
    wakeRadius: 9, leash: 12,
    colors: { body: '#3e3a4c', shadow: '#24212d', light: '#6c6682', accent: '#b7a6c9', mark: '#171520' },
  },
  {
    id: 'snake', label: 'Cobra-cega', form: 'snake', behavior: 'ambush', minLevel: 1,
    baseHealth: 3, baseForce: 1.0, reach: 0.82, cooldownMs: 1700, baseSpeed: 1.7,
    wakeRadius: 3, leash: 5,
    colors: { body: '#4f5a48', shadow: '#2a3127', light: '#7a8a70', accent: '#b5ab7a', mark: '#1c221c' },
  },
  {
    id: 'wolf', label: 'Lobo-de-gruta', form: 'wolf', behavior: 'pack', minLevel: 2,
    baseHealth: 5, baseForce: 1.1, reach: 1.2, cooldownMs: 1400, baseSpeed: 4.0,
    wakeRadius: 10, leash: 14,
    colors: { body: '#4b4f56', shadow: '#282b30', light: '#7d838c', accent: '#9aa3ad', mark: '#17191c' },
  },
  {
    id: 'wraith', label: 'Sombra fria', form: 'ashWraith', behavior: 'stalker', minLevel: 3,
    baseHealth: 8, baseForce: 1.5, reach: 1.25, cooldownMs: 1700, baseSpeed: 3.1,
    wakeRadius: 6, leash: 10,
    colors: { body: '#3b4c58', shadow: '#1f2a33', light: '#6f8c9c', accent: '#b9dbe8', mark: '#132028' },
  },
].map(species => Object.freeze({
  ...species,
  colors: Object.freeze({ ...species.colors }),
  drops: Object.freeze([Object.freeze({ ...BASE_DROP })]),
})));

export const DUNGEON_SPECIES_BY_ID = new Map(DUNGEON_SPECIES.map(species => [species.id, species]));

// Espécies que podem nascer num nível (a sombra só a partir do 3).
export function speciesIdsForLevel(level) {
  const n = Math.max(1, Math.floor(level));
  return DUNGEON_SPECIES.filter(species => species.minLevel <= n).map(species => species.id);
}

// Números de uma espécie no nível N. Só cresce com a profundidade.
export function scaleSpecies(speciesOrId, level) {
  const species = typeof speciesOrId === 'string' ? DUNGEON_SPECIES_BY_ID.get(speciesOrId) : speciesOrId;
  if (!species) throw new Error(`espécie desconhecida na masmorra: ${speciesOrId}`);
  const n = Math.max(1, Math.floor(level));
  const health = Math.max(1, Math.ceil(species.baseHealth * (1 + DUNGEON_SCALE.healthGrowth * (n - 1))));
  const force = round2(species.baseForce * Math.min(DUNGEON_SCALE.forceCap, 1 + DUNGEON_SCALE.forceGrowth * (n - 1)));
  const speed = round2(species.baseSpeed + Math.min(DUNGEON_SCALE.speedCap, DUNGEON_SCALE.speedGrowth * (n - 1)));
  return {
    id: species.id, level: n, behavior: species.behavior,
    health, force, damage: Math.max(1, Math.round(force * 4)),
    reach: species.reach, cooldownMs: species.cooldownMs, speed,
    wakeRadius: species.wakeRadius, leash: species.leash,
  };
}

// Drops sem moeda. O fator vem de dropFactorFor (anti-farm); 1 = normal.
export function dropsFor(speciesOrId, dropFactor = 1) {
  const species = typeof speciesOrId === 'string' ? DUNGEON_SPECIES_BY_ID.get(speciesOrId) : speciesOrId;
  if (!species) throw new Error(`espécie desconhecida na masmorra: ${speciesOrId}`);
  const factor = Math.min(1, Math.max(0, dropFactor));
  return species.drops.map(drop => ({ item: drop.item, chance: round3(drop.chance * factor) }));
}

// Anti-farm: quantas limpezas recentes da mesma sala já existem (na janela) define o fator de drop.
export function dropFactorFor(recentClears) {
  const factors = DUNGEON_RULES.dropFactors;
  return factors[Math.min(Math.max(0, recentClears), factors.length - 1)];
}

// Registra uma limpeza (sala sem monstros vivos depois de ter tido). Devolve novo histórico e o fator desta limpeza.
// Não muta o histórico recebido.
export function recordRoomClear(history = {}, roomId, now, windowMs = DUNGEON_RULES.antiFarmWindowMs) {
  const previous = (history[roomId] || []).filter(at => now - at < windowMs && now >= at);
  const dropFactor = dropFactorFor(previous.length);
  return {
    history: { ...history, [roomId]: [...previous, now] },
    dropFactor,
  };
}

// Planejamento inicial: quem nasce onde, a partir do nível gerado (dungeon-gen.mjs).
// Não entram: a arena (só o chefe), a sala inicial (segura) e as células a menos de entranceSafeTiles passos da entrada.
export function planDungeonSpawns(dungeon) {
  const { w, h, cells, seed, level } = dungeon;
  const rooms = dungeon.rooms || [];
  const arena = dungeon.boss?.arena || null;
  const pool = speciesIdsForLevel(level);
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
    plan.spawners.push({ roomId, kind: room.kind, max, respawnMs: DUNGEON_RULES.respawnMs, species: pool, spawnPoints });
    rooms2.push({ roomId, spawnPoints, wanted, placed: 0 });
  });

  for (let pass = 0; pass < DUNGEON_RULES.roomMaxAlive; pass++) {
    for (const room of rooms2) {
      if (total >= DUNGEON_RULES.instanceMaxAlive) break;
      if (room.placed >= room.wanted || room.placed >= room.spawnPoints.length) continue;
      const point = room.spawnPoints[room.placed];
      const species = pool[Math.floor(rand() * pool.length)];
      plan.initial.push({ roomId: room.roomId, species, x: point.x, y: point.y });
      room.placed++;
      total++;
    }
  }

  return plan;
}

// Uma tentativa de reaparecimento numa sala. Devolve { ok:true, point, species } ou { ok:false, reason }.
// rotation escolhe a espécie da lista da sala (quem nasce, em ordem determinística).
export function planRespawn({
  spawner, aliveInRoom = 0, aliveInInstance = 0, players = [], occupied = new Set(),
  now, lastRespawnAt = null, lastRoomDeathAt = null, rotation = 0,
}) {
  const reject = reason => ({ ok: false, reason });
  if (aliveInRoom >= spawner.max) return reject('sala-cheia');
  if (aliveInInstance >= DUNGEON_RULES.instanceMaxAlive) return reject('instancia-cheia');
  if (lastRespawnAt !== null && now - lastRespawnAt < spawner.respawnMs) return reject('intervalo');
  if (lastRoomDeathAt !== null && now - lastRoomDeathAt < spawner.respawnMs) return reject('sala-recente');
  const free = spawner.spawnPoints.filter(p => !occupied.has(`${p.x},${p.y}`));
  if (free.length === 0) return reject('sem-ponto-livre');
  const clear = free.filter(p => players.every(pl => Math.hypot(pl.x - p.x, pl.y - p.y) >= DUNGEON_RULES.playerClearanceTiles));
  if (clear.length === 0) return reject('jogador-perto');
  return { ok: true, point: clear[0], species: spawner.species[rotation % spawner.species.length] };
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
