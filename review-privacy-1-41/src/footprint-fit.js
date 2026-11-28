/** Areas for simple footprint rings in the local metre frame, including concave
 * cadastral boundaries. Open and explicitly closed rings are equivalent. */
const EPS = 1e-9;
const areaTolerance = area => Math.max(1, area) * 1e-9;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function segments(ring) {
  return ring.map((a, i) => ({a, b:ring[(i + 1) % ring.length]}))
    .filter(({a, b}) => a[0] !== b[0] || a[1] !== b[1]);
}

function crossingHeight(first, second) {
  const {a, b} = first, {a:c, b:d} = second;
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - c[0], ey = d[1] - c[1];
  const divisor = cross(dx, dy, ex, ey);
  if (Math.abs(divisor) < EPS) return null;
  const t = cross(c[0] - a[0], c[1] - a[1], ex, ey) / divisor;
  const u = cross(c[0] - a[0], c[1] - a[1], dx, dy) / divisor;
  // Endpoints already appear in the list of vertex heights.
  return t > 0 && t < 1 && u > 0 && u < 1 ? a[1] + t * dy : null;
}

function scanlineXs(edges, y) {
  const xs = [];
  for (const {a, b} of edges) {
    if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  return xs.sort((a, b) => a - b);
}

export function footprintArea(ring) {
  return Math.abs(segments(ring).reduce((sum, {a, b}) => sum + cross(a[0], a[1], b[0], b[1]), 0)) / 2;
}

/** Split at all vertices and proper edge crossings. Between these elevations,
 * intersection width is linear, so its midpoint integral gives the exact slab
 * area (up to floating-point error). Edge or point contact has zero area. */
export function overlapArea(first, second) {
  const left = segments(first), right = segments(second);
  const heights = [...first, ...second].map(p => p[1]);
  for (const a of left) for (const b of right) {
    const y = crossingHeight(a, b);
    if (y !== null) heights.push(y);
  }
  heights.sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < heights.length; i++) {
    const dy = heights[i] - heights[i - 1];
    if (dy <= EPS) continue;
    const y = heights[i - 1] + dy / 2;
    const a = scanlineXs(left, y), b = scanlineXs(right, y);
    for (let j = 0; j < a.length; j += 2) for (let k = 0; k < b.length; k += 2) {
      const width = Math.min(a[j + 1], b[k + 1]) - Math.max(a[j], b[k]);
      if (width > 0) area += width * dy;
    }
  }
  return area;
}

export function footprintFit(footprint, boundary) {
  const areaM2 = footprintArea(footprint);
  const insideM2 = Math.min(areaM2, overlapArea(footprint, boundary));
  const outsideM2 = Math.max(0, areaM2 - insideM2);
  const tolerance = areaTolerance(areaM2);
  return {areaM2, insideM2, outsideM2, location:outsideM2 <= tolerance ? 'inside' : insideM2 <= tolerance ? 'outside' : 'crossing'};
}
