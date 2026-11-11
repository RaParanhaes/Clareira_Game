// Fogueira em laço: 11 quadros de pixel art (folha 5 x 3), só os de fogo aceso com lenha, pedras e chama.
// Substitui a sequência de 20 quadros; os quadros vão de fogo médio a alto e voltam,
// então o laço é contínuo. Reduzir a resolução dos quadros deixa a animação mais leve.
export const CAMPFIRE_LOOP_COLUMNS = 5;
export const CAMPFIRE_LOOP_FRAME_COUNT = 15;
// Índices na folha (quadro do zip - 1): 0-1 brasas, 2-12 fogo aceso, 13 apagando, 14 apagada.
export const CAMPFIRE_LOOP_EMBER_FIRST = 0;
export const CAMPFIRE_LOOP_FLAME_FIRST = 2;
export const CAMPFIRE_LOOP_FLAME_LAST = 12;
export const CAMPFIRE_LOOP_OFF_FRAME = 14;
export const CAMPFIRE_LOOP_FRAME_WIDTH = 68;
export const CAMPFIRE_LOOP_FRAME_HEIGHT = 72;
export const CAMPFIRE_LOOP_SHEET_WIDTH = CAMPFIRE_LOOP_COLUMNS * CAMPFIRE_LOOP_FRAME_WIDTH;
export const CAMPFIRE_LOOP_SHEET_HEIGHT = Math.ceil(CAMPFIRE_LOOP_FRAME_COUNT / CAMPFIRE_LOOP_COLUMNS) * CAMPFIRE_LOOP_FRAME_HEIGHT;
export const CAMPFIRE_LOOP_FRAME_DURATION_MS = 110;
// Largura aparente na tela, igual à da fogueira anterior (40 px no zoom 1).
export const CAMPFIRE_LOOP_DISPLAY_WIDTH = 40;

// Laço do fogo aceso: só os quadros de chama, em ordem e voltando ao começo.
export function campfireLoopFrameIndex(timeSeconds, reducedMotion = false) {
  const span = CAMPFIRE_LOOP_FLAME_LAST - CAMPFIRE_LOOP_FLAME_FIRST + 1;
  if (reducedMotion || !Number.isFinite(timeSeconds)) return CAMPFIRE_LOOP_FLAME_FIRST;
  const frame = Math.floor(timeSeconds * 1000 / CAMPFIRE_LOOP_FRAME_DURATION_MS);
  return CAMPFIRE_LOOP_FLAME_FIRST + (((frame % span) + span) % span);
}

// Retângulo de origem na folha para um quadro.
export function campfireLoopSourceRect(index) {
  const col = index % CAMPFIRE_LOOP_COLUMNS;
  const row = Math.floor(index / CAMPFIRE_LOOP_COLUMNS);
  return { sx: col * CAMPFIRE_LOOP_FRAME_WIDTH, sy: row * CAMPFIRE_LOOP_FRAME_HEIGHT,
    sw: CAMPFIRE_LOOP_FRAME_WIDTH, sh: CAMPFIRE_LOOP_FRAME_HEIGHT };
}

// Ciclo de vida da fogueira: acende, fica acesa 3 minutos e apaga devagar em 1 minuto.
export const CAMPFIRE_LOOP_IGNITE_MS = 4 * 1000;
export const CAMPFIRE_LOOP_SUSTAIN_MS = 3 * 60 * 1000;
export const CAMPFIRE_LOOP_DECAY_MS = 60 * 1000;

// Quadro para um tempo (ms) desde que o fogo foi aceso. Sem tempo conhecido, mantém o laço aceso.
export function campfireLoopPhaseFrame(elapsedMs, timeSeconds = 0, reducedMotion = false) {
  if (!Number.isFinite(elapsedMs)) return campfireLoopFrameIndex(timeSeconds, reducedMotion);
  if (elapsedMs < 0) return CAMPFIRE_LOOP_EMBER_FIRST;
  if (elapsedMs < CAMPFIRE_LOOP_IGNITE_MS) {
    // Acende: brasas (quadros 1 e 2 do zip), depois o fogo sobe até o laço.
    const u = elapsedMs / CAMPFIRE_LOOP_IGNITE_MS;
    return Math.min(CAMPFIRE_LOOP_FLAME_LAST, Math.floor(u * (CAMPFIRE_LOOP_FLAME_FIRST + 1 + 1)));
  }
  const sustainEnd = CAMPFIRE_LOOP_IGNITE_MS + CAMPFIRE_LOOP_SUSTAIN_MS;
  if (elapsedMs < sustainEnd) return campfireLoopFrameIndex(timeSeconds, reducedMotion);
  const decayEnd = sustainEnd + CAMPFIRE_LOOP_DECAY_MS;
  if (elapsedMs < decayEnd) {
    // Apaga: do fogo alto, passa pelo quadro 14 e termina no quadro 15 (apagada).
    const u = (elapsedMs - sustainEnd) / CAMPFIRE_LOOP_DECAY_MS;
    const steps = CAMPFIRE_LOOP_OFF_FRAME - CAMPFIRE_LOOP_FLAME_LAST;
    return Math.min(CAMPFIRE_LOOP_OFF_FRAME, CAMPFIRE_LOOP_FLAME_LAST + Math.floor(u * (steps + 1)));
  }
  return CAMPFIRE_LOOP_OFF_FRAME;
}

// Tempo desde que o fogo foi aceso, no relógio do servidor (litAt vem do servidor).
// Fogueira permanente (chegada do jogador) não apaga: devolve NaN e fica no laço aceso.
export function campfireLoopElapsedMs(fire, serverWallNowMs) {
  if (fire?.permanent === true) return NaN;
  if (!Number.isFinite(fire?.litAt) || !Number.isFinite(serverWallNowMs)) return NaN;
  return serverWallNowMs - fire.litAt;
}
