export const DOOR_TRIGGER_RADIUS = .9;
export const DOOR_DWELL_MS = 300;
export const DOOR_REARM_DISTANCE = 1.8;
export const DOOR_LOCK_MS = 1200;
export const DOOR_FAIL_RETRY_MS = 3000;

export function createDoorTriggerState() {
  return { armed: true, since: null, lockUntil: 0, failedUntil: 0 };
}

export function stepDoorTrigger(state = createDoorTriggerState(), {
  distance = Infinity, clear = true, towardDoor = true, now = 0,
} = {}) {
  let next = state;
  if (distance > DOOR_REARM_DISTANCE && now >= state.lockUntil && now >= state.failedUntil) {
    next = { ...state, armed: true, since: null, failedUntil: 0 };
  } else if (!state.armed || now < state.lockUntil || now < state.failedUntil
      || distance >= DOOR_REARM_DISTANCE || distance > DOOR_TRIGGER_RADIUS || !clear || !towardDoor) {
    next = { ...state, since: null };
  } else {
    const since = Number.isFinite(state.since) ? state.since : now;
    next = { ...state, since };
    if (now - since >= DOOR_DWELL_MS) {
      next = { ...next, armed: false, since: null, lockUntil: now + DOOR_LOCK_MS };
      return { fire: true, state: next };
    }
  }
  return { fire: false, state: next };
}

export function failDoorTrigger(state, now = 0) {
  return { ...state, armed: false, since: null, failedUntil: now + DOOR_FAIL_RETRY_MS };
}
