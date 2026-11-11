import { CAMPFIRE_LIFETIME_MS, campfireRemainingMs } from './campfire-life.mjs';
// Fogueira em laço: 11 quadros de pixel art (folha 5 x 3), só os de fogo aceso com lenha, pedras e chama.
// Substitui a sequência de 20 quadros; os quadros vão de fogo médio a alto e voltam,
// então o laço é contínuo. Reduzir a resolução dos quadros deixa a animação mais leve.
export const CAMPFIRE_LOOP_COLUMNS = 5;
export const CAMPFIRE_LOOP_FRAME_COUNT = 15;
// Índices na folha (quadro do zip - 1): 0-1 brasas, 6-8 fogo alto, 14 apagada.
export const CAMPFIRE_LOOP_EMBER_FIRST = 0;
export const CAMPFIRE_LOOP_FLAME_FIRST = 6;
export const CAMPFIRE_LOOP_FLAME_LAST = 8;
export const CAMPFIRE_LOOP_OFF_FRAME = 14;
export const CAMPFIRE_LOOP_FRAME_WIDTH = 68;
export const CAMPFIRE_LOOP_FRAME_HEIGHT = 72;
export const CAMPFIRE_LOOP_SHEET_WIDTH = CAMPFIRE_LOOP_COLUMNS * CAMPFIRE_LOOP_FRAME_WIDTH;
export const CAMPFIRE_LOOP_SHEET_HEIGHT = Math.ceil(CAMPFIRE_LOOP_FRAME_COUNT / CAMPFIRE_LOOP_COLUMNS) * CAMPFIRE_LOOP_FRAME_HEIGHT;
export const CAMPFIRE_LOOP_FRAME_DURATION_MS = 110;
// Largura aparente na tela, igual à da fogueira anterior (40 px no zoom 1).
export const CAMPFIRE_LOOP_DISPLAY_WIDTH = 40;

// Janelas de quadros (índices da folha = número do quadro do zip - 1).
// Fogo alto: quadros 6 a 10 do zip (índices 5 a 9), variando ao acaso, mas só para o quadro vizinho.
// A sequência é fixa (mesma para todos os jogadores) e dá a volta a cada 64 passos.
export const CAMPFIRE_LOOP_SUSTAIN_POOL = Object.freeze([5, 6, 7, 8, 9]);
function seededRandomWalk(length, seed) {
  let state = seed >>> 0;
  const next = () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lo = CAMPFIRE_LOOP_SUSTAIN_POOL[0], hi = CAMPFIRE_LOOP_SUSTAIN_POOL[CAMPFIRE_LOOP_SUSTAIN_POOL.length - 1];
  const walk = [];
  let position = 7;                       // começa no fogo máximo (quadro 8)
  for (let i = 0; i < length; i++) {
    walk.push(position);
    const step = next() < 0.5 ? -1 : 1;
    position = Math.max(lo, Math.min(hi, position + step));
  }
  // Fecha o ciclo: o último passo também fica vizinho do primeiro, então a volta não pula.
  const last = walk.length - 1;
  walk[last] = walk[last - 1] + Math.sign(walk[0] - walk[last - 1]);
  return walk;
}
export const CAMPFIRE_LOOP_SUSTAIN_WALK = Object.freeze(seededRandomWalk(64, 20251110));
// Apagar: a janela anda para frente e encolhe até a fogueira apagada (quadro 15).
export const CAMPFIRE_LOOP_DECAY_WINDOWS = Object.freeze([
  [6, 7, 8], [7, 8, 9], [8, 9], [9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14],
].map(w => Object.freeze(w)));

// Quadro que toca dentro de uma janela, em um tempo (ms) dentro dela.
function frameInWindow(windowFrames, msInto) {
  const step = Math.floor(msInto / CAMPFIRE_LOOP_FRAME_DURATION_MS);
  return windowFrames[((step % windowFrames.length) + windowFrames.length) % windowFrames.length];
}

// Fogo aceso em laço: quadros 7, 8 e 9.
export function campfireLoopFrameIndex(timeSeconds, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(timeSeconds)) return 7;
  const n = Math.floor(timeSeconds * 1000 / CAMPFIRE_LOOP_FRAME_DURATION_MS);
  const walk = CAMPFIRE_LOOP_SUSTAIN_WALK;
  return walk[((n % walk.length) + walk.length) % walk.length];
}

// Retângulo de origem na folha para um quadro.
export function campfireLoopSourceRect(index) {
  const col = index % CAMPFIRE_LOOP_COLUMNS;
  const row = Math.floor(index / CAMPFIRE_LOOP_COLUMNS);
  return { sx: col * CAMPFIRE_LOOP_FRAME_WIDTH, sy: row * CAMPFIRE_LOOP_FRAME_HEIGHT,
    sw: CAMPFIRE_LOOP_FRAME_WIDTH, sh: CAMPFIRE_LOOP_FRAME_HEIGHT };
}

// Ciclo de vida da fogueira: acende, fica acesa 3 minutos e apaga devagar em 1 minuto.
// O sprite segue o combustível (campfire-life): acende, fica no laço e apaga no último minuto.
export const CAMPFIRE_LOOP_IGNITE_MS = 12 * 1000;
// Acender: janelas que sobem devagar das brasas até o fogo máximo (7-8-9), em índices da folha.
export const CAMPFIRE_LOOP_IGNITE_WINDOWS = Object.freeze([
  [0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7, 8],
].map(w => Object.freeze(w)));
export const CAMPFIRE_LOOP_DECAY_MS = 60 * 1000;
export const CAMPFIRE_LOOP_SUSTAIN_MS = CAMPFIRE_LIFETIME_MS - CAMPFIRE_LOOP_DECAY_MS - CAMPFIRE_LOOP_IGNITE_MS;

// Quadro para um tempo (ms) desde que o fogo foi aceso. Sem tempo conhecido, mantém o laço aceso.
export function campfireLoopPhaseFrame(elapsedMs, timeSeconds = 0, reducedMotion = false) {
  if (!Number.isFinite(elapsedMs)) return campfireLoopFrameIndex(timeSeconds, reducedMotion);
  if (elapsedMs < 0) return CAMPFIRE_LOOP_EMBER_FIRST;
  if (elapsedMs < CAMPFIRE_LOOP_IGNITE_MS) {
    // Acende: as janelas sobem devagar das brasas até o fogo máximo.
    const per = CAMPFIRE_LOOP_IGNITE_MS / CAMPFIRE_LOOP_IGNITE_WINDOWS.length;
    const w = Math.min(CAMPFIRE_LOOP_IGNITE_WINDOWS.length - 1, Math.floor(elapsedMs / per));
    return frameInWindow(CAMPFIRE_LOOP_IGNITE_WINDOWS[w], elapsedMs - w * per);
  }
  const sustainEnd = CAMPFIRE_LOOP_IGNITE_MS + CAMPFIRE_LOOP_SUSTAIN_MS;
  if (elapsedMs < sustainEnd) return campfireLoopFrameIndex(timeSeconds, reducedMotion);
  const decayEnd = sustainEnd + CAMPFIRE_LOOP_DECAY_MS;
  if (elapsedMs < decayEnd) {
    // Apaga: as janelas andam do fogo alto até o quadro 15 (apagada).
    const u = (elapsedMs - sustainEnd) / CAMPFIRE_LOOP_DECAY_MS;
    const w = Math.min(CAMPFIRE_LOOP_DECAY_WINDOWS.length - 1, Math.floor(u * CAMPFIRE_LOOP_DECAY_WINDOWS.length));
    const windowStart = sustainEnd + w * CAMPFIRE_LOOP_DECAY_MS / CAMPFIRE_LOOP_DECAY_WINDOWS.length;
    return frameInWindow(CAMPFIRE_LOOP_DECAY_WINDOWS[w], elapsedMs - windowStart);
  }
  return CAMPFIRE_LOOP_OFF_FRAME;
}

// Tempo desde que o fogo foi aceso, pela mesma conta do combustível (campfire-life),
// no relógio do servidor. Fogueira permanente, ou sem dados de fogo, devolve NaN (fica acesa em laço).
export function campfireLoopElapsedMs(fire, serverWallNowMs) {
  if (fire?.permanent === true) return NaN;
  if (!Number.isFinite(serverWallNowMs)) return NaN;
  if (!Number.isFinite(fire?.litAt) && !Number.isFinite(fire?.burnRemainingMs)) return NaN;
  return CAMPFIRE_LIFETIME_MS - campfireRemainingMs(fire, serverWallNowMs);
}
