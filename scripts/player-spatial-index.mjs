import { SPATIAL_CELL_SIZE } from '../game/area-of-interest.mjs';

function cellKey(x, y) { return `${x},${y}`; }
function cellFor(position, cellSize) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
    throw new TypeError('A posição precisa ter coordenadas finitas.');
  }
  return { x: Math.floor(position.x / cellSize), y: Math.floor(position.y / cellSize) };
}

export class PlayerSpatialIndex {
  #scopes = new Map();
  #entries = new Map();
  #cellSize;

  constructor({ cellSize = SPATIAL_CELL_SIZE } = {}) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('cellSize precisa ser maior que zero.');
    this.#cellSize = cellSize;
  }

  get size() { return this.#entries.size; }

  upsert(id, scope, position, value) {
    if (id === undefined || id === null || typeof scope !== 'string' || !scope) {
      throw new TypeError('Cada jogador precisa de um ID e um contexto espacial.');
    }
    const { x, y } = cellFor(position, this.#cellSize);
    const previous = this.#entries.get(id);
    if (previous?.scope === scope && previous.x === x && previous.y === y) {
      previous.value = value;
      this.#scopes.get(scope).get(cellKey(x, y)).set(id, value);
      return false;
    }

    if (previous) this.remove(id);
    let scopedCells = this.#scopes.get(scope);
    if (!scopedCells) {
      scopedCells = new Map();
      this.#scopes.set(scope, scopedCells);
    }
    const key = cellKey(x, y);
    let players = scopedCells.get(key);
    if (!players) {
      players = new Map();
      scopedCells.set(key, players);
    }
    players.set(id, value);
    this.#entries.set(id, { scope, x, y, value });
    return true;
  }

  remove(id) {
    const previous = this.#entries.get(id);
    if (!previous) return false;
    const scopedCells = this.#scopes.get(previous.scope);
    const key = cellKey(previous.x, previous.y);
    const players = scopedCells?.get(key);
    players?.delete(id);
    if (players?.size === 0) scopedCells.delete(key);
    if (scopedCells?.size === 0) this.#scopes.delete(previous.scope);
    this.#entries.delete(id);
    return true;
  }

  query(scope, position, radius) {
    if (typeof scope !== 'string' || !scope || !Number.isFinite(radius) || radius < 0) return [];
    const scopedCells = this.#scopes.get(scope);
    if (!scopedCells) return [];
    const reach = Math.ceil(radius / this.#cellSize);
    const center = cellFor(position, this.#cellSize);
    const radiusSquared = radius * radius;
    const matches = [];
    for (let y = center.y - reach; y <= center.y + reach; y += 1) {
      for (let x = center.x - reach; x <= center.x + reach; x += 1) {
        for (const value of scopedCells.get(cellKey(x, y))?.values() || []) {
          const candidate = value?.position;
          if (!Number.isFinite(candidate?.x) || !Number.isFinite(candidate?.y)) continue;
          const dx = candidate.x - position.x;
          const dy = candidate.y - position.y;
          if (dx * dx + dy * dy <= radiusSquared) matches.push(value);
        }
      }
    }
    return matches;
  }
}
