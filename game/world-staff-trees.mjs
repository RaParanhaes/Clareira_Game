// Staff tree placement and removal, expressed as ordinary world edits so the game renders them without changes.
import { randomBytes } from 'node:crypto';
import { normalizeWorldDefinition, updateWorldEdits } from './world-edits.mjs';

export const STAFF_TREE_CHANGE_LIMIT = 200;
const TREE_TARGET = /^(?:seed:-?\d{1,15}|authored:\d{1,3}|maptree:[a-z0-9-]{1,64})$/i;

function uniqueSuffix() {
  return randomBytes(6).toString('hex');
}

// Removing a tree that already has a removal edit is a no-op, so repeated clicks do not grow the document.
export function planStaffTreeChanges(definition, { placements = [], removals = [], tiles = [], moves = [] } = {}, { worldSize = 10_000 } = {}) {
  if (!Array.isArray(placements) || !Array.isArray(removals) || !Array.isArray(tiles) || !Array.isArray(moves)) throw new TypeError('As alterações de árvores são inválidas.');
  if (placements.length + removals.length + tiles.length + moves.length === 0) throw new TypeError('Nenhuma alteração foi informada.');
  if (placements.length + removals.length + tiles.length + moves.length > STAFF_TREE_CHANGE_LIMIT) {
    throw new RangeError(`Envie no máximo ${STAFF_TREE_CHANGE_LIMIT} alterações por vez.`);
  }
  const current = normalizeWorldDefinition(definition);
  const alreadyRemoved = new Set(current.edits.filter(edit => edit.type === 'tree-remove').map(edit => edit.targetId));
  const seenRemovals = new Set();
  const upserts = placements.map(point => ({ id: `staff-tree-${uniqueSuffix()}`, type: 'tree', x: point?.x, y: point?.y }));
  for (const removal of removals) {
    if (typeof removal?.targetId !== 'string' || !TREE_TARGET.test(removal.targetId)) {
      throw new TypeError('Escolha uma árvore válida para remover.');
    }
    if (alreadyRemoved.has(removal.targetId) || seenRemovals.has(removal.targetId)) continue;
    seenRemovals.add(removal.targetId);
    upserts.push({ id: `staff-fell-${uniqueSuffix()}`, type: 'tree-remove', targetId: removal.targetId, x: removal.x, y: removal.y });
  }
  const standing = new Map(current.edits.filter(edit => edit.type === 'tree').map(edit => [`maptree:${edit.id}`, edit]));
  const moved = new Set();
  for (const move of moves) {
    const tree = standing.get(move?.targetId);
    if (!tree || alreadyRemoved.has(move.targetId) || seenRemovals.has(move.targetId) || moved.has(move.targetId)) {
      throw new TypeError('Selecione uma árvore plantada pela equipe que ainda esteja no mapa.');
    }
    moved.add(move.targetId);
    if (tree.x !== move.x || tree.y !== move.y) upserts.push({ ...tree, x: move.x, y: move.y });
  }
  const byTile = new Map();
  for (const { x, y, surface } of tiles) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= worldSize || y >= worldSize
        || !['path', 'ground', 'reset'].includes(surface)) throw new TypeError('Tile ou superfície inválida.');
    const id = `tile-surface-${x}-${y}`;
    byTile.set(id, { id, type: 'tile-surface', x, y, surface });
  }
  const existing = new Map(current.edits.filter(edit => edit.type === 'tile-surface').map(edit => [edit.id, edit.surface]));
  const removeIds = [];
  for (const tile of byTile.values()) {
    if (tile.surface === 'reset') {
      if (existing.has(tile.id)) removeIds.push(tile.id);
    } else if (existing.get(tile.id) !== tile.surface) upserts.push(tile);
  }
  const updated = updateWorldEdits(current, { upserts, removeIds }, { worldSize });
  return { definition: updated, changed: updated.revision !== current.revision };
}

// Trees the staff placed (or any tree edit) that still stand, with the id the game uses for them.
export function listStandingStaffTrees(definition) {
  const current = normalizeWorldDefinition(definition);
  const removed = new Set(current.edits.filter(edit => edit.type === 'tree-remove').map(edit => edit.targetId));
  return current.edits
    .filter(edit => edit.type === 'tree' && !removed.has(`maptree:${edit.id}`))
    .map(edit => ({ targetId: `maptree:${edit.id}`, x: edit.x, y: edit.y }));
}
