const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'summary', 'textarea']);
const INTERACTIVE_ROLES = '[role="button"], [role="tab"], [role="menuitem"], [role="switch"]';

export function isInteractiveKeyboardTarget(target) {
  if (!target) return false;
  if (INTERACTIVE_TAGS.has(String(target.tagName || '').toLowerCase()) || target.isContentEditable === true) return true;
  return Boolean(target.closest?.(INTERACTIVE_ROLES));
}

// Text fields retain their native keys; ordinary game buttons must not trap WASD.
export function isTextEntryTarget(target) {
  if (!target) return false;
  if (['input', 'textarea', 'select'].includes(String(target.tagName || '').toLowerCase())
      || target.isContentEditable === true) return true;
  return Boolean(target.closest?.('[contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]'));
}

const MOVEMENT_KEY_CODES = Object.freeze({
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyC: 'c',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control', Space: ' ',
});
const MOVEMENT_KEYS = new Set(Object.values(MOVEMENT_KEY_CODES));
export function movementKeyForEvent(event) {
  const physicalKey = MOVEMENT_KEY_CODES[event.code];
  if (physicalKey) return physicalKey;
  const key = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.key;
  return MOVEMENT_KEYS.has(key) ? key : null;
}

export function canHandleMovementKey(event) {
  const key = movementKeyForEvent(event);
  return key !== null && !event.altKey && !event.metaKey && !event.isComposing
    && !isTextEntryTarget(event.target)
    // Space still activates the focused control until the user resumes walking.
    && !(key === ' ' && isInteractiveKeyboardTarget(event.target));
}

export function clearHeldInputs(keys, touchDirections) {
  keys.clear();
  touchDirections.clear();
  return { x: 0, y: 0 };
}

export function screenDirectionToWorld(input, tileX, tileY) {
  const screenX = Number(input?.x) || 0;
  const screenY = Number(input?.y) || 0;
  if (!(tileX > 0) || !(tileY > 0)) return { x: 0, y: 0 };

  const worldX = screenX / (2 * tileX) + screenY / (2 * tileY);
  const worldY = -screenX / (2 * tileX) + screenY / (2 * tileY);
  const length = Math.hypot(worldX, worldY);
  return length ? { x: worldX / length, y: worldY / length } : { x: 0, y: 0 };
}

export function getWorldInput(keys, touchDirections, tileX, tileY) {
  let screenX = Number(keys.has('ArrowRight') || keys.has('d') || keys.has('D'))
    - Number(keys.has('ArrowLeft') || keys.has('a') || keys.has('A'));
  let screenY = Number(keys.has('ArrowDown') || keys.has('s') || keys.has('S'))
    - Number(keys.has('ArrowUp') || keys.has('w') || keys.has('W'));
  for (const [dx, dy] of touchDirections.values()) {
    screenX += dx;
    screenY += dy;
  }
  return screenDirectionToWorld({ x: screenX, y: screenY }, tileX, tileY);
}
