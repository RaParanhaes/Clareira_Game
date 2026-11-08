const CELL_WIDTH = 80;
const CELL_HEIGHT = 104;
const FRAME_COUNT = 9;
const WIND_CYCLE_SECONDS = 14;
const WIND_ACTIVE_WINDOW = .28;

let atlases = null;
let atlasPromise = null;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load tree sprite atlas: ${url}`));
    image.src = url;
  });
}

export function preloadTreeSpriteAtlases() {
  if (!atlasPromise) {
    if (typeof Image !== 'function') {
      atlasPromise = Promise.resolve(null);
      return atlasPromise;
    }
    const broadleafUrl = new URL('./art/tree-sprites/broadleaf-frames.png', import.meta.url);
    const pineUrl = new URL('./art/tree-sprites/pine-frames.png', import.meta.url);
    atlasPromise = Promise.all([loadImage(broadleafUrl), loadImage(pineUrl)])
      .then(([broadleaf, pine]) => (atlases = { broadleaf, pine }))
      .catch(() => null);
  }
  return atlasPromise;
}

function random(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function windFrame(time, index, worldX, worldY, reducedMotion) {
  if (reducedMotion || !Number.isFinite(time)) return 0;
  const seed = random(index + worldX * .31, worldY * .27 + 7);
  const phase = ((time / WIND_CYCLE_SECONDS + seed) % 1 + 1) % 1;
  if (phase >= WIND_ACTIVE_WINDOW) return 0;
  return 1 + Math.min(FRAME_COUNT - 2,
    Math.round(phase / WIND_ACTIVE_WINDOW * (FRAME_COUNT - 2)));
}

export function drawTreeSprite(ctx, p, index, scale, fade, time, warm, worldX, worldY, reducedMotion) {
  if (!atlases) {
    void preloadTreeSpriteAtlases();
    return false;
  }

  const safeIndex = Number.isFinite(Number(index)) ? Math.abs(Math.floor(Number(index))) : 1;
  const pine = safeIndex % 3 === 0;
  const atlas = pine ? atlases.pine : atlases.broadleaf;
  const variant = ((safeIndex % 7) + 7) % 7;
  const frame = windFrame(time, safeIndex, worldX, worldY, reducedMotion);
  const row = pine ? 0 : variant * 2 + Number(Boolean(warm));
  const previousAlpha = ctx.globalAlpha;
  if (fade) ctx.globalAlpha *= .48;
  ctx.drawImage(atlas,
    frame * CELL_WIDTH, row * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT,
    Math.round(p.x - 40 * scale), Math.round(p.y - 100 * scale),
    CELL_WIDTH * scale, CELL_HEIGHT * scale);
  ctx.globalAlpha = previousAlpha;
  return true;
}
