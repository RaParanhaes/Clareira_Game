const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

// A broad, slow field with a low ceiling: sheltered forest breeze, never storm gusts.
export function windStrengthAt(x, y) {
  const field = .37 + Math.sin(x * .027 + y * .019) * .12 + Math.sin(x * .013 - y * .031) * .09;
  return clamp(field, .16, .58);
}

export function windSwayAt(x, y, time) {
  const phase = time * .62 + x * .036 + y * .021;
  const slower = time * .39 + x * .018 - y * .013;
  return (Math.sin(phase) + Math.sin(slower) * .24) * windStrengthAt(x, y);
}

// Slow pressure waves create readable gusts without making the whole forest move in sync.
export function windGustAt(x, y, time) {
  const broad = .5 + .5 * Math.sin(time * .31 + x * .009 + y * .006);
  const passing = .5 + .5 * Math.sin(time * .53 - x * .006 + y * .011 + 1.7);
  return clamp(.48 + broad * .34 + passing * .18, .48, 1);
}

export function treeWindAt(x, y, time) {
  const strength = windStrengthAt(x, y);
  const gust = windGustAt(x, y, time);
  const leafFlutter = Math.sin(time * 2.2 + x * .045 - y * .032) * .11
    + Math.sin(time * 3.4 - x * .027 + y * .052) * .045;
  const phase = time * .62 + x * .036 + y * .021;
  const slower = time * .39 + x * .018 - y * .013;
  const breeze = (Math.sin(phase) + Math.sin(slower) * .24) * strength;
  return {
    sway: breeze * (.72 + gust * .58) + leafFlutter * strength * gust,
    flutter: (Math.sin(time * 2.65 + x * .08 - y * .06)
      + Math.sin(time * 4.15 - x * .035 + y * .09) * .32) * strength * gust,
    gust,
  };
}

export function treeSwayAt(x, y, time) {
  return treeWindAt(x, y, time).sway;
}

export function leafFlutterAt(x, y, time) {
  return treeWindAt(x, y, time).flutter;
}

export function windDirectionAt(x, y, time = 0) {
  const angle = .2 + Math.sin(x * .017 + y * .013 + time * .045) * .38
    + Math.cos(x * .009 - y * .021 - time * .032) * .23;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function windDescriptionAt(x, y) {
  return windStrengthAt(x, y) > .43 ? 'brisa fresca' : 'brisa calma';
}
