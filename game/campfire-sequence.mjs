// The campfire as a sequence of 20 hand-drawn frames (sheet: 5 columns x 4 rows, 64x80 each).
// The fire never jumps: its level moves one step at a time toward the level its fuel asks for,
// so a fire that is fed climbs slowly to its maximum and a dying one sinks slowly to embers.
// Frame numbers below are the artist's 1-based numbers (1 is the top-left frame of the sheet).

export const CAMPFIRE_SEQUENCE_COLUMNS = 5;
export const CAMPFIRE_SEQUENCE_FRAME_WIDTH = 64;
export const CAMPFIRE_SEQUENCE_FRAME_HEIGHT = 80;
export const CAMPFIRE_SEQUENCE_SHEET_WIDTH = CAMPFIRE_SEQUENCE_COLUMNS * CAMPFIRE_SEQUENCE_FRAME_WIDTH;
export const CAMPFIRE_SEQUENCE_SHEET_HEIGHT = 4 * CAMPFIRE_SEQUENCE_FRAME_HEIGHT;

// Ascending intensity. Level 0 is the cold, ash-covered hearth; the top level is the full fire.
// Rising from ash goes through the spark and the small flames (3, 4, 5); dying goes back down
// through the embers (16) and the falling flames (15 to 12).
export const CAMPFIRE_SEQUENCE_LEVELS = Object.freeze([
  Object.freeze([17, 18, 19, 20]), // 0: apagada, brasa coberta de cinza, pisca devagar
  Object.freeze([3]),              // 1: faísca
  Object.freeze([4]),              // 2: acendendo
  Object.freeze([5]),              // 3: chama pequena
  Object.freeze([16]),             // 4: brasa com chama baixa
  Object.freeze([15]),             // 5: enfraquecendo
  Object.freeze([14]),             // 6: chama média
  Object.freeze([13]),             // 7: chama alta caindo
  Object.freeze([12]),             // 8: chama alta
  Object.freeze([6, 7, 8, 9, 10, 11]), // 9: cheia, varia entre os quadros enquanto queima
]);
export const CAMPFIRE_SEQUENCE_TOP_LEVEL = CAMPFIRE_SEQUENCE_LEVELS.length - 1;

// Time per step. Rising is brisk, dying is slower, so the fire feels like it needs wood to climb.
export const CAMPFIRE_SEQUENCE_RISE_MS = 260;
export const CAMPFIRE_SEQUENCE_FALL_MS = 420;
export const CAMPFIRE_SEQUENCE_ASH_FLICKER_MS = 320;
export const CAMPFIRE_SEQUENCE_VARIATION_MS = 190;

const clamp01 = value => Math.max(0, Math.min(1, value));
const clampLevel = level => Math.max(0, Math.min(CAMPFIRE_SEQUENCE_TOP_LEVEL, Math.round(level)));

// The level the fuel asks for, from the flame strength (0..1).
export function campfireSequenceLevelFor(strength) {
  const value = clamp01(Number.isFinite(strength) ? strength : 0);
  if (value < 0.03) return 0;
  return Math.max(1, Math.min(CAMPFIRE_SEQUENCE_TOP_LEVEL, Math.round(value * CAMPFIRE_SEQUENCE_TOP_LEVEL)));
}

// Moves the fire one level at a time toward the target. Returns a new state object.
export function advanceCampfireSequence(state, targetLevel, now, reducedMotion = false) {
  const target = clampLevel(targetLevel);
  if (reducedMotion || !state) return { level: target, at: now };
  if (state.level === target) return { level: state.level, at: state.at };
  const dwell = target > state.level ? CAMPFIRE_SEQUENCE_RISE_MS : CAMPFIRE_SEQUENCE_FALL_MS;
  if (now - state.at < dwell) return { level: state.level, at: state.at };
  return { level: state.level + Math.sign(target - state.level), at: now };
}

// The frame number to show at a level. Ash flickers slowly and the full fire varies between its
// frames, both going back and forth so the picture never jumps from the first frame to the last.
export function campfireSequenceFrame(level, now, reducedMotion = false) {
  const current = clampLevel(level);
  const frames = CAMPFIRE_SEQUENCE_LEVELS[current];
  if (frames.length === 1 || reducedMotion || !Number.isFinite(now)) return frames[0];
  const period = current === 0 ? CAMPFIRE_SEQUENCE_ASH_FLICKER_MS : CAMPFIRE_SEQUENCE_VARIATION_MS;
  const cycle = 2 * (frames.length - 1);
  const step = Math.floor(now / period) % cycle;
  return frames[step < frames.length ? step : cycle - step];
}

// Top-left corner of a frame inside the sheet, from its 1-based frame number.
export function campfireSequenceFrameRect(frameNumber) {
  const index = frameNumber - 1;
  const column = index % CAMPFIRE_SEQUENCE_COLUMNS;
  const row = Math.floor(index / CAMPFIRE_SEQUENCE_COLUMNS);
  return {
    sx: column * CAMPFIRE_SEQUENCE_FRAME_WIDTH,
    sy: row * CAMPFIRE_SEQUENCE_FRAME_HEIGHT,
    sw: CAMPFIRE_SEQUENCE_FRAME_WIDTH,
    sh: CAMPFIRE_SEQUENCE_FRAME_HEIGHT,
  };
}

// Per-fire memory of the current level. Keys are the fire's cell, which is stable for a campfire.
const sequenceStates = new Map();

export function campfireSequenceSprite(key, strength, now, reducedMotion = false) {
  const target = campfireSequenceLevelFor(strength);
  const next = advanceCampfireSequence(sequenceStates.get(key), target, now, reducedMotion);
  sequenceStates.set(key, next);
  return campfireSequenceFrameRect(campfireSequenceFrame(next.level, now, reducedMotion));
}

export function resetCampfireSequenceStates() {
  sequenceStates.clear();
}
