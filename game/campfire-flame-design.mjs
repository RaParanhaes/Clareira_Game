// Authored pixel silhouettes: independent tongues rise from a stable ember bed.
// Quantize time, not world position, to preserve crisp edges at every frame.
export function campfireFlamePose(time, seed = 0, reducedMotion = false) {
  const t = reducedMotion || !Number.isFinite(time) ? 0 : Math.floor(time * 12) / 12;
  return [-5, 0, 5].map((x, index) => {
    const phase = t * (5.3 + index * .7) + seed + index * 2.1;
    return {x, tip: Math.round(Math.sin(phase) * 2),
      height: Math.round((index === 1 ? 22 : 15) + Math.sin(phase + .8) * 3),
      shoulder: Math.round(Math.sin(phase + 1.7) * 2)};
  });
}

export function drawCampfireFlames(context, x, y, time, seed = 0, reducedMotion = false) {
  const pose = campfireFlamePose(time, seed, reducedMotion);
  const polygon = (points, color) => {
    context.fillStyle = color;
    context.beginPath();
    points.forEach(([px, py], index) => index ? context.lineTo(x + px, y + py) : context.moveTo(x + px, y + py));
    context.closePath();context.fill();
  };
  for (const tongue of pose) {
    const {x:offset, tip, height, shoulder} = tongue;
    // Stair-stepped edges keep the flame in the same pixel language as the logs.
    polygon([[offset-4,-4],[offset-5,-8],[offset-3,-12],[offset+tip-2,-height+4],
      [offset+tip,-height+4],[offset+tip,-height],[offset+tip+2,-height+3],
      [offset+tip+2,-height+7],[offset+3+shoulder,-11],[offset+4,-7],[offset+3,-3]], '#c94b2c');
    polygon([[offset-3,-4],[offset-3,-8],[offset-1,-12],[offset+tip,-height+5],
      [offset+tip+1,-height+5],[offset+2,-10],[offset+3,-7],[offset+2,-4]], '#ef8739');
    polygon([[offset-2,-4],[offset-2,-7],[offset,-12],[offset+1,-9],
      [offset+2,-6],[offset+1,-4]], '#ffd079');
  }
  context.fillStyle='#ffe3a0';context.fillRect(x-3,y-6,3,2);
  context.fillStyle='#d65d30';context.fillRect(x+2,y-3,3,1);
}

// Apply the same restrained brightness rhythm to tint, visibility and shadows.
export function campfireGlowPulse(envelope) {
  return Number.isFinite(envelope) ? 1 + (Math.max(.78,Math.min(1.22,envelope))-1)*.3 : 1;
}
