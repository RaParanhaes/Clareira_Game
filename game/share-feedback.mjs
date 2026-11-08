export const BERRY_OFFER_DURATION_MS = 720;

export function beginBerryOfferFeedback(offer, startedAt) {
  const validPoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
  if (!validPoint(offer?.from) || !validPoint(offer?.to) || !Number.isFinite(startedAt)) return null;

  return {
    from: { x: offer.from.x, y: offer.from.y },
    to: { x: offer.to.x, y: offer.to.y },
    startedAt,
  };
}

export function getBerryOfferFrame(feedback, now, reducedMotion = false) {
  if (!feedback || !Number.isFinite(now) || !Number.isFinite(feedback.startedAt)) return null;
  const age = Math.max(0, now - feedback.startedAt);
  if (age >= BERRY_OFFER_DURATION_MS) return null;

  const progress = reducedMotion ? 0.5 : age / BERRY_OFFER_DURATION_MS;
  return {
    ...feedback,
    progress,
    opacity: reducedMotion ? 1 : Math.min(1, progress * 7, (1 - progress) * 7),
  };
}
