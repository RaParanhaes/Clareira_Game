function coordinates(sample){return {x:sample.x,y:sample.y,...(sample.z!==undefined?{z:sample.z}:{}),...(Number.isFinite(sample.flightZ)?{flightZ:sample.flightZ}:{})}}
export function appendPositionSample(samples, sample, limit = 4) {
  const time = Number(sample?.time);
  const x = Number(sample?.x);
  const y = Number(sample?.y);
  if (!Number.isFinite(time) || !Number.isFinite(x) || !Number.isFinite(y)) return samples;

  const next = Array.isArray(samples) ? [...samples] : [];
  const normalized = { time, x, y };
  if(Number.isFinite(sample.z))normalized.z=Math.max(0,sample.z);
  if(Number.isFinite(sample.flightZ))normalized.flightZ=sample.flightZ;
  if(Number.isFinite(sample.vx))normalized.vx=sample.vx;
  if(Number.isFinite(sample.vy))normalized.vy=sample.vy;
  if(Number.isFinite(sample.vz))normalized.vz=sample.vz;
  const last = next.at(-1);
  if (last && time < last.time) return next;
  if (last && time === last.time) next[next.length - 1] = normalized;
  else next.push(normalized);
  return next.slice(-Math.max(1, Math.floor(Number(limit) || 1)));
}

export function interpolatePosition(samples, time, maxExtrapolationMs = 100) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const target = Number(time);
  if (!Number.isFinite(target)) return coordinates(samples.at(-1));
  if (target <= samples[0].time) return coordinates(samples[0]);

  for (let index = 1; index < samples.length; index += 1) {
    const next = samples[index];
    if (target > next.time) continue;
    const previous = samples[index - 1];
    const duration = next.time - previous.time;
    if (duration <= 0) return coordinates(next);
    const amount = (target - previous.time) / duration;
    return {
      x: previous.x + (next.x - previous.x) * amount,
      y: previous.y + (next.y - previous.y) * amount,
      ...(next.z!==undefined||previous.z!==undefined?{z:(previous.z||0)+((next.z||0)-(previous.z||0))*amount}:{}),
      ...(Number.isFinite(next.flightZ)&&Number.isFinite(previous.flightZ)
        ?{flightZ:previous.flightZ+(next.flightZ-previous.flightZ)*amount}
        :Number.isFinite(next.flightZ)?{flightZ:next.flightZ}:{}),
    };
  }

  const latest = samples.at(-1);
  const extrapolationMs = Math.min(Math.max(0, Number(maxExtrapolationMs) || 0), Math.max(0, target - latest.time));
  if (extrapolationMs > 0 && Number.isFinite(latest.vx) && Number.isFinite(latest.vy)) {
    const seconds = extrapolationMs / 1000;
    return {
      x: latest.x + latest.vx * seconds,
      y: latest.y + latest.vy * seconds,
      ...(latest.z !== undefined
        ? { z: Math.max(0, latest.z + (Number.isFinite(latest.vz) ? latest.vz * seconds : 0)) }
        : {}),
      ...(Number.isFinite(latest.flightZ)?{flightZ:latest.flightZ+(Number.isFinite(latest.vz)?latest.vz*seconds:0)}:{}),
    };
  }
  return coordinates(latest);
}
