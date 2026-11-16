import { GAME_DAY_DURATION_MS } from './game-time.mjs';

// Covil do Ninho: morro de pedra com boca na encosta, baú atrás da boca e guardiões
// fixos à frente da entrada. Os obstáculos entram em canOccupy (game/world.mjs), então
// cliente e servidor usam o mesmo contorno do morro.
export const LAIRS = Object.freeze({
  ninho: Object.freeze({
    id: 'ninho', dimensionId: 'surface', center: Object.freeze({ x: 566, y: 139 }),
    chest: Object.freeze({ x: 566, y: 133.5 }), mouth: Object.freeze({ x: 566, y: 137 }),
    // Postos à frente da entrada (y maior que a boca), fora do vão.
    guards: Object.freeze([
      Object.freeze({ x: 563.6, y: 140.4 }), Object.freeze({ x: 568.4, y: 140.4 }), Object.freeze({ x: 566, y: 142.3 }),
    ]),
    leash: 9,       // o guardião só persegue dentro de 9 tiles do próprio posto
    wakeRadius: 4,  // e só desperta com o jogador a até 4 tiles do posto
    interactRadius: 1.8, respawnMs: GAME_DAY_DURATION_MS,
    cooldownMs: GAME_DAY_DURATION_MS, reward: Object.freeze({ bronze: 200, ironShortSword: 1 }),
    obstacles: Object.freeze([
      Object.freeze({ x: 563.2, y: 135.1, radius: 1.0 }), // flanco esquerdo da boca
      Object.freeze({ x: 568.8, y: 135.1, radius: 1.0 }), // flanco direito da boca
      Object.freeze({ x: 564, y: 131.4, radius: 1.1 }),   // encosta atrás do baú
      Object.freeze({ x: 568, y: 131.4, radius: 1.1 }),
      Object.freeze({ x: 561.4, y: 138.9, radius: 0.9 }), // pedras soltas à frente
      Object.freeze({ x: 570.6, y: 138.9, radius: 0.9 }),
    ]),
  }),
});

// Contagem de recarga em mm:ss, arredondada para cima. Usada pelo servidor e pelo cliente.
export function formatLairCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function createLairGuards(lair = LAIRS.ninho, now = Date.now()) {
  return lair.guards.map((position, index) => ({
    id: `lair:${lair.id}:${index}`, dimensionId: lair.dimensionId, speciesId: 'caveWarden',
    lairId: lair.id, x: position.x, y: position.y, vx: 0, vy: 0,
    targetX: position.x, targetY: position.y, homeX: position.x, homeY: position.y,
    shelterX: position.x, shelterY: position.y, shelterId: `lair:${lair.id}:${index}`,
    shelterCover: null, shelterAt: null, health: 6, hunger: 0, thirst: 0, energy: 100,
    // Adulto desde o início: maturityDays do caveWarden é 1, e wildlifeStage('adulto') exige ageDays >= 1.
    ageDays: 1, lifeStage: 'adulto', sex: 'macho', state: 'vigiando', sheltered: false,
    thinkAt: now, randomSeed: index + 1, provokedUntil: 0, awarenessUntil: 0,
    pregnancyUntil: 0, groupId: `lair:${lair.id}`,
    // Desperto = perseguindo dentro da coleira. Volta a false quando nenhum jogador fica na coleira.
    awake: false,
  }));
}

export function lairView(lair, { guards = [], state = null, readyAt = null } = {}) {
  const alive = guards.some(animal => animal.lairId === lair.id && animal.health > 0);
  const viewState = state || (alive ? 'guarded' : readyAt && readyAt > Date.now() ? 'cooldown' : 'ready');
  return { id: lair.id, x: lair.center.x, y: lair.center.y,
    chest: { x: lair.chest.x, y: lair.chest.y }, mouth: { x: lair.mouth.x, y: lair.mouth.y },
    state: viewState === 'empty' ? 'empty' : viewState, readyAt: readyAt ?? null };
}
