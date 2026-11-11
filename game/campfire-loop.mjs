// Fogueira em laço: 11 quadros de pixel art (folha 5 x 3), só os de fogo aceso com lenha, pedras e chama.
// Substitui a sequência de 20 quadros; os quadros vão de fogo médio a alto e voltam,
// então o laço é contínuo. Reduzir a resolução dos quadros deixa a animação mais leve.
export const CAMPFIRE_LOOP_COLUMNS = 5;
export const CAMPFIRE_LOOP_FRAME_COUNT = 11;
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

// Ciclo de vida da fogueira em laço: acende, mantém o fogo por 3 minutos e apaga devagar em 1 minuto.
export const CAMPFIRE_LOOP_IGNITE_MS = 4 * 1000;      // subida da chama ao acender
export const CAMPFIRE_LOOP_SUSTAIN_MS = 3 * 60 * 1000; // fogo alto no laço
export const CAMPFIRE_LOOP_DECAY_MS = 60 * 1000;       // apagar devagar
const LOOP_LAST = CAMPFIRE_LOOP_FRAME_COUNT - 1;

// Quadro da fogueira para um tempo (ms) desde que foi acesa. Devolve o índice da folha.
// Sem tempo conhecido, mantém o fogo aceso em laço.
export function campfireLoopPhaseFrame(elapsedMs, timeSeconds = 0, reducedMotion = false) {
  if (!Number.isFinite(elapsedMs)) return campfireLoopFrameIndex(timeSeconds, reducedMotion);
  if (elapsedMs < 0) return 0;
  if (elapsedMs < CAMPFIRE_LOOP_IGNITE_MS) {
    // Sobe das brasas (quadro 0) até o fogo cheio, passando pelos quadros em ordem.
    const u = elapsedMs / CAMPFIRE_LOOP_IGNITE_MS;
    return Math.min(LOOP_LAST, Math.floor(u * LOOP_LAST));
  }
  const sustainEnd = CAMPFIRE_LOOP_IGNITE_MS + CAMPFIRE_LOOP_SUSTAIN_MS;
  if (elapsedMs < sustainEnd) return campfireLoopFrameIndex(timeSeconds, reducedMotion);
  const decayEnd = sustainEnd + CAMPFIRE_LOOP_DECAY_MS;
  if (elapsedMs < decayEnd) {
    // Apagando: de fogo cheio até as brasas, cada vez mais devagar.
    const u = (elapsedMs - sustainEnd) / CAMPFIRE_LOOP_DECAY_MS;
    return Math.max(0, LOOP_LAST - Math.floor(u * LOOP_LAST));
  }
  return 0;
}
