const TRANSITION_DURATIONS = Object.freeze({
  'walk-start': .16,
  'walk-stop': .2,
  'run-start': .2,
  'run-stop': .24,
  'jump-takeoff': .11,
  'jump-land': .18,
  'sit-down': .42,
  'stand-up': .34,
  'wave-start': .12,
  'wave-stop': .12,
  'dance-start': .18,
  'dance-stop': .18,
  'crouch-down': .42,
  'crouch-up': .36,
  'enter-water': .2,
  'leave-water': .2,
});

function targetFor(input = {}) {
  if (input.airborne || input.grounded === false) return 'jump';
  if (input.swimming) return 'swim';
  if (input.sitting) return 'sit';
  if (input.gesture === 'wave' || input.gesture === 'dance') return input.moving ? `walk-${input.gesture}` : input.gesture;
  if (input.gesture === 'offer') return 'offer';
  if (input.gathering) return 'gather';
  if (input.crouching) return input.moving ? 'crouch-walk' : 'crouch';
  if (input.moving && input.running) return 'run';
  if (input.moving) return 'walk';
  return 'idle';
}

function transitionFor(from, to) {
  if (to === 'jump' && from !== 'jump') return 'jump-takeoff';
  if (from === 'jump' && to !== 'jump') return 'jump-land';
  if (to === 'sit' && from !== 'sit') return 'sit-down';
  if (from === 'sit' && to !== 'sit') return 'stand-up';
  if (to === 'run' && from !== 'run') return 'run-start';
  if (from === 'run' && to !== 'run') return 'run-stop';
  if (to === 'walk' && from === 'idle') return 'walk-start';
  if (from === 'walk' && to === 'idle') return 'walk-stop';
  if (to === 'wave' && from !== 'wave') return 'wave-start';
  if (from === 'wave' && to !== 'wave') return 'wave-stop';
  if (to === 'dance' && from !== 'dance') return 'dance-start';
  if (from === 'dance' && to !== 'dance') return 'dance-stop';
  if (to === 'walk-wave' && from !== 'walk-wave') return 'wave-start';
  if (from === 'walk-wave' && to !== 'walk-wave') return 'wave-stop';
  if (to === 'walk-dance' && from !== 'walk-dance') return 'dance-start';
  if (from === 'walk-dance' && to !== 'walk-dance') return 'dance-stop';
  if (to.startsWith('crouch') && !from.startsWith('crouch')) return 'crouch-down';
  if (from.startsWith('crouch') && !to.startsWith('crouch')) return 'crouch-up';
  if (to === 'swim' && from !== 'swim') return 'enter-water';
  if (from === 'swim' && to !== 'swim') return 'leave-water';
  return null;
}

export function advanceAvatarMotion(previous = {}, input = {}, now = 0, reducedMotion = false) {
  const target = targetFor(input);
  let transition = previous.transition || null;
  let transitionStart = Number(previous.transitionStart) || Number(now) || 0;
  let transitionDuration = Number(previous.transitionDuration) || 0;

  if (target !== previous.target) {
    transition = transitionFor(previous.target || 'idle', target);
    transitionStart = Number(now) || 0;
    transitionDuration = transition ? TRANSITION_DURATIONS[transition] || 0 : 0;
  }

  const progress = transitionDuration > 0
    ? Math.max(0, Math.min(1, (Number(now) - transitionStart) / transitionDuration))
    : 1;
  const activeTransition = !reducedMotion && transition && progress < 1 ? transition : null;
  return {
    target,
    action: activeTransition || target,
    transition: activeTransition,
    transitionProgress: activeTransition ? progress : 1,
    transitionStart,
    transitionDuration,
  };
}

export function avatarMotionTargets() {
  return Object.freeze(['idle', 'walk-start', 'walk', 'walk-stop', 'run-start', 'run', 'run-stop',
    'jump-takeoff', 'jump', 'jump-land', 'sit-down', 'sit', 'stand-up', 'wave', 'dance',
    'walk-wave', 'walk-dance', 'crouch', 'crouch-walk', 'swim', 'gather', 'offer']);
}
