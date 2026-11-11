// Daily routine model for the village people. Pure state: no server, no drawing.
// Roles: three woodcutters cut one tree a day in a fixed order that wraps around,
// two gatherers walk the same spots by the forest, one hunter goes after game.
// Sales are not open yet, so what they gather is kept on the NPC.

export const NPC_ROLES = Object.freeze({
  lumberjack: 'lumberjack',
  gatherer: 'gatherer',
  hunter: 'hunter',
});

// Assignment for the six existing villagers: three woodcutters, two gatherers, one hunter.
export const VILLAGE_ROUTINE_ROLES = Object.freeze({
  'village:tomas': NPC_ROLES.lumberjack,
  'village:bento': NPC_ROLES.lumberjack,
  'village:ivo': NPC_ROLES.lumberjack,
  'village:mara': NPC_ROLES.gatherer,
  'village:lia': NPC_ROLES.gatherer,
  'village:noa': NPC_ROLES.hunter,
});

export function createNpcRoutine(id, role, { offset = 0 } = {}) {
  if (!Object.values(NPC_ROLES).includes(role)) throw new TypeError(`Papel desconhecido: ${role}.`);
  return { id, role, offset, lastDay: null, stock: {} };
}

// Index of the tree (or spot) this NPC works on a given game day. Each NPC starts
// at its own offset, so the woodcutters do not all chop the same tree; the list wraps.
export function workIndexForDay(routine, dayIndex, listLength) {
  if (!Number.isInteger(dayIndex) || !Number.isInteger(listLength) || listLength <= 0) return null;
  return (((routine.offset + dayIndex) % listLength) + listLength) % listLength;
}

// Records what the NPC gathered today. Stock is kept on the NPC until sales exist.
export function retainGathered(routine, itemId, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError('Quantidade inválida.');
  const stock = { ...routine.stock, [itemId]: (routine.stock[itemId] || 0) + quantity };
  return { ...routine, stock };
}

export function markDay(routine, dayIndex) {
  return { ...routine, lastDay: dayIndex };
}
