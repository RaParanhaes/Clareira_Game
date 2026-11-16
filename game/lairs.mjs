import { GAME_DAY_DURATION_MS } from './game-time.mjs';

export const LAIRS = Object.freeze({
  ninho: Object.freeze({
    id: 'ninho', dimensionId: 'surface', center: Object.freeze({ x: 566, y: 139 }),
    chest: Object.freeze({ x: 566, y: 133.5 }), mouth: Object.freeze({ x: 566, y: 137 }),
    guards: Object.freeze([
      Object.freeze({ x: 562, y: 138 }), Object.freeze({ x: 570, y: 139 }), Object.freeze({ x: 566, y: 141 }),
    ]), leash: 9, interactRadius: 1.8, respawnMs: GAME_DAY_DURATION_MS,
    cooldownMs: GAME_DAY_DURATION_MS, reward: Object.freeze({ bronze: 200, ironShortSword: 1 }),
    obstacles: Object.freeze([
      Object.freeze({ x: 563.8, y: 136.1, radius: 1.15 }),
      Object.freeze({ x: 568.2, y: 136.1, radius: 1.15 }),
      Object.freeze({ x: 564, y: 141.8, radius: 1.2 }),
      Object.freeze({ x: 568, y: 141.8, radius: 1.2 }),
    ]),
  }),
});

export function createLairGuards(lair = LAIRS.ninho, now = Date.now()) {
  return lair.guards.map((position, index) => ({
    id: `lair:${lair.id}:${index}`, dimensionId: lair.dimensionId, speciesId: 'caveWarden',
    lairId: lair.id, x: position.x, y: position.y, vx: 0, vy: 0,
    targetX: position.x, targetY: position.y, homeX: position.x, homeY: position.y,
    shelterX: position.x, shelterY: position.y, shelterId: `lair:${lair.id}:${index}`,
    shelterCover: null, shelterAt: null, health: 6, hunger: 0, thirst: 0, energy: 100,
    ageDays: 0, lifeStage: 'adulto', sex: 'macho', state: 'vigiando', sheltered: false,
    thinkAt: now, randomSeed: index + 1, provokedUntil: 0, awarenessUntil: 0,
    pregnancyUntil: 0, groupId: `lair:${lair.id}`,
  }));
}

export function lairView(lair, { guards = [], state = null, readyAt = null } = {}) {
  const alive = guards.some(animal => animal.lairId === lair.id && animal.health > 0);
  const viewState = state || (alive ? 'guarded' : readyAt && readyAt > Date.now() ? 'cooldown' : 'ready');
  return { id: lair.id, x: lair.center.x, y: lair.center.y,
    chest: { x: lair.chest.x, y: lair.chest.y }, mouth: { x: lair.mouth.x, y: lair.mouth.y },
    state: viewState === 'empty' ? 'empty' : viewState, readyAt: readyAt ?? null };
}
