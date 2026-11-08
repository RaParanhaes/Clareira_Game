function clone(items) {
  return Array.isArray(items) ? items.map(item => ({ ...item, ...(item.properties ? { properties: { ...item.properties } } : {}) })) : [];
}

function apply(items, command) {
  const next = clone(items);
  if (command.name === 'placeFurniture') {
    next.push({ id: `pending-${command.requestId}`, kind: command.kind, x: command.x, y: command.y,
      rotation: 0, ...(command.kind === 'lamp' ? { enabled: true } : {}) });
    return next;
  }
  const index = next.findIndex(item => item.id === command.id);
  if (index < 0) return null;
  const item = next[index];
  if (item.supportId || next.some(other => other.supportId === item.id)) return null;
  if (command.name === 'moveFurniture') { item.x = command.x; item.y = command.y; }
  else if (command.name === 'rotateFurniture') item.rotation = ((item.rotation || 0) + 1) % 4;
  else if (command.name === 'removeFurniture') next.splice(index, 1);
  else if (command.name === 'useFurniture' && item.kind === 'lamp') item.enabled = item.enabled === false;
  else return null;
  return next;
}

function matches(items, command) {
  const item = items.find(candidate => candidate.id === command.id);
  if (command.name === 'placeFurniture') return items.some(candidate => candidate.id !== `pending-${command.requestId}`
    && candidate.kind === command.kind && Math.abs(candidate.x - command.x) < 0.001 && Math.abs(candidate.y - command.y) < 0.001);
  if (command.name === 'removeFurniture') return !item;
  if (!item) return false;
  if (command.name === 'moveFurniture') return Math.abs(item.x - command.x) < 0.001 && Math.abs(item.y - command.y) < 0.001;
  if (command.name === 'rotateFurniture') return item.rotation === command.expectedRotation;
  if (command.name === 'useFurniture' && item.kind === 'lamp') return item.enabled === command.expectedEnabled;
  return false;
}

function overlay(items, command) {
  const next = clone(items), predicted = apply(next, command);
  return predicted || next;
}

export function createRoomFurniturePrediction() {
  let authoritative = [];
  let pending = null;
  return {
    enqueue(items, command) {
      if (pending) return null;
      const before = clone(items);
      const predicted = apply(before, command);
      if (!predicted) return null;
      authoritative = before;
      const target = before.find(item => item.id === command.id);
      const normalized = { ...command };
      if (target && command.name === 'rotateFurniture') normalized.expectedRotation = ((target.rotation || 0) + 1) % 4;
      if (target && command.name === 'useFurniture') normalized.expectedEnabled = target.enabled === false;
      pending = { command: normalized, accepted: false };
      return predicted;
    },
    snapshot(items) {
      authoritative = clone(items);
      if (!pending) return clone(authoritative);
      if (matches(authoritative, pending.command) || pending.accepted) {
        pending = null;
        return clone(authoritative);
      }
      return overlay(authoritative, pending.command);
    },
    acknowledge(requestId, accepted) {
      if (!pending || pending.command.requestId !== requestId) return null;
      if (accepted) { pending.accepted = true; return null; }
      pending = null;
      return clone(authoritative);
    },
    cancel(requestId) {
      if (!pending || (requestId !== undefined && pending.command.requestId !== requestId)) return null;
      pending = null;
      return clone(authoritative);
    },
    reset() { authoritative = []; pending = null; },
    get pending() { return pending ? { ...pending.command } : null; },
  };
}
