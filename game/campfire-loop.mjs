// Fogueira em laço: 15 quadros de pixel art (folha 5 x 3) com lenha, pedras e chama.
// Substitui a sequência de 20 quadros; os quadros vão de brasas a fogo alto e voltam,
// então o laço é contínuo. Reduzir a resolução dos quadros deixa a animação mais leve.
export const CAMPFIRE_LOOP_COLUMNS = 5;
export const CAMPFIRE_LOOP_FRAME_COUNT = 15;
export const CAMPFIRE_LOOP_FRAME_WIDTH = 68;
export const CAMPFIRE_LOOP_FRAME_HEIGHT = 72;
export const CAMPFIRE_LOOP_SHEET_WIDTH = CAMPFIRE_LOOP_COLUMNS * CAMPFIRE_LOOP_FRAME_WIDTH;
export const CAMPFIRE_LOOP_SHEET_HEIGHT = Math.ceil(CAMPFIRE_LOOP_FRAME_COUNT / CAMPFIRE_LOOP_COLUMNS) * CAMPFIRE_LOOP_FRAME_HEIGHT;
export const CAMPFIRE_LOOP_FRAME_DURATION_MS = 110;
// Largura aparente na tela, igual à da fogueira anterior (40 px no zoom 1).
export const CAMPFIRE_LOOP_DISPLAY_WIDTH = 40;

export function campfireLoopFrameIndex(timeSeconds, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(timeSeconds)) return 0;
  const frame = Math.floor(timeSeconds * 1000 / CAMPFIRE_LOOP_FRAME_DURATION_MS);
  return ((frame % CAMPFIRE_LOOP_FRAME_COUNT) + CAMPFIRE_LOOP_FRAME_COUNT) % CAMPFIRE_LOOP_FRAME_COUNT;
}

// Retângulo de origem na folha para um quadro.
export function campfireLoopSourceRect(index) {
  const col = index % CAMPFIRE_LOOP_COLUMNS;
  const row = Math.floor(index / CAMPFIRE_LOOP_COLUMNS);
  return { sx: col * CAMPFIRE_LOOP_FRAME_WIDTH, sy: row * CAMPFIRE_LOOP_FRAME_HEIGHT,
    sw: CAMPFIRE_LOOP_FRAME_WIDTH, sh: CAMPFIRE_LOOP_FRAME_HEIGHT };
}
