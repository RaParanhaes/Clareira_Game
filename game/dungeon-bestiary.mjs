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

// Escala por nível: vida x(1+.35(N-1)) arredondada para cima; força x min(1.8, 1+.2(N-1)); velocidade +0,1 por nível (teto +0,4).
// Dano ao jogador = round(força x 4), antes da defesa.
export const DUNGEON_SCALE = Object.freeze({
  healthGrowth: 0.35,
  forceGrowth: 0.2,
  forceCap: 1.8,
  speedGrowth: 0.1,
  speedCap: 0.4,
});

// Drop fixo, sem redução por anti-farm (ARQUITETURA §4): osso 40% em todo monstro comum.
const BASE_DROP = Object.freeze({ item: 'bone', chance: 0.4 });

// group: tamanho do bando que nasce junto numa sala (sorteado entre min e max, por seed).
export const DUNGEON_SPECIES = Object.freeze([
  {
    id: 'stoneRat', label: 'Rato-da-pedra', form: 'rat', behavior: 'swarm', minLevel: 1, group: { min: 3, max: 4 },
    baseHealth: 2, baseForce: 0.55, reach: 0.57, cooldownMs: 1200, baseSpeed: 2.8,
    wakeRadius: 7, leash: 8,
    colors: { body: '#5d5862', shadow: '#2c2a31', light: '#837b86', accent: '#a7948f', mark: '#1e1d22' },
  },
  {
    id: 'caveBat', label: 'Morcego-da-gruta', form: 'raptor', behavior: 'flyer', minLevel: 1, group: { min: 1, max: 1 },
    baseHealth: 2, baseForce: 0.75, reach: 0.8, cooldownMs: 1400, baseSpeed: 5.0,
    wakeRadius: 9, leash: 12,
    colors: { body: '#3e3a4c', shadow: '#24212d', light: '#6c6682', accent: '#b7a6c9', mark: '#171520' },
  },
  {
    id: 'blindSnake', label: 'Cobra-cega', form: 'snake', behavior: 'ambush', minLevel: 1, group: { min: 1, max: 1 },
    baseHealth: 3, baseForce: 1.0, reach: 0.82, cooldownMs: 1700, baseSpeed: 1.7,
    wakeRadius: 3, leash: 5,
    colors: { body: '#4f5a48', shadow: '#2a3127', light: '#7a8a70', accent: '#b5ab7a', mark: '#1c221c' },
  },
  {
    id: 'gloomWolf', label: 'Lobo-de-gruta', form: 'wolf', behavior: 'pack', minLevel: 2, group: { min: 2, max: 2 },
    baseHealth: 5, baseForce: 1.1, reach: 1.2, cooldownMs: 1400, baseSpeed: 4.0,
    wakeRadius: 10, leash: 14,
    colors: { body: '#4b4f56', shadow: '#282b30', light: '#7d838c', accent: '#9aa3ad', mark: '#17191c' },
  },
  {
    id: 'coldWraith', label: 'Sombra fria', form: 'ashWraith', behavior: 'stalker', minLevel: 3, group: { min: 1, max: 1 },
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

// Drops da espécie. Sempre iguais: o anti-farm não esconde drop; ele só limita reaparecimento (planRespawn).
export function dropsFor(speciesOrId) {
  const species = typeof speciesOrId === 'string' ? DUNGEON_SPECIES_BY_ID.get(speciesOrId) : speciesOrId;
  if (!species) throw new Error(`espécie desconhecida na masmorra: ${speciesOrId}`);
  return species.drops.map(drop => ({ item: drop.item, chance: drop.chance }));
}

// Tamanho do bando de uma espécie (min e max).
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
    // Só espécies cujo bando cabe no teto da sala (bando de ratos não entra numa sala de 2).
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
// Regra de bando (decisão do coordenador, substitui o "um por vez" da §4): rato e lobo voltam com o grupo inteiro
// (rato 3 a 4, lobo 2) e só quando há vaga para o grupo todo dentro do teto da sala e da instância; senão esperam
// o próximo ciclo ('sem-vaga-grupo'). Espécies solitárias voltam uma por vez (size 1).
export function planRespawn({
  spawner, aliveInRoom = 0, aliveInInstance = 0, players = [], occupied = new Set(),
  now, lastRespawnAt = null, lastRoomDeathAt = null, rotation = 0,
}) {
  const reject = reason => ({ ok: false, reason });
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
// e só entra se couber no que falta. Sempre há espécie de bando 1, então a sala fecha no `wanted`.
function composeRoom(wanted, pool, rand) {
  const units = [];
  let left = wanted;
  while (left > 0) {
    const options = pool.filter(id => groupOf(id).min <= left);
    if (options.length === 0) break;
    const species = options[Math.floor(rand() * options.length)];
    const { min, max } = groupOf(species);
    const size = Math.min(left, min + Math.floor(rand() * (max - min + 1)));
    units.push({ species, size });
    left -= size;
  }
  return units;
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
