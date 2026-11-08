const EPSILON = 1e-8;

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, point) {
  return point[0] >= Math.min(a[0], b[0]) - EPSILON
    && point[0] <= Math.max(a[0], b[0]) + EPSILON
    && point[1] >= Math.min(a[1], b[1]) - EPSILON
    && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
      && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && onSegment(a, b, c))
    || (Math.abs(abD) <= EPSILON && onSegment(a, b, d))
    || (Math.abs(cdA) <= EPSILON && onSegment(c, d, a))
    || (Math.abs(cdB) <= EPSILON && onSegment(c, d, b));
}

export function normalizeLakeOutline(value, radius) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError('O contorno do lago precisa ser uma lista de pontos.');
  const points = value.map(point => {
    if (!Array.isArray(point) || point.length !== 2) throw new TypeError('Cada ponto do lago precisa ter dois deslocamentos.');
    const x = Number(point[0]), y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > radius + EPSILON) {
      throw new RangeError('O contorno do lago precisa caber no raio da região.');
    }
    return [x, y];
  });
  if (points.length > 2
      && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) <= EPSILON) points.pop();
  if (points.length < 8 || points.length > 48) throw new RangeError('O contorno do lago precisa ter de 8 a 48 pontos.');
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    if (Math.hypot(points[index][0] - next[0], points[index][1] - next[1]) <= EPSILON) {
      throw new TypeError('O contorno do lago não pode repetir pontos vizinhos.');
    }
  }
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 2) throw new RangeError('O contorno do lago precisa delimitar uma área.');
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) {
        throw new TypeError('O contorno do lago não pode cruzar a si mesmo.');
      }
    }
  }
  return points;
}

export function lakeSignedDepthAt(lake, x, y) {
  const dx = x - lake.x, dy = y - lake.y;
  if (!Array.isArray(lake.outline) || lake.outline.length < 3) return lake.radius - Math.hypot(dx, dy);
  let inside = false, minimumDistanceSquared = Infinity;
  for (let index = 0; index < lake.outline.length; index++) {
    const a = lake.outline[index], b = lake.outline[(index + 1) % lake.outline.length];
    const edgeX = b[0] - a[0], edgeY = b[1] - a[1];
    const edgeLengthSquared = edgeX * edgeX + edgeY * edgeY || 1;
    const along = Math.max(0, Math.min(1, ((dx - a[0]) * edgeX + (dy - a[1]) * edgeY) / edgeLengthSquared));
    const nearestX = a[0] + edgeX * along, nearestY = a[1] + edgeY * along;
    minimumDistanceSquared = Math.min(minimumDistanceSquared, (dx - nearestX) ** 2 + (dy - nearestY) ** 2);
    if ((a[1] > dy) !== (b[1] > dy)
        && dx < (edgeX * (dy - a[1])) / (edgeY || EPSILON) + a[0]) inside = !inside;
  }
  const distance = Math.sqrt(minimumDistanceSquared);
  return inside ? distance : -distance;
}
