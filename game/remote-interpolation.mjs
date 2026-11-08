const BASE_DELAY_MS = 50;
const MAX_DELAY_MS = 150;
const MAX_EXTRAPOLATION_MS = 120;
const JITTER_WINDOW_SIZE = 18;
const SNAPSHOT_MARGIN_MS = 34;

export function createRemotePlayback() {
  return {
    previousSampleTime: null,
    previousArrivalTime: null,
    jitterSamples: [],
    jitterMs: 0,
    networkDelayMs: BASE_DELAY_MS,
    targetDelayMs: BASE_DELAY_MS,
    delayMs: BASE_DELAY_MS,
    lastFrameTime: null,
    lastRenderTime: null,
  };
}

export function observeRemoteSnapshot(playback, sampleTime, arrivalTime, roundTripMs) {
  if (!playback || !Number.isFinite(sampleTime) || !Number.isFinite(arrivalTime)) return;
  if (Number.isFinite(roundTripMs)) {
    playback.networkDelayMs = Math.min(MAX_DELAY_MS,
      Math.max(BASE_DELAY_MS, Math.max(0, roundTripMs) / 2 + SNAPSHOT_MARGIN_MS));
  }

  if (Number.isFinite(playback.previousSampleTime) && Number.isFinite(playback.previousArrivalTime)) {
    const sampleGap = sampleTime - playback.previousSampleTime;
    const arrivalGap = arrivalTime - playback.previousArrivalTime;
    if (sampleGap > 0 && arrivalGap >= 0) {
      // Compare source cadence with arrival cadence. This catches both late gaps
      // and packet bunching without letting either one permanently inflate the buffer.
      playback.jitterSamples.push(Math.abs(arrivalGap - sampleGap));
      if (playback.jitterSamples.length > JITTER_WINDOW_SIZE) playback.jitterSamples.shift();
      const ordered = [...playback.jitterSamples].sort((a, b) => a - b);
      const percentileIndex = Math.max(0, Math.ceil(ordered.length * 0.85) - 1);
      playback.jitterMs = ordered[percentileIndex] || 0;
    }
  }

  const jitterDelay = BASE_DELAY_MS + Math.max(0, playback.jitterMs - 8) * 0.9;
  playback.targetDelayMs = Math.min(MAX_DELAY_MS, Math.max(playback.networkDelayMs, jitterDelay));

  playback.previousSampleTime = sampleTime;
  playback.previousArrivalTime = arrivalTime;
}

export function advanceRemotePlayback(playback, now) {
  if (!playback || !Number.isFinite(now)) {
    return { time: now, delayMs: BASE_DELAY_MS, jitterMs: 0, maxExtrapolationMs: MAX_EXTRAPOLATION_MS };
  }

  if (playback.lastFrameTime === null) playback.lastFrameTime = now;
  const frameDelta = Math.min(100, Math.max(0, now - playback.lastFrameTime));
  playback.lastFrameTime = now;

  const delayDelta = playback.targetDelayMs - playback.delayMs;
  // Increase the buffer faster than it drains, while keeping presentation time
  // monotonic. Delay changes are bounded per frame so jitter adaptation cannot
  // visibly rewind or freeze a moving avatar.
  const adjustmentRate = delayDelta > 0 ? 0.55 : 0.25;
  const adjustment = Math.min(Math.abs(delayDelta), frameDelta * adjustmentRate);
  playback.delayMs += Math.sign(delayDelta) * adjustment;

  const proposedTime = now - playback.delayMs;
  playback.lastRenderTime = playback.lastRenderTime === null
    ? proposedTime
    : Math.max(playback.lastRenderTime, proposedTime);

  return {
    time: playback.lastRenderTime,
    delayMs: playback.delayMs,
    jitterMs: playback.jitterMs,
    networkDelayMs: playback.networkDelayMs,
    maxExtrapolationMs: MAX_EXTRAPOLATION_MS,
  };
}
