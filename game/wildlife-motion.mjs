import { appendPositionSample, interpolatePosition } from './interpolation.mjs';

export const WILDLIFE_INTERPOLATION_DELAY_MS = 120;

export function appendWildlifeSample(samples = [], animal, snapshotTime) {
  // Keep enough server-timed history for packets arriving together after jitter.
  // Receipt times compress these movements into a few milliseconds.
  return appendPositionSample(samples, {
    time: snapshotTime, x: animal.x, y: animal.y,
  }, 64);
}

export function interpolateWildlifePosition(samples, now, playback) {
  // Animals may stop or turn at an obstacle. Extrapolating beyond a snapshot
  // would predict through that obstacle and then pull them back on receipt.
  let target=now-WILDLIFE_INTERPOLATION_DELAY_MS;
  if(playback&&samples?.length){
    const desired=Math.min(target,samples.at(-1).time);
    if(Number.isFinite(playback.time)){
      // Resume after gaps at bounded simulation speed rather than consuming
      // the whole backlog in one rendered frame. Never rewind the playhead.
      const elapsed=Math.max(0,now-playback.now);
      target=Math.max(playback.time,Math.min(desired,playback.time+elapsed*1.1));
    }else target=Math.max(samples[0].time,desired);
    playback.time=target;playback.now=now;
  }
  return interpolatePosition(samples, target, 0);
}
