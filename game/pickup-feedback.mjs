export const PICKUP_REACH_MS = 260;
export const PICKUP_RESPONSE_MS = 440;
export const PICKUP_ACK_TIMEOUT_MS = 1600;

const clampUnit = value => Math.max(0, Math.min(1, value));

export function beginPickupFeedback(resource, startedAt) {
  if (!resource || !Number.isFinite(startedAt)
      || !Number.isFinite(resource.x) || !Number.isFinite(resource.y)) return null;
  return {
    resourceId: resource.id,
    kind: resource.kind,
    x: resource.x,
    y: resource.y,
    startedAt,
    outcome: 'pending',
    burstAt: null,
  };
}

export function isPickupRequestPending(feedback, now) {
  if (feedback?.outcome !== 'pending' || !Number.isFinite(now) || !Number.isFinite(feedback.startedAt)) return false;
  const age = now - feedback.startedAt;
  return age >= 0 && age <= PICKUP_ACK_TIMEOUT_MS;
}

export function resolvePickupFeedback(feedback, collected, resolvedAt) {
  if (!feedback || feedback.outcome !== 'pending' || !Number.isFinite(resolvedAt)) return null;
  if (!collected) return null;
  return {
    ...feedback,
    outcome: 'collected',
    burstAt: Math.max(resolvedAt, feedback.startedAt + PICKUP_REACH_MS),
  };
}

export function getPickupFeedbackFrame(feedback, now, reducedMotion = false) {
  if (!feedback || !Number.isFinite(now)) return null;
  const age = now - feedback.startedAt;
  if (feedback.outcome === 'pending' && age > PICKUP_ACK_TIMEOUT_MS) return null;

  const burstAge = feedback.outcome === 'collected' ? now - feedback.burstAt : -1;
  if (feedback.outcome === 'collected' && burstAge >= PICKUP_RESPONSE_MS) return null;
  return {
    x: feedback.x,
    y: feedback.y,
    kind: feedback.kind,
    reaching: feedback.outcome === 'pending' ? age < PICKUP_REACH_MS : now < feedback.burstAt,
    reachProgress: reducedMotion ? 0 : clampUnit(age / PICKUP_REACH_MS),
    showBurst: feedback.outcome === 'collected' && burstAge >= 0,
    burstProgress: reducedMotion ? 0 : clampUnit(burstAge / PICKUP_RESPONSE_MS),
  };
}
