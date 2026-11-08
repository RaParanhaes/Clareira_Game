export const AOI_CELL_SIZE = 16;
export const SPATIAL_CELL_SIZE = 8;
export const AOI_RADIUS_STEP = 4;
export const AOI_RENDER_PADDING_PX = 250;

const MIN_VIEWPORT_WIDTH = 200;
const MIN_VIEWPORT_HEIGHT = 150;
const MAX_VIEWPORT_DIMENSION = 4096;
const MAX_AOI_RADIUS = 96;

function boundedDimension(value, fallback, minimum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(MAX_VIEWPORT_DIMENSION, Math.round(value)));
}

export function normalizeViewport(width, height) {
  return {
    width: boundedDimension(width, 480, MIN_VIEWPORT_WIDTH),
    height: boundedDimension(height, 300, MIN_VIEWPORT_HEIGHT),
  };
}

// Matches the Canvas projection and its 250 px draw margin so off-screen entities
// arrive before they can enter the rendered viewport.
export function viewportAoiRadius(width, height) {
  const view = normalizeViewport(width, height);
  const mobile = view.width < 600;
  const tileX = mobile ? 26 : 32;
  const tileY = tileX * 18 / 32;
  const verticalCenterRatio = mobile ? 0.4 : 0.52;
  const halfWidthWorld = (view.width / 2 + AOI_RENDER_PADDING_PX) / tileX;
  const halfHeightWorld = (Math.max(verticalCenterRatio, 1 - verticalCenterRatio) * view.height
    + AOI_RENDER_PADDING_PX) / tileY;
  const radius = Math.sqrt((halfWidthWorld ** 2 + halfHeightWorld ** 2) / 2);
  return Math.min(MAX_AOI_RADIUS, Math.ceil(radius / AOI_RADIUS_STEP) * AOI_RADIUS_STEP);
}

export function spatialCell(position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
    throw new TypeError('A posição precisa ter coordenadas finitas.');
  }
  return {
    x: Math.floor(position.x / SPATIAL_CELL_SIZE),
    y: Math.floor(position.y / SPATIAL_CELL_SIZE),
  };
}

export function aoiCell(position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
    throw new TypeError('A posição precisa ter coordenadas finitas.');
  }
  return {
    x: Math.floor(position.x / AOI_CELL_SIZE),
    y: Math.floor(position.y / AOI_CELL_SIZE),
  };
}

export function aoiWindow(position, radius) {
  const cell = aoiCell(position);
  const padding = AOI_CELL_SIZE * Math.SQRT2 / 2;
  return {
    ...cell,
    center: {
      x: (cell.x + 0.5) * AOI_CELL_SIZE,
      y: (cell.y + 0.5) * AOI_CELL_SIZE,
    },
    radius: Math.max(0, radius) + padding,
  };
}
