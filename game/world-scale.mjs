// Expansion preserves every authored coordinate, arrival point and river origin.
export const PREVIOUS_WORLD_SIZE = 839;
export const WORLD_AREA_MULTIPLIER = 50;
export const WORLD_SIZE = Math.ceil(PREVIOUS_WORLD_SIZE * Math.sqrt(WORLD_AREA_MULTIPLIER));
export const WORLD_NATURE_ORIGIN = Object.freeze({x: PREVIOUS_WORLD_SIZE / 2, y: PREVIOUS_WORLD_SIZE / 2});
export const WORLD_CENTER = Object.freeze({x: WORLD_SIZE / 2, y: WORLD_SIZE / 2});
export const DARK_WORLD_COORDINATE_VERSION = 3;
