export function advanceWorldAnimationTime(currentTime, deltaSeconds, reducedMotion) {
  if (reducedMotion) return currentTime;
  return currentTime + Math.max(0, Number(deltaSeconds) || 0);
}

export function followCamera(camera, target, reducedMotion, deltaSeconds = 1 / 60) {
  const dt=Math.max(0,Math.min(.25,Number(deltaSeconds)||0));
  const easing = reducedMotion ? 1 : 1 - Math.pow(.88,dt*60);
  return {
    x: camera.x + (target.x - camera.x) * easing,
    y: camera.y + (target.y - camera.y) * easing,
  };
}
