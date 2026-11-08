const FEEDBACK_DURATION_MS = 360;

export function updateCollisionFeedback(state, previous, next, input, now, tileX, tileY) {
  const inputX = Number(input?.x) || 0;
  const inputY = Number(input?.y) || 0;
  const moved = Math.hypot(next.x - previous.x, next.y - previous.y);
  const blocked = Math.hypot(inputX, inputY) > 0 && moved < 1e-7;
  const feedback = state?.feedback || null;

  if (!blocked) return { blocked: false, feedback };
  if (state?.blocked) return { blocked: true, feedback };

  const direction = {
    x: (inputX - inputY) * tileX,
    y: (inputX + inputY) * tileY,
  };
  const length = Math.hypot(direction.x, direction.y);
  if (!length) return { blocked: true, feedback };

  return {
    blocked: true,
    feedback: {
      startedAt: Number.isFinite(now) ? now : 0,
      direction: { x: direction.x / length, y: direction.y / length },
    },
  };
}

export function getCollisionFeedbackFrame(feedback, now, reducedMotion = false) {
  if (!feedback || !Number.isFinite(feedback.startedAt)) return null;
  const elapsed = Math.max(0, (Number(now) || 0) - feedback.startedAt);
  if (elapsed >= FEEDBACK_DURATION_MS) return null;
  if (reducedMotion) {
    return { direction: feedback.direction, alpha: 0.86, spread: 0, lift: 0 };
  }

  const progress = elapsed / FEEDBACK_DURATION_MS;
  return {
    direction: feedback.direction,
    alpha: 1 - progress * 0.48,
    spread: Math.round(progress * 3),
    lift: Math.round(progress * 2),
  };
}
