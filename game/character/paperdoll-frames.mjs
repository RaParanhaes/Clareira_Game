// Seleção de quadro do personagem em camadas. Pura: não lê relógio nem DOM.
// Ações do jogo -> animações do paper doll. Ação sem arte devolve { supported: false }
// para o chamador usar o renderizador antigo (avatar-sprites).
import { PAPERDOLL_FACINGS, paperdollLayersFor } from './paperdoll-manifest.mjs';

export const PAPERDOLL_ACTIONS = Object.freeze({
  idle: 'parado',
  walk: 'andar',
  run: 'andar',
  chop: 'golpear',
  'use-tool': 'golpear',
});

// Ações do jogo que ainda não têm arte no paper doll (continuam no renderizador antigo).
export const PAPERDOLL_UNSUPPORTED_ACTIONS = Object.freeze([
  'sit-ground', 'sit-chair', 'jump', 'dance', 'wave', 'crouch', 'crouch-walk', 'walk-wave',
]);

const SOURCE_CODES = Object.freeze({ S: 0, SE: 1, L: 2, NE: 3, N: 4, NO: 5, O: 6, SO: 7 });
const TAU = Math.PI * 2;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Nome do jogo (south...), código do Blender (S, SE, L...) ou índice -> índice 0..7. */
export function paperdollDirection(facing) {
  if (typeof facing === 'string') {
    const byName = PAPERDOLL_FACINGS.indexOf(facing);
    if (byName >= 0) return byName;
    return Object.hasOwn(SOURCE_CODES, facing) ? SOURCE_CODES[facing] : 0;
  }
  const index = finite(facing);
  return index === null ? 0 : ((Math.floor(index) % 8) + 8) % 8;
}

/**
 * @param manifest manifest validado
 * @param input {
 *   action, facing,
 *   phase (rad, ciclo de caminhada/corrida, como avatar-sprites),
 *   nowMs | time (s) (relógio para parado, e para andar/golpear sem fase),
 *   elapsedMs | progress (0..1) (golpear),
 *   moving, running (só usados quando `action` não é informada),
 *   reducedMotion }
 * @returns { supported: false, action, reason } ou
 *          { supported: true, action, anim, facing, direction, frame, frameCount, frameDurationMs, layers }
 */
export function selectPaperdollFrame(manifest, input = {}) {
  const requested = typeof input.action === 'string' && input.action
    ? input.action
    : input.moving ? (input.running ? 'run' : 'walk') : 'idle';
  const anim = PAPERDOLL_ACTIONS[requested];
  if (!anim || !manifest?.animations?.[anim]) {
    return { supported: false, action: requested, reason: PAPERDOLL_UNSUPPORTED_ACTIONS.includes(requested) ? 'sem-arte' : 'acao-desconhecida' };
  }
  const spec = manifest.animations[anim];
  const count = spec.frameCount;
  const duration = requested === 'run' && spec.runFrameDurationMs ? spec.runFrameDurationMs : spec.frameDurationMs;
  const nowMs = finite(input.nowMs) ?? (finite(input.time) === null ? 0 : finite(input.time) * 1000);
  const clock = Math.max(0, nowMs);
  const reduced = Boolean(input.reducedMotion);
  const direction = paperdollDirection(input.facing);

  let frame = 0;
  if (!reduced) {
    if (anim === 'andar') {
      const phase = finite(input.phase);
      frame = phase === null
        ? Math.floor(clock / duration) % count
        : Math.floor((((phase % TAU) + TAU) % TAU) / TAU * count + 1e-9) % count;
    } else if (anim === 'golpear') {
      const progress = finite(input.progress);
      const elapsed = finite(input.elapsedMs);
      frame = progress !== null
        ? Math.min(count - 1, Math.max(0, Math.floor(progress * count)))
        : elapsed !== null
          ? Math.min(count - 1, Math.max(0, Math.floor(elapsed / duration)))
          : Math.floor(clock / duration) % count;
    } else {
      frame = Math.floor(clock / duration) % count;
    }
  }
  return {
    supported: true,
    action: requested,
    anim,
    facing: PAPERDOLL_FACINGS[direction],
    direction,
    frame,
    frameCount: count,
    frameDurationMs: duration,
    layers: paperdollLayersFor(manifest, anim, direction),
  };
}
