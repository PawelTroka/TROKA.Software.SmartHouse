/**
 * Sternicza 11 privacy geometry. All distances are metres. Plan coordinates are
 * local x/y; z is absolute PL-EVRF2007-NH elevation. No render-library dependency.
 * Samples and ideal opaque screens are a design study, not a site survey.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  hedgeRear: 2.5, hedgeLeft: 2.5, hedgeRight: 2.5, hedgeInset: 0,
  gardenRaise: 0, bedRaise: 0, raiseNewHedges: true,
  floorHeight: 1.2, removeGarage: true,
  canopyEnabled: false, canopyDepth: 4.2, canopyHeight: 2.7,
  canopyWidth: 8.5, fasciaDepth: 0.3, terraceDepth: 4.2,
  includeHighFeatures: false,
});

const EPS = 1e-8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const point3 = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const settingsWithDefaults = s => ({ ...DEFAULT_SETTINGS, ...s });

/** Native-grid bilinear interpolation. Outside the supplied crop, clamp to edge. */
export function terrainAt(x, y, data) {
  const { localOriginEN: o, xUnitEN: ux, yUnitEN: uy } = data.coordinates;
  const t = data.terrain;
  const e = o[0] + x * ux[0] + y * uy[0];
  const n = o[1] + x * ux[1] + y * uy[1];
  const gx = clamp((e - t.originEN[0]) / t.cellSize, 0, t.columns - 1);
  const gy = clamp((n - t.originEN[1]) / t.cellSize, 0, t.rows - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, t.columns - 1), y1 = Math.min(y0 + 1, t.rows - 1);
  const fx = gx - x0, fy = gy - y0;
  const z = (i, j) => t.elevations[j * t.columns + i];
  return (1 - fy) * ((1 - fx) * z(x0, y0) + fx * z(x1, y0))
    + fy * ((1 - fx) * z(x0, y1) + fx * z(x1, y1));
}

/** Includes the boundary, useful for fill and observer-surface assignment. */
export function pointInPolygon(p, polygon) {
  let inside = false;
  const count = polygon.length - (samePoint(polygon[0], polygon.at(-1)) ? 1 : 0);
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const a = polygon[j], b = polygon[i], edge = sub(b, a), ap = sub(p, a);
    if (Math.abs(cross(edge, ap)) < EPS && ap[0] * edge[0] + ap[1] * edge[1] >= -EPS
      && ap[0] * edge[0] + ap[1] * edge[1] <= edge[0] ** 2 + edge[1] ** 2 + EPS) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1])
      && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function samePoint(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS; }

/** Existing terrain plus proposed fill, only within the rear garden. */
export function gardenGroundAt(x, y, settings, data) {
  const fill = y >= data.site.rearMidpoint[1] - EPS && pointInPolygon([x, y], data.site.boundary)
    ? number(settings.gardenRaise) : 0;
  return terrainAt(x, y, data) + fill;
}

export function floorElevation(settings, data) {
  return data.site.floorReference.z + number(settings.floorHeight, 1.2);
}

/** Proposed built-in tub follows the terrace's right edge and front clearance. */
export function jacuzziBounds(settings = {}, data) {
  const depth = number(settings.terraceDepth, 4.2), size = 2.2;
  const x0 = data.site.terrace.x + data.site.terrace.width - size - 0.15;
  const y0 = data.site.rearMidpoint[1] + Math.min(1.45, Math.max(0.15, depth - size - 0.15));
  return { x0, x1: x0 + size, y0, y1: y0 + size, width: size, length: size, z: floorElevation(settings, data) };
}

/** Eye-height override is deliberate: UI should set the preset's initial value. */
export function observerForPreset(preset = 'sofa', settings = {}, data) {
  const s = settingsWithDefaults(settings), [mx, rearY] = data.site.rearMidpoint;
  const depth = number(s.terraceDepth, 4.2), width = data.site.terrace.width;
  const tub = jacuzziBounds(s, data);
  const values = {
    sofa: [mx, rearY - 2.5, 1.2, 'Living room · seated', 'floor'],
    standing: [mx, rearY - 2.5, 1.65, 'Living room · standing', 'floor'],
    terrace: [mx, rearY + Math.max(0.5, depth - 1), 1.65, 'Living terrace', 'floor'],
    jacuzzi: [(tub.x0 + tub.x1) / 2, (tub.y0 + tub.y1) / 2, 0.7, 'Jacuzzi · seated', 'floor'],
    garden: [mx, 30, 1.65, 'Garden · standing', 'garden'],
    custom: [number(s.observerX, mx), number(s.observerY, 30), 1.65, 'Custom viewpoint', 'auto'],
  };
  let [x, y, defaultEye, label, surface] = values[preset] || values.custom;
  if (surface === 'auto') {
    const onTerrace = x >= mx - width / 2 && x <= mx + width / 2 && y >= rearY && y <= rearY + depth;
    surface = onTerrace || pointInPolygon([x, y], data.site.house.footprint) ? 'floor' : 'garden';
  }
  const eyeHeight = number(settings.eyeHeight, defaultEye);
  const groundZ = surface === 'floor' ? floorElevation(s, data) : gardenGroundAt(x, y, s, data);
  return { x, y, z: groundZ + eyeHeight, preset, label, eyeHeight, groundZ, surface };
}

/** Intersection of finite plan segment AB with CD, returning AB fraction t. */
export function segmentIntersection(a, b, c, d) {
  const r = sub(b, a), v = sub(d, c), den = cross(r, v);
  if (Math.abs(den) < EPS) return null;
  const ca = sub(c, a), t = cross(ca, v) / den, u = cross(ca, r) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t: clamp(t, 0, 1), u: clamp(u, 0, 1), x: a[0] + t * r[0], y: a[1] + t * r[1] };
}

function infiniteLineIntersection(a, r, b, v) {
  const den = cross(r, v);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(b, a), v) / den;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

/** Inward offset of the convex mapped site boundary; no intermediate screen. */
function insetBoundary(boundary, inset) {
  const p = samePoint(boundary[0], boundary.at(-1)) ? boundary.slice(0, -1) : boundary.slice();
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % p.length], v = sub(b, a), len = Math.hypot(...v);
    return { a: [a[0] - v[1] * inset / len, a[1] + v[0] * inset / len], v };
  });
  const result = lines.map((line, i) => {
    const prev = lines[(i + lines.length - 1) % lines.length];
    return infiniteLineIntersection(prev.a, prev.v, line.a, line.v) || line.a;
  });
  return [...result, result[0]];
}

export function hedgeTopAt(x, y, side, settings, data) {
  const s = settingsWithDefaults(settings);
  const h = number(s[`hedge${side[0].toUpperCase()}${side.slice(1)}`]);
  const original = terrainAt(x, y, data);
  return original + Math.max(0, h) + (s.raiseNewHedges ? number(s.gardenRaise) + number(s.bedRaise) : 0);
}

/** Full segment fields are for rendering; ray tests interpolate the native DTM. */
export function hedgeSegments(settings = {}, data) {
  const s = settingsWithDefaults(settings);
  const p = insetBoundary(data.site.boundary, clamp(number(s.hedgeInset), 0, 3));
  const segments = [];
  for (let i = 0; i < p.length - 1; i++) {
    const name = data.site.boundaryNames[i];
    const side = name === 'rear' ? 'rear' : name.startsWith('east') ? 'right' : name.startsWith('west') ? 'left' : null;
    if (!side) continue;
    let a = p[i], b = p[i + 1];
    const startY = data.site.rearMidpoint[1];
    if (side !== 'rear') {
      if (Math.max(a[1], b[1]) < startY) continue;
      if (a[1] < startY) { const t = (startY - a[1]) / (b[1] - a[1]); a = [a[0] + t * (b[0] - a[0]), startY]; }
      if (b[1] < startY) { const t = (startY - b[1]) / (a[1] - b[1]); b = [b[0] + t * (a[0] - b[0]), startY]; }
    }
    const height = Math.max(0, number(s[`hedge${side[0].toUpperCase()}${side.slice(1)}`]));
    const baseAt = p => terrainAt(...p, data) + number(s.gardenRaise) + number(s.bedRaise);
    segments.push({ side, a, b, height, baseA: baseAt(a), baseB: baseAt(b),
      topA: hedgeTopAt(...a, side, s, data), topB: hedgeTopAt(...b, side, s, data) });
  }
  return segments;
}

export function canopyBounds(settings = {}, data) {
  const s = settingsWithDefaults(settings), [mx, y0] = data.site.rearMidpoint;
  const width = Math.max(0, number(s.canopyWidth, 8.5));
  const z = floorElevation(s, data) + number(s.canopyHeight, 2.7);
  return { x0: mx - width / 2, x1: mx + width / 2, y0,
    y1: y0 + Math.max(0, number(s.canopyDepth, 4.2)), z,
    fasciaBottomZ: z - Math.max(0, number(s.fasciaDepth, 0.3)) };
}

/** Finite roof plane and front/side fascia; no imaginary infinite canopy. */
export function canopyIntersection(observer, target, settings, data) {
  if (!settings.canopyEnabled) return null;
  const e = point3(observer), t = point3(target), c = canopyBounds(settings, data), hits = [];
  if (c.x1 - c.x0 <= EPS || c.y1 - c.y0 <= EPS) return null;
  const dz = t[2] - e[2];
  if (Math.abs(dz) > EPS) {
    const r = (c.z - e[2]) / dz;
    const x = e[0] + r * (t[0] - e[0]), y = e[1] + r * (t[1] - e[1]);
    if (r > EPS && r < 1 - EPS && x >= c.x0 - EPS && x <= c.x1 + EPS && y >= c.y0 - EPS && y <= c.y1 + EPS) {
      hits.push({ x, y, z: c.z, t: r, part: 'roof' });
    }
  }
  const edges = [[[c.x0, c.y0], [c.x0, c.y1], 'left-fascia'],
    [[c.x1, c.y0], [c.x1, c.y1], 'right-fascia'],
    [[c.x0, c.y1], [c.x1, c.y1], 'front-fascia']];
  for (const [a, b, part] of edges) {
    const hit = segmentIntersection(e, t, a, b);
    if (!hit || hit.t <= EPS || hit.t >= 1 - EPS) continue;
    const z = e[2] + hit.t * dz;
    if (z >= c.fasciaBottomZ - EPS && z <= c.z + EPS) hits.push({ ...hit, z, part });
  }
  return hits.sort((a, b) => a.t - b.t)[0] || null;
}

/** Exact required screen height on one ray, independent of whether it is built. */
export function screenOnRay(observer, target, settings, data, segments) {
  const e = point3(observer), b = point3(target), s = settingsWithDefaults(settings);
  const distance = Math.hypot(b[0] - e[0], b[1] - e[1]);
  const hits = [];
  for (const segment of segments || hedgeSegments(s, data)) {
    const hit = segmentIntersection(e, b, segment.a, segment.b);
    if (!hit || hit.t <= EPS || hit.t >= 1 - EPS) continue;
    const z = e[2] + hit.t * (b[2] - e[2]);
    const originalGround = terrainAt(hit.x, hit.y, data);
    const groundZ = originalGround + number(s.gardenRaise) + number(s.bedRaise);
    // New planting is measured above the new bed; retained top heights are
    // measured above the ORIGINAL terrain, so filling never lifts old foliage.
    const referenceGroundZ = s.raiseNewHedges ? groundZ : originalGround;
    const topZ = hedgeTopAt(hit.x, hit.y, segment.side, s, data);
    const raisedSoil = groundZ > originalGround + EPS && z <= groundZ + EPS && z >= originalGround - EPS;
    const foliage = segment.height > 0 && z <= topZ + EPS && z >= groundZ - EPS;
    hits.push({ ...hit, z, groundZ, originalGroundZ: originalGround, referenceGroundZ,
      topZ, height: Math.max(0, topZ - groundZ), requiredHeight: Math.max(0, z - referenceGroundZ),
      requiredExposedHeight: Math.max(0, z - groundZ), inputHeight: segment.height,
      side: segment.side, distance: distance * hit.t,
      blocked: raisedSoil || foliage, blockMaterial: raisedSoil ? 'raised-soil' : foliage ? 'foliage' : null });
  }
  return hits.sort((a, b) => a.t - b.t)[0] || null;
}

/** Finite LoD1 building prism; excludes the eye and the target endpoint. */
export function buildingIntersection(observer, target, building) {
  const e = point3(observer), b = point3(target), hits = [];
  const poly = building.footprint;
  for (let i = 0; i < poly.length - 1; i++) {
    const hit = segmentIntersection(e, b, poly[i], poly[i + 1]);
    if (!hit || hit.t <= 1e-5 || hit.t >= 1 - 1e-5) continue;
    const z = e[2] + hit.t * (b[2] - e[2]);
    if (z >= building.baseZ - EPS && z <= building.roofZ + EPS) hits.push({ ...hit, z, buildingId: building.id });
  }
  const dz = b[2] - e[2];
  if (Math.abs(dz) > EPS) {
    const r = (building.roofZ - e[2]) / dz;
    const x = e[0] + r * (b[0] - e[0]), y = e[1] + r * (b[1] - e[1]);
    if (r > 1e-5 && r < 1 - 1e-5 && pointInPolygon([x, y], poly)) hits.push({ t: r, x, y, z: building.roofZ, buildingId: building.id });
  }
  return hits.sort((a, b) => a.t - b.t)[0] || null;
}

/**
 * Percent is an unweighted sampled-ray metric from ONE eye, not visible area.
 * Back-facing/LoD1 self-hidden facade samples are excluded from the denominator.
 */
export function analyzeVisibility(observer, settings = {}, data) {
  const s = settingsWithDefaults(settings), origin = point3(observer);
  const segments = hedgeSegments(s, data), rays = [], byBlock = [];
  const targetBuildings = data.buildings.filter(b => b.kind === 'target');
  const blockers = data.buildings.filter(b => b.kind !== 'house');
  if (!s.removeGarage) blockers.push(data.site.garage);
  const worstRequiredHedge = { rear: 0, left: 0, right: 0, overall: 0 };
  const remainingRequiredHedge = { rear: 0, left: 0, right: 0, overall: 0 };
  let criticalRay = null;
  for (const block of targetBuildings) {
    const blockRays = [], samples = s.includeHighFeatures ? [...block.samples, ...block.highFeatures] : block.samples;
    for (let i = 0; i < samples.length; i++) {
      const target = samples[i];
      // Filter only synthetic back facades. A median-height LoD1 prism cannot
      // safely self-occlude measured roof returns: real eaves can lie below
      // its artificial flat top, just centimetres inside the footprint.
      // Keeping every sampled roof return is intentionally conservative.
      const isFacade = i >= block.roofSampleCount && i < block.samples.length;
      if (isFacade && buildingIntersection(origin, target, block)) continue;
      const distance = Math.hypot(target[0] - origin[0], target[1] - origin[1]);
      if (distance < EPS) continue;
      const screen = screenOnRay(origin, target, s, data, segments);
      const canopy = canopyIntersection(origin, target, s, data);
      let buildingHit = null;
      for (const other of blockers) {
        if (other.id === block.id) continue;
        const hit = buildingIntersection(origin, target, other);
        if (hit && (!buildingHit || hit.t < buildingHit.t)) buildingHit = hit;
      }
      const possible = [];
      if (screen?.blocked) possible.push({ t: screen.t, type: `hedge-${screen.side}`, hit: screen });
      if (canopy) possible.push({ t: canopy.t, type: 'canopy', hit: canopy });
      if (buildingHit) possible.push({ t: buildingHit.t, type: 'building', hit: buildingHit });
      const first = possible.sort((a, b) => a.t - b.t)[0];
      const ray = { origin, target, blockId: block.id, blockLabel: block.label,
        kind: i < block.roofSampleCount ? 'roof' : i >= block.samples.length ? 'high-feature' : 'facade',
        visible: !first, blockedBy: first?.type || null, obstruction: first?.hit || null,
        screen, canopy, distance };
      blockRays.push(ray); rays.push(ray);
      if (screen && !buildingHit) {
        worstRequiredHedge[screen.side] = Math.max(worstRequiredHedge[screen.side], screen.requiredHeight);
        if (screen.requiredHeight > worstRequiredHedge.overall) {
          worstRequiredHedge.overall = screen.requiredHeight; criticalRay = ray;
        }
        if (!canopy) {
          remainingRequiredHedge[screen.side] = Math.max(remainingRequiredHedge[screen.side], screen.requiredHeight);
          remainingRequiredHedge.overall = Math.max(remainingRequiredHedge.overall, screen.requiredHeight);
        }
      }
    }
    const visible = blockRays.filter(r => r.visible).length;
    byBlock.push({ id: block.id, label: block.label, total: blockRays.length,
      visible, blocked: blockRays.length - visible,
      blockedPercent: blockRays.length ? 100 * (blockRays.length - visible) / blockRays.length : 100 });
  }
  const visible = rays.filter(r => r.visible).length, total = rays.length, blocked = total - visible;
  const reasons = {};
  for (const ray of rays) if (ray.blockedBy) reasons[ray.blockedBy] = (reasons[ray.blockedBy] || 0) + 1;
  return { observer, total, visible, blocked, blockedPercent: total ? 100 * blocked / total : 0,
    byBlock, worstRequiredHedge, remainingRequiredHedge, rays, criticalRay, reasons,
    method: 'Unweighted roof/facade sample rays from one eye; ideal opaque boundary screens; not an area percentage or all-viewpoints guarantee.' };
}
